// Presentation-only class characteristics; gameplay and canonical copy stay server-owned.
const LOBBY_ROLE_PROFILES = Object.freeze({
  warrior:{enName:'Warrior',tags:['TANK','物理','防護'],radar:['B','S','A','A','C'],passiveSummary:'承受傷害並守護全隊，以護盾與反擊維持前線。'},
  mage:{enName:'Mage',tags:['DPS','魔法','汲取'],radar:['S','C','D','C','B'],passiveSummary:'以魔法爆發與生命汲取輸出，威力強大但需要承擔走火風險。'},
  archer:{enName:'Archer',tags:['DPS','物理','穿透'],radar:['A','B','C','C','B'],passiveSummary:'遠程物理輸出，單體射擊與箭雨壓制各有風險。'},
  assassin:{enName:'Assassin',tags:['DPS','物理','暴擊','匿蹤'],radar:['S','C','D','B','A'],passiveSummary:'運用匿蹤與暴擊形成爆發，抓住出手時機。'},
  bard:{enName:'Bard',tags:['SUPPORT','群療','增益'],radar:['C','B','S','B','B'],passiveSummary:'治療、增益與復活支援隊伍，演奏也可能出現走音。'},
  alchemist:{enName:'Alchemist',tags:['SUPPORT','魔法','調和'],radar:['A','C','A','D','A'],passiveSummary:'調和試劑帶來腐蝕、劇毒與淨化，結果充滿變數。'},
  druid:{enName:'Druid',tags:['SUPPORT','自然','變身','召喚'],radar:['A','S','A','C','S'],passiveSummary:'切換狼人與樹精形態，運用自然僕從與全隊庇護。'},
  gladiator:{enName:'Gladiator',tags:['DPS','物理','怒氣'],radar:['S','A','D','B','A'],passiveSummary:'受傷積累怒氣，以鮮血獻祭與死亡角鬥場挑戰首領。'},
  stargazer:{enName:'Stargazer',tags:['SUPPORT','魔法','天象'],radar:['A','B','A','B','A'],passiveSummary:'觀測天象揭曉隨機結果，操控全隊技能冷卻與戰鬥節奏。'},
  dreamweaver:{enName:'Dreamweaver',tags:['SUPPORT','夢境','因果'],radar:['B','B','S','A','A'],passiveSummary:'編織夢境與扭曲因果，運用潛意識混淆、夢蝶迷思與偽造殘夢。'},
  samurai:{enName:'Samurai',tags:['DPS','物理','招架'],radar:['S','A','C','B','A'],passiveSummary:'積累武魂，以狂刀招架反擊，再施展秘劍 • 燕返。'},
  sage:{enName:'Sage',tags:['DPS','物理','演算'],radar:['A','C','B','C','S'],passiveSummary:'交替進行假設與求解，以運算元與變量推導方程結算。'}
});
const LOBBY_ROLE_ORDER=['warrior','mage','archer','assassin','bard','alchemist','druid','gladiator','stargazer','dreamweaver','samurai','sage'];
const LOBBY_RADAR_AXES=['輸出','生存','團隊','穩定性','難度'];
const LOBBY_RADAR_VALUES={S:100,A:80,B:60,C:40,D:20};
const lobbyRoleUi={role:null,confirmedRole:null,tab:'passive',detailed:true,data:null,radarValues:null,radarFrame:0};

