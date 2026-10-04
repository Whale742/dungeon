import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 3005;
const CDP_PORT = 9333;
const ARTIFACTS_DIR = path.resolve('artifacts/phase-4');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.callbacks = new Map();
    this.consoleErrors = [];

    this.ws.onmessage = msg => {
      const data = JSON.parse(msg.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
      if (data.method === 'Runtime.consoleAPICalled') {
        const type = data.params.type;
        const text = data.params.args.map(a => a.value ?? a.description ?? '').join(' ');
        if (type === 'error') {
          this.consoleErrors.push(text);
          console.error('[Browser Error]', text);
        } else {
          console.log('[Browser Log]', text);
        }
      }
      if (data.method === 'Runtime.exceptionThrown') {
        const text = data.params.exceptionDetails.text + ' ' + (data.params.exceptionDetails.exception?.description || '');
        this.consoleErrors.push(text);
        console.error('[Browser Exception]', text);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise(resolve => { this.ws.onopen = resolve; });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval error');
    }
    return res.result?.value;
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log('[Screenshot saved]', filePath);
  }

  close() {
    this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitFor(cdp, expr, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await cdp.eval(expr);
      if (res) return res;
    } catch {}
    await sleep(250);
  }
  throw new Error('Timeout waiting for: ' + expr);
}

