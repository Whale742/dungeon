// ==========================================================================
// PORTRAIT STATUS FX CONTROLLER (Phase 7.2 - Persistent Status FX)
// Server authoritative status -> visual layers reconciliation controller
// ==========================================================================

const FOUR_POINT_STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z"/></svg>';
const BROKEN_STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2 L13.5 7 L17 4 L14.5 9.5 L20 10 L15 13 L19 18 L13 15 L12 22 L10 16 L5 20 L8 14 L3 13 L8.5 10 L5 6 L10 8 Z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

// 1. Status FX Profiles
const STATUS_FX_PROFILES = Object.freeze({
  dream: {layer:'back',className:'status-fx--dream',portraitClass:'has-dream',render:()=>'<svg viewBox="0 0 100 100"><path d="M5 35Q30 5 50 50Q70 95 95 65M5 65Q30 95 50 50Q70 5 95 35M12 20 88 80M12 80 88 20"/></svg>'},
  astronomy: {layer:'back',className:'status-fx--astronomy',portraitClass:'has-astronomy',render:()=>'<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/><path d="M20 30 70 15 85 65 35 85 20 30M70 15 35 85"/></svg>'},
  soul: {layer:'front',className:'status-fx--soul',portraitClass:'has-soul',render:()=>'<svg viewBox="0 0 100 100"><path d="M10 95 35 70 25 45M90 95 65 70 75 45M50 80V40"/></svg>'},
  blood: {layer:'surface',className:'status-fx--blood',portraitClass:'has-blood',render:()=>'<svg viewBox="0 0 100 100"><path d="M10 85V15h15M90 85V15H75M5 95h90"/></svg>'},
  equation: {layer:'back',className:'status-fx--equation',portraitClass:'has-equation',render:()=>'<svg viewBox="0 0 100 100"><path d="M5 25h90M5 50h90M5 75h90M25 5v90M50 5v90M75 5v90M10 90 90 10"/></svg>'},
  downed: {
    layer: 'terminal',
    className: 'status-fx--downed',
    portraitClass: 'is-downed',
    render: () => ''
  },
  exhausted: {
    layer: 'surface',
    className: 'status-fx--exhausted',
    portraitClass: 'has-exhausted',
    render: () => '<div class="status-fx--exhausted-drain"></div>'
  },
  frenzy: {
    layer: 'back',
    className: 'status-fx--frenzy',
    portraitClass: 'has-frenzy',
    render: (scale = 1) => {
      const count = scale < 0.5 ? 3 : 4;
      let starsHtml = '';
      for (let i = 0; i < count; i++) {
        starsHtml += `<span class="status-fx-star" data-index="${i}">${FOUR_POINT_STAR_SVG}</span>`;
      }
      return `<div class="status-fx--frenzy-ring"><i></i><i></i></div>${starsHtml}`;
    }
  },
  poison: {
    layer: 'surface',
    className: 'status-fx--poison',
    portraitClass: 'has-poison',
    render: (scale = 1) => {
      const count = scale < 0.5 ? 3 : 4;
      let bubblesHtml = '';
      for (let i = 0; i < count; i++) {
        bubblesHtml += `<span class="status-fx-bubble" data-index="${i}"></span>`;
      }
      return `<div class="status-fx--poison-fog"></div>${bubblesHtml}`;
    }
  },
  bleed: {
    layer: 'surface',
    className: 'status-fx--bleed',
    portraitClass: 'has-bleed',
    render: () => '<span class="status-fx--bleed-wound"></span><span class="status-fx--bleed-wound"></span>'
  },
  shield: {
    layer: 'back',
    className: 'status-fx--shield',
    portraitClass: 'has-shield',
    render: () => '<svg class="status-fx-shield-contour" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M20 3H80L97 20V65L80 87L50 98L20 87L3 65V20Z"/><path class="status-fx-shield-crack" d="M48 3L55 30L42 45L61 62L50 98M42 45L3 53M61 62L97 40"/></svg><span class="status-fx-shield-shard"></span><span class="status-fx-shield-shard"></span><span class="status-fx-shield-shard"></span>'
  },
  guard: {
    layer: 'surface',
    className: 'status-fx--guard',
    portraitClass: 'has-guard',
    render: () => ''
  },
  vulnerable: {
    layer: 'front',
    className: 'status-fx--vulnerable',
    portraitClass: 'has-vulnerable',
    render: () => '<span class="status-fx--vulnerable-corner tl"></span><span class="status-fx--vulnerable-corner tr"></span><span class="status-fx--vulnerable-corner bl"></span><span class="status-fx--vulnerable-corner br"></span>'
  },
  dodge: {
    layer: 'surface',
    className: 'status-fx--dodge',
    portraitClass: 'has-dodge',
    render: () => '<div class="status-fx--dodge-ghost"></div>'
  },
  hidden: {
    layer: 'surface',
    className: 'status-fx--hidden',
    portraitClass: 'has-hidden',
    render: () => '<div class="status-fx--hidden-smoke"></div><div class="status-fx--hidden-ghost"></div>'
  },
  sleep: {
    layer: 'front',
    className: 'status-fx--sleep',
    portraitClass: 'has-sleep',
    render: (_, entity) => {
      const isTreant = entity?.druidForm === 'tree' || entity?.druidForm === 'treant';
      return `<span class="status-fx-sleep-z">Z</span><span class="status-fx-sleep-z">Z</span><span class="status-fx-sleep-z">Z</span>${isTreant ? '<div class="status-fx--sleep-treant-moss"></div>' : ''}`;
    }
  },
  corruption: {
    layer: 'surface',
    className: 'status-fx--corruption',
    portraitClass: 'has-corruption',
    render: () => '<div class="status-fx--corruption-edge"></div><i class="status-fx-corruption-tendril"></i><i class="status-fx-corruption-tendril"></i><i class="status-fx-corruption-tendril"></i>'
  },
  crit_lock: {
    layer: 'front',
    className: 'status-fx--crit-lock',
    portraitClass: 'has-crit-lock',
    render: () => BROKEN_STAR_SVG
  },
  generic_buff: {
    layer: 'back',
    className: 'status-fx--generic-buff',
    portraitClass: 'has-buff',
    render: () => ''
  },
  generic_debuff: {
    layer: 'surface',
    className: 'status-fx--generic-debuff',
    portraitClass: 'has-debuff',
    render: () => ''
  }
});

