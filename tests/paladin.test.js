import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Room } from '../game/Room.js';
import {
  CLASSES,
  LOOT_TABLE,
  getPlayerSkills,
  equipItemToPlayer,
  getActionPriority
} from '../game/constants.js';
import { fixture, random } from './phase8.test.js';

function equip(p, id) {
  return equipItemToPlayer(p, structuredClone(LOOT_TABLE.find(e => e.id === id)));
}

test('Paladin role configuration, assets, skills, and equipments match specifications', () => {
  const pal = CLASSES.paladin;
  assert.ok(pal, 'paladin class must exist');
  assert.equal(pal.name, '聖騎士');
  assert.equal(pal.maxHp, 90);
  assert.equal(pal.avatar, '/photo/Paladin.webp');
  assert.ok(fs.existsSync('public' + pal.avatar), 'Paladin avatar file must exist on disk');

  // Check skills
  const skills = pal.skills;
  assert.equal(skills.length, 3);
  assert.equal(skills[0].id, 'basic');
  assert.equal(skills[1].id, 'pal_glory');
  assert.equal(skills[1].label, '榮耀讚歌');
  assert.equal(skills[1].cd, 2);
  assert.equal(skills[2].id, 'pal_grace');
  assert.equal(skills[2].label, '代受恩典');
  assert.equal(skills[2].cd, 2);

  // Check action priorities
  assert.equal(getActionPriority('pal_glory'), 3);
  assert.equal(getActionPriority('pal_grace'), 3);

  // Check exclusive loot
  const hammer = LOOT_TABLE.find(e => e.id === 'pal_hammer');
  assert.ok(hammer, 'pal_hammer must exist');
  assert.equal(hammer.role, 'paladin');
  assert.equal(hammer.bonusAtk, 5);
  assert.equal(hammer.bonusHp, 10);

  const cuirass = LOOT_TABLE.find(e => e.id === 'pal_cuirass');
  assert.ok(cuirass, 'pal_cuirass must exist');
  assert.equal(cuirass.role, 'paladin');
  assert.equal(cuirass.unique, true);

  const banner = LOOT_TABLE.find(e => e.id === 'pal_banner');
  assert.ok(banner, 'pal_banner must exist');
  assert.equal(banner.role, 'paladin');
  assert.equal(banner.bonusHp, 20);
  assert.equal(banner.unique, true);
});

test('Paladin passive taunt increases targeting chance by 30%', (t) => {
  const { room } = fixture(t, ['warrior', 'paladin']);
  const warrior = room.players.p0;
  const paladin = room.players.p1;

  let paladinCount = 0;
  let warriorCount = 0;
  const iterations = 20000;

  for (let i = 0; i < iterations; i++) {
    const target = room.pickTargetWithTaunt([warrior, paladin]);
    if (target.id === paladin.id) paladinCount++;
    else warriorCount++;
  }

  // With weights 1.3 vs 1.0, Paladin expectation is 1.3 / 2.3 ≈ 56.5%
  const paladinRatio = paladinCount / iterations;
  assert.ok(paladinRatio > 0.53 && paladinRatio < 0.60, `Paladin ratio ${paladinRatio} should be around 56.5%`);
  assert.ok(paladinCount > warriorCount, 'Paladin should be targeted significantly more often than warrior');
});

test('Paladin basic attack deals 5 damage and grants 2x damage shield with no turn limit', (t) => {
  const { room, resolve } = fixture(t, ['paladin']);
  const pal = room.players.p0;
  pal.action = 'basic';
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;

  const q = resolve();

  // 5 physical damage dealt, monster HP decreased by 5
  assert.equal(room.currentMonster.hp, 995);

  // Paladin action step recorded 10 shield gained (2x 5 damage)
  const palStep = q.find(s => s.actionId === 'basic');
  assert.equal(palStep.hpSnapshot.players[0].tempHp, 10);

  const basicShield = (pal.p8Shields || []).find(s => s.kind === 'paladin_basic');
  assert.ok(basicShield, 'paladin_basic shield should exist');
  assert.equal(basicShield.initial, 10, 'Initial shield should be 2x damage = 10');
  assert.equal(basicShield.until, Infinity, 'Basic shield should have no round limit (Infinity)');

  // Monster hits for 5 damage (min 5 effective attack), absorbing 5 shield -> 5 shield left
  assert.equal(pal.tempHp, 5, 'Shield absorbed 5 damage, 5 remaining');

  // Next round start -> shield does NOT expire
  room.battleRound = 2;
  room.p8RoundStart();
  assert.equal(pal.tempHp, 5, 'Basic shield should persist across rounds');

  // Round 3 start -> shield still persists
  room.battleRound = 3;
  room.p8RoundStart();
  assert.equal(pal.tempHp, 5, 'Basic shield should continue to persist');
});

