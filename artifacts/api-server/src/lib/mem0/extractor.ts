/**
 * Mem0 extractor — turns free-form text into typed facts using K2.6.
 *
 * Used by /api/mem0/extract to mine facts out of a chat message or a memory
 * row. Returns upserted facts (writes through to mem0_facts table).
 *
 * Uses the shared completeChat() so it inherits K2.6 / NVIDIA NIM (OpenRouter removed 2026-06-27)
 * / Buddy failover with no new keys.
 */

import { logger } from "../logger";
import { completeChat } from "../integrations";
import { resolveModel } from "../../routes/ai";
import { upsertFact } from "./store";
import type { Mem0Category } from "@workspace/db";

const EXTRACT_SYSTEM = `You are Mem0 (AURA-OMEGA fact extractor). Given a piece of operator text, extract any durable facts about the operator, their preferences, the entities they care about, recurring topics, or behavioral patterns.

Return STRICT JSON matching this shape and nothing else:
{
  "facts": [
    {
      "category": "preference" | "entity" | "topic" | "behavior" | "context",
      "entity": "short subject like 'github.com' or 'operator'",
      "attribute": "the property like 'username' or 'preferred branch'",
      "value": "the fact value as a string",
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Be conservative: if no durable fact is present, return {"facts": []}.
- Don't extract transient task state ("asked me to search for X").
- Prefer concrete facts over vague ones.
- Max 5 facts per call.
- Each fact's confidence should reflect how strong the evidence is (0.5 = reasonable, 0.8 = explicit).`;

export interface ExtractedFact {
  category: Mem0Category;
  entity: string;
  attribute: string;
  value: string;
  confidence: number;
}

export function parseExtractResponse(raw: string): ExtractedFact[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) return [];
  let obj: any;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch { return []; }
  if (!obj || !Array.isArray(obj.facts)) return [];
  const out: ExtractedFact[] = [];
  for (const f of obj.facts.slice(0, 5)) {
    if (!f || typeof f !== "object") continue;
    const category = String(f.category ?? "");
    if (!["preference", "entity", "topic", "behavior", "context"].includes(category)) continue;
    const entity = String(f.entity ?? "").trim();
    const attribute = String(f.attribute ?? "").trim();
    const value = String(f.value ?? "").trim();
    if (!entity || !attribute || !value) continue;
    const confidence = typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.5;
    out.push({ category: category as Mem0Category, entity, attribute, value, confidence });
  }
  return out;
}

/**
 * Extract facts from `text` and upsert each into mem0_facts. Returns the
 * upserted rows (one per fact).
 */
export async function extractAndUpsert(text: string, userId = "operator", sourceMemoryId: number | null = null): Promise<ExtractedFact[]> {
  if (!text || text.length < 20) return [];
  let raw = "";
  try {
    const model = resolveModel(0, undefined, undefined);
    raw = await completeChat(model, EXTRACT_SYSTEM, text, 600);
  } catch (err) {
    logger.error({ err, textLen: text.length }, "mem0: extract LLM call failed");
    return [];
  }
  const facts = parseExtractResponse(raw);
  if (facts.length === 0) {
    logger.info({ rawLen: raw.length }, "mem0: no facts extracted");
    return [];
  }
  const persisted: ExtractedFact[] = [];
  for (const f of facts) {
    const row = await upsertFact({
      userId,
      category: f.category,
      entity: f.entity,
      attribute: f.attribute,
      value: f.value,
      confidence: f.confidence,
      sourceMemoryId,
      metadata: { source: "mem0_extract" },
    });
    if (row) persisted.push(f);
  }
  logger.info({ extracted: facts.length, persisted: persisted.length }, "mem0: extract complete");
  return persisted;
}