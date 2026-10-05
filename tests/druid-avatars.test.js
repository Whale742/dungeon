import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Room } from '../game/Room.js';
import { CLASSES, ROLE_DETAILS } from '../game/constants.js';

test('Druid transformed states and minion summons configuration and distinct images', () => {
  // 1. Check CLASSES constants
  assert.equal(CLASSES.druid.avatar, '/photo/Druid.webp');
  assert.equal(CLASSES.druid.forms.werewolf.avatar, '/photo/狼人.webp');
  assert.equal(CLASSES.druid.forms.treant.avatar, '/photo/遠古樹精.webp');
  assert.equal(CLASSES.druid.forms.tree.avatar, '/photo/遠古樹精.webp');

  assert.equal(CLASSES.druid.summons.treant.length, 3);
  assert.equal(CLASSES.druid.summons.treant[0].avatar, '/photo/小樹精1.webp');
  assert.equal(CLASSES.druid.summons.treant[1].avatar, '/photo/小樹精2.webp');
  assert.equal(CLASSES.druid.summons.treant[2].avatar, '/photo/小樹精3.webp');

  assert.equal(CLASSES.druid.summons.wolf.length, 3);
  assert.equal(CLASSES.druid.summons.wolf[0].avatar, '/photo/幼狼1.webp');
  assert.equal(CLASSES.druid.summons.wolf[1].avatar, '/photo/幼狼2.webp');
  assert.equal(CLASSES.druid.summons.wolf[2].avatar, '/photo/幼狼3.webp');

  // 2. Check ROLE_DETAILS constants
  assert.equal(ROLE_DETAILS.druid.forms.werewolf.avatar, '/photo/狼人.webp');
  assert.equal(ROLE_DETAILS.druid.forms.treant.avatar, '/photo/遠古樹精.webp');
  assert.equal(ROLE_DETAILS.druid.forms.tree.avatar, '/photo/遠古樹精.webp');

  assert.equal(ROLE_DETAILS.druid.summons.treant.length, 3);
  assert.equal(ROLE_DETAILS.druid.summons.treant[0].avatar, '/photo/小樹精1.webp');
  assert.equal(ROLE_DETAILS.druid.summons.treant[1].avatar, '/photo/小樹精2.webp');
  assert.equal(ROLE_DETAILS.druid.summons.treant[2].avatar, '/photo/小樹精3.webp');

  assert.equal(ROLE_DETAILS.druid.summons.wolf.length, 3);
  assert.equal(ROLE_DETAILS.druid.summons.wolf[0].avatar, '/photo/幼狼1.webp');
  assert.equal(ROLE_DETAILS.druid.summons.wolf[1].avatar, '/photo/幼狼2.webp');
  assert.equal(ROLE_DETAILS.druid.summons.wolf[2].avatar, '/photo/幼狼3.webp');

  // 3. Verify physical files on disk: ONLY 1, 2, 3 exist; old unnumbered files deleted
  const baseDir = process.cwd();
  for (const dir of ['photo', 'public/photo']) {
    for (let i = 1; i <= 3; i++) {
      assert.ok(fs.existsSync(path.join(baseDir, dir, `小樹精${i}.webp`)), `${dir}/小樹精${i}.webp must exist`);
      assert.ok(fs.existsSync(path.join(baseDir, dir, `幼狼${i}.webp`)), `${dir}/幼狼${i}.webp must exist`);
    }
    assert.ok(!fs.existsSync(path.join(baseDir, dir, '小樹精.webp')), `${dir}/小樹精.webp should not exist`);
    assert.ok(!fs.existsSync(path.join(baseDir, dir, '幼狼.webp')), `${dir}/幼狼.webp should not exist`);
  }
});

