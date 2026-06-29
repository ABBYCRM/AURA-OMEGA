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
