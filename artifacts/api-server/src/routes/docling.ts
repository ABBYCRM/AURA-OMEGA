/**
 * Docling runtime — HTTP routes.
 * Mounted at /api/docling (no auth gate).
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import { parseAndRecord } from "../lib/docling/runtime";
import {
  listDocuments,
  getDocumentById,
  stats,
} from "../lib/docling/store";
import { detectFormat } from "../lib/docling/parsers";
import type { ParseRequest } from "../lib/docling/types";

const router = Router();

router.get("/status", (_req, res) => {
  return res.json({
    ok: true,
    runtime: "docling",
    note: "in-stack HTML/MD/TXT parsers built-in; PDF/DOCX/XLSX are opt-in via npm packages",
  });
});

router.post("/detect", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const mimeType = (body.mimeType as string | undefined) ?? null;
  const url = (body.url as string | undefined) ?? null;
  const sample = typeof body.sample === "string" ? body.sample : undefined;
  const format = detectFormat(mimeType, url, sample);
  return res.json({ ok: true, format });
});

router.get("/documents", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  try {
    const docs = await listDocuments(limit);
    return res.json({ ok: true, count: docs.length, documents: docs });
  } catch (err) {
    logger.error({ err }, "GET /api/docling/documents failed");
    return res.status(500).json({ ok: false, error: "list failed" });
  }
});

router.get("/documents/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const doc = await getDocumentById(id);
    if (!doc) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, document: doc });
  } catch (err) {
    logger.error({ err, id }, "GET /api/docling/documents/:id failed");
    return res.status(500).json({ ok: false, error: "fetch failed" });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const s = await stats();
    return res.json({ ok: true, ...s });
  } catch (err) {
    logger.error({ err }, "GET /api/docling/stats failed");
    return res.status(500).json({ ok: false, error: "stats failed" });
  }
});

router.post("/parse", async (req, res) => {
  const body = (req.body ?? {}) as Partial<ParseRequest> & Record<string, unknown>;
  if (!body.sourceKind || !["url", "upload", "text"].includes(body.sourceKind as string)) {
    return res.status(400).json({ ok: false, error: "sourceKind must be url | upload | text" });
  }
  if (body.sourceKind === "text" && !body.rawContent) {
    return res.status(400).json({ ok: false, error: "rawContent required for sourceKind=text" });
  }
  if (body.sourceKind === "url" && !body.sourceRef) {
    return res.status(400).json({ ok: false, error: "sourceRef (URL) required for sourceKind=url" });
  }
  try {
    const out = await parseAndRecord({
      title: body.title,
      sourceKind: body.sourceKind as "url" | "upload" | "text",
      sourceRef: body.sourceRef ?? null,
      rawContent: body.rawContent ?? null,
      mimeType: body.mimeType ?? null,
      writeToMemory: Boolean(body.writeToMemory),
      memoryKey: body.memoryKey ?? null,
      memoryTag: (body.memoryTag as string | undefined) ?? "docling",
    });
    if (out.error && !out.result) {
      return res.status(500).json({ ok: false, error: out.error, documentId: out.documentId });
    }
    return res.status(201).json({ ok: true, documentId: out.documentId, result: out.result });
  } catch (err) {
    logger.error({ err }, "POST /api/docling/parse failed");
    return res.status(500).json({ ok: false, error: "parse failed" });
  }
});

export default router;