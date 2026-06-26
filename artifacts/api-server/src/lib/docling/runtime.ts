/**
 * Docling runtime — orchestrator.
 *
 * `parseDocument(req)` is the single entry point. It:
 *   1) Resolves source content (fetch URL via web_scrape if needed, or use raw text)
 *   2) Detects format via parsers.ts
 *   3) Calls the appropriate parser
 *   4) Optionally writes the extracted text into agent_memory
 *   5) Persists the docling_documents row
 *
 * The actual fetch for URL sources reuses `web_scrape` from the existing
 * AURA tool registry — no duplicate HTTP layer.
 */

import { logger } from "../logger";
import { runTool, type ToolContext } from "../../tools";
import { parseDocument, detectFormat } from "./parsers";
import { recordDocument } from "./store";
import type { ParseRequest, ParseResult } from "./types";

const DOCLING_AGENT_ID = 5; // AURA-4 — API/integration agent; has http_request + web_scrape + memory_write

function makeCtx(channelId: number | null): ToolContext {
  return {
    agentId: DOCLING_AGENT_ID,
    agentName: "Docling-Runtime",
    agentColor: "#ff8855",
    channelId: channelId ?? null,
  };
}

export async function parseAndRecord(req: ParseRequest): Promise<{
  documentId: number | null;
  result: ParseResult | null;
  error?: string;
}> {
  const ctx = makeCtx(null);

  let rawContent: string | null = req.rawContent ?? null;
  let bytes = 0;
  let mimeType = req.mimeType ?? null;
  let url = req.sourceKind === "url" ? req.sourceRef ?? null : null;

  if (req.sourceKind === "url" && url && !rawContent) {
    try {
      const fetched = await runTool("web_scrape", { url }, ctx);
      if (fetched.startsWith("error:")) {
        const errMsg = fetched.slice(0, 300);
        const row = await recordDocument({
          title: req.title ?? null,
          sourceKind: "url",
          sourceRef: url,
          mimeType,
          format: detectFormat(mimeType, url),
          bytes: 0,
          extractedText: null,
          status: "failed",
          error: errMsg,
          metadata: { stage: "fetch" },
        });
        return { documentId: row?.id ?? null, result: null, error: errMsg };
      }
      rawContent = fetched;
      bytes = fetched.length;
    } catch (err) {
      const errMsg = String(err).slice(0, 300);
      const row = await recordDocument({
        title: req.title ?? null,
        sourceKind: "url",
        sourceRef: url,
        mimeType,
        format: detectFormat(mimeType, url),
        status: "failed",
        error: errMsg,
        metadata: { stage: "fetch" },
      });
      return { documentId: row?.id ?? null, result: null, error: errMsg };
    }
  } else if (req.sourceKind === "text" && rawContent) {
    bytes = rawContent.length;
  }

  if (!rawContent) {
    return { documentId: null, result: null, error: "no content provided" };
  }

  const sample = rawContent.slice(0, 2000);
  const parsed = await parseDocument({ rawBytes: rawContent, mimeType, url, contentSample: sample });
  const text = parsed.text;
  const extractedChars = text.length;
  const format = parsed.format;

  // Optional: write into agent_memory for cross-runtime retrieval.
  if (req.writeToMemory && text) {
    const memKey = req.memoryKey ?? `docling/${Date.now()}`;
    try {
      const memoryResult = await runTool(
        "memory_write",
        { key: memKey, content: text.slice(0, 30000), tags: req.memoryTag ?? "docling" },
        ctx,
      );
      if (memoryResult.startsWith("error:")) {
        logger.warn({ memKey, err: memoryResult }, "docling: memory_write failed");
      }
    } catch (err) {
      logger.warn({ err, memKey }, "docling: memory_write threw");
    }
  }

  const result: ParseResult = {
    format,
    bytes,
    extractedChars,
    extractedText: text,
    metadata: parsed.metadata,
  };

  const row = await recordDocument({
    title: req.title ?? null,
    sourceKind: req.sourceKind,
    sourceRef: req.sourceKind === "url" ? url : req.sourceKind === "upload" ? req.sourceRef ?? null : null,
    mimeType,
    format,
    bytes,
    extractedText: text,
    metadata: parsed.metadata,
    status: text ? "success" : "failed",
    error: parsed.metadata?.error as string | undefined ?? null,
  });

  return { documentId: row?.id ?? null, result };
}