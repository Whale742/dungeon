import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import {
  canPlayerEquipItem,
  getPlayerSkills,
  rollCrossbowAmmo,
  getCrossbowAmmoLabel,
  getCrossbowAmmoIcon,
  LOOT_TABLE
} from '../game/constants.js';

function createMockIo() {
  return {
    to: () => ({
      emit: () => {}
    }),
    emit: () => {}
  };
}

function createMockSocket(id) {
  return {
    id,
    join: () => {},
    leave: () => {},
    emit: () => {}
  };
}

test('Crossbow equipment item definition and uniqueness constraint', () => {
  const item = LOOT_TABLE.find(l => l.id === 'a_crossbow');
  assert.ok(item, 'a_crossbow should exist in LOOT_TABLE');
  assert.equal(item.name, '改良型重弩');
  assert.equal(item.role, 'archer');
  assert.equal(item.isSpecial, true);

  const player = {
    id: 'p1',
    role: 'archer',
    equips: []
  };

  assert.equal(canPlayerEquipItem(player, item), true, 'Archer should be able to equip a_crossbow');

  player.equips.push(item);
  assert.equal(canPlayerEquipItem(player, item), false, 'Archer should NOT be able to equip a duplicate a_crossbow');
});

test('Crossbow skill replacement: replaces a_shot and a_rain with a_reload (CD 0) and a_frenzy_reload (CD 3)', () => {
  const archerWithoutCrossbow = {
    role: 'archer',
    equips: []
  };
  const normalSkills = getPlayerSkills(archerWithoutCrossbow);
  assert.equal(normalSkills.some(s => s.id === 'a_shot'), true);
  assert.equal(normalSkills.some(s => s.id === 'a_rain'), true);
  assert.equal(normalSkills.some(s => s.id === 'a_reload'), false);
  assert.equal(normalSkills.some(s => s.id === 'a_frenzy_reload'), false);

  const archerWithCrossbow = {
    role: 'archer',
    equips: [{ id: 'a_crossbow', name: '改良型重弩' }]
  };
  const crossbowSkills = getPlayerSkills(archerWithCrossbow);
  assert.equal(crossbowSkills.some(s => s.id === 'a_shot'), false, 'a_shot should be replaced');
  assert.equal(crossbowSkills.some(s => s.id === 'a_rain'), false, 'a_rain should be replaced');

  const reloadSkill = crossbowSkills.find(s => s.id === 'a_reload');
  const frenzySkill = crossbowSkills.find(s => s.id === 'a_frenzy_reload');
  const basicSkill = crossbowSkills.find(s => s.id === 'basic');

  assert.ok(reloadSkill, 'a_reload skill exists');
  assert.equal(reloadSkill.cd, 0, 'a_reload CD should be 0');
  assert.equal(reloadSkill.label, '1 技能: 戰術上膛');

  assert.ok(frenzySkill, 'a_frenzy_reload skill exists');
  assert.equal(frenzySkill.cd, 3, 'a_frenzy_reload CD should be 3');
  assert.equal(frenzySkill.label, '2 技能: 極速狂熱裝填');

  assert.ok(basicSkill.desc.includes('重弩齊射') || basicSkill.desc.includes('齊射'), 'Basic skill desc updated for volley');
});

test('Crossbow ammo probability distribution (40% pierce, 40% elemental, 20% burst)', () => {
  const counts = { pierce: 0, elemental: 0, burst: 0 };
  const rolls = 20000;
  for (let i = 0; i < rolls; i++) {
    const ammo = rollCrossbowAmmo();
    counts[ammo]++;
  }

  const pierceRate = counts.pierce / rolls;
  const elementalRate = counts.elemental / rolls;
  const burstRate = counts.burst / rolls;

  assert.ok(Math.abs(pierceRate - 0.40) < 0.03, `Pierce rate ${pierceRate} close to 0.40`);
  assert.ok(Math.abs(elementalRate - 0.40) < 0.03, `Elemental rate ${elementalRate} close to 0.40`);
  assert.ok(Math.abs(burstRate - 0.20) < 0.03, `Burst rate ${burstRate} close to 0.20`);
});

