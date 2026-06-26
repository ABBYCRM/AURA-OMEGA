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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "");
}

function buildSeedUrl(goal: string): string {
  const q = encodeURIComponent(goal);
  return `https://duckduckgo.com/?q=${q}`;
}

export function buildMissionSteps(goal: string): { steps: MissionStep[]; brain: BrainPlan } {
  const brain = createBosOmegaBrainPlan(goal);
  const engine = ENGINE_FOR_TASK_TYPE[brain.taskType] ?? "hermes";

  if (brain.gate === "HOLD" || brain.gate === "ABORT") {
    return { steps: [], brain };
  }

  const steps: MissionStep[] = brain.plan.map((description, i) => {
    const enriched = enrichOne(brain, engine, goal, i, description);
    return {
      index: i,
      description,
      engine,
      action: enriched.action,
      args: enriched.args,
      acceptance: brain.acceptance[i] ?? "At least one piece of verified evidence recorded.",
      maxAttempts: 3,
      backoffSeconds: 30 * Math.pow(5, i),
    };
  });

  return { steps, brain };
}

function enrichOne(
  brain: BrainPlan,
  engine: MissionStep["engine"],
  goal: string,
  i: number,
  description: string,
): { action: string; args: Record<string, unknown> } {
  const base = { goal, stepIndex: i, taskType: brain.taskType };

  if (engine === "crawl4ai" && i > 0) {
    return { action: "crawl", args: { ...base, seeds: [buildSeedUrl(goal)], maxPages: 5 } };
  }
  if (engine === "mem0") {
    return { action: "extract", args: { ...base, text: goal, userId: "operator" } };
  }
  if (engine === "hermes") {
    if (i === 1) return { action: "memory_search", args: { ...base, query: goal } };
    if (i === brain.plan.length - 1) {
      return { action: "skill_distill", args: { ...base, name: slugify(goal), description: goal, content: brain.plan.join("\n") } };
    }
    return { action: "memory_write", args: { ...base, key: `mission/${slugify(goal)}/${i}`, content: description } };
  }
  if (engine === "openhands") {
    return {
      action: "code_exec",
      args: { ...base, code: `// Mission step ${i}: ${description}\n// Goal: ${goal}\n`, language: "javascript" },
    };
  }
  if (engine === "bos-omega") {
    return { action: "command", args: { ...base, deviceId: 1, command: description } };
  }
  return { action: "intake", args: base };
}

export function recordExecuted(brain: BrainPlan, message: string): BrainPlan {
  return markBrainExecuted(brain, message);
}

export function recordVerified(brain: BrainPlan, message: string): BrainPlan {
  return markBrainVerified(brain, message);
}