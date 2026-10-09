import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../game/Room.js';
import {CLASSES,LOOT_TABLE,getPlayerSkills,equipItemToPlayer,unequipItemFromPlayer,canPlayerEquipItem,getActionPriority} from '../game/constants.js';
import {eta,isPrime,P8_ROLES,sageDecay,sageConfusionChance,sageEquationPreview} from '../game/phase8.js';

test('sage display metadata matches authoritative hypothesis and solve snapshots',t=>{
 for(const phase of ['hypothesis','solve'])for(const action of ['basic','sge_deduce','sge_induce']){
  const {room,resolve}=fixture(t,['sage']);const p=room.players.p0;
  Object.assign(p,{sagePhase:phase,sageOperand:17,sageX:24,action});room.currentMonster.resistance='phys';
  const q=resolve(.1),s=q.find(s=>s.actionId===action),d=s.sagePresentation;
  assert.equal(d.operandBefore,s.hpSnapshotBefore.players[0].sageOperand);
  assert.equal(d.operandAfter,s.hpSnapshot.players[0].sageOperand);
  assert.equal(d.actualDamage,s.finalDamage);assert.equal(d.sagePhase,phase);
  if(phase==='solve'){
   const e=q[q.indexOf(s)+1];assert.equal(e.actionId,'sge_equation');
   assert.equal(e.outcome.xBefore,d.xAfter);assert.equal(e.outcome.xAfter,e.hpSnapshot.players[0].sageX);
  }
 }
 assert.equal(CLASSES.sage.skills[1].label,'向量定軌・貫穿演算');
 assert.equal(CLASSES.sage.skills[2].label,'動量回授・慣性取樣');
});
test('sage capture metadata excludes secondary sources and preserves each direct hit delta',t=>{
 const {room}=fixture(t,['sage']);const p=room.players.p0;
 Object.assign(p,{sageInduction:true,sageSamplingEnded:false,sageOperand:17});
 for(const kind of ['dot','trap','environment','friendly','secondary','self']){
  const result=room.applyDamageToPlayer(p,1,{kind});assert.equal(result.sageMomentumCapture,undefined);assert.equal(p.sageOperand,17);
 }
 const zero=room.applyDamageToPlayer(p,0,{kind:'enemy_direct'});assert.equal(zero.sageMomentumCapture,undefined);
 const hits=[];room.p8ResolveBossHits(p,[3,5],n=>n,hits);
 assert.deepEqual(hits.map(h=>h.sageMomentumCapture),[
  {operandBefore:17,operandAfter:20,delta:3},{operandBefore:20,operandAfter:25,delta:5}]);
 assert.equal(room.getHpSnapshot().players[0].sageSampling,true);
 room.p8EndRound([],[],n=>n);assert.equal(room.getHpSnapshot().players[0].sageSampling,false);
});
test('sage aggregate boss damage emits its operand capture only once across visual segments',t=>{
 const {room,resolve}=fixture(t,['sage']);room.battleRound=3;const p=room.players.p0;
 Object.assign(p,{action:'sge_induce',sageOperand:17});
 const q=resolve(.1),boss=q.find(s=>s.type==='boss_action'),hits=boss.results.filter(r=>r.targetId===p.id);
 const captures=hits.filter(r=>r.sageMomentumCapture);
 assert(hits.length>1);assert.equal(captures.length,1);
 assert.equal(captures[0].sageMomentumCapture.operandAfter,p.sageOperand);
 assert.equal(captures[0].sageMomentumCapture.delta,p.sageOperand-17);
 assert.equal(hits.at(-1).sageMomentumCapture,captures[0].sageMomentumCapture);
});
test('Phase 8.1 canonical skill names and complete outcomes remain in copy',()=>{
 assert.equal(CLASSES.dreamweaver.skills[0].label,'恍惚編織');assert.equal(CLASSES.dreamweaver.skills[1].label,'清醒夢・薛丁格之蝶');assert.equal(CLASSES.dreamweaver.skills[2].label,'偽造殘夢');
 for(const name of ['潛意識混淆','鏡像夢境','解離痛楚','萎靡夢魘','狂亂夢遊'])assert(CLASSES.dreamweaver.skills[0].desc.includes(name));
 assert(CLASSES.samurai.passive.includes('狂刀'));assert(CLASSES.samurai.passive.includes('武魂'));assert.equal(CLASSES.samurai.skills[2].label,'秘劍 • 燕返');
});
test('lethal dreamweaver attack cannot revive the boss through nightmare weakening',t=>{
 const {room,resolve}=fixture(t,['dreamweaver']);room.currentMonster.hp=1;room.players.p0.action='basic';
 let n=0;const q=resolve(()=>n++===0?.1:.51);assert.equal(room.currentMonster.hp,0);assert(!q.some(s=>s.actionId==='basic_result'));assert.equal(q.at(-1).type,'kill');
});
test('assassin starts with one stack and only decays at rounds 3,6,9',t=>{
 const {room}=fixture(t,['assassin']);const p=room.players.p0;assert.equal(p.stealthStacks,1);
 p.stealthStacks=3;
 for(const [round,expected] of [[1,3],[2,3],[3,2],[4,2],[5,2],[6,1]]){room.battleRound=round;random(.9,()=>room.executeRoundStart());assert.equal(p.stealthStacks,expected);}
});
test('dream buffs have a separate next presentation without premature snapshot reveal',t=>{
 for(const action of ['basic','dw_butterfly','dw_false_dream']){
  const {room,resolve}=fixture(t,['dreamweaver']);room.players.p0.action=action;room.players.p0.targetPlayerId='p0';
  const q=resolve(.1),cast=q.find(s=>s.actionId===action),result=q[q.indexOf(cast)+1];
  assert.equal(result.actionId,action+'_result');assert(result.results.every(r=>r.kind==='status'));assert.equal(cast.outcome.type,'normal');
  assert(!cast.hpSnapshot.monster.statuses?.some(s=>s.id==='mirror'));assert.deepEqual(result.hpSnapshotBefore,cast.hpSnapshot);
 }
});
test('sage equation is the immediate next event after solving attack, before ally and boss',t=>{
 const {room,resolve}=fixture(t,['sage','warrior']);const p=room.players.p0;Object.assign(p,{sagePhase:'solve',sageOperand:12,sageX:80,action:'sge_deduce'});room.players.p1.action='basic';
 const q=resolve(.9),index=q.findIndex(s=>s.sourceId===p.id&&s.actionId==='sge_deduce');assert.equal(q[index+1].actionId,'sge_equation');assert(q.findIndex(s=>s.type==='boss_action')>index+1);
});
test('sage solve blocks the previous hypothesis skill and prime reset survives common CD charge',t=>{
 const {room,resolve}=fixture(t,['sage']);const p=room.players.p0;Object.assign(p,{sagePhase:'solve',sagePreviousAction:'basic',sageOperand:2,sageX:80});
 assert.equal(room.lockAction(p.id,'basic').success,false);assert(getPlayerSkills(p)[0].phaseBlocked);
 p.action='sge_deduce';resolve(.9);assert.equal(p.cooldowns.sge_deduce,0);
});
test('enhanced boundary grants extra barrier only if target already full, never auto-heals',t=>{
 for(const full of [false,true]){
  const {room,resolve}=fixture(t,['stargazer']);const p=room.players.p0;for(const id of ['sg_eyepiece','sg_tube','sg_mount'])equip(p,id);
  if(!full)p.hp=10;p.action='sg_observe';const before=p.hp;const q=resolve(.99),step=q.find(s=>s.actionId==='sg_observe');
  assert.equal(step.hpSnapshot.players[0].hp,before);assert.equal(p.p8Effects.boundary.barrier,full);
 }
});
test('restart clears Phase 8 equipment contributions and same-floor revival ban',t=>{
  const {room}=fixture(t,['sage']);const p=room.players.p0;
  Object.assign(p,{p8TeamHp:20,p8DisabledHp:20,p8CorrodedHp:10,noReviveFloor:8,sageX:100});
  room.arena={playerId:p.id};room.restartToLobby(p.id);
  assert.equal(p.p8TeamHp,0);assert.equal(p.sageX,30);assert.equal(p.noReviveFloor,undefined);assert.equal(room.arena,null);
  room.p8RefreshEquipment();assert.equal(p.maxHp,70);
});
test('round-end lethal counter queues death before waiting for victory ACK',t=>{
  const {room,resolve}=fixture(t);room.currentMonster.hp=5;
  room.p8Effect(room.players.p0,'warrior_resolve','Resolve',3);
  const q=resolve();assert(q.some(s=>s.actionId==='w_counter'));assert.equal(q.at(-1).type,'kill');assert.equal(room.state,'IN_BATTLE');
});
export function fixture(t,roles=['warrior']) {
  let wire;const socket=id=>({id,join(){}});
  const room=new Room('P8',socket('p0'),'Hero',{to:()=>({emit(event,data){if(event==='battle:presentation_queue')wire=data;}})});
  roles.slice(1).forEach((_,i)=>room.addPlayer(socket('p'+(i+1)),'Ally '+i));
  roles.forEach((role,i)=>{room.selectRole('p'+i,role);room.players['p'+i].action='skip';});
  room.state='IN_BATTLE';room.selectionState='SELECTING';room.floor=8;room.battleRound=1;
  room.currentMonster={name:'Boss',avatar:'/BOSS/Ancient Guardian Golem.webp',hp:5000,maxHp:5000,attack:20,baseHp:100,resistance:null};
  t?.after(()=>room.clearTimer());
  return {room,resolve(r=.9){return random(r,()=>{room.resolveTurnActions();return wire.queue;});}};
}

