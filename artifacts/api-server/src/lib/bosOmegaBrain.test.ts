import { describe, expect, it } from "vitest";
import { createBosOmegaBrainPlan, markBrainExecuted, markBrainVerified, triStateGate } from "./bosOmegaBrain";

describe("BOS-OMEGA brain", () => {
  it("gates normal n8n workflow tasks as GO and adds n8n acceptance criteria", () => {
    const plan = createBosOmegaBrainPlan("wire n8n workflow automation into the runtime");
    expect(plan.gate).toBe("GO");
    expect(plan.taskType).toBe("N8N");
    expect(plan.acceptance.some((x) => x.includes("n8n task registry"))).toBe(true);
  });

  it("blocks unsafe objectives before dispatch", () => {
    expect(triStateGate("build malware keylogger")).toBe("ABORT");
  });

  it("can transition to verified after execution evidence", () => {
    const planned = createBosOmegaBrainPlan("run repo build verification");
    const executed = markBrainExecuted(planned, "build verification hook completed");
    const verified = markBrainVerified(executed, "acceptance criteria passed");
    expect(verified.status).toBe("COMPLETE");
    expect(verified.verified).toBe(true);
    expect(verified.activeInference.evidenceStrength).toBe(1);
  });
});
