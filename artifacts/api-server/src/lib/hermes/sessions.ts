/**
 * Hermes session recorder.
 *
 * Every orchestrated goal that completes (or fails) lands a row in
 * hermes_sessions. The transcript + outcome is the raw material the skill
 * distiller consumes to produce reusable skills.
 *
 * Recording is best-effort: failures are logged, never thrown, so a broken
 * Hermes write can never break a successful operator goal.
 */

import { db } from "@workspace/db";
import { hermesSessionsTable, type HermesSession } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../logger";
import type { RecordSessionInput } from "./types";

export async function recordSession(input: RecordSessionInput): Promise<HermesSession | null> {
  try {
    const [row] = await db
      .insert(hermesSessionsTable)
      .values({
        goal: input.goal,
        channelId: input.channelId ?? null,
        outcome: input.outcome,
        auraReports: input.auraReports as unknown as object,
        toolCalls: input.toolCalls as unknown as object,
        durationMs: input.durationMs ?? null,
        finalAnswer: input.finalAnswer ?? null,
        completedAt: input.completedAt ?? new Date(),
      })
      .returning();
    if (row) {
      logger.info({ sessionId: row.id, outcome: row.outcome, goalLen: input.goal.length }, "hermes: session recorded");
    }
    return row ?? null;
  } catch (err) {
    logger.error({ err }, "hermes: recordSession failed (non-fatal)");
    return null;
  }
}

export async function listRecentSessions(limit = 25): Promise<HermesSession[]> {
  try {
    return await db
      .select()
      .from(hermesSessionsTable)
      .orderBy(desc(hermesSessionsTable.startedAt))
      .limit(limit);
  } catch (err) {
    logger.error({ err }, "hermes: listRecentSessions failed");
    return [];
  }
}

export async function getSessionById(id: number): Promise<HermesSession | null> {
  try {
    const [row] = await db.select().from(hermesSessionsTable).where(eq(hermesSessionsTable.id, id));
    return row ?? null;
  } catch (err) {
    logger.error({ err, id }, "hermes: getSessionById failed");
    return null;
  }
}

export async function searchSessionsByKeyword(query: string, limit = 20): Promise<HermesSession[]> {
  try {
    const needle = `%${query.toLowerCase()}%`;
    const { sql } = await import("drizzle-orm");
    return await db
      .select()
      .from(hermesSessionsTable)
      .where(sql`lower(${hermesSessionsTable.goal}) like ${needle}`)
      .orderBy(desc(hermesSessionsTable.startedAt))
      .limit(limit);
  } catch (err) {
    logger.error({ err, query }, "hermes: searchSessionsByKeyword failed");
    return [];
  }
}