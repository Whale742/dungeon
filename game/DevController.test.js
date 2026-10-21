import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { DevAccess } from './DevAccess.js';
import { DevController } from './DevController.js';
import { DEV_ENEMIES } from './DevEncounter.js';
import { CLASSES } from './constants.js';
import { roleResources, DEV_ROLE_POLICY } from './DevRoleResources.js';

function setup(t, role = 'warrior') {
  const socket = { id: 'solo', join() {}, emit() {} };
  const room = new Room('TEST1', socket, 'Tester', { to: () => ({ emit() {} }) });
  room.selectRole('solo', role);
  room.isDev = true;
  const access = new DevAccess({ DEV_TOOLS_ENABLED: 'true', DEV_ACCESS_TOKEN: 'test-secret-123456789' });
  const controller = new DevController(access);
  controller.register(room, socket);
  room.startAdventure('solo', { skipPrepShop: true });
  room.handlePrologueComplete('solo');
  room.handleRouteNarrativeDone('solo', room.routePresentationId);
  access.authorize(socket, room, 'test-secret-123456789');
  t.after(() => room.clearTimer());
  let n = 0;
  const request = (command = 'gold.add', params = { value: 10 }) => ({ id: `r${++n}`, roomCode: room.code, context: controller.context(room), command, params });
  return { room, socket, access, controller, request };
}

test('commands deduplicate, reject reused IDs and stale/foreign/unauthorized requests', t => {
  const { room, socket, access, controller: c, request } = setup(t);
  const r = request();
  assert.equal(c.execute(socket, room, r).success, true);
  assert.equal(room.gold, 55);
  assert.equal(c.execute(socket, room, r).duplicate, true);
  assert.equal(room.gold, 55);
  assert.equal(c.execute(socket, room, { ...r, params: { value: 20 } }).success, false);
  assert.equal(c.execute(socket, room, { ...r, id: 'stale' }).success, false);
  assert.equal(c.execute(socket, room, { ...request(), roomCode: 'OTHER' }).success, false);
  access.revoke(socket);
  assert.equal(c.execute(socket, room, request()).success, false);
  assert.equal(room.gold, 55);
});

test('invalid commands and unsafe phases leave authoritative state unchanged', t => {
  const { room, socket, controller: c, request } = setup(t);
  for (const [command, params] of [['eval', { value: 1 }], ['gold.set', { value: -1 }], ['gold.set', { value: 1, path: 'hp' }], ['gold.add', { value: -100 }]]) {
    const before = c.snapshot(room);
    assert.equal(c.execute(socket, room, request(command, params)).success, false);
    assert.deepEqual(c.snapshot(room), before);
  }
  for (const state of ['LOBBY', 'PROLOGUE', 'TRANSITION', 'EVENT', 'BATTLE_VICTORY', 'CHECKPOINT', 'GAME_OVER', 'VICTORY']) {
    room.state = state;
    assert.equal(c.execute(socket, room, request()).success, false);
  }
  room.state = 'CHOOSING_ROUTE';
  room.isNarrating = true;
  assert.equal(c.execute(socket, room, request()).success, false);
  room.isNarrating = false;
  room.routeVotes.solo = 'chosen';
  assert.equal(c.execute(socket, room, request()).success, false);
});

test('single-room lock and invariant rollback; audit separated from game logs', t => {
  const { room, socket, controller: c, request } = setup(t);
  const logs = room.logs.length;
  c.commands.set('broken', { keys: [], validate: () => true, run: r => { r.gold = -1; r.broadcastState(); } });
  assert.equal(c.execute(socket, room, request('broken', {})).success, false);
  assert.equal(room.gold, 45);
  c.rooms.get(room).busy = true;
  assert.equal(c.execute(socket, room, request()).success, false);
  c.rooms.get(room).busy = false;
  assert.equal(c.execute(socket, room, request()).success, true);
  assert.equal(room.logs.length, logs);
  const audit = c.inspect(socket, room).audit;
  assert.equal(audit.length, 2);
  assert.equal(audit[1].before.gold, 45);
  assert.equal(audit[1].after.gold, 55);
});

test('resource controls reuse templates, inventory limits and original equipment rules', t => {
  const { room, socket, controller: c, request } = setup(t);
  const run = (command, params) => c.execute(socket, room, request(command, params));
  const player = room.players.solo;
  const before = player.bonusAtk;
  assert.equal(run('item.grant', { playerId: 'solo', itemId: 'short_sword', bag: 'personal' }).success, true);
  assert.equal(run('item.equip', { playerId: 'solo', bag: 'personal', index: 0 }).success, true);
  assert.equal(player.bonusAtk, before + 4);
  assert.equal(run('item.grant', { playerId: 'solo', itemId: 'hunter_bow', bag: 'personal' }).success, true);
  assert.equal(run('item.equip', { playerId: 'solo', bag: 'personal', index: 0 }).success, true);
  assert.equal(player.bonusAtk, before + 5);
  assert.equal(player.bag[0].id, 'short_sword');
  assert.equal(run('item.grant', { playerId: 'solo', itemId: 'invented', bag: 'personal' }).success, false);
  while (room.players.solo.bag.length < 4) assert.equal(run('item.grant', { playerId: 'solo', itemId: 'short_sword', bag: 'personal' }).success, true);
  const snapshot = c.snapshot(room);
  assert.equal(run('item.grant', { playerId: 'solo', itemId: 'short_sword', bag: 'personal' }).success, false);
  assert.deepEqual(c.snapshot(room), snapshot);
});

