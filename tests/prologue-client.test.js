import test from 'node:test';
import assert from 'node:assert/strict';
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
  await f.advance(8000);
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
