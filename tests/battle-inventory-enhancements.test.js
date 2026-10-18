import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import {
  EXCLUSIVE_MINIONS,
  GENERAL_MINIONS,
  ABYSS_MINIONS,
  determineEquipSlot,
  EQUIP_SLOTS,
  TIER1_EQUIPMENTS,
  TIER2_EQUIPMENTS
} from '../game/constants.js';

test('Feature 1: All minion avatars are bound to WebP boss files', () => {
  const allMinions = [
    ...Object.values(EXCLUSIVE_MINIONS).flat(),
    ...GENERAL_MINIONS,
    ...ABYSS_MINIONS
  ];

  assert.ok(allMinions.length > 0, 'Minions array should not be empty');
  for (const minion of allMinions) {
    assert.ok(minion.avatar.startsWith('/BOSS/'), `Avatar for ${minion.name} must start with /BOSS/`);
    assert.ok(minion.avatar.endsWith('.webp'), `Avatar for ${minion.name} must end with .webp`);
  }
});

test('Feature 2: Equipment slot determination strictly identifies equipment categories', () => {
  const weapon1 = { id: 'test_sword', name: '精鋼闊劍', slot: 'WEAPON', bonusAtk: 10 };
  const weapon2 = { id: 'test_blade', name: '暗影匕首', bonusAtk: 8 };
  const armor1 = { id: 'test_armor', name: '重裝板甲', slot: 'ARMOR', bonusDef: 15 };
  const armor2 = { id: 'test_shield', name: '守護巨盾', bonusDef: 12 };
  const ring1 = { id: 'test_ring', name: '活力指環', slot: 'ACCESSORY', regenPerRound: 5 };
  const exclusive1 = { id: 'ex_sword', name: '誓約聖劍', tier: 'CLASS_EXCLUSIVE', role: 'paladin' };

  assert.equal(determineEquipSlot(weapon1), EQUIP_SLOTS.WEAPON);
  assert.equal(determineEquipSlot(weapon2), EQUIP_SLOTS.WEAPON);
  assert.equal(determineEquipSlot(armor1), EQUIP_SLOTS.ARMOR);
  assert.equal(determineEquipSlot(armor2), EQUIP_SLOTS.ARMOR);
  assert.equal(determineEquipSlot(ring1), EQUIP_SLOTS.ACCESSORY);
  assert.equal(determineEquipSlot(exclusive1), EQUIP_SLOTS.CLASS_EXCLUSIVE);
});

test('Feature 3: Strict equipment slot restriction rejects cross-slot equipping', () => {
  const mockSocket = { id: 'p1', join: () => {}, emit: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }) };
  const room = new Room('test_room', mockSocket, 'Hero', mockIo);

  const player = room.players['p1'];
  const weapon = { id: 'sword_1', name: '測試巨劍', slot: 'WEAPON', bonusAtk: 10 };
  const armor = { id: 'armor_1', name: '測試重鎧', slot: 'ARMOR', bonusDef: 10 };

  player.bag = [weapon, armor];

  // Attempt to equip weapon into ARMOR slot must fail
  const badEquipResult1 = room.equipItemFromBag('p1', 0, 'ARMOR');
  assert.equal(badEquipResult1.success, false);
  assert.ok(badEquipResult1.message.includes('裝備與欄位不符'));
  assert.equal(player.equipSlots.ARMOR, null);

  // Attempt to equip armor into WEAPON slot must fail
  const badEquipResult2 = room.equipItemFromBag('p1', 1, 'WEAPON');
  assert.equal(badEquipResult2.success, false);
  assert.ok(badEquipResult2.message.includes('裝備與欄位不符'));
  assert.equal(player.equipSlots.WEAPON, null);

  // Valid equip into WEAPON slot must succeed
  const goodEquipResult1 = room.equipItemFromBag('p1', 0, 'WEAPON');
  assert.equal(goodEquipResult1.success, true);
  assert.equal(player.equipSlots.WEAPON.id, 'sword_1');

  // Valid equip into ARMOR slot must succeed
  const goodEquipResult2 = room.equipItemFromBag('p1', 0, 'ARMOR');
  assert.equal(goodEquipResult2.success, true);
  assert.equal(player.equipSlots.ARMOR.id, 'armor_1');
});

