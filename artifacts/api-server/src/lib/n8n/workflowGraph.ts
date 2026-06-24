import { N8N_WORKFLOW_TASKS, type N8nWorkflowTask } from "./workflows";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type SideEffectLevel = "none" | "read" | "write" | "external" | "destructive";

export interface AutonomousWorkflowNode extends N8nWorkflowTask {
  intentKeywords: string[];
  requiredInputs: string[];
  optionalInputs: string[];
  outputKeys: string[];
  dependsOn: string[];
  riskLevel: RiskLevel;
  sideEffect: SideEffectLevel;
  maxRetries: number;
  timeoutSeconds: number;
  successSignals: string[];
  failureSignals: string[];
  llmDescription: string;
}

const CATEGORY_INPUTS: Record<string, string[]> = {
  repo: ["repoUrl", "objective"],
  github: ["repoUrl"],
  deploy: ["serviceName"],
  render: ["serviceName"],
  ui: ["targetUrl"],
  playwright: ["targetUrl"],
  discord: ["channelId", "message"],
  leads: ["lead"],
  crm: ["record"],
  sms: ["phone", "message"],
  email: ["email", "subject", "body"],
  calendar: ["datetime"],
  research: ["query"],
  web: ["query"],
  pricing: ["query"],
  vendors: ["query"],
  legal: ["content"],
  compliance: ["content"],
  pdf: ["topic"],
  slides: ["topic"],
  spreadsheet: ["topic"],
  game: ["spec"],
  unity: ["spec"],
  browser: ["url"],
  steel: ["url"],
  health: [],
  status: [],
  memory: ["query"],
  vault: [],
  secrets: ["payload"],
  "self-test": [],
};

const CATEGORY_OUTPUTS: Record<string, string[]> = {
  intake: ["normalizedGoal"],
  router: ["routeDecision"],
  discord: ["discordEvent"],
  bridge: ["bridgeStatus"],
  repo: ["patchSummary", "testEvidence"],
  build: ["buildEvidence"],
  test: ["testEvidence"],
  ui: ["uiEvidence"],
  playwright: ["playwrightEvidence"],
  render: ["healthEvidence"],
  deploy: ["deploymentEvidence"],
  github: ["githubEvidence"],
  security: ["securityFinding"],
  secrets: ["redactedPayload"],
  vault: ["vaultStatus"],
  memory: ["memoryContext"],
  rag: ["memoryContext"],
  sources: ["sourceEvidence"],
  truth: ["truthLedger"],
  research: ["researchFindings"],
  web: ["webFindings"],
  seo: ["seoAudit"],
  landing: ["pageArtifact"],
  legal: ["complianceReport"],
  compliance: ["complianceReport"],
  leads: ["leadRecord"],
  crm: ["crmRecordId"],
  sms: ["smsDraft"],
  email: ["emailDraft"],
  calendar: ["calendarEvent"],
  webhook: ["webhookResult"],
  retry: ["retryResult"],
  providers: ["providerStatus"],
  llm: ["modelStatus"],
  image: ["imageAsset"],
  instagram: ["socialResult"],
  social: ["socialAudit"],
  marketing: ["campaignPlan"],
  markets: ["marketBrief"],
  ai: ["aiNews"],
  news: ["newsFindings"],
  competitive: ["competitorChanges"],
  pricing: ["priceResearch"],
  vendors: ["vendorResearch"],
  docs: ["documentArtifact"],
  pdf: ["pdfArtifact"],
  slides: ["slideDeckArtifact"],
  spreadsheet: ["spreadsheetArtifact"],
  game: ["gameCode"],
  unity: ["unityCode"],
  relay: ["relayResult"],
  browser: ["browserEvidence"],
  steel: ["steelSession"],
  health: ["healthSnapshot"],
  status: ["healthSnapshot"],
  "self-test": ["selfTestEvidence"],
  errors: ["triageReport"],
  brief: ["briefing"],
  operator: ["operatorDecision"],
  command: ["operatorDecision"],
  continuity: ["continuityReport"],
  report: ["continuityReport"],
};

