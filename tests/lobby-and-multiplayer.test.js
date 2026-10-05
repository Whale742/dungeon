import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';

function createMockSocket(id) {
  return {
    id,
    emit: () => {},
    join: () => {},
    on: () => {}
  };
}

function createMockIo(events = []) {
  return {
    to: (roomCode) => ({
      emit: (eventName, data) => {
        events.push({ roomCode, eventName, data });
      }
    }),
    emit: (eventName, data) => {
      events.push({ eventName, data });
    }
  };
}

test('Lobby: member can toggle ready, leader cannot toggle ready', () => {
  const events = [];
  const io = createMockIo(events);
  const leaderSocket = createMockSocket('leader1');
  const room = new Room('ROOM1', leaderSocket, 'LeaderPlayer', io);

  const memberSocket = createMockSocket('member1');
  room.addPlayer(memberSocket, 'MemberPlayer');

  // Initial states
  assert.equal(room.players.leader1.isReady, false);
  assert.equal(room.players.member1.isReady, false);

  // Leader tries to toggle ready -> rejected
  const leaderRes = room.toggleReady('leader1');
  assert.equal(leaderRes.success, false);
  assert.equal(leaderRes.message, '隊長無需點擊準備');
  assert.equal(room.players.leader1.isReady, false);

  // Member must select role before readying
  const unpickedRes = room.toggleReady('member1');
  assert.equal(unpickedRes.success, false);
  assert.equal(unpickedRes.message, '請先選擇職業再準備！');

  room.selectRole('member1', 'warrior');

  // Member toggles ready -> true
  const memberRes1 = room.toggleReady('member1');
  assert.equal(memberRes1.success, true);
  assert.equal(memberRes1.isReady, true);
  assert.equal(room.players.member1.isReady, true);

  // Client state reflects isReady
  let state = room.getClientState();
  assert.equal(state.players.find(p => p.id === 'member1').isReady, true);

  // Member toggles ready again -> false (unready)
  const memberRes2 = room.toggleReady('member1');
  assert.equal(memberRes2.success, true);
  assert.equal(memberRes2.isReady, false);
  assert.equal(room.players.member1.isReady, false);
});

test('Lobby: startAdventure with checkReady requires all members to be ready', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('leader1');
  const room = new Room('ROOM2', leaderSocket, 'LeaderPlayer', io);
  const memberSocket = createMockSocket('member1');
  room.addPlayer(memberSocket, 'MemberPlayer');

  room.selectRole('leader1', 'warrior');
  room.selectRole('member1', 'mage');

  // Attempt to start while member is NOT ready
  const failRes = room.startAdventure('leader1', { checkReady: true });
  assert.equal(failRes.success, false);
  assert.equal(failRes.message, '尚有隊員未準備就緒：MemberPlayer');
  assert.equal(room.state, 'LOBBY');

  // Member readies up
  room.toggleReady('member1');
  assert.equal(room.players.member1.isReady, true);

  // Start succeeds
  const successRes = room.startAdventure('leader1', { checkReady: true });
  assert.equal(successRes.success, true);
  assert.notEqual(room.state, 'LOBBY');
  room.clearTimer();
});

test('Lobby: leader can transfer leader position to another member', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('leader1');
  const room = new Room('ROOM3', leaderSocket, 'LeaderPlayer', io);
  const member1Socket = createMockSocket('member1');
  const member2Socket = createMockSocket('member2');
  room.addPlayer(member1Socket, 'MemberOne');
  room.addPlayer(member2Socket, 'MemberTwo');
  room.selectRole('member1', 'archer');

  // Member 1 prepares
  room.toggleReady('member1');
  assert.equal(room.players.member1.isReady, true);

  // Non-leader cannot transfer
  const nonLeaderRes = room.transferLeader('member1', 'member2');
  assert.equal(nonLeaderRes.success, false);
  assert.equal(nonLeaderRes.message, '只有隊長能移交隊長職位！');

  // Leader transfers to member 1
  const transferRes = room.transferLeader('leader1', 'member1');
  assert.equal(transferRes.success, true);
  assert.equal(room.leaderId, 'member1');
  // New leader is not required to be ready, isReady reset
  assert.equal(room.players.member1.isReady, false);

  // Client state reflects new leaderId
  const state = room.getClientState();
  assert.equal(state.leaderId, 'member1');
});

test('Multiplayer: disconnecting or leaving party removes player and transfers leader to first in line', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('leader1');
  const room = new Room('ROOM4', leaderSocket, 'LeaderPlayer', io);
  const member1Socket = createMockSocket('member1');
  const member2Socket = createMockSocket('member2');
  room.addPlayer(member1Socket, 'MemberOne');
  room.addPlayer(member2Socket, 'MemberTwo');

  assert.deepEqual(room.memberIds, ['leader1', 'member1', 'member2']);
  assert.equal(room.leaderId, 'leader1');

  // Leader leaves party (or refreshes/disconnects)
  room.removePlayer('leader1');

  // Leader is completely removed from players and leader transferred to member1 (first in line)
  assert.equal(room.players.leader1, undefined);
  assert.equal(room.leaderId, 'member1');
  assert.deepEqual(room.memberIds, ['member1', 'member2']);

  // Now member1 (new leader) leaves
  room.removePlayer('member1');
  assert.equal(room.players.member1, undefined);
  assert.equal(room.leaderId, 'member2');
  assert.deepEqual(room.memberIds, ['member2']);

  // Last player leaves
  room.removePlayer('member2');
  assert.equal(room.players.member2, undefined);
  assert.equal(room.leaderId, null);
  assert.deepEqual(room.memberIds, []);
});
