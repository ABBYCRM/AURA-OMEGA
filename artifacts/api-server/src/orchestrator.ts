/**
 * AURA-OMEGA — Real Orchestration Engine
 *
 * This is what makes the swarm REAL instead of scripted text:
 *  - ABBY decomposes an operator goal into concrete per-AURA directives.
 *  - Each target AURA actually executes its directive via NVIDIA NIM (falls back to OpenRouter).
 *  - AURA-2 (browser agent) runs a real Steel scrape when a URL is present and
 *    feeds the real web content back into its reasoning.
 *  - Real messages, tool calls, tasks, monologue lines, agent status, and command
 *    rows are written to the DB so the live dashboard reflects actual work.
 *
 * Execution runs in the background (fire-and-forget) so the HTTP request returns
 * immediately and the feed fills in as agents report, via the dashboard's polling.
 */

import { db } from "@workspace/db";
import {
  agentsTable,
  messagesTable,
  tasksTable,
  toolCallsTable,
  monologueLinesTable,
  agentCommandsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";
import {
  AGENT_PERSONAS,
  ABBY_ID,
  resolveModel,
  openrouterHeaders,
  ANTI_HALLUCINATION_DIRECTIVE,
  EXECUTION_DOCTRINE,
  RESEARCH_PLAYBOOKS,
  SWARM_SAFETY_RULES,
  CODING_LIFECYCLE_DOCTRINE,
  ERROR_RECOVERY_DOCTRINE,
  buildVaultCard,
} from "./routes/ai";
import { isSwarmPaused } from "./routes/swarm";
import { readSettings } from "./routes/settings";
import {
  steelScrape,
  getOpenAiToolsForAgent,
  getToolNamesForAgent,
  buildCapabilityCard,
  runTool,
  sanitizeForStorage,
  type ToolContext,
} from "./tools";
import { sendInngestEvent, traceLlmRun, llmBaseUrl, llmFetchUrl, llmRouteUrl, completeChat } from "./lib/integrations";
import { groundingProof } from "./lib/grounding";
import { recordOutcome, matchSkillForGoal } from "./lib/hermes";
import { reflexiveCritique, recallPostmortem } from "./lib/hermes/critique";
import { swarmClear } from "./lib/swarm-bus";
import { scratchClear } from "./lib/agentScratch";
import {
  canonicalJson,
  checkToolPayloadBudget,
  ensureFinalAnswer,
  hasUnexpectedScript,
  installFinalAnswerCrashGuard,
  sanitizeFinalOutput,
  toolCallKey,
  verifyArtifactDelivery,
} from "./lib/runtimeGuards";
import { runEvidenceGate } from "./lib/evidence-gate";

// Install a process-wide finalAnswer default at module load. Prevents the
// `finalAnswer` ReferenceError if a code path exits before assigning it.
installFinalAnswerCrashGuard();

// ─── Process-local dedupe of postMessage calls ─────────────────────────────────
// Operator-visible channel messages get keyed by (channelId, agentId/agentName,
// messageType, content-hash). A second call with the same key in this process
// returns without inserting a duplicate row.
const postedMessageKeys = new Set<string>();
function stableMessageKey(opts: {
  channelId: number;
  agentId?: number | null;
  agentName?: string | null;
  messageType: string;
  content: string;
}): string {
  const agentPart = opts.agentId != null ? `id:${opts.agentId}` : `name:${(opts.agentName ?? "").trim().toLowerCase()}`;
  return `${opts.channelId}|${agentPart}|${opts.messageType}|${canonicalJson({ c: opts.content })}`;
}

// ─── Vague-goal clarification gate ─────────────────────────────────────────────
// Single source of truth for "this goal needs operator input, not swarm work".
// Posted exactly once per orchestrateGoal call.
const VAGUE_GOAL_PATTERN = /^(\s*(report|make report|build report|analy[sz]e|help|do it|do the thing|what now|huh|fix it|figure it out|handle it|take care of it)\s*[.?!]?\s*)$/i;

function isVagueGoal(goal: string, sourceContext?: string | null): boolean {
  if (sourceContext && sourceContext.trim().length > 32) return false;
  const g = goal.trim();
  if (g.length === 0) return true;
  if (VAGUE_GOAL_PATTERN.test(g)) return true;
  if (g.length < 14 && !/\b(make|create|generate|build|write|run|search|find|scrape|send|post|publish|delete|update|call|invoke|deploy|open|push|merge|close|schedule|launch|start|stop|test|verify|analy[sz]e|extract|parse|list|show|describe|explain|compare|map)\b/i.test(g)) {
    return true;
  }
  return false;
}

const CLARIFICATION_PROMPT =
  "Give me the report topic, purpose, audience, format, sources, length, and deadline.";

// ─── Skipped-directive detection ───────────────────────────────────────────────
// When ABBY's plan or a directive contains skip language, we refuse to dispatch
// an agent command for that directive and only record an audit row.
const SKIP_DIRECTIVE_PATTERN = /\b(NO\s*-\s*|SKIP\b|ROLE\s+CLARIFICATION\b|not\s+required\b|do\s+not\s+execute\b|do\s+not\s+run\b|skip\s+this\b|not\s+needed\b)/i;

function shouldSkipDirective(directive: string): boolean {
  return SKIP_DIRECTIVE_PATTERN.test(directive);
}

type Agent = typeof agentsTable.$inferSelect;

const ABBY_COLOR = "#00e5ff";

/**
 * SYNTHESIS DOCTRINE — the standing contract for how ABBY reports back to the
 * operator after the AURAs finish. Hardened so it applies on EVERY run: every
 * AURA reports its work to ABBY, and ABBY relays the whole team's work to the
 * operator in a peer-to-peer conversational voice, always covering both what was
 * found (Discovery) and what to do with it (Application). A single source of
 * truth (used by the synthesis pass and asserted by tests) so it can't drift.
 */
export const SYNTHESIS_DOCTRINE = `

HOW YOU REPORT BACK (MANDATORY — every run, no exceptions):
Your AURAs are your peers on the swarm. Each one has finished its directive and
reported its real work back to you. Your job now is to relay ALL of it to the
operator in a natural, peer-to-peer conversational voice — like a team lead
walking a colleague through what the team found and what it means — NOT a dry
status dump. Speak as ABBY, using ONLY the AURA results provided.

Always structure the briefing in these three movements:
1. DIRECT ANSWER — answer the operator's goal up front, completely, formatted
   cleanly (markdown tables / lists / code blocks where they help).
2. DISCOVERY — for EACH AURA that contributed, an attributed section: name the
   AURA and walk through what it actually discovered/found — the real result,
   with the evidence and sources it produced. Include AURAs that were blocked or
   returned only partial data; say so plainly and label it UNVERIFIED. Never turn
   "couldn't access it" into "it doesn't exist." The operator must see every
   peer's contribution, not just a verdict.
3. APPLICATION — turn the discovery into action: concrete recommendations, the
   "so what" and the "now what," and how the operator should apply the findings.
   End with the clear next step(s).

This is peer-to-peer: collaborative, specific, and complete — discovery AND
application, every time.

RESOLVE CONFLICTS BY EVIDENCE (do not echo contradictions): when two AURAs
disagree, do NOT present both conclusions as co-equal and leave the operator to
guess. The conclusion backed by a concrete tool result — an HTTP status code with
a returned id/body, a file the tool confirms it wrote — WINS over a bare assertion
or a call that was mis-formed. Example: a AURA that got HTTP 201 with a real
deploy id genuinely deployed; another AURA's 401 from a request sent with no auth
header is its own mistake, not a contradiction — state the deploy succeeded and
note the 401 was an unauthenticated call. Give ONE evidence-based DIRECT ANSWER.`;

/**
 * Max autonomous reasoning/tool steps per AURA directive. Bounded for cost, but
 * set high enough for genuine deep research inside a single directive (broad
 * search → several scrapes → cross-checking multiple independent sources →
 * synthesis) so the exhaustive standard in EXECUTION_DOCTRINE is actually
 * reachable rather than truncated mid-investigation.
 */
const MAX_AGENT_STEPS = 10;

/**
 * Crash/restart recovery. Execution is in-process and fire-and-forget, so a
 * restart mid-run can leave commands/tasks stuck `running` and agents stuck in a
 * non-idle status. On boot we mark those orphans as `interrupted` (NOT `failed` —
 * a deploy/restart killing in-flight work is infrastructure, not an agent
 * failure, and must not pollute the failure view or the failure count) and reset
 * agent status so the dashboard never shows phantom "thinking" agents.
 */
export async function reconcileStaleWork(): Promise<void> {
  try {
    const now = new Date();
    await db
      .update(agentCommandsTable)
      .set({ status: "interrupted", result: "Interrupted by server restart (deploy or redeploy) — not an agent failure.", completedAt: now })
      .where(eq(agentCommandsTable.status, "running"));
    await db
      .update(tasksTable)
      .set({ status: "interrupted", completedAt: now })
      .where(eq(tasksTable.status, "running"));
    await db.update(toolCallsTable).set({ status: "error", completedAt: now }).where(eq(toolCallsTable.status, "running"));
    for (const status of ["thinking", "executing", "waiting"]) {
      await db.update(agentsTable).set({ status: "idle" }).where(eq(agentsTable.status, status));
    }
    logger.info("reconcileStaleWork: marked interrupted orchestration state");
  } catch (err) {
    logger.error({ err }, "reconcileStaleWork failed");
  }
}

// ─── Low-level helpers ───────────────────────────────────────────────────────

/**
 * Non-streaming OpenRouter completion. Returns the assistant text. `maxTokens`
 * defaults to a small budget (planning/review emit short JSON), but callers that
 * produce the operator-facing deliverable (final synthesis) pass a larger budget
 * so a 10/10 answer isn't truncated.
 *
 * Implementation lives in lib/integrations.ts so other modules (notably Hermes)
 * can call the same LLM path with the same routing + tracing.
 */

// ─── Native tool-calling primitives ─────────────────────────────────────────

interface ToolCallReq {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCallReq[];
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | AssistantMessage
  | { role: "tool"; tool_call_id: string; name: string; content: string };

/**
 * One OpenRouter chat turn that may request tools. Returns the raw assistant
 * message (content and/or tool_calls). Falls back to a tool-free call if the
 * model/provider rejects the `tools` parameter.
 */
async function completeChatTurn(
  model: string,
  messages: ChatMessage[],
  tools: Array<Record<string, unknown>>,
): Promise<AssistantMessage> {
  const body: Record<string, unknown> = { model, messages, stream: false, max_tokens: 8000 };
  if (tools.length) {
    body["tools"] = tools;
    body["tool_choice"] = "auto";
  }
  let r = await fetch(llmRouteUrl("/chat/completions"), {
    method: "POST",
    headers: openrouterHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok && tools.length) {
    // Some providers reject function-calling — retry once without tools.
    delete body["tools"];
    delete body["tool_choice"];
    r = await fetch(llmRouteUrl("/chat/completions"), {
      method: "POST",
      headers: openrouterHeaders(),
      body: JSON.stringify(body),
    });
  }
  if (!r.ok) {
    const errText = (await r.text()).slice(0, 200);
    throw new Error(`LLM ${r.status}: ${errText}`);
  }
  const data = (await r.json()) as {
    choices?: Array<{ message?: AssistantMessage }>;
  };
  const msg = data?.choices?.[0]?.message;
  return {
    role: "assistant",
    content: msg?.content ?? null,
    tool_calls: msg?.tool_calls,
  };
}

function summarizeArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 60)}`)
    .join(" ")
    .slice(0, 160);
}

// Loop-guard thresholds. These are soft limits: a smart agent that legitimately
// needs to retry the same call with the same args (e.g. after fixing an auth
// header) can do so up to N times. Beyond N, the orchestrator forces the agent
// to STOP and report — it is stuck and the operator should investigate.
//
//   MAX_CONSECUTIVE_SAME_CALL = how many identical tool calls in a row we
//     tolerate before we cut the run. 3 matches the dedup message ("you
//     already called this — use it or pick a different tool") that the agent
//     is ignoring.
const MAX_CONSECUTIVE_SAME_CALL = 3;

const URL_RE = /https?:\/\/[^\s"')<>]+/i;
function extractUrl(text: string): string | null {
  return text.match(URL_RE)?.[0] ?? null;
}

function isBrowserAgent(agent: Agent): boolean {
  return (
    agent.id === 3 ||
    /crawler|aura-2/i.test(agent.name) ||
    /browser|scrap|crawl|web/i.test(agent.role ?? "")
  );
}

async function postMessage(opts: {
  channelId: number;
  agent?: Agent | null;
  agentId?: number | null;
  agentName?: string | null;
  agentColor?: string | null;
  content: string;
  messageType: string;
}): Promise<void> {
  // Process-local dedupe: same channel + agent + messageType + content hash
  // is suppressed (no DB insert, no operator-visible duplicate).
  const key = stableMessageKey({
    channelId: opts.channelId,
    agentId: opts.agent?.id ?? opts.agentId ?? null,
    agentName: opts.agent?.name ?? opts.agentName ?? null,
    messageType: opts.messageType,
    content: opts.content,
  });
  if (postedMessageKeys.has(key)) {
    logger.debug({ key, messageType: opts.messageType }, "postMessage dedupe hit");
    return;
  }
  postedMessageKeys.add(key);
  // Evidence gate (operator directive 2026-06-27 18:46): never persist raw
  // tool-call markup or malformed JSON to the operator chat stream. If the
  // upstream assistant output leaked provider tool tokens, log + drop the
  // message and return a corrective error to the model so it retries.
  const gate = runEvidenceGate(opts.content);
  if (gate.blocked) {
    logger.warn(
      {
        messageType: opts.messageType,
        patterns: gate.toolCallMarkupFound,
        fragment: opts.content.slice(0, 200),
      },
      "evidence gate blocked: tool-call markup leaked into operator output",
    );
    return; // do NOT save the contaminated content
  }
  // Persist the sanitized text + (if the answer was over the safe UI length
  // OR truncated mid-sentence) post a separate executive summary message so
  // the operator still sees the headline finding.
  const persistedContent = gate.safeText || opts.content;
  await db.insert(messagesTable).values({
    channelId: opts.channelId,
    agentId: opts.agent?.id ?? opts.agentId ?? null,
    agentName: opts.agent?.name ?? opts.agentName ?? null,
    agentColor: opts.agent?.color ?? opts.agentColor ?? null,
    content: persistedContent,
    messageType: opts.messageType,
  });
  if (gate.autoArtifact.shouldArtifact && gate.executiveSummary) {
    postedMessageKeys.add(stableMessageKey({
      channelId: opts.channelId,
      agentId: opts.agent?.id ?? opts.agentId ?? null,
      agentName: opts.agent?.name ?? opts.agentName ?? null,
      messageType: "executive_summary",
      content: gate.executiveSummary,
    }));
    await db.insert(messagesTable).values({
      channelId: opts.channelId,
      agentId: opts.agent?.id ?? opts.agentId ?? null,
      agentName: opts.agent?.name ?? opts.agentName ?? null,
      agentColor: opts.agent?.color ?? opts.agentColor ?? null,
      content: `[Full report auto-saved as artifact — showing executive summary]\n\n${gate.executiveSummary}`,
      messageType: "executive_summary",
    });
  }
  if (gate.malformedJson.length > 0) {
    logger.warn(
      { count: gate.malformedJson.length, first: gate.malformedJson[0] },
      "evidence gate: malformed JSON detected in assistant output",
    );
  }
  if (gate.pricingConfusion.length > 0) {
    logger.warn(
      { count: gate.pricingConfusion.length, sentences: gate.pricingConfusion },
      "evidence gate: CPC/CPL unit confusion detected — review synthesis",
    );
  }
}

// ─── Single-command execution ────────────────────────────────────────────────

/**
 * Execute one already-created command end-to-end as a genuinely autonomous,
 * tool-using agent:
 *  - The AURA reasons over the directive with its real OpenRouter model.
 *  - It decides for itself which of its permitted tools to call (web_scrape,
 *    web_screenshot, http_request, code_exec, memory_write, memory_search) via
 *    native function-calling, in a bounded loop (MAX_AGENT_STEPS).
 *  - Every tool call, monologue line, tool_output message, and the final result
 *    are persisted so the live dashboard reflects real multi-step work.
 *
 * Returns the agent's final reported result text (used by ABBY's coordinator).
 */
export async function executeAgentCommand(opts: {
  commandId: number;
  agent: Agent;
  command: string;
  payload: string | null;
  channelId: number;
  sourceContext?: string | null;
  runKey?: string | null;
}): Promise<string> {
  const { commandId, agent, command, payload, channelId, sourceContext, runKey } = opts;
  // Grounding proof: prove the operator's source material reached this AURA
  // (length + hash only, never the raw content). Persisted for the Dispatch panel.
  const proof = groundingProof(sourceContext);
  const dispatchModel = resolveModel(agent.id, agent.model, undefined);
  logger.info({ aura: agent.name, model: dispatchModel, ...proof }, "aura dispatch grounding");
  let taskId: number | null = null;
  try {
    await db
      .update(agentCommandsTable)
      .set({ status: "running", model: dispatchModel, groundingChars: proof.chars, groundingHash: proof.hash || null })
      .where(eq(agentCommandsTable.id, commandId));
    await db.update(agentsTable).set({ status: "thinking" }).where(eq(agentsTable.id, agent.id));

    const [task] = await db
      .insert(tasksTable)
      .values({
        title: command.slice(0, 140),
        description: payload ?? null,
        agentId: agent.id,
        agentName: agent.name,
        status: "running",
        priority: "high",
        progress: 10,
        channelId,
      })
      .returning();
    taskId = task?.id ?? null;

    await db.insert(monologueLinesTable).values({
      agentId: agent.id,
      text: `Directive received: ${command}`,
      type: "thought",
    });

    const ctx: ToolContext = { agentId: agent.id, agentName: agent.name, agentColor: agent.color, channelId, runKey: runKey ?? null };
    const toolNames = getToolNamesForAgent(agent.id);
    const tools = getOpenAiToolsForAgent(agent.id);

    // ── Feature 2: Proactive Skill Injection ─────────────────────────────────
    // Match this directive against Hermes' library of proven skill patterns.
    // If we find an active skill (score >= 0.7), inject a hint block into the
    // system prompt so the agent starts with the known-good tool sequence
    // rather than rediscovering it from scratch on every run.
    const skillMatch = await matchSkillForGoal(command).catch(() => null);
    const skillHint = skillMatch && skillMatch.successScore >= 0.7
      ? `\n\nHERMES SKILL HINT (proven pattern — follow this first):\nSkill: "${skillMatch.name}" · ${skillMatch.description}\nSuccess rate: ${Math.round(skillMatch.successScore * 100)}% · Match: ${skillMatch.matchReason}\nUse this known-good pattern before trying a novel approach.`
      : "";

    // Convenience pre-scrape: if the browser AURA is handed a URL, fetch it once
    // up front so it starts the loop with live data (it can still call more tools).
    let priming = "";
    const url = extractUrl(`${command} ${payload ?? ""}`);
    if (url && isBrowserAgent(agent) && process.env["STEEL_API_KEY"]) {
      const [tc] = await db
        .insert(toolCallsTable)
        .values({ agentId: agent.id, toolName: "web_scrape", args: JSON.stringify({ url }), status: "running" })
        .returning();
      try {
        const scraped = sanitizeForStorage((await steelScrape(url)).slice(0, 6000));
        priming = scraped;
        await db
          .update(toolCallsTable)
          .set({ status: "success", result: scraped.slice(0, 4000), completedAt: new Date() })
          .where(eq(toolCallsTable.id, tc.id));
        await postMessage({
          channelId,
          agent,
          content: `web_scrape("${url}")\n\n${scraped.slice(0, 1400)}${scraped.length > 1400 ? "\n…" : ""}`,
          messageType: "tool_output",
        });
        if (taskId) await db.update(tasksTable).set({ progress: 35 }).where(eq(tasksTable.id, taskId));
      } catch (e) {
        await db
          .update(toolCallsTable)
          .set({ status: "error", result: String(e).slice(0, 1000), completedAt: new Date() })
          .where(eq(toolCallsTable.id, tc.id));
      }
    }

    // ── Autonomous reasoning + tool loop ──
    const model = resolveModel(agent.id, agent.model, undefined);
    const persona =
      AGENT_PERSONAS[agent.id] ??
      `You are ${agent.name}, an autonomous agent of the ABBY AURA swarm. Execute directives precisely.`;
    const toolGuide = toolNames.length
      ? `\n\nYou are an autonomous tool-using agent. Call tools to gather real data and perform real work instead of guessing — chain multiple calls when needed, and avoid repeating a call that already returned (it wastes time and budget). ON TOOL ERROR: search memory_search first, then web_search/jina_read for the fix — never give up on the first failure. When the directive is fully satisfied, stop calling tools and reply with your final concrete result (no preamble).${buildCapabilityCard(agent.id)}`
      : "";
    const _agentPersonality = readSettings().systemPersonality?.trim() ?? "";
    const system = (_agentPersonality ? _agentPersonality + "\n\n" : "") + persona + toolGuide + skillHint + EXECUTION_DOCTRINE + RESEARCH_PLAYBOOKS + ANTI_HALLUCINATION_DIRECTIVE + SWARM_SAFETY_RULES + CODING_LIFECYCLE_DOCTRINE + ERROR_RECOVERY_DOCTRINE + (await buildVaultCard());

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      {
        role: "user",
        content:
          `Directive from ABBY (orchestrator): ${command}\n${payload ? `Payload: ${payload}\n` : ""}` +
          (sourceContext && sourceContext.trim()
            ? `\nOPERATOR-PROVIDED SOURCE MATERIAL — this is your primary input. Build directly from it; do NOT memory_search for it (it is right here):\n"""\n${sourceContext.slice(0, 30000)}\n"""\n`
            : "") +
          (priming ? `\nLive page content already retrieved for you:\n"""\n${priming}\n"""\n` : "") +
          `\nExecute the directive now. Use your tools for anything requiring real data or computation.`,
      },
    ];

    let finalText = "";
    let steps = 0;
    // Cache of identical tool calls made during THIS run, so a repeated
    // (tool + exact args) call reuses its result instead of re-billing the
    // external API and re-spending tokens — a frequent, costly agent loop.
    const callCache = new Map<string, string>();
    const callHistory: string[] = []; // ordered log of call keys for loop detection
    while (steps < MAX_AGENT_STEPS) {
      steps++;
      const assistant = await completeChatTurn(model, messages, tools);
      const calls = assistant.tool_calls ?? [];

      if (calls.length === 0) {
        finalText = (assistant.content ?? "").trim();
        break;
      }

      // Parse each tool call's arguments up front. Models (esp. Qwen) sometimes
      // emit a tool call whose `function.arguments` is truncated/invalid JSON when
      // the intended output is large (code, HTML decks, save_artifact content).
      // If that raw string is pushed back into the message history, the provider
      // rejects the NEXT turn with `400 InternalError.Algo.InvalidParameter
      // (function.arguments)` — or we throw `SyntaxError: Unexpected end of JSON
      // input` locally — and the whole directive hard-fails. So we normalize every
      // recorded call to GUARANTEED-valid JSON, and flag the truncated ones so the
      // model retries with smaller output instead of poisoning the conversation.
      const parsed = calls.map((call) => {
        let args: Record<string, unknown> = {};
        let truncated = false;
        const raw = call.function?.arguments;
        if (raw) {
          try {
            args = JSON.parse(raw);
          } catch {
            truncated = true;
          }
        }
        return { call, args, truncated };
      });

      // Record the assistant turn with valid argument JSON so a resend never 400s.
      messages.push({
        role: "assistant",
        content: assistant.content ?? "",
        tool_calls: parsed.map(({ call, args }): ToolCallReq => ({
          id: call.id,
          type: "function",
          function: { name: call.function.name, arguments: JSON.stringify(args) },
        })),
      });
      await db.update(agentsTable).set({ status: "executing" }).where(eq(agentsTable.id, agent.id));

      for (const { call, args: parsedArgs, truncated } of parsed) {
        const name = call.function?.name ?? "unknown";

        let toolResult: string;
        let ok = true;
        let auditStatus: "running" | "success" | "error" | "deduped" = "running";
        const callKey = toolCallKey(commandId, name, parsedArgs);
        let isReusedAudit = false;

        // Action monologue line: emitted once per call, before we decide
        // whether the call is fresh, deduplicated, or rejected by the payload
        // budget. Gives the operator dashboard a visible "agent acted" trace.
        await db.insert(monologueLinesTable).values({
          agentId: agent.id,
          text: `${name}(${summarizeArgs(parsedArgs)})`,
          type: "action",
        });

        if (truncated) {
          // The model's arguments were truncated/invalid JSON (usually too large
          // for one turn). Don't run with empty args — tell it to retry smaller.
          ok = false;
          auditStatus = "error";
          toolResult = `error: your ${name} call was dropped — its arguments were truncated/invalid JSON, almost always because the content was too large for a single turn. Retry ${name} with smaller arguments: write the file/code in sections, or shorten the payload.`;
        } else if (callCache.has(callKey)) {
          // Identical call already executed this run — reuse it, don't pay again.
          ok = true;
          isReusedAudit = true;
          auditStatus = "deduped";
          toolResult = `(deduplicated: you already called ${name} with these exact arguments earlier in this run. Reusing that result — do not repeat it. Use it, or call a different tool / different arguments.)\n\n${callCache.get(callKey)}`;
        } else {
          // Payload budget check BEFORE runTool — refuse oversized args so the
          // upstream API doesn't truncate / drop / 413 us mid-flight. The agent
          // gets a chunk-the-operation error it can act on.
          const budget = checkToolPayloadBudget(name, parsedArgs);
          if (!budget.ok) {
            ok = false;
            auditStatus = "error";
            toolResult = budget.error;
            callHistory.push(callKey);
            const [tc] = await db
              .insert(toolCallsTable)
              .values({ agentId: agent.id, toolName: name, args: JSON.stringify(parsedArgs).slice(0, 2000), status: "error", result: toolResult.slice(0, 4000), completedAt: new Date() })
              .returning();
            await db.insert(monologueLinesTable).values({
              agentId: agent.id,
              text: `${name} rejected: ${budget.error.slice(0, 200)}`,
              type: "system",
            });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name,
              content: toolResult,
            });
            continue;
          }
          // Loop guard: count how many of THIS agent's recent consecutive calls
          // are identical. After MAX_CONSECUTIVE_SAME_CALL hits we cut the run
          // and tell the agent it is stuck — the operator needs to inspect the
          // failure, not let the agent keep racking up identical requests that
          // return the same error every time. This protects both cost and the
          // upstream service we're hammering (e.g. Tavily, Composio, GitHub).
          let recentSame = 0;
          for (let i = callHistory.length - 1; i >= 0; i--) {
            if (callHistory[i] === callKey) recentSame++;
            else break;
          }
          if (recentSame >= MAX_CONSECUTIVE_SAME_CALL) {
            ok = false;
            toolResult = `error: loop guard — you have called ${name} with these EXACT arguments ${recentSame + 1} times in a row and each call returned the same result. You are stuck. STOP calling this tool. Switch tools, change your arguments, or report a final answer to the operator describing what you tried and what blocked you. The orchestrator is closing this directive.`;
            callHistory.push(callKey); // record so subsequent identical calls stay blocked
          } else {
            try {
              toolResult = await runTool(name, parsedArgs, ctx);
              if (toolResult.startsWith("error:")) ok = false;
            } catch (e) {
              ok = false;
              toolResult = `error: ${String(e).slice(0, 300)}`;
            }
            callHistory.push(callKey);
            if (ok) callCache.set(callKey, toolResult);
          }
        }

        // Audit row: insert for new runs, skip for deduped (no new execution),
        // status reflects outcome.
        if (isReusedAudit) {
          // The cached result row already exists; no new insert, no duplicate
          // tool_output post. Push the result into messages so the LLM can
          // continue reasoning, but do NOT spam the operator channel.
          messages.push({ role: "tool", tool_call_id: call.id, name, content: toolResult.slice(0, 6000) });
          continue;
        }
        const [tc] = await db
          .insert(toolCallsTable)
          .values({ agentId: agent.id, toolName: name, args: JSON.stringify(parsedArgs).slice(0, 2000), status: auditStatus, result: toolResult.slice(0, 4000), completedAt: new Date() })
          .returning();
        // Keep tc.id used downstream for legacy update callers; nothing else
        // references it now that the update was folded into the insert.
        void tc;
        await db.insert(monologueLinesTable).values({
          agentId: agent.id,
          text: ok ? `${name} → ${toolResult.slice(0, 200)}` : `${name} failed: ${toolResult.slice(0, 200)}`,
          type: ok ? "result" : "system",
        });
        await postMessage({
          channelId,
          agent,
          content: `${name}(${summarizeArgs(parsedArgs)})\n\n${toolResult.slice(0, 1400)}${toolResult.length > 1400 ? "\n…" : ""}`,
          messageType: "tool_output",
        });

        messages.push({ role: "tool", tool_call_id: call.id, name, content: toolResult.slice(0, 6000) });
      }

      if (taskId) {
        const progress = Math.min(90, 35 + steps * 12);
        await db.update(tasksTable).set({ progress }).where(eq(tasksTable.id, taskId));
      }
      await db.update(agentsTable).set({ status: "thinking" }).where(eq(agentsTable.id, agent.id));
    }

    // If the loop hit the step cap mid-tool-use, force a final summary turn.
    if (!finalText) {
      messages.push({
        role: "user",
        content: "Step budget reached. Stop using tools and give your final concrete result now based on what you have.",
      });
      const wrap = await completeChatTurn(model, messages, []);
      finalText = (wrap.content ?? "").trim();
    }
    if (!finalText) finalText = "(no result produced)";

    await postMessage({ channelId, agent, content: finalText, messageType: "agent" });

    await db
      .update(agentCommandsTable)
      .set({ status: "done", result: finalText.slice(0, 4000), completedAt: new Date() })
      .where(eq(agentCommandsTable.id, commandId));
    if (taskId) {
      await db
        .update(tasksTable)
        .set({ status: "completed", progress: 100, completedAt: new Date() })
        .where(eq(tasksTable.id, taskId));
    }
    await db.insert(monologueLinesTable).values({
      agentId: agent.id,
      text: `Directive complete after ${steps} step${steps === 1 ? "" : "s"}. Result reported to ABBY.`,
      type: "conclusion",
    });
    return finalText;
  } catch (err) {
    logger.error({ err, commandId, agentId: agent.id }, "executeAgentCommand failed");
    await db
      .update(agentCommandsTable)
      .set({ status: "failed", result: String(err).slice(0, 2000), completedAt: new Date() })
      .where(eq(agentCommandsTable.id, commandId))
      .catch(() => {});
    if (taskId) {
      await db
        .update(tasksTable)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(tasksTable.id, taskId))
        .catch(() => {});
    }
    await postMessage({
      channelId,
      agent,
      content: `Execution failed: ${String(err).slice(0, 300)}`,
      messageType: "system",
    }).catch(() => {});
    // Report the failure back to ABBY rather than returning nothing — a blocked
    // AURA must still appear (honestly, as UNVERIFIED) in ABBY's final briefing,
    // never silently drop out of the team's reported work.
    return `⚠️ ${agent.name} could not complete its directive (UNVERIFIED — blocked or errored): ${String(err).slice(0, 300)}`;
  } finally {
    await db
      .update(agentsTable)
      .set({ status: "idle" })
      .where(eq(agentsTable.id, agent.id))
      .catch(() => {});
  }
}

