// ==========================================================================
// 地城深淵 (DUNGEON ABYSS) - Phase 5 & 5.1 Full-screen Combat Presentation (combat.js)
// Single Source of Truth for Cinematic Combat Actions (Player & Boss)
// ==========================================================================

const COMBAT_DEFAULT_TIMING = Object.freeze({
  overlayEnter: 300,
  actionEnter: 450,
  actorEnter: 480,
  settle: 380,
  actionSweepDelay: 100,
  anticipation: 250,
  impact: 220,
  hitImpactDelay: 180,
  damageDelay: 75,
  damageFloat: 750,
  hpBarDuration: 420,
  normalKnockDistance: 8,
  normalKnockDuration: 200,
  resultHold: 280,
  lethalHold: 350,
  deathDuration: 650,
  actionExit: 400,
  actionGap: 200,
  bossGap: 350,
  overlayExit: 300
});

// 建立或取得全螢幕戰鬥舞台容器
function getOrCreateCombatStage() {
  let stage = document.getElementById('presentationCombatStage');
  if (!stage) {
    const root = document.getElementById('presentationRoot') || document.body;
    stage = document.createElement('div');
    stage.id = 'presentationCombatStage';
    stage.className = 'presentation-combat-stage';
    root.appendChild(stage);
  }
  return stage;
}

// 啟用全螢幕戰鬥舞台 (Combat Resolution 開始)
async function enterCombatStage(context = {}) {
  if (typeof clearSamuraiPresentationState === "function") clearSamuraiPresentationState(context);
  const stage = getOrCreateCombatStage();
  stage.classList.remove('arena-intermission');
  if(typeof bindGladiatorArenaSignal==='function')bindGladiatorArenaSignal(context);
  const speed = context.speed || 1.0;
  const timing = (typeof PRESENTATION_CONFIG !== 'undefined' ? PRESENTATION_CONFIG.combat : COMBAT_DEFAULT_TIMING);

  stage.classList.remove('is-exiting');
  stage.classList.add('is-active');
  stage.style.setProperty('--combat-overlay-enter', `${Math.round(timing.overlayEnter / speed)}ms`);

  // 避免互動 UI 搶佔焦點
  const app = document.getElementById('app');
  if (app) app.inert = true;

  if (typeof presentationManager !== 'undefined' && presentationManager.setBlocking) {
    presentationManager.setBlocking(true);
  }

  preloadCombatFxAssets().catch(error => console.warn("Combat FX preload", error));
  await waitForPresentation(timing.overlayEnter, context.signal, speed);
}

// 退出全螢幕戰鬥舞台 (所有動作播放完畢)
async function exitCombatStage(context = {}) {
  if (typeof clearSamuraiPresentationState === "function") clearSamuraiPresentationState(context);
  const stage = document.getElementById('presentationCombatStage');
  const speed = context.speed || 1.0;
  const timing = (typeof PRESENTATION_CONFIG !== 'undefined' ? PRESENTATION_CONFIG.combat : COMBAT_DEFAULT_TIMING);

  if(typeof hasGladiatorArenaStage==='function'&&hasGladiatorArenaStage()&&!context.signal?.aborted){
    if(context.mode!=='lab')stage?.classList.add('arena-intermission');
    const app=document.getElementById('app');if(app)app.inert=false;
    if(typeof presentationManager!=='undefined')presentationManager.setBlocking(false);
    return;
  }
  if(typeof clearGladiatorPresentationState==='function')clearGladiatorPresentationState();

  if (stage) {
    stage.style.setProperty('--combat-overlay-exit', `${Math.round(timing.overlayExit / speed)}ms`);
    stage.classList.remove('is-active');
    stage.classList.add('is-exiting');
  }

  await waitForPresentation(timing.overlayExit, context.signal, speed);

  if (stage) {
    stage.replaceChildren();
    stage.classList.remove('is-exiting');
  }

  const app = document.getElementById('app');
  if (app) app.inert = false;

  if (typeof presentationManager !== 'undefined' && presentationManager.setBlocking) {
    presentationManager.setBlocking(false);
  }
}

