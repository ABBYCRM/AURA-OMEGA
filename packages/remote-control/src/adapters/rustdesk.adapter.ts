/**
 * RustDesk adapter — Round B.
 *
 * Will use:
 *   - rustdesk-cli / rustdesk portable
 *   - RustDesk ID + temporary password for unattended access
 *   - rustdesk:// connect URL scheme
 */

import { StubAdapter } from "./stub";
import type { AdapterName, AdapterStage } from "../adapter";

export class RustDeskAdapter extends StubAdapter {
  readonly name: AdapterName = "rustdesk";
  readonly stage: AdapterStage = 1;
}