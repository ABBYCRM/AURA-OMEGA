/**
 * Mission Kernel — types.
 *
 * Re-exports the canonical types from @workspace/db so callers can import
 * everything from `lib/mission` without reaching into the schema layer.
 */

export type {
  Mission,
  InsertMission,
  MissionEvent,
  InsertMissionEvent,
  MissionStatus,
  EngineName,
  MissionEventKind,
} from "@workspace/db";

/** A single step in a mission's plan. */
export interface MissionStep {
  /** Stable index — used to look up which step is current. */
  index: number;
  /** What this step does (human-readable for logs / UI). */
  description: string;
  /** Which engine knows how to execute this step. */
  engine: import("@workspace/db").EngineName;
  /** Adapter / tool name to invoke on the engine. */
  action: string;
  /** Adapter-specific input. */
  args: Record<string, unknown>;
  /** Predicate used by verifier to decide if the step succeeded. */
  acceptance: string;
  /** Maximum retry attempts before escalating to blocked. */
  maxAttempts?: number;
  /** Optional backoff override (seconds). */
  backoffSeconds?: number;
}

/** Acceptance verdict per step. */
export interface AcceptanceVerdict {
  stepIndex: number;
  acceptance: string;
  passed: boolean;
  evidence: string;
  checkedAt: string;
}

/** Persisted verification block (missions.verification jsonb). */
export interface MissionVerification {
  /** Total acceptance criteria. */
  total: number;
  /** Acceptance criteria passed. */
  passed: number;
  /** Last verdict per step. */
  stepVerdicts: AcceptanceVerdict[];
  /** Truth-label histogram from Evidence[].label. */
  truthHistogram: Record<"VERIFIED" | "INFERRED" | "UNKNOWN" | "FAILED" | "BLOCKED", number>;
}

/** Payload of a mission event. */
export interface MissionEventPayload {
  stepIndex?: number;
  engine?: import("@workspace/db").EngineName;
  output?: unknown;
  error?: string;
  confidence?: number;
  [key: string]: unknown;
}