/**
 * Swarm Bus — ephemeral in-process message bus for agent-to-agent communication.
 *
 * Feature 3 of the proto-AGI build (2026-06-29):
 *   AURAs can broadcast findings mid-run so sibling agents and ABBY's coordinator
 *   pass can read them. Messages are scoped to a runKey (one per orchestrateGoal
 *   call) so two concurrent orchestrations never bleed into each other.
 *
 * Design:
 *   - In-memory only. Bus is ephemeral — a restart clears it, which is fine
 *     because runs complete in seconds-to-minutes, not across deploys.
 *   - Auto-evict run buckets older than BUS_TTL_MS (1 hour) to prevent leaks.
 *   - Thread-safe by Node.js single-threaded event loop guarantee.
 */

export interface SwarmMessage {
  from: string;
  agentId: number;
  content: string;
  postedAt: number;
}

const bus = new Map<string, SwarmMessage[]>();
const BUS_TTL_MS = 60 * 60 * 1000; // 1 hour

function evict(): void {
  const cutoff = Date.now() - BUS_TTL_MS;
  for (const [key, msgs] of bus) {
    if (msgs.length === 0 || (msgs[msgs.length - 1]?.postedAt ?? 0) < cutoff) {
      bus.delete(key);
    }
  }
}

export function swarmPost(runKey: string, agentId: number, agentName: string, content: string): void {
  if (!bus.has(runKey)) bus.set(runKey, []);
  bus.get(runKey)!.push({ from: agentName, agentId, content, postedAt: Date.now() });
}

export function swarmRead(runKey: string): SwarmMessage[] {
  evict();
  return bus.get(runKey) ?? [];
}

export function swarmClear(runKey: string): void {
  bus.delete(runKey);
}
