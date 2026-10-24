// Display state only. The server queue remains the sole owner of action order.
const BattleHud = (() => {
  let phase = 'SELECTING', entries = new Map(), announcement = null;
  const queueAnimations = new Set();
  let analyzedAction = null, selectedAction = null;
  const byId = id => document.getElementById(id);
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
    if(next!=='SELECTING'){
      if(typeof closeInventoryModal==='function'&&typeof elements!=='undefined'&&!elements.inventoryModal?.classList.contains('hidden'))closeInventoryModal();
      if(typeof elements!=='undefined'&&elements.targetModal&&!elements.targetModal.classList.contains('hidden'))ModalMotion.hide(elements.targetModal);
    }
  }
  function reset(next='SELECTING') {
    announcement?.abort(); announcement = null;
    for(const animation of queueAnimations)animation.cancel();queueAnimations.clear();
    entries.clear(); byId('hudActionQueue')?.replaceChildren();
    byId('cinematicSkillBanner')?.classList.remove('is-active');
    setPhase(next);
  }
  function begin(queue) {
    entries.clear();
    const host = byId('hudActionQueue'); host.replaceChildren();
    queue.filter(allyStep).forEach((step, index) => {
      const player = step.hpSnapshotBefore?.players?.find(p => p.id === step.sourceId) ||
        roomState.players.find(p => p.id === step.sourceId) || {role: step.sourceRole};
      const node = document.createElement('div'); node.className = 'queue-avatar-item';
      const minion = step.results?.find(r => r.minion)?.minion;
      node.innerHTML = minion?.avatar ? `<img src="${escapeHtml(minion.avatar)}" alt="${escapeHtml(minion.name)}">` : getPlayerAvatarHtml(player, 'queue-avatar');
      node.setAttribute('aria-label', `${step.sourceName || player.name || ''} · ${step.skillName || ''}`);
      node.style.zIndex = String(1000-index);
      host.appendChild(node); entries.set(step, node);
    });
    positionQueue();
  }
  function positionQueue() {
    let index = 0;
    for (const node of entries.values()) node.style.transform = `translateX(${index++ * 36}px)`;
  }
  function finish(step,context={}) {
    const node = entries.get(step); if (!node) return;
    entries.delete(step);
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
    byId('cinematicSkillName').textContent = step.skillName;
    banner.classList.add('is-active');
    try {
      await waitForPresentation(step.actionId === 'basic' ? 290 : 650,controller.signal,context.speed || 1);
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
    byId('hudPlayerAvatar').innerHTML = getPlayerAvatarHtml(player,'hud-player-avatar');
    byId('hudPlayerName').textContent = player.name;
    byId('hudPlayerRole').textContent = getClassDisplayName(player.role);
    byId('hudPlayerHpText').textContent = `${player.hp} / ${player.maxHp}${player.tempHp>0?' · 護盾 '+player.tempHp:''}`;
    byId('hudPlayerHpFill').style.width = `${Math.max(0,Math.min(100,player.hp/Math.max(1,player.maxHp)*100))}%`;
    byId('hudPlayerResource').textContent = [player.resourceSummary,`DEF ${player.DEF || 0}`].filter(Boolean).join(' · ');
    const statusHost=byId('hudPlayerStatuses');
    statusHost.innerHTML = (player.statuses||[]).map(status=>{
      const icon=getBuffIconUrl(status);
      return `<button type="button" class="hud-status-icon" aria-label="${escapeHtml(status.label||status.id)}">${icon?`<img src="${escapeHtml(icon)}" alt="">`:getIconSvg(status.icon||'status')}</button>`;
    }).join('');
    [...statusHost.children].forEach((button,index)=>{
      const status=player.statuses[index];
      const show=()=>{const tip=byId('battleSkillTooltip');tip.textContent=[status.label||status.id,status.desc,status.value!==undefined?String(status.value):'',status.stacks?'層數 '+status.stacks:'',status.turns?'持續 '+status.turns+' 回合':''].filter(Boolean).join(' · ');tip.classList.add('visible');tip.setAttribute('aria-hidden','false');positionFloatingTooltip(button,tip);};
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
  return {setPhase,reset,begin,finish,phaseFor,announce,updatePlayer,renderEquation,bindSkill,get phase(){return phase;}};
})();
