/**
 * The universal adapter contract. Every BOS adapter (Tailscale, RustDesk,
 * MeshCentral, Guacamole, noVNC, Sunshine, scrcpy) implements this.
 *
 * Locking this interface in Round A means we can build the orchestrator and
 * the UI against a stable surface while individual adapter implementations
 * land in later rounds.
 */

import type { ToolContext } from "../../../artifacts/api-server/src/tools";

export type AdapterStage = 1 | 2 | 3 | 4;

export type AdapterName =
  | "tailscale"
  | "rustdesk"
  | "meshcentral"
  | "guacamole"
  | "novnc"
  | "sunshine"
  | "scrcpy";

export interface DeviceStatus {
  online: boolean;
  adapter: AdapterName;
  details: Record<string, unknown>;
  checkedAt: string; // ISO
}

export interface ConnectOpts {
  /** Tailscale MagicDNS hostname or IP. */
  host: string;
  /** Optional override password (e.g. RustDesk temporary password). */
  password?: string;
  /** Optional adapter-specific knobs. */
  options?: Record<string, unknown>;
}

export interface ConnectResult {
  ok: boolean;
  /** A URL the user can open (e.g. rustdesk://connect?id=xxx, vnc://, https). */
  url?: string;
  /** Adapter-specific token (e.g. MeshCentral mesh ID). */
  token?: string;
  error?: string;
}

export interface RemoteControlAdapter {
  readonly name: AdapterName;
  readonly stage: AdapterStage;

  isInstalled(ctx: ToolContext): Promise<boolean>;
  install(ctx: ToolContext): Promise<{ ok: boolean; error?: string }>;
  status(ctx: ToolContext, host: string): Promise<DeviceStatus>;
  connect(ctx: ToolContext, opts: ConnectOpts): Promise<ConnectResult>;
  screenshot(ctx: ToolContext, host: string): Promise<Buffer>;
  sendCommand(
    ctx: ToolContext,
    host: string,
    command: string,
  ): Promise<{ ok: boolean; output?: string; error?: string }>;
}