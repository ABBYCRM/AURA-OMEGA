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
declare global {
  // eslint-disable-next-line no-var
  var finalAnswer: string | undefined;
}

globalThis.finalAnswer ??= "";

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
  .then(() => logIntegrations())
  .then(() => reconcileStaleWork())
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
