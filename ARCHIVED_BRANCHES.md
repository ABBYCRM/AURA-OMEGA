# AURA-OMEGA — Archived Branch Record (2026-07-01)

**Why this file exists:** on 2026-07-01 the repo had 52 stale remote branches, most spun off in
parallel on 2026-06-25/26 as separate experiments, then abandoned once `main` moved on
independently. Merging them back was attempted and rejected as unsafe — every branch with real
content conflicted with current `main` on 12–44 files each, because they diverged from a single
commit (`chore: merge 2026-06-25/personality-tab-settings → main`, 2026-06-25 23:37:23Z) and `main`
has since evolved hundreds of commits past that point on its own line. Force-resolving that many
conflicts blind would risk silently reintroducing stale/reverted code.

This file preserves *what each branch was trying to do* before the git refs themselves were
deleted, so no institutional knowledge is lost even though the code isn't merged.

## Group A — Fully redundant (zero unique commits vs `main`)

These branches' commits are already present in `main` verbatim. Nothing lost by deleting.

| Branch | Intent |
|---|---|
| `ai/2026-06-25-white-bg-atlas-ui-render-build-fix` | fix(ui): remove hardcoded class="dark" from index.html — enables white background |
| `ai/2026-06-25-chat-menu-delete-export` | remove all non-commercial/external LLM hardcodes (buddy, neurobuddy, grok) |
| `2026-06-30/fix-llm-404-model-slug` | fix: resolve LLM 404 errors — update model slug and key-probe logic |
| `2026-06-30/fix-kimi-primary-routing` | fix: route all LLM calls through Kimi.com when it is the primary provider |
| `2026-06-30/do-workspace-exec-tool-claude-md-infra` | feat: add do_exec tool + document DO infra in CLAUDE.md |
| `2026-06-25/personality-tab-settings` | feat(settings): add Personality tab — paste custom system prompt for all agents |
| `2026-06-25/fix-nvidia-llm-routing-agent-models` | fix: fully route all LLM calls through NVIDIA NIM, update agent model IDs |
| `2026-06-25/add-deploy-version-cache-bust` | fix: move /version endpoint before auth router, rebuild dist |
| `2026-06-25/add-claude-md-branch-push-rules` | chore: add CLAUDE.md with branch/push rules and self-healing policy |

## Group B — Functionally absorbed (unique commits exist, but zero file diff vs `main`)

These have commits `main` doesn't literally contain, but the resulting file content is identical —
the same fix landed on `main` through a different commit path.

| Branch | Intent |
|---|---|
| `2026-06-28/mvp-completion-agentic-system` | mvp-completion-agentic-system |
| `2026-06-30/db-health-check-endpoint` | feat(ops): /health/db endpoint + boot-time DB reachability probe |
| `2026-06-30/kimi-com-fallback-option` | feat(llm): Kimi.com Moonshot fallback OPTION |
| `2026-06-30/scrapingbee-proxy-llm-routing-restored` | feat(llm): restore ScrapingBee residential proxy + IP rotation for all NVIDIA calls |
| `ai-2026-06-24-mvp-governor-build-test-playwright` | docs: add render n8n deploy handoff |
| `master` | 2026-06-29/db-ssl-true-only — stale duplicate of `main`, 153 commits behind, never merged |

## Group C — Diverged, real content, conflicts with `main` (superseded by main's own independent work)

All of these diverged from `main` at the same commit on 2026-06-25 and were parallel/experimental
lines of work. A real merge attempt into current `main` was tested for every one — all conflicted
(12–44 files each) — so they were **not** merged, only recorded here.

