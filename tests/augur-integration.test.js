import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {makeAugurFixture,seedAugurDebt,equipAugurFixture,withAugurRandom,buildAugurLabScenes,augurLabSource} from '../scripts/build-augur-lab.mjs';

const debt=room=>room.getAugurTotalDebt(room.players.p0);
const action=(queue,id,source='p1')=>queue.find(s=>s.actionId===id && s.sourceId===source);

test('Augur snapshots expose target, debts, card, equipment and actual boss statuses',()=>{
  const {room}=makeAugurFixture();seedAugurDebt(room,20);equipAugurFixture(room.players.p0,'aug_amethyst');
  room.currentMonster.augurResistanceBreak=2;room.currentMonster.reversedOmenRemaining=2;room.currentMonster.reversedOmenBonus=10;
  const snapshot=room.getHpSnapshot(),p=snapshot.players[0];
  assert.equal(p.observedTargetId,'p1');assert.equal(p.augurCardState,'empty');assert.equal(p.augurEquipment.amethyst,1);
  assert.equal(p.augurFateDebts[0].dueRound,3);p.augurFateDebts[0].amount=0;assert.equal(debt(room),20);
  assert.equal(snapshot.monster.resistances.effect,25);
  assert(snapshot.monster.statuses.some(s=>s.id==='reversed_omen' && s.turns===2));
  assert(snapshot.monster.statuses.some(s=>s.id==='augur_resistance_break'));
});

test('Augur positive intervention is consumed even when the boosted roll fails',()=>{
  const {room}=makeAugurFixture(['augur','assassin']),p=room.players.p1,a=room.players.p0;
  const result=withAugurRandom(.9,()=>room.intervenePositive(p,'暴擊',60));
  assert.equal(result.success,false);assert.equal(result.finalChance,75);
  assert.equal(a.augurCardState,'upright');assert.equal(a.augurIntervenedThisRound,true);
  const next=withAugurRandom(.1,()=>room.interveneNegative(p,'負面',20));
  assert.equal(next.failed,true);assert.equal(next.intercepted,false);assert.equal(debt(room),0);
  assert.equal(room.augurReactions.length,1);assert.equal(room.augurReactions[0].outcome.success,false);
});

test('Augur negative interception uses exactly the cancelled interval, actual cap and binding limit',()=>{
  for(const [roll,failed,intercepted] of [[.049,true,false],[.05,false,true],[.249,false,true],[.25,false,false]]) {
    const {room}=makeAugurFixture();const result=withAugurRandom(roll,()=>room.interveneNegative(room.players.p1,'失誤',25));
    assert.equal(result.failed,failed);assert.equal(result.intercepted,intercepted);
    assert.equal(debt(room),intercepted?20:0);
  }
  const {room}=makeAugurFixture(),a=room.players.p0;
  seedAugurDebt(room,55);a.augurBindingBoostRound=room.battleRound;
  const result=withAugurRandom(.02,()=>room.interveneNegative(room.players.p1,'失誤',25));
  assert.equal(result.intercepted,true);assert.equal(result.debt,5);assert.equal(debt(room),60);
  assert.equal(room.augurReactions[0].outcome.reduction,25);
});

test('Augur binding validates targets at lock and execution and never restores intervention budget',()=>{
  for(const target of ['monster','missing','p0','p2']) {
    const {room}=makeAugurFixture(['augur','warrior','mage']);room.players.p2.hp=0;room.checkTurnCompletion=()=>{};
    assert.equal(room.lockAction('p0','aug_bind',target).success,false,target);
  }
  {
    const {room}=makeAugurFixture(),a=room.players.p0;
    Object.assign(a,{action:'aug_bind',targetPlayerId:'p1',augurIntervenedThisRound:true,augurCardState:'reversed'});
    room.p8Action(a,n=>({dmg:n}),1,[],[]);
    assert.equal(a.augurCardState,'empty');assert.equal(a.augurIntervenedThisRound,true);
    assert.equal(withAugurRandom(.1,()=>room.interveneNegative(room.players.p1,'失誤',20)).intercepted,false);
  }
  {
    const {room}=makeAugurFixture(['augur','warrior','mage']),a=room.players.p0;
    Object.assign(a,{action:'aug_bind',targetPlayerId:'p2'});room.players.p2.hp=0;
    assert.equal(room.p8Action(a,n=>({dmg:n}),1,[],[]).outcome.type,'invalid');assert.equal(a.observedTargetId,'p1');
  }
  {
    const {room}=makeAugurFixture(['augur']);room.checkTurnCompletion=()=>{};
    assert.equal(room.lockAction('p0','aug_bind').success,true);assert.equal(room.players.p0.targetPlayerId,'p0');
  }
});

