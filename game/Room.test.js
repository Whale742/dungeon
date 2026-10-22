import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActionResults, normalizeCombatQueue, snapshotTarget, sequenceAugurDamageResults } from './combat-schema.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Room } from './Room.js';
import { TIER1_EQUIPMENTS } from './constants.js';
import { ENCOUNTERS, EXCLUSIVE_MINIONS, GENERAL_MINIONS, ABYSS_MINIONS, SPECIAL_ELITES, ABYSS_BOSSES } from './constants.js';
import { ENEMY_BALANCE, mechanicId, enemyRoundStart, drainEnemyEvents, runEnemyAction, beforePlayerAction, beforeEnemyDamage, afterPlayerDamage, sweepEnemyDeaths, enemyEffect, syncEnemySupport } from './enemy-mechanics.js';
import { getBossResistance } from './boss-resistance.js';
import { resolveStats } from './stats.js';


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

// Phase 2 uses real templates, the production factory and production settlement.
const allEnemyTemplates=[...ENCOUNTERS,...EXCLUSIVE_MINIONS,...GENERAL_MINIONS,...ABYSS_MINIONS,...Object.values(SPECIAL_ELITES),...Object.values(ABYSS_BOSSES)];
function mechanismBattle(t,templates,role='warrior') {
  const f=fixture(t,role);f.room.handleBattleEvent(null,false,{col:1});
  f.room.setEnemies(templates.map((template,i)=>f.room.createEnemyInstance(template,i,{tier:template.script?'ABYSS':template.attack&&template.id&&!template.isMimic&&!template.isShadyMerchant?'MINION':'ELITE',rng:()=>0})));
  f.room.p8ResetBattle();
  f.player.hp=1000;f.player.maxHp=1000;f.player.DEF=0;
  f.room.enemyMechanicQueue=[];
  return {...f,enemy:f.room.enemies[0]};
}
function mechanismRound(room,round) {room.battleRound=round;enemyRoundStart(room);const queue=[];drainEnemyEvents(room,queue);return queue;}
function actMechanism(room,enemy) {const queue=[];assert.equal(runEnemyAction(room,enemy,queue),true);return queue;}

test('Phase 2 exactly 41 canonical templates have independent mechanics',()=>{
  assert.equal(allEnemyTemplates.length,41);
  assert.equal(new Set(allEnemyTemplates.map(mechanicId)).size,41);
  assert.ok(allEnemyTemplates.every(mechanicId));
});
for(const template of allEnemyTemplates)test('Phase 2 factory, action, snapshots and death: '+template.name,t=>{
  const pair=template.bossName?ENCOUNTERS.find(e=>e.name===template.bossName):null;
  const {room,enemy}=mechanismBattle(t,[template,...(pair?[pair]:[])]);
  assert.equal(enemy.mechanics.id,mechanicId(template));
  enemy.hp=Math.max(1,Math.floor(enemy.maxHp/2));
  let queue=mechanismRound(room,1);queue.push(...actMechanism(room,enemy));
  queue.push(...mechanismRound(room,3),...actMechanism(room,enemy));
  normalizeCombatQueue(queue,'phase2-'+enemy.mechanics.id);
  assert.ok(queue.length);
  for(const result of queue.flatMap(s=>s.results||[])) {
    assert.ok(result.sourceId&&result.targetId&&result.actionId&&result.skillId);
    assert.ok(result.targetBefore&&result.targetAfter&&result.hpSnapshot&&result.outcome);
    assert.equal(snapshotTarget(result.hpSnapshot,result.targetId).hp,result.targetAfter.hp);
    assert.ok(result.actualDamage>=0&&result.actualHeal>=0&&result.actualShield>=0);
  }
  enemy.hp=0;sweepEnemyDeaths(room);const end=[];drainEnemyEvents(room,end);
  const count=end.length;runEnemyAction(room,enemy,end);assert.equal(end.length,count);
  assert.equal(enemy.mechanics.deathProcessed,true);
  assert.equal(enemy.tempHp,0);
});

