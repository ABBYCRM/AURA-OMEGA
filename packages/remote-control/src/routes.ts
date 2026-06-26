/**
 * BOS-OMEGA /api/devices/* routes.
 *
 * Round A: stub routes that respond with "not implemented yet" so the URL
 * surface exists and can be smoke-tested.
 *
 * Round B: real handlers backed by bos_devices / bos_commands / bos_screenshots
 * tables. Tailscale + RustDesk adapters are real (status parsing, connect URL
 * generation, install script retrieval). MeshCentral/Guacamole/noVNC/Sunshine
 * /scrcpy still throw not-implemented until their rounds.
 *
 * The api-server mounts this router at /api/devices via routes/index.ts.
 */

import { Router } from "express";
import { logger } from "../../../artifacts/api-server/src/lib/logger";
import { getAdapter, listAdapters } from "./adapters";
import type { AdapterName } from "./adapter";
import { TailscaleAdapter } from "./adapters/tailscale.adapter";
import { RustDeskAdapter } from "./adapters/rustdesk.adapter";
import {
  listDevices,
  getDevice,
  upsertDevice,
  deleteDevice,
  setDeviceStatus,
  recordCommand,
  listCommandsForDevice,
  recordScreenshot,
  recordInstallRun,
  installStats,
} from "./store";

export const devicesRouter: Router = Router();

function toolCtx() {
  return {
    agentId: 5, // AURA-4 (API/integration) — has the broadest external reach
    agentName: "BOS-OMEGA",
    agentColor: "#00aaff",
    channelId: null,
  };
}

devicesRouter.get("/status", (_req, res) => {
  res.json({
    ok: true,
    runtime: "remote-control",
    adapters: listAdapters().map((a) => ({ name: a.name, stage: a.stage })),
  });
});

devicesRouter.get("/stats", async (_req, res) => {
  try {
    const s = await installStats();
    res.json({ ok: true, ...s });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err as Error).message) });
  }
});

// ─── Devices CRUD ──────────────────────────────────────────────────────────
devicesRouter.get("/", async (req, res) => {
  try {
    const enabledOnly = req.query.enabled === "true";
    const devices = await listDevices(enabledOnly);
    res.json({ ok: true, count: devices.length, devices });
  } catch (err) {
    logger.error({ err }, "GET /api/devices failed");
    res.status(500).json({ ok: false, error: "list failed" });
  }
});

devicesRouter.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const required = ["name", "host", "adapter"];
  for (const k of required) {
    if (!body[k] || typeof body[k] !== "string") {
      return res.status(400).json({ ok: false, error: `${k} required` });
    }
  }
  try {
    const dev = await upsertDevice({
      name: String(body.name),
      host: String(body.host),
      adapter: String(body.adapter),
      tailscaleIp: (body.tailscaleIp as string | undefined) ?? null,
      rustdeskId: (body.rustdeskId as string | undefined) ?? null,
      rustdeskPassword: (body.rustdeskPassword as string | undefined) ?? null,
      meshcentralId: (body.meshcentralId as string | undefined) ?? null,
      guacamoleConnectionId: (body.guacamoleConnectionId as string | undefined) ?? null,
      status: "unknown",
      enabled: body.enabled === false ? false : true,
      metadata: (body.metadata as Record<string, unknown>) ?? {},
    });
    if (!dev) return res.status(500).json({ ok: false, error: "insert failed" });
    res.status(201).json({ ok: true, device: dev });
  } catch (err) {
    logger.error({ err }, "POST /api/devices failed");
    res.status(500).json({ ok: false, error: "insert failed" });
  }
});

devicesRouter.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const ok = await deleteDevice(id);
    if (!ok) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "delete failed" });
  }
});

// ─── Per-device operations ────────────────────────────────────────────────
devicesRouter.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const dev = await getDevice(id);
    if (!dev) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true, device: dev });
  } catch (err) {
    res.status(500).json({ ok: false, error: "fetch failed" });
  }
});

devicesRouter.get("/:id/status", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const dev = await getDevice(id);
    if (!dev) return res.status(404).json({ ok: false, error: "not found" });
    const adapter = getAdapter(dev.adapter as AdapterName);
    const status = await adapter.status(toolCtx(), dev.host);
    await setDeviceStatus(id, status.online ? "online" : "offline");
    res.json({ ok: true, device: dev, status });
  } catch (err) {
    logger.error({ err, id }, "GET /api/devices/:id/status failed");
    res.status(500).json({ ok: false, error: "status failed" });
  }
});

devicesRouter.post("/:id/connect", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const dev = await getDevice(id);
    if (!dev) return res.status(404).json({ ok: false, error: "not found" });
    const adapter = getAdapter(dev.adapter as AdapterName);
    const result = await adapter.connect(toolCtx(), {
      host: dev.host,
      password: dev.rustdeskPassword ?? undefined,
      options: { rustdeskId: dev.rustdeskId },
    });
    await recordCommand({
      deviceId: id,
      adapter: dev.adapter,
      command: `connect:${dev.adapter}`,
      output: result.url ?? null,
      status: result.ok ? "success" : "failed",
    });
    if (!result.ok) return res.status(501).json({ ok: false, ...result });
    res.json({ ok: true, device: dev, ...result });
  } catch (err) {
    logger.error({ err, id }, "POST /api/devices/:id/connect failed");
    res.status(500).json({ ok: false, error: "connect failed" });
  }
});

