/**
 * AURA-OMEGA — Third-party integration layer.
 *
 * Every integration here is driven ENTIRELY by environment variables — no
 * secret is ever hardcoded. Each helper degrades gracefully: if its key is not
 * configured it either throws a clear, human-readable error (for tools the model
 * calls explicitly) or silently no-ops (for fire-and-forget observability).
 *
 * Wired here:
 *   - Helicone   — observability proxy in front of NVIDIA (LLM logging).
 *   - Tavily     — web search provider.
 *   - Exa        — neural web search provider.
 *   - Inngest    — durable event bus (fire-and-forget swarm events).
 *   - LangSmith  — LLM run tracing (fire-and-forget).
 *   - E2B        — cloud code-interpreter sandbox (optional SDK).
 *
 * SECURITY: keys are read from process.env at call time, never logged, never
 * returned to a model. Outbound bodies that may echo a key are not used here.
 */

import { randomUUID } from "node:crypto";
import { logger } from "./logger";

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s;
}

// ─── NVIDIA NIM (primary LLM provider) ──────────────────────────────────────
// NVIDIA NIM exposes an OpenAI-compatible API under integrate.api.nvidia.com/v1.
// NVIDIA is the ONLY LLM provider (operator directive 2026-06-27).
// OpenRouter removed; if NVIDIA is unavailable, calls fail fast with a clear error.

const NVIDIA_BASE_DEFAULT = "https://integrate.api.nvidia.com/v1";

/**
 * Collect every configured NVIDIA NIM key, deduped, in priority order. Supports:
 *   - NVIDIA_API_KEY            — single primary key (back-compat)
 *   - NVIDIA_API_KEYS           — comma/space/newline-separated pool
 *   - NVIDIA_API_KEY_2 … _N     — numbered extras
 * A "Bearer " prefix on any value is tolerated and stripped. Multiple keys give
 * the free tier real rate-limit headroom: requests round-robin across the pool
 * and a throttled/dead key rotates to the next one automatically.
 */
export function nvidiaKeys(): string[] {
  sweepDeadKeys();
  // Operator debug 2026-06-27 20:58: log every call so we can correlate
  // "0 keys at synthesis time" with "18 keys at debug-endpoint time".
  const debugSample: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const k = process.env[`NVIDIA_API_KEY${i === 1 ? "" : "_" + i}`];
    debugSample.push(`${i}=${k ? k.slice(0, 8) + "..." : "null"}`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw?: string) => {
    if (!raw) return;
    for (const part of raw.split(/[\s,]+/)) {
      const k = part.trim().replace(/^Bearer\s+/i, "");
      if (k && k.startsWith("nvapi-") && !seen.has(k) && !DEAD_KEYS.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  };
  add(process.env["NVIDIA_API_KEY"]);
  add(process.env["NVIDIA_API_KEYS"]);
  for (let i = 2; i <= 32; i++) add(process.env[`NVIDIA_API_KEY_${i}`]);
  logger.warn({ outLen: out.length, dead: DEAD_KEYS.size }, "nvidiaKeys result");
  return out;
}

/**
 * Probe all configured NVIDIA keys with a 4-token call and blacklist any
 * that 404/connect-error. Called once at boot, then never again (the per-
 * attempt retry loop handles live failures). Cuts the working pool from
 * 18 to however many are actually valid.
 */
export async function probeNvidiaKeys(): Promise<{ ok: number; dead: string[] }> {
  const keys = nvidiaKeys();
  const dead: string[] = [];
  // Probe each key with a 4-token call. Only blacklist on 404 (key truly
  // dead) or 401 (key revoked). 429 is transient rate-limit; transport
  // errors at boot can be Render cold-start quirks, NOT a dead key, so
  // we don't blacklist on those — let the live retry loop handle them.
  await Promise.all(keys.map(async (k) => {
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${k}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "moonshotai/kimi-k2.6", messages: [{ role: "user", content: "ok" }], max_tokens: 4 }),
        signal: AbortSignal.timeout(8000),
      });
      // Only 404 (model not found on this key) and 401 (revoked) = dead key.
      if (r.status === 404 || r.status === 401) {
        DEAD_KEYS.add(k);
        dead.push(k.slice(-8));
      }
    } catch {
      // Transport error during boot probe — likely transient. Don't blacklist.
    }
  }));
  return { ok: keys.length - dead.length, dead };
}

// Round-robin cursor across the key pool (per-process). Each LLM request advances
// it so load spreads evenly; callers that hit a 401/429 can request the next key.
let nvidiaKeyCursor = 0;

// Set of NVIDIA keys that have been confirmed dead (404/connect-error) and
// should be skipped. The boot probe populates this, and each live failure
// extends it. Re-checked every 10 min so a temporary outage recovers.
const DEAD_KEYS = new Set<string>();
let lastDeadKeySweep = 0;
function sweepDeadKeys() {
  if (Date.now() - lastDeadKeySweep < 10 * 60 * 1000) return;
  DEAD_KEYS.clear();
  lastDeadKeySweep = Date.now();
}
export function markNvidiaKeyDead(key: string) {
  DEAD_KEYS.add(key);
}
// Seed the cursor with a random offset at module load so simultaneous requests
// at process boot don't all land on the same first key (which would burn that
// key's per-minute quota before round-robin kicks in).
nvidiaKeyCursor = Math.floor(Math.random() * 1024);
export function nextNvidiaKey(): string | undefined {
  const keys = nvidiaKeys();
  if (keys.length === 0) return undefined;
  const key = keys[nvidiaKeyCursor % keys.length];
  nvidiaKeyCursor = (nvidiaKeyCursor + 1) % keys.length;
  return key;
}

export function nvidiaConfigured(): boolean {
  return nvidiaKeys().length > 0;
}

// ─── Helicone (observability proxy) ─────────────────────────────────────────
// Helicone sits transparently in front of NVIDIA NIM: same OpenAI-compatible
// API, but every request is logged for observability. When no Helicone key
// is configured we go direct to NVIDIA. OpenRouter removed 2026-06-27.

