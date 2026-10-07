// Shared coordinates and lifecycle only. Timing, audio and results stay with the production queue.
const SKILL_STAGE = Object.freeze({ width:1440,height:810,actor:{x:260,y:430},target:{x:1170,y:430},center:{x:720,y:405} });
let sageHandAssets;
function preloadSageHands() {
  return sageHandAssets ||= Promise.all(['sage-snap-1.png','sage-snap-2.png'].map(file=>{
    const img=new Image();img.src='assets/'+file;return img.decode().then(()=>img);
  }));
}
function skillButterflySvg() {
  return `<svg viewBox="0 0 136 128" aria-hidden="true"><g class="skill-wing left">
          <path fill="#41484a" d="M68 64 L68 78 l-5.3 2.91 l1.92 12.44 l-.42 3.94 l-.7 2.82 l-1.97 3.94 l-5.07 2.95 l-7.18.15 l-9.29-2.54 l-5.49-4.22 l-3.38-5.63 l.84-7.46 l9.57-12.25 l-8.02 2.95 l-10.28.29 l-8.44-9.16 L8.24 55.83 l-3.23-9.29 l2.67-2.82 h7.74 l16.62 2.68 l18.16 7.18 l13.09 7.46 Z"/>
          <path d="M63.99 60.33s-5.77-5.21-17.46-10.14s-22.1-8.02-31.39-7.88s-10.7 2.25-11.12 3.94c-.42 1.69 1.24 7.02 3.1 10.28c2.25 3.94 10.7 17.6 13.66 21.82c2.55 3.65 4.31 7.7 9.85 9.01c6.15 1.45 13.66-1.69 13.66-1.69s-7.18 6.48-7.6 13.37c-.42 6.9 3.24 11.83 10.84 14.5s18.7 4.72 22.24-3.66c1.03-2.44.84-4.93.84-4.93s-2.56 7.31-6.48 8.02c-3.1.56-2.67-1.27-5.49-1.55c-2.82-.28-2.39 1.83-5.35 1.83c-2.27 0-1.55-1.83-3.94-3.1s-3.75.78-5.21-.42c-2.39-1.97-.14-2.96-1.13-4.5c-.99-1.55-3.26-2.02-3.8-3.94c-.99-3.52.99-6.19 3.1-9.29c2.11-3.1 5.91-7.6 8.87-9.71c2.96-2.11 17.53-9.06 17.53-9.06s.77-2.62-.35-2.48c-1.13.14-14.36 7.18-16.76 8.73c-2.39 1.55-12.74 6.91-20.27 5.21c-4.36-.99-12.23-14.87-15.41-19.19c-3.18-4.32-8.68-14.92-8.24-17.98c.41-2.82 5.21-3.38 12.53-2.53c7.32.84 13.8 3.1 22.95 6.9S62.73 62.73 64 62.73c1.26 0-.01-2.4-.01-2.4z" fill="#676f72"/>
          <path d="M54.84 93.7c-1.75-.87-7.04 4.08-7.04 6.48c0 1.57 1.13 4.22 3.52 3.52c2.4-.71 5.78-8.88 3.52-10z" fill="currentColor"/>
          <path d="M45.41 93.7c2.25 1.97 5.97-1.95 7.6-4.5c1.97-3.1 2.96-10.84 2.39-10.56c-.56.28-7.6 5.35-7.6 5.35s-5.34 7.13-2.39 9.71z" fill="currentColor"/>
          <path d="M56.11 103.27c0 2.46 2.67 4.22 5.35 3.8c1.4-.22 3.91-1.52 3.66-3.8c-.28-2.53-1.41-6.34-4.08-6.76c-2.68-.42-4.93 2.68-4.93 6.76z" fill="currentColor"/>
          <path d="M61.6 75.4s-6.49 10.66-4.5 15.91c1.55 4.08 5.77 3.38 9.43-3.52s4.36-11.26 4.36-11.26l-1.13-3.94l-8.16 2.81z" fill="currentColor"/>
          <path d="M29.13 75.58c-.2 2.15 1.69 4.88 7.32 4.41s12.3-3.79 14.08-4.6c3.28-1.5 6.29-2.72 6.29-4.22c0-1.69-3.75-2.25-8.82-2.72c-5.07-.47-8.82.47-13.05 2.82c-3.53 1.96-5.73 3.28-5.82 4.31z" fill="currentColor"/>
          <path d="M23.59 68.17c-.17 1.3 1.97 4.41 3.38 4.5c1.41.09 8.82-3.85 9.01-5.16c.19-1.31-1.69-3.38-3.19-3.75c-1.5-.38-9.01 3-9.2 4.41z" fill="currentColor"/>
          <path d="M32.79 53.81c-2.26 2.26.38 6.48 5.26 8.92c4.88 2.44 12.67 3.1 15.77 3.57c3.1.47 5.35.56 5.82-.38c1.01-2.01-6.48-5.73-13.42-9.01c-4.33-2.05-11.65-4.88-13.43-3.1z" fill="currentColor"/>
          <path d="M10.73 49.21c.28 2.82 7.79 2.1 7.88-.66c.1-2.72-8.16-2.15-7.88.66z" fill="currentColor"/>
          <path d="M15.61 55.78c1.17 1.95 6.01.19 4.41-2.35c-1.52-2.41-6.1-.46-4.41 2.35z" fill="currentColor"/>
          <path d="M20.87 63.57c.77 1.31 3.33 1.22 5.73.09c1.6-.75 3.7-2.29 3.28-4.13c-.47-2.06-4.32-2.35-6.85-1.13c-1.79.87-3.76 2.45-2.16 5.17z" fill="currentColor"/>
          <ellipse cx="20.74" cy="72.3" rx="1.87" ry="1.9" fill="#fcfdfa"/>
          <path d="M10 45.97c.83 1.11.18 2.35-.86 3.2c-1.03.85-2.45.83-3.16-.04s-.45-2.27.59-3.12c1.04-.85 2.62-1.14 3.43-.04z" fill="#fcfdfa"/>
          <path d="M16.74 60.88c1.42.28 1.81 1.53 1.62 2.74c-.19 1.22-1.28 2.06-2.44 1.88c-1.16-.18-1.95-1.31-1.77-2.53s1.19-2.36 2.59-2.09z" fill="#fcfdfa"/>
          <path d="M12.46 53.78c1.03 1.02.66 2.27-.17 3.18c-.83.91-2.2 1.01-3.07.21c-.87-.79-.9-2.17-.07-3.08c.83-.91 2.3-1.32 3.31-.31z" fill="#fcfdfa"/>
          <path d="M29.77 49.61c1.04.82.74 2.14-.02 3.2s-2.08 1.42-2.96.8s-.97-1.99-.21-3.06c.76-1.06 2.16-1.75 3.19-.94z" fill="#fcfdfa"/>
          <path d="M26.55 48.97c-.04 1.36-1.31 1.92-2.64 1.93c-1.33.02-2.42-.87-2.43-1.97c-.01-1.11 1.05-2.02 2.38-2.03c1.33-.02 2.73.72 2.69 2.07z" fill="#fcfdfa"/>
          <path d="M43.86 99.19c0 1.23-.78 2.22-2.01 2.22s-2.22-1-2.22-2.24c0-1.23.99-2.24 2.22-2.24s2.01 1.02 2.01 2.26z" fill="#fcfdfa"/>
          <path d="M47.59 107.07c-.8.95-2.44.81-3.28.11c-.83-.7-.86-2.04-.06-2.99s2.12-1.16 2.96-.46c.83.7 1.18 2.39.38 3.34z" fill="#fcfdfa"/>
        </g>
        <g class="skill-wing right">
          <path fill="#41484a" d="M68 64 L71.08 63.95 l4.69-9.39 l10.51-13.51 L99.8 31.1 l13.51-6.2 l7.28-.18 l1.83 2.81 l-3.1 14.22 l-4.93 20.98 l-3.09 5.06 l-7.32 4.09 L96.51 73 l7.61 3.52 l5.63 4.37 l3.23 4.5 v6.06 l-2.81 7.88 l-8.45 6.76 l-5.21 1.97 l-8.16-1.97 l-1.83-2.11 l-3.9-6.2 l-2.72-9.29 l-5.49-2.82 L68 78 Z"/>
          <path d="M72.58 62.02s-1.13-2.72.84-6.1s8.31-12.9 14.78-18.68c6.48-5.77 28.3-17.74 33.22-14.22c4.93 3.52-.42 17.36-1.55 22.1c-.98 4.13-2.25 17.41-7.04 22.95c-3.72 4.31-11.68 5.77-11.68 5.77s12.94 6.21 13.51 14.36c.7 10-10.98 21.42-19.71 21.12c-6.71-.23-8.45-5.35-8.45-5.35s6.19 3.52 8.73 2.82c2.53-.7.7-3.1 3.1-4.5s4.36 2.25 6.19.56s.42-3.24 1.69-4.93c1.27-1.69 3.1 0 4.22-1.55c1.13-1.55 0-3.66.56-5.07c.56-1.41 1.69-1.69 1.55-3.8c-.14-2.11-4.08-7.04-9.01-9.43s-10.28-3.52-14.64-4.36c-4.36-.84-15.63-1.6-15.63-1.6s-.99-2.3-.42-2.21c1.13.19 3.94.42 8.17.56c8.54.28 22.24 2.25 28.3-2.53s7.04-18.3 7.6-21.82s5.91-19.01 2.82-20.55c-3.1-1.55-18.34 4.61-26.7 11.07s-14.4 15.4-16.23 19.06c-1.83 3.66-4.22 6.33-4.22 6.33z" fill="#676f72"/>
          <path d="M71.01 83.91s-3.69 7.75-4.49 9.64c-1.13 2.67-1.17 9.34 1.83 10.42c2.14.77 2.67-2.96 2.67-2.96s.37-7.64.37-10.17c.01-2.53-.38-6.93-.38-6.93z" fill="currentColor"/>
          <path d="M73.85 75.12s7.04 8.17 9.15 9.71c2.11 1.55 5.77 5.91 10.56 2.67c4.79-3.24-8.17-14.08-9.29-14.92C83.14 71.74 73 71.6 73 71.6l.85 3.52z" fill="currentColor"/>
          <path d="M76.38 83s4.92 4.49 5.91 5.49c2.11 2.11 4.5 4.07 5.49 7.04c.56 1.69 1.41 4.22-.42 5.21c-1.51.81-3.4-1.39-4.08-2.11c-.69-.72-3.33-6.53-4.87-9.84c-.64-1.36-2.03-5.79-2.03-5.79z" fill="currentColor"/>
          <path d="M90.74 91.45c-1.13 1.52.32 6.76 1.83 7.74c2.82 1.83 6.19-1.41 6.19-2.96c.01-1.55-5.63-8.02-8.02-4.78z" fill="currentColor"/>
          <path d="M88.91 72.02s6.19 9.71 9.57 11.68s6.04 1.75 7.04 0c2.25-3.94-7.46-9.29-7.46-9.29l-9.15-2.39z" fill="currentColor"/>
          <path d="M96.65 87.22c-.84 1.83 2.67 7.18 5.07 7.18s3.26-3.39 3.1-4.5c-.28-1.97-6.73-5.8-8.17-2.68z" fill="currentColor"/>
          <path d="M95.2 43.49c-3.49-1.45-7.13.47-11.26 6.38s-6.38 10.04-4.6 11.54s10-6.16 11.73-7.51c2.53-1.97 7.98-8.82 4.13-10.41z" fill="currentColor"/>
          <path d="M88.16 60c2.32-1.32 9.1-.75 12.76-.94c2.44-.13 6.01.25 6.1 1.5c.19 2.53-.75 4.13-3.94 5.26s-10.7 1.31-15.49 1.41c-2.82.06-5.41.34-5.73-.94c-.18-.75 2.17-3.94 6.3-6.29z" fill="currentColor"/>
          <path d="M99.24 48.93c2.16.38 9.1.19 11.07-1.31c1.2-.92 1.88-4.79 0-5.63c-1.88-.84-7.23-.66-9.29.94c-1.27.97-3.62 5.68-1.78 6z" fill="currentColor"/>
          <path d="M109.47 31.29c-.36 2.21 3.19 2.16 4.79 1.69c1.6-.47 3.75-3 2.72-4.32c-1.04-1.32-7.05-.28-7.51 2.63z" fill="currentColor"/>
          <path d="M106.93 36.73c0 1.6 1.31 2.16 3.19 2.16s3.1-1.19 3.1-2.44c0-1.69-1.6-2.35-3.66-1.97c-1.57.28-2.63.94-2.63 2.25z" fill="currentColor"/>
          <path d="M94.36 56.16c0 1.2 3.38.84 8.26.84s6.01-.75 6.57-2.63c.56-1.88.38-3.1-2.53-3.19c-2.91-.09-8.63.19-10.32 1.41c-.77.55-1.98 2.63-1.98 3.57z" fill="currentColor"/>
          <ellipse transform="rotate(-33.726 95.108 38.234)" cx="95.11" cy="38.23" rx="2.75" ry="2.18" fill="#fcfdfa"/>
          <path d="M117.21 41.47c-.63-1.03-2.01-1.26-3.17-.28c-.79.66-1.44 2.24-.77 3.24c.67 1 2.14 1.12 3.1.35c1.18-.95 1.41-2.37.84-3.31z" fill="#fcfdfa"/>
          <path d="M104.33 35.13c-.67-1-2.47-1.12-3.73-.28s-2.21 2.41-1.2 3.94c.7 1.06 2.31 1.04 3.87.14c1.48-.84 1.73-2.79 1.06-3.8z" fill="#fcfdfa"/>
          <path d="M121.22 26.05c0 1.09-.7 2.18-2.18 1.97c-1.35-.19-1.97-.7-1.97-2.18c0-1.09 1.04-1.76 2.15-1.76s2 .88 2 1.97z" fill="#fcfdfa"/>
          <path d="M119.53 34.64c0 1.09-1.08 2.04-2.18 1.97c-1.06-.07-1.97-.7-1.97-2.18c0-1.09 1.07-1.9 2.18-1.9s1.97 1.02 1.97 2.11z" fill="#fcfdfa"/>
          <circle cx="113.79" cy="53.68" r="2.15" fill="#fcfdfa"/>
          <ellipse transform="rotate(-33.973 107.471 93.774)" cx="107.46" cy="93.77" rx="2.08" ry="1.76" fill="#fcfdfa"/>
          <ellipse transform="rotate(-33.973 109.79 87.148)" cx="109.78" cy="87.14" rx="2.08" ry="2" fill="#fcfdfa"/>
        </g>
        <g class="butterfly-body">
          <path d="M67.02 46.26s1.23-11.63 2.53-16.19c1.83-6.41 7.04-11.47 11.4-11.97c4.36-.49 3.8 2.89 1.13 4.29c-2.57 1.35-5.35.56-5.35.56s-3.59 2.62-4.79 8.02c-1.41 6.34-2.53 16.19-2.53 16.19l-2.39-.9z" fill="#676f72"/>
          <path d="M63.15 47.03s-4.77-9.69-9.92-15.84c-5.14-6.12-11.68-6.34-12.6-6.41c-.92-.07-4.79.56-4.79 2.39c0 2.46 3.4 2.9 5.35 2.53c2.25-.42 3.31-1.76 3.31-1.76s4.18 1.66 6.97 5c3.24 3.87 9.22 15.56 9.22 15.56l.42 1.55l2.04-3.02z" fill="#676f72"/>
          <path d="M72.41 58.68c.77-1.06 1.95-1.89 1.44-7.07c-.56-5.7-5.46-7.14-9.33-6.3c-3.14.68-7.57 3.63-5.17 10.73c2.12 6.31 9.29 4.36 9.29 4.36s2.99-.67 3.77-1.72z" fill="#41484a"/>
          <path d="M67.23 56.67c-2.19.61-3.83 1.97-3.94 4.36c-.14 3.1.56 4.93 1.41 7.88c.54 1.89 1.17 6.22 6.9 4.79c3.94-.99 3.52-4.65 3.38-7.32c-.14-2.69-.7-6.19-1.69-7.74c-.92-1.44-3.52-2.67-6.06-1.97z" fill="#303031"/>
          <path d="M72.54 47.42c.87 1.29.9 3.07-.24 3.83c-1.13.76-3 .22-3.87-1.07c-.87-1.29-.65-2.95.48-3.72c1.14-.76 2.76-.33 3.63.96z" fill="#303031"/>
          <path d="M63.3 51.58c-.42 1.5-1.86 2.58-3.17 2.21c-1.32-.37-2.01-2.03-1.6-3.53c.42-1.5 1.82-2.42 3.14-2.05s2.04 1.87 1.63 3.37z" fill="#303031"/>
          <path d="M74.06 71.24L67.79 73s1.94 8.4 2.67 11.54c.77 3.31 5.7 27.17 9.57 26.54c3.99-.65-2.67-25.34-3.31-28.02c-.6-2.57-2.66-11.82-2.66-11.82z" fill="#676f72"/>
          <path d="M73.43 82.51c1.85-.4 2.87-1.51 2.87-1.51l1.23 5.3s-.93.86-2.76 1.28c-2.02.47-3.59.11-3.59.11l-1.21-5.26c-.01-.01 1.48.5 3.46.08z" fill="#41484a"/>
          <path d="M67.79 73l6.26-1.76l.93 4.22s-1.65.83-2.99 1.11c-1.34.28-3.31.3-3.31.3L67.79 73z" fill="#41484a"/>
          <path d="M72.3 92.5s1.78.21 3.4-.14c1.62-.35 2.97-1.39 2.97-1.39l1.04 4.66s-1.54 1.09-2.95 1.35c-1.45.27-3.28.11-3.26.11l-1.2-4.59z" fill="#41484a"/>
        </g></svg>`;
}
async function withSkillPresentationStage(step,context,play) {
  const stage=getOrCreateCombatStage(),box=stage.getBoundingClientRect();
  const scale=Math.min(box.width/1440,box.height/810)||1;
  const root=document.createElement('div');root.className='skill-production-stage';
  const frame=document.createElement('div');frame.className='skill-production-frame';
  frame.style.transform=`translate(${(box.width-1440*scale)/2}px,${(box.height-810*scale)/2}px) scale(${scale})`;
  root.appendChild(frame);stage.appendChild(root);
  const parentSignal=context.signal||context.controller?.signal,controller=new AbortController();
  const relayAbort=()=>controller.abort();parentSignal?.addEventListener('abort',relayAbort,{once:true});
  if(parentSignal?.aborted)controller.abort();
  const signal=controller.signal;
  context.signal=signal;context.audioScope=createSfxPresentationScope({...context,signal});
  const reduced=context.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.dataset.reducedMotion=String(reduced);
  root.style.setProperty('--wing-period',(.23/(context.speed||1))+'s');
  const animations=new Set();let raf=0,rendererActive=false,activeTick=null;
  const wait=ms=>waitForPresentation(ms,signal,context.speed||1);
  const el=(tag,cls,html,parent=frame)=>{const n=document.createElement(tag);n.className=cls;if(html)n.innerHTML=html;parent.appendChild(n);return n;};
  const position=(node,x,y)=>{node.style.left=x+'px';node.style.top=y+'px';};
  const animate=(node,keys,ms,options={})=>{
    const a=node.animate(reduced?[keys[0],keys.at(-1)]:keys,{duration:(reduced?Math.min(ms,120):ms)/(context.speed||1),fill:'forwards',...options});
    animations.add(a);a.finished.then(()=>{},()=>{});return a;
  };
  // A single abortable RAF owner; callers may update precomputed paths or counters.
  const startRenderer=render=>{
    rendererActive=true;const start=performance.now();
    const draw=now=>{
      if(signal.aborted)return;
      try{render(Math.max(0,now-start)/1000*(context.speed||1));activeTick?.(now);}catch(error){controller.abort();throw error;}
      if(!signal.aborted)raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);
  };
  const tick=(ms,update)=>new Promise((resolve,reject)=>{
    const start=performance.now(),duration=(reduced?Math.min(ms,120):ms)/(context.speed||1);
    const finish=error=>{if(rendererActive)activeTick=null;else{cancelAnimationFrame(raf);raf=0;}signal?.removeEventListener('abort',stop);if(error)reject(error);else resolve();};
    const stop=()=>finish();
    const draw=now=>{if(signal?.aborted)return stop();const p=Math.max(0,Math.min(1,(now-start)/duration));try{update(p);}catch(error){finish(error);return;}if(p===1)stop();else if(!rendererActive)raf=requestAnimationFrame(draw);};
    signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();else if(rendererActive)activeTick=draw;else raf=requestAnimationFrame(draw);
  });
  const actor=el('div','skill-anchor skill-actor',getClassPortraitHtml(step.sourceRole,'presentation-support-image'));
  position(actor,SKILL_STAGE.actor.x,SKILL_STAGE.actor.y);
  const title=el('div','skill-production-title');title.textContent=step.skillName;
  const cards=new Map(),anchors=new Map();
  const allyIds=[...new Set((step.results||[]).map(r=>r.targetId).filter(id=>id!=='monster'&&id!==step.sourceId))];
  const addCard=(result,i)=>{
    if(cards.has(result.targetId))return cards.get(result.targetId);
    const card=createResultCard({...result,monsterName:step.monsterName,monsterAvatar:step.monsterAvatar});
    card._preparedNumbers=Array.from({length:8},()=>{const n=document.createElement('div');n.hidden=true;card.querySelector('.presentation-result-numbers').appendChild(n);return n;});
    const allyIndex=allyIds.indexOf(result.targetId),spacing=Math.min(155,1100/Math.max(1,allyIds.length));
    const p=result.targetId==='monster'?SKILL_STAGE.target:result.targetId===step.sourceId?SKILL_STAGE.actor:{x:720+(allyIndex-(allyIds.length-1)/2)*spacing,y:645};
    const wrapper=el('div','skill-anchor skill-target');position(wrapper,p.x,p.y);wrapper.appendChild(card);
    if(result.targetId!=='monster'&&result.targetId!==step.sourceId)wrapper.style.transform='translate(-50%,-50%) scale('+Math.min(.75,spacing/190)+')';
    if(result.targetId===step.sourceId)actor.style.opacity='0';cards.set(result.targetId,card);anchors.set(result.targetId,p);return card;
  };
  (step.results||[]).forEach(addCard);
  if(!cards.has(step.targetId)&&step.targetId&&step.targetId!=='all') {
    const target=step.targetId==='monster'?step.hpSnapshotBefore?.monster:step.hpSnapshotBefore?.players?.find(p=>p.id===step.targetId);
    if(target)addCard({targetId:step.targetId,targetBefore:target,kind:'status'},0);
  }
  // Declaration still needs the real monster anchor, without inventing a damage result.
  if(!cards.has('monster')&&step.actionId==='g_arena')addCard({targetId:'monster',targetBefore:step.hpSnapshotBefore?.monster||step.hpSnapshot?.monster||{},kind:'status'},0);
  const debug=(label,p)=>{if(context.mode!=='lab'||!context.showAnchors)return;const n=el('div','skill-debug-anchor');position(n,p.x,p.y);n.textContent=label;};
  debug('actor',SKILL_STAGE.actor);debug('target',SKILL_STAGE.target);debug('stage / reticle',SKILL_STAGE.center);
  const resolveResults=async()=>{
    for(const result of step.results||[]) {
      if(signal?.aborted)return;
      await presentCombatResult(result,cards.get(result.targetId),{...context,signal,sourceRole:step.sourceRole,direction:'right',suppressFx:true,prewarmed:true,motion:animate});
    }
    if(!signal?.aborted&&step.hpSnapshot&&typeof applyHpSnapshot==='function')applyHpSnapshot(step.hpSnapshot);
  };
  const stop=()=>{cancelAnimationFrame(raf);raf=0;for(const a of animations)a.cancel();animations.clear();root.remove();};
  signal?.addEventListener('abort',stop,{once:true});
  try {
    await Promise.all([...frame.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
    await presentationFrame(signal);await presentationFrame(signal);
    if(!signal.aborted){
      const profile=resolveCombatSfxProfile(step);if(profile.key&&!step.actionId?.endsWith('_result'))context.audioScope.play(profile.key);
      context.onTiming?.('cast_entry',{step});
      await play({root,frame,el,position,animate,tick,startRenderer,wait,actor,cards,anchors,debug,resolveResults,signal,reduced});
    }
    if(!signal?.aborted){await context.audioScope?.hold();context.onTiming?.('action_complete',{step});}
  } finally {parentSignal?.removeEventListener('abort',relayAbort);signal.removeEventListener('abort',stop);controller.abort();stop();}
}
// Warm the two local images before the first queued equation.
preloadSageHands().catch(()=>{});
