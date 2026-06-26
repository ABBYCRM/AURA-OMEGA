/**
 * Hermes runtime — shared types.
 *
 * Hermes (NousResearch/hermes-agent) provides a closed-loop learning runtime:
 * sessions get recorded, distilled into skills, skills self-improve via
 * success scoring, and a heartbeat nudges memory consolidation.
 *
 * This module is the TypeScript port. All persistence goes through Postgres
 * (tables defined in lib/db/src/schema/hermes.ts). The LLM call path goes
 * through the existing `resolveModel()` / `completeChat()` helpers so Hermes
 * inherits the same NVIDIA NIM / OpenRouter / Buddy failover the rest of the
 * swarm uses — no extra LLM cost.
 */

export type HermesOutcome = "success" | "partial" | "failed" | "interrupted" | "unknown";

export type SkillStatus = "candidate" | "active" | "retired";

export interface HermesAuraReport {
  agentId: number;
  name: string;
  result: string;
  toolCalls: Array<{ tool: string; args: unknown; result: string }>;
}

export interface HermesToolCallRecord {
  tool: string;
  args?: unknown;
  result?: string;
  agentId?: number;
  agentName?: string;
  at?: string; // ISO timestamp
}

export interface RecordSessionInput {
  goal: string;
  channelId?: number | null;
  outcome: HermesOutcome;
  auraReports: HermesAuraReport[];
  toolCalls: HermesToolCallRecord[];
  durationMs?: number;
  finalAnswer?: string | null;
  startedAt?: Date;
  completedAt?: Date;
}

export interface DistilledSkill {
  name: string;
  description: string;
  triggerKeywords: string[];
  pattern: Array<{ tool: string; argsTemplate?: Record<string, unknown> }>;
  preferredAura?: number | null;
  sourceSessionId?: number;
}

export interface SkillMatch {
  skillId: number;
  name: string;
  description: string;
  preferredAura: number | null;
  successScore: number;
  matchReason: "keyword" | "semantic" | "fallback";
}

export interface HeartbeatReport {
  startedAt: string;
  finishedAt: string;
  nudgesProcessed: number;
  skillsPruned: number;
  skillsPromoted: number;
  sessionsConsolidated: number;
  errors: string[];
}