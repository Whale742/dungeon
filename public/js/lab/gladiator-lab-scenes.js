// Explicit authoritative replay examples; production Room owns all combat formulas.
const GLADIATOR_LAB_SCENES=(()=>{
  const g={id:'lab-gladiator',name:'角鬥士',role:'gladiator',hp:85,maxHp:85,gladiatorBloodsong:0,rage:0,bloodStacks:0,statuses:[]};
  const ally={id:'lab-warrior',name:'隊友',role:'warrior',hp:100,maxHp:120,statuses:[]};
  const monster={instanceId:'monster',name:'遠古守衛石像',hp:800,maxHp:1200,statuses:[]};
  const snapshot=(actor={},boss={},arena=false,team=ally)=>{
    const enemy={...monster,...boss},unit={...g,...actor};
    unit.statuses=(unit.statuses||[]).filter(s=>s.id!=='rage'&&s.id!=='gladiator_bloodsong');
    if(unit.rage>0)unit.statuses.push({id:'rage',label:'鬥志',icon:'buff',stacks:unit.rage});
    if(arena&&unit.gladiatorBloodsong>0)unit.statuses.push({id:'gladiator_bloodsong',label:'嗜血戰歌',icon:'buff',stacks:unit.gladiatorBloodsong});
    unit.resourceSummary=`鬥志 ${unit.rage}`;
    return {players:[unit,{...team}],monster:enemy,enemies:[enemy],arena:arena?{playerId:g.id,enemyId:'monster',until:2}:null};
  };
  const result=(id,kind,before,after,value=0)=>({targetId:id,kind,targetBefore:gladiatorTarget(before,id),targetAfter:gladiatorTarget(after,id),hpSnapshot:after,
    actualDamage:kind==='damage'?value:0,actualHpDamage:kind==='damage'?value:0,actualAbsorbed:0,actualHeal:0,actualShield:0,
    ...(id==='monster'?{targetEnemyId:'monster'}:{}),...(kind==='damage'?{finalDamage:value,damageType:id===g.id?'true':'physical'}:{}),outcome:{type:'normal'}});
  const step=(action,name,before,after,results,extra={})=>({type:'player_action',category:'OFFENSIVE',sourceId:g.id,sourceRole:'gladiator',sourceName:g.name,targetId:'monster',targetEnemyId:'monster',
    actionId:action,skillName:name,monsterName:monster.name,monsterAvatar:'/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp',hpSnapshotBefore:before,hpSnapshot:after,results,outcome:{type:'normal'},...extra});
  const base=snapshot(),basicHit=snapshot({}, {hp:790}),basicAfter=snapshot({rage:1},{hp:790});
  const basic=step('basic','鬥士斬擊',base,basicAfter,[result('monster','damage',base,basicHit,10),result(g.id,'status',basicHit,basicAfter)]);
  function challengeHit(variant='',hp=85){
    const rage=variant==='xiphos'?2:1;
    if(variant==='cuirass'){
      const before=snapshot({hp,maxHp:120});
      const shield=snapshot({hp,maxHp:120,statuses:[{id:'gladiator_inspiration',label:'鼓舞',value:'物攻 +15',icon:'buff'}]});
      const converted=snapshot({hp,maxHp:120,statuses:[{id:'gladiator_inspiration',label:'鼓舞',value:'物攻 +22',icon:'buff'}]});
      const hit=snapshot({hp,maxHp:120,statuses:converted.players[0].statuses},{hp:763});
      const after=snapshot({hp,maxHp:120,rage:1,statuses:[...converted.players[0].statuses,{id:'gladiator_challenge',label:'邀戰',icon:'buff',turns:1}]},{hp:763});
      return step('g_sacrifice','血戰邀約',before,after,[result(g.id,'status',before,shield),result(g.id,'status',shield,converted),result('monster','damage',converted,hit,37),result(g.id,'status',hit,after)],{outcome:{type:'blood_challenge'},gladiatorPresentation:{rageBefore:0,rageAfter:1,rageGained:1}});
    }
    const maxHp=variant==='cuirass'?120:85,before=snapshot({hp,maxHp}),hit=snapshot({hp,maxHp},{hp:785});
    const after=snapshot({hp,maxHp,rage,statuses:[{id:'gladiator_challenge',label:'邀戰',icon:'buff',turns:1}]},{hp:785});
    return step('g_sacrifice','血戰邀約',before,after,[result('monster','damage',before,hit,15),result(g.id,'status',hit,after)],
      {outcome:{type:'blood_challenge'},gladiatorPresentation:{rageBefore:0,rageAfter:rage,rageGained:rage}});
  }
  const challenged=challengeHit('',35),declared=snapshot({hp:35,rage:1,statuses:[{id:'arena_challenge',label:'死鬥宣告',turns:1,icon:'buff'}]},{hp:785});
  const challenge=step('g_arena','死鬥宣告',challenged.hpSnapshot,declared,[result(g.id,'status',challenged.hpSnapshot,declared)],{category:'BUFF',outcome:{type:'challenge'}});
  const arenaStart=snapshot({hp:35,gladiatorBloodsong:50,rage:3,arenaActive:true},{hp:800},true,{...ally,arenaBlocked:true});
  const entered=snapshot({hp:35,gladiatorBloodsong:50,rage:1,arenaActive:true},{hp:785},true,{...ally,arenaBlocked:true});
  const enter=step('arena_enter','死亡角鬥場',declared,entered,[],{type:'arena_enter',category:'ARENA_ENTER',arenaPresentation:{phase:'enter',playerId:g.id,noMitigation:true,recoveredHp:50,
    combatants:[{targetId:g.id,hpBeforeArena:35,maxHpBeforeArena:85,hpAfterScale:35,maxHpAfterScale:85},{targetId:'monster',hpBeforeArena:785,maxHpBeforeArena:1200,hpAfterScale:785,maxHpAfterScale:1200}]}});
  const assaultHit=snapshot({hp:35,gladiatorBloodsong:50,rage:3,arenaActive:true},{hp:726},true,{...ally,arenaBlocked:true}),assaultAfter=snapshot({hp:35,gladiatorBloodsong:50,rage:4,arenaActive:true},{hp:726},true,{...ally,arenaBlocked:true});
  const assault=step('g_sacrifice','血殺重擊',arenaStart,assaultAfter,[result('monster','damage',arenaStart,assaultHit,74),result(g.id,'status',assaultHit,assaultAfter)],{outcome:{type:'arena_assault'},gladiatorPresentation:{arenaActive:true,rageBefore:3,rageAfter:4,rageGained:1}});
  function judgment(belt=false){
    const paid=snapshot({hp:35,rage:3,arenaActive:true},{hp:800},true,{...ally,arenaBlocked:true});
    const hit=snapshot({hp:35,rage:3,arenaActive:true},{hp:belt?669:698},true,{...ally,arenaBlocked:true}),after=snapshot({hp:35,rage:4,arenaActive:true},{hp:belt?669:698},true,{...ally,arenaBlocked:true});
    return step('g_arena','浴血裁決',arenaStart,after,[{...result(g.id,'status',arenaStart,paid),bloodsongConsumed:50},result('monster','damage',paid,hit,belt?131:102),result(g.id,'status',hit,after)],
      {outcome:{type:'blood_judgment'},gladiatorPresentation:{arenaActive:true,rageBefore:3,rageAfter:4,actorDied:false},equipmentVariant:belt?'g_cingulum':null});
  }
  function exit(rage=4,bonus=83,dead=false,beforeOverride){
    const before=beforeOverride||snapshot({hp:dead?0:55,rage,arenaActive:true},{hp:726},true,{...ally,arenaBlocked:true});
    const actor=gladiatorTarget(before,g.id),boss=before.monster;
    const consumed=snapshot({...actor,hp:actor.hp>0?Math.min(actor.maxHp,actor.hp+(actor.gladiatorBloodsong||0)):0,gladiatorBloodsong:0,rage:0,bloodStacks:0},boss,true,{...ally,arenaBlocked:true});
    const restored=snapshot({...actor,hp:consumed.players[0].hp,gladiatorBloodsong:0,rage:0,bloodStacks:0,arenaActive:false,statuses:[]},boss,false,{...ally,arenaBlocked:false,statuses:dead?[]:[{id:'triumph',label:'凱旋',turns:2,value:bonus,icon:'buff'}]});
    return step('arena_exit','死亡角鬥場落幕',before,restored,[],{type:'arena_exit',category:'ARENA_EXIT',arenaPresentation:{phase:'exit',reason:dead?'gladiator_dead':'round_end',playerId:g.id,consumedRage:rage,triumphApplied:!dead,triumphBonus:dead?0:bonus,triumphDuration:dead?0:2,actorSurvived:!dead,rageConsumedSnapshot:consumed,triumphSnapshot:restored,hpRestoredSnapshot:restored}});
  }
  const scenes={};const add=(id,label,steps)=>{scenes[id]={role:'gladiator',label:'Gladiator · '+label,steps};};
  add('gladiator_basic','鬥士斬擊',[basic]);add('gladiator_sacrifice','血戰邀約',[challengeHit()]);add('gladiator_challenge','死鬥宣告',[challenge]);
  add('gladiator_enter','進場回滿血（不放大 HP）',[enter]);add('gladiator_assault','血殺重擊',[assault]);add('gladiator_suicide','浴血裁決',[judgment()]);add('gladiator_exit','保留剩餘 HP 退場',[exit()]);
  const fullHit=snapshot({hp:35,gladiatorBloodsong:50,rage:1,arenaActive:true},{hp:738},true,{...ally,arenaBlocked:true}),fullAfter=snapshot({hp:35,gladiatorBloodsong:50,rage:2,arenaActive:true},{hp:738},true,{...ally,arenaBlocked:true});
  const sequenceAssault=step('g_sacrifice','血殺重擊',entered,fullAfter,[result('monster','damage',entered,fullHit,47),result(g.id,'status',fullHit,fullAfter)],{outcome:{type:'arena_assault'},gladiatorPresentation:{arenaActive:true,rageBefore:1,rageAfter:2,rageGained:1}});
  add('gladiator_full','完整決鬥流程',[challenged,challenge,enter,sequenceAssault,exit(2,53,false,fullAfter)]);
  add('gladiator_xiphos','血戰邀約 · 短劍額外鬥志 +1',[challengeHit('xiphos')]);add('gladiator_cuirass','血戰邀約 · 戰鎧生命 +35、鼓舞效率 +50%',[challengeHit('cuirass',120)]);add('gladiator_cingulum','浴血裁決 · 束帶保留物攻 +4',[judgment(true)]);
  for(const [rage,bonus] of [[0,0],[1,30],[4,83],[8,118]])add('gladiator_exit_rage'+rage,'退場 · 鬥志 '+rage+' · 凱旋',[exit(rage,bonus)]);
  add('gladiator_exit_dead','倒下退場 · 無凱旋',[exit(3,0,true)]);
  add('gladiator_forced_end','浴血裁決後仍可能被敵人擊殺',[judgment(),exit(4,0,true,snapshot({hp:0,rage:4,arenaActive:true},{hp:698},true,{...ally,arenaBlocked:true}))]);
  return Object.freeze(scenes);
})();
