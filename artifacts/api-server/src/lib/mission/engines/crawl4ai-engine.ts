import type { EngineAdapter, EngineResult } from "./registry";
import type { MissionStep } from "../types";
import { logger } from "../../logger";
import { startCrawl } from "../../crawl4ai/runtime";

/**
 * Crawl4AI engine — wraps the existing crawl4ai.startCrawl orchestrator.
 *
 * Action: "crawl" → calls startCrawl({ seeds, maxPages, memoryKeyPrefix })
 * Memory keys are persisted under `mission/<missionId>/<crawlId>`.
 */

export const crawl4aiEngine: EngineAdapter = {
  name: "crawl4ai",
  async run(step: MissionStep): Promise<EngineResult> {
    const started = Date.now();
    const seeds = Array.isArray(step.args.seeds) ? step.args.seeds as string[] : [];
    const missionId = step.args.missionId as number ?? 0;
    if (seeds.length === 0) {
      return { ok: false, error: "no seeds provided", durationMs: Date.now() - started };
    }
    try {
      const r = await startCrawl({
        seeds,
        maxPages: Math.min((step.args.maxPages as number) ?? 10, 50),
        memoryKeyPrefix: `mission/${missionId}`,
        memoryTag: "mission",
      });
      const failed = r.pages.filter((p) => p.status === "failed").length;
      const ok = !!r.crawlId && failed === 0;
      return {
        ok,
        output: r,
        evidence: `crawl ${r.crawlId}: ${r.pages.length} pages, ${failed} failed`,
        durationMs: Date.now() - started,
        facts: { crawlId: r.crawlId, pageCount: r.pages.length, failed },
      };
    } catch (err) {
      logger.warn({ err, missionId }, "crawl4ai engine: startCrawl threw");
      return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
    }
  },
};