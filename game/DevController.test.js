import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { DevAccess } from './DevAccess.js';
import { DevController } from './DevController.js';
import { DEV_ENEMIES } from './DevEncounter.js';
import { CLASSES, LOOT_TABLE, TIER1_EQUIPMENTS, getPlayerSkills } from './constants.js';
import { rollDruidForm, enterBearForm, restoreBearForm } from './druid.js';
import { randomRoleOptions, resolveRoleRandom, roleRandomSnapshot, reserveRoleRandom } from './DevRoleRandom.js';
import { resolveStats } from './stats.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { roleResources, DEV_ROLE_POLICY } from './DevRoleResources.js';

function setup(t, role = 'warrior') {
  const socket = { id: 'solo', join() {}, emit() {} };
  const room = new Room('TEST1', socket, 'Tester', { to: () => ({ emit() {} }) });
  room.selectRole('solo', role);
  room.isDev = true;
  const access = new DevAccess({ DEV_TOOLS_ENABLED: 'true', DEV_ACCESS_TOKEN: 'test-secret-123456789' });
  const controller = new DevController(access);
  controller.register(room, socket);
  room.startAdventure('solo', { skipPrepShop: true });
  room.handlePrologueComplete('solo');
  room.handleRouteNarrativeDone('solo', room.routePresentationId);
  access.authorize(socket, room, 'test-secret-123456789');
  t.after(() => room.clearTimer());
  let n = 0;
  const request = (command = 'gold.add', params = { value: 10 }) => ({ id: `r${++n}`, roomCode: room.code, context: controller.context(room), command, params });
  return { room, socket, access, controller, request };
}

function randomBattle(t,role='druid') {
  const f=setup(t,role),{room}=f;
  room.handleBattleEvent(null,false,{col:1,enemies:[{name:'確定性測試目標',hp:5000,attack:0,baseResistances:{physical:0,magic:0,effect:0},noBonusResistance:true}],rng:()=>.5});
  if(room.selectionState==='RESOLVING')room.handlePresentationComplete('solo',room.battlePresentationId,room.battleRound);
  room.handleSelectionReady('solo',room.battleRound);
  const m=room.currentMonster;m.hp=m.maxHp=5000;m.attack=0;m.resistances={physical:0,magic:0,effect:0};m.DEF=0;
  const events=[];room.io={to:()=>({emit:(...args)=>events.push(args)})};
  f.player=room.players.solo;f.events=events;
  f.reserve=(skill,outcome)=>f.controller.execute(f.socket,room,f.request('role.random.reserve',{playerId:'solo',skill,outcome}));
  f.cast=action=>{const completion=room.checkTurnCompletion;room.checkTurnCompletion=()=>{};let result;try{result=room.lockAction('solo',action);}finally{room.checkTurnCompletion=completion;}if(result.success)room.resolveTurnActions();return result;};
  f.ack=()=>{for(let i=0;i<4&&room.selectionState==='RESOLVING';i++)room.handlePresentationComplete('solo',room.battlePresentationId,room.battleRound);room.handleSelectionReady('solo',room.battleRound);};
  return f;
}
const beast=()=>structuredClone([...TIER1_EQUIPMENTS,...LOOT_TABLE].find(e=>e.id==='dru_beast'));

test('Druid natural form partitions are exactly halves or thirds, without chance sampling',()=>{
  const p={equips:[]};
  for(const [r,expected] of [[0,'werewolf'],[.499999,'werewolf'],[.5,'treant'],[.999999,'treant']])assert.equal(rollDruidForm(p,()=>r),expected);
  p.equips=[beast()];
  for(const [r,expected] of [[0,'werewolf'],[1/3-1e-9,'werewolf'],[1/3,'treant'],[2/3-1e-9,'treant'],[2/3,'bear'],[.999999,'bear']])assert.equal(rollDruidForm(p,()=>r),expected);
});

