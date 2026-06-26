import { pgTable, serial, text, integer, real, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Mission Kernel — durable, event-driven runtime.
 *
 * `missions` is the persistent record of every active or historical mission.
 * A mission progresses through statuses:
 *
 *   new → planned → executing ↔ verifying → completed
 *                    ↘ blocked → waiting → executing (resumed)
 *                    ↘ failed (after max attempts)
 *                    ↘ cancelled (operator override)
 *
 * The state machine and Evidence[] are kept inside `verification` jsonb so we
 * can evolve the in-memory shape without a schema migration. `plan` is also
 * jsonb — the planner can add/remove steps per mission type.
 *
 * `progress` is 0..1, the fraction of `acceptance` criteria satisfied.
 * `confidence` is 0..1, the weighted truth strength from Evidence[].label.
 */

export const missionsTable = pgTable(
  "missions",
  {
    id: serial("id").primaryKey(),
    goal: text("goal").notNull(),
    desiredState: jsonb("desired_state").notNull().default({}),
    currentState: jsonb("current_state").notNull().default({}),
    plan: jsonb("plan").notNull().default([]),
    context: jsonb("context").notNull().default({}),
    memoryKeys: text("memory_keys").array().notNull().default([]),
    engines: text("engines").array().notNull().default([]),
    attempts: integer("attempts").notNull().default(0),
    confidence: real("confidence").notNull().default(0),
    progress: real("progress").notNull().default(0),
    parentId: integer("parent_id"),
    status: text("status").notNull().default("new"),
    verification: jsonb("verification").notNull().default({}),
    worldSnapshot: jsonb("world_snapshot").notNull().default({}),
    eventQueue: jsonb("event_queue").notNull().default([]),
    lastError: text("last_error"),
    createdBy: text("created_by").notNull().default("operator"),
    startedAt: timestamp("started_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    statusIdx: index("missions_status_idx").on(t.status),
    parentIdx: index("missions_parent_idx").on(t.parentId),
    updatedIdx: index("missions_updated_idx").on(t.updatedAt),
  }),
);

export const missionEventsTable = pgTable(
  "mission_events",
  {
    id: serial("id").primaryKey(),
    missionId: integer("mission_id").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    source: text("source"),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
  },
  (t) => ({
    missionIdx: index("mission_events_mission_idx").on(t.missionId, t.receivedAt),
  }),
);

export const insertMissionSchema = createInsertSchema(missionsTable).omit({
  id: true,
  updatedAt: true,
  attempts: true,
  confidence: true,
  progress: true,
  verification: true,
});
export const insertMissionEventSchema = createInsertSchema(missionEventsTable).omit({
  id: true,
  receivedAt: true,
});

export type Mission = typeof missionsTable.$inferSelect;
export type InsertMission = z.infer<typeof insertMissionSchema>;
export type MissionEvent = typeof missionEventsTable.$inferSelect;
export type InsertMissionEvent = z.infer<typeof insertMissionEventSchema>;

/** In-memory status union — Drizzle's text column carries this. */
export type MissionStatus =
  | "new"
  | "planned"
  | "executing"
  | "verifying"
  | "blocked"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

/** Engine identifier — the worker that knows how to execute a step. */
export type EngineName =
  | "brain"
  | "hermes"
  | "openhands"
  | "crawl4ai"
  | "mem0"
  | "docling"
  | "bos-omega"
  | "http"
  | "shell"
  | "tavily-search";

/** MissionEvent kinds emitted to the bus. Subscribers wake the kernel. */
export type MissionEventKind =
  | "mission.created"
  | "mission.started"
  | "step.dispatched"
  | "step.completed"
  | "step.failed"
  | "engine.failed"
  | "verification.passed"
  | "verification.failed"
  | "retry.scheduled"
  | "mission.blocked"
  | "mission.completed"
  | "mission.failed"
  | "mission.cancelled"
  | "skill.distilled";