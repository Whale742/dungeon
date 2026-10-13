import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Room } from '../game/Room.js';
import {
  CLASSES,
  getPlayerSkills,
  getActionPriority
} from '../game/constants.js';
import { fixture, random } from './phase8.test.js';

test('Onmyoji role configuration, assets, skills match specifications', () => {
  const onm = CLASSES.onmyoji;
  assert.ok(onm, 'onmyoji class must exist');
  assert.equal(onm.name, '陰陽師');
  assert.equal(onm.maxHp, 70);
  assert.equal(onm.avatar, '/photo/Onmyōji.webp');
  assert.ok(fs.existsSync('public' + onm.avatar), 'Onmyoji avatar file must exist on disk');

  // Check skills
  const skills = onm.skills;
  assert.equal(skills.length, 3);
  assert.equal(skills[0].id, 'basic');
  assert.equal(skills[0].label, '引符術');
  assert.equal(skills[0].cd, 0);
  assert.equal(skills[0].dmgType, 'mag');

  assert.equal(skills[1].id, 'onm_talisman');
  assert.equal(skills[1].label, '五鬼攝魂符');
  assert.equal(skills[1].cd, 1);
  assert.equal(skills[1].dmgType, 'mag');

  assert.equal(skills[2].id, 'onm_detonate');
  assert.equal(skills[2].label, '急急如律令・百符引爆');
  assert.equal(skills[2].cd, 2);
  assert.equal(skills[2].dmgType, 'mag');

  // Check action priorities
  assert.equal(getActionPriority('onm_talisman'), 7);
  assert.equal(getActionPriority('onm_detonate'), 8);
});

test('Onmyoji basic attack (引符術) deals 10 magic damage with CD 0', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  onm.action = 'basic';
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;

  const q = resolve();
  assert.equal(room.currentMonster.hp, 990, 'Basic attack should deal 10 magic damage');
  assert.equal(onm.cooldowns.basic, 0, 'Basic attack CD should be 0');

  const onmStep = q.find(s => s.actionId === 'basic');
  assert.ok(onmStep, 'Action step for basic attack should be recorded');
  assert.equal(onmStep.finalDamage, 10);
});

test('Onmyoji Skill 1 (五鬼攝魂符) attach talismans without round limit (when not dropped)', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  onm.action = 'onm_talisman';
  onm.rolledTalisman = 'corrode';
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;

  resolve();
  assert.ok(room.currentMonster.talismans, 'Talismans array should exist on monster');
  assert.equal(room.currentMonster.talismans.length, 1);
  assert.equal(room.currentMonster.talismans[0], 'corrode');
  assert.equal(onm.cooldowns.onm_talisman, 1, 'Skill 1 CD should be 1');

  // Round 2 start: when talisman does not drop (roll >= 0.70)
  room.battleRound = 2;
  room.currentMonster.talismanDropRng = () => 0.85;
  room.executeRoundStart();
  assert.equal(room.currentMonster.talismans.length, 1, 'Talisman should persist without round limit');

  // Round 3 start: still persists if not dropped
  room.battleRound = 3;
  room.executeRoundStart();
  assert.equal(room.currentMonster.talismans.length, 1, 'Talisman should still persist in round 3');
});

test('五鬼攝魂符: 抽髓符 deducts 2% max HP immediately and on round start if not dropped', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  room.currentMonster.hp = 1000;
  room.currentMonster.maxHp = 1000;
  room.currentMonster.attack = 0;

  // 2% of 1000 = 20
  onm.action = 'onm_talisman';
  onm.rolledTalisman = 'drain';
  resolve();

  assert.equal(room.currentMonster.hp, 980, 'First drain talisman deducts 20 HP (2% of 1000)');

  // Attach a second drain talisman -> deducts 2% * 2 = 40 (再次扣除檢定)
  onm.action = 'onm_talisman';
  onm.rolledTalisman = 'drain';
  onm.cooldowns.onm_talisman = 0;
  resolve();

  assert.equal(room.currentMonster.hp, 940, 'Second drain talisman triggers double deduction (40 HP)');

  // Round start: talisman does not drop (0.85 >= 0.70) -> ticks 2% per drain talisman (2 talismans = 4% = 40 HP)
  room.battleRound = 2;
  room.currentMonster.talismanDropRng = () => 0.85;
  room.executeRoundStart();
  assert.equal(room.currentMonster.hp, 900, 'Round start drain ticks 40 HP (2% * 2)');
});

