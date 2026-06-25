export type TriState = "GO" | "HOLD" | "ABORT";
export type RunStatus =
  | "NEW"
  | "INTAKE"
  | "BOOT_MEMORY"
  | "PLANNED"
  | "INSPECTED"
  | "EXECUTED"
  | "VERIFIED"
  | "SELF_CORRECTING"
  | "COMPLETE"
  | "BLOCKED"
  | "FAILED";
export type TruthLabel = "VERIFIED" | "INFERRED" | "UNKNOWN" | "FAILED" | "BLOCKED";
export type TaskType = "CODE" | "RESEARCH" | "UI" | "DEPLOYMENT" | "SECURITY" | "WRITING" | "N8N" | "GENERAL_EXECUTION";
export type AgentRole = "OMEGA" | "ALPHA" | "PRAXIS" | "AURA-1" | "AURA-2" | "AURA-3" | "AURA-4" | "AURA-5";

export interface Evidence {
  label: TruthLabel;
  agent: AgentRole;
  message: string;
  timestamp: string;
}

export interface BrainPlan {
  objective: string;
  deliverable: string;
  taskType: TaskType;
  gate: TriState;
  status: RunStatus;
  acceptance: string[];
  plan: string[];
  evidence: Evidence[];
  activeInference: {
    hiddenState: string;
    observation: string;
    prior: string;
    prediction: string;
    predictionError: string;
    selectedPolicy: string;
    ambiguity: number;
    risk: number;
    evidenceStrength: number;
    expectedFreeEnergy: number;
  };
  verified: boolean;
  blocked: boolean;
  failed: boolean;
}

const unsafeNeedles = [
  "steal",
  "exfiltrate",
  "bypass authentication",
  "malware",
  "ransomware",
  "keylogger",
  "delete production database",
];
const holdNeedles = ["send live money", "purchase now", "wire funds"];

function contains(objective: string, needle: string): boolean {
  return objective.toLowerCase().includes(needle.toLowerCase());
}

function addEvidence(plan: BrainPlan, label: TruthLabel, agent: AgentRole, message: string): void {
  plan.evidence.push({ label, agent, message, timestamp: new Date().toISOString() });
}

export function triStateGate(objective: string): TriState {
  if (!objective.trim()) return "HOLD";
  if (unsafeNeedles.some((needle) => contains(objective, needle))) return "ABORT";
  if (holdNeedles.some((needle) => contains(objective, needle))) return "HOLD";
  return "GO";
}

export function classifyTaskType(objective: string): TaskType {
  if (["n8n", "workflow", "webhook", "automation", "cron"].some((x) => contains(objective, x))) return "N8N";
  if (["code", "repo", "build", "compile", "function", "runtime", ".ts", ".js", ".c"].some((x) => contains(objective, x))) return "CODE";
  if (["research", "source", "search", "cite"].some((x) => contains(objective, x))) return "RESEARCH";
  if (["ui", "interface", "button", "screen", "design"].some((x) => contains(objective, x))) return "UI";
  if (["deploy", "render", "server", "health endpoint"].some((x) => contains(objective, x))) return "DEPLOYMENT";
  if (["secret", "token", "password", "key", "security"].some((x) => contains(objective, x))) return "SECURITY";
  if (["write", "prompt", "document", "copy paste"].some((x) => contains(objective, x))) return "WRITING";
  return "GENERAL_EXECUTION";
}

export function createBosOmegaBrainPlan(objective: string): BrainPlan {
  const taskType = classifyTaskType(objective);
  const gate = triStateGate(objective);
  const plan: BrainPlan = {
    objective,
    deliverable: `Verified final output for task type ${taskType}.`,
    taskType,
    gate,
    status: "INTAKE",
    plan: [],
    acceptance: [],
    evidence: [],
    activeInference: {
      hiddenState: "User wants end-to-end task completion with no fabricated success.",
      observation: "No execution evidence yet.",
      prior: "Reduce ambiguity, preserve continuity, execute, verify, self-correct, report truth.",
      prediction: "Correct policy reduces ambiguity and increases verified evidence.",
      predictionError: "Task not yet verified. Continue execution loop.",
      selectedPolicy: "PLAN",
      ambiguity: 1,
      risk: 0.2,
      evidenceStrength: 0,
      expectedFreeEnergy: 1.2,
    },
    verified: false,
    blocked: gate === "HOLD",
    failed: gate === "ABORT",
  };

  addEvidence(plan, "VERIFIED", "OMEGA", `Intake complete. Task type=${taskType}. Gate=${gate}.`);
  if (gate === "ABORT") {
    plan.status = "FAILED";
    addEvidence(plan, "FAILED", "OMEGA", "Request rejected by safety/destructive-action gate.");
    return updateActiveInference(plan);
  }
  if (gate === "HOLD") {
    plan.status = "BLOCKED";
    addEvidence(plan, "BLOCKED", "OMEGA", "Required information/access is missing.");
    return updateActiveInference(plan);
  }

  plan.plan.push(
    "Restate objective and final deliverable.",
    "Load current runtime memory/continuity context.",
    "Classify task and apply tri-state gate.",
    "Inspect available evidence before guessing.",
    "Route work to the correct adapter layer.",
    "Execute the smallest complete implementation step.",
    "Observe output and capture evidence.",
    "Verify against acceptance criteria.",
    "Self-correct if verification fails.",
    "Report only verified status.",
  );
  plan.acceptance.push(
    "Tri-state gate completed.",
    "Task type classified.",
    "Execution path selected.",
    "At least one verified evidence record captured.",
    "Verification performed before completion.",
    "Final report uses truth labels.",
  );
  if (taskType === "N8N") {
    plan.acceptance.push(
      "n8n task registry is available.",
      "Every workflow definition has id, name, schedule/webhook trigger, owner agent, prompt, and enabled state.",
      "Inbound n8n calls pass through BOS-OMEGA tri-state gating before dispatch.",
    );
  }
  if (taskType === "CODE") plan.acceptance.push("Code path includes build/test verification hooks.");
  if (taskType === "UI") plan.acceptance.push("UI path includes browser validation hooks.");
  if (taskType === "DEPLOYMENT") plan.acceptance.push("Deployment path includes health-check hooks.");
  if (taskType === "SECURITY") plan.acceptance.push("Security path protects secrets and avoids credential exposure.");

  plan.status = "PLANNED";
  addEvidence(plan, "VERIFIED", "ALPHA", `Plan created with ${plan.plan.length} steps and ${plan.acceptance.length} acceptance criteria.`);
  return updateActiveInference(plan);
}

