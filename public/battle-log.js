// Keep the latest three entries clear; older entries gradually fade and blur.
function updateBattleLogFade(container) {
 const lines=Array.from(container.children);
 lines.forEach((line,i)=>{
  const depth=Math.max(0,lines.length-i-3);
  line.style.setProperty('--log-opacity',String(Math.max(.025,1-depth*.16)));
  line.style.setProperty('--log-blur',Math.min(5,depth*.65).toFixed(2)+'px');
 });
}
function renderRecentBattleLogs(container, history = []) {
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
    if(!line){line=document.createElement('div');line.className=`log-line ${log.type||'info'} log-new`;line.dataset.logId=id;
      line.textContent=`[${log.time||''}] ${String(log.text||'').replace(/\*\*/g,'')}`;line.title=String(log.text||'').replace(/\*\*/g,'');container.appendChild(line);
      line.addEventListener('animationend',()=>line.classList.remove('log-new'),{once:true});}
  });
  container.scrollTop=container.scrollHeight;
  updateBattleLogFade(container);
}
window.addEventListener('resize',()=>{
  document.querySelectorAll('[data-battle-log-stream]').forEach(container=>{
    container.scrollTop=container.scrollHeight;updateBattleLogFade(container);
  });
});
