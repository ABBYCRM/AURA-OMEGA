import { AUTONOMOUS_WORKFLOW_GRAPH, getWorkflowNode, type AutonomousWorkflowNode, type RiskLevel } from "./workflowGraph";

export type ToolIntentConfidence = "high" | "medium" | "low" | "none";

export interface ToolIntentVectorEntry {
  id: string;
  tool: string;
  category: string;
  description: string;
  triggerPhrases: string[];
  intentKeywords: string[];
  semanticExamples: string[];
  negativeExamples: string[];
  requiredInputs: string[];
  optionalInputs: string[];
  produces: string[];
  risk: RiskLevel;
  sideEffect: string;
  dependsOn: string[];
  callWhen: string[];
  doNotCallWhen: string[];
  inputHints: Record<string, string>;
  outputVerification: string[];
  domainTriggers: string[];
  exactInteractionProtocol: string[];
  payloadTemplate: Record<string, string>;
  chainBefore: string[];
  chainAfter: string[];
  executionMode: "autonomous" | "supervised" | "held";
  missingInputQuestion: string;
  llmDecisionChecklist: string[];
  llmInstructions: string[];
}

export interface ToolIntentCandidate {
  entry: ToolIntentVectorEntry;
  node: AutonomousWorkflowNode;
  score: number;
  confidence: ToolIntentConfidence;
  matchedSignals: string[];
  missingInputs: string[];
  blockedByNegativeSignal: boolean;
}

export interface ToolIntentSelection {
  objective: string;
  selected: ToolIntentCandidate | null;
  candidates: ToolIntentCandidate[];
  action: "dispatch" | "hold" | "abort";
  missingInputs: string[];
  reason: string;
  recommendedChain: string[];
  llmSystemHint: string;
}

