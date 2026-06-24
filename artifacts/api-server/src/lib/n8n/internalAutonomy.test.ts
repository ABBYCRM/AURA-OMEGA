import { describe, expect, it } from "vitest";
import { getInternalAutonomySnapshot } from "./internalAutonomy";

describe("AURA internal autonomy heartbeat", () => {
  it("ships heartbeat jobs that keep the runtime agentic between chats", () => {
    const snapshot = getInternalAutonomySnapshot();
    expect(snapshot.jobs.length).toBeGreaterThanOrEqual(4);
    expect(snapshot.jobs.map((j) => j.id)).toContain("heartbeat-runtime-health");
    expect(snapshot.jobs.every((j) => j.everyMs >= 5 * 60_000)).toBe(true);
    expect(snapshot.jobs.every((j) => j.payload.dryRun === true)).toBe(true);
  });
});
