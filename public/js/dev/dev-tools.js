export function mountDevTools(socket) {
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = '/css/dev/dev-tools.css'; document.head.append(style);
  const root = document.createElement('div');
  root.id = 'dungeon-dev-tools';
  root.innerHTML = `
    <button id="dev-toggle" hidden aria-controls="dev-drawer" aria-expanded="false">Dev</button>
    <aside id="dev-drawer" hidden aria-label="開發者控制面板">
      <header><strong>Dungeon Abyss · Dev</strong><button id="dev-close" aria-label="關閉開發者面板">×</button></header>
      <p id="dev-message" role="status" aria-live="polite"></p>
      <form id="dev-auth"><label>開發者通行碼<input id="dev-token" type="password" autocomplete="off" maxlength="1024" required></label><button>授權此連線</button></form>
      <div id="dev-controls" hidden>
        <section><h2>總覽</h2><pre id="dev-overview"></pre></section>
        <fieldset id="dev-mutations">
          <section><h2>事件</h2><p id="dev-event-info"></p><form data-command="encounter"><label>下一次合法路線遭遇<select name="type" id="dev-event-type"></select></label><label>指定精英／Boss<select name="enemyId" id="dev-boss"></select></label><label><input name="weakened" type="checkbox">負傷版本（僅指定精英／Boss）</label><button name="reserve">預約一次</button><button name="clear">取消預約</button><p>快捷預約：下一次選擇路線後，直接進入指定戰鬥。</p><button name="merchant">奸商戰鬥</button><button name="mimic">奇怪的寶箱戰鬥</button></form></section>
          <section><h2>資源</h2>
            <form data-command="gold"><label>金幣（0–1000000）<input name="value" type="number" value="100" min="-1000000" max="1000000" required></label><button name="set">設定</button><button name="add">增減</button></form>
            <form data-command="grant"><label>既有裝備模板<select name="item" id="dev-items"></select></label><label>發放背包<select name="bag"><option value="squad">小隊</option><option value="personal">角色</option></select></label><button>發放裝備</button></form>
            <form data-command="equip"><label>穿戴背包<select name="bag"><option value="squad">小隊</option><option value="personal">角色</option></select></label><label>欄位（從 1 開始）<input name="index" type="number" min="1" max="19" value="1" required></label><button>依正式規則穿戴</button></form>
            <pre id="dev-inventory"></pre>
          </section>
          <section><h2>角色</h2><label>指定角色<select id="dev-player"></select></label>
            <form data-command="hp"><label>目前 HP（1–最大 HP）<input name="value" type="number" min="1" value="1" required></label><button>設定 HP</button></form>
            <form data-command="shield"><label>增加本回合護盾（1–10000）<input name="value" type="number" min="1" max="10000" value="10" required></label><button>增加護盾</button></form>
            <form data-command="status"><label>基本狀態<select name="status"><option value="poison">中毒</option><option value="burn">燃燒</option><option value="fracture">碎裂</option><option value="chill">寒冷</option></select></label><button name="apply">施加正式效果</button><button name="clear">清除此狀態</button></form>
            <pre id="dev-role-info"></pre><p id="dev-role-policy"></p><form data-command="resource"><label>安全職業資源<select name="resource" id="dev-resource"></select></label><label>資源數值<input name="value" type="number" min="0" value="0" required></label><button>設定職業資源</button></form>
          </section>
          <section><h2>職業測試 → 下一次隨機結果</h2>
            <p id="dev-random-player"></p>
            <form data-command="random">
              <label>正式隨機判定<select name="skill" id="dev-random-skill"></select></label>
              <label>合法結果<select name="outcome" id="dev-random-outcome"></select></label>
              <p id="dev-random-hint"></p>
              <button name="reserve" id="dev-random-reserve">預約下一次</button><button name="clear" id="dev-random-clear">取消預約</button>
            </form>
            <p id="dev-random-pending" role="status"></p><p id="dev-random-last" role="status"></p>
          </section>
          <section><h2>戰鬥</h2><pre id="dev-enemies"></pre><form data-command="enemy"><label>指定存活敵人<select name="enemyId" id="dev-enemy"></select></label><label>敵人目前 HP（1–最大 HP）<input name="value" type="number" min="1" value="1" required></label><button>設定敵人 HP</button></form></section>
        </fieldset>
        <section><h2>系統</h2><p>單人測試；演出及操作提交後鎖定。通行碼僅授權目前連線。</p><button id="dev-refresh">更新權威狀態</button><details><summary>操作紀錄（最近 100 筆）</summary><pre id="dev-audit"></pre></details></section>
      </div>
    </aside>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  let state = null, status = null, busy = false, catalogLoaded = false;
  const eventLabels = { battle: '一般戰鬥', elite: '指定精英／Boss', shop: '一般商店', black_market: '奸商商店', chest: '一般寶箱（必定安全）', mimic_chest: '奇怪的寶箱（必定伏擊，需開箱）', ALTAR: '深淵祭壇', GAMBLE: '命運賭局', REFORGE: '重鑄工坊', WANDERING_MERCHANT: '流浪商人' };
  const message = value => { $('#dev-message').textContent = value || ''; };
  function syncEncounterInputs() {
    const elite = $('#dev-event-type').value === 'elite';
    $('#dev-boss').disabled = !elite;
    root.querySelector('[data-command="encounter"] [name="weakened"]').disabled = !elite;
  }
  $('#dev-event-type').addEventListener('change', syncEncounterInputs);
  function options(select, rows, key, label) {
    const selected = select.value;
    select.replaceChildren(...rows.map(row => new Option(label(row), row[key])));
    if (rows.some(r => r[key] === selected)) select.value = selected;
  }
  function render() {
    const active = socket.connected && state?.isDev === true && !['LOBBY', 'GAME_OVER', 'VICTORY'].includes(state.state) && state?.players?.some(p => p.id === socket.playerId);
    $('#dev-toggle').hidden = !active;
    if (!active) { close(); status = null; }
    $('#dev-auth').hidden = Boolean(status?.success);
    $('#dev-controls').hidden = !status?.success;
    if (!status?.success || !state) return;
    options($('#dev-player'), state.players, 'id', p => `${p.name} · ${p.role}`);
    if (!catalogLoaded) {
      options($('#dev-items'), status.equipment, 'id', e => `${e.name}${e.role ? ` (${e.role})` : ''}`);
      options($('#dev-event-type'), status.events.map(id => ({ id })), 'id', e => eventLabels[e.id] || e.id);
      options($('#dev-boss'), [{ id: '', name: '未指定' }, ...status.enemyTemplates], 'id', e => e.name);
      catalogLoaded = true;
    }
    $('#dev-overview').textContent = `房間 ${state.code || status.roomCode} · 樓層 ${state.floor}\n階段 ${state.state} / ${state.selectionState || ''}\n回合 ${state.battleRound} · 版本 ${status.context.revision}\n${status.locked ? '鎖定：' + status.reason : busy ? '操作中' : '可操作'}\n金幣 ${state.gold}`;
    $('#dev-mutations').disabled = busy || status.locked;
    for (const name of ['shield', 'status', 'enemy', 'resource']) for (const input of root.querySelectorAll(`[data-command="${name}"] input, [data-command="${name}"] select, [data-command="${name}"] button`)) input.disabled = state.state !== 'IN_BATTLE';
    syncEncounterInputs();
    $('#dev-event-info').textContent = status.encounter ? `已預約：${eventLabels[status.encounter.type] || status.encounter.type} ${status.enemyTemplates.find(e => e.id === status.encounter.enemyId)?.name || ''} ${status.encounter.weakened ? '負傷' : ''}` : '尚未預約；僅於下一次路線結算消耗一次。';
    options($('#dev-enemy'), (state.enemies || []).filter(e => e.hp > 0), 'instanceId', e => `${e.name} (${e.hp}/${e.maxHp})`);
    const p = state.players.find(p => p.id === $('#dev-player').value);
    const role = status.roles?.find(r => r.playerId === p?.id);
    renderRandom(p,role);
    options($('#dev-resource'), role?.resources || [], 'key', r => `${r.label}：${r.value} (${r.min}–${r.max})`);
    $('#dev-role-policy').textContent = role?.policy || '職業狀態唯讀';
    root.querySelector('[data-command="resource"]').hidden = !role?.resources.length;
    $('#dev-inventory').textContent = `小隊：${(state.squadInventory || []).map((i, n) => `${n + 1}.${i?.name || '空'}`).join('、')}\n角色：${(p?.bag || []).map((i, n) => `${n + 1}.${i?.name || '空'}`).join('、')}`;
    $('#dev-role-info').textContent = p ? `HP ${p.hp}/${p.maxHp} · 護盾 ${p.tempHp}\n冷卻 ${JSON.stringify(p.cooldowns)}\n職業資源 ${p.resourceSummary || ''}\nX ${p.sageX ?? '—'} · 運算元 ${p.sageOperand ?? '—'} · 演算 ${p.sagePhase ?? '—'}\n層數：戰士 ${p.warriorStacks ?? 0} · 鬥志 ${p.rage ?? 0} · 匿蹤 ${p.stealthStacks ?? 0}\n${p.role === 'augur' ? `觀測 ${p.observedTargetId || '自身'} · 牌象 ${p.augurCardState} · 命債 ${JSON.stringify(p.augurFateDebts)}\n` : ''}${JSON.stringify(p.statuses || [])}` : '';
    $('#dev-enemies').textContent = (state.enemies || []).map(e => `${e.instanceId}: ${e.name} HP ${e.hp}/${e.maxHp}`).join('\n');
    $('#dev-audit').textContent = JSON.stringify(status.audit, null, 2);
  }
  function renderRandom(p,role) {
    const selected=role?.random||[];
    options($('#dev-random-skill'),selected,'key',s=>`${s.label}（${s.category}）`);
    const skill=selected.find(s=>s.key===$('#dev-random-skill').value);
    options($('#dev-random-outcome'),skill?.outcomes||[],'value',o=>o.label);
    $('#dev-random-player').textContent=p?`目前玩家：${p.name} · ${p.role}（可於上方「指定角色」切換）`:'';
    $('#dev-random-hint').textContent=skill?.hint||(p?.role==='gladiator'?'此職業目前沒有獨立隨機戰鬥分支。':p?.role==='augur'?'諭示牌由真正的正／逆位感應判定產生，沒有獨立抽牌技能；目前不開放覆蓋他人判定。':'目前沒有可指定的隨機技能。');
    $('#dev-random-reserve').disabled=!p||p.hp<=0||!skill?.outcomes.length;
    const pending=status.roleRandom?.pending?.[p?.id],last=status.roleRandom?.last?.[p?.id];
    $('#dev-random-clear').disabled=!pending;
    $('#dev-random-pending').textContent=pending?`已預約：下一次${pending.label} → ${pending.outcomeLabel}（等待觸發）`:'尚未預約。每位玩家最多一項，重新預約會取代上一項。';
    $('#dev-random-last').textContent=last?`已消耗：${last.label} → ${last.outcomeLabel}（回合 ${last.round}；仍依正式抗性與效果條件結算）`:'尚無已消耗紀錄。';
  }
  function close() { $('#dev-drawer').hidden = true; $('#dev-toggle').setAttribute('aria-expanded', 'false'); $('#dev-token').value = ''; }
  function emit(event, data) {
    return new Promise((resolve, reject) => {
      const ack = (error, result) => error ? reject(new Error('連線逾時，請更新狀態；重試需沿用原請求識別碼')) : resolve(result);
      if (data === undefined) socket.timeout(5000).emit(event, ack);
      else socket.timeout(5000).emit(event, data, ack);
    });
  }
  async function refresh() { status = await emit('dev:inspect'); if (!status.success) message(status.message); render(); }
  $('#dev-toggle').onclick = async () => {
    $('#dev-drawer').hidden = false; $('#dev-toggle').setAttribute('aria-expanded', 'true');
    try { await refresh(); if (!status.success) $('#dev-token').focus(); } catch (e) { message(e.message); }
  };
  $('#dev-close').onclick = () => { close(); $('#dev-toggle').focus(); };
  // Keep drawer keyboard actions out of the game's document-level shortcuts.
  $('#dev-drawer').addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); $('#dev-toggle').focus(); }
  });
  $('#dev-auth').onsubmit = async event => {
    event.preventDefault();
    const pending = emit('dev:authorize', { token: $('#dev-token').value });
    $('#dev-token').value = '';
    try { const result = await pending; message(result.success ? '此連線已授權' : result.message); if (result.success) await refresh(); } catch (e) { message(e.message); }
  };
  $('#dev-refresh').onclick = () => refresh().catch(e => message(e.message));
  $('#dev-player').onchange = render;
  $('#dev-random-skill').onchange = () => {
    const p=state?.players.find(p=>p.id===$('#dev-player').value);
    renderRandom(p,status?.roles?.find(r=>r.playerId===p?.id));
  };
  root.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.dataset.command) return;
    event.preventDefault();
    if (busy || !status?.success || status.locked) return;
    const data = new FormData(form), playerId = $('#dev-player').value;
    let command, params;
    switch (form.dataset.command) {
      case 'gold': command = event.submitter?.name === 'add' ? 'gold.add' : 'gold.set'; params = { value: Number(data.get('value')) }; break;
      case 'grant': command = 'item.grant'; params = { playerId, itemId: data.get('item'), bag: data.get('bag') }; break;
      case 'equip': command = 'item.equip'; params = { playerId, bag: data.get('bag'), index: Number(data.get('index')) - 1 }; break;
      case 'hp': command = 'player.hp'; params = { playerId, value: Number(data.get('value')) }; break;
      case 'shield': command = 'player.shield'; params = { playerId, value: Number(data.get('value')) }; break;
      case 'status': command = 'player.status'; params = { playerId, status: data.get('status'), apply: event.submitter?.name !== 'clear' }; break;
      case 'encounter': {
        command = event.submitter?.name === 'clear' ? 'encounter.clear' : 'encounter.reserve';
        const shortcut = {merchant:'shady_merchant',mimic:'treasure_mimic'}[event.submitter?.name];
        const type = shortcut ? 'elite' : data.get('type');
        params = command === 'encounter.clear' ? {} : {type, enemyId:shortcut || (type === 'elite' ? data.get('enemyId') || '' : ''), weakened:!shortcut && type === 'elite' && data.has('weakened')};
        break;
      }
      case 'enemy': command = 'enemy.hp'; params = { enemyId: data.get('enemyId'), value: Number(data.get('value')) }; break;
      case 'resource': command = 'role.resource'; params = { playerId, resource: data.get('resource'), value: Number(data.get('value')) }; break;
      case 'random': command=event.submitter?.name==='clear'?'role.random.clear':'role.random.reserve'; params=command==='role.random.clear'?{playerId}:{playerId,skill:data.get('skill'),outcome:data.get('outcome')};break;
      default: return;
    }
    busy = true; render();
    try {
      const result = await emit('dev:command', { id: crypto.randomUUID(), roomCode: status.roomCode, context: status.context, command, params });
      message(result.success ? '操作成功，已同步伺服器狀態' : result.message);
      await refresh();
    } catch (e) { message(e.message); }
    finally { busy = false; render(); }
  });
  socket.on('room:update', value => { state = value; render(); });
  socket.on('dev:update', value => { status = value; render(); });
  socket.on('disconnect', () => { state = null; status = null; catalogLoaded = false; render(); message('連線已中斷，重新連線後必須再次授權'); });
  // The dynamic import can finish after the reconnect's first room:update.
  if (socket.connected) socket.emit('room:resync');
}
