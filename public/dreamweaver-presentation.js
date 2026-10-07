const DREAM_BUTTERFLY_COLORS=Object.freeze({butterfly:'#b397ed',mirror:'#b397ed',dissociate:'#ed6878',nightmare_weak:'#f4ad62',frenzy_backfire:'#8fdda8',dream_heal:'#b397ed',nightmare:'#ed6878',shallow:'#b397ed',deep:'#ed6878',horde:'#f4ad62',lone:'#8fdda8'});
async function revealDreamOutcomeButterfly(card,type,context) {
  const color=DREAM_BUTTERFLY_COLORS[type];if(!color)return;
  if(['dream_heal','nightmare'].includes(type))resultFloat(card,type==='dream_heal'?'美夢化生':'夢魘成真','is-status');
  const n=document.createElement('div');n.className='skill-outcome-butterfly';n.style.setProperty('--butterfly-color',color);n.innerHTML=skillButterflySvg();
  card.querySelector('.presentation-result-portrait').appendChild(n);
  const remove=()=>n.remove();context.signal?.addEventListener('abort',remove,{once:true});
  try {await waitForPresentation(1000,context.signal,context.speed||1);}finally{context.signal?.removeEventListener('abort',remove);remove();}
}
async function playDreamweaverPresentation(step,context) {
  return withSkillPresentationStage(step,context,async s=>{
    const {el,position,animate,tick,wait,signal}=s;
    if(step.actionId?.endsWith('_result')) {
      const reveal=el('div','skill-reveal');reveal.textContent=step.outcome?.label||step.skillName;
      animate(reveal,[{opacity:0},{opacity:1}],200);
      await Promise.all([...s.cards.values()].map(card=>revealDreamOutcomeButterfly(card,step.outcome?.type,context)));
      await s.resolveResults();await wait(250);return;
    }
    const butterflies=Array.from({length:4},()=>el('div','skill-butterfly',skillButterflySvg()));
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1440 810');svg.classList.add('skill-fx-layer','skill-dream-threads');s.frame.appendChild(svg);
    const threads=Array.from({length:3},()=>{const p=document.createElementNS(ns,'path');svg.appendChild(p);return p;});
    const basic=step.actionId==='basic';
    const targetId=basic?'monster':step.targetId||step.results?.[0]?.targetId||'monster';
    const target=s.anchors.get(targetId)||s.anchors.get('monster')||SKILL_STAGE.target;
    const cx=basic?target.x:720,cy=basic?target.y:385;
    // Cache all four trajectories and string shapes before any active frame.
    const frames=Array.from({length:121},(_,j)=>{
      const t=j/120*Math.PI*4;
      const points=Array.from({length:4},(_,i)=>{
        const a=t+(i%2)*Math.PI+(i<2?0:.65);
        return basic?{x:cx+Math.cos(a+i*.6)*145,y:cy+Math.sin(a+i*.6)*105}:{x:cx+Math.sin(a)*135,y:cy+(i<2?Math.sin(a*2)*58:Math.cos(a*1.5+Math.PI)*110)};
      });
      const strings=Array.from({length:3},(_,i)=>{
        if(basic){const angle=t*.18+i*Math.PI/3,cs=Math.cos(angle),sn=Math.sin(angle);const pts=Array.from({length:61},(_,k)=>{const a=k/60*Math.PI*3,r=45+k*1.7;return {x:cx+Math.cos(a)*r*cs-Math.sin(a)*r*.45*sn,y:cy+Math.cos(a)*r*sn+Math.sin(a)*r*.45*cs};});return pts.map((p,k)=>(k?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');}
        const p=points[i%2],q=points[2+i%2],sag=72+Math.sin(t+i)*14;
        return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}Q720 ${(cy+sag).toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      });return {points,strings};
    });
    await presentationFrame(signal);await presentationFrame(signal);
    butterflies.forEach((b,i)=>{position(b,SKILL_STAGE.actor.x,SKILL_STAGE.actor.y);const p=frames[0].points[i];animate(b,[{transform:'translate(0,0)'},{transform:`translate(${p.x-SKILL_STAGE.actor.x}px,${p.y-SKILL_STAGE.actor.y}px)`}],450);});
    await wait(450);butterflies.forEach((b,i)=>{b.getAnimations().forEach(a=>a.cancel());position(b,0,0);b.style.transform=`translate(${frames[0].points[i].x}px,${frames[0].points[i].y}px)`;});
    context.audioScope.play('magic_impact',{noHold:true});
    await tick(basic?1200:1850,p=>{const f=frames[Math.min(120,Math.floor(p*120))];butterflies.forEach((b,i)=>{b.style.transform=`translate(${f.points[i].x}px,${f.points[i].y}px) rotate(${i%2?18:-18}deg)`;});threads.forEach((path,i)=>path.setAttribute('d',f.strings[i]));});
    if(signal?.aborted)return;
    if(basic) {
      const hit=s.cards.get('monster')?.querySelector('.presentation-result-hit');
      svg.style.transformOrigin=target.x+'px '+target.y+'px';animate(svg,[{transform:'scale(1)'},{transform:'scale(.7)',offset:.55},{transform:'scale(.7)'}],280);
      threads.forEach(path=>{path.style.stroke='#fff4d3';animate(path,[{opacity:1},{opacity:0}],280);});
      if(hit)animate(hit,[{transform:'scale(1)'},{transform:'scale(.8)',offset:.35},{transform:'scale(1.07)',offset:.7},{transform:'scale(1)'}],480);
      butterflies.forEach((b,i)=>animate(b,[{opacity:1,transform:b.style.transform},{opacity:0,transform:b.style.transform+` translate(${i%2?150:-150}px,${i<2?-110:110}px) scale(.2)`}],350));
      await wait(480);await s.resolveResults();
    } else {
      butterflies.forEach((b,i)=>{const p=frames.at(-1).points[i];animate(b,[{opacity:1,transform:b.style.transform},{opacity:0,transform:`translate(${target.x}px,${target.y}px) scaleX(.08) scaleY(.3)`}],320);});
      animate(svg,[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.05)'}],320);svg.style.transformOrigin=target.x+'px '+target.y+'px';
      await wait(320);await s.resolveResults();
    }
    await wait(220);
  });
}
