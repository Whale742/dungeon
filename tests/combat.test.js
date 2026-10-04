import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { GAME_BALANCE } from '../game/constants.js';

function fixture(t, roles = ['warrior', 'mage']) {
  const events = [];
  const io = { to: () => ({ emit: (name, data) => events.push({ name, data }) }) };
  const socket = id => ({ id, join() {} });
  const room = new Room('COMBAT', socket('p0'), 'Player 0', io);
  for (let i = 1; i < roles.length; i++) room.addPlayer(socket('p' + i), 'Player ' + i);
  roles.forEach((role, i) => room.selectRole('p' + i, role));
  room.state = 'IN_BATTLE'; room.floor = 1; room.battleRound = 1;
  room.currentMonster = { name: 'Test Boss', avatar: '/BOSS/Ancient Guardian Golem.webp', hp: 5000, maxHp: 5000, atk: 30, attack: 30, resistance: null, ultName: 'Test Ultimate' };
  for (const p of Object.values(room.players)) p.action = 'skip';
  t.after(() => room.clearTimer());
  return { room, events, queue: () => events.findLast(e => e.name === 'battle:presentation_queue')?.data };
}
function resolve(room, value = .9) {
  const old = Math.random; Math.random = () => value;
  try { room.resolveTurnActions(); } finally { Math.random = old; }
}

for (const [role, action, random, outcome, category] of [
  ['archer', 'a_shot', .1, 'miss', 'OFFENSIVE'],
  ['mage', 'm_blast', .1, 'misfire', 'OFFENSIVE'],
  ['warrior', 'w_strike', .1, 'imbalance', 'OFFENSIVE'],
  ['warrior', 'w_shield', .1, 'shield_crack', 'DEFENSE'],
  ['assassin', 's_stab', .1, 'critical', 'OFFENSIVE'],
  ['bard', 'b_heal', .1, 'off_key', 'HEAL'],
  ['bard', 'b_buff', .1, 'overload', 'BUFF'],
  ['alchemist', 'alc_fate', .1, 'alchemy_success', 'CLEANSE'],
  ['alchemist', 'alc_fate', .9, 'alchemy_failure', 'CLEANSE'],
  ['druid', 'dru_transform', .1, 'transform_wolf', 'TRANSFORM'],
  ['druid', 'dru_transform', .9, 'transform_treant', 'TRANSFORM'],
]) test(`${action} exposes authoritative ${outcome} with per-target snapshots`, t => {
  const { room, queue } = fixture(t, [role, 'warrior']);
  room.players.p0.action = action;
  if (action === 'alc_fate') room.players.p0.poisonTurns = 2;
  resolve(room, random);
  const step = queue().queue.find(s => s.sourceId === 'p0' && s.type === 'player_action');
  assert.ok(step); assert.equal(step.category, category); assert.equal(step.outcome.type, outcome);
  assert.ok(step.results.length);
  for (const result of step.results) { assert.ok(result.targetAfter); assert.ok(result.hpSnapshot); }
  assert.equal(room.turnTimer, null);
});

