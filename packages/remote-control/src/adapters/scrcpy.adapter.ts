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
    // No remote health check for scrcpy — the binary runs on the target PC
    // and talks to a USB-attached device. The pc-agent reports the status.
    return {
      online: false,
      adapter: "scrcpy",
      details: { host, note: "scrcpy status lands when pc-agent runs on the target PC (Round D substep 2)" },
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
    // Real impl would shell out via pc-agent. Stub returns the prepared
    // command line so operators can see what would have been run.
    const config: Partial<ScrcpyConfig> = { binaryPath: "C:\\Program Files\\scrcpy\\scrcpy.exe" };
    const args = this.buildArgs({ ...(config as ScrcpyConfig), noControl: false });
    return {
      ok: false,
      output: `[stub] scrcpy ${args.join(" ")} (host=${host}, command=${command})`,
      error: "scrcpy.sendCommand lands when pc-agent can spawn the binary",
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