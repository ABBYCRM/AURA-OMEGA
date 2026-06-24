# AURA-OMEGA Tool Intent Vector Registry Upgrade

## Status

PASS for source patching and static syntax transpilation. Full package typecheck/test is blocked in this sandbox because `@types/node` and project dependencies are not installed and internet installation is disabled.

## What changed

### Removed legacy bridge branding

- Renamed frontend package folder to `artifacts/aura-omega-ui`.
- Renamed workspace package to `@workspace/aura-omega-ui`.
- Updated API static frontend path to `aura-omega-ui`.
- Replaced legacy n8n webhook paths with `/webhook/aura-omega/*`.
- Removed stale old bridge cleanup docs and rebranded env examples.

### Added Tool Intent Vector Registry

New file:

```txt
artifacts/api-server/src/lib/n8n/toolIntentVectorRegistry.ts
```

It creates one exhaustive tool-intent entry per n8n workflow. Each entry contains:

- `id`
- `tool`
- `category`
- `description`
- `triggerPhrases`
- `intentKeywords`
- `semanticExamples`
- `negativeExamples`
- `requiredInputs`
- `optionalInputs`
- `produces`
- `risk`
- `sideEffect`
- `dependsOn`
- `callWhen`
- `doNotCallWhen`
- `inputHints`
- `outputVerification`
- `llmInstructions`

### Added vector-like tool selection

The selector now scores:

```txt
explicit task/tool id
+ exact phrase match
+ fuzzy phrase/token overlap
+ semantic example overlap
+ intent keyword match
+ required input completeness
- missing input penalty
- risk penalty
- negative intent penalty
```

The LLM gets a simple contract:

```txt
IF action = dispatch:
  call selected n8n workflow
ELSE:
  HOLD and ask/provide exact missing fields
```

### Wired into existing n8n router

New API endpoints:

```txt
GET  /api/n8n/tool-intents
POST /api/n8n/tool-intents/select
```

Updated endpoints:

```txt
GET  /api/n8n/tasks
POST /api/n8n/route
POST /api/n8n/autonomous/plan
POST /api/n8n/autonomous/execute
```

Now they use the Tool Intent Vector Registry instead of simple keyword-only routing.

### Added tests

New test file:

```txt
artifacts/api-server/src/lib/n8n/toolIntentVectorRegistry.test.ts
```

Covers:

- one registry entry per n8n task
- registry validation
- natural-language selection
- HOLD behavior when inputs are missing

## Verification performed in sandbox

```txt
60 n8n workflow IDs found
60 unique webhook paths found
All webhook paths use /webhook/aura-omega/*
TypeScript transpile syntax check passed for changed TS files
No remaining legacy bridge branding matches in checked source/docs
```

## Blocked verification

Full command blocked:

```txt
npx --no-install tsc -p artifacts/api-server/tsconfig.json --noEmit
```

Reason:

```txt
error TS2688: Cannot find type definition file for 'node'
```

This is dependency/environment-only. Run in the real repo with:

```txt
pnpm install
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server run typecheck
pnpm build
```

## Operator result

The system now has a vector-like tool selection matrix so the LLM does not need to invent which n8n tool to use. It can ask the registry, receive candidates, required inputs, missing fields, chain dependencies, and verification rules.
