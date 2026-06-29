/**
 * Cron engine — Postgres-backed scheduled missions.
 *
 * Operator doctrine (2026-06-27): "schedule via the kernel, not via n8n."
 * The 60 n8n-* workflow definitions live as rows in the cron_jobs table.
 * A single setInterval per job re-ticks the mission, so the schedule
 * survives process restart (unlike the old in-memory ACTIVE Map).
 *
 * Why not just use a real n8n deployment? Pros and cons already analyzed
 * in the operator's brief. This module gets you 90% of the speed
 * advantage (pre-registered workflows, parallel firing, cron schedules)
 * inside the same Mission Kernel that has synthesis, learning loop,
 * knowledge hierarchy, and 18 NVIDIA keys — all the things that
 * n8n would have to re-implement.
 *
 * Flow:
 *   1. ensureCronJob(name, opts) — upsert a cron row into cron_jobs
 *   2. startCronEngine() — load all enabled rows, fire setInterval per row
 *   3. every interval_seconds → createMission with a pre-built plan,
 *      tick it, update last_run_at / last_status / last_mission_id
 *   4. webhooks call dispatchN8nTask(taskId, body) which creates a
 *      mission immediately (no planner, no cron wait)
 */

import { logger } from "../logger";
import { tick } from "./runtime";
import { createMission, getMission } from "./state-store";
import { N8N_WORKFLOW_TASKS, getN8nWorkflowTask } from "../n8n/workflows";

export interface CronJobRow {
  id: number;
  name: string;
  task_id: string | null;
  goal: string;
  interval_seconds: number;
  enabled: boolean;
  trigger_type: string;
  schedule_text: string | null;
  last_run_at: Date | null;
  last_mission_id: number | null;
  last_status: string | null;
  last_error: string | null;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
}

const ACTIVE_HANDLES: Map<string, NodeJS.Timeout> = new Map();
let STARTED = false;
let DB_POOL: any = null;

/** Wire the DB pool at boot. We lazy-import to avoid cycles. */
export function setCronEnginePool(pool: any): void {
  DB_POOL = pool;
}

/**
 * Convert an n8n-* task's "every N hours" / "dailyAt(N)" / cron string
 * to a setInterval-friendly interval in seconds.
 *
 * The 60 N8N_WORKFLOW_TASKS already use either:
 *   - schedule: cron string like every-30-minutes
 *   - schedule: everyHours(N)        (N hours)
 *   - schedule: dailyAt(N)           (N o'clock)
 *   - trigger: "webhook"              (no schedule, manual only)
 *
 * For cron-style strings we use a simple parser; for the convenience
 * helpers we translate to seconds directly.
 */
export function scheduleToSeconds(schedule: string | undefined, fallbackSeconds: number): number {
  if (!schedule) return fallbackSeconds;
  // cron string: */30 * * * * → every 30 min
  const m = schedule.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (m) {
    return Math.max(60, parseInt(m[1], 10) * 60);
  }
  // everyHours(6) → 6*3600
  const h = schedule.match(/^everyHours\((\d+)\)$/);
  if (h) {
    return Math.max(60, parseInt(h[1], 10) * 3600);
  }
  // dailyAt(8) → 86400 (one tick per day)
  const d = schedule.match(/^dailyAt\((\d+)\)$/);
  if (d) {
    return 86400;
  }
  return fallbackSeconds;
}

/**
 * Pre-build a mission plan for an n8n task — bypasses the planner.
 * The plan is a single brain/synthesize step that reads the task's
 * prompt + any webhook body and synthesizes a coherent answer.
 *
 * For now this is simple; in future rounds each task_id can have a
 * custom plan (e.g., "send-discord-relay" would include a discord_engine step).
 */
function buildN8nMissionPlan(taskId: string, goal: string, webhookBody: Record<string, unknown> | null): Array<Record<string, unknown>> {
  // We always append a synthesize step so the operator gets a single
  // coherent result, not raw search hits.
  return [
    {
      index: 0,
      description: `Execute n8n task ${taskId}: ${goal}`,
      engine: "hermes",
      action: "memory_write",
      args: {
        key: `n8n/${taskId}/${Date.now()}`,
        content: webhookBody ? JSON.stringify(webhookBody).slice(0, 4000) : goal,
      },
      acceptance: "Evidence saved.",
      maxAttempts: 2,
      backoffSeconds: 30,
    },
    {
      index: 1,
      description: `Synthesize n8n task ${taskId} result`,
      engine: "brain",
      action: "synthesize",
      args: {
        goal,
        missionId: 0, // set at runtime
        format: "structured",
        includeAllEvidence: true,
      },
      acceptance: "Final answer addresses the task prompt directly.",
      maxAttempts: 2,
      backoffSeconds: 30,
    },
  ];
}

/**
 * Run a single cron tick: create a mission with a pre-built plan and
 * tick it. Updates the cron_jobs row with status + last_run_at.
 */