const STOP = new Set([
  "the", "and", "for", "with", "into", "that", "this", "please", "make", "run", "task", "tasks", "workflow", "workflows",
  "system", "brain", "from", "have", "need", "want", "should", "would", "could", "then", "than", "about", "there", "their", "them",
]);

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  intake: ["intake", "capture request", "new request", "new goal", "incoming job", "normalize request", "route request"],
  router: ["route", "choose", "dispatch", "send to agent", "pick workflow", "select automation"],
  discord: ["discord", "server message", "channel", "bot message", "discord bridge", "discord event"],
  bridge: ["bridge", "relay", "sync messages", "connect ui", "connect discord"],
  ui: ["ui", "interface", "screen", "frontend", "dashboard", "button", "layout", "visual"],
  chat: ["chat", "message", "conversation", "operator prompt", "assistant response"],
  code: ["code", "source", "patch", "fix bug", "implement", "typescript", "javascript", "repo repair", "write code", "modify files", "refactor", "compile", "unit tests", "syntax error"],
  repo: ["repo", "repository", "github project", "branch", "commit", "pull request", "source tree"],
  build: ["build", "compile", "typecheck", "lint", "test suite", "ci", "failing build"],
  test: ["test", "verify", "unit test", "integration test", "smoke test", "regression"],
  playwright: ["playwright", "browser test", "ui smoke", "screenshot", "click through", "e2e"],
  render: ["render", "render.com", "service", "deployment", "health endpoint", "logs", "render logs", "render deploy", "render yaml", "service id"],
  deploy: ["deploy", "deployment", "production", "release", "ship", "health check", "fly.io", "vps", "server", "ssh", "docker", "pm2", "nginx", "cloudflare"],
  github: ["github", "pull request", "issue", "ci", "workflow", "repo status", "branch", "commit", "merge", "push", "repo", "repository", "actions"],
  pr: ["pr", "pull request", "review pr", "merge request", "code review"],
  issues: ["issue", "bug report", "ticket", "github issue", "triage"],
  security: ["security", "safe", "guard", "permission", "auth", "vulnerability"],
  secrets: ["secret", "token", "api key", "password", "credential", "leak", "redact"],
  vault: ["vault", "memory store", "secrets store", "backup", "secure storage"],
  memory: ["memory", "remember", "recall", "context", "continuity", "lattice"],
  rag: ["rag", "retrieve", "context lookup", "knowledge base", "memory recall"],
  sources: ["source", "citation", "official source", "primary source", "tier one", "ground truth"],
  truth: ["truth", "verify claims", "fact check", "evidence", "grounding", "unknown"],
  research: ["research", "look up", "search", "find sources", "investigate", "compare sources"],
  web: ["web", "website", "online", "search online", "browser", "crawl", "current", "latest", "news", "google", "search the web", "look it up"],
  seo: ["seo", "search engine", "crawlability", "sitemap", "meta", "schema", "ranking"],
  landing: ["landing page", "sales page", "cta", "conversion page", "lead page"],
  legal: ["legal", "compliance", "disclaimer", "tcpa", "attorney", "intake"],
  compliance: ["compliance", "policy", "guardrails", "consent", "dnc", "privacy", "terms"],
  leads: ["lead", "prospect", "contact", "intake", "qualification", "disposition"],
  crm: ["crm", "record", "customer", "sync", "pipeline", "contact record", "lead record"],
  sms: ["sms", "text", "text message", "follow up text", "opt out", "phone message"],
  email: ["email", "inbox", "send email", "follow up email", "subject", "body"],
  calendar: ["calendar", "schedule", "callback", "appointment", "meeting", "tomorrow", "date"],
  webhook: ["webhook", "callback url", "retry webhook", "failed webhook", "idempotency"],
  retry: ["retry", "try again", "failed job", "queue", "backoff"],
  providers: ["provider", "vendor status", "api status", "service outage", "auth failure"],
  llm: ["llm", "model", "kimi", "openrouter", "nvidia", "model check", "endpoint"],
  image: ["image", "picture", "render", "visual asset", "generate image"],
  instagram: ["instagram", "ig", "post", "reel", "caption", "social post"],
  social: ["social", "social media", "post", "campaign", "content calendar"],
  marketing: ["marketing", "campaign", "ads", "funnel", "audience", "copy"],
  markets: ["markets", "stocks", "market recap", "finance", "equity"],
  ai: ["ai", "artificial intelligence", "model news", "agent", "llm"],
  news: ["news", "latest", "current events", "monitor", "watch"],
  competitive: ["competitor", "competitive", "monitor competitors", "changed pricing", "new feature"],
  pricing: ["pricing", "price", "cost", "rates", "quote", "how much"],
  vendors: ["vendor", "supplier", "wholesaler", "contact list", "provider list"],
  docs: ["doc", "document", "write document", "spec", "report"],
  pdf: ["pdf", "course", "export pdf", "document file", "pages"],
  slides: ["slides", "presentation", "deck", "pptx", "investor deck"],
  spreadsheet: ["spreadsheet", "excel", "csv", "table", "sheet"],
  game: ["game", "unity game", "mechanics", "player", "level", "animation"],
  unity: ["unity", "c#", "gameobject", "script", "animation", "scene"],
  relay: ["relay", "forward", "send between systems", "bridge event"],
  browser: ["browser", "open page", "navigate", "click", "scrape", "live browser"],
  steel: ["steel", "steel.dev", "browser session", "remote browser", "live view"],
  health: ["health", "status", "uptime", "heartbeat", "keep awake", "keep alive", "is it broken", "monitor", "autonomous loop"],
  status: ["status", "report", "check state", "current state", "monitor"],
  "self-test": ["self test", "agentic proof", "smoke test", "validate runtime", "proof test"],
  errors: ["error", "exception", "stack trace", "failed", "broken", "debug"],
  brief: ["brief", "summary", "daily report", "recap", "overnight"],
  operator: ["operator", "approval", "human decision", "manual approval", "gate"],
  command: ["command", "run command", "operator command", "execute command"],
  continuity: ["continuity", "lattice", "memory chain", "state persistence", "resume"],
  report: ["report", "final report", "evidence report", "status report"],
};

