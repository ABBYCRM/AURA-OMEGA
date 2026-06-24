import { chromium } from 'playwright';
console.log('launching');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage'] });
console.log('newpage');
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3001/', { waitUntil: 'domcontentloaded', timeout: 10000 });
console.log(await page.title());
await browser.close();
console.log('done');
