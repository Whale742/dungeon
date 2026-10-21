import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { DevAccess } from './DevAccess.js';
import { DevController } from './DevController.js';

function setup(t) {
  const socket = { id: 'solo', join() {}, emit() {} };
  const room = new Room('TEST1', socket, 'Tester', { to: () => ({ emit() {} }) });
  room.selectRole('solo', 'warrior');
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