devicesRouter.post("/:id/command", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  const command = String((req.body ?? {}).command ?? "").trim();
  if (!command) return res.status(400).json({ ok: false, error: "command required" });
  try {
    const dev = await getDevice(id);
    if (!dev) return res.status(404).json({ ok: false, error: "not found" });
    const adapter = getAdapter(dev.adapter as AdapterName);
    const started = Date.now();
    const out = await adapter.sendCommand(toolCtx(), dev.host, command);
    await recordCommand({
      deviceId: id,
      adapter: dev.adapter,
      command,
      output: out.output ?? out.error ?? null,
      status: out.ok ? "success" : "failed",
      durationMs: Date.now() - started,
    });
    res.json({ ok: out.ok, ...out });
  } catch (err) {
    logger.error({ err, id }, "POST /api/devices/:id/command failed");
    res.status(500).json({ ok: false, error: "command failed" });
  }
});

devicesRouter.post("/:id/screenshot", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const dev = await getDevice(id);
    if (!dev) return res.status(404).json({ ok: false, error: "not found" });
    const adapter = getAdapter(dev.adapter as AdapterName);
    const buf = await adapter.screenshot(toolCtx(), dev.host);
    const ssId = await recordScreenshot({
      deviceId: id,
      adapter: dev.adapter,
      bytes: buf.length,
      width: null,
      height: null,
      storageKey: `bos/${id}/${Date.now()}.png`,
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Screenshot-Id", String(ssId ?? "0"));
    res.send(buf);
  } catch (err) {
    logger.error({ err, id }, "POST /api/devices/:id/screenshot failed");
    res.status(501).json({ ok: false, error: `screenshot not yet implemented for this adapter: ${(err as Error).message}` });
  }
});

devicesRouter.post("/:id/install", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const dev = await getDevice(id);
    if (!dev) return res.status(404).json({ ok: false, error: "not found" });
    const script = scriptForAdapter(dev.adapter as AdapterName);
    const run = await recordInstallRun({
      deviceId: id,
      adapter: dev.adapter,
      script,
      status: "queued",
    });
    res.status(202).json({
      ok: true,
      device: dev,
      installRunId: run?.id ?? null,
      script,
      instructions: `Run on the target Windows PC as Administrator: powershell -ExecutionPolicy Bypass -File ${script}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "install failed" });
  }
});

devicesRouter.get("/:id/commands", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "invalid id" });
  try {
    const cmds = await listCommandsForDevice(id);
    res.json({ ok: true, count: cmds.length, commands: cmds });
  } catch (err) {
    res.status(500).json({ ok: false, error: "list commands failed" });
  }
});

// ─── Tailscale: import status JSON snapshot ────────────────────────────────
devicesRouter.post("/import-tailscale-status", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const raw = body.statusJson;
  if (typeof raw !== "string" || !raw.trim()) {
    return res.status(400).json({ ok: false, error: "statusJson string required" });
  }
  try {
    const adapter = new TailscaleAdapter();
    const peers = adapter.parseStatusJson(raw);
    const created: number[] = [];
    for (const p of peers) {
      if (p.id === "self") continue;
      const existing = await listDevices(false);
      if (existing.some((d) => d.host === p.name || d.tailscaleIp === p.tailscaleIp)) continue;
      const dev = await upsertDevice({
        name: p.name,
        host: p.name,
        adapter: "tailscale",
        tailscaleIp: p.tailscaleIp,
        status: p.online ? "online" : "offline",
        metadata: { os: p.os ?? null, tailscaleId: p.id },
      });
      if (dev?.id) created.push(dev.id);
    }
    res.json({ ok: true, peerCount: peers.length, createdCount: created.length, created });
  } catch (err) {
    res.status(500).json({ ok: false, error: "import failed" });
  }
});

// ─── RustDesk: helper to mint a deep-link URL given ID + pwd ──────────────
devicesRouter.post("/rustdesk/build-connect-url", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  const password = (body.password as string | undefined) ?? undefined;
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  const a = new RustDeskAdapter();
  const url = a.buildConnectUrl(id, password);
  const generatedPwd = a.generateTempPassword();
  res.json({ ok: true, url, generatedPassword: password ? null : generatedPwd });
});

// ─── Bootstrap Installer — serve the .ps1 script from the repo ─────────
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

devicesRouter.get("/bootstrap/bos-omega-bootstrap.ps1", (_req, res) => {
  // Walk up from packages/remote-control/src/routes.ts to repo root.
  const candidates = [
    join(process.cwd(), "scripts/bos-omega-bootstrap.ps1"),
    join(process.cwd(), "../../scripts/bos-omega-bootstrap.ps1"),
    join(process.cwd(), "../../../scripts/bos-omega-bootstrap.ps1"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const text = readFileSync(p, "utf-8");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="bos-omega-bootstrap.ps1"');
      res.send(text);
      return;
    }
  }
  res.status(404).json({ ok: false, error: "bootstrap script not found in repo" });
});

function scriptForAdapter(adapter: AdapterName): string {
  switch (adapter) {
    case "tailscale": return "install-tailscale.ps1";
    case "rustdesk": return "install-rustdesk.ps1";
    case "meshcentral": return "install-meshagent.ps1";
    case "sunshine": return "install-sunshine.ps1";
    case "scrcpy": return "install-scrcpy.ps1";
    default: return `install-${adapter}.ps1`;
  }
}