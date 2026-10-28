import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { Room } from './Room.js';
import { CLASSES } from './constants.js';
import { AdventureStore, MemoryAdventureStore, LEASE_MS } from './AdventureStore.js';
import { AdventurePersistence } from './AdventurePersistence.js';
import { createRoomSnapshot, restoreRoomSnapshot, validateRoomSnapshot, ROOM_SNAPSHOT_FIELDS } from './RoomSnapshot.js';
import { disconnectPlayer, reconnectPlayer } from './player-connection.js';
import { SupabaseRest } from '../studio/supabase.js';
import { loadEnv } from '../studio/env.js';
import { metrics, startEventLoopMetrics } from './performance.js';
import { refreshPublished } from '../studio/content.js';

const io = { to: () => ({ emit() {} }) };
const roles = Object.keys(CLASSES);
function fixture(t, { count = 1, store = new MemoryAdventureStore(), role = roles[0], now } = {}) {
  const sockets = Array.from({ length: count }, (_, i) => ({ id: `member-${i}`, join() {}, emit() {},
    data: { identity: { display_name: `Player ${i}` } } }));
  const room = new Room('SAVE1', sockets[0], 'Player 0', io);
  for (let i = 1; i < count; i++) room.addPlayer(sockets[i], `Player ${i}`);
  sockets.forEach((s, i) => assert.equal(room.selectRole(s.id, count === 1 ? role : roles[i]).success, true));
  const persistence = new AdventurePersistence(store, { now });
  room.persistence = persistence;
  assert.equal(room.startAdventure(room.leaderId, { skipPrepShop: true }).success, true);
  t.after(() => { persistence.close(); room.clearTimer(); });
  return { room, store, persistence, sockets };
}
async function boundary(h, options) {
  h.room.startRouteSelection(options);
  await h.persistence.saveBoundary(h.room);
  return h.store.rows?.get(h.room.adventureId);
}
function restoreOptions() { return { Room, code: () => 'NEW01', io }; }

for (const role of roles) test(`${role}: checkpoint round trip preserves class resources, effects, equipment, summons and map data`, async t => {
  const h = fixture(t, { role }); const { room } = h;
  const p = room.players[room.leaderId];
  Object.assign(p, { hp: 77, tempHp: 11, bonusAtk: 13, bonusDef: 9, victoryAtkBonus: 17,
    soul: 4, kyoutou: true, parryChance: .4, sageX: 87, sageDebt: 20, sageOperand: 19, sagePhase: 'solve',
    sageDebtScheduledRound: 7, sagePreviousAction: 'sge_deduce', augurFateDebts: [{ amount: 9, round: 3 }],
    augurObservation: 8, augurCardState: 'reversed', rage: 6, gladiatorInspiration: [{ until: 4, value: 17 }],
    gladiatorChallenge: { enemyId: 'enemy-1', round: 5 }, druidForm: 'tree', druidFormTurns: 2,
    druidRegenBonus: 7, bearMaxHpAdded: 0, werewolfMaxHpDeducted: 12, talismans: [{ type: 'seal', turns: 2 }],
    p8Effects: { enduring: { duration: Infinity, until: Infinity, value: 5 } }, p8Shields: [{ hp: 5, until: 4 }],
    bleedTurns: 2, poisonDmg: 5, ammo: ['heavy', 'fire'], stealthStacks: 3, bloodStacks: 2,
    cooldowns: { ...p.cooldowns, basic: 2 }, bag: [{ id: 'potion', instanceId: 'bag-1' }],
    equipSlots: { ...p.equipSlots, WEAPON: { id: 'sword', instanceId: 'equip-1' } },
    equips: [{ id: 'sword', instanceId: 'equip-1' }],
    minions: [{ id: 'summon-1', hp: 18, maxHp: 30, buffs: new Map([['growth', 3]]) }],
    passiveFlags: new Set(['permanent']), temporaryOverheal: 13 });
  p.minion = p.minions[0];
  room.gold = 125; room.squadInventory = [{ id: 'team', instanceId: 'shared-1' }];
  room.overflowItems = [{ id: 'overflow', instanceId: 'overflow-1' }];
  room.stargazerBoundaryScoutedNext = true;
  room.hasTriggeredAbyss = true; room.abyssState = { debt: 3 };
  const row = await boundary(h);
  const snapshot = JSON.parse(JSON.stringify(row.checkpoint));
  const restored = restoreRoomSnapshot(Room, snapshot, 'ROUND', io, room.memberIds);
  t.after(() => restored.clearTimer());
  const before = { ...p, connected: false, isLocked: false, action: null, targetPlayerId: null, targetEnemyId: null };
  assert.deepEqual(restored.players[p.id], before);
  assert.equal(restored.players[p.id].minion, restored.players[p.id].minions[0]);
  for (const key of ['hexMap', 'currentHex', 'currentRoutes', 'gold', 'squadInventory', 'overflowItems', 'scoutedCols', 'abyssState', 'hasTriggeredAbyss']) assert.deepEqual(restored[key], room[key], key);
  assert.equal(restored.state, 'CHOOSING_ROUTE'); assert.equal(restored.isNarrating, true);
  assert.equal(restored.currentEvent, null); assert.equal(restored.currentVictory, null);
  assert.equal(restored.turnTimer, null); assert.equal(restored.routeVotes.constructor, Object);
  assert.equal(restored.routePresentationId, room.routePresentationId + 1);
});

