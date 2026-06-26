import { describe, it, expect } from "vitest";
import {
  PC_AGENT_VERSION,
  PC_AGENT_DEFAULT_PORT,
  spawnAdapter,
  defaultBinaryForAdapter,
  runAdapterCommand,
} from "./index";

describe("pc-agent scaffold", () => {
  it("exports the expected version", () => {
    expect(PC_AGENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("exports the default port", () => {
    expect(PC_AGENT_DEFAULT_PORT).toBe(8787);
  });
});

describe("pc-agent binary registry", () => {
  it("knows the tailscale binary path", () => {
    expect(defaultBinaryForAdapter("tailscale")).toMatch(/tailscale\.exe$/i);
  });
  it("knows the rustdesk binary path", () => {
    expect(defaultBinaryForAdapter("rustdesk")).toMatch(/rustdesk\.exe$/i);
  });
  it("knows the meshagent binary path", () => {
    expect(defaultBinaryForAdapter("meshcentral")).toMatch(/meshagent\.exe$/i);
  });
  it("knows the scrcpy binary path", () => {
    expect(defaultBinaryForAdapter("scrcpy")).toMatch(/scrcpy\.exe$/i);
  });
  it("returns null for browser-only adapters", () => {
    expect(defaultBinaryForAdapter("sunshine")).toBeNull();
    expect(defaultBinaryForAdapter("guacamole")).toBeNull();
    expect(defaultBinaryForAdapter("novnc")).toBeNull();
  });
  it("returns null for unknown adapters", () => {
    expect(defaultBinaryForAdapter("nope")).toBeNull();
  });

  it("runAdapterCommand returns ok=false for unknown adapter", async () => {
    const r = await runAdapterCommand("nope", "whatever");
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/no associated binary/);
  });
});

describe("pc-agent spawnAdapter", () => {
  it("captures stdout from a successful command", async () => {
    // `node -e` is cross-platform-friendly enough that this works on both
    // sandbox (linux) and on Windows when the operator runs it via WSL/git bash.
    const r = await spawnAdapter("node", ["-e", "process.stdout.write('hello-pc-agent')"], 5_000);
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hello-pc-agent");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns ok=false for non-zero exit", async () => {
    const r = await spawnAdapter("node", ["-e", "process.exit(7)"], 5_000);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(7);
  });

  it("captures stderr", async () => {
    const r = await spawnAdapter("node", ["-e", "process.stderr.write('oops')"], 5_000);
    expect(r.stderr).toContain("oops");
  });

  it("returns ok=false on missing binary", async () => {
    const r = await spawnAdapter("/nonexistent/path/to/binary", [], 1_000);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBeNull();
    expect(r.stderr).toMatch(/ENOENT|spawn failed|spawn error/i);
  });

  it("times out and kills long-running commands", async () => {
    // node sleeps 10s, we give it 200ms — expect kill + ok=false
    const r = await spawnAdapter("node", ["-e", "setTimeout(() => process.exit(0), 10000)"], 200);
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/killed after 200ms/);
  });
});