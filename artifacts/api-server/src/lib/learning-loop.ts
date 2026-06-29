/**
 * Learning loop — read, understand, learn, then act.
 *
 * Operator doctrine (2026-06-27): "It must not just read and regurgitate, it
 * must read, understand it, learn it, add to memory and then perform the task
 * and/or mission the system was given."
 *
 * This module is the "learn it, add to memory" half. It runs after a mission
 * completes successfully and:
 *
 *   1. Reads the mission's final synthesis (the synthesized answer that K2.6
 *      produced from Tier-0/1/2 docs + scraped evidence).
 *   2. Asks K2.6 to extract the durable, reusable knowledge (concepts, facts,
 *      procedures) into a structured `KnowledgeFact[]`.
 *   3. Persists each fact to hermes under `knowledge/<topic>/<slug>` so future
 *      missions can search this curated knowledge base BEFORE going to web.
 *   4. Records each learned fact with metadata: source URL, tier, confidence,
 *      mission id, timestamp.
 *
 * The result: the agent accumulates understanding over time. After 50 missions
 * about "sitemaps", it has 50 cached facts ready to answer the next sitemap
 * question without re-searching the web.
 */

import { logger } from "./logger";

export interface KnowledgeFact {
  topic: string;
  fact: string;
  sourceUrl?: string;
  tier?: 0 | 1 | 2 | 3 | 4 | 5;
  confidence: "confirmed" | "inferred" | "unknown";
  missionId?: number;
  tags?: string[];
}

export interface LearningLoopResult {
  missionId: number;
  factsExtracted: number;
  factsWritten: number;
  errors: string[];
  durationMs: number;
}

// Wiring (set at boot by app.ts)
let _completeChat: ((model: string, system: string, user: string, maxTokens?: number) => Promise<string>) | null = null;
let _runTool: ((tool: string, args: Record<string, unknown>, ctx: { agentId: number; agentName: string; agentColor: string | null; channelId: number | null }) => Promise<string>) | null = null;

export function setLearningLoopDeps(deps: {
  completeChat: typeof _completeChat;
  runTool: typeof _runTool;
}) {
  _completeChat = deps.completeChat;
  _runTool = deps.runTool;
}

const EXTRACTION_SYSTEM_PROMPT = `You are the learning extractor for AURA-OMEGA's knowledge base. Given a completed mission's goal and final synthesized answer, extract the durable, reusable knowledge into a JSON array of facts.

Each fact must be:
- Self-contained (no pronouns like "it" or "they" referring to context the reader doesn't have)
- Reusable in future missions on similar topics
- Tagged with a topic slug (lowercase, hyphenated, e.g. "google-search-console", "sitemap-xml")
- Labeled with confidence: "confirmed" (directly stated in source), "inferred" (synthesized from multiple sources), or "unknown" (uncertain)
- Cited with a source URL when possible (prefer Tier-0 official docs over Tier-5 blogs)

Output ONLY a JSON array, no prose, no markdown fences. Example:
[
  {"topic": "google-search-console", "fact": "Sitemaps are submitted via Search Console > Sitemaps > Add new sitemap. The URL must start with the verified property prefix.", "sourceUrl": "https://support.google.com/webmasters/answer/7451001", "tier": 0, "confidence": "confirmed"}
]

If the mission produced no durable knowledge (e.g. one-off lookup, no new facts), output [].`;

/**
 * Extract knowledge facts from a mission's final answer.
 * Pure function — caller wires _completeChat / _runTool at boot.
 */
export async function extractKnowledgeFromMission(
  missionId: number,
  goal: string,
  finalAnswer: string,
  sourceUrls: string[] = [],
): Promise<KnowledgeFact[]> {
  if (!_completeChat) {
    logger.warn({ missionId }, "learning loop: completeChat not wired");
    return [];
  }

  try {
    const userMsg = `Mission #${missionId}
Goal: ${goal}

Final synthesized answer:
${finalAnswer.slice(0, 6000)}

Source URLs consulted:
${sourceUrls.slice(0, 20).map((u, i) => `${i + 1}. ${u}`).join("\n")}

Extract the durable, reusable knowledge as a JSON array.`;

    const raw = await _completeChat("moonshotai/kimi-k2.6", EXTRACTION_SYSTEM_PROMPT, userMsg, 3000);
    // Best-effort JSON parse. K2.6 sometimes wraps in fences despite instructions.
    const cleaned = raw.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f: any) => f && typeof f.topic === "string" && typeof f.fact === "string")
      .map((f: any): KnowledgeFact => ({
        topic: String(f.topic).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 60),
        fact: String(f.fact).slice(0, 1000),
        sourceUrl: typeof f.sourceUrl === "string" ? f.sourceUrl : undefined,
        tier: typeof f.tier === "number" ? f.tier : undefined,
        confidence: ["confirmed", "inferred", "unknown"].includes(f.confidence) ? f.confidence : "inferred",
        missionId,
        tags: Array.isArray(f.tags) ? f.tags.map(String).slice(0, 8) : undefined,
      }));
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 200), missionId }, "learning loop: extraction failed");
    return [];
  }
}

