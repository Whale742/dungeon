// Application controls live outside the read-only playback surface.
(() => {
  const panel = document.createElement('aside');
  panel.id = 'spectatorJoinPanel'; panel.className = 'hidden kraft-sub-panel';
  panel.setAttribute('aria-live', 'polite'); document.body.append(panel);
  const apply = document.getElementById('btnApplyAdventure');
  let application = null, review = null;
  const send = (event, data) => socket.timeout(12000).emit(event, data, (error, result) => {
    if (error || !result?.success) showToast(result?.message || '連線逾時，請重新同步後重試。', 'warning', 5000);
  });
  const button = (text, click) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-secondary';
    b.textContent = text; b.addEventListener('click', click); return b;
  };
  function render(state = roomState) {
    const watching = !!state?.viewer?.spectator;
    apply.classList.toggle('hidden', !watching || state.state === 'LOBBY');
    const mine = application?.requests?.find(r => r.playerId === socket.playerId);
    apply.disabled = !!mine;
    panel.replaceChildren();
    let visible = false;
    const line = text => { const p = document.createElement('p'); p.textContent = text; panel.append(p); visible = true; };
    if (watching && mine) {
      const labels = { requested: '已送出申請，等待隊長審核。', approved_pending_checkpoint: '隊長已同意，等待下一次路線選擇。',
        choosing_role: '請在 60 秒內選擇職業；取消、離線或逾時會放棄本次加入。', ready: '職業已確認，等待其他申請者。', saving: '正在保存加入檢查點，完成前維持觀戰。' };
      line(labels[mine.status] || '正在同步申請。');
      if (mine.status === 'choosing_role') {
        const select = document.createElement('select'); select.setAttribute('aria-label', '加入冒險的職業');
        for (const [key, role] of Object.entries(classesData)) {
          if (state.players.some(p => p.role === key)) continue;
          const option = document.createElement('option'); option.value = key; option.textContent = role.name; select.append(option);
        }
        panel.append(select, button('確認職業', () => send('spectator:select_role', {
          requestId: mine.requestId, role: select.value, checkpoint: application.checkpoint
        })));
      }
      if (mine.status !== 'saving') panel.append(button('取消申請', () => send('spectator:cancel', { requestId: mine.requestId })));
    }
    if (!watching && state?.leaderId === socket.playerId) for (const r of review?.requests || []) {
      if (r.status !== 'requested') continue;
      line(`${r.name} 申請加入冒險`);
      for (const [text, approve] of [['同意', true], ['拒絕', false]]) panel.append(button(text, () =>
        send('spectator:review', { playerId: r.playerId, requestId: r.requestId, approve })));
    }
    if (!watching && state?.spectatorJoin?.waiting) line('等待新隊員選擇職業及保存檢查點（最多 60 秒選職）；完成後開放路線投票。');
    panel.classList.toggle('hidden', !visible);
  }
  apply.addEventListener('click', () => { closeBurgerMenu(); send('spectator:apply', {}); });
  socket.on('spectator:application', state => { application = state; render(); });
  socket.on('spectator:requests', state => { review = state; render(); });
  socket.on('room:update', render);
  for (const event of ['spectator:ended', 'spectator:promoted', 'disconnect']) socket.on(event, () => {
    application = null; review = null; panel.classList.add('hidden'); apply.classList.add('hidden');
  });
})();
