import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_STATS,
  resolveStats,
  resolveSkillAttack,
  defenseReduction,
  mitigateDirectDamage,
  skillValue,
  crossbowAllocations
} from '../game/stats.js';
import { CLASSES, ROLE_DETAILS, LOOT_TABLE, getPlayerSkills, equipItemToPlayer, unequipItemFromPlayer } from '../game/constants.js';
import { addAssassinCritical, assassinCritRate } from '../game/assassin.js';
import { fixture, random } from './phase8.test.js';

function equip(p, id) {
  return equipItemToPlayer(p, structuredClone(LOOT_TABLE.find(e => e.id === id)));
}

test('v2 Phase 1: All 15 roles match canonical v2 initial stats (HP / ATK_base / DEF)', () => {
  const expected = {
    warrior: [120, 8, 12],
    paladin: [90, 8, 10],
    druid: [85, 10, 6],
    gladiator: [85, 12, 5],
    samurai: [80, 13, 6],
    archer: [80, 14, 2],
    mage: [80, 15, 0],
    dreamweaver: [75, 10, 3],
    bard: [70, 9, 4],
    alchemist: [70, 10, 3],
    stargazer: [70, 11, 2],
    augur: [70, 10, 3],
    onmyoji: [70, 12, 0],
    sage: [70, 14, 0],
    assassin: [50, 16, 0]
  };
  assert.equal(Object.keys(INITIAL_STATS).length, 15);
  for (const [role, [hp, atk, def]] of Object.entries(expected)) {
    assert.deepEqual(INITIAL_STATS[role], { maxHp: hp, attack: atk, defense: def }, role);
    assert.equal(CLASSES[role].maxHp, hp, `${role} maxHp`);
    assert.equal(CLASSES[role].ATK_base, atk, `${role} ATK_base`);
    assert.equal(CLASSES[role].DEF, def, `${role} DEF`);
  }
});

