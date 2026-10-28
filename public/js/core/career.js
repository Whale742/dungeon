(() => {
  const byId = id => document.getElementById(id);
  let epoch = 0, loading = false;
  const labels = { adventures: '參與冒險', battles: '參與戰鬥', wins: '戰鬥勝利', bosses: '首領擊敗',
    highestFloor: '歷史最高樓層', mostPlayedRole: '最常使用職業', damage: '造成傷害', healing: '有效治療' };
  const open = () => !byId('profileModal').classList.contains('hidden') && byId('profileModal').style.display !== 'none';
  function clear() { byId('careerTotals').replaceChildren(); byId('careerClasses').replaceChildren(); }
  function render(stats) {
    clear();
    for (const [key, label] of Object.entries(labels)) {
      const cell = document.createElement('div'), title = document.createElement('span'), value = document.createElement('strong');
      title.textContent = label;
      value.textContent = key === 'mostPlayedRole' ? (stats[key] ? classesData[stats[key]]?.name || stats[key] : '尚無紀錄')
        : Number(stats[key] || 0).toLocaleString('zh-TW');
      cell.appendChild(title); cell.appendChild(value); byId('careerTotals').appendChild(cell);
    }
    for (const [id, role] of Object.entries(classesData)) {
      const row = document.createElement('p'); row.textContent = `${role.name}：${Number(stats.classes?.[id] || 0).toLocaleString('zh-TW')} 場`;
      byId('careerClasses').appendChild(row);
    }
  }
  async function load() {
    if (loading) return;
    const playerId = PlayerIdentity.player?.playerId;
    clear();
    if (!playerId || !socket.connected) { byId('careerStatus').textContent = '請先登入或以訪客身分連線，再讀取生涯統計。'; return; }
    const token = ++epoch; loading = true; byId('btnRefreshCareer').disabled = true;
    byId('careerStatus').textContent = '正在讀取生涯統計…';
    try {
      const result = await new Promise((resolve, reject) => socket.timeout(20000).emit('player:career', {}, (error, reply) => {
        if (error || !reply?.success) reject(new Error(reply?.message || '讀取逾時，請稍後重試。')); else resolve(reply);
      }));
      if (token !== epoch || playerId !== PlayerIdentity.player?.playerId) return;
      render(result.stats);
      byId('careerStatus').textContent = result.pending ? '最近事件尚在同步，請稍後重新整理。'
        : result.durable ? '以永久玩家身分保存；改名、綁定帳號及讀檔不會清空紀錄。' : '本機測試紀錄，尚未保存至雲端。';
    } catch (error) { if (token === epoch) byId('careerStatus').textContent = error.message; }
    finally { if (token === epoch) { loading = false; byId('btnRefreshCareer').disabled = false; } }
  }
  const invalidate = () => { epoch++; loading = false; clear(); byId('btnRefreshCareer').disabled = false; };
  byId('btnRefreshCareer').addEventListener('click', () => { void load(); });
  socket.on('disconnect', () => { invalidate(); byId('careerStatus').textContent = '連線已中斷，請重新連線後讀取。'; });
  socket.on('player:identity', () => { invalidate(); if (open()) void load(); });
  socket.on('player:session_invalid', () => { invalidate(); byId('careerStatus').textContent = '請重新登入後讀取。'; });
  window.CareerProfile = { load };
})();
