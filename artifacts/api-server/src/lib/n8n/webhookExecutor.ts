import type { N8nWorkflowTask } from "./workflows";

export interface N8nWebhookExecutionInput {
  workflow: N8nWorkflowTask;
  objective: string;
  payload: Record<string, unknown>;
  stepReason?: string;
}

export interface N8nWebhookExecutionResult {
  mode: "live" | "dry-run" | "disabled";
  ok: boolean;
  status?: number;
  url?: string;
  attempts: number;
  result?: unknown;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = Number(process.env["N8N_WEBHOOK_TIMEOUT_MS"] ?? 30_000);
const DEFAULT_RETRIES = Math.max(1, Number(process.env["N8N_WEBHOOK_RETRIES"] ?? 2));

function n8nBaseUrl(): string {
  return String(process.env["N8N_WEBHOOK_BASE_URL"] ?? process.env["N8N_BASE_URL"] ?? "").replace(/\/$/, "");
}

function webhookUrl(path: string): string | null {
  const base = n8nBaseUrl();
  if (!base) return null;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}

async function postJsonWithTimeout(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AURA-OMEGA-n8n-dispatcher/1.0",
        ...(process.env["N8N_WEBHOOK_TOKEN"] ? { Authorization: `Bearer ${process.env["N8N_WEBHOOK_TOKEN"]}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function executeN8nWebhook(input: N8nWebhookExecutionInput): Promise<N8nWebhookExecutionResult> {
  const allowLive = input.payload["dryRun"] !== true && process.env["N8N_LIVE_EXECUTION_DISABLED"] !== "true";
  const url = webhookUrl(input.workflow.webhookPath);
  if (!url) {
    return { mode: "disabled", ok: false, attempts: 0, error: "N8N_WEBHOOK_BASE_URL or N8N_BASE_URL is not configured." };
  }
  if (!allowLive) {
    return { mode: "dry-run", ok: true, attempts: 0, url, result: { wouldPost: true, workflowId: input.workflow.id, webhookPath: input.workflow.webhookPath } };
  }

  const outbound = {
    workflowId: input.workflow.id,
    workflowName: input.workflow.name,
    ownerAgent: input.workflow.ownerAgent,
    objective: input.objective,
    stepReason: input.stepReason ?? null,
    traceId: input.payload["traceId"] ?? crypto.randomUUID(),
    idempotencyKey: input.payload["idempotencyKey"] ?? crypto.randomUUID(),
    payload: input.payload,
    timestamp: new Date().toISOString(),
    source: "aura-omega-api",
  };

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= DEFAULT_RETRIES; attempt++) {
    try {
      const res = await postJsonWithTimeout(url, outbound, DEFAULT_TIMEOUT_MS);
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
      if (res.ok) return { mode: "live", ok: true, attempts: attempt, status: res.status, url, result: parsed };
      lastError = `HTTP ${res.status}: ${text.slice(0, 500)}`;
    } catch (err) {
      lastError = String(err instanceof Error ? err.message : err);
    }
  }
  return { mode: "live", ok: false, attempts: DEFAULT_RETRIES, url, error: lastError };
}