test('v2 Phase 1: All 15 roles unequipped baseline values match canonical v2 skill formulas', (t) => {
  const mk = (role) => {
    const { room } = fixture(t, [role]);
    return room.players.p0;
  };

  // 01 Warrior
  const war = mk('warrior');
  assert.equal(skillValue(war, 'basic'), 5);
  assert.equal(skillValue(war, 'w_strike'), 18);
  assert.equal(skillValue(war, 'w_miss'), 5);
  assert.equal(skillValue(war, 'w_shield'), 48);
  assert.equal(skillValue(war, 'w_cleave'), 25);

  // 02 Paladin
  const pal = mk('paladin');
  assert.equal(skillValue(pal, 'basic'), 5);
  assert.equal(skillValue(pal, 'pal_glory'), 15);
  assert.equal(skillValue(pal, 'pal_shield'), 45);

  // 03 Druid
  const dru = mk('druid');
  assert.equal(skillValue(dru, 'basic'), 10);
  dru.druidForm = 'treant';
  assert.equal(skillValue(dru, 'basic'), 10);
  dru.druidForm = 'werewolf';
  assert.equal(skillValue(dru, 'basic'), 35);
  assert.equal(skillValue(dru, 'dru_claw'), 35);
  assert.equal(skillValue(dru, 'dru_shield'), 72);

  // 04 Gladiator
  const gla = mk('gladiator');
  assert.equal(skillValue(gla, 'basic'), 10);
  assert.equal(skillValue(gla, 'g_strike', { players: 2, stacks: 3 }), 15 + 20 + 75);
  assert.equal(skillValue(gla, 'g_rage'), 10);

  // 05 Samurai
  const sam = mk('samurai');
  assert.equal(skillValue(sam, 'basic'), 10);
  assert.equal(skillValue(sam, 'sa_cut'), 15);
  assert.equal(skillValue(sam, 'sa_tsubame'), 10);
  assert.equal(skillValue(sam, 'sa_counter', { blocks: 3 }), 13);

  // 06 Archer
  const arc = mk('archer');
  assert.equal(skillValue(arc, 'basic'), 10);
  assert.equal(skillValue(arc, 'a_shot'), 35);
  assert.equal(skillValue(arc, 'a_rain'), 20);
  assert.equal(skillValue(arc, 'a_friendly'), 10);
  assert.equal(crossbowAllocations(arc, ['pierce']).reduce((n, r) => n + r.damage, 0), 45);
  assert.equal(crossbowAllocations(arc, ['pierce', 'elemental']).reduce((n, r) => n + r.damage, 0), 63);
  assert.equal(crossbowAllocations(arc, ['pierce', 'elemental', 'burst']).reduce((n, r) => n + r.damage, 0), 89);

  // 07 Mage
  const mag = mk('mage');
  assert.equal(skillValue(mag, 'basic'), 10);
  assert.equal(skillValue(mag, 'm_blast'), 45);
  assert.equal(skillValue(mag, 'm_secondary'), 15);
  assert.equal(skillValue(mag, 'm_miss'), 10);
  assert.equal(skillValue(mag, 'm_secondary_miss'), 4);
  assert.equal(skillValue(mag, 'm_drain_max'), 50);

  // 08 Dreamweaver
  const dw = mk('dreamweaver');
  assert.equal(skillValue(dw, 'basic'), 10);

  // 09 Bard
  const bar = mk('bard');
  assert.equal(skillValue(bar, 'basic'), 10);
  assert.equal(skillValue(bar, 'b_heal'), 22);
  assert.equal(skillValue(bar, 'b_single'), 28);
  assert.equal(skillValue(bar, 'b_miss'), 5);
  assert.equal(skillValue(bar, 'b_nocturne'), 15);
  assert.equal(skillValue(bar, 'b_frenzy'), 25);

  // 10 Alchemist
  const alc = mk('alchemist');
  assert.equal(skillValue(alc, 'basic'), 10);
  assert.equal(skillValue(alc, 'alc_flask'), 35);
  assert.equal(skillValue(alc, 'poison'), 8);
  assert.equal(skillValue(alc, 'burn'), 10);
  assert.equal(skillValue(alc, 'fracture'), 5);
  assert.equal(skillValue(alc, 'chill'), 6);
  assert.equal(skillValue(alc, 'alc_success'), 40);
  assert.equal(skillValue(alc, 'alc_failure'), 10);
  assert.equal(skillValue(alc, 'alc_stable'), 15);

  // 11 Stargazer
  const sg = mk('stargazer');
  assert.equal(skillValue(sg, 'basic'), 10);
  assert.equal(skillValue(sg, 'sg_star'), 15);
  assert.equal(skillValue(sg, 'sg_planet'), 25);
  assert.equal(skillValue(sg, 'sg_bonus'), 5);

  // 12 Augur
  const aug = mk('augur');
  assert.equal(skillValue(aug, 'basic'), 10);
  assert.equal(skillValue(aug, 'aug_reckon'), 15);
  assert.equal(skillValue(aug, 'aug_heal'), 10);

  // 13 Onmyoji
  const onm = mk('onmyoji');
  assert.equal(skillValue(onm, 'basic'), 10);
  assert.equal(skillValue(onm, 'onm_detonate', { stacks: 0 }), 0);
  assert.equal(skillValue(onm, 'onm_detonate', { stacks: 1 }), 13);
  assert.equal(skillValue(onm, 'onm_detonate', { stacks: 5 }), 25);
  assert.equal(skillValue(onm, 'onm_detonate', { stacks: 10 }), 40);

  // 14 Sage
  const sge = mk('sage');
  assert.equal(skillValue(sge, 'basic'), 10);
  assert.equal(skillValue(sge, 'sge_deduce'), 10);
  assert.equal(skillValue(sge, 'sge_induce'), 10);

  // 15 Assassin
  const asn = mk('assassin');
  assert.equal(skillValue(asn, 'basic'), 10);
  assert.equal(skillValue(asn, 's_stab'), 35);
  assert.equal(skillValue(asn, 's_smoke', { stacks: 0 }), 30);
  assert.equal(skillValue(asn, 's_smoke', { stacks: 1 }), 45);
  assert.equal(skillValue(asn, 's_smoke', { stacks: 3 }), 75);
});

