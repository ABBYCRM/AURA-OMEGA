/**
 * Mission Kernel HTTP routes.
 *
 *   GET    /api/missions                — list missions
 *   POST   /api/missions                — create from goal (plans + dispatches first tick)
 *   GET    /api/missions/:id            — mission + recent events
 *   POST   /api/missions/:id/cancel    — operator cancel
 *   POST   /api/missions/:id/retry     — manually re-run a blocked mission
 *   GET    /api/missions/stats         — aggregate counts
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import {
  createMission,
  getMission,
  listMissions,
  eventsForMission,
  missionStats,
  updateMissionState,
} from "../lib/mission/state-store";
import { tick } from "../lib/mission/runtime";
import { buildMissionSteps } from "../lib/mission/planner";
import { emit } from "../lib/mission/event-bus";
import type { MissionStatus } from "@workspace/db";

export const missionsRouter: Router = Router();

missionsRouter.get("/stats", async (_req, res) => {
  try {
    const s = await missionStats();
    res.json({ ok: true, ...s });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err as Error).message) });
  }
});

missionsRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? (req.query.status as MissionStatus) : undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  try {
    const list = await listMissions({ status, limit });
    res.json({ ok: true, count: list.length, missions: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err as Error).message) });
  }
});

missionsRouter.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const goal = String(body.goal ?? "").trim();
  if (!goal) return res.status(400).json({ ok: false, error: "goal required" });

  // Pre-plan via Brain so the mission starts with a real plan.
  const { steps, brain } = buildMissionSteps(goal);
  if (brain.gate === "ABORT") {
    return res.status(400).json({ ok: false, error: "rejected by tri-state gate", gate: brain.gate });
  }
  if (brain.gate === "HOLD") {
    return res.status(400).json({ ok: false, error: "blocked by tri-state gate (missing info or unsafe)", gate: brain.gate });
  }

  try {
    const m = await createMission({
      goal,
      plan: steps,
      engines: Array.from(new Set(steps.map((s) => s.engine))),
      context: { taskType: brain.taskType },
      createdBy: String(body.createdBy ?? "operator"),
    });
    if (!m) return res.status(500).json({ ok: false, error: "create failed" });

    await emit("mission.created", m.id, { goal, stepCount: steps.length, taskType: brain.taskType }, "api");

    // Kick the first tick in the background — don't block the response.
    setImmediate(() => { void tick(m.id).catch((err) => logger.error({ err, missionId: m.id }, "mission first tick failed")); });

    res.status(201).json({ ok: true, mission: m, plan: steps, brainGate: brain.gate });
  } catch (err) {
    logger.error({ err }, "POST /api/missions failed");
    res.status(500).json({ ok: false, error: "create failed" });
  }
});

missionsRouter.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const m = await getMission(id);
    if (!m) return res.status(404).json({ ok: false, error: "not found" });
    const events = await eventsForMission(id, 50);
    res.json({ ok: true, mission: m, events });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err as Error).message) });
  }
});

missionsRouter.post("/:id/cancel", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const m = await updateMissionState(id, { status: "cancelled", completedAt: new Date() });
    if (!m) return res.status(404).json({ ok: false, error: "not found" });
    await emit("mission.cancelled", id, { at: new Date().toISOString() }, "api");
    res.json({ ok: true, mission: m });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err as Error).message) });
  }
});

missionsRouter.post("/:id/retry", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const m = await getMission(id);
    if (!m) return res.status(404).json({ ok: false, error: "not found" });
    if (!["blocked", "failed"].includes(m.status)) {
      return res.status(400).json({ ok: false, error: `cannot retry mission in status=${m.status}` });
    }
    await updateMissionState(id, { status: "executing", attempts: 0, lastError: null });
    await emit("mission.started", id, { retry: true }, "api");
    setImmediate(() => { void tick(id).catch((err) => logger.error({ err, missionId: id }, "retry tick failed")); });
    res.json({ ok: true, mission: m });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err as Error).message) });
  }
});