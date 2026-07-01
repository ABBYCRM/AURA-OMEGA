/**
 * KIMI-SEARCH — Cloudflare Worker
 *
 * Web search + synthesis worker. Replicates Kimi's ability to:
 * 1. Search the web via Bing/Google
 * 2. Read page contents
 * 3. Synthesize evidence into structured answers
 *
 * Uses Cloudflare Workers AI for LLM inference.
 */

export interface Env {
  AI: any;
  SERPER_API_KEY?: string;
  BING_API_KEY?: string;
  JINA_API_KEY?: string;
}

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct";

// ─── Search providers ─────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Search via Serper.dev (Google search API) */
async function serperSearch(apiKey: string, query: string): Promise<SearchResult[]> {
  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 8 }),
  });
  if (!resp.ok) throw new Error(`Serper ${resp.status}`);
  const data = await resp.json() as { organic?: Array<{ title: string; link: string; snippet: string }> };
  return (data.organic || []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
}

/** Search via Bing */
async function bingSearch(apiKey: string, query: string): Promise<SearchResult[]> {
  const resp = await fetch(
    `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=8`,
    { headers: { "Ocp-Apim-Subscription-Key": apiKey } },
  );
  if (!resp.ok) throw new Error(`Bing ${resp.status}`);
  const data = await resp.json() as { webPages?: { value: Array<{ name: string; url: string; snippet: string }> } };
  return (data.webPages?.value || []).map((r) => ({ title: r.name, url: r.url, snippet: r.snippet }));
}

/** Read a web page via Jina AI Reader */
async function jinaRead(apiKey: string | undefined, url: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const resp = await fetch(`https://r.jina.ai/${url}`, { headers });
  if (!resp.ok) return `(failed to read ${url}: ${resp.status})`;
  const text = await resp.text();
  return text.slice(0, 8000); // Cap content length
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

async function search(env: Env, query: string): Promise<SearchResult[]> {
  if (env.SERPER_API_KEY) return serperSearch(env.SERPER_API_KEY, query);
  if (env.BING_API_KEY) return bingSearch(env.BING_API_KEY, query);
  throw new Error("No search API configured. Set SERPER_API_KEY or BING_API_KEY.");
}

async function synthesizeAnswer(
  ai: any,
  query: string,
  results: SearchResult[],
  readings: Record<string, string>,
): Promise<string> {
  const sourcesText = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n${readings[r.url] ? `Content: ${readings[r.url].slice(0, 1500)}` : ""}`)
    .join("\n\n---\n\n");

  const messages: any[] = [
    {
      role: "system",
      content: `You are a research synthesis engine. Given a query and web sources, produce a structured, evidence-based answer. Follow these rules:
- Cite sources using [1], [2], etc.
- Distinguish between verified facts and inferred conclusions.
- If sources conflict, present both sides.
- If information is insufficient, say what's missing.
- Use markdown formatting.`,
    },
    {
      role: "user",
      content: `Query: ${query}\n\nSources:\n\n${sourcesText}\n\nProvide a comprehensive answer with citations.`,
    },
  ];

  const response = await ai.run(DEFAULT_MODEL, { messages, max_tokens: 2048 });
  return response.response?.trim() || "";
}

// ─── Worker entrypoint ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: corsHeaders });
    }

    let body: { query?: string; readPages?: boolean; maxPages?: number };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
    }

    const query = body.query?.trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "query is required" }), { status: 400, headers: corsHeaders });
    }

    try {
      // 1. Search
      const results = await search(env, query);
      if (results.length === 0) {
        return new Response(
          JSON.stringify({ query, results: [], answer: "No search results found.", sources: [] }),
          { headers: corsHeaders },
        );
      }

      // 2. Read pages (if requested)
      const readings: Record<string, string> = {};
      const shouldRead = body.readPages !== false;
      const maxPages = Math.min(body.maxPages || 3, 5);

      if (shouldRead) {
        const topResults = results.slice(0, maxPages);
        await Promise.all(
          topResults.map(async (r) => {
            try {
              readings[r.url] = await jinaRead(env.JINA_API_KEY, r.url);
            } catch {
              readings[r.url] = "(failed to read page)";
            }
          }),
        );
      }

      // 3. Synthesize
      const answer = await synthesizeAnswer(env.AI, query, results, readings);

      return new Response(
        JSON.stringify({
          query,
          results: results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })),
          readings,
          answer,
          model: DEFAULT_MODEL,
          worker: "kimi-search",
        }, null, 2),
        { headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message, worker: "kimi-search" }),
        { status: 500, headers: corsHeaders },
      );
    }
  },
};
