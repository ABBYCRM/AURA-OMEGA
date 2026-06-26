/**
 * scrcpy adapter — Round D.
 *
 * Used to test the BOS-OMEGA loop from the other side (control an Android
 * device attached to the target PC). On Windows we ship the scrcpy.exe
 * binary and the prebuilt adb.exe.
 */

import { StubAdapter } from "./stub";
import type { AdapterName, AdapterStage } from "../adapter";

export class ScrcpyAdapter extends StubAdapter {
  readonly name: AdapterName = "scrcpy";
  readonly stage: AdapterStage = 4;
}