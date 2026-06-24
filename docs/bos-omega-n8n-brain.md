# BOS-OMEGA Brain + n8n Wiring

This project now includes a TypeScript implementation of the uploaded BOS-OMEGA lattice runtime brain spec.

## Runtime brain

Source: `artifacts/api-server/src/lib/bosOmegaBrain.ts`

Core behavior:
- Tri-state gate: `GO`, `HOLD`, `ABORT`
- Task classification, including `N8N`
- Evidence labels: `VERIFIED`, `INFERRED`, `UNKNOWN`, `FAILED`, `BLOCKED`
- Active-inference style state: ambiguity, risk, evidence strength, expected free energy
- Verified completion requires explicit execution + verification transitions

## n8n task registry

Source: `artifacts/api-server/src/lib/n8n/workflows.ts`

The registry contains 60 wired workflow task definitions. Each task has:
- Stable id
- Name
- Trigger type
- Webhook path
- Owner AURA agent
- Enabled state
- Priority
- Prompt
- Tags

## API routes

Mounted under `/api`:

- `GET /api/n8n/tasks` — list all 60 workflow definitions and validation status.
- `POST /api/n8n/brain/plan` — create a BOS-OMEGA brain plan from `{ objective }`.
- `POST /api/n8n/dispatch/:taskId` — queue a specific n8n workflow through BOS-OMEGA gating.
- `POST /api/n8n/webhook/*path` — generic inbound n8n-compatible webhook path.

All dispatch/webhook routes pass through the BOS-OMEGA tri-state gate before writing to the task queue.
