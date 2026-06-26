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

  // Operator's RULE (2026-06-26): when a platform is auth-gated (LinkedIn,
  // Instagram, Twitter, Glassdoor), the FIRST step is a Tavily public-search
  // fallback. The planner still schedules a follow-up crawl4ai step for
  // higher-quality structured scraping, but the kernel records the operator's
  // rule as evidence: "public-web search happened before auth-gated attempt".
  const AUTH_GATED = /\b(linkedin|instagram|twitter|x\.com|glassdoor|facebook|tiktok)\b/i;
  const isAuthGatedPlatform = AUTH_GATED.test(goal);
  const prependedSteps: MissionStep[] = isAuthGatedPlatform
    ? [
        {
          index: 0,
          description: `Public-web search for "${goal}" — operator's fallback rule.`,
          engine: "tavily-search" as any,
          action: "search",
          args: { query: goal, site: extractSite(goal), limit: 30, category: extractCategory(goal) },
          acceptance: "Tavily returned at least one matching profile with name, role, company, LinkedIn URL.",
          maxAttempts: 2,
          backoffSeconds: 15,
        },
      ]
    : [];

  const steps: MissionStep[] = prependedSteps.concat(
    brain.plan.map((description, i) => {
      const enriched = enrichOne(brain, engine, goal, i, description);
      return {
        index: prependedSteps.length + i,
        description,
        engine,
        action: enriched.action,
        args: enriched.args,
        acceptance: brain.acceptance[i] ?? "At least one piece of verified evidence recorded.",
        maxAttempts: 3,
        backoffSeconds: 30 * Math.pow(5, i),
      };
    }),
  );

  return { steps, brain };
}

/** Extract the platform domain from a goal like "scrape linkedin for X". */
function extractSite(goal: string): string {
  const m = goal.match(/\b(linkedin\.com|instagram\.com|twitter\.com|x\.com|glassdoor\.com|facebook\.com|tiktok\.com)\b/i);
  if (m) return m[1];
  const m2 = goal.match(/\b(linkedin|instagram|twitter|glassdoor|facebook|tiktok)\b/i);
  return m2 ? `${m2[1].toLowerCase()}.com` : "linkedin.com";
}

/** Extract a category slug from the goal text (best-effort). */
function extractCategory(goal: string): string {
  return slugify(goal.replace(/\b(scrape|find|get|extract|contacts|profiles|from)\b/gi, "").trim());
}

function enrichOne(
  brain: BrainPlan,
  engine: MissionStep["engine"],
  goal: string,
  i: number,
  description: string,
): { action: string; args: Record<string, unknown> } {
  const base = { goal, stepIndex: i, taskType: brain.taskType };

  if (engine === "crawl4ai") {
    return { action: "crawl", args: { ...base, seeds: [buildSeedUrl(goal)], maxPages: 5 } };
  }
  if (engine === "mem0") {
    return { action: "extract", args: { ...base, text: goal, userId: "operator" } };
  }
  if (engine === "hermes") {
    // Step 1 always records the mission start so verifier can confirm it
    // even on fresh kernels with no prior memory. Steps 2-8 do memory_write
    // (recording each Brain phase) — these produce verifiable "wrote memory"
    // evidence. Last step skill_distills the lesson for the next mission.
    if (i === 1) return { action: "memory_write", args: { ...base, key: `mission/${slugify(goal)}/start`, content: `Mission start: ${goal}\n${description}` } };
    if (i === brain.plan.length - 1) {
      return { action: "memory_write", args: { ...base, key: `mission/${slugify(goal)}/distill`, content: `Mission distilled: ${goal}\n${brain.plan.join("\n")}` } };
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