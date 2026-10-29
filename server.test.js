import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { io } from 'socket.io-client';

const token = 'local-integration-test-token';
export async function launch(t, enabled = true, extraEnv = {}) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url), windowsHide: true,
    env: { ...process.env, PORT: String(port), DEV_TOOLS_ENABLED: String(enabled), DEV_ACCESS_TOKEN: token,
      SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', SUPABASE_PUBLISHABLE_KEY: '', IDENTITY_STORE: 'memory', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const clients = [];
  t.after(async () => {
    for (const s of clients) s.disconnect();
    const done = once(child, 'exit');
    child.kill();
    await done;
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Server startup timeout: ' + output)), 30000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
    child.stderr.on('data', data => { output += data.toString(); });
    child.stdout.on('data', data => { output += data.toString(); if (output.includes('0.0.0.0')) { clearTimeout(timer); resolve(); } });
  });
  const url = `http://127.0.0.1:${port}`;
  async function connect(devMode = false, cookie = null) {
    if (!cookie) {
      const guest = await fetch(url + '/api/player/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      cookie = guest.headers.get('set-cookie').split(';')[0];
    }
    const socket = io(url, { extraHeaders: { Cookie: cookie }, auth: { devMode }, transports: ['websocket'], reconnection: false });
    socket.sessionCookie = cookie;
    socket.on('player:identity', ({ player }) => { socket.playerId = player.playerId; });
    clients.push(socket);
    await once(socket, 'connect');
    return socket;
  }
  return { url, connect };
}
export function request(socket, event, data) {
  return new Promise((resolve, reject) => {
    const ack = (error, result) => error ? reject(new Error(event + ': ' + error.message)) : resolve(result);
    if (data === undefined) socket.timeout(3000).emit(event, ack);
    else socket.timeout(3000).emit(event, data, ack);
  });
}

for (const [count, observers] of [[1, 1], [4, 1], [10, 5]]) test(`${count} saved members/${observers} late observers preserve checkpoint and leader termination ACK follows commit`, { timeout: 25000 }, async t => {
  const { connect } = await launch(t, false);
  const leader = await connect(), code = (await request(leader, 'room:create', {})).roomCode;
  const roles = ['warrior', 'mage', 'archer', 'assassin', 'bard', 'alchemist', 'druid', 'samurai', 'sage', 'augur'];
  const members = [leader, ...await Promise.all(Array.from({ length: count - 1 }, () => connect()))];
  for (const [i, member] of members.entries()) {
    if (i) assert.equal((await request(member, 'room:join', { code })).success, true);
    await request(member, 'player:select_role', { roleKey: roles[i] });
    if (i) await request(member, 'room:toggle_ready');
  }
  await request(leader, 'game:start'); await request(leader, 'prologue:skip');
  for (const member of members) await request(member, 'event:shop_action', { action: 'leave' });
  const stateOf = async member => {
    const update = once(member, 'room:update', { signal: t.signal }); member.emit('room:resync'); return (await update)[0];
  };
  const before = await stateOf(leader); assert.equal(before.checkpoint.status, 'saved');
  const watchers = await Promise.all(Array.from({ length: observers }, () => connect()));
  for (const watcher of watchers) assert.equal((await request(watcher, 'spectator:join', { code })).success, true);
  const after = await stateOf(leader);
  assert.deepEqual(after.checkpoint, before.checkpoint); assert.equal(after.players.length, count);
  if (count > 1) assert.equal((await request(members[1], 'game:end_battle', {})).success, false);
  const ended = watchers.map(watcher => once(watcher, 'spectator:ended', { signal: t.signal }));
  assert.equal((await request(leader, 'game:end_battle', {})).success, true); await Promise.all(ended);
  const final = await stateOf(leader); assert.equal(final.checkpoint.status, 'ended'); assert.equal(final.state, 'GAME_OVER');
  assert.equal((await request(leader, 'game:end_battle', {})).success, true);
  assert.equal((await request(leader, 'adventure:restore', { adventureId: before.adventureId })).code, 'ENDED');
});

test('ten members plus five spectator sockets are separate, capped, read-only and can reconnect without blocking members', { timeout: 40000 }, async t => {
  const { connect } = await launch(t, false);
  const leader = await connect(), code = (await request(leader, 'room:create', {})).roomCode;
  await request(leader, 'player:select_role', { roleKey: 'warrior' });
  const members = await Promise.all(Array.from({ length: 9 }, () => connect()));
  const roles = ['mage', 'archer', 'assassin', 'bard', 'alchemist', 'druid', 'samurai', 'sage', 'augur'];
  for (const [i, member] of members.entries()) {
    assert.equal((await request(member, 'room:join', { code })).success, true);
    await request(member, 'player:select_role', { roleKey: roles[i] }); await request(member, 'room:toggle_ready');
  }
  const observers = await Promise.all(Array.from({ length: 6 }, () => connect()));
  for (const observer of observers.slice(0, 5)) {
    const state = once(observer, 'room:update');
    assert.equal((await request(observer, 'spectator:join', { code })).success, true);
    assert.equal((await state)[0].viewer.spectator, true);
  }
  assert.equal((await request(observers[5], 'spectator:join', { code })).success, false);
  const blocked = ['room:create', 'room:join', 'player:select_role', 'room:toggle_ready', 'game:start', 'route:vote',
    'route:interaction_ready', 'battle:lock', 'battle:unlock', 'battle:select_target', 'battle:presentation_complete',
    'battle:selection_ready', 'event:shop_action', 'inventory:craft', 'inventory:use_item', 'leave_party', 'adventure:restore',
    'adventure:detach', 'game:toggle_pause', 'game:end_battle', 'game:restart', 'dev:command', 'player:update_avatar', 'narrative:accelerate'];
  for (const event of blocked) assert.equal((await request(observers[0], event, {})).success, false, event);
  assert.equal((await request(observers[0], 'player:career', {})).stats.battles, 0);
  assert.equal((await request(leader, 'game:start')).success, true);
  await request(leader, 'prologue:skip'); await request(leader, 'event:shop_action', { action: 'leave' });
  for (const member of members) await request(member, 'event:shop_action', { action: 'leave' });
  const updated = once(observers[0], 'room:update'); observers[0].emit('room:resync');
  const state = (await updated)[0]; assert.equal(state.players.length, 10); assert.equal(state.operationContexts, undefined);
  const cookie = observers[0].sessionCookie;
  observers[0].disconnect();
  const reconnect = await connect(false, cookie);
  assert.equal((await request(reconnect, 'spectator:join', { code })).success, true);
  assert.equal((await request(reconnect, 'spectator:leave')).success, true);
  assert.equal((await request(reconnect, 'room:create', {})).success, true);
  // Closing the formal party ends observers without granting them membership.
  const ended = once(observers[1], 'spectator:ended');
  for (const member of members) await request(member, 'leave_party');
  await request(leader, 'leave_party'); await ended;
  assert.equal((await request(observers[1], 'room:create', {})).success, true);
});

test('adventure sockets enforce member authorization, active-room reuse, detach and permanent withdrawal', { timeout: 20000 }, async t => {
  const { connect } = await launch(t, false);
  const [leader, member, outsider] = await Promise.all([connect(), connect(), connect()]);
  const created = await request(leader, 'room:create', {});
  await request(member, 'room:join', { code: created.roomCode });
  await request(leader, 'player:select_role', { roleKey: 'warrior' });
  await request(member, 'player:select_role', { roleKey: 'mage' });
  await request(member, 'room:toggle_ready');
  const stateOf = async socket => {
    await request(socket, 'room:list'); const updated = once(socket, 'room:update', { signal: t.signal });
    socket.emit('room:resync'); return (await updated)[0];
  };
  await request(leader, 'game:start');
  await request(leader, 'prologue:next'); await request(member, 'prologue:next');
  await request(leader, 'event:shop_action', { action: 'leave' }); await request(member, 'event:shop_action', { action: 'leave' });
  const saved = await stateOf(leader);
  assert.equal(saved.checkpoint.status, 'saved'); assert.equal(saved.checkpoint.saveVersion, 1);
  assert.equal((await request(outsider, 'adventure:restore', { adventureId: saved.adventureId })).success, false);
  assert.equal((await request(leader, 'room:create', {})).success, false);
  const original = saved.players.find(p => p.id === member.playerId);
  await request(member, 'adventure:detach');
  const offline = await stateOf(leader);
  assert.equal(offline.players.find(p => p.id === member.playerId).connected, false);
  const restored = await request(member, 'adventure:restore', { adventureId: saved.adventureId });
  assert.equal(restored.success, true); assert.equal(restored.roomCode, created.roomCode);
  const online = await stateOf(member);
  assert.equal(online.players.length, 2); assert.equal(online.routePresentationId, saved.routePresentationId);
  assert.equal(online.players.find(p => p.id === member.playerId).hp, original.hp);
  assert.equal(online.checkpoint.saveVersion, 1);
  assert.equal((await request(member, 'leave_party')).success, true);
  assert.equal((await request(member, 'adventure:restore', { adventureId: saved.adventureId })).success, false);
  assert.equal((await request(leader, 'game:end_battle')).success, true);
  await request(leader, 'room:list');
  const terminal = await stateOf(leader);
  assert.equal(terminal.checkpoint.status, 'ended'); assert.equal(terminal.checkpoint.saveVersion, 1);
  assert.equal((await request(outsider, 'adventure:restore', { adventureId: saved.adventureId })).success, false);
});

test('a new device lists and rejoins the same account adventure without local cache or duplicate roles', { timeout: 25000 }, async t => {
  const { connect, url } = await launch(t, false);
  const [leader, member, outsider] = await Promise.all([connect(), connect(), connect()]);
  const code = (await request(leader, 'room:create', {})).roomCode;
  await request(member, 'room:join', { code });
  await request(leader, 'player:select_role', { roleKey: 'warrior' });
  await request(member, 'player:select_role', { roleKey: 'mage' }); await request(member, 'room:toggle_ready');
  await request(leader, 'game:start'); await request(leader, 'prologue:next'); await request(member, 'prologue:next');
  await request(leader, 'event:shop_action', { action: 'leave' }); await request(member, 'event:shop_action', { action: 'leave' });
  const api = async (action, body, cookie) => {
    const response = await fetch(url + '/api/player/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
    assert.equal(response.status, 200); return { data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const bound = await api('bind', { username: 'phase3_account', password: 'qa-only-password-123' }, leader.sessionCookie);
  assert.equal(bound.data.player.playerId, leader.playerId);
  const login = await api('login', { username: 'phase3_account', password: 'qa-only-password-123' });
  const device = await connect(false, login.cookie);
  await request(device, 'room:list');
  assert.equal(device.playerId, leader.playerId);
  assert.equal((await request(device, 'player:career', {})).stats.adventures, 1);
  assert.equal((await request(outsider, 'player:career', { playerId: device.playerId, damage: 99999 })).stats.adventures, 0);
  await request(device, 'adventure:detach');
  const list = await request(device, 'adventure:list', {});
  assert.equal(list.adventures.length, 1); assert.equal(list.adventures[0].memberCount, 2); assert.equal(list.adventures[0].isLeader, true);
  const id = list.adventures[0].id;
  // A peer reconnecting must not pull an intentionally detached player back in.
  assert.equal((await request(member, 'adventure:restore', { adventureId: id })).success, true);
  assert.equal((await request(device, 'room:create', {})).success, true);
  await request(device, 'leave_party');
  const spoof = await request(outsider, 'adventure:list', { playerId: leader.playerId });
  assert.deepEqual(spoof.adventures, []);
  assert.equal((await request(outsider, 'adventure:restore', { adventureId: id })).success, false);
  assert.equal((await request(device, 'adventure:restore', { adventureId: id })).roomCode, code);
  assert.equal((await request(member, 'room:transfer_leader', { targetId: device.playerId })).success, false);
  assert.equal((await request(device, 'room:transfer_leader', { targetId: member.playerId })).success, true);
  const transferred = await request(member, 'adventure:list', {});
  assert.equal(transferred.adventures[0].isLeader, true); assert.equal(transferred.adventures[0].saveVersion, 1);
  await api('name', { displayName: '新隊長' }, member.sessionCookie);
  assert.equal((await request(device, 'adventure:list', {})).adventures[0].leaderName, '新隊長');
  await request(device, 'room:list'); const update = once(device, 'room:update', { signal: t.signal }); device.emit('room:resync');
  const state = (await update)[0]; assert.equal(state.players.length, 2);
  assert.equal(state.players.find(p => p.id === device.playerId).role, 'warrior');
  assert.equal(state.leaderId, member.playerId);
  assert.equal((await request(device, 'adventure:list', { offset: -1 })).success, false);
});

test('four real sockets use permanent IDs for route ACKs, reconnect barriers and voting', { timeout: 20000 }, async t => {
  const { connect } = await launch(t, false);
  const clients = await Promise.all(Array.from({ length: 4 }, () => connect()));
  const stateOf = async client => {
    // Drain earlier broadcasts on this transport before observing the resync.
    await request(client, 'room:list');
    const updated = once(client, 'room:update', { signal: t.signal }); client.emit('room:resync'); return (await updated)[0];
  };
  const created = await request(clients[0], 'room:create', { name: 'Route party' });
  for (let i = 0; i < clients.length; i++) {
    if (i) assert.equal((await request(clients[i], 'room:join', { code: created.roomCode })).success, true);
    assert.equal((await request(clients[i], 'player:select_role', { roleKey: ['warrior', 'mage', 'archer', 'assassin'][i] })).success, true);
    if (i) assert.equal((await request(clients[i], 'room:toggle_ready')).success, true);
  }
  assert.equal((await request(clients[0], 'game:start')).success, true);
  for (const client of clients) await request(client, 'prologue:next');
  for (const client of clients) assert.equal((await request(client, 'event:shop_action', { action: 'leave' })).success, true);
  const state = await stateOf(clients[0]);
  assert.equal(state.state, 'CHOOSING_ROUTE'); assert.ok(state.routeNarrative[0]);
  const id = state.routePresentationId, routeId = state.currentRoutes[0].id;
  assert.ok(state.players.every(p => !clients.some(s => s.id === p.id)));
  assert.ok(state.players.every(p => clients.some(s => s.playerId === p.id)));
  assert.equal((await request(clients[0], 'route:vote', { routeId })).success, false);
  clients[0].emit('route:interaction_ready', { presentationId: id - 1 });
  clients[1].emit('route:interaction_ready', { presentationId: id });
  assert.equal((await stateOf(clients[1])).isNarrating, true);
  const cookie = clients[0].sessionCookie;
  const offline = once(clients[1], 'room:update', { signal: t.signal }); clients[0].disconnect(); await offline;
  const leader = await connect(false, cookie);
  for (const client of clients.slice(1)) {
    client.emit('route:interaction_ready', { presentationId: id });
    await request(client, 'room:list');
  }
  assert.equal((await stateOf(clients[3])).isNarrating, true);
  leader.emit('route:interaction_ready', { presentationId: id });
  const ready = await stateOf(leader);
  assert.equal(ready.isNarrating, false); assert.equal(ready.isPaused, false); assert.equal(ready.leaderId, leader.playerId);
  const progressed = new Promise(resolve => {
    const listener = state => { if (state.state !== 'CHOOSING_ROUTE') { leader.off('room:update', listener); resolve(state); } };
    leader.on('room:update', listener); t.after(() => leader.off('room:update', listener));
  });
  for (const client of [leader, ...clients.slice(1)]) assert.equal((await request(client, 'route:vote', { routeId })).success, true);
  assert.notEqual((await progressed).state, 'CHOOSING_ROUTE');
});

test('ten connected clients receive versioned full state, explicit rejection ACKs and resync after rejoin', async t => {
  const { connect } = await launch(t, false);
  const clients = await Promise.all(Array.from({ length: 10 }, () => connect()));
  const created = await request(clients[0], 'room:create', { name: 'Sync0' });
  for (let i = 1; i < clients.length; i++) {
    assert.equal((await request(clients[i], 'room:join', { code: created.roomCode, name: `Sync${i}` })).success, true);
  }
  for (const client of clients) {
    const full = once(client, 'room:update'); client.emit('room:resync');
    const [state] = await full;
    assert.equal(state.players.length, 10); assert.ok(state.stateVersion > 0);
    const rejection = await request(client, 'battle:lock', { requestId: 'reject', sequence: 1, context: state.operationContexts.lock, actionId: 'skip' });
    assert.equal(rejection.success, false); assert.equal(rejection.requestId, 'reject');
    const duplicate = await request(client, 'battle:lock', { requestId: 'reject', sequence: 1, context: state.operationContexts.lock, actionId: 'skip' });
    assert.deepEqual(duplicate, rejection);
  }
  const removed = once(clients[0], 'room:update'); clients[9].disconnect(); await removed;
  const replacement = await connect(false, clients[9].sessionCookie);
  const rejoined = once(replacement, 'room:update');
  assert.equal((await request(replacement, 'room:join', { code: created.roomCode, name: 'Sync9' })).success, true);
  const [state] = await rejoined; assert.equal(state.players.length, 10); assert.ok(state.operationContexts);
  const full = once(replacement, 'room:update'); replacement.emit('room:resync');
  assert.deepEqual((await full)[0], state);
});

test('Dev route shares HTML; isolated solo rooms and socket-scoped authorization', async t => {
  const { url, connect } = await launch(t);
  const home=await (await fetch(url + '/')).text();
  assert.equal(await (await fetch(url + '/dev')).text(), home);
  assert.ok(!home.includes('href="battle-hud.css"'));
  const combatStyles=await fetch(url+'/css/combat/combat.css');assert.equal(combatStyles.status,200);assert.match(combatStyles.headers.get('content-type'),/text\/css/);
  assert.equal((await fetch(url + '/dev/', { redirect: 'manual' })).status, 302);
  const normal = await connect();
  const dev = await connect(true);
  const outsider = await connect();
  const publicRoom = await request(normal, 'room:create', { name: 'Public' });
  const privateRoom = await request(dev, 'room:create', { name: 'Dev' });
  assert.equal(privateRoom.success, true);
  const listed = (await request(outsider, 'room:list')).rooms;
  assert.ok(listed.some(r => r.code === publicRoom.roomCode));
  assert.ok(!listed.some(r => r.code === privateRoom.roomCode));
  assert.equal((await request(outsider, 'room:join', { code: privateRoom.roomCode, name: 'Intruder' })).success, false);
  assert.equal((await request(dev, 'dev:authorize', { token })).success, false);
  await request(dev, 'player:select_role', { roleKey: 'warrior' });
  await request(dev, 'game:start');
  assert.equal((await request(dev, 'dev:authorize', { token: 'wrong' })).success, false);
  assert.equal((await request(dev, 'dev:authorize', { token })).success, true);
  const status = await request(dev, 'dev:inspect');
  assert.equal(status.success, true);
  const command = { id: 'test-command', roomCode: privateRoom.roomCode, context: status.context, command: 'gold.set', params: { value: 123 } };
  assert.equal((await request(dev, 'dev:command', command)).success, false); // prologue is locked
  assert.equal((await request(normal, 'dev:command', command)).success, false);
  assert.equal((await request(outsider, 'dev:inspect')).success, false);
  assert.equal((await request(normal, 'dev:authorize', { token })).success, false);
  dev.disconnect();
  const reconnected = await connect(true);
  assert.equal((await request(reconnected, 'dev:authorize', { token })).success, false);
});

test('disabled Dev leaves normal room flow available', async t => {
  const { url, connect } = await launch(t, false);
  assert.equal((await fetch(url + '/')).status, 200);
  assert.equal((await fetch(url + '/dev')).status, 404);
  const dev = await connect(true);
  assert.equal((await request(dev, 'room:create', { name: 'Dev' })).success, false);
  const normal = await connect();
  assert.equal((await request(normal, 'room:create', { name: 'Normal' })).success, true);
  await request(normal, 'player:select_role', { roleKey: 'warrior' });
  assert.equal((await request(normal, 'game:start')).success, true);
});

test('identity API binds the same character, supports device login, rotates passwords and rejects forged sessions', async t => {
  const { url, connect } = await launch(t, false);
  const api = async (action, body, cookie) => {
    const response = await fetch(url + '/api/player/' + action, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], cookieHeader: response.headers.get('set-cookie') };
  };
  const guest = await api('guest', { displayName: 'Original' });
  assert.match(guest.cookie, /^dungeon_session=/);
  assert.match(guest.cookieHeader, /HttpOnly/); assert.match(guest.cookieHeader, /SameSite=Lax/);
  const first = await connect(false, guest.cookie);
  const created = await request(first, 'room:create', { name: 'Impersonation name' });
  await request(first, 'player:select_role', { roleKey: 'warrior' });
  const id = guest.body.player.playerId;
  assert.equal((await api('session', undefined, guest.cookie)).body.player.playerId, id);
  const impostorGuest = await api('guest', { displayName: 'Original' });
  assert.notEqual(impostorGuest.body.player.playerId, id);
  const impostor = await connect(false, impostorGuest.cookie);
  await request(impostor, 'room:join', { code: created.roomCode, name: 'Original', playerId: id });
  await request(impostor, 'player:select_role', { roleKey: 'mage', playerId: id });
  const actors = once(first, 'room:update'); first.emit('room:resync'); const [twoPlayers] = await actors;
  assert.equal(twoPlayers.players.find(p => p.id === id).role, 'warrior');
  assert.equal(twoPlayers.players.find(p => p.id === impostorGuest.body.player.playerId).role, 'mage');
  await request(impostor, 'leave_party');
  const bound = await api('bind', { username: 'account_one', password: 'Test password long enough' }, guest.cookie);
  assert.equal(bound.status, 200); assert.equal(bound.body.player.playerId, id); assert.ok(bound.body.recoveryCode);
  assert.equal((await api('session', undefined, guest.cookie)).body.player, null);
  const restored = await connect(false, bound.cookie);
  const full = once(restored, 'room:update'); restored.emit('room:resync'); const [state] = await full;
  assert.equal(state.code, created.roomCode); assert.equal(state.players.length, 1);
  assert.equal(state.players[0].id, id); assert.equal(state.players[0].role, 'warrior'); assert.equal(state.players[0].name, 'Original');
  const name = await api('name', { displayName: 'Renamed' }, bound.cookie);
  assert.equal(name.body.player.playerId, id);
  const login = await api('login', { username: 'ACCOUNT_ONE', password: 'Test password long enough' });
  assert.equal(login.body.player.playerId, id);
  const disconnected = once(restored, 'disconnect');
  const otherDevice = await connect(false, login.cookie); await disconnected;
  const snapshot = once(otherDevice, 'room:update'); otherDevice.emit('room:resync');
  assert.equal((await snapshot)[0].players.length, 1);
  assert.equal((await api('password', { currentPassword: 'wrong', password: 'New password long enough' }, login.cookie)).status, 401);
  const changed = await api('password', { currentPassword: 'Test password long enough', password: 'New password long enough' }, login.cookie);
  assert.equal(changed.status, 200); assert.equal((await api('session', undefined, bound.cookie)).body.player, null);
  assert.equal((await api('login', { username: 'account_one', password: 'Test password long enough' })).status, 401);
  const recovered = await api('recover', { username: 'account_one', recoveryCode: changed.body.recoveryCode, password: 'Recovered password long enough' });
  assert.equal(recovered.status, 200); assert.equal(recovered.body.player.playerId, id);
  assert.equal((await api('recover', { username: 'account_one', recoveryCode: changed.body.recoveryCode, password: 'Recovered password long enough' })).status, 401);
  assert.equal((await api('logout', {}, recovered.cookie)).status, 200);
  assert.equal((await api('session', undefined, recovered.cookie)).body.player, null);
  const forged = io(url, { extraHeaders: { Cookie: 'dungeon_session=' + 'x'.repeat(43) }, reconnection: false });
  t.after(() => forged.disconnect());
  assert.equal((await once(forged, 'connect_error'))[0].message, 'SESSION_REQUIRED');
  const csrf = await fetch(url + '/api/player/guest', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' }, body: '{}' });
  assert.equal(csrf.status, 403);
});

test('Saved static URLs and canonical paths serve identical files, including encoded names and HEAD', async t => {
  const { url } = await launch(t);
  const shared = await fetch(url + '/js/shared/local-paths.cjs');
  assert.equal(shared.status, 200);
  assert.match(shared.headers.get('content-type'), /javascript/);
  for (const [old, current] of [
    ['/photo/Warrior.webp', '/assets/characters/portraits/Warrior.webp'],
    ['/boss/奇怪的寶箱.webp', '/assets/enemies/elites/奇怪的寶箱.webp'],
    ['/buff%20icon/中毒.webp', '/assets/icons/status/中毒.webp'],
    ['/assets/samurai-fx/zan-full.png', '/assets/combat-fx/samurai/zan-full.png'],
    ['/sound/bgm-normal.mp3', '/assets/sound/bgm/bgm-normal.mp3'],
    ['/phase6-battlefield.css', '/css/presentation/core-role-effects.css'],
    ['/dev-tools.js', '/js/dev/dev-tools.js']
  ]) {
    const before = await fetch(url + old + '?saved=1'), after = await fetch(url + current);
    assert.equal(before.status, 200, old);
    assert.equal(after.status, 200, current);
    assert.equal(before.headers.get('content-type'), after.headers.get('content-type'));
    assert.deepEqual(Buffer.from(await before.arrayBuffer()), Buffer.from(await after.arrayBuffer()));
    const head = await fetch(url + old, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  }
  assert.equal((await fetch(url + '/photo/not-an-asset.webp')).status, 404);
});


test('solo and multiplayer Lobby refresh reuse Player IDs; offline Lobby cleanup does not contaminate Dev ownership', { timeout: 20000 }, async t => {
  const { connect } = await launch(t, true, { ROOM_OFFLINE_GRACE_MS: '150' });
  const leader = await connect();
  const code = (await request(leader, 'room:create', {})).roomCode;
  await request(leader, 'player:select_role', { roleKey: 'warrior' });
  const cookie = leader.sessionCookie, id = leader.playerId; leader.disconnect();
  const fresh = await connect(false, cookie);
  await request(fresh, 'room:list');
  assert.equal(fresh.playerId, id);
  assert.deepEqual((await request(fresh, 'adventure:list', {})).adventures, []);
  assert.equal((await request(fresh, 'room:join', { code })).success, true);
  const peer = await connect(); await request(peer, 'room:join', { code });
  fresh.disconnect();
  const again = await connect(false, cookie); await request(again, 'room:join', { code });
  const update = once(again, 'room:update', { signal: t.signal }); again.emit('room:resync');
  const state = (await update)[0];
  assert.equal(state.state, 'LOBBY'); assert.equal(state.players.length, 2);
  assert.equal(state.players.find(p => p.id === id).role, 'warrior');
  assert.equal((await request(again, 'dev:authorize', { token })).success, false);
  again.disconnect(); peer.disconnect();
  await new Promise(resolve => setTimeout(resolve, 300));
  const dev = await connect(true, cookie);
  assert.equal((await request(dev, 'room:join', { code })).success, false);
  assert.equal((await request(dev, 'room:create', {})).success, true);
  await request(dev, 'player:select_role', { roleKey: 'warrior' });
  assert.equal((await request(dev, 'game:start')).success, true);
  assert.equal((await request(dev, 'dev:authorize', { token })).success, true);
  assert.deepEqual((await request(dev, 'adventure:list', {})).adventures, []);
  assert.equal((await request(dev, 'player:career', {})).stats.adventures, 0);
});

test('spectator sockets apply, reject, approve and become a single formal member only after checkpoint save', { timeout: 20000 }, async t => {
  const { connect } = await launch(t, false);
  const [leader, observer, intruder] = await Promise.all([connect(), connect(), connect()]);
  const code = (await request(leader, 'room:create', {})).roomCode;
  await request(leader, 'player:select_role', { roleKey: 'warrior' });
  await request(leader, 'game:start');
  await request(observer, 'spectator:join', { code });
  const first = await request(observer, 'spectator:apply', {}); assert.equal(first.success, true);
  assert.equal((await request(observer, 'spectator:apply', {})).success, false);
  const review = { playerId: observer.playerId, requestId: first.requestId, approve: false };
  assert.equal((await request(intruder, 'spectator:review', review)).success, false);
  assert.equal((await request(observer, 'spectator:review', review)).success, false);
  assert.equal((await request(leader, 'spectator:review', review)).success, true);
  const second = await request(observer, 'spectator:apply', {});
  assert.equal((await request(leader, 'spectator:review', { ...review, requestId: second.requestId, approve: true })).success, true);
  assert.equal((await request(observer, 'route:vote', { routeId: 'x' })).success, false);
  await request(leader, 'prologue:skip');
  const boundary = once(observer, 'spectator:application', { signal: t.signal });
  await request(leader, 'event:shop_action', { action: 'leave' });
  const application = (await boundary)[0]; assert.equal(application.requests[0].status, 'choosing_role');
  const promoted = once(observer, 'spectator:promoted', { signal: t.signal });
  assert.equal((await request(observer, 'spectator:select_role', { requestId: second.requestId, checkpoint: application.checkpoint, role: 'mage' })).success, true);
  await promoted;
  await request(observer, 'room:list');
  const update = once(observer, 'room:update', { signal: t.signal }); observer.emit('room:resync');
  const state = (await update)[0];
  assert.equal(state.viewer?.spectator, undefined); assert.equal(state.players.length, 2);
  assert.equal(state.players.find(p => p.id === observer.playerId).role, 'mage'); assert.equal(state.checkpoint.status, 'saved');
  assert.equal((await request(observer, 'player:career', {})).stats.battles, 0);
  assert.equal((await request(observer, 'adventure:list', {})).adventures[0].id, state.adventureId);
  assert.equal((await request(observer, 'spectator:apply', {})).success, false);
  leader.emit('route:interaction_ready', { presentationId: state.routePresentationId });
  observer.emit('route:interaction_ready', { presentationId: state.routePresentationId });
  await request(observer, 'room:list'); await request(leader, 'room:list');
  assert.equal((await request(observer, 'route:vote', { routeId: state.currentRoutes[0].id })).success, true);
});


test('Dev entry cannot restore a formal multiplayer adventure; creating Dev detaches without withdrawing its permanent member', { timeout: 20000 }, async t => {
  const { connect } = await launch(t);
  const [leader, peer] = await Promise.all([connect(), connect()]);
  const code = (await request(leader, 'room:create', {})).roomCode;
  await request(peer, 'room:join', { code });
  await request(leader, 'player:select_role', { roleKey: 'warrior' });
  await request(peer, 'player:select_role', { roleKey: 'mage' }); await request(peer, 'room:toggle_ready');
  await request(leader, 'game:start'); await request(leader, 'prologue:skip');
  await request(leader, 'event:shop_action', { action: 'leave' }); await request(peer, 'event:shop_action', { action: 'leave' });
  const id = (await request(leader, 'adventure:list', {})).adventures[0].id;
  const dev = await connect(true, leader.sessionCookie); await request(dev, 'room:list');
  assert.equal(dev.playerId, leader.playerId); assert.notEqual(dev.id, dev.playerId);
  const restored = await request(dev, 'adventure:restore', { adventureId: id });
  assert.equal(restored.success, false, '/dev must not restore a formal room into its control panel');
  const rejected = await request(dev, 'dev:authorize', { token }); assert.equal(rejected.code, 'NOT_DEV_ROOM');
  const created = await request(dev, 'room:create', {}); assert.equal(created.success, true);
  await request(dev, 'player:select_role', { roleKey: 'warrior' }); await request(dev, 'game:start');
  assert.equal((await request(dev, 'dev:authorize', { token })).success, true);
  const update = once(peer, 'room:update', { signal: t.signal }); peer.emit('room:resync');
  const state = (await update)[0]; assert.equal(state.players.length, 2);
  assert.equal(state.players.find(p => p.id === leader.playerId).connected, false);
  assert.equal(state.checkpoint.saveVersion, 1); assert.equal(state.isDev, false);
  assert.equal((await request(peer, 'dev:authorize', { token })).code, 'NOT_DEV_ROOM');
  assert.equal((await request(dev, 'player:career', {})).stats.adventures, 1);
  assert.equal((await request(dev, 'adventure:list', {})).adventures.length, 1);
});


for (const bound of [false, true]) test((bound ? 'bound account' : 'guest') + ': Dev refresh preserves permanent solo identity, reauthorizes current transport and keeps formal stores empty', { timeout: 20000 }, async t => {
  const { url, connect } = await launch(t);
  let dev = await connect(true); await request(dev, 'room:list');
  const id = dev.playerId;
  if (bound) {
    const response = await fetch(url + '/api/player/bind', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: dev.sessionCookie },
      body: JSON.stringify({ username: 'dev_refresh_account', password: 'local-dev-qa-password-123' }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    dev.disconnect(); dev = await connect(true, cookie); await request(dev, 'room:list');
  }
  const code = (await request(dev, 'room:create', {})).roomCode;
  await request(dev, 'player:select_role', { roleKey: 'warrior' }); await request(dev, 'game:start');
  await request(dev, 'prologue:skip'); await request(dev, 'event:shop_action', { action: 'leave' });
  const stateOf = async socket => {
    await request(socket, 'room:list'); const updated = once(socket, 'room:update', { signal: t.signal });
    socket.emit('room:resync'); return (await updated)[0];
  };
  const first = await stateOf(dev); assert.equal(first.isDev, true); assert.equal(first.leaderId, id);
  assert.equal(first.players.length, 1); assert.notEqual(dev.id, id);
  dev.emit('route:interaction_ready', { presentationId: first.routePresentationId }); await request(dev, 'room:list');
  assert.equal((await request(dev, 'dev:authorize', { token })).success, true);
  const before = await request(dev, 'dev:inspect');
  const change = { id: 'refresh-gold', roomCode: code, context: before.context, command: 'gold.set', params: { value: 321 } };
  assert.equal((await request(dev, 'dev:command', change)).success, true);
  const oldTransport = dev.id, cookie = dev.sessionCookie; dev.disconnect();
  const fresh = await connect(true, cookie); await request(fresh, 'room:list');
  assert.equal(fresh.playerId, id); assert.notEqual(fresh.id, oldTransport);
  const state = await stateOf(fresh); assert.equal(state.code, code); assert.equal(state.players.length, 1); assert.equal(state.gold, 321);
  assert.equal((await request(fresh, 'dev:command', change)).code, 'NOT_AUTHORIZED');
  assert.equal((await request(fresh, 'dev:authorize', { token })).success, true);
  const status = await request(fresh, 'dev:inspect'); assert.equal(status.audit.length, 1);
  assert.equal((await request(fresh, 'dev:command', change)).duplicate, true);
  fresh.emit('route:interaction_ready', { presentationId: state.routePresentationId }); await request(fresh, 'room:list');
  const command = async (name, params) => { const status = await request(fresh, 'dev:inspect'); return request(fresh, 'dev:command', {
    id: name.replaceAll('.', '-'), roomCode: code, context: status.context, command: name, params }); };
  const grant = await command('item.grant', { playerId: id, itemId: 'short_sword', bag: 'personal' });
  assert.equal(grant.success, true, grant.message);
  assert.equal((await command('item.equip', { playerId: id, bag: 'personal', index: 0 })).success, true);
  const equipped = await stateOf(fresh); assert.ok(equipped.players[0].equips.some(e => e.id === 'short_sword'));
  assert.deepEqual((await request(fresh, 'adventure:list', {})).adventures, []);
  assert.equal((await request(fresh, 'player:career', {})).stats.adventures, 0);
});
