// Phase 2 owner. Uses the existing Presentation Root and cancellable story helpers.
const EXPLORATION_TIMING = Object.freeze({
  floorEnter: 600, floorHold: 1400, floorExit: 600,
  sectionEnter: 600, narrativeDelay: 400, narrativeHold: 1100,
  promptEnter: 250, choiceEnter: 350, choiceStagger: 90,
  character: 35, comma: 140, sentence: 280, newline: 380, paragraph: 600
});

function routePresentationKey() {
  return roomState ? 'ROUTE_' + roomState.routePresentationId : null;
}

function setRouteChoicesHidden(hidden) {
  for (const element of [elements.routeStatusText, elements.routeOptionsGrid,
    elements.routeVotersStatusList, elements.routeTimerBar, document.getElementById('routeDiffPercent')?.closest('.buff-highlight')].filter(Boolean)) {
    if (hidden) element.classList.add('hidden');
    else element.classList.remove('hidden');
  }
}

async function playExplorationPresentation(presentationId, floor, paragraphs) {
  if (typeof window !== 'undefined' && typeof window.forceCloseAllModals === 'function') {
    window.forceCloseAllModals();
  }
  const controller = new AbortController();
  controller.presentationId = presentationId;
  routePresentationController = controller;
  const { signal } = controller;
  const view = elements.views.route;
  const overlay = elements.floorIntroOverlay;
  const app = document.getElementById('app');
  const previousInert = app.inert;
  const chat = elements.floatingChatContainer;
  const previousChatInert = chat.inert;
  let completed = false;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    overlay.classList.add('hidden');
    overlay.classList.remove('exit');
    document.body.classList.remove('presentation-floor-active');
    view.classList.remove('exploration-enter');
    elements.routeOptionsGrid.classList.remove('exploration-choices-enter');
    elements.routeStatusText.classList.remove('exploration-prompt-enter');
    app.inert = previousInert;
    chat.inert = previousChatInert;
    if (!completed) {
      gateDestinationView('route');
      setRouteChoicesHidden(true);
      elements.routeAtmosphereText.replaceChildren();
    }
    if (routePresentationController === controller) {
      routePresentationController = null;
      presentationManager.setBlocking(false);
    }
  };
  signal.addEventListener('abort', cleanup, { once: true });

  try {
    if (!paragraphs.length) throw new Error('Missing exploration narrative');
    presentationManager.setBlocking(true);
    app.inert = true;
    chat.inert = true;
    gateDestinationView('route');
    setRouteChoicesHidden(true);
    elements.routeAtmosphereText.replaceChildren();
    elements.floorIntroNumber.textContent = '第 ' + floor + ' 層';
    elements.floorIntroTitle.textContent = '迷霧分歧點';
    document.body.classList.add('presentation-floor-active');
    overlay.classList.remove('exit', 'hidden');
    playSound('walk',{signal,instance:'floor-walk-'+presentationId});
    await waitForPrologue(EXPLORATION_TIMING.floorEnter + EXPLORATION_TIMING.floorHold, signal);
    overlay.classList.add('exit');
    await waitForPrologue(EXPLORATION_TIMING.floorExit, signal);
    overlay.classList.add('hidden');
    document.body.classList.remove('presentation-floor-active');

    if (roomState.floorRevival?.results?.length) {
      await playFloorRevivalPresentation(roomState.floorRevival, { signal });
      // Floor revival exits before exploration enters; keep the same route owner.
      presentationManager.setBlocking(true);
      app.inert = true; chat.inert = true;
    }
    view.classList.add('exploration-enter');
    revealDestinationView('route');
    await waitForPrologue(EXPLORATION_TIMING.sectionEnter, signal);
    await waitForPrologue(EXPLORATION_TIMING.narrativeDelay, signal);
    await typePrologueParagraphs(elements.routeAtmosphereText, paragraphs, signal, EXPLORATION_TIMING);
    await waitForPrologue(EXPLORATION_TIMING.narrativeHold, signal);

    elements.routeStatusText.classList.add('exploration-prompt-enter');
    elements.routeStatusText.classList.remove('hidden');
    document.getElementById('routeDiffPercent')?.closest('.buff-highlight')?.classList.remove('hidden');
    await waitForPrologue(EXPLORATION_TIMING.promptEnter, signal);
    elements.routeOptionsGrid.classList.add('exploration-choices-enter');
    elements.routeOptionsGrid.classList.remove('hidden');
    const count = (roomState.currentRoutes || []).length;
    await waitForPrologue(EXPLORATION_TIMING.choiceEnter + Math.max(0, count - 1) * EXPLORATION_TIMING.choiceStagger, signal);
    elements.routeVotersStatusList.classList.remove('hidden');
    elements.routeTimerBar.classList.remove('hidden');
    completed = true;
    routeInteractionReadyKey = 'ROUTE_' + presentationId;
  } catch (error) {
    if (error.name !== 'AbortError') console.error('[Presentation:exploration]', error);
  } finally {
    signal.removeEventListener('abort', cleanup);
    cleanup();
  }
  if (completed && !signal.aborted && roomState.state === 'CHOOSING_ROUTE' &&
      roomState.routePresentationId === presentationId) {
    // One ACK covers cinematic exit, narrative reading and choice entry.
    socket.emit('route:interaction_ready', { presentationId });
  }
}

