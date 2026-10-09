(function(global){
  function project(classes,details){
    const next=Object.fromEntries(Object.entries(classes).map(([id,c])=>{const p=StudioContent.find('role_profiles',id);return [id,{...c,name:p?.name_zh||c.name,desc:p?.short_intro??c.desc,avatar:assetRegistry.resolve('role.'+id+'.avatar',c.avatar),skills:c.skills.map(s=>({...s,label:getSkillDisplayName(id,s)}))}];}));
    const d=Object.fromEntries(Object.entries(details||{}).map(([id,row])=>{const p=StudioContent.find('role_profiles',id);return [id,{...row,roleName:p?.name_zh||row.roleName,enName:p?.name_en||row.enName,passive:p?.passive_full??row.passive,type:p?.position_label??row.type}];}));return {classes:next,details:d};
  }
  function copyKey(role,skill,player={}) {
    if(role==='sage')return skill.id+'__'+(player.sagePhase==='solve'?'solve':'hypothesis');
    if(role==='gladiator'&&skill.id!=='basic')return skill.id+(player.arenaActive?'__arena':'__outside');
    if(role==='archer'&&skill.id==='basic'&&player.equips?.some(e=>e.id==='a_crossbow'))return 'basic__crossbow';
    if(role==='druid'&&skill.id==='basic'&&player.druidForm)return 'basic__'+player.druidForm;
    return skill.id;
  }
  function skillDisplay(role,skill,player){const copy=StudioContent.find('skill_copies',role+':'+copyKey(role,skill,player));if(!copy)return skill;return {...skill,label:copy.display_name,copyKey:copyKey(role,skill,player),copyVars:{rageMultiplier:player?.equips?.some(e=>e.id==='g_cingulum')?15:10}};}
  global.StudioGame={project,copyKey,skillDisplay};
  document.addEventListener('DOMContentLoaded',()=>{void StudioContent.load();});
})(window);