// 2. Status ID Adapter (Normalizes server IDs & state fields to Visual Status Profile IDs)
function mapStatusToFxProfile(statusId, entity = {}) {
  if(typeof statusId!=='string')return null;
  switch (statusId) {
    case 'dream_butterfly':case 'mirror':case 'dissociate':case 'nightmare_weak':case 'frenzy_backfire':case 'false_history':return 'dream';
    case 'galaxy':case 'boundary':case 'overload':return 'astronomy';
    case 'soul':case 'kyoutou':return 'soul';
    case 'rage':case 'blood_stacks':case 'blood_heal':case 'arena_challenge':return 'blood';
    case 'sage_equation':case 'sage_exposed':case 'sage_square':return 'equation';
    case 'warrior_resolve':return 'guard';
    case 'downed':
      return 'downed';
    case 'exhausted':
      return 'exhausted';
    case 'frenzy':
    case 'frenzy_buff':
      return 'frenzy';
    case 'poison':
      return 'poison';
    case 'bleed':
      return 'bleed';
    case 'alchemy_corrosion':
      return 'generic_debuff';
    case 'shield':
    case 'temp_hp':
      return 'shield';
    case 'guard':
    case 'alchemy_guard':
    case 'treant_guard':
    case 'crouch':
      return 'guard';
    case 'vulnerable':
    case 'alchemy_vulnerable':
    case 'weakened':
      return 'vulnerable';
    case 'dodge':
    case 'dodge_bonus':
      return 'dodge';
    case 'stealth':
    case 'hidden':
      return 'hidden';
    case 'sleep':
      return 'sleep';
    case 'corruption':
      return 'corruption';
    case 'crit_lock':
    case 'cannot_crit':
    case 'cannotCrit':
    case 'surrender':
      return 'crit_lock';
    case 'attack_down':
      return 'vulnerable';
    case 'crossbow_ammo':
    case 'wolf':
    case 'follow_up':
    case 'stealth_stack':
      // Resource stacks or forms that have their own representation, no persistent full-portrait loop FX
      return null;
    default:
      if (statusId.includes('debuff')) return 'generic_debuff';
      if (statusId.includes('buff')) return 'generic_buff';
      return null;
  }
}