/**
 * Persist extracted facts to hermes memory under `knowledge/<topic>/<slug>`.
 * Each fact is written as a separate memory key so future searches can hit
 * the granular knowledge base.
 */
export async function persistKnowledgeFacts(facts: KnowledgeFact[]): Promise<number> {
  if (!_runTool) {
    logger.warn("learning loop: runTool not wired");
    return 0;
  }
  let written = 0;
  for (const f of facts) {
    const slug = f.fact.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "");
    const key = `knowledge/${f.topic}/${slug || "fact-" + written}`;
    const body = JSON.stringify({
      topic: f.topic,
      fact: f.fact,
      sourceUrl: f.sourceUrl ?? null,
      tier: f.tier ?? null,
      confidence: f.confidence,
      missionId: f.missionId ?? null,
      tags: f.tags ?? [],
      learnedAt: new Date().toISOString(),
    });
    try {
      await _runTool(
        "memory_write",
        { key, content: body, tags: `knowledge,${f.topic},${f.confidence}` },
        { agentId: 1, agentName: "MissionKernel-Learning", agentColor: "#00ff88", channelId: null },
      );
      written++;
    } catch (err) {
      logger.warn({ err: String(err).slice(0, 150), key }, "learning loop: failed to write fact");
    }
  }
  return written;
}

/**
 * Run the full learning loop on a completed mission.
 *
 * Steps:
 *   1. Find the final-answer memory key for the mission
 *   2. Read the final answer
 *   3. Ask K2.6 to extract knowledge facts
 *   4. Write each fact back to memory under knowledge/<topic>/<slug>
 *
 * Returns a summary. Safe to call on every mission completion; failures are
 * logged but never throw.
 */
export async function runLearningLoop(
  missionId: number,
  goal: string,
): Promise<LearningLoopResult> {
  const started = Date.now();
  const errors: string[] = [];
  let factsExtracted = 0;
  let factsWritten = 0;

  if (!_runTool || !_completeChat) {
    return {
      missionId,
      factsExtracted: 0,
      factsWritten: 0,
      errors: ["learning loop deps not wired"],
      durationMs: 0,
    };
  }

  try {
    // 1. Find the final-answer key.
    const finalAnswerKey = `mission/final-answer/${missionId}`;
    const finalAnswerRaw = await _runTool(
      "memory_search",
      { query: finalAnswerKey, limit: 5, tags: "mission,final-answer" },
      { agentId: 1, agentName: "MissionKernel-Learning", agentColor: "#00ff88", channelId: null },
    );
    if (finalAnswerRaw.startsWith("error:") || !finalAnswerRaw.trim()) {
      return {
        missionId,
        factsExtracted: 0,
        factsWritten: 0,
        errors: ["no final answer in mission memory"],
        durationMs: Date.now() - started,
      };
    }

    // 2. Pull source URLs from the answer if any are cited.
    const sourceUrls = Array.from(finalAnswerRaw.matchAll(/https?:\/\/[^\s)]+/g)).map((m) => m[0]);

    // 3. Extract facts.
    const facts = await extractKnowledgeFromMission(missionId, goal, finalAnswerRaw, sourceUrls);
    factsExtracted = facts.length;

    // 4. Persist.
    factsWritten = await persistKnowledgeFacts(facts);
    if (factsWritten !== factsExtracted) {
      errors.push(`extracted ${factsExtracted} facts but wrote ${factsWritten}`);
    }
  } catch (err) {
    errors.push(String(err).slice(0, 200));
  }

  return {
    missionId,
    factsExtracted,
    factsWritten,
    errors,
    durationMs: Date.now() - started,
  };
}

/**
 * Search the agent's learned knowledge base (Tier 0 of the agent's own memory).
 * Use this BEFORE web search on subsequent missions about a topic the agent
 * already knows something about.
 */
export async function recallLearnedKnowledge(
  topic: string,
  limit = 10,
): Promise<KnowledgeFact[]> {
  if (!_runTool) return [];
  try {
    const raw = await _runTool(
      "memory_search",
      { query: topic, limit, tags: "knowledge" },
      { agentId: 1, agentName: "MissionKernel-Learning", agentColor: "#00ff88", channelId: null },
    );
    if (raw.startsWith("error:")) return [];
    const facts: KnowledgeFact[] = [];
    for (const line of raw.split("\n")) {
      const m = line.match(/^(\S+):\s+(.+)$/);
      if (!m) continue;
      try {
        const obj = JSON.parse(m[2]);
        facts.push({
          topic: obj.topic,
          fact: obj.fact,
          sourceUrl: obj.sourceUrl,
          tier: obj.tier,
          confidence: obj.confidence,
          missionId: obj.missionId,
          tags: obj.tags,
        });
      } catch {
        // skip non-JSON lines
      }
    }
    return facts;
  } catch {
    return [];
  }
}