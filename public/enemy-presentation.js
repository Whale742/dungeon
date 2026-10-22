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
function battleFeedbackEntries(result) {
  const entries=[],add=(text,type)=>entries.push({text,type});
  if(result.actualHpDamage>0)add('-'+result.actualHpDamage,'damage');
  if(result.actualAbsorbed>0)add('🛡 -'+result.actualAbsorbed,'shield');
  // Legacy overheal results include shield gain in actualHeal. Separate that
  // existing contract without inventing another HP or damage event.
  const heal=result.kind==='heal'?Math.max(0,(result.actualHeal||0)-(result.actualShield||0)):result.actualHeal||0;
  if(heal>0)add('+'+heal,'heal');
  if(result.actualShield>0)add('🛡 +'+result.actualShield,'shield');
  const outcome=result.outcome?.type;
  if(['miss','dodge'].includes(outcome))add('MISS','outcome');
  else if(['immune','immunity','resisted'].includes(outcome))add('免疫','outcome');
  else if(result.outcome?.parry||['block','blocked','guard'].includes(outcome))add('格擋','outcome');
  if(result.isCrit||result.outcome?.critical||['crit','critical'].includes(outcome))add('暴擊','outcome');
  return entries;
}
function enemyEventFeedback(result) {return battleFeedbackEntries(result).map(e=>e.text).join(' ');}
function getBattleEffectAnchor(id) {
  const anchor=getVisualAnchor(id);if(!anchor)return null;
  const visual=anchor.element.querySelector('.enemy-sprite-wrap,.teammate-avatar-wrap')||anchor.element;
  const rect=visual.getBoundingClientRect();return {...anchor,rect,x:rect.left+rect.width/2,y:rect.top+rect.height/2};
}
function positionBattleFeedback(node,id,lane=0,occupied=[]) {
  const anchor=getVisualAnchor(id);if(!anchor){node.hidden=true;return;}
  const r=anchor.element.getBoundingClientRect(),w=Math.max(34,node.offsetWidth||48),h=22;
  const obstacles=[...document.querySelectorAll('.battle-enemy-slot,.teammate-card')].map(n=>n.getBoundingClientRect());
  const candidates=[];
  for(let row=0;row<8;row++){
    candidates.push([r.left+r.width/2,r.top-18-(row+lane)*24]);
    candidates.push([r.right+w/2+8,r.top+18+row*24],[r.left-w/2-8,r.top+18+row*24]);
    candidates.push([r.left+r.width/2,r.bottom+18+(row+lane)*24]);
  }
  const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  let best,score=Infinity;
  for(const [x,y] of candidates){
    if(x-w/2<4||x+w/2>innerWidth-4||y-h/2<4||y+h/2>innerHeight-4)continue;
    const box={left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2};
    const cost=[...obstacles,...occupied].reduce((sum,b)=>sum+overlap(box,b),0);
    if(cost<score){best={x,y,box};score=cost;}if(cost===0)break;
  }
  if(!best){const x=Math.min(innerWidth-w/2-4,Math.max(w/2+4,anchor.x)),y=18+lane*24;best={x,y,box:{left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2}};}
  node.style.left=best.x+'px';node.style.top=best.y+'px';node.hidden=false;occupied.push(best.box);
}
const enemyCueQueues=new WeakMap();
function firstEnemyCastCue(step,context) {
  const signal=context.signal||context.controller?.signal;
  if(!signal)return !(step.presentation?.hitIndex>1);
  let cues=enemyCueQueues.get(signal);if(!cues){cues=new Set();enemyCueQueues.set(signal,cues);}
  const key=step.sourceId+':'+step.actionId;if(cues.has(key))return false;cues.add(key);return true;
}
function announceBattleFeedback(text) {
  let live=document.getElementById('battleFeedbackLive');
  if(!live){live=document.createElement('div');live.id='battleFeedbackLive';live.className='battle-feedback-sr';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');document.body.appendChild(live);}
  if(live.textContent!==text)live.textContent=text;
}
function enemyDisplayStatuses(enemy) {
  const statuses=new Map((enemy.statuses||[]).map(s=>[s.id,{...s}]));
  for(const [id,label,icon] of [['poison','中毒','poison'],['burn','燃燒','fire'],['fracture','骨折','bone'],['chill','寒冷','snowflake'],['corrosion','腐蝕','flask']])
    if(enemy[id+'Turns']>0&&!statuses.has(id))statuses.set(id,{id,label,icon,turns:enemy[id+'Turns'],value:enemy[id+'Dmg']});
  if(enemy.isWeakened&&!statuses.has('weakened'))statuses.set('weakened',{id:'weakened',label:'負傷',icon:'status'});
  if(enemy.talismans?.length&&!statuses.has('talismans')){const names={blind:'障目',seal:'封勁',corrode:'蝕體',confuse:'惑心',drain:'抽髓'};statuses.set('talismans',{id:'talismans',label:'符咒',icon:'status',stacks:enemy.talismans.length,value:enemy.talismans.map(t=>names[t]||t).join('、')});}
  return [...statuses.values()];
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
  const row=node.querySelector('.enemy-status-row');
  let badge=node.querySelector('.enemy-mechanic-state');
  if(!badge){badge=document.createElement('span');badge.className='enemy-mechanic-state';}
  if(row){row.replaceChildren(badge);}else if(!badge.parentElement)node.appendChild(badge);
  const states=enemyDisplayStatuses(enemy).filter(s=>s.id!=='enemy_mechanic'||!resource&&['treasure_mimic','abyss_sage','abyss_druid'].includes(info.mechanicId));
  badge.replaceChildren();
  for(const s of enemy.hp>0?states.slice(0,3):[]){
    const icon=document.createElement('span');icon.className='enemy-status-badge';icon.setAttribute('aria-hidden','true');
    const count=s.id==='enemy_mechanic'&&typeof s.value==='number'?s.value:typeof s.stacks==='number'?s.stacks:null;
    icon.innerHTML=s.id==='enemy_mechanic'?(info.mechanicId==='abyss_sage'?'Σ':info.mechanicId==='treasure_mimic'?(enemy.mechanics?.open?'◇':'▣'):'↻'):getIconSvg(s.icon||'status','ui-icon--sm');
    if(count!==null){const n=document.createElement('small');n.textContent=String(count);icon.appendChild(n);}badge.appendChild(icon);
  }
  if(enemy.hp>0&&states.length>3){const extra=document.createElement('span');extra.className='enemy-status-badge enemy-status-overflow';extra.textContent='+'+(states.length-3);badge.appendChild(extra);}
  badge.hidden=enemy.hp<=0||!states.length;badge.setAttribute('aria-label',states.length+' 項狀態，開啟敵人資訊查看');
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
  const dangers=[];
  for(const enemy of enemies||[]){
    const p=enemy.presentation;
    const danger=enemy.hp>0&&p&&(p.ultimateReady||p.targetId||p.immunity||enemy.mechanics?.transformRound);
    const node=getEnemyAnchor(enemy.instanceId)?.element;
    let marker=node?.querySelector('.enemy-danger-marker');
    if(node&&!marker){marker=document.createElement('span');marker.className='enemy-danger-marker';node.appendChild(marker);}
    if(marker){marker.hidden=!danger||!!p?.ultimateReady;marker.textContent=p?.immunity?'◈':enemy.mechanics?.transformRound?'↻':'⌖';marker.setAttribute('aria-label',p?.immunity?'本回合免傷':enemy.mechanics?.transformRound?'下回合變形':'已鎖定目標');}
    if(danger)dangers.push({enemy,p,priority:p.ultimateReady?4:p.immunity?3:enemy.mechanics?.transformRound?2:1});
  }
  dangers.sort((a,b)=>b.priority-a.priority);
  const first=dangers[0],others=dangers.length-1;
  const text=first?'⚠ '+(first.p.ultimateReady?'本回合：'+first.p.ultimateName:first.p.immunity?'本回合免傷':first.enemy.mechanics?.transformRound?'下回合變形':'瞄準：'+(first.p.targetName||'鎖定目標'))+(first.p.ultimateReady&&first.p.targetName?' → '+first.p.targetName:'')+(others>0?' · 另 '+others+' 名警戒':''):'';
  if(list.textContent!==text)list.textContent=text;
  list.hidden=!first;
  for(const card of document.querySelectorAll('.teammate-card[data-player-id]')){
    const marks=(enemies||[]).filter(e=>e.hp>0&&e.presentation?.targetId===card.dataset.playerId);
    let marker=card.querySelector('.enemy-threat-marker');
    if(!marker&&marks.length){marker=document.createElement('span');marker.className='enemy-threat-marker';card.appendChild(marker);}
    if(marker){marker.textContent='⌖'+(marks.length>1?' '+marks.length:'');marker.hidden=!marks.length;marker.setAttribute('aria-label',marks.length+' 名敵人鎖定');marker.title=marks.map(e=>e.name+'：'+e.presentation.targetHint).join('\n');}
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
  const signal=context.signal;if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
  const profile=ENEMY_FX_PROFILES[step.presentation?.family]||ENEMY_FX_PROFILES.heavy,speed=Math.max(.1,context.speed||1);
  const reduced=context.reducedMotion||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const root=document.createElement('div');root.className='enemy-effect-overlay';root.style.setProperty('--enemy-fx-color',profile[0]);root.setAttribute('aria-hidden','true');document.body.appendChild(root);
  let frame=0;const animations=[];
  const cleanup=()=>{cancelAnimationFrame(frame);for(const a of animations)a.cancel();root.remove();};
  signal?.addEventListener('abort',cleanup,{once:true});
  const firstCue=firstEnemyCastCue(step,context);
  if(step.presentation?.isUltimate&&firstCue){const cue=document.createElement('div');cue.className='enemy-effect-caption';cue.textContent=step.skillName||step.actionId;cue.style.animationDuration=900/speed+'ms';root.appendChild(cue);}
  try{
    for(const result of step.results||[]){
      if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
      if(appliedBattleResults.has(result.resultId||result))continue;
      const targetId=resolvePresentationTarget(result,step),owned=document.createElement('div');root.appendChild(owned);
      const custom=typeof createEnemyChoreography==='function'?createEnemyChoreography(step,result,owned,{reduced,animations,speed}):null;
      const duration=custom?.duration||(reduced?400:profile[3]),contact=custom?.contact||.35;
      const effect=document.createElement('div'),shape=enemyEventShape(result,step,profile);
      effect.className='enemy-effect-shape enemy-effect-'+shape;effect.dataset.reduced=String(!!reduced);effect.style.animationDuration=duration*(1-contact)/speed+'ms';effect.hidden=true;owned.appendChild(effect);
      if(shape==='equation')effect.dataset.label='Σ';
      const beam=document.createElement('div');beam.className='enemy-effect-link';beam.hidden=true;owned.appendChild(beam);
      const projectile=document.createElement('span');projectile.className='enemy-effect-projectile enemy-projectile-'+profile[1];projectile.hidden=true;owned.appendChild(projectile);
      const numbers=[];let lastRect=null,impacted=false,impactTime=Infinity;
      const start=performance.now();
      const place=()=>{
        const target=getBattleEffectAnchor(targetId),source=getBattleEffectAnchor(step.presentation?.visualOriginId||result.sourceId||step.sourceId);
        if(target)lastRect=target.rect;
        custom?.render(Math.min(1,(performance.now()-start)/(duration/speed)));
        if(lastRect){
          const r=lastRect,x=r.left+r.width/2,y=r.top+r.height/2;effect.style.left=x+'px';effect.style.top=y+'px';
          const occupied=[];numbers.forEach((n,i)=>{if(performance.now()-impactTime<750/speed)positionBattleFeedback(n,targetId,i,occupied);else n.hidden=true;});
          if(!custom&&source&&!reduced&&source.id!==targetId&&!impacted){
            beam.hidden=false;beam.style.left=source.x+'px';beam.style.top=source.y+'px';beam.style.width=Math.hypot(x-source.x,y-source.y)+'px';beam.style.transform='rotate('+Math.atan2(y-source.y,x-source.x)+'rad)';
            const t=Math.min(1,(performance.now()-start)/(duration*contact/speed));projectile.hidden=false;projectile.style.left=(source.x+(x-source.x)*t)+'px';projectile.style.top=(source.y+(y-source.y)*t)+'px';
          }else{beam.hidden=true;projectile.hidden=true;}
        }else{effect.hidden=true;beam.hidden=true;projectile.hidden=true;numbers.forEach(n=>n.hidden=true);}
        frame=requestAnimationFrame(place);
      };
      place();
      if(custom&&typeof sfxManager!=='undefined')sfxManager.play(custom.windupSfx,{signal,volume:.3});
      await waitForPresentation(duration*contact,signal,speed);
      if(applyAuthoritativeResult(result)){
        impacted=true;impactTime=performance.now();effect.hidden=!!custom||!lastRect;beam.hidden=true;projectile.hidden=true;
        for(const entry of battleFeedbackEntries(result)){const n=document.createElement('div');n.className='enemy-effect-value battle-feedback';n.dataset.kind=entry.type;n.textContent=entry.text;n.style.animationDuration=750/speed+'ms';owned.appendChild(n);numbers.push(n);}
        if(typeof sfxManager!=='undefined')sfxManager.play(custom?.impactSfx||(result.kind==='heal'?'heal':result.kind==='shield'?'shield_cast':result.kind==='cleanse'?'cleanse':profile[2]),{signal,instance:step.sourceId});
        if(result.outcome?.parry&&result.targetBefore?.role==='samurai'){effect.hidden=!lastRect;effect.classList.add('battlefield-parry');if(typeof sfxManager!=='undefined')sfxManager.play('samurai_parry',{signal,noHold:true});}
        if(step.presentation&&Object.hasOwn(step.presentation,'arenaAfter'))syncEnemyArenaVisual(step.presentation.arenaAfter);
        const anchor=getEnemyAnchor(targetId);if(anchor)syncEnemyMechanicVisual(result.targetAfter,anchor.element);
        const target=getBattleEffectAnchor(targetId)?.element;
        if(target?.animate&&!reduced&&!(result.kind==='damage'&&!(result.actualDamage>0))){
          const image=target.querySelector('.enemy-sprite-img,.teammate-avatar-wrap')||target;
          const keys=result.kind==='death'?[{filter:'brightness(2)',opacity:1},{filter:'grayscale(1)',opacity:.25}]:custom&&step.presentation.mechanicId==='banshee'?[{transform:'translateX(-3px) skewX(2deg)',filter:'saturate(.2)'},{transform:'translateX(3px) skewX(-2deg)',offset:.3},{transform:'none',filter:'none'}]:shape==='claw'?[{transform:'translateX(-5px)'},{transform:'translateX(4px)'},{transform:'none'}]:[{filter:'brightness(1.5)'},{filter:'brightness(1)'}];
          animations.push(image.animate(keys,{duration:Math.min(480,duration*.5)/speed}));
        }
      }
      await waitForPresentation(Math.max(duration*(1-contact),numbers.length?750:0),signal,speed);
      cancelAnimationFrame(frame);custom?.remove();owned.remove();
    }
    if(firstCue){
      const audible=(step.results||[]).filter(r=>battleFeedbackEntries(r).length),targets=new Set(audible.map(r=>resolvePresentationTarget(r,step)));
      if(audible.length)announceBattleFeedback((step.presentation?.isUltimate?step.skillName+' · ':'')+(targets.size>1?targets.size+' 個目標受影響':(audible[0].targetAfter?.name||'目標')+' '+battleFeedbackEntries(audible[0]).slice(0,2).map(e=>e.text).join(' ')));
    }
  }finally{signal?.removeEventListener('abort',cleanup);cleanup();}
}