test('Druid summons 3 minions with distinct avatars and names', () => {
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const mockSocket = { id: 's_druid', emit: () => {}, join: () => {}, on: () => {} };
  const room = new Room('TESTD', mockSocket, 'DruidHero', mockIo);
  const p = room.players.s_druid;
  p.role = 'druid';
  room.state = 'IN_BATTLE';
  room.currentMonster = { name: '木樁', hp: 9999, maxHp: 9999, atk: 0, avatar: '/BOSS/Lava Colossus.webp' };

  // Turn 1: Summon Treant 1
  p.action = 'dru_summon_treant';
  room.resolveTurnActions();
  assert.equal(p.minions.length, 1);
  assert.equal(p.minions[0].avatar, '/photo/小樹精1.webp');
  assert.equal(p.minions[0].name, '小樹精1');

  // Turn 2: Summon Treant 2
  p.action = 'dru_summon_treant';
  room.resolveTurnActions();
  assert.equal(p.minions.length, 2);
  assert.equal(p.minions[1].avatar, '/photo/小樹精2.webp');
  assert.equal(p.minions[1].name, '小樹精2');

  // Turn 3: Summon Treant 3
  p.action = 'dru_summon_treant';
  room.resolveTurnActions();
  assert.equal(p.minions.length, 3);
  assert.equal(p.minions[2].avatar, '/photo/小樹精3.webp');
  assert.equal(p.minions[2].name, '小樹精3');

  // Verify all 3 avatars are distinct
  const treantAvatars = p.minions.map(m => m.avatar);
  assert.equal(new Set(treantAvatars).size, 3);

  // Check getClientState reflects distinct avatars
  const state = room.getClientState();
  const playerState = state.players.find(x => x.id === 's_druid');
  assert.equal(playerState.minions[0].avatar, '/photo/小樹精1.webp');
  assert.equal(playerState.minions[1].avatar, '/photo/小樹精2.webp');
  assert.equal(playerState.minions[2].avatar, '/photo/小樹精3.webp');

  // Clear minions and test wolves
  p.minions = [];
  p.minion = null;

  p.action = 'dru_summon_wolf';
  room.resolveTurnActions();
  assert.equal(p.minions[0].avatar, '/photo/幼狼1.webp');
  assert.equal(p.minions[0].name, '幼狼1');

  p.action = 'dru_summon_wolf';
  room.resolveTurnActions();
  assert.equal(p.minions[1].avatar, '/photo/幼狼2.webp');
  assert.equal(p.minions[1].name, '幼狼2');

  p.action = 'dru_summon_wolf';
  room.resolveTurnActions();
  assert.equal(p.minions[2].avatar, '/photo/幼狼3.webp');
  assert.equal(p.minions[2].name, '幼狼3');

  const wolfAvatars = p.minions.map(m => m.avatar);
  assert.equal(new Set(wolfAvatars).size, 3);
});

test('Druid transformation ends and returns avatar to normal druid state', () => {
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const mockSocket = { id: 's_druid', emit: () => {}, join: () => {}, on: () => {} };
  const room = new Room('TESTD2', mockSocket, 'DruidHero', mockIo);
  const p = room.players.s_druid;
  p.role = 'druid';
  room.state = 'IN_BATTLE';
  room.currentMonster = { name: '木樁', hp: 9999, maxHp: 9999, atk: 0, avatar: '/BOSS/Lava Colossus.webp' };

  // Set form to werewolf with 2 turns remaining
  p.druidForm = 'werewolf';
  p.druidFormTurns = 2;
  p.werewolfMaxHpDeducted = 17;
  p.maxHp = 68;
  p.hp = 68;

  let clientState = room.getClientState();
  let playerState = clientState.players.find(x => x.id === 's_druid');
  assert.equal(playerState.druidForm, 'werewolf');

  // Turn 1 ends (druidFormTurns goes from 2 to 1)
  p.action = 'basic';
  room.resolveTurnActions();
  assert.equal(p.druidFormTurns, 1);
  assert.equal(p.druidForm, 'werewolf');

  // Turn 2 ends (druidFormTurns goes from 1 to 0 -> form ends!)
  p.action = 'basic';
  room.resolveTurnActions();
  assert.equal(p.druidFormTurns, 0);
  assert.equal(p.druidForm, null);
  assert.equal(p.maxHp, 85); // Restored original maxHp

  clientState = room.getClientState();
  playerState = clientState.players.find(x => x.id === 's_druid');
  assert.equal(playerState.druidForm, null);
});

test('Druid summon creates distinct SUMMON step followed by immediate MINION_ATTACK step targeting monster', () => {
  let presentationQueue = null;
  const mockIo = {
    to: () => ({
      emit: (event, data) => {
        if (event === 'battle:presentation_queue') {
          presentationQueue = data.queue;
        }
      }
    }),
    emit: () => {}
  };
  const mockSocket = { id: 's_druid', emit: () => {}, join: () => {}, on: () => {} };
  const room = new Room('TEST_SUMMON', mockSocket, 'DruidHero', mockIo);
  const p = room.players.s_druid;
  p.role = 'druid';
  room.state = 'IN_BATTLE';
  room.currentMonster = { name: '木樁', hp: 9999, maxHp: 9999, atk: 0, avatar: '/BOSS/Lava Colossus.webp' };

  p.action = 'dru_summon_treant';
  room.resolveTurnActions();

  assert.ok(presentationQueue, 'Presentation queue should be emitted');
  const summonStepIndex = presentationQueue.findIndex(s => s.category === 'SUMMON' && s.sourceId === 's_druid');
  assert.ok(summonStepIndex >= 0, 'Should contain a SUMMON category step');
  assert.equal(presentationQueue[summonStepIndex].category, 'SUMMON');
  assert.ok(presentationQueue[summonStepIndex].results.some(r => r.kind === 'summon'));

  const immediateAttackIndex = presentationQueue.findIndex(s => s.category === 'MINION_ATTACK' && s.sourceId === 's_druid');
  assert.ok(immediateAttackIndex > summonStepIndex, 'Immediate attack step must follow the summon step');
  const attackStep = presentationQueue[immediateAttackIndex];
  assert.equal(attackStep.type, 'minion_action');
  assert.equal(attackStep.category, 'MINION_ATTACK');
  assert.equal(attackStep.targetId, 'monster');
  assert.equal(attackStep.results[0].targetId, 'monster');
});