test('HP bounds, tracked shields and supported dots survive next round settlement', t => {
  const { room, socket, controller: c, request } = setup(t);
  const run = (command, params) => c.execute(socket, room, request(command, params));
  assert.equal(run('player.hp', { playerId: 'solo', value: 0 }).success, false);
  assert.equal(run('player.hp', { playerId: 'solo', value: room.players.solo.maxHp + 1 }).success, false);
  assert.equal(run('player.hp', { playerId: 'solo', value: 10 }).success, true);
  room.handleBattleEvent(null, false, { col: 1 });
  if (room.selectionState === 'RESOLVING') room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  room.handleSelectionReady('solo', room.battleRound);
  assert.equal(run('player.shield', { playerId: 'solo', value: 20 }).success, true);
  assert.equal(room.players.solo.p8Shields[0].value, 20);
  assert.equal(run('player.status', { playerId: 'solo', status: 'poison', apply: true }).success, true);
  assert.equal(room.players.solo.poisonTurns, 2);
  assert.equal(run('player.status', { playerId: 'solo', status: 'poison', apply: false }).success, true);
  assert.equal(room.players.solo.poisonTurns, 0);
  assert.equal(run('item.equip', { playerId: 'solo', bag: 'personal', index: 3 }).success, false);
  assert.equal(room.currentMonster, room.getPrimaryEnemy());
  assert.equal(run('player.hp', { playerId: 'solo', value: room.players.solo.maxHp }).success, true);
  room.resolveTurnActions();
  room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  assert.equal(room.battleRound, 2);
  assert.ok(Number.isFinite(room.players.solo.hp));
});

test('reserved events use original route transition and consume exactly once', t => {
  for (const type of ['battle', 'shop', 'black_market', 'chest', 'ALTAR', 'GAMBLE', 'REFORGE', 'WANDERING_MERCHANT']) {
    const { room, socket, controller: c, request } = setup(t);
    assert.equal(c.execute(socket, room, request('encounter.reserve', { type, enemyId: '', weakened: false })).success, true);
    assert.equal(room.state, 'CHOOSING_ROUTE');
    assert.equal(room.currentEvent, null);
    room.resolveRouteChoice(room.currentRoutes[0]);
    assert.equal(room.state, 'TRANSITION');
    assert.equal(room.devEncounter, null);
    const transition = room.timerCallback;
    room.clearTimer();
    transition();
    if (type === 'battle') { assert.equal(room.state, 'IN_BATTLE'); assert.ok(room.enemies.every(e => e.tier === 'MINION')); }
    else if (type === 'shop' || type === 'black_market') { assert.equal(room.currentEvent.type, 'shop'); assert.equal(room.currentEvent.isShady, type === 'black_market'); }
    else if (type === 'chest') { assert.equal(room.currentEvent.type, 'chest'); assert.equal(room.currentEvent.isMimic, false); }
    else if (type === 'WANDERING_MERCHANT') assert.equal(room.currentEvent.type, 'shop');
    else { assert.equal(room.currentEvent.subType, type); assert.equal(room.currentEvent.col, room.currentHex.col); }
    room.startRouteSelection({ skipIntro: true });
    assert.equal(room.devEncounter, null);
  }
});

test('reserved weakened boss follows battle start, ACK, rewards and next-floor exploration', t => {
  const { room, socket, controller: c, request } = setup(t);
  assert.equal(c.execute(socket, room, request('encounter.reserve', { type: 'elite', enemyId: 'elite_0', weakened: true })).success, true);
  room.resolveRouteChoice(room.currentRoutes[0]);
  const transition = room.timerCallback;
  room.clearTimer(); transition();
  assert.equal(room.enemies.length, 1);
  assert.equal(room.currentMonster.isWeakened, true);
  assert.equal(room.battleCount, 1);
  assert.equal(room.lockedLeaderRole, 'warrior');
  if (room.selectionState === 'RESOLVING') room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  room.handleSelectionReady('solo', room.battleRound);
  assert.equal(c.execute(socket, room, request('enemy.hp', { enemyId: room.currentMonster.instanceId, value: 0 })).success, false);
  assert.equal(c.execute(socket, room, request('enemy.hp', { enemyId: room.currentMonster.instanceId, value: 1 })).success, true);
  room.players.solo.action = 'basic';
  room.resolveTurnActions();
  assert.equal(room.state, 'IN_BATTLE');
  room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  assert.equal(room.state, 'BATTLE_VICTORY');
  assert.ok(room.currentVictory.goldGain > 0);
  const id = room.currentVictory.presentationId;
  room.handleVictoryComplete('solo', id);
  room.continueAfterVictory('solo', id);
  assert.equal(room.floor, 2);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.devEncounter, null);
});