test('all Room/module assigned fields are explicitly persisted or classified as runtime-only', () => {
  const runtimeOnly = `code io studioContent state selectionState currentEvent currentTransition isNarrating checkpointChoice gameOverReason
routeVotes currentVictory floorRevival pendingDrop pendingPresentationAcks pendingSelectionAcks presentationSafetyTimer turnTimer
timerEndsAt timerCallback isPaused pausedRemainingSeconds logs narrativeControl actionCleansedSnapshot actionHeals healingSourceId
augurReactions augurVisuals enemyCounterResolution enemyDamageReceipts enemyMechanicQueue enemyReactionSteps
isWaitingForSelectionReady presentationMode roundStartTimer selectionReadyTimer timerBroadcastTicks victoryInteractionReady victoryPendingDrop
p8BossOutcome p8DamagePresentationOutcomes p8LogBuffer p8Results p8Visuals p8ClockEvents arenaRoundLock lastBroadcastAt stateVersion currentMonster`.split(/\s+/);
  const known = new Set([...ROOM_SNAPSHOT_FIELDS, ...runtimeOnly]);
  for (const file of ['Room.js', 'role-mechanics.js', 'druid.js', 'assassin.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const assigned = [...source.matchAll(/this\.([A-Za-z_$][\w$]*)\s*(?:\?\?=|\|\|=|=(?!=)|\+=|\+\+)/g)].map(m => m[1]);
    assert.deepEqual([...new Set(assigned.filter(k => !known.has(k)))], [], file);
  }
});

for (const role of roles) test(`${role}: actual battle/victory state can be checkpointed and restored at the next route`, async t => {
  const h = fixture(t, { role }); await boundary(h, { skipIntro: true });
  h.room.handleBattleEvent(null, false, { col: 1 });
  for (const enemy of h.room.enemies) enemy.hp = 0;
  h.room.publishCombatQueue([]); h.room.handlePresentationComplete(h.room.leaderId, h.room.battlePresentationId, 1);
  const victoryId = h.room.currentVictory.presentationId;
  h.room.handleVictoryComplete(h.room.leaderId, victoryId); h.room.continueAfterVictory(h.room.leaderId, victoryId);
  await h.persistence.saveBoundary(h.room);
  assert.equal(h.room.checkpoint.status, 'saved'); assert.equal(h.room.checkpoint.saveVersion, 2);
  const saved = h.store.rows.get(h.room.adventureId);
  const restored = restoreRoomSnapshot(Room, JSON.parse(JSON.stringify(saved.checkpoint)), 'AFTER', io, h.room.memberIds);
  assert.equal(restored.floor, h.room.floor);
  assert.deepEqual(restored.players[h.room.leaderId].cooldowns, h.room.players[h.room.leaderId].cooldowns);
  assert.equal(restored.gold, h.room.gold);
});

for (const count of [1, 4, 10]) test(`${count} members: save completes before votes, repeated boundaries are idempotent, later floors overwrite one row`, async t => {
  const h = fixture(t, { count });
  h.room.startRouteSelection();
  const id = h.room.routePresentationId;
  h.sockets.forEach(s => h.room.handleRouteNarrativeDone(s.id, id));
  assert.equal(h.room.voteRoute(h.room.leaderId, h.room.currentRoutes[0].id).success, false);
  assert.equal(h.room.isNarrating, true);
  await h.persistence.saveBoundary(h.room);
  assert.equal(h.room.isNarrating, false); assert.equal(h.room.checkpoint.saveVersion, 1);
  const routes = structuredClone(h.room.currentRoutes);
  h.room.startRouteSelection(); await h.persistence.saveBoundary(h.room);
  assert.equal(h.room.routePresentationId, id); assert.deepEqual(h.room.currentRoutes, routes);
  for (let floor = 2; floor <= 12; floor++) {
    h.room.floor = floor; await boundary(h, { skipIntro: true });
    assert.equal(h.store.rows.size, 1); assert.equal(h.room.checkpoint.saveVersion, floor);
    assert.equal(h.store.rows.get(h.room.adventureId).checkpoint_floor, floor);
  }
  assert.equal(h.room.voteRoute(h.room.leaderId, h.room.currentRoutes[0].id).success, true);
});

test('controlled slow/failing writes keep a frozen snapshot and retry the exact boundary without rerolling or double increment', async t => {
  const memory = new MemoryAdventureStore(); let release; let fail = false;
  const store = { durable: true, call: async (action, x) => {
    if (action === 'save') { if (!release) await new Promise(resolve => { release = resolve; }); if (fail) throw new Error('simulated outage'); }
    return memory.call(action, x);
  } };
  const h = fixture(t, { store });
  h.room.gold = 123; h.room.startRouteSelection({ skipIntro: true });
  const saving = h.persistence.saveBoundary(h.room);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.room.checkpoint.status, 'saving');
  assert.equal(h.room.voteRoute(h.room.leaderId, h.room.currentRoutes[0].id).success, false);
  h.room.gold = 999; fail = true; release(); await saving;
  assert.equal(h.room.checkpoint.status, 'failed'); assert.equal(memory.rows.size, 0);
  const route = structuredClone(h.room.currentRoutes), id = h.room.routePresentationId;
  fail = false; assert.equal((await h.persistence.retry(h.room, h.room.leaderId)).success, true);
  assert.equal(memory.rows.get(h.room.adventureId).checkpoint.data.gold, 123);
  assert.equal(h.room.checkpoint.saveVersion, 1); assert.deepEqual(h.room.currentRoutes, route);
  assert.equal(h.room.routePresentationId, id);
});

