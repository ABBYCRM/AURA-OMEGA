# AURA-OMEGA System Notes

**This file is the living memory of every significant architectural change to the system.**
It is written for humans, operators, and other AIs that need to understand what this system is,
what was changed, when, and why. Every future AI working on this codebase should read this first.

---

## How to Read This File

- Entries are newest-first.
- Each entry includes: date, what changed, which files, and the reasoning behind the change.
- Entries marked `[PROTO-AGI]` are steps toward autonomous, self-improving behavior.
- Entries marked `[SECURITY]` relate to safety, auth, or data isolation.
- Entries marked `[INFRA]` are build/deploy fixes.

---

## 2026-07-01 — Branch Archaeology: 52 stale branches audited, recorded, queued for deletion

**Author:** Claude Sonnet 5 (claude/github-render-deployment-2pxepk)
**Type:** `[INFRA]`

The repo had accumulated 52 stale remote branches (plus `master`, itself stale/abandoned). The
operator asked to consolidate their "vital information" into `main`. Investigation found:

- 9 branches: zero unique commits — pure duplicates of `main`, safe to delete outright.
- 6 branches (incl. `master`): unique commits exist but resulting file content is identical to
  `main` — the same fix landed a different way. Safe to delete.
- 37 branches: genuinely diverged, all from the same commit (`2026-06-25 23:37:23Z`, the
  `personality-tab-settings → main` merge). A real merge attempt was made for every one of
  them into current `main` — **all 37 conflicted**, 12–44 files each. `main` has moved
  hundreds of commits past that divergence point on its own line since; these are abandoned
  parallel-universe snapshots, not small deltas. Force-resolving that many conflicts blind
  was rejected as unsafe (high risk of silently reintroducing stale/reverted code).

Full branch-by-branch intent record (so nothing is lost even after the refs are gone): see
**`ARCHIVED_BRANCHES.md`** in repo root. If a future AI needs something specific out of Group C,
cherry-pick the specific commit SHA — don't attempt a full branch merge.

**Note on execution:** this sandbox's GitHub push credentials are scoped for pushing commits only,
not deleting refs (`git push --delete` → HTTP 403, and no delete-branch tool is exposed via the
GitHub MCP server here). The actual `git push origin --delete <branches...>` command was handed to
the operator to run with their own full-access credentials.

---

## 2026-06-30 — QA Automation Audit, Chat "Thinking" Indicator Redesign, Orchestration-Error Surfacing

**Author:** Claude Sonnet 4.6 (`claude/github-render-deployment-2pxepk`)
**Type:** `[INFRA]` `[SECURITY-ADJACENT]`

**Read this entire entry before touching `chat.tsx`, the QA scripts, or NVIDIA key config.**

### Repo / branch state

- Repo: `abbycrm/aura-omega` (GitHub), local checkout `/home/user/AURA-OMEGA`.
- Designated branch for this work: `claude/github-render-deployment-2pxepk`.
- Mid-session this branch was found **already merged into `main`** (`git merge-base --is-ancestor` confirmed). Per the standing branch protocol for that exact case, it was restarted from latest `main` (`git fetch origin main && git checkout -B claude/github-render-deployment-2pxepk origin/main`) and new work continued on top. If you're picking this up later, check `git log --oneline -5` first — it may have been merged again since.

### 1. Playwright QA audit (route crawl + interaction tests)

Two scripts added, both runnable against a local preview build (`vite preview` on port 4173):

- `scripts/qa-crawl.mjs` — crawls all 17 routes × 3 viewports (51 loads) with full `/api/**` mocking, capturing console errors, network failures, a11y gaps (`buttonsNoName`, `imgsNoAlt`, `inputsNoLabel`, `linksNoHref`), and layout overflow. Output: `results.json` + per-page screenshots.
- `scripts/qa-interactions.mjs` — targeted edge-case tests: login form (empty/disabled, 5000-char input, invalid creds, rapid-click dedup), chat composer (empty-Enter blocked, 10k-char message, rapid-Enter dedup), and forced API-500 resilience on `/agents`, `/tasks`, `/missions`, `/cron` (waits 8s for react-query retry/backoff to exhaust, then checks for graceful "Couldn't load.../Retry" UI).