test('Augur binding priority applies before bard backlash and all following damage bases',()=>{
  const f=makeAugurFixture(['augur','warrior','bard']);Object.assign(f.room.players.p0,{action:'aug_bind',targetPlayerId:'p2'});f.room.players.p2.action='b_buff';
  const queue=f.resolve(.1),buff=action(queue,'b_buff','p2');
  assert.equal(buff.outcome.type,'normal');assert.equal(debt(f.room),20);
  assert.equal(buff.augurReactions[0].outcome.reduction,25);
});

test('Augur alchemist basic gives negative interception priority over its positive effect',()=>{
  for(const [roll,card,expectedDebt] of [[.25,'reversed',20],[.8,'upright',0]]) {
    const f=makeAugurFixture(['augur','alchemist']);f.room.players.p1.action='basic';const step=action(f.resolve(roll),'basic');
    assert.equal(f.room.players.p0.augurCardState,card);assert.equal(debt(f.room),expectedDebt);
    assert.equal(step.augurReactions.filter(r=>['aug_reverse','aug_upright'].includes(r.actionId)).length,1);
    if(card==='reversed')assert(!step.hpSnapshot.players.some(p=>p.statuses.some(s=>s.id==='corrosion')));
    else assert.equal(step.augurReactions[0].outcome.finalChance,85);
  }
});

test('Augur positive whitelist covers dream confusion, planet stun and assassin pursuit crit',()=>{
  {
    const f=makeAugurFixture(['augur','dreamweaver']);f.room.players.p1.action='basic';const step=action(f.resolve(.6),'basic');
    assert.equal(step.augurReactions[0].outcome.finalChance,65);assert.equal(f.room.players.p0.augurCardState,'upright');
  }
  {
    const f=makeAugurFixture(['augur','stargazer']);f.room.players.p1.action='sg_observe';const step=action(f.resolve([.65,.2]),'sg_observe');
    assert.equal(step.outcome.type,'planet');assert.equal(step.outcome.stunned,true);assert.equal(step.augurReactions[0].outcome.finalChance,25);
  }
  {
    const {room}=makeAugurFixture(['augur','assassin','warrior']),queue=[];
    Object.assign(room.players.p1,{isHiddenThisRound:true,stealthBrokenThisRound:false});
    withAugurRandom([.1,.6],()=>room.resolveAssassinFollowUps(room.players.p2,queue,[],1,n=>({dmg:n})));
    assert.equal(queue[0].isCritical,true);assert.equal(queue[0].augurReactions[0].outcome.finalChance,65);
  }
});

test('Augur parallel blind boxes never consume fate interference',()=>{
  for(const [role,id] of [['druid','dru_transform'],['dreamweaver','dw_butterfly'],['stargazer','sg_clock'],['archer','a_reload']]) {
    const f=makeAugurFixture(['augur',role]);f.room.players.p1.action=id;f.room.players.p1.targetPlayerId='p1';
    if(role==='archer')equipAugurFixture(f.room.players.p1,'a_crossbow');
    f.resolve(.9);assert.equal(f.room.players.p0.augurCardState,'empty',id);assert.equal(debt(f.room),0,id);
  }
});

