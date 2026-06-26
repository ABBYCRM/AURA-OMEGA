import type { EngineAdapter, EngineResult } from "./registry";
import type { MissionStep } from "../types";

/**
 * BOS-OMEGA engine — physical-world commands via remote-control adapters.
 *
 * Action: "command" → triggers pc-agent.runAdapterCommand() on the target PC.
 * Used by DEPLOYMENT missions (install X on PC Y) and SECURITY missions
 * (rotate creds on remote).
 */

export const bosOmegaEngine: EngineAdapter = {
  name: "bos-omega",
  async run(step: MissionStep): Promise<EngineResult> {
    const started = Date.now();
    // We don't actually shell out to a pc-agent here — the mission kernel
    // runs inside the api-server process. For real deployment, the bos-omega
    // adapter would call pc-agent via runTool("http_request", ...) to reach
    // the target's PC agent over the tailnet.
    return {
      ok: true,
      output: {
        action: step.action,
        deviceId: step.args.deviceId,
        command: step.args.command,
        note: "dispatched via bos-omega pc-agent (in-process stub for MVP)",
      },
      evidence: `bos-omega command acknowledged (stub)`,
      durationMs: Date.now() - started,
      facts: { adapter: "bos-omega", stubbed: true },
    };
  },
};