// Full history remains readable when expanded.
function updateBattleLogFade(container) {
 for (const line of container.children) { line.style.setProperty('--log-opacity','1'); line.style.setProperty('--log-blur','0px'); }
}
let battleSummaryCursor = { scene: null, round: null, start: 0 };
function renderBattleRoundSummary(history = []) {
 const target = document.getElementById('battleRoundSummary');
 const state = (typeof roomState !== 'undefined' && roomState) || (typeof window !== 'undefined' && window.roomState);
 if (!target || !state) return;
 const scene = [state.code, state.floor, state.battleCount || state.currentHex?.id].join(':');
 const round = state.battleRound || 1;
 if (battleSummaryCursor.scene !== scene) {
   battleSummaryCursor = { scene, round, start: round === 1 ? 0 : Math.max(0, history.length - 8) };
 } else if (battleSummaryCursor.round !== round) {
   battleSummaryCursor = { scene, round, start: history.length };
 }
 const entries = history.slice(battleSummaryCursor.start).filter(log => log.type !== 'chat');
 const important = entries.filter(log => /damage|heal|buff|warning|combat|death/.test(log.type || ''));
 const selected = (important.length ? important : entries).slice(-4);
 target.replaceChildren();
 const heading = document.createElement('h3'); heading.textContent = '第 ' + round + ' 回合摘要'; target.append(heading);
 if (!selected.length) { const p = document.createElement('p'); p.textContent = '等待本回合戰況'; target.append(p); }
 for (const log of selected) { const p = document.createElement('p'); p.textContent = String(log.text || '').replace(/\*\*/g, '').replace(/\p{Extended_Pictographic}|[\uFE0F\u200D]/gu, ''); target.append(p); }
}
function renderRecentBattleLogs(container, history = []) {
  renderBattleRoundSummary(history);
  container.dataset.battleLogStream='true';
  if(!container._logScrollBound){
    container._logScrollBound=true;
    container.addEventListener('scroll',()=>updateBattleLogFade(container),{passive:true});
  }
  const recent=history, ids=new Set(recent.map((l,i)=>String(l.id??`${l.time}-${l.text}-${i}`)));
  for(const child of Array.from(container.children))if(!ids.has(child.dataset.logId))child.remove();
  recent.forEach((log,i)=>{
    const id=String(log.id??`${log.time}-${log.text}-${i}`);
    let line=Array.from(container.children).find(n=>n.dataset.logId===id);
    if(!line){
      line=document.createElement('div');
      const type = log.type || 'info';
      let tagClass = '';
      if (type === 'damage') tagClass = ' is-hit';
      else if (type === 'buff') tagClass = ' is-effect';
      else if (type === 'loot' || type === 'reward') tagClass = ' is-reward';
      line.className=`log-line feed-item ${type}${tagClass} log-new`;
      line.dataset.logId=id;
      const timeStr = log.time ? (String(log.time).startsWith('TURN') ? log.time : `TURN ${log.time}`) : 'TURN --';
      const cleanText = String(log.text || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      line.innerHTML = `<span class="feed-time">${timeStr}</span><div class="feed-msg">${cleanText}</div>`;
      line.title = String(log.text||'').replace(/\*\*/g,'');
      container.appendChild(line);
      line.addEventListener('animationend',()=>line.classList.remove('log-new'),{once:true});
    }
  });
  container.scrollTop=container.scrollHeight;
  updateBattleLogFade(container);
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('resize',()=>{
    document.querySelectorAll('[data-battle-log-stream]').forEach(container=>{
      container.scrollTop=container.scrollHeight;updateBattleLogFade(container);
    });
  });
}
