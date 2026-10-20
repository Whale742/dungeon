import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const URL = process.env.UI_ORIGIN || 'http://127.0.0.1:3000';

function connectSocket(name) {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { timeout: 5000, reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function emitPromise(socket, event, data, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ack on ${event}`)), timeoutMs);
    const cb = res => {
      clearTimeout(timer);
      resolve(res);
    };
    if (data === undefined) {
      socket.emit(event, cb);
    } else {
      socket.emit(event, data, cb);
    }
  });
}

async function run() {
  console.log('Connecting socket clients to', URL);
  const s1 = await connectSocket('Player1');
  const s2 = await connectSocket('Player2');
  console.log('Sockets connected:', s1.id, s2.id);

  try {
    // 1. Room Creation & Joining
    const createRes = await emitPromise(s1, 'room:create', { name: '蒼藍隊長', avatar: null });
    assert.equal(createRes?.success, true, 'Room creation failed');
    const roomCode = createRes.roomCode;
    console.log('Room created successfully:', roomCode);

    const joinRes = await emitPromise(s2, 'room:join', { code: roomCode, name: '蒼藍隊友', avatar: null });
    assert.equal(joinRes?.success, true, 'Room join failed');
    console.log('Player 2 joined room:', roomCode);

    // 2. Role Selection & Ready
    const role1Res = await emitPromise(s1, 'player:select_role', { roleKey: 'warrior' });
    assert.equal(role1Res?.success, true, 'Player 1 select warrior failed');

    const role2Res = await emitPromise(s2, 'player:select_role', { roleKey: 'druid' });
    assert.equal(role2Res?.success, true, 'Player 2 select druid failed');

    const readyRes = await emitPromise(s2, 'room:toggle_ready');
    assert.equal(readyRes?.success, true, 'Player 2 ready failed');
    console.log('Roles selected and squad ready');

    // 3. Start Game
    let currentState = null;
    s1.on('game_update', state => { currentState = state; });
    const startRes = await emitPromise(s1, 'game:start');
    assert.equal(startRes?.success, true, 'Start game failed');
    console.log('Game started');

    // Wait for route state
    await new Promise(r => setTimeout(r, 600));

    // Fast-forward prologue if active
    if (currentState?.isPrologue) {
      await emitPromise(s1, 'prologue:skip');
      await new Promise(r => setTimeout(r, 400));
    }

    // Accelerated / interaction ready for route
    s1.emit('route:interaction_ready', { presentationId: currentState?.routePresentationId });
    s2.emit('route:interaction_ready', { presentationId: currentState?.routePresentationId });
    await new Promise(r => setTimeout(r, 600));

    // 4. Multi-Player Route Vote
    if (currentState?.state === 'CHOOSING_ROUTE' && currentState.currentRoutes?.length) {
      const targetRoute = currentState.currentRoutes[0].id;
      const vote1 = await emitPromise(s1, 'route:vote', { routeId: targetRoute });
      assert.equal(vote1?.success, true, 'Vote 1 failed');
      const vote2 = await emitPromise(s2, 'route:vote', { routeId: targetRoute });
      assert.equal(vote2?.success, true, 'Vote 2 failed');
      console.log('Multi-player route votes successfully cast for route:', targetRoute);
    }

    console.log('Interactive socket tests completed successfully!');
  } finally {
    s1.disconnect();
    s2.disconnect();
  }
}

run().then(() => {
  console.log('All socket tests passed.');
  process.exit(0);
}).catch(err => {
  console.error('Socket verification error:', err);
  process.exit(1);
});