// ==========================================================================
// 地城深淵 (DUNGEON ABYSS) - Phase 5.2 Combat Presentation Profiles & Mapping
// Centralized Skill & Role Profiles for Audio, Visual FX, and Timing
// ==========================================================================
const COMBAT_PRESENTATION_PROFILES = Object.freeze({
  dreamweaver:{fxType:'arcane_burst',attackSfx:'mage_basic',impactSfx:'magic_impact'},
  stargazer:{fxType:'arcane_burst',attackSfx:null,impactSfx:null},
  gladiator:{fxType:'sword_slash',attackSfx:'warrior_skill1',impactSfx:'physical_hit'},
  samurai:{fxType:'sword_slash',attackSfx:'warrior_basic',impactSfx:'physical_hit'},
  sage:{fxType:'sword_slash',attackSfx:'mage_basic',impactSfx:'physical_hit'},
  warrior: {
    attackSfx: 'warrior_xing',
    impactSfx: 'physical_hit',
    fxType: 'sword_slash',
    impactType: 'flash-physical',
    anticipationDelay: 220,
    impactDelay: 90
  },
  mage: {
    attackSfx: 'mage_burst',
    preSfx: 'magic_cast',
    impactSfx: 'magic_impact',
    fxType: 'arcane_burst',
    impactType: 'flash-magic',
    anticipationDelay: 260,
    impactDelay: 100
  },
  archer: {
    attackSfx: 'archer_twang',
    flightSfx: 'arrow_flight',
    impactSfx: 'arrow_impact',
    fxType: 'arrow_projectile',
    impactType: 'flash-physical',
    anticipationDelay: 200,
    impactDelay: 110
  },
  assassin: {
    attackSfx: 'assassin_dual',
    impactSfx: 'physical_hit',
    fxType: 'cross_slash',
    impactType: 'flash-physical',
    anticipationDelay: 200,
    impactDelay: 80
  },
  alchemist: {
    attackSfx: 'acid_throw',
    impactSfx: 'acid_splash',
    fxType: 'acid_splash',
    impactType: 'flash-magic',
    anticipationDelay: 240,
    impactDelay: 90
  },
  druid: {
    attackSfx: 'transform_treant',
    impactSfx: 'physical_hit',
    fxType: 'nature_strike',
    impactType: 'flash-physical',
    anticipationDelay: 220,
    impactDelay: 90
  },
  bard: {
    attackSfx: 'bard_tone',
    impactSfx: 'magic_impact',
    fxType: 'arcane_burst',
    impactType: 'flash-magic',
    anticipationDelay: 220,
    impactDelay: 90
  },
  boss: {
    attackSfx: 'boss_attack',
    impactSfx: 'heavy_impact',
    fxType: 'boss_claw',
    impactType: 'flash-boss',
    anticipationDelay: 260,
    impactDelay: 100
  }
});

const COMBAT_SKILL_PROFILES = Object.freeze({
  w_strike: { fxType: 'sword_slash', attackSfx: 'warrior_xing' },
  w_shield_slam: { fxType: 'sword_slash', attackSfx: 'heavy_impact' },
  m_blast: { fxType: 'arcane_burst', attackSfx: 'mage_burst', preSfx: 'magic_cast' },
  m_fireball: { fxType: 'arcane_burst', attackSfx: 'mage_burst', preSfx: 'magic_cast' },
  a_shot: { fxType: 'arrow_projectile', attackSfx: 'archer_twang', flightSfx: 'arrow_flight', impactSfx: 'arrow_impact' },
  s_stab: { fxType: 'cross_slash', attackSfx: 'assassin_dual' },
  alc_flask: { fxType: 'acid_splash', attackSfx: 'acid_throw', impactSfx: 'acid_splash' },
  alc_acid: { fxType: 'acid_splash', attackSfx: 'acid_throw', impactSfx: 'acid_splash' },
  alc_poison: { fxType: 'acid_splash', attackSfx: 'acid_throw', impactSfx: 'acid_splash' },
  dru_claw: { fxType: 'claw_slash', attackSfx: 'claw_slash' },
  boss_strike: { fxType: 'boss_claw', attackSfx: 'boss_attack', impactSfx: 'heavy_impact' },
  boss_ult: { fxType: 'boss_claw', attackSfx: 'boss_heavy_attack', impactSfx: 'heavy_impact' }
});

