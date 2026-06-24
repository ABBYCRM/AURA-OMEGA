export type N8nTrigger = "webhook" | "cron" | "manual";
export type N8nAgent = "ABBY" | "FORGE" | "CRAWLER" | "VAULT" | "WIRE" | "MR.NICE";

export interface N8nWorkflowTask {
  id: string;
  name: string;
  trigger: N8nTrigger;
  schedule?: string;
  webhookPath: string;
  ownerAgent: N8nAgent;
  enabled: boolean;
  priority: "low" | "normal" | "high" | "critical";
  prompt: string;
  tags: string[];
}

const everyHours = (h: number) => `0 */${h} * * *`;
const dailyAt = (hour: number) => `0 ${hour} * * *`;

export const N8N_WORKFLOW_TASKS: N8nWorkflowTask[] = [
  { id: "n8n-001", name: "Inbound Goal Intake", trigger: "webhook", webhookPath: "/webhook/aura-omega/goal-intake", ownerAgent: "ABBY", enabled: true, priority: "critical", tags: ["intake", "router"], prompt: "Accept an external n8n goal, apply BOS-OMEGA tri-state gate, create a task, and route to the correct AURA." },
  { id: "n8n-002", name: "Discord Bridge Intake", trigger: "webhook", webhookPath: "/webhook/aura-omega/discord-intake", ownerAgent: "ABBY", enabled: true, priority: "critical", tags: ["discord", "bridge"], prompt: "Normalize Discord input, dedupe message ids, preserve channel context, and dispatch through BOS-OMEGA." },
  { id: "n8n-003", name: "AURA UI Intake", trigger: "webhook", webhookPath: "/webhook/aura-omega/aura-ui-intake", ownerAgent: "ABBY", enabled: true, priority: "high", tags: ["ui", "chat"], prompt: "Accept UI chat requests, add operator context, and route through BOS-OMEGA brain plan." },
  { id: "n8n-004", name: "Repo Repair Runner", trigger: "webhook", webhookPath: "/webhook/aura-omega/repo-repair", ownerAgent: "FORGE", enabled: true, priority: "critical", tags: ["code", "repo"], prompt: "Inspect repo, branch from latest main, patch, test, build, and report evidence without fabricating success." },
  { id: "n8n-005", name: "Build Verification", trigger: "webhook", webhookPath: "/webhook/aura-omega/build-verify", ownerAgent: "FORGE", enabled: true, priority: "high", tags: ["build", "test"], prompt: "Run typecheck, tests, build, collect logs, and return PASS/PARTIAL/BLOCKED with evidence." },
  { id: "n8n-006", name: "Playwright UI Smoke", trigger: "webhook", webhookPath: "/webhook/aura-omega/playwright-smoke", ownerAgent: "FORGE", enabled: true, priority: "high", tags: ["ui", "playwright"], prompt: "Open the UI, validate navigation and critical interactions, capture screenshots or failure logs." },
  { id: "n8n-007", name: "Render Health Check", trigger: "cron", schedule: everyHours(1), webhookPath: "/webhook/aura-omega/render-health", ownerAgent: "WIRE", enabled: true, priority: "high", tags: ["render", "health"], prompt: "Check Render service health endpoints and logs, then notify only on failure or meaningful change." },
  { id: "n8n-008", name: "GitHub PR Watch", trigger: "cron", schedule: everyHours(2), webhookPath: "/webhook/aura-omega/github-pr-watch", ownerAgent: "FORGE", enabled: true, priority: "normal", tags: ["github", "pr"], prompt: "Review open PRs, CI status, merge conflicts, and required actions." },
  { id: "n8n-009", name: "GitHub Issue Watch", trigger: "cron", schedule: everyHours(6), webhookPath: "/webhook/aura-omega/github-issue-watch", ownerAgent: "FORGE", enabled: true, priority: "normal", tags: ["github", "issues"], prompt: "Summarize new issues, classify severity, and propose next engineering actions." },
  { id: "n8n-010", name: "Deployment Evidence Collector", trigger: "webhook", webhookPath: "/webhook/aura-omega/deploy-evidence", ownerAgent: "WIRE", enabled: true, priority: "high", tags: ["deploy", "evidence"], prompt: "Collect commit hash, deploy URL, build logs, health check, and final status." },
  { id: "n8n-011", name: "Secrets Leak Guard", trigger: "webhook", webhookPath: "/webhook/aura-omega/secrets-guard", ownerAgent: "VAULT", enabled: true, priority: "critical", tags: ["security", "secrets"], prompt: "Scan payload for raw secrets, mask, reject unsafe echoing, and tell operator to rotate leaked keys." },
  { id: "n8n-012", name: "Vault Backup", trigger: "cron", schedule: dailyAt(3), webhookPath: "/webhook/aura-omega/vault-backup", ownerAgent: "VAULT", enabled: true, priority: "high", tags: ["vault", "backup"], prompt: "Verify vault metadata integrity and produce a backup status report without exposing secret values." },
  { id: "n8n-013", name: "Memory Continuity Save", trigger: "cron", schedule: everyHours(4), webhookPath: "/webhook/aura-omega/memory-save", ownerAgent: "VAULT", enabled: true, priority: "high", tags: ["memory", "continuity"], prompt: "Persist important state, dedupe memory, and verify no stale/fabricated claims are promoted." },
  { id: "n8n-014", name: "Memory Recall", trigger: "webhook", webhookPath: "/webhook/aura-omega/memory-recall", ownerAgent: "VAULT", enabled: true, priority: "normal", tags: ["memory", "rag"], prompt: "Retrieve relevant memory with current evidence priority and return cited context to the requesting AURA." },
  { id: "n8n-015", name: "Source Grounding", trigger: "webhook", webhookPath: "/webhook/aura-omega/source-grounding", ownerAgent: "CRAWLER", enabled: true, priority: "high", tags: ["sources", "truth"], prompt: "Check factual claims against primary or tier-one sources and label each claim VERIFIED, INFERRED, UNKNOWN, or FAILED." },
  { id: "n8n-016", name: "Web Research Runner", trigger: "webhook", webhookPath: "/webhook/aura-omega/web-research", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["research", "web"], prompt: "Perform broad search, open relevant sources, compare dates, and return grounded findings." },
  { id: "n8n-017", name: "Tier One Source Lookup", trigger: "webhook", webhookPath: "/webhook/aura-omega/tier-one-source", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["sources"], prompt: "Find official or tier-one source URLs for a topic and reject low-quality aggregator claims." },
  { id: "n8n-018", name: "Website SEO Audit", trigger: "webhook", webhookPath: "/webhook/aura-omega/seo-audit", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["seo", "web"], prompt: "Audit crawlability, titles, meta descriptions, internal links, robots, sitemap, schema, and AI crawler readiness." },
  { id: "n8n-019", name: "Landing Page Builder", trigger: "webhook", webhookPath: "/webhook/aura-omega/landing-page-builder", ownerAgent: "FORGE", enabled: true, priority: "high", tags: ["web", "landing"], prompt: "Build or patch a compliant landing page with strong CTA, mobile UX, SEO, and no legal overclaiming." },
  { id: "n8n-020", name: "Legal Intake Compliance", trigger: "webhook", webhookPath: "/webhook/aura-omega/legal-intake-compliance", ownerAgent: "ABBY", enabled: true, priority: "critical", tags: ["legal", "compliance"], prompt: "Review intake copy for non-attorney disclaimers, no guarantees, TCPA consent, privacy, and independent attorney language." },
  { id: "n8n-021", name: "Lead Intake Router", trigger: "webhook", webhookPath: "/webhook/aura-omega/lead-intake-router", ownerAgent: "WIRE", enabled: true, priority: "critical", tags: ["leads", "crm"], prompt: "Normalize lead payload, classify disposition, create CRM handoff, and preserve consent evidence." },
  { id: "n8n-022", name: "Lead Qualification", trigger: "webhook", webhookPath: "/webhook/aura-omega/lead-qualification", ownerAgent: "ABBY", enabled: true, priority: "high", tags: ["leads"], prompt: "Qualify lead against configured criteria and return disposition without legal advice or guarantees." },
  { id: "n8n-023", name: "DNC Guard", trigger: "webhook", webhookPath: "/webhook/aura-omega/dnc-guard", ownerAgent: "WIRE", enabled: true, priority: "critical", tags: ["sms", "compliance"], prompt: "Detect do-not-contact requests, suppress outreach, and log compliance status." },
  { id: "n8n-024", name: "SMS Follow Up", trigger: "webhook", webhookPath: "/webhook/aura-omega/sms-followup", ownerAgent: "MR.NICE", enabled: true, priority: "normal", tags: ["sms", "followup"], prompt: "Draft compliant SMS follow-up with clear identity, opt-out language, and one CTA." },
  { id: "n8n-025", name: "Email Follow Up", trigger: "webhook", webhookPath: "/webhook/aura-omega/email-followup", ownerAgent: "MR.NICE", enabled: true, priority: "normal", tags: ["email", "followup"], prompt: "Draft concise compliant email follow-up with user-specific context and next step." },
  { id: "n8n-026", name: "Calendar Callback", trigger: "webhook", webhookPath: "/webhook/aura-omega/calendar-callback", ownerAgent: "WIRE", enabled: true, priority: "normal", tags: ["calendar", "callback"], prompt: "Create callback task/event when authorized, otherwise return exact missing scheduling details." },
  { id: "n8n-027", name: "CRM Sync", trigger: "webhook", webhookPath: "/webhook/aura-omega/crm-sync", ownerAgent: "WIRE", enabled: true, priority: "high", tags: ["crm", "sync"], prompt: "Sync normalized lead/customer payload to CRM and return record id or precise failure." },
  { id: "n8n-028", name: "Webhook Retry Queue", trigger: "cron", schedule: "*/30 * * * *", webhookPath: "/webhook/aura-omega/webhook-retry", ownerAgent: "WIRE", enabled: true, priority: "high", tags: ["webhook", "retry"], prompt: "Retry failed outbound webhooks with idempotency and stop after configured attempts." },
  { id: "n8n-029", name: "Provider Status Check", trigger: "cron", schedule: everyHours(1), webhookPath: "/webhook/aura-omega/provider-status", ownerAgent: "WIRE", enabled: true, priority: "normal", tags: ["providers"], prompt: "Check configured provider status and notify on outage or auth failure." },
  { id: "n8n-030", name: "OpenRouter Model Check", trigger: "cron", schedule: everyHours(6), webhookPath: "/webhook/aura-omega/openrouter-model-check", ownerAgent: "WIRE", enabled: true, priority: "normal", tags: ["llm", "models"], prompt: "Verify configured model availability and flag auth/model endpoint errors." },
  { id: "n8n-031", name: "NVIDIA Model Check", trigger: "cron", schedule: everyHours(6), webhookPath: "/webhook/aura-omega/nvidia-model-check", ownerAgent: "WIRE", enabled: true, priority: "normal", tags: ["llm", "nvidia"], prompt: "Verify NVIDIA model endpoint configuration and classify auth/model errors precisely." },
  { id: "n8n-032", name: "Image Provider Check", trigger: "cron", schedule: dailyAt(4), webhookPath: "/webhook/aura-omega/image-provider-check", ownerAgent: "WIRE", enabled: true, priority: "normal", tags: ["image", "providers"], prompt: "Verify configured image generation providers, cost tier, and 1080p capability if available." },
  { id: "n8n-033", name: "Instagram Content Queue", trigger: "cron", schedule: everyHours(3), webhookPath: "/webhook/aura-omega/instagram-content-queue", ownerAgent: "MR.NICE", enabled: true, priority: "normal", tags: ["instagram", "content"], prompt: "Generate or publish approved Instagram content using the marketing playbook, one CTA, and platform-safe copy." },
  { id: "n8n-034", name: "Instagram Comment Watch", trigger: "cron", schedule: everyHours(2), webhookPath: "/webhook/aura-omega/instagram-comment-watch", ownerAgent: "MR.NICE", enabled: true, priority: "normal", tags: ["instagram", "comments"], prompt: "Review comments/DM signals through authorized APIs and surface replies needing attention." },
  { id: "n8n-035", name: "Social Account Audit", trigger: "cron", schedule: dailyAt(5), webhookPath: "/webhook/aura-omega/social-account-audit", ownerAgent: "MR.NICE", enabled: true, priority: "normal", tags: ["social", "audit"], prompt: "Audit connected social accounts, token status, posting limits, and recent errors." },
  { id: "n8n-036", name: "Marketing Playbook", trigger: "webhook", webhookPath: "/webhook/aura-omega/marketing-playbook", ownerAgent: "MR.NICE", enabled: true, priority: "normal", tags: ["marketing"], prompt: "Build campaign assets with hook, problem, insight, value, CTA, follow-up, compliance, and KPI tracking." },
  { id: "n8n-037", name: "Daily Market Brief", trigger: "cron", schedule: dailyAt(8), webhookPath: "/webhook/aura-omega/daily-market-brief", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["markets", "brief"], prompt: "Prepare a source-grounded market brief with what moved, why, and what to watch." },
  { id: "n8n-038", name: "AI News Watch", trigger: "cron", schedule: everyHours(2), webhookPath: "/webhook/aura-omega/ai-news-watch", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["ai", "news"], prompt: "Monitor AI news and return only meaningful, source-grounded developments." },
  { id: "n8n-039", name: "Legal News Watch", trigger: "cron", schedule: everyHours(6), webhookPath: "/webhook/aura-omega/legal-news-watch", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["legal", "news"], prompt: "Monitor legal/intake-related news and return source-grounded changes that may affect campaigns." },
  { id: "n8n-040", name: "Competitor Watch", trigger: "cron", schedule: dailyAt(6), webhookPath: "/webhook/aura-omega/competitor-watch", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["competitive"], prompt: "Check competitor sites/ads/content and summarize material changes with evidence." },
  { id: "n8n-041", name: "Price Research", trigger: "webhook", webhookPath: "/webhook/aura-omega/price-research", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["pricing"], prompt: "Research current prices from reliable sources and return citations or UNKNOWN where unavailable." },
  { id: "n8n-042", name: "Vendor Research", trigger: "webhook", webhookPath: "/webhook/aura-omega/vendor-research", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["vendors"], prompt: "Find vendor URLs, contact paths, pricing evidence, and reliability notes without guessing." },
  { id: "n8n-043", name: "Document Generator", trigger: "webhook", webhookPath: "/webhook/aura-omega/document-generator", ownerAgent: "FORGE", enabled: true, priority: "normal", tags: ["docs"], prompt: "Generate requested document artifact from grounded content and verify file creation." },
  { id: "n8n-044", name: "PDF Course Builder", trigger: "webhook", webhookPath: "/webhook/aura-omega/pdf-course-builder", ownerAgent: "FORGE", enabled: true, priority: "normal", tags: ["pdf", "course"], prompt: "Build a detailed PDF course artifact with clear page structure and visual guidance." },
  { id: "n8n-045", name: "Slide Deck Builder", trigger: "webhook", webhookPath: "/webhook/aura-omega/slide-deck-builder", ownerAgent: "FORGE", enabled: true, priority: "normal", tags: ["slides"], prompt: "Build a polished slide deck artifact with titles, visuals, speaker notes, and export verification." },
  { id: "n8n-046", name: "Spreadsheet Builder", trigger: "webhook", webhookPath: "/webhook/aura-omega/spreadsheet-builder", ownerAgent: "FORGE", enabled: true, priority: "normal", tags: ["spreadsheet"], prompt: "Build a styled spreadsheet with formulas, validation, and artifact verification." },
  { id: "n8n-047", name: "Game Code Builder", trigger: "webhook", webhookPath: "/webhook/aura-omega/game-code-builder", ownerAgent: "FORGE", enabled: true, priority: "normal", tags: ["game", "unity"], prompt: "Generate complete game code with setup instructions, assets strategy, and compile/runtime validation notes." },
  { id: "n8n-048", name: "Unity CSharp Builder", trigger: "webhook", webhookPath: "/webhook/aura-omega/unity-csharp-builder", ownerAgent: "FORGE", enabled: true, priority: "normal", tags: ["unity", "csharp"], prompt: "Write Unity C# scripts with component setup, animation hooks, and validation checklist." },
  { id: "n8n-049", name: "Discord Bot Guard", trigger: "webhook", webhookPath: "/webhook/aura-omega/discord-bot-guard", ownerAgent: "WIRE", enabled: true, priority: "critical", tags: ["discord", "security"], prompt: "Validate Discord bot wiring without exposing tokens; flag leaked tokens for rotation." },
  { id: "n8n-050", name: "Discord Relay Send", trigger: "webhook", webhookPath: "/webhook/aura-omega/discord-relay-send", ownerAgent: "WIRE", enabled: true, priority: "high", tags: ["discord", "relay"], prompt: "Send approved bridge response to Discord with channel/thread metadata and idempotency key." },
  { id: "n8n-051", name: "Discord Relay Receive", trigger: "webhook", webhookPath: "/webhook/aura-omega/discord-relay-receive", ownerAgent: "WIRE", enabled: true, priority: "high", tags: ["discord", "relay"], prompt: "Receive Discord event, dedupe, normalize author/channel/thread, and dispatch to BOS-OMEGA." },
  { id: "n8n-052", name: "Browser Automation Runner", trigger: "webhook", webhookPath: "/webhook/aura-omega/browser-automation", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["browser", "automation"], prompt: "Run authorized browser automation, pause for captcha/login, and report evidence." },
  { id: "n8n-053", name: "Steel Browser Session", trigger: "webhook", webhookPath: "/webhook/aura-omega/steel-session", ownerAgent: "CRAWLER", enabled: true, priority: "normal", tags: ["steel", "browser"], prompt: "Create or use a Steel browser session for authorized browsing and return live-view/status details." },
  { id: "n8n-054", name: "Health Snapshot", trigger: "cron", schedule: "*/30 * * * *", webhookPath: "/webhook/aura-omega/health-snapshot", ownerAgent: "ABBY", enabled: true, priority: "normal", tags: ["health", "status"], prompt: "Snapshot agents, tasks, cron jobs, providers, memory, and recent errors." },
  { id: "n8n-055", name: "Agentic Proof Test", trigger: "cron", schedule: dailyAt(2), webhookPath: "/webhook/aura-omega/agentic-proof", ownerAgent: "ABBY", enabled: true, priority: "high", tags: ["self-test"], prompt: "Run agentic proof self-test and return hash, routes tested, and pass/fail evidence." },
  { id: "n8n-056", name: "Self Test Workflow", trigger: "cron", schedule: dailyAt(1), webhookPath: "/webhook/aura-omega/self-test", ownerAgent: "ABBY", enabled: true, priority: "high", tags: ["self-test"], prompt: "Run API self-checks, database access checks, and basic route validation." },
  { id: "n8n-057", name: "Error Triage", trigger: "webhook", webhookPath: "/webhook/aura-omega/error-triage", ownerAgent: "ABBY", enabled: true, priority: "high", tags: ["errors"], prompt: "Classify error logs, identify root cause, assign owner AURA, and propose exact repair." },
  { id: "n8n-058", name: "Operator Daily Brief", trigger: "cron", schedule: dailyAt(9), webhookPath: "/webhook/aura-omega/operator-daily-brief", ownerAgent: "ABBY", enabled: true, priority: "normal", tags: ["brief"], prompt: "Summarize what changed overnight: tasks, deployments, errors, leads, social, and next actions." },
  { id: "n8n-059", name: "Operator Command Router", trigger: "webhook", webhookPath: "/webhook/aura-omega/operator-command", ownerAgent: "ABBY", enabled: true, priority: "critical", tags: ["operator", "command"], prompt: "Route direct operator commands through BOS-OMEGA with standing coding/deployment doctrine." },
  { id: "n8n-060", name: "Continuity Report", trigger: "cron", schedule: dailyAt(23), webhookPath: "/webhook/aura-omega/continuity-report", ownerAgent: "VAULT", enabled: true, priority: "normal", tags: ["continuity", "report"], prompt: "Produce daily continuity report with verified memory changes, unresolved blockers, and active automations." },
];

