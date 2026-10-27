import { DEV_ENEMIES } from './DevEncounter.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActionResults, normalizeCombatQueue, snapshotTarget, sequenceAugurDamageResults } from './combat-schema.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Room } from './Room.js';
import { ABYSS_BOSS_PORTRAITS, ABYSS_DRUID_FORM_PORTRAITS, ABYSS_AUGUR_EASTER_EGG, TIER1_EQUIPMENTS } from './constants.js';
import { ENCOUNTERS, EXCLUSIVE_MINIONS, GENERAL_MINIONS, ABYSS_MINIONS, SPECIAL_ELITES, ABYSS_BOSSES, CLASSES, getPlayerSkills, LOOT_TABLE } from './constants.js';
import { ENEMY_BALANCE, mechanicId, enemyRoundStart, enemyPlayerRoundTicks, drainEnemyEvents, runEnemyAction, beforePlayerAction, beforeEnemyDamage, afterPlayerDamage, sweepEnemyDeaths, enemyEffect, syncEnemySupport } from './enemy-mechanics.js';
import { getBossResistance } from './boss-resistance.js';
import { resolveStats } from './stats.js';
import { enemyPresentationInfo } from './enemy-mechanics.js';
import { splitEquationDamage, sageEquationPreview } from './role-mechanics.js';
test('HUD distinguishes enemy STATUS_TICK attacks from the next-round passive queue',()=>{
  const scope={document:{addEventListener(){}},isBattlefieldPlayerStep:s=>s.type==='player_action'};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-hud.js',import.meta.url),'utf8')+'\nglobalThis.hud=BattleHud;',scope);
  const enemy={type:'enemy_mechanic',category:'STATUS_TICK'};
  assert.equal(scope.hud.phaseFor(enemy,false),'ENEMY_ACTIONS');
  assert.equal(scope.hud.phaseFor(enemy,true),'ROUND_TICK');
  assert.equal(scope.hud.phaseFor({type:'status_action',category:'STATUS_TICK'}),'ROUND_TICK');
  assert.equal(scope.hud.phaseFor({type:'player_action',category:'OFFENSIVE'}),'ALLY_ACTIONS');
});

test('HUD holds basic attacks and skill names equally before starting their effects',async()=>{
  for(const actionId of ['basic','sa_cut','sa_counter','m_blast']){
    const nodes=new Map(),trace=[];
    const scope={AbortController,document:{addEventListener(){},getElementById(id){if(!nodes.has(id))nodes.set(id,{classList:{add:()=>trace.push('show'),remove:()=>trace.push('hide')}});return nodes.get(id);}},
      isBattlefieldPlayerStep:()=>true,roomState:{players:[]},getClassDisplayName:()=> '武士',
      waitForPresentation:async(ms,_signal,speed)=>{trace.push({ms,speed});}};
    vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-hud.js',import.meta.url),'utf8')+'\nglobalThis.hud=BattleHud;',scope);
    await scope.hud.announce({type:'player_action',actionId,skillName:'測試技能',sourceRole:'samurai'},{speed:2});trace.push('attack');
    assert.deepEqual(trace.slice(0,5),['show',{ms:1100,speed:2},'hide',{ms:180,speed:2},'hide']);
    assert.equal(trace.at(-1),'attack');
  }
});

test('HUD conceals actual Samurai counters until their turn after enemy attacks',t=>{
  const {room,player,events}=phase1Battle(t,'samurai');t.mock.method(Math,'random',()=>0);room.checkDodge=()=>false;
  player.action='basic';room.resolveTurnActions();const queue=resolutionQueue(events),counter=queue.find(s=>s.actionId==='sa_counter');
  assert.ok(counter);assert.ok(queue.slice(0,queue.indexOf(counter)).some(s=>['boss_action','enemy_mechanic'].includes(s.type)));
  const host={style:{setProperty(){}},children:[],replaceChildren(){this.children=[];},appendChild(n){this.children.push(n);}},scope={
    document:{addEventListener(){},getElementById:()=>host,createElement:()=>({style:{setProperty(){}},setAttribute(key,value){this[key]=value;}})},
    isBattlefieldPlayerStep:s=>s.type==='player_action',roomState:{players:[]},getPlayerAvatarHtml:()=>'',escapeHtml:s=>s};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-hud.js',import.meta.url),'utf8')+'\nglobalThis.hud=BattleHud;',scope);
  scope.hud.begin(queue);
  assert.ok(!host.children.some(n=>n['aria-label'].includes('狂刀反擊')));
  for(const step of queue.slice(0,queue.indexOf(counter)))scope.hud.start(step);
  assert.ok(!host.children.some(n=>n['aria-label'].includes('狂刀反擊')));
  scope.hud.start(counter);
  const reaction=host.children.find(n=>n['aria-label'].includes('狂刀反擊'));
  assert.ok(reaction);assert.equal(reaction.style.transform,'translateX(calc(0 * var(--queue-size) * .58))');assert.equal(reaction.style.zIndex,'1000');
  scope.hud.start(counter);assert.equal(host.children.filter(n=>n===reaction).length,1);
});

test('HUD defers transformed and newly summoned portraits until the Druid result is revealed',()=>{
  const host={style:{setProperty(){}},children:[],replaceChildren(){this.children=[];},appendChild(n){this.children.push(n);}};
  const scope={document:{addEventListener(){},getElementById:()=>host,createElement:()=>({style:{setProperty(){}},setAttribute(k,v){this[k]=v;}})},
    isBattlefieldPlayerStep:()=>true,roomState:{players:[]},getPlayerAvatarHtml:p=>p.druidForm||p.role,escapeHtml:s=>s};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-hud.js',import.meta.url),'utf8')+'\nglobalThis.hud=BattleHud;',scope);
  const cast={sourceId:'druid',sourceRole:'druid',skillName:'變身',hpSnapshotBefore:{players:[{id:'druid',role:'druid'}]},results:[{kind:'transform'}]};
  const bear={sourceId:'druid',sourceRole:'druid',skillName:'巨熊攻擊',hpSnapshotBefore:{players:[{id:'druid',role:'druid',druidForm:'bear'}]}};
  const mage={sourceId:'mage',sourceRole:'mage',skillName:'法師攻擊'};
  const wolf={sourceId:'druid',sourceRole:'druid',skillName:'幼狼攻擊',results:[{minion:{name:'幼狼',avatar:'wolf.webp'}}]};
  scope.hud.begin([cast,bear,mage,wolf]);
  assert.equal(host.children.length,2);assert.ok(!host.children.some(n=>/bear|wolf.webp/.test(n.innerHTML)));
  scope.hud.revealDruidResult(cast);
  assert.equal(host.children.length,4);
  assert.equal(host.children.find(n=>n.innerHTML==='bear').style.transform,'translateX(calc(1 * var(--queue-size) * .58))');
  assert.equal(host.children.find(n=>n['aria-label'].includes('法師攻擊')).style.transform,'translateX(calc(2 * var(--queue-size) * .58))');
  scope.hud.revealDruidResult(cast);assert.equal(host.children.length,4);
  const original=host.children[0];assert.equal(original.innerHTML,'druid');
  scope.hud.updateActorPortrait(cast,{role:'druid',druidForm:'bear'});
  assert.equal(host.children[0],original);assert.equal(original.innerHTML,'bear');assert.equal(host.children.length,4);
});

test('Audio context waits for a real browser activation before creation or resume',async()=>{
  let created=0,resumed=0;
  class AudioContext {
    constructor(){created++;this.state='suspended';this.currentTime=0;this.destination={};}
    createGain(){return {connect(){},gain:{cancelScheduledValues(){}}};}
    resume(){resumed++;this.state='running';return Promise.resolve();}
  }
  const scope={window:{AudioContext},navigator:{userActivation:{isActive:false,hasBeenActive:false}}};
  vm.createContext(scope);
  const source=readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8');
  vm.runInContext(source.slice(0,source.indexOf('const sfxManager = new SFXManager();'))+'\nglobalThis.Manager=SFXManager;',scope);
  const manager=new scope.Manager();manager.init();manager.init(false);
  assert.equal(await manager.loadAsset({src:'test.mp3'}),null);assert.equal(created,0);assert.equal(resumed,0);
  scope.navigator.userActivation.isActive=true;manager.init();
  assert.equal(created,1);assert.equal(resumed,1);
  scope.navigator.userActivation.isActive=false;manager.init();assert.equal(created,1);
});

test('Live Stargazer observation completes without a legacy cast title and commits once',async()=>{
  const sounds=[],created=[];let committed=0,paused=0;
  class Node{
    constructor(){this.style={setProperty(){}};this.classList={add(){},remove(){}};}
    querySelector(){return null;}appendChild(){}setAttribute(){}pauseAnimations(){paused++;}
  }
  const scope={DOMException,window:{document:{createElement:tag=>{created.push(tag);return new Node();},createElementNS:()=>new Node()}}};
  scope.withSkillPresentationStage=async(_step,_context,play)=>play({root:new Node(),frame:new Node(),cards:new Map(),signal:new AbortController().signal,
    el:()=>new Node(),wait:async()=>{},tick:async(_ms,render)=>render(1),resolveResults:async()=>{committed++;}});
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/presentation/stargazer-presentation.js',import.meta.url),'utf8'),scope);
  await scope.playStargazerPresentation({actionId:'sg_observe',outcome:{type:'star',label:'星座'}},{battlefield:true,audioScope:{play:key=>sounds.push(key)}});
  assert.deepEqual(created,['div']);assert.equal(committed,1);assert.equal(paused,1);
  assert.deepEqual(sounds,['stargazer_obv','stargazer_confir']);
});

test('Shared battlefield healing plays the existing recording once per cast and holds its audible beat',async()=>{
  const sounds=[],waits=[],applied=new Set(),scope={performance:{now:()=>100},sfxManager:{play:(key,options)=>sounds.push({key,options})},
    waitForPresentation:async ms=>waits.push(ms),applyAuthoritativeResult:r=>{if(applied.has(r.resultId))return false;applied.add(r.resultId);return true;},
    resolvePresentationTarget:r=>r.targetId,getVisualAnchor:()=>null,battleFeedbackEntries:()=>[]};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/audio/sfx-assets.js',import.meta.url),'utf8'),scope);
  vm.runInContext(readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8'),scope);
  const context={audioScope:scope.createSfxPresentationScope({}),numberCounts:new Map()};
  const result={resultId:'heal-1',targetId:'ally',actualHeal:12};
  scope.commitBattlefieldPlayerResult(result,{sourceRole:'druid'},context);
  scope.commitBattlefieldPlayerResult(result,{sourceRole:'druid'},context);
  scope.commitBattlefieldPlayerResult({...result,resultId:'heal-2',targetId:'other'},{sourceRole:'druid'},context);
  await context.audioScope.hold();
  assert.deepEqual(sounds.map(s=>s.key),['healing_result']);assert.deepEqual(waits,[1400]);
  assert.ok(readFileSync(new URL('../public/assets/sound/sfx/healing.mp3',import.meta.url)).length);
});

test('Druid summons, companion attacks and forms retain their own existing sound cues',async()=>{
  const sounds=[],scope={AugurPresentationEngine:class{},resolveBattlePortrait:()=>({src:null}),preloadPhase5Art:async()=>{},
    resolvePresentationTarget:r=>r.targetId,getVisualAnchor:()=>null,commitBattlefieldPlayerResult(){},applyHpSnapshot(){},
    phase5Pulse(){},phase5Result:async()=>{}};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/audio/sfx-assets.js',import.meta.url),'utf8'),scope);
  const source=readFileSync(new URL('../public/js/presentation/extended-role-effects.js',import.meta.url),'utf8');
  vm.runInContext("const PHASE5_ART={};\n"+source.slice(source.indexOf('async function phase5DruidWhiteGlow(')),scope);
  scope.withBattlefieldSkillStage=async(_step,context,play)=>{
    assert.equal(context.skipCastAudio,true);
    await play({local:{audioScope:{play:key=>sounds.push(key),playResult:key=>sounds.push(key),hold:async()=>{}}},signal:new AbortController().signal,reduced:true,wait:async()=>{}});
  };
  for(const type of ['wolf','treant'])await scope.playBattlefieldDruid({results:[{kind:'damage',minion:{id:type,type}}]},{});
  await scope.playBattlefieldDruid({results:[{kind:'summon',minions:[{id:'wolf',type:'wolf'},{id:'tree',type:'treant'}]}]},{});
  for(const form of ['werewolf','treant'])await scope.playBattlefieldDruid({results:[{kind:'transform',targetAfter:{druidForm:form}}]},{});
  assert.deepEqual(sounds,['wolf_pup_attack','treant_action','wolf_action','treant_action','transform_wolf','transform_treant']);
  for(const file of ['druid-wolf-action-short','druid-wolf-action','druid-treant-action','druid-transform-wolf','druid-transform-treant'])assert.ok(readFileSync(new URL('../public/assets/sound/sfx/'+file+'.mp3',import.meta.url)).length);
  assert.match(vm.runInContext('SFX_ASSETS.wolf_pup_attack.src',scope),/^https:\/\/.+\.supabase.co\/storage\/v1\/object\/public\//);
});

test('Druid self casts glow on the original portrait and reveal results only after the full effect',async()=>{
  for(const form of ['werewolf','treant','bear','summon']) {
    const trace=[],portrait={id:'original-portrait'};let finishAudio;
    const hold=new Promise(resolve=>{finishAudio=resolve;});
    const scope={AugurPresentationEngine:class{},BattleHud:{actorPortrait:()=>portrait},
      resolveBattlePortrait:()=>({src:null}),preloadPhase5Art:async()=>{},getVisualAnchor:()=>null,
      resolvePresentationTarget:r=>r.targetId,minionSound:()=>({key:'wolf_action'}),
      commitBattlefieldPlayerResult:()=>trace.push('commit'),applyHpSnapshot:()=>trace.push('snapshot'),
      phase5Pulse:()=>{throw Error('Self cast must not paint roots or claws');}};
    vm.createContext(scope);
    const source=readFileSync(new URL('../public/js/presentation/extended-role-effects.js',import.meta.url),'utf8');
    vm.runInContext('const PHASE5_ART={};\n'+source.slice(source.indexOf('async function phase5DruidWhiteGlow(')),scope);
    scope.withBattlefieldSkillStage=async(_step,_context,play)=>play({
      local:{audioScope:{play:()=>trace.push('sound'),hold:()=>hold}},signal:new AbortController().signal,
      animate(node,keys){assert.equal(node,portrait);assert.ok(keys.some(k=>k.filter.includes('invert(1)')));trace.push('white');return {cancel:()=>trace.push('glow-finished')};},
      wait:async()=>{},revealRecipient:()=>trace.push('reveal-card')
    });
    const result=form==='summon'?{kind:'summon',targetId:'druid',minions:[{id:'wolf',type:'wolf'}]}:{kind:'transform',targetId:'druid',targetAfter:{druidForm:form}};
    const playback=scope.playBattlefieldDruid({sourceId:'druid',results:[result]},{});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(trace,['sound','white']);
    finishAudio();await playback;
    assert.deepEqual(trace,['sound','white','glow-finished','commit','reveal-card']);
  }
});

test('HUD queue retirement respects reduced motion, playback speed and cancellation',async()=>{
  for(const reduced of [false,true]){
    const nodes=new Map(),motions=[];
    const node=()=>({dataset:{},style:{setProperty(){}},classList:{add(){},remove(){}},appendChild(){},replaceChildren(){},setAttribute(){},remove(){this.removed=true;},
      animate(keys,options){let reject;const motion={keys,options,finished:new Promise((_,r)=>{reject=r;}),cancel(){this.cancelled=true;reject(new DOMException('cancelled','AbortError'));}};motions.push(motion);return motion;}});
    const scope={document:{addEventListener(){},querySelector(){return null;},getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node},
      matchMedia:()=>({matches:reduced}),isBattlefieldPlayerStep:()=>true,roomState:{players:[]},getPlayerAvatarHtml:()=>'',escapeHtml:s=>s};
    vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-hud.js',import.meta.url),'utf8')+'\nglobalThis.hud=BattleHud;',scope);
    const step={type:'player_action',sourceRole:'mage'},controller=new AbortController();
    scope.hud.begin([step]);scope.hud.finish(step,{speed:2,signal:controller.signal});
    assert.equal(motions[0].options.duration,reduced?.5:100);
    assert.equal(motions[0].keys.some(k=>k.translate!==undefined),!reduced);
    controller.abort();await Promise.resolve();await Promise.resolve();assert.equal(motions[0].cancelled,true);
    scope.hud.begin([step]);scope.hud.finish(step);scope.hud.reset();assert.equal(motions[1].cancelled,true);
  }
});

test('Sage feedback follows the battlefield actor and selected enemy in both phases',async()=>{
  const scope={innerWidth:1440,innerHeight:810,getBattleEffectAnchor:()=>({rect:{width:75,height:85}})};vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/sage-skill-presentation.js',import.meta.url),'utf8'),scope);
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
    vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8'),scope);
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
test('Multiplayer shares priority-ordered authority and waits for every matching presentation ACK',t=>{
  const {room,player,events}=fixture(t,'mage');room.addPlayer({id:'bard',join(){},emit(){}},'Bard');room.selectRole('bard','bard');
  room.handleBattleEvent(null,false,{col:1});for(const enemy of room.enemies){enemy.hp=1000;enemy.maxHp=1000;}
  player.action='basic';room.players.bard.action='b_heal';room.resolveTurnActions();
  const queue=resolutionQueue(events),actions=queue.filter(s=>s.type==='player_action'&&['solo','bard'].includes(s.sourceId));
  assert.equal(actions[0].sourceId,'bard','heal priority precedes the earlier joined attacker');
  const ids=queue.flatMap(s=>(s.results||[]).map(r=>r.resultId));assert.equal(new Set(ids).size,ids.length);
  const id=room.battlePresentationId,round=room.battleRound;
  room.handlePresentationComplete('solo',id,round);assert.equal(room.battleRound,round);assert.equal(room.pendingPresentationAcks.size,1);
  room.handlePresentationComplete('bard',id-1,round);assert.equal(room.pendingPresentationAcks.size,1);
  room.handlePresentationComplete('bard',id,round);assert.equal(room.battleRound,round+1);
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
function samuraiBattle(t,stacks=[0,0,0],otherRole=null) {
  const f=fixture(t,'samurai'),{room,player}=f;
  if(otherRole){
    room.addPlayer({id:'other',join(){},emit(){}},'另一角色');
    room.selectRole('other',otherRole==='samurai'?'warrior':otherRole);
    // Imported/constructed parties can contain duplicate roles even though the lobby prevents selection.
    if(otherRole==='samurai')Object.assign(room.players.other,{role:'samurai',ATK_base:13,DEF:6,hp:80,maxHp:80});
    room.players.other.action='skip';
  }
  room.handleBattleEvent(null,false,{col:1});
  room.setEnemies(stacks.map((_,i)=>room.createEnemyInstance({id:'zanshin_dummy_'+i,name:'殘心目標'+i,hp:10000,attack:0,defense:0,noBonusResistance:true},i,{tier:'ELITE',rng:()=>0})));
  player.targetEnemyId=room.enemies[0].instanceId;
  room.enemies.forEach((enemy,i)=>{enemy.hp=10000;enemy.maxHp=10000;enemy.DEF=0;enemy.resistances={physical:0,magic:0,effect:100};room.addZanshin(player,enemy,stacks[i]);});
  t.mock.method(Math,'random',()=>.99);
  return f;
}
function samuraiCast(f,action) {
  f.player.action=action;f.room.resolveTurnActions();
  return resolutionQueue(f.events).filter(s=>s.sourceId===f.player.id&&s.actionId===action);
}
test('Samurai soul is derived per source, caps each enemy and survives ordinary cleansing/round expiry',t=>{
  const {room,player}=samuraiBattle(t,[8,8,8],'samurai');
  const other=room.players.other;
  assert.equal(room.addZanshin(player,room.enemies[0],3),0);
  room.addZanshin(other,room.enemies[0],2);
  player.soul=999; // Legacy writes cannot override authoritative marks.
  const snap=room.getHpSnapshot();
  assert.equal(snap.players.find(p=>p.id===player.id).soul,24);
  assert.equal(snap.players.find(p=>p.id===other.id).soul,2);
  assert.equal(snap.players.find(p=>p.id===player.id).resourceSummary,'武魂：24');
  room.enemies[0].p8Effects={};room.battleRound+=5;room.p8Expire(room.enemies[0]);
  const statuses=room.formatEnemySnapshot(room.enemies[0]).statuses.filter(s=>s.label==='殘心');
  assert.deepEqual(statuses.map(s=>[s.stacks,s.turns,s.icon]),[[8,undefined,'debuff'],[2,undefined,'debuff']]);
  room.clearZanshin(player.id);assert.equal(room.getSamuraiSoul(other),2);assert.equal(room.getSamuraiSoul(player),0);
  room.handleGameOver();assert.equal(room.getSamuraiSoul(other),0);
});
for(const [action,expected] of [['basic',[10,0,0]],['sa_cut',[15,7,7]]])test('Samurai primary-only marking and raw splash: '+action,t=>{
  const f=samuraiBattle(t),[step]=samuraiCast(f,action);
  const hits=step.results.filter(r=>r.kind==='damage');
  assert.deepEqual(f.room.enemies.map(e=>hits.find(r=>r.targetEnemyId===e.instanceId)?.actualDamage||0),expected);
  assert.deepEqual(f.room.enemies.map(e=>e.zanshin?.[f.player.id]||0),[1,0,0]);
  assert.equal(step.hpSnapshot.players.find(p=>p.id===f.player.id).soul,1);
  assert.equal(resolutionQueue(f.events).filter(s=>s.sourceId===f.player.id&&s.actionId===action).length,1);
});
test('Samurai failed hits do not mark; cut burst caps at 70% and each splash mitigates independently',t=>{
  const f=samuraiBattle(t,[8,8,8]);
  f.room.enemies[0].resistances.physical=80;f.room.enemies[1].DEF=50;f.room.enemies[2].resistances.physical=50;
  t.mock.method(Math,'random',()=>.699);
  const [step]=samuraiCast(f,'sa_cut');
  assert.equal(step.outcome.type,'soul_burst');
  assert.deepEqual(step.results.filter(r=>r.kind==='damage').map(r=>r.actualDamage),[5,7,7]);
  const g=samuraiBattle(t,[8,8,8]);t.mock.method(Math,'random',()=>.7);
  assert.equal(samuraiCast(g,'sa_cut')[0].outcome.type,'normal');
  const h=samuraiBattle(t);
  t.mock.method(h.room,'p8DamageMonster',()=>0);
  samuraiCast(h,'basic');assert.equal(h.room.getSamuraiSoul(h.player),0);
});
for(const stacks of [[4],[8],[8,8,8],[1,2,1]])test('Tsubame fixes N full-party segments in exactly one Action: '+stacks.join('/'),t=>{
  const f=samuraiBattle(t,stacks),N=stacks.reduce((a,b)=>a+b),steps=samuraiCast(f,'sa_tsubame');
  assert.equal(steps.length,1);const step=steps[0],hits=step.results.filter(r=>r.kind==='damage');
  assert.equal(step.outcome.segments,N);assert.equal(hits.length,N*stacks.length);
  assert.equal(new Set(hits.map(r=>r.resultId)).size,hits.length);
  for(let i=0;i<N;i++){
    const segment=hits.filter(r=>r.segmentIndex===i);
    assert.deepEqual(segment.map(r=>r.rawDamage),stacks.map(n=>i<n?10:2));
    assert.deepEqual(segment.map(r=>r.actualDamage),segment.map(r=>r.rawDamage));
    assert.deepEqual(segment.map(r=>r.zanshinConsumed),stacks.map(n=>i<n?1:0));
  }
  if(stacks.join('/')==='1/2/1')assert.deepEqual(f.room.enemies.map(e=>10000-e.hp),[16,24,16]);
  assert.equal(f.room.getSamuraiSoul(f.player),0);assert.equal(f.player.soul,0);
  assert.ok(f.room.enemies.every(e=>!(e.zanshin?.[f.player.id])));
  const scope={};vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8').split('function battlefieldAnchor')[1].replace(/^/,'function battlefieldAnchor'),scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/samurai-presentation.js',import.meta.url),'utf8'),scope);
  const plan=scope.buildSamuraiPresentationPlan(scope.adaptLegacyPresentationStep(step),{});
  assert.equal(plan.hits.length,hits.length);assert.equal(plan.audio.length,N);
  assert.equal(new Set(plan.hits.map(h=>h.time)).size,N);
  assert.ok(plan.hits.every(h=>h.time<plan.duration));
  assert.equal(plan.startSouls+plan.soulChanges.reduce((n,c)=>n+c.delta,0),0);
});
for(const soul of [1,2,3])test('Tsubame accepts every positive soul count at resolution: '+soul,t=>{
  const f=samuraiBattle(t,[soul]),[step]=samuraiCast(f,'sa_tsubame');
  assert.equal(step.outcome.type,'tsubame');
  assert.equal(step.outcome.segments,soul);
  assert.equal(step.results.filter(r=>r.kind==='damage').length,soul);
  assert.equal(f.room.enemies[0].hp,10000-soul*10);
  assert.equal(f.room.getSamuraiSoul(f.player),0);
});

test('Tsubame ignores physical resistance, combines separately rounded B/R once before DEF and retains gear',t=>{
  const f=samuraiBattle(t,[4,0,0]);f.player.PAtk_gear=8;
  assert.equal(f.room.skillValue(f.player,'sa_tsubame'),3);assert.equal(f.room.skillValue(f.player,'sa_zanshin'),10);
  f.player.equips=[{id:'sa_oboro'},{id:'sa_oboro'},{id:'sa_murasame'}];f.player.hp=40;f.player.maxHp=80;
  f.room.enemies.forEach(e=>{e.DEF=50;e.resistances.physical=100;});
  const [step]=samuraiCast(f,'sa_tsubame'),hits=step.results.filter(r=>r.kind==='damage');
  // 13 * (1 + .2 + .125) -> floor 17, then a single 50% DEF reduction -> 8.
  assert.equal(hits[0].baseDamage,13);assert.equal(hits[0].rawDamage,17);assert.equal(hits[0].actualDamage,8);
  assert.equal(hits[1].actualDamage,1);assert.equal(hits[2].actualDamage,1);
});
test('Tsubame consumes only its source; simultaneous deaths transfer after the whole segment',t=>{
  const f=samuraiBattle(t,[3,2,0],'samurai'),{room,player}=f;
  const other=room.players.other;other.action='skip';room.addZanshin(other,room.enemies[0],4);
  room.enemies[0].hp=1;room.enemies[1].hp=1;
  const [step]=samuraiCast(f,'sa_tsubame'),hits=step.results.filter(r=>r.kind==='damage');
  assert.equal(step.outcome.segments,5);
  assert.deepEqual(hits.filter(r=>r.segmentIndex===0).map(r=>r.rawDamage),[10,10,2]);
  assert.equal(hits.find(r=>r.segmentIndex===1).rawDamage,10);
  assert.equal(hits.length,7);
  assert.ok(hits.every(r=>r.targetBefore.hp>0));
  assert.equal(room.getSamuraiSoul(player),0);assert.equal(room.getSamuraiSoul(other),4);
  assert.ok(hits.find(r=>r.segmentIndex===0&&r.targetEnemyId===room.enemies[2].instanceId).zanshinTransfers.some(v=>v.sourceId===player.id&&v.amount===3));
});
for(const souls of [1,2,3,4,8,12,24])test('Lethal Tsubame retains every visual segment without postmortem damage: '+souls,t=>{
  const stacks=Array.from({length:Math.ceil(souls/8)},(_,i)=>Math.min(8,souls-i*8));
  const f=samuraiBattle(t,stacks);f.room.enemies.forEach(e=>e.hp=1);
  const [step]=samuraiCast(f,'sa_tsubame'),scope={};vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8').split('function battlefieldAnchor')[1].replace(/^/,'function battlefieldAnchor'),scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/samurai-presentation.js',import.meta.url),'utf8'),scope);
  const plan=scope.buildSamuraiPresentationPlan(scope.adaptLegacyPresentationStep(step),{});
  assert.equal(plan.hits.length,stacks.length);assert.equal(plan.slashes.length,souls);
  assert.equal(plan.audio.length,souls);assert.equal(plan.slashes.filter(h=>h.visualOnly).length,souls-1);
  assert.ok(plan.slashes.filter(h=>h.visualOnly).every(h=>!h.result));
  assert.equal(f.room.getSamuraiSoul(f.player),0);
});
test('Tsubame stops damage after a lethal group segment and zero soul rejects lock',t=>{
  const f=samuraiBattle(t,[8,8,8]);f.room.enemies.forEach(e=>e.hp=1);
  const [step]=samuraiCast(f,'sa_tsubame');assert.equal(step.results.filter(r=>r.kind==='damage').length,3);
  assert.equal(step.outcome.segments,24);assert.equal(f.room.getSamuraiSoul(f.player),0);
  const g=samuraiBattle(t,[0]);
  g.room.selectionState='SELECTING';
  assert.equal(g.room.lockAction(g.player.id,'sa_tsubame').success,false);
  g.room.addZanshin(g.player,g.room.enemies[0]);
  const locked=g.room.lockAction(g.player.id,'sa_tsubame');assert.equal(locked.success,true,locked.message);
});
for(const [remaining,existing,expected] of [[5,[7,3],[8,7]],[7,[0,0],[3,4]],[8,[8,7],[8,8]],[5,[],[]]])test('Shared death sweep redistributes with capacity and random remainders: '+remaining+'/'+existing,t=>{
  const f=samuraiBattle(t,[remaining,...existing]),{room,player}=f;
  room.enemies[0].hp=0;sweepEnemyDeaths(room);
  assert.deepEqual(room.enemies.slice(1).map(e=>e.zanshin?.[player.id]||0),expected);
  assert.deepEqual(room.enemies[0].zanshin,{});
  const total=room.getSamuraiSoul(player);sweepEnemyDeaths(room);assert.equal(room.getSamuraiSoul(player),total);
});
test('Shared death sweep pools simultaneous deaths and another profession killing a marked enemy',t=>{
  const f=samuraiBattle(t,[3,4,0]);f.room.enemies[0].hp=0;f.room.enemies[1].hp=0;sweepEnemyDeaths(f.room);
  assert.equal(f.room.enemies[2].zanshin[f.player.id],7);
  const g=samuraiBattle(t,[3,0,0],'mage');g.player.action='skip';
  const mage=g.room.players.other;mage.action='basic';mage.targetEnemyId=g.room.enemies[0].instanceId;g.room.enemies[0].hp=1;
  g.room.resolveTurnActions();assert.equal(g.room.getSamuraiSoul(g.player),3);
  assert.deepEqual(g.room.enemies.slice(1).map(e=>e.zanshin?.[g.player.id]||0),[1,2]);
});
for(const [stacks,haori,murasame,expected] of [
  [[4,1,0],true,false,[5,1,1]],[[1,1],true,false,[1,3]],[[0],true,false,[2]],[[8],true,false,[8]],[[2,0],true,true,[3,0]]
])test('Kyoutou marks once using the same highest/lowest snapshot: '+stacks+'/'+haori+'/'+murasame,t=>{
  const f=samuraiBattle(t,stacks),{room,player}=f;
  player.equips=[...(haori?[{id:'sa_haori'}]:[]),...(murasame?[{id:'sa_murasame'}]:[])];
  t.mock.method(room,'roleRandom',()=> 'success');
  const first=room.p8Incoming(player,10,n=>n);
  room.p8Incoming(player,10,n=>n);room.p8Incoming(player,10,n=>n,{kind:'dot'});
  assert.equal(first.damage,murasame?5:0);assert.equal(player.parriedCount,2);
  assert.deepEqual(room.enemies.map(e=>e.zanshin?.[player.id]||0),expected);
  const soul=room.getSamuraiSoul(player),queue=[];room.p8EndRound(queue,[],raw=>({dmg:raw}));
  assert.equal(queue.filter(s=>s.actionId==='sa_counter').length,1);
  const counter=queue.find(s=>s.actionId==='sa_counter');
  const hits=counter.results.filter(r=>r.kind==='damage');
  assert.equal(hits.length,stacks.length);
  assert.deepEqual(hits.map(r=>r.finalDamage),stacks.map(()=>murasame?24:5));
  assert.equal(room.getSamuraiSoul(player),soul);
});
test('Murasame disables Haori HP and repeated refresh never drifts',t=>{
  const {room,player}=samuraiBattle(t,[0]);
  player.equips=[{id:'sa_haori',bonusHp:20},{id:'sa_murasame',bonusHp:-15}];player.maxHp=85;player.hp=85;
  room.p8RefreshEquipment();assert.equal(player.maxHp,65);assert.equal(player.hp,65);
  room.p8RefreshEquipment();assert.equal(player.maxHp,65);
  player.equips=[{id:'sa_haori',bonusHp:20}];player.maxHp+=15;player.hp+=15;
  room.p8RefreshEquipment();assert.equal(player.maxHp,100);assert.equal(player.hp,100);
});
test('Lethal Samurai hit pools the newly added mark and returns transfers in the same Action',t=>{
  const f=samuraiBattle(t,[3,0,0]);f.room.enemies[0].hp=1;
  const [step]=samuraiCast(f,'basic');
  assert.equal(f.room.getSamuraiSoul(f.player),4);
  assert.deepEqual(f.room.enemies.slice(1).map(e=>e.zanshin[f.player.id]),[2,2]);
  assert.ok(step.results.filter(r=>r.kind==='status').some(r=>r.targetAfter.statuses.some(s=>s.label==='殘心'&&s.stacks===2)));
});
test('Samurai asset waits settle on completion, timeout and already-cancelled signals',async()=>{
  const scope={AbortController,DOMException,setTimeout,clearTimeout};vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/samurai-presentation.js',import.meta.url),'utf8'),scope);
  assert.equal(await scope.samuraiAbortable(Promise.resolve(7),undefined,100),7);
  await assert.rejects(scope.samuraiAbortable(new Promise(()=>{}),undefined,5),/timed out/);
  const c=new AbortController();c.abort();
  await assert.rejects(scope.samuraiAbortable(Promise.reject(new Error('decode failed')),c.signal,100),{name:'AbortError'});
});
test('Tsubame battlefield playback commits every 24x3 result in order with one opening and full resource updates',async t=>{
  const f=samuraiBattle(t,[8,8,8]),[step]=samuraiCast(f,'sa_tsubame');
  const scope={AbortController,DOMException,setTimeout,clearTimeout},commits=[],audio=[],frames=[];
  vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8').split('function battlefieldAnchor')[1].replace(/^/,'function battlefieldAnchor'),scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/samurai-presentation.js',import.meta.url),'utf8'),scope);
  vm.runInContext(readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8'),scope);
  scope.preloadSamuraiFxAssets=async()=>{};
  scope.commitBattlefieldPlayerResult=r=>commits.push(r);
  scope.createSamuraiPrototypeRenderer=()=>({measure(){},render(time){frames.push(time);},dispose(){},reduceFlash(){}});
  scope.document={createElement:()=>({})};
  scope.battlefieldVisualElement=()=>null;
  scope.withBattlefieldSkillStage=async(_step,context,play)=>play({root:{dataset:{},classList:{add(){}}},local:{audioScope:{play:key=>audio.push(key)}},reduced:false,
    timeline:async(duration,render)=>{for(let time=0;time<duration;time+=30)render(time/duration);render(1);},resolveResults:async()=>{}});
  await scope.playBattlefieldSamurai(step,{});
  assert.deepEqual(commits.map(r=>r.resultId),step.results.map(r=>r.resultId));
  assert.equal(commits.filter(r=>r.kind==='damage').length,72);
  assert.equal(audio.filter(key=>key==='samurai-skill').length,1);
  assert.equal(audio.filter(key=>key==='samurai-skill2-intro').length,1);
  assert.ok(frames.at(-1)>1140+23*45);
});
function resolutionQueue(events) {
  return events.filter(e => e[0] === 'battle:presentation_queue').at(-1)?.[1].queue || [];
}

