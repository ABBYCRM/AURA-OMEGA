# AURA-OMEGA Tool Selection Matrix + Heartbeat Upgrade

## What changed

- Added a granular Tool Intent Vector Registry layer for all 60 n8n workflows.
- Every workflow now exposes exact LLM-facing interaction instructions:
  - `domainTriggers`
  - `exactInteractionProtocol`
  - `payloadTemplate`
  - `chainBefore`
  - `chainAfter`
  - `executionMode`
  - `missingInputQuestion`
  - `llmDecisionChecklist`
- Expanded intent coverage beyond CRM into:
  - coding/repo repair
  - GitHub PR/issues/CI
  - Render deployment and logs
  - VPS/server/ops/uptime language
  - web search/current research/news
  - browser/Playwright/Steel sessions
  - Discord/UI bridge interactions
  - CRM/outreach/legal compliance
  - docs/PDF/slides/spreadsheet/game/Unity artifacts
- Added internal heartbeat/autonomy loop so the runtime is not only single-pass chat.

## Internal heartbeat jobs

The new module is `artifacts/api-server/src/lib/n8n/internalAutonomy.ts`.

It starts automatically from `artifacts/api-server/src/index.ts` after the normal scheduler starts.

Default jobs:

1. `heartbeat-runtime-health` — every 5 minutes.
2. `heartbeat-tool-registry-self-test` — every 10 minutes.
3. `heartbeat-memory-continuity` — every 30 minutes.
4. `heartbeat-provider-model-check` — every 60 minutes.

These jobs run dry-run autonomous planning by default. They keep the planning system awake, validate workflow routing, record outcome memory, and surface health/status evidence without blindly firing external side-effect workflows.

## New API endpoints

- `GET /api/n8n/autonomy/heartbeat`
- `POST /api/n8n/autonomy/heartbeat/start`
- `POST /api/n8n/autonomy/heartbeat/stop`
- `POST /api/n8n/autonomy/heartbeat/run/:jobId`

## Safety model

The heartbeat loop is autonomous for internal dry-run planning and self-checks. It does not automatically send SMS/email, write CRM records, deploy, push GitHub changes, or post to Discord without the existing risk/side-effect policy gates.

## Environment flags

- `AURA_INTERNAL_AUTONOMY_DISABLED=true` disables the heartbeat loop.
- `AURA_INTERNAL_AUTONOMY_TICK_MS=60000` changes the loop tick interval. Values below 15 seconds are clamped.

## Verification performed in sandbox

- Confirmed Tool Intent Vector Registry TypeScript compiles syntactically with global TypeScript for the n8n registry/planner files.
- Confirmed legacy bridge naming was removed from checked source/docs paths.
- Full project typecheck still requires installing package dependencies and `@types/node` in the real project environment.