const INPUT_HINTS: Record<string, string> = {
  objective: "Natural-language goal or task the operator wants completed.",
  query: "Search or lookup query; include topic, entity, location, and date constraints when available.",
  repoUrl: "GitHub repository URL or owner/repo string.",
  targetUrl: "URL of the deployed page or local UI target to inspect.",
  serviceName: "Render/service/deployment name or URL.",
  channelId: "Discord/UI channel id where result should be posted.",
  message: "Inbound message text to normalize or relay.",
  lead: "Lead object or enough contact details to identify the lead.",
  record: "CRM record object or identifier.",
  phone: "E.164 phone number or normalized phone field.",
  email: "Email address or recipient field.",
  subject: "Email subject line.",
  body: "Email body content.",
  datetime: "Callback date/time with timezone if scheduling.",
  content: "Copy, document, or payload to review for compliance.",
  payload: "Raw payload to scan, redact, validate, or retry.",
  topic: "Artifact topic/specification.",
  spec: "Detailed build/specification text.",
  url: "Browser or external target URL.",
};

function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-/ ]+/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && !STOP.has(x));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function titleToPhrases(node: AutonomousWorkflowNode): string[] {
  const title = node.name.toLowerCase();
  const short = title.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return unique([
    short,
    `run ${short}`,
    `use ${short}`,
    `trigger ${short}`,
    `start ${short}`,
    `execute ${short}`,
    `queue ${short}`,
    `call ${short}`,
    `i need ${short}`,
    `please ${short}`,
  ]);
}

function deriveCategory(node: AutonomousWorkflowNode): string {
  if (node.tags.includes("crm") || node.tags.includes("leads")) return "crm";
  if (node.tags.includes("repo") || node.tags.includes("build") || node.tags.includes("github")) return "engineering";
  if (node.tags.includes("research") || node.tags.includes("sources") || node.tags.includes("web")) return "research";
  if (node.tags.includes("sms") || node.tags.includes("email") || node.tags.includes("calendar")) return "outreach";
  if (node.tags.includes("security") || node.tags.includes("secrets") || node.tags.includes("vault")) return "security";
  if (node.tags.includes("ui") || node.tags.includes("playwright") || node.tags.includes("browser")) return "browser-ui";
  if (node.tags.includes("docs") || node.tags.includes("pdf") || node.tags.includes("slides") || node.tags.includes("spreadsheet")) return "artifact";
  return node.tags[0] ?? "general";
}

function semanticExamples(node: AutonomousWorkflowNode): string[] {
  const tagPhrases = node.tags.flatMap((tag) => CATEGORY_SYNONYMS[tag] ?? []);
  const name = node.name.toLowerCase();
  return unique([
    `The operator asks to ${name}.`,
    `The request mentions ${node.tags.join(", ")} and needs an automation step.`,
    `The request requires ${node.outputKeys.slice(0, 3).join(", ") || "workflow evidence"}.`,
    ...tagPhrases.slice(0, 8).map((p) => `User intent: ${p}.`),
  ]);
}

function negativeExamples(node: AutonomousWorkflowNode): string[] {
  const common = [
    "User only wants general advice and no execution.",
    "User is asking a conceptual question with no workflow action.",
    "Required inputs are missing and cannot be inferred safely.",
  ];
  if (node.sideEffect === "external") common.push("User has not authorized external outreach, CRM writes, calendar creation, deployment, or Discord posting.");
  if (node.riskLevel === "critical") common.push("Operator approval is absent for a critical or compliance-sensitive workflow.");
  if (node.tags.includes("sms") || node.tags.includes("email")) common.push("Message recipient or opt-out/compliance context is missing.");
  if (node.tags.includes("legal")) common.push("User asks for legal advice, guarantees, or attorney-client representation claims.");
  return unique(common);
}

function callWhen(node: AutonomousWorkflowNode): string[] {
  return unique([
    `Call when the user's intent matches: ${node.name}.`,
    `Call when the desired output includes: ${node.outputKeys.join(", ")}.`,
    `Call after required inputs are present: ${node.requiredInputs.join(", ") || "none"}.`,
    ...node.tags.flatMap((tag) => (CATEGORY_SYNONYMS[tag] ?? []).slice(0, 2).map((p) => `Call when user says or means: ${p}.`)),
  ]).slice(0, 14);
}

