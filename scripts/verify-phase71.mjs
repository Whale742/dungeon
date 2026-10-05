import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const artifacts = path.resolve('artifacts/phase71'); fs.mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], report = { lab: [], multiplayer: [], errors };
async function pageFor(url, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  page.on('response', response => { if (response.status() >= 400) console.log('RESOURCE ERROR', response.status(), response.url()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text() + ' ' + message.location().url); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}
const emit = (page, event, payload) => page.evaluate(({ event, payload }) => new Promise(resolve => {
  if (payload === null) socket.emit(event, resolve); else socket.emit(event, payload, resolve);
}), { event, payload });
try {
  const lab = await pageFor('http://localhost:3011/presentation-lab.html');
  await lab.evaluate(() => {
    window.__snapshots = []; window.__beats = [];
    const apply = window.applyHpSnapshot;
    window.applyHpSnapshot = snapshot => { window.__snapshots.push(structuredClone(snapshot)); apply(snapshot); };
    window.__play = async (id, speed = 12) => {
      window.__beats = []; window.__snapshots = [];
      const scene = PHASE6_LAB_SCENES[id];
      const context = { speed, controller: new AbortController(), onTiming(beat, data) {
        const stage = getOrCreateCombatStage();
        const node = stage.querySelector('[data-phase="cast"]');
        window.__beats.push({ beat, targetId: data?.targetId, damage: data?.result?.finalDamage,
          hp: data?.result?.targetAfter?.hp, ammo: data?.ammo,
          castBoss: node ? !!node.querySelector('img[src*="/BOSS/"]') : false,
          castCards: node ? node.querySelectorAll('.presentation-result-card').length : 0,
          portraits: [...stage.querySelectorAll('img')].map(img => img.getAttribute('src')) });
      } };
      await enterCombatStage(context);
      try { for (const step of scene.steps) await playExpandedCombatPresentation(step, context); }
      finally { await exitCombatStage(context); }
      return { beats: window.__beats, snapshots: window.__snapshots, children: getOrCreateCombatStage().children.length };
    };
  });
  const allIds = await lab.evaluate(() => Object.keys(PHASE6_LAB_SCENES).filter(id => id.startsWith('p71_') || [
    'p6_summon_wolf', 'p6_summon_treant', 'p6_wolf_transform', 'p6_treant_transform', 'p6_shield_apply', 'p6_bard_buff', 'p6_bard_heal', 'p6_bard_revive', 'p6_alchemy_success', 'p6_alchemy_failure'
  ].includes(id)));
  const ids = process.env.QA_ONLY_MULTIPLAYER ? [] : allIds;
  for (const [index, id] of ids.entries()) {
    const result = await lab.evaluate(id => window.__play(id), id);
    assert.equal(result.children, 0, id + ' canvas cleanup');
    for (const beat of result.beats.filter(b => b.beat.startsWith('cast_'))) {
      assert.equal(beat.castBoss, false, id + ' cast has no boss'); assert.equal(beat.castCards, 0, id + ' cast has no result cards');
    }
    if (id.includes('summon')) {
      const reveal = result.beats.findIndex(b => b.beat === 'summon_established');
      const attack = result.beats.findIndex(b => b.beat === 'minion_attack');
      assert.ok(reveal >= 0 && attack > reveal, id + ' reveal before attack');
    }
    if (id === 'p6_wolf_transform') {
      const reveal = result.beats.findIndex(b => b.beat === 'transform_established');
      const attack = result.beats.findIndex(b => b.beat === 'attack_fx');
      assert.ok(attack > reveal && reveal >= 0, 'form reveal precedes claw');
      assert.ok(result.beats[attack].portraits.includes('/photo/狼人.webp'));
    }
    if (id.startsWith('p71_minions_')) {
      const count = Number(id.slice(-1));
      assert.equal(result.beats.filter(b => b.beat === 'minion_combo_entry').length, 1);
      const hits = result.beats.filter(b => b.beat === 'hp_update' && b.targetId === 'monster');
      assert.equal(hits.length, count);
      assert.equal(new Set(hits.map(b => b.hp)).size, count);
    }
    report.lab.push({ id, beats: result.beats.map(b => b.beat) });
    if (index % 8 === 0) console.log('Lab', index+1, '/', ids.length, id);
  }
  // Capture actual production DOM at normal speed on both desktop and a phone-sized stage.
  for (const [name, width, height] of (process.env.QA_ONLY_MULTIPLAYER ? [] : [['desktop', 1100, 650], ['mobile', 390, 720]])) {
    await lab.evaluate(({ width, height }) => {
      const frame = document.getElementById('labDeviceFrame');
      frame.classList.remove('is-responsive'); frame.style.width = width + 'px'; frame.style.height = height + 'px'; frame.style.zoom = '1';
    }, { width, height });
    for (const [id, beat] of [['p6_summon_wolf', 'cast_fx'], ['p6_summon_wolf', 'summon_reveal'], ['p6_wolf_transform', 'transform_reveal'], ['p71_minions_3', 'minion_combo_entry'], ['p71_a_frenzy_reload_1_elemental', 'ammo_insert'], ['p71_werewolf_basic', 'attack_fx'], ['p71_boss_claw', 'impact'], ['p71_sword', 'attack_fx']]) {
      await lab.evaluate(id => { window.__current = window.__play(id, 1); }, id);
      await lab.waitForFunction(beat => window.__beats.some(b => b.beat === beat), beat);
      await lab.waitForTimeout(beat === 'attack_fx' ? 60 : 120);
      await lab.locator('#labStage').screenshot({ path: path.join(artifacts, name + '-' + id + '-' + beat + '.png') });
      await lab.evaluate(() => window.__current);
    }
  }
  // Seven independent browser clients through the unmodified production Socket.IO handlers.
  const roles = ['warrior', 'mage', 'archer', 'assassin', 'bard', 'alchemist', 'druid'];
  const pages = [];
  for (const role of roles) {
    const page = await pageFor('http://localhost:3011/');
    await page.waitForFunction(() => socket.connected);
    await page.evaluate(() => {
      const wait = window.waitForPresentation;
      window.waitForPresentation = (ms, signal, speed = 1) => wait(ms, signal, speed * 8);
      window.__queues = []; window.__acks = [];
      socket.on('battle:presentation_queue', data => window.__queues.push(data));
      const emit = socket.emit.bind(socket);
      socket.emit = (event, ...args) => { if (event === 'battle:presentation_complete') window.__acks.push(args[0]); return emit(event, ...args); };
    });
    pages.push(page);
  }
  const create = await emit(pages[0], 'room:create', { name: 'QA-warrior' }); assert.equal(create.success, true);
  for (let i = 1; i < pages.length; i++) assert.equal((await emit(pages[i], 'room:join', { code: create.roomCode, name: 'QA-'+roles[i], avatar: i === 6 ? '🌿' : null })).success, true);
  for (let i = 0; i < pages.length; i++) assert.equal((await emit(pages[i], 'player:select_role', { roleKey: roles[i] })).success, true);
  assert.equal((await emit(pages[0], 'game:start', null)).success, true);
  const rounds = [
    ['w_shield', 'm_blast', 'a_reload', 's_stab', 'b_buff', 'alc_fate', 'dru_summon_wolf'],
    ['basic', 'm_drain', 'a_frenzy_reload', 's_smoke', 'b_heal', 'alc_flask', 'dru_transform'],
    ['basic', 'basic', 'basic', 'basic', 'basic', 'basic', 'basic']
  ];
  for (let round = 1; round <= rounds.length; round++) {
    await Promise.all(pages.map(page => page.waitForFunction(round => roomState?.battleRound === round && roomState?.selectionState === 'SELECTING' && !isProcessingPresentationQueue && !roomState.isNarrating, round, { timeout: 60000 })));
    for (let i = 0; i < pages.length; i++) {
      const res = await emit(pages[i], 'battle:lock', { actionId: rounds[round-1][i] }); assert.equal(res.success, true, roles[i] + ' locks ' + rounds[round-1][i]);
    }
    await Promise.all(pages.map(page => page.waitForFunction(round => window.__acks.some(a => a.round === round) && roomState?.battleRound > round, round, { timeout: 60000 })));
    const viewers = await Promise.all(pages.map(page => page.evaluate(round => {
      const wire = window.__queues.find(q => q.round === round && q.queue.some(s => s.type === 'boss_action'));
      return { round, id: wire?.presentationId, categories: wire?.queue.map(s => s.category), ack: window.__acks.filter(a => a.round === round).length, mounted: document.querySelector('#presentationCombatStage')?.children.length };
    }, round)));
    assert.equal(new Set(viewers.map(v => v.id)).size, 1); viewers.forEach(v => assert.ok(v.ack >= 1));
    report.multiplayer.push({ round, viewers }); console.log('Multiplayer round', round, 'seven viewers complete');
  }
  await pages[6].screenshot({ path: path.join(artifacts, 'multiplayer-druid.png') });
  assert.deepEqual(errors, [], 'No browser exceptions or console errors');
  console.log('PASS', ids.length, 'Lab scenes, seven-player three-round regression, zero errors');
} finally {
  fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
