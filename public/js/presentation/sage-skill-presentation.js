// Production queue owns results, audio, cancellation and authoritative snapshots.
// The renderer only receives skill/phase/time and current scene coordinates.
function sagePresentationData(step) {
  if(step.sagePresentation)return step.sagePresentation;
  const before=step.hpSnapshotBefore?.players?.find(p=>p.id===step.sourceId);
  const after=step.hpSnapshot?.players?.find(p=>p.id===step.sourceId);
  return {sagePhase:before?.sagePhase,operandBefore:before?.sageOperand,
    operandAfter:after?.sageOperand,xBefore:before?.sageX,xAfter:after?.sageX};
}
const SAGE_SKILL_CUES=Object.freeze({
  basic:{skill:'basic',hit:550,duration:750,gap:160},
  sge_deduce:{skill:'vector',hit:1050,duration:1500,gap:25},
  sge_induce:{skill:'momentum',hit:1100,hypothesisHit:1090,duration:1500,gap:160}
});
async function playSageSkillPresentation(step,context={}) {
  const data=sagePresentationData(step),solve=data.sagePhase==='solve',cue=SAGE_SKILL_CUES[step.actionId];
  const hit=!solve&&cue.hypothesisHit||cue.hit;
  // Prototype's 3.25s hypothesis includes a simulated enemy turn. In production
  // that idle/capture section lives with the real sampling status, not this cast.
  // The original hook signals handoff at .24s. Its later placeholder hold is
  // replaced by the already queued production equation, never a second effect.
  const duration=cue.duration+(solve?cue.gap+240:0);
  sageSamplingVisuals.casting.add(step.sourceId);
  try {
    await withSkillPresentationStage(step,{...context,castAudioNoHold:true},async s=>{
      const canvas=s.el('canvas','sage-skill-canvas');canvas.setAttribute('aria-hidden','true');
      const renderer=createSageSkillRenderer(canvas);
      let time=0,ended=false,contact=false;
      const draw=()=>{
        if(ended)return;renderer.clear(1440,810);
        const source=s.anchors.get(step.sourceId)||SKILL_STAGE.actor;
        const target=s.anchors.get('monster')||s.anchors.get(step.targetId)||SKILL_STAGE.target;
        renderer.render(cue.skill,Math.min(time,cue.duration)/1000,solve,source,target,
          solve&&time>cue.duration+cue.gap?(time-cue.duration-cue.gap)/1000:null);
      };
      if(!s.local?.battlefield){
        let origin;
        s.startRenderer(elapsed=>{origin??=elapsed;time=(elapsed-origin)*1000;draw();});
      }
      if(s.local?.battlefield){
        // A single production timeline commits the server results once at the
        // authored contact frame. Rings, flashes and fragments emit no results.
        await s.timeline(duration,p=>{
          time=p*duration;draw();
          if(!contact&&time>=hit){
            contact=true;commitBattlefieldGroup(s,step,step.results||[]);
            context.onTiming?.('sage_projectile_contact',{step});
          }
        });
      }else{
        // Legacy result-card stage uses its existing result presentation path.
        await s.wait(hit);if(s.signal.aborted)return;
        context.onTiming?.('sage_projectile_contact',{step});
        await s.resolveResults({fastResult:true,immediateImpact:true,applyFinalSnapshot:false});
        await s.wait(Math.max(0,duration-time));
      }
      if(s.signal?.aborted)return;
      ended=true;canvas.remove();
      if(step.hpSnapshot&&typeof applyHpSnapshot==='function')applyHpSnapshot(step.hpSnapshot);
      context.onTiming?.('sage_operand_update',{step,data});
      if(solve)context.onTiming?.('sage_equation_handoff',{step});
    });
  }finally{sageSamplingVisuals.casting.delete(step.sourceId);}
  if(!context.signal?.aborted)context.onTiming?.('sage_skill_exit',{step});
}

