// Phase 3 owner: one cancellable lifecycle on the existing Presentation Root.
const TRAP_TIMING = Object.freeze({
  sectionEnter: 600, narrativeDelay: 400, narrativeHold: 1000, storyExit: 500,
  character: 45, comma: 140, sentence: 280, newline: 380, paragraph: 600,
  stageEnter: 300, anticipation: 200, stagger: 150, numberDelay: 75,
  numberFloat: 700, hold: 650, exit: 500
});

function getActiveTrapDisplay() {
  try {
    return (typeof trapDisplay !== 'undefined' ? trapDisplay : (typeof window !== 'undefined' ? window.trapDisplay : null));
  } catch {
    return typeof window !== 'undefined' ? window.trapDisplay : null;
  }
}

function setActiveTrapDisplay(val) {
  try {
    if (typeof trapDisplay !== 'undefined') trapDisplay = val;
  } catch {}
  if (typeof window !== 'undefined') window.trapDisplay = val;
}

function projectTrapDisplayState(state) {
  const ev = state.currentEvent;
  if (state.state !== 'EVENT' || ev?.type !== 'trap') return state;
  let activeDisplay = getActiveTrapDisplay();
  if (!activeDisplay || activeDisplay.id !== ev.presentationId) {
    activeDisplay = { id: ev.presentationId, snapshot: ev.hpBefore };
    setActiveTrapDisplay(activeDisplay);
  }
  const snapshots = new Map((activeDisplay.snapshot?.players || []).map(p => [p.id, p]));
  return { ...state, players: state.players.map(p => ({ ...p, ...snapshots.get(p.id) })) };
}

function applyTrapSnapshot(snapshot) {
  let activeDisplay = getActiveTrapDisplay();
  if (!activeDisplay) return;
  activeDisplay.snapshot = snapshot;
  setActiveTrapDisplay(activeDisplay);
  if (typeof roomState !== 'undefined') {
    roomState = projectTrapDisplayState(roomState);
  }
}

function createTrapVictim(hit, snapshot) {
  const hp = snapshot.players.find(p => p.id === hit.targetId);
  if (!hp) throw new Error('Missing trap target HP snapshot');
  const root = document.createElement('div');
  root.className = 'presentation-trap-victim';
  root.dataset.targetId = hit.targetId;
  const portrait = document.createElement('div');
  portrait.className = 'presentation-trap-portrait';
  portrait.innerHTML = getClassPortraitHtml(hit.role, 'presentation-trap-image');
  const spike = document.createElement('div');
  spike.className = 'presentation-trap-spike';
  spike.setAttribute('aria-hidden', 'true');
  const number = document.createElement('div');
  number.className = 'presentation-trap-number';
  const label = document.createElement('div');
  label.className = 'presentation-trap-class';
  label.textContent = getClassDisplayName(hit.role);
  const hpTrack = document.createElement('div');
  hpTrack.className = 'presentation-trap-hp';
  const hpFill = document.createElement('div');
  hpFill.className = 'presentation-trap-hp-fill';
  hpFill.style.width = Math.max(0, hp.hp / hp.maxHp * 100) + '%';
  const hpText = document.createElement('div');
  hpText.className = 'presentation-trap-hp-text';
  hpText.textContent = hp.hp + ' / ' + hp.maxHp;
  hpTrack.appendChild(hpFill);
  portrait.appendChild(spike);
  portrait.appendChild(number);
  for (const child of [portrait, label, hpTrack, hpText]) root.appendChild(child);
  elements.trapVictimsContainer.appendChild(root);
  return { root, number, hpFill, hpText };
}

async function playTrapHit(hit, card, delay, signal) {
  await waitForPrologue(delay, signal);
  card.root.classList.add(hit.dodged ? 'is-dodging' : 'is-striking');
  if (hit.outcome?.type === 'assassin_trap_evade') { card.root.classList.add('is-shadow-evading'); playSound('air_pass'); }
  await waitForPrologue(TRAP_TIMING.anticipation, signal);
  if (!hit.dodged) {
    card.root.classList.add('is-hit');
    playSound('trap_impact');
  }
  await waitForPrologue(TRAP_TIMING.numberDelay, signal);
  card.number.textContent = hit.dodged ? '閃避！' : '-' + hit.damage;
  card.root.classList.add('has-result');
  applyTrapSnapshot(hit.hpSnapshot);
  const hp = hit.hpSnapshot.players.find(p => p.id === hit.targetId);
  card.hpFill.style.width = Math.max(0, hp.hp / hp.maxHp * 100) + '%';
  card.hpText.textContent = hp.hp + ' / ' + hp.maxHp;
  await waitForPrologue(TRAP_TIMING.numberFloat, signal);
}

