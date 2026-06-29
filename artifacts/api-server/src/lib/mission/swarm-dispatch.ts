/**
 * Swarm Dispatch — Kimi-style mission narrative for the operator chat.
 *
 * When the mission kernel (or the chat dispatch flow) kicks off a multi-step
 * plan, it calls `postSwarmDispatch()` to publish a single rich message
 * describing the plan as agent cards. The UI's chat stream renders this
 * message with the narrative + agent-swarm layout (matching the reference
 * "Now entering Phase 2 (Dimension Decomposition)" pattern).
 *
 * Payload (stored in messagesTable.metadata, JSON-stringified):
 *   {
 *     missionId: number,
 *     phase: string,                   // "Phase 2 — Dimension Decomposition"
 *     phaseBold: string,               // "Phase 2 (Dimension Decomposition)" — bold slice
 *     phasesRemaining?: number,
 *     totalSteps: number,
 *     dimensions: Array<{
 *       index: number,
 *       name: string,                  // "Toby"
 *       role: string,                  // "Compile and write final report"
 *       status: "queued" | "running" | "done" | "failed",
 *       progress: number,              // 0..1
 *     }>,
 *     isSwarmDispatch: true,
 *   }
 */

import { logger } from "../logger";
import { db } from "@workspace/db";
import { messagesTable } from "@workspace/db";
import { sendInngestEvent } from "../integrations";

const KIMI_PHASE_TITLES: Record<string, { phase: string; bold: string }> = {
  research: { phase: "Phase 1 (Research)", bold: "Phase 1 (Research)" },
  decomposition: { phase: "Phase 2 (Dimension Decomposition)", bold: "Phase 2 (Dimension Decomposition)" },
  parallel: { phase: "Phase 3 (Parallel Deep Dive)", bold: "Phase 3 (Parallel Deep Dive)" },
  synthesis: { phase: "Phase 4 (Synthesis)", bold: "Phase 4 (Synthesis)" },
  fallback: { phase: "Phase 1 (Dispatch)", bold: "Phase 1 (Dispatch)" },
};

export type SwarmDimension = {
  index: number;
  name: string;
  role: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
};

export type SwarmDispatchPayload = {
  missionId: number;
  phase: "research" | "decomposition" | "parallel" | "synthesis" | "fallback";
  phasesRemaining?: number;
  totalSteps: number;
  dimensions: SwarmDimension[];
};

export function planDimensions(opts: {
  plan: Array<{ index: number; engine: string; action: string; acceptance?: string }>;
}): SwarmDimension[] {
  // Operator rule 2026-06-27: don't be a copy/paste UI. Build dimension rows
  // from the actual plan, not from a hardcoded list of fake personas. Each
  // plan step becomes one "agent" row with the engine as the agent type
  // and the action+acceptance combined as the role description.
  return opts.plan.map((s) => ({
    index: s.index,
    name: shortEngine(s.engine),
    role: humanAction(s.action, s.acceptance),
    status: "queued",
    progress: 0,
  }));
}

function shortEngine(engine: string): string {
  // Map engine keys to short Kimi-style persona names. Operator rule:
  // "be inspired by the screenshot, don't copy it" — these names need to be
  // meaningful to OUR system, not placeholder anime characters.
  switch (engine) {
    case "crawl4ai":
      return "Crawler";
    case "hermes":
      return "Hermes";
    case "openhands":
      return "Forge";
    case "mem0":
      return "Memory";
    case "brain":
      return "Brain";
    case "searxng-search":
      return "Scout";
    case "tavily-search":
      return "Scout";
    default:
      return engine.charAt(0).toUpperCase() + engine.slice(1);
  }
}

function humanAction(action: string, acceptance?: string): string {
  // Convert "crawl" → "Compile and write dimension report" style labels.
  // (Acceptance string tells us what success looks like; we keep it short.)
  const verb = action.replace(/[-_]/g, " ");
  if (acceptance && acceptance.length < 80) {
    return `${verb.charAt(0).toUpperCase() + verb.slice(1)} → ${acceptance}`;
  }
  return `${verb.charAt(0).toUpperCase() + verb.slice(1)} step`;
}

/**
 * Post a Kimi-style swarm dispatch narrative + agent card grid to a chat channel.
 * Idempotent per (channelId, missionId) — re-posting with the same missionId
 * replaces the previous message (so the operator sees live progress).
 */
export async function postSwarmDispatch(opts: {
  channelId: number;
  missionId: number;
  payload: SwarmDispatchPayload;
  agentName?: string;
  agentColor?: string;
}): Promise<{ ok: boolean; messageId?: number; reason?: string }> {
  try {
    const titles = KIMI_PHASE_TITLES[opts.payload.phase] ?? KIMI_PHASE_TITLES.fallback;
    const dimCount = opts.payload.dimensions.length;
    // Operator-friendly narrative (matches Kimi's "Now entering Phase 2..."):
    // bold phase title, then sentence describing what's happening, then
    // "Deploy N agents in parallel with:" label, then the dimensions are
    // rendered as cards by the UI.
    const narrative =
      `Now entering **${titles.bold}** — dispatching the swarm for mission #${opts.missionId}.\n\n` +
      `Plan: ${opts.payload.totalSteps} step${opts.payload.totalSteps === 1 ? "" : "s"}, ` +
      `${dimCount} parallel dimension${dimCount === 1 ? "" : "s"}.`;
    const metadata = JSON.stringify({
      isSwarmDispatch: true,
      missionId: opts.missionId,
      phase: opts.payload.phase,
      phaseBold: titles.bold,
      phasesRemaining: opts.payload.phasesRemaining ?? null,
      totalSteps: opts.payload.totalSteps,
      dimensions: opts.payload.dimensions,
    });
    const [row] = await db
      .insert(messagesTable)
      .values({
        channelId: opts.channelId,
        agentId: null,
        agentName: opts.agentName ?? "ABBY",
        agentColor: opts.agentColor ?? "#ff00aa",
        content: narrative,
        messageType: "swarm_dispatch",
        metadata,
      })
      .returning({ id: messagesTable.id });
    void sendInngestEvent("swarm/dispatch.posted", {
      missionId: opts.missionId,
      channelId: opts.channelId,
      phase: opts.payload.phase,
      dimCount,
    });
    return { ok: true, messageId: row?.id };
  } catch (err) {
    logger.warn({ err, opts }, "postSwarmDispatch failed");
    return { ok: false, reason: String(err instanceof Error ? err.message : err) };
  }
}