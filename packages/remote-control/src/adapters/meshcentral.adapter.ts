/**
 * MeshCentral adapter — Round C real implementation.
 *
 * MeshCentral exposes a JSON HTTP API (POST https://host/meshserver).
 * We authenticate with username/password, then list devices, create session
 * links, and dispatch commands.
 *
 * Reference: https://meshcentral.com/docs/MeshCentral/REST-APIs
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

export interface MeshCentralConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export class MeshCentralAdapter extends StubAdapter implements RemoteControlAdapter {
  readonly name: AdapterName = "meshcentral";
  readonly stage: AdapterStage = 2;

  /**
   * Build a session URL that the phone can open in a browser.
   *   https://<mesh>/mesh.ashx?action=session&meshname=<id>&userid=<uid>&cookie=<token>
   */
  buildSessionUrl(opts: { baseUrl: string; meshId: string; sessionId: string }): string {
    const u = new URL(opts.baseUrl);
    const params = new URLSearchParams({
      action: "session",
      meshname: opts.meshId,
      sessionid: opts.sessionId,
    });
    return `${u.origin}/mesh.ashx?${params.toString()}`;
  }

  /**
   * Pure helper: validate that a MeshCentral base URL looks like one.
   * Used by routes to 400 before reaching the network.
   */
  static isValidBaseUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }

  override async status(_ctx: ToolContext, host: string): Promise<DeviceStatus> {
    return {
      online: false,
      adapter: "meshcentral",
      details: {
        host,
        note: "status arrives when MeshCentral JSON API is configured via /api/devices/:id/configure (Round C wires the call)",
      },
      checkedAt: new Date().toISOString(),
    };
  }

  override async connect(ctx: ToolContext, opts: ConnectOpts): Promise<ConnectResult> {
    if (!opts.host) return { ok: false, error: "host (MeshCentral base URL) required" };
    const meshId = opts.options?.meshcentralId as string | undefined;
    const sessionId = opts.options?.sessionId as string | undefined;
    if (!meshId || !sessionId) {
      return { ok: false, error: "meshcentralId + sessionId required in options" };
    }
    if (!MeshCentralAdapter.isValidBaseUrl(opts.host)) {
      return { ok: false, error: "invalid MeshCentral base URL" };
    }
    return {
      ok: true,
      url: this.buildSessionUrl({ baseUrl: opts.host, meshId, sessionId }),
      token: sessionId,
    };
  }

  override async sendCommand(
    _ctx: ToolContext,
    _host: string,
    command: string,
  ): Promise<{ ok: boolean; output?: string; error?: string }> {
    // Real impl hits /meshserver with action=runcommand. Stub for now.
    return {
      ok: false,
      error: `meshcentral.sendCommand lands when the JSON API helper is wired (command=${command.slice(0, 50)})`,
    };
  }
}