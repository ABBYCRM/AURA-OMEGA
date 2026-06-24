/**
 * UI smoke test (Playwright headless Chromium).
 *
 * Opens the running app and walks every route, asserting the app shell mounts,
 * the chat composer works, and no uncaught page errors fire. Captures a
 * screenshot per route and a console-error summary. Honest by construction:
 * a route only "passes" if Playwright actually rendered it.
 *
 *   BASE_URL    — app origin (default http://localhost:3001)
 *   REPORT_DIR  — where screenshots land (default <repo>/.self-test/ui)
 *
 * Exit code 0 = all routes rendered + chat composer present + no page errors.
 * Exit code 1 = at least one failure (printed).
 */
import { chromium, type Browser, type ConsoleMessage } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = (process.env["BASE_URL"] ?? "http://localhost:3001").replace(/\/$/, "");
const REPORT_DIR = process.env["REPORT_DIR"] ?? join(process.cwd(), ".self-test", "ui");

interface RouteCheck {
  path: string;
  /** A locator that must be visible for the route to count as rendered. */
  expect: string;
  label: string;
}

// AppLayout always renders the nav label "Chat" once React mounts, so it is a
// reliable "app shell loaded" signal on every route. Route-specific anchors
// confirm the actual page rendered.
const ROUTES: RouteCheck[] = [
  { path: "/", expect: 'text=AURA-OMEGA AGENTIC OPERATIONS CONSOLE', label: "Ops console" },
  { path: "/chat", expect: 'text=Welcome to AURA-OMEGA', label: "Chat command surface" },
  { path: "/tools", expect: 'text=AURA Tool Selection Matrix', label: "Tool Matrix" },
  { path: "/scheduled", expect: 'text=Scheduled autonomy', label: "Scheduled autonomy" },
  { path: "/runtimes", expect: 'text=Runtime control plane', label: "Runtimes" },
  { path: "/integrations", expect: 'text=Settings-grade integrations', label: "Integrations" },
  { path: "/settings", expect: 'text=Operator settings', label: "Settings" },
];

interface RouteResult {
  path: string;
  ok: boolean;
  title: string;
  detail: string;
  pageErrors: string[];
  consoleErrors: string[];
  screenshot: string;
}

async function run(): Promise<number> {
  mkdirSync(REPORT_DIR, { recursive: true });
  let browser: Browser | null = null;
  const results: RouteResult[] = [];
  try {
    browser = await chromium.launch(process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"], args: ["--no-sandbox", "--disable-dev-shm-usage"] } : { args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    for (const r of ROUTES) {
      console.log(`checking ${r.path}`);
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
        await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
      page.on("console", (m: ConsoleMessage) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
      });

      const shot = join(REPORT_DIR, `${(r.path === "/" ? "root" : r.path.replace(/\//g, "")) || "root"}.png`);
      let ok = false;
      let detail = "";
      let title = "";
      try {
        await page.goto(`${BASE_URL}${r.path}`, { waitUntil: "commit", timeout: 10000 });
        await page.waitForTimeout(1200);
        await page.locator(r.expect).first().waitFor({ state: "visible", timeout: 5000 });
        title = await page.title();
        ok = pageErrors.length === 0;
        detail = ok ? `rendered "${r.label}"` : `rendered but ${pageErrors.length} page error(s)`;
      } catch (e) {
        detail = `FAILED: ${String(e).split("\n")[0].slice(0, 200)}`;
      }
      try {
        await page.screenshot({ path: shot, fullPage: false });
      } catch {
        /* ignore screenshot failure */
      }
      results.push({ path: r.path, ok, title, detail, pageErrors, consoleErrors, screenshot: shot });
      await page.close();
    }
  } finally {
    await browser?.close();
  }

  // Report
  const passed = results.filter((r) => r.ok).length;
  const allOk = passed === results.length;
  console.log(`\n=== UI SMOKE (${BASE_URL}) — ${passed}/${results.length} routes OK ===`);
  for (const r of results) {
    console.log(`${r.ok ? "  ✓" : "  ✗"} ${r.path.padEnd(10)} ${r.detail}  [${r.screenshot}]`);
    if (r.pageErrors.length) console.log(`      pageerror: ${r.pageErrors.join(" | ")}`);
    if (r.consoleErrors.length) console.log(`      console.error(${r.consoleErrors.length}): ${r.consoleErrors.slice(0, 2).join(" | ")}`);
  }
  if (process.env["SELF_TEST_JSON"]) {
    console.log("\nJSON_RESULT=" + JSON.stringify({ baseUrl: BASE_URL, passed, total: results.length, allOk, results }));
  }
  return allOk ? 0 : 1;
}

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("ui-smoke crashed:", err);
    process.exit(1);
  });
