import { actorFor, clone } from './combat-fx-model.js';
const $=id=>document.getElementById(id);
const ui=Object.fromEntries([...document.querySelectorAll('[id]')].map(n=>[n.id,n]));
let catalog, config, selectedId, entry=null, state='CONFIGURING', stageReady=false, runId=0;
let skillId='sa_tsubame', variantId='', sampleKey='', fixtureCache=new Map();
const labels={READY:'準備就緒',CONFIGURING:'建立情境中…',PLAYING:'演出播放中',FINISHED:'演出完成',RESETTING:'正在重置…',ERROR:'無法播放'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
const idOf=p=>p.instanceId||p.id;
function setState(next,message=''){
  state=next;ui.status.dataset.state=next;ui.status.textContent=labels[next];
  ui.error.hidden=!message;ui.error.textContent=message;updatePlayback();
}
function newPlayer(role){const c=catalog.classes[role];return {id:'lab-player-'+crypto.randomUUID(),role,name:c.name,hp:c.maxHp,maxHp:c.maxHp,ATK_base:c.ATK_base,DEF:c.DEF,statuses:[],minions:[],equips:[],resourceSummary:'',soul:0,rage:0,bloodStacks:0,sagePhase:'hypothesis',sageX:30,sageOperand:0};}
function newEnemy(template,index){return {...clone(template),instanceId:'lab-enemy-'+crypto.randomUUID(),maxHp:template.maxHp||template.hp,statuses:[],tempHp:0};}
function initialConfig(){
  const boss=catalog.enemies.find(e=>e.name==='遠古守衛石像')||catalog.enemies.find(e=>e.isBoss);
  const party=['samurai','warrior'].map(newPlayer),enemies=[newEnemy(boss,0)];
  return {party,enemies,actorId:party[0].id,primaryId:enemies[0].instanceId,partyTargetId:party[0].id,round:1,classes:catalog.classes};
}
function actorEntries(){const actor=actorFor(config);if(!actor)return [];return catalog.scenes.filter(s=>actor.instanceId ? s.enemyName===actor.name || s.enemyName===actor.originalName : s.role===actor.role);}
function formalSkills(actor){
  if(!actor.instanceId)return catalog.skillSets[actor.role][actor.equips?.[0]?.id||'']||catalog.classes[actor.role].skills;
  return [...new Set([actor.basicName||'普通攻擊',actor.ultName].filter(Boolean))].map(name=>({id:name,label:name,desc:name===actor.ultName?actor.ultDesc||actor.desc:actor.basicDesc||actor.desc}));
}
function currentEntries(){
  const actor=actorFor(config),gear=actor?.equips?.[0]?.id,filter=actor?.labFilter;
  return actorEntries().filter(s=>s.skillId===skillId&&(!gear||s.equipmentIds.includes(gear))&&(!filter||String(s.actor?.[filter.key]??'')===filter.value));
}
function chooseEntry(){const entries=currentEntries();entry=entries.find(s=>s.id===variantId)||entries.find(s=>s.id==='samurai_tsubame')||entries.find(s=>s.id.startsWith('basic_'))||entries[0]||null;variantId=entry?.id||'';}
function configForStage(){return {...clone(config),classes:catalog.classes,previewAction:skillId};}
function send(type,payload={}){ui.stage.contentWindow.postMessage({source:'combat-fx-lab',type,runId,...payload},location.origin);}
function resetExecution(){
  ++runId;ui.progress.value=0;ui.progressText.textContent='準備播放';ui.timing.textContent='依正式演出時序播放';
  setState('RESETTING');if(stageReady)send('configure',{config:configForStage()});
}
function changeConfiguration(change,{rebuild=true}={}){
  setState('CONFIGURING');change();validateSelection();
  if(rebuild)render();resetExecution();
}
function validateSelection(){
  if(!config.party.some(p=>p.id===selectedId))selectedId=config.party[0].id;
  if(!actorFor(config))config.actorId=config.party[0].id;
  if(!config.enemies.some(e=>e.instanceId===config.primaryId))config.primaryId=config.enemies[0].instanceId;
  if(!config.party.some(p=>p.id===config.partyTargetId))config.partyTargetId=config.party[0].id;
  const actor=actorFor(config),available=actorEntries();
  const formal=formalSkills(actor);
  if(!available.some(s=>s.skillId===skillId)&&!formal.some(s=>s.id===skillId))skillId=formal[0]?.id||available[0]?.skillId||'';
  chooseEntry();
  const key=[config.actorId,entry?.id,entry?.actionId].join(':');
  if(entry?.actor&&sampleKey!==key){
    const actor=actorFor(config),{id,name,role,hp,maxHp,equips,labFilter}=actor;
    Object.assign(actor,clone(entry.actor),{id,name,role,hp,maxHp,equips,labFilter});
    if(entry.equipmentIds.length&&!equips.length)actor.equips=entry.equipmentIds.map(id=>clone(catalog.equipment.find(e=>e.id===id))).filter(Boolean);
  }
  if(entry?.enemyState&&sampleKey!==key){
    const actor=actorFor(config);
    for(const field of ['presentation','mechanics','statuses','phase8Statuses','tempHp','druidForm'])if(field in entry.enemyState)actor[field]=clone(entry.enemyState[field]);
  }
  sampleKey=key;
}
function renderParty(){
  ui.partyCount.textContent=`${config.party.length} / ${catalog.maxParty}`;
  ui.addPlayer.disabled=config.party.length>=catalog.maxParty;
  ui.partyList.innerHTML=config.party.map((p,i)=>`<button class="lab-unit" data-player="${p.id}" aria-pressed="${p.id===selectedId}"><img src="${esc(catalog.classes[p.role].avatar)}" alt=""><span class="lab-unit-copy"><strong>${esc(p.name)}</strong><small>位置 ${i+1}</small></span>${p.id===config.actorId?'<span class="lab-unit-mark">施放者</span>':''}</button>`).join('');
  const selected=config.party.find(p=>p.id===selectedId);
  ui.role.innerHTML=Object.entries(catalog.classes).map(([id,c])=>option(id,c.name)).join('');ui.role.value=selected.role;
  ui.removePlayer.disabled=config.party.length===1;
  const index=config.party.indexOf(selected);ui.moveUp.disabled=index===0;ui.moveDown.disabled=index===config.party.length-1;
  renderEquipment(selected);renderSpecial(selected);
}
function renderEquipment(player){
  const gear=catalog.equipment.filter(e=>e.role===player.role);
  ui.equipment.innerHTML=option('','基本裝備情境')+gear.map(e=>option(e.id,e.name+(catalog.scenes.some(s=>s.role===player.role&&s.equipmentIds.includes(e.id))?' · 已有樣本':' · 尚無獨立樣本'))).join('');
  ui.equipment.value=player.equips?.[0]?.id||'';
  ui.equipmentNote.textContent=player.equips?.length?'只顯示此裝備已接通的結果樣本；沒有對應樣本時不允許播放。':'裝備只建立演出情境，不執行傷害或裝備結算。';
}
function renderSpecial(player){
  const fields={druid:['druidForm','形態'],assassin:['isHiddenThisRound','隱身'],sage:['sagePhase','演算階段'],samurai:['soul','武魂'],gladiator:['rage','怒氣']};
  const field=fields[player.role];
  const names={'':'人形',werewolf:'狼人',treant:'遠古樹精',tree:'沉睡古樹',bear:'巨熊',hypothesis:'假設',solve:'求解',false:'未隱身',true:'隱身'};
  const values=field?[...new Set(catalog.scenes.filter(s=>s.role===player.role).map(s=>String(s.actor?.[field[0]]??'')))]:[];
  ui.specialFields.innerHTML=field?`<label class="lab-field">${field[1]}<select data-special="${field[0]}">${option('*','依選定樣本')+values.map(v=>option(v,names[v]??v)).join('')}</select></label>`:player.role==='augur'?'<p class="lab-help">觀測、諭示牌與償還情境可在演出控制的技能與結果樣本中指定。</p>':'';
  const select=ui.specialFields.querySelector('select');if(select)select.value=player.labFilter?.value??'*';
}
function renderEnemies(){
  for(const b of ui.enemyCount.querySelectorAll('button'))b.setAttribute('aria-pressed',String(Number(b.dataset.count)===config.enemies.length));
  const groups=[['MINION','一般敵人與隨從'],['ELITE','Boss 與菁英'],['ABYSS','深淵職業敵人']];
  const choices=groups.map(([tier,label])=>`<optgroup label="${label}">${catalog.enemies.filter(e=>e.tier===tier).map(e=>option(e.id,e.name)).join('')}</optgroup>`).join('');
  ui.enemyList.innerHTML=config.enemies.map((e,i)=>`<div class="lab-enemy-row"><img src="${esc(e.battleAvatar||e.avatar)}" alt=""><label class="lab-field"><small>位置 ${i+1}</small><select data-enemy="${i}" aria-label="位置 ${i+1} 敵人">${choices}</select></label><button data-move-enemy="${i}" title="向前移動" aria-label="向前移動位置 ${i+1} 敵人" ${i===0?'disabled':''}>↑</button></div>`).join('');
  config.enemies.forEach((e,i)=>{ui.enemyList.querySelector(`[data-enemy="${i}"]`).value=e.id;});
}
function renderPerformance(){
  const actor=actorFor(config),entries=actorEntries();
  ui.actor.innerHTML=`<optgroup label="我方角色">${config.party.map((p,i)=>option(p.id,`${i+1} · ${p.name}`)).join('')}</optgroup><optgroup label="敵方角色">${config.enemies.map((e,i)=>option(e.instanceId,`${i+1} · ${e.name}`)).join('')}</optgroup>`;ui.actor.value=config.actorId;
  const formal=formalSkills(actor);
  const known=new Set(formal.map(s=>s.id));
  const extra=[...new Map(entries.filter(e=>!known.has(e.skillId)).map(e=>[e.skillId,e])).values()];
  ui.skill.innerHTML=(formal.length?'<optgroup label="普通攻擊與主動技能">'+formal.map(s=>option(s.id,s.label+(entries.some(e=>e.skillId===s.id)?'':' · 尚未支援'))).join('')+'</optgroup>':'')+(extra.length?`<optgroup label="${actor.instanceId?'攻擊與特殊演出':'被動與特殊行動'}">${extra.map(s=>option(s.skillId,s.skillName)).join('')}</optgroup>`:'');
  if(!ui.skill.options.length)ui.skill.innerHTML=option('','尚無可用的正式演出樣本');
  ui.skill.value=skillId;
  const skill=formal.find(s=>s.id===skillId);
  ui.skillDescription.textContent=skill?.desc||(actor.instanceId?actor.desc:'已錄製的正式戰鬥結果；觸發條件由下方樣本指定。');
  ui.variant.innerHTML=currentEntries().map(s=>option(s.id,s.label)).join('')||option('','沒有可用樣本');ui.variant.value=variantId;
  const targetSide=entry?.targetSide||'enemy';
  const targets=entry?.targetMode==='self'?[actor]:targetSide==='enemy'?config.enemies:config.party;
  ui.target.innerHTML=targets.map((p,i)=>option(idOf(p),entry?.targetMode==='self'?`${p.name} · 自身`:`${i+1} · ${p.name}`)).join('');ui.target.value=entry?.targetMode==='self'?idOf(actor):targetSide==='enemy'?config.primaryId:config.partyTargetId;ui.target.disabled=entry?.targetMode==='self';
  ui.step.innerHTML=option('all','完整行動')+Array.from({length:entry?.steps||0},(_,i)=>option(String(i),`步驟 ${i+1}`)).join('');
  ui.speed.disabled=!entry?.speed||ui.phase.value!=='action';if(ui.speed.disabled)ui.speed.value='1';
  ui.speedNote.textContent=ui.speed.disabled?'此演出使用正式原速；暫不支援暫停與逐格。':'速度套用於下一次播放；暫不支援暫停與逐格。';
  ui.variant.disabled=!entry;ui.step.disabled=!entry||ui.phase.value!=='action';
  updatePlayback();
}
function supportIssue(){
  if(ui.phase.value!=='action')return '';
  if(!entry)return actorFor(config)?.equips?.length?'此技能、裝備與職業狀態尚無相符的正式演出樣本；請改選條件或基本裝備情境。':'此技能或指定狀態尚無可獨立播放的正式結果樣本。';
  return '';
}
function updatePlayback(){
  if(!config)return;
  const issue=supportIssue(),busy=['PLAYING','RESETTING','CONFIGURING'].includes(state);
  ui.play.disabled=!stageReady||busy||!!issue||state==='ERROR';ui.replay.disabled=ui.play.disabled;
  ui.support.dataset.supported=String(!issue);ui.support.textContent=issue||(ui.phase.value==='action'?'正式演出已接通。可選擇結果情境後播放。':'使用正式'+ui.phase.selectedOptions[0].textContent+'；保留目前隊伍與敵人配置。');
  const actor=actorFor(config),target=[...config.party,...config.enemies].find(p=>idOf(p)===ui.target.value);
  const skill=ui.skill.selectedOptions[0]?.textContent||'未選技能';
  ui.scenarioSummary.textContent=`${actor?.name||'未選演出者'} → ${ui.phase.value==='action'?skill:ui.phase.selectedOptions[0].textContent} → ${target?.name||'未選目標'}`;
  ui.phaseLabel.textContent=ui.phase.selectedOptions[0]?.textContent+(ui.phase.value!=='action'?'':ui.step.value==='all'?' · 完整行動':` · 步驟 ${Number(ui.step.value)+1}`);
}
function render(){renderParty();renderEnemies();renderPerformance();ui.round.value=config.round;}
async function play(){
  if(ui.play.disabled)return;
  const current=++runId;setState('PLAYING');ui.progress.value=0;ui.progressText.textContent='開始演出…';
  try{
    let fixture={steps:[]};
    if(ui.phase.value==='action'){
      if(!fixtureCache.has(entry.id)){const response=await fetch('/api/studio/combat-lab/scenes/'+encodeURIComponent(entry.id));if(!response.ok)throw new Error('無法載入正式演出樣本');fixtureCache.set(entry.id,await response.json());}
      fixture=fixtureCache.get(entry.id);
    }
    if(current!==runId)return;
    send('play',{config:configForStage(),fixture,entry,options:{phase:ui.phase.value,step:ui.step.value,speed:Number(ui.speed.value),sound:ui.sound.checked,reducedMotion:ui.reducedMotion.checked}});
  }catch(error){if(current===runId)setState('ERROR',error.message);}
}
function togglePanel(which){
  const narrow=matchMedia('(max-width:1190px)').matches;
  if(narrow){ui.workbench.classList.toggle('narrow-scenario',which==='scenario'&&!ui.workbench.classList.contains('narrow-scenario'));ui.workbench.classList.remove('performance-collapsed','scenario-collapsed');}
  else ui.workbench.classList.toggle(which+'-collapsed');
  syncPanelButtons();
}
function syncPanelButtons(){
  ui.showScenario.setAttribute('aria-expanded',String(getComputedStyle(ui.scenarioPanel).display!=='none'));
  ui.showPerformance.setAttribute('aria-expanded',String(getComputedStyle(ui.performancePanel).display!=='none'));
}
ui.showScenario.onclick=()=>togglePanel('scenario');ui.showPerformance.onclick=()=>togglePanel('performance');
ui.collapseScenario.onclick=()=>{if(matchMedia('(max-width:1190px)').matches)ui.workbench.classList.remove('narrow-scenario');else togglePanel('scenario');syncPanelButtons();};
ui.collapsePerformance.onclick=()=>{ui.workbench.classList.toggle('performance-collapsed');syncPanelButtons();};
matchMedia('(max-width:1190px)').addEventListener('change',syncPanelButtons);
ui.fullscreen.onclick=async()=>{try{await ui.stage.closest('.lab-center').requestFullscreen();}catch{ui.error.hidden=false;ui.error.textContent='瀏覽器無法進入全螢幕，請允許全螢幕後重試。';}};
const exitFullscreen=document.createElement('button');exitFullscreen.textContent='退出全螢幕';exitFullscreen.className='lab-small';exitFullscreen.hidden=true;ui.stage.closest('.lab-center').querySelector('.lab-stage-heading .lab-row').append(exitFullscreen);exitFullscreen.onclick=()=>document.exitFullscreen();
document.addEventListener('fullscreenchange',()=>{exitFullscreen.hidden=!document.fullscreenElement;});
ui.play.onclick=play;ui.replay.onclick=play;ui.resetPlayback.onclick=()=>resetExecution();
ui.resetScenario.onclick=()=>changeConfiguration(()=>{config=initialConfig();selectedId=config.party[0].id;skillId='sa_tsubame';variantId='';ui.phase.value='action';ui.speed.value='1';ui.sound.checked=true;ui.reducedMotion.checked=false;ui.preset.value='';});
ui.partyList.onclick=event=>{const b=event.target.closest('[data-player]');if(b){selectedId=b.dataset.player;renderParty();}};
ui.addPlayer.onclick=()=>changeConfiguration(()=>{if(config.party.length>=catalog.maxParty)return;const p=newPlayer('warrior');config.party.push(p);selectedId=p.id;});
ui.removePlayer.onclick=()=>changeConfiguration(()=>{if(config.party.length>1)config.party=config.party.filter(p=>p.id!==selectedId);});
ui.role.onchange=()=>changeConfiguration(()=>{const index=config.party.findIndex(p=>p.id===selectedId),id=selectedId;config.party[index]={...newPlayer(ui.role.value),id};if(config.actorId===id){skillId=catalog.classes[ui.role.value].skills[0]?.id||'';variantId='';}});
for(const [id,direction]of [['moveUp',-1],['moveDown',1]])ui[id].onclick=()=>changeConfiguration(()=>{const i=config.party.findIndex(p=>p.id===selectedId);if(config.party[i+direction])[config.party[i],config.party[i+direction]]=[config.party[i+direction],config.party[i]];});
ui.equipment.onchange=()=>changeConfiguration(()=>{const p=config.party.find(p=>p.id===selectedId);p.equips=ui.equipment.value?[clone(catalog.equipment.find(e=>e.id===ui.equipment.value))]:[];variantId='';sampleKey='';});
ui.specialFields.onchange=event=>changeConfiguration(()=>{const p=config.party.find(p=>p.id===selectedId),key=event.target.dataset.special,value=event.target.value;p.labFilter=value==='*'?null:{key,value};variantId='';sampleKey='';});
ui.enemyCount.onclick=event=>{const b=event.target.closest('[data-count]');if(b)changeConfiguration(()=>{const count=Number(b.dataset.count);while(config.enemies.length<count)config.enemies.push(newEnemy(catalog.enemies.find(e=>e.tier==='MINION')));config.enemies.length=count;});};
ui.enemyList.onchange=event=>changeConfiguration(()=>{const i=Number(event.target.dataset.enemy);const previous=config.enemies[i];config.enemies[i]={...newEnemy(catalog.enemies.find(e=>e.id===event.target.value),i),instanceId:previous.instanceId};variantId='';});
ui.enemyList.onclick=event=>{const b=event.target.closest('[data-move-enemy]');if(b)changeConfiguration(()=>{const i=Number(b.dataset.moveEnemy);if(i>0)[config.enemies[i],config.enemies[i-1]]=[config.enemies[i-1],config.enemies[i]];});};
ui.actor.onchange=()=>changeConfiguration(()=>{config.actorId=ui.actor.value;const actor=actorFor(config);if(!actor.instanceId)selectedId=actor.id;skillId='';variantId='';});
ui.skill.onchange=()=>changeConfiguration(()=>{skillId=ui.skill.value;variantId='';});
ui.variant.onchange=()=>changeConfiguration(()=>{variantId=ui.variant.value;});
ui.target.onchange=()=>changeConfiguration(()=>{if(entry?.targetSide==='party')config.partyTargetId=ui.target.value;else config.primaryId=ui.target.value;});
ui.round.onchange=()=>changeConfiguration(()=>{config.round=Math.max(1,Math.min(99,Number(ui.round.value)||1));});
ui.phase.onchange=()=>{renderPerformance();resetExecution();};
ui.step.onchange=()=>{updatePlayback();resetExecution();};
ui.speed.onchange=()=>resetExecution();ui.sound.onchange=()=>resetExecution();ui.reducedMotion.onchange=()=>resetExecution();
ui.preset.onchange=()=>{const preset=ui.preset.value;if(!preset)return;changeConfiguration(()=>{
  if(preset==='solo'||preset==='party'){
    const actor=actorFor(config);config.party=preset==='solo'?[actor?.role&&!actor.instanceId?clone(actor):newPlayer('samurai')]:['samurai','sage','augur','druid'].map(newPlayer);config.actorId=config.party[0].id;selectedId=config.actorId;config.partyTargetId=config.actorId;skillId='basic';variantId='';
  }else{const boss=catalog.enemies.find(e=>e.isBoss),minions=catalog.enemies.filter(e=>e.tier==='MINION');config.enemies=(preset==='boss'?[boss]:preset==='three'?minions.slice(0,3):[boss,...minions.slice(0,2)]).map(newEnemy);config.primaryId=config.enemies[0].instanceId;}
});ui.preset.value='';};
window.addEventListener('message',event=>{
  if(event.source!==ui.stage.contentWindow||event.origin!==location.origin||event.data?.source!=='combat-fx-stage')return;
  const data=event.data;
  if(data.type==='ready'){stageReady=true;if(config)resetExecution();return;}
  if(data.runId!==undefined&&data.runId!==runId)return;
  if(data.type==='configured'){ui.stageLoading.hidden=true;setState('READY');}
  if(data.type==='finished'){ui.progress.value=1;ui.progressText.textContent='播放完成 · 可直接重播';setState('FINISHED');}
  if(data.type==='error'){ui.stageLoading.hidden=true;setState('ERROR',data.message);}
  if(data.type==='progress'){ui.progress.value=data.value/data.total;ui.progressText.textContent=`步驟 ${data.value} / ${data.total}`;}
  if(data.type==='beat')ui.timing.textContent=({impact:'命中回饋',hp_update:'更新戰鬥資訊',samurai_slash:'武士斬擊'})[data.beat]||'正式演出進行中';
  if(data.type==='target'&&state!=='PLAYING')changeConfiguration(()=>{config.primaryId=data.id;});
});
ui.stage.addEventListener('load',()=>send('hello'));
send('hello');
try{
  const response=await fetch('/api/studio/combat-lab');if(!response.ok)throw new Error('無法載入 Lab 情境目錄');catalog=await response.json();
  config=initialConfig();selectedId=config.party[0].id;
  const params=new URLSearchParams(location.search),role=params.get('role'),scene=params.get('scene');
  if(role&&catalog.classes[role]){const id=config.party[0].id;config.party[0]={...newPlayer(role),id};skillId=params.get('skill')||'basic';}
  const linked=catalog.scenes.find(s=>s.id===scene);
  if(linked?.role){const id=config.party[0].id;config.party[0]={...newPlayer(linked.role),id};skillId=linked.skillId;variantId=linked.id;}
  validateSelection();render();syncPanelButtons();if(stageReady)resetExecution();else setState('CONFIGURING');
  if(params.has('binding')||params.has('story')){ui.error.hidden=false;ui.error.textContent='此連結指向舊版素材或文案預覽。Combat FX Lab 專注戰鬥演出；請使用原素材或文案後台。';}
}catch(error){setState('ERROR',error.message);}
