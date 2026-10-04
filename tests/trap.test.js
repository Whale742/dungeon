import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';

function fixture(t, floor = 1) {
  const io = { to: () => ({ emit() {} }) };
  const socket = id => ({ id, join() {} });
  const room = new Room('TRAP', socket('leader'), 'Leader', io);
  room.addPlayer(socket('member'), 'Member');
  room.selectRole('leader', 'warrior');
  room.selectRole('member', 'mage');
  room.floor = floor;
  t.after(() => room.clearTimer());
  return room;
}

test('authoritative damage keeps scaling, retains lethal targets and pre/impact snapshots', t => {
  const room = fixture(t, 6);
  room.players.member.hp = 5;
  const before = room.players.leader.hp;
  room.handleTrapEvent({ title: 'Trap', story: '喀。' });
  const ev = room.currentEvent;
  assert.equal(ev.hits.length, 2);
  assert.equal(ev.hits[0].damage, 18);
  assert.equal(ev.hpBefore.players.find(p => p.id === 'member').hp, 5);
  assert.equal(ev.hits[0].hpSnapshot.players.find(p => p.id === 'member').hp, 5);
  assert.equal(ev.hpAfter.players.find(p => p.id === 'member').hp, 0);
  assert.equal(room.players.leader.hp, before - 18);
  assert.equal(room.turnTimer, null);
  assert.equal(room.getClientState().timerRemaining, null);
  assert.equal(room.logs.some(log => log.type === 'damage'), false);
});

test('all connected players must ACK exit; stale, unknown and duplicate ACKs do not advance', t => {
  const room = fixture(t);
  room.handleTrapEvent();
  const id = room.currentEvent.presentationId;
  room.handleTrapPresentationComplete('leader', id - 1);
  room.handleTrapPresentationComplete('unknown', id);
  assert.equal(room.pendingPresentationAcks.size, 2);
  room.handleTrapPresentationComplete('leader', id);
  room.handleTrapPresentationComplete('leader', id);
  assert.equal(room.state, 'EVENT');
  assert.equal(room.floor, 1);
  room.handleTrapPresentationComplete('member', id);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.floor, 2);
  assert.equal(room.turnTimer, null);
  room.handleTrapPresentationComplete('member', id);
  assert.equal(room.floor, 2);
});

test('disconnect releases the barrier only after remaining player exits', t => {
  const room = fixture(t);
  room.handleTrapEvent();
  room.removePlayer('member');
  assert.equal(room.state, 'EVENT');
  room.handleTrapPresentationComplete('leader', room.currentEvent.presentationId);
  assert.equal(room.floor, 2);
});

test('wipe waits for fatal impact and exit rather than a three-second timer', t => {
  const room = fixture(t);
  for (const p of Object.values(room.players)) p.hp = 1;
  room.handleTrapEvent();
  const id = room.currentEvent.presentationId;
  assert.equal(room.state, 'EVENT');
  assert.equal(room.turnTimer, null);
  room.handleTrapPresentationComplete('leader', id);
  assert.equal(room.state, 'EVENT');
  room.handleTrapPresentationComplete('member', id);
  assert.equal(room.state, 'GAME_OVER');
});

test('archer presentation records actual random dodge result', t => {
  const room = fixture(t);
  room.selectRole('member', 'archer');
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    room.handleTrapEvent();
    assert.equal(room.currentEvent.hits[1].dodged, true);
    const hp = room.players.member.hp;
    Math.random = () => .999;
    room.handleTrapEvent();
    assert.equal(room.currentEvent.hits[1].dodged, false);
    assert.equal(room.players.member.hp, hp - 15);
  } finally { Math.random = originalRandom; }
});

test('checkpoint timer begins after all trap exit ACKs', t => {
  const room = fixture(t, 5);
  room.handleTrapEvent();
  const id = room.currentEvent.presentationId;
  assert.equal(room.turnTimer, null);
  room.handleTrapPresentationComplete('leader', id);
  room.handleTrapPresentationComplete('member', id);
  assert.equal(room.state, 'CHECKPOINT');
  assert.equal(room.getClientState().timerRemaining, 45);
});