const WORKFLOW_DEPENDENCIES: Record<string, string[]> = {
  "n8n-004": ["n8n-011", "n8n-014"],
  "n8n-005": ["n8n-004"],
  "n8n-006": ["n8n-005"],
  "n8n-010": ["n8n-005", "n8n-007"],
  "n8n-018": ["n8n-015", "n8n-016"],
  "n8n-019": ["n8n-020", "n8n-018"],
  "n8n-021": ["n8n-020", "n8n-023"],
  "n8n-022": ["n8n-021"],
  "n8n-024": ["n8n-023", "n8n-022"],
  "n8n-025": ["n8n-022"],
  "n8n-027": ["n8n-021"],
  "n8n-028": ["n8n-029"],
  "n8n-033": ["n8n-035", "n8n-036"],
  "n8n-036": ["n8n-015"],
  "n8n-041": ["n8n-015", "n8n-016"],
  "n8n-042": ["n8n-015", "n8n-016"],
  "n8n-043": ["n8n-015"],
  "n8n-044": ["n8n-043"],
  "n8n-045": ["n8n-043"],
  "n8n-046": ["n8n-043"],
  "n8n-047": ["n8n-005"],
  "n8n-048": ["n8n-047"],
  "n8n-050": ["n8n-049"],
  "n8n-051": ["n8n-049"],
  "n8n-052": ["n8n-015"],
  "n8n-053": ["n8n-052"],
  "n8n-055": ["n8n-056"],
  "n8n-057": ["n8n-054"],
  "n8n-059": ["n8n-001", "n8n-013"],
  "n8n-060": ["n8n-013", "n8n-054"],
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function deriveRequiredInputs(task: N8nWorkflowTask): string[] {
  const inputs = new Set<string>(["objective"]);
  for (const tag of task.tags) for (const input of CATEGORY_INPUTS[tag] ?? []) inputs.add(input);
  if (task.trigger === "cron") inputs.delete("objective");
  if (task.id === "n8n-007") inputs.delete("serviceName");
  if (task.id === "n8n-001" || task.id === "n8n-059") inputs.add("objective");
  return Array.from(inputs);
}

function deriveOutputs(task: N8nWorkflowTask): string[] {
  const outputs = new Set<string>(["executionEvidence", "workflowResult"]);
  for (const tag of task.tags) for (const output of CATEGORY_OUTPUTS[tag] ?? []) outputs.add(output);
  return Array.from(outputs);
}

function deriveRisk(task: N8nWorkflowTask): RiskLevel {
  if (task.priority === "critical") return "critical";
  if (task.tags.some((tag) => ["security", "secrets", "sms", "email", "calendar", "crm", "discord", "deploy"].includes(tag))) return "high";
  if (task.trigger === "cron" || task.priority === "high") return "medium";
  return "low";
}

function deriveSideEffect(task: N8nWorkflowTask): SideEffectLevel {
  if (task.tags.some((tag) => ["sms", "email", "calendar", "crm", "instagram", "discord", "deploy", "github"].includes(tag))) return "external";
  if (task.tags.some((tag) => ["repo", "web", "landing", "docs", "pdf", "slides", "spreadsheet", "game", "unity"].includes(tag))) return "write";
  if (task.tags.some((tag) => ["research", "sources", "pricing", "vendors", "health", "status", "audit", "watch"].includes(tag))) return "read";
  return "none";
}

export function buildAutonomousWorkflowGraph(tasks = N8N_WORKFLOW_TASKS): AutonomousWorkflowNode[] {
  return tasks.map((task) => ({
    ...task,
    intentKeywords: unique([
      task.id,
      task.name,
      task.ownerAgent,
      ...task.tags,
      ...task.name.toLowerCase().split(/[^a-z0-9]+/),
      ...task.webhookPath.split(/[\/_-]+/),
    ].map((x) => x.toLowerCase()).filter((x) => x.length >= 3)),
    requiredInputs: deriveRequiredInputs(task),
    optionalInputs: ["channelId", "operatorId", "traceId", "dryRun", "maxDepth", "allowExternal", "idempotencyKey"],
    outputKeys: deriveOutputs(task),
    dependsOn: WORKFLOW_DEPENDENCIES[task.id] ?? [],
    riskLevel: deriveRisk(task),
    sideEffect: deriveSideEffect(task),
    maxRetries: task.priority === "critical" ? 3 : task.priority === "high" ? 2 : 1,
    timeoutSeconds: task.trigger === "cron" ? 120 : 60,
    successSignals: ["ok", "accepted", "queued", "verified", "result", "evidence"],
    failureSignals: ["error", "failed", "blocked", "timeout", "unauthorized", "missing"],
    llmDescription: `${task.name}: ${task.prompt} Inputs=${deriveRequiredInputs(task).join(",") || "none"}. Outputs=${deriveOutputs(task).join(",")}. Risk=${deriveRisk(task)}.`,
  }));
}

export const AUTONOMOUS_WORKFLOW_GRAPH: AutonomousWorkflowNode[] = buildAutonomousWorkflowGraph();

export function getWorkflowNode(idOrPath: string): AutonomousWorkflowNode | undefined {
  return AUTONOMOUS_WORKFLOW_GRAPH.find((task) => task.id === idOrPath || task.webhookPath === idOrPath || task.webhookPath.endsWith(`/${idOrPath}`));
}

export function validateAutonomousWorkflowGraph(nodes = AUTONOMOUS_WORKFLOW_GRAPH): string[] {
  const errors: string[] = [];
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    if (!node.intentKeywords.length) errors.push(`${node.id}: missing intent keywords`);
    if (!node.outputKeys.length) errors.push(`${node.id}: missing output keys`);
    if (!node.requiredInputs.includes("objective") && node.trigger !== "cron") errors.push(`${node.id}: webhook/manual task should require objective`);
    for (const dep of node.dependsOn) if (!ids.has(dep)) errors.push(`${node.id}: dependency ${dep} not found`);
    if (node.sideEffect === "external" && node.riskLevel === "low") errors.push(`${node.id}: external side effect cannot be low risk`);
  }
  return errors;
}
