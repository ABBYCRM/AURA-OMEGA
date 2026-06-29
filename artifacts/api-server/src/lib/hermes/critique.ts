/**
 * Reflexive Self-Critique — Feature 1 of the proto-AGI build (2026-06-29).
 *
 * After a failed orchestration or blocked mission, the system calls this module
 * to have the LLM reason about WHY the failure happened and generate a concrete
 * revised approach. The critique is:
 *   1. Returned to the caller (optionally surfaced to the operator).
 *   2. Stored in Hermes memory under postmortem/<goal-slug> so future runs with
 *      a similar goal can see what went wrong before and avoid the same trap.
 *
 * This is the feedback loop that was missing: instead of silently recording
 * "failed" and moving on, the system examines the wreckage and builds
 * institutional memory from it.
 */

import { logger } from "../logger";
import { completeChat } from "../integrations";
import { resolveModel } from "../../routes/ai";
import { db } from "@workspace/db";
import { agentMemoryTable } from "@workspace/db";

const CRITIQUE_SYSTEM = `You are the AURA-OMEGA self-critique module. Given a failed goal and its failure evidence, you diagnose root causes and propose a concrete revised approach.

Respond STRICTLY as JSON:
{
  "rootCauses": ["<cause 1>", "<cause 2>"],
  "revisedApproach": "<2-4 sentence concrete strategy for the next attempt>",
  "toolChanges": ["<specific tool usage change>"],
  "avoidPatterns": ["<pattern that failed and must not be repeated>"],
  "confidence": 0.0-1.0
}

Rules:
- rootCauses: list the actual mechanical reasons (wrong tool, bad arg, missing auth, rate-limit, etc.) not vague "the agent failed".
- revisedApproach: actionable, specific — name different tools or different argument strategies.
- toolChanges: zero or more specific tool/arg changes that would help.
- avoidPatterns: patterns from this run that demonstrably failed.
- confidence: your confidence that the revised approach will succeed next time (0=random guess, 1=certain).
- If there is no learnable pattern (pure transient error, network blip), return confidence < 0.3 and minimal fields.`;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export interface CritiqueResult {
  rootCauses: string[];
  revisedApproach: string;
  toolChanges: string[];
  avoidPatterns: string[];
  confidence: number;
}

export async function reflexiveCritique(opts: {
  goal: string;
  failureReason: string;
  auraReports?: Array<{ name: string; result: string }>;
  missionId?: number;
}): Promise<CritiqueResult | null> {
  const { goal, failureReason, auraReports = [], missionId } = opts;

  const userPrompt = `Goal: "${goal}"

Failure reason: ${failureReason.slice(0, 600)}

${auraReports.length > 0 ? `AURA reports:\n${auraReports.map((r) => `- ${r.name}: ${r.result.slice(0, 300)}`).join("\n")}` : ""}

${missionId != null ? `Mission ID: ${missionId}` : ""}

Diagnose why this failed and produce a revised approach as strict JSON.`;

  try {
    const model = resolveModel(0, undefined, undefined);
    const raw = await completeChat(model, CRITIQUE_SYSTEM, userPrompt, 600);

    // Parse JSON from the response.
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const text = fenceMatch ? fenceMatch[1].trim() : raw.trim();
    const braceStart = text.indexOf("{");
    const braceEnd = text.lastIndexOf("}");
    if (braceStart === -1 || braceEnd <= braceStart) return null;

    const parsed = JSON.parse(text.slice(braceStart, braceEnd + 1)) as Partial<CritiqueResult>;
    const critique: CritiqueResult = {
      rootCauses: Array.isArray(parsed.rootCauses) ? parsed.rootCauses.map(String) : [],
      revisedApproach: String(parsed.revisedApproach ?? ""),
      toolChanges: Array.isArray(parsed.toolChanges) ? parsed.toolChanges.map(String) : [],
      avoidPatterns: Array.isArray(parsed.avoidPatterns) ? parsed.avoidPatterns.map(String) : [],
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    };

    if (!critique.revisedApproach) return null;

    // Persist critique to Hermes memory so future runs can read it.
    const slug = slugify(goal);
    const key = `postmortem/${slug}`;
    const content = JSON.stringify({ ...critique, goal, failedAt: new Date().toISOString(), missionId }, null, 2);
    await db
      .insert(agentMemoryTable)
      .values({ key, content, agentId: 1, tags: "postmortem,self-critique" })
      .catch((err) => logger.error({ err, key }, "critique: failed to persist to memory"));

    logger.info(
      { goal: goal.slice(0, 80), confidence: critique.confidence, rootCauses: critique.rootCauses.length },
      "reflexive-critique: stored postmortem",
    );
    return critique;
  } catch (err) {
    logger.error({ err, goal: goal.slice(0, 80) }, "reflexive-critique: failed (non-fatal)");
    return null;
  }
}

/**
 * Retrieve the most recent postmortem for a similar goal, if one exists.
 * Called at the START of a run to warn the system away from known failure patterns.
 */
export async function recallPostmortem(goal: string): Promise<CritiqueResult | null> {
  const slug = slugify(goal);
  const key = `postmortem/${slug}`;
  try {
    const { eq, desc } = await import("drizzle-orm");
    const [exact] = await db
      .select({ content: agentMemoryTable.content })
      .from(agentMemoryTable)
      .where(eq(agentMemoryTable.key, key))
      .orderBy(desc(agentMemoryTable.id))
      .limit(1);
    if (!exact?.content) return null;
    const parsed = JSON.parse(exact.content) as Partial<CritiqueResult>;
    return {
      rootCauses: Array.isArray(parsed.rootCauses) ? parsed.rootCauses.map(String) : [],
      revisedApproach: String(parsed.revisedApproach ?? ""),
      toolChanges: Array.isArray(parsed.toolChanges) ? parsed.toolChanges.map(String) : [],
      avoidPatterns: Array.isArray(parsed.avoidPatterns) ? parsed.avoidPatterns.map(String) : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch {
    return null;
  }
}
