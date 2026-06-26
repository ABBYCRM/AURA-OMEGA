/**
 * BOS-OMEGA /api/devices/* routes.
 *
 * Round A: stub routes that respond with "not implemented yet" so the URL
 * surface exists and can be smoke-tested. Real handlers land in Round B/C.
 *
 * The api-server mounts this router at /api/devices via routes/index.ts.
 */

import { Router } from "express";
import { getAdapter, listAdapters } from "./adapters";

export const devicesRouter: Router = Router();

function notImpl(adapter: string, method: string): {
  ok: false;
  status: "not_implemented";
  message: string;
} {
  return {
    ok: false,
    status: "not_implemented",
    message: `adapter[${adapter}].${method} lands in a later round. See docs/remote-control-stack.md.`,
  };
}

devicesRouter.get("/status", (_req, res) => {
  res.json({
    ok: true,
    runtime: "remote-control",
    adapters: listAdapters().map((a) => ({ name: a.name, stage: a.stage })),
    note: "Round A scaffold — methods throw not-implemented until their stage lands.",
  });
});

devicesRouter.get("/", async (_req, res) => {
  // Real implementation lands in Round B (DB-backed bos_devices table).
  res.json({ ok: true, devices: [], note: "device registry lands in Round B" });
});

devicesRouter.get("/:id/status", async (req, res) => {
  const id = req.params.id;
  // We don't yet know which adapter owns this device — for now respond 501.
  res.status(501).json({ ok: false, ...notImpl(id, "status") });
});

devicesRouter.post("/:id/connect", async (req, res) => {
  const id = req.params.id;
  res.status(501).json({ ok: false, ...notImpl(id, "connect") });
});

devicesRouter.post("/:id/command", async (req, res) => {
  const id = req.params.id;
  res.status(501).json({ ok: false, ...notImpl(id, "sendCommand") });
});

devicesRouter.post("/:id/screenshot", async (req, res) => {
  const id = req.params.id;
  res.status(501).json({ ok: false, ...notImpl(id, "screenshot") });
});

devicesRouter.post("/:id/install", async (req, res) => {
  const id = req.params.id;
  res.status(501).json({ ok: false, ...notImpl(id, "install") });
});

// Helper for adapter-specific error testing — confirms the registry works.
devicesRouter.get("/_test/:adapter/:method", async (req, res) => {
  try {
    const a = getAdapter(req.params.adapter as Parameters<typeof getAdapter>[0]);
    const method = req.params.method as keyof typeof a;
    const fn = (a as unknown as Record<string, (...args: unknown[]) => unknown>)[method];
    if (typeof fn !== "function") {
      return res.status(400).json({ ok: false, error: `no method ${String(method)} on ${req.params.adapter}` });
    }
    try {
      await fn.call(a, { agentId: 0, agentName: "test", agentColor: "#000", channelId: null }, "test-host");
      res.json({ ok: true });
    } catch (err) {
      res.status(501).json({ ok: false, error: String((err as Error).message).slice(0, 200) });
    }
  } catch (err) {
    res.status(400).json({ ok: false, error: String((err as Error).message) });
  }
});