import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room } from '../game/Room.js';
import {
  CONSUMABLES,
  getItemBasePrice,
  determineEquipSlot,
  TIER1_EQUIPMENTS,
  TIER2_EQUIPMENTS,
  EQUIP_SLOTS,
  BASE_GOLD_DROPS,
  getGoldIncomeMultiplier,
  getShopPriceMultiplier,
  calculateBattleGold,
  calculateShopBuyPrice,
  calculateItemSellPrice
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
      equipSlots: { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null },
      cooldowns: {},
      poisonTurns: 0,
      poisonDmg: 0,
      burnTurns: 0,
      burnDmg: 0,
      bleedTurns: 0,
      bleedDmg: 0
    };
  });
  room.lockedLeaderId = 'leader_sock';
  room.lockedLeaderRole = roles[0];
  return room;
}

test('Feature 1: Normal Shop vs Shady Merchant pricing and recycling rates', () => {
  const room = createMockRoom(['warrior']);
  room.floor = 2;

  // 1. 一般商店 (isShady = false)
  room.handleShopEvent({ id: 'shop_1', col: 2, isShadyMerchant: false });
  assert.equal(room.currentEvent.isShady, false);
  assert.ok(room.currentEvent.recycleRate >= 0.50 && room.currentEvent.recycleRate <= 0.60, `Normal shop recycle rate (${room.currentEvent.recycleRate}) should be 50% ~ 60%`);
  assert.equal(room.currentEvent.priceMultiplier, 1.0);
  assert.equal(room.currentEvent.items.length, 6);
  assert.equal(room.currentEvent.consumables.length, 3);
  assert.deepEqual(room.currentEvent.buybackPool, []);

  // 2. 奸商模式 (isShady = true)
  room.handleShopEvent({ id: 'shop_shady', col: 4, isShadyMerchant: true });
  assert.equal(room.currentEvent.isShady, true);
  assert.ok(room.currentEvent.recycleRate >= 0.10 && room.currentEvent.recycleRate <= 0.20, `Shady recycle rate (${room.currentEvent.recycleRate}) should be 10% ~ 20%`);
  assert.ok(room.currentEvent.priceMultiplier >= 1.50 && room.currentEvent.priceMultiplier <= 2.00, `Shady price multiplier (${room.currentEvent.priceMultiplier}) should be 150% ~ 200%`);
});

test('Feature 1: Selling items, buyback at exact sold price, and pool cleared on exit', () => {
  const room = createMockRoom(['warrior']);
  room.gold = 100;

  // Add an item to squad bag
  const sword = structuredClone(TIER1_EQUIPMENTS[0]); // cost 50
  sword.droppedAtCol = 1;
  room.squadInventory = [sword];

  // Enter normal shop with fixed recycle rate 0.50 for test determinism
  room.handleShopEvent({ id: 'shop_test', col: 2, isShadyMerchant: false });
  room.currentEvent.recycleRate = 0.50;
  room.currentEvent.sellRatio = 0.50;

  // Sell the sword (basePrice = 50, recycleRate = 0.50 => 25G)
  const sellRes = room.handleShopAction('leader_sock', 'sell', { fromArea: 'squad', index: 0 });
  assert.equal(sellRes.success, true);
  assert.equal(sellRes.soldPrice, 25);
  assert.equal(room.gold, 125, 'Player receives 25G from selling sword');
  assert.equal(room.squadInventory.length, 0, 'Sword removed from squad inventory');
  assert.equal(room.currentEvent.buybackPool.length, 1, 'Sword stored in buybackPool');
  assert.equal(room.currentEvent.buybackPool[0].soldPrice, 25);

  // Buy back the sword at exact soldPrice (25G)
  const buybackRes = room.handleShopAction('leader_sock', 'buyback', { buybackIndex: 0 });
  assert.equal(buybackRes.success, true);
  assert.equal(room.gold, 100, 'Gold deducted by 25G on buyback');
  assert.equal(room.squadInventory.length, 1, 'Sword returned to squad inventory');
  assert.equal(room.squadInventory[0].name, sword.name);
  assert.equal(room.currentEvent.buybackPool.length, 0, 'buybackPool is now empty');

  // Sell again, then leave shop -> pool cleared
  room.handleShopAction('leader_sock', 'sell', { fromArea: 'squad', index: 0 });
  assert.equal(room.currentEvent.buybackPool.length, 1);
  room.handleShopAction('leader_sock', 'leave');
  assert.equal(room.currentEvent, null, 'Leaving shop closes event');
  assert.equal(room.state, 'CHOOSING_ROUTE');
});

