import { DEV_ENEMIES } from './DevEncounter.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActionResults, normalizeCombatQueue, snapshotTarget, sequenceAugurDamageResults } from './combat-schema.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Room } from './Room.js';
import { ABYSS_BOSS_PORTRAITS, ABYSS_DRUID_FORM_PORTRAITS, ABYSS_AUGUR_EASTER_EGG, TIER1_EQUIPMENTS } from './constants.js';
import { ENCOUNTERS, EXCLUSIVE_MINIONS, GENERAL_MINIONS, ABYSS_MINIONS, SPECIAL_ELITES, ABYSS_BOSSES } from './constants.js';
import { ENEMY_BALANCE, mechanicId, enemyRoundStart, drainEnemyEvents, runEnemyAction, beforePlayerAction, beforeEnemyDamage, afterPlayerDamage, sweepEnemyDeaths, enemyEffect, syncEnemySupport } from './enemy-mechanics.js';
import { getBossResistance } from './boss-resistance.js';
import { resolveStats } from './stats.js';
import { enemyPresentationInfo } from './enemy-mechanics.js';

test('Sage feedback follows the battlefield actor and selected enemy in both phases',async()=>{
  const scope={innerWidth:1440,innerHeight:810,getBattleEffectAnchor:()=>({rect:{width:75,height:85}})};vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/sage-skill-presentation.js',import.meta.url),'utf8'),scope);
  for(const phase of ['hypothesis','solve'])for(const actionId of ['basic','sge_deduce','sge_induce']){
    const actor={x:840,y:680},enemy={x:1100,y:260},renderers=[],positions=[];
    const stage={local:{sourceId:'actor',battlefield:true},anchors:new Map([['actor',actor],['monster',enemy]]),
      root:{dataset:{}},signal:{aborted:false},reduced:false,
      el:(tag,className)=>({className,style:{},remove(){this.removed=true;}}),
      position:(node,x,y)=>{node.x=x;node.y=y;positions.push({node,x,y});},
      startRenderer:render=>{renderers.push(render);render();},animate(){},wait:async()=>{},
      tick:async(ms,render)=>{render(0);render(1);}};
    const anchor=scope.sageOperandAnchor(stage,17);
    await scope.sageOperandFeedback(stage,{sourceId:'actor',actionId},{sagePhase:phase,operandBefore:17,operandAfter:26,operandDelta:9,actualDamage:9},anchor);
    assert.equal(anchor.number.textContent,actionId==='sge_induce'&&phase==='hypothesis'?'17':'26');
    const ghost=positions.find(p=>p.node.className==='sage-skill-damage-ghost');
    if(ghost){assert.deepEqual([ghost.x,ghost.y],[enemy.x,enemy.y]);assert.equal(ghost.node.removed,true);}
    actor.x=520;actor.y=550;renderers.forEach(render=>render());
    assert.deepEqual([anchor.node.x,anchor.node.y],[520,450]);
    for(const p of positions.filter(p=>p.node.className==='sage-momentum-cue'))assert.notEqual(p.x,260);
  }
});

