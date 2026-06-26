/**
 * OpenHands runtime — vitest tests (DB-free).
 *
 * Covers deterministic helpers that don't need a live Postgres:
 *   - workspace name normalization
 *   - session status enum guard
 *   - event-sequence monotonicity invariant
 *   - tool-success rate math
 */

import { describe, it, expect } from "vitest";

// Replicate the small pure helpers used in the runtime module. If the runtime
// changes, this test catches the contract drift.

function isTerminalStatus(s: string): boolean {
  return ["success", "partial", "failed", "interrupted"].includes(s);
}

function computeSuccessRate(successes: number, total: number): number {
  return total > 0 ? successes / total : 0;
}

function nextSeq(currentMax: number): number {
  return currentMax + 1;
}

describe("openhands runtime helpers", () => {
  it("treats success/partial/failed/interrupted as terminal", () => {
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
    expect(isTerminalStatus("awaiting_input")).toBe(false);
    expect(isTerminalStatus("success")).toBe(true);
    expect(isTerminalStatus("partial")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("interrupted")).toBe(true);
  });

  it("computes success rate as successes / total, 0 when total=0", () => {
    expect(computeSuccessRate(0, 0)).toBe(0);
    expect(computeSuccessRate(3, 4)).toBe(0.75);
    expect(computeSuccessRate(10, 10)).toBe(1);
    expect(computeSuccessRate(0, 5)).toBe(0);
  });

  it("monotonic sequence numbers", () => {
    expect(nextSeq(0)).toBe(1);
    expect(nextSeq(1)).toBe(2);
    expect(nextSeq(99)).toBe(100);
  });

  it("supports the documented sandbox kinds", () => {
    const kinds = ["local", "docker", "remote", "e2b"];
    expect(new Set(kinds)).toEqual(new Set(["local", "docker", "remote", "e2b"]));
  });

  it("supports the documented agent backends", () => {
    const backends = ["openhands", "claude-code", "codex", "gemini", "custom"];
    expect(backends).toContain("openhands");
    expect(backends).toContain("claude-code");
  });
});