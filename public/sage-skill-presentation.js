// Choreography only: every displayed number is a server field. The shared stage
// owns animations, cancellation, audio, impact and authoritative HP rendering.
function sagePresentationData(step) {
  if(step.sagePresentation)return step.sagePresentation;
  const before=step.hpSnapshotBefore?.players?.find(p=>p.id===step.sourceId);
  const after=step.hpSnapshot?.players?.find(p=>p.id===step.sourceId);
  return {sagePhase:before?.sagePhase,operandBefore:before?.sageOperand,
    operandAfter:after?.sageOperand,xBefore:before?.sageX,xAfter:after?.sageX,actualDamage:step.finalDamage};
}
function sageOperandAnchor(s,value) {
  // One temporary operand anchor, not a second resource HUD. The existing battle
  // HUD remains the owner of 變量(X), 運算元 and phase.
  const n=s.el('div','sage-skill-operand');s.position(n,260,595);
  const label=s.el('small','',null,n);label.textContent='運算元';
  const number=s.el('span','sage-skill-number',null,n);number.textContent=String(value??'—');
  return {node:n,number};
}
function sageVector(s,offset=0) {
  const line=s.el('div','sage-vector-line');s.position(line,320,430);
  line.style.width='850px';
  for(const left of [150,360,590]){const tick=s.el('i','sage-vector-tick',null,line);tick.style.left=left+'px';}
  if(offset)s.animate(line,[{transform:`translateY(${offset}px) rotate(${offset*.12}deg)`,opacity:.35},{transform:'translateY(0) rotate(0)',opacity:.95}],230);
  return line;
}
function sageImpulse(s,x,y) {
  const n=s.el('div','sage-vector-impulse');s.position(n,x,y);
  s.animate(n,[{opacity:.8,transform:'scaleX(.15)'},{opacity:0,transform:'scaleX(1)'}],160);
}
function sageScan(s,anchor) {
  const n=s.el('i','sage-skill-scan',null,anchor.node);
  s.animate(n,[{opacity:.8,transform:'translateY(-20px)'},{opacity:0,transform:'translateY(20px)'}],260);
}
async function sageOperandFeedback(s,step,data,anchor) {
  const solve=data.sagePhase==='solve',id=step.actionId;
  if(id==='sge_induce'&&solve){
    const cue=s.el('span','sage-momentum-cue');
    cue.textContent=`${data.operandBefore} + ${data.operandDelta} = ${data.operandAfter}`;s.position(cue,260,565);
    s.root.dataset.operandOperation='add';
    sageScan(s,anchor);
    s.animate(cue,[{opacity:0,transform:'translate(-50%,calc(-50% - 8px))'},{opacity:1,transform:'translate(-50%,-50%)'}],260);
    await s.wait(260);if(s.signal.aborted)return;
    cue.remove();anchor.number.textContent=String(data.operandAfter);
    sageImpulse(s,260,604);await s.wait(200);return;
  }
  if(id==='sge_induce'){
    const frame=s.el('div','sage-sampling-frame');s.position(frame,260,430);
    frame.innerHTML=sageSamplingMarkup();sageScan(s,anchor);await s.wait(280);return;
  }
  const replace=!solve&&id==='basic';
  if(!solve){
    const ghost=s.el('span','sage-skill-damage-ghost');ghost.textContent=String(data.actualDamage);s.position(ghost,1170,430);
    const returnLine=s.el('div','sage-vector-line');s.position(returnLine,260,604);returnLine.style.width='927px';returnLine.style.rotate='-.189rad';
    s.animate(returnLine,[{opacity:.25},{opacity:0}],replace?220:280);
    s.animate(ghost,s.reduced?[{opacity:.45},{opacity:0}]:[{opacity:.65,transform:'translate(-50%,-50%)'},{opacity:.25,transform:'translate(calc(-50% - 910px),calc(-50% + 174px))'}],replace?220:280);
  }
  const cue=s.el('span','sage-skill-delta',null,anchor.node);
  // Fixed skill cues communicate the rule; all operands still come from payload.
  if(!replace)cue.textContent=solve?(id==='basic'?'+2':'+5'):'+'+data.actualDamage;
  if(solve&&id==='basic'){
    const calibration=s.el('i','sage-skill-two-ticks',null,anchor.node),marker=s.el('b','',null,calibration);
    s.animate(marker,[{transform:'translateX(0)'},{transform:'translateX(12px)',offset:.5},{transform:'translateX(24px)'}],220);
  }else sageScan(s,anchor);
  await s.wait(replace?220:280);if(s.signal.aborted)return;
  anchor.number.textContent=String(data.operandAfter);cue.remove();
  s.root.dataset.operandOperation=replace?'replace':solve?'increment':'add';
}
async function playSageSkillPresentation(step,context={}) {
  const data=sagePresentationData(step),basic=step.actionId==='basic',vector=step.actionId==='sge_deduce';
  const parentSignal=context.signal;
  let prepared;
  const prepareStage=s=>{
    s.root.classList.add('sage-skill-stage');s.root.dataset.sagePhase=data.sagePhase||'';
    const anchor=sageOperandAnchor(s,data.operandBefore);
    const lines=vector?[sageVector(s),sageVector(s)]:[sageVector(s)];
    const point=s.el('div','sage-vector-mass');s.position(point,320,430);
    let contour;
    if(vector){contour=s.el('div','sage-vector-contour');s.position(contour,1170,430);}
    prepared={anchor,lines,point,contour};
  };
  await withSkillPresentationStage(step,{...context,castAudioNoHold:true,prepareStage},async s=>{
    const {anchor,lines,point,contour}=prepared;
    if(vector){
      lines.forEach((line,i)=>{const offset=i?9:-9;s.animate(line,[{transform:`translateY(${offset}px) rotate(${offset*.12}deg)`,opacity:.35},{transform:'translateY(0) rotate(0)',opacity:.95}],230);});
      await s.wait(230);
    }
    if(s.reduced){s.position(point,1170,430);s.animate(point,[{opacity:0},{opacity:.65}],120);}
    else s.animate(point,[{transform:'translate(-50%,-50%)'},{transform:'translate(calc(-50% + 850px),-50%)'}],basic?200:250);
    await s.wait(basic?200:250);if(s.signal.aborted)return;
    point.style.opacity='0';for(const line of lines)s.animate(line,[{opacity:.7},{opacity:0}],180);
    if(contour)s.animate(contour,[{opacity:.3,transform:'translate(-50%,-50%)'},{opacity:0,transform:'translate(-50%,calc(-50% + 8px))'}],160);
    sageImpulse(s,1170,430);context.onTiming?.('sage_projectile_contact',{step});
    await s.resolveResults({fastResult:true,immediateImpact:true,applyFinalSnapshot:false});if(s.signal.aborted)return;
    await sageOperandFeedback(s,step,data,anchor);
    if(!s.signal.aborted&&step.hpSnapshot&&typeof applyHpSnapshot==='function')applyHpSnapshot(step.hpSnapshot);
    context.onTiming?.('sage_operand_update',{step,data});await s.wait(basic?60:100);
  });
  if(!parentSignal?.aborted)context.onTiming?.('sage_skill_exit',{step});
}
function sageSamplingMarkup(){return '<i></i><i></i><i></i><i></i><b></b><em></em>';}
function syncSageSamplingIndicator(entity,layer) {
  let n=layer.querySelector('.sage-sampling-indicator');
  if(!entity?.sageSampling||entity.hp<=0){n?.remove();return;}
  if(!n){n=document.createElement('div');n.className='sage-sampling-indicator';n.innerHTML=sageSamplingMarkup();layer.appendChild(n);}
}
function clearSageSamplingIndicators(){document.querySelectorAll('.sage-sampling-indicator').forEach(n=>n.remove());}
async function playSageMomentumCapture(result,card,context={}) {
  const d=result.sageMomentumCapture;if(!d||context.signal?.aborted)return;
  const root=document.createElement('div');root.className='sage-momentum-feedback';
  root.textContent=`運算元 ${d.operandBefore} +${d.delta}`;card.appendChild(root);
  const ghost=document.createElement('span');ghost.className='sage-momentum-capture-ghost';ghost.textContent=String(d.delta);root.appendChild(ghost);
  const reduced=context.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const a=root.animate([{opacity:.75,transform:'translateY(-12px)'},{opacity:1,transform:'translateY(0)'}],{duration:(reduced?80:200)/(context.speed||1),fill:'forwards'});
  const flow=ghost.animate(reduced?[{opacity:.4},{opacity:0}]:[{opacity:.6,transform:'translate(55px,-140px)'},{opacity:0,transform:'translate(0,0)'}],{duration:(reduced?80:200)/(context.speed||1),fill:'forwards'});
  a.finished.catch(()=>{});flow.finished.catch(()=>{});const stop=()=>{a.cancel();flow.cancel();root.remove();};context.signal?.addEventListener('abort',stop,{once:true});
  try {
    context.onTiming?.('sage_capture',{result});
    await waitForPresentation(reduced?80:200,context.signal,context.speed||1);
    if(!context.signal?.aborted){
      root.textContent='運算元 '+d.operandAfter;
      if(result.targetAfter&&typeof applyHpSnapshot==='function')applyHpSnapshot({players:[result.targetAfter]});
      await waitForPresentation(60,context.signal,context.speed||1);
    }
  }finally{context.signal?.removeEventListener('abort',stop);stop();}
}
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
