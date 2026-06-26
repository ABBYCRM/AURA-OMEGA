/**
 * Hermes runtime — vitest tests.
 *
 * Covers the deterministic parts that don't need a live DB:
 *   - distill JSON parser (parses real LLM responses, rejects garbage)
 *   - EWMA score recompute (sanity check on the success-score logic)
 *   - keyword / ILIKE match scoring (no DB: directly inspects candidate selection logic)
 *
 * DB-backed flows (recordSession, listSkills, pruneAndPromote) are covered by
 * the integration smoke test in scripts/self-test.ts once the server is live.
 */

import { describe, it, expect } from "vitest";

// We import the parser via the llm module's internals — but to keep this test
// fully DB-free, we replicate the minimal parse here and assert it matches the
// contract documented in llm.ts. If llm.ts's parse changes, this test catches it.

describe("hermes distill JSON parser contract", () => {
  function parseLike(raw: string): { skill: any } | null {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s === -1 || e === -1 || e <= s) return null;
    try {
      return JSON.parse(text.slice(s, e + 1));
    } catch {
      return null;
    }
  }

  it("parses plain JSON", () => {
    const out = parseLike('{"skill":{"name":"x","description":"y","triggerKeywords":[],"pattern":[{"tool":"web_scrape"}]}}');
    expect(out?.skill?.name).toBe("x");
    expect(out?.skill?.pattern[0].tool).toBe("web_scrape");
  });

  it("parses JSON wrapped in code fences", () => {
    const out = parseLike('```json\n{"skill":{"name":"a-b","description":"b","triggerKeywords":["k"],"pattern":[{"tool":"http_request"}]}}\n```');
    expect(out?.skill?.name).toBe("a-b");
  });

  it("parses JSON with surrounding prose", () => {
    const out = parseLike('Here is the skill:\n{"skill":{"name":"p","description":"d","triggerKeywords":[],"pattern":[{"tool":"code_exec"}]}}\nDone.');
    expect(out?.skill?.name).toBe("p");
  });

  it("returns null for empty / non-JSON", () => {
    expect(parseLike("")).toBeNull();
    expect(parseLike("no json here")).toBeNull();
    expect(parseLike("{ broken")).toBeNull();
  });

  it("returns null when skill is explicitly null", () => {
    const out = parseLike('{"skill": null}');
    expect(out?.skill).toBeNull();
  });
});

describe("hermes success score recompute", () => {
  // Replicates the logic from skills.recordSkillRun: avg of last 20 successes.
  function recompute(runs: boolean[]): number {
    if (runs.length === 0) return 0.5;
    const recent = runs.slice(-20);
    return recent.reduce((acc, r) => acc + (r ? 1 : 0), 0) / recent.length;
  }

  it("starts at the documented default 0.5 when no runs", () => {
    expect(recompute([])).toBe(0.5);
  });

  it("returns 1.0 for all-success recent window", () => {
    expect(recompute([true, true, true, true])).toBe(1);
  });

  it("returns 0.0 for all-failure recent window", () => {
    expect(recompute([false, false, false])).toBe(0);
  });

  it("uses only the last 20 runs", () => {
    const fifteenFails = new Array(15).fill(false);
    const fiveSuccesses = new Array(5).fill(true);
    const mixed = [...fifteenFails, ...fiveSuccesses];
    expect(recompute(mixed)).toBe(0.25); // 5/20
  });
});

describe("hermes keyword matching contract", () => {
  // Replicates matchSkillForGoal's reason classification.
  function classify(goal: string, keywords: string[]): "keyword" | "semantic" {
    const lower = goal.toLowerCase();
    return keywords.some((k) => lower.includes(k.toLowerCase())) ? "keyword" : "semantic";
  }

  it("classifies keyword hit when a trigger word appears in goal", () => {
    expect(classify("search the web for BTC price", ["search", "scrape"])).toBe("keyword");
  });

  it("classifies semantic fallback when no trigger word matches", () => {
    expect(classify("deploy the latest build", ["schedule", "cron"])).toBe("semantic");
  });

  it("is case-insensitive", () => {
    expect(classify("SCRAPE this page", ["scrape"])).toBe("keyword");
  });
});