test('Augur reckon emits exact heals, bypasses remaining debt for its bonus and exposes expiry queues',()=>{
  const f=makeAugurFixture();seedAugurDebt(f.room,60);Object.assign(f.room.players.p0,{action:'aug_reckon',hp:40});f.room.players.p1.hp=50;
  const step=action(f.resolve(),'aug_reckon','p0');
  assert.equal(step.outcome.repaid,25);assert.equal(step.hpSnapshot.players[0].augurFateDebts.reduce((n,d)=>n+d.amount,0),35);
  assert.deepEqual(step.results.filter(r=>r.kind==='heal').map(r=>[r.targetId,r.actualHeal]),[['p0',10],['p1',10]]);
  assert.equal(step.hpSnapshot.players[0].hp,50);
  assert(step.hpSnapshot.monster.statuses.some(s=>s.id==='reversed_omen'));
});

test('Augur healing consumes oldest debt, records partial absorption and never fires the tome',()=>{
  const {room}=makeAugurFixture(),a=room.players.p0;equipAugurFixture(a,'aug_forbidden_tome');seedAugurDebt(room,25);a.hp=30;
  const hp=room.currentMonster.hp;room.actionHeals=[];
  assert.equal(room.applyHealCapped(a,30),5);assert.equal(a.hp,35);assert.equal(debt(room),0);
  assert.equal(room.actionHeals[0].absorbedDebt,25);assert.equal(room.currentMonster.hp,hp);
  assert.equal(room.augurReactions[0].actionId,'aug_debt_heal');
});

test('Augur tome hits are explicit, true, actual and monotonic alongside the main hit',()=>{
  const f=makeAugurFixture();equipAugurFixture(f.room.players.p0,'aug_forbidden_tome');f.room.players.p1.action='w_strike';
  const step=action(f.resolve(.1),'w_strike'),hits=step.results.filter(r=>r.kind==='damage' && r.targetId==='monster');
  assert.equal(hits.at(-1).outcome.type,'augur_tome');assert.equal(hits.at(-1).damageType,'true');assert.equal(hits.at(-1).finalDamage,10);
  let hp=step.hpSnapshotBefore.monster.hp;
  for(const hit of hits) {assert.equal(hit.targetBefore.hp,hp);hp-=hit.finalDamage;assert.equal(hit.targetAfter.hp,hp);}
  assert.equal(hp,step.hpSnapshot.monster.hp);assert.equal(step.augurReactions[0].actionId,'aug_reverse');
});

test('Augur expiry ignores shields, may kill and carries full before/after snapshots',()=>{
  const {room}=makeAugurFixture(),a=room.players.p0,queue=[];seedAugurDebt(room,20);room.battleRound=3;Object.assign(a,{hp:10,tempHp:50});
  room.p8EndRound(queue,[],n=>({dmg:n}));const step=queue.find(s=>s.actionId==='aug_expiry');
  assert.equal(a.hp,0);assert.equal(a.tempHp,50);assert.equal(debt(room),0);
  assert.equal(step.results[0].finalDamage,10);assert.equal(step.outcome.expired,20);assert.equal(step.hpSnapshotBefore.players[0].hp,10);assert.equal(step.hpSnapshot.players[0].hp,0);
});

test('Augur killing the boss clears debt before expiry, including a lone survivor',()=>{
  const f=makeAugurFixture(['augur']);seedAugurDebt(f.room,20);f.room.battleRound=3;Object.assign(f.room.players.p0,{hp:5,action:'basic'});f.room.currentMonster.hp=1;
  const queue=f.resolve();assert.equal(f.room.currentMonster.hp,0);assert.equal(f.room.players.p0.hp,5);assert.equal(debt(f.room),0);
  assert(!queue.some(s=>s.category==='DEBT_EXPIRY'));assert.equal(queue.at(-1).hpSnapshot.players[0].augurFateDebts.length,0);
});

