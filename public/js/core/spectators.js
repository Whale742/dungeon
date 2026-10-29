// Observer playback uses the production presentation queue. It owns no player
// record and sends no gameplay actions or presentation acknowledgements.
(() => {
  const byId = id => document.getElementById(id);
  const reads = new Set(['spectator:join', 'spectator:leave', 'spectator:apply', 'spectator:cancel', 'spectator:select_role', 'room:resync', 'room:list', 'player:career', 'player:rename', 'adventure:list']);
  let watching = false, code = null, busy = false, epoch = 0, overflowed = false, lastPresentation = 0;
  const inbox = [];
  const banner = document.createElement('aside'); banner.id = 'spectatorBanner'; banner.className = 'hidden';
  const label = document.createElement('span'), leave = document.createElement('button');
  leave.type = 'button'; leave.className = 'btn btn-secondary'; leave.textContent = '離開觀戰';
  banner.append(label, leave); document.body.appendChild(banner);
  function sync(state) {
    if (code !== state?.code) lastPresentation = 0;
    watching = !!state?.viewer?.spectator;
    document.body.classList.toggle('spectator-mode', watching); banner.classList.toggle('hidden', !watching);
    if (watching) {
      code = state.code; lastPresentation = Math.max(lastPresentation, state.battlePresentationId || 0);
      label.textContent = `觀戰中 · ${code} · 僅供觀看`;
    }
  }
  function render() {
    if (!watching) return;
    // Hide gameplay controls without changing the underlying renderer or the
    // identity of any formal player. Server authorization is independent.
    byId('playerActionCard')?.classList.add('hidden');
    byId('btnOpenInventory')?.classList.add('hidden');
    byId('btnEndBattle')?.classList.add('hidden');
    const goodsHint = document.querySelector('.shop-goods-col .shop-col-header small');
    if (goodsHint) goodsHint.textContent = '觀戰模式：僅供瀏覽公開商品';
  }
  async function pump() {
    if (busy) return;
    busy = true; const token = epoch;
    try {
      while (inbox.length && token === epoch && watching) {
        const item = inbox.shift();
        if (item.state) receiveRoomState(item.state);
        else {
          const p = item.packet;
          // Each public queue includes its own safe authoritative boundary, so
          // queued round-start effects never wait for an already-buffered update.
          if (p.spectatorState) receiveRoomState({ ...roomState, ...p.spectatorState });
          await runPresentationQueue(p.queue, p.round, p.monsterKilled, p.presentationId);
        }
      }
      if (overflowed) { inbox.length = 0; overflowed = false; socket.emit('room:resync'); }
    } catch (error) {
      if (token === epoch && watching) { inbox.length = 0; socket.emit('room:resync'); }
      console.error('[SpectatorPlayback]', error);
    } finally { busy = false; if (inbox.length && watching) void pump(); }
  }
  async function join() {
    const target = byId('spectatorCode').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(target)) { byId('spectatorJoinStatus').textContent = '請輸入 5 碼房間代碼'; return; }
    byId('btnSpectate').disabled = true;
    socket.timeout(10000).emit('spectator:join', { code: target }, (error, reply) => {
      byId('btnSpectate').disabled = false;
      byId('spectatorJoinStatus').textContent = error ? '加入觀戰逾時，請重試。' : reply?.success ? '' : reply?.message || '無法加入觀戰';
    });
  }
  function reset() {
    epoch++; inbox.length = 0; code = null; sync(null);
    combatQueueController?.abort(); battlePhaseController?.abort(); routePresentationController?.abort(); prologueController?.abort();
    trapPresentationController?.abort(); chestPresentationController?.abort(); victoryPresentationController?.abort();
    routeNarrativeDoneKey = null; routeInteractionReadyKey = null;
    operations.clear(); operationState = null; latestStateVersion = -1;
    presentationManager.clear(); BattleHud.reset();
    releaseBattleEncounterScene(); currentActiveStage = 'NONE';
    document.body.classList.remove('battle-intro-active');
    document.getElementById('app').inert = false;
    pendingAuthoritativeState = null; roomState = null; currentRoomCode = null;
    byId('playerActionCard')?.classList.remove('hidden');
    switchView('entry'); goToEntryScreen('screenLobbyMenu');
  }
  leave.addEventListener('click', () => socket.timeout(10000).emit('spectator:leave', (error, reply) => {
    if (error || !reply?.success) { showToast(reply?.message || '尚未離開觀戰，請重新連線後重試', 'warning'); return; }
    reset();
  }));
  byId('btnSpectate').addEventListener('click', join);
  socket.on('spectator:ended', () => { reset(); showToast('觀戰房間已關閉'); });
  socket.on('spectator:promoted', () => {
    reset(); showToast('已正式加入冒險，正在同步路線檢查點。', 'success', 5000);
    socket.emit('room:resync');
  });
  socket.on('connect', () => { if (code) socket.emit('spectator:join', { code }, result => { if (!result?.success) reset(); }); });
  socket.on('disconnect', () => { epoch++; inbox.length = 0; combatQueueController?.abort(); });
  socket.on('player:session_invalid', () => { if (watching) reset(); });
  document.addEventListener('click', event => {
    if (!watching || !event.target.closest('.view-panel:not(#viewEntry), #inventoryModal, #equipDropModal')) return;
    if (event.target.closest('button, input, select, [draggable="true"]')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('dragstart', event => {
    if (watching && event.target.closest('.view-panel, #inventoryModal')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  window.SpectatorView = { isWatching: () => watching, canSend: event => reads.has(event), sync, render,
    receiveState(state) { if (watching && busy) { if (inbox.length < 128) inbox.push({ state }); else overflowed = true; return true; } return false; },
    queue(packet) {
      if (!watching || !Number.isSafeInteger(packet.presentationId) || packet.presentationId <= lastPresentation ||
          (packet.spectatorState?.code && packet.spectatorState.code !== code)) return;
      lastPresentation = packet.presentationId;
      if (inbox.length < 128) inbox.push({ packet }); else overflowed = true;
      void pump();
    } };
})();
