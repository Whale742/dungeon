import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EXCLUSIVE_MINIONS,
  GENERAL_MINIONS,
  ABYSS_MINIONS,
  SPECIAL_ELITES,
  ABYSS_BOSSES,
  ABYSS_AUGUR_EASTER_EGG,
  ENCOUNTERS,
  getExclusiveMinionForBoss
} from '../game/constants.js';
import { Room } from '../game/Room.js';

function createTestRoom(roles = ['warrior', 'mage', 'archer', 'cleric']) {
  const emitted = [];
  const io = {
    to: () => ({
      emit: (event, payload) => emitted.push({ event, payload })
    })
  };
  const hostSocket = { id: 'p0', join: () => {}, leave: () => {} };
  const room = new Room('TEST1', hostSocket, 'Player0', io);
  room.selectRole('p0', roles[0]);
  for (let i = 1; i < roles.length; i++) {
    const pid = `p${i}`;
    room.addPlayer({ id: pid, join: () => {}, leave: () => {} }, `Player${i}`);
    room.selectRole(pid, roles[i]);
  }
  return { room, emitted };
}

test('Phase 1: Constants & 深淵.md contain all Minions, Elites, and Abyss Bosses (excluding Augur)', () => {
  assert.equal(EXCLUSIVE_MINIONS.length, 10);
  assert.equal(GENERAL_MINIONS.length, 3);
  assert.equal(ABYSS_MINIONS.length, 2);
  assert.equal(Object.keys(SPECIAL_ELITES).length, 2);
  const abyssList = Object.values(ABYSS_BOSSES);
  assert.equal(abyssList.length, 14);
  assert.equal(abyssList.some(b => b.role === 'augur'), false);
  assert.equal(ABYSS_AUGUR_EASTER_EGG.role, 'augur');

  for (const boss of ENCOUNTERS) {
    const minion = getExclusiveMinionForBoss(boss.name);
    assert.ok(minion, `Expected exclusive minion for ${boss.name}`);
    assert.equal(minion.bossName, boss.name);
  }

  const abyssDoc = fs.readFileSync(new URL('../public/assets/深淵.md', import.meta.url), 'utf8');
  assert.ok(abyssDoc.includes('物理:0 魔法:0 效果:0 (不會獲得抗性)'));
  assert.ok(abyssDoc.includes('智者（深淵智者 - 無解的方程）'));
  assert.ok(abyssDoc.includes('卜者（特殊排除）'));
});

test('Phase 1: Encounter formation rules across col 1~3, col 4~6, col 7~8, and col 9', () => {
  const { room } = createTestRoom(['warrior', 'mage', 'archer', 'cleric']);
  const generalIds = new Set(GENERAL_MINIONS.map(m => m.id));
  const exclusiveIds = new Set(EXCLUSIVE_MINIONS.map(m => m.id));
  const abyssMinionIds = new Set(ABYSS_MINIONS.map(m => m.id));

  // col 1~3: 2~3 general minions
  const col2 = room.buildEncounterFormation(2, { rng: () => 0.1 });
  assert.equal(col2.length, 2);
  assert.ok(col2.every(e => e.tier === 'MINION' && generalIds.has(e.id)));

  // col 4~6 (roll < 0.70): 2 general minions + 1 exclusive minion
  const col5Minions = room.buildEncounterFormation(5, { rng: () => 0.2 });
  assert.equal(col5Minions.length, 3);
  assert.equal(col5Minions.filter(e => generalIds.has(e.id)).length, 2);
  assert.equal(col5Minions.filter(e => exclusiveIds.has(e.id)).length, 1);

  // col 4~6 (roll >= 0.70, Abyss encounter with 4 players): 1 unpicked Abyss Boss
  const col5Abyss = room.buildEncounterFormation(5, { rng: () => 0.85, forceAbyss: true });
  assert.equal(col5Abyss.length, 1);
  assert.equal(col5Abyss[0].tier, 'ABYSS');
  assert.ok(!['warrior', 'mage', 'archer', 'cleric', 'augur'].includes(col5Abyss[0].role));

  // col 7~8 (roll >= 0.50): 1 Elite + 1 Exclusive Minion
  const col7Elite = room.buildEncounterFormation(7, { rng: () => 0.75 });
  assert.equal(col7Elite.length, 2);
  assert.equal(col7Elite[0].tier, 'ELITE');
  assert.equal(col7Elite[1].tier, 'MINION');
  assert.equal(col7Elite[1].bossName, col7Elite[0].originalName);

  // col 9 (normal final boss): 1 Elite + 2 Exclusive Minions
  const col9 = room.buildEncounterFormation(9, { rng: () => 0.1 });
  assert.equal(col9.length, 3);
  assert.equal(col9[0].tier, 'ELITE');
  assert.equal(col9[1].bossName, col9[0].originalName);
  assert.equal(col9[2].bossName, col9[0].originalName);

  // col 9 (Abyss final boss): 1 Abyss Boss + 2 Abyss Minions
  const col9Abyss = room.buildEncounterFormation(9, { forceAbyss: true, rng: () => 0.1 });
  assert.equal(col9Abyss.length, 3);
  assert.equal(col9Abyss[0].tier, 'ABYSS');
  assert.ok(abyssMinionIds.has(col9Abyss[1].id));
  assert.ok(abyssMinionIds.has(col9Abyss[2].id));
});

