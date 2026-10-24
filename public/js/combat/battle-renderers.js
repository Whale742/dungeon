// Shared production battlefield renderers. Moved unchanged from app.js; both game and Lab use these functions.
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

  const buffs = enemyDisplayStatuses(en).filter(status=>!info.resource||status.id!=='enemy_mechanic').map(status=>({icon:status.icon||'status',label:status.label||status.id,
    desc:[status.value!==undefined&&status.value!==''?String(status.value):'',status.stacks!==undefined?'層數 '+status.stacks:'',status.turns?status.turns+' 回合':'',status.desc||''].filter(Boolean).join(' · ')}));
  if(en.tempHp>0)buffs.push({icon:'shield',label:'護盾',desc:String(en.tempHp)});
  if(info.resource)buffs.push({icon:'buff',label:info.resource.label,desc:info.resource.value+'/'+info.resource.max});
  let buffsHtml = '';
  if (buffs.length > 0) {
    buffsHtml = `<div class="floating-tooltip-buffs">${buffs.map(b => `
      <span class="buff-badge" style="font-size:11px;padding:2px 6px;display:inline-flex;align-items:center;gap:4px;">
        ${getIconSvg(b.icon, 'ui-icon--sm')} ${escapeHtml(b.label)} (${escapeHtml(b.desc)})
      </span>`).join('')}</div>`;
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
  });
}

const BUFF_ICON_MAP = {
  poison: '/assets/icons/status/中毒.webp',
  alc_poison: '/assets/icons/status/中毒.webp',
  burn: '/assets/icons/status/燃燒.webp',
  fire: '/assets/icons/status/燃燒.webp',
  bleed: '/assets/icons/status/流血.webp',
  fracture: '/assets/icons/status/骨折.webp',
  chill: '/assets/icons/status/寒冷.webp',
  freeze: '/assets/icons/status/寒冷.webp',
  corrosion: '/assets/icons/status/腐蝕.webp',
  alc_acid: '/assets/icons/status/腐蝕.webp',
  alchemy_corrosion: '/assets/icons/status/腐蝕.webp',
  corruption: '/assets/icons/status/腐蝕.webp',
  shield: '/assets/icons/status/護盾.webp',
  temp_hp: '/assets/icons/status/護盾.webp',
  sage_shield: '/assets/icons/status/護盾.webp',
  barrier: '/assets/icons/status/護盾.webp',
  guard: '/assets/icons/status/減傷.webp',
  treant_guard: '/assets/icons/status/減傷.webp',
  crouch: '/assets/icons/status/減傷.webp',
  vulnerable: '/assets/icons/status/易傷.webp',
  alchemy_vulnerable: '/assets/icons/status/易傷.webp',
  dodge: '/assets/icons/status/閃避加成.webp',
  dodge_bonus: '/assets/icons/status/閃避加成.webp',
  stealth: '/assets/icons/status/隱身.webp',
  stealth_stack: '/assets/icons/status/隱身.webp',
  hidden: '/assets/icons/status/隱身.webp',
  follow_up: '/assets/icons/status/隱身.webp',
  sleep: '/assets/icons/status/休眠.webp',
  exhausted: '/assets/icons/status/休眠.webp',
  downed: '/assets/icons/status/休眠.webp',
  frenzy: '/assets/icons/status/狂熱.webp',
  frenzy_buff: '/assets/icons/status/狂熱.webp',
  b_frenzy: '/assets/icons/status/狂熱.webp',
  galaxy: '/assets/icons/status/星系追擊.webp',
  astronomy: '/assets/icons/status/星系追擊.webp',
  boundary: '/assets/icons/status/邊界鎖血.webp',
  crit_lock: '/assets/icons/status/邊界鎖血.webp',
  surrender: '/assets/icons/status/邊界鎖血.webp',
  lock: '/assets/icons/status/邊界鎖血.webp',
  fate_blessing: '/assets/icons/status/命運加護.webp',
  fate_binding: '/assets/icons/status/命運加護.webp',
  blessing: '/assets/icons/status/命運加護.webp',
  fate_debt: '/assets/icons/status/命債.webp',
  sage_debt: '/assets/icons/status/命債.webp',
  talisman: '/assets/icons/status/符咒.webp',
  talismans: '/assets/icons/status/符咒.webp',
  equation: '/assets/icons/status/方程特性.webp',
  sage_equation: '/assets/icons/status/方程特性.webp',
  flaw_mark: '/assets/icons/status/破綻印記.webp',
  flaw: '/assets/icons/status/破綻印記.webp'
};

