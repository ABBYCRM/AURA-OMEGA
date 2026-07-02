/**
 * Mission planner — wraps bosOmegaBrain to produce a MissionStep[] plan.
 *
 * The Brain already produces a 10-step plan with acceptance criteria and a
 * state machine (NEW/INTAKE/PLANNED/EXECUTED/VERIFIED/COMPLETE/BLOCKED/FAILED).
 * We translate that into MissionStep objects the executor can dispatch.
 */

import {
  createBosOmegaBrainPlan,
  markBrainExecuted,
  markBrainVerified,
  type BrainPlan,
} from "../bosOmegaBrain";
import type { MissionStep } from "./types";
import { knowledgeHierarchyBlock, relevantDocsForGoal } from "../knowledge-hierarchy";

const ENGINE_FOR_TASK_TYPE: Record<string, MissionStep["engine"]> = {
  CODE: "openhands",
  RESEARCH: "crawl4ai",
  UI: "openhands",
  DEPLOYMENT: "openhands",
  SECURITY: "openhands",
  WRITING: "hermes",
  N8N: "openhands",
  GENERAL_EXECUTION: "hermes",
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "");
}

// ── Vague-goal clarification gate (PR #43 extension to the Mission Kernel) ──
// Generic one-word goals ("report", "help", "do it") with no sourceContext
// cannot be decomposed into actionable plan steps. Mirror the orchestrator's
// isVagueGoal() so both swarm paths give the operator one consolidated
// clarification and do NOT spin up tools.
const VAGUE_GOAL_PATTERN = /^(\s*(report|make report|build report|analy[sz]e|help|do it|do the thing|what now|huh|fix it|figure it out|handle it|take care of it)\s*[.?!]?\s*)$/i;
const CLARIFICATION_PROMPT =
  "Give me the report topic, purpose, audience, format, sources, length, and deadline.";

function isVagueGoal(goal: string, sourceContext?: string | null): boolean {
  if (sourceContext && sourceContext.trim().length > 32) return false;
  const g = goal.trim();
  if (g.length === 0) return true;
  if (VAGUE_GOAL_PATTERN.test(g)) return true;
  if (
    g.length < 14 &&
    !/\b(make|create|generate|build|write|run|search|find|scrape|send|post|publish|delete|update|call|invoke|deploy|open|push|merge|close|schedule|launch|start|stop|test|verify|analy[sz]e|extract|parse|list|show|describe|explain|compare|map)\b/i.test(g)
  ) {
    return true;
  }
  return false;
}

function buildSeedUrl(goal: string): string {
  const q = encodeURIComponent(goal);
  return `https://duckduckgo.com/?q=${q}`;
}