test('all players disconnecting during a pending save stay paused; returners must ACK the same route', async t => {
  const memory = new MemoryAdventureStore(); let release;
  const store = { durable: false, call: async (action, x) => {
    if (action === 'save') await new Promise(resolve => { release = resolve; });
    return memory.call(action, x);
  } };
  const h = fixture(t, { count: 4, store });
  h.room.startRouteSelection(); const saving = h.persistence.saveBoundary(h.room);
  await Promise.resolve(); await Promise.resolve();
  h.sockets.forEach(s => disconnectPlayer(h.room, s.id));
  assert.equal(h.room.isPaused, true); release(); await saving;
  assert.equal(h.room.isNarrating, true); assert.equal(h.room.pendingPresentationAcks.size, 0);
  reconnectPlayer(h.room, h.sockets[0]);
  assert.equal(h.room.isPaused, false); assert.equal(h.room.isNarrating, true);
  assert.equal(h.room.voteRoute(h.room.leaderId, h.room.currentRoutes[0].id).success, false);
  h.room.handleRouteNarrativeDone(h.room.leaderId, h.room.routePresentationId);
  assert.equal(h.room.isNarrating, false);
});

test('browser recovery retries a BUSY lease, stops on room change and discards old connection replies', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const source = readFileSync(new URL('../public/js/core/app.js', import.meta.url), 'utf8');
  const events = {}, calls = [], notices = [];
  const scope = { myId: 'member', roomState: null, performance: { now: () => 0 }, setTimeout, clearTimeout,
    localStorage: { getItem: () => JSON.stringify({ playerId: 'member', adventureId: 'adventure' }), removeItem() {} },
    PlayerIdentity: { accept(p) { scope.myId = p.playerId; } }, showToast: (...args) => notices.push(args),
    socket: { connected: true, on: (event, handler) => events[event] = handler,
      timeout() { return { emit: (...args) => calls.push(args) }; } } };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('let recentAdventureRestoreTimer'), source.indexOf("socket.on('player:session_invalid'")), scope);
  events['player:identity']({ player: { playerId: 'member' } });
  assert.equal(calls.length, 1); calls[0][2](null, { success: false, code: 'BUSY' });
  t.mock.timers.tick(3000); assert.equal(calls.length, 2);
  calls[1][2](null, { success: false, code: 'BUSY' });
  scope.roomState = { adventureId: 'other-party' }; t.mock.timers.tick(5000);
  assert.equal(calls.length, 2);
  scope.roomState = null;
  events['player:identity']({ player: { playerId: 'member' } });
  const latest = calls.at(-1); const count = notices.length;
  calls[1][2](null, { success: false, message: 'old failure' }); assert.equal(notices.length, count);
  latest[2](null, { success: true }); t.mock.timers.tick(10000); assert.equal(calls.length, 3);
});

