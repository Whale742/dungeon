// The directory is always server-authorized. Local preferences never grant
// membership and never supply a checkpoint or player ID to the server.
(() => {
  const byId = id => document.getElementById(id);
  const list = byId('adventureList'), status = byId('adventureListStatus');
  let epoch = 0, loading = false, restoring = false, nextOffset = 0;
  const entries = new Map();
  const invite = new URLSearchParams(location.search).get('adventure');
  const inviteId = /^[a-f0-9-]{36}$/i.test(invite || '') ? invite : null;
  const currentPlayer = () => PlayerIdentity.player?.playerId;
  const visible = () => !byId('screenAdventures').classList.contains('hidden');
  const request = (event, data) => new Promise((resolve, reject) => {
    if (!socket.connected) return reject(new Error('尚未連線，請稍後重試。'));
    socket.timeout(15000).emit(event, data, (error, reply) => {
      if (error) reject(new Error('連線逾時，請稍後重試。'));
      else if (!reply?.success) reject(Object.assign(new Error(reply?.message || '暫時無法接續冒險'), { code: reply?.code }));
      else resolve(reply);
    });
  });
  function notice(message) { status.textContent = message; }
  function render() {
    byId('btnBackFromAdventures').disabled = restoring;
    byId('btnAdventureProfile').disabled = restoring;
    byId('btnRefreshAdventures').disabled = loading || restoring;
    byId('btnMoreAdventures').disabled = loading || restoring;
    list.replaceChildren();
    for (const item of entries.values()) {
      const card = document.createElement('article'); card.className = 'adventure-card kraft-sub-panel';
      const title = document.createElement('h3'); title.textContent = item.name; card.appendChild(title);
      const detail = document.createElement('p');
      const savedAt = item.savedAt ? new Date(item.savedAt).toLocaleString('zh-TW') : '尚未建立檢查點';
      detail.textContent = `隊長：${item.leaderName} · ${item.memberCount} 人 · ${item.isLeader ? '你是隊長' : '正式隊員'}\n` +
        (item.checkpointFloor ? `保存樓層：第 ${item.checkpointFloor} 層 · ${savedAt}` : savedAt) + '\n' +
        (item.active ? `隊伍仍在冒險中，將接回目前進度${item.liveFloor ? `（第 ${item.liveFloor} 層）` : ''}。` : '從最後保存的路線檢查點恢復。');
      card.appendChild(detail);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'parchment-btn';
      button.textContent = item.active ? '接回隊伍' : '繼續冒險'; button.disabled = restoring;
      button.addEventListener('click', () => { void resume(item.id); }); card.appendChild(button);
      list.appendChild(card);
    }
    byId('btnJoinAdventureInvite').disabled = restoring;
  }
  async function load(more = false) {
    if (loading || restoring) return;
    const playerId = currentPlayer();
    if (!playerId) { notice('請先登入原本的帳號，或以目前訪客身分繼續。'); return; }
    const token = ++epoch; loading = true;
    byId('btnRefreshAdventures').disabled = true; byId('btnMoreAdventures').disabled = true;
    if (!more) { entries.clear(); nextOffset = 0; render(); byId('btnMoreAdventures').classList.add('hidden'); }
    notice('正在讀取你的冒險…');
    try {
      const reply = await request('adventure:list', { offset: more ? nextOffset : 0 });
      if (token !== epoch || playerId !== currentPlayer() || !visible()) return;
      reply.adventures.forEach(item => entries.set(item.id, item)); nextOffset = reply.nextOffset;
      render(); byId('btnMoreAdventures').classList.toggle('hidden', !reply.hasMore);
      notice(entries.size ? '' : '目前沒有可接續的冒險。可開始新的冒險；若曾使用其他帳號遊玩，請先登入該帳號。');
    } catch (error) { if (token === epoch && playerId === currentPlayer()) notice(error.message); }
    finally {
      if (token === epoch) { loading = false; byId('btnRefreshAdventures').disabled = false; byId('btnMoreAdventures').disabled = false; }
    }
  }
  async function resume(id) {
    if (restoring || !currentPlayer()) return;
    const token = ++epoch, playerId = currentPlayer();
    loading = false; restoring = true; render();
    recentAdventureRestoreEpoch++; clearTimeout(recentAdventureRestoreTimer);
    notice('正在接回冒險…');
    try {
      const reply = await request('adventure:restore', { adventureId: id });
      if (token !== epoch || playerId !== currentPlayer()) return;
      if (reply.restoredFromCheckpoint) showToast('已恢復最後保存的路線檢查點；其後尚未保存的戰鬥、購物或事件進度可能已遺失。', 'warning', 9000);
      // room:update supplies the authoritative screen and role, including when
      // another member already restored the room while this request was pending.
      notice('');
    } catch (error) { if (token === epoch && playerId === currentPlayer()) notice(error.message); }
    finally {
      if (token === epoch) { restoring = false; render(); byId('btnRefreshAdventures').disabled = false; byId('btnMoreAdventures').disabled = false; }
    }
  }
  function invalidate(clear = true) {
    epoch++; loading = false; restoring = false;
    byId('btnRefreshAdventures').disabled = false; byId('btnMoreAdventures').disabled = false;
    byId('btnBackFromAdventures').disabled = false; byId('btnAdventureProfile').disabled = false;
    if (clear) { entries.clear(); list.replaceChildren(); notice(''); byId('btnMoreAdventures').classList.add('hidden'); }
  }
  byId('btnContinueAdventure').addEventListener('click', () => {
    recentAdventureRestoreEpoch++; clearTimeout(recentAdventureRestoreTimer);
    switchView('entry'); goToEntryScreen('screenAdventures');
    byId('adventureInviteNotice').classList.toggle('hidden', !inviteId);
    void load();
  });
  byId('btnRefreshAdventures').addEventListener('click', () => { void load(); });
  byId('btnMoreAdventures').addEventListener('click', () => { void load(true); });
  byId('btnJoinAdventureInvite').addEventListener('click', () => { if (inviteId) void resume(inviteId); });
  byId('btnBackFromAdventures').addEventListener('click', () => { invalidate(); goToEntryScreen('screenLobbyMenu'); });
  byId('btnAdventureProfile').addEventListener('click', openProfileModal);
  byId('btnDetachAdventure').addEventListener('click', () => { closeBurgerMenu(); void exitRoomToLobbyMenu({ temporary: true }); });
  byId('btnCopyAdventureInvite').addEventListener('click', async () => {
    if (!roomState?.adventureId || roomState.leaderId !== myId) return;
    const url = new URL(location.origin); url.searchParams.set('adventure', roomState.adventureId);
    try { await navigator.clipboard.writeText(url.href); showToast('已複製邀請連結；原隊員登入後即可接回自己的角色。', 'success', 5000); }
    catch { showToast('無法複製連結，請使用房間代碼邀請原隊員。', 'warning', 5000); }
    closeBurgerMenu();
  });
  let leaderOptionsKey = null;
  socket.on('room:update', state => {
    const targets = (state.players || []).filter(p => p.id !== myId);
    const allowed = state.adventureId && state.leaderId === myId && !['LOBBY', 'GAME_OVER', 'VICTORY'].includes(state.state) && targets.length;
    byId('adventureLeadership').classList.toggle('hidden', !allowed);
    if (!allowed) return;
    const key = JSON.stringify(targets.map(p => [p.id, p.name, p.connected]));
    if (key === leaderOptionsKey) return;
    leaderOptionsKey = key;
    const select = byId('adventureLeaderTarget'), chosen = select.value; select.replaceChildren();
    targets.forEach(p => { const option = document.createElement('option'); option.value = p.id;
      option.textContent = p.name + (p.connected ? '' : '（離線）'); select.appendChild(option); });
    if (targets.some(p => p.id === chosen)) select.value = chosen;
  });
  byId('btnAdventureLeadership').addEventListener('click', () => {
    const target = roomState?.players?.find(p => p.id === byId('adventureLeaderTarget').value);
    if (!target || roomState.leaderId !== myId) return;
    closeBurgerMenu(); openTransferLeaderModal(target);
  });
  socket.on('player:identity', () => { invalidate(); if (visible()) void load(); });
  const hideManagement = () => ['btnDetachAdventure', 'btnCopyAdventureInvite', 'adventureLeadership'].forEach(id => byId(id).classList.add('hidden'));
  socket.on('disconnect', () => { invalidate(); hideManagement(); if (visible()) notice('連線已中斷，重新連線後可再次讀取。'); });
  socket.on('player:session_invalid', () => { invalidate(); hideManagement(); });
})();
