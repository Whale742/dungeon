// One keyed renderer shared by production and Lab; history remains server owned.
function renderRecentBattleLogs(container, history = []) {
  const recent=history.slice(-5), ids=new Set(recent.map((l,i)=>String(l.id??`${l.time}-${l.text}-${i}`)));
  for(const child of Array.from(container.children))if(!ids.has(child.dataset.logId))child.remove();
  recent.forEach((log,i)=>{
    const id=String(log.id??`${log.time}-${log.text}-${i}`);
    let line=Array.from(container.children).find(n=>n.dataset.logId===id);
    if(!line){line=document.createElement('div');line.className=`log-line ${log.type||'info'} log-new`;line.dataset.logId=id;
      line.textContent=`[${log.time||''}] ${String(log.text||'').replace(/\*\*/g,'')}`;line.title=String(log.text||'').replace(/\*\*/g,'');container.appendChild(line);
      line.addEventListener('animationend',()=>line.classList.remove('log-new'),{once:true});}
    line.style.setProperty('--log-opacity',String(1-(recent.length-1-i)*.2));
  });
}
