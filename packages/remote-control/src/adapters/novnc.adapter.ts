/**
 * noVNC adapter — Round C.
 *
 * Will speak the RFB protocol over a WebSocket bridged by websockify. The
 * api-server returns VNC frames as PNGs and accepts pointer/keyboard events
 * via the same WS.
 */

import { StubAdapter } from "./stub";
import type { AdapterName, AdapterStage } from "../adapter";

export class NoVNCAdapter extends StubAdapter {
  readonly name: AdapterName = "novnc";
  readonly stage: AdapterStage = 2;
}