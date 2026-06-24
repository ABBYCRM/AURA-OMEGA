import { describe, expect, it } from "vitest";
import { createAutonomousExecutionPlan } from "./autonomousPlanner";
import { AUTONOMOUS_WORKFLOW_GRAPH, validateAutonomousWorkflowGraph } from "./workflowGraph";
import { n8nLlmToolSchemas, n8nTaskCatalogForLlm } from "./llmToolSchema";

const basePayload = {
  operatorApproved: true,
  objective: "repair repo and verify build",
  repoUrl: "https://github.com/example/repo.git",
  targetUrl: "https://example.com",
  serviceName: "demo",
  query: "demo",
  content: "demo",
  payload: { ok: true },
};

describe("autonomous n8n workflow graph", () => {
  it("keeps all 60 tasks enriched for LLM routing", () => {
    expect(AUTONOMOUS_WORKFLOW_GRAPH).toHaveLength(60);
    expect(validateAutonomousWorkflowGraph()).toEqual([]);
    expect(AUTONOMOUS_WORKFLOW_GRAPH.every((node) => node.intentKeywords.length > 0)).toBe(true);
    expect(AUTONOMOUS_WORKFLOW_GRAPH.every((node) => node.outputKeys.length > 0)).toBe(true);
  });

  it("builds dependency-aware multi-step plans", () => {
    const plan = createAutonomousExecutionPlan("full autonomous repo repair build verification and playwright smoke", basePayload);
    const ids = plan.steps.map((step) => step.workflowId);
    expect(ids).toContain("n8n-004");
    expect(ids).toContain("n8n-005");
    expect(plan.steps.length).toBeGreaterThan(1);
    expect(plan.mode).toBe("autonomous");
  });

  it("holds risky external actions until operator approval", () => {
    const plan = createAutonomousExecutionPlan("send approved Discord relay message n8n-050", { objective: "send", channelId: 1, message: "hello" });
    expect(plan.requiresOperatorApproval).toBe(true);
    expect(plan.mode).toBe("hold");
  });

  it("exposes compact tool schemas and catalog for LLMs", () => {
    expect(n8nLlmToolSchemas()).toHaveLength(2);
    expect(n8nTaskCatalogForLlm()).toHaveLength(60);
  });
});
