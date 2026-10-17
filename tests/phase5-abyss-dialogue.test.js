import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { ABYSS_BOSSES, ABYSS_DIALOGUES } from '../game/constants.js';

function createTestRoom(roles = ['warrior', 'mage', 'archer', 'cleric']) {
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

test('Phase 5: Abyss Encounter Trigger rules (4+ players, unpicked pool, Augur excluded, Sage special name)', () => {
  // Less than 4 players: does not trigger
  const { room: smallRoom } = createTestRoom(['warrior', 'mage', 'archer']);
  const hexNode = { id: 'hex_5_3', col: 5, row: 3 };
  assert.equal(smallRoom.checkAbyssEncounterTrigger(hexNode), false);

  // 4 players: triggers
  const { room: team4Room } = createTestRoom(['warrior', 'mage', 'archer', 'paladin']);
  const pool = team4Room.getUnpickedAbyssBossPool();
  assert.ok(pool.length > 0);
  // Augur is strictly excluded from abyss boss pool
  assert.ok(!pool.some(b => b.role === 'augur'));
  // Active team members are excluded
  assert.ok(!pool.some(b => ['warrior', 'mage', 'archer', 'paladin'].includes(b.role)));
  // Sage in pool has special name
  const sageBoss = pool.find(b => b.role === 'sage');
  if (sageBoss) {
    assert.equal(sageBoss.name, '深淵智者 - 無解的方程');
  }

  // Non-BATTLE nodes (SHOP, CHEST, EVENT) never trigger abyss encounter
  const shopNode = { id: 'hex_5_3', col: 5, row: 3, type: 'SHOP' };
  assert.equal(team4Room.checkAbyssEncounterTrigger(shopNode), false);
  const chestNode = { id: 'hex_5_3', col: 5, row: 3, type: 'CHEST' };
  assert.equal(team4Room.checkAbyssEncounterTrigger(chestNode), false);
  const eventNode = { id: 'hex_5_3', col: 5, row: 3, type: 'EVENT' };
  assert.equal(team4Room.checkAbyssEncounterTrigger(eventNode), false);

  // Trigger dialogue on BATTLE node
  const battleNode = { id: 'hex_5_3', col: 5, row: 3, type: 'BATTLE' };
  const triggered = team4Room.checkAbyssEncounterTrigger(battleNode, { forceAbyss: true });
  assert.equal(triggered, true);
  assert.equal(team4Room.state, 'ABYSS_DIALOGUE');
  assert.ok(team4Room.abyssState);
  assert.equal(team4Room.abyssState.stage, 1);
});

test('Phase 5: 4-Stage Abyss Dialogue state machine and leaderDiff lines', () => {
  const { room, emitted } = createTestRoom(['warrior', 'mage', 'archer', 'paladin']);
  room.lockedLeaderId = 'p0';
  room.lockedLeaderRole = 'warrior';

  // Force trigger with specific boss
  const assassinBoss = ABYSS_BOSSES.assassin;
  assert.ok(assassinBoss);
  room.startAbyssDialogue(assassinBoss, { id: 'h5', col: 5, row: 3 });

  // Stage 1: Entrance
  assert.equal(room.state, 'ABYSS_DIALOGUE');
  assert.equal(room.abyssState.stage, 1);
  assert.ok(room.abyssState.dialogueText);

  // Advance to Stage 2: Philosophy & leaderDiff
  const adv1 = room.advanceAbyssDialogue('p0');
  assert.equal(adv1.success, true);
  assert.equal(room.abyssState.stage, 2);
  const expectedLeaderDiff = ABYSS_DIALOGUES.bossDialogues.assassin.leaderDiff.warrior;
  assert.equal(room.abyssState.dialogueText, expectedLeaderDiff);

  // Advance to Stage 3: Voting on 3 choices
  const adv2 = room.advanceAbyssDialogue('p0');
  assert.equal(adv2.success, true);
  assert.equal(room.abyssState.stage, 3);
  assert.equal(room.abyssState.choices.length, 3);

  // Voting
  room.voteAbyssChoice('p0', 'provoke');
  room.voteAbyssChoice('p1', 'provoke');
  room.voteAbyssChoice('p2', 'provoke');
  room.voteAbyssChoice('p3', 'apology');

  // Stage automatically resolves to Stage 4 on all votes
  assert.equal(room.abyssState.stage, 4);
  assert.equal(room.abyssState.chosenChoice, 'provoke');
  // Red eye flash emitted
  assert.equal(room.abyssFlashRedEye, true);
  assert.ok(emitted.some(e => e.event === 'abyss:red_eye_flash'));

  // Stage 4 complete: transitions to battle with modifiers
  const adv4 = room.advanceAbyssDialogue('p0');
  assert.equal(adv4.success, true);
  assert.equal(room.state, 'IN_BATTLE');
  assert.equal(room.currentMonster.name, assassinBoss.name);
});

test('Phase 5: Onmyoji leader hook stuns abyss minions on combat start', () => {
  const { room } = createTestRoom(['onmyoji', 'mage', 'archer', 'paladin']);
  room.lockedLeaderId = 'p0';
  room.lockedLeaderRole = 'onmyoji';

  const warriorBoss = ABYSS_BOSSES.warrior;
  room.startAbyssDialogue(warriorBoss, { id: 'h5', col: 5, row: 3 });
  room.advanceAbyssDialogue('p0'); // to 2
  room.advanceAbyssDialogue('p0'); // to 3
  room.voteAbyssChoice('p0', 'rational');
  room.voteAbyssChoice('p1', 'rational');
  room.voteAbyssChoice('p2', 'rational');
  room.voteAbyssChoice('p3', 'rational'); // to 4
  room.advanceAbyssDialogue('p0'); // to battle

  assert.equal(room.state, 'IN_BATTLE');
  assert.equal(room.currentMonster.name, warriorBoss.name);
  // In formation, minions should have stunnedNextTurn set by Onmyoji
  const minions = room.enemies.filter(e => e.tier === 'MINION');
  if (minions.length > 0) {
    assert.ok(minions.every(m => m.stunnedNextTurn === true));
  }
});
