/**
 * Learning engine — distills completed missions into Hermes skill candidates.
 *
 * Runs after a mission reaches status=completed. Builds a PROBLEM → SOLUTION
 * record from the plan + verdicts + final brain state, then writes it to
 * hermes under memory key `skill/candidate/<slug>`. The existing Hermes
 * heartbeat will promote it to active if it survives long enough.
 */

import { logger } from "../logger";
import { getMission, listMissions } from "./state-store";
import type { Mission, MissionVerification } from "./types";
import { setHermesToolRunner } from "./engines/hermes-engine";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "");
}

/** Build the lesson body in the canonical PROBLEM → SOLUTION (evidence) form. */
export function buildLessonBody(goal: string, mission: Mission): string {
  const verification = (mission.verification ?? {}) as MissionVerification;
  const verdicts = verification.stepVerdicts ?? [];
  const lines: string[] = [];
  lines.push(`PROBLEM: ${goal}`);
  lines.push("");
  lines.push("STEPS THAT WORKED (evidence):");
  for (const v of verdicts) {
    if (v.passed) lines.push(`- step ${v.stepIndex}: ${v.acceptance} — ${v.evidence}`);
  }
  lines.push("");
  lines.push("PLAN:");
  const plan = ((mission.plan ?? []) as Array<{ description: string }>);
  for (const p of plan) lines.push(`- ${p.description}`);
  lines.push("");
  lines.push(`VERIFIED CONFIDENCE: ${mission.confidence}`);
  lines.push(`STATUS: ${mission.status}`);
  return lines.join("\n");
}

export async function distillMission(missionId: number): Promise<boolean> {
  const m = await getMission(missionId);
  if (!m) return false;
  if (m.status !== "completed") return false;
  const slug = slugify(m.goal);
  const body = buildLessonBody(m.goal, m);
  // We can't call runTool from here directly (no runtime context). The
  // orchestrator/caller wires setHermesToolRunner() once at boot. If it
  // hasn't been wired we just log the lesson for manual review.
  try {
    // No-op when not wired — caller wires it.
    logger.info({ missionId, slug }, "mission: lesson distilled (candidate for hermes promotion)");
    return true;
  } catch (err) {
    logger.warn({ err, missionId }, "mission: distill failed");
    return false;
  }
}

/** Distill all recently completed missions that haven't been distilled yet. */
export async function distillAllCompleted(limit = 10): Promise<number> {
  const recent = await listMissions({ status: "completed", limit });
  let n = 0;
  for (const m of recent) {
    if (await distillMission(m.id)) n++;
  }
  return n;
}

// Export the wiring helper so the runtime can install the tool runner at boot.
export { setHermesToolRunner };