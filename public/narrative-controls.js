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

function isTypewriterEvent(state = typeof roomState !== 'undefined' ? roomState : null) {
  if (!state) return false;
  if (state.state === 'PROLOGUE') return false;
  if (narrativeControls.writers.size > 0) return true;
  if (['CHOOSING_ROUTE', 'ROUTE', 'TRANSITION', 'EVENT', 'BATTLE_VICTORY'].includes(state.state)) {
    return true;
  }
  if (state.state === 'IN_BATTLE') {
    if (typeof document !== 'undefined') {
      if (document.body?.classList?.contains('battle-intro-active') || document.querySelector?.('.boss-encounter-stage')) {
        return true;
      }
    }
  }
  return false;
}

function refreshNarrativeControls(state = typeof roomState !== 'undefined' ? roomState : null) {
  const panel = document.getElementById('narrativeControls');
  const skip = document.getElementById('btnSkipPrologue');
  const speed = document.getElementById('btnNarrativeSpeed');
  if (!panel || !skip || !speed) return;

  const leader = !!state && state.leaderId === (typeof myId !== 'undefined' ? myId : null);
  const opening = state?.state === 'PROLOGUE';
  const hasTypewriter = isTypewriterEvent(state);

  if (opening) {
    // 序章中只顯示跳過按鈕 (僅隊長可見)
    panel.classList.toggle('hidden', !leader);
    skip.classList.toggle('hidden', !leader);
    skip.textContent = '跳過 >';
    speed.classList.add('hidden');
    return;
  }

  // 序章以外，隱藏跳過按鈕
  skip.classList.add('hidden');

  if (!hasTypewriter) {
    // 沒有打字機特效的事件，隱藏加速按鈕與控制面版
    panel.classList.add('hidden');
    speed.classList.add('hidden');
    return;
  }

  // 有打字機特效的事件
  if (leader) {
    panel.classList.remove('hidden');
    speed.classList.remove('hidden');
    speed.disabled = false;
    speed.classList.remove('is-non-leader-status');
    speed.setAttribute('aria-pressed', String(narrativeControls.accelerated));
    speed.textContent = narrativeControls.accelerated ? '▶▶ 加速：開' : '▶▶ 加速：關';
  } else {
    // 非隊長玩家：在按鈕位置顯示「隊長已開啟加速中...」
    if (narrativeControls.accelerated) {
      panel.classList.remove('hidden');
      speed.classList.remove('hidden');
      speed.disabled = true;
      speed.classList.add('is-non-leader-status');
      speed.setAttribute('aria-pressed', 'true');
      speed.textContent = '隊長已開啟加速中...';
    } else {
      panel.classList.add('hidden');
      speed.classList.add('hidden');
    }
  }
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
    // 各事件共享加速效果：不在此重置 narrativeControls.accelerated
  }
  if (state?.narrativeControl && typeof state.narrativeControl.accelerated === 'boolean') {
    setNarrativeAcceleration(state.narrativeControl.accelerated);
  }
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
    const target = !narrativeControls.accelerated;
    socket.emit('narrative:accelerate', { key, accelerated: target }, res => {
      if (!res?.success) return;
      if (roomState) {
        if (!roomState.narrativeControl) roomState.narrativeControl = {};
        roomState.narrativeControl.accelerated = res.accelerated;
      }
      setNarrativeAcceleration(res.accelerated);
    });
  });
  socket.on('narrative:accelerated', data => {
    if (roomState) {
      if (!roomState.narrativeControl) roomState.narrativeControl = {};
      roomState.narrativeControl.accelerated = data?.accelerated;
    }
    setNarrativeAcceleration(data?.accelerated);
  });
}
