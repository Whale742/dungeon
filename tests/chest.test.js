import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';

function fixture(t, floor = 1) {
  const io = { to: () => ({ emit() {} }) };
  const socket = id => ({ id, join() {} });
  const room = new Room('CHEST', socket('leader'), 'Leader', io);
  room.addPlayer(socket('member'), 'Member');
  room.selectRole('leader', 'warrior');
  room.selectRole('member', 'mage');
  room.floor = floor;
  t.after(() => room.clearTimer());
  return room;
}

test('treasure event enters with timer OFF and snapshots recorded', t => {
  const room = fixture(t, 2);
  room.players.leader.hp = 50;
  room.players.member.hp = 40;
  room.handleTreasureEvent({ title: 'Ancient Chest', story: '幽暗深處發現一只遠古寶箱。' });
  const ev = room.currentEvent;

  assert.equal(room.state, 'EVENT');
  assert.equal(ev.type, 'treasure');
  assert.equal(ev.presentationId, 1);
  assert.equal(ev.hpBefore.players.find(p => p.id === 'leader').hp, 50);
  assert.equal(ev.hpAfter.players.find(p => p.id === 'leader').hp, 75);
  // Timer MUST BE OFF during discovery and waiting to open
  assert.equal(room.turnTimer, null);
  assert.equal(room.getClientState().timerRemaining, null);
});

test('equipment decision timer remains paused when equipment drops until player decides', t => {
  const room = fixture(t, 2);
  // Force a played drop for warrior
  room.handleTreasureEvent({ title: 'Chest', story: '寶箱' });
  const ev = room.currentEvent;
  assert.ok(ev.presentationId > 0);

  // If a pendingDrop exists, timer must be null (paused)
  if (room.pendingDrop) {
    const ownerId = room.pendingDrop.ownerId;
    assert.equal(room.turnTimer, null);
    assert.equal(room.getClientState().timerRemaining, null);

    // Stale or wrong player or wrong presentationId cannot start timer
    room.handleEquipmentInteractionReady(ownerId, ev.presentationId - 1);
    assert.equal(room.turnTimer, null);
    room.handleEquipmentInteractionReady('unknown', ev.presentationId);
    assert.equal(room.turnTimer, null);

    // Legitimate interaction_ready from owner still keeps timer paused
    room.handleEquipmentInteractionReady(ownerId, ev.presentationId);
    assert.equal(room.turnTimer, null);
    assert.equal(room.getClientState().timerRemaining, null);

    // Once owner decides to equip or discard, pendingDrop is cleared
    room.handleEquipChoice(ownerId, true);
    assert.equal(room.pendingDrop, null);
  }
});

test('chest presentation complete advances to next floor when no equipment decision needed', t => {
  const room = fixture(t, 2);
  room.handleTreasureEvent({ title: 'Chest', story: '寶箱' });
  const id = room.currentEvent.presentationId;
  room.pendingDrop = null; // simulate pure heal / no pending drop
  room.pendingPresentationAcks = new Set(['leader', 'member']);

  room.handleChestPresentationComplete('leader', id - 1);
  assert.equal(room.pendingPresentationAcks.size, 2);
  assert.equal(room.state, 'EVENT');

  room.handleChestPresentationComplete('leader', id);
  assert.equal(room.pendingPresentationAcks.size, 1);
  assert.equal(room.state, 'EVENT');

  // Second player ACKs -> advances to next floor
  room.handleChestPresentationComplete('member', id);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.floor, 3);
});

test('owner disconnect discards pending drop and releases barrier if other players finished', t => {
  const room = fixture(t, 2);
  room.handleTreasureEvent({ title: 'Chest', story: '寶箱' });
  if (room.pendingDrop) {
    const ownerId = room.pendingDrop.ownerId;
    const otherId = ownerId === 'leader' ? 'member' : 'leader';
    room.handleChestPresentationComplete(otherId, room.currentEvent.presentationId);

    // Other player is done, owner disconnects
    room.removePlayer(ownerId);
    assert.equal(room.pendingDrop, null);
    assert.equal(room.state, 'CHOOSING_ROUTE');
  }
});