test('Feature 2: Consumables (Antidote, Healing Potion, Rest Tent) purchase and effects', () => {
  const room = createMockRoom(['warrior', 'mage']);
  room.gold = 500;
  room.handleShopEvent({ id: 'shop_event', col: 2, isShadyMerchant: false });
  room.currentEvent.priceMultiplier = 1.0;

  // 1. Buy Antidote
  const buyAntidote = room.handleShopAction('leader_sock', 'buy', { isConsumable: true, consumableIndex: 0 });
  assert.equal(buyAntidote.success, true);
  assert.equal(room.squadInventory.length, 1);
  assert.equal(room.squadInventory[0].effectType, 'ANTIDOTE');

  // 2. Buy Healing Potion
  const buyPotion = room.handleShopAction('leader_sock', 'buy', { isConsumable: true, consumableIndex: 0 }); // index 0 of remaining
  assert.equal(buyPotion.success, true);
  assert.equal(room.squadInventory.length, 2);

  // 3. Buy Rest Tent
  const buyTent = room.handleShopAction('leader_sock', 'buy', { isConsumable: true, consumableIndex: 0 });
  assert.equal(buyTent.success, true);
  assert.equal(room.squadInventory.length, 3);

  // Leave shop
  room.handleShopAction('leader_sock', 'leave');
  assert.equal(room.state, 'CHOOSING_ROUTE');

  // Test Antidote effect: clears debuffs on target player
  const warrior = room.players.leader_sock;
  warrior.poisonTurns = 3;
  warrior.poisonDmg = 5;
  warrior.burnTurns = 2;
  warrior.bleedTurns = 1;

  const antidoteIdx = room.squadInventory.findIndex(i => i.effectType === 'ANTIDOTE');
  const useAntidoteRes = room.useConsumableItem('leader_sock', { fromArea: 'squad', index: antidoteIdx, targetPlayerId: warrior.id });
  assert.equal(useAntidoteRes.success, true);
  assert.equal(warrior.poisonTurns, 0);
  assert.equal(warrior.burnTurns, 0);
  assert.equal(warrior.bleedTurns, 0);

  // Test Healing Potion effect: heals 40% max HP
  warrior.hp = 20;
  const potionIdx = room.squadInventory.findIndex(i => i.effectType === 'HEALING_POTION');
  const usePotionRes = room.useConsumableItem('leader_sock', { fromArea: 'squad', index: potionIdx, targetPlayerId: warrior.id });
  assert.equal(usePotionRes.success, true);
  assert.equal(warrior.hp, 60, 'Heals 40% of 100 max HP: 20 + 40 = 60');

  // Test Rest Tent effect: only in CHOOSING_ROUTE / MAP_ROUTING
  room.state = 'EVENT';
  const tentIdx = room.squadInventory.findIndex(i => i.effectType === 'REST_TENT');
  const failTentRes = room.useConsumableItem('leader_sock', { fromArea: 'squad', index: tentIdx });
  assert.equal(failTentRes.success, false, 'Rest Tent cannot be used outside route selection');

  room.state = 'CHOOSING_ROUTE';
  warrior.hp = 40;
  warrior.poisonTurns = 2;
  const mage = room.players.member_1;
  mage.hp = 30;
  mage.burnTurns = 2;

  const successTentRes = room.useConsumableItem('leader_sock', { fromArea: 'squad', index: tentIdx });
  assert.equal(successTentRes.success, true);
  assert.ok(warrior.hp >= 90, 'Party heals large amount of HP');
  assert.ok(mage.hp >= 80, 'Party heals large amount of HP');
  assert.equal(warrior.poisonTurns, 0, 'Debuffs cleared by Rest Tent');
  assert.equal(mage.burnTurns, 0, 'Debuffs cleared by Rest Tent');
  assert.equal(room.state, 'CHOOSING_ROUTE', 'State remains in CHOOSING_ROUTE for continued exploration');
});