**Playwright gotcha worth remembering:** `page.route()` priority is LIFO — the most recently registered handler wins. Register broad `**/api/**` catch-alls FIRST, specific overrides LAST. Getting this backwards silently breaks auth mocking (both scripts hit this bug before being fixed).

### 2. Confirmed bugs from the audit (not yet fixed in code, except where noted)

| File:Line | Bug | Severity |
|---|---|---|
| `artifacts/aura-omega-ui/src/pages/hermes.tsx:138,191,196` | `s?.skills.total` — optional chaining only guards `s?.`, not the nested property. A malformed-but-200 response produces a **full white-screen crash** (confirmed via screenshot), and there is **no React ErrorBoundary anywhere in the app** to catch it. | Critical |
| `artifacts/aura-omega-ui/src/pages/remote.tsx:125` | Same incomplete-optional-chaining pattern (`status.data?.adapters.length`) — same white-screen crash class. | Critical |
| *(systemic)* | Zero `ErrorBoundary`/`componentDidCatch`/`getDerivedStateFromError` anywhere under `artifacts/aura-omega-ui/src` — any unhandled render error blanks the whole page instead of degrading one panel. | Critical |
| `artifacts/aura-omega-ui/src/pages/integrations-console.tsx` | Per-API "Connect" button has no `onClick`; entire "Website logins" mini-form (inputs + "Save website login" button) is uncontrolled/dead. | High |
| `artifacts/aura-omega-ui/src/pages/scheduled-console.tsx` | "Create job" button has **no `disabled` guard at all** (sibling `cron.tsx` validates `name`/`task` before enabling). Empty jobs can be POSTed. `/scheduled` and `/cron` look like two parallel/duplicate implementations of the same feature — worth reconciling. | Medium |
| `artifacts/aura-omega-ui/src/pages/settings.tsx` (Primary Planner dropdown) | Defaults to `kimi-k2.6` and includes `<option value="openrouter-auto">OpenRouter auto-router</option>`, contradicting this file's own "No OpenRouter models" rule. | Medium |
| `artifacts/aura-omega-ui/src/pages/tool-matrix.tsx:50` | Search `<textarea>` has no `aria-label`/`placeholder`/associated `<label>`. Genuine a11y gap. | Low |

**False positives investigated and dismissed:** `settings.tsx`'s `inputsNoLabel=11` flag — all 11 fields are wrapped in implicit `<label>...</label>`, valid markup the crawler's detector doesn't recognize. Chat composer "0 POSTs on 3 rapid Enter presses while streaming" — correct single-in-flight guard behavior, not a bug.

### 3. Chat "thinking" indicator redesign (`artifacts/aura-omega-ui/src/pages/chat.tsx`)

User asked for a Kimi-style "AO is thinking" indicator after a mobile screenshot showed the composer going idle-looking with no sign of life right after ABBY's two initial acknowledgment messages land. Root-caused to two distinct issues, both addressed:

