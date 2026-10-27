// Recorded presentation fixtures plus isolated, configurable Samurai previews.
import fs from 'node:fs';
import vm from 'node:vm';
import { registerRoleRandom, reserveRoleRandom, clearRoleRandom } from '../game/DevRoleRandom.js';
import { sceneSteps } from '../public/js/lab/combat-fx-model.js';
import { CLASSES, ROLE_DETAILS, LOOT_TABLE, ENCOUNTERS, GENERAL_MINIONS, EXCLUSIVE_MINIONS, ABYSS_MINIONS, SPECIAL_ELITES, ABYSS_BOSSES, getPlayerSkills } from '../game/constants.js';

const read = file => fs.readFileSync(new URL('../public/js/lab/' + file, import.meta.url), 'utf8');
const context = vm.createContext({ structuredClone });
vm.runInContext(read('lab-combat-scenes.js'), context);
// Legacy acceptance snapshots are data only; never execute the old Lab controller.
vm.runInContext(read('presentation-lab.js'), context);
vm.runInContext(fs.readFileSync(new URL('../public/js/presentation/gladiator-presentation.js', import.meta.url), 'utf8'), context);
for (const file of ['samurai-lab-scenes.js', 'gladiator-lab-scenes.js', 'augur-lab-scenes.js', 'onmyoji-lab-scenes.js']) vm.runInContext(read(file), context);
const fixtures = vm.runInContext('({...PHASE6_LAB_SCENES,...PHASE5_ACCEPTANCE_SCENES,...SAMURAI_LAB_SCENES,...GLADIATOR_LAB_SCENES,...AUGUR_LAB_SCENES,...ONMYOJI_LAB_SCENES})', context);
// Saved Lab IDs reuse the current Gladiator recordings, including nonlethal judgment.
for(const [legacy,current] of Object.entries({p8_gladiator_sacrifice:'gladiator_sacrifice',p8_gladiator_challenge:'gladiator_challenge',p8_arena_g_sacrifice:'gladiator_assault',p8_arena_g_arena:'gladiator_suicide',basic_gladiator:'gladiator_basic',phase5_gladiator_basic:'gladiator_basic'}))fixtures[legacy]=fixtures[current];
const enemies = [
  ...ENCOUNTERS.map((e, i) => ({ ...e, id: 'boss_' + i, tier: 'ELITE', isBoss: true })),
  ...GENERAL_MINIONS, ...EXCLUSIVE_MINIONS, ...ABYSS_MINIONS,
  ...Object.values(SPECIAL_ELITES), ...Object.values(ABYSS_BOSSES).map(e => ({ ...e, tier: 'ABYSS', isBoss: true }))
].map(e => ({ ...e, tier: e.tier || 'MINION', maxHp: e.hp }));