test('Painted archer projectile leaves the bow and tracks a moving concrete target',async()=>{
  for(const reduced of [false,true]){
    const nodes=[],target={x:950,y:220};
    class Node{constructor(){this.children=[];this.style={};nodes.push(this);}appendChild(n){this.children.push(n);}setAttribute(){}remove(){this.removed=true;}}
    const scope={innerWidth:1440,innerHeight:900,AMMO_IMAGES:{},document:{createElement:()=>new Node()},
      getBattleEffectAnchor:id=>id==='enemy_2'?target:{x:200,y:600}};
    vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/player-battlefield.js',import.meta.url),'utf8'),scope);
    const positions=[],s={root:new Node(),reduced,tick:async(ms,render)=>{
      render(0);positions.push({...nodes[1].style});target.x=1080;target.y=310;render(1);positions.push({...nodes[1].style});
    }};
    await scope.battlefieldProjectile(s,'hero','enemy_2','arrow',{getBoundingClientRect:()=>({left:300,top:400,width:400,height:300})});
    assert.equal(nodes[2].src,'/assets/combat-fx/archer/magic-arrow.png');
    assert.deepEqual([positions[0].left,positions[0].top],reduced?['950px','220px']:['400px','511px']);
    assert.deepEqual([positions[1].left,positions[1].top],['1080px','310px']);
    assert.equal(nodes[1].removed,true);
  }
});


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
for(const [role,actions] of Object.entries({warrior:['basic','w_strike','w_shield'],mage:['basic','m_blast','m_drain'],assassin:['basic','s_stab','s_smoke'],bard:['basic','b_heal','b_buff'],paladin:['basic','pal_glory','pal_grace'],alchemist:['basic','alc_flask','alc_fate'],archer:['basic','a_rain','a_shot'],stargazer:['basic','sg_observe','sg_clock'],dreamweaver:['basic','dw_butterfly','dw_false_dream'],samurai:['basic','sa_cut','sa_tsubame'],sage:['basic','sge_deduce','sge_induce'],augur:['basic','aug_bind','aug_reckon'],onmyoji:['basic','onm_talisman','onm_detonate'],gladiator:['basic','g_sacrifice','g_arena'],druid:['basic','dru_transform','dru_summon_wolf','dru_summon_treant']})){
  for(const action of actions)test('Phase 4 production battlefield dispatch: '+role+' '+action,t=>{
    const {room,player,events}=phase1Battle(t,role);t.mock.method(Math,'random',()=>.5);
    if(action==='sa_tsubame')player.soul=8;
    if(action==='dw_butterfly')player.targetPlayerId=player.id;
    if(action==='aug_bind')player.targetPlayerId=player.id;
    player.action=action;room.resolveTurnActions();
    const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId===action);
    assert.ok(step,action);
    // Dream declarations establish deferred server state; they need not invent
    // immediate results. Their later *_result event owns the actual outcome.
    if(!['dw_butterfly','dw_false_dream'].includes(action))assert.ok(step.results?.length);
    if(action==='dw_false_dream')assert.ok(resolutionQueue(events).some(s=>s.actionId===action+'_result'&&s.results.length));
    const scope={};vm.createContext(scope);
    vm.runInContext(readFileSync(new URL('../public/player-battlefield.js',import.meta.url),'utf8'),scope);
    assert.equal(scope.isBattlefieldPlayerStep(step),true);
    for(const r of step.results){assert.notEqual(r.targetId,'monster');assert.ok(r.resultId&&r.targetBefore&&r.targetAfter);}
    if(action==='dw_butterfly')assert.equal(scope.battlefieldPlayerTarget(step),player.id);
    if(role==='samurai'){
      vm.runInContext(readFileSync(new URL('../public/presentation-core.js',import.meta.url),'utf8').split('function battlefieldAnchor')[1].replace(/^/,'function battlefieldAnchor'),scope);
      vm.runInContext(readFileSync(new URL('../public/samurai-presentation.js',import.meta.url),'utf8'),scope);
      const plan=scope.buildSamuraiPresentationPlan(scope.adaptLegacyPresentationStep(step),{});
      const hits=step.results.filter(r=>r.kind==='damage'&&r.targetEnemyId===player.targetEnemyId);
      assert.equal(plan.hits.length,hits.length);assert.equal(plan.slashes.length,plan.hits.filter(h=>!['miss','dodge'].includes(h.result.outcome?.type)).length);
    }
  });
}
test('Phase 4 crossbow bolts retain their actual ammo type and independent result',t=>{
  const {room,player,events}=phase1Battle(t,'archer');player.equips=[{id:'a_crossbow',name:'改良型重弩'}];
  player.ammo=['pierce','elemental','burst'];player.action='basic';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceRole==='archer'&&s.actionId==='basic');
  const bolts=step.results.filter(r=>r.ammoType);
  assert.deepEqual(bolts.map(r=>r.ammoType),['pierce','elemental','burst']);
  assert.equal(new Set(bolts.map(r=>r.resultId)).size,3);
});
for(const [roll,outcome] of [[.1,'star'],[.65,'planet'],[.75,'galaxy'],[.85,'blackhole'],[.95,'boundary']])test('Phase 4 actual observation branch owns its concrete targets: '+outcome,t=>{
  const {room,player,events}=phase1Battle(t,'stargazer');t.mock.method(Math,'random',()=>roll);
  player.action='sg_observe';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='sg_observe');
  assert.equal(step.outcome.type,outcome);
  assert.equal(new Set(step.results.map(r=>r.resultId)).size,step.results.length);
  assert.ok(step.results.every(r=>r.targetId!=='monster'&&r.targetBefore&&r.targetAfter));
  if(outcome==='blackhole')assert.deepEqual(step.results.filter(r=>r.kind==='damage').map(r=>r.targetId),[player.targetEnemyId,player.id]);
  if(outcome==='boundary')assert.ok(step.results.some(r=>r.targetId===player.id&&r.targetAfter.statuses.some(s=>s.id==='boundary')));
  if(outcome==='galaxy')assert.ok(!step.results.some(r=>r.kind==='damage'));
});
for(const [roll,outcome] of [[.1,'accelerate'],[.75,'reset'],[.85,'overload'],[.95,'nothing']])test('Phase 4 actual clock branch preserves authoritative cooldowns: '+outcome,t=>{
  const {room,player,events}=phase1Battle(t,'stargazer');t.mock.method(Math,'random',()=>roll);
  player.action='sg_clock';player.cooldowns.sg_observe=3;room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='sg_clock');
  assert.equal(step.outcome.type,outcome);assert.ok(!step.results.some(r=>r.kind==='damage'));
  // The common cooldown owner settles after all player actions. The cast's
  // intermediate snapshot must stay unchanged until that authoritative update.
  assert.equal(step.hpSnapshot.players.find(p=>p.id===player.id).cooldowns.sg_observe,3);
  const state=events.filter(e=>e[0]==='room:update').at(-1)?.[1];
  assert.ok(state);assert.equal(state.players.find(p=>p.id===player.id).cooldowns.sg_observe,player.cooldowns.sg_observe);
});
for(const dot of ['poison','burn','fracture','chill'])test('Phase 4 reagent branch never invents immediate ally damage: '+dot,t=>{
  const {room,player,events}=phase1Battle(t,'alchemist');player.rolledFlaskDot=dot;player.rollTeamDot=true;player.action='alc_flask';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='alc_flask');
  assert.equal(step.outcome.type,'alchemy_'+dot);
  assert.ok(step.results.some(r=>r.targetEnemyId===player.targetEnemyId&&r.kind==='damage'));
  assert.ok(!step.results.some(r=>r.targetId===player.id&&r.kind==='damage'));
});
for(const branch of ['stable','success','failure'])test('Phase 4 fate synthesis uses actual healing and cleansing: '+branch,t=>{
  const {room,player,events}=phase1Battle(t,'alchemist');player.hp=10;player.action='alc_fate';
  if(branch!=='stable'){player.poisonTurns=2;player.poisonDmg=1;}
  t.mock.method(Math,'random',()=>branch==='success'?.1:.99);room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='alc_fate');
  if(branch!=='stable')assert.equal(step.outcome.type,'alchemy_'+branch);
  assert.ok(step.results.some(r=>r.kind==='heal'&&r.targetId===player.id&&r.actualHeal>0));
  assert.ok(!step.results.some(r=>r.kind==='damage'||r.kind==='shield'));
  assert.ok(step.results.every(r=>r.targetAfter.statuses.every(s=>s.id!=='poison')));
});
test('Phase 4 lethal Tsubame never creates the remaining three visual hits',t=>{
  const {room,player,events}=phase1Battle(t,'samurai',1);player.soul=8;player.action='sa_tsubame';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='sa_tsubame');
  const scope={};vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/presentation-core.js',import.meta.url),'utf8').split('function battlefieldAnchor')[1].replace(/^/,'function battlefieldAnchor'),scope);
  vm.runInContext(readFileSync(new URL('../public/samurai-presentation.js',import.meta.url),'utf8'),scope);
  const plan=scope.buildSamuraiPresentationPlan(scope.adaptLegacyPresentationStep(step),{});
  assert.equal(plan.hits.length,1);assert.equal(plan.slashes.length,1);
});
test('Phase 4 parry and counter remain separate actual reactions with concrete targets',t=>{
  const {room,player,events}=phase1Battle(t,'samurai');t.mock.method(Math,'random',()=>0);room.checkDodge=()=>false;
  player.action='skip';room.resolveTurnActions();const queue=resolutionQueue(events);
  assert.ok(queue.flatMap(s=>s.results).some(r=>r.targetId===player.id&&r.outcome?.parry));
  const counters=queue.filter(s=>s.sourceId===player.id&&s.actionId==='sa_counter');assert.equal(counters.length,1);
  assert.ok(counters[0].results.every(r=>r.targetId!=='monster'&&r.resultId&&r.targetBefore&&r.targetAfter));
});
test('Phase 4 dream target picker submits each living instance and respects arena isolation',t=>{
  const {room,player}=phase1Battle(t,'dreamweaver');let targets;
  const state={...room.getClientState(),isNarrating:false,selectionState:'SELECTING'};
  const scope={roomState:state,isPlayingBattleNarrative:false,openTargetModal:(type,list)=>{assert.equal(type,'dream');targets=list;}};
  vm.createContext(scope);
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext('function handleSkillClick('+source.split('function handleSkillClick(')[1].split('// 目標選擇 Modal')[0],scope);
  scope.handleSkillClick('dw_butterfly',{...player,isLocked:false});
  assert.deepEqual(Array.from(targets,t=>t.id),[player.id,...room.enemies.map(e=>e.instanceId)]);
  const enemyId=targets[2].id;room.selectionState='SELECTING';room.isNarrating=false;
  assert.equal(room.lockAction(player.id,'dw_butterfly',enemyId).success,true);
  assert.equal(player.targetEnemyId,enemyId);assert.equal(player.targetPlayerId,'monster');
  state.enemies[2].hp=0;state.enemyArena={playerId:player.id,enemyId};
  scope.handleSkillClick('dw_butterfly',{...player,isLocked:false});
  assert.deepEqual(Array.from(targets,t=>t.id),[player.id,enemyId]);
});
test('Phase 4 burst recoil follows its actual bolt before the next shot',t=>{
  const {room,player,events}=phase1Battle(t,'archer');player.equips=[{id:'a_crossbow',name:'改良型重弩'}];
  player.ammo=['burst','pierce','burst'];player.action='basic';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceRole==='archer'&&s.actionId==='basic');
  const damage=step.results.filter(r=>r.kind==='damage');
  assert.deepEqual(damage.map(r=>r.targetId),[player.targetEnemyId,player.id,player.targetEnemyId,player.targetEnemyId,player.id]);
  for(const hit of damage.filter(r=>r.targetId===player.id))assert.equal(hit.actualHpDamage,hit.targetBefore.hp-hit.targetAfter.hp);
});
test('Phase 4 arrow traps publish one actual lethal result per enemy',t=>{
  const {room,player,events}=phase1Battle(t,'archer',1);player.action='skip';
  room.arrowTrap={turns:2,atk:14,sourceId:player.id};room.resolveTurnActions();
  const traps=resolutionQueue(events).filter(s=>s.actionId==='a_trap');
  assert.equal(traps.length,3);assert.equal(new Set(traps.map(s=>s.targetEnemyId)).size,3);
  assert.ok(traps.every(s=>s.results[0].actualHpDamage===1&&s.results[0].targetAfter.hp===0));
});
for(const action of ['a_reload','a_frenzy_reload'])test('Phase 4 reload changes actual ammunition without damage: '+action,t=>{
  const {room,player,events}=phase1Battle(t,'archer');player.equips=[{id:'a_crossbow',name:'改良型重弩'}];player.ammo=[];player.action=action;
  room.resolveTurnActions();const step=resolutionQueue(events).find(s=>s.actionId===action);
  assert.ok(step.results.some(r=>r.kind==='reload'&&r.ammoAfter.length>0));
  assert.ok(!step.results.some(r=>r.kind==='damage'));
});
test('Phase 4 battlefield scope owns no portraits and cleans abort, replay and quick playback',async t=>{
  const {room,player,events}=phase1Battle(t,'archer');player.action='a_rain';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.actionId==='a_rain'),roots=[],frames=new Set(),committed=new Set();let clock=0,seq=0;
  class Node{constructor(){this.children=[];this.style={setProperty(){}};this.dataset={};this.classList={add(){},remove(){}};this.hidden=false;}appendChild(n){this.children.push(n);return n;}querySelector(){return null;}querySelectorAll(){return [];}remove(){this.removed=true;}}
  const scope={DOMException,AbortController,innerWidth:1280,innerHeight:720,performance:{now:()=>clock+=50},matchMedia:()=>({matches:false}),document:{body:{appendChild:n=>roots.push(n)},createElement:tag=>{assert.notEqual(tag,'img');return new Node();}},
    getVisualAnchor:id=>({id,x:100,y:200,element:new Node()}),getBattleEffectAnchor:id=>({id,x:100,y:200,element:new Node()}),battleFeedbackEntries:()=>[],positionBattleFeedback(){},resolvePresentationTarget:r=>r.targetId,requestAnimationFrame:()=>{frames.add(++seq);return seq;},cancelAnimationFrame:id=>frames.delete(id),
    presentationFrame:async()=>{},waitForPresentation:async()=>{},createSfxPresentationScope:()=>({hold:async()=>{}}),enemyEventFeedback:()=>'',applyHpSnapshot:()=>{},
    applyAuthoritativeResult:r=>{if(committed.has(r.resultId))return false;committed.add(r.resultId);return true;}};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/player-battlefield.js',import.meta.url),'utf8'),scope);
  const controller=new AbortController();
  const context={signal:controller.signal,speed:4,reducedMotion:true};
  await scope.withBattlefieldSkillStage(step,context,async s=>{assert.ok(context.audioScope);assert.equal(committed.size,0);await s.tick(400,()=>{});await s.resolveResults();await s.resolveResults();});
  assert.equal(committed.size,step.results.length);assert.ok(roots.every(n=>n.removed));assert.equal(frames.size,0);
  await assert.rejects(scope.withBattlefieldSkillStage(step,{signal:controller.signal},async s=>{controller.abort();await s.tick(400,()=>{});}),{name:'AbortError'});
  assert.equal(frames.size,0);assert.ok(roots.every(n=>n.removed));
});
test('Phase 4 Samurai renderer completes real four-hit choreography without a portrait echo or leaked nodes',t=>{
  const {room,player,events}=phase1Battle(t,'samurai');player.soul=8;player.action='sa_tsubame';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='sa_tsubame');
  const canvas=new Proxy({}, {get:()=>()=>({addColorStop(){}})});
  class Node{
    constructor(){this.children=[];this.style={setProperty(){}};this.dataset={};this.classList={add(){},remove(){},toggle(){}};}
    appendChild(node){this.children.push(node);return node;}remove(){this.removed=true;}
    querySelector(){return new Node();}getBoundingClientRect(){return {left:50,top:100,width:100,height:120};}getContext(){return canvas;}
  }
  const actor=new Node(),target=new Node(),scope={devicePixelRatio:1,document:{createElement:()=>new Node()},battlefieldVisualElement:id=>id===player.id?actor:target};
  vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/presentation-core.js',import.meta.url),'utf8').split('function battlefieldAnchor')[1].replace(/^/,'function battlefieldAnchor'),scope);
  vm.runInContext(readFileSync(new URL('../public/samurai-presentation.js',import.meta.url),'utf8'),scope);
  vm.runInContext(readFileSync(new URL('../public/samurai-prototype-fx.js',import.meta.url),'utf8'),scope);
  const plan=scope.buildSamuraiPresentationPlan(scope.adaptLegacyPresentationStep(step),{}),root=new Node();
  const engine=scope.createSamuraiPrototypeRenderer(root,new Node(),new Node(),plan,{battlefield:true,actorId:player.id,targetId:player.targetEnemyId});
  for(const time of [0,240,740,1140,1215,1290,1365,1950]){engine.measure();engine.render(time);engine.reduceFlash();}
  engine.dispose();assert.equal(plan.hits.length,4);
  assert.equal(actor.children.length,0);assert.equal(target.children.length,0);assert.ok(root.children.every(n=>n.removed));
});
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

