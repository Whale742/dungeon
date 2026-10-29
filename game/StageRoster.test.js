import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { AdventurePersistence } from './AdventurePersistence.js';
import { MemoryAdventureStore } from './AdventureStore.js';
import { createRoomSnapshot, restoreRoomSnapshot } from './RoomSnapshot.js';
import { CLASSES, ENCOUNTERS, SPECIAL_ELITES, ABYSS_BOSSES, getFloorDifficultyMultiplier } from './constants.js';
import { disconnectPlayer, reconnectPlayer } from './player-connection.js';

const io = { to: () => ({ emit() {} }) };
function fixture(t, count = 1) {
  const sockets = Array.from({ length: count }, (_, i) => ({ id: 'p' + i, join() {}, emit() {}, data: { identity: { display_name: 'P' + i } } }));
  const room = new Room('STAGE', sockets[0], 'P0', io), roles = Object.keys(CLASSES);
  for (const s of sockets.slice(1)) room.addPlayer(s, s.id);
  sockets.forEach((s, i) => room.selectRole(s.id, roles[i]));
  t.after(() => { room.clearTimer(); for (const k of ['roundStartTimer', 'selectionReadyTimer', 'presentationSafetyTimer']) clearTimeout(room[k]); });
  return { room, sockets };
}

for (const count of [1, 2, 4, 6, 10]) test(`${count} locked participants: all formation columns, elites, special encounters and abyss bosses keep original scaling formulas`, t => {
  const { room } = fixture(t, count); room.floor = 4; room.startRouteSelection({ skipIntro: true });
  assert.equal(room.stageRoster.count, count); assert.equal(Object.isFrozen(room.stageRoster.playerIds), true);
  const multiplier = getFloorDifficultyMultiplier(room.floor);
  const template = { id: 'scaling', name: 'Scaling QA', hp: 100, attack: 20 };
  for (const tier of ['MINION', 'ELITE', 'ABYSS']) for (const isWeakened of [false, true]) {
    const enemy = room.createEnemyInstance(template, 0, { tier, isWeakened, rng: () => .8 });
    let hp = Math.floor(100 * count * multiplier), atk = Math.floor(20 * (1 + (count - 1) * .5) * multiplier);
    if (isWeakened) { hp = Math.floor(hp * .75); atk = Math.floor(atk * .75); }
    assert.equal(enemy.maxHp, hp); assert.equal(enemy.attack, atk);
    assert.equal(enemy.scriptDamageScale, (1 + (count - 1) * .5) * multiplier * (isWeakened ? .75 : 1));
  }
  for (let col = 1; col <= 9; col++) {
    const enemies = room.buildEncounterFormation(col, { rng: () => .8 });
    assert.ok(enemies.length > 0);
    for (const e of enemies) assert.equal(e.maxHp, Math.floor(e.baseHp * count * multiplier), `column ${col}: ${e.originalName}`);
  }
  for (const specialElite of Object.values(SPECIAL_ELITES)) {
    for (const e of room.buildEncounterFormation(5, { specialElite, rng: () => .8 })) assert.equal(e.maxHp, Math.floor(e.baseHp * count * multiplier));
  }
  for (const abyssBoss of Object.values(ABYSS_BOSSES)) {
    for (const e of room.buildEncounterFormation(9, { abyssBoss, rng: () => .8 })) assert.equal(e.maxHp, Math.floor(e.baseHp * count * multiplier));
  }
  room.handleBattleEvent(); // The legacy single-enemy branch is a separate scaling entry.
  const e = room.currentMonster, base = ENCOUNTERS.find(x => x.name === e.originalName);
  assert.equal(e.maxHp, Math.floor(base.hp * count * multiplier));
  assert.equal(e.attack, Math.max(5, Math.floor(base.attack * (1 + (count - 1) * .5) * multiplier)));
});

