import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './client-fixture.js';

function trap() {
  const f = fixture();
  const snapshot = (a, b) => ({ players: [{ id: 'a', hp: a, maxHp: 100 }, { id: 'b', hp: b, maxHp: 100 }] });
  f.context.roomState = {
    state: 'EVENT', players: [{ id: 'a', hp: 85 }, { id: 'b', hp: 0 }],
    currentEvent: { type: 'trap', presentationId: 7, story: '甲', hpBefore: snapshot(100, 5),
      hpAfter: snapshot(85, 0), hits: [
        { targetId: 'a', role: 'warrior', damage: 15, dodged: false, hpSnapshot: snapshot(85, 5) },
        { targetId: 'b', role: 'archer', damage: 15, dodged: false, hpSnapshot: snapshot(85, 0) }
      ] }
  };
  vm.runInContext(fs.readFileSync(new URL('../public/trap.js', import.meta.url), 'utf8'), f.context);
  vm.runInContext('roomState = projectTrapDisplayState(roomState)', f.context);
  return f;
}

test('story holds and exits before trap; damage follows impact by 75ms with 150ms target stagger', async () => {
  const f = trap();
  const promise = vm.runInContext('playTrapPresentation(roomState.currentEvent)', f.context);
  await f.advance(1031);
  assert.equal(f.elements.trapDiscoveryStory.textContent, '');
  assert.equal(f.context.roomState.players[0].hp, 100);
  await f.advance(1046); // 45ms first character + 1000ms suspense hold after both RAFs
  assert.equal(f.elements.trapDiscoverySection.classList.contains('exit'), true);
  assert.equal(f.elements.trapPresentationOverlay.classList.contains('hidden'), true);
  await f.advance(500);
  assert.equal(f.elements.trapDiscoverySection.classList.contains('hidden'), true);
  assert.equal(f.elements.trapVictimsContainer.children.length, 2); // includes fatal archer
  const cards = f.elements.trapVictimsContainer.children;
  await f.advance(500); // stage entry 300 + anticipation 200
  assert.equal(cards[0].classList.contains('is-hit'), true);
  assert.equal(cards[0].classList.contains('has-result'), false);
  assert.equal(f.context.roomState.players[0].hp, 100);
  await f.advance(74);
  assert.equal(f.context.roomState.players[0].hp, 100);
  await f.advance(1);
  assert.equal(f.context.roomState.players[0].hp, 85);
  assert.equal(f.context.roomState.players[1].hp, 5);
  // A chat/pause authoritative refresh must retain the displayed impact snapshot.
  vm.runInContext('roomState = projectTrapDisplayState({...roomState, players: [{id:"a", hp:85}, {id:"b", hp:0}]})', f.context);
  assert.equal(f.context.roomState.players[1].hp, 5);
  await f.advance(150);
  assert.equal(f.context.roomState.players[1].hp, 0);
  assert.equal(cards[1].classList.contains('is-hit'), true);
  await f.advance(1849); // number 700 + hold 650 + exit 500
  assert.equal(f.emissions.length, 0);
  await f.advance(1);
  await promise;
  assert.equal(f.emissions[0].name, 'trap:presentation_complete');
  assert.equal(f.app.inert, false);
  assert.equal(f.manager.isBlocking, false);
  assert.equal(f.tasks.size, 0);
  assert.equal(f.errors.length, 0);
  assert.deepEqual(f.sounds.map(s => s.name), ['trap_trigger', 'trap_impact', 'trap_impact']);
  assert.equal(f.sounds[2].at - f.sounds[1].at, 150);
});

test('abort during concurrent impacts cancels every task without a false ACK or unlocking new owner', async () => {
  const f = trap();
  const promise = vm.runInContext('playTrapPresentation(roomState.currentEvent)', f.context);
  await f.advance(3200);
  vm.runInContext('trapPresentationController.abort(); presentationManager.setBlocking(true)', f.context);
  await f.advance(10000);
  await promise;
  assert.equal(f.manager.isBlocking, true);
  assert.equal(f.elements.trapPresentationOverlay.classList.contains('hidden'), true);
  assert.equal(f.elements.trapDiscoveryStory.textContent, '');
  assert.equal(f.elements.trapVictimsContainer.children.length, 0);
  assert.equal(f.emissions.length, 0);
  assert.equal(f.tasks.size, 0);
  assert.equal(f.errors.length, 0);
});

test('dodge uses authoritative hit result and leaves HP unchanged', async () => {
  const f = trap();
  vm.runInContext('roomState.currentEvent.hits[1].dodged = true; roomState.currentEvent.hits[1].damage = 0; roomState.currentEvent.hits[1].hpSnapshot.players[1].hp = 5; roomState.currentEvent.hpAfter.players[1].hp = 5', f.context);
  const promise = vm.runInContext('playTrapPresentation(roomState.currentEvent)', f.context);
  await f.advance(3302);
  const card = f.elements.trapVictimsContainer.children[1];
  assert.equal(card.classList.contains('is-dodging'), true);
  assert.equal(card.classList.contains('is-hit'), false);
  assert.equal(card.children[0].children[1].textContent, '閃避！');
  assert.equal(f.context.roomState.players[1].hp, 5);
  await f.advance(5000);
  await promise;
  assert.equal(f.emissions.length, 1);
  assert.deepEqual(f.sounds.map(s => s.name), ['trap_trigger', 'trap_impact']);
});