function onmyojiBattle(t) {
  const f=phase1Battle(t,'onmyoji',1000);
  t.mock.method(Math,'random',()=>.5);
  const enemy=f.room.enemies[1];
  Object.assign(enemy,{DEF:0,defense:0,resistances:{physical:0,magic:0,effect:0},talismans:[],attack:0});
  f.player.rolledTalisman='seal';
  return {...f,enemy};
}
for(const [name,equips,resistance,expected] of [
  ['initial',[],0,15],['magic gear',[{bonusMagAtk:8}],0,23],
  ['physical gear excluded',[{bonusPhysAtk:80}],0,15],['magic resistance',[],20,12]
])test('Onmyoji direct talisman damage: '+name,t=>{
  const {room,player,enemy,events}=onmyojiBattle(t);
  player.equips=equips;enemy.resistances.magic=resistance;player.action='onm_talisman';
  room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.actionId==='onm_talisman');
  const hits=step.results.filter(r=>r.kind==='damage'&&r.finalDamage>0);
  assert.deepEqual(hits.map(r=>r.finalDamage),[expected]);
  assert.equal(enemy.hp,1000-expected);assert.deepEqual(enemy.talismans,['seal']);
  assert.equal(hits[0].targetBefore.hp-hits[0].targetAfter.hp,expected);
  assert.ok(step.detail.includes(`**${expected}**`));
});
test('Onmyoji capped target still takes damage; lethal direct hit never rolls or attaches a talisman',t=>{
  const {room,player,enemy,events}=onmyojiBattle(t);
  enemy.talismans=Array(10).fill('seal');player.action='onm_talisman';room.resolveTurnActions();
  assert.equal(enemy.hp,985);assert.equal(enemy.talismans.length,10);
  let step=resolutionQueue(events).find(s=>s.actionId==='onm_talisman');
  assert.equal(step.results.filter(r=>r.finalDamage>0).length,1);
  enemy.hp=10;enemy.talismans=[];player.action='onm_talisman';
  t.mock.method(room,'roleRandom',()=>{throw new Error('dead target must not roll a talisman');});
  room.resolveTurnActions();assert.equal(enemy.hp,0);assert.deepEqual(enemy.talismans,[]);
});
for(const count of [0,1,2])test('Onmyoji first drain retains existing stack rule: '+count+' prior drains',t=>{
  const {room,player,enemy,events}=onmyojiBattle(t);
  enemy.talismans=Array(count).fill('drain');player.rolledTalisman='drain';player.action='onm_talisman';
  room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.actionId==='onm_talisman');
  assert.deepEqual(step.results.filter(r=>r.finalDamage>0).map(r=>r.finalDamage),[15,50*(count+1)]);
  assert.equal(enemy.hp,1000-15-50*(count+1));
});
test('Onmyoji brush and leader drain use 5% without changing their stack rules',t=>{
  const {room,player,enemy,events}=onmyojiBattle(t);
  player.equips=[{id:'onm_brush'}];player.rollBrushTalisman=0;player.rolledTalisman='drain';player.action='basic';
  room.resolveTurnActions();
  let step=resolutionQueue(events).find(s=>s.actionId==='basic'&&s.sourceId===player.id);
  assert.deepEqual(step.results.filter(r=>r.finalDamage>0).map(r=>r.finalDamage),[10,50]);
  enemy.hp=1000;enemy.talismans=[];player.action='onm_all_talismans';room.resolveTurnActions();
  step=resolutionQueue(events).find(s=>s.actionId==='onm_all_talismans');
  assert.equal(enemy.hp,900);assert.equal(enemy.permanentTalismans.length,10);
  assert.equal(step.results.filter(r=>r.finalDamage>0).reduce((n,r)=>n+r.finalDamage,0),100);
});
for(const [equipped,roll,kept] of [[false,.349,false],[false,.35,true],[true,.199,false],[true,.20,true]])
test(`Onmyoji independent drop threshold: kariginu=${equipped}, roll=${roll}`,t=>{
  const {room,player,enemy}=onmyojiBattle(t);
  player.equips=equipped?[{id:'onm_kariginu'}]:[];
  enemy.talismans=['drain','drain'];let calls=0;enemy.talismanDropRng=()=>{calls++;return roll;};
  room.executeRoundStart();
  assert.equal(calls,2);assert.equal(enemy.talismans.length,kept?2:0);
  assert.equal(enemy.hp,kept?900:1000);
});
test('Onmyoji permanent and temporarily locked talismans bypass natural dropping',t=>{
  const {room,enemy}=onmyojiBattle(t);
  enemy.talismans=['drain'];enemy.permanentTalismans=['drain'];
  enemy.talismanDropRng=()=>{throw new Error('locked talismans must not roll');};
  room.executeRoundStart();assert.equal(enemy.hp,950);assert.deepEqual(enemy.talismans,['drain']);
  enemy.permanentTalismans=[];enemy.talismansLockedTurns=1;
  room.executeRoundStart();assert.equal(enemy.hp,900);assert.equal(enemy.talismansLockedTurns,0);
});
test('Onmyoji production animation commits each damage result once, including capped and lethal hits',async t=>{
  const {room,player,enemy,events}=onmyojiBattle(t);
  const scope={AugurPresentationEngine:class {}};vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/extended-role-effects.js',import.meta.url),'utf8'),scope);
  let committed=[],flights=0;
  Object.assign(scope,{
    preloadPhase5Art:async()=>{},battlefieldPlayerTarget:s=>s.targetEnemyId,
    resolvePresentationTarget:r=>r.targetId,
    withBattlefieldSkillStage:async(s,c,fn)=>fn({wait:async()=>{},animate(){}}),
    phase5Pulse(){},phase5Image:()=>({dataset:{}}),phase5Fly:async()=>{flights++;},
    phase5Result:async(s,step,r)=>{committed.push(r);},applyHpSnapshot(){}
  });
  for(const state of ['drain','capped','lethal']){
    enemy.hp=state==='lethal'?10:1000;enemy.talismans=state==='capped'?Array(10).fill('seal'):[];
    player.rolledTalisman='drain';player.action='onm_talisman';room.resolveTurnActions();
    const step=resolutionQueue(events).find(s=>s.actionId==='onm_talisman');
    committed=[];flights=0;await scope.playBattlefieldOnmyoji(step,{});
    assert.deepEqual(committed,step.results);
    assert.equal(flights,state==='drain'?2:1);
    const hits=committed.filter(r=>r.finalDamage>0);
    assert.equal(hits.length,state==='drain'?2:1);
    assert.equal(hits.reduce((sum,r)=>sum+r.actualDamage,0),state==='drain'?65:state==='lethal'?10:15);
  }
});
for(const [count,mirror,expected] of [[0,false,0],[1,false,13],[10,false,40],[10,true,60],[12,false,40]])
test(`Onmyoji detonation unchanged: ${count} charms, mirror=${mirror}`,t=>{
  const {room,player,enemy,events}=onmyojiBattle(t);
  enemy.talismans=Array(count).fill('blind');enemy.permanentTalismans=[...enemy.talismans];
  player.equips=mirror?[{id:'onm_mirror'}]:[];player.action='onm_detonate';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.actionId==='onm_detonate');
  assert.equal(step.results.reduce((n,r)=>n+(r.finalDamage||0),0),expected);
  assert.equal(enemy.hp,1000-expected);assert.deepEqual(enemy.talismans,[]);
  assert.deepEqual(enemy.permanentTalismans,[]);assert.equal(player.cooldowns.onm_detonate,2);
});
test('Equation integer shares conserve the total in stable server formation order',()=>{
  for(const [total,count,expected] of [[30,1,[30]],[30,2,[15,15]],[30,3,[10,10,10]],[31,3,[11,10,10]],[15,4,[4,4,4,3]]]){
    const enemies=Array.from({length:count},(_,i)=>({instanceId:'enemy_'+i}));
    const shares=splitEquationDamage(total,enemies);
    assert.deepEqual(shares.map(s=>s.damage),expected);
    assert.deepEqual(shares.map(s=>s.enemyId),enemies.map(e=>e.instanceId));
    assert.equal(shares.reduce((n,s)=>n+s.damage,0),total);
  }
  assert.deepEqual(splitEquationDamage(31,[]),[]);
});
function equationBattle(t,operand=75){
  const f=phase1Battle(t,'sage',1000),{room,player}=f;
  room.battleRound=2;player.sagePhase='solve';player.sageOperand=operand;player.sageX=0;
  player.sageLastAction='basic';player.sageEquationResolved=false;
  room.roleRandom=()=> 'NOTHING';
  room.monsterAllowsEffect=()=>true;
  return f;
}
test('Equation resolves once across legal enemies, independently mitigates and previews server shares',t=>{
  const {room,player}=equationBattle(t);const queue=[],calls=[];
  room.enemies[1].resistances.physical=50;room.enemies[2].hp=0;
  const preview=sageEquationPreview(player,room);assert.equal(preview.livingEnemyCount,2);
  assert.equal(preview.options[0].distribution.reduce((n,s)=>n+s.damage,0),preview.options[0].damageAfterEquipment);
  const resistance=(raw,type,{enemy})=>{calls.push({id:enemy.instanceId,raw,type});return {dmg:Math.floor(raw*(1-(enemy.resistances?.physical||0)/100))};};
  room.p8ResolveEquation(player,queue,[],resistance);
  assert.deepEqual(calls.map(c=>c.raw),[15,15]);
  assert.equal(queue.length,1);assert.equal(queue[0].results.filter(r=>r.kind==='damage').length,2);
  assert.ok(room.enemies.slice(0,2).every(e=>e.p8Effects.sage_exposed));
  assert.equal(room.enemies[2].p8Effects?.sage_exposed,undefined);
  assert.equal(player.sageX,10);room.p8ResolveEquation(player,queue,[],resistance);assert.equal(queue.length,1);
});
test('PRIME reallocates its total 15 only after lethal main hits; cooldown reset and growth occur once',t=>{
  const {room,player}=equationBattle(t,79);const queue=[];room.enemies[0].hp=1;
  player.cooldowns.sge_deduce=3;
  room.p8ResolveEquation(player,queue,[],raw=>({dmg:raw}));
  const step=queue[0],main=step.results.filter(r=>r.presentationBeat==='equation_main'),prime=step.results.filter(r=>r.presentationBeat==='equation_prime');
  assert.equal(main.reduce((n,r)=>n+r.equationShare,0),32);
  assert.deepEqual(prime.map(r=>r.equationShare),[8,7]);assert.ok(prime.every(r=>r.targetBefore.hp>0));
  assert.equal(player.cooldowns.sge_deduce,0);assert.equal(player.sageX,10);
});
test('EVEN shield uses summed actual main damage once; SQUARE independently marks survivors',t=>{
  const {room,player}=equationBattle(t,100);const queue=[];
  room.p8ResolveEquation(player,queue,[],raw=>({dmg:raw}));
  assert.equal(queue[0].outcome.totalShield,16);assert.equal(queue[0].outcome.shields.length,1);
  assert.ok(room.enemies.every(e=>e.p8Effects.sage_square));
  assert.equal(player.tempHp,Math.min(16,Math.floor(player.maxHp*.2)));
});
test('Equation excludes immunity and arena outsiders at resolution; no dead-target damage survives normalization',t=>{
  const {room,player}=equationBattle(t);room.enemies[0].untargetableThisRound=true;
  room.enemyArena={playerId:player.id,enemyId:room.enemies[1].instanceId};
  assert.deepEqual(room.getAttackableEnemies(player).map(e=>e.instanceId),[room.enemies[1].instanceId]);
  const queue=[];room.p8ResolveEquation(player,queue,[],raw=>({dmg:raw}));
  assert.equal(queue[0].results.filter(r=>r.kind==='damage').length,1);
  for(const e of room.enemies)e.hp=0;
  assert.equal(room.getTargetEnemy(),null);room.p8Results=[];
  assert.equal(room.p8DamageMonster(player,20,'phys',()=>{throw Error('dead enemy reached resistance');}),0);
  assert.equal(room.p8Results.length,0);
  const before={instanceId:'dead',hp:0,maxHp:20},lethal={instanceId:'live',hp:5,maxHp:20};
  const wire=[{hpSnapshotBefore:{players:[],enemies:[before,lethal]},results:[{kind:'damage',targetId:'dead',targetBefore:before,targetAfter:before},{kind:'damage',targetId:'live',targetBefore:lethal,targetAfter:{...lethal,hp:0}}]}];
  normalizeCombatQueue(wire,'corpse-regression');assert.equal(wire[0].results.length,1);assert.equal(wire[0].results[0].actualDamage,5);
});
test('Lethal party hit suppresses later allies, assassin pursuit and druid companions without losing the killing hit',t=>{
  for(const role of ['warrior','druid']){
    const {room,player,events}=fixture(t,role);
    room.addPlayer({id:'shadow',join(){},emit(){}},'Shadow');room.selectRole('shadow','assassin');
    room.handleBattleEvent(null,false,{col:1});room.setEnemies([room.enemies[0]]);room.currentMonster.hp=1;
    const shadow=room.players.shadow;shadow.action='basic';shadow.isHiddenThisRound=true;
    player.action='basic';
    if(role==='druid')player.minions=[{id:'wolf',type:'wolf',name:'Wolf',hp:20,maxHp:20,atk:10}];
    t.mock.method(Math,'random',()=>0);room.resolveTurnActions();
    const queue=resolutionQueue(events),hits=queue.flatMap(s=>s.results||[]).filter(r=>r.kind==='damage'&&r.targetEnemyId);
    assert.equal(hits.length,1);assert.equal(hits[0].targetBefore.hp,1);assert.equal(hits[0].targetAfter.hp,0);
    assert.ok(!queue.some(s=>s.category==='FOLLOW_UP'||s.category==='MINION_ATTACK'||s.sourceId==='shadow'));
  }
});
test('Next ally retargets a killed selection using the existing stable living-target rule',t=>{
  const {room,player,events}=fixture(t,'warrior');room.addPlayer({id:'second',join(){},emit(){}},'Second');room.selectRole('second','mage');
  room.handleBattleEvent(null,false,{col:1});const template=room.currentMonster;
  room.setEnemies([room.createEnemyInstance(template,0,{tier:'MINION'}),room.createEnemyInstance(template,1,{tier:'MINION'})]);
  room.enemies[0].hp=1;room.enemies[1].hp=1000;room.enemies[1].maxHp=1000;
  for(const actor of [player,room.players.second]){actor.action='basic';actor.targetEnemyId=room.enemies[0].instanceId;}
  room.resolveTurnActions();
  const second=resolutionQueue(events).find(s=>s.sourceId==='second'&&s.actionId==='basic');
  assert.ok(second);assert.ok(second.results.filter(r=>r.kind==='damage'&&r.targetEnemyId).every(r=>r.targetEnemyId===room.enemies[1].instanceId&&r.targetBefore.hp>0));
});
test('Equation confusion, decay and scheduled debt remain one resolution even with three enemies',t=>{
  const {room,player}=equationBattle(t,79),queue=[];player.sageX=100;player.sageLastAction='sge_induce';room.roleRandom=()=> 'CONFUSION';
  room.p8ResolveEquation(player,queue,[],raw=>({dmg:raw}));
  const outcome=queue[0].outcome;
  assert.equal(outcome.equationDamage,Math.round(Math.round(79*(.4+1.75*100/180))*.8));
  assert.equal(outcome.distribution.reduce((n,s)=>n+s.damage,0),outcome.equationDamage);
  assert.equal(queue[0].results.filter(r=>r.presentationBeat==='sage_confusion').length,1);
  assert.equal(player.sageX,96);assert.equal(player.sageDebt,20);assert.equal(outcome.baseXGain,4);
});
for(const [role,actions] of Object.entries({warrior:['basic','w_strike','w_shield'],mage:['basic','m_blast','m_drain'],assassin:['basic','s_stab','s_smoke'],bard:['basic','b_heal','b_buff'],paladin:['basic','pal_glory','pal_grace'],alchemist:['basic','alc_flask','alc_fate'],archer:['basic','a_rain','a_shot'],stargazer:['basic','sg_observe','sg_clock'],dreamweaver:['basic','dw_butterfly','dw_false_dream'],samurai:['basic','sa_cut','sa_tsubame'],sage:['basic','sge_deduce','sge_induce'],augur:['basic','aug_bind','aug_reckon'],onmyoji:['basic','onm_talisman','onm_detonate'],gladiator:['basic','g_sacrifice','g_arena'],druid:['basic','dru_transform','dru_summon_wolf','dru_summon_treant']})){
  for(const action of actions)test('Phase 4 production battlefield dispatch: '+role+' '+action,t=>{
    const {room,player,events}=phase1Battle(t,role);t.mock.method(Math,'random',()=>.5);
    if(action==='sa_tsubame')room.addZanshin(player,room.enemies[1],8);
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
    vm.runInContext(readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8'),scope);
    assert.equal(scope.isBattlefieldPlayerStep(step),true);
    for(const r of step.results){assert.notEqual(r.targetId,'monster');assert.ok(r.resultId&&r.targetBefore&&r.targetAfter);if(['damage','intercept'].includes(r.kind))assert.ok(r.targetBefore.hp>0,'no attack may begin on a dead target');}
    if(action==='dw_butterfly')assert.equal(scope.battlefieldPlayerTarget(step),player.id);
    if(role==='samurai'){
      vm.runInContext(readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8').split('function battlefieldAnchor')[1].replace(/^/,'function battlefieldAnchor'),scope);
      vm.runInContext(readFileSync(new URL('../public/js/presentation/samurai-presentation.js',import.meta.url),'utf8'),scope);
      const plan=scope.buildSamuraiPresentationPlan(scope.adaptLegacyPresentationStep(step),{});
      const hits=step.results.filter(r=>r.kind==='damage'&&r.targetEnemyId);
      assert.equal(plan.hits.length,hits.length);assert.equal(plan.slashes.length,new Set(plan.hits.filter(h=>!['miss','dodge'].includes(h.result.outcome?.type)).map(h=>h.time)).size);
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
for(const [action,cd] of [['sg_observe',1],['sg_clock',2]])test('Stargazer reduced base cooldown is charged by production: '+action,t=>{
  const {room,player}=phase1Battle(t,'stargazer');t.mock.method(Math,'random',()=>.95);
  assert.equal(getPlayerSkills(player).find(s=>s.id===action).cd,cd);
  player.action=action;room.resolveTurnActions();assert.equal(player.cooldowns[action],cd);
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
const flaskDots = [
  ['poison', 'applyMonsterPoison', '中毒', 2],
  ['burn', 'applyMonsterBurn', '燃燒', 1],
  ['fracture', 'applyMonsterFracture', '骨折', 3],
  ['chill', 'applyMonsterChill', '寒冷', 2]
];
for(const [dot,method,label,turns] of flaskDots){
  test('DoT makes one effective-resistance check and preserves stacking/refresh: '+dot,t=>{
    const {room}=fixture(t,'alchemist'),logs=[];
    t.mock.method(room,'p8Log',text=>logs.push(text));
    const allows=t.mock.method(room,'monsterAllowsEffect');
    let roll=.2;
    const random=t.mock.method(Math,'random',()=>roll);
    for(const resistance of [0,50,100]){
      // 65 - 15 (resistance break) - 10 (flaw) + 10 (bonus) = 50 effective resistance.
      const target={name:'DoT target',hp:100,tier:'ELITE',resistances:{effect:resistance===50?65:resistance},
        ...(resistance===50?{augurResistanceBreak:2,flawMarks:1,enemyEffectResistanceBonus:10}:{}),
        [dot+'Dmg']:7,[dot+'Turns']:9};
      let successes=0;
      for(let i=0;i<100;i++){
        roll=(i+.5)/100;
        const checks=allows.mock.callCount(),draws=random.mock.callCount();
        const applied=room[method](11,turns,target);
        assert.equal(allows.mock.callCount()-checks,1);
        assert.deepEqual(allows.mock.calls.at(-1).arguments,[label,target]);
        assert.equal(random.mock.callCount()-draws,resistance>0?1:0);
        assert.equal(applied,roll>=resistance/100);
        if(applied)successes++;
        assert.equal(target[dot+'Dmg'],7+11*successes);
        assert.equal(target[dot+'Turns'],successes?turns:9);
      }
      assert.equal(successes,100-resistance);
    }
    assert.equal(logs.length,150);
    assert.ok(logs.every(text=>text.includes('【'+label+'】')));
  });

  for(const scenario of [
    {name:'independent splash rolls',rolls:[.49,.5],resistances:[0,0,0]},
    {name:'opposite splash rolls',rolls:[.5,.49],resistances:[0,0,0]},
    {name:'resisted primary still allows both splashes',rolls:[.1,.1],resistances:[0,100,0]},
    {name:'each splash uses its own resistance',rolls:[.1,.1],resistances:[100,0,0]},
    {name:'untriggered splashes never check resistance or log immunity',rolls:[.5,.99],resistances:[100,0,100]},
    {name:'single enemy',rolls:[],resistances:[0]}
  ])test('Flask '+dot+': '+scenario.name,t=>{
    const {room,player,events}=phase1Battle(t,'alchemist',2000);
    if(scenario.resistances.length===1)room.setEnemies([room.enemies[1]]);
    for(const [i,enemy] of room.enemies.entries()){
      enemy.name='Flask target '+i;
      enemy.tier='ELITE';
      enemy.resistances={physical:0,magic:0,effect:scenario.resistances[i]};
      enemy[dot+'Dmg']=7;enemy[dot+'Turns']=9;
    }
    const primary=room.enemies.find(e=>e.instanceId===player.targetEnemyId);
    const secondary=room.enemies.filter(e=>e!==primary);
    player.rolledFlaskDot=dot;player.rollTeamDot=false;player.action='alc_flask';
    const damage=room.skillValue(player,dot),raw=room.skillValue(player,'alc_flask');
    const attempts=[];
    let inResistance=false,splashPhase=false,triggerCount=0;
    const originalAllows=room.monsterAllowsEffect;
    t.mock.method(room,'monsterAllowsEffect',function(effect,target){
      attempts.push(target.instanceId);
      inResistance=true;
      try{return originalAllows.call(this,effect,target);}
      finally{inResistance=false;}
    });
    const originalApply=room[method];
    t.mock.method(room,method,function(dmg,duration,target){
      const result=originalApply.call(this,dmg,duration,target);
      if(target===primary)splashPhase=true;
      return result;
    });
    t.mock.method(Math,'random',()=>{
      if(inResistance)return .75;
      if(splashPhase&&triggerCount<scenario.rolls.length)return scenario.rolls[triggerCount++];
      return .99;
    });
    room.resolveTurnActions();
    const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='alc_flask');
    assert.ok(step);
    assert.equal(triggerCount,scenario.rolls.length);
    assert.deepEqual(attempts,[primary.instanceId,...secondary.filter((_,i)=>scenario.rolls[i]<.5).map(e=>e.instanceId)]);
    assert.equal(step.outcome.type,'alchemy_'+dot);
    for(const enemy of room.enemies){
      const index=secondary.indexOf(enemy);
      const attempted=enemy===primary||scenario.rolls[index]<.5;
      const applied=attempted&&getBossResistance(enemy,'effect')===0;
      const snap=step.hpSnapshot.enemies.find(e=>e.instanceId===enemy.instanceId);
      const status=snap.statuses.find(s=>s.id===dot);
      assert.equal(status.damage,7+(applied?damage:0));
      assert.equal(status.turns,applied?turns:9);
      const hit=step.results.find(r=>r.kind==='damage'&&r.targetEnemyId===enemy.instanceId);
      assert.equal(hit.actualDamage,enemy===primary?raw:Math.floor(raw*.5));
      assert.equal(step.detail.includes('**'+enemy.name+'** 以 100% 效果抗性免疫【'+label+'】'),attempted&&!applied);
      if(applied){
        assert.ok(step.results.some(r=>r.targetEnemyId===enemy.instanceId&&r.targetAfter.statuses.some(s=>s.id===dot&&s.damage===7+damage&&s.turns===turns)));
        if(enemy!==primary)assert.ok(step.detail.includes('**'+enemy.name+'** 陷入【'+label+'】（每回合 '+damage+' 點，持續 '+turns+' 回合）'));
      }
      // Render the authoritative state for every concrete enemy using the existing UI harness.
      const h=enemyPresentationHarness(),node=h.scope.document.createElement('div'),row=h.scope.document.createElement('div');
      node.classList={toggle(){}};node.querySelector=s=>s==='.enemy-status-row'?row:null;
      h.scope.getIconSvg=()=>'<svg></svg>';h.scope.document.addEventListener=()=>{};
      const tooltip=h.scope.document.createElement('div');tooltip.classList={add(){},remove(){}};
      Object.assign(h.scope,{window:{innerWidth:1280,innerHeight:720},elements:{floatingEnemyTooltip:tooltip},roomState:{battleRound:room.battleRound},escapeHtml:s=>String(s??'')});
      vm.runInContext(readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8'),h.scope);
      h.scope.syncEnemyMechanicVisual(snap,node);
      assert.ok(row.children[0].children.some(b=>b.title?.includes('每回合 '+status.damage+' 傷害｜剩餘 '+status.turns+' 回合')));
      h.scope.showEnemyTooltip(snap,node);
      assert.ok(tooltip.innerHTML.includes(status.label+' (每回合 '+status.damage+' 傷害｜剩餘 '+status.turns+' 回合)'));
    }
  });
}
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
test('Phase 4 lethal Tsubame completes four visual cuts without extra damage results',t=>{
  const {room,player,events}=phase1Battle(t,'samurai',1);room.addZanshin(player,room.enemies[1],4);player.action='sa_tsubame';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='sa_tsubame');
  const scope={};vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8').split('function battlefieldAnchor')[1].replace(/^/,'function battlefieldAnchor'),scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/samurai-presentation.js',import.meta.url),'utf8'),scope);
  const plan=scope.buildSamuraiPresentationPlan(scope.adaptLegacyPresentationStep(step),{});
  assert.equal(plan.hits.length,3);assert.equal(plan.slashes.length,4);
  assert.equal(plan.slashes.filter(h=>h.visualOnly).length,3);
  assert.equal(plan.audio.length,4);
  assert.ok(plan.duration>=plan.slashes.at(-1).time+600);
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
  const source=readFileSync(new URL('../public/js/core/app.js',import.meta.url),'utf8');
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
  assert.ok(traps.every(s=>s.category==='STATUS_TICK'&&s.type==='status_action'));
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
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8'),scope);
  const controller=new AbortController();
  const context={signal:controller.signal,speed:4,reducedMotion:true};
  await scope.withBattlefieldSkillStage(step,context,async s=>{assert.ok(context.audioScope);assert.equal(committed.size,0);await s.tick(400,()=>{});await s.resolveResults();await s.resolveResults();});
  assert.equal(committed.size,step.results.length);assert.ok(roots.every(n=>n.removed));assert.equal(frames.size,0);
  await assert.rejects(scope.withBattlefieldSkillStage(step,{signal:controller.signal},async s=>{controller.abort();await s.tick(400,()=>{});}),{name:'AbortError'});
  assert.equal(frames.size,0);assert.ok(roots.every(n=>n.removed));
});
test('Phase 4 Samurai renderer completes real four-hit choreography without a portrait echo or leaked nodes',t=>{
  const {room,player,events}=phase1Battle(t,'samurai');room.addZanshin(player,room.enemies[1],4);player.action='sa_tsubame';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='sa_tsubame');
  const canvas=new Proxy({}, {get:()=>()=>({addColorStop(){}})});
  class Node{
    constructor(){this.children=[];this.style={setProperty(){}};this.dataset={};this.classList={add(){},remove(){},toggle(){}};}
    appendChild(node){this.children.push(node);return node;}remove(){this.removed=true;}
    querySelector(){return new Node();}getBoundingClientRect(){return {left:50,top:100,width:100,height:120};}getContext(){return canvas;}
  }
  const actor=new Node(),target=new Node(),scope={devicePixelRatio:1,document:{createElement:()=>new Node()},battlefieldVisualElement:id=>id===player.id?actor:target};
  vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8').split('function battlefieldAnchor')[1].replace(/^/,'function battlefieldAnchor'),scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/samurai-presentation.js',import.meta.url),'utf8'),scope);
  vm.runInContext(readFileSync(new URL('../public/js/presentation/samurai-animation.js',import.meta.url),'utf8'),scope);
  const plan=scope.buildSamuraiPresentationPlan(scope.adaptLegacyPresentationStep(step),{}),root=new Node();
  const engine=scope.createSamuraiPrototypeRenderer(root,new Node(),new Node(),plan,{battlefield:true,actorId:player.id,targetId:player.targetEnemyId});
  for(const time of [0,240,740,1140,1215,1290,1365,1950]){engine.measure();engine.render(time);engine.reduceFlash();}
  engine.dispose();assert.equal(plan.hits.length,12);
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
  const source=readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8');
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
    const source=readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8');
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
  h.scope.document.querySelectorAll=selector=>selector.includes('teammate-card')?nodes.slice(0,2):selector.includes('.battle-enemy-slot')?nodes.slice(2):[];
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
  assert.equal(h.scope.enemyEventKind({kind:'cleanse'},{actionId:'來源死亡・標記解除'}),'cleanse');
  assert.equal(h.scope.enemyEventKind({kind:'damage',outcome:{type:'dodge'}},{}),'outcome');
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
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-presentation.js',import.meta.url),'utf8'),scope);
  return {scope,roots,commits,waits,frames};
}

test('Chest theft captions and icons use the real stolen item and fly from its owner or squad bag into the chest',async t=>{
  for(const kind of ['equipment','gold']) {
    const {room,enemy,player}=mechanismBattle(t,[SPECIAL_ELITES.treasure_mimic]);
    room.checkDodge=()=>false;room.gold=100;
    if(kind==='equipment')player.equipSlots.WEAPON={id:'sword',name:'被偷的劍',icon:'/assets/equipment/general/精煉短劍.webp',bonusAtk:0};
    t.mock.method(Math,'random',()=>kind==='equipment'?0:.99);
    mechanismRound(room,3);const queue=actMechanism(room,enemy);normalizeCombatQueue(queue,'theft-'+kind);
    const step=queue.find(s=>s.results.some(r=>r.theft)),result=step.results.find(r=>r.theft);
    const h=enemyPresentationHarness(),captions=[],preloaded=[];
    const cloudImage='https://test.supabase.co/storage/v1/object/public/game-assets/images/stolen-sword.webp';
    h.scope.window={assetRegistry:{resolvePath:path=>path==='/assets/equipment/general/精煉短劍.webp'?cloudImage:path}};
    h.scope.preloadPhase5Art=async paths=>preloaded.push(...paths);
    h.scope.getBattleEffectAnchor=id=>id===enemy.instanceId?{x:700,y:250}:{x:100,y:600};
    h.scope.document.getElementById=id=>id==='btnOpenInventory'?{getBoundingClientRect:()=>({left:10,top:20,width:40,height:40})}:null;
    h.scope.announceBattleFeedback=text=>captions.push(text);
    vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
    const root=h.scope.document.createElement('div'),fx=h.scope.createEnemyChoreography(step,result,root,{reduced:false,animations:[],speed:1});
    const layer=root.children[0],caption=layer.children[0],icon=layer.children[1];
    assert.match(caption.textContent,kind==='gold'?/50 枚金幣/:/被偷的劍/);
    if(kind==='gold')assert.match(icon.innerHTML,/#icon-gold/);
    else {assert.equal(icon.children[0].src,cloudImage);assert.equal(icon.children[0].alt,'被偷的劍');}
    fx.render(.12);assert.equal(icon.style.left,kind==='gold'?'30px':'100px');
    fx.render(1);assert.equal(icon.style.left,'700px');assert.equal(icon.style.top,'250px');assert.match(icon.style.transform,/scale\(0\)/);
    fx.remove();assert.equal(layer.isConnected,false);
    await h.scope.playEnemyMechanicPresentation(step,{speed:2});
    if(kind==='equipment')assert.ok(preloaded.includes(cloudImage));
    assert.equal(h.commits.length,1);assert.ok(captions.some(text=>text===caption.textContent));assert.equal(h.frames.size,0);
    await h.scope.playEnemyMechanicPresentation(step,{speed:2});assert.equal(h.commits.length,1);
  }
});

test('Theft artwork resolves explicit, ordinary and exclusive equipment through cloud bindings',()=>{
  const urls={normal:'https://test.supabase.co/normal.webp',exclusive:'https://test.supabase.co/exclusive.webp',custom:'https://test.supabase.co/custom.webp'};
  const scope={window:{assetRegistry:{resolve:key=>key==='equip.warrior.w_sword.icon'?urls.exclusive:'',resolvePath:path=>path===`/assets/equipment/general/${encodeURIComponent('精煉短劍')}.webp`?urls.normal:path===`/assets/equipment/exclusive/${encodeURIComponent('鋼鐵聖劍')}.webp`?urls.exclusive:path}}};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),scope);
  const resolve=item=>scope.mimicTheftEquipmentUrl({kind:'equipment',item});
  assert.equal(resolve({name:'精煉短劍'}),urls.normal);
  assert.equal(resolve({id:'w_sword',name:'鋼鐵聖劍',role:'warrior'}),urls.exclusive);
  assert.equal(resolve({name:'鋼鐵聖劍',slot:'CLASS_EXCLUSIVE'}),urls.exclusive);
  assert.equal(resolve({name:'精煉短劍',icon:urls.custom}),urls.custom);
  assert.equal(resolve({name:'未知物品',icon:'/assets/missing.webp'}),null,'never use a local image URL');
  assert.equal(scope.mimicTheftEquipmentUrl({kind:'gold',amount:10}),null);
});

