import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { CLASSES } from '../game/constants.js';
import { NEW_CLASSES, NEW_LOOT, NEW_ROLE_DETAILS } from '../game/phase8-config.js';
import fs from 'node:fs';
import { P8_ROLES, countEquip } from '../game/phase8.js';

function createRoomWithPlayers(playerDefs) {
  const events = [];
  const io = { to: () => ({ emit: (name, data) => events.push({ name, data }) }) };
  const socket = id => ({ id, join() {} });
  const room = new Room('test-room', socket('p0'), 'Player0', io);
  room.state = 'IN_BATTLE';
  room.floor = 1;
  room.battleRound = 1;
  room.currentMonster = {
    id: 'boss',
    name: '深淵執印者',
    hp: 1000,
    maxHp: 1000,
    dmg: 20,
    def: 0,
    speed: 5,
    effectResist: 0,
    poisonTurns: 0, poisonDmg: 0,
    burnTurns: 0, burnDmg: 0,
    bleedTurns: 0,
    fractureTurns: 0, fractureDmg: 0,
    chillTurns: 0, chillDmg: 0,
    corrosionTurns: 0
  };
  playerDefs.forEach((def, index) => {
    const id = `p${index}`;
    const p = {
      id,
      name: def.name || `Player${index}`,
      role: def.role,
      hp: def.hp !== undefined ? def.hp : (CLASSES[def.role]?.maxHp || 70),
      maxHp: def.maxHp || (CLASSES[def.role]?.maxHp || 70),
      action: null,
      equips: def.equips || [],
      cooldowns: {},
      p8Effects: {}
    };
    room.players[id] = p;
  });
  room.p8ResetBattle();
  return room;
}

test('Augur Class and Role Details Configuration', t => {
  assert.ok(CLASSES.augur, 'Augur should exist in CLASSES');
  assert.equal(CLASSES.augur.maxHp, 70);
  assert.equal(CLASSES.augur.skills[0].label, '水晶折光');
  assert.equal(CLASSES.augur.skills[1].label, '命運繫結');
  assert.equal(CLASSES.augur.skills[2].label, '命運清算・凶兆逆位');
  assert.ok(CLASSES.augur.passive.includes('命運加護'));

  assert.ok(NEW_ROLE_DETAILS.augur, 'Augur should exist in NEW_ROLE_DETAILS');
  assert.equal(NEW_ROLE_DETAILS.augur.hp, 70);
  assert.equal(NEW_ROLE_DETAILS.augur.roleName, '卜者');
  assert.equal(NEW_ROLE_DETAILS.augur.skills.length, 3);

  const lobbySource = fs.readFileSync(new URL('../public/lobby.js', import.meta.url), 'utf8');
  assert.ok(lobbySource.includes("'augur'"), 'Augur should exist in LOBBY_ROLE_ORDER');
  assert.ok(lobbySource.includes("radar:['C','C','S','A','B']"), 'Augur radar should be C, C, S, A, B');

  assert.ok(NEW_LOOT.find(x => x.id === 'aug_amethyst'), 'aug_amethyst loot should exist');
  assert.ok(NEW_LOOT.find(x => x.id === 'aug_gilded_box'), 'aug_gilded_box loot should exist');
  assert.ok(NEW_LOOT.find(x => x.id === 'aug_forbidden_tome'), 'aug_forbidden_tome loot should exist');
});

test('Augur 3-tier target selection priority on battle reset', t => {
  // Scenario 1: multiple living allies, picks lowest HP percentage
  {
    const room = createRoomWithPlayers([
      { role: 'augur', hp: 70, maxHp: 70 },
      { role: 'warrior', hp: 80, maxHp: 100 }, // 80%
      { role: 'mage', hp: 30, maxHp: 60 }      // 50% -> lowest!
    ]);
    const augur = room.players.p0;
    const target = room.selectDefaultObservedTarget(augur);
    assert.equal(target, 'p2', 'Should select p2 (mage) with lowest HP%');
  }

  // Scenario 2: all allies dead, fall back to self
  {
    const room = createRoomWithPlayers([
      { role: 'augur', hp: 70, maxHp: 70 },
      { role: 'warrior', hp: 0, maxHp: 100 },
      { role: 'mage', hp: 0, maxHp: 60 }
    ]);
    const augur = room.players.p0;
    const target = room.selectDefaultObservedTarget(augur);
    assert.equal(target, augur.id, 'Should select self when all allies are dead');
  }
});

