import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "agents" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "role" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'idle' NOT NULL,
  "color" text NOT NULL,
  "avatar_initials" text,
  "model" text,
  "context_used" integer DEFAULT 0 NOT NULL,
  "context_max" integer DEFAULT 128000 NOT NULL,
  "capabilities" text[] DEFAULT '{}' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "channels" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "type" text DEFAULT 'general' NOT NULL,
  "description" text,
  "unread_count" integer DEFAULT 0 NOT NULL,
  "last_activity" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "channel_id" integer NOT NULL,
  "agent_id" integer,
  "agent_name" text,
  "agent_color" text,
  "content" text NOT NULL,
  "message_type" text DEFAULT 'user' NOT NULL,
  "metadata" text,
  "timestamp" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "agent_id" integer,
  "agent_name" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "priority" text DEFAULT 'medium' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "channel_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "monologue_lines" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL,
  "text" text NOT NULL,
  "type" text DEFAULT 'thought' NOT NULL,
  "timestamp" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tool_calls" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL,
  "tool_name" text NOT NULL,
  "args" text,
  "result" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "agent_commands" (
  "id" serial PRIMARY KEY NOT NULL,
  "from_agent_id" integer NOT NULL,
  "to_agent_id" integer,
  "command" text NOT NULL,
  "payload" text,
  "priority" text DEFAULT 'normal' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "result" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "cron_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL,
  "name" text NOT NULL,
  "schedule" text NOT NULL,
  "task" text NOT NULL,
  "payload" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_run_at" timestamp,
  "next_run_at" timestamp,
  "run_count" integer DEFAULT 0 NOT NULL,
  "last_result" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_memory" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL,
  "agent_name" text,
  "key" text,
  "content" text NOT NULL,
  "tags" text,
  "embedding" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Backfill the embedding column on databases created before semantic memory.
ALTER TABLE "agent_memory" ADD COLUMN IF NOT EXISTS "embedding" text;

-- Dispatch observability: model + grounding proof per directive (Dispatch panel).
ALTER TABLE "agent_commands" ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE "agent_commands" ADD COLUMN IF NOT EXISTS "grounding_chars" integer;
ALTER TABLE "agent_commands" ADD COLUMN IF NOT EXISTS "grounding_hash" text;

-- Reclassify historical restart interruptions: a deploy/redeploy killing
-- in-flight work was previously marked 'failed', polluting the failure view as
-- if the AURA failed. Re-tag them 'interrupted' so they stop counting as agent
-- failures (the recovery routine now writes 'interrupted' directly).
UPDATE "agent_commands" SET "status" = 'interrupted'
  WHERE "status" = 'failed' AND "result" LIKE 'Interrupted by server restart%';

CREATE TABLE IF NOT EXISTS "vault_secrets" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "description" text,
  "ciphertext" text NOT NULL,
  "iv" text NOT NULL,
  "auth_tag" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "attachments" (
  "id" serial PRIMARY KEY NOT NULL,
  "filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "kind" text DEFAULT 'other' NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "data" text NOT NULL,
  "extracted_text" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for the hot read paths the dashboard polls every few seconds. Without
-- these, each poll seq-scans + sorts and holds a pool connection longer, which
-- (under concurrent orchestration writes) caused reads to hang and return empty.
CREATE INDEX IF NOT EXISTS "messages_channel_ts_idx" ON "messages" ("channel_id", "timestamp");
CREATE INDEX IF NOT EXISTS "agent_commands_created_idx" ON "agent_commands" ("created_at");
CREATE INDEX IF NOT EXISTS "tool_calls_agent_idx" ON "tool_calls" ("agent_id");
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" ("status");
-- Social posting log — powers the per-platform daily cap + spacing limiter.
CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" serial PRIMARY KEY NOT NULL,
  "platform" text NOT NULL,
  "account" text,
  "permalink" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "social_posts_platform_created_idx" ON "social_posts" ("platform", "created_at");

-- Rename theatrical agent names to clean AURA identifiers (idempotent).
UPDATE "agents" SET "name" = 'AURA-5', "avatar_initials" = 'A5' WHERE "name" = 'MR.NICE';
UPDATE "channels" SET "name" = 'aura-5', "description" = 'AURA-5 social agent channel' WHERE "name" = 'mr-nice';

-- WORLD-00: single-row persistent state for Aura's living world (her position,
-- direction, chapter, path history, breadcrumb clues, enabled flag). Only ONE
-- row (id=1). Stores NO task content — world/render state only.
CREATE TABLE IF NOT EXISTS "world_state" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "chapter" integer DEFAULT 0 NOT NULL,
  "step" integer DEFAULT 0 NOT NULL,
  "hero_x" double precision DEFAULT 75 NOT NULL,
  "hero_y" double precision DEFAULT 4 NOT NULL,
  "direction" text DEFAULT 'down' NOT NULL,
  "trail" text DEFAULT '[]' NOT NULL,
  "last_caption" text,
  "stopped" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
INSERT INTO "world_state" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
`;

// Idempotent by explicit ID — safe to run on any DB state.
const SEED_AGENTS = `
INSERT INTO agents (id, name, role, description, status, color, avatar_initials, model, capabilities)
VALUES
  (1, 'ABBY',   'Orchestrator',  'Master orchestrator and directive router',       'idle', '#00e5ff', 'AB', 'moonshotai/kimi-k2.6',               ARRAY['orchestration','planning','routing']),
  (2, 'AURA-1', 'Code Executor', 'Code generation and execution specialist',       'idle', '#bf00ff', 'A1', 'moonshotai/kimi-k2.6',               ARRAY['code','execution','debugging']),
  (3, 'AURA-2', 'Browser Agent', 'Web browsing and scraping via Steel',            'idle', '#0066ff', 'A2', 'meta/llama-3.3-70b-instruct',        ARRAY['browser','scraping','research']),
  (4, 'AURA-3', 'Memory & RAG',  'Long-term memory and retrieval',                 'idle', '#00cc88', 'A3', 'meta/llama-3.3-70b-instruct',        ARRAY['memory','rag','search']),
  (5, 'AURA-4', 'API Connector', 'External API integration and automation',        'idle', '#ff6b00', 'A4', 'moonshotai/kimi-k2.6',               ARRAY['api','integration','automation']),
  (6, 'AURA-5', 'Social Agent',  'Social media and communications specialist',     'idle', '#ff2d78', 'A5', 'meta/llama-3.3-70b-instruct',        ARRAY['social','communications','engagement'])
ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  role            = EXCLUDED.role,
  color           = EXCLUDED.color,
  avatar_initials = EXCLUDED.avatar_initials,
  model           = EXCLUDED.model
`;

// Idempotent by name — safe to run on any DB state.
const SEED_CHANNELS = `
INSERT INTO channels (name, type, description)
VALUES
  ('general', 'general', 'General swarm communications'),
  ('abby',    'agent',   'ABBY orchestrator channel'),
  ('aura-1',  'agent',   'AURA-1 code executor channel'),
  ('aura-2',  'agent',   'AURA-2 browser agent channel'),
  ('aura-3',  'agent',   'AURA-3 memory channel'),
  ('aura-4',  'agent',   'AURA-4 API connector channel'),
  ('aura-5',  'agent',   'AURA-5 social agent channel')
ON CONFLICT (name) DO NOTHING
`;

// Real executable tools each agent can call (mirrors AGENT_TOOLS in tools.ts).
// Synced into agents.capabilities so the dashboard Inspector reflects the tools
// each AURA actually wields.
const AGENT_CAPABILITIES: Record<number, string[]> = {
  1: ["web_scrape", "web_screenshot", "http_request", "code_exec", "memory_write", "memory_search"],
  2: ["code_exec", "http_request", "web_scrape", "memory_search", "memory_write"],
  3: ["web_scrape", "web_screenshot", "http_request", "memory_search", "memory_write"],
  4: ["memory_write", "memory_search", "web_scrape", "http_request"],
  5: ["http_request", "web_scrape", "code_exec", "memory_search", "memory_write"],
  6: ["web_scrape", "http_request", "memory_search", "memory_write"],
};

// Hermes runtime schema — sessions, skills, skill runs, nudges. Idempotent.
const HERMES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "hermes_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "goal" text NOT NULL,
  "channel_id" integer,
  "outcome" text DEFAULT 'unknown' NOT NULL,
  "aura_reports" jsonb DEFAULT '[]' NOT NULL,
  "tool_calls" jsonb DEFAULT '[]' NOT NULL,
  "duration_ms" integer,
  "final_answer" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
CREATE INDEX IF NOT EXISTS "hermes_sessions_outcome_idx" ON "hermes_sessions" ("outcome");
CREATE INDEX IF NOT EXISTS "hermes_sessions_started_idx" ON "hermes_sessions" ("started_at");

CREATE TABLE IF NOT EXISTS "hermes_skills" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "description" text NOT NULL,
  "trigger_keywords" text[] DEFAULT '{}' NOT NULL,
  "pattern" jsonb DEFAULT '[]' NOT NULL,
  "preferred_aura" integer,
  "success_count" integer DEFAULT 0 NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "success_score" real DEFAULT 0.5 NOT NULL,
  "status" text DEFAULT 'candidate' NOT NULL,
  "source_session_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "hermes_skills_status_idx" ON "hermes_skills" ("status");
CREATE INDEX IF NOT EXISTS "hermes_skills_score_idx" ON "hermes_skills" ("success_score");

CREATE TABLE IF NOT EXISTS "hermes_skill_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "skill_id" integer NOT NULL,
  "session_id" integer,
  "success" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer,
  "error" text,
  "ran_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "hermes_skill_runs_skill_idx" ON "hermes_skill_runs" ("skill_id");
CREATE INDEX IF NOT EXISTS "hermes_skill_runs_ran_at_idx" ON "hermes_skill_runs" ("ran_at");

CREATE TABLE IF NOT EXISTS "hermes_nudges" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "payload" jsonb DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
CREATE INDEX IF NOT EXISTS "hermes_nudges_status_idx" ON "hermes_nudges" ("status");
`;

// OpenHands runtime schema — workspaces, sessions, events, tool runs.
// Idempotent, parallels the hermes_* schema. The user-designed orchestrator
// decides which runtime (Hermes / OpenHands / others) runs when.
const OPENHANDS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "openhands_workspaces" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "description" text,
  "repo_url" text,
  "base_branch" text DEFAULT 'main',
  "sandbox_kind" text DEFAULT 'local' NOT NULL,
  "sandbox_config" jsonb DEFAULT '{}' NOT NULL,
  "agent_backend" text DEFAULT 'openhands' NOT NULL,
  "status" text DEFAULT 'ready' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "openhands_workspaces_status_idx" ON "openhands_workspaces" ("status");

CREATE TABLE IF NOT EXISTS "openhands_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "goal" text NOT NULL,
  "channel_id" integer,
  "parent_session_id" integer,
  "status" text DEFAULT 'queued' NOT NULL,
  "outcome" text,
  "final_answer" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "duration_ms" integer,
  "metadata" jsonb DEFAULT '{}' NOT NULL
);
CREATE INDEX IF NOT EXISTS "openhands_sessions_workspace_idx" ON "openhands_sessions" ("workspace_id");
CREATE INDEX IF NOT EXISTS "openhands_sessions_status_idx" ON "openhands_sessions" ("status");
CREATE INDEX IF NOT EXISTS "openhands_sessions_started_idx" ON "openhands_sessions" ("started_at");