test('Recovered equipment and gold fly from the chest to their independent original destinations',async()=>{
  for(const abort of [false,true]) {
    const h=enemyPresentationHarness(),controller=new AbortController(),phases=[];
    h.scope.getBattleEffectAnchor=id=>({enemy:{x:700,y:250},first:{x:100,y:600},second:{x:300,y:600}}[id]);
    h.scope.document.getElementById=id=>id==='btnOpenInventory'?{getBoundingClientRect:()=>({left:10,top:20,width:40,height:40})}:null;
    h.scope.BattleHud={phase:'ALLY_ACTIONS',setPhase:value=>phases.push(value)};
    h.scope.preloadPhase5Art=async()=>{};
    vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
    vm.runInContext(readFileSync(new URL('../public/js/inventory/victory.js',import.meta.url),'utf8'),h.scope);
    const recoveredLoot=[
      {kind:'equipment',ownerId:'first',sourceEnemyId:'enemy',destination:'character',item:{name:'原主一的劍',icon:'https://test.supabase.co/first.webp'}},
      {kind:'equipment',ownerId:'second',sourceEnemyId:'enemy',destination:'character',item:{name:'原主二的盾',icon:'https://test.supabase.co/second.webp'}},
      {kind:'gold',amount:50,sourceEnemyId:'enemy',destination:'bag'}
    ];
    const root=h.scope.document.createElement('div'),fx=h.scope.createMimicTheftChoreography({sourceId:'enemy'},{theft:recoveredLoot[0],returning:true},root,{reduced:false});
    const layer=root.children[0],icon=layer.children[1];assert.equal(layer.children[0].hidden,true);
    fx.render(.12);assert.equal(icon.style.left,'700px');fx.render(.82);assert.equal(icon.style.left,'100px');assert.match(icon.style.transform,/scale\(1\)/);fx.remove();
    const playback=h.scope.playMimicLootReturns({recoveredLoot},{signal:controller.signal,speed:2,onTiming:()=>{if(abort)controller.abort();}});
    if(abort)await assert.rejects(playback,{name:'AbortError'});else await playback;
    assert.equal(h.frames.size,0);assert.equal(h.commits.length,0,'return animation must not repeat server inventory changes');
    const overlay=h.roots.at(-1);assert.equal(overlay.isConnected,false);
    assert.deepEqual(phases,['ENEMY_ACTIONS','ALLY_ACTIONS']);
    if(!abort)assert.deepEqual(overlay.children.map(n=>n.children[1].style.left),['100px','300px','30px']);
  }
});
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
  assert.match(strip.children[0].innerHTML,/\/assets\/icons\/status\/中毒\.webp/);
  assert.match(strip.children[1].innerHTML,/\/assets\/icons\/status\/燃燒\.webp/);
  assert.match(strip.children[2].innerHTML,/\/assets\/icons\/status\/骨折\.webp/);
  const tooltip=h.scope.document.createElement('div');tooltip.classList={add(){}};
  Object.assign(h.scope,{elements:{floatingEnemyTooltip:tooltip},roomState:{battleRound:2},escapeHtml:s=>String(s??''),positionFloatingTooltip(){}});
  const app=readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8');
  vm.runInContext('const BUFF_ICON_MAP = {'+app.split('const BUFF_ICON_MAP = {')[1].split('// 判斷是否為職業特殊機制/疊層')[0],h.scope);
  vm.runInContext('function showEnemyTooltip('+app.split('function showEnemyTooltip(')[1].split('function hideEnemyTooltip')[0],h.scope);
  h.scope.showEnemyTooltip(en,node);
  for(const label of ['中毒','燃燒','骨折','CHILL','能源核心','反制','效抗'])assert.ok(tooltip.innerHTML.includes(label),label);
  assert.ok(tooltip.innerHTML.includes('/assets/icons/status/中毒.webp'));
  assert.ok(tooltip.innerHTML.includes('2/2'));assert.ok(tooltip.innerHTML.includes('3 回合'));
  const expectedNewIcons=[
    [{id:'bear',label:'巨熊形態'},'/assets/icons/status/巨熊型態.png'],
    [{id:'wolf',label:'狼人形態'},'/assets/icons/status/狼人型態.png'],
    [{id:'paladin_target_weight',label:'神聖嘲諷・受擊權重 ↑',icon:'guard'},'/assets/icons/status/神聖嘲諷.png'],
    [{id:'augur_resistance_break',label:'星芒破障',icon:'debuff'},'/assets/icons/status/星芒破障.png'],
    [{id:'reversed_omen',label:'凶兆逆位',icon:'debuff'},'/assets/icons/status/凶兆逆位.png'],
    [{id:'paladin_glory_active',label:'榮耀讚歌・蓄力中',icon:'buff'},'/assets/icons/status/榮耀戰歌-蓄力中.png'],
    [{id:'arena_challenge',label:'死鬥宣告',icon:'buff'},'/assets/icons/status/死鬥宣告.png'],
    [{id:'attack_down',label:'ATK DOWN',icon:'debuff'},'/assets/icons/status/攻擊降低.png'],
    [{id:'void_cover',label:'虛空掩護',icon:'guard'},'/assets/icons/status/虛空掩護.png'],
    [{id:'crystal_support',label:'晶甲共鳴',icon:'guard'},'/assets/icons/status/晶甲共鳴.png'],
    [{id:'corruption',label:'深淵腐化',icon:'corruption'},'/assets/icons/status/深淵腐化.png'],
    [{id:'stun',label:'暈眩',icon:'stun'},'/assets/icons/status/暈眩.png']
  ];
  for(const [status,expectedUrl] of expectedNewIcons){
    assert.equal(h.scope.getBuffIconUrl(status),expectedUrl,status.label);
    assert.equal(h.scope.resolveStatusIconUrl(status),expectedUrl,status.label);
  }
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
test('Concurrent enemy threats retain compact real-target locks without mounting a warning strip',t=>{
  const {room,player}=mechanismBattle(t,[ENCOUNTERS[1],ENCOUNTERS[2],ENCOUNTERS[0]]);mechanismRound(room,3);
  const h=enemyPresentationHarness(),stage=h.scope.document.createElement('div'),card=h.scope.document.createElement('div');let warning;
  stage.before=n=>{warning=n;};card.dataset.playerId=player.id;card.querySelector=()=>card.children[0]||null;
  h.scope.document.getElementById=id=>id==='battleEnemiesStage'?stage:id==='enemyTelegraphs'?warning:null;
  h.scope.document.querySelectorAll=()=>[card];
  h.scope.renderEnemyTelegraphs(room.getHpSnapshot().enemies);
  assert.equal(warning,undefined,'no horizontal skill strip is created');
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
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/combat-expansion.js',import.meta.url),'utf8'),scope);vm.runInContext(readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8'),scope);
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
    vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
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
  const front={};vm.createContext(front);vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-presentation.js',import.meta.url),'utf8'),front);
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
  const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
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
    vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8'),scope);
    const samples=[],stage={root:new Node(),reduced,tick:async(ms,render)=>{render(0);samples.push({...nodes[1].style});target.x=930;render(1);samples.push({...nodes[1].style});}};
    await scope.battlefieldProjectile(stage,'hero','enemy_2','bottle',{getBoundingClientRect:()=>({left:200,top:400,width:300,height:200})});
    assert.equal(nodes[2].src,'/assets/combat-fx/alchemist/reagent-bottle.png');assert.equal(samples[0].left,reduced?'800px':'446px');assert.equal(samples[1].left,'930px');assert.equal(nodes[1].removed,true);
  }
});


