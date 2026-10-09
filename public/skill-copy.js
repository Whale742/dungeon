// Shared UI copy preferences; changing text never changes authoritative rules.
let skillCopyDetailed=localStorage.getItem('skillCopyDetailed')==='true';
let skillCopyDefaults={};
let skillCopyDetails={};
function skillCopyOverrides(){try{return JSON.parse(localStorage.getItem('skillCopyOverrides')||'{}');}catch{return {};}}
function registerSkillCopies(classes,details){skillCopyDefaults=classes||{};if(details)skillCopyDetails=details;}
function setSkillCopyDetailed(value){skillCopyDetailed=!!value;localStorage.setItem('skillCopyDetailed',String(skillCopyDetailed));}
function getSkillDescription(role,skill,detailed=skillCopyDetailed){
 if(skill.contextualCopy){
  const copy=skill.copyKey&&window.StudioContent?.skill(role,skill);
  if(copy)return window.StudioContent.template(detailed?copy.full_copy:copy.short_copy,skill.copyVars||{});
  return detailed?(skill.desc||''):(skill.shortDesc||skill.desc||'');
 }
 const original=skillCopyDefaults[role]?.skills?.find(s=>s.id===skill.id)||skill;
 const published=window.StudioContent?.skill(role,skill);
 const index=skillCopyDefaults[role]?.skills?.findIndex(s=>s.id===skill.id);
 const full=index>=0?skillCopyDetails[role]?.skills?.[index]?.desc:null;
 return detailed?(published?.full_copy??full??original.desc??''):(published?.short_copy??skill.shortDesc??original.shortDesc??skill.desc??original.desc??'');
}
function getSkillDisplayName(role,skill){return window.StudioContent?.skill(role,skill)?.display_name||skill.label||skill.skillName||'';}
