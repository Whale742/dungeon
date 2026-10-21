import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { TIER1_EQUIPMENTS } from './constants.js';

export function fixture(t, role = 'warrior') {
  const events = [];
  const socket = { id: 'solo', join() {}, emit() {} };
  const io = { to: () => ({ emit: (...args) => events.push(args) }) };
  const room = new Room('TEST1', socket, 'Tester', io);
  room.selectRole(socket.id, role);
  t.after(() => {
    room.clearTimer();
    for (const key of ['presentationSafetyTimer', 'roundStartTimer', 'selectionReadyTimer']) clearTimeout(room[key]);
  });
  return { room, socket, events, player: room.players.solo };
}

test('solo prologue, preparation shop, route ACK and legal adjacency', t => {
  const { room } = fixture(t);
  assert.equal(room.startAdventure('solo', { checkReady: true }).success, true);
  assert.equal(room.state, 'PROLOGUE');
  assert.equal(room.gold, 45);
  assert.equal(room.turnTimer, null);
  room.handlePrologueComplete('outsider');
  assert.equal(room.state, 'PROLOGUE');
  room.handlePrologueComplete('solo');
  assert.equal(room.currentEvent.isPrepShop, true);
  const result = room.handleShopAction('solo', 'leave');
  assert.equal(result.success, true);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.voteRoute('solo', room.currentRoutes[0].id).success, false);
  room.handleRouteNarrativeDone('solo', room.routePresentationId - 1);
  assert.equal(room.isNarrating, true);
  room.handleRouteNarrativeDone('solo', room.routePresentationId);
  assert.equal(room.isNarrating, false);
  assert.equal(room.voteRoute('solo', 'invalid').success, false);
  assert.ok(room.currentRoutes.every(r => room.getAdjacentNextHexes().some(h => h.id === r.id)));
});

test('combat uses presentation ACK, rejects stale ACK and advances one round', t => {
  const { room } = fixture(t);
  room.handleBattleEvent(null, false, { col: 1 });
  assert.equal(room.state, 'IN_BATTLE');
  assert.ok(room.getLivingEnemies().length);
  room.publishCombatQueue([], 'round_start');
  assert.equal(room.selectionState, 'RESOLVING');
  const id = room.battlePresentationId;
  room.handlePresentationComplete('solo', id - 1, 1);
  assert.equal(room.selectionState, 'RESOLVING');
  room.handlePresentationComplete('solo', id, 1);
  assert.equal(room.selectionState, 'SELECTING');
  assert.equal(room.isWaitingForSelectionReady, true);
  room.handleSelectionReady('solo', 0);
  assert.equal(room.isWaitingForSelectionReady, true);
  room.handleSelectionReady('solo', 1);
  assert.equal(room.isWaitingForSelectionReady, false);
  room.resolveTurnActions();
  assert.equal(room.selectionState, 'RESOLVING');
  room.handlePresentationComplete('solo', room.battlePresentationId, 1);
  assert.equal(room.battleRound, 2);
  const next = room.battlePresentationId;
  room.handlePresentationComplete('solo', id, 1);
  assert.equal(room.battlePresentationId, next);
});

test('victory reward ACK and continuation return to exploration', t => {
  const { room } = fixture(t);
  room.handleBattleEvent(null, false, { col: 1 });
  const before = room.gold;
  for (const e of room.enemies) e.hp = 0;
  room.publishCombatQueue([]);
  room.handlePresentationComplete('solo', room.battlePresentationId, 1);
  assert.equal(room.state, 'BATTLE_VICTORY');
  assert.ok(room.gold > before);
  const id = room.currentVictory.presentationId;
  room.continueAfterVictory('solo', id);
  assert.equal(room.state, 'BATTLE_VICTORY');
  room.handleVictoryComplete('solo', id);
  room.continueAfterVictory('solo', id);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.floor, 2);
});

test('chest reward waits for ACK; equipment swap and removal do not compound stats', t => {
  const { room, player } = fixture(t);
  room.handleChestEvent({ col: 1, isMimic: false });
  assert.equal(room.handleChestAction('solo', 'open').success, true);
  assert.equal(room.state, 'EVENT');
  room.handleChestPresentationComplete('solo', room.currentEvent.presentationId);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  const item = TIER1_EQUIPMENTS.find(e => e.slot === 'WEAPON');
  assert.ok(item);
  player.bag = [structuredClone(item), structuredClone(item)];
  const before = player.bonusAtk;
  assert.equal(room.equipItemFromBag('solo', 0).success, true);
  const equipped = player.bonusAtk;
  assert.equal(room.equipItemFromBag('solo', 0).success, true);
  assert.equal(player.bonusAtk, equipped);
  assert.equal(room.unequipItemToBag('solo', 'WEAPON').success, true);
  assert.equal(player.bonusAtk, before);
});