test('Crossbow ammo labels and icons', () => {
  assert.equal(getCrossbowAmmoLabel('pierce'), '🔴 穿甲箭');
  assert.equal(getCrossbowAmmoLabel('elemental'), '🔵 元素箭');
  assert.equal(getCrossbowAmmoLabel('burst'), '💥 爆裂箭');

  assert.equal(getCrossbowAmmoIcon('pierce'), '🔴');
  assert.equal(getCrossbowAmmoIcon('elemental'), '🔵');
  assert.equal(getCrossbowAmmoIcon('burst'), '💥');
});

test('Room: reloading blocks when magazine has 3 arrows', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('leader_1');
  const room = new Room('TEST', leaderSocket, 'Leader', io);

  const player = room.players['leader_1'];
  player.role = 'archer';
  player.equips = [{ id: 'a_crossbow', name: '改良型重弩' }];
  player.ammo = ['pierce', 'elemental', 'burst'];
  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';

  const res1 = room.lockAction('leader_1', 'a_reload');
  assert.equal(res1.success, false);
  assert.ok(res1.message.includes('彈匣已滿'));

  const res2 = room.lockAction('leader_1', 'a_frenzy_reload');
  assert.equal(res2.success, false);
  assert.ok(res2.message.includes('彈匣已滿'));
});

test('Room: tactical reload a_reload and frenzy reload a_frenzy_reload fill ammo and trigger crouch state', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('leader_1');
  const room = new Room('TEST', leaderSocket, 'ArcherLeader', io);

  const player = room.players['leader_1'];
  player.role = 'archer';
  player.equips = [{ id: 'a_crossbow', name: '改良型重弩' }];
  player.ammo = [];
  player.hp = 100;
  player.maxHp = 100;

  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';
  room.currentMonster = {
    name: '木樁怪',
    hp: 1000,
    maxHp: 1000,
    attack: 30,
    resistance: 'none'
  };

  // 1. 執行 a_reload
  const lockRes = room.lockAction('leader_1', 'a_reload');
  assert.equal(lockRes.success, true);

  room.resolveTurnActions();

  assert.equal(player.ammo.length, 1, 'Should have loaded 1 arrow');
  assert.equal(player.isCrouchedThisRound, true, 'Should have activated isCrouchedThisRound');
  assert.ok(room.logs.some(l => l.text.includes('蹲伏裝填弩箭，受傷降低 20% 但無法閃避')), 'Log should contain crouch note');

  // Next round start should reset isCrouchedThisRound
  room.executeRoundStart();
  assert.equal(player.isCrouchedThisRound, false, 'executeRoundStart should reset crouch state');

  // 2. 執行 a_frenzy_reload (缺 2 發補滿至 3 發)
  room.selectionState = 'SELECTING';
  const lockFrenzy = room.lockAction('leader_1', 'a_frenzy_reload');
  assert.equal(lockFrenzy.success, true);

  room.resolveTurnActions();
  assert.equal(player.ammo.length, 3, 'Should have filled magazine up to 3');
  assert.equal(player.isCrouchedThisRound, true, 'Should have crouch state');
  assert.equal(player.cooldowns['a_frenzy_reload'], 3, 'Cooldown should be set to 3');
});

test('Room: crouch state reduces monster damage by 20% and disables dodge', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('leader_1');
  const room = new Room('TEST', leaderSocket, 'ArcherLeader', io);

  const player = room.players['leader_1'];
  player.role = 'archer';
  player.equips = [{ id: 'a_crossbow', name: '改良型重弩' }];
  player.hp = 100;
  player.maxHp = 100;
  player.ammo = [];
  player.archerNextDodgeBonus = 1.0; // 100% dodge bonus guaranteed if not crouched

  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';
  room.currentMonster = {
    name: '遠古石像',
    hp: 1000,
    maxHp: 1000,
    attack: 40,
    resistance: 'none'
  };

  room.lockAction('leader_1', 'a_reload');
  room.resolveTurnActions();

  // Attack was 40. AOE raw is Math.floor(40 * 0.5) = 20, remaining scatter is 20 (hits leader).
  // Total raw assigned = 40.
  // With 20% DR: Math.floor(40 * 0.80) = 32 damage!
  // If dodge worked, damage would be 0.
  assert.equal(player.isCrouchedThisRound, true);
  assert.equal(player.hp, 100 - 32, `Player HP should be 68 (took 32 damage instead of 40), was ${player.hp}`);
});

