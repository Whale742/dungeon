import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './client-fixture.js';
import vm from 'node:vm';

test('typewriter paints empty through two RAFs and inserts only individual characters', async () => {
  const f = fixture();
  const promise = vm.runInContext(
    'typePrologueParagraphs(elements.prologuePresBody, ["甲，乙。", "丙丁！"], new AbortController().signal)',
    f.context
  );
  await f.advance(31);
  assert.equal(f.elements.prologuePresBody.textContent, '');
  assert.ok(f.writes.every(write => write.text === ''));
  await f.advance(40);
  assert.equal(f.elements.prologuePresBody.textContent, '');
  await f.advance(1);
  assert.equal(f.elements.prologuePresBody.textContent, '甲');
  await f.advance(4000);
  await promise;
  assert.equal(f.elements.prologuePresBody.textContent, '甲，乙。丙丁！');
  assert.ok(f.writes.every(write => Array.from(write.text).length <= 1));
});

test('completion follows all exits, clears text, restores controls and ACKs exactly once', async () => {
  const f = fixture();
  const promise = vm.runInContext('renderProloguePresentation()', f.context);
  assert.equal(f.app.inert, true);
  assert.equal(f.manager.isBlocking, true);
  await f.advance(4000);
  assert.equal(f.emissions.length, 0);
  await f.advance(12000);
  await promise;
  assert.deepEqual(f.emissions.map(item => item.name), ['prologue:next']);
  assert.equal(f.elements.prologuePresBody.textContent, '');
  assert.equal(f.elements.gameStartOverlay.classList.contains('hidden'), true);
  assert.equal(f.app.inert, false);
  assert.equal(f.manager.isBlocking, false);
  assert.equal(f.tasks.size, 0);
  await vm.runInContext('renderProloguePresentation()', f.context);
  assert.equal(f.emissions.length, 1);
  assert.equal(f.errors.length, 0);
});

test('abort cleans synchronously and its finally cannot unlock a new owner', async () => {
  const f = fixture();
  const promise = vm.runInContext('renderProloguePresentation()', f.context);
  await f.advance(4500);
  vm.runInContext('prologueController.abort(); presentationManager.setBlocking(true);', f.context);
  assert.equal(f.app.inert, false);
  assert.equal(f.elements.prologuePresBody.textContent, '');
  await f.flush();
  await promise;
  assert.equal(f.manager.isBlocking, true);
  assert.equal(f.emissions.length, 0);
  assert.equal(f.tasks.size, 0);
  assert.equal(f.errors.length, 0);
});

test('missing story cleans the opening without a false completion ACK', async () => {
  const f = fixture();
  f.context.roomState.currentPrologue = null;
  await vm.runInContext('renderProloguePresentation()', f.context);
  assert.equal(f.app.inert, false);
  assert.equal(f.manager.isBlocking, false);
  assert.equal(f.elements.gameStartOverlay.classList.contains('hidden'), true);
  assert.equal(f.emissions.length, 0);
  assert.equal(f.errors.length, 1);
});

test('real prologue preloads music and starts normal BGM only after completion',async()=>{
 const f=fixture(),calls=[];
 f.context.bgmManager={preload:()=>calls.push('preload'),resumeNormal:()=>calls.push('normal')};
 const promise=vm.runInContext('renderProloguePresentation()',f.context);
 assert.deepEqual(calls,['preload']);
 await f.advance(4000);assert.deepEqual(calls,['preload']);
 await f.advance(12000);await promise;assert.deepEqual(calls,['preload','normal']);
 await vm.runInContext('renderProloguePresentation()',f.context);assert.deepEqual(calls,['preload','normal']);
});
test('cancelled prologue does not start exploration music',async()=>{
 const f=fixture(),calls=[];
 f.context.bgmManager={preload:()=>{},resumeNormal:()=>calls.push('normal')};
 const promise=vm.runInContext('renderProloguePresentation()',f.context);
 await f.advance(4000);vm.runInContext('prologueController.abort()',f.context);
 await promise;assert.deepEqual(calls,[]);
});