const COMBAT_FX_ASSETS = Object.freeze({
  werewolfClaw: '/assets/beast-claw-scratch.svg', bossClaw: '/assets/beast-claw-scratch.svg',
  swordSlash: null, vineStrike: null, impactSpark: null, acidSplash: null, slashTexture: null
});
const COMBAT_FORM_PROFILES = Object.freeze({
  werewolf: { fxType: 'claw_slash', attackSfx: 'claw_slash', impactSfx: 'heavy_impact', fxLead: 220 },
  treant: { fxType: 'vine_strike', attackSfx: 'vine_strike', impactSfx: 'heavy_impact', fxLead: 160 },
  tree: { fxType: 'vine_strike', attackSfx: 'vine_strike', impactSfx: 'heavy_impact', fxLead: 160 }
});
let combatFxPreload = null;
const failedCombatFxAssets = new Set();
function preloadCombatFxAssets() {
  if (!combatFxPreload) combatFxPreload = Promise.all([...new Set(Object.values(COMBAT_FX_ASSETS).filter(Boolean))].map(src => {
    const image = new Image(); image.src = src;
    return image.decode().catch(() => { failedCombatFxAssets.add(src); });
  }));
  return typeof preloadSamuraiFxAssets === "function" ? Promise.all([combatFxPreload, preloadSamuraiFxAssets()]) : combatFxPreload;
}
function getCombatProfile(step) {
  const isPlayer = step.type === 'player_action';
  const role = isPlayer ? (step.sourceRole || 'warrior') : 'boss';
  const base = COMBAT_PRESENTATION_PROFILES[role] || COMBAT_PRESENTATION_PROFILES.warrior;
  const form = role === 'druid' ? COMBAT_FORM_PROFILES[combatActorDescriptor(step).druidForm] || {} : {};
  const skill = COMBAT_SKILL_PROFILES[step.skillId || step.actionId] || {};
  return { sfxProfile: resolveCombatSfxProfile({ ...step, sourceRole: role }), fxLead: role === 'boss' ? 300 : role === 'assassin' ? 220 : role === 'alchemist' ? 0 : 130, ...base, ...form, ...skill };
}
// Shared transient visual engine; every renderer routes through this helper.
function createCombatFx({ type, target, direction = 'right', variant, speed = 1, reducedMotion = false }) {
  const fx = document.createElement('div');
  fx.className = 'presentation-combat-fx combat-fx-engine';
  fx.dataset.fx = type; fx.dataset.direction = direction;
  if (variant) fx.dataset.variant = variant;
  fx.style.setProperty('--fx-speed', speed);
  if (reducedMotion) fx.dataset.reducedMotion = 'true';
  if (type === 'claw_slash' || type === 'boss_claw') {
    const asset = type === 'boss_claw' ? COMBAT_FX_ASSETS.bossClaw : COMBAT_FX_ASSETS.werewolfClaw;
    fx.classList.add('combat-fx-claw');
    fx.style.setProperty('--claw-asset', `url("${asset}")`);
    if (!asset || failedCombatFxAssets.has(asset)) fx.dataset.fallback = 'true';
    for (let i = 0; i < 3; i++) {
      const slice = document.createElement('div'); slice.className = 'combat-claw-slice';
      slice.style.setProperty('--tear-index', i);
      slice.innerHTML = '<i class="combat-claw-tear"></i>';
      fx.appendChild(slice);
    }
  } else if (type === 'sword_slash' || type === 'cross_slash') {
    fx.classList.add('combat-fx-arc');
    fx.innerHTML = '<i class="combat-sword-arc"></i>' + (type === 'cross_slash' ? '<i class="combat-sword-arc is-second"></i>' : '');
  } else if (type === 'vine_strike' || type === 'nature_strike') {
    fx.classList.add('combat-fx-vine');
    fx.innerHTML = '<i class="combat-vine-whip"></i><i class="combat-vine-whip is-root"></i>';
  } else if (type === 'impact_spark' || type === 'arrow_projectile') {
    fx.classList.add('combat-fx-spark');
    fx.innerHTML = '<i></i><i></i><i></i>';
  } else if (type === 'acid_projectile') {
    fx.classList.add('combat-fx-bottle'); fx.innerHTML = '<i class="combat-bottle-neck"></i><i class="combat-bottle-glass"></i>';
  } else {
    fx.classList.add(type === 'acid_splash' ? 'presentation-combat-acid-fx' : 'presentation-combat-magic-fx');
  }
  target.appendChild(fx);
  fx.addEventListener('animationend', event => { if (event.target === fx) fx.remove(); });
  return fx;
}