test('Room: basic attack volley calculation: 3 arrows (1 pierce, 1 elemental, 1 burst) -> 89 / 3 = 30 dmg split with equal self damage', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('leader_1');
  const room = new Room('TEST', leaderSocket, 'ArcherLeader', io);

  const player = room.players['leader_1'];
  player.role = 'archer';
  player.equips = [{ id: 'a_crossbow', name: '改良型重弩' }];
  player.hp = 100;
  player.maxHp = 100;
  player.ammo = ['pierce', 'elemental', 'burst'];

  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';
  room.currentMonster = {
    name: '首領測試怪',
    hp: 90,
    maxHp: 90,
    attack: 0,
    resistance: 'none'
  };

  room.lockAction('leader_1', 'basic');
  room.resolveTurnActions();

  // Total pool for 3 arrows = 10 + 79 = 89.
  // dmgPerArrow = Math.round(89 / 3) = 30.
  // pierce: 30 phys dmg
  // elemental: 30 mag dmg
  // burst: 30 true dmg to monster + 30 equal true dmg to archer
  // Total damage to monster = 90. Monster killed (hp = 0).
  // Archer HP = 100 - 30 = 70.
  assert.equal(room.currentMonster.hp, 0, `Monster HP should be 0, was ${room.currentMonster.hp}`);
  assert.equal(player.hp, 70, `Archer HP should be 70, was ${player.hp}`);
  assert.equal(player.ammo.length, 0, 'Ammo should be completely consumed');

  // Verify battle log details
  const volleyLog = room.logs.find(l => l.text.includes('【重弩齊射】'));
  assert.ok(volleyLog, 'Volley log should be recorded');
  assert.ok(volleyLog.text.includes('穿甲箭 ×1：造成 **30** 點【物理】傷害'));
  assert.ok(volleyLog.text.includes('元素箭 ×1：造成 **30** 點【魔法】傷害'));
  assert.ok(volleyLog.text.includes('爆裂箭 ×1：造成 **30** 點【真實】傷害，自身扣除等量 **30** 點真實生命！'));
});

test('Room: burst self damage can be lethal and correctly triggers death', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('leader_1');
  const room = new Room('TEST', leaderSocket, 'ArcherLeader', io);

  const player = room.players['leader_1'];
  player.role = 'archer';
  player.equips = [{ id: 'a_crossbow', name: '改良型重弩' }];
  player.hp = 25; // Less than 30 self-damage
  player.maxHp = 100;
  player.ammo = ['burst'];

  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';
  room.currentMonster = {
    name: '首領測試怪',
    hp: 1000,
    maxHp: 1000,
    attack: 0,
    resistance: 'none'
  };

  room.lockAction('leader_1', 'basic');
  room.resolveTurnActions();

  // 1 burst arrow = base pool 45 / 1 = 45.
  // Archer has 25 HP, takes 45 true dmg -> HP becomes 0, isDead!
  assert.equal(player.hp, 0, 'Archer HP should be 0');
  assert.ok(room.logs.some(l => l.text.includes('爆裂弩箭反噬重創！') && l.text.includes('不幸陣亡！')));
});

test('Room: Archer with crossbow pressing skip empties loaded ammo', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('leader_1');
  const room = new Room('TEST', leaderSocket, 'ArcherLeader', io);

  const player = room.players['leader_1'];
  player.role = 'archer';
  player.equips = [{ id: 'a_crossbow', name: '改良型重弩' }];
  player.ammo = ['pierce', 'elemental'];
  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';
  room.currentMonster = {
    name: '首領測試怪',
    hp: 1000,
    maxHp: 1000,
    attack: 0,
    resistance: 'none'
  };

  // Test clearPlayerAmmo directly
  room.clearPlayerAmmo('leader_1');
  assert.equal(player.ammo.length, 0, 'clearPlayerAmmo should clear ammo array');

  // Test lockAction with skip
  player.ammo = ['burst', 'pierce', 'elemental'];
  const res = room.lockAction('leader_1', 'skip');
  assert.equal(res.success, true);
  assert.equal(player.ammo.length, 0, 'lockAction(skip) should clear loaded ammo');

  // Test resolveTurnActions with skip
  player.ammo = ['burst'];
  player.action = 'skip';
  room.resolveTurnActions();
  assert.equal(player.ammo.length, 0, 'resolveTurnActions should ensure ammo is cleared on skip');
  assert.ok(room.logs.some(l => l.text.includes('卸除並清空了重弩彈匣')), 'Battle log should record clearing magazine');
});