// All persistent sampling models share one viewport canvas and one RAF. Portrait
// status reconciliation owns membership; no per-hit DOM, timer or resource state.
const sageSamplingVisuals={models:new Map(),casting:new Set(),canvas:null,renderer:null,raf:0};
function clearSageSamplingIndicators(){
  const v=sageSamplingVisuals;cancelAnimationFrame(v.raf);v.raf=0;
  v.canvas?.remove();v.canvas=v.renderer=null;v.models.clear();v.casting.clear();
}
function syncSageSamplingIndicator(entity,layer) {
  const v=sageSamplingVisuals,id=entity?.id;
  if(!id)return;
  if(!entity.sageSampling||entity.hp<=0){v.models.delete(id);if(!v.models.size)clearSageSamplingIndicators();return;}
  const model=v.models.get(id)||{born:performance.now(),captures:[]};
  model.layer=layer;v.models.set(id,model);
  if(v.raf)return;
  if(!v.canvas){
    v.canvas=document.createElement('canvas');v.canvas.className='sage-sampling-canvas';
    v.canvas.setAttribute('aria-hidden','true');document.body.appendChild(v.canvas);
    v.renderer=createSageSkillRenderer(v.canvas);
  }
  const draw=now=>{
    v.raf=0;if(!v.canvas)return;
    v.renderer.clear(innerWidth,innerHeight);
    for(const [id,m] of v.models){
      if(!m.layer.isConnected){v.models.delete(id);continue;}
      m.captures=m.captures.filter(c=>(now-c.at)*c.speed<500);
      if(v.casting.has(id))continue;
      const a=typeof getBattleEffectAnchor==='function'?getBattleEffectAnchor(id):null;
      const r=(a?.element||m.layer.closest('.portrait-root')||m.layer).getBoundingClientRect();
      if(!r.width||!r.height)continue;
      const anchor=a||{x:r.left+r.width/2,y:r.top+r.height/2};
      const radius=Math.max(32,Math.min(90,(a?.rect.width||r.width)*.7));
      v.renderer.sampling((now-m.born)/1000,anchor,radius,m.captures.map(c=>(now-c.at)/1000*c.speed));
    }
    if(v.models.size)v.raf=requestAnimationFrame(draw);else clearSageSamplingIndicators();
  };
  v.raf=requestAnimationFrame(draw);
}
async function playSageMomentumCapture(result,card,context={}) {
  if(!result.sageMomentumCapture||context.signal?.aborted)return;
  const id=resolvePresentationTarget(result);
  // This payload is emitted by p8RecordDamage only for accepted enemy_direct
  // HP/shield absorption. Never infer eligibility from client damage amounts.
  const target=result.targetAfter;
  if(target?.hp<=0){sageSamplingVisuals.models.delete(id);return;}
  let model=sageSamplingVisuals.models.get(id);
  if(!model){
    const root=typeof getActorAnchor==='function'?getActorAnchor(id)?.element:card;
    const layer=root?.querySelector('.status-fx-surface')||root;
    if(layer&&target?.sageSampling){syncSageSamplingIndicator({...target,id},layer);model=sageSamplingVisuals.models.get(id);}
  }
  if(model)model.captures.push({at:performance.now(),speed:context.speed||1});
  context.onTiming?.('sage_capture',{result});
  await waitForPresentation(500,context.signal,context.speed||1);
}
if(typeof window!=='undefined')window.addEventListener('pagehide',clearSageSamplingIndicators);

async function playSageEquationOutcome(s,step,context,operand,variable) {
  const o=step.outcome;
  if(o.xBefore==null||o.xAfter==null)return;
  const panel=s.el('div','sage-x-breakdown');
  const labels={SUCCESS:'推演成功',CONFUSION:'思緒紊亂',NOTHING:'無事發生'};
  const title=s.el('strong','',null,panel);title.textContent=labels[o.resolution]||'';
  for(const text of [`變量 X：${o.xBefore}`,`自然衰減：-${o.decayAmount}`,`固定成長：+${o.baseXGain}`,`推演額外：+${o.bonusXGain}`,`最終 X：${o.xAfter}`]){
    const n=s.el('span','',null,panel);n.textContent=text;
  }
  if(o.debtScheduled){const debt=s.el('small','',null,panel);debt.textContent=`下次可行動支付 ${o.debtScheduled} X`;}
  s.animate(panel,[{opacity:0},{opacity:1}],300);
  await s.wait(300);if(s.signal.aborted)return;
  context.onTiming?.('sage_variable_outcome',{step});await s.wait(180);
}
