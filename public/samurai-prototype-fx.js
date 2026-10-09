// Drawing and motion transplanted from fixed_v4; see scripts/migrate-samurai-source.mjs.
function createSamuraiPrototypeRenderer(root,playerCard,bossCard,plan,context){
const clamp = (n,a=0,b=1) => Math.min(b,Math.max(a,n));
const lerp = (a,b,p) => a+(b-a)*p;
const out3 = x => 1-Math.pow(1-clamp(x),3);
const in3 = x => Math.pow(clamp(x),3);
const smooth = x => { x=clamp(x);return x*x*(3-2*x); };
const fract = n => n-Math.floor(n);
const rnd = (n,seed=1) => fract(Math.sin(n*127.1+seed*311.7)*43758.5453123);
const round = n => Math.round((n+Number.EPSILON)*10)/10;
const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
const age = (t,start) => t-start;
const envelope = (t,start,attack,hold,release) => {
  const d=t-start;
  if(d<0 || d>attack+hold+release)return 0;
  if(d<attack)return out3(d/attack);
  if(d<attack+hold)return 1;
  return 1-smooth((d-attack-hold)/release);
};
const finite = (value,fallback,min=0,max=100000) => {
  const n=Number(value);return Number.isFinite(n)?clamp(n,min,max):fallback;
};
const T={damageReduction:'減傷 50%',blocked:'格擋',soulGainText:'武魂 +',guardBuffText:'狂刀機率 +30%'};
const state={plan,disposed:false,shake:!context.reducedMotion,flash:true};
const world=document.createElement('div');world.className='samurai-world';root.appendChild(world);
const dom={world};
const node=(id,cls,parent=world,tag='div')=>{const el=document.createElement(tag);el.className='samurai-'+cls;parent.appendChild(el);dom[id]=el;return el;};
const player=node('player','position samurai-player');
const playerVisual=node('playerVisual','motion',player);playerCard.classList.add('samurai-card');playerVisual.appendChild(playerCard);
dom.playerHit=playerCard.querySelector('.presentation-result-hit');
const boss=node('bossPosition','position samurai-boss');bossCard.classList.add('samurai-card');boss.appendChild(bossCard);
dom.bossVisual=bossCard.querySelector('.presentation-result-hit');
const playerPortrait=playerCard.querySelector('.presentation-result-portrait'),bossPortrait=bossCard.querySelector('.presentation-result-portrait');
node('playerEcho','shadow-silhouette',playerVisual).style.backgroundImage=`url("${playerPortrait.querySelector('img')?.src||''}")`;
node('playerFlare','portrait-flare',playerPortrait);node('bossFlare','portrait-flare',bossPortrait);
node('sceneDimmer','scene-dimmer');node('focusAura','focus-aura');
const canvas=node('vfx','vfx',world,'canvas'),ctx=canvas.getContext('2d',{alpha:true});
const damageLayer=node('damageLayer','damage-layer');
const eye=node('eyeCutin','eye-cutin'),art=node('eyeArt','eye-art',eye);
function imageNode(id,cls,src,parent){const img=node(id,cls,parent,'img');const target=typeof window!=='undefined'&&window.assetRegistry?window.assetRegistry.resolvePath(src):src;img.src=target;img.dataset.studioOriginal=src;img.dataset.studioResolved=target;img.alt='';img.draggable=false;return img;}
imageNode('eyeClosed','eye-closed','/assets/samurai-eye.png',art);
imageNode('eyeOpen','eye-open','/assets/samurai-eye.png',art);
node('eyeFlare','eye-flare',art);node('eyeSweep','eye-sweep',art);
node('pupilLeft','eye-pupil samurai-left',art);node('pupilRight','eye-pupil samurai-right',art);
node('eyeRule','eye-rule',eye);node('eyeCaption','eye-caption',eye).textContent='秘劍 • 燕返';
node('screenFlash','screen-flash');node('screenSlice','screen-slice');
const zan=node('zanOverlay','zan-overlay');
imageNode('zanFull','zan-mark samurai-zan-full','/assets/samurai-fx/zan-full.png',zan);
imageNode('zanSplit','zan-mark samurai-zan-split','/assets/samurai-fx/zan-split.png',zan);
node('zanSlash','zan-slash',zan);
imageNode('titleImage','title-image','/assets/samurai-fx/swallow-title.png',node('swallowTitleIcon','swallow-title-icon'));
node('guardTag','guard-tag',player).textContent='狂刀';node('guardSub','guard-sub',player);node('soulGain','floating-gain',player);
const soulWrap=node('soulWrap','soul-wrap',player),soulPips=node('soulPips','soul-pips',soulWrap);
const pips=Array.from({length:8},()=>node('pip','soul-pip',soulPips));node('soulCount','soul-count',soulWrap);
const box=root.getBoundingClientRect(),pr=playerPortrait.getBoundingClientRect(),br=bossPortrait.getBoundingClientRect();
const anchor=r=>({x:r.left-box.left+r.width/2,y:r.top-box.top+r.height/2,w:r.width,h:r.height});
const geometry={w:box.width,h:box.height,dpr:Math.min(devicePixelRatio||1,2),p:anchor(pr),b:anchor(br),pips:pips.map(el=>{const r=el.getBoundingClientRect();return {x:r.left-box.left+r.width/2,y:r.top-box.top+r.height/2};})};
canvas.width=Math.max(1,Math.round(geometry.w*geometry.dpr));canvas.height=Math.max(1,Math.round(geometry.h*geometry.dpr));
const damageNodes=[...plan.hits,...plan.incoming.filter(h=>h.result&&h.taken>0)].map(hit=>{
 const el=node('damage','damage-number'+(hit.burst?' samurai-critical':'')+(hit.target==='player'?' samurai-player-damage':''),damageLayer);
 el.textContent=hit.displayText??('-'+hit.value);
 if(hit.ignore){const label=document.createElement('small');label.textContent='PURE';el.appendChild(label);}
 return {el,hit};
});
function renderDamage(t){
 const p=plan,{w,p:pl,b}=geometry,scale=w/1000;
 const soul=plan.soulChanges.reduce((n,c)=>t>=c.time?n+c.delta:n,plan.startSouls);
 dom.soulCount.textContent=String(soul).padStart(2,'0')+' / 08';
 for(let i=0;i<8;i++){pips[i].classList.toggle('lit',i<soul);let opacity=1;if(plan.gather&&t>=plan.gather.start&&t<plan.gather.end&&i>=plan.startSouls-4&&i<plan.startSouls)opacity=1-clamp((t-plan.gather.start)/(plan.gather.end-plan.gather.start))*.9;pips[i].style.opacity=String(opacity);}
 for(const obj of damageNodes){
   const hit=obj.hit,m=t-hit.time,life=hit.kind==='arc'?490:p.skill==='swallow'?570:640;
   const visible=m>=0&&m<life,progress=clamp(m/life),a=visible?clamp(m/22)*(1-smooth((progress-.5)/.5)):0;
   const target=hit.target==='player'?pl:b;
   const n=p.skill==='swallow'&&hit.target==='boss'?hit.index:0;
   const spread=p.skill==='swallow'?[-.23,.05,-.07,.27][n%4]*b.w:0;
   const x=target.x+spread,y=p.skill==='swallow'&&hit.target==='boss'?target.y+target.h*.33-(out3(progress)*48-(n%2)*15)*scale:target.y-target.h*.10-(20+out3(progress)*50)*scale;
   const size=1+Math.exp(-m/43)*.24;
   obj.el.style.opacity=a.toFixed(3);obj.el.style.transform=`translate(${x.toFixed(2)}px,${y.toFixed(2)}px) translate(-50%,-50%) scale(${visible?size.toFixed(3):1})`;
 }
}

function measure(){
 const movers=[world,playerVisual,dom.playerHit,dom.bossVisual,boss];const transforms=movers.map(n=>n.style.transform);movers.forEach(n=>n.style.transform='none');
 const box=root.getBoundingClientRect();geometry.w=box.width;geometry.h=box.height;geometry.dpr=Math.min(devicePixelRatio||1,2);
 const get=el=>{const r=el.getBoundingClientRect();return {x:r.left-box.left+r.width/2,y:r.top-box.top+r.height/2,w:r.width,h:r.height};};
 geometry.p=get(playerPortrait);geometry.b=get(bossPortrait);geometry.pips=pips.map(get);
 canvas.width=Math.max(1,Math.round(geometry.w*geometry.dpr));canvas.height=Math.max(1,Math.round(geometry.h*geometry.dpr));
 movers.forEach((n,i)=>n.style.transform=transforms[i]);
}

// The requested minimal Haori variant reuses the source's blue particle stroke.
function renderSamuraiVariant(t,p){for(const c of p.soulChanges)if(c.delta>1)sparks(geometry.p.x,geometry.p.y,t-c.time,91,8,.35,-1.57);}
function bladeShape(length,width){
 ctx.beginPath();ctx.moveTo(-length*.52,0);ctx.lineTo(-length*.08,-width*.53);ctx.lineTo(length*.52,0);ctx.lineTo(length*.08,width*.53);ctx.closePath();
}
function drawBlade(x,y,angle,length,width,opacity,progress=1,seed=1){
 if(opacity<.002||progress<=0)return;
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalCompositeOperation='lighter';
 ctx.beginPath();ctx.rect(-length*.56,-55,length*1.12*progress,110);ctx.clip();
 ctx.globalAlpha=opacity*.20;ctx.fillStyle='#258ee7';ctx.shadowColor='#45bfff';ctx.shadowBlur=15;bladeShape(length,width*4);ctx.fill();
 ctx.globalAlpha=opacity*.52;ctx.shadowBlur=6;ctx.fillStyle='#58caff';bladeShape(length,width*1.75);ctx.fill();
 const core=ctx.createLinearGradient(-length/2,0,length/2,0);core.addColorStop(0,'#47b4ff00');core.addColorStop(.17,'#91e4ff');core.addColorStop(.40,'#f2ffff');core.addColorStop(.65,'#ffffff');core.addColorStop(.88,'#a9e9ff');core.addColorStop(1,'#48aaff00');
 ctx.globalAlpha=opacity;ctx.shadowBlur=0;ctx.fillStyle=core;bladeShape(length,Math.max(1.3,width*.62));ctx.fill();
 ctx.globalAlpha=opacity*.22;ctx.strokeStyle='#7ccaff';ctx.lineWidth=.65;
 for(let i=0;i<2;i++){const offset=(i?1:-1)*(4+width*.8);ctx.beginPath();ctx.moveTo(-length*(.42+rnd(seed+i)*.05),offset);ctx.lineTo(length*.40,offset);ctx.stroke();}
 ctx.restore();
}
function sparks(x,y,ms,seed,count=18,power=1,angle=-.5,warm=false){
 if(ms<0||ms>340)return;
 const scale=geometry.w/1000;
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
 for(let i=0;i<count;i++){
  const life=80+rnd(i+8,seed)*180;if(ms>life)continue;
  const p=ms/life,a=angle+(rnd(i+3,seed)>.5?Math.PI:0)+(rnd(i+11,seed)-.5)*1.7;
  const dist=(18+rnd(i+6,seed)*110)*out3(p)*scale*power;
  const l=(2+rnd(i+12,seed)*17)*(1-p)*scale*power;
  const sx=x+Math.cos(a)*dist,sy=y+Math.sin(a)*dist+p*p*12*scale;
  ctx.globalAlpha=Math.pow(1-p,1.5)*(.4+rnd(i+22,seed)*.6);
  ctx.strokeStyle=warm?(i%3?'#c9bdab':'#faf0d9'):(i%4?'#8adfff':'#f0fcff');ctx.lineWidth=(i%3===0?1.4:.8)*Math.max(.6,scale);
  ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx-Math.cos(a)*l,sy-Math.sin(a)*l);ctx.stroke();
 }
 ctx.restore();
}
function drawArc(hit,t,target=geometry.b,warm=false){
 const ms=t-(hit.time-52);if(ms<0||ms>260)return;
 const life=1-clamp((ms-85)/175),progress=smooth(ms/96),n=48;
 const w=target.w*1.35,h=target.h*.88;
 const point=u=>{const v=1-u;return {x:v*v*(-w*.60)+u*u*w*.60,y:v*v*(-h*.44)+2*v*u*(h*.44)+u*u*(-h*.44)};};
 const path=[];
 for(let i=0;i<=n;i++){const u=progress*i/n,pt=point(u);const before=point(Math.max(0,u-.002)),after=point(Math.min(1,u+.002));const ang=Math.atan2(after.y-before.y,after.x-before.x);const thick=Math.pow(Math.sin(Math.PI*clamp(u)),1.2)*w*.027+0.15;path.push({x:pt.x,y:pt.y,nx:-Math.sin(ang)*thick,ny:Math.cos(ang)*thick});}
 ctx.save();ctx.translate(target.x,target.y);ctx.rotate(-.45);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=life*.5;ctx.shadowColor=warm?'#e6a87b':'#29bfff';ctx.shadowBlur=13;ctx.fillStyle=warm?'#e0b689':'#55c7ff';ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(p.x+p.nx,p.y+p.ny):ctx.moveTo(p.x+p.nx,p.y+p.ny));[...path].reverse().forEach(p=>ctx.lineTo(p.x-p.nx,p.y-p.ny));ctx.closePath();ctx.fill();
 ctx.globalAlpha=life;ctx.shadowBlur=0;ctx.strokeStyle=warm?'#fff0d6':'#e1faff';ctx.lineWidth=Math.max(1,geometry.w*.0019);ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();
 sparks(target.x,target.y,t-hit.time,hit.index+6,14,.75,-.45,warm);
}
function drawLineHit(hit,t){
 const ms=t-hit.start;if(ms<0||ms>330)return;
 const b=geometry.b,scale=geometry.w/1000;
 let alpha=1-clamp((ms-42)/(hit.heavy?255:205));alpha*=alpha;
 let width=(hit.heavy?10:6)*scale;
 if(hit.final)width*=1.16;
 const length=Math.min(geometry.w*.58,b.w*(hit.kind==='counter'?3.0:2.55));
 const y=b.y+(hit.offsetY||0)*scale;
 drawBlade(b.x,y,hit.angle,length,width,alpha,out3(ms/32),hit.index+15);
 if(hit.kind==='counter'&&hit.echoes){
  for(let i=0;i<hit.echoes;i++){const delay=12+i*8,m=ms-delay;if(m>=0)drawBlade(b.x-5*scale*(i+1),y+(i%2?-1:1)*(8+i*4)*scale,hit.angle+(i%2?.01:-.01),length*.9,width*.26,alpha*.16,out3(m/28),i+66);}
 }
 sparks(b.x,y,t-hit.time,hit.index+17,hit.heavy?28:20,hit.heavy?1.1:.85,hit.angle);
}
function drawLock(t,p){
 if(!p.lock)return;
 const a=t-p.lock.start;if(a<0||t>p.lock.end+30)return;
 const b=geometry.b,scale=geometry.w/1000,progress=out3(a/100);
 const end=p.lock.end,fade=1-clamp((t-end)/30);
 const gather=clamp((t-282)/70);
 ctx.save();ctx.translate(b.x,b.y+8*scale);ctx.rotate(-.485);ctx.globalCompositeOperation='lighter';
 const len=Math.min(geometry.w*.54,b.w*2.5);ctx.strokeStyle='#a8ddf6';ctx.globalAlpha=(.18+.3*gather)*fade;ctx.lineWidth=.6*scale;
 ctx.beginPath();ctx.moveTo(-len*.5*progress,0);ctx.lineTo(len*.5*progress,0);ctx.stroke();
 if(gather>0){for(let i=0;i<8;i++){const side=i%2?1:-1,x=side*len*(.12+rnd(i,8)*.39)*(1-gather);ctx.globalAlpha=(1-gather)*.8;ctx.strokeStyle='#cbefff';ctx.lineWidth=1.1*scale;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-side*12*scale,0);ctx.stroke();}}
 ctx.restore();
}
function drawGather(t,p){
 if(!p.gather||!p.valid)return;
 const q=(t-p.gather.start)/(p.gather.end-p.gather.start);if(q<0||q>1.1)return;
 const a=geometry.p,scale=geometry.w/1000;
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(let i=0;i<32;i++){
   const local=clamp((q-rnd(i,p.seed)*.19)/.81),theta=rnd(i+20,p.seed)*Math.PI*2;
   const radius=(a.w*.65+rnd(i+41,p.seed)*a.w*.5)*(1-in3(local));
   const x=a.x+Math.cos(theta)*radius,y=a.y+Math.sin(theta)*radius*.8;
   const len=(4+9*local)*scale;ctx.globalAlpha=Math.sin(Math.PI*clamp(local))*.65;
   ctx.strokeStyle=i%4?'#7dd7ff':'#e7fbff';ctx.lineWidth=i%5?1*scale:1.7*scale;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(theta)*len,y+Math.sin(theta)*len*.8);ctx.stroke();
 }
 // Four of the actual soul pips travel to the portrait, not arbitrary stage coordinates.
 for(let i=0;i<4;i++){
   const origin=geometry.pips[Math.max(0,p.startSouls-4+i)]||{x:a.x,y:a.y+a.h};
   const r=clamp((q-i*.035)/.895),f=in3(r),x=lerp(origin.x,a.x,f)+Math.sin(r*Math.PI)*(i-1.5)*12*scale,y=lerp(origin.y,a.y,f);
   const prev=clamp(r-.045),fp=in3(prev),px=lerp(origin.x,a.x,fp)+Math.sin(prev*Math.PI)*(i-1.5)*12*scale,py=lerp(origin.y,a.y,fp);
   ctx.globalAlpha=(1-clamp((r-.9)/.1))*.85;ctx.strokeStyle='#a4e8ff';ctx.lineWidth=1.6*scale;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();
   ctx.fillStyle='#e9ffff';ctx.fillRect(x-1.4*scale,y-1.4*scale,2.8*scale,2.8*scale);
 }
 ctx.restore();
}
function drawSpeedLines(t,start,duration,power=1){
 const ms=t-start;if(ms<0||ms>duration)return;
 const q=ms/duration,alpha=Math.sin(Math.PI*q)*.27*power,scale=geometry.w/1000;
 ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle='#acd9f3';ctx.globalCompositeOperation='lighter';
 for(let i=0;i<21;i++){
  const y=geometry.h*(.15+rnd(i,3)*.61),x=(rnd(i+7,5)*geometry.w+(q*geometry.w*.5))%geometry.w;
  const len=(40+rnd(i+8,7)*170)*scale;
  ctx.lineWidth=(i%4===0?1.15:.55)*scale;ctx.beginPath();ctx.moveTo(x-len,y);ctx.lineTo(x,y-3*scale);ctx.stroke();
 }
 ctx.restore();
}
function drawIncoming(t,inc,p){
 const ms=t-inc.time,pl=geometry.p,b=geometry.b,scale=geometry.w/1000;
 const impact={x:pl.x+pl.w*.31,y:pl.y-pl.h*.04};
 if(ms>=-88&&ms<0){
   const progress=in3((ms+88)/88),x=lerp(b.x-b.w*.22,impact.x,progress),y=lerp(b.y-b.h*.07,impact.y,progress);
   ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='#b7a897';ctx.globalAlpha=.46;ctx.lineWidth=1.2*scale;ctx.beginPath();ctx.moveTo(x+Math.min(110*scale,(b.x-x)),y-5*scale);ctx.lineTo(x,y);ctx.stroke();ctx.restore();
   ctx.save();ctx.translate(x,y);ctx.rotate(-.7);ctx.globalAlpha=.76;ctx.fillStyle='#d7c7ad';bladeShape(65*scale,3*scale);ctx.fill();ctx.restore();
 }
 if(ms<0)return;
 if(inc.guard){
   const life=inc.first?118:58;
   if(ms<=life){
    const alpha=Math.pow(1-clamp(ms/life),1.15);
    const mainLen=inc.first?pl.h*.48:pl.h*.30;
    drawBlade(impact.x,impact.y,-1.03,mainLen,2.35*scale,alpha*(inc.first?.96:.68),1,inc.index+201);
    if(inc.first)drawBlade(impact.x,impact.y,.60,pl.w*.29,1.8*scale,alpha*.82,1,inc.index+219);
   }
   sparks(impact.x,impact.y,ms,inc.index+63,inc.first?24:8,inc.first?.86:.42,-.68,false);
   if(p.options.curse){
    sparks(impact.x+8*scale,impact.y+2*scale,ms,inc.index+163,inc.first?10:4,inc.first?.62:.34,-.55,true);
    if(ms<95){
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(215,110,100,.28)';ctx.lineWidth=1.05*scale;ctx.beginPath();ctx.moveTo(impact.x-28*scale,impact.y-16*scale);ctx.lineTo(impact.x+18*scale,impact.y+10*scale);ctx.stroke();ctx.restore();
    }
   }
 }else{
   drawArc({time:inc.time,index:inc.index},t,pl,true);
 }
}
function drawRelight(t,p){
 if(!p.relightAt)return;
 const ms=t-p.relightAt;if(ms<0||ms>140)return;
 const b=geometry.b,alpha=Math.pow(1-ms/140,1.7);
 drawBlade(b.x,b.y+8*scale,-.381,Math.min(geometry.w*.6,b.w*2.65),geometry.w*.010,alpha,1,70);
}
function drawAmbient(t){
 const {w,h}=geometry;
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(let i=0;i<18;i++){
  const x=rnd(i,14)*w,y=(rnd(i+40,14)*h-t*.004*(.4+rnd(i,10))+h*3)%h;
  ctx.globalAlpha=.10+rnd(i,32)*.18;ctx.fillStyle=i%4?'#80b1d2':'#b8cedd';const r=(.35+rnd(i,19)*.7)*w/1000;
  ctx.fillRect(x,y,r,r*1.8);
 }
 ctx.restore();
}
function renderCanvas(t,p){
 ctx.setTransform(geometry.dpr,0,0,geometry.dpr,0,0);ctx.clearRect(0,0,geometry.w,geometry.h);
 drawAmbient(t);
 if(!p.valid)return;
 drawGather(t,p);drawLock(t,p);
 if(p.eye)drawSpeedLines(t,225,390,.50);
 if(p.counterAt)drawSpeedLines(t,p.counterAt-94,205,1.2);
 for(const inc of p.incoming)drawIncoming(t,inc,p);
 if(p.skill==='parry')drawParryMarks(t,p);
 for(const h of p.slashes){if(h.kind==='arc')drawArc(h,t);else drawLineHit(h,t);}
 drawRelight(t,p);
}
function parryCountAt(p,t){let n=0;for(const inc of p.incoming)if(inc.guard&&t>=inc.time)n++;return n;}
function drawParryMarks(t,p){
 if(p.skill!=='parry'||!p.guard||!p.incoming.length)return;
 const count=Math.min(4,parryCountAt(p,t));if(!count)return;
 const a=geometry.p,scale=geometry.w/1000;
 const converge=p.counterAt?clamp((t-(p.counterAt-120))/110):0;
 const fadeOut=p.counterAt?1-clamp((t-p.counterAt)/110):1;
 if(fadeOut<=0)return;
 const marks=[
  {x:-.58,y:-.20,angle:-.88,len:.26,tx:-.10,ty:-.04},
  {x:-.52,y:.03,angle:-.74,len:.24,tx:-.06,ty:.02},
  {x:-.44,y:.25,angle:-.56,len:.22,tx:-.02,ty:.08},
  {x:-.36,y:.47,angle:-.42,len:.20,tx:.02,ty:.14}
 ];
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(let i=0;i<count;i++){
  const m=marks[i],appear=clamp((t-p.incoming[i].time)/65),blink=1-clamp((t-p.incoming[i].time-35)/120);
  const alpha=(.12+appear*.28+converge*.22)*Math.max(.18,blink)*fadeOut;
  const x=lerp(a.x+a.w*m.x,a.x+a.w*m.tx,converge),y=lerp(a.y+a.h*m.y,a.y+a.h*m.ty,converge);
  const length=a.w*m.len*(1+converge*.22);
  drawBlade(x,y,m.angle,length,1.3*scale,alpha,1,i+140);
 }
 ctx.restore();
}
function impactMotion(ms,amplitude,delay=0){
 ms-=delay;if(ms<0||ms>400)return {x:0,y:0,r:0};
 const k=Math.exp(-ms/81),phase=ms*.13;
 return {x:Math.sin(phase+1.2)*amplitude*k,y:Math.cos(phase*.87)*amplitude*.43*k,r:Math.sin(phase*.67)*amplitude*.13*k};
}
function render(t){
 const p=state.plan;if(!p||state.disposed)return;
 const {w,h,p:pl,b}=geometry,scale=w/1000;
 renderCanvas(t,p);
 let px=0,py=0,pr=0,ps=1,bx=0,by=0,br=0,bs=1,bossFlare=0,playerFlare=0,screen=0,sx=0,sy=0,dim=0;
 let echo=0,bossTravel=0,playerHitX=0,playerHitY=0,playerHitR=0;
 if(t>0&&t<180){const e=envelope(t,0,38,30,112);px=-26*scale*(1-out3(t/150));ps=1+e*.019;echo=e*.1;}
 if(p.skill==='attack'){
  const pulse=envelope(t,115,53,12,135);px+=pulse*19*scale;pr-=pulse*1.5;echo+=pulse*.14;
 }
 if(p.skill==='cleave'){
  const pulse=envelope(t,560,80,75,130);px+=pulse*11*scale;pr-=pulse*.8;echo+=pulse*.08;
  dim=envelope(t,95,100,420,300)*.3;
  if(t>=685&&t<=748){bs=1.012;bossFlare=.32*(1-(t-685)/90);}
  if(p.flashAt)screen=Math.max(screen,envelope(t,p.flashAt,8,14,118)*.82);
 }
 if(p.skill==='swallow'&&p.valid){
  dim=envelope(t,90,88,147,280)*.60;
  const d=envelope(t,110,120,335,235);ps+=d*.033;echo+=d*.12;
  if(t>320&&t<660)px+=envelope(t,320,35,202,103)*14*scale;
  if(p.eye)screen=Math.max(screen,envelope(t,p.eye.open,5,10,72)*.48);
  if(p.flashAt){const m=t-p.flashAt;screen=Math.max(screen,envelope(t,p.flashAt,7,9,93)*.78);if(m>0&&m<300){const z=impactMotion(m,7*scale);bx+=z.x;by+=z.y;br+=z.r;sx+=z.x*.34;sy+=z.y*.24;}}
 }
 if(p.skill==='parry'){
  for(const inc of p.incoming){
   const m=t-inc.time;
   const hold=inc.first&&inc.guard?84:18;
   const lunge=envelope(t,inc.time-74,68,hold+4,72);
   bossTravel-=lunge*18*scale;br-=lunge*.42;
   if(m>=0&&m<hold&&inc.guard){
    bs=1.011;
    playerFlare=Math.max(playerFlare,.20*(1-m/(hold+18)));
    if(inc.first)dim=Math.max(dim,.14*(1-m/(hold+22)));
   }
   if(inc.taken>0){const z=impactMotion(m,inc.guard?2.2*scale:7*scale);playerHitX+=z.x;playerHitY+=z.y;playerHitR+=z.r;playerFlare=Math.max(playerFlare,envelope(t,inc.time,3,10,65)*.28);}
  }
  if(p.counterAt){
    const gather=envelope(t,p.counterAt-118,28,64,88),release=envelope(t,p.counterAt-6,5,10,88);
    px+=gather*15*scale+release*16*scale;ps+=gather*.022+release*.016;echo+=gather*.12+release*.18;
    dim=Math.max(dim,envelope(t,p.counterAt-120,34,120,150)*.24);
    screen=Math.max(screen,envelope(t,p.counterAt+2,4,8,70)*(p.options.curse?.18:.10));
  }
 }
 for(const hit of p.hits){
  const ms=t-hit.time,heavy=p.skill==='cleave';
  const z=impactMotion(ms,(hit.heavy?10:hit.kind==='arc'?3.5:5)*scale,heavy?55:0);bx+=z.x;by+=z.y;br+=z.r;
  bossFlare=Math.max(bossFlare,envelope(t,hit.time,3,hit.heavy?17:8,hit.heavy?85:54)*(hit.heavy?.51:.35));
  if(hit.heavy&&!heavy){sx+=z.x*.18;sy+=z.y*.13;}
 }
 if(!state.shake){bx=0;by=0;br=0;sx=0;sy=0;pr=0;bossTravel=0;px*=.4;py*=.4;}
 dom.world.style.transform=`translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`;
 dom.playerVisual.style.transform=`translate(${px.toFixed(2)}px,${py.toFixed(2)}px) rotate(${pr.toFixed(2)}deg) scale(${ps.toFixed(4)})`;
 dom.bossPosition.style.transform=`translateX(${bossTravel.toFixed(2)}px)`;
 dom.playerHit.style.transform=state.shake?`translate(${playerHitX.toFixed(2)}px,${playerHitY.toFixed(2)}px) rotate(${playerHitR.toFixed(2)}deg)`:'none';
 dom.bossVisual.style.transform=`translate(${bx.toFixed(2)}px,${by.toFixed(2)}px) rotate(${br.toFixed(2)}deg) scale(${bs.toFixed(4)})`;
 dom.playerEcho.style.opacity=echo.toFixed(3);dom.playerEcho.style.transform=`translateX(${-15*scale}px)`;
 dom.playerFlare.style.opacity=playerFlare.toFixed(3);dom.bossFlare.style.opacity=bossFlare.toFixed(3);
 dom.sceneDimmer.style.opacity=dim.toFixed(3);dom.player.style.zIndex=dim>.2?'9':'5';
 dom.focusAura.style.opacity=(dim*.9).toFixed(3);
 dom.screenFlash.style.opacity=state.flash?screen.toFixed(3):'0';
 dom.screenSlice.style.opacity=p.skill==='cleave'?envelope(t,683,8,180,812)*.58:0;
 if(p.skill==='cleave'&&p.valid){
  const zanX=b.x,zanY=b.y;
  const preIn=clamp((t-148)/92),preOut=1-clamp((t-672)/18),pre=preIn*preOut;
  const split=envelope(t,685,8,360,632),splitQ=clamp((t-685)/1000),slash=envelope(t,683,4,52,140);
  const opacity=Math.max(pre,split,slash*.75);
  dom.zanOverlay.classList.toggle('samurai-is-burst',!!p.burst);
  dom.zanOverlay.style.left=`${zanX.toFixed(2)}px`;
  dom.zanOverlay.style.top=`${zanY.toFixed(2)}px`;
  dom.zanOverlay.style.opacity=opacity.toFixed(3);
  dom.zanOverlay.style.width=`${Math.max(b.w*1.10,w*.155).toFixed(2)}px`;
  dom.zanOverlay.style.transform=`translate(-50%,-50%) rotate(-13deg) scale(${(.80+pre*.10+split*.10).toFixed(4)}) translateY(${(-6*pre)*scale}px)`;
  dom.zanFull.style.opacity=(pre*Math.max(0,1-splitQ*1.35)).toFixed(3);
  dom.zanFull.style.transform=`scale(${(.95+pre*.05).toFixed(4)})`;
  dom.zanSplit.style.opacity=split.toFixed(3);
  dom.zanSplit.style.transform=`scale(${(1.00+splitQ*.42).toFixed(4)})`;
  dom.zanSlash.style.opacity=slash.toFixed(3);
  dom.zanSlash.style.transform=`scale(${(1.02+slash*.08+splitQ*.12).toFixed(4)})`; 
 }else{
  dom.zanOverlay.classList.remove('samurai-is-burst');dom.zanOverlay.style.opacity='0';dom.zanFull.style.opacity='0';dom.zanSplit.style.opacity='0';dom.zanSlash.style.opacity='0';
 }
 // Cut-in uses the supplied TWO registered image frames in the exact same box.
 if(p.eye&&p.valid){
  const e=p.eye,d=t-e.start,visible=d>=0&&t<e.end;
  const entrance=out3(d/43),exit=smooth((t-(e.end-65))/65);
  const opacity=visible?clamp(entrance*(1-exit)):0;
  dom.eyeCutin.style.opacity=opacity.toFixed(3);
  dom.eyeCutin.style.transform=`translateX(${((-1+entrance)*90+exit*45)*scale}px) rotate(-3deg) scale(${(1.012-.012*entrance+exit*.009).toFixed(4)})`;
  dom.eyeOpen.style.opacity=t>=e.open?'1':'0';
  const f=t-e.open,flash=f>=0&&f<120?Math.pow(1-f/120,2):0;
  dom.eyeFlare.style.opacity=(flash*.72).toFixed(3);
  dom.eyeFlare.style.background=`radial-gradient(circle at 50% 50%, rgba(255,255,255,${(0.92*flash).toFixed(3)}) 0%, rgba(208,239,255,${(0.55*flash).toFixed(3)}) 34%, rgba(120,200,255,${(0.22*flash).toFixed(3)}) 58%, rgba(120,200,255,0) 72%)`;
  const pupil=visible&&f>=0?(.45+.5*Math.exp(-f/80)):0;
  dom.pupilLeft.style.opacity=dom.pupilRight.style.opacity=pupil.toFixed(3);
  dom.eyeSweep.style.opacity=f>=0&&f<=92?Math.sin(Math.PI*f/92).toFixed(3):'0';
  dom.eyeSweep.style.transform=`translateX(${(-1+clamp(f/92)*4.4)*100}%)`;
 }else{dom.eyeCutin.style.opacity='0';dom.eyeOpen.style.opacity='0';dom.eyeSweep.style.opacity='0';dom.eyeFlare.style.opacity='0';}
 // Swallow title emblem floats at center during the closed-eye focus, then disappears with the eye-opening white flash.
 let swallowTitleOpacity=0,swallowTitleScale=.94,swallowTitleLift=0;
 if(p.skill==='swallow'&&p.valid&&p.eye){
  const appear=envelope(t,p.eye.start+36,110,Math.max(0,p.eye.open-p.eye.start-150),130);
  const vanish=1-clamp((t-p.eye.open)/110);
  swallowTitleOpacity=appear*vanish;
  swallowTitleScale=.96+.06*smooth(clamp((t-(p.eye.start+36))/110));
  swallowTitleLift=(1-smooth(clamp((t-(p.eye.start+36))/110)))*10;
 }
 dom.swallowTitleIcon.style.opacity=swallowTitleOpacity.toFixed(3);
 dom.swallowTitleIcon.style.transform=`translate(-50%,calc(-50% + ${swallowTitleLift.toFixed(2)}px)) scale(${swallowTitleScale.toFixed(4)})`;
 // The first trigger gets the full title; later hits only show a brief low-key parry count.
 let tagOpacity=0,guardSubOpacity=0,guardSubText=p.options.curse?T.damageReduction:T.blocked;
 if(p.guard&&p.incoming.length){
   const first=p.incoming[0].time;
   tagOpacity=envelope(t,first,8,66,82);
   guardSubOpacity=envelope(t,first+20,12,86,72);
   let burstCount=0,burstOpacity=0;
   for(let i=1;i<p.incoming.length;i++){
    const a=envelope(t,p.incoming[i].time,6,52,90);
    if(a>burstOpacity){burstOpacity=a;burstCount=i+1;}
   }
   if(burstCount>1&&burstOpacity>.02){guardSubOpacity=Math.max(guardSubOpacity,burstOpacity);guardSubText=`PARRY ×${burstCount}`;}
   else if(t>=first+120&&t<(p.counterAt||p.enemyPhaseEnd)&&p.incoming.length>1){guardSubOpacity=Math.max(guardSubOpacity,.26);guardSubText=`PARRY ×${parryCountAt(p,t)}`;}
 }
 dom.guardTag.style.opacity=tagOpacity.toFixed(3);
 dom.guardTag.style.transform=`translate(-50%,-50%) scale(${1.08-tagOpacity*.08})`;
 dom.guardSub.style.opacity=guardSubOpacity.toFixed(3);dom.guardSub.textContent=guardSubText;
 let gainOpacity=0,gainText='',gainLift=0;
 for(const c of p.soulChanges){if(c.delta>0){const m=t-c.time;const a=envelope(t,c.time,40,180,220);if(a>gainOpacity){gainOpacity=a;gainText=T.soulGainText+c.delta;gainLift=clamp(m/440)*9;}}}
 if(p.buffAt){const a=envelope(t,p.buffAt,25,160,200);if(a>gainOpacity){gainOpacity=a;gainText=T.guardBuffText;gainLift=2;}}
 dom.soulGain.textContent=gainText;dom.soulGain.style.opacity=gainOpacity.toFixed(3);dom.soulGain.style.transform=`translateY(${-gainLift*scale}px)`;

 renderSamuraiVariant(t,p);
 renderDamage(t);
}

return {render,measure,reduceFlash(){dom.screenFlash.style.opacity=String(Number(dom.screenFlash.style.opacity)*.25);dom.eyeFlare.style.opacity=String(Number(dom.eyeFlare.style.opacity)*.25);},dispose(){state.disposed=true;ctx.clearRect(0,0,canvas.width,canvas.height);world.remove();},geometry};
}
