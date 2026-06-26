/**
 * Crawl4AI runtime — types.
 *
 * Crawl4AI is integrated as a PARALLEL orchestrator subsystem. We don't ship
 * a new crawler — the existing `web_scrape` tool (Firecrawl + Steel backend)
 * is already in tools.ts. Crawl4AI here is a *deep-crawl orchestrator*:
 *
 *   - Take a list of seed URLs.
 *   - Fan them out to the existing web_scrape tool with a configurable depth
 *     budget and concurrency cap.
 *   - Extract markdown, write each page to memory_search under a stable key
 *     so the operator's chat sessions can later retrieve the corpus.
 *   - Persist crawl metadata in crawl4ai_crawls + crawl4ai_pages so the
 *     orchestrator can resume / inspect / re-scrape a corpus later.
 *
 * Reuses:
 *   - web_scrape (Firecrawl / Steel) for the actual fetch + extraction.
 *   - memory_write for persisting the markdown into the agent_memory table.
 *   - embeddings (lib/embeddings.ts) for vectorization of each page (if
 *     configured), so memory_search will surface them.
 *
 * No new dependency on Firecrawl / Steel / embeddings — just the existing
 * tool surface.
 */

export interface CrawlSeed {
  url: string;
  /** Optional human-readable label so the operator can spot which page is which. */
  label?: string;
}

export interface CrawlRequest {
  seeds: CrawlSeed[];
  /** How deep to follow links from each seed. Default 0 = just the seed URL. */
  maxDepth?: number;
  /** Max concurrent web_scrape calls. Default 4. */
  concurrency?: number;
  /** How many pages to crawl total across all seeds. Default 25. */
  maxPages?: number;
  /** If true, also fetch links discovered on each page and recurse up to maxDepth. */
  followLinks?: boolean;
  /** Optional memory_search key prefix. Defaults to `crawl4ai/<crawlId>/<n>`. */
  memoryKeyPrefix?: string;
  /** Tag applied to every memory row written by this crawl. Defaults to "crawl4ai". */
  memoryTag?: string;
  /** Optional metadata to attach to the crawl row. */
  metadata?: Record<string, unknown>;
}

export interface CrawledPage {
  url: string;
  label?: string;
  memoryKey?: string;
  status: "success" | "failed" | "skipped";
  bytes?: number;
  error?: string;
  durationMs?: number;
}

export interface CrawlRecord {
  id: number;
  seeds: CrawlSeed[];
  maxDepth: number;
  concurrency: number;
  maxPages: number;
  followLinks: boolean;
  memoryKeyPrefix: string;
  memoryTag: string;
  status: "queued" | "running" | "success" | "partial" | "failed";
  pagesTotal: number;
  pagesSuccess: number;
  pagesFailed: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown>;
}