async function playTrapPresentation(ev, context = {}) {
  if (typeof window !== 'undefined' && typeof window.forceCloseAllModals === 'function') {
    window.forceCloseAllModals();
  }
  const controller = context.controller || new AbortController();
  controller.presentationId = ev.presentationId;
  try { trapPresentationController = controller; } catch {}
  if (typeof window !== 'undefined') window.trapPresentationController = controller;
  const { signal } = controller;

  const timing = (typeof PRESENTATION_CONFIG !== 'undefined' ? PRESENTATION_CONFIG.trap : TRAP_TIMING);
  const speed = context.speed || 1.0;
  const wait = ms => waitForPrologue(Math.round(ms / speed), signal);
  const emitTiming = beat => {
    if (typeof context.onTiming === 'function') context.onTiming(beat, Date.now());
  };

  emitTiming('scene_start');

  const app = document.getElementById('app');
  const chat = elements.floatingChatContainer;
  const previousInert = app?.inert || false;
  const previousChatInert = chat?.inert || false;
  const overlay = context.overlay || elements.trapPresentationOverlay;
  const story = context.story || elements.trapDiscoveryStory;
  const section = context.section || elements.trapDiscoverySection;
  const victimsContainer = context.victimsContainer || elements.trapVictimsContainer;

  if (context.reducedMotion) {
    if (section) section.setAttribute('data-reduced-motion', 'true');
    if (overlay) overlay.setAttribute('data-reduced-motion', 'true');
  }

  let completed = false;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    overlay.classList.add('hidden');
    overlay.classList.remove('exit');
    section.classList.remove('enter', 'exit');
    section.classList.add('hidden');
    story.replaceChildren();
    victimsContainer.replaceChildren();
    document.body.classList.remove('presentation-trap-active');
    if (app) app.inert = previousInert;
    if (chat) chat.inert = previousChatInert;
    const activeCtrl = (typeof trapPresentationController !== 'undefined' ? trapPresentationController : (typeof window !== 'undefined' ? window.trapPresentationController : null));
    if (activeCtrl === controller) {
      try { trapPresentationController = null; } catch {}
      if (typeof window !== 'undefined') window.trapPresentationController = null;
      presentationManager.setBlocking(false);
    }
  };
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    if (!ev.hpBefore || !ev.hpAfter || !Array.isArray(ev.hits)) throw new Error('Missing trap presentation snapshots');
    presentationManager.setBlocking(true);
    if (app) app.inert = true;
    if (chat) chat.inert = true;
    document.body.classList.add('presentation-trap-active');
    story.replaceChildren();
    victimsContainer.replaceChildren();
    overlay.classList.add('hidden');
    section.classList.remove('hidden', 'exit');
    section.classList.add('enter');

    emitTiming('narrative_start');
    await wait(timing.sectionEnter + timing.narrativeDelay);
    const paragraphs = (ev.story || '').split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length) await typePrologueParagraphs(story, paragraphs, signal, timing);
    emitTiming('narrative_complete');

    await wait(timing.narrativeHold);
    emitTiming('hold_complete');

    section.classList.add('exit');
    await wait(timing.storyExit);
    section.classList.add('hidden');
    emitTiming('story_exit');

    const cards = ev.hits.map(hit => createTrapVictim(hit, ev.hpBefore));
    overlay.classList.remove('hidden', 'exit');
    playSound('trap_trigger');
    emitTiming('trap_trigger');
    await wait(timing.stageEnter);

    // Staggered targets belong to this single owner; no second animation queue.
    await Promise.all(ev.hits.map((hit, i) => playTrapHit(hit, cards[i], Math.round(i * timing.stagger / speed), signal)));
    emitTiming('impact_complete');

    await wait(timing.hold);
    overlay.classList.add('exit');
    await wait(timing.exit);
    emitTiming('exit_complete');

    applyTrapSnapshot(ev.hpAfter);
    completed = true;
  } catch (error) {
    if (error.name !== 'AbortError') {
      // Cancel sibling hit tasks before releasing ownership.
      controller.abort();
      console.error('[Presentation:trap]', error);
    }
  } finally {
    signal.removeEventListener('abort', cleanup);
    cleanup();
  }
  emitTiming('presentation_complete');
  if (typeof context.onComplete === 'function') {
    context.onComplete({ completed, signal, ev });
  } else if (completed && !signal.aborted && typeof roomState !== 'undefined' && roomState?.state === 'EVENT' &&
      roomState.currentEvent?.presentationId === ev.presentationId) {
    if (typeof socket !== 'undefined' && socket?.emit) {
      if (ev.fatal) {
        socket.emit('trap:fatal_complete', { presentationId: ev.presentationId });
      } else {
        socket.emit('trap:presentation_complete', { presentationId: ev.presentationId });
      }
    }
  }
}
