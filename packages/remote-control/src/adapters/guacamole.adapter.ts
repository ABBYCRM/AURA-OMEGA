/**
 * Apache Guacamole adapter — Round C.
 *
 * Will proxy HTTP through guacd (the gateway daemon) using its native
 * protocol over WebSocket. Sends screenshot/command via guacd, receives
 * frames back as base64 PNG.
 */

import { StubAdapter } from "./stub";
import type { AdapterName, AdapterStage } from "../adapter";

export class GuacamoleAdapter extends StubAdapter {
  readonly name: AdapterName = "guacamole";
  readonly stage: AdapterStage = 2;
}