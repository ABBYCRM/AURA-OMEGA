import type { EngineAdapter, EngineResult } from "./registry";
import type { MissionStep } from "../types";
import { logger } from "../../logger";
import { extractAndUpsert } from "../../mem0/extractor";

/**
 * Mem0 engine — extracts typed facts from text and stores them.
 *
 * Action: "extract" → extractAndUpsert(text, userId)
 * Used by RESEARCH missions to distill structured data from web content.
 */

export const mem0Engine: EngineAdapter = {
  name: "mem0",
  async run(step: MissionStep): Promise<EngineResult> {
    const started = Date.now();
    const text = String(step.args.text ?? "");
    const userId = String(step.args.userId ?? "operator");
    if (!text.trim()) {
      return { ok: false, error: "no text provided", durationMs: Date.now() - started };
    }
    try {
      const facts = await extractAndUpsert(text, userId);
      return {
        ok: true,
        output: { facts },
        evidence: `extracted ${facts.length} facts from ${text.length} chars`,
        durationMs: Date.now() - started,
        facts: { count: facts.length },
      };
    } catch (err) {
      logger.warn({ err }, "mem0 engine: extract failed");
      return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
    }
  },
};