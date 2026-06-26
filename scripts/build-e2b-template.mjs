// Build a custom E2B template with Playwright + Chromium preinstalled.
// Uses Dockerfile mode (cleaner than the instruction API).
import { Template, TemplateBase } from '/workspace/repos/aura-omega/node_modules/.pnpm/e2b@2.27.1/node_modules/e2b/dist/index.mjs';
import fs from 'node:fs';

const apiKey = JSON.parse(fs.readFileSync('/workspace/.secrets/merged-env.json', 'utf8')).E2B_API_KEY;

// Build the template directly from a Dockerfile — the SDK parses it.
const tpl = new TemplateBase();
tpl.fromDockerfile('/workspace/Dockerfile.e2b-playwright');

console.error('[build] launching template build "aura-playwright-chromium"...');
const data = await Template.buildInBackground(tpl, 'aura-playwright-chromium', { apiKey, cpuCount: 4, memoryMB: 8192 });
console.error('[build] data:', JSON.stringify(data));

console.error('[poll] waiting for build (up to 30 min)...');
let lastLog = '';
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 20_000));
  try {
    const status = await Template.getBuildStatus({ templateId: data.templateId, buildId: data.buildId }, { apiKey, logsOffset: 0 });
    const logs = status.logs || [];
    if (logs.length > 0) {
      const last = logs[logs.length - 1];
      const line = last.message || last;
      if (line && line !== lastLog) {
        console.error(`[${status.status}] ${String(line).slice(0,200)}`);
        lastLog = String(line);
      }
    }
    console.error(`tick ${i}: status=${status.status}, logs=${logs.length}`);
    if (status.status === 'built' || status.status === 'ready') {
      console.error('[DONE] template ready!');
      console.log(JSON.stringify({ templateId: data.templateId, buildId: data.buildId, status: status.status }));
      process.exit(0);
    }
    if (status.status === 'failed' || status.status === 'error') {
      console.error('[FAILED]', JSON.stringify(status).slice(0, 500));
      process.exit(1);
    }
  } catch (e) { console.error('poll err', i, e.message); }
}
console.error('[TIMEOUT]');
process.exit(2);