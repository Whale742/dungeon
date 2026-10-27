// Phase 4 owns effects only. Actors, HP and resources remain on the battlefield.
const BATTLEFIELD_PLAYER_ROLES = new Set(['warrior','mage','assassin','bard','paladin','alchemist','archer','stargazer','dreamweaver','samurai','sage','augur','onmyoji','gladiator','druid']);
const ARCHER_BATTLEFIELD_ART=Object.freeze({
  bow:'/assets/combat-fx/archer/first-person-bow-drawn.png',
  arrow:'/assets/combat-fx/archer/magic-arrow.png',
  ground:'/assets/combat-fx/archer/arrow-ground-impact.png',
  hit:'/assets/combat-fx/common/impact-spark.png'
});
const ALCHEMIST_BATTLEFIELD_ART=Object.freeze({
  hand:'/assets/combat-fx/alchemist/throwing-hand.png',bottle:'/assets/combat-fx/alchemist/reagent-bottle.png',
  burst:'/assets/combat-fx/alchemist/glass-acid-burst.png',left:'/assets/combat-fx/alchemist/mixing-hand-left.png',
  right:'/assets/combat-fx/alchemist/mixing-hand-right.png',orb:'/assets/combat-fx/alchemist/transmutation-orb.png'
});
function battlefieldPaintedImage(parent,src,className){
  const image=document.createElement('img');image.src=typeof window!=='undefined'&&window.assetRegistry?window.assetRegistry.resolvePath(src):src;image.alt='';image.className=className;image.setAttribute('aria-hidden','true');parent.appendChild(image);return image;
}
function isBattlefieldPlayerStep(step) {return step?.actionId!=='a_trap'&&((typeof isPhase6TimedStep==='function'&&isPhase6TimedStep(step))||['arena_enter','arena_exit'].includes(step?.type)||(!!step?.hpSnapshotBefore?.arena&&step.type==='boss_action')||(BATTLEFIELD_PLAYER_ROLES.has(step?.sourceRole)&&!['boss_action','enemy_mechanic','kill','status_cleanup','overheal_cleanup'].includes(step.type)));}
function battlefieldPlayerTarget(step) {
  if(step.targetId&&!['all','all_enemies','monster'].includes(step.targetId))return step.targetId;
  return resolvePresentationTarget(step.results?.find(r=>r.targetEnemyId)||step.results?.find(r=>r.targetId===step.targetId)||{targetId:step.targetId,targetEnemyId:step.targetEnemyId},step);
}
function battlefieldVisualElement(id) {
  const element=getVisualAnchor(id)?.element;
  return element?.querySelector('.enemy-sprite-wrap,.teammate-avatar-wrap')||element;
}
function commitBattlefieldPlayerResult(result,step,context) {
  if(context.signal?.aborted||!applyAuthoritativeResult(result))return false;
  if(result.actualHeal>0)context.audioScope?.playResult('healing_result',{volume:step.sourceRole==='bard'?.7:1});
  const id=resolvePresentationTarget(result,step),anchor=getVisualAnchor(id);
  const count=context.numberCounts?.get(id)||0;
  const entries=context.feedbackEntries?context.feedbackEntries(result):battleFeedbackEntries(result);context.numberCounts?.set(id,count+entries.length);
  for(const [i,entry] of entries.entries()){
    const label=document.createElement('div');label.className='battlefield-player-number battle-feedback';label.dataset.feedbackLane=String(count+i);label.dataset.kind=entry.type;
    label.setAttribute('aria-hidden','true');label.style.animationDuration=(context.feedbackDuration||750)/(context.speed||1)+'ms';label.textContent=entry.text;context.effectRoot.appendChild(label);context.follow(label,id);
  }
  if(anchor&&result.actualDamage>0&&!context.reducedMotion&&['archer','alchemist'].includes(step.sourceRole)&&step.actionId!=='a_rain'){
    const flash=document.createElement('div');flash.className='battlefield-hit-host';context.effectRoot.appendChild(flash);context.follow(flash,id);
    if(step.sourceRole==='archer'){const impact=document.createElement('img');impact.src=ARCHER_BATTLEFIELD_ART.hit;impact.alt='';impact.className='archer-painted-impact';impact.setAttribute('aria-hidden','true');impact.style.animationDuration=260/(context.speed||1)+'ms';flash.appendChild(impact);}
    else {const image=battlefieldPaintedImage(flash,ALCHEMIST_BATTLEFIELD_ART.burst,'archer-painted-impact');image.style.animationDuration=400/(context.speed||1)+'ms';}
  }
  context.onTiming?.('impact',{result,targetId:id});context.onTiming?.('hp_update',{result,targetId:id});
  return true;
}
function battlefieldFormationAnchor(results,step) {
  const anchors=[...new Set(results.map(r=>resolvePresentationTarget(r,step)))].map(getBattleEffectAnchor).filter(Boolean);
  if(!anchors.length)return null;
  return {x:anchors.reduce((n,a)=>n+a.x,0)/anchors.length,y:anchors.reduce((n,a)=>n+a.y,0)/anchors.length,
    width:Math.max(...anchors.map(a=>a.rect.right))-Math.min(...anchors.map(a=>a.rect.left)),
    height:Math.max(...anchors.map(a=>a.rect.height))};
}
// Synchronous commits preserve each result's before/after state and dedup key.
// No await between targets: all HP transitions begin in the same paint frame.
function commitBattlefieldGroup(s,step,results,commit=commitBattlefieldPlayerResult) {
  for(const result of results)commit===commitBattlefieldPlayerResult?commit(result,step,s.local):commit(s,step,result);
}
async function playBattlefieldTick(step,context) {
  return withBattlefieldSkillStage(step,{...context,skipCastAudio:true},async s=>{
    commitBattlefieldGroup(s,step,step.results||[]);
    if(step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);
    await s.wait(500);
  });
}
async function withBattlefieldSkillStage(step,context,play) {
  const signal=context.signal||context.controller?.signal;
  if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
  const root=document.createElement('div');root.className='battlefield-player-effects skill-production-stage';
  const frame=document.createElement('div');frame.className='skill-production-frame';root.appendChild(frame);document.body.appendChild(root);
  const speed=context.speed||1,reduced=context.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.dataset.role=step.sourceRole;root.dataset.actionId=step.actionId;root.dataset.reducedMotion=String(!!reduced);
  if(step.sourceRole==='stargazer'&&step.actionId==='sg_observe')root.classList.add('battlefield-universe');
  const audio=context.audioScope||createSfxPresentationScope({...context,signal});
  context.audioScope=audio;
  const followers=[],animations=new Set(),anchors=new Map(),cards=new Map(),renderers=[],recipients=[];let raf=0,scale=1;
  const el=(tag,cls,html,parent=frame)=>{const node=document.createElement(tag);node.className=cls;if(html)node.innerHTML=html;parent.appendChild(node);return node;};
  const position=(node,x,y)=>{node.style.left=x+'px';node.style.top=y+'px';};
  const targetId=battlefieldPlayerTarget(step);
  for(const id of new Set([step.sourceId,targetId,...(step.results||[]).map(r=>resolvePresentationTarget(r,step))].filter(Boolean))){
    anchors.set(id,{x:720,y:405});
    // A geometry marker has no unit imagery, health or authority.
    const wrapper=el('div','battlefield-geometry'),marker=el('span','',null,wrapper);cards.set(id,marker);
  }
  if(targetId){cards.set('monster',cards.get(targetId));anchors.set('monster',anchors.get(targetId));}
  const follow=(node,id,dx=0,dy=0)=>{
    followers.push({node,id,dx,dy,expires:node.dataset.feedbackLane!==undefined?performance.now()+(context.feedbackDuration||750)/speed:Infinity});
    if(node.dataset.feedbackLane!==undefined)positionBattleFeedback(node,id,Number(node.dataset.feedbackLane));
  };
  const measure=()=>{
    if(signal?.aborted)return;
    scale=Math.min(innerWidth/1440,innerHeight/810)||1;
    const left=(innerWidth-1440*scale)/2,top=(innerHeight-810*scale)/2;
    frame.style.transform=`translate(${left}px,${top}px) scale(${scale})`;
    for(const [id,p] of anchors){
      // Source geometry belongs to the scene; receiver feedback still follows
      // real enemy/party anchors through follow() below.
      const a=id===step.sourceId&&!(typeof getEnemyAnchor==='function'&&getEnemyAnchor(id))?{x:innerWidth*.18,y:innerHeight*.48}:getBattleEffectAnchor(id==='monster'?targetId:id);
      if(a){p.x=(a.x-left)/scale;p.y=(a.y-top)/scale;}
    }
    const occupied=[];
    for(const f of followers){
      if(performance.now()>=f.expires){f.node.remove();continue;}
      if(f.node.dataset.feedbackLane!==undefined){positionBattleFeedback(f.node,f.id,Number(f.node.dataset.feedbackLane),occupied);continue;}
      const a=getBattleEffectAnchor(f.id);if(a){position(f.node,a.x+f.dx,a.y+f.dy);f.node.hidden=false;}else f.node.hidden=true;
    }
    for(const renderer of renderers)renderer((performance.now()-rendererStart)/1000*speed);
    if(!signal?.aborted)raf=requestAnimationFrame(measure);
  };
  const rendererStart=performance.now();
  measure();
  const wait=ms=>waitForPresentation(ms,signal,speed);
  const tick=async(ms,update)=>{
    const duration=(reduced?Math.min(ms,120):ms)/speed,start=performance.now();
    while(true){if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');const p=Math.min(1,(performance.now()-start)/Math.max(1,duration));update(p);if(p===1)return;await presentationFrame(signal);}
  };
  // A single owned frame loop settles on completion, cancellation, renderer errors,
  // and (as a last resort) a suspended/missing browser frame callback.
  const timeline=(ms,update)=>new Promise((resolve,reject)=>{
    let frame=0,settled=false;const start=performance.now(),duration=ms/speed;
    const finish=error=>{if(settled)return;settled=true;cancelAnimationFrame(frame);clearTimeout(watchdog);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
    const abort=()=>finish(new DOMException('Presentation cancelled','AbortError'));
    const draw=now=>{try{if(signal?.aborted)return abort();const p=Math.min(1,(now-start)/Math.max(1,duration));update(p);if(p===1)finish();else frame=requestAnimationFrame(draw);}catch(error){finish(error);}};
    const watchdog=setTimeout(()=>{try{if(signal?.aborted)return abort();update(1);finish();}catch(error){finish(error);}},duration+Math.max(2000,duration*.5));
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();else frame=requestAnimationFrame(draw);
  });
  const animate=(node,keys,ms,options={})=>{const a=node.animate(keys,{duration:(reduced?Math.min(ms,120):ms)/speed,fill:'forwards',...options});animations.add(a);a.finished.catch(()=>{});return a;};
  const local={...context,signal,speed,reducedMotion:reduced,effectRoot:root,follow,audioScope:audio,numberCounts:new Map(),battlefield:true};
  const revealRecipient=id=>{
    const node=typeof getActorAnchor==='function'?getActorAnchor(id)?.element:null;
    if(node&&!recipients.includes(node)&&!node.classList.contains('is-skill-recipient')){node.classList.add('is-skill-recipient');recipients.push(node);}
  };
  const resolveResults=async(options={})=>{for(const result of step.results||[]){if(signal?.aborted)return;await options.beforeResult?.(result);commitBattlefieldPlayerResult(result,step,local);}if(options.applyFinalSnapshot!==false&&!signal?.aborted&&step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);};
  const api={root,frame,el,position,animate,tick,timeline,wait,actor:battlefieldVisualElement(step.sourceId),cards,anchors,signal,reduced,resolveResults,targetFor:battlefieldVisualElement,follow,local,revealRecipient,
    startRenderer:render=>renderers.push(render),unfollow:node=>{for(let i=followers.length-1;i>=0;i--)if(followers[i].node===node)followers.splice(i,1);},debug:()=>{}};
  const cleanup=()=>{cancelAnimationFrame(raf);for(const a of animations)a.cancel();for(const node of recipients)node.classList.remove('is-skill-recipient');root.remove();};
  signal?.addEventListener('abort',cleanup,{once:true});
  try{
    // Reveal the existing recipient portraits at the same anchors used by the
    // effects. Keep unrelated allies hidden and preserve the party's positions.
    const enemyDamage=(step.results||[]).some(r=>r.kind==='damage'&&r.targetEnemyId);
    const druidSelfCast=step.sourceRole==='druid'&&(step.results||[]).some(r=>['transform','summon'].includes(r.kind));
    for(const result of step.results||[]){
      if(['resource','reload'].includes(result.kind)||(result.kind==='status'&&enemyDamage&&result.presentationBeat!=='sage_shield'))continue;
      const id=resolvePresentationTarget(result,step),node=typeof getActorAnchor==='function'?getActorAnchor(id)?.element:null;
      if(druidSelfCast&&id===step.sourceId)continue;
      if(node&&!recipients.includes(node)&&!node.classList.contains('is-skill-recipient')){node.classList.add('is-skill-recipient');recipients.push(node);}
    }
    context.prepareStage?.(api);await Promise.all([...frame.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
    if(signal?.aborted)return;
    if(!context.skipCastAudio&&['sage','augur','onmyoji','gladiator','druid'].includes(step.sourceRole)){const profile=resolveCombatSfxProfile(step);if(profile.key)audio.play(profile.key,{noHold:!!context.castAudioNoHold});}
    await play(api);if(!signal?.aborted){await audio.hold();const until=Math.max(0,...followers.filter(f=>Number.isFinite(f.expires)).map(f=>f.expires-performance.now()));if(until>0)await waitForPresentation(until,signal,1);}}
  finally{signal?.removeEventListener('abort',cleanup);cleanup();}
}
const FLASK_COLORS=Object.freeze({poison:'#a3b836',burn:'#ff713b',fracture:'#a8adb7',chill:'#94eaff',acid:'#68ed83'});
async function playBattlefieldRanged(step,context) {
  if(step.actionId==='a_rain')return playBattlefieldArrowRain(step,context);
  if(step.sourceRole==='archer'&&!step.results?.some(r=>r.kind==='reload'))await preloadPhase5Art(Object.values(ARCHER_BATTLEFIELD_ART),context.signal);
  if(step.sourceRole==='alchemist')await preloadPhase5Art(Object.values(ALCHEMIST_BATTLEFIELD_ART),context.signal);
  await withBattlefieldSkillStage(step,context,async s=>{
    const alchemy=step.sourceRole==='alchemist',reload=step.results?.some(r=>r.kind==='reload'),mix=alchemy&&step.actionId==='alc_fate';
    const audio=s.local.audioScope;
    const type=step.flaskType||step.outcome?.type?.replace('alchemy_','')||'acid';
    s.root.dataset.flask=type;
    s.root.style.setProperty('--player-fx-color',alchemy?FLASK_COLORS[type]||'#86efac':'#bcefff');
    if(reload){
      const magazine=s.el('div','battlefield-magazine');
      for(const result of step.results.filter(r=>r.kind==='reload')){
        for(const [i,ammo] of (result.ammoAfter||[]).entries()){
          const item=s.el('span','presentation-ammo-slot',ammoArrowHtml(ammo),magazine);
          item.setAttribute('aria-label',AMMO_NAMES[ammo]||ammo);audio.play(i<(result.ammoBefore?.length||0)?'reload_pull':'reload_insert');await s.wait(step.actionId==='a_frenzy_reload'?100:220);
        }
        audio.play('reload_lock');commitBattlefieldPlayerResult(result,step,s.local);
      }
      await s.resolveResults();await s.wait(250);return;
    }
    if(mix){
      const success=step.outcome?.type==='alchemy_success',failed=step.outcome?.type==='alchemy_failure';
      s.root.dataset.mixture=success?'success':failed?'failure':'stable';
      s.root.style.setProperty('--player-fx-color',success?'#fff5c6':failed?'#e879c8':'#a7f3c0');
      const ritual=s.el('div','battlefield-alchemy-mix',null,s.root);
      battlefieldPaintedImage(ritual,ALCHEMIST_BATTLEFIELD_ART.left,'mix-hand left');
      battlefieldPaintedImage(ritual,ALCHEMIST_BATTLEFIELD_ART.right,'mix-hand right');
      battlefieldPaintedImage(ritual,ALCHEMIST_BATTLEFIELD_ART.orb,'mix-orb');
      ritual.setAttribute('aria-label',step.outcome?.label||step.skillName);
      const orb=ritual.querySelector('.mix-orb');
      s.animate(orb,s.reduced?[{opacity:0},{opacity:1}]:[{transform:'translateY(15px) scale(.75)',filter:'brightness(.7)'},{transform:'translateY(-12px) scale(1.08)',filter:'brightness(1.6)'},{transform:'translateY(0) scale(1)',filter:'brightness(1)'}],900);
      for(const hand of ritual.querySelectorAll('.mix-hand'))s.animate(hand,s.reduced?[{opacity:0},{opacity:1}]:[{translate:'0 25px',opacity:0},{translate:'0 0',opacity:1}],400);
      audio.play(success?'alchemy_success':failed?'alchemy_failure':'support_cast');ritual.dataset.phase='gather';await s.wait(400);ritual.dataset.phase='mixing';await s.wait(500);
      for(const result of step.results||[]){
        const target=resolvePresentationTarget(result,step);await battlefieldProjectile(s,null,target,result.actualHeal>0?'healing':'reagent',orb);
        commitBattlefieldPlayerResult(result,step,s.local);
      }
      if(step.outcome?.label){const note=s.el('div','battlefield-trap-note battlefield-outcome-note',null,s.root);note.textContent=step.outcome.label+(failed?' · 下回合全隊承傷 +20%':'');}
      await s.resolveResults();await s.wait(300);return;
    }
    const firstPerson=alchemy||step.actionId==='a_shot';
    let bow;
    if(firstPerson){
      const hands=alchemy?battlefieldPaintedImage(s.root,ALCHEMIST_BATTLEFIELD_ART.hand,'battlefield-throw-hand'):document.createElement('img');
      if(alchemy)bow=hands;
      if(!alchemy){bow=hands;hands.className='battlefield-first-bow';hands.src=ARCHER_BATTLEFIELD_ART.bow;hands.alt='';hands.setAttribute('aria-hidden','true');s.root.appendChild(hands);}
      hands.setAttribute('aria-label',alchemy?'第一人稱投擲試劑':'藍白魔力拉弓');
      s.animate(hands,s.reduced?[{opacity:0},{opacity:1}]:[{translate:'0 90px',opacity:0},{translate:'0 0',opacity:1}],380);await s.wait(380);
    }
    if(!alchemy&&step.actionId==='a_shot'){const profile=resolveCombatSfxProfile(step);if(profile.key)audio.play(profile.key,{noHold:true});}
    if(step.actionId!=='a_trap')audio.play(alchemy?'bottle_throw':step.actionId==='a_rain'?'archer_rain':'archer_twang');
    let chemicalPlayed=false,bowReleased=false;
    if(alchemy){
      const seen=new Set(),main=[];
      for(const result of step.results||[])if(result.kind==='damage'&&result.targetEnemyId&&!seen.has(resolvePresentationTarget(result,step))){seen.add(resolvePresentationTarget(result,step));main.push(result);}
      if(main.length){
        const primary=main.find(r=>!r.isSecondaryEnemy)||main[0];
        if(bow){bowReleased=true;s.animate(bow,[{opacity:1},{opacity:0}],240);}
        const formation=(step.hpSnapshotBefore?.enemies||[]).filter(e=>e.hp>0).map(e=>({targetId:e.instanceId,targetEnemyId:e.instanceId}));
        const landing=()=>{const a=battlefieldFormationAnchor(formation.length?formation:main,step);return a?{...a,y:a.y+a.height*.35}:null;};
        await battlefieldProjectile(s,null,resolvePresentationTarget(primary,step),'bottle',bow||true,landing);
        audio.play('bottle_impact');
        const splash=battlefieldPaintedImage(s.root,ALCHEMIST_BATTLEFIELD_ART.burst,'battlefield-group-splash');
        const place=()=>{const a=landing();if(a){splash.style.left=a.x+'px';splash.style.top=a.y+'px';splash.style.width=Math.max(180,a.width)+'px';splash.style.height=Math.max(180,a.height*.9)+'px';}};
        place();s.startRenderer(place);s.animate(splash,[{opacity:0,scale:'.2'},{opacity:.85,scale:'1',offset:.3},{opacity:0,scale:'1.2'}],450);
        commitBattlefieldGroup(s,step,main);
        await audio.hold();
        audio.play('acid_splash');
        if(step.actionId==='alc_flask')audio.play('alchemy_skill1',{noHold:true});
        await s.wait(160);
        commitBattlefieldGroup(s,step,(step.results||[]).filter(r=>!main.includes(r)));
        await s.resolveResults();await s.wait(280);return;
      }
    }
    for(const result of step.results||[]){
      const id=resolvePresentationTarget(result,step);
      if(result.kind==='damage'&&result.targetEnemyId){
        const trap=step.actionId==='a_trap',ammo=result.ammoType||result.ammo;
        if(bow&&!bowReleased){bowReleased=true;s.animate(bow,s.reduced?[{opacity:1},{opacity:0}]:[{opacity:1,scale:'1'},{opacity:.8,scale:'1.025',offset:.25},{opacity:0,scale:'1'}],240);}
        if(!trap&&!alchemy)audio.play('arrow_flight');
        if(trap){const spikes=document.createElement('img');spikes.src=ARCHER_BATTLEFIELD_ART.ground;spikes.alt='';spikes.className='battlefield-trap-art';spikes.setAttribute('aria-hidden','true');s.root.appendChild(spikes);s.follow(spikes,id,0,25);s.animate(spikes,[{opacity:0},{opacity:1,offset:.3},{opacity:0}],400);await s.wait(180);}
        else {await battlefieldProjectile(s,step.sourceId,id,alchemy?'bottle':ammo||'arrow',bow||firstPerson);if(alchemy)audio.play('bottle_impact');}
        commitBattlefieldPlayerResult(result,step,s.local);
        if(alchemy)await audio.hold();
        if(step.actionId==='alc_flask'&&!chemicalPlayed){chemicalPlayed=true;await s.wait(80);audio.play('alchemy_skill1',{noHold:true});}
        audio.play(alchemy?'acid_splash':'arrow_impact');
      }else commitBattlefieldPlayerResult(result,step,s.local);
    }
    await s.resolveResults();
    if(step.archerTrap){const trap=s.el('div','battlefield-trap-note');trap.textContent='箭刺陷阱已建立 · '+step.archerTrap.turns+' 回合';}
    await s.wait(260);
  });
}
async function playBattlefieldArrowRain(step,context) {
  await preloadPhase5Art([ARCHER_BATTLEFIELD_ART.arrow,ARCHER_BATTLEFIELD_ART.ground],context.signal);
  return withBattlefieldSkillStage(step,context,async s=>{
    const targets=[...new Set((step.results||[]).filter(r=>r.kind==='damage').map(r=>resolvePresentationTarget(r,step)))];
    s.root.classList.add('battlefield-arrow-rain');
    s.local.audioScope.play('fight');await s.wait(450);
    s.local.audioScope.play('archer_rain',{signal:s.signal,preserveAcrossViews:true,noHold:true});
    if(s.actor?.animate)s.animate(s.actor,s.reduced?[{opacity:1},{opacity:.65},{opacity:1}]:[{transform:'translateY(0)'},{transform:'translateY(-12px) rotate(-5deg)',offset:.3},{transform:'translateY(0)'}],550);
    let resolved=false;
    for(let wave=0;wave<5;wave++)await Promise.all(targets.map(id=>{
      const field=document.createElement('div');field.className='archer-rain-field battlefield-rain-field';s.root.appendChild(field);s.follow(field,id);
      const anchor=getBattleEffectAnchor(id);field.style.width=Math.max(80,Math.min(240,anchor?.rect.width||150))+'px';field.style.setProperty('--rain-arrow-length',Math.max(50,Math.min(95,(anchor?.rect.height||150)*.6))+'px');
      const impact=()=>{const flash=document.createElement('img');flash.src=ARCHER_BATTLEFIELD_ART.ground;flash.alt='';flash.setAttribute('aria-hidden','true');flash.className='archer-painted-ground';field.appendChild(flash);s.animate(flash,[{opacity:0,scale:'.65'},{opacity:.9,scale:'1',offset:.2},{opacity:0,scale:'1.08'}],260);return flash;};
      return archerRainWave({field,wave,reduced:s.reduced,arrowImage:ARCHER_BATTLEFIELD_ART.arrow,animate:(n,k,ms,o)=>s.animate(n,k,ms,{...o,delay:o.delay/(context.speed||1)}),wait:s.wait,impact,targetId:id,
        emit:(beat,detail)=>context.onTiming?.(beat,{step,...detail}),onImpact:()=>{if(wave===4&&!resolved){resolved=true;for(const result of step.results||[])commitBattlefieldPlayerResult(result,step,s.local);}}});
    }));
    await s.resolveResults();
    if(step.archerTrap){const note=s.el('div','battlefield-trap-note');note.textContent='箭刺陷阱已建立';}
    await s.wait(400);
  });
}
async function battlefieldProjectile(s,sourceId,targetId,type,central,targetAnchor) {
  const projectile=document.createElement('div');projectile.className='battlefield-projectile '+type;s.root.appendChild(projectile);
  if(AMMO_IMAGES[type])projectile.innerHTML=ammoArrowHtml(type);
  else if(['bottle','healing','reagent'].includes(type))battlefieldPaintedImage(projectile,type==='bottle'?ALCHEMIST_BATTLEFIELD_ART.bottle:ALCHEMIST_BATTLEFIELD_ART.orb,'alchemy-projectile-art');
  else if(type==='arrow'){const image=document.createElement('img');image.src=ARCHER_BATTLEFIELD_ART.arrow;image.alt='';image.className='archer-projectile-art';image.setAttribute('aria-hidden','true');projectile.appendChild(image);}
  if(AMMO_IMAGES[type])await samuraiAbortable(Promise.all([...projectile.querySelectorAll('img')].map(img=>img.decode().catch(()=>{}))),s.signal);
  await s.tick(440,p=>{
    const target=targetAnchor?.()||getBattleEffectAnchor(targetId);if(!target){projectile.hidden=true;return;}
    const bow=central?.getBoundingClientRect?.();
    const from=bow?{x:bow.left+bow.width*(type==='bottle'?.82:['healing','reagent'].includes(type)?.5:.25),y:bow.top+bow.height*(type==='bottle'?.2:['healing','reagent'].includes(type)?.5:.37)}:{x:innerWidth*.52,y:innerHeight*.85};
    const start=from;
    const travel=s.reduced?1:p;
    projectile.style.left=(start.x+(target.x-start.x)*travel)+'px';projectile.style.top=(start.y+(target.y-start.y)*travel-Math.sin(travel*Math.PI)*(type==='bottle'?70:0))+'px';
    if(s.reduced)projectile.style.opacity=String(Math.sin(p*Math.PI));
    projectile.style.rotate=type==='bottle'?p*220+'deg':Math.atan2(target.y-start.y,target.x-start.x)+'rad';
  });projectile.remove();
}
async function playBattlefieldPlayerPresentation(step,context={}) {
  const local={...context,battlefield:true};
  if(typeof isPhase6TimedStep==='function'&&isPhase6TimedStep(step))return playPhase6BattlefieldPresentation(step,local);
  if(['sage','augur','onmyoji','gladiator','druid'].includes(step.sourceRole)||['arena_enter','arena_exit'].includes(step.type)||(step.type==='boss_action'&&step.hpSnapshotBefore?.arena))return playPhase5BattlefieldPresentation(step,local);
  if(step.sourceRole==='stargazer'&&['basic','sg_observe','sg_clock'].includes(step.actionId))return playStargazerPresentation(step,local);
  if(step.sourceRole==='dreamweaver')return playDreamweaverPresentation(step,local);
  if(step.sourceRole==='samurai'&&['basic','sa_cut','sa_tsubame','sa_counter'].includes(step.actionId))return playBattlefieldSamurai(step,local);
  if(['stargazer','samurai'].includes(step.sourceRole))return withBattlefieldSkillStage(step,local,async s=>{await s.resolveResults();await s.wait(250);});
  if(['warrior','mage','assassin','bard','paladin'].includes(step.sourceRole))return playBattlefieldPaintedRole(step,local);
  return playBattlefieldRanged(step,local);
}
async function playBattlefieldSamurai(step,context) {
  await samuraiAbortable(preloadSamuraiFxAssets(),context.signal||context.controller?.signal);
  const adapted=adaptLegacyPresentationStep(step),plan=buildSamuraiPresentationPlan(adapted,context);
  await withBattlefieldSkillStage(step,context,async s=>{
    s.root.classList.add('samurai-fx-owner');
    const stub=()=>{const node=document.createElement('div');node.innerHTML='<div class="presentation-result-hit"><span class="presentation-result-portrait"></span></div>';return node;};
    const engine=createSamuraiPrototypeRenderer(s.root,stub(),stub(),plan,{...context,actorId:step.sourceId,targetId:battlefieldPlayerTarget(step),reducedMotion:s.reduced});
    const committed=new Set(),cues=new Set(),visualCues=new Set();
    s.root.dataset.lifecycle='initialized';
    // Freeze artwork and geometry before any lethal result. These are inert visual
    // echoes owned by this effect root, never registered as combat actors/targets.
    const echoes=[];
    if(plan.skill==='swallow')for(const enemy of step.hpSnapshotBefore?.enemies||[]){
      const target=battlefieldVisualElement(enemy.instanceId),image=target?.querySelector('img');if(!target||!image)continue;
      const rect=target.getBoundingClientRect(),echo=document.createElement('img');echo.src=image.currentSrc||image.src;echo.alt='';echo.className='samurai-death-echo';echo.setAttribute('aria-hidden','true');
      Object.assign(echo.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});s.root.appendChild(echo);echoes.push({id:enemy.instanceId,node:echo});
    }
    const jobs=(step.results||[]).map(result=>{
      const hit=plan.hits.find(h=>h.result.resultId===result.resultId);
      const time=hit?.time??(plan.skill==='swallow'&&Number.isFinite(result.segmentIndex)?1140+result.segmentIndex*plan.interval:Math.max(0,...plan.hits.map(h=>h.time)));
      return {result,time,hit};
    });
    try{
      if(plan.castSound)s.local.audioScope.play(plan.castSound,{noHold:true});
      if(plan.introSound)s.local.audioScope.play(plan.introSound,{noHold:true});
      s.root.dataset.lifecycle='running';
      await s.timeline(samuraiPlaybackDuration(plan),p=>{
        const time=samuraiVisualTime(p*samuraiPlaybackDuration(plan),plan);engine.measure();engine.render(time);
        if(s.reduced)engine.reduceFlash();
        for(const event of plan.audio)if(time>=event.time&&!cues.has(event)){cues.add(event);samuraiSound(event,s.local.audioScope,step);}
        for(const cut of plan.slashes)if(time>=cut.time&&!visualCues.has(cut)){visualCues.add(cut);s.local.onTiming?.('samurai_slash',{step,index:cut.segmentIndex??cut.index,segmentIndex:cut.segmentIndex,visualOnly:!!cut.visualOnly,time});}
        for(const job of jobs)if(time>=job.time&&!committed.has(job.result)){
          committed.add(job.result);commitBattlefieldPlayerResult(job.result,step,s.local);
          for(const echo of echoes)if(echo.id===(job.result.targetEnemyId||job.result.targetId)&&job.result.targetAfter?.hp<=0)echo.node.style.opacity='.28';
        }
      });
      await s.resolveResults();
      s.root.dataset.lifecycle='completed';
    }catch(error){s.root.dataset.lifecycle=error.name==='AbortError'?'cancelled':'failed';throw error;}
    finally{engine.dispose();for(const echo of echoes)echo.node.remove();}
  });
}

async function playBattlefieldPaintedRole(step,context){
  return playPhase6BattlefieldPresentation(step,context);
}
