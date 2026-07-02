/**
 * Mission Event Bus.
 *
 * Thin wrapper over the existing Inngest send plus an in-process EventEmitter
 * for synchronous in-process consumers (the same api-server process).
 *
 * For multi-instance deployments, Inngest delivers to all workers; the
 * in-process bus covers the local case.
 *
 * Subscribers register an async handler; failures are logged, never bubble.
 */

import { EventEmitter } from "node:events";
import { logger } from "../logger";
import { sendInngestEvent } from "../integrations";
import type { MissionEventKind, MissionEventPayload } from "./types";
import { recordEvent } from "./state-store";

const bus = new EventEmitter();
bus.setMaxListeners(50);

// Named MissionBusEvent (not MissionEvent) to avoid clashing with the
// mission_events row type re-exported from ./types via lib/mission's index.
export type MissionBusEvent = {
  kind: MissionEventKind;
  missionId: number;
  payload: MissionEventPayload;
  source: "inngest" | "in-process" | "api" | "cron";
  at: number;
};

export async function emit(
  kind: MissionEventKind,
  missionId: number,
  payload: MissionEventPayload,
  source: MissionBusEvent["source"] = "in-process",
): Promise<void> {
  const event: MissionBusEvent = { kind, missionId, payload, source, at: Date.now() };
  // Persist first so we never lose an event (inngest may be unreachable).
  await recordEvent({ missionId, kind, payload: payload as object, source });
  // Fire in-process subscribers.
  try {
    bus.emit(kind, event);
    bus.emit("*", event);
  } catch (err) {
    logger.warn({ err, kind }, "mission event: in-process emit failed");
  }
  // Fire Inngest (fire-and-forget) so cross-process subscribers can wake.
  if (source !== "inngest") {
    void sendInngestEvent(`mission/${kind}`, { missionId, ...payload, ts: event.at });
  }
}

export function subscribe(
  kind: MissionEventKind | "*" | MissionEventKind[],
  handler: (event: MissionBusEvent) => void | Promise<void>,
): () => void {
  const kinds = Array.isArray(kind) ? kind : [kind];
  for (const k of kinds) bus.on(k, handler);
  return () => {
    for (const k of kinds) bus.off(k, handler);
  };
}

/**
 * Failsafe poller — Inngest is the hot path, but if it ever drops events we
 * still want missions to resume. The runtime loop calls this once a minute.
 * It reads recent mission_events for any mission in an active state and
 * re-emits step.completed so the loop wakes up.
 */
export async function reEmitUnprocessedEvents(): Promise<number> {
  // No-op stub for the MVP — the runtime is woken by direct in-process emit.
  // Real implementation would query mission_events where source='inngest'
  // and the corresponding Inngest delivery was acked.
  return 0;
}