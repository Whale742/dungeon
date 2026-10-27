// Visuals extracted from samurai_soul_prototype; server snapshots alone own count.
const SamuraiSoulHud=(()=>{
 const SOURCE_SIZE=1254,SIZE=850,R=SIZE/SOURCE_SIZE,RELEASE_MS=1060,PIXELS=256;
 const paths={base:'/assets/combat-fx/samurai/soul/samurai_soul_base-256.webp',active:'/assets/combat-fx/samurai/soul/samurai_soul_active-256.webp',fx:'/assets/combat-fx/samurai/soul/samurai_soul_ready_fx-256.webp',masks:'/assets/combat-fx/samurai/soul/samurai_soul_masks-256.webp'};
 const align=[{dx:135,dy:-236,angle:132.5,scale:.610},{dx:275,dy:144,angle:228.5,scale:.596},{dx:-103,dy:298,angle:311.8,scale:.589},{dx:-271,dy:-75,angle:401.5,scale:.609}];
 const slotAnchors=[[760,393],[907,779],[522,925],[363,538]].map(([x,y])=>[x*R,y*R]);
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)},rand=(a,b)=>a+Math.random()*(b-a);
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
 function create(host){
 const widget=document.createElement('span');widget.className='samurai-soul-hud';widget.setAttribute('role','img');
 const canvas=surface(),number=document.createElement('span');number.className='samurai-soul-number';widget.append(canvas,number);host.appendChild(widget);host.classList.add('samurai-soul-host');
 const ctx=canvas.getContext('2d',{alpha:true}),staticLayer=surface(),staticCtx=staticLayer.getContext('2d'),ringLayer=surface(),ringCtx=ringLayer.getContext('2d');let ringStrength=-1;
 const state={count:0,resonance:0,overglow:0,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,particles:true,burst:[],pulse:null,slash:null,chargeStream:null,release:null,loaded:false,images:{},fxStrength:1};
 let raf=0,last=0,changeAt=0,disposed=false,visible=false,renderCount=0;
 function particlesAt(x,y,kind='charge',amt=8){if(state.reduced)return;for(let i=0;i<amt;i++){const a=rand(0,Math.PI*2),sp=rand(25,110);state.burst.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-rand(10,70),age:0,life:rand(.36,1.05),w:rand(1,4.2),kind,rot:rand(0,6)});}state.burst=state.burst.slice(-16);}
 function cache(){if(!state.loaded)return;staticCtx.clearRect(0,0,PIXELS,PIXELS);staticCtx.drawImage(state.images.base,0,0,PIXELS,PIXELS);for(let i=0;i<Math.min(4,state.count);i++)staticCtx.drawImage(state.images.layers[i],0,0);}
 function update(player){
  const next=Math.max(0,Math.trunc(Number(player.soul)||0)),prev=state.count;state.count=next;
  number.textContent=String(next);widget.dataset.count=String(next);widget.setAttribute('aria-label','武魂 '+next);widget.classList.toggle('is-ready',next>=4);widget.classList.toggle('is-dead',player.hp<=0);
  if(next!==prev){const now=performance.now();changeAt=now;state.burst=[];state.release=null;state.slash=null;state.chargeStream=null;
   const slot=Math.min(3,Math.max(0,next-1)),anchor=slotAnchors[slot];
   const type=next<prev?'release':prev<4&&next>=4?'resonance':next>4?'overflow':'charge';
   state.pulse={type,from:now,anchor:type==='charge'?anchor:[SIZE/2,SIZE/2]};
   if(type==='charge')state.chargeStream={start:now,anchor};
   if(type==='release'){state.release={start:now};state.slash={start:now};}
   particlesAt(...(type==='charge'?anchor:[SIZE/2,SIZE/2]),type);
   for(const a of widget.getAnimations())a.cancel();
   if(!state.reduced)widget.animate([{scale:1,filter:'brightness(1)'},{scale:next<prev?.94:1.08,filter:'brightness(1.4)',offset:.35},{scale:1,filter:'brightness(1)'}],{duration:type==='resonance'?620:420});
   cache();
  }wake();
 }
 function tick(now){raf=0;if(disposed||!visible||document.hidden||widget.classList.contains('is-dead'))return;
  const transient=now-changeAt<1100;if(last&&now-last<(transient?15:33)){raf=requestAnimationFrame(tick);return;}
  const dt=last?Math.min(65,now-last):16;last=now;
  state.resonance=lerp(state.resonance,state.count>=4?1:0,1-Math.exp(-dt/195));state.overglow=overflowFor(state.count);
  ctx.setTransform(PIXELS/SIZE,0,0,PIXELS/SIZE,0,0);render(now,dt);renderCount++;
  if(state.count>=4&&!state.reduced||transient)raf=requestAnimationFrame(tick);
 }
 function wake(){if(!raf&&!disposed&&visible&&!document.hidden)raf=requestAnimationFrame(tick);}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=0;wake();}else{cancelAnimationFrame(raf);raf=0;}});observer.observe(widget);
 const visibility=()=>{cancelAnimationFrame(raf);raf=0;last=0;wake();};document.addEventListener('visibilitychange',visibility);
 load().then(images=>{if(disposed)return;state.images=images;state.loaded=true;cache();last=0;wake();}).catch(error=>{widget.dataset.loadError=error.message;});
 function dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',visibility);for(const a of widget.getAnimations())a.cancel();state.burst=[];canvas.width=canvas.height=staticLayer.width=staticLayer.height=ringLayer.width=ringLayer.height=0;widget.remove();host.classList.remove('samurai-soul-host');instances.delete(host);}
 function drawRing(time,intensity){
  if(intensity<=0)return;
  if(ringStrength!==intensity){ringStrength=intensity;ringCtx.setTransform(1,0,0,1,0,0);ringCtx.clearRect(0,0,PIXELS,PIXELS);ringCtx.setTransform(PIXELS/SIZE,0,0,PIXELS/SIZE,0,0);paintRing(ringCtx,0,intensity);}
  ctx.save();ctx.translate(SIZE/2,SIZE/2);ctx.rotate(state.reduced?0:Math.sin(time*.00009)*.06);ctx.drawImage(ringLayer,-SIZE/2,-SIZE/2,SIZE,SIZE);ctx.restore();
 }
 function paintRing(ctx,time,intensity){
  if(intensity<=0)return;
  ctx.save();ctx.translate(SIZE/2,SIZE/2);
  // Broken, ink-brush arcs rather than a mechanical circular progress ring.
  // The strength is capped at 16 souls, while the numerical count stays exact.
  const t=state.reduced?0:time*.001;
  const pieces=intensity>.8?6:intensity>.52?5:intensity>.28?4:3;
  const anchors=[-.91,.32,1.51,2.75,4.01,5.34];
  for(let k=0;k<pieces;k++){
   const slow=t*(k%2?-.048:.06);
   const start=anchors[k]+slow+Math.sin(t*.14+k*2.5)*.055;
   const sweep=(.21+intensity*.41)*(k%2?.86:1.14);
   const radius=371+13*Math.sin(k*1.4+t*.25);
   const pts=[];
   for(let j=0;j<=27;j++){
    const q=j/27;
    const th=start+q*sweep;
    const wave=5.5*Math.sin(q*11.3+k*2.13+t*.37)+2.2*Math.sin(q*24+k+t*.19);
    const r=radius+wave+(q-.5)*15;
    pts.push([Math.cos(th)*r,Math.sin(th)*r]);
   }
   const factor=.72+.28*Math.sin(k*1.29+t*.6)**2;
   for(let j=0;j<pts.length-1;j++){
    const q=(j+.5)/(pts.length-1);
    const taper=Math.pow(Math.sin(q*Math.PI),.72);
    const alpha=intensity*factor*taper;
    if(alpha<.005)continue;
    const [x0,y0]=pts[j],[x1,y1]=pts[j+1];
    ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);
    // Wide soft ink. Its edge deliberately varies rather than remaining a precise band.
    ctx.globalAlpha=alpha*.19;
    ctx.lineWidth=(17+5*Math.sin(q*10+k))*taper;
    ctx.strokeStyle=k%2?'#347cab':'#20588d';ctx.lineCap='round';
    ctx.shadowColor='#4b9bcd';ctx.shadowBlur=16;ctx.stroke();
    // The water-brush filament, always incomplete and less bright than the main jade.
    ctx.globalAlpha=alpha*.68;ctx.lineWidth=(4.3+3.6*intensity)*taper;
    ctx.strokeStyle=k%2?'#60c3e7':'#4eaddc';ctx.shadowBlur=6;ctx.stroke();
    if(intensity>.45 && j%2===0){
     ctx.globalAlpha=alpha*.27;ctx.lineWidth=1.15*taper;ctx.strokeStyle='#d6f4ff';ctx.shadowBlur=0;ctx.stroke();
    }
   }
  }
  ctx.restore();
 }
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
  if(p<0||p>.48)return;
  const q=smooth(p/.48);
  ctx.save();ctx.lineCap='round';
  for(let i=0;i<4;i++){
   const [x,y]=slotAnchors[i];
   const tx=lerp(x,SIZE/2,q),ty=lerp(y,SIZE/2,q);
   ctx.beginPath();ctx.moveTo(x,y);
   ctx.quadraticCurveTo(lerp(x,SIZE/2,.48)+Math.sin(i*2)*24,lerp(y,SIZE/2,.48)-25,tx,ty);
   ctx.globalAlpha=Math.sin(p/.48*Math.PI)*.43;
   ctx.strokeStyle='#a8e9ff';ctx.lineWidth=2+3.5*q;ctx.shadowColor='#45baff';ctx.shadowBlur=14;ctx.stroke();
  }
  ctx.restore();
 }
 function drawBurst(dt){
  if(state.reduced||!state.particles){state.burst.length=0;return}
  for(let i=state.burst.length-1;i>=0;i--){
   const p=state.burst[i];p.age+=dt/1000;
   if(p.age>=p.life){state.burst.splice(i,1);continue;}
   p.x+=p.vx*dt/1000;p.y+=p.vy*dt/1000;p.vy-=(p.kind==='overflow'?15:25)*dt/1000;
   const life=1-p.age/p.life;
   const r=p.w*(.6+life*.4);
   ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot+p.age*1.4);
   ctx.globalAlpha=life*(p.kind==='release'?.85:.65);ctx.fillStyle=p.kind==='release'?'#d6faff':(i%3?'#67ccff':'#b8f0ff');
   ctx.shadowBlur=9;ctx.shadowColor='#63c2fb';
   ctx.beginPath();ctx.ellipse(0,0,r*.6,r*1.7,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
 }
 function drawAmbient(time,amount){
  if(state.reduced||!state.particles||amount<.1)return;
  // Small slow, irregular droplets (deterministic rather than spawning forever).
  const count=Math.min(8,16-state.burst.length);
  const t=time*.001;
  ctx.save();
  for(let i=0;i<count;i++){
   const seed=i*12.9898;
   const a=((seed*.618)%1)*Math.PI*2;
   const radius=345+29*Math.sin(seed*1.37+t*.21);
   const walk=(t*(.10+.03*(i%4))+(seed%4.1))*(i%2?1:-1);
   const x=SIZE/2+Math.cos(a+walk)*radius;
   const y=SIZE/2+Math.sin(a+walk)*radius-((t*.08+i*.37)%1)*23;
   const s=(2+(i%5)*.77)*amount;
   ctx.fillStyle=i%3?'#63b7ec':'#b2e7ff';ctx.globalAlpha=(.20+.28*Math.sin(t*.48+i*1.3)**2)*amount;
   ctx.beginPath();ctx.ellipse(x,y,s,s*1.7,Math.sin(a)*.7,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
 }
 function render(time,dt){
  ctx.clearRect(0,0,SIZE,SIZE);
  if(!state.loaded)return;
  ctx.save();ctx.drawImage(staticLayer,0,0,SIZE,SIZE);
  const strength=state.fxStrength;
  const res=state.resonance;
  if(res>.001){
   const bloom=state.reduced?1:(.9+.1*Math.sin(time*.0015));
   ctx.globalAlpha=clamp(res*(.30+.43*state.overglow)*strength*bloom,0,.85);
   ctx.drawImage(state.images.fx,0,0,SIZE,SIZE);
  }
  ctx.globalAlpha=1;
  // Overflow has capped intensity. Four is intentionally only a light resonance.
  const ring=state.overglow;
  if(ring>.001){
   // A second, incomplete soul-ink echo grows beyond the four fixed jade pieces.
   // It reuses the original FX art and stops increasing at 16 stacks.
   ctx.save();ctx.translate(SIZE/2,SIZE/2);
   ctx.rotate(state.reduced?0:Math.sin(time*.00009)*.06);
   const grow=1+.04*ring;
   ctx.scale(grow,grow);ctx.globalAlpha=clamp(ring*.28*strength,0,.35);
   ctx.drawImage(state.images.fx,-SIZE/2,-SIZE/2,SIZE,SIZE);
   ctx.restore();
   drawRing(time,ring*strength);drawAmbient(time,ring*strength);
  }
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
 function overflowFor(n){if(n<=4)return 0;if(n<8)return .16+(n-5)*.055;if(n<12)return .40+(n-8)*.065;if(n<16)return .71+(n-12)*.055;return 1}

 return {update,dispose,attached:()=>widget.parentElement===host,debug:()=>({count:state.count,particles:state.burst.length,frames:renderCount,raf:!!raf,loaded:state.loaded})};
 }
 function sync(player,host){if(!host)return;let instance=instances.get(host);if(instance&&!instance.attached()){instance.dispose();instance=null;}if(player.role!=='samurai'){instance?.dispose();return;}if(!instance){instance=create(host);instances.set(host,instance);}instance.update(player);}
 // Rebuilt portraits and removed battle views release their observers, RAF and canvases.
 new MutationObserver(()=>{for(const [host,instance] of instances)if(!host.isConnected||!host.querySelector('.samurai-soul-hud'))instance.dispose();}).observe(document.documentElement,{childList:true,subtree:true});
 function clear(){for(const instance of [...instances.values()])instance.dispose();}
 window.addEventListener('pagehide',clear);
 return {sync,clear,debug:()=>[...instances.values()].map(i=>i.debug())};
})();
