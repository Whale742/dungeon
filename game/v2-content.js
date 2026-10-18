import copy from './v2-copy.json' with {type:'json'};
export {copy as v2Copy};
export function v2SkillCopy(role,key) {
  const skills=copy[role]?.skills;
  if(!skills)return null;
  const aliases={basic_result:'basic',dw_butterfly_result:'dw_butterfly',dw_false_dream_result:'dw_false_dream',alc_acid:'basic',alc_poison:'alc_flask',w_counter:'w_strike',sa_counter:'passive'};
  return skills[key] || skills[aliases[key]] || null;
}
export function v2SkillKey(player,skill) {
  if(player.role==='sage')return skill.id+'__'+(player.sagePhase==='solve'?'solve':'hypothesis');
  if(player.role==='gladiator'&&skill.id!=='basic')return skill.id+(player.arenaActive?'__arena':'__outside');
  if(player.role==='archer'&&skill.id==='basic'&&player.equips?.some(e=>e.id==='a_crossbow'))return 'basic__crossbow';
  if(player.role==='druid'&&skill.id==='basic'&&player.druidForm)return 'basic__'+player.druidForm;
  return skill.id;
}