test('Feature 3: Battle victory preserves debuffs and does not auto-heal, debuffs decay 1 per node advance', () => {
  const room = createMockRoom(['warrior']);
  const warrior = room.players.leader_sock;
  warrior.hp = 35;
  warrior.poisonTurns = 3;
  warrior.poisonDmg = 5;
  warrior.burnTurns = 2;

  // Mock battle monster and defeat it
  room.currentMonster = {
    name: '深淵小怪',
    hp: 0,
    maxHp: 50,
    isBoss: false,
    goldDrop: 30
  };
  room.state = 'BATTLE';

  // Trigger battle end victory routine
  room.handleMonsterVictory(room.currentMonster, [], [], true);

  // Verify: HP did NOT auto-heal (+10 or +20% was removed)
  assert.equal(warrior.hp, 35, 'Battle victory must NOT automatically heal player HP');
  assert.equal(warrior.poisonTurns, 3, 'Battle victory must NOT clear poisonTurns');
  assert.equal(warrior.burnTurns, 2, 'Battle victory must NOT clear burnTurns');

  // Step 1 node forward (resolveRouteChoice)
  room.resolveRouteChoice({ id: 'hex_next_1' });
  assert.equal(warrior.poisonTurns, 2, 'Advancing 1 node reduces poisonTurns by 1 (3 -> 2)');
  assert.equal(warrior.burnTurns, 1, 'Advancing 1 node reduces burnTurns by 1 (2 -> 1)');

  // Step 2nd node forward
  room.resolveRouteChoice({ id: 'hex_next_2' });
  assert.equal(warrior.poisonTurns, 1, 'Advancing 2nd node reduces poisonTurns by 1 (2 -> 1)');
  assert.equal(warrior.burnTurns, 0, 'burnTurns decrements to 0 and expires');

  // Step 3rd node forward
  room.resolveRouteChoice({ id: 'hex_next_3' });
  assert.equal(warrior.poisonTurns, 0, 'poisonTurns decrements to 0 and expires');
});

test('Feature 4: determineEquipSlot recognizes CONSUMABLE and getItemBasePrice handles all tiers', () => {
  const antidote = CONSUMABLES.find(c => c.id === 'consumable_antidote');
  assert.equal(determineEquipSlot(antidote), 'CONSUMABLE');
  assert.equal(getItemBasePrice(antidote), 30);

  const healingPotion = CONSUMABLES.find(c => c.id === 'consumable_healing_potion');
  assert.equal(getItemBasePrice(healingPotion), 40);

  const restTent = CONSUMABLES.find(c => c.id === 'consumable_rest_tent');
  assert.equal(getItemBasePrice(restTent), 100);

  const t1 = TIER1_EQUIPMENTS[0];
  assert.equal(getItemBasePrice(t1), t1.cost || 50);

  const t2 = TIER2_EQUIPMENTS[0];
  assert.equal(getItemBasePrice(t2), 120);

  const exclusive = { tier: 'CLASS_EXCLUSIVE', role: 'warrior' };
  assert.equal(getItemBasePrice(exclusive), 250);
});

test('Feature 4b: Tooltip positioning calculates cursor right-side offset and clamps within viewport', () => {
  const tw = 240;
  const vw = 1000;
  const pad = 12;

  function calcTooltipLeft(clientX) {
    let left = clientX + 16;
    if (left + tw > vw - pad) {
      left = clientX - tw - 16;
    }
    if (left < pad) left = pad;
    return left;
  }

  // Normal position at clientX = 100 -> left = 116 (right side of cursor)
  assert.equal(calcTooltipLeft(100), 116);

  // Near right edge at clientX = 800 -> 800 + 16 + 240 = 1056 > 988 -> flips to left: 800 - 240 - 16 = 544
  assert.equal(calcTooltipLeft(800), 544);

  // Near left edge
  assert.equal(calcTooltipLeft(50), 66);
});