test('Bear uses typed physical A and effective D, records and restores only its temporary HP delta',()=>{
  const p={role:'druid',hp:60,maxHp:100,DEF:8,ATK_base:12,equips:[{bonusDef:5,bonusPhysAtk:4,bonusMagAtk:30}],enemyEffects:{acid_defense:{value:.25}}};
  const d=resolveStats(p,.5).DEF;
  enterBearForm(p,.5);
  assert.equal(p.bearMaxHpAdded,2*d);assert.equal(p.hp,60+2*d);assert.equal(p.maxHp,100+2*d);assert.equal(p.druidForm,'bear');assert.equal(p.druidFormTurns,2);
  // Another temporary/equipment HP delta must survive the form exit.
  p.maxHp+=20;p.hp+=20;restoreBearForm(p);assert.equal(p.maxHp,120);assert.equal(p.hp,80);
  restoreBearForm(p);assert.equal(p.maxHp,120);assert.equal(p.hp,80);
  enterBearForm(p);p.hp=1;restoreBearForm(p);assert.equal(p.hp,1);
  enterBearForm(p);p.hp=0;restoreBearForm(p);assert.equal(p.hp,0);assert.equal(p.maxHp,120);
});

test('Dev bear reservation survives a basic attack, applies real form and waits for Presentation ACK',t=>{
  const f=randomBattle(t),{room,controller:c,socket}=f;
  assert.equal(f.reserve('dru_transform','bear').success,false);
  const p=room.players.solo;
  p.equips=[beast()];room.p8GrantShield(p,1000,10);const hp=p.hp,max=p.maxHp,def=resolveStats(p,room.statMultiplier(p)).DEF;
  assert.equal(f.reserve('dru_transform','bear').success,true);
  assert.equal(f.cast('basic').success,true);assert.ok(roleRandomSnapshot(room).pending.solo);f.ack();
  {const cast=f.cast('dru_transform');assert.equal(cast.success,true,cast.message);}
  assert.equal(p.druidForm,'bear');assert.equal(p.maxHp,max+2*def);assert.equal(p.hp,hp+2*def);assert.equal(room.skillValue(p,'basic'),10+room.resolveSkillAttack(p,'phys'));
  assert.equal(p.druidFormTurns,1);assert.equal(roleRandomSnapshot(room).pending.solo,undefined);assert.equal(roleRandomSnapshot(room).last.solo.outcome,'bear');
  const queue=f.events.filter(e=>e[0]==='battle:presentation_queue').at(-1)[1].queue;
  const transform=queue.find(s=>s.actionId==='dru_transform').results.find(r=>r.kind==='transform');
  assert.equal(transform.targetAfter.druidForm,'bear');assert.equal(transform.targetAfter.maxHp,max+2*def);
  assert.equal(room.selectionState,'RESOLVING');assert.ok(room.pendingPresentationAcks.size);
  assert.equal(c.inspect(socket,room).locked,true);
  assert.equal(JSON.stringify(room.getClientState()).includes('roleRandom'),false);
  f.ack();assert.equal(f.cast('basic').success,true);assert.equal(p.druidForm,null);assert.equal(p.maxHp,max);assert.equal(p.hp,hp);assert.equal(room.skillValue(p,'basic'),Math.round(5+.5*room.resolveSkillAttack(p,'phys')));
  assert.ok(c.inspect(socket,room).audit.some(e=>e.command==='role.random.consume'));
});

test('Dev random reservations are one-shot, cancelable, private, rollback-safe and authorization-bound',t=>{
  const {room,player:p,reserve,controller:c,socket,request,access}=randomBattle(t);
  p.equips=[beast()];assert.equal(reserve('dru_transform','bear').success,true);
  c.commands.set('broken.random',{keys:[],validate:()=>true,run:r=>{reserveRoleRandom(r,{playerId:'solo',skill:'dru_transform',outcome:'treant'});r.gold=-1;}});
  assert.equal(c.execute(socket,room,request('broken.random',{})).success,false);
  assert.equal(roleRandomSnapshot(room).pending.solo.outcome,'bear');assert.equal(Object.hasOwn(room,'roleRandom'),false);
  let fallback=0;
  assert.equal(resolveRoleRandom(room,room.players.solo,'dru_transform',()=>{fallback++;return 'werewolf';}),'bear');
  assert.equal(resolveRoleRandom(room,room.players.solo,'dru_transform',()=>{fallback++;return 'werewolf';}),'werewolf');assert.equal(fallback,1);
  assert.equal(reserve('dru_transform','bear').success,true);
  assert.equal(c.execute(socket,room,request('role.random.clear',{playerId:'solo'})).success,true);
  assert.equal(resolveRoleRandom(room,room.players.solo,'dru_transform',()=> 'treant'),'treant');
  reserve('dru_transform','bear');access.revoke(socket);
  assert.equal(roleRandomSnapshot(room).pending.solo,undefined);
  assert.equal(reserve('dru_transform','bear').success,false);
  assert.equal(resolveRoleRandom(room,room.players.solo,'dru_transform',()=> 'werewolf'),'werewolf');
});

