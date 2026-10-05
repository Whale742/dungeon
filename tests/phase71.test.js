import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { LOOT_TABLE, equipItemToPlayer } from '../game/constants.js';

function setup(t, roles = ['druid', 'warrior']) {
  let wire;
  const socket = id => ({ id, join() {} });
  const room = new Room('P71', socket('p0'), 'Hero', { to: () => ({ emit(name, data) { if (name === 'battle:presentation_queue') wire = data; } }) });
  roles.slice(1).forEach((_, i) => room.addPlayer(socket('p' + (i+1)), 'Ally'));
  roles.forEach((role, i) => { room.selectRole('p'+i, role); room.players['p'+i].action = 'skip'; });
  room.state = 'IN_BATTLE'; room.floor = 1; room.battleRound = 1;
  room.currentMonster = { name: 'Boss', avatar: '/BOSS/Ancient Guardian Golem.webp', hp: 5000, maxHp: 5000, attack: 5, resistance: null };
  t.after(() => room.clearTimer());
  return { room, resolve(random = .9) { const old = Math.random; Math.random = () => random; try { room.resolveTurnActions(); } finally { Math.random = old; } return wire.queue; } };
}
function minions(count) {
  return Array.from({ length: count }, (_, i) => ({ id: 'm'+i, type: 'wolf', name: 'Wolf'+i, hp: 20, maxHp: 20, atk: 10, alive: true }));
}
test('owner → minion combo → next player, with successive authoritative HP', t => {
  const { room, resolve } = setup(t);
  room.players.p0.action = 'basic'; room.players.p0.minions = minions(3); room.players.p1.action = 'basic';
  const steps = resolve();
  assert.deepEqual(steps.slice(0, 3).map(s => [s.sourceId, s.category]), [['p0', 'OFFENSIVE'], ['p0', 'MINION_ATTACK'], ['p1', 'OFFENSIVE']]);
  const combo = steps[1]; assert.equal(combo.results.length, 3);
  assert.deepEqual(combo.hpSnapshotBefore, steps[0].hpSnapshot);
  combo.results.forEach((hit, i) => {
    assert.equal(hit.finalDamage, 10);
    assert.equal(hit.targetBefore.hp, i ? combo.results[i-1].targetAfter.hp : steps[0].hpSnapshot.monster.hp);
    assert.equal(hit.targetAfter.hp, hit.targetBefore.hp - 10);
  });
});
test('summon joins two existing minions once after reveal and before next owner', t => {
  const { room, resolve } = setup(t);
  room.players.p0.action = 'dru_summon_wolf'; room.players.p0.minions = minions(2); room.players.p1.action = 'basic';
  const steps = resolve();
  assert.equal(steps[0].category, 'SUMMON'); assert.equal(steps[0].finalDamage, 0);
  assert.equal(steps[0].hpSnapshot.monster.hp, 5000);
  assert.equal(steps[1].category, 'MINION_ATTACK'); assert.equal(steps[1].results.length, 3);
  assert.equal(new Set(steps[1].results.map(r => r.minion.id)).size, 3);
  assert.equal(steps[1].results[2].minion.id, steps[0].results[0].minions[0].id);
  assert.equal(steps[2].sourceId, 'p1');
});
test('support priority is unchanged while minions follow their owner', t => {
  const { room, resolve } = setup(t, ['druid', 'warrior', 'bard']);
  room.players.p0.action = 'basic'; room.players.p0.minions = minions(1);
  room.players.p1.action = 'w_shield'; room.players.p2.action = 'b_heal';
  const steps = resolve();
  assert.deepEqual(steps.slice(0, 4).map(s => s.category), ['DEFENSE', 'HEAL', 'OFFENSIVE', 'MINION_ATTACK']);
});
test('werewolf cast snapshot has no damage, reveal precedes normal offensive claw', t => {
  const { room, resolve } = setup(t); room.players.p0.action = 'dru_transform';
  const steps = resolve(.1), cast = steps[0], attack = steps[1];
  assert.equal(cast.category, 'TRANSFORM'); assert.equal(cast.hpSnapshotBefore.players[0].druidForm, null);
  assert.equal(cast.finalDamage, 0); assert.equal(cast.hpSnapshot.monster.hp, 5000);
  assert.equal(cast.results.length, 1); assert.equal(cast.hpSnapshot.players[0].druidForm, 'werewolf');
  assert.equal(attack.category, 'OFFENSIVE'); assert.equal(attack.actionId, 'dru_claw');
  assert.equal(attack.hpSnapshotBefore.players[0].druidForm, 'werewolf');
  assert.equal(attack.finalDamage, 40); assert.equal(attack.hpSnapshot.monster.hp, 4960);
});
test('treant transform has no fabricated follow-up damage', t => {
  const { room, resolve } = setup(t); room.players.p0.action = 'dru_transform';
  const steps = resolve(.9); assert.equal(steps[0].hpSnapshot.players[0].druidForm, 'treant');
  assert.equal(steps.some(s => s.actionId === 'dru_claw'), false);
});
test('disconnect during multiplayer presentation releases that viewer without crashing the server', t => {
  const { room, resolve } = setup(t); room.players.p0.action = 'basic'; resolve();
  assert.doesNotThrow(() => room.removePlayer('p1'));
  assert.equal(room.pendingPresentationAcks.has('p1'), false);
  assert.equal(room.pendingPresentationAcks.has('p0'), true);
  assert.equal(room.state, 'IN_BATTLE');
});
for (const action of ['a_reload', 'a_frenzy_reload']) for (const count of [0, 1, 2]) {
  for (const [ammo, roll] of [['pierce', .1], ['elemental', .5], ['burst', .9]]) test(`${action} ${count} slots retains existing ammo and exposes server ${ammo}`, t => {
    const { room, resolve } = setup(t, ['archer']); const p = room.players.p0;
    equipItemToPlayer(p, structuredClone(LOOT_TABLE.find(e => e.id === 'a_crossbow')));
    p.ammo = Array(count).fill('pierce'); p.action = action;
    const step = resolve(roll)[0], result = step.results.find(r => r.kind === 'reload');
    assert.deepEqual(result.ammoBefore, Array(count).fill('pierce'));
    assert.deepEqual(result.loaded, Array(action === 'a_reload' ? 1 : 3-count).fill(ammo));
    assert.deepEqual(result.ammoAfter, [...result.ammoBefore, ...result.loaded]);
    assert.deepEqual(step.ammoBefore, result.ammoBefore); assert.deepEqual(step.ammoAfter, result.ammoAfter);
    assert.deepEqual(step.hpSnapshot.players[0].ammo, result.ammoAfter);
    assert.equal(result.statuses.some(s => s.id === 'crouch'), true);
  });
}
