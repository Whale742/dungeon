import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Room } from './Room.js';
import { disconnectPlayer, reconnectPlayer, playerSocket } from './player-connection.js';

function presentationHarness(wait = async () => {}) {
  const node = () => ({ inert: false, textContent: '', classList: { add() {}, remove() {} }, addEventListener() {}, removeEventListener() {},
    replaceChildren() { this.textContent = ''; }, querySelector() { return null; } });
  const app = node(), elements = Object.fromEntries(['floorIntroOverlay', 'routeStatusText', 'hexMapContainer', 'routeOptionsGrid',
    'routeVotersStatusList', 'routeTimerBar', 'routeAtmosphereText', 'floorIntroNumber', 'floorIntroTitle'].map(key => [key, node()]));
  elements.views = { route: node() }; // The removed chat container is intentionally absent.
  const trace = [], errors = [], emitted = [];
  const scope = { elements, AbortController, document: { body: node(), getElementById: id => id === 'app' ? app : null },
    roomState: { code: 'TEST', state: 'CHOOSING_ROUTE', routePresentationId: 7, floor: 2, currentRoutes: [{}], leaderId: 'permanent-player' },
    myId: 'permanent-player', routePresentationController: null, routeInteractionReadyKey: null,
    console: { error: (...args) => errors.push(args) },
    presentationManager: { isBlocking: false, setBlocking(value) { this.isBlocking = value; } },
    socket: { emit: (...args) => emitted.push(args) }, gateDestinationView: () => trace.push('gate'), revealDestinationView: () => trace.push('reveal'),
    playSound() {}, waitForPrologue: wait,
    typePrologueParagraphs: async (target, paragraphs) => { trace.push('text'); target.textContent = paragraphs.join('\n'); } };
  vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/exploration/exploration.js', import.meta.url), 'utf8'), scope);
  return { scope, app, elements, trace, errors, emitted };
}

test('route presentation runs without chat DOM, shows narrative, then emits the matching ACK and releases controls', async () => {
  const h = presentationHarness();
  await h.scope.playExplorationPresentation(7, 2, ['前方地勢錯綜複雜', '請選擇接下來的路線']);
  assert.equal(h.errors.length, 0);
  assert.match(h.elements.routeAtmosphereText.textContent, /前方地勢錯綜複雜/);
  assert.ok(h.trace.indexOf('reveal') < h.trace.indexOf('text'));
  assert.equal(h.emitted.length, 1); assert.equal(h.emitted[0][0], 'route:interaction_ready');
  assert.equal(h.emitted[0][1].presentationId, 7);
  assert.equal(h.scope.routeInteractionReadyKey, 'ROUTE_7');
  assert.equal(h.scope.routePresentationController, null);
  assert.equal(h.scope.presentationManager.isBlocking, false); assert.equal(h.app.inert, false);
});

test('aborted route presentation releases the owner without ACKing an unfinished narrative', async () => {
  const h = presentationHarness((_ms, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })), { once: true })));
  const playing = h.scope.playExplorationPresentation(7, 2, ['尚未讀完']);
  h.scope.routePresentationController.abort(); await playing;
  assert.equal(h.emitted.length, 0); assert.equal(h.scope.routeInteractionReadyKey, null);
  assert.equal(h.app.inert, false); assert.equal(h.scope.routePresentationController, null);
});

test('real disconnect listener aborts the old narrative and resets keys so reconnection can play and ACK again', async () => {
  const h = presentationHarness((_ms, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })), { once: true })));
  const appSource = readFileSync(new URL('../public/js/core/app.js', import.meta.url), 'utf8');
  Object.assign(h.scope, { clearTimeout, operationState: {}, latestStateVersion: 1, operations: { clear() {} },
    battlePhaseController: null, combatQueueController: null, BattleHud: { reset() {} }, releaseBattleEncounterScene() {}, window: {},
    routeNarrativeDoneKey: 'ROUTE_7', socket: { ...h.scope.socket, on(_event, handler) { h.scope.disconnect = handler; } } });
  vm.runInContext(appSource.slice(appSource.indexOf("socket.on('disconnect',"), appSource.indexOf("socket.on('player:identity',")), h.scope);
  const playing = h.scope.playExplorationPresentation(7, 2, ['斷線時尚未讀完']);
  h.scope.disconnect(); await playing;
  assert.equal(h.scope.routeNarrativeDoneKey, null); assert.equal(h.scope.routeInteractionReadyKey, null);
  assert.equal(h.scope.routePresentationController, null); assert.equal(h.emitted.length, 0);
  h.scope.waitForPrologue = async () => {};
  await h.scope.playExplorationPresentation(7, 2, ['重新連線後完成敘述']);
  assert.equal(h.emitted.length, 1); assert.equal(h.emitted[0][1].presentationId, 7);
});