CREATE TABLE IF NOT EXISTS "openhands_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL,
  "kind" text NOT NULL,
  "role" text,
  "payload" jsonb DEFAULT '{}' NOT NULL,
  "sequence" integer NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "openhands_events_session_idx" ON "openhands_events" ("session_id");
CREATE INDEX IF NOT EXISTS "openhands_events_session_seq_idx" ON "openhands_events" ("session_id", "sequence");

CREATE TABLE IF NOT EXISTS "openhands_tool_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL,
  "tool_name" text NOT NULL,
  "args" jsonb DEFAULT '{}' NOT NULL,
  "result_summary" text,
  "success" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer,
  "error" text,
  "ran_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "openhands_tool_runs_session_idx" ON "openhands_tool_runs" ("session_id");
CREATE INDEX IF NOT EXISTS "openhands_tool_runs_tool_idx" ON "openhands_tool_runs" ("tool_name");
`;

// Crawl4AI schema — orchestration rows + per-page records. Idempotent.
const CRAWL4AI_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "crawl4ai_crawls" (
  "id" serial PRIMARY KEY NOT NULL,
  "seeds" jsonb DEFAULT '[]' NOT NULL,
  "max_depth" integer DEFAULT 0 NOT NULL,
  "concurrency" integer DEFAULT 4 NOT NULL,
  "max_pages" integer DEFAULT 25 NOT NULL,
  "follow_links" boolean DEFAULT false NOT NULL,
  "memory_key_prefix" text,
  "memory_tag" text DEFAULT 'crawl4ai' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "pages_total" integer DEFAULT 0 NOT NULL,
  "pages_success" integer DEFAULT 0 NOT NULL,
  "pages_failed" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "duration_ms" integer,
  "metadata" jsonb DEFAULT '{}' NOT NULL
);
CREATE INDEX IF NOT EXISTS "crawl4ai_crawls_status_idx" ON "crawl4ai_crawls" ("status");
CREATE INDEX IF NOT EXISTS "crawl4ai_crawls_started_idx" ON "crawl4ai_crawls" ("started_at");

CREATE TABLE IF NOT EXISTS "crawl4ai_pages" (
  "id" serial PRIMARY KEY NOT NULL,
  "crawl_id" integer NOT NULL,
  "url" text NOT NULL,
  "label" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "bytes" integer,
  "memory_key" text,
  "error" text,
  "duration_ms" integer,
  "crawled_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "crawl4ai_pages_crawl_idx" ON "crawl4ai_pages" ("crawl_id");
CREATE INDEX IF NOT EXISTS "crawl4ai_pages_status_idx" ON "crawl4ai_pages" ("status");
`;

