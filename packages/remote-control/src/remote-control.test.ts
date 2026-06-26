import { describe, it, expect } from "vitest";
import { getAdapter, listAdapters } from "./adapters";
import type { AdapterName } from "./adapter";
import { TailscaleAdapter } from "./adapters/tailscale.adapter";
import { RustDeskAdapter } from "./adapters/rustdesk.adapter";
import { MeshCentralAdapter } from "./adapters/meshcentral.adapter";
import { GuacamoleAdapter } from "./adapters/guacamole.adapter";
import { NoVNCAdapter } from "./adapters/novnc.adapter";
import { SunshineAdapter } from "./adapters/sunshine.adapter";
import { ScrcpyAdapter } from "./adapters/scrcpy.adapter";

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

  it.each<AdapterName>(["tailscale", "rustdesk", "meshcentral", "guacamole", "novnc", "sunshine"])(
    "%s adapter throws not-implemented for screenshot until its stage lands",
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

describe("meshcentral adapter", () => {
  const a = new MeshCentralAdapter();

  it("builds session URL", () => {
    const url = a.buildSessionUrl({ baseUrl: "https://mesh.example.com", meshId: "m1", sessionId: "s1" });
    expect(url).toContain("mesh.ashx?action=session");
    expect(url).toContain("meshname=m1");
    expect(url).toContain("sessionid=s1");
  });

  it("isValidBaseUrl accepts https", () => {
    expect(MeshCentralAdapter.isValidBaseUrl("https://mesh.example.com")).toBe(true);
  });
  it("isValidBaseUrl rejects garbage", () => {
    expect(MeshCentralAdapter.isValidBaseUrl("not a url")).toBe(false);
  });

  it("connect requires meshcentralId + sessionId", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "https://mesh.example.com" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("meshcentralId");
  });

  it("connect returns full session URL with required options", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "https://mesh.example.com", options: { meshcentralId: "m1", sessionId: "s1" } });
    expect(r.ok).toBe(true);
    expect(r.url).toContain("mesh.ashx");
  });

  it("sendCommand accepts valid meshcentral action", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.sendCommand(ctx, "mesh.example.com", "wake");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("action=wake");
  });

  it("sendCommand rejects unknown meshcentral action", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.sendCommand(ctx, "mesh.example.com", "format-c:");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("format-c:");
  });
});

describe("guacamole adapter", () => {
  const a = new GuacamoleAdapter();

  it("builds browser connect URL with id + protocol", () => {
    const url = a.buildConnectUrl({ baseUrl: "https://guac.example.com/guacamole/", connectionId: "5", protocol: "rdp" });
    expect(url).toContain("id=5");
    expect(url).toContain("p=rdp");
  });

  it("connect requires connectionId", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "https://guac.example.com" });
    expect(r.ok).toBe(false);
  });

  it("connect with connectionId returns URL", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "https://guac.example.com", options: { connectionId: "5", protocol: "vnc" } });
    expect(r.ok).toBe(true);
    expect(r.url).toContain("id=5");
  });

  it("sendCommand accepts valid guacd opcode", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.sendCommand(ctx, "guac-host", "mouse.move 100,200");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("mouse.move");
  });

  it("sendCommand rejects unknown guacd opcode", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.sendCommand(ctx, "guac-host", "shutdown");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("shutdown");
  });
});

describe("novnc adapter", () => {
  const a = new NoVNCAdapter();

  it("builds browser JSON config", () => {
    const out = a.buildBrowserUrl({ wsUrl: "wss://novnc.example.com/websockify/6000", vncPassword: "pwd" });
    const parsed = JSON.parse(out);
    expect(parsed.wsUrl).toContain("wss://");
    expect(parsed.password).toBe("pwd");
    expect(parsed.autoconnect).toBe(true);
  });

  it("connect requires wsUrl", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "wss://novnc.example.com" });
    expect(r.ok).toBe(false);
  });

  it("connect with wsUrl returns config JSON", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "wss://novnc.example.com", options: { wsUrl: "wss://novnc.example.com/websockify/6000" } });
    expect(r.ok).toBe(true);
    expect(r.url).toContain("wsUrl");
  });
});

