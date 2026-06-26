import type { EngineAdapter, EngineResult } from "./registry";
import type { MissionStep } from "../types";
import { logger } from "../../logger";

/**
 * OpenHands engine — code execution, HTTP requests, browser automation.
 *
 * Action vocabulary:
 *   - "code_exec"     → runTool("code_exec", { code, language })
 *   - "http_request"  → runTool("http_request", { url, method })
 *   - "web_search"    → runTool("web_search", { query })
 *   - "web_scrape"    → runTool("web_scrape", { url })
 *
 * If the tool runner isn't wired (dev environment), falls back to a simple
 * fetch/http_request for code that just needs an HTTP call.
 */

interface ToolContext {
  agentId: number;
  agentName: string;
  agentColor: string;
  channelId: number | null;
}
let _runTool: ((tool: string, args: Record<string, unknown>, ctx: ToolContext) => Promise<string>) | null = null;
export function setOpenHandsToolRunner(fn: typeof _runTool) { _runTool = fn; }

function toolCtx(missionId: number): ToolContext {
  return { agentId: 6, agentName: "MissionKernel-OpenHands", agentColor: "#00aaff", channelId: null };
}

export const openhandsEngine: EngineAdapter = {
  name: "openhands",
  async run(step: MissionStep): Promise<EngineResult> {
    const started = Date.now();
    const action = step.action;

    if (!_runTool) {
      // No tool runner — use a tiny inline http_request shim.
      if (action === "http_request" || action === "web_scrape") {
        try {
          const r = await fetch(String(step.args.url), { method: (step.args.method as string) ?? "GET" });
          const text = await r.text();
          return { ok: r.ok, output: text.slice(0, 1000), evidence: `${r.status} ${r.statusText}`, durationMs: Date.now() - started };
        } catch (err) {
          return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
        }
      }
      return { ok: false, error: "openhands tool runner not wired", durationMs: 0 };
    }

    try {
      const out = await _runTool(action, step.args, toolCtx(step.args.missionId as number ?? 0));
      return { ok: !out.startsWith("error:"), output: out, evidence: out.slice(0, 200), durationMs: Date.now() - started };
    } catch (err) {
      logger.warn({ err, action }, "openhands engine: tool failed");
      return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
    }
  },
};