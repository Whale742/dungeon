import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import {
  TIER1_EQUIPMENTS,
  TIER2_EQUIPMENTS,
  CRAFTING_RECIPES,
  SPECIAL_ELITES,
  getCraftingRecipe
} from '../game/constants.js';

function createTestRoom(roles = ['warrior', 'mage', 'archer']) {
  const emitted = [];
  const io = {
    to: () => ({
      emit: (event, payload) => emitted.push({ event, payload })
    }),
    emit: (event, payload) => emitted.push({ event, payload })
  };
  const hostSocket = { id: 'p0', join: () => {}, leave: () => {} };
  const room = new Room('TEST', hostSocket, 'Player0', io);
  room.selectRole('p0', roles[0]);
  for (let i = 1; i < roles.length; i++) {
    const id = `p${i}`;
    room.addPlayer({ id, join: () => {}, leave: () => {} }, `Player${i}`);
    room.selectRole(id, roles[i]);
  }
  return room;
}

test('Phase 3: Inventory dual-layer management and capacity limits', () => {
  const room = createTestRoom();
  const p0 = room.players.p0;

  // Initial states
  assert.equal(room.gold, 0);
  assert.deepEqual(room.squadInventory, []);
  assert.deepEqual(p0.bag, []);
  assert.deepEqual(p0.equipSlots, {
    WEAPON: null,
    ARMOR: null,
    ACCESSORY: null,
    CLASS_EXCLUSIVE: null
  });

  // Add 4 items to p0 bag
  for (let i = 0; i < 4; i++) {
    p0.bag.push({ ...TIER1_EQUIPMENTS[i] });
  }
  assert.equal(p0.bag.length, 4);

  // Transfer 1 item to squad inventory
  const transferRes = room.transferToSquad('p0', 0);
  assert.equal(transferRes.success, true);
  assert.equal(p0.bag.length, 3);
  assert.equal(room.squadInventory.length, 1);

  // Transfer back to personal bag
  const backRes = room.transferToPersonal('p0', 0);
  assert.equal(backRes.success, true);
  assert.equal(p0.bag.length, 4);
  assert.equal(room.squadInventory.length, 0);

  // Capacity test: Personal bag max is 4
  room.squadInventory.push({ ...TIER1_EQUIPMENTS[0] });
  const fullRes = room.transferToPersonal('p0', 0);
  assert.equal(fullRes.success, false);
  assert.match(fullRes.message, /個人背包已滿/);

  // Capacity test: Squad inventory max is 19 (3-4-5-4-3 honeycomb)
  room.squadInventory = [];
  for (let i = 0; i < 19; i++) {
    room.squadInventory.push({ ...TIER1_EQUIPMENTS[0] });
  }
  assert.equal(room.squadInventory.length, 19);
  const squadFullRes = room.transferToSquad('p0', 0);
  assert.equal(squadFullRes.success, false);
  assert.match(squadFullRes.message, /小隊.*已滿/);

  // Test addItemPrioritySquad prioritizes squad first, then personal bag
  room.squadInventory = [];
  const prioritySquadRes = room.addItemPrioritySquad({ ...TIER1_EQUIPMENTS[0] });
  assert.equal(prioritySquadRes.target, 'squad');
  assert.equal(room.squadInventory.length, 1);

  // When squad is 19 full, priority goes to personal bag
  for (let i = 1; i < 19; i++) {
    room.squadInventory.push({ ...TIER1_EQUIPMENTS[0] });
  }
  p0.bag = [];
  const fallbackPersonalRes = room.addItemPrioritySquad({ ...TIER1_EQUIPMENTS[0] }, 'p0');
  assert.equal(fallbackPersonalRes.target, 'personal');
  assert.equal(p0.bag.length, 1);
});

test('Phase 3: Equip and unequip slots with stat updates', () => {
  const room = createTestRoom(['warrior']);
  const p0 = room.players.p0;

  // short_sword (WEAPON: bonusAtk +4)
  const sword = TIER1_EQUIPMENTS.find(e => e.id === 'short_sword');
  assert.ok(sword);
  p0.bag.push({ ...sword });
  
  const equipRes = room.equipItemFromBag('p0', 0);
  assert.equal(equipRes.success, true);
  assert.equal(p0.bag.length, 0);
  assert.equal(p0.equipSlots.WEAPON.id, 'short_sword');
  assert.equal(p0.bonusAtk, sword.bonusAtk);

  // buckler (ARMOR: bonusDef +2)
  const buckler = TIER1_EQUIPMENTS.find(e => e.id === 'buckler');
  assert.ok(buckler);
  p0.bag.push({ ...buckler });
  const equipShieldRes = room.equipItemFromBag('p0', 0);
  assert.equal(equipShieldRes.success, true);
  assert.equal(p0.equipSlots.ARMOR.id, 'buckler');
  assert.equal(p0.bonusDef, 2);

  // Unequip weapon to personal bag
  const unequipRes = room.unequipItemToBag('p0', 'WEAPON');
  assert.equal(unequipRes.success, true);
  assert.equal(p0.equipSlots.WEAPON, null);
  assert.equal(p0.bag.length, 1);
  assert.equal(p0.bonusAtk, 0);
});

