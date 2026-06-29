import type { EngineAdapter, EngineResult } from "./registry";
import type { MissionStep } from "../types";
import { logger } from "../../logger";

/**
 * Hermes engine — memory + skill operations.
 *
 * Action vocabulary:
 *   - "memory_search" → calls existing memory_search tool via runTool()
 *   - "memory_write"  → stores a fact/key under a mission key
 *   - "skill_distill" → writes a PROBLEM→SOLUTION skill back to hermes
 *
 * The engine never claims success unless the tool call returns ok.
 */

interface ToolContext {
  agentId: number;
  agentName: string;
  agentColor: string;
  channelId: number | null;
}

// Lightweight shim — we don't import the runTool registry here (it would
// create a cycle). Instead we use a function injected at module load.
let _runTool: ((tool: string, args: Record<string, unknown>, ctx: ToolContext) => Promise<string>) | null = null;
export function setHermesToolRunner(fn: typeof _runTool) { _runTool = fn; }

function toolCtx(missionId: number): ToolContext {
  return { agentId: 6, agentName: "MissionKernel-Hermes", agentColor: "#aa55ff", channelId: null };
}

export const hermesEngine: EngineAdapter = {
  name: "hermes",
  async run(step: MissionStep): Promise<EngineResult> {
    const started = Date.now();
    const action = step.action;
    const goal = (step.args.goal as string | undefined) ?? "";

    if (action === "memory_search") {
      const query = String(step.args.query ?? goal);
      if (!_runTool) return { ok: false, error: "hermes tool runner not wired", durationMs: 0 };
      try {
        const out = await _runTool("memory_search", { query, limit: 5 }, toolCtx(step.args.missionId as number ?? 0));
        return { ok: !out.startsWith("error:"), output: out, evidence: out.slice(0, 200), durationMs: Date.now() - started };
      } catch (err) {
        return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
      }
    }

    if (action === "memory_write") {
      const key = String(step.args.key ?? `mission/${Date.now()}`);
      const content = String(step.args.content ?? "");
      if (!_runTool) return { ok: false, error: "hermes tool runner not wired", durationMs: 0 };
      try {
        const out = await _runTool("memory_write", { key, content, tags: "mission" }, toolCtx(step.args.missionId as number ?? 0));
        return { ok: !out.startsWith("error:"), output: out, evidence: `wrote memory key ${key}`, durationMs: Date.now() - started };
      } catch (err) {
        return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
      }
    }

    if (action === "skill_distill") {
      const skillName = String(step.args.name ?? "mission-lesson");
      const description = String(step.args.description ?? "");
      const content = String(step.args.content ?? "");
      if (!_runTool) return { ok: false, error: "hermes tool runner not wired", durationMs: 0 };
      try {
        // We write the skill via memory_write with a structured format that
        // hermes can later promote. The Learning Engine handles promotion.
        const out = await _runTool(
          "memory_write",
          { key: `skill/candidate/${skillName}`, content: `${description}\n\n${content}`, tags: "mission,skill,candidate" },
          toolCtx(step.args.missionId as number ?? 0),
        );
        return { ok: !out.startsWith("error:"), output: out, evidence: `distilled skill candidate '${skillName}'`, durationMs: Date.now() - started };
      } catch (err) {
        return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
      }
    }

    logger.warn({ action }, "hermes engine: unknown action");
    return { ok: false, error: `unknown hermes action: ${action}`, durationMs: Date.now() - started };
  },
};