test('五鬼攝魂符: 敵方身上最多存在 10 張符咒上限限制', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;
  room.currentMonster.talismans = Array(10).fill('corrode');

  onm.action = 'onm_talisman';
  onm.rolledTalisman = 'drain';
  const q = resolve();

  assert.equal(room.currentMonster.talismans.length, 10, 'Monster cannot have more than 10 talismans');
  const step = q.find(s => s.actionId === 'onm_talisman');
  assert.ok(step, 'Step should be recorded');
  assert.equal(step.outcome?.type, 'talisman_capped', 'Outcome should reflect capped talismans');
});

test('五鬼攝魂符: 每回合開始時有 70% 機率符咒掉落 (每張機率獨立計算)', (t) => {
  const { room } = fixture(t, ['onmyoji']);
  room.currentMonster.hp = 1000;
  room.currentMonster.talismans = ['blind', 'seal', 'corrode', 'confuse'];

  // 4 talismans:
  // talisman 1: roll 0.10 (< 0.70) -> drops
  // talisman 2: roll 0.80 (>= 0.70) -> keeps
  // talisman 3: roll 0.65 (< 0.70) -> drops
  // talisman 4: roll 0.95 (>= 0.70) -> keeps
  const rolls = [0.10, 0.80, 0.65, 0.95];
  let rollIdx = 0;
  room.currentMonster.talismanDropRng = () => rolls[rollIdx++];

  room.executeRoundStart();

  assert.equal(room.currentMonster.talismans.length, 2, 'Exactly 2 talismans should remain');
  assert.deepEqual(room.currentMonster.talismans, ['seal', 'confuse'], 'Remaining talismans must be seal and confuse');
});

test('五鬼攝魂符: 沒掉落就再次觸發每一個效果 (抽髓、惑心、障目、封勁、蝕體)', (t) => {
  const { room } = fixture(t, ['onmyoji']);
  room.currentMonster.hp = 1000;
  room.currentMonster.maxHp = 1000;
  room.currentMonster.attack = 20;
  room.currentMonster.talismans = ['drain', 'confuse', 'blind', 'seal', 'corrode'];

  // All 5 talismans do NOT drop (roll 0.85 >= 0.70)
  room.currentMonster.talismanDropRng = () => 0.85;
  // Confuse backlash ratio = 50% of 20 = 10
  room.currentMonster.talismanConfuseRatio = 0.50;

  room.executeRoundStart();

  // Drain dealt 20 (2% of 1000), Confuse dealt 10 (50% of 20 attack)
  // Total damage = 20 + 10 = 30
  assert.equal(room.currentMonster.hp, 970, 'Monster HP: 1000 - 20 (drain) - 10 (confuse) = 970');
  assert.equal(room.currentMonster.sealedThisRound, true, 'Seal nullification should be set to true with 100% probability');
  assert.equal(room.currentMonster.talismans.length, 5, 'All 5 undropped talismans should remain');
});


test('五鬼攝魂符: 蝕體符 grants 10% vulnerable damage boost stacking per talisman', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;

  // 1 stack of corrode
  room.currentMonster.talismans = ['corrode'];
  onm.action = 'basic'; // base 10 * 1.10 = 11
  resolve();
  assert.equal(room.currentMonster.hp, 989, '10 base * 1.10 = 11 damage dealt');

  // 2 stacks of corrode
  room.currentMonster.talismans = ['corrode', 'corrode'];
  onm.action = 'basic'; // base 10 * 1.20 = 12
  resolve();
  assert.equal(room.currentMonster.hp, 977, '10 base * 1.20 = 12 damage dealt (989 - 12 = 977)');
});

