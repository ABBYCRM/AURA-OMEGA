/**
 * OpenHands runtime — public surface.
 *
 * The orchestrator (TBD by operator) imports from this file. Internal
 * layout (workspaces, sessions, events, runtime, types) stays free to change.
 *
 * Typical usage from the (future) orchestrator:
 *
 *   import { dispatchGoal, listSessions, getSessionById, appendEvent } from "@/lib/openhands";
 *
 *   const result = await dispatchGoal({
 *     workspaceId: 1,
 *     goal: "fix the failing test in lib/db",
 *     channelId: 7,
 *   });
 *   // result.sessionId is the AURA-OMEGA session row;
 *   // result.upstreamSessionId is the upstream OpenHands session id (if forwarded).
 */

export {
  createWorkspace,
  listWorkspaces,
  getWorkspaceById,
  getWorkspaceByName,
  setWorkspaceStatus,
} from "./workspaces";
export {
  createSession,
  setSessionStatus,
  listSessions,
  getSessionById,
} from "./sessions";
export {
  appendEvent,
  listEvents,
  nextSequence,
  recordToolRun,
  toolSuccessRates,
  type ToolSuccessStats,
} from "./events";
export { planGoal, parsePlanResponse, type PlannedGoal, type PlannedStep } from "./llm";
export { executePlan } from "./executor";
export { dispatchGoal } from "./runtime";
export type {
  OpenhandsSandboxKind,
  OpenhandsAgentBackend,
  OpenhandsWorkspaceStatus,
  OpenhandsSessionStatus,
  OpenhandsOutcome,
  OpenhandsEventKind,
  OpenhandsEventRole,
  CreateWorkspaceInput,
  CreateSessionInput,
  RecordEventInput,
  RecordToolRunInput,
  DispatchResult,
} from "./types";