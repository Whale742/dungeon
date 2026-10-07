async function playSageEquationPresentation(step,context) {
  await preloadSageHands();
  // The previous action has finished and removed its canvas before this breath.
  await waitForPresentation(200,context.signal,context.speed||1);
  return withSkillPresentationStage(step,context,async s=>{
    const {el,position,animate,tick,wait,signal}=s,o=step.outcome;
    const {back,front,goldWash,background}=getSageSnapBackgroundAssets();
    s.frame.append(back,goldWash,front);background.render(0);
    s.debug('backfx / frontfx origin',background.origin);
    // Pin both sprites at the fixed curve emitter. Match their wrist vectors
    // as well, so changing poses does not shift the whole hand sideways.
    const beforePose={tip:{x:140,y:16},wrist:{x:245,y:530}};
    const afterPose={tip:{x:28,y:18},wrist:{x:278,y:530}},handScale=.62;
    const beforeVector={x:beforePose.wrist.x-beforePose.tip.x,y:beforePose.wrist.y-beforePose.tip.y};
    const afterVector={x:afterPose.wrist.x-afterPose.tip.x,y:afterPose.wrist.y-afterPose.tip.y};
    const beforeScale=handScale*Math.hypot(afterVector.x,afterVector.y)/Math.hypot(beforeVector.x,beforeVector.y);
    const beforeAngle=Math.atan2(afterVector.y,afterVector.x)-Math.atan2(beforeVector.y,beforeVector.x);
    const handBefore=el('div','sage-hand-motion'),handAfter=el('div','sage-hand-motion');
    handBefore.dataset.pose='before';handAfter.dataset.pose='after';
    position(handBefore,background.origin.x,background.origin.y);position(handAfter,background.origin.x,background.origin.y);
    const hand1=el('img','sage-hand',null,handBefore),hand2=el('img','sage-hand',null,handAfter);
    hand1.src='assets/sage-snap-1.png';hand2.src='assets/sage-snap-2.png';
    const operand=el('div','sage-term','<small>運算元</small><span class="sage-number-motion">0</span>');position(operand,470,355);
    const eta=el('div','sage-term','<small>η(X)</small><span class="sage-number-motion">η</span>');position(eta,720,355);
    const variable=el('div','sage-term','<small>變量(X)</small><span class="sage-number-motion">0</span>');position(variable,970,355);
    const opNum=operand.lastChild,xNum=variable.lastChild,etaNum=eta.lastChild;
    operand.style.opacity=variable.style.opacity=eta.style.opacity='0';
    const fraction=el('div','sage-fraction','<span class="constant">0.25 +</span><span class="fraction"><span class="numerator">1.75 × '+escapeHtml(String(o.x))+'</span><span class="denominator">'+escapeHtml(String(o.x))+' + 80</span></span>');
    const answer=el('div','sage-answer');answer.textContent='解 = '+o.equationDamage;
    const wave=el('div','sage-wave'),beam=el('div','sage-beam');
    const properties=el('div','sage-properties');
    const labels={EVEN:'彈性碰撞與衝量吸收',ODD:'完全非彈性形變',PRIME:'結構固有頻率共振',SQUARE:'完整平方結構'};
    const tags=(o.properties||[]).map(p=>{const tag=el('span','',null,properties);tag.textContent=labels[p]||p;return tag;});
    const flags=el('div','sage-operand-flags');flags.textContent=(o.properties||[]).map(p=>labels[p]||p).join(' · ');flags.style.opacity='0';
    s.debug('equation / η',{x:720,y:405});s.debug('Operand',{x:470,y:405});s.debug('X',{x:970,y:405});
    await Promise.all([hand1.decode(),hand2.decode()]);await presentationFrame(signal);await presentationFrame(signal);
    for(const [image,pose,scale,angle] of [[hand1,beforePose,beforeScale,beforeAngle],[hand2,afterPose,handScale,0]]) {
      image.style.width=image.naturalWidth*scale+'px';image.style.height=image.naturalHeight*scale+'px';
      image.style.left=-pose.tip.x*scale+'px';image.style.top=-pose.tip.y*scale+'px';
      image.style.transformOrigin=`${pose.tip.x*scale}px ${pose.tip.y*scale}px`;
      image.style.transform=`rotate(${angle}rad)`;image.style.opacity='1';
    }
    handAfter.style.opacity='0';
    // Hold the wrist in place and lean clockwise slightly to charge the snap.
    handBefore.style.transformOrigin=`${afterVector.x*handScale}px ${afterVector.y*handScale}px`;
    animate(handBefore,s.reduced?[
      {opacity:1,transform:'rotate(0deg)'},{opacity:1,transform:'rotate(0deg)'}
    ]:[
      {opacity:1,transform:'rotate(0deg)'},
      {opacity:1,transform:'rotate(4deg)',offset:.85},
      {opacity:1,transform:'rotate(4deg)'}
    ],580);
    await wait(650);if(signal?.aborted)return;
    handBefore.style.visibility='hidden';handAfter.style.opacity='1';
    context.audioScope.play('sage_snap',{noHold:true});context.onTiming?.('sage_snap',{step});
    animate(handAfter,s.reduced?[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(0)'}]:[
      {opacity:1,transform:'translateY(0)'},
      {opacity:1,transform:'translateY(28px)',offset:.15},
      {opacity:0,transform:'translateY(54px)'}
    ],800);
    context.audioScope.play('sage_func',{noHold:true});context.audioScope.play('sage_cal',{noHold:true});context.onTiming?.('sage_curves_start',{step});
    if(s.reduced)background.render(background.snapAt+.8);
    else s.startRenderer(time=>background.render(background.snapAt+time));
    await wait(430);
    operand.style.opacity=variable.style.opacity=eta.style.opacity='1';
    await tick(620,p=>{opNum.textContent=String(Math.round(o.operand*p));xNum.textContent=String(Math.round(o.x*p));});
    flags.style.opacity='1';
    await wait(150);if(signal?.aborted)return;
    // All contact changes happen in one frame, with no layout read or delayed reveal.
    await tick(320,p=>{xNum.style.transform='translateX('+(-250*p)+'px)';});if(signal?.aborted)return;
    variable.style.opacity='0';eta.style.opacity='0';fraction.style.opacity='1';
    animate(fraction,[{transform:'scale(.83)'},{transform:'scale(1.08)'},{transform:'scale(1)'}],950);
    animate(fraction.querySelector('.constant'),[{transform:'translateX(10px)'},{transform:'translateX(-7px)'},{transform:'translateX(0)'}],500);
    animate(fraction.querySelector('.numerator'),[{transform:'translate(-15px,12px)'},{transform:'translate(0,0)'}],350);
    animate(fraction.querySelector('.denominator'),[{transform:'translate(-15px,-12px)'},{transform:'translate(0,0)'}],350);
    animate(wave,[{opacity:1,transform:'scaleX(.12)'},{opacity:0,transform:'scaleX(.8)'}],180);
    context.audioScope.play('sage_pong',{noHold:true});context.onTiming?.('sage_first_contact',{step});
    await wait(950);
    animate(fraction,[{opacity:1,transform:'scale(1)',filter:'blur(0px)'},{opacity:0,transform:'scale(.12)',filter:'blur(2px)'}],280);
    await wait(280);fraction.style.visibility='hidden';eta.style.opacity='1';etaNum.textContent='0.000';
    await tick(470,p=>{etaNum.textContent=(o.eta*p).toFixed(3);});await wait(105);
    await tick(310,p=>{opNum.style.transform='translateX('+(250*p)+'px)';});if(signal?.aborted)return;
    operand.style.opacity=eta.style.opacity='0';answer.style.opacity='1';
    animate(wave,[{opacity:1,transform:'scaleX(.06)'},{opacity:0,transform:'scaleX(1.4)'}],200);
    animate(answer,[{opacity:1,transform:'translateX(0)'},{opacity:1,transform:'translateX(16px)',offset:.35},{opacity:1,transform:'translateX(-5px)',offset:.7},{opacity:1,transform:'translateX(0)'}],380);
    context.audioScope.play('sage_pong',{noHold:true});context.onTiming?.('sage_second_contact',{step});await wait(560);
    animate(answer,[{opacity:1,transform:'scale(1)'},{opacity:1,transform:'scale(.02)'}],540);await wait(540);await wait(100);
    const target=s.anchors.get('monster')||SKILL_STAGE.target,dx=target.x-720,dy=target.y-405;
    beam.style.width=Math.hypot(dx,dy)+'px';beam.style.rotate=Math.atan2(dy,dx)+'rad';
    animate(beam,[{opacity:1,transform:'scaleX(.01)'},{opacity:1,transform:'scaleX(1)',offset:.65},{opacity:0,transform:'scaleX(1)'}],180);
    answer.style.visibility='hidden';context.audioScope.play('sage_laser',{noHold:true});context.onTiming?.('sage_laser',{step});await wait(120);
    await s.resolveResults({applyFinalSnapshot:false});
    for(const tag of tags){if(signal?.aborted)return;animate(tag,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],180);await wait(300);}
    await playSageEquationOutcome(s,step,context,operand,variable);
    if(!signal.aborted&&step.hpSnapshot&&typeof applyHpSnapshot==='function')applyHpSnapshot(step.hpSnapshot);
    await wait(450);
  });
}