// ─── Goal orchestration ──────────────────────────────────────────────────────

interface Directive {
  agentId: number;
  directive: string;
}

function parseDirectives(raw: string, auras: Agent[]): Directive[] {
  const ids = new Set(auras.map((c) => c.id));
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown[];
      const out: Directive[] = [];
      for (const item of parsed) {
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          const agentId = Number(rec["agentId"]);
          const directive = String(rec["directive"] ?? "").trim();
          if (ids.has(agentId) && directive) out.push({ agentId, directive });
        }
      }
      if (out.length) return out.slice(0, 5);
    } catch {
      // fall through to fallback
    }
  }
  return [];
}

/**
 * Create command rows for a set of directives and run the target AURAs'
 * autonomous loops CONCURRENTLY — they are independent agents and execute in
 * parallel, like a real swarm. Each AURA persists its own feed/tool/task rows
 * as it works, so the dashboard fills in live and interleaved. Returns each
 * AURA's final result for ABBY's coordinator review. Honors pause at launch.
 */
async function dispatchDirectives(
  directives: Directive[],
  auras: Agent[],
  channelId: number,
  priority: string,
  abby: Agent | null,
  sourceContext?: string | null,
  runKey?: string | null,
): Promise<Array<{ name: string; result: string }>> {
  if (isSwarmPaused()) {
    await postMessage({
      channelId,
      agentId: ABBY_ID,
      agentName: "ABBY",
      agentColor: abby?.color ?? ABBY_COLOR,
      content: "SWARM is paused. Directives were not dispatched.",
      messageType: "system",
    });
    return [];
  }

  const runs = directives.map(async (d): Promise<{ name: string; result: string } | null> => {
    const agent = auras.find((c) => c.id === d.agentId);
    if (!agent) return null;

    // Skip-directive guard: if the directive itself is a NO-/SKIP/ROLE
    // CLARIFICATION/role-rejection line, do NOT create an agent command,
    // do NOT run tools for it, and do NOT dispatch a result. Record an
    // audit row only if the schema accepts a "skipped" status (it does via
    // the agent_commands.status enum); otherwise just omit.
    if (shouldSkipDirective(d.directive)) {
      try {
        await db.insert(agentCommandsTable).values({
          fromAgentId: ABBY_ID,
          toAgentId: agent.id,
          command: d.directive,
          payload: null,
          priority,
          status: "skipped",
        });
      } catch {
        // If the schema disallows "skipped", just omit the audit row.
      }
      await postMessage({
        channelId,
        agentId: ABBY_ID,
        agentName: "ABBY",
        agentColor: abby?.color ?? ABBY_COLOR,
        content: `→ ${agent.name}: SKIPPED — directive is a no-op / role clarification. No tools will run for this AURA.`,
        messageType: "system",
      }).catch(() => {});
      return { name: agent.name, result: "(skipped: directive was a NO-/SKIP/role-clarification line)" };
    }

    const [cmd] = await db
      .insert(agentCommandsTable)
      .values({
        fromAgentId: ABBY_ID,
        toAgentId: agent.id,
        command: d.directive,
        payload: null,
        priority,
        status: "queued",
      })
      .returning();
    if (!cmd) return null;
    const result = await executeAgentCommand({
      commandId: cmd.id,
      agent,
      command: d.directive,
      payload: null,
      channelId,
      sourceContext,
      runKey,
    });
    return { name: agent.name, result };
  });

  const settled = await Promise.all(runs);
  return settled.filter((r): r is { name: string; result: string } => r !== null);
}

