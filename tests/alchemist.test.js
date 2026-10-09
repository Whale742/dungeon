import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { CLASSES, ROLE_DETAILS } from '../game/constants.js';

function fixture(t, roles = ['alchemist', 'warrior']) {
  const events = [];
  const io = { to: () => ({ emit: (name, data) => events.push({ name, data }) }) };
  const socket = id => ({ id, join() {} });
  const room = new Room('ALC_TEST', socket('p0'), 'Player 0', io);
  for (let i = 1; i < roles.length; i++) room.addPlayer(socket('p' + i), 'Player ' + i);
  roles.forEach((role, i) => room.selectRole('p' + i, role));
  room.state = 'IN_BATTLE'; room.floor = 1; room.battleRound = 1;
  room.currentMonster = {
    name: 'Test Boss',
    avatar: '/BOSS/Ancient Guardian Golem.webp',
    hp: 1000,
    maxHp: 1000,
    atk: 10,
    attack: 10,
    resistance: null,
    resistances: { physical: 0, magic: 0, effect: 0 },
    ultName: 'Test Ultimate',
    poisonTurns: 0,
    poisonDmg: 0,
    burnTurns: 0,
    burnDmg: 0,
    fractureTurns: 0,
    fractureDmg: 0,
    chillTurns: 0,
    chillDmg: 0,
    corrosionTurns: 0,
    corrosionMaxHpDeducted: 0
  };
  for (const p of Object.values(room.players)) p.action = 'skip';
  t.after(() => room.clearTimer());
  return { room, events, queue: () => events.findLast(e => e.name === 'battle:presentation_queue')?.data };
}

function resolveWith(room, rngValue = 0.5) {
  const old = Math.random;
  Math.random = typeof rngValue === 'function' ? rngValue : () => rngValue;
  try { room.resolveTurnActions(); } finally { Math.random = old; }
}

test('Alchemist descriptions: skill descriptions do NOT explain status effects, passive explains all 5 statuses', () => {
  // Skill descriptions must not explain status mechanics
  const basicDesc = CLASSES.alchemist.skills[0].desc;
  const skill1Desc = CLASSES.alchemist.skills[1].desc;
  assert.ok(basicDesc.includes('造成 10 點傷害'));
  assert.ok(basicDesc.includes('70% 機率造成腐蝕效果持續一回合'));
  assert.ok(basicDesc.includes('35% 機率使我方全體也觸發腐蝕效果'));
  assert.ok(!basicDesc.includes('減少 5%'));
  assert.ok(!basicDesc.includes('減半'));

  assert.ok(skill1Desc.includes('造成 35 點傷害'));
  assert.ok(skill1Desc.includes('中毒、燃燒、骨折、寒冷'));
  assert.ok(skill1Desc.includes('40% 機率對我方全體同步造成此次效果'));
  assert.ok(!skill1Desc.includes('每回合開始時'));

  // Passive descriptions in CLASSES and ROLE_DETAILS must contain all 5 status mechanics
  for (const passive of [CLASSES.alchemist.desc, ROLE_DETAILS.alchemist.passive]) {
    assert.ok(passive.includes('腐蝕：Boss 的血量上限與傷害減少 5%，玩家觸發時裝備效果減半'));
    assert.ok(passive.includes('中毒：每回合開始時造成 5 點傷害，持續 2 回合'));
    assert.ok(passive.includes('燃燒：每回合開始時造成 7 點傷害，持續 1 回合'));
    assert.ok(passive.includes('骨折：每回合開始時造成 2 點傷害，持續 3 回合'));
    assert.ok(passive.includes('寒冷：每回合開始時造成 3 點傷害，持續 2 回合'));
  }
});

