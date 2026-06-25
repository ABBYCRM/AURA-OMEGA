export type ProviderCategory = "llm" | "data" | "observability" | "memory" | "search" | "browser" | "events" | "sandbox" | "tools" | "media" | "deployment" | "code";

export interface IntegrationCard {
  name: string;
  category: ProviderCategory;
  configured: boolean;
  description: string;
  env: string[];
}

export const integrationCatalog: IntegrationCard[] = [
  { name: "NVIDIA NIM", category: "llm", configured: true, description: "7-key model pool for paid model routing and fallback.", env: ["NVIDIA_API_KEY", "NVIDIA_API_KEY_MINIMAX"] },
  { name: "OpenRouter", category: "llm", configured: true, description: "Gemini, GPT, Claude, Qwen, Llama, DeepSeek and more through one router.", env: ["OPENROUTER_API_KEY"] },
  { name: "OpenAI Direct", category: "llm", configured: true, description: "Direct GPT/o-series calls for high reliability and image generation.", env: ["OPENAI_API_KEY"] },
  { name: "Google Gemini", category: "llm", configured: true, description: "Gemini 2.0/2.5 model access for planner or multimodal worker roles.", env: ["GEMINI_API_KEY"] },
  { name: "Kimi K2.6", category: "llm", configured: false, description: "External reasoning model access.", env: ["KIMI_API_KEY", "KIMI_BASE_URL", "KIMI_MODEL"] },
  { name: "Massive / Polygon", category: "data", configured: true, description: "Stocks, forex, crypto, options, and market data feeds.", env: ["MASSIVE_API_KEY"] },
  { name: "Scrapfly", category: "data", configured: true, description: "Anti-bot scraping, JS rendering, and guarded-page retrieval.", env: ["SCRAPFLY_API_KEY"] },
  { name: "Helicone", category: "observability", configured: true, description: "LLM call telemetry, cost tracing, and provider analytics.", env: ["HELICONE_API_KEY"] },
  { name: "LangSmith", category: "observability", configured: true, description: "Agent traces, evaluation runs, and execution debugging.", env: ["LANGSMITH_API_KEY", "LANGCHAIN_API_KEY"] },
  { name: "Embeddings", category: "memory", configured: true, description: "Semantic memory embeddings for retrieval and tool-intent matching.", env: ["EMBEDDINGS_API_KEY"] },
  { name: "Pinecone", category: "memory", configured: true, description: "Vector memory index for long-horizon continuity and tool selection.", env: ["PINECONE_API_KEY", "PINECONE_INDEX"] },
  { name: "Tavily", category: "search", configured: true, description: "Search API for source-grounded web research.", env: ["TAVILY_API_KEY"] },
  { name: "Exa", category: "search", configured: true, description: "Neural/web search for research, papers, GitHub, and company lookups.", env: ["EXA_API_KEY"] },
  { name: "Firecrawl", category: "search", configured: false, description: "Crawl/scrape structured websites with API key.", env: ["FIRECRAWL_API_KEY"] },
  { name: "FreeCrawl", category: "search", configured: true, description: "Keyless scrape/search fallback when paid crawlers are offline.", env: [] },
  { name: "SearXNG", category: "search", configured: true, description: "Self-hosted free metasearch; primary free search lane.", env: ["SEARXNG_URL"] },
  { name: "Steel", category: "browser", configured: false, description: "Live browser sessions for authorized websites and visual validation.", env: ["STEEL_API_KEY"] },
  { name: "Inngest", category: "events", configured: true, description: "Event bus for async agent jobs, retries, and queue state.", env: ["INNGEST_EVENT_KEY"] },
  { name: "E2B", category: "sandbox", configured: true, description: "Code execution sandbox for tests and safe command runs.", env: ["E2B_API_KEY"] },
  { name: "Composio", category: "tools", configured: true, description: "OAuth SaaS tool access such as Gmail, Calendar, Sheets, GitHub.", env: ["COMPOSIO_API_KEY"] },
  { name: "Image Generate", category: "tools", configured: true, description: "OpenAI/Gemini image generation abstraction.", env: ["OPENAI_API_KEY", "GEMINI_API_KEY"] },
  { name: "Video Generate", category: "media", configured: false, description: "A2E or provider-backed video generation lane.", env: ["A2E_API_KEY"] },
  { name: "OpenCode", category: "code", configured: true, description: "Coding agent lane for repo edits, tests, and implementation tasks.", env: ["OPENCODE_API_KEY"] },
  { name: "Render", category: "deployment", configured: true, description: "Deployment, logs, service health, and environment updates.", env: ["RENDER_API_KEY"] },
];