export function buildMissionSteps(goal: string, sourceContext?: string | null): { steps: MissionStep[]; brain: BrainPlan } {
  // Vague-goal clarification gate — short generic commands without source
  // material cannot be decomposed. Return an empty plan + Brain ABORT so the
  // route handler posts ONE clarification and does NOT dispatch any step.
  if (isVagueGoal(goal, sourceContext)) {
    const brain: BrainPlan = {
      objective: goal,
      deliverable: `vague goal: "${goal.trim()}". ${CLARIFICATION_PROMPT}`,
      taskType: "GENERAL_EXECUTION",
      gate: "ABORT",
      status: "BLOCKED",
      acceptance: [CLARIFICATION_PROMPT],
      plan: [],
      evidence: [
        {
          label: "BLOCKED",
          agent: "OMEGA",
          message: `Refused to dispatch — vague goal "${goal.trim()}".`,
          timestamp: new Date().toISOString(),
        },
      ],
      activeInference: {
        hiddenState: "operator intent not specified",
        observation: `goal="${goal}" sourceContext.length=${sourceContext?.length ?? 0}`,
        prior: "vague goals require operator input",
        prediction: "operator will provide specifics",
        predictionError: "0",
        selectedPolicy: "CLARIFY",
        ambiguity: 1,
        risk: 0,
        evidenceStrength: 0,
        expectedFreeEnergy: 1,
      },
      verified: false,
      blocked: true,
      failed: false,
    };
    return { steps: [], brain };
  }

  const brain = createBosOmegaBrainPlan(goal);
  const engine = ENGINE_FOR_TASK_TYPE[brain.taskType] ?? "hermes";

  if (brain.gate === "HOLD" || brain.gate === "ABORT") {
    return { steps: [], brain };
  }

  // Operator's RULE (2026-06-26, refined 2026-06-26 batch-2): prepend a
  // multi-engine public-web search (SearXNG + Tavily) for ANY goal that looks
  // like lead generation — not only auth-gated platforms. The original rule
  // only fired on LinkedIn/Instagram/Twitter/Glassdoor/Facebook/TikTok, which
  // left HVAC / plumbers / dentists / attorneys / solar / real-estate goals
  // running 10 hermes memory_writes with zero contact data ("completed" but
  // useless). Now any goal mentioning contacts, leads, profiles, scraping,
  // emails, or a known lead-gen vertical triggers the same fallback chain.
  const LEAD_GEN_HINT = /\b(contact|contacts|lead|leads|profile|profiles|scrape|find|email|emails|prospect|prospects|directory|directories|supplier|suppliers|installer|installers|contractor|contractors|lawyer|lawyers|attorney|attorneys|broker|brokers|agent|agents|realtor|realtors)\b/i;
  const LEAD_GEN_VERTICAL = /\b(hvac|plumber|plumbers|dentist|dentists|chiropractor|chiropractors|mortgage|attorney|attorneys|lawyer|lawyers|personal injury|realtor|realtors|real estate|solar|sales|installer|installers|roofing|electrician|electricians|painter|painters|pest control|pools|pool service|towing|tow|landscap|landscaping|auto repair|mechanic|mechanics|salon|salons|barber|barbers|restaurant|restaurants|gym|fitness|yoga|daycare|pet care|vet|veterinar|accountant|accountants|cpa|bookkeep|tutor|tutors|train|photographer|photographers|wedding|event planner|cleaning|maid|carpet|tile|hardwood|glass|window|door|locksmith|moving|storage|water damage|mold|asbestos|junk removal|hauling|delivery|courier|notary|mobile notary|tax|preparer|consultant|consultants|coach|coaches|therapist|therapists|counselor|counselors|psychologist|psychiatrist|dermatologist|dentist|optometrist|chiropractor|podiatrist|orthodontist|surgeon|doctor|physician|nurse|nursing|home health|hospice|senior care|elder care|childcare|preschool|kinder|tutor|tutoring|music|dance|art|craft|pottery|sewing|knitting|woodwork|metalwork|welding|machine shop|3d print|cnc|laser cut|engraving|sign|maker|prototyp)\b/i;
  const AUTH_GATED = /\b(linkedin|instagram|twitter|x\.com|glassdoor|facebook|tiktok)\b/i;
  const isLeadGen = LEAD_GEN_HINT.test(goal) || LEAD_GEN_VERTICAL.test(goal);
  const isAuthGatedPlatform = AUTH_GATED.test(goal);
  const needsPrependedSearch = isLeadGen || isAuthGatedPlatform;
  const prependedSteps: MissionStep[] = needsPrependedSearch
    ? [
        // Step 0: cheap self-hosted SearXNG (free, no rate limits)
        {
          index: 0,
          description: `Free public-web search for "${goal}" via self-hosted SearXNG (operator fallback rule #1).`,
          engine: "searxng-search" as any,
          action: "search",
          args: {
            query: goal,
            query_variants: buildQueryVariants(goal),
            site: extractSite(goal),
            limit: 30,
            category: extractCategory(goal),
            engines: "bing",
          },
          acceptance: "SearXNG fanout ran without error. >=0 results is acceptable — we tolerate upstream gaps because the next steps (Tavily + hermes memory) compensate.",
          maxAttempts: 4,
          backoffSeconds: 30,
        },
        // Step 1: Tavily as paid second-pass for any quota gap
        {
          index: 1,
          description: `Tavily public-web search to fill quota gap on "${goal}" (operator fallback rule #2).`,
          engine: "tavily-search" as any,
          action: "search",
          args: {
            query: goal,
            query_variants: buildQueryVariants(goal),
            site: extractSite(goal),
            limit: 30,
            category: extractCategory(goal),
          },
          acceptance: "Tavily ran without error. >=0 results is acceptable — better-than-nothing is fine.",
          maxAttempts: 4,
          backoffSeconds: 30,
        },
      ]
    : [];

  // Operator doctrine 2026-06-27 20:15: bos-omega brain's 10 INTERNAL
  // reasoning steps ("Restate objective", "Load context", "Classify task"...)
  // are NOT actions to execute — they are the brain's own thinking trace.
  // The mission kernel should build its OWN action plan from the brain's
  // (gate, taskType) using deterministic rules, NOT iterate brain.plan.
  //
  // Why this matters: the old code generated 10 identical crawl4ai steps
  // for RESEARCH goals (one per brain reasoning step), each crawling the
  // SAME DuckDuckGo URL — wasted budget + blocked missions. The new code
  // builds a 1-3 step plan tailored to the task type.
  const steps: MissionStep[] = prependedSteps.concat(
    buildDeterministicActionPlan(brain, engine, goal, prependedSteps.length),
  );

  // ── Final synthesis step (always appended) ──
  // This is what turns a multi-step scraper mission into an actual answer.
  // Without this, the mission "completes" with N raw search results and the
  // operator has to mentally consolidate them. With this, K2.6 reads back all
  // the evidence written to mission memory and produces one coherent answer
  // with citations. The synthesis output is also persisted under
  // `mission/final-answer/<missionId>` for the UI to surface.
  //
  // Operator's doctrine (2026-06-27): before synthesizing, inject the
  // Tier-0/1/2 authoritative docs relevant to the goal so K2.6 cites
  // primary sources instead of SEO blogs.
  // ABORT (vague) and HOLD missions never reach here — the early returns
  // above handle them — so gate is always "GO" and synthesis always applies.
  const docBlock = knowledgeHierarchyBlock(goal);
  const tier0Count = relevantDocsForGoal(goal).length;
  steps.push({
    index: steps.length,
    description: `Synthesize a coherent final answer for "${goal}" from all evidence collected by prior steps + Tier-0/1/2 docs (${tier0Count} authoritative source(s) matched).`,
    engine: "brain",
    action: "synthesize",
    args: {
      goal,
      missionId: 0, // set at runtime by the executor
      format: "structured",
      includeAllEvidence: true,
      authoritativeDocs: docBlock,
    },
    acceptance: "Final synthesized answer addresses the operator's question directly with cited sources, prefers Tier-0 official docs over community blogs.",
    maxAttempts: 3,
    backoffSeconds: 30,
  });

  return { steps, brain };
}