const scenes = Object.entries(fixtures).flatMap(([id, scene]) => {
  if (!scene.steps?.length || scene.abyssState) return [];
  const actors = new Map();
  for (const step of scene.steps) {
    const player = step.hpSnapshotBefore?.players?.find(p => p.id === step.sourceId);
    const enemy = ['boss_action', 'enemy_mechanic'].includes(step.type);
    if (!enemy && !CLASSES[step.sourceRole]) continue;
    if (!step.actionId || (!step.results?.length && step.actionId!=='aug_observe' && !step.arenaPresentation)) continue;
    const sourceEnemy = step.hpSnapshotBefore?.enemies?.find(e => e.instanceId === step.sourceId) || step.hpSnapshotBefore?.monster;
    const role = enemy ? null : step.sourceRole;
    const name = enemy ? sourceEnemy?.name || step.monsterName : null;
    const hitsParty=(step.results||[]).some(r=>r.kind==='damage'&&step.hpSnapshotBefore?.players?.some(p=>p.id===r.targetId));
    const hitsEnemy=(step.results||[]).some(r=>r.targetEnemyId||r.targetId==='monster'||r.targetBefore?.instanceId);
    const targetSide=enemy&&hitsParty?'party':hitsEnemy?'enemy':'party';
    const skillId=step.actionId.replace(/_result$/,'');
    const key = [role, name, skillId].join(':');
    if (actors.has(key)) continue;
    actors.set(key, {
      id, label: scene.label || id, role, enemyName: name,
      actionId: step.actionId, skillId, skillName: step.skillName || step.actionId,
      ...(role==='gladiator'?{skillDescription:getPlayerSkills({role,hp:player?.hp||85,arenaActive:!!player?.arenaActive,equips:equipmentFor(id,step.actionId).map(gear=>LOOT_TABLE.find(e=>e.id===gear)).filter(Boolean)}).find(s=>s.id===skillId)?.desc}:{}),
      equips: player?.equips || [], actor: player || null, enemyState:enemy?sourceEnemy:null,
      targetSide,
      targetMode:!['dw_butterfly','dw_false_dream'].includes(skillId)&&step.results?.length&&step.results.every(r=>r.targetId===step.sourceId&&!['heal','shield'].includes(r.kind))?'self':'selected',
      steps: scene.steps.filter(s => enemy ? ['boss_action', 'enemy_mechanic'].includes(s.type) && s.actionId === step.actionId : s.sourceRole === role && s.actionId === step.actionId).length,
      type: step.type, tags: step.tags || [],
      equipmentIds: equipmentFor(id, step.actionId),
      // Enemy rendering includes independent animation clocks; retain native speed.
      speed: !enemy && !['samurai', 'sage', 'augur', 'onmyoji', 'dreamweaver', 'stargazer'].includes(role)
    });
  }
  return [...actors.values()];
});
for(const entry of scenes)entry.steps=sceneSteps(fixtures[entry.id],entry).length;

export const combatLabCatalog = {
  classes: CLASSES, details: ROLE_DETAILS, equipment: LOOT_TABLE,
  enemies, scenes, maxParty: 10,
  skillSets: Object.fromEntries(Object.entries(CLASSES).map(([role,c])=>[role,
    Object.fromEntries(['',...LOOT_TABLE.filter(e=>e.role===role).map(e=>e.id)].map(gear=>[gear,
      getPlayerSkills({role,hp:c.maxHp,equips:gear?[LOOT_TABLE.find(e=>e.id===gear)]:[],sagePhase:'hypothesis'})]))]))
};
export function combatLabFixture(id) {
  return Object.hasOwn(fixtures, id) ? fixtures[id] : null;
}