test('withdrawal response loss fences the in-memory party instead of resurrecting a departed member', async t => {
  const memory = new MemoryAdventureStore();
  const store = { durable: true, call: async (action, x) => {
    const row = await memory.call(action, x);
    if (action === 'leave') throw new Error('lost response');
    return row;
  } };
  const h = fixture(t, { count: 4, store }); await boundary(h);
  await assert.rejects(h.persistence.leave(h.room, h.sockets[1].id), /安全暫停/);
  assert.equal(h.room.isPaused, true); assert.equal(h.persistence.blocked(h.room), true);
  assert.equal(memory.rows.get(h.room.adventureId).members.includes(h.sockets[1].id), false);
});

test('lost successful-write response retries idempotently, including when ending the adventure', async t => {
  const memory = new MemoryAdventureStore(); let drop = true;
  const store = { durable: true, call: async (action, x) => {
    const row = await memory.call(action, x);
    if (action === 'save' && drop) { drop = false; throw new Error('response lost after commit'); }
    return row;
  } };
  const h = fixture(t, { store }); await boundary(h);
  assert.equal(h.room.checkpoint.status, 'failed');
  assert.equal(memory.rows.get(h.room.adventureId).save_version, 1);
  h.room.handleGameOver(); await h.persistence.finish(h.room);
  assert.equal(h.room.checkpoint.status, 'ended');
  assert.equal(memory.rows.get(h.room.adventureId).status, 'failed');
  assert.equal(memory.rows.get(h.room.adventureId).save_version, 1);
  await assert.rejects(h.persistence.restore(h.room.adventureId, h.room.leaderId, restoreOptions()), /結束/);
});

test('restore prefers the active room, then reconstructs the last checkpoint after restart with a single fenced authority', async t => {
  let time = Date.now(); const now = () => time;
  const h = fixture(t, { count: 4, store: new MemoryAdventureStore({ now }), now }); await boundary(h);
  h.room.gold = 0; h.room.players[h.room.leaderId].hp = 1;
  h.room.state = 'IN_BATTLE';
  assert.equal(await h.persistence.restore(h.room.adventureId, h.room.leaderId, restoreOptions()), h.room);
  const next = new AdventurePersistence(h.store, { now }); t.after(() => next.close());
  await assert.rejects(next.restore(h.room.adventureId, h.room.leaderId, restoreOptions()), /另一個伺服器/);
  time += LEASE_MS + 1;
  const [a, b] = await Promise.all(h.sockets.slice(0, 2).map(s => next.restore(h.room.adventureId, s.id, restoreOptions())));
  assert.equal(a, b); assert.equal(a.gold, 180); assert.notEqual(a.players[a.leaderId].hp, 1);
  assert.deepEqual(a.currentRoutes, h.room.currentRoutes); assert.equal(a.pendingPresentationAcks.size, 0);
  reconnectPlayer(a, h.sockets[0], { newConnection: true });
  assert.equal(a.isPaused, false); assert.equal(a.pendingPresentationAcks.has(a.leaderId), true);
  a.handleRouteNarrativeDone(a.leaderId, a.routePresentationId - 1); assert.equal(a.isNarrating, true);
  a.handleRouteNarrativeDone(a.leaderId, a.routePresentationId); assert.equal(a.isNarrating, false);
  assert.equal(a.voteRoute(a.leaderId, a.currentRoutes[0].id).success, true);
  h.room.floor++; h.room.startRouteSelection(); await h.persistence.saveBoundary(h.room);
  assert.equal(h.room.checkpoint.status, 'failed'); assert.equal(h.room.isPaused, true);
  assert.equal(h.store.rows.get(a.adventureId).save_version, 1);
  await assert.rejects(next.restore(a.adventureId, 'outsider', restoreOptions()), /無權/);
  a.clearTimer();
});