// Extract distinct active visual profile IDs for an entity
function getEntityActiveFxProfiles(entity = {}) {
  const activeProfiles = new Set();
  if (!entity) return activeProfiles;

  // Direct statuses array
  const statuses = entity.statuses || [];
  for (const s of statuses) {
    const sId = typeof s === 'string' ? s : s.id;
    const profile = mapStatusToFxProfile(sId, entity);
    if (profile) activeProfiles.add(profile);
  }

  // Authoritative state fields fallback
  if (entity.hp !== undefined && entity.hp <= 0) {
    activeProfiles.add('downed');
  }
  if (entity.stunnedNextTurn || entity.nextTurnStunFlag) {
    activeProfiles.add('exhausted');
  }
  if (entity.poisonTurns > 0) {
    activeProfiles.add('poison');
  }
  if (entity.bleedTurns > 0) {
    activeProfiles.add('bleed');
  }
  if (entity.tempHp > 0) {
    activeProfiles.add('shield');
  }
  if (entity.warriorVulnerableTurns || entity.warriorVulnerableNextTurn || entity.isWeakened) {
    activeProfiles.add('vulnerable');
  }
  if (entity.archerNextDodgeBonus > 0) {
    activeProfiles.add('dodge');
  }
  if (entity.hp > 0 && entity.isHiddenThisRound && !entity.stealthBrokenThisRound) {
    activeProfiles.add('hidden');
  }
  if (entity.druidForm === 'tree') {
    activeProfiles.add('sleep');
  }
  if (entity.druidForm === 'treant' || entity.druidForm === 'tree' || entity.isCrouchedThisRound) {
    activeProfiles.add('guard');
  }
  if (entity.corruption > 0) {
    activeProfiles.add('corruption');
  }
  if (entity.cannotCrit) {
    activeProfiles.add('crit_lock');
  }

  return activeProfiles;
}

// 3. Ensure Portrait Root has the three required FX sub-layers
function ensurePortraitLayers(portraitRoot) {
  if (!portraitRoot) return null;
  portraitRoot.classList.add('portrait-root');

  let backLayer = portraitRoot.querySelector('.status-fx-back');
  if (!backLayer) {
    backLayer = document.createElement('div');
    backLayer.className = 'status-fx-layer status-fx-back';
    portraitRoot.prepend(backLayer);
  }

  let surfaceLayer = portraitRoot.querySelector('.status-fx-surface');
  if (!surfaceLayer) {
    surfaceLayer = document.createElement('div');
    surfaceLayer.className = 'status-fx-layer status-fx-surface';
    portraitRoot.appendChild(surfaceLayer);
  }

  let frontLayer = portraitRoot.querySelector('.status-fx-front');
  if (!frontLayer) {
    frontLayer = document.createElement('div');
    frontLayer.className = 'status-fx-layer status-fx-front';
    portraitRoot.appendChild(frontLayer);
  }

  return { back: backLayer, surface: surfaceLayer, front: frontLayer };
}

