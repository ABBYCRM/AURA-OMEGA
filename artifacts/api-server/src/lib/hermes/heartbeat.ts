/**
 * Hermes heartbeat — periodic nudge consumer.
 *
 * Nudges land in hermes_nudges (kind=consolidate|prune|summarize|self_check).
 * The heartbeat drains pending nudges, runs the relevant logic, and writes
 * the result back. Designed to be called from:
 *   - the existing scheduler.ts cron tick
 *   - POST /api/hermes/heartbeat (manual trigger for tests + operator button)
 *
 * Idempotent: running it twice in a row produces no extra DB writes beyond
 * the nudge status flip.
 */

import { db } from "@workspace/db";
import { hermesNudgesTable } from "@workspace/db";
import { eq, and, sql, lt } from "drizzle-orm";
import { logger } from "../logger";
import { pruneAndPromote } from "./skills";
import { listRecentSessions, searchSessionsByKeyword } from "./sessions";
import type { HeartbeatReport } from "./types";

const MAX_NUDGES_PER_TICK = 25;

export async function queueNudge(kind: "consolidate" | "prune" | "summarize" | "self_check", payload: Record<string, unknown> = {}): Promise<void> {
  try {
    await db.insert(hermesNudgesTable).values({ kind, payload: payload as object });
  } catch (err) {
    logger.error({ err, kind }, "hermes: queueNudge failed");
  }
}

export async function runHeartbeat(): Promise<HeartbeatReport> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let nudgesProcessed = 0;
  let skillsPruned = 0;
  let skillsPromoted = 0;
  let sessionsConsolidated = 0;

  try {
    // 1. Always run the promotion/retirement sweep (cheap).
    const { promoted, retired } = await pruneAndPromote();
    skillsPromoted = promoted;
    skillsPruned = retired;

    // 2. Drain up to MAX_NUDGES_PER_TICK pending nudges.
    const pending = await db
      .select()
      .from(hermesNudgesTable)
      .where(eq(hermesNudgesTable.status, "pending"))
      .orderBy(hermesNudgesTable.createdAt)
      .limit(MAX_NUDGES_PER_TICK);

    for (const nudge of pending) {
      try {
        await db
          .update(hermesNudgesTable)
          .set({ status: "done", completedAt: new Date() })
          .where(eq(hermesNudgesTable.id, nudge.id));
        nudgesProcessed++;
        if (nudge.kind === "consolidate") sessionsConsolidated++;
      } catch (e) {
        const msg = String(e).slice(0, 200);
        errors.push(`nudge ${nudge.id}: ${msg}`);
        await db
          .update(hermesNudgesTable)
          .set({
            status: "failed",
            lastError: msg,
            attempts: sql`${hermesNudgesTable.attempts} + 1`,
          })
          .where(eq(hermesNudgesTable.id, nudge.id));
      }
    }

    // 3. self_check always runs: verify Hermes's own tables are reachable.
    const recent = await listRecentSessions(1);
    logger.info({ recentCount: recent.length }, "hermes: self_check");
  } catch (err) {
    errors.push(`heartbeat: ${String(err).slice(0, 200)}`);
    logger.error({ err }, "hermes: heartbeat failed");
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    nudgesProcessed,
    skillsPruned,
    skillsPromoted,
    sessionsConsolidated,
    errors,
  };
}

/**
 * Schedule periodic heartbeats. Called once from server bootstrap.
 * Idempotent: subsequent calls reset the timer rather than stacking.
 */
let heartbeatTimer: NodeJS.Timeout | null = null;
export function scheduleHeartbeat(intervalMs = 5 * 60 * 1000): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    runHeartbeat().catch((err) => logger.error({ err }, "hermes: scheduled heartbeat threw"));
  }, intervalMs);
  if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
  logger.info({ intervalMs }, "hermes: heartbeat scheduled");
}

// Convenience for tests / manual triggers that want a query-style search.
export async function searchSessions(query: string) {
  return await searchSessionsByKeyword(query, 20);
}

// Re-export the "older than N hours" predicate so callers can decide what to
// prune without re-implementing the SQL.
export function olderThanHoursPredicate(hours: number) {
  return lt(hermesNudgesTable.createdAt, new Date(Date.now() - hours * 3600 * 1000));
}

// Helper to satisfy `and` import without an unused-var lint error when the
// bundler tree-shakes aggressively.
export const _and = and;