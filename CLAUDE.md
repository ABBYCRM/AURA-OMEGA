# AURA-OMEGA — Claude Code Rules

## Branch & Push Protocol (MANDATORY)

Every push MUST follow this pattern:

**Branch name format:**
```
YYYY-MM-DD/<what-changed>
```
Examples:
- `2026-06-25/nvidia-nim-llm-routing`
- `2026-06-25/ux-redesign-sidebar-chat-bubbles`
- `2026-06-26/fix-agent-seed-idempotency`

**Rules:**
1. Branch is ALWAYS cut from the latest `main` — never lose existing functionality
2. Before cutting a new branch, pull/fetch `main` first to ensure the base is current
3. Merge strategy: the feature branch must contain ALL of `main` + the new changes
4. After merging/pushing to `main`, delete the feature branch locally (keep remote for audit)
5. Commit messages: descriptive, present-tense, scope-prefixed (`feat:`, `fix:`, `chore:`, `refactor:`)

## Self-Healing Rule

Before surfacing ANY error, blocker, or hook failure to the user:
1. Read the error fully
2. Ask: "Can I fix this myself?" — if yes, fix it silently and continue
3. Only escalate if the fix requires a decision only the operator can make
   (e.g. a secret key, a destructive data action, a policy call)

## Always End With

After every completed push, append the live frontend URL:

**Live site: https://aura-omega.onrender.com**

## Project Context

- **Stack:** React + Vite + TypeScript + Tailwind v4 (frontend), Express ESM (API server), PostgreSQL via Drizzle ORM
- **Deployment:** Render free tier — dist is pre-built and committed, `buildCommand: echo "dist is prebuilt"`
- **LLM provider:** NVIDIA NIM (`NVIDIA_API_KEY`) → llama-3.1-70b fallback → Kimi.com tertiary. **No OpenRouter models.**
- **Agents:** ABBY (orchestrator, id=1), AURA-1 through AURA-5 (ids 2–6)
- **SESSION_SECRET** is the AES-256-GCM vault key — NEVER change it, NEVER commit it
- **No secrets in repo** — all keys live in Render env vars only

## Infrastructure (DigitalOcean) — Added 2026-06-30

Three DO droplets are live. IPs and tokens are in Render env vars only — never commit them.

### aura-workspace (persistent coding runtime)
- **Region:** NYC1 | **Size:** s-2vcpu-4gb
- **Role:** Persistent shell for AURA-1. Files survive between agent calls under `/workspace`.
  Runs an HTTP exec API on port 7070: `POST /` with `{ command, cwd, timeout }` → `{ stdout, stderr, exitCode }`.
- **Env var:** `DO_WORKSPACE_URL` (IP:7070), `DO_WORKSPACE_TOKEN` (exec auth header `x-exec-token`)
- **Tool:** `do_exec` — available to AURA-1 (id=2) and ABBY (id=1, all tools)

### nvidia-relay-do-1 (NVIDIA NIM relay — DigitalOcean NYC3)
- **Region:** NYC3 | **Size:** s-1vcpu-1gb
- **Role:** HTTP relay on port 8080, forwards requests to `integrate.api.nvidia.com`.
  Complements the 4 Cloudflare Workers relays (AS13335) with genuine AS14061 diversity.
- **Auth:** `RELAY_AUTH_TOKEN` env var (header `x-relay-token` stripped before forwarding)

### nvidia-relay-do-2 (NVIDIA NIM relay — DigitalOcean SFO3)
- **Region:** SFO3 | **Size:** s-1vcpu-1gb
- **Role:** Same as above, different US region for geographic redundancy.

### Relay routing
`getRelayBaseUrls()` in `integrations.ts` returns: 4 CF Workers (`*.workers.dev/v1`) + 2 DO relay IPs
from `DO_RELAY_IPS` env var (comma-separated). `DO_RELAY_IPS=<nyc3-ip>,<sfo3-ip>`.

### Required Render env vars (DO-related)
```
DO_API_KEY            # DigitalOcean personal access token
DO_RELAY_IPS          # comma-separated IPs of the two relay droplets
DO_WORKSPACE_URL      # http://<workspace-ip>:7070
DO_WORKSPACE_TOKEN    # exec auth token for workspace API
RELAY_AUTH_TOKEN      # token required in x-relay-token header to use relay
```

## Scraping Stack — Updated 2026-06-30

Four-tier web scraping pipeline in `steelScrape()` (`tools.ts`):
1. **Steel** — direct (no proxy)
2. **Steel** — with residential proxy
3. **ScrapingBee** — `SCRAPINGBEE_API_KEY` (residential proxy, no JS render by default)
4. **ScrapFly** — `SCRAPFLY_API_KEY` (fallback, country=us)

**IMPORTANT:** ScrapingBee is for web scraping ONLY. It strips `Authorization: Bearer` headers and
MUST NOT be used to proxy NVIDIA API calls. `llmRouteUrl()` is always direct.

Screenshot fallback: `screenshotOneTake()` via ScreenshotOne API when Steel returns <1024 bytes.
Requires `SCREENSHOTONE_ACCESS_KEY`.

## Operator Rules — Updated 2026-06-30

- **No OpenRouter models** — NVIDIA NIM primary, llama-3.1-70b fallback, Kimi tertiary only
- **TTS** — skip paid TTS; use free tier or omit
- **Perplexity** — skip (cost); we have Tavily + Exa + Firecrawl for search
- **Email** — Resend + Composio only
- **Twilio / SMS** — deferred; not configured at this time
- **Discord** — `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_GUILD_ID`, `DISCORD_BRIDGE_ENABLED=true`
