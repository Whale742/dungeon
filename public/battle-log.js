// One keyed renderer shared by production and Lab; history remains server owned.
function updateBattleLogFade(container) {
  const lines=Array.from(container.children),bounds=container.getBoundingClientRect();
  const third=lines.at(-3)||lines[0];
  if(!third||!bounds.height)return;
  const clearTop=Math.min(bounds.height,third.getBoundingClientRect().top-bounds.top);
  const fadeTop=Math.min(bounds.height*.4,clearTop-24);
  lines.forEach((line,i)=>{
    const center=line.getBoundingClientRect().top-bounds.top+line.offsetHeight/2;
    const progress=i>=lines.length-3?0:Math.max(0,Math.min(1,(clearTop-center)/(clearTop-fadeTop)));
    const eased=i>=lines.length-3?0:.12+.88*progress*progress*(3-2*progress);
    line.style.setProperty('--log-opacity',String(1-eased*.985));
    line.style.setProperty('--log-blur',(eased*3).toFixed(2)+'px');
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
