# AURA-OMEGA Production Hardening + Kimi-Style Workers

## Audit Source: Operator deep code review — 20 identified issues

---

## Phase 1: CRITICAL FIXES (can break production)

### 1.1 Add AbortSignal.timeout() to EVERY outbound fetch() 
**Files**: integrations.ts, steel.ts, firecrawl-related, discord.ts, composio, pinecone, etc.
**Pattern**: Every `fetch()` call must have `signal: AbortSignal.timeout(N)` 

### 1.2 Cache NVIDIA key sweep — stop running on every call
**File**: integrations.ts
**Fix**: Move sweepDeadKeys() to boot-only + 10min cooldown. Cache key list.

### 1.3 Add DB-level dedupe for postedMessageKeys
**File**: orchestrator.ts  
**Fix**: Add UNIQUE constraint on messages(channelId, contentHash) or use DB upsert

### 1.4 Gate local sandbox behind explicit safety flag
**File**: tools.ts (sandbox/code_exec)
**Fix**: Add `ALLOW_LOCAL_CODE_EXEC=true` env gate. Default to E2B-only. Never fall back silently.

### 1.5 Fix timingSafeStrEqual — remove broken HMAC layer
**File**: auth.ts or wherever auth comparison lives
**Fix**: Use direct timingSafeEqual on properly hashed passwords

### 1.6 AGENT_PERSONAS[6] missing — add AURA-5 (social) persona
**File**: routes/ai.ts
**Fix**: Define persona for agent ID 6

---

## Phase 2: SERIOUS FIXES (functional problems)

### 2.1 Add Express rate limiting
**File**: app.ts or middleware
**Fix**: Add express-rate-limit on /ai/chat, /ai/complete

### 2.2 Add memory/CPU limits to code_exec
**File**: tools.ts
**Fix**: Use resource limits in spawn options

### 2.3 Cache Hermes skill matching
**File**: lib/hermes/skills.ts
**Fix**: Cache skill matches per-goal-pattern, refresh on skill changes

### 2.4 Make MVP Governor lightweight
**File**: lib/mission/mvpGovernor.ts
**Fix**: Use regex/heuristic gate instead of LLM call. Only LLM for ambiguous cases.

### 2.5 Add correlation IDs + structured observability
**File**: middleware, logger
**Fix**: Per-request x-request-id, trace spans on LLM calls

### 2.6 Composio error handling + fallback
**File**: integrations.ts composioExecute
**Fix**: Wrap in try/catch with graceful error return

---

## Phase 3: KIMI-STYLE WORKERS (new feature)

Build Cloudflare Workers that replicate Kimi's agentic workflow:
- `/workers/kimi-agent` — CF Worker that accepts a task, plans steps, executes via tools
- `/workers/kimi-search` — CF Worker with web search + RAG capabilities
- `/workers/kimi-reasoner` — CF Worker with deep reasoning chain (like DeepSeek R1)

All workers use the operator's CF Workers AI credentials and models.

---

## Phase 4: GIT + DEPLOY
- Commit all fixes to branch
- Update CHANGELOG.md + AI_NOTES.md
- Push to GitHub
- Deploy to Render
