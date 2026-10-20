import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createUiFixtures } from './azure-ui-fixtures.mjs';
const { chromium } = createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--autoplay-policy=no-user-gesture-required'] });
const fixtures = createUiFixtures();
const output = 'artifacts/azure-ui';
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], screenshots: [], errors: [] };
try {
 for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  const page = await browser.newPage({ viewport });
  await page.route('**fonts.googleapis.com/**', r => r.abort());
  await page.route('**fonts.gstatic.com/**', r => r.abort());
  const prefix = `${viewport.width}x${viewport.height}`;
  const shot = async name => { const path = `${output}/${prefix}-${name}.png`; await page.screenshot({ path, fullPage: true }); report.screenshots.push(path); };
  const check = (name, condition) => { assert(condition, `${prefix}: ${name}`); report.checks.push(`${prefix}: ${name}`); };
  page.on('pageerror', e => report.errors.push(`${prefix}: ${e.message}`));
  await page.goto(process.env.UI_ORIGIN || 'http://127.0.0.1:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof classesData !== 'undefined' && Object.keys(classesData).length >= 15);
  await page.waitForTimeout(300);
  const centered = async selector => { const box = await page.locator(selector).boundingBox(); return Math.abs(box.x + box.width / 2 - viewport.width / 2) < 2; };
  check('recruit centered', await centered('.recruit-card'));
  await shot('recruit');
  await page.locator('#inputPlayerName').fill('蒼藍守望');
  await page.locator('#btnSubmitRecruit').click();
  await page.waitForTimeout(300);
  check('menu centered', await centered('#screenLobbyMenu > div'));
  await shot('menu');
  await page.evaluate(() => openClassArchiveFromMenu());
  for (const role of ['warrior', 'druid', 'sage', 'onmyoji']) {
   await page.locator(`#roleSelectionGrid [data-role="${role}"]`).click();
   await page.waitForFunction(() => { const img = document.getElementById('lobbyRoleAvatar'); return img && img.getAttribute('src'); });
   await page.waitForFunction(() => { const img = document.getElementById('lobbyRoleAvatar'); return img && img.complete; }, { timeout: 3000 }).catch(() => {});
   await page.waitForTimeout(350);
   const portrait = await page.locator('.role-hero-portrait').boundingBox();
   check(`${role} fixed portrait`, portrait.width === 144 && portrait.height === 180);
   check(`${role} information fits`, await page.locator('.role-identity-copy').evaluate(n => n.scrollWidth <= n.clientWidth));
   await shot(`class-${role}`);
  }
  // Squad room lobby check (two columns: 320px squad sidebar + role details)
  await page.evaluate(state => { myId = 'qa'; roomState = state; renderApp(); }, fixtures.lobby);
  await page.waitForTimeout(350);
  check('squad sidebar visible in room lobby', await page.locator('#viewLobby .team-card').isVisible());
  const squadPortrait = await page.locator('.role-hero-portrait').boundingBox();
  check('room lobby fixed portrait', squadPortrait.width === 144 && squadPortrait.height === 180);
  check('room lobby information fits', await page.locator('.role-identity-copy').evaluate(n => n.scrollWidth <= n.clientWidth));
  check('room lobby squad members shown', await page.locator('#lobbyMemberList .member-item').count() >= 2);
  await shot('room-lobby');
  // Disconnect only this local QA client; fixtures do not modify any live room.
  await page.evaluate(state => { socket.disconnect(); myId = 'qa'; roomState = state; renderApp(); }, fixtures.shop);
  await page.waitForTimeout(500);
  await page.locator('.shop-item-card').first().click();
  check('shop names are not clipped', await page.locator('.shop-container .item-layer-name').evaluateAll(ns => ns.every(n => n.scrollWidth <= n.clientWidth + 1 && n.scrollHeight <= n.clientHeight + 1)));
  check('shop has two columns', await page.locator('.shop-dual-column').evaluate(n => getComputedStyle(n).gridTemplateColumns.split(' ').length === 2));
  await shot('shop-details');
  await page.evaluate(state => {
   window.qaSounds = []; const original = playSound;
   playSound = function(type, options) { window.qaSounds.push(type); return original(type, options); };
   roomState = state; renderApp();
  }, fixtures.route);
  await page.waitForTimeout(80);
  await shot('floor-start');
  check('floor covers header', await page.evaluate(() => document.elementFromPoint(20, 20)?.closest('#floorIntroOverlay') !== null));
  check('narrative controls hidden during floor transition', await page.evaluate(() => {
    const controls = document.getElementById('narrativeControls');
    return !controls || getComputedStyle(controls).visibility === 'hidden' || controls.classList.contains('hidden');
  }));
  check('chat container hidden during floor transition', await page.evaluate(() => {
    const chat = document.getElementById('floatingChatContainer');
    return !chat || getComputedStyle(chat).visibility === 'hidden' || chat.classList.contains('hidden');
  }));
  await page.waitForTimeout(900);
  await shot('floor-middle');
  check('walk audio requested', await page.evaluate(() => qaSounds.includes('walk')));
  report.audio = await page.evaluate(() => ({ state: sfxManager.ctx?.state, voices: [...sfxManager.activeVoices].map(v => v.key), enabled: sfxManager.soundEnabled }));
  await page.waitForFunction(() => document.getElementById('floorIntroOverlay').classList.contains('hidden'));
  check('controls restored after floor transition', await page.evaluate(() => {
    return !document.body.classList.contains('presentation-floor-active');
  }));
  await shot('floor-end-map-before');
  await page.waitForFunction(() => document.getElementById('routeAtmosphereText').textContent.length > 10);
  check('narrative starts centered', await centered('.map-story'));
  check('choices hidden during typing', !(await page.locator('.map-side').isVisible()));
  await shot('map-typing');
  await page.waitForFunction(() => routeInteractionReadyKey === routePresentationKey(), { timeout: 60000 });
  await page.evaluate(() => { roomState.isNarrating = false; renderApp(); });
  await shot('map-after');
  check('seven staggered rows preserved', await page.locator('.hex-grid-board > .hex-row').count() === 7);
  check('leftmost hex visible', await page.evaluate(() => { const canvas = document.querySelector('.abyss-map-canvas').getBoundingClientRect(); const cell = document.querySelector('.hex-row-middle .hex-cell').getBoundingClientRect(); return cell.left >= canvas.left && cell.right <= canvas.right; }));
  await page.evaluate(() => { document.querySelector('.abyss-map-canvas').scrollLeft = 10000; });
  await shot('map-scrolled-right');
  check('right edge reachable', await page.locator('.abyss-map-canvas').evaluate(n => n.scrollLeft + n.clientWidth >= n.scrollWidth - 1));
  await page.evaluate(() => { document.querySelector('.abyss-map-canvas').scrollLeft = 0; });
  await page.locator('.hex-cell.hex-selectable').first().click();
  check('route confirmation enabled after selection', await page.locator('#btnConfirmHexVote').isEnabled());
  await shot('map-selected');
  await page.evaluate(() => { roomState.state = 'TRANSITION'; roomState.currentTransition = { floor: 1, routeId: 'qa-route', routeName: '羊腸小徑', storyTitle: '羊腸小徑', storyText: '小隊踏入幽暗的遺跡，腳下的石磚傳來細微回響。薄霧在斷裂的石柱間流動。', outcomeType: 'event' }; renderApp(); });
  await shot('route-story-start');
  await page.waitForFunction(() => document.getElementById('transitionStoryText').textContent.length > 5);
  await shot('route-story-middle');
  await page.waitForFunction(() => !document.getElementById('transitionStoryText').classList.contains('typewriter-cursor'));
  check('route story has no card border', await page.locator('.transition-story-box').evaluate(n => getComputedStyle(n).borderTopWidth === '0px'));
  await shot('route-story-end');
  await page.evaluate(state => { roomState = state; renderApp(); }, fixtures.event);
  await shot('event-start');
  await page.waitForFunction(() => document.getElementById('trapDiscoveryStory').textContent.length > 5);
  await shot('event-middle');
  check('event keeps scene without card', await page.locator('#trapDiscoveryStory').evaluate(n => getComputedStyle(n).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(n).borderTopWidth === '0px'));
  await page.waitForFunction(story => document.getElementById('trapDiscoveryStory').textContent.replace(/\s/g, '') === story.replace(/\s/g, ''), fixtures.event.currentEvent.story);
  await shot('event-text-complete');
  await page.waitForFunction(() => !trapPresentationController, { timeout: 60000 });
  await shot('event-end');
  await page.evaluate(state => { roomState = state; presentationManager.markPlayed('BOSS_INTRO_' + battleSceneKey(state)); lastAnnouncedBattleRound = state.battleRound; battleControlsReadyKey = battleRoundKey(state); renderApp(); }, fixtures.battle);
  await page.waitForTimeout(400);
  await page.locator('.skill-btn').nth(1).click();
  await page.locator('.battle-enemy-slot').first().click();
  const lock = await page.locator('#btnConfirmLock').boundingBox();
  check('skill, target and lock fit first viewport', lock.y >= 0 && lock.y + lock.height <= viewport.height);
  check('lock accessible without overlay', await page.locator('#btnConfirmLock').evaluate(n => {
    const b = n.getBoundingClientRect();
    const points = [
      { x: b.x + 2, y: b.y + 2 },
      { x: b.x + b.width - 2, y: b.y + 2 },
      { x: b.x + 2, y: b.y + b.height - 2 },
      { x: b.x + b.width - 2, y: b.y + b.height - 2 },
      { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    ];
    return points.every(p => {
      const el = document.elementFromPoint(p.x, p.y);
      return n.contains(el);
    });
  }));
  check('lock button completely clear of floating chat', await page.evaluate(() => {
    const l = document.getElementById('btnConfirmLock');
    const c = document.getElementById('floatingChatBtn');
    if (!l || !c) return false;
    const lb = l.getBoundingClientRect();
    const cb = c.getBoundingClientRect();
    return (lb.right <= cb.left || lb.left >= cb.right || lb.bottom <= cb.top || lb.top >= cb.bottom);
  }));
  await page.evaluate(() => { roomState.logs.push({ id: 'qa-hit', time: '12:00:00', type: 'damage', text: '蒼藍守望使用堅定斬擊，對敵人造成 18 點傷害。' }, { id: 'qa-shield', time: '12:00:01', type: 'buff', text: '壁壘守護為全隊提供 48 點護盾。' }); renderRecentBattleLogs(elements.combatLogWindow, roomState.logs); });
  check('round summary populated', (await page.locator('#battleRoundSummary').textContent()).includes('18 點傷害'));
  check('history collapsed by default', !(await page.locator('#combatLogWindow').isVisible()));
  await shot('battle-summary-selected');
  await page.locator('#logDrawerHandle').click();
  check('complete history retained', await page.locator('#combatLogWindow > .log-line').count() === await page.evaluate(() => roomState.logs.length));
  check('history readable without fading', await page.locator('#combatLogWindow > .log-line').first().evaluate(n => getComputedStyle(n).filter === 'blur(0px)'));
  await shot('battle-full-history');
  await page.close();
 }
 assert.deepEqual(report.errors, []);
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
 await browser.close();
 fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
 console.log(JSON.stringify(report, null, 2));
 process.exit(report.errors.length || report.failure ? 1 : 0);
}