function radarPoint(index, value, radius=76) {
  const angle=-Math.PI/2+index*Math.PI*2/5;
  return [140+Math.cos(angle)*radius*value/100,116+Math.sin(angle)*radius*value/100];
}
function renderRadarChart(role) {
  const svg=document.getElementById('lobbyRoleRadar'),profile=LOBBY_ROLE_PROFILES[role];
  if(!svg||!profile)return;
  if(!svg.children.length){
    svg.innerHTML='<circle class="radar-outer" cx="140" cy="116" r="76"/>'+[.2,.4,.6,.8].map(n=>`<circle class="radar-ring" cx="140" cy="116" r="${76*n}"/>`).join('')+
      LOBBY_RADAR_AXES.map((axis,i)=>{const end=radarPoint(i,100),label=radarPoint(i,100,104);return `<line class="radar-axis" x1="140" y1="116" x2="${end[0]}" y2="${end[1]}"/><text class="radar-label" x="${label[0]}" y="${label[1]-5}" text-anchor="middle">${axis}</text><text class="radar-grade" data-radar-grade="${i}" x="${label[0]}" y="${label[1]+13}" text-anchor="middle"></text>`;}).join('')+'<polygon class="radar-shape"/><g class="radar-vertices">'+LOBBY_RADAR_AXES.map(()=>'<circle r="3"/>').join('')+'</g>';
  }
  const target=profile.radar.map(grade=>LOBBY_RADAR_VALUES[grade]);
  svg.setAttribute('aria-label',profile.enName+'：'+LOBBY_RADAR_AXES.map((axis,i)=>axis+' '+profile.radar[i]).join('，')+'。難度 S 為最難');
  svg.querySelectorAll('[data-radar-grade]').forEach((n,i)=>n.textContent=profile.radar[i]);
  const draw=values=>{
    lobbyRoleUi.radarValues=values;
    const points=values.map((value,i)=>radarPoint(i,value));
    svg.querySelector('.radar-shape').setAttribute('points',points.map(p=>p.join(',')).join(' '));
    svg.querySelectorAll('.radar-vertices circle').forEach((node,i)=>{node.setAttribute('cx',points[i][0]);node.setAttribute('cy',points[i][1]);});
  };
  cancelAnimationFrame(lobbyRoleUi.radarFrame);
  if(!lobbyRoleUi.radarValues||matchMedia('(prefers-reduced-motion: reduce)').matches){draw(target);return;}
  const from=[...lobbyRoleUi.radarValues],start=performance.now();
  const frame=now=>{const p=Math.min(1,(now-start)/300),ease=p*p*(3-2*p);draw(target.map((n,i)=>from[i]+(n-from[i])*ease));if(p<1)lobbyRoleUi.radarFrame=requestAnimationFrame(frame);};
  lobbyRoleUi.radarFrame=requestAnimationFrame(frame);
}
function updateRoleDescriptionPanel() {
  const {classes,details}=lobbyRoleUi.data||{},role=lobbyRoleUi.role;
  if(!classes?.[role])return;
  const detail=details?.[role],conf=classes[role],isPassive=lobbyRoleUi.tab==='passive',skill=isPassive?null:conf.skills[Number(lobbyRoleUi.tab)];
  const detailed=document.getElementById('lobbyRoleDetailed').checked;
  document.querySelectorAll('[data-role-tab]').forEach(button=>{const active=button.dataset.roleTab===lobbyRoleUi.tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
  document.getElementById('lobbySkillName').textContent=isPassive?'被動與特性':skill?.label||'普通攻擊';
  document.getElementById('lobbySkillMeta').textContent=isPassive?'核心機制':[(skill?.dmgType==='mag'?'魔法':skill?.dmgType==='phys'?'物理':'輔助'),skill?.cd!=null?'CD '+skill.cd+' 回合':''].filter(Boolean).join(' · ');
  const copy=isPassive?(detailed?(detail?.passive||conf.passive||conf.desc):LOBBY_ROLE_PROFILES[role].passiveSummary):getSkillDescription(role,skill||{},detailed);
  document.getElementById('lobbySkillCopy').textContent=copy;
  document.getElementById('lobbyRoleDescription').classList.toggle('is-detailed',detailed);
}
function renderRoleDetailPanel() {
  const {classes,players,myId}=lobbyRoleUi.data,role=lobbyRoleUi.role,conf=classes[role],profile=LOBBY_ROLE_PROFILES[role];
  const avatar=document.getElementById('lobbyRoleAvatar');avatar.src=conf.avatar;avatar.alt=conf.name;
  document.getElementById('lobbyRoleName').textContent=conf.name;
  document.getElementById('lobbyRoleEnglish').textContent=profile.enName.toUpperCase();
  document.getElementById('lobbyRoleHp').textContent='基礎生命  '+conf.maxHp+' HP';
  document.getElementById('lobbyRoleTags').innerHTML=profile.tags.map((tag,i)=>`<span class="${i===0?'is-primary':''}">${escapeHtml(tag)}</span>`).join('');
  const me=players.find(p=>p.id===myId),others=players.filter(p=>p.role===role&&p.id!==myId);
  document.getElementById('roleSelectionStatus').textContent=me?.role===role?'已選擇此職業':others.length?'隊友已選 · 可共同選擇':'點擊頭像選擇職業';
  renderRadarChart(role);updateRoleDescriptionPanel();
}
function renderRolePortraitStrip() {
  const {classes,players,myId,onSelect}=lobbyRoleUi.data,container=document.getElementById('roleSelectionGrid');
  const scrollLeft=container.scrollLeft;container.replaceChildren();
  for(const role of LOBBY_ROLE_ORDER){
    const conf=classes[role];if(!conf)continue;
    const others=players.filter(p=>p.role===role&&p.id!==myId),selected=players.some(p=>p.id===myId&&p.role===role);
    const button=document.createElement('button');button.type='button';button.dataset.role=role;
    button.className='role-portrait-choice'+(selected?' is-selected':'')+(others.length?' is-occupied':'')+(lobbyRoleUi.role===role?' is-previewed':'');
    button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',conf.name+(selected?'，已選擇':'')+(others.length?'，'+others.map(p=>p.name).join('、')+'已選擇，可共同選擇':''));
    button.title=button.getAttribute('aria-label');
    button.innerHTML=`<img src="${escapeHtml(conf.avatar)}" alt=""><span class="role-choice-name">${escapeHtml(conf.name)}</span>`+(others.length?`<span class="role-choice-occupant">${escapeHtml(others.map(p=>Array.from(p.name).slice(0,2).join('')).slice(0,2).join(' / '))}${others.length>2?' +'+(others.length-2):''}</span>`:'')+(selected?'<span class="role-choice-check" aria-hidden="true">✓</span>':'');
    button.addEventListener('click',()=>{lobbyRoleUi.role=role;renderRoleDetailPanel();container.querySelectorAll('[data-role]').forEach(n=>n.classList.toggle('is-previewed',n.dataset.role===role));onSelect(role);});
    container.appendChild(button);
  }
  container.scrollLeft=scrollLeft;
}
function renderRoleLobby(data) {
  lobbyRoleUi.data=data;
  const me=data.players.find(p=>p.id===data.myId);
  if(!data.classes[lobbyRoleUi.role]||me?.role!==lobbyRoleUi.confirmedRole){lobbyRoleUi.role=me?.role||lobbyRoleUi.role||'warrior';lobbyRoleUi.confirmedRole=me?.role;}
  const toggle=document.getElementById('lobbyRoleDetailed');
  toggle.checked=lobbyRoleUi.detailed;
  if(!toggle.dataset.bound){
    toggle.dataset.bound='true';toggle.addEventListener('change',()=>{lobbyRoleUi.detailed=toggle.checked;setSkillCopyDetailed(toggle.checked);updateRoleDescriptionPanel();});
    const tabs=Array.from(document.querySelectorAll('[data-role-tab]'));
    tabs.forEach((button,index)=>{
      button.addEventListener('click',()=>{lobbyRoleUi.tab=button.dataset.roleTab;updateRoleDescriptionPanel();});
      button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;tabs[next].click();tabs[next].focus();});
    });
  }
  renderRolePortraitStrip();renderRoleDetailPanel();
}