// Mem0 schema — typed facts table (userId, category, entity, attribute, value).
const MEM0_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "mem0_facts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text DEFAULT 'operator' NOT NULL,
  "category" text NOT NULL,
  "entity" text NOT NULL,
  "attribute" text NOT NULL,
  "value" text NOT NULL,
  "confidence" real DEFAULT 0.5 NOT NULL,
  "source_memory_id" integer,
  "metadata" jsonb DEFAULT '{}' NOT NULL,
  "reinforced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "mem0_facts_user_category_idx" ON "mem0_facts" ("user_id", "category");
CREATE INDEX IF NOT EXISTS "mem0_facts_user_entity_attr_idx" ON "mem0_facts" ("user_id", "entity", "attribute");
`;

// Docling schema — parsed documents. Idempotent.
const DOCLING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "docling_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text,
  "source_kind" text NOT NULL,
  "source_ref" text,
  "mime_type" text,
  "format" text NOT NULL,
  "bytes" integer,
  "extracted_text" text,
  "extracted_chars" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'success' NOT NULL,
  "error" text,
  "parsed_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "docling_documents_format_idx" ON "docling_documents" ("format");
CREATE INDEX IF NOT EXISTS "docling_documents_parsed_idx" ON "docling_documents" ("parsed_at");
`;