test('Phase 3 script periods, known targets and four actual cuts are visible before choices',t=>{
  const f=mechanismBattle(t,[ABYSS_BOSSES.sage]);mechanismRound(f.room,2);
  assert.equal(enemyPresentationInfo(f.enemy,f.room).ultimateReady,true);
  assert.equal(enemyPresentationInfo(f.enemy,f.room).period,2);
  const aim=mechanismBattle(t,[GENERAL_MINIONS[2]]);mechanismRound(aim.room,1);
  assert.equal(enemyPresentationInfo(aim.enemy,aim.room).targetId,aim.player.id);
  const samurai=mechanismBattle(t,[ABYSS_BOSSES.samurai]);mechanismRound(samurai.room,3);
  samurai.room.checkDodge=()=>false;
  const hits=actMechanism(samurai.room,samurai.enemy).filter(s=>s.actionId===samurai.enemy.ultName&&s.results[0].kind==='damage');
  assert.deepEqual(hits.map(s=>s.presentation.hitIndex),[1,2,3,4]);
  assert.ok(hits.every(s=>s.presentation.hitCount===4&&s.presentation.isUltimate));
});

test('Phase 3 death feedback precedes support removal and expiry has a concrete target',t=>{
  const {room}=mechanismBattle(t,[ABYSS_BOSSES.warrior,ABYSS_MINIONS[1]]);
  mechanismRound(room,1);room.enemies[1].hp=0;
  const queue=[];drainEnemyEvents(room,queue);
  const death=queue.findIndex(s=>s.results[0].kind==='death');
  const support=queue.findIndex(s=>s.actionId==='支援共鳴更新');
  assert.ok(death>=0&&support>death);
  assert.equal(queue[death].targetEnemyId,room.enemies[1].instanceId);
  const f=mechanismBattle(t,[EXCLUSIVE_MINIONS[7]]);mechanismRound(f.room,1);
  f.player.enemyEffects={unrest:{label:'心神不寧',sourceId:f.enemy.instanceId,value:1,until:1}};
  const end=mechanismRound(f.room,2).find(s=>s.actionId==='心神不寧・結束');
  assert.equal(end.targetId,f.player.id);assert.equal(end.results[0].kind,'cleanse');
});

test('Phase 3 arena event carries its actual participants and visually isolates both teams',t=>{
  const {room,enemy,player}=mechanismBattle(t,[ABYSS_BOSSES.gladiator,ABYSS_MINIONS[0]]);
  mechanismRound(room,3);
  const step=actMechanism(room,enemy).find(s=>s.presentation?.arenaAfter);
  assert.equal(step.presentation.arenaAfter.playerId,player.id);
  assert.equal(step.presentation.arenaAfter.enemyId,enemy.instanceId);
  const h=enemyPresentationHarness(),nodes=[player.id,'other',enemy.instanceId,room.enemies[1].instanceId].map((id,i)=>({dataset:i<2?{playerId:id}:{enemyId:id},classes:new Set(),setAttribute(){},classList:{contains(key){return nodes[i].classes.has(key);},toggle(key,value){if(value)nodes[i].classes.add(key);else nodes[i].classes.delete(key);}}}));
  h.scope.document.querySelectorAll=selector=>selector.includes('teammate-card')?nodes.slice(0,2):nodes.slice(2);
  h.scope.syncEnemyArenaVisual(step.presentation.arenaAfter);
  assert.equal(nodes[0].classes.size,0);assert.ok(nodes[1].classes.has('arena-absent'));
  assert.equal(nodes[2].classes.size,0);assert.ok(nodes[3].classes.has('enemy-arena-absent'));
  h.scope.syncEnemyArenaVisual(null);assert.ok(nodes.every(n=>n.classes.size===0));
});
test('Phase 3 druid transforms at its recorded event and assassin immunity has an ending cue',t=>{
  const {room,enemy}=mechanismBattle(t,[ABYSS_BOSSES.druid]);
  mechanismRound(room,3);actMechanism(room,enemy);
  const step=mechanismRound(room,4).find(s=>['狼人變形','遠古樹精變形'].includes(s.actionId));
  assert.ok(step);assert.notEqual(step.results[0].targetBefore.mechanics.form,step.results[0].targetAfter.mechanics.form);
  const f=mechanismBattle(t,[ABYSS_BOSSES.assassin]);mechanismRound(f.room,3);
  assert.ok(mechanismRound(f.room,4).some(s=>s.actionId==='虛無暗影步・結束'));
});
test('Phase 3 shield-only hits, cleanses and misses do not imply a life hit or a new mark',t=>{
  const {room,enemy,player}=mechanismBattle(t,[ABYSS_BOSSES.stargazer]);
  mechanismRound(room,1);player.tempHp=48;room.checkDodge=()=>false;
  const queue=actMechanism(room,enemy);normalizeCombatQueue(queue,'shield-feedback');
  const step=queue.find(s=>s.results.some(r=>r.actualAbsorbed>0)),result=step.results.find(r=>r.actualAbsorbed>0);
  const h=enemyPresentationHarness(),text=h.scope.enemyEventFeedback(result,step);
  assert.equal(result.actualHpDamage,0);assert.match(text,/🛡 -/);assert.doesNotMatch(text,/生命|護盾|回合/);
  assert.equal(h.scope.enemyEventShape({kind:'cleanse'},{actionId:'來源死亡・標記解除'},['','claw']),'cleanse');
  assert.equal(h.scope.enemyEventShape({kind:'damage',outcome:{type:'dodge'}},{},['','heavy']),'evade');
});

