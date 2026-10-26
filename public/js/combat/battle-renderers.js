// Shared production battlefield renderers. Moved unchanged from app.js; both game and Lab use these functions.
function companionPortraitUrl(minion){return minion.avatar||`/assets/characters/summons/druid/${minion.type==='wolf'?'幼狼':'小樹精'}${minion.minionIndex||1}.webp`;}
function showCompanionTooltip(minion,owner,anchor){
  const tip=elements.floatingEnemyTooltip;if(!tip||!minion)return;
  const statuses=(minion.statuses||[]).map(s=>formatStatusDisplay(s).fullTitle).join('\n');
  tip.innerHTML=`<strong>${escapeHtml(minion.name)}</strong><p>${escapeHtml(owner)}的自然夥伴 · HP ${minion.hp}/${minion.maxHp} · ATK ${minion.attack??minion.atk??0}</p><div style="white-space:pre-line">${escapeHtml(statuses||'目前無負面狀態')}</div>`;
  tip.setAttribute('aria-hidden','false');tip.classList.add('visible');positionFloatingTooltip(anchor,tip);
}
function syncCompanionUnits(host,player,battlefield=true){
  const minions=player.minions||[],ids=new Set(minions.map(m=>m.id));
  for(const node of host.querySelectorAll('.battle-companion-unit'))if(!ids.has(node.dataset.companionId))node.remove();
  for(const minion of minions){
    let node=[...host.children].find(n=>n.dataset.companionId===minion.id);
    if(!node){
      node=document.createElement('div');node.className='battle-companion-unit';node.dataset.companionId=minion.id;
      if(battlefield)node.dataset.minionId=minion.id;
      node.innerHTML=`<button type="button" class="companion-portrait"><img alt=""></button>${battleVitalsMarkup(minion)}<span class="companion-hp"></span><div class="companion-statuses combat-status-list"></div>`;
      const button=node.querySelector('button');
      for(const event of ['mouseenter','focus','click'])button.addEventListener(event,()=>showCompanionTooltip(node._companion,player.name,button));
      button.addEventListener('mouseleave',hideEnemyTooltip);button.addEventListener('blur',hideEnemyTooltip);host.appendChild(node);
    }
    node._companion=minion;node.classList.toggle('is-dead',minion.hp<=0);
    const button=node.querySelector('button'),image=button.querySelector('img');image.src=companionPortraitUrl(minion);image.alt=minion.name;
    button.setAttribute('aria-label',`${minion.name} · HP ${minion.hp}/${minion.maxHp} · 查看狀態`);
    const bar=node.querySelector('.combat-vital-bar');bar.querySelector('.vital-hp').style.width=battleVitals(minion).hpPct+'%';syncBattleVitals(bar,minion);
    node.querySelector('.companion-hp').textContent=`${minion.hp}/${minion.maxHp}`;
    node.querySelector('.companion-statuses').innerHTML=renderTeammateBuffIcons(minion.statuses||[]);
  }
}
function syncBattleCompanions(player){
  const grid=elements.battleTeammatesGrid;if(!grid)return;
  let card=[...grid.querySelectorAll('.teammate-card-minion')].find(n=>n.dataset.minionOwnerId===player.id);
  if(!(player.minions||[]).length){card?.remove();return;}
  if(!card){
    card=document.createElement('div');card.className='teammate-card teammate-card-minion';card.dataset.playerId=player.id+'_minions';card.dataset.minionOwnerId=player.id;
    const title=document.createElement('button');title.type='button';title.className='companion-owner-label';title.textContent=player.name+'的夥伴';title.addEventListener('click',()=>showMinionDetailModal(player));
    const units=document.createElement('div');units.className='battle-companion-units';card.appendChild(title);card.appendChild(units);
    const owner=[...grid.querySelectorAll('.teammate-card')].find(n=>n.dataset.playerId===player.id);if(owner)owner.after(card);else grid.appendChild(card);
  }
  card.classList.toggle('arena-absent',!!player.arenaBlocked);syncCompanionUnits(card.querySelector('.battle-companion-units'),player);
}
function battleVitals(player) {
  const max=Math.max(1,Number(player.maxHp)||1),hp=Math.max(0,Number(player.hp)||0);
  const total=Math.max(0,Number(player.tempHp)||0);
  const recordedShield=Array.isArray(player.presentationShields)?player.presentationShields.reduce((n,s)=>n+(Number(s.value)||0),0):null;
  const overheal=Math.min(total,Math.max(0,Number(player.temporaryOverheal ?? (recordedShield===null?0:total-recordedShield))||0));
  const shield=Math.max(0,Number(player.shieldHp ?? total-overheal)||0);
  const debt=(player.augurFateDebts||[]).reduce((n,d)=>n+Math.max(0,Number(d.amount)||0),0);
  return {max,hp,shield,overheal,debt,hpPct:Math.min(100,hp/max*100),shieldPct:Math.min(100,shield/max*100),overhealPct:Math.min(100,overheal/max*100),debtPct:Math.min(hp,debt)/max*100};
}
function syncBattleVitals(host,player) {
  if(!host)return;
  const v=battleVitals(player);host.classList.add('combat-vital-bar');
  for(const kind of ['shield','overheal','debt']){
    let layer=host.querySelector('.vital-'+kind);
    if(!layer){layer=document.createElement('i');layer.className='vital-'+kind;layer.setAttribute('aria-hidden','true');host.appendChild(layer);}
    layer.style.width=v[kind+'Pct']+'%';layer.hidden=v[kind]<=0;
    if(kind==='debt')layer.style.left=Math.max(0,v.hpPct-v.debtPct)+'%';
  }
  host.setAttribute('role','progressbar');host.setAttribute('aria-valuemin','0');host.setAttribute('aria-valuemax',String(v.max));host.setAttribute('aria-valuenow',String(v.hp));
  host.setAttribute('aria-valuetext',`生命 ${v.hp}/${v.max}，護盾 ${v.shield}，暫存生命 ${v.overheal}，命債 ${v.debt}`);
  host.querySelector('.hp-bar-overheal')?.remove();
}
function battleVitalsMarkup(player) {
  const v=battleVitals(player);
  return `<div class="combat-vital-bar target-vital-bar" role="progressbar" aria-label="${escapeHtml(player.name||'')}生命" aria-valuemin="0" aria-valuemax="${v.max}" aria-valuenow="${v.hp}"><i class="vital-hp" style="width:${v.hpPct}%"></i><i class="vital-shield" style="width:${v.shieldPct}%" ${v.shield?'':'hidden'}></i><i class="vital-overheal" style="width:${v.overhealPct}%" ${v.overheal?'':'hidden'}></i><i class="vital-debt" style="left:${v.hpPct-v.debtPct}%;width:${v.debtPct}%" ${v.debt?'':'hidden'}></i></div>`;
}
function syncEnemyTargetIndicators() {
  const me=getMyPlayer(),action=typeof currentPendingAction==='undefined'?null:currentPendingAction;
  const skill=classesData[me?.role]?.skills?.find(s=>s.id===action);
  const firstLine=skill?.desc?.split('\n')[0]||'';
  const friendly=!!action&&!firstLine.includes('敵')&&(/我方|隊友|自身|自己|召喚/.test(firstLine)||/^dru_(transform|summon)/.test(action));
  const group=!friendly&&(['m_blast','sa_cut','sa_tsubame','a_rain','w_cleave','alc_flask','alc_acid','alc_poison','onm_all_talismans'].includes(action)||skill?.tags?.some(t=>/群攻|群體|全體|範圍/.test(t)));
  const splashTargeting=['m_blast','alc_flask','alc_acid','sa_cut'].includes(action);
  const primary=currentSelectedEnemyId||me?.targetEnemyId;
  for(const slot of document.querySelectorAll('#battleEnemiesStage .battle-enemy-slot')){
    const mark=slot.querySelector('.enemy-target-reticle');if(!mark)continue;
    const selected=slot.dataset.enemyId===primary,eligible=slot._currentEnemy?.hp>0&&isBattleEnemySelectable(slot.dataset.enemyId);
    const visible=!friendly&&eligible&&(group||selected),key=[visible,selected,action].join(':');
    mark.style.display=visible?'':'none';mark.classList.toggle('is-group-target',!!group);mark.classList.toggle('is-primary-target',!!group&&selected&&splashTargeting);
    mark.classList.toggle('is-secondary-target',!!group&&!selected&&splashTargeting);
    if(visible&&mark.dataset.selection!==key&&typeof mark.animate==='function')mark.animate([{scale:1.6,opacity:0},{scale:1,opacity:1}],{duration:240,easing:'ease-out'});
    mark.dataset.selection=key;
  }
}
// 取得玩家頭貼 HTML (變身形態 > 自訂頭貼 > 職業預設 > 預設頭像)
function getPlayerAvatarHtml(player, className = 'member-role-avatar') {
  if (!player) return `<div class="${className} member-avatar-placeholder">${getIconSvg('user')}</div>`;

  // 德魯伊變身形態優先顯示形態頭貼（狼人 / 遠古樹精）
  if (player.role === 'druid' && player.druidForm) {
    if (player.druidForm === 'werewolf') {
      return `<img src="/assets/characters/forms/druid/狼人.webp" class="${className} druid-transformed-avatar" alt="狼人">`;
    } else if (player.druidForm === 'treant' || player.druidForm === 'tree') {
      return `<img src="/assets/characters/forms/druid/遠古樹精.webp" class="${className} druid-transformed-avatar" alt="遠古樹精">`;
    } else if (player.druidForm === 'bear') {
      return `<img src="/assets/characters/forms/druid/巨熊.webp" class="${className} druid-transformed-avatar" alt="巨熊">`;
    }
  }

  const roleInfo = player.role ? classesData[player.role] : null;

  // 1. 玩家自訂頭貼 (自訂照片或自訂頭像)
  if (player.customAvatar) {
    if (player.customAvatar.startsWith('data:image/') || player.customAvatar.startsWith('http') || player.customAvatar.startsWith('/')) {
      return `<img src="${player.customAvatar}" class="${className}" alt="${escapeHtml(player.name)}">`;
    } else {
      return `<div class="${className} avatar-emoji-badge">${escapeHtml(player.customAvatar)}</div>`;
    }
  }

  // 2. 職業預設圖片或專屬圖示
  if (roleInfo && roleInfo.avatar) {
    return `<img src="${roleInfo.avatar}" class="${className}" alt="${roleInfo.name}">`;
  }
  if (player.role) {
    return `<div class="${className} avatar-icon-badge">${getIconSvg(getRoleIconName(player.role))}</div>`;
  }

  // 3. 未選職預設
  return `<div class="${className} member-avatar-placeholder">${getIconSvg('user')}</div>`;
}

