import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { Room } from './Room.js';
import { CLASSES } from './constants.js';
import { CareerStats } from './CareerStats.js';
import { CareerStore, MemoryCareerStore } from './CareerStore.js';
import { createRoomSnapshot, restoreRoomSnapshot } from './RoomSnapshot.js';
import { SupabaseRest } from '../studio/supabase.js';
import { loadEnv } from '../studio/env.js';

function fixture(t, { count = 2, store = new MemoryCareerStore(), roles = Object.keys(CLASSES), ids = [] } = {}) {
  const sockets = Array.from({ length: count }, (_, i) => ({ id: ids[i] || randomUUID(), join() {}, emit() {} }));
  const queues = [], io = { to: () => ({ emit: (event, data) => { if (event === 'battle:presentation_queue') queues.push(data.queue); } }) };
  const room = new Room('CARE1', sockets[0], 'QA', io);
  for (const s of sockets.slice(1)) room.addPlayer(s, 'QA');
  sockets.forEach((s, i) => room.selectRole(s.id, roles[i]));
  const career = new CareerStats(store); room.career = career; room.adventureId = randomUUID();
  room.startAdventure(room.leaderId, { skipPrepShop: true });
  t.after(() => { career.close(); room.clearTimer(); for (const k of ['roundStartTimer', 'selectionReadyTimer', 'presentationSafetyTimer']) clearTimeout(room[k]); });
  return { room, career, store, sockets, queues, io };
}
const battle = h => {
  h.room.startRouteSelection({ skipIntro: true });
  return h.room.handleBattleEvent(null, false, { col: 1, rng: () => .8 });
};
function hit(h, { owner = h.sockets[0].id, value = 8, shield = 0, minion = false } = {}) {
  const room = h.room, before = room.getHpSnapshot(), enemy = room.currentMonster;
  enemy.tempHp = shield;
  if (shield) { before.monster.tempHp = shield; before.enemies.find(e => e.instanceId === enemy.instanceId).tempHp = shield; }
  enemy.hp = Math.max(0, enemy.hp - value); enemy.tempHp = 0;
  const after = room.getHpSnapshot();
  const queue = [{ type: minion ? 'minion_action' : 'player_action', sourceId: owner,
    hpSnapshotBefore: before, hpSnapshot: after,
    results: [{ kind: 'damage', targetId: 'monster', finalDamage: 999999, targetBefore: before.monster, targetAfter: after.monster,
      ...(minion ? { minion: { id: 'summon', hp: 30 } } : {}) }] }];
  room.publishCombatQueue(queue); return queue;
}

test('adventures use permanent membership once; choosing a class and reconnecting do not invent battle counts', async t => {
  const h = fixture(t); await h.career.flush(h.room);
  const id = h.sockets[0].id;
  assert.deepEqual((await h.career.read(id)).stats.classes, {});
  assert.equal((await h.career.read(id)).stats.adventures, 1);
  h.career.attach(h.room); h.career.participate(h.room, id);
  assert.equal((await h.career.read(id)).stats.battles, 0);
  battle(h); h.career.participate(h.room, id); h.career.participate(h.room, id);
  const s = (await h.career.read(id)).stats;
  assert.equal(s.battles, 1); assert.equal(s.classes.warrior, 1); assert.equal(s.mostPlayedRole, 'warrior');
});

test('server HP/shield deltas cap overkill; duplicate queue delivery and companion hits count once for the owner', async t => {
  const h = fixture(t); battle(h);
  const available = h.room.currentMonster.hp;
  const queue = hit(h, { value: available + 999, shield: 5, minion: true });
  h.career.capture(h.room, queue); h.career.capture(h.room, structuredClone(queue));
  await h.career.flush(h.room);
  const stats = (await h.career.read(h.sockets[0].id)).stats;
  assert.equal(stats.damage, available + 5); assert.equal(stats.healing, 0);
  assert.equal((await h.career.read(h.sockets[1].id)).stats.damage, 0);
});

