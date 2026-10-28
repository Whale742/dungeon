import test from 'node:test';
import assert from 'node:assert/strict';
import { Identity, digest, cookieToken, publicPlayer } from './Identity.js';
import { MemoryIdentityStore } from './IdentityStore.js';
import { Room } from './Room.js';
import { disconnectPlayer, reconnectPlayer } from './player-connection.js';

test('permanent guest identity survives binding, rename, credential rotation and session revocation', async () => {
  const store = new MemoryIdentityStore(), identity = new Identity(store);
  const guest = await store.call('create');
  const original = await identity.issue(guest);
  const headers = { cookie: 'dungeon_session=' + original.token };
  assert.equal((await identity.session(headers)).id, guest.id);
  assert.equal((await identity.session({ cookie: 'dungeon_session=' + 'x'.repeat(43) })), null);
  const result = await identity.credentials(guest, 'stable_user', 'Long test password 123');
  assert.equal(result.player.id, guest.id);
  assert.equal(await identity.session(headers), null);
  assert.equal(await identity.verify('Long test password 123', result.player.password_hash), true);
  assert.equal(await identity.verify('wrong', result.player.password_hash), false);
  assert.equal(result.player.recovery_hash, digest(result.recoveryCode));
  assert.equal(publicPlayer(result.player).password_hash, undefined);
  const s = await identity.issue(result.player);
  const renamed = await store.call('name', { id: guest.id, name: 'New name' });
  assert.equal(renamed.id, guest.id);
  assert.equal((await identity.session({ cookie: 'dungeon_session=' + s.token })).display_name, 'New name');
  await assert.rejects(identity.credentials(guest, 'stale', 'Long test password 123'), /身分已變更/);
  const second = await store.call('create');
  await assert.rejects(identity.credentials(second, 'stable_user', 'Long test password 123'));
  store.sessions.get(digest(s.token)).expires = 0;
  assert.equal(await identity.session({ cookie: 'dungeon_session=' + s.token }), null);
});

test('password and username constraints, rate limit and expiry reject malformed inputs', () => {
  let time = 0; const identity = new Identity(new MemoryIdentityStore(), () => time);
  assert.equal(identity.username('Abc_123'), 'abc_123');
  for (const input of ['xx', 'display name', 'ééé', 'a'.repeat(25)]) assert.throws(() => identity.username(input));
  assert.throws(() => identity.password('short'));
  assert.throws(() => identity.name('name\ncontrol'));
  assert.equal(cookieToken({ cookie: 'dungeon_session=short' }), null);
  identity.limit('ip', 1); assert.throws(() => identity.limit('ip', 1), /嘗試過多/);
  time = 60001; identity.limit('ip', 1);
});

test('temporary disconnect preserves role, items, HP, leader and member identity; explicit removal still recovers items', () => {
  const socket = { id: 'permanent-player', join() {}, emit() {}, data: { identity: { display_name: 'Same player' } } };
  const room = new Room('RESUME', socket, 'Same player', { to: () => ({ emit() {} }) });
  room.state = 'EVENT'; room.currentEvent = { type: 'shop' };
  const p = room.players[socket.id]; p.role = 'warrior'; p.hp = 37;
  p.bag = [{ id: 'retained', name: 'Retained' }];
  disconnectPlayer(room, socket.id);
  assert.equal(p.connected, false); assert.equal(p.bag.length, 1); assert.equal(room.squadInventory.length, 0);
  assert.equal(room.isPaused, true);
  reconnectPlayer(room, socket);
  assert.equal(room.players[socket.id], p); assert.equal(p.hp, 37); assert.equal(p.role, 'warrior');
  assert.equal(room.memberIds.length, 1); assert.equal(room.leaderId, socket.id); assert.equal(room.isPaused, false);
  room.removePlayer(socket.id);
  assert.equal(room.players[socket.id], undefined); assert.equal(room.squadInventory[0].id, 'retained');
});