1. **The original `TypingDots` (3 bouncing dots, unlabeled) only showed before the first streamed token.** Replaced with `ThinkingIndicator` — a `Brain` icon + `"Thinking · Ns"` label with a live elapsed-second counter + animated dots — used in place of `TypingDots` wherever `ai.streaming && !ai.tokens`.
2. **The real gap:** `/api/ai/chat` is a single-shot SSE call; `ai.streaming` goes `false` the moment that call ends, but multi-phase swarm missions keep posting messages/scratch entries server-side *after* that, with `useListMessages` only polling every 4s. During that window the UI looked completely idle. Fixed by having `AgentScratchPanel` report activity recency (its newest entry's `ts` within ~15s) up to the parent via a new `onActivity` callback, stored as `swarmActive` state, which now renders a second, independent `ThinkingIndicator` (label: `"Swarm is still working"`) any time `!ai.streaming && swarmActive`. Resets to `false` on channel switch so it can't carry over stale.

### 4. CRITICAL — found via the user's own screenshot, NOT something I can fix myself

The user's screenshot of `task-1-lead-research` showed, after the two ABBY acknowledgment messages, this persisted message:

```
Orchestration error: Error: LLM not configured: NVIDIA_API_KEY must be set — keyCount=0
```

This is thrown from `artifacts/api-server/src/lib/integrations.ts` (`llmBaseUrl()` / `llmHeaders()`) and caught in `artifacts/api-server/src/orchestrator.ts:1190-1195`, which writes it into the channel as a normal-looking agent message — previously rendered with the same plain gray `chat-bubble-agent` styling as everything else, making a **complete, channel-wide LLM outage look like a low-priority status update**. That presentation bug is fixed (see below). The underlying cause is not: **production has zero NVIDIA NIM keys configured** (`keyCount=0`), and Kimi.com fallback (`kimiApiConfigured()`) isn't configured either, so every chat request in production currently fails outright after the orchestrator's canned acknowledgment text. Per this file's own rules ("No secrets in repo — all keys live in Render env vars only" / self-healing only covers things that don't require operator-supplied secrets), **this requires the operator to set `NVIDIA_API_KEY` (and/or a Kimi fallback key) in the Render dashboard** — it cannot be fixed from inside the repo. If you're a future AI session picking this up: check `/render-set-env` or the Render dashboard's env vars for the live `aura-omega` service before doing anything else if chat appears to be silently failing in production.

**Fixed as part of this entry:** `MessageRow` in `chat.tsx` now detects `/^Orchestration error:/i` content and renders it as a distinct destructive-styled alert (red `AlertTriangle` icon, "Orchestration failed" label, red bordered box, the operator-goal line shown as a muted sub-line) instead of a plain agent bubble — so a hard failure is now visually unmissable even while the key is still missing.

### 4b. Follow-up — UI reframed around "mission," not "chat" (same session)

The operator clarified the intent behind the thinking-indicator request further: **every message sent to AURA-OMEGA is meant to be a single, fully autonomous, end-to-end mission** — the backend (`orchestrateGoal()` + the swarm dispatch in `lib/mission/swarm-dispatch.ts`) already supports this; nothing there needed to change. The actual problem was UX: a screenshot of the operator's own sidebar showed dozens of separately-named channels for what was really one ongoing piece of work (`task-1-lead-research`, `task-3-nvidia-models`, `run2-leads`, `run2-scraper`, `run2-nvidia`, `run2-report`, `run3-leads`, `run3-scraper`, `run3-nvidia`, ...) — almost certainly because, combined with the missing-`NVIDIA_API_KEY` outage above, every attempt silently died and the operator kept starting fresh chats to retry instead of continuing in one thread.

**Fix (copy/labeling only, zero backend changes):**
- `AppLayout.tsx` + `chat.tsx`: "New chat" → "New mission" (button labels, default channel name on creation, mobile bottom-nav label, sidebar empty-state text, toasts for rename/delete/create).
- `EmptyState` / `EmptyConversation` in `chat.tsx`: copy now explicitly says each thread is one fully autonomous mission and that follow-ups belong in the *same* thread, not a new one.
- Composer placeholder: `"Message AURA-OMEGA…"` → `"Describe a mission for AURA-OMEGA…"`.

If you're a future AI and the operator is still creating many fragmented channels for one task after this ships, the next lever to pull is probably making `/missions` (the Mission Kernel — already exists, see `artifacts/api-server/src/routes/missions.ts`) the front-and-center surface instead of `/chat`, rather than further copy tweaks.

### 5. Open / not yet done

