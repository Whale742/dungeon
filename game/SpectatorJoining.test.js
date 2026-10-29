import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { Spectators } from './Spectators.js';
import { AdventurePersistence } from './AdventurePersistence.js';
import { MemoryAdventureStore, LEASE_MS } from './AdventureStore.js';
import { CareerStats } from './CareerStats.js';
import { MemoryCareerStore } from './CareerStore.js';
import { disconnectPlayer } from './player-connection.js';

const io = { to: () => ({ emit() {} }) };
function fixture(t, { count = 1, timeoutMs = 60000, store = new MemoryAdventureStore() } = {}) {
  const socket = id => ({ id, join() {}, leave() {}, emit() {}, data: { identity: { display_name: id } } });
  const leader = socket('leader'), observer = socket('observer');
  const room = new Room('JOINS', leader, 'Leader', io);
  room.selectRole(leader.id, 'warrior');
  for (let i = 1; i < count; i++) { const s = socket('p' + i); room.addPlayer(s, s.id); }
  const persistence = new AdventurePersistence(store);
  room.persistence = persistence; persistence.begin(room); room.state = 'IN_BATTLE';
  const promoted = [];
  room.spectators = new Spectators(room, io, 5, { timeoutMs, onPromote: s => promoted.push(s.id) });
  room.spectators.join(observer);
  t.after(() => { room.spectators.close(); room.clearTimer(); persistence.close(); });
  const apply = () => room.spectators.apply(observer.id);
  const approve = () => {
    const result = apply(); assert.equal(result.success, true);
    assert.equal(room.spectators.review(leader.id, { playerId: observer.id, requestId: result.requestId, approve: true }).success, true);
    return result.requestId;
  };
  const choose = requestId => room.spectators.selectRole(observer.id, { requestId, checkpoint: room.routePresentationId, role: 'mage' });
  return { room, persistence, store, leader, observer, socket, promoted, apply, approve, choose };
}

test('application is spectator-only, unique, leader-reviewed and approval grants no gameplay membership', t => {
  const h = fixture(t), s = h.room.spectators;
  assert.equal(s.apply('outsider').success, false);
  const request = h.apply(); assert.equal(request.success, true); assert.equal(h.apply().success, false);
  const review = { playerId: h.observer.id, requestId: request.requestId, approve: true };
  assert.equal(s.review('outsider', review).success, false);
  assert.equal(s.review(h.leader.id, { ...review, requestId: 'old' }).success, false);
  assert.equal(s.review(h.leader.id, review).success, true);
  assert.equal(s.review(h.leader.id, review).success, false);
  assert.equal(s.requests.get(h.observer.id).status, 'approved_pending_checkpoint');
  assert.equal(h.room.players[h.observer.id], undefined);
  assert.equal(h.room.voteRoute(h.observer.id, 'x').success, false);
  assert.equal(h.choose(request.requestId).success, false);
});

test('full formal party, lobby, terminal and Dev rooms reject applications', t => {
  const full = fixture(t, { count: 10 }); assert.equal(full.apply().success, false);
  const h = fixture(t);
  for (const state of ['LOBBY', 'GAME_OVER', 'VICTORY']) { h.room.state = state; assert.equal(h.apply().success, false); }
  h.room.state = 'IN_BATTLE'; h.room.isDev = true; assert.equal(h.apply().success, false);
});

test('rejection, applicant cancellation and disconnect free reservations without a character', t => {
  const h = fixture(t), s = h.room.spectators;
  let requestId = h.apply().requestId;
  assert.equal(s.review(h.leader.id, { playerId: h.observer.id, requestId, approve: false }).success, true);
  requestId = h.approve(); assert.equal(s.cancel(h.observer.id, 'stale').success, false);
  assert.equal(s.cancel(h.observer.id, requestId).success, true);
  h.approve(); s.leave(h.observer.id); assert.equal(s.requests.size, 0);
  s.join(h.observer); assert.equal(h.apply().success, true);
});

