/**
 * Stub adapter base — every adapter extends this and overrides methods.
 * Methods throw a clear "not implemented yet" error so callers and the
 * orchestrator code can be built against the contract without waiting for
 * the binary-side integration to land.
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

export abstract class StubAdapter implements RemoteControlAdapter {
  abstract readonly name: AdapterName;
  abstract readonly stage: AdapterStage;

  protected unimplemented(method: string): never {
    throw new Error(
      `adapter[${this.name}].${method} not implemented yet. Landed in Round ${this.stage}.`,
    );
  }

  isInstalled(_ctx: ToolContext): Promise<boolean> {
    this.unimplemented("isInstalled");
  }
  install(_ctx: ToolContext): Promise<{ ok: boolean; error?: string }> {
    this.unimplemented("install");
  }
  status(_ctx: ToolContext, _host: string): Promise<DeviceStatus> {
    this.unimplemented("status");
  }
  connect(_ctx: ToolContext, _opts: ConnectOpts): Promise<ConnectResult> {
    this.unimplemented("connect");
  }
  screenshot(_ctx: ToolContext, _host: string): Promise<Buffer> {
    this.unimplemented("screenshot");
  }
  sendCommand(
    _ctx: ToolContext,
    _host: string,
    _command: string,
  ): Promise<{ ok: boolean; output?: string; error?: string }> {
    this.unimplemented("sendCommand");
  }
}