/**
 * OpenHands session lifecycle.
 *
 * A session is one goal dispatched to OpenHands. The session goes through:
 *   queued -> running -> (awaiting_input | success | partial | failed | interrupted)
 *
 * Recording is best-effort: failures are logged, never thrown, so a broken
 * OpenHands write can never break the calling context.
 */

import { db } from "@workspace/db";
import {
  openhandsSessionsTable,
  type OpenhandsSession,
} from "@workspace/db";
import { eq, sql, desc, and, or } from "drizzle-orm";
import { logger } from "../logger";
import type {
  CreateSessionInput,
  OpenhandsOutcome,
  OpenhandsSessionStatus,
} from "./types";

export async function createSession(input: CreateSessionInput): Promise<OpenhandsSession | null> {
  try {
    const [row] = await db
      .insert(openhandsSessionsTable)
      .values({
        workspaceId: input.workspaceId,
        goal: input.goal,
        channelId: input.channelId ?? null,
        parentSessionId: input.parentSessionId ?? null,
        status: "queued",
        metadata: (input.metadata ?? {}) as object,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err, workspaceId: input.workspaceId }, "openhands: createSession failed");
    return null;
  }
}

export async function setSessionStatus(
  sessionId: number,
  status: OpenhandsSessionStatus,
  outcome?: OpenhandsOutcome,
  finalAnswer?: string,
): Promise<void> {
  try {
    const isTerminal = ["success", "partial", "failed", "interrupted"].includes(status);
    const patch: Record<string, unknown> = { status };
    if (outcome) patch.outcome = outcome;
    if (finalAnswer != null) patch.finalAnswer = finalAnswer;
    if (isTerminal) {
      patch.completedAt = new Date();
      // Compute duration client-side as a best-effort; the runner can also
      // pass durationMs explicitly via the events log.
      const [current] = await db
        .select({ startedAt: openhandsSessionsTable.startedAt })
        .from(openhandsSessionsTable)
        .where(eq(openhandsSessionsTable.id, sessionId));
      if (current?.startedAt) {
        patch.durationMs = Date.now() - new Date(current.startedAt).getTime();
      }
    }
    await db.update(openhandsSessionsTable).set(patch).where(eq(openhandsSessionsTable.id, sessionId));
  } catch (err) {
    logger.error({ err, sessionId, status }, "openhands: setSessionStatus failed");
  }
}

export async function listSessions(opts: {
  workspaceId?: number;
  status?: string;
  limit?: number;
} = {}): Promise<OpenhandsSession[]> {
  try {
    const filters = [];
    if (opts.workspaceId != null) {
      filters.push(eq(openhandsSessionsTable.workspaceId, opts.workspaceId));
    }
    if (opts.status) {
      filters.push(eq(openhandsSessionsTable.status, opts.status));
    }
    const where = filters.length > 0 ? and(...filters) : undefined;
    return await db
      .select()
      .from(openhandsSessionsTable)
      .where(where as any)
      .orderBy(desc(openhandsSessionsTable.startedAt))
      .limit(opts.limit ?? 50);
  } catch (err) {
    logger.error({ err }, "openhands: listSessions failed");
    return [];
  }
}

export async function getSessionById(id: number): Promise<OpenhandsSession | null> {
  try {
    const [row] = await db
      .select()
      .from(openhandsSessionsTable)
      .where(eq(openhandsSessionsTable.id, id));
    return row ?? null;
  } catch (err) {
    logger.error({ err, id }, "openhands: getSessionById failed");
    return null;
  }
}