// 播放單一戰鬥動作全螢幕演出 (Player Action 或 Boss Action)
async function playCombatActionPresentation(step, context = {}) {
  if (typeof isSamuraiAction === "function" && isSamuraiAction(step)) return playSamuraiPresentation(step, context);
  await sfxManager.preload();
  if ((context.signal || context.controller?.signal)?.aborted) return;
  if (!step) return;

  const controller = context.controller || new AbortController();
  const signal = context.signal || controller.signal;
  const speed = context.speed || 1.0;
  const timing = (typeof PRESENTATION_CONFIG !== 'undefined' ? PRESENTATION_CONFIG.combat : COMBAT_DEFAULT_TIMING);
  const wait = ms => waitForPresentation(ms, signal, speed);

  const emitTiming = (beat, extra = {}) => {
    if (typeof context.onTiming === 'function') context.onTiming(beat, { timestamp: Date.now(), ...extra });
  };

  const primary = step.results?.find(r => r.kind === 'damage' && r.targetId === 'monster');
  if (primary) step = { ...step, finalDamage: primary.finalDamage, targetHpBefore: primary.targetBefore.hp, targetHpAfter: primary.targetAfter.hp, targetMaxHp: primary.targetAfter.maxHp, hpSnapshot: primary.hpSnapshot };
  const outcome = step.outcome || { type: 'normal' };
  const missed = outcome.type === 'miss' || outcome.type === 'dodge';
  emitTiming('action_start', { step });

  const stage = getOrCreateCombatStage();
  stage.classList.add('is-active');

  // 設定動態時間變數
  stage.style.setProperty('--combat-action-enter', `${Math.round(timing.actionEnter / speed)}ms`);
  stage.style.setProperty('--combat-actor-enter', `${Math.round(timing.actorEnter / speed)}ms`);
  stage.style.setProperty('--combat-action-exit', `${Math.round(timing.actionExit / speed)}ms`);

  const isPlayer = step.type === 'player_action';
  const isMagic = step.dmgType === '【魔法】' || step.damageType === 'magic' || (step.tags && step.tags.some(t => (t.label || t).includes('魔法')));
  const profile = getCombatProfile(step);
  const audio = createSfxPresentationScope({ ...context, signal });
  const playSound = (key, options) => audio.play(key, options);

  // 1. 建立畫布與圖層節點
  const canvas = document.createElement('div');
  canvas.className = 'presentation-combat-canvas';
  if (context.reducedMotion) canvas.setAttribute('data-reduced-motion', 'true');
  stage.appendChild(canvas);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (canvas && canvas.parentNode) canvas.remove();
  };
  signal.addEventListener('abort', cleanup, { once: true });

  try {
  if (step.hiddenBeforeAction || step.consumedStacks > 0) {
    canvas.classList.add('is-shadow-emerging');
    const cue = document.createElement('div'); cue.className = 'presentation-shadow-cue';
    cue.textContent = step.consumedStacks > 0 ? '匿蹤 ×' + step.consumedStacks + ' → 0' : '解除隱身';
    canvas.appendChild(cue);
    playSound(step.consumedStacks > 0 ? 'shadow_absorb' : 'air_pass');
    if (step.consumedStacks > 0) {
      for (let i = 0; i < Math.min(step.consumedStacks, 12); i++) {
        const particle = document.createElement('i'); particle.className = 'presentation-shadow-energy';
        particle.style.setProperty('--shadow-index', i); canvas.appendChild(particle);
      }
    }
    const before = structuredClone(step.hpSnapshotBefore);
    const actor = before?.players?.find(p => p.id === step.sourceId);
    if (actor) {
      actor.isHiddenThisRound = false; actor.stealthBrokenThisRound = true;
      actor.statuses = (actor.statuses || []).filter(s => s.id !== 'hidden' && s.id !== 'follow_up' && !(step.actionId === 's_smoke' && s.id === 'stealth_stack'));
      if (step.actionId === 's_smoke') actor.stealthStacks = 0;
      if (typeof applyHpSnapshot === 'function') applyHpSnapshot(before);
    }
    await wait(step.consumedStacks > 0 ? 350 : 200);
  }
  // 2. 解析 Actor 肖像與名稱 (嚴格使用 Class Portrait 或 Boss Image，禁止 Discord/Generic)
  let actorPortraitHtml = '';
  let actorName = '';
  let actorEntity = null;
  let targetPortraitHtml = '';
  let targetName = '';
  let targetEntity = null;

  let targetHpBefore = 100;
  let targetHpAfter = 100;
  let targetMaxHp = 100;

  if (isPlayer) {
    // 玩家攻擊 Boss
    const roleKey = step.sourceRole || (typeof roomState !== 'undefined' && (roomState?.players || []).find(p => p.id === step.sourceId)?.role) || 'warrior';
    actorEntity = combatActorDescriptor(step);
    actorPortraitHtml = getClassPortraitHtml(actorEntity, 'presentation-combat-portrait-img');
    actorName = getClassDisplayName(roleKey);

    const mAvatar = step.monsterAvatar || (typeof roomState !== 'undefined' && (roomState?.currentMonster?.avatar || roomState?.monster?.avatar)) || '/BOSS/Ancient Guardian Golem.webp';
    const mName = step.monsterName || (typeof roomState !== 'undefined' && (roomState?.currentMonster?.name || roomState?.monster?.name)) || '首領魔物';
    targetEntity = (typeof roomState !== 'undefined' && (roomState?.currentMonster || roomState?.monster)) || step.hpSnapshot?.monster || { name: mName, avatar: mAvatar };
    targetPortraitHtml = battlePortraitHtml({ entityType: 'monster', avatar: mAvatar, name: mName }, 'presentation-combat-portrait-img');
    targetName = mName;

    targetMaxHp = step.targetMaxHp !== undefined ? step.targetMaxHp : ((typeof roomState !== 'undefined' && roomState?.currentMonster?.maxHp) || step.hpSnapshot?.monster?.maxHp || 120);
    targetHpBefore = step.targetHpBefore !== undefined ? step.targetHpBefore : (step.hpSnapshot?.monster?.hp ?? targetMaxHp);
    targetHpAfter = step.targetHpAfter !== undefined ? step.targetHpAfter : (step.hpSnapshot?.monster?.hp ?? targetHpBefore);
  } else {
    // Boss 攻擊玩家
    const mAvatar = step.monsterAvatar || (typeof roomState !== 'undefined' && (roomState?.currentMonster?.avatar || roomState?.monster?.avatar)) || '/BOSS/Ancient Guardian Golem.webp';
    const mName = step.monsterName || (typeof roomState !== 'undefined' && (roomState?.currentMonster?.name || roomState?.monster?.name)) || '首領魔物';
    actorEntity = (typeof roomState !== 'undefined' && (roomState?.currentMonster || roomState?.monster)) || step.hpSnapshot?.monster || { name: mName, avatar: mAvatar };
    actorPortraitHtml = battlePortraitHtml({ entityType: 'monster', avatar: mAvatar, name: mName }, 'presentation-combat-portrait-img');
    actorName = mName;

    let targetRoleKey = 'warrior';
    if (step.targetRole) {
      targetRoleKey = step.targetRole;
    } else if (step.targetId && step.targetId !== 'all' && typeof roomState !== 'undefined') {
      const targetObj = (roomState?.players || []).find(p => p.id === step.targetId);
      if (targetObj?.role) targetRoleKey = targetObj.role;
    }
    const descriptor = step.hpSnapshotBefore?.players?.find(p => p.id === step.targetId) || { role: targetRoleKey };
    targetEntity = descriptor;
    targetPortraitHtml = getClassPortraitHtml(descriptor, 'presentation-combat-portrait-img');
    targetName = getClassDisplayName(targetRoleKey);

    const targetPlayerObj = (typeof roomState !== 'undefined' && (roomState?.players || []).find(p => p.id === step.targetId));
    targetMaxHp = step.targetMaxHp !== undefined ? step.targetMaxHp : (targetPlayerObj?.maxHp || 120);
    targetHpBefore = step.targetHpBefore !== undefined ? step.targetHpBefore : (targetPlayerObj?.hp ?? targetMaxHp);
    targetHpAfter = step.targetHpAfter !== undefined ? step.targetHpAfter : (targetPlayerObj?.hp ?? targetHpBefore);
  }

  // 傷害數值來源之唯一定義 (Combat Resolution 產出的 explicit finalDamage)
  const finalDamage = step.finalDamage !== undefined 
    ? step.finalDamage 
    : (step.damage !== undefined 
      ? step.damage 
      : (step.visualEvents && step.visualEvents[0]?.value) || (step.hits && step.hits[0]?.value) || 0);

  // DEV ASSERT / Validation
  const hpDelta = targetHpBefore - targetHpAfter;
  if (step.finalDamage !== undefined && hpDelta > 0 && finalDamage !== hpDelta && !step.tempHpDamage && !step.shieldDamage && targetHpAfter > 0) {
    console.warn(`[CombatPresentation DEV ASSERT] Damage mismatch: finalDamage=${finalDamage} vs hpDelta=${hpDelta}`);
  }

  const isLethal = !missed && (step.isLethal || targetHpAfter <= 0);

  // 3. 組合技能意圖文字 (WHO + ACTION，純文字，無額外 metadata)
  const skillTitle = step.skillName || step.name || (isPlayer ? '普通攻擊' : (step.isUlt ? (step.ultName || '必殺技') : '撕裂猛擊'));
  const verb = isMagic ? '施放' : (isPlayer ? '使出' : '發動');
  const intentText = `${actorName}${verb}「${skillTitle}」`;

  // 4. 建立 DOM 元素結構 (嚴格 0px 圓角、分離式 Position/Hit Wrapper 架構)
  // A. 行動長條 (Diagonal Strip - 100% Solid Opaque, Borderless, 0px Radius)
  const stripWrap = document.createElement('div');
  stripWrap.className = `presentation-combat-strip-wrap ${isPlayer ? 'is-player enter-left' : 'is-boss enter-right'}`;
  stripWrap.innerHTML = `
    <div class="presentation-combat-strip-skew"></div>
    <div class="presentation-combat-strip-inner">
      <div class="presentation-combat-intent enter-intent" id="combatIntentBox">
        <h2 class="presentation-combat-intent-title">${escapeHtml(intentText)}</h2>
      </div>
    </div>
  `;
  canvas.appendChild(stripWrap);

  // B. 來源肖像 (Actor Portrait: Outer Position + Inner Visual)
  const actorPositionWrap = document.createElement('div');
  actorPositionWrap.className = `presentation-combat-portrait-wrap presentation-combat-actor-position ${isPlayer ? 'presentation-combat-actor-left enter-actor' : 'presentation-combat-actor-right enter-actor'}`;
  actorPositionWrap.innerHTML = `
    <div class="presentation-combat-actor-visual" id="combatActorVisual">
      <div class="presentation-combat-portrait-box">
        ${actorPortraitHtml}
      </div>
      <div class="presentation-combat-portrait-name">${escapeHtml(actorName)}</div>
    </div>
  `;
  canvas.appendChild(actorPositionWrap);

  // C. 目標肖像與簡易生命條 (Target Portrait: Outer Position + Inner Hit Wrapper)
  const targetPositionWrap = document.createElement('div');
  targetPositionWrap.className = `presentation-combat-portrait-wrap presentation-combat-target-position ${isPlayer ? 'presentation-combat-target-right enter-target' : 'presentation-combat-target-left enter-target'}`;
  
  const initialHpPct = Math.round(Math.max(0, Math.min(100, (targetHpBefore / targetMaxHp) * 100)));
  
  targetPositionWrap.innerHTML = `
    <div class="presentation-combat-target-hit" id="combatTargetHit">
      <div class="presentation-combat-portrait-box" id="combatTargetBox">
        ${targetPortraitHtml}
        <div class="presentation-combat-impact-overlay" id="combatImpactOverlay"></div>
      </div>
      <div class="presentation-combat-portrait-name">${escapeHtml(targetName)}</div>
      <div class="presentation-combat-target-hp-wrap" id="combatTargetHpWrap">
        <div class="presentation-combat-target-hp-meta">
          <span class="presentation-combat-target-hp-name">${escapeHtml(targetName)}</span>
          <span class="presentation-combat-target-hp-val" id="combatTargetHpVal">${Math.max(0, targetHpBefore)} / ${targetMaxHp}</span>
        </div>
        <div class="presentation-combat-target-hp-track">
          <div class="presentation-combat-target-hp-ghost" id="combatTargetHpGhost" style="width: ${initialHpPct}%;"></div>
          <div class="presentation-combat-target-hp-fill" id="combatTargetHpFill" style="width: ${initialHpPct}%;"></div>
        </div>
      </div>
    </div>
  `;
  canvas.appendChild(targetPositionWrap);

  // Phase 7.2: Sync persistent portrait status FX on large combat portraits (50~70% scale)
  const actorBoxEl = actorPositionWrap.querySelector('.presentation-combat-portrait-box');
  if (actorBoxEl && actorEntity && typeof syncPortraitStatusFx === 'function') {
    syncPortraitStatusFx(actorEntity, actorBoxEl, { scale: 1.2 });
  }
  const targetBoxEl = targetPositionWrap.querySelector('.presentation-combat-portrait-box');
  if (targetBoxEl && targetEntity && typeof syncPortraitStatusFx === 'function') {
    syncPortraitStatusFx(targetEntity, targetBoxEl, { scale: 1.2 });
  }

  // --- STEP 1: 面板快速切入音效與交錯進場 (Shoo Sweep SFX & Interleaved Entry) ---
  playSound('panel_sweep');
  emitTiming('panel_sweep');
  emitTiming('entry_start');

  // 等待交錯動畫到位 (Strip 0~420ms, Actor 70~500ms, Target 130~520ms, Intent 160~540ms)
  await wait(Math.max(timing.actionEnter || 420, (timing.actorEnter || 430) + (timing.portraitEntryDelay || 70)));
  
  // 定格定心呼吸點 (Settle)
  emitTiming('settle_start');
  await wait(timing.settle || 200);

  // --- STEP 2: 角色攻擊起手與專屬 Attack SFX / FX (Warrior Xing / Mage Bomb / Archer Twang) ---
  emitTiming('anticipation_start');
  if (outcome.type === 'misfire') actorPositionWrap.classList.add('is-unstable');
  if (outcome.type === 'imbalance') actorPositionWrap.classList.add('is-unbalanced');
  if (outcome.type === 'critical') canvas.classList.add('is-critical');
  if (profile.sfxProfile.key) {
    playSound(profile.sfxProfile.bottleSequence ? 'bottle_throw' : profile.sfxProfile.key);
    emitTiming('skill_audio');
    if (profile.sfxProfile.doubleSlash) {
      await waitForPresentation(90, signal); playSound(profile.sfxProfile.key, { volume: .85 });
      emitTiming('second_slash_audio');
    }
  } else {
    if (profile.preSfx) playSound(profile.preSfx);
    // Human Druid retains the original procedural voice, not a transform MP3.
    if (profile.attackSfx) playSound(profile.attackSfx, { synthOnly: true });
  }

  // 弓手飛行箭矢 Projectile (從 Actor 側貫穿至 Target 側)
  if (profile.fxType === 'arrow_projectile') {
    if (profile.flightSfx && !profile.sfxProfile.key) playSound(profile.flightSfx);
    const arrow = document.createElement('div');
    arrow.dataset.ammo = step.ammoBefore?.[0] || '';
    arrow.className = `presentation-combat-arrow-projectile ${isPlayer ? 'fly-right' : 'fly-left'} ${missed ? 'is-miss' : ''}`;
    arrow.innerHTML = `
      <div class="presentation-combat-arrow-shaft"></div>
      <div class="presentation-combat-arrow-head"></div>
    `;
    canvas.appendChild(arrow);

  }

  if (profile.fxType === 'acid_splash') {
    createCombatFx({ type: 'acid_projectile', target: canvas, speed, reducedMotion: context.reducedMotion });
  }

  const fxLead = ['claw_slash', 'boss_claw'].includes(profile.fxType) ? 0 : profile.fxLead;
  await wait(Math.max(0, (timing.anticipation || 250) - fxLead));
  const attackTarget = targetPositionWrap.querySelector('#combatTargetBox');
  if (!missed && profile.fxType !== 'arrow_projectile') {
    createCombatFx({ type: profile.fxType, target: attackTarget, direction: isPlayer ? 'right' : 'left', speed, reducedMotion: context.reducedMotion });
    emitTiming('attack_fx');
  }
  if (fxLead > 0) await wait(fxLead);

  // --- STEP 3: 目標受擊反應與專屬 Hit FX (Target Portrait Impact, Knock, Flash) ---
  emitTiming('impact_start');
  const targetHitEl = targetPositionWrap.querySelector('#combatTargetHit');
  const targetBox = targetPositionWrap.querySelector('#combatTargetBox');
  const impactOverlay = targetPositionWrap.querySelector('#combatImpactOverlay');

  if (missed) {
    playSound('air_pass');
    if (outcome.type === 'dodge') targetHitEl?.classList.add(outcome.stealth ? 'is-stealth-miss' : 'is-evading');
    const miss = document.createElement('div');
    miss.className = 'presentation-combat-damage-num is-miss';
    miss.textContent = 'MISS';
    targetBox?.appendChild(miss);
    emitTiming('miss');
    await wait(timing.damageDelay || 75);
  } else {
  // 播放 Impact 命中音效 (音量最高潮)
  if (!profile.sfxProfile.suppressImpact) playSound(profile.sfxProfile.impactKey || profile.impactSfx || (isMagic ? 'magic_impact' : 'physical_hit'), { volume: profile.sfxProfile.impactVolume });
  if(profile.sfxProfile.bottleSequence){await wait(80);playSound('alchemy_skill1');emitTiming('chemical_audio');}

  // 內層 Hit Wrapper 觸發方向性撞擊 (完全不受外層 translateY(-50%) 衝突)
  if (targetHitEl) {
    targetHitEl.classList.remove('is-hit', 'is-hit-right', 'is-hit-left');
    void targetHitEl.offsetWidth; // 強制重排觸發動畫
    targetHitEl.classList.add(isPlayer ? 'is-hit-right' : 'is-hit-left');
  }
  targetPositionWrap.classList.add('is-hit');

  // 受擊閃光
  if (impactOverlay) {
    impactOverlay.className = `presentation-combat-impact-overlay ${profile.impactType || (isMagic ? 'flash-magic' : 'flash-physical')}`;
  }

  if (targetBox && ['sword_slash', 'arrow_projectile'].includes(profile.fxType)) {
    createCombatFx({ type: 'impact_spark', target: targetBox, speed, reducedMotion: context.reducedMotion });
  }
  if (targetBox && typeof triggerPortraitStatusEvent === 'function') {
    triggerPortraitStatusEvent(targetBox, 'vulnerable', 'hit');
    triggerPortraitStatusEvent(targetBox, 'shield', 'block');
    triggerPortraitStatusEvent(targetBox, 'guard', 'hit');
  }

  // --- STEP 4: 傷害數字與生命條動態扣除 (Floating Damage & HP Bar Animation) ---
  await wait(timing.damageDelay || 75);
  emitTiming('damage_float', { damage: finalDamage });

  const dmgEl = document.createElement('div');
  dmgEl.className = `presentation-combat-damage-num ${isMagic ? 'is-magic' : (isPlayer ? 'is-physical' : 'is-boss')}`;
  dmgEl.textContent = finalDamage > 0 ? `-${finalDamage}` : 'BLOCK';
  if (targetBox) {
    targetBox.appendChild(dmgEl);

  }

  // HP Bar 動態更新至新血量
  const hpFill = targetPositionWrap.querySelector('#combatTargetHpFill');
  const hpGhost = targetPositionWrap.querySelector('#combatTargetHpGhost');
  const hpVal = targetPositionWrap.querySelector('#combatTargetHpVal');
  const afterHpPct = Math.round(Math.max(0, Math.min(100, (targetHpAfter / targetMaxHp) * 100)));

  if (hpFill) hpFill.style.width = `${afterHpPct}%`;
  if (hpGhost) hpGhost.style.width = `${afterHpPct}%`;
  if (hpVal) hpVal.textContent = `${Math.max(0, targetHpAfter)} / ${targetMaxHp}`;

  // 延遲更新全域 HP Snapshot (與傷害跳動分離)
  await wait(timing.damageDelay || 75);
  emitTiming('hp_update');
  if (step.hpSnapshot && typeof applyHpSnapshot === 'function') {
    applyHpSnapshot(step.hpSnapshot);
  }

  }
  if (outcome.type !== 'normal') {
    const indicator = document.createElement('div');
    indicator.className = 'presentation-combat-outcome';
    indicator.textContent = [outcome.label, outcome.secondary].filter(Boolean).join(' · ');
    canvas.appendChild(indicator);
    emitTiming('outcome', { outcome: outcome.type });
  }
  if (typeof context.onPrimaryResolved === 'function') {
    await context.onPrimaryResolved({ canvas, actorPositionWrap, targetPositionWrap, wait, audioScope: audio });
  }

  // --- STEP 4.5: 致命一擊與首領沉重倒下演出 (Boss Death Foundation) ---
  if (isLethal && isPlayer) {
    emitTiming('boss_death_start');
    await wait(timing.lethalHold || 350);
    if (targetHitEl) targetHitEl.classList.add('is-dead-sink');
    targetPositionWrap.classList.add('is-dead-sink');
    await wait(timing.deathDuration || 650);
    emitTiming('boss_death_complete');
  }

  // --- STEP 5: 結算停留 (Hold After Impact) ---
  await wait(timing.resultHold || 280);
  await audio.hold();
  emitTiming('hold_complete');

  // --- STEP 6: 動作交錯退場 (Interleaved Action Exit) ---
  emitTiming('exit_start');
  const intentBox = stripWrap.querySelector('#combatIntentBox');
  if (isPlayer) {
    stripWrap.className = 'presentation-combat-strip-wrap is-player exit-right';
    if (intentBox) intentBox.className = 'presentation-combat-intent exit-intent-right';
    actorPositionWrap.className = 'presentation-combat-portrait-wrap presentation-combat-actor-position presentation-combat-actor-left exit-right';
    targetPositionWrap.className = 'presentation-combat-portrait-wrap presentation-combat-target-position presentation-combat-target-right exit-fade';
  } else {
    stripWrap.className = 'presentation-combat-strip-wrap is-boss exit-left';
    if (intentBox) intentBox.className = 'presentation-combat-intent exit-intent-left';
    actorPositionWrap.className = 'presentation-combat-portrait-wrap presentation-combat-actor-position presentation-combat-actor-right exit-left';
    targetPositionWrap.className = 'presentation-combat-portrait-wrap presentation-combat-target-position presentation-combat-target-left exit-fade';
  }

  await wait((timing.actionExit || 400) + (timing.exitStagger || 80));
  emitTiming('action_complete');

  // 清理畫布節點
  } finally {
    signal.removeEventListener('abort', cleanup);
    cleanup();
  }

  if (typeof context.onComplete === 'function') {
    context.onComplete({ completed: true, step });
  }
}

// 全域導出供遊戲與 Lab 共用
if (typeof window !== 'undefined') {
  window.getOrCreateCombatStage = getOrCreateCombatStage;
  window.enterCombatStage = enterCombatStage;
  window.exitCombatStage = exitCombatStage;
  window.playCombatActionPresentation = playCombatActionPresentation;
}
if (typeof globalThis !== 'undefined') {
  globalThis.getOrCreateCombatStage = getOrCreateCombatStage;
  globalThis.enterCombatStage = enterCombatStage;
  globalThis.exitCombatStage = exitCombatStage;
  globalThis.playCombatActionPresentation = playCombatActionPresentation;
}
