// One keyed renderer shared by production and Lab; history remains server owned.
function renderRecentBattleLogs(container, history = []) {
  const followNewest=container.scrollHeight-container.clientHeight-container.scrollTop<24;
  const recent=history, ids=new Set(recent.map((l,i)=>String(l.id??`${l.time}-${l.text}-${i}`)));
  for(const child of Array.from(container.children))if(!ids.has(child.dataset.logId))child.remove();
  recent.forEach((log,i)=>{
    const id=String(log.id??`${log.time}-${log.text}-${i}`);
    let line=Array.from(container.children).find(n=>n.dataset.logId===id);
    if(!line){line=document.createElement('div');line.className=`log-line ${log.type||'info'} log-new`;line.dataset.logId=id;
      line.textContent=`[${log.time||''}] ${String(log.text||'').replace(/\*\*/g,'')}`;line.title=String(log.text||'').replace(/\*\*/g,'');container.appendChild(line);
      line.addEventListener('animationend',()=>line.classList.remove('log-new'),{once:true});}
    const olderThanLatestThree=Math.max(0,recent.length-1-i-2);
    line.style.setProperty('--log-opacity',String(Math.max(.15,1-olderThanLatestThree*.2)));
  });
  if(followNewest)container.scrollTop=container.scrollHeight;
}