test('8 formal members / 3 online lock 3; late arrivals cannot act or stall ACKs; disconnect/reconnect never rescale', t => {
  const { room, sockets } = fixture(t, 8);
  for (const s of sockets.slice(3)) room.players[s.id].connected = false;
  room.startRouteSelection({ skipIntro: true }); const roster = room.stageRoster;
  assert.equal(roster.count, 3);
  reconnectPlayer(room, sockets[3]);
  assert.equal(room.stageRoster, roster); assert.equal(room.getStagePlayerCount(), 3);
  room.handleBattleEvent(null, false, { col: 5, rng: () => .8 });
  const enemies = room.enemies.map(e => [e.instanceId, e.hp, e.maxHp, e.attack, e.scriptDamageScale]);
  disconnectPlayer(room, sockets[1].id); reconnectPlayer(room, sockets[1]);
  assert.equal(room.stageRoster, roster); assert.deepEqual(room.enemies.map(e => [e.instanceId, e.hp, e.maxHp, e.attack, e.scriptDamageScale]), enemies);
  assert.equal(room.isStageParticipant(sockets[1].id), true);
  assert.equal(room.isStageParticipant(sockets[3].id), false);
  room.selectionState = 'SELECTING'; room.isWaitingForSelectionReady = true; room.pendingSelectionAcks = new Set(['p0']);
  assert.equal(room.lockAction('p3', 'basic').success, false);
  assert.equal(room.unlockAction('p3').success, false); assert.equal(room.selectTargetEnemy('p3', room.enemies[0].instanceId).success, false);
  room.handleSelectionReady('p3', room.battleRound); assert.deepEqual([...room.pendingSelectionAcks], ['p0']);
  assert.equal(room.useLeaderSkill('p3').success, false);
  assert.equal(room.memberIds.length, 8); assert.equal(Object.keys(room.players).length, 8);
  room.floor++; room.startRouteSelection({ skipIntro: true }); assert.equal(room.stageRoster.count, 4);
});

test('a connected nonparticipant cannot resume a battle after all locked participants disconnect', t => {
  const { room, sockets } = fixture(t, 2); room.players.p1.connected = false;
  room.startRouteSelection({ skipIntro: true }); room.handleBattleEvent(null, false, { col: 1 });
  reconnectPlayer(room, sockets[1]); disconnectPlayer(room, 'p0');
  assert.equal(room.isPaused, true); assert.equal(room.togglePause('p1').success, false);
  reconnectPlayer(room, sockets[1]); assert.equal(room.isPaused, true);
  reconnectPlayer(room, sockets[0]); assert.equal(room.isPaused, false); assert.equal(room.stageRoster.count, 1);
});

test('checkpoint restore retains the locked seats even when a different subset reconnects first', t => {
  const { room, sockets } = fixture(t, 4); room.adventureId = 'qa-roster'; room.players.p3.connected = false;
  room.startRouteSelection({ skipIntro: true });
  const checkpoint = createRoomSnapshot(room);
  const restored = restoreRoomSnapshot(Room, checkpoint, 'BACK2', io, room.memberIds);
  t.after(() => restored.clearTimer()); reconnectPlayer(restored, sockets[3]);
  assert.deepEqual(restored.stageRoster, room.stageRoster); assert.equal(restored.getStagePlayerCount(), 3);
  assert.equal(restored.isStageParticipant('p3'), false);
  reconnectPlayer(restored, sockets[0]); assert.equal(restored.isStageParticipant('p0'), true);
  restored.handleBattleEvent(null, false, { col: 5, rng: () => .8 });
  for (const e of restored.enemies) assert.equal(e.maxHp, Math.floor(e.baseHp * 3 * getFloorDifficultyMultiplier(room.floor)));
});

test('no online eligible players pauses without a one-player fallback; reconnect initializes the same route exactly once', async t => {
  const { room, sockets } = fixture(t, 2), store = new MemoryAdventureStore(), persistence = new AdventurePersistence(store);
  room.persistence = persistence; persistence.begin(room); t.after(() => persistence.close());
  for (const p of Object.values(room.players)) p.connected = false;
  room.startRouteSelection(); const presentationId = room.routePresentationId;
  assert.equal(room.stageRoster, null); assert.equal(room.checkpoint.status, 'waiting_players'); assert.equal(room.isPaused, true);
  assert.equal(store.rows.size, 0); assert.throws(() => room.handleBattleEvent(), /名單/);
  assert.equal(room.voteRoute('p0', room.currentRoutes[0].id).success, false);
  reconnectPlayer(room, sockets[0]); await persistence.saveBoundary(room);
  assert.equal(room.stageRoster.count, 1); assert.equal(room.checkpoint.status, 'saved');
  assert.equal(room.routePresentationId, presentationId); assert.equal(room.isPaused, false);
});
