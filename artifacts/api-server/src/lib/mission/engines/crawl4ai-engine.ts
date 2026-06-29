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
      const succeeded = r.pages.filter((p) => p.status === "success").length;
      // Accept partial: a crawl is 'ok' if it ran at all and got >= 1 page
      // back. A previous 'failed === 0' rule blocked missions at step 2
      // whenever any single Steel scrape timed out, even if 4/5 pages
      // succeeded. Now we treat partial results as success-with-facts.
      const ok = !!r.crawlId && (succeeded >= 1 || r.pages.length === 0);
      // Operator fix 2026-06-27: surface the FIRST page error in the evidence
      // so the operator can see WHY the crawl failed (Steel timeout? JS-only
      // page? auth wall?) instead of just "0 ok / 4 failed".
      const firstError = r.pages.find((p) => p.status === "failed")?.error;
      const evidenceMsg = firstError
        ? `crawl ${r.crawlId}: ${r.pages.length} pages, ${succeeded} ok / ${failed} failed. First error: ${firstError.slice(0, 150)}`
        : `crawl ${r.crawlId}: ${r.pages.length} pages, ${succeeded} ok / ${failed} failed`;
      return {
        ok,
        output: r,
        evidence: evidenceMsg,
        durationMs: Date.now() - started,
        facts: { crawlId: r.crawlId, pageCount: r.pages.length, succeeded, failed, firstError: firstError?.slice(0, 200) ?? null },
      };
    } catch (err) {
      logger.warn({ err, missionId }, "crawl4ai engine: startCrawl threw");
      return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
    }
  },
};