test('Alchemist basic attack: deals 10 damage, triggers corrosion (boss max HP & damage -5%, ally equips halved)', t => {
  const { room, queue } = fixture(t, ['alchemist', 'warrior']);
  const alc = room.players.p0;
  const war = room.players.p1;
  alc.action = 'basic';
  alc.rollCorrosion = true; // Force 70% corrosion check to pass
  alc.rollTeamCorrosion = true; // Force 35% ally corrosion check to pass

  // Give warrior an attack equipment
  war.equips = [{ id: 'w_sword', name: '鋼鐵聖劍', bonusAtk: 10 }];
  war.bonusAtk = 10;
  room.p8RefreshEquipment();

  const initialBossMaxHp = room.currentMonster.maxHp; // 1000
  resolveWith(room, 0.5);

  const step = queue().queue.find(s => s.actionId === 'basic');
  assert.ok(step);
  assert.equal(step.finalDamage, 10);

  // Boss is corroded: max HP reduced by 5% (1000 * 0.05 = 50)
  assert.equal(room.currentMonster.corrosionTurns, 1);
  assert.equal(room.currentMonster.maxHp, initialBossMaxHp - 50);
  assert.equal(room.currentMonster.corrosionMaxHpDeducted, 50);

  // Both allies are corroded for 1 round
  assert.equal(alc.corrosionTurns, 1);
  assert.equal(war.corrosionTurns, 1);

  // Warrior equipment attack bonus is halved: bonusAtk was 10, with 50% multiplier becomes 5 (+ warriorStacks gained from taking damage)
  assert.equal(room.getEffectiveBonusAtk(war), 5 + (war.warriorStacks || 0));

  // Boss damage was reduced by 5% during monster attack phase
  // Let's verify round start of round 2 restores boss max HP and player equipment
  room.battleRound = 2;
  room.executeRoundStart();

  assert.equal(room.currentMonster.corrosionTurns, 0);
  assert.equal(room.currentMonster.maxHp, initialBossMaxHp);
  assert.equal(alc.corrosionTurns, 0);
  assert.equal(war.corrosionTurns, 0);
  assert.equal(room.getEffectiveBonusAtk(war), 10 + (war.warriorStacks || 0));
});

