# AURA-OMEGA Deploy Handoff

## Verified local status

The local sandbox build passed install, build, tests, and Playwright UI smoke.

## Deploy target

Repository: `ABBYCRM/AURA-OMEGA`
Branch used for evidence: `ai-2026-06-24-mvp-governor-build-test-playwright`
PR: `https://github.com/ABBYCRM/AURA-OMEGA/pull/1`

## Render service settings

Use Render Blueprint from `render.yaml`, or create a Web Service with:

- Runtime: Node
- Build command: `./render-build.sh`
- Start command: `node artifacts/api-server/dist/index.mjs`
- Branch: `main` after PR merge
- Health check path: `/api/health`

## Required env vars

Do not commit values. Set them only in Render env or vault.

- `NODE_ENV=production`
- `PORT=10000`
- `BASE_PATH=/`
- `SESSION_SECRET`
- `DATABASE_URL`
- `AURA_MAX_UPLOAD_MB=100`
- `AURA_HEARTBEAT_LIVE=true` only after safety gates are confirmed
- `N8N_WEBHOOK_BASE_URL`
- `N8N_WEBHOOK_TOKEN`
- `N8N_WEBHOOK_RETRIES=2`
- `N8N_WEBHOOK_TIMEOUT_MS=30000`
- `N8N_LIVE_EXECUTION_DISABLED=false`
- `KIMI_API_KEY` if Kimi is used
- `KIMI_BASE_URL` if Kimi is used
- `KIMI_MODEL=kimi-k2.6`
- provider keys as needed: OpenRouter, OpenAI, Gemini, Pinecone, Tavily, Exa, Composio, Render, GitHub, etc.

## n8n setup

Set:

- `N8N_WEBHOOK_BASE_URL` to the n8n base webhook or MCP-compatible base URL.
- `N8N_WEBHOOK_TOKEN` to the n8n token.

Do not place the bearer token in code, README, logs, or PR body.

## Post-deploy verification commands

Run after Render deploy is live:

```bash
curl -fsS https://YOUR_RENDER_SERVICE.onrender.com/api/health
curl -fsS https://YOUR_RENDER_SERVICE.onrender.com/api/n8n/tasks
curl -fsS https://YOUR_RENDER_SERVICE.onrender.com/api/mvp-governor
```

Then run Playwright against the live URL:

```bash
BASE_URL=https://YOUR_RENDER_SERVICE.onrender.com pnpm --filter @workspace/scripts run ui-smoke
```

## Manual deploy evidence required

Record:

- Render deploy ID
- Render service URL
- build log status
- health endpoint status
- n8n dispatch test result
- Playwright live smoke result
