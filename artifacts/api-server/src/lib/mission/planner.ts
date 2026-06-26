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
    args: enrichArgs({ goal, stepIndex: i, taskType: brain.taskType, engine, stepDescription: description, allSteps: brain.plan.map((d) => d) }),
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

/**
 * Enrich step args based on the engine + step purpose so engines have what
 * they need to succeed on the first attempt. For RESEARCH goals we seed
 * crawl4ai with the goal as a search query; for CODE we hand the goal to
 * openhands as the prompt; etc.
 */
function enrichArgs(opts: {
  goal: string;
  stepIndex: number;
  taskType: string;
  engine: MissionStep["engine"];
  stepDescription: string;
  allSteps: string[];
}): Record<string, unknown> {
  const { goal, stepIndex, engine, taskType } = opts;
  const base = { goal, stepIndex, taskType };

  if (engine === "crawl4ai" && stepIndex > 0) {
    // Step 0 is "intake" — the kernel knows the goal from the mission row.
    // Step 1+ should crawl.
    return {
      ...base,
      seeds: [buildSeedUrl(goal)],
      maxPages: 5,
    };
  }

  if (engine === "mem0") {
    return {
      ...base,
      text: goal,
      userId: "operator",
    };
  }

  if (engine === "hermes") {
    if (stepIndex === 1) return { ...base, action: "memory_search", query: goal };
    if (stepIndex === opts.allSteps.length - 1) return { ...base, action: "skill_distill", name: slugify(goal), description: goal, content: opts.allSteps.join("\n") };
    return { ...base, action: "memory_write", key: `mission/${slugify(goal)}/${stepIndex}`, content: opts.stepDescription };
  }

  if (engine === "openhands") {
    return {
      ...base,
      code: `// Mission step ${stepIndex}: ${opts.stepDescription}\n// Goal: ${goal}\n`,
      language: "javascript",
    };
  }

  if (engine === "bos-omega") {
    return { ...base, deviceId: 1, command: opts.stepDescription };
  }

  return base;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "");
}

/** Convert a free-form goal into a single search seed URL the crawler can hit. */
function buildSeedUrl(goal: string): string {
  const q = encodeURIComponent(goal);
  return `https://duckduckgo.com/?q=${q}`;
}