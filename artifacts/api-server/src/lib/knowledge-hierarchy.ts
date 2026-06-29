/**
 * Tiered Knowledge Hierarchy — operator's documentation-first doctrine.
 *
 * When the agent hits an impasse (or before general web search), consult this
 * hierarchy. Tier 0 = highest trust (official product docs). Tier 5 = lowest
 * trust (community forums, blogs). Senior engineers go to Tier 0 first.
 *
 * Operator's rule (2026-06-27): "It must not just read and regurgitate, it
 * must read, understand it, learn it, add to memory and then perform the
 * task and/or mission the system was given."
 *
 * Wired into:
 *   - planner.ts: classify the goal's domain and inject the right Tier-0
 *     docs into the synthesis prompt so K2.6 has authoritative material
 *   - brain-engine.synthesize: includes the Tier-0/1/2 block in the LLM
 *     prompt so the final answer cites primary sources
 *   - learning-loop (TODO): after each mission, distill key facts into
 *     hermes memory under `knowledge/<topic>/<fact>` so the agent
 *     accumulates understanding over time, not just dump-and-forget
 *
 * Designed for a free, proto-AGI oriented system that obeys the operator
 * and grows its knowledge over time.
 */

export interface KnowledgeTier {
  tier: 0 | 1 | 2 | 3 | 4 | 5;
  label: string;
  description: string;
}

export const TIERS: KnowledgeTier[] = [
  { tier: 0, label: "Official Documentation", description: "Highest trust. Official product/API docs from the vendor." },
  { tier: 1, label: "Official Specifications", description: "Protocols, standards, RFCs, W3C, WHATWG, language specs." },
  { tier: 2, label: "Crawler/SEO/Specialized", description: "Search engine guidelines, sitemap protocol, schema.org, robots.txt." },
  { tier: 3, label: "Package Ecosystems", description: "npm, PyPI, Cargo, Go modules — the canonical package metadata." },
  { tier: 4, label: "Source Code", description: "Official GitHub repo, examples, tests, issues, discussions." },
  { tier: 5, label: "Community", description: "Stack Overflow, Reddit, dev blogs. Advisory, not authoritative." },
];

export interface TopicDoc {
  topic: string;
  url: string;
}

/**
 * Tier 0 — Official Documentation. The agent's FIRST stop for any question
 * about these tools. Before grep'ing the web, before asking Reddit, before
 * generating code from memory.
 *
 * Domains covered: dev tooling, OS/runtime, AI/ML labs, AURA-OMEGA's actual
 * stack, deployment, observability, search, vector DBs, memory systems,
 * browser automation, agent runtimes, security/compliance, frontend/build,
 * data/messaging/infra, cloud providers.
 */