test('Phase 2 first-hit armor is per instance; magic breaks only lava armor',t=>{
  const {room}=mechanismBattle(t,[ENCOUNTERS[0],GENERAL_MINIONS[0],GENERAL_MINIONS[0]]);
  mechanismRound(room,1);const [lava,a,b]=room.enemies;
  assert.equal(beforeEnemyDamage(room,a,40,'phys'),30);
  assert.equal(beforeEnemyDamage(room,a,40,'phys'),40);
  assert.equal(beforeEnemyDamage(room,b,40,'phys'),30);
  assert.equal(beforeEnemyDamage(room,lava,40,'mag'),40);
  assert.equal(beforeEnemyDamage(room,lava,40,'phys'),40);
  mechanismRound(room,2);assert.equal(beforeEnemyDamage(room,lava,40,'phys'),30);
});

test('Phase 2 support is capped, idempotent, and stops after its real source dies',t=>{
  const {room}=mechanismBattle(t,[ENCOUNTERS[2],EXCLUSIVE_MINIONS[2],EXCLUSIVE_MINIONS[2]]);
  const queue=mechanismRound(room,1),[boss,a,b]=room.enemies;
  assert.equal(boss.tempHp,8);assert.equal(boss.mechanics.charge,2);
  enemyRoundStart(room);assert.equal(boss.tempHp,8);
  a.hp=0;sweepEnemyDeaths(room);mechanismRound(room,2);assert.equal(boss.tempHp,12);
  b.hp=0;sweepEnemyDeaths(room);mechanismRound(room,3);assert.equal(boss.tempHp,12);
  boss.hp=0;sweepEnemyDeaths(room);assert.equal(boss.tempHp,0);
  assert.ok(queue.some(s=>s.actionId==='維修充能'));
});

test('Phase 2 abyss watcher cover has at most two stacks and removes dead sources',t=>{
  const {room}=mechanismBattle(t,[ABYSS_BOSSES.warrior,ABYSS_MINIONS[1],ABYSS_MINIONS[1],ABYSS_MINIONS[1]]);
  mechanismRound(room,1);const [boss,...watchers]=room.enemies;
  assert.equal(boss.enemyEffectResistanceBonus,10);
  const base=boss.resistances.effect;
  assert.equal(getBossResistance(boss,'effect'),Math.min(100,base+10));
  watchers[0].hp=0;watchers[1].hp=0;sweepEnemyDeaths(room);assert.equal(boss.enemyEffectResistanceBonus,5);
  watchers[2].hp=0;sweepEnemyDeaths(room);assert.equal(boss.enemyEffectResistanceBonus,0);
  assert.equal(boss.resistances.effect,base);
});

test('Phase 2 DoT death explodes each lava larva exactly once',t=>{
  const {room,player,events}=mechanismBattle(t,[EXCLUSIVE_MINIONS[0],EXCLUSIVE_MINIONS[0]]);
  for(const larva of room.enemies){larva.hp=1;larva.poisonTurns=1;larva.poisonDmg=2;}
  room.executeRoundStart();
  const results=resolutionQueue(events).flatMap(s=>s.results||[]).filter(r=>r.actionId==='焦油自爆'&&r.kind==='damage');
  assert.equal(results.length,2);assert.equal(new Set(results.map(r=>r.sourceId)).size,2);
  const hp=player.hp;const again=[];drainEnemyEvents(room,again);assert.equal(player.hp,hp);assert.equal(again.length,0);
});

test('Phase 2 crystal reflection caps its hit and cannot react twice to one action',t=>{
  const {room,enemy,player}=mechanismBattle(t,[ENCOUNTERS[8],EXCLUSIVE_MINIONS[8]]);
  mechanismRound(room,1);
  const hit={sourceId:player.id,results:[{kind:'damage',targetEnemyId:enemy.instanceId,damageType:'physical',targetBefore:{hp:100},targetAfter:{hp:50}}]};
  const hp=player.hp;afterPlayerDamage(room,hit);const after=player.hp;
  assert.ok(hp-after>0&&hp-after<=ENEMY_BALANCE.crystalReflectCap);
  afterPlayerDamage(room,hit);assert.equal(player.hp,after);
  afterPlayerDamage(room,{...hit});assert.equal(player.hp,after);
  room.enemies[1].hp=0;sweepEnemyDeaths(room);assert.equal(enemy.crystalSupport,false);
});

