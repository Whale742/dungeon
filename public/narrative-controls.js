// Text playback has its own clock. Animation and audio waits never read it.
const narrativeControls = { key: null, accelerated: false, writers: new Set() };

function getNarrativeEventKey(state) {
  if (!state) return null;
  return state.narrativeControl?.key ?? JSON.stringify([
    state.code, state.state, state.floor, state.routePresentationId,
    state.currentTransition?.routeId, state.currentEvent?.presentationId,
    state.currentEvent?.opened, state.battleRound, state.battlePresentationId,
    state.currentVictory?.presentationId
  ]);
}

function refreshNarrativeControls(state = typeof roomState !== 'undefined' ? roomState : null) {
  const panel = document.getElementById('narrativeControls');
  const skip = document.getElementById('btnSkipPrologue');
  const speed = document.getElementById('btnNarrativeSpeed');
  if (!panel || !skip || !speed) return;
  const leader = !!state && state.leaderId === (typeof myId !== 'undefined' ? myId : null);
  const opening = state?.state === 'PROLOGUE';
  const typing = [...narrativeControls.writers].some(writer => writer.key === narrativeControls.key);
  panel.classList.toggle('hidden', !leader || (!opening && !typing));
  skip.classList.toggle('hidden', !opening);
  speed.disabled = !typing;
  speed.setAttribute('aria-pressed', String(narrativeControls.accelerated));
  speed.textContent = narrativeControls.accelerated ? '▶▶ 加速：開' : '▶▶ 加速：關';
}

function setNarrativeAcceleration(value) {
  const changed = narrativeControls.accelerated !== !!value;
  narrativeControls.accelerated = !!value;
  if (changed && typeof currentTypewriterContext !== 'undefined') currentTypewriterContext?.setSpeed?.();
  refreshNarrativeControls();
}

function syncNarrativeControls(state) {
  const key = getNarrativeEventKey(state);
  if (key !== narrativeControls.key) {
    if (typeof currentTypewriterContext !== 'undefined') currentTypewriterContext?.cancel?.();
    narrativeControls.key = key;
    narrativeControls.accelerated = false;
  }
  if (state?.narrativeControl) setNarrativeAcceleration(state.narrativeControl.accelerated);
  refreshNarrativeControls(state);
}

function beginNarrativeTyping(signal) {
  const writer = { key: narrativeControls.key };
  narrativeControls.writers.add(writer);
  refreshNarrativeControls();
  const finish = () => {
    narrativeControls.writers.delete(writer);
    signal?.removeEventListener('abort', finish);
    refreshNarrativeControls();
  };
  signal?.addEventListener('abort', finish, { once: true });
  return finish;
}

function narrativeTextSpeed() { return narrativeControls.accelerated ? 20 : 1; }

function installNarrativeControls() {
  document.getElementById('btnNarrativeSpeed')?.addEventListener('click', () => {
    if (!roomState || roomState.leaderId !== myId) return;
    const key = narrativeControls.key;
    socket.emit('narrative:accelerate', { key, accelerated: !narrativeControls.accelerated }, res => {
      if (!res?.success) return;
      if (res.key === narrativeControls.key) {
        roomState.narrativeControl = { key:res.key, accelerated:res.accelerated };
        setNarrativeAcceleration(res.accelerated);
      }
    });
  });
  socket.on('narrative:accelerated', data => {
    if (data?.key !== narrativeControls.key) return;
    if (roomState) roomState.narrativeControl = data;
    setNarrativeAcceleration(data.accelerated);
  });
}