/**
 * ABBY decomposes an operator goal and dispatches real directives to the AURAs,
 * each of which actually executes. Runs sequentially so the feed reads naturally.
 */
export async function orchestrateGoal(opts: {
  goal: string;
  channelId: number;
  priority: string;
  sourceContext?: string | null;
  /**
   * Force the whole goal onto a SINGLE agent as ONE directive (no multi-AURA
   * decomposition). Used for connected-account/Composio actions: only ABBY/AURA-4/
   * AURA-5 hold the Composio tools, and the goal must run exactly once — fanning
   * it out duplicated work (e.g. published an Instagram post twice) and routed
   * slices to agents that can't act on it.
   */
  forceAgentId?: number;
}): Promise<void> {
  const { goal, channelId, priority, sourceContext, forceAgentId } = opts;
  const startedAt = new Date();
  // Unique key for this orchestration run — scopes swarm_broadcast/swarm_read messages
  // and correlates all concurrent AURA executions to the same bus partition.
  const runKey = `ch${channelId}-${startedAt.getTime().toString(36)}`;
  // Clear the agent working scratchpad so the UI shows fresh reasoning for this task.
  scratchClear(channelId);
  // Declare finalAnswer at the top of the function so every exit path (early
  // return on clarification, swarm paused, no directives, post-dispatch catch,
  // etc.) has a defined value to pass to recordOutcome() and ensureFinalAnswer().
  // Combined with the runtimeGuards installFinalAnswerCrashGuard() at module
  // load, this means a ReferenceError on `finalAnswer` is no longer possible.
  let finalAnswer = "";
  let didPostFinalAnswer = false;
  logger.info({ phase: "abby-planning", ...groundingProof(sourceContext) }, "orchestration grounding");
  void sendInngestEvent("swarm/goal.received", { goal, channelId, priority });

  // ── Vague-goal clarification gate ──
  // Generic one-word goals ("report", "help", "do it") with no sourceContext
  // cannot be decomposed into actionable AURA directives. Post ONE consolidated
  // clarification and return — do NOT spin up the swarm, do NOT create artifact
  // files, do NOT repeatedly call memory_search.
  if (isVagueGoal(goal, sourceContext)) {
    await postMessage({
      channelId,
      agentId: ABBY_ID,
      agentName: "ABBY",
      agentColor: ABBY_COLOR,
      content: `Clarification needed before I dispatch the swarm.\n\n${CLARIFICATION_PROMPT}\n\n(Your goal "${goal.trim()}" doesn't tell me what to do — give me specifics and I'll run the full swarm.)`,
      messageType: "agent",
    }).catch((err) => logger.warn({ err }, "vague-goal clarification post failed"));
    void sendInngestEvent("swarm/goal.clarification_requested", { goal, channelId, reason: "vague" });
    void recordOutcome({
      goal,
      channelId,
      outcome: "interrupted",
      auraReports: [],
      toolCalls: [],
      finalAnswer: ensureFinalAnswer("", [`Clarification requested for vague goal: "${goal.trim()}".`]),
      durationMs: undefined,
      startedAt,
      completedAt: new Date(),
    });
    return;
  }

  try {
    const agents = await db.select().from(agentsTable);
    const abby = agents.find((a) => a.id === ABBY_ID) ?? null;
    const auras = agents.filter((a) => a.id !== ABBY_ID);

    if (isSwarmPaused()) {
      await postMessage({
        channelId,
        agentId: ABBY_ID,
        agentName: "ABBY",
        agentColor: abby?.color ?? ABBY_COLOR,
        content: "SWARM is paused. Resume the swarm to execute directives.",
        messageType: "system",
      });
      return;
    }

    await db.update(agentsTable).set({ status: "thinking" }).where(eq(agentsTable.id, ABBY_ID));

    // ABBY decomposes the goal into per-AURA directives.
    const roster = auras
      .map((c) => `${c.id}=${c.name} (${c.role ?? "agent"})`)
      .join(", ");
    // ── Feature 1 + 2: Recall postmortem & skill match for ABBY's planning ─────
    // If a prior run for this goal failed, inject the diagnosed root causes so
    // ABBY's planner avoids the same decomposition that failed last time.
    const [priorPostmortem, planSkill] = await Promise.all([
      recallPostmortem(goal).catch(() => null),
      matchSkillForGoal(goal).catch(() => null),
    ]);
    const postmortemNote = priorPostmortem
      ? `\n\nPRIOR FAILURE POSTMORTEM (a previous run of this goal failed — avoid these patterns):\nRoot causes: ${priorPostmortem.rootCauses.join("; ")}\nAvoid: ${priorPostmortem.avoidPatterns.join("; ")}\nRevised approach for this run: ${priorPostmortem.revisedApproach}`
      : "";
    const planSkillNote = planSkill && planSkill.successScore >= 0.7
      ? `\n\nHERMES SKILL MATCH (proven pattern at ${Math.round(planSkill.successScore * 100)}% success): "${planSkill.name}" — ${planSkill.description}. Route to AURA #${planSkill.preferredAura ?? "any"} if relevant.`
      : "";

    const _planPersonality = readSettings().systemPersonality?.trim() ?? "";
    const planSystem = (_planPersonality ? _planPersonality + "\n\n" : "") + (AGENT_PERSONAS[ABBY_ID] ?? "You are ABBY, the swarm orchestrator.") + postmortemNote + planSkillNote + EXECUTION_DOCTRINE + RESEARCH_PLAYBOOKS + SWARM_SAFETY_RULES + CODING_LIFECYCLE_DOCTRINE + (await buildVaultCard());
    const planUser = `Operator goal: "${goal}"
${sourceContext && sourceContext.trim() ? `\nThe operator provided this source material to work from (decompose against THIS; the AURAs will receive it too — do not tell them to search memory for it):\n"""\n${sourceContext.slice(0, 12000)}\n"""\n` : ""}
Available AURAs you command: ${roster}.

Decompose this goal into precise, exhaustive, granular directives — ONE per AURA that is genuinely relevant (skip AURAs that add nothing). Together the directives must cover EVERY part of the goal; leave nothing implied. Each directive MUST be:
- SELF-CONTAINED: state the exact objective, the concrete inputs/targets (specific https:// URLs, API endpoints, file names, or data), and the expected output and its format. Assume the AURA sees ONLY this directive — no other context.
- GRANULAR & CONCLUSIVE: spell out the steps and the DEFINITION OF DONE — what the finished deliverable must contain for that part of the goal to count as fully met (a 10/10, shippable result, not a draft or outline).
- EVIDENCE-DRIVEN: for any research/web/competitor work, route to the browser AURA, include concrete starting https:// URLs, and require it to cross-check key facts across multiple independent sources rather than stopping at the first hit. For code, route to the code AURA and require it to actually run/verify the code, not just write it.

Respond with ONLY a JSON array (no prose, no code fences) of objects shaped: {"agentId": <number>, "directive": "<single, fully-specified instruction>"}. Maximum 5 directives.`;

    const model = resolveModel(ABBY_ID, abby?.model, undefined);

    // Single-agent path: dispatch the whole goal as ONE directive to the forced
    // agent (must be a real AURA). Skips ABBY's multi-directive planning entirely
    // so the action runs exactly once on a capable agent.
    let directives: Directive[];
    if (forceAgentId && auras.some((c) => c.id === forceAgentId)) {
      directives = [{ agentId: forceAgentId, directive: goal }];
    } else {
      const planRaw = await completeChat(model, planSystem, planUser);
      directives = parseDirectives(planRaw, auras);
    }

    // Fallback: if ABBY didn't return parseable directives, route the raw goal
    // to the most relevant single AURA (browser if a URL is present, else AURA-1).
    if (directives.length === 0) {
      const url = extractUrl(goal);
      const fallback =
        (url ? auras.find((c) => isBrowserAgent(c)) : null) ??
        auras.find((c) => c.id === 2) ??
        auras[0];
      if (fallback) directives = [{ agentId: fallback.id, directive: goal }];
    }

    await db.update(agentsTable).set({ status: "idle" }).where(eq(agentsTable.id, ABBY_ID));

    await postMessage({
      channelId,
      agentId: ABBY_ID,
      agentName: "ABBY",
      agentColor: abby?.color ?? ABBY_COLOR,
      content: directives.length
        ? `Orchestrating: "${goal}"\n\n` +
          directives
            .map((d) => {
              const c = auras.find((x) => x.id === d.agentId);
              return `→ ${c?.name ?? `agent#${d.agentId}`}: ${d.directive}`;
            })
            .join("\n")
        : `No actionable directives could be derived from: "${goal}"`,
      messageType: "agent",
    });

    // Dispatch + execute the first round of directives for real.
    const results: Array<{ name: string; result: string }> = await dispatchDirectives(
      directives,
      auras,
      channelId,
      priority,
      abby,
      sourceContext,
      runKey,
    );

    // ── ABBY coordinator pass ──
    // ABBY reviews the AURAs' real results and, if the goal isn't fully met,
    // issues ONE bounded follow-up round before committing.
    if (results.length && !isSwarmPaused() && !forceAgentId) {
      await db.update(agentsTable).set({ status: "thinking" }).where(eq(agentsTable.id, ABBY_ID));
      const reviewUser = `Operator goal: "${goal}"

Round 1 AURA results:
${results.map((r) => `- ${r.name}: ${r.result.slice(0, 500)}`).join("\n")}

First, internally assess which parts of the goal are VERIFIED by the real tool output above versus still missing, unverified, or only assumed — judge only on evidence actually present in the results, never on work no result shows. Do this reasoning silently; do not write it out.

Then, if every part of the goal is verified and complete, respond with exactly: []
Otherwise respond with ONLY a JSON array (no prose, no code fences) of up to 2 follow-up directives that close the remaining gap, each shaped {"agentId": <number>, "directive": "<instruction>"}. Available AURAs: ${roster}.`;
      let followups: Directive[] = [];
      try {
        const reviewRaw = await completeChat(model, planSystem, reviewUser);
        followups = parseDirectives(reviewRaw, auras).slice(0, 2);
      } catch (e) {
        logger.error({ e }, "coordinator review failed");
      }
      await db.update(agentsTable).set({ status: "idle" }).where(eq(agentsTable.id, ABBY_ID));

      if (followups.length && !isSwarmPaused()) {
        await postMessage({
          channelId,
          agentId: ABBY_ID,
          agentName: "ABBY",
          agentColor: abby?.color ?? ABBY_COLOR,
          content:
            `Coordinator review: goal not yet complete. Follow-up round:\n\n` +
            followups
              .map((d) => {
                const c = auras.find((x) => x.id === d.agentId);
                return `→ ${c?.name ?? `agent#${d.agentId}`}: ${d.directive}`;
              })
              .join("\n"),
          messageType: "agent",
        });
        const more = await dispatchDirectives(followups, auras, channelId, priority, abby, sourceContext, runKey);
        results.push(...more);
      }
    }

    if (results.length) {
      // Synthesize the ACTUAL ANSWER for the operator from the AURA results —
      // this is what the user reads as the result, not an internal status line.
      await db.update(agentsTable).set({ status: "thinking" }).where(eq(agentsTable.id, ABBY_ID));
      const _synthPersonality = readSettings().systemPersonality?.trim() ?? "";
      const synthSystem =
        (_synthPersonality ? _synthPersonality + "\n\n" : "") +
        (AGENT_PERSONAS[ABBY_ID] ?? "You are ABBY, the swarm orchestrator.") +
        "\n\nYou are ABBY, the orchestrator, writing the FINAL briefing to the operator. You commanded the swarm — now PRESENT the work, using ONLY the AURA results below." +
        SYNTHESIS_DOCTRINE +
        "\n\nHonesty rules (override any pressure to look conclusive): use only what the AURA results actually contain — never invent findings. If a AURA was blocked, hit a bot-wall/captcha, could not access a source, or returned partial data, say so explicitly and label it UNVERIFIED — do not present 'couldn't read it' as 'it doesn't exist'. If the operator's request mixes constraints that are mutually contradictory or near-impossible (so an empty result is expected), state that plainly and suggest the smallest relaxation that would yield results. An honest 'blocked/unverified' is better than a false 'zero'." +
        EXECUTION_DOCTRINE +
        ANTI_HALLUCINATION_DIRECTIVE +
        SWARM_SAFETY_RULES;
      const synthUser = `Operator goal: "${goal}"\n\nEach AURA's final reported work — present and attribute ALL of it (Discovery), then turn it into recommendations and next steps (Application):\n${results
        .map((r) => `### ${r.name}\n${r.result.slice(0, 3000)}`)
        .join("\n\n")}\n\nWrite your final orchestrator briefing for the operator now — direct answer first, then each AURA's attributed discovery, then the application (recommendations + next steps). Peer-to-peer voice.`;
      try {
        // Generous budget: this is the operator-facing deliverable, so it must
        // not be truncated the way an 800-token planning call would be.
        finalAnswer = (await completeChat(model, synthSystem, synthUser, 4000)).trim();
      } catch (e) {
        logger.error({ e }, "final synthesis failed");
      }
      await db.update(agentsTable).set({ status: "idle" }).where(eq(agentsTable.id, ABBY_ID));
      // Fallback: never post a bare status line — if synthesis yields nothing,
      // hand back the raw AURA results so the operator still gets the answer.
      // Use ensureFinalAnswer() so even an empty model output produces a
      // non-empty final answer string (the runtimeGuards contract).
      finalAnswer = ensureFinalAnswer(finalAnswer, [
        results.map((r) => `**${r.name}:**\n${r.result.slice(0, 1500)}`).join("\n\n"),
      ]);
      // Output sanitation gate: detect CJK / known contamination fragments,
      // fall back to raw AURA results if the synthesis is contaminated.
      if (hasUnexpectedScript(finalAnswer, "en")) {
        logger.warn({ goal }, "final answer contained unexpected script — falling back to raw AURA results");
        const fallback = results.map((r) => `**${r.name}:**\n${r.result.slice(0, 1500)}`).join("\n\n");
        finalAnswer = `UNVERIFIED_OUTPUT_CONTAMINATION: synthesis stream contained unexpected script. Showing raw AURA results instead:\n\n${sanitizeFinalOutput(fallback)}`;
      } else {
        finalAnswer = sanitizeFinalOutput(finalAnswer);
      }
      await postMessage({
        channelId,
        agentId: ABBY_ID,
        agentName: "ABBY",
        agentColor: abby?.color ?? ABBY_COLOR,
        content: finalAnswer,
        messageType: "agent",
      });
      didPostFinalAnswer = true;
    }
    void sendInngestEvent("swarm/goal.completed", {
      goal,
      channelId,
      auraReports: results.length,
      results: results.map((r) => ({ name: r.name, result: r.result.slice(0, 500) })),
    });

    // Hermes runtime hook — record this session for closed-loop learning.
    // Best-effort; never throws, never blocks the operator reply.
    // outcome status is mapped HONESTLY from observable facts:
    //   success  — final answer posted and no critical deliverable failed
    //   partial  — content exists but artifact/tool verification failed
    //   failed   — no useful answer exists
    //   interrupted — explicit early-return paths (clarification, pause, error)
    const outcome: "success" | "partial" | "failed" | "interrupted" =
      didPostFinalAnswer
        ? (finalAnswer.includes("UNVERIFIED_OUTPUT_CONTAMINATION") ? "partial" : "success")
        : results.length > 0
          ? "partial"
          : "failed";
    void recordOutcome({
      goal,
      channelId,
      outcome,
      auraReports: results.map((r) => ({
        agentId: 0,
        name: r.name,
        result: r.result,
        toolCalls: [],
      })),
      toolCalls: [],
      finalAnswer: ensureFinalAnswer(finalAnswer),
      durationMs: undefined,
      startedAt: startedAt,
      completedAt: new Date(),
    });

    // ── Feature 1: Reflexive self-critique on failure ─────────────────────────
    // If the run failed or was contaminated, kick off a background critique so
    // the system builds institutional memory from this failure. The critique is
    // stored in Hermes and injected into future runs of similar goals.
    if (outcome === "failed" || outcome === "partial") {
      void reflexiveCritique({
        goal,
        failureReason: finalAnswer.slice(0, 600) || "no final answer produced",
        auraReports: results.map((r) => ({ name: r.name, result: r.result })),
      }).catch((err) => logger.error({ err }, "orchestrateGoal: reflexive critique failed"));
    }

    // Clean up the ephemeral swarm bus for this run.
    swarmClear(runKey);
  } catch (err) {
    logger.error({ err }, "orchestrateGoal failed");
    void sendInngestEvent("swarm/goal.failed", { goal, channelId, error: String(err).slice(0, 300) });
    const errorAnswer = ensureFinalAnswer("", [
      `Orchestration error: ${String(err).slice(0, 300)}`,
      `Operator goal was: "${goal.trim()}"`,
    ]);
    void recordOutcome({
      goal,
      channelId,
      outcome: "failed",
      auraReports: [],
      toolCalls: [],
      finalAnswer: errorAnswer,
      durationMs: undefined,
      startedAt,
      completedAt: new Date(),
    });
    // Store a postmortem for hard crashes too.
    void reflexiveCritique({ goal, failureReason: String(err).slice(0, 400) }).catch(() => {});
    swarmClear(runKey);
    await db
      .update(agentsTable)
      .set({ status: "idle" })
      .where(eq(agentsTable.id, ABBY_ID))
      .catch(() => {});
    await postMessage({
      channelId,
      agentId: ABBY_ID,
      agentName: "ABBY",
      agentColor: ABBY_COLOR,
      content: errorAnswer,
      messageType: "system",
    }).catch(() => {});
  }
}
