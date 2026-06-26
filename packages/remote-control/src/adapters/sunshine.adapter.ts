/**
 * Sunshine + Moonlight adapter — Round D.
 *
 * Sunshine is the server (runs on the gaming PC), Moonlight is the client
 * (the phone). For AURA we orchestrate: pair the client, launch a session,
 * and stream H.265 frames back.
 */

import { StubAdapter } from "./stub";
import type { AdapterName, AdapterStage } from "../adapter";

export class SunshineAdapter extends StubAdapter {
  readonly name: AdapterName = "sunshine";
  readonly stage: AdapterStage = 3;
}