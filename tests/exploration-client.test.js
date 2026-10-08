import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './client-fixture.js';

function exploration() {
  const f = fixture();
  const bonus=f.context.document.createElement('span'),getElement=f.context.document.getElementById;
  bonus.closest=()=>bonus;f.bonus=bonus;
  f.context.document.getElementById=id=>id==='routeDiffPercent'?bonus:getElement(id);
  f.context.roomState = {
    state: 'CHOOSING_ROUTE', routePresentationId: 2,
    currentRoutes: [{}, {}, {}, {}]
  };
  vm.runInContext(fs.readFileSync(new URL('../public/exploration.js', import.meta.url), 'utf8'), f.context);
  return f;
}

test('floor fully exits before section reveal, typing or choices', async () => {
  const f = exploration();
  const promise = vm.runInContext('playExplorationPresentation(2, 3, ["甲乙。", "丙丁。"])', f.context);
  await f.advance(2599);
  assert.equal(f.elements.views.route.classList.contains('view-gated-hidden'), true);
  assert.equal(f.elements.routeAtmosphereText.textContent, '');
  assert.equal(f.elements.routeOptionsGrid.classList.contains('hidden'), true);
  await f.advance(1);
  assert.equal(f.elements.floorIntroOverlay.classList.contains('hidden'), true);
  assert.equal(f.elements.views.route.classList.contains('view-gated-hidden'), false);
  await f.advance(1066);
  assert.equal(f.elements.routeAtmosphereText.textContent, '');
  await f.advance(1);
  assert.equal(f.elements.routeAtmosphereText.textContent, '甲');
  assert.equal(f.elements.routeOptionsGrid.classList.contains('hidden'), true);
  assert.equal(f.bonus.classList.contains('hidden'),true);
  assert.equal(f.emissions.length, 0);
  await f.advance(10000);
  await promise;
  assert.deepEqual(f.emissions.map(e => e.name), ['route:interaction_ready']);
  assert.equal(f.elements.routeTimerBar.classList.contains('hidden'), false);
  assert.equal(f.bonus.classList.contains('hidden'),false);
  assert.equal(f.app.inert, false);
  assert.equal(f.manager.isBlocking, false);
  assert.equal(f.errors.length, 0);
});

test('narrative hold and last staggered choice finish before ACK', async () => {
  const f = exploration();
  const promise = vm.runInContext('playExplorationPresentation(2, 1, ["甲"])', f.context);
  await f.advance(4766);
  assert.equal(f.elements.routeStatusText.classList.contains('hidden'), true);
  await f.advance(1);
  assert.equal(f.elements.routeStatusText.classList.contains('hidden'), false);
  assert.equal(f.elements.routeOptionsGrid.classList.contains('hidden'), true);
  await f.advance(250);
  assert.equal(f.elements.routeOptionsGrid.classList.contains('hidden'), false);
  await f.advance(619);
  assert.equal(f.emissions.length, 0);
  assert.equal(f.app.inert, true);
  await f.advance(1);
  await promise;
  assert.equal(f.emissions.length, 1);
  assert.equal(f.tasks.size, 0);
});

test('abort hides old choices and cannot unlock the next presentation owner', async () => {
  const f = exploration();
  const promise = vm.runInContext('playExplorationPresentation(2, 1, ["甲乙。"])', f.context);
  await f.advance(3700);
  vm.runInContext('routePresentationController.abort(); presentationManager.setBlocking(true);', f.context);
  await promise;
  assert.equal(f.manager.isBlocking, true);
  assert.equal(f.elements.views.route.classList.contains('view-gated-hidden'), true);
  assert.equal(f.elements.routeAtmosphereText.textContent, '');
  assert.equal(f.emissions.length, 0);
  assert.equal(f.tasks.size, 0);
  assert.equal(f.errors.length, 0);
});

test('floor subtitle plays walking only, with no previous banner sound',async()=>{
 const f=exploration();
 const promise=vm.runInContext('playExplorationPresentation(2,3,["甲。"])',f.context);
 await f.advance(10000);await promise;
 assert(f.sounds.some(x=>x.type==='walk'||x.name==='walk'||x.key==='walk'||x==='walk'));
 assert(!f.sounds.some(x=>x.type==='banner'||x.name==='banner'||x.key==='banner'||x==='banner'));
});