test('All real enemy queues retain one settlement per result with painted choreography',async t=>{
  for(const template of allEnemyTemplates){
    const {room,enemy}=mechanismBattle(t,[template]);room.checkDodge=()=>false;const queue=mechanismRound(room,3);queue.push(...actMechanism(room,enemy));normalizeCombatQueue(queue,'official-art-'+enemy.instanceId);
    for(const reducedMotion of [false,true]){
      const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
      const preloaded=[];h.scope.preloadPhase5Art=async paths=>{for(const path of paths){if(path.startsWith('https://'))assert.match(path,/^https:\/\/.+\.supabase.co\/storage\/v1\/object\/public\/game-assets\//);else assert.ok(readFileSync(new URL('../public'+path,import.meta.url)).length);preloaded.push(path);}};
      for(const step of queue)await h.scope.playEnemyMechanicPresentation(step,{reducedMotion,speed:1.5});
      assert.equal(h.commits.length,queue.flatMap(s=>s.results).length,template.name);assert.equal(h.frames.size,0);assert.ok(h.roots.filter(root=>root.className==='enemy-effect-overlay').every(root=>!root.isConnected));
      const visit=node=>{assert.doesNotMatch(node.className||'',/enemy-effect-(?:shape|arc|arrow|projectile|link|wave|crystal)(?: |$)/);for(const child of node.children||[])visit(child);};
      h.roots.forEach(visit);
      const before=h.commits.length;for(const step of queue)await h.scope.playEnemyMechanicPresentation(step,{reducedMotion});assert.equal(h.commits.length,before,'replay cannot apply damage twice');
    }
  }
});


test('Arena participants keep their own painted profession renderer',async()=>{
  const scope={};vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8'),scope);
  const calls=[];scope.playBattlefieldPaintedRole=async step=>calls.push(step.sourceRole);scope.playBattlefieldRanged=async step=>calls.push(step.sourceRole);scope.playPhase5BattlefieldPresentation=async()=>{throw Error('An unrelated profession must not use Gladiator art');};
  for(const sourceRole of ['alchemist','archer','warrior','mage','assassin','bard','paladin'])await scope.playBattlefieldPlayerPresentation({type:'player_action',sourceRole,actionId:'basic',hpSnapshotBefore:{arena:{playerId:'hero',enemyId:'enemy_2'}}},{});
  assert.equal(calls.length,7);
});


test('Production and Lab load painted enemy choreography before its dispatcher',()=>{
  for(const page of ['index.html','combat-fx-stage.html']){
    const html=readFileSync(new URL('../public/'+page,import.meta.url),'utf8');
    const choreography=html.indexOf('<script src="js/combat/enemy-choreography.js"'),dispatch=html.indexOf('<script src="js/combat/enemy-presentation.js"');
    assert.ok(choreography>=0&&choreography<dispatch,page+' must not silently run the placeholder renderer');
  }
});

test('A dead lava source still paints its authoritative explosion on the living target',()=>{
  const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
  const root=h.scope.document.createElement('div');h.scope.getBattleEffectAnchor=id=>id==='dead-larva'?null:{x:360,y:240,rect:{width:80,height:90},element:root};
  const fx=h.scope.createEnemyChoreography({sourceId:'dead-larva',presentation:{mechanicId:'lava_larva',family:'lava'}},{kind:'damage',targetId:'ally',actualDamage:4},root,{reduced:false,animations:[],speed:1});
  fx.render(0);assert.equal(root.children[0].hidden,true);fx.render(fx.contact+.1);assert.equal(root.children[0].hidden,false);assert.equal(root.children[0].children[0].style.left,'360px');assert.equal(h.commits.length,0);fx.remove();
});


function phase6Fixtures(){
  const source=readFileSync(new URL('../public/js/lab/presentation-lab.js',import.meta.url),'utf8'),marker='const PHASE5_ACCEPTANCE_SCENES=Object.freeze(';
  const start=source.indexOf(marker)+marker.length,end=source.indexOf('\n});',start)+2;
  return structuredClone(Object.fromEntries(Object.entries(vm.runInNewContext('('+source.slice(start,end)+')')).filter(([id])=>id.startsWith('phase6_'))));
}
function phase6Harness(step,{reduced=false,missing=false,abortAt=Infinity}={}){
  const nodes=[],commits=[],commitTimes=[],animations=[],preloaded=[],positions=[],sounds=[],controller=new AbortController();let clock=0;
  class Node{
    constructor(){this.children=[];this.dataset={};this.style={setProperty(){}};this.classList={add(){}};nodes.push(this);}
    appendChild(n){this.children.push(n);return n;}setAttribute(){}remove(){this.removed=true;}
  }
  const anchor=id=>missing?null:{id,x:id?.startsWith('enemy')?800:240,y:id?.startsWith('enemy')?200:600,rect:{width:80,height:90},element:new Node()};
  const scope={applyHpSnapshot(){},DOMException,innerWidth:1200,innerHeight:800,performance:{now:()=>clock},document:{createElement:()=>new Node()},getBattleEffectAnchor:anchor,
    positionBattleFeedback(n,id){n.style.left=anchor(id)?.x+'px';},resolvePresentationTarget:r=>r.targetEnemyId||r.targetId,
    resolveCombatSfxProfile:()=>({key:'original-recording'}),battlefieldPaintedImage(parent,src,cls){const n=new Node();n.src=src;n.className=cls;parent.appendChild(n);return n;},
    preloadPhase5Art:async paths=>{for(const path of paths){assert.ok(readFileSync(new URL('../public'+path,import.meta.url)).length,path);preloaded.push(path);}},
    commitBattlefieldPlayerResult(r,_step,context){if(context.signal.aborted)return false;if(commits.includes(r.resultId))return false;commits.push(r.resultId);commitTimes.push({id:r.resultId,time:clock});return true;}};
  vm.createContext(scope);
  const shared=readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8');
  vm.runInContext(shared.slice(shared.indexOf('function battlefieldFormationAnchor('),shared.indexOf('async function playBattlefieldTick(')),scope);
  scope.battlefieldVisualElement=()=>null;
  vm.runInContext(readFileSync(new URL('../public/js/presentation/core-role-effects.js',import.meta.url),'utf8'),scope);
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
  return {scope,nodes,commits,commitTimes,animations,preloaded,positions,sounds,signal,getRoot:()=>root};
}
test('Mage group contact commits unique target hits in one frame, preserving self recoil and equipment IDs',async t=>{
  const {room,player,events}=phase1Battle(t,'mage');player.action='m_blast';room.roleRandom=()=> 'negative';room.resolveTurnActions();
  const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId==='m_blast');
  const h=phase6Harness(step);await h.scope.playPhase6BattlefieldPresentation(step,{});
  const main=step.results.filter(r=>r.kind==='damage'&&r.targetEnemyId);
  assert.equal(new Set(main.map(r=>h.commitTimes.find(c=>c.id===r.resultId).time)).size,1);
  assert.equal(h.sounds.filter(s=>s[0]==='magic_impact').length,1);
  assert.deepEqual(h.commits,step.results.map(r=>r.resultId));
});
test('Alchemist emits exactly one bottle for the real primary/splash results of flask and acid',async t=>{
  for(const action of ['basic','alc_flask','alc_acid']){
    const {room,player,events}=phase1Battle(t,'alchemist');player.action=action;room.resolveTurnActions();
    const step=resolutionQueue(events).find(s=>s.sourceId===player.id&&s.actionId===action),projectiles=[],commits=[],times=[],sounds=[];let clock=0;
    class Node{constructor(){this.style={setProperty(){}};this.dataset={};this.classList={add(){}};}appendChild(){}setAttribute(){}remove(){}}
    const scope={document:{createElement:()=>new Node()},innerWidth:1440,innerHeight:810,
      preloadPhase5Art:async()=>{},resolvePresentationTarget:r=>r.targetEnemyId||r.targetId,
      getBattleEffectAnchor:()=>({x:800,y:350,rect:{left:750,right:850,height:180}})};
    vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/player-battlefield.js',import.meta.url),'utf8'),scope);
    scope.commitBattlefieldPlayerResult=r=>{if(commits.includes(r.resultId))return false;commits.push(r.resultId);times.push({id:r.resultId,time:clock});return true;};
    scope.battlefieldProjectile=async(_s,_source,target,type,_central,anchor)=>{projectiles.push({target,type,landing:anchor?.()});clock+=440;};
    scope.withBattlefieldSkillStage=async(_step,_context,play)=>{
      const s={root:new Node(),reduced:false,local:{audioScope:{play:key=>sounds.push(key),hold:async()=>{clock+=300;}}},animate(){},startRenderer(){},el:()=>new Node(),wait:async ms=>{clock+=ms;},resolveResults:async()=>{for(const r of step.results)scope.commitBattlefieldPlayerResult(r);}};
      await play(s);
    };
    await scope.playBattlefieldRanged(step,{});
    assert.equal(projectiles.length,1);assert.equal(projectiles[0].type,'bottle');
    assert.equal(projectiles[0].landing.x,800);assert.equal(projectiles[0].landing.y,413);
    assert.equal(sounds.filter(s=>s==='bottle_impact').length,1);
    assert.equal(sounds.filter(s=>s==='bottle_throw').length,1);assert.ok(!sounds.includes('acid_throw'));
    assert.ok(sounds.indexOf('bottle_throw')<sounds.indexOf('bottle_impact'));assert.ok(sounds.indexOf('bottle_impact')<sounds.indexOf('acid_splash'));
    if(action==='alc_flask')assert.ok(sounds.indexOf('bottle_impact')<sounds.indexOf('alchemy_skill1'));
    const hits=step.results.filter(r=>r.kind==='damage'&&r.targetEnemyId);
    assert.equal(new Set(hits.map(r=>times.find(c=>c.id===r.resultId).time)).size,1);
    assert.equal(sounds.filter(s=>s==='acid_splash').length,1);assert.equal(commits.length,step.results.length);
  }
});
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
    vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
    vm.runInContext(readFileSync(new URL('../public/js/presentation/core-role-effects.js',import.meta.url),'utf8'),h.scope);
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
  const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/presentation/core-role-effects.js',import.meta.url),'utf8'),h.scope);
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
      const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
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
  const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
  assert.equal(queue.length,2);assert.equal(h.scope.sixEnemyEventMode(queue[0],queue[0].results[0]).mode,'cover');assert.equal(h.scope.sixEnemyEventMode(queue[1],queue[1].results[0]).removing,true);
  for(const step of queue){assert.ok(h.scope.enemyPaintedPaths(step,step.results[0])[0].endsWith('watcher-void-cover.png'));await h.scope.playEnemyMechanicPresentation(step,{reducedMotion:true});}
  assert.equal(h.commits.length,2);assert.ok(h.commits.every(r=>r.kind==='status'&&!r.actualDamage));
});

