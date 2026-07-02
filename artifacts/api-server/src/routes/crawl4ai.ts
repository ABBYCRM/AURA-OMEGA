/**
 * Crawl4AI runtime — HTTP routes.
 * Mounted at /api/crawl4ai (no auth gate, same pattern as /api/hermes / /api/openhands).
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import { startCrawl } from "../lib/crawl4ai/runtime";
import {
  listCrawls,
  listPagesForCrawl,
  getCrawlById,
} from "../lib/crawl4ai/store";
import type { CrawlRequest } from "../lib/crawl4ai/types";

const router = Router();

router.get("/status", (_req, res) => {
  return res.json({ ok: true, runtime: "crawl4ai", note: "thin orchestrator over existing web_scrape + memory_write" });
});

router.get("/crawls", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  try {
    const crawls = await listCrawls(limit);
    return res.json({ ok: true, count: crawls.length, crawls });
  } catch (err) {
    logger.error({ err }, "GET /api/crawl4ai/crawls failed");
    return res.status(500).json({ ok: false, error: "list failed" });
  }
});

router.get("/crawls/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const crawl = await getCrawlById(id);
    if (!crawl) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, crawl });
  } catch (err) {
    logger.error({ err, id }, "GET /api/crawl4ai/crawls/:id failed");
    return res.status(500).json({ ok: false, error: "fetch failed" });
  }
});

router.get("/crawls/:id/pages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const pages = await listPagesForCrawl(id);
    return res.json({ ok: true, count: pages.length, pages });
  } catch (err) {
    logger.error({ err, id }, "GET /api/crawl4ai/crawls/:id/pages failed");
    return res.status(500).json({ ok: false, error: "list pages failed" });
  }
});

router.post("/crawls", async (req, res) => {
  const body = (req.body ?? {}) as Partial<CrawlRequest>;
  if (!Array.isArray(body.seeds) || body.seeds.length === 0) {
    return res.status(400).json({ ok: false, error: "seeds array required" });
  }
  try {
    const result = await startCrawl({
      seeds: body.seeds,
      maxDepth: body.maxDepth,
      concurrency: body.concurrency,
      maxPages: body.maxPages,
      followLinks: body.followLinks,
      memoryKeyPrefix: body.memoryKeyPrefix,
      memoryTag: body.memoryTag,
      metadata: body.metadata,
    });
    if (!result) return res.status(500).json({ ok: false, error: "crawl failed to start" });
    return res.status(201).json({ ok: true, crawlId: result.crawlId, pages: result.pages });
  } catch (err) {
    logger.error({ err }, "POST /api/crawl4ai/crawls failed");
    return res.status(500).json({ ok: false, error: "crawl failed" });
  }
});

export default router;