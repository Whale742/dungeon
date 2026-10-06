import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { ENCOUNTERS } from '../game/constants.js';

test('encounter from TRANSITION accepts first-round status ACKs before selection timer', t => {
  const events = [];
  const room = new Room('ENTRY', { id: 'p0', join() {} }, 'Leader', {
    to: () => ({ emit: (name, data) => events.push({ name, data }) })
  });
  room.addPlayer({ id: 'p1', join() {} }, 'Member');
  room.selectRole('p0', 'warrior'); room.selectRole('p1', 'mage');
  t.after(() => room.clearTimer());
  room.state = 'TRANSITION'; room.floor = 1;
  const before = room.players.p0.hp;
  const execute = room.executeTurn;
  room.executeTurn = function() {
    // Encounters normally clear debuffs; inject only the boundary under test.
    this.players.p0.bleedTurns = 2;
    return execute.call(this);
  };
  const random = Math.random;
  Math.random = () => (ENCOUNTERS.findIndex(m => m.hp < 100) + .1) / ENCOUNTERS.length;
  try { room.handleBattleEvent(); }
  finally { Math.random = random; room.executeTurn = execute; }
  const queue = events.find(e => e.name === 'battle:presentation_queue').data;
  assert.equal(queue.queue[0].category, 'STATUS_TICK');
  assert(room.players.p0.hp < before);
  assert.equal(room.state, 'IN_BATTLE');
  assert.equal(room.selectionState, 'RESOLVING');
  assert.equal(room.turnTimer, null);
  room.handlePresentationComplete('unknown', queue.presentationId, 1);
  room.handlePresentationComplete('p0', queue.presentationId - 1, 1);
  room.handlePresentationComplete('p0', queue.presentationId, 2);
  assert.equal(room.pendingPresentationAcks.size, 2);
  room.handlePresentationComplete('p0', queue.presentationId, 1);
  assert.equal(room.selectionState, 'RESOLVING');
  room.handlePresentationComplete('p1', queue.presentationId, 1);
  assert.equal(room.selectionState, 'SELECTING');
  assert.equal(room.turnTimer, null);
  room.handleSelectionReady('p0', 1);
  assert.equal(room.turnTimer, null);
  room.handleSelectionReady('p1', 1);
  assert.notEqual(room.turnTimer, null);
  assert.equal(events.findLast(e => e.name === 'room:update').data.timerRemaining, 30);
});
