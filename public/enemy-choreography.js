// Presentation only. All movements share the real unit anchors; the single
// authoritative impact is owned by playEnemyMechanicPresentation.
const ENEMY_CHOREOGRAPHY_TIMING=Object.freeze({
  lava_colossus:{basic:[1160,.52],ultimate:[1820,.57]},
  shadow_alpha:{basic:[900,.43],ultimate:[1380,.46]},
  banshee:{basic:[1080,.49],ultimate:[1740,.58]}
});
function createEnemyChoreography(step,result,root,{reduced,animations,speed}) {
  const id=step.presentation?.mechanicId,timing=ENEMY_CHOREOGRAPHY_TIMING[id];
  if(!timing||result.kind!=='damage'||result.targetEnemyId)return null;
  const ultimate=!!step.presentation.isUltimate,[baseDuration,baseContact]=timing[ultimate?'ultimate':'basic'];
  const duration=reduced?650:baseDuration,contact=reduced?.35:baseContact;
  const sourceId=step.presentation.visualOriginId||result.sourceId||step.sourceId,targetId=resolvePresentationTarget(result,step);
  const layer=document.createElement('div');layer.className='enemy-choreography enemy-choreography-'+id;layer.dataset.ultimate=String(ultimate);layer.setAttribute('aria-hidden','true');root.appendChild(layer);
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.classList.add('enemy-painted-effects');layer.appendChild(svg);
  const make=(tag,attrs,parent=svg)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);parent.appendChild(n);return n;};
  // Irregular stone facets / brush strokes keep the effect in the existing
  // painted fantasy palette instead of a neon geometric impact badge.
  const defs=make('defs',{}),gradientId='rock-'+String(result.resultId||sourceId).replace(/[^a-zA-Z0-9]/g,'');
  const gradient=make('linearGradient',{id:gradientId,x1:'0',y1:'0',x2:'1',y2:'1'},defs);
  make('stop',{offset:'0','stop-color':'#847360'},gradient);make('stop',{offset:'.45','stop-color':'#332e2b'},gradient);make('stop',{offset:'1','stop-color':'#15191c'},gradient);
  const fist=make('g',{'class':'enemy-lava-fist',opacity:0});
  if(id==='lava_colossus'){
    // A clipped fist fragment reuses the actual painted sprite. It has no
    // actor model, portrait card or HP and never duplicates the whole unit.
    const crop=make('svg',{x:-52,y:-65,width:104,height:130,viewBox:'1500 1230 340 440',overflow:'hidden'},fist);
    const path='/BOSS/Lava Colossus_fullbody.webp';
    make('image',{href:typeof window!=='undefined'&&window.assetRegistry?window.assetRegistry.resolvePath(path):path,x:0,y:0,width:2048,height:2048},crop);
  }
  const cracks=Array.from({length:ultimate?8:5},(_,i)=>make('path',{fill:'none',stroke:i%2?'#c36c39':'#e6ad64','stroke-width':i%2?2:3,'stroke-linecap':'round',opacity:0}));
  const chips=Array.from({length:ultimate?16:8},(_,i)=>make('path',{d:'M-7-4 L1-9 9-2 5 7 -4 5Z',fill:i%3?'#5d5146':'#ca6d35',stroke:'#a78b62','stroke-width':1,opacity:0}));
  const waves=Array.from({length:ultimate?9:4},(_,i)=>make('path',{fill:'none',stroke:i%3?'#afbbc9':'#e5dce9','stroke-width':i%3?1.4:3,'stroke-linecap':'round',opacity:0}));
  const aura=make('path',{fill:'none',stroke:'#bfc8dc','stroke-width':2,opacity:0});
  const clawNodes=[];
  if(id==='shadow_alpha')for(let i=0;i<(ultimate?3:1);i++){
    const claw=document.createElement('div');claw.className='enemy-painted-claws';claw.style.backgroundImage='url("/assets/beast-claw-scratch.svg")';claw.style.opacity='0';layer.appendChild(claw);clawNodes.push(claw);
  }
  const clamp=n=>Math.max(0,Math.min(1,n)),out=n=>1-Math.pow(1-clamp(n),3);
  let actorAnimated=false;
  const render=p=>{
    const source=getBattleEffectAnchor(sourceId),target=getBattleEffectAnchor(targetId);if(!source||!target){layer.hidden=true;return;}layer.hidden=false;
    svg.setAttribute('viewBox','0 0 '+innerWidth+' '+innerHeight);
    const a=source,b=target,dx=b.x-a.x,dy=b.y-a.y,angle=Math.atan2(dy,dx)*180/Math.PI;
    const wind=clamp(p/contact),q=clamp((p-contact)/(1-contact));
    layer.dataset.phase=p<contact*.6?'windup':p<contact?'travel':q<.4?'impact':'dissolve';
    if(!actorAnimated){
      actorAnimated=true;const sprite=source.element.querySelector('.enemy-sprite-img');
      if(sprite?.animate&&!reduced){
        const leap=id==='shadow_alpha',x=leap?dx*.76:Math.sign(dx)*(ultimate?18:9),y=leap?dy*.68:-(ultimate?20:10);
        const keys=leap?[{transform:'translate(0,0)'},{transform:'translate('+(-Math.sign(dx)*12)+'px,8px) scale(.94)',offset:contact*.45},{transform:`translate(${x}px,${y}px) rotate(${Math.sign(dx)*-7}deg)`,filter:'drop-shadow(-22px 6px 2px #252032aa) drop-shadow(-40px 10px 7px #51416066)',offset:contact},{transform:`translate(${x*.8}px,${y*.7}px)`,offset:contact+.1},{transform:'translate(0,0)',filter:'none'}]:
          [{transform:'translateY(0)'},{transform:`translate(${x*.2}px,${y}px) rotate(-5deg)`,offset:contact*.65},{transform:`translate(${x}px,6px) rotate(4deg)`,offset:contact},{transform:'translate(0,0)'}];
        const motion=id==='banshee'?[{transform:'translateY(0) scale(1)'},{transform:'translateY(-8px) scale(1.04)',offset:contact},{transform:'translateY(-3px) scale(1.02)',offset:Math.min(.9,contact+.15)},{transform:'translateY(0) scale(1)'}]:keys;
        animations.push(sprite.animate(motion,{duration:duration/speed,easing:'linear',fill:'forwards'}));
      }
    }
    if(id==='lava_colossus'){
      const flight=out((wind-.45)/.55),size=ultimate?1.65:1;
      fist.setAttribute('opacity',p<contact?String(clamp(wind*5)):String(Math.max(0,1-q*4)));
      fist.setAttribute('transform',`translate(${a.x+dx*flight},${a.y+dy*flight-Math.sin(flight*Math.PI)*(ultimate?85:45)}) rotate(${wind*35-25}) scale(${size})`);
      const foot=b.y+b.rect.height*.38,spread=ultimate?210:105;
      cracks.forEach((n,i)=>{const theta=(i/(cracks.length-1)*1.7+.65)*Math.PI,reach=spread*out(q*3),x=Math.cos(theta)*reach,y=Math.sin(theta)*reach*.25;n.setAttribute('d',`M${b.x} ${foot} l${x*.3} ${y*.3-6} ${x*.18} ${y*.2+9} ${x*.22} ${y*.1-3} ${x*.3} ${y*.4}`);n.setAttribute('opacity',p>=contact?String((1-q)*.9):'0');});
      chips.forEach((n,i)=>{const t=q,theta=(i*2.4),vx=Math.cos(theta)*(ultimate?170:90),vy=-30-(i%5)*22;const x=b.x+vx*t,y=foot+vy*t+100*t*t;n.setAttribute('transform',`translate(${x},${y}) rotate(${i*37+t*160}) scale(${.5+i%3*.3})`);n.setAttribute('opacity',p>=contact?String((1-t)*.9):'0');});
    }else if(id==='shadow_alpha'){
      for(const [i,claw] of clawNodes.entries()){
        const start=contact+i*.075,age=(p-start)/.23,alpha=age<0?0:Math.sin(clamp(age)*Math.PI)*(1-clamp(age)*.3);
        Object.assign(claw.style,{left:b.x+'px',top:b.y+'px',width:(ultimate?190:145)+'px',height:(ultimate?190:145)+'px',opacity:String(alpha),transform:`translate(-50%,-50%) rotate(${angle-90+(i%2?-42:24)}deg) scale(${.8+out(age)*.25})`});
      }
      waves.forEach((n,i)=>{const age=clamp((p-contact*.45)/contact),x=a.x+dx*age,y=a.y+dy*age;n.setAttribute('d',`M${x-dx*.18} ${y-dy*.18+i*6} Q${x-dx*.07} ${y-10+i*8} ${x} ${y+i*5}`);n.setAttribute('stroke','#65596e');n.setAttribute('opacity',!reduced&&p<contact?String(age*.45):'0');});
    }else{
      // Cold, asymmetric sound fronts converge at the throat, then travel to
      // the target. The ultimate stores several pulses before a broad scream.
      const mouth={x:a.x,y:a.y-a.rect.height*.18},charge=wind*Math.PI*2;
      aura.setAttribute('d',`M${mouth.x-34*wind} ${mouth.y-8} Q${mouth.x-18} ${mouth.y-27-Math.sin(charge)*8} ${mouth.x+8} ${mouth.y-17} Q${mouth.x+42} ${mouth.y+3} ${mouth.x+19} ${mouth.y+22}`);
      aura.setAttribute('opacity',p<contact?String(wind*.75):String((1-q)*.2));
      waves.forEach((n,i)=>{
        const travel=clamp((p-contact*.55-i*.012)/(contact*.45)),x=mouth.x+(b.x-mouth.x)*travel,y=mouth.y+(b.y-mouth.y)*travel;
        const radius=(ultimate?35:18)+(ultimate?90:45)*travel+(p>=contact?q*25:0),tilt=Math.atan2(dy,dx),ux=Math.cos(tilt+Math.PI/2)*radius,uy=Math.sin(tilt+Math.PI/2)*radius;
        n.setAttribute('d',`M${x-ux} ${y-uy} Q${x+Math.cos(tilt)*radius*.7} ${y+Math.sin(tilt)*radius*.7-8} ${x+ux*.15} ${y+uy*.15} Q${x-Math.cos(tilt)*radius*.35} ${y-Math.sin(tilt)*radius*.35+7} ${x+ux} ${y+uy}`);
        n.setAttribute('opacity',p>contact*.55?String((p>=contact?(1-q)*.48:Math.sin(travel*Math.PI)*(ultimate?.7:.5))):'0');
      });
      chips.forEach((n,i)=>{n.setAttribute('opacity','0');});
    }
    if(reduced){fist.setAttribute('opacity','0');for(const n of chips)n.setAttribute('opacity','0');for(const claw of clawNodes)claw.style.opacity=p>=contact&&q<.5?'.35':'0';}
  };
  return {duration,contact,render,remove:()=>layer.remove(),windupSfx:id==='banshee'?'bard_tone':'air_pass',impactSfx:id==='shadow_alpha'?'claw_slash':id==='banshee'?'bard_off_key':'heavy_impact'};
}