async function runCronTick(job: CronJobRow): Promise<void> {
  if (!DB_POOL) return;
  const taskId = job.task_id ?? job.name;
  const goal = job.goal;
  const plan = buildN8nMissionPlan(taskId, goal, null);

  try {
    const m = await createMission({
      goal,
      plan: plan as never,
      engines: ["hermes", "brain"],
      context: { taskType: "GENERAL_EXECUTION", source: "cron", cronJobId: job.id, taskId },
      createdBy: "cron",
    });
    if (!m) {
      await DB_POOL.query(
        "UPDATE mission_cron_jobs SET last_status = $1, last_error = $2, failed_runs = failed_runs + 1, total_runs = total_runs + 1, last_run_at = now(), updated_at = now() WHERE id = $3",
        ["failed", "createMission returned null", job.id],
      );
      return;
    }

    await DB_POOL.query(
      "UPDATE mission_cron_jobs SET last_mission_id = $1, last_status = $2, last_run_at = now(), total_runs = total_runs + 1, updated_at = now() WHERE id = $3",
      [m.id, "running", job.id],
    );

    // Fire-and-forget: let the runtime tick the mission, and update the
    // cron_jobs row when it completes.
    void tick(m.id)
      .then((final) => {
        if (!DB_POOL) return;
        const status = final?.status ?? "unknown";
        const err = final?.lastError ?? null;
        const isSuccess = status === "completed";
        DB_POOL.query(
          "UPDATE mission_cron_jobs SET last_status = $1, last_error = $2, successful_runs = successful_runs + $3, failed_runs = failed_runs + $4, updated_at = now() WHERE id = $5",
          [status, err, isSuccess ? 1 : 0, isSuccess ? 0 : 1, job.id],
        ).catch((e: unknown) => logger.warn({ err: String(e).slice(0, 150) }, "cron: failed to update final status"));
      })
      .catch((err) => logger.warn({ err: String(err).slice(0, 200), job: job.name }, "cron tick failed"));

    logger.info({ cronJobId: job.id, name: job.name, missionId: m.id }, "cron: dispatched mission");
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 200), job: job.name }, "cron: runCronTick threw");
    try {
      await DB_POOL.query(
        "UPDATE mission_cron_jobs SET last_status = $1, last_error = $2, failed_runs = failed_runs + 1, total_runs = total_runs + 1, updated_at = now() WHERE id = $3",
        ["failed", String(err).slice(0, 500), job.id],
      );
    } catch { /* ignore */ }
  }
}

/**
 * Upsert a cron job. Idempotent — safe to call at every boot.
 */
export async function ensureCronJob(opts: {
  name: string;
  taskId?: string;
  goal: string;
  intervalSeconds: number;
  enabled?: boolean;
  triggerType?: string;
  scheduleText?: string;
}): Promise<CronJobRow | null> {
  if (!DB_POOL) return null;
  try {
    const r = await DB_POOL.query(
      `INSERT INTO mission_cron_jobs (name, task_id, goal, interval_seconds, enabled, trigger_type, schedule_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         task_id = COALESCE(EXCLUDED.task_id, mission_cron_jobs.task_id),
         goal = EXCLUDED.goal,
         interval_seconds = EXCLUDED.interval_seconds,
         enabled = EXCLUDED.enabled,
         trigger_type = EXCLUDED.trigger_type,
         schedule_text = COALESCE(EXCLUDED.schedule_text, mission_cron_jobs.schedule_text),
         updated_at = now()
       RETURNING *`,
      [
        opts.name,
        opts.taskId ?? null,
        opts.goal,
        opts.intervalSeconds,
        opts.enabled ?? true,
        opts.triggerType ?? "cron",
        opts.scheduleText ?? null,
      ],
    );
    return r.rows[0] as CronJobRow;
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 200), name: opts.name }, "cron: ensureCronJob failed");
    return null;
  }
}

export async function listCronJobs(): Promise<CronJobRow[]> {
  if (!DB_POOL) return [];
  try {
    const r = await DB_POOL.query("SELECT * FROM mission_cron_jobs ORDER BY id ASC");
    return r.rows as CronJobRow[];
  } catch {
    return [];
  }
}

export async function setCronJobEnabled(name: string, enabled: boolean): Promise<boolean> {
  if (!DB_POOL) return false;
  try {
    const r = await DB_POOL.query(
      "UPDATE mission_cron_jobs SET enabled = $1, updated_at = now() WHERE name = $2 RETURNING name",
      [enabled, name],
    );
    const wasUpdated = (r.rowCount ?? 0) > 0;
    if (wasUpdated) {
      // Update the live setInterval too.
      const handle = ACTIVE_HANDLES.get(name);
      if (handle) {
        clearInterval(handle);
        ACTIVE_HANDLES.delete(name);
      }
      if (enabled) {
        const rows = await listCronJobs();
        const job = rows.find((j) => j.name === name);
        if (job) scheduleJob(job);
      }
    }
    return wasUpdated;
  } catch {
    return false;
  }
}

