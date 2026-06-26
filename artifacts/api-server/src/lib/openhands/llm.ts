/**
 * OpenHands LLM hooks — planner + parser.
 *
 * Used by the executor (and any direct caller) to turn a free-form goal into
 * a structured, executable plan. Uses the shared `completeChat()` so it
 * inherits the same K2.6 / NVIDIA NIM / OpenRouter / Buddy failover the
 * rest of the AURA swarm uses. No new LLM keys.
 *
 * The plan is intentionally conservative: a goal is rejected (returns null)
 * if it can't be turned into a concrete tool sequence. Better to bail than
 * to invent a plan.
 */

import { logger } from "../logger";
import { completeChat } from "../integrations";
import { resolveModel } from "../../routes/ai";
import type { OpenhandsWorkspace } from "@workspace/db";
import { nextSequence, appendEvent, recordToolRun } from "./events";

const PLAN_SYSTEM = `You are OpenHands (AURA-OMEGA parallel runtime). Given a coding-style goal and a workspace context, produce a structured, executable plan.

Return STRICT JSON matching this shape and nothing else:
{
  "plan": {
    "summary": "One-sentence description of the approach.",
    "steps": [
      {
        "tool": "tool_name",
        "args": { "key": "value" },
        "rationale": "Why this step exists."
      }
    ]
  } | null
}

Rules:
- Tools must be drawn from this set ONLY: web_search, web_scrape, http_request, code_exec, cloud_code_exec, memory_write, memory_search, file_write.
- A step with tool "code_exec" MUST have args.language (e.g. "python", "javascript", "bash") and args.source (the code).
- A step with tool "http_request" MUST have args.url.
- A step with tool "web_scrape" MUST have args.url.
- A step with tool "memory_write" MUST have args.key and args.content.
- A step with tool "memory_search" MUST have args.query.
- A step with tool "file_write" MUST have args.path and args.content.
- Keep the plan tight: 1-7 steps. Don't over-plan. If the goal is one-liner (e.g. "check the weather"), return 1-2 steps.
- Return null (just {"plan": null}) if the goal is unanswerable, out of scope, or requires human input.`;

export interface PlannedStep {
  tool: string;
  args: Record<string, unknown>;
  rationale?: string;
}

export interface PlannedGoal {
  summary: string;
  steps: PlannedStep[];
}

/**
 * Plan a goal using K2.6 / NVIDIA NIM. Returns null when the goal can't be
 * turned into a concrete plan (out of scope, ambiguous, etc.).
 */
export async function planGoal(
  goal: string,
  workspace: Pick<OpenhandsWorkspace, "name" | "description" | "repoUrl" | "baseBranch" | "agentBackend" | "sandboxKind">,
  sessionId: number | null,
): Promise<PlannedGoal | null> {
  const user = `Workspace: ${workspace.name}\nDescription: ${workspace.description ?? "(none)"}\nRepo: ${workspace.repoUrl ?? "(none)"}\nBase branch: ${workspace.baseBranch ?? "main"}\nAgent backend: ${workspace.agentBackend}\nSandbox: ${workspace.sandboxKind}\n\nGoal:\n${goal}\n\nProduce a structured plan as strict JSON, or {"plan": null} if none.`;

  let raw = "";
  try {
    const model = resolveModel(0, undefined, undefined); // 0 = system default (k2.6)
    raw = await completeChat(model, PLAN_SYSTEM, user, 1200);
  } catch (err) {
    logger.error({ err, sessionId, goalLen: goal.length }, "openhands: planGoal LLM call failed");
    return null;
  }

  const parsed = parsePlanResponse(raw);
  if (!parsed) {
    logger.info({ sessionId, rawLen: raw.length }, "openhands: planner returned null");
    return null;
  }

  if (sessionId != null) {
    const seq = await nextSequence(sessionId);
    await appendEvent({
      sessionId,
      kind: "state_delta",
      payload: { type: "plan", summary: parsed.summary, stepCount: parsed.steps.length },
      sequence: seq,
    });
  }
  return parsed;
}

/**
 * Strict JSON parser for the planner response. Handles plain JSON,
 * fenced JSON (\`\`\`json ... \`\`\`), and prose-wrapped JSON.
 */
export function parsePlanResponse(raw: string): PlannedGoal | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  let candidate = text.slice(s, e + 1);
  let obj: any;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const plan = obj.plan;
  if (!plan || typeof plan !== "object") return null;
  const summary = String(plan.summary ?? "").trim();
  if (!summary) return null;
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) return null;
  if (plan.steps.length > 7) return null;
  const steps: PlannedStep[] = [];
  for (const raw of plan.steps) {
    if (!raw || typeof raw !== "object") continue;
    const tool = String(raw.tool ?? "").trim();
    if (!tool) continue;
    const args = raw.args && typeof raw.args === "object" ? raw.args : {};
    const rationale = typeof raw.rationale === "string" ? raw.rationale : undefined;
    steps.push({ tool, args, rationale });
  }
  if (steps.length === 0) return null;
  return { summary, steps };
}

/**
 * Record a tool run as a reinforcement data point. Best-effort.
 */
export async function recordRun(opts: {
  sessionId: number;
  toolName: string;
  args?: Record<string, unknown>;
  result?: string;
  success: boolean;
  durationMs?: number;
  error?: string;
}): Promise<void> {
  await recordToolRun({
    sessionId: opts.sessionId,
    toolName: opts.toolName,
    args: opts.args ?? {},
    resultSummary: opts.result?.slice(0, 500) ?? null,
    success: opts.success,
    durationMs: opts.durationMs ?? null,
    error: opts.error ?? null,
  });
}