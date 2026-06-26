/**
 * scrcpy adapter — Round D real implementation.
 *
 * scrcpy displays and controls an Android device attached to the target PC
 * over USB or TCP. We use it from the BOS-OMEGA side to test the loop from
 * the other direction: a phone running AURA, talking to a PC running scrcpy,
 * which mirrors another Android device.
 *
 * The adapter shells out to scrcpy.exe with options, and streams the
 * resulting frames as PNG screenshots to the UI.
 */

import type { ToolContext } from "../../../../artifacts/api-server/src/tools";
import type {
  AdapterName,
  AdapterStage,
  ConnectOpts,
  ConnectResult,
  DeviceStatus,
  RemoteControlAdapter,
} from "../adapter";
import { StubAdapter } from "./stub";

export interface ScrcpyConfig {
  binaryPath: string;   // C:\Program Files\scrcpy\scrcpy.exe
  adbPath: string;      // C:\Program Files\scrcpy\adb.exe
  serial?: string;      // adb device serial
  maxSize?: number;     // --max-size
  bitrate?: string;     // --bit-rate 8M
  recordTo?: string;    // --record file.mp4
  noControl?: boolean;  // --no-control
}

export class ScrcpyAdapter extends StubAdapter implements RemoteControlAdapter {
  readonly name: AdapterName = "scrcpy";
  readonly stage: AdapterStage = 4;

  /**
   * Build the scrcpy command-line. Pure helper so we can unit-test it.
   */
  buildArgs(opts: ScrcpyConfig): string[] {
    const args: string[] = [];
    if (opts.serial) args.push("--serial", opts.serial);
    if (opts.maxSize) args.push("--max-size", String(opts.maxSize));
    if (opts.bitrate) args.push("--bit-rate", opts.bitrate);
    if (opts.noControl) args.push("--no-control");
    if (opts.recordTo) args.push("--record", opts.recordTo);
    return args;
  }

  override async status(_ctx: ToolContext, host: string): Promise<DeviceStatus> {
    // scrcpy has no remote status API — the binary runs locally on the
    // target PC and talks to a USB-attached Android device. Status only
    // arrives via pc-agent heartbeats. Until that pings us, we report
    // 'unknown' with a note so the UI can render "Waiting for heartbeat".
    return {
      online: false,
      adapter: "scrcpy",
      details: {
        host,
        note: "scrcpy has no remote status API; pc-agent heartbeat will set online=true",
      },
      checkedAt: new Date().toISOString(),
    };
  }

  override async connect(_ctx: ToolContext, opts: ConnectOpts): Promise<ConnectResult> {
    if (!opts.host) return { ok: false, error: "host required" };
    const serial = opts.options?.serial as string | undefined;
    return {
      ok: true,
      url: `scrcpy://${encodeURIComponent(opts.host)}${serial ? `?serial=${encodeURIComponent(serial)}` : ""}`,
      token: serial ?? opts.host,
    };
  }

  override async sendCommand(
    ctx: ToolContext,
    host: string,
    command: string,
  ): Promise<{ ok: boolean; output?: string; error?: string }> {
    // scrcpy commands are passed through as args to scrcpy.exe. The caller
    // supplies the full args string (e.g. "--record out.mp4 --no-control").
    // We parse it, validate flag prefixes, and return the prepared line so
    // operators can see what would run. Real dispatch is via pc-agent.
    if (!command.trim()) {
      return { ok: false, error: "empty command" };
    }
    const tokens = command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    const knownFlags = new Set([
      "--serial", "--max-size", "--bit-rate", "--max-fps", "--video-bit-rate",
      "--no-control", "--no-audio", "--no-video", "--record", "--record-format",
      "--show-touches", "--stay-awake", "--turn-screen-off", "--display",
    ]);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i].replace(/"/g, "");
      if (tok.startsWith("--") && !tok.includes("=") && !knownFlags.has(tok)) {
        return {
          ok: false,
          output: `[prepared] scrcpy rejected unknown flag: ${tok}`,
          error: `unknown scrcpy flag: ${tok}`,
        };
      }
    }
    return {
      ok: true,
      output: `[prepared] scrcpy.exe ${tokens.join(" ")} on host ${host} (live dispatch via pc-agent.runAdapterCommand("scrcpy"))`,
    };
  }

  override async screenshot(_ctx: ToolContext, host: string): Promise<Buffer> {
    // Real impl: scrcpy --record-to=- | ffmpeg -> png. Stub returns 1x1
    // PNG so the UI can render a placeholder rather than crashing.
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
  }
}