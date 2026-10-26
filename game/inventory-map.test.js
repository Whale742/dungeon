import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { TIER1_EQUIPMENTS } from './constants.js';

function fixture(t, role = 'warrior') {
  const room = new Room('SLOTS', { id: 'hero', join() {}, emit() {} }, 'Hero', { to: () => ({ emit() {} }) });
  room.selectRole('hero', role);
  room.broadcastState = () => {};
  t.after(() => room.clearTimer());
  return { room, player: room.players.hero };
}

test('loot fills holes after dragging to the final squad slot and equipping', t => {
  const { room } = fixture(t);
  const weapon = structuredClone(TIER1_EQUIPMENTS.find(i => i.slot === 'WEAPON'));
  room.squadInventory = [weapon];
  assert.equal(room.swapInventorySlots('hero', { fromArea: 'SQUAD', fromIndex: 0, toArea: 'SQUAD', toIndex: 18 }).success, true);
  assert.equal(room.squadInventory.filter(Boolean).length, 1);
  const loot = { id: 'new', name: 'New' };
  assert.deepEqual(room.addItemPrioritySquad(loot), { target: 'squad', index: 0 });
  assert.equal(room.equipItemFromSquad('hero', 18).success, true);
  room.squadInventory = Array(12).fill(null);
  assert.deepEqual(room.addItemPrioritySquad({ name: 'First' }), { target: 'squad', index: 0 });
  for (let n = 1; n < 19; n++) assert.equal(room.addItemPrioritySquad({ name: `Item ${n}` }).index, n);
  assert.equal(room.squadInventory.length, 19);
  assert.equal(room.squadInventory.filter(Boolean).length, 19);
});

test('full squad loot and transfers reuse personal and squad holes', t => {
  const { room, player } = fixture(t);
  room.squadInventory = Array.from({ length: 19 }, (_, n) => ({ name: `Item ${n}` }));
  player.bag = [null, null, null, { name: 'Last' }];
  assert.deepEqual(room.addItemPrioritySquad({ name: 'Personal' }, 'hero'), { target: 'personal', playerId: 'hero', index: 0 });
  room.squadInventory[5] = null;
  assert.equal(room.transferToSquad('hero', 0).success, true);
  assert.equal(room.squadInventory[5].name, 'Personal');
  assert.equal(room.transferToPersonal('hero', 5).success, true);
  assert.equal(player.bag[0].name, 'Personal');
  assert.ok(player.bag.length <= 4);
  assert.ok(room.squadInventory.length <= 19);
  player.bag = Array.from({ length: 4 }, () => ({ name: 'Full' }));
  room.squadInventory = Array.from({ length: 19 }, () => ({ name: 'Full' }));
  assert.equal(room.autoDepositLoot({ name: 'Overflow' }).target, 'overflow');
  assert.equal(room.squadInventory.length, 19);
});

test('alchemist passive fills personal holes and discards when personal bag is full', t => {
  const { room, player } = fixture(t, 'alchemist');
  t.mock.method(Math, 'random', () => 0);
  player.bag = [null, { name: 'Second' }, null, { name: 'Fourth' }];
  const log = [], visuals = [];
  room.grantAlchemistPotion(player, log, visuals);
  room.grantAlchemistPotion(player, log, visuals);
  assert.equal(player.bag.filter(Boolean).length, 4);
  room.grantAlchemistPotion(player, log, visuals);
  assert.equal(room.squadInventory.length, 0);
  assert.equal(room.overflowItems?.length || 0, 0);
  assert.equal(visuals.length, 2);
  assert.match(log.at(-1).text, /丟棄/);
});

test('map preserves seven-node chevrons and every nonterminal node has a geometric path to the tip', t => {
  const { room } = fixture(t);
  room.generateHexMap({ rng: () => 0.5 });
  assert.deepEqual(room.hexMap.map(nodes => nodes.length), [1, 3, 5, 7, 7, 7, 7, 7, 7, 7]);
  const tip = room.getHexNode(9, 3);
  assert.equal(tip.type, 'END_ELITE');
  assert.equal(room.hexMap.flat().filter(n => n.type === 'END_ELITE').length, 1);
  for (const node of room.hexMap.flat()) {
    if (node === tip) continue;
    const next = room.getAdjacentNextHexes(node.col, node.row);
    assert.ok(next.length, `No exit from ${node.id}`);
    for (const target of next) {
      const dx = room.getNodeVisualX(target) - room.getNodeVisualX(node);
      const dy = Math.abs(target.row - node.row);
      assert.ok((dy === 0 && dx === 1) || (dy === 1 && dx === 0.5), `${node.id} -> ${target.id}`);
    }
  }
  for (const node of room.hexMap[9]) assert.equal(room.getNodeVisualX(node), 9 - Math.abs(node.row - 3) * 0.5);
  assert.equal(room.getClientHexMap().flat().filter(n => n.type === 'END_ELITE').length, 1);
  room.currentHex = { col: 9, row: 0 };
  const map = room.hexMap;
  room.startRouteSelection({ skipIntro: true });
  assert.equal(room.hexMap, map);
  assert.ok(room.currentRoutes.length);
  room.advanceToNextFloorOrCheckpoint();
  assert.notEqual(room.state, 'CHECKPOINT');
  room.currentHex = { col: 9, row: 3 };
  room.advanceToNextFloorOrCheckpoint();
  assert.equal(room.state, 'CHECKPOINT');
});
