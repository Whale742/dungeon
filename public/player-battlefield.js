// Phase 4 owns effects only. Actors, HP and resources remain on the battlefield.
const BATTLEFIELD_PLAYER_ROLES = new Set(['alchemist','archer','stargazer','dreamweaver','samurai']);
function isBattlefieldPlayerStep(step) {return BATTLEFIELD_PLAYER_ROLES.has(step?.sourceRole)&&step.type!=='boss_action';}
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
  const id=resolvePresentationTarget(result,step),anchor=getVisualAnchor(id);
  const label=document.createElement('div');label.className='battlefield-player-number';
  label.textContent=result.kind==='heal'?('治療 +'+(result.actualHeal||0)+(result.actualShield>0?'（含溢出 '+result.actualShield+'）':'')):enemyEventFeedback(result,step);context.effectRoot.appendChild(label);
  context.follow(label,id,0,38);
  if(anchor&&result.actualDamage>0&&!context.reducedMotion){
    const flash=document.createElement('i');flash.className='battlefield-player-hit';context.effectRoot.appendChild(flash);context.follow(flash,id);
  }
  context.onTiming?.('impact',{result,targetId:id});context.onTiming?.('hp_update',{result,targetId:id});
  return true;
}
async function withBattlefieldSkillStage(step,context,play) {
  const signal=context.signal||context.controller?.signal;
  if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
  const root=document.createElement('div');root.className='battlefield-player-effects skill-production-stage';
  const frame=document.createElement('div');frame.className='skill-production-frame';root.appendChild(frame);document.body.appendChild(root);
  const speed=context.speed||1,reduced=context.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.dataset.role=step.sourceRole;root.dataset.reducedMotion=String(!!reduced);
  if(step.sourceRole==='stargazer'&&step.actionId==='sg_observe')root.classList.add('battlefield-universe');
  const audio=context.audioScope||createSfxPresentationScope({...context,signal});
  context.audioScope=audio;
  const followers=[],animations=new Set(),anchors=new Map(),cards=new Map();let raf=0,scale=1;
  const el=(tag,cls,html,parent=frame)=>{const node=document.createElement(tag);node.className=cls;if(html)node.innerHTML=html;parent.appendChild(node);return node;};
  const position=(node,x,y)=>{node.style.left=x+'px';node.style.top=y+'px';};
  const targetId=battlefieldPlayerTarget(step);
  for(const id of new Set([step.sourceId,targetId,...(step.results||[]).map(r=>resolvePresentationTarget(r,step))].filter(Boolean))){
    anchors.set(id,{x:720,y:405});
    // A geometry marker has no unit imagery, health or authority.
    const wrapper=el('div','battlefield-geometry'),marker=el('span','',null,wrapper);cards.set(id,marker);
  }
  if(targetId){cards.set('monster',cards.get(targetId));anchors.set('monster',anchors.get(targetId));}
  const follow=(node,id,dx=0,dy=0)=>followers.push({node,id,dx,dy});
  const measure=()=>{
    scale=Math.min(innerWidth/1440,innerHeight/810)||1;
    const left=(innerWidth-1440*scale)/2,top=(innerHeight-810*scale)/2;
    frame.style.transform=`translate(${left}px,${top}px) scale(${scale})`;
    for(const [id,p] of anchors){const a=getVisualAnchor(id==='monster'?targetId:id);if(a){p.x=(a.x-left)/scale;p.y=(a.y-top)/scale;}}
    for(const f of followers){const a=getVisualAnchor(f.id);if(a){position(f.node,a.x+f.dx,a.y+f.dy);f.node.hidden=false;}else f.node.hidden=true;}
    raf=requestAnimationFrame(measure);
  };
  measure();
  const wait=ms=>waitForPresentation(ms,signal,speed);
  const tick=async(ms,update)=>{
    const duration=(reduced?Math.min(ms,120):ms)/speed,start=performance.now();
    while(true){if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');const p=Math.min(1,(performance.now()-start)/Math.max(1,duration));update(p);if(p===1)return;await presentationFrame(signal);}
  };
  const animate=(node,keys,ms,options={})=>{const a=node.animate(keys,{duration:(reduced?Math.min(ms,120):ms)/speed,fill:'forwards',...options});animations.add(a);a.finished.catch(()=>{});return a;};
  const local={...context,signal,speed,reducedMotion:reduced,effectRoot:root,follow,audioScope:audio,battlefield:true};
  const resolveResults=async(options={})=>{for(const result of step.results||[]){if(signal?.aborted)return;await options.beforeResult?.(result);commitBattlefieldPlayerResult(result,step,local);}if(!signal?.aborted&&step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);};
  const title=el('div','skill-production-title');title.textContent=step.skillName;
  const api={root,frame,el,position,animate,tick,wait,actor:battlefieldVisualElement(step.sourceId),cards,anchors,signal,reduced,resolveResults,targetFor:battlefieldVisualElement,follow,local};
  const cleanup=()=>{cancelAnimationFrame(raf);for(const a of animations)a.cancel();root.remove();};
  signal?.addEventListener('abort',cleanup,{once:true});
  try{await play(api);if(!signal?.aborted)await audio.hold();}
  finally{signal?.removeEventListener('abort',cleanup);cleanup();}
}
const FLASK_COLORS=Object.freeze({poison:'#a3b836',burn:'#ff713b',fracture:'#a8adb7',chill:'#94eaff',acid:'#68ed83'});
async function playBattlefieldRanged(step,context) {
  await withBattlefieldSkillStage(step,context,async s=>{
    const alchemy=step.sourceRole==='alchemist',reload=step.results?.some(r=>r.kind==='reload'),mix=alchemy&&step.actionId==='alc_fate';
    const audio=s.local.audioScope;
    const type=step.flaskType||step.outcome?.type?.replace('alchemy_','')||'acid';
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
      const ritual=s.el('div','battlefield-alchemy-mix','<i class="mix-hand left"></i><i class="mix-orb"></i><i class="mix-hand right"></i>');
      ritual.setAttribute('aria-label',step.outcome?.label||step.skillName);
      audio.play(success?'alchemy_success':failed?'alchemy_failure':'support_cast');await s.wait(900);
      for(const result of step.results||[]){
        const target=resolvePresentationTarget(result,step);await battlefieldProjectile(s,null,target,result.actualHeal>0?'healing':'reagent',false);
        commitBattlefieldPlayerResult(result,step,s.local);
      }
      if(failed){const warning=s.el('div','battlefield-trap-note');warning.textContent='下回合全隊承傷 +20%';}
      await s.resolveResults();await s.wait(300);return;
    }
    const firstPerson=alchemy&&step.actionId==='alc_flask'||!alchemy&&step.actionId==='a_shot';
    if(firstPerson){const hands=s.el('div',alchemy?'battlefield-throw-hand':'battlefield-first-bow');hands.setAttribute('aria-label',alchemy?'第一人稱投擲試劑':'藍白魔力拉弓');await s.wait(380);}
    if(!alchemy&&step.actionId==='a_shot'){const profile=resolveCombatSfxProfile(step);if(profile.key)audio.play(profile.key,{noHold:true});}
    if(step.actionId!=='a_trap')audio.play(alchemy?'bottle_throw':step.actionId==='a_rain'?'archer_rain':'archer_twang');
    let chemicalPlayed=false;
    for(const result of step.results||[]){
      const id=resolvePresentationTarget(result,step);
      if(result.kind==='damage'&&result.targetEnemyId){
        const rain=step.actionId==='a_rain',trap=step.actionId==='a_trap',ammo=result.ammoType||result.ammo;
        if(!rain&&!trap)audio.play(alchemy?'acid_throw':'arrow_flight');
        if(trap){const spikes=document.createElement('i');spikes.className='battlefield-trap-spikes';s.root.appendChild(spikes);s.follow(spikes,id,0,25);await s.wait(180);}
        else await battlefieldProjectile(s,step.sourceId,id,rain?'rain':alchemy?'bottle':ammo||'arrow',firstPerson);
        commitBattlefieldPlayerResult(result,step,s.local);
        if(step.actionId==='alc_flask'&&!chemicalPlayed){chemicalPlayed=true;await s.wait(80);audio.play('alchemy_skill1',{noHold:true});}
        audio.play(alchemy?'acid_splash':'arrow_impact');
      }else commitBattlefieldPlayerResult(result,step,s.local);
    }
    await s.resolveResults();
    if(step.archerTrap){const trap=s.el('div','battlefield-trap-note');trap.textContent='箭刺陷阱已建立 · '+step.archerTrap.turns+' 回合';}
    await s.wait(260);
  });
}
async function battlefieldProjectile(s,sourceId,targetId,type,central) {
  const projectile=document.createElement('div');projectile.className='battlefield-projectile '+type;s.root.appendChild(projectile);
  if(AMMO_IMAGES[type])projectile.innerHTML=ammoArrowHtml(type);
  if(AMMO_IMAGES[type])await samuraiAbortable(Promise.all([...projectile.querySelectorAll('img')].map(img=>img.decode().catch(()=>{}))),s.signal);
  await s.tick(440,p=>{
    const source=sourceId&&getVisualAnchor(sourceId),target=getVisualAnchor(targetId);if(!target){projectile.hidden=true;return;}
    const from=central||!source?{x:innerWidth/2,y:innerHeight*.75}:source;
    const start=type==='rain'?{x:target.x-50,y:target.y-160}:from;
    projectile.style.left=(start.x+(target.x-start.x)*p)+'px';projectile.style.top=(start.y+(target.y-start.y)*p-Math.sin(p*Math.PI)*(type==='bottle'?70:0))+'px';
    projectile.style.rotate=type==='bottle'?p*220+'deg':Math.atan2(target.y-start.y,target.x-start.x)+'rad';
  });projectile.remove();
  if(type==='bottle')for(let i=0;i<5;i++){
    const shard=document.createElement('i');shard.className='battlefield-glass-shard';shard.style.setProperty('--shard-angle',i*72+'deg');s.root.appendChild(shard);s.follow(shard,targetId);
  }
}
async function playBattlefieldPlayerPresentation(step,context={}) {
  const local={...context,battlefield:true};
  if(step.sourceRole==='stargazer'&&['basic','sg_observe','sg_clock'].includes(step.actionId))return playStargazerPresentation(step,local);
  if(step.sourceRole==='dreamweaver')return playDreamweaverPresentation(step,local);
  if(step.sourceRole==='samurai'&&['basic','sa_cut','sa_tsubame','sa_counter'].includes(step.actionId))return playBattlefieldSamurai(step,local);
  if(['stargazer','samurai'].includes(step.sourceRole))return withBattlefieldSkillStage(step,local,async s=>{await s.resolveResults();await s.wait(250);});
  return playBattlefieldRanged(step,local);
}
async function playBattlefieldSamurai(step,context) {
  await samuraiAbortable(preloadSamuraiFxAssets(),context.signal||context.controller?.signal);
  const adapted=adaptLegacyPresentationStep(step),plan=buildSamuraiPresentationPlan(adapted,context);
  await withBattlefieldSkillStage(step,context,async s=>{
    s.root.classList.add('samurai-fx-owner');
    const stub=()=>{const node=document.createElement('div');node.innerHTML='<div class="presentation-result-hit"><span class="presentation-result-portrait"></span></div>';return node;};
    const engine=createSamuraiPrototypeRenderer(s.root,stub(),stub(),plan,{...context,actorId:step.sourceId,targetId:battlefieldPlayerTarget(step),reducedMotion:s.reduced});
    const committed=new Set(),cues=new Set();
    try{
      if(plan.castSound)s.local.audioScope.play(plan.castSound,{noHold:true});
      if(plan.introSound)s.local.audioScope.play(plan.introSound,{noHold:true});
      await s.tick(samuraiPlaybackDuration(plan),p=>{
        const time=samuraiVisualTime(p*samuraiPlaybackDuration(plan),plan);engine.measure();engine.render(time);
        if(s.reduced)engine.reduceFlash();
        for(const event of plan.audio)if(time>=event.time&&!cues.has(event)){cues.add(event);samuraiSound(event,s.local.audioScope,step);}
        for(const hit of plan.hits)if(time>=hit.time&&!committed.has(hit.result)){
          committed.add(hit.result);commitBattlefieldPlayerResult(hit.result,step,s.local);
          s.local.onTiming?.('samurai_slash',{step,index:hit.index,time});
        }
      });
      await s.resolveResults();
    }finally{engine.dispose();}
  });
}
