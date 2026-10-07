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
    anchor.number.style.opacity='0';
    const left=s.el('span','sage-momentum-copy'),right=s.el('span','sage-momentum-copy');
    left.textContent=right.textContent=String(data.operandBefore);s.position(left,212,604);s.position(right,308,604);
    const cue=s.el('span','sage-momentum-cue');cue.textContent='×2';s.position(cue,260,565);
    if(!s.reduced){
      s.animate(left,[{transform:'translate(-50%,-50%)'},{transform:'translate(calc(-50% + 48px),-50%)'}],260);
      s.animate(right,[{transform:'translate(-50%,-50%)'},{transform:'translate(calc(-50% - 48px),-50%)'}],260);
    }
    await s.wait(260);if(s.signal.aborted)return;
    left.remove();right.remove();cue.remove();anchor.number.textContent=String(data.operandAfter);anchor.number.style.opacity='1';
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
  const o=step.outcome;if(!['SUCCESS','CONFUSION'].includes(o.resolution))return;
  if(o.xBefore==null||o.xAfter==null)return;
  operand.style.opacity=variable.style.opacity='1';s.position(operand,560,650);s.position(variable,880,650);
  operand.lastChild.style.transform=variable.lastChild.style.transform='';
  operand.lastChild.textContent=String(o.operand);variable.lastChild.textContent=String(o.xBefore);
  operand.classList.add('sage-skill-outcome-term');variable.classList.add('sage-skill-outcome-term');
  const label=s.el('small','sage-skill-outcome-label',null,variable);label.textContent=o.resolution==='SUCCESS'?'推演成功':'思緒紊亂';
  if(o.resolution==='SUCCESS'){
    const line=s.el('div','sage-vector-line');s.position(line,620,675);line.style.width='205px';
    s.animate(line,[{transform:'scaleX(0)',opacity:.8},{transform:'scaleX(1)',opacity:0}],300);
    const cue=s.el('small','sage-skill-outcome-label',null,operand);cue.textContent='+'+o.variableContribution;
  }else s.animate(variable,[{transform:'translateX(0)',filter:'blur(0)',color:'#b8a885'},{transform:'translateX(3px)',filter:'blur(1px)'},{transform:'translateX(-2px)'},{transform:'translateX(0)',filter:'blur(0)'}],280);
  await s.wait(300);if(s.signal.aborted)return;
  variable.querySelector('.sage-number-motion').textContent=String(o.xAfter);
  context.onTiming?.('sage_variable_outcome',{step});await s.wait(180);
}