test('Six-enemy missing image is reported and completes authority; abort and missing anchors clean the timeline',async t=>{
  const {room,enemy}=mechanismBattle(t,[ABYSS_BOSSES.sage]);mechanismRound(room,2);const queue=actMechanism(room,enemy);normalizeCombatQueue(queue,'six-cleanup');
  for(const failure of ['image','anchor','abort']){
    const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
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
  const source=readFileSync(new URL('../public/js/lab/presentation-lab.js',import.meta.url),'utf8');
  const scenes=Object.fromEntries(source.split('\n').map(line=>line.trimEnd()).filter(line=>line.startsWith('"six_enemy_')).map(line=>{const at=line.indexOf(':');return [JSON.parse(line.slice(0,at)),JSON.parse(line.slice(at+1,-1))];}));
  for(const [id,scene] of Object.entries(scenes).filter(([id])=>id.startsWith('six_enemy_'))){
    const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
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
  vm.runInContext(readFileSync(new URL('../public/js/presentation/core-role-effects.js',import.meta.url),'utf8'),h.scope);
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
  const core=readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8');vm.runInContext(core.slice(core.indexOf('const DEFAULT_ROLE_AVATARS'),core.indexOf('function getClassPortraitHtml')),scope);
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
    assert.equal(h.scope.resolveBattlePortrait({role:'druid',druidForm:form}).src,form==='werewolf'?'/assets/characters/forms/druid/狼人.webp':'/assets/characters/forms/druid/遠古樹精.webp');
  }
  h.scope.syncBattlePortrait(h.image,{...natural,entityType:'monster'});assert.equal(h.image.src,ABYSS_BOSS_PORTRAITS.abyss_druid);assert.ok(h.classes.has('is-abyss-fullbody'));
  assert.equal(h.scope.resolveBattlePortrait({role:'druid'}).src,'/assets/characters/portraits/Druid.webp');assert.equal(h.scope.resolveBattlePortrait({role:'augur'}).src,'/assets/characters/portraits/Augur.webp');
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
  h.image.dataset.studioResolved=h.image.dataset.studioOriginal;h.image.onerror();assert.equal(h.image.src,'/assets/characters/forms/druid/遠古樹精.webp');assert.notEqual(h.image.src,descriptor.avatar);assert.ok(!h.classes.has('is-abyss-fullbody'));
  h.image.onload();assert.equal(h.image.dataset.portraitLoaded,'true');
});


test('Enemy state routing keeps transformations, costs and shield consumption out of attack art',()=>{
  const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
  const state={sourceId:'enemy',presentation:{mechanicId:'abyss_druid',family:'nature'},actionId:'狼人變形'};
  const cost={kind:'damage',sourceId:'enemy',targetId:'enemy',actualDamage:4,targetBefore:{mechanics:{form:null}},targetAfter:{mechanics:{form:'werewolf'}}};
  assert.equal(h.scope.enemyEventKind(cost,state),'transform');assert.equal(h.scope.enemyPaintedPaths(state,cost),null);
  const selfCost={...cost,targetBefore:{},targetAfter:{}};
  assert.equal(h.scope.enemyEventKind(selfCost,state),'self-cost');assert.equal(h.scope.enemyPaintedPaths(state,selfCost),null);
  assert.equal(h.scope.enemyPaintedPaths({...state,actionId:'吞噬護盾',presentation:{mechanicId:'glutton'}},{...selfCost,targetId:'hero'}),null);
  for(const [kind,actionId] of [['shield','維修護盾'],['heal','血月汲取'],['cleanse','來源死亡・標記解除'],['status','瞄準射擊'],['status','維修充能']]){
    assert.equal(h.scope.enemyEventKind({kind},{actionId}),kind==='status'?actionId==='瞄準射擊'?'mark':'charge':kind);
  }
  const charge={presentation:{mechanicId:'ancient_golem'},actionId:'能源核心'},gain={kind:'status',targetBefore:{mechanics:{charge:0}},targetAfter:{mechanics:{charge:1}}};
  assert.ok(h.scope.enemyPaintedPaths(charge,gain)[0].endsWith('automaton-energy-core.png'));
  assert.equal(h.scope.enemyPaintedPaths({...charge,actionId:'過載・消耗充能'},{...gain,targetBefore:gain.targetAfter,targetAfter:gain.targetBefore}),null);
  assert.equal(h.scope.enemyStateFeedback({kind:'status',targetBefore:{statuses:[]},targetAfter:{statuses:[]}},{actionId:'煉獄熱度'}).length,0);
  assert.equal(h.scope.enemyStateFeedback({kind:'cleanse',targetBefore:{statuses:[{id:'mark'}]},targetAfter:{statuses:[]}},{actionId:'來源死亡・標記解除'})[0].text,'來源死亡・標記解除');
});
test('Unpainted status and unknown attacks settle once with plain feedback, never fabricated art, and abort cleans owned nodes',async()=>{
  for(const reducedMotion of [false,true]){
    const h=enemyPresentationHarness();vm.runInContext(readFileSync(new URL('../public/js/combat/enemy-choreography.js',import.meta.url),'utf8'),h.scope);
    const sounds=[];h.scope.sfxManager={play:id=>sounds.push(id)};
    const result={kind:'status',resultId:'status',targetId:'enemy',targetBefore:{statuses:[]},targetAfter:{statuses:[{id:'mark'}]}};
    const step={sourceId:'enemy',actionId:'獵物標記',presentation:{mechanicId:'shadow_alpha',family:'shadow'},results:[result]};
    await h.scope.playEnemyMechanicPresentation(step,{reducedMotion});assert.equal(sounds.length,0);assert.equal(h.commits.length,1);
    const nodes=[];const visit=n=>{nodes.push(n);(n.children||[]).forEach(visit);};h.roots.forEach(visit);
    assert.ok(nodes.some(n=>n.textContent==='獵物標記'));assert.ok(!nodes.some(n=>n.src||/enemy-effect-(shape|link|projectile)/.test(n.className||'')));
    const unknown={...step,presentation:{mechanicId:'no-painted-asset'},results:[{kind:'damage',resultId:'hit',targetId:'hero',actualDamage:7,actualHpDamage:7}]};
    await h.scope.playEnemyMechanicPresentation(unknown,{reducedMotion});assert.equal(h.commits.length,2);assert.equal(h.frames.size,0);
    const controller=new AbortController();h.scope.waitForPresentation=async()=>{controller.abort();throw new DOMException('cancelled','AbortError');};
    await assert.rejects(h.scope.playEnemyMechanicPresentation({...step,results:[{...result,resultId:'cancelled'}]},{signal:controller.signal,reducedMotion}),{name:'AbortError'});
    assert.equal(h.commits.length,2);assert.equal(h.frames.size,0);assert.ok(h.roots.filter(n=>n.className==='enemy-effect-overlay').every(n=>!n.isConnected));
  }
});
test('Enemy persistent overlays omit avatar rings, wound slashes and guard plates while retaining role geometry and player status effects',()=>{
  const scope={};vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/portrait-status-fx.js',import.meta.url),'utf8'),scope);
  const entity={hp:20,tempHp:5,bleedTurns:2,statuses:['frenzy','guard','vulnerable','sage_equation','galaxy']};
  const enemy=scope.getEntityActiveFxProfiles({...entity,instanceId:'enemy_0'}),player=scope.getEntityActiveFxProfiles({...entity,id:'hero'});
  for(const id of ['frenzy','bleed','shield','guard']){assert.ok(player.has(id));assert.ok(!enemy.has(id));}
  for(const id of ['equation','astronomy','vulnerable'])assert.ok(enemy.has(id));
});

test('Shady shops use neutral normal-shop copy despite published shady overrides; prices and Captain insight stay authoritative',t=>{
  const {room}=fixture(t);const title=room.studioContent.title,text=room.studioContent.text;
  room.studioContent={...room.studioContent,title:(key,fallback)=>key==='event.shop.shady'?'神秘奸商':title(key,fallback),text:(key,fallback)=>key==='event.shop.shady'?'不買就會開戰':text(key,fallback)};
  room.handleShopEvent({isShadyMerchant:true,col:2});
  assert.doesNotMatch(room.currentEvent.title+' '+room.currentEvent.story,/奸商|黑市|開戰|恐招惹/);
  assert.ok(room.currentEvent.priceMultiplier>=1.5&&room.currentEvent.priceMultiplier<=2);assert.ok(room.currentEvent.sellRatio>=.1&&room.currentEvent.sellRatio<=.2);
  const aug=fixture(t,'augur');aug.room.handleShopEvent({col:2});aug.room.generateHexMap();
  const shop=aug.room.hexMap.flat().find(n=>n.type==='SHOP')||aug.room.hexMap[1][0];shop.type='SHOP';shop.isShadyMerchant=true;assert.equal(aug.room.getClientHexMap().flat().find(n=>n.id===shop.id).isKnownShady,true);
});
for(const mode of ['bought','failed','sold','untouched'])test('Shady leave preserves the real purchase condition: '+mode,t=>{
  const {room}=fixture(t);room.handleShopEvent({isShadyMerchant:true,col:2});room.gold=0;
  if(mode==='bought'){room.gold=100000;assert.equal(room.handleShopAction('solo','buy',{itemIndex:0}).success,true);assert.equal(room.currentEvent.hasBought,true);}
  if(mode==='failed'){assert.equal(room.handleShopAction('solo','buy',{itemIndex:0}).success,false);assert.equal(room.currentEvent.hasBought,false);}
  if(mode==='sold'){room.squadInventory=[structuredClone(TIER1_EQUIPMENTS[0])];assert.equal(room.handleShopAction('solo','sell',{fromArea:'squad',index:0}).success,true);assert.equal(room.currentEvent.hasBought,false);}
  const result=room.handleShopAction('solo','leave');assert.equal(!!result.combatTriggered,mode!=='bought');
  if(mode!=='bought'){assert.equal(room.state,'IN_BATTLE');assert.equal(room.currentMonster.isShadyMerchant,true);assert.match(room.currentMonster.encounterStory,/收起笑容|掀翻攤位/);}
});
test('Shop departure waits for all connected players and normal/prep/wandering behavior and Assassin branches survive',t=>{
  const f=fixture(t);f.room.addPlayer({id:'other',join(){},emit(){}},'Other');f.room.selectRole('other','mage');f.room.handleShopEvent({isShadyMerchant:true,col:2});
  assert.equal(f.room.handleShopAction('solo','leave').allReady,false);assert.equal(f.room.state,'EVENT');assert.equal(f.room.handleShopAction('other','leave').combatTriggered,true);
  for(const params of [{isShadyMerchant:false,col:2},{isPrepShop:true,col:1}]){const {room}=fixture(t);room.handleShopEvent(params);assert.equal(!!room.handleShopAction('solo','leave').combatTriggered,false);assert.notEqual(room.state,'IN_BATTLE');}
  const wander=fixture(t);wander.room.handleWanderingMerchantEvent({col:2});assert.equal(wander.room.currentEvent.isWanderingMerchant,true);assert.equal(wander.room.currentEvent.isShady,false);assert.equal(!!wander.room.handleShopAction('solo','leave').combatTriggered,false);
  for(const stealSuccess of [true,false]){const {room}=fixture(t,'assassin');room.handleShopEvent({isShadyMerchant:true,col:2});assert.equal(room.currentEvent.canSteal,true);const res=room.handleShopAction('solo','steal',{stealSuccess});assert.equal(res.success,stealSuccess);assert.equal(room.state==='IN_BATTLE',!stealSuccess);}
  const normal=fixture(t,'assassin');normal.room.handleShopEvent({col:2});assert.equal(normal.room.currentEvent.canSteal,false);assert.doesNotMatch(normal.room.handleShopAction('solo','steal').message,/奸商|黑市/);
});
function encounterOpeningHarness({abortAt=Infinity}={}){
  const beats=[],sounds=[],durations=[],controller=new AbortController();let waits=0;
  class Node{constructor(){this.children=[];this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){}};this.hidden=true;this.textContent='';}appendChild(n){this.children.push(n);}replaceChildren(){this.children=[];}querySelector(selector){return this.parts?.[selector]||null;}remove(){this.removed=true;}}
  const stage=new Node(),story=new Node(),storySection=new Node(),warning=new Node(),impact=new Node(),art=new Node(),name=new Node();name.parts={h1:new Node(),span:new Node()};stage.parts={'.boss-encounter-story':story,'.boss-encounter-story-section':storySection,'.boss-warning':warning,'.boss-encounter-impact-stage':impact,'.boss-encounter-art':art,'.boss-encounter-name':name,'.boss-encounter-resistances':new Node()};
  const scope={DOMException,AbortController,performance:{now:()=>waits},document:{createElement:()=>new Node(),createTextNode:text=>({textContent:text})},PRESENTATION_CONFIG:{bossEncounter:{warningRevealAt:3000,warningEntry:460,warningHold:750,warningExit:360,preBossBeat:180,bossSettle:560,bossHold:100}},sfxManager:{preload:async()=>{},duck(){}},createSfxPresentationScope:()=>({play(){},hold:async()=>{}}),waitForPresentation:async ms=>{durations.push(ms);if(++waits===abortAt)controller.abort();if(controller.signal.aborted)throw new DOMException('cancelled','AbortError');}};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-phase.js',import.meta.url),'utf8'),scope);
  scope.createBattlePhaseStage=()=>stage;scope.handoffBossPortrait=async(s,a,ctx)=>{await ctx.revealHud();return;};
  const context={encounter:true,signal:controller.signal,onTiming:name=>beats.push(name),playSound:name=>{sounds.push(name);if(name==='boss_warning')assert.equal(story.children.map(p=>p.children.map(c=>c.textContent).join('')).join(''),'第一段。第二段！');},revealEncounterScene:()=>beats.push('scene_released'),revealHud:()=>beats.push('hud')};
  return {scope,context,stage,beats,sounds,controller,durations};
}
test('Encounter story completes before warning, entrance, HUD and Round 1; abort never reveals the battle',async()=>{
  const h=encounterOpeningHarness();h.scope.playRoundStartBanner=async()=>h.beats.push('round');
  await h.scope.playBattlePhaseOpening({name:'Boss',encounterStory:'第一段。\n\n第二段！'},1,h.context);
  const names=['encounter_story_complete','encounter_darken','warning_audio_start','warning_entry','warning_complete','scene_released','boss_art_entry','boss_portrait_handoff','hud','round'];
  for(let i=1;i<names.length;i++)assert.ok(h.beats.indexOf(names[i])>h.beats.indexOf(names[i-1]),names.join(' -> '));assert.ok(h.stage.removed);assert.ok(h.durations.includes(850));assert.doesNotMatch(h.stage.innerHTML,/exploration-trap/);
  const aborted=encounterOpeningHarness({abortAt:2});await assert.rejects(aborted.scope.playBattlePhaseOpening({name:'Boss',encounterStory:'第一段。\n\n第二段！'},1,aborted.context),{name:'AbortError'});assert.ok(aborted.stage.removed);assert.ok(!aborted.beats.includes('hud'));assert.equal(aborted.sounds.length,0);
});
test('Same-round room updates cannot reveal a gated encounter, and abort releases the inert previous view',async()=>{
  const source=readFileSync(new URL('../public/js/core/app.js',import.meta.url),'utf8');
  const node=()=>{const classes=new Set();return {inert:false,classes,classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,on){if(on)classes.add(k);else classes.delete(k);}},getAttribute:()=>null,setAttribute(){},removeAttribute(){}};};
  for(const abort of [false,true]){
    const route=node(),battle=node(),body=node(),action=node();route.classList.add('active');const played=new Set();
    const scope={AbortController,DOMException,roomState:{code:'GATE',floor:1,battleCount:1,battleRound:1,state:'IN_BATTLE',currentMonster:{name:'Boss'}},elements:{views:{route,battle}},document:{body,getElementById:()=>action},lastAnnouncedBattleRound:0,isProcessingPresentationQueue:false,sfx:null,renderLogs(){},revealBattleControls:async()=>{},presentationManager:{hasPlayed:key=>played.has(key),markPlayed:key=>played.add(key),setBlocking(){}}};
    vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('// Keep the actual preceding scene inert'),source.indexOf('// 渲染整體畫面')),scope);
    vm.runInContext(source.slice(source.indexOf('let battlePhaseController = null;'),source.indexOf('async function revealBattleControls()')),scope);
    scope.playBattlePhaseOpening=(monster,round,ctx)=>new Promise((resolve,reject)=>{scope.opening=ctx;scope.finish=resolve;ctx.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')));});
    scope.holdBattleEncounterScene(scope.roomState);scope.switchView('battle');const pending=scope.ensureBattlePhase(1);
    assert.equal(route.inert,true);assert.ok(route.classes.has('active'));assert.ok(!battle.classes.has('active'));
    scope.holdBattleEncounterScene(scope.roomState);scope.switchView('battle');scope.ensureBattlePhase(1);
    assert.ok(battle.classes.has('view-gated-hidden'),'same battle update must retain gate');
    if(abort){scope.roomState={state:'EVENT'};vm.runInContext('battlePhaseController.abort()',scope);}
    else{scope.opening.revealEncounterScene();assert.ok(battle.classes.has('active'));assert.ok(battle.classes.has('view-gated-hidden'));scope.opening.revealHud();assert.ok(!battle.classes.has('view-gated-hidden'));scope.finish();}
    await pending;assert.equal(route.inert,false);assert.ok(!route.classes.has('encounter-scene-held'));assert.ok(!body.classes.has('battle-intro-active'));
  }
});
test('Mimic ambush creates one strange chest elite and attacks before skill selection',t=>{
  const {room}=fixture(t);room.handleChestEvent({isMimic:true,col:2});assert.equal(room.currentEvent.isMimic,true);
  const result=room.handleChestAction('solo','open');assert.equal(result.isMimic,true);assert.equal(room.state,'IN_BATTLE');assert.equal(room.currentEvent,null);
  assert.equal(room.enemies.length,1);assert.equal(room.currentMonster.name,'奇怪的寶箱');assert.equal(room.currentMonster.tier,'ELITE');assert.equal(room.currentMonster.baseHp,100);assert.match(room.currentMonster.avatar,/^https:\/\/.+supabase.co\//);assert.match(room.currentMonster.encounterStory,/金黃眼睛/);assert.equal(room.currentMonster.mechanics.ambushed,true);assert.equal(room.getClientState().battleRound,1);
});

test('Unopened normal and strange chests have identical options and cannot be pacified',t=>{
  for(const role of ['warrior','druid']) {
    const {room,player}=fixture(t,role);let normal;
    for(const isMimic of [false,true]) {
      room.handleChestEvent({isMimic,col:1});
      const event=room.getClientState().currentEvent;
      assert.equal(Object.hasOwn(event,'isMimic'),false);assert.equal(event.canPacify,false);
      const {presentationId,...visible}=event;
      if(!isMimic)normal=visible;else assert.deepEqual(visible,normal);
      const gold=room.gold,hp=player.hp;
      assert.equal(room.handleChestAction('solo','pacify').success,false);
      assert.equal(room.gold,gold);assert.equal(player.hp,hp);assert.equal(room.currentEvent.opened,false);
    }
  }
});

test('Strange chest opening hits every ally once and precedes their first action',t=>{
  const {room,player,events}=fixture(t);room.addPlayer({id:'second',join(){},emit(){}},'Second');room.selectRole('second','mage');
  room.checkDodge=()=>false;
  const before=Object.fromEntries(Object.values(room.players).map(p=>[p.id,p.hp]));
  room.handleChestEvent({isMimic:true,col:1});room.handleChestAction('solo','open');
  const hits=events.flatMap(([,data])=>data?.queue||data?.presentationQueue||[]).filter(s=>s.actionId==='開箱伏擊・全體猛咬');
  assert.deepEqual(new Set(hits.map(s=>s.targetId)),new Set(['solo','second']));
  assert.ok(Object.values(room.players).every(p=>p.hp<before[p.id]));
  assert.equal(room.selectionState,'RESOLVING');
  const hp=player.hp;room.executeTurn();assert.equal(player.hp,hp,'opening cannot repeat');
  assert.ok(room.currentMonster.chestTreasure.drop);
});

test('Strange chest CD3 bites one target at 1.35x and steals bounded gold only on a hit',t=>{
  const {room,enemy,player}=mechanismBattle(t,[SPECIAL_ELITES.treasure_mimic]);
  room.players.second={...structuredClone(player),id:'second',name:'Second',hp:1000,maxHp:1000};
  room.checkDodge=()=>false;t.mock.method(Math,'random',()=>.99);room.gold=101;
  mechanismRound(room,3);const q=actMechanism(room,enemy),hits=q.flatMap(s=>s.results).filter(r=>r.kind==='damage'&&r.finalDamage>0);
  assert.equal(hits.length,1);assert.equal(hits[0].finalDamage,Math.floor(enemy.attack*1.35));assert.equal(room.gold,51);assert.equal(enemy.stolenLoot.gold,50);
  const theft=q.flatMap(s=>s.results).find(r=>r.theft)?.theft;
  assert.equal(theft.kind,'gold');assert.equal(theft.amount,50);assert.equal(theft.ownerId,hits[0].targetId);
  mechanismRound(room,6);room.checkDodge=()=>true;actMechanism(room,enemy);assert.equal(room.gold,51);
  room.gold=1;room.checkDodge=()=>false;mechanismRound(room,9);actMechanism(room,enemy);assert.equal(room.gold,1);
});

test('Strange chest stolen equipment loses its stats and returns with treasure on victory',t=>{
  const {room,player}=fixture(t);room.checkDodge=()=>false;room.handleChestEvent({isMimic:true,col:1});room.handleChestAction('solo','open');
  const enemy=room.currentMonster,item={id:'test_sword',name:'測試劍',bonusAtk:7};
  player.equipSlots.WEAPON=item;player.bonusAtk=(player.bonusAtk||0)+7;room.syncPlayerEquips(player);
  const atk=player.bonusAtk;room.gold=100;t.mock.method(Math,'random',()=>0);
  mechanismRound(room,3);actMechanism(room,enemy);
  assert.equal(player.equipSlots.WEAPON,null);assert.equal(player.bonusAtk,atk-7);assert.equal(enemy.stolenLoot.equipment[0].item,item);
  room.gold=100;t.mock.method(Math,'random',()=>.99);mechanismRound(room,6);actMechanism(room,enemy);assert.equal(room.gold,50);
  const treasure=structuredClone(enemy.chestTreasure),log=[];room.handleMonsterVictory(enemy,log,[],true);
  assert.equal(player.equipSlots.WEAPON,item);assert.equal(player.bonusAtk,atk+5);assert.ok(room.gold>=100+treasure.gold);
  assert.ok(log.some(l=>l.text.includes(treasure.drop.name)));assert.equal(enemy.stolenLoot.gold,0);assert.equal(enemy.stolenLoot.equipment.length,0);assert.equal(enemy.chestTreasure,null);
  const recovered=room.currentVictory.recoveredLoot;
  assert.equal(recovered.find(r=>r.kind==='gold').amount,50);
  assert.equal(recovered.find(r=>r.kind==='equipment').ownerId,player.id);
  assert.equal(recovered.find(r=>r.kind==='equipment').destination,'character');
  assert.ok(recovered.every(r=>r.sourceEnemyId===enemy.instanceId));
});

test('Chest victory preserves original owners and directs items to the bag when their former slot is occupied',t=>{
  const {room,player}=fixture(t);room.addPlayer({id:'second',join(){},emit(){}},'Second');room.selectRole('second','mage');
  room.checkDodge=()=>false;room.handleChestEvent({isMimic:true,col:1});room.handleChestAction('solo','open');
  const enemy=room.currentMonster,second=room.players.second;
  const firstItem={id:'first_item',name:'原主一的劍'},secondItem={id:'second_item',name:'原主二的盾'};
  player.equipSlots.WEAPON=firstItem;second.equipSlots.ARMOR=secondItem;room.gold=0;
  room.stealMimicLoot(enemy,player);room.stealMimicLoot(enemy,second);
  player.equipSlots.WEAPON={id:'replacement',name:'替代武器'};
  room.handleMonsterVictory(enemy,[],[],true);
  const recovered=room.currentVictory.recoveredLoot;
  assert.equal(recovered.find(r=>r.item?.id==='first_item').ownerId,player.id);
  assert.equal(recovered.find(r=>r.item?.id==='first_item').destination,'bag');
  assert.equal(recovered.find(r=>r.item?.id==='second_item').ownerId,second.id);
  assert.equal(recovered.find(r=>r.item?.id==='second_item').destination,'character');
  assert.equal(player.equipSlots.WEAPON.id,'replacement');assert.equal(second.equipSlots.ARMOR,secondItem);
});
test('Formation handoff matches every instance, restores each node and cleans flights on abort',async()=>{
  for(const count of [1,2,3,4])for(const abort of [false,true]){
    const animations=[],flights=[],controller=new AbortController();
    const image=id=>({dataset:{enemyId:id},style:{visibility:''},getBoundingClientRect:()=>({left:20,top:40,width:180,height:200}),cloneNode(){return image(id);}});
    const targets=Array.from({length:count},(_,i)=>image('enemy_'+i));
    const slots=[...targets].reverse().map(target=>({dataset:{enemyId:target.dataset.enemyId},classList:{contains:()=>false},querySelector:()=>target}));
    const animate=()=>{const a={cancelled:false,cancel(){this.cancelled=true;}};animations.push(a);return a;};
    const art={querySelectorAll:()=>targets.map(t=>image(t.dataset.enemyId))};
    const stage={dataset:{reducedMotion:'false'},appendChild:f=>flights.push(f),querySelector:()=>({animate})};
    const scope={DOMException,document:{querySelectorAll:()=>slots,createElement:()=>({dataset:{},appendChild(){},animate,remove(){this.removed=true;}})},waitForPresentation:async()=>{if(abort){controller.abort();throw new DOMException('cancelled','AbortError');}}};
    vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-phase.js',import.meta.url),'utf8'),scope);
    const run=scope.handoffEnemyFormation(stage,art,{signal:controller.signal,revealHud:async()=>{}});
    if(abort)await assert.rejects(run,{name:'AbortError'});else await run;
    assert.deepEqual(flights.map(f=>f.dataset.enemyId),targets.map(t=>t.dataset.enemyId));
    assert.ok(flights.every(f=>f.removed));assert.ok(targets.every(t=>t.style.visibility===''));assert.ok(animations.every(a=>a.cancelled));
  }
});


test('Gladiator challenge has five readable beats, lands before authority and scales only its own timing',async()=>{
  for(const reduced of [false,true])for(const abortAt of [Infinity,1,2,3]){
    const scope={};vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/presentation/presentation-config.js',import.meta.url),'utf8'),scope);vm.runInContext(readFileSync(new URL('../public/js/presentation/gladiator-presentation.js',import.meta.url),'utf8'),scope);
    const beats=[],waits=[],nodes=[],animations=[];let elapsed=0,count=0;
    const blade={style:{},getAnimations:()=>[]};
    const fx=(cls,x,y)=>{const n={cls,style:{left:x+'px',top:y+'px'},classList:{add(){}},querySelector:()=>blade,getAnimations:()=>[],remove(){this.removed=true;}};nodes.push(n);return n;};
    const s={owner:{},actorMotion:{},reduced,challengeGeometry:()=>({start:{x:100,y:300},landing:{x:700,y:400}}),fx,
      animate:(node,keys,ms)=>animations.push({node,keys,ms}),emit:name=>beats.push([name,elapsed]),sound(){},burst(){},
      wait:async ms=>{waits.push(ms);elapsed+=ms;if(++count===abortAt)throw new DOMException('cancelled','AbortError');},
      resolve:async()=>beats.push(['resolve',elapsed]),applySnapshot:()=>beats.push(['snapshot',elapsed])};
    const play=scope.playGladiatorChallengePresentation({sourceId:'hero',results:[{kind:'status'}]},s);
    if(abortAt!==Infinity){await assert.rejects(play,{name:'AbortError'});assert.ok(!beats.some(([name])=>name==='resolve'));continue;}
    await play;
    assert.equal(elapsed,2710);assert.equal(Math.round(elapsed*scope.PRESENTATION_CONFIG.gladiator.pace),3035);
    const index=name=>beats.findIndex(([n])=>n===name);
    assert.ok(index('gladius_landing')<index('resolve'));assert.ok(index('resolve')<index('gladiator_challenge_established'));assert.ok(index('gladiator_challenge_established')<index('gladiator_challenge_fade'));
    assert.equal(beats.find(([n])=>n==='resolve')[1]-beats.find(([n])=>n==='gladius_landing')[1],300);
    assert.ok(nodes.every(n=>n.removed));assert.equal(scope.PRESENTATION_CONFIG.gladiator.arenaWalk,300);assert.equal(scope.PRESENTATION_CONFIG.gladiator.selfSlash,180);
    assert.ok(animations.some(a=>a.ms===1000&&a.node===blade));
  }
});

test('Live challenge uses the chosen enemy anchor, follows its movement and commits each result only after landing',async()=>{
  const anchors={hero:{x:100,y:400,rect:{width:80,bottom:450}},enemy_1:{x:800,y:300,rect:{width:200,bottom:420}}},renderers=[],calls=[],source={style:{}},result={kind:'status',targetId:'hero'};
  const scope={AugurPresentationEngine:class{},innerWidth:1440,innerHeight:810,Image:class{decode(){return Promise.resolve();}},PRESENTATION_CONFIG:{gladiator:{pace:1.12}},GLADIATOR_SFX:{ground:'physical_hit'},
    getBattleEffectAnchor:id=>anchors[id],battlefieldPlayerTarget:()=> 'hero',commitBattlefieldPlayerResult:r=>calls.push(r),applyHpSnapshot:s=>calls.push(s)};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/presentation/extended-role-effects.js',import.meta.url),'utf8'),scope);
  scope.withBattlefieldSkillStage=async(step,context,play)=>{assert.equal(context.skipCastAudio,true);return play({actor:source,reduced:false,signal:new AbortController().signal,local:{audioScope:{play(){}}},el:()=>({}),position:(n,x,y)=>Object.assign(n,{x,y}),startRenderer:f=>renderers.push(f),animate(){},wait:async()=>{},tick:async()=>{}});};
  scope.playGladiatorChallengePresentation=async(step,s)=>{
    assert.equal(calls.length,0);assert.equal(s.actorMotion,source);
    assert.notEqual(s.challengeGeometry().start.x,anchors.hero.x,'the challenge launches from the scene, not the HUD');
    assert.deepEqual({...s.challengeGeometry().landing},{x:752,y:412});
    const sword={},crack={};s.followLanding(sword,crack);anchors.enemy_1.x=900;renderers[0]();assert.equal(sword.x,852);assert.equal(sword.y,377);assert.equal(crack.y,412);
    delete anchors.enemy_1;renderers[0]();assert.equal(sword.hidden,true);assert.equal(s.challengeGeometry(),null);
    await s.resolve(result);s.applySnapshot();
  };
  const snapshot={players:[]};await scope.playBattlefieldGladiator({actionId:'g_arena',outcome:{type:'challenge'},sourceId:'hero',targetEnemyId:'enemy_1',results:[result],hpSnapshot:snapshot},{});
  assert.deepEqual(calls,[result,snapshot]);
});


test('Gladiator arena survives room updates, rejects outside selection and restores the formation after exit',t=>{
  const {room,player}=fixture(t,'gladiator');room.addPlayer({id:'ally',join(){},emit(){}},'Ally');room.selectRole('ally','mage');
  room.handleBattleEvent(null,false,{col:1});room.setEnemies([0,1,2].map(i=>room.createEnemyInstance(ENCOUNTERS[i],i,{tier:'MINION'})));
  room.currentMonster=room.enemies[1];room.arenaPending={playerId:player.id,round:room.battleRound};const queue=[];room.p8RoundStart(queue);
  const entry=queue.find(s=>s.type==='arena_enter');assert.ok(entry);const arena=room.getClientState().arena;
  assert.equal(arena.enemyId,room.enemies[1].instanceId);assert.equal(arena.playerId,player.id);assert.equal(arena.enemyForced,false);assert.ok(!Object.hasOwn(arena,'originalMaxHp'));
  assert.deepEqual(room.getClientState().arena,arena);assert.equal(room.getHpSnapshot().arena.enemyId,arena.enemyId);
  assert.equal(room.selectTargetEnemy(player.id,room.enemies[0].instanceId).success,false);assert.equal(room.selectTargetEnemy('ally',arena.enemyId).success,false);
  assert.equal(room.selectTargetEnemy(player.id,arena.enemyId).success,true);
  const outsiderHp=room.enemies[0].hp;assert.equal(room.getTargetEnemy(room.enemies[0].instanceId).instanceId,arena.enemyId);assert.equal(room.enemies[0].hp,outsiderHp);
  room.selectionState='SELECTING';room.checkTurnCompletion=()=>{};assert.equal(room.lockAction(player.id,'basic',null,room.enemies[0].instanceId).success,true);assert.equal(player.targetEnemyId,arena.enemyId);
  room.p8ExitArena([]);assert.equal(room.getClientState().arena,null);assert.equal(room.selectTargetEnemy(player.id,room.enemies[0].instanceId).success,true);assert.equal(room.enemies.length,3);
});
test('Arena presentation centers its authoritative enemy, removes outsiders from access and restores nodes',()=>{
  const classes=()=>{const values=new Set();return {values,toggle(k,on){if(on)values.add(k);else values.delete(k);},contains:k=>values.has(k)};};
  const stage={classList:classes()},view={classList:classes()},nodes=['enemy_0','enemy_1','enemy_2'].map(enemyId=>({dataset:{enemyId},classList:classes(),attrs:{},setAttribute(k,v){this.attrs[k]=v;},blur(){this.blurred=true;}}));
  const h=enemyPresentationHarness();h.scope.document.activeElement=nodes[0];h.scope.document.getElementById=id=>id==='viewBattle'?view:null;
  h.scope.document.querySelectorAll=selector=>selector.includes('.battle-enemy-slot')?nodes:selector.includes('.battle-enemies-stage')?[stage]:[];
  h.scope.syncEnemyArenaVisual({playerId:'hero',enemyId:'enemy_1'});
  assert.ok(stage.classList.contains('is-duel-arena'));assert.ok(view.classList.contains('is-duel-arena'));assert.equal(nodes[0].attrs['aria-hidden'],'true');assert.equal(nodes[0].tabIndex,-1);assert.ok(nodes[0].blurred);assert.equal(nodes[1].attrs['aria-disabled'],'false');
  h.scope.syncEnemyArenaVisual(null);assert.ok(!stage.classList.contains('is-duel-arena'));assert.ok(!view.classList.contains('is-duel-arena'));assert.ok(nodes.every(n=>n.attrs['aria-hidden']==='false'&&n.tabIndex===0));
  const app=readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8'),scope={roomState:{enemies:nodes.map(n=>({instanceId:n.dataset.enemyId,hp:10})),arena:{playerId:'hero',enemyId:'enemy_1'}},myId:'hero'};
  vm.createContext(scope);vm.runInContext(app.slice(app.indexOf('function isBattleEnemySelectable'),app.indexOf('// 神魔之塔風格敵方排佈舞台渲染')),scope);
  assert.equal(scope.isBattleEnemySelectable('enemy_0'),false);assert.equal(scope.isBattleEnemySelectable('enemy_1'),true);scope.myId='ally';assert.equal(scope.isBattleEnemySelectable('enemy_1'),false);scope.roomState.arena=null;assert.equal(scope.isBattleEnemySelectable('enemy_0'),true);
});


test('Arena HUD snapshots retain isolation through partial updates and explicitly clear it at exit',()=>{
  const app=readFileSync(new URL('../public/js/core/app.js',import.meta.url),'utf8'),calls=[],scope={expandedDisplay:null,roomState:{},updateBattleHudFromSnapshot(){},syncEnemyArenaVisual:a=>calls.push(a)};
  vm.createContext(scope);vm.runInContext(app.slice(app.indexOf('function applyHpSnapshot(snapshot)'),app.indexOf('// 單一步驟演出')),scope);
  const arena={enemyId:'enemy_1',playerId:'hero'};scope.applyHpSnapshot({arena});assert.equal(scope.roomState.arena,arena);scope.applyHpSnapshot({players:[]});assert.equal(calls.length,1);assert.equal(scope.roomState.arena,arena);
  scope.applyHpSnapshot({arena:null});assert.equal(calls.at(-1),null);assert.equal(scope.roomState.arena,null);
  const forced={...arena,enemyForced:true};scope.applyHpSnapshot({arena:forced});assert.equal(scope.roomState.enemyArena,forced);assert.equal(scope.roomState.arena,null);
});

test('Every official local image including status icons and JPEG has a cloud-migratable catalog entry',async()=>{
  const {catalog}=await import('../studio/catalog.js'),fs=await import('node:fs'),path=await import('node:path'),{fileURLToPath}=await import('node:url');
  const known=new Map(catalog.game_assets.filter(a=>a.kind==='image').map(a=>[a.local_path,a]));
  const visit=(dir,prefix)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name.startsWith('.')||entry.name==='temp')continue;const local=prefix+'/'+entry.name,file=path.join(dir,entry.name);if(entry.isDirectory())visit(file,local);else if(/\.(webp|png|jpe?g|svg|gif|avif|ico)$/i.test(entry.name)){assert.ok(known.has(local),local);assert.ok(known.get(local).mime_type?.startsWith('image/'));}}};
  for(const dir of ['assets'])visit(fileURLToPath(new URL('../public/'+dir,import.meta.url)),'/'+dir);
  assert.equal(known.get('/assets/ui/lobby/job.jpeg').mime_type,'image/jpeg');assert.ok(known.has('/assets/icons/status/中毒.webp'));
});
test('Image migration updates verified image paths while preserving remote semantic art and unrelated audio/drafts',async()=>{
  const {imageBindingPlan,publicImageUrl}=await import('../scripts/sync-assets-supabase.mjs');
  const image={asset_key:'local.test',local_path:'/assets/characters/portraits/Warrior.webp',kind:'image',preload_group:'roles'},remote={asset_key:'storage.test',kind:'image',source_type:'storage',preload_group:'roles',storage_path:'images/roles/圖.webp'},custom={asset_key:'custom',source_type:'external'};
  const bindings=[{binding_key:'role.warrior.avatar',asset_key:'custom',status:'published',fallback_path:image.local_path},{binding_key:'sfx.test',asset_key:'audio',status:'published'},{binding_key:'path.local.test',asset_key:'draft',status:'draft'}];
  const plan=imageBindingPlan([image],new Map([[image.local_path,remote]]),bindings,[custom]);
  assert.ok(plan.some(b=>b.binding_key==='path.local.test'));assert.ok(plan.every(b=>b.binding_key.startsWith('path.')));assert.equal(plan[0].asset_key,remote.asset_key);assert.equal(plan[0].status,'published');assert.equal(bindings[2].asset_key,'draft');assert.equal(imageBindingPlan([image],new Map([[image.local_path,remote]]),[...bindings,...plan],[custom,remote]).length,0);
  assert.match(publicImageUrl('https://assets.example.test/',remote),/images\/roles\/%E5%9C%96.webp$/);
  assert.throws(()=>imageBindingPlan([image],new Map(),bindings,[]),/Unverified image/);
});
test('Cloud image registry resolves encoded and relative paths, SVG images, backgrounds and detached preloads',async()=>{
  const domEvents={},events={},css=new Map(),nodes=[];
  class Node{constructor(tag='img'){this.tagName=tag;this.dataset={};this.attrs={};this.style={};}getAttribute(k){return this.attrs[k]??null;}setAttribute(k,v){this.attrs[k]=v;}querySelectorAll(){return [];}}
  class ImageNode extends Node{get src(){return this.attrs.src;}set src(v){this.attrs.src=v;}async decode(){if(this.src?.includes('broken'))throw Error('missing');}}
  const local=['/assets/example.png','/assets/icons/status/中毒.webp','/BOSS/深淵/test.png','/assets/environments/backgrounds/background.webp','/photo/Battle.webp'];
  const assets=local.map((p,i)=>({asset_key:'storage.'+i,source_type:'storage',storage_bucket:'game-assets',storage_path:'images/'+i+'.png',is_public:true})),bindings=local.map((p,i)=>({binding_key:'path.'+i,asset_key:'storage.'+i,fallback_path:p}));
  const body=new Node('body');body.querySelectorAll=()=>nodes;
  const scope={URL,Image:ImageNode,HTMLImageElement:ImageNode,location:{origin:'http://localhost:3106',href:'http://localhost:3106/dev'},MutationObserver:class{observe(){}},
    document:{body,querySelectorAll:()=>nodes.filter(n=>n.tagName==='link'),documentElement:{style:{setProperty:(k,v)=>css.set(k,v)}},addEventListener:(k,v)=>domEvents[k]=v},
    StudioContent:{rows:t=>t==='game_assets'?assets:bindings,state:{config:{SUPABASE_URL:'https://assets.example.test'}},load:async()=>{}}};
  scope.window={StudioContent:scope.StudioContent,addEventListener:(k,v)=>events[k]=v};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/shared/local-paths.cjs',import.meta.url),'utf8'),scope);vm.runInContext(readFileSync(new URL('../public/js/studio/asset-registry.js',import.meta.url),'utf8'),scope);
  const img=new ImageNode();img.src='assets/example.png';const svg=new Node('image');svg.attrs.href='/BOSS/深淵/test.png';const icon=new Node('link');icon.attrs.rel='icon';icon.attrs.href='/assets/example.png';nodes.push(img,svg,icon);domEvents.DOMContentLoaded();
  const registry=scope.window.assetRegistry;
  assert.equal(registry.resolvePath('/buff%20icon/%E4%B8%AD%E6%AF%92.webp?v=2'),'https://assets.example.test/storage/v1/object/public/game-assets/images/1.png');
  bindings[1].fallback_path='/buff icon/中毒.webp';events['studio:content-ready']();
  assert.equal(registry.resolvePath('/assets/icons/status/中毒.webp'),'https://assets.example.test/storage/v1/object/public/game-assets/images/1.png');
  assert.match(icon.attrs.href,/images\/0.png$/);assert.match(img.src,/images\/0.png$/);assert.match(svg.attrs.href,/images\/2.png$/);assert.match(css.get('--studio-game-background'),/images\/3.png/);assert.match(css.get('--studio-battle-background'),/images\/4.png/);
  const detached=await registry.preloadImage('/assets/example.png');assert.match(detached.src,/images\/0.png$/);assert.equal(detached.crossOrigin,'anonymous');
  assets[0].storage_path='images/broken.png';events['studio:content-ready']();const fallback=await registry.preloadImage('/assets/example.png');assert.equal(fallback.src,'/assets/example.png');
  assert.equal(registry.resolvePath('https://other.example.test/assets/example.png'),'https://other.example.test/assets/example.png');
});

