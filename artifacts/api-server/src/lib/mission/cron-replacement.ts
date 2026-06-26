/**
 * Cron replacement — converts existing cron jobs into always-on missions.
 *
 * The Mission Kernel can absorb cron jobs because it runs continuously while
 * a mission is active. A cron entry like "every 5m, ping the API" becomes a
 * mission whose plan has a single recurring step:
 *   - engine: hermes, action: memory_search, acceptance: "memory has fresh entry"
 * The kernel keeps it active and re-runs the step on each timer tick.
 *
 * This module is a thin shim — the operator wires cron jobs by calling
 * `cronAsMission(name, schedule, goal)` and we record them as missions
 * that the runtime keeps waking via setInterval.
 */

import { logger } from "../logger";
import { tick } from "./runtime";

interface CronMission {
  name: string;
  goal: string;
  intervalSeconds: number;
  handle: NodeJS.Timeout;
}

const ACTIVE: Map<string, CronMission> = new Map();

export function startCronMission(opts: { name: string; goal: string; intervalSeconds: number; missionId?: number }): { name: string; intervalSeconds: number } | null {
  if (ACTIVE.has(opts.name)) return null;
  // Create a no-op mission row so operators can see it in /api/missions.
  // We don't use the planner here — cron missions are user-defined recurring
  // tasks, not Brain-planned goals.
  void import("./state-store").then(async (mod) => {
    const m = await mod.createMission({ goal: `[cron] ${opts.goal}`, plan: [], engines: ["hermes"], createdBy: "cron" });
    if (!m) return;
    ACTIVE.set(opts.name, {
      name: opts.name,
      goal: opts.goal,
      intervalSeconds: opts.intervalSeconds,
      handle: setInterval(() => {
        void tick(m.id).catch((err) => logger.error({ err, name: opts.name }, "cron mission tick failed"));
      }, opts.intervalSeconds * 1000),
    });
    logger.info({ name: opts.name, missionId: m.id, intervalSeconds: opts.intervalSeconds }, "cron mission started");
  });
  return { name: opts.name, intervalSeconds: opts.intervalSeconds };
}

export function stopCronMission(name: string): boolean {
  const c = ACTIVE.get(name);
  if (!c) return false;
  clearInterval(c.handle);
  ACTIVE.delete(name);
  return true;
}

export function listCronMissions(): Array<{ name: string; goal: string; intervalSeconds: number }> {
  return Array.from(ACTIVE.values()).map((c) => ({ name: c.name, goal: c.goal, intervalSeconds: c.intervalSeconds }));
}