// 通用浮動懸浮面板視窗邊界限制定位 (確保絕不超出畫面邊界)
function positionFloatingTooltip(eOrTarget, tooltip) {
  if (!tooltip) return;
  const tw = tooltip.offsetWidth || 300;
  const th = tooltip.offsetHeight || 220;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 14;

  let left, top;
  if (eOrTarget && typeof eOrTarget.clientX === 'number') {
    left = eOrTarget.clientX + 16;
    if (left + tw > vw - pad) {
      left = eOrTarget.clientX - tw - 16;
    }
    top = eOrTarget.clientY - 20;
    if (top + th > vh - pad) {
      top = vh - th - pad;
    }
  } else if (eOrTarget) {
    const rect = (typeof eOrTarget.getBoundingClientRect === 'function')
      ? eOrTarget.getBoundingClientRect()
      : eOrTarget;
    left = rect.left + (rect.width / 2) - (tw / 2);
    top = rect.top - th - 12;
    if (top < pad) {
      top = rect.bottom + 12;
    }
  } else {
    left = (vw - tw) / 2;
    top = (vh - th) / 2;
  }

  if (left + tw > vw - pad) left = vw - pad - tw;
  if (left < pad) left = pad;
  if (top + th > vh - pad) top = vh - th - pad;
  if (top < pad) top = pad;

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function showEnemyTooltip(en, eOrTarget) {
  if (!elements.floatingEnemyTooltip || !en) return;

  const hpPct = Math.max(0, Math.min(100, Math.round((en.hp / Math.max(1, en.maxHp)) * 100)));
  const tierName = en.tier === 'ABYSS' ? '深淵' : en.tier === 'ELITE' ? '精英' : (en.isBoss ? '首領' : '小怪');
  const tierClass = en.tier === 'ABYSS' ? 'tier-exclusive' : en.tier === 'ELITE' ? 'tier-t2' : (en.isBoss ? 'tier-t2' : 'tier-t1');

  const resistances = en.resistances || { physical: en.resistance === 'phys' ? 70 : 0, magic: en.resistance === 'mag' ? 70 : 0, effect: 0 };
  const mirrored = en.p8Effects?.mirror?.until >= (roomState?.battleRound || 0);
  const physical = mirrored ? resistances.magic : resistances.physical;
  const magic = mirrored ? resistances.physical : resistances.magic;

  const info = en.presentation || {};
  const isUltRound = !!info.ultimateReady;

  const buffs = enemyDisplayStatuses(en).filter(status=>!info.resource||status.id!=='enemy_mechanic').map(status=>{
    const fmt = formatStatusDisplay(status);
    return {
      id: status.id,
      icon: status.icon || 'status',
      label: fmt.head,
      value: status.value,
      desc: fmt.detailText
    };
  });
  if(en.tempHp>0)buffs.push({id:'shield',icon:'shield',label:'護盾',desc:String(en.tempHp)});
  if(info.resource)buffs.push({id:'enemy_mechanic',icon:'buff',label:info.resource.label,desc:info.resource.value+'/'+info.resource.max});
  let buffsHtml = '';
  if (buffs.length > 0) {
    buffsHtml = `<div class="floating-tooltip-buffs">${buffs.map(b => {
      const iconTag = typeof renderStatusIconMarkup === 'function'
        ? renderStatusIconMarkup(b, { variant: 'tooltip' })
        : (typeof getBuffIconUrl === 'function' && getBuffIconUrl(b)
          ? `<img src="${getBuffIconUrl(b)}" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:4px;">`
          : getIconSvg(b.icon, 'ui-icon--sm'));
      return `
      <span class="buff-badge" style="font-size:11px;padding:2px 6px;display:inline-flex;align-items:center;gap:4px;">
        ${iconTag} ${escapeHtml(b.label)}${b.desc ? ` (${escapeHtml(b.desc)})` : ''}
      </span>`;
    }).join('')}</div>`;
  } else {
    buffsHtml = `<div class="floating-tooltip-row"><span class="floating-tooltip-label">當前狀態</span><span class="floating-tooltip-val" style="color:var(--color-text-muted);">正常</span></div>`;
  }

  elements.floatingEnemyTooltip.innerHTML = `
    <div class="floating-tooltip-title-row">
      <span class="floating-tooltip-name ${tierClass}">${escapeHtml(en.name)}</span>
      <span class="floating-tooltip-badge">${tierName}</span>
    </div>
    <div class="floating-tooltip-row">
      <span class="floating-tooltip-label">生命值</span>
      <span class="floating-tooltip-val" style="color:${hpPct < 25 ? '#ef4444' : hpPct < 50 ? '#f59e0b' : '#10b981'}; font-weight:800;">${en.hp} / ${en.maxHp} (${hpPct}%)</span>
    </div>
    <div class="floating-tooltip-row">
      <span class="floating-tooltip-label">反擊攻擊力</span>
      <span class="floating-tooltip-val">${isUltRound ? '本回合施放大招（依實際事件結算）' : `${en.attack || 10} 點`}</span>
    </div>
    <div class="floating-tooltip-row">
      <span class="floating-tooltip-label">蓄力必殺</span>
      <span class="floating-tooltip-val" style="color:var(--color-focus);">${escapeHtml(en.ultName || '狂暴重擊')}</span>
    </div>
    <div class="floating-tooltip-row">
      <span class="floating-tooltip-label">抗性體質</span>
      <span class="floating-tooltip-val">物抗 ${physical}% · 魔抗 ${magic}% · 效抗 ${resistances.effect}%</span>
    </div>
    <div class="enemy-mechanic-help"><strong>${escapeHtml(info.passiveName || '特殊能力')}</strong><br>${escapeHtml(info.passiveDesc || '')}<br><strong>${escapeHtml(info.ultimateName || en.ultName || '大招')}</strong> · 每 ${info.period || 3} 回合${isUltRound ? '（本回合）' : ''}<br>${escapeHtml(info.ultimateDesc || '')}<br>${escapeHtml(info.targetName ? '優先目標：'+info.targetName+' · '+info.targetHint : info.targetHint || '')}<br>反制：${escapeHtml(info.counter || '')}</div>
    ${buffsHtml}
    <div class="floating-tooltip-desc">${escapeHtml(en.desc || '地下城凶險的魔物。')}</div>
  `;

  elements.floatingEnemyTooltip.setAttribute('aria-hidden', 'false');
  elements.floatingEnemyTooltip.classList.add('visible');
  positionFloatingTooltip(eOrTarget, elements.floatingEnemyTooltip);
}

function hideEnemyTooltip() {
  if (elements.floatingEnemyTooltip) {
    elements.floatingEnemyTooltip.setAttribute('aria-hidden', 'true');
    elements.floatingEnemyTooltip.classList.remove('visible');
  }
}
// Touch users can scroll the expanded enemy help and dismiss it by tapping
// outside; desktop hover and keyboard focus retain their existing behavior.
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.battle-enemy-slot, #floatingEnemyTooltip')) hideEnemyTooltip();
});

function isBattleEnemySelectable(enemyId) {
  const arena=roomState?.enemyArena||roomState?.arena;
  if(arena&&(arena.enemyId!==enemyId||arena.playerId!==myId))return false;
  return (roomState?.enemies||[roomState?.currentMonster]).some(e=>e&&(e.instanceId||e.id)===enemyId&&e.hp>0);
}

// 神魔之塔風格敵方排佈舞台渲染（保留 DOM 節點 diffing，無中斷 hover/focus/animations）
function renderBattleEnemiesStage(enemies, monster, me) {
  if (!elements.battleEnemiesStage) return;
  if (!enemies || enemies.length === 0) {
    elements.battleEnemiesStage.innerHTML = '';
    return;
  }

  const { bosses, centered, displayOrder } = getBattleFormation(enemies);
  elements.battleEnemiesStage.classList.toggle('is-centered-formation', centered);
  const isUltRound = (roomState.battleRound % 3 === 0);
  const activeIds = new Set(displayOrder.map((en, idx) => String(en.instanceId || en.id || `enemy_${idx}`)));

  // 移除不存在之敵人節點
  Array.from(elements.battleEnemiesStage.querySelectorAll('.battle-enemy-slot')).forEach(slot => {
    const id = slot.getAttribute('data-enemy-id');
    if (!activeIds.has(id)) {
      slot.remove();
    }
  });

  displayOrder.forEach((en, idx) => {
    const eid = String(en.instanceId || en.id || `enemy_${idx}`);
    const isTarget = eid === (currentSelectedEnemyId || monster?.instanceId || monster?.id);
    const isDead = en.hp <= 0;
    const hpPct = Math.max(0, Math.min(100, Math.round((en.hp / Math.max(1, en.maxHp)) * 100)));
    const fillClass = hpPct < 25 ? 'hp-crit' : (hpPct < 50 ? 'hp-warn' : '');

    const tier = en.tier || (en.isBoss ? 'ELITE' : 'MINION');
    const sizeClass = tier === 'MINION' ? 'is-minion-slot' : 'is-boss-slot' + (tier === 'ABYSS' ? ' is-abyss-slot' : '');
    const column = centered ? (en === bosses[0] ? 2 : (idx === 0 ? 1 : 3)) : null;

    const cdTurns = en.presentation?.roundsUntilUltimate ?? en.cd ?? ((3 - roomState.battleRound % 3) % 3);
    const isReady = en.presentation ? en.presentation.ultimateReady : isUltRound;
    const cdClass = isReady ? 'enemy-cd-badge ult-ready' : 'enemy-cd-badge';
    const cdIcon = isReady ? getIconSvg('crit', 'ui-icon--sm') : getIconSvg('cooldown', 'ui-icon--sm');
    const cdText = isReady ? '!' : `CD ${cdTurns}`;

    let slot = elements.battleEnemiesStage.querySelector(`.battle-enemy-slot[data-enemy-id="${eid}"]`);
    const avatarSrc = en.battleAvatar ? resolveBattlePortrait({...en,entityType:'monster'}).src : en.avatar || '';
    if (!slot) {
      slot = document.createElement('div');
      slot.className = `battle-enemy-slot ${sizeClass}`;
      slot.setAttribute('data-enemy-id', eid);
      slot.setAttribute('role', 'button');
      slot._currentEnemy = en;

      const avatarImg = avatarSrc
        ? `<img src="${avatarSrc}" class="enemy-sprite-img portrait-image" alt="${escapeHtml(en.name)}" loading="lazy" />`
        : getIconSvg('sword', 'svg-hero-icon');

      slot.innerHTML = `
        <div class="${cdClass}">
          ${cdIcon}
          <span class="cd-val">${cdText}</span>
        </div>
        <div class="enemy-target-reticle" style="${isTarget && !isDead ? '' : 'display:none;'}">
          ${getIconSvg('target', 'ui-icon--md')}
        </div>
        <div class="enemy-sprite-wrap">
          <div class="enemy-pedestal"></div>
          ${avatarImg}
          <div class="pixel-fx-container"></div>
          <div class="floating-text-container"></div>
        </div>
        <div class="tos-enemy-hp-bar">
          <div class="tos-hp-fill ${fillClass}" style="width: ${hpPct}%;"></div>
        </div>
        <div class="tos-enemy-hp-text">
          <span class="hp-num">${en.hp} / ${en.maxHp}</span>
          <span class="temp-shield"${en.tempHp > 0 ? '' : ' style="display:none;"'}>
            ${getIconSvg('shield', 'ui-icon--sm')} +${en.tempHp}
          </span>
        </div>
        <div class="tos-enemy-name">${escapeHtml(en.name)}</div>
        <div class="enemy-status-row"></div>
      `;

      const selectAction = () => {
        const cur = slot._currentEnemy || en;
        if (cur.hp <= 0 || !isBattleEnemySelectable(eid)) return;
        currentSelectedEnemyId = eid;
        socket.emit('battle:select_target', { targetEnemyId: eid });
        renderBattle(getMyPlayer(), getMyPlayer()?.id === roomState.leaderId);
      };

      slot.addEventListener('click', () => {
        if(!isBattleEnemySelectable(eid))return;
        selectAction();
        showEnemyTooltip(slot._currentEnemy || en, slot);
      });

      slot.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {hideEnemyTooltip();return;}
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if(!isBattleEnemySelectable(eid))return;
          selectAction();
          showEnemyTooltip(slot._currentEnemy || en, slot);
        }
      });

      slot.addEventListener('mouseenter', (e) => {
        showEnemyTooltip(slot._currentEnemy || en, e);
      });
      slot.addEventListener('mousemove', (e) => {
        positionFloatingTooltip(e, elements.floatingEnemyTooltip);
      });
      slot.addEventListener('mouseleave', () => {
        hideEnemyTooltip();
      });
      slot.addEventListener('focus', () => {
        showEnemyTooltip(slot._currentEnemy || en, slot);
      });
      slot.addEventListener('blur', () => {
        hideEnemyTooltip();
      });

      elements.battleEnemiesStage.appendChild(slot);
    } else {
      // 保留原有節點，依序 appendChild 更新順序
      // CSS order preserves focus and active effects.
      slot._currentEnemy = en;

      // Preserve transient hit/effect classes on the authoritative node.

      // 同步更新敵人頭像與圖片，嚴格保證圖文一致
      const spriteWrap = slot.querySelector('.enemy-sprite-wrap');
      let spriteImg = slot.querySelector('.enemy-sprite-img');
      if (avatarSrc) {
        if (spriteImg) {
          // Full-body and Druid form updates belong to the shared resolver.
          if(!en.battleAvatar&&en.presentation?.mechanicId!=='abyss_druid'&&spriteImg.getAttribute('src')!==avatarSrc)spriteImg.src=avatarSrc;
          spriteImg.alt = en.name || '';
        } else if (spriteWrap) {
          const newImg = document.createElement('img');
          newImg.className = 'enemy-sprite-img portrait-image';
          newImg.src = avatarSrc;
          newImg.alt = en.name || '';
          newImg.loading = 'lazy';
          spriteWrap.appendChild(newImg);
        }
      }

      const cdBadge = slot.querySelector('.enemy-cd-badge');
      if (cdBadge) {
        cdBadge.className = cdClass;
        cdBadge.innerHTML = `${cdIcon} <span class="cd-val">${cdText}</span>`;
      }

      const reticle = slot.querySelector('.enemy-target-reticle');
      if (reticle) {
        reticle.style.display = (isTarget && !isDead) ? '' : 'none';
      }

      const fill = slot.querySelector('.tos-hp-fill');
      if (fill) {
        fill.className = `tos-hp-fill ${fillClass}`;
        fill.style.width = `${hpPct}%`;
      }

      const hpNum = slot.querySelector('.hp-num');
      if (hpNum) hpNum.textContent = `${en.hp} / ${en.maxHp}`;

      const tempShield = slot.querySelector('.temp-shield');
      if (tempShield) {
        tempShield.style.display = en.tempHp > 0 ? '' : 'none';
        tempShield.innerHTML = `${getIconSvg('shield', 'ui-icon--sm')} +${en.tempHp}`;
      }

      const nameEl = slot.querySelector('.tos-enemy-name');
      if (nameEl) nameEl.textContent = en.name;
    }

    for (const cls of ['is-single-slot', 'is-uniform-slot', 'is-minion-slot', 'is-boss-slot', 'is-abyss-slot']) slot.classList.remove(cls);
    slot.classList.add(...sizeClass.split(' '));
    slot.classList.toggle('is-target', isTarget && !isDead);
    slot.classList.toggle('is-dead', isDead);
    slot.style.order = String(idx);
    slot.style.gridColumn = column ? String(column) : '';
    slot.dataset.tier = tier;
    slot.setAttribute('aria-pressed', String(isTarget && !isDead));
    let tierLabel = slot.querySelector('.enemy-tier-label');
    if (!tierLabel) { tierLabel = document.createElement('span'); tierLabel.className = 'enemy-tier-label'; slot.appendChild(tierLabel); }
    tierLabel.textContent = tier === 'ABYSS' ? '深淵' : tier === 'ELITE' ? '菁英' : '';
    tierLabel.hidden = tier === 'MINION';
    slot.tabIndex = isDead ? -1 : 0;
    slot.setAttribute('aria-label', `${en.name} HP ${en.hp}/${en.maxHp}`);
    slot.setAttribute('aria-describedby','floatingEnemyTooltip');

    // The shared strip owns the three-icon limit, including mechanic states.
    syncEnemyMechanicVisual(en, slot);
    syncBattleVitals(slot.querySelector('.tos-enemy-hp-bar'),en);
  });
  syncEnemyTargetIndicators();
}

const BUFF_ICON_MAP = {
  poison: '/assets/icons/status/中毒.webp',
  alc_poison: '/assets/icons/status/中毒.webp',
  flask_poison: '/assets/icons/status/中毒.webp',
  burn: '/assets/icons/status/燃燒.webp',
  fire: '/assets/icons/status/燃燒.webp',
  ember: '/assets/icons/status/燃燒.webp',
  flask_burn: '/assets/icons/status/燃燒.webp',
  bleed: '/assets/icons/status/流血.webp',
  blood_stacks: '/assets/icons/status/流血.webp',
  blood_stack: '/assets/icons/status/流血.webp',
  fracture: '/assets/icons/status/骨折.webp',
  flask_fracture: '/assets/icons/status/骨折.webp',
  chill: '/assets/icons/status/寒冷.webp',
  freeze: '/assets/icons/status/寒冷.webp',
  frost: '/assets/icons/status/寒冷.webp',
  flask_chill: '/assets/icons/status/寒冷.webp',
  corrosion: '/assets/icons/status/腐蝕.webp',
  alc_acid: '/assets/icons/status/腐蝕.webp',
  alchemy_corrosion: '/assets/icons/status/腐蝕.webp',
  shield_decay: '/assets/icons/status/腐蝕.webp',
  acid_defense: '/assets/icons/status/腐蝕.webp',
  corruption: '/assets/icons/status/深淵腐化.png',
  abyss_corruption: '/assets/icons/status/深淵腐化.png',
  shield: '/assets/icons/status/護盾.webp',
  temp_hp: '/assets/icons/status/護盾.webp',
  sage_shield: '/assets/icons/status/護盾.webp',
  barrier: '/assets/icons/status/護盾.webp',
  guard: '/assets/icons/status/減傷.webp',
  treant_guard: '/assets/icons/status/減傷.webp',
  crouch: '/assets/icons/status/減傷.webp',
  warrior_resolve: '/assets/icons/status/減傷.webp',
  paladin_grace_target: '/assets/icons/status/減傷.webp',
  paladin_grace_source: '/assets/icons/status/減傷.webp',
  kyoutou: '/assets/icons/status/減傷.webp',
  vulnerable: '/assets/icons/status/易傷.webp',
  alchemy_vulnerable: '/assets/icons/status/易傷.webp',
  sage_exposed: '/assets/icons/status/易傷.webp',
  next_vulnerable: '/assets/icons/status/易傷.webp',
  weakened: '/assets/icons/status/易傷.webp',
  dodge: '/assets/icons/status/閃避加成.webp',
  dodge_bonus: '/assets/icons/status/閃避加成.webp',
  stealth: '/assets/icons/status/隱身.webp',
  stealth_stack: '/assets/icons/status/隱身.webp',
  hidden: '/assets/icons/status/隱身.webp',
  follow_up: '/assets/icons/status/隱身.webp',
  void_step: '/assets/icons/status/隱身.webp',
  sleep: '/assets/icons/status/休眠.webp',
  exhausted: '/assets/icons/status/休眠.webp',
  downed: '/assets/icons/status/休眠.webp',
  frenzy: '/assets/icons/status/狂熱.webp',
  frenzy_buff: '/assets/icons/status/狂熱.webp',
  b_frenzy: '/assets/icons/status/狂熱.webp',
  triumph: '/assets/icons/status/狂熱.webp',
  overload: '/assets/icons/status/狂熱.webp',
  blood_heal: '/assets/icons/status/狂熱.webp',
  rage: '/assets/icons/status/狂熱.webp',
  soul: '/assets/icons/status/狂熱.webp',
  galaxy: '/assets/icons/status/星系追擊.webp',
  astronomy: '/assets/icons/status/星系追擊.webp',
  boundary: '/assets/icons/status/邊界鎖血.webp',
  crit_lock: '/assets/icons/status/邊界鎖血.webp',
  surrender: '/assets/icons/status/邊界鎖血.webp',
  lock: '/assets/icons/status/邊界鎖血.webp',
  fate_blessing: '/assets/icons/status/命運加護.webp',
  fate_binding: '/assets/icons/status/命運加護.webp',
  blessing: '/assets/icons/status/命運加護.webp',
  augur_card: '/assets/icons/status/命運加護.webp',
  fate_debt: '/assets/icons/status/命債.webp',
  sage_debt: '/assets/icons/status/命債.webp',
  talisman: '/assets/icons/status/符咒.webp',
  talismans: '/assets/icons/status/符咒.webp',
  talisman_blind: '/assets/icons/status/符咒.webp',
  talisman_seal: '/assets/icons/status/符咒.webp',
  talisman_corrode: '/assets/icons/status/符咒.webp',
  talisman_confuse: '/assets/icons/status/符咒.webp',
  talisman_drain: '/assets/icons/status/符咒.webp',
  equation: '/assets/icons/status/方程特性.webp',
  sage_equation: '/assets/icons/status/方程特性.webp',
  sage_confusion: '/assets/icons/status/方程特性.webp',
  abyss_sage: '/assets/icons/status/方程特性.webp',
  flaw_mark: '/assets/icons/status/破綻印記.webp',
  flaw: '/assets/icons/status/破綻印記.webp',
  bear: '/assets/icons/status/巨熊型態.png',
  druid_bear: '/assets/icons/status/巨熊型態.png',
  wolf: '/assets/icons/status/狼人型態.png',
  werewolf: '/assets/icons/status/狼人型態.png',
  druid_wolf: '/assets/icons/status/狼人型態.png',
  paladin_target_weight: '/assets/icons/status/神聖嘲諷.png',
  taunt: '/assets/icons/status/神聖嘲諷.png',
  augur_resistance_break: '/assets/icons/status/星芒破障.png',
  star_break: '/assets/icons/status/星芒破障.png',
  reversed_omen: '/assets/icons/status/凶兆逆位.png',
  aug_reckon: '/assets/icons/status/凶兆逆位.png',
  paladin_glory_active: '/assets/icons/status/榮耀戰歌-蓄力中.png',
  pal_glory: '/assets/icons/status/榮耀戰歌-蓄力中.png',
  arena_challenge: '/assets/icons/status/死鬥宣告.png',
  g_arena: '/assets/icons/status/死鬥宣告.png',
  duel_arena: '/assets/icons/status/死鬥宣告.png',
  attack_down: '/assets/icons/status/攻擊降低.png',
  atk_down: '/assets/icons/status/攻擊降低.png',
  weaken_atk: '/assets/icons/status/攻擊降低.png',
  sage_square: '/assets/icons/status/攻擊降低.png',
  void_cover: '/assets/icons/status/虛空掩護.png',
  abyss_watcher: '/assets/icons/status/虛空掩護.png',
  crystal_support: '/assets/icons/status/晶甲共鳴.png',
  crystal_beetle: '/assets/icons/status/晶甲共鳴.png',
  stun: '/assets/icons/status/暈眩.png',
  stunned: '/assets/icons/status/暈眩.png',
  daze: '/assets/icons/status/暈眩.png',
  seal_zero: '/assets/icons/status/暈眩.png',
  confuse: '/assets/icons/status/暈眩.png'
};

const DEFAULT_CLASS_EXCLUSIVE_SVGS = {
  warrior: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20 L30 20 L80 70 L70 80 L20 30 Z" fill="#ffffff"/><path d="M82 20 L70 20 L20 70 L30 80 L80 30 Z" fill="#ffffff"/><line x1="65" y1="85" x2="85" y2="65" stroke-width="7"/><line x1="15" y1="65" x2="35" y2="85" stroke-width="7"/></svg>`,
  paladin: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"><path d="M18 20 L58 20 L58 52 C58 70 38 84 38 84 C38 84 18 70 18 52 Z" fill="#ffffff" fill-opacity="0.25"/><line x1="38" y1="22" x2="38" y2="80" stroke-width="6"/><line x1="20" y1="45" x2="56" y2="45" stroke-width="6"/><rect x="58" y="18" width="28" height="16" rx="3" transform="rotate(15 72 26)" fill="#ffffff"/><line x1="70" y1="34" x2="56" y2="86" stroke-width="6" stroke-linecap="round"/></svg>`,
  stargazer: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="22" y="34" width="58" height="16" rx="3" transform="rotate(-22 51 42)" fill="#ffffff"/><line x1="50" y1="50" x2="34" y2="86"/><line x1="50" y1="50" x2="66" y2="86"/><line x1="50" y1="50" x2="50" y2="88"/><path d="M24 16 A10 10 0 1 0 34 28 A8 8 0 1 1 24 16 Z" fill="#ffffff" stroke="none"/><circle cx="72" cy="18" r="3" fill="#ffffff"/></svg>`,
  augur: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="22" y="34" width="58" height="16" rx="3" transform="rotate(-22 51 42)" fill="#ffffff"/><line x1="50" y1="50" x2="34" y2="86"/><line x1="50" y1="50" x2="66" y2="86"/><line x1="50" y1="50" x2="50" y2="88"/><path d="M24 16 A10 10 0 1 0 34 28 A8 8 0 1 1 24 16 Z" fill="#ffffff" stroke="none"/><circle cx="72" cy="18" r="3" fill="#ffffff"/></svg>`,
  mage: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"><line x1="20" y1="82" x2="68" y2="34"/><circle cx="72" cy="30" r="9" fill="#ffffff"/><line x1="72" y1="10" x2="72" y2="15" stroke-width="4"/><line x1="90" y1="30" x2="85" y2="30" stroke-width="4"/><line x1="85" y1="16" x2="81" y2="20" stroke-width="4"/><path d="M35 28 L38 35 L45 38 L38 41 L35 48 L32 41 L25 38 L32 35 Z" fill="#ffffff" stroke="none"/></svg>`,
  bard: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M26 18 C20 18 20 28 26 28 L26 78 L72 78 C78 55 84 35 84 26 C64 26 50 18 26 18 Z"/><line x1="38" y1="22" x2="38" y2="78" stroke-width="3"/><line x1="48" y1="24" x2="48" y2="78" stroke-width="3"/><line x1="58" y1="26" x2="58" y2="78" stroke-width="3"/><line x1="20" y1="82" x2="76" y2="82" stroke-width="7"/></svg>`,
  alchemist: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"><path d="M40 16 L60 16 M44 16 L44 34 A28 28 0 1 0 56 34 L56 16"/><path d="M26 65 Q50 58 74 65 A25 25 0 0 1 26 65 Z" fill="#ffffff"/><circle cx="44" cy="52" r="3" fill="#ffffff"/><circle cx="56" cy="45" r="4" fill="#ffffff"/></svg>`,
  assassin: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 22 C24 45 36 58 46 68 L54 60 C44 48 32 34 18 22 Z" fill="#ffffff"/><line x1="42" y1="72" x2="58" y2="56" stroke-width="6"/><line x1="50" y1="64" x2="62" y2="78" stroke-width="7"/><path d="M48 30 C58 24 66 30 68 32 C70 30 78 24 88 30 C86 42 76 44 68 38 C60 44 50 42 48 30 Z" fill="#ffffff"/><circle cx="58" cy="34" r="3" fill="#0c2144" stroke="none"/><circle cx="78" cy="34" r="3" fill="#0c2144" stroke="none"/></svg>`,
  druid: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M40 46 C26 42 18 28 22 14 M26 34 L16 28 M32 40 L30 24"/><path d="M60 46 C74 42 82 28 78 14 M74 34 L84 28 M68 40 L70 24"/><path d="M35 55 C55 50 70 65 68 84 C48 86 33 72 35 55 Z" fill="#ffffff"/><line x1="35" y1="55" x2="65" y2="82" stroke="#0c2144" stroke-width="3"/></svg>`,
  onmyoji: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="4"><circle cx="50" cy="50" r="36" stroke-opacity="0.6"/><rect x="34" y="16" width="32" height="68" rx="2" transform="rotate(8 50 50)" fill="#ffffff"/><path d="M48 28 L56 28 M46 40 L56 40 L48 54 L56 54 M44 68 L56 68 M50 24 L46 74" stroke="#0c2144" stroke-width="4" stroke-linecap="round"/></svg>`,
  dreamweaver: `<svg viewBox="0 0 100 100" fill="#ffffff" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"><path d="M48 48 C34 24 14 22 18 42 C20 52 36 54 48 52 C34 56 22 68 28 78 C34 86 46 74 48 58 Z"/><path d="M52 48 C66 24 86 22 82 42 C80 52 64 54 52 52 C66 56 78 68 72 78 C66 86 54 74 52 58 Z"/><line x1="50" y1="32" x2="50" y2="72" stroke-width="5" stroke-linecap="round"/></svg>`,
  diviner: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5"><circle cx="50" cy="46" r="28" fill="#ffffff" fill-opacity="0.25"/><path d="M30 74 L70 74 L76 86 L24 86 Z" fill="#ffffff"/><path d="M58 32 L61 39 L68 42 L61 45 L58 52 L55 45 L48 42 L55 39 Z" fill="#ffffff" stroke="none"/></svg>`,
  samurai: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M32 22 C32 36 42 42 50 42 C58 42 68 36 68 22" stroke-width="6"/><path d="M26 48 C26 32 74 32 74 48 L82 68 L18 68 Z" fill="#ffffff" fill-opacity="0.3"/><line x1="16" y1="22" x2="84" y2="84" stroke-width="7"/></svg>`,
  sage: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><text x="20" y="34" fill="#ffffff" stroke="none" font-size="22" font-weight="bold">π Σ √</text><path d="M16 48 L48 52 L48 84 L16 80 Z" fill="#ffffff"/><path d="M84 48 L52 52 L52 84 L84 80 Z" fill="#ffffff"/></svg>`,
  archer: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M26 18 C66 24 76 58 56 86"/><line x1="26" y1="18" x2="56" y2="86" stroke-width="3"/><line x1="22" y1="78" x2="78" y2="22" stroke-width="5"/><polygon points="78,22 65,24 76,35" fill="#ffffff"/></svg>`,
  gladiator: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="18" x2="82" y2="82" stroke-width="6"/><line x1="82" y1="18" x2="18" y2="82" stroke-width="6"/><path d="M30 42 C30 24 70 24 70 42 L70 74 L56 84 L56 58 L44 58 L44 84 L30 74 Z" fill="#ffffff"/><path d="M36 48 L46 52 L36 56 Z M64 48 L54 52 L64 56 Z" fill="#0c2144" stroke="none"/></svg>`,
  cleric: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"><rect x="38" y="14" width="24" height="72" rx="4" fill="#ffffff"/><rect x="18" y="34" width="64" height="24" rx="4" fill="#ffffff"/><circle cx="50" cy="46" r="14" fill="#0c2144"/></svg>`
};