test('Gladiator sacrifice publishes payment before Rage and equipment statuses',t=>{
  const {room,resolve}=fixture(t,['gladiator']);const p=room.players.p0;
  equip(p,'g_xiphos');equip(p,'g_cuirass');p.hp=45;p.action='g_sacrifice';room.currentMonster.attack=0;
  const s=actionStep(resolve()),paid=s.results.find(r=>r.presentationBeat==='self_damage');
  assert.equal(paid.finalDamage,24);assert.equal(paid.targetAfter.hp,21);assert.equal(paid.targetAfter.rage,0);assert.equal(paid.targetAfter.bloodStacks,0);
  assert.equal(s.hpSnapshot.players[0].rage,1);assert.equal(s.gladiatorPresentation.rageGained,1);assert.equal(s.gladiatorPresentation.bloodGained,1);
  assert.equal(s.gladiatorPresentation.bloodHealApplied,true);assert.equal(s.results.at(-1).presentationBeat,'rage_gain');
  assert.equal(paid.hpSnapshot.players[0].rage,0);
});
test('Cuirass triggers below 30 HP, including high max HP; 30 HP does not trigger',t=>{
  for(const [hp,triggered] of [[54,false],[53,true]]){
    const {room,resolve}=fixture(t,['gladiator']);const p=room.players.p0;equip(p,'g_cuirass');p.hp=hp;p.action='g_sacrifice';room.currentMonster.attack=0;
    assert.equal(actionStep(resolve()).gladiatorPresentation.bloodHealApplied,triggered);
  }
});
test('Arena enter queue exposes both combatants HP scale and occurs only next round',t=>{
  const {room,resolve}=fixture(t,['gladiator','warrior']);room.players.p0.action='g_arena';const declared=resolve();
  assert(!declared.some(s=>s.type==='arena_enter'));let queue;room.publishCombatQueue=q=>queue=q;
  room.battleRound=2;room.executeRoundStart();const enter=queue[0];assert.equal(enter.type,'arena_enter');
  assert.deepEqual(enter.arenaPresentation.combatants.map(c=>c.maxHpAfterScale),[153,9000]);
  assert.equal(enter.hpSnapshotBefore.arena,null);assert.equal(enter.hpSnapshot.arena.playerId,'p0');
  assert.equal(queue[1].hpSnapshotBefore.monster.maxHp,9000);assert.equal(queue[1].hpSnapshotBefore.players[1].arenaBlocked,true);
});
for(const rage of [0,1,4,8])test('Arena exit consumes Rage '+rage+' once and authoritatively applies two-turn Triumph',t=>{
  const {room}=fixture(t,['gladiator','warrior']),p=room.players.p0;p.rage=rage;p.bloodStacks=2;p.maxHp=153;p.hp=90;
  room.currentMonster.maxHp=9000;room.currentMonster.hp=4500;room.arena={playerId:p.id,originalMaxHp:85,originalMonsterMaxHp:5000,until:1};
  const q=[],exit=room.p8ExitArena(q);assert.equal(exit.arenaPresentation.consumedRage,rage);assert.equal(p.rage,0);assert.equal(p.bloodStacks,0);assert.equal(room.arena,null);
  assert.equal(exit.arenaPresentation.rageConsumedSnapshot.players[0].rage,0);assert.equal(exit.arenaPresentation.rageConsumedSnapshot.players[0].maxHp,153);
  assert.equal(exit.arenaPresentation.triumphApplied,true);assert.equal(exit.arenaPresentation.triumphBonus,Math.round(200*rage/(rage+5.6)));
  assert.equal(exit.arenaPresentation.triumphDuration,2);assert.equal(room.currentMonster.hp,2500);assert.equal(room.currentMonster.maxHp,5000);
  assert.equal(p.maxHp,85);assert.equal(p.hp,50);room.p8ExitArena(q);assert.equal(q.length,1);
  assert.equal(room.p8Has(p,'triumph'),null);
  const ally=room.players.p1;assert.equal(ally.p8Effects.triumph.value,exit.arenaPresentation.triumphBonus);assert.equal(ally.p8Effects.triumph.until,3);
  room.battleRound=2;assert(room.p8Has(ally,'triumph'));room.battleRound=3;assert(room.p8Has(ally,'triumph'));room.battleRound=4;assert.equal(room.p8Has(ally,'triumph'),null);
});
test('Triumph boosts authoritative damage and expires after two playable rounds',t=>{
  const {room,resolve}=fixture(t,['warrior']);const p=room.players.p0;p.action='basic';room.p8Effect(p,'triumph','凱旋',2,{value:83.333333333333,until:3,duration:2});
  room.battleRound=2;assert.equal(actionStep(resolve()).finalDamage,18);
  room.battleRound=4;p.warriorStacks=0;assert.equal(actionStep(resolve()).finalDamage,10);
});
test('Suicide immediately queues forced Arena exit, preserves revive lock and never grants Triumph',t=>{
  const {room,resolve}=fixture(t,['gladiator','bard']);const p=room.players.p0;
  p.maxHp=153;p.hp=117;p.rage=3;p.action='g_arena';room.currentMonster.hp=9000;room.currentMonster.maxHp=9000;
  room.arena={playerId:p.id,originalMaxHp:85,originalMonsterMaxHp:5000,until:1};
  const q=resolve(),action=actionStep(q),exit=q[q.indexOf(action)+1];
  assert.equal(action.results[0].presentationBeat,'self_zero');assert.equal(action.results[0].targetAfter.hp,0);assert.equal(action.results[1].finalDamage,147);
  assert.equal(exit.type,'arena_exit');assert.equal(exit.arenaPresentation.reason,'gladiator_dead');assert.equal(exit.arenaPresentation.consumedRage,3);
  assert.equal(exit.arenaPresentation.triumphApplied,false);assert.equal(p.rage,0);assert.equal(p.hp,0);assert.equal(p.noReviveFloor,8);
  assert(!room.players.p1.p8Effects.triumph);assert.equal(room.players.p1.hp,70);assert.equal(room.arena,null);
});
test('Boss lethal damage forces Arena exit after its result, consumes gained Rage and grants no Triumph',t=>{
  const {room,resolve}=fixture(t,['gladiator','warrior']);const p=room.players.p0;p.hp=5;p.rage=4;p.action='basic';
  room.arena={playerId:p.id,originalMaxHp:85,until:1};const q=resolve(),boss=q.find(s=>s.type==='boss_action'),exit=q[q.indexOf(boss)+1];
  assert.equal(exit.type,'arena_exit');assert.equal(exit.arenaPresentation.consumedRage,5);assert.equal(exit.arenaPresentation.triumphApplied,false);assert.equal(p.rage,0);
});
test('Round-start damage can force Arena end before selection',t=>{
  const {room}=fixture(t,['gladiator','warrior']);const p=room.players.p0;p.hp=1;p.rage=2;p.poisonTurns=1;p.poisonDmg=100;
  room.arena={playerId:p.id,originalMaxHp:85,until:1};let queue;room.publishCombatQueue=q=>queue=q;room.executeRoundStart();
  assert.equal(queue.at(-1).type,'arena_exit');assert.equal(queue.at(-1).arenaPresentation.triumphApplied,false);assert.equal(room.arena,null);assert.equal(p.rage,0);
});
export function random(value,fn){const old=Math.random;Math.random=typeof value==='function'?value:()=>value;try{return fn();}finally{Math.random=old;}}
function equip(p,id){return equipItemToPlayer(p,structuredClone(LOOT_TABLE.find(e=>e.id===id)));}
const actionStep=q=>q.find(s=>s.type==='player_action');
function equation(room,p,{operand=50,x=30,action='basic',r=.99,bard=1,resistance=dmg=>({dmg})}={}) {
  Object.assign(p,{sagePhase:'solve',sageCycleRound:1,sageOperand:operand,sageX:x,sageLastAction:action,sageEquationResolved:false});
  const q=[];random(r,()=>room.p8ResolveEquation(p,q,[],resistance,bard));return q[0];
}
test('all twelve roles share selectable class/skills/detail owners and real portraits',async t=>{
  const fs=await import('node:fs');assert.equal(Object.keys(CLASSES).length,12);
  for(const id of P8_ROLES){const {room}=fixture(t,[id]);const p=room.players.p0;assert.equal(p.maxHp,CLASSES[id].maxHp);assert.equal(getPlayerSkills(p).length,3);assert(fs.existsSync('public'+CLASSES[id].avatar));}
  assert.equal(getActionPriority('dw_butterfly'),4);assert.equal(getActionPriority('dw_false_dream'),7);
});
test('warrior actual HP events stack to 15; full shield and zero do not; resolve tracks shield + HP',t=>{
  const {room}=fixture(t),p=room.players.p0;
  room.p8GrantShield(p,10);room.applyDamageToPlayer(p,10);assert.equal(p.warriorStacks||0,0);
  room.applyDamageToPlayer(p,0);assert.equal(p.warriorStacks||0,0);
  for(let i=0;i<18;i++)room.applyDamageToPlayer(p,1);assert.equal(p.warriorStacks,15);
  room.p8Effect(p,'warrior_resolve','Resolve',3);room.p8GrantShield(p,5);room.applyDamageToPlayer(p,8);assert.equal(p.warriorRoundDamage,8);
  room.p8ResetBattle();assert.equal(p.warriorStacks,0);
});
test('warrior strike grants three-round 60% DR and one round-end counter; shield is 40% own max for each ally',t=>{
  let f=fixture(t,['warrior','sage']);f.room.players.p0.action='w_strike';let q=f.resolve();const p=f.room.players.p0;
  assert.equal(p.p8Effects.warrior_resolve.until,3);assert.equal(q.filter(s=>s.actionId==='w_counter').length,1);
  f=fixture(t,['warrior','sage']);f.room.players.p0.action='w_shield';q=f.resolve();const beforeBoss=q.find(s=>s.type==='boss_action').hpSnapshotBefore;
  assert.equal(beforeBoss.players[0].tempHp,48);assert.equal(beforeBoss.players[1].tempHp,48);assert.equal(f.room.warriorShieldTurn,0);
});
test('mage drain reaches 50 and cooldowns are two; heals actual resisted damage',t=>{
  const {room,resolve}=fixture(t,['mage']);const p=room.players.p0;p.action='m_drain';p.hp=10;room.currentMonster.resistance='mag';
  const s=actionStep(resolve(.999));assert.equal(s.finalDamage,15);assert.equal(s.results.find(r=>r.kind==='heal').actualHeal,3);assert.equal(p.cooldowns.m_drain,2);assert.equal(CLASSES.mage.skills[1].cd,2);
});
test('acid hits boss 40 and each living party member 20, through shield and DR, bypassing samurai parry',t=>{
  const {room,resolve}=fixture(t,['alchemist','warrior','samurai']);room.players.p0.action='alc_flask';room.p8GrantShield(room.players.p1,25);room.players.p2.kyoutou=true;
  const s=actionStep(resolve(.1));assert.equal(s.finalDamage,40);assert.equal(s.hpSnapshot.players[0].hp,55);assert.equal(s.hpSnapshot.players[1].hp,120);assert.equal(s.hpSnapshot.players[1].tempHp,5);assert.equal(s.hpSnapshot.players[2].hp,60);
});
test('treant receives 85% shield without maxHP mutation or regen and lasts two boss phases',t=>{
  const {room,resolve}=fixture(t,['druid']);room.players.p0.action='dru_transform';const q=resolve(.9);const s=actionStep(q);
  assert.equal(s.hpSnapshot.players[0].maxHp,85);assert.equal(s.hpSnapshot.players[0].tempHp,72);assert.equal(room.players.p0.druidForm,'treant');
  room.battleRound=2;room.players.p0.action='skip';resolve(.9);assert.equal(room.players.p0.maxHp,85);assert.equal(room.players.p0.druidForm,null);
});
for(const [r,id] of [[.01,'mirror'],[.26,'dissociate'],[.51,'nightmare_weak'],[.76,'frenzy_backfire']])test('dream confusion server branch '+id,t=>{
  const {room,resolve}=fixture(t,['dreamweaver']);room.players.p0.action='basic';let n=0;const q=resolve(()=>++n===1?0:r);
  assert.equal(q.find(s=>s.actionId?.endsWith('_result')).outcome.type,id);assert(room.currentMonster.p8Effects[id]);
});
test('dream butterfly converts before mitigation; nightmare true damage + loom heal; duration belongs to caster',t=>{
  const {room}=fixture(t,['dreamweaver','warrior']),p=room.players.p1,caster=room.players.p0;equip(caster,'dw_loom');equip(caster,'dw_history');
  room.p8RefreshEquipment();p.hp=40;room.p8Effect(p,'dream_butterfly','Dream',2,{ownerId:caster.id});
  let r=random(.1,()=>room.p8Incoming(p,30,()=>1));assert.equal(r.damage,0);assert.equal(p.hp,70);
  r=random(.9,()=>room.p8Incoming(p,30,()=>1));assert.equal(r.damage,30);room.applyDamageToPlayer(p,r.damage);room.p8NightmareHeal(p,r.ownerId);assert.equal(p.hp,47);
  caster.action='dw_butterfly';caster.targetPlayerId=p.id;room.resolveTurnActions();assert.equal(p.p8Effects.dream_butterfly.until,2);assert.equal(p.poisonTurns,0);
});
test('dream outcomes on another class carry the authoritative portrait cue without duplicate healing',t=>{
  for(const [roll,type] of [[.1,'dream_heal'],[.9,'nightmare']]) {
    const {room,resolve}=fixture(t,['warrior']);room.currentMonster.hp=4000;
    room.p8Effect(room.currentMonster,'dream_butterfly','夢蝶迷思',1,{ownerId:'p0'});room.players.p0.action='basic';
    const step=resolve(roll).find(s=>s.type==='player_action'&&s.sourceId==='p0');
    const results=step.results.filter(r=>r.targetId==='monster');assert.equal(results.length,1);assert.equal(results[0].outcome.type,type);
    if(type==='dream_heal'){assert.equal(results[0].kind,'heal');assert.equal(results[0].actualHeal,10);assert.equal(step.hpSnapshot.monster.hp,4010);}
    else {assert.equal(results[0].finalDamage,10);assert.equal(step.hpSnapshot.monster.hp,3990);}
  }
});
for(const [r,id] of [[.01,'shallow'],[.26,'deep'],[.51,'lone'],[.76,'horde']])test('false history calculation override without floor mutation: '+id,t=>{
  const {room,resolve}=fixture(t,['dreamweaver','warrior']);room.players.p0.action='dw_false_dream';const q=resolve(r);assert.equal(q.find(s=>s.actionId?.endsWith('_result')).outcome.type,id);assert.equal(room.floor,8);
  const effect=room.currentMonster.p8Effects.false_history;assert.equal(effect.floor,id==='shallow'?6:id==='deep'?10:8);assert.equal(effect.players,id==='lone'?1:id==='horde'?5:2);
  room.battleRound=2;room.p8Expire(room.currentMonster);assert.equal(room.currentMonster.maxHp,5000);assert.equal(room.currentMonster.attack,20);
});
test('dream unique restrictions and team maxHP stack/remove follow equipped count',t=>{
  const {room}=fixture(t,['dreamweaver','sage']),p=room.players.p0;equip(p,'dw_spindle');assert.equal(canPlayerEquipItem(p,LOOT_TABLE.find(e=>e.id==='dw_spindle')),false);
  equip(p,'dw_loom');equip(p,'dw_loom');room.p8RefreshEquipment();assert.equal(room.players.p1.maxHp,110);unequipItemFromPlayer(p,2);room.p8RefreshEquipment();assert.equal(room.players.p1.maxHp,90);
});
for(const [r,id] of [[.1,'star'],[.65,'planet'],[.75,'galaxy'],[.85,'blackhole'],[.95,'boundary']])test('astronomy normal pool server branch '+id,t=>{
  const {room,resolve}=fixture(t,['stargazer','warrior']);room.players.p0.action='sg_observe';assert.equal(actionStep(resolve(r)).outcome.type,id);
});
for(const [r,id] of [[.01,'planet'],[.26,'galaxy'],[.51,'blackhole'],[.76,'boundary']])test('equipped telescope replaces pool: '+id,t=>{
  const {room,resolve}=fixture(t,['stargazer','warrior']),p=room.players.p0;['sg_eyepiece','sg_tube','sg_mount'].forEach(id=>equip(p,id));p.action='sg_observe';const s=actionStep(resolve(r));assert.equal(s.outcome.type,id);assert.equal(s.outcome.enhanced,true);
  if(id==='blackhole'){assert.equal(s.finalDamage,10);assert(!s.results.some(r=>r.kind==='damage'&&r.targetId!=='monster'));}
  if(id==='galaxy')assert.equal(room.players.p1.p8Effects.galaxy.value,10);
  if(id==='boundary')assert.equal(p.p8Effects.boundary.barrier,true);
});
test('partial telescope and inventory never activate set; planet stun prevents boss turn',t=>{
  const {room,resolve}=fixture(t,['stargazer']);const p=room.players.p0;p.action='sg_observe';equip(p,'sg_eyepiece');p.inventory=LOOT_TABLE.filter(e=>e.id.startsWith('sg_'));let n=0;
  const q=resolve(()=>++n===1?.65:0);assert.equal(actionStep(q).outcome.enhanced,false);assert.equal(actionStep(q).outcome.stunned,true);assert.equal(q.find(s=>s.type==='boss_action').results.length,0);
});
for(const [r,id,value] of [[.1,'accelerate',2],[.75,'reset',0],[.85,'overload',4],[.95,'nothing',3]])test('clock '+id+' updates common cooldown lifecycle',t=>{
  const {room,resolve}=fixture(t,['stargazer','mage']);room.players.p0.action='sg_clock';room.players.p1.cooldowns.m_blast=4;const s=actionStep(resolve(r));assert.equal(s.outcome.type,id);assert.equal(room.players.p1.cooldowns.m_blast,value);
});
test('boundary locks HP and enhanced barrier separately resists one lethal',t=>{
  const {room}=fixture(t,['warrior']),p=room.players.p0;room.p8Effect(p,'boundary','boundary',1,{barrier:true});assert.equal(room.applyDamageToPlayer(p,200).actualDmg,0);assert.equal(p.hp,120);room.applyDamageToPlayer(p,200);assert.equal(p.hp,1);
});
test('discovered boundary survives later rounds and repeated discovery cannot replenish its barrier',t=>{
  const {room,resolve}=fixture(t,['stargazer']);const p=room.players.p0;
  for(const id of ['sg_eyepiece','sg_tube','sg_mount'])equip(p,id);
  p.action='sg_observe';room.currentMonster.attack=0;
  resolve(.99);
  const boundary=room.p8Has(p,'boundary');assert(boundary);assert.equal(boundary.until,Infinity);
  assert.equal(boundary.barrier,true);
  const hp=p.hp;room.applyDamageToPlayer(p,1000);assert.equal(boundary.barrier,false);assert.equal(p.hp,hp);
  room.battleRound=50;room.p8RoundStart();assert.equal(room.p8Has(p,'boundary'),boundary);
  p.hp=p.maxHp;p.action='sg_observe';resolve(.99);
  assert.equal(room.p8Has(p,'boundary'),boundary);assert.equal(boundary.barrier,false);
  room.applyDamageToPlayer(p,1000);assert.equal(p.hp,1);
  const status=JSON.parse(JSON.stringify(room.getHpSnapshot())).players[0].statuses.filter(s=>s.id==='boundary');
  assert.equal(status.length,1);assert.equal(status[0].turns,null);
});
test('gladiator damage rage once/round; sacrifice cost ignores shield and DR; xiphos stacks reset at exit',t=>{
  const {room,resolve}=fixture(t,['gladiator']),p=room.players.p0;room.applyDamageToPlayer(p,1);room.applyDamageToPlayer(p,1);assert.equal(p.rage,1);
  room.p8GrantShield(p,100);room.p8Effect(p,'warrior_resolve','DR',3);equip(p,'g_xiphos');p.action='g_sacrifice';const s=actionStep(resolve());assert.equal(s.actorHpAfter,66);assert.equal(p.rage,2);assert.equal(p.bloodStacks,1);
});
test('sacrifice pays 20 percent of max HP, preserves one HP, and rejects one-HP casts',t=>{
  for (const [hp,cost] of [[85,17],[18,17],[17,16],[2,1]]) {
    const {room,resolve}=fixture(t,['gladiator']),p=room.players.p0;
    p.hp=hp;p.action='g_sacrifice';room.p8GrantShield(p,100);room.p8Effect(p,'warrior_resolve','DR',3);
    const s=actionStep(resolve()),payment=s.results.find(r=>r.presentationBeat==='self_damage');
    assert.equal(payment.finalDamage,cost);assert.equal(payment.targetAfter.hp,hp-cost);
    assert.equal(payment.targetAfter.tempHp,100);assert.equal(s.gladiatorPresentation.rageGained,1);
  }
  for (const arena of [false,true]) {
    const {room,resolve}=fixture(t,['gladiator']),p=room.players.p0;
    p.hp=1;p.arenaActive=arena;if(arena)room.arena={playerId:p.id,originalMaxHp:85,until:1};
    assert.equal(getPlayerSkills(p)[1].hpBlocked,true);
    assert.equal(room.lockAction(p.id,'g_sacrifice').success,false);
    // A cast locked earlier can become invalid due to another action's damage.
    p.action='g_sacrifice';const s=actionStep(resolve());
    assert.equal(s.results.some(r=>r.presentationBeat==='self_damage'),false);
    assert.equal(s.finalDamage,0);assert.equal(s.gladiatorPresentation.rageGained,0);
  }
});
test('arena skills have independent cooldowns and only their current field copy',t=>{
  const {room,resolve}=fixture(t,['gladiator','warrior']),p=room.players.p0;
  p.action='g_arena';resolve();assert.equal(p.cooldowns.g_arena,3);
  room.battleRound=2;room.p8RoundStart();room.selectionState='SELECTING';
  const inside=getPlayerSkills(p);
  assert.equal(inside[1].label,'血殺重擊');assert.equal(inside[2].label,'同歸於盡');
  assert(!inside[1].desc.includes('獻祭'));assert(!inside[2].desc.includes('挑戰書'));
  assert.equal(room.getClientState().players[0].cooldowns.g_arena,0);
  assert.equal(room.lockAction(p.id,'g_arena').success,true);
  p.action='g_sacrifice';const cast=actionStep(resolve());assert.equal(cast.skillName,'血殺重擊');
  assert.equal(p.cooldowns.g_arena,3);assert.equal(p.cooldowns.arena_g_arena||0,0);
  const outside=getPlayerSkills(p);
  assert.equal(outside[1].label,'鮮血獻祭');assert.equal(outside[2].label,'死鬥宣告');
  assert(!outside[1].desc.includes('血殺重擊'));assert(!outside[2].desc.includes('同歸於盡'));
  assert.equal(room.getClientState().players[0].cooldowns.g_arena,3);
  p.cooldowns.arena_g_sacrifice=2;room.selectionState='SELECTING';
  assert.equal(room.lockAction(p.id,'g_sacrifice').success,true);
});
test('battle skill descriptions isolate Sage hypothesis from solve effects in both copy modes',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;
  for (const phase of ['hypothesis','solve']) {
    p.sagePhase=phase;
    for (const skill of room.getClientState().players[0].availableSkills) {
      assert.equal(skill.contextualCopy,true);
      for (const desc of [skill.desc,skill.shortDesc]) {
        assert(desc.includes(phase==='solve'?'【求解階段】':'【假設階段】'));
        assert(!desc.includes(phase==='solve'?'【假設階段】':'【求解階段】'));
        assert.equal(desc.includes('推演成功'),phase==='solve');
        assert.equal(desc.includes('無事發生或思緒紊亂'),phase==='solve');
      }
    }
  }
});
test('arena starts NEXT round, isolates selection/damage, scales both sides and restores exit ratio',t=>{
  const {room,resolve}=fixture(t,['gladiator','warrior']),p=room.players.p0;p.action='g_arena';resolve();assert(!room.arena);room.battleRound=2;room.p8RoundStart();assert.equal(p.maxHp,153);assert.equal(room.currentMonster.maxHp,9000);
  assert.equal(room.lockAction('p1','basic').success,false);room.startSkillSelection();assert.equal(room.players.p1.isLocked,true);
  assert.equal(room.p8Incoming(p,30,()=>1).damage,30);assert.equal(room.p8Incoming(room.players.p1,30,()=>1).damage,0);
  p.hp=Math.floor(p.maxHp*.5);room.p8ExitArena();assert.equal(p.maxHp,85);assert(Math.abs(p.hp-42)<2);assert.equal(room.currentMonster.maxHp,5000);
});
test('arena suicide consumes all HP, cingulum rage multiplier, no same-floor revive, next floor legal',t=>{
  const {room,resolve}=fixture(t,['gladiator','bard']),p=room.players.p0;p.arenaActive=true;p.rage=2;p.hp=50;equip(p,'g_cingulum');room.arena={playerId:p.id,originalMaxHp:85,until:1};p.action='g_arena';
  const q=resolve();assert.equal(actionStep(q).finalDamage,80);assert.equal(p.hp,0);assert.equal(p.noReviveFloor,8);room.selectionState='SELECTING';assert.equal(room.lockAction('p1','b_revive','p0').success,false);room.floor=9;assert.equal(room.players.p0.noReviveFloor===room.floor,false);
});
test('cuirass HP corrosion and passive immunity; haori and murasame conflict removes all haori effects',t=>{
  const {room}=fixture(t,['gladiator','samurai']),p=room.players.p0,s=room.players.p1;equip(p,'g_cuirass');equip(s,'sa_haori');equip(s,'sa_murasame');room.p8RefreshEquipment();assert.equal(s.maxHp,65);
  room.roundModifiers.equipmentEffectMultiplier=.5;room.p8RefreshEquipment();assert.equal(p.maxHp,102);
  room.p8Effect(p,'blood_heal','Blood',2);p.hp=10;assert.equal(room.applyHealCapped(p,10),12);
  const r=random(.1,()=>room.p8Incoming(s,20,n=>n));assert.equal(r.damage,10);assert.equal(s.soul,1);
});
test('samurai rolls once, fail lasts round, success parries each remaining direct hit and gains once',t=>{
  const {room}=fixture(t,['samurai']),p=room.players.p0;
  let n=0;random(()=>{n++;return .9;},()=>{assert.equal(room.p8Incoming(p,10,n=>n).damage,10);assert.equal(room.p8Incoming(p,10,n=>n).damage,10);});assert.equal(n,1);assert.equal(p.soul||0,0);
  p.parryChecked=false;random(.1,()=>{assert.equal(room.p8Incoming(p,10,n=>n).damage,0);assert.equal(room.p8Incoming(p,10,n=>n).damage,0);});assert.equal(p.soul,1);assert.equal(p.parriedCount,2);
  assert.equal(room.p8Incoming(p,10,n=>n,{kind:'dot'}).damage,10);assert.equal(room.p8Incoming(p,10,n=>n,{kind:'friendly'}).damage,10);
});
test('samurai zero-soul cut raises parry; nonzero soul burst doubles; tsubame four hits / one action / no soul gain',t=>{
  let f=fixture(t,['samurai']);f.room.players.p0.action='sa_cut';f.resolve(.9);assert.equal(f.room.players.p0.parryChance,.7);
  f=fixture(t,['samurai']);f.room.players.p0.action='sa_cut';f.room.players.p0.soul=4;assert.equal(actionStep(f.resolve(.1)).finalDamage,30);
  f=fixture(t,['samurai']);f.room.players.p0.action='sa_tsubame';f.room.players.p0.soul=4;f.room.currentMonster.resistance='phys';const s=actionStep(f.resolve(.9));assert.equal(s.results.filter(r=>r.kind==='damage').length,4);assert.equal(s.results.reduce((n,r)=>n+r.finalDamage,0),40);assert.equal(f.room.players.p0.soul,0);
  f.room.selectionState='SELECTING';assert.equal(f.room.lockAction('p0','sa_tsubame').success,false);
});
test('galaxy applies per legal hit, tsubame gets four bonuses, counter occurs once after boss',t=>{
  const {room,resolve}=fixture(t,['samurai']),p=room.players.p0;p.soul=4;p.action='sa_tsubame';room.p8Effect(p,'galaxy','Galaxy',1,{value:5});const q=resolve(.1);
  const s=actionStep(q);assert.deepEqual(s.results.map(r=>r.finalDamage),[15,15,15,15]);const counter=q.findIndex(s=>s.actionId==='sa_counter');assert(counter>q.findIndex(s=>s.type==='boss_action'));assert.equal(q.filter(s=>s.actionId==='sa_counter').length,1);
});
test('sage eta/primes and independent equation honors simultaneous even-square and odd-prime',t=>{
  assert.equal(eta(0),.4);assert(isPrime(3));assert(!isPrime(1));assert(!isPrime(4));
  for(const operand of [4,3,2,25]) {
    const {room,resolve}=fixture(t,['sage']),p=room.players.p0;
    Object.assign(p,{sagePhase:'solve',sageOperand:operand-2,sageX:80,action:'basic'});room.currentMonster.resistance='phys';
    const s=resolve(.9).find(s=>s.actionId==='sge_equation');
    assert.equal(s.outcome.equationDamage,Math.round(operand*eta(80)));
    assert.equal(s.outcome.properties.includes('EVEN'),operand%2===0);
    assert.equal(s.outcome.properties.includes('PRIME'),isPrime(operand));
    assert.equal(s.outcome.properties.includes('SQUARE'),Number.isInteger(Math.sqrt(operand)));
    if(operand%2===0)assert.equal(s.results[0].finalDamage,Math.floor(s.outcome.equationDamage*.58));
    else assert.equal(s.results[0].finalDamage,s.outcome.equationDamage);
    if(isPrime(operand))assert.equal(s.results[1].finalDamage,15);
    if(Number.isInteger(Math.sqrt(operand)))assert(room.currentMonster.p8Effects.sage_square);
  }
});
for(const action of ['basic','sge_deduce','sge_induce'])test('sage hypothesis/solve operand owner '+action,t=>{
  const {room,resolve}=fixture(t,['sage']),p=room.players.p0;p.sageOperand=8;p.sagePhase='hypothesis';p.action=action;const s=actionStep(resolve(.9));
  if(action==='basic')assert.equal(s.hpSnapshot.players[0].sageOperand,10);
  if(action==='sge_deduce')assert.equal(s.hpSnapshot.players[0].sageOperand,18);
  if(action==='sge_induce')assert.equal(p.sageOperand,28);
  p.sageInduction=true;const old=p.sageOperand;room.applyDamageToPlayer(p,3,{kind:'dot'});assert.equal(p.sageOperand,old);room.applyDamageToPlayer(p,3,{kind:'enemy_direct'});assert.equal(p.sageOperand,old+3);
});
for(const [r,resolution] of [[.1,'SUCCESS'],[.01,'CONFUSION'],[.95,'NOTHING']])test('sage equation X outcome '+resolution,t=>{
  const {room,resolve}=fixture(t,['sage']),p=room.players.p0;p.sageX=20;p.sageOperand=8;p.sagePhase='solve';p.action='basic';const q=resolve(r),s=q.find(s=>s.actionId==='sge_equation');assert.equal(s.outcome.resolution,resolution);assert.equal(p.sageX,resolution==='SUCCESS'?38:30);
});
test('sage expired shields never feed the next operand, including partial absorption',t=>{
  const {room}=fixture(t,['sage','warrior']),p=room.players.p0,ally=room.players.p1;
  for(const absorbed of [0,1]){
    room.p8GrantShield(ally,14,1,'sage',p.id);room.applyDamageToPlayer(ally,absorbed);
    room.battleRound++;p.sageCycleRound=0;random(.1,()=>room.p8RoundStart());
    assert.equal(p.sageOperand,4);assert.equal(ally.tempHp,0);assert.equal(p.sageMomentum,undefined);
  }
});
test('session retains 250 logs and all twelve roles resolve within existing ten-player capacity',t=>{
  for(const roles of [Object.keys(CLASSES).slice(0,10),Object.keys(CLASSES).slice(10)]) {
    const {room,resolve}=fixture(t,roles);const initial=room.logs.length;for(let i=0;i<250;i++)room.addLog('Entry '+i);assert.equal(room.logs.length,initial+250);
    for(const p of Object.values(room.players))p.action='basic';const q=resolve(.9);assert.equal(q.filter(s=>s.type==='player_action'&&s.actionId==='basic').length,roles.length);
    for(const step of q)for(const p of step.hpSnapshot?.players||[])assert(Number.isFinite(p.hp)&&Number.isFinite(p.maxHp));
  }
});
test('arena sacrifice replacement formula and xiphos bonus are immune to corrosion',t=>{
  const {room,resolve}=fixture(t,['gladiator','alchemist']),p=room.players.p0;equip(p,'g_xiphos');p.rage=2;p.bloodStacks=3;p.arenaActive=true;p.action='g_sacrifice';
  room.players.p1.action='alc_flask';room.arena={playerId:p.id,originalMaxHp:85,until:1};
  const q=resolve(.1),s=actionStep(q);assert.equal(s.finalDamage,15+20+50+6);assert.equal(p.bloodStacks,0);
});
test('haori fixed counter, murasame override and active missing-health multiplier',t=>{
  let f=fixture(t,['samurai']),p=f.room.players.p0;equip(p,'sa_haori');p.action='basic';let q=f.resolve(.1);assert.equal(p.soul,3);assert.equal(q.find(s=>s.actionId==='sa_counter').finalDamage,5);
  f=fixture(t,['samurai']);p=f.room.players.p0;equip(p,'sa_haori');equip(p,'sa_murasame');f.room.p8RefreshEquipment();p.hp=13;p.action='basic';q=f.resolve(.1);assert.equal(actionStep(q).finalDamage,12);assert.equal(p.soul,2);assert(q.find(s=>s.actionId==='sa_counter').finalDamage>=22);
});
test('oboro stacks additively, zero-soul 70% vs base 40%, and soul cap remains eight',t=>{
  const {room,resolve}=fixture(t,['samurai']),p=room.players.p0;equip(p,'sa_oboro');equip(p,'sa_oboro');p.soul=8;p.action='basic';const q=resolve(.9);assert.equal(actionStep(q).finalDamage,12);assert.equal(p.soul,8);
  p.parryChecked=false;p.kyoutou=false;p.parryChance=.7;assert.equal(random(.65,()=>room.p8Incoming(p,10,n=>n)).damage,0);
  p.parryChecked=false;p.kyoutou=false;p.parryChance=.4;assert.equal(random(.65,()=>room.p8Incoming(p,10,n=>n)).damage,10);
});
test('sage lenses consume only nothing; rulers modify equation once; prime resets charged CD',t=>{
  const {room,resolve}=fixture(t,['sage']),p=room.players.p0;
  equip(p,'sge_lens');equip(p,'sge_rule');equip(p,'sge_rule');
  Object.assign(p,{sagePhase:'solve',sageX:80,sageOperand:8,action:'sge_deduce'});p.cooldowns.sge_induce=5;
  const s=resolve(.65).find(s=>s.actionId==='sge_equation');
  assert.equal(s.outcome.resolution,'SUCCESS'); // deduce 50% + lens 10%, after 7% confusion
  assert.equal(s.outcome.equationDamage,Math.round(Math.round(13*eta(80))*1.15));
  assert.equal(p.cooldowns.sge_deduce,0);assert.equal(p.cooldowns.sge_induce,0);
});
test('actual boss dream healing is a heal result, nightmare true damage ignores DR, and source follows server snapshots',t=>{
  for(const [r,kind] of [[.1,'heal'],[.9,'damage']]) {
    const {room,resolve}=fixture(t,['warrior']),p=room.players.p0;p.hp=20;room.p8Effect(p,'dream_butterfly','Dream',1);room.alcShieldTurns=1;
    const q=resolve(r),boss=q.find(s=>s.type==='boss_action');assert(boss.results.every(s=>s.kind===kind));
    if(kind==='heal')assert(boss.results.some(s=>s.actualHeal>0));else assert.equal(boss.results.reduce((n,s)=>n+s.finalDamage,0),20);
  }
});
test('arena excludes absent minions, hidden assassin followups and scatter targets; both sides ignore reduction',t=>{
  const {room,resolve}=fixture(t,['gladiator','druid','assassin']),p=room.players.p0;
  room.arena={playerId:p.id,originalMaxHp:85,until:1};p.arenaActive=true;p.action='basic';room.currentMonster.resistance='phys';room.currentMonster.attack=20;
  room.players.p1.minions=[{id:'m',type:'wolf',name:'Wolf',hp:100,maxHp:100,atk:10}];room.players.p1.druidForm='treant';room.players.p1.druidFormTurns=2;
  Object.assign(room.players.p2,{isHiddenThisRound:true,stealthStacks:2});room.alcShieldTurns=1;
  const q=resolve(.1);assert.equal(actionStep(q).finalDamage,10);assert(!q.some(s=>s.category==='FOLLOW_UP'||s.category==='MINION_INTERCEPT'));
  const boss=q.find(s=>s.type==='boss_action');assert(boss.results.every(r=>r.targetId===p.id));assert.equal(boss.results.reduce((n,s)=>n+s.finalDamage,0),20);assert.equal(room.players.p1.minions[0].hp,100);
});

