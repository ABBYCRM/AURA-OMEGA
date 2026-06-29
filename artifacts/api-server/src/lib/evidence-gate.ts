/**
 * Final Output Evidence Gate.
 *
 * Operator doctrine (2026-06-27 18:46): "read, understand, learn, add to
 * memory, then perform the task" — and the output stage must enforce:
 *   1. No raw tool-call markup leaks to UI
 *   2. No malformed JSON tool-args reach the operator
 *   3. Numeric pricing claims are normalized to a unit taxonomy (CPC/CPL/etc.)
 *   4. Every recommendation carries source + confidence
 *   5. Long final answers auto-artifact instead of truncating in UI
 *
 * All helpers are pure (no I/O) so they can be unit-tested and reused from
 * the orchestrator, message persistence, and synthesis path.
 */

// ─── 1. Tool-call markup sanitizer ─────────────────────────────────────────

/**
 * Provider tool-call tokens that MUST NEVER appear in operator-visible text:
 *   <|tool_calls_section_begin|> ... <|tool_calls_section_end|>
 *   <|tool_call_begin|> functions.<name>:N
 *   <|tool_call_argument_begin|> ... <|tool_call_argument_end|>
 *   <|tool_call_end|>
 *
 * If detected, the offending block is replaced with a neutral placeholder
 * and the function returns a `contaminated: true` flag so the caller can
 * decide whether to drop the message, repair-loop the model, or just log it.
 */
const TOOL_CALL_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "tool_calls_section_begin", pattern: /<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g },
  { name: "tool_call_begin", pattern: /<\|tool_call_begin\|>/g },
  { name: "tool_call_end", pattern: /<\|tool_call_end\|>/g },
  { name: "tool_call_argument_begin", pattern: /<\|tool_call_argument_begin\|>[\s\S]*?<\|tool_call_argument_end\|>/g },
  { name: "functions_dot_call", pattern: /\bfunctions\.\w+:\d+/g },
  { name: "tool_calls_prefix", pattern: /<\|tool_calls_section_begin\|>/g },
  { name: "tool_call_id", pattern: /<\|tool_call_id\|>[\s\S]*?<\|/g },
  { name: "obsolete_tool_calls", pattern: /<\|obsolete_tool_call\|>[\s\S]*?<\|/g },
];

export interface SanitizeToolCallResult {
  text: string;
  contaminated: boolean;
  patternsFound: string[];
}

export function sanitizeToolCallMarkup(text: string): SanitizeToolCallResult {
  if (!text || typeof text !== "string") return { text: text ?? "", contaminated: false, patternsFound: [] };
  let out = text;
  const patternsFound: string[] = [];
  for (const { name, pattern } of TOOL_CALL_PATTERNS) {
    if (pattern.test(out)) {
      patternsFound.push(name);
      // Reset regex lastIndex since global patterns retain state.
      pattern.lastIndex = 0;
      out = out.replace(pattern, name === "functions_dot_call" ? "[tool-call-stripped]" : "");
    }
  }
  // Collapse any double-blank lines left behind by stripping.
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return { text: out, contaminated: patternsFound.length > 0, patternsFound };
}

// ─── 2. Malformed-JSON detector ─────────────────────────────────────────────

/**
 * A common model bug: emitting a tool-call JSON arg with nested unescaped
 * quotes, e.g. `{"query": ""foo" "bar""}`. The result is invalid JSON and
 * would crash the downstream tool runner.
 *
 * Returns the first suspect JSON fragment + a parse error message, or null
 * if the text doesn't contain any JSON-looking fragments.
 */
export interface JsonFragmentProblem {
  fragment: string;
  error: string;
  contextStart: number;
}

