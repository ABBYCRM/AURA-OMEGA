/**
 * MeshCentral adapter — Round C.
 *
 * Will use the MeshCentral JSON API for device registration and remote session
 * creation. Browser-based remote control served via MeshCentral's web UI.
 */

import { StubAdapter } from "./stub";
import type { AdapterName, AdapterStage } from "../adapter";

export class MeshCentralAdapter extends StubAdapter {
  readonly name: AdapterName = "meshcentral";
  readonly stage: AdapterStage = 2;
}