for(const [roll,expected] of [[.1,'dream_heal'],[.9,'nightmare']])test('dream is selected at cast and remains stable across hits: '+expected,t=>{
 const {room,resolve}=fixture(t,['dreamweaver']);const p=room.players.p0;p.action='dw_butterfly';p.targetPlayerId=p.id;p.hp=30;
 const queue=resolve(roll),cast=queue.find(s=>s.actionId==='dw_butterfly'),reveal=queue[queue.indexOf(cast)+1];
 assert.equal(reveal.actionId,'dw_butterfly_result');assert.equal(reveal.outcome.type,expected);
 assert.equal(p.p8Effects.dream_butterfly.dreamOutcome,expected);
 room.p8LogBuffer=[]; // Log IDs use randomness independently of dream selection.
 for(let i=0;i<3;i++){
  const hit=random(()=>{throw Error('A hit must not reroll the dream');},()=>room.p8DreamDamage(p,2));
  assert.equal(hit.outcome,expected);
 }
});

test('13.1 Sage variable X persists across battles, floors, death and resets only on adventure restart/role select', t => {
  const { room } = fixture(t, ['sage']);
  const p = room.players.p0;
  assert.equal(p.sageX, 30);
  p.sageX = 75;
  // 1. Battle reset preserves X
  room.p8ResetBattle();
  assert.equal(p.sageX, 75);
  // 2. Dead then revived preserves X
  p.hp = 0;
  p.sageX = 140;
  room.p8ResetBattle();
  p.hp = 50;
  assert.equal(p.sageX, 140);
  // 3. Select role resets to 30
  room.state = 'LOBBY';
  room.selectRole('p0', 'sage');
  assert.equal(p.sageX, 30);
  // 4. restartToLobby resets to 30
  p.sageX = 99;
  room.restartToLobby('p0');
  assert.equal(p.sageX, 30);
});

