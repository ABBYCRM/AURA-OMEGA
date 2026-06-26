import { describe, it, expect } from "vitest";
import { getAdapter, listAdapters } from "./adapters";
import type { AdapterName } from "./adapter";

describe("remote-control adapter registry", () => {
  it("registers all 7 adapters", () => {
    const names = listAdapters().map((a) => a.name);
    expect(names.sort()).toEqual(
      ["guacamole", "meshcentral", "novnc", "rustdesk", "scrcpy", "sunshine", "tailscale"].sort(),
    );
  });

  it("getAdapter returns the right adapter by name", () => {
    const ts = getAdapter("tailscale");
    expect(ts.name).toBe("tailscale");
    expect(ts.stage).toBe(1);
  });

  it.each<AdapterName>(["tailscale", "rustdesk", "meshcentral", "guacamole", "novnc", "sunshine", "scrcpy"])(
    "%s adapter throws not-implemented until its stage lands",
    (name) => {
      const a = getAdapter(name);
      expect(() =>
        a.isInstalled({
          agentId: 0,
          agentName: "test",
          agentColor: "#000",
          channelId: null,
        }),
      ).toThrow(/not implemented yet/);
    },
  );
});