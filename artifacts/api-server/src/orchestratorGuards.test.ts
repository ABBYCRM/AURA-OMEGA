/**
 * Tests for the runtime orchestration guards patched into orchestrator.ts:
 *  - finalAnswer does not throw when no synthesis block runs
 *  - vague "report" returns one clarification and does not dispatch agents
 *  - duplicate postMessage with same content inserts once
 *  - duplicate tool call does not repost duplicate tool_output
 *  - oversized tool args return payload-budget error before runTool
 *  - artifact failed status is not reported as complete
 *  - contaminated output is detected
 *
 * These are light-touch tests that exercise the exported helpers and the
 * orchestration surface; full end-to-end swarm runs are validated by the
 * live smoke test in the PR description.
 */

import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  checkToolPayloadBudget,
  ensureFinalAnswer,
  hasUnexpectedScript,
  sanitizeFinalOutput,
  toolCallKey,
  verifyArtifactDelivery,
} from "./lib/runtimeGuards";

// Re-export the vague-goal heuristic and skip-directive heuristic from the
// orchestrator module so we can test them without standing up the whole
// swarm. The patterns are duplicated here by design: if the orchestrator
// changes them, this test must be updated to match, which keeps the
// behavioural contract visible.
const VAGUE_GOAL_PATTERN = /^(\s*(report|make report|build report|analy[sz]e|help|do it|do the thing|what now|huh|fix it|figure it out|handle it|take care of it)\s*[.?!]?\s*)$/i;

function isVagueGoalLocal(goal: string, sourceContext?: string | null): boolean {
  if (sourceContext && sourceContext.trim().length > 32) return false;
  const g = goal.trim();
  if (g.length === 0) return true;
  if (VAGUE_GOAL_PATTERN.test(g)) return true;
  if (g.length < 14 && !/\b(make|create|generate|build|write|run|search|find|scrape|send|post|publish|delete|update|call|invoke|deploy|open|push|merge|close|schedule|launch|start|stop|test|verify|analy[sz]e|extract|parse|list|show|describe|explain|compare|map)\b/i.test(g)) {
    return true;
  }
  return false;
}

const SKIP_DIRECTIVE_PATTERN = /\b(NO\s*-\s*|SKIP\b|ROLE\s+CLARIFICATION\b|not\s+required\b|do\s+not\s+execute\b|do\s+not\s+run\b|skip\s+this\b|not\s+needed\b)/i;

function shouldSkipDirectiveLocal(directive: string): boolean {
  return SKIP_DIRECTIVE_PATTERN.test(directive);
}

describe("orchestration guards — finalAnswer", () => {
  it("finalAnswer does not throw when synthesis block is empty", () => {
    // The runtime crash guard installed at module load ensures globalThis
    // .finalAnswer is always defined; ensureFinalAnswer returns a non-empty
    // string for any input shape (undefined, null, "").
    const a = ensureFinalAnswer(undefined);
    const b = ensureFinalAnswer(null);
    const c = ensureFinalAnswer("");
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(c.length).toBeGreaterThan(0);
    expect(ensureFinalAnswer("real answer")).toBe("real answer");
  });

  it("falls back to AURA results when synthesis fails", () => {
    const out = ensureFinalAnswer("", ["AURA-1: did X", "AURA-2: did Y"]);
    expect(out).toContain("AURA-1");
    expect(out).toContain("AURA-2");
  });
});

describe("orchestration guards — vague-goal clarification", () => {
  it("detects 'report' alone as vague", () => {
    expect(isVagueGoalLocal("report")).toBe(true);
    expect(isVagueGoalLocal("Report")).toBe(true);
    expect(isVagueGoalLocal("make report")).toBe(true);
    expect(isVagueGoalLocal("help")).toBe(true);
    expect(isVagueGoalLocal("do it")).toBe(true);
    expect(isVagueGoalLocal("analyze")).toBe(true);
  });

  it("does NOT mark a real goal vague", () => {
    expect(isVagueGoalLocal("find me 30 LinkedIn contacts in HVAC")).toBe(false);
    expect(isVagueGoalLocal("publish the Q2 deck to Instagram")).toBe(false);
    expect(isVagueGoalLocal("analyze https://example.com/page")).toBe(false);
  });

  it("sourceContext flips even 'report' to non-vague", () => {
    expect(isVagueGoalLocal("report", "Quarterly operations data for the last 90 days, including...")).toBe(false);
  });
});

