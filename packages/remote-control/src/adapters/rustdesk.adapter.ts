/**
 * RustDesk adapter — Round B real implementation.
 *
 * RustDesk exposes:
 *   - rustdesk://connect?id=<ID>&password=<PWD>  deep link
 *   - HTTP API on the device (if running client with --server flag)
 *   - self-hosted hbbs/hbbr for relay
 *
 * For Round B we:
 *   - persist RustDesk ID + temporary password on bos_devices
 *   - generate a deep-link URL the phone can open in the RustDesk app
 *   - accept status pings from the device's running client
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

export class RustDeskAdapter extends StubAdapter implements RemoteControlAdapter {
  readonly name: AdapterName = "rustdesk";
  readonly stage: AdapterStage = 1;

  /**
   * Build the rustdesk:// connect URL.
   *   rustdesk://connect?id=ABC123&password=tempPwd
   * If a password is missing, generate a random 8-char alphanumeric temp pwd.
   */
  buildConnectUrl(id: string, password?: string): string {
    const pwd = password ?? this.generateTempPassword();
    return `rustdesk://connect?id=${encodeURIComponent(id)}&password=${encodeURIComponent(pwd)}`;
  }

  generateTempPassword(length = 8): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  override async status(_ctx: ToolContext, host: string): Promise<DeviceStatus> {
    // Real status would require the device to ping us or us to ping the
    // device's HTTP API. For now, return a 'unknown' status that the UI
    // can render.
    return {
      online: false,
      adapter: "rustdesk",
      details: { host, note: "real status arrives when device registers via /api/devices/:id/heartbeat" },
      checkedAt: new Date().toISOString(),
    };
  }

  override async connect(ctx: ToolContext, opts: ConnectOpts): Promise<ConnectResult> {
    if (!opts.host) return { ok: false, error: "host required" };
    const id = opts.options?.rustdeskId as string | undefined;
    const pwd = (opts.password ?? opts.options?.password) as string | undefined;
    if (!id) return { ok: false, error: "rustdeskId missing — register device with adapter=rustdesk and rustdesk_id" };
    const url = this.buildConnectUrl(id, pwd);
    return { ok: true, url, token: id };
  }

  override async sendCommand(
    ctx: ToolContext,
    host: string,
    command: string,
  ): Promise<{ ok: boolean; output?: string; error?: string }> {
    // Stub the dispatch — real impl would use the RustDesk HTTP API or
    // shell into the pc-agent.
    return {
      ok: false,
      error: `rustdesk.sendCommand not yet wired up (host=${host}, command=${command.slice(0, 50)})`,
    };
  }
}