import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { CLASSES, LOOT_TABLE, equipItemToPlayer } from '../game/constants.js';
import { ASSASSIN_BALANCE, addAssassinCritical, assassinCritRate, getAssassinFollowUpCap } from '../game/assassin.js';
function setup(t, count=2) {
 const events=[]; const socket=id=>({id,join(){}});
 const room=new Room('SHADOW',socket('a'),'刺客',{to:()=>({emit:(name,data)=>events.push({name,data})})});
 room.selectRole('a','assassin');
 for(let i=0;i<count;i++){room.addPlayer(socket('p'+i),'同伴'+i);room.selectRole('p'+i,'warrior');room.players['p'+i].action='basic';}
 room.state='IN_BATTLE';room.currentMonster={name:'守衛',avatar:'/BOSS/Ancient Guardian Golem.webp',hp:2000,maxHp:2000,attack:4,resistance:null,baseHp:80};
 room.players.a.action='skip';t.after(()=>room.clearTimer());
 return {room,p:room.players.a,queue:()=>events.findLast(e=>e.name==='battle:presentation_queue')?.data.queue};
}
function roll(fn,n=.1){const old=Math.random;Math.random=()=>n;try{return fn();}finally{Math.random=old;}}
function hidden(p){p.stealthStacks=3;p.isHiddenThisRound=true;p.stealthBrokenThisRound=false;}
function equip(p,id,n=1){for(let i=0;i<n;i++)equipItemToPlayer(p,structuredClone(LOOT_TABLE.find(e=>e.id===id)));}
test('base HP 50 with preserved crit and vulnerable multiplier',t=>{const {p}=setup(t);assert.equal(p.hp,50);assert.equal(CLASSES.assassin.critRate,.5);assert.equal(CLASSES.assassin.vulnerableMod,1.25);});
test('crit accumulator supports carry and does not re-hide',()=>{const p={stealthBrokenThisRound:true,isHiddenThisRound:false};assert.equal(addAssassinCritical(p,3),1);assert.equal(p.critTowardStealth,1);assert.equal(addAssassinCritical(p),1);assert.equal(p.stealthStacks,2);assert.equal(p.isHiddenThisRound,false);});
for(const [action,n,damage] of [['basic',.1,20],['basic',.9,10],['s_stab',.1,70],['s_stab',.9,35]])test(`${action} authoritative damage ${damage} and crit accumulation`,t=>{const {room,p,queue}=setup(t,0);p.action=action;roll(()=>room.resolveTurnActions(),n);const s=queue().find(s=>s.type==='player_action');assert.equal(s.finalDamage,damage);assert.equal(p.critTowardStealth,n===.1?1:0);if(action==='s_stab')assert.equal(p.cooldowns.s_stab,n===.1?0:1);});
for(let stacks=0;stacks<=5;stacks++)test(`skill 2 consumes ${stacks} stacks for ${30+15*stacks}`,t=>{const {room,p,queue}=setup(t,0);hidden(p);p.stealthStacks=stacks;p.action='s_smoke';roll(()=>room.resolveTurnActions());const s=queue().find(s=>s.actionId==='s_smoke');assert.equal(s.finalDamage,30+15*stacks);assert.equal(s.consumedStacks,stacks);assert.equal(p.stealthStacks,0);assert.equal(p.isHiddenThisRound,false);assert.equal(s.isCritical,false);assert.equal(ASSASSIN_BALANCE.skill2CanCrit,null);});
test('active attack breaks hidden without consuming stacks and prevents same-round rehide',t=>{const {room,p,queue}=setup(t);hidden(p);p.critTowardStealth=1;p.action='s_stab';roll(()=>room.resolveTurnActions());assert.equal(p.isHiddenThisRound,false);assert.equal(p.stealthBrokenThisRound,true);assert.equal(p.stealthStacks,4);assert.equal(queue().filter(s=>s.category==='FOLLOW_UP').length,0);assert.ok(p.hp<50);});
for(const copies of [0,1,2,3])test(`blade ${copies} copies has unique crit and bounded cap`,t=>{const {room,p,queue}=setup(t,6);equip(p,'s_blade',copies);hidden(p);roll(()=>room.resolveTurnActions());const cap=2+Math.max(0,copies-1);assert.equal(getAssassinFollowUpCap(p),cap);assert.equal(assassinCritRate(p),copies?.8:.5);assert.equal(queue().filter(s=>s.category==='FOLLOW_UP').length,cap);assert.equal(p.followUpsThisRound,cap);assert.equal(p.isHiddenThisRound,true);assert.equal(p.stealthBrokenThisRound,false);});
test('fourth blade cannot increase follow-up cap above 4',()=>assert.equal(getAssassinFollowUpCap({equips:Array(4).fill({id:'s_blade'})}),4));
test('follow-up fixed 50% crit independent of blade; chance failure has no count',t=>{const {room,p,queue}=setup(t,4);hidden(p);roll(()=>room.resolveTurnActions(),.9);assert.equal(p.followUpsThisRound,0);assert.equal(queue().some(s=>s.category==='FOLLOW_UP'),false);});
test('follow-ups occur after each ally action, do not recurse and gain stacks',t=>{const {room,p,queue}=setup(t,2);hidden(p);roll(()=>room.resolveTurnActions());const q=queue().filter(s=>s.type==='player_action'||s.category==='FOLLOW_UP');assert.deepEqual(q.map(s=>s.sourceId),['p0','a','p1','a']);assert.equal(p.stealthStacks,4);assert.equal(p.critTowardStealth,0);assert.equal(q[1].finalDamage,20);assert.equal(q[3].gainedStacks,1);});
test('minion auto attacks never roll a follow-up and do not recurse',t=>{const {room,p,queue}=setup(t,1);hidden(p);room.players.p0.action='skip';room.players.p0.minions=[{id:'m',hp:10,maxHp:10,atk:5,type:'wolf',name:'狼'}];roll(()=>room.resolveTurnActions());assert.equal(queue().filter(s=>s.category==='FOLLOW_UP').length,0);assert.equal(queue().filter(s=>s.category==='MINION_ATTACK').length,1);});
test('round reset -> decay -> hidden precedes poison and bleed; timer waits for viewers',t=>{const {room,p,queue}=setup(t);hidden(p);room.battleRound=3;p.followUpsThisRound=2;p.stealthBrokenThisRound=true;p.poisonTurns=2;p.poisonDmg=5;p.bleedTurns=2;roll(()=>room.executeRoundStart());assert.equal(p.stealthStacks,2);assert.equal(p.followUpsThisRound,0);assert.equal(p.isHiddenThisRound,true);assert.equal(p.hp,50);assert.equal(p.poisonTurns,1);assert.equal(p.bleedTurns,1);assert.ok(queue()[0].results.filter(r=>r.outcome?.stealth).length===2);assert.equal(room.turnTimer,null);assert.equal(room.selectionState,'RESOLVING');});
test('last stack decays to zero before DoT, downed assassin never decays',t=>{const {room,p}=setup(t);room.battleRound=3;p.stealthStacks=1;p.poisonTurns=2;p.poisonDmg=5;roll(()=>room.executeRoundStart());assert.equal(p.stealthStacks,0);assert.equal(p.isHiddenThisRound,false);assert.equal(p.hp,45);p.hp=0;room.clearPlayerDebuffs(p);p.stealthStacks=3;room.executeRoundStart();assert.equal(p.stealthStacks,3);assert.equal(p.isHiddenThisRound,false);});
test('hidden AoE and bounce immunity keep target and independent MISS result',t=>{const {room,p,queue}=setup(t);hidden(p);room.battleRound=3;roll(()=>room.resolveTurnActions(),.9);const boss=queue().find(s=>s.type==='boss_action');assert.ok(boss.results.some(r=>r.targetId==='a'&&r.outcome.stealth));assert.equal(p.hp,50);assert.ok(room.players.p0.hp<120);});
test('hidden friendly fire immunity carries server dodge outcome',t=>{const {room,p,queue}=setup(t,1);hidden(p);room.players.p0.role='archer';room.players.p0.action='a_rain';roll(()=>room.resolveTurnActions());const s=queue().find(s=>s.actionId==='a_rain');assert.ok(s.results.some(r=>r.targetId==='a'&&r.outcome.stealth));assert.equal(p.hp,50);});
test('assassin trap evade is unconditional, authoritative and HP unchanged',t=>{const {room,p}=setup(t);roll(()=>room.handleTrapEvent());const hit=room.currentEvent.hits.find(h=>h.targetId==='a');assert.equal(hit.damage,0);assert.equal(hit.outcome.type,'assassin_trap_evade');assert.equal(p.hp,50);});
for(const [action,n,expected] of [['basic',.9,20],['s_stab',.1,90],['s_smoke',.9,55]])test(`shadow armor applies flat pipeline to ${action}`,t=>{const {room,p,queue}=setup(t,0);equip(p,'s_armor');p.action=action;roll(()=>room.resolveTurnActions(),n);assert.equal(queue().find(s=>s.type==='player_action').finalDamage,expected);assert.equal(p.maxHp,40);assert.equal(p.equips[0].bonusDodge,undefined);});
test('shadow armor boosts follow-up; exhaustion prevents follow-up',t=>{const {room,p,queue}=setup(t,2);equip(p,'s_armor');hidden(p);roll(()=>room.resolveTurnActions());assert.equal(queue().find(s=>s.category==='FOLLOW_UP').finalDamage,40);p.nextTurnStunFlag=true;p.followUpsThisRound=0;roll(()=>room.resolveTurnActions());assert.equal(queue().some(s=>s.category==='FOLLOW_UP'),false);});
test('natural resonance does not heal minions',t=>{const {room,p}=setup(t);room.players.p0.role='druid';equip(room.players.p0,'dru_resonance');room.players.p0.minions=[{id:'m',hp:2,maxHp:20,atk:5}];room.executeRoundStart();assert.equal(room.players.p0.minions[0].hp,2);assert.ok(!room.logs.some(l=>l.text.includes('自然共鳴')));});
test('victory keeps complete stacks, resets partial progress; floor revive does not decay',t=>{const {room,p}=setup(t);hidden(p);p.critTowardStealth=1;room.handleMonsterVictory();assert.equal(p.stealthStacks,3);assert.equal(p.critTowardStealth,0);assert.equal(p.isHiddenThisRound,false);p.hp=0;room.clearPlayerDebuffs(p);room.floor=2;room.startRouteSelection();assert.equal(p.stealthStacks,3);assert.equal(p.isHiddenThisRound,false);assert.ok(p.hp>0);});

