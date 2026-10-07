// The drawing engine is an unchanged copy of temp/dreamwaver/dreamweaver-fx.js.
const DREAMWEAVER_BRANCH_COLORS = Object.freeze({mirror:'purple',dissociate:'red',nightmare_weak:'orange',frenzy_backfire:'green',dream_heal:'purple',nightmare:'red',shallow:'purple',deep:'red',horde:'orange',lone:'green'});
// Only the requested assets are allowed during Dreamweaver-owned results.
function dreamweaverAudioScope(audio) {
  return {play:(key,options)=>key?.startsWith('dreamwaver-') ? audio.play(key,{...options,noHold:true}) : Promise.resolve(null),
    playResult:(key,options)=>key?.startsWith('dreamwaver-') ? audio.playResult(key,{...options,noHold:true}) : Promise.resolve(null),hold:async()=>{}};
}
function dreamweaverButterflySound(targetId, type) {
  if(type==='dream_heal')return 'dreamwaver-posi';
  if(type==='nightmare')return 'dreamwaver-nage';
  return targetId === 'monster' ? 'dreamwaver-nage' : null;
}
async function playDreamweaverPresentation(step, context = {}) {
  const audioSignal=context.signal||context.controller?.signal;
  const continuousAudio=createSfxPresentationScope({...context,signal:audioSignal});
  context.dreamweaverAudioSignal=audioSignal;
  return withSkillPresentationStage(step, context, async s => {
    s.root.style.background = 'none';
    context.audioScope = dreamweaverAudioScope(continuousAudio);
    const played = new Set();
    const cue = (key, time) => {if(!key || played.has(key) || s.signal.aborted)return;played.add(key);context.audioScope.play(key);context.onTiming?.('dreamweaver_sfx',{key,time,step});};
    const isResult = step.actionId?.endsWith('_result');
    context.originalDreamweaverFx = true;
    context.dreamweaverOriginalTrigger = isResult;
    const type = isResult ? 'trigger' : step.actionId === 'basic' ? 'attack' : step.actionId === 'dw_butterfly' ? 'skill1' : 'skill2';
    const targetId = step.targetId || step.results?.[0]?.targetId || 'monster';
    const card = s.cards.get(targetId) || s.cards.get('monster') || [...s.cards.values()][0];
    // Skill one uses the same left / center / right composition as skill two,
    // including when the selected recipient is the caster or another ally.
    if(step.actionId?.startsWith('dw_butterfly') && card) {
      s.position(card.parentElement, SKILL_STAGE.target.x, SKILL_STAGE.target.y);
      card.parentElement.style.transform = 'translate(-50%,-50%)';
      s.anchors.set(card.dataset.targetId, {...SKILL_STAGE.target});
      s.actor.style.opacity = '1';
    }
    const target = card?.querySelector('.presentation-result-hit') || s.actor;
    const anchor = card?.querySelector('.presentation-result-portrait') || s.actor;
    const color = DREAMWEAVER_BRANCH_COLORS[step.outcome?.type];
    const reveal = s.el('div', 'skill-reveal');
    reveal.textContent = step.outcome?.label || step.skillName;
    if(['skill1','skill2'].includes(type))reveal.hidden=true;
    const fx = new DreamweaverFX({root:s.frame,caster:s.actor,target,casterAnchor:s.actor,targetAnchor:anchor,backZIndex:1,frontZIndex:5});
    const destroy = () => fx.destroy();
    s.signal.addEventListener('abort', destroy, {once:true});
    let resultTask;
    const resolve = () => {
      if(resultTask || s.signal.aborted) return;
      reveal.style.opacity = '1';
      context.onTiming?.('outcome_reveal', {step});
      if(type==='attack' && step.results?.some(r=>r.kind==='damage' && (r.finalDamage ?? r.amount ?? 0)>0))cue('dreamwaver-pa',fx.time);
      if(isResult && color)cue(dreamweaverButterflySound(card?.dataset.targetId || targetId,step.outcome?.type),fx.time);
      resultTask = s.resolveResults();
    };
    try {
      // Result branches are supplied by the server, never randomly chosen by the renderer.
      fx.play({type,autoplay:false,damage:step.finalDamage ?? 0,skillTarget:anchor,triggerTarget:anchor,
        trigger:isResult && color ? {name:step.outcome.label,color} : null});
      if(['skill1','skill2'].includes(type))cue('dreamwaver-dream',0);
      const contact = isResult ? .08 : type === 'attack' ? DreamweaverFX.timings.attackImpact : DreamweaverFX.timings.infuse;
      const duration=['skill1','skill2'].includes(type)?DreamweaverFX.timings.infuse:fx.duration;
      await s.tick(duration * 1000, p => {
        fx.seek(p * duration);
        if(type==='attack' && fx.time>=.45)cue('dreamwaver-swoosh',fx.time);
        if(type==='attack' && fx.time>=2.4)cue('dreamwaver-rope',fx.time);
        if(fx.time >= contact) resolve();
      });
      if(!s.signal.aborted) {resolve(); await resultTask;}
    } finally {s.signal.removeEventListener('abort', destroy);destroy();}
  });
}
// Repeated hits restart the mark immediately while their audio tails overlap.
const activeDreamOverlays=new WeakMap();
let dreamOverlaySequence=0;
function revealDreamOutcomeButterfly(card, type, context = {}) {
  const color=DREAMWEAVER_BRANCH_COLORS[type];if(!color)return;
  const portrait=card.querySelector('.presentation-result-portrait');if(!portrait)return;
  activeDreamOverlays.get(portrait)?.();
  let fx,deadline;
  const destroy=()=>{
    clearTimeout(deadline);
    fx?.destroy();context.signal?.removeEventListener('abort',destroy);
    if(activeDreamOverlays.get(portrait)===destroy)activeDreamOverlays.delete(portrait);
  };
  fx=new DreamweaverFX({root:portrait,caster:portrait,target:portrait,frontZIndex:8,onComplete:destroy});
  activeDreamOverlays.set(portrait,destroy);
  context.signal?.addEventListener('abort',destroy,{once:true});
  if(context.signal?.aborted){destroy();return;}
  const audio=context.audioScope||createSfxPresentationScope(context);
  const sound=dreamweaverButterflySound(card.dataset.targetId,type);
  if(sound)audio.play(sound,{noHold:true,instance:'dream-hit-'+(++dreamOverlaySequence),signal:context.dreamweaverAudioSignal||context.controller?.signal||context.signal});
  fx.play({type:'trigger',trigger:{name:type==='dream_heal'?'美夢化生':'夢魘成真',color},speed:context.speed||1});
  deadline=setTimeout(destroy,1200/Math.min(2,Math.max(.25,context.speed||1))+100);
}