function resolveStatusCloudUrl(path) {
  if (!path) return path;
  if (typeof window !== 'undefined' && window.assetRegistry && typeof window.assetRegistry.resolvePath === 'function') {
    return window.assetRegistry.resolvePath(path);
  }
  return path;
}

function isLeaderSkillStatus(status) {
  if (!status) return false;
  const id = String(status.id || '').toLowerCase();
  return Boolean(status.isLeaderPassive || status.isLeaderSkill || id.startsWith('leader_'));
}

function resolveLeaderStatusRole(status, contextRole = null) {
  if (!status) return null;
  if (status.leaderRole && typeof status.leaderRole === 'string') return status.leaderRole.toLowerCase();
  if (status.role && typeof status.role === 'string') return status.role.toLowerCase();
  const id = String(status.id || '').toLowerCase();
  if (id.startsWith('leader_')) {
    const extracted = id.slice('leader_'.length);
    if (extracted) return extracted;
  }
  if (contextRole && typeof contextRole === 'string') return contextRole.toLowerCase();
  if (typeof roomState !== 'undefined' && roomState?.lockedLeaderRole) {
    return String(roomState.lockedLeaderRole).toLowerCase();
  }
  return null;
}

function isNegativeStatus(status) {
  if (!status) return false;
  const id = String(status.id || '').toLowerCase();
  const icon = String(status.icon || '').toLowerCase();
  const category = String(status.category || '').toUpperCase();
  const knownNegativeIds = new Set([
    'mirror', 'dissociate', 'nightmare_weak', 'frenzy_backfire', 'false_history',
    'parasite', 'unrest', 'backlash', 'confuse', 'seal_zero', 'sage_debt', 'fate_debt'
  ]);
  return Boolean(
    status.isNegative ||
    status.isDot ||
    category === 'DEBUFF' ||
    icon === 'debuff' ||
    knownNegativeIds.has(id) ||
    id.includes('debuff') ||
    id.includes('curse') ||
    id.includes('down')
  );
}

