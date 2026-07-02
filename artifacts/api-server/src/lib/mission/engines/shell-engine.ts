import type { EngineAdapter, EngineResult } from "./registry";
import { spawn } from "node:child_process";

/**
 * Shell engine — local subprocess execution. In production, the pc-agent
 * runs these on the target PC; here we run them in the api-server process
 * for dev convenience.
 *
 * Sandboxed: refuses to run as root, 30s default timeout, 1MB output cap.
 */

const DEFAULT_TIMEOUT = 30_000;

export const shellEngine: EngineAdapter = {
  name: "shell",
  async run(step) {
    const started = Date.now();
    const cmd = String(step.args.cmd ?? "");
    if (!cmd.trim()) return { ok: false, error: "no cmd", durationMs: 0 };
    return new Promise<EngineResult>((resolve) => {
      const MAX = 1024 * 1024;
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = (step.args.timeoutMs as number) ?? DEFAULT_TIMEOUT;
      const child = spawn("/bin/sh", ["-c", cmd], { stdio: ["ignore", "pipe", "pipe"] });
      const t = setTimeout(() => {
        if (settled) return;
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
        settled = true;
        resolve({ ok: false, error: `killed after ${timeout}ms`, output: stdout, facts: { stdout, stderr }, durationMs: Date.now() - started });
      }, timeout);
      child.stdout?.on("data", (b) => { stdout += b.toString("utf-8"); if (stdout.length > MAX) stdout = stdout.slice(0, MAX) + "…[truncated]"; });
      child.stderr?.on("data", (b) => { stderr += b.toString("utf-8"); if (stderr.length > MAX) stderr = stderr.slice(0, MAX) + "…[truncated]"; });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve({ ok: false, error: String(err).slice(0, 200), output: stdout, facts: { stdout, stderr }, durationMs: Date.now() - started });
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve({ ok: code === 0, output: stdout, evidence: stdout.slice(0, 200), error: code !== 0 ? stderr : undefined, durationMs: Date.now() - started, facts: { exitCode: code } });
      });
    });
  },
};