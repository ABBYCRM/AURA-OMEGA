/**
 * Mission planner — wraps bosOmegaBrain to produce a MissionStep[] plan.
 *
 * The Brain already produces a 10-step plan with acceptance criteria and a
 * state machine (NEW/INTAKE/PLANNED/EXECUTED/VERIFIED/COMPLETE/BLOCKED/FAILED).
 * We translate that into MissionStep objects the executor can dispatch.
 */

import {
  createBosOmegaBrainPlan,
  markBrainExecuted,
  markBrainVerified,
  type BrainPlan,
} from "../bosOmegaBrain";
import type { MissionStep } from "./types";

const ENGINE_FOR_TASK_TYPE: Record<string, MissionStep["engine"]> = {
  CODE: "openhands",
  RESEARCH: "crawl4ai",
  UI: "openhands",
  DEPLOYMENT: "openhands",
  SECURITY: "openhands",
  WRITING: "hermes",
  N8N: "openhands",
  GENERAL_EXECUTION: "hermes",
};

export function buildMissionSteps(goal: string): { steps: MissionStep[]; brain: BrainPlan } {
  const brain = createBosOmegaBrainPlan(goal);
  const engine = ENGINE_FOR_TASK_TYPE[brain.taskType] ?? "hermes";

  if (brain.gate === "HOLD" || brain.gate === "ABORT") {
    return { steps: [], brain };
  }

  const steps: MissionStep[] = brain.plan.map((description, i) => ({
    index: i,
    description,
    engine,
    action: i === 0 ? "intake" : i === brain.plan.length - 1 ? "verify" : "execute",
    args: { goal, stepIndex: i, taskType: brain.taskType },
    acceptance: brain.acceptance[i] ?? "At least one piece of verified evidence recorded.",
    maxAttempts: 3,
    backoffSeconds: 30 * Math.pow(5, i),
  }));

  return { steps, brain };
}

export function recordExecuted(brain: BrainPlan, message: string): BrainPlan {
  return markBrainExecuted(brain, message);
}

export function recordVerified(brain: BrainPlan, message: string): BrainPlan {
  return markBrainVerified(brain, message);
}