test('effective healing excludes overheal shields, gladiator conversion, friendly damage and healing enemies', async t => {
  const h = fixture(t, { roles: ['bard', 'gladiator'] }); battle(h);
  const bard = h.room.players[h.sockets[0].id], gladiator = h.room.players[h.sockets[1].id];
  bard.hp = bard.maxHp - 5;
  h.room.applyHealWithOverheal(bard, 40, { sourceId: bard.id });
  h.room.applyHealCapped(gladiator, 30, { sourceId: bard.id });
  await h.career.flush(h.room);
  assert.equal((await h.career.read(bard.id)).stats.healing, 5);
  assert.equal((await h.career.read(gladiator.id)).stats.healing, 0);
});

test('shared poison is allocated to its real owners and its actual lethal tick is not counted twice', async t => {
  const h = fixture(t, { roles: ['alchemist', 'archer'] }); battle(h);
  h.room.monsterAllowsEffect = () => true;
  const enemy = h.room.currentMonster; enemy.hp = 9;
  h.room.healingSourceId = h.sockets[0].id; h.room.applyMonsterPoison(6, 2, enemy);
  h.room.healingSourceId = h.sockets[1].id; h.room.applyMonsterPoison(3, 2, enemy);
  h.room.healingSourceId = null;
  h.career.dotDamage(h.room, enemy, 'poison', 9); h.career.dotDamage(h.room, enemy, 'poison', 9);
  await h.career.flush(h.room);
  assert.equal((await h.career.read(h.sockets[0].id)).stats.damage, 6);
  assert.equal((await h.career.read(h.sockets[1].id)).stats.damage, 3);
});

test('offline/dead nonparticipants and spectator-like records do not gain participation or victories', async t => {
  const h = fixture(t, { count: 4 });
  h.room.players[h.sockets[2].id].connected = false; h.room.players[h.sockets[3].id].hp = 0;
  battle(h); h.room.players.spectator = { id: 'spectator', role: 'mage', hp: 100, connected: true };
  h.career.participate(h.room, 'spectator', true);
  h.career.finish(h.room, true); h.career.finish(h.room, true);
  await h.career.flush(h.room);
  assert.equal((await h.career.read(h.sockets[0].id)).stats.wins, 1);
  assert.equal((await h.career.read(h.sockets[2].id)).stats.battles, 0);
  assert.equal((await h.career.read(h.sockets[3].id)).stats.wins, 0);
  assert.equal((await h.career.read('spectator')).stats.adventures, 0);
});

test('checkpoint rollback preserves career totals and creates a new run/encounter only when the battle really restarts', async t => {
  const h = fixture(t); h.room.startRouteSelection({ skipIntro: true });
  const snapshot = createRoomSnapshot(h.room);
  battle(h); hit(h, { value: 5 }); h.career.finish(h.room, true); await h.career.flush(h.room);
  const id = h.sockets[0].id, before = (await h.career.read(id)).stats;
  const restored = restoreRoomSnapshot(Room, snapshot, 'BACK1', h.io, h.room.memberIds);
  t.after(() => restored.clearTimer());
  h.career.attach(restored); await h.career.flush(restored);
  assert.equal((await h.career.read(id)).stats.damage, before.damage);
  assert.equal((await h.career.read(id)).stats.battles, before.battles);
  restored.players[id].connected = true; restored.handleBattleEvent(null, false, { col: 1, rng: () => .8 });
  await h.career.flush(restored);
  const after = (await h.career.read(id)).stats;
  assert.equal(after.adventures, 1); assert.equal(after.battles, before.battles + 1); assert.equal(after.wins, before.wins);
  const encounters = [...h.store.events.values()].filter(e => e.playerId === id && e.kind === 'encounter');
  assert.equal(new Set(encounters.map(e => e.runId)).size, 2);
  assert.equal(snapshot.data.career, undefined);
});