test('Dev rejects role/skill/outcome mismatches, ordinary rooms and removed equipment; invalid actions keep reservations',t=>{
  const f=randomBattle(t),{room}=f;room.players.solo.equips=[beast()];
  for(const [skill,outcome] of [['m_blast','negative'],['dru_transform','dragon'],['__proto__','bear']])assert.equal(f.reserve(skill,outcome).success,false);
  assert.equal(f.controller.execute(f.socket,room,f.request('role.random.reserve',{playerId:'absent',skill:'dru_transform',outcome:'bear'})).success,false);
  assert.equal(f.reserve('dru_transform','bear').success,true);
  const p=room.players.solo;
  p.hp=0;assert.equal(f.cast('dru_transform').success,false);assert.ok(roleRandomSnapshot(room).pending.solo);p.hp=80;
  p.stunnedNextTurn=true;assert.equal(f.cast('dru_transform').success,false);assert.ok(roleRandomSnapshot(room).pending.solo);p.stunnedNextTurn=false;
  p.druidFormTurns=1;assert.equal(f.cast('dru_transform').success,false);assert.ok(roleRandomSnapshot(room).pending.solo);p.druidFormTurns=0;
  p.equips=[];assert.equal(resolveRoleRandom(room,p,'dru_transform',()=> 'treant'),'treant');assert.ok(roleRandomSnapshot(room).pending.solo);
  assert.equal(f.cast('dru_transform').success,true);assert.notEqual(p.druidForm,'bear');assert.ok(roleRandomSnapshot(room).pending.solo);
  room.isDev=false;assert.equal(f.reserve('dru_transform','werewolf').success,false);assert.equal(resolveRoleRandom(room,p,'dru_transform',()=> 'werewolf'),'werewolf');assert.equal(roleRandomSnapshot(room).pending.solo,undefined);
});

test('Bear cleanup on restart, death and victory is bounded and idempotent',t=>{
  for(const exit of ['restart','death','victory']){
    const {room,player:p}=randomBattle(t);const base=p.maxHp;enterBearForm(p);assert.ok(p.maxHp>base);
    if(exit==='restart'){room.restartToLobby('solo');assert.equal(p.maxHp,CLASSES.druid.maxHp);assert.equal(p.bearMaxHpAdded,0);}
    else if(exit==='death'){room.applyDamageToPlayer(p,1000,{trueDamage:true});assert.equal(p.maxHp,base);assert.equal(p.hp,0);assert.equal(p.druidForm,null);room.clearPlayerDebuffs(p);assert.equal(p.maxHp,base);}
    else {room.handleMonsterVictory();assert.equal(p.maxHp,base+10);assert.equal(p.bearMaxHpAdded,0);}
  }
});

test('Alchemist stable branch keeps reservation and sleep success cannot bypass enemy immunity',t=>{
  const f=randomBattle(t,'alchemist');assert.equal(f.reserve('alc_fate','success').success,false,JSON.stringify(randomRoleOptions(f.room,f.room.players.solo)));
  f.player=f.room.players.solo;
  f.player.poisonTurns=2;assert.equal(f.reserve('alc_fate','success').success,true);f.player.poisonTurns=0;
  f.cast('alc_fate');assert.ok(roleRandomSnapshot(f.room).pending.solo);assert.ok(!f.events.filter(e=>e[0]==='battle:presentation_queue').at(-1)[1].queue.some(s=>s.outcome?.type==='alchemy_success'));
  const b=randomBattle(t,'bard');b.player.equips=[{id:'b_violin'}];
  assert.ok(randomRoleOptions(b.room,b.player).some(o=>o.key==='b_nocturne'));
  b.room.currentMonster.tier='ELITE';b.room.currentMonster.resistances.effect=100;
  assert.equal(b.reserve('b_nocturne','success').success,true);b.cast('b_nocturne');
  assert.notEqual(b.room.currentMonster.stunnedThisRound,true);
});

