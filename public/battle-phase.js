// Boss and round choreography share the existing Presentation Root and wait/abort contract.
function createBattlePhaseStage(className, context = {}) {
  const root = document.getElementById('presentationRoot');
  if (!root) return null;
  const stage = document.createElement('div');
  stage.className = className;
  stage.style.setProperty('--phase-speed', context.speed || 1);
  stage.dataset.reducedMotion = String(context.reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  root.appendChild(stage);
  return stage;
}

async function playBossIntro(monster, context = {}) {
  await sfxManager.preload();
  if (context.signal?.aborted) return;
  const stage = createBattlePhaseStage('boss-encounter-stage', context);
  if (!stage) return;
  const wait = ms => waitForPresentation(ms, context.signal, context.speed);
  const beat = name => context.onTiming?.(name, performance.now());
  const timing = PRESENTATION_CONFIG.bossEncounter;
  const audio = createSfxPresentationScope(context);
  const sound = name => context.playSound ? context.playSound(name, { signal: context.signal }) : audio.play(name);
  stage.style.setProperty('--darken-duration', `${timing.darkenDuration}ms`);
  stage.innerHTML = `<div class="boss-encounter-backdrop"></div>
    <div class="boss-encounter-impact-stage">
      <div class="boss-warning"><div class="boss-warning-strip"></div><div class="boss-warning-copy"><strong>WARNING</strong><span>偵測到敵對存在 · ENEMY ENCOUNTER</span></div></div>
      <div class="boss-entry-flash"></div>
      <div class="boss-encounter-art"></div>
      <div class="boss-encounter-name"><h1></h1><span></span></div>
    </div>`;
  const warning = stage.querySelector('.boss-warning');
  const impact = stage.querySelector('.boss-encounter-impact-stage');
  const art = stage.querySelector('.boss-encounter-art');
  const name = stage.querySelector('.boss-encounter-name');
  name.querySelector('h1').textContent = monster.name || 'ABYSS LORD';
  name.querySelector('span').textContent = monster.isWeakened ? 'WEAKENED' : 'ABYSS LORD';
  if (monster.avatar) {
    const image = document.createElement('img');
    image.src = monster.avatar; image.alt = monster.name || 'Boss';
    art.appendChild(image);
  }
  try {
    beat('encounter_darken');
    if (context.segment !== 'reveal') {
      sound('boss_warning'); beat('warning_audio_start');
      await wait(timing.darkenDuration); beat('encounter_dark');
      await wait(timing.warningRevealAt - timing.darkenDuration);
      warning.classList.add('is-entering'); beat('warning_entry');
      await wait(timing.warningEntry); beat('warning_hold'); await wait(timing.warningHold);
      warning.classList.add('is-exiting'); beat('warning_exit'); await wait(timing.warningExit);
      warning.hidden = true; beat('warning_complete');
      if (context.segment === 'warning') return;
    }
    await wait(timing.preBossBeat);
    impact.classList.add('is-pre-tremor'); beat('boss_rumble');
    // A single entrance identity owns the boom; no extra synth low-frequency stack.
    impact.classList.remove('is-pre-tremor'); impact.classList.add('is-boom');
    art.classList.add('is-entering'); sfxManager.duck('boss_warning', .4);
    sound('boss_entrance'); beat('boss_boom'); beat('boss_art_entry');
    await wait(timing.bossSettle); beat('boss_art_settle');
    name.classList.add('is-entering'); beat('boss_name_entry'); await wait(300);
    beat('boss_hold'); await wait(timing.bossHold); await audio.hold();
    name.classList.add('is-exiting'); beat('boss_name_exit'); await wait(100);
    art.classList.add('is-exiting'); beat('boss_art_exit'); await wait(360);
    stage.classList.add('is-exiting'); await wait(180);
  } finally { stage.remove(); beat('boss_complete'); }
}

async function playRoundStartBanner(round, context = {}) {
  const stage = createBattlePhaseStage('round-start-overlay', context);
  if (!stage) return;
  const wait = ms => waitForPresentation(ms, context.signal, context.speed);
  const beat = name => context.onTiming?.(name, performance.now());
  stage.innerHTML = '<div class="round-start-banner"><div class="round-start-strip"></div><strong class="round-start-main"></strong><span class="round-start-sub"></span></div>';
  stage.querySelector('.round-start-main').textContent = `ROUND ${round}`;
  stage.querySelector('.round-start-sub').textContent = context.phase || 'ADVENTURER PHASE';
  try {
    (context.playSound || playSound)('round_start');
    stage.classList.add('is-entering'); beat('round_strip_entry');
    await wait(90); beat('round_main_entry'); await wait(90); beat('round_sub_entry');
    await wait(320); beat('round_hold'); await wait(550);
    stage.classList.add('is-exiting'); beat('round_sub_exit');
    await wait(90); beat('round_main_exit'); await wait(90); beat('round_strip_exit');
    await wait(180);
  } finally { stage.remove(); beat('round_complete'); }
}

// Production handoff helper; Lab calls this same sequence with a HUD callback.
async function playBattlePhaseOpening(monster, round, context = {}) {
  if (context.encounter) {
    await playBossIntro(monster, context);
    await context.revealHud?.();
    context.onTiming?.('battle_hud_reveal', performance.now());
    await waitForPresentation(400, context.signal, context.speed);
    await waitForPresentation(250, context.signal, context.speed);
  }
  await playRoundStartBanner(round, context);
}
