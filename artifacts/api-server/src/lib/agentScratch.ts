/**
 * Agent Working Scratchpad — ephemeral per-channel in-memory workspace.
 * Agents write intermediate reasoning here during orchestration.
 * Cleared at the start of each new orchestrateGoal() call.
 * Read by the UI via GET /api/agent-scratch?channelId=X.
 */

export type ScratchType = "thought" | "hypothesis" | "result" | "todo" | "note";

export interface ScratchEntry {
  agentName: string;
  type: ScratchType;
  content: string;
  ts: number; // unix ms
}

// channelId → entries (ordered, ephemeral)
const store = new Map<number, ScratchEntry[]>();

export function scratchWrite(
  channelId: number,
  agentName: string,
  type: ScratchType,
  content: string,
): void {
  const entries = store.get(channelId) ?? [];
  entries.push({ agentName, type, content, ts: Date.now() });
  store.set(channelId, entries);
}

export function scratchRead(channelId: number): ScratchEntry[] {
  return store.get(channelId) ?? [];
}

export function scratchClear(channelId: number): void {
  store.delete(channelId);
}
