import { describe, expect, it } from "vitest";
import { getN8nWorkflowTask, N8N_WORKFLOW_TASKS, validateN8nWorkflowRegistry } from "./workflows";

describe("n8n workflow registry", () => {
  it("wires at least 58 tasks", () => {
    expect(N8N_WORKFLOW_TASKS.length).toBeGreaterThanOrEqual(58);
  });

  it("has no duplicate or malformed workflow entries", () => {
    expect(validateN8nWorkflowRegistry()).toEqual([]);
  });

  it("resolves webhook paths and ids", () => {
    expect(getN8nWorkflowTask("n8n-001")?.name).toBe("Inbound Goal Intake");
    expect(getN8nWorkflowTask("/webhook/aura-omega/discord-intake")?.id).toBe("n8n-002");
  });
});
