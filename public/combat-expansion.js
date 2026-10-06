// Phase 6: production category dispatcher, also called directly by Presentation Lab.
const SUPPORT_TIMING = Object.freeze({ enter: 300, settle: 200, cast: 300,
  impactDelay: 75, ripple: 60, minionGap: 100, float: 650, exit: 300 });
const STATUS_PATHS = Object.freeze({
  shield: 'M12 2 21 6v7l-9 9-9-9V6Z', guard: 'M3 5h18v11l-9 6-9-6ZM8 9h8M12 6v12',
  poison: 'M9 2h6M10 2v7L4 20h16L14 9V2M7 16h10', bleed: 'M12 2S4 12 4 16a8 8 0 0 0 16 0C20 12 12 2 12 2Z',
  buff: 'M12 3 4 12h5v9h6v-9h5Z', debuff: 'M12 21 4 12h5V3h6v9h5Z',
  dodge: 'm4 5 7 7-7 7M12 5l7 7-7 7', lock: 'M5 10h14v12H5ZM8 10V5a4 4 0 0 1 8 0v5',
  exhausted: 'M5 3h14M5 21h14M7 3v4l10 10v4M17 3v4L7 17v4', sleep: 'M5 5h14L5 19h14',
  transform: 'M3 8 7 3l5 5 5-5 4 5-2 12H5ZM7 12l3 2m7-2-3 2',
  stealth: 'M3 12c5-8 13-8 18 0-5 8-13 8-18 0Zm0-9 18 18',
  downed: 'M4 4l16 16M20 4 4 20', corruption: 'M12 2 3 8v9l9 5 9-5V8ZM8 9l8 8m0-8-8 8'
});
function combatStatusSvg(status) {
  const path = STATUS_PATHS[status.icon] || STATUS_PATHS.buff;
  return '<svg class="combat-status-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
}
function renderCombatStatuses(statuses = []) {
  return statuses.map(s => '<span class="combat-status" data-status="' + escapeHtml(s.id) + '" title="' + escapeHtml(s.label) + '">' +
    combatStatusSvg(s) + '<span>' + escapeHtml(s.label) + (s.value ? ' ' + s.value : '') +
    (s.turns ? ' · ' + s.turns + ' 回合' : '') + (s.stacks ? ' ×' + s.stacks : '') + '</span>' +
    (s.locked ? combatStatusSvg({ icon: 'lock' }) : '') + '</span>').join('');
}
function minionPortraitSvg(type, avatar, descriptor = {}) {
  return battlePortraitHtml({ ...descriptor, type, avatar, entityType: 'minion' }, 'presentation-minion-image');
}
function resultTarget(result, before = true) { return before ? result.targetBefore : result.targetAfter; }
function resultPortrait(result) {
  const target = resultTarget(result) || resultTarget(result, false) || {};
  if (result.targetId === 'monster') {
    return battlePortraitHtml({ entityType: 'monster', avatar: result.monsterAvatar, name: result.monsterName }, 'presentation-support-image');
  }
  if (result.kind === 'intercept' || target.type === 'wolf' || target.type === 'treant') {
    const minion = result.minion || target;
    return minionPortraitSvg(minion.type, minion.avatar);
  }
  return getClassPortraitHtml(target, 'presentation-support-image');
}
function createResultCard(result) {
  const target = resultTarget(result) || {};
  const card = document.createElement('div');
  card.className = 'presentation-result-card';
  card.dataset.targetId = result.targetId;
  card.innerHTML = '<div class="presentation-result-hit"><div class="presentation-result-portrait portrait-root">' + resultPortrait(result) +
    '<div class="presentation-result-fx"></div><div class="presentation-result-numbers"></div></div></div>' +
    '<div class="presentation-result-name">' + escapeHtml(target.name || (target.role ? getClassDisplayName(target.role) : '首領')) + '</div>' +
    '<div class="presentation-result-hp-track"><div class="presentation-result-hp-fill" style="width:' +
    (target.maxHp ? Math.max(0, target.hp / target.maxHp * 100) : 0) + '%"></div><div class="presentation-result-temp hidden"></div></div>' +
    '<div class="presentation-result-hp-text">' + (target.hp ?? '') + ' / ' + (target.maxHp ?? '') + '</div>' +
    '<div class="presentation-result-status"></div>';
  if (target.hp <= 0) card.classList.add('is-downed');
  updateResultCard(card, target);
  return card;
}
function resultFloat(card, text, theme) {
  if (!text || text === '-0') return;
  const number = document.createElement('div');
  number.className = 'presentation-result-number ' + theme;
  number.textContent = text;
  card.querySelector('.presentation-result-numbers').appendChild(number);
}
function updateResultCard(card, target) {
  card.classList.toggle('is-assassin-hidden', !!target?.isHiddenThisRound && !target?.stealthBrokenThisRound && target?.hp > 0);
  if (!target) return;
  const portrait = card.querySelector('.presentation-result-portrait img');
  if (portrait && target.role) portrait.src = resolveBattlePortrait(target).src;
  card.querySelector('.presentation-result-hp-fill').style.width = Math.max(0, target.hp / target.maxHp * 100) + '%';
  card.querySelector('.presentation-result-hp-text').textContent = target.hp + ' / ' + target.maxHp;
  const temp = card.querySelector('.presentation-result-temp');
  temp.classList.toggle('hidden', !(target.tempHp > 0));
  temp.textContent = target.tempHp > 0 ? 'TEMP +' + target.tempHp : '';
  card.querySelector('.presentation-result-status').innerHTML = renderCombatStatuses(target.statuses);
  const resPortrait = card.querySelector('.presentation-result-portrait');
  if (resPortrait && typeof syncPortraitStatusFx === 'function') {
    syncPortraitStatusFx(target, resPortrait, { scale: 0.95 });
  }
}
async function presentCombatResult(result, card, context = {}) {
  const audio = context.audioScope || createSfxPresentationScope(context);
  const playSound = (key, options) => audio.play(key, options);
  const wait = ms => waitForPresentation(ms, context.signal, context.speed || 1);
  const target = resultTarget(result, false);
  const outcome = result.outcome || { type: 'normal' };
  const emit = beat => context.onTiming?.(beat, { targetId: result.targetId, result });
  if (result.sharedFrom) {
    card.classList.add('has-root-link');
    resultFloat(card, '傷害分攤', 'is-nature');
    await wait(100);
  }
  if (result.kind === 'intercept') {
    card.classList.add('is-intercepting');
    resultFloat(card, '攔截', 'is-guard');
    if (result.minion) { const cue = minionSound(result.minion, 'hurt'); playSound(cue.key, cue); }
    else playSound('minion_intercept');
    await wait(180);
  }
  if ((result.kind === 'damage' || result.kind === 'intercept') && (outcome.type === 'miss' || outcome.type === 'dodge')) {
    card.classList.add(outcome.stealth ? 'is-stealth-miss' : 'is-evading');
    playSound('air_pass');
    resultFloat(card, 'MISS', 'is-miss');
    emit('miss');
  } else if (result.kind === 'damage' || result.kind === 'intercept') {
    if (result.guard || result.absorbed > 0) {
      card.classList.add('is-guarding');
      playSound('shield_block');
      const presP = card.querySelector('.presentation-result-portrait');
      if (presP && typeof triggerPortraitStatusEvent === 'function') {
        triggerPortraitStatusEvent(presP, 'shield', 'block');
        triggerPortraitStatusEvent(presP, 'guard', 'hit');
      }
      if (result.absorbed > 0) resultFloat(card, 'ABSORB ' + result.absorbed, 'is-guard');
      await wait(100);
    }
    const damage = result.absorbed > 0 ? result.hpDmg : result.finalDamage;
    if (outcome.type === 'block' || damage === 0) {
      resultFloat(card, 'BLOCK', 'is-guard');
      emit('block');
    } else if (damage > 0) {
      const fxType = context.fxType || (context.direction === 'left' ? 'boss_claw' :
        context.sourceRole === 'archer' ? 'arrow_projectile' : context.sourceRole === 'alchemist' ? 'acid_splash' :
        context.sourceRole === 'druid' ? 'nature_strike' : null);
      if (fxType && typeof createCombatFx === 'function') {
        createCombatFx({ type: fxType, target: card.querySelector('.presentation-result-portrait'),
          direction: context.direction || 'left', variant: context.compact ? 'compact' : undefined, speed: context.speed || 1, reducedMotion: context.reducedMotion });
        if (fxType !== 'claw_slash' && fxType !== 'boss_claw') await wait(context.compact ? 90 : 130);
      }
      const hit = card.querySelector('.presentation-result-hit');
      hit.classList.remove('is-hit-left', 'is-hit-right');
      void hit.offsetWidth;
      hit.classList.add(context.direction === 'right' ? 'is-hit-right' : 'is-hit-left');
      card.classList.remove('is-impacting');
      void card.offsetWidth;
      card.classList.add('is-impacting');
      if (context.sourceRole === 'archer') { card.classList.add('has-arrow-rain'); playSound('arrow_flight'); }
      else if (context.sourceRole === 'druid' && !context.minionAudio) playSound(fxType === 'claw_slash' ? 'claw_slash' : 'vine_strike', { synthOnly: true });
      else if (context.sourceRole === 'alchemist') card.classList.add('has-poison-cloud');
      playSound(result.damageType === 'magic' ? 'magic_impact' : 'physical_hit');
      emit('impact');
      await wait(SUPPORT_TIMING.impactDelay);
      resultFloat(card, '-' + damage, result.damageType === 'magic' ? 'is-magic' : 'is-damage');
      emit('damage_float');
    }
    if (result.shieldBreak) {
      card.classList.add('is-shield-broken');
      playSound('shield_break');
      resultFloat(card, 'BREAK', 'is-guard');
    }
  } else if (result.kind === 'heal' || result.kind === 'revive') {
    card.classList.remove('is-downed');
    card.classList.add(result.kind === 'revive' ? 'is-reviving' : 'is-healing');
    updateResultCard(card, target);
    audio.playResult('healing_result', { volume: context.sourceRole === 'bard' ? .7 : 1 });
    if (result.actualHeal > 0) resultFloat(card, '+' + result.actualHeal, 'is-heal');
    emit('heal_float');
    await wait(100);
  } else {
    const gained = (result.targetAfter?.stealthStacks || 0) - (result.targetBefore?.stealthStacks || 0);
    if (gained > 0) { resultFloat(card, '匿蹤 +' + gained, 'is-status'); playSound('shadow_gain'); }
    card.classList.add('is-supporting');
    if (result.kind === 'cleanse') { resultFloat(card, '淨化', 'is-heal'); playSound('cleanse'); }
    else if (result.kind === 'summon') {
      for (const minion of result.minions || []) {
        const summon = document.createElement('div');
        summon.className = 'presentation-summon-reveal';
        summon.innerHTML = minionPortraitSvg(minion.type, minion.avatar) + '<strong>' + escapeHtml(minion.name) + '</strong><span>HP ' +
          minion.hp + ' / ' + minion.maxHp + ' · ATK ' + (minion.attack ?? minion.atk) + '</span>';
        card.appendChild(summon);
        const cue = minionSound(minion, 'summon'); playSound(cue.key, cue);
      }
    } else if (result.kind === 'transform') {
      card.dataset.form = target?.druidForm || '';
      const formImg = target?.druidForm ? resolveBattlePortrait(target).src : '';
      if (formImg) card.querySelector('.presentation-result-portrait').insertAdjacentHTML('beforeend', '<div class="presentation-form-reveal"><img class="presentation-minion-image" src="' + formImg + '" alt="形態轉變"></div>');
      playSound(target?.druidForm === 'werewolf' ? 'transform_wolf' : 'transform_treant');
      resultFloat(card, result.outcome?.label || '形態轉變', 'is-nature');
      await wait(target?.druidForm === 'werewolf' ? 350 : 550);
    } else if (result.label === '匿蹤 -1') {
      resultFloat(card, result.label, 'is-status'); playSound('shadow_decay');
    } else if (result.kind === 'status_tick' || result.actionId === 'status_tick') {
      const presP = card.querySelector('.presentation-result-portrait');
      if (presP && typeof triggerPortraitStatusEvent === 'function') {
        triggerPortraitStatusEvent(presP, 'poison', 'tick');
        triggerPortraitStatusEvent(presP, 'bleed', 'tick');
        triggerPortraitStatusEvent(presP, 'corruption', 'tick');
      }
      if (result.statuses?.length) resultFloat(card, result.statuses.map(s => s.label).join(' · '), 'is-status');
    } else if (result.statuses?.length) {
      resultFloat(card, result.statuses.map(s => s.label).join(' · '), 'is-status');
    }
  }
  updateResultCard(card, target);
  if (target?.tempHp > 0 && (result.kind === 'heal' || result.kind === 'revive')) {
    await wait(120);
    resultFloat(card, 'TEMP +' + target.tempHp, 'is-guard');
  }
  if (target && typeof applyHpSnapshot === 'function') {
    // Ripple targets may complete in different orders. Apply only this target's
    // authoritative snapshot, never another victim's future result.
    if (result.targetId === 'monster') applyHpSnapshot({ monster: target });
    else if (result.kind !== 'intercept') applyHpSnapshot({ players: [target] });
  }
  emit('hp_update');
  if (!context.audioScope) await audio.hold();
  if (outcome.protection) {
    card.classList.add('is-protected');
    resultFloat(card, '古樹庇護 · 休眠', 'is-nature');
    playSound('transform_treant');
    await wait(350);
  } else if (target?.hp <= 0 && result.targetBefore?.hp > 0 && (result.kind === 'damage' || result.kind === 'intercept')) {
    await wait(200);
    card.classList.add('is-dying');
    emit(result.targetId === 'monster' ? 'boss_death_start' : 'death_start');
    await wait(650);
    emit('death_complete');
  }
}
async function withCombatCanvas(context, category, action) {
  const canvas = document.createElement('div');
  canvas.className = 'presentation-support-canvas';
  canvas.dataset.category = category;
  const stage = getOrCreateCombatStage();
  stage.appendChild(canvas);
  const cleanup = () => canvas.remove();
  context.signal?.addEventListener('abort', cleanup, { once: true });
  try { await action(canvas); }
  finally { context.signal?.removeEventListener('abort', cleanup); cleanup(); }
}
// CAST → RESULT uses the existing canvas owner and abort lifecycle.
async function playSkillCastPresentation(step, context = {}, reveal) {
  const audio = context.audioScope || createSfxPresentationScope(context);
  const playSound = (key, options) => audio.play(key, options);
  const wait = ms => waitForPresentation(ms, context.signal, context.speed || 1);
  await withCombatCanvas(context, step.category, async canvas => {
    canvas.classList.add('presentation-skill-cast');
    canvas.dataset.phase = 'cast';
    if (context.reducedMotion) canvas.dataset.reducedMotion = 'true';
    const nature = step.sourceRole === 'druid';
    canvas.dataset.cast = nature ? 'nature' : step.actionId?.includes('reload') ? 'reload' : step.category.toLowerCase();
    const strip = document.createElement('div');
    strip.className = 'presentation-combat-strip-wrap is-player enter-left';
    const title = step.category === 'SUMMON' ? '自然呼喚' : step.category === 'TRANSFORM' ? '形態轉變' : step.skillName;
    strip.innerHTML = '<div class="presentation-combat-strip-skew"></div><div class="presentation-combat-strip-inner"><div class="presentation-combat-intent enter-intent"><h2 class="presentation-combat-intent-title">' +
      escapeHtml(getClassDisplayName(step.sourceRole) + '施放「' + title + '」') + '</h2></div></div>';
    canvas.appendChild(strip);
    const actor = document.createElement('div');
    actor.className = 'presentation-combat-portrait-wrap presentation-combat-actor-position presentation-combat-actor-left enter-actor';
    actor.innerHTML = '<div class="presentation-combat-actor-visual"><div class="presentation-combat-portrait-box">' +
      getClassPortraitHtml(combatActorDescriptor(step), 'presentation-combat-portrait-img') + '<div class="presentation-cast-energy"></div></div></div>';
    canvas.appendChild(actor);
    playSound('panel_sweep'); context.onTiming?.('cast_entry', { step });
    await wait(500);
    await wait(200);
    actor.classList.add('is-casting');
    const sfxProfile = resolveCombatSfxProfile(step);
    if (sfxProfile.key) playSound(sfxProfile.key,{detune:step.outcome?.type==='off_key'});
    else playSound(nature ? 'support_cast' : step.category === 'DEFENSE' ? 'shield_apply' : 'support_cast', { volume: .3 });
    context.onTiming?.('cast_fx', { step });
    await wait(350);
    context.onTiming?.('cast_complete', { step });
    canvas.dataset.phase = 'result';
    strip.className = 'presentation-combat-strip-wrap is-player exit-right';
    await wait(180);
    if (reveal) await reveal(canvas, actor, wait);
    if (reveal) await audio.hold();
    if (!reveal) actor.classList.add('exit-right');
    canvas.classList.add('is-exiting');
    await wait(300);
  });
}
async function playSummonResultPresentation(step, context) {
  const audio = context.audioScope || createSfxPresentationScope(context);
  const playSound = (key, options) => audio.play(key, options);
  const wait = ms => waitForPresentation(ms, context.signal, context.speed || 1);
  await withCombatCanvas(context, 'SUMMON', async canvas => {
    canvas.classList.add('presentation-summon-result');
    if (context.reducedMotion) canvas.dataset.reducedMotion = 'true';
    for (const result of step.results || []) {
      if (result.kind !== 'summon') continue;
      for (const minion of result.minions || []) {
        const reveal = document.createElement('div'); reveal.className = 'presentation-minion-reveal';
        reveal.dataset.type = minion.type;
        reveal.innerHTML = '<div class="presentation-minion-ground"></div>' + battlePortraitHtml({ ...minion, entityType: 'minion' }, 'presentation-minion-image') +
          '<strong>' + escapeHtml(minion.name) + '</strong><span>HP ' + minion.hp + ' / ' + minion.maxHp + ' · ATK ' + (minion.attack ?? minion.atk) + '</span>';
        canvas.appendChild(reveal);
        const cue = minionSound(minion, 'summon'); playSound(cue.key, cue);
        context.onTiming?.('summon_reveal', { minion });
        await wait(550);
        if (typeof applyHpSnapshot === 'function') applyHpSnapshot({ players: [result.targetAfter] });
        context.onTiming?.('summon_established', { minion });
        reveal.classList.add('is-settling');
        await wait(240);
      }
    }
    if (typeof applyHpSnapshot === 'function') applyHpSnapshot(step.hpSnapshot);
    await wait(150); await audio.hold();
  });
}
async function playTransformPresentation(step, context) {
  const audio = context.audioScope || createSfxPresentationScope(context);
  const playSound = (key, options) => audio.play(key, options);
  await playSkillCastPresentation(step, context, async (canvas, actor, wait) => {
    const result = step.results.find(r => r.kind === 'transform');
    if (!result) return;
    actor.classList.remove('enter-actor'); actor.classList.add('is-transforming');
    canvas.dataset.form = result.targetAfter.druidForm || '';
    const box = actor.querySelector('.presentation-combat-portrait-box');
    const after = document.createElement('div'); after.className = 'presentation-transform-after';
    after.innerHTML = getClassPortraitHtml(result.targetAfter, 'presentation-combat-portrait-img');
    box.appendChild(after);
    playSound(result.targetAfter.druidForm === 'werewolf' ? 'transform_wolf' : 'transform_treant');
    context.onTiming?.('transform_reveal', { result });
    await wait(550);
    const note = document.createElement('div'); note.className = 'presentation-transform-note';
    const guard = result.targetAfter.statuses?.find(s => s.id === 'treant_guard');
    note.textContent = 'Max HP ' + result.targetBefore.maxHp + ' → ' + result.targetAfter.maxHp + (guard ? ' · ' + guard.label : '');
    actor.appendChild(note);
    if (typeof applyHpSnapshot === 'function') applyHpSnapshot(step.hpSnapshot);
    context.onTiming?.('transform_established', { result });
    await wait(200); await audio.hold();
  });
}
const AMMO_NAMES = Object.freeze({ pierce: '穿甲箭', elemental: '元素箭', burst: '爆裂箭' });
function ammoArrowHtml(ammo) {
  return '<span class="presentation-ammo-arrow" data-ammo="' + escapeHtml(ammo) + '"><i class="presentation-ammo-shaft"></i><i class="presentation-ammo-tip"></i></span>';
}
async function playReloadResultPresentation(step, context) {
  const audio = context.audioScope || createSfxPresentationScope(context);
  const playSound = (key, options) => audio.play(key, options);
  const result = step.results.find(r => r.kind === 'reload');
  if (!result) return;
  const wait = ms => waitForPresentation(ms, context.signal, context.speed || 1);
  await withCombatCanvas(context, 'RELOAD', async canvas => {
    canvas.classList.add('presentation-reload-result');
    if (context.reducedMotion) canvas.dataset.reducedMotion = 'true';
    const actor = document.createElement('div'); actor.className = 'presentation-reload-actor';
    actor.innerHTML = getClassPortraitHtml(combatActorDescriptor(step), 'presentation-support-image'); canvas.appendChild(actor);
    const magazine = document.createElement('div'); magazine.className = 'presentation-magazine';
    const slots = [];
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div'); slot.className = 'presentation-ammo-slot'; slot.dataset.slot = i;
      if (result.ammoBefore[i]) slot.innerHTML = ammoArrowHtml(result.ammoBefore[i]) + '<small>' + AMMO_NAMES[result.ammoBefore[i]] + '</small>';
      magazine.appendChild(slot); slots.push(slot);
    }
    canvas.appendChild(magazine);
    playSound('reload_pull'); await wait(180);
    for (let i = result.ammoBefore.length; i < result.ammoAfter.length; i++) {
      const ammo = result.ammoAfter[i];
      slots[i].innerHTML = ammoArrowHtml(ammo) + '<small>' + AMMO_NAMES[ammo] + '</small>';
      slots[i].classList.add('is-loading'); playSound('reload_insert');
      context.onTiming?.('ammo_insert', { slot: i, ammo });
      await wait(step.actionId === 'a_frenzy_reload' ? 100 : 220);
      slots[i].classList.add('is-locked'); playSound('reload_lock');
    }
    await wait(220);
    const status = document.createElement('div'); status.className = 'presentation-reload-status';
    status.textContent = result.statuses?.find(s => s.id === 'crouch')?.label || '';
    magazine.appendChild(status);
    if (typeof applyHpSnapshot === 'function') applyHpSnapshot(step.hpSnapshot);
    context.onTiming?.('reload_complete', { ammo: result.ammoAfter });
    await wait(350);
    canvas.classList.add('is-exiting'); await wait(200);
  });
}
async function playMinionComboPresentation(step, context) {
  const audio = context.audioScope || createSfxPresentationScope(context);
  const playSound = (key, options) => audio.play(key, options);
  const wait = ms => waitForPresentation(ms, context.signal, context.speed || 1);
  await withCombatCanvas(context, 'MINION_ATTACK', async canvas => {
    canvas.classList.add('presentation-minion-combo');
    if (context.reducedMotion) canvas.dataset.reducedMotion = 'true';
    const strip = document.createElement('div'); strip.className = 'presentation-combat-strip-wrap is-player enter-left';
    strip.innerHTML = '<div class="presentation-combat-strip-skew"></div><div class="presentation-combat-strip-inner"><div class="presentation-combat-intent"><h2 class="presentation-combat-intent-title">僕從追擊</h2></div></div>';
    canvas.appendChild(strip);
    const stack = document.createElement('div'); stack.className = 'presentation-minion-stack';
    const living = step.hpSnapshotBefore.players.find(p => p.id === step.sourceId)?.minions?.filter(m => m.hp > 0 && m.alive !== false).slice(0, 3) || [];
    const portraits = new Map();
    for (let i = living.length - 1; i >= 0; i--) {
      const m = living[i]; const portrait = document.createElement('div'); portrait.className = 'presentation-minion-stack-item';
      portrait.style.setProperty('--minion-index', i); portrait.dataset.minionId = m.id;
      portrait.innerHTML = battlePortraitHtml({ ...m, entityType: 'minion' }, 'presentation-minion-image') + '<span>' + escapeHtml(m.name) + '</span>';
      stack.appendChild(portrait); portraits.set(m.id, portrait);
    }
    canvas.appendChild(stack);
    const target = createResultCard({ ...step.results[0], monsterName: step.monsterName, monsterAvatar: step.monsterAvatar });
    target.classList.add('presentation-minion-target'); canvas.appendChild(target);
    playSound('panel_sweep'); context.onTiming?.('minion_combo_entry', { step });
    await wait(300);
    for (let i = 0; i < step.results.length; i++) {
      if (i) await wait(100);
      const result = step.results[i]; const portrait = portraits.get(result.minion.id);
      portrait?.classList.add('is-attacking');
      const cue = minionSound(result.minion, 'attack', i); playSound(cue.key, cue);
      context.onTiming?.('minion_attack', { result, index: i });
      await presentCombatResult(result, target, { ...context, audioScope: audio, direction: 'right', fxType: result.minion.type === 'wolf' ? 'claw_slash' : 'vine_strike', compact: true, minionAudio: true });
      portrait?.classList.remove('is-attacking');
    }
    if (typeof applyHpSnapshot === 'function') applyHpSnapshot(step.hpSnapshot);
    await wait(400); await audio.hold(); canvas.classList.add('is-exiting'); await wait(200);
    context.onTiming?.('action_complete', { step });
  });
}
async function playCategoryPresentation(step, context = {}) {
  const audio = context.audioScope || createSfxPresentationScope(context);
  context = { ...context, audioScope: audio, sourceRole: step.sourceRole };
  const playSound = (key, options) => audio.play(key, options);
  if (typeof window !== 'undefined' && typeof window.forceCloseAllModals === 'function') {
    window.forceCloseAllModals();
  }
  const wait = ms => waitForPresentation(ms, context.signal, context.speed || 1);
  await withCombatCanvas(context, step.category, async canvas => {
    const boss = step.type === 'boss_action';
    const compact = step.category === 'MINION_ATTACK' || step.category === 'STATUS_TICK';
    if (context.reducedMotion) canvas.dataset.reducedMotion = 'true';
    canvas.classList.toggle('is-boss-party', boss);
    canvas.classList.toggle('is-compact', compact);
    const title = document.createElement('div');
    title.className = boss ? 'presentation-combat-strip-wrap is-boss enter-right' : 'presentation-support-title';
    title.innerHTML = boss ? '<div class="presentation-combat-strip-skew"></div><div class="presentation-combat-intent">' +
      escapeHtml(step.monsterName + '發動「' + step.skillName + '」') + '</div>' : escapeHtml(step.skillName);
    if (!context.resultOnly) canvas.appendChild(title);
    if (!context.resultOnly && !compact && (boss || step.sourceRole)) {
      const actor = document.createElement('div');
      actor.className = 'presentation-support-actor';
      actor.innerHTML = boss ? '<img src="' + escapeHtml(step.monsterAvatar) + '" alt="' + escapeHtml(step.monsterName) + '">' :
        getClassPortraitHtml(combatActorDescriptor(step), 'presentation-support-image');
      canvas.appendChild(actor);
    }
    const row = document.createElement('div');
    row.className = 'presentation-support-targets';
    canvas.appendChild(row);
    const cards = new Map();
    for (const result of step.results || []) {
      if (cards.has(result.targetId)) continue;
      const enriched = { ...result, monsterAvatar: step.monsterAvatar, monsterName: step.monsterName };
      const card = createResultCard(enriched);
      row.appendChild(card);
      cards.set(result.targetId, card);
    }
    if (!context.resultOnly && step.category !== 'STATUS_TICK') playSound('fight');
    await wait(compact ? 200 : SUPPORT_TIMING.enter + SUPPORT_TIMING.settle);
    if (step.category === 'CLEANSE') {
      canvas.classList.add('is-cleansing');
      playSound('cleanse');
      for (const result of (step.results || []).filter(r => r.kind === 'cleanse')) {
        await presentCombatResult(result, cards.get(result.targetId), context);
      }
      await wait(300);
      canvas.classList.remove('is-cleansing');
    }
    if (step.outcome?.type === 'off_key') {
      canvas.classList.add('is-off-key');
      if(!context.resultOnly)playSound('bard_skill1', {detune:true});
    } else if (!context.resultOnly && step.category !== 'STATUS_TICK') {
      const profile = resolveCombatSfxProfile(step);
      if (profile.key) playSound(profile.key);
      else if (boss) playSound('boss_attack');
      else if (!compact) playSound('support_cast', { volume: .3 });
    }
    if (step.outcome?.type?.startsWith('alchemy_')) {
      canvas.classList.add('is-alchemy');
      await wait(350);
      playSound(step.outcome.type === 'alchemy_success' ? 'alchemy_success' : 'alchemy_failure');
    }
    if (step.outcome?.type !== 'normal' && step.outcome?.label) {
      const outcome = document.createElement('div');
      outcome.className = 'presentation-support-outcome';
      outcome.textContent = step.outcome.label;
      canvas.appendChild(outcome);
      await wait(200);
    }
    if(step.actionId==='a_rain') {
      for(let wave=0;wave<5;wave++) {
        const rain=document.createElement('div');rain.className='arrow-rain-wave';rain.innerHTML=Array.from({length:6},(_,i)=>'<i style="--arrow:'+i+'"></i>').join('');canvas.appendChild(rain);
        playSound('arrow_release',{volume:.25,instance:'rain-'+wave,noHold:true});await wait(400);rain.remove();
      }
    }
    if (step.category === 'STEALTH') { canvas.classList.add('is-stealth-cast'); playSound('air_pass'); }
    if (step.category === 'DEFENSE' || step.category === 'SHIELD') canvas.classList.add('is-guard-cast');
    if (step.category === 'SUMMON') { canvas.classList.add('is-summon-cast'); playSound('druid_cast'); }
    if (boss) {
      // One boss entry, independent target ripple, each consumes its own result.
      await wait(200);
      const previous = new Map();
      const jobs = step.results.map((result, i) => {
        const predecessor = previous.get(result.targetId);
        const job = (async () => {
          await wait(i * SUPPORT_TIMING.ripple);
          if (predecessor) await predecessor;
          await presentCombatResult(result, cards.get(result.targetId), { ...context, direction: 'left' });
        })();
        previous.set(result.targetId, job);
        return job;
      });
      await Promise.all(jobs);
    } else {
      // Repeated hits reuse a card; every hit restarts reaction and gets its own float.
      for (let i = 0; i < (step.results || []).length; i++) {
        if (i) await wait(step.category === 'MINION_ATTACK' ? SUPPORT_TIMING.minionGap - SUPPORT_TIMING.impactDelay : SUPPORT_TIMING.ripple);
        const result = step.results[i];
        if (result.kind === 'cleanse') continue;
        // Keep the delayed stray hit visibly inside the rain, after the main waves.
        let tailRain;
        if (step.actionId === 'a_rain' && result.targetId !== 'monster') {
          tailRain=document.createElement('div');tailRain.className='arrow-rain-wave';
          tailRain.innerHTML=Array.from({length:6},(_,j)=>'<i style="--arrow:'+j+'"></i>').join('');canvas.appendChild(tailRain);
          playSound('arrow_release',{volume:.2,instance:'rain-stray-'+i,noHold:true});
        }
        if (result.minion && compact) {
          canvas.querySelector('.presentation-compact-minion')?.remove();
          const minion = document.createElement('div');
          minion.className = 'presentation-compact-minion';
          minion.innerHTML = minionPortraitSvg(result.minion.type, result.minion.avatar) + '<span>' + escapeHtml(result.minion.name) + '</span>';
          canvas.appendChild(minion);
          const cue = minionSound(result.minion, 'attack', i); playSound(cue.key, cue);
        }
        await presentCombatResult(result, cards.get(result.targetId), { ...context, direction: 'right', sourceRole: step.sourceRole });
        tailRain?.remove();

      }
    }
    if (step.hiddenEffectNote) {
      const note = document.createElement('div');
      note.className = 'presentation-support-outcome'; note.textContent = step.hiddenEffectNote; canvas.appendChild(note);
    }
    if (step.hpSnapshot && typeof applyHpSnapshot === 'function') applyHpSnapshot(step.hpSnapshot);
    await wait(compact ? SUPPORT_TIMING.float : 450);
    await audio.hold();
    canvas.classList.add('is-exiting');
    await wait(SUPPORT_TIMING.exit);
    context.onTiming?.('action_complete', { step });
  });
}
async function playPhase8Presentation(step, context = {}) {
  const wait=ms=>waitForPresentation(ms,context.signal,context.speed||1);
  const audio=context.audioScope || createSfxPresentationScope(context);
  await playSkillCastPresentation(step,{...context,audioScope:audio},async(canvas,actor)=>{
    canvas.classList.add('p8-presentation');canvas.dataset.role=step.sourceRole;
    if(context.reducedMotion)canvas.dataset.reducedMotion='true';
    canvas.dataset.outcome=step.outcome?.type||'normal';
    const reveal=document.createElement('div');reveal.className='p8-reveal';
    reveal.textContent=step.outcome?.type==='equation'?'Operand '+step.outcome.operand:step.outcome?.label||step.skillName;
    canvas.appendChild(reveal);context.onTiming?.('outcome_reveal',{step});
    const glyph=document.createElement('div');glyph.className='p8-glyph';
    const paths={dreamweaver:'M10 50Q30 5 50 50Q70 95 90 50M10 70Q50 20 90 70M50 10v80',
      stargazer:'M20 30 40 15 70 40 55 80 20 30M40 15 55 80M5 50h90M50 5v90',
      gladiator:'M5 90 20 10 50 30 80 10 95 90M20 80h60M40 70 60 30',
      samurai:'M5 80 95 20M10 90 85 10M5 50h90',
      sage:'M10 90V10h80v80ZM10 50h80M50 10v80M20 75 50 25 80 75Z'};
    glyph.innerHTML='<svg viewBox="0 0 100 100" aria-hidden="true"><path d="'+paths[step.sourceRole]+'"/></svg>';canvas.appendChild(glyph);
    audio.play('recovery_chime',{volume:.3,synthOnly:true,noHold:true});await wait(350);
    if(step.outcome?.type==='equation') {
      reveal.textContent='η('+step.outcome.x+') = '+step.outcome.eta.toFixed(3);await wait(300);
      reveal.textContent='Equation = '+step.outcome.equationDamage;await wait(300);
    }
    const row=document.createElement('div');row.className='presentation-support-targets';canvas.appendChild(row);
    const cards=new Map();
    for(const result of step.results||[]) {
      let card=cards.get(result.targetId);
      if(!card){card=createResultCard({...result,monsterName:step.monsterName,monsterAvatar:step.monsterAvatar});cards.set(result.targetId,card);row.appendChild(card);}
      const hit=document.createElement('div');hit.className='p8-hit-fx';card.querySelector('.presentation-result-portrait').appendChild(hit);
      await presentCombatResult(result,card,{...context,audioScope:audio,sourceRole:step.sourceRole,direction:'right',fxType:step.sourceRole==='samurai'?'sword_slash':undefined});
      hit.remove();await wait(step.outcome?.type==='tsubame'?100:70);
    }
    if(step.outcome?.properties?.length) {
      const properties=document.createElement('div');properties.className='p8-property-labels';
      step.outcome.properties.forEach((name,i)=>{const tag=document.createElement('span');tag.textContent=name;tag.style.setProperty('--index',i);properties.appendChild(tag);});canvas.appendChild(properties);
      await wait(400);if(step.outcome.resolution)reveal.textContent=step.outcome.resolution;
    }
    if(step.hpSnapshot && typeof applyHpSnapshot==='function')applyHpSnapshot(step.hpSnapshot);
    context.onTiming?.('action_complete',{step});await wait(350);
  });
}
async function playExpandedCombatPresentation(step, context = {}) {
  await sfxManager.preload();
  if ((context.signal || context.controller?.signal)?.aborted) return;
  const audio = context.audioScope || createSfxPresentationScope(context);
  const playSound = (key, options) => audio.play(key, options);
  context = { ...context, signal: context.signal || context.controller?.signal, audioScope: audio };
  if (['dreamweaver','stargazer','gladiator','samurai','sage'].includes(step.sourceRole)) return playPhase8Presentation(step,context);
  if (step.category === 'MINION_ATTACK') return playMinionComboPresentation(step, context);
  if (step.type === 'player_action' && !(step.results || []).some(r => r.targetId === 'monster' && r.kind === 'damage')) {
    if (step.category === 'TRANSFORM') return playTransformPresentation(step, context);
    await playSkillCastPresentation(step, context);
    if (step.category === 'SUMMON') return playSummonResultPresentation(step, context);
    if (step.results?.some(r => r.kind === 'reload')) return playReloadResultPresentation(step, context);
    return playCategoryPresentation(step, { ...context, resultOnly: true });
  }
  if (step.category === 'FOLLOW_UP') {
    await withCombatCanvas(context, 'FOLLOW_UP', async canvas => {
      canvas.classList.add('is-shadow-follow-up');
      const actor = document.createElement('div'); actor.className = 'presentation-shadow-assassin';
      actor.innerHTML = getClassPortraitHtml('assassin', 'presentation-support-image') + '<span>追擊</span>';
      canvas.appendChild(actor);
      const result = step.results[0];
      const target = createResultCard({ ...result, monsterName: step.monsterName, monsterAvatar: step.monsterAvatar });
      target.classList.add('presentation-shadow-target'); canvas.appendChild(target);
      playSound('fight');
      await waitForPresentation(300, context.signal, context.speed || 1);
      playSound('assassin_pursuit');
      await waitForPresentation(100, context.signal, context.speed || 1);
      target.classList.add('has-shadow-slash');
      if (step.isCritical) resultFloat(target, 'CRITICAL', 'is-shadow-critical');
      await presentCombatResult(result, target, { ...context, direction: 'right', sourceRole: 'assassin' });
      if (step.gainedStacks) {
        const gain = document.createElement('span'); gain.className = 'presentation-shadow-stack-gain';
        gain.textContent = '匿蹤 +1'; actor.appendChild(gain); playSound('shadow_gain');
      }
      if (typeof applyHpSnapshot === 'function') applyHpSnapshot(step.hpSnapshot);
      await waitForPresentation(400, context.signal, context.speed || 1);
      await audio.hold();
      canvas.classList.add('is-exiting');
      await waitForPresentation(150, context.signal, context.speed || 1);
      context.onTiming?.('action_complete', { step });
    });
    return;
  }
  if (!step.category || step.category === 'OFFENSIVE' || (step.type === 'player_action' && step.category !== 'AOE_OFFENSIVE' && step.results?.some(r => r.targetId === 'monster' && r.kind === 'damage'))) {
    const primary = (step.results || []).find(r => r.targetId === 'monster' && r.kind === 'damage');
    const secondary = (step.results || []).filter(r => r !== primary);
    await playCombatActionPresentation(step, { ...context, onPrimaryResolved: async ({ canvas, audioScope }) => {
      if (!secondary.length && !step.hiddenEffectNote) return;
      const row = document.createElement('div'); row.className = 'presentation-secondary-targets'; canvas.appendChild(row);
      if (step.actionId === 'm_drain') { canvas.classList.add('has-drain-stream'); await waitForPresentation(220, context.signal, context.speed || 1); }
      for (const result of secondary) {
        const card = createResultCard(result); row.appendChild(card);
        await presentCombatResult(result, card, { ...context, audioScope, sourceRole: step.sourceRole });
      }
      if (step.hiddenEffectNote) { const note = document.createElement('div'); note.className = 'presentation-support-outcome'; note.textContent = step.hiddenEffectNote; row.appendChild(note); }
    } });
    if (step.hpSnapshot && typeof applyHpSnapshot === 'function') applyHpSnapshot(step.hpSnapshot);
  } else await playCategoryPresentation(step, context);
}

async function playFloorRevivalPresentation(revival, context = {}) {
  if (!revival?.results?.length) return;
  await enterCombatStage(context);
  try { await playCategoryPresentation({ type: 'support_action', category: 'REVIVE', skillName: '重新集結',
    outcome: { type: 'normal' }, results: revival.results, hpSnapshot: revival.hpAfter }, context); }
  finally { await exitCombatStage(context); }
}
