import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// DO NOT throw at module load if DATABASE_URL is missing. A hard throw here
// bricks the entire process at import time — which on Render means the new
// deploy exits before it can listen, so Render keeps the last-good (stale)
// build live indefinitely. Instead, warn and let the server boot; individual
// DB queries fail (and are caught by route handlers) until the database is
// reachable. The pg Pool connects lazily on first query, so constructing it
// with an undefined/placeholder connection string is safe.
if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    "[db] DATABASE_URL is not set — DB-backed routes will fail until it is provided. Server will still boot.",
  );
}

// Pool sizing matters: orchestration runs in-process and fire-and-forget, so a
// single goal can hold several connections (AURA tool loops writing tool_calls,
// messages, tasks) at once. With the pg default of max:10, concurrent polling
// reads (the dashboard hits /messages, /commands, /agents every few seconds)
// starve and hang past the client timeout — surfacing as empty/dropped
// responses. Give it real headroom and a connection-acquire timeout so a busy
// moment fails fast with an error the caller can retry, instead of hanging.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Operator 2026-06-30: Render's external Postgres uses a self-signed cert
  // that node-postgres strict-mode rejects ("Connection terminated unexpectedly"
  // on the very first query). Accept the cert but verify the chain — never
  // true without rejectUnauthorized:false on a remote DB; never false on a
  // localhost DB. We're on Render, so accept.
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export * from "./schema";
