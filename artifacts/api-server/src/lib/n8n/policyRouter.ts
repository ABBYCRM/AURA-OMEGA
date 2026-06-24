import type { N8nWorkflowTask } from "./workflows";
import type { AutonomousWorkflowNode } from "./workflowGraph";
import { selectToolIntent } from "./toolIntentVectorRegistry";

export interface N8nPolicyDecision {
  objective: string;
  selected: N8nWorkflowTask | null;
  selectedNode?: AutonomousWorkflowNode | null;
  candidates: Array<{ task: N8nWorkflowTask; score: number; matched: string[] }>;
  missingInputs: string[];
  confidence: "high" | "medium" | "low" | "none";
  action: "dispatch" | "hold";
  reason: string;
  toolIntent?: ReturnType<typeof selectToolIntent>;
}

export function selectN8nWorkflow(objective: string, payload: Record<string, unknown> = {}): N8nPolicyDecision {
  const toolIntent = selectToolIntent(objective, payload);
  const selected = toolIntent.selected?.node ?? null;
  const candidates = toolIntent.candidates.map((candidate) => ({
    task: candidate.node,
    score: candidate.score,
    matched: candidate.matchedSignals,
  }));

  return {
    objective,
    selected,
    selectedNode: selected,
    candidates,
    missingInputs: toolIntent.missingInputs,
    confidence: toolIntent.selected?.confidence ?? "none",
    action: toolIntent.action === "dispatch" ? "dispatch" : "hold",
    reason: toolIntent.reason,
    toolIntent,
  };
}
