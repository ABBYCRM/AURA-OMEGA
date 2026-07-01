import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { boot as bootMissionKernel } from "./lib/mission";
import { setHermesToolRunner, setOpenHandsToolRunner } from "./lib/mission";
import { setBrainToolRunner, setBrainLLM } from "./lib/mission/engines/brain-engine";
import { setLearningLoopDeps } from "./lib/learning-loop";
import { runTool } from "./tools";
import { completeChat } from "./lib/integrations";
import { requireOperator } from "./lib/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS: the dashboard is served same-origin in production, so cross-origin
// browser access isn't needed. When ALLOWED_ORIGINS is set (comma-separated),
// lock to that allowlist with credentials so a stray site can't read the API in
// a browser. Unset → permissive (dev / unconfigured deploys), unchanged behavior.
const allowedOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",").map((o) => o.trim()).filter(Boolean);
app.use(
  allowedOrigins.length
    ? cors({ origin: allowedOrigins, credentials: true })
    : cors(),
);
app.use(cookieParser());
const uploadMb = Math.max(1, Number(process.env["AURA_MAX_UPLOAD_MB"] ?? 100));
const bodyLimit = `${Math.ceil(uploadMb * 1.4)}mb`;
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

// Health + version endpoints (before auth router so they're always open).
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "aura-omega-api" });
});

// Operator 2026-06-30: actionable DB status. Tries a 2s SELECT 1 against
// the configured DATABASE_URL. Returns 200 with status:"ok" when DB is
// reachable, 503 with status:"down" + the actual error when not.
// This is the first thing the operator should hit when "everything is
// broken" — it tells them whether the DB itself is gone.
app.get("/health/db", async (_req, res) => {
  const start = Date.now();
  try {
    const { pool } = await import("@workspace/db");
    const c = await Promise.race([
      pool.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("acquire timeout (2s)")), 2000),
      ),
    ]);
    try {
      await c.query("SELECT 1");
      res.json({
        status: "ok",
        database: "reachable",
        latencyMs: Date.now() - start,
        host: process.env["DATABASE_URL"]?.split("@")[1]?.split("/")[0] ?? "(no DATABASE_URL)",
      });
    } finally {
      c.release();
    }
  } catch (err) {
    res.status(503).json({
      status: "down",
      database: "unreachable",
      error: String(err instanceof Error ? err.message : err).slice(0, 200),
      host: process.env["DATABASE_URL"]?.split("@")[1]?.split("/")[0] ?? "(no DATABASE_URL)",
      hint: "If the original Render postgres was deleted/migrated, " +
            "create a new one in the Render dashboard and update DATABASE_URL " +
            "via the Render API.",
    });
  }
});
app.get("/version", (_req, res) => {
  res.json({
    version: process.env["DEPLOY_VERSION"] ?? "dev",
    service: "aura-omega-api",
    timestamp: new Date().toISOString(),
  });
});

// Debug: dump env vars (no secrets — lengths and prefixes only)
// Mounted directly on app to bypass route-level middleware, but still
// requires a signed-in session — this is sensitive enough to gate.
app.get("/_debug/env", requireOperator, async (_req, res) => {
  const keys = ['DATABASE_URL', 'NVIDIA_API_KEY', 'NVIDIA_API_KEYS', 'DEPLOY_VERSION', 'SCRAPINGBEE_API_KEY', 'KIMI_API_KEY', 'ABBY_MODEL', 'PORT', 'NODE_ENV'];
  const result: Record<string, { len: number; prefix: string }> = {};
  for (const k of keys) {
    const v = process.env[k];
    result[k] = { len: v?.length ?? 0, prefix: v ? v.substring(0, 20) : 'UNDEFINED' };
  }
  let keyCount = -1;
  let keyError = '';
  try {
    const { nvidiaKeys } = await import('./lib/integrations');
    const keys = nvidiaKeys();
    keyCount = keys.length;
    keyError = 'none';
  } catch (e: any) {
    keyError = e?.message || String(e);
  }
  res.json({ env: result, nvidiaKeyCount: keyCount, keyError, timestamp: new Date().toISOString() });
});

// ─── Simple in-memory rate limiter ───────────────────────────────────────────
// Prevents abuse of expensive LLM endpoints. Per-IP sliding window.
// NOT a substitute for a proper reverse-proxy rate limiter (nginx/Cloudflare)
// but catches basic hammering. Cleans up stale entries lazily.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    // New window or expired window
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: "Rate limit exceeded. Please slow down.", retryAfter: Math.ceil((entry.resetAt - now) / 1000) });
    return;
  }
  next();
}

