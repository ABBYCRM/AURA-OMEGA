# AURA-OMEGA UI/UX Rebuild Report

## Goal
Replace the old chat/bridge-oriented interface with an AURA-OMEGA operations console designed for a governed autonomous agentic runtime.

## Added / Rebuilt
- New AURA-OMEGA side navigation: Ops, Chat, Tools, Swarm, Tasks, Agents, Scheduled, Runtimes, Integrations, Settings.
- New Ops dashboard for mission control and autonomous planning.
- New Tool Selection Matrix UI for phrase/trigger/semantic tool selection.
- New Integrations console for provider status, official APIs, Composio OAuth, website logins, and write-only secrets.
- New Scheduled console for cron jobs and internal heartbeat autonomy jobs.
- New Runtimes console for BOS governor, Kimi brain, n8n executor, browser/search/code/deploy lanes, memory lattice, self-checks, and model catalog.
- New Settings page for brain model, autonomy mode, policy gates, uploads, appearance, secret-reference rule, and operator preferences.

## Existing Functionality Preserved
- Chat page still supports channel creation, rename, delete, message send, AI stream, and uploads through `/api/uploads`.
- Backend upload route supports images, text/code/log/json/csv/xml/yaml/html/css/ts/js/py/c/cpp/sql/etc and generic binary files up to backend cap.
- Existing Swarm, Agents, Tasks, and legacy Cron pages were kept available.

## API Surfaces Used
- `/api/n8n/tasks`
- `/api/n8n/tool-intents`
- `/api/n8n/tool-intents/select`
- `/api/n8n/autonomous/plan`
- `/api/n8n/autonomy/heartbeat`
- `/api/n8n/autonomy/heartbeat/run/:jobId`
- `/api/integrations`
- `/api/integrations/composio/connect`
- `/api/vault`
- `/api/cron`
- `/api/cron/:id/trigger`
- `/api/ai/models`
- `/api/self-check`

## Security UX
- Secrets are represented as write-only values.
- UI explains `{{secret:NAME}}` injection model.
- LLM is treated as planner, not direct raw credential holder.
- High-risk actions stay policy-gated.

## Status
Static TypeScript/JSX syntax was checked locally with esbuild/transpile where possible. Full workspace build requires `pnpm install` in the real environment.