test('Phase 2 frost, shield decay, acid defense and curses are temporary and cleansable',t=>{
  const {room,player,enemy}=mechanismBattle(t,[EXCLUSIVE_MINIONS[5],EXCLUSIVE_MINIONS[5]]);
  mechanismRound(room,1);actMechanism(room,enemy);actMechanism(room,room.enemies[1]);
  assert.equal(enemyEffect(room,player,'frost').value,2);
  player.action='basic';beforePlayerAction(room,player);
  assert.equal(beforeEnemyDamage(room,enemy,50,'phys',player),40);assert.equal(enemyEffect(room,player,'frost'),null);
  player.enemyEffects.shield_decay={value:.30,until:room.battleRound+1};
  room.p8GrantShield(player,10,1);assert.equal(player.tempHp,7);
  player.enemyEffects.acid_defense={value:.20,until:room.battleRound+1};player.DEF=20;
  assert.equal(resolveStats(player).DEF,16);
  room.clearPlayerDebuffs(player);assert.deepEqual(player.enemyEffects,{});assert.equal(resolveStats(player).DEF,20);
});

test('Phase 2 shield devouring and parasite healing use actual capped values',t=>{
  const {room,enemy,player}=mechanismBattle(t,[ENCOUNTERS[6],EXCLUSIVE_MINIONS[6]]);
  mechanismRound(room,3);enemy.hp=50;player.tempHp=10;
  const queue=actMechanism(room,enemy);
  const devour=queue.flatMap(s=>s.results).find(r=>r.actionId==='吞噬護盾');
  assert.equal(devour.targetBefore.tempHp-devour.targetAfter.tempHp,3);
  assert.equal(queue.flatMap(s=>s.results).find(r=>r.actionId==='暴食回復').actualHeal,3);
  mechanismRound(room,4);actMechanism(room,room.enemies[1]);
  player.hp-=100;const before=enemy.hp;room.applyHealCapped(player,40);assert.equal(enemy.hp-before,4);
  enemy.hp=0;sweepEnemyDeaths(room);room.applyHealCapped(player,40);assert.equal(enemy.hp,0);
});

test('Phase 2 abyss scripts preserve exact attack values and four independent cuts',t=>{
  t.mock.method(Math,'random',()=>.99);
  for(const role of ['warrior','archer','assassin','samurai','stargazer']) {
    const {room,enemy,player}=mechanismBattle(t,[ABYSS_BOSSES[role]]);
    mechanismRound(room,3);const hp=player.hp,queue=actMechanism(room,enemy),script=enemy.script;
    const expected=script.specialMultiHits?script.specialMultiHits*script.specialHitDamage:script.specialDamage;
    assert.equal(hp-player.hp,expected,role);
    if(role==='samurai')assert.equal(queue.flatMap(s=>s.results).filter(r=>r.kind==='damage'&&r.targetId===player.id).length,4);
    if(role==='warrior')assert.equal(enemy.tempHp,Math.floor(enemy.hp*.30));
  }
});

test('Phase 2 abyss lifesteal excludes shields, Bard heals 10%, and alchemist cleanses',t=>{
  t.mock.method(Math,'random',()=>.99);
  for(const role of ['mage','bard','alchemist']) {
    const {room,enemy,player}=mechanismBattle(t,[ABYSS_BOSSES[role]]);
    mechanismRound(room,3);enemy.hp=20;const hp=enemy.hp;
    if(role==='mage')player.tempHp=100;
    if(role==='alchemist'){enemy.poisonTurns=2;enemy.talismans=['drain'];}
    actMechanism(room,enemy);
    assert.equal(enemy.hp-hp,role==='mage'?0:Math.floor(enemy.maxHp*(role==='bard'?.10:.05)));
    if(role==='alchemist'){assert.equal(enemy.poisonTurns,0);assert.deepEqual(enemy.talismans,[]);}
  }
});

test('Phase 2 assassin immunity includes DoT and Sage uses the official two-round equation',t=>{
  const f=mechanismBattle(t,[ABYSS_BOSSES.assassin]);mechanismRound(f.room,3);
  assert.equal(beforeEnemyDamage(f.room,f.enemy,100,'true'),0);assert.equal(f.enemy.untargetableThisRound,true);
  f.enemy.poisonTurns=1;f.enemy.poisonDmg=100;const hp=f.enemy.hp;f.room.executeRoundStart();assert.equal(f.enemy.hp,hp);
  const {room,enemy,player}=mechanismBattle(t,[ABYSS_BOSSES.sage]);
  mechanismRound(room,1);mechanismRound(room,2);assert.equal(enemy.mechanics.error,12);
  const old=player.hp;actMechanism(room,enemy);assert.equal(old-player.hp,22);assert.equal(enemy.mechanics.error,0);
});

