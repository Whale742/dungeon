import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';

class Element {
  constructor() { this.children = []; this.handlers = {}; this.textContent = ''; this.disabled = false; const hidden = new Set();
    this.classList = { add: k => hidden.add(k), remove: k => hidden.delete(k), contains: k => hidden.has(k),
      toggle(k, value) { if (value) hidden.add(k); else hidden.delete(k); } }; }
  appendChild(e) { this.children.push(e); }
  replaceChildren() { this.children = []; }
  addEventListener(event, handler) { this.handlers[event] = handler; }
}
function harness() {
  const nodes = new Map(), calls = [], handlers = {};
  const el = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const scope = { document: { getElementById: el, createElement: () => new Element() }, URLSearchParams, URL,
    location: { search: '', origin: 'http://localhost' }, currentRoomCode: null, roomState: null, myId: 'member',
    recentAdventureRestoreEpoch: 0, recentAdventureRestoreTimer: null, clearTimeout,
    PlayerIdentity: { player: { playerId: 'member' } }, showToast() {}, openProfileModal() {}, closeBurgerMenu() {},
    navigator: { clipboard: { writeText: async () => {} } }, exitRoomToLobbyMenu() {}, switchView() {},
    goToEntryScreen(id) { el('screenAdventures').classList.toggle('hidden', id !== 'screenAdventures'); },
    socket: { connected: true, on: (event, cb) => { handlers[event] = cb; }, timeout() { return { emit: (...args) => calls.push(args) }; } } };
  vm.createContext(scope); vm.runInContext(readFileSync(new URL('../public/js/core/adventures.js', import.meta.url), 'utf8'), scope);
  return { scope, el, calls, handlers };
}
const item = { id: 'adventure', name: '<img src=x onerror=alert(1)>', leaderName: '<b>隊長</b>', memberCount: 4,
  savedAt: '2026-10-28T12:00:00Z', checkpointFloor: 12, isLeader: true, active: false };
test('continue menu renders server-owned safe metadata and sends only the chosen adventure ID', async () => {
  const h = harness(); h.el('btnContinueAdventure').handlers.click();
  assert.equal(h.calls[0][0], 'adventure:list'); assert.equal(h.calls[0][1].playerId, undefined);
  h.calls[0][2](null, { success: true, adventures: [item], hasMore: false, nextOffset: 1 }); await setImmediate();
  const card = h.el('adventureList').children[0];
  assert.equal(card.children[0].textContent, item.name); assert.match(card.children[1].textContent, /第 12 層/);
  card.children[2].handlers.click();
  assert.equal(h.calls[1][0], 'adventure:restore'); assert.equal(h.calls[1][1].adventureId, item.id);
  assert.equal(Object.keys(h.calls[1][1]).length, 1); assert.equal(card.children[2].disabled, false);
  assert.equal(h.el('adventureList').children[0].children[2].disabled, true);
  h.calls[1][2](null, { success: false, message: '冒險已結束' }); await setImmediate();
  assert.match(h.el('adventureListStatus').textContent, /冒險已結束/);
  assert.equal(h.el('adventureList').children[0].children[2].disabled, false);
});
test('empty state, request errors and stale replies after account switch stay separate', async () => {
  const h = harness(); h.el('btnContinueAdventure').handlers.click();
  h.calls[0][2](null, { success: true, adventures: [], hasMore: false, nextOffset: 0 }); await setImmediate();
  assert.match(h.el('adventureListStatus').textContent, /沒有可接續/);
  h.el('btnRefreshAdventures').handlers.click(); h.calls[1][2](null, { success: false, message: '讀取失敗' }); await setImmediate();
  assert.match(h.el('adventureListStatus').textContent, /讀取失敗/);
  h.el('btnRefreshAdventures').handlers.click();
  h.scope.PlayerIdentity.player = { playerId: 'different' }; h.handlers['player:identity']();
  h.calls[2][2](null, { success: true, adventures: [item], hasMore: false }); await setImmediate();
  assert.equal(h.el('adventureList').children.length, 0);
  h.calls.at(-1)[2](null, { success: true, adventures: [], hasMore: false }); await setImmediate();
  assert.match(h.el('adventureListStatus').textContent, /沒有可接續/);
});
test('successful and pending saves stay silent; only failed saves expose retry', () => {
  const h = harness();
  Object.assign(h.scope, { localStorage: { setItem() {}, removeItem() {} }, restoredCheckpointNotice: null });
  const source = readFileSync(new URL('../public/js/core/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function updateCheckpointNotice('), source.indexOf("document.getElementById('btnRetryCheckpoint')?.addEventListener")), h.scope);
  for (const status of ['none', 'saving', 'saved', 'ending', 'ended']) {
    h.scope.updateCheckpointNotice({ adventureId: 'adv', state: 'CHOOSING_ROUTE', checkpoint: { status, message: '不要顯示' } });
    assert.equal(h.el('checkpointNotice').classList.contains('hidden'), true);
    assert.equal(h.el('checkpointNoticeText').textContent, '');
  }
  h.scope.updateCheckpointNotice({ checkpoint: { status: 'failed', message: '請重試保存' } });
  assert.equal(h.el('checkpointNotice').classList.contains('hidden'), false);
  assert.equal(h.el('btnRetryCheckpoint').classList.contains('hidden'), false);
});

