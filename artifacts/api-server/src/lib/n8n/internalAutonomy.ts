import { logger } from "../logger";
import { createAutonomousExecutionPlan } from "./autonomousPlanner";
import { recordWorkflowOutcome } from "./outcomeMemory";

export type HeartbeatStatus = "idle" | "running" | "paused" | "error";

export interface InternalHeartbeatJob {
  id: string;
  name: string;
  everyMs: number;
  enabled: boolean;
  objective: string;
  payload: Record<string, unknown>;
  lastRunAt?: string;
  nextRunAt: string;
  runCount: number;
  lastStatus: HeartbeatStatus;
  lastResult?: string;
}

export interface InternalAutonomySnapshot {
  enabled: boolean;
  started: boolean;
  intervalMs: number;
  tickCount: number;
  inFlight: string[];
  jobs: InternalHeartbeatJob[];
}

const DEFAULT_TICK_MS = Number(process.env["AURA_INTERNAL_AUTONOMY_TICK_MS"] ?? 60_000);
const FIVE_MINUTES = 5 * 60_000;
const TEN_MINUTES = 10 * 60_000;
const THIRTY_MINUTES = 30 * 60_000;
const ONE_HOUR = 60 * 60_000;
const HEARTBEAT_DRY_RUN = process.env["AURA_HEARTBEAT_LIVE"] !== "true";

function isoAfter(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

const jobs: InternalHeartbeatJob[] = [
  {
    id: "heartbeat-runtime-health",
    name: "Runtime Heartbeat Health Snapshot",
    everyMs: FIVE_MINUTES,
    enabled: true,
    objective: "Internal autonomous heartbeat: snapshot runtime health, agent state, errors, providers, memory continuity, and queued tasks. Keep the runtime awake and detect broken state.",
    payload: { operatorApproved: process.env["AURA_HEARTBEAT_LIVE"] === "true", dryRun: HEARTBEAT_DRY_RUN, source: "internal-heartbeat", objective: "health snapshot heartbeat" },
    nextRunAt: isoAfter(10_000),
    runCount: 0,
    lastStatus: "idle",
  },
  {
    id: "heartbeat-tool-registry-self-test",
    name: "Tool Registry Self Test",
    everyMs: TEN_MINUTES,
    enabled: true,
    objective: "Internal autonomous heartbeat: validate the 60 n8n tools, Tool Intent Vector Registry, workflow graph, route selection, required input gates, and LLM tool contracts.",
    payload: { operatorApproved: process.env["AURA_HEARTBEAT_LIVE"] === "true", dryRun: HEARTBEAT_DRY_RUN, source: "internal-heartbeat", objective: "self test workflow registry" },
    nextRunAt: isoAfter(20_000),
    runCount: 0,
    lastStatus: "idle",
  },
  {
    id: "heartbeat-memory-continuity",
    name: "Memory Continuity Pulse",
    everyMs: THIRTY_MINUTES,
    enabled: true,
    objective: "Internal autonomous heartbeat: persist continuity, summarize unresolved blockers, dedupe stale state, and record verified runtime memory without exposing secrets.",
    payload: { operatorApproved: process.env["AURA_HEARTBEAT_LIVE"] === "true", dryRun: HEARTBEAT_DRY_RUN, source: "internal-heartbeat", query: "runtime continuity and unresolved blockers" },
    nextRunAt: isoAfter(30_000),
    runCount: 0,
    lastStatus: "idle",
  },
  {
    id: "heartbeat-provider-model-check",
    name: "Provider And Model Pulse",
    everyMs: ONE_HOUR,
    enabled: true,
    objective: "Internal autonomous heartbeat: check configured LLM/provider availability, model endpoint readiness, n8n webhook routes, Render/VPS status hints, and auth failure signals.",
    payload: { operatorApproved: process.env["AURA_HEARTBEAT_LIVE"] === "true", dryRun: HEARTBEAT_DRY_RUN, source: "internal-heartbeat", query: "provider model render vps status" },
    nextRunAt: isoAfter(40_000),
    runCount: 0,
    lastStatus: "idle",
  },
];

let timer: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;
const inFlight = new Set<string>();

function autonomyEnabled(): boolean {
  return process.env["AURA_INTERNAL_AUTONOMY_DISABLED"] !== "true";
}

async function runHeartbeatJob(job: InternalHeartbeatJob): Promise<void> {
  if (inFlight.has(job.id)) return;
  inFlight.add(job.id);
  job.lastStatus = "running";
  job.lastRunAt = new Date().toISOString();
  job.runCount += 1;
  job.nextRunAt = isoAfter(job.everyMs);
  try {
    const plan = createAutonomousExecutionPlan(job.objective, job.payload);
    const selected = plan.steps.map((s) => s.workflowId).join(" -> ") || "none";
    job.lastStatus = plan.mode === "abort" ? "error" : "idle";
    job.lastResult = `mode=${plan.mode}; gate=${plan.gate}; selected=${selected}; missing=${plan.missingInputs.join(",") || "none"}`;
    for (const step of plan.steps) {
      recordWorkflowOutcome({
        workflowId: step.workflowId,
        status: plan.mode === "autonomous" ? "PARTIAL" : "BLOCKED",
        objective: job.objective,
        evidence: `Internal heartbeat dry-run selected ${step.workflowId}. ${job.lastResult}`,
      });
    }
    logger.info({ jobId: job.id, result: job.lastResult }, "AURA internal heartbeat completed");
  } catch (err) {
    job.lastStatus = "error";
    job.lastResult = String(err instanceof Error ? err.message : err).slice(0, 500);
    logger.error({ err, jobId: job.id }, "AURA internal heartbeat failed");
  } finally {
    inFlight.delete(job.id);
  }
}

async function tick(): Promise<void> {
  if (!autonomyEnabled()) return;
  tickCount += 1;
  const now = Date.now();
  for (const job of jobs) {
    if (!job.enabled) continue;
    if (Date.parse(job.nextRunAt) <= now) void runHeartbeatJob(job);
  }
}

export function startInternalAutonomyLoop(): void {
  if (timer || !autonomyEnabled()) return;
  timer = setInterval(() => void tick(), Math.max(15_000, DEFAULT_TICK_MS));
  const maybeNodeTimer = timer as unknown as { unref?: () => void };
  if (typeof maybeNodeTimer.unref === "function") maybeNodeTimer.unref();
  logger.info({ intervalMs: Math.max(15_000, DEFAULT_TICK_MS), jobCount: jobs.length }, "AURA internal autonomy heartbeat loop started");
}

export function stopInternalAutonomyLoop(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info("AURA internal autonomy heartbeat loop stopped");
}

export function getInternalAutonomySnapshot(): InternalAutonomySnapshot {
  return {
    enabled: autonomyEnabled(),
    started: timer !== null,
    intervalMs: Math.max(15_000, DEFAULT_TICK_MS),
    tickCount,
    inFlight: Array.from(inFlight),
    jobs: jobs.map((job) => ({ ...job })),
  };
}

export function runInternalAutonomyJobNow(id: string): Promise<void> {
  const job = jobs.find((candidate) => candidate.id === id);
  if (!job) throw new Error(`Unknown internal heartbeat job: ${id}`);
  return runHeartbeatJob(job);
}