function doNotCallWhen(node: AutonomousWorkflowNode): string[] {
  return negativeExamples(node);
}

function outputVerification(node: AutonomousWorkflowNode): string[] {
  return unique([
    "Workflow returns ok/accepted/queued/result/evidence or an explicit error.",
    "Every expected output key is present or explicitly marked unavailable.",
    "Failure state includes actionable reason, retryability, and missing inputs.",
    ...node.outputKeys.map((key) => `Verify output includes or explains missing ${key}.`),
  ]).slice(0, 12);
}

function llmInstructions(node: AutonomousWorkflowNode): string[] {
  return unique([
    `Prefer ${node.id} only when the request maps to ${node.name}.`,
    `Before calling, verify required inputs: ${node.requiredInputs.join(", ") || "none"}.`,
    `Risk=${node.riskLevel}; sideEffect=${node.sideEffect}; dependencies=${node.dependsOn.join(",") || "none"}.`,
    "If missing inputs exist, return HOLD with exact missing fields instead of guessing.",
    "If another workflow produces a missing input, plan that dependency first.",
    "After execution, verify outputs before claiming completion.",
  ]);
}

function domainTriggers(node: AutonomousWorkflowNode): string[] {
  const domains: string[] = [];
  if (node.tags.some((t) => ["code", "repo", "build", "test", "github", "pr", "issues"].includes(t))) {
    domains.push(
      "coding/repo repair: user asks to inspect, patch, refactor, build, test, push, open PR, review CI, or fix errors",
      "github interaction: user mentions repo, branch, commit, PR, issue, actions, workflow, merge, or source tree",
    );
  }
  if (node.tags.some((t) => ["render", "deploy", "health", "status", "providers", "llm"].includes(t))) {
    domains.push(
      "deployment/runtime: user mentions Render, VPS, Fly.io, server, service health, logs, environment variables, uptime, or failed deploy",
      "ops monitoring: user wants the system kept alive, checked periodically, or verified after deployment",
    );
  }
  if (node.tags.some((t) => ["research", "web", "sources", "truth", "pricing", "vendors", "news", "ai", "markets", "competitive"].includes(t))) {
    domains.push(
      "web/search/current knowledge: user asks for latest, current, research, source-grounded, pricing, vendor, news, or competitive information",
      "grounding: user asks to verify claims, cite sources, compare dates, or reject unknowns",
    );
  }
  if (node.tags.some((t) => ["browser", "steel", "playwright", "ui"].includes(t))) {
    domains.push(
      "browser/UI interaction: user wants page inspection, screenshots, clicks, browser automation, Playwright validation, or Steel live view",
    );
  }
  if (node.tags.some((t) => ["discord", "bridge", "relay"].includes(t))) {
    domains.push("Discord/UI bridge: user wants Discord input/output, message relay, dedupe, channel context, or bot wiring");
  }
  if (node.tags.some((t) => ["leads", "crm", "sms", "email", "calendar", "legal", "compliance"].includes(t))) {
    domains.push("CRM/outreach/compliance: user wants lead intake, qualification, CRM writes, SMS/email/calendar follow-up, DNC, TCPA, or legal-intake compliance");
  }
  if (node.tags.some((t) => ["docs", "pdf", "slides", "spreadsheet", "game", "unity"].includes(t))) {
    domains.push("artifact/build generation: user wants a document, PDF, slide deck, spreadsheet, Unity code, game code, or downloadable build artifact");
  }
  return unique(domains.length ? domains : [`general automation domain for ${node.name}`]);
}

function payloadTemplate(node: AutonomousWorkflowNode): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const input of node.requiredInputs) entries[input] = INPUT_HINTS[input] ?? `Required input for ${node.name}: ${input}`;
  for (const input of node.optionalInputs.slice(0, 10)) entries[input] = INPUT_HINTS[input] ?? `Optional execution control field: ${input}`;
  entries.operatorApproved = "Boolean. Required true for external side effects, high/critical risk, deployment, outreach, CRM writes, Discord sends, or destructive operations.";
  entries.dryRun = "Boolean. Use true when the LLM is planning or validating without executing.";
  entries.traceId = "String id used to correlate UI/Discord/n8n execution evidence.";
  return entries;
}