test('Feature 4: Inventory drag-and-drop swapping between slots and bags', () => {
  const mockSocket = { id: 'p1', join: () => {}, emit: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }) };
  const room = new Room('test_room', mockSocket, 'Hero', mockIo);

  const player = room.players['p1'];
  const itemA = { id: 'item_a', name: '道具A' };
  const itemB = { id: 'item_b', name: '道具B' };
  const itemC = { id: 'item_c', name: '道具C' };

  player.bag = [itemA, itemB];
  room.squadInventory = [itemC];

  // 1. Swap inside personal bag: index 0 and 1
  const swapPersonal = room.swapInventorySlots('p1', {
    fromArea: 'PERSONAL',
    fromIndex: 0,
    toArea: 'PERSONAL',
    toIndex: 1
  });
  assert.equal(swapPersonal.success, true);
  assert.equal(player.bag[0].id, 'item_b');
  assert.equal(player.bag[1].id, 'item_a');

  // 2. Transfer between personal and squad
  const swapSquad = room.swapInventorySlots('p1', {
    fromArea: 'PERSONAL',
    fromIndex: 0,
    toArea: 'SQUAD',
    toIndex: 1
  });
  assert.equal(swapSquad.success, true);
  assert.equal(room.squadInventory[1].id, 'item_b');
  assert.equal(player.bag[0], null);
});

test('Feature 5: Hex map allows adjacent unchosen nodes to be selected without backward movement', () => {
  const mockSocket = { id: 'p1', join: () => {}, emit: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }) };
  const room = new Room('test_room', mockSocket, 'Hero', mockIo);
  room.generateHexMap();

  // From start (0, 3)
  const startNext = room.getAdjacentNextHexes(0, 3);
  const startIds = startNext.map(n => n.id);
  assert.ok(startIds.includes('hex_1_2'));
  assert.ok(startIds.includes('hex_1_3'));
  assert.ok(startIds.includes('hex_1_4'));

  // Move to (1, 2)
  const upperNext = room.getAdjacentNextHexes(1, 2);
  const upperIds = upperNext.map(n => n.id);

  // Forward rightward upper node (2, 1) and straight node (2, 2) must be selectable
  assert.ok(upperIds.includes('hex_2_1'));
  assert.ok(upperIds.includes('hex_2_2'));

  // Adjacent rightward unchosen node (1, 3) must be selectable
  assert.ok(upperIds.includes('hex_1_3'));

  // Backward node (0, 3) must NOT be selectable
  assert.ok(!upperIds.includes('hex_0_3'));
});

test('Feature 6: Battle victory drops small equipment directly into squad bag without equipment choice dilemma', () => {
  const mockSocket = { id: 'p1', join: () => {}, emit: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }) };
  const room = new Room('test_room', mockSocket, 'Hero', mockIo);
  room.players.p1.role = 'warrior';
  room.squadInventory = [];

  const monster = { id: 'm1', name: '測試怪物', hp: 0, maxHp: 100, attack: 10 };
  room._currentMonster = monster;

  room.handleMonsterVictory(monster);

  // 1. Must be in BATTLE_VICTORY state
  assert.equal(room.state, 'BATTLE_VICTORY');

  // 2. Equipment must go directly into squad bag
  assert.equal(room.squadInventory.length, 1);
  const dropped = room.squadInventory[0];
  assert.ok(dropped, 'Small equipment should be present in squad inventory');

  // 3. Must be a small equipment (TIER 1 or 2), NEVER a class exclusive equipment
  assert.equal(Boolean(dropped.role), false, 'Dropped equipment must not have class-exclusive role requirement');
  assert.notEqual(dropped.tier, 'CLASS_EXCLUSIVE');
  assert.ok(TIER1_EQUIPMENTS.some(e => e.id === dropped.id) || TIER2_EQUIPMENTS.some(e => e.id === dropped.id));

  // 4. No pendingDrop dilemma
  assert.equal(room.pendingDrop, null);
  assert.equal(room.victoryPendingDrop, null);

  // 5. When presentation completes, interaction is ready and continue advances immediately
  const victoryId = room.currentVictory.presentationId;
  room.handleVictoryComplete('p1', victoryId);
  assert.equal(room.victoryInteractionReady, true);

  room.continueAfterVictory('p1', victoryId);
  assert.equal(room.floor, 2);
  assert.equal(room.state, 'CHOOSING_ROUTE');
});