test('checkpoint admission preserves veteran equipment, waits for save, restores new member, votes and subsequent combat statistics', async t => {
  let time = Date.now(); const store = new MemoryAdventureStore({ now: () => time });
  const h = fixture(t, { store });
  const careers = new MemoryCareerStore(), career = new CareerStats(careers); t.after(() => career.close());
  career.attach(h.room);
  h.room.career.encounter(h.room);
  const requestId = h.approve();
  const veteran = h.room.players.leader;
  veteran.bag = [{ id: 'kept', instanceId: 'private-kept' }];
  veteran.equips = [{ id: 'kept', instanceId: 'equipped-kept' }];
  veteran.equipSlots.WEAPON = veteran.equips[0];
  const equipment = structuredClone({ bag: veteran.bag, equips: veteran.equips, slots: veteran.equipSlots });
  h.room.players.leader.connected = false; // Offline teammates never enter the join barrier.
  h.room.startRouteSelection();
  assert.equal(h.room.spectators.waiting, true); assert.equal(store.rows.size, 0);
  assert.equal(h.room.voteRoute('leader', h.room.currentRoutes[0].id).success, false);
  assert.equal(h.room.spectators.selectRole('observer', { requestId, checkpoint: -1, role: 'mage' }).success, false);
  assert.equal(h.room.spectators.selectRole('observer', { requestId, checkpoint: h.room.routePresentationId, role: 'warrior' }).success, false);
  assert.equal(h.choose(requestId).success, true);
  assert.equal(h.room.spectators.members.has('observer'), true);
  assert.equal(h.room.players.observer.connected, false);
  await h.persistence.saveBoundary(h.room);
  assert.deepEqual(h.promoted, ['observer']); assert.equal(h.room.spectators.members.has('observer'), false);
  assert.equal(h.room.players.observer.connected, true);
  assert.equal(h.choose(requestId).success, false); assert.equal(h.room.memberIds.filter(id => id === 'observer').length, 1);
  assert.deepEqual({ bag: veteran.bag, equips: veteran.equips, slots: veteran.equipSlots }, equipment);
  const row = store.rows.get(h.room.adventureId);
  assert.equal(row.checkpoint.data.players.observer.role, 'mage'); assert.equal(row.members.includes('observer'), true);
  assert.equal(row.checkpoint.data.stageRoster.count, 1);
  assert.deepEqual(row.checkpoint.data.stageRoster.playerIds, ['observer']);
  h.room.handleRouteNarrativeDone('observer', h.room.routePresentationId);
  assert.equal(h.room.isNarrating, false);
  // Reuse normal vote validation, then explicitly start a battle for an unambiguous encounter.
  assert.equal(h.room.voteRoute('observer', h.room.currentRoutes[0].id).success, true);
  h.room.handleBattleEvent(null, false, { col: 1 });
  await career.flush(h.room);
  const stats = await career.read('observer'); assert.equal(stats.stats.battles, 1);
  h.persistence.close(); time += LEASE_MS + 1;
  const next = new AdventurePersistence(store, { now: () => time }); t.after(() => next.close());
  const restored = await next.restore(h.room.adventureId, 'observer', { Room, code: () => 'AFTER', io });
  t.after(() => restored.clearTimer());
  assert.equal(restored.players.observer.role, 'mage'); assert.equal(restored.memberIds.length, 2);
});

test('join checkpoint failure retains spectator permissions and retry promotes exactly once', async t => {
  const memory = new MemoryAdventureStore(); let fail = true;
  const store = { durable: false, call: (...args) => {
    if (args[0] === 'save' && fail) return Promise.reject(new Error('isolated outage'));
    return memory.call(...args);
  } };
  const h = fixture(t, { store }), id = h.approve(); h.room.startRouteSelection(); h.choose(id);
  await h.persistence.saveBoundary(h.room);
  assert.equal(h.room.checkpoint.status, 'failed'); assert.equal(h.room.spectators.members.has('observer'), true);
  assert.equal(h.room.players.observer.connected, false); assert.deepEqual(h.promoted, []);
  fail = false; assert.equal((await h.persistence.retry(h.room, 'leader')).success, true);
  assert.deepEqual(h.promoted, ['observer']); assert.equal(memory.rows.size, 1);
  h.room.spectators.checkpointSaved(); assert.deepEqual(h.promoted, ['observer']);
});

for (const action of ['cancel', 'disconnect', 'timeout']) test(`${action} during class selection unblocks the boundary`, async t => {
  const h = fixture(t), id = h.approve(); h.room.startRouteSelection();
  if (action === 'cancel') h.room.spectators.cancel('observer', id);
  else if (action === 'disconnect') h.room.spectators.leave('observer');
  else h.room.spectators.expire();
  await h.persistence.saveBoundary(h.room);
  assert.equal(h.room.checkpoint.status, 'saved'); assert.equal(h.room.spectators.waiting, false);
  assert.equal(h.room.players.observer, undefined);
  h.room.handleRouteNarrativeDone('leader', h.room.routePresentationId); assert.equal(h.room.isNarrating, false);
});