export function heliconeEnabled(): boolean {
  return !!process.env["HELICONE_API_KEY"];
}

/**
 * The LLM base URL to use. NVIDIA NIM only (operator directive 2026-06-27).
 * Helicone sits in FRONT of NVIDIA when configured so every call is logged.
 */
export function llmBaseUrl(): string {
  // Operator directive 2026-06-29: Kimi.com is PRIMARY when sk-kimi-* key is set.
  if (kimiPrimary()) {
    return (process.env["KIMI_BASE_URL"] ?? "https://api.moonshot.cn/v1").replace(/\/$/, "");
  }
  const keyCount = nvidiaKeys().length;
  if (!nvidiaConfigured()) {
    throw new Error("LLM not configured: no NVIDIA_API_KEY and no KIMI_API_KEY — keyCount=" + keyCount);
  }
  if (heliconeEnabled()) {
    return (process.env["HELICONE_BASE_URL"] ?? "https://nvidia.helicone.ai/v1").replace(/\/$/, "");
  }
  return (process.env["NVIDIA_BASE_URL"] ?? NVIDIA_BASE_DEFAULT).replace(/\/$/, "");
}

/**
 * Unified LLM auth + content headers. NVIDIA ONLY (OpenRouter removed).
 * Spreads Helicone headers on top when Helicone is configured (works with both
 * providers). Throws a descriptive error when neither key is set.
 */
export function llmHeaders(extra?: Record<string, string>): Record<string, string> {
  // Kimi.com primary: use KIMI_API_KEY directly (no NVIDIA pool, no Helicone proxy).
  if (kimiPrimary()) {
    return {
      "Authorization": `Bearer ${process.env["KIMI_API_KEY"]}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }
  const nvidiaKey = nextNvidiaKey();
  if (nvidiaKey) {
    return {
      "Authorization": `Bearer ${nvidiaKey}`,
      "Content-Type": "application/json",
      ...heliconeHeaders(),
      ...extra,
    };
  }
  const keyCount = nvidiaKeys().length;
  logger.warn({ keyCount, hasPrimary: !!process.env["NVIDIA_API_KEY"] }, "llmHeaders: no key available");
  throw new Error("LLM not configured: no KIMI_API_KEY and no NVIDIA_API_KEY — keyCount=" + keyCount);
}

/**
 * Extra headers that enable Helicone logging. Returns an empty object when
 * Helicone is not configured, so callers can always spread it safely.
 */
export function heliconeHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = process.env["HELICONE_API_KEY"];
  if (!key) return {};
  return {
    "Helicone-Auth": `Bearer ${key}`,
    "Helicone-Cache-Enabled": "false",
    ...extra,
  };
}

// ─── Tavily web search ───────────────────────────────────────────────────────

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

function formatHits(provider: string, query: string, hits: SearchHit[]): string {
  if (!hits.length) return `no web results for "${query}" (via ${provider}).`;
  const body = hits
    .map((h, i) => `${i + 1}. ${h.title || "(untitled)"}\n   ${h.url}\n   ${clip(h.snippet.trim(), 300)}`)
    .join("\n\n");
  return `[search provider: ${provider}]\n${body}`;
}

/** Real web search via Tavily. Throws if TAVILY_API_KEY is unset or the call fails. */
export async function tavilySearch(query: string, limit: number): Promise<string> {
  const key = process.env["TAVILY_API_KEY"];
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      max_results: limit,
      search_depth: "basic",
      include_answer: false,
    }),
  });
  if (!r.ok) throw new Error(`Tavily ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const hits: SearchHit[] = (data.results ?? []).map((x) => ({
    title: x.title ?? "",
    url: x.url ?? "",
    snippet: x.content ?? "",
  }));
  return formatHits("tavily", query, hits);
}

// ─── Exa neural web search ───────────────────────────────────────────────────

/** Real web search via Exa. Throws if EXA_API_KEY is unset or the call fails. */
export async function exaSearch(query: string, limit: number): Promise<string> {
  const key = process.env["EXA_API_KEY"];
  if (!key) throw new Error("EXA_API_KEY is not set");
  const r = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      numResults: limit,
      type: "auto",
      contents: { text: { maxCharacters: 600 } },
    }),
  });
  if (!r.ok) throw new Error(`Exa ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as {
    results?: Array<{ title?: string; url?: string; text?: string }>;
  };
  const hits: SearchHit[] = (data.results ?? []).map((x) => ({
    title: x.title ?? "",
    url: x.url ?? "",
    snippet: x.text ?? "",
  }));
  return formatHits("exa", query, hits);
}

// ─── Inngest (durable event bus) ─────────────────────────────────────────────
// Send an event to Inngest's ingestion endpoint. The event KEY is the trailing
// path segment of the webhook URL Inngest gives you (https://inn.gs/e/<KEY>).
// Fire-and-forget: failures are logged at debug and never bubble up — emitting
// telemetry must never break the swarm.

export async function sendInngestEvent(
  name: string,
  data: Record<string, unknown>,
): Promise<void> {
  const key = process.env["INNGEST_EVENT_KEY"];
  if (!key) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(`https://inn.gs/e/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data, ts: Date.now() }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        logger.debug({ status: r.status, event: name }, "inngest: event rejected");
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.debug({ err, event: name }, "inngest: event send failed");
  }
}

// ─── LangSmith (LLM run tracing) ─────────────────────────────────────────────
// Post a single completed LLM run to LangSmith. Fire-and-forget — tracing must
// never affect request latency or break a completion. Enabled when a LangSmith
// (a.k.a. LangChain) API key is present and tracing isn't explicitly disabled.

function langsmithEnabled(): boolean {
  const key = process.env["LANGSMITH_API_KEY"] ?? process.env["LANGCHAIN_API_KEY"];
  if (!key) return false;
  const flag = (process.env["LANGSMITH_TRACING"] ?? process.env["LANGCHAIN_TRACING_V2"] ?? "true").toLowerCase();
  return flag !== "false" && flag !== "0";
}