test('leadership menu passes the full authorized player to the existing confirmation modal', () => {
  const h = harness(); let selected;
  const target = { id: 'teammate', name: '隊友', connected: true };
  h.scope.roomState = { adventureId: 'adv', leaderId: 'member', state: 'CHOOSING_ROUTE', players: [{ id: 'member', name: '我' }, target] };
  h.scope.openTransferLeaderModal = p => { selected = p; };
  h.handlers['room:update'](h.scope.roomState);
  h.el('adventureLeaderTarget').value = target.id;
  h.el('btnAdventureLeadership').handlers.click(); assert.equal(selected, target);
  h.scope.roomState.leaderId = target.id; selected = null;
  h.el('btnAdventureLeadership').handlers.click(); assert.equal(selected, null);
});

test('temporary departure waits for confirmation, prevents duplicates, cancels old presentations and preserves the recent ID', async () => {
  const h = harness(); const requests = [], aborted = [], removed = [];
  Object.assign(h.scope, { roomState: { adventureId: 'adv' }, currentRoomCode: 'ROOM1', pendingAuthoritativeState: { old: true },
    operations: { clear() {} }, operationState: {}, latestStateVersion: 1, routeNarrativeDoneKey: 'old', routeInteractionReadyKey: 'old',
    localStorage: { removeItem: key => removed.push(key) }, playSound() {}, sfx: { stopAll() {} }, lobbyRoleUi: {},
    isClassArchiveMode: false, window: {}, currentActiveStage: 'BATTLE', presentationManager: { clear() {} },
    elements: {}, renderRoleSelectionGrid() {}, myName: '隊員' });
  h.scope.document.querySelector = () => null;
  for (const name of ['battlePhaseController', 'combatQueueController', 'routePresentationController', 'trapPresentationController', 'chestPresentationController', 'victoryPresentationController']) {
    h.scope[name] = { abort: () => aborted.push(name) };
  }
  h.scope.socket.timeout = () => ({ emit: (...args) => requests.push(args) });
  const source = readFileSync(new URL('../public/js/core/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('let exitRoomPending'), source.indexOf('window.exitRoomToLobbyMenu =')), h.scope);
  const exiting = h.scope.exitRoomToLobbyMenu({ temporary: true });
  await h.scope.exitRoomToLobbyMenu({ temporary: true });
  assert.equal(requests.length, 1); assert.equal(requests[0][0], 'adventure:detach'); assert.equal(h.scope.roomState.adventureId, 'adv');
  requests[0][1](null, { success: true }); await exiting;
  assert.equal(h.scope.roomState, null); assert.equal(h.scope.pendingAuthoritativeState, null);
  assert.equal(aborted.length, 6); assert.equal(removed.length, 0);
  const permanent = h.scope.exitRoomToLobbyMenu();
  requests[1][1](null, { success: true }); await permanent;
  assert.equal(requests[1][0], 'leave_party'); assert.deepEqual(removed, ['dungeon_recent_adventure']);
});
