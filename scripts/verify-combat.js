import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 3007;
const CDP_PORT = 9336;
const ARTIFACTS_DIR = path.resolve('artifacts/phase-5');

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
          console.error('[Combat Browser Error]', text);
        } else {
          console.log('[Combat Browser Log]', text);
        }
      }
      if (data.method === 'Runtime.exceptionThrown') {
        const text = data.params.exceptionDetails.text + ' ' + (data.params.exceptionDetails.exception?.description || '');
        this.consoleErrors.push(text);
        console.error('[Combat Browser Exception]', text);
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
    '--user-data-dir=' + path.resolve('tmp-combat-chrome-profile')
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
    console.log('Presentation Lab loaded successfully!');

    // Test 1: Check unopened chest SVG presence
    console.log('5. Testing Unopened Chest SVG in Lab Stage...');
    const chestHasSvg = await cdp.eval(`Boolean(document.getElementById('chestVisualStage')?.querySelector('svg.chest-svg'))`);
    console.log('Unopened chest has SVG in visual stage:', chestHasSvg);
    verification.steps.push({
      test: 'unopened_chest_svg',
      success: chestHasSvg
    });

    // Test 2: Player Action (Physical - Warrior) with Simple HP Bar, 0px Radius, & Hit Wrapper
    console.log('6. Testing Player Action (Physical - Warrior)...');
    await cdp.eval(`(() => {
      const scn = document.getElementById('labSceneSelect');
      scn.value = 'combat_warrior';
      scn.dispatchEvent(new Event('change'));
    })()`);

    await waitFor(cdp, `Boolean(document.querySelector('.presentation-combat-strip-wrap.is-player'))`);
    const playerIntent = await cdp.eval(`document.querySelector('.presentation-combat-intent-title')?.textContent`);
    const actorLeft = await cdp.eval(`Boolean(document.querySelector('.presentation-combat-actor-left img'))`);
    const targetRight = await cdp.eval(`Boolean(document.querySelector('.presentation-combat-target-right img'))`);
    const hasHpBar = await cdp.eval(`Boolean(document.querySelector('#combatTargetHpWrap'))`);
    const hasHitWrapper = await cdp.eval(`Boolean(document.getElementById('combatTargetHit'))`);
    const stripBorderRadius = await cdp.eval(`getComputedStyle(document.querySelector('.presentation-combat-strip-skew')).borderRadius`);

    console.log('Player Action Intent:', playerIntent, '| Actor left:', actorLeft, '| Target right:', targetRight, '| HP Bar present:', hasHpBar, '| Hit wrapper:', hasHitWrapper, '| Strip radius:', stripBorderRadius);

    await sleep(700);
    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'presentation-combat-player.png'));

    // Check dev assert panel
    const assertExpected = await cdp.eval(`document.getElementById('labAssertExpected')?.textContent`);
    const assertDisplayed = await cdp.eval(`document.getElementById('labAssertDisplayed')?.textContent`);
    const assertDelta = await cdp.eval(`document.getElementById('labAssertDelta')?.textContent`);
    console.log(`Dev Assert: Expected=${assertExpected}, Displayed=${assertDisplayed}, Delta=${assertDelta}`);

    verification.steps.push({
      test: 'player_action_physical',
      intent: playerIntent,
      hasHpBar,
      hasHitWrapper,
      stripBorderRadius,
      assertMatch: assertExpected === assertDisplayed && assertExpected === '48',
      success: playerIntent.includes('戰士') && playerIntent.includes('堅定斬擊') && actorLeft && targetRight && hasHpBar && hasHitWrapper && stripBorderRadius === '0px'
    });

    // Wait for action to complete and clean up
    await waitFor(cdp, `!document.querySelector('.presentation-combat-strip-wrap')`, 8000);
    console.log('Player action cleanly finished and exited!');

    // Test 3: Player Magic Action (Mage - Arcane Burst)
    console.log('7. Testing Player Action (Magic - Mage)...');
    await cdp.eval(`(() => {
      const scn = document.getElementById('labSceneSelect');
      scn.value = 'combat_mage';
      scn.dispatchEvent(new Event('change'));
    })()`);

    await waitFor(cdp, `Boolean(document.querySelector('.presentation-combat-strip-wrap.is-player'))`);
    const magicIntent = await cdp.eval(`document.querySelector('.presentation-combat-intent-title')?.textContent`);
    console.log('Magic Action Intent:', magicIntent);

    await sleep(700);
    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'presentation-combat-magic.png'));

    verification.steps.push({
      test: 'player_action_magic',
      intent: magicIntent,
      success: magicIntent.includes('法師') && magicIntent.includes('奧術爆破')
    });

    await waitFor(cdp, `!document.querySelector('.presentation-combat-strip-wrap')`, 8000);
    console.log('Magic action cleanly finished and exited!');

    // Test 3.5: Archer Action (Arrow Projectile & Twang)
    console.log('7.5 Testing Player Action (Archer - Arrow Projectile)...');
    await cdp.eval(`(() => {
      const scn = document.getElementById('labSceneSelect');
      scn.value = 'combat_archer';
      scn.dispatchEvent(new Event('change'));
    })()`);

    await waitFor(cdp, `Boolean(document.querySelector('.presentation-combat-strip-wrap.is-player'))`);
    const archerIntent = await cdp.eval(`document.querySelector('.presentation-combat-intent-title')?.textContent`);
    console.log('Archer Action Intent:', archerIntent);

    await sleep(700);
    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'presentation-combat-archer.png'));

    verification.steps.push({
      test: 'player_action_archer',
      intent: archerIntent,
      success: archerIntent.includes('弓箭手') && archerIntent.includes('穿甲射擊')
    });

    await waitFor(cdp, `!document.querySelector('.presentation-combat-strip-wrap')`, 8000);
    console.log('Archer action cleanly finished and exited!');

    // Test 3.8: Audio Test Buttons (Panel Sweep, Attack, Impact)
    console.log('7.8 Testing 3-tier Audio Test Buttons...');
    const audioButtonsWork = await cdp.eval(`(() => {
      try {
        document.getElementById('btnTestPanelSweep')?.click();
        document.getElementById('btnTestAttackSfx')?.click();
        document.getElementById('btnTestImpactSfx')?.click();
        return true;
      } catch (err) {
        return false;
      }
    })()`);
    console.log('Audio buttons triggered without error:', audioButtonsWork);
    verification.steps.push({
      test: 'audio_test_buttons',
      success: audioButtonsWork
    });

    // Test 4: Boss Action (Crimson Strip - Reverse Mirror Direction)
    console.log('8. Testing Boss Action (Crimson Strip - Reverse Direction)...');
    await cdp.eval(`(() => {
      const scn = document.getElementById('labSceneSelect');
      scn.value = 'combat_boss_action';
      scn.dispatchEvent(new Event('change'));
    })()`);

    await waitFor(cdp, `Boolean(document.querySelector('.presentation-combat-strip-wrap.is-boss'))`);
    const bossIntent = await cdp.eval(`document.querySelector('.presentation-combat-intent-title')?.textContent`);
    const bossActorRight = await cdp.eval(`Boolean(document.querySelector('.presentation-combat-actor-right img'))`);
    const playerTargetLeft = await cdp.eval(`Boolean(document.querySelector('.presentation-combat-target-left img'))`);
    console.log('Boss Action Intent:', bossIntent, '| Boss right:', bossActorRight, '| Player target left:', playerTargetLeft);

    await sleep(700);
    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'presentation-combat-boss.png'));

    verification.steps.push({
      test: 'boss_action_mirror',
      intent: bossIntent,
      success: bossIntent.includes('深淵巨獸') && bossActorRight && playerTargetLeft
    });

    await waitFor(cdp, `!document.querySelector('.presentation-combat-strip-wrap')`, 8000);
    console.log('Boss action cleanly finished and exited!');

    // Test 5: Lethal Hit & Boss Death Presentation (HP 12 -> 0, Boss grayscale & sink)
    console.log('9. Testing Lethal Hit & Boss Death Presentation...');
    await cdp.eval(`(() => {
      const scn = document.getElementById('labSceneSelect');
      scn.value = 'combat_player_lethal';
      scn.dispatchEvent(new Event('change'));
    })()`);

    await waitFor(cdp, `Boolean(document.querySelector('.presentation-combat-strip-wrap.is-player'))`);
    console.log('Lethal Action active...');

    // Wait for Boss to sink and grayscale
    await waitFor(cdp, `Boolean(document.querySelector('.presentation-combat-target-right.is-dead-sink'))`, 6000);
    console.log('Boss death sink reaction triggered!');

    const bossDeathIsDeadSink = await cdp.eval(`Boolean(document.querySelector('.presentation-combat-target-right.is-dead-sink'))`);
    const hpValText = await cdp.eval(`document.getElementById('combatTargetHpVal')?.textContent`);
    console.log('Boss death sink confirmed:', bossDeathIsDeadSink, '| HP val after lethal:', hpValText);

    await cdp.screenshot(path.join(ARTIFACTS_DIR, 'presentation-combat-lethal.png'));

    verification.steps.push({
      test: 'lethal_hit_boss_death',
      bossDeathIsDeadSink,
      hpValText,
      success: bossDeathIsDeadSink && hpValText?.startsWith('0')
    });

    await waitFor(cdp, `!document.querySelector('.presentation-combat-strip-wrap')`, 8000);
    console.log('Lethal action cleanly finished and exited!');

    // Test 6: Full Player -> Boss Sequence
    console.log('10. Testing Full Sequence (Player -> Breathing Gap -> Boss)...');
    await cdp.eval(`(() => {
      const scn = document.getElementById('labSceneSelect');
      scn.value = 'combat_full_sequence';
      scn.dispatchEvent(new Event('change'));
    })()`);

    // Verify stage enters
    await waitFor(cdp, `document.getElementById('presentationCombatStage')?.classList.contains('is-active')`);
    console.log('Combat stage activated!');

    // Verify Player Action in Step 1
    await waitFor(cdp, `Boolean(document.querySelector('.presentation-combat-strip-wrap.is-player'))`);
    console.log('Step 1: Player Action active in full sequence...');

    // Wait for Boss Action in Step 2
    await waitFor(cdp, `Boolean(document.querySelector('.presentation-combat-strip-wrap.is-boss'))`, 12000);
    console.log('Step 2: Boss Action active in full sequence!');

    // Wait for Stage Exit
    await waitFor(cdp, `!document.getElementById('presentationCombatStage')?.classList.contains('is-active')`, 12000);
    console.log('Full sequence completed and combat stage cleanly exited!');

    verification.steps.push({
      test: 'full_combat_sequence',
      success: true
    });

    // Test 7: 20x Rapid Reset / Replay Stress Test
    console.log('11. Testing 20x Rapid Replay & Reset Stress Test...');
    for (let i = 0; i < 20; i++) {
      await cdp.eval(`document.getElementById('btnLabReset').click();`);
    }
    const leftoverCanvases = await cdp.eval(`document.querySelectorAll('.presentation-combat-canvas').length`);
    const rootExists = await cdp.eval(`Boolean(document.getElementById('presentationRoot'))`);
    const labStageExists = await cdp.eval(`Boolean(document.getElementById('labStage'))`);
    console.log('Residual combat canvases after 20 resets:', leftoverCanvases, '| root exists:', rootExists, '| labStage exists:', labStageExists);

    verification.steps.push({
      test: 'replay_20x_stress',
      leftoverCanvases,
      rootExists,
      labStageExists,
      success: leftoverCanvases === 0 && rootExists && labStageExists
    });

    verification.errors = cdp.consoleErrors;
    console.log('Combat verification finished. Console errors:', cdp.consoleErrors.length);

  } finally {
    cdp.close();
    chromeProc.kill();
    serverProc.kill();
    try {
      fs.rmSync(path.resolve('tmp-combat-chrome-profile'), { recursive: true, force: true });
    } catch {}
  }

  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'combat-verification.json'),
    JSON.stringify(verification, null, 2),
    'utf8'
  );

  const failedSteps = verification.steps.filter(s => !s.success);
  if (failedSteps.length > 0 || verification.errors.length > 0) {
    console.error('Failed verification steps:', failedSteps);
    console.error('Errors found in Combat:', verification.errors);
    process.exit(1);
  } else {
    console.log('ALL PHASE 5.1 COMBAT VERIFICATION TESTS PASSED!');
  }
}

main().catch(err => {
  console.error('[Combat Verification Failure]', err);
  process.exit(1);
});
