import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:4173";
const OUT = "/tmp/claude-0/-home-user-AURA-OMEGA/65ee1616-6be0-55f3-adeb-4cb792ecb109/scratchpad/qa-audit/interactions";
mkdirSync(OUT, { recursive: true });

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

const results = [];
function log(section, msg) {
  console.log(`[${section}] ${msg}`);
  results.push({ section, msg });
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

// ---------- 1. LOGIN EDGE CASES ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const consoleErrs = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrs.push("PAGEERROR: " + String(e).slice(0, 200)));

  await page.route("**/api/auth/me", (route) => route.fulfill(json({ error: "not authenticated" }, 401)));
  let loginCallCount = 0;
  await page.route("**/api/auth/login", (route) => {
    loginCallCount++;
    const postData = route.request().postDataJSON();
    if (postData?.username === "baduser") {
      return route.fulfill(json({ error: "Invalid username or password" }, 401));
    }
    return route.fulfill(json({ ok: true, user: { username: postData?.username } }));
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(800);

  // Edge case A: empty fields -> submit button should be disabled
  const btn = page.locator('[data-testid="button-login"]');
  const btnVisible = await btn.isVisible().catch(() => false);
  log("login", `Login form visible: ${btnVisible}`);
  if (btnVisible) {
    const disabledEmpty = await btn.isDisabled();
    log("login", `Submit button disabled with empty fields: ${disabledEmpty} (expected: true)`);

    // Edge case B: very long username/password input handling
    const longStr = "a".repeat(5000);
    await page.fill('[data-testid="input-username"]', longStr);
    await page.fill('[data-testid="input-password"]', longStr);
    const disabledLong = await btn.isDisabled();
    log("login", `Submit button disabled with 5000-char inputs: ${disabledLong} (expected: false, should be enabled)`);

    // Edge case C: invalid credentials -> 401 -> error message shown
    await page.fill('[data-testid="input-username"]', "baduser");
    await page.fill('[data-testid="input-password"]', "wrongpass");
    await btn.click();
    await page.waitForTimeout(600);
    const alertVisible = await page.locator('[role="alert"]').isVisible().catch(() => false);
    const alertText = alertVisible ? await page.locator('[role="alert"]').innerText() : null;
    log("login", `Error alert shown after invalid creds: ${alertVisible}, text="${alertText}"`);

    // Edge case D: rapid repeated clicks while pending (race condition check)
    // use force:true + dispatchEvent to bypass Playwright's actionability wait, since the
    // button legitimately disables itself after the first click (that's the behavior under test)
    await page.fill('[data-testid="input-username"]', "gooduser");
    await page.fill('[data-testid="input-password"]', "goodpass");
    loginCallCount = 0;
    await Promise.all([
      btn.dispatchEvent("click").catch(() => {}),
      btn.dispatchEvent("click").catch(() => {}),
      btn.dispatchEvent("click").catch(() => {}),
    ]);
    await page.waitForTimeout(800);
    log("login", `Login API calls triggered by 3 rapid clicks: ${loginCallCount} (expected: 1 if debounced/disabled-on-pending)`);
  }
  log("login", `Console errors during login flow: ${JSON.stringify(consoleErrs)}`);
  await ctx.close();
}

// ---------- 2. CHAT COMPOSER EDGE CASES ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const consoleErrs = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrs.push("PAGEERROR: " + String(e).slice(0, 200)));

  let messages = [];
  let postCount = 0;
  // registered first = lowest priority (generic fallback for any unhandled endpoint)
  await page.route("**/api/**", (route) => route.fulfill(json({ ok: true })));
  await page.route("**/api/auth/me", (route) => route.fulfill(json({ authenticated: true, username: "qa", displayName: "QA" })));
  await page.route("**/api/channels", (route) => {
    if (route.request().method() === "GET") return route.fulfill(json([{ id: 1, name: "QA Channel", agentId: 1 }]));
    return route.fulfill(json({ id: 2, name: "New Channel" }));
  });
  await page.route("**/api/channels/*/messages", (route) => {
    if (route.request().method() === "GET") return route.fulfill(json(messages));
    postCount++;
    const postData = route.request().postDataJSON();
    const msg = { id: postCount, role: "user", content: postData?.content ?? "", createdAt: new Date().toISOString() };
    messages.push(msg);
    return route.fulfill(json(msg));
  });
  await page.route("**/api/agents", (route) => route.fulfill(json([{ id: 1, name: "ABBY", status: "idle" }])));

  await page.goto(`${BASE}/chat?c=1`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(1000);

  const textarea = page.locator('textarea[aria-label="Message"]');
  const taVisible = await textarea.isVisible().catch(() => false);
  log("chat", `Composer textarea visible: ${taVisible}`);

  if (taVisible) {
    // Edge case A: empty send (click send / press Enter with no text)
    const beforeCount = postCount;
    await textarea.press("Enter");
    await page.waitForTimeout(400);
    log("chat", `POST fired on empty Enter press: ${postCount > beforeCount} (expected: false)`);

    // Edge case B: extremely long message (10,000 chars)
    const longMsg = "QA stress test message. ".repeat(420); // ~10,000 chars
    await textarea.fill(longMsg);
    const valLen = await textarea.inputValue();
    log("chat", `Long message (${longMsg.length} chars) accepted into textarea: length=${valLen.length}`);
    const beforeCount2 = postCount;
    await textarea.press("Enter");
    await page.waitForTimeout(500);
    log("chat", `POST fired after long-message Enter: ${postCount > beforeCount2}`);

    // Edge case C: rapid repeated Enter/send (duplicate submission race)
    await textarea.fill("rapid test");
    const beforeCount3 = postCount;
    await Promise.all([textarea.press("Enter"), textarea.press("Enter"), textarea.press("Enter")]);
    await page.waitForTimeout(600);
    log("chat", `POSTs fired from 3 rapid Enter presses on "rapid test": ${postCount - beforeCount3} (expected: 1, else duplicate-submit bug)`);
  }
  log("chat", `Console errors during chat flow: ${JSON.stringify(consoleErrs)}`);
  await ctx.close();
}

// ---------- 3. API FAILURE RESILIENCE ----------
{
  const pagesToTest = [
    { path: "/agents", name: "agents" },
    { path: "/tasks", name: "tasks" },
    { path: "/missions", name: "missions" },
    { path: "/cron", name: "cron" },
  ];
  for (const p of pagesToTest) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
    // force every other API call to 500 (registered first = lower priority)
    await page.route("**/api/**", (route) => route.fulfill(json({ error: "Internal Server Error" }, 500)));
    // auth/me must succeed so we actually reach the dashboard page under test (registered last = highest priority)
    await page.route("**/api/auth/me", (route) => route.fulfill(json({ authenticated: true, username: "qa", displayName: "QA" })));
    let crashed = false;
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(8000); // let react-query exhaust its default retry/backoff before judging final state
      const bodyText = await page.evaluate(() => document.body.innerText.trim());
      crashed = bodyText.length === 0;
      const hasRetryOrError = /retry|error|fail|unreachable|couldn.t/i.test(bodyText);
      log("api-resilience", `${p.name}: bodyEmpty=${crashed}, showsErrorUI=${hasRetryOrError}, pageErrors=${JSON.stringify(pageErrors)}, bodySnippet="${bodyText.slice(0, 150).replace(/\n/g, " ")}"`);
    } catch (e) {
      log("api-resilience", `${p.name}: NAVIGATION THREW: ${String(e).slice(0, 200)}`);
    }
    await ctx.close();
  }
}

await browser.close();
console.log("\n=== SUMMARY ===");
for (const r of results) console.log(`[${r.section}] ${r.msg}`);
