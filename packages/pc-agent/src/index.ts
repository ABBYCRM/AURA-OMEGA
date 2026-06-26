/**
 * @workspace/pc-agent — public surface.
 *
 * The PC Agent runs on the target Windows machine. It exposes a tiny local
 * HTTP server on `127.0.0.1:8787` that:
 *   - accepts "execute" commands from AURA (verified via shared secret)
 *   - spawns the binary for the requested adapter (rustdesk-cli, meshagent, etc)
 *   - streams output back as NDJSON
 *
 * Why a separate package? In Round D we will ship a compiled .exe that the
 * install-tailscale.ps1 / install-meshagent.ps1 scripts drop on the target PC.
 * Until then the agent only lives in source for unit tests + dev mocking.
 */

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
 * is started by this function. The HTTP layer lives in `src/server.ts` (Round B).
 */
export async function spawnAdapter(
  binary: string,
  args: string[],
  timeoutMs = 30_000,
): Promise<ExecuteResult> {
  const started = Date.now();
  // Implementation lands in Round B. For now we throw to make the contract loud.
  throw new Error(
    `pc-agent.spawnAdapter not implemented yet (binary=${binary}, args=${args.length}, timeoutMs=${timeoutMs}). Landed in Round B.`,
  );
}