export const officialApis = [
  { name: "Instagram", baseUrl: "https://graph.instagram.com", connected: false, docs: "https://developers.facebook.com/docs/instagram-basic-display-api" },
  { name: "Facebook", baseUrl: "https://graph.facebook.com/v21.0", connected: false, docs: "https://developers.facebook.com/docs/graph-api" },
  { name: "X / Twitter", baseUrl: "https://api.x.com/2", connected: false, docs: "https://docs.x.com/x-api" },
  { name: "Reddit", baseUrl: "https://oauth.reddit.com", connected: false, docs: "https://www.reddit.com/dev/api" },
  { name: "YouTube", baseUrl: "https://www.googleapis.com/youtube/v3", connected: false, docs: "https://developers.google.com/youtube/v3" },
  { name: "TikTok", baseUrl: "https://open.tiktokapis.com/v2", connected: false, docs: "https://developers.tiktok.com/doc/overview" },
];

export const composioApps = [
  { app: "github", status: "Connected", id: "ca_9rZvMExWOcp2" },
  { app: "gmail", status: "Connected", id: "ca_uHcU-vlAJlad" },
  { app: "googlecalendar", status: "Connected", id: "ca_2a-rTQ2VRISI" },
  { app: "googlesheets", status: "Connected", id: "ca_NrF4pFYTU0an" },
  { app: "instagram", status: "Connected", id: "ca_-_XofwPOyYZQ" },
  { app: "slack", status: "Not connected", id: "" },
  { app: "notion", status: "Not connected", id: "" },
  { app: "hubspot", status: "Not connected", id: "" },
];

export const runtimeLanes = [
  { name: "BOS-OMEGA Governor", status: "online", role: "Policy, safety, verification, final authority" },
  { name: "Kimi K2.6 Brain", status: "ready-to-wire", role: "Planner/reasoner behind BOS policy gate" },
  { name: "Tool Selection Matrix", status: "online", role: "Maps phrases and goals to n8n tools" },
  { name: "n8n Executor", status: "waiting-webhooks", role: "Executes 60 workflow hands" },
  { name: "Heartbeat Autonomy", status: "dry-run", role: "Keeps planner checking state without unsafe blind actions" },
  { name: "Memory Lattice", status: "online", role: "Outcome memory, lessons, continuity" },
  { name: "Browser/Scrape Lane", status: "partial", role: "Steel/Scrapfly/SearXNG/Tavily/Exa research and browser tasks" },
  { name: "Code/Deploy Lane", status: "partial", role: "GitHub, Render, VPS, tests, deploy verification" },
];

export const cronTemplates = [
  { name: "Heartbeat Snapshot", schedule: "*/5 * * * *", agent: "ABBY", prompt: "Read active tasks, n8n health, recent errors, and memory status. Do not execute external side effects unless policy allows it." },
  { name: "Nightly Self-Learning Review", schedule: "0 4,5,6 * * *", agent: "ABBY", prompt: "Read unresolved errors, find verified fixes, save reusable lessons as PROBLEM → SOLUTION with evidence." },
  { name: "Weekly LLM Catalog Probe", schedule: "0 4 * * 0", agent: "ABBY", prompt: "Probe provider model catalogs, report drops/additions, never apply drops automatically." },
  { name: "Daily Continuity Report", schedule: "0 23 * * *", agent: "AURA-3", prompt: "Summarize verified memory changes, open blockers, active automations, and next actions." },
];

export const toolDomains = [
  "coding", "github", "render", "vps", "web-search", "browser", "news", "discord", "crm", "email", "calendar", "sheets", "social", "memory", "media", "security", "deploy", "monitoring"
];

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}