test('Augur Fate Blessing calculation and equipment modifiers', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, maxHp: 70 },
    { role: 'warrior', hp: 50, maxHp: 100 }
  ]);
  const augur = room.players.p0;
  const war = room.players.p1;
  augur.observedTargetId = war.id;
  room.battleRound = 1;

  // Baseline: 20% blessing
  assert.equal(room.getFateBlessing(war), 0.20);
  assert.equal(room.applyFateBlessing(war, 100), 120);

  // When aug_bind cast this round: 25% blessing
  augur.augurBindingBoostRound = 1;
  assert.equal(room.getFateBlessing(war), 0.25);
  assert.equal(room.applyFateBlessing(war, 100), 125);

  // With 1 amethyst orb (+5%): 30% blessing on bind
  augur.equips = [{ id: 'aug_amethyst', name: '無瑕紫晶球' }];
  assert.equal(room.getFateBlessing(war), 0.30);
  assert.equal(room.applyFateBlessing(war, 100), 130);

  // Target not observed receives 0% blessing
  assert.equal(room.getFateBlessing(augur), 0);
  assert.equal(room.applyFateBlessing(augur, 100), 100);
});

test('Augur Negative Fate Interference (逆位) interception and debt creation', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, maxHp: 70 },
    { role: 'warrior', hp: 100, maxHp: 100 }
  ]);
  const augur = room.players.p0;
  const war = room.players.p1;
  augur.observedTargetId = war.id;
  room.battleRound = 1;

  // Warrior w_strike has baseNegChance = 20%
  // Augur reduction D = min(20, 20) = 20
  // P_neg - D = 0. Range [0, 20) is intercepted!
  const oldRandom = Math.random;
  try {
    // Test interception: R = 10 (0.10) falls in [0, 20)
    Math.random = () => 0.10;
    const res = room.checkNegativeFateInterference(war, 20, '堅定斬擊・揮砍失衡');
    assert.equal(res.occurred, false, 'Negative effect should be intercepted');
    assert.equal(res.intercepted, true);
    assert.equal(res.debt, 20);
    assert.equal(augur.augurIntervenedThisRound, true);
    assert.equal(augur.augurCardState, 'reversed');
    assert.equal(room.getAugurTotalDebt(augur), 20);
  } finally {
    Math.random = oldRandom;
  }
});

test('Augur Gilded Box (鎏金諭示牌盒) reduces debt generated by 5 (min 5)', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, maxHp: 70, equips: [{ id: 'aug_gilded_box', name: '鎏金諭示牌盒' }] },
    { role: 'warrior', hp: 100, maxHp: 100 }
  ]);
  const augur = room.players.p0;
  const war = room.players.p1;
  augur.observedTargetId = war.id;
  room.battleRound = 1;

  const oldRandom = Math.random;
  try {
    // Intercept with gilded box: debt 20 -> 15
    Math.random = () => 0.10;
    const res = room.checkNegativeFateInterference(war, 20, '堅定斬擊・揮砍失衡');
    assert.equal(res.intercepted, true);
    assert.equal(res.debt, 15, 'Gilded box should reduce debt from 20 to 15');
    assert.equal(room.getAugurTotalDebt(augur), 15);
  } finally {
    Math.random = oldRandom;
  }
});

test('Augur Positive Fate Interference (正位) boost calculation', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, maxHp: 70 },
    { role: 'assassin', hp: 80, maxHp: 80 }
  ]);
  const augur = room.players.p0;
  const sin = room.players.p1;
  augur.observedTargetId = sin.id;
  room.battleRound = 1;

  const oldRandom = Math.random;
  try {
    // Base 30% + Augur 15% = 45%
    // If Math.random() is 0.40 (40%), originally fails (40 > 30), but with Augur succeeds (40 < 45)!
    Math.random = () => 0.40;
    const res = room.checkPositiveFateInterference(sin, 30, '暗影刺殺・暴擊');
    assert.equal(res.success, true);
    assert.equal(res.boosted, true);
    assert.equal(augur.augurIntervenedThisRound, true);
    assert.equal(augur.augurCardState, 'upright');
  } finally {
    Math.random = oldRandom;
  }
});

