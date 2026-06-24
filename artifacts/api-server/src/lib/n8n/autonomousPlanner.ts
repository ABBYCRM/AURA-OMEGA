import { createBosOmegaBrainPlan, type BrainPlan, type TriState } from "../bosOmegaBrain";
import { AUTONOMOUS_WORKFLOW_GRAPH, getWorkflowNode, type AutonomousWorkflowNode, type RiskLevel } from "./workflowGraph";
import { workflowSuccessScore } from "./outcomeMemory";
import { getToolIntentEntry, scoreToolIntent, selectToolIntent } from "./toolIntentVectorRegistry";

export interface AutonomousPlanStep {
  index: number;
  workflowId: string;
  name: string;
  reason: string;
  webhookPath: string;
  ownerAgent: string;
  requiredInputs: string[];
  missingInputs: string[];
  dependsOn: string[];
  riskLevel: RiskLevel;
  sideEffect: string;
  maxRetries: number;
  expectedOutputs: string[];
}

export interface AutonomousExecutionPlan {
  objective: string;
  gate: TriState;
  mode: "autonomous" | "hold" | "abort";
  confidence: "high" | "medium" | "low" | "none";
  brain: BrainPlan;
  steps: AutonomousPlanStep[];
  missingInputs: string[];
  risk: RiskLevel;
  requiresOperatorApproval: boolean;
  rationale: string[];
  llmNextActionContract: {
    allowedTaskIds: string[];
    requiredResponseShape: Record<string, unknown>;
  };
}

const STOP = new Set(["the", "and", "for", "with", "into", "that", "this", "please", "make", "run", "task", "tasks", "workflow", "workflows", "system", "brain"]);
const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];

function tokenize(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().replace(/[^a-z0-9_\-/ ]+/g, " ").split(/\s+/).map((x) => x.trim()).filter((x) => x.length >= 3 && !STOP.has(x))));
}

