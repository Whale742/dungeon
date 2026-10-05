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
function minionPortraitSvg(type, avatar) {
  const imgSrc = avatar || (type === 'wolf' ? '/photo/幼狼1.webp' : '/photo/小樹精1.webp');
  return '<img class="presentation-minion-image" src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(type || 'minion') + '">';
}
function resultTarget(result, before = true) { return before ? result.targetBefore : result.targetAfter; }
function resultPortrait(result) {
  const target = resultTarget(result) || resultTarget(result, false) || {};
  if (result.minion || result.kind === 'intercept') {
    const minion = result.minion || target;
    return minionPortraitSvg(minion.type, minion.avatar);
  }
  if (result.targetId === 'monster') return '<img src="' + escapeHtml(result.monsterAvatar || '/BOSS/Ancient Guardian Golem.webp') + '" alt="' + escapeHtml(result.monsterName || 'Boss') + '">';
  return getClassPortraitHtml(target, 'presentation-support-image');
}
function createResultCard(result) {
  const target = resultTarget(result) || {};
  const card = document.createElement('div');
  card.className = 'presentation-result-card';
  card.dataset.targetId = result.targetId;
  card.innerHTML = '<div class="presentation-result-hit"><div class="presentation-result-portrait">' + resultPortrait(result) +
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
  card.querySelector('.presentation-result-hp-fill').style.width = Math.max(0, target.hp / target.maxHp * 100) + '%';
  card.querySelector('.presentation-result-hp-text').textContent = target.hp + ' / ' + target.maxHp;
  const temp = card.querySelector('.presentation-result-temp');
  temp.classList.toggle('hidden', !(target.tempHp > 0));
  temp.textContent = target.tempHp > 0 ? 'TEMP +' + target.tempHp : '';
  card.querySelector('.presentation-result-status').innerHTML = renderCombatStatuses(target.statuses);
}
async function presentCombatResult(result, card, context = {}) {
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
    playSound('minion_intercept');
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
      if (result.absorbed > 0) resultFloat(card, 'ABSORB ' + result.absorbed, 'is-guard');
      await wait(100);
    }
    const damage = result.absorbed > 0 ? result.hpDmg : result.finalDamage;
    if (outcome.type === 'block' || damage === 0) {
      resultFloat(card, 'BLOCK', 'is-guard');
      emit('block');
    } else if (damage > 0) {
      const hit = card.querySelector('.presentation-result-hit');
      hit.classList.remove('is-hit-left', 'is-hit-right');
      void hit.offsetWidth;
      hit.classList.add(context.direction === 'right' ? 'is-hit-right' : 'is-hit-left');
      card.classList.remove('is-impacting');
      void card.offsetWidth;
      card.classList.add('is-impacting');
      if (context.sourceRole === 'archer') { card.classList.add('has-arrow-rain'); playSound('arrow_flight'); }
      else if (context.sourceRole === 'druid') { card.classList.add('has-claw-hit'); playSound('claw_slash'); }
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
    playSound(result.kind === 'revive' ? 'revive_chime' : 'recovery_chime');
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
        playSound(minion.type === 'wolf' ? 'summon_wolf' : 'summon_treant');
      }
    } else if (result.kind === 'transform') {
      card.dataset.form = target?.druidForm || '';
      const formImg = target?.druidForm === 'werewolf' ? '/photo/狼人.webp' : (target?.druidForm === 'treant' || target?.druidForm === 'tree' ? '/photo/遠古樹精.webp' : '');
      if (formImg) card.querySelector('.presentation-result-portrait').insertAdjacentHTML('beforeend', '<div class="presentation-form-reveal"><img class="presentation-minion-image" src="' + formImg + '" alt="形態轉變"></div>');
      playSound(target?.druidForm === 'werewolf' ? 'transform_wolf' : 'transform_treant');
      resultFloat(card, result.outcome?.label || '形態轉變', 'is-nature');
      await wait(target?.druidForm === 'werewolf' ? 350 : 550);
    } else if (result.label === '匿蹤 -1') {
      resultFloat(card, result.label, 'is-status'); playSound('shadow_decay');
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
async function playCategoryPresentation(step, context = {}) {
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
    canvas.appendChild(title);
    if (!compact && (boss || step.sourceRole)) {
      const actor = document.createElement('div');
      actor.className = 'presentation-support-actor';
      actor.innerHTML = boss ? '<img src="' + escapeHtml(step.monsterAvatar) + '" alt="' + escapeHtml(step.monsterName) + '">' :
        getClassPortraitHtml(step.sourcePlayer || { role: step.sourceRole, druidForm: step.druidForm }, 'presentation-support-image');
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
    if (boss) playSound('panel_sweep');
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
      playSound('bard_off_key');
    } else playSound(boss ? 'boss_attack' : compact ? 'minion_attack' : step.category === 'HEAL' ? 'heal_wave' :
      step.category === 'DEFENSE' || step.category === 'SHIELD' ? 'shield_apply' : 'support_cast');
    if (step.outcome?.type.startsWith('alchemy_')) {
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
    if (step.category === 'STEALTH') { canvas.classList.add('is-stealth-cast'); playSound('air_pass'); }
    if (step.category === 'DEFENSE' || step.category === 'SHIELD') canvas.classList.add('is-guard-cast');
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
        if (result.minion && compact) {
          canvas.querySelector('.presentation-compact-minion')?.remove();
          const minion = document.createElement('div');
          minion.className = 'presentation-compact-minion';
          minion.innerHTML = minionPortraitSvg(result.minion.type, result.minion.avatar) + '<span>' + escapeHtml(result.minion.name) + '</span>';
          canvas.appendChild(minion);
          playSound('minion_attack');
        }
        await presentCombatResult(result, cards.get(result.targetId), { ...context, direction: 'right', sourceRole: step.sourceRole });

      }
    }
    if (step.hiddenEffectNote) {
      const note = document.createElement('div');
      note.className = 'presentation-support-outcome'; note.textContent = step.hiddenEffectNote; canvas.appendChild(note);
    }
    if (step.hpSnapshot && typeof applyHpSnapshot === 'function') applyHpSnapshot(step.hpSnapshot);
    await wait(compact ? SUPPORT_TIMING.float : 450);
    canvas.classList.add('is-exiting');
    await wait(SUPPORT_TIMING.exit);
    context.onTiming?.('action_complete', { step });
  });
}
async function playExpandedCombatPresentation(step, context = {}) {
  context = { ...context, signal: context.signal || context.controller?.signal };
  if (step.category === 'FOLLOW_UP') {
    await withCombatCanvas(context, 'FOLLOW_UP', async canvas => {
      canvas.classList.add('is-shadow-follow-up');
      const actor = document.createElement('div'); actor.className = 'presentation-shadow-assassin';
      actor.innerHTML = getClassPortraitHtml('assassin', 'presentation-support-image') + '<span>追擊</span>';
      canvas.appendChild(actor);
      const result = step.results[0];
      const target = createResultCard({ ...result, monsterName: step.monsterName, monsterAvatar: step.monsterAvatar });
      target.classList.add('presentation-shadow-target'); canvas.appendChild(target);
      playSound('shadow_follow_up');
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
      canvas.classList.add('is-exiting');
      await waitForPresentation(150, context.signal, context.speed || 1);
      context.onTiming?.('action_complete', { step });
    });
    return;
  }
  if (!step.category || step.category === 'OFFENSIVE') {
    const primary = (step.results || []).find(r => r.targetId === 'monster');
    const secondary = (step.results || []).filter(r => r !== primary);
    await playCombatActionPresentation(step, { ...context, onPrimaryResolved: async ({ canvas }) => {
      if (!secondary.length && !step.hiddenEffectNote) return;
      const row = document.createElement('div'); row.className = 'presentation-secondary-targets'; canvas.appendChild(row);
      if (step.actionId === 'm_drain') { canvas.classList.add('has-drain-stream'); playSound('heal_wave'); await waitForPresentation(220, context.signal, context.speed || 1); }
      for (const result of secondary) {
        const card = createResultCard(result); row.appendChild(card);
        await presentCombatResult(result, card, context);
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
