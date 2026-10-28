import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';

function harness() {
  const nodes = new Map(), calls = [], handlers = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', children: [], disabled: false, style: {}, classList: { contains: () => false },
      replaceChildren() { this.children = []; }, appendChild(e) { this.children.push(e); }, addEventListener(event, cb) { this[event] = cb; } });
    return nodes.get(id);
  };
  const scope = { window: {}, document: { getElementById: node, createElement: () => node(Symbol()) },
    classesData: { warrior: { name: '戰士' }, bard: { name: '吟遊詩人' } },
    PlayerIdentity: { player: { playerId: 'player' } },
    socket: { connected: true, on: (event, cb) => handlers[event] = cb, timeout: () => ({ emit: (...args) => calls.push(args) }) } };
  vm.createContext(scope); vm.runInContext(readFileSync(new URL('../public/js/core/career.js', import.meta.url), 'utf8'), scope);
  return { scope, node, calls, handlers };
}
test('profile career renders server statistics and class counts without storing client totals', async () => {
  const h = harness(), loading = h.scope.window.CareerProfile.load();
  assert.equal(h.calls[0][0], 'player:career'); assert.equal(Object.keys(h.calls[0][1]).length, 0);
  h.calls[0][2](null, { success: true, durable: true, stats: { adventures: 2, battles: 3, damage: 1234, healing: 5, mostPlayedRole: 'warrior', classes: { warrior: 3 } } });
  await loading;
  assert.equal(h.node('careerTotals').children.length, 8);
  assert.equal(h.node('careerTotals').children[5].children[1].textContent, '戰士');
  assert.equal(h.node('careerTotals').children[6].children[1].textContent, '1,234');
  assert.equal(h.node('careerClasses').children[0].textContent, '戰士：3 場');
});
test('account switches discard stale career responses and clear the previous account records', async () => {
  const h = harness(), old = h.scope.window.CareerProfile.load();
  h.scope.PlayerIdentity.player = { playerId: 'new-player' }; h.handlers['player:identity']();
  h.calls[0][2](null, { success: true, stats: { damage: 99999 } }); await old;
  assert.equal(h.node('careerTotals').children.length, 0);
  h.calls[1][2](null, { success: true, stats: {} }); await setImmediate();
  assert.equal(h.node('careerTotals').children[6].children[1].textContent, '0');
});
test('failed requests stay distinct from zero statistics and permit retry', async () => {
  const h = harness(), pending = h.scope.window.CareerProfile.load();
  h.calls[0][2](new Error('offline')); await pending;
  assert.match(h.node('careerStatus').textContent, /逾時/); assert.equal(h.node('careerTotals').children.length, 0);
  assert.equal(h.node('btnRefreshCareer').disabled, false);
});
