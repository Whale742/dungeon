import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], results = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:3011/presentation-lab.html');
  for (const [id, beat] of [['p6_summon_wolf', 'cast_fx'], ['p6_summon_wolf', 'summon_reveal'], ['p6_wolf_transform', 'transform_reveal'], ['p71_a_reload_0_pierce', 'ammo_insert'], ['p71_minions_3', 'minion_attack']]) {
    const result = await page.evaluate(async ({ id, beat }) => {
      const controller = new AbortController(); let name;
      const snapshots = []; const apply = window.applyHpSnapshot;
      window.applyHpSnapshot = s => { snapshots.push(s); apply(s); };
      try {
        await playExpandedCombatPresentation(PHASE6_LAB_SCENES[id].steps.find(s =>
          beat === 'minion_attack' ? s.category === 'MINION_ATTACK' : true), {
          controller, signal: controller.signal, speed: 8, onTiming(event) { if (event === beat) controller.abort(); }
        });
      } catch (error) { name = error.name; }
      finally { window.applyHpSnapshot = apply; }
      return { id, beat, name, snapshots: snapshots.length, children: getOrCreateCombatStage().children.length };
    }, { id, beat });
    assert.equal(result.name, 'AbortError'); assert.equal(result.children, 0); assert.equal(result.snapshots, 0);
    results.push(result);
  }
  const reduced = await page.evaluate(async () => {
    let checked = false;
    await playExpandedCombatPresentation(PHASE6_LAB_SCENES.p71_werewolf_basic.steps[0], {
      reducedMotion: true, speed: 2, onTiming(beat) {
        if (beat === 'attack_fx') {
          const fx = document.querySelector('.combat-fx-claw');
          checked = fx?.dataset.reducedMotion === 'true' && getComputedStyle(fx.querySelector('.combat-claw-tear')).animationName === 'combatClawFlash';
        }
      }
    });
    return checked;
  });
  assert.equal(reduced, true); assert.deepEqual(errors, []);
  // Final mobile composition check after tightening the compact title and stack origin.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const frame = document.getElementById('labDeviceFrame');
    frame.classList.remove('is-responsive'); frame.style.width = '390px'; frame.style.height = '720px'; frame.style.zoom = '1';
    window.__entered = false;
    window.__originalWait = window.waitForPresentation;
    window.waitForPresentation = (ms, signal, speed) => window.__freeze
      ? new Promise(resolve => { window.__release = resolve; }) : window.__originalWait(ms, signal, speed);
    window.__preview = (async () => {
      const context = { speed: 1, onTiming(beat) { if (beat === 'minion_combo_entry') { window.__entered = true; window.__freeze = true; } } };
      await enterCombatStage(context);
      try { await playExpandedCombatPresentation(PHASE6_LAB_SCENES.p71_minions_3.steps.find(s => s.category === 'MINION_ATTACK'), context); }
      finally { await exitCombatStage(context); }
    })();
  });
  await page.waitForFunction(() => window.__entered);
  await page.waitForTimeout(500);
  await page.locator('#labStage').screenshot({ path: 'artifacts/phase71/mobile-minion-final.png' });
  await page.evaluate(() => { window.__freeze = false; window.waitForPresentation = window.__originalWait; window.__release(); });
  await page.evaluate(() => window.__preview);
  console.log('PASS five cast/result/combo abort points; reduced motion preserves claw identity');
  fs.writeFileSync('artifacts/phase71/lifecycle.json', JSON.stringify({ results, reduced, errors }, null, 2));
} finally { await browser.close(); }
