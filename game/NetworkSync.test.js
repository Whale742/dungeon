import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Room } from './Room.js';
import { handleOperation, operationContext, metrics } from './performance.js';

const scope = { setTimeout, clearTimeout, performance };
vm.runInNewContext(readFileSync(new URL('../public/js/shared/operations.js', import.meta.url), 'utf8'), scope);
const Operations = scope.GameOperations;
function fixture(n = 2) {
  const events = [];
  const socket = i => ({ id: `p${i}`, join() {}, data: {} });
  const sockets = Array.from({ length: n }, (_, i) => socket(i));
  const room = new Room('SYNC', sockets[0], 'p0', { to: () => ({ emit: (event, data) => events.push({ event, data }) }) });
  sockets.slice(1).forEach(s => room.addPlayer(s, s.id));
  room.state = 'IN_BATTLE'; room.isWaitingForSelectionReady = true;
  events.length = 0;
  return { room, sockets, events };
}
function clock() {
  let now = 0, id = 0; const jobs = new Map();
  return { now: () => now, schedule(fn, ms) { jobs.set(++id, { fn, at: now + ms }); return id; }, cancel(id) { jobs.delete(id); },
    tick(ms) { const end = now + ms; for (;;) { const next = [...jobs].filter(([,v]) => v.at <= end).sort((a,b) => a[1].at-b[1].at)[0]; if (!next) break; now = next[1].at; jobs.delete(next[0]); next[1].fn(); } now = end; }, jobs };
}
test('600 ms simulated RTT: immediate feedback, deduplication, confirmation, cancellation and stale ACK isolation', () => {
  const { room, sockets } = fixture(); const time = clock(); const statuses = [], samples = [];
  let context = operationContext(room, 'battle:lock');
  const ops = new Operations({ ...time, context: () => context, changed: op => statuses.push(op?.status || 'pending'), report: (k,v) => samples.push([k,v]),
    send(event, data, ack) { time.schedule(() => { const res = handleOperation(room, sockets[0], event, data, () => room.lockAction('p0', data.actionId)); time.schedule(() => ack(res), 300); }, 300); } });
  assert.equal(ops.start('lock', 'battle:lock', { actionId: 'skip' }), true);
  assert.equal(statuses[0], 'pending'); assert.equal(room.players.p0.isLocked, false);
  assert.equal(ops.start('lock', 'battle:lock', { actionId: 'skip' }), false);
  time.tick(300); assert.equal(room.players.p0.isLocked, true);
  time.tick(300); assert.equal(ops.active.get('lock').status, 'confirmed');
  assert.equal(samples.find(([k]) => k === 'operation.rtt.ms')[1], 600);
  assert.equal(samples.find(([k]) => k === 'operation.feedback.ms')[1], 0);
  ops.reconcile(room.stateVersion); assert.equal(ops.active.size, 0);
  assert.equal(room.unlockAction('p0').success, true);
  ops.start('lock', 'battle:lock', { actionId: 'invalid' }); time.tick(600);
  assert.equal(statuses.at(-1), 'rejected'); assert.equal(ops.active.size, 0);
  ops.start('lock', 'battle:lock', { actionId: 'skip' });
  room.battleRound++; context = operationContext(room, 'battle:lock'); ops.reconcile(room.stateVersion);
  assert.equal(statuses.at(-1), 'expired');
  ops.start('lock', 'battle:lock', { actionId: 'skip' }); time.tick(600);
  assert.equal(ops.active.get('lock').status, 'confirmed');
  ops.clear(); assert.equal(time.jobs.size, 0);
});

test('timeout/disconnect clear previews and delayed callbacks cannot revive an operation', () => {
  const time = clock(); let ack; const states = [];
  const ops = new Operations({ ...time, timeout: 100, context: () => 'shop', changed: op => states.push(op?.status), report() {}, send(_event, _data, callback) { ack = callback; } });
  ops.start('item', 'shop', {}, { name: 'preview' }); const old = ops.active.get('item');
  time.tick(100); assert.equal(states.at(-1), 'expired'); assert.equal(ops.active.size, 0);
  ack({ requestId: old.requestId, success: true, version: 1 }); assert.equal(ops.active.size, 0);
  ops.start('item', 'shop', {}, {}); ops.clear(); assert.equal(ops.active.size, 0); assert.equal(time.jobs.size, 0);
});

