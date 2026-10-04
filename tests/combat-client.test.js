import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './client-fixture.js';

function setup() {
  const f = fixture();
  const stage = f.context.document.createElement('div');
  const create = f.context.document.createElement;
  f.context.document.createElement = (...args) => {
    const element = create(...args);
    element.remove = () => { stage.children = stage.children.filter(child => child !== element); };
    return element;
  };
  f.context.getOrCreateCombatStage = () => stage;
  f.context.escapeHtml = text => String(text);
  for (const file of ['presentation-core.js', 'combat-expansion.js', 'victory.js'])
    vm.runInContext(fs.readFileSync(new URL('../public/' + file, import.meta.url), 'utf8'), f.context);
  return { ...f, stage };
}
test('support canvas releases its DOM on failure without swallowing the error', async () => {
  const f = setup();
  await assert.rejects(vm.runInContext("withCombatCanvas({}, 'HEAL', async () => { throw new Error('failed'); })", f.context), /failed/);
  assert.equal(f.stage.children.length, 0);
});
test('abort during a support wait removes canvas and cancels its pending timer', async () => {
  const f = setup(); f.context.cancel = new AbortController();
  const promise = vm.runInContext("withCombatCanvas({ signal: cancel.signal }, 'HEAL', () => waitForPresentation(1000, cancel.signal))", f.context);
  const rejected = assert.rejects(promise, { name: 'AbortError' });
  assert.equal(f.stage.children.length, 1); f.context.cancel.abort(); await rejected;
  assert.equal(f.stage.children.length, 0); assert.equal(f.tasks.size, 0);
});
test('victory abort removes the stage, restores inert/blocking, and never emits readiness or continue', async () => {
  const f = setup(); f.context.cancel = new AbortController();
  const promise = vm.runInContext("playVictoryPresentation({}, { controller: cancel, onReady: () => socket.emit('ready'), onContinue: () => socket.emit('continue') })", f.context);
  const rejected = assert.rejects(promise, { name: 'AbortError' });
  assert.equal(f.app.inert, true); assert.equal(f.manager.isBlocking, true);
  await f.advance(100); f.context.cancel.abort(); await rejected;
  assert.equal(f.stage.children.length, 0); assert.equal(f.app.inert, false); assert.equal(f.manager.isBlocking, false);
  assert.equal(f.stage.classList.contains('is-active'), false); assert.equal(f.emissions.length, 0); assert.equal(f.tasks.size, 0);
});