test('Sage fixed growth and successful bonuses use v3 skill constants; confusion has no next-cycle debuff',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;
  for(const [action,operand,base,bonus] of [['basic',20,10,11],['sge_deduce',50,14,22],['sge_induce',101,4,17]]){
    for(const [r,result] of [[.01,'CONFUSION'],[.2,'SUCCESS'],[.99,'NOTHING']]){
      const s=equation(room,p,{action,operand,x:80,r});
      assert.equal(s.outcome.resolution,result);assert.equal(s.outcome.baseXGain,base);
      assert.equal(s.outcome.bonusXGain,result==='SUCCESS'?bonus:0);
      assert.equal(p.sageX,80-4+base+(result==='SUCCESS'?bonus:0));
    }
  }
  room.battleRound++;p.hp=70;p.sageCycleRound=0;random(.5,()=>room.p8RoundStart());
  assert.equal(p.sageOperand,16);assert.equal(p.sageConfusion,undefined);
});
test('Sage v3 formula uses rounded operand times eta and ignores bard/permanent attack/mastery',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;
  for(const [x,operand,expected] of [[30,50,44],[100,75,103],[180,100,161]]){
    p.victoryAtkBonus=500;p.bonusAtk=500;
    const s=equation(room,p,{x,operand,bard:1.7});
    assert.equal(s.outcome.baseEquationDamage,expected);assert.equal(s.outcome.equationDamage,expected);
    assert.equal(s.outcome.actualBossDamage,expected);assert.equal(s.outcome.mastery,undefined);
  }
});
test('Sage parity penetration, independent prime true damage/CD reset, square reduction',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;
  for(const operand of [36,3,2,25]){
    const s=equation(room,p,{operand,x:80,resistance:(dmg,type,opts)=>{
      if(type!=='true')assert.equal(opts.penetration,operand%2===0?.4:1);
      assert.equal(opts.equation,true);return {dmg};
    }});
    if(operand%2===0)assert(p.p8Shields.some(s=>s.kind==='sage'));
    else assert(room.currentMonster.p8Effects.sage_exposed);
    if(isPrime(operand)){assert.equal(s.results[1].damageType,'true');assert.equal(s.results[1].finalDamage,15);assert(p.sagePrimeResetPending);}
    if(Number.isInteger(Math.sqrt(operand)))assert(room.currentMonster.p8Effects.sage_square);
  }
});
test('Sage opening and Inertia sampling grant no shield, while sampling remains active', t => {
  const { room, resolve } = fixture(t, ['sage']);
  const p = room.players.p0;
  room.battleRound = 1;
  room.p8RoundStart();
  assert.equal(p.tempHp || 0, 0);
  assert.equal((p.p8Shields || []).length, 0);
  assert.equal(room.p8Has(p,'sage_prior_shield'), null);

  p.sagePhase = 'hypothesis';
  p.action = 'sge_induce';
  p.sageOperand = 10;
  room.p8Action(p, dmg => ({ dmg }), 1.0, [], []);
  assert.equal(p.tempHp || 0, 0);
  assert.equal((p.p8Shields || []).length, 0);
  assert.equal(room.p8Has(p,'sage_sampling_shield'), null);
  assert.equal(p.sageInduction, true);
  const hp=p.hp;
  room.applyDamageToPlayer(p,10,{kind:'enemy_direct'});
  assert.equal(p.hp,hp-10);
  assert.equal(p.sageOperand,20);
});