test('Augur Debt FIFO Repayment and Forbidden Tome true damage conversion', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, maxHp: 70, equips: [{ id: 'aug_forbidden_tome', name: '禁忌厄運聖契' }] },
    { role: 'warrior', hp: 100, maxHp: 100 }
  ]);
  const augur = room.players.p0;
  room.battleRound = 1;

  // Add debts: debt 1 (15) due round 2, debt 2 (20) due round 3
  room.addAugurDebt(augur, 15);
  room.addAugurDebt(augur, 20);
  assert.equal(room.getAugurTotalDebt(augur), 35);

  const bossHpBefore = room.currentMonster.hp;
  // Repay 20 debt via skill
  const repaid = room.repayAugurDebt(augur, 20);
  assert.equal(repaid, 20);
  assert.equal(room.getAugurTotalDebt(augur), 15);
  // Forbidden tome converts 50% of repaid debt (10) to true damage
  assert.equal(room.currentMonster.hp, bossHpBefore - 10, 'Forbidden tome should deal 50% true damage on skill repayment');

  // Passive healing does NOT trigger forbidden tome true damage
  const bossHpAfterSkill = room.currentMonster.hp;
  const healAbsorbed = room.deductAugurDebtPassive(augur, 10);
  assert.equal(healAbsorbed.debtPaid, 10);
  assert.equal(room.getAugurTotalDebt(augur), 5);
  assert.equal(room.currentMonster.hp, bossHpAfterSkill, 'Passive heal repayment must NOT deal forbidden tome true damage');
});

test('Augur Debt Expiry causes true damage ignoring shield at round end', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, maxHp: 70 }
  ]);
  const augur = room.players.p0;
  room.battleRound = 1;

  // Add debt due at round 2
  augur.augurFateDebts.push({
    amount: 25,
    createdRound: 1,
    dueRound: 2 // due at end of round 2
  });

  // Grant a 50-point shield
  room.p8GrantShield(augur, 50, 2, 'test_shield');
  assert.equal(augur.tempHp, 50);

  // Advance to round 2 and trigger end of round checks
  room.battleRound = 2;
  room.p8EndRound([], [], n => n);

  // Debt expired! Deals 25 direct true damage to HP, ignoring shield!
  assert.equal(augur.hp, 70 - 25);
  assert.equal(room.getAugurTotalDebt(augur), 0);
  assert.equal(augur.tempHp, 50, 'Shield must remain untouched by debt expiry true damage');
});

test('Augur basic skill applies star_break debuff on boss', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, maxHp: 70 }
  ]);
  const augur = room.players.p0;
  augur.action = 'basic';
  room.currentMonster.hp = 1000;

  room.resolveTurnActions();
  assert.ok(room.p8Has(room.currentMonster, 'star_break'), 'Boss should have star_break effect');
  assert.equal(room.p8Has(room.currentMonster, 'star_break').value, 15);
});

test('Augur aug_reckon skill applies reversed_omen debuff and heals when repaid >= 15', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 40, maxHp: 70 },
    { role: 'warrior', hp: 50, maxHp: 100 }
  ]);
  const augur = room.players.p0;
  const war = room.players.p1;
  augur.observedTargetId = war.id;
  augur.action = 'aug_reckon';
  room.currentMonster.hp = 1000;

  // Seed 25 debt so aug_reckon can repay 25 (>= 15)
  room.addAugurDebt(augur, 25);

  room.resolveTurnActions();
  assert.ok(room.p8Has(room.currentMonster, 'reversed_omen'), 'Boss should have reversed_omen effect');
  assert.equal(room.p8Has(room.currentMonster, 'reversed_omen').value, 10);
  assert.equal(room.getAugurTotalDebt(augur), 0);
  // Repaid 25 >= 15 -> triggers heal 10 on augur and observed target
  assert.equal(augur.hp, 50); // 40 + 10
  assert.equal(war.hp, 60);   // 50 + 10
});
