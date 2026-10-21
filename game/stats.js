// v2 (2026-10-18): base attributes and typed equipment remain separate.
export const INITIAL_STATS = Object.freeze(Object.fromEntries(Object.entries({
  warrior:[120,8,12],paladin:[90,8,10],druid:[85,10,6],gladiator:[85,12,5],
  samurai:[80,13,6],archer:[80,14,2],mage:[80,15,0],dreamweaver:[75,10,3],
  bard:[70,9,4],alchemist:[70,10,3],stargazer:[70,11,2],augur:[70,10,3],
  onmyoji:[70,12,0],sage:[70,14,0],assassin:[50,16,0]
}).map(([role,[maxHp,attack,defense]])=>[role,{maxHp,attack,defense}])));
const magical = new Set(['mage','bard','alchemist','dreamweaver','stargazer','augur','onmyoji']);
export const basicDamageType = role => magical.has(role) ? 'mag' : 'phys';
export function equipmentAttack(item, role) {
  // Old saves/loot have one bonusAtk field. Its role affinity is explicit here.
  if (item.bonusPhysAtk !== undefined || item.bonusMagAtk !== undefined) {
    return {
      physical: Number(item.bonusPhysAtk ?? (!magical.has(item.role || role) ? item.bonusAtk : 0)) || 0,
      magic: Number(item.bonusMagAtk ?? (magical.has(item.role || role) ? item.bonusAtk : 0)) || 0
    };
  }
  const typed = item.PAtk_gear !== undefined || item.MAtk_gear !== undefined;
  return {physical:Number(item.PAtk_gear ?? (!typed && !magical.has(item.role || role) ? item.bonusAtk : 0)) || 0,
    magic:Number(item.MAtk_gear ?? (!typed && magical.has(item.role || role) ? item.bonusAtk : 0)) || 0};
}
export function resolveStats(actor, equipmentMultiplier=1) {
  const initial=INITIAL_STATS[actor.role] || {attack:0,defense:0};
  const equips=actor.equips || [];
  const legacy=equips.reduce((n,e)=>n+(e.bonusAtk||0),0);
  const growth=actor.victoryAtkBonus ?? Math.max(0,(actor.bonusAtk||0)-legacy);
  const ATK_base=(actor.ATK_base ?? initial.attack)+growth+(actor.warriorStacks||0);
  let physical=0,magic=0;
  for(const e of equips) {
    const multiplier=['g_xiphos','w_greatsword','b_violin','a_crossbow'].includes(e.id)?1:equipmentMultiplier;
    const bonus=equipmentAttack(e,actor.role);
    physical+=Math.floor(bonus.physical*multiplier);magic+=Math.floor(bonus.magic*multiplier);
  }
  // Explicit actor fields support imported typed equipment aggregates.
  return {ATK_base:Math.max(0,ATK_base),PAtk_gear:physical+(actor.PAtk_gear||0),MAtk_gear:magic+(actor.MAtk_gear||0),
    DEF:Math.max(0,(actor.DEF ?? actor.defense ?? initial.defense)+equips.reduce((n,e)=>n+Math.floor((e.bonusDef||0)*equipmentMultiplier),0))};
}
export function resolveSkillAttack({actor,damageType,equipmentMultiplier=1}) {
  if(!['phys','mag','physical','magic'].includes(damageType))throw new TypeError('Attack requires a physical or magic damage type');
  const s=resolveStats(actor,equipmentMultiplier);
  return s.ATK_base+(['phys','physical'].includes(damageType)?s.PAtk_gear:s.MAtk_gear);
}
export const defenseReduction = defense => Math.max(0,defense)/(Math.max(0,defense)+50);
export function mitigateDirectDamage(raw,{defense=0,resistance=0,penetration=0,damageType,ignoreReduction=false}={}) {
  if(!['phys','mag','physical','magic','true'].includes(damageType))throw new TypeError('Damage type required');
  if(raw<=0)return 0;
  if(ignoreReduction||damageType==='true')return Math.floor(raw);
  return Math.max(1,Math.floor(raw*(1-Math.max(0,resistance)*(1-penetration)/100)*(1-defenseReduction(defense))));
}
const basic={warrior:[1,.5],paladin:[1,.5],druid:[5,.5],gladiator:[4,.5],samurai:[3,.5],archer:[3,.5],mage:[4,.4],dreamweaver:[4,.6],bard:[1,1],alchemist:[5,.5],stargazer:[1,.8],augur:[5,.5],onmyoji:[4,.5],sage:[3,.5],assassin:[2,.5]};
// Every entry computes the formula BEFORE fate, damage buffs and mitigation.
export function skillValue(actor,key,{equipmentMultiplier=1,stacks=0,players=1,blocks=0}={}) {
  const P=resolveSkillAttack({actor,damageType:'phys',equipmentMultiplier});
  const M=resolveSkillAttack({actor,damageType:'mag',equipmentMultiplier});
  const D=resolveStats(actor,equipmentMultiplier).DEF,H=actor.maxHp;
  if(key==='basic') {
    if(actor.role==='druid'&&actor.druidForm==='werewolf')return Math.round(10+2.5*P);
    const [c,k]=basic[actor.role];return Math.round(c+k*(basicDamageType(actor.role)==='phys'?P:M));
  }
  const values={w_strike:4+P+.5*D,w_miss:1+.5*P,w_cleave:8+P+.75*D,w_shield:.4*H,
    pal_glory:7+P,pal_shield:.5*H,dru_claw:10+2.5*P,dru_shield:.85*H,
    g_strike:3+P+10*players+stacks*(13+P),g_rage:4+.5*P,
    sa_cut:2+P,sa_tsubame:3+.5*P,sa_counter:2+.5*P+.25*D+blocks,
    a_shot:6+Math.max(P,M),a_rain:5*P,a_rain_arrow:.5*P,a_trap:.25*P,a_friendly:3+.5*M,
    m_blast:15+2*M,m_secondary:6+.6*M,m_miss:4+.4*M,m_secondary_miss:1+.2*M,m_drain_max:5+3*M,
    b_heal:1+.3*H,b_single:.4*H,b_miss:.07*H,b_nocturne:6+M,b_frenzy:7+2*M,
    alc_flask:10+2.5*M,poison:3+.5*M,burn:5+.5*M,fracture:2+.3*M,chill:3+.3*M,
    alc_success:20+2*M,alc_failure:5+.5*M,alc_stable:5+M,
    sg_star:4+M,sg_planet:3+2*M,sg_bonus:1+.35*M,
    aug_reckon:5+M,aug_heal:5+.5*M,onm_detonate:stacks?4+.5*M+stacks*.25*M:0,
    sge_deduce:3+.5*P,sge_induce:3+.5*P,s_stab:3+2*P,s_smoke:6+1.5*P+stacks*(7+.5*P)};
  if(!(key in values))throw new Error(`Unknown v2 skill formula: ${key}`);
  return Math.round(values[key]);
}
export function crossbowAllocations(actor,ammo,equipmentMultiplier=1) {
  if(!ammo.length)return [];
  const [constant,coefficient]=({1:[17,2],2:[21,3],3:[19,5]})[ammo.length] || [];
  if(constant===undefined)throw new Error('Invalid magazine size');
  const s=resolveStats(actor,equipmentMultiplier);
  // Burst is existing true damage: no additional typed attack bonus.
  const rows=ammo.map((kind,index)=>{const attack=kind==='burst'?s.ATK_base:resolveSkillAttack({actor,damageType:kind==='elemental'?'mag':'phys',equipmentMultiplier});
    const raw=(constant+coefficient*attack)/ammo.length;return {kind,index,raw,damage:Math.floor(raw)};});
  let remainder=Math.round(rows.reduce((n,r)=>n+r.raw,0))-rows.reduce((n,r)=>n+r.damage,0);
  for(const row of [...rows].sort((a,b)=>(b.raw-b.damage)-(a.raw-a.damage)||a.index-b.index))if(remainder-->0)row.damage++;
  return rows;
}