test('13.6 Shared systems: Boss victory rewards all party members including dead, corrosion immunity for permanent atk', t => {
  const { room } = fixture(t, ['warrior', 'sage']);
  const p0 = room.players.p0;
  const p1 = room.players.p1;
  p1.hp = 0;
  p1.maxHp = 80;
  p1.bonusAtk = 0;
  p1.victoryAtkBonus = 0;

  p0.hp = 50;
  p0.maxHp = 120;
  p0.bonusAtk = 0;
  p0.victoryAtkBonus = 0;

  for (const p of Object.values(room.players)) {
    p.maxHp += 10;
    p.bonusAtk += 5;
    p.victoryAtkBonus = (p.victoryAtkBonus || 0) + 5;
    if (p.hp > 0) {
      const healAmt = Math.max(1, Math.round(p.maxHp * 0.2));
      p.hp = Math.min(p.maxHp, p.hp + 10 + healAmt);
    } else {
      p.hp = 0;
    }
  }

  assert.equal(p0.maxHp, 130);
  assert.equal(p0.bonusAtk, 5);
  assert.equal(p0.victoryAtkBonus, 5);
  assert(p0.hp > 50);

  assert.equal(p1.maxHp, 90);
  assert.equal(p1.bonusAtk, 5);
  assert.equal(p1.victoryAtkBonus, 5);
  assert.equal(p1.hp, 0);

  room.roundModifiers = { equipmentEffectMultiplier: 0.5 };
  equip(p0, 'sg_bracer');
  assert.equal(room.getEffectiveBonusAtk(p0), 10);
});

