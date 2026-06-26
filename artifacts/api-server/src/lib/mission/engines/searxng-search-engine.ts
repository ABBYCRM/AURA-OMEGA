/**
 * SearXNG Search Engine
 * ----------------------
 * Operator fallback #2 for auth-gated platforms. Runs against the
 * self-hosted ABBY-SEARCH instance (searxng/searxng) — a privacy-respecting
 * metasearch engine that queries Google, Bing, DuckDuckGo, Brave, etc.
 * simultaneously and returns JSON.
 *
 * Compared to tavily-search:
 *  - Tavily:        single search API, $0.001/query, LLM-optimized
 *  - SearXNG:       self-hosted, free, queries 70+ engines in parallel,
 *                   no rate limits, JSON output
 *
 * When the operator says "scrape LinkedIn for 30 contacts", this engine
 * fans out 4-6 query variants against SearXNG and dedupes by URL — same
 * fanout pattern as tavily-search, just a different upstream.
 *
 * The engine is FREE so we use it aggressively.
 *
 * Required env: ABBY_SEARCH_URL (e.g. https://abby-search.onrender.com)
 */

import type { Engine, EngineResult, MissionStep } from "../types";

const logger = {
  warn: (...args: unknown[]) => console.warn("[searxng-search]", ...args),
  info: (...args: unknown[]) => console.log("[searxng-search]", ...args),
  error: (...args: unknown[]) => console.error("[searxng-search]", ...args),
};

const ABBY_SEARCH_URL = process.env.ABBY_SEARCH_URL?.replace(/\/$/, "") || "";
const DEFAULT_LIMIT = 30;
const VARIANT_LIMIT = 6;
const TIMEOUT_MS = 45_000;

interface SearXngResult {
  title: string;
  url: string;
  content?: string;
  engine?: string;
  score?: number;
  category?: string;
}

interface ParsedTitle {
  name: string;
  role: string;
  company: string;
}

function parseTitle(title: string): ParsedTitle {
  // Common LinkedIn-style: "Name - Role | Company · Location"
  //                      "Name - Role at Company - Location"
  //                      "Name | Role | Company | LinkedIn"
  const cleaned = title.replace(/\s*[-|·•]\s*LinkedIn\s*$/i, "").trim();
  const parts = cleaned.split(/\s*[-|·•]\s*/).map((p) => p.trim()).filter(Boolean);
  const name = parts[0] ?? "";
  let role = "";
  let company = "";
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (/at\b/i.test(p) && i + 1 < parts.length) {
      role = p.replace(/\bat\b.*$/i, "").trim();
      company = parts[i + 1];
      break;
    }
    if (!role && /\b(ceo|cto|coo|cfo|vp|director|manager|lead|head|owner|founder|partner|consultant|specialist|engineer|developer|attorney|lawyer|supplier|buyer|generator|operator)\b/i.test(p)) {
      role = p;
    } else if (!company && p.length > 1 && !/^[A-Z]{2,}$/.test(p) && !/^\d/.test(p)) {
      company = p;
    }
  }
  return { name, role, company };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function isProfileUrl(url: string): boolean {
  return /linkedin\.com\/in\//i.test(url) || /linkedin\.com\/profile\//i.test(url);
}

export const searxngSearchEngine: Engine = {
  name: "searxng-search",
  version: "1.0.0",
  capabilities: ["search", "fallback", "free", "no-rate-limit"],
  description:
    "Self-hosted SearXNG metasearch. Free, multi-engine, no rate limits. Operator fallback #2 for auth-gated platforms. URL: ABBY_SEARCH_URL env var.",
  async run(step: MissionStep): Promise<EngineResult> {
    const started = Date.now();

    if (!ABBY_SEARCH_URL) {
      return {
        ok: false,
        error: "ABBY_SEARCH_URL env var not set — cannot reach self-hosted SearXNG",
        durationMs: Date.now() - started,
      };
    }

    const query = String(step.args["query"] ?? step.args["goal"] ?? step.description ?? "");
    const limit = Math.min(Number(step.args["limit"] ?? DEFAULT_LIMIT), 50);
    const site = String(step.args["site"] ?? "linkedin.com");
    const category = String(step.args["category"] ?? slugify(query));
    // Engines to query (SearXNG supports comma-separated list, "all" uses every configured one)
    const enginesParam = String(step.args["engines"] ?? "bing");

    // Fanout variants (same pattern as tavily-search)
    const variants = Array.isArray(step.args["query_variants"])
      ? (step.args["query_variants"] as unknown[]).map((v) => String(v)).filter((v) => v.trim().length > 0)
      : [query];

    const seen = new Set<string>();
    const allRows: string[] = [];
    const seenVariants: string[] = [];
    let totalOk = 0;
    let firstError: string | null = null;

    for (const variant of variants.slice(0, VARIANT_LIMIT)) {
      // Site filter: use `inurl:` instead of `site:` because the underlying
      // search engines (Bing, Yandex) ignore `site:` as a query token but
      // honor `inurl:` for URL-path matching. Combined with a path filter
      // (e.g. /in/), this consistently surfaces LinkedIn profile URLs.
      // For non-LinkedIn sites, just use the bare host.
      const stripped = site.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const pathHint = stripped.includes("linkedin.com") ? "/in/" : "";
      const finalQuery = site ? `inurl:${stripped}${pathHint} ${variant}` : variant;
      try {
        const url = `${ABBY_SEARCH_URL}/search?` + new URLSearchParams({
          q: finalQuery,
          format: "json",
          engines: enginesParam,
          language: "en",
          safesearch: "0",
          categories: "general",
        }).toString();
        const r = await fetch(url, {
          method: "GET",
          headers: { "Accept": "application/json", "User-Agent": "AURA-Mission-Kernel/1.0" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!r.ok) {
          firstError = firstError ?? `SearXNG ${r.status}: ${(await r.text()).slice(0, 200)}`;
          continue;
        }
        const data = (await r.json()) as { results?: SearXngResult[] };
        const results = (data.results ?? []).filter((res) => isProfileUrl(res.url));
        seenVariants.push(`${variant}:${results.length}`);
        for (const res of results) {
          const cleanUrl = res.url.split("?")[0];
          if (seen.has(cleanUrl)) continue;
          seen.add(cleanUrl);
          const parsed = parseTitle(res.title);
          allRows.push([
            category,
            parsed.name,
            parsed.role,
            parsed.company,
            "",
            cleanUrl,
          ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","));
          totalOk++;
        }
      } catch (err) {
        firstError = firstError ?? String(err).slice(0, 200);
        logger.warn({ err, variant }, "searxng-search variant failed");
      }
    }

    // CSV-style output. Quote all fields because SearXNG titles may contain commas.
    const csvHeader = "category,full_name,current_job_title,company_name,location,linkedin_url\n";
    const csv = csvHeader + allRows.join("\n");
    const evidence = `searxng: ${totalOk} unique profile(s) across ${variants.length} variant(s) [${seenVariants.join(", ")}]`;

    return {
      ok: totalOk > 0,
      output: { count: totalOk, csv, variants: variants.length },
      evidence,
      error: totalOk === 0 ? firstError ?? "no profiles found" : undefined,
      durationMs: Date.now() - started,
      facts: { count: totalOk, engine: "searxng", variants: variants.length, upstream: ABBY_SEARCH_URL },
    };
  },
};