test('Feature 5: Economy Formulas - Gold multiplier, shop price multiplier, battle gold, buy & sell prices', () => {
  // 1. Gold income multiplier
  assert.equal(getGoldIncomeMultiplier(1), 1.0);
  assert.equal(Math.round(getGoldIncomeMultiplier(5) * 100) / 100, 1.72);
  assert.equal(Math.round(getGoldIncomeMultiplier(9) * 100) / 100, 2.44);

  // 2. Shop price multiplier
  assert.equal(getShopPriceMultiplier(1), 1.0);
  assert.equal(Math.round(getShopPriceMultiplier(5) * 1000) / 1000, 2.56); // 1 + 0.25*4 + 0.035*16 = 2.56
  // Ensure shop price growth always outpaces gold income growth
  for (let c = 2; c <= 9; c++) {
    assert.ok(getShopPriceMultiplier(c) > getGoldIncomeMultiplier(c), `Shop price mult at col ${c} must exceed gold income mult`);
  }

  // 3. calculateBattleGold
  const minion = { name: '小怪', tier: 'MINION' };
  const elite = { name: '精英怪', tier: 'ELITE', isElite: true };
  const mimicMinion = { name: '【狂暴】小怪', isMimicAmbush: true };

  const minionGold = calculateBattleGold([minion], 1, false);
  assert.ok(minionGold >= Math.round(15 * 0.9) && minionGold <= Math.round(15 * 1.1));

  const mimicGold = calculateBattleGold([mimicMinion], 1, false);
  assert.ok(mimicGold >= Math.round(25 * 0.9) && mimicGold <= Math.round(25 * 1.1), `Mimic minion gold (${mimicGold}) should scale from base 25`);
  assert.ok(mimicGold > minionGold, 'Mimic minion awards more gold than normal minion');

  const origRng = Math.random;
  Math.random = () => 0.5; // variance = 1.0 exactly
  try {
    const eliteGoldGladiator = calculateBattleGold([elite], 1, true);
    const eliteGoldNormal = calculateBattleGold([elite], 1, false);
    assert.equal(eliteGoldNormal, 40);
    assert.equal(eliteGoldGladiator, 52); // 40 * 1.3 = 52
  } finally {
    Math.random = origRng;
  }

  // 4. calculateShopBuyPrice
  const normalSession = { isShady: false, shadyBuyMult: 1.0, sellRatio: 0.55, isAssassinCaptain: false };
  assert.equal(calculateShopBuyPrice(100, 1, normalSession), 100);
  assert.equal(calculateShopBuyPrice(100, 5, normalSession), 256);

  // Assassin captain gets 20% discount on non-shady shop
  const assassinSession = { isShady: false, shadyBuyMult: 1.0, sellRatio: 0.55, isAssassinCaptain: true };
  assert.equal(calculateShopBuyPrice(100, 1, assassinSession), 80);
  assert.equal(calculateShopBuyPrice(100, 5, assassinSession), Math.round(256 * 0.8));

  // Shady merchant raises prices by shadyBuyMult (e.g. 1.8x)
  const shadySession = { isShady: true, shadyBuyMult: 1.8, sellRatio: 0.15, isAssassinCaptain: true };
  assert.equal(calculateShopBuyPrice(100, 1, shadySession), 180);

  // 5. calculateItemSellPrice (anchored to droppedAtCol)
  const itemCol1 = { name: '劍', basePrice: 100, droppedAtCol: 1 };
  assert.equal(calculateItemSellPrice(itemCol1, { isShady: false, sellRatio: 0.50 }), 50);

  // Item dropped at col 5 has valuation = 100 * 1.72 = 172
  const itemCol5 = { name: '高階劍', basePrice: 100, droppedAtCol: 5 };
  assert.equal(calculateItemSellPrice(itemCol5, { isShady: false, sellRatio: 0.50 }), 86);
  assert.equal(calculateItemSellPrice(itemCol5, { isShady: true, sellRatio: 0.10 }), 17);
});