function payloadHas(payload: Record<string, unknown>, key: string): boolean {
  if (key === "objective") return true;
  const value = payload[key];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function scoreNode(node: AutonomousWorkflowNode, objective: string, payload: Record<string, unknown>): { score: number; reason: string[] } {
  const entry = getToolIntentEntry(node.id);
  if (!entry) return { score: 0, reason: [`missing tool intent entry for ${node.id}`] };
  const vectorScore = scoreToolIntent(entry, objective, payload);
  const score = vectorScore.score + workflowSuccessScore(node.id) * 5;
  return { score, reason: vectorScore.matchedSignals.slice(0, 12) };
}

function expandDependencies(node: AutonomousWorkflowNode, seen = new Set<string>()): AutonomousWorkflowNode[] {
  if (seen.has(node.id)) return [];
  seen.add(node.id);
  const deps = node.dependsOn.flatMap((id) => {
    const dep = getWorkflowNode(id);
    return dep ? expandDependencies(dep, seen).concat(dep) : [];
  });
  return deps;
}

function strongestRisk(nodes: AutonomousWorkflowNode[]): RiskLevel {
  let strongest: RiskLevel = "low";
  for (const node of nodes) if (RISK_ORDER.indexOf(node.riskLevel) > RISK_ORDER.indexOf(strongest)) strongest = node.riskLevel;
  return strongest;
}

export function createAutonomousExecutionPlan(objective: string, payload: Record<string, unknown> = {}): AutonomousExecutionPlan {
  const brain = createBosOmegaBrainPlan(objective);
  if (brain.gate !== "GO") {
    return {
      objective,
      gate: brain.gate,
      mode: brain.gate === "ABORT" ? "abort" : "hold",
      confidence: "none",
      brain,
      steps: [],
      missingInputs: brain.gate === "HOLD" ? ["objective"] : [],
      risk: "low",
      requiresOperatorApproval: false,
      rationale: [brain.gate === "ABORT" ? "Safety gate rejected objective." : "Required information is missing."],
      llmNextActionContract: { allowedTaskIds: [], requiredResponseShape: { action: "hold|abort", reason: "string" } },
    };
  }

  const toolIntent = selectToolIntent(objective, payload);
  const explicitIds = tokenize(objective).filter((term) => /^n8n-\d{3}$/.test(term));
  const explicitNodes = explicitIds.map((id) => getWorkflowNode(id)).filter((x): x is AutonomousWorkflowNode => !!x);
  const scored = AUTONOMOUS_WORKFLOW_GRAPH
    .filter((node) => node.enabled)
    .map((node) => ({ node, ...scoreNode(node, objective, payload) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const vectorNode = toolIntent.selected?.node ? [toolIntent.selected.node] : [];
  const selected = explicitNodes.length ? explicitNodes : vectorNode.length ? vectorNode : scored.slice(0, objective.toLowerCase().includes("complex") || objective.toLowerCase().includes("full") || objective.toLowerCase().includes("autonomous") ? 5 : 1).map((x) => x.node);
  if (!selected.length) {
    return {
      objective,
      gate: "HOLD",
      mode: "hold",
      confidence: "none",
      brain,
      steps: [],
      missingInputs: ["taskId"],
      risk: "low",
      requiresOperatorApproval: false,
      rationale: ["No workflow matched the objective."],
      llmNextActionContract: { allowedTaskIds: AUTONOMOUS_WORKFLOW_GRAPH.map((x) => x.id), requiredResponseShape: { taskId: "n8n-###", inputs: {} } },
    };
  }

  const chainMap = new Map<string, AutonomousWorkflowNode>();
  for (const node of selected) {
    for (const dep of expandDependencies(node)) chainMap.set(dep.id, dep);
    chainMap.set(node.id, node);
  }
  const chain = Array.from(chainMap.values());
  const missingInputs = Array.from(new Set(chain.flatMap((node) => node.requiredInputs.filter((input) => !payloadHas(payload, input)))));
  const risk = strongestRisk(chain);
  const requiresOperatorApproval = chain.some((node) => node.sideEffect === "external" || node.riskLevel === "critical") && payload["operatorApproved"] !== true;
  const confidence = explicitNodes.length || (scored[0]?.score ?? 0) >= 80 ? "high" : (scored[0]?.score ?? 0) >= 30 ? "medium" : "low";

  const steps: AutonomousPlanStep[] = chain.map((node, index) => ({
    index: index + 1,
    workflowId: node.id,
    name: node.name,
    reason: explicitNodes.includes(node) ? "Explicitly requested." : (scored.find((x) => x.node.id === node.id)?.reason.join(", ") || "Required dependency."),
    webhookPath: node.webhookPath,
    ownerAgent: node.ownerAgent,
    requiredInputs: node.requiredInputs,
    missingInputs: node.requiredInputs.filter((input) => !payloadHas(payload, input)),
    dependsOn: node.dependsOn,
    riskLevel: node.riskLevel,
    sideEffect: node.sideEffect,
    maxRetries: node.maxRetries,
    expectedOutputs: node.outputKeys,
  }));

  const mode = missingInputs.length || requiresOperatorApproval || confidence === "low" ? "hold" : "autonomous";
  const rationale = [
    `Selected ${selected.map((x) => x.id).join(", ")} from Tool Intent Vector Registry. ${toolIntent.reason}`,
    `Expanded to ${steps.length} step(s) after dependency resolution.`,
    `Risk=${risk}; approval=${requiresOperatorApproval ? "required" : "not-required"}; missingInputs=${missingInputs.join(",") || "none"}.`,
  ];

  return {
    objective,
    gate: mode === "hold" ? "HOLD" : "GO",
    mode,
    confidence,
    brain,
    steps,
    missingInputs,
    risk,
    requiresOperatorApproval,
    rationale,
    llmNextActionContract: {
      allowedTaskIds: AUTONOMOUS_WORKFLOW_GRAPH.map((x) => x.id),
      requiredResponseShape: {
        action: "dispatch|hold|abort",
        taskIds: ["n8n-###"],
        inputs: "object containing all requiredInputs",
        reason: "grounded selection rationale",
        verificationPlan: ["expected evidence and success/failure checks"],
      },
    },
  };
}
