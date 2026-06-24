import { describe, expect, it } from "vitest";
import { selectN8nWorkflow } from "./policyRouter";

describe("n8n policy router", () => {
  it("selects an explicit workflow id with high confidence", () => {
    const decision = selectN8nWorkflow("run n8n-005 build verification now");
    expect(decision.selected?.id).toBe("n8n-005");
    expect(decision.action).toBe("dispatch");
    expect(decision.confidence).toBe("high");
  });

  it("selects by semantic task signals", () => {
    const decision = selectN8nWorkflow("check render health and service logs");
    expect(decision.selected?.id).toBe("n8n-007");
    expect(decision.action).toBe("dispatch");
  });

  it("holds when no workflow has a meaningful match", () => {
    const decision = selectN8nWorkflow("banana spaceship purple unrelated");
    expect(decision.action).toBe("hold");
  });
});
