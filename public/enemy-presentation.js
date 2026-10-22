// Enemy events use only official battlefield nodes. The fixed overlay contains
// geometry, captions and numbers, never portraits or a second health model.
const ENEMY_FX_PROFILES = Object.freeze({
  lava:['#fb923c','heavy','physical_hit',760], shadow:['#a78bfa','claw','claw_slash',520],
  arc:['#67e8f9','arc','magic_impact',620], blood:['#fb7185','drain','magic_impact',660],
  acid:['#a3e635','drop','alchemy_success',600], frost:['#bae6fd','crystal','magic_impact',600],
  devour:['#d9f99d','drain','shield_break',660], wave:['#c4b5fd','wave','bard_off_key',700],
  crystal:['#e9d5ff','crystal','shield_cast',580], fire:['#fbbf24','drop','magic_impact',600],
  elastic:['#86efac','wave','shield_cast',520], claw:['#fda4af','claw','physical_hit',480],
  arrow:['#fcd34d','arrow','physical_hit',440], void:['#818cf8','wave','magic_impact',650],
  heavy:['#cbd5e1','heavy','physical_hit',700], nature:['#4ade80','wave','transform_treant',720],
  curse:['#e879f9','crystal','magic_impact',640], equation:['#7dd3fc','equation','magic_impact',720]
});
function enemyEventFeedback(result, step) {
  const before=result.targetBefore, after=result.targetAfter;
  const values=[];
  if(result.actualHpDamage>0)values.push('生命 −'+result.actualHpDamage);
  if(result.actualAbsorbed>0)values.push('護盾 −'+result.actualAbsorbed);
  if(result.actualHeal>0)values.push('生命 +'+result.actualHeal);
  if(result.actualShield>0)values.push('護盾 +'+result.actualShield);
  const old=new Map((before?.statuses||[]).map(s=>[s.id,s]));
  const current=new Map((after?.statuses||[]).map(s=>[s.id,s]));
  for(const [id,s] of current)if(JSON.stringify(s)!==JSON.stringify(old.get(id)))values.push(s.label+(s.value!==undefined&&s.value!==''?' '+s.value:'')+(s.turns?' · '+s.turns+'R':''));
  for(const [id,s] of old)if(!current.has(id))values.push(s.label+'解除');
  if(before?.cooldowns&&after?.cooldowns&&Object.keys(after.cooldowns).some(k=>after.cooldowns[k]!==before.cooldowns[k]))values.push('技能冷卻已變更');
  if(result.kind==='death')values.push('倒下');
  const outcome=result.outcome?.type;
  if(outcome && !['normal','hit'].includes(outcome))values.push(({dodge:'閃避',blocked:'未生效',block:'格擋',dream_heal:'夢境轉化治療'})[outcome]||outcome);
  return values.join(' · ') || step.skillName || step.actionId;
}
function enemyEventShape(result, step, profile) {
  if(result.outcome?.type==='dodge')return 'evade';
  if(result.kind==='cleanse')return /寒霜衝擊/.test(step.actionId)?'frost':'cleanse';
  if(result.kind==='shield')return 'shield';
  if(result.kind==='heal')return 'heal';
  if(result.kind==='death')return 'death';
  if(/岩甲失效/.test(step.actionId))return 'debris';
  if(/晶甲反射|荊棘反傷|見切反擊/.test(step.actionId))return 'reflect';
  if(/標記|瞄準|懸賞/.test(step.actionId))return 'mark';
  if(/充能|熱度|能源/.test(step.actionId))return 'charge';
  if(/寒霜/.test(step.actionId))return 'frost';
  return profile[1];
}
function syncEnemyMechanicVisual(enemy, node) {
  if(!node)return;
  const info=enemy.presentation||{};
  node.dataset.enemyFamily=info.family||'';
  node.dataset.enemyForm=enemy.mechanics?.form||'';
  node.classList.toggle('enemy-mechanic-immune',!!info.immunity && enemy.hp>0);
  node.classList.toggle('enemy-mechanic-open',!!enemy.mechanics?.open && enemy.hp>0);
  node.classList.toggle('enemy-armor-broken',!!enemy.mechanics?.armorBroken && enemy.hp>0);
  node.classList.toggle('enemy-armor-ready',info.mechanicId==='lava_colossus'&&!enemy.mechanics?.armorBroken&&!enemy.mechanics?.firstPhysicalUsed&&enemy.hp>0);
  node.classList.toggle('enemy-crystal-supported',!!enemy.statuses?.some(s=>s.id==='crystal_support')&&enemy.hp>0);
  const resource=info.resource;
  let pips=node.querySelector('.enemy-resource-pips');
  if(resource){
    if(!pips){pips=document.createElement('span');pips.className='enemy-resource-pips';node.querySelector('.enemy-sprite-wrap')?.appendChild(pips);}
    pips.replaceChildren();
    for(let i=0;i<resource.max;i++){
      const pip=document.createElement('i');pip.className=i<resource.value&&enemy.hp>0?'is-lit':'';pips.appendChild(pip);
    }
    pips.setAttribute('aria-label',resource.label+' '+resource.value+'/'+resource.max);
  }else pips?.remove();
  let badge=node.querySelector('.enemy-mechanic-state');
  if(!badge){badge=document.createElement('span');badge.className='enemy-mechanic-state';node.appendChild(badge);}
  const states=(enemy.statuses||[]).filter(s=>['enemy_mechanic','void_step','void_cover','crystal_support'].includes(s.id));
  // Only resources / active conditions stay visible. Full help is in click info.
  badge.textContent=enemy.hp<=0?'':states.filter(s=>s.value!==undefined&&s.value!==''||s.id!=='enemy_mechanic').map(s=>s.value!==undefined&&s.value!==''?s.label+' '+s.value:s.label).join(' · ');
  badge.hidden=!badge.textContent;
  if(enemy.mechanics?.form==='werewolf'||enemy.mechanics?.form==='treant'){
    const img=node.querySelector('.enemy-sprite-img');
    if(img)img.src=enemy.mechanics.form==='werewolf'?'/photo/狼人.webp':'/photo/遠古樹精.webp';
  }
}
function renderEnemyTelegraphs(enemies) {
  const stage=document.getElementById('battleEnemiesStage');
  if(!stage)return;
  let list=document.getElementById('enemyTelegraphs');
  if(!list){list=document.createElement('div');list.id='enemyTelegraphs';list.className='enemy-telegraphs';list.setAttribute('role','status');stage.before(list);}
  list.replaceChildren();
  for(const enemy of enemies||[]){
    const p=enemy.presentation;
    if(enemy.hp<=0||!p)continue;
    if(!p.ultimateReady&&!p.targetId&&!p.immunity&&!enemy.mechanics?.transformRound)continue;
    const line=document.createElement('div');
    line.textContent=enemy.name+' · '+(p.ultimateReady?'本回合 '+p.ultimateName:enemy.mechanics?.transformRound?'下回合變形':p.passiveName)+' · '+(p.targetName?p.targetName+'：':'')+p.targetHint+(p.immunity?' · 本回合免傷':'');
    list.appendChild(line);
  }
  list.hidden=!list.childElementCount;
  for(const card of document.querySelectorAll('.teammate-card[data-player-id]')){
    const marks=(enemies||[]).filter(e=>e.hp>0&&e.presentation?.targetId===card.dataset.playerId);
    let marker=card.querySelector('.enemy-threat-marker');
    if(!marker&&marks.length){marker=document.createElement('span');marker.className='enemy-threat-marker';card.appendChild(marker);}
    if(marker){marker.textContent=marks.map(e=>e.presentation.passiveName).join(' · ');marker.hidden=!marks.length;}
  }
}
function syncEnemyArenaVisual(arena) {
  for(const card of document.querySelectorAll('.teammate-card[data-player-id]'))card.classList.toggle('arena-absent',!!arena&&arena.playerId!==card.dataset.playerId);
  for(const node of document.querySelectorAll('.battle-enemy-slot[data-enemy-id]')){
    const absent=!!arena&&!!arena.enemyId&&arena.enemyId!==node.dataset.enemyId;
    node.classList.toggle('enemy-arena-absent',absent);
    node.setAttribute('aria-disabled',String(absent));
    node.tabIndex=absent||node.classList.contains('is-dead')?-1:0;
    if(absent&&document.activeElement===node)node.blur();
  }
}
async function playEnemyMechanicPresentation(step, context={}) {
  const signal=context.signal;
  if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
  const profile=ENEMY_FX_PROFILES[step.presentation?.family]||ENEMY_FX_PROFILES.heavy;
  const speed=Math.max(.1,context.speed||1);
  const reduced=context.reducedMotion||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const duration=reduced?240:profile[3]+(step.presentation?.isUltimate?180:0);
  const root=document.createElement('div');root.className='enemy-effect-overlay';root.style.setProperty('--enemy-fx-color',profile[0]);
  root.setAttribute('aria-live','polite');
  document.body.appendChild(root);
  let frame=0;
  const animations=[];
  const cleanup=()=>{cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());root.remove();};
  signal?.addEventListener('abort',cleanup,{once:true});
  try {
    for(const result of step.results||[]){
      if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
      if(appliedBattleResults.has(result.resultId||result))continue;
      const targetId=resolvePresentationTarget(result,step);
      const label=document.createElement('div');label.className='enemy-effect-caption';
      label.textContent=(step.monsterName||'')+' · '+(step.presentation?.isUltimate?'【大招】':'')+(step.skillName||step.actionId||'')+(step.presentation?.hitCount>1?' '+step.presentation.hitIndex+'/'+step.presentation.hitCount:'')+' → '+(result.targetAfter?.name||result.targetBefore?.name||targetId);root.appendChild(label);
      const effect=document.createElement('div');
      const shape=enemyEventShape(result,step,profile);
      if(shape==='equation')effect.dataset.label=/誤差歸零/.test(step.actionId)?'Σ → 0':result.targetAfter?.mechanics?.error!==undefined?'Σ = '+result.targetAfter.mechanics.error:step.presentation?.isUltimate?'無解證明':'向量崩解';
      effect.className='enemy-effect-shape enemy-effect-'+shape;effect.dataset.reduced=String(!!reduced);effect.style.animationDuration=duration*.65/speed+'ms';effect.hidden=true;root.appendChild(effect);
      const beam=document.createElement('div');beam.className='enemy-effect-link';root.appendChild(beam);
      const projectile=document.createElement('span');projectile.className='enemy-effect-projectile enemy-projectile-'+profile[1];projectile.hidden=true;root.appendChild(projectile);
      const number=document.createElement('div');number.className='enemy-effect-value';number.textContent=enemyEventFeedback(result,step);number.hidden=true;root.appendChild(number);
      let lastRect=null,impacted=false;
      const started=Date.now();
      const place=()=>{
        const target=getVisualAnchor(targetId), source=getVisualAnchor(step.presentation?.visualOriginId||result.sourceId||step.sourceId);
        if(target){const visual=target.element.querySelector('.enemy-sprite-wrap,.teammate-avatar-wrap')||target.element;lastRect=visual.getBoundingClientRect();}
        if(lastRect){
          const r=lastRect,x=r.left+r.width/2,y=r.top+r.height/2;
          effect.style.left=x+'px';effect.style.top=y+'px';
          label.style.left=Math.min(innerWidth-140,Math.max(140,x))+'px';label.style.top=Math.max(10,r.top-46)+'px';
          number.style.left=Math.min(innerWidth-110,Math.max(110,x))+'px';number.style.top=Math.max(12,Math.min(innerHeight-55,r.bottom))+'px';
          if(source&&!reduced&&source.id!==targetId){
            beam.hidden=impacted;beam.style.left=source.x+'px';beam.style.top=source.y+'px';
            beam.style.width=Math.hypot(x-source.x,y-source.y)+'px';beam.style.transform='rotate('+Math.atan2(y-source.y,x-source.x)+'rad)';
            const t=Math.min(1,(Date.now()-started)/(duration*.35/speed));
            projectile.hidden=impacted;projectile.style.left=(source.x+(x-source.x)*t)+'px';projectile.style.top=(source.y+(y-source.y)*t)+'px';
          }else beam.hidden=true;
        }else{effect.hidden=true;beam.hidden=true;label.style.left='50%';label.style.top='35%';number.style.left='50%';number.style.top='45%';}
        frame=requestAnimationFrame(place);
      };
      place();
      if(typeof sfxManager!=='undefined')sfxManager.play(result.kind==='heal'?'heal':result.kind==='shield'?'shield_cast':result.kind==='cleanse'?'cleanse':profile[2],{signal,instance:step.sourceId});
      const source=getVisualAnchor(step.sourceId)?.element;
      const sprite=source?.querySelector('.enemy-sprite-img');
      if(sprite?.animate&&!reduced&&result.kind==='damage')animations.push(sprite.animate([{transform:'translateY(0)'},{transform:'translateY(-5px)'},{transform:'translateY(0)'}],{duration:duration*.35/speed}));
      await waitForPresentation(duration*.35,signal,speed);
      // Commit at the impact, once. The number describes canonical fields only.
      if(applyAuthoritativeResult(result)){
        impacted=true;effect.hidden=!lastRect;beam.hidden=true;projectile.hidden=true;number.hidden=false;
        if(step.presentation&&Object.hasOwn(step.presentation,'arenaAfter'))syncEnemyArenaVisual(step.presentation.arenaAfter);
        const anchor=getEnemyAnchor(targetId);
        if(anchor)syncEnemyMechanicVisual(result.targetAfter,anchor.element);
        const target=getVisualAnchor(targetId)?.element;
        if(target?.animate&&!reduced&&!(result.kind==='damage'&&!(result.actualDamage>0))){
          const image=target.querySelector('.enemy-sprite-img,.teammate-avatar-wrap')||target;
          animations.push(image.animate(result.kind==='death'?[{filter:'brightness(2)',opacity:1},{filter:'grayscale(1)',opacity:.25}]:shape==='claw'?[{transform:'translateX(-5px)'},{transform:'translateX(4px)'},{transform:'none'}]:[{filter:'brightness(1.9)'},{filter:'brightness(1)'}],{duration:duration*.6/speed}));
        }
      }
      await waitForPresentation(duration*.65,signal,speed);
      cancelAnimationFrame(frame);root.replaceChildren();
    }
  }finally{signal?.removeEventListener('abort',cleanup);cleanup();}
}
