/**
 * Tailscale adapter — Round B.
 *
 * Will use:
 *   - `tailscale status --json` for status
 *   - `tailscale serve` for reverse-proxying the AURA UI from a peer PC
 *   - MagicDNS for stable hostnames
 */

import { StubAdapter } from "./stub";
import type { AdapterName, AdapterStage } from "../adapter";

export class TailscaleAdapter extends StubAdapter {
  readonly name: AdapterName = "tailscale";
  readonly stage: AdapterStage = 1;
}