test('Phase 3: Tier 1 to Tier 2 equipment crafting and recipes', () => {
  const room = createTestRoom(['mage']);
  const p0 = room.players.p0;

  // Recipe: short_sword + magic_crystal -> rune_greatsword
  const recipe = getCraftingRecipe('short_sword', 'magic_crystal');
  assert.ok(recipe);
  assert.equal(recipe.resultId, 'rune_greatsword');

  // Put ingredients into squad inventory
  room.squadInventory = [
    { ...TIER1_EQUIPMENTS.find(e => e.id === 'short_sword') },
    { ...TIER1_EQUIPMENTS.find(e => e.id === 'magic_crystal') }
  ];

  const craftRes = room.craftEquipment('p0', 'short_sword', 'magic_crystal', true);
  assert.equal(craftRes.success, true);
  assert.equal(craftRes.item.id, 'rune_greatsword');
  assert.equal(room.squadInventory.length, 1);
  assert.equal(room.squadInventory[0].id, 'rune_greatsword');

  // Verify all 5 crafting recipes
  const expectedOutputs = [
    'rune_greatsword',
    'ring_of_life',
    'steel_plate_armor',
    'assault_blade',
    'guardian_pendant'
  ];
  for (const r of CRAFTING_RECIPES) {
    assert.ok(expectedOutputs.includes(r.resultId));
    assert.ok(TIER2_EQUIPMENTS.some(e => e.id === r.resultId));
  }
});

test('Phase 3: Alchemist leader crafting refund perk', () => {
  const room = createTestRoom(['alchemist']);
  room.lockedLeaderRole = 'alchemist';

  room.squadInventory = [
    { ...TIER1_EQUIPMENTS.find(e => e.id === 'short_sword') },
    { ...TIER1_EQUIPMENTS.find(e => e.id === 'magic_crystal') }
  ];

  // Craft with alchemist leader and deterministic rng (0.05 < 0.2 refund chance)
  const originalRandom = Math.random;
  Math.random = () => 0.05;
  try {
    const res = room.craftEquipment('p0', 'short_sword', 'magic_crystal', true);
    assert.equal(res.success, true);
    assert.equal(res.item.id, 'rune_greatsword');
    // 1 item crafted + 1 refunded material in squadInventory
    assert.equal(room.squadInventory.length, 2);
    assert.ok(room.squadInventory.some(i => i.id === 'rune_greatsword'));
  } finally {
    Math.random = originalRandom;
  }
});

test('Phase 3: Normal Shop event (Buy items & Rest service)', () => {
  const room = createTestRoom(['warrior', 'cleric']);
  room.gold = 150;
  room.players.p0.hp = 50;

  room.handleShopEvent(false);
  assert.equal(room.state, 'EVENT');
  assert.equal(room.currentEvent.type, 'shop');
  assert.equal(room.currentEvent.isShady, false);
  assert.equal(room.currentEvent.items.length, 3);

  const good = room.currentEvent.items[0];
  const originalGold = room.gold;
  
  // Buy good
  const buyRes = room.handleShopAction('p0', 'buy', { itemId: good.id });
  assert.equal(buyRes.success, true);
  assert.equal(room.gold, originalGold - good.price);
  assert.equal(room.squadInventory.length, 1);
  assert.equal(room.squadInventory[0].id, good.id);

  // Buy Rest
  const hpBefore = room.players.p0.hp;
  const restRes = room.handleShopAction('p0', 'rest');
  assert.equal(restRes.success, true);
  assert.ok(room.players.p0.hp > hpBefore);

  // Leave shop
  const leaveRes = room.handleShopAction('p0', 'leave');
  assert.equal(leaveRes.success, true);
  assert.equal(room.state, 'CHOOSING_ROUTE');
});

test('Phase 3: Shady Merchant (Robbery & Steal options)', () => {
  const room = createTestRoom(['assassin']);
  room.gold = 100;
  room.handleShopEvent(true);
  assert.equal(room.currentEvent.isShady, true);

  // Robbery option launches battle with shady_merchant
  const robRes = room.handleShopAction('p0', 'rob');
  assert.equal(robRes.success, true);
  assert.equal(room.state, 'IN_BATTLE');
  assert.equal(room.currentMonster.name, SPECIAL_ELITES.shady_merchant.name);
});

test('Phase 3: Chest event (Normal chest & Mimic pacify by druid)', () => {
  const room = createTestRoom(['druid']);

  // Mimic chest
  room.handleChestEvent(true);
  assert.equal(room.currentEvent.type, 'chest');
  assert.equal(room.currentEvent.isMimic, true);

  // Druid pacify
  const pacifyRes = room.handleChestAction('p0', 'pacify');
  assert.equal(pacifyRes.success, true);
  assert.ok(pacifyRes.drop);
  assert.equal(room.squadInventory.length, 1);
  assert.equal(room.state, 'CHOOSING_ROUTE');
});

test('Phase 3: Random Events (Wandering Merchant, Altar, Gamble, Reforge)', () => {
  const room = createTestRoom(['warrior']);
  room.gold = 200;

  // Gamble
  room.handleRandomEvent('GAMBLE');
  assert.equal(room.currentEvent.type, 'random_event');
  assert.equal(room.currentEvent.subType, 'GAMBLE');
  
  const gambleRes = room.handleRandomEventAction('p0', 'bet', { amount: 50, win: true });
  assert.equal(gambleRes.success, true);
  assert.equal(room.gold, 250);

  // Altar
  room.handleRandomEvent('ALTAR');
  const hpBefore = room.players.p0.hp;
  const altarRes = room.handleRandomEventAction('p0', 'sacrifice');
  assert.equal(altarRes.success, true);
  assert.ok(room.players.p0.hp < hpBefore);
  assert.equal(room.players.p0.bonusAtk, 3);

  // Reforge
  room.squadInventory = [{ ...TIER1_EQUIPMENTS[0] }];
  room.handleRandomEvent('REFORGE');
  const atkBefore = room.squadInventory[0].bonusAtk || 0;
  const reforgeRes = room.handleRandomEventAction('p0', 'reforge');
  assert.equal(reforgeRes.success, true);
  assert.ok(room.squadInventory[0].bonusAtk > atkBefore);
});
