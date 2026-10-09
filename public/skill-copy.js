// Shared UI copy preferences; changing text never changes authoritative rules.
let skillCopyDetailed=localStorage.getItem('skillCopyDetailed')==='true';
let skillCopyDefaults={};
let skillCopyDetails={};
function skillCopyOverrides(){try{return JSON.parse(localStorage.getItem('skillCopyOverrides')||'{}');}catch{return {};}}
function registerSkillCopies(classes,details){skillCopyDefaults=classes||{};if(details)skillCopyDetails=details;}
function setSkillCopyDetailed(value){skillCopyDetailed=!!value;localStorage.setItem('skillCopyDetailed',String(skillCopyDetailed));}
function getSkillDescription(role,skill,detailed=skillCopyDetailed){
 if(skill.contextualCopy)return detailed?(skill.desc||''):(skill.shortDesc||skill.desc||'');
 const original=skillCopyDefaults[role]?.skills?.find(s=>s.id===skill.id)||skill;
 const override=skillCopyOverrides()[role+':'+skill.id];
 const full=skillCopyDetails[role]?.skills?.find(s=>s.name===skill.label)?.desc;
 return detailed?(override?.full??full??original.desc??''):(override?.short??skill.shortDesc??original.shortDesc??skill.desc??original.desc??'');
}