test('Whitelisted cast decisions produce real authoritative outcomes across professions',t=>{
  const rows=[
    ['warrior','w_strike','negative','w_strike','imbalance'],['warrior','w_shield','negative','w_shield','shield_crack'],
    ['mage','m_blast','negative','m_blast','misfire'],['mage','m_drain','1','m_drain','normal'],
    ['bard','b_heal','negative','b_heal','off_key'],
    ...['poison','burn','fracture','chill'].map(o=>['alchemist','alc_flask',o,'alc_flask','alchemy_'+o]),
    ...['success','failure'].map(o=>['alchemist','alc_fate',o,'alc_fate','alchemy_'+o]),
    ...['star','planet','galaxy','blackhole','boundary'].map(o=>['stargazer','sg_observe',o,'sg_observe',o]),
    ...['accelerate','reset','overload','nothing'].map(o=>['stargazer','sg_clock',o,'sg_clock',o]),
    ...['blind','seal','corrode','confuse','drain'].map(o=>['onmyoji','onm_talisman',o,'onm_talisman','talisman_'+o]),
    ...['success','failure'].flatMap(o=>[['assassin','basic',o,'basic',o==='success'?'critical':'normal'],['assassin','s_stab',o,'s_stab',o==='success'?'critical':'normal'],['samurai','sa_cut',o,'sa_cut',o==='success'?'soul_burst':'normal']]),
    ...['shallow','deep','lone','horde'].map(o=>['dreamweaver','dw_false_dream',o,'dw_false_dream',o])
  ];
  for(const [role,key,outcome,action,expected] of rows){
    const f=randomBattle(t,role),{room,player:p}=f;
    if(role==='assassin')room.battleCount=2;
    if(role==='samurai')p.soul=2;
    if(key==='alc_fate')p.poisonTurns=2;
    assert.equal(f.reserve(key,outcome).success,true,`${role}/${key}/${outcome}`);
    assert.equal(f.cast(action).success,true,`${role}/${key} cast`);
    const matching=f.events.filter(e=>e[0]==='battle:presentation_queue').at(-1)[1].queue.filter(s=>s.sourceId===p.id&&[action,action+'_result'].includes(s.actionId));
    const step=matching.find(s=>s.outcome?.type===expected)||matching[0];
    assert.ok(step,`${role}/${key} event`);
    if(role==='assassin')assert.equal(Boolean(step.isCritical||step.isCrit||step.outcome?.type==='critical'),outcome==='success',`${key} critical`);
    else assert.equal(step.outcome.type,expected,`${role}/${key}`);
    assert.equal(roleRandomSnapshot(room).pending.solo,undefined,`${role}/${key} consume`);
    assert.ok(step.results.length,`${role}/${key} authoritative results`);
  }
});

test('Arrow misses create the real trap, reload uses real ammo, and numeric values stay in range',t=>{
  for(const outcome of ['hit','miss']){
    const f=randomBattle(t,'archer');assert.equal(f.reserve('a_rain',outcome).success,true);f.cast('a_rain');
    assert.equal(f.room.arrowTrap?.missArrows||0,outcome==='miss'?10:0);
    assert.equal(roleRandomSnapshot(f.room).last.solo.outcome,outcome);
  }
  const f=randomBattle(t,'archer');f.player.equips=[{id:'a_crossbow'}];
  assert.equal(f.reserve('a_reload','burst').success,true);f.cast('a_reload');assert.deepEqual(f.player.ammo,['burst']);
  const m=randomBattle(t,'mage'),max=m.room.skillValue(m.player,'m_drain_max');
  assert.equal(m.reserve('m_drain',String(max+1)).success,false);assert.equal(m.reserve('m_drain','0').success,false);
  assert.equal(m.reserve('m_drain',String(max)).success,true);
  assert.equal(resolveRoleRandom(m.room,m.room.players.solo,'m_drain',()=>0),String(max));
});

