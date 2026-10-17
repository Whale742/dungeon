import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { LEADER_SKILLS } from '../game/constants.js';

function createTestRoom(roles = ['warrior', 'mage', 'archer']) {
  const emitted = [];
  const io = {
    to: () => ({
      emit: (event, payload) => emitted.push({ event, payload })
    }),
    emit: (event, payload) => emitted.push({ event, payload })
  };
  const hostSocket = { id: 'p0', join: () => {}, leave: () => {} };
  const room = new Room('TEST', hostSocket, 'Player0', io);
  room.selectRole('p0', roles[0]);
  for (let i = 1; i < roles.length; i++) {
    const id = `p${i}`;
    room.addPlayer({ id, join: () => {}, leave: () => {} }, `Player${i}`);
    room.selectRole(id, roles[i]);
  }
  return { room, emitted };
}

test('Phase 4: Leader lock on adventure start and transfer inheritance on next battle', () => {
  const { room } = createTestRoom(['warrior', 'mage']);

  // Before adventure start, lockedLeaderRole is null
  assert.equal(room.lockedLeaderRole, null);
  assert.equal(room.getEffectiveLeaderRole(), null);

  // Start adventure
  const startRes = room.startAdventure('p0');
  assert.equal(startRes.success, true);
  assert.equal(room.lockedLeaderId, 'p0');
  assert.equal(room.lockedLeaderRole, 'warrior');
  assert.equal(room.getEffectiveLeaderRole(), 'warrior');

  // Transfer leader during adventure
  const transferRes = room.transferLeader('p0', 'p1');
  assert.equal(transferRes.success, true);
  assert.equal(room.leaderId, 'p1');
  // Pending transfer: leader skill is still warrior!
  assert.equal(room.pendingLeaderTransfer, true);
  assert.equal(room.getEffectiveLeaderRole(), 'warrior');

  // Next battle starts
  room.handleLeaderTransferOnBattleStart();
  // Now leader skill is inherited by new leader (mage)
  assert.equal(room.pendingLeaderTransfer, false);
  assert.equal(room.lockedLeaderId, 'p1');
  assert.equal(room.lockedLeaderRole, 'mage');
  assert.equal(room.getEffectiveLeaderRole(), 'mage');
});

test('Phase 4: Active Leader Skills (Mage Focus & Alchemist Potion)', () => {
  const { room } = createTestRoom(['mage', 'warrior']);
  room.state = 'IN_BATTLE';
  room.lockedLeaderId = 'p0';
  room.lockedLeaderRole = 'mage';

  // Mage Active: Pierce magic resistance
  const mageSkillRes = room.useLeaderSkill('p0', { targetPlayerId: 'p0' });
  assert.equal(mageSkillRes.success, true);
  assert.equal(room.players.p0.magePierceNextMagic, true);
  assert.equal(room.leaderSkillUsedThisBattle, true);

  // Only one leader skill per battle
  const secondUse = room.useLeaderSkill('p0');
  assert.equal(secondUse.success, false);
  assert.match(secondUse.message, /只能使用一次/);

  // Non-leader cannot use leader skill
  const nonLeaderUse = room.useLeaderSkill('p1');
  assert.equal(nonLeaderUse.success, false);
  assert.match(nonLeaderUse.message, /只有當前具備資格的隊長/);

  // Test Alchemist Active
  const { room: alcRoom } = createTestRoom(['alchemist', 'warrior']);
  alcRoom.state = 'IN_BATTLE';
  alcRoom.lockedLeaderId = 'p0';
  alcRoom.lockedLeaderRole = 'alchemist';
  const alcSkillRes = alcRoom.useLeaderSkill('p0', { potionType: 'defense' });
  assert.equal(alcSkillRes.success, true);
  assert.equal(alcRoom.players.p0.tempHp, 20);
  assert.equal(alcRoom.players.p0.alcPotionDefTurns, 2);
});

test('Phase 4: Passive Leader Skills (Paladin fatal guard & Warrior 50% DR)', () => {
  // Paladin fatal guard
  const { room: paladinRoom } = createTestRoom(['paladin', 'mage']);
  paladinRoom.state = 'IN_BATTLE';
  paladinRoom.lockedLeaderId = 'p0';
  paladinRoom.lockedLeaderRole = 'paladin';
  paladinRoom.players.p1.paladinFatalGuard = true;
  paladinRoom.players.p1.hp = 30;

  // Fatal attack of 100 damage preserves 1 HP
  const dmgRes = paladinRoom.applyDamageToPlayer(paladinRoom.players.p1, 100);
  assert.equal(paladinRoom.players.p1.hp, 1);
  assert.equal(paladinRoom.players.p1.paladinFatalGuard, false);

  // Warrior leader 50% DR
  const { room: warriorRoom } = createTestRoom(['warrior', 'mage']);
  warriorRoom.state = 'IN_BATTLE';
  warriorRoom.lockedLeaderId = 'p0';
  warriorRoom.lockedLeaderRole = 'warrior';
  warriorRoom.warriorLeaderGuarded = false;
  warriorRoom.players.p1.hp = 100;
  warriorRoom.players.p1.maxHp = 100;

  // Incoming 80 damage drops player below 30% -> reduces damage by 50% (80 * 0.5 = 40)
  warriorRoom.applyDamageToPlayer(warriorRoom.players.p1, 80);
  assert.equal(warriorRoom.players.p1.hp, 60);
  assert.equal(warriorRoom.warriorLeaderGuarded, true);
});

test('Phase 4: Leader skill definitions for all 15 classes', () => {
  const roles = [
    'warrior', 'mage', 'archer', 'assassin', 'bard',
    'alchemist', 'druid', 'paladin', 'gladiator', 'stargazer',
    'dreamweaver', 'samurai', 'sage', 'augur', 'onmyoji'
  ];

  assert.equal(roles.length, 15);
  for (const role of roles) {
    const skill = LEADER_SKILLS[role];
    assert.ok(skill, `Leader skill for ${role} should exist`);
    assert.equal(skill.role, role);
    assert.ok(['ACTIVE', 'PASSIVE'].includes(skill.type));
    assert.ok(skill.name, `Skill for ${role} should have a name`);
    assert.ok(skill.combatDesc, `Skill for ${role} should describe combat effect`);
    assert.ok(skill.eventDesc, `Skill for ${role} should describe event hook`);
  }
});
