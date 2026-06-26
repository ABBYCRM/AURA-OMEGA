/**
 * OpenHands event log + tool-run reinforcement.
 *
 * Events are append-only (state-sourced model from OpenHands app_server).
 * Each session has a monotonically-increasing `sequence` per session so
 * events can be replayed in order.
 *
 * Tool runs are split out for fast reinforcement queries (per-tool success
 * rate) without scanning the full event log.
 */

import { db } from "@workspace/db";
import {
  openhandsEventsTable,
  openhandsToolRunsTable,
  type OpenhandsEvent,
  type OpenhandsToolRun,
} from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { logger } from "../logger";
import type { RecordEventInput, RecordToolRunInput } from "./types";

export async function appendEvent(input: RecordEventInput): Promise<OpenhandsEvent | null> {
  try {
    const [row] = await db
      .insert(openhandsEventsTable)
      .values({
        sessionId: input.sessionId,
        kind: input.kind,
        role: input.role ?? null,
        payload: (input.payload ?? {}) as object,
        sequence: input.sequence,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId, kind: input.kind }, "openhands: appendEvent failed");
    return null;
  }
}

export async function listEvents(sessionId: number, limit = 200): Promise<OpenhandsEvent[]> {
  try {
    return await db
      .select()
      .from(openhandsEventsTable)
      .where(eq(openhandsEventsTable.sessionId, sessionId))
      .orderBy(openhandsEventsTable.sequence)
      .limit(limit);
  } catch (err) {
    logger.error({ err, sessionId }, "openhands: listEvents failed");
    return [];
  }
}

export async function nextSequence(sessionId: number): Promise<number> {
  try {
    const [row] = await db
      .select({ maxSeq: sql<number>`COALESCE(MAX(${openhandsEventsTable.sequence}), 0)` })
      .from(openhandsEventsTable)
      .where(eq(openhandsEventsTable.sessionId, sessionId));
    return (row?.maxSeq ?? 0) + 1;
  } catch (err) {
    logger.error({ err, sessionId }, "openhands: nextSequence failed");
    return 1;
  }
}

export async function recordToolRun(input: RecordToolRunInput): Promise<OpenhandsToolRun | null> {
  try {
    const [row] = await db
      .insert(openhandsToolRunsTable)
      .values({
        sessionId: input.sessionId,
        toolName: input.toolName,
        args: (input.args ?? {}) as object,
        resultSummary: input.resultSummary ?? null,
        success: input.success ? 1 : 0,
        durationMs: input.durationMs ?? null,
        error: input.error ?? null,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId, tool: input.toolName }, "openhands: recordToolRun failed");
    return null;
  }
}

export interface ToolSuccessStats {
  toolName: string;
  total: number;
  successes: number;
  successRate: number;
}

export async function toolSuccessRates(): Promise<ToolSuccessStats[]> {
  try {
    const rows = await db
      .select({
        toolName: openhandsToolRunsTable.toolName,
        success: sql<number>`SUM(${openhandsToolRunsTable.success})`,
        total: sql<number>`COUNT(*)`,
      })
      .from(openhandsToolRunsTable)
      .groupBy(openhandsToolRunsTable.toolName);
    return rows.map((r) => ({
      toolName: r.toolName,
      total: Number(r.total ?? 0),
      successes: Number(r.success ?? 0),
      successRate: Number(r.total ?? 0) > 0 ? Number(r.success ?? 0) / Number(r.total ?? 0) : 0,
    }));
  } catch (err) {
    logger.error({ err }, "openhands: toolSuccessRates failed");
    return [];
  }
}