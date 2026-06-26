import type { EngineAdapter, EngineResult } from "./registry";

/**
 * HTTP engine — minimal raw HTTP request runner, used as fallback when
 * the OpenHands engine's tool runner isn't wired (dev mode).
 */
export const httpEngine: EngineAdapter = {
  name: "http",
  async run(step) {
    const started = Date.now();
    const url = String(step.args.url ?? "");
    if (!url) return { ok: false, error: "no url", durationMs: Date.now() - started };
    try {
      const r = await fetch(url, { method: (step.args.method as string) ?? "GET" });
      const text = await r.text();
      return {
        ok: r.ok,
        output: text.slice(0, 2000),
        evidence: `HTTP ${r.status}`,
        durationMs: Date.now() - started,
        facts: { status: r.status },
      };
    } catch (err) {
      return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
    }
  },
};