test('lost committed responses retry the immutable batch without double counting', async t => {
  const memory = new MemoryCareerStore(); let lose = true;
  const store = { durable: true, read: id => memory.read(id), commit: async events => {
    const result = await memory.commit(events); if (lose) { lose = false; throw new Error('response lost'); } return result;
  } };
  const h = fixture(t, { store }); await h.career.flush(h.room).catch(() => {});
  await h.career.flush(h.room);
  assert.equal((await h.career.read(h.sockets[0].id)).stats.adventures, 1);
  assert.equal(h.career.status(h.room).failed, false);
});

test('a failed statistics commit holds the safe round boundary and resumes the same resolved state after retry', async t => {
  const memory = new MemoryCareerStore(); let fail = false;
  const store = { durable: true, read: id => memory.read(id), commit: events => fail ? Promise.reject(new Error('offline')) : memory.commit(events) };
  const h = fixture(t, { store }); await h.career.flush(h.room); battle(h); await h.career.flush(h.room);
  fail = true; hit(h, { value: 5 });
  const round = h.room.battleRound;
  h.room.pendingPresentationAcks.clear(); h.room.finishTurnPresentation();
  await h.career.flush(h.room).catch(() => {});
  assert.equal(h.room.battleRound, round); assert.equal(h.career.status(h.room).failed, true);
  fail = false; await h.career.flush(h.room); await setImmediate();
  assert.equal(h.room.battleRound, round + 1);
  assert.equal((await h.career.read(h.sockets[0].id)).stats.damage, 5);
});

test('boss victory credits fallen participants once and excludes merchant/mimic encounters', async t => {
  const h = fixture(t); battle(h);
  h.room.enemies = [{ isElite: true }, { isAbyssBoss: true }, { tier: 'ELITE', isMimic: true }, { tier: 'ELITE', isShadyMerchant: true }];
  h.room.players[h.sockets[1].id].hp = 0;
  h.career.finish(h.room, true); h.career.finish(h.room, true);
  await h.career.flush(h.room);
  for (const s of h.sockets) {
    const stats = (await h.career.read(s.id)).stats;
    assert.equal(stats.wins, 1); assert.equal(stats.bosses, 2);
  }
});

test('queued persistence completion cannot advance a changed battle round', async t => {
  const h = fixture(t); await h.career.flush(h.room); battle(h); await h.career.flush(h.room);
  hit(h, { value: 1 }); let called = 0;
  h.room.isPaused = true;
  assert.equal(h.career.deferUntilPersisted(h.room, () => called++), true);
  await h.career.flush(h.room);
  h.room.isPaused = false; h.career.resume(h.room);
  h.room.battleRound++;
  await setImmediate();
  assert.equal(called, 0);
});

for (const role of Object.keys(CLASSES)) test(`${role}: real battle publication contributes to the correct class and player`, async t => {
  const h = fixture(t, { count: 1, roles: [role] }); battle(h); await h.career.flush(h.room);
  if (h.room.selectionState === 'RESOLVING') { h.room.pendingPresentationAcks.clear(); h.room.finishTurnPresentation(); await setImmediate(); }
  h.room.handleSelectionReady(h.sockets[0].id, h.room.battleRound);
  const locked = h.room.lockAction(h.sockets[0].id, 'basic', null, h.room.currentMonster.instanceId);
  assert.equal(locked.success, true, locked.message);
  await h.career.flush(h.room);
  const s = (await h.career.read(h.sockets[0].id)).stats;
  const damage = h.queues.flatMap(queue => queue.flatMap(step => step.results || [])).filter(result =>
    result.kind === 'damage' && (result.ownerId || result.sourceId) === h.sockets[0].id &&
    h.room.enemies.some(e => e.instanceId === result.targetEnemyId)).reduce((n, r) => n + r.actualHpDamage + r.actualAbsorbed, 0);
  assert.equal(s.classes[role], 1); assert.equal(s.damage, damage);
});

