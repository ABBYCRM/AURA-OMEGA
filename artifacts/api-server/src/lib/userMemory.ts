/**
 * User Memory — Honcho-equivalent built on AURA-OMEGA's existing stack.
 *
 * After each chat turn ABBY fires an async NVIDIA NIM call that extracts key
 * facts about the operator from the conversation. Facts are stored in
 * agentMemoryTable (key="user_profile", tags="channel:{id}") with embeddings
 * for semantic dedup and retrieval.
 *
 * On the NEXT turn, getUserProfile() fetches the top-k facts and they are
 * prepended to ABBY's system prompt — so every conversation starts with
 * "what I already know about this operator" without anyone having to tell it.
 *
 * No new infra, no API keys, no licensing risk. Runs entirely on:
 *   - Postgres (agentMemoryTable already exists)
 *   - embed() from embeddings.ts (OpenAI-compatible, already wired)
 *   - NVIDIA NIM (already primary LLM)
 */

import { db } from "@workspace/db";
import { agentMemoryTable } from "@workspace/db";
import { desc, eq, and, ilike } from "drizzle-orm";
import { embed, embeddingsConfigured, cosineSimilarity, parseEmbedding } from "./embeddings";
import { llmRouteUrl, llmHeaders, nvidiaConfigured } from "./integrations";

const PROFILE_KEY = "user_profile";
const SIM_DEDUP_THRESHOLD = 0.88; // skip storing fact if this similar to existing
const MAX_STORED_FACTS = 150;     // hard cap — oldest pruned when exceeded
const TOP_K_INJECT = 10;          // facts injected into system prompt per turn
const ABBY_ID = 1;                // profile facts are attributed to ABBY

function channelTag(channelId: number): string {
  return `channel:${channelId}`;
}

// ─── NIM call (lightweight — 512 tokens max) ─────────────────────────────────

