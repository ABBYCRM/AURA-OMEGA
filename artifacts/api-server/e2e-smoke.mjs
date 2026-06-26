// Hermes end-to-end smoke: exercises every Hermes public endpoint against the
// live Render deployment. Each step round-trips through the live Postgres
// (nudge INSERT -> heartbeat drain -> SELECT skills/sessions/status).
// Run from the repo root: node artifacts/api-server/e2e-smoke.mjs

const BASE = "https://aura-omega.onrender.com";
const TAG = `[e2e-${Date.now()}]`;

async function step(name, fn) {
  process.stdout.write(`[${name}] ... `);
  try {
    const r = await fn();
    console.log("PASS", r ? `(${JSON.stringify(r).slice(0, 80)})` : "");
    return true;
  } catch (e) {
    console.log("FAIL", e.message);
    return false;
  }
}

const ok1 = await step("POST /api/hermes/nudges {kind:'self_check'}", async () => {
  const r = await fetch(`${BASE}/api/hermes/nudges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "self_check", payload: { tag: TAG } }),
  });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return await r.json();
});

const ok2 = await step("POST /api/hermes/heartbeat", async () => {
  const r = await fetch(`${BASE}/api/hermes/heartbeat`, { method: "POST" });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return await r.json();
});

const ok3 = await step("GET /api/hermes/skills", async () => {
  const r = await fetch(`${BASE}/api/hermes/skills`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return await r.json();
});

const ok4 = await step("GET /api/hermes/sessions", async () => {
  const r = await fetch(`${BASE}/api/hermes/sessions`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return await r.json();
});

const ok5 = await step("GET /api/hermes/status", async () => {
  const r = await fetch(`${BASE}/api/hermes/status`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return await r.json();
});

if (ok1 && ok2 && ok3 && ok4 && ok5) {
  console.log("\nE2E SMOKE: PASS — all 5 Hermes endpoints round-trip through live Postgres.");
  process.exit(0);
} else {
  console.log("\nE2E SMOKE: FAIL — see above.");
  process.exit(1);
}