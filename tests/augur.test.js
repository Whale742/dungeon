import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, getActionPriority } from '../game/constants.js';
import { Room } from '../game/Room.js';

function createRoomWithPlayers(playerConfigs) {
  const socket = id => ({ id, join() {}, emit() {} });
  const mockIo = { to: () => ({ emit() {} }), emit() {} };
  const room = new Room('test-room', socket('p0'), 'Hero', mockIo);
  room.currentMonster = {
    id: 'monster',
    name: '深淵執印者',
    hp: 1000,
    maxHp: 1000,
    baseMaxHp: 1000,
    statuses: [],
    defense: 0,
    effectResistance: 40
  };
  room.players = {};
  playerConfigs.forEach((cfg, idx) => {
    const id = `p${idx}`;
    const p = {
      id,
      name: cfg.name || `Player_${cfg.role}`,
      role: cfg.role,
      hp: cfg.hp ?? 70,
      maxHp: cfg.maxHp ?? 70,
      tempHp: cfg.tempHp ?? 0,
      statuses: [],
      equips: cfg.equips ? [...cfg.equips] : [],
      ammo: [],
      skills: CLASSES[cfg.role]?.skills || [],
      isLocked: true,
      action: cfg.action || 'basic',
      targetPlayerId: cfg.targetPlayerId || null,
      augurFateDebts: cfg.augurFateDebts ? [...cfg.augurFateDebts] : [],
      augurCardState: cfg.augurCardState || 'empty',
      augurIntervenedThisRound: cfg.augurIntervenedThisRound || false,
      augurBindingBoostRound: cfg.augurBindingBoostRound || 0,
      observedTargetId: cfg.observedTargetId || null,
      cooldowns: {}
    };
    room.players[id] = p;
  });
  room.battleRound = 1;
  return room;
}

test('Augur: class metadata and action priorities', t => {
  const augur = CLASSES.augur;
  assert.ok(augur, 'Augur class must be defined in CLASSES');
  assert.equal(augur.maxHp, 70, 'Augur base maxHp must be 70');
  assert.equal(augur.skills.length, 3, 'Augur must have 3 skills (basic, aug_bind, aug_reckon)');

  // Priorities: aug_bind = 1, aug_reckon = 7, basic = 8
  assert.equal(getActionPriority('aug_bind'), 1, 'aug_bind priority must be 1');
  assert.equal(getActionPriority('aug_reckon'), 7, 'aug_reckon priority must be 7');
  assert.equal(getActionPriority('basic'), 8, 'basic priority must be 8');
});

test('Augur: starting observation target selection priority', t => {
  // Scenario 1: Pool with Tier 1 (Mage) and Tier 2 (Warrior) -> Should pick Tier 1
  {
    const room = createRoomWithPlayers([
      { role: 'augur', hp: 70 },
      { role: 'warrior', hp: 100 },
      { role: 'mage', hp: 60 }
    ]);
    const aug = room.players.p0;
    room.p8RoundStart();
    assert.equal(aug.observedTargetId, 'p2', 'Should prioritize Tier 1 (mage) over Tier 2 (warrior)');
  }

  // Scenario 2: Pool with Tier 2 (Warrior) and Tier 3 (Druid) -> Should pick Tier 2
  {
    const room = createRoomWithPlayers([
      { role: 'augur', hp: 70 },
      { role: 'druid', hp: 90 },
      { role: 'warrior', hp: 100 }
    ]);
    const aug = room.players.p0;
    room.p8RoundStart();
    assert.equal(aug.observedTargetId, 'p2', 'Should prioritize Tier 2 (warrior) over Tier 3 (druid)');
  }

  // Scenario 3: All allies dead -> Fallback to self
  {
    const room = createRoomWithPlayers([
      { role: 'augur', hp: 70 },
      { role: 'warrior', hp: 0 }
    ]);
    const aug = room.players.p0;
    room.p8RoundStart();
    assert.equal(aug.observedTargetId, 'p0', 'Should observe self when no other alive allies');
  }

  // Scenario 4: Target dies -> System re-selects on next round start
  {
    const room = createRoomWithPlayers([
      { role: 'augur', hp: 70 },
      { role: 'mage', hp: 0 },
      { role: 'assassin', hp: 80 }
    ]);
    const aug = room.players.p0;
    aug.observedTargetId = 'p1'; // mage is dead
    room.p8RoundStart();
    assert.equal(aug.observedTargetId, 'p2', 'Should re-select alive assassin when previous target is dead');
  }
});

