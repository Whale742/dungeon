import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Room } from '../game/Room.js';
import { SPECIAL_ELITES } from '../game/constants.js';

test('Shady merchant: No active attack button, leaving without buying triggers battle', () => {
  const mockSocket = { id: 'sock1', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('TEST_MERCHANT', mockSocket, 'Player1', mockIo);
  room.players['sock1'] = { id: 'sock1', name: 'Player1', hp: 100, maxHp: 100, connected: true };
  room.memberIds = ['sock1'];

  // 1. Enter shady merchant event
  room.handleShopEvent({ id: 'hex_shop', isShadyMerchant: true, col: 1 });
  assert.strictEqual(room.state, 'EVENT');
  assert.strictEqual(room.currentEvent.type, 'shop');
  assert.strictEqual(room.currentEvent.isShady, true);
  // No active attack button
  assert.strictEqual(room.currentEvent.canRob, false);
  assert.strictEqual(room.currentEvent.hasBought, false);

  // 2. Active rob is blocked
  const robRes = room.handleShopAction('sock1', 'rob');
  assert.strictEqual(robRes.success, false);

  // 3. Leave without buying -> Triggers combat!
  const leaveRes = room.handleShopAction('sock1', 'leave');
  assert.strictEqual(leaveRes.success, true);
  assert.strictEqual(leaveRes.allReady, true);
  assert.strictEqual(leaveRes.combatTriggered, true);
  assert.strictEqual(room.state, 'IN_BATTLE');

  // Verify enemy is Shady Merchant
  const enemy = room.getPrimaryEnemy();
  assert.ok(enemy);
  assert.strictEqual(enemy.name, '奸商');
  assert.strictEqual(enemy.avatar, '/BOSS/奸商.webp');
  assert.strictEqual(enemy.isShadyMerchant, true);
  // Check resistances: 0
  assert.strictEqual(enemy.resistances.physical, 0);
  assert.strictEqual(enemy.resistances.magic, 0);
  assert.strictEqual(enemy.resistances.effect, 0);
  // Base HP is 180 (for 1 player floor 1)
  assert.strictEqual(enemy.hp, 180);
  assert.strictEqual(enemy.maxHp, 180);
  // Base ATK is 8
  assert.strictEqual(enemy.attack, 8);
  // No minions
  assert.strictEqual(room.enemies.length, 1);
});

test('Shady merchant: Buying an item allows peaceful departure without combat', () => {
  const mockSocket = { id: 'sock2', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('TEST_PEACEFUL', mockSocket, 'Player2', mockIo);
  room.players['sock2'] = { id: 'sock2', name: 'Player2', hp: 100, maxHp: 100, connected: true, bag: [] };
  room.memberIds = ['sock2'];
  room.gold = 5000;

  room.handleShopEvent({ id: 'hex_shop', isShadyMerchant: true, col: 1 });
  assert.strictEqual(room.currentEvent.hasBought, false);

  // Buy item 0
  const buyRes = room.handleShopAction('sock2', 'buy', { itemIndex: 0 });
  assert.strictEqual(buyRes.success, true);
  assert.strictEqual(room.currentEvent.hasBought, true);

  // Leave -> Peaceful exit
  const leaveRes = room.handleShopAction('sock2', 'leave');
  assert.strictEqual(leaveRes.success, true);
  assert.strictEqual(leaveRes.allReady, true);
  assert.strictEqual(leaveRes.combatTriggered, undefined);
  assert.notStrictEqual(room.state, 'IN_BATTLE');
});

test('Shady merchant: Victory drops one random item from his shop inventory (including exclusive equipment)', () => {
  const mockSocket = { id: 'sock3', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('TEST_VICTORY_LOOT', mockSocket, 'Player3', mockIo);
  room.players['sock3'] = { id: 'sock3', name: 'Player3', hp: 100, maxHp: 100, connected: true, bag: [] };
  room.memberIds = ['sock3'];
  room.floor = 1;

  const mockShopItems = [
    { id: 'exclusive_weapon_1', name: '星辰法杖', role: 'mage', slot: 'CLASS_EXCLUSIVE', tier: 'CLASS_EXCLUSIVE', desc: '專屬裝備' },
    { id: 'tier2_helm_1', name: '精鋼戰盔', tier: 2, desc: '防具' }
  ];

  room.handleBattleEvent(null, false, {
    specialElite: SPECIAL_ELITES.shady_merchant,
    col: 1,
    merchantLootPool: mockShopItems
  });

  assert.strictEqual(room.state, 'IN_BATTLE');
  const enemy = room.getPrimaryEnemy();

  // Defeat enemy via victory handler
  enemy.hp = 0;
  room.handleMonsterVictory(enemy, []);

  assert.strictEqual(room.state, 'BATTLE_VICTORY');
  assert.ok(room.currentVictory);
  assert.ok(room.currentVictory.drop);
  // Drop must be one of the items from his shop
  const dropName = room.currentVictory.drop.name;
  assert.ok(['星辰法杖', '精鋼戰盔'].includes(dropName));
});

test('Chest & Mimic: Both have 繞道而行 option without revealing whether it is a mimic', () => {
  const mockSocket = { id: 'sock4', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('TEST_CHEST', mockSocket, 'Player4', mockIo);
  room.players['sock4'] = { id: 'sock4', name: 'Player4', hp: 100, maxHp: 100, connected: true };
  room.memberIds = ['sock4'];

  // Case A: Normal Chest (isMimic = false)
  room.handleChestEvent({ id: 'hex_chest_normal', isMimic: false, col: 1 });
  assert.strictEqual(room.currentEvent.type, 'chest');
  assert.strictEqual(room.currentEvent.canLeave, true);
  assert.strictEqual(room.currentEvent.canOpen, true);
  // Options presented: canLeave=true, canOpen=true

  // Player can bypass (繞道而行)
  let bypassRes = room.handleChestAction('sock4', 'leave');
  assert.strictEqual(bypassRes.success, true);
  assert.strictEqual(room.currentEvent, null);

  // Case B: Mimic Chest (isMimic = true)
  room.handleChestEvent({ id: 'hex_chest_mimic', isMimic: true, col: 1 });
  assert.strictEqual(room.currentEvent.type, 'chest');
  assert.strictEqual(room.currentEvent.canLeave, true);
  assert.strictEqual(room.currentEvent.canOpen, true);
  // Options presented are IDENTICAL to normal chest!

  // Player can bypass (繞道而行) without triggering ambush battle
  bypassRes = room.handleChestAction('sock4', 'bypass');
  assert.strictEqual(bypassRes.success, true);
  assert.strictEqual(room.currentEvent, null);
  assert.notStrictEqual(room.state, 'IN_BATTLE');
});

test('Random Events (Altar, Gamble, Reforge): Borderless styling and visible background illustration', () => {
  const css = fs.readFileSync('public/style.css', 'utf8');
  const appJs = fs.readFileSync('public/app.js', 'utf8');

  // Verify class toggles in app.js
  assert.ok(appJs.includes('is-borderless-event'));
  assert.ok(appJs.includes('is-altar-event'));
  assert.ok(appJs.includes('is-gamble-event'));
  assert.ok(appJs.includes('is-reforge-event'));

  // Verify borderless card style
  assert.ok(css.includes('.event-card.is-borderless-event'));
  assert.ok(css.includes('background: transparent !important;'));
  assert.ok(css.includes('border: none !important;'));

  // Verify inner columns do not have opaque boxes
  assert.ok(css.includes('.reforge-inventory-col'));
  assert.ok(css.includes('.gamble-arena'));

  // Verify illustration opacity is enhanced
  assert.ok(css.includes('.event-card.is-borderless-event .event-bg-illustration'));
});

test('Gamble and Reforge: Leave action completes event and /lab defines illustrations', () => {
  const mockSocket = { id: 'sock_rnd', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('TEST_LEAVE', mockSocket, 'Player1', mockIo);
  room.players['sock_rnd'] = { id: 'sock_rnd', name: 'Player1', hp: 100, maxHp: 100 };

  // Test Gamble leave
  room.state = 'EVENT';
  room.currentEvent = { type: 'random_event', subType: 'GAMBLE' };
  let leaveRes = room.handleRandomEventAction('sock_rnd', 'leave');
  assert.strictEqual(leaveRes.success, true);
  assert.strictEqual(room.currentEvent, null);

  // Test Reforge leave
  room.state = 'EVENT';
  room.currentEvent = { type: 'random_event', subType: 'REFORGE' };
  leaveRes = room.handleRandomEventAction('sock_rnd', 'leave');
  assert.strictEqual(leaveRes.success, true);
  assert.strictEqual(room.currentEvent, null);

  // Test app.js click listener and button classes
  const appJs = fs.readFileSync('public/app.js', 'utf8');
  assert.ok(appJs.includes('.btn-rand-leave, .btn-shop-leave, [data-act="leave"]'));

  // Test event-lab-scenes.js illustrations and leave handler
  const labJs = fs.readFileSync('public/event-lab-scenes.js', 'utf8');
  assert.ok(labJs.includes("bgImg.src = '/assets/獻祭台.webp'"));
  assert.ok(labJs.includes("bgImg.src = '/assets/鑄造台.webp'"));
  assert.ok(labJs.includes("bgImg.src = '/assets/賭博.webp'"));
  assert.ok(labJs.includes('function leaveLabEvent'));
});