test('Phase 2 abyss druid announces transformation for the next round',t=>{
  t.mock.method(Math,'random',()=>0);
  const {room,enemy,player}=mechanismBattle(t,[ABYSS_BOSSES.druid]);
  mechanismRound(room,3);const hp=player.hp;actMechanism(room,enemy);assert.equal(player.hp,hp);
  assert.equal(enemy.mechanics.transformRound,4);mechanismRound(room,4);
  assert.equal(enemy.mechanics.form,'werewolf');assert.ok(player.hp<hp);
});

test('Phase 2 marked attacks respect grace, treant guards and summon interception',t=>{
  for(const guard of ['paladin','druid','summon']) {
    const f=fixture(t,'warrior');f.room.addPlayer({id:'guard',join(){},emit(){}},'Guard');f.room.selectRole('guard',guard==='summon'?'druid':guard);
    f.room.handleBattleEvent(null,false,{col:1});f.room.setEnemies([f.room.createEnemyInstance(GENERAL_MINIONS[1],0,{tier:'MINION',rng:()=>0})]);
    const {room,player}=f,ally=room.players.guard;player.DEF=0;ally.DEF=0;
    if(guard==='paladin')ally.paladinGrace={interceptedDamage:0};
    if(guard==='druid')ally.druidForm='treant';
    if(guard==='summon')ally.minions=[{id:'guard-minion',type:'treant',hp:100,maxHp:100}];
    mechanismRound(room,1);const hp=player.hp,other=ally.hp;actMechanism(room,room.enemies[0]);
    if(guard==='paladin'||guard==='summon')assert.equal(player.hp,hp);
    if(guard==='druid'){assert.ok(ally.hp<other);assert.ok(player.hp<hp);}
  }
});

test('Phase 2 crossbow aims before selection, fires next round, and mimic stays open for counterplay',t=>{
  const {room,enemy,player}=mechanismBattle(t,[GENERAL_MINIONS[2]]);
  mechanismRound(room,1);assert.equal(enemy.mechanics.targetId,player.id);
  assert.ok(room.getHpSnapshot().players[0].statuses.some(s=>s.id==='mark_'+enemy.instanceId));
  const before=player.hp;actMechanism(room,enemy);const normal=before-player.hp;
  mechanismRound(room,2);const old=player.hp;actMechanism(room,enemy);assert.ok(old-player.hp>normal);
  const f=mechanismBattle(t,[SPECIAL_ELITES.treasure_mimic]);mechanismRound(f.room,1);
  assert.equal(beforeEnemyDamage(f.room,f.enemy,100,'mag'),70);actMechanism(f.room,f.enemy);
  mechanismRound(f.room,2);assert.equal(f.enemy.mechanics.open,true);assert.equal(beforeEnemyDamage(f.room,f.enemy,100,'phys'),100);
  assert.ok(getBossResistance(f.enemy,'physical')<f.enemy.resistances.physical);
  f.enemy.stunnedNextTurn=true;actMechanism(f.room,f.enemy);mechanismRound(f.room,3);assert.equal(f.enemy.mechanics.open,false);
});

test('Phase 2 heat, charge, sacrifice and wolf support are bounded and removed on elite death',t=>{
  const {room}=mechanismBattle(t,[ENCOUNTERS[9],EXCLUSIVE_MINIONS[9],EXCLUSIVE_MINIONS[9]]);
  mechanismRound(room,1);const [boss,a,b]=room.enemies;actMechanism(room,a);actMechanism(room,b);
  assert.equal(boss.mechanics.heat,2);assert.equal(boss.mechanics.extraCharge,1);
  const queue=mechanismRound(room,3);actMechanism(room,boss);assert.equal(boss.mechanics.heat,0);
  const f=mechanismBattle(t,[ENCOUNTERS[1],EXCLUSIVE_MINIONS[1]]);mechanismRound(f.room,1);
  f.room.enemies[0].hp=0;sweepEnemyDeaths(f.room);const solo=actMechanism(f.room,f.room.enemies[1]);
  assert.ok(!solo.some(s=>s.actionId==='協同狩獵'));
  const blood=mechanismBattle(t,[ENCOUNTERS[3],EXCLUSIVE_MINIONS[3]]);blood.room.enemies[1].hp=2;mechanismRound(blood.room,1);
  assert.equal(blood.room.enemies[1].hp,2);assert.equal(blood.enemy.tempHp,0);
});