- The 7 QA-audit bugs in the table above are **reported, not fixed** (user had not yet confirmed whether to fix them when this entry was written).
- `NVIDIA_API_KEY` (and ideally a Kimi fallback key) needs to be set in Render — operator action, see above.
- `scripts/qa-crawl.mjs` and `scripts/qa-interactions.mjs` are checked into `scripts/` for reuse; run them against a `vite preview` server on `localhost:4173` (see each file's `BASE` constant).
## 2026-07-01 — Production recovery: env wiring, DB reconnect, and the broken-build fix

**Type:** `[INFRA]` `[SECURITY-ADJACENT]`

Operator was locked out of the live site and every mission failed. Three independent
production faults, all fixed and verified end-to-end against the live service:

### 1. Missing env vars (LLM outage + integrations dark)
Render had only `AUTH_USERS` + `SESSION_SECRET`. Wired the full key set via the Render API
(single atomic bulk merge, existing vars preserved): `NVIDIA_API_KEY` + `NVIDIA_API_KEYS`
(11-key pool — all 11 probed live, 0 dead), `KIMI_API_KEY`, `OPENAI_API_KEY`/`EMBEDDINGS_API_KEY`,
`STEEL`, `FIRECRAWL`, `SCRAPINGBEE`, `SCRAPFLY`, `SCREENSHOTONE_*`, `COMPOSIO`, `EXA`, `TAVILY`,
`HELICONE`, `E2B`, `PINECONE`, `INNGEST_EVENT_KEY`, `RESEND_*`, `DISCORD_BOT_TOKEN`.
`/_debug/env` now reports `nvidiaKeyCount: 11, keyError: none`.

### 2. Database disconnected
`DATABASE_URL` was unset → agents/channels/chat all 500'd even with a valid login. The
`abby-lead-db` Postgres (Oregon) existed with all data intact. Wired its **internal**
connection string (external errored `Connection terminated unexpectedly` — free-tier blocks
external). `/health/db` → `ok, 5ms`. All prior channels/agents came back.

### 3. Frontend build had been silently failing → stale bundle with a broken login
`render-build.sh` rebuilds the UI, but the build had been failing for a while, so Render kept
serving an old committed `dist`. That stale bundle never called `/api/auth/me` on mount and
showed "Invalid username or password" even on a `200 {authenticated:true}`. Four accumulated
source defects fixed (verified via Playwright against the live site + a pixel-compared
screenshot of the rebuilt bundle):
- `login.tsx`: `mutateAsync({username,password})` → `mutateAsync({ data: { username, password } })`
  (generated `useLogin` expects the wrapped shape; flat dropped the credentials).
- `settings.tsx:91`: stray `]` in a `className` ternary (hard syntax error).
- `App.tsx`: `AppLayout` is a **default** export, was imported as named.
- `index.css`: had been regressed to Tailwind **v3** `@tailwind` directives with no `@theme`,
  which can't build under Tailwind v4 (`unknown utility bg-background`). Rewrote as v4
  `@import "tailwindcss"` + an `@theme` block whose 14 color tokens exactly match the shipped
  design (`#0e0e0e` bg, `#f97015` primary, …). Rebuilt + committed `dist`.

**Verified live:** Playwright logged in as a real user and reached the System Dashboard
(14/14 components green). If you rebuild the UI, it now actually compiles — keep it that way so
Render stops serving stale bundles.

**Note:** all keys were pasted into the chat by the operator in plaintext and should be rotated.

---

## 2026-06-29 — New Tools: Jina, Perplexity, Resend, ElevenLabs, Fal.ai, HeyGen, Apify, Twilio

**Author:** Claude Sonnet 4.6 (claude/github-render-deployment-2pxepk)
**Type:** `[INFRA]`

### What was added

8 new tools added to `TOOL_REGISTRY` in `tools.ts` and wired into AGENT_TOOLS permissions:

| Tool | Provider | Purpose | Key Required |
|------|----------|---------|-------------|
| `jina_read` | Jina AI | Extract clean markdown from any URL | None (free) |
| `deep_research` | Perplexity Sonar | Deep multi-source research with citations | `PERPLEXITY_API_KEY` |
| `send_email` | Resend | Transactional email (HTML/text) | `RESEND_API_KEY`, `RESEND_FROM` |
| `text_to_speech` | ElevenLabs | Text → MP3 audio, saves as attachment | `ELEVENLABS_API_KEY` |
| `video_generate` | Fal.ai | Text/image → video (Veo 3, Kling, Wan, etc.) | `FAL_KEY` |
| `avatar_video` | HeyGen | AI talking-avatar video from script | `HEYGEN_API_KEY` |
| `apify_run` | Apify | 30,000+ web scrapers (LinkedIn, TikTok, etc.) | `APIFY_TOKEN` |
| `send_sms` | Twilio | SMS + WhatsApp messaging | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |

**AGENT_TOOLS changes:**
- `jina_read` → AURAs 1–5 (all agents)
- `deep_research` → AURAs 2–5 (browser, memory, APIs, social)
- `send_email`, `send_sms` → AURAs 4–5 (APIs + social)
- `text_to_speech`, `video_generate`, `avatar_video` → AURA-4 (APIs)
- `apify_run` → AURAs 2, 4, 5 (browser, APIs, social)

**Env vars to add in Render** (none go in the repo):
`PERPLEXITY_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `ELEVENLABS_API_KEY`, `FAL_KEY`, `HEYGEN_API_KEY`, `APIFY_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

---

## 2026-06-29 — Proto-AGI Build: Features 1, 2, 3

**Author:** Claude Sonnet 4.6 (claude/github-render-deployment-2pxepk)
**Type:** `[PROTO-AGI]`

### What was built

Three capabilities that move AURA-OMEGA from "bounded-autonomous agent framework" toward 
genuine self-improving behavior were implemented in a single build.

---

### Feature 1: Reflexive Self-Critique

**What it does:**
After a failed orchestration OR a blocked mission, the system now calls the LLM to analyze 
*why* the run failed. It produces:
- Root causes (specific mechanical failures, not vague "the agent failed")
- A revised approach for the next attempt
- Tool/argument patterns to avoid
- A confidence score for the revised approach

The critique is stored in Hermes memory under `postmortem/<goal-slug>` so future runs of 
similar goals can read it and avoid the same traps. On the next orchestration of a similar 
goal, ABBY's planning prompt is pre-injected with the prior postmortem note.

**Files changed:**
- `artifacts/api-server/src/lib/hermes/critique.ts` — NEW. `reflexiveCritique()` and `recallPostmortem()`.
- `artifacts/api-server/src/orchestrator.ts` — calls `reflexiveCritique()` when outcome is `failed`/`partial` and in the catch block.
- `artifacts/api-server/src/lib/mission/runtime.ts` — calls `reflexiveCritique()` when a mission is `blocked`.

**Why this matters:**
Before this change: system silently recorded "failed" and moved on. No memory of *why*.
After this change: every failure generates institutional memory. The system learns from mistakes.

---

### Feature 2: Proactive Skill Injection

**What it does:**
Before each AURA executes its directive, `matchSkillForGoal(command)` queries Hermes for 
proven skill patterns that match the directive. If a skill with ≥70% success score is found, 
it is injected into the AURA's system prompt as a "HERMES SKILL HINT" block — giving the 
agent the known-good tool sequence before it starts reasoning.

Also injected at ABBY's planning stage: if a skill matches the top-level goal, ABBY's 
decomposition prompt includes the skill match and its preferred AURA.

Skills are distilled from completed sessions by `hermes/llm.ts::distillSkill()` — the 
connection from "skill exists" to "skill is used" was the missing piece.

**Files changed:**
- `artifacts/api-server/src/orchestrator.ts` — `executeAgentCommand()` now queries `matchSkillForGoal()` and injects the hint into the system prompt. `orchestrateGoal()` now queries for both a prior postmortem and a skill match before ABBY's planning call.

**Why this matters:**
Before this change: Hermes accumulated skills but they were never read during execution — dead weight.
After this change: proven patterns are automatically surfaced to agents. The system gets better at 
tasks it has done before.

---

### Feature 3: Agent-to-Agent Communication (Swarm Bus)

**What it does:**
A new in-memory "swarm bus" (`lib/swarm-bus.ts`) lets AURAs broadcast findings mid-run that 
sibling agents can immediately read. Messages are scoped to a `runKey` (unique per `orchestrateGoal` 
call) so two concurrent orchestrations never bleed into each other.

Two new tools added to all AURAs (IDs 2–6):
- `swarm_broadcast(message)` — post a finding to sibling agents in this run
- `swarm_read()` — read all messages other AURAs have broadcast in this run

ABBY's coordinator pass (the "review round") also runs after all AURAs have reported, so it 
sees all swarm messages when deciding whether follow-up directives are needed.

The bus is ephemeral (in-memory, 1-hour TTL, cleared at the end of each run). It is 
intentionally NOT persisted — swarm messages are coordination signals, not durable facts 
(durable facts should use `memory_write`).

**Files changed:**
- `artifacts/api-server/src/lib/swarm-bus.ts` — NEW. `swarmPost()`, `swarmRead()`, `swarmClear()`.
- `artifacts/api-server/src/tools.ts` — Added `swarm_broadcast` + `swarm_read` to TOOL_REGISTRY. Added `runKey` to ToolContext. Added both tools to AGENT_TOOLS for agents 2–6.
- `artifacts/api-server/src/orchestrator.ts` — Generates `runKey` per orchestration, threads it through `dispatchDirectives` → `executeAgentCommand` → ToolContext. Calls `swarmClear(runKey)` after run completes.

**Why this matters:**
Before this change: AURAs ran in parallel but were completely isolated — no peer awareness.
After this change: AURA-2 (browser) can broadcast a live URL it found; AURA-1 (code) can read 
it and use it in the same run without re-searching.

---

## 2026-06-29 — Fix: Mobile Nav + NVIDIA Primary Restore

**Author:** Claude Sonnet 4.6
**Type:** `[INFRA]`

- `AppLayout.tsx`: `navigate` was never destructured from `useLocation()`. Mobile "Hermes" 
  button called an undefined function → runtime crash on tap. Fixed.
- `integrations.ts`: Reverted `llmBaseUrl()`, `llmHeaders()`, `completeChat()` back to 
  NVIDIA NIM as primary LLM. Kimi.com (Moonshot) back to tertiary fallback only.

---

## 2026-06-27 — Build: esbuild Alias Fix (Critical Deploy Fix)

**Author:** Claude Sonnet 4.6
**Type:** `[INFRA]`

- `artifacts/api-server/build.mjs`: Added `alias` map for `@workspace/remote-control` and 
  `@workspace/pc-agent` packages. These packages had `package.json` exports pointing to raw 
  `.ts` source files. Node.js cannot load `.ts` at runtime → every deploy crashed with 
  `update_failed nonZeroExit:1`.
- Removed those packages from `external` array (they are now bundled at build time, not 
  loaded at runtime).

---

## System Architecture Summary (as of 2026-06-29)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React + Vite + Tailwind v4 | `artifacts/aura-omega-ui/` |
| API Server | Express ESM + Drizzle ORM | `artifacts/api-server/` |
| Database | PostgreSQL | Drizzle migrations in `lib/db/` |
| Primary LLM | NVIDIA NIM (28-key rotation) | + llama fallback + Kimi.com tertiary |
| Orchestrator | `orchestrator.ts` (1200+ lines) | ABBY → AURA-1..5, 10-step loop |
| Mission Kernel | `lib/mission/runtime.ts` | Durable, event-driven, retries |
| Hermes | `lib/hermes/` | Skill library, session memory, heartbeat |
| Tool Registry | `tools.ts` (1600+ lines) | 42+ tools, per-AURA permissions |
| Swarm Bus | `lib/swarm-bus.ts` | NEW: ephemeral per-run AURA comms |
| Self-Critique | `lib/hermes/critique.ts` | NEW: failure postmortem → Hermes memory |
| Deployment | Render free tier | Branch: `claude/github-render-deployment-2pxepk` |

---

## For AIs Reading This

If you are an AI (Claude, GPT, Gemini, or other) working on this codebase:

1. **Read this file first.** It explains why the system is the way it is.
2. **Branch rule:** All changes go to `claude/github-render-deployment-2pxepk`. Date-prefix new branches: `YYYY-MM-DD/what-changed`.
3. **Never commit secrets.** SESSION_SECRET is the AES-256-GCM vault key. Never change it or commit it.
4. **Self-healing rule:** If you can fix an error yourself, fix it. Don't ask the operator unless it requires a secret, a destructive action, or a policy decision.
5. **Update this file** after every significant change you make. Future AIs and the operator will thank you.
6. **Dist is committed.** The `dist/` folders are pre-built and committed — Render's build command is `echo "dist is prebuilt"`. Always rebuild and commit `dist/` when you change source files.
