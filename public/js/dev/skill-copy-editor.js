document.addEventListener('DOMContentLoaded',async()=>{
 const role=document.getElementById('copyRole'),skill=document.getElementById('copySkill');if(!role)return;
 const short=document.getElementById('copyShort'),full=document.getElementById('copyFull'),notice=document.getElementById('copyNotice');
 try{
  const response=await fetch('/api/skill-copy');if(!response.ok)throw new Error('職業資料讀取失敗');const classes=await response.json();registerSkillCopies(classes);
  for(const [id,c] of Object.entries(classes))role.add(new Option(c.name,id));
  const selected=()=>classes[role.value].skills.find(s=>s.id===skill.value);
  const show=()=>{short.value=getSkillDescription(role.value,selected(),false);full.value=getSkillDescription(role.value,selected(),true);notice.textContent='';};
  const choices=()=>{skill.replaceChildren();for(const s of classes[role.value].skills)skill.add(new Option(s.label,s.id));show();};
  role.onchange=choices;skill.onchange=show;choices();
  document.getElementById('copySave').onclick=()=>{const data=skillCopyOverrides();data[role.value+':'+skill.value]={short:short.value,full:full.value};localStorage.setItem('skillCopyOverrides',JSON.stringify(data));notice.textContent='已儲存；同瀏覽器的遊戲畫面會使用此敘述。';};
  document.getElementById('copyReset').onclick=()=>{const data=skillCopyOverrides();delete data[role.value+':'+skill.value];localStorage.setItem('skillCopyOverrides',JSON.stringify(data));show();notice.textContent='已恢復原始敘述。';};
  document.getElementById('copyExport').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(skillCopyOverrides(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='skill-descriptions.json';a.click();URL.revokeObjectURL(url);};
 }catch(error){notice.textContent=error.message;}
});
