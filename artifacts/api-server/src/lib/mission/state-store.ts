/**
 * Mission state store — CRUD over missions + mission_events tables.
 */

import { db } from "@workspace/db";
import {
  missionsTable,
  missionEventsTable,
  type Mission,
  type InsertMission,
  type MissionEvent,
  type InsertMissionEvent,
  type MissionStatus,
} from "@workspace/db";
import { eq, desc, and, sql, count } from "drizzle-orm";
import type { MissionStep, MissionVerification } from "./types";

export async function createMission(input: {
  goal: string;
  plan?: MissionStep[];
  engines?: string[];
  desiredState?: Record<string, unknown>;
  context?: Record<string, unknown>;
  parentId?: number | null;
  createdBy?: string;
}): Promise<Mission | null> {
  try {
    const [row] = await db
      .insert(missionsTable)
      .values({
        goal: input.goal,
        plan: (input.plan ?? []) as unknown as object,
        engines: input.engines ?? [],
        desiredState: (input.desiredState ?? {}) as object,
        context: (input.context ?? {}) as object,
        parentId: input.parentId ?? null,
        createdBy: input.createdBy ?? "operator",
        status: "planned",
        startedAt: new Date(),
      })
      .returning();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function getMission(id: number): Promise<Mission | null> {
  try {
    const [row] = await db.select().from(missionsTable).where(eq(missionsTable.id, id));
    return row ?? null;
  } catch {
    return null;
  }
}

export async function listMissions(opts: { status?: MissionStatus; limit?: number } = {}): Promise<Mission[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const where = opts.status ? eq(missionsTable.status, opts.status) : undefined;
  return db
    .select()
    .from(missionsTable)
    .where(where)
    .orderBy(desc(missionsTable.updatedAt))
    .limit(limit);
}

export async function updateMissionState(
  id: number,
  patch: Partial<Pick<Mission, "status" | "currentState" | "verification" | "progress" | "confidence" | "attempts" | "lastError" | "completedAt" | "worldSnapshot" | "eventQueue" | "memoryKeys">>,
): Promise<Mission | null> {
  try {
    const [row] = await db
      .update(missionsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(missionsTable.id, id))
      .returning();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function appendPlanStep(id: number, step: MissionStep): Promise<Mission | null> {
  try {
    const m = await getMission(id);
    if (!m) return null;
    const plan = ((m.plan ?? []) as unknown as MissionStep[]);
    const next = [...plan, { ...step, index: plan.length }];
    const [row] = await db
      .update(missionsTable)
      .set({ plan: next as unknown as object, updatedAt: new Date() })
      .where(eq(missionsTable.id, id))
      .returning();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function recordEvent(input: InsertMissionEvent): Promise<MissionEvent | null> {
  try {
    const [row] = await db.insert(missionEventsTable).values(input).returning();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function eventsForMission(missionId: number, limit = 50): Promise<MissionEvent[]> {
  return db
    .select()
    .from(missionEventsTable)
    .where(eq(missionEventsTable.missionId, missionId))
    .orderBy(desc(missionEventsTable.receivedAt))
    .limit(limit);
}

export async function missionStats(): Promise<{
  total: number;
  active: number;
  completed: number;
  failed: number;
  blocked: number;
  averageConfidence: number;
}> {
  try {
    const counts = await db
      .select({ status: missionsTable.status, total: sql<number>`COUNT(*)` })
      .from(missionsTable)
      .groupBy(missionsTable.status);
    const conf = await db
      .select({ avg: sql<number>`AVG(${missionsTable.confidence})` })
      .from(missionsTable);
    const by = (s: MissionStatus) => Number(counts.find((c) => c.status === s)?.total ?? 0);
    return {
      total: counts.reduce((a, b) => a + Number(b.total), 0),
      active: by("executing") + by("verifying") + by("waiting"),
      completed: by("completed"),
      failed: by("failed"),
      blocked: by("blocked"),
      averageConfidence: Number(conf[0]?.avg ?? 0),
    };
  } catch {
    return { total: 0, active: 0, completed: 0, failed: 0, blocked: 0, averageConfidence: 0 };
  }
}