test('All 15 roles can unequip exclusive equipment to bag or squad, sell in shop, discard, with exact stat reversal and cross-role guard', t => {
  const allRoles = ['warrior', 'mage', 'archer', 'assassin', 'bard', 'alchemist', 'druid', 'paladin', 'gladiator', 'samurai', 'sage', 'augur', 'onmyoji', 'dreamweaver', 'stargazer'];
  for (const role of allRoles) {
    const { room } = fixture(t, role);
    const exclusive = TIER1_EQUIPMENTS.find(i => i.role === role) || room.squadInventory.find(i => i?.role === role);
    const item = exclusive ? { ...exclusive } : { id: `test_${role}`, role, name: `測試專屬_${role}`, slot: 'CLASS_EXCLUSIVE', tier: 'CLASS_EXCLUSIVE', bonusHp: 20, bonusDef: 5 };
    
    // Equip from personal bag
    room.players.solo.bag = [{ ...item }];
    const equipRes = room.equipItemFromBag('solo', 0);
    assert.equal(equipRes.success, true, `Role ${role} failed to equip exclusive item from bag`);
    assert.equal(room.players.solo.equipSlots.CLASS_EXCLUSIVE.id, item.id);
    
    // Unequip to personal bag
    const unequipBagRes = room.unequipItemToBag('solo', 'CLASS_EXCLUSIVE');
    assert.equal(unequipBagRes.success, true, `Role ${role} failed to unequip exclusive item to bag`);
    assert.equal(room.players.solo.equipSlots.CLASS_EXCLUSIVE, null);
    assert.equal(room.players.solo.bag[0].id, item.id);
    
    // Re-equip from bag
    assert.equal(room.equipItemFromBag('solo', 0).success, true);
    
    // Unequip to squad inventory
    const unequipSquadRes = room.unequipItemToSquad('solo', 'CLASS_EXCLUSIVE');
    assert.equal(unequipSquadRes.success, true, `Role ${role} failed to unequip exclusive item to squad`);
    assert.equal(room.players.solo.equipSlots.CLASS_EXCLUSIVE, null);
    const squadIdx = room.squadInventory.findIndex(i => i && i.id === item.id);
    assert.ok(squadIdx >= 0, `Item ${item.id} not found in squad inventory`);
    
    // Re-equip from squad inventory
    assert.equal(room.equipItemFromSquad('solo', squadIdx).success, true);
    assert.equal(room.players.solo.equipSlots.CLASS_EXCLUSIVE.id, item.id);

    // Cross-role protection: another role cannot equip this item
    const otherRole = role === 'warrior' ? 'mage' : 'warrior';
    const { room: otherRoom } = fixture(t, otherRole);
    otherRoom.players.solo.bag = [{ ...item }];
    const crossRes = otherRoom.equipItemFromBag('solo', 0);
    assert.equal(crossRes.success, false, `Other role ${otherRole} should not be allowed to equip ${role}'s exclusive item`);
    assert.match(crossRes.message, /專屬裝備/);

    // Stat reversal on discard
    const hpBeforeDiscard = room.players.solo.maxHp;
    const discardRes = room.discardItem('solo', { fromArea: 'equip', slotKey: 'CLASS_EXCLUSIVE' });
    assert.equal(discardRes.success, true);
    assert.equal(room.players.solo.equipSlots.CLASS_EXCLUSIVE, null);
    if (item.bonusHp) {
      assert.equal(room.players.solo.maxHp, hpBeforeDiscard - item.bonusHp);
    }

    // Stat reversal on sell in shop
    room.state = 'EVENT';
    room.currentEvent = { type: 'shop', items: [], col: 2 };
    room.players.solo.bag = [{ ...item }];
    room.equipItemFromBag('solo', 0);
    const hpBeforeSell = room.players.solo.maxHp;
    const goldBeforeSell = room.gold || 0;
    const sellRes = room.handleShopAction('solo', 'sell', { fromArea: 'equip', slotKey: 'CLASS_EXCLUSIVE' });
    assert.equal(sellRes.success, true);
    assert.equal(room.players.solo.equipSlots.CLASS_EXCLUSIVE, null);
    assert.ok(room.gold > goldBeforeSell);
    if (item.bonusHp) {
      assert.equal(room.players.solo.maxHp, hpBeforeSell - item.bonusHp);
    }
  }
});

test('Stargazer three exclusive equipments (sg_eye, sg_watch, sg_cloak) mechanics and unequipped fallback', async t => {
  const { LOOT_TABLE } = await import('./constants.js');
  const { NEW_LOOT } = await import('./role-config.js');
  const sgEye = NEW_LOOT.find(i => i.id === 'sg_eye');
  const sgWatch = NEW_LOOT.find(i => i.id === 'sg_watch');
  const sgCloak = NEW_LOOT.find(i => i.id === 'sg_cloak');

  // Verify only 3 exclusive items exist for stargazer in loot
  const sgLoot = LOOT_TABLE.filter(i => i.role === 'stargazer');
  assert.equal(sgLoot.length, 3);
  assert.deepEqual(sgLoot.map(i => i.id).sort(), ['sg_cloak', 'sg_eye', 'sg_watch']);

  function makeBattle() {
    const events = [];
    const socket = { id: 'solo', join() {}, emit() {} };
    const io = { to: () => ({ emit: (...args) => events.push(args) }) };
    const room = new Room('TEST1', socket, 'Tester', io);
    room.selectRole('solo', 'stargazer');
    room.handleBattleEvent(null, false, { col: 1 });
    const template = room.currentMonster;
    room.enemies = ['ABYSS', 'MINION', 'MINION'].map((tier, i) =>
      room.createEnemyInstance(template, i, { tier, rng: () => .5 }));
    for (const enemy of room.enemies) { enemy.hp = 500; enemy.maxHp = 500; }
    room.currentMonster = room.enemies[0];
    room.players.solo.targetEnemyId = room.enemies[0].instanceId;
    return { room, events };
  }

  // sg_eye mechanics: 4 outcomes, no star
  {
    const outcomes = new Set();
    const rolls = [[0.1, 'planet'], [0.35, 'galaxy'], [0.6, 'blackhole'], [0.85, 'boundary']];
    for (const [r, expected] of rolls) {
      const { room, events } = makeBattle();
      const p = room.players.solo;
      p.equipSlots.CLASS_EXCLUSIVE = { ...sgEye };
      room.syncPlayerEquips(p);

      const origRandom = Math.random;
      Math.random = () => r;
      p.action = 'sg_observe';
      room.resolveTurnActions();
      Math.random = origRandom;

      const queue = events.filter(e => e[0] === 'battle:presentation_queue').at(-1)?.[1].queue || [];
      const step = queue.find(s => s.actionId === 'sg_observe');
      assert.equal(step.outcome.type, expected);
      assert.equal(step.outcome.enhanced, true);
      outcomes.add(step.outcome.type);
    }
    assert.deepEqual([...outcomes].sort(), ['blackhole', 'boundary', 'galaxy', 'planet']);

    // Black hole with sg_eye: deals round(2.5 * A魔) true damage to the selected enemy, 0 to allies
    {
      const { room, events } = makeBattle();
      const p = room.players.solo;
      p.equipSlots.CLASS_EXCLUSIVE = { ...sgEye };
      room.syncPlayerEquips(p);
      // Target a selected minion (non-Boss) to verify sg_eye blackhole hits the selected enemy and records its HP/metadata
      p.targetEnemyId = room.enemies[1].instanceId;
      room.enemies[1].defense = 99;
      room.enemies[1].resistances = { physical: 80, magic: 80, effect: 80 };

      const origRandom = Math.random;
      Math.random = () => 0.6; // blackhole
      p.action = 'sg_observe';
      room.resolveTurnActions();
      Math.random = origRandom;

      const queue = events.filter(e => e[0] === 'battle:presentation_queue').at(-1)?.[1].queue || [];
      const step = queue.find(s => s.actionId === 'sg_observe');
      const allyDamage = step.results.filter(r => r.kind === 'damage' && r.targetId === p.id);
      assert.equal(allyDamage.length, 0, 'sg_eye blackhole must not harm allies');
      const selectedDamage = step.results.find(r => r.damageType === 'true' && r.targetId === room.enemies[1].instanceId);
      assert.ok(selectedDamage, 'Should deal true damage to the selected enemy');
      assert.equal(selectedDamage.finalDamage, 28);
      assert.equal(selectedDamage.actualHpDamage, 28);
      assert.equal(selectedDamage.actualDamage, 28);
      assert.equal(room.enemies[1].hp, 472);
      assert.equal(room.enemies[0].hp, 500, 'Unselected enemy must not be harmed by sg_eye blackhole');
      assert.equal(step.targetEnemyId, room.enemies[1].instanceId);
      assert.equal(step.targetHpBefore, 500);
      assert.equal(step.targetHpAfter, 472);
    }

    // Black hole with different magic/physical attack bonuses and Minion-only formation
    {
      const { room, events } = makeBattle();
      const p = room.players.solo;
      room.players.p2 = { id: 'p2', name: 'Ally2', role: 'warrior', hp: 120, maxHp: 120, isDead: false, equipSlots: { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null }, equips: [], cooldowns: {}, statuses: [] };
      room.memberIds.push('p2');
      // Equip magic weapon (+5 MAtk) and physical accessory (+10 PAtk, must be ignored)
      p.equipSlots.WEAPON = { id: 'star_staff', name: '星紋法杖', slot: 'WEAPON', bonusMagAtk: 5, isMagic: true };
      p.equipSlots.ACCESSORY = { id: 'phys_ring', name: '物攻戒', slot: 'ACCESSORY', bonusPhysAtk: 10 };
      p.equipSlots.CLASS_EXCLUSIVE = null;
      room.syncPlayerEquips(p);
      // Target minion 1 in normal blackhole: A魔 = 11 + 5 = 16 -> round(1.0 * 16) = 16 true damage to minion 1, and 5 true damage to all living allies
      p.targetEnemyId = room.enemies[1].instanceId;
      room.enemies[1].defense = 50;
      room.enemies[1].resistances = { physical: 75, magic: 75, effect: 50 };

      const origRandom = Math.random;
      Math.random = () => 0.85; // normal blackhole (0.8 <= r < 0.9)
      p.action = 'sg_observe';
      room.players.p2.action = 'skip';
      room.resolveTurnActions();
      Math.random = origRandom;

      const queue = events.filter(e => e[0] === 'battle:presentation_queue').at(-1)?.[1].queue || [];
      const step = queue.find(s => s.actionId === 'sg_observe');
      const enemyHit = step.results.find(r => r.targetEnemyId === room.enemies[1].instanceId);
      assert.ok(enemyHit, 'Normal blackhole should hit the selected enemy');
      assert.equal(enemyHit.damageType, 'true');
      assert.equal(enemyHit.finalDamage, 16);
      assert.equal(enemyHit.actualHpDamage, 16);
      assert.equal(room.enemies[1].hp, 484);
      const allyHits = step.results.filter(r => !r.targetEnemyId && r.kind === 'damage');
      assert.equal(allyHits.length, 2);
      for (const hit of allyHits) {
        assert.equal(hit.damageType, 'true');
        assert.equal(hit.finalDamage, 5);
        assert.equal(hit.actualHpDamage, 5);
      }

      // Now equip sg_eye with A魔 = 16 -> round(2.5 * 16) = 40 true damage to the selected enemy (even in Minion-only formation)
      room.enemies[0].hp = 0; // Boss dead, only Minions remain
      p.targetEnemyId = room.enemies[1].instanceId;
      p.equipSlots.CLASS_EXCLUSIVE = { ...sgEye };
      room.syncPlayerEquips(p);
      p.cooldowns.sg_observe = 0;
      Math.random = () => 0.6; // sg_eye blackhole
      p.action = 'sg_observe';
      room.players.p2.action = 'skip';
      room.resolveTurnActions();
      Math.random = origRandom;

      const queue2 = events.filter(e => e[0] === 'battle:presentation_queue').at(-1)?.[1].queue || [];
      const step2 = queue2.find(s => s.actionId === 'sg_observe');
      const minionHit = step2.results.find(r => r.targetEnemyId === room.enemies[1].instanceId);
      assert.ok(minionHit, 'sg_eye blackhole should hit the selected minion');
      assert.equal(minionHit.finalDamage, 40);
      assert.equal(minionHit.actualHpDamage, 40);
      assert.equal(room.enemies[1].hp, 444);
      assert.equal(step2.results.filter(r => !r.targetEnemyId && r.kind === 'damage').length, 0, 'sg_eye blackhole must not harm allies');
    }

    // Boundary with sg_eye: selects 2 distinct allies when available
    {
      const { room, events } = makeBattle();
      const p = room.players.solo;
      p.equipSlots.CLASS_EXCLUSIVE = { ...sgEye };
      room.syncPlayerEquips(p);

      room.players.p2 = { id: 'p2', name: 'Ally2', role: 'mage', hp: 50, maxHp: 100, isDead: false, equipSlots: { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null }, equips: [], cooldowns: {}, statuses: [] };
      room.memberIds.push('p2');

      const origRandom = Math.random;
      Math.random = () => 0.85; // boundary
      p.action = 'sg_observe';
      room.resolveTurnActions();
      Math.random = origRandom;

      assert.ok(room.p8Has(p, 'boundary'), 'Player should have boundary buff');
      assert.ok(room.p8Has(room.players.p2, 'boundary'), 'Ally2 should have boundary buff');
    }

    // Unequipped: restores star (發現星座)
    {
      const { room, events } = makeBattle();
      const p = room.players.solo;
      p.equipSlots.CLASS_EXCLUSIVE = null;
      room.syncPlayerEquips(p);

      const origRandom = Math.random;
      Math.random = () => 0.1; // < 0.6 -> star
      p.action = 'sg_observe';
      room.resolveTurnActions();
      Math.random = origRandom;

      const queue = events.filter(e => e[0] === 'battle:presentation_queue').at(-1)?.[1].queue || [];
      const step = queue.find(s => s.actionId === 'sg_observe');
      assert.equal(step.outcome.type, 'star');
      assert.equal(step.outcome.enhanced, false);
    }
  }

  // sg_watch mechanics: 50% accelerate, 25% reset, 25% overload, 0% nothing
  {
    const outcomes = new Set();
    const testRolls = [[0.1, 'accelerate'], [0.49, 'accelerate'], [0.55, 'reset'], [0.74, 'reset'], [0.76, 'overload'], [0.99, 'overload']];
    for (const [r, expected] of testRolls) {
      const { room, events } = makeBattle();
      const p = room.players.solo;
      p.equipSlots.CLASS_EXCLUSIVE = { ...sgWatch };
      room.syncPlayerEquips(p);

      const origRandom = Math.random;
      Math.random = () => r;
      p.action = 'sg_clock';
      room.resolveTurnActions();
      Math.random = origRandom;

      const queue = events.filter(e => e[0] === 'battle:presentation_queue').at(-1)?.[1].queue || [];
      const step = queue.find(s => s.actionId === 'sg_clock');
      assert.equal(step.outcome.type, expected);
      assert.notEqual(step.outcome.type, 'nothing', 'sg_watch must NOT produce nothing');
      outcomes.add(step.outcome.type);
    }
    assert.deepEqual([...outcomes].sort(), ['accelerate', 'overload', 'reset']);

    // Unequipped: allows nothing (星軌虛耗)
    {
      const { room, events } = makeBattle();
      const p = room.players.solo;
      p.equipSlots.CLASS_EXCLUSIVE = null;
      room.syncPlayerEquips(p);

      const origRandom = Math.random;
      Math.random = () => 0.95; // >= 0.9 -> nothing
      p.action = 'sg_clock';
      room.resolveTurnActions();
      Math.random = origRandom;

      const queue = events.filter(e => e[0] === 'battle:presentation_queue').at(-1)?.[1].queue || [];
      const step = queue.find(s => s.actionId === 'sg_clock');
      assert.equal(step.outcome.type, 'nothing');
    }
  }

  // sg_cloak mechanics: 星塵回響 deals 10 + segments * 1 magic damage to Boss after Boss round
  {
    const { room } = fixture(t, 'stargazer');
    room.handleBattleEvent(null, false, { col: 1 });
    const p = room.players.solo;
    p.equipSlots.CLASS_EXCLUSIVE = { ...sgCloak };
    room.syncPlayerEquips(p);

    const boss = room.getLivingEnemies()[0];
    boss.tier = 'ABYSS';
    boss.hp = 200;
    boss.maxHp = 200;

    const presentationQueue = [
      {
        type: 'player_action',
        sourceId: 'solo',
        actionId: 'basic',
        targetEnemyId: boss.instanceId,
        results: [
          { kind: 'damage', finalDamage: 12, targetEnemyId: boss.instanceId, resultId: 'dmg_1' },
          { kind: 'damage', finalDamage: 8, targetEnemyId: boss.instanceId, resultId: 'dmg_2' }
        ]
      },
      {
        type: 'boss_action',
        enemyId: boss.instanceId,
        sourceId: boss.instanceId,
        results: []
      }
    ];

    room.battleCount = 1;
    room.battleRound = 1;
    room.p8CloakRound(presentationQueue, (dmg) => ({ dmg }), 1);

    const cloakAction = presentationQueue.find(step => step.actionId === 'sg_cloak');
    assert.ok(cloakAction, 'p8CloakRound should add sg_cloak follow-up action to presentationQueue');
    assert.equal(cloakAction.skillName, '星塵回響');
    // 2 damage segments dealt to Boss -> 10 + 2 = 12 magic damage
    assert.equal(cloakAction.outcome.damageSegments, 2);
    assert.equal(cloakAction.results[0].finalDamage, 12);

    // Once per round: running again in same round does not duplicate
    const initialLen = presentationQueue.length;
    room.p8CloakRound(presentationQueue, (dmg) => ({ dmg }), 1);
    assert.equal(presentationQueue.length, initialLen, 'sg_cloak must trigger at most once per round');
  }
});

test('health costs and DOT bypass both shield pools; direct hits consume them and still trigger passives',t=>{
  for(const role of ['warrior']){
    const {room,player}=fixture(t,role);room.battleRound=1;player.hp=player.maxHp;player.DEF=0;
    room.p8GrantShield(player,40,3);room.applyHealWithOverheal(player,20);
    const hp=player.hp;
    const hit=room.applyDamageToPlayer(player,12,{kind:'enemy_direct',trueDamage:true});
    assert.equal(hit.hpDmg,0);assert.equal(hit.tempAbsorbed,12);assert.equal(player.hp,hp);
    assert.equal(role==='warrior'?player.warriorStacks:player.rage,1);
    for(const kind of ['dot','friendly','sage_confusion']){
      const before=player.hp,temp=player.tempHp;
      const result=room.applyDamageToPlayer(player,5,{kind,trueDamage:true});
      assert.equal(player.hp,before-5,kind);assert.equal(result.tempAbsorbed,0);assert.equal(player.tempHp,temp);
    }
    const snap=room.getHpSnapshot().players[0];assert.equal(snap.shieldHp,28);assert.equal(snap.temporaryOverheal,20);
    room.clearTemporaryOverheal();assert.equal(player.tempHp,28);assert.equal(player.temporaryOverheal,0);
  }
});

test('gladiator blood challenge converts shields to inspiration and attacks without self damage',t=>{
  const {room,player,events}=phase1Battle(t,'gladiator');
  player.equips=[{id:'g_xiphos',name:'斯巴達破陣短劍'}];player.action='g_sacrifice';
  room.p8GrantShield(player,300,3);for(const e of room.enemies)e.stunnedNextTurn=true;
  room.resolveTurnActions();const step=resolutionQueue(events).find(s=>s.actionId==='g_sacrifice');
  assert.ok(!step.results.some(r=>r.presentationBeat==='self_damage'));
  assert.ok(step.results.some(r=>r.targetEnemyId&&r.finalDamage>0));
  const actor=step.hpSnapshot.players.find(p=>p.id===player.id);
  assert.equal(actor.hp,step.hpSnapshotBefore.players.find(p=>p.id===player.id).hp);
  assert.equal(actor.tempHp,0);assert.equal(actor.rage,2);assert.equal(player.bloodStacks||0,0);
});

test('Augur debt expiry pays HP without consuming an existing shield',t=>{
  const {room,player}=phase1Battle(t,'augur');room.battleRound=3;player.hp=50;
  room.p8GrantShield(player,80,3);player.augurFateDebts=[{amount:20,dueRound:3}];
  room.p8EndRound([],[],{});assert.equal(player.hp,30);assert.equal(player.tempHp,80);
});

for(const intercept of [false,true])test('mimic theft survives '+(intercept?'a companion intercept and targets its owner':'full shield absorption'),t=>{
  const {room,enemy,player}=mechanismBattle(t,[SPECIAL_ELITES.treasure_mimic],intercept?'druid':'warrior');
  t.mock.method(Math,'random',()=>0);room.checkDodge=()=>false;room.gold=100;
  player.equipSlots.WEAPON={id:'sword',name:'測試劍',bonusAtk:0};
  if(intercept)player.minions=[{id:'wolf',type:'wolf',name:'幼狼',hp:10000,maxHp:10000}];
  else room.p8GrantShield(player,10000,3);
  mechanismRound(room,3);const hp=player.hp,queue=actMechanism(room,enemy);
  assert.equal(player.hp,hp);assert.equal(player.equipSlots.WEAPON,null);
  const result=queue.flatMap(s=>s.results).find(r=>r.theft);assert.equal(result.theft.ownerId,player.id);
  assert.equal(result.targetId,player.id);assert.equal(enemy.stolenLoot.equipment[0].ownerId,player.id);
});

test('vital layers use maximum HP, separate overheal and clamp the debt to current health',()=>{
  const scope={document:{addEventListener(){}}};vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8'),scope);
  const v=scope.battleVitals({hp:30,maxHp:100,tempHp:70,shieldHp:50,temporaryOverheal:20,augurFateDebts:[{amount:40}]});
  assert.equal(v.hpPct,30);assert.equal(v.shieldPct,50);assert.equal(v.overhealPct,20);assert.equal(v.debtPct,30);
});

test('multiplayer potion target modal resolves its own player and creates visual HP choices',()=>{
  const nodes=[],hidden=[],players=[{id:'me',role:'warrior',name:'我',hp:50,maxHp:120},{id:'ally',role:'warrior',name:'隊友',hp:40,maxHp:120}];
  const scope={roomState:{players},getMyPlayer:()=>players[0],classesData:{warrior:{avatar:'warrior.webp'}},escapeHtml:s=>String(s??''),getIconSvg:()=>'',
    ModalMotion:{show(){},hide:n=>hidden.push(n)},elements:{inventoryModal:{classList:{contains:()=>false}},targetModal:{},targetModalList:{innerHTML:'',appendChild:n=>nodes.push(n)},targetModalTitle:{},targetModalDesc:{}},document:{addEventListener(){},createElement:()=>({addEventListener(){}})}};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8'),scope);
  const app=readFileSync(new URL('../public/js/core/app.js',import.meta.url),'utf8');
  vm.runInContext(app.slice(app.indexOf('function openTargetModal('),app.indexOf('// 技能確認鎖定')),scope);
  for(const type of ['item_potion','inv_potion'])scope.openTargetModal(type,players);
  assert.equal(hidden.length,2);assert.equal(nodes.length,4);assert.ok(nodes.every(n=>n.innerHTML.includes('role="progressbar"')));
  assert.ok(nodes.every(n=>!n.innerHTML.includes('HP 50/120')));
});

test('all profession announcements remove parenthesized damage annotations',async()=>{
  const nodes=new Map(),scope={AbortController,document:{addEventListener(){},getElementById:id=>{if(!nodes.has(id))nodes.set(id,{classList:{add(){},remove(){}}});return nodes.get(id);}},
    isBattlefieldPlayerStep:()=>true,roomState:{players:[]},getClassDisplayName:()=>'',waitForPresentation:async()=>{}};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-hud.js',import.meta.url),'utf8')+'\nglobalThis.hud=BattleHud;',scope);
  for(const role of ['mage','archer','druid','augur']){
    await scope.hud.announce({sourceRole:role,skillName:'技能名稱（魔法） (群體)',type:'player_action'},{speed:1});
    assert.equal(nodes.get('cinematicSkillName').textContent,'技能名稱');
  }
});

for(const [role,action] of [['mage','m_blast'],['alchemist','alc_flask'],['alchemist','alc_acid'],['samurai','sa_cut']])test('group target markers distinguish and switch the primary: '+action,()=>{
  const marks=Array.from({length:3},()=>({style:{},dataset:{},classes:new Set(),animate(){this.animated=true;}}));
  marks.forEach(m=>m.classList={toggle:(c,on)=>on?m.classes.add(c):m.classes.delete(c)});
  const slots=marks.map((m,i)=>({dataset:{enemyId:'e'+i},_currentEnemy:{hp:30},querySelector:()=>m}));
  const scope={currentPendingAction:action,currentSelectedEnemyId:'e1',myId:'hero',classesData:{[role]:{skills:[]}},roomState:{players:[],enemies:slots.map(s=>({instanceId:s.dataset.enemyId,hp:30}))},getMyPlayer:()=>({id:'hero',role}),document:{addEventListener(){},querySelectorAll:()=>slots}};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8'),scope);
  scope.syncEnemyTargetIndicators();assert.ok(marks.every(m=>m.style.display===''));
  assert.ok(marks[1].classes.has('is-primary-target'));assert.ok(marks[0].classes.has('is-secondary-target'));assert.ok(marks.every(m=>m.animated));
  scope.currentSelectedEnemyId='e2';scope.syncEnemyTargetIndicators();
  assert.deepEqual(marks.map(m=>m.classes.has('is-primary-target')),[false,false,true]);
  assert.deepEqual(marks.map(m=>m.classes.has('is-secondary-target')),[true,true,false]);
  scope.currentSelectedEnemyId='e1';
  scope.currentPendingAction='basic';scope.syncEnemyTargetIndicators();
  assert.deepEqual(marks.map(m=>m.style.display),['none','','none']);
  assert.ok(marks.every(m=>!m.classes.has('is-primary-target')&&!m.classes.has('is-secondary-target')));
  scope.currentSelectedEnemyId='e2';scope.syncEnemyTargetIndicators();assert.deepEqual(marks.map(m=>m.style.display),['none','none','']);
  slots[2]._currentEnemy.hp=0;scope.syncEnemyTargetIndicators();assert.ok(marks.every(m=>m.style.display==='none'));
  slots.splice(0,2);slots[0]._currentEnemy.hp=30;scope.currentPendingAction=action;scope.syncEnemyTargetIndicators();
  assert.equal(marks[2].style.display,'');assert.ok(marks[2].classes.has('is-primary-target'));assert.ok(!marks[2].classes.has('is-secondary-target'));
  scope.currentPendingAction='alc_poison';scope.syncEnemyTargetIndicators();
  assert.ok(marks.every(m=>!m.classes.has('is-primary-target')&&!m.classes.has('is-secondary-target')));
});

test('both inventory battle-item entries use live scoped narration and player eligibility',()=>{
  const app=readFileSync(new URL('../public/js/core/app.js',import.meta.url),'utf8');
  const scope={roomState:{state:'IN_BATTLE',selectionState:'SELECTING',isNarrating:false,players:[{id:'a'},{id:'b'}]},isPlayingBattleNarrative:false};
  vm.createContext(scope);vm.runInContext(app.slice(app.indexOf('function canUseBattleItem('),app.indexOf('// 目標選擇 Modal')),scope);
  const player={id:'a',hp:40};assert.equal(scope.canUseBattleItem(player),true);
  scope.roomState.isNarrating=true;assert.equal(scope.canUseBattleItem(player),false);
  scope.roomState.isNarrating=false;assert.equal(scope.canUseBattleItem({...player,isLocked:true}),false);
  assert.equal(scope.canUseBattleItem({...player,hp:0}),false);
  assert.equal((app.match(/if \(!canUseBattleItem\(me\)\)/g)||[]).length,2);
});

