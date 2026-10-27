// Display state only. The server queue remains the sole owner of action order.
const BattleHud = (() => {
  let phase = 'SELECTING', entries = new Map(), announcement = null;
  let queuedSteps = [], deferredSteps = new Set();
  const queueAnimations = new Set();
  const companionEntries = new Map();
  const companionResults = step => step.type==='minion_action' ? (step.results||[]).filter(r=>r.kind==='damage'&&r.minion) : [];
  let analyzedAction = null, selectedAction = null;
  const byId = id => document.getElementById(id);
  const isReaction = step => ['sa_counter','w_counter'].includes(step.actionId || step.skillId);
  const announcementHoldMs = 1100;
  const allyStep = step => isBattlefieldPlayerStep(step) && step.category !== 'STATUS_TICK' &&
    !['arena_enter','arena_exit'].includes(step.type);
  function setPhase(next) {
    if (!['SELECTING','ALLY_ACTIONS','ENEMY_ACTIONS','ROUND_TICK'].includes(next)) return;
    phase = next;
    const view = byId('viewBattle');
    view.dataset.hudPhase = next;
    for (const selector of ['#playerActionCard','#hudPlayerInfo','#sageEquationTerminal']) {
      const node = document.querySelector(selector);
      if (node) node.inert = next !== 'SELECTING';
    }
    byId('hudPhaseNotice').textContent = next === 'ALLY_ACTIONS' ? '我方行動中…' : next === 'ENEMY_ACTIONS' ? '敵方行動中…' : '';
    hideTooltip();
    const overview=byId('partyOverview'),toggle=byId('partyOverviewToggle');
    if(toggle)toggle.hidden=next!=='SELECTING';
    if(next!=='SELECTING'&&overview){overview.hidden=true;toggle?.setAttribute('aria-expanded','false');}
    if(next!=='SELECTING'){
      if(typeof closeInventoryModal==='function'&&typeof elements!=='undefined'&&!elements.inventoryModal?.classList.contains('hidden'))closeInventoryModal();
      if(typeof elements!=='undefined'&&elements.targetModal&&!elements.targetModal.classList.contains('hidden'))ModalMotion.hide(elements.targetModal);
    }
  }
  function reset(next='SELECTING') {
    announcement?.abort(); announcement = null;
    for(const animation of queueAnimations)animation.cancel();queueAnimations.clear();
    entries.clear(); companionEntries.clear(); byId('hudActionQueue')?.replaceChildren();
    queuedSteps = []; deferredSteps.clear();
    byId('cinematicSkillBanner')?.classList.remove('is-active');
    setPhase(next);
  }
  function begin(queue) {
    entries.clear();
    companionEntries.clear();
    deferredSteps.clear();
    const host = byId('hudActionQueue'); host.replaceChildren();
    // Reactive attacks must stay undisclosed until the queue actually reaches them.
    queuedSteps=queue.filter(step=>allyStep(step)&&!isReaction(step));
    const pendingDruids=new Set();
    for(const step of queuedSteps){
      if(pendingDruids.has(step.sourceId))deferredSteps.add(step);else addEntry(step);
      if(step.sourceRole==='druid'&&step.results?.some(r=>['transform','summon'].includes(r.kind)))pendingDruids.add(step.sourceId);
    }
    positionQueue();
  }
  function addEntry(step,first=false) {
    const player = step.hpSnapshotBefore?.players?.find(p => p.id === step.sourceId) ||
      roomState.players.find(p => p.id === step.sourceId) || {role: step.sourceRole};
    const node = document.createElement('div'); node.className = 'queue-avatar-item';
    const minion = step.results?.find(r => r.minion)?.minion;
    const companions=companionResults(step);
    if(companions.length){
      node.classList.add('queue-companion-event');
      const title=document.createElement('span');title.className='queue-companion-title';title.textContent=step.skillName||'自然夥伴・共擊';node.appendChild(title);
      const portraits=document.createElement('div');portraits.className='queue-companion-portraits';node.appendChild(portraits);
      const units=new Map();
      for(const result of companions){
        const portrait=document.createElement('div');portrait.className='queue-companion-portrait';
        portrait.innerHTML=`<img src="${escapeHtml(companionPortraitUrl(result.minion))}" alt="${escapeHtml(result.minion.name)}">`;
        portrait.setAttribute('aria-label',result.minion.name);portraits.appendChild(portrait);units.set(result,portrait);
      }
      companionEntries.set(step,units);node.dataset.companionCount=String(companions.length);
    }else node.innerHTML = minion?.avatar ? `<img src="${escapeHtml(minion.avatar)}" alt="${escapeHtml(minion.name)}">` : getPlayerAvatarHtml(player, 'queue-avatar');
    node.setAttribute('aria-label', `${step.sourceName || player.name || ''} · ${step.skillName || ''}`);
    byId('hudActionQueue').appendChild(node);
    if(first)entries=new Map([[step,node],...entries]);else entries.set(step,node);
  }
  function start(step) {
    if(allyStep(step)&&isReaction(step)&&!entries.has(step)){
      addEntry(step,true);positionQueue();
    }
  }
  function positionQueue() {
    byId('hudActionQueue').style.setProperty('--queue-count',Math.max(1,entries.size));
    let index = 0,offset=0,total=1;
    const grouped=[...entries.values()].some(n=>n.dataset?.companionCount);
    for (const node of entries.values()) {
      node.style.zIndex=String(1000-index);
      const span=node.dataset?.companionCount?Math.max(1,Number(node.dataset.companionCount)*.68+.16):1;
      node.style.setProperty('--companion-span',span);
      node.style.transform = grouped?`translateX(calc(${offset} * var(--queue-size)))`:`translateX(calc(${index} * var(--queue-size) * .58))`;
      total=offset+span;offset+=node.dataset?.companionCount?span+.12:.58;index++;
    }
    byId('hudActionQueue').style.setProperty('--queue-span',total);
  }
  function startCompanion(step,result){companionEntries.get(step)?.get(result)?.classList.add('is-attacking');}
  async function finishCompanion(step,result,context={}){
    const units=companionEntries.get(step),node=units?.get(result);if(!node||context.signal?.aborted)return;
    const motion=node.animate([{opacity:1,scale:1},{opacity:0,scale:.8}],{duration:context.reducedMotion?1:160/(context.speed||1),fill:'forwards'});
    queueAnimations.add(motion);const abort=()=>motion.cancel();context.signal?.addEventListener('abort',abort,{once:true});
    try{await motion.finished;}catch{}finally{context.signal?.removeEventListener('abort',abort);queueAnimations.delete(motion);motion.cancel();}
    if(companionEntries.get(step)!==units||context.signal?.aborted)return;
    node.remove();units.delete(result);
    const event=entries.get(step);if(event){event.dataset.companionCount=String(Math.max(1,units.size));positionQueue();}
  }
  function finish(step,context={}) {
    const node = entries.get(step); if (!node) return;
    entries.delete(step);
    companionEntries.delete(step);
    node.classList.add('is-finished');
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motion = node.animate(reduced?[{opacity:1},{opacity:0}]:[{opacity:1,translate:'0 0'},{opacity:0,translate:'-8px -6px'}], {duration:(reduced?1:200)/(context.speed||1),fill:'forwards'});
    queueAnimations.add(motion);
    const abort=()=>motion.cancel();context.signal?.addEventListener('abort',abort,{once:true});
    motion.finished.catch(()=>{}).finally(()=>{context.signal?.removeEventListener('abort',abort);queueAnimations.delete(motion);node.remove();motion.cancel();});
    positionQueue();
  }
  function phaseFor(step,roundStart=false) {
    // enemy-mechanics uses STATUS_TICK for attacks as well as passive ticks.
    if (step.type === 'boss_action') return 'ENEMY_ACTIONS';
    if (step.type === 'enemy_mechanic') return roundStart?'ROUND_TICK':'ENEMY_ACTIONS';
    if (step.category === 'STATUS_TICK') return 'ROUND_TICK';
    if (allyStep(step)) return 'ALLY_ACTIONS';
    return phase;
  }
  async function announce(step, context) {
    if (!allyStep(step) || !step.skillName) return;
    announcement?.abort(); const controller = new AbortController(); announcement = controller;
    const abort = () => controller.abort(); context.signal?.addEventListener('abort',abort,{once:true});
    const banner = byId('cinematicSkillBanner');
    byId('cinematicActorName').textContent = step.sourceName || roomState.players.find(p=>p.id===step.sourceId)?.name || '';
    byId('cinematicActorRole').textContent = getClassDisplayName(step.sourceRole);
    byId('cinematicSkillName').textContent = step.skillName.replace(/\s*[（(][^）)]*[）)]/g,'').trim();
    banner.classList.add('is-active');
    try {
      await Promise.all([
        waitForPresentation(announcementHoldMs,controller.signal,context.speed || 1),
        typeof SamuraiSoulHud!=='undefined'?SamuraiSoulHud.playRelease(step,{...context,signal:controller.signal}):undefined
      ]);
      banner.classList.remove('is-active');
      await waitForPresentation(180,controller.signal,context.speed || 1);
    } finally {
      context.signal?.removeEventListener('abort',abort);
      if (announcement === controller) {banner.classList.remove('is-active');announcement = null;}
    }
  }
  function updatePlayer(player) {
    if (!player) return;
    const hud = byId('hudPlayerInfo');
    const portrait=byId('hudPlayerAvatar'),markup=getPlayerAvatarHtml(player,'hud-player-avatar');
    if(portrait._avatarMarkup!==markup){portrait.innerHTML=markup;portrait._avatarMarkup=markup;}
    if(typeof SamuraiSoulHud!=='undefined')SamuraiSoulHud.sync(player,portrait);
    byId('hudPlayerName').textContent = player.name;
    byId('hudPlayerRole').textContent = getClassDisplayName(player.role);
    const vitals=battleVitals(player);
    byId('hudPlayerHpText').textContent = `${player.hp} / ${player.maxHp}${vitals.shield?' · 護盾 '+vitals.shield:''}${vitals.overheal?' · 暫存 '+vitals.overheal:''}`;
    byId('hudPlayerHpFill').style.width = `${Math.max(0,Math.min(100,player.hp/Math.max(1,player.maxHp)*100))}%`;
    syncBattleVitals(byId('hudPlayerHpFill').parentElement,player);
    renderCompanions(hud,player);renderPartyOverview();
    byId('hudPlayerResource').textContent = [player.resourceSummary,`DEF ${player.DEF || 0}`].filter(Boolean).join(' · ');
    const statusHost=byId('hudPlayerStatuses');
    const visibleStatuses=(player.statuses||[]).filter(status=>status.id!=='soul');
    statusHost.innerHTML = visibleStatuses.map(status=>{
      const isLeader = typeof isLeaderSkillStatus === 'function'
        ? isLeaderSkillStatus(status)
        : Boolean(status && (status.isLeaderPassive || status.isLeaderSkill || String(status.id || '').toLowerCase().startsWith('leader_')));
      const inner = typeof renderStatusIconMarkup === 'function'
        ? renderStatusIconMarkup(status, { variant: 'hud', contextRole: player.role })
        : (() => {
            const icon = getBuffIconUrl(status);
            return icon ? `<img src="${escapeHtml(icon)}" alt="">` : getIconSvg(status.icon || 'status');
          })();
      const hasStacks=typeof status.stacks==='number'&&status.stacks>0;
      return `<button type="button" class="hud-status-icon${isLeader?' teammate-buff-exclusive':''}" aria-label="${escapeHtml((status.label||status.id)+(hasStacks?` ×${status.stacks}`:''))}"><span class="hud-status-icon-inner">${inner}</span></button>`;
    }).join('');
    [...statusHost.children].forEach((button,index)=>{
      const status=visibleStatuses[index];
      const show=()=>{
        const tip=byId('battleSkillTooltip');
        if(typeof formatStatusDisplay==='function'){
          tip.textContent=formatStatusDisplay(status).fullTitle;
        }else{
          const dotDmg=typeof status.damage==='number'&&status.damage>0?status.damage:(status.isDot&&typeof status.value==='number'&&status.value>0?status.value:null);
          const nonDotVal=!status.isDot&&status.damage===undefined&&status.value!==undefined&&status.value!==''?String(status.value):'';
          const stacksText=typeof status.stacks==='number'&&status.stacks>0?`×${status.stacks}`:'';
          tip.textContent=[`${status.label||status.id}${stacksText?' '+stacksText:''}`,dotDmg!==null?`每回合 ${dotDmg} 傷害`:nonDotVal,status.turns>0?`剩餘 ${status.turns} 回合`:'',status.desc].filter(Boolean).join('｜');
        }
        tip.classList.add('visible');tip.setAttribute('aria-hidden','false');positionFloatingTooltip(button,tip);
      };
      for(const event of ['mouseenter','focus','click'])button.addEventListener(event,show);
      button.addEventListener('mouseleave',hideTooltip);button.addEventListener('blur',hideTooltip);
    });
    hud.classList.toggle('is-dead',player.hp<=0);
    const avatar = byId('hudPlayerAvatar'); avatar._player = player;
    if (!avatar.dataset.bound) {
      avatar.dataset.bound='true';
      for (const event of ['mouseenter','focus','click']) avatar.addEventListener(event,()=>showPlayerTooltip(avatar._player,avatar));
      avatar.addEventListener('mouseleave',hideEnemyTooltip);avatar.addEventListener('blur',hideEnemyTooltip);
    }
  }
  function renderCompanions(hud,player) {
    let row=byId('hudCompanions');
    if(!row){row=document.createElement('div');row.id='hudCompanions';row.className='hud-companions';row.setAttribute('aria-label','德魯伊夥伴');hud.appendChild(row);}
    row.hidden=player.role!=='druid'||!(player.minions||[]).length;
    if(!row.hidden)syncCompanionUnits(row,player,false);
    else row.replaceChildren();
  }
  function renderPartyOverview() {
    const view=byId('viewBattle');let toggle=byId('partyOverviewToggle'),panel=byId('partyOverview');
    if(!toggle){
      toggle=document.createElement('button');toggle.id='partyOverviewToggle';toggle.type='button';toggle.setAttribute('aria-controls','partyOverview');toggle.setAttribute('aria-expanded','false');view.appendChild(toggle);
      panel=document.createElement('section');panel.id='partyOverview';panel.hidden=true;panel.setAttribute('aria-label','隊伍狀態總覽');view.appendChild(panel);
      toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));});
    }
    toggle.textContent=`隊伍狀態 (${roomState.players.length})`;toggle.hidden=phase!=='SELECTING';
    panel.innerHTML=roomState.players.map(p=>`<div class="party-overview-unit ${p.hp<=0?'is-dead':''}" data-overview-player="${escapeHtml(p.id)}"><button type="button" aria-label="查看${escapeHtml(p.name)}狀態">${getPlayerAvatarHtml(p,'overview-avatar')}</button><span>${escapeHtml(p.name)}${p.hp<=0?' · 倒下':''}<small style="display:block">${escapeHtml(p.resourceSummary||'')}</small></span>${battleVitalsMarkup(p)}<div class="combat-status-list">${renderTeammateBuffIcons(p.statuses||[])}</div></div>`).join('');
    for(const card of panel.querySelectorAll('[data-overview-player]'))card.querySelector('button').addEventListener('click',()=>showPlayerTooltip(roomState.players.find(p=>p.id===card.dataset.overviewPlayer),card));
  }
  const propertyText = {
    EVEN:'偶數 EVEN：保留 40% 穿透；以方程主傷害實傷總和的 40% 均分全隊護盾，每人上限為智者最大 HP 的 20%，持續 2 回合。',
    ODD:'奇數 ODD：受影響且仍合法存活的敵人承傷 +10%，持續 2 回合。',
    PRIME:'質數 PRIME：額外真傷總額 15，重新均分當下合法存活敵人；技能冷卻清除一次。',
    SQUARE:'平方數 SQUARE：受影響且仍合法存活的敵人直接傷害 -25%，持續 2 回合。'
  };
  function renderEquation(player, action) {
    const terminal=byId('sageEquationTerminal');
    terminal.hidden=!player || player.role!=='sage'; if(terminal.hidden)return;
    if(action!==selectedAction){selectedAction=action;analyzedAction=action;}
    const preview=player.sageEquationPreview;
    byId('sageTerminalPhase').textContent=player.sagePhase==='solve'?'∑ 求解階段':'∑ 假設階段';
    byId('sageTerminalSummary').textContent=`X ${player.sageX ?? '—'}   Op ${player.sageOperand ?? '—'}   η(X) ${preview?.eta?.toFixed(3) ?? '—'}   紊亂率 ${preview ? (preview.confusionChance*100).toFixed(0)+'%' : '—'}`;
    const options=preview?.options || [],names={basic:'普通攻擊',sge_deduce:'向量定軌',sge_induce:'動量回授'};
    const chosen=options.find(o=>o.id===analyzedAction) || options[0];
    const body=byId('sageTerminalDetails');
    body.innerHTML=`<h3>演算終端 / EQUATION TERMINAL</h3><p>待付透支 ${player.sageDebt || 0} X · 自然衰減 ${preview?.decayAmount ?? '—'}</p><h4>求解路徑比較</h4><div class="sage-paths">${options.map(o=>`<button type="button" data-equation-path="${o.id}" aria-pressed="${o===chosen}"><strong>${names[o.id]}</strong><span>Op ${o.operand} · ${o.properties.map(p=>({EVEN:'偶數',ODD:'奇數',PRIME:'質數',SQUARE:'平方數'})[p]).join('、')}</span><span>正常／紊亂 ${o.damageAfterEquipment}／${o.damageAfterConfusion}</span><small>${o.blocked?'前輪已使用':o.cooldown?'冷卻 '+o.cooldown:'可選擇'}</small></button>`).join('')}</div>`;
    if(chosen){
      const detail=document.createElement('div');detail.className='sage-path-analysis';
      detail.innerHTML=`<h4>目前分析：${names[chosen.id]}</h4><p>右側已選技能：${names[action] || '尚未選擇'}</p>${chosen.properties.map(p=>`<p>${propertyText[p]}</p>`).join('')}<p>預估總方程傷害 ${chosen.damageAfterEquipment} · 受擊敵人 ${chosen.livingEnemyCount}</p><ul>${(chosen.distribution||[]).map(d=>`<li>${escapeHtml(d.name)}：${d.damage}</li>`).join('')}</ul><p>固定成長 ${chosen.baseXGain} · 額外成長 ${chosen.bonusXGain} · 成功率 ${(chosen.successChance*100).toFixed(0)}% · 排定透支 ${chosen.debtScheduled}</p><p>η(X) = 0.4 + (1.75 × X) / (X + 80)</p><small>以目前存活敵人預估，以上均為抗性前數值。實際傷害依結算時編隊重新分配。路徑點擊只切換分析，請在右側選擇並鎖定行動。</small>`;
      body.appendChild(detail);
    }
    for(const button of body.querySelectorAll('[data-equation-path]'))button.onclick=()=>{analyzedAction=button.dataset.equationPath;renderEquation(player,action);};
  }
  function hideTooltip() {
    const tooltip=byId('battleSkillTooltip');tooltip?.classList.remove('visible');tooltip?.setAttribute('aria-hidden','true');
  }
  function bindSkill(button,description) {
    button.setAttribute('role','button');button.tabIndex=0;
    const show=()=>{
      const tip=byId('battleSkillTooltip');tip.textContent=description;tip.classList.add('visible');tip.setAttribute('aria-hidden','false');
      positionFloatingTooltip(button,tip);
    };
    button.addEventListener('mouseenter',show);button.addEventListener('focus',show);
    button.addEventListener('mouseleave',hideTooltip);button.addEventListener('blur',hideTooltip);
    button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();button.click();}if(event.key==='Escape')hideTooltip();});
    button.addEventListener('click',show);
  }
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#mySkillsRow,#battleSkillTooltip'))hideTooltip();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){hideTooltip();hideEnemyTooltip();}});
  function actorPortrait(step) {
    const entry=entries.get(step);
    return entry?.querySelector('img,.avatar-emoji-badge') || entry || null;
  }
  function updateActorPortrait(step, player) {
    const entry=entries.get(step);
    if(entry&&player)entry.innerHTML=getPlayerAvatarHtml(player,'queue-avatar');
  }
  function revealDruidResult(step) {
    for(const pending of deferredSteps)if(pending.sourceId===step.sourceId){addEntry(pending);deferredSteps.delete(pending);}
    entries=new Map([...entries].sort(([a],[b])=>queuedSteps.indexOf(a)-queuedSteps.indexOf(b)));
    positionQueue();
  }
  return {setPhase,reset,begin,start,finish,startCompanion,finishCompanion,phaseFor,announce,updatePlayer,renderEquation,bindSkill,actorPortrait,updateActorPortrait,revealDruidResult,get phase(){return phase;}};
})();
