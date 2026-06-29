import { Router } from "express";
import { KNOWLEDGE_SOURCES, searchKnowledgeSources } from "../lib/knowledge-sources";

const router = Router();

router.get("/reference", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const results = searchKnowledgeSources(q);
  res.json({ query: q || null, categories: results, total: results.reduce((n, c) => n + c.sources.length, 0) });
});

router.get("/reference/categories", (_req, res) => {
  res.json(KNOWLEDGE_SOURCES.map((c) => ({ id: c.id, name: c.name, count: c.sources.length })));
});

export default router;