// Apply rate limiting to expensive LLM endpoints (before the router)
app.use("/api/ai/chat", rateLimitMiddleware);
app.use("/api/ai/complete", rateLimitMiddleware);

app.use("/api", router);

// Boot the Mission Kernel so it can resume in-flight missions and listen
// for in-process step.completed events. Idempotent.
if (process.env["DISABLE_MISSION_KERNEL"] !== "true") {
  // Wire the engine tool runners so hermes/openhands engines can call into
  // the existing TOOL_REGISTRY via runTool(). Agents 1 (ABBY, full authority)
  // and 2 (AURA-1, code) have the broadest tool access. Missions run as
  // ABBY by default.
  // Mission kernels always run as ABBY (agentId=1) which has the full tool set
// — agents 2-6 each only have their specialty. The engine's own ToolContext
// (with its agentId) is kept in the metadata for observability, but the
// authoritative agent identity passed to runTool is always ABBY.
setHermesToolRunner(async (tool, args, ctx) =>
  runTool(tool, args, { agentId: 1, agentName: ctx.agentName ?? "ABBY", agentColor: ctx.agentColor ?? null, channelId: ctx.channelId ?? null }),
);
setOpenHandsToolRunner(async (tool, args, ctx) =>
  runTool(tool, args, { agentId: 1, agentName: ctx.agentName ?? "ABBY", agentColor: ctx.agentColor ?? null, channelId: ctx.channelId ?? null }),
);
// Brain engine: synthesizes the final answer for each mission by reading back
// all evidence from mission memory and asking K2.6 to consolidate it. Wired
// the same way as the other engines so the brain step can call runTool + LLM.
setBrainToolRunner(async (tool, args, ctx) =>
  runTool(tool, args, { agentId: 1, agentName: ctx.agentName ?? "ABBY", agentColor: ctx.agentColor ?? null, channelId: ctx.channelId ?? null }),
);
setBrainLLM(async (model, system, user, maxTokens) => completeChat(model, system, user, maxTokens));
// Learning loop: extracts durable knowledge from completed missions and
// persists to hermes under knowledge/<topic>/<slug>. Operator doctrine
// 2026-06-27: "read, understand, learn, add to memory, then perform".
setLearningLoopDeps({
  completeChat: async (model, system, user, maxTokens) => completeChat(model, system, user, maxTokens),
  runTool: async (tool, args, ctx) => runTool(tool, args, { agentId: 1, agentName: ctx.agentName ?? "ABBY", agentColor: ctx.agentColor ?? null, channelId: ctx.channelId ?? null }),
});
  bootMissionKernel();
  logger.info("Mission Kernel booted (engines: hermes + openhands wired)");
}

// In production, serve the Vite-built frontend if it was bundled into the image.
const __filename_app = fileURLToPath(import.meta.url);
const __dirname_app = path.dirname(__filename_app);
const staticPath = path.join(__dirname_app, "..", "..", "aura-omega-ui", "dist", "public");
const indexHtml = path.join(staticPath, "index.html");
const hasFrontend =
  process.env["NODE_ENV"] === "production" && fs.existsSync(indexHtml);

if (hasFrontend) {
  app.use(
    express.static(staticPath, {
      setHeaders: (res, filePath) => {
        // The SPA entry point must NEVER be cached: the browser has to revalidate
        // it on every load so a new deploy is picked up immediately (otherwise a
        // tab keeps serving a stale bundle — the "old build" ghost). Hashed assets
        // are content-addressed (the filename changes when the bytes change), so
        // they're safe to cache forever.
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  app.get("/*path", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (req.path.startsWith("/_debug")) return next();
    // Missing static assets (paths with a file extension) should 404, not
    // fall back to the SPA shell — otherwise stale asset requests get HTML 200.
    if (path.extname(req.path)) return next();
    // The SPA shell is served for every app route; it must revalidate too so a
    // deep-link/refresh always lands the newest deployed bundle.
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml, (err) => {
      if (err) next();
    });
  });
} else {
  // No frontend bundle (dev, or build missing) — expose a health root.
  app.get("/", (_req, res) => {
    res.json({ status: "ok", service: "aura-omega-api" });
  });
}

export default app;
