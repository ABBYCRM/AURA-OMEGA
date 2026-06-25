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
- **LLM provider:** NVIDIA NIM (`NVIDIA_API_KEY`) → fallback OpenRouter
- **Agents:** ABBY (orchestrator, id=1), AURA-1 through AURA-5 (ids 2–6)
- **SESSION_SECRET** is the AES-256-GCM vault key — NEVER change it, NEVER commit it
- **No secrets in repo** — all keys live in Render env vars only
