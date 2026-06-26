/**
 * Crawl4AI storage — crawl + page rows.
 *
 * Best-effort writes; failures are logged, never thrown. The runtime is
 * always safe to call from any code path.
 */

import { db } from "@workspace/db";
import {
  crawl4aiCrawlsTable,
  crawl4aiPagesTable,
  type Crawl4aiCrawl,
  type Crawl4aiPage,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "../logger";
import type { CrawlRequest, CrawledPage } from "./types";

export async function createCrawl(req: CrawlRequest): Promise<Crawl4aiCrawl | null> {
  try {
    const [row] = await db
      .insert(crawl4aiCrawlsTable)
      .values({
        seeds: req.seeds as unknown as object,
        maxDepth: req.maxDepth ?? 0,
        concurrency: req.concurrency ?? 4,
        maxPages: req.maxPages ?? 25,
        followLinks: req.followLinks ?? false,
        memoryKeyPrefix: req.memoryKeyPrefix ?? null,
        memoryTag: req.memoryTag ?? "crawl4ai",
        status: "queued",
        metadata: (req.metadata ?? {}) as object,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err }, "crawl4ai: createCrawl failed");
    return null;
  }
}

export async function setCrawlStatus(
  id: number,
  status: "queued" | "running" | "success" | "partial" | "failed",
  counts?: { pagesTotal?: number; pagesSuccess?: number; pagesFailed?: number; durationMs?: number },
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status };
    if (counts?.pagesTotal != null) patch.pagesTotal = counts.pagesTotal;
    if (counts?.pagesSuccess != null) patch.pagesSuccess = counts.pagesSuccess;
    if (counts?.pagesFailed != null) patch.pagesFailed = counts.pagesFailed;
    if (status === "success" || status === "partial" || status === "failed") {
      patch.completedAt = new Date();
      const [current] = await db
        .select({ startedAt: crawl4aiCrawlsTable.startedAt })
        .from(crawl4aiCrawlsTable)
        .where(eq(crawl4aiCrawlsTable.id, id));
      if (current?.startedAt) {
        patch.durationMs = counts?.durationMs ?? Date.now() - new Date(current.startedAt).getTime();
      }
    }
    await db.update(crawl4aiCrawlsTable).set(patch).where(eq(crawl4aiCrawlsTable.id, id));
  } catch (err) {
    logger.error({ err, id, status }, "crawl4ai: setCrawlStatus failed");
  }
}

export async function recordPage(opts: {
  crawlId: number;
  url: string;
  label?: string;
  status: "success" | "failed" | "skipped";
  bytes?: number;
  memoryKey?: string;
  error?: string;
  durationMs?: number;
}): Promise<Crawl4aiPage | null> {
  try {
    const [row] = await db
      .insert(crawl4aiPagesTable)
      .values({
        crawlId: opts.crawlId,
        url: opts.url,
        label: opts.label ?? null,
        status: opts.status,
        bytes: opts.bytes ?? null,
        memoryKey: opts.memoryKey ?? null,
        error: opts.error ?? null,
        durationMs: opts.durationMs ?? null,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err, crawlId: opts.crawlId, url: opts.url }, "crawl4ai: recordPage failed");
    return null;
  }
}

export async function listCrawls(limit = 50): Promise<Crawl4aiCrawl[]> {
  try {
    return await db
      .select()
      .from(crawl4aiCrawlsTable)
      .orderBy(desc(crawl4aiCrawlsTable.startedAt))
      .limit(limit);
  } catch (err) {
    logger.error({ err }, "crawl4ai: listCrawls failed");
    return [];
  }
}

export async function listPagesForCrawl(crawlId: number): Promise<Crawl4aiPage[]> {
  try {
    return await db
      .select()
      .from(crawl4aiPagesTable)
      .where(eq(crawl4aiPagesTable.crawlId, crawlId))
      .orderBy(crawl4aiPagesTable.id);
  } catch (err) {
    logger.error({ err, crawlId }, "crawl4ai: listPagesForCrawl failed");
    return [];
  }
}

export async function getCrawlById(id: number): Promise<Crawl4aiCrawl | null> {
  try {
    const [row] = await db
      .select()
      .from(crawl4aiCrawlsTable)
      .where(eq(crawl4aiCrawlsTable.id, id));
    return row ?? null;
  } catch (err) {
    logger.error({ err, id }, "crawl4ai: getCrawlById failed");
    return null;
  }
}

export type { CrawledPage };