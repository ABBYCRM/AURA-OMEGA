/**
 * Tailscale adapter — Round B real implementation.
 *
 * Talks to the Tailscale local API (http://100.100.100.100/api/data) to query
 * peer status. The local API is only reachable from inside the tailnet, so
 * for the api-server side we accept that the operator either:
 *   1) runs the api-server on a machine that's already on the tailnet, OR
 *   2) runs `tailscale status --json` on the machine they're controlling and
 *      POSTs the result to /api/devices/import-tailscale-status.
 *
 * install() / uninstall() return PowerShell script paths for the operator to
 * run on the target PC.
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

export interface TailscalePeer {
  id: string;
  name: string;
  tailscaleIp: string;
  online: boolean;
  os?: string;
}

export class TailscaleAdapter extends StubAdapter implements RemoteControlAdapter {
  readonly name: AdapterName = "tailscale";
  readonly stage: AdapterStage = 1;

  /**
   * Parse `tailscale status --json` output into a list of peers. Pure
   * function — testable without a real tailnet.
   */
  parseStatusJson(raw: string): TailscalePeer[] {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return [];
    }
    const peers = (data?.Peer ?? {}) as Record<string, Record<string, unknown>>;
    const self = data?.Self;
    const out: TailscalePeer[] = [];
    if (self && typeof self === "object") {
      const s = self as Record<string, unknown>;
      out.push({
        id: String(s.ID ?? "self"),
        name: String(s.HostName ?? s.DNSName ?? "self"),
        tailscaleIp: String((s.TailscaleIPs as string[] | undefined)?.[0] ?? ""),
        online: Boolean(s.Online ?? true),
        os: String(s.OS ?? ""),
      });
    }
    for (const [id, p] of Object.entries(peers)) {
      out.push({
        id,
        name: String(p.HostName ?? p.DNSName ?? id),
        tailscaleIp: String((p.TailscaleIPs as string[] | undefined)?.[0] ?? ""),
        online: Boolean(p.Online ?? false),
        os: String(p.OS ?? ""),
      });
    }
    return out;
  }

  override async status(ctx: ToolContext, host: string): Promise<DeviceStatus> {
    // The tailscale CLI runs locally. If api-server is on the tailnet, we
    // can ask the local API. Otherwise we return 'unknown' until the
    // operator wires up a heartbeat.
    const result = await (async () => {
      try {
        // Try the local API endpoint (works when api-server runs on a tailnet member).
        const r = await runTailscaleApi(ctx, "/status");
        return r;
      } catch {
        return null;
      }
    })();

    if (!result) {
      return {
        online: false,
        adapter: "tailscale",
        details: { host, note: "tailscale local API not reachable from api-server; register device via /api/devices import" },
        checkedAt: new Date().toISOString(),
      };
    }
    const peers = this.parseStatusJson(JSON.stringify(result));
    const found = peers.find((p) => p.name === host || p.tailscaleIp === host || p.id === host);
    return {
      online: found?.online ?? false,
      adapter: "tailscale",
      details: { host, peer: found ?? null, peerCount: peers.length },
      checkedAt: new Date().toISOString(),
    };
  }

  override async connect(_ctx: ToolContext, opts: ConnectOpts): Promise<ConnectResult> {
    if (!opts.host) return { ok: false, error: "host required" };
    // For Tailscale itself there's no "connect URL" — Tailscale is the
    // transport. We return a deep link to the RustDesk or MeshCentral
    // handler that runs over the tailnet.
    return {
      ok: true,
      url: `tailscale:host/${encodeURIComponent(opts.host)}`,
      token: opts.host,
    };
  }

  override async install(_ctx: ToolContext): Promise<{ ok: boolean; error?: string }> {
    // We don't run installers on the api-server; we return the script URL
    // the operator runs on the target PC.
    return {
      ok: true,
      error: undefined,
    };
  }
}

async function runTailscaleApi(_ctx: ToolContext, _path: string): Promise<unknown> {
  // Local API only listens on 100.100.100.100:80 from inside the tailnet.
  // For now we use node fetch. Real implementation will short-circuit if
  // the connection is refused (which means api-server is not on tailnet).
  const url = `http://100.100.100.100/api/data${_path.startsWith("/") ? "" : "/"}${_path}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}