describe("sunshine adapter", () => {
  const a = new SunshineAdapter();

  it("builds moonlight:// pair URL", () => {
    const url = a.buildStreamUrl({ host: "gaming-pc.local:47984", pin: "1234", stream: "Desktop" });
    expect(url).toContain("moonlight://pair");
    expect(url).toContain("pin=1234");
    expect(url).toContain("stream=Desktop");
  });

  it("isValidPin accepts 4 digits", () => {
    expect(SunshineAdapter.isValidPin("1234")).toBe(true);
    expect(SunshineAdapter.isValidPin("9999")).toBe(true);
  });

  it("isValidPin rejects non-4-digit", () => {
    expect(SunshineAdapter.isValidPin("123")).toBe(false);
    expect(SunshineAdapter.isValidPin("abcd")).toBe(false);
    expect(SunshineAdapter.isValidPin("12345")).toBe(false);
  });

  it("connect requires host", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "" });
    expect(r.ok).toBe(false);
  });

  it("connect requires valid pin", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "https://gaming-pc:47984", options: { pin: "12" } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("4 digits");
  });

  it("connect with valid pin returns moonlight URL", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "https://gaming-pc:47984", options: { pin: "4321" } });
    expect(r.ok).toBe(true);
    expect(r.url).toContain("moonlight://pair");
  });

  it("sendCommand accepts known sunshine commands", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.sendCommand(ctx, "https://gaming-pc:47984", "launchApp");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("POST https://gaming-pc:47984/api/launchApp");
  });

  it("sendCommand rejects unknown sunshine commands", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.sendCommand(ctx, "https://gaming-pc:47984", "format-c:");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("format-c:");
  });
});

describe("scrcpy adapter", () => {
  const a = new ScrcpyAdapter();

  it("builds basic args with no options", () => {
    const args = a.buildArgs({ binaryPath: "x", adbPath: "y" });
    expect(args).toEqual([]);
  });

  it("builds args with serial", () => {
    const args = a.buildArgs({ binaryPath: "x", adbPath: "y", serial: "ABC123" });
    expect(args).toEqual(["--serial", "ABC123"]);
  });

  it("builds args with max-size + bitrate + no-control + record", () => {
    const args = a.buildArgs({
      binaryPath: "x",
      adbPath: "y",
      maxSize: 1920,
      bitrate: "8M",
      noControl: true,
      recordTo: "out.mp4",
    });
    expect(args).toContain("--max-size");
    expect(args).toContain("1920");
    expect(args).toContain("--bit-rate");
    expect(args).toContain("8M");
    expect(args).toContain("--no-control");
    expect(args).toContain("--record");
    expect(args).toContain("out.mp4");
  });

  it("connect returns scrcpy:// URL", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.connect(ctx, { host: "pc-host", options: { serial: "DEV1" } });
    expect(r.ok).toBe(true);
    expect(r.url).toContain("scrcpy://pc-host");
    expect(r.url).toContain("serial=DEV1");
  });

  it("screenshot returns a valid 1x1 PNG placeholder", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const buf = await a.screenshot(ctx, "host");
    // PNG magic header
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it("sendCommand accepts known scrcpy flags", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.sendCommand(ctx, "host", "--max-size 1920 --record out.mp4");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("scrcpy.exe");
    expect(r.output).toContain("1920");
    expect(r.output).toContain("out.mp4");
  });

  it("sendCommand rejects unknown scrcpy flags", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.sendCommand(ctx, "host", "--made-up-flag 1");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("--made-up-flag");
  });

  it("sendCommand rejects empty command", async () => {
    const ctx = { agentId: 0, agentName: "t", agentColor: "#000", channelId: null };
    const r = await a.sendCommand(ctx, "host", "   ");
    expect(r.ok).toBe(false);
  });
});