function exactInteractionProtocol(node: AutonomousWorkflowNode): string[] {
  return unique([
    `1. Select ${node.id} only after objective intent matches one of triggerPhrases/domainTriggers and no doNotCallWhen rule applies.`,
    `2. Build payload using requiredInputs exactly: ${node.requiredInputs.join(", ") || "none"}. Use payloadTemplate field descriptions; do not invent unknown values.`,
    `3. Resolve dependencies before this tool: ${node.dependsOn.length ? node.dependsOn.join(" -> ") : "none"}. If a dependency produces a missing input, schedule dependency first.`,
    `4. Apply risk gate: risk=${node.riskLevel}, sideEffect=${node.sideEffect}. Require operatorApproved=true for external, high, critical, deployment, outreach, CRM write, or Discord send workflows.`,
    `5. Dispatch through POST /api/n8n/dispatch/${node.id} or POST ${node.webhookPath}; prefer dryRun=true until required inputs and policy pass.`,
    `6. On accepted/queued result, record outcome memory with workflowId=${node.id}, objective, status PARTIAL, and evidence id/task id.`,
    `7. Verify outputs: ${node.outputKeys.join(", ")}. If output is missing, mark PARTIAL/BLOCKED with exact reason; never claim DONE from queued alone.`,
    `8. If failure is retryable, retry at most ${node.maxRetries} time(s) with one changed variable per retry; then escalate with evidence.`,
  ]);
}

function llmDecisionChecklist(node: AutonomousWorkflowNode): string[] {
  return unique([
    "Does the objective require an action, not just advice?",
    `Is ${node.name} the smallest correct workflow for the desired output?`,
    `Are all required inputs present: ${node.requiredInputs.join(", ") || "none"}?`,
    "Can a dependency in the workflow graph produce a missing input?",
    "Is this a current/web/search/GitHub/Render/VPS/coding/browser/CRM/outreach/artifact request and mapped to the correct domain?",
    "Does risk/sideEffect require operatorApproved=true?",
    "Is dryRun appropriate before execution?",
    "What output proves success, and what output proves failure?",
  ]);
}

function executionMode(node: AutonomousWorkflowNode): "autonomous" | "supervised" | "held" {
  if (node.riskLevel === "critical" || node.sideEffect === "external" || node.sideEffect === "destructive") return "supervised";
  if (!node.enabled) return "held";
  return "autonomous";
}

function missingInputQuestion(node: AutonomousWorkflowNode): string {
  if (!node.requiredInputs.length) return "No missing fields are required for this workflow.";
  return `HOLD until these exact fields are supplied for ${node.id} ${node.name}: ${node.requiredInputs.join(", ")}. Ask only for missing fields; do not ask for fields already present.`;
}

function buildEntry(node: AutonomousWorkflowNode): ToolIntentVectorEntry {
  const tagSynonyms = node.tags.flatMap((tag) => CATEGORY_SYNONYMS[tag] ?? []);
  const triggerPhrases = unique([
    ...titleToPhrases(node),
    ...tagSynonyms,
    node.webhookPath.split("/").pop()?.replace(/-/g, " ") ?? "",
    node.id,
  ]).slice(0, 28);
  const intentKeywords = unique([
    ...node.intentKeywords,
    ...node.tags,
    ...splitWords(node.prompt),
    ...tagSynonyms.flatMap(splitWords),
    ...node.outputKeys.flatMap(splitWords),
  ]).slice(0, 80);
  return {
    id: node.id,
    tool: `n8n.${deriveCategory(node)}.${node.id}`,
    category: deriveCategory(node),
    description: node.llmDescription,
    triggerPhrases,
    intentKeywords,
    semanticExamples: semanticExamples(node),
    negativeExamples: negativeExamples(node),
    requiredInputs: node.requiredInputs,
    optionalInputs: node.optionalInputs,
    produces: node.outputKeys,
    risk: node.riskLevel,
    sideEffect: node.sideEffect,
    dependsOn: node.dependsOn,
    callWhen: callWhen(node),
    doNotCallWhen: doNotCallWhen(node),
    inputHints: Object.fromEntries(node.requiredInputs.map((input) => [input, INPUT_HINTS[input] ?? `Required input: ${input}.`])),
    outputVerification: outputVerification(node),
    domainTriggers: domainTriggers(node),
    exactInteractionProtocol: exactInteractionProtocol(node),
    payloadTemplate: payloadTemplate(node),
    chainBefore: node.dependsOn,
    chainAfter: AUTONOMOUS_WORKFLOW_GRAPH.filter((candidate) => candidate.dependsOn.includes(node.id)).map((candidate) => candidate.id),
    executionMode: executionMode(node),
    missingInputQuestion: missingInputQuestion(node),
    llmDecisionChecklist: llmDecisionChecklist(node),
    llmInstructions: llmInstructions(node),
  };
}