test('Alchemist 1-skill: deals 35 damage, inflicts 4 DoTs on monster, and 40% syncs to team', t => {
  // Test Poison: 5 dmg, 2 rounds
  {
    const { room } = fixture(t, ['alchemist', 'warrior']);
    const alc = room.players.p0;
    alc.action = 'alc_flask';
    alc.rolledFlaskDot = 'poison';
    alc.rollTeamDot = true; // Force 40% team sync
    resolveWith(room, 0.1);

    assert.equal(room.currentMonster.hp, 1000 - 35);
    assert.equal(room.currentMonster.poisonTurns, 2);
    assert.equal(room.currentMonster.poisonDmg, 5);
    assert.equal(room.players.p0.poisonTurns, 2);
    assert.equal(room.players.p0.poisonDmg, 5);
    assert.equal(room.players.p1.poisonTurns, 2);
    assert.equal(room.players.p1.poisonDmg, 5);

    // Round 2 start: ticks 5 damage on boss and players
    const bossHpBefore = room.currentMonster.hp;
    const p0HpBefore = room.players.p0.hp;
    room.battleRound = 2;
    room.executeRoundStart();
    assert.equal(room.currentMonster.hp, bossHpBefore - 5);
    assert.equal(room.currentMonster.poisonTurns, 1);
    assert.equal(room.players.p0.hp, p0HpBefore - 5);
    assert.equal(room.players.p0.poisonTurns, 1);
  }

  // Test Burn: 7 dmg, 1 round
  {
    const { room } = fixture(t, ['alchemist', 'warrior']);
    const alc = room.players.p0;
    alc.action = 'alc_flask';
    alc.rolledFlaskDot = 'burn';
    alc.rollTeamDot = true;
    resolveWith(room, 0.3);

    assert.equal(room.currentMonster.burnTurns, 1);
    assert.equal(room.currentMonster.burnDmg, 7);
    assert.equal(room.players.p0.burnTurns, 1);
    assert.equal(room.players.p0.burnDmg, 7);

    // Round 2 start: ticks 7 damage on boss and players, expires after 1 round
    const bossHpBefore = room.currentMonster.hp;
    const p0HpBefore = room.players.p0.hp;
    room.battleRound = 2;
    room.executeRoundStart();
    assert.equal(room.currentMonster.hp, bossHpBefore - 7);
    assert.equal(room.currentMonster.burnTurns, 0);
    assert.equal(room.players.p0.hp, p0HpBefore - 7);
    assert.equal(room.players.p0.burnTurns, 0);
  }

  // Test Fracture: 2 dmg, 3 rounds
  {
    const { room } = fixture(t, ['alchemist', 'warrior']);
    const alc = room.players.p0;
    alc.action = 'alc_flask';
    alc.rolledFlaskDot = 'fracture';
    alc.rollTeamDot = true;
    resolveWith(room, 0.6);

    assert.equal(room.currentMonster.fractureTurns, 3);
    assert.equal(room.currentMonster.fractureDmg, 2);
    assert.equal(room.players.p0.fractureTurns, 3);

    // Round 2 start: ticks 2 damage, 2 rounds left
    const bossHpBefore = room.currentMonster.hp;
    const p0HpBefore = room.players.p0.hp;
    room.battleRound = 2;
    room.executeRoundStart();
    assert.equal(room.currentMonster.hp, bossHpBefore - 2);
    assert.equal(room.currentMonster.fractureTurns, 2);
    assert.equal(room.players.p0.hp, p0HpBefore - 2);
    assert.equal(room.players.p0.fractureTurns, 2);
  }

  // Test Chill: 3 dmg, 2 rounds
  {
    const { room } = fixture(t, ['alchemist', 'warrior']);
    const alc = room.players.p0;
    alc.action = 'alc_flask';
    alc.rolledFlaskDot = 'chill';
    alc.rollTeamDot = true;
    resolveWith(room, 0.85);

    assert.equal(room.currentMonster.chillTurns, 2);
    assert.equal(room.currentMonster.chillDmg, 3);
    assert.equal(room.players.p0.chillTurns, 2);

    // Round 2 start: ticks 3 damage, 1 round left
    const bossHpBefore = room.currentMonster.hp;
    const p0HpBefore = room.players.p0.hp;
    room.battleRound = 2;
    room.executeRoundStart();
    assert.equal(room.currentMonster.hp, bossHpBefore - 3);
    assert.equal(room.currentMonster.chillTurns, 1);
    assert.equal(room.players.p0.hp, p0HpBefore - 3);
    assert.equal(room.players.p0.chillTurns, 1);
  }
});

test('Paladin grace redirection: redirects corrosion and DoT to Paladin', t => {
  const { room } = fixture(t, ['alchemist', 'paladin']);
  const alc = room.players.p0;
  const pal = room.players.p1;

  // Paladin casts grace on Alchemist
  pal.paladinGrace = { targetId: alc.id, duration: 2, interceptedDamage: 0 };

  // Alchemist triggers corrosion on allies
  alc.action = 'basic';
  alc.rollCorrosion = true;
  alc.rollTeamCorrosion = true;
  resolveWith(room, 0.5);

  // Since Alchemist is protected by Paladin, Alchemist does NOT have corrosion; Paladin has it
  assert.equal(alc.corrosionTurns, 0);
  assert.equal(pal.corrosionTurns, 1);
});

test('Alchemist alc_fate cleanses burn, fracture, chill, and corrosion', t => {
  const { room } = fixture(t, ['alchemist', 'warrior']);
  const alc = room.players.p0;
  const war = room.players.p1;

  // Apply all debuffs
  alc.burnTurns = 1; alc.burnDmg = 7;
  alc.fractureTurns = 3; alc.fractureDmg = 2;
  war.chillTurns = 2; war.chillDmg = 3;
  war.corrosionTurns = 1;

  alc.action = 'alc_fate';
  resolveWith(room, 0.1); // Alchemy success

  // All debuffs should be cleansed
  assert.equal(alc.burnTurns, 0);
  assert.equal(alc.fractureTurns, 0);
  assert.equal(war.chillTurns, 0);
  assert.equal(war.corrosionTurns, 0);
});