test('Phase 1: Multi-target combat targeting, AOE damage, and sequential enemy counter-attacks', () => {
  const { room, emitted } = createTestRoom(['warrior', 'archer']);
  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';
  room.battleRound = 1;
  room.floor = 2;

  const enemies = room.buildEncounterFormation(2, { rng: () => 0.1, minionCount: 2 });
  assert.equal(enemies.length, 2);
  enemies[0].hp = 4;
  enemies[0].maxHp = 4;
  enemies[0].resistances = { physical: 0, magic: 0, effect: 0 };
  enemies[1].hp = 80;
  enemies[1].maxHp = 80;
  enemies[1].resistances = { physical: 0, magic: 0, effect: 0 };
  room.setEnemies(enemies);

  // Warrior targets enemy 0 (basic attack deals 5 -> lethal), Archer targets enemy 1
  assert.equal(room.lockAction('p0', 'basic', null, enemies[0].instanceId).success, true);
  assert.equal(room.lockAction('p1', 'basic', null, enemies[1].instanceId).success, true);
  room.resolveTurnActions();

  // Enemy 0 should be dead, Enemy 1 should be alive and have taken damage from Archer
  assert.equal(enemies[0].hp, 0);
  assert.ok(enemies[1].hp < 80 && enemies[1].hp > 0);
  assert.equal(room.getLivingEnemies().length, 1);
  assert.equal(room.currentMonster.instanceId, enemies[1].instanceId);

  // Presentation queue should NOT have monsterKilled=true since enemy 1 is still alive
  const queueEvent = emitted.find(e => e.event === 'battle:presentation_queue');
  assert.ok(queueEvent);
  assert.equal(queueEvent.payload.monsterKilled, false);
  const bossActions = queueEvent.payload.queue.filter(s => s.type === 'boss_action');
  assert.equal(bossActions.length, 1);
  assert.equal(bossActions[0].enemyId, enemies[1].instanceId);
});

test('Phase 1: AOE skill (a_rain) damages all living enemies in room.enemies', () => {
  const { room } = createTestRoom(['archer']);
  room.state = 'IN_BATTLE';
  room.selectionState = 'SELECTING';
  room.battleRound = 1;
  room.floor = 1;

  const enemies = room.buildEncounterFormation(1, { rng: () => 0.9, minionCount: 3 });
  assert.equal(enemies.length, 3);
  for (const e of enemies) {
    e.hp = 40;
    e.maxHp = 40;
    e.resistances = { physical: 0, magic: 0, effect: 0 };
  }
  room.setEnemies(enemies);

  assert.equal(room.lockAction('p0', 'a_rain', null, enemies[0].instanceId).success, true);
  room.resolveTurnActions();
  for (const e of enemies) {
    assert.ok(e.hp < 40, `Enemy ${e.instanceId} should take AOE damage from a_rain`);
  }
});

test('Phase 1: Abyss Sage prime refactoring and Abyss Assassin zero resistance', () => {
  const { room } = createTestRoom(['warrior', 'mage', 'archer', 'cleric']);
  const assassinDef = ABYSS_BOSSES.assassin;
  const assassinInstance = room.createEnemyInstance(assassinDef, 0, { tier: 'ABYSS', rng: () => 0.99 });
  assert.deepEqual(assassinInstance.resistances, { physical: 0, magic: 0, effect: 0 });

  const sageDef = ABYSS_BOSSES.sage;
  const sageInstance = room.createEnemyInstance(sageDef, 0, { tier: 'ABYSS', rng: () => 0.5 });
  room.state = 'IN_BATTLE';
  room.battleRound = 2; // Prime round!
  sageInstance.hp = 50;
  sageInstance.maxHp = 100;
  sageInstance.poisonTurns = 2;
  sageInstance.poisonDmg = 5;
  room.setEnemies([sageInstance]);

  room.executeRoundStart();
  assert.equal(sageInstance.poisonTurns, 0, 'Prime round should cleanse poison');
  assert.equal(sageInstance.sageOperand, 1, 'Variable growth should increment sageOperand on round start');
  assert.ok(sageInstance.hp > 50, 'Prime round should heal 5% maxHp');
});
