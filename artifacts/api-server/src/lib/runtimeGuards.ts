/**
 * Runtime orchestration guard utilities.
 *
 * These helpers are deliberately pure/small so they can be used from the
 * orchestrator, tool runner, artifact pipeline, and regression tests without
 * pulling in Express, DB, or LLM dependencies.
 */

export const DEFAULT_TOOL_ARG_BYTE_LIMIT = 24_000;

export type ToolPayloadBudgetResult =
  | { ok: true; bytes: number; maxBytes: number }
  | { ok: false; bytes: number; maxBytes: number; error: string };

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function toolCallKey(missionId: string | number, toolName: string, args: unknown): string {
  return `${missionId}:${toolName}:${canonicalJson(args)}`;
}

export function checkToolPayloadBudget(
  toolName: string,
  args: unknown,
  maxBytes = DEFAULT_TOOL_ARG_BYTE_LIMIT,
): ToolPayloadBudgetResult {
  const payload = JSON.stringify(args ?? {});
  const bytes = Buffer.byteLength(payload, "utf8");
  if (bytes <= maxBytes) return { ok: true, bytes, maxBytes };
  return {
    ok: false,
    bytes,
    maxBytes,
    error: `error: ${toolName} arguments are ${bytes} bytes, above the ${maxBytes} byte runtime limit. Chunk the operation or write output in sections.`,
  };
}

export function sanitizeFinalOutput(text: string, expectedLanguage = "en"): string {
  let clean = text
    .split(String.fromCharCode(0)).join("")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "�")
    .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, "$1�")
    .replace(/\bI'llQB\b/g, "I'll")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();

  if (expectedLanguage === "en") {
    clean = clean.replace(/[\u200B-\u200D\uFEFF]/g, "");
  }

  return clean;
}

export function hasUnexpectedScript(text: string, expectedLanguage = "en"): boolean {
  if (expectedLanguage !== "en") return false;
  // Catch the observed stream contamination class without blocking normal emoji,
  // punctuation, code, or URLs.
  return /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text);
}

export function ensureFinalAnswer(candidate: unknown, fallbackParts: string[] = []): string {
  const direct = typeof candidate === "string" ? sanitizeFinalOutput(candidate) : "";
  if (direct) return direct;
  const fallback = fallbackParts.map((p) => sanitizeFinalOutput(p)).filter(Boolean).join("\n\n");
  return fallback || "UNVERIFIED: no final answer was produced by the runtime.";
}

export type ArtifactVerificationInput = {
  toolSucceeded: boolean;
  url?: string | null;
  fileId?: string | number | null;
  contentLength?: number | null;
  expectedType?: string | null;
  actualType?: string | null;
};

export type ArtifactVerificationResult =
  | { status: "COMPLETE" }
  | { status: "CONTENT_READY_ARTIFACT_FAILED"; reasons: string[] };

export function verifyArtifactDelivery(input: ArtifactVerificationInput): ArtifactVerificationResult {
  const reasons: string[] = [];
  if (!input.toolSucceeded) reasons.push("artifact tool did not return success");
  if (!input.url && input.fileId == null) reasons.push("missing artifact URL/file id");
  if ((input.contentLength ?? 0) <= 0) reasons.push("artifact content is empty");
  if (input.expectedType && input.actualType && input.expectedType !== input.actualType) {
    reasons.push(`artifact type mismatch: expected ${input.expectedType}, got ${input.actualType}`);
  }
  return reasons.length ? { status: "CONTENT_READY_ARTIFACT_FAILED", reasons } : { status: "COMPLETE" };
}

export function installFinalAnswerCrashGuard(): void {
  const g = globalThis as typeof globalThis & { finalAnswer?: string };
  g.finalAnswer ??= "";
}
