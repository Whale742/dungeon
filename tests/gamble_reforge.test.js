import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Room } from '../game/Room.js';
import { getBossResistance } from '../game/boss-resistance.js';

test('Minion resistances should not exceed 30%', () => {
  const minionHigh = { tier: 'MINION', resistances: { physical: 50, magic: 45, effect: 80 } };
  const resPhys = getBossResistance(minionHigh, 'physical');
  const resMag = getBossResistance(minionHigh, 'magic');
  const resEff = getBossResistance(minionHigh, 'effect');
  assert.strictEqual(resPhys, 30);
  assert.strictEqual(resMag, 30);
  assert.strictEqual(resEff, 30);

  // Test below 30% remains unchanged
  const minionLow = { tier: 'MINION', resistances: { physical: 15, magic: 20, effect: 0 } };
  assert.strictEqual(getBossResistance(minionLow, 'physical'), 15);
  assert.strictEqual(getBossResistance(minionLow, 'magic'), 20);
  assert.strictEqual(getBossResistance(minionLow, 'effect'), 0);
});

test('Gamble: D20 rules verification', () => {
  const mockSocket = { id: 'sock_gamble', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('TEST_GAMBLE', mockSocket, 'Player1', mockIo);
  room.state = 'EVENT';
  room.currentEvent = { type: 'random_event', subType: 'GAMBLE' };
  room.players['sock_gamble'] = { id: 'sock_gamble', name: 'Player1', hp: 100, maxHp: 100 };
  room.gold = 100;

  // 1. Roll 10 -> Push (refund)
  let res = room.handleRandomEventAction('sock_gamble', 'd20_gamble', { amount: 30, choice: 'SMALL', roll: 10 });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.outcomeType, 'PUSH');
  assert.strictEqual(res.payout, 30);
  assert.strictEqual(room.gold, 100);

  // 2. Roll 1 on SMALL -> Jackpot 3x
  res = room.handleRandomEventAction('sock_gamble', 'd20_gamble', { amount: 20, choice: 'SMALL', roll: 1 });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.outcomeType, 'JACKPOT');
  assert.strictEqual(res.payout, 60);
  assert.strictEqual(room.gold, 140); // 100 - 20 + 60

  // 3. Roll 20 on BIG -> Jackpot 3x
  res = room.handleRandomEventAction('sock_gamble', 'd20_gamble', { amount: 40, choice: 'BIG', roll: 20 });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.outcomeType, 'JACKPOT');
  assert.strictEqual(res.payout, 120);
  assert.strictEqual(room.gold, 220); // 140 - 40 + 120

  // 4. Roll 5 on SMALL -> Win 2x
  res = room.handleRandomEventAction('sock_gamble', 'd20_gamble', { amount: 50, choice: 'SMALL', roll: 5 });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.outcomeType, 'WIN');
  assert.strictEqual(res.payout, 100);
  assert.strictEqual(room.gold, 270); // 220 - 50 + 100

  // 5. Roll 18 on BIG -> Win 2x
  res = room.handleRandomEventAction('sock_gamble', 'd20_gamble', { amount: 70, choice: 'BIG', roll: 18 });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.outcomeType, 'WIN');
  assert.strictEqual(res.payout, 140);
  assert.strictEqual(room.gold, 340); // 270 - 70 + 140

  // 6. Roll 15 on SMALL -> Lose 0
  res = room.handleRandomEventAction('sock_gamble', 'd20_gamble', { amount: 40, choice: 'SMALL', roll: 15 });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.outcomeType, 'LOSE');
  assert.strictEqual(res.payout, 0);
  assert.strictEqual(room.gold, 300); // 340 - 40
});