test('Passive and round reservations wait for their exact legal decision and reset clears them',t=>{
  const s=randomBattle(t,'sage');assert.equal(s.reserve('sage_operand','30').success,true);
  s.player.sageCycleRound=1;s.room.p8RoundStart([]);assert.ok(roleRandomSnapshot(s.room).pending.solo);
  s.player.sageCycleRound=0;s.room.p8RoundStart([]);assert.equal(s.player.sageOperand,30);assert.equal(roleRandomSnapshot(s.room).pending.solo,undefined);
  const p=randomBattle(t,'paladin');assert.equal(p.reserve('pal_glory_echo','negative').success,true);
  p.room.p8RoundStart([]);assert.ok(roleRandomSnapshot(p.room).pending.solo);
  p.player.paladinGloryCastedRound=1;p.player.paladinGloryTrackedDamage=50;p.room.battleRound=2;
  const queue=[];p.room.p8RoundStart(queue);assert.equal(p.player.tempHp,17);assert.equal(queue.find(s=>s.actionId==='pal_glory_echo').results[0].actualShield,17);
  const a=randomBattle(t,'assassin');a.room.battleCount=1;
  assert.equal(a.reserve('s_stab','failure').success,false);
  a.room.battleCount=2;assert.equal(a.reserve('follow_up','success').success,true);
  a.cast('basic');assert.ok(roleRandomSnapshot(a.room).pending.solo);
  a.room.restartToLobby('solo');assert.deepEqual(roleRandomSnapshot(a.room).pending,{});
  const g=randomBattle(t,'gladiator'),u=randomBattle(t,'augur');
  assert.deepEqual(randomRoleOptions(g.room,g.player),[]);assert.deepEqual(randomRoleOptions(u.room,u.player),[]);
});

test('A real bear transform result reaches the existing Phase 5 renderer and exact bear portrait',async t=>{
  const f=randomBattle(t);f.player.equips=[beast()];f.player.minions=[{id:'existing-wolf',type:'wolf',hp:10,maxHp:10,atk:1,ownerId:'solo'}];
  assert.equal(f.reserve('dru_transform','bear').success,true);f.cast('dru_transform');
  assert.equal(f.player.minions[0].id,'existing-wolf');
  const step=f.events.filter(e=>e[0]==='battle:presentation_queue').at(-1)[1].queue.find(s=>s.actionId==='dru_transform');
  const preloaded=[],commits=[],sounds=[];let elapsed=0;
  const makeNode=()=>({style:{},setAttribute(){},appendChild(){}});
  const scope={AugurPresentationEngine:class{},document:{createElement:makeNode},getActorAnchor:()=>null,resolvePresentationTarget:r=>r.targetId,
    applyHpSnapshot(){},commitBattlefieldPlayerResult:r=>commits.push({r,elapsed})};
  vm.createContext(scope);
  const core=readFileSync(new URL('../public/presentation-core.js',import.meta.url),'utf8');
  vm.runInContext(core.slice(core.indexOf('function resolveBattlePortrait('),core.indexOf('function battlePortraitHtml(')),scope);
  vm.runInContext(readFileSync(new URL('../public/phase5-battlefield.js',import.meta.url),'utf8'),scope);
  scope.preloadPhase5Art=async paths=>{for(const path of paths){assert.ok(readFileSync(new URL('../public'+path,import.meta.url)).length);preloaded.push(path);}};
  scope.withBattlefieldSkillStage=async(s,c,play)=>play({root:makeNode(),local:{audioScope:{play:key=>sounds.push(key)}},signal:new AbortController().signal,
    follow(){},animate(){return {finished:Promise.resolve()};},wait:async ms=>{elapsed+=ms;}});
  await scope.playBattlefieldDruid(step,{});
  assert.ok(preloaded.includes('/photo/巨熊.webp'));assert.ok(sounds.includes('boss_roar'));
  const transform=commits.find(c=>c.r.kind==='transform');assert.equal(transform.r.targetAfter.druidForm,'bear');assert.equal(transform.elapsed,180);
  assert.equal(commits.filter(c=>c.r.kind==='transform').length,1);
  const copy=getPlayerSkills(f.player).find(s=>s.id==='dru_transform');assert.ok(copy.desc.includes('各 1/3'));assert.equal(copy.contextualCopy,true);
});

test('commands deduplicate, reject reused IDs and stale/foreign/unauthorized requests', t => {
  const { room, socket, access, controller: c, request } = setup(t);
  const r = request();
  assert.equal(c.execute(socket, room, r).success, true);
  assert.equal(room.gold, 55);
  assert.equal(c.execute(socket, room, r).duplicate, true);
  assert.equal(room.gold, 55);
  assert.equal(c.execute(socket, room, { ...r, params: { value: 20 } }).success, false);
  assert.equal(c.execute(socket, room, { ...r, id: 'stale' }).success, false);
  assert.equal(c.execute(socket, room, { ...request(), roomCode: 'OTHER' }).success, false);
  access.revoke(socket);
  assert.equal(c.execute(socket, room, request()).success, false);
  assert.equal(room.gold, 55);
});