test('cloud: career transaction deduplication, account binding, concurrent retries, rollback and private API',
  { skip: process.env.CAREER_CLOUD_TEST !== '1', timeout: 90000 }, async t => {
  loadEnv(); const cloud = new SupabaseRest(), store = new CareerStore(cloud), ids = [randomUUID(), randomUUID()];
  t.after(async () => { await cloud.request('/rest/v1/game_players?id=in.(' + ids.join(',') + ')', { method: 'DELETE' }); });
  await cloud.request('/rest/v1/game_players', { method: 'POST', body: ids.map(id => ({ id, display_name: 'Phase4 automated QA' })) });
  for (const [rpc, body] of [['game_career_read', { player_id: ids[0] }], ['game_career_commit', { events: [] }]]) {
    await assert.rejects(cloud.request('/rest/v1/rpc/' + rpc, { method: 'POST', body, publicRead: true }));
  }
  const h = fixture(t, { store, ids, roles: ['warrior', 'bard'] }); await h.career.flush(h.room);
  battle(h); hit(h, { value: 5 }); h.career.finish(h.room, true); await h.career.flush(h.room);
  const original = await store.read(ids[0]);
  assert.equal(original.adventures, 1); assert.equal(original.battles, 1); assert.equal(original.damage, 5); assert.equal(original.wins, 1);
  const rows = await cloud.request('/rest/v1/game_career_events?player_id=eq.' + ids[0] + '&select=payload');
  assert.equal((await store.commit(rows.map(r => r.payload))).accepted, 0);
  const combat = rows.find(r => r.payload.kind === 'combat').payload;
  const extra = { ...combat, key: 'concurrent:' + randomUUID(), damage: 3, healing: 0 };
  const accepted = await Promise.all([store.commit([extra]), store.commit([extra])]);
  assert.equal(accepted.reduce((n, r) => n + r.accepted, 0), 1);
  const conflict = { ...combat, damage: combat.damage + 1 };
  await assert.rejects(store.commit([{ ...extra, key: 'rollback:' + randomUUID(), damage: 100 }, conflict]));
  assert.equal((await store.read(ids[0])).damage, 8);
  // Binding and renaming mutate identity rows, never career records.
  const { Identity } = await import('./Identity.js'); const identity = new Identity();
  const player = await identity.store.call('player', { id: ids[0] });
  const bound = await identity.credentials(player, 'p4_' + randomUUID().slice(0, 12).replaceAll('-', ''), 'qa-only-career-password-123');
  assert.equal(bound.player.id, ids[0]); await identity.store.call('name', { id: ids[0], name: 'Phase4 renamed QA' });
  assert.equal((await store.read(ids[0])).damage, 8);
  h.room.floor = 12; h.career.floor(h.room); await h.career.flush(h.room);
  h.room.state = 'CHOOSING_ROUTE'; h.room.routeVotes = {}; h.room.currentRoutes ||= [{ id: 'test-route' }];
  const snapshot = createRoomSnapshot(h.room);
  const restored = restoreRoomSnapshot(Room, snapshot, 'CLOUD', h.io, h.room.memberIds); t.after(() => restored.clearTimer());
  h.career.attach(restored); await h.career.flush(restored);
  assert.equal((await store.read(ids[0])).adventures, 1); assert.equal((await store.read(ids[0])).highestFloor, 12);
  restored.players[ids[0]].connected = true; restored.handleBattleEvent(null, false, { col: 1, rng: () => .8 });
  await h.career.flush(restored); assert.equal((await store.read(ids[0])).battles, 2);
  const start = performance.now(), profile = await store.read(ids[0]);
  t.diagnostic(JSON.stringify({ profileBytes: Buffer.byteLength(JSON.stringify(profile)), readMs: Math.round(performance.now() - start) }));
});
