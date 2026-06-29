/**
 * Hermes LLM hooks — distill a session into a reusable skill.
 *
 * Uses the existing `resolveModel()` + `completeChat()` helpers so it
 * inherits the same NVIDIA NIM only (OpenRouter removed 2026-06-27) the rest of the
 * swarm uses. No extra API keys, no extra cost path.
 *
 * Distillation is conservative: we only attempt to extract a skill when a
 * session has a clear, repeating tool-call pattern (>= 2 distinct tools in
 * sequence) and a non-empty final answer. Everything else returns null and
 * Hermes skips skill creation for that session — better to record nothing
 * than to invent a skill.
 */

import { logger } from "../logger";
import { completeChat } from "../integrations";
import { resolveModel } from "../../routes/ai";
import type { DistilledSkill, RecordSessionInput } from "./types";
import { recordSkillRun, findMatchingSkill } from "./skills";

const DISTILL_SYSTEM = `You are Hermes, an autonomous skill distiller. Given a transcript of one AURA-OMEGA goal execution, extract a reusable skill pattern.

Return STRICT JSON matching this shape and nothing else:
{
  "skill": {
    "name": "kebab-case-skill-name",
    "description": "One-sentence description of when this skill applies.",
    "triggerKeywords": ["keyword1", "keyword2", "keyword3"],
    "pattern": [
      { "tool": "tool_name", "argsTemplate": { "key": "value-or-placeholder" } }
    ],
    "preferredAura": 2
  } | null
}

Rules:
- Return null (just the JSON {"skill": null}) if the session has no reusable tool pattern (random one-off work, failed before any tool ran, or empty result).
- triggerKeywords must be lowercase, 1-3 words each, and reflect phrases a future goal would naturally contain.
- pattern is an ordered list of tool calls. Use the actual tool names from the transcript. argsTemplate is optional; omit if the call had no stable argument shape.
- preferredAura is the agent id (1-6) whose toolset best matches the pattern, or null if none clearly fit.
- Never invent tools that did not appear in the transcript. Never invent success — if the session failed, return null.`;

export async function distillSkill(
  session: RecordSessionInput,
  sessionId: number | null,
): Promise<DistilledSkill | null> {
  // Skip if there's nothing to learn from.
  if (!session.toolCalls || session.toolCalls.length < 2) return null;
  if (session.outcome === "failed" || session.outcome === "interrupted") return null;

  const transcript = buildTranscript(session);
  const user = `Session transcript:\n\n${transcript}\n\nExtract a reusable skill as strict JSON, or {"skill": null} if none.`;

  try {
    const model = resolveModel(0, undefined, undefined); // 0 = use system default
    const raw = await completeChat(model, DISTILL_SYSTEM, user, 600);
    const parsed = parseDistillResponse(raw);
    if (!parsed) {
      logger.info({ sessionId, len: raw.length }, "hermes: distill returned no skill");
      return null;
    }
    const skill: DistilledSkill = { ...parsed, sourceSessionId: sessionId ?? undefined };
    const t0 = Date.now();
    const matched = await findMatchingSkill(skill.name);
    if (matched) {
      // Skill already exists — record a reinforcement, don't create a duplicate.
      await recordSkillRun({ skillId: matched.id, sessionId: sessionId ?? null, success: 1, durationMs: Date.now() - t0 });
      logger.info({ skillId: matched.id, name: skill.name }, "hermes: reinforced existing skill");
    } else {
      const { createSkill } = await import("./skills");
      const created = await createSkill(skill);
      if (created) {
        await recordSkillRun({ skillId: created.id, sessionId: sessionId ?? null, success: 1, durationMs: Date.now() - t0 });
        logger.info({ skillId: created.id, name: skill.name }, "hermes: created new skill");
      }
    }
    return skill;
  } catch (err) {
    logger.error({ err, sessionId }, "hermes: distillSkill failed (non-fatal)");
    return null;
  }
}

function buildTranscript(session: RecordSessionInput): string {
  const lines: string[] = [];
  lines.push(`GOAL: ${session.goal}`);
  lines.push(`OUTCOME: ${session.outcome}`);
  if (session.finalAnswer) lines.push(`FINAL_ANSWER: ${truncate(session.finalAnswer, 800)}`);
  if (session.auraReports.length > 0) {
    lines.push("");
    lines.push("AURA REPORTS:");
    for (const r of session.auraReports) {
      lines.push(`- ${r.name} (agentId=${r.agentId}): ${truncate(r.result, 400)}`);
    }
  }
  if (session.toolCalls.length > 0) {
    lines.push("");
    lines.push("TOOL CALLS (in order):");
    for (let i = 0; i < session.toolCalls.length; i++) {
      const c = session.toolCalls[i];
      const args = c.args ? JSON.stringify(c.args).slice(0, 200) : "{}";
      const result = c.result ? truncate(c.result, 200) : "(no result)";
      lines.push(`${i + 1}. ${c.tool} ${args} -> ${result}`);
    }
  }
  return lines.join("\n");
}

function parseDistillResponse(raw: string): DistilledSkill | null {
  // Strip code fences if the model wrapped the JSON.
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();
  // Find the first {...} block.
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart === -1 || braceEnd === -1 || braceEnd <= braceStart) return null;
  let candidate = text.slice(braceStart, braceEnd + 1);
  try {
    const obj = JSON.parse(candidate);
    if (!obj || typeof obj !== "object") return null;
    const s = obj.skill;
    if (!s || typeof s !== "object") return null;
    const name = String(s.name ?? "").trim();
    const description = String(s.description ?? "").trim();
    if (!name || !description) return null;
    const pattern = Array.isArray(s.pattern)
      ? s.pattern
          .filter((p: any) => p && typeof p.tool === "string")
          .map((p: any) => ({ tool: String(p.tool), argsTemplate: p.argsTemplate && typeof p.argsTemplate === "object" ? p.argsTemplate : undefined }))
      : [];
    if (pattern.length === 0) return null;
    const triggerKeywords = Array.isArray(s.triggerKeywords)
      ? s.triggerKeywords.map((k: any) => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 12)
      : [];
    const preferredAura = typeof s.preferredAura === "number" && s.preferredAura >= 1 && s.preferredAura <= 6
      ? s.preferredAura
      : null;
    return { name: slugify(name), description, triggerKeywords, pattern, preferredAura };
  } catch {
    return null;
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}