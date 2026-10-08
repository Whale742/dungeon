// Production adapter for the approved fixed_v4 choreography. No combat rolls or damage calculations.
const SAMURAI_FX_URLS=Object.freeze(['/assets/samurai-eye.png','/assets/samurai-skill1.png','/assets/samurai-skill2.png',
 '/assets/samurai-fx/zan-full.png','/assets/samurai-fx/zan-split.png','/assets/samurai-fx/swallow-title.png']);
let samuraiFxAssets;
function preloadSamuraiFxAssets(){
 return samuraiFxAssets ||= Promise.all(SAMURAI_FX_URLS.map(src=>{const image=new Image();image.src=src;return image.decode().then(()=>image);})).catch(error=>{samuraiFxAssets=null;throw error;});
}
const samuraiQueueStates=new WeakMap();let samuraiUnscopedState=new Map();
function samuraiQueueState(context){const key=context.signal||context.controller?.signal;if(!key)return samuraiUnscopedState;let state=samuraiQueueStates.get(key);if(!state){state=new Map();samuraiQueueStates.set(key,state);}return state;}
function clearSamuraiPresentationState(context={}){const key=context.signal||context.controller?.signal;if(key)samuraiQueueStates.delete(key);else samuraiUnscopedState.clear();}
function isSamuraiAction(step){return step?.sourceRole==='samurai'&&['basic','sa_cut','sa_tsubame','sa_counter'].includes(step.actionId||step.skillId);}
function samuraiActor(step,id=step.sourceId){return step.hpSnapshotBefore?.players?.find(p=>p.id===id)||step.results?.find(r=>r.targetId===id)?.targetBefore||{id,role:'samurai',name:step.sourceName,hp:step.actorHpBefore,maxHp:step.actorMaxHp,statuses:[]};}
function samuraiMurasame(step,id){
 const supplied=step.samuraiPresentation?.murasame;
 if(supplied!==undefined)return !!supplied;
 const snapshot=step.hpSnapshotBefore?.players?.find(p=>p.id===id);
 const live=typeof roomState!=='undefined'?Object.values(roomState?.players||{}).find(p=>p.id===id):null;
 return (snapshot?.equips||live?.equips||[]).some(e=>e.id==='sa_murasame');
}
function samuraiDamageText(result){const type=result.outcome?.type;if(['miss','dodge'].includes(type))return 'MISS';const n=result.absorbed>0?result.hpDmg:result.finalDamage??result.value;if(result.outcome?.parry&&n>0)return '-'+n;return type==='block'||n===0?'BLOCK':'-'+n;}
function samuraiSoulChanges(step,id,time){
 const before=step.hpSnapshotBefore?.players?.find(p=>p.id===id)?.soul;
 const after=step.hpSnapshot?.players?.find(p=>p.id===id)?.soul;
 return Number.isFinite(before)&&Number.isFinite(after)&&after!==before?[{time,delta:after-before}]:[];
}
function buildSamuraiPresentationPlan(step,context={},mode){
 const id=step.actionId||step.skillId,actor=samuraiActor(step),remembered=samuraiQueueState(context).get(step.sourceId);
 const p={skill:mode||({basic:'attack',sa_cut:'cleave',sa_tsubame:'swallow',sa_counter:'parry'}[id]),valid:step.outcome?.type!=='invalid',duration:860,
  hits:[],slashes:[],incoming:[],audio:[],soulChanges:[],startSouls:actor.soul||0,seed:9,guard:false,options:{curse:false},counterAt:null};
 const results=step.results||[],damage=results.filter(r=>r.targetId==='monster'&&r.kind==='damage');
 const hit=(result,time,kind,angle,extra={})=>{const h={result,time,start:time-18,index:p.hits.length,value:result.finalDamage??result.value,target:'boss',kind,angle,displayText:samuraiDamageText(result),...extra};p.hits.push(h);if(!['miss','dodge'].includes(result.outcome?.type))p.slashes.push(h);p.audio.push({time,type:kind==='arc'?'arc':kind==='counter'?'counter':'slash',power:h.heavy?1.35:1});};
 if(p.skill==='attack'){if(damage[0])hit(damage[0],228,'arc',-.3);p.soulChanges=samuraiSoulChanges(step,step.sourceId,355);}
 if(p.skill==='cleave'){
  // The source split/screen-slice envelopes end at 1685ms; allow their full tail before disposing.
  p.duration=1685;p.burst=step.outcome?.type==='soul_burst';p.lock={start:115,end:668};p.heavyFreeze={start:685,end:748};
  if(damage[0])hit(damage[0],685,'line',-.485,{heavy:true,burst:p.burst,offsetY:8});
  if(p.burst){p.flashAt=685;p.audio.push({time:685,type:'chime',power:.6});}
  if(actor.soul===0)p.buffAt=790;p.soulChanges=samuraiSoulChanges(step,step.sourceId,880);
 }
 if(p.skill==='swallow'){
  p.duration=1950;p.eye={start:240,open:740,end:1110};p.gather={start:120,end:320};
  // Stretch only the prelude; retain the source choreography after opening.
  p.prelude={sourceEnd:p.eye.open,duration:1000};p.introSound='samurai-skill2-intro';
  if(p.valid){damage.forEach((r,i)=>hit(r,1140+i*75,'line',[-.54,.57,-.095,-.81][i],{final:i===3,ignore:true,heavy:i===3,offsetY:[-3,4,-6,0][i]}));for(let i=damage.length;i<4;i++)p.slashes.push({time:1140+i*75,start:1122+i*75,index:i,target:'boss',kind:'line',angle:[-.54,.57,-.095,-.81][i],final:i===3,heavy:i===3,offsetY:[-3,4,-6,0][i]});p.flashAt=1390;p.audio.push({time:1390,type:'finish',power:.85});p.soulChanges=samuraiSoulChanges(step,step.sourceId,1240);}
 }
 if(id==='sa_counter'){
  p.guard=true;p.counterAt=135;p.enemyPhaseEnd=0;p.duration=755;
  p.options.curse=remembered?.curse||false;
  // Retain visual traces from actual received parry results. Never synthesize incoming damage or another counter.
  p.incoming=(remembered?.incoming||[]).map((inc,i)=>({...inc,time:-110-(remembered.incoming.length-1-i)*235,result:undefined}));
  if(damage[0])hit(damage[0],135,'counter',-.16,{heavy:true,echoes:Math.max(0,p.incoming.length-1)});
  p.soulChanges=samuraiSoulChanges(step,step.sourceId,245);
 }
 if(['cleave','swallow'].includes(p.skill)||(id==='sa_counter'&&p.valid&&p.hits.length)){
  p.castSound='samurai-skill';p.suppressImpactAudio=true;
  // Every visual cut has its own cue, including the tail after a lethal server result.
  p.audio=(p.skill==='swallow'&&p.valid?p.slashes:p.hits).map(h=>({time:h.time,type:'slash',power:1,key:id==='sa_counter'?'assassin-pursuit':p.skill==='cleave'||h.index===3?'sword-slash-heavy':'assassin-pursuit'}));
 }
 p.audio.sort((a,b)=>a.time-b.time);return p;
}
// Source time keeps the copied renderer intact while the intro takes one second at 1x.
function samuraiVisualTime(elapsed,plan){const p=plan.prelude;if(!p)return elapsed;return elapsed<p.duration?elapsed*p.sourceEnd/p.duration:elapsed-p.duration+p.sourceEnd;}
function samuraiPlaybackDuration(plan){return plan.duration+(plan.prelude?plan.prelude.duration-plan.prelude.sourceEnd:0);}
function samuraiAbortable(promise,signal){
 return new Promise((resolve,reject)=>{const cancel=()=>{signal?.removeEventListener('abort',cancel);reject(new DOMException('Presentation cancelled','AbortError'));};signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)return cancel();promise.then(v=>{signal?.removeEventListener('abort',cancel);resolve(v);},e=>{signal?.removeEventListener('abort',cancel);reject(e);});});
}
function resolveSamuraiCombatResult(result,card,context){
 if(context.signal?.aborted)return;
 const target=result.targetAfter;updateResultCard(card,target);
 if(target&&typeof applyHpSnapshot==='function')applyHpSnapshot(result.targetId==='monster'?{monster:target}:{players:[target]});
 const emit=beat=>context.onTiming?.(beat,{result,targetId:result.targetId});
 const missed=['miss','dodge'].includes(result.outcome?.type),n=result.finalDamage??result.value;
 if(missed)resultFloat(card,'MISS','is-miss');else if(n>0)resultFloat(card,'-'+(result.absorbed>0?result.hpDmg:n),'is-damage');else resultFloat(card,'格擋','is-guard');
 if(missed)emit('miss');else if(n>0){if(!context.suppressImpactAudio)context.audioScope.play('physical_hit',{noHold:true});emit('impact');}else emit('block');
 if(result.absorbed>0)resultFloat(card,'ABSORB '+result.absorbed,'is-guard');
 if(result.shieldBreak){resultFloat(card,'BREAK','is-guard');if(!context.suppressImpactAudio)context.audioScope.play('shield_break',{noHold:true});}
 emit('damage_float');emit('hp_update');
}
function samuraiSound(event,audio,step){const keys={parry:'samurai_parry',impact:'physical_hit',arc:'warrior_basic',skill:'samurai-skill',slash:'warrior_basic',counter:'warrior_basic',gather:'air_pass',open:'air_pass',chime:'physical_hit',finish:'physical_hit'};return audio.play(event.key||keys[event.type],{noHold:true,volume:event.power,instance:'samurai-'+event.type+'-'+event.time});}
async function runSamuraiChoreography(step,context,plans){
 const parent=context.signal||context.controller?.signal,controller=new AbortController(),signal=controller.signal;
 const abort=()=>controller.abort();parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
 // Tsubame and counter audio belong to the combat queue so its tail survives visual disposal.
 // A real queue cancellation still stops all of its voices via the parent signal.
 const audioSignal=plans.some(x=>x.plan.skill==='swallow'||x.plan.counterAt!=null)?parent:signal;
 const local={...context,signal,audioScope:createSfxPresentationScope({...context,signal:audioSignal})};
 const state=samuraiQueueState(context);let raf=0;const engines=[],animations=new Set();
 try{
  await samuraiAbortable(preloadSamuraiFxAssets(),signal);if(signal.aborted)return;
  getOrCreateCombatStage().classList.add('is-active');
  await withCombatCanvas(local,step.category,async canvas=>{
   canvas.classList.add('samurai-fx-owner');canvas.style.setProperty('--samurai-speed',context.speed||1);canvas.style.animation='none';canvas.style.padding='0';canvas.style.display='block';
   const cards=new Map(),liftedNumbers=new Map();
   const numberOverlay=document.createElement('div');numberOverlay.className='samurai-result-overlay';canvas.appendChild(numberOverlay);
   const liftNumbers=card=>{if(!card||liftedNumbers.has(card))return;const layer=card.querySelector('.presentation-result-numbers');if(!layer)return;card._resultNumbersLayer=layer;numberOverlay.appendChild(layer);liftedNumbers.set(card,layer);};
   const syncLiftedNumbers=()=>{const base=canvas.getBoundingClientRect();for(const [card,layer] of liftedNumbers){const portrait=card.querySelector('.presentation-result-portrait')?.getBoundingClientRect();if(!portrait)continue;Object.assign(layer.style,{left:(portrait.left-base.left)+'px',top:(portrait.top-base.top)+'px',width:portrait.width+'px',height:portrait.height+'px'});}};
   const makeCard=(result)=>{if(cards.has(result.targetId))return cards.get(result.targetId);const card=createResultCard({...result,monsterName:step.monsterName,monsterAvatar:step.monsterAvatar});cards.set(result.targetId,card);return card;};
   const monster=step.hpSnapshotBefore?.monster||step.results?.find(r=>r.targetId==='monster')?.targetBefore||step.hpSnapshot?.monster||{};
   const bossResult={targetId:'monster',targetBefore:monster};
   // Each Samurai target gets its own anchors in the same owned canvas and RAF.
   for(let i=0;i<plans.length;i++){
    const {plan,actorId}=plans[i],actor=samuraiActor(step,actorId);
    const player=makeCard({targetId:actorId,targetBefore:actor}),boss=i===0?makeCard(bossResult):createResultCard({...bossResult,monsterName:step.monsterName,monsterAvatar:step.monsterAvatar});
    const lane=document.createElement('div');lane.className='samurai-fx-owner';canvas.appendChild(lane);
    const engine=createSamuraiPrototypeRenderer(lane,player,boss,plan,local);engines.push(engine);liftNumbers(player);liftNumbers(boss);
    if(i>0){const p=lane.querySelector('.samurai-player');p.style.left=(14.5+i*23)+'%';p.style.top='49%';p.style.width='14%';boss.style.visibility='hidden';engine.measure();}
    // Allocation and decode happen before the playhead starts.
   }
   const other=document.createElement('div');other.className='samurai-other-targets';canvas.appendChild(other);
   for(const result of step.results||[])if(!cards.has(result.targetId))other.appendChild(makeCard(result));
   await samuraiAbortable(Promise.all([...canvas.querySelectorAll('img')].map(img=>img.decode())),signal);
   if(signal.aborted)return;
   local.onTiming?.('action_start',{step});
   const committed=new Set(),scheduled=[];
   for(const {plan,actorId} of plans){
    for(const h of [...plan.hits,...plan.incoming])if(h.result)scheduled.push({time:h.time,result:h.result,plan,actorId,hit:h});
   }
   const sourceDuration=Math.max(...plans.map(x=>x.plan.duration));
   const duration=Math.max(...plans.map(x=>samuraiPlaybackDuration(x.plan)));
   const handled=new Set(scheduled.map(x=>x.result));
   const otherJobs=[],otherErrors=[],previous=new Map();
   const motion=(node,keys,ms)=>{const a=node.animate(keys,{duration:ms/(context.speed||1),fill:'forwards'});animations.add(a);a.finished.catch(()=>{});return a;};
   const track=job=>{otherJobs.push(job.catch(error=>{if(error.name!=='AbortError')otherErrors.push(error);}));};
   for(const [index,result] of (step.results||[]).entries())if(!handled.has(result))scheduled.push({time:step.type==='boss_action'?260+index*235:sourceDuration-100,result,generic:true});
   scheduled.sort((a,b)=>a.time-b.time);
   // Wait for actual intro playback before starting the visual clock.
   const intro=plans.find(x=>x.plan.introSound)?.plan.introSound;
   const cast=plans.find(x=>x.plan.castSound)?.plan.castSound;
   const openingSounds=[];
   if(cast)openingSounds.push(local.audioScope.play(cast,{noHold:true,instance:'samurai-cast'}));
   if(intro)openingSounds.push(local.audioScope.play(intro,{noHold:true,instance:'samurai-intro'}));
   if(openingSounds.length){await samuraiAbortable(Promise.all(openingSounds),signal);if(signal.aborted)return;}
   const start=performance.now();
   if(intro)local.onTiming?.('samurai_intro_start',{step,time:0});
   let audioCursor=0,eventCursor=0,eyeOpened=false;
   const audioEvents=plans.flatMap(({plan})=>plan.audio).sort((a,b)=>a.time-b.time);
   const resize=()=>{for(const engine of engines)engine.measure?.();syncLiftedNumbers();};window.addEventListener('resize',resize);syncLiftedNumbers();
   const stop=()=>{cancelAnimationFrame(raf);raf=0;};signal.addEventListener('abort',stop,{once:true});
   try{
    await new Promise((resolve,reject)=>{
     const cancelled=()=>{stop();reject(new DOMException('Presentation cancelled','AbortError'));};signal.addEventListener('abort',cancelled,{once:true});
     const finish=error=>{stop();signal.removeEventListener('abort',cancelled);error?reject(error):resolve();};
     const draw=now=>{
      if(signal.aborted)return cancelled();
      try{
       const elapsed=Math.min(duration,(now-start)*(context.speed||1));
       const t=samuraiVisualTime(elapsed,plans[0].plan);
       if(intro&&!eyeOpened&&t>=plans[0].plan.eye.open){eyeOpened=true;local.onTiming?.('samurai_eye_open',{step,time:t,elapsed});}
       while(audioCursor<audioEvents.length&&audioEvents[audioCursor].time<=t)samuraiSound(audioEvents[audioCursor++],local.audioScope,step);
       while(eventCursor<scheduled.length&&scheduled[eventCursor].time<=t){
        const e=scheduled[eventCursor++];if(committed.has(e.result))continue;committed.add(e.result);
        if(e.generic){
         const predecessor=previous.get(e.result.targetId);
         const job=(async()=>{if(predecessor)await predecessor;if(!signal.aborted)await presentCombatResult(e.result,cards.get(e.result.targetId),{...local,prewarmed:true,motion});})();
         previous.set(e.result.targetId,job);track(job);
        }
        else{
         local.onTiming?.(e.hit.target==='boss'?'samurai_slash':'samurai_parry',{step,index:e.hit.index,angle:e.hit.angle,time:e.time,first:e.hit.first});
         if(signal.aborted)return cancelled();
         track(presentCombatResult(e.result,cards.get(e.result.targetId),{...local,samuraiOriginalFx:true,suppressImpactAudio:e.plan.suppressImpactAudio}));
        }
       }
       for(const [i,engine] of engines.entries())engine.render(samuraiVisualTime(elapsed,plans[i].plan));syncLiftedNumbers();
       if(local.reducedMotion)for(const engine of engines)engine.reduceFlash?.();
       local.onSamuraiFrame?.({time:t,plans:plans.map(x=>x.plan),canvas});
       if(elapsed>=duration)finish();else raf=requestAnimationFrame(draw);
      }catch(error){finish(error);}
     };raf=requestAnimationFrame(draw);
    });
    await Promise.all(otherJobs);if(otherErrors.length)throw otherErrors[0];if(signal.aborted)return;
    // Death settles after the skill's rapid strikes, never between the four cuts.
    for(const [id,card] of cards){if(!scheduled.some(e=>!e.generic&&e.result.targetId===id))continue;const last=[...(step.results||[])].reverse().find(r=>r.targetId===id);if(last?.targetAfter?.hp<=0&&last.targetBefore?.hp>0){card.classList.add('is-dying');local.onTiming?.(id==='monster'?'boss_death_start':'death_start',{step,targetId:id});await waitForPresentation(650,signal,context.speed||1);local.onTiming?.('death_complete',{step,targetId:id});}}
    if(step.hpSnapshot&&typeof applyHpSnapshot==='function')applyHpSnapshot(step.hpSnapshot);
    if(step.actionId==='sa_counter')state.delete(step.sourceId);
    local.onTiming?.('action_complete',{step});
   }finally{window.removeEventListener('resize',resize);signal.removeEventListener('abort',stop);stop();}
  });
 }finally{parent?.removeEventListener('abort',abort);controller.abort();for(const a of animations)a.cancel();animations.clear();for(const engine of engines)engine.dispose();if(parent?.aborted)clearSamuraiPresentationState(context);}
}
async function playSamuraiBasicPresentation(step,context={}){return runSamuraiChoreography(step,context,[{actorId:step.sourceId,plan:buildSamuraiPresentationPlan(step,context)}]);}
async function playSamuraiIttoryodanPresentation(step,context={}){return playSamuraiBasicPresentation(step,context);}
async function playSamuraiTsubamePresentation(step,context={}){return playSamuraiBasicPresentation(step,context);}
async function playSamuraiKyoutouPresentation(step,context={}){return playSamuraiBasicPresentation(step,context);}
async function playSamuraiPresentation(step,context={}){const id=step.actionId||step.skillId;return ({basic:playSamuraiBasicPresentation,sa_cut:playSamuraiIttoryodanPresentation,sa_tsubame:playSamuraiTsubamePresentation,sa_counter:playSamuraiKyoutouPresentation}[id])(step,context);}
function hasSamuraiParry(step){return step?.type==='boss_action'&&step.results?.some(r=>r.outcome?.parry&&(r.role==='samurai'||r.targetBefore?.role==='samurai'));}
function rememberSamuraiEnemyPhase(step,context={}){
 const ids=[...new Set(step.results.filter(r=>r.outcome?.parry&&(r.role==='samurai'||r.targetBefore?.role==='samurai')).map(r=>r.targetId))];
 const state=samuraiQueueState(context),phaseEnd=260+Math.max(0,step.results.length-1)*235+110;
 const plans=ids.map(actorId=>{
  const actor=samuraiActor(step,actorId),plan={skill:'parry',valid:true,duration:phaseEnd,hits:[],slashes:[],incoming:[],audio:[],soulChanges:[],startSouls:actor.soul||0,seed:9,guard:true,options:{curse:false},enemyPhaseEnd:phaseEnd};
  const hits=step.results.filter(r=>r.targetId===actorId&&r.kind==='damage');
  hits.forEach((result,i)=>{const time=260+step.results.indexOf(result)*235,taken=result.finalDamage??result.value;plan.incoming.push({result,time,taken,value:taken,target:'player',index:i,guard:!!result.outcome?.parry,first:i===0,displayText:samuraiDamageText(result)});plan.audio.push({time,type:result.outcome?.parry?'parry':'impact',power:i===0?1:.65});});
  plan.options.curse=hits.some(r=>r.outcome?.parry&&(r.finalDamage??r.value)>0)||samuraiMurasame(step,actorId);
  if(plan.options.curse)for(const h of plan.incoming)if(h.guard&&h.displayText==='BLOCK')h.displayText='減傷 50%';
  const gainAt=plan.incoming.find(h=>h.guard)?.time??260;plan.soulChanges=samuraiSoulChanges(step,actorId,gainAt);
  state.set(actorId,{incoming:plan.incoming.filter(h=>h.guard),curse:plan.options.curse});return {actorId,plan};
 });
 return plans;
}

function flashSamuraiParryPortrait(card,context={}){
 const img=card.querySelector('.presentation-result-portrait img');if(!img)return;
 const animation=img.animate([{filter:'brightness(1)'},{filter:'brightness(0) invert(1)',offset:.18},{filter:'brightness(1)'}],{duration:220/(context.speed||1)});
 const cancel=()=>animation.cancel();context.signal?.addEventListener('abort',cancel,{once:true});
 animation.finished.catch(()=>{}).finally(()=>context.signal?.removeEventListener('abort',cancel));
 context.onTiming?.('samurai_parry_flash',{targetId:card.dataset.targetId});
}
if(typeof window!=='undefined')Object.assign(window,{preloadSamuraiFxAssets,playSamuraiBasicPresentation,playSamuraiIttoryodanPresentation,playSamuraiTsubamePresentation,playSamuraiKyoutouPresentation,playSamuraiPresentation});
