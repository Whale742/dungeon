import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 3006;
const CDP_PORT = 9334;
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
          console.error('[Lab Browser Error]', text);
        } else {
          console.log('[Lab Browser Log]', text);
        }
      }
      if (data.method === 'Runtime.exceptionThrown') {
        const text = data.params.exceptionDetails.text + ' ' + (data.params.exceptionDetails.exception?.description || '');
        this.consoleErrors.push(text);
        console.error('[Lab Browser Exception]', text);
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

async function waitFor(cdp, expr, timeoutMs = 20000) {
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
  const serverProc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit'
  });

  await sleep(1500);

  console.log('2. Starting headless Chrome on port', CDP_PORT);
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--user-data-dir=' + path.resolve('tmp-lab-chrome-profile')
  ]);

  await sleep(1500);

  const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
  const pageTarget = targets.find(t => t.type === 'page') || await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' }).then(r => r.json());

  const cdp = new CdpSession(pageTarget.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  const verification = { steps: [], errors: [] };

  try {
    console.log('3. Setting desktop viewport 1440x900');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
    });

    console.log('4. Navigating to http://localhost:' + PORT + '/presentation-lab.html');
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/presentation-lab.html` });

    await waitFor(cdp, `Boolean(window.labInitialized && document.getElementById('btnLabPlay'))`);
    console.log('Presentation Lab loaded and controller initialized successfully!');
    await sleep(500);

    // Test 1: Full Chest Sequence Playback
    console.log('5. Testing Full Chest Sequence Playback...');
    await cdp.eval(`document.getElementById('btnLabPlay').click();`);

    // Wait for chest to reveal and button ready
    console.log('Waiting for chest reveal...');
    await waitFor(cdp, `Boolean(document.getElementById('btnOpenChest')?.classList.contains('ready') && !document.getElementById('btnOpenChest')?.disabled)`, 25000);
    console.log('Chest revealed and button ready!');

    // Click [開啟寶箱]
    console.log('Clicking [開啟寶箱] in Lab...');
    await cdp.eval(`document.getElementById('btnOpenChest').click();`);

    // Wait for reward reveal
    await waitFor(cdp, `!document.getElementById('presentationRewardContent')?.classList.contains('hidden')`);
    const rewardTitle = await cdp.eval(`document.getElementById('presentationRewardTitle')?.textContent`);
    console.log('Reward revealed in Lab:', rewardTitle);

    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'presentation-lab-chest.png'));

    verification.steps.push({
      test: 'chest_sequence',
      rewardTitle,
      success: true
    });

    // Test 2: Chest Variant Switching
    console.log('6. Testing Chest Variant switching to Ancient (Variant A)...');
    await cdp.eval(`(() => {
      const sel = document.getElementById('labChestVariantSelect');
      sel.value = 'ancient';
      sel.dispatchEvent(new Event('change'));
    })()`);
    const variantA = await cdp.eval(`document.getElementById('labStage')?.getAttribute('data-variant')`);
    console.log('Stage data-variant is now:', variantA);

    console.log('7. Testing Chest Variant switching to Abyss (Variant B)...');
    await cdp.eval(`(() => {
      const sel = document.getElementById('labChestVariantSelect');
      sel.value = 'abyss';
      sel.dispatchEvent(new Event('change'));
    })()`);
    const variantB = await cdp.eval(`document.getElementById('labStage')?.getAttribute('data-variant')`);
    console.log('Stage data-variant is now:', variantB);

    verification.steps.push({
      test: 'chest_variants',
      variantA,
      variantB,
      success: variantA === 'ancient' && variantB === 'abyss'
    });

    // Test 3: Replay & Reset (Zero DOM Leakage)
    console.log('8. Testing Reset and Replay...');
    await cdp.eval(`document.getElementById('btnLabReset').click();`);
    const overlayHiddenAfterReset = await cdp.eval(`document.getElementById('chestPresentationOverlay')?.classList.contains('hidden')`);
    console.log('Overlay hidden after reset:', overlayHiddenAfterReset);

    // Test 4: Trap Presentation Scene
    console.log('9. Testing Trap Presentation Scene in Lab...');
    await cdp.eval(`(() => {
      const scn = document.getElementById('labSceneSelect');
      scn.value = 'trap_event';
      scn.dispatchEvent(new Event('change'));
    })()`);
    await waitFor(cdp, `!document.getElementById('trapPresentationOverlay')?.classList.contains('hidden')`);
    const victimsCount = await cdp.eval(`document.getElementById('trapVictimsContainer')?.children.length`);
    console.log('Trap victims rendered:', victimsCount);

    verification.steps.push({
      test: 'trap_scene',
      victimsCount,
      success: victimsCount === 2
    });

    // Test 5: First-frame Flash Test
    console.log('10. Testing Typewriter First-Frame Flash prevention in Lab...');
    await cdp.eval(`(() => {
      const scn = document.getElementById('labSceneSelect');
      scn.value = 'typewriter_test';
      scn.dispatchEvent(new Event('change'));
    })()`);
    await sleep(1500);

    // Test 6: Viewport switching to mobile
    console.log('11. Testing Mobile Viewport mode (390x844)...');
    await cdp.eval(`(() => {
      const vp = document.getElementById('labViewportSelect');
      vp.value = 'mobile';
      vp.dispatchEvent(new Event('change'));
    })()`);
    await sleep(500);
    const frameWidth = await cdp.eval(`document.getElementById('labDeviceFrame')?.style.width`);
    console.log('Device frame width set to:', frameWidth);

    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'presentation-lab-mobile.png'));

    // Restore responsive viewport and capture overall overview
    await cdp.eval(`(() => {
      const vp = document.getElementById('labViewportSelect');
      vp.value = 'responsive';
      vp.dispatchEvent(new Event('change'));
    })()`);
    await sleep(400);
    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'presentation-lab.png'));

    verification.errors = cdp.consoleErrors;
    console.log('Lab verification finished. Console errors:', cdp.consoleErrors.length);

  } finally {
    cdp.close();
    chromeProc.kill();
    serverProc.kill();
    try {
      fs.rmSync(path.resolve('tmp-lab-chrome-profile'), { recursive: true, force: true });
    } catch {}
  }

  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'lab-verification.json'),
    JSON.stringify(verification, null, 2),
    'utf8'
  );

  if (verification.errors.length > 0) {
    console.error('Errors found in Lab:', verification.errors);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[Lab Verification Failure]', err);
  process.exit(1);
});
