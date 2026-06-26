#!/bin/bash
# postbuild-bundles.sh
#
# Run after `pnpm --filter @workspace/aura-omega-ui run build` and
# `pnpm --filter @workspace/api-server run build`. Adds the freshly-built
# dist bundles to git so Render (which serves the prebuilt dist directly,
# skipping its own build step) gets the latest JS/CSS.
#
# Why: dist/ is gitignored, but render.yaml's buildCommand is
# `echo "dist is prebuilt — skipping build on Render"`. So Render ships
# whatever's committed in artifacts/*/dist/. Without force-add, the new
# bundle hashes never reach Render.
#
# Usage:
#   pnpm --filter @workspace/api-server run build
#   pnpm --filter @workspace/aura-omega-ui run build
#   bash scripts/postbuild-bundles.sh
#   git add -A && git commit -m "build: bundles"
#
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Force-adding api-server dist bundle"
git add -f \
  artifacts/api-server/dist/index.mjs \
  artifacts/api-server/dist/index.mjs.map \
  artifacts/api-server/dist/pino-file.mjs \
  artifacts/api-server/dist/pino-file.mjs.map \
  artifacts/api-server/dist/pino-worker.mjs \
  artifacts/api-server/dist/pino-worker.mjs.map \
  2>/dev/null || true

echo "==> Force-adding UI dist bundle"
git add -f \
  artifacts/aura-omega-ui/dist/index.html \
  artifacts/aura-omega-ui/dist/public/index.html \
  artifacts/aura-omega-ui/dist/public/assets/*.js \
  artifacts/aura-omega-ui/dist/public/assets/*.css \
  2>/dev/null || true

echo "==> Done. Run 'git status' to confirm and commit."