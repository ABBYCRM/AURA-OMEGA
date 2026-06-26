/**
 * Adapter registry — single import point.
 */

import { TailscaleAdapter } from "./tailscale.adapter";
import { RustDeskAdapter } from "./rustdesk.adapter";
import { MeshCentralAdapter } from "./meshcentral.adapter";
import { GuacamoleAdapter } from "./guacamole.adapter";
import { NoVNCAdapter } from "./novnc.adapter";
import { SunshineAdapter } from "./sunshine.adapter";
import { ScrcpyAdapter } from "./scrcpy.adapter";
import type { AdapterName, RemoteControlAdapter } from "../adapter";

const REGISTRY: Record<AdapterName, RemoteControlAdapter> = {
  tailscale: new TailscaleAdapter(),
  rustdesk: new RustDeskAdapter(),
  meshcentral: new MeshCentralAdapter(),
  guacamole: new GuacamoleAdapter(),
  novnc: new NoVNCAdapter(),
  sunshine: new SunshineAdapter(),
  scrcpy: new ScrcpyAdapter(),
};

export function getAdapter(name: AdapterName): RemoteControlAdapter {
  const a = REGISTRY[name];
  if (!a) throw new Error(`unknown adapter: ${name}`);
  return a;
}

export function listAdapters(): RemoteControlAdapter[] {
  return Object.values(REGISTRY);
}

export type { AdapterName, RemoteControlAdapter, AdapterStage } from "../adapter";

export {
  TailscaleAdapter,
  RustDeskAdapter,
  MeshCentralAdapter,
  GuacamoleAdapter,
  NoVNCAdapter,
  SunshineAdapter,
  ScrcpyAdapter,
};