test('all living Druid companions share one ordered follow-up event',t=>{
  const {room,player,events}=phase1Battle(t,'druid');player.action='basic';
  player.minions=['wolf','treant','wolf'].map((type,i)=>({id:'companion-'+i,name:type+i,type,hp:80,maxHp:80,atk:4,attack:4}));
  for(const enemy of room.enemies)enemy.stunnedNextTurn=true;
  room.resolveTurnActions();const volleys=resolutionQueue(events).filter(s=>s.type==='minion_action');
  assert.equal(volleys.length,1);assert.equal(volleys[0].skillName,'自然夥伴・共擊');
  assert.deepEqual(volleys[0].results.map(r=>r.minion.id),player.minions.map(m=>m.id));
});

test('a companion hit receives the actual enemy DOT and ticks without consuming its owner shield',t=>{
  const imp=Object.values(EXCLUSIVE_MINIONS).find(m=>m.name==='焦灼地獄小鬼');assert.ok(imp);
  const {room,enemy,player}=mechanismBattle(t,[imp],'druid');t.mock.method(Math,'random',()=>0);room.checkDodge=()=>false;
  const minion={id:'guard',type:'wolf',name:'幼狼',hp:100,maxHp:100,atk:4};player.minions=[minion];player.poisonTurns=2;player.poisonDmg=5;
  mechanismRound(room,1);actMechanism(room,enemy);
  assert.ok(minion.enemyEffects.ember);assert.equal(minion.poisonTurns,undefined,'owner poison must not be copied');
  const snapshot=room.getClientState().players.find(p=>p.id===player.id).minions[0];
  assert.ok(snapshot.statuses.some(s=>s.id==='ember'&&s.isDot));
  room.p8GrantShield(player,1000,4);const shield=player.tempHp,hp=minion.hp;
  mechanismRound(room,2);enemyPlayerRoundTicks(room);const queue=[];drainEnemyEvents(room,queue);
  assert.equal(minion.hp,hp-ENEMY_BALANCE.burnDamage);assert.equal(player.tempHp,shield);
  assert.ok(queue.some(s=>s.actionId==='companion_dot'&&s.results[0].targetId===minion.id));
  assert.equal(minion.enemyEffects.ember,undefined);
});

test('companion bleed and poison preserve turns in snapshots and remove a lethally poisoned companion',t=>{
  const {room,player}=phase1Battle(t,'druid');
  player.minions=[{id:'w',name:'幼狼',type:'wolf',hp:10,maxHp:30,bleedTurns:2,bleedDmg:2,poisonTurns:2,poisonDmg:3}];
  const state=room.getClientState().players.find(p=>p.id===player.id),before=room.getHpSnapshot().players.find(p=>p.id===player.id);
  assert.deepEqual(state.minions[0].statuses,before.minions[0].statuses);
  assert.deepEqual(state.minions[0].statuses.map(s=>[s.id,s.turns,s.value]),[['bleed',2,2],['poison',2,3]]);
  enemyPlayerRoundTicks(room);assert.equal(player.minions[0].hp,5);assert.equal(player.minions[0].poisonTurns,1);
  enemyPlayerRoundTicks(room);assert.equal(player.minions.length,0);
  const queue=[];drainEnemyEvents(room,queue);const death=queue.findLast(s=>s.actionId==='companion_dot');
  assert.equal(death.results[0].targetAfter.hp,0);assert.equal(death.results[0].ownerId,player.id);
});

test('selection state sends shield and fate debt values consumed by all shared health bars',t=>{
  const {room,player}=phase1Battle(t,'augur');player.hp=40;room.p8GrantShield(player,21,3);player.augurFateDebts=[{amount:14,dueRound:3}];
  const live=room.getClientState().players.find(p=>p.id===player.id);
  const scope={document:{addEventListener(){}},escapeHtml:s=>s};vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8'),scope);
  const v=scope.battleVitals(live);assert.equal(v.shieldPct,30);assert.equal(v.debtPct,20);
  const html=scope.battleVitalsMarkup(live);assert.match(html,/vital-shield.*width:30%/);assert.match(html,/vital-debt.*width:20%/);
});

test('the HUD retires companion portraits in order inside one volley frame',async()=>{
  class Node{
    constructor(){this.children=[];this.dataset={};this.style={setProperty:(k,v)=>{this.style[k]=v;}};this.classes=new Set();this.classList={add:c=>this.classes.add(c)};}
    appendChild(n){n.parent=this;this.children.push(n);}replaceChildren(){this.children=[];}
    setAttribute(k,v){this[k]=v;}remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
    animate(){return {finished:Promise.resolve(),cancel(){}};}
  }
  const host=new Node(),scope={document:{addEventListener(){},getElementById:()=>host,createElement:()=>new Node()},roomState:{players:[]},isBattlefieldPlayerStep:()=>true,escapeHtml:s=>s,getPlayerAvatarHtml:()=>'',companionPortraitUrl:m=>m.id+'.webp'};
  vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/js/combat/battle-hud.js',import.meta.url),'utf8')+'\nglobalThis.hud=BattleHud;',scope);
  const step={type:'minion_action',sourceRole:'druid',sourceId:'d',skillName:'自然夥伴・共擊',results:['wolf1','tree','wolf2'].map(id=>({kind:'damage',minion:{id,name:id}}))};
  scope.hud.begin([step]);assert.equal(host.children.length,1);
  const frame=host.children[0],portraits=frame.children[1];assert.equal(portraits.children.length,3);assert.equal(frame.children[0].textContent,step.skillName);
  const second=portraits.children[1];scope.hud.startCompanion(step,step.results[0]);assert.ok(portraits.children[0].classes.has('is-attacking'));
  await scope.hud.finishCompanion(step,step.results[0]);assert.equal(portraits.children.length,2);assert.equal(portraits.children[0],second);assert.equal(host.children.length,1);
  await scope.hud.finishCompanion(step,step.results[1]);await scope.hud.finishCompanion(step,step.results[2]);assert.equal(portraits.children.length,0);
});

test('companion status damage updates its own HP at contact rather than pretending it is a player',()=>{
  const owner={id:'d',hp:80,maxHp:85,minions:[{id:'wolf',hp:20,maxHp:30}]},updates=[];
  const source=readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8');
  const scope={roomState:{players:[owner]},appliedBattleResults:new Set(),isLivingPresentationResult:()=>true,resolvePresentationTarget:r=>r.targetId,applyHpSnapshot:s=>updates.push(s)};
  vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('function applyAuthoritativeResult('),source.indexOf('function playTargetedEffect(')),scope);
  assert.equal(scope.applyAuthoritativeResult({resultId:'dot',kind:'damage',targetId:'wolf',targetAfter:{id:'wolf',hp:17,maxHp:30}}),true);
  assert.equal(updates[0].players[0].id,'d');assert.equal(updates[0].players[0].hp,80);assert.equal(updates[0].players[0].minions[0].hp,17);
});

test('DoT statuses separate damage, stacks, and turns across player, enemy, and companion snapshots and UI tooltips',t=>{
  const {room,player,enemy}=mechanismBattle(t,[ENCOUNTERS[2]],'druid');
  mechanismRound(room,1);
  // 1. Player afflicted with poison, burn, bleed, fracture, chill + true stack statuses
  player.hp=100;player.maxHp=100;
  player.poisonTurns=3;player.poisonDmg=8;
  player.burnTurns=2;player.burnDmg=12;
  player.fractureTurns=3;player.fractureDmg=5;
  player.chillTurns=2;player.chillDmg=6;
  player.bleedTurns=2;player.bleedDmg=4;
  player.corruption=3;
  player.stealthStacks=2;
  player.enemyEffects={ember:{label:'熔岩灼燒',value:3,until:room.battleRound+1,sourceId:enemy.instanceId}};
  player.minions=[{id:'w1',name:'幼狼',type:'wolf',hp:30,maxHp:30,atk:4,poisonTurns:3,poisonDmg:8,bleedTurns:2,bleedDmg:4}];

  // 2. Enemy afflicted with poison, burn, bleed, fracture, chill + true stack statuses
  enemy.hp=500;enemy.maxHp=500;
  enemy.poisonTurns=3;enemy.poisonDmg=8;
  enemy.burnTurns=2;enemy.burnDmg=12;
  enemy.fractureTurns=3;enemy.fractureDmg=5;
  enemy.chillTurns=2;enemy.chillDmg=6;
  enemy.bleedTurns=2;enemy.bleedDmg=4;
  enemy.flawMarks=3;
  enemy.talismans=['blind','drain'];

  const state=room.getClientState();
  const snapPlayer=state.players.find(p=>p.id===player.id);
  const snapEnemy=state.enemies[0];
  const snapMinion=snapPlayer.minions[0];

  // Verify DoTs have damage and turns, NEVER stacks
  for(const [id,dmg,turns] of [['poison',8,3],['burn',12,2],['fracture',5,3],['chill',6,2],['bleed',4,2]]){
    const ps=snapPlayer.statuses.find(s=>s.id===id);
    assert.ok(ps,`player missing ${id}`);
    assert.equal(ps.isDot,true);
    assert.equal(ps.damage,dmg);
    assert.equal(ps.turns,turns);
    assert.equal(ps.stacks,undefined,`player ${id} must not store damage in stacks`);

    const es=snapEnemy.statuses.find(s=>s.id===id);
    assert.ok(es,`enemy missing ${id}`);
    assert.equal(es.isDot,true);
    assert.equal(es.damage,dmg);
    assert.equal(es.turns,turns);
    assert.equal(es.stacks,undefined,`enemy ${id} must not store damage in stacks`);
  }
  const emberStatus=snapPlayer.statuses.find(s=>s.id==='ember');
  assert.equal(emberStatus.isDot,true);
  assert.equal(emberStatus.damage,3);
  assert.equal(emberStatus.stacks,undefined);

  const minionPoison=snapMinion.statuses.find(s=>s.id==='poison');
  assert.equal(minionPoison.isDot,true);
  assert.equal(minionPoison.damage,8);
  assert.equal(minionPoison.turns,3);
  assert.equal(minionPoison.stacks,undefined);

  // Verify true stack statuses still preserve stacks
  assert.equal(snapPlayer.statuses.find(s=>s.id==='corruption').stacks,3);
  assert.equal(snapPlayer.statuses.find(s=>s.id==='stealth_stack').stacks,2);
  assert.equal(snapEnemy.statuses.find(s=>s.id==='flaw_mark').stacks,3);
  assert.equal(snapEnemy.statuses.find(s=>s.id==='talismans').stacks,2);

  // 3 & 4 & 7. Verify UI rendering in enemy strip, player/enemy/companion tooltips, and stacking DoTs
  const h=enemyPresentationHarness(),node=h.scope.document.createElement('div'),row=h.scope.document.createElement('div');
  node.classList={toggle(){}};node.querySelector=selector=>selector==='.enemy-status-row'?row:null;
  h.scope.getIconSvg=()=>'<svg></svg>';h.scope.document.addEventListener=()=>{};
  const tooltip=h.scope.document.createElement('div');tooltip.classList={add(){},remove(){}};
  Object.assign(h.scope,{window:{innerWidth:1280,innerHeight:720},elements:{floatingEnemyTooltip:tooltip},classesData:{druid:{name:'德魯伊'}},roomState:{battleRound:room.battleRound,players:[snapPlayer]},escapeHtml:s=>String(s??'')});
  const renderersCode=readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8');
  vm.runInContext(renderersCode,h.scope);

  // Check formatStatusDisplay for non-stacking DoT vs stacking DoT
  const poisonFmt=h.scope.formatStatusDisplay({id:'poison',label:'中毒',isDot:true,damage:8,turns:3});
  assert.equal(poisonFmt.fullTitle,'中毒｜每回合 8 傷害｜剩餘 3 回合');
  assert.ok(!poisonFmt.fullTitle.includes('×8'));

  const stackingBleedFmt=h.scope.formatStatusDisplay({id:'bleed',label:'流血',isDot:true,stacks:3,damage:12,turns:2});
  assert.equal(stackingBleedFmt.head,'流血 ×3');
  assert.equal(stackingBleedFmt.detailText,'每回合 12 傷害｜剩餘 2 回合');
  assert.equal(stackingBleedFmt.fullTitle,'流血 ×3｜每回合 12 傷害｜剩餘 2 回合');

  // Check no fabricated damage when damage is absent
  const noDmgBleedFmt=h.scope.formatStatusDisplay({id:'bleed',label:'流血',isDot:true,turns:2});
  assert.equal(noDmgBleedFmt.fullTitle,'流血｜剩餘 2 回合');
  assert.ok(!noDmgBleedFmt.fullTitle.includes('傷害'));

  // Check enemy badge strip: DoTs do not render <small> damage numbers, while flaw_mark renders <small>3</small>
  h.scope.syncEnemyMechanicVisual(snapEnemy,node);
  const strip=row.children[0];
  const flawBadge=strip.children.find(c=>c.title?.includes('破綻印記'));
  assert.ok(flawBadge);
  assert.ok(flawBadge.title.includes('×3'));
  assert.equal(flawBadge.children[0]?.textContent,'3');
  const bleedBadge=strip.children.find(c=>c.title?.includes('流血'));
  assert.ok(bleedBadge);
  assert.equal(bleedBadge.title,'流血｜每回合 4 傷害｜剩餘 2 回合');
  assert.equal(bleedBadge.children.length,0,'DoT without stacks must not render a <small> stack count badge');

  // Check enemy, player, and companion tooltips
  h.scope.showEnemyTooltip(snapEnemy,node);
  assert.ok(tooltip.innerHTML.includes('中毒 (每回合 8 傷害｜剩餘 3 回合)'));
  assert.ok(tooltip.innerHTML.includes('燃燒 (每回合 12 傷害｜剩餘 2 回合)'));
  assert.ok(!tooltip.innerHTML.includes('×8'));
  assert.ok(!tooltip.innerHTML.includes('×12'));
  assert.ok(tooltip.innerHTML.includes('×3'));

  h.scope.showPlayerTooltip(snapPlayer,node);
  assert.ok(tooltip.innerHTML.includes('中毒 (每回合 8 傷害｜剩餘 3 回合)'));
  assert.ok(tooltip.innerHTML.includes('燃燒 (每回合 12 傷害｜剩餘 2 回合)'));
  assert.ok(!tooltip.innerHTML.includes('×8'));
  assert.ok(!tooltip.innerHTML.includes('×12'));
  assert.ok(tooltip.innerHTML.includes('深淵腐化 ×3'));

  h.scope.showCompanionTooltip(snapMinion,snapPlayer.name,node);
  assert.ok(tooltip.innerHTML.includes('中毒｜每回合 8 傷害｜剩餘 3 回合'));
  assert.ok(tooltip.innerHTML.includes('流血｜每回合 4 傷害｜剩餘 2 回合'));

  // 5 & 6. Verify DoT turns decrement and actual settlement damage is unchanged
  const playerHpBefore=player.hp;
  const enemyHpBefore=enemy.hp;
  delete enemy.talismans;
  room.executeRoundStart();
  // Player takes poison (8) + burn (12) + fracture (5) + chill (6) + ember (3) = 34
  assert.equal(player.hp,playerHpBefore-(8+12+5+6+3));
  assert.equal(player.poisonTurns,2);
  assert.equal(player.burnTurns,1);
  assert.equal(player.fractureTurns,2);
  assert.equal(player.chillTurns,1);
  // Enemy takes poison (8) + burn (12) + fracture (5) + chill (6) = 31
  assert.equal(enemy.hp,enemyHpBefore-(8+12+5+6));
  assert.equal(enemy.poisonTurns,2);
  assert.equal(enemy.burnTurns,1);
  assert.equal(enemy.fractureTurns,2);
  assert.equal(enemy.chillTurns,1);
});

test('All 12 leader skills and class Buff/Debuff icons resolve consistently across HUD, teammate bar, and hover without falling back to equation icon',t=>{
  const h=enemyPresentationHarness();
  h.scope.document.addEventListener=()=>{};
  const hudStatuses=h.scope.document.createElement('div');
  hudStatuses.id='hudPlayerStatuses';hudStatuses.querySelectorAll=()=>[];
  const partyOverview=h.scope.document.createElement('div');
  partyOverview.id='partyOverview';partyOverview.querySelectorAll=()=>[];
  const tooltip=h.scope.document.createElement('div');
  tooltip.classList={add(){},remove(){}};
  const hudNodes=new Map([['hudPlayerStatuses',hudStatuses],['partyOverview',partyOverview]]);
  h.scope.document.getElementById=id=>{
    if(!hudNodes.has(id)){const n=h.scope.document.createElement('div');n.id=id;n.querySelectorAll=()=>[];n.addEventListener=()=>{};n.classList={add(){},remove(){},toggle(){}};hudNodes.set(id,n);}
    return hudNodes.get(id);
  };
  Object.assign(h.scope,{
    window:{innerWidth:1280,innerHeight:720},
    elements:{floatingEnemyTooltip:tooltip},
    classesData:{
      warrior:{name:'戰士'},mage:{name:'法師'},archer:{name:'弓箭手'},bard:{name:'吟遊詩人'},
      dreamweaver:{name:'織夢術士'},paladin:{name:'聖騎士'},gladiator:{name:'角鬥士'},stargazer:{name:'觀星者'},
      augur:{name:'卜者'},samurai:{name:'武士'},sage:{name:'智者'},alchemist:{name:'煉金術士'},
      druid:{name:'德魯伊'},assassin:{name:'刺客'}
    },
    isBattlefieldPlayerStep:s=>s.type==='player_action',
    getIconSvg:()=>'<svg></svg>',
    getRoleIconName:()=>'warrior',
    getClassDisplayName:r=>r,
    getPlayerAvatarHtml:()=>'<img src="avatar.webp">',
    escapeHtml:s=>String(s??''),
    roomState:{battleRound:1,players:[]}
  });
  const renderersCode=readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8');
  const hudCode=readFileSync(new URL('../public/js/combat/battle-hud.js',import.meta.url),'utf8')+'\nglobalThis.BattleHud=BattleHud;';
  vm.runInContext(renderersCode,h.scope);
  vm.runInContext(hudCode,h.scope);

  // 1 & 2. Verify all 12 leader skills under their actual trigger conditions
  const leaderCases=[
    {role:'warrior',id:'leader_warrior',label:'堅盾戰意',setup:(room,player)=>{room.p8GrantShield(player,15,2,'warrior');}},
    {role:'mage',id:'leader_mage',label:'魔力共鳴',setup:()=>{}},
    {role:'archer',id:'leader_archer',label:'疾風步法',setup:()=>{}},
    {role:'bard',id:'leader_bard',label:'撫慰樂章',setup:()=>{}},
    {role:'dreamweaver',id:'leader_dreamweaver',label:'美夢成真',setup:()=>{}},
    {role:'paladin',id:'leader_paladin',label:'聖光庇護',setup:()=>{}},
    {role:'gladiator',id:'leader_gladiator',label:'鬥技場之王',setup:(room,player)=>{room.arena={playerId:player.id,enemyId:room.enemies[0].instanceId,until:room.battleRound+2};}},
    {role:'stargazer',id:'leader_stargazer',label:'界外星圖',setup:(room)=>{room.stargazerBoundaryScoutedNext=true;}},
    {role:'augur',id:'leader_augur',label:'洞悉虛妄',setup:()=>{}},
    {role:'samurai',id:'leader_samurai',label:'名刀鑑賞',setup:()=>{}},
    {role:'sage',id:'leader_sage',label:'守勢推演',setup:(room,player)=>{player.sagePhase='hypothesis';}},
    {role:'alchemist',id:'leader_alchemist',label:'高產萃取',setup:()=>{}}
  ];

  for(const c of leaderCases){
    const {room,player}=mechanismBattle(t,[ENCOUNTERS[0]],c.role);
    mechanismRound(room,1);
    c.setup(room,player);
    const state=room.getClientState();
    const snapPlayer=state.players.find(p=>p.id===player.id);
    const leaderStatus=snapPlayer.statuses.find(s=>s.id===c.id);
    assert.ok(leaderStatus,`Expected ${c.id} (${c.label}) to be active for ${c.role}`);
    assert.equal(leaderStatus.label,c.label);
    assert.equal(h.scope.isLeaderSkillStatus(leaderStatus),true);
    assert.equal(h.scope.resolveLeaderStatusRole(leaderStatus),c.role);
    assert.equal(h.scope.getBuffIconUrl(leaderStatus),null,'Leader skill must not resolve through BUFF_ICON_MAP or fall back to equation icon');

    const expectedSvg=h.scope.getLeaderStatusSvg(leaderStatus,c.role);
    assert.ok(expectedSvg&&expectedSvg.includes('<svg'),`Missing SVG for ${c.id}`);
    assert.equal(expectedSvg,vm.runInContext('DEFAULT_CLASS_EXCLUSIVE_SVGS',h.scope)[c.role],`Expected exact class-exclusive SVG for ${c.role}`);
    assert.ok(!expectedSvg.includes('方程特性.webp'));

    // Check HUD (#hudPlayerStatuses) and Party Overview (#partyOverview)
    h.scope.roomState=state;
    h.scope.myId=snapPlayer.id;
    h.scope.BattleHud.updatePlayer(snapPlayer);
    assert.ok(hudStatuses.innerHTML.includes(`aria-label="${c.label}"`),`HUD button missing for ${c.id}`);
    assert.ok(hudStatuses.innerHTML.includes(expectedSvg),`HUD icon mismatch for ${c.id}`);
    if(c.role!=='sage'){
      assert.ok(!hudStatuses.innerHTML.includes('方程特性.webp'),`Unexpected equation icon in HUD for ${c.role}`);
    }

    // Check Teammate Card / Party Overview (renderTeammateBuffIcons & #partyOverview)
    const teammateHtml=h.scope.renderTeammateBuffIcons(snapPlayer.statuses);
    assert.ok(teammateHtml.includes(expectedSvg),`Teammate card icon mismatch for ${c.id}`);
    assert.ok(!teammateHtml.includes('方程特性.webp'));
    assert.ok(partyOverview.innerHTML.includes(expectedSvg),`Party overview icon mismatch for ${c.id}`);
    assert.ok(!partyOverview.innerHTML.includes('方程特性.webp'));

    // Check Player Portrait Hover (showPlayerTooltip)
    const anchorNode=h.scope.document.createElement('div');
    h.scope.showPlayerTooltip(snapPlayer,anchorNode);
    assert.ok(tooltip.innerHTML.includes(c.label),`Tooltip missing label for ${c.id}`);
    assert.ok(tooltip.innerHTML.includes(expectedSvg),`Hover tooltip icon mismatch for ${c.id}`);
    assert.ok(!tooltip.innerHTML.includes('方程特性.webp'));
  }

  // 3 & 4. Leader skill with unknown/missing role uses neutral default SVG, NEVER warrior SVG
  const unknownLeader={id:'leader_unknown_role',label:'未知隊長技',isLeaderPassive:true,leaderRole:'nonexistent_role'};
  const warriorSvg=h.scope.getLeaderStatusSvg({id:'leader_warrior',isLeaderPassive:true,leaderRole:'warrior'});
  const unknownLeaderSvg=h.scope.getLeaderStatusSvg(unknownLeader);
  assert.notEqual(unknownLeaderSvg,warriorSvg,'Unknown leader role must not impersonate warrior');
  assert.ok(unknownLeaderSvg.includes('status-default-buff-icon'));

  // 5 & 6. Undefined/unknown Buff and Debuff use neutral default icons, NEVER 方程特性.webp
  const unknownBuff={id:'custom_unmapped_buff',label:'神秘祝福',category:'BUFF'};
  const unknownDebuff={id:'custom_unmapped_debuff',label:'神秘詛咒',category:'DEBUFF',isNegative:true};
  assert.equal(h.scope.getBuffIconUrl(unknownBuff),null);
  assert.equal(h.scope.getBuffIconUrl(unknownDebuff),null);
  assert.equal(h.scope.resolveStatusIconUrl(unknownBuff),null);
  assert.equal(h.scope.resolveStatusIconUrl(unknownDebuff),null);

  const buffMarkup=h.scope.renderStatusIconMarkup(unknownBuff,{variant:'hud'});
  const debuffMarkup=h.scope.renderStatusIconMarkup(unknownDebuff,{variant:'hud'});
  assert.ok(buffMarkup.includes('status-default-buff-icon')&&!buffMarkup.includes('方程特性.webp'));
  assert.ok(debuffMarkup.includes('status-default-debuff-icon')&&!debuffMarkup.includes('方程特性.webp'));
  assert.notEqual(buffMarkup,debuffMarkup,'Default buff and debuff icons must be distinct');

  // 7. Sage equation statuses still properly use 方程特性.webp
  for(const sageStatus of [
    {id:'sage_equation',label:'演算・假設 [12]',icon:'equation'},
    {id:'sage_confusion',label:'思維紊亂',icon:'debuff'},
    {id:'abyss_sage',label:'演算誤差 ×6',icon:'equation'}
  ]){
    assert.equal(h.scope.getBuffIconUrl(sageStatus),'/assets/icons/status/方程特性.webp');
    assert.equal(h.scope.resolveStatusIconUrl(sageStatus),'/assets/icons/status/方程特性.webp');
  }

  // 8. Other class statuses (Alchemist, Druid, Sage, Augur, Paladin, Samurai, Gladiator, Assassin) match across HUD, Teammate Bar, and Hover
  const classStatuses=[
    {id:'poison',label:'中毒',icon:'poison',damage:8,turns:2,isDot:true,isNegative:true},
    {id:'burn',label:'燃燒',icon:'burn',damage:12,turns:1,isDot:true,isNegative:true},
    {id:'fracture',label:'骨折',icon:'fracture',damage:5,turns:3,isDot:true,isNegative:true},
    {id:'chill',label:'寒冷',icon:'chill',damage:6,turns:2,isDot:true,isNegative:true},
    {id:'alchemy_corrosion',label:'強酸腐蝕・裝備效果降低',icon:'debuff',turns:1,stacks:2,isNegative:true},
    {id:'bear',label:'巨熊形態',icon:'transform',turns:2},
    {id:'wolf',label:'狼人形態',icon:'transform',turns:2},
    {id:'sleep',label:'沉睡古樹',icon:'sleep',turns:2},
    {id:'augur_blessing',label:'命運加護 +15%',icon:'buff',turns:1},
    {id:'augur_debt',label:'命債 20',icon:'debuff',turns:1,isNegative:true},
    {id:'augur_omen_reversed',label:'凶兆逆位',icon:'debuff',turns:2,isNegative:true},
    {id:'paladin_target_weight',label:'神聖嘲諷・受擊權重 ↑',icon:'guard',turns:0},
    {id:'paladin_grace',label:'代受恩典',icon:'guard',turns:2},
    {id:'paladin_glory',label:'榮耀戰歌・蓄力中',icon:'buff',turns:1},
    {id:'kyoutou',label:'狂刀',icon:'buff',turns:1},
    {id:'soul',label:'武魂',icon:'buff',turns:0,stacks:4},
    {id:'zanshin_verify',label:'殘心',icon:'debuff',stacks:3,isNegative:true},
    {id:'rage',label:'怒氣 40',icon:'buff',turns:0,value:40},
    {id:'blood_stacks',label:'血祭 2/4',icon:'buff',turns:0,stacks:2},
    {id:'arena_challenge',label:'死鬥進行中',icon:'arena',turns:2},
    {id:'hidden',label:'隱身',icon:'stealth',turns:1},
    {id:'stealth_stack',label:'匿蹤',icon:'stealth',turns:0,stacks:3}
  ];
  for(const status of classStatuses){
    const url=h.scope.getBuffIconUrl(status);
    if(status.id.startsWith('zanshin_'))assert.equal(url,'/assets/icons/status/殘心.png');
    assert.ok(url&&!url.includes('方程特性.webp'),`Status ${status.id} should map to a dedicated icon, got ${url}`);
    const hudHtml=h.scope.renderStatusIconMarkup(status,{variant:'hud'});
    const teammateHtml=h.scope.renderStatusIconMarkup(status,{variant:'teammate'});
    const tooltipHtml=h.scope.renderStatusIconMarkup(status,{variant:'tooltip'});
    assert.ok(hudHtml.includes(url)&&teammateHtml.includes(url)&&tooltipHtml.includes(url),`Inconsistent icon URL for ${status.id}`);
  }
});

