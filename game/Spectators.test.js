import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { Spectators, spectatorState, publicVisual } from './Spectators.js';
import { CLASSES } from './constants.js';
import { createRoomSnapshot } from './RoomSnapshot.js';
import { metrics } from './performance.js';

function fixture(t, count = 1) {
  const wire = [], io = { to: channel => ({ emit: (event, data) => wire.push({ channel, event, data }) }) };
  const socket = id => ({ id, data: {}, join() {}, leave() {}, emit: (event, data) => wire.push({ id, event, data }) });
  const room = new Room('WATCH', socket('p0'), 'QA', io);
  for (let i = 1; i < count; i++) room.addPlayer(socket('p' + i), 'QA');
  Object.keys(room.players).forEach((id, i) => room.selectRole(id, Object.keys(CLASSES)[i]));
  room.spectators = new Spectators(room, io);
  t.after(() => { room.clearTimer(); for (const key of ['roundStartTimer', 'selectionReadyTimer', 'presentationSafetyTimer']) clearTimeout(room[key]); });
  return { room, wire, socket };
}
test('ten formal members and five independent spectators do not change authority or ACK barriers', t => {
  const { room, socket } = fixture(t, 10);
  const members = [...room.memberIds];
  room.pendingPresentationAcks = new Set(members); room.pendingSelectionAcks = new Set(members);
  for (let i = 0; i < 5; i++) assert.equal(room.spectators.join(socket('s' + i)).success, true);
  assert.equal(room.spectators.join(socket('full')).success, false);
  assert.equal(room.spectators.join(socket('p0')).success, false);
  assert.equal(Object.keys(room.players).length, 10); assert.deepEqual(room.memberIds, members);
  for (let i = 0; i < 5; i++) room.spectators.leave('s' + i);
  assert.deepEqual([...room.pendingPresentationAcks], members); assert.deepEqual([...room.pendingSelectionAcks], members);
  assert.equal(room.isPaused, false);
});
test('public projection strips nested secrets, private actions, bags and unopened event outcomes', t => {
  const { room } = fixture(t);
  room.currentEvent = { type: 'chest', opened: false, isMimic: true, title: 'Chest', secretRoll: 100, details: { items: [{ id: 'secret' }] } };
  room.players.p0.action = 'unannounced'; room.players.p0.password_hash = 'secret';
  room.players.p0.targetEnemyId = 'unannounced-target';
  room.currentMonster = { id: 'enemy', instanceId: 'enemy', hp: 10, maxHp: 10, name: 'QA', encounterStory: '公開遭遇敘述', privateRoll: 'secret', password_hash: 'secret' };
  room.enemies = [room.currentMonster];
  const state = spectatorState(room), json = JSON.stringify(state);
  for (const key of ['secret', 'isMimic', 'operationContexts', 'password_hash', 'unannounced', 'privateRoll', 'bag']) assert.equal(json.includes(key), false, key);
  assert.equal(state.viewer.spectator, true); assert.equal(state.currentMonster.hp, 10);
  assert.equal(state.players[0].targetEnemyId, undefined);
  assert.equal(state.currentMonster.encounterStory, '公開遭遇敘述');
  assert.deepEqual(publicVisual({ hp: 3, nestedSecret: 'x', targetAfter: { hp: 2, session: 'x' } }), { hp: 3, targetAfter: { hp: 2 } });
});
test('late joining receives a snapshot without replaying prior queues, later queues carry their own boundary', t => {
  const { room, socket, wire } = fixture(t);
  room.handleBattleEvent(null, false, { col: 1, rng: () => .8 });
  wire.length = 0; room.spectators.join(socket('s0'));
  assert.equal(wire.filter(p => p.event === 'battle:presentation_queue').length, 0);
  const initial = wire.find(p => p.event === 'room:update').data;
  assert.equal(initial.battleRound, room.battleRound);
  room.publishCombatQueue([{ type: 'status_cleanup', hpSnapshotBefore: room.getHpSnapshot(), hpSnapshot: room.getHpSnapshot() }]);
  const packet = wire.find(p => p.channel === 'spectators:WATCH' && p.event === 'battle:presentation_queue').data;
  assert.equal(packet.spectatorState.battlePresentationId, packet.presentationId);
  assert.equal(packet.queue[0].hpSnapshot.players.length, 1);
  assert.equal(room.pendingPresentationAcks.has('s0'), false);
});
for (const role of Object.keys(CLASSES)) test(`${role}: spectator projection retains authoritative combat results and HP boundaries`, t => {
  const { room, socket, wire } = fixture(t);
  room.selectRole('p0', role); room.spectators.join(socket('s0'));
  room.handleBattleEvent(null, false, { col: 1, rng: () => .8 });
  if (room.selectionState === 'RESOLVING') { room.pendingPresentationAcks.clear(); room.finishTurnPresentation(); }
  room.handleSelectionReady('p0', room.battleRound);
  assert.equal(room.lockAction('p0', 'basic', null, room.currentMonster.instanceId).success, true);
  const original = wire.findLast(p => p.channel === 'WATCH' && p.event === 'battle:presentation_queue')?.data;
  const observed = wire.findLast(p => p.channel === 'spectators:WATCH' && p.event === 'battle:presentation_queue')?.data;
  assert.ok(original); assert.ok(observed);
  const signature = queue => queue.map(step => ({ type: step.type, sourceId: step.sourceId,
    before: step.hpSnapshotBefore?.players.map(p => [p.id, p.hp, p.tempHp]),
    after: step.hpSnapshot?.players.map(p => [p.id, p.hp, p.tempHp]),
    results: step.results.map(r => Object.fromEntries(['kind', 'resultId', 'sourceId', 'targetId', 'targetRelation',
      'actualDamage', 'actualHpDamage', 'actualAbsorbed', 'actualBloodsongAbsorbed', 'actualHeal', 'actualShield'].map(k => [k, r[k]]))) }));
  assert.deepEqual(signature(observed.queue), signature(original.queue));
});
test('observing never enters a checkpoint; five receivers share one projection and serialization', t => {
  const { room, socket, wire } = fixture(t, 10);
  room.adventureId = '11111111-1111-4111-8111-111111111111'; room.startAdventure(room.leaderId, { skipPrepShop: true });
  room.startRouteSelection({ skipIntro: true });
  for (let i = 0; i < 5; i++) room.spectators.join(socket('s' + i));
  const snapshot = JSON.stringify(createRoomSnapshot(room));
  assert.equal(snapshot.includes('spectators'), false);
  for (let i = 0; i < 5; i++) room.spectators.leave('s' + i);
  metrics.enabled = true; t.after(() => { metrics.enabled = false; });
  const baselineStart = performance.now(); wire.length = 0;
  for (let i = 0; i < 100; i++) room.broadcastState();
  const baselineMs = performance.now() - baselineStart;
  const memberStateBytes = Buffer.byteLength(JSON.stringify(wire[0].data));
  for (let i = 0; i < 5; i++) room.spectators.join(socket('s' + i));
  metrics.enabled = true; const start = performance.now(); wire.length = 0;
  for (let i = 0; i < 100; i++) room.broadcastState();
  metrics.enabled = false;
  const packets = wire.filter(p => p.channel === 'spectators:WATCH');
  assert.equal(packets.length, 100);
  t.diagnostic(JSON.stringify({ broadcasts: 100, players: 10, spectators: 5, baselineMs: +baselineMs.toFixed(2), memberStateBytes, elapsedMs: +(performance.now() - start).toFixed(2),
    publicStateBytes: Buffer.byteLength(JSON.stringify(packets[0].data)), projection: metrics.snapshot()['spectator.broadcast.ms'] }));
});
