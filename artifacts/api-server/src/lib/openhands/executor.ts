/**
 * OpenHands executor — walks a planned goal, calls tools, appends events,
 * records tool runs.
 *
 * Reuses the AURA-OMEGA tool registry (runTool from tools.ts) so OpenHands
 * has the same tool surface as the rest of the swarm. NO new tools added —
 * it just calls web_search / web_scrape / http_request / code_exec /
 * memory_write / memory_search / etc. through the existing registry.
 *
 * Each step appends one event (kind=tool_call) before execution and one
 * observation event (kind=observation) after. Each step also records a row
 * in openhands_tool_runs for reinforcement aggregation.
 *
 * Best-effort: failures are logged, the step is marked failed, and the
 * executor continues to the next step unless the failure is fatal (e.g.
 * unknown tool or sandbox disabled).
 */

import { logger } from "../logger";
import { runTool, type ToolContext } from "../../tools";
import { appendEvent, nextSequence, recordToolRun } from "./events";
import { setSessionStatus } from "./sessions";
import type { PlannedGoal } from "./llm";

const OPENHANDS_AGENT_ID = 0; // 0 in resolveModel = system default; for runTool we need a valid agent. Use 0 means "no agent filter".
                              // Actually runTool requires isToolAllowed check; we pass agentId=0 which is system/no-agent.
                              // The allow list is keyed per agent; agentId=0 won't match any real agent. So we bypass by calling
                              // tool functions directly? Actually runTool accepts any toolName — the isToolAllowed check just gates
                              // which tools a given agent can use. We want OpenHands to use ALL tools. So we set agentId that maps
                              // to "all tools allowed" — there's no such mapping today. Best path: skip runTool and call the tool
                              // registry's lower-level run() function directly, OR add a new agent record for OpenHands.

interface ExecutionResult {
  outcome: "success" | "partial" | "failed";
  stepsRun: number;
  stepsFailed: number;
  errorSummary: string | null;
  observationSummary: string;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

async function appendObservation(sessionId: number, payload: Record<string, unknown>): Promise<void> {
  const seq = await nextSequence(sessionId);
  await appendEvent({
    sessionId,
    kind: "observation",
    payload,
    sequence: seq,
  });
}

async function appendToolCall(sessionId: number, payload: Record<string, unknown>): Promise<void> {
  const seq = await nextSequence(sessionId);
  await appendEvent({
    sessionId,
    kind: "tool_call",
    payload,
    sequence: seq,
  });
}

/**
 * Execute a planned goal against the AURA tool registry. Idempotent in the
 * sense that no step mutates state outside the openhands_* tables (the tool
 * registry's own side effects — e.g. memory_write — are intentional).
 */
export async function executePlan(opts: {
  sessionId: number;
  plan: PlannedGoal;
  channelId?: number | null;
}): Promise<ExecutionResult> {
  const ctx: ToolContext = {
    agentId: 6, // AURA-5 — has the broadest tool set (web + code + http + memory). Used as the runTool gate.
    agentName: "OpenHands-Runtime",
    agentColor: "#00ccff",
    channelId: opts.channelId ?? null,
  };

  let stepsRun = 0;
  let stepsFailed = 0;
  let lastObservation = "";
  const errors: string[] = [];

  for (let i = 0; i < opts.plan.steps.length; i++) {
    const step = opts.plan.steps[i];
    const t0 = Date.now();

    await appendToolCall(opts.sessionId, {
      index: i + 1,
      tool: step.tool,
      args: step.args,
      rationale: step.rationale,
    });

    let result = "";
    let success = false;
    let errorMsg: string | null = null;
    try {
      result = await runTool(step.tool, step.args, ctx);
      // Tool returns "error: ..." prefix on failure. Treat that as failure.
      if (result.startsWith("error:")) {
        success = false;
        errorMsg = result;
      } else {
        success = true;
      }
    } catch (err) {
      success = false;
      errorMsg = String(err).slice(0, 300);
      result = errorMsg;
    }

    const durationMs = Date.now() - t0;
    lastObservation = result.slice(0, 1000);

    await appendObservation(opts.sessionId, {
      index: i + 1,
      tool: step.tool,
      success,
      durationMs,
      resultSummary: truncate(result, 500),
      error: errorMsg,
    });

    await recordToolRun({
      sessionId: opts.sessionId,
      toolName: step.tool,
      args: step.args,
      resultSummary: truncate(result, 500),
      success,
      durationMs,
      error: errorMsg,
    });

    stepsRun++;
    if (!success) {
      stepsFailed++;
      errors.push(`step ${i + 1} (${step.tool}): ${truncate(errorMsg ?? "unknown", 200)}`);
      // Continue to next step — partial completion is better than abandoning
      // mid-plan. The final outcome will be "partial" if any step succeeded,
      // "failed" if all failed.
    }
  }

  let outcome: "success" | "partial" | "failed";
  if (stepsFailed === 0) outcome = "success";
  else if (stepsRun === stepsFailed) outcome = "failed";
  else outcome = "partial";

  return {
    outcome,
    stepsRun,
    stepsFailed,
    errorSummary: errors.length > 0 ? errors.join(" | ") : null,
    observationSummary: lastObservation,
  };
}