test('delayed competing shop previews never mutate gold or inventory and reconcile to automatic slots', () => {
  const { room, sockets } = fixture(); const time = clock();
  room.state = 'EVENT'; room.currentEvent = { type: 'shop', items: [{ id: 'one', name: 'One', price: 10 }] };
  room.gold = 30; room.squadInventory = [null, { id: 'existing' }];
  const states = [[], []];
  const clients = sockets.map((socket, i) => new Operations({ ...time,
    context: () => operationContext(room, 'event:shop_action'), changed: op => states[i].push(op?.status || 'pending'), report() {},
    send(event, data, ack) { time.schedule(() => {
      const result = handleOperation(room, socket, event, data, () => room.handleShopAction(socket.id, data.action, data));
      time.schedule(() => ack(result), 300);
    }, 300); }
  }));
  clients.forEach((ops, i) => ops.start('same', 'event:shop_action', { action: 'buy', itemIndex: 0 }, { name: 'One', index: i ? 17 : 8 }));
  assert.equal(room.gold, 30); assert.equal(room.squadInventory[0], null);
  assert.equal(clients[0].active.get('same').preview.index, 8);
  time.tick(600);
  assert.equal(room.gold, 20); assert.equal(room.squadInventory[0].id, 'one');
  assert.equal(clients[0].active.get('same').result.placement.index, 0);
  assert.equal(states[1].at(-1), 'rejected');
  clients.forEach(ops => ops.reconcile(room.stateVersion));
  assert.equal(clients[0].active.size, 0); assert.equal(clients[1].active.size, 0);
  assert.equal(time.jobs.size, 0);
});

test('shop races, funds, full bag, idempotent retries, stale shop and actual automatic placement', () => {
  const { room, sockets } = fixture();
  room.state = 'EVENT'; room.currentEvent = { type: 'shop', col: 2, items: [{ id: 'test', name: 'Test', price: 10 }] }; room.gold = 20;
  room.squadInventory = [null, { id: 'occupied' }];
  const payload = { requestId: 'buy:1', sequence: 1, context: operationContext(room, 'event:shop_action'), action: 'buy', itemIndex: 0, index: 17 };
  const buy = (s, p = payload) => handleOperation(room, s, 'event:shop_action', p, () => room.handleShopAction(s.id, p.action, p));
  const result = buy(sockets[0]); assert.equal(result.success, true); assert.equal(result.placement.index, 0);
  assert.equal(room.gold, 10); assert.equal(buy(sockets[1]).success, false);
  assert.equal(buy(sockets[0]), result); assert.equal(room.gold, 10);
  room.currentEvent = { type: 'shop', col: 2, items: [{ id: 'test', name: 'Test', price: 20 }] };
  assert.equal(buy(sockets[0], { ...payload, requestId: 'stale', sequence: 2 }).success, false);
  assert.equal(room.handleShopAction('p0', 'buy', { itemIndex: 0 }).success, false);
  room.gold = 100; room.squadInventory = Array.from({length:19}, () => ({id:'full'}));
  assert.equal(room.handleShopAction('p0', 'buy', { itemIndex: 0 }).success, false); assert.equal(room.gold, 100);
  room.squadInventory[6] = null;
  assert.equal(room.handleShopAction('p0', 'buy', { itemIndex: 0, index: 18 }).placement.index, 6);
  for (let sequence = 3; sequence < 70; sequence++) buy(sockets[0], { ...payload, sequence, requestId: String(sequence) });
  assert.equal(buy(sockets[0]).success, false); // evicted request cannot execute again
});

test('ten-player final lock emits one versioned snapshot and retains the resolution delay', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, events } = fixture(10); room.isWaitingForSelectionReady = false;
  for (let i = 0; i < 9; i++) assert.equal(room.lockAction(`p${i}`, 'skip').success, true);
  assert.equal(room.selectionState, 'SELECTING');
  assert.equal(room.unlockAction('p0').success, true); room.lockAction('p0', 'skip');
  events.length = 0;
  let resolved = false; room.resolveTurnActions = () => { resolved = true; };
  room.lockAction('p9', 'skip');
  assert.equal(events.filter(e => e.event === 'room:update').length, 1);
  const state = events[0].data;
  assert.equal(state.players.length, 10); assert.equal(state.selectionState, 'RESOLVING');
  assert.equal(room.unlockAction('p9').success, false);
  assert.equal(resolved, false); t.mock.timers.tick(299); assert.equal(resolved, false); t.mock.timers.tick(1); assert.equal(resolved, true);
  assert.ok(state.stateVersion > 0);
});

test('opt-in metrics keep processing, building and payload measurements separate', () => {
  const { room, sockets } = fixture(); metrics.enabled = true; metrics.values.clear();
  try {
    const res = handleOperation(room, sockets[0], 'battle:lock', {}, () => room.lockAction('p0', 'skip'));
    assert.ok(res.processingMs >= 0);
    const snapshot = metrics.snapshot();
    for (const key of ['battle:lock.ms', 'state.build.ms', 'state.bytes', 'state.broadcasts']) assert.ok(snapshot[key].count > 0);
  } finally { metrics.enabled = false; metrics.values.clear(); }
});
