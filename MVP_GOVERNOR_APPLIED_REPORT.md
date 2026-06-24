# AURA-OMEGA MVP Governor Applied Report

## Applied runtime changes

- Added mandatory `MVP-GOVERNOR` runtime library.
- Added `/api/mvp-governor` and `/api/mvp-governor/review` endpoints.
- Added live n8n webhook dispatcher with retries, timeout, optional bearer token, idempotency key, and dry-run/live modes.
- Updated `/api/n8n/dispatch/:taskId`, `/api/n8n/webhook/*path`, and `/api/n8n/autonomous/execute` to call real n8n webhooks when `N8N_WEBHOOK_BASE_URL` is configured.
- Added backend runtime settings persistence at `/api/settings/runtime`.
- Updated Settings UI to load/save backend policy settings.
- Changed upload limit from fixed 20MB to configurable `AURA_MAX_UPLOAD_MB` defaulting to 100MB.
- Removed remaining checked-source legacy legacy bridge branding.
- Added `AURA_HEARTBEAT_LIVE=true` mode so heartbeat can move from dry-run to governed live execution.

## Evidence rule

AURA-OMEGA may only output `PASS` when actual build, tests, Playwright, deploy, n8n execution, GitHub push, user flow, secrets, uploads, heartbeat, and Tool Matrix evidence are verified.

## Current sandbox verification

- Static source patching completed.
- Legacy source branding grep returned no legacy bridge matches in checked source/docs.
- Full `pnpm install/build/test` still requires network/dependencies in the real environment.