test('Phase 2 abyss death arena isolates both sides, expires and clears on combat reset',t=>{
  const f=fixture(t,'warrior');f.room.addPlayer({id:'ally',join(){},emit(){}},'Ally');f.room.selectRole('ally','mage');
  f.room.handleBattleEvent(null,false,{col:1});const room=f.room;
  room.setEnemies([room.createEnemyInstance(ABYSS_BOSSES.gladiator,0,{tier:'ABYSS'}),room.createEnemyInstance(ABYSS_MINIONS[1],1,{tier:'MINION'})]);
  mechanismRound(room,3);actMechanism(room,room.enemies[0]);
  assert.ok(room.enemyArena);assert.equal(room.getHpSnapshot().arena.enemyForced,true);
  assert.equal(room.getTargetEnemy(room.enemies[1].instanceId),room.enemies[0]);
  const before=Object.values(room.players).map(p=>p.hp);const outside=actMechanism(room,room.enemies[1]);
  assert.equal(outside.length,0);assert.deepEqual(Object.values(room.players).map(p=>p.hp),before);
  mechanismRound(room,4);assert.ok(room.enemyArena);
  room.startSkillSelection();
  for(const p of Object.values(room.players))if(p.id!==room.enemyArena.playerId){assert.equal(p.isLocked,true);assert.equal(p.action,'skip');}
  mechanismRound(room,5);assert.equal(room.enemyArena,null);
  f.player.enemyEffects={unrest:{until:100,value:1}};room.p8ResetBattle();assert.deepEqual(f.player.enemyEffects,{});
});

test('Phase 2 abyss curses execute all three official outcomes and cooldown snapshots are explicit',t=>{
  for(const roll of [0,.4,.99]) {
    t.mock.method(Math,'random',()=>roll);
    const {room,enemy,player}=mechanismBattle(t,[ABYSS_BOSSES.onmyoji]);mechanismRound(room,3);actMechanism(room,enemy);
    const curse=enemy.script.specialApplyPlayerCurse[Math.floor(roll*3)];assert.ok(enemyEffect(room,player,curse));
    if(curse==='seal_zero')assert.equal(beforeEnemyDamage(room,enemy,50,'phys',player),0);
    room.clearPlayerDebuffs(player);assert.equal(enemyEffect(room,player,curse),null);
    t.mock.restoreAll();
  }
  const {room,enemy,player}=mechanismBattle(t,[ABYSS_BOSSES.stargazer]);player.cooldowns.w_shield=2;mechanismRound(room,3);
  const queue=actMechanism(room,enemy),result=queue.flatMap(s=>s.results).find(r=>r.kind==='status'&&r.targetId===player.id);
  assert.equal(result.targetBefore.cooldowns.w_shield,2);assert.equal(result.targetAfter.cooldowns.w_shield,3);
});

test('Phase 2 enemy shield absorption is separate from HP in real player attack results',t=>{
  const {room,enemy,player,events}=mechanismBattle(t,[ENCOUNTERS[2]],'mage');
  enemy.tempHp=100;player.action='basic';room.resolveTurnActions();
  const action=resolutionQueue(events).find(s=>s.type==='player_action'&&s.sourceId===player.id&&s.actionId==='basic');
  const hit=action.results.find(r=>r.kind==='damage'&&r.targetEnemyId===enemy.instanceId);
  assert.equal(hit.actualHpDamage,0);assert.ok(hit.actualAbsorbed>0);
  assert.equal(hit.actualDamage,hit.actualAbsorbed);
  assert.equal(hit.targetBefore.tempHp-hit.targetAfter.tempHp,hit.actualAbsorbed);
});

