import { CLASSES, GAME_BALANCE } from './constants.js';
import { isAssassinHidden } from './assassin.js';
import { resolveStats, mitigateDirectDamage } from './stats.js';
import { snapshotTarget } from './combat-schema.js';

// All Phase 2 additions live here. Script damage, probabilities and periods
// remain owned by ABYSS_BOSSES.script; these are conservative safety limits
// and defaults only where the design did not specify a number.
// Enemy-phase debuffs last through the next player action; one-round burns
// tick once at the next round start. Positive reduced hits retain the existing
// one-point damage floor. Druid HP cost uses max HP, capped to leave one HP.
export const ENEMY_BALANCE = Object.freeze({
  ultimatePeriod: 3, ultimateMultiplier: 1.35, physicalFirstReduction: .25,
  burnDamage: 3, burnTurns: 1, explosionDamage: 4,
  wolfUltimateMultiplier: 1.20, wolfAssistDamage: 3,
  chargeCap: 2, chargePerRound: 1, chargeBonus: .15, repairShield: 4,
  enemyShieldMaxHpRatio: .30, repairExtraChargeCap: 1,
  bloodLifesteal: .10, enemyHealPerActionMaxHpRatio: .20,
  sacrificeHp: 2, sacrificeShield: 4, shieldGainReduction: .30,
  acidDefenseReduction: .20, debuffTurns: 1, frostThreshold: 2,
  frostDamageReduction: .20, frostMarkTurns: 2,
  devourRatio: .30, devourCap: 15, parasiteRatio: .10, parasiteCap: 4,
  parasiteTurns: 2, parasiteHealPerRoundCap: 8, unrestBonus: .15,
  crystalReflect: .10, crystalReflectCap: 5, crystalReflectPerRound: 1,
  beetleReflectBonus: .05, beetleShield: 3,
  heatCap: 3, heatPerRound: 1, heatBonus: .10, impExtraHeatCap: 1,
  goblinUnshieldedBonus: 2, aimedShotMultiplier: 1.30,
  remnantBonus: 2, watcherResistance: 5, watcherStackCap: 2,
  bountyPeriod: 3, mimicReduction: .30, mimicDefenseReduction: .30,
  scriptReflectCap: 20,
  scriptShieldMaxHpRatio: .60, errorCap: 60,
  curseBacklashMin: .10, curseBacklashMax: .30, curseVulnerable: .10,
  arenaTurns: 1, markedTauntChance: .30, wolfFormChance: .50,
  scatterStepMin: 2, scatterStepRange: 4, scatterAoeRatio: .50,
  legacyWarriorShield: [.10, .60], guardShare: .50, existingBowDodgePenalty: .20,
  talismanBlindMin: .60, talismanBlindRange: .40, talismanConfuseMin: .50, talismanConfuseRange: .50,
  flaskDots: { poison: { damage: 8, turns: 2 }, burn: { damage: 10, turns: 1 },
    fracture: { damage: 5, turns: 3 }, chill: { damage: 6, turns: 2 } }
});

export const ELITE_MECHANICS = Object.freeze({
  '地底熔岩巨像': 'lava_colossus', '暗影魔狼族長': 'shadow_alpha',
  '古代守護魔偶': 'ancient_golem', '赤月嗜血巫師': 'blood_sorcerer',
  '深淵腐蝕巨蟒': 'corrosive_serpent', '霜骨亡靈騎士': 'frost_knight',
  '迷宮食腐暴食魔': 'glutton', '幻惑幽魂歌姬': 'banshee',
  '結晶守護巨蠍': 'crystal_scorpion', '煉獄炎獄行者': 'hellstrider'
});
const LABELS = Object.freeze({
  lava_colossus: '熔岩岩甲', shadow_alpha: '獵物標記', ancient_golem: '能源核心',
  blood_sorcerer: '血月汲取', corrosive_serpent: '腐蝕毒液', frost_knight: '寒霜印記',
  glutton: '暴食', banshee: '心神不寧', crystal_scorpion: '晶甲反射', hellstrider: '煉獄熱度',
  lava_larva: '焦油自爆', shadow_wolf_pup: '協同狩獵', ancient_repair_drone: '維修充能',
  blood_moon_acolyte: '血咒獻祭', corrosive_slime: '強酸腐蝕', frostbone_skeleton: '寒霜刺擊',
  carrion_crawler: '寄生標記', whispering_apparition: '迷失低語', crystal_beetle: '晶甲共鳴',
  hellfire_imp: '焦灼火球', gel_slime: '彈性軀體', cave_goblin_rogue: '卑劣偷襲',
  labyrinth_crossbowman: '瞄準射擊', abyss_remnant: '遺恨共鳴', abyss_watcher: '虛空掩護',
  shady_merchant: '黑金懸賞', treasure_mimic: '貪婪開闔'
});
export function mechanicId(template) {
  return template.mechanicId || (template.script && template.id?.startsWith('abyss_') ? template.id :
    LABELS[template.id] ? template.id : ELITE_MECHANICS[template.originalName || template.name]) || null;
}
export function mechanicState(template) {
  return { id: mechanicId(template), round: 0, charge: 0, heat: 0, error: 0,
    firstPhysicalUsed: false, armorBroken: false, reflected: 0, parasiteHeal: 0, deathProcessed: false, open: false };
}
const B = ENEMY_BALANCE;
const state = enemy => enemy.mechanics ||= mechanicState(enemy);
const lockedArena = room => room.arena || room.enemyArena || (room.arenaPending?.round===room.battleRound ? {playerId:room.arenaPending.playerId,enemyId:room.currentMonster?.instanceId} : null);
export const enemyCanParticipate = (room, enemy) => {
  const arena = lockedArena(room) || room.arenaRoundLock;
  return !arena || !arena.enemyId || arena.enemyId === enemy.instanceId;
};
const players = room => Object.values(room.players).filter(p => p.hp > 0 &&
  (!(lockedArena(room) || room.arenaRoundLock) || (lockedArena(room) || room.arenaRoundLock).playerId === p.id));