// Reuse the production resolver in an ephemeral Room. No registered/live room,
// real socket, persistent writes, victory ACK or background timers survive it.
export async function configuredSamuraiPreview(config,actionId,sceneId){
  const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
  const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
  const validId=id=>typeof id==='string'&&/^[\w-]{1,80}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
  if(!config||!Array.isArray(config.party)||!Array.isArray(config.enemies)||!integer(config.party.length,1,10)||!integer(config.enemies.length,1,3))invalid('隊伍或敵人配置無效');
  if(!['basic','sa_cut','sa_tsubame'].includes(actionId))invalid('此技能尚未支援自訂結算');
  if(sceneId!==undefined&&!scenes.some(s=>s.id===sceneId&&s.role==='samurai'&&s.actionId===actionId))invalid('演出情境不符');
  if(new Set([...config.party.map(p=>p.id),...config.enemies.map(e=>e.instanceId)]).size!==config.party.length+config.enemies.length)invalid('角色識別重複');
  for(const p of config.party)if(!validId(p.id)||!Object.hasOwn(CLASSES,p.role)||!integer(p.maxHp,1,1000000)||!integer(p.hp,0,p.maxHp))invalid('我方血量或職業無效');
  for(const e of config.enemies){
    if(!validId(e.instanceId)||!enemies.some(t=>t.id===e.id)||!integer(e.maxHp,1,1000000)||!integer(e.hp,0,e.maxHp))invalid('敵方血量或種類無效');
    for(const p of config.party)if(!integer(e.zanshin?.[p.id]??0,0,8))invalid('每名敵人的殘心必須為 0–8');
  }
  const actor=config.party.find(p=>p.id===config.actorId);
  if(actor?.role!=='samurai'||actor.hp<=0)invalid('請選擇存活武士');
  const soul=config.enemies.filter(e=>e.hp>0).reduce((n,e)=>n+(e.zanshin?.[actor.id]||0),0);
  if(actionId==='sa_tsubame'&&soul<4)invalid('燕返需要至少 4 層武魂');
  if(!config.enemies.some(e=>e.hp>0))invalid('需要存活敵人');
  const {Room}=await import('../game/Room.js'),events=[];
  const socket=id=>({id,join(){},emit(){}});
  const room=new Room('LAB-PREVIEW',socket(actor.id),actor.name||'武士',{to:()=>({emit:(...args)=>events.push(args)})});
  try{
    for(const source of config.party){
      if(!room.players[source.id])room.addPlayer(socket(source.id),source.name||CLASSES[source.role].name);
      // Imported Lab parties can repeat a role; production lobby rules stay intact.
      const roles=Object.values(room.players).filter(p=>p.id!==source.id).map(p=>[p,p.role]);roles.forEach(([p])=>p.role=source.role==='warrior'?'mage':'warrior');
      room.selectRole(source.id,source.role);roles.forEach(([p,role])=>p.role=role);
      const p=room.players[source.id];
      Object.assign(p,{hp:source.hp,maxHp:source.maxHp,action:source.id===actor.id?actionId:'skip',targetEnemyId:config.primaryId});
      p.equips=(source.equips||[]).map(e=>LOOT_TABLE.find(t=>t.id===e.id&&t.role===source.role)).filter(Boolean).map(e=>structuredClone(e));
    }
    room.state='IN_BATTLE';room.battleRound=integer(config.round,1,99)?config.round:1;
    room.setEnemies(config.enemies.map((source,index)=>{
      const template=enemies.find(e=>e.id===source.id),e=room.createEnemyInstance(template,index,{tier:template.tier});
      Object.assign(e,{instanceId:source.instanceId,hp:source.hp,maxHp:source.maxHp,zanshin:Object.fromEntries(config.party.filter(p=>p.role==='samurai').map(p=>[p.id,source.zanshin?.[p.id]||0]))});return e;
    }));
    room.currentMonster=room.enemies.find(e=>e.instanceId===config.primaryId&&e.hp>0)||room.getLivingEnemies()[0];
    if(sceneId&&actionId==='sa_cut'&&soul>0){
      const recorded=combatLabFixture(sceneId)?.steps.find(s=>s.actionId===actionId);
      registerRoleRandom(room,()=>true);
      reserveRoleRandom(room,{playerId:actor.id,skill:'sa_cut',outcome:recorded?.outcome?.type==='soul_burst'?'success':'failure'});
    }
    room.resolveTurnActions();
    const steps=(events.findLast(([name])=>name==='battle:presentation_queue')?.[1].queue||[]).filter(s=>s.sourceId===actor.id&&s.actionId===actionId);
    if(!steps.length)invalid('無法建立此技能的正式結果');
    return {configured:true,steps};
  }finally{clearRoleRandom(room);room.clearTimer();for(const key of ['presentationSafetyTimer','roundStartTimer','selectionReadyTimer'])clearTimeout(room[key]);}
}

function equipmentFor(id, action) {
  const matches={samurai_murasame:'sa_murasame',samurai_haori:'sa_haori',gladiator_xiphos:'g_xiphos',gladiator_cuirass:'g_cuirass',gladiator_cingulum:'g_cingulum',augur_amethyst:'aug_amethyst',augur_amethyst_stack:'aug_amethyst',augur_gilded:'aug_gilded_box',augur_tome_repay:'aug_forbidden_tome'};
  if(matches[id])return [matches[id]];
  if(id.includes('kepler'))return ['sg_eye'];
  if(id.includes('watch'))return ['sg_watch'];
  if(id.includes('crossbow')||['a_reload','a_frenzy_reload'].includes(action))return ['a_crossbow'];
  if(id.includes('resonance'))return ['dru_resonance'];
  if(action==='w_cleave')return ['w_greatsword'];
  if(['b_frenzy','b_nocturne'].includes(action))return ['b_violin'];
  return [];
}
