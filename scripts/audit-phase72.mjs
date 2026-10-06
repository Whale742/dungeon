import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
fs.mkdirSync('artifacts/phase73/before', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto('http://localhost:3011/presentation-lab.html');
  for (const status of ['exhausted','frenzy','poison','bleed','shield','guard','vulnerable','dodge','hidden','sleep','corruption','downed']) {
    await page.evaluate(s => playScene('status_' + s), status);
    await page.waitForTimeout(850);
    await page.locator('#labStage').screenshot({ path: `artifacts/phase73/before/${status}.png` });
  }
} finally { await browser.close(); }
