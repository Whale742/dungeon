// Explicit mock authoritative payloads. No random rolls or gameplay formulas in Lab.
const GLADIATOR_LAB_SCENES=(()=>{
  const g={id:'lab-gladiator',name:'角鬥士',role:'gladiator',hp:85,maxHp:85,rage:0,bloodStacks:0,statuses:[]};
  const ally={id:'lab-warrior',name:'隊友',role:'warrior',hp:100,maxHp:120,statuses:[]};
  const monster={name:'遠古守衛石像',hp:800,maxHp:1200,statuses:[]};
  const snapshot=(actor={},boss={},arena=false,team=ally)=>({players:[{...g,...actor},{...team}],monster:{...monster,...boss},arena:arena?{playerId:g.id,until:2}:null});
  const result=(id,kind,before,after,value)=>({targetId:id,kind,targetBefore:gladiatorTarget(before,id),targetAfter:gladiatorTarget(after,id),
    hpSnapshot:after,...(kind==='damage'?{finalDamage:value,damageType:id===g.id?'true':'physical'}:{}),outcome:{type:'normal'}});
  const step=(action,name,before,after,results,extra={})=>({type:'player_action',category:'OFFENSIVE',sourceId:g.id,sourceRole:'gladiator',sourceName:g.name,
    actionId:action,skillName:name,monsterName:monster.name,monsterAvatar:'/BOSS/Ancient Guardian Golem.webp',hpSnapshotBefore:before,hpSnapshot:after,results,
    outcome:{type:'normal'},...extra});
  const base=snapshot(),basicAfter=snapshot({}, {hp:790});
  const basic=step('basic','普通攻擊',base,basicAfter,[result('monster','damage',base,basicAfter,10)]);
  function sacrifice(variant=''){
    const before=variant==='cuirass'?snapshot({hp:45,maxHp:120}):base;
    const paid=variant==='cuirass'?snapshot({hp:25,maxHp:120}):snapshot({hp:65});
    const after=variant==='cuirass'?snapshot({hp:25,maxHp:120,rage:1,statuses:[{id:'blood_heal',label:'死線喘息 +20%',turns:2,icon:'buff'}]}):snapshot({hp:65,rage:1,bloodStacks:variant==='xiphos'?1:0});
    return step('g_sacrifice','鮮血獻祭',before,after,[result(g.id,'damage',before,paid,20),result(g.id,'status',paid,after)],
      {category:'BUFF',outcome:{type:'sacrifice'},gladiatorPresentation:{rageBefore:0,rageAfter:1,rageGained:1,bloodGained:variant==='xiphos'?1:0,bloodHealApplied:variant==='cuirass'}});
  }
  const declared=snapshot({hp:65,rage:1,statuses:[{id:'arena_challenge',label:'死鬥宣告',turns:1,icon:'buff'}]});
  const challenge=step('g_arena','死鬥宣告',sacrifice().hpSnapshot,declared,[result(g.id,'status',sacrifice().hpSnapshot,declared)],{category:'BUFF',outcome:{type:'challenge'}});
  const arenaStart=snapshot({hp:117,maxHp:153,rage:3,arenaActive:true},{hp:1440,maxHp:2160},true,{...ally,arenaBlocked:true});
  const enter=step('arena_enter','死亡角鬥場',declared,arenaStart,[],{type:'arena_enter',category:'ARENA_ENTER',arenaPresentation:{phase:'enter',playerId:g.id,noMitigation:true,
    combatants:[{targetId:g.id,hpBeforeArena:65,maxHpBeforeArena:85,hpAfterScale:117,maxHpAfterScale:153},{targetId:'monster',hpBeforeArena:800,maxHpBeforeArena:1200,hpAfterScale:1440,maxHpAfterScale:2160}]}});
  // Enter payload starts at Rage 1; standalone assault uses a separate explicit Rage 3 snapshot.
  enter.hpSnapshot=snapshot({hp:117,maxHp:153,rage:1,arenaActive:true},{hp:1440,maxHp:2160},true,{...ally,arenaBlocked:true});
  const assaultAfter=snapshot({hp:117,maxHp:153,rage:3,arenaActive:true},{hp:1315,maxHp:2160},true,{...ally,arenaBlocked:true});
  const assault=step('g_sacrifice','鮮血獻祭',arenaStart,assaultAfter,[result('monster','damage',arenaStart,assaultAfter,125)],{outcome:{type:'arena_assault'},gladiatorPresentation:{arenaActive:true,rageBefore:3,rageAfter:3,rageConsumed:0}});
  function suicide(variant=false){
    const zero=snapshot({hp:0,maxHp:153,rage:3,arenaActive:true,noReviveThisFloor:true},{hp:1440,maxHp:2160},true,{...ally,arenaBlocked:true});
    const after=snapshot({hp:0,maxHp:153,rage:3,arenaActive:true,noReviveThisFloor:true},{hp:variant?1278:1293,maxHp:2160},true,{...ally,arenaBlocked:true});
    return step('g_arena','同歸於盡',arenaStart,after,[result(g.id,'damage',arenaStart,zero,117),result('monster','damage',zero,after,variant?162:147)],
      {outcome:{type:'suicide'},gladiatorPresentation:{arenaActive:true,rageBefore:3,rageAfter:3,actorDied:true},equipmentVariant:variant?'g_cingulum':null});
  }
  function exit(rage=4,bonus=83.3333333333,dead=false,beforeOverride){
    const before=beforeOverride||snapshot({hp:dead?0:92,maxHp:153,rage,arenaActive:true},{hp:1315,maxHp:2160},true,{...ally,arenaBlocked:true});
    const actor=gladiatorTarget(before,g.id),boss=before.monster;
    const consumed=snapshot({...actor,rage:0,bloodStacks:0},boss,true,{...ally,arenaBlocked:true});
    const status={id:'triumph',label:'凱旋',turns:2,value:bonus,icon:'buff'};
    const triumph=snapshot({...actor,rage:0,bloodStacks:0,arenaActive:false,statuses:dead?[]:[status]},boss,false,{...ally,arenaBlocked:false,statuses:dead?[]:[status]});
    const restored=snapshot({...actor,hp:dead?0:51,maxHp:85,rage:0,bloodStacks:0,arenaActive:false,statuses:dead?[]:[status]},
      {hp:dead?718:731,maxHp:1200},false,{...ally,arenaBlocked:false,statuses:dead?[]:[status]});
    return step('arena_exit','死亡角鬥場落幕',before,restored,[],{type:'arena_exit',category:'ARENA_EXIT',arenaPresentation:{phase:'exit',reason:dead?'gladiator_dead':'round_end',
      playerId:g.id,consumedRage:rage,triumphApplied:!dead,triumphBonus:dead?0:bonus,triumphDuration:dead?0:2,actorSurvived:!dead,
      rageConsumedSnapshot:consumed,triumphSnapshot:triumph,hpRestoredSnapshot:restored}});
  }
  const scenes={};const add=(id,label,steps)=>{scenes[id]={role:'gladiator',label:'Gladiator · '+label,steps};};
  add('gladiator_basic','Basic',[basic]);add('gladiator_sacrifice','鮮血獻祭',[sacrifice()]);add('gladiator_challenge','死鬥宣告',[challenge]);
  add('gladiator_enter','Arena Enter',[enter]);add('gladiator_assault','Arena 1 Skill',[assault]);add('gladiator_suicide','同歸於盡',[suicide()]);
  add('gladiator_exit','Arena Exit',[exit()]);
  const sequenceAssault=structuredClone(assault);sequenceAssault.hpSnapshotBefore=enter.hpSnapshot;
  sequenceAssault.hpSnapshot=snapshot({hp:117,maxHp:153,rage:1,arenaActive:true},{hp:1385,maxHp:2160},true,{...ally,arenaBlocked:true});
  sequenceAssault.results=[result('monster','damage',enter.hpSnapshot,sequenceAssault.hpSnapshot,55)];sequenceAssault.gladiatorPresentation={arenaActive:true,rageBefore:1,rageAfter:1,rageConsumed:0};
  const fullExit=exit(1,30.303030303,false,sequenceAssault.hpSnapshot);fullExit.hpSnapshot.players[0].hp=65;fullExit.hpSnapshot.monster.hp=769;
  add('gladiator_full','Full Arena Sequence',[sacrifice(),challenge,enter,sequenceAssault,fullExit]);
  add('gladiator_xiphos','鮮血獻祭 · Spartan Xiphos',[sacrifice('xiphos')]);add('gladiator_cuirass','鮮血獻祭 · Bloodstained Cuirass',[sacrifice('cuirass')]);
  add('gladiator_cingulum','同歸於盡 · Blood-Sand Cingulum',[suicide(true)]);
  for(const [rage,bonus] of [[0,0],[1,30.303030303],[4,83.3333333333],[8,117.6470588235]])add('gladiator_exit_rage'+rage,'Arena Exit · Rage '+rage+(rage?' + Triumph':''),[exit(rage,bonus)]);
  add('gladiator_exit_dead','Arena Exit · Dead · No Triumph',[exit(3,0,true)]);
  add('gladiator_forced_end','同歸於盡 · Forced Arena End · No Triumph',[suicide(),exit(3,0,true,suicide().hpSnapshot)]);
  return Object.freeze(scenes);
})();
