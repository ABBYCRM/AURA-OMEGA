import { AUTONOMOUS_WORKFLOW_GRAPH } from "./workflowGraph";

export function n8nLlmToolSchemas() {
  return [
    {
      type: "function",
      function: {
        name: "bos_omega_plan_n8n_workflow",
        description: "Plan one or more n8n workflows using the BOS-OMEGA autonomous workflow graph. Use before execution.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["objective"],
          properties: {
            objective: { type: "string", description: "The operator goal to decompose and route." },
            inputs: { type: "object", description: "Known fields such as repoUrl, targetUrl, query, channelId, lead, record, content, phone, email." },
            operatorApproved: { type: "boolean", description: "True only when operator explicitly approved external side effects." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "bos_omega_dispatch_n8n_workflow",
        description: "Dispatch an approved n8n workflow by exact task id after policy validation.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["taskId", "objective", "inputs"],
          properties: {
            taskId: { type: "string", enum: AUTONOMOUS_WORKFLOW_GRAPH.map((x) => x.id) },
            objective: { type: "string" },
            inputs: { type: "object" },
            idempotencyKey: { type: "string" },
          },
        },
      },
    },
  ];
}

export function n8nTaskCatalogForLlm() {
  return AUTONOMOUS_WORKFLOW_GRAPH.map((node) => ({
    id: node.id,
    name: node.name,
    ownerAgent: node.ownerAgent,
    webhookPath: node.webhookPath,
    requiredInputs: node.requiredInputs,
    outputs: node.outputKeys,
    dependencies: node.dependsOn,
    riskLevel: node.riskLevel,
    sideEffect: node.sideEffect,
    description: node.llmDescription,
  }));
}