test('normal follow-up uses 10 damage, counts once, keeps hidden and crit progress',t=>{const {room,p,queue}=setup(t,1);hidden(p);let calls=0;const old=Math.random;Math.random=()=>calls++===0?.1:.9;try{room.resolveTurnActions();}finally{Math.random=old;}const follow=queue().find(s=>s.category==='FOLLOW_UP');assert.equal(follow.finalDamage,10);assert.equal(follow.isCritical,false);assert.equal(p.critTowardStealth,0);assert.equal(p.followUpsThisRound,1);assert.equal(p.isHiddenThisRound,true);});
test('capped assassin performs no further trigger rolls',t=>{const {room,p}=setup(t,4);hidden(p);p.followUpsThisRound=2;let calls=0;const old=Math.random;Math.random=()=>{calls++;return .1;};try{room.resolveAssassinFollowUps(room.players.p0,[],[],1,raw=>({dmg:raw}));}finally{Math.random=old;}assert.equal(calls,0);});
test('lethal follow-up is queued before kill and victory waits for all viewers',t=>{const {room,p,queue}=setup(t,1);hidden(p);room.currentMonster.hp=25;roll(()=>room.resolveTurnActions());const q=queue();assert.equal(q.find(s=>s.category==='FOLLOW_UP').isLethal,true);assert.equal(q.at(-1).type,'kill');assert.equal(room.state,'IN_BATTLE');room.handlePresentationComplete('a',room.battlePresentationId,1);assert.equal(room.state,'IN_BATTLE');room.handlePresentationComplete('p0',room.battlePresentationId,1);assert.equal(room.state,'BATTLE_VICTORY');});
test('bard same-floor revival preserves stacks without granting hidden or bypassing exhaustion',t=>{const {room,p}=setup(t,1);p.stealthStacks=3;p.hp=0;room.clearPlayerDebuffs(p);room.players.p0.role='bard';room.players.p0.action='b_revive';room.players.p0.targetPlayerId='a';roll(()=>room.resolveTurnActions());assert.equal(p.stealthStacks,3);assert.equal(p.isHiddenThisRound,false);assert.equal(p.stunnedNextTurn,true);assert.ok(p.hp>0);});

test('assassin guaranteed critical on first damage of round 1 of first battle even with high random roll', t => {
  const { room, p, queue } = setup(t, 0);
  room.battleCount = 1;
  room.battleRound = 1;
  p.hasDealtFirstBattleCrit = false;
  p.action = 'basic';
  // Math.random returns 0.99 (would normally never crit since critRate is 0.5)
  roll(() => room.resolveTurnActions(), 0.99);
  const s = queue().find(s => s.type === 'player_action');
  assert.equal(s.isCritical, true);
  assert.equal(s.finalDamage, 20); // 10 * 2 = 20
  assert.equal(p.hasDealtFirstBattleCrit, true);

  // Subsequent attack in round 1 should NOT be guaranteed crit
  room.battlePresentationAcks = new Set();
  room.currentMonster.hp = 2000;
  p.action = 'basic';
  roll(() => room.resolveTurnActions(), 0.99);
  const s2 = queue().find(s => s.type === 'player_action');
  assert.equal(s2.isCritical, false);
  assert.equal(s2.finalDamage, 10);
});
