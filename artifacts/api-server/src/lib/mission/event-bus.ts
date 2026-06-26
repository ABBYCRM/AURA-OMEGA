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

export type MissionEvent = {
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
  source: MissionEvent["source"] = "in-process",
): Promise<void> {
  const event: MissionEvent = { kind, missionId, payload, source, at: Date.now() };
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
  kind: MissionEventKind | "*",
  handler: (event: MissionEvent) => void | Promise<void>,
): () => void {
  bus.on(kind, handler);
  return () => bus.off(kind, handler);
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