function getDefaultStatusSvg(status, extraClass = '') {
  const cls = ['ui-icon', 'svg-icon', extraClass].filter(Boolean).join(' ');
  if (isNegativeStatus(status)) {
    return `<svg class="${cls} status-default-debuff-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 4 12h5V3h6v9h5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  }
  return `<svg class="${cls} status-default-buff-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 12h5v9h6v-9h5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

function getLeaderStatusSvg(status, contextRole = null) {
  const role = resolveLeaderStatusRole(status, contextRole);
  const svgMap = (typeof CLASS_EXCLUSIVE_SVGS !== 'undefined' && CLASS_EXCLUSIVE_SVGS && Object.keys(CLASS_EXCLUSIVE_SVGS).length > 0)
    ? CLASS_EXCLUSIVE_SVGS
    : DEFAULT_CLASS_EXCLUSIVE_SVGS;
  if (role && svgMap[role]) {
    return svgMap[role];
  }
  return getDefaultStatusSvg(status);
}

function formatStatusDisplay(s) {
  if (!s) return { head: '', dmgText: '', turnsText: '', stacksText: '', desc: '', fullTitle: '', detailText: '' };
  const hasStacks = typeof s.stacks === 'number' && s.stacks > 0;
  const stacksText = hasStacks ? `×${s.stacks}` : '';
  const dotDmg = typeof s.damage === 'number' && s.damage > 0
    ? s.damage
    : (s.isDot && typeof s.value === 'number' && s.value > 0 ? s.value : null);
  const nonDotVal = !s.isDot && s.damage === undefined && s.value !== undefined && s.value !== ''
    ? String(s.value)
    : '';
  const dmgText = dotDmg !== null ? `每回合 ${dotDmg} 傷害` : nonDotVal;
  const turnsText = typeof s.turns === 'number' && s.turns > 0 ? `剩餘 ${s.turns} 回合` : '';
  const desc = s.desc ? String(s.desc) : '';
  const baseLabel = String(s.label || s.id || '');
  const head = stacksText ? `${baseLabel} ${stacksText}` : baseLabel;
  const detailText = [dmgText, turnsText, desc].filter(Boolean).join('｜');
  const fullTitle = [head, dmgText, turnsText, desc].filter(Boolean).join('｜');
  return { head, dmgText, turnsText, stacksText, desc, fullTitle, detailText };
}

function getBuffIconUrl(status) {
  if (!status) return null;
  if (isLeaderSkillStatus(status)) return null;
  const id = String(status.id || '').toLowerCase();
  const icon = String(status.icon || '').toLowerCase();
  const label = String(status.label || '');
  const val = String(status.value || '');

  if (BUFF_ICON_MAP[id]) return resolveStatusCloudUrl(BUFF_ICON_MAP[id]);
  if (id.startsWith('mark_')) return resolveStatusCloudUrl('/assets/icons/status/破綻印記.webp');

  if (label.includes('巨熊') || val.includes('巨熊')) return resolveStatusCloudUrl('/assets/icons/status/巨熊型態.png');
  if (label.includes('狼人') || val.includes('狼人')) return resolveStatusCloudUrl('/assets/icons/status/狼人型態.png');
  if (label.includes('神聖嘲諷') || label.includes('嘲諷')) return resolveStatusCloudUrl('/assets/icons/status/神聖嘲諷.png');
  if (label.includes('星芒破障') || label.includes('星芒破陣')) return resolveStatusCloudUrl('/assets/icons/status/星芒破障.png');
  if (label.includes('凶兆逆位')) return resolveStatusCloudUrl('/assets/icons/status/凶兆逆位.png');
  if (label.includes('榮耀讚歌') || label.includes('榮耀戰歌') || label.includes('蓄力中')) return resolveStatusCloudUrl('/assets/icons/status/榮耀戰歌-蓄力中.png');
  if (label.includes('死鬥宣告') || label.includes('死鬥') || label.includes('角鬥場')) return resolveStatusCloudUrl('/assets/icons/status/死鬥宣告.png');
  if (label.includes('攻擊降低') || label.includes('ATK DOWN') || label.includes('攻擊壓制') || label.includes('直接傷害 -25%')) return resolveStatusCloudUrl('/assets/icons/status/攻擊降低.png');
  if (label.includes('虛空掩護')) return resolveStatusCloudUrl('/assets/icons/status/虛空掩護.png');
  if (label.includes('晶甲共鳴') || label.includes('晶甲反射')) return resolveStatusCloudUrl('/assets/icons/status/晶甲共鳴.png');
  if (label.includes('深淵腐化') || label.includes('腐化')) return resolveStatusCloudUrl('/assets/icons/status/深淵腐化.png');
  if (label.includes('暈眩') || label.includes('眩暈') || label.includes('STUN') || label.includes('行動受阻') || label.includes('惑亂')) return resolveStatusCloudUrl('/assets/icons/status/暈眩.png');

  if (label.includes('中毒')) return resolveStatusCloudUrl('/assets/icons/status/中毒.webp');
  if (label.includes('燃燒') || label.includes('灼燒') || label.includes('熱度')) return resolveStatusCloudUrl('/assets/icons/status/燃燒.webp');
  if (label.includes('流血') || label.includes('血祭')) return resolveStatusCloudUrl('/assets/icons/status/流血.webp');
  if (label.includes('骨折')) return resolveStatusCloudUrl('/assets/icons/status/骨折.webp');
  if (label.includes('寒冷') || label.includes('寒霜') || label.includes('冰')) return resolveStatusCloudUrl('/assets/icons/status/寒冷.webp');
  if (label.includes('腐蝕') || label.includes('強酸') || label.includes('酸液')) return resolveStatusCloudUrl('/assets/icons/status/腐蝕.webp');
  if (label.includes('護盾') || label.includes('TEMP HP') || label.includes('壁壘')) return resolveStatusCloudUrl('/assets/icons/status/護盾.webp');
  if (label.includes('減傷') || label.includes('堅守') || label.includes('堅定') || label.includes('恩典') || label.includes('GUARD') || label.includes('DR ') || label.includes('狂刀')) return resolveStatusCloudUrl('/assets/icons/status/減傷.webp');
  if (label.includes('易傷') || label.includes('VULNERABLE') || label.includes('承傷 +') || label.includes('受傷增加') || label.includes('負傷')) return resolveStatusCloudUrl('/assets/icons/status/易傷.webp');
  if (label.includes('閃避') || label.includes('DODGE')) return resolveStatusCloudUrl('/assets/icons/status/閃避加成.webp');
  if (label.includes('隱身') || label.includes('匿蹤') || label.includes('追擊') || label.includes('暗影步')) return resolveStatusCloudUrl('/assets/icons/status/隱身.webp');
  if (label.includes('休眠') || label.includes('沉睡') || label.includes('虛弱') || label.includes('倒下') || label.includes('EXHAUSTED')) return resolveStatusCloudUrl('/assets/icons/status/休眠.webp');
  if (label.includes('狂熱') || label.includes('DMG +') || label.includes('凱旋') || label.includes('過載') || label.includes('充能') || label.includes('怒氣') || label.includes('武魂')) return resolveStatusCloudUrl('/assets/icons/status/狂熱.webp');
  if (label.includes('星系')) return resolveStatusCloudUrl('/assets/icons/status/星系追擊.webp');
  if (label.includes('鎖血') || label.includes('邊界') || label.includes('臣服') || label.includes('LOCK')) return resolveStatusCloudUrl('/assets/icons/status/邊界鎖血.webp');
  if (label.includes('命運加護') || label.includes('命運繫結') || label.includes('諭示牌')) return resolveStatusCloudUrl('/assets/icons/status/命運加護.webp');
  if (label.includes('命債') || label.includes('透支')) return resolveStatusCloudUrl('/assets/icons/status/命債.webp');
  if (label.includes('符')) return resolveStatusCloudUrl('/assets/icons/status/符咒.webp');
  if (label.includes('方程') || label.includes('假設') || label.includes('求解') || label.includes('紊亂') || label.includes('演算')) return resolveStatusCloudUrl('/assets/icons/status/方程特性.webp');
  if (label.includes('破綻') || label.includes('印記') || label.includes('標記') || label.includes('懸賞') || label.includes('瞄準') || label.includes('號令')) return resolveStatusCloudUrl('/assets/icons/status/破綻印記.webp');

  if (BUFF_ICON_MAP[icon]) return resolveStatusCloudUrl(BUFF_ICON_MAP[icon]);

  return null;
}

function renderStatusIconMarkup(status, options = {}) {
  if (!status) return '';
  const { contextRole = null, variant = 'badge' } = options;
  const safeAlt = typeof escapeHtml === 'function' ? escapeHtml(status.label || 'status') : String(status.label || 'status').replace(/"/g, '&quot;');
  if (isLeaderSkillStatus(status)) {
    const svg = getLeaderStatusSvg(status, contextRole);
    if (variant === 'tooltip') {
      return `<div class="exclusive-buff-icon-svg" style="width:14px;height:14px;display:inline-flex;vertical-align:middle;margin-right:4px;">${svg}</div>`;
    }
    return `<div class="exclusive-buff-icon-svg">${svg}</div>`;
  }
  const iconUrl = getBuffIconUrl(status);
  if (iconUrl) {
    const safeSrc = typeof escapeHtml === 'function' ? escapeHtml(iconUrl) : iconUrl;
    if (variant === 'tooltip') {
      return `<img src="${safeSrc}" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:4px;" alt="${safeAlt}">`;
    }
    if (variant === 'hud') {
      return `<img src="${safeSrc}" alt="${safeAlt}">`;
    }
    const imgClass = variant === 'enemy' ? 'teammate-buff-icon enemy-buff-icon' : 'teammate-buff-icon';
    return `<img src="${safeSrc}" class="${imgClass}" alt="${safeAlt}" loading="lazy">`;
  }
  if (variant === 'tooltip') {
    return `<span style="width:14px;height:14px;display:inline-flex;vertical-align:middle;margin-right:4px;">${getDefaultStatusSvg(status, 'ui-icon--sm')}</span>`;
  }
  return getDefaultStatusSvg(status, variant === 'hud' ? '' : 'ui-icon--sm');
}

// 判斷是否為職業特殊機制/疊層（已於第3行特殊疊層呈現，不在第4行 buff 欄重複顯示）
function isSpecialStackStatus(s) {
  if (!s) return false;
  const id = String(s.id || '').toLowerCase();
  const label = String(s.label || '');

  const specialIds = [
    'soul',
    'kyoutou',
    'rage',
    'blood_stacks',
    'blood_stack',
    'sage_equation',
    'sage_debt',
    'augur_card',
    'fate_debt',
    'warrior_stack',
    'warrior_stacks',
    'crossbow_ammo',
    'follow_up'
  ];
  if (specialIds.includes(id)) return true;

  if (
    label.includes('武魂') ||
    label.includes('狂刀') ||
    label.includes('怒氣') ||
    label.includes('血祭') ||
    label.includes('命債') ||
    label.includes('諭示牌') ||
    label.includes('變量透支') ||
    label.includes('假設') ||
    label.includes('求解') ||
    label.includes('受傷攻擊') ||
    label.includes('弩箭') ||
    label.includes('追擊')
  ) {
    return true;
  }

  return false;
}

// 隊友卡片 buff/debuff 圖示渲染 (如果是特殊疊層則不在此重複顯示，只顯示圖片，不要寫文字，最多5個圖片)
function renderTeammateBuffIcons(statuses = []) {
  if (!Array.isArray(statuses) || statuses.length === 0) return '';
  // 過濾掉特殊機制疊層，僅保留純粹之 buff 與 debuff
  const realBuffs = statuses.filter(s => !isSpecialStackStatus(s));
  const displayStatuses = realBuffs.slice(0, 5);
  return displayStatuses.map(s => {
    if (isLeaderSkillStatus(s)) {
      const titleParts = [
        `【隊長技】${s.label || s.id}`,
        s.desc || s.value || ''
      ].filter(Boolean);
      const title = titleParts.join(' - ');
      return `<span class="teammate-buff-item teammate-buff-exclusive" title="${escapeHtml(title)}">${renderStatusIconMarkup(s, { variant: 'badge' })}</span>`;
    }
    const title = formatStatusDisplay(s).fullTitle;
    return `<span class="teammate-buff-item" title="${escapeHtml(title)}">${renderStatusIconMarkup(s, { variant: 'badge' })}</span>`;
  }).join('');
}

// 角色頭像 Hover 彈窗 (類似敵人的小彈窗)
function showPlayerTooltip(p, eOrTarget) {
  if (!elements.floatingEnemyTooltip || !p) return;
  const liveP = (roomState?.players || []).find(x => x.id === p.id) || p;
  const roleConfig = classesData[liveP.role] || { name: '勇者' };
  const roleNameZh = window.StudioContent?.find('role_profiles', liveP.role)?.name_zh || roleConfig.name || '勇者';
  const roleDesc = window.StudioContent?.find('role_profiles', liveP.role)?.desc || roleConfig.desc || '';
  const hpPct = Math.max(0, Math.min(100, Math.round((liveP.hp / Math.max(1, liveP.maxHp)) * 100)));

  const pEquips = liveP.equips || [];
  const equipCount = pEquips.length;
  const equipNames = equipCount > 0 ? pEquips.map(e => {
    const override = window.StudioContent?.rows('story_copies').find(s => s.category === 'equipment' && s.story_key === ('equip.' + liveP.role + '.' + e.id));
    return override?.title || e.name;
  }).join(', ') : '無';

  // 彈窗狀態欄過濾掉已於「特殊機制」顯示的特殊疊層
  const statuses = (liveP.statuses || []).filter(s => !isSpecialStackStatus(s));
  let buffsHtml = '';
  if (statuses.length > 0) {
    buffsHtml = `<div class="floating-tooltip-buffs">${statuses.map(s => {
      const iconTag = renderStatusIconMarkup(s, { variant: 'tooltip', contextRole: liveP.role });
      const fmt = formatStatusDisplay(s);
      return `<span class="buff-badge" style="font-size:11px;padding:2px 6px;display:inline-flex;align-items:center;gap:4px;">
        ${iconTag}${escapeHtml(fmt.head)}${fmt.detailText ? ' (' + escapeHtml(fmt.detailText) + ')' : ''}
      </span>`;
    }).join('')}</div>`;
  } else {
    buffsHtml = `<div class="floating-tooltip-row"><span class="floating-tooltip-label">當前狀態</span><span class="floating-tooltip-val" style="color:var(--color-text-muted);">正常</span></div>`;
  }

  const resourceText = liveP.resourceSummary || roleConfig.stateHint || '';

  elements.floatingEnemyTooltip.innerHTML = `
    <div class="floating-tooltip-title-row">
      <span class="floating-tooltip-name tier-t1">${escapeHtml(liveP.name)}</span>
      <span class="floating-tooltip-badge">${escapeHtml(roleNameZh)}</span>
    </div>
    <div class="floating-tooltip-row">
      <span class="floating-tooltip-label">生命值</span>
      <span class="floating-tooltip-val" style="color:${hpPct < 25 ? '#ef4444' : hpPct < 50 ? '#f59e0b' : '#10b981'}; font-weight:800;">
        ${liveP.hp} / ${liveP.maxHp} (${hpPct}%)${liveP.tempHp > 0 ? ` <span style="color:#60a5fa;font-size:11px;">+${liveP.tempHp} 護盾</span>` : ''}
      </span>
    </div>
    <div class="floating-tooltip-row">
      <span class="floating-tooltip-label">戰鬥三圍</span>
      <span class="floating-tooltip-val">ATK ${liveP.ATK_base ?? 0} · 物 +${liveP.PAtk_gear ?? 0} · 魔 +${liveP.MAtk_gear ?? 0} · DEF ${liveP.DEF ?? 0}</span>
    </div>
    ${resourceText ? `
    <div class="floating-tooltip-row">
      <span class="floating-tooltip-label">職業機制</span>
      <span class="floating-tooltip-val" style="color:var(--color-focus);">${escapeHtml(resourceText)}</span>
    </div>` : ''}
    <div class="floating-tooltip-row">
      <span class="floating-tooltip-label">配戴裝備 (${equipCount}/4)</span>
      <span class="floating-tooltip-val">${escapeHtml(equipNames)}</span>
    </div>
    ${buffsHtml}
    ${roleDesc ? `<div class="floating-tooltip-desc">${escapeHtml(roleDesc)}</div>` : ''}
  `;

  elements.floatingEnemyTooltip.classList.add('visible');
  positionFloatingTooltip(eOrTarget, elements.floatingEnemyTooltip);
}

// 隊友卡片網格
function renderTeammatesGrid(me) {
  elements.battleTeammatesGrid.innerHTML = '';

  roomState.players.forEach(p => {
    const isThisMe = p.id === myId;
    const roleInfo = classesData[p.role] || { name: '勇者' };
    const isDead = p.hp <= 0;
    const hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));

    let hpClass = '';
    if (hpPct < 30) hpClass = 'low';
    else if (hpPct < 60) hpClass = 'mid';

    const card = document.createElement('div');
    card.className = `teammate-card ${p.isHiddenThisRound && !p.stealthBrokenThisRound ? 'is-assassin-hidden' : ''} ${isThisMe ? 'is-me' : ''} ${isDead ? 'is-dead' : ''}`;
    card.setAttribute('data-player-id', p.id);
    card.classList.toggle('arena-absent',!!p.arenaBlocked);
    card.innerHTML = `
      <div class="floating-text-container"></div>
      <!-- 第1行：職業頭像 名字 選擇中 -->
      <div class="teammate-top">
        <span class="teammate-name-group">
          <span class="teammate-avatar-wrap portrait-root" tabindex="0" role="button" aria-label="查看角色詳細資訊">
            ${getPlayerAvatarHtml(p, 'teammate-avatar-img portrait-image')}
          </span>
          <span class="teammate-name-text">${escapeHtml(p.name)}</span>
          ${isThisMe ? '<span class="teammate-me-tag">(你)</span>' : ''}
        </span>
        <span class="action-status-dot ${p.isLocked || isDead || p.stunnedNextTurn || p.isSurrendered || p.druidForm === 'tree' ? 'ready' : 'waiting'}">
          ${isDead ? '倒下・本層無法行動' : (p.isSurrendered ? '臣服' : (p.druidForm === 'tree' ? '休眠' : (p.stunnedNextTurn ? '虛弱' : (p.isLocked ? `${getIconSvg('lock')} 已鎖定` : `${getIconSvg('timer')} 選擇中`))))}
        </span>
      </div>
      <!-- 第2行：血條 -->
      <div class="teammate-hp-row">
        <div class="teammate-hp-bg">
          <div class="teammate-hp-fill ${hpClass}" style="width: ${hpPct}%;"></div>
          ${(p.tempHp > 0) ? `<div class="hp-bar-overheal" style="width: ${Math.min(100, Math.round(((p.hp + p.tempHp) / (p.maxHp + p.tempHp)) * 100))}%;"></div>` : ''}
          <div class="teammate-hp-number">HP ${p.tempHp > 0 ? `${p.hp + p.tempHp}/${p.maxHp}` : `${p.hp}/${p.maxHp}`}${p.tempHp > 0 ? ` (+${p.tempHp})` : ''}</div>
        </div>
      </div>
      <!-- 第3行：特殊疊層 -->
      <div class="teammate-resource-row combat-resource-summary">${escapeHtml(p.resourceSummary || roleInfo.stateHint || '')}</div>
      <!-- 第4行：buff或debuff (最多5個圖片，只顯示圖片) -->
      <div class="teammate-buffs-row combat-status-list">${renderTeammateBuffIcons(p.statuses || [])}</div>
    `;
    elements.battleTeammatesGrid.appendChild(card);
    syncBattleVitals(card.querySelector('.teammate-hp-bg'),p);

    const avatarWrap = card.querySelector('.teammate-avatar-wrap');
    if (avatarWrap) {
      if (typeof syncPortraitStatusFx === 'function') {
        syncPortraitStatusFx(p, avatarWrap, { scale: 0.28 });
      }
      avatarWrap.addEventListener('mouseenter', (ev) => showPlayerTooltip(p, ev));
      avatarWrap.addEventListener('mousemove', (ev) => positionFloatingTooltip(ev, elements.floatingEnemyTooltip));
      avatarWrap.addEventListener('mouseleave', () => hideEnemyTooltip());
      avatarWrap.addEventListener('click', () => showPlayerTooltip(p,avatarWrap));
      avatarWrap.addEventListener('focus', () => showPlayerTooltip(p,avatarWrap));
      avatarWrap.addEventListener('blur',hideEnemyTooltip);
      avatarWrap.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showPlayerTooltip(p,avatarWrap);}});
    }

    syncBattleCompanions(p);
  });

  // 如果當前開啟的夥伴視窗所屬玩家已無夥伴，自動關閉小視窗
  if (activeViewingMinionOwnerId) {
    const owner = (roomState.players || []).find(x => x.id === activeViewingMinionOwnerId);
    if (!owner || !owner.minions || owner.minions.length === 0) {
      hideMinionDetailModal();
    }
  }
}