test('Augur: Fate Blessing whitelist & blacklist calculations', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70 },
    { role: 'warrior', hp: 100 }
  ]);
  const aug = room.players.p0;
  const war = room.players.p1;
  aug.observedTargetId = war.id;
  room.battleRound = 1;

  // Baseline: +20%
  assert.equal(room.applyFateBlessing(war, 10), 12, '10 * 1.20 = 12');
  assert.equal(room.applyFateBlessing(war, 25), 30, '25 * 1.20 = 30');
  assert.equal(room.applyFateBlessing(war, 45), 54, '45 * 1.20 = 54');

  // When aug_bind was used this round: +25%
  aug.augurBindingBoostRound = 1;
  assert.equal(room.applyFateBlessing(war, 10), 13, 'round(10 * 1.25) = 13');
  assert.equal(room.applyFateBlessing(war, 20), 25, '20 * 1.25 = 25');

  // With Amethyst Orb (+5% per piece)
  aug.equips = [{ id: 'aug_amethyst', name: '無瑕紫晶球' }];
  assert.equal(room.applyFateBlessing(war, 10), 13, 'round(10 * 1.30) = 13');
  assert.equal(room.applyFateBlessing(war, 20), 26, '20 * 1.30 = 26');

  // Unobserved player gets 0% bonus
  assert.equal(room.applyFateBlessing(aug, 10), 10, 'Unobserved player receives original value');
});

test('Augur: Negative Fate Interference (逆位) and debt generation', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70 },
    { role: 'warrior', hp: 100 }
  ]);
  const aug = room.players.p0;
  const war = room.players.p1;
  aug.observedTargetId = war.id;
  room.battleRound = 1;

  const oldRandom = Math.random;
  try {
    // Warrior strike has 20% negative chance (0 to 0.20)
    // Augur lowers by min(20, 20) = 20 percentage points -> new negative range is [0, 0)
    // If roll is 0.10, falls in intercepted range [0, 0.20)
    Math.random = () => 0.10;
    const res = room.interveneNegative(war, '揮砍失衡', 20);
    assert.equal(res.failed, false, 'Negative effect must be intercepted');
    assert.equal(aug.augurCardState, 'reversed', 'Card state must turn to reversed');
    assert.equal(aug.augurIntervenedThisRound, true, 'Intervention flag must be set');
    assert.equal(room.getAugurTotalDebt(aug), 20, 'Debt should be 20');

    // Second intervention in same round must be blocked
    const second = room.interveneNegative(war, '盾牌龜裂', 25);
    assert.equal(second.failed, true, 'Only one intervention per round allowed');

    // Next round resets card state to empty and clears flag
    room.battleRound = 2;
    room.p8RoundStart();
    assert.equal(aug.augurCardState, 'empty', 'Card state resets to empty at round start');
    assert.equal(aug.augurIntervenedThisRound, false, 'Intervention flag cleared');
  } finally {
    Math.random = oldRandom;
  }
});

test('Augur: Positive Fate Interference (正位)', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70 },
    { role: 'assassin', hp: 80 }
  ]);
  const aug = room.players.p0;
  const sin = room.players.p1;
  aug.observedTargetId = sin.id;
  room.battleRound = 1;

  const oldRandom = Math.random;
  try {
    // Base 30% positive chance. With Augur +15% -> 45%
    // If roll is 0.40, originally fails (0.40 >= 0.30), but with Augur succeeds (0.40 < 0.45)!
    Math.random = () => 0.40;
    const res = room.intervenePositive(sin, '暗影刺殺暴擊', 30);
    assert.equal(res.success, true, 'Positive effect boosted by Augur');
    assert.equal(aug.augurCardState, 'upright', 'Card state must turn to upright');
    assert.equal(aug.augurIntervenedThisRound, true, 'Intervention flag set');
  } finally {
    Math.random = oldRandom;
  }
});