export const TIER_0_DOCS: TopicDoc[] = [
  // ── Core dev tooling ────────────────────────────────────────────────
  { topic: "git", url: "https://git-scm.com/doc" },
  { topic: "github", url: "https://docs.github.com" },
  { topic: "github-rest-api", url: "https://docs.github.com/en/rest" },
  { topic: "github-graphql", url: "https://docs.github.com/en/graphql" },
  { topic: "github-actions", url: "https://docs.github.com/actions" },
  { topic: "powershell", url: "https://learn.microsoft.com/powershell" },
  { topic: "windows", url: "https://learn.microsoft.com/windows" },
  { topic: "dotnet", url: "https://learn.microsoft.com/dotnet" },
  { topic: "huggingface", url: "https://huggingface.co/docs" },
  { topic: "transformers", url: "https://huggingface.co/docs/transformers" },
  { topic: "datasets", url: "https://huggingface.co/docs/datasets" },
  { topic: "docker", url: "https://docs.docker.com" },
  { topic: "kubernetes", url: "https://kubernetes.io/docs" },
  { topic: "nodejs", url: "https://nodejs.org/docs/latest/api" },
  { topic: "typescript", url: "https://www.typescriptlang.org/docs" },
  { topic: "python", url: "https://docs.python.org/3" },
  { topic: "mdn-web", url: "https://developer.mozilla.org" },
  { topic: "linux", url: "https://www.kernel.org/doc/man-pages" },

  // ── AI / LLM labs (Tier 0 — operator's proto-AGI doctrine) ─────────
  { topic: "openai", url: "https://platform.openai.com/docs" },
  { topic: "anthropic", url: "https://docs.anthropic.com" },
  { topic: "google-gemini", url: "https://ai.google.dev/docs" },
  { topic: "moonshot-kimi", url: "https://platform.moonshot.ai/docs" },
  { topic: "nvidia-nim", url: "https://docs.api.nvidia.com/nim" },
  { topic: "deepseek", url: "https://api-docs.deepseek.com" },
  { topic: "mistral", url: "https://docs.mistral.ai" },
  { topic: "xai-grok", url: "https://docs.x.ai" },
  { topic: "meta-llama", url: "https://llama.meta.com/docs" },
  { topic: "cohere", url: "https://docs.cohere.com" },
  { topic: "openrouter", url: "https://openrouter.ai/docs" },
  { topic: "groq", url: "https://console.groq.com/docs" },
  { topic: "together-ai", url: "https://docs.together.ai" },
  { topic: "fireworks-ai", url: "https://docs.fireworks.ai" },
  { topic: "replicate", url: "https://replicate.com/docs" },

  // ── AURA-OMEGA stack — the runtimes, integrations, infrastructure ──
  { topic: "render", url: "https://render.com/docs" },
  { topic: "render-postgres", url: "https://render.com/docs/postgresql" },
  { topic: "inngest", url: "https://www.inngest.com/docs" },
  { topic: "inngest-render", url: "https://www.inngest.com/docs/deploy/render" },
  { topic: "e2b", url: "https://e2b.dev/docs" },
  { topic: "tavily", url: "https://docs.tavily.com" },
  { topic: "exa", url: "https://docs.exa.ai" },
  { topic: "firecrawl", url: "https://docs.firecrawl.dev" },
  { topic: "steel-dev", url: "https://docs.steel.dev" },
  { topic: "composio", url: "https://docs.composio.dev" },
  { topic: "langsmith", url: "https://docs.smith.langchain.com" },
  { topic: "helicone", url: "https://docs.helicone.ai" },
  { topic: "pinecone", url: "https://docs.pinecone.io" },
  { topic: "scrapfly", url: "https://scrapfly.io/docs" },
  { topic: "screenshotone", url: "https://screenshotone.com/docs" },

  // ── Agent frameworks / orchestration (proto-AGI building blocks) ──
  { topic: "langchain", url: "https://python.langchain.com/docs/introduction/" },
  { topic: "langgraph", url: "https://langchain-ai.github.io/langgraph/" },
  { topic: "llamaindex", url: "https://docs.llamaindex.ai" },
  { topic: "crewai", url: "https://docs.crewai.com" },
  { topic: "autogen", url: "https://microsoft.github.io/autogen" },
  { topic: "openai-agents-sdk", url: "https://openai.github.io/openai-agents-python" },
  { topic: "mcp", url: "https://modelcontextprotocol.io" },
  { topic: "agno", url: "https://docs.agno.com" },
  { topic: "smolagents", url: "https://huggingface.co/docs/smolagents" },
  { topic: "pydantic-ai", url: "https://ai.pydantic.dev" },

  // ── Search engines / indexing ──────────────────────────────────────
  { topic: "searxng", url: "https://docs.searxng.org" },
  { topic: "elasticsearch", url: "https://www.elastic.co/guide/index.html" },
  { topic: "meilisearch", url: "https://www.meilisearch.com/docs" },
  { topic: "typesense", url: "https://typesense.org/docs" },

  // ── Memory / knowledge systems ─────────────────────────────────────
  { topic: "mem0", url: "https://docs.mem0.ai" },

  // ── Browser automation / scraping ──────────────────────────────────
  { topic: "playwright", url: "https://playwright.dev/docs/intro" },
  { topic: "puppeteer", url: "https://pptr.dev" },

  // ── Voice / TTS / multimodal ───────────────────────────────────────
  { topic: "elevenlabs", url: "https://elevenlabs.io/docs" },
  { topic: "openai-tts", url: "https://platform.openai.com/docs/guides/text-to-speech" },

  // ── Security / compliance (proto-AGI alignment) ───────────────────
  { topic: "owasp", url: "https://owasp.org" },
  { topic: "nist-ai-rmf", url: "https://www.nist.gov/itl/ai-risk-management-framework" },
  { topic: "eu-ai-act", url: "https://artificialintelligenceact.eu" },
  { topic: "oauth2", url: "https://www.rfc-editor.org/rfc/rfc6749" },

  // ── Build / devops / frontend ──────────────────────────────────────
  { topic: "vite", url: "https://vite.dev/guide" },
  { topic: "pnpm", url: "https://pnpm.io/motivation" },
  { topic: "drizzle-orm", url: "https://orm.drizzle.team/docs/overview" },
  { topic: "zod", url: "https://zod.dev" },
  { topic: "vitest", url: "https://vitest.dev/guide" },
  { topic: "express", url: "https://expressjs.com/en/4x/api.html" },
  { topic: "fastapi", url: "https://fastapi.tiangolo.com" },
  { topic: "react", url: "https://react.dev" },
  { topic: "tailwindcss", url: "https://v2.tailwindcss.com/docs" },
  { topic: "daisyui", url: "https://daisyui.com/components" },

  // ── Data / messaging / infra ───────────────────────────────────────
  { topic: "postgresql", url: "https://www.postgresql.org/docs" },
  { topic: "redis", url: "https://redis.io/docs/latest" },
  { topic: "kafka", url: "https://kafka.apache.org/documentation" },
  { topic: "rabbitmq", url: "https://www.rabbitmq.com/docs" },
  { topic: "graphql", url: "https://graphql.org/learn" },
  { topic: "grpc", url: "https://grpc.io/docs" },

  // ── Cloud providers ────────────────────────────────────────────────
  { topic: "aws-docs", url: "https://docs.aws.amazon.com" },
  { topic: "gcp-docs", url: "https://cloud.google.com/docs" },
  { topic: "azure-docs", url: "https://learn.microsoft.com/azure" },
  { topic: "cloudflare", url: "https://developers.cloudflare.com" },
];