test('invalid commands and unsafe phases leave authoritative state unchanged', t => {
  const { room, socket, controller: c, request } = setup(t);
  for (const [command, params] of [['eval', { value: 1 }], ['gold.set', { value: -1 }], ['gold.set', { value: 1, path: 'hp' }], ['gold.add', { value: -100 }]]) {
    const before = c.snapshot(room);
    assert.equal(c.execute(socket, room, request(command, params)).success, false);
    assert.deepEqual(c.snapshot(room), before);
  }
  for (const state of ['LOBBY', 'PROLOGUE', 'TRANSITION', 'EVENT', 'BATTLE_VICTORY', 'CHECKPOINT', 'GAME_OVER', 'VICTORY']) {
    room.state = state;
    assert.equal(c.execute(socket, room, request()).success, false);
  }
  room.state = 'CHOOSING_ROUTE';
  room.isNarrating = true;
  assert.equal(c.execute(socket, room, request()).success, false);
  room.isNarrating = false;
  room.routeVotes.solo = 'chosen';
  assert.equal(c.execute(socket, room, request()).success, false);
});

test('single-room lock and invariant rollback; audit separated from game logs', t => {
  const { room, socket, controller: c, request } = setup(t);
  const logs = room.logs.length;
  c.commands.set('broken', { keys: [], validate: () => true, run: r => { r.gold = -1; r.broadcastState(); } });
  assert.equal(c.execute(socket, room, request('broken', {})).success, false);
  assert.equal(room.gold, 45);
  c.rooms.get(room).busy = true;
  assert.equal(c.execute(socket, room, request()).success, false);
  c.rooms.get(room).busy = false;
  assert.equal(c.execute(socket, room, request()).success, true);
  assert.equal(room.logs.length, logs);
  const audit = c.inspect(socket, room).audit;
  assert.equal(audit.length, 2);
  assert.equal(audit[1].before.gold, 45);
  assert.equal(audit[1].after.gold, 55);
});

test('resource controls reuse templates, inventory limits and original equipment rules', t => {
  const { room, socket, controller: c, request } = setup(t);
  const run = (command, params) => c.execute(socket, room, request(command, params));
  const player = room.players.solo;
  const before = player.bonusAtk;
  assert.equal(run('item.grant', { playerId: 'solo', itemId: 'short_sword', bag: 'personal' }).success, true);
  assert.equal(run('item.equip', { playerId: 'solo', bag: 'personal', index: 0 }).success, true);
  assert.equal(player.bonusAtk, before + 4);
  assert.equal(run('item.grant', { playerId: 'solo', itemId: 'hunter_bow', bag: 'personal' }).success, true);
  assert.equal(run('item.equip', { playerId: 'solo', bag: 'personal', index: 0 }).success, true);
  assert.equal(player.bonusAtk, before + 5);
  assert.equal(player.bag[0].id, 'short_sword');
  assert.equal(run('item.grant', { playerId: 'solo', itemId: 'invented', bag: 'personal' }).success, false);
  while (room.players.solo.bag.length < 4) assert.equal(run('item.grant', { playerId: 'solo', itemId: 'short_sword', bag: 'personal' }).success, true);
  const snapshot = c.snapshot(room);
  assert.equal(run('item.grant', { playerId: 'solo', itemId: 'short_sword', bag: 'personal' }).success, false);
  assert.deepEqual(c.snapshot(room), snapshot);
});