test('Feature 6: Pre-departure prep mechanism (Gold = players * 45, 6 general items, no exclusive items)', () => {
  const room = createMockRoom(['warrior', 'mage', 'archer']);
  // 3 players -> 3 * 45 = 135 gold
  room.state = 'LOBBY';
  const startRes = room.startAdventure('leader_sock');
  assert.equal(startRes.success, true);
  assert.equal(room.gold, 135, 'Team gets players * 45 gold upon departure');

  // Complete prologue -> triggers prep shop
  room.handlePrologueComplete('leader_sock');
  room.handlePrologueComplete('member_1');
  room.handlePrologueComplete('member_2');

  assert.equal(room.state, 'EVENT');
  assert.equal(room.currentEvent.type, 'shop');
  assert.equal(room.currentEvent.isPrepShop, true);
  assert.equal(room.currentEvent.col, 1);
  assert.equal(room.currentEvent.items.length, 6, 'Prep shop has exactly 6 items');
  assert.equal(room.currentEvent.consumables.length, 3, 'Prep shop offers 3 consumables');

  // Verify none of the items are class exclusive
  for (const item of room.currentEvent.items) {
    assert.notEqual(item.slot, 'CLASS_EXCLUSIVE', 'Prep shop must not sell class exclusive equipments');
    assert.notEqual(item.tier, 'CLASS_EXCLUSIVE');
    assert.equal(item.droppedAtCol, 1);
  }

  // Leaving prep shop enters route selection at floor 1, col 0
  const leaveRes = room.handleShopAction('leader_sock', 'leave');
  assert.equal(leaveRes.success, true);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.floor, 1, 'Floor remains 1 when leaving prep shop');
  assert.equal(room.currentHex.col, 0, 'Current hex col remains 0');
});

test('Feature 7: Treasure Mimic Ambush - Appears as normal chest, no loot on open, spawns buffed minions with more gold', () => {
  const room = createMockRoom(['warrior', 'mage']);
  room.gold = 50;
  room.squadInventory = [];

  // 1. Encounter mimic chest node
  room.handleChestEvent({ id: 'hex_mimic', col: 2, isMimic: true });
  assert.equal(room.state, 'EVENT');
  assert.equal(room.currentEvent.type, 'chest');
  assert.equal(room.currentEvent.opened, false);
  assert.equal(room.currentEvent.canOpen, true);
  assert.equal(room.currentEvent.title, '🎁 發現古老寶箱！', 'Mimic chest appears identical to normal chest initially');

  // 2. Open mimic chest
  const openRes = room.handleChestAction('leader_sock', 'open');
  assert.equal(openRes.success, true);
  assert.equal(openRes.isMimic, true);

  // Player gets NO loot and NO gold
  assert.equal(room.gold, 50, 'No gold awarded on opening mimic chest');
  assert.equal(room.squadInventory.length, 0, 'No equipment awarded on opening mimic chest');

  // Spawns combat event with buffed ambush minions
  assert.equal(room.state, 'IN_BATTLE');
  assert.ok(room.enemies.length >= 2, 'Spawns 2~3 minions');

  for (const minion of room.enemies) {
    assert.equal(minion.isMimicAmbush, true, 'Minion flagged with isMimicAmbush');
    assert.ok(minion.name.startsWith('【狂暴】'), 'Minion name has 【狂暴】 prefix');
    assert.ok(minion.hp > 0);
    assert.ok(minion.attack > 0);
  }

  // 3. Victory over mimic ambush awards higher gold
  const goldBefore = room.gold;
  room.handleMonsterVictory(room.enemies[0]);
  assert.ok(room.gold > goldBefore, 'Gold awarded on defeating mimic minions');
});

