import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
fs.mkdirSync('artifacts/phase73/after', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { statuses: [], phases: [], aborts: [], screenshots: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto('http://localhost:3011/presentation-lab.html');
  await page.waitForFunction(() => window.labInitialized);
  for (const status of ['exhausted','frenzy','poison','bleed','shield','guard','vulnerable','dodge','hidden','sleep','corruption','downed','combo_triple','combo_exhausted_vulnerable','combo_stealth_dodge','combo_corruption_shield','combo_four']) {
    await page.evaluate(s => playScene('status_' + s), status);
    await page.waitForTimeout(850);
    const result = await page.evaluate(() => getStatusLabPortraits().map(p => {
      const before = [...p.root.querySelectorAll('.status-fx-item')];
      for (let i = 0; i < 60; i++) updateStatusLabGallery();
      return { count: before.length, reused: before.every(n => n.isConnected), layers: p.root.querySelectorAll('.status-fx-layer').length,
        opacity: getComputedStyle(p.root.querySelector('img')).opacity,
        intensity: getComputedStyle(p.root.querySelector('.status-fx-surface')).opacity };
    }));
    assert(result.every(r => r.layers === 3 && r.reused));
    assert.equal(result[2].intensity, status === 'downed' ? '0.15' : '0.6');
    report.statuses.push({ status, portraits: result });
    await page.locator('#labStage').screenshot({ path: `artifacts/phase73/after/${status}.png` });
  }
  const lifecycle = await page.evaluate(async () => {
    const root = document.getElementById('statusLabCardPortrait');
    const image = root.querySelector('img');
    const entity = { role: 'druid', hp: 100, statuses: [{ id: 'poison' }, { id: 'shield' }, { id: 'frenzy' }] };
    syncPortraitStatusFx(entity, root);
    const nodes = [...root.querySelectorAll('.status-fx-item:not(.is-exiting)')];
    for (const form of ['werewolf','treant',null]) {
      image.src = resolveBattlePortrait({ role: 'druid', druidForm: form }).src;
      syncPortraitStatusFx({ ...entity, druidForm: form }, root);
      if (!nodes.every(n => n.isConnected)) throw new Error('Form change recreated FX');
      if (!root.style.getPropertyValue('--portrait-fx-image').includes(image.getAttribute('src'))) throw new Error('Afterimage retained previous form');
    }
    triggerPortraitStatusEvent(root, 'poison', 'tick');
    const tick = root.querySelector('[data-status-fx="poison"]').classList.contains('is-tick');
    triggerPortraitStatusEvent(root, 'shield', 'break');
    const shards = root.querySelectorAll('.status-fx-shield-shard').length;
    syncPortraitStatusFx({ hp: 100, statuses: [] }, root);
    await new Promise(resolve => setTimeout(resolve, 400));
    return { tick, shards, remaining: root.querySelectorAll('.status-fx-item').length };
  });
  assert.deepEqual(lifecycle, { tick: true, shards: 3, remaining: 0 }); report.lifecycle = lifecycle;
  for (const id of ['p73_warning','p73_reveal','p73_encounter','p73_weakened','p73_round1','p73_round5','p73_reduced_boss','p73_reduced_round']) {
    await page.evaluate(() => { labState.speed = 8; labState.showTiming = true; });
    await page.evaluate(id => playScene(id), id);
    assert.equal(await page.locator('.boss-encounter-stage, .round-start-overlay').count(), 0);
    report.phases.push(id);
  }
  const beats = await page.evaluate(async () => {
    const beats = [], sounds = [];
    await playBattlePhaseOpening({ name: 'QA Boss', avatar: '/BOSS/Ancient Guardian Golem.webp' }, 1, {
      encounter: true, speed: 8, onTiming: beat => beats.push(beat), playSound: s => sounds.push(s),
      revealHud() { if (document.querySelector('.boss-encounter-stage')) throw new Error('HUD overlaps Boss'); }
    });
    return { beats, sounds };
  });
  for (const [a,b] of [['warning_complete','boss_rumble'],['boss_rumble','boss_boom'],['boss_art_settle','boss_name_entry'],['boss_complete','battle_hud_reveal'],['battle_hud_reveal','round_strip_entry'],['round_sub_exit','round_main_exit'],['round_main_exit','round_strip_exit']]) {
    assert(beats.beats.indexOf(a) < beats.beats.indexOf(b), a + ' before ' + b);
  }
  assert.deepEqual(beats.sounds, ['boss_warning','boss_entrance','round_start']); report.beats = beats;
  for (const [kind, point] of [['boss','warning_entry'],['boss','boss_rumble'],['boss','boss_art_entry'],['boss','boss_name_entry'],['round','round_main_entry']]) {
    const result = await page.evaluate(async ({kind,point}) => {
      const controller = new AbortController(); let name;
      const context = { signal: controller.signal, speed: 8, onTiming(beat) { if (beat === point) controller.abort(); } };
      try { if (kind === 'boss') await playBossIntro({ name: 'QA', avatar: '/BOSS/Ancient Guardian Golem.webp' }, context); else await playRoundStartBanner(5, context); }
      catch (e) { name = e.name; }
      return { name, remaining: document.querySelectorAll('.boss-encounter-stage,.round-start-overlay').length };
    }, {kind,point});
    assert.deepEqual(result, {name:'AbortError',remaining:0}); report.aborts.push(point);
  }
  // Freeze a production wait only for capturing a fully settled visual beat.
  for (const device of ['desktop','mobile']) {
    await page.setViewportSize({ width: device === 'desktop' ? 1800 : 1440, height: 1000 });
    await page.evaluate(device => {
      const frame = document.getElementById('labDeviceFrame'); frame.classList.remove('is-responsive');
      frame.style.width = device === 'mobile' ? '390px' : '1100px'; frame.style.height = '720px'; frame.style.zoom = '1';
    }, device);
    for (const [kind, point] of [['boss','warning_hold'],['boss','boss_hold'],['round','round_hold']]) {
      await page.evaluate(({kind,point}) => {
        resetLab(); window.__phaseCapture = false; window.__freezePhase = false;
        const original = window.waitForPresentation;
        window.waitForPresentation = (ms, signal, speed) => window.__freezePhase ? new Promise(resolve => { window.__releasePhase = resolve; }) : original(ms,signal,speed);
        const context = { speed: 1, onTiming(beat) { if (beat === point) { window.__phaseCapture = true; window.__freezePhase = true; } } };
        window.__phasePreview = (kind === 'boss' ? playBossIntro({ name: '遠古守衛石像', avatar: '/BOSS/Ancient Guardian Golem.webp' }, context) : playRoundStartBanner(5, context)).finally(() => { window.waitForPresentation = original; });
      }, {kind,point});
      await page.waitForFunction(() => window.__phaseCapture && window.__releasePhase);
      const path = `artifacts/phase73/after/${device}-${point}.png`;
      await page.locator('#labStage').screenshot({ path }); report.screenshots.push(path);
      const bounds = await page.evaluate(({kind,point}) => {
        const container = document.getElementById('labStage').getBoundingClientRect();
        const node = document.querySelector(kind === 'round' ? '.round-start-main' : point === 'boss_hold' ? '.boss-encounter-name' : '.boss-warning-copy');
        const rect = node.getBoundingClientRect(); return { overflow: rect.left < container.left || rect.right > container.right };
      }, {kind,point});
      assert.equal(bounds.overflow, false);
      await page.evaluate(() => { window.__freezePhase = false; window.__releasePhase(); });
      await page.evaluate(() => window.__phasePreview);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(async () => {
    let boss, round;
    await playBossIntro({name:'QA'}, {speed:8,onTiming(beat){if(beat==='boss_boom') boss=getComputedStyle(document.querySelector('.is-boom')).animationName;}});
    await playRoundStartBanner(1,{speed:8,onTiming(beat){if(beat==='round_main_entry')round=getComputedStyle(document.querySelector('.round-start-main')).animationName;}});
    await playScene('status_combo_four');
    return {boss,round,star:getComputedStyle(document.querySelector('.status-fx-star')).animationName};
  });
  assert.deepEqual(reduced,{boss:'bossReducedTremor',round:'phaseReducedRight',star:'none'}); report.reduced = reduced;
  assert.deepEqual(report.errors, []);
  console.log('PASS 17 status scenes, eight phase scenes, form/apply/remove/tick/break, ordering, five aborts, desktop/mobile, reduced motion; zero errors');
} finally {
  fs.writeFileSync('artifacts/phase73/report.json', JSON.stringify(report,null,2));
  await browser.close();
}