test('HP bounds, tracked shields and supported dots survive next round settlement', t => {
  const { room, socket, controller: c, request } = setup(t);
  const run = (command, params) => c.execute(socket, room, request(command, params));
  assert.equal(run('player.hp', { playerId: 'solo', value: 0 }).success, false);
  assert.equal(run('player.hp', { playerId: 'solo', value: room.players.solo.maxHp + 1 }).success, false);
  assert.equal(run('player.hp', { playerId: 'solo', value: 10 }).success, true);
  room.handleBattleEvent(null, false, { col: 1 });
  if (room.selectionState === 'RESOLVING') room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  room.handleSelectionReady('solo', room.battleRound);
  assert.equal(run('player.shield', { playerId: 'solo', value: 20 }).success, true);
  assert.equal(room.players.solo.p8Shields[0].value, 20);
  assert.equal(run('player.status', { playerId: 'solo', status: 'poison', apply: true }).success, true);
  assert.equal(room.players.solo.poisonTurns, 2);
  assert.equal(run('player.status', { playerId: 'solo', status: 'poison', apply: false }).success, true);
  assert.equal(room.players.solo.poisonTurns, 0);
  assert.equal(run('item.equip', { playerId: 'solo', bag: 'personal', index: 3 }).success, false);
  assert.equal(room.currentMonster, room.getPrimaryEnemy());
  assert.equal(run('player.hp', { playerId: 'solo', value: room.players.solo.maxHp }).success, true);
  room.resolveTurnActions();
  room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  assert.equal(room.battleRound, 2);
  assert.ok(Number.isFinite(room.players.solo.hp));
});

test('reserved events use original route transition and consume exactly once', t => {
  for (const type of ['battle', 'shop', 'black_market', 'chest', 'ALTAR', 'GAMBLE', 'REFORGE', 'WANDERING_MERCHANT']) {
    const { room, socket, controller: c, request } = setup(t);
    assert.equal(c.execute(socket, room, request('encounter.reserve', { type, enemyId: '', weakened: false })).success, true);
    assert.equal(room.state, 'CHOOSING_ROUTE');
    assert.equal(room.currentEvent, null);
    room.resolveRouteChoice(room.currentRoutes[0]);
    assert.equal(room.state, 'TRANSITION');
    assert.equal(room.devEncounter, null);
    const transition = room.timerCallback;
    room.clearTimer();
    transition();
    if (type === 'battle') { assert.equal(room.state, 'IN_BATTLE'); assert.ok(room.enemies.every(e => e.tier === 'MINION')); }
    else if (type === 'shop' || type === 'black_market') { assert.equal(room.currentEvent.type, 'shop'); assert.equal(room.currentEvent.isShady, type === 'black_market'); }
    else if (type === 'chest') { assert.equal(room.currentEvent.type, 'chest'); assert.equal(room.currentEvent.isMimic, false); }
    else if (type === 'WANDERING_MERCHANT') assert.equal(room.currentEvent.type, 'shop');
    else { assert.equal(room.currentEvent.subType, type); assert.equal(room.currentEvent.col, room.currentHex.col); }
    room.startRouteSelection({ skipIntro: true });
    assert.equal(room.devEncounter, null);
  }
});

test('reserved weakened boss follows battle start, ACK, rewards and next-floor exploration', t => {
  const { room, socket, controller: c, request } = setup(t);
  assert.equal(c.execute(socket, room, request('encounter.reserve', { type: 'elite', enemyId: 'elite_0', weakened: true })).success, true);
  room.resolveRouteChoice(room.currentRoutes[0]);
  const transition = room.timerCallback;
  room.clearTimer(); transition();
  assert.equal(room.enemies.length, 1);
  assert.equal(room.currentMonster.isWeakened, true);
  assert.equal(room.battleCount, 1);
  assert.equal(room.lockedLeaderRole, 'warrior');
  if (room.selectionState === 'RESOLVING') room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  room.handleSelectionReady('solo', room.battleRound);
  assert.equal(c.execute(socket, room, request('enemy.hp', { enemyId: room.currentMonster.instanceId, value: 0 })).success, false);
  assert.equal(c.execute(socket, room, request('enemy.hp', { enemyId: room.currentMonster.instanceId, value: 1 })).success, true);
  room.players.solo.action = 'basic';
  room.resolveTurnActions();
  assert.equal(room.state, 'IN_BATTLE');
  room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  assert.equal(room.state, 'BATTLE_VICTORY');
  assert.ok(room.currentVictory.goldGain > 0);
  const id = room.currentVictory.presentationId;
  room.handleVictoryComplete('solo', id);
  room.continueAfterVictory('solo', id);
  assert.equal(room.floor, 2);
  assert.equal(room.state, 'CHOOSING_ROUTE');
  assert.equal(room.devEncounter, null);
});