test('Feature 9: Discard system, non-shop sell restrictions, and in-battle personal consumable usage', () => {
  const room = createMockRoom(['warrior', 'cleric']);
  const warrior = room.players['leader_sock'];
  const cleric = room.players['member_1'];
  room.gold = 100;

  const sword = { id: 'test_sword', name: '鐵劍', slot: 'WEAPON', type: 'WEAPON', basePrice: 50, bonusAtk: 10 };
  const potion = CONSUMABLES.find(c => c.id === 'consumable_healing_potion');
  const antidote = CONSUMABLES.find(c => c.id === 'consumable_antidote');

  // 1. Selling outside shop is strictly rejected
  room.state = 'MAP_ROUTING';
  room.currentEvent = null;
  warrior.bag.push(sword);
  const rejectOutsideShop = room.handleShopAction('leader_sock', 'sell', { fromArea: 'personal', index: 0 });
  assert.equal(rejectOutsideShop.success, false);
  assert.ok(rejectOutsideShop.message.includes('非商店區域無法販售裝備'));

  // 2. Selling consumables is strictly rejected even inside shop
  room.state = 'EVENT';
  room.handleShopEvent({ id: 'shop_test', col: 1, isShadyMerchant: false });
  warrior.bag = [potion, antidote];
  const rejectPotionSell = room.handleShopAction('leader_sock', 'sell', { fromArea: 'personal', index: 0 });
  assert.equal(rejectPotionSell.success, false);
  assert.ok(rejectPotionSell.message.includes('只能丟棄，不能販售'));

  const rejectAntidoteSell = room.handleShopAction('leader_sock', 'sell', { fromArea: 'personal', index: 1 });
  assert.equal(rejectAntidoteSell.success, false);
  assert.ok(rejectAntidoteSell.message.includes('只能丟棄，不能販售'));

  // 3. Discarding items (squad, personal, equip) does not grant gold
  const goldBeforeDiscard = room.gold;
  room.squadInventory = [sword];
  const discardSquadRes = room.discardItem('leader_sock', { fromArea: 'squad', index: 0 });
  assert.equal(discardSquadRes.success, true);
  assert.equal(room.squadInventory.length, 0);
  assert.equal(room.gold, goldBeforeDiscard, 'Discarding from squad grants 0 gold');

  warrior.bag = [potion];
  const discardPersonalRes = room.discardItem('leader_sock', { fromArea: 'personal', index: 0 });
  assert.equal(discardPersonalRes.success, true);
  assert.equal(warrior.bag.length, 0);
  assert.equal(room.gold, goldBeforeDiscard, 'Discarding consumable grants 0 gold');

  warrior.equipSlots.WEAPON = sword;
  const discardEquipRes = room.discardItem('leader_sock', { fromArea: 'equip', slotKey: 'WEAPON' });
  assert.equal(discardEquipRes.success, true);
  assert.equal(warrior.equipSlots.WEAPON, null);
  assert.equal(room.gold, goldBeforeDiscard, 'Discarding equipped weapon grants 0 gold');

  // 4. In-battle consumable usage from personal bag
  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';
  const monster = { id: 'm1', instanceId: 'm1', name: '哥布林', hp: 50, maxHp: 50, attack: 0, atk: 0 };
  room.currentMonster = monster;
  room.enemies = [monster];
  warrior.hp = 30; // Injured
  warrior.maxHp = 100;
  warrior.bag = [potion, antidote];

  // Lock battle action with healing potion
  const lockPotion = room.lockAction('leader_sock', 'use_item_healing_potion', 'leader_sock');
  assert.equal(lockPotion.success, true);
  assert.equal(warrior.action, 'use_item_healing_potion');

  // Lock cleric action
  room.lockAction('member_1', 'basic');

  // Execute turn
  room.resolveTurnActions();
  assert.ok(warrior.hp > 30, 'Warrior HP healed by healing potion');
  assert.equal(warrior.bag.length, 1, '1 healing potion consumed from bag');
  assert.equal(warrior.bag[0].id, 'consumable_antidote', 'Only antidote remains');

  // Now apply debuffs to cleric and have warrior use antidote on cleric
  cleric.poisonTurns = 3;
  cleric.poisonDmg = 5;
  cleric.burnTurns = 2;
  cleric.burnDmg = 4;
  warrior.isLocked = false;
  cleric.isLocked = false;
  room.selectionState = 'SELECTING';

  const lockAntidote = room.lockAction('leader_sock', 'use_item_antidote', 'member_1');
  assert.equal(lockAntidote.success, true);
  room.lockAction('member_1', 'basic');

  room.resolveTurnActions();
  assert.equal(cleric.poisonTurns, 0, 'Cleric poison cleansed by antidote');
  assert.equal(cleric.burnTurns, 0, 'Cleric burn cleansed by antidote');
  assert.equal(warrior.bag.length, 0, 'Antidote consumed from warrior bag');

  // Attempting to use item when not in bag is rejected
  warrior.isLocked = false;
  room.selectionState = 'SELECTING';
  const rejectNoItem = room.lockAction('leader_sock', 'use_item_healing_potion', 'leader_sock');
  assert.equal(rejectNoItem.success, false);
  assert.ok(rejectNoItem.message.includes('無治療藥'));

  // 5. Client UI checks
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf-8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf-8');

  assert.ok(indexHtml.includes('id="discardConfirmModal"'), 'discardConfirmModal exists in index.html');
  assert.ok(indexHtml.includes('id="btnConfirmDiscard"'), 'btnConfirmDiscard exists in index.html');
  assert.ok(indexHtml.includes('id="btnCancelDiscard"'), 'btnCancelDiscard exists in index.html');

  assert.ok(styleCss.includes('.btn-tooltip-use'), '.btn-tooltip-use styled in style.css');
  assert.ok(styleCss.includes('.btn-tooltip-discard'), '.btn-tooltip-discard styled in style.css');
  assert.ok(styleCss.includes('.skill-item-btn'), '.skill-item-btn styled in style.css');

  assert.ok(appJs.includes('openDiscardConfirmModal'), 'openDiscardConfirmModal defined in app.js');
  assert.ok(appJs.includes('inventory:discard_item'), 'inventory:discard_item emitted in app.js');
  assert.ok(appJs.includes('use_item_healing_potion'), 'use_item_healing_potion handled in app.js');
  assert.ok(appJs.includes('use_item_antidote'), 'use_item_antidote handled in app.js');
});