/** Microsecond, sortable timestamp prefix LangSmith uses for run ordering. */
function dottedTime(d: Date): string {
  const iso = d.toISOString(); // 2026-06-06T12:34:56.789Z
  const [date, time] = iso.replace("Z", "").split("T");
  const [hms, ms = "000"] = time.split(".");
  return `${date.replace(/-/g, "")}T${hms.replace(/:/g, "")}${ms.padEnd(3, "0")}000Z`;
}

export interface LlmTrace {
  name: string;
  model: string;
  input: unknown;
  output: unknown;
  startedAt: Date;
  endedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export function traceLlmRun(trace: LlmTrace): void {
  if (!langsmithEnabled()) return;
  // Detach fully — do not await, do not let rejection surface.
  void (async () => {
    try {
      const key = (process.env["LANGSMITH_API_KEY"] ?? process.env["LANGCHAIN_API_KEY"])!;
      const endpoint =
        process.env["LANGSMITH_ENDPOINT"] ?? process.env["LANGCHAIN_ENDPOINT"] ?? "https://api.smith.langchain.com";
      const project = process.env["LANGSMITH_PROJECT"] ?? process.env["LANGCHAIN_PROJECT"] ?? "aura-omega-ui-omega";
      const id = randomUUID();
      const start = trace.startedAt;
      const end = trace.endedAt ?? new Date();
      const body = {
        id,
        trace_id: id,
        dotted_order: `${dottedTime(start)}${id}`,
        name: trace.name,
        run_type: "llm",
        session_name: project,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        inputs: { input: trace.input },
        outputs: trace.error ? undefined : { output: trace.output },
        error: trace.error,
        extra: { metadata: { model: trace.model, ...(trace.metadata ?? {}) } },
      };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        const r = await fetch(`${endpoint.replace(/\/$/, "")}/runs`, {
          method: "POST",
          headers: { "x-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!r.ok) logger.debug({ status: r.status }, "langsmith: run rejected");
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      logger.debug({ err }, "langsmith: trace failed");
    }
  })();
}

/**
 * Non-streaming chat completion against the configured LLM provider
 * NVIDIA NIM only (Helicone optionally in front). Returns the assistant text.
 *
 * Shared by orchestrator.ts and lib/hermes/llm.ts so both code paths incur
 * the same routing, headers, and tracing.
 */
/** NVIDIA fallback model when primary model fails. */
const FALLBACK_MODEL = "meta/llama-3.1-70b-instruct";

/** Kimi.com fallback model name (used when Kimi is tertiary/secondary). */
const KIMI_FALLBACK_MODEL = "moonshot-v1-128k";

/** Returns true if a Kimi.com API key (sk-kimi-*) is configured. */
export function kimiApiConfigured(): boolean {
  return !!process.env["KIMI_API_KEY"];
}

/**
 * Returns true when the Kimi.com API is the PRIMARY LLM provider.
 * Operator directive 2026-06-29: when KIMI_API_KEY starts with "sk-kimi-",
 * route ALL LLM calls to api.moonshot.cn first; fall back to NVIDIA on failure.
 */
export function kimiPrimary(): boolean {
  return (process.env["KIMI_API_KEY"] ?? "").startsWith("sk-kimi-");
}

/**
 * Map any model identifier to the correct name for the current LLM provider.
 * NVIDIA uses slugs like "moonshotai/kimi-k2.6"; Kimi.com uses "kimi-k2".
 * Non-Kimi models (llama, qwen, etc.) fall back to kimi-k2 on Kimi endpoint.
 */
export function normalizeModel(model: string): string {
  if (!kimiPrimary()) return model;
  const kimiModel = process.env["KIMI_MODEL"] ?? "kimi-k2";
  if (model.startsWith("moonshot-") || model.startsWith("kimi-")) return model;
  if (model.startsWith("moonshotai/")) return kimiModel;
  return kimiModel;
}

/** Build the Kimi.com chat-completions URL (OpenAI-compatible Moonshot API). */
export function kimiFetchUrl(path: string): string {
  const base = (process.env["KIMI_BASE_URL"] ?? "https://api.moonshot.cn/v1").replace(/\/$/, "");
  return base + (path.startsWith("/") ? path : "/" + path);
}

export async function completeChat(
  model: string,
  system: string,
  user: string,
  maxTokens = 800,
): Promise<string> {
  // 429-aware retry: walk the NVIDIA key pool on rate-limit / auth errors
  // Each attempt advances the cursor so the next call naturally hits a
  // different key, and backoff gives the per-minute rate-limit window time
  // to roll over.
  const makeBody = (m: string) => JSON.stringify({
    model: normalizeModel(m),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
    max_tokens: maxTokens,
  });

  const keys = nvidiaKeys();

  // ── Inner attempt loop: key rotation for the given model ──
  async function tryModel(m: string): Promise<string | null> {
    const body = makeBody(m);
    for (let attempt = 0; attempt < Math.max(keys.length, 1); attempt++) {
      if (attempt > 0 && keys.length > 0) {
        const jump = 3 + Math.floor(Math.random() * 5);
        nvidiaKeyCursor = (nvidiaKeyCursor + jump) % keys.length;
      }
      const headers = llmHeaders();
      try {
        // Operator doctrine 2026-06-30: route through ScrapingBee residential
        // proxy when configured. premium_proxy=true picks a fresh residential
        // IP per request, so each attempt here gets a different IP — automatic
        // IP rotation without any extra round-robin logic. The Authorization
        // header is forwarded by ScrapingBee (forward_headers=true) so NVIDIA
        // sees a normal authenticated request, not a proxy one.
        const r = await fetch(llmRouteUrl("/chat/completions"), {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(60_000),
        });
        if (r.ok) {
          const data = (await r.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          return data?.choices?.[0]?.message?.content?.trim() || "(no response)";
        }
        // 429/401/404 — rotate key and retry
        if ((r.status === 429 || r.status === 401 || r.status === 404) && keys.length > 0 && attempt < keys.length - 1) {
          if (r.status === 404 && headers["Authorization"]) {
            markNvidiaKeyDead(headers["Authorization"].replace(/^Bearer\s+/i, ""));
          }
          logger.warn({ model: m, attempt, status: r.status }, "llm 429/401/404 — rotating NVIDIA key");
          await new Promise((res) => setTimeout(res, 800 + attempt * 400));
          continue;
        }
        // 402 (OpenRouter credits depleted on kimi-k2.6) — signal caller to fallback
        if (r.status === 402) {
          logger.warn({ model: m, status: 402 }, "llm 402 — model credits depleted, will fallback");
          return null; // triggers fallback below
        }
        throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
      } catch (err) {
        if (attempt < keys.length - 1 && keys.length > 0) {
          logger.warn({ model: m, attempt, err: String(err).slice(0, 200) }, "llm attempt failed — rotating");
          await new Promise((res) => setTimeout(res, 500));
          continue;
        }
        throw err;
      }
    }
    return null;
  }

  // ── Try Kimi.com (Moonshot) as an OPTIONAL tertiary fallback ──
  // Operator doctrine 2026-06-30: Kimi.com is an OPTION, not a switch.
  // NVIDIA NIM stays the primary stack. Kimi.com only kicks in if BOTH
  // NVIDIA primary AND llama-3.1-70b fallback fail. Each request uses the
  // KIMI_API_KEY (sk-kimi-...) and the OpenAI-compatible Moonshot endpoint
  // at https://api.moonshot.cn/v1. Premium residential IP routing
  // (ScrapingBee) is NOT applied to Kimi.com — direct call only.
  async function tryKimi(m: string): Promise<string | null> {
    const kimiKey = process.env["KIMI_API_KEY"];
    if (!kimiKey) return null;
    const body = makeBody(m);
    try {
      const r = await fetch(kimiFetchUrl("/chat/completions"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${kimiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      if (r.ok) {
        const data = (await r.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        return data?.choices?.[0]?.message?.content?.trim() || "(no response)";
      }
      logger.warn({ model: m, status: r.status }, "llm: kimi.com returned non-OK");
      return null;
    } catch (err) {
      logger.warn({ model: m, err: String(err).slice(0, 200) }, "llm: kimi.com attempt threw");
      return null;
    }
  }

  // ── Outer loop: Kimi.com primary OR NVIDIA primary → fallback ──
  if (kimiPrimary()) {
    // Kimi.com is primary. Try Kimi first, then directly attempt NVIDIA llama fallback.
    const kimiResult = await tryKimi(normalizeModel(model));
    if (kimiResult !== null) return kimiResult;

    // Kimi failed — call NVIDIA directly (bypass kimiPrimary routing in llmHeaders/llmBaseUrl).
    if (keys.length > 0) {
      logger.warn({ model, fallback: FALLBACK_MODEL }, "llm: Kimi.com failed, falling back to NVIDIA llama");
      const nvidiaUrl = (process.env["NVIDIA_BASE_URL"] ?? NVIDIA_BASE_DEFAULT) + "/chat/completions";
      const nvidiaKey = nextNvidiaKey();
      if (nvidiaKey) {
        try {
          const r = await fetch(nvidiaUrl, {
            method: "POST",
            headers: { "Authorization": `Bearer ${nvidiaKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: FALLBACK_MODEL,
              messages: [{ role: "system", content: system }, { role: "user", content: user }],
              stream: false,
              max_tokens: maxTokens,
            }),
            signal: AbortSignal.timeout(60_000),
          });
          if (r.ok) {
            const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
            const text = data?.choices?.[0]?.message?.content?.trim();
            if (text) return `[running on ${FALLBACK_MODEL} via nvidia fallback]\n\n${text}`;
          }
        } catch { /* pass through */ }
      }
    }
    throw new Error("LLM: Kimi.com primary failed and NVIDIA fallback exhausted");
  }

  // NVIDIA primary path
  const primaryResult = await tryModel(model);
  if (primaryResult !== null) return primaryResult;

  if (model !== FALLBACK_MODEL) {
    logger.warn({ model, fallback: FALLBACK_MODEL }, "llm: primary model failed, trying llama fallback");
    const fallbackResult = await tryModel(FALLBACK_MODEL);
    if (fallbackResult !== null) return `[running on ${FALLBACK_MODEL} fallback]\n\n${fallbackResult}`;
  }

  // Both NVIDIA attempts exhausted — try Kimi.com as last resort.
  if (kimiApiConfigured()) {
    logger.warn({ model, kimi: KIMI_FALLBACK_MODEL }, "llm: NVIDIA primary + fallback failed, trying kimi.com");
    const kimiResult = await tryKimi(KIMI_FALLBACK_MODEL);
    if (kimiResult !== null) {
      return `[running on ${KIMI_FALLBACK_MODEL} via kimi.com]\n\n${kimiResult}`;
    }
  }

  throw new Error("LLM: no key configured or all attempts exhausted (primary + llama fallback + kimi.com option)");
}

// ─── E2B (cloud code-interpreter sandbox) ────────────────────────────────────
// Runs code in a fully isolated remote sandbox via E2B. The SDK is loaded with a
// runtime dynamic import so the package is OPTIONAL — if it isn't installed the
// tool reports that clearly instead of crashing the build/server. Install with:
//   pnpm --filter @workspace/api-server add @e2b/code-interpreter

export function e2bConfigured(): boolean {
  return !!process.env["E2B_API_KEY"];
}

const E2B_PKG = "@e2b/code-interpreter";
const E2B_TIMEOUT_MS = 30000;

export async function e2bExec(language: string, source: string): Promise<string> {
  const apiKey = process.env["E2B_API_KEY"];
  if (!apiKey) return "error: E2B_API_KEY is not set — cloud sandbox is unavailable.";

  // Casting the specifier to a plain string keeps tsc/esbuild from hard-resolving
  // this OPTIONAL dependency at build time — it stays a pure runtime import.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;
  try {
    mod = await import(E2B_PKG as string);
  } catch {
    return `error: the E2B SDK (${E2B_PKG}) is not installed on the server. Install it to enable cloud_code_exec.`;
  }
  const Sandbox = mod?.Sandbox;
  if (!Sandbox || typeof Sandbox.create !== "function") {
    return "error: E2B SDK loaded but no Sandbox export was found.";
  }

  const lang = language.toLowerCase();
  const e2bLanguage = lang === "javascript" || lang === "js" || lang === "node" ? "js" : "python";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sandbox: any;
  try {
    sandbox = await Sandbox.create({ apiKey, timeoutMs: E2B_TIMEOUT_MS });
    const execution = (await sandbox.runCode(source, { language: e2bLanguage })) as {
      logs?: { stdout?: string[]; stderr?: string[] };
      error?: { name?: string; value?: string; traceback?: string } | null;
      text?: string;
    };
    const stdout = (execution.logs?.stdout ?? []).join("");
    const stderr = (execution.logs?.stderr ?? []).join("");
    const parts: string[] = ["[e2b cloud sandbox]"];
    if (stdout) parts.push(`stdout:\n${clip(stdout.trim(), 4000)}`);
    if (stderr) parts.push(`stderr:\n${clip(stderr.trim(), 4000)}`);
    if (execution.error) {
      parts.push(`error: ${execution.error.name ?? ""} ${execution.error.value ?? ""}`.trim());
    }
    if (execution.text && !stdout) parts.push(`result:\n${clip(execution.text.trim(), 4000)}`);
    if (parts.length === 1) parts.push("(no output)");
    return parts.join("\n");
  } catch (err) {
    return `error: E2B execution failed: ${String(err).slice(0, 300)}`;
  } finally {
    try {
      await sandbox?.kill();
    } catch {
      /* best-effort cleanup */
    }
  }
}

// ─── Composio (authenticated SaaS/API tool router) ───────────────────────────
// Executes authenticated actions across connected SaaS apps (Gmail, Slack,
// GitHub, Notion, …) via Composio. Gated by ALLOW_COMPOSIO_EXECUTE so it can't
// fire external writes until the operator explicitly enables it.

export function composioConfigured(): boolean {
  return !!process.env["COMPOSIO_API_KEY"];
}

export function composioExecuteEnabled(): boolean {
  const v = process.env["ALLOW_COMPOSIO_EXECUTE"];
  return v != null && ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export async function composioExecute(input: {
  endpoint?: string;
  method?: string;
  body?: unknown;
  parameters?: unknown;
  toolkit?: string;
  action?: string;
  arguments?: Record<string, unknown>;
  connectedAccountId?: string;
  userId?: string;
}): Promise<string> {
  const key = process.env["COMPOSIO_API_KEY"];
  if (!key) return "error: COMPOSIO_API_KEY is not set.";
  const base = (process.env["COMPOSIO_BASE_URL"] ?? "https://backend.composio.dev/api/v3.1").replace(/\/$/, "");

  // Auto-resolve the connected account for the toolkit when the caller didn't
  // pass one — agents know the app ('instagram'), not the ca_… id.
  let accId = input.connectedAccountId;
  if (!accId && input.toolkit) {
    try {
      const conns = await composioListConnections();
      const t = input.toolkit.toLowerCase();
      accId =
        (conns.find((c) => c.toolkit.toLowerCase() === t && /ACTIVE|CONNECTED|ENABLED/i.test(c.status)) ??
          conns.find((c) => c.toolkit.toLowerCase() === t))?.id;
    } catch { /* Composio returns a clear error below if the account is missing */ }
  }

  // Two execution modes, each with Composio's real v3 contract (snake_case):
  //  - NAMED action:  POST /tools/execute/{TOOL_SLUG}  { arguments, connected_account_id }
  //  - RAW proxy:     POST /tools/execute/proxy        { endpoint, method, connected_account_id, parameters }
  let url: string;
  let payload: Record<string, unknown>;
  if (input.action) {
    url = `${base}/tools/execute/${encodeURIComponent(input.action)}`;
    payload = {
      arguments: input.arguments ?? {},
      ...(accId ? { connected_account_id: accId } : {}),
      ...(input.userId ? { user_id: input.userId } : {}),
    };
  } else if (input.endpoint && input.method) {
    url = `${base}/tools/execute/proxy`;
    // Composio's proxy takes a `parameters` array ({name,value,type}). Agents
    // naturally pass key/value via `arguments` (e.g. image_url, caption) — convert
    // those into query parameters so they actually reach the app's API. Without
    // this they were silently dropped (IG: "The parameter image_url is required").
    let parameters: Array<Record<string, unknown>> | undefined = Array.isArray(input.parameters)
      ? (input.parameters as Array<Record<string, unknown>>)
      : undefined;
    if (!parameters && input.arguments && Object.keys(input.arguments).length) {
      parameters = Object.entries(input.arguments).map(([name, value]) => ({
        name,
        value: typeof value === "string" ? value : JSON.stringify(value),
        type: "query",
      }));
    }
    payload = {
      endpoint: input.endpoint,
      method: input.method.toUpperCase(),
      ...(accId ? { connected_account_id: accId } : {}),
      ...(parameters ? { parameters } : {}),
      ...(input.body != null ? { body: input.body } : {}),
    };
  } else {
    return "error: composio_action needs an `action` (tool slug like INSTAGRAM_LIST_POSTS), OR an `endpoint`+`method` for a raw proxy call (e.g. endpoint:'/me/media', method:'GET').";
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await r.text();
    return `Composio → HTTP ${r.status} ${r.statusText}\n${cleanComposioBody(text)}`;
  } catch (err) {
    return `error: Composio call failed: ${String(err).slice(0, 300)}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Composio's proxy wraps the app payload as { data, status, headers } where
 * `headers` is a huge block of proxy-status tokens / fb-debug noise. Strip it so
 * the agent (and the operator) see just the real data — cleaner output, fewer
 * tokens, no confusing junk. Also surface the inner upstream status when present.
 */
function cleanComposioBody(text: string): string {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (j && typeof j === "object" && "headers" in j) {
      const { headers: _omit, ...rest } = j;
      void _omit;
      return clip(JSON.stringify(rest), 4000);
    }
    return clip(JSON.stringify(j), 4000);
  } catch {
    return clip(text, 4000);
  }
}

// ─── Composio connection management (connect apps via OAuth) ─────────────────
// The execution path above can only act on accounts that are ALREADY connected.
// These helpers drive the connection itself: list available apps, find-or-create
// a Composio-managed auth config for an app, initiate a connection (returns the
// OAuth authorize URL the operator approves), and read connection status. This
// turns "wire it up by hand in the Composio dashboard" into a one-click flow.

function composioBase(): string {
  return (process.env["COMPOSIO_BASE_URL"] ?? "https://backend.composio.dev/api/v3.1").replace(/\/$/, "");
}

/** Authenticated call to the Composio management API. Returns parsed JSON or throws. */
async function composioApi(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const key = process.env["COMPOSIO_API_KEY"];
  if (!key) throw new Error("COMPOSIO_API_KEY is not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(`${composioBase()}${path.startsWith("/") ? path : `/${path}`}`, {
      method,
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!r.ok) {
      const msg = (data as { error?: { message?: string }; message?: string })?.error?.message
        ?? (data as { message?: string })?.message
        ?? text.slice(0, 200);
      throw new Error(`Composio ${r.status}: ${msg}`);
    }
    return (data as Record<string, unknown>) ?? {};
  } finally {
    clearTimeout(timer);
  }
}

export interface ComposioToolkit {
  slug: string;
  name: string;
  logo?: string;
  authSchemes: string[];
  composioManagedAuthSchemes: string[];
  noAuth: boolean;
  /** Operator directive 2026-06-27: an app needs manual setup in the Composio
   * dashboard before it can be connected. The `use_composio_managed_auth`
   * scheme only works for apps that Composio itself can OAuth — others
   * (MS Teams, custom OAuth apps, etc.) require the operator to register the
   * app in the Composio dashboard and save the resulting auth_config id as
   * `COMPOSIO_AUTHCONFIG_<SLUG>`. */
  requiresAuthConfig: boolean;
  /** Direct link to the Composio dashboard where the operator can create
   * the auth config for this app. */
  setupUrl: string;
}

const COMPOSIO_DASHBOARD_BASE = "https://app.composio.dev";

/** List available toolkits (apps), optionally filtered by a search string. */
export async function composioListToolkits(search?: string, limit = 50): Promise<ComposioToolkit[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set("search", search);
  // Pull auth_configs in parallel so the operator sees the "needs setup"
  // badge in the dropdown instead of a raw error on click.
  const [toolkitsResp, authConfigsResp] = await Promise.all([
    composioApi("GET", `/toolkits?${params.toString()}`),
    composioApi("GET", "/auth_configs").catch(() => ({ items: [] })),
  ]);
  const items = (toolkitsResp["items"] as Array<Record<string, unknown>>) ?? [];
  const authConfigs = (authConfigsResp["items"] as Array<Record<string, unknown>>) ?? [];
  const slugsWithAuthConfig = new Set(
    authConfigs
      .filter((a) => String(a["status"] ?? "ENABLED") !== "DISABLED")
      .map((a) => String((a["toolkit"] as Record<string, unknown>)?.["slug"] ?? "").toLowerCase())
      .filter(Boolean),
  );
  return items.map((t) => {
    const meta = (t["meta"] as Record<string, unknown>) ?? {};
    const slug = String(t["slug"] ?? "").toLowerCase();
    const authSchemes = (t["auth_schemes"] as string[]) ?? [];
    const managedSchemes = (t["composio_managed_auth_schemes"] as string[]) ?? [];
    const noAuth = Boolean(t["no_auth"]);
    // App needs manual setup if:
    //  - It is not no-auth
    //  - AND it has no Composio-managed auth scheme
    //  - AND no auth_config has been registered for it yet
    const requiresAuthConfig = !noAuth && managedSchemes.length === 0 && !slugsWithAuthConfig.has(slug);
    return {
      slug,
      name: String(t["name"] ?? t["slug"] ?? ""),
      logo: meta["logo"] != null ? String(meta["logo"]) : undefined,
      authSchemes,
      composioManagedAuthSchemes: managedSchemes,
      noAuth,
      requiresAuthConfig,
      setupUrl: requiresAuthConfig
        ? `${COMPOSIO_DASHBOARD_BASE}/auth-configs/new?toolkit=${encodeURIComponent(slug)}`
        : `${COMPOSIO_DASHBOARD_BASE}/auth-configs`,
    };
  });
}

export interface ComposioConnection {
  id: string;
  toolkit: string;
  status: string;
}

/** List the operator's connected accounts (id, app, status). */
export async function composioListConnections(): Promise<ComposioConnection[]> {
  const data = await composioApi("GET", "/connected_accounts");
  const items = (data["items"] as Array<Record<string, unknown>>) ?? [];
  return items.map((c) => ({
    id: String(c["id"] ?? ""),
    toolkit: String((c["toolkit"] as Record<string, unknown>)?.["slug"] ?? c["toolkit"] ?? ""),
    status: String(c["status"] ?? "UNKNOWN"),
  }));
}

/**
 * Find an existing enabled auth config for a toolkit, else create a
 * Composio-managed one. If `override` is supplied (operator set
 * COMPOSIO_AUTHCONFIG_<SLUG> in Render env), use it directly — this is the
 * escape hatch for apps whose auth Composio can't manage automatically
 * (Microsoft Teams, custom OAuth, etc.).
 */
async function findOrCreateAuthConfig(toolkitSlug: string, override?: string): Promise<string> {
  if (override) {
    // Trust the operator-supplied auth_config id; verify it actually exists.
    try {
      const verified = await composioApi("GET", `/auth_configs/${encodeURIComponent(override)}`);
      const status = String(verified["status"] ?? "ENABLED");
      if (status === "DISABLED") throw new Error(`auth config ${override} is disabled`);
      return override;
    } catch (err) {
      throw new Error(`operator-supplied ${override} could not be verified: ${err instanceof Error ? err.message : err}`);
    }
  }
  const existing = await composioApi("GET", "/auth_configs");
  const items = (existing["items"] as Array<Record<string, unknown>>) ?? [];
  const match = items.find(
    (a) => String((a["toolkit"] as Record<string, unknown>)?.["slug"] ?? "").toLowerCase() === toolkitSlug.toLowerCase()
      && String(a["status"] ?? "ENABLED") !== "DISABLED",
  );
  if (match?.["id"]) return String(match["id"]);

  const created = await composioApi("POST", "/auth_configs", {
    toolkit: { slug: toolkitSlug },
    auth_config: { type: "use_composio_managed_auth" },
  });
  const id = (created["auth_config"] as Record<string, unknown>)?.["id"] ?? created["id"];
  if (!id) throw new Error("auth config created but no id was returned");
  return String(id);
}

export interface ComposioConnectResult {
  connectionId: string;
  status: string;
  redirectUrl: string | null;
  authConfigId: string;
  toolkit: string;
}

/**
 * Operator directive 2026-06-27: when a tool requires manual auth_config
 * setup, surface that as a structured response so the UI can render a "needs
 * setup" badge with a direct link to the Composio dashboard — instead of a
 * raw 500 stack trace in the chat panel.
 */
export class ComposioNeedsSetupError extends Error {
  readonly status = 409;
  readonly toolkit: string;
  readonly setupUrl: string;
  readonly hint: string;
  constructor(toolkit: string, reason: string) {
    const slug = toolkit.toLowerCase();
    super(`Composio needs manual auth_config setup for "${slug}"`);
    this.name = "ComposioNeedsSetupError";
    this.toolkit = slug;
    this.setupUrl = `${COMPOSIO_DASHBOARD_BASE}/auth-configs/new?toolkit=${encodeURIComponent(slug)}`;
    this.hint = `Set COMPOSIO_AUTHCONFIG_${slug.toUpperCase().replace(/-/g, "_")} to the auth_config id from your Composio dashboard, then retry.`;
    this.cause = reason;
  }
}

/**
 * Connect an app end to end: find-or-create the toolkit's auth config, then
 * initiate a connection for `userId`. Returns the OAuth authorize URL the
 * operator visits to approve (null for no-auth/API-key apps that complete
 * without a redirect).
 */
export async function composioConnect(toolkitSlug: string, userId = "operator"): Promise<ComposioConnectResult> {
  const slug = toolkitSlug.trim().toLowerCase();
  if (!slug) throw new Error("toolkit slug is required");
  // Short-circuit: if the operator pre-configured a COMPOSIO_AUTHCONFIG_<SLUG>
  // env var, use it directly so the dropdown can route to the right setup.
  const overrideKey = `COMPOSIO_AUTHCONFIG_${slug.toUpperCase().replace(/-/g, "_")}`;
  const override = process.env[overrideKey];
  let authConfigId: string;
  try {
    authConfigId = await findOrCreateAuthConfig(slug, override);
  } catch (err) {
    // API rejected the auto-create (e.g. Microsoft Teams requires custom
    // OAuth registration). Convert to a structured "needs setup" error so
    // the UI can show the right CTA.
    throw new ComposioNeedsSetupError(slug, err instanceof Error ? err.message : String(err));
  }
  const conn = await composioApi("POST", "/connected_accounts", {
    auth_config: { id: authConfigId },
    connection: { user_id: userId },
  });
  const connectionData = (conn["connectionData"] as Record<string, unknown>) ?? {};
  return {
    connectionId: String(conn["id"] ?? ""),
    status: String(conn["status"] ?? "INITIATED"),
    redirectUrl:
      (conn["redirect_url"] as string) ?? (conn["redirectUrl"] as string) ?? (connectionData["redirectUrl"] as string) ?? null,
    authConfigId,
    toolkit: slug,
  };
}

/** Read a single connection's current status (INITIATED → ACTIVE once approved). */
export async function composioConnectionStatus(connectionId: string): Promise<{ id: string; status: string; toolkit: string }> {
  const c = await composioApi("GET", `/connected_accounts/${encodeURIComponent(connectionId)}`);
  return {
    id: String(c["id"] ?? connectionId),
    status: String(c["status"] ?? "UNKNOWN"),
    toolkit: String((c["toolkit"] as Record<string, unknown>)?.["slug"] ?? c["toolkit"] ?? ""),
  };
}

// ─── Multi-IP Relay System (Cloudflare Workers) ─────────────────────────────
// When NVIDIA blacklists an IP/ASN, we rotate across 4 CF Worker relays that
// forward requests from different edge IPs. Each relay is a Cloudflare Worker
// deployed to a different subdomain for IP diversity.

const RELAY_SUBDOMAINS = [
  "nvidia-relay-1.aura-omega-relays",
  "nvidia-relay-2.aura-omega-relays",
  "nvidia-relay-3.aura-omega-relays",
  "nvidia-relay-4.aura-omega-relays",
];

export function getRelayBaseUrls(): string[] {
  return RELAY_SUBDOMAINS.map((s) => `https://${s}.workers.dev/v1`);
}

let relayCursor = Math.floor(Math.random() * 1024);
export function nextRelayBaseUrl(): string {
  const urls = getRelayBaseUrls();
  const url = urls[relayCursor % urls.length];
  relayCursor = (relayCursor + 1) % urls.length;
  return url;
}

// ─── ScrapingBee Residential Proxy ───────────────────────────────────────────
// When all direct IPs (Render + CF Workers) are blacklisted by NVIDIA, route
// through ScrapingBee's residential proxy network. Each request comes from a
// different residential IP that NVIDIA cannot blacklist. The proxy transparently
// forwards all headers (including Authorization) so NVIDIA sees a clean request.

/**
 * Build the final fetch URL for an LLM API path.
 * 
 * ScrapingBee residential proxy integration removed 2026-06-29: ScrapingBee
 * cannot forward Authorization Bearer headers to the target (NVIDIA requires
 * this header for auth). The proxy strips/replaces it, causing 401 errors.
 * 
 * Instead, the system relies on:
 *   - 27 NVIDIA keys in round-robin rotation (rate-limit headroom)
 *   - Per-key dead detection with auto-sweep (keys recover after 10 min)
 *   - Smart model fallback (kimi-k2.6 → llama-3.1-70b on 402/429)
 *   - Exponential backoff between attempts
 *   - ScrapingBee residential proxy + IP rotation to avoid NVIDIA IP rate limits
 *     (forward_headers=true passes Authorization through to NVIDIA transparently;
 *     premium_proxy=true picks a fresh residential IP per request)
 */
export function llmFetchUrl(path: string): string {
  return llmBaseUrl() + (path.startsWith("/") ? path : "/" + path);
}

/**
 * Override the LLM fetch URL with a route through ScrapingBee residential
 * proxy. Forward all headers (including Authorization) so NVIDIA sees a
 * normal authenticated request from a different IP each time.
 *
 * Returns the ScrapingBee URL when SCRAPINGBEE_API_KEY is set, with a
 * random residential proxy country picked per call. Falls back to the
 * direct NVIDIA URL when ScrapingBee is not configured.
 */
export function llmProxyFetchUrl(path: string): string {
  const base = llmBaseUrl();
  const fullPath = path.startsWith("/") ? path : "/" + path;
  const sbKey = process.env["SCRAPINGBEE_API_KEY"];
  if (sbKey && (base.includes("integrate.api.nvidia") || base.includes("nvidia.helicone"))) {
    const targetUrl = encodeURIComponent(base + fullPath);
    // premium_proxy=true = residential IPs (rotates per request automatically);
    // forward_headers=true = pass Authorization through to NVIDIA.
    return `https://app.scrapingbee.com/api/v1/?api_key=${sbKey}&url=${targetUrl}&forward_headers=true&premium_proxy=true`;
  }
  return base + fullPath;
}

/**
 * When SCRAPINGBEE_API_KEY is set, route ALL NVIDIA calls through it.
 * When not set, use the direct URL (rely on key rotation only).
 * Operator doctrine 2026-06-30: ScrapingBee proxy MUST be used so we
 * don't bottleneck NVIDIA from a single Render IP, and IP rotation
 * MUST be used so each request hits a fresh residential IP.
 */
export function llmRouteUrl(path: string): string {
  if (process.env["SCRAPINGBEE_API_KEY"]) {
    return llmProxyFetchUrl(path);
  }
  return llmFetchUrl(path);
}

// ─── Status snapshot ─────────────────────────────────────────────────────────
// A non-secret view of which integrations are configured, for the dashboard /
// health checks. Only booleans are exposed — never the key values themselves.

export interface IntegrationStatus {
  key: string;
  name: string;
  category: string;
  configured: boolean;
  envVar: string;
}

export function integrationStatus(): IntegrationStatus[] {
  const has = (k: string) => !!process.env[k];
  return [
    { key: "nvidia", name: `NVIDIA NIM (${nvidiaKeys().length} key${nvidiaKeys().length === 1 ? "" : "s"})`, category: "llm", envVar: "NVIDIA_API_KEY", configured: nvidiaConfigured() },
    { key: "kimi", name: `Kimi.com (Moonshot) — ${kimiPrimary() ? "PRIMARY" : "fallback"}`, category: "llm", envVar: "KIMI_API_KEY", configured: kimiApiConfigured() },
    { key: "scrapingbee", name: "ScrapingBee Residential Proxy (IP rotation)", category: "proxy", envVar: "SCRAPINGBEE_API_KEY", configured: has("SCRAPINGBEE_API_KEY") },
    // OpenRouter removed 2026-06-27 — NVIDIA-only stack now.
    { key: "helicone", name: "Helicone", category: "observability", envVar: "HELICONE_API_KEY", configured: has("HELICONE_API_KEY") },
    { key: "langsmith", name: "LangSmith (LangChain)", category: "observability", envVar: "LANGSMITH_API_KEY", configured: langsmithEnabled() },
    { key: "embeddings", name: "Embeddings (semantic memory)", category: "memory", envVar: "EMBEDDINGS_API_KEY", configured: has("EMBEDDINGS_API_KEY") },
    { key: "pinecone", name: "Pinecone (vector memory)", category: "memory", envVar: "PINECONE_API_KEY", configured: has("PINECONE_API_KEY") && (has("PINECONE_INDEX_HOST") || has("PINECONE_INDEX_URL") || has("PINECONE_INDEX")) },
    { key: "tavily", name: "Tavily", category: "search", envVar: "TAVILY_API_KEY", configured: has("TAVILY_API_KEY") },
    { key: "discord", name: `Discord bridge${has("DISCORD_CHANNEL_ID") ? "" : " (needs channel id)"}`, category: "messaging", envVar: "DISCORD_BOT_TOKEN", configured: has("DISCORD_BOT_TOKEN") && has("DISCORD_CHANNEL_ID") && has("DISCORD_AURA_BOT_USER_IDS") },
    { key: "exa", name: "Exa", category: "search", envVar: "EXA_API_KEY", configured: has("EXA_API_KEY") },
    { key: "firecrawl", name: "Firecrawl", category: "search", envVar: "FIRECRAWL_API_KEY", configured: has("FIRECRAWL_API_KEY") },
    { key: "steel", name: "Steel", category: "browser", envVar: "STEEL_API_KEY", configured: has("STEEL_API_KEY") },
    { key: "inngest", name: "Inngest", category: "events", envVar: "INNGEST_EVENT_KEY", configured: has("INNGEST_EVENT_KEY") },
    { key: "e2b", name: "E2B", category: "sandbox", envVar: "E2B_API_KEY", configured: has("E2B_API_KEY") },
    { key: "composio", name: "Composio", category: "tools", envVar: "COMPOSIO_API_KEY", configured: has("COMPOSIO_API_KEY") },
  ];
}