test('Augur: FIFO debt repayment and healing priority', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 50, maxHp: 70 }
  ]);
  const aug = room.players.p0;
  room.battleRound = 1;

  // Add debts: debt 1 = 15, debt 2 = 20
  room.addAugurDebt(aug, 15);
  room.addAugurDebt(aug, 20);
  assert.equal(room.getAugurTotalDebt(aug), 35);

  // Skill repay: 20 points
  const repaid = room.repayAugurDebt(aug, 20, 'skill');
  assert.equal(repaid, 20);
  assert.equal(room.getAugurTotalDebt(aug), 15);
  assert.equal(aug.augurFateDebts[0].amount, 15, 'Debt 1 (15) was fully cleared, remaining is Debt 2 reduced from 20 to 15');

  // Healing receives 25 points: 15 offsets debt 1:1, remaining 10 heals body HP
  const hpBefore = aug.hp;
  room.applyHealWithOverheal(aug, 25);
  assert.equal(room.getAugurTotalDebt(aug), 0, 'Debt should be completely paid off');
  assert.equal(aug.hp, hpBefore + 10, 'Body HP receives remaining 10 heal');
});

test('Augur: Debt expiry deals true damage ignoring shield at round end', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, maxHp: 70 }
  ]);
  const aug = room.players.p0;

  // Add debt created at round 1, due at round 3
  aug.augurFateDebts.push({
    amount: 30,
    createdRound: 1,
    dueRound: 3
  });

  // Grant a 50 HP shield
  aug.tempHp = 50;

  // Advance to end of round 3
  room.battleRound = 3;
  const queue = [];
  room.p8EndRound(queue, [], n => n);

  // Expired debt deals 30 damage ignoring shield!
  assert.equal(aug.hp, 40, 'HP reduced from 70 to 40');
  assert.equal(aug.tempHp, 50, 'Shield remains untouched at 50');
  assert.equal(room.getAugurTotalDebt(aug), 0, 'Expired debt cleared');
});

test('Augur: Basic attack (水晶折光) deals 10 damage, breaks resistance and repays 8 debt', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, action: 'basic' }
  ]);
  const aug = room.players.p0;
  room.addAugurDebt(aug, 20);
  room.currentMonster.hp = 500;

  room.p8Action(aug, dmg => ({ dmg }), 1.0, [], []);

  // 10 magic damage dealt
  assert.equal(room.currentMonster.hp, 490);
  // Boss effect resistance break set for 2 rounds
  assert.equal(room.currentMonster.augurResistanceBreak, 2);
  // Repaid 8 debt
  assert.equal(room.getAugurTotalDebt(aug), 12);
});

test('Augur: Skill 1 (命運繫結) retargets and grants round boost', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 70, action: 'aug_bind', targetPlayerId: 'p1' },
    { role: 'warrior', hp: 100 }
  ]);
  const aug = room.players.p0;
  const war = room.players.p1;
  aug.observedTargetId = aug.id; // initially self
  aug.augurCardState = 'reversed';
  aug.augurIntervenedThisRound = true;

  room.p8Action(aug, dmg => ({ dmg }), 1.0, [], []);

  assert.equal(aug.observedTargetId, war.id, 'Observed target switched to warrior');
  assert.equal(aug.augurCardState, 'empty', 'Card state restored to empty');
  assert.equal(aug.augurIntervenedThisRound, true, 'Binding must not replenish the once-per-round intervention');
  assert.equal(aug.augurBindingBoostRound, 1, 'Binding boost active for round 1');
});