test('Sage v3 HP is 70, X/debt persist until complete initialization, battle resources reset',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;assert.equal(p.maxHp,70);assert.equal(p.sageX,30);
  Object.assign(p,{sageX:10000,sageDebt:20,sageOperand:200,sageInduction:true,sageCycleRound:1,sageEquationResolved:true,sagePreviousAction:'basic',sageLastAction:'sge_induce'});
  p.hp=0;room.p8ResetBattle();assert.equal(p.sageX,10000);assert.equal(p.sageDebt,20);assert.equal(p.sageOperand,0);
  assert.equal(p.sagePhase,'hypothesis');assert.equal(p.sageCycleRound,0);assert.equal(p.sageInduction,false);assert.equal(p.sageLastAction,undefined);assert.equal(p.sageEquationResolved,false);
  room.state='LOBBY';room.selectRole(p.id,'sage');assert.equal(p.sageX,30);assert.equal(p.sageDebt,0);
  p.sageX=999;p.sageDebt=20;room.restartToLobby(p.id);assert.equal(p.sageX,30);assert.equal(p.sageDebt,0);
});

for(const [x,decay] of [[0,0],[30,0],[50,0],[60,0],[61,1],[80,4],[100,8],[120,12],[150,18],[200,28],[300,48],[10000,1988]])
test('Sage decay after locked-X damage and before fixed growth: X='+x,t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;const s=equation(room,p,{x,operand:40});
  assert.equal(sageDecay(x),decay);assert.equal(s.outcome.decayAmount,decay);
  assert.equal(s.outcome.baseEquationDamage,Math.round(40*(.4+1.75*x/(x+80))));
  assert.equal(s.results[0].hpSnapshot.players[0].sageX,x);
  assert.equal(p.sageX,Math.max(0,x-decay)+10);assert.equal(s.hpSnapshot.players[0].sageX,p.sageX);
  assert(p.sageX>=0);if(x===10000)assert(p.sageX>300);
});