// DOM doubles exercise lifecycle only; every event and amount below comes from
// the actual enemy factory / settlement, not a hand-authored presentation queue.
function enemyPresentationHarness() {
  const roots=[],commits=[],waits=[],frames=new Set();let frameId=0,clock=0;
  class Node {
    constructor(){this.children=[];this.dataset={};this.style={setProperty(){}};this.classList={add(){}};this.isConnected=true;this.hidden=false;}
    appendChild(n){this.children.push(n);return n;}
    setAttribute(){}
    querySelector(){return null;}
    replaceChildren(...nodes){this.children=nodes;}
    remove(){this.isConnected=false;}
    getBoundingClientRect(){return {left:100,right:180,top:150,width:80,height:90,bottom:240};}
    animate(){return {cancel(){},finished:Promise.resolve()};}
  }
  const actor=new Node();
  const scope={DOMException,innerWidth:900,innerHeight:700,performance:{now:()=>clock},document:{body:{appendChild:n=>roots.push(n)},createElement:()=>new Node(),createElementNS:()=>new Node(),getElementById:id=>roots.find(n=>n.id===id&&n.isConnected),querySelectorAll:()=>[]},
    requestAnimationFrame:()=>{frames.add(++frameId);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
    appliedBattleResults:new Set(),getVisualAnchor:id=>({id,element:actor,x:140,y:195}),getEnemyAnchor:()=>null,
    resolvePresentationTarget:r=>r.targetId,
    applyAuthoritativeResult:r=>{if(scope.appliedBattleResults.has(r.resultId))return false;scope.appliedBattleResults.add(r.resultId);commits.push(r);return true;},
    waitForPresentation:async(ms,signal,speed)=>{clock+=ms/(speed||1);waits.push({ms,speed});if(signal?.aborted)throw new DOMException('cancelled','AbortError');}};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/enemy-presentation.js',import.meta.url),'utf8'),scope);
  return {scope,roots,commits,waits,frames};
}
test('Battle feedback keeps shield and HP as separate short authoritative values',()=>{
  const {scope}=enemyPresentationHarness();
  const entries=scope.battleFeedbackEntries({actualHpDamage:18,actualAbsorbed:10,targetAfter:{statuses:[{label:'不得出現在數字旁的完整狀態',turns:9}]}});
  assert.deepEqual(Array.from(entries,e=>e.text),['-18','🛡 -10']);
  assert.deepEqual(Array.from(scope.battleFeedbackEntries({kind:'heal',actualHeal:20,actualShield:8}),e=>e.text),['+12','🛡 +8']);
  assert.equal(scope.enemyEventFeedback({kind:'status',targetAfter:{statuses:[{label:'充能',value:2}]}},{skillName:'不應重複的技能名'}),'');
  assert.equal(scope.enemyEventFeedback({outcome:{type:'dodge'}}),'MISS');assert.equal(scope.enemyEventFeedback({outcome:{type:'immune'}}),'免疫');
});
test('Enemy strip caps three icons while the existing tooltip keeps full statuses and resources',t=>{
  const {room,enemy}=mechanismBattle(t,[ENCOUNTERS[2]]);mechanismRound(room,1);mechanismRound(room,2);
  enemy.poisonTurns=2;enemy.burnTurns=2;enemy.fractureTurns=3;enemy.chillTurns=2;
  const en=room.formatEnemySnapshot(enemy),h=enemyPresentationHarness(),node=h.scope.document.createElement('div'),row=h.scope.document.createElement('div');
  node.classList={toggle(){}};node.querySelector=selector=>selector==='.enemy-status-row'?row:null;
  h.scope.getIconSvg=()=>'<svg></svg>';h.scope.syncEnemyMechanicVisual(en,node);
  const strip=row.children[0];assert.equal(strip.children.length,4);assert.equal(strip.children[3].textContent,'+1');
  const tooltip=h.scope.document.createElement('div');tooltip.classList={add(){}};
  Object.assign(h.scope,{elements:{floatingEnemyTooltip:tooltip},roomState:{battleRound:2},escapeHtml:s=>String(s??''),positionFloatingTooltip(){}});
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');vm.runInContext('function showEnemyTooltip('+app.split('function showEnemyTooltip(')[1].split('function hideEnemyTooltip')[0],h.scope);
  h.scope.showEnemyTooltip(en,node);
  for(const label of ['POISON','BURN','FRACTURE','CHILL','能源核心','反制','效抗'])assert.ok(tooltip.innerHTML.includes(label),label);
  assert.ok(tooltip.innerHTML.includes('2/2'));assert.ok(tooltip.innerHTML.includes('3 回合'));
});
test('A four-hit ultimate shows one central name while committing all four actual hits',async t=>{
  const {room,enemy}=mechanismBattle(t,[ABYSS_BOSSES.samurai]);mechanismRound(room,3);room.checkDodge=()=>false;
  const queue=actMechanism(room,enemy);normalizeCombatQueue(queue,'one-ultimate-cue');
  const h=enemyPresentationHarness(),context={signal:new AbortController().signal,reducedMotion:true};
  for(const step of queue)await h.scope.playEnemyMechanicPresentation(step,context);
  const captions=h.roots.flatMap(n=>n.children).filter(n=>n.className==='enemy-effect-caption');
  assert.equal(captions.length,1);assert.equal(captions[0].textContent,enemy.ultName);
  assert.equal(h.commits.filter(r=>r.kind==='damage').length,4);
});
test('Concurrent enemy threats use a single warning and a compact real-target lock',t=>{
  const {room,player}=mechanismBattle(t,[ENCOUNTERS[1],ENCOUNTERS[2],ENCOUNTERS[0]]);mechanismRound(room,3);
  const h=enemyPresentationHarness(),stage=h.scope.document.createElement('div'),card=h.scope.document.createElement('div');let warning;
  stage.before=n=>{warning=n;};card.dataset.playerId=player.id;card.querySelector=()=>card.children[0]||null;
  h.scope.document.getElementById=id=>id==='battleEnemiesStage'?stage:id==='enemyTelegraphs'?warning:null;
  h.scope.document.querySelectorAll=()=>[card];
  h.scope.renderEnemyTelegraphs(room.getHpSnapshot().enemies);
  assert.ok(warning.textContent.includes('另 2 名警戒'));assert.ok(!warning.textContent.includes('\n'));
  assert.equal(card.children[0].textContent,'⌖');assert.ok(!card.children[0].hidden);
});
test('Impact numbers have safe coordinates before their first animation frame',async t=>{
  const {room,enemy}=mechanismBattle(t,[ABYSS_BOSSES.stargazer]);mechanismRound(room,1);room.checkDodge=()=>false;
  const queue=actMechanism(room,enemy);normalizeCombatQueue(queue,'first-frame-values');const h=enemyPresentationHarness();
  for(const step of queue)await h.scope.playEnemyMechanicPresentation(step,{});
  const visit=n=>[n,...n.children.flatMap(visit)],values=h.roots.flatMap(visit).filter(n=>n.className?.includes('battle-feedback')&&n.className!=='battle-feedback-sr');
  assert.ok(values.length);assert.ok(values.every(n=>parseFloat(n.style.left)>0&&parseFloat(n.style.top)>0));
});
test('Split HP and shield numbers avoid actor, cooldown and header rectangles in a narrow viewport',()=>{
  const h=enemyPresentationHarness();h.scope.innerWidth=844;h.scope.innerHeight=390;
  const obstacles=[{left:100,right:180,top:100,bottom:240,width:80,height:140},{left:110,right:170,top:72,bottom:96},{left:0,right:844,top:0,bottom:60}];
  h.scope.document.querySelectorAll=()=>obstacles.map(r=>({getBoundingClientRect:()=>r}));
  h.scope.getVisualAnchor=id=>({id,element:{getBoundingClientRect:()=>obstacles[0]},x:140,y:170});
  const occupied=[];
  for(let i=0;i<2;i++)h.scope.positionBattleFeedback(h.scope.document.createElement('div'),'target',i,occupied);
  assert.equal(occupied.length,2);
  const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  assert.ok(occupied.every(r=>r.left>=0&&r.right<=844&&r.top>=0&&r.bottom<=390&&obstacles.every(o=>!overlaps(r,o))));
  assert.ok(!overlaps(occupied[0],occupied[1]));
});
test('Rain armor prelude never reveals a secondary hit before the player animation',t=>{
  const {room,player,events}=mechanismBattle(t,[ENCOUNTERS[0],EXCLUSIVE_MINIONS[0],EXCLUSIVE_MINIONS[0]],'archer');
  const before=room.getHpSnapshot().enemies.map(e=>e.hp),rolls=[.9,.1,.1,.1];t.mock.method(Math,'random',()=>rolls.shift()??.1);
  player.action='a_rain';room.resolveTurnActions();const queue=resolutionQueue(events),action=queue.findIndex(s=>s.actionId==='a_rain');
  assert.ok(action>0);assert.deepEqual(queue[0].hpSnapshotBefore.enemies.map(e=>e.hp),before);
  for(const s of queue.slice(0,action)){assert.deepEqual(s.hpSnapshot.enemies.map(e=>e.hp),before);assert.ok(s.results.every(r=>r.actualHpDamage===0));}
});
test('Original rain choreography plays five staggered nine-arrow waves per real target with no extra results',async t=>{
  const {room,player,events}=phase1Battle(t,'archer');player.action='a_rain';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.actionId==='a_rain'),nodes=[],beats=[],commits=new Set(),delays=[];
  class Node{constructor(){this.children=[];this.dataset={};this.style={setProperty(){}};this.classList={add(){}};nodes.push(this);}appendChild(n){this.children.push(n);}setAttribute(){}remove(){this.removed=true;}}
  const scope={document:{createElement:()=>new Node()},preloadPhase5Art:async()=>{},resolvePresentationTarget:r=>r.targetId,getBattleEffectAnchor:()=>({rect:{width:100}})};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/combat-expansion.js',import.meta.url),'utf8'),scope);vm.runInContext(readFileSync(new URL('../public/player-battlefield.js',import.meta.url),'utf8'),scope);
  scope.commitBattlefieldPlayerResult=r=>{assert.ok(!commits.has(r.resultId));commits.add(r.resultId);};
  scope.withBattlefieldSkillStage=async(_step,_context,play)=>play({root:new Node(),local:{audioScope:{play(){}}},follow(){},wait:async()=>{},reduced:false,animate:(_n,_k,_ms,o)=>{if(o?.delay!==undefined)delays.push(o.delay);},resolveResults:async()=>{},el:()=>new Node()});
  await scope.playBattlefieldArrowRain(step,{speed:2,onTiming:(beat,detail)=>beats.push([beat,detail])});
  const targets=new Set(step.results.filter(r=>r.kind==='damage').map(r=>r.targetId));
  assert.equal(beats.length,targets.size*5);assert.equal(nodes.filter(n=>n.className==='archer-falling-arrow').length,targets.size*45);
  assert.equal(nodes.filter(n=>n.className==='archer-painted-ground').length,targets.size*5);assert.ok(delays.includes(35));
  const arrows=nodes.filter(n=>n.className==='archer-falling-arrow');
  assert.ok(arrows.every(n=>n.children.length===1&&n.children[0].src==='/assets/combat-fx/archer/magic-arrow.png'));
  assert.ok(nodes.filter(n=>n.className==='archer-painted-ground').every(n=>n.src==='/assets/combat-fx/archer/arrow-ground-impact.png'));
  assert.equal(commits.size,step.results.length);assert.ok(beats.every(([,b])=>targets.has(b.targetId)));
});
for(const index of [0,1,7])test('Painted enemy choreography uses distinct real basic and ultimate timelines: '+ENCOUNTERS[index].name,t=>{
  const {room,enemy}=mechanismBattle(t,[ENCOUNTERS[index]]);room.checkDodge=()=>false;
  const durations=[];
  for(const round of [1,3]){
    mechanismRound(room,round);const queue=actMechanism(room,enemy);normalizeCombatQueue(queue,'painted-'+index+'-'+round);
    const step=queue.find(s=>s.results.some(r=>r.kind==='damage')),h=enemyPresentationHarness();
    vm.runInContext(readFileSync(new URL('../public/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
    const root=h.scope.document.createElement('div'),animations=[];
    const fx=h.scope.createEnemyChoreography(step,step.results[0],root,{animations,speed:1,reduced:false});assert.ok(fx);
    for(const p of [0,.2,fx.contact,.8,1])fx.render(p);
    durations.push(fx.duration);fx.remove();assert.ok(root.children[0].isConnected===false);
    assert.equal(h.commits.length,0,'drawing must never settle or invent damage');
  }
  assert.ok(durations[1]>durations[0]+300);
});
for(const [name,templates] of [
  ['三種一般小怪',GENERAL_MINIONS],['熔岩與兩幼體',[ENCOUNTERS[0],EXCLUSIVE_MINIONS[0],EXCLUSIVE_MINIONS[0]]],
  ['魔偶與維修機',[ENCOUNTERS[2],EXCLUSIVE_MINIONS[2]]],['狼王與幼狼',[ENCOUNTERS[1],EXCLUSIVE_MINIONS[1]]],
  ['騎士與骷髏',[ENCOUNTERS[5],EXCLUSIVE_MINIONS[5]]],['深淵與兩隨從',[ABYSS_BOSSES.warrior,...ABYSS_MINIONS]],
  ['單菁英',[ENCOUNTERS[9]]],['菁英死亡後的小怪',[ENCOUNTERS[8],EXCLUSIVE_MINIONS[8]]]
])test('Phase 3 production formation event playback: '+name,async t=>{
  const {room}=mechanismBattle(t,templates);room.checkDodge=()=>false;
  const queue=mechanismRound(room,3);
  if(name==='菁英死亡後的小怪'){room.enemies[0].hp=0;drainEnemyEvents(room,queue);}
  for(const enemy of room.getLivingEnemies())queue.push(...actMechanism(room,enemy));
  normalizeCombatQueue(queue,'phase3-'+name);
  const h=enemyPresentationHarness();
  for(const step of queue)await h.scope.playEnemyMechanicPresentation(step,{speed:2,reducedMotion:true});
  assert.equal(h.commits.length,queue.flatMap(s=>s.results).length);
  assert.ok(h.commits.every(r=>r.targetId&&r.targetBefore&&r.targetAfter));
  assert.ok(h.roots.every(n=>!n.isConnected||n.id==='battleFeedbackLive'));assert.equal(h.frames.size,0);
  assert.ok(h.waits.every(w=>w.speed===2));
  for(const step of queue)await h.scope.playEnemyMechanicPresentation(step,{});
  assert.equal(h.commits.length,queue.flatMap(s=>s.results).length,'duplicates never commit or animate again');
});
test('Phase 3 abort before impact removes every effect and does not commit early',async t=>{
  const {room,enemy}=mechanismBattle(t,[ENCOUNTERS[0]]);mechanismRound(room,1);
  const queue=actMechanism(room,enemy);normalizeCombatQueue(queue,'abort');
  const h=enemyPresentationHarness(), controller=new AbortController();
  h.scope.waitForPresentation=async()=>{controller.abort();throw new DOMException('cancelled','AbortError');};
  await assert.rejects(h.scope.playEnemyMechanicPresentation(queue[0],{signal:controller.signal}),{name:'AbortError'});
  assert.equal(h.commits.length,0);assert.equal(h.frames.size,0);assert.ok(h.roots.every(n=>!n.isConnected));
});
for(const template of allEnemyTemplates)test('Phase 2 factory, action, snapshots and death: '+template.name,async t=>{
  const pair=template.bossName?ENCOUNTERS.find(e=>e.name===template.bossName):null;
  const {room,enemy}=mechanismBattle(t,[template,...(pair?[pair]:[])]);
  assert.equal(enemy.mechanics.id,mechanicId(template));
  const display=room.formatEnemySnapshot(enemy).presentation;
  assert.equal(display.mechanicId,mechanicId(template));
  assert.ok(display.passiveName && display.passiveDesc && display.counter && display.ultimateDesc);
  const front={};vm.createContext(front);vm.runInContext(readFileSync(new URL('../public/enemy-presentation.js',import.meta.url),'utf8'),front);
  assert.ok(vm.runInContext(`ENEMY_FX_PROFILES[${JSON.stringify(display.family)}]`,front));
  enemy.hp=Math.max(1,Math.floor(enemy.maxHp/2));
  let queue=mechanismRound(room,1);queue.push(...actMechanism(room,enemy));
  queue.push(...mechanismRound(room,3),...actMechanism(room,enemy));
  normalizeCombatQueue(queue,'phase2-'+enemy.mechanics.id);
  for(const step of queue.filter(s=>s.type==='enemy_mechanic')){
    assert.ok(step.presentation?.family);
    for(const result of step.results){const feedback=front.enemyEventFeedback(result,step);assert.equal(typeof feedback,'string');assert.doesNotMatch(feedback,/生命|護盾|回合/);}
  }
  const playback=enemyPresentationHarness();
  for(const step of queue.filter(s=>s.type==='enemy_mechanic'))await playback.scope.playEnemyMechanicPresentation(step,{reducedMotion:true});
  assert.ok(playback.roots.every(n=>!n.isConnected||n.id==='battleFeedbackLive'));assert.equal(playback.frames.size,0);
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


test('Every painted enemy recipe uses existing art, true anchors, no SVG and no settlement',t=>{
  const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
  const recipes=vm.runInContext('ENEMY_PAINTED_ART',h.scope);
  for(const [id,paths] of Object.entries(recipes).filter(([id])=>!vm.runInContext('SIX_ENEMY_IDS',h.scope).has(id))){
    for(const path of paths)assert.ok(readFileSync(new URL('../public/assets/combat-fx/'+path,import.meta.url)).length>100,path);
    for(const reduced of [false,true]){
      const root=h.scope.document.createElement('div'),result={kind:'damage',actualDamage:12,targetId:'ally',sourceId:'enemy'};
      const step={sourceId:'enemy',presentation:{mechanicId:id,isUltimate:true}};
      let targetX=300;h.scope.getBattleEffectAnchor=id=>({id,x:id==='ally'?targetX:100,y:200,rect:{width:80,height:90},element:root});
      const fx=h.scope.createEnemyChoreography(step,result,root,{reduced,animations:[],speed:1});assert.ok(fx,id);
      fx.render(fx.contact);const image=root.children[0].children[0];assert.ok(image.src.endsWith('.png'));
      const charge=/energy-core|blood-moon/.test(image.src)&&paths.length>1,link=/energy-stream|energy-link|overload-lightning/.test(image.src);
      assert.equal(image.style.left,charge?'100px':link&&!reduced?'200px':'300px');
      targetX=430;fx.render(fx.contact+.1);assert.equal(image.style.left,charge?'100px':link&&!reduced?'265px':'430px');
      result.actualDamage=0;fx.render(fx.contact+.2);assert.ok(root.children[0].children.every(n=>n.style.opacity==='0'),'miss must not show an impact');
      fx.remove();assert.equal(root.children[0].isConnected,false);
    }
  }
  assert.equal(h.commits.length,0);
  assert.equal(h.scope.enemyPaintedPaths({presentation:{mechanicId:'abyss_sage'}},{kind:'status'}),null,'do not paint passive Sage ticks');
  assert.equal(h.scope.enemyPaintedPaths({presentation:{mechanicId:'lava_colossus'},actionId:'heal'},{kind:'heal'}),null,'never put a fist on healing');
});

test('Alchemist painted vial leaves the hand and tracks the true target with reduced motion',async()=>{
  for(const reduced of [false,true]){
    const nodes=[],target={x:800,y:200};
    class Node{constructor(){this.style={};this.children=[];nodes.push(this);}appendChild(n){this.children.push(n);}setAttribute(){}remove(){this.removed=true;}}
    const scope={innerWidth:1440,innerHeight:900,AMMO_IMAGES:{},document:{createElement:()=>new Node()},getBattleEffectAnchor:id=>id==='enemy_2'?target:{x:50,y:600}};
    vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/player-battlefield.js',import.meta.url),'utf8'),scope);
    const samples=[],stage={root:new Node(),reduced,tick:async(ms,render)=>{render(0);samples.push({...nodes[1].style});target.x=930;render(1);samples.push({...nodes[1].style});}};
    await scope.battlefieldProjectile(stage,'hero','enemy_2','bottle',{getBoundingClientRect:()=>({left:200,top:400,width:300,height:200})});
    assert.equal(nodes[2].src,'/assets/combat-fx/alchemist/reagent-bottle.png');assert.equal(samples[0].left,reduced?'800px':'446px');assert.equal(samples[1].left,'930px');assert.equal(nodes[1].removed,true);
  }
});


test('All real enemy queues retain one settlement per result with painted choreography',async t=>{
  for(const template of allEnemyTemplates){
    const {room,enemy}=mechanismBattle(t,[template]);room.checkDodge=()=>false;const queue=mechanismRound(room,3);queue.push(...actMechanism(room,enemy));normalizeCombatQueue(queue,'official-art-'+enemy.instanceId);
    for(const reducedMotion of [false,true]){
      const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
      const preloaded=[];h.scope.preloadPhase5Art=async paths=>{for(const path of paths){assert.ok(readFileSync(new URL('../public'+path,import.meta.url)).length);preloaded.push(path);}};
      for(const step of queue)await h.scope.playEnemyMechanicPresentation(step,{reducedMotion,speed:1.5});
      assert.equal(h.commits.length,queue.flatMap(s=>s.results).length,template.name);assert.equal(h.frames.size,0);assert.ok(h.roots.filter(root=>root.className==='enemy-effect-overlay').every(root=>!root.isConnected));
      const before=h.commits.length;for(const step of queue)await h.scope.playEnemyMechanicPresentation(step,{reducedMotion});assert.equal(h.commits.length,before,'replay cannot apply damage twice');
    }
  }
});


test('Arena participants keep their own painted profession renderer',async()=>{
  const scope={};vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/player-battlefield.js',import.meta.url),'utf8'),scope);
  const calls=[];scope.playBattlefieldPaintedRole=async step=>calls.push(step.sourceRole);scope.playBattlefieldRanged=async step=>calls.push(step.sourceRole);scope.playPhase5BattlefieldPresentation=async()=>{throw Error('An unrelated profession must not use Gladiator art');};
  for(const sourceRole of ['alchemist','archer','warrior','mage','assassin','bard','paladin'])await scope.playBattlefieldPlayerPresentation({type:'player_action',sourceRole,actionId:'basic',hpSnapshotBefore:{arena:{playerId:'hero',enemyId:'enemy_2'}}},{});
  assert.equal(calls.length,7);
});


test('Production and Lab load painted enemy choreography before its dispatcher',()=>{
  for(const page of ['index.html','presentation-lab.html']){
    const html=readFileSync(new URL('../public/'+page,import.meta.url),'utf8');
    const choreography=html.indexOf('<script src="enemy-choreography.js"'),dispatch=html.indexOf('<script src="enemy-presentation.js"');
    assert.ok(choreography>=0&&choreography<dispatch,page+' must not silently run the placeholder renderer');
  }
});

test('A dead lava source still paints its authoritative explosion on the living target',()=>{
  const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
  const root=h.scope.document.createElement('div');h.scope.getBattleEffectAnchor=id=>id==='dead-larva'?null:{x:360,y:240,rect:{width:80,height:90},element:root};
  const fx=h.scope.createEnemyChoreography({sourceId:'dead-larva',presentation:{mechanicId:'lava_larva',family:'lava'}},{kind:'damage',targetId:'ally',actualDamage:4},root,{reduced:false,animations:[],speed:1});
  fx.render(0);assert.equal(root.children[0].hidden,true);fx.render(fx.contact+.1);assert.equal(root.children[0].hidden,false);assert.equal(root.children[0].children[0].style.left,'360px');assert.equal(h.commits.length,0);fx.remove();
});


function phase6Fixtures(){
  const source=readFileSync(new URL('../public/presentation-lab.js',import.meta.url),'utf8'),marker='const PHASE5_ACCEPTANCE_SCENES=Object.freeze(';
  const start=source.indexOf(marker)+marker.length,end=source.indexOf('\n});',start)+2;
  return structuredClone(Object.fromEntries(Object.entries(vm.runInNewContext('('+source.slice(start,end)+')')).filter(([id])=>id.startsWith('phase6_'))));
}
function phase6Harness(step,{reduced=false,missing=false,abortAt=Infinity}={}){
  const nodes=[],commits=[],animations=[],preloaded=[],positions=[],sounds=[],controller=new AbortController();let clock=0;
  class Node{
    constructor(){this.children=[];this.dataset={};this.style={setProperty(){}};this.classList={add(){}};nodes.push(this);}
    appendChild(n){this.children.push(n);return n;}setAttribute(){}remove(){this.removed=true;}
  }
  const anchor=id=>missing?null:{id,x:id?.startsWith('enemy')?800:240,y:id?.startsWith('enemy')?200:600,rect:{width:80,height:90},element:new Node()};
  const scope={applyHpSnapshot(){},DOMException,innerWidth:1200,innerHeight:800,performance:{now:()=>clock},document:{createElement:()=>new Node()},getBattleEffectAnchor:anchor,
    positionBattleFeedback(n,id){n.style.left=anchor(id)?.x+'px';},resolvePresentationTarget:r=>r.targetEnemyId||r.targetId,
    resolveCombatSfxProfile:()=>({key:'original-recording'}),battlefieldPaintedImage(parent,src,cls){const n=new Node();n.src=src;n.className=cls;parent.appendChild(n);return n;},
    preloadPhase5Art:async paths=>{for(const path of paths){assert.ok(readFileSync(new URL('../public'+path,import.meta.url)).length,path);preloaded.push(path);}},
    commitBattlefieldPlayerResult(r,_step,context){if(context.signal.aborted)return false;if(commits.includes(r.resultId))return false;commits.push(r.resultId);return true;}};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/phase6-battlefield.js',import.meta.url),'utf8'),scope);
  const signal=controller.signal,audioScope={play:(...a)=>sounds.push(a),playResult:(...a)=>sounds.push(a)};
  const advance=ms=>{clock+=ms;if(clock>=abortAt)controller.abort();if(signal.aborted)throw new DOMException('cancelled','AbortError');};
  let root;
  scope.withBattlefieldSkillStage=async(_step,context,play)=>{
    root=new Node();const stage={root,actor:new Node(),targetFor:id=>anchor(id)?.element,signal,reduced,local:{...context,signal,audioScope,speed:1},
      el:(tag,cls,html,parent=root)=>{const n=new Node();n.className=cls;parent.appendChild(n);return n;},
      follow(n,id){positions.push(id);n.hidden=!anchor(id);},startRenderer(){},
      animate(n,keys,ms){animations.push({n,keys,ms});},wait:async ms=>advance(ms),tick:async(ms,render)=>{render(0);advance(ms/2);render(.5);advance(ms/2);render(1);},
      resolveResults:async()=>{for(const r of step.results||[])scope.commitBattlefieldPlayerResult(r,step,{signal});}};
    try{await play(stage);}finally{root.remove();}
  };
  return {scope,nodes,commits,animations,preloaded,positions,sounds,signal,getRoot:()=>root};
}
test('Phase 6 real engine fixtures keep exact result order, assets and reduced motion',async()=>{
  const fixtures=phase6Fixtures();assert.equal(Object.keys(fixtures).length,114);
  for(const [id,fixture] of Object.entries(fixtures))for(const step of fixture.steps){
    if(['enemy_mechanic','boss_action'].includes(step.type))continue;
    for(const reduced of [false,true]){
      const h=phase6Harness(step,{reduced});await h.scope.playPhase6BattlefieldPresentation(step,{});
      assert.deepEqual(h.commits,step.results.map(r=>r.resultId),id);assert.ok(h.getRoot().removed);
      assert.ok(h.nodes.filter(n=>n.src).every(n=>/\.(png|webp)$/.test(n.src)),id);
      if(reduced)assert.ok(h.animations.every(a=>a.keys.every(k=>!k.translate&&!k.scale&&!k.rotate&&!k.transform)),id+' must fade without moving');
      if(step.actionId==='s_smoke')assert.equal(h.getRoot().dataset.critical,'false');
      if(step.sourceRole==='bard')assert.ok(h.nodes.some(n=>n.src?.endsWith('/glowing-strings.png'))&&h.nodes.some(n=>n.src?.endsWith('/pluck-streak.png')));
    }
  }
});
test('Phase 6 cancel before contact never applies results and removes the owned layer',async()=>{
  const fixtures=phase6Fixtures();
  for(const role of ['warrior','paladin','mage','bard','assassin']){
    const step=Object.values(fixtures).find(f=>f.role===role&&f.steps[0].actionId==='basic').steps[0];
    const h=phase6Harness(step,{abortAt:1});await assert.rejects(h.scope.playPhase6BattlefieldPresentation(step,{}),e=>e.name==='AbortError');
    assert.equal(h.commits.length,0);assert.ok(h.getRoot().removed);
    const missing=phase6Harness(step,{missing:true});await missing.scope.playPhase6BattlefieldPresentation(step,{});assert.deepEqual(missing.commits,step.results.map(r=>r.resultId));
  }
});
test('Phase 6 Paladin echo and ending support preserve the authoritative shield deltas',t=>{
  for(const half of [false,true]){
    const {room,player}=phase1Battle(t,'paladin');room.addPlayer({id:'ally',join(){},emit(){}},'Ally');room.selectRole('ally','warrior');
    player.paladinGloryCastedRound=1;player.paladinGloryTrackedDamage=50;room.battleRound=2;t.mock.method(Math,'random',()=>half?.1:.9);
    const q=[];room.p8RoundStart(q);const step=q.find(s=>s.actionId==='pal_glory_echo');assert.ok(step);
    assert.equal(step.hpSnapshotBefore.players.find(p=>p.id===player.id).tempHp,0);
    for(const r of step.results){assert.equal(r.actualShield,half?17:35);assert.equal(r.targetAfter.tempHp-r.targetBefore.tempHp,r.actualShield);}
    assert.equal(player.paladinGloryCastedRound,0);
  }
});
test('Phase 6 incoming growth, fatal protection and grace never add a damage result',async()=>{
  const fixtures=phase6Fixtures();
  for(const name of ['growth','growth_shield','growth_cap','fatal','grace_hit']){
    const fixture=fixtures['phase6_event_'+name];const h=enemyPresentationHarness();
    vm.runInContext(readFileSync(new URL('../public/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
    vm.runInContext(readFileSync(new URL('../public/phase6-battlefield.js',import.meta.url),'utf8'),h.scope);
    h.scope.battlefieldPaintedImage=(parent,src,cls)=>{const n=h.scope.document.createElement('img');n.src=src;n.className=cls;parent.appendChild(n);return n;};
    for(const step of fixture.steps)await h.scope.playEnemyMechanicPresentation(step,{speed:1.5,reducedMotion:true});
    assert.equal(h.commits.length,fixture.steps.flatMap(s=>s.results).length,name);assert.equal(h.frames.size,0);
    const walk=n=>[n,...n.children.flatMap(walk)],images=h.roots.flatMap(walk).filter(n=>n.src);
    if(name==='growth')assert.ok(images.some(n=>n.dataset.reaction==='warrior-growth'));
    if(['growth_shield','growth_cap'].includes(name))assert.ok(!images.some(n=>n.dataset.reaction==='warrior-growth'));
    if(name==='fatal')assert.ok(images.some(n=>n.dataset.reaction==='fatal-guard'));
    if(name==='grace_hit'){
      assert.ok(images.some(n=>n.dataset.reaction==='grace-intercept'));
      const redirect=h.commits.find(r=>r.sharedFrom);assert.equal(redirect.targetId,'hero');assert.equal(redirect.sharedFrom,'ally');
      assert.equal(h.commits.find(r=>r.targetId==='ally').actualDamage,0);
    }
  }
});


test('Phase 6 feedback never labels a resource/status update as a second critical hit',()=>{
  const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/phase6-battlefield.js',import.meta.url),'utf8'),h.scope);
  assert.equal(h.scope.phase6FeedbackEntries({kind:'status',outcome:{type:'critical'}}).length,0);
  assert.ok(h.scope.phase6FeedbackEntries({kind:'damage',actualDamage:12,actualHpDamage:12,outcome:{type:'critical'}}).some(e=>e.text==='暴擊'));
  assert.ok(!h.scope.phase6FeedbackEntries({kind:'damage',actualDamage:0,outcome:{type:'critical'}}).some(e=>e.text==='暴擊'));
});
test('Phase 6 snapshots expose actual stealth, shield sources and consumed fatal guard',t=>{
  const {room,player}=phase1Battle(t,'assassin');player.stealthStacks=3;player.followUpsThisRound=1;
  let snap=room.getHpSnapshot().players.find(p=>p.id===player.id);assert.ok(snap.resourceSummary.includes('匿蹤 3'));assert.ok(snap.resourceSummary.includes('1/2'));
  player.paladinFatalGuard=true;player.hp=2;room.p8GrantShield(player,1,2,'paladin_basic');
  snap=room.getHpSnapshot().players.find(p=>p.id===player.id);assert.equal(snap.paladinFatalGuard,true);assert.ok(snap.presentationShields.some(s=>s.kind==='paladin_basic'));
  room.applyDamageToPlayer(player,100,{trueDamage:true});snap=room.getHpSnapshot().players.find(p=>p.id===player.id);assert.equal(snap.hp,1);assert.equal(snap.paladinFatalGuard,false);assert.equal(snap.stealthStacks,3);
});

test('Six new enemy recipes route real basic, ultimate and zero-damage status events; grouped casts settle once',async t=>{
  const templates=[GENERAL_MINIONS.find(e=>e.id==='gel_slime'),ABYSS_MINIONS[1],...['stargazer','dreamweaver','onmyoji','sage'].map(k=>ABYSS_BOSSES[k])];
  for(const template of templates)for(const ultimate of [false,true]){
    const {room,enemy,player}=mechanismBattle(t,[template]);room.checkDodge=()=>false;
    for(const id of ['ally2','ally3'])room.players[id]={...structuredClone(player),id,name:id,cooldowns:{skill1:2,skill2:3}};
    mechanismRound(room,ultimate?(mechanicId(template)==='abyss_sage'?2:3):1);
    const queue=actMechanism(room,enemy);normalizeCombatQueue(queue,'six-'+enemy.instanceId+'-'+ultimate);
    for(const reducedMotion of [false,true]){
      const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
      const casts=h.scope.groupEnemyPresentationSteps(queue),sounds=[];h.scope.sfxManager={play:id=>sounds.push(id)};
      const routed=queue.flatMap(s=>s.results.map(r=>h.scope.enemyPaintedPaths(s,r))).filter(Boolean).flat();assert.ok(routed.length,template.name);
      for(const path of routed)assert.ok(readFileSync(new URL('../public/assets/combat-fx/'+path,import.meta.url)).length);
      for(const step of casts){
        const r=step.results[0],mode=h.scope.sixEnemyEventMode(step,r);
        const root=h.scope.document.createElement('div'),fx=h.scope.createEnemyChoreography(step,r,root,{reduced:reducedMotion,animations:[],speed:1});
        if(fx){for(const p of [0,.2,.5,fx.contact,.9,1])fx.render(p);fx.remove();}
        await h.scope.playEnemyMechanicPresentation(step,{reducedMotion});
        if(mode?.mode!=='quiet')assert.equal(step.enemyCastMembers.length,queue.length,'one cast contains all recipients');
      }
      assert.equal(h.commits.length,queue.flatMap(s=>s.results).length);assert.equal(h.frames.size,0);
      assert.ok(sounds.length<=2,'one windup and one contact for all recipients');
      for(const step of casts)await h.scope.playEnemyMechanicPresentation(step,{reducedMotion});assert.equal(h.commits.length,queue.flatMap(s=>s.results).length);
      if(ultimate&&['abyss_dreamweaver','abyss_onmyoji'].includes(mechanicId(template)))assert.ok(h.commits.every(r=>!r.actualDamage&&!r.actualHpDamage),'status cast cannot invent damage');
    }
  }
});

test('Watcher support uses the beneficiary resistance delta and clears without extra damage',async t=>{
  const {room}=mechanismBattle(t,[ABYSS_BOSSES.sage,ABYSS_MINIONS[1],ABYSS_MINIONS[1]]);
  syncEnemySupport(room);const queue=[];drainEnemyEvents(room,queue);
  room.enemies[1].hp=0;room.enemies[2].hp=0;syncEnemySupport(room);drainEnemyEvents(room,queue);queue.splice(0,queue.length,...queue.filter(s=>s.targetId===room.enemies[0].instanceId));normalizeCombatQueue(queue,'cover');
  const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
  assert.equal(queue.length,2);assert.equal(h.scope.sixEnemyEventMode(queue[0],queue[0].results[0]).mode,'cover');assert.equal(h.scope.sixEnemyEventMode(queue[1],queue[1].results[0]).removing,true);
  for(const step of queue){assert.ok(h.scope.enemyPaintedPaths(step,step.results[0])[0].endsWith('watcher-void-cover.png'));await h.scope.playEnemyMechanicPresentation(step,{reducedMotion:true});}
  assert.equal(h.commits.length,2);assert.ok(h.commits.every(r=>r.kind==='status'&&!r.actualDamage));
});

test('Six-enemy missing image is reported and completes authority; abort and missing anchors clean the timeline',async t=>{
  const {room,enemy}=mechanismBattle(t,[ABYSS_BOSSES.sage]);mechanismRound(room,2);const queue=actMechanism(room,enemy);normalizeCombatQueue(queue,'six-cleanup');
  for(const failure of ['image','anchor','abort']){
    const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
    const errors=[];h.scope.console={error:(...args)=>errors.push(args)};
    const controller=new AbortController();
    if(failure==='image')h.scope.preloadPhase5Art=async()=>{throw Error('missing PNG');};
    if(failure==='anchor')h.scope.getVisualAnchor=()=>null;
    if(failure==='abort'){const wait=h.scope.waitForPresentation;h.scope.waitForPresentation=async(...args)=>{controller.abort();return wait(...args);};}
    const run=()=>h.scope.playEnemyMechanicPresentation(h.scope.groupEnemyPresentationSteps(queue)[0],{signal:controller.signal});
    if(failure==='abort')await assert.rejects(run,{name:'AbortError'});else {await run();assert.equal(h.commits.length,queue.flatMap(s=>s.results).length);}
    assert.equal(h.frames.size,0);assert.ok(h.roots.filter(n=>n.className==='enemy-effect-overlay').every(n=>!n.isConnected));
    if(failure==='image')assert.equal(errors.length,1);
  }
});

test('Six-enemy Lab captures retain their engine snapshots, exact order and single cast cleanup',async()=>{
  const source=readFileSync(new URL('../public/presentation-lab.js',import.meta.url),'utf8');
  const scenes=Object.fromEntries(source.split('\n').filter(line=>line.startsWith('"six_enemy_')).map(line=>{const at=line.indexOf(':');return [JSON.parse(line.slice(0,at)),JSON.parse(line.slice(at+1,-1))];}));
  for(const [id,scene] of Object.entries(scenes).filter(([id])=>id.startsWith('six_enemy_'))){
    const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
    for(const cast of h.scope.groupEnemyPresentationSteps(scene.steps))await h.scope.playEnemyMechanicPresentation(cast,{reducedMotion:true});
    assert.deepEqual(h.commits.map(r=>r.resultId),scene.steps.flatMap(s=>s.results.map(r=>r.resultId)),id);
    for(const r of h.commits){assert.equal(r.actualHpDamage||0,Math.max(0,(r.targetBefore.hp||0)-(r.targetAfter.hp||0)),id);}
    assert.equal(h.frames.size,0,id);
  }
});

test('Shared six-enemy casts keep Paladin grace art without replaying the enemy choreography',()=>{
  const fixture=Object.entries(phase6Fixtures()).find(([id])=>id==='phase6_event_grace_hit')?.[1];assert.ok(fixture);
  const step=fixture.steps.find(s=>s.results?.some(r=>r.sharedFrom&&r.targetBefore?.role==='paladin'));
  const result=step.results.find(r=>r.sharedFrom&&r.targetBefore?.role==='paladin');
  const h=enemyPresentationHarness();let enemyCasts=0;const images=[];
  Object.assign(h.scope,{createEnemyChoreography(){enemyCasts++;return null;},battlefieldPaintedImage(parent,src,cls){const image=h.scope.document.createElement('img');image.src=src;image.className=cls;parent.appendChild(image);images.push(image);return image;}});
  vm.runInContext(readFileSync(new URL('../public/phase6-battlefield.js',import.meta.url),'utf8'),h.scope);
  const root=h.scope.document.createElement('div'),guard=h.scope.createPhase6Incoming(step,result,root,{castOwnsEnemyArt:true,reduced:false});
  assert.ok(guard);guard.render(.5);guard.render(guard.contact);assert.equal(enemyCasts,0);assert.equal(images.length,2);assert.equal(images[0].dataset.reaction,'grace-intercept');
  guard.remove();assert.ok(images.every(n=>!n.isConnected));assert.equal(h.commits.length,0);
});

test('Fourteen canonical Abyss full bodies survive factory, weakened, snapshot, dialogue and Dev selection without changing stats',t=>{
  assert.equal(Object.keys(ABYSS_BOSS_PORTRAITS).length,14);assert.equal(Object.keys(ABYSS_BOSSES).length,14);
  const {room}=fixture(t);
  for(const [role,template] of Object.entries(ABYSS_BOSSES)){
    const path=ABYSS_BOSS_PORTRAITS[template.id];assert.equal(template.battleAvatar,path);assert.ok(readFileSync(new URL('../public'+path,import.meta.url)).length>1000);
    assert.equal(DEV_ENEMIES.find(e=>e.id===template.id).template,template);
    for(const isWeakened of [false,true]){
      const enemy=room.createEnemyInstance(template,0,{tier:'ABYSS',isWeakened,rng:()=>.5});
      const legacy=room.createEnemyInstance({...template,battleAvatar:undefined,battleFormAvatars:undefined},0,{tier:'ABYSS',isWeakened,rng:()=>.5});
      const {battleAvatar,battleFormAvatars,...rest}=enemy;assert.equal(battleAvatar,path);assert.deepEqual(rest,legacy,'only presentation metadata changes');
      const snapshot=room.formatEnemySnapshot(enemy);assert.equal(snapshot.battleAvatar,path);assert.equal(snapshot.avatar,template.avatar);assert.deepEqual(snapshot.battleFormAvatars,template.battleFormAvatars);
    }
    room.startAbyssDialogue(template,{col:5});assert.equal(room.abyssState.bossBattleAvatar,path);assert.equal(room.abyssState.bossAvatar,template.avatar);
    assert.equal(room.advanceAbyssDialogue('solo').stage,2);assert.equal(room.abyssState.bossRole,role);assert.equal(room.abyssState.bossBattleAvatar,path);
  }
  assert.ok(!Object.keys(ABYSS_BOSS_PORTRAITS).some(id=>id.includes('augur')));assert.ok(!DEV_ENEMIES.some(e=>e.template.role==='augur'));
  assert.ok(!room.getUnpickedAbyssBossPool().some(e=>e.role==='augur'));
  assert.equal(ABYSS_AUGUR_EASTER_EGG.avatar,'/photo/卜者.webp');assert.equal(ABYSS_AUGUR_EASTER_EGG.triggerChance,.08);assert.equal(ABYSS_AUGUR_EASTER_EGG.excludedFromAbyssPool,true);
});
function abyssPortraitHarness(){
  const scope={console:{error(){}},escapeHtml:s=>String(s)};vm.createContext(scope);
  const core=readFileSync(new URL('../public/presentation-core.js',import.meta.url),'utf8');vm.runInContext(core.slice(core.indexOf('const DEFAULT_ROLE_AVATARS'),core.indexOf('function getClassPortraitHtml')),scope);
  const classes=new Set(),slot={classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);}}};let writes=0;
  const image={dataset:{},classList:{toggle(){}},closest:()=>slot,set src(value){this.url=value;writes++;},get src(){return this.url;}};
  return {scope,image,classes,writes:()=>writes};
}
test('Abyss body parser follows authoritative Druid forms and restores new natural art; ordinary roles and Augur retain old images',t=>{
  const h=abyssPortraitHarness(),{room,enemy}=mechanismBattle(t,[ABYSS_BOSSES.druid]);
  const natural=room.formatEnemySnapshot(enemy);h.scope.syncBattlePortrait(h.image,{...natural,entityType:'monster'});assert.equal(h.image.src,ABYSS_BOSS_PORTRAITS.abyss_druid);assert.ok(h.classes.has('is-abyss-fullbody'));
  mechanismRound(room,3);actMechanism(room,enemy);const event=mechanismRound(room,4).find(s=>['狼人變形','遠古樹精變形'].includes(s.actionId));
  const transformed=event.results[0].targetAfter;h.scope.syncBattlePortrait(h.image,{...transformed,entityType:'monster'});
  assert.equal(h.image.src,ABYSS_DRUID_FORM_PORTRAITS[transformed.mechanics.form]);assert.ok(h.classes.has('is-abyss-fullbody'));
  for(const [form,path] of Object.entries(ABYSS_DRUID_FORM_PORTRAITS)){
    assert.ok(readFileSync(new URL('../public'+path,import.meta.url)).length>1000);
    assert.equal(h.scope.resolveBattlePortrait({...natural,mechanics:{form},entityType:'monster'}).src,path);
    assert.equal(h.scope.resolveBattlePortrait({role:'druid',druidForm:form}).src,form==='werewolf'?'/photo/狼人.webp':'/photo/遠古樹精.webp');
  }
  h.scope.syncBattlePortrait(h.image,{...natural,entityType:'monster'});assert.equal(h.image.src,ABYSS_BOSS_PORTRAITS.abyss_druid);assert.ok(h.classes.has('is-abyss-fullbody'));
  assert.equal(h.scope.resolveBattlePortrait({role:'druid'}).src,'/photo/Druid.webp');assert.equal(h.scope.resolveBattlePortrait({role:'augur'}).src,'/photo/Augur.webp');
  for(const e of [...ENCOUNTERS,...GENERAL_MINIONS])assert.equal(h.scope.resolveBattlePortrait({...e,entityType:'monster'}).src,e.avatar);
});
test('A missing full-body image falls back once; HP updates cannot restore a failed URL or replace the real image node',()=>{
  const h=abyssPortraitHarness(),descriptor={...ABYSS_BOSSES.paladin,entityType:'monster'};
  h.scope.syncBattlePortrait(h.image,descriptor);assert.equal(h.image.src,ABYSS_BOSS_PORTRAITS.abyss_paladin);assert.equal(h.image.dataset.fullBody,'true');
  h.image.onerror();assert.equal(h.image.src,descriptor.avatar);assert.equal(h.image.onerror,null);assert.equal(h.image.dataset.fullBody,'false');
  const writes=h.writes();h.scope.syncBattlePortrait(h.image,{...descriptor,hp:1});assert.equal(h.writes(),writes);assert.equal(h.image.src,descriptor.avatar);
  h.scope.syncAbyssDialoguePortrait(h.image,{bossName:descriptor.name,bossAvatar:descriptor.avatar,bossBattleAvatar:descriptor.battleAvatar});assert.equal(h.writes(),writes);
});

test('Remote asset retry cannot prematurely replace an Abyss portrait, and a missing Druid form falls back to its matching legacy form',()=>{
  const h=abyssPortraitHarness(),descriptor={...ABYSS_BOSSES.druid,entityType:'monster',mechanics:{form:'treant'}};
  h.scope.syncBattlePortrait(h.image,descriptor);assert.equal(h.image.src,ABYSS_DRUID_FORM_PORTRAITS.treant);
  h.image.dataset.studioOriginal=h.image.src;h.image.dataset.studioResolved='https://example.invalid/remote-form.webp';
  const writes=h.writes();h.image.onerror();assert.equal(h.writes(),writes,'allow existing registry local retry');
  h.image.dataset.studioResolved=h.image.dataset.studioOriginal;h.image.onerror();assert.equal(h.image.src,'/photo/遠古樹精.webp');assert.notEqual(h.image.src,descriptor.avatar);assert.ok(!h.classes.has('is-abyss-fullbody'));
  h.image.onload();assert.equal(h.image.dataset.portraitLoaded,'true');
});
