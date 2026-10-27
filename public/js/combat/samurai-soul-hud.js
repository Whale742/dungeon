// Visuals extracted from samurai_soul_prototype; server snapshots alone own count.
const SamuraiSoulHud=(()=>{
 const SOURCE_SIZE=1254,SIZE=850,R=SIZE/SOURCE_SIZE,RELEASE_MS=1060,PIXELS=256;
 const paths={base:'/assets/combat-fx/samurai/soul/samurai_soul_base-256.webp',active:'/assets/combat-fx/samurai/soul/samurai_soul_active-256.webp',fx:'/assets/combat-fx/samurai/soul/samurai_soul_ready_fx-256.webp',masks:'/assets/combat-fx/samurai/soul/samurai_soul_masks-256.webp'};
 const align=[{dx:135,dy:-236,angle:132.5,scale:.610},{dx:275,dy:144,angle:228.5,scale:.596},{dx:-103,dy:298,angle:311.8,scale:.589},{dx:-271,dy:-75,angle:401.5,scale:.609}];
 const slotAnchors=[[760,393],[907,779],[522,925],[363,538]].map(([x,y])=>[x*R,y*R]);
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)},rand=(a,b)=>a+Math.random()*(b-a);
 const in3=x=>Math.pow(clamp(x,0,1),3),fract=n=>n-Math.floor(n),rnd=(n,seed=1)=>fract(Math.sin(n*127.1+seed*311.7)*43758.5453123);
 const instances=new Map();let assets;
 const surface=()=>{const c=document.createElement('canvas');c.width=c.height=PIXELS;return c;};
 function load(){return assets ||= Promise.all(Object.values(paths).map(async path=>{
  if(window.assetRegistry)return assetRegistry.preloadImage(path);
  const image=new Image();image.src=path;await image.decode();return image;
 })).then(([base,active,fx,masks])=>{
  const layers=align.map((a,i)=>{const c=surface(),g=c.getContext('2d');
   g.filter='brightness(1.55) saturate(2.45)';g.drawImage(base,0,0,PIXELS,PIXELS);g.filter='none';
   g.save();g.translate((627+a.dx)*PIXELS/1254,(627+a.dy)*PIXELS/1254);g.rotate(a.angle*Math.PI/180);g.scale(a.scale,a.scale);g.globalAlpha=.99;g.drawImage(active,-PIXELS/2,-PIXELS/2,PIXELS,PIXELS);g.restore();
   g.globalCompositeOperation='destination-in';g.drawImage(masks,i*256,0,256,256,0,0,PIXELS,PIXELS);return c;
  });return {base,active,fx,masks,layers};
 }).catch(error=>{assets=null;throw error;});}
 function create(host,{speed=1,reducedMotion=false}={}){
 const clockStart=performance.now(),clock=now=>clockStart+(now-clockStart)*speed;
 const widget=document.createElement('span');widget.className='samurai-soul-hud';widget.setAttribute('role','img');
 const canvas=surface(),number=document.createElement('span');number.className='samurai-soul-number';widget.append(canvas,number);host.appendChild(widget);host.classList.add('samurai-soul-host');
 const ctx=canvas.getContext('2d',{alpha:true}),staticLayer=surface(),staticCtx=staticLayer.getContext('2d');
 const state={count:0,resonance:0,reduced:reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches,particles:true,burst:[],pulse:null,slash:null,chargeStream:null,release:null,drain:null,loaded:false,images:{},fxStrength:1};
 let raf=0,last=0,changeAt=0,disposed=false,visible=false,renderCount=0,initialized=false;
 function particlesAt(x,y,kind='charge',amt=12){if(state.reduced)return;for(let i=0;i<amt;i++){const a=rand(0,Math.PI*2),sp=kind==='release'?rand(50,230):rand(25,110);state.burst.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-rand(10,70),age:0,life:rand(.36,1.05),w:rand(1,4.2),kind,rot:rand(0,6)});}state.burst=state.burst.slice(-16);}
 function cache(){if(!state.loaded)return;staticCtx.clearRect(0,0,PIXELS,PIXELS);staticCtx.drawImage(state.images.base,0,0,PIXELS,PIXELS);for(let i=0;i<Math.min(4,state.count);i++)staticCtx.drawImage(state.images.layers[i],0,0);}
 function update(player){
  const next=Math.max(0,Math.trunc(Number(player.soul)||0)),prev=state.count;state.count=next;
  number.textContent=String(next);widget.dataset.count=String(next);widget.setAttribute('aria-label','武魂 '+next);widget.classList.toggle('is-ready',next>=4);widget.classList.toggle('is-dead',player.hp<=0);
  // Mounting an existing snapshot is not a new gain. In particular, rebuilding
  // a Lab portrait at 8/12/24 souls must not restart or stack resonance effects.
  if(!initialized){initialized=true;state.resonance=next>=4?1:0;cache();wake();return;}
  if(next!==prev&&!(next>4&&prev>=4)){const now=clock(performance.now());changeAt=now;state.burst=[];state.release=null;state.drain=null;state.slash=null;state.chargeStream=null;
   const slot=Math.min(3,Math.max(0,next-1)),anchor=slotAnchors[slot];
   const type=next<prev?'release':prev<4&&next>=4?'resonance':'charge';
   state.pulse={type,from:now,anchor:type==='charge'?anchor:[SIZE/2,SIZE/2]};
   if(type==='charge'||type==='resonance')state.chargeStream={start:now,anchor};
   if(type==='release'){state.release={start:now};state.slash={start:now};}
   particlesAt(...(type==='charge'?anchor:[SIZE/2,SIZE/2]),type);
   for(const a of widget.getAnimations())a.cancel();
   if(!state.reduced)widget.animate([{scale:1,filter:'brightness(1)'},{scale:next<prev?.94:1.08,filter:'brightness(1.4)',offset:.35},{scale:1,filter:'brightness(1)'}],{duration:(type==='resonance'?620:420)/speed});
   cache();
  }wake();
 }
 function release(){const now=clock(performance.now());changeAt=now;state.release={start:now,cleared:false};state.slash={start:now};state.chargeStream=null;state.pulse={type:'release',from:now,anchor:[SIZE/2,SIZE/2]};particlesAt(SIZE/2,SIZE/2,'charge',8);widget.dataset.effect='release';wake();}
 // Presentation-only depletion. Keep the authoritative count untouched so the
 // banner cannot consume resources or change the confirmed number of cuts.
 function drain(){const duration=state.reduced?1:80;changeAt=clock(performance.now());state.drain={start:changeAt,duration,from:state.count,completed:true};state.release=null;state.slash=null;state.pulse=null;widget.dataset.effect='empty';widget.classList.remove('is-ready');number.textContent='0';wake();return duration;}
 function finishDrain(){if(!state.drain||disposed)return;state.drain.completed=true;widget.dataset.effect='empty';widget.classList.remove('is-ready');number.textContent='0';ctx.setTransform(PIXELS/SIZE,0,0,PIXELS/SIZE,0,0);render(state.drain.start+state.drain.duration,0);}
 function tick(now){raf=0;if(disposed||!visible||document.hidden||widget.classList.contains('is-dead'))return;now=clock(now);
  const transient=now-changeAt<1100||state.burst.length>0;if(last&&now-last<(transient?15:33)){raf=requestAnimationFrame(tick);return;}
  const dt=last?Math.max(0,now-last):16;last=now;
  if(state.release&&!state.release.cleared&&now-state.release.start>=RELEASE_MS*.48){state.release.cleared=true;state.drain={start:now,duration:1,from:state.count,completed:true};widget.dataset.effect='empty';widget.classList.remove('is-ready');number.textContent='0';particlesAt(SIZE/2,SIZE/2,'release');}
  state.resonance=lerp(state.resonance,state.count>=4&&!state.drain?1:0,1-Math.exp(-dt/195));
  ctx.setTransform(PIXELS/SIZE,0,0,PIXELS/SIZE,0,0);render(now,dt);renderCount++;
  if(state.count>=4&&!state.drain&&!state.reduced||now-changeAt<1100||state.burst.length>0)raf=requestAnimationFrame(tick);
 }
 function wake(){if(!raf&&!disposed&&visible&&!document.hidden)raf=requestAnimationFrame(tick);}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=0;wake();}else{cancelAnimationFrame(raf);raf=0;}});observer.observe(widget);
 const visibility=()=>{cancelAnimationFrame(raf);raf=0;last=0;wake();};document.addEventListener('visibilitychange',visibility);
 load().then(images=>{if(disposed)return;state.images=images;state.loaded=true;cache();last=0;wake();}).catch(error=>{widget.dataset.loadError=error.message;});
 function dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',visibility);for(const a of widget.getAnimations())a.cancel();state.burst=[];canvas.width=canvas.height=staticLayer.width=staticLayer.height=0;widget.remove();host.classList.remove('samurai-soul-host');instances.delete(host);}
 function drawChargeStream(time){
  const ev=state.chargeStream;if(!ev||state.reduced)return;
  const p=(time-ev.start)/480;
  if(p>=1){state.chargeStream=null;return}
  const [x,y]=ev.anchor,dx=x-SIZE/2,dy=y-SIZE/2;
  const fromX=x+dx*.65,fromY=y+dy*.65;
  const toX=lerp(fromX,x,smooth(p)),toY=lerp(fromY,y,smooth(p));
  const alpha=Math.pow(1-p,.65)*.58;
  ctx.save();ctx.globalAlpha=alpha;
  ctx.lineCap='round';ctx.shadowColor='#84d6ff';ctx.shadowBlur=12;
  ctx.beginPath();ctx.moveTo(fromX,fromY);
  ctx.quadraticCurveTo((fromX+toX)*.5+20*Math.sin(p*3),(fromY+toY)*.5-24,toX,toY);
  ctx.lineWidth=6.5*Math.sin((.15+p*.85)*Math.PI);ctx.strokeStyle='#61b9e5';ctx.stroke();
  ctx.globalAlpha=alpha*.68;ctx.lineWidth=1.6;ctx.strokeStyle='#d6f8ff';ctx.shadowBlur=0;ctx.stroke();ctx.restore();
 }
 function drawReleaseInward(time){
  const release=state.release;if(!release||state.reduced)return;
  const p=(time-release.start)/RELEASE_MS;
  if(p<0||p>.36)return;
  const q=p/.32;
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  for(let i=0;i<32;i++){
   const local=clamp((q-rnd(i,9)*.19)/.81,0,1),theta=rnd(i+20,9)*Math.PI*2;
   const radius=(SIZE*.27+rnd(i+41,9)*SIZE*.21)*(1-in3(local));
   const x=SIZE/2+Math.cos(theta)*radius,y=SIZE/2+Math.sin(theta)*radius*.8;
   const len=(20+44*local);ctx.globalAlpha=Math.sin(Math.PI*local)*.72;
   ctx.strokeStyle=i%4?'#7dd7ff':'#e7fbff';ctx.lineWidth=i%5?5.2:8.6;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(theta)*len,y+Math.sin(theta)*len*.8);ctx.stroke();
  }
  for(let i=0;i<4;i++){
   const [x,y]=slotAnchors[i];
   const r=clamp((q-i*.035)/.895,0,1),f=in3(r);
   const tx=lerp(x,SIZE/2,f)+Math.sin(r*Math.PI)*(i-1.5)*28,ty=lerp(y,SIZE/2,f);
   const prev=clamp(r-.045,0,1),fp=in3(prev),px=lerp(x,SIZE/2,fp)+Math.sin(prev*Math.PI)*(i-1.5)*28,py=lerp(y,SIZE/2,fp);
   ctx.globalAlpha=(1-clamp((r-.9)/.1,0,1))*.85;ctx.strokeStyle='#a4e8ff';ctx.lineWidth=7.5;ctx.shadowColor='#45baff';ctx.shadowBlur=12;
   ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(tx,ty);ctx.stroke();
   ctx.shadowBlur=0;ctx.fillStyle='#e9ffff';ctx.fillRect(tx-6.5,ty-6.5,13,13);
  }
  ctx.restore();
 }
 function drawBurst(dt){
  if(state.reduced||!state.particles){state.burst.length=0;return}
  for(let i=state.burst.length-1;i>=0;i--){
   const p=state.burst[i];p.age+=dt/1000;
   if(p.age>=p.life){state.burst.splice(i,1);continue;}
   p.x+=p.vx*dt/1000;p.y+=p.vy*dt/1000;p.vy-=25*dt/1000;
   const life=1-p.age/p.life;
   const r=p.w*(.6+life*.4);
   ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot+p.age*1.4);
   ctx.globalAlpha=life*(p.kind==='release'?.85:.65);ctx.fillStyle=p.kind==='release'?'#d6faff':(i%3?'#67ccff':'#b8f0ff');
   ctx.shadowBlur=9;ctx.shadowColor='#63c2fb';
   ctx.beginPath();ctx.ellipse(0,0,r*.6,r*1.7,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
 }
 function render(time,dt){
  ctx.clearRect(0,0,SIZE,SIZE);
  if(!state.loaded)return;
  ctx.save();
  const depletion=state.drain?(state.drain.completed?1:clamp((time-state.drain.start)/state.drain.duration,0,1)):0;
  if(state.drain){
   ctx.drawImage(state.images.base,0,0,SIZE,SIZE);
   for(let i=0;i<Math.min(4,state.count);i++){ctx.globalAlpha=1-smooth((depletion-(3-i)*.12)/.64);ctx.drawImage(state.images.layers[i],0,0,SIZE,SIZE);}
   ctx.globalAlpha=1;number.textContent=String(Math.max(0,Math.ceil(state.drain.from*(1-smooth(depletion)))));
   if(depletion===1){widget.dataset.effect='empty';widget.classList.remove('is-ready');}
  }else ctx.drawImage(staticLayer,0,0,SIZE,SIZE);
  const strength=state.fxStrength;
  const res=state.resonance*(1-smooth(depletion));
  if(res>.001){
   const bloom=state.reduced?1:(.9+.1*Math.sin(time*.0015));
   ctx.globalAlpha=clamp(res*.30*strength*bloom,0,.85);
   ctx.drawImage(state.images.fx,0,0,SIZE,SIZE);
  }
  ctx.globalAlpha=1;
  if(state.pulse){
   const p=(time-state.pulse.from)/(state.reduced?160:670);
   if(p>1){state.pulse=null}
   else{
    const phase=state.pulse.type;
    const [x,y]=state.pulse.anchor;
    const rad=phase==='charge'?100:phase==='release'?205:190;
    const opacity=Math.sin(p*Math.PI)*(phase==='release'?.51:phase==='resonance'?.42:.30);
    const grad=ctx.createRadialGradient(x,y,0,x,y,rad*(.50+p*.9));
    grad.addColorStop(0,'rgba(184,243,255,'+(opacity*.70)+')');grad.addColorStop(.2,'rgba(104,209,255,'+(opacity*.36)+')');grad.addColorStop(1,'rgba(55,140,218,0)');
    ctx.fillStyle=grad;ctx.fillRect(0,0,SIZE,SIZE);
   }
  }
  if(state.slash){
   const p=(time-state.slash.start)/(state.reduced?180:RELEASE_MS);
   if(p>=1){state.slash=null}else if(p>.32&&p<.82){
    const q=(p-.32)/.50;
    const strength=Math.pow(Math.sin(q*Math.PI),.7)*.96;
    ctx.save();ctx.translate(SIZE/2,SIZE/2);ctx.rotate(-.42);
    // Irregular tapered brush strokes: sharp at both ends, bleeding into ink at the edges.
    function brushPath(width, shift=0, start=0, end=1, wave=0){
     const top=[],bottom=[],count=32;
     for(let i=0;i<=count;i++){
      const u=i/count,k=start+u*(end-start);
      const x=-385+770*k;
      const y=shift-x*.055+9*Math.sin(k*5.1+.3+wave)+3.7*Math.sin(k*19.5+wave);
      const taper=Math.pow(Math.sin(u*Math.PI),.64);
      const w=width*taper*(.82+.16*Math.sin(k*26+wave));
      top.push([x,y-w]);bottom.push([x,y+w]);
     }
     ctx.beginPath();ctx.moveTo(...top[0]);
     for(let i=1;i<top.length;i++)ctx.lineTo(...top[i]);
     for(let i=bottom.length-1;i>=0;i--)ctx.lineTo(...bottom[i]);
     ctx.closePath();
    }
    // Dark cobalt tail carries the watercolor character, never a constant-width neon beam.
    ctx.globalAlpha=strength*.31;ctx.fillStyle='#1b6aa2';ctx.shadowColor='#4f9ad0';ctx.shadowBlur=11;
    brushPath(17,4);ctx.fill();
    ctx.globalAlpha=strength*.76;ctx.shadowBlur=4;
    const main=ctx.createLinearGradient(-350,0,340,0);
    main.addColorStop(0,'#2874b7');main.addColorStop(.36,'#53aadb');
    main.addColorStop(.61,'#a6e2f3');main.addColorStop(1,'#3c86c6');
    ctx.fillStyle=main;brushPath(8,-1,0,1,.37);ctx.fill();
    ctx.globalAlpha=strength*.59;ctx.fillStyle='#c9f3ff';ctx.shadowBlur=0;
    brushPath(1.9,-5,.20,.72,.1);ctx.fill();
    // Detached ink fibers imply a swift blade tearing through wet pigment.
    ctx.globalAlpha=strength*.37;ctx.fillStyle='#5caee0';
    brushPath(3.5,14,.13,.44,1.1);ctx.fill();
    ctx.globalAlpha=strength*.23;brushPath(2.3,-17,.68,.94,2.1);ctx.fill();
    ctx.restore();
   }
  }
  drawChargeStream(time);drawReleaseInward(time);
  drawBurst(dt);

  ctx.restore();
 }


 return {update,release,drain,finishDrain,dispose,attached:()=>widget.parentElement===host,debug:()=>({count:state.count,displayCount:Number(number.textContent),particles:state.burst.length,frames:renderCount,raf:!!raf,loaded:state.loaded,releaseMs:state.release?clock(performance.now())-state.release.start:null,frameMs:state.release?last-state.release.start:null,slash:!!state.slash})};
 }
 function sync(player,host){if(!host)return;let instance=instances.get(host);if(instance&&!instance.attached()){instance.dispose();instance=null;}if(player.role!=='samurai'){instance?.dispose();return;}if(!instance){instance=create(host);instances.set(host,instance);}instance.update(player);}
 // Rebuilt portraits and removed battle views release their observers, RAF and canvases.
 new MutationObserver(()=>{for(const [host,instance] of instances)if(!host.isConnected||!host.querySelector('.samurai-soul-hud'))instance.dispose();}).observe(document.documentElement,{childList:true,subtree:true});
 function clear(){for(const instance of [...instances.values()])instance.dispose();}
 async function playRelease(step,context={}){
  if(step.sourceRole!=='samurai'||(step.actionId||step.skillId)!=='sa_tsubame'||step.outcome?.type==='invalid')return;
  const player=step.hpSnapshotBefore?.players?.find(p=>p.id===step.sourceId);
  if(!player||player.soul<4)return;
  try{await samuraiAbortable(load(),context.signal);}catch(error){if(error.name==='AbortError')throw error;console.warn('[Samurai soul prelude]',error);return;}if(context.signal?.aborted)return;
  const host=document.createElement('div');host.className='samurai-soul-release-stage';host.setAttribute('aria-hidden','true');document.body.appendChild(host);
  const instance=create(host,{speed:context.speed||1,reducedMotion:context.reducedMotion});instances.set(host,instance);instance.update(player);instance.release();
  context.onTiming?.('samurai_soul_release_start',{step});
  try{
   await waitForPresentation(RELEASE_MS,context.signal,context.speed||1);
   if(!instance.debug().displayCount)context.onTiming?.('samurai_soul_empty',{step});
   else{
    context.onTiming?.('samurai_soul_drain_start',{step});
    await waitForPresentation(instance.drain(),context.signal,context.speed||1);
    instance.finishDrain();context.onTiming?.('samurai_soul_empty',{step});
   }
   await waitForPresentation(140,context.signal,context.speed||1);
   context.onTiming?.('samurai_soul_release_complete',{step});
  }
  finally{instance.dispose();host.remove();}
 }
 window.addEventListener('pagehide',clear);
 return {sync,clear,playRelease,debug:()=>[...instances.values()].map(i=>i.debug())};
})();