function getBuffIconUrl(status) {
  if (!status) return null;
  const id = String(status.id || '').toLowerCase();
  const icon = String(status.icon || '').toLowerCase();
  const label = String(status.label || '');

  if (BUFF_ICON_MAP[id]) return BUFF_ICON_MAP[id];
  if (BUFF_ICON_MAP[icon]) return BUFF_ICON_MAP[icon];

  if (label.includes('中毒')) return '/assets/icons/status/中毒.webp';
  if (label.includes('燃燒')) return '/assets/icons/status/燃燒.webp';
  if (label.includes('流血')) return '/assets/icons/status/流血.webp';
  if (label.includes('骨折')) return '/assets/icons/status/骨折.webp';
  if (label.includes('寒冷') || label.includes('冰')) return '/assets/icons/status/寒冷.webp';
  if (label.includes('腐蝕') || label.includes('強酸') || label.includes('腐化')) return '/assets/icons/status/腐蝕.webp';
  if (label.includes('護盾') || label.includes('TEMP HP') || label.includes('壁壘')) return '/assets/icons/status/護盾.webp';
  if (label.includes('減傷') || label.includes('堅守') || label.includes('GUARD') || label.includes('DR ')) return '/assets/icons/status/減傷.webp';
  if (label.includes('易傷') || label.includes('VULNERABLE')) return '/assets/icons/status/易傷.webp';
  if (label.includes('閃避') || label.includes('DODGE')) return '/assets/icons/status/閃避加成.webp';
  if (label.includes('隱身') || label.includes('匿蹤') || label.includes('追擊')) return '/assets/icons/status/隱身.webp';
  if (label.includes('休眠') || label.includes('沉睡') || label.includes('虛弱') || label.includes('倒下')) return '/assets/icons/status/休眠.webp';
  if (label.includes('狂熱') || label.includes('DMG +')) return '/assets/icons/status/狂熱.webp';
  if (label.includes('星系')) return '/assets/icons/status/星系追擊.webp';
  if (label.includes('鎖血') || label.includes('臣服') || label.includes('LOCK')) return '/assets/icons/status/邊界鎖血.webp';
  if (label.includes('命運加護') || label.includes('命運繫結')) return '/assets/icons/status/命運加護.webp';
  if (label.includes('命債') || label.includes('透支')) return '/assets/icons/status/命債.webp';
  if (label.includes('符')) return '/assets/icons/status/符咒.webp';
  if (label.includes('方程') || label.includes('假設') || label.includes('求解')) return '/assets/icons/status/方程特性.webp';
  if (label.includes('破綻') || label.includes('印記')) return '/assets/icons/status/破綻印記.webp';

  return '/assets/icons/status/方程特性.webp';
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
    const isLeaderPassive = s.isLeaderPassive || s.isLeaderSkill || (s.id && String(s.id).startsWith('leader_'));
    if (isLeaderPassive) {
      const leaderRole = s.leaderRole || s.role || roomState?.lockedLeaderRole;
      const svg = (leaderRole && CLASS_EXCLUSIVE_SVGS[leaderRole]) || CLASS_EXCLUSIVE_SVGS.warrior;
      const titleParts = [
        `【隊長技】${s.label || s.id}`,
        s.desc || s.value || ''
      ].filter(Boolean);
      const title = titleParts.join(' - ');
      return `<span class="teammate-buff-item teammate-buff-exclusive" title="${escapeHtml(title)}"><div class="exclusive-buff-icon-svg">${svg}</div></span>`;
    }
    const iconUrl = getBuffIconUrl(s);
    if (!iconUrl) return '';
    const titleParts = [
      s.label || s.id,
      s.value ? String(s.value) : '',
      s.turns ? `${s.turns}回合` : '',
      s.stacks ? `×${s.stacks}` : ''
    ].filter(Boolean);
    const title = titleParts.join(' ');
    return `<span class="teammate-buff-item" title="${escapeHtml(title)}"><img src="${iconUrl}" class="teammate-buff-icon" alt="${escapeHtml(s.label || 'status')}" loading="lazy"></span>`;
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
      const isLeaderPassive = s.isLeaderPassive || s.isLeaderSkill || (s.id && String(s.id).startsWith('leader_'));
      let iconTag = '';
      if (isLeaderPassive) {
        const leaderRole = s.leaderRole || s.role || roomState?.lockedLeaderRole;
        const svg = (leaderRole && CLASS_EXCLUSIVE_SVGS[leaderRole]) || CLASS_EXCLUSIVE_SVGS.warrior;
        iconTag = `<div class="exclusive-buff-icon-svg" style="width:14px;height:14px;display:inline-flex;vertical-align:middle;margin-right:4px;">${svg}</div>`;
      } else {
        const iconUrl = getBuffIconUrl(s);
        iconTag = iconUrl ? `<img src="${iconUrl}" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:4px;">` : '';
      }
      return `<span class="buff-badge" style="font-size:11px;padding:2px 6px;display:inline-flex;align-items:center;gap:4px;">
        ${iconTag}${escapeHtml(s.label || s.id)}${s.value ? ' ' + escapeHtml(String(s.value)) : ''}${s.desc ? ' (' + escapeHtml(s.desc) + ')' : ''}${s.turns ? ' (' + s.turns + 'R)' : ''}${s.stacks ? ' ×' + s.stacks : ''}
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

    // 德魯伊夥伴暫時玩家框（置於德魯伊右方，高度固定不變高，支援點擊括號或卡片展開詳細資訊）
    if (p.minions && p.minions.length > 0) {
      const minionCard = document.createElement('div');
      minionCard.className = 'teammate-card teammate-card-minion';
      minionCard.setAttribute('data-player-id', p.id + '_minions');
      minionCard.setAttribute('data-minion-owner-id', p.id);
      minionCard.setAttribute('title', '點擊展開夥伴詳細資訊');

      const totalHp = p.minions.reduce((sum, m) => sum + (m.hp || 0), 0);
      const totalMaxHp = p.minions.reduce((sum, m) => sum + (m.maxHp || 0), 0);
      const totalAtk = p.minions.reduce((sum, m) => sum + (m.atk || 0), 0);
      const totalHpPct = totalMaxHp > 0 ? Math.max(0, Math.min(100, Math.round((totalHp / totalMaxHp) * 100))) : 0;

      const minionPortraitsHtml = p.minions.map((m, idx) => {
        const imgSrc = m.avatar || (m.type === 'wolf' ? `/assets/characters/summons/druid/幼狼${m.minionIndex || (idx + 1)}.webp` : `/assets/characters/summons/druid/小樹精${m.minionIndex || (idx + 1)}.webp`);
        return `<img src="${imgSrc}" class="minion-bar-thumb" data-minion-id="${escapeHtml(m.id)}" alt="${escapeHtml(m.name)}" title="${escapeHtml(m.name)} #${idx + 1} (HP ${m.hp}/${m.maxHp})">`;
      }).join('');

      minionCard.innerHTML = `
        <div class="floating-text-container"></div>
        <div class="teammate-top">
          <span class="teammate-name-group">
            <span class="minion-icon-wrap" style="display:inline-flex; align-items:center; gap: 3px;">
              ${minionPortraitsHtml}
            </span>
            <span>${escapeHtml(p.name)}的夥伴</span>
            <button type="button" class="minion-count-badge" data-owner-id="${p.id}" title="點擊查看夥伴詳細資訊">(${p.minions.length}/3)</button>
          </span>
        </div>
        <div class="teammate-hp-bg">
          <div class="teammate-hp-fill" style="width: ${totalHpPct}%;"></div>
        </div>
        <div class="teammate-stats-sub">
          <span>HP ${totalHp}/${totalMaxHp}</span>
          <span>${getIconSvg('sword')} ${totalAtk} 攻</span>
        </div>
      `;

      minionCard.addEventListener('click', () => {
        showMinionDetailModal(p);
      });

      elements.battleTeammatesGrid.appendChild(minionCard);

      // 若目前詳細小視窗正好開啟且為該德魯伊，同步更新即時數值
      if (activeViewingMinionOwnerId === p.id && elements.minionDetailModal && !elements.minionDetailModal.classList.contains('hidden')) {
        showMinionDetailModal(p);
      }
    }
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
        if (avatarWrap && typeof syncPortraitStatusFx === 'function') {
          syncPortraitStatusFx(p, avatarWrap, { scale: 0.28 });
        }
      }
    });

    // 德魯伊夥伴 HP 與縮圖更新
    const druid = roomState.players.find(p => p.role === 'druid');
    if (druid && druid.minions) {
      const minionCard = document.querySelector(`.teammate-card-minion[data-minion-owner-id="${druid.id}"]`);
      if (minionCard) {
        const totalHp = druid.minions.reduce((sum, m) => sum + (m.hp || 0), 0);
        const totalMaxHp = druid.minions.reduce((sum, m) => sum + (m.maxHp || 0), 0);
        const totalHpPct = totalMaxHp > 0 ? Math.max(0, Math.min(100, Math.round((totalHp / totalMaxHp) * 100))) : 0;
        const minionFill = minionCard.querySelector('.teammate-hp-fill');
        if (minionFill) minionFill.style.width = `${totalHpPct}%`;
        const iconWrap = minionCard.querySelector('.minion-icon-wrap');
        if (iconWrap && druid.minions.length > 0) {
          iconWrap.innerHTML = druid.minions.map((m, idx) => {
            const imgSrc = m.avatar || (m.type === 'wolf' ? `/assets/characters/summons/druid/幼狼${m.minionIndex || (idx + 1)}.webp` : `/assets/characters/summons/druid/小樹精${m.minionIndex || (idx + 1)}.webp`);
            return `<img src="${imgSrc}" class="minion-bar-thumb" data-minion-id="${escapeHtml(m.id)}" alt="${escapeHtml(m.name)}" title="${escapeHtml(m.name)} #${idx + 1} (HP ${m.hp}/${m.maxHp})">`;
          }).join('');
        }
      }
    }
  }
}