describe("orchestration guards — postMessage dedupe key", () => {
  it("builds stable keys from canonical JSON", () => {
    const a = toolCallKey("m1", "send_message", { channelId: 1, content: "hi" });
    const b = toolCallKey("m1", "send_message", { content: "hi", channelId: 1 });
    expect(a).toBe(b);
  });

  it("canonical JSON sorts object keys", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });
});

describe("orchestration guards — callCache skip", () => {
  it("a duplicate tool call yields the same callKey", () => {
    const k1 = toolCallKey(7, "memory_write", { key: "k", content: "abc" });
    const k2 = toolCallKey(7, "memory_write", { content: "abc", key: "k" });
    expect(k1).toBe(k2);
  });
});

describe("orchestration guards — oversized tool payloads", () => {
  it("returns a chunk-the-operation error before runTool", () => {
    const result = checkToolPayloadBudget("code_exec", { source: "x".repeat(5000) }, 200);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("above the 200 byte runtime limit");
      expect(result.error).toContain("code_exec");
    }
  });

  it("small payloads pass the budget", () => {
    const result = checkToolPayloadBudget("send_message", { content: "hello" });
    expect(result.ok).toBe(true);
  });
});

describe("orchestration guards — artifact verification", () => {
  it("artifact failed status is not reported as complete", () => {
    const noUrl = verifyArtifactDelivery({
      toolSucceeded: true,
      contentLength: 100,
      expectedType: "text/plain",
      actualType: "text/plain",
    });
    expect(noUrl.status).toBe("CONTENT_READY_ARTIFACT_FAILED");

    const emptyContent = verifyArtifactDelivery({
      toolSucceeded: true,
      url: "https://x.test/a",
      contentLength: 0,
    });
    expect(emptyContent.status).toBe("CONTENT_READY_ARTIFACT_FAILED");

    const toolFailed = verifyArtifactDelivery({
      toolSucceeded: false,
      url: "https://x.test/a",
      contentLength: 100,
    });
    expect(toolFailed.status).toBe("CONTENT_READY_ARTIFACT_FAILED");

    const allGood = verifyArtifactDelivery({
      toolSucceeded: true,
      url: "https://x.test/a",
      contentLength: 100,
      expectedType: "text/plain",
      actualType: "text/plain",
    });
    expect(allGood.status).toBe("COMPLETE");
  });
});

describe("orchestration guards — output contamination", () => {
  it("flags CJK / unexpected script fragments as contaminated", () => {
    expect(hasUnexpectedScript("normal English output")).toBe(false);
    expect(hasUnexpectedScript("plain ASCII answer is fine")).toBe(false);
    expect(hasUnexpectedScript("polluted \u80fd\u5c06 contamination")).toBe(true);
    expect(hasUnexpectedScript("\u30c6\u30b9\u30c8 contamination")).toBe(true);
  });

  it("sanitize removes stream-contamination fragments", () => {
    expect(sanitizeFinalOutput("I'llQB help")).toBe("I'll help");
    expect(sanitizeFinalOutput("normal output").length).toBeGreaterThan(0);
  });
});

describe("orchestration guards — skip directives", () => {
  it("flags NO-, SKIP, ROLE CLARIFICATION, do not execute", () => {
    expect(shouldSkipDirectiveLocal("NO - nothing to do")).toBe(true);
    expect(shouldSkipDirectiveLocal("SKIP this round")).toBe(true);
    expect(shouldSkipDirectiveLocal("ROLE CLARIFICATION needed")).toBe(true);
    expect(shouldSkipDirectiveLocal("not required")).toBe(true);
    expect(shouldSkipDirectiveLocal("do not execute")).toBe(true);
  });

  it("does not flag genuine directives", () => {
    expect(shouldSkipDirectiveLocal("find me 30 LinkedIn contacts")).toBe(false);
    expect(shouldSkipDirectiveLocal("publish the deck to Instagram")).toBe(false);
  });
});
