/**
 * Tavily Search engine — public-web fallback for auth-gated platforms.
 *
 * Implements the operator's rule (2026-06-26):
 *   "For blocked situations, use a workaround like Google search for the
 *    profiles as they will show up. Self-reflect, search online and find
 *    ways to get the job done."
 *
 * When a mission asks for data from a platform that's auth-gated (LinkedIn,
 * Instagram, Twitter, Glassdoor) and the primary engine can't auth,
 * dispatch to this engine. It searches Tavily (already configured) for
 * `site:domain.com/in/...` style queries and returns structured profile
 * records — name, role, company, location, URL — even without platform auth.
 *
 * Cost: ~$0.001 per search. Fully covered by the existing TAVILY_API_KEY env var.
 */

import type { EngineAdapter, EngineResult } from "./registry";
import type { MissionStep } from "../types";
import { logger } from "../../logger";

const TAVILY_URL = "https://api.tavily.com/search";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/^-|-$/g, "");
}

/** Parse a Tavily result title like "Name - Role - Company - LinkedIn". */
function parseTitle(title: string): { name: string; role: string; company: string } {
  const cleaned = title.replace(/\s*[-–|]\s*LinkedIn\s*$/i, "").trim();
  const parts = cleaned.split(/\s+[-–|·]\s+/);
  return {
    name: parts[0]?.trim() ?? "",
    role: parts[1]?.trim() ?? "",
    company: parts[2]?.trim() ?? "",
  };
}

function isProfileUrl(url: string): boolean {
  return /linkedin\.com\/in\//i.test(url);
}

export const tavilySearchEngine: EngineAdapter = {
  name: "tavily-search" as any,
  async run(step: MissionStep): Promise<EngineResult> {
    const started = Date.now();
    const apiKey = process.env["TAVILY_API_KEY"];
    if (!apiKey) {
      return {
        ok: false,
        error: "TAVILY_API_KEY is not set — public-search fallback unavailable. Set it in Render env vars.",
        durationMs: Date.now() - started,
      };
    }

    const query = String(step.args["query"] ?? step.args["goal"] ?? step.description ?? "");
    const site = String(step.args["site"] ?? "linkedin.com");
    const limit = Math.min(Number(step.args["limit"] ?? 30), 50);
    const includeDomains = String(step.args["include_domains"] ?? site).split(",").map((s) => s.trim()).filter(Boolean);

    // Fanout: if query_variants[] is provided, run Tavily once per variant and
    // dedupe by URL. This is how a single mission step hits the multi-query
    // fanout needed to fill a 30-contact quota for sparse niches.
    const variants = Array.isArray(step.args["query_variants"])
      ? (step.args["query_variants"] as unknown[]).map((v) => String(v)).filter((v) => v.trim().length > 0)
      : [query];

    // Fanout: run Tavily once per variant and dedupe by URL across variants.
    // This is how a single mission step hits the multi-query fanout needed to
    // fill a 30-contact quota for sparse niches. Limit is per-variant.
    const seen = new Set<string>();
    const allRows: string[] = [];
    const seenVariants: string[] = [];
    let totalOk = 0;
    let firstError: string | null = null;

    for (const variant of variants) {
      const tavilyQuery = includeDomains.length > 0 ? `site:${includeDomains[0]} ${variant}` : variant;
      try {
        const r = await fetch(TAVILY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query: tavilyQuery,
            max_results: limit,
            include_domains: includeDomains,
            search_depth: "advanced",
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!r.ok) {
          firstError = firstError ?? `Tavily ${r.status}: ${(await r.text()).slice(0, 200)}`;
          continue;
        }
        const data = (await r.json()) as TavilyResponse;
        const results = (data.results ?? []).filter((res) => isProfileUrl(res.url));
        seenVariants.push(`${variant}:${results.length}`);
        for (const res of results) {
          const cleanUrl = res.url.split("?")[0];
          if (seen.has(cleanUrl)) continue;
          seen.add(cleanUrl);
          const parsed = parseTitle(res.title);
          allRows.push([
            step.args["category"] ?? slugify(query),
            parsed.name,
            parsed.role,
            parsed.company,
            "",
            cleanUrl,
          ].join(","));
          totalOk++;
        }
      } catch (err) {
        firstError = firstError ?? String(err).slice(0, 200);
        logger.warn({ err, query: tavilyQuery }, "tavily-search variant failed");
      }
    }

    // CSV-style output the verifier can predicate over.
    const csvHeader = "category,full_name,current_job_title,company_name,location,linkedin_url\n";
    const csv = csvHeader + allRows.join("\n");
    const evidence = `tavily: ${totalOk} unique profile(s) across ${variants.length} variant(s) [${seenVariants.join(", ")}]`;

    return {
      ok: totalOk > 0,
      output: { count: totalOk, csv, variants: variants.length },
      evidence,
      error: totalOk === 0 ? firstError ?? "no profiles found" : undefined,
      durationMs: Date.now() - started,
      facts: { count: totalOk, engine: "tavily", variants: variants.length },
    };
  },
};