for(const [x,chance] of [[30,.05],[60,.05],[69,.05],[70,.06],[100,.09],[150,.14],[200,.19],[260,.25],[10000,.25]])
test('Sage confusion probability uses pre-decay X='+x,t=>{
  assert(Math.abs(sageConfusionChance(x)-chance)<1e-12);
  const {room}=fixture(t,['sage']),p=room.players.p0;const s=equation(room,p,{x,r:chance-.0001});
  assert.equal(s.outcome.resolution,'CONFUSION');assert.equal(s.outcome.bonusXGain,0);assert.equal(s.outcome.baseXGain,10);
});

test('Sage one main random draw with confusion priority preserves full base success probabilities',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;
  for(const [action,base] of [['basic',.6],['sge_deduce',.5],['sge_induce',.4]]){
    for(const [value,result] of [[.0499,'CONFUSION'],[.05,'SUCCESS'],[.05+base-.0001,'SUCCESS'],[.05+base,'NOTHING']]){
      let draws=0;const s=equation(room,p,{operand:6,action,r:()=>{draws++;return value;}});
      assert.equal(draws,1);assert.equal(s.outcome.resolution,result);assert.equal(s.outcome.successChance,base);
      assert(Math.abs(s.outcome.confusionChance+s.outcome.successChance+s.outcome.nothingChance-1)<1e-12);
    }
  }
});

test('Sage lens stacks and corrosion shift only nothing, saturating below confusion',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;
  for(const count of [1,2,20]){
    p.equips=Array.from({length:count},()=>structuredClone(LOOT_TABLE.find(e=>e.id==='sge_lens')));
    for(const corrosion of [1,.5]){
      room.roundModifiers.equipmentEffectMultiplier=corrosion;
      const s=equation(room,p,{x:150,r:.1399,operand:6});
      assert.equal(s.outcome.resolution,'CONFUSION');assert.equal(s.outcome.confusionChance,sageConfusionChance(150));
      assert.equal(s.outcome.successChance,Math.min(.6+(.10+(count-1)*.05)*corrosion,1-sageConfusionChance(150)));
      assert(s.outcome.nothingChance>=0);
    }
  }
});

test('Sage ruler stacking, corrosion, combined modifier rounding and server preview agree',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;
  for(const count of [0,1,2,5])for(const corrosion of [1,.5]){
    p.equips=Array.from({length:count},()=>structuredClone(LOOT_TABLE.find(e=>e.id==='sge_rule')));room.roundModifiers.equipmentEffectMultiplier=corrosion;
    p.hp=70;Object.assign(p,{sageOperand:13,sageX:120});const preview=sageEquationPreview(p,room).options.find(s=>s.id==='basic');
    const s=equation(room,p,{operand:15,x:120,r:.01}),R=1+(count?.10+(count-1)*.05:0)*corrosion,base=Math.round(15*eta(120));
    assert.equal(s.outcome.baseEquationDamage,base);assert.equal(s.outcome.damageAfterEquipment,Math.round(base*R));
    assert.equal(s.outcome.damageAfterConfusion,Math.round(base*R*.8));
    assert.equal(s.outcome.damageAfterConfusion,preview.damageAfterConfusion);assert.equal(s.outcome.equationDamage,preview.damageAfterConfusion);
  }
});

test('Sage equation ignores bard, victory/gear attack, triumph, galaxy, overload and both vulnerability sources',t=>{
  const {room,resolve}=fixture(t,['sage','bard']),p=room.players.p0;
  Object.assign(p,{sagePhase:'solve',sageOperand:48,sageX:150,action:'basic',bonusAtk:100,victoryAtkBonus:100});room.players.p1.action='b_buff';room.currentMonster.attack=0;
  room.currentMonster.resistances={physical:50,magic:0,effect:0};
  for(const [id,value] of [['triumph',150],['galaxy',10],['overload',5]])room.p8Effect(p,id,id,2,{value});
  room.p8Effect(room.currentMonster,'dissociate','DEBUFF',2);room.p8Effect(room.currentMonster,'sage_exposed','DEBUFF',2,{starts:1});
  const q=resolve(.99),body=q.find(s=>s.sourceId===p.id&&s.actionId==='basic'),s=q.find(s=>s.actionId==='sge_equation');
  assert(body.finalDamage>10);assert.equal(s.outcome.baseEquationDamage,Math.round(50*eta(150)));
  assert.equal(s.results[0].finalDamage,Math.floor(s.outcome.baseEquationDamage*.7)); // 50% resist with 40% penetration; bard -5 is excluded
});

test('Sage odd equation ignores vulnerability on later turns; other attacks retain it',t=>{
  const {room,resolve}=fixture(t,['sage','warrior']),p=room.players.p0;room.currentMonster.attack=0;
  room.p8Effect(room.currentMonster,'sage_exposed','ODD',2,{starts:1});
  Object.assign(p,{sagePhase:'solve',sageOperand:23,sageX:30,action:'basic'});room.players.p1.action='basic';
  const q=resolve(.99),s=q.find(s=>s.actionId==='sge_equation');assert.equal(s.outcome.actualBossDamage,Math.round(25*eta(30)));
  assert.equal(q.find(s=>s.sourceId==='p1'&&s.actionId==='basic').finalDamage,11);
  assert(room.currentMonster.p8Effects.sage_square);
});

test('Sage even shield is a team total, ordered remainder, capped, lasts two turns and never stacks between Sages',t=>{
  const {room}=fixture(t,['sage','sage','warrior']),p=room.players.p0,allies=Object.values(room.players);
  const s=equation(room,p,{operand:50,x:30});assert.equal(s.outcome.actualBossDamage,44);assert.equal(s.outcome.totalShield,17);
  assert.deepEqual(allies.map(a=>a.tempHp),[6,6,5]);assert(allies.every(a=>a.p8Shields[0].until===2));
  room.p8GrantShield(allies[2],9,5,'warrior','p2');
  equation(room,allies[1],{operand:1000,x:300});assert.deepEqual(allies.map(a=>a.p8Shields.find(s=>s.kind==='sage').value),[14,14,14]);
  assert.equal(allies[2].tempHp,23);assert.equal(allies[2].p8Shields.filter(s=>s.kind==='sage').length,1);
  room.applyDamageToPlayer(allies[0],3,{kind:'sage_confusion'});assert.equal(allies[0].tempHp,11);
  room.p8GrantShield(allies[0],4,2,'sage','p1');assert.equal(allies[0].tempHp,11);
  room.battleRound=2;room.p8RoundStart();assert.equal(allies[0].tempHp,11);
  room.battleRound=3;room.p8RoundStart();assert.equal(allies[0].tempHp,0);assert.equal(allies[2].tempHp,9);
  assert.equal(allies[2].p8Shields[0].kind,'warrior');
});

test('Sage shield uses actual main HP loss only, excluding overkill and prime true damage',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;
  const prime=equation(room,p,{operand:2,x:300});assert.equal(prime.outcome.actualBossDamage,4);assert.equal(prime.outcome.totalShield,1);assert.equal(p.tempHp,1);
  room.currentMonster.hp=7;p.p8Shields=[];p.tempHp=0;
  const lethal=equation(room,p,{operand:1000,x:300});assert.equal(lethal.outcome.actualBossDamage,7);assert.equal(lethal.outcome.totalShield,2);assert.equal(p.tempHp,2);
});

test('Sage confusion resolves main, friendly hit, prime and shield in that order, using only old shields',t=>{
  const {room}=fixture(t,['sage','warrior']),p=room.players.p0,ally=room.players.p1;
  room.p8GrantShield(ally,3,5,'warrior',ally.id);
  const s=equation(room,p,{operand:2,x:300,r:.01});
  assert.deepEqual(s.results.slice(0,3).map(r=>[r.targetId,r.presentationBeat||r.damageType]),[['monster','physical'],[ally.id,'sage_confusion'],['monster','true']]);
  const hit=s.results[1];assert.equal(hit.tempAbsorbed,3);assert.equal(hit.hpDmg,7);assert.equal(hit.targetAfter.tempHp,0);assert.equal(ally.warriorStacks,0);
  assert.equal(hit.hpSnapshot.monster.hp,s.results[0].targetAfter.hp);assert.equal(hit.hpSnapshot.players[0].sageX,300);
  const second=equation(room,p,{operand:100,x:300,r:.01});
  assert.equal(second.results[1].targetAfter.tempHp,0);assert.equal(second.hpSnapshot.players[1].tempHp,14);
});