export function findMalformedJson(text: string): JsonFragmentProblem[] {
  if (!text || typeof text !== "string") return [];
  const problems: JsonFragmentProblem[] = [];
  // Match any `{ ... }` that looks like JSON (at least one double-quoted key
  // followed by a colon). Excludes prose like "this {sentence}" with no JSON
  // structure. Won't catch deeply-nested objects — those are detected by the
  // runtime's JSON parser before they reach here.
  const candidates = text.match(/\{[^{}]*?"[^{}]*?:[^{}]*?\}/g) ?? [];
  for (const fragment of candidates) {
    try {
      JSON.parse(fragment);
    } catch (err) {
      const contextStart = text.indexOf(fragment);
      problems.push({
        fragment: fragment.length > 200 ? fragment.slice(0, 200) + "…" : fragment,
        error: err instanceof Error ? err.message : String(err),
        contextStart,
      });
    }
  }
  return problems;
}

// ─── 3. Pricing unit normalizer ─────────────────────────────────────────────

export type PricingUnit =
  | "CPC"           // cost per click
  | "CPL"           // cost per lead (raw lead)
  | "CPQL"          // cost per qualified lead
  | "CPS"           // cost per signed case / acquisition
  | "CAC"           // full customer acquisition cost
  | "SETTLEMENT"    // average settlement value ($)
  | "LEAD_PRICE"    // per-lead transfer price (buy-side)
  | "TRANSFER_PRICE"; // what the lead sells for to a buyer

export interface NormalizedPrice {
  raw: string;
  unit: PricingUnit;
  lowUsd: number | null;
  highUsd: number | null;
  context: string; // 60 chars around the match
}

const UNIT_TOKENS: Array<{ pattern: RegExp; unit: PricingUnit }> = [
  // "$X per click" or "$X/click" — unit AFTER price (with optional range).
  { pattern: /\$([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?\s*(?:\/|per)\s*(?:click|cpc|click-through)\b/gi, unit: "CPC" },
  // "cost per click: $X" or "CPC: $X" — unit BEFORE price (with optional range).
  { pattern: /(?:cpc|cost[\s-]per[\s-]click)\b[\s\S]{0,80}?\$?([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?/gi, unit: "CPC" },
  // "$X per lead" or "$X/lead".
  { pattern: /\$([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?\s*(?:\/|per)\s*(?:lead|cpl)\b/gi, unit: "CPL" },
  // "cost per lead: $X" or "CPL: $X".
  { pattern: /(?:cpl|cost[\s-]per[\s-]lead)\b[\s\S]{0,80}?\$?([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?/gi, unit: "CPL" },
  // "$X per qualified lead".
  { pattern: /\$([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?\s*(?:\/|per)\s*(?:qualified|qualified[\s-]lead|cpql)\b/gi, unit: "CPQL" },
  { pattern: /(?:cpql|cost[\s-]per[\s-]qualified[\s-]lead)\b[\s\S]{0,80}?\$?([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?/gi, unit: "CPQL" },
  // "$X per signed case".
  { pattern: /\$([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?\s*(?:\/|per)\s*(?:signed|case|signed[\s-]case|cps)\b/gi, unit: "CPS" },
  { pattern: /(?:cps|cost[\s-]per[\s-]signed[\s-]case|cost[\s-]per[\s-]case)\b[\s\S]{0,80}?\$?([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?/gi, unit: "CPS" },
  // Customer acquisition cost.
  { pattern: /(?:cac|customer[\s-]acquisition[\s-]cost)\b[\s\S]{0,80}?\$?([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?/gi, unit: "CAC" },
  // Settlement value.
  { pattern: /(?:settlement[\s-]value|average[\s-]settlement)\b[\s\S]{0,80}?\$?([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?/gi, unit: "SETTLEMENT" },
  // Transfer / buy / sell price.
  { pattern: /(?:transfer[\s-]price|sell[s]?[\s-]for|buy[\s-]price)\b[\s\S]{0,80}?\$?([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?/gi, unit: "TRANSFER_PRICE" },
  // Lead price.
  { pattern: /(?:lead[\s-]price)\b[\s\S]{0,80}?\$?([\d,]+(?:\.\d+)?)\s*(?:[-–—]\s*\$?([\d,]+(?:\.\d+)?))?/gi, unit: "LEAD_PRICE" },
];

const RANGE_PATTERN = /^\$?([\d,]+(?:\.\d+)?)\s*[–\-—]\s*\$?([\d,]+(?:\.\d+)?)/;

export function normalizePricingClaims(text: string): NormalizedPrice[] {
  if (!text || typeof text !== "string") return [];
  const out: NormalizedPrice[] = [];
  for (const { pattern, unit } of UNIT_TOKENS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const matched = match[0];
      // Try to extract low/high from the matched text (e.g. "$150-300")
      const rangeMatch = matched.match(RANGE_PATTERN) ?? text.slice(match.index, match.index + 80).match(RANGE_PATTERN);
      let low: number | null = null;
      let high: number | null = null;
      if (rangeMatch) {
        low = parseFloat(rangeMatch[1].replace(/,/g, ""));
        high = parseFloat(rangeMatch[2].replace(/,/g, ""));
      } else if (match[1] && match[2]) {
        // Two-capture pattern (range with explicit second number).
        low = parseFloat(match[1].replace(/,/g, ""));
        high = parseFloat(match[2].replace(/,/g, ""));
      } else {
        const single = parseFloat((match[1] ?? matched).replace(/[$,]/g, ""));
        if (!isNaN(single)) {
          low = single;
          high = single;
        }
      }
      const ctxStart = Math.max(0, match.index - 30);
      const ctxEnd = Math.min(text.length, match.index + matched.length + 30);
      out.push({
        raw: matched,
        unit,
        lowUsd: low,
        highUsd: high,
        context: text.slice(ctxStart, ctxEnd),
      });
    }
  }
  return out;
}

/**
 * Diagnostic: scan a piece of text for the "average CPL is $150-300 per click"
 * confusion — common bug where the model mixes CPC and CPL. Returns a list of
 * sentences that contain BOTH a CPC marker and a CPL marker (or similar).
 */
export function findPricingUnitConfusion(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const confused: string[] = [];
  for (const s of sentences) {
    const sLower = s.toLowerCase();
    const hasCpc = /\b(cpc|cost[\s-]per[\s-]click)\b/.test(sLower);
    const hasCpl = /\b(cpl|cost[\s-]per[\s-]lead)\b/.test(sLower);
    const hasCps = /\b(cps|cost[\s-]per[\s-]signed|signed[\s-]case)\b/.test(sLower);
    const hasDollarRange = /\$\s*\d/.test(s) || /\$\d+\s*[-–—]/.test(s);
    // "cost per lead is $150-300 per click" = confused
    if ((hasCpc && hasCpl) || (hasCpc && hasDollarRange && /\b(lead|leads)\b/.test(sLower)) || (hasCpl && hasDollarRange && /\b(click|clicks)\b/.test(sLower))) {
      confused.push(s.trim());
    }
  }
  return confused;
}

// ─── 4. Claim → source → confidence table ───────────────────────────────────

export type Confidence = "verified" | "inferred" | "unverified";

export interface AttributedClaim {
  claim: string;
  confidence: Confidence;
  source: string | null; // tool name, URL, or "no source cited"
}

const CONFIDENCE_PATTERNS: Array<{ pattern: RegExp; confidence: Confidence }> = [
  { pattern: /\b(verified|confirmed|documented|per (?:the )?(?:source|article|page)|(?:according|per) to [A-Z])/i, confidence: "verified" },
  { pattern: /\b(confidence\s*[:=]\s*(?:low|medium|high|partial|uncertain)|inferred|estimated|approximately|roughly|likely|probably|tends to)/i, confidence: "inferred" },
  { pattern: /\b(unverified|unconfirmed|anecdotal|rumor|rumour|no source|not verified|cannot verify)/i, confidence: "unverified" },
];

/**
 * Scan the final synthesis text and tag each top-level recommendation/bullet
 * with a confidence level. Used by the renderer to attach ✅/⚠️/❌ icons and
 * to gate the message from being presented as "final" until every claim has
 * a source URL or explicit unverified mark.
 */
export function attributeClaims(text: string): AttributedClaim[] {
  if (!text || typeof text !== "string") return [];
  const claims: AttributedClaim[] = [];
  // Split on numbered/list bullets OR sentence boundaries.
  const lines = text.split(/\n(?=\s*(?:\d+\.|[-*•]))|(?<=[.!?])\s+/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 10) continue;
    // Look for source URLs or tool-call refs in the same sentence.
    const urlMatch = line.match(/https?:\/\/[^\s)]+/);
    const toolMatch = line.match(/\b(?:web_search|web_scrape|tavily_search|searxng_search|crawl4ai|memory_(?:read|write))\b/);
    let source = urlMatch ? urlMatch[0] : toolMatch ? toolMatch[0] : null;
    // Strip trailing sentence punctuation from URL (e.g. "https://x.com/article.").
    if (source && /^[a-z]+:\/\//i.test(source)) source = source.replace(/[.,;:!?]+$/, "");
    // Confidence — first matching pattern wins.
    let confidence: Confidence = "unverified";
    for (const { pattern, confidence: c } of CONFIDENCE_PATTERNS) {
      if (pattern.test(line)) { confidence = c; break; }
    }
    // A cited URL or explicit tool-call ref is "verified" by default.
    if (source && confidence === "unverified") confidence = "verified";
    // Claims without source and no explicit "verified" language are
    // downgraded to "unverified" — operator directive 2026-06-27.
    if (!source && confidence === "verified") confidence = "inferred";
    claims.push({ claim: line, confidence, source });
  }
  return claims;
}

export function unverifiedClaimRatio(claims: AttributedClaim[]): number {
  if (claims.length === 0) return 0;
  const unverified = claims.filter((c) => c.confidence === "unverified").length;
  return unverified / claims.length;
}

// ─── 5. Long-answer auto-artifact ───────────────────────────────────────────

export const SAFE_UI_LENGTH = 6_000; // characters; anything longer auto-artifacts

export interface AutoArtifactResult {
  shouldArtifact: boolean;
  charCount: number;
  reason: "ok" | "exceeds-safe-length" | "truncated-mid-sentence";
}

export function shouldAutoArtifact(text: string): AutoArtifactResult {
  if (!text || typeof text !== "string") return { shouldArtifact: false, charCount: 0, reason: "ok" };
  const len = text.length;
  if (len <= SAFE_UI_LENGTH) {
    // Detect mid-sentence truncation: last 80 chars end without terminal punctuation.
    const tail = text.slice(-80).trimEnd();
    const lastChar = tail[tail.length - 1] ?? "";
    const terminal = [".", "!", "?", "]", ")", "\""].includes(lastChar);
    return { shouldArtifact: !terminal && tail.length > 40, charCount: len, reason: terminal ? "ok" : "truncated-mid-sentence" };
  }
  return { shouldArtifact: true, charCount: len, reason: "exceeds-safe-length" };
}

/**
 * Build the executive summary that gets posted to UI when the full answer
 * is auto-artifacted. Extracts the first 1-3 sentences and any "verdict"
 * line that follows a "final answer" / "conclusion" / "recommendation" header.
 */
export function executiveSummary(fullText: string, maxChars = 1200): string {
  if (!fullText) return "(no content)";
  const sentences = fullText.split(/(?<=[.!?])\s+/).slice(0, 6);
  let summary = sentences.join(" ");
  if (summary.length > maxChars) {
    summary = summary.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
  }
  return summary;
}

// ─── Master evidence gate ──────────────────────────────────────────────────

export interface EvidenceGateResult {
  safeText: string;
  blocked: boolean;
  blockReason: string | null;
  toolCallMarkupFound: string[];
  malformedJson: JsonFragmentProblem[];
  pricingConfusion: string[];
  normalizedPrices: NormalizedPrice[];
  attributedClaims: AttributedClaim[];
  unverifiedRatio: number;
  autoArtifact: AutoArtifactResult;
  executiveSummary: string | null;
}

/**
 * Master gate — call this on any candidate text before persisting it to
 * the operator-facing message stream. Returns the sanitized text plus a
 * breakdown of every issue found. Caller decides whether to:
 *   - save the sanitized text as-is (most cases)
 *   - drop the message and repair-loop the model (tool-call leakage)
 *   - save the executive summary + auto-artifact the full text (long)
 *   - downgrade claims from "verified" to "unverified" automatically
 */
export function runEvidenceGate(text: string): EvidenceGateResult {
  if (!text || typeof text !== "string") {
    return {
      safeText: text ?? "",
      blocked: false,
      blockReason: null,
      toolCallMarkupFound: [],
      malformedJson: [],
      pricingConfusion: [],
      normalizedPrices: [],
      attributedClaims: [],
      unverifiedRatio: 0,
      autoArtifact: { shouldArtifact: false, charCount: 0, reason: "ok" },
      executiveSummary: null,
    };
  }

  // 1. Strip tool-call markup. If found, BLOCK (the caller should repair-loop).
  const sanitized = sanitizeToolCallMarkup(text);
  const toolCallMarkupFound = sanitized.patternsFound;
  const blocked = toolCallMarkupFound.length > 0;
  const blockReason = blocked
    ? `raw tool-call markup leaked into assistant output: ${toolCallMarkupFound.join(", ")}`
    : null;

  // 2. Validate JSON fragments in the cleaned text.
  const malformedJson = findMalformedJson(sanitized.text);

  // 3. Normalize pricing claims + flag CPC/CPL confusion.
  const normalizedPrices = normalizePricingClaims(sanitized.text);
  const pricingConfusion = findPricingUnitConfusion(sanitized.text);

  // 4. Attribute every claim → source → confidence.
  const attributedClaims = attributeClaims(sanitized.text);
  const unverifiedRatio = unverifiedClaimRatio(attributedClaims);

  // 5. Check length / truncation → auto-artifact if needed.
  const autoArtifact = shouldAutoArtifact(sanitized.text);
  const summary = autoArtifact.shouldArtifact ? executiveSummary(sanitized.text) : null;

  return {
    safeText: sanitized.text,
    blocked,
    blockReason,
    toolCallMarkupFound,
    malformedJson,
    pricingConfusion,
    normalizedPrices,
    attributedClaims,
    unverifiedRatio,
    autoArtifact,
    executiveSummary: summary,
  };
}