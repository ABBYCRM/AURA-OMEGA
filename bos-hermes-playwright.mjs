/**
 * Hermes runtime Playwright test.
 *
 * Visits /hermes on the live deployment and inspects:
 *   - Page renders without console errors
 *   - Skill library section
 *   - Recent sessions list
 *   - Heartbeat runs successfully
 *   - Captures a screenshot for visual inspection
 */

import { chromium } from "/workspace/repos/aura-omega/node_modules/.pnpm/playwright@1.49.1/node_modules/playwright/index.mjs";

const BASE = process.env.BASE ?? "https://aura-omega.onrender.com";
const CHROME = "/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome";
const OUT = "/workspace/mobile-e2e";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  console.log(`Loading ${BASE}/hermes...`);
  await page.goto(`${BASE}/hermes`, { waitUntil: "load", timeout: 30_000 });
  await page.waitForTimeout(2500);

  // Capture a screenshot
  await page.screenshot({ path: `${OUT}/hermes-iphone14.png`, fullPage: true });

  // Pull the rendered text
  const text = await page.evaluate(() => document.body.innerText);
  const checks = [
    ["Hermes heading", text.includes("Hermes")],
    ["Uptime card", text.includes("Uptime") || text.includes("uptime")],
    ["Skill library", text.includes("Skill library") || text.includes("skills")],
    ["Recent sessions", text.includes("Recent sessions") || text.includes("sessions")],
    ["Heartbeat section", text.includes("Heartbeat") || text.includes("heartbeat")],
    ["Last heartbeat", text.includes("Last heartbeat") || text.includes("LAST HEARTBEAT")],
  ];

  console.log("\n── Hermes page checks ──");
  let pass = 0, fail = 0;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (ok) pass++; else fail++;
  }

  // Test the heartbeat API directly via fetch from inside the page
  console.log("\n── API probes from page context ──");
  const apiChecks = await page.evaluate(async () => {
    const out = {};
    try {
      const r = await fetch("/api/hermes/status");
      out.hermesStatus = await r.json();
    } catch (e) {
      out.hermesStatus = { error: String(e) };
    }
    try {
      const r = await fetch("/api/hermes/sessions");
      out.hermesSessions = await r.json();
    } catch (e) {
      out.hermesSessions = { error: String(e) };
    }
    try {
      const r = await fetch("/api/hermes/skills");
      out.hermesSkills = await r.json();
    } catch (e) {
      out.hermesSkills = { error: String(e) };
    }
    try {
      const r = await fetch("/api/hermes/heartbeat", { method: "POST" });
      out.hermesHeartbeat = await r.json();
    } catch (e) {
      out.hermesHeartbeat = { error: String(e) };
    }
    try {
      const r = await fetch("/api/self-check");
      out.selfCheck = await r.json();
    } catch (e) {
      out.selfCheck = { error: String(e) };
    }
    try {
      const r = await fetch("/api/ai/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Reply with exactly: PONG", agentId: 1 }),
      });
      out.llmComplete = await r.json();
    } catch (e) {
      out.llmComplete = { error: String(e) };
    }
    return out;
  });

  for (const [key, val] of Object.entries(apiChecks)) {
    if (val?.error) {
      console.log(`  ✗ ${key}: ${val.error}`);
      fail++;
    } else if (val?.ok === false && key === "llmComplete") {
      console.log(`  ✗ ${key}: ${JSON.stringify(val).slice(0, 200)}`);
      fail++;
    } else {
      const summary = JSON.stringify(val).slice(0, 150);
      console.log(`  ✓ ${key}: ${summary}`);
      pass++;
    }
  }

  console.log(`\n── Console / page errors ──`);
  console.log(`  Console errors: ${consoleErrors.length}`);
  console.log(`  Page errors:    ${pageErrors.length}`);
  if (consoleErrors.length) console.log("  Sample:", consoleErrors[0]);
  if (pageErrors.length)    console.log("  Sample:", pageErrors[0]);

  console.log(`\n── SUMMARY ──`);
  console.log(`  ${pass} passed, ${fail} failed`);

  // Test scroll behavior — make sure no horizontal scroll
  const dims = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      innerWidth: window.innerWidth,
      scrollWidth: Math.max(html.scrollWidth, body.scrollWidth),
    };
  });
  console.log(`  Viewport: ${dims.innerWidth}px, scrollWidth: ${dims.scrollWidth}px ${dims.scrollWidth > dims.innerWidth ? "✗ horizontal scroll" : "✓ no scroll"}`);

  // Save full diagnostic dump
  const fs = await import("node:fs/promises");
  await fs.writeFile("/workspace/hermes-diag.json", JSON.stringify(apiChecks, null, 2));
  console.log(`\nFull API dump: /workspace/hermes-diag.json`);

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});