test('Feature 10: In-battle turn consumption for items and inventory drag-and-drop slot validation & swap', () => {
  const room = createMockRoom(['warrior', 'cleric']);
  const warrior = room.players['leader_sock'];
  const cleric = room.players['member_1'];

  const swordA = { id: 'sword_a', name: '鐵劍', slot: 'WEAPON', type: 'WEAPON', bonusAtk: 5 };
  const swordB = { id: 'sword_b', name: '鋼劍', slot: 'WEAPON', type: 'WEAPON', bonusAtk: 10 };
  const armor = { id: 'armor_a', name: '鎖子甲', slot: 'ARMOR', type: 'ARMOR', bonusDef: 5 };
  const ring = { id: 'ring_a', name: '守護戒指', slot: 'ACCESSORY', type: 'ACCESSORY', bonusDef: 2 };
  const exclusivePaladin = { id: 'pal_shield', name: '聖光之盾', slot: 'CLASS_EXCLUSIVE', tier: 'CLASS_EXCLUSIVE', role: 'paladin' };
  const potion = CONSUMABLES.find(c => c.id === 'consumable_healing_potion');
  const antidote = CONSUMABLES.find(c => c.id === 'consumable_antidote');

  // 1. In-battle item usage requires turn action; direct useConsumableItem fails
  room.state = 'IN_BATTLE';
  warrior.bag = [potion];
  const directUseRes = room.useConsumableItem('leader_sock', { fromArea: 'personal', index: 0 });
  assert.equal(directUseRes.success, false);
  assert.ok(directUseRes.message.includes('戰鬥中消耗品需消耗回合行動'));

  // 2. Personal bag internal swap - items swap positions, neither disappears
  warrior.bag = [swordA, armor, null, null];
  const swapPersonalRes = room.swapInventorySlots('leader_sock', { fromArea: 'PERSONAL', fromIndex: 0, toArea: 'PERSONAL', toIndex: 1 });
  assert.equal(swapPersonalRes.success, true);
  assert.equal(warrior.bag[0].id, 'armor_a');
  assert.equal(warrior.bag[1].id, 'sword_a');

  // 3. Squad bag internal swap
  room.squadInventory = [swordA, ring];
  const swapSquadRes = room.swapInventorySlots('leader_sock', { fromArea: 'SQUAD', fromIndex: 0, toArea: 'SQUAD', toIndex: 1 });
  assert.equal(swapSquadRes.success, true);
  assert.equal(room.squadInventory[0].id, 'ring_a');
  assert.equal(room.squadInventory[1].id, 'sword_a');

  // 4. Equip from bag when slot already has an item -> Swaps items cleanly
  warrior.equipSlots.WEAPON = swordA;
  warrior.bag = [swordB, null, null, null];
  const equipSwapRes = room.equipItemFromBag('leader_sock', 0, 'WEAPON');
  assert.equal(equipSwapRes.success, true);
  assert.equal(warrior.equipSlots.WEAPON.id, 'sword_b', 'New weapon equipped');
  assert.equal(warrior.bag[0].id, 'sword_a', 'Old weapon swapped back to bag slot 0');

  // 5. Dragging incompatible item to equip slot fails without losing items
  warrior.bag = [armor, null, null, null];
  const equipFailRes = room.equipItemFromBag('leader_sock', 0, 'WEAPON');
  assert.equal(equipFailRes.success, false);
  assert.ok(equipFailRes.message.includes('欄位不符'));
  assert.equal(warrior.equipSlots.WEAPON.id, 'sword_b', 'Equipped weapon untouched');
  assert.equal(warrior.bag[0].id, 'armor_a', 'Armor in bag untouched');

  // 6. Unequip to occupied bag slot when item type does NOT match -> Swap fails!
  // Equipped: sword_b (WEAPON). Target bag slot 0 has: armor_a (ARMOR).
  const unequipIncompatibleRes = room.unequipItemToBag('leader_sock', 'WEAPON', 0);
  assert.equal(unequipIncompatibleRes.success, false);
  assert.ok(unequipIncompatibleRes.message.includes('欄位不符'));
  assert.equal(warrior.equipSlots.WEAPON.id, 'sword_b', 'Weapon still equipped');
  assert.equal(warrior.bag[0].id, 'armor_a', 'Armor still in bag slot 0');

  // 7. Unequip to occupied bag slot when item type DOES match -> Swaps items!
  // Target bag slot 0 has: sword_a (WEAPON).
  warrior.bag[0] = swordA;
  const unequipCompatibleRes = room.unequipItemToBag('leader_sock', 'WEAPON', 0);
  assert.equal(unequipCompatibleRes.success, true);
  assert.equal(warrior.equipSlots.WEAPON.id, 'sword_a', 'New weapon swapped into equip slot');
  assert.equal(warrior.bag[0].id, 'sword_b', 'Previous weapon swapped into bag slot 0');

  // 8. Unequip to occupied squad slot validation
  room.squadInventory = [armor]; // ARMOR at slot 0
  const unequipSquadFail = room.unequipItemToSquad('leader_sock', 'WEAPON', 0);
  assert.equal(unequipSquadFail.success, false);
  assert.ok(unequipSquadFail.message.includes('欄位不符'));
  assert.equal(warrior.equipSlots.WEAPON.id, 'sword_a', 'Equipped item unchanged');
  assert.equal(room.squadInventory[0].id, 'armor_a', 'Squad item unchanged');

  // 9. Class exclusive validation on swap
  warrior.bag = [exclusivePaladin]; // Warrior trying to equip paladin exclusive
  const equipExclusiveFail = room.equipItemFromBag('leader_sock', 0, 'CLASS_EXCLUSIVE');
  assert.equal(equipExclusiveFail.success, false);
  assert.ok(equipExclusiveFail.message.includes('專屬裝備'));

  // 10. Dragging between two different equip slots fails
  const equipToEquipFail = room.swapInventorySlots('leader_sock', { fromArea: 'EQUIP', fromIndex: 'WEAPON', toArea: 'EQUIP', toIndex: 'ARMOR' });
  assert.equal(equipToEquipFail.success, false);
  assert.ok(equipToEquipFail.message.includes('欄位不符'));
});




