/**
 * Mission Kernel tests — DB-free, covers the in-memory pieces:
 *   - planner (uses Brain)
 *   - verifier verdict logic
 *   - retry backoff math
 *   - engine registry sanity
 *   - learning lesson body
 */

import { describe, it, expect } from "vitest";
import { buildMissionSteps, recordExecuted, recordVerified } from "./planner";
import { evaluateAcceptance, aggregateVerification, progressFraction, confidenceFraction } from "./verifier";
import { decideRetry } from "./retry";
import { buildLessonBody } from "./learning";
import { listEngines, getEngine } from "./engines/registry";
import type { MissionStep } from "./types";

describe("planner (brain wrapper)", () => {
  it("produces a 10-step plan for a CODE goal", () => {
    const { steps, brain } = buildMissionSteps("build a typescript server");
    expect(brain.gate).toBe("GO");
    expect(steps.length).toBe(10);
    expect(steps[0].engine).toBe("openhands");
  });

  it("routes RESEARCH goals to crawl4ai", () => {
    const { steps } = buildMissionSteps("research industry trends");
    expect(steps.every((s) => s.engine === "crawl4ai")).toBe(true);
  });

  it("refuses destructive goals with ABORT", () => {
    const { brain } = buildMissionSteps("delete production database");
    expect(brain.gate).toBe("ABORT");
  });

  it("flags money goals with HOLD", () => {
    const { brain } = buildMissionSteps("wire funds to vendor");
    expect(brain.gate).toBe("HOLD");
  });

  it("recordExecuted / recordVerified mutate the brain state", () => {
    const { brain } = buildMissionSteps("ship the agent runtime");
    const exec = recordExecuted(brain, "executed");
    expect(exec.status).toBe("EXECUTED");
    const ver = recordVerified(exec, "verified");
    expect(ver.status).toBe("COMPLETE");
    expect(ver.verified).toBe(true);
  });
});

describe("verifier", () => {
  const step: MissionStep = {
    index: 0,
    description: "do thing",
    engine: "hermes",
    action: "memory_search",
    args: {},
    acceptance: "captured verified evidence",
  };

  it("passes when result has ok + evidence keyword", () => {
    const v = evaluateAcceptance(step, { ok: true, evidence: "captured 5 results", durationMs: 10 });
    expect(v.passed).toBe(true);
  });

  it("passes when result has facts even without evidence keyword", () => {
    const v = evaluateAcceptance(step, { ok: true, evidence: "", durationMs: 10, facts: { count: 3 } });
    expect(v.passed).toBe(true);
  });

  it("fails when result is not ok", () => {
    const v = evaluateAcceptance(step, { ok: false, error: "boom", durationMs: 10 });
    expect(v.passed).toBe(false);
  });

  it("aggregates verdicts into a verification block", () => {
    const v = aggregateVerification([
      { stepIndex: 0, acceptance: "x", passed: true, evidence: "ok", checkedAt: "" },
      { stepIndex: 1, acceptance: "y", passed: false, evidence: "nope", checkedAt: "" },
    ]);
    expect(v.total).toBe(2);
    expect(v.passed).toBe(1);
    expect(progressFraction(v)).toBe(0.5);
    expect(confidenceFraction(v)).toBe(0.5);
  });
});

describe("retry", () => {
  it("retries with growing backoff", () => {
    const d = decideRetry(0, 1, 3, 30, "boom");
    expect(d.shouldRetry).toBe(true);
    expect(d.delaySeconds).toBe(30);
    expect(d.attempt).toBe(2);

    const d2 = decideRetry(0, 2, 3, 30, "boom");
    expect(d2.delaySeconds).toBe(150);
  });

  it("gives up after max attempts", () => {
    const d = decideRetry(0, 3, 3, 30, "boom");
    expect(d.shouldRetry).toBe(false);
  });
});

describe("engine registry", () => {
  it("lists all 11 engines (incl. tavily + searxng fallbacks)", () => {
    expect(listEngines().map((e) => e.name).sort()).toEqual(
      ["bos-omega", "brain", "crawl4ai", "docling", "hermes", "http", "mem0", "openhands", "searxng-search", "shell", "tavily-search"].sort(),
    );
  });

  it("returns a working http engine", async () => {
    const e = getEngine("http");
    const r = await e.run({ index: 0, description: "x", engine: "http", action: "http_request", args: { url: "https://example.com" }, acceptance: "ok" });
    expect(r.ok).toBe(true);
    expect(typeof r.durationMs).toBe("number");
  });
});

describe("learning", () => {
  it("builds a PROBLEM → SOLUTION lesson body", () => {
    const body = buildLessonBody("ship the agent runtime", {
      id: 1, goal: "ship the agent runtime",
      plan: [{ description: "step one" }, { description: "step two" }] as unknown as MissionStep[],
      verification: {
        total: 2, passed: 1,
        stepVerdicts: [
          { stepIndex: 0, acceptance: "a", passed: true, evidence: "captured", checkedAt: "" },
          { stepIndex: 1, acceptance: "b", passed: false, evidence: "failed", checkedAt: "" },
        ],
        truthHistogram: { VERIFIED: 1, INFERRED: 0, UNKNOWN: 0, FAILED: 1, BLOCKED: 0 },
      },
      status: "completed",
      confidence: 0.5,
    } as unknown as Parameters<typeof buildLessonBody>[1]);
    expect(body).toContain("PROBLEM: ship the agent runtime");
    expect(body).toContain("STEPS THAT WORKED");
    expect(body).toContain("- step 0: a — captured");
  });
});