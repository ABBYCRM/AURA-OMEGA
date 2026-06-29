/**
 * Crawl4AI runtime — orchestrator.
 *
 * Drives the actual crawl by reusing the AURA tool registry:
 *   - `web_scrape` for fetching + extracting markdown.
 *   - `memory_write` for persisting each page into agent_memory so future
 *     memory_search queries return them.
 *
 * Concurrency is capped via a simple semaphore (no extra deps). Best-effort:
 * per-page failures are recorded but don't abort the crawl.
 *
 * No new crawler primitive is introduced — this is intentionally a thin
 * orchestrator over the existing tools so we don't duplicate the
 * Firecrawl / Steel integrations.
 */

import { logger } from "../logger";
import { runTool, type ToolContext } from "../../tools";
import {
  createCrawl,
  setCrawlStatus,
  recordPage,
  type CrawledPage,
} from "./store";
import type { CrawlRequest } from "./types";

class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];
  constructor(permits: number) {
    this.permits = permits;
  }
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

export function extractLinksFromMarkdown(md: string, baseUrl: string): string[] {
  const out = new Set<string>();
  // Markdown link form: [text](href). Accept any non-empty href that doesn't
  // start with `(` or `)` or contain whitespace.
  const re = /\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const href = m[1];
    // Skip anchor-only and javascript: schemes.
    if (href.startsWith("#")) continue;
    if (/^(javascript|data|mailto|tel|ftp):/i.test(href)) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") out.add(u.toString());
    } catch {
      /* ignore bad URLs */
    }
  }
  return Array.from(out);
}

const CRAWL_AGENT_ID = 4; // AURA-3 (memory/RAG) — has web_scrape + memory_write

function makeCtx(channelId: number | null): ToolContext {
  return {
    agentId: CRAWL_AGENT_ID,
    agentName: "Crawl4AI-Runtime",
    agentColor: "#aa55ff",
    channelId: channelId ?? null,
  };
}

export async function startCrawl(req: CrawlRequest): Promise<{
  crawlId: number;
  pages: CrawledPage[];
} | null> {
  if (!req.seeds || req.seeds.length === 0) {
    logger.warn({ req }, "crawl4ai: startCrawl called with no seeds");
    return null;
  }
  const crawl = await createCrawl(req);
  if (!crawl) return null;

  await setCrawlStatus(crawl.id, "running");

  const concurrency = Math.max(1, Math.min(req.concurrency ?? 2, 8));
  // Cap pages hard at 10 — crawl4ai is now a fallback after searxng/tavily,
  // so we only need a few pages to enrich the synthesis. Larger crawls used
  // to take 30+ minutes with Steel timeouts and block the whole mission.
  const maxPages = Math.max(1, Math.min(req.maxPages ?? 5, 10));
  const memoryKeyPrefix = req.memoryKeyPrefix ?? `crawl4ai/${crawl.id}`;
  const memoryTag = req.memoryTag ?? "crawl4ai";

  const ctx = makeCtx(null);
  const sem = new Semaphore(concurrency);

  // Frontier: initial seeds. We pop from front, push discovered links to back
  // if followLinks + maxDepth > 0.
  // Operator fix 2026-06-27: accept BOTH string seeds ("https://...") and
  // CrawlSeed objects ({url, label}). The mission kernel planner passes
  // strings; the legacy /api/crawl4ai/crawl route passes objects.
  type Job = { url: string; label?: string; depth: number };
  const queue: Job[] = req.seeds.map((s) =>
    typeof s === "string" ? { url: s, depth: 0 } : { url: s.url, label: s.label, depth: 0 }
  );
  const seen = new Set<string>(queue.map((j) => j.url));
  const pages: CrawledPage[] = [];
  let successCount = 0;
  let failCount = 0;
  const startMs = Date.now();

  const workers: Array<Promise<void>> = [];
  async function worker() {
    while (queue.length > 0 && pages.length < maxPages) {
      await sem.acquire();
      const job = queue.shift();
      if (!job) {
        sem.release();
        break;
      }
      try {
        const t0 = Date.now();
        const scrapeResult = await runTool("web_scrape", { url: job.url }, ctx);
        const isError = scrapeResult.startsWith("error:");
        const bytes = scrapeResult.length;
        const status: "success" | "failed" = isError ? "failed" : "success";
        if (isError) failCount++; else successCount++;

        let memoryKey: string | undefined;
        if (!isError) {
          // Persist into agent_memory under a stable key so memory_search can
          // surface the page later.
          memoryKey = `${memoryKeyPrefix}/${pages.length}`;
          const memoryResult = await runTool(
            "memory_write",
            { key: memoryKey, content: scrapeResult.slice(0, 30000), tags: memoryTag },
            ctx,
          );
          if (memoryResult.startsWith("error:")) {
            logger.warn({ memoryKey, url: job.url, err: memoryResult }, "crawl4ai: memory_write failed");
          }
        }

        const page: CrawledPage = {
          url: job.url,
          label: job.label,
          memoryKey,
          status,
          bytes,
          durationMs: Date.now() - t0,
        };
        if (status === "failed") page.error = scrapeResult.slice(0, 300);
        pages.push(page);

        await recordPage({
          crawlId: crawl.id,
          url: job.url,
          label: job.label,
          status,
          bytes,
          memoryKey,
          error: page.error,
          durationMs: page.durationMs,
        });

        // Recurse into discovered links if requested + depth permits.
        const maxDepth = req.maxDepth ?? 0;
        if (!isError && (req.followLinks ?? false) && job.depth < maxDepth && pages.length < maxPages) {
          const links = extractLinksFromMarkdown(scrapeResult, job.url);
          for (const link of links) {
            if (!seen.has(link) && pages.length + queue.length < maxPages) {
              seen.add(link);
              queue.push({ url: link, depth: job.depth + 1 });
            }
          }
        }
      } finally {
        sem.release();
      }
    }
  }

  // Spawn `concurrency` workers. Each acquires its own slot in the semaphore
  // on first job, then keeps popping until the queue is empty.
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  // Hard deadline: even if some pages hang in the queue, we cap the whole
  // crawl at ~3 minutes so the mission runtime can retry / fall through
  // without waiting 30+ minutes for one stuck worker.
  const crawlDeadlineMs = 180_000;
  const crawlDeadline = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), crawlDeadlineMs),
  );
  const crawlResult = await Promise.race([
    Promise.all(workers).then(() => "done" as const),
    crawlDeadline,
  ]);
  if (crawlResult === "timeout") {
    logger.warn(
      { crawlId: crawl.id, pages: pages.length, successCount, failCount, deadlineMs: crawlDeadlineMs },
      "crawl4ai: deadline reached, returning partial result",
    );
    // Mark any in-flight pages we didn't process as failed.
    failCount += queue.length;
  }

  const durationMs = Date.now() - startMs;
  let final: "success" | "partial" | "failed";
  if (failCount === 0) final = "success";
  else if (successCount === 0) final = "failed";
  else final = "partial";

  await setCrawlStatus(crawl.id, final, {
    pagesTotal: pages.length,
    pagesSuccess: successCount,
    pagesFailed: failCount,
    durationMs,
  });

  return { crawlId: crawl.id, pages };
}