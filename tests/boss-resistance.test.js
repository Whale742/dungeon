import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { ENCOUNTERS } from '../game/constants.js';
import { createBossResistances, rollBonusResistance } from '../game/boss-resistance.js';

function random(value, run) {
  const original = Math.random;
  Math.random = typeof value === 'function' ? value : () => value;
  try { return run(); } finally { Math.random = original; }
}

function fixture(t, role = 'warrior') {
  const events = [];
  const room = new Room('RESIST', { id: 'p0', join() {} }, 'Hero', {
    to: () => ({ emit: (name, data) => events.push({ name, data }) })
  });
  room.selectRole('p0', role);
  room.state = 'IN_BATTLE'; room.floor = 1; room.battleRound = 1;
  room.currentMonster = { name: 'Boss', hp: 5000, maxHp: 5000, attack: 10,
    resistances: { physical: 20, magic: 40, effect: 0 }, poisonTurns: 0, poisonDmg: 0 };
  room.p8LogBuffer = [];
  t.after(() => room.clearTimer());
  return { room, step: () => events.findLast(e => e.name === 'battle:presentation_queue').data.queue.find(s => s.type === 'player_action') };
}

test('all ten bosses use the requested base percentages', () => {
  assert.deepEqual(ENCOUNTERS.map(m => [m.name, m.baseResistances]), [
    ['地底熔岩巨像', { physical: 20, magic: 20, effect: 0 }],
    ['暗影魔狼族長', { physical: 15, magic: 15, effect: 10 }],
    ['古代守護魔偶', { physical: 0, magic: 0, effect: 20 }],
    ['赤月嗜血巫師', { physical: 0, magic: 20, effect: 15 }],
    ['深淵腐蝕巨蟒', { physical: 10, magic: 10, effect: 20 }],
    ['霜骨亡靈騎士', { physical: 0, magic: 20, effect: 20 }],
    ['迷宮食腐暴食魔', { physical: 5, magic: 5, effect: 20 }],
    ['幻惑幽魂歌姬', { physical: 20, magic: 0, effect: 0 }],
    ['結晶守護巨蠍', { physical: 20, magic: 5, effect: 0 }],
    ['煉獄炎獄行者', { physical: 10, magic: 10, effect: 10 }]
  ]);
});

test('independent bonuses include 0 and 50 and add to the base', () => {
  const draws = [0, .5, .999999];
  const result = createBossResistances(ENCOUNTERS[0], 1, () => draws.shift());
  assert.deepEqual(result.bonusResistances, { physical: 0, magic: 25, effect: 50 });
  assert.deepEqual(result.resistances, { physical: 20, magic: 45, effect: 50 });
  assert.notEqual(result.baseResistances, ENCOUNTERS[0].baseResistances);
});

test('deeper floors increase high-value frequency while retaining the 0–50 range', () => {
  const samples = floor => Array.from({ length: 10000 }, (_, i) => rollBonusResistance(floor, () => (i + .5) / 10000));
  const shallow = samples(1), deep = samples(31);
  assert.ok(deep.filter(n => n >= 40).length > shallow.filter(n => n >= 40).length);
  for (let i = 0; i < deep.length; i++) assert.ok(deep[i] >= shallow[i] && deep[i] <= 50);
  for (const floor of [1, 10, 100, 1000]) {
    assert.equal(rollBonusResistance(floor, () => 0), 0);
    assert.equal(rollBonusResistance(floor, () => .999999), 50);
  }
});

test('normal and weakened encounters roll fresh bonuses only at battle start', t => {
  const { room } = fixture(t);
  room.executeTurn = () => {};
  random(0, () => room.handleBattleEvent());
  assert.deepEqual(room.currentMonster.resistances, ENCOUNTERS[0].baseResistances);
  random(.999999, () => room.handleBattleEvent(null, true));
  assert.equal(room.currentMonster.isWeakened, true);
  assert.deepEqual(room.currentMonster.bonusResistances, { physical: 50, magic: 50, effect: 50 });
  const before = structuredClone(room.currentMonster.resistances);
  room.players.p0.action = 'skip';
  random(.9, () => room.resolveTurnActions());
  assert.deepEqual(room.currentMonster.resistances, before);
});

for (const [role, expected] of [['warrior', 4], ['mage', 6]]) {
  test(`${role} uses the matching percentage for damage`, t => {
    const { room, step } = fixture(t, role);
    room.players.p0.action = 'basic';
    random(.9, () => room.resolveTurnActions());
    assert.equal(step().finalDamage, expected);
  });
}

test('mirror swaps numeric physical and magic resistance', t => {
  const { room, step } = fixture(t);
  room.p8Effect(room.currentMonster, 'mirror', 'Mirror');
  room.players.p0.action = 'basic';
  random(.9, () => room.resolveTurnActions());
  assert.equal(step().finalDamage, 3);
});

test('partial penetration and full penetration work with numeric resistances', t => {
  const { room, step } = fixture(t, 'sage');
  room.players.p0.action = 'sge_deduce';
  random(.9, () => room.resolveTurnActions());
  assert.equal(step().results.find(r => r.kind === 'damage').finalDamage, 9);
  const samurai = fixture(t, 'samurai');
  Object.assign(samurai.room.players.p0, { action: 'sa_tsubame', soul: 4 });
  random(.9, () => samurai.room.resolveTurnActions());
  assert.equal(samurai.step().results.filter(r => r.kind === 'damage').reduce((n, r) => n + r.finalDamage, 0), 40);
});

