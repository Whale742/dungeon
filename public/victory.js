// Victory consumes server recovery/drop results and the shared Phase 4 reward beat.
let expandedDisplay = null;
let victoryPresentationController = null;
let victoryStartedId = null;
let victoryContinueButton = null;
function mergePresentationSnapshot(base, incoming) {
  const map = new Map((base?.players || []).map(p => [p.id, p]));
  for (const p of incoming.players || []) map.set(p.id, { ...map.get(p.id), ...p });
  return { ...base, ...incoming, players: [...map.values()], monster: incoming.monster || base?.monster };
}
function projectExpandedDisplayState(state) {
  const victory = state.state === 'BATTLE_VICTORY' ? state.currentVictory : null;
  const revival = state.state === 'CHOOSING_ROUTE' ? state.floorRevival : null;
  const id = victory ? 'victory_' + victory.presentationId : revival ? 'floor_' + state.routePresentationId : null;
  if (!id) { expandedDisplay = null; return state; }
  if (expandedDisplay?.id !== id) expandedDisplay = { id, snapshot: victory ? victory.hpBefore : revival.hpBefore };
  const map = new Map(expandedDisplay.snapshot.players.map(p => [p.id, p]));
  return { ...state, players: state.players.map(p => ({ ...p, ...map.get(p.id) })) };
}
function refreshVictoryControls() {
  if (!victoryContinueButton || typeof roomState === 'undefined') return;
  victoryContinueButton.disabled = !roomState.victoryInteractionReady || Boolean(roomState.pendingDrop) || roomState.leaderId !== myId;
  victoryContinueButton.textContent = roomState.pendingDrop ? '等待裝備抉擇' : roomState.leaderId !== myId ? '等待隊長繼續深入' : '繼續深入';
}
async function playVictoryPresentation(victory, context = {}) {
  const controller = context.controller || new AbortController();
  const signal = context.signal || controller.signal;
  const wait = ms => waitForPresentation(ms, signal, context.speed || 1);
  const stage = getOrCreateCombatStage();
  const app = document.getElementById('app');
  const previousInert = app?.inert || false;
  const canvas = document.createElement('div');
  canvas.className = 'presentation-victory';
  stage.appendChild(canvas);
  stage.classList.remove('is-exiting');
  stage.classList.add('is-active');
  if (app) app.inert = true;
  presentationManager.setBlocking(true);
  let ready = false;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    canvas.remove();
    const equipmentModal = document.getElementById('equipDropModal');
    if (equipmentModal) equipmentModal.style.zIndex = '';
    stage.classList.remove('is-active');
    if (app) app.inert = previousInert;
    presentationManager.setBlocking(false);
    victoryContinueButton = null;
  };
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    // Music deceleration and loading run independently of victory presentation.
    if(typeof bgmManager!=='undefined'){
      void bgmManager.bossDefeated().then(()=>{if(!signal.aborted)return bgmManager.resumeNormal();}).catch(error=>console.warn('[Victory:BGM]',error));
    }
    // Fatal action already completed death hold before the server enters victory.
    await wait(300);
    const title = document.createElement('div');
    title.className = 'presentation-victory-title';
    title.innerHTML = '<div class="presentation-victory-heading">VICTORY</div><p>' + escapeHtml(victory.monsterName) + '已被擊敗</p>';
    canvas.appendChild(title);
    playSound('victory', { signal });
    context.onTiming?.('victory_title', {});
    await wait(Math.max(750 + 1500, SFX_ASSETS.victory.identityBeatMs));
    title.classList.add('exit');
    await wait(500);
    title.remove();
    const story = document.createElement('div');
    story.className = 'presentation-victory-story';
    canvas.appendChild(story);
    await typewriterEffect(story, [victory.story], signal, null, context.speed || 1);
    await wait(1100);
    story.classList.add('exit');
    await wait(500);
    story.remove();
    const summary = document.createElement('div');
    summary.className = 'presentation-victory-summary';
    summary.innerHTML = '<h2>BATTLE SUMMARY</h2><p>戰鬥回合：' + victory.rounds + '<br>隊伍存活：' + victory.survivors + ' / ' + victory.partySize +
      '<br>Boss：' + escapeHtml(victory.monsterName) + '</p><p>' + escapeHtml(victory.recoveryRule || '') + '</p>';
    canvas.appendChild(summary);
    context.onTiming?.('victory_summary', {});
    await wait(650);
    await playCategoryPresentation({ type: 'support_action', category: 'HEAL', skillName: '戰後休整',
      outcome: { type: 'normal' }, results: victory.results, hpSnapshot: victory.hpAfter }, { ...context, signal });
    const reward = document.createElement('div');
    reward.className = 'presentation-reward-content hidden';
    reward.innerHTML = '<div class="presentation-reward-rarity"></div><h2 class="presentation-reward-title"></h2>' +
      '<p class="presentation-reward-desc"></p><div class="presentation-reward-meta"></div>';
    canvas.appendChild(reward);
    await playRewardReveal({ drop: victory.discarded ? null : victory.drop,
      discardedDrop: victory.discarded ? victory.drop : null, ownerName: victory.ownerName, recoveryRule: victory.recoveryRule }, {
      ...context, signal, rewardContent: reward, rewardElements: {
        presentationRewardRarity: reward.children[0], presentationRewardTitle: reward.children[1],
        presentationRewardDesc: reward.children[2], presentationRewardMeta: reward.children[3]
      }
    });
    reward.classList.add('exit');
    await wait(500);
    reward.remove();
    ready = true;
    if (app) app.inert = false;
    stage.classList.remove('is-exiting');stage.classList.add('is-active');
    const equipmentModal = document.getElementById('equipDropModal');
    if (equipmentModal) equipmentModal.style.zIndex = '1100';
    presentationManager.setBlocking(false);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'presentation-victory-continue'; button.textContent = '繼續深入';
    victoryContinueButton = button;
    canvas.appendChild(button);
    // Narrative/recovery/reward have fully exited before readiness is ACKed.
    context.onReady?.();
    if (context.mode !== 'lab') refreshVictoryControls();
    context.onTiming?.('victory_interaction_ready', {});
    await new Promise((resolve, reject) => {
      const cancel = () => { button.removeEventListener('click', click); reject(new DOMException('Presentation cancelled', 'AbortError')); };
      const click = async () => {
        if (button.disabled) return;
        button.disabled = true;
        canvas.classList.add('exit');
        try {
          await wait(500);
          signal.removeEventListener('abort', cancel);
          context.onContinue?.();
          resolve();
        } catch (error) { reject(error); }
      };
      button.addEventListener('click', click);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
  } finally {
    signal.removeEventListener('abort', cleanup);
    cleanup();
    context.onComplete?.({ completed: ready });
  }
}
function renderBattleVictory() {
  const victory = roomState.currentVictory;
  if (!victory) return;
  if (victoryStartedId !== victory.presentationId) {
    victoryStartedId = victory.presentationId;
    const controller = new AbortController();
    controller.presentationId = victory.presentationId;
    victoryPresentationController = controller;
    void playVictoryPresentation(victory, { controller,
      onReady: () => socket.emit('victory:presentation_complete', { presentationId: victory.presentationId }),
      onContinue: () => socket.emit('victory:continue', { presentationId: victory.presentationId })
    }).catch(error => { if (error.name !== 'AbortError') console.error('[Presentation:victory]', error); });
  }
  refreshVictoryControls();
}
