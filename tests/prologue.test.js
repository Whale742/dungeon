import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';

function opening(t) {
  const io = { to: () => ({ emit() {} }) };
  const socket = id => ({ id, join() {} });
  const room = new Room('TEST', socket('leader'), 'Leader', io);
  room.addPlayer(socket('member'), 'Member');
  room.selectRole('leader', 'warrior');
  room.selectRole('member', 'mage');
  t.after(() => {
    room.clearTimer();
    if (room.routeNarrativeTimer) clearTimeout(room.routeNarrativeTimer);
    if (room.presentationSafetyTimer) clearTimeout(room.presentationSafetyTimer);
  });
  assert.equal(room.startAdventure('leader').success, true);
  return room;
}

test('opening has no player countdown and waits for the slowest client', t => {
  const room = opening(t);
  assert.equal(room.getClientState().timerRemaining, null);
  assert.equal(room.turnTimer, null);
  room.handlePrologueComplete('leader');
  assert.equal(room.state, 'PROLOGUE');
  assert.equal(room.getClientState().timerRemaining, null);
  room.handlePrologueComplete('member');
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.isNarrating, true);
  assert.equal(room.getClientState().timerRemaining, null);
});

test('duplicate and unknown completion cannot release another player', t => {
  const room = opening(t);
  room.handlePrologueComplete('leader');
  room.handlePrologueComplete('leader');
  assert.equal(room.handlePrologueComplete('unknown').success, false);
  assert.equal(room.state, 'PROLOGUE');
  assert.deepEqual([...room.pendingPresentationAcks], ['member']);
});

test('disconnect releases only that client from the opening barrier', t => {
  const room = opening(t);
  room.removePlayer('member');
  assert.equal(room.state, 'PROLOGUE');
  room.handlePrologueComplete('leader');
  assert.equal(room.state, 'CHOOSING_ROUTE');
});

test('last outstanding disconnect releases already-finished teammates', t => {
  const room = opening(t);
  room.handlePrologueComplete('leader');
  room.removePlayer('member');
  assert.equal(room.state, 'CHOOSING_ROUTE');
});

test('abandoned opening does not advance an empty connected party', t => {
  const room = opening(t);
  room.removePlayer('leader');
  room.removePlayer('member');
  assert.equal(room.state, 'PROLOGUE');
  assert.equal(room.turnTimer, null);
});

test('restart discards old ACKs and requires a complete new opening', t => {
  const room = opening(t);
  room.handlePrologueComplete('leader');
  room.restartToLobby('leader');
  assert.equal(room.pendingPresentationAcks.size, 0);
  assert.equal(room.handlePrologueComplete('member').success, false);
  room.startAdventure('leader');
  assert.deepEqual([...room.pendingPresentationAcks], ['leader', 'member']);
  room.handlePrologueComplete('member');
  assert.equal(room.state, 'PROLOGUE');
});

test('leader can skip prologue directly', t => {
  const room = opening(t);
  assert.equal(room.state, 'PROLOGUE');
  const res = room.skipPrologue('leader');
  assert.equal(res.success, true);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.isNarrating, false);
  assert.equal(room.pendingPresentationAcks.size, 0);
  assert.equal(room.getClientState().timerRemaining, 15);
});

test('member cannot skip prologue', t => {
  const room = opening(t);
  assert.equal(room.state, 'PROLOGUE');
  const res = room.skipPrologue('member');
  assert.equal(res.success, false);
  assert.equal(room.state, 'PROLOGUE');
});

test('leader can accelerate narrative and non-leader is rejected', t => {
  const emitted = [];
  const io = { to: () => ({ emit: (name, data) => emitted.push({ name, data }) }) };
  const socket = id => ({ id, join() {} });
  const room = new Room('TEST', socket('leader'), 'Leader', io);
  room.addPlayer(socket('member'), 'Member');
  emitted.length = 0;
  assert.equal(room.accelerateNarrative('member').success, false);
  assert.equal(emitted.length, 0);
  assert.equal(room.accelerateNarrative('leader').success, true);
  assert.equal(emitted.some(e => e.name === 'narrative:accelerated'), true);
});