test('Augur starbreaker only triggers on actual direct magic damage, excluding dream conversions',()=>{
  for(const dreamOutcome of ['dream_heal','nightmare']) {
    const f=makeAugurFixture();f.room.players.p0.action='basic';
    f.room.p8Effect(f.room.currentMonster,'dream_butterfly','夢境',2,{dreamOutcome},true);
    const step=action(f.resolve(),'basic','p0');
    assert.equal(step.hpSnapshot.monster.augurResistanceBreak,0,dreamOutcome);
  }
});

test('Augur observation strengthens Onmyoji direct detonation while its parallel talisman draw stays untouched',()=>{
  const f=makeAugurFixture(['augur','onmyoji']);f.room.players.p1.action='onm_detonate';f.room.currentMonster.talismans=['blind','seal'];
  const step=action(f.resolve(),'onm_detonate');assert.equal(step.finalDamage,19); // round((10+2*3)*1.2)
  assert.equal(f.room.players.p0.augurCardState,'empty');
});

test('Augur omen increases DoT and independent equation damage without blessing those formulas',()=>{
  {
    const f=makeAugurFixture();Object.assign(f.room.currentMonster,{poisonTurns:2,poisonDmg:100,reversedOmenRemaining:2,reversedOmenBonus:10});
    f.roundStart();assert.equal(f.room.currentMonster.hp,390);
  }
  {
    const f=makeAugurFixture(['augur','sage']);Object.assign(f.room.currentMonster,{reversedOmenRemaining:2,reversedOmenBonus:10});
    Object.assign(f.room.players.p1,{action:'basic',sagePhase:'solve',sageOperand:17,sageX:30});
    const equation=action(f.resolve(),'sge_equation');
    assert.equal(equation.outcome.actualBossDamage,Math.floor(equation.outcome.equationDamage*1.1));
    assert.equal(equation.outcome.baseEquationDamage,Math.round(equation.outcome.operand*equation.outcome.eta));
  }
});

test('Augur observation and reselection are real round-start events',()=>{
  const f=makeAugurFixture(['augur','mage','warrior']);withAugurRandom(.9,()=>f.room.p8ResetBattle());
  const first=f.roundStart().find(s=>s.actionId==='aug_observe');assert.equal(first.targetId,'p1');
  f.room.players.p1.hp=0;f.room.battleRound=2;
  const second=f.roundStart().find(s=>s.actionId==='aug_observe');assert.equal(second.targetId,'p2');
});

test('Augur lab is reproducible real settlement data, covering failure, caps, equipment and death',()=>{
  const scenes=buildAugurLabScenes();assert(Object.keys(scenes).length>=25);
  for(const scene of Object.values(scenes)) {assert(scene.steps.length>0,scene.label);assert(scene.expected);for(const step of scene.steps){assert(step.hpSnapshotBefore);assert(step.hpSnapshot);}}
  const source=fs.readFileSync(new URL('../public/augur-lab-scenes.js',import.meta.url),'utf8');assert.equal(source.replace(/\r\n/g,'\n'),augurLabSource());
  const context=vm.createContext({});vm.runInContext(source+';globalThis.scenes=AUGUR_LAB_SCENES;',context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.scenes)),JSON.parse(JSON.stringify(scenes)));
});

test('Augur presentation plans preserve zero values, exact repayments, failures and official portrait names',()=>{
  const source=fs.readFileSync(new URL('../public/augur-presentation.js',import.meta.url),'utf8'),context=vm.createContext({});
  vm.runInContext(source,context);
  const plan=context.buildAugurPresentationPlan({actionId:'aug_reckon',outcome:{repaid:3},results:[{kind:'damage',targetId:'monster',finalDamage:0},{kind:'heal',actualHeal:0}]});
  assert.equal(plan.repaid,3);assert.equal(plan.hits[0].finalDamage,0);assert.equal(plan.heals[0].actualHeal,0);
  assert.equal(context.augurPortrait({role:'sage'}).src,'/photo/智者.webp');assert.equal(context.augurPortrait({role:'samurai'}).src,'/photo/武士.webp');
});
