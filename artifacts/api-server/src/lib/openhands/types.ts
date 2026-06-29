/**
 * OpenHands runtime — shared types.
 *
 * OpenHands (All-Hands-AI/OpenHands) is integrated as a PARALLEL subsystem:
 * no AURA orchestrator call path depends on it. The user-designed
 * orchestrator (planned separately) decides when to invoke it. This module
 * exposes:
 *   - workspace CRUD (sandbox + repo + agent backend config)
 *   - session lifecycle (queued -> running -> awaiting_input -> terminal)
 *   - event log (state-sourced: message, tool_call, observation, ...)
 *   - tool-run history (per-tool success/failure for future skill distillation)
 *
 * Persistence in Postgres (lib/db/src/schema/openhands.ts). LLM calls go
 * through the existing completeChat() in lib/integrations.ts so OpenHands
 * inherits NVIDIA NIM / OpenRouter / Buddy failover without new keys.
 */

export type OpenhandsSandboxKind = "local" | "docker" | "remote" | "e2b";
export type OpenhandsAgentBackend = "openhands" | "claude-code" | "codex" | "gemini" | "custom";
export type OpenhandsWorkspaceStatus = "ready" | "busy" | "archived";
export type OpenhandsSessionStatus =
  | "queued"
  | "running"
  | "awaiting_input"
  | "success"
  | "partial"
  | "failed"
  | "interrupted";
export type OpenhandsOutcome = "success" | "partial" | "failed" | "interrupted";
export type OpenhandsEventKind = "message" | "tool_call" | "observation" | "state_delta" | "system";
export type OpenhandsEventRole = "user" | "assistant" | "system" | "tool";

export interface CreateWorkspaceInput {
  name: string;
  description?: string | null;
  repoUrl?: string | null;
  baseBranch?: string | null;
  sandboxKind?: OpenhandsSandboxKind;
  sandboxConfig?: Record<string, unknown>;
  agentBackend?: OpenhandsAgentBackend;
}

export interface CreateSessionInput {
  workspaceId: number;
  goal: string;
  channelId?: number | null;
  parentSessionId?: number | null;
  metadata?: Record<string, unknown>;
}

export interface RecordEventInput {
  sessionId: number;
  kind: OpenhandsEventKind;
  role?: OpenhandsEventRole;
  payload?: Record<string, unknown>;
  sequence: number;
}

export interface RecordToolRunInput {
  sessionId: number;
  toolName: string;
  args?: Record<string, unknown>;
  resultSummary?: string | null;
  success: boolean;
  durationMs?: number | null;
  error?: string | null;
}

export interface DispatchResult {
  sessionId: number;
  status: OpenhandsSessionStatus;
  workspace: { id: number; name: string; agentBackend: OpenhandsAgentBackend; sandboxKind: OpenhandsSandboxKind };
  // When OPENHANDS_BASE_URL is set, the call is forwarded to a real OpenHands
  // server and this is the upstream session ID we got back. When unset, the
  // session is queued locally and a future worker can pick it up.
  upstreamSessionId?: string;
  message: string;
}