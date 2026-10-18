import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';

function routeRoom(t) {
  const emitted = [];
  const io = { to: () => ({ emit: (name, data) => emitted.push({ name, data }) }) };
  const socket = id => ({ id, join() {} });
  const room = new Room('ROUTE', socket('leader'), 'Leader', io);
  room.addPlayer(socket('member'), 'Member');
  room.selectRole('leader', 'warrior');
  room.selectRole('member', 'mage');
  room.startRouteSelection();
  t.after(() => room.clearTimer());
  return { room, emitted };
}

test('floor/narrative have no timer and fastest/duplicate ACKs cannot start it', t => {
  const { room } = routeRoom(t);
  assert.equal(room.getClientState().timerRemaining, null);
  assert.equal(room.routeNarrativeTimer, undefined);
  room.handleRouteNarrativeDone('leader', room.routePresentationId);
  room.handleRouteNarrativeDone('leader', room.routePresentationId);
  assert.equal(room.isNarrating, true);
  assert.equal(room.turnTimer, null);
  room.handleRouteNarrativeDone('member', room.routePresentationId);
  assert.equal(room.isNarrating, false);
  assert.equal(room.turnTimer, null);
  assert.equal(room.getClientState().timerRemaining, null);
});

test('unknown and previous-floor readiness cannot release the current floor', t => {
  const { room } = routeRoom(t);
  const oldId = room.routePresentationId;
  room.floor += 1;
  room.startRouteSelection();
  room.handleRouteNarrativeDone('leader', oldId);
  room.handleRouteNarrativeDone('unknown', room.routePresentationId);
  room.handleRouteNarrativeDone('member');
  assert.equal(room.pendingPresentationAcks.size, 2);
  assert.equal(room.turnTimer, null);
});

test('route input is rejected during narrative and while paused', t => {
  const { room } = routeRoom(t);
  const routeId = room.currentRoutes[0].id;
  assert.equal(room.voteRoute('leader', routeId).success, false);
  room.handleRouteNarrativeDone('leader', room.routePresentationId);
  room.handleRouteNarrativeDone('member', room.routePresentationId);
  room.togglePause('leader');
  assert.equal(room.voteRoute('leader', routeId).success, false);
  assert.deepEqual(room.routeVotes, {});
  room.togglePause('leader');
  assert.equal(room.voteRoute('leader', routeId).success, true);
});

test('disconnect releases finished clients with no time limit', t => {
  const { room } = routeRoom(t);
  room.handleRouteNarrativeDone('leader', room.routePresentationId);
  room.removePlayer('member');
  assert.equal(room.isNarrating, false);
  assert.equal(room.turnTimer, null);
  assert.equal(room.getClientState().timerRemaining, null);
});

test('paused readiness preserves unlimited voting state until resume', t => {
  const { room } = routeRoom(t);
  room.togglePause('leader');
  room.handleRouteNarrativeDone('leader', room.routePresentationId);
  room.handleRouteNarrativeDone('member', room.routePresentationId);
  assert.equal(room.turnTimer, null);
  assert.equal(room.getClientState().timerRemaining, null);
  room.togglePause('leader');
  assert.equal(room.getClientState().timerRemaining, null);
});

test('route voting stays open with no countdown timer after narrative finishes', async t => {
  const { room, emitted } = routeRoom(t);
  room.handleRouteNarrativeDone('leader', room.routePresentationId);
  room.handleRouteNarrativeDone('member', room.routePresentationId);
  const states = emitted.filter(event => event.name === 'room:update').map(event => event.data);
  assert.ok(states.every(state => state.timerRemaining === null));
  assert.equal(room.isNarrating, false);
  assert.equal(room.turnTimer, null);
});