test('only explicit prologue button skips; clicking the curtain has no effect', async () => {
  const f = fixture();
  f.context.roomState.leaderId = 'a';
  const promise = vm.runInContext('renderProloguePresentation()', f.context);
  await f.advance(2000);
  assert.equal(f.elements.gameStartOverlay.classList.contains('hidden'), false);
  f.elements.gameStartOverlay.click();
  assert.equal(f.emissions.length, 0);
  f.elements.btnSkipPrologue.click();
  await promise;
  assert.deepEqual(f.emissions.map(e => e.name), ['prologue:skip']);
  assert.equal(f.elements.gameStartOverlay.classList.contains('hidden'), true);
  assert.equal(f.app.inert, false);
  assert.equal(f.manager.isBlocking, false);
});

test('non-leader cannot skip prologue with the button', async () => {
  const f = fixture();
  f.context.roomState.leaderId = 'other_player';
  const promise = vm.runInContext('renderProloguePresentation()', f.context);
  await f.advance(2000);
  f.elements.btnSkipPrologue.click();
  assert.equal(f.emissions.length, 0);
  assert.equal(f.elements.gameStartOverlay.classList.contains('hidden'), false);
  await f.advance(14000);
  await promise;
  assert.deepEqual(f.emissions.map(e => e.name), ['prologue:next']);
});

test('story narrative text has unselectable user-select rule in CSS', () => {
  const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.presentation-prologue/);
  assert.match(css, /\.transition-story-box/);
  assert.match(css, /\.exploration-story/);
  assert.match(css, /user-select:\s*none\s*!important/);
});

test('typeWriterEffect accelerates speed when accelerateNarrative is invoked', async () => {
  const f = fixture();
  vm.runInContext(`
    globalThis.testEl = document.createElement('div');
    typeWriterEffect(globalThis.testEl, '測試加速打字文字', 45);
  `, f.context);
  await f.advance(50);
  assert.equal(f.context.testEl.textContent.length <= 2, true);
  vm.runInContext('accelerateNarrative()', f.context);
  await f.advance(35);
  assert.equal(f.context.testEl.textContent, '測試加速打字文字');
});

test('skip and speed hints are not rendered in html or css', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.equal(html.includes('👑 隊長點擊畫面可跳過'), false);
  assert.equal(html.includes('👑 隊長點擊畫面可加速'), false);
  assert.equal(html.includes('id="prologueSkipHint"'), false);
  assert.equal(html.includes('id="transitionSpeedHint"'), false);
  const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.equal(css.includes('.prologue-skip-hint'), false);
  assert.equal(css.includes('.transition-speed-hint'), false);
});

test('non-narrating route choice immediately reveals choices and unblocks client', () => {
  const f = fixture();
  const doc = f.context.document;
  const el = () => doc.createElement('div');
  f.elements.routeFloorNum = el();
  f.elements.routeMainTitle = el();
  f.elements.routeDiffPercent = el();
  f.elements.routeAtmosphereText = el();
  f.elements.routeStatusText = el();
  f.elements.routeTimerText = el();
  f.elements.routeTimerProgress = el();
  f.elements.routeOptionsGrid = el();
  f.elements.routeVotersStatusList = el();
  f.elements.routeTimerBar = el();
  f.context.getIconSvg = () => '';
  f.context.escapeHtml = s => s;
  f.context.routeNarrativeDoneKey = null;
  f.context.routeInteractionReadyKey = null;

  vm.runInContext(fs.readFileSync(new URL('../public/exploration.js', import.meta.url), 'utf8'), f.context);
  f.context.roomState = {
    state: 'CHOOSING_ROUTE',
    floor: 1,
    leaderId: 'a',
    isNarrating: false,
    routePresentationId: 1,
    currentRoutes: [{ id: 'r1', name: '路線1', desc: '描述' }],
    players: [{ id: 'a', name: '玩家A', hp: 100, maxHp: 100, role: 'warrior' }]
  };

  vm.runInContext('renderRouteChoice(roomState.players[0])', f.context);
  assert.equal(f.elements.views.route.classList.contains('view-gated-hidden'), false);
  assert.equal(f.elements.routeOptionsGrid.classList.contains('hidden'), false);
  assert.equal(f.manager.isBlocking, false);
  assert.equal(f.app.inert, false);
});


