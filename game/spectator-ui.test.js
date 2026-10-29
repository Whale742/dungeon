import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';

function harness() {
  const nodes = new Map(), handlers = {}, calls = [], rendered = [], played = [], releases = [];
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, { classList: { add() {}, remove() {}, toggle() {} }, append() {}, appendChild() {},
      addEventListener(event, cb) { this[event] = cb; }, value: '', textContent: '' });
    return nodes.get(key);
  };
  const state = { code: 'WATCH', stateVersion: 1, battleRound: 1, viewer: { spectator: true } };
  const scope = { window: {}, document: { body: node('body'), createElement: () => node(Symbol()), getElementById: node, querySelector: () => null, addEventListener() {} },
    socket: { on: (event, cb) => handlers[event] = cb, emit: (...args) => calls.push(args), timeout() { return this; } },
    roomState: state, console, receiveRoomState(s) { rendered.push(s.stateVersion); scope.roomState = s; },
    runPresentationQueue(queue, round, killed, id) { played.push(id); return new Promise(resolve => releases.push(resolve)); } };
  vm.createContext(scope); vm.runInContext(readFileSync(new URL('../public/js/core/spectators.js', import.meta.url), 'utf8'), scope);
  scope.window.SpectatorView.sync(state);
  return { view: scope.window.SpectatorView, scope, node, handlers, calls, rendered, played, releases };
}
test('observer queues preserve playback order while future authoritative states wait behind their own boundary', async () => {
  const h = harness(), packet = (id, version) => ({ queue: [{}], round: id, presentationId: id, spectatorState: { stateVersion: version, battleRound: id } });
  h.view.queue(packet(1, 2));
  assert.equal(h.view.receiveState({ stateVersion: 3 }), true);
  h.view.queue(packet(2, 4));
  assert.equal(h.view.receiveState({ stateVersion: 5 }), true);
  assert.deepEqual(h.rendered, [2]); assert.deepEqual(h.played, [1]);
  h.releases.shift()(); await setImmediate();
  assert.deepEqual(h.rendered, [2, 3, 4]); assert.deepEqual(h.played, [1, 2]);
  h.releases.shift()(); await setImmediate();
  assert.deepEqual(h.rendered, [2, 3, 4, 5]);
  assert.equal(h.calls.length, 0); // No player ACK or authoritative mutation.
});
test('slow observer buffers are bounded and recover with an authoritative resync', async () => {
  const h = harness(); h.view.queue({ queue: [{}], round: 1, presentationId: 1 });
  for (let i = 0; i < 1000; i++) h.view.receiveState({ stateVersion: i });
  h.releases.shift()(); await setImmediate();
  assert.ok(h.rendered.length <= 128);
  assert.equal(h.calls.filter(c => c[0] === 'room:resync').length, 1);
  assert.equal(h.view.canSend('battle:presentation_complete'), false);
  assert.equal(h.view.canSend('battle:lock'), false);
});
test('observer ignores prior, duplicate and other-room queue packets after joining a mid-battle snapshot', async () => {
  const h = harness(); h.view.sync({ code: 'WATCH', battlePresentationId: 7, viewer: { spectator: true } });
  for (const id of [6, 7]) h.view.queue({ queue: [{}], presentationId: id });
  h.view.queue({ queue: [{}], presentationId: 8, spectatorState: { code: 'OTHER' } });
  assert.deepEqual(h.played, []);
  h.view.queue({ queue: [{}], presentationId: 8 }); h.view.queue({ queue: [{}], presentationId: 8 });
  assert.deepEqual(h.played, [8]); h.releases.shift()(); await setImmediate();
});
