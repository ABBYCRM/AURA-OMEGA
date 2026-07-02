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
// SSL must match the host, not be forced globally:
//  - Render INTERNAL Postgres (host like "dpg-xxxx-a", no dots) speaks
//    plaintext — forcing TLS makes the server close the socket, which
//    surfaces as "Connection terminated unexpectedly" on the first query.
//  - Render EXTERNAL hosts (…render.com) require TLS but present a
//    self-signed chain, so accept it with rejectUnauthorized: false.
//  - localhost/127.x never uses TLS.
function sslFor(connectionString: string | undefined): { rejectUnauthorized: false } | undefined {
  if (!connectionString) return undefined;
  try {
    const host = new URL(connectionString).hostname;
    if (host === "localhost" || host.startsWith("127.")) return undefined;
    if (!host.includes(".")) return undefined; // Render internal hostname
    return { rejectUnauthorized: false };
  } catch {
    return undefined;
  }
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: sslFor(process.env.DATABASE_URL),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
