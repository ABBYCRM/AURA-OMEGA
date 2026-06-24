import { describe, expect, it } from "vitest";
import { N8N_WORKFLOW_TASKS } from "./workflows";
import { TOOL_INTENT_VECTOR_REGISTRY, selectToolIntent, validateToolIntentVectorRegistry } from "./toolIntentVectorRegistry";

describe("Tool Intent Vector Registry", () => {
  it("has one exhaustive entry per n8n workflow", () => {
    expect(TOOL_INTENT_VECTOR_REGISTRY.length).toBe(N8N_WORKFLOW_TASKS.length);
    expect(validateToolIntentVectorRegistry()).toEqual([]);
  });

  it("selects lead/contact workflows from natural language", () => {
    const decision = selectToolIntent("Qualify this lead and sync it into the CRM", { lead: { name: "Test Lead" }, record: { id: "lead-1" }, operatorApproved: true });
    expect(decision.selected?.entry.id).toMatch(/^n8n-/);
    expect(decision.candidates.length).toBeGreaterThan(0);
    expect(decision.selected?.entry.callWhen.length).toBeGreaterThan(2);
    expect(decision.selected?.entry.exactInteractionProtocol.length).toBeGreaterThanOrEqual(6);
    expect(decision.selected?.entry.llmDecisionChecklist.length).toBeGreaterThanOrEqual(6);
  });

  it("holds when required inputs are missing", () => {
    const decision = selectToolIntent("Send a follow up text tomorrow");
    expect(decision.action).toBe("hold");
    expect(decision.missingInputs.length).toBeGreaterThan(0);
  });
});


it("maps coding, web search, GitHub, Render, VPS-style requests to non-CRM tools", () => {
  const repo = selectToolIntent("Fix this GitHub repo, branch, patch the TypeScript code, run tests, and collect build evidence", { repoUrl: "ABBYCRM/AURA-OMEGA", objective: "fix repo", operatorApproved: true });
  expect(repo.selected?.entry.category).toBe("engineering");
  const web = selectToolIntent("Search online for the latest vendor pricing and cite sources", { query: "vendor pricing", operatorApproved: true });
  expect(["research", "engineering", "browser-ui"]).toContain(web.selected?.entry.category);
  const ops = selectToolIntent("Check Render deploy logs, VPS health, uptime and heartbeat status", { serviceName: "aura-omega", operatorApproved: true });
  expect(ops.candidates.some((c) => c.entry.domainTriggers.join(" ").toLowerCase().includes("vps"))).toBe(true);
});
