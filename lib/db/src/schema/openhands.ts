import { pgTable, serial, text, integer, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * OpenHands runtime — persistent schema (PARALLEL subsystem).
 *
 * Port of OpenHands' Agent Canvas / app_server concepts to AURA-OMEGA's TS
 * stack. OpenHands is invoked as a separate coding-runtime when the
 * orchestrator decides a goal benefits from its sandboxed execution,
 * persistent workspace, and event-sourced conversation model.
 *
 * This schema is INTENTIONALLY ORTHOGONAL to hermes_* and bos_* tables —
 * the user-designed orchestrator (planned separately) decides when each
 * runtime runs, in series or in parallel.
 *
 * Tables:
 * - openhands_workspaces: one row per coding workspace (a git repo + sandbox config).
 * - openhands_sessions: one row per goal dispatched to OpenHands.
 * - openhands_events: event log (state machine messages, tool calls, observations).
 * - openhands_tool_runs: per-tool-call reinforcement data (success/failure + duration).
 */

export const openhandsWorkspacesTable = pgTable(
  "openhands_workspaces",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description"),
    repoUrl: text("repo_url"),
    baseBranch: text("base_branch").default("main"),
    sandboxKind: text("sandbox_kind").notNull().default("local"), // local | docker | remote | e2b
    sandboxConfig: jsonb("sandbox_config").notNull().default({}),
    agentBackend: text("agent_backend").notNull().default("openhands"), // openhands | claude-code | codex | gemini | custom
    status: text("status").notNull().default("ready"), // ready | busy | archived
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("openhands_workspaces_status_idx").on(t.status),
  }),
);

export const openhandsSessionsTable = pgTable(
  "openhands_sessions",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    goal: text("goal").notNull(),
    channelId: integer("channel_id"),
    parentSessionId: integer("parent_session_id"), // for forked / continued sessions
    status: text("status").notNull().default("queued"), // queued | running | awaiting_input | success | partial | failed | interrupted
    outcome: text("outcome"),                            // success | partial | failed | interrupted (set on terminal status)
    finalAnswer: text("final_answer"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => ({
    workspaceIdx: index("openhands_sessions_workspace_idx").on(t.workspaceId),
    statusIdx: index("openhands_sessions_status_idx").on(t.status),
    startedIdx: index("openhands_sessions_started_idx").on(t.startedAt),
  }),
);

export const openhandsEventsTable = pgTable(
  "openhands_events",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    kind: text("kind").notNull(),                  // message | tool_call | observation | state_delta | system
    role: text("role"),                            // user | assistant | system | tool (when applicable)
    payload: jsonb("payload").notNull().default({}),
    sequence: integer("sequence").notNull(),        // monotonically increasing per session
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("openhands_events_session_idx").on(t.sessionId),
    sessionSeqIdx: index("openhands_events_session_seq_idx").on(t.sessionId, t.sequence),
  }),
);

export const openhandsToolRunsTable = pgTable(
  "openhands_tool_runs",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    toolName: text("tool_name").notNull(),         // shell | edit | browse | ipython | delegate | ...
    args: jsonb("args").notNull().default({}),
    resultSummary: text("result_summary"),
    success: integer("success").notNull().default(0),
    durationMs: integer("duration_ms"),
    error: text("error"),
    ranAt: timestamp("ran_at").notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("openhands_tool_runs_session_idx").on(t.sessionId),
    toolIdx: index("openhands_tool_runs_tool_idx").on(t.toolName),
  }),
);

export const insertOpenhandsWorkspaceSchema = createInsertSchema(openhandsWorkspacesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertOpenhandsSessionSchema = createInsertSchema(openhandsSessionsTable).omit({
  id: true,
  startedAt: true,
});
export const insertOpenhandsEventSchema = createInsertSchema(openhandsEventsTable).omit({
  id: true,
  occurredAt: true,
});
export const insertOpenhandsToolRunSchema = createInsertSchema(openhandsToolRunsTable).omit({
  id: true,
  ranAt: true,
});

export type OpenhandsWorkspace = typeof openhandsWorkspacesTable.$inferSelect;
export type InsertOpenhandsWorkspace = z.infer<typeof insertOpenhandsWorkspaceSchema>;
export type OpenhandsSession = typeof openhandsSessionsTable.$inferSelect;
export type InsertOpenhandsSession = z.infer<typeof insertOpenhandsSessionSchema>;
export type OpenhandsEvent = typeof openhandsEventsTable.$inferSelect;
export type InsertOpenhandsEvent = z.infer<typeof insertOpenhandsEventSchema>;
export type OpenhandsToolRun = typeof openhandsToolRunsTable.$inferSelect;
export type InsertOpenhandsToolRun = z.infer<typeof insertOpenhandsToolRunSchema>;