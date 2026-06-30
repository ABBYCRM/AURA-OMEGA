/**
 * provision-relay.ts
 *
 * Provisions new NVIDIA NIM relay droplets on DigitalOcean and updates
 * DO_RELAY_IPS + triggers a Render redeploy so the new IPs are live immediately.
 *
 * Usage:
 *   DO_API_KEY=<key> RELAY_AUTH_TOKEN=<token> RENDER_API_KEY=<key> \
 *     pnpm --filter @workspace/scripts run provision-relay
 *
 * Each relay is a tiny Debian droplet (s-1vcpu-1gb) that runs an HTTP
 * proxy on :8080 forwarding to integrate.api.nvidia.com. The cloud-init
 * script installs Node.js and starts the relay as a systemd service.
 */

const DO_API = "https://api.digitalocean.com/v2";
const RENDER_API = "https://api.render.com/v1";
const RENDER_SERVICE_ID = process.env["RENDER_SERVICE_ID"] || "srv-d8u653u7r5hc73f3crvg";

// Regions to provision in — spread across 3 continents for AS diversity
const RELAY_REGIONS = [
  { slug: "ams3", name: "Amsterdam" },
  { slug: "sgp1", name: "Singapore" },
  { slug: "tor1", name: "Toronto" },
];

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env var: ${k}`);
  return v;
}

async function doFetch(path: string, init?: RequestInit) {
  const key = requireEnv("DO_API_KEY");
  const r = await fetch(`${DO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!r.ok) throw new Error(`DO API ${path} → ${r.status}: ${await r.text()}`);
  return r.json() as Promise<Record<string, unknown>>;
}

async function renderFetch(path: string, init?: RequestInit) {
  const key = requireEnv("RENDER_API_KEY");
  const r = await fetch(`${RENDER_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
  if (!r.ok) throw new Error(`Render API ${path} → ${r.status}: ${await r.text()}`);
  return r.json() as Promise<unknown>;
}

function makeUserData(relayToken: string): string {
  const relayScript = `
import http from "node:http";
import https from "node:https";

const PORT = 8080;
const AUTH_TOKEN = process.env.RELAY_AUTH_TOKEN;
const TARGET_HOST = "integrate.api.nvidia.com";

http.createServer((req, res) => {
  const token = req.headers["x-relay-token"];
  if (AUTH_TOKEN && token !== AUTH_TOKEN) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const headers = { ...req.headers };
  delete headers["x-relay-token"];
  delete headers["host"];
  const proxyReq = https.request(
    { hostname: TARGET_HOST, port: 443, path: req.url ?? "/", method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  });
  req.pipe(proxyReq, { end: true });
}).listen(PORT, () => console.log(\`nvidia-relay listening on :\${PORT}\`));
`.trim();

  return `#!/bin/bash
set -e
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
mkdir -p /opt/nvidia-relay
cat > /opt/nvidia-relay/relay.mjs << 'RELAYEOF'
${relayScript}
RELAYEOF
cat > /etc/systemd/system/nvidia-relay.service << SVCEOF
[Unit]
Description=NVIDIA NIM Relay
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/nvidia-relay/relay.mjs
Restart=always
Environment=RELAY_AUTH_TOKEN=${relayToken}

[Install]
WantedBy=multi-user.target
SVCEOF
systemctl daemon-reload
systemctl enable --now nvidia-relay
ufw allow 8080/tcp || true
`;
}

async function waitForDropletIp(
  dropletId: number,
  maxWaitMs = 120_000,
): Promise<string> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const data = await doFetch(`/droplets/${dropletId}`);
    const droplet = data["droplet"] as Record<string, unknown>;
    const networks = droplet["networks"] as { v4?: Array<{ ip_address: string; type: string }> };
    const pub = networks?.v4?.find((n) => n.type === "public");
    if (pub?.ip_address) return pub.ip_address;
  }
  throw new Error(`Droplet ${dropletId} never got a public IP within ${maxWaitMs}ms`);
}

async function main() {
  const doKey = requireEnv("DO_API_KEY");
  const relayToken = requireEnv("RELAY_AUTH_TOKEN");
  const renderKey = requireEnv("RENDER_API_KEY");
  void doKey; void renderKey;

  // Read current DO_RELAY_IPS from Render env vars
  console.log("Fetching current Render env vars…");
  const current = (await renderFetch(`/services/${RENDER_SERVICE_ID}/env-vars`)) as Array<{
    envVar: { key: string; value: string };
  }>;
  const existing: Record<string, string> = {};
  for (const e of current) existing[e.envVar.key] = e.envVar.value;

  const currentIps = (existing["DO_RELAY_IPS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  console.log("Current relay IPs:", currentIps.join(", ") || "(none)");

  const userData = makeUserData(relayToken);

  const newIps: string[] = [];
  for (const region of RELAY_REGIONS) {
    console.log(`\nProvisioning relay in ${region.name} (${region.slug})…`);
    const body = {
      name: `nvidia-relay-${region.slug}-${Date.now()}`,
      region: region.slug,
      size: "s-1vcpu-1gb",
      image: "debian-12-x64",
      user_data: userData,
      tags: ["nvidia-relay", "aura-omega"],
    };
    const data = await doFetch("/droplets", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const droplet = data["droplet"] as Record<string, unknown>;
    const id = droplet["id"] as number;
    console.log(`  Droplet created id=${id}, waiting for IP…`);
    const ip = await waitForDropletIp(id);
    console.log(`  IP: ${ip}`);
    newIps.push(ip);
  }

  const allIps = [...new Set([...currentIps, ...newIps])];
  const newValue = allIps.join(",");
  console.log(`\nUpdating DO_RELAY_IPS → ${newValue}`);

  const mergedEnv = { ...existing, DO_RELAY_IPS: newValue };
  const payload = Object.entries(mergedEnv).map(([key, value]) => ({ key, value }));
  await renderFetch(`/services/${RENDER_SERVICE_ID}/env-vars`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  console.log("Triggering Render redeploy…");
  const deploy = (await renderFetch(`/services/${RENDER_SERVICE_ID}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  })) as { id: string; status: string };
  console.log(`Deploy started: id=${deploy.id} status=${deploy.status}`);
  console.log(`\nNew relay pool: ${allIps.length} DO IPs + 4 CF Workers = ${allIps.length + 4} total endpoints`);
  console.log("Monitor: https://dashboard.render.com/web/" + RENDER_SERVICE_ID);
}

main().catch((err) => { console.error(err); process.exit(1); });
