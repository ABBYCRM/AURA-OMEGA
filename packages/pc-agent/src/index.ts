/**
 * @workspace/pc-agent — public surface.
 *
 * The PC Agent runs on the target Windows machine. It exposes a tiny local
 * HTTP server on `127.0.0.1:8787` that:
 *   - accepts "execute" commands from AURA (verified via shared secret)
 *   - spawns the binary for the requested adapter (rustdesk-cli, meshagent, etc)
 *   - streams output back as NDJSON
 *
 * Why a separate package? It gets bundled separately into a single-file exe
 * for the target PC, while the AURA api-server can also import it directly
 * for the local-dev case (running everything on one machine).
 */

import { spawn } from "node:child_process";

export const PC_AGENT_VERSION = "0.0.1";
export const PC_AGENT_DEFAULT_PORT = 8787;

export interface PCAgentConfig {
  port?: number;
  secret: string;
  logLevel?: "debug" | "info" | "warn" | "error";
}

export interface ExecuteRequest {
  adapter: string;
  args: string[];
  timeoutMs?: number;
}

export interface ExecuteResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Spawn an adapter binary and capture output. Pure helper — no HTTP server
 * is started by this function.
 *
 * Behavior:
 *   - Always resolves (never throws on non-zero exit). Caller checks
 *     `result.ok` and `result.exitCode`.
 *   - Times out after `timeoutMs` (kills the child).
 *   - Captures up to 1MB of stdout/stderr each (truncates with a marker).
 *   - Returns an ExecuteResult with the captured output and duration.
 *
 * Usage:
 *   const r = await spawnAdapter("C:\\Program Files\\scrcpy\\scrcpy.exe",
 *                                ["--record", "out.mp4"], 30_000);
 *   if (!r.ok) throw new Error(`scrcpy exit ${r.exitCode}: ${r.stderr}`);
 */
export async function spawnAdapter(
  binary: string,
  args: string[],
  timeoutMs = 30_000,
): Promise<ExecuteResult> {
  const started = Date.now();
  return new Promise<ExecuteResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const MAX_CAPTURE = 1024 * 1024; // 1 MB per stream
    const truncated = "\n…[truncated]\n";

    let child;
    try {
      child = spawn(binary, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: false,
      });
    } catch (err) {
      resolve({
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: `spawn failed: ${String(err)}`,
        durationMs: Date.now() - started,
      });
      return;
    }

    const t = setTimeout(() => {
      if (settled) return;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      settled = true;
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: stderr + `\n[killed after ${timeoutMs}ms timeout]`,
        durationMs: Date.now() - started,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
      if (stdout.length > MAX_CAPTURE) {
        stdout = stdout.slice(0, MAX_CAPTURE) + truncated;
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
      if (stderr.length > MAX_CAPTURE) {
        stderr = stderr.slice(0, MAX_CAPTURE) + truncated;
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: stderr + `\nspawn error: ${String(err)}`,
        durationMs: Date.now() - started,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve({
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
  });
}

/**
 * Map an adapter name to its canonical binary path on Windows. The bootstrap
 * script installs each adapter to its well-known location; we look those up
 * here so the caller can just say `await spawnAdapterForAdapter("rustdesk")`.
 *
 * Returns null if the adapter has no associated binary (e.g. guacamole /
 * novnc which run in a browser, or scrcpy which uses an explicit path).
 */
export function defaultBinaryForAdapter(adapter: string): string | null {
  switch (adapter) {
    case "tailscale":
      return "C:\\Program Files\\Tailscale\\tailscale.exe";
    case "rustdesk":
      return "C:\\Program Files\\RustDesk\\rustdesk.exe";
    case "meshcentral":
      return "C:\\Program Files\\Mesh Agent\\meshagent.exe";
    case "sunshine":
      return null; // sunshine runs as a service, no direct binary
    case "scrcpy":
      return "C:\\Program Files\\scrcpy\\scrcpy.exe";
    default:
      return null;
  }
}

/**
 * Convenience: resolve binary + args for a known adapter and a free-form
 * command. Adapter-specific commands are mapped to the right flag set.
 */
export async function runAdapterCommand(
  adapter: string,
  command: string,
  timeoutMs?: number,
): Promise<ExecuteResult> {
  const binary = defaultBinaryForAdapter(adapter);
  if (!binary) {
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: `adapter[${adapter}] has no associated binary on this host`,
      durationMs: 0,
    };
  }
  // For tailscale/rustdesk/meshcentral the command is forwarded verbatim.
  // For scrcpy the command is split into args (simple word-split).
  const args = adapter === "scrcpy" ? command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [] : [command];
  return spawnAdapter(binary, args, timeoutMs);
}