function scheduleJob(job: CronJobRow): void {
  if (!job.enabled) return;
  if (ACTIVE_HANDLES.has(job.name)) return;
  // Fire immediately on enable so the operator doesn't wait a full interval.
  // Concurrent ticks are gated by withCronSlot so 22 simultaneous boot ticks
  // don't all hammer the LLM at once.
  void withCronSlot(() => runCronTick(job));
  const handle = setInterval(() => {
    void withCronSlot(() => runCronTick(job));
  }, job.interval_seconds * 1000);
  if (typeof (handle as any).unref === "function") (handle as any).unref();
  ACTIVE_HANDLES.set(job.name, handle);
  logger.info({ name: job.name, intervalSeconds: job.interval_seconds }, "cron: scheduled");
}

/**
 * Concurrent cron-tick semaphore. The 22 cron jobs share a 1-hour schedule
 * and would all fire within the same second on boot, hammering K2.6 with
 * 45+ simultaneous calls and triggering 429 rate-limits across the 18-key
 * NVIDIA pool. Limit concurrent ticks to CRON_TICK_CONCURRENCY (default 3)
 * so even a perfect storm of cron jobs only ever hits the LLM with 3 calls
 * in flight. Each call still takes 3-5s end-to-end so 3 is plenty.
 */
const CRON_TICK_CONCURRENCY = 3;
let ACTIVE_TICKS = 0;
const TICK_QUEUE: Array<() => void> = [];

function withCronSlot(fn: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve) => {
    const run = async () => {
      ACTIVE_TICKS++;
      try {
        await fn();
      } finally {
        ACTIVE_TICKS--;
        const next = TICK_QUEUE.shift();
        if (next) next();
        resolve();
      }
    };
    if (ACTIVE_TICKS < CRON_TICK_CONCURRENCY) {
      run();
    } else {
      TICK_QUEUE.push(run);
    }
  });
}

/**
 * Boot: load all enabled cron_jobs from Postgres and start ticking.
 * Idempotent — safe to call multiple times (only first call wins).
 */
export async function startCronEngine(): Promise<void> {
  if (STARTED) return;
  STARTED = true;
  if (!DB_POOL) {
    logger.warn("cron engine: DB pool not wired, cron jobs will not run");
    return;
  }
  const jobs = await listCronJobs();
  for (const job of jobs) {
    scheduleJob(job);
  }
  logger.info({ scheduledCount: jobs.filter((j) => j.enabled).length, totalJobs: jobs.length }, "cron engine started");
}

/**
 * Seed the 60 N8N_WORKFLOW_TASKS as cron rows on first boot. Idempotent.
 * Skip tasks with trigger="webhook" only (those get dispatched on demand
 * rather than scheduled).
 */
export async function seedN8nCronJobs(): Promise<number> {
  if (!DB_POOL) return 0;
  let seeded = 0;
  for (const task of N8N_WORKFLOW_TASKS) {
    const interval = task.trigger === "cron"
      ? scheduleToSeconds(task.schedule, 3600)
      : 0; // webhook-only → interval 0, enabled false by default
    const enabled = task.trigger === "cron"; // auto-enable cron tasks; webhooks opt-in
    const result = await ensureCronJob({
      name: task.id,
      taskId: task.id,
      goal: task.prompt,
      intervalSeconds: interval,
      enabled,
      triggerType: task.trigger,
      scheduleText: task.schedule,
    });
    if (result) seeded++;
  }
  logger.info({ seeded, total: N8N_WORKFLOW_TASKS.length }, "cron: seeded N8N tasks");
  return seeded;
}

/**
 * Webhook entrypoint: dispatch an n8n task immediately (no cron wait).
 * Used by /api/n8n/dispatch/:taskId.
 */
export async function dispatchN8nTask(taskId: string, body: Record<string, unknown> | null): Promise<{ ok: boolean; missionId?: number; error?: string }> {
  if (!DB_POOL) return { ok: false, error: "DB pool not wired" };
  const task = getN8nWorkflowTask(taskId);
  if (!task) return { ok: false, error: `unknown task: ${taskId}` };
  if (task.enabled === false) return { ok: false, error: `task ${taskId} is disabled` };
  const plan = buildN8nMissionPlan(taskId, task.prompt, body);
  try {
    const m = await createMission({
      goal: task.prompt,
      plan: plan as never,
      engines: ["hermes", "brain"],
      context: { taskType: "GENERAL_EXECUTION", source: "n8n-webhook", taskId, bodyKeys: body ? Object.keys(body) : [] },
      createdBy: "n8n-webhook",
    });
    if (!m) return { ok: false, error: "createMission returned null" };
    // Update cron_jobs last_dispatch_at if it's registered.
    await DB_POOL.query(
      "UPDATE mission_cron_jobs SET last_run_at = now(), last_mission_id = $1, last_status = 'running', total_runs = total_runs + 1, updated_at = now() WHERE name = $2",
      [m.id, taskId],
    ).catch(() => { /* may not be a cron row */ });
    void tick(m.id).catch((err) => logger.error({ err, taskId, missionId: m.id }, "n8n dispatch tick failed"));
    return { ok: true, missionId: m.id };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 200) };
  }
}

export function stopCronEngine(): void {
  for (const handle of ACTIVE_HANDLES.values()) clearInterval(handle);
  ACTIVE_HANDLES.clear();
  STARTED = false;
}

export function isCronEngineStarted(): boolean {
  return STARTED;
}