import { pgTable, serial, text, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Crawl4AI runtime — persistent schema.
 *
 * Two tables, both idempotent. crawl4ai_crawls is the orchestration row;
 * crawl4ai_pages is the per-page record. Pages are also written into the
 * existing agent_memory table (so memory_search can retrieve them) but we
 * keep a separate pages table for direct inspection without memory churn.
 */

export const crawl4aiCrawlsTable = pgTable(
  "crawl4ai_crawls",
  {
    id: serial("id").primaryKey(),
    seeds: jsonb("seeds").notNull().default([]),
    maxDepth: integer("max_depth").notNull().default(0),
    concurrency: integer("concurrency").notNull().default(4),
    maxPages: integer("max_pages").notNull().default(25),
    followLinks: boolean("follow_links").notNull().default(false),
    memoryKeyPrefix: text("memory_key_prefix"),
    memoryTag: text("memory_tag").notNull().default("crawl4ai"),
    status: text("status").notNull().default("queued"),
    pagesTotal: integer("pages_total").notNull().default(0),
    pagesSuccess: integer("pages_success").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => ({
    statusIdx: index("crawl4ai_crawls_status_idx").on(t.status),
    startedIdx: index("crawl4ai_crawls_started_idx").on(t.startedAt),
  }),
);

export const crawl4aiPagesTable = pgTable(
  "crawl4ai_pages",
  {
    id: serial("id").primaryKey(),
    crawlId: integer("crawl_id").notNull(),
    url: text("url").notNull(),
    label: text("label"),
    status: text("status").notNull().default("queued"),
    bytes: integer("bytes"),
    memoryKey: text("memory_key"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    crawledAt: timestamp("crawled_at").notNull().defaultNow(),
  },
  (t) => ({
    crawlIdx: index("crawl4ai_pages_crawl_idx").on(t.crawlId),
    statusIdx: index("crawl4ai_pages_status_idx").on(t.status),
  }),
);

export const insertCrawl4aiCrawlSchema = createInsertSchema(crawl4aiCrawlsTable).omit({
  id: true,
  startedAt: true,
});
export const insertCrawl4aiPageSchema = createInsertSchema(crawl4aiPagesTable).omit({
  id: true,
  crawledAt: true,
});

export type Crawl4aiCrawl = typeof crawl4aiCrawlsTable.$inferSelect;
export type InsertCrawl4aiCrawl = z.infer<typeof insertCrawl4aiCrawlSchema>;
export type Crawl4aiPage = typeof crawl4aiPagesTable.$inferSelect;
export type InsertCrawl4aiPage = z.infer<typeof insertCrawl4aiPageSchema>;