test('v2 Phase 1 & 2: Typed PAtk_gear / MAtk_gear separation and Crossbow largest-remainder allocation', (t) => {
  const { room } = fixture(t, ['archer']);
  const arc = room.players.p0;
  arc.PAtk_gear = 4;
  arc.MAtk_gear = 2;

  assert.equal(resolveSkillAttack({ actor: arc, damageType: 'phys' }), 18);
  assert.equal(resolveSkillAttack({ actor: arc, damageType: 'mag' }), 16);

  // PAtk_gear boosts physical skills, not a_rain (magical)
  assert.equal(skillValue(arc, 'basic'), Math.round(3 + 0.5 * 18)); // 12
  assert.equal(skillValue(arc, 'a_shot'), Math.round(7 + 2 * 18)); // 43
  assert.equal(skillValue(arc, 'a_rain'), Math.round(6 + 1 * 16)); // 22 (uses MAtk_gear=2, not PAtk_gear=4)

  // Mixed crossbow magazine: 1 pierce + 1 elemental with ATK_base=14, PAtk_gear=4, MAtk_gear=2
  // r_1 = 10.5 + 1.5 * 18 = 37.5, r_2 = 10.5 + 1.5 * 16 = 34.5 -> T = 72 -> 38 phys + 34 mag
  const alloc2 = crossbowAllocations(arc, ['pierce', 'elemental']);
  assert.equal(alloc2.reduce((n, r) => n + r.damage, 0), 72);
  assert.deepEqual(alloc2.map(r => r.damage), [38, 34]);

  // Reverse order tie-break: elemental first, pierce second -> 35 mag + 37 phys
  const alloc2Rev = crossbowAllocations(arc, ['elemental', 'pierce']);
  assert.equal(alloc2Rev.reduce((n, r) => n + r.damage, 0), 72);
  assert.deepEqual(alloc2Rev.map(r => r.damage), [35, 37]);
});

test('v2 Phase 2: DEF reduction curve D / (D + 50) and exemptions', (t) => {
  assert.equal(defenseReduction(0), 0);
  assert.ok(Math.abs(defenseReduction(10) - 10 / 60) < 1e-12);
  assert.ok(Math.abs(defenseReduction(12) - 12 / 62) < 1e-12);
  assert.equal(defenseReduction(50), 0.5);

  assert.equal(mitigateDirectDamage(100, { defense: 0, damageType: 'phys' }), 100);
  assert.equal(mitigateDirectDamage(100, { defense: 50, damageType: 'phys' }), 50);
  assert.equal(mitigateDirectDamage(100, { defense: 50, damageType: 'true' }), 100);
  assert.equal(mitigateDirectDamage(100, { defense: 50, damageType: 'phys', ignoreReduction: true }), 100);
});

test('v2 Phase 2: Mage m_blast and Archer a_rain multi-target support', (t) => {
  // Mage m_blast: single Boss only takes primary damage (45), secondary targets take secondary damage (15)
  const { room, resolve } = fixture(t, ['mage']);
  const mag = room.players.p0;
  mag.action = 'm_blast';
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;
  const sec1 = { id: 'm2', name: '次要魔物A', hp: 200, maxHp: 200, resistances: { physical: 0, magic: 0, effect: 0 } };
  const sec2 = { id: 'm3', name: '次要魔物B', hp: 200, maxHp: 200, resistances: { physical: 0, magic: 0, effect: 0 } };
  room.secondaryMonsters = [sec1, sec2];

  resolve(0.9);
  assert.equal(room.currentMonster.hp, 1000 - 45);
  assert.equal(sec1.hp, 200 - 15);
  assert.equal(sec2.hp, 200 - 15);

  // Archer a_rain: hits all valid enemy targets for 20 magic damage each, friendly fire hits at most 1 random ally
  const f2 = fixture(t, ['archer', 'warrior', 'paladin']);
  f2.room.players.p0.action = 'a_rain';
  f2.room.currentMonster.hp = 1000;
  f2.room.currentMonster.attack = 0;
  const subA = { id: 's1', name: '隨從A', hp: 100, maxHp: 100, atk: 20, attack: 20 };
  f2.room.secondaryMonsters = [subA];

  f2.resolve(0.1); // triggers 20% friendly fire on exactly 1 ally
  assert.equal(f2.room.currentMonster.hp, 1000 - 20);
  assert.equal(subA.hp, 100 - 20);
  assert.equal(subA.atk, 10);
});

test('v2 Phase 3: Bard b_heal scales only with own maxHp and b_buff is pure +50% damage', (t) => {
  const { room, resolve } = fixture(t, ['bard', 'warrior']);
  const bar = room.players.p0;
  const war = room.players.p1;
  bar.PAtk_gear = 50;
  bar.MAtk_gear = 50;
  assert.equal(skillValue(bar, 'b_heal'), 22);
  assert.equal(skillValue(bar, 'b_single'), 28);
  bar.maxHp = 100;
  assert.equal(skillValue(bar, 'b_heal'), 31);
  assert.equal(skillValue(bar, 'b_single'), 40);

  // b_buff grants +50% damage, no DR, no resistance shred, no 5 HP exhaustion drain
  bar.maxHp = 70;
  bar.hp = 70;
  war.hp = 120;
  bar.action = 'b_buff';
  war.action = 'basic';
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;
  room.currentMonster.resistances = { physical: 50, magic: 50, effect: 0 };

  const q = resolve(0.01); // Even with 0.01 roll, no overload / 5 HP drain
  const buffStep = q.find(s => s.actionId === 'b_buff');
  assert.equal(buffStep.outcome.type, 'normal');
  assert.equal(buffStep.hpSnapshot.players[0].hp, 70);
  assert.equal(room.bardDmgReductionTurns || 0, 0);
  assert.equal(room.bardResistShredTurns || 0, 0);
});

