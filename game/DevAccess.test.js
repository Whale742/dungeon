import test from 'node:test';
import assert from 'node:assert/strict';
import { DevAccess } from './DevAccess.js';

const token = 'test-only-secret-123456789';
const setup = () => {
  const socket = { id: 'one' };
  const room = { isDev: true, state: 'CHOOSING_ROUTE', leaderId: 'one', memberIds: ['one'], players: { one: { connected: true } } };
  return { socket, room, access: new DevAccess({ DEV_TOOLS_ENABLED: 'true', DEV_ACCESS_TOKEN: token }) };
};

test('Dev defaults off and requires an explicit flag and a strong enough token', () => {
  for (const env of [{}, { DEV_TOOLS_ENABLED: 'true' }, { DEV_ACCESS_TOKEN: token }, { DEV_TOOLS_ENABLED: 'true', DEV_ACCESS_TOKEN: 'short' }]) {
    assert.equal(new DevAccess(env).enabled, false);
  }
});

test('grant requires correct token, active solo candidate and exact socket/room identity', () => {
  const { socket, room, access } = setup();
  assert.equal(access.authorize(socket, room, 'wrong').success, false);
  assert.equal(access.authorized(socket, room), false);
  assert.equal(access.authorize(socket, { ...room, isDev: false }, token).success, false);
  assert.equal(access.authorize(socket, { ...room, state: 'LOBBY' }, token).success, false);
  assert.equal(access.authorize(socket, room, token).success, true);
  assert.equal(access.authorized(socket, room), true);
  assert.equal(access.authorized({ id: socket.id }, room), false);
  assert.equal(access.authorized(socket, { ...room }), false);
  room.players.one.connected = false;
  assert.equal(access.authorized(socket, room), false);
  room.players.one.connected = true;
  access.revoke(socket);
  assert.equal(access.authorized(socket, room), false);
});

test('token guessing is bounded per connection', () => {
  const { socket, room, access } = setup();
  for (let i = 0; i < 5; i++) access.authorize(socket, room, 'wrong');
  assert.match(access.authorize(socket, room, token).message, /嘗試過多/);
});