test('Reforge: Costs 10G and replaces with random item from T1/T2/Exclusive', () => {
  const mockSocket = { id: 'sock_reforge', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('TEST_REFORGE', mockSocket, 'Player1', mockIo);
  room.state = 'EVENT';
  room.currentEvent = { type: 'random_event', subType: 'REFORGE' };
  room.players['sock_reforge'] = { id: 'sock_reforge', name: 'Player1', hp: 100, maxHp: 100 };
  room.gold = 50;
  room.squadInventory = [
    { name: '生鏽的鐵劍', tier: 1, basePrice: 20 },
    { name: '秘銀法袍', tier: 2, basePrice: 60 }
  ];

  // Reforge slot 0
  const res = room.handleRandomEventAction('sock_reforge', 'reforge', { itemIndex: 0 });
  assert.strictEqual(res.success, true);
  assert.strictEqual(room.gold, 40);
  assert.strictEqual(res.itemIndex, 0);
  assert.ok(res.item && res.item.name);
  assert.strictEqual(room.squadInventory[0].name, res.item.name);
  assert.ok(['一階裝備', '二階稀有裝備', '職業專屬神裝', '裝備'].includes(res.poolName));

  // If gold < 10, cannot reforge
  room.gold = 5;
  const failRes = room.handleRandomEventAction('sock_reforge', 'reforge', { itemIndex: 1 });
  assert.strictEqual(failRes.success, false);
  assert.ok(failRes.message.includes('金幣不足'));
});

test('Presentation Lab: All events scenes registered in /lab', () => {
  const labHtml = fs.readFileSync('public/presentation-lab.html', 'utf8');
  const expectedScenes = [
    'event_gamble',
    'event_reforge',
    'event_altar',
    'event_wandering_merchant',
    'event_shop_standard',
    'event_shop_shady',
    'event_shop_prep',
    'event_mimic_chest'
  ];

  expectedScenes.forEach(sc => {
    assert.ok(labHtml.includes(`value="${sc}"`), `Expected presentation-lab.html to include option for ${sc}`);
  });

  assert.ok(labHtml.includes('eventCardBox'), 'Expected presentation-lab.html to contain eventCardBox');
  assert.ok(labHtml.includes('event-lab-scenes.js'), 'Expected presentation-lab.html to include event-lab-scenes.js');

  const labScenesCode = fs.readFileSync('public/event-lab-scenes.js', 'utf8');
  expectedScenes.forEach(sc => {
    assert.ok(labScenesCode.includes(sc), `Expected event-lab-scenes.js to define scene ${sc}`);
  });
});

test('Monster Wounded (負傷) status terminology and removal of 75% display', () => {
  const mockSocket = { id: 'sock_test', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('TEST_WOUNDED', mockSocket, 'Player1', mockIo);

  const baseEnemy = {
    id: 'test_golem',
    name: '遠古守衛石像',
    desc: '古代遺跡的強大守護者。',
    hp: 400,
    attack: 40
  };

  const woundedEnemy = room.createEnemyInstance(baseEnemy, 0, { isWeakened: true });
  assert.strictEqual(woundedEnemy.name, '【負傷】遠古守衛石像');
  assert.strictEqual(woundedEnemy.desc, '古代遺跡的強大守護者。 (⚠️ 負傷)');
  assert.ok(woundedEnemy.encounterStory.includes('處於負傷狀態！'));
  assert.ok(!woundedEnemy.encounterStory.includes('75%'));
  assert.ok(!woundedEnemy.encounterStory.includes('削弱'));
  assert.ok(!woundedEnemy.desc.includes('75%'));
  assert.ok(!woundedEnemy.desc.includes('削弱'));

  // Test battle log on wounded encounter
  room.handleBattleEvent(null, true, { enemies: [woundedEnemy] });
  const hasWoundedLog = room.logs.some(l => l.text.includes('遭遇負傷BOSS！') && l.text.includes('（負傷）'));
  assert.ok(hasWoundedLog, 'Expected battle log to contain 遭遇負傷BOSS！ and （負傷）');
  const hasOldWeakenedLog = room.logs.some(l => l.text.includes('75%') || l.text.includes('削弱BOSS'));
  assert.strictEqual(hasOldWeakenedLog, false, 'Expected battle log to not mention 75% or 削弱BOSS');
});
