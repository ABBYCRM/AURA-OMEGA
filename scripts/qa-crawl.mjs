import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:4173";
const OUT = "/tmp/claude-0/-home-user-AURA-OMEGA/65ee1616-6be0-55f3-adeb-4cb792ecb109/scratchpad/qa-audit";
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/screens`, { recursive: true });

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

const ROUTES = [
  { path: "/", name: "root-redirect" },
  { path: "/chat?c=1", name: "chat" },
  { path: "/hermes", name: "hermes" },
  { path: "/swarm", name: "swarm-dashboard" },
  { path: "/agents", name: "agents" },
  { path: "/tasks", name: "tasks" },
  { path: "/scheduled", name: "scheduled" },
  { path: "/cron", name: "cron" },
  { path: "/tools", name: "tool-matrix" },
  { path: "/runtimes", name: "runtimes" },
  { path: "/integrations", name: "integrations" },
  { path: "/settings", name: "settings" },
  { path: "/scratchpad", name: "scratchpad" },
  { path: "/remote", name: "remote" },
  { path: "/missions", name: "missions" },
  { path: "/reference", name: "reference" },
  { path: "/this-route-does-not-exist", name: "not-found" },
];

function json(body) {
  return { contentType: "application/json", body: JSON.stringify(body) };
}

async function mockApi(page) {
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();

    // auth
    if (p === "/api/auth/me") return route.fulfill(json({ authenticated: true, username: "luis", displayName: "Luis" }));
    if (p === "/api/auth/login") return route.fulfill(json({ authenticated: true, username: "luis" }));
    if (p === "/api/auth/logout") return route.fulfill(json({ ok: true }));

    // channels / chat
    if (p === "/api/channels" && m === "GET") return route.fulfill(json([
      { id: 1, name: "Q3 marketing plan", type: "general" },
      { id: 2, name: "Competitor research", type: "general" },
      { id: 3, name: "A really long conversation thread title that should truncate nicely in the sidebar", type: "general" },
    ]));
    if (p === "/api/channels" && m === "POST") return route.fulfill(json({ id: 99, name: "New chat", type: "general" }));
    if (/^\/api\/channels\/\d+$/.test(p)) return route.fulfill(json({ ok: true }));
    if (/^\/api\/channels\/\d+\/messages$/.test(p) && m === "GET") return route.fulfill(json([
      { id: 1, channelId: 1, messageType: "user", content: "Can you research the EV market and summarize TAM/SAM/SOM?", timestamp: new Date().toISOString() },
      { id: 2, channelId: 1, messageType: "agent", agentName: "ABBY", agentColor: "#22d3ee", content: "On it. Here's a structured breakdown.", timestamp: new Date().toISOString() },
    ]));
    if (/^\/api\/channels\/\d+\/messages$/.test(p) && m === "POST") return route.fulfill(json({ id: 3, channelId: 1, messageType: "user", content: "ok", timestamp: new Date().toISOString() }));

    // agents
    if (p === "/api/agents") return route.fulfill(json([
      { id: 1, name: "ABBY", role: "orchestrator", status: "online" },
      { id: 2, name: "AURA-1", role: "worker", status: "online" },
      { id: 3, name: "AURA-2", role: "worker", status: "idle" },
    ]));
    if (/^\/api\/agents\/\d+\/telemetry$/.test(p)) return route.fulfill(json({ cpu: 12, mem: 34 }));
    if (/^\/api\/agents\/\d+\/tasks$/.test(p)) return route.fulfill(json([]));
    if (/^\/api\/agents\/\d+$/.test(p)) return route.fulfill(json({ id: 1, name: "ABBY", role: "orchestrator", status: "online" }));

    // tasks
    if (p === "/api/tasks" && m === "GET") return route.fulfill(json([
      { id: 1, title: "Scrape competitor pricing", description: "Pull pricing tables from 5 competitor sites", status: "running", priority: "high", progress: 42, agentName: "AURA-1" },
      { id: 2, title: "Draft Q3 plan", status: "queued", priority: "medium", progress: 0, agentName: null },
      { id: 3, title: "Summarize EV market", status: "completed", priority: "low", progress: 100, agentName: "ABBY" },
      { id: 4, title: "Crashed scrape job", status: "failed", priority: "critical", progress: 18, agentName: "AURA-2" },
    ]));
    if (p === "/api/tasks" && m === "POST") return route.fulfill(json({ id: 5 }));
    if (/^\/api\/tasks\/\d+$/.test(p)) return route.fulfill(json({ ok: true }));

    // swarm
    if (p === "/api/swarm/status") return route.fulfill(json({ status: "running", agents: 5 }));
    if (p === "/api/swarm/pause" || p === "/api/swarm/resume") return route.fulfill(json({ ok: true }));

    // vault / integrations
    if (p === "/api/vault" && m === "GET") return route.fulfill(json({ secrets: [{ name: "NVIDIA_API_KEY", description: "LLM provider key" }] }));
    if (p === "/api/vault" && m === "PUT") return route.fulfill(json({ ok: true }));
    if (/^\/api\/vault\//.test(p)) return route.fulfill(json({ ok: true }));
    if (p === "/api/integrations") return route.fulfill(json({ nvidia: true, discord: true, composio: false }));
    if (p === "/api/integrations/composio/toolkits") return route.fulfill(json({ toolkits: [{ slug: "gmail", name: "Gmail" }, { slug: "slack", name: "Slack" }] }));
    if (p === "/api/integrations/composio/connect") return route.fulfill(json({ url: "https://connect.composio.dev/fake" }));

    // social
    if (p === "/api/social/platforms") return route.fulfill(json([]));

    // cron
    if (p === "/api/cron" && m === "GET") return route.fulfill(json([
      { id: 1, name: "Daily digest", schedule: "0 9 * * *", enabled: true },
      { id: 2, name: "Weekly cleanup", schedule: "0 0 * * 0", enabled: false },
    ]));
    if (p === "/api/cron" && m === "POST") return route.fulfill(json({ id: 3 }));
    if (/^\/api\/cron\/\d+$/.test(p)) return route.fulfill(json({ ok: true }));
    if (/^\/api\/cron\/\d+\/trigger$/.test(p)) return route.fulfill(json({ ok: true }));
    if (p === "/api/n8n/autonomy/heartbeat") return route.fulfill(json({ ok: true, lastRun: new Date().toISOString() }));
    if (/^\/api\/n8n\/autonomy\/heartbeat\/run\//.test(p)) return route.fulfill(json({ ok: true }));
    if (p === "/api/n8n/tool-intents") return route.fulfill(json({ intents: [] }));
    if (p === "/api/n8n/tool-intents/select") return route.fulfill(json({ tool: "firecrawl" }));

    // hermes / discord
    if (p === "/api/hermes/status") return route.fulfill(json({ ok: true, status: "online" }));
    if (p === "/api/hermes/skills") return route.fulfill(json({ skills: [] }));
    if (p === "/api/hermes/sessions") return route.fulfill(json({ sessions: [] }));
    if (p === "/api/hermes/heartbeat") return route.fulfill(json({ ok: true }));
    if (p === "/api/discord/status") return route.fulfill(json({ enabled: true, tokenConfigured: true, channelConfigured: true, channelId: "123" }));

    // missions
    if (p === "/api/missions/stats") return route.fulfill(json({ total: 4, running: 1, completed: 2, failed: 1 }));
    if (p === "/api/missions" && m === "GET") return route.fulfill(json([
      { id: 1, title: "Daily competitor scan", status: "running", progress: 60 },
      { id: 2, title: "Outreach campaign", status: "completed", progress: 100 },
    ]));
    if (p === "/api/missions" && m === "POST") return route.fulfill(json({ id: 3 }));
    if (/^\/api\/missions\/\d+\/(cancel|retry)$/.test(p)) return route.fulfill(json({ ok: true }));
    if (/^\/api\/missions\/\d+$/.test(p)) return route.fulfill(json({ id: 1, title: "Daily competitor scan", status: "running", progress: 60 }));

    // uploads / scratchpad / agent-scratch
    if (p === "/api/uploads") return route.fulfill(json({ url: "https://example.com/fake.png" }));
    if (p === "/api/scratchpad" && m === "GET") return route.fulfill(json({ content: "Pinned context note." }));
    if (p === "/api/scratchpad" && m === "POST") return route.fulfill(json({ ok: true }));
    if (p === "/api/agent-scratch") return route.fulfill(json({ entries: [] }));

    // settings
    if (p === "/api/settings/runtime" && m === "GET") return route.fulfill(json({ provider: "nvidia", model: "llama-3.1-70b" }));
    if (p === "/api/settings/runtime" && m === "POST") return route.fulfill(json({ ok: true }));
    if (p === "/api/settings/personality" && m === "GET") return route.fulfill(json({ tone: "direct" }));
    if (p === "/api/settings/personality" && m === "POST") return route.fulfill(json({ ok: true }));

    // runtimes
    if (p === "/api/ai/models") return route.fulfill(json({ models: ["llama-3.1-70b", "nvidia-nim"] }));
    if (p === "/api/self-check") return route.fulfill(json({ ok: true, checks: [] }));

    // reference
    if (p === "/api/reference") return route.fulfill(json({ docs: [] }));

    // remote devices
    if (p === "/api/devices/status") return route.fulfill(json({ ok: true }));
    if (p === "/api/devices/stats") return route.fulfill(json({ total: 0, online: 0 }));
    if (p === "/api/devices" && m === "GET") return route.fulfill(json([]));
    if (p === "/api/devices" && m === "POST") return route.fulfill(json({ ok: true }));
    if (/^\/api\/devices\/[^/]+\/(connect|status|screenshot)$/.test(p)) return route.fulfill(json({ ok: true }));
    if (/^\/api\/devices\/[^/]+\/commands$/.test(p)) return route.fulfill(json([]));
    if (/^\/api\/devices\/[^/]+\/command$/.test(p)) return route.fulfill(json({ ok: true }));

    if (p === "/api/healthz") return route.fulfill(json({ ok: true }));

    // unknown endpoint -> log + fail loud so we can detect it as a real gap
    console.log(`[UNMOCKED] ${m} ${p}`);
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not mocked" }) });
  });
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const allResults = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });

  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const consoleMsgs = [];
    const pageErrors = [];
    const netFailures = [];
    const unmocked = [];

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        consoleMsgs.push({ type: msg.type(), text: msg.text().slice(0, 300) });
      }
      if (msg.text().startsWith("[UNMOCKED]")) unmocked.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 500)));
    page.on("response", (res) => {
      if (res.status() >= 400 && res.url().includes("/api/")) {
        netFailures.push({ url: res.url().replace(BASE, ""), status: res.status() });
      }
    });
    page.on("requestfailed", (req) => {
      netFailures.push({ url: req.url().replace(BASE, ""), status: "FAILED", error: req.failure()?.errorText });
    });

    await mockApi(page);

    let loadError = null;
    try {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(1100);
    } catch (e) {
      loadError = String(e).slice(0, 300);
    }

    // a11y + layout scan
    let a11y = null;
    let layout = null;
    if (!loadError) {
      try {
        a11y = await page.evaluate(() => {
          const g = globalThis;
          const doc = g.document;
          const buttonsNoName = Array.from(doc.querySelectorAll("button")).filter((b) => {
            const hasText = (b.textContent || "").trim().length > 0;
            const hasAria = b.hasAttribute("aria-label") || b.hasAttribute("aria-labelledby");
            const hasTitle = b.hasAttribute("title");
            return !hasText && !hasAria && !hasTitle;
          }).length;
          const imgsNoAlt = Array.from(doc.querySelectorAll("img")).filter((i) => !i.hasAttribute("alt")).length;
          const inputsNoLabel = Array.from(doc.querySelectorAll("input, textarea, select")).filter((el) => {
            const id = el.getAttribute("id");
            const hasLabel = id && doc.querySelector(`label[for="${id}"]`);
            const hasAria = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
            const hasPlaceholder = el.hasAttribute("placeholder");
            return !hasLabel && !hasAria && !hasPlaceholder;
          }).length;
          const linksNoHref = Array.from(doc.querySelectorAll("a")).filter((a) => !a.hasAttribute("href")).length;
          return { buttonsNoName, imgsNoAlt, inputsNoLabel, linksNoHref, totalButtons: doc.querySelectorAll("button").length };
        });
        layout = await page.evaluate(() => {
          const g = globalThis;
          return {
            scrollW: g.document.documentElement.scrollWidth,
            innerW: g.innerWidth,
            overflowX: g.document.documentElement.scrollWidth - g.innerWidth,
            bodyText: (g.document.body.innerText || "").slice(0, 80),
          };
        });
      } catch (e) {
        a11y = { error: String(e).slice(0, 200) };
      }
    }

    const shotPath = `${OUT}/screens/${route.name}-${vp.name}.png`;
    try {
      await page.screenshot({ path: shotPath, fullPage: false });
    } catch {}

    allResults.push({
      route: route.path,
      name: route.name,
      viewport: vp.name,
      loadError,
      consoleMsgs,
      pageErrors,
      netFailures,
      unmocked: [...new Set(unmocked)],
      a11y,
      layout,
      screenshot: shotPath,
    });

    await page.close();
  }
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(allResults, null, 2));
console.log(`DONE. Wrote ${allResults.length} results to ${OUT}/results.json`);
