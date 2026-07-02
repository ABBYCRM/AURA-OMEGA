/**
 * OpenHands runtime — HTTP routes.
 *
 * Mounted at /api/openhands (NO requireOperator gate — operator-configurable
 * runtime, callable from the orchestrator). Destructive ops (workspace
 * archive) require explicit POST.
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import {
  createWorkspace,
  listWorkspaces,
  getWorkspaceById,
  setWorkspaceStatus,
  listSessions,
  getSessionById,
  setSessionStatus,
  appendEvent,
  listEvents,
  nextSequence,
  recordToolRun,
  toolSuccessRates,
  dispatchGoal,
} from "../lib/openhands";

const router = Router();

function asInt(v: unknown, fallback: number): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

router.get("/status", (_req, res) => {
  const upstream = process.env["OPENHANDS_BASE_URL"] ?? null;
  return res.json({
    ok: true,
    upstream,
    upstreamConfigured: !!upstream,
    apiKeyConfigured: !!process.env["OPENHANDS_API_KEY"],
  });
});

// ─── Workspaces ──────────────────────────────────────────────────────────────
router.get("/workspaces", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = asInt(req.query.limit, 100);
  try {
    const workspaces = await listWorkspaces({ status, limit });
    return res.json({ ok: true, count: workspaces.length, workspaces });
  } catch (err) {
    logger.error({ err }, "GET /api/openhands/workspaces failed");
    return res.status(500).json({ ok: false, error: "list workspaces failed" });
  }
});

router.post("/workspaces", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "name is required" });
  try {
    const ws = await createWorkspace({
      name,
      description: (body.description as string | undefined) ?? null,
      repoUrl: (body.repoUrl as string | undefined) ?? null,
      baseBranch: (body.baseBranch as string | undefined) ?? "main",
      sandboxKind: (body.sandboxKind as any) ?? "local",
      sandboxConfig: (body.sandboxConfig as Record<string, unknown>) ?? {},
      agentBackend: (body.agentBackend as any) ?? "openhands",
    });
    if (!ws) return res.status(500).json({ ok: false, error: "create failed" });
    return res.status(201).json({ ok: true, workspace: ws });
  } catch (err) {
    logger.error({ err }, "POST /api/openhands/workspaces failed");
    return res.status(500).json({ ok: false, error: "create failed" });
  }
});

router.get("/workspaces/:id", async (req, res) => {
  const id = asInt(req.params.id, NaN);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const ws = await getWorkspaceById(id);
    if (!ws) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, workspace: ws });
  } catch (err) {
    logger.error({ err, id }, "GET /api/openhands/workspaces/:id failed");
    return res.status(500).json({ ok: false, error: "fetch failed" });
  }
});

router.post("/workspaces/:id/status", async (req, res) => {
  const id = asInt(req.params.id, NaN);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  const status = String(req.body?.status ?? "");
  if (!["ready", "busy", "archived"].includes(status)) {
    return res.status(400).json({ ok: false, error: "invalid status" });
  }
  try {
    await setWorkspaceStatus(id, status as any);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id, status }, "POST /api/openhands/workspaces/:id/status failed");
    return res.status(500).json({ ok: false, error: "update failed" });
  }
});

// ─── Sessions ────────────────────────────────────────────────────────────────
router.get("/sessions", async (req, res) => {
  const workspaceId = req.query.workspaceId ? asInt(req.query.workspaceId, NaN) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = asInt(req.query.limit, 50);
  try {
    const sessions = await listSessions({
      workspaceId: Number.isFinite(workspaceId) ? workspaceId : undefined,
      status,
      limit,
    });
    return res.json({ ok: true, count: sessions.length, sessions });
  } catch (err) {
    logger.error({ err }, "GET /api/openhands/sessions failed");
    return res.status(500).json({ ok: false, error: "list sessions failed" });
  }
});

router.post("/sessions/dispatch", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const workspaceId = asInt(body.workspaceId, NaN);
  const goal = String(body.goal ?? "").trim();
  if (!Number.isFinite(workspaceId)) return res.status(400).json({ ok: false, error: "workspaceId required" });
  if (!goal) return res.status(400).json({ ok: false, error: "goal required" });
  try {
    const result = await dispatchGoal({
      workspaceId,
      goal,
      channelId: body.channelId != null ? asInt(body.channelId, NaN) : null,
      parentSessionId: body.parentSessionId != null ? asInt(body.parentSessionId, NaN) : null,
      metadata: (body.metadata as Record<string, unknown>) ?? {},
    });
    if (!result) return res.status(404).json({ ok: false, error: "workspace not found or archived" });
    return res.status(result.status === "failed" ? 502 : 201).json({ ok: true, result });
  } catch (err) {
    logger.error({ err }, "POST /api/openhands/sessions/dispatch failed");
    return res.status(500).json({ ok: false, error: "dispatch failed" });
  }
});

router.get("/sessions/:id", async (req, res) => {
  const id = asInt(req.params.id, NaN);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const session = await getSessionById(id);
    if (!session) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, session });
  } catch (err) {
    logger.error({ err, id }, "GET /api/openhands/sessions/:id failed");
    return res.status(500).json({ ok: false, error: "fetch failed" });
  }
});

router.post("/sessions/:id/status", async (req, res) => {
  const id = asInt(req.params.id, NaN);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  const status = String(req.body?.status ?? "");
  const outcome = req.body?.outcome ? String(req.body.outcome) : undefined;
  const finalAnswer = req.body?.finalAnswer != null ? String(req.body.finalAnswer) : undefined;
  const allowed = ["queued", "running", "awaiting_input", "success", "partial", "failed", "interrupted"];
  if (!allowed.includes(status)) return res.status(400).json({ ok: false, error: "invalid status" });
  try {
    await setSessionStatus(id, status as any, outcome as any, finalAnswer);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id }, "POST /api/openhands/sessions/:id/status failed");
    return res.status(500).json({ ok: false, error: "update failed" });
  }
});

// ─── Events ─────────────────────────────────────────────────────────────────
router.get("/sessions/:id/events", async (req, res) => {
  const id = asInt(req.params.id, NaN);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  const limit = asInt(req.query.limit, 200);
  try {
    const events = await listEvents(id, limit);
    return res.json({ ok: true, count: events.length, events });
  } catch (err) {
    logger.error({ err, id }, "GET /api/openhands/sessions/:id/events failed");
    return res.status(500).json({ ok: false, error: "list events failed" });
  }
});

router.post("/sessions/:id/events", async (req, res) => {
  const id = asInt(req.params.id, NaN);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const kind = String(body.kind ?? "");
  const allowedKinds = ["message", "tool_call", "observation", "state_delta", "system"];
  if (!allowedKinds.includes(kind)) return res.status(400).json({ ok: false, error: "invalid kind" });
  let sequence = asInt(body.sequence, 0);
  if (!sequence) sequence = await nextSequence(id);
  try {
    const event = await appendEvent({
      sessionId: id,
      kind: kind as any,
      role: (body.role as any) ?? undefined,
      payload: (body.payload as Record<string, unknown>) ?? {},
      sequence,
    });
    if (!event) return res.status(500).json({ ok: false, error: "append failed" });
    return res.status(201).json({ ok: true, event });
  } catch (err) {
    logger.error({ err, id }, "POST /api/openhands/sessions/:id/events failed");
    return res.status(500).json({ ok: false, error: "append failed" });
  }
});

// ─── Tool runs (for reinforcement / future skill distillation) ──────────────
router.post("/sessions/:id/tool-runs", async (req, res) => {
  const id = asInt(req.params.id, NaN);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const toolName = String(body.toolName ?? "").trim();
  const success = Boolean(body.success);
  if (!toolName) return res.status(400).json({ ok: false, error: "toolName required" });
  try {
    const run = await recordToolRun({
      sessionId: id,
      toolName,
      args: (body.args as Record<string, unknown>) ?? {},
      resultSummary: (body.resultSummary as string | undefined) ?? null,
      success,
      durationMs: body.durationMs != null ? asInt(body.durationMs, 0) : null,
      error: (body.error as string | undefined) ?? null,
    });
    if (!run) return res.status(500).json({ ok: false, error: "record failed" });
    return res.status(201).json({ ok: true, run });
  } catch (err) {
    logger.error({ err, id }, "POST /api/openhands/sessions/:id/tool-runs failed");
    return res.status(500).json({ ok: false, error: "record failed" });
  }
});

router.get("/tool-stats", async (_req, res) => {
  try {
    const stats = await toolSuccessRates();
    return res.json({ ok: true, stats });
  } catch (err) {
    logger.error({ err }, "GET /api/openhands/tool-stats failed");
    return res.status(500).json({ ok: false, error: "stats failed" });
  }
});

export default router;