function updateMonsterHpDisplay(hp, maxHp, enemyId = null) {
  const safeHp = Math.max(0, hp);
  const pct = Math.max(0, Math.min(100, (safeHp / Math.max(1, maxHp)) * 100));
  const selected = !enemyId || enemyId === currentSelectedEnemyId;
  if (selected && elements.monsterHpText) elements.monsterHpText.textContent = `${safeHp} / ${maxHp}`;
  if (selected && elements.monsterHpFill) elements.monsterHpFill.style.width = `${pct}%`;

  const slot = enemyId ? getEnemyAnchor(enemyId)?.element : document.querySelector('.battle-enemy-slot.is-target');

  if (slot) {
    syncBattleVitals(slot.querySelector('.tos-enemy-hp-bar'),slot._currentEnemy||{hp,maxHp});
    const fill = slot.querySelector('.tos-hp-fill');
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.className = `tos-hp-fill ${pct < 25 ? 'hp-crit' : (pct < 50 ? 'hp-warn' : '')}`;
    }
    const hpNum = slot.querySelector('.hp-num');
    if (hpNum) {
      hpNum.textContent = `${safeHp} / ${maxHp}`;
    }
    if (safeHp <= 0) {
      slot.classList.add('is-dead');
      slot.classList.remove('is-target');
      slot.setAttribute('aria-pressed', 'false');
      const reticle = slot.querySelector('.enemy-target-reticle');
      if (reticle) reticle.style.display = 'none';
      slot.tabIndex = -1;
    } else {
      slot.classList.remove('is-dead');
      slot.tabIndex = 0;
    }
  }
}