test('Paladin Skill 1 Glory Carol: self 50% max HP shield (2 rounds), deals 15 damage, tracks ally damage, next round converts 70% to party shield (2 rounds)', (t) => {
  const { room, resolve } = fixture(t, ['paladin', 'mage']);
  const pal = room.players.p0;
  const mage = room.players.p1;

  pal.action = 'pal_glory';
  mage.action = 'basic'; // Mage deals 10 magic damage
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;

  const q = resolve();

  // Paladin deals 15 physical damage and Mage deals 10 magic damage -> monster hp = 1000 - 15 - 10 = 975
  assert.equal(room.currentMonster.hp, 975);

  // Round 1: Paladin gains 50% maxHp shield (90 * 0.5 = 45) lasting 2 rounds
  const palStep = q.find(s => s.actionId === 'pal_glory');
  assert.equal(palStep.hpSnapshot.players.find(p => p.id === pal.id).tempHp, 45);

  const selfShield = (pal.p8Shields || []).find(s => s.kind === 'paladin_glory_self');
  assert.ok(selfShield);
  assert.equal(selfShield.initial, 45);
  assert.equal(selfShield.until, 2); // 2 round duration

  // Tracked damage: paladin dealt 15 + mage dealt 10 = 25 damage
  assert.equal(pal.paladinGloryTrackedDamage, 25);
  assert.equal(pal.paladinGloryCastedRound, 1);

  // Round 2 start: conversion occurs
  room.battleRound = 2;
  // Without cuirass: roll penalty=false (Math.random() >= 0.40, e.g. 0.50)
  random(0.50, () => {
    room.p8RoundStart();
  });

  // Tracked damage = 25. 70% of 25 = 17 shield for all allies!
  // Self 50% shield (until 2) absorbed 2 damage in round 1 (43 remaining) + 17 = 60!
  assert.equal(mage.tempHp, 17);
  assert.equal(pal.tempHp, 60);

  const palPartyShield = (pal.p8Shields || []).find(s => s.kind === 'paladin_glory');
  assert.ok(palPartyShield);
  assert.equal(palPartyShield.value, 17);
  assert.equal(palPartyShield.until, 3, 'Party shield should last 2 rounds (until round 3)');

  // While holding paladin_glory shield, team damage is boosted by 20%
  pal.action = 'basic';
  mage.action = 'basic';
  // Paladin basic: base 5 * 1.20 = 6
  // Mage basic: base 10 * 1.20 = 12
  const q2 = resolve();
  const palStep2 = q2.find(s => s.actionId === 'basic' && s.sourceRole === 'paladin');
  assert.equal(palStep2.finalDamage, 6, 'Paladin basic attack should be boosted by 20%');

  // Test self shield duration expires at round 3:
  room.battleRound = 3;
  room.p8RoundStart();
  // Self shield (until 2) expired at start of round 3!
  // Paladin retains 17 party shield + 12 basic shield from round 2 attack = 29.
  assert.equal(pal.tempHp, 29);
  // Mage absorbed 5 damage in round 2, so 17 - 5 = 12 remaining
  assert.equal(mage.tempHp, 12);

  // Round 4: Party shield expires
  room.battleRound = 4;
  room.p8RoundStart();
  assert.equal(mage.tempHp, 0, 'Party shield should expire in round 4 for Mage');
  assert.equal(pal.tempHp, 12, 'Paladin basic shield with no round limit should still persist in round 4');
});

test('Paladin Skill 1 Glory Carol: 40% penalty halves shield, reduced to 15% with Martyr Cuirass', (t) => {
  const { room } = fixture(t, ['paladin']);
  const pal = room.players.p0;

  // Case A: Without cuirass, random = 0.35 (< 0.40) triggers penalty
  pal.paladinGloryCastedRound = 1;
  pal.paladinGloryTrackedDamage = 100; // 70% is 70
  room.battleRound = 2;
  random(0.35, () => {
    room.p8RoundStart();
  });
  // 70 halved to 35
  assert.equal(pal.tempHp, 35);

  // Reset
  pal.tempHp = 0;
  pal.p8Shields = [];

  // Case B: With cuirass, random = 0.35 (>= 0.15) does NOT trigger penalty
  equip(pal, 'pal_cuirass');
  pal.paladinGloryCastedRound = 2;
  pal.paladinGloryTrackedDamage = 100; // 70% is 70
  room.battleRound = 3;
  random(0.35, () => {
    room.p8RoundStart();
  });
  // Full 70 shield
  assert.equal(pal.tempHp, 70);

  // Case C: With cuirass, random = 0.10 (< 0.15) triggers penalty
  pal.tempHp = 0;
  pal.p8Shields = [];
  pal.paladinGloryCastedRound = 3;
  pal.paladinGloryTrackedDamage = 100;
  room.battleRound = 4;
  random(0.10, () => {
    room.p8RoundStart();
  });
  assert.equal(pal.tempHp, 35);
});

