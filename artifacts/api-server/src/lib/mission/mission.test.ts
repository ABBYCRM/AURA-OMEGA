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
  it("refuses vague 'report' goal with ABORT + zero steps", () => {
    const { steps, brain } = buildMissionSteps("report");
    expect(brain.gate).toBe("ABORT");
    expect(steps.length).toBe(0);
    expect(brain.deliverable).toMatch(/topic/i);
  });

  it("refuses 'help', 'do it', 'analyze' as vague without sourceContext", () => {
    for (const g of ["help", "do it", "analyze", "make report"]) {
      const { steps, brain } = buildMissionSteps(g);
      expect(brain.gate, `goal="${g}"`).toBe("ABORT");
      expect(steps.length, `goal="${g}"`).toBe(0);
    }
  });

  it("does NOT mark a real goal vague", () => {
    const { brain } = buildMissionSteps("find me 30 LinkedIn contacts in HVAC");
    expect(brain.gate).not.toBe("ABORT");
  });

  it("sourceContext > 32 chars overrides vague gate", () => {
    const ctx = "Quarterly operations data for the last 90 days...";
    const { brain } = buildMissionSteps("report", ctx);
    expect(brain.gate).not.toBe("ABORT");
  });

  it("produces a deterministic 2-step plan for a CODE goal", () => {
    const { steps, brain } = buildMissionSteps("build a typescript server");
    expect(brain.gate).toBe("GO");
    // Operator doctrine 2026-06-27 20:15: deterministic plan = 1 openhands step + 1 synthesize
    // (was previously 10 brain-internal steps + 1 synthesize = 11 total).
    expect(steps.length).toBe(2);
    expect(steps[0].engine).toBe("openhands");
    expect(steps[steps.length - 1].engine).toBe("brain");
    expect(steps[steps.length - 1].action).toBe("synthesize");
  });

  // Operator doctrine 2026-06-27 20:15: deterministic decomposition — the
  // planner must NOT iterate the bos-omega brain's 10 internal reasoning
  // steps. Build a SMALL, TARGETED plan from (taskType, engine, goal keywords).
  it("deterministic plan: 1 crawl4ai step for RESEARCH, not 10", () => {
    const { steps, brain } = buildMissionSteps(
      "I want to get into solar lead sales. I need Indian providers and US buyers, the contact information for both, search LinkedIn, Google and all major search engines. Then find pricing. Get me URLs for competition sites.",
      "real operator goal with specifics"
    );
    expect(brain.taskType).toBe("RESEARCH");
    // 2 prepended search + 1 crawl4ai + 1 synthesize = 4
    expect(steps.length).toBe(4);
    const crawl4ai = steps.filter((s) => s.engine === "crawl4ai");
    expect(crawl4ai.length).toBe(1);
    // No two steps may have the same description (catches the "10 identical
    // brain steps" bug class).
    const descs = new Set(steps.map((s) => s.description));
    expect(descs.size).toBe(steps.length);
  });

  it("deterministic plan: 1 openhands step for CODE", () => {
    const { steps, brain } = buildMissionSteps("write a typescript function to parse JSON");
    expect(brain.taskType).toBe("CODE");
    expect(steps.length).toBe(2);
    expect(steps[0].engine).toBe("openhands");
    expect(steps[1].action).toBe("synthesize");
  });

  it("deterministic plan: 1 hermes step for WRITING/GENERAL_EXECUTION", () => {
    const { steps, brain } = buildMissionSteps("summarize what changed overnight");
    expect(["WRITING", "GENERAL_EXECUTION"]).toContain(brain.taskType);
    expect(steps.length).toBe(2);
    expect(steps[0].engine).toBe("hermes");
    expect(steps[0].action).toBe("memory_write");
    expect(steps[1].action).toBe("synthesize");
  });

    it("routes RESEARCH goals to crawl4ai", () => {
    const { steps } = buildMissionSteps("research industry trends");
    // Brain steps use crawl4ai; the appended synthesis step uses brain.
    expect(steps.slice(0, -1).every((s) => s.engine === "crawl4ai")).toBe(true);
    expect(steps[steps.length - 1].engine).toBe("brain");
    expect(steps[steps.length - 1].action).toBe("synthesize");
  });

  it("appends a synthesize step to every non-vague mission", () => {
    // Bug-fix for 'scrapper not synthesizing' complaint: every GO plan now
    // ends with a brain/synthesize step that consolidates all evidence into
    // one final answer via K2.6. Vague (ABORT) plans stay empty so the
    // clarification path doesn't pay for a useless LLM call.
    for (const goal of ["build a typescript server", "research industry trends", "scrape linkedin for 30 contacts in hvac texas"]) {
      const { steps, brain } = buildMissionSteps(goal);
      if (brain.gate === "ABORT") {
        expect(steps.length).toBe(0);
      } else {
        const last = steps[steps.length - 1];
        expect(last.engine, `goal="${goal}"`).toBe("brain");
        expect(last.action, `goal="${goal}"`).toBe("synthesize");
      }
    }
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

  it("passes hermes memory_write with 'wrote memory key mission/...' (real write)", () => {
    // Hermes memory_write is a real tool call. The engine returns
    // 'wrote memory key mission/...' on success, which proves the memory
    // tool persisted something. The verifier accepts this as evidence.
    const memStep: MissionStep = {
      index: 0,
      description: "save goal",
      engine: "hermes",
      action: "memory_write",
      args: {},
      acceptance: "evidence saved",
    };
    const v = evaluateAcceptance(memStep, {
      ok: true,
      evidence: "wrote memory key mission/find-20-hvac-in-miami/0",
      durationMs: 5,
    });
    expect(v.passed).toBe(true);
  });

  it("FAILS hermes with bare 'wrote' (no real write)", () => {
    // Sanity: bare 'wrote' without 'memory key' is still not enough — we
    // need proof the memory tool actually ran.
    const memStep: MissionStep = {
      index: 0,
      description: "save goal",
      engine: "hermes",
      action: "memory_write",
      args: {},
      acceptance: "evidence saved",
    };
    const v = evaluateAcceptance(memStep, {
      ok: true,
      evidence: "wrote a draft",
      durationMs: 5,
    });
    expect(v.passed).toBe(false);
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
// Operator fix 2026-06-27 20:21: research goals need real URLs, not search homepages.
describe("buildResearchSeeds (operator fix 2026-06-27)", () => {
  it("lead generation goal: returns Wikipedia + India + US pages", async () => {
    const { buildResearchSeeds } = await import("./planner");
    const seeds = buildResearchSeeds("Indian lead providers and US buyers, pricing for lead sales");
    expect(seeds.length).toBeGreaterThanOrEqual(2);
    expect(seeds.some((s) => s.includes("Lead_generation"))).toBe(true);
    expect(seeds.some((s) => s.includes("India"))).toBe(true);
    expect(seeds.some((s) => s.includes("United_States"))).toBe(true);
    expect(seeds.every((s) => s.startsWith("https://"))).toBe(true);
  });

  it("typescript code goal: returns Software dev + TypeScript pages", async () => {
    const { buildResearchSeeds } = await import("./planner");
    const seeds = buildResearchSeeds("write a typescript function for API auth");
    expect(seeds.some((s) => s.includes("Software_development"))).toBe(true);
    expect(seeds.some((s) => s.includes("TypeScript"))).toBe(true);
    expect(seeds.some((s) => s.includes("Web_API"))).toBe(true);
  });

  it("unknown goal: returns at least 1 fallback URL", async () => {
    const { buildResearchSeeds } = await import("./planner");
    const seeds = buildResearchSeeds("quantum unicorns");
    expect(seeds.length).toBeGreaterThanOrEqual(1);
  });
});
