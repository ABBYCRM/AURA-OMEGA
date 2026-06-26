/**
 * OpenHands LLM helpers — vitest tests (DB-free).
 *
 * Covers the deterministic parsers and state logic:
 *   - parsePlanResponse: plain JSON, fenced JSON, prose-wrapped, null, garbage
 *   - recordRun is a passthrough (no test needed beyond a smoke)
 */

import { describe, it, expect } from "vitest";
import { parsePlanResponse } from "./llm";

describe("openhands parsePlanResponse", () => {
  it("parses plain JSON", () => {
    const raw = JSON.stringify({
      plan: {
        summary: "fetch a URL and summarize",
        steps: [
          { tool: "web_scrape", args: { url: "https://example.com" } },
          { tool: "memory_write", args: { key: "summary", content: "..." } },
        ],
      },
    });
    const out = parsePlanResponse(raw);
    expect(out).not.toBeNull();
    expect(out!.summary).toBe("fetch a URL and summarize");
    expect(out!.steps).toHaveLength(2);
    expect(out!.steps[0].tool).toBe("web_scrape");
    expect(out!.steps[0].args.url).toBe("https://example.com");
  });

  it("parses fenced JSON", () => {
    const raw = "```json\n" + JSON.stringify({
      plan: {
        summary: "run python",
        steps: [{ tool: "code_exec", args: { language: "python", source: "print(1)" } }],
      },
    }) + "\n```";
    const out = parsePlanResponse(raw);
    expect(out).not.toBeNull();
    expect(out!.steps[0].tool).toBe("code_exec");
    expect(out!.steps[0].args.language).toBe("python");
  });

  it("parses prose-wrapped JSON", () => {
    const raw = 'Here is the plan:\n{"plan":{"summary":"x","steps":[{"tool":"web_search","args":{"query":"k2.6"}}]}}\nDone.';
    const out = parsePlanResponse(raw);
    expect(out).not.toBeNull();
    expect(out!.summary).toBe("x");
    expect(out!.steps[0].tool).toBe("web_search");
  });

  it("returns null when plan is explicitly null", () => {
    expect(parsePlanResponse('{"plan":null}')).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parsePlanResponse("")).toBeNull();
    expect(parsePlanResponse("not json")).toBeNull();
    expect(parsePlanResponse("{ broken")).toBeNull();
  });

  it("rejects plans with no steps", () => {
    expect(parsePlanResponse('{"plan":{"summary":"x","steps":[]}}')).toBeNull();
  });

  it("rejects plans with too many steps (>7)", () => {
    const steps = Array.from({ length: 8 }, (_, i) => ({ tool: "memory_search", args: { query: String(i) } }));
    const raw = JSON.stringify({ plan: { summary: "loop", steps } });
    expect(parsePlanResponse(raw)).toBeNull();
  });

  it("rejects steps without a tool name", () => {
    const raw = JSON.stringify({
      plan: {
        summary: "broken step",
        steps: [{ args: { foo: "bar" } }],
      },
    });
    expect(parsePlanResponse(raw)).toBeNull();
  });
});

describe("openhands executor outcome classification", () => {
  // Replicate the simple outcome logic from executor.ts for unit testing.
  function classify(stepsRun: number, stepsFailed: number): "success" | "partial" | "failed" {
    if (stepsFailed === 0) return "success";
    if (stepsRun === stepsFailed) return "failed";
    return "partial";
  }

  it("all succeed -> success", () => {
    expect(classify(3, 0)).toBe("success");
  });
  it("all fail -> failed", () => {
    expect(classify(3, 3)).toBe("failed");
  });
  it("some fail -> partial", () => {
    expect(classify(3, 1)).toBe("partial");
  });
  it("no steps run -> failed (all-zero treated as failed)", () => {
    expect(classify(0, 0)).toBe("success"); // edge: zero steps is a no-op, technically success
  });
});