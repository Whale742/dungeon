import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const waitSource = source.slice(source.indexOf('function isRoundStartPresentationState('), source.indexOf('async function runPresentationQueue('));
function fixture() {
  const listeners = new Set();
  const context = { roomState: { state: 'LOBBY' }, pendingAuthoritativeState: null, DOMException, Promise,
    socket: { on: (_,fn) => listeners.add(fn), off: (_,fn) => listeners.delete(fn) } };
  vm.createContext(context); vm.runInContext(waitSource, context);
  return { context, listeners, update: state => [...listeners].forEach(fn => fn(state)) };
}
test('initial status queue waits for matching battle state before starting the encounter', async () => {
  const f = fixture(); let resolved = false;
  const promise = f.context.waitForBattleRoundState(1).then(state => { resolved = true; return state; });
  f.update({ state: 'LOBBY' });
  f.update({ state: 'IN_BATTLE', battleRound: 2, currentMonster: {} });
  await Promise.resolve(); assert.equal(resolved, false);
  const state = { state: 'IN_BATTLE', battleRound: 1, currentMonster: {name:'Boss'} };
  f.update(state); assert.equal(await promise, state); assert.equal(f.listeners.size, 0);
});
test('a later round cannot borrow the previous round state', async () => {
  const f = fixture(); f.context.roomState = {state:'IN_BATTLE',battleRound:1,currentMonster:{}};
  const promise = f.context.waitForBattleRoundState(2);
  assert.equal(f.listeners.size, 1);
  const state = {state:'IN_BATTLE',battleRound:2,currentMonster:{}};
  f.update(state); assert.equal(await promise, state); assert.equal(f.listeners.size, 0);
});
test('buffered matching state resolves immediately without another event', async () => {
  const f = fixture(); const state = {state:'IN_BATTLE',battleRound:1,currentMonster:{}};
  f.context.pendingAuthoritativeState = state;
  assert.equal(await f.context.waitForBattleRoundState(1), state); assert.equal(f.listeners.size, 0);
});
test('a TRANSITION update does not count as an authoritative battle state', async () => {
  const f = fixture();
  const promise = f.context.waitForBattleRoundState(1);
  f.update({state:'TRANSITION',battleRound:1,selectionState:'SELECTING',currentMonster:{}});
  assert.equal(f.listeners.size, 1);
  f.update({state:'TRANSITION',battleRound:1,selectionState:'RESOLVING',currentMonster:{}});
  assert.equal(f.listeners.size, 1);
  const state = {state:'IN_BATTLE',battleRound:1,selectionState:'RESOLVING',currentMonster:{}};
  f.update(state); assert.equal(await promise,state); assert.equal(f.listeners.size,0);
});
test('leaving during the state wait releases the socket listener', async () => {
  const f = fixture(); const controller = new AbortController();
  const promise = f.context.waitForBattleRoundState(1,controller.signal);
  controller.abort(); await assert.rejects(promise,{name:'AbortError'}); assert.equal(f.listeners.size, 0);
});