test('Phase 2 warrior reflection can kill a larva without duplicate death bursts',t=>{
  const {room,enemy,player,events}=mechanismBattle(t,[EXCLUSIVE_MINIONS[0]]);
  enemy.hp=1;player.action='skip';room.p8Effect(player,'warrior_resolve','堅定',3,{icon:'guard'});
  room.resolveTurnActions();
  assert.equal(enemy.hp,0);
  const bursts=resolutionQueue(events).flatMap(s=>s.results||[]).filter(r=>r.actionId==='焦油自爆'&&r.kind==='damage');
  assert.equal(bursts.length,1);
});

for(const [template,round,statusId] of [
  [ENCOUNTERS[0],3,'ember'],[ENCOUNTERS[4],3,'shield_decay'],[ENCOUNTERS[5],3,'frost'],
  [EXCLUSIVE_MINIONS[4],1,'acid_defense'],[EXCLUSIVE_MINIONS[6],1,'parasite'],
  [EXCLUSIVE_MINIONS[7],1,'unrest'],[EXCLUSIVE_MINIONS[9],1,'ember']
])test('Phase 2 successful hit applies its real cleansable effect: '+template.name,t=>{
  const {room,enemy,player}=mechanismBattle(t,[template]);mechanismRound(room,round);
  actMechanism(room,enemy);assert.ok(enemyEffect(room,player,statusId));
  const effect=enemyEffect(room,player,statusId);assert.equal(effect.sourceId,enemy.instanceId);
  room.clearPlayerDebuffs(player);assert.equal(enemyEffect(room,player,statusId),null);
});

test('Phase 2 merchant bounty keeps its visible target until its configured refresh',t=>{
  const f=fixture(t);f.room.addPlayer({id:'other',join(){},emit(){}},'Other');f.room.selectRole('other','mage');f.room.handleBattleEvent(null,false,{col:1});
  const room=f.room;room.setEnemies([room.createEnemyInstance(SPECIAL_ELITES.shady_merchant,0,{tier:'ELITE'})]);
  const other=room.players.other;other.hp=1;mechanismRound(room,1);const enemy=room.enemies[0];assert.equal(enemy.mechanics.targetId,other.id);
  other.hp=other.maxHp;f.player.hp=1;mechanismRound(room,2);assert.equal(enemy.mechanics.targetId,other.id);
  mechanismRound(room,4);assert.equal(enemy.mechanics.targetId,f.player.id);
});

test('Phase 2 blood sacrifice gives a real bounded shield, and remnant bonus is flat',t=>{
  const {room}=mechanismBattle(t,[ENCOUNTERS[3],EXCLUSIVE_MINIONS[3]]);const [boss,minion]=room.enemies,hp=minion.hp;
  const queue=mechanismRound(room,1);assert.equal(minion.hp,hp-2);assert.equal(boss.tempHp,4);
  assert.ok(queue.flatMap(s=>s.results).some(r=>r.actionId==='獻祭護盾'&&r.actualShield===4));
  const f=mechanismBattle(t,[ABYSS_MINIONS[0]]);mechanismRound(f.room,1);let before=f.player.hp;actMechanism(f.room,f.enemy);const normal=before-f.player.hp;
  mechanismRound(f.room,2);f.player.enemyEffects.unrest={value:1,until:3,sourceId:f.enemy.instanceId};before=f.player.hp;actMechanism(f.room,f.enemy);
  assert.equal(before-f.player.hp-normal,ENEMY_BALANCE.remnantBonus);
});

test('Phase 2 true damage bypasses mitigation, while guard and immunity still have explicit outcomes',t=>{
  const {room,enemy,player}=mechanismBattle(t,[ABYSS_BOSSES.stargazer]);mechanismRound(room,1);
  player.DEF=1000;player.isCrouchedThisRound=true;player.alcPotionDefTurns=1;room.p8Effect(player,'warrior_resolve','堅定',2);
  const before=player.hp;actMechanism(room,enemy);assert.equal(before-player.hp,9);
  const f=mechanismBattle(t,[ABYSS_BOSSES.samurai]);mechanismRound(f.room,3);f.enemy.sealedThisRound=true;
  const hp=f.player.hp,queue=actMechanism(f.room,f.enemy);assert.equal(f.player.hp,hp);assert.equal(queue[0].results[0].outcome.type,'blocked');
});
