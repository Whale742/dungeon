// Presentation only. All movements share the real unit anchors; the single
// authoritative impact is owned by playEnemyMechanicPresentation.
const ENEMY_CHOREOGRAPHY_TIMING=Object.freeze({
  lava_colossus:{basic:[1160,.52],ultimate:[1820,.57]},
  shadow_alpha:{basic:[900,.43],ultimate:[1380,.46]},
  banshee:{basic:[1080,.49],ultimate:[1740,.58]}
});
// Explicit semantic matches. Unpainted state changes use HUD feedback, never generic attack geometry.
const ENEMY_PAINTED_ART=Object.freeze({
  gel_slime:['enemies/slime-elastic-impact.png','enemies/slime-goo-crush.png'],
  abyss_watcher:['enemies/watcher-void-ray.png','enemies/watcher-void-cover.png'],
  abyss_stargazer:['enemies/abyss-gravity-collapse.png','enemies/abyss-orbit-shatter.png'],
  abyss_dreamweaver:['enemies/abyss-nightmare-pierce.png','enemies/abyss-confusion-sigil.png'],
  abyss_onmyoji:['enemies/abyss-vengeful-talisman.png','enemies/abyss-blood-curse-seal.png'],
  abyss_sage:['enemies/abyss-vector-break.png','enemies/abyss-impossible-equation.png'],
  lava_colossus:['enemies/lava-fist.png','enemies/lava-ground-crack.png','enemies/lava-eruption.png','enemies/lava-debris.png'],
  shadow_alpha:['enemies/shadow-lunge.png','enemies/shadow-claw.png','enemies/shadow-rending-claws.png','enemies/shadow-rend.png'],
  ancient_golem:['enemies/automaton-energy-core.png','enemies/overload-lightning.png'],
  blood_sorcerer:['enemies/blood-ribbon.png','enemies/blood-pierce.png','enemies/blood-moon.png','enemies/blood-energy-stream.png'],
  corrosive_serpent:['enemies/acid-projectile.png','enemies/acid-pool.png'],
  frost_knight:['common/ice-projectile-volley.png','common/frost-slash.png','common/ice-eruption.png'],
  glutton:['enemies/gluttonous-bite.png'],banshee:['enemies/whispering-spirits.png','enemies/banshee-scream.png'],
  crystal_scorpion:['enemies/crystal-pierce.png','enemies/crystal-burst.png'],
  hellstrider:['common/fireball.png','common/meteor-shower.png','common/rock-impact.png'],
  lava_larva:['enemies/lava-debris.png','enemies/lava-eruption.png'],
  shadow_wolf_pup:['enemies/shadow-lunge.png','enemies/shadow-claw.png'],
  ancient_repair_drone:['common/arcane-energy-link.png','enemies/automaton-energy-core.png'],
  blood_moon_acolyte:['enemies/blood-ribbon.png','enemies/blood-energy-stream.png'],
  corrosive_slime:['enemies/acid-projectile.png','enemies/acid-pool.png'],
  frostbone_skeleton:['common/ice-projectile-volley.png','common/frost-slash.png'],
  carrion_crawler:['enemies/parasitic-vortex.png'],whispering_apparition:['enemies/whispering-spirits.png'],
  crystal_beetle:['enemies/crystal-pierce.png','enemies/crystal-burst.png'],hellfire_imp:['common/fireball.png'],
  labyrinth_crossbowman:['archer/magic-arrow.png'],cave_goblin_rogue:['common/slash-texture.png'],
  shady_merchant:['common/gold-coin-burst.png'],treasure_mimic:['enemies/gluttonous-bite.png'],
  abyss_remnant:['enemies/whispering-spirits.png'],
  abyss_warrior:['common/sword-slash.png'],abyss_mage:['mage/arcane-core.png'],abyss_archer:['archer/magic-arrow.png'],
  abyss_assassin:['assassin/shadow-step.png','assassin/fatal-slash.png'],abyss_bard:['bard/pluck-streak.png','bard/melody-ribbon.png'],
  abyss_alchemist:['common/acid-orb.png','common/acid-splash.png'],abyss_druid:['common/vine-strike.png'],
  abyss_paladin:['common/sword-slash.png'],abyss_gladiator:['common/slash-texture.png'],abyss_samurai:['common/sword-slash.png']
});
function enemyPaintedPaths(step,result){
  // Self HP costs, shield consumption and form bookkeeping are not attacks.
  const kind=enemyEventKind(result,step);
  if(['self-cost','transform','death','cleanse'].includes(kind)||step.actionId==='吞噬護盾')return null;
  const six=sixEnemyEventMode(step,result);
  if(six){const art=ENEMY_PAINTED_ART[six.id];return six.mode==='quiet'?null:[art[six.mode==='ultimate'||six.mode==='cover'?1:0]];}
  const id=step.presentation?.mechanicId,art=ENEMY_PAINTED_ART[id];
  if(!art)return null;
  if(result.kind==='damage'||result.kind==='intercept'){
    if(/反射/.test(step.actionId))return id==='crystal_scorpion'?['enemies/crystal-burst.png']:null;
    if(!step.presentation?.isUltimate){
      if(id==='lava_colossus')return [art[0],art[1],art[3]];
      if(id==='shadow_alpha')return art.slice(0,2);
      if(id==='blood_sorcerer')return art.slice(0,2);
      if(id==='hellstrider')return [art[0]];
      if(id==='frost_knight')return ['common/frost-slash.png'];
    }
    return art;
  }
  if(/岩甲失效/.test(step.actionId))return ['enemies/lava-debris.png'];
  if(result.kind==='shield'&&id==='abyss_paladin')return ['paladin/holy-shield.png'];
  if(result.kind==='heal'&&id==='abyss_bard')return ['bard/melody-ribbon.png'];
  if(result.kind==='heal'&&id==='abyss_mage')return ['common/arcane-energy-link.png'];
  if(result.kind==='heal'&&id==='abyss_alchemist')return ['alchemist/transmutation-orb.png'];
  if(result.kind==='shield'&&['ancient_golem','ancient_repair_drone'].includes(id))return ['enemies/automaton-energy-core.png'];
  if(result.kind==='shield'&&['crystal_scorpion','crystal_beetle'].includes(id))return ['enemies/crystal-burst.png'];
  if(result.kind==='heal'&&['blood_sorcerer','blood_moon_acolyte'].includes(id))return ['enemies/blood-energy-stream.png'];
  if(result.kind==='heal'&&id==='glutton')return ['enemies/parasitic-vortex.png'];
  if(result.kind==='status'&&/充能|能源/.test(step.actionId)&&['ancient_golem','ancient_repair_drone'].includes(id)&&
    (result.targetAfter?.mechanics?.charge||0)>(result.targetBefore?.mechanics?.charge||0))return ['enemies/automaton-energy-core.png'];
  return null;
}
function createEnemyChoreography(step,result,root,{reduced,animations,speed}) {
  if(sixEnemyEventMode(step,result))return createSixEnemyChoreography(step,result,root,{reduced,animations,speed});
  const paths=enemyPaintedPaths(step,result);if(!paths)return null;
  const id=step.presentation.mechanicId,ultimate=!!step.presentation.isUltimate;
  const existingDuration=typeof ENEMY_FX_PROFILES!=='undefined'?(ENEMY_FX_PROFILES[step.presentation.family]?.[3]||700):700;
  const timing=ENEMY_CHOREOGRAPHY_TIMING[id]||{basic:[existingDuration,.35],ultimate:[existingDuration,.35]};
  const [baseDuration,baseContact]=timing[ultimate?'ultimate':'basic'];
  const duration=reduced?650:baseDuration,contact=reduced?.35:baseContact;
  const sourceId=step.presentation.visualOriginId||result.sourceId||step.sourceId,targetId=resolvePresentationTarget(result,step);
  const layer=document.createElement('div');layer.className='enemy-choreography enemy-choreography-'+id;layer.dataset.ultimate=String(ultimate);layer.setAttribute('aria-hidden','true');root.appendChild(layer);
  const images=paths.map(path=>{const n=document.createElement('img');n.src='/assets/combat-fx/'+path;n.alt='';n.className='enemy-official-art';n.setAttribute('aria-hidden','true');layer.appendChild(n);return n;});
  const clamp=n=>Math.max(0,Math.min(1,n)),out=n=>1-Math.pow(1-clamp(n),3);
  let actorAnimated=false;
  const render=p=>{
    const source=getBattleEffectAnchor(sourceId),target=getBattleEffectAnchor(targetId);if(!target||(!source&&p<contact)){layer.hidden=true;return;}layer.hidden=false;
    const a=source||target,b=target,dx=b.x-a.x,dy=b.y-a.y;
    const wind=clamp(p/contact),q=clamp((p-contact)/(1-contact));
    layer.dataset.phase=p<contact*.6?'windup':p<contact?'travel':q<.4?'impact':'dissolve';
    if(!actorAnimated&&source){
      actorAnimated=true;const sprite=source.element.querySelector('.enemy-sprite-img');
      if(sprite?.animate&&!reduced){
        const leap=id==='shadow_alpha',x=leap?dx*.76:Math.sign(dx)*(ultimate?18:9),y=leap?dy*.68:-(ultimate?20:10);
        const keys=leap?[{transform:'translate(0,0)'},{transform:'translate('+(-Math.sign(dx)*12)+'px,8px) scale(.94)',offset:contact*.45},{transform:`translate(${x}px,${y}px) rotate(${Math.sign(dx)*-7}deg)`,filter:'drop-shadow(-22px 6px 2px #252032aa) drop-shadow(-40px 10px 7px #51416066)',offset:contact},{transform:`translate(${x*.8}px,${y*.7}px)`,offset:contact+.1},{transform:'translate(0,0)',filter:'none'}]:
          [{transform:'translateY(0)'},{transform:`translate(${x*.2}px,${y}px) rotate(-5deg)`,offset:contact*.65},{transform:`translate(${x}px,6px) rotate(4deg)`,offset:contact},{transform:'translate(0,0)'}];
        const motion=id==='banshee'?[{transform:'translateY(0) scale(1)'},{transform:'translateY(-8px) scale(1.04)',offset:contact},{transform:'translateY(-3px) scale(1.02)',offset:Math.min(.9,contact+.15)},{transform:'translateY(0) scale(1)'}]:keys;
        animations.push(sprite.animate(motion,{duration:duration/speed,easing:'linear',fill:'forwards'}));
      }
    }
    const missed=['damage','intercept'].includes(result.kind)&&!(result.actualDamage>0);
    images.forEach((image,i)=>{
      const path=paths[i],charge=/energy-core|blood-moon/.test(path)&&paths.length>1;
      const link=/energy-stream|energy-link|overload-lightning/.test(path);
      const impactOnly=!charge&&(i>0||paths.length===1),travel=out((wind-.35)/.65),ground=/ground|pool|eruption/.test(path);
      const hitAge=clamp((p-contact-i*.025)/(1-contact)),visible=charge?p<contact:impactOnly?p>=contact+i*.025&&!missed:p<contact||!missed;
      let x=charge?a.x:reduced||impactOnly?b.x:a.x+dx*travel;
      let y=(charge?a.y:reduced||impactOnly?b.y:a.y+dy*travel)+(ground?b.rect.height*.32:0);
      let width=Math.min(ultimate?240:175,Math.max(100,b.rect.width*1.7)),height=width,rotation=reduced?0:i*12;
      if(link&&!reduced){x=(a.x+b.x)/2;y=(a.y+b.y)/2;width=Math.hypot(dx,dy);height=Math.min(110,b.rect.height);rotation=Math.atan2(dy,dx)*180/Math.PI;}
      const alpha=charge?Math.sin(wind*Math.PI):p<contact?Math.sin(wind*Math.PI):1-hitAge;
      Object.assign(image.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px',opacity:visible?String(alpha*(reduced?.55:1)):'0',transform:`translate(-50%,-50%) scale(${reduced?1:p<contact?.65+travel*.35:1+hitAge*.18}) rotate(${rotation}deg)`});
    });
  };
  return {duration,contact,render,remove:()=>layer.remove(),windupSfx:id==='banshee'?'bard_tone':['lava_colossus','shadow_alpha'].includes(id)?'air_pass':null,impactSfx:id==='shadow_alpha'?'claw_slash':id==='banshee'?'bard_off_key':id==='lava_colossus'?'heavy_impact':null};
}

// These six recipes have different materials and timelines. Classification uses
// real event deltas (support/curse events do not necessarily carry isUltimate).
const SIX_ENEMY_IDS=new Set(['gel_slime','abyss_watcher','abyss_stargazer','abyss_dreamweaver','abyss_onmyoji','abyss_sage']);
function sixEnemyEventMode(step,result){
  if(step.type!=='enemy_mechanic')return null;
  const before=result.targetBefore||{},after=result.targetAfter||{};
  const cover=u=>u.enemyEffectResistanceBonus??u.statuses?.find(s=>s.id==='void_cover')?.value??0;
  if(step.actionId==='支援共鳴更新'&&cover(before)!==cover(after))return {id:'abyss_watcher',mode:'cover',removing:cover(after)<cover(before)};
  const effect=(unit,key)=>unit.enemyEffects?.[key]||unit.statuses?.find(s=>s.id===key);
  const changed=key=>effect(after,key)&&JSON.stringify(effect(before,key))!==JSON.stringify(effect(after,key));
  const id=step.presentation?.mechanicId;if(!SIX_ENEMY_IDS.has(id))return null;
  if(result.kind==='status'){
    if(id==='abyss_dreamweaver'&&changed('confuse'))return {id,mode:'ultimate'};
    if(id==='abyss_onmyoji')for(const curse of ['backlash','seal_zero','vulnerable'])if(changed(curse))return {id,mode:'ultimate',curse};
    if(id==='abyss_sage'&&step.actionId==='方程・誤差歸零')return {id,mode:'ultimate'};
    if(id==='abyss_stargazer'&&step.presentation?.isUltimate)return {id,mode:'ultimate'};
    if(id==='abyss_sage'&&/向量崩解/.test(step.actionId))return {id,mode:'basic'};
  }
  if(result.kind==='damage'&&!step.presentation?.isUltimate&&!['普通攻擊','引力坍縮','惡夢穿刺','怨靈符擊','向量崩解'].includes(step.actionId))return {id,mode:'quiet'};
  return {id,mode:['damage','intercept'].includes(result.kind)?step.presentation?.isUltimate?'ultimate':'basic':'quiet'};
}
function groupEnemyPresentationSteps(queue){
  const grouped=[];
  for(const [index,original] of queue.entries()){
    let step=original;
    if(original.type==='enemy_mechanic'&&original.results?.every(r=>r.kind==='intercept')&&SIX_ENEMY_IDS.has(original.presentation?.mechanicId)){
      const next=queue.slice(index+1).find(s=>s.sourceId!==original.sourceId||s.results?.some(r=>r.kind==='damage'));
      if(next?.sourceId===original.sourceId)step={...original,presentation:{...original.presentation,isUltimate:!!next.presentation?.isUltimate},skillName:next.skillName};
    }
    const recipe=(step.results||[]).map(r=>sixEnemyEventMode(step,r)).find(Boolean);
    const previous=grouped.at(-1),key=recipe&&recipe.mode!=='quiet'?step.sourceId+':'+recipe.id+':'+recipe.mode:null;
    if(key&&previous?._sixCastKey===key){previous.results.push(...step.results);previous.enemyCastMembers.push(step);}
    else if(key)grouped.push({...step,results:[...step.results],enemyCastMembers:[step],_sixCastKey:key});
    else grouped.push(step);
  }
  return grouped;
}
function createSixEnemyChoreography(step,result,root,{reduced,animations,speed}){
  const recipe=sixEnemyEventMode(step,result);if(!recipe||recipe.mode==='quiet')return null;
  const {id,mode,curse}=recipe,ultimate=mode==='ultimate',cover=mode==='cover';
  const base={gel_slime:[800,1350],abyss_watcher:[1000,1450],abyss_stargazer:[1150,1800],abyss_dreamweaver:[1000,1700],abyss_onmyoji:[1050,1600],abyss_sage:[1100,1850]};
  const duration=reduced?500:cover?1000:base[id][ultimate?1:0],contact=reduced?.35:ultimate?.66:.53;
  const layer=document.createElement('div');layer.className='enemy-choreography enemy-six-'+id;layer.dataset.mode=mode;root.appendChild(layer);
  const make=(path,part)=>{const n=document.createElement('img');n.className='enemy-official-art';n.src='/assets/combat-fx/'+path;n.alt='';n.dataset.part=part;layer.appendChild(n);return n;};
  const art=ENEMY_PAINTED_ART[id],path=art[ultimate||cover?1:0];
  const main=Array.from({length:id==='abyss_dreamweaver'&&ultimate?5:id==='abyss_stargazer'||id==='abyss_sage'||id==='abyss_watcher'&&ultimate?3:1},(_,i)=>make(path,'cast-'+i));
  const members=step.enemyCastMembers||[step],hits=[];
  for(const member of members)for(const r of member.results||[]){const targetId=r.sharedFrom&&r.targetBefore?.role==='paladin'?r.sharedFrom:resolvePresentationTarget(r,member);if(ultimate&&targetId===step.sourceId&&r.kind==='status')continue;if(!hits.some(h=>h.id===targetId))hits.push({id:targetId,result:r,image:make(path,'target')});}
  const papers=ultimate&&id==='abyss_onmyoji'?Array.from({length:3},()=>make(art[0],'orbit-paper')):[];
  // Reuse the player's three precise ellipse geometries as a supporting orbit;
  // painted shatter art remains the primary ultimate surface.
  let orbits=null;
  if(id==='abyss_stargazer'&&ultimate){orbits=document.createElementNS('http://www.w3.org/2000/svg','svg');orbits.setAttribute('viewBox','-165 -115 330 230');orbits.classList.add('enemy-six-orbits');for(const [rx,ry,angle] of [[60,34,-15],[100,56,25],[140,78,-38]]){const e=document.createElementNS('http://www.w3.org/2000/svg','ellipse');e.setAttribute('rx',rx);e.setAttribute('ry',ry);e.setAttribute('transform',`rotate(${angle})`);orbits.appendChild(e);}layer.appendChild(orbits);}
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3;
  const place=(n,x,y,w,h,sx=1,sy=sx,rotation=0,alpha=1)=>Object.assign(n.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px',opacity:String(clamp(alpha)),transform:`translate(-50%,-50%) rotate(${reduced?0:rotation}deg) scale(${reduced?1:sx},${reduced?1:sy})`});
  let actorStarted=false,lastMask='';
  const protectHud=()=>{
    const blocked=[...document.querySelectorAll('.tos-enemy-hp-bar,.tos-enemy-hp-text,.tos-enemy-name,.enemy-cd-badge,.enemy-danger-marker,.enemy-threat-marker,.teammate-hp-row,.teammate-name,.lab-mock-player-hp,.battle-enemy-slot>small,.app-header,#studioNav')];
    const participants=new Set([step.sourceId,...hits.map(h=>h.id)]);
    for(const node of document.querySelectorAll('.battle-enemy-slot[data-enemy-id]'))if(!participants.has(node.dataset.enemyId))blocked.push(node);
    const rectangles=blocked.map(n=>n.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth).map(r=>`<rect x="${r.left-2}" y="${r.top-2}" width="${r.width+4}" height="${r.height+4}" fill="black"/>`).join('');
    const key=innerWidth+':'+innerHeight+rectangles;if(key===lastMask)return;lastMask=key;
    // SVG is only an alpha exclusion mask for official HUD rectangles. Every
    // visible surface in this layer remains the supplied painted PNG.
    layer.style.maskMode='luminance';layer.style.maskImage='url("data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${innerWidth}" height="${innerHeight}"><rect width="100%" height="100%" fill="white"/>${rectangles}</svg>`)+'")';
  };
  const render=p=>{
    protectHud();
    const source=getBattleEffectAnchor(step.presentation?.visualOriginId||step.sourceId),targets=hits.map(h=>({...h,a:getBattleEffectAnchor(h.id)})).filter(h=>h.a);
    if(!targets.length){layer.hidden=true;return;}layer.hidden=false;
    const b=targets[0].a,a=source||b,dx=b.x-a.x,dy=b.y-a.y;
    const wind=clamp(p/contact),q=clamp((p-contact)/(1-contact)),travel=ease((wind-.36)/.64);
    const top=a.rect.bottom+28,bottom=Math.min(...targets.map(h=>h.a.rect.top))-12;
    const size=Math.min(innerWidth<600?145:220,Math.max(105,b.rect.width*1.8),ultimate&&!cover?Math.max(80,bottom-top):220);
    const cx=ultimate&&!cover?(a.x+targets.reduce((sum,h)=>sum+h.a.x,0)/targets.length)/2:b.x,cy=ultimate&&!cover?(top+bottom)/2:b.y;
    layer.dataset.phase=p<contact*.4?'windup':p<contact*.83?'travel':p<contact?'hold':q<.4?'impact':'dissolve';
    if(!actorStarted&&source&&!reduced){actorStarted=true;const sprite=source.element.querySelector('.enemy-sprite-img');if(sprite?.animate){const slime=id==='gel_slime';animations.push(sprite.animate(slime&&!ultimate?[{transform:'none'},{transform:'translateY(8px) scale(1.25,.65)',offset:.22},{transform:'translateY(8px) scale(1.25,.65)',offset:.32},{transform:`translate(${dx*.8}px,${dy*.8}px) scale(.7,1.3)`,offset:contact},{transform:'translateY(-8px) scale(1.1,.9)',offset:.8},{transform:'none'}]:slime?[{transform:'none'},{transform:'scale(1.25,1.15)',offset:.4},{transform:'scale(.9,.8)',offset:contact},{transform:'none'}]:[{filter:'brightness(1)'},{filter:id==='abyss_watcher'?'brightness(.35)':'brightness(1.3)',offset:.3},{filter:'brightness(1)'}],{duration:duration/speed,fill:'forwards'}));}}
    main.forEach((n,i)=>{
      if(reduced){place(n,b.x,b.y-18,Math.min(85,size),Math.min(85,size),1,1,0,i?0:p<contact?.45:1-q);return;}
      const alpha=p<contact?clamp(wind*4):1-q;
      if(id==='gel_slime'){
        if(ultimate)place(n,b.x,b.y-65-75*(1-ease(wind)),size,size,1.35-q*.65,p<contact?.65+wind*.55:1.2-q*.8,0,alpha);
        else place(n,a.x+dx*travel,a.y+dy*travel,size,size,p<contact?1.5-travel*.7:1+q*.4,p<contact?.55+travel*.6:1-q*.6,0,alpha);
      }else if(id==='abyss_watcher'){
        if(cover)place(n,b.x,b.y,size,size,recipe.removing?1-q*.7:.45+ease(wind)*.6,recipe.removing?1-q*.7:.45+ease(wind)*.6,wind*12,alpha*(recipe.removing?1-p:1));
        else if(ultimate&&i>0&&wind<.4){n.style.clipPath='circle(38%)';place(n,a.x,a.y,size*.65,size*.65,.6+wind, .6+wind,i*60+wind*140,alpha*.55);}
        else {n.style.clipPath='none';n.style.objectFit='fill';const pulse=ultimate&&i>0?.45+.35*Math.sin(wind*Math.PI*6+i):1;place(n,(a.x+b.x)/2,(a.y+b.y)/2,Math.max(40,Math.hypot(dx,dy)),size*(ultimate?.68:.34),1,(p<contact?wind:Math.max(.03,1-q))*(i?.55:1),Math.atan2(dy,dx)*180/Math.PI,alpha*pulse*(i?.6:1));}
      }else if(id==='abyss_stargazer'){
        if(ultimate){const phase=i*.8;place(n,cx+(p<contact?Math.cos(phase)*35*(1-wind):dx*q*.25),cy+(p<contact?Math.sin(phase)*25:dy*q*.25),size,size,p<contact?.55+wind*.4:1+q*.45,1, i*35+(wind<.8?100*ease(wind/.8):100),p<contact?alpha*.3:alpha*.7);}
        else {const t=(wind+i*.22)%1,r=p<contact?(1-t)*size*.36:0;place(n,b.x+Math.cos(i*2.1)*r,b.y-50+Math.sin(i*2.1)*r,size,size,p<contact?1-t*.75:.4*(1-q),p<contact?1-t*.75:.4*(1-q),i*70-wind*140,alpha*(i?.45:1));}
      }else if(id==='abyss_dreamweaver'){
        if(ultimate&&i<4){n.style.clipPath=['inset(0 50% 50% 0)','inset(0 0 50% 50%)','inset(50% 0 0 50%)','inset(50% 50% 0 0)'][i];const t=ease(wind),angle=i*Math.PI/2+wind*4;place(n,cx+Math.cos(angle)*65*(1-t),cy+Math.sin(angle)*45*(1-t),size,size,.75,.75,Math.sin(wind*8+i)*18,p<contact?alpha*(1-clamp((wind-.7)/.3)):0);}
        else if(ultimate)place(n,cx,cy,size,size,.8,.8,Math.sin(wind*4)*4,p<contact?clamp((wind-.5)*3):1-q*2);
        else {n.style.filter='brightness(1.35)';place(n,a.x+dx*travel,a.y+dy*travel,size*1.3,size*.8,1,p<contact?.4+wind*.6:1-q*.8,Math.atan2(dy,dx)*180/Math.PI,alpha);}
      }else if(id==='abyss_onmyoji'){
        if(ultimate){const rhythm=curse==='backlash'?1+Math.sin(wind*22)*.07:curse==='seal_zero'?wind>.8?.65:1:1-wind*.3;place(n,b.x,b.y-95,size*.78,size,1.2*rhythm,1.2*rhythm,wind<.75?wind*16:12,alpha);}
        else place(n,a.x+dx*travel,a.y+dy*travel+Math.sin(travel*Math.PI)*-45,size*1.3,size*.7,1,Math.cos(wind*6)*.2+.8,Math.atan2(dy,dx)*180/Math.PI+Math.sin(wind*9)*10,alpha);
      }else if(id==='abyss_sage'){
        const stop=clamp(wind/.84),collapse=p<contact?1:Math.max(.03,1-q*4),r=i*19*(1-q);
        place(n,ultimate?cx+Math.cos(i*2+wind*3)*r:a.x+dx*travel+Math.sin(i*2)*r,ultimate?cy+Math.sin(i*2+wind*3)*r:a.y+dy*travel+Math.cos(i*2)*r,size*(ultimate?1:1.2),size*(ultimate?1:.65),(ultimate?.65+stop*.4:1)*collapse,collapse,i*65+stop*(i%2?-85:85),alpha*(i?.38:1));
        n.style.filter=ultimate&&p>=contact&&q<.12?'brightness(2) saturate(.2)':'sepia(.6) saturate(.65)';
      }
    });
    targets.forEach(({a:t,image,result:r},i)=>{if(id==='abyss_watcher'&&!cover&&!reduced){image.style.objectFit='fill';place(image,(a.x+t.x)/2,(a.y+t.y)/2,Math.hypot(t.x-a.x,t.y-a.y),size*(ultimate?.68:.34),1,p<contact?wind:1-q,Math.atan2(t.y-a.y,t.x-a.x)*180/Math.PI,i?Math.min(1,wind*4)*(1-q):0);return;}const missed=['damage','intercept'].includes(r.kind)&&!(r.actualDamage>0);const progress=ease((wind-.78)/.22),angle=i*2.4;
      // A small fragment travels from the shared cast to each real recipient.
      const x=ultimate?cx+(t.x-cx)*progress:t.x,y=ultimate?cy+(t.y-cy)*progress:t.y;
      place(image,x,y,Math.min(85,size*.56),Math.min(85,size*.56),1-q*.55,1-q*.55,id==='abyss_sage'?angle*40+q*65:0,(p>=contact||ultimate&&wind>.78)&&!missed?(1-q)*.85:0);
    });
    papers.forEach((n,i)=>{const angle=i*2.1+wind*5;place(n,b.x+Math.cos(angle)*size*.4,b.y-95+Math.sin(angle)*size*.3,size*.7,size*.4,1,1,angle*57,p<contact?Math.sin(wind*Math.PI):0);});
    if(orbits){place(orbits,cx,cy,size*1.4,size,1,1,reduced?0:110*ease(Math.min(1,wind/.8)),reduced?0:p<contact?Math.sin(wind*Math.PI):0);}
  };
  return {duration,contact,render,remove:()=>layer.remove(),windupSfx:'air_pass',impactSfx:cover?'shield_cast':id==='gel_slime'?'heavy_impact':id==='abyss_dreamweaver'&&ultimate?'bard_tone':'magic_impact'};
}