async function nimExtract(transcript: string): Promise<string[]> {
  if (!nvidiaConfigured()) return [];

  const url = llmRouteUrl("/chat/completions");
  let raw: Response;
  try {
    raw = await fetch(url, {
      method: "POST",
      headers: { ...llmHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta/llama-3.1-70b-instruct",
        messages: [
          {
            role: "system",
            content:
              "You extract factual insights about the OPERATOR (the human) from AI conversation transcripts. " +
              "Return ONLY a valid JSON array of concise one-sentence strings. " +
              "Capture: their role, goals, preferences, business context, communication style, recurring concerns, or constraints. " +
              "Skip pleasantries, model replies, and facts about the AI. " +
              "If nothing concrete can be inferred, return []. " +
              'Example output: ["Runs an AI CRM startup targeting sales teams", "Prefers direct no-fluff answers", "Deploying on Render free tier"]',
          },
          {
            role: "user",
            content: `Extract operator facts from this conversation:\n\n${transcript}`,
          },
        ],
        max_tokens: 400,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return [];
  }

  if (!raw.ok) return [];

  try {
    const data = (await raw.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = text.replace(/```(?:json)?|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((f: unknown) => String(f).trim())
      .filter((f) => f.length > 8 && f.length < 300);
  } catch {
    return [];
  }
}

// ─── Core: extract + store ────────────────────────────────────────────────────

/**
 * Called async after each chat turn. Extracts facts about the operator from
 * the recent conversation and stores new (non-duplicate) ones.
 * Never throws — all errors are swallowed so caller is never affected.
 */
export async function extractAndStoreUserFacts(
  channelId: number,
  recentMessages: Array<{ role: string; content: string }>,
): Promise<void> {
  try {
    const turns = recentMessages.filter(
      (m) => typeof m.content === "string" && m.content.trim().length > 0,
    );
    if (turns.length < 2) return; // nothing meaningful to extract

    const transcript = turns
      .slice(-12) // last 12 turns — enough context, not too noisy
      .map((m) => `${m.role === "user" ? "Operator" : "ABBY"}: ${m.content.trim()}`)
      .join("\n\n");

    const facts = await nimExtract(transcript);
    if (!facts.length) return;

    const tag = channelTag(channelId);

    // Load existing facts for dedup (most recent first)
    const existing = await db
      .select()
      .from(agentMemoryTable)
      .where(
        and(
          eq(agentMemoryTable.key, PROFILE_KEY),
          ilike(agentMemoryTable.tags, `%${tag}%`),
        ),
      )
      .orderBy(desc(agentMemoryTable.id))
      .limit(MAX_STORED_FACTS);

    for (const fact of facts) {
      // Semantic dedup if embeddings are available
      if (embeddingsConfigured()) {
        let newEmb: number[] | null = null;
        try { newEmb = await embed(fact); } catch { /* skip embed, fall through to text dedup */ }

        if (newEmb) {
          const isDupe = existing.some((row) => {
            const stored = parseEmbedding(row.embedding);
            if (!stored) return false;
            return cosineSimilarity(newEmb!, stored) >= SIM_DEDUP_THRESHOLD;
          });
          if (isDupe) continue;

          await db.insert(agentMemoryTable).values({
            agentId: ABBY_ID,
            agentName: "ABBY",
            key: PROFILE_KEY,
            content: fact,
            tags: tag,
            embedding: JSON.stringify(newEmb),
          });
          existing.unshift({ id: 0, agentId: ABBY_ID, agentName: "ABBY", key: PROFILE_KEY, content: fact, tags: tag, embedding: JSON.stringify(newEmb), createdAt: new Date() });
          continue;
        }
      }

      // Text dedup fallback
      const norm = fact.toLowerCase().trim();
      const isDupe = existing.some(
        (row) => (row.content ?? "").toLowerCase().trim() === norm,
      );
      if (!isDupe) {
        await db.insert(agentMemoryTable).values({
          agentId: ABBY_ID,
          agentName: "ABBY",
          key: PROFILE_KEY,
          content: fact,
          tags: tag,
          embedding: null,
        });
        existing.unshift({ id: 0, agentId: ABBY_ID, agentName: "ABBY", key: PROFILE_KEY, content: fact, tags: tag, embedding: null, createdAt: new Date() });
      }
    }

    // Prune oldest facts if we're over the cap
    if (existing.length > MAX_STORED_FACTS) {
      const overflow = existing.slice(MAX_STORED_FACTS);
      for (const row of overflow) {
        if (row.id > 0) {
          await db.delete(agentMemoryTable).where(eq(agentMemoryTable.id, row.id));
        }
      }
    }
  } catch {
    // Always silent — never affect the chat response
  }
}

// ─── Core: retrieve + format ──────────────────────────────────────────────────

/**
 * Returns a formatted string of the top-k operator facts for injection into
 * ABBY's system prompt. Returns "" if no profile exists yet.
 */
export async function getUserProfile(channelId: number): Promise<string> {
  try {
    const tag = channelTag(channelId);
    const rows = await db
      .select()
      .from(agentMemoryTable)
      .where(
        and(
          eq(agentMemoryTable.key, PROFILE_KEY),
          ilike(agentMemoryTable.tags, `%${tag}%`),
        ),
      )
      .orderBy(desc(agentMemoryTable.id))
      .limit(MAX_STORED_FACTS);

    if (!rows.length) return "";

    let topFacts: string[];

    if (embeddingsConfigured() && rows.some((r) => r.embedding)) {
      try {
        const queryEmb = await embed(
          "operator background goals preferences working style business context",
        );
        if (queryEmb) {
          const scored = rows
            .filter((r) => r.embedding)
            .map((r) => ({
              content: r.content ?? "",
              score: cosineSimilarity(queryEmb, parseEmbedding(r.embedding!)!),
            }))
            .filter((s) => s.content)
            .sort((a, b) => b.score - a.score)
            .slice(0, TOP_K_INJECT);
          topFacts = scored.map((s) => s.content);
        } else {
          topFacts = rows.slice(0, TOP_K_INJECT).map((r) => r.content ?? "").filter(Boolean);
        }
      } catch {
        topFacts = rows.slice(0, TOP_K_INJECT).map((r) => r.content ?? "").filter(Boolean);
      }
    } else {
      topFacts = rows.slice(0, TOP_K_INJECT).map((r) => r.content ?? "").filter(Boolean);
    }

    if (!topFacts.length) return "";

    return (
      "\n\n## Operator context (learned from prior conversations)\n" +
      topFacts.map((f) => `- ${f}`).join("\n")
    );
  } catch {
    return "";
  }
}