function renderRouteChoice(me) {
  const key = routePresentationKey();
  elements.routeFloorNum.textContent = roomState.floor;
  elements.routeMainTitle.textContent = '【第 ' + roomState.floor + ' 層・迷霧分歧點】';
  elements.routeDiffPercent.textContent = roomState.floorDifficultyPercent ?? 0;
  const myVoteId = roomState.routeVotes?.[myId];
  const locallyReady = routeInteractionReadyKey === key;
  const enabled = locallyReady && !roomState.isNarrating && !roomState.isPaused && !presentationManager.isBlocking;
  elements.routeStatusText.textContent = myVoteId ? '你已完成投票，等待隊友抉擇。'
    : me?.hp <= 0 ? '你已陣亡，請觀看隊友抉擇。'
    : locallyReady && roomState.isNarrating ? '等待全體隊員閱讀完畢。'
    : '機遇與毀滅僅有一線之隔，請全員共同投票決定前進方向！';
  const seconds = roomState.isNarrating ? 15 : (roomState.timerRemaining ?? 15);
  elements.routeTimerText.textContent = '倒數 ' + seconds + ' 秒';
  elements.routeTimerProgress.style.width = Math.max(0, Math.min(100, seconds / 15 * 100)) + '%';

  // Preserve button identity and keyboard focus across countdown/vote updates.
  const previousButtons = new Map(Array.from(elements.routeOptionsGrid.children)
    .map(button => [button.dataset.routeId, button]));
  for (const route of roomState.currentRoutes || []) {
    let button = previousButtons.get(route.id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.routeId = route.id;
      button.addEventListener('click', () => {
        if (button.disabled || presentationManager.isBlocking || roomState.isNarrating) return;
        playSound('select');
        socket.emit('route:vote', { routeId: route.id });
      });
      elements.routeOptionsGrid.appendChild(button);
    }
    previousButtons.delete(route.id);
    const isMyVote = myVoteId === route.id;
    button.className = 'route-item' + (isMyVote ? ' my-vote' : '');
    button.disabled = !enabled || !me || me.hp <= 0;
    button.setAttribute('aria-pressed', String(isMyVote));
    const votes = roomState.routeVoteCounts?.[route.id] || 0;
    const voters = (roomState.players || []).filter(p => roomState.routeVotes?.[p.id] === route.id);
    button.innerHTML = '<span class="route-vote-badge">' + votes + ' 票</span>' +
      '<span class="route-icon">' + getIconSvg('flag', 'svg-hero-icon') + '</span>' +
      '<span class="route-name">' + escapeHtml(route.name) + '</span>' +
      '<span class="route-sub">' + escapeHtml(route.desc) + '</span>' +
      (voters.length ? '<span class="route-voters-tags">' + voters.map(p =>
        '<span class="route-voter-tag">' + escapeHtml(p.name) + '</span>').join('') + '</span>' : '');
  }
  for (const button of previousButtons.values()) button.remove();
  elements.routeVotersStatusList.innerHTML = (roomState.players || []).filter(p => p.hp > 0).map(p => {
    const voted = Boolean(roomState.routeVotes?.[p.id]);
    return '<span class="route-voter-pill ' + (voted ? 'voted' : 'thinking') + '">' +
      escapeHtml(p.name) + '：' + (voted ? '已投票' : '思考中') + '</span>';
  }).join('');

  if (routeNarrativeDoneKey !== key) {
    routeNarrativeDoneKey = key;
    routeInteractionReadyKey = null;
    void playExplorationPresentation(roomState.routePresentationId, roomState.floor, roomState.routeNarrative || []);
  }
}