/** Tier 1 — Official Specifications */
export const TIER_1_SPECS: TopicDoc[] = [
  { topic: "rfc", url: "https://www.rfc-editor.org" },
  { topic: "w3c", url: "https://www.w3.org/TR" },
  { topic: "whatwg-html", url: "https://html.spec.whatwg.org" },
  { topic: "ecmascript", url: "https://tc39.es/ecma262" },
  { topic: "openapi", url: "https://spec.openapis.org" },
];

/** Tier 2 — Crawler / SEO / Specialized */
export const TIER_2_CRAWLER: TopicDoc[] = [
  { topic: "google-search", url: "https://developers.google.com/search" },
  { topic: "bing-webmaster", url: "https://www.bing.com/webmasters" },
  { topic: "robots-txt", url: "https://www.rfc-editor.org/rfc/rfc9309" },
  { topic: "schema-org", url: "https://schema.org" },
  { topic: "sitemaps", url: "https://www.sitemaps.org" },
];

/** Tier 3 — Package Ecosystems */
export const TIER_3_PACKAGES: TopicDoc[] = [
  { topic: "npm", url: "https://docs.npmjs.com" },
  { topic: "pypi", url: "https://packaging.python.org" },
  { topic: "cargo", url: "https://doc.rust-lang.org/cargo" },
  { topic: "go", url: "https://go.dev/doc" },
];

/**
 * Detect which Tier-0/1/2 docs are relevant to a goal string.
 * Used by the planner to inject authoritative URLs into the synthesis step's
 * prompt so K2.6 has citable material.
 */
