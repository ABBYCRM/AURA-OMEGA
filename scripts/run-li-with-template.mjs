// Run the LinkedIn scraper using the prebuilt aura-playwright-chromium template.
// Sandbox starts with chromium + playwright + deps ready. No install needed.
import { Sandbox } from '/workspace/repos/aura-omega/node_modules/.pnpm/e2b@2.27.1/node_modules/e2b/dist/index.mjs';
import fs from 'node:fs';

const apiKey = JSON.parse(fs.readFileSync('/workspace/.secrets/merged-env.json', 'utf8')).E2B_API_KEY;
const scraper = fs.readFileSync('/workspace/.secrets/li_self_contained.py', 'utf8');
const b64 = Buffer.from(scraper).toString('base64');

// Use the prebuilt template — sandbox starts ready to scrape.
const TEMPLATE_ID = 'jwe11k5bk00kflp16nwq';
const sbx = await Sandbox.create(TEMPLATE_ID, { apiKey, timeoutMs: 540_000 });
console.error('[sandbox] created from template');

await sbx.commands.run(`mkdir -p /tmp/work && cd /tmp/work && printf '%s' '${b64}' | base64 -d > scraper.py && ls -la scraper.py`, { timeoutMs: 0 });
console.error('[uploaded]');

// Preflight dependency check (per operator feedback) — verify chromium can launch
const preCheck = `python3 << 'PYEOF'
from playwright.sync_api import sync_playwright
import sys
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=["--no-sandbox"])
        print("PREFLIGHT OK")
        b.close()
except Exception as e:
    print(f"PREFLIGHT FAILED: {e}")
    sys.exit(1)
PYEOF`;
const preflight = await sbx.commands.run(preCheck, { timeoutMs: 0 });
console.error('[preflight]', preflight.stdout);
console.error('[preflight err]', (preflight.stderr||'').slice(-500));

// Run the actual scraper with extended budget
const r = await sbx.commands.run('cd /tmp/work && python3 scraper.py > contacts.csv 2> scraper.err; echo "EXIT=$?"; wc -l contacts.csv; head -20 contacts.csv; echo === STDERR ===; cat scraper.err', { timeoutMs: 0 });
console.log('=== STDOUT ===');
console.log(r.stdout);
console.error('=== STDERR ===');
console.error((r.stderr||'').slice(-3000));

// Save CSV
try {
  const csv = await sbx.files.read('/tmp/work/contacts.csv');
  fs.writeFileSync('/workspace/.secrets/contacts_mva.csv', csv);
  console.error('SAVED /workspace/.secrets/contacts_mva.csv:', csv.length, 'bytes,', csv.split('\n').length, 'lines');
} catch (e) { console.error('csv read:', e.message); }

await sbx.kill();