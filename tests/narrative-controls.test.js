import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './client-fixture.js';

const core = fs.readFileSync(new URL('../public/presentation-core.js', import.meta.url), 'utf8');
function loadPresentationClock(f) {
  vm.runInContext(core.slice(core.indexOf('function waitForPresentation('), core.indexOf('function presentationFrame(')), f.context);
}

test('speed toggle changes only text; ongoing animation waits retain their full duration', async () => {
  const f = fixture();
  loadPresentationClock(f);
  f.context.window = { narrativeSpeedScale: 999 };
  vm.runInContext(`
    globalThis.animationDone = false;
    globalThis.prologueHoldDone = false;
    waitForPresentation(1000).then(() => animationDone = true);
    waitForPrologue(1000, new AbortController().signal).then(() => prologueHoldDone = true);
    globalThis.textEl = document.createElement('div');
    typeWriterEffect(textEl, '甲'.repeat(100), 40);
  `, f.context);
  await f.advance(40);
  assert.equal(f.context.textEl.textContent.length, 1);
  vm.runInContext('accelerateNarrative(true)', f.context);
  await f.advance(10);
  assert.equal(f.context.textEl.textContent.length, 6);
  vm.runInContext('accelerateNarrative(false)', f.context);
  await f.advance(39);
  assert.equal(f.context.textEl.textContent.length, 6);
  await f.advance(1);
  assert.equal(f.context.textEl.textContent.length, 7);
  await f.advance(909);
  assert.equal(f.context.animationDone, false);
  assert.equal(f.context.prologueHoldDone, false);
  await f.advance(1);
  assert.equal(f.context.animationDone, true);
  assert.equal(f.context.prologueHoldDone, true);
  vm.runInContext('currentTypewriterContext.cancel()', f.context);
});

test('phase and event changes reset acceleration, and stale multiplayer updates are ignored', () => {
  const f = fixture(), listeners = new Map();
  f.context.socket.on = (name, fn) => listeners.set(name, fn);
  vm.runInContext('syncNarrativeControls(roomState); installNarrativeControls()', f.context);
  const initialKey = vm.runInContext('narrativeControls.key', f.context);
  listeners.get('narrative:accelerated')({ key:initialKey, accelerated:true });
  vm.runInContext('syncNarrativeControls(roomState)', f.context);
  assert.equal(vm.runInContext('narrativeTextSpeed()', f.context), 20);
  f.context.roomState = { state:'EVENT', floor:1, leaderId:'a', currentEvent:{ presentationId:1 } };
  vm.runInContext('syncNarrativeControls(roomState)', f.context);
  assert.equal(vm.runInContext('narrativeTextSpeed()', f.context), 1);
  listeners.get('narrative:accelerated')({ key:initialKey, accelerated:true });
  assert.equal(vm.runInContext('narrativeTextSpeed()', f.context), 1);
  vm.runInContext('accelerateNarrative(); roomState.currentEvent.presentationId++; syncNarrativeControls(roomState)', f.context);
  assert.equal(vm.runInContext('narrativeTextSpeed()', f.context), 1);
  assert.equal(f.elements.btnSkipPrologue.classList.contains('hidden'), true);
});

test('opening title and exit holds cannot be accelerated', async () => {
  const f = fixture();
  const promise = vm.runInContext('renderProloguePresentation()', f.context);
  vm.runInContext('accelerateNarrative()', f.context);
  await f.advance(1000);
  assert.equal(f.elements.prologuePresBody.textContent, '');
  assert.equal(f.elements.gameTitleContainer.classList.contains('exit'), false);
  assert.equal(f.emissions.length, 0);
  await f.advance(15000);
  await promise;
  assert.deepEqual(f.emissions.map(e=>e.name), ['prologue:next']);
});

test('Boss story accelerates while warning/entrance waits use a fixed speed', async () => {
  const f = fixture(), waits = [];
  vm.runInContext(fs.readFileSync(new URL('../public/battle-phase.js', import.meta.url), 'utf8'), f.context);
  f.context.waitForPresentation = async (ms, signal, scale = 1) => waits.push({ ms, scale });
  vm.runInContext('accelerateNarrative()', f.context);
  await f.context.typeBossStoryParagraphs(f.elements.prologuePresBody, ['甲乙'], null, { character:40 }, null);
  assert.deepEqual(waits, [{ ms:40, scale:20 }, { ms:40, scale:20 }]);
  // The encounter owner locks context.speed before constructing its stage or clock.
  let stageSpeed;
  f.context.sfxManager.preload = async () => {};
  f.context.document.querySelector = () => null;
  f.context.createBattlePhaseStage = (name, context) => { stageSpeed = context.speed; return null; };
  await f.context.playBossIntro({}, { speed:20 });
  assert.equal(stageSpeed, 1);
});