export function getN8nWorkflowTask(idOrPath: string): N8nWorkflowTask | undefined {
  return N8N_WORKFLOW_TASKS.find((task) => task.id === idOrPath || task.webhookPath === idOrPath || task.webhookPath.endsWith(`/${idOrPath}`));
}

export function validateN8nWorkflowRegistry(tasks = N8N_WORKFLOW_TASKS): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const task of tasks) {
    if (!task.id) errors.push(`${task.name}: missing id`);
    if (ids.has(task.id)) errors.push(`${task.id}: duplicate id`);
    ids.add(task.id);
    if (!task.name) errors.push(`${task.id}: missing name`);
    if (!task.webhookPath.startsWith("/webhook/aura-omega/")) errors.push(`${task.id}: webhookPath must start with /webhook/aura-omega/`);
    if (paths.has(task.webhookPath)) errors.push(`${task.id}: duplicate webhookPath`);
    paths.add(task.webhookPath);
    if (task.trigger === "cron" && !task.schedule) errors.push(`${task.id}: cron task missing schedule`);
    if (!task.prompt || task.prompt.length < 20) errors.push(`${task.id}: prompt too short`);
  }
  if (tasks.length < 58) errors.push(`registry has ${tasks.length} tasks; expected at least 58`);
  return errors;
}