for(const role of ['warrior','gladiator','samurai','sage'])test('Sage confusion true damage bypasses all incoming/passive hooks: '+role,t=>{
  const {room}=fixture(t,['sage',role]),p=room.players.p0,ally=room.players.p1;const hp=ally.hp;
  Object.assign(ally,{sageInduction:true,sageOperand:18,warriorRoundDamage:0});room.p8Effect(ally,'warrior_resolve','Resolve',2);room.p8Effect(ally,'dream_butterfly','Dream',2,{dreamOutcome:'dream_heal'});
  room.alcShieldTurns=2;room.p8GrantShield(ally,4,2,'warrior',ally.id);
  const s=equation(room,p,{operand:15,r:.01});assert.equal(s.outcome.confusionTargetId,ally.id);
  assert.equal(s.outcome.confusionDamage,10);assert.equal(s.outcome.confusionAbsorbed,4);assert.equal(s.outcome.confusionHpDamage,6);assert.equal(ally.hp,hp-6);
  assert.equal(ally.sageOperand,18);assert.equal(ally.warriorStacks,0);assert.equal(ally.rage,0);assert.equal(ally.soul,0);assert.equal(ally.parryChecked,undefined);assert.equal(ally.warriorRoundDamage,0);
});

test('Sage confusion chooses another living player on server, excludes dead players, solitary self-hit can kill',t=>{
  const {room}=fixture(t,['sage','warrior','bard','samurai']),p=room.players.p0;room.players.p1.hp=0;
  let n=0;const s=equation(room,p,{operand:6,r:()=>n++===0?.01:.99});assert.equal(n,2);assert.equal(s.outcome.confusionTargetId,'p3');
  room.players.p2.hp=0;room.players.p3.hp=0;p.hp=5;
  const self=equation(room,p,{operand:2,r:.01});assert.equal(p.hp,0);assert.equal(self.outcome.confusionTargetId,p.id);
  assert.equal(self.results[1].hpDmg,5);assert.equal(self.results[2].finalDamage,15);assert.equal(p.sageX,40);assert.equal(p.cooldowns.sge_induce,0);
  const q=[],hp=room.currentMonster.hp;room.p8ResolveEquation(p,q,[],dmg=>({dmg}));assert.equal(q.length,0);assert.equal(room.currentMonster.hp,hp);
});

test('Sage self confusion absorbs existing shield and never samples itself',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;Object.assign(p,{sageInduction:true,sageOperand:15});room.p8GrantShield(p,10,5,'warrior');
  const s=equation(room,p,{operand:15,r:.01});assert.equal(s.outcome.confusionHpDamage,0);assert.equal(s.outcome.confusionAbsorbed,10);assert.equal(p.hp,70);assert.equal(p.sageOperand,15);
});

for(const [before,after] of [[15,23],[16,25],[0,9],[99,107]])test('Sage induce solve adds correct oddness adjustment: '+before,t=>{
  const {room,resolve}=fixture(t,['sage']),p=room.players.p0;Object.assign(p,{action:'sge_induce',sagePhase:'solve',sageOperand:before,sageX:120});room.currentMonster.attack=0;
  const q=resolve(.99),body=q.find(s=>s.actionId==='sge_induce'),s=q[q.indexOf(body)+1];
  assert.equal(body.sagePresentation.operandBefore,before);assert.equal(body.sagePresentation.operandAfter,after);assert.equal(body.sagePresentation.operandDelta,after-before);
  assert.equal(s.outcome.operand%2,1);assert.equal(s.outcome.xBefore,120);assert.equal(s.outcome.debtScheduled,20);assert.equal(p.sageDebt,20);assert.equal(p.sageX,112);
});

test('Sage debt survives lethal solve, battle reset, rest, death/control; next actionable selection pays once',t=>{
  const {room,resolve}=fixture(t,['sage']),p=room.players.p0;Object.assign(p,{action:'sge_induce',sagePhase:'solve',sageOperand:16,sageX:120});room.currentMonster.hp=11;
  const q=resolve(.99);assert(q.some(s=>s.actionId==='sge_equation'));assert.equal(p.sageDebt,20);assert.equal(room.currentMonster.hp,0);
  room.p8ResetBattle();assert.equal(p.sageDebt,20);assert.equal(p.sageX,112);
  room.state='CHECKPOINT';room.continueFromCheckpoint();room.clearTimer();assert.equal(p.sageDebt,20);assert.equal(p.sageX,112);
  for(const blocked of [{hp:0},{hp:70,stunnedNextTurn:true},{hp:70,stunnedNextTurn:false,isSurrendered:true},{hp:70,isSurrendered:false,druidForm:'tree'}]){
    Object.assign(p,blocked);room.startSkillSelection();assert.equal(p.sageDebt,20);assert.equal(p.sageX,112);
  }
  p.druidForm=null;room.arena={playerId:'other',until:99};room.startSkillSelection();assert.equal(p.sageDebt,20);
  room.arena=null;room.startSkillSelection();assert.equal(p.sageDebt,0);assert.equal(p.sageX,92);
  room.startSkillSelection();assert.equal(p.sageX,92);
  p.sageX=3;p.sageDebt=20;room.startSkillSelection();assert.equal(p.sageX,0);assert.equal(p.sageDebt,0);
});

test('Sage lethal solving body still finishes exactly one equation/growth/debt event',t=>{
  const {room,resolve}=fixture(t,['sage']),p=room.players.p0;Object.assign(p,{action:'sge_induce',sagePhase:'solve',sageOperand:16,sageX:30});room.currentMonster.hp=1;
  const q=resolve(.99),s=q.find(s=>s.actionId==='sge_equation');assert.equal(q.filter(s=>s.actionId==='sge_equation').length,1);
  assert.equal(s.outcome.actualBossDamage,0);assert.equal(s.outcome.xAfter,34);assert.equal(p.sageDebt,20);assert.equal(q.at(-1).type,'kill');
  const replay=[];room.p8ResolveEquation(p,replay,[],dmg=>({dmg}));room.p8EndRound(replay,[],dmg=>({dmg}));assert.equal(replay.length,0);
});

test('Sage skipped solve cannot fire a fallback equation or charge debt',t=>{
  const {room,resolve}=fixture(t,['sage']),p=room.players.p0;Object.assign(p,{action:'skip',sagePhase:'solve',sageOperand:20,sageX:30});
  assert(!resolve(.99).some(s=>s.actionId==='sge_equation'));assert.equal(p.sageX,30);assert.equal(p.sageDebt,0);
});
test('Sage debt cannot be paid again in its solving round; it waits through control until next actionable turn',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;equation(room,p,{action:'sge_induce'});
  const x=p.sageX;room.startSkillSelection();assert.equal(p.sageX,x);assert.equal(p.sageDebt,20);
  room.battleRound++;p.stunnedNextTurn=true;room.startSkillSelection();assert.equal(p.sageDebt,20);
  p.stunnedNextTurn=false;room.startSkillSelection();assert.equal(p.sageX,x-20);assert.equal(p.sageDebt,0);
  room.startSkillSelection();assert.equal(p.sageX,x-20);
});
test('Sage starting a new adventure initializes X and clears outstanding debt',t=>{
  const {room}=fixture(t,['sage']),p=room.players.p0;room.state='LOBBY';p.sageX=999;p.sageDebt=20;
  assert.equal(room.startAdventure(p.id).success,true);assert.equal(p.sageX,30);assert.equal(p.sageDebt,0);
});
test('Sage zero equation cannot inherit the common minimum one damage rule',t=>{
  const {room,resolve}=fixture(t,['sage']),p=room.players.p0;room.currentMonster.attack=0;
  Object.assign(p,{action:'basic',sagePhase:'solve',sageOperand:-2,sageX:30});
  const s=resolve(.99).find(s=>s.actionId==='sge_equation');assert.equal(s.outcome.baseEquationDamage,0);assert.equal(s.outcome.actualBossDamage,0);assert.equal(s.outcome.totalShield,0);
});

test('Sage equation dream healing produces no damage/shield and nightmare preserves special conversion',t=>{
  for(const dreamOutcome of ['dream_heal','nightmare']){
    const {room,resolve}=fixture(t,['sage']),p=room.players.p0;room.currentMonster.hp=1000;room.currentMonster.attack=0;
    room.p8Effect(room.currentMonster,'dream_butterfly','Dream',2,{dreamOutcome});Object.assign(p,{action:'basic',sagePhase:'solve',sageOperand:48,sageX:30});
    const s=resolve(.99).find(s=>s.actionId==='sge_equation');
    if(dreamOutcome==='dream_heal'){assert.equal(s.results[0].kind,'heal');assert.equal(s.outcome.actualBossDamage,0);assert.equal(s.outcome.totalShield,0);assert.equal(p.tempHp,0);}
    else{assert.equal(s.results[0].damageType,'true');assert.equal(s.outcome.actualBossDamage,44);}
  }
});