// Gladiator revision: production hooks, HP ownership, equipment and presentation contracts.
function gladiatorBattle(t,party=1) {
  const f=fixture(t,'gladiator');t.mock.method(Math,'random',()=>.5);
  for(let i=1;i<party;i++){const id='ally'+i;f.room.addPlayer({id,join(){},emit(){}},id);f.room.selectRole(id,'mage');}
  f.room.handleBattleEvent(null,false,{col:1});
  f.room.setEnemies([f.room.createEnemyInstance({id:'gladiator_dummy',name:'訓練魔物',hp:10000,attack:0,defense:0,noBonusResistance:true},0,{tier:'ELITE',rng:()=>0})]);
  const enemy=f.room.enemies[0];enemy.hp=enemy.maxHp=10000;enemy.DEF=enemy.defense=0;enemy.resistances={physical:0,magic:0,effect:0};
  f.player.hp=f.player.maxHp=85;f.player.targetEnemyId=enemy.instanceId;f.room.battleRound=1;return {...f,enemy};
}
function gladiatorCast(f,action) {
  f.player.action=action;const log=[];const outcome=f.room.p8Action(f.player,raw=>({dmg:raw}),1,[],log);
  return {outcome,results:f.room.p8Results,log};
}
for(const party of [1,2,3,4])for(const hp of [85,35,1])test(`Gladiator unchanged maxima and exact entry recovery: party=${party}, hp=${hp}`,t=>{
  const f=gladiatorBattle(t,party),{room,player,enemy}=f;
  player.hp=hp;player.rage=3;room.p8GrantShield(player,20,3,'test');
  const before=resolveStats(player).PAtk_gear;
  room.arenaPending={playerId:player.id,enemyId:enemy.instanceId,round:1};const queue=[];room.p8RoundStart(queue);
  assert.equal(player.hp,hp);assert.equal(room.arena.bloodsong,85-hp);assert.equal(player.maxHp,85);assert.equal(enemy.hp,10000);assert.equal(enemy.maxHp,10000);
  assert.equal(room.arena.entryHp,hp);assert.equal(room.arena.recoveredHp,85-hp);assert.equal(player.rage,3);
  assert.equal(resolveStats(player).PAtk_gear,before,'special entry recovery cannot create inspiration');
  room.applyDamageToPlayer(player,30,{kind:'friendly',trueDamage:true});enemy.hp=9500;room.p8ExitArena(queue);
  assert.equal(player.hp,55);assert.equal(player.maxHp,85);assert.equal(enemy.hp,9500);assert.equal(enemy.maxHp,10000);assert.equal(player.rage,0);
  const ally=room.players.ally1;if(ally)assert.equal(room.p8Has(ally,'triumph').value,70);
});
for(const [entryHp,attack,cost,damage,hp]of [[85,0,0,27,85],[35,0,50,102,35],[1,0,84,153,1],[35,31,19,56,35],[35,50,0,27,35],[35,70,0,27,15]])
 test(`Gladiator judgment consumes remaining bloodsong without spending HP: entry=${entryHp}, attack=${attack}`,t=>{
  const f=gladiatorBattle(t);f.player.hp=entryHp;f.room.arenaPending={playerId:f.player.id,enemyId:f.enemy.instanceId,round:1};f.room.p8RoundStart([]);
  f.room.applyDamageToPlayer(f.player,attack,{kind:'enemy_direct',trueDamage:true});
  const {results}=gladiatorCast(f,'g_arena');assert.equal(f.player.hp,hp);assert.equal(f.room.arena.bloodsong,0);
  assert.equal(results.filter(r=>r.targetEnemyId).reduce((n,r)=>n+(r.finalDamage||0),0),damage);
  assert.equal(results.find(r=>r.bloodsongConsumed)?.bloodsongConsumed||0,cost);
  assert.ok(!results.some(r=>r.kind==='damage'&&r.targetId===f.player.id));
  gladiatorCast(f,'g_arena');assert.equal(f.player.hp,hp);assert.equal(f.room.p8Results.find(r=>r.targetEnemyId).finalDamage,27);
});
for(const [rage,expected]of [[0,34],[1,47],[3,74],[5,100],[10,166]])test(`Gladiator assault formula and one active hit gain: R=${rage}`,t=>{
  const f=gladiatorBattle(t);f.room.arena={playerId:f.player.id,enemyId:f.enemy.instanceId,until:1};f.player.rage=rage;f.player.hp=1;
  const {results}=gladiatorCast(f,'g_sacrifice');assert.equal(results.find(r=>r.targetEnemyId).finalDamage,expected);
  assert.equal(f.player.hp,1);assert.equal(f.player.rage,rage+1);
});
test('Gladiator direct hit and challenge rewards are distinct, once per round, no self/DOT/environment gains',t=>{
  const f=gladiatorBattle(t),{room,player,enemy}=f;gladiatorCast(f,'g_sacrifice');assert.equal(player.rage,1);
  for(const kind of ['friendly','dot','environment','sage_confusion'])room.applyDamageToPlayer(player,1,{kind,trueDamage:true});
  assert.equal(player.rage,1);
  for(let i=0;i<4;i++)room.applyDamageToPlayer(player,1,{kind:'enemy_direct',trueDamage:true,sourceEnemyId:enemy.instanceId});
  assert.equal(player.rage,3);assert.equal(player.gladiatorChallengeGain,true);
  room.battleRound=2;room.p8RoundStart([]);room.applyDamageToPlayer(player,1,{kind:'enemy_direct',trueDamage:true});assert.equal(player.rage,4);
});
for(const duplicates of [1,2])test('Gladiator xiphos five distinct gains; duplicate passive does not stack: '+duplicates,t=>{
  const f=gladiatorBattle(t),{room,player,enemy}=f;player.equips=Array.from({length:duplicates},()=>({id:'g_xiphos'}));
  gladiatorCast(f,'g_sacrifice');assert.equal(player.rage,2);
  for(let i=0;i<5;i++)room.applyDamageToPlayer(player,1,{kind:'enemy_direct',trueDamage:true,sourceEnemyId:enemy.instanceId});
  assert.equal(player.rage,5);assert.equal(player.bloodStacks||0,0);
  player.rage=0;gladiatorCast(f,'basic');assert.equal(player.rage,1,'basic has no sword-specific gain');
});
test('Gladiator challenge uses weighted targeting, expires, and does not reward another enemy or a dead target',t=>{
  const f=gladiatorBattle(t,2),{room,player,enemy}=f;player.equips=[{id:'g_xiphos'}];gladiatorCast(f,'g_sacrifice');
  t.mock.method(Math,'random',()=>.55);assert.equal(room.pickTargetWithTaunt([player,room.players.ally1],enemy),player);
  assert.equal(room.pickTargetWithTaunt([player,room.players.ally1],{instanceId:'other'}),room.players.ally1);
  room.applyDamageToPlayer(player,1,{kind:'enemy_direct',trueDamage:true,sourceEnemyId:'other'});assert.equal(player.rage,3);
  enemy.hp=0;room.applyDamageToPlayer(player,1,{kind:'enemy_direct',trueDamage:true,sourceEnemyId:enemy.instanceId});assert.equal(player.rage,3);
  assert.ok(!room.getHpSnapshot().players.find(p=>p.id===player.id).statuses.some(s=>s.id==='gladiator_challenge'));
  room.battleRound=2;assert.equal(room.pickTargetWithTaunt([player,room.players.ally1],enemy),room.players.ally1);
});
for(const [kind,value,equipped,expected]of [['shield',20,false,10],['shield',20,true,15],['shield',40,true,30],['heal',20,false,5],['heal',20,true,7],['heal',40,true,15],['heal',7,true,1]])
 test(`Gladiator inspiration conversion: ${kind} ${value}, cuirass=${equipped}`,t=>{
  const {room,player}=gladiatorBattle(t);player.equips=equipped?[{id:'g_cuirass'},{id:'g_cuirass'}]:[];
  if(kind==='heal')room.applyHealWithOverheal(player,value);else room.p8GrantShield(player,value,3,'shield','caster');
  assert.equal(player.hp,85);assert.equal(player.tempHp||0,0);assert.equal(resolveStats(player).PAtk_gear,expected);
  assert.equal(player.gladiatorInspiration.length,1);assert.equal(player.gladiatorInspiration[0].until,kind==='heal'?2:3);
});
test('Gladiator inspiration shared cap, independent expiry, sage max refresh and equipment snapshot',t=>{
  const {room,player}=gladiatorBattle(t);player.equips=[{id:'g_cuirass'}];
  room.p8GrantShield(player,40,1,'warrior','a');room.applyHealCapped(player,40,{sourceId:'b'});assert.equal(resolveStats(player).PAtk_gear,40);
  room.battleRound=2;room.p8RoundStart([]);assert.equal(resolveStats(player).PAtk_gear,15);
  player.equips=[];room.applyHealCapped(player,20);assert.equal(resolveStats(player).PAtk_gear,20);
  room.p8GrantShield(player,20,3,'sage','s1');room.p8GrantShield(player,10,3,'sage','s2');
  assert.equal(player.gladiatorInspiration.filter(s=>s.kind==='sage').length,1);assert.equal(resolveStats(player).PAtk_gear,30);
  room.battleRound=3;room.p8RoundStart([]);assert.equal(resolveStats(player).PAtk_gear,15);
  room.battleRound=5;room.p8RoundStart([]);assert.equal(resolveStats(player).PAtk_gear,0);
});
for(const cost of [0,20,40,60,80])test('Gladiator cingulum 200% HP coefficient and same life cost: '+cost,t=>{
  const f=gladiatorBattle(t),{room,player,enemy}=f;
  const normal=room.skillValue(player,'g_judgment',{hpCost:cost});assert.equal(normal,27+1.5*cost);
  player.equips=[{id:'g_cingulum',bonusAtk:4}];assert.equal(room.skillValue(player,'g_judgment',{hpCost:cost}),31+2*cost);
  assert.equal(room.skillValue(player,'g_strike',{stacks:0}),42,'belt changes P only, not assault coefficients');
  room.arena={playerId:player.id,enemyId:enemy.instanceId,until:1,recoveredHp:cost,bloodsong:cost};gladiatorCast(f,'g_arena');
  assert.equal(player.hp,85);assert.equal(room.arena.bloodsong,0);assert.equal(room.p8Results.find(r=>r.targetEnemyId).finalDamage,31+2*cost);
});
test('Gladiator all equipment passives integrate once and later grants respect unequip',t=>{
  const f=gladiatorBattle(t),{room,player,enemy}=f;player.equips=LOOT_TABLE.filter(e=>['g_xiphos','g_cuirass','g_cingulum'].includes(e.id));
  room.p8GrantShield(player,20,3,'warrior');room.applyHealCapped(player,20);assert.equal(resolveStats(player).PAtk_gear,26);
  gladiatorCast(f,'g_sacrifice');assert.equal(player.rage,2);
  room.applyDamageToPlayer(player,1,{kind:'enemy_direct',trueDamage:true,sourceEnemyId:enemy.instanceId});assert.equal(player.rage,5);
  const previous=resolveStats(player).PAtk_gear;player.equips=[];room.applyHealCapped(player,20);assert.equal(resolveStats(player).PAtk_gear,previous-4+5);
});
test('Gladiator real arena judgment leaves a surviving enemy able to retaliate',t=>{
  const f=gladiatorBattle(t,4),{room,player,enemy,events}=f;player.hp=35;room.arenaPending={playerId:player.id,enemyId:enemy.instanceId,round:1};room.p8RoundStart([]);
  enemy.attack=30;player.action='g_arena';room.resolveTurnActions();const queue=resolutionQueue(events);
  const cast=queue.find(s=>s.actionId==='g_arena'&&s.outcome.type==='blood_judgment');assert.ok(cast);
  assert.equal(cast.hpSnapshot.players.find(p=>p.id===player.id).hp,35);
  assert.ok(queue.some(s=>s.type==='boss_action'&&s.results.some(r=>r.targetId===player.id&&r.finalDamage>0)));
  assert.ok(player.hp<35);assert.equal(player.maxHp,85);assert.equal(enemy.maxHp,10000);assert.equal(room.arena,null);
});
test('Gladiator declaration CD and contextual skills use the existing two-turn cooldown owner',t=>{
  const f=gladiatorBattle(t),{room,player}=f;player.action='g_arena';room.resolveTurnActions();assert.equal(player.cooldowns.g_arena,2);
  room.battleRound++;room.p8RoundStart([]);assert.equal(player.hp+room.arena.bloodsong,85);assert.equal(getPlayerSkills(player)[1].label,'血殺重擊');
  player.action='basic';room.resolveTurnActions();assert.equal(player.cooldowns.g_arena,1);
  room.battleRound++;room.p8RoundStart([]);player.action='basic';room.resolveTurnActions();assert.equal(player.cooldowns.g_arena,0);
  assert.equal(CLASSES.gladiator.skills.find(s=>s.id==='g_arena').cd,2);assert.equal(getPlayerSkills(player)[1].label,'血戰邀約');
});
test('Gladiator general debuff entry points are blocked but unavoidable mechanics remain',t=>{
  const {room,player}=gladiatorBattle(t);for(const id of ['poison','burn','fracture','chill'])room.applyDotToAlly(player,id);
  room.applyCorrosionToAlly(player);assert.equal(player.corrosionTurns||0,0);assert.equal(player.poisonTurns||0,0);
  assert.equal(room.p8Effect(player,'test','混亂',2,{icon:'debuff'}),false);
  assert.equal(room.p8Effect(player,'boss_rule','關卡規則',2,{icon:'debuff',unavoidable:true}),true);
  player.enemyEffects={attack_down:{value:99,until:10},mark_enemy:{value:1,until:10},boss_rule:{value:2,until:10,unavoidable:true}};
  assert.equal(enemyEffect(room,player,'attack_down'),null);assert.equal(resolveStats(player).ATK_base,12);
  player.stunnedNextTurn=true;player.poisonTurns=2;room.cleanGladiatorDebuffs(player);assert.equal(player.stunnedNextTurn,false);assert.equal(player.poisonTurns,0);
  assert.ok(player.enemyEffects.mark_enemy);assert.ok(player.enemyEffects.boss_rule);
  assert.equal(room.applyDamageToPlayer(player,10,{kind:'dot',trueDamage:true}).actualDmg,0);
  assert.equal(room.applyDamageToPlayer(player,10,{kind:'dot',trueDamage:true,unavoidable:true}).actualDmg,10);
});
for(const id of ['hellfire_imp','corrosive_slime','frostbone_skeleton','whispering_apparition'])test('Gladiator enemy status owner respects immunity: '+id,t=>{
  const template=allEnemyTemplates.find(e=>mechanicId(e)===id);assert.ok(template);
  const {room,player,enemy}=mechanismBattle(t,[template],'gladiator');t.mock.method(Math,'random',()=>.5);
  mechanismRound(room,1);actMechanism(room,enemy);assert.deepEqual(Object.keys(player.enemyEffects||{}),[]);
});
test('Gladiator retains resource icon and triumph art but no triumph music trigger',()=>{
  const h=enemyPresentationHarness();
  h.scope.document.addEventListener=()=>{};
  vm.runInContext(readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8'),h.scope);
  const old=h.scope.getBuffIconUrl({id:'rage',label:'怒氣',icon:'buff'}),current=h.scope.getBuffIconUrl({id:'rage',label:'鬥志',icon:'buff'});
  assert.ok(old);assert.equal(current,old);
  for(const file of ['extended-role-effects.js','gladiator-presentation.js']){
    const source=readFileSync(new URL('../public/js/presentation/'+file,import.meta.url),'utf8');
    assert.ok(!/\.play\('gladiator_triumph'/.test(source));assert.match(source,/triumphSnapshot/);
  }
  const sfx=readFileSync(new URL('../public/js/audio/sfx-assets.js',import.meta.url),'utf8');assert.match(sfx,/gladiator_triumph/,'shared audio asset remains registered');
});

test('Gladiator equipment identities, icons, fixed stats and acquisition slots remain unchanged',t=>{
  const {room,player}=fixture(t,'gladiator');
  for(const id of ['g_xiphos','g_cuirass','g_cingulum']){
    const gear=LOOT_TABLE.find(e=>e.id===id);assert.ok(gear);
    assert.equal(gear.slot,'CLASS_EXCLUSIVE');assert.equal(gear.tier,'CLASS_EXCLUSIVE');
    assert.equal(gear.icon,`/assets/equipment/exclusive/${gear.name}.webp`);
  }
  player.bag=[structuredClone(LOOT_TABLE.find(e=>e.id==='g_cuirass'))];
  assert.equal(room.equipItemFromBag(player.id,0).success,true);assert.equal(player.maxHp,120);
  assert.equal(room.unequipItemToBag(player.id,'CLASS_EXCLUSIVE').success,true);assert.equal(player.maxHp,85);
});
for(const [attack,expected]of [[10,25],[30,5],[60,0],[100,0]])test('Gladiator four-player judgment remains risky: enemy attack '+attack,t=>{
  const f=gladiatorBattle(t,4),{room,player,enemy}=f;player.hp=35;
  room.arenaPending={playerId:player.id,enemyId:enemy.instanceId,round:1};room.p8RoundStart([]);
  gladiatorCast(f,'g_arena');assert.equal(player.hp,35);
  room.applyDamageToPlayer(player,attack,{kind:'enemy_direct',trueDamage:true});assert.equal(player.hp,expected);
  const queue=[];room.p8ExitArena(queue);assert.equal(player.hp,expected);assert.equal(queue[0].arenaPresentation.triumphApplied,expected>0);
});
test('Gladiator inspiration grows both arena attacks, excludes magic and direct entry heals',t=>{
  const {room,player}=gladiatorBattle(t);room.p8GrantShield(player,20,2,'warrior');
  assert.equal(room.resolveSkillAttack(player,'phys'),22);assert.equal(room.resolveSkillAttack(player,'mag'),12);
  assert.equal(room.skillValue(player,'g_strike',{stacks:3}),112);assert.equal(room.skillValue(player,'g_judgment',{hpCost:50}),112);
});
test('Gladiator immunity does not extend to the unrelated Abyss Gladiator boss',t=>{
  const {room,enemy}=mechanismBattle(t,[ABYSS_BOSSES.gladiator]);
  assert.equal(room.p8Effect(enemy,'test','易傷',1,{icon:'debuff'},true),true);
  enemy.enemyEffects={attack_down:{value:1,until:10}};assert.ok(enemyEffect(room,enemy,'attack_down'));
});
test('Gladiator ordinary healing consumable cannot bypass inspiration at full or missing HP',t=>{
  const {room,player}=fixture(t,'gladiator');room.state='CHOOSING_ROUTE';room.battleRound=1;
  for(const hp of [85,35]){
    player.hp=hp;player.gladiatorInspiration=[];
    room.squadInventory=[{id:'consumable_healing_potion',type:'CONSUMABLE',effectType:'HEALING_POTION'}];
    assert.equal(room.useConsumableItem(player.id,{index:0}).success,true);
    assert.equal(player.hp,hp);assert.equal(resolveStats(player).PAtk_gear,8);
    assert.equal(room.squadInventory.length,0);
  }
});

 test('Talisman status icons share the five configured presentation colors',()=>{
  const scope={};vm.createContext(scope);
  const app=readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8');
  vm.runInContext('function renderStatusIconMarkup'+app.split('function renderStatusIconMarkup')[1].split('// 判斷是否為職業特殊機制')[0],scope);
  const presentation=readFileSync(new URL('../public/js/presentation/onmyoji-presentation.js',import.meta.url),'utf8');
  vm.runInContext(presentation.slice(0,presentation.indexOf('function onmyojiAsset'))+';globalThis.colors=ONMYOJI_TALISMAN_CONFIGS;',scope);
  for(const [type,color] of Object.entries({blind:'#ef4444',seal:'#ef4444',corrode:'#facc15',confuse:'#c084fc',drain:'#ffffff'})){
    assert.equal(scope.colors[type].color,color);
    for(const variant of ['enemy','tooltip','hud'])assert.ok(scope.renderStatusIconMarkup({id:'talisman_'+type},{variant}).includes('color:'+color));
  }
});

for(const [attack,hp,stacks]of [[20,35,30],[50,35,0],[65,20,0],[85,0,0],[100,0,0]])test('Bloodsong is spent before real HP: '+attack,t=>{
  const {room,player,enemy}=gladiatorBattle(t);player.hp=35;
  room.arenaPending={playerId:player.id,enemyId:enemy.instanceId,round:1};room.p8RoundStart([]);
  assert.equal(player.hp,35);assert.equal(player.tempHp||0,0);
  const status=room.getHpSnapshot().players.find(p=>p.id===player.id).statuses.find(s=>s.id==='gladiator_bloodsong');
  assert.equal(status.stacks,50);assert.equal(status.label,'嗜血戰歌');
  const hit=room.applyDamageToPlayer(player,attack,{kind:'enemy_direct',trueDamage:true});
  assert.equal(player.hp,hp);assert.equal(room.arena.bloodsong,stacks);
  assert.equal(hit.bloodsongAbsorbed,Math.min(attack,50));assert.equal(hit.hpDmg,35-hp);assert.equal(hit.tempAbsorbed,0);
  const queue=[];room.p8ExitArena(queue);assert.equal(player.hp,hp+stacks);assert.equal(room.arena,null);
  assert.ok(!room.getHpSnapshot().players.find(p=>p.id===player.id).statuses.some(s=>s.id==='gladiator_bloodsong'));
  const after=player.hp;room.p8ExitArena(queue);assert.equal(player.hp,after);
});

test('Bloodsong multi-hit snapshots and feedback distinguish buff loss from HP damage',t=>{
  const {room,player,enemy}=gladiatorBattle(t);player.hp=35;
  room.arenaPending={playerId:player.id,enemyId:enemy.instanceId,round:1};room.p8RoundStart([]);
  const before=room.getHpSnapshot(),hits=[];room.p8ResolveBossHits(player,[20,40],n=>n,hits);
  const queue=[{type:'boss_action',sourceId:enemy.instanceId,actionId:'basic',hpSnapshotBefore:before,hpSnapshot:room.getHpSnapshot(),results:hits}];
  normalizeCombatQueue(queue,'bloodsong');const results=queue[0].results;
  assert.deepEqual(results.map(r=>r.actualDamage),[20,40]);assert.deepEqual(results.map(r=>r.actualHpDamage),[0,10]);
  assert.deepEqual(results.map(r=>r.actualBloodsongAbsorbed),[20,30]);
  const {scope}=enemyPresentationHarness();
  assert.deepEqual(Array.from(scope.battleFeedbackEntries(results[0]),e=>e.text),['嗜血戰歌 -20']);
  assert.deepEqual(Array.from(scope.battleFeedbackEntries(results[1]),e=>e.text),['-10','嗜血戰歌 -30']);
  assert.equal(player.hp,25);assert.equal(room.arena.bloodsong,0);
  assert.equal(player.rage,1,'hits absorbed by bloodsong still grant the existing first-hit rage once');
});

test('Bloodsong is not a normal heal or shield and does not resurrect on forced exit',t=>{
  const {room,player,enemy}=gladiatorBattle(t);player.hp=1;
  room.arenaPending={playerId:player.id,enemyId:enemy.instanceId,round:1};room.p8RoundStart([]);
  assert.equal(resolveStats(player).PAtk_gear,0);assert.equal(room.arena.bloodsong,84);
  const pool=room.arena.bloodsong;room.applyDamageToPlayer(player,8,{kind:'dot'});assert.equal(room.arena.bloodsong,pool);
  player.hp=0;room.p8ExitArena([],'gladiator_dead');assert.equal(player.hp,0);
  assert.equal(resolveStats(player).PAtk_gear,0);assert.equal(room.getHpSnapshot().players.find(p=>p.id===player.id).gladiatorBloodsong,0);
});

test('Bloodsong participates in lethal barrier checks without consuming protection prematurely',t=>{
  const {room,player,enemy}=gladiatorBattle(t);player.hp=35;
  room.arenaPending={playerId:player.id,enemyId:enemy.instanceId,round:1};room.p8RoundStart([]);
  room.p8Effect(player,'boundary','邊界',10,{barrier:true});
  room.applyDamageToPlayer(player,40,{kind:'enemy_direct',trueDamage:true});
  assert.equal(room.p8Has(player,'boundary').barrier,true);assert.equal(room.arena.bloodsong,10);assert.equal(player.hp,35);
  room.applyDamageToPlayer(player,45,{kind:'enemy_direct',trueDamage:true});
  assert.equal(room.p8Has(player,'boundary').barrier,false);assert.equal(room.arena.bloodsong,10);assert.equal(player.hp,35);
});