export function markBrainExecuted(plan: BrainPlan, message: string): BrainPlan {
  const next = JSON.parse(JSON.stringify(plan)) as BrainPlan;
  next.status = "EXECUTED";
  addEvidence(next, "VERIFIED", next.taskType === "N8N" ? "AURA-4" : "PRAXIS", message);
  return updateActiveInference(next);
}

export function markBrainVerified(plan: BrainPlan, message: string): BrainPlan {
  const next = JSON.parse(JSON.stringify(plan)) as BrainPlan;
  next.status = "COMPLETE";
  next.verified = true;
  next.failed = false;
  next.blocked = false;
  addEvidence(next, "VERIFIED", "OMEGA", message);
  return updateActiveInference(next);
}

function updateActiveInference(plan: BrainPlan): BrainPlan {
  const verifiedEvidence = plan.evidence.filter((e) => e.label === "VERIFIED").length;
  let ambiguity = 1;
  let risk = 0.2;
  let evidenceStrength = Math.min(1, verifiedEvidence * 0.18);
  if (plan.plan.length) ambiguity -= 0.25;
  if (plan.acceptance.length) ambiguity -= 0.25;
  if (["EXECUTED", "VERIFIED", "COMPLETE"].includes(plan.status)) ambiguity -= 0.25;
  if (plan.verified) {
    ambiguity = 0;
    evidenceStrength = 1;
  }
  if (plan.blocked || plan.failed) risk += 0.5;
  ambiguity = Math.max(0, Number(ambiguity.toFixed(2)));
  risk = Number(risk.toFixed(2));
  evidenceStrength = Number(evidenceStrength.toFixed(2));
  const expectedFreeEnergy = Math.max(0, Number((ambiguity + risk - evidenceStrength).toFixed(2)));
  plan.activeInference = {
    hiddenState: `User wants end-to-end task completion. Current runtime status=${plan.status}.`,
    observation: `Evidence=${plan.evidence.length} Plan=${plan.plan.length} Acceptance=${plan.acceptance.length} Verified=${plan.verified} Blocked=${plan.blocked} Failed=${plan.failed}.`,
    prior: "Canon: reduce ambiguity, preserve continuity, execute, verify, self-correct, report truth.",
    prediction: "If policy is correct, each cycle reduces ambiguity, increases evidence, and preserves memory continuity.",
    predictionError: plan.blocked ? "Blocked state detected." : plan.failed ? "Failure detected." : plan.verified ? "No active prediction error. Task verified." : "Task not yet verified. Continue execution loop.",
    selectedPolicy: selectPolicy(plan),
    ambiguity,
    risk,
    evidenceStrength,
    expectedFreeEnergy,
  };
  return plan;
}

function selectPolicy(plan: BrainPlan): string {
  if (plan.gate === "ABORT") return "ABORT: refuse unsafe/destructive request and provide safe alternative.";
  if (plan.gate === "HOLD") return "HOLD: report exact missing access/info required.";
  if (plan.status === "INTAKE") return "PLAN: create concrete acceptance criteria and execution steps.";
  if (plan.status === "PLANNED") return "INSPECT: gather evidence before acting.";
  if (plan.status === "EXECUTED") return "VERIFY: test outputs against acceptance criteria.";
  if (plan.verified) return "REPORT: final verified report.";
  return "CONTINUE: reduce ambiguity and move toward verification.";
}

export const BOS_OMEGA_SYSTEM_PROMPT = `BOS-OMEGA LATTICE RUNTIME\nContinuous agentic cognitive runtime.\nRules: tri-state gate GO/HOLD/ABORT; do not claim success without verification; current evidence overrides stale memory; protect secrets; never ask the user to fix what the runtime can fix; inspect, execute, observe, verify, self-correct, then report truth labels.`;
