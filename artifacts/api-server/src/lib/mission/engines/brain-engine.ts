import type { EngineAdapter, EngineResult } from "./registry";
import type { MissionStep } from "../types";
import { logger } from "../../logger";

/**
 * Brain engine — meta operations over the Brain itself + final synthesis.
 *
 * Actions:
 *   - "replan"        → acknowledge a re-classification (stub for now)
 *   - "synthesize"    → gather all evidence written to mission memory so far
 *                       and call K2.6 to produce one coherent final answer.
 *                       This is what turns a multi-step scraper mission into
 *                       an actual answer.
 */

// Lightweight shim — we use a function injected at module load so we don't
// create an import cycle with tools.ts.
let _runTool: ((tool: string, args: Record<string, unknown>, ctx: { agentId: number; agentName: string; agentColor: string | null; channelId: number | null }) => Promise<string>) | null = null;
let _completeChat: ((model: string, system: string, user: string, maxTokens?: number) => Promise<string>) | null = null;

export function setBrainToolRunner(fn: typeof _runTool) {
  _runTool = fn;
}
export function setBrainLLM(fn: typeof _completeChat) {
  _completeChat = fn;
}

function toolCtx(missionId: number) {
  return { agentId: 1, agentName: "MissionKernel-Brain", agentColor: "#ff00aa", channelId: null, missionId } as any;
}

const SYNTHESIS_SYSTEM_PROMPT = `You are the synthesis engine of AURA-OMEGA's Mission Kernel. Your job is to take raw evidence gathered by prior mission steps (web search results, scraped pages, memory writes) and produce ONE coherent final answer to the operator's original question.

Rules:
1. Answer the original question directly. Do not list "step 1 did X, step 2 did Y" — that's noise.
2. Consolidate redundant findings. If three sources said the same thing, say it once.
3. Cite sources inline as [1], [2], etc. with a numbered list of URLs at the end.
4. For "how do I" / "how to" / "step by step" questions, output numbered steps the operator can follow.
5. If the evidence doesn't fully answer the question, say so explicitly — never fabricate.
6. Format: short TL;DR (1-3 sentences), then the main body, then numbered source URLs.
7. Tone: direct, technical, no marketing fluff. The operator is a builder.`;

export const brainEngine: EngineAdapter = {
  name: "brain",
  async run(step: MissionStep): Promise<EngineResult> {
    const started = Date.now();
    const action = step.action;

    if (action === "synthesize") {
      const goal = String(step.args.goal ?? "");
      const missionId = Number(step.args.missionId ?? 0);
      const format = String(step.args.format ?? "structured");
      const authoritativeDocs = String(step.args.authoritativeDocs ?? "");
      if (!_runTool || !_completeChat) {
        return {
          ok: false,
          error: "brain engine: runTool or completeChat not wired",
          durationMs: Date.now() - started,
        };
      }
      if (!goal) {
        return { ok: false, error: "synthesize requires goal", durationMs: Date.now() - started };
      }

      try {
        // 1. Pull all evidence written to mission memory for this mission.
        // The mission runtime writes evidence under `mission/<slug>/<step>`,
        // so we search broadly with the goal as query.
        const searchOut = await _runTool(
          "memory_search",
          { query: goal, limit: 30, tags: "mission" },
          { agentId: 1, agentName: "MissionKernel-Brain", agentColor: "#ff00aa", channelId: null },
        );
        const evidenceBlock = searchOut.startsWith("error:") ? "(no prior evidence found)" : searchOut;

        // 2. Build the synthesis prompt. Inject Tier-0/1/2 docs (operator
        // doctrine 2026-06-27) so K2.6 cites primary sources instead of
        // SEO blogs and community forums.
        const docsSection = authoritativeDocs && authoritativeDocs !== "(no Tier-0/1/2 docs matched this goal)"
          ? `\n${authoritativeDocs}\n`
          : "";
        const userMsg = `Original question from operator: "${goal}"

Evidence gathered by prior mission steps:
${evidenceBlock}
${docsSection}
Produce the final synthesized answer now. Cite sources with [1], [2], etc. and a numbered URL list at the end. Prefer official docs over community blogs.`;

        // 3. Call K2.6 to synthesize — highest capability model. ScrapingBee proxy
        // bypasses IP-level rate limits; 402/429 auto-falls-back via completeChat().
        let answer = "";
        try {
          answer = await _completeChat("moonshotai/kimi-k2.6", SYNTHESIS_SYSTEM_PROMPT, userMsg, 4000) ?? "";
        } catch (err1) {
          logger.warn({ err: String(err1).slice(0, 150) }, "synthesize: K2.6 failed, falling back to Llama 3.1 70B");
          answer = await _completeChat("meta/llama-3.1-70b-instruct", SYNTHESIS_SYSTEM_PROMPT, userMsg, 4000) ?? "";
        }

        // 4. Persist final answer to mission memory under a stable key.
        const finalKey = `mission/final-answer/${missionId || "ad-hoc"}`;
        try {
          await _runTool(
            "memory_write",
            {
              key: finalKey,
              content: `Goal: ${goal}\n\n${answer}`,
              tags: "mission,final-answer,synthesis",
            },
            { agentId: 1, agentName: "MissionKernel-Brain", agentColor: "#ff00aa", channelId: null },
          );
        } catch (writeErr) {
          logger.warn({ err: writeErr, missionId }, "synthesize: failed to persist final answer");
        }

        return {
          ok: true,
          output: { kind: "synthesis", goal, answer, length: answer.length },
          evidence: answer.slice(0, 400) + (answer.length > 400 ? "..." : ""),
          durationMs: Date.now() - started,
          facts: { goal, length: answer.length, format, evidenceChars: evidenceBlock.length },
        };
      } catch (err) {
        const errStr = String(err).slice(0, 200);
        // Operator debug 2026-06-27 21:00: capture env state at synthesis
        // failure so we can compare to nvidia-debug endpoint output.
        const envSample = {
          hasPrimary: !!process.env["NVIDIA_API_KEY"],
          primaryPrefix: process.env["NVIDIA_API_KEY"]?.slice(0, 12) ?? "null",
          primaryLength: process.env["NVIDIA_API_KEY"]?.length ?? 0,
        };
        return {
          ok: false,
          error: `${errStr} [envSample=${JSON.stringify(envSample)}]`,
          durationMs: Date.now() - started,
        };
      }
    }

    if (action === "replan" || action === "reclassify") {
      return {
        ok: true,
        output: { kind: "brain-meta", action, args: step.args },
        evidence: `brain step ${action} acknowledged`,
        durationMs: Date.now() - started,
        facts: { action },
      };
    }

    logger.warn({ action }, "brain engine: unknown action");
    return { ok: false, error: `unknown brain action: ${action}`, durationMs: Date.now() - started };
  },
};