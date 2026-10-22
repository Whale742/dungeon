import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActionResults, normalizeCombatQueue, snapshotTarget, sequenceAugurDamageResults } from './combat-schema.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { Room } from './Room.js';
import { TIER1_EQUIPMENTS } from './constants.js';

export function fixture(t, role = 'warrior') {
  const events = [];
  const socket = { id: 'solo', join() {}, emit() {} };
  const io = { to: () => ({ emit: (...args) => events.push(args) }) };
  const room = new Room('TEST1', socket, 'Tester', io);
  room.selectRole(socket.id, role);
  t.after(() => {
    room.clearTimer();
    for (const key of ['presentationSafetyTimer', 'roundStartTimer', 'selectionReadyTimer']) clearTimeout(room[key]);
  });
  return { room, socket, events, player: room.players.solo };
}

test('solo prologue, preparation shop, route ACK and legal adjacency', t => {
  const { room } = fixture(t);
  assert.equal(room.startAdventure('solo', { checkReady: true }).success, true);
  assert.equal(room.state, 'PROLOGUE');
  assert.equal(room.gold, 45);
  assert.equal(room.turnTimer, null);
  room.handlePrologueComplete('outsider');
  assert.equal(room.state, 'PROLOGUE');
  room.handlePrologueComplete('solo');
  assert.equal(room.currentEvent.isPrepShop, true);
  const result = room.handleShopAction('solo', 'leave');
  assert.equal(result.success, true);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.voteRoute('solo', room.currentRoutes[0].id).success, false);
  room.handleRouteNarrativeDone('solo', room.routePresentationId - 1);
  assert.equal(room.isNarrating, true);
  room.handleRouteNarrativeDone('solo', room.routePresentationId);
  assert.equal(room.isNarrating, false);
  assert.equal(room.voteRoute('solo', 'invalid').success, false);
  assert.ok(room.currentRoutes.every(r => room.getAdjacentNextHexes().some(h => h.id === r.id)));
});

test('combat uses presentation ACK, rejects stale ACK and advances one round', t => {
  const { room } = fixture(t);
  room.handleBattleEvent(null, false, { col: 1 });
  assert.equal(room.state, 'IN_BATTLE');
  assert.ok(room.getLivingEnemies().length);
  room.publishCombatQueue([], 'round_start');
  assert.equal(room.selectionState, 'RESOLVING');
  const id = room.battlePresentationId;
  room.handlePresentationComplete('solo', id - 1, 1);
  assert.equal(room.selectionState, 'RESOLVING');
  room.handlePresentationComplete('solo', id, 1);
  assert.equal(room.selectionState, 'SELECTING');
  assert.equal(room.isWaitingForSelectionReady, true);
  room.handleSelectionReady('solo', 0);
  assert.equal(room.isWaitingForSelectionReady, true);
  room.handleSelectionReady('solo', 1);
  assert.equal(room.isWaitingForSelectionReady, false);
  room.resolveTurnActions();
  assert.equal(room.selectionState, 'RESOLVING');
  room.handlePresentationComplete('solo', room.battlePresentationId, 1);
  assert.equal(room.battleRound, 2);
  const next = room.battlePresentationId;
  room.handlePresentationComplete('solo', id, 1);
  assert.equal(room.battlePresentationId, next);
});

test('victory reward ACK and continuation return to exploration', t => {
  const { room } = fixture(t);
  room.handleBattleEvent(null, false, { col: 1 });
  const before = room.gold;
  for (const e of room.enemies) e.hp = 0;
  room.publishCombatQueue([]);
  room.handlePresentationComplete('solo', room.battlePresentationId, 1);
  assert.equal(room.state, 'BATTLE_VICTORY');
  assert.ok(room.gold > before);
  const id = room.currentVictory.presentationId;
  room.continueAfterVictory('solo', id);
  assert.equal(room.state, 'BATTLE_VICTORY');
  room.handleVictoryComplete('solo', id);
  room.continueAfterVictory('solo', id);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.floor, 2);
});

test('chest reward waits for ACK; equipment swap and removal do not compound stats', t => {
  const { room, player } = fixture(t);
  room.handleChestEvent({ col: 1, isMimic: false });
  assert.equal(room.handleChestAction('solo', 'open').success, true);
  assert.equal(room.state, 'EVENT');
  room.handleChestPresentationComplete('solo', room.currentEvent.presentationId);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  const item = TIER1_EQUIPMENTS.find(e => e.slot === 'WEAPON');
  assert.ok(item);
  player.bag = [structuredClone(item), structuredClone(item)];
  const before = player.bonusAtk;
  assert.equal(room.equipItemFromBag('solo', 0).success, true);
  const equipped = player.bonusAtk;
  assert.equal(room.equipItemFromBag('solo', 0).success, true);
  assert.equal(player.bonusAtk, equipped);
  assert.equal(room.unequipItemToBag('solo', 'WEAPON').success, true);
  assert.equal(player.bonusAtk, before);
});

// Phase 1 regressions exercise the production engine and the published wire queue.

