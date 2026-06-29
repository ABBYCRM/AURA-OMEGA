import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./migrate";
import { loadVaultIntoEnv } from "./lib/vaultEnv";
import { startKeepAlive } from "./lib/keepAlive";
import { reconcileStaleWork } from "./orchestrator";
import { integrationStatus, nvidiaConfigured } from "./lib/integrations";
import { startScheduler } from "./lib/scheduler";
import { startInternalAutonomyLoop } from "./lib/n8n/internalAutonomy";
import { scheduleHeartbeat } from "./lib/hermes";
import { installFinalAnswerCrashGuard } from "./lib/runtimeGuards";
import { setCronEnginePool, startCronEngine, seedN8nCronJobs } from "./lib/mission/cron-engine";
import { pool } from "@workspace/db";

/**
 * Runtime crash guard for legacy orchestrator builds.
 *
 * A 2026-06-26 incident showed `orchestrateGoal()` can post a synthesized final
 * answer and then crash while recording Hermes outcome because a block-scoped
 * `finalAnswer` binding is referenced outside its scope. Until the orchestrator
 * source is fully refactored, keep a process-wide fallback binding available so
 * the post-answer telemetry hook cannot throw `ReferenceError: finalAnswer is
 * not defined` and turn a successful operator response into an orchestration
 * error.
 */
installFinalAnswerCrashGuard();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const REQUIRED_KEYS = ["STEEL_API_KEY", "FIRECRAWL_API_KEY"] as const;
const missingKeys = REQUIRED_KEYS.filter((k) => !process.env[k]);
if (!nvidiaConfigured()) missingKeys.push("NVIDIA_API_KEY" as never);
if (missingKeys.length > 0) {
  logger.warn(
    { missingKeys },
    "Missing API key env vars — AI chat and browser tool routes will fail at runtime",
  );
}

// Surface which optional third-party integrations are wired (booleans only —
// no secret values are ever logged). Logged after the vault→env load below so it
// reflects keys saved in the in-app Settings/Vault, not just Render env vars.
function logIntegrations(): void {
  const integrations = integrationStatus();
  logger.info(
    {
      configured: integrations.filter((i) => i.configured).map((i) => i.key),
      notConfigured: integrations.filter((i) => !i.configured).map((i) => i.key),
    },
    "Third-party integrations status",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runMigrations()
  // Activate integrations from keys saved in the in-app vault (env vars still win).
  .then(() => loadVaultIntoEnv())
  // Boot probe REMOVED 2026-06-29: it mass-marked keys dead at startup
  // (parallel requests hit rate limits, all keys got 429→marked dead).
  // Per-request retry + 10-min dead-key sweep handles failures naturally.
  .then(() => logIntegrations())
  .then(async () => {
    // Operator 2026-06-30: probe DB reachability at boot so the operator
    // dashboard shows "db:down" instead of misleading 500s on every
    // request. Original Render PG may be deleted/migrated; if it is,
    // log a clear actionable error pointing to provisioning a new one.
    try {
      const { pool } = await import("@workspace/db");
      const c = await pool.connect();
      try {
        await c.query("SELECT 1");
        logger.info("Database reachability: OK");
      } finally {
        c.release();
      }
    } catch (err) {
      logger.error(
        { err: String(err).slice(0, 300), host: process.env["DATABASE_URL"]?.split("@")[1]?.split("/")[0] },
        "DATABASE UNREACHABLE — AURA-OMEGA cannot serve DB-backed routes. " +
          "If the original Render postgres was deleted/migrated, " +
          "create a new one in the Render dashboard and update DATABASE_URL " +
          "via the Render API. The service will boot but every DB query will fail.",
      );
    }
  })
  .then(() => reconcileStaleWork())
  .then(async () => {
    // Wire the cron engine DB pool + seed the 60 N8N_WORKFLOW_TASKS as cron
    // rows (operator doctrine 2026-06-27: "schedule via the kernel, not via n8n").
    setCronEnginePool(pool);
    await seedN8nCronJobs();
    await startCronEngine();
  })
  .then(() => {
    const server = app.listen(port, () => {
      logger.info({ port }, "Server listening");
      startKeepAlive();
      startScheduler();
      startInternalAutonomyLoop();
      scheduleHeartbeat();
    });

    server.on("error", (err) => {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Server startup failed");
    process.exit(1);
  });