export function relevantDocsForGoal(goal: string): TopicDoc[] {
  const g = goal.toLowerCase();
  const hits: TopicDoc[] = [];

  const check = (entries: TopicDoc[]) => {
    for (const e of entries) {
      const slug = e.topic.toLowerCase().replace(/-/g, " ");
      const urlSlug = e.url.toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(".")[0];
      if (g.includes(slug) || g.includes(urlSlug)) hits.push(e);
    }
  };

  check(TIER_0_DOCS);
  check(TIER_1_SPECS);
  check(TIER_2_CRAWLER);
  check(TIER_3_PACKAGES);

  // Domain-specific keyword matching (broader than topic slug).
  const kw: Array<[RegExp, TopicDoc[]]> = [
    [/\b(seo|index|sitemap|crawl|search console|google search|serp|robots\.txt)\b/i, TIER_2_CRAWLER],
    [/\b(rfc|spec|protocol|standard)\b/i, TIER_1_SPECS],
    [/\b(html|css|dom|browser|web api|fetch|websocket)\b/i, [TIER_0_DOCS.find((d) => d.topic === "mdn-web")!].filter(Boolean)],
    [/\b(npm|package\.json|node_modules)\b/i, TIER_3_PACKAGES.filter((d) => d.topic === "npm")],
    [/\b(pip|pypi|setup\.py|wheel|pyproject)\b/i, TIER_3_PACKAGES.filter((d) => d.topic === "pypi")],
    [/\b(cargo|crate|rust)\b/i, TIER_3_PACKAGES.filter((d) => d.topic === "cargo")],
    // AURA stack specific:
    [/\b(render|render\.com|render postgres)\b/i, TIER_0_DOCS.filter((d) => d.topic.startsWith("render"))],
    [/\b(inngest|event.driven|durable.execution)\b/i, TIER_0_DOCS.filter((d) => d.topic.startsWith("inngest"))],
    [/\b(e2b|sandbox|code.interpreter)\b/i, TIER_0_DOCS.filter((d) => d.topic === "e2b")],
    [/\b(tavily|web.search.api)\b/i, TIER_0_DOCS.filter((d) => d.topic === "tavily")],
    [/\b(agent|agents|autonomous|multi.agent)\b/i, TIER_0_DOCS.filter((d) =>
      ["langchain", "langgraph", "crewai", "autogen", "openai-agents-sdk", "mcp", "agno", "smolagents", "pydantic-ai", "llamaindex"].includes(d.topic))],
    [/\b(llm|model|gpt|claude|kimi|llama|gemini|grok)\b/i, TIER_0_DOCS.filter((d) =>
      ["openai", "anthropic", "google-gemini", "moonshot-kimi", "nvidia-nim", "deepseek", "mistral", "xai-grok", "meta-llama", "cohere", "groq", "together-ai", "fireworks-ai", "replicate", "openrouter"].includes(d.topic))],
    [/\b(memory|mem0|knowledge base)\b/i, TIER_0_DOCS.filter((d) => d.topic === "mem0")],
    [/\b(playwright|puppeteer|browser automation)\b/i, TIER_0_DOCS.filter((d) => ["playwright", "puppeteer"].includes(d.topic))],
    [/\b(observ|tracing|monitor|langsmith|helicone)\b/i, TIER_0_DOCS.filter((d) => ["langsmith", "helicone"].includes(d.topic))],
    [/\b(vector|embedding|rag)\b/i, TIER_0_DOCS.filter((d) => d.topic === "pinecone")],
  ];
  for (const [re, docs] of kw) {
    if (re.test(g)) hits.push(...docs);
  }

  // Dedup by URL.
  const seen = new Set<string>();
  return hits.filter((d) => (seen.has(d.url) ? false : (seen.add(d.url), true)));
}

/** Render the relevant docs as a compact, citable block for LLM prompts. */
export function knowledgeHierarchyBlock(goal: string): string {
  const docs = relevantDocsForGoal(goal);
  if (docs.length === 0) return "(no Tier-0/1/2 docs matched this goal)";
  const grouped: Record<number, TopicDoc[]> = {};
  for (const d of docs) {
    let tier = 0;
    if (TIER_1_SPECS.includes(d)) tier = 1;
    else if (TIER_2_CRAWLER.includes(d)) tier = 2;
    else if (TIER_3_PACKAGES.includes(d)) tier = 3;
    grouped[tier] = grouped[tier] ?? [];
    grouped[tier].push(d);
  }
  const lines: string[] = ["AUTHORITATIVE DOCS FOR THIS TASK (consult BEFORE general web search):"];
  for (const tier of [0, 1, 2, 3]) {
    if (!grouped[tier]) continue;
    const t = TIERS[tier];
    lines.push(`\n### Tier ${tier} — ${t.label}`);
    for (const d of grouped[tier]) lines.push(`- ${d.topic}: ${d.url}`);
  }
  return lines.join("\n");
}

/** Full hierarchy rendered as a tree (for /api/knowledge endpoints or debug). */
export function fullHierarchyText(): string {
  const lines: string[] = ["TIERED KNOWLEDGE HIERARCHY — operator's documentation-first doctrine\n"];
  for (const t of TIERS) {
    lines.push(`### Tier ${t.tier} — ${t.label}`);
    lines.push(t.description);
    const entries =
      t.tier === 0 ? TIER_0_DOCS :
      t.tier === 1 ? TIER_1_SPECS :
      t.tier === 2 ? TIER_2_CRAWLER :
      t.tier === 3 ? TIER_3_PACKAGES : [];
    for (const e of entries) lines.push(`  - ${e.topic}: ${e.url}`);
    lines.push("");
  }
  lines.push("RULE: Tier 0 first, then 1, 2, 3, 4, 5. Never start at Google general search for these topics.");
  return lines.join("\n");
}

/** Total doc count for observability. */
export function hierarchyStats() {
  return {
    tier0: TIER_0_DOCS.length,
    tier1: TIER_1_SPECS.length,
    tier2: TIER_2_CRAWLER.length,
    tier3: TIER_3_PACKAGES.length,
    total: TIER_0_DOCS.length + TIER_1_SPECS.length + TIER_2_CRAWLER.length + TIER_3_PACKAGES.length,
  };
}