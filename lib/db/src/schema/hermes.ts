import { pgTable, serial, text, integer, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Hermes runtime — persistent schema.
 *
 * Hermes (NousResearch/hermes-agent semantics, ported to TS) provides:
 *   - closed-loop learning: sessions distilled into reusable skills
 *   - skill self-improvement: each run updates success score; promotion/retire thresholds
 *   - cross-session search: keyword + semantic lookup of past sessions
 *   - heartbeat: scheduled nudge to consolidate memory, prune dead skills
 *
 * All state lives in Postgres so it survives Render restarts. No filesystem state.
 */

// ─── hermes_sessions ─────────────────────────────────────────────────────────
// One row per orchestrated goal that completes (or fails). Records the full
// transcript + outcome so future skills can be distilled from real runs.
export const hermesSessionsTable = pgTable(
  "hermes_sessions",
  {
    id: serial("id").primaryKey(),
    goal: text("goal").notNull(),
    channelId: integer("channel_id"),
    outcome: text("outcome").notNull().default("unknown"), // success | partial | failed | interrupted
    auraReports: jsonb("aura_reports").notNull().default([]), // [{agentId, name, result, toolCalls[]}]
    toolCalls: jsonb("tool_calls").notNull().default([]),    // flat tool-call log across AURAs
    durationMs: integer("duration_ms"),
    finalAnswer: text("final_answer"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    outcomeIdx: index("hermes_sessions_outcome_idx").on(t.outcome),
    startedIdx: index("hermes_sessions_started_idx").on(t.startedAt),
  }),
);

// ─── hermes_skills ───────────────────────────────────────────────────────────
// A skill is a reusable tool-call pattern distilled from one or more sessions.
// Example: "scrape a URL, summarize, post to channel" → skill_id = scrape-summarize-post.
// Success score is updated by every hermes_skill_runs row.
export const hermesSkillsTable = pgTable(
  "hermes_skills",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description").notNull(),
    triggerKeywords: text("trigger_keywords").array().notNull().default([]), // for keyword routing
    pattern: jsonb("pattern").notNull().default([]),                          // ordered tool-call template
    preferredAura: integer("preferred_aura"),                                 // agent id to dispatch to
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    successScore: real("success_score").notNull().default(0.5),               // 0..1, EWMA
    status: text("status").notNull().default("candidate"),                    // candidate | active | retired
    sourceSessionId: integer("source_session_id"),                            // which session first created it
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("hermes_skills_status_idx").on(t.status),
    scoreIdx: index("hermes_skills_score_idx").on(t.successScore),
  }),
);

// ─── hermes_skill_runs ───────────────────────────────────────────────────────
// Every time a skill is dispatched, log the outcome. This drives success_score.
export const hermesSkillRunsTable = pgTable(
  "hermes_skill_runs",
  {
    id: serial("id").primaryKey(),
    skillId: integer("skill_id").notNull(),
    sessionId: integer("session_id"),                                          // hermes_sessions.id when applicable
    success: integer("success").notNull().default(0),                          // 1 | 0
    durationMs: integer("duration_ms"),
    error: text("error"),
    ranAt: timestamp("ran_at").notNull().defaultNow(),
  },
  (t) => ({
    skillIdx: index("hermes_skill_runs_skill_idx").on(t.skillId),
    ranAtIdx: index("hermes_skill_runs_ran_at_idx").on(t.ranAt),
  }),
);

// ─── hermes_nudges ───────────────────────────────────────────────────────────
// Heartbeat nudges — periodic reminders Hermes acts on (consolidate memory,
// prune retired skills, summarize stale sessions). Drained by the heartbeat loop.
export const hermesNudgesTable = pgTable(
  "hermes_nudges",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),           // consolidate | prune | summarize | self_check
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"), // pending | done | failed
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    statusIdx: index("hermes_nudges_status_idx").on(t.status),
  }),
);

export const insertHermesSessionSchema = createInsertSchema(hermesSessionsTable).omit({
  id: true,
  startedAt: true,
});
export const insertHermesSkillSchema = createInsertSchema(hermesSkillsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertHermesSkillRunSchema = createInsertSchema(hermesSkillRunsTable).omit({
  id: true,
  ranAt: true,
});
export const insertHermesNudgeSchema = createInsertSchema(hermesNudgesTable).omit({
  id: true,
  createdAt: true,
});

export type HermesSession = typeof hermesSessionsTable.$inferSelect;
export type InsertHermesSession = z.infer<typeof insertHermesSessionSchema>;
export type HermesSkill = typeof hermesSkillsTable.$inferSelect;
export type InsertHermesSkill = z.infer<typeof insertHermesSkillSchema>;
export type HermesSkillRun = typeof hermesSkillRunsTable.$inferSelect;
export type InsertHermesSkillRun = z.infer<typeof insertHermesSkillRunSchema>;
export type HermesNudge = typeof hermesNudgesTable.$inferSelect;
export type InsertHermesNudge = z.infer<typeof insertHermesNudgeSchema>;