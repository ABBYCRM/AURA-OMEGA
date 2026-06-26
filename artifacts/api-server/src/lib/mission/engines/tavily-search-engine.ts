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

    const tavilyQuery = includeDomains.length > 0 ? `site:${includeDomains[0]} ${query}` : query;

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
        // Tavily typically responds in <10s; cap at 30s for safety.
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) {
        return {
          ok: false,
          error: `Tavily ${r.status}: ${(await r.text()).slice(0, 200)}`,
          durationMs: Date.now() - started,
        };
      }
      const data = (await r.json()) as TavilyResponse;
      const results = (data.results ?? []).filter((res) => isProfileUrl(res.url));

      // CSV-style output the verifier can predicate over.
      const csvHeader = "category,full_name,current_job_title,company_name,location,linkedin_url\n";
      const rows = results.slice(0, limit).map((res) => {
        const parsed = parseTitle(res.title);
        return [step.args["category"] ?? slugify(query), parsed.name, parsed.role, parsed.company, "", res.url.split("?")[0]].join(",");
      }).join("\n");
      const csv = csvHeader + (rows || "");

      return {
        ok: results.length > 0,
        output: { count: results.length, csv },
        evidence: `tavily: ${results.length} profile(s) for "${tavilyQuery}"`,
        durationMs: Date.now() - started,
        facts: { count: results.length, engine: "tavily", query: tavilyQuery },
      };
    } catch (err) {
      logger.warn({ err, query: tavilyQuery }, "tavily-search engine failed");
      return {
        ok: false,
        error: String(err).slice(0, 200),
        durationMs: Date.now() - started,
      };
    }
  },
};