test('五鬼攝魂符: 封勁符 has 100% chance to completely nullify monster damage for the turn', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 50;
  room.currentMonster.talismans = ['seal'];

  onm.action = 'basic';
  resolve();
  // Player should receive 0 damage (100% nullified)
  assert.equal(onm.hp, onm.maxHp, 'Player should take 0 damage when seal is present (100% nullification)');
});

test('五鬼攝魂符: 惑心符 causes monster to inflict 50%~100% of attack damage on itself', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 30;
  room.currentMonster.talismans = ['confuse'];
  room.currentMonster.talismanConfuseRatio = 0.80; // 80% of 30 = 24 backlash

  onm.action = 'basic'; // deals 10 magic damage
  resolve();
  // Monster takes 10 (basic) + 24 (80% of 30 attack) = 34 damage!
  assert.equal(room.currentMonster.hp, 966, 'Monster should take 10 basic + 24 confuse backlash = 34 total (1000 - 34 = 966)');
});

test('五鬼攝魂符: 障目符 causes attack to have 60%~100% of not hurting our side (Miss)', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 20;
  room.currentMonster.talismans = ['blind'];
  room.currentMonster.talismanBlindAvoidRate = 0.80;
  room.currentMonster.talismanBlindMiss = true;

  onm.action = 'basic'; // deals 10
  resolve();
  // Attack missed: player takes 0 damage
  assert.equal(onm.hp, onm.maxHp, 'Player takes 0 damage on blind miss');
  // Monster took only 10 basic damage (blind has no backlash now)
  assert.equal(room.currentMonster.hp, 990, 'Monster takes 10 basic damage and no backlash');
});

test('Skill 2 (急急如律令・百符引爆): 0 talismans deals 0 damage', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;
  room.currentMonster.talismans = [];

  onm.action = 'onm_detonate';
  resolve();

  assert.equal(room.currentMonster.hp, 1000, '0 talismans should deal 0 damage');
  assert.equal(onm.cooldowns.onm_detonate, 2, 'Skill 2 CD should be 2');
});

test('Skill 2 (急急如律令・百符引爆): calculates base 10 + 3 per talisman, capped at 10 talismans (40 damage), destroys all talismans', (t) => {
  const { room, resolve } = fixture(t, ['onmyoji']);
  const onm = room.players.p0;
  room.currentMonster.hp = 1000;
  room.currentMonster.attack = 0;

  // Case A: 1 talisman -> 10 + 3 * 1 = 13 damage
  room.currentMonster.talismans = ['seal'];
  onm.action = 'onm_detonate';
  resolve();
  assert.equal(room.currentMonster.hp, 987, '1 talisman deals 13 damage (1000 - 13 = 987)');
  assert.equal(room.currentMonster.talismans.length, 0, 'Talismans should be cleared after detonation');

  // Case B: 10 talismans -> 10 + 3 * 10 = 40 damage
  room.currentMonster.hp = 1000;
  room.currentMonster.talismans = Array(10).fill('seal');
  onm.action = 'onm_detonate';
  onm.cooldowns.onm_detonate = 0;
  resolve();
  assert.equal(room.currentMonster.hp, 960, '10 talismans deals 40 damage (1000 - 40 = 960)');
  assert.equal(room.currentMonster.talismans.length, 0, 'Talismans should be cleared after detonation');

  // Case C: 12 talismans -> capped at 10 talismans (40 damage), but all 12 are destroyed
  room.currentMonster.hp = 1000;
  room.currentMonster.talismans = Array(12).fill('seal');
  onm.action = 'onm_detonate';
  onm.cooldowns.onm_detonate = 0;
  resolve();
  assert.equal(room.currentMonster.hp, 960, '12 talismans capped at 40 damage');
  assert.equal(room.currentMonster.talismans.length, 0, 'All 12 talismans destroyed');
});