const living = room => room.getLivingEnemies().filter(e => enemyCanParticipate(room, e));
const find = (room, id) => living(room).find(e => state(e).id === id);
const lowest = list => [...list].sort((a,b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
export const enemyEffect = (room, p, id) => p?.enemyEffects?.[id]?.until >= room.battleRound ? p.enemyEffects[id] : null;
export function mechanicStatuses(unit, room) {
  const result = Object.entries(unit.enemyEffects || {}).filter(([,e]) => e.until >= room.battleRound)
    .map(([id,e]) => ({ id, ...e, icon: 'debuff', isNegative: true, category: 'DEBUFF', turns: Math.max(1,e.until-room.battleRound) }));
  if (!unit.instanceId || !state(unit).id) return result;
  const s = state(unit);
  result.push({ id: 'enemy_mechanic', label: LABELS[s.id] || unit.ultName, icon: 'buff',
    value: s.id === 'treasure_mimic' ? (s.open ? '開箱・破綻' : '閉箱') :
      s.id === 'ancient_golem' ? s.charge : s.id === 'hellstrider' ? s.heat :
        s.id === 'abyss_sage' ? s.error : s.id === 'abyss_druid' ? (s.transformRound ? '下回合變形' : s.form==='werewolf'?'狼人':s.form==='treant'?'遠古樹精':'自然形態') : s.targetId ? room.players[s.targetId]?.name : '' });
  if (unit.untargetableThisRound) result.push({id:'void_step',label:'虛無暗影步・免傷',icon:'guard'});
  if (unit.enemyEffectResistanceBonus) result.push({id:'void_cover',label:'虛空掩護',icon:'guard',value:unit.enemyEffectResistanceBonus});
  return result;
}

// Each mutation owns its own before/after snapshots. No frontend HP inference.
function record(room, source, target, actionId, kind, mutate, extra = {}) {
  const {beforeSnapshot,...metadata}=extra;
  const before = beforeSnapshot || room.getHpSnapshot(), id = target.instanceId || target.id;
  const targetBefore = structuredClone(snapshotTarget(before, id));
  const outcome = mutate() === false ? {type:'blocked'} : {type:'normal'};
  const after = room.getHpSnapshot(), targetAfter = structuredClone(snapshotTarget(after, id));
  const result = {kind, sourceId:source.instanceId || source.id, targetId:id,
    targetEnemyId:target.instanceId || null, actionId, skillId:actionId, outcome,
    finalDamage:Math.max(0,(targetBefore?.hp||0)-(targetAfter?.hp||0)) + Math.max(0,(targetBefore?.tempHp||0)-(targetAfter?.tempHp||0)),
    actualHeal:kind==='heal'?Math.max(0,(targetAfter?.hp||0)-(targetBefore?.hp||0)):0,
    actualShield:Math.max(0,(targetAfter?.tempHp||0)-(targetBefore?.tempHp||0)),
    targetBefore,targetAfter,hpSnapshot:after,...metadata};
  (room.enemyMechanicQueue ||= []).push({type:'enemy_mechanic',category:'STATUS_TICK',
    sourceId:result.sourceId,enemyId:source.instanceId,targetId:id,targetEnemyId:result.targetEnemyId,
    actionId,skillName:actionId,monsterName:source.name,monsterAvatar:source.avatar,
    outcome, hpSnapshotBefore:before,hpSnapshot:after,results:[result]});
  return result;
}
function status(room, source, target, id, label, value = 1, turns = B.debuffTurns) {
  if (target.hp <= 0) return;
  record(room,source,target,label,'status',() => {
    target.enemyEffects ||= {};
    target.enemyEffects[id] = {label,value,until:room.battleRound+turns,sourceId:source.instanceId};
  });
}
function shield(room, source, target, value, label, cap = B.enemyShieldMaxHpRatio) {
  if (target.hp <= 0 || !enemyCanParticipate(room,source) || !enemyCanParticipate(room,target)) return;
  record(room,source,target,label,'shield',() => { target.tempHp = Math.min(Math.floor(target.maxHp*cap),(target.tempHp||0)+Math.max(0,Math.floor(value))); });
}
function heal(room, source, target, value, label) {
  if (target.hp <= 0 || !enemyCanParticipate(room,target)) return;
  record(room,source,target,label,'heal',() => { target.hp = Math.min(target.maxHp,target.hp+Math.min(Math.floor(target.maxHp*B.enemyHealPerActionMaxHpRatio),Math.max(0,Math.floor(value)))); });
}
function choose(room, preferred) {
  const eligible = players(room).filter(p => !isAssassinHidden(p));
  const target = eligible.find(p => p.id === preferred);
  const taunter = eligible.find(p => p.paladinGrace || room.p8Has(p,'taunt'));
  if (taunter) return taunter;
  // Keep the existing paladin target weight relevant even for marked attacks.
  if (target && !(eligible.some(p=>p.role==='paladin') && Math.random()<B.markedTauntChance)) return target;
  return room.pickTargetWithTaunt(eligible);
}

// One damage path for specials, normal hits, death bursts and redirected attacks.
// Order: isolation -> hidden/dodge -> dream/parry -> mitigation -> grace/treant
// -> tracked shields -> HP -> fatal protection. Secondary damage cannot recurse.
function strike(room, enemy, target, raw, actionId, options = {}) {
  if (!target || target.hp <= 0 || (!options.posthumous && enemy.hp <= 0) || !enemyCanParticipate(room,enemy)) return null;
  if (!players(room).includes(target)) return null;
  let result;
  const hits = [];
  const perform = (victim, damage, sharedFrom, mitigated = false) => {
    const hit = record(room,enemy,victim,actionId,'damage',() => {
      const taken = room.applyDamageToPlayer(victim,damage,{kind:sharedFrom?'secondary':'enemy_direct',
        defMitigated:mitigated,trueDamage:options.trueDamage || !!lockedArena(room),ignoreReduction:!!lockedArena(room)});
      if (victim.hp<=0 && victim.druidForm==='treant') {victim.hp=1;victim.druidForm='tree';victim.druidFormTurns=1;victim.stunnedNextTurn=true;}
      if (victim.hp<=0) room.clearPlayerDebuffs(victim);
      return taken.actualDmg>0;
    },{damageType:options.trueDamage?'true':options.type==='mag'?'magic':'physical',sharedFrom});
    if(victim.paladinGrace)victim.paladinGrace.interceptedDamage=(victim.paladinGrace.interceptedDamage||0)+hit.finalDamage;
    hits.push(hit);return hit;
  };
  if ((!options.dot && isAssassinHidden(target)) || (!options.noDodge && room.checkDodge(target,target.role==='archer' ? Math.max(0,CLASSES.archer.dodgeRate-((target.equips||[]).filter(e=>['a_archangel_bow','a_bow'].includes(e.id)).length)*B.existingBowDodgePenalty) : 0))) {
    return record(room,enemy,target,actionId,'damage',()=>false,{outcome:{type:'dodge'},damageType:options.type || 'physical'});
  }
  const mitigate = amount => {
    if (options.trueDamage || lockedArena(room)) return amount;
    let n=room.p8MitigateFriendly(target,amount);
    if(room.warriorShieldTurn)n*=B.legacyWarriorShield[room.warriorShieldTurn-1];
    return mitigateDirectDamage(Math.floor(n),{damageType:options.type||'phys',defense:resolveStats(target,room.statMultiplier(target)).DEF});
  };
  options.beforeHit?.();
  const beforeIncoming=room.getHpSnapshot();
  const incoming=room.p8Incoming(target,raw,mitigate,{kind:'enemy_direct',ignoreReduction:options.trueDamage || !!lockedArena(room)});
  let damage=incoming.damage;
  if(incoming.outcome==='dream_heal') return record(room,enemy,target,actionId,'heal',()=>{}, {beforeSnapshot:beforeIncoming,actualHeal:incoming.heal||0,outcome:{type:'dream_heal'}});
  if(incoming.outcome==='parry' && damage===0) return record(room,enemy,target,actionId,'damage',()=>false,{outcome:{type:'block',parry:true}});
  if (!options.secondary && !lockedArena(room) && damage>0) {
    const grace=players(room).find(p=>p.id!==target.id&&p.paladinGrace);
    const treant=players(room).find(p=>p.id!==target.id&&p.druidForm==='treant');
    if(grace) {perform(grace,damage,target.id);damage=0;}
    else if(treant) {const share=Math.floor(damage*B.guardShare);damage-=share;perform(treant,Math.floor(share*(1-GAME_BALANCE.treantDamageReduction)),target.id);}
  }
  result=perform(target,damage,null,true);
  if(incoming.outcome==='nightmare')room.p8NightmareHeal(target,incoming.ownerId);
  result.hpDmg=Math.max(0,result.targetBefore.hp-result.targetAfter.hp);
  return result;
}

export function syncEnemySupport(room) {
  for(const enemy of room.enemies || []) {
    const count=living(room).filter(e=>state(e).id==='abyss_watcher').length;
    const bonus=enemy.hp>0 && enemy.tier==='ABYSS' && enemyCanParticipate(room,enemy)?Math.min(B.watcherStackCap,count)*B.watcherResistance:0;
    const crystal=enemy.hp>0 && state(enemy).id==='crystal_scorpion' && !!find(room,'crystal_beetle');
    if((enemy.enemyEffectResistanceBonus||0)!==bonus || !!enemy.crystalSupport!==crystal)record(room,enemy,enemy,'支援共鳴更新','status',()=>{enemy.enemyEffectResistanceBonus=bonus;enemy.crystalSupport=crystal;});
  }
}
export function sweepEnemyDeaths(room) {
  for(const enemy of room.enemies || []) if(enemy.hp<=0 && !state(enemy).deathProcessed) {
    state(enemy).deathProcessed=true;
    enemy.tempHp=0;enemy.untargetableThisRound=false;
    if(state(enemy).id==='lava_larva') for(const p of players(room)) strike(room,enemy,p,B.explosionDamage,'焦油自爆',{posthumous:true,type:'mag'});
    if(room.enemyArena?.enemyId===enemy.instanceId)room.enemyArena=null;
    for(const p of Object.values(room.players))for(const [id,e] of Object.entries(p.enemyEffects||{})) {
      if((e.sourceId===enemy.instanceId && (id.startsWith('mark_') || id==='parasite')) || (state(enemy).id==='glutton'&&id==='parasite'))record(room,enemy,p,'來源死亡・標記解除','cleanse',()=>{delete p.enemyEffects[id];});
    }
  }
  if(room.enemyArena && room.players[room.enemyArena.playerId]?.hp<=0){const enemy=(room.enemies||[]).find(e=>e.instanceId===room.enemyArena.enemyId);const p=room.players[room.enemyArena.playerId];record(room,enemy,p,'死鬥結束','status',()=>{room.enemyArena=null;});}
  syncEnemySupport(room);
}
export function drainEnemyEvents(room, queue, sweep = true) {
  if(sweep)sweepEnemyDeaths(room);
  queue.push(...(room.enemyMechanicQueue || []));room.enemyMechanicQueue=[];
}

export function enemyRoundStart(room) {
  if(room.arena && room.arena.until<room.battleRound)room.p8ExitArena(room.enemyMechanicQueue ||= []);
  if(room.enemyArena && room.enemyArena.until<room.battleRound)room.enemyArena=null;
  if(room.arena && !room.arena.enemyId)room.arena.enemyId=room.currentMonster?.instanceId;
  for(const p of Object.values(room.players)) {
    p.enemyActionMultiplier=1;
    for(const [id,e] of Object.entries(p.enemyEffects||{}))if(e.until<room.battleRound)delete p.enemyEffects[id];
  }
  for(const enemy of living(room)) {
    const s=state(enemy);if(s.round===room.battleRound){enemy.untargetableThisRound=!!enemy.script?.specialUntargetableRound&&isEnemyUltimate(room,enemy);continue;}
    record(room,enemy,enemy,LABELS[s.id] || enemy.ultName,'status',()=>{
      s.round=room.battleRound;s.firstPhysicalUsed=false;s.armorBroken=false;s.reflected=0;s.extraCharge=0;s.parasiteHeal=0;
      s.charge=Math.min(B.chargeCap,s.charge+B.chargePerRound);s.heat=Math.min(B.heatCap,s.heat+B.heatPerRound);
      s.open=(s.openUntil||0)>=room.battleRound;enemy.openDefenseReduction=s.open?B.mimicDefenseReduction:0;
      if(enemy.script?.passiveErrorPerRound)s.error=Math.min(B.errorCap,s.error+enemy.script.passiveErrorPerRound);
      enemy.untargetableThisRound=!!enemy.script?.specialUntargetableRound && isEnemyUltimate(room,enemy);
    });
    if(['shadow_alpha','labyrinth_crossbowman','shady_merchant'].includes(s.id)) {
      if(s.id==='labyrinth_crossbowman' && s.targetId && s.aimRound<room.battleRound) s.readyAim=true;
      else if(s.id!=='shady_merchant'||!s.targetId||(room.battleRound-1)%B.bountyPeriod===0) {
        const target=lowest(players(room));
        if(target){s.targetId=target.id;s.aimRound=room.battleRound;status(room,enemy,target,'mark_'+enemy.instanceId,LABELS[s.id],1,1);}
      }
    }
  }
  syncEnemySupport(room);
  for(const enemy of living(room)) {
    const s=state(enemy),script=enemy.script;
    if(script?.specialWolfDamage && s.transformRound===room.battleRound){
      s.transformRound=0;const wolf=Math.random()<B.wolfFormChance;s.form=wolf?'werewolf':'treant';
      if(wolf)record(room,enemy,enemy,'狼人變形','damage',()=>{enemy.hp=Math.max(1,enemy.hp-Math.floor(enemy.maxHp*script.specialWolfHpCostRatio));});
      else heal(room,enemy,enemy,enemy.maxHp*script.specialTreantHealRatio,'遠古樹精變形');
      strike(room,enemy,choose(room),wolf?script.specialWolfDamage:script.specialTreantDamage,'深淵變形・突擊');
    }
  }
  for(const enemy of living(room)) {
    const support=state(enemy);if(support.supportRound===room.battleRound)continue;support.supportRound=room.battleRound;
    const id=support.id;
    const golem=find(room,'ancient_golem'),blood=find(room,'blood_sorcerer'),scorpion=find(room,'crystal_scorpion');
    if(id==='ancient_repair_drone'&&golem) {
      shield(room,enemy,golem,B.repairShield,'維修護盾');
      if(state(golem).extraCharge<B.repairExtraChargeCap)record(room,enemy,golem,'維修充能','status',()=>{state(golem).extraCharge++;state(golem).charge=Math.min(B.chargeCap,state(golem).charge+1);});
    }
    if(id==='blood_moon_acolyte'&&blood&&enemy.hp>B.sacrificeHp) {
      record(room,enemy,enemy,'血咒獻祭','damage',()=>{enemy.hp-=B.sacrificeHp;});shield(room,enemy,blood,B.sacrificeShield,'獻祭護盾');
    }
    if(id==='crystal_beetle'&&scorpion)shield(room,enemy,scorpion,B.beetleShield,'晶體護盾');
  }
}
export const isEnemyUltimate=(room,enemy)=>room.battleRound%(enemy.script?.specialEveryNRounds||B.ultimatePeriod)===0;

export function beforePlayerAction(room,p) {
  p.enemyActionMultiplier=1;p.enemyFrostConsumed=false;
}
export function beforeEnemyDamage(room,enemy,raw,type,actor,kind,defense = true) {
  if(enemy.hp<=0 || !enemyCanParticipate(room,enemy))return 0;
  if(enemy.untargetableThisRound){record(room,enemy,enemy,'虛無暗影步・免傷','status',()=>false);return 0;}
  let value=raw;
  if(actor && !kind) {
    const frost=enemyEffect(room,actor,'frost');
    if(value>0 && frost?.value>=B.frostThreshold && !actor.enemyFrostConsumed){actor.enemyActionMultiplier=1-B.frostDamageReduction;actor.enemyFrostConsumed=true;delete actor.enemyEffects.frost;}
    value*=actor.enemyActionMultiplier||1;
    if(enemyEffect(room,actor,'seal_zero'))value=0;
  }
  if(!defense)return Math.max(0,Math.floor(value));
  const s=state(enemy);
  if(!lockedArena(room)) {
    if(type==='mag'&&value>0&&s.id==='lava_colossus'&&!s.armorBroken)record(room,enemy,enemy,'岩甲失效','status',()=>{s.armorBroken=true;});
    if(type==='phys'&&value>0&&!s.firstPhysicalUsed&&['gel_slime','lava_colossus'].includes(s.id)&&!s.armorBroken) {
      value=Math.max(1,Math.floor(value*(1-B.physicalFirstReduction)));record(room,enemy,enemy,LABELS[s.id],'status',()=>{s.firstPhysicalUsed=true;});
    }
    if(s.id==='treasure_mimic'&&!s.open&&!s.firstPhysicalUsed&&value>0){value=Math.max(1,Math.floor(value*(1-B.mimicReduction)));record(room,enemy,enemy,'閉箱減傷','status',()=>{s.firstPhysicalUsed=true;});}
  }
  return Math.max(0,Math.floor(value));
}
export function redirectEnemyDamage(room,enemy,actor,damage,kind) {
  if(!actor||kind||damage<=0)return false;
  const confused=enemyEffect(room,actor,'confuse');
  const backlash=enemyEffect(room,actor,'backlash');
  if(backlash)strike(room,enemy,actor,Math.floor(damage*backlash.value),'血咒反噬',{secondary:true,noDodge:true,trueDamage:true});
  if(!confused)return false;
  const ally=room.pickTargetWithTaunt(players(room).filter(p=>p.id!==actor.id));
  if(ally)strike(room,actor,ally,damage,'群體惑亂・轉向隊友',{secondary:true,type:'phys'});
  return true;
}
export function afterPlayerDamage(room,step) {
  if(!step)return;
  room.enemyReactionSteps ||= new WeakSet();if(room.enemyReactionSteps.has(step))return;room.enemyReactionSteps.add(step);
  const byEnemy=new Map();
  for(const result of step.results||[]) {
    const enemy=(room.enemies||[]).find(e=>e.instanceId===(result.targetEnemyId||result.targetBefore?.instanceId));
    if(!enemy||result.kind!=='damage')continue;
    const damage=Math.max(0,(result.targetBefore?.hp||0)-(result.targetAfter?.hp||0))+Math.max(0,(result.targetBefore?.tempHp||0)-(result.targetAfter?.tempHp||0));
    const physical=['physical','phys'].includes(result.damageType);
    const prev=byEnemy.get(enemy)||{damage:0,physical:0};prev.damage+=damage;if(physical)prev.physical+=damage;byEnemy.set(enemy,prev);
  }
  const actor=room.players[step.sourceId];
  for(const [enemy,hit] of byEnemy) {
    const s=state(enemy),script=enemy.script||{};
    if(enemy.hp>0&&s.id==='crystal_scorpion'&&hit.physical>0&&s.reflected<B.crystalReflectPerRound) {
      s.reflected++;strike(room,enemy,actor,Math.min(B.crystalReflectCap,Math.max(1,Math.floor(hit.physical*(B.crystalReflect+(enemy.crystalSupport?B.beetleReflectBonus:0))))),'晶甲反射',{secondary:true});
    }
    if(enemy.hp>0&&hit.damage>0&&script.basicCounterChance&&Math.random()<script.basicCounterChance)strike(room,enemy,actor,script.basicCounterDamage,'見切反擊',{secondary:true});
    if(enemy.hp>0&&hit.damage>0&&script.specialReflectDamageRatio&&isEnemyUltimate(room,enemy))strike(room,enemy,actor,Math.min(B.scriptReflectCap,Math.floor(hit.damage*script.specialReflectDamageRatio)),'荊棘反傷',{secondary:true,posthumous:true});
  }
  sweepEnemyDeaths(room);
}

export function onPlayerHealed(room,p,actual) {
  const parasite=enemyEffect(room,p,'parasite'),boss=find(room,'glutton');
  if(!parasite||!boss||actual<=0)return;
  const amount=Math.min(B.parasiteCap,B.parasiteHealPerRoundCap-state(boss).parasiteHeal,Math.floor(actual*B.parasiteRatio));
  if(amount>0){state(boss).parasiteHeal+=amount;heal(room,boss,boss,amount,'寄生汲取');}
}

// Returns false only for an unknown custom template, retaining the legacy path.
export function runEnemyAction(room,enemy,queue) {
  const s=state(enemy),id=s.id,script=enemy.script;
  const eventStart=(room.enemyMechanicQueue||[]).length;
  if(!id)return false;
  if(!enemyCanParticipate(room,enemy)||enemy.hp<=0||s.actedRound===room.battleRound)return true;
  s.actedRound=room.battleRound;
  const blocked=enemy.stunnedThisRound||enemy.stunnedNextTurn||enemy.sealedThisRound||(enemy.talismans||[]).includes('seal');
  if(blocked){record(room,enemy,enemy,'行動受阻','status',()=>false);enemy.stunnedThisRound=false;enemy.stunnedNextTurn=false;drainEnemyEvents(room,queue);return true;}
  const blind=(enemy.talismans||[]).filter(t=>t==='blind').length;
  if(blind && (typeof enemy.talismanBlindMiss==='boolean'?enemy.talismanBlindMiss:Math.random()<(enemy.talismanBlindAvoidRate??(B.talismanBlindMin+Math.random()*B.talismanBlindRange)))){record(room,enemy,enemy,'障目符・攻擊失敗','status',()=>false);drainEnemyEvents(room,queue);return true;}
  const confuse=(enemy.talismans||[]).filter(t=>t==='confuse').length;
  if(confuse){record(room,enemy,enemy,'惑心反噬','damage',()=>{enemy.hp=Math.max(0,enemy.hp-Math.floor(enemy.attack*(enemy.talismanConfuseRatio??(B.talismanConfuseMin+Math.random()*B.talismanConfuseRange))*confuse));});if(enemy.hp<=0){drainEnemyEvents(room,queue);return true;}}
  const ult=isEnemyUltimate(room,enemy);
  const label=ult?enemy.ultName:enemy.basicName || '普通攻擊';
  let raw=script ? (ult?(script.specialDamage??script.specialBaseDamage??(script.specialHitDamage||0)*(script.specialMultiHits||1)) : script.basicDamage) : Math.floor(enemy.attack*(ult?B.ultimateMultiplier:1));
  let type=['blood_sorcerer','corrosive_serpent','banshee','hellstrider','hellfire_imp','abyss_mage','abyss_alchemist'].includes(id)?'mag':'phys';
  let preferred=s.targetId;
  if(id==='cave_goblin_rogue')preferred=lowest(players(room))?.id;
  if(id==='shadow_wolf_pup')preferred=find(room,'shadow_alpha')?.mechanics.targetId;
  const target=choose(room,preferred);
  if(!target){drainEnemyEvents(room,queue);return true;}
  if(id==='labyrinth_crossbowman') {
    if(s.readyAim){raw=Math.floor(raw*B.aimedShotMultiplier);s.readyAim=false;s.targetId=null;}
  }
  if(id==='cave_goblin_rogue'&&!(target.tempHp>0))raw+=B.goblinUnshieldedBonus;
  if(id==='abyss_remnant'&&(room.getHpSnapshot().players.find(p=>p.id===target.id)?.statuses.some(s=>s.isNegative)||target.stunnedNextTurn||target.nextTurnStunFlag))raw+=B.remnantBonus;
  if(ult&&id==='shadow_alpha')raw=Math.floor(raw*B.wolfUltimateMultiplier);
  if(ult&&id==='ancient_golem'){raw=Math.floor(raw*(1+s.charge*B.chargeBonus));record(room,enemy,enemy,'過載・消耗充能','status',()=>{s.charge=0;});}
  if(ult&&id==='hellstrider'){raw=Math.floor(raw*(1+s.heat*B.heatBonus));record(room,enemy,enemy,'天火・消耗熱度','status',()=>{s.heat=0;});}
  if(script) {
    if(!ult&&script.basicSelfHpCostRatio)record(room,enemy,enemy,'狂血代價','damage',()=>{enemy.hp=Math.max(1,enemy.hp-Math.floor(enemy.hp*script.basicSelfHpCostRatio));});
    if(ult&&script.specialMinDamage)raw=script.specialMinDamage+Math.floor(Math.random()*(script.specialMaxDamage-script.specialMinDamage+1));
    if(ult&&script.specialShieldCurrentHpRatio)shield(room,enemy,enemy,enemy.hp*script.specialShieldCurrentHpRatio,label,B.scriptShieldMaxHpRatio);
    if(ult&&script.specialCleanseSelf)record(room,enemy,enemy,'禁忌淨化','cleanse',()=>{
      for(const key of ['poison','burn','fracture','chill']){enemy[key+'Turns']=0;enemy[key+'Dmg']=0;}
      if(enemy.corrosionMaxHpDeducted){enemy.maxHp+=enemy.corrosionMaxHpDeducted;enemy.corrosionMaxHpDeducted=0;}
      enemy.corrosionTurns=0;enemy.talismans=[];enemy.p8Effects={};
    });
    if(ult&&script.specialSelfHealMaxHpRatio)heal(room,enemy,enemy,enemy.maxHp*script.specialSelfHealMaxHpRatio,label);
    if(ult&&script.specialWolfDamage) {record(room,enemy,enemy,'深淵變形・預告','status',()=>{s.transformRound=room.battleRound+1;});raw=0;}
    if(ult&&script.specialForceArena&&!lockedArena(room))record(room,enemy,target,label,'status',()=>{room.enemyArena={playerId:target.id,enemyId:enemy.instanceId,until:room.battleRound+B.arenaTurns};});
    if(ult&&script.specialConfuseAllPlayers)for(const p of players(room))status(room,enemy,p,'confuse','群體惑亂');
    if(ult&&script.specialApplyPlayerCurse) {
      const curse=script.specialApplyPlayerCurse[Math.floor(Math.random()*script.specialApplyPlayerCurse.length)];
      const value=curse==='backlash'?B.curseBacklashMin+Math.random()*(B.curseBacklashMax-B.curseBacklashMin):curse==='vulnerable'?B.curseVulnerable:1;
      status(room,enemy,target,curse,'血咒印・'+({backlash:'反噬',seal_zero:'封勁',vulnerable:'易傷'}[curse]),value);
    }
    if(ult&&script.specialAllPlayersCooldownPlus)for(const p of players(room))record(room,enemy,p,label,'status',()=>{for(const key of Object.keys(p.cooldowns))p.cooldowns[key]+=script.specialAllPlayersCooldownPlus;});
    if(ult&&script.specialBaseDamage){raw+=s.error;if(script.specialResetError)record(room,enemy,enemy,'方程・誤差歸零','status',()=>{s.error=0;});}
  }
  const devour = () => {
    if(!ult || id!=='glutton' || target.hp<=0)return;
    const amount=Math.min(B.devourCap,Math.floor((target.tempHp||0)*B.devourRatio));
    if(amount>0){record(room,enemy,target,'吞噬護盾','damage',()=>{target.tempHp-=amount;room.p8ConsumeShield(target,amount);});heal(room,enemy,enemy,amount,'暴食回復');}
  };
  const trueDamage=!!script?.basicTrueDamage&&!ult;
  const hitCount=ult&&script?.specialMultiHits?script.specialMultiHits:1;
  if(ult&&script?.specialMultiHits)raw=script.specialHitDamage;
  if(script)raw=Math.floor(raw*(enemy.scriptDamageScale||1));
  const focused=!!script || ['shadow_alpha','shadow_wolf_pup','cave_goblin_rogue','labyrinth_crossbowman','shady_merchant'].includes(id);
  const targets=ult&&id==='abyss_sage'?players(room):focused?[target]:players(room);
  const assignments=new Map(targets.map(p=>[p.id,focused || id==='abyss_sage' ? raw||0 : Math.floor((raw||0)*B.scatterAoeRatio)]));
  let scatter=focused?0:Math.max(0,(raw||0)-Math.floor((raw||0)*B.scatterAoeRatio));
  const intercept=(damage)=>{
    if(lockedArena(room))return damage;
    for(const owner of Object.values(room.players))for(const minion of owner.minions||[]) {
      if(minion.hp<=0||damage<=0)continue;
      const amount=Math.min(minion.hp,damage);
      record(room,enemy,minion,'召喚物攔截','intercept',()=>{minion.hp-=amount;},{ownerId:owner.id,minion:structuredClone(minion)});damage-=amount;
      if(minion.hp<=0)owner.minions=owner.minions.filter(m=>m.hp>0);
    }
    return damage;
  };
  scatter=intercept(scatter);
  while(scatter>0){const p=choose(room);if(!p)break;const amount=Math.min(scatter,B.scatterStepMin+Math.floor(Math.random()*B.scatterStepRange));assignments.set(p.id,(assignments.get(p.id)||0)+amount);scatter-=amount;}
  let totalHpDamage=0;
  for(const p of targets)for(let i=0;i<hitCount;i++) {
    let damage=assignments.get(p.id)||0;
    if(ult&&id==='banshee'&&enemyEffect(room,p,'unrest'))damage=Math.floor(damage*(1+B.unrestBonus));
    if(damage<=0)continue;
    if(focused)damage=intercept(damage);
    if(damage>0)strike(room,enemy,p,damage,label,{type,trueDamage,beforeHit:p.id===target.id?devour:null});
  }
  totalHpDamage=(room.enemyMechanicQueue||[]).slice(eventStart).flatMap(step=>step.results).filter(r=>r.kind==='damage' && room.players[r.targetId]).reduce((n,r)=>n+Math.max(0,r.targetBefore.hp-r.targetAfter.hp),0);
  if(totalHpDamage>0) {
    if(ult&&id==='blood_sorcerer')heal(room,enemy,enemy,totalHpDamage*B.bloodLifesteal,'血月汲取');
    if(ult&&script?.specialLifestealRatio)heal(room,enemy,enemy,totalHpDamage*script.specialLifestealRatio,label);
    if(!ult&&script?.basicShieldMultiplier)shield(room,enemy,enemy,totalHpDamage*script.basicShieldMultiplier,label,B.scriptShieldMaxHpRatio);
  }
  // Debuffs apply only after an actual nonzero hit, never after dodge or block.
  const hitIds=new Set((room.enemyMechanicQueue||[]).slice(eventStart).filter(step=>step.sourceId===enemy.instanceId&&step.actionId===label).flatMap(step=>step.results).filter(r=>r.kind==='damage'&&r.finalDamage>0&&room.players[r.targetId]).map(r=>r.targetId));
  for(const targetId of hitIds) {
    const target=room.players[targetId];
    if((ult&&id==='lava_colossus')||id==='hellfire_imp')status(room,enemy,target,'ember','熔岩灼燒',B.burnDamage,B.burnTurns);
    if((ult&&id==='corrosive_serpent'))status(room,enemy,target,'shield_decay','腐蝕毒液・護盾獲取降低',B.shieldGainReduction);
    if(id==='corrosive_slime')status(room,enemy,target,'acid_defense','酸液・防禦降低',B.acidDefenseReduction);
    if((ult&&id==='frost_knight')||id==='frostbone_skeleton')status(room,enemy,target,'frost','寒霜印記',Math.min(B.frostThreshold,(enemyEffect(room,target,'frost')?.value||0)+1),B.frostMarkTurns);
    if(id==='carrion_crawler')status(room,enemy,target,'parasite','寄生',1,B.parasiteTurns);
    if(id==='whispering_apparition')status(room,enemy,target,'unrest','心神不寧');
    if(ult&&script?.specialWeakenAtk)status(room,enemy,target,'attack_down','攻擊壓制',script.specialWeakenAtk);
    if(!ult&&script?.basicApplyNextHitVulnerable)status(room,enemy,target,'next_vulnerable','向量崩解・下次受傷增加',script.basicApplyNextHitVulnerable);
    if(!ult&&script?.basicRandomFlaskDot){const dot=script.basicRandomFlaskDot[Math.floor(Math.random()*script.basicRandomFlaskDot.length)],cfg=B.flaskDots[dot];status(room,enemy,target,'flask_'+dot,'異常瓶・'+dot,cfg.damage,cfg.turns);}
    if(id==='hellfire_imp'){const boss=find(room,'hellstrider');if(boss&&state(boss).extraCharge<B.impExtraHeatCap)record(room,enemy,boss,'煉獄充能','status',()=>{state(boss).extraCharge++;state(boss).heat=Math.min(B.heatCap,state(boss).heat+1);});}
  }
  if(id==='shadow_wolf_pup'&&find(room,'shadow_alpha')&&s.assistRound!==room.battleRound) {
    s.assistRound=room.battleRound;strike(room,enemy,choose(room,preferred),B.wolfAssistDamage,'協同狩獵');
  }
  if(id==='treasure_mimic')record(room,enemy,enemy,'開箱・破綻','status',()=>{s.open=true;s.openUntil=room.battleRound+B.debuffTurns;enemy.openDefenseReduction=B.mimicDefenseReduction;});
  drainEnemyEvents(room,queue);return true;
}

export function enemyPlayerRoundTicks(room) {
  for(const p of players(room))for(const [id,e] of Object.entries(p.enemyEffects||{})) {
    if(e.until<room.battleRound||!(id==='ember'||id.startsWith('flask_')))continue;
    const source=(room.enemies||[]).find(m=>m.instanceId===e.sourceId);
    // Existing burns persist after the caster dies, unlike support abilities.
    if(source)strike(room,source,p,e.value,e.label,{posthumous:true,secondary:true,noDodge:true,trueDamage:true,dot:true});
    if(e.until===room.battleRound)delete p.enemyEffects[id];
  }
}