function roomFixture(t, count = 2) {
  const sockets = Array.from({ length: count }, (_, i) => playerSocket({ id: 'transport-' + i,
    data: { identity: { id: 'permanent-' + i, display_name: 'Player ' + i } }, join() {}, emit() {} }));
  const room = new Room('ROUTE', sockets[0], 'Player 0', { to: () => ({ emit() {} }) });
  sockets.slice(1).forEach(s => room.addPlayer(s, s.data.identity.display_name));
  sockets.forEach((s, i) => assert.equal(room.selectRole(s.id, ['warrior', 'mage', 'archer', 'assassin'][i]).success, true));
  t.after(() => { room.clearTimer(); for (const key of ['presentationSafetyTimer', 'roundStartTimer', 'selectionReadyTimer']) clearTimeout(room[key]); });
  return { room, sockets };
}

for (const count of [1, 2, 4]) test(`${count} permanent players: prologue -> shop -> route text barrier -> all votes -> next stage`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, sockets } = roomFixture(t, count);
  assert.equal(room.startAdventure(sockets[0].id).success, true);
  sockets.forEach(s => room.handlePrologueComplete(s.id));
  assert.equal(room.currentEvent.isPrepShop, true);
  sockets.forEach(s => room.handleShopAction(s.id, 'leave'));
  assert.equal(room.state, 'CHOOSING_ROUTE'); assert.equal(room.isPaused, false);
  const id = room.routePresentationId, routeId = room.currentRoutes[0].id;
  assert.deepEqual([...room.pendingPresentationAcks], sockets.map(s => s.id));
  assert.ok(room.getClientState().routeNarrative.every(text => text.length > 0));
  room.handleRouteNarrativeDone('transport-0', id); room.handleRouteNarrativeDone(sockets[0].id, id - 1);
  assert.equal(room.pendingPresentationAcks.size, count);
  sockets.forEach((s, i) => {
    assert.equal(room.voteRoute(s.id, routeId).success, false);
    room.handleRouteNarrativeDone(s.id, id);
    assert.equal(room.isNarrating, i !== count - 1);
  });
  sockets.forEach(s => assert.equal(room.voteRoute(s.id, routeId).success, true));
  t.mock.timers.tick(500); assert.notEqual(room.state, 'CHOOSING_ROUTE');
});

test('reconnecting during narration rejoins the current barrier; completed peers cannot open votes early', t => {
  const { room, sockets } = roomFixture(t);
  room.startRouteSelection(); const id = room.routePresentationId;
  disconnectPlayer(room, sockets[0].id);
  assert.equal(room.isPaused, false); assert.deepEqual([...room.pendingPresentationAcks], [sockets[1].id]);
  reconnectPlayer(room, sockets[0]);
  assert.equal(room.pendingPresentationAcks.has(sockets[0].id), true);
  room.handleRouteNarrativeDone(sockets[1].id, id);
  assert.equal(room.isNarrating, true);
  room.handleRouteNarrativeDone(sockets[0].id, id);
  assert.equal(room.isNarrating, false); assert.equal(room.leaderId, sockets[0].id);
});

test('all offline pauses, first reconnect waits for its own route ACK, and late peers can join after narration', t => {
  const { room, sockets } = roomFixture(t);
  room.startRouteSelection(); const id = room.routePresentationId;
  sockets.forEach(s => disconnectPlayer(room, s.id));
  assert.equal(room.isPaused, true); assert.equal(room.isNarrating, true); assert.equal(room.pendingPresentationAcks.size, 0);
  reconnectPlayer(room, sockets[0]);
  assert.equal(room.isPaused, false); assert.equal(room.isNarrating, true);
  room.handleRouteNarrativeDone(sockets[0].id, id); assert.equal(room.isNarrating, false);
  reconnectPlayer(room, sockets[1]);
  assert.equal(room.isNarrating, false); assert.equal(room.pendingPresentationAcks.size, 0);
});

