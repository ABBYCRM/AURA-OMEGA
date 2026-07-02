/**
 * Hermes runtime — HTTP routes.
 *
 * Exposes the runtime surface to the operator dashboard and to external
 * integrations. Every route is read-only or safe (no destructive ops);
 * destructive ops (skill retirement, nudge injection) require explicit POST.
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import {
  listRecentSessions,
  getSessionById,
  searchSessionsByKeyword,
} from "../lib/hermes/sessions";
import { listSkills, matchSkillForGoal, pruneAndPromote } from "../lib/hermes/skills";
import { runHeartbeat, queueNudge } from "../lib/hermes/heartbeat";

const router = Router();

// GET /api/hermes/status — high-level health + counts.
router.get("/status", async (_req, res) => {
  try {
    const [skills, sessions] = await Promise.all([listSkills({ limit: 100 }), listRecentSessions(25)]);
    const active = skills.filter((s) => s.status === "active");
    const candidates = skills.filter((s) => s.status === "candidate");
    const retired = skills.filter((s) => s.status === "retired");
    return res.json({
      ok: true,
      uptime: process.uptime(),
      skills: {
        total: skills.length,
        active: active.length,
        candidates: candidates.length,
        retired: retired.length,
      },
      sessions: {
        recent: sessions.length,
        lastOutcome: sessions[0]?.outcome ?? null,
        lastGoal: sessions[0]?.goal?.slice(0, 140) ?? null,
        lastStartedAt: sessions[0]?.startedAt ?? null,
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /api/hermes/status failed");
    return res.status(500).json({ ok: false, error: "hermes status failed" });
  }
});

// GET /api/hermes/skills?status=active|candidate|retired
router.get("/skills", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  try {
    const skills = await listSkills({ status, limit: 200 });
    return res.json({ ok: true, count: skills.length, skills });
  } catch (err) {
    logger.error({ err }, "GET /api/hermes/skills failed");
    return res.status(500).json({ ok: false, error: "list skills failed" });
  }
});

// POST /api/hermes/skills/match  { goal: string }
router.post("/skills/match", async (req, res) => {
  const goal = typeof req.body?.goal === "string" ? req.body.goal : "";
  if (!goal.trim()) return res.status(400).json({ ok: false, error: "goal is required" });
  try {
    const match = await matchSkillForGoal(goal);
    return res.json({ ok: true, match });
  } catch (err) {
    logger.error({ err, goal }, "POST /api/hermes/skills/match failed");
    return res.status(500).json({ ok: false, error: "skill match failed" });
  }
});

// GET /api/hermes/sessions?limit=25
router.get("/sessions", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "25"), 10) || 25, 100);
  try {
    const sessions = await listRecentSessions(limit);
    return res.json({ ok: true, count: sessions.length, sessions });
  } catch (err) {
    logger.error({ err }, "GET /api/hermes/sessions failed");
    return res.status(500).json({ ok: false, error: "list sessions failed" });
  }
});

// GET /api/hermes/sessions/:id
router.get("/sessions/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const session = await getSessionById(id);
    if (!session) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, session });
  } catch (err) {
    logger.error({ err, id }, "GET /api/hermes/sessions/:id failed");
    return res.status(500).json({ ok: false, error: "fetch session failed" });
  }
});

// GET /api/hermes/search?q=keyword
router.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q.trim()) return res.status(400).json({ ok: false, error: "q is required" });
  try {
    const sessions = await searchSessionsByKeyword(q, 25);
    return res.json({ ok: true, count: sessions.length, sessions });
  } catch (err) {
    logger.error({ err, q }, "GET /api/hermes/search failed");
    return res.status(500).json({ ok: false, error: "search failed" });
  }
});

// POST /api/hermes/heartbeat — manual trigger for tests + operator button.
router.post("/heartbeat", async (_req, res) => {
  try {
    const report = await runHeartbeat();
    return res.json({ ok: true, report });
  } catch (err) {
    logger.error({ err }, "POST /api/hermes/heartbeat failed");
    return res.status(500).json({ ok: false, error: "heartbeat failed" });
  }
});

// POST /api/hermes/promote — run the prune/promote sweep on demand.
router.post("/promote", async (_req, res) => {
  try {
    const { promoted, retired } = await pruneAndPromote();
    return res.json({ ok: true, promoted, retired });
  } catch (err) {
    logger.error({ err }, "POST /api/hermes/promote failed");
    return res.status(500).json({ ok: false, error: "promote failed" });
  }
});

// POST /api/hermes/nudges { kind, payload? } — queue a nudge.
router.post("/nudges", async (req, res) => {
  const kind = String(req.body?.kind ?? "");
  const allowed = ["consolidate", "prune", "summarize", "self_check"];
  if (!allowed.includes(kind)) return res.status(400).json({ ok: false, error: "invalid kind" });
  const payload = (req.body?.payload ?? {}) as Record<string, unknown>;
  try {
    await queueNudge(kind as any, payload);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, kind }, "POST /api/hermes/nudges failed");
    return res.status(500).json({ ok: false, error: "queue nudge failed" });
  }
});

export default router;