test('unsupported encounter combinations refuse atomically, cancellation and restart clear reservation', t => {
  const { room, socket, controller: c, request } = setup(t);
  for (const params of [{ type: 'shop', enemyId: 'elite_0', weakened: false }, { type: 'chest', enemyId: '', weakened: true }, { type: 'elite', enemyId: 'missing', weakened: false }]) {
    assert.equal(c.execute(socket, room, request('encounter.reserve', params)).success, false);
    assert.equal(room.devEncounter, undefined);
  }
  const params = { type: 'chest', enemyId: '', weakened: false };
  c.execute(socket, room, request('encounter.reserve', params));
  assert.equal(c.execute(socket, room, request('encounter.clear', {})).success, true);
  assert.equal(room.devEncounter, null);
  c.execute(socket, room, request('encounter.reserve', params));
  room.restartToLobby('solo');
  assert.equal(room.devEncounter, null);
});

test('every exposed boss template uses the original enemy factory and initializes combat', t => {
  for (const enemy of DEV_ENEMIES) {
    const { room, socket, controller: c, request } = setup(t);
    assert.equal(c.execute(socket, room, request('encounter.reserve', { type: 'elite', enemyId: enemy.id, weakened: false })).success, true);
    room.resolveRouteChoice(room.currentRoutes[0]);
    const transition = room.timerCallback;
    room.clearTimer(); transition();
    assert.equal(room.state, 'IN_BATTLE', enemy.name);
    assert.equal(room.currentMonster.originalName, enemy.name);
    assert.equal(room.currentMonster.tier, enemy.tier);
    assert.ok(room.currentMonster.maxHp > 0);
    assert.equal(room.devEncounter, null);
  }
});

test('all roles have a policy and safely settle the next round after supported resource edits', t => {
  for (const role of Object.keys(CLASSES)) {
    assert.ok(DEV_ROLE_POLICY[role], role);
    const { room, socket, controller: c, request } = setup(t, role);
    room.handleBattleEvent(null, false, { col: 1, rng: () => 0 });
    if (room.selectionState === 'RESOLVING') room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
    room.handleSelectionReady('solo', room.battleRound);
    for (const resource of roleResources(room.players.solo)) {
      const params = { playerId: 'solo', resource: resource.key, value: resource.max };
      assert.equal(c.execute(socket, room, request('role.resource', params)).success, true, role);
      assert.equal(roleResources(room.players.solo).find(r => r.key === resource.key).value, resource.max);
      assert.equal(c.execute(socket, room, request('role.resource', { ...params, value: resource.max + 1 })).success, false);
    }
    assert.equal(c.execute(socket, room, request('role.resource', { playerId: 'solo', resource: 'sagePhase', value: 1 })).success, false);
    room.players.solo.action = 'basic';
    room.resolveTurnActions();
    assert.equal(room.selectionState, 'RESOLVING', role);
    room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
    assert.ok(['IN_BATTLE', 'BATTLE_VICTORY'].includes(room.state), role);
    assert.ok(Number.isFinite(room.players.solo.hp), role);
    assert.equal(room.pendingPresentationAcks.size === 0 || room.selectionState === 'RESOLVING' || room.state === 'BATTLE_VICTORY', true, role);
  }
});

test('wrong-role resources, arena and Sage sampling/debt cannot be overwritten', t => {
  const { room, socket, controller: c, request } = setup(t, 'sage');
  room.handleBattleEvent(null, false, { col: 1 });
  if (room.selectionState === 'RESOLVING') room.handlePresentationComplete('solo', room.battlePresentationId, room.battleRound);
  room.handleSelectionReady('solo', room.battleRound);
  const params = { playerId: 'solo', resource: 'sageX', value: 40 };
  room.players.solo.sageDebt = 5;
  assert.equal(c.execute(socket, room, request('role.resource', params)).success, false);
  room.players.solo.sageDebt = 0;
  room.players.solo.sageInduction = true;
  room.players.solo.sageSamplingEnded = false;
  assert.equal(c.execute(socket, room, request('role.resource', params)).success, false);
  room.players.solo.sageSamplingEnded = true;
  room.arena = { playerId: 'solo' };
  assert.equal(c.execute(socket, room, request('role.resource', params)).success, false);
  room.arena = null;
  assert.equal(c.execute(socket, room, request('role.resource', { ...params, resource: 'rage' })).success, false);
});
