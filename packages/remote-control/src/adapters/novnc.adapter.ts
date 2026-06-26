/**
 * noVNC adapter — Round C real implementation.
 *
 * noVNC is a browser VNC client that talks the RFB protocol over a WebSocket
 * bridged by websockify. The API surface:
 *   - status(): check websockify endpoint reachable
 *   - connect(): returns the WebSocket URL the browser connects to
 *   - screenshot(): not supported (noVNC is browser-only, screenshots would
 *     have to come from a separate path like `grim` on the target)
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

export interface NoVNCConfig {
  wsUrl: string;   // wss://novnc.example.com/websockify/6000
  vncPassword?: string;
}

export class NoVNCAdapter extends StubAdapter implements RemoteControlAdapter {
  readonly name: AdapterName = "novnc";
  readonly stage: AdapterStage = 2;

  buildBrowserUrl(opts: { wsUrl: string; vncPassword?: string; autoconnect?: boolean }): string {
    // The noVNC client is served by a sibling route in the React UI.
    // We just return the WS URL + password so the client can connect.
    return JSON.stringify({
      wsUrl: opts.wsUrl,
      password: opts.vncPassword ?? null,
      autoconnect: opts.autoconnect ?? true,
    });
  }

  override async status(ctx: ToolContext, host: string): Promise<DeviceStatus> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      // HEAD the HTTP version of the websocket URL (drop wss:// -> https://)
      const httpUrl = host.replace(/^wss?:\/\//, (m) => (m === "wss://" ? "https://" : "http://"));
      const r = await fetch(httpUrl, { method: "HEAD", signal: ctl.signal });
      clearTimeout(t);
      return {
        online: r.ok,
        adapter: "novnc",
        details: { host, httpStatus: r.status },
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        online: false,
        adapter: "novnc",
        details: { host, note: "websockify unreachable" },
        checkedAt: new Date().toISOString(),
      };
    }
  }

  override async connect(_ctx: ToolContext, opts: ConnectOpts): Promise<ConnectResult> {
    const wsUrl = opts.options?.wsUrl as string | undefined;
    if (!wsUrl) return { ok: false, error: "wsUrl required in options" };
    return {
      ok: true,
      url: this.buildBrowserUrl({ wsUrl, vncPassword: opts.password, autoconnect: true }),
      token: wsUrl,
    };
  }
}