| Branch | Tip date | Intent |
|---|---|---|
| `2026-06-26/redesign-ops-home-manus-style` | 2026-06-26 | feat(ops): redesign home page in Manus AI-inspired style |
| `2026-06-25-remove-foreign-stack-rule` | 2026-06-26 | chore(rules): remove 'stay in the stack / foreign stack' doctrine rule |
| `fix-2026-06-24-render-deploy-mvp-build` | 2026-06-25 | fix(2026-06-25): bundle all runtime deps + add createRequire banner for ESM/CJS interop |
| `2026-06-25-hermes-runtime-merge` | 2026-06-26 | fix(routes): move /api/hermes mount BEFORE requireOperator middleware |
| `ai/2026-06-25-hermes-inspired-learning-loop` | 2026-06-26 | fix(2026-06-26): add skill_library + outcome_memory tables to migrations |
| `2026-06-25-ui-manus-style-redesign` | 2026-06-26 | merge: bring mobile branch up to date with main (post PR #5) |
| `2026-06-25-fix-actions-workflows` | 2026-06-26 | ci(workflows): fix pnpm/action-setup@v4 conflict + correct Render service ID |
| `2026-06-25-openhands-parallel-runtime` | 2026-06-26 | merge: bring branch up to date with main (post deploy-merge) |
| `2026-06-25-parallel-runtimes-round-1` | 2026-06-26 | feat(runtimes): add Crawl4AI, Mem0, Docling parallel runtimes (these runtimes exist on `main` today via a separate implementation path) |
| `2026-06-26-bos-omega-scaffold` | 2026-06-26 | feat(bos-omega): Round A scaffold (docs + packages + stub adapters) |
| `2026-06-26-bos-omega-round-c` | 2026-06-26 | feat(bos-omega): Round C (MeshCentral + Guacamole + noVNC + mobile UI page) |
| `2026-06-26-bos-omega-round-b` | 2026-06-26 | feat(bos-omega): Round B (Tailscale + RustDesk real impls + DB + install scripts) |
| `2026-06-26-bootstrap-installer-tab` | 2026-06-26 | feat(settings): add Bootstrap Installer tab + bos-omega-bootstrap.ps1 |
| `2026-06-26-bos-omega-round-d` | 2026-06-26 | feat(bos-omega): Round D (Sunshine + scrcpy + real meshagent script) |
| `2026-06-26-e2e-bugfixes` | 2026-06-26 | fix(ui): refresh stale 'lands in Round C' copy in Remote Control screen tab |
| `2026-06-26-ui-bundle-fix` | 2026-06-26 | fix(ui): mobile layout — nav at bottom not right rail + render pc-agent installer |
| `2026-06-26-ui-bundle-fix-2` | 2026-06-26 | fix(deploy): force-add UI bundle JS so Render serves the new bundle |
| `2026-06-26-responsive-headers` | 2026-06-26 | test: add Playwright Hermes + LLM probe E2E |
| `2026-06-26-mission-kernel-mvp` | 2026-06-26 | feat(mission-kernel): searxng-search engine + ABBY-SEARCH self-hosted fallback |
| `ai/2026-06-26-runtime-orchestration-guards` | 2026-06-26 | refactor(runtime): use finalAnswer crash guard helper |
| `ai/2026-06-26-wire-runtime-orchestration-guards` | 2026-06-26 | wire(runtime): patch orchestrator + tools to use runtime guards |
| `fix-2026-06-26-llm-429-key-rotation` | 2026-06-26 | fix(llm): completeChat rotates NVIDIA keys on 429 and falls back to OpenRouter |
| `fix-2026-06-26-mission-kernel-vague-gate-v2` | 2026-06-26 | fix(mission-kernel): isVagueGoal gate + ONE clarification |
| `fix-2026-06-26-mission-kernel-vague-gate` | 2026-06-26 | fix(mission-kernel): apply isVagueGoal gate + post ONE clarification |
| `fix-2026-06-26-nvidia-pool-32` | 2026-06-26 | fix(searxng-search): drop Google/Brave from default engine list |
| `fix-2026-06-26-planner-variants-v2` | 2026-06-26 | fix(planner+searxng): better variants + inurl: filter (v2) |
| `fix-2026-06-26-planner-variants` | 2026-06-26 | fix(planner+searxng): better query variants + inurl: filter always |
| `fix-2026-06-26-searxng-bing-only` | 2026-06-26 | fix(searxng-search): use inurl:linkedin.com/in/ instead of site:linkedin.com |
| `fix-2026-06-26-searxng-client-side-filter` | 2026-06-26 | no-op: confirm latest planner+searxng config in main |
| `fix-2026-06-26-searxng-engines-and-nvidia-pool` | 2026-06-26 | fix(searxng-search): use bing-only as default (startpage/ddg return 0) |
| `fix-2026-06-26-searxng-inurl` | 2026-06-26 | fix(searxng-search): use inurl:linkedin.com/in/ instead of site:linkedin.com |
| `chore-2026-06-26-remove-orphan-neurobuddy` | 2026-06-26 | chore: remove orphan neurobuddy.ts stub |
| `fix-2026-06-26-discord-integration-status-v2` | 2026-06-26 | feat(integrations): surface Discord bridge env gap in status panel |
| `fix-2026-06-26-discord-integration-status` | 2026-06-26 | feat(integrations): surface Discord bridge env gap in status panel |
| `feat-2026-06-26-composio-browse-dropdown-v2` | 2026-06-26 | feat(ui): add 'Browse all apps' dropdown next to 'Connect apps with Composio' |
| `fix-2026-06-26-runtimes-open-lane-buttons` | 2026-06-26 | fix(ui): wire 'Open lane' buttons on Runtimes page to actual pages |
| `fix-2026-06-26-runtimes-open-lane-buttons-v2` | 2026-06-27 | fix(mission): 3 bugs found in audit — planner gate, retry attempts, verifier leniency |

## If a future AI or operator needs something from here

The commits still exist in GitHub's reflog/dangling-commit storage for a while after branch
deletion, and are recoverable by SHA even after the ref is gone (`git log --all` won't show them,
but `git show <sha>` still works until GC runs — ask an operator with full repo access to check
`git reflog` / GitHub's event log if a specific SHA is needed within roughly 90 days).

For anything in **Group C** that turns out to genuinely be missing from `main` (not just
superseded), the safe move is a targeted `git cherry-pick <sha>` of the specific commit(s) that add
it — not a full branch merge.
