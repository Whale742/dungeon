import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { io } from 'socket.io-client';

const token = 'local-integration-test-token';
export async function launch(t, enabled = true) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url), windowsHide: true,
    env: { ...process.env, PORT: String(port), DEV_TOOLS_ENABLED: String(enabled), DEV_ACCESS_TOKEN: token,
      SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', SUPABASE_PUBLISHABLE_KEY: '' },
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
  async function connect(devMode = false) {
    const socket = io(url, { auth: { devMode }, transports: ['websocket'], reconnection: false });
    clients.push(socket);
    await once(socket, 'connect');
    return socket;
  }
  return { url, connect };
}
export function request(socket, event, data) {
  return new Promise((resolve, reject) => {
    const ack = (error, result) => error ? reject(error) : resolve(result);
    if (data === undefined) socket.timeout(3000).emit(event, ack);
    else socket.timeout(3000).emit(event, data, ack);
  });
}

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
