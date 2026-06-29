/**
 * Mission Runtime — the event-driven execution loop.
 *
 * Lifecycle of a single mission.run() call:
 *
 *   1. Read mission from state-store.
 *   2. If status is new → call planner, persist plan, transition to executing.
 *   3. Pick the next non-passing step from the plan (skip already VERIFIED).
 *   4. Dispatch the step to its engine via the registry.
 *   5. Run the engine, capture result.
 *   6. Run verifier on the result → verdict.
 *   7. Persist verdict + updated progress/confidence.
 *   8. If retry → schedule retry event.
 *   9. If all steps verified → mark completed, distill lesson.
 *  10. If blocked → emit mission.blocked event.
 *
 * The runtime does NOT poll. Each run() call is a single tick. The event bus
 * wakes the next tick when a step.completed event arrives. A simple in-memory
 * queue drives a polling fallback for development; production uses Inngest.
 */

import { logger } from "../logger";
import {
  getMission,
  updateMissionState,
  recordEvent,
  eventsForMission,
} from "./state-store";
import { emit, subscribe } from "./event-bus";
import { getEngine } from "./engines/registry";
import { evaluateAcceptance, aggregateVerification, progressFraction, confidenceFraction } from "./verifier";
import { decideRetry } from "./retry";
import { distillMission } from "./learning";
import { runLearningLoop } from "../learning-loop";
import type { Mission, MissionStatus, MissionStep, AcceptanceVerdict } from "./types";

const ACTIVE_STATUSES: MissionStatus[] = ["new", "planned", "executing", "verifying", "waiting"];

/**
 * Run one mission tick. Safe to call repeatedly; idempotent within a status.
 * Returns the mission row after the tick so callers can inspect state.
 */
export async function tick(missionId: number): Promise<Mission | null> {
  const mission = await getMission(missionId);
  if (!mission) {
    logger.warn({ missionId }, "mission tick: not found");
    return null;
  }
  if (!ACTIVE_STATUSES.includes(mission.status as MissionStatus)) {
    // Terminal state — nothing to do.
    return mission;
  }

  // New → planned. If no plan yet, the planner should have populated it
  // at creation time. If not (e.g. legacy row), bail.
  if (!Array.isArray(mission.plan) || (mission.plan as unknown[]).length === 0) {
    await updateMissionState(missionId, { status: "failed", lastError: "no plan; mission cannot execute", completedAt: new Date() });
    await emit("mission.failed", missionId, { reason: "no_plan" }, "in-process");
    return getMission(missionId);
  }

  const plan = mission.plan as unknown as MissionStep[];

  // Pull existing verdicts from verification JSON.
  const verification = (mission.verification ?? {}) as { stepVerdicts?: AcceptanceVerdict[] };
  const verdicts: AcceptanceVerdict[] = verification.stepVerdicts ?? [];

  // Pick next non-passing step.
  const passedIdx = new Set(verdicts.filter((v) => v.passed).map((v) => v.stepIndex));
  const nextStep = plan.find((s) => !passedIdx.has(s.index));
  if (!nextStep) {
    // All steps passed → complete.
    await complete(mission);
    return getMission(missionId);
  }

  // Dispatch + execute.
  await updateMissionState(missionId, { status: "executing" });
  await emit("step.dispatched", missionId, { stepIndex: nextStep.index, engine: nextStep.engine, action: nextStep.action }, "in-process");

  let result;
  try {
    const engine = getEngine(nextStep.engine);
    result = await engine.run({ ...nextStep, args: { ...nextStep.args, missionId } });
  } catch (err) {
    result = { ok: false, error: String(err).slice(0, 300), durationMs: 0 };
  }

  // Verifier.
  const verdict = evaluateAcceptance(nextStep, result);
  const allVerdicts = [...verdicts.filter((v) => v.stepIndex !== nextStep.index), verdict];
  const agg = aggregateVerification(allVerdicts);
  const progress = progressFraction(agg);
  const confidence = confidenceFraction(agg);

  if (verdict.passed) {
    await updateMissionState(missionId, {
      status: "verifying",
      verification: agg as unknown as object,
      progress,
      confidence,
      attempts: 0,
    });
    await emit("step.completed", missionId, { stepIndex: nextStep.index, evidence: verdict.evidence, confidence }, "in-process");

    // Re-tick immediately to pick the next step (event-driven but in-process).
    setImmediate(() => { void tick(missionId).catch((err) => logger.error({ err }, "mission tick (resume) failed")); });
    return getMission(missionId);
  }

  // Step failed → retry or block.
  const attempt = mission.attempts + 1;
  const maxAttempts = nextStep.maxAttempts ?? 3;
  const decision = decideRetry(nextStep.index, attempt, maxAttempts, nextStep.backoffSeconds ?? 30, result.error ?? "");
  if (decision.shouldRetry) {
    await updateMissionState(missionId, {
      status: "waiting",
      verification: agg as unknown as object,
      attempts: decision.attempt,
      lastError: decision.reason,
    });
    await emit("retry.scheduled", missionId, { stepIndex: nextStep.index, delaySeconds: decision.delaySeconds, nextAttempt: decision.attempt }, "in-process");
    // Schedule resume after the backoff.
    setTimeout(() => { void tick(missionId).catch((err) => logger.error({ err }, "mission tick (retry) failed")); }, decision.delaySeconds * 1000);
    return getMission(missionId);
  }

  // Max attempts exhausted → blocked.
  await updateMissionState(missionId, {
    status: "blocked",
    verification: agg as unknown as object,
    lastError: decision.reason,
  });
  await emit("mission.blocked", missionId, { stepIndex: nextStep.index, attempts: decision.attempt }, "in-process");
  return getMission(missionId);
}

async function complete(mission: Mission): Promise<void> {
  await updateMissionState(mission.id, {
    status: "completed",
    completedAt: new Date(),
    confidence: mission.confidence || 0.8,
    progress: 1,
  });
  await emit("mission.completed", mission.id, { confidence: mission.confidence }, "in-process");
  // Best-effort lesson distillation.
  void distillMission(mission.id).catch((err) => logger.error({ err }, "distill failed"));
  // Operator doctrine 2026-06-27: read, understand, learn, add to memory,
  // then perform. After every successful mission, extract durable knowledge
  // facts from the final synthesized answer and persist them to hermes under
  // knowledge/<topic>/<slug> so the agent accumulates understanding over
  // time and can answer similar questions without re-searching the web.
  void runLearningLoop(mission.id, mission.goal)
    .then((r) => {
      if (r.factsWritten > 0) {
        logger.info({ missionId: mission.id, factsWritten: r.factsWritten, durationMs: r.durationMs }, "learning loop: extracted & persisted knowledge facts");
      }
    })
    .catch((err) => logger.error({ err }, "learning loop failed"));
}

/**
 * Boot — wire up the kernel to in-process events. Idempotent.
 * Returns an unsubscribe function for tests.
 */
let _booted = false;
export function boot(): () => void {
  if (_booted) return () => {};
  _booted = true;
  // Resume missions that get step.completed events from the same process.
  const unsub = subscribe(["step.completed", "retry.scheduled", "mission.completed"], (evt) => {
    void tick(evt.missionId).catch((err) => logger.error({ err }, "mission tick (event) failed"));
  });
  return () => { unsub(); _booted = false; };
}