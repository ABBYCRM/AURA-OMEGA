/**
 * OpenHands runtime bridge.
 *
 * The dispatch path is INTENTIONALLY decoupled from the AURA orchestrator:
 * when a goal is routed to OpenHands (by the user-designed orchestrator that
 * lives elsewhere), it lands here. We:
 *
 *   1) Record the session in Postgres.
 *   2) If OPENHANDS_BASE_URL is set, POST the goal to the upstream OpenHands
 *      server (Agent Canvas / app_server) and stash the upstream session id.
 *   3) If OPENHANDS_BASE_URL is NOT set, mark the session queued; a worker
 *      (added later) can pick it up.
 *   4) Optionally seed the event log with the goal message + an initial
 *      system event so downstream consumers see consistent state.
 *
 * Failure modes:
 *   - Upstream OpenHands unreachable: session stays `queued` and the error
 *     is logged; we never throw to the caller.
 */

import { logger } from "../logger";
import {
  createSession,
  setSessionStatus,
  getSessionById,
} from "./sessions";
import { getWorkspaceById } from "./workspaces";
import { appendEvent } from "./events";
import { planGoal } from "./llm";
import { executePlan } from "./executor";
import type { DispatchResult } from "./types";

function getBaseUrl(): string | null {
  const raw = process.env["OPENHANDS_BASE_URL"];
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

function getApiKey(): string | null {
  return process.env["OPENHANDS_API_KEY"] ?? null;
}

export async function dispatchGoal(opts: {
  workspaceId: number;
  goal: string;
  channelId?: number | null;
  parentSessionId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<DispatchResult | null> {
  const workspace = await getWorkspaceById(opts.workspaceId);
  if (!workspace) {
    logger.warn({ workspaceId: opts.workspaceId }, "openhands: dispatchGoal — workspace not found");
    return null;
  }
  if (workspace.status === "archived") {
    logger.warn({ workspaceId: opts.workspaceId }, "openhands: dispatchGoal — workspace archived");
    return null;
  }

  const session = await createSession({
    workspaceId: opts.workspaceId,
    goal: opts.goal,
    channelId: opts.channelId ?? null,
    parentSessionId: opts.parentSessionId ?? null,
    metadata: opts.metadata ?? {},
  });
  if (!session) {
    return null;
  }

  // Seed event log with the user goal + system context.
  await appendEvent({
    sessionId: session.id,
    kind: "message",
    role: "user",
    payload: { content: opts.goal, channelId: opts.channelId ?? null },
    sequence: 1,
  });
  await appendEvent({
    sessionId: session.id,
    kind: "system",
    payload: {
      agentBackend: workspace.agentBackend,
      sandboxKind: workspace.sandboxKind,
      repoUrl: workspace.repoUrl,
      baseBranch: workspace.baseBranch,
    },
    sequence: 2,
  });

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    // Local execution path: plan with K2.6, execute via the AURA tool registry.
    // This mirrors the Hermes runtime pattern — fully in-stack, no upstream needed.
    await setSessionStatus(session.id, "running");
    const plan = await planGoal(opts.goal, workspace, session.id);
    if (!plan) {
      logger.info({ sessionId: session.id }, "openhands: planner returned null — goal not actionable");
      await setSessionStatus(session.id, "failed", "failed", "Planner could not produce a concrete plan for this goal.");
      return {
        sessionId: session.id,
        status: "failed",
        workspace: {
          id: workspace.id,
          name: workspace.name,
          agentBackend: workspace.agentBackend as any,
          sandboxKind: workspace.sandboxKind as any,
        },
        message: "Planner could not produce a concrete plan for this goal (out of scope or ambiguous).",
      };
    }

    const result = await executePlan({
      sessionId: session.id,
      plan,
      channelId: opts.channelId ?? null,
    });

    await setSessionStatus(
      session.id,
      result.outcome === "success" ? "success" : result.outcome === "partial" ? "partial" : "failed",
      result.outcome,
      result.observationSummary,
    );

    logger.info({
      sessionId: session.id,
      outcome: result.outcome,
      stepsRun: result.stepsRun,
      stepsFailed: result.stepsFailed,
    }, "openhands: local execution complete");

    return {
      sessionId: session.id,
      status: result.outcome === "success" ? "success" : result.outcome === "partial" ? "partial" : "failed",
      workspace: {
        id: workspace.id,
        name: workspace.name,
        agentBackend: workspace.agentBackend as any,
        sandboxKind: workspace.sandboxKind as any,
      },
      message: `Local execution complete. ${result.stepsRun} steps run, ${result.stepsFailed} failed. Outcome: ${result.outcome}.`,
    };
  }

  // Forward to upstream OpenHands server. Best-effort.
  await setSessionStatus(session.id, "running");
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = getApiKey();
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const resp = await fetch(`${baseUrl}/api/v1/app_conversations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        initial_user_msg: opts.goal,
        agent_backend: workspace.agentBackend,
        workspace: {
          repo_url: workspace.repoUrl,
          base_branch: workspace.baseBranch,
        },
        sandbox: {
          kind: workspace.sandboxKind,
          config: workspace.sandboxConfig,
        },
      }),
    });

    if (!resp.ok) {
      const errText = (await resp.text()).slice(0, 300);
      logger.warn({ sessionId: session.id, status: resp.status, err: errText }, "openhands: upstream call failed");
      await setSessionStatus(session.id, "failed", "failed", `Upstream OpenHands returned ${resp.status}: ${errText}`);
      return {
        sessionId: session.id,
        status: "failed",
        workspace: {
          id: workspace.id,
          name: workspace.name,
          agentBackend: workspace.agentBackend as any,
          sandboxKind: workspace.sandboxKind as any,
        },
        message: `Upstream OpenHands returned ${resp.status}: ${errText}`,
      };
    }

    const data = (await resp.json()) as { id?: string; status?: string };
    const upstreamSessionId = data.id;
    logger.info({ sessionId: session.id, upstreamSessionId, upstreamStatus: data.status }, "openhands: dispatch OK");
    return {
      sessionId: session.id,
      status: (data.status as any) ?? "running",
      workspace: {
        id: workspace.id,
        name: workspace.name,
        agentBackend: workspace.agentBackend as any,
        sandboxKind: workspace.sandboxKind as any,
      },
      upstreamSessionId,
      message: `Forwarded to OpenHands at ${baseUrl}.`,
    };
  } catch (err) {
    logger.error({ err, sessionId: session.id }, "openhands: dispatchGoal threw (non-fatal)");
    await setSessionStatus(session.id, "failed", "failed", String(err).slice(0, 300));
    return {
      sessionId: session.id,
      status: "failed",
      workspace: {
        id: workspace.id,
        name: workspace.name,
        agentBackend: workspace.agentBackend as any,
        sandboxKind: workspace.sandboxKind as any,
      },
      message: `Forwarding failed: ${String(err).slice(0, 200)}`,
    };
  }
}