// 專用非破壞性 HUD 增量更新 (P2-R1.1 Section 1)
function updateBattleHudFromSnapshot(snapshot) {
  if (!snapshot) return;

  // 1. 首領怪物 HP 與死亡視覺狀態
  if (snapshot.monster) {
    if (roomState) {
      const id = snapshot.monster.instanceId || snapshot.monster.id;
      const enemy = roomState.enemies?.find(e => (e.instanceId || e.id) === id);
      if (enemy) Object.assign(enemy, snapshot.monster);
      // monster is a compatibility alias, never a second health owner.
      roomState.currentMonster = enemy || { ...snapshot.monster };
      if (roomState.monster) roomState.monster = roomState.currentMonster;
      const node = getEnemyAnchor(id)?.element;
      if (node) node._currentEnemy = { ...node._currentEnemy, ...snapshot.monster };
    }
    updateMonsterHpDisplay(snapshot.monster.hp, snapshot.monster.maxHp, snapshot.monster.instanceId || snapshot.monster.id);
    if (elements.monsterAvatar) {
      if (snapshot.monster.hp <= 0) {
        elements.monsterAvatar.classList.add('is-dead');
      } else {
        elements.monsterAvatar.classList.remove('is-dead');
      }
      if (typeof syncPortraitStatusFx === 'function') {
        syncPortraitStatusFx(snapshot.monster, elements.monsterAvatarWrap || elements.monsterAvatar, { scale: 1.1 });
      }
    }
  }

  // 多目標編隊敵方血條更新
  if (Array.isArray(snapshot.enemies)) {
    snapshot.enemies.forEach(en => {
      const current = roomState?.enemies?.find(e => (e.instanceId || e.id) === (en.instanceId || en.id));
      if (current) Object.assign(current, en);
      const node = getEnemyAnchor(en.instanceId || en.id)?.element;
      if (node) { node._currentEnemy = { ...node._currentEnemy, ...en }; syncEnemyMechanicVisual(node._currentEnemy, node); }
      const eid = en.instanceId || en.id;
      if (eid) {
        updateMonsterHpDisplay(en.hp, en.maxHp, eid);
      }
    });
  }

  // 2. 隊友 HP、額外生命、死亡狀態增量更新 (無重繪)
  if (snapshot.players && roomState && roomState.players) {
    roomState.players.forEach(p => {
      const snapP = Array.isArray(snapshot.players) ? snapshot.players.find(s => s.id === p.id) : snapshot.players[p.id];
      if (snapP) {
        Object.assign(p, snapP);
        p.hp = snapP.hp;
        p.tempHp = snapP.tempHp || 0;
        p.displayHp = snapP.displayHp;
        p.maxHp = snapP.maxHp;
        p.displayMaxHp = snapP.displayMaxHp;
      }

      const card = document.querySelector(`.teammate-card[data-player-id="${p.id}"]`);
      if (card) {
        card.classList.toggle('arena-absent',!!p.arenaBlocked);
        const resource=card.querySelector('.combat-resource-summary');
        if(resource)resource.textContent=p.resourceSummary||'';
        let status = card.querySelector('.combat-status-list');
        if (!status) { status = document.createElement('div'); status.className = 'combat-status-list teammate-buffs-row'; card.appendChild(status); }
        status.innerHTML = renderTeammateBuffIcons(p.statuses || []);
        card.classList.toggle('is-assassin-hidden', !!p.isHiddenThisRound && !p.stealthBrokenThisRound && p.hp > 0);
        const isDead = p.hp <= 0;
        if (isDead) {
          card.classList.add('is-dead');
        } else {
          card.classList.remove('is-dead');
        }

        const hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
        let hpClass = '';
        if (hpPct < 30) hpClass = 'low';
        else if (hpPct < 60) hpClass = 'mid';

        const hpFill = card.querySelector('.teammate-hp-fill');
        if (hpFill) {
          hpFill.className = `teammate-hp-fill ${hpClass}`;
          hpFill.style.width = `${hpPct}%`;
        }

        let overhealFill = card.querySelector('.hp-bar-overheal');
        if (p.tempHp > 0) {
          const totalOverhealPct = Math.min(100, Math.round(((p.hp + p.tempHp) / (p.maxHp + p.tempHp)) * 100));
          if (!overhealFill) {
            overhealFill = document.createElement('div');
            overhealFill.className = 'hp-bar-overheal';
            const hpBg = card.querySelector('.teammate-hp-bg');
            if (hpBg) hpBg.appendChild(overhealFill);
          }
          if (overhealFill) overhealFill.style.width = `${totalOverhealPct}%`;
        } else if (overhealFill) {
          overhealFill.remove();
        }

        const hpNumber = card.querySelector('.teammate-hp-number');
        if (hpNumber) {
          hpNumber.textContent = `HP ${p.tempHp > 0 ? `${p.hp + p.tempHp}/${p.maxHp}` : `${p.hp}/${p.maxHp}`}${p.tempHp > 0 ? ` (+${p.tempHp})` : ''}`;
        }
        const statsSub = card.querySelector('.teammate-stats-sub');
        if (statsSub) {
          const hpSpan = statsSub.querySelector('span:first-child');
          if (hpSpan) {
            hpSpan.innerHTML = `HP ${p.tempHp > 0 ? `${p.hp + p.tempHp}/${p.maxHp}` : `${p.hp}/${p.maxHp}`}${p.tempHp > 0 ? `<span class="teammate-overheal-badge">+${p.tempHp} 額外</span>` : ''}`;
          }
        }

        const actionDot = card.querySelector('.action-status-dot');
        if (actionDot && isDead) {
          actionDot.className = 'action-status-dot ready';
          actionDot.textContent = '倒下・本層無法行動';
        }

        // 德魯伊變身形態與頭像同步（結束變身時還原為原始德魯伊造型）
        if (p.role === 'druid') {
          const avatarEl = card.querySelector('.teammate-avatar-img');
          if (avatarEl) {
            const isEmoji = p.customAvatar && !p.customAvatar.startsWith('data:image/') && !p.customAvatar.startsWith('http') && !p.customAvatar.startsWith('/');
            if (p.druidForm === 'werewolf' || p.druidForm === 'treant' || p.druidForm === 'tree' || p.druidForm === 'bear') {
              const formSrc = p.druidForm === 'werewolf' ? '/assets/characters/forms/druid/狼人.webp' : (p.druidForm === 'bear' ? '/assets/characters/forms/druid/巨熊.webp' : '/assets/characters/forms/druid/遠古樹精.webp');
              const formAlt = p.druidForm === 'werewolf' ? '狼人' : (p.druidForm === 'bear' ? '巨熊' : '遠古樹精');
              if (avatarEl.tagName === 'IMG') {
                if (!avatarEl.src || !avatarEl.src.endsWith(formSrc)) avatarEl.src = formSrc;
                avatarEl.alt = formAlt;
                avatarEl.classList.add('druid-transformed-avatar');
              } else if (typeof avatarEl.replaceWith === 'function') {
                const temp = document.createElement('div');
                temp.innerHTML = `<img src="${formSrc}" class="teammate-avatar-img druid-transformed-avatar" alt="${formAlt}">`;
                if (temp.firstElementChild) avatarEl.replaceWith(temp.firstElementChild);
              }
            } else {
              if (isEmoji) {
                if (avatarEl.tagName !== 'DIV' && typeof avatarEl.replaceWith === 'function') {
                  const temp = document.createElement('div');
                  temp.innerHTML = `<div class="teammate-avatar-img avatar-emoji-badge">${escapeHtml(p.customAvatar)}</div>`;
                  if (temp.firstElementChild) avatarEl.replaceWith(temp.firstElementChild);
                }
              } else if (avatarEl.tagName === 'IMG') {
                const origSrc = p.customAvatar || p.avatar || (classesData['druid']?.avatar) || '/assets/characters/portraits/Druid.webp';
                if (!avatarEl.src || !avatarEl.src.endsWith(origSrc)) avatarEl.src = origSrc;
                avatarEl.alt = p.name || '德魯伊';
                avatarEl.classList.remove('druid-transformed-avatar');
              }
            }
          }
        }

        const avatarWrap = card.querySelector('.teammate-avatar-wrap');
        syncBattleVitals(card.querySelector('.teammate-hp-bg'),p);
        if (avatarWrap && typeof syncPortraitStatusFx === 'function') {
          syncPortraitStatusFx(p, avatarWrap, { scale: 0.28 });
        }
      }
    });

    for(const player of roomState.players)syncBattleCompanions(player);
  }
}