async function main() {
  console.log('1. Starting preview server on port', PORT);
  const serverProc = spawn('node', ['tests/chest-preview.js'], { stdio: 'inherit' });

  await sleep(1500);

  console.log('2. Starting headless Chrome on port', CDP_PORT);
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--user-data-dir=' + path.resolve('tmp-chrome-profile')
  ]);

  await sleep(1500);

  const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
  const pageTarget = targets.find(t => t.type === 'page') || await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' }).then(r => r.json());

  const cdp = new CdpSession(pageTarget.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  const verificationResults = { desktop: [], mobile: [], console: [] };

  try {
    // DESKTOP RUN (1280x800)
    console.log('3. Setting desktop viewport 1280x800');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
    });

    console.log('4. Navigating to http://localhost:' + PORT);
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}` });

    await waitFor(cdp, `Boolean(document.getElementById('inputPlayerName') && document.getElementById('btnCreateRoom'))`);
    console.log('Waiting for socket connection...');
    await sleep(2000);

    console.log('5. Entering name and creating room');
    await cdp.eval(`
      document.getElementById('inputPlayerName').value = '英雄勇者';
      document.getElementById('btnCreateRoom').click();
    `);

    console.log('6. Waiting for lobby and selecting Warrior');
    await waitFor(cdp, `document.getElementById('viewLobby')?.classList.contains('active') && Boolean(document.querySelector('.role-card'))`);
    await sleep(300);
    await cdp.eval(`
      const warriorCard = document.querySelector('.role-card');
      if (warriorCard) warriorCard.click();
    `);

    console.log('7. Waiting for start button to become enabled');
    await waitFor(cdp, `!document.getElementById('btnStartGame')?.disabled`);
    await sleep(300);
    await cdp.eval(`document.getElementById('btnStartGame').click();`);

    console.log('8. Waiting through Prologue & Floor intro to reach Route Choices...');
    await waitFor(cdp, `
      document.getElementById('viewRoute')?.classList.contains('active') &&
      !document.getElementById('routeOptionsGrid')?.classList.contains('hidden') &&
      Boolean(document.querySelector('.route-item'))
    `, 30000);

    console.log('9. Voting for route_trail to trigger chest event...');
    await cdp.eval(`
      const btn = document.querySelector('.route-item[data-route-id="route_trail"]') || document.querySelector('.route-item');
      if (btn) btn.click();
    `);

    console.log('10. Waiting for transition to finish and enter EVENT (Chest)...');
    await waitFor(cdp, `
      document.getElementById('viewEvent')?.classList.contains('active') &&
      !document.getElementById('chestDiscoverySection')?.classList.contains('hidden')
    `, 20000);

    console.log('Entered Chest Event!');
    await sleep(1200);

    // Verify Discovery Story typing
    const discoveryStory = await cdp.eval(`document.getElementById('chestDiscoveryStory')?.textContent`);
    console.log('Discovery Story text:', discoveryStory);
    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'discovery-desktop.png'));

    verificationResults.desktop.push({
      step: 'discovery_narrative',
      storyText: discoveryStory
    });

    console.log('11. Waiting for narrative hold and chest visual reveal...');
    await waitFor(cdp, `
      Boolean(
        document.getElementById('btnOpenChest')?.classList.contains('ready') &&
        !document.getElementById('btnOpenChest')?.disabled
      )
    `, 25000);

    const btnEnabled = await cdp.eval(`!document.getElementById('btnOpenChest')?.disabled`);
    console.log('Chest revealed! Button ready and enabled:', btnEnabled);
    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'chest-desktop.png'));

    verificationResults.desktop.push({
      step: 'chest_revealed',
      btnEnabled
    });

    // Click "開啟寶箱"
    console.log('12. Clicking [開啟寶箱]...');
    await cdp.eval(`document.getElementById('btnOpenChest').click();`);

    // Verify button disabled immediately
    const btnDisabledImmediately = await cdp.eval(`document.getElementById('btnOpenChest')?.disabled`);
    console.log('Button disabled immediately after click:', btnDisabledImmediately);

    // Wait for opening beats and reward reveal
    console.log('13. Waiting for Chest Open beats & Reward Reveal...');
    await waitFor(cdp, `!document.getElementById('presentationRewardContent')?.classList.contains('hidden')`, 12000);

    const rewardTitle = await cdp.eval(`document.getElementById('presentationRewardTitle')?.textContent`);
    const rewardRarity = await cdp.eval(`document.getElementById('presentationRewardRarity')?.textContent`);
    const rewardDesc = await cdp.eval(`document.getElementById('presentationRewardDesc')?.textContent`);
    console.log('Reward Revealed:', { rewardTitle, rewardRarity, rewardDesc });
    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'reward-desktop.png'));

    verificationResults.desktop.push({
      step: 'reward_revealed',
      title: rewardTitle,
      rarity: rewardRarity,
      desc: rewardDesc
    });

    console.log('14. Waiting for reward hold and settle/exit to reveal Equipment Decision UI...');
    await waitFor(cdp, `!document.getElementById('equipDropModal')?.classList.contains('hidden')`, 18000);

    const equipModalVisible = await cdp.eval(`!document.getElementById('equipDropModal')?.classList.contains('hidden')`);
    const equipBtnEnabled = await cdp.eval(`!document.getElementById('btnEquipItem')?.disabled`);
    console.log('Equipment Decision Modal visible:', equipModalVisible, 'btn enabled:', equipBtnEnabled);
    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'equipment-desktop.png'));

    verificationResults.desktop.push({
      step: 'equipment_decision',
      modalVisible: equipModalVisible,
      equipBtnEnabled
    });

    console.log('15. Clicking 【穿上】 to equip...');
    await cdp.eval(`document.getElementById('btnEquipItem').click();`);
    await sleep(2000);

    // MOBILE VIEWPORT TEST (390x844)
    console.log('16. Testing mobile responsive layout 390x844');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true
    });
    await sleep(600);

    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'chest-mobile.png'));

    const mobileOverflow = await cdp.eval('document.documentElement.scrollWidth > window.innerWidth');
    console.log('Mobile horizontal overflow:', mobileOverflow);

    verificationResults.mobile.push({
      width: 390,
      height: 844,
      overflow: mobileOverflow
    });

    verificationResults.console = cdp.consoleErrors;

  } finally {
    cdp.close();
    chromeProc.kill();
    serverProc.kill();
    try {
      fs.rmSync(path.resolve('tmp-chrome-profile'), { recursive: true, force: true });
    } catch {}
  }

  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'browser-verification.json'),
    JSON.stringify(verificationResults, null, 2),
    'utf8'
  );

  console.log('Verification completed. Console errors:', verificationResults.console.length);
  if (verificationResults.console.length > 0) {
    console.error('Errors found:', verificationResults.console);
  }
}

main().catch(err => {
  console.error('[Browser QA Failure]', err);
  process.exit(1);
});