test('Room: Alchemist acid flask reduces reload count by 1 per layer (min 1 guarantee) and does not affect crossbow damage', () => {
  const io = createMockIo();
  const leaderSocket = createMockSocket('archer_1');
  const room = new Room('TEST', leaderSocket, 'Archer', io);

  const alcSocket = createMockSocket('alchemist_1');
  room.addPlayer(alcSocket, 'Alchemist');

  const archer = room.players['archer_1'];
  archer.role = 'archer';
  archer.equips = [{ id: 'a_crossbow', name: '改良型重弩' }, { id: 'w_ring', name: '守護指環', bonusAtk: 10 }];
  archer.ammo = [];
  archer.hp = 100;
  archer.maxHp = 100;

  const alchemist = room.players['alchemist_1'];
  alchemist.role = 'alchemist';
  alchemist.equips = [];
  alchemist.hp = 100;
  alchemist.maxHp = 100;

  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';
  room.currentMonster = {
    name: '遠古魔像',
    hp: 2000,
    maxHp: 2000,
    attack: 0,
    resistance: 'none'
  };

  // Case 1: 1 layer of acid corrosion on a_frenzy_reload (missing 3 arrows -> loads 3 - 1 = 2 arrows)
  alchemist.action = 'alc_acid';
  alchemist.isLocked = true;
  room.lockAction('archer_1', 'a_frenzy_reload');
  room.resolveTurnActions();

  assert.equal(archer.ammo.length, 2, 'Frenzy reload should load 2 arrows (3 - 1 acid layer)');
  assert.ok(room.logs.some(l => l.text.includes('受到強酸腐蝕 1 層影響減少 1 枚裝填，實裝 2 枚')));

  // Case 2: 1 layer of acid corrosion with missing 1 arrow (missing 1 - 1 = 0 -> minimum guarantee 1 arrow)
  // Currently archer has 2 ammo, missing is 3 - 2 = 1 arrow
  room.executeRoundStart();
  room.selectionState = 'SELECTING';
  archer.cooldowns['a_frenzy_reload'] = 0; // Reset for testing
  alchemist.action = 'alc_acid';
  alchemist.isLocked = true;
  room.lockAction('archer_1', 'a_frenzy_reload');
  room.resolveTurnActions();

  assert.equal(archer.ammo.length, 3, 'Frenzy reload should load 1 arrow (min guarantee 1, reaching 3)');
  assert.ok(room.logs.some(l => l.text.includes('觸發最低保底裝填 1 枚')));

  // Case 3: 1 layer of acid on a_reload (normally 1 arrow -> 1 - 1 = 0, but min guarantee 1 arrow)
  archer.ammo = []; // Empty magazine
  room.executeRoundStart();
  room.selectionState = 'SELECTING';
  alchemist.action = 'alc_acid';
  alchemist.isLocked = true;
  room.lockAction('archer_1', 'a_reload');
  room.resolveTurnActions();

  assert.equal(archer.ammo.length, 1, 'a_reload should load 1 arrow due to minimum 1 guarantee');
  assert.ok(room.logs.some(l => l.text.includes('觸發最低保底裝填 1 枚')));

  // Case 4: Verify crossbow damage is NOT affected by acid equip halving
  // Prepare archer with 3 pierce arrows and 10 bonusAtk
  archer.ammo = ['pierce', 'pierce', 'pierce'];
  room.executeRoundStart();
  room.selectionState = 'SELECTING';
  const monsterHpBefore = room.currentMonster.hp;

  // Alchemist throws acid this turn (equipmentEffectMultiplier becomes 0.5)
  alchemist.action = 'alc_acid';
  alchemist.isLocked = true;
  room.lockAction('archer_1', 'basic');
  room.resolveTurnActions();

  // Crossbow pool with 3 arrows is 89 + bonusAtk(10) = 99 (unaffected by acid halving).
  // dmgPerArrow = Math.round(99 / 3) = 33.
  // 3 pierce arrows = 33 * 3 = 99 damage to monster.
  // Plus alchemist's 40 acid damage = 139 damage total.
  // If crossbow bonusAtk were halved, bonusAtk would be 5, pool 94, dmg 93 (31*3).
  // Because "造成傷害不影響", full bonusAtk is preserved!
  const monsterDamageTaken = monsterHpBefore - room.currentMonster.hp;
  assert.ok(monsterDamageTaken >= 139, `Crossbow volley damage should not be reduced by acid: taken ${monsterDamageTaken}`);
});