export const TOOL_INTENT_VECTOR_REGISTRY: ToolIntentVectorEntry[] = AUTONOMOUS_WORKFLOW_GRAPH.map(buildEntry);

export function getToolIntentEntry(id: string): ToolIntentVectorEntry | undefined {
  return TOOL_INTENT_VECTOR_REGISTRY.find((entry) => entry.id === id || entry.tool === id);
}

function phraseScore(objective: string, phrase: string): number {
  const lower = objective.toLowerCase();
  const p = phrase.toLowerCase();
  if (!p) return 0;
  if (lower === p) return 60;
  if (lower.includes(p)) return Math.min(45, 16 + p.split(/\s+/).length * 4);
  const a = new Set(splitWords(lower));
  const b = new Set(splitWords(p));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  const jaccard = intersection / union;
  return jaccard >= 0.25 ? Math.round(jaccard * 24) : 0;
}

function payloadHas(payload: Record<string, unknown>, key: string): boolean {
  if (key === "objective") return true;
  const value = payload[key];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function riskPenalty(entry: ToolIntentVectorEntry): number {
  if (entry.risk === "critical") return 10;
  if (entry.risk === "high") return 6;
  if (entry.risk === "medium") return 3;
  return 0;
}

function confidenceFromScore(score: number): ToolIntentConfidence {
  if (score >= 75) return "high";
  if (score >= 38) return "medium";
  if (score > 0) return "low";
  return "none";
}

export function scoreToolIntent(entry: ToolIntentVectorEntry, objective: string, payload: Record<string, unknown> = {}): ToolIntentCandidate {
  const node = getWorkflowNode(entry.id);
  if (!node) throw new Error(`Tool intent entry ${entry.id} has no workflow node.`);
  const lower = objective.toLowerCase();
  const matchedSignals: string[] = [];
  let score = 0;

  if (lower.includes(entry.id.toLowerCase())) { score += 140; matchedSignals.push(`explicit-id:${entry.id}`); }
  if (lower.includes(entry.tool.toLowerCase())) { score += 120; matchedSignals.push(`explicit-tool:${entry.tool}`); }

  for (const phrase of entry.triggerPhrases) {
    const s = phraseScore(objective, phrase);
    if (s > 0) { score += s; matchedSignals.push(`phrase:${phrase}`); }
  }
  for (const example of entry.semanticExamples) {
    const s = phraseScore(objective, example);
    if (s > 0) { score += Math.floor(s * 0.8); matchedSignals.push(`semantic:${example}`); }
  }
  const objectiveTokens = new Set(splitWords(objective));
  for (const keyword of entry.intentKeywords) {
    if (objectiveTokens.has(keyword.toLowerCase()) || lower.includes(keyword.toLowerCase())) {
      score += 8;
      matchedSignals.push(`keyword:${keyword}`);
    }
  }

  const missingInputs = entry.requiredInputs.filter((input) => !payloadHas(payload, input));
  const presentInputs = entry.requiredInputs.length - missingInputs.length;
  score += presentInputs * 8;
  if (entry.requiredInputs.length && missingInputs.length === 0) score += 15;
  score -= missingInputs.length * 7;
  score -= riskPenalty(entry);

  let blockedByNegativeSignal = false;
  for (const negative of entry.negativeExamples) {
    const s = phraseScore(objective, negative);
    if (s >= 18) {
      blockedByNegativeSignal = true;
      score -= 30;
      matchedSignals.push(`negative:${negative}`);
    }
  }

  score = Math.max(0, Math.round(score));
  return {
    entry,
    node,
    score,
    confidence: confidenceFromScore(score),
    matchedSignals: unique(matchedSignals).slice(0, 30),
    missingInputs,
    blockedByNegativeSignal,
  };
}

export function selectToolIntent(objective: string, payload: Record<string, unknown> = {}): ToolIntentSelection {
  const normalized = objective.trim();
  if (!normalized) {
    return {
      objective,
      selected: null,
      candidates: [],
      action: "hold",
      missingInputs: ["objective"],
      reason: "No objective provided.",
      recommendedChain: [],
      llmSystemHint: "Ask for the objective. Do not call n8n.",
    };
  }

  const candidates = TOOL_INTENT_VECTOR_REGISTRY
    .map((entry) => scoreToolIntent(entry, normalized, payload))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const selected = candidates[0] ?? null;
  if (!selected) {
    return {
      objective,
      selected: null,
      candidates: [],
      action: "hold",
      missingInputs: [],
      reason: "No tool intent matched strongly enough.",
      recommendedChain: [],
      llmSystemHint: "No n8n tool should be called. Ask for more specific objective or pick manually by task id.",
    };
  }

  const dependencyChain = [...selected.node.dependsOn, selected.node.id];
  const action = selected.blockedByNegativeSignal || selected.confidence === "low" || selected.missingInputs.length > 0 ? "hold" : "dispatch";
  return {
    objective,
    selected,
    candidates,
    action,
    missingInputs: selected.missingInputs,
    reason: action === "dispatch"
      ? `Selected ${selected.entry.id} / ${selected.entry.tool} using ${selected.matchedSignals.slice(0, 8).join(", ")}.`
      : `Hold: selected=${selected.entry.id}; confidence=${selected.confidence}; missingInputs=${selected.missingInputs.join(",") || "none"}; negative=${selected.blockedByNegativeSignal}.`,
    recommendedChain: dependencyChain,
    llmSystemHint: [
      `Best tool: ${selected.entry.tool}`,
      `Call only if action=dispatch and required inputs are satisfied.`,
      `Required inputs: ${selected.entry.requiredInputs.join(",") || "none"}.`,
      `Expected outputs: ${selected.entry.produces.join(",")}.`,
      `Verification: ${selected.entry.outputVerification.slice(0, 3).join(" | ")}.`,
    ].join(" "),
  };
}

export function validateToolIntentVectorRegistry(entries = TOOL_INTENT_VECTOR_REGISTRY): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push(`${entry.id}: duplicate id`);
    ids.add(entry.id);
    if (!getWorkflowNode(entry.id)) errors.push(`${entry.id}: no matching workflow node`);
    if (entry.triggerPhrases.length < 8) errors.push(`${entry.id}: expected at least 8 trigger phrases`);
    if (entry.intentKeywords.length < 8) errors.push(`${entry.id}: expected at least 8 intent keywords`);
    if (entry.semanticExamples.length < 3) errors.push(`${entry.id}: expected at least 3 semantic examples`);
    if (entry.callWhen.length < 3) errors.push(`${entry.id}: expected at least 3 callWhen rules`);
    if (entry.doNotCallWhen.length < 3) errors.push(`${entry.id}: expected at least 3 doNotCallWhen rules`);
    if (entry.outputVerification.length < 3) errors.push(`${entry.id}: expected at least 3 output verification rules`);
    if (entry.domainTriggers.length < 1) errors.push(`${entry.id}: expected at least 1 domain trigger`);
    if (entry.exactInteractionProtocol.length < 6) errors.push(`${entry.id}: expected granular interaction protocol`);
    if (entry.llmDecisionChecklist.length < 6) errors.push(`${entry.id}: expected LLM decision checklist`);
  }
  return errors;
}