test('dodge bonus is 20 percentage points and consumed once even on a failed check', t => {
  const { room } = fixture(t, ['archer']); const p = room.players.p0;
  assert.equal(GAME_BALANCE.archerMissNextDodgeBonus, .2);
  const old = Math.random; Math.random = () => .29;
  try { p.archerNextDodgeBonus = .2; assert.equal(room.checkDodge(p, .1), true);
    assert.equal(p.archerNextDodgeBonus, 0); assert.equal(room.checkDodge(p, .1), false);
    p.archerNextDodgeBonus = .2; Math.random = () => .99; assert.equal(room.checkDodge(p, .1), false); assert.equal(p.archerNextDodgeBonus, 0);
  } finally { Math.random = old; }
});
test('miss does no boss damage and boss ripple includes independent dodge results', t => {
  const { room, queue } = fixture(t, ['archer', 'warrior']); room.players.p0.action = 'a_shot'; resolve(room, .1);
  const step = queue().queue.find(s => s.actionId === 'a_shot');
  assert.equal(step.finalDamage, 0); assert.equal(step.targetHpAfter, step.targetHpBefore);
  const boss = queue().queue.find(s => s.type === 'boss_action'); assert.ok(boss.results.length >= 2);
  assert.ok(boss.results.some(r => r.targetId === 'p0' && r.outcome.type === 'dodge'));
});
test('drain damage precedes its actual heal and overheal preserves base Max HP', t => {
  const { room, queue } = fixture(t, ['mage']); const p = room.players.p0; p.action = 'm_drain'; p.hp = p.maxHp;
  const max = p.maxHp; resolve(room);
  const step = queue().queue.find(s => s.actionId === 'm_drain');
  assert.equal(step.results[0].kind, 'damage'); const heal = step.results.find(r => r.kind === 'heal');
  assert.ok(heal.actualHeal > 0); assert.ok(heal.targetAfter.tempHp > 0); assert.equal(heal.targetAfter.maxHp, max);
});
test('wolf reduction is based on effective Max HP and treant has no round start regen', t => {
  const { room, queue } = fixture(t, ['druid']); const p = room.players.p0; p.maxHp = 173; p.hp = 173; p.tempHp = 100; p.action = 'dru_transform';
  resolve(room, .1); const step = queue().queue.find(s => s.actionId === 'dru_transform');
  assert.equal(step.results[0].targetAfter.maxHp, Math.floor(173 * .8));
  assert.equal(p.werewolfMaxHpDeducted, 173 - Math.floor(173 * .8));
  p.druidForm = 'treant'; p.hp = 50; p.action = 'skip'; p.poisonTurns = 0; p.bleedTurns = 0; room.currentMonster.poisonTurns = 0;
  room.executeRoundStart(); assert.equal(p.hp, 50); assert.equal(GAME_BALANCE.treantDamageReduction, .3);
});
test('three minions have three ordered hits, fatal hit still requires all viewer ACKs', t => {
  const { room, queue } = fixture(t, ['druid', 'warrior']);
  room.players.p0.minions = [0, 1, 2].map(i => ({ id: 'm'+i, name: 'Wolf'+i, type: 'wolf', hp: 20, maxHp: 20, atk: 10 }));
  room.currentMonster.hp = 25; resolve(room);
  const data = queue(); const step = data.queue.find(s => s.category === 'MINION_ATTACK');
  assert.equal(step.results.length, 3); assert.deepEqual(step.results.map(r => r.targetAfter.hp), [15, 5, 0]);
  assert.equal(room.state, 'IN_BATTLE'); room.handlePresentationComplete('p0', data.presentationId, data.round);
  assert.equal(room.state, 'IN_BATTLE'); room.handlePresentationComplete('p1', data.presentationId, data.round);
  assert.equal(room.state, 'BATTLE_VICTORY'); assert.equal(room.turnTimer, null);
});
test('dead players cannot lock or receive normal healing; next floor revives once at 20%', t => {
  const { room } = fixture(t); const dead = room.players.p1; dead.hp = 0; room.clearPlayerDebuffs(dead);
  assert.equal(room.lockAction(dead.id, 'basic').success, false); assert.equal(room.applyHealWithOverheal(dead, 50), 0);
  room.floor = 2; room.startRouteSelection(); assert.equal(dead.hp, Math.max(1, Math.floor(dead.maxHp * .2)));
  assert.equal(dead.downedForFloor, false); assert.equal(room.floorRevival.results.length, 1);
  const hp = dead.hp; room.startRouteSelection(); assert.equal(dead.hp, hp); assert.equal(room.floorRevival, null);
});
test('bard revives in the same floor with both next-round exhaustion flags', t => {
  const { room, queue } = fixture(t, ['bard', 'warrior']); const dead = room.players.p1;
  dead.hp = 0; room.clearPlayerDebuffs(dead); room.players.p0.action = 'b_revive'; room.players.p0.targetPlayerId = dead.id;
  resolve(room); const step = queue().queue.find(s => s.category === 'REVIVE');
  const result = step.results.find(r => r.kind === 'revive'); assert.equal(result.actualHeal, Math.floor(dead.maxHp * .35));
  assert.equal(dead.downedForFloor, false); assert.equal(dead.stunnedNextTurn, true); assert.equal(room.players.p0.stunnedNextTurn, true);
});
test('victory recovery preserves formula and equipment/continue wait for every presentation ACK', t => {
  const { room } = fixture(t); const p = room.players.p0; p.hp = 30; const oldMax = p.maxHp, oldAtk = p.bonusAtk;
  room.currentMonster.hp = 0; room.handleMonsterVictory(); const id = room.currentVictory.presentationId;
  assert.equal(p.maxHp, oldMax + 10); assert.equal(p.bonusAtk, oldAtk + 5);
  assert.equal(p.hp, Math.min(p.maxHp, 30 + 10 + Math.round(p.maxHp * .2))); assert.equal(room.pendingDrop, null);
  room.handleVictoryComplete('p0', id - 1); assert.equal(room.victoryInteractionReady, false);
  room.handleVictoryComplete('p0', id); assert.equal(room.victoryInteractionReady, false);
  room.continueAfterVictory('p0', id); assert.equal(room.state, 'BATTLE_VICTORY');
  room.handleVictoryComplete('p1', id); assert.equal(room.victoryInteractionReady, true);
  if (room.pendingDrop) room.handleEquipChoice(room.pendingDrop.ownerId, 'discard');
  room.handleVictoryComplete('p0', id); assert.equal(room.pendingDrop, null);
  room.continueAfterVictory('p1', id); assert.equal(room.state, 'BATTLE_VICTORY');
  room.continueAfterVictory('p0', id); assert.equal(room.state, 'CHOOSING_ROUTE'); assert.equal(room.floor, 2);
});
test('stale/unknown ACK cannot advance and a wipe does not revive or advance floor', t => {
  const { room } = fixture(t); for (const p of Object.values(room.players)) { p.hp = 0; room.clearPlayerDebuffs(p); }
  room.publishCombatQueue([{ type: 'status_action' }]); const id = room.battlePresentationId;
  room.handlePresentationComplete('unknown', id, 1); room.handlePresentationComplete('p0', id - 1, 1);
  assert.equal(room.pendingPresentationAcks.size, 2); room.handlePresentationComplete('p0', id, 1);
  room.handlePresentationComplete('p1', id, 1); assert.equal(room.state, 'GAME_OVER'); assert.equal(room.floor, 1);
  assert.equal(room.players.p0.hp, 0);
});
test('boss bounce hits conserve aggregate damage and carry successive HP snapshots', t => {
  const { room, queue } = fixture(t, ['warrior']); const before = room.players.p0.hp; resolve(room);
  const hits = queue().queue.find(s => s.type === 'boss_action').results;
  assert.ok(hits.length > 2); assert.equal(hits[0].segment, 'aoe');
  assert.equal(hits.slice(1).every(h => h.segment === 'bounce'), true);
  assert.equal(hits.reduce((sum, h) => sum + h.finalDamage, 0), before - room.players.p0.hp);
  for (let i = 1; i < hits.length; i++) assert.equal(hits[i].targetBefore.hp, hits[i-1].targetAfter.hp);
});
test('cleanse removes known negative statuses before healing and does not clear locked corruption', t => {
  const { room, queue } = fixture(t, ['alchemist', 'warrior']);
  room.players.p0.action = 'alc_fate'; room.players.p0.poisonTurns = 2;
  room.players.p1.bleedTurns = 2; room.players.p1.cannotCrit = true; room.players.p1.corruption = 3;
  resolve(room, .1); const step = queue().queue.find(s => s.actionId === 'alc_fate');
  assert.equal(step.results[0].kind, 'cleanse'); assert.equal(step.results[1].kind, 'cleanse');
  const clean = step.results[1].targetAfter.statuses;
  assert.equal(clean.some(s => ['poison','bleed','crit_lock'].includes(s.id)), false);
  assert.equal(clean.find(s => s.id === 'corruption').locked, true);
  assert.ok(step.results.slice(2).some(r => r.kind === 'heal'));
});
test('minion death remains in intercept result until presentation, then is absent from final slots', t => {
  const { room, queue } = fixture(t, ['druid']); room.players.p0.minions = [{id:'m',type:'wolf',name:'Wolf',hp:3,maxHp:3,atk:1}];
  resolve(room); const boss = queue().queue.find(s => s.type === 'boss_action');
  const hit = boss.results.find(r => r.kind === 'intercept');
  assert.equal(hit.targetBefore.hp, 3); assert.equal(hit.targetAfter.hp, 0);
  assert.equal(hit.hpSnapshot.players[0].minions[0].hp, 0); assert.equal(boss.hpSnapshot.players[0].minions.length, 0);
});
test('DoT fatal result waits for all viewers before victory and keeps timer OFF', t => {
  const { room, queue } = fixture(t); room.currentMonster.hp = 3; room.currentMonster.poisonTurns = 1; room.currentMonster.poisonDmg = 5;
  room.executeRoundStart(); const wire = queue(); const step = wire.queue[0];
  assert.equal(step.category, 'STATUS_TICK'); assert.equal(step.results[0].targetAfter.hp, 0); assert.equal(room.turnTimer, null);
  room.handlePresentationComplete('p0', wire.presentationId, wire.round); assert.equal(room.state, 'IN_BATTLE');
  room.handlePresentationComplete('p1', wire.presentationId, wire.round); assert.equal(room.state, 'BATTLE_VICTORY');
});
test('disconnected victory owner releases loot and transfers leader without resurrecting duplicate ACKs', t => {
  const { room } = fixture(t); room.currentMonster.hp = 0; room.handleMonsterVictory();
  room.victoryPendingDrop = { ownerId:'p0', drop:{id:'w_sword'}, source:'battle' };
  const id = room.currentVictory.presentationId; room.handleVictoryComplete('p1',id); room.removePlayer('p0');
  assert.equal(room.leaderId,'p1'); assert.equal(room.victoryInteractionReady,true); assert.equal(room.pendingDrop,null);
  room.handleVictoryComplete('p1',id); assert.equal(room.pendingDrop,null);
  room.continueAfterVictory('p1',id); assert.equal(room.floor,2);
});
test('skill timer and resolution wait for the slowest viewer and reject stale round readiness', t => {
  const { room } = fixture(t); room.players.p1.hp = 0; room.clearPlayerDebuffs(room.players.p1);
  room.startSkillSelection(); room.players.p0.isLocked = true; room.players.p0.action = 'basic';
  room.handleSelectionReady('p0', 0); assert.equal(room.pendingSelectionAcks.size,2);
  room.handleSelectionReady('p0', 1); room.checkTurnCompletion(); assert.equal(room.selectionState,'SELECTING');
  assert.equal(room.turnTimer,null); room.handleSelectionReady('p1',1);
  assert.equal(room.selectionState,'RESOLVING'); assert.equal(room.turnTimer,null);
  room.state = 'GAME_OVER'; // Cancel the guarded 300ms transition during test cleanup.
});
