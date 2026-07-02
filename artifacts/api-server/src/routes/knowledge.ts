import { Router, type Request, type Response, type NextFunction } from "express";
import {
  TIERS,
  TIER_0_DOCS,
  TIER_1_SPECS,
  TIER_2_CRAWLER,
  TIER_3_PACKAGES,
  relevantDocsForGoal,
  knowledgeHierarchyBlock,
  fullHierarchyText,
  hierarchyStats,
} from "../lib/knowledge-hierarchy";

const router = Router();

/**
 * GET /api/knowledge — full hierarchy (Tier 0-5 + doc counts).
 * Useful for the operator to inspect what the agent knows about.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    res.json({
      ok: true,
      tiers: TIERS,
      stats: hierarchyStats(),
      tier0Count: TIER_0_DOCS.length,
      tier1Count: TIER_1_SPECS.length,
      tier2Count: TIER_2_CRAWLER.length,
      tier3Count: TIER_3_PACKAGES.length,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to render knowledge hierarchy");
    res.status(500).json({ error: "Failed to render knowledge hierarchy" });
  }
});

/**
 * GET /api/knowledge/tree — full tree as plain text (for prompts or log dumps).
 */
router.get("/tree", async (req: Request, res: Response) => {
  try {
    res.type("text/plain").send(fullHierarchyText());
  } catch (err) {
    res.status(500).json({ error: "Failed to render tree" });
  }
});

/**
 * POST /api/knowledge/lookup — given a goal, return the Tier-0/1/2 docs that
 * match. The synthesis step calls this to know which docs to inject.
 */
router.post("/lookup", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const goal = String(body.goal ?? "").trim();
    if (!goal) {
      res.status(400).json({ ok: false, error: "goal required" });
      return;
    }
    const docs = relevantDocsForGoal(goal);
    const block = knowledgeHierarchyBlock(goal);
    res.json({
      ok: true,
      goal,
      matchedCount: docs.length,
      docs,
      promptBlock: block,
    });
  } catch (err) {
    res.status(500).json({ error: "lookup failed" });
  }
});

/**
 * GET /api/knowledge/tier/:n — return a single tier's docs.
 * Example: GET /api/knowledge/tier/0 returns all Tier 0 docs.
 */
router.get("/tier/:n", async (req: Request, res: Response) => {
  try {
    const n = parseInt(String(req.params.n), 10);
    if (Number.isNaN(n) || n < 0 || n > 3) {
      res.status(400).json({ ok: false, error: "tier must be 0, 1, 2, or 3" });
      return;
    }
    const docs =
      n === 0 ? TIER_0_DOCS :
      n === 1 ? TIER_1_SPECS :
      n === 2 ? TIER_2_CRAWLER :
      TIER_3_PACKAGES;
    res.json({
      ok: true,
      tier: n,
      label: TIERS[n].label,
      description: TIERS[n].description,
      count: docs.length,
      docs,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to render tier" });
  }
});

export default router;