function phase1Battle(t, role, hp = 500) {
  const f = fixture(t, role);
  f.room.handleBattleEvent(null, false, { col: 1 });
  const template = f.room.currentMonster;
  f.room.enemies = ['ELITE', 'MINION', 'MINION'].map((tier, i) =>
    f.room.createEnemyInstance(template, i, { tier, rng: () => .5 }));
  for (const enemy of f.room.enemies) { enemy.hp = hp; enemy.maxHp = hp; }
  f.room.currentMonster = f.room.enemies[0];
  f.player.targetEnemyId = f.room.enemies[1].instanceId;
  return f;
}
function resolutionQueue(events) {
  return events.filter(e => e[0] === 'battle:presentation_queue').at(-1)?.[1].queue || [];
}
for (const [role, action] of [['mage','m_blast'], ['archer','a_rain'], ['alchemist','alc_acid'], ['warrior','basic']]) {
  test('Phase 1 concrete multi-enemy results: ' + action, t => {
    const { room, player, events } = phase1Battle(t, role);
    player.action = action;
    room.resolveTurnActions();
    const queue = resolutionQueue(events);
    const step = queue.find(s => s.type === 'player_action' && s.sourceId === player.id && s.actionId === action);
    assert.ok(step, 'production action emitted');
    const damage = step.results.filter(r => r.kind === 'damage' && r.targetEnemyId);
    assert.ok(damage.some(r => r.targetEnemyId === player.targetEnemyId));
    if (['m_blast','alc_acid'].includes(action)) assert.equal(new Set(damage.map(r => r.targetId)).size, 3);
    if (action === 'basic') assert.deepEqual([...new Set(damage.map(r => r.targetId))], [player.targetEnemyId]);
    let previous = -1;
    for (const result of queue.flatMap(s => s.results || [])) {
      assert.notEqual(result.targetId, 'monster');
      assert.ok(result.sourceId);
      assert.ok(result.actionId && result.skillId && result.resultId);
      assert.ok(result.outcome && result.targetBefore && result.targetAfter && result.hpSnapshot);
      assert.ok(result.sequence > previous); previous = result.sequence;
      if (result.targetEnemyId) assert.equal(result.targetId, result.targetEnemyId);
      assert.equal(snapshotTarget(result.hpSnapshot, result.targetId)?.hp, result.targetAfter.hp);
    }
    for (const enemy of step.hpSnapshot.enemies) {
      const results = damage.filter(r => r.targetId === enemy.instanceId);
      const before = snapshotTarget(step.hpSnapshotBefore, enemy.instanceId);
      assert.equal(results.reduce((n,r) => n+r.actualDamage,0), Math.max(0, before.hp-enemy.hp));
    }
  });
}

test('Phase 1 arrow rain keeps lethal secondary results', t => {
  const { room, player, events } = phase1Battle(t, 'archer', 1);
  for (const enemy of room.enemies) enemy.flawMarks = 5; // Actual production mark guarantees hit.
  player.action = 'a_rain';
  room.resolveTurnActions();
  const step = resolutionQueue(events).find(s => s.actionId === 'a_rain');
  assert.ok(step);
  const damage = step.results.filter(r => r.kind === 'damage' && r.targetEnemyId);
  assert.equal(new Set(damage.map(r => r.targetId)).size, 3);
  for (const result of damage) { assert.equal(result.actualDamage, 1); assert.equal(result.targetAfter.hp, 0); }
});

test('Phase 1 aliases, reaction order and secondary HP stay independent', () => {
  const enemies = [{instanceId:'elite',hp:100,maxHp:100}, {instanceId:'small',hp:20,maxHp:20}];
  const before = { monster: structuredClone(enemies[0]), enemies, players: [] };
  const after = structuredClone(before); after.monster.hp=60; after.enemies[0].hp=60; after.enemies[1].hp=0;
  const step = { actionId:'m_blast',sourceId:'mage',targetEnemyId:'elite',outcome:{type:'normal'},hpSnapshotBefore:before,hpSnapshot:after };
  step.results=buildActionResults(step,before,after,[
    {type:'player_attack',targetEnemyId:'small',value:30,isSecondaryEnemy:true},
    {type:'player_attack',targetEnemyId:'elite',value:30},
    {type:'augur_tome',targetEnemyId:'elite',value:10}
  ]);
  sequenceAugurDamageResults(step); normalizeCombatQueue([step],'round');
  const small=step.results.find(r=>r.targetId==='small');
  assert.equal(small.actualDamage,20); assert.equal(small.hpSnapshot.monster.hp,100);
  const elite=step.results.filter(r=>r.targetId==='elite');
  assert.deepEqual(elite.map(r=>r.targetAfter.hp),[70,60]);
  assert.equal(elite.at(-1).hpSnapshot.enemies[0].hp,60);
});