test('disconnect retains equipped characters; permanent withdrawal survives checkpoint rollback without updating progress', async t => {
  let time = Date.now(); const now = () => time;
  const h = fixture(t, { count: 4, store: new MemoryAdventureStore({ now }), now });
  h.room.players[h.sockets[1].id].bag = [{ id: 'retained', instanceId: 'bag-keep' }];
  await boundary(h, { skipIntro: true });
  const before = structuredClone(h.store.rows.get(h.room.adventureId).checkpoint);
  disconnectPlayer(h.room, h.sockets[1].id);
  assert.equal(h.room.players[h.sockets[1].id].bag[0].id, 'retained');
  reconnectPlayer(h.room, h.sockets[1]);
  await h.persistence.leave(h.room, h.sockets[1].id); h.room.removePlayer(h.sockets[1].id);
  assert.deepEqual(h.store.rows.get(h.room.adventureId).checkpoint, before);
  time += LEASE_MS + 1;
  const next = new AdventurePersistence(h.store, { now }); t.after(() => next.close());
  await assert.rejects(next.restore(h.room.adventureId, h.sockets[1].id, restoreOptions()), /無權/);
  const restored = await next.restore(h.room.adventureId, h.room.leaderId, restoreOptions());
  assert.equal(restored.players[h.sockets[1].id], undefined); assert.equal(restored.memberIds.length, 3);
  assert.equal(restored.squadInventory.some(item => item?.id === 'retained'), true);
});

for (const status of ['completed', 'failed', 'abandoned']) test(`${status}: terminal metadata preserves the checkpoint and blocks restore/restart until committed`, async t => {
  const h = fixture(t); await boundary(h);
  const old = structuredClone(h.store.rows.get(h.room.adventureId).checkpoint);
  if (status === 'completed') { h.room.state = 'CHECKPOINT'; h.room.handleCheckpointChoice(h.room.leaderId, 'end'); }
  else if (status === 'failed') h.room.handleGameOver();
  else h.room.endBattle(h.room.leaderId);
  assert.equal(h.room.restartToLobby(h.room.leaderId).success, false);
  await h.persistence.finish(h.room);
  const row = h.store.rows.get(h.room.adventureId);
  assert.equal(row.status, status); assert.deepEqual(row.checkpoint, old); assert.equal(row.save_version, 1);
  await assert.rejects(h.persistence.restore(row.id, h.room.leaderId, restoreOptions()), /結束/);
  assert.equal(h.room.restartToLobby(h.room.leaderId).success, true);
  assert.equal(h.room.startAdventure(h.room.leaderId).success, true); assert.notEqual(h.room.adventureId, row.id);
});

test('malformed/unsupported snapshots and runtime handles fail closed', async t => {
  const h = fixture(t); await boundary(h);
  const source = h.store.rows.get(h.room.adventureId).checkpoint;
  for (const mutate of [s => s.schemaVersion++, s => s.data.memberIds.push('missing'), s => s.data.players[h.room.leaderId].role = 'unknown',
    s => s.data.floor = -1, s => s.data.io = {}, s => s.data.scoutedCols = []]) {
    const copy = structuredClone(source); mutate(copy); assert.throws(() => validateRoomSnapshot(copy));
  }
  h.room.players[h.room.leaderId].socket = { emit() {} };
  assert.throws(() => createRoomSnapshot(h.room), /執行期/);
});

test('renewal failure freezes authority, and pre-checkpoint last-member departure creates only an abandoned tombstone', async t => {
  const h = fixture(t); await boundary(h);
  h.store.call = async () => { throw new Error('network offline'); };
  await h.persistence.renewAll();
  assert.equal(h.room.isPaused, true); assert.equal(h.persistence.blocked(h.room), true);
  assert.equal(h.room.togglePause(h.room.leaderId).success, false);
  const fresh = fixture(t);
  await fresh.persistence.leave(fresh.room, fresh.room.leaderId);
  const row = fresh.store.rows.get(fresh.room.adventureId);
  assert.equal(row.status, 'abandoned'); assert.equal(row.checkpoint, null); assert.equal(row.save_version, 0);
});

