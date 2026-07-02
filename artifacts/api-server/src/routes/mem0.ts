/**
 * Mem0 runtime — HTTP routes.
 * Mounted at /api/mem0 (no auth gate).
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import {
  upsertFact,
  listFacts,
  deleteFact,
  reinforceFact,
  contradictFact,
} from "../lib/mem0/store";
import { extractAndUpsert } from "../lib/mem0/extractor";
import { MEM0_CATEGORIES, type Mem0Category } from "@workspace/db";

const router = Router();

router.get("/status", (_req, res) => {
  return res.json({
    ok: true,
    runtime: "mem0",
    categories: MEM0_CATEGORIES,
    note: "facts table layered on agent_memory; LLM extractor uses K2.6",
  });
});

router.get("/facts", async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : "operator";
  const category = typeof req.query.category === "string" ? (req.query.category as Mem0Category) : undefined;
  const query = typeof req.query.q === "string" ? req.query.q : undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
  try {
    const facts = await listFacts({ userId, category, query, limit });
    return res.json({ ok: true, count: facts.length, facts });
  } catch (err) {
    logger.error({ err }, "GET /api/mem0/facts failed");
    return res.status(500).json({ ok: false, error: "list failed" });
  }
});

router.post("/facts", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!MEM0_CATEGORIES.includes(body.category as Mem0Category)) {
    return res.status(400).json({ ok: false, error: `category must be one of ${MEM0_CATEGORIES.join(",")}` });
  }
  try {
    const row = await upsertFact({
      userId: (body.userId as string | undefined) ?? "operator",
      category: body.category as Mem0Category,
      entity: String(body.entity ?? "").trim(),
      attribute: String(body.attribute ?? "").trim(),
      value: String(body.value ?? "").trim(),
      confidence: body.confidence != null ? Number(body.confidence) : undefined,
      sourceMemoryId: body.sourceMemoryId != null ? Number(body.sourceMemoryId) : null,
      metadata: (body.metadata as Record<string, unknown>) ?? {},
    });
    if (!row) return res.status(400).json({ ok: false, error: "upsert failed (validation)" });
    return res.status(201).json({ ok: true, fact: row });
  } catch (err) {
    logger.error({ err }, "POST /api/mem0/facts failed");
    return res.status(500).json({ ok: false, error: "upsert failed" });
  }
});

router.post("/facts/extract", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = String(body.text ?? "");
  const userId = (body.userId as string | undefined) ?? "operator";
  const sourceMemoryId = body.sourceMemoryId != null ? Number(body.sourceMemoryId) : null;
  if (!text.trim()) return res.status(400).json({ ok: false, error: "text required" });
  try {
    const facts = await extractAndUpsert(text, userId, sourceMemoryId);
    return res.json({ ok: true, extracted: facts.length, facts });
  } catch (err) {
    logger.error({ err }, "POST /api/mem0/facts/extract failed");
    return res.status(500).json({ ok: false, error: "extract failed" });
  }
});

router.post("/facts/:id/reinforce", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  const delta = req.body?.delta != null ? Number(req.body.delta) : 0.05;
  try {
    const row = await reinforceFact(id, delta);
    if (!row) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, fact: row });
  } catch (err) {
    logger.error({ err, id }, "POST /api/mem0/facts/:id/reinforce failed");
    return res.status(500).json({ ok: false, error: "reinforce failed" });
  }
});

router.post("/facts/:id/contradict", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  const delta = req.body?.delta != null ? Number(req.body.delta) : 0.1;
  try {
    const row = await contradictFact(id, delta);
    if (!row) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, fact: row });
  } catch (err) {
    logger.error({ err, id }, "POST /api/mem0/facts/:id/contradict failed");
    return res.status(500).json({ ok: false, error: "contradict failed" });
  }
});

router.delete("/facts/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const ok = await deleteFact(id);
    if (!ok) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id }, "DELETE /api/mem0/facts/:id failed");
    return res.status(500).json({ ok: false, error: "delete failed" });
  }
});

export default router;