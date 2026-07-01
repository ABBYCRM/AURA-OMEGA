#!/usr/bin/env bash
set -e

echo "=== RENDER BUILD START ==="
node --version
npm --version

# Download pnpm via npx (avoids global install permission issues)
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
npx --yes pnpm@9 --version

# Strip Replit-specific fields from pnpm-workspace.yaml that pnpm 9 doesn't recognize.
python3 - <<'PYEOF'
import re, shutil, sys

src = open("pnpm-workspace.yaml").read()

# Remove the big comment block + minimumReleaseAge field + minimumReleaseAgeExclude block
src = re.sub(
    r'# =+.*?# =+\n'
    r'minimumReleaseAge:.*?\n'
    r'\n?'
    r'minimumReleaseAgeExclude:[^\n]*\n'
    r'(?:  [^\n]*\n)*',
    '',
    src,
    flags=re.DOTALL
)

# Also strip any remaining minimumReleaseAge lines just in case
src = re.sub(r'^minimumReleaseAge.*\n', '', src, flags=re.MULTILINE)
src = re.sub(r'^minimumReleaseAgeExclude.*\n', '', src, flags=re.MULTILINE)

open("pnpm-workspace.yaml", "w").write(src)
print("pnpm-workspace.yaml cleaned successfully")
PYEOF

echo "=== Installing dependencies ==="
npx --yes pnpm@9 install --no-frozen-lockfile

echo "=== Building lib packages ==="
npx --yes pnpm@9 run typecheck:libs

echo "=== Cleaning old API server dist ==="
rm -rf artifacts/api-server/dist

echo "=== Building API server ==="
npx --yes pnpm@9 --filter @workspace/api-server run build || {
  echo "ERROR: API server build failed"
  exit 1
}

echo "=== Verifying auth fix in built server ==="
if grep -q "body.data" artifacts/api-server/dist/index.mjs; then
  echo "✅ Auth fix present in built server"
else
  echo "WARNING: Auth fix not found in built server"
fi

echo "=== Building frontend UI ==="
PORT=5000 BASE_PATH=/ npx --yes pnpm@9 --filter @workspace/aura-omega-ui run build || {
  echo "ERROR: UI build failed"
  exit 1
}

echo "=== BUILD COMPLETE ==="
ls -la artifacts/api-server/dist/
ls -la artifacts/aura-omega-ui/dist/public/ 2>/dev/null || echo "WARNING: UI dist missing"