test('effect immunity uses an independent percentage and preserves existing poison', t => {
  const { room } = fixture(t);
  Object.assign(room.currentMonster, { poisonTurns: 1, poisonDmg: 5 });
  room.currentMonster.resistances.effect = 20;
  assert.equal(random(.1999, () => room.applyMonsterPoison(5)), false);
  assert.equal(room.currentMonster.poisonTurns, 1);
  assert.equal(room.currentMonster.poisonDmg, 5);
  assert.equal(random(.2, () => room.applyMonsterPoison(5)), true);
  assert.equal(room.currentMonster.poisonDmg, 10);
  assert.equal(room.currentMonster.poisonTurns, 2);
});

for (const action of ['alc_poison', 'alc_flask']) {
  test(`${action} immunity blocks poison but retains direct damage and ally poison`, t => {
    const { room, step } = fixture(t, 'alchemist');
    room.currentMonster.resistances.effect = 100;
    room.players.p0.action = action;
    random(action === 'alc_flask' ? .1 : .9, () => room.resolveTurnActions());
    assert.equal(room.currentMonster.poisonTurns, 0);
    assert.equal(room.players.p0.poisonTurns, 2);
    assert.ok(step().finalDamage > 0);
    assert.match(step().detail, /免疫/);
  });
}

for (const action of ['basic', 'dw_false_dream', 'dw_butterfly']) {
  test(`dreamweaver ${action} immunity prevents state and HP/stat mutations`, t => {
    const { room } = fixture(t, 'dreamweaver');
    room.currentMonster.resistances.effect = 100;
    room.players.p0.action = action;
    random(.1, () => room.p8Action(room.players.p0, raw => ({ dmg: raw }), 1, [], room.p8LogBuffer));
    assert.equal(room.currentMonster.maxHp, 5000);
    assert.equal(room.currentMonster.attack, 10);
    assert.deepEqual(room.currentMonster.p8Effects || {}, {});
    assert.equal(room.currentMonster.hp, action === 'basic' ? 4990 : 5000);
  });
}

test('sleep immunity leaves the boss able to act and preserves the attack damage', t => {
  const { room, step } = fixture(t, 'bard');
  room.currentMonster.resistances.effect = 100;
  room.players.p0.action = 'b_nocturne';
  random(.1, () => room.resolveTurnActions());
  assert.ok(step().finalDamage > 0);
  assert.notEqual(step().outcome.type, 'sleep');
  assert.match(step().detail, /免疫/);
  assert.ok(room.players.p0.hp < room.players.p0.maxHp);
});

test('effect resistance blocks enemy status effects but never ally buffs', t => {
  const { room } = fixture(t);
  room.currentMonster.resistances.effect = 100;
  assert.equal(random(.9, () => room.p8Effect(room.currentMonster, 'sage_square', 'SQUARE')), false);
  assert.equal(random(.9, () => room.p8Effect(room.currentMonster, 'sage_exposed', 'ODD')), false);
  assert.equal(random(.9, () => room.p8Effect(room.players.p0, 'galaxy', 'Galaxy')), true);
});

test('zero effect resistance never rolls an immunity check', t => {
  const { room } = fixture(t);
  assert.equal(random(() => { throw new Error('Unexpected immunity roll'); }, () => room.applyMonsterPoison(5)), true);
});

test('attack-down immunity preserves direct damage without showing an applied debuff', t => {
  const { room, step } = fixture(t, 'archer');
  room.currentMonster.resistances.effect = 100;
  room.players.p0.action = 'a_rain';
  random(.9, () => room.resolveTurnActions());
  assert.equal(step().finalDamage, 12);
  assert.ok(!step().hpSnapshot.monster.statuses.some(s => s.id === 'attack_down'));
  assert.match(step().detail, /免疫攻擊降低/);
});

test('planet stun is independently checked against effect resistance', t => {
  const { room } = fixture(t, 'stargazer');
  room.currentMonster.resistances.effect = 100;
  room.players.p0.action = 'sg_observe';
  const draws = [.65, .01, .9]; // Planet, stun proc, immunity.
  const result = random(() => draws.shift(), () => room.p8Action(room.players.p0, raw => ({ dmg: raw }), 1, [], room.p8LogBuffer));
  assert.equal(result.outcome.type, 'planet');
  assert.equal(result.outcome.stunned, undefined);
  assert.equal(room.monsterStunnedThisRound, false);
  assert.equal(room.currentMonster.hp, 4975);
});

test('battle resistance rolls use only in-range multiples of five for every boss and floor',()=>{
 for(const floor of [1,10,31,100,1000])for(const monster of ENCOUNTERS){
  for(let i=0;i<=100;i++){
   const result=createBossResistances(monster,floor,()=>i/100);
   for(const type of ['physical','magic','effect']){
    const bonus=result.bonusResistances[type],total=result.resistances[type],base=monster.baseResistances[type];
    assert.equal(bonus%5,0);assert(bonus>=0&&bonus<=50);
    assert.equal(total%5,0);assert(total>=base&&total<=base+50);
   }
  }
 }
});
test('floor one samples all eleven resistance values evenly',()=>{
 const counts=new Map();
 for(let i=0;i<1100;i++){
  const value=rollBonusResistance(1,()=>(i+.5)/1100);
  counts.set(value,(counts.get(value)||0)+1);
 }
 assert.deepEqual([...counts.keys()],[0,5,10,15,20,25,30,35,40,45,50]);
 assert([...counts.values()].every(n=>n===100));
});