// BOS-OMEGA schema — devices, commands, screenshots, install runs. Idempotent.
const BOS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "bos_devices" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "host" text NOT NULL,
  "adapter" text NOT NULL,
  "tailscale_ip" text,
  "rustdesk_id" text,
  "rustdesk_password" text,
  "meshcentral_id" text,
  "guacamole_connection_id" text,
  "status" text DEFAULT 'unknown' NOT NULL,
  "last_seen" timestamp,
  "enabled" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "bos_devices_host_idx" ON "bos_devices" ("host");
CREATE INDEX IF NOT EXISTS "bos_devices_adapter_idx" ON "bos_devices" ("adapter");
CREATE INDEX IF NOT EXISTS "bos_devices_status_idx" ON "bos_devices" ("status");

CREATE TABLE IF NOT EXISTS "bos_commands" (
  "id" serial PRIMARY KEY NOT NULL,
  "device_id" integer NOT NULL,
  "adapter" text NOT NULL,
  "command" text NOT NULL,
  "output" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "exit_code" integer,
  "started_at" timestamp,
  "completed_at" timestamp,
  "duration_ms" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "bos_commands_device_idx" ON "bos_commands" ("device_id");
CREATE INDEX IF NOT EXISTS "bos_commands_status_idx" ON "bos_commands" ("status");
CREATE INDEX IF NOT EXISTS "bos_commands_created_idx" ON "bos_commands" ("created_at");

CREATE TABLE IF NOT EXISTS "bos_screenshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "device_id" integer NOT NULL,
  "adapter" text NOT NULL,
  "bytes" integer DEFAULT 0 NOT NULL,
  "width" integer,
  "height" integer,
  "storage_key" text,
  "taken_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "bos_screenshots_device_idx" ON "bos_screenshots" ("device_id");
CREATE INDEX IF NOT EXISTS "bos_screenshots_taken_idx" ON "bos_screenshots" ("taken_at");

CREATE TABLE IF NOT EXISTS "bos_install_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "device_id" integer,
  "adapter" text NOT NULL,
  "script" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "output" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "duration_ms" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "bos_install_runs_device_idx" ON "bos_install_runs" ("device_id");
CREATE INDEX IF NOT EXISTS "bos_install_runs_adapter_idx" ON "bos_install_runs" ("adapter");
`;

export async function runMigrations(): Promise<void> {
  // The connection acquire is INSIDE the try: if the database is unreachable
  // (deleted free-tier DB, cold start, transient network), pool.connect() must
  // NOT throw out of here — that would propagate to index.ts, hit process.exit(1),
  // and prevent the server from ever listening, pinning Render to the stale
  // last-good build. Boot must always succeed; the DB simply migrates later.
  let client: Awaited<ReturnType<typeof pool.connect>> | undefined;
  try {
    client = await pool.connect();
    logger.info("Running startup migrations...");
    await client.query(SCHEMA_SQL);
    await client.query(HERMES_SCHEMA_SQL);
    await client.query(OPENHANDS_SCHEMA_SQL);
    await client.query(CRAWL4AI_SCHEMA_SQL);
    await client.query(MEM0_SCHEMA_SQL);
    await client.query(DOCLING_SCHEMA_SQL);
    await client.query(BOS_SCHEMA_SQL);
    logger.info("Schema ready (core + hermes + openhands + crawl4ai + mem0 + docling + bos)");

    // Always run — ON CONFLICT clauses make both statements idempotent.
    await client.query(SEED_AGENTS);
    await client.query(SEED_CHANNELS);
    logger.info("Agent and channel seed applied (idempotent)");

    // Idempotently sync each agent's real tool capabilities.
    for (const [id, caps] of Object.entries(AGENT_CAPABILITIES)) {
      await client.query("UPDATE agents SET capabilities = $1 WHERE id = $2", [caps, Number(id)]);
    }
  } catch (err) {
    logger.error({ err }, "Migration failed — server will continue booting without a completed migration");
  } finally {
    client?.release();
  }
}
