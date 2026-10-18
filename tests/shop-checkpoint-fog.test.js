import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { Room } from '../game/Room.js';
import {
  LOOT_TABLE,
  TIER1_EQUIPMENTS,
  TIER2_EQUIPMENTS,
  CRAFTING_RECIPES,
  EQUIP_SLOTS,
  determineEquipSlot
} from '../game/constants.js';

function createMockRoom(roles = ['warrior', 'mage', 'archer']) {
  const leaderSocket = { id: 'leader_sock', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }) };
  const room = new Room('TEST', leaderSocket, 'Leader', mockIo);
  room.players = {};
  roles.forEach((r, idx) => {
    const id = idx === 0 ? 'leader_sock' : `member_${idx}`;
    room.players[id] = {
      id,
      name: `Player_${r}`,
      role: r,
      hp: 100,
      maxHp: 100,
      bonusAtk: 0,
      connected: true,
      bag: [],
      equips: [],
      equipSlots: { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null }
    };
  });
  return room;
}

test('Requirement 1: Col 9 Boss is the only event that triggers Checkpoint (retreat/continue)', () => {
  const room = createMockRoom();

  // Test non-col-9 advancement (e.g. col 1 battle, chest, or shop)
  room.floor = 5;
  room.currentHex = { col: 1, row: 3, type: 'BATTLE' };
  room.advanceToNextFloorOrCheckpoint();
  assert.equal(room.state, 'CHOOSING_ROUTE', 'Col 1 should advance to CHOOSING_ROUTE even if floor % 5 === 0');

  // Test col 9 boss victory advancement
  room.currentHex = { col: 9, row: 3, type: 'END_ELITE' };
  room.advanceToNextFloorOrCheckpoint();
  assert.equal(room.state, 'CHECKPOINT', 'Col 9 boss defeat must enter CHECKPOINT state');

  // Leader chooses retreat ('end')
  room.handleCheckpointChoice('leader_sock', 'end');
  assert.equal(room.state, 'VICTORY', 'Choosing end must transition to VICTORY');

  // Test continue choice resets hex map and health
  const room2 = createMockRoom();
  room2.currentHex = { col: 9, row: 3, type: 'END_ELITE' };
  room2.advanceToNextFloorOrCheckpoint();
  assert.equal(room2.state, 'CHECKPOINT');

  room2.players.leader_sock.hp = 20;
  room2.players.leader_sock.poisonTurns = 2;
  room2.handleCheckpointChoice('leader_sock', 'continue');
  assert.equal(room2.state, 'CHOOSING_ROUTE');
  assert.equal(room2.players.leader_sock.hp, 100, 'Living players should be healed to full');
  assert.equal(room2.players.leader_sock.poisonTurns, 0, 'Debuffs should be cleared');
  assert.deepEqual(room2.currentHex, { col: 0, row: 3 }, 'Current hex position should reset to col 0, row 3');
});

test('Requirement 2: Shop generates exactly 4 items and contains 50% exclusive item priced at 250', () => {
  const room = createMockRoom(['warrior', 'mage']);
  room.gold = 1000;

  let exclusiveCount = 0;
  const iterations = 200;

  for (let i = 0; i < iterations; i++) {
    room.handleShopEvent({ id: 'hex_shop', col: 2, isShadyMerchant: false });
    assert.equal(room.currentEvent.items.length, 4, 'Shop must always offer exactly 4 items');

    const exclusiveItem = room.currentEvent.items.find(it => it.tier === 'CLASS_EXCLUSIVE' || it.slot === 'CLASS_EXCLUSIVE' || it.role);
    if (exclusiveItem) {
      exclusiveCount++;
      assert.equal(exclusiveItem.price, 250, 'Exclusive item base price must be 250');
      assert.ok(exclusiveItem.role, 'Exclusive item must define its role');
    }
  }

  // Check statistical 50% distribution (e.g. 35% ~ 65% for 200 samples)
  const ratio = exclusiveCount / iterations;
  assert.ok(ratio >= 0.35 && ratio <= 0.65, `Exclusive drop rate (${ratio}) should be around 50%`);

  // Test Assassin leader discount (20% discount => 250 * 0.8 = 200)
  const assassinRoom = createMockRoom(['assassin']);
  const origRandom = Math.random;
  Math.random = () => 0.1; // Force exclusive item
  try {
    assassinRoom.handleShopEvent({ id: 'hex_shop', col: 2 });
    const exclusiveItem = assassinRoom.currentEvent.items.find(it => it.tier === 'CLASS_EXCLUSIVE');
    assert.ok(exclusiveItem);
    assert.equal(exclusiveItem.price, 200, 'Assassin leader 20% discount should apply: 250 * 0.8 = 200');
  } finally {
    Math.random = origRandom;
  }
});

test('Requirement 3: General equipment image paths exist in public/assets/Equipments', () => {
  const equipDir = path.resolve('public/assets/Equipments');

  assert.equal(TIER1_EQUIPMENTS.length, 21, 'TIER1_EQUIPMENTS must contain 21 items');
  assert.equal(TIER2_EQUIPMENTS.length, 12, 'TIER2_EQUIPMENTS must contain 12 items');
  assert.equal(CRAFTING_RECIPES.length, 12, 'CRAFTING_RECIPES must contain 12 recipes');

  for (const item of [...TIER1_EQUIPMENTS, ...TIER2_EQUIPMENTS]) {
    const fileName = `${item.name}.webp`;
    const filePath = path.join(equipDir, fileName);
    assert.ok(fs.existsSync(filePath), `Asset image for ${item.name} (${fileName}) must exist in public/assets/Equipments`);
  }
});

test('Requirement 4: Class exclusive items match specifications', () => {
  const roles = [
    'warrior', 'mage', 'archer', 'assassin', 'bard',
    'alchemist', 'druid', 'dreamweaver', 'stargazer',
    'gladiator', 'samurai', 'sage', 'paladin', 'augur', 'onmyoji'
  ];

  for (const role of roles) {
    const roleItems = LOOT_TABLE.filter(it => it.role === role);
    assert.ok(roleItems.length >= 3, `Role ${role} must have at least 3 exclusive items in LOOT_TABLE`);
    for (const it of roleItems) {
      assert.equal(it.slot, EQUIP_SLOTS.CLASS_EXCLUSIVE);
      assert.equal(determineEquipSlot(it), EQUIP_SLOTS.CLASS_EXCLUSIVE);
    }
  }
});