test('offline unvoted players do not prevent connected players from advancing the route', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, sockets } = roomFixture(t);
  room.startRouteSelection(); const id = room.routePresentationId;
  sockets.forEach(s => room.handleRouteNarrativeDone(s.id, id));
  disconnectPlayer(room, sockets[0].id);
  room.voteRoute(sockets[1].id, room.currentRoutes[0].id);
  t.mock.timers.tick(500); assert.notEqual(room.state, 'CHOOSING_ROUTE');
});

test('disconnecting the last unvoted member advances votes already submitted by everyone online', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, sockets } = roomFixture(t);
  room.startRouteSelection(); sockets.forEach(s => room.handleRouteNarrativeDone(s.id, room.routePresentationId));
  room.voteRoute(sockets[0].id, room.currentRoutes[0].id);
  disconnectPlayer(room, sockets[1].id);
  t.mock.timers.tick(500); assert.notEqual(room.state, 'CHOOSING_ROUTE');
});

test('transport takeover re-enrolls narration once, while an idempotent room join does not reset an ACK', t => {
  const { room, sockets } = roomFixture(t);
  room.startRouteSelection(); const id = room.routePresentationId;
  room.handleRouteNarrativeDone(sockets[0].id, id);
  reconnectPlayer(room, sockets[0]); assert.equal(room.pendingPresentationAcks.has(sockets[0].id), false);
  reconnectPlayer(room, sockets[0], { newConnection: true });
  assert.equal(room.pendingPresentationAcks.has(sockets[0].id), true);
  room.handleRouteNarrativeDone(sockets[1].id, id); assert.equal(room.isNarrating, true);
  room.handleRouteNarrativeDone(sockets[0].id, id); assert.equal(room.isNarrating, false);
});

test('a delayed vote settlement cannot skip the next route narrative', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, sockets } = roomFixture(t, 1);
  room.startRouteSelection({ skipIntro: true }); room.voteRoute(sockets[0].id, room.currentRoutes[0].id);
  room.floor++; room.startRouteSelection();
  t.mock.timers.tick(500);
  assert.equal(room.state, 'CHOOSING_ROUTE'); assert.equal(room.isNarrating, true);
});

test('all-offline pause during vote settlement resumes already confirmed votes after reconnection', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, sockets } = roomFixture(t, 1);
  room.startRouteSelection(); room.handleRouteNarrativeDone(sockets[0].id, room.routePresentationId);
  room.voteRoute(sockets[0].id, room.currentRoutes[0].id);
  disconnectPlayer(room, sockets[0].id); t.mock.timers.tick(500);
  assert.equal(room.state, 'CHOOSING_ROUTE'); assert.equal(room.isPaused, true);
  reconnectPlayer(room, sockets[0]); t.mock.timers.tick(500);
  assert.notEqual(room.state, 'CHOOSING_ROUTE');
});

test('manual pause holds route settlement and resume rechecks submitted votes', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, sockets } = roomFixture(t, 1);
  room.startRouteSelection(); room.handleRouteNarrativeDone(sockets[0].id, room.routePresentationId);
  room.voteRoute(sockets[0].id, room.currentRoutes[0].id);
  room.togglePause(sockets[0].id); t.mock.timers.tick(500);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  room.togglePause(sockets[0].id); t.mock.timers.tick(500);
  assert.notEqual(room.state, 'CHOOSING_ROUTE');
});

test('battle victory returns to another route with a fresh narrative and ACK barrier', t => {
  const { room, sockets } = roomFixture(t, 1);
  room.startRouteSelection(); const previous = room.routePresentationId;
  room.handleRouteNarrativeDone(sockets[0].id, previous);
  room.handleBattleEvent(null, false, { col: 1 });
  for (const enemy of room.enemies) enemy.hp = 0;
  room.publishCombatQueue([]); room.handlePresentationComplete(sockets[0].id, room.battlePresentationId, 1);
  const victoryId = room.currentVictory.presentationId;
  room.handleVictoryComplete(sockets[0].id, victoryId); room.continueAfterVictory(sockets[0].id, victoryId);
  assert.equal(room.state, 'CHOOSING_ROUTE'); assert.equal(room.routePresentationId, previous + 1);
  assert.equal(room.isNarrating, true); assert.ok(room.getClientState().routeNarrative[0]);
  room.handleRouteNarrativeDone(sockets[0].id, previous); assert.equal(room.isNarrating, true);
  room.handleRouteNarrativeDone(sockets[0].id, room.routePresentationId); assert.equal(room.isNarrating, false);
});