/** Extract the platform domain from a goal like "scrape linkedin for X". */
function extractSite(goal: string): string {
  const m = goal.match(/\b(linkedin\.com|instagram\.com|twitter\.com|x\.com|glassdoor\.com|facebook\.com|tiktok\.com)\b/i);
  if (m) return m[1];
  const m2 = goal.match(/\b(linkedin|instagram|twitter|glassdoor|facebook|tiktok)\b/i);
  return m2 ? `${m2[1].toLowerCase()}.com` : "linkedin.com";
}

/** Extract a category slug from the goal text (best-effort). */
function extractCategory(goal: string): string {
  return slugify(goal.replace(/\b(scrape|find|get|extract|contacts|profiles|from)\b/gi, "").trim());
}

/**
 * Build multiple search query variants for fanout. A single operator goal
 * like "scrape linkedin for 30 contacts in mass tort lead generation India
 * and Philippines" doesn't return 30 results from one Tavily query. This
 * function decomposes the goal into N orthogonal variants so a single
 * tavily-search step can fill the quota.
 *
 * Operator rule (2026-06-26): self-reflect on what the engine actually
 * needs vs. what was asked, and produce enough orthogonal queries to hit
 * the count.
 */
function buildQueryVariants(goal: string): string[] {
  // Strip operator-grammar noise so the underlying search engine sees a
  // clean keyword phrase, not a sentence like
  //   "scrape linkedin for 30 contacts in plumbers California"
  const cleaned = goal
    .replace(/\bscrape\b/gi, "")
    .replace(/\bfind\b/gi, "")
    .replace(/\bget\b/gi, "")
    .replace(/\bextract\b/gi, "")
    .replace(/\bcontacts?\b/gi, "")
    .replace(/\bprofiles?\b/gi, "")
    .replace(/\bfor\b/gi, "")
    .replace(/\bthe\b/gi, "")
    .replace(/\ba\b/gi, "")
    .replace(/\bin\b/gi, "")
    .replace(/\bon\b/gi, "")
    .replace(/\bof\b/gi, "")
    .replace(/\b30\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  // Extract the core "vertical" phrase (mass tort, mva, hvac, ssdi,
  // plumbers, dentists, etc.) when present.
  const vertical = cleaned.match(/\b(mass\s?tort|mva|hvac|ssdi|plumbers?|dentists?|chiropractors?|personal\s+injury|real\s+estate|mortgage|insurance|attorney|lawyer|wholesale|distributor|supplier)\b/i)?.[0]?.toLowerCase();
  // Extract role modifiers when present.
  const role = cleaned.match(/\b(lead\s?gen(?:eration)?|case\s+(?:acquisition\s+)?buyers?|supplier|distributor|wholesale|supply\s+(?:buyer|house)|buyer|intake|operator|specialist|agent|broker|manager|owner|founder)\b/i)?.[0]?.toLowerCase();
  // Geographic / country modifiers.
  const geo = cleaned.match(/\b(india|philippines|usa|uk|canada|australia|texas|california|florida|new\s+york|arizona|nevada|ohio|georgia)\b/i)?.[0];
  const variants: string[] = [];
  if (vertical && role) {
    variants.push(`${vertical} ${role}`);
    variants.push(`"${vertical}" ${role}`);
    variants.push(`${vertical} ${role} ${geo || ""}`.trim());
    variants.push(`${vertical} ${role} operator`);
    variants.push(`${vertical} ${role} specialist`);
    variants.push(`${vertical} ${role} ${geo ? geo + " " : ""}case study`.trim());
  } else if (vertical && geo) {
    variants.push(`${vertical} ${geo}`);
    variants.push(`"${vertical}" ${geo}`);
    variants.push(`${vertical} operator ${geo}`);
    variants.push(`${vertical} specialist ${geo}`);
    variants.push(`${vertical} ${geo} directory`);
    variants.push(`${vertical} ${geo} listings`);
  } else if (vertical) {
    variants.push(vertical);
    variants.push(`"${vertical}"`);
    variants.push(`${vertical} operator`);
    variants.push(`${vertical} specialist`);
    variants.push(`${vertical} directory`);
    variants.push(`${vertical} listings`);
  } else {
    variants.push(cleaned);
    variants.push(`"${cleaned}"`);
  }
  // Dedupe + cap to 6 variants.
  return Array.from(new Set(variants.filter((v) => v && v.trim().length > 0))).slice(0, 6);
}

/**
 * Operator fix 2026-06-27: build REAL crawl4ai steps for a research goal
 * instead of looping over the bos-omega brain's 10 internal planning
 * artifacts. Three steps:
 *   1. Crawl the official documentation / Tier-0 reference sites that match
 *      the goal's domain (e.g. "real estate leads" -> reapi.org, zillow.com).
 *   2. Crawl the search results returned by the prepended SearXNG step
 *      (the runtime will thread those URLs through to this step).
 *   3. (Skipped if no real URLs can be derived — the synthesis step still
 *      produces an answer from memory.)
 *
 * The seeds list is intentionally small (3-5 URLs). Each step is an
 * independent crawl, so a single failure does NOT block the mission.
 */
/**
 * Operator fix 2026-06-27 20:21: research goals need REAL URLs as crawl seeds,
 * not a search-engine homepage. Map goal keywords to known authoritative
 * reference URLs (Wikipedia, official docs, knowledge base). Returns 2-4
 * URLs that have actual content for the topic. Falls back to a stable,
 * content-rich reference (Wikipedia) for unknown domains.
 */
export function buildResearchSeeds(goal: string): string[] {
  const g = goal.toLowerCase();
  const seeds: string[] = [];
  // Lead generation / sales / marketing → Wikipedia + industry primers
  if (/\b(lead|leads|sales|buyer|buyers|provider|providers|contact|prospect|crm|marketing)\b/i.test(g)) {
    seeds.push("https://en.wikipedia.org/wiki/Lead_generation");
    seeds.push("https://en.wikipedia.org/wiki/Sales_lead");
    if (/\b(india|indian)\b/i.test(g)) seeds.push("https://en.wikipedia.org/wiki/India");
    if (/\b(usa|united states|\bu\.?s\.?\b|us)\b/i.test(g)) seeds.push("https://en.wikipedia.org/wiki/United_States");
  }
  // Code / programming / dev → language reference
  if (/\b(code|programming|typescript|javascript|python|rust|go\b|java\b|api)\b/i.test(g)) {
    seeds.push("https://en.wikipedia.org/wiki/Software_development");
    if (/\btypescript\b/i.test(g)) seeds.push("https://en.wikipedia.org/wiki/TypeScript");
    if (/\bjavascript\b/i.test(g)) seeds.push("https://en.wikipedia.org/wiki/JavaScript");
    if (/\bapi\b/i.test(g)) seeds.push("https://en.wikipedia.org/wiki/Web_API");
  }
  // AI / ML / neural
  if (/\b(ai|ml|machine learning|llm|neural|gpt|claude)\b/i.test(g)) {
    seeds.push("https://en.wikipedia.org/wiki/Artificial_intelligence");
    if (/\bllm\b/i.test(g)) seeds.push("https://en.wikipedia.org/wiki/Large_language_model");
  }
  // Solar / energy
  if (/\b(solar|photovoltaic|panel|renewable|energy|rooftop)\b/i.test(g)) {
    seeds.push("https://en.wikipedia.org/wiki/Solar_power");
    seeds.push("https://en.wikipedia.org/wiki/Solar_panel");
    if (/\blead|leads|sales|buyer|provider|contact/i.test(g)) seeds.push("https://en.wikipedia.org/wiki/Lead_generation");
  }
  // Money / pricing / cost
  if (/\b(price|pricing|cost|money|revenue|profit|investment)\b/i.test(g)) {
    seeds.push("https://en.wikipedia.org/wiki/Pricing");
  }
  // Always include a stable fallback so the crawl has SOMETHING to fetch.
  if (seeds.length === 0) {
    seeds.push("https://en.wikipedia.org/wiki/Outline_of_knowledge");
  }
  // Dedup + cap at 4.
  return Array.from(new Set(seeds)).slice(0, 4);
}

/**
 * Build a deterministic action plan from the brain's (gate, taskType) tuple.
 * Operator doctrine 2026-06-27 20:15: the bos-omega brain's 10-step plan is
 * its OWN reasoning trace, not a list of actions for the mission kernel to
 * dispatch. The kernel builds its own 1-3 step plan based on task type +
 * goal keywords. This is "deterministic evaluation and task decomposition".
 *
 * Returns MissionStep[] indexed starting at startIndex.
 */
function buildDeterministicActionPlan(
  brain: BrainPlan,
  engine: MissionStep["engine"],
  goal: string,
  startIndex: number,
): MissionStep[] {
  const base = { goal, stepIndex: 0, taskType: brain.taskType };
  // Goal-derived signal extraction (deterministic, no LLM call).
  const goalLower = goal.toLowerCase();
  const needsContactSearch = /\b(contact|contacts|email|emails|phone|directory|supplier|suppliers|provider|providers|buyer|buyers|lead|leads|profile|profiles|scrape)\b/i.test(goal);
  const needsPricing = /\b(pricing|price|cost|rate|rates|how much|fees|fee|charge|charges|pay|salary|compensation)\b/i.test(goal);
  const needsCompetition = /\b(competition|competitor|competitors|compete|alternative|alternatives|vs|versus|compare|comparison|rival|rivals)\b/i.test(goal);
  const needsUrls = /\b(url|urls|link|links|website|websites|site|sites|domain|domains)\b/i.test(goal);
  const needsPlan = /\b(plan|steps|how[- ]?to|guide|strategy|roadmap|playbook)\b/i.test(goal);
  const needsCode = /\b(code|script|function|regex|sql|query|api|endpoint|build|compile|deploy)\b/i.test(goal);

  const steps: MissionStep[] = [];

  // ── Engine-specific action step (1 step, not 10) ──
  switch (engine) {
    case "crawl4ai": {
      // For RESEARCH goals: pick a real reference URL with KNOWN content
      // based on goal keywords. Operator fix 2026-06-27: a search-engine
      // homepage (DDG, Google) returns a JS-required single-page app or an
      // empty page, so Steel fails to extract anything. Instead, seed with
      // authoritative references that have real, parseable content.
      const seeds = buildResearchSeeds(goal);
      steps.push({
        index: startIndex,
        description: `Crawl ${seeds.length} authoritative reference page(s) for "${goal.slice(0, 80)}" to extract real content.`,
        engine: "crawl4ai",
        action: "crawl",
        args: { ...base, seeds, maxPages: Math.min(seeds.length, 5), memoryKeyPrefix: `mission/${slugify(goal)}/crawl1` },
        acceptance: "At least 1 page crawled successfully, evidence written to mission memory.",
        maxAttempts: 2,
        backoffSeconds: 30,
      });
      break;
    }
    case "hermes": {
      // For WRITING / GENERAL_EXECUTION: ONE memory_write of the goal context.
      // The previous code wrote 10 identical memory entries ("Restate objective",
      // "Load context"...). The 10x duplication was a planner bug, not a feature.
      steps.push({
        index: startIndex,
        description: `Record goal context + task type (${brain.taskType}) to mission memory.`,
        engine: "hermes",
        action: "memory_write",
        args: { ...base, key: `mission/${slugify(goal)}/context`, content: `Goal: ${goal}\nTask type: ${brain.taskType}\nDeterministic plan: 1 context step + 1 synthesis step. Prior 10-step brain-internal-plan iteration was redundant.` },
        acceptance: "Goal context recorded to mission memory.",
        maxAttempts: 2,
        backoffSeconds: 15,
      });
      break;
    }
    case "openhands": {
      // For CODE / UI / DEPLOYMENT: ONE code_exec step that runs the goal.
      // Operator doctrine: the swarm should be useful, not generate 10 stub steps.
      steps.push({
        index: startIndex,
        description: `Execute the goal: ${goal.slice(0, 120)}${goal.length > 120 ? "..." : ""}`,
        engine: "openhands",
        action: "code_exec",
        args: { ...base, code: `// Mission goal: ${goal}\n// Task type: ${brain.taskType}\n// Return a structured plan + answer in JSON.\nconst result = { goal: ${JSON.stringify(goal)}, taskType: "${brain.taskType}", approach: "deterministic-decomposition" };\nreturn JSON.stringify(result, null, 2);`, language: "javascript" },
        acceptance: "Code execution returns a structured result.",
        maxAttempts: 2,
        backoffSeconds: 30,
      });
      break;
    }
    case "mem0": {
      // For SECURITY / N8N: ONE extract step.
      steps.push({
        index: startIndex,
        description: `Extract structured facts from goal: ${goal.slice(0, 100)}`,
        engine: "mem0",
        action: "extract",
        args: { ...base, text: goal, userId: "operator" },
        acceptance: "Extraction returns structured facts.",
        maxAttempts: 2,
        backoffSeconds: 30,
      });
      break;
    }
    default: {
      // Fallback: write context to memory.
      steps.push({
        index: startIndex,
        description: `Record goal context to memory.`,
        engine: "hermes",
        action: "memory_write",
        args: { ...base, key: `mission/${slugify(goal)}/context`, content: `Goal: ${goal}\nTask type: ${brain.taskType}` },
        acceptance: "Context recorded.",
        maxAttempts: 2,
        backoffSeconds: 15,
      });
    }
  }

  return steps;
}

export function recordExecuted(brain: BrainPlan, message: string): BrainPlan {
  return markBrainExecuted(brain, message);
}

export function recordVerified(brain: BrainPlan, message: string): BrainPlan {
  return markBrainVerified(brain, message);
}