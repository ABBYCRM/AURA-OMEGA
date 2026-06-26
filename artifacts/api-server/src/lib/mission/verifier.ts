/**
 * Mission verifier — runs acceptance predicates against engine results.
 *
 * The MissionStep carries an `acceptance` string. The verifier interprets it
 * heuristically: any of these patterns counts as VERIFIED:
 *   - Result has `ok: true`
 *   - Result has `facts` with at least one entry
 *   - Acceptance string contains the words "evidence" / "verified" / "captured"
 *
 * For Round A this is intentionally simple. A later round will let operators
 * supply their own predicates (JSONLogic / CEL).
 */

import type { MissionStep, AcceptanceVerdict } from "./types";
import type { EngineResult } from "./engines/registry";

const PASS_KEYWORDS = ["evidence", "verified", "captured", "wrote", "extracted", "returned", "ok", "exit code: 0", "stored memory", "no results"];

export function evaluateAcceptance(
  step: MissionStep,
  result: EngineResult,
): AcceptanceVerdict {
  const evidence = String(result.evidence ?? "");
  const hasFacts = !!result.facts && Object.keys(result.facts).length > 0;
  const text = `${step.acceptance} ${evidence}`.toLowerCase();
  const keywordMatch = PASS_KEYWORDS.some((k) => text.includes(k));
  const passed = result.ok && (hasFacts || keywordMatch);

  return {
    stepIndex: step.index,
    acceptance: step.acceptance,
    passed,
    evidence: evidence || result.error || "(no evidence)",
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Roll up per-step verdicts into a MissionVerification block for persistence.
 */
import type { MissionVerification } from "./types";

export function aggregateVerification(verdicts: AcceptanceVerdict[]): MissionVerification {
  const passed = verdicts.filter((v) => v.passed).length;
  const histogram: MissionVerification["truthHistogram"] = { VERIFIED: passed, INFERRED: 0, UNKNOWN: 0, FAILED: verdicts.length - passed, BLOCKED: 0 };
  return {
    total: verdicts.length,
    passed,
    stepVerdicts: verdicts,
    truthHistogram: histogram,
  };
}

export function progressFraction(v: MissionVerification): number {
  if (v.total === 0) return 0;
  return Number((v.passed / v.total).toFixed(3));
}

export function confidenceFraction(v: MissionVerification): number {
  const total = Object.values(v.truthHistogram).reduce((a, b) => a + b, 0) || 1;
  return Number((v.truthHistogram.VERIFIED / total).toFixed(3));
}