test('unsupported encounter combinations refuse atomically, cancellation and restart clear reservation', t => {
  const { room, socket, controller: c, request } = setup(t);
  for (const params of [{ type: 'shop', enemyId: 'elite_0', weakened: false }, { type: 'chest', enemyId: '', weakened: true }, { type: 'elite', enemyId: 'missing', weakened: false }]) {
    assert.equal(c.execute(socket, room, request('encounter.reserve', params)).success, false);
    assert.equal(room.devEncounter, undefined);
  }
  const params = { type: 'chest', enemyId: '', weakened: false };
  c.execute(socket, room, request('encounter.reserve', params));
  assert.equal(c.execute(socket, room, request('encounter.clear', {})).success, true);
  assert.equal(room.devEncounter, null);
  c.execute(socket, room, request('encounter.reserve', params));
  room.restartToLobby('solo');
  assert.equal(room.devEncounter, null);
});

test('every exposed boss template uses the original enemy factory and initializes combat', t => {
  for (const enemy of DEV_ENEMIES) {
    const { room, socket, controller: c, request } = setup(t);
    assert.equal(c.execute(socket, room, request('encounter.reserve', { type: 'elite', enemyId: enemy.id, weakened: false })).success, true);
    room.resolveRouteChoice(room.currentRoutes[0]);
    const transition = room.timerCallback;
    room.clearTimer(); transition();
    assert.equal(room.state, 'IN_BATTLE', enemy.name);
    assert.equal(room.currentMonster.originalName, enemy.name);
    assert.equal(room.currentMonster.tier, enemy.tier);
    assert.ok(room.currentMonster.maxHp > 0);
    assert.equal(room.devEncounter, null);
  }
});

test('all roles have a policy and safely settle the next round after supported resource edits', t => {
  for (const role of Object.keys(CLASSES)) {
    assert.ok(DEV_ROLE_POLICY[role], role);
    const { room, socket, controller: c, request } = setup(t, role);
    room.handleBattleEvent(null, false, { col: 1, rng: () => 0 });
    if (room.selectionState === 'RESOLVING') room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
    room.handleSelectionReady('solo', room.battleRound);
    for (const resource of roleResources(room.players.solo)) {
      const params = { playerId: 'solo', resource: resource.key, value: resource.max };
      assert.equal(c.execute(socket, room, request('role.resource', params)).success, true, role);
      assert.equal(roleResources(room.players.solo).find(r => r.key === resource.key).value, resource.max);
      assert.equal(c.execute(socket, room, request('role.resource', { ...params, value: resource.max + 1 })).success, false);
    }
    assert.equal(c.execute(socket, room, request('role.resource', { playerId: 'solo', resource: 'sagePhase', value: 1 })).success, false);
    room.players.solo.action = 'basic';
    room.resolveTurnActions();
    assert.equal(room.selectionState, 'RESOLVING', role);
    room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
    assert.ok(['IN_BATTLE', 'BATTLE_VICTORY'].includes(room.state), role);
    assert.ok(Number.isFinite(room.players.solo.hp), role);
    assert.equal(room.pendingPresentationAcks.size === 0 || room.selectionState === 'RESOLVING' || room.state === 'BATTLE_VICTORY', true, role);
  }
});

test('wrong-role resources, arena and Sage sampling/debt cannot be overwritten', t => {
  const { room, socket, controller: c, request } = setup(t, 'sage');
  room.handleBattleEvent(null, false, { col: 1 });
  if (room.selectionState === 'RESOLVING') room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  room.handleSelectionReady('solo', room.battleRound);
  const params = { playerId: 'solo', resource: 'sageX', value: 40 };
  room.players.solo.sageDebt = 5;
  assert.equal(c.execute(socket, room, request('role.resource', params)).success, false);
  room.players.solo.sageDebt = 0;
  room.players.solo.sageInduction = true;
  room.players.solo.sageSamplingEnded = false;
  assert.equal(c.execute(socket, room, request('role.resource', params)).success, false);
  room.players.solo.sageSamplingEnded = true;
  room.arena = { playerId: 'solo' };
  assert.equal(c.execute(socket, room, request('role.resource', params)).success, false);
  room.arena = null;
  assert.equal(c.execute(socket, room, request('role.resource', { ...params, resource: 'rage' })).success, false);
});
