async function playSageEquationPresentation(step,context) {
  await preloadSageHands();
  // The previous action has finished and removed its canvas before this breath.
  await waitForPresentation(200,context.signal,context.speed||1);
  return withSkillPresentationStage(step,context,async s=>{
    const {el,position,animate,tick,wait,signal}=s,o=step.outcome;
    const {back,front,goldWash,background}=getSageSnapBackgroundAssets();
    s.frame.append(back,goldWash,front);background.render(0);
    s.debug('backfx / frontfx origin',background.origin);
    const hand1=el('img','sage-hand'),hand2=el('img','sage-hand');
    hand1.src='assets/sage-snap-1.png';hand2.src='assets/sage-snap-2.png';
    const operand=el('div','sage-term','<small>運算元</small><span class="sage-number-motion">0</span>');position(operand,470,355);
    const eta=el('div','sage-term','<small>η(X)</small><span class="sage-number-motion">η</span>');position(eta,720,355);
    const variable=el('div','sage-term','<small>變量 X</small><span class="sage-number-motion">0</span>');position(variable,970,355);
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
    animate(hand1,[{opacity:0,transform:'translateY(45px) rotate(-12deg)'},{opacity:1,transform:'translateY(0) rotate(0)'}],580);
    await wait(650);if(signal?.aborted)return;
    hand1.style.visibility='hidden';hand2.style.opacity='1';
    context.audioScope.play('magic_impact',{noHold:true});context.onTiming?.('sage_snap',{step});
    animate(hand2,[{opacity:1,transform:'scale(1.03)'},{opacity:0,transform:'scale(.97)'}],800);
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
    context.onTiming?.('sage_first_contact',{step});
    await wait(950);
    animate(fraction,[{opacity:1,transform:'scale(1)',filter:'blur(0px)'},{opacity:0,transform:'scale(.12)',filter:'blur(2px)'}],280);
    await wait(280);fraction.style.visibility='hidden';eta.style.opacity='1';etaNum.textContent='0.000';
    await tick(470,p=>{etaNum.textContent=(o.eta*p).toFixed(3);});await wait(105);
    await tick(310,p=>{opNum.style.transform='translateX('+(250*p)+'px)';});if(signal?.aborted)return;
    operand.style.opacity=eta.style.opacity='0';answer.style.opacity='1';
    animate(wave,[{opacity:1,transform:'scaleX(.06)'},{opacity:0,transform:'scaleX(1.4)'}],200);
    animate(answer,[{opacity:1,transform:'translateX(0)'},{opacity:1,transform:'translateX(16px)',offset:.35},{opacity:1,transform:'translateX(-5px)',offset:.7},{opacity:1,transform:'translateX(0)'}],380);
    context.onTiming?.('sage_second_contact',{step});await wait(560);
    animate(answer,[{opacity:1,transform:'scale(1)'},{opacity:1,transform:'scale(.02)'}],540);await wait(540);await wait(100);
    const target=s.anchors.get('monster')||SKILL_STAGE.target,dx=target.x-720,dy=target.y-405;
    beam.style.width=Math.hypot(dx,dy)+'px';beam.style.rotate=Math.atan2(dy,dx)+'rad';
    animate(beam,[{opacity:1,transform:'scaleX(.01)'},{opacity:1,transform:'scaleX(1)',offset:.65},{opacity:0,transform:'scaleX(1)'}],180);
    answer.style.visibility='hidden';context.audioScope.play('magic_impact',{noHold:true});await wait(120);
    await s.resolveResults();
    for(const tag of tags){if(signal?.aborted)return;animate(tag,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],180);await wait(300);}
    if(o.resolution){const resolution=el('div','skill-reveal');resolution.textContent={SUCCESS:'推演成功',CONFUSION:'思緒紊亂',NOTHING:'無事發生'}[o.resolution]||o.resolution;resolution.style.top='705px';animate(resolution,[{opacity:0},{opacity:1}],180);}
    await wait(450);
  });
}