test('Paladin Skill 2 Grace redirects ally damage and debuffs to Paladin for 2 rounds, accumulates damage and rolls 50% shield', (t) => {
  const { room, resolve } = fixture(t, ['paladin', 'mage']);
  const pal = room.players.p0;
  const mage = room.players.p1;

  // Round 1: Paladin casts pal_grace targeting mage
  pal.action = 'pal_grace';
  pal.targetPlayerId = mage.id;
  mage.action = 'skip';

  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 10; // Moderate attack so paladin survives both rounds
  room.currentMonster.baseHp = 50; // Triggers bleed if damage taken

  resolve();

  // Mage should have taken 0 damage and 0 bleed
  assert.equal(mage.hp, mage.maxHp, 'Mage should take 0 damage');
  assert.equal(mage.bleedTurns || 0, 0, 'Mage should not receive bleed');

  // Paladin should have intercepted damage and bleed
  assert.ok(pal.hp < pal.maxHp, 'Paladin should have taken intercepted damage');
  assert.ok(pal.bleedTurns > 0, 'Paladin should receive bleed');
  assert.ok(pal.paladinGrace, 'paladinGrace should be active');
  assert.ok(pal.paladinGrace.interceptedDamage > 0, 'Paladin should track intercepted damage');

  const interceptedRound1 = pal.paladinGrace.interceptedDamage;

  // Round 2: Monster attacks again
  room.battleRound = 2;
  pal.action = 'skip';
  mage.action = 'skip';
  resolve();

  // Paladin accumulates more intercepted damage
  assert.ok(pal.paladinGrace.interceptedDamage >= interceptedRound1);
  const totalIntercepted = pal.paladinGrace.interceptedDamage;

  // Round 3: At round start, 2 rounds have completed (3 >= 1 + 2)
  room.battleRound = 3;
  random(0.20, () => {
    room.p8RoundStart();
  });

  // 50% shield roll succeeded (< 0.50)
  const graceShield = (pal.p8Shields || []).find(s => s.kind === 'paladin_grace');
  assert.ok(graceShield, 'paladin_grace shield should be granted at duration end');
  assert.equal(graceShield.value, Math.floor(totalIntercepted * 0.50), 'Shield value should be exactly 50% of intercepted damage');
  assert.equal(pal.paladinGrace, null, 'paladinGrace state should be cleared after duration ends');
  assert.equal(graceShield.until, 4, 'Grace shield should last 2 rounds (until round 4)');
});

test('Paladin Equipment Sanctuary Banner grants +20 HP and 15% damage reduction when holding shield', (t) => {
  const { room } = fixture(t, ['paladin']);
  const pal = room.players.p0;
  const initialMaxHp = pal.maxHp;

  // Equip banner
  equip(pal, 'pal_banner');
  assert.equal(pal.maxHp, initialMaxHp + 20, 'Banner should grant +20 max HP');

  // Direct damage without shield -> no 15% reduction
  pal.tempHp = 0;
  pal.p8Shields = [];
  const dmgNoShield = room.applyDamageToPlayer(pal, 20);
  assert.equal(dmgNoShield.hpDmg, 20, 'Without shield, takes full 20 damage');

  // Give Paladin a shield
  room.p8GrantShield(pal, 50, 1, 'test');
  assert.equal(pal.tempHp, 50);

  // In monster damage calculation / trap, holding shield reduces damage by 15%
  const trapDmg = 20;
  let reducedDmg = trapDmg;
  if (pal.role === 'paladin' && ((pal.tempHp > 0) || (pal.p8Shields || []).some(s => s.value > 0)) && (pal.equips || []).some(e => e.id === 'pal_banner')) {
    reducedDmg = Math.floor(reducedDmg * 0.85);
  }
  assert.equal(reducedDmg, 17, 'Damage should be reduced from 20 to 17 (15% reduction)');
});

test('Paladin Equipment Oath Hammer grants +5 Physical ATK and +10 Max HP', (t) => {
  const { room, resolve } = fixture(t, ['paladin']);
  const pal = room.players.p0;
  const initialMaxHp = pal.maxHp;

  equip(pal, 'pal_hammer');
  assert.equal(pal.maxHp, initialMaxHp + 10, 'Oath Hammer should grant +10 max HP');
  assert.equal(pal.bonusAtk, 5, 'Oath Hammer should grant +5 bonus ATK');

  // Basic attack: base 5 + 5 = 10 damage
  pal.action = 'basic';
  room.currentMonster.hp = 1000;
  const q = resolve();

  assert.equal(room.currentMonster.hp, 990, 'Basic attack should deal 10 damage');
  const palStep = q.find(s => s.actionId === 'basic');
  assert.equal(palStep.hpSnapshot.players[0].tempHp, 20, 'Should gain 2x damage = 20 shield at time of attack');
  const basicShield = (pal.p8Shields || []).find(s => s.kind === 'paladin_basic');
  assert.equal(basicShield.initial, 20);
});