test('Phase 1 DOM anchors use concrete targets and apply each result once', () => {
  const source=readFileSync(new URL('../public/presentation-core.js',import.meta.url),'utf8');
  const node={isConnected:true,dataset:{enemyId:'small'},getBoundingClientRect:()=>({left:20,top:40,width:70,height:80})};
  const calls=[];
  const scope={roomState:{currentMonster:{instanceId:'elite'},players:[]},document:{querySelectorAll:selector=>selector.includes('battle-enemy')?[node]:[]},applyHpSnapshot:s=>calls.push(s)};
  vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('function battlefieldAnchor')),scope);
  assert.equal(scope.getEnemyAnchor('small').x,55);
  node.getBoundingClientRect=()=>({left:100,top:10,width:70,height:80});
  assert.equal(scope.getEnemyAnchor('small').x,135);
  assert.equal(scope.getEnemyAnchor('missing'),null);
  const result={resultId:'one',targetId:'small',targetEnemyId:'small',targetAfter:{instanceId:'small',hp:0,maxHp:20}};
  assert.equal(scope.applyAuthoritativeResult(result),true);
  assert.equal(scope.applyAuthoritativeResult({...result}),false);
  assert.equal(calls.length,1); assert.equal(calls[0].enemies[0].instanceId,'small'); assert.equal(calls[0].monster,undefined);
  const adapted=scope.adaptLegacyPresentationStep({targetEnemyId:'elite',results:[result,{targetId:'elite',targetEnemyId:'elite'}]});
  assert.equal(adapted.results[0].targetId,'small'); assert.equal(adapted.results[1].targetId,'monster');
  node.isConnected=false;assert.equal(scope.getEnemyAnchor('small'),null);
});

for (const tiers of [['MINION'], ['MINION','MINION','MINION'], ['ELITE'], ['ELITE','MINION'], ['ELITE','MINION','MINION'], ['ABYSS','MINION','MINION'], ['ELITE','ELITE','MINION']]) {
  test('Phase 1 production formation: ' + tiers.join('+'), t => {
    const {room}=fixture(t);room.handleBattleEvent(null,false,{col:1});
    const enemies=tiers.map((tier,i)=>room.createEnemyInstance(room.currentMonster,i,{tier}));
    const source=readFileSync(new URL('../public/presentation-core.js',import.meta.url),'utf8');
    const scope={};vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('function getBattleFormation')),scope);
    const layout=scope.getBattleFormation(enemies);
    assert.equal(layout.displayOrder.length,tiers.length);
    assert.equal(new Set(layout.displayOrder).size,tiers.length);
    if(layout.centered)assert.equal(layout.bosses[0],layout.displayOrder[Math.ceil((tiers.length-1)/2)]);
    const minion=enemies.find(e=>e.tier==='MINION');
    if(minion){minion.isBoss=true;assert.ok(!scope.getBattleFormation(enemies).bosses.includes(minion),'formal tier overrides legacy boss flag');}
    for(const boss of layout.bosses)boss.hp=0;
    const survivors=enemies.filter(e=>e.hp>0);
    assert.equal(scope.getBattleFormation(survivors).bosses.length,0);
    if(minion)assert.equal(minion.tier,'MINION');
  });
}

test('Phase 1 druid companions retain individual source IDs and selected enemy', t => {
  const {room,player,events}=phase1Battle(t,'druid');
  player.minions=[{id:'companion-1',name:'幼狼',type:'wolf',hp:20,maxHp:20,atk:10,alive:true}];
  player.action='skip';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.category==='MINION_ATTACK');assert.ok(step);
  assert.equal(step.results[0].sourceId,'companion-1');assert.equal(step.results[0].ownerId,player.id);
  assert.equal(step.results[0].targetId,player.targetEnemyId);
  assert.equal(step.results[0].targetBefore.hp-step.results[0].targetAfter.hp,step.results[0].actualDamage);
});

test('Phase 1 assassin follow-up targets the triggering real enemy once', t => {
  const {room,player,events}=fixture(t,'warrior');
  room.addPlayer({id:'shadow',join(){},emit(){}},'Shadow');room.selectRole('shadow','assassin');
  room.handleBattleEvent(null,false,{col:1});
  const template=room.currentMonster;
  room.enemies=['ELITE','MINION'].map((tier,i)=>room.createEnemyInstance(template,i,{tier}));
  for(const enemy of room.enemies){enemy.hp=500;enemy.maxHp=500;}
  room.currentMonster=room.enemies[0];
  player.targetEnemyId=room.enemies[1].instanceId;player.action='basic';
  const assassin=room.players.shadow;assassin.action='skip';assassin.isHiddenThisRound=true;
  t.mock.method(Math,'random',()=>0);
  room.resolveTurnActions();
  const follow=resolutionQueue(events).filter(s=>s.category==='FOLLOW_UP');
  assert.equal(follow.length,1);
  const result=follow[0].results[0];
  assert.equal(result.sourceId,assassin.id);assert.equal(result.targetId,room.enemies[1].instanceId);
  assert.equal(result.targetBefore.hp-result.targetAfter.hp,result.actualDamage);
  assert.equal(follow[0].hpSnapshot.enemies[0].hp,500);
});
