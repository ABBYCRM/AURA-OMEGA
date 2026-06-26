/**
 * Hermes runtime — public surface.
 *
 * The rest of AURA-OMEGA should import from this file only. Internal layout
 * (sessions, skills, llm, heartbeat) stays free to change.
 *
 * Usage from orchestrator.ts (after orchestrateGoal completes):
 *
 *   import { recordOutcome } from "./lib/hermes";
 *   await recordOutcome({
 *     goal, channelId, outcome, auraReports, toolCalls, durationMs, finalAnswer,
 *   });
 *
 * That single call handles session recording + skill distillation + scoring.
 */

export { recordSession, listRecentSessions, getSessionById, searchSessionsByKeyword } from "./sessions";
export { createSkill, findMatchingSkill, listSkills, matchSkillForGoal, recordSkillRun, pruneAndPromote } from "./skills";
export { distillSkill } from "./llm";
export { runHeartbeat, scheduleHeartbeat, queueNudge } from "./heartbeat";
export type {
  HermesOutcome,
  SkillStatus,
  HermesAuraReport,
  HermesToolCallRecord,
  RecordSessionInput,
  DistilledSkill,
  SkillMatch,
  HeartbeatReport,
} from "./types";

import { recordSession } from "./sessions";
import { distillSkill } from "./llm";
import { logger } from "../logger";
import type { RecordSessionInput } from "./types";

/**
 * recordOutcome — the one entry point orchestrator.ts calls after a goal runs.
 * Records the session, then attempts skill distillation (best-effort).
 * Never throws.
 */
export async function recordOutcome(input: RecordSessionInput): Promise<void> {
  try {
    const session = await recordSession(input);
    if (!session) return;
    // Distillation is async + LLM-bound; run it without blocking the caller.
    setImmediate(() => {
      distillSkill(input, session.id).catch((err) =>
        logger.error({ err, sessionId: session.id }, "hermes: background distill threw"),
      );
    });
  } catch (err) {
    logger.error({ err }, "hermes: recordOutcome threw (non-fatal)");
  }
}