test('leader disconnect cannot prevent an approved applicant choosing; termination clears all applications', async t => {
  const h = fixture(t), id = h.approve(); h.room.startRouteSelection(); h.room.players.leader.connected = false;
  assert.equal(h.choose(id).success, true); await h.persistence.saveBoundary(h.room);
  h.room.players.leader.connected = true;
  const other = h.socket('other'); h.room.spectators.join(other); h.room.spectators.apply(other.id);
  h.room.endBattle('leader'); await h.persistence.finish(h.room);
  assert.equal(h.room.spectators.requests.size, 0); assert.equal(h.room.spectators.members.size, 0);
  assert.equal(h.store.rows.get(h.room.adventureId).checkpoint, null);
});

test('all-offline suspension drops live mutations and releases lease for last successful checkpoint', async t => {
  const h = fixture(t); h.room.startRouteSelection(); await h.persistence.saveBoundary(h.room);
  const gold = h.room.gold; h.room.gold = gold + 999;
  h.room.players.leader.connected = false;
  await h.persistence.suspend(h.room);
  assert.equal(h.persistence.hasLostAuthority(h.room), true);
  const restored = await h.persistence.restore(h.room.adventureId, 'leader', { Room, code: () => 'BACK1', io });
  t.after(() => restored.clearTimer()); assert.equal(restored.gold, gold); assert.notEqual(restored, h.room);
});

test('termination can retry after lease expiry if ownership has not changed', async t => {
  let time = Date.now(); const store = new MemoryAdventureStore({ now: () => time });
  const h = fixture(t, { store }); h.room.startRouteSelection(); await h.persistence.saveBoundary(h.room);
  time += LEASE_MS + 1;
  h.room.handleGameOver(); assert.equal(await h.persistence.finish(h.room), true);
  assert.equal(store.rows.get(h.room.adventureId).checkpoint, null);
});

test('last veteran disconnecting during admission does not retire the newly committed connected member', async t => {
  const memory = new MemoryAdventureStore(); let release;
  const store = { durable: false, call: async (...args) => {
    if (args[0] === 'save') await new Promise(resolve => { release = resolve; });
    return memory.call(...args);
  } };
  const h = fixture(t, { store }), id = h.approve(); h.room.startRouteSelection(); h.choose(id);
  await Promise.resolve(); await Promise.resolve();
  disconnectPlayer(h.room, 'leader');
  const suspending = h.persistence.suspend(h.room); release();
  assert.equal(await suspending, false);
  assert.equal(h.room.checkpoint.status, 'saved'); assert.equal(h.room.players.observer.connected, true);
  assert.equal(h.room.isPaused, false); assert.equal(h.persistence.hasLostAuthority(h.room), false);
  assert.deepEqual(h.promoted, ['observer']);
});

test('failed termination fences local restore and background retry deletes progress without touching careers', async t => {
  const memory = new MemoryAdventureStore(); let fail = true;
  const h = fixture(t, { store: { durable: false, list: (...args) => memory.list(...args), call: (...args) => {
    if (args[0] === 'finish' && fail) return Promise.reject(new Error('isolated terminal outage'));
    return memory.call(...args);
  } } });
  const career = new CareerStats(new MemoryCareerStore()); t.after(() => career.close());
  career.attach(h.room); await career.flush(h.room);
  const before = (await career.read('leader')).stats;
  h.room.startRouteSelection(); await h.persistence.saveBoundary(h.room);
  const payload = { ...h.persistence.payload(h.room), key: 'stale', snapshot: memory.rows.get(h.room.adventureId).checkpoint };
  h.room.handleGameOver(); assert.equal(await h.persistence.finish(h.room), false);
  await assert.rejects(h.persistence.restore(h.room.adventureId, 'leader', { Room, code: () => 'STALE', io }), /結束/);
  assert.deepEqual((await h.persistence.list('leader')).adventures, []);
  fail = false; await h.persistence.renewAll();
  assert.equal(memory.rows.get(h.room.adventureId).checkpoint, null);
  await assert.rejects(memory.call('save', payload), /結束/);
  assert.equal(await h.persistence.finish(h.room), true);
  const after = (await career.read('leader')).stats;
  assert.equal(after.adventures, before.adventures); assert.equal(after.battles, before.battles);
});