test('v2 Phase 3: Druid treant fixed 1 ATK, wolf 80% PAtk, treant form basic = human basic, and partner terminology', (t) => {
  const { room, resolve } = fixture(t, ['druid']);
  const dru = room.players.p0;
  dru.PAtk_gear = 20; // A物 = 10 + 20 = 30
  dru.victoryAtkBonus = 10; // A物 = 40
  room.currentMonster.attack = 0;

  // Summon treant: fixed 1 ATK regardless of Druid A物
  dru.action = 'dru_summon_treant';
  resolve(0.5);
  assert.equal(dru.minions.length, 1);
  assert.equal(dru.minions[0].type, 'treant');
  assert.equal(dru.minions[0].atk, 1);
  assert.equal(dru.minions[0].maxHp, Math.floor(10 + 85 * 0.25)); // 31

  // Summon wolf: floor(80% * A物) = floor(0.8 * 40) = 32
  dru.action = 'dru_summon_wolf';
  resolve(0.5);
  const wolf = dru.minions.find(m => m.type === 'wolf');
  assert.equal(wolf.atk, 32);
  assert.equal(wolf.maxHp, Math.floor(5 + 85 * 0.10)); // 13

  // Terminology check: no "僕從" in Druid CLASSES or ROLE_DETAILS descriptions
  const druidText = JSON.stringify([CLASSES.druid, ROLE_DETAILS.druid]);
  assert.ok(!druidText.includes('僕從'), 'Druid copy must use 夥伴 instead of 僕從');
  assert.ok(druidText.includes('夥伴'));
});

test('v2 Phase 3: Exclusive equipment skill sets are mutually exclusive with standard skills', (t) => {
  // Warrior w_greatsword replaces w_shield with w_cleave
  const { room: rWar } = fixture(t, ['warrior']);
  const war = rWar.players.p0;
  assert.deepEqual(getPlayerSkills(war).map(s => s.id), ['basic', 'w_strike', 'w_shield']);
  equip(war, 'w_greatsword');
  assert.deepEqual(getPlayerSkills(war).map(s => s.id), ['basic', 'w_strike', 'w_cleave']);
  unequipItemFromPlayer(war, 0);
  assert.deepEqual(getPlayerSkills(war).map(s => s.id), ['basic', 'w_strike', 'w_shield']);

  // Archer a_crossbow replaces basic/a_shot/a_rain with basic__crossbow/a_reload/a_frenzy_reload
  const { room: rArc } = fixture(t, ['archer']);
  const arc = rArc.players.p0;
  assert.deepEqual(getPlayerSkills(arc).map(s => s.id), ['basic', 'a_shot', 'a_rain']);
  equip(arc, 'a_crossbow');
  assert.deepEqual(getPlayerSkills(arc).map(s => s.id), ['basic', 'a_reload', 'a_frenzy_reload']);
  assert.equal(getPlayerSkills(arc)[0].copyKey, 'basic__crossbow');
  unequipItemFromPlayer(arc, 0);
  assert.deepEqual(getPlayerSkills(arc).map(s => s.id), ['basic', 'a_shot', 'a_rain']);

  // Bard b_violin replaces b_heal/b_buff with b_nocturne/b_frenzy
  const { room: rBar } = fixture(t, ['bard']);
  const bar = rBar.players.p0;
  assert.deepEqual(getPlayerSkills(bar).map(s => s.id), ['basic', 'b_heal', 'b_buff']);
  equip(bar, 'b_violin');
  assert.deepEqual(getPlayerSkills(bar).map(s => s.id), ['basic', 'b_nocturne', 'b_frenzy']);
  unequipItemFromPlayer(bar, 0);
  assert.deepEqual(getPlayerSkills(bar).map(s => s.id), ['basic', 'b_heal', 'b_buff']);
});
