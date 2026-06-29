import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { runMigrations } from "../migrate";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Debug: dump env vars (no secrets exposed — only lengths and prefixes)
// Mounted under /healthz so it bypasses auth.
router.get("/env", (_req, res) => {
  const keys = ['DATABASE_URL', 'NVIDIA_API_KEY', 'NVIDIA_API_KEYS', 'DEPLOY_VERSION', 'SCRAPINGBEE_API_KEY', 'ABBY_MODEL', 'PORT', 'NODE_ENV'];
  const result: Record<string, { len: number; prefix: string }> = {};
  for (const k of keys) {
    const v = process.env[k];
    result[k] = { len: v?.length ?? 0, prefix: v ? v.substring(0, 20) : 'UNDEFINED' };
  }
  // Also show nvidiaKeys() count
  const { nvidiaKeys } = require('../lib/integrations');
  res.json({ env: result, nvidiaKeyCount: nvidiaKeys().length, timestamp: new Date().toISOString() });
});

// Diagnostic: force-run migrations + seed. No auth — health router is open.
// Uses pool directly (not runMigrations which swallows errors internally).
// TODO: remove after successful seed — 2026-06-29
router.post("/seed", async (_req, res) => {
  let client;
  const logs: string[] = [];
  try {
    client = await pool.connect();
    logs.push("DB connected");

    // Check existing tables
    const tablesRes = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    );
    const tables = tablesRes.rows.map((r: any) => r.table_name);
    logs.push(`Tables: ${tables.join(", ") || "(none)"}`);

    // Create agents table if missing
    if (!tables.includes("agents")) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS agents (
          id serial PRIMARY KEY,
          name text NOT NULL,
          role text NOT NULL,
          description text,
          status text DEFAULT 'idle' NOT NULL,
          color text NOT NULL,
          avatar_initials text,
          model text,
          context_used integer DEFAULT 0 NOT NULL,
          context_max integer DEFAULT 128000 NOT NULL,
          capabilities text[] DEFAULT '{}' NOT NULL,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `);
      logs.push("Created agents table");
    }

    // Seed agents
    await client.query(`
      INSERT INTO agents (id, name, role, description, status, color, avatar_initials, model, capabilities)
      VALUES
        (1, 'ABBY', 'Orchestrator', 'Master orchestrator and directive router', 'idle', '#00e5ff', 'AB', 'moonshotai/kimi-k2.6', ARRAY['orchestration','planning','routing']),
        (2, 'AURA-1', 'Code Executor', 'Code generation and execution specialist', 'idle', '#bf00ff', 'A1', 'moonshotai/kimi-k2.6', ARRAY['code','execution','debugging']),
        (3, 'AURA-2', 'Browser Agent', 'Web browsing and scraping via Steel', 'idle', '#0066ff', 'A2', 'meta/llama-3.3-70b-instruct', ARRAY['browser','scraping','research']),
        (4, 'AURA-3', 'Memory & RAG', 'Long-term memory and retrieval', 'idle', '#00cc88', 'A3', 'meta/llama-3.3-70b-instruct', ARRAY['memory','rag','search']),
        (5, 'AURA-4', 'API Connector', 'External API integration and automation', 'idle', '#ff6b00', 'A4', 'moonshotai/kimi-k2.6', ARRAY['api','integration','automation']),
        (6, 'AURA-5', 'Social Agent', 'Social media and communications specialist', 'idle', '#ff2d78', 'A5', 'meta/llama-3.3-70b-instruct', ARRAY['social','communications','engagement'])
      ON CONFLICT (id) DO NOTHING
    `);
    logs.push("Seeded agents");

    // Also create channels table + seed if missing
    if (!tables.includes("channels")) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS channels (
          id serial PRIMARY KEY,
          name text NOT NULL UNIQUE,
          type text DEFAULT 'general',
          description text,
          unread_count integer DEFAULT 0,
          last_activity timestamp,
          created_at timestamp DEFAULT now()
        )
      `);
      logs.push("Created channels table");
    }
    await client.query(`
      INSERT INTO channels (name, type, description)
      VALUES ('general','general','General swarm communications'),
             ('abby','agent','ABBY orchestrator channel'),
             ('aura-1','agent','AURA-1 code executor channel'),
             ('aura-2','agent','AURA-2 browser agent channel'),
             ('aura-3','agent','AURA-3 memory channel'),
             ('aura-4','agent','AURA-4 API connector channel'),
             ('aura-5','agent','AURA-5 social agent channel')
      ON CONFLICT (name) DO NOTHING
    `);
    logs.push("Seeded channels");

    // Count agents
    const countRes = await client.query("SELECT COUNT(*) FROM agents");
    logs.push(`Agent count: ${countRes.rows[0].count}`);

    client.release();
    res.json({ success: true, logs });
  } catch (err: any) {
    client?.release();
    res.status(500).json({
      success: false,
      error: err?.message || String(err),
      code: err?.code,
      detail: err?.detail,
      stack: err?.stack?.split("\n").slice(0, 6).join("\n"),
      logs,
    });
  }
});

export default router;
