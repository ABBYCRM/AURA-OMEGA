/**
 * A2E (a2e.ai) image + video generation client.
 *
 * Wires the "Image" and "Video" composer modes to real generation:
 *   - text → image:        POST /api/v1/userText2Image/start   → poll batchDetail
 *   - image → video:       POST /api/v1/userImage2Video/start  → poll batchDetail
 *   - text → video:        text→image (A2E) then image→video (A2E)
 *
 * Auth: Bearer token (starts with `sk_`) in the Authorization header.
 * Base: https://video.a2e.ai (override with A2E_BASE_URL).
 *
 * A2E jobs are asynchronous: start returns a record id, then you poll a
 * batchDetail endpoint until a result media URL appears. We extract the result
 * URL defensively (deep-scan for the first http(s) URL with a media extension)
 * so we don't break if A2E renames a response field.
 */
import { logger } from "./logger";

const DEFAULT_BASE = "https://video.a2e.ai";
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|$)/i;

export function a2eConfigured(): boolean {
  return !!process.env["A2E_API_KEY"];
}

function base(): string {
  return (process.env["A2E_BASE_URL"] ?? DEFAULT_BASE).replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const key = process.env["A2E_API_KEY"] ?? "";
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** Depth-first scan for the first string value matching `re`. */
function findUrl(value: unknown, re: RegExp, seen = new Set<unknown>()): string | null {
  if (value == null || seen.has(value)) return null;
  if (typeof value === "string") return re.test(value) && /^https?:\/\//i.test(value) ? value : null;
  if (typeof value !== "object") return null;
  seen.add(value);
  for (const v of Object.values(value as Record<string, unknown>)) {
    const hit = findUrl(v, re, seen);
    if (hit) return hit;
  }
  return null;
}

async function a2eFetch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(`${base()}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
    if (!r.ok) throw new Error(`A2E ${path} → ${r.status}: ${text.slice(0, 200)}`);
    // A2E wraps as { code, msg, data }; a non-zero code is a logical failure.
    if (typeof json["code"] === "number" && json["code"] !== 0) {
      throw new Error(`A2E ${path} code=${json["code"]}: ${String(json["msg"] ?? "").slice(0, 200)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the job id out of a start-response. A2E wraps as { code, data: [{_id}] }
 *  — data is an ARRAY with one record — but tolerate an object too. */
function jobIdOf(resp: Record<string, unknown>): string | null {
  let data = resp["data"] ?? resp;
  if (Array.isArray(data)) data = data[0] ?? {};
  const rec = data as Record<string, unknown>;
  const id = rec["_id"] ?? rec["id"] ?? rec["task_id"] ?? rec["taskId"];
  return id != null ? String(id) : null;
}

/** Poll batchDetail until a media URL (matching `re`) appears, or timeout. */
async function pollForUrl(detailPath: string, id: string, re: RegExp, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let delay = 4000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay + 1000, 10000);
    let detail: Record<string, unknown>;
    try {
      detail = await a2eFetch(detailPath, { ids: [id] });
    } catch (e) {
      logger.warn({ err: String(e) }, "a2e: poll error (will retry)");
      continue;
    }
    const url = findUrl(detail, re);
    if (url) return url;
    // Surface a hard failure early. A2E uses current_status:"failed" plus a
    // failed_message; also tolerate a generic status field.
    const blob = JSON.stringify(detail).toLowerCase();
    if (/"(current_status|status)"\s*:\s*"?(failed|error|rejected)"?/.test(blob)) {
      const m = /"failed_message"\s*:\s*"([^"]+)"/.exec(JSON.stringify(detail));
      throw new Error(`A2E job failed${m ? `: ${m[1].slice(0, 160)}` : ""}`);
    }
  }
  throw new Error(`A2E job ${id} did not finish within ${Math.round(timeoutMs / 1000)}s`);
}

async function download(url: string): Promise<{ buffer: Buffer; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`A2E result download ${r.status}`);
  const mime = r.headers.get("content-type") ?? (VIDEO_EXT.test(url) ? "video/mp4" : "image/png");
  return { buffer: Buffer.from(await r.arrayBuffer()), mime };
}

export interface A2EResult {
  buffer: Buffer;
  mime: string;
  remoteUrl: string;
}

/** text → image. Returns the downloaded bytes + the A2E CDN url. */
export async function a2eImage(
  prompt: string,
  opts: { width?: number; height?: number; aspectRatio?: string } = {},
): Promise<A2EResult> {
  const body: Record<string, unknown> = { prompt, max_images: 1 };
  if (opts.width) body["width"] = opts.width;
  if (opts.height) body["height"] = opts.height;
  if (opts.aspectRatio) body["aspect_ratio"] = opts.aspectRatio;
  const start = await a2eFetch("/api/v1/userText2Image/start", body);
  const id = jobIdOf(start);
  if (!id) throw new Error("A2E text2image: no job id in response");
  const timeout = Number(process.env["A2E_IMAGE_TIMEOUT_MS"] ?? 150000);
  const remoteUrl = await pollForUrl("/api/v1/userText2Image/batchDetail", id, IMAGE_EXT, timeout);
  const { buffer, mime } = await download(remoteUrl);
  return { buffer, mime, remoteUrl };
}

/** image (public url) → video. Returns the downloaded bytes + the A2E CDN url. */
export async function a2eImageToVideo(imageUrl: string, prompt?: string): Promise<A2EResult> {
  // A2E requires BOTH prompt and negative_prompt when no LoRA is set.
  const body: Record<string, unknown> = {
    image_url: imageUrl,
    prompt: prompt && prompt.trim() ? prompt : "natural, smooth motion",
    negative_prompt: "blurry, distorted, low quality, glitch, artifacts",
  };
  const start = await a2eFetch("/api/v1/userImage2Video/start", body);
  const id = jobIdOf(start);
  if (!id) throw new Error("A2E image2video: no job id in response");
  const timeout = Number(process.env["A2E_VIDEO_TIMEOUT_MS"] ?? 360000);
  const remoteUrl = await pollForUrl("/api/v1/userImage2Video/batchDetail", id, VIDEO_EXT, timeout);
  const { buffer, mime } = await download(remoteUrl);
  return { buffer, mime, remoteUrl };
}

/** text → video: generate an A2E image first, then animate it. */
export async function a2eTextToVideo(prompt: string): Promise<A2EResult> {
  const img = await a2eImage(prompt);
  return a2eImageToVideo(img.remoteUrl, prompt);
}

/** Exposed for unit tests. */
export const _findUrl = findUrl;
export const _jobIdOf = jobIdOf;
