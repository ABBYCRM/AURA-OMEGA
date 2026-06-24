# Agentic Capability Review

## Verdict
The project has a real bounded agentic orchestrator in `artifacts/api-server/src/orchestrator.ts`, but the BOS-OMEGA/n8n addition was not yet a complete loose autonomous task resolver.

## Verified strengths
- Multi-agent orchestration exists through ABBY and AURA agents.
- Each agent can run a bounded reasoning/tool loop with up to 10 tool turns.
- Tool-call results are persisted to the database.
- Duplicate tool calls are cached per run.
- A coordinator follow-up round exists when first-pass results are incomplete.
- Final synthesis is evidence-constrained by actual AURA results.
- n8n registry contains 60 workflow definitions.

## Critical issue fixed in this package
- `n8nRouter` was imported but not mounted in `routes/index.ts`, making `/api/n8n/*` endpoints unreachable.
- Added `router.use(n8nRouter);`.

## New routing improvement added
- Added `artifacts/api-server/src/lib/n8n/policyRouter.ts`.
- Added `/api/n8n/route` to select a workflow from user objective text before dispatch.
- Added policy-router tests.

## Remaining limitations
- n8n workflows are registry definitions, not real exported n8n JSON workflows.
- `/api/n8n/route` selects a workflow and returns dispatch guidance; it does not yet execute the dispatch internally.
- No workflow dependency graph exists yet, so complex chains like `lead search -> enrichment -> CRM -> SMS -> follow-up` require another planner layer.
- The BOS-OMEGA brain is mostly a planning/status object; the older `orchestrator.ts` is the real autonomous execution engine.
- Full dependency-backed typecheck/test could not run in this sandbox because `node_modules` is absent.

## Capability rating
- Current patched system: 6.5/10 agentic capability.
- With Kimi K2.6 wired as planner plus a tool policy router and workflow dependency graph: 8/10.
- With live n8n workflow exports, result verification, retries, and persistent run state: 9/10.
