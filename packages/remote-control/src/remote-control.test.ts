import { describe, it, expect } from "vitest";
import { getAdapter, listAdapters } from "./adapters";
import type { AdapterName } from "./adapter";
import { TailscaleAdapter } from "./adapters/tailscale.adapter";
import { RustDeskAdapter } from "./adapters/rustdesk.adapter";

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
    "%s adapter throws not-implemented for screenshot until Round B/C/D",
    (name) => {
      const a = getAdapter(name);
      expect(() =>
        a.screenshot({
          agentId: 0,
          agentName: "test",
          agentColor: "#000",
          channelId: null,
        }, "test-host"),
      ).toThrow(/not implemented yet/);
    },
  );
});

describe("tailscale adapter", () => {
  const a = new TailscaleAdapter();

  it("parses peers from status JSON", () => {
    const json = JSON.stringify({
      Self: {
        ID: "self-id",
        HostName: "my-pc",
        DNSName: "my-pc.tailnet.ts.net.",
        TailscaleIPs: ["100.101.102.103"],
        Online: true,
        OS: "windows",
      },
      Peer: {
        "peer-1-id": {
          HostName: "other-pc",
          DNSName: "other-pc.tailnet.ts.net.",
          TailscaleIPs: ["100.64.0.2"],
          Online: false,
          OS: "linux",
        },
      },
    });
    const peers = a.parseStatusJson(json);
    expect(peers).toHaveLength(2);
    expect(peers[0].name).toBe("my-pc");
    expect(peers[0].tailscaleIp).toBe("100.101.102.103");
    expect(peers[1].name).toBe("other-pc");
    expect(peers[1].online).toBe(false);
  });

  it("returns empty on invalid JSON", () => {
    expect(a.parseStatusJson("not json")).toEqual([]);
  });

  it("returns empty on empty object", () => {
    expect(a.parseStatusJson("{}")).toEqual([]);
  });

  it("connect returns tailscale:host deep link", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "my-pc.tailnet.ts.net." });
    expect(r.ok).toBe(true);
    expect(r.url).toContain("tailscale:host/");
  });

  it("connect rejects missing host", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "" });
    expect(r.ok).toBe(false);
  });
});

describe("rustdesk adapter", () => {
  const a = new RustDeskAdapter();

  it("builds a rustdesk:// connect URL with password", () => {
    const url = a.buildConnectUrl("ABC123", "SecretPwd");
    expect(url).toBe("rustdesk://connect?id=ABC123&password=SecretPwd");
  });

  it("URL-encodes special characters", () => {
    const url = a.buildConnectUrl("ID with space", "p&w=d");
    expect(url).toContain("id=ID%20with%20space");
    expect(url).toContain("password=p%26w%3Dd");
  });

  it("generateTempPassword returns alphanumeric 8-char by default", () => {
    const p = a.generateTempPassword();
    expect(p).toHaveLength(8);
    expect(p).toMatch(/^[A-Z2-9]+$/);
  });

  it("connect requires rustdeskId in options", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "x", options: {} });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("rustdeskId");
  });

  it("connect with rustdeskId returns deep link", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "x", options: { rustdeskId: "ABC" }, password: "pwd" });
    expect(r.ok).toBe(true);
    expect(r.url).toContain("rustdesk://connect");
  });
});