test('Augur: Skill 2 (命運清算・凶兆逆位) deals 15 damage, sets omen, repays debt and conditional heals', t => {
  const room = createRoomWithPlayers([
    { role: 'augur', hp: 40, action: 'aug_reckon' },
    { role: 'warrior', hp: 50 }
  ]);
  const aug = room.players.p0;
  const war = room.players.p1;
  aug.observedTargetId = war.id;
  room.addAugurDebt(aug, 25);
  room.currentMonster.hp = 500;

  room.p8Action(aug, dmg => ({ dmg }), 1.0, [], []);

  // 15 damage
  assert.equal(room.currentMonster.hp, 485);
  // Boss debuffs
  assert.equal(room.currentMonster.augurResistanceBreak, 2);
  assert.equal(room.currentMonster.reversedOmenRemaining, 2);
  assert.equal(room.currentMonster.reversedOmenBonus, 10);
  // Cleared 25 debt (>= 15) -> Extra 10 heal for Augur and observed target
  assert.equal(room.getAugurTotalDebt(aug), 0);
  assert.equal(aug.hp, 50, 'Augur healed +10 from 40 to 50');
  assert.equal(war.hp, 60, 'Warrior healed +10 from 50 to 60');
});

test('Augur: Exclusive Equipment effects', t => {
  // 1. Amethyst Orb: increases blessing and basic repay
  {
    const room = createRoomWithPlayers([
      { role: 'augur', hp: 70, equips: [{ id: 'aug_amethyst', name: '無瑕紫晶球' }, { id: 'aug_amethyst', name: '無瑕紫晶球' }] },
      { role: 'warrior', hp: 100 }
    ]);
    const aug = room.players.p0;
    const war = room.players.p1;
    aug.observedTargetId = war.id;
    // 2 amethysts: +10% blessing (total 30%)
    assert.equal(room.applyFateBlessing(war, 100), 130);

    // Basic clears 8 + 4 + 2 = 14 debt
    room.addAugurDebt(aug, 20);
    aug.action = 'basic';
    room.p8Action(aug, dmg => ({ dmg }), 1.0, [], []);
    assert.equal(room.getAugurTotalDebt(aug), 6, '20 - 14 = 6 remaining debt');
  }

  // 2. Gilded Card Box: max HP +15, debt reduction by 5 (min 5), upright +5%
  {
    const room = createRoomWithPlayers([
      { role: 'augur', hp: 70, equips: [{ id: 'aug_gilded_box', name: '鎏金諭示牌盒' }] },
      { role: 'warrior', hp: 100 }
    ]);
    const aug = room.players.p0;
    const war = room.players.p1;
    aug.observedTargetId = war.id;

    // Negative intercept of 20% produces 20 - 5 = 15 debt
    const oldRandom = Math.random;
    try {
      Math.random = () => 0.05;
      room.interveneNegative(war, '揮砍失衡', 20);
      assert.equal(room.getAugurTotalDebt(aug), 15, 'Gilded box reduces debt from 20 to 15');
    } finally {
      Math.random = oldRandom;
    }
  }

  // 3. Forbidden Tome: 2-round expiry, 50% true damage conversion, 18% reversed omen
  {
    const room = createRoomWithPlayers([
      { role: 'augur', hp: 70, equips: [{ id: 'aug_forbidden_tome', name: '禁忌厄運聖契' }] },
      { role: 'warrior', hp: 100 }
    ]);
    const aug = room.players.p0;
    const war = room.players.p1;
    aug.observedTargetId = war.id;

    // Debt expires in round 1 + 2 - 1 = round 2
    room.battleRound = 1;
    room.addAugurDebt(aug, 20);
    assert.equal(aug.augurFateDebts[0].dueRound, 2, 'Forbidden tome sets due round to round 2');

    // Skill repayment converts 50% rounded to true damage on Boss
    const bossHpBefore = room.currentMonster.hp;
    room.repayAugurDebt(aug, 15, 'skill');
    // 15 * 0.5 rounded = 8 true damage
    assert.equal(room.currentMonster.hp, bossHpBefore - 8);

    // Skill 2 omen bonus is 18% instead of 10%
    aug.action = 'aug_reckon';
    room.p8Action(aug, dmg => ({ dmg }), 1.0, [], []);
    assert.equal(room.currentMonster.reversedOmenBonus, 18, 'Forbidden tome boosts reversed omen to 18%');
  }
});