// 4. Reconciliation: Sync active visual status FX on a portrait root
function syncPortraitStatusFx(entity, portraitRoot, options = {}) {
  if (!portraitRoot) return;
  const layers = ensurePortraitLayers(portraitRoot);
  if (!layers) return;
  if(typeof syncSageSamplingIndicator==='function')syncSageSamplingIndicator(entity,layers.surface);

  // Reuse the current portrait for visual echoes, including form changes.
  const image = portraitRoot.querySelector('img');
  if (image) {
    image.classList.add('portrait-image');
    if (portraitRoot.style.setProperty) portraitRoot.style.setProperty('--portrait-fx-image', `url("${image.getAttribute('src')}")`);
  } else if (portraitRoot.style.removeProperty) {
    portraitRoot.style.removeProperty('--portrait-fx-image');
  }

  const activeProfiles = getEntityActiveFxProfiles(entity);
  let scale = options.scale;
  if (!scale) {
    try {
      if (typeof getComputedStyle === 'function') {
        scale = parseFloat(getComputedStyle(portraitRoot).getPropertyValue('--portrait-fx-scale')) || 1;
      }
    } catch (_) {}
  }
  if (!scale) scale = 1;

  // Sync portrait root state classes
  for (const [profileId, profile] of Object.entries(STATUS_FX_PROFILES)) {
    if (profile.portraitClass) {
      portraitRoot.classList.toggle(profile.portraitClass, activeProfiles.has(profileId));
    }
  }

  // Multi-status conflict / Visual intensity limit
  // Back Aura max 2, Surface Overlay max 2. If exceeded, lower opacity on older items
  let backCount = 0;
  let surfaceCount = 0;

  for (const [profileId, profile] of Object.entries(STATUS_FX_PROFILES)) {
    if (profile.layer === 'terminal') continue;

    const targetLayer = layers[profile.layer];
    if (!targetLayer) continue;

    let fxItem = targetLayer.querySelector(`.status-fx-item[data-status-fx="${profileId}"]`);
    const isActive = activeProfiles.has(profileId);

    if (isActive) {
      if (profile.layer === 'back') backCount++;
      if (profile.layer === 'surface') surfaceCount++;

      if (!fxItem) {
        // Create new status FX node
        fxItem = document.createElement('div');
        fxItem.className = `status-fx-item ${profile.className}`;
        fxItem.dataset.statusFx = profileId;
        fxItem.innerHTML = profile.render(scale, entity);
        targetLayer.appendChild(fxItem);

        // Optional one-shot enter cue SFX (only if sound is enabled and allowed)
        if (options.playEnterSfx && typeof playSound === 'function') {
          if (profileId === 'frenzy') playSound('frenzy_burst');
          else if (profileId === 'exhausted') playSound('exhausted_apply');
          else if (profileId === 'shield') playSound('shield_apply');
          else if (profileId === 'poison') playSound('poison_puff');
        }
      } else {
        // Reuse existing node, cancel any exit state
        fxItem.classList.remove('is-exiting');
      }

      // Density capping: if more than 2 items in same layer, slightly reduce opacity
      if ((profile.layer === 'back' && backCount > 2) || (profile.layer === 'surface' && surfaceCount > 2)) {
        fxItem.style.opacity = '0.65';
      } else {
        fxItem.style.opacity = '';
      }
    } else if (fxItem && !fxItem.classList.contains('is-exiting')) {
      // Exit transition: fade out then remove
      fxItem.classList.add('is-exiting');
      setTimeout(() => {
        if (fxItem.classList.contains('is-exiting') && fxItem.parentNode) {
          fxItem.remove();
        }
      }, 260);
    }
  }
}

// 5. Trigger special one-shot event feedback on a portrait
function triggerPortraitStatusEvent(portraitRoot, profileId, eventType) {
  if (!portraitRoot) return;
  const item = portraitRoot.querySelector(`.status-fx-item[data-status-fx="${profileId}"]`);
  if (!item) return;

  if (eventType === 'hit' || eventType === 'block') {
    item.classList.remove('is-block', 'is-hit');
    void item.offsetWidth;
    item.classList.add(eventType === 'block' ? 'is-block' : 'is-hit');
    setTimeout(() => item.classList.remove('is-block', 'is-hit'), 300);
  } else if (eventType === 'break') {
    item.classList.add('is-break');
    setTimeout(() => {
      if (item.parentNode) item.remove();
    }, 320);
  } else if (eventType === 'tick') {
    item.classList.remove('is-tick');
    void item.offsetWidth;
    item.classList.add('is-tick');
    setTimeout(() => item.classList.remove('is-tick'), 350);
  } else if (eventType === 'off_key') {
    item.classList.remove('is-off-key');
    void item.offsetWidth;
    item.classList.add('is-off-key');
    setTimeout(() => item.classList.remove('is-off-key'), 400);
  }
}

// Global Export
if (typeof window !== 'undefined') {
  window.STATUS_FX_PROFILES = STATUS_FX_PROFILES;
  window.mapStatusToFxProfile = mapStatusToFxProfile;
  window.getEntityActiveFxProfiles = getEntityActiveFxProfiles;
  window.ensurePortraitLayers = ensurePortraitLayers;
  window.syncPortraitStatusFx = syncPortraitStatusFx;
  window.triggerPortraitStatusEvent = triggerPortraitStatusEvent;
}
if (typeof globalThis !== 'undefined') {
  globalThis.STATUS_FX_PROFILES = STATUS_FX_PROFILES;
  globalThis.mapStatusToFxProfile = mapStatusToFxProfile;
  globalThis.getEntityActiveFxProfiles = getEntityActiveFxProfiles;
  globalThis.ensurePortraitLayers = ensurePortraitLayers;
  globalThis.syncPortraitStatusFx = syncPortraitStatusFx;
  globalThis.triggerPortraitStatusEvent = triggerPortraitStatusEvent;
}