test('cloud: actual RPC atomic overwrite, permissions, recovery fencing, terminal state and 1/4/10-player measurements',
  { skip: process.env.ADVENTURE_CLOUD_TEST !== '1', timeout: 240000 }, async t => {
  loadEnv();
  const cloud = new SupabaseRest(); const store = new AdventureStore(cloud);
  assert.equal(await refreshPublished(cloud), true);
  const ids = Array.from({ length: 10 }, () => randomUUID()); const adventures = [];
  const managers = [];
  const wasEnabled = metrics.enabled; metrics.enabled = true; metrics.values.clear();
  const stopLoopMetrics = startEventLoopMetrics();
  t.after(async () => {
    managers.forEach(p => p.close()); stopLoopMetrics(); metrics.enabled = wasEnabled;
    if (adventures.length) await cloud.request('/rest/v1/game_adventures?id=in.(' + adventures.join(',') + ')', { method: 'DELETE' });
    await cloud.request('/rest/v1/game_players?id=in.(' + ids.join(',') + ')', { method: 'DELETE' });
  });
  await cloud.request('/rest/v1/game_players', { method: 'POST', body: ids.map(id => ({ id, display_name: 'Phase2 automated QA' })) });
  await assert.rejects(cloud.request('/rest/v1/rpc/game_adventure', { publicRead: true, method: 'POST', body: { action: 'load', payload: {} } }));
  for (const count of [1, 4, 10]) {
    metrics.startedAt = performance.now();
    const sockets = ids.slice(0, count).map(id => ({ id, join() {}, emit() {}, data: { identity: { display_name: 'Phase2 QA' } } }));
    const room = new Room('CLOUD', sockets[0], 'Phase2 QA', io);
    sockets.slice(1).forEach(s => room.addPlayer(s, 'Phase2 QA'));
    sockets.forEach((s, i) => room.selectRole(s.id, roles[i]));
    const p = new AdventurePersistence(store); managers.push(p); room.persistence = p;
    room.startAdventure(room.leaderId, { skipPrepShop: true }); adventures.push(room.adventureId);
    room.startRouteSelection(); assert.equal(await p.saveBoundary(room), true);
    assert.equal(room.checkpoint.saveVersion, 1);
    const saved = await store.call('load', { id: room.adventureId, playerId: room.leaderId });
    const payload = { id: saved.id, owner: saved.lease_owner, generation: saved.lease_generation, version: 0,
      key: saved.checkpoint_key, snapshot: saved.checkpoint, leaderId: room.leaderId, members: room.memberIds };
    assert.equal((await store.call('save', payload)).save_version, 1);
    await assert.rejects(store.call('save', { ...payload, key: randomUUID() }), /版本/);
    await assert.rejects(store.call('save', { id: saved.id, key: randomUUID(), snapshot: saved.checkpoint }), /版本/);
    await assert.rejects(store.call('load', { id: saved.id, playerId: randomUUID() }), /無權/);
    for (let floor = 2; floor <= 12; floor++) { room.floor = floor; room.startRouteSelection({ skipIntro: true }); assert.equal(await p.saveBoundary(room), true); }
    const rows = await cloud.request('/rest/v1/game_adventures?id=eq.' + room.adventureId + '&select=id,save_version,checkpoint_floor');
    assert.equal(rows.length, 1); assert.equal(rows[0].save_version, 12); assert.equal(rows[0].checkpoint_floor, 12);
    const restored = new AdventurePersistence(store); managers.push(restored);
    await assert.rejects(restored.restore(saved.id, room.leaderId, restoreOptions()), /另一個伺服器/);
    p.close(); // Abrupt process loss: expire only this test-owned row's lease.
    await cloud.request('/rest/v1/game_adventures?id=eq.' + saved.id, { method: 'PATCH', body: { lease_until: new Date(Date.now() - 1000).toISOString() } });
    const [a, b] = await Promise.all(sockets.slice(0, Math.min(count, 2)).map(s => restored.restore(saved.id, s.id, restoreOptions())));
    if (b) assert.equal(a, b);
    assert.equal(a.floor, 12); assert.deepEqual(a.currentRoutes, room.currentRoutes); assert.equal(a.memberIds.length, count);
    const version = a.checkpoint.saveVersion;
    room.floor++; room.startRouteSelection(); assert.equal(await p.saveBoundary(room), false);
    assert.equal(room.checkpoint.status, 'failed');
    a.handleGameOver(); assert.equal(await restored.finish(a), true);
    const final = await cloud.request('/rest/v1/game_adventures?id=eq.' + a.adventureId + '&select=status,save_version,checkpoint_floor');
    assert.equal(final[0].status, 'failed'); assert.equal(final[0].save_version, version);
    await assert.rejects(store.call('load', { id: a.adventureId, playerId: a.leaderId }), /結束/);
    a.clearTimer(); room.clearTimer();
    t.diagnostic(`cloud ${count} players: ${JSON.stringify(metrics.snapshot())}`);
    metrics.values.clear();
  }
});
