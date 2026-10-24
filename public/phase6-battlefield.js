// Presentation only: pictures never calculate a hit, heal, shield or chance.
const PHASE6_ART=Object.freeze({
  sword:'/assets/combat-fx/common/sword-slash.png',spark:'/assets/combat-fx/common/impact-spark.png',
  slash:'/assets/combat-fx/common/slash-texture.png',steel:'/assets/專屬裝備/荊棘重盾.webp',
  holy:'/assets/combat-fx/paladin/holy-shield.png',core:'/assets/combat-fx/mage/arcane-core.png',
  blood:'/assets/combat-fx/enemies/blood-energy-stream.png',link:'/assets/combat-fx/common/arcane-energy-link.png',
  strings:'/assets/combat-fx/bard/glowing-strings.png',pluck:'/assets/combat-fx/bard/pluck-streak.png',
  ribbon:'/assets/combat-fx/bard/melody-ribbon.png',shadow:'/assets/combat-fx/assassin/shadow-step.png',
  fatal:'/assets/combat-fx/assassin/fatal-slash.png'
});
// Exact per-action references; reactive HUD evidence is preloaded separately.
const PHASE6_SKILL_ART=Object.freeze({
  warrior:{basic:['sword','spark'],w_strike:['sword','spark'],w_shield:['steel','slash'],w_cleave:['sword','spark'],w_counter:['sword','spark']},
  paladin:{basic:['sword','spark','link','holy'],pal_glory:['sword','spark','link','holy'],pal_grace:['link','holy'],pal_glory_echo:['link','holy'],pal_grace_end:['link','holy']},
  mage:{basic:['core'],m_blast:['core'],m_drain:['core','blood']},
  bard:{basic:['strings','pluck','ribbon'],b_heal:['strings','pluck','ribbon'],b_buff:['strings','pluck','ribbon'],b_nocturne:['strings','pluck','ribbon'],b_frenzy:['strings','pluck','ribbon'],b_revive:['strings','pluck','ribbon']},
  assassin:{basic:['fatal'],s_stab:['shadow','fatal'],s_smoke:['shadow','fatal'],follow_up:['shadow','fatal'],leader_assassin_execute:['shadow','fatal']}
});
function phase6ArtPath(key){const path=PHASE6_ART[key];return typeof window!=='undefined'&&window.assetRegistry?window.assetRegistry.resolvePath(path):path;}
const PHASE6_ROLES=new Set(['warrior','paladin','mage','bard','assassin']);
function isPhase6TimedStep(step){return step?.type==='status_action'&&(step.results||[]).some(r=>PHASE6_ROLES.has(r.targetAfter?.role)||r.label==='狂亂反噬');}
function phase6Image(s,key,id,variant=''){
  const image=battlefieldPaintedImage(s.root,phase6ArtPath(key),'phase6-art '+variant);
  image.dataset.art=key;if(id)s.follow(image,id,0,/phase6-charge|phase6-orbit/.test(variant)?-90:variant==='phase6-fragment'?-65:0);return image;
}
function phase6Pulse(s,key,id,{heavy=false,secondary=false,collapse=false,rotate=0}={}){
  const image=phase6Image(s,key,id,secondary?'phase6-secondary':heavy?'phase6-heavy':'');
  image.style.transform='rotate('+rotate+'deg)';
  s.animate(image,s.reduced?[{opacity:0},{opacity:.75},{opacity:0}]:collapse?
    [{opacity:0,scale:'1.15'},{opacity:1,scale:'.9',offset:.25},{opacity:0,scale:'.12',rotate:'-55deg'}]:
    [{opacity:0,scale:'.55',rotate:'-12deg'},{opacity:1,scale:'1',rotate:'0deg',offset:.25},{opacity:0,scale:'1.18',rotate:'12deg'}],heavy?430:280);
  return image;
}
async function phase6Flight(s,key,fromId,toId,ms=230,{lanes=1,returning=false,variant=''}={}){
  const images=Array.from({length:lanes},()=>phase6Image(s,key,null,'phase6-flight '+variant));
  await s.tick(ms,p=>{
    const to=getBattleEffectAnchor(toId),enemyTarget=typeof getEnemyAnchor==='function'&&getEnemyAnchor(toId);
    const from=enemyTarget?{x:['sword','fatal','shadow'].includes(key)?-80:to?.x,y:['sword','fatal','shadow'].includes(key)?(to?.y||0)-70:to?.y}:
      typeof getActorAnchor==='function'&&getActorAnchor(fromId)?{x:innerWidth*.5,y:innerHeight*.58}:getBattleEffectAnchor(fromId);
    for(const [i,image] of images.entries()){
      image.hidden=!to||(!from&&p<1);if(image.hidden)continue;
      const a=from?{...from,y:from.y-(variant==='phase6-core-flight'?90:variant==='phase6-fragment-flight'?65:0)}:to,q=s.reduced?1:p,dx=to.x-a.x,dy=to.y-a.y;
      const bend=s.reduced?0:Math.sin(p*Math.PI)*(lanes>1?(i? -14:14):returning?14:-20);
      image.style.left=(a.x+dx*q-Math.sin(Math.atan2(dy,dx))*bend)+'px';
      image.style.top=(a.y+dy*q+Math.cos(Math.atan2(dy,dx))*bend)+'px';
      image.style.rotate=(Math.atan2(dy,dx)+(returning?Math.sin(p*Math.PI*4)*.12:0))+'rad';
      image.style.opacity=String(s.reduced?Math.sin(p*Math.PI):Math.min(1,p*6,(1-p)*8));
    }
  });
  images.forEach(image=>image.remove());
}
function phase6HasNewStatus(result,id){return (result.targetAfter?.statuses||[]).some(s=>s.id===id)&&!(result.targetBefore?.statuses||[]).some(s=>s.id===id);}
function phase6ResultReaction(result,parent,{reduced=false,animate,lane=2}={}){
  const before=result.targetBefore,after=result.targetAfter,id=resolvePresentationTarget(result);
  const growth=after?.role==='warrior'&&result.actualHpDamage>0&&(after.warriorStacks||0)>(before?.warriorStacks||0);
  const fatal=before?.paladinFatalGuard===true&&after?.paladinFatalGuard===false&&after.hp===1;
  if(!growth&&!fatal)return null;
  const image=battlefieldPaintedImage(parent,phase6ArtPath(fatal?'holy':'spark'),'phase6-art phase6-reaction');
  image.dataset.reaction=fatal?'fatal-guard':'warrior-growth';
  let label;
  if(growth){label=document.createElement('div');label.className='battle-feedback phase6-growth';label.textContent='攻擊 +'+after.warriorStacks+'/15';parent.appendChild(label);}
  animate?.(image,reduced?[{opacity:0},{opacity:.6},{opacity:0}]:[{opacity:0,scale:'.7'},{opacity:1,scale:'1',offset:.2},{opacity:0,scale:fatal?'1.25':'.95'}],420);
  let elapsed=0;
  return {render(passed=0){elapsed=passed;const a=getBattleEffectAnchor(id);image.hidden=!a||elapsed>.6;
    if(a){image.style.left=a.x+'px';image.style.top=a.y+'px';}
    if(label){label.hidden=elapsed>.6;if(!label.hidden)positionBattleFeedback(label,id,lane);}
  }};
}
function phase6Commit(s,step,result){
  if(!commitBattlefieldPlayerResult(result,step,s.local))return false;
  s.root.dataset.phase='contact';
  if(step.category==='FOLLOW_UP'&&result.kind==='damage'&&result.targetEnemyId&&!(step.results||[]).some(r=>r.targetId===step.sourceId)){
    const source=step.hpSnapshot?.players?.find(p=>p.id===step.sourceId);
    if(source)applyHpSnapshot({players:[source]});
  }
  const reaction=phase6ResultReaction(result,s.root,{reduced:s.reduced,animate:s.animate});
  if(reaction){const start=performance.now();reaction.render();s.startRenderer(()=>reaction.render((performance.now()-start)/1000*(s.local.speed||1)));}
  s.local.onTiming?.('phase6_contact',{resultId:result.resultId,targetId:resolvePresentationTarget(result,step),kind:result.kind});
  return true;
}
async function phase6Support(s,step,result,key,origin=step.sourceId){
  const id=resolvePresentationTarget(result,step);
  if(key){if(origin!==id)await phase6Flight(s,key,origin,id,170);phase6Pulse(s,key,id,{heavy:result.kind==='revive'});}
  phase6Commit(s,step,result);
  if(result.actualHeal>0)s.local.audioScope.playResult('healing_result',{noHold:true,volume:step.sourceRole==='bard'?.7:1});
  else if(result.actualShield>0)s.local.audioScope.play('shield_cast');
}
function phase6ActorMotion(s,keys,ms){if(s.actor&&!s.reduced)s.animate(s.actor,keys,ms);}
async function playPhase6Warrior(s,step){
  const shield=step.actionId==='w_shield',heavy=step.actionId!=='basic',vertical=step.actionId==='w_cleave',counter=step.actionId==='w_counter';
  s.root.dataset.phase='windup';
  phase6ActorMotion(s,[{translate:'0 0'},{translate:counter?'5px 3px':'-4px 1px',rotate:vertical?'-3deg':'-1deg'},{translate:'0 0'}],heavy?360:190);
  if(shield){phase6Pulse(s,'steel',step.sourceId,{heavy:true});await s.wait(220);}
  else await s.wait(heavy?280:100);
  for(const result of step.results||[]){
    const id=resolvePresentationTarget(result,step);
    if(result.kind==='damage'&&result.targetEnemyId){
      s.root.dataset.phase='action';await phase6Flight(s,'sword',step.sourceId,id,heavy?230:170,{variant:vertical?'phase6-vertical':''});
      s.root.dataset.phase='contact';
      if(result.actualDamage>0){phase6Pulse(s,'sword',id,{heavy,rotate:vertical?80:counter?-30:0});phase6Pulse(s,'spark',id);}
      phase6Commit(s,step,result);if(result.actualDamage>0)s.local.audioScope.play('physical_hit',{volume:.28});
    }else await phase6Support(s,step,result,result.actualShield>0?'steel':null);
  }
  if(step.outcome?.type==='imbalance')phase6ActorMotion(s,[{rotate:'0deg'},{rotate:'5deg',translate:'5px 1px',offset:.35},{rotate:'0deg',translate:'0 0'}],230);
  if(step.outcome?.type==='shield_crack')phase6Pulse(s,'slash',step.sourceId,{secondary:true});
  await s.wait(heavy?240:150);
}
async function playPhase6Paladin(s,step){
  const grace=step.actionId==='pal_grace',echo=step.actionId==='pal_glory_echo';
  s.root.dataset.phase='windup';
  if(step.actionId==='pal_glory')phase6Pulse(s,'holy',step.sourceId,{heavy:true});
  await s.wait(step.actionId==='basic'?100:200);
  const enemies=(step.results||[]).filter(r=>r.kind==='damage'&&r.targetEnemyId);
  for(const result of step.results||[]){
    const id=resolvePresentationTarget(result,step);
    if(enemies.includes(result)){
      await phase6Flight(s,'sword',step.sourceId,id,210);s.root.dataset.phase='contact';
      if(result.actualDamage>0){const image=phase6Pulse(s,'sword',id);image.classList.add('phase6-gold');phase6Pulse(s,'spark',id);}
      phase6Commit(s,step,result);if(result.actualDamage>0)s.local.audioScope.play('physical_hit',{volume:.28});
    }else if(result.actualShield>0){
      // A returned stream is visual only; the shield amount comes from this result.
      const origin=echo||id!==step.sourceId?step.sourceId:enemies.find(r=>r.actualDamage>0)?.targetId||step.sourceId;
      await phase6Flight(s,'link',origin,id,180,{returning:true,variant:'phase6-gold'});
      await phase6Support(s,step,result,'holy',id);
    }else if(grace&&id!==step.sourceId&&phase6HasNewStatus(result,'paladin_grace_target')){
      await phase6Flight(s,'link',step.sourceId,id,260,{variant:'phase6-gold'});
      phase6Pulse(s,'holy',id,{secondary:true});phase6Commit(s,step,result);
    }else phase6Commit(s,step,result);
  }
  if(step.actionId==='pal_grace_end'&&!(step.results||[]).some(r=>r.actualShield>0))phase6Pulse(s,'holy',step.sourceId,{collapse:true});
  await s.wait(180);
}
async function playPhase6Mage(s,step){
  const blast=step.actionId==='m_blast',misfire=step.outcome?.type==='misfire',drain=step.actionId==='m_drain';
  s.root.dataset.phase='windup';s.root.dataset.misfire=String(misfire);
  if(blast){
    await playPhase6ArcaneBlast(s,step,misfire);return;
  }else await s.wait(100);
  let primary=null;
  for(const result of step.results||[]){
    const id=resolvePresentationTarget(result,step);
    if(result.kind==='damage'&&result.targetEnemyId){
      const secondary=!!result.isSecondaryEnemy||!!primary&&primary!==id;
      if(!secondary){primary=id;s.root.dataset.phase='action';await phase6Flight(s,drain?'blood':'core',step.sourceId,id,180);}
      else await s.wait(55);
      s.root.dataset.phase='contact';
      if(result.actualDamage>0)phase6Pulse(s,'core',id,{secondary});
      phase6Commit(s,step,result);if(result.actualDamage>0)s.local.audioScope.play('magic_impact',{volume:.28});
    }else if(result.kind==='damage'&&result.actualDamage>0){
      phase6Pulse(s,'core',id,{collapse:true}).classList.add('phase6-self-impact');phase6Commit(s,step,result);
    }else if(result.actualHeal>0){
      if(primary)await phase6Flight(s,'blood',primary,id,260,{lanes:2,returning:true});
      await phase6Support(s,step,result,null);
    }else phase6Commit(s,step,result);
  }
  await s.wait(150);
}
async function playPhase6ArcaneBlast(s,step,misfire){
    const hits=(step.results||[]).filter(r=>r.kind==='damage'&&r.targetEnemyId);
    const main=[],later=[];const seen=new Set();
    for(const result of hits){const id=resolvePresentationTarget(result,step);if(seen.has(id))later.push(result);else{seen.add(id);main.push(result);}}
    if(!main.length){await s.resolveResults();return;}
    const core=phase6Image(s,'core',null,'phase6-charge');
    const orbit=phase6Image(s,'core',null,'phase6-orbit');
    const place=node=>{const center=battlefieldFormationAnchor(main,step);if(!center)return;node.style.left=center.x+'px';node.style.top=center.y+'px';node.style.width=Math.min(innerWidth*.95,Math.max(220,center.width*1.2))+'px';node.style.height=Math.min(innerHeight*.65,Math.max(220,center.height*1.2))+'px';};
    s.startRenderer(()=>{place(core);place(orbit);});place(core);place(orbit);
    s.animate(core,s.reduced?[{opacity:0},{opacity:1}]:[{scale:'.35',opacity:0},{scale:'1',opacity:1,rotate:'30deg'}],390);
    s.animate(orbit,s.reduced?[{opacity:0},{opacity:.35}]:[{scale:'.5',opacity:0,rotate:'0deg'},{scale:'1.2',opacity:.4,rotate:'150deg'}],390);
    await s.wait(195);s.root.dataset.phase='charge';await s.wait(195);
    s.animate(core,s.reduced?[{opacity:1},{opacity:.8}]:[{scale:'1',opacity:1},{scale:'.28',opacity:1}],120);await s.wait(120);
    s.root.dataset.phase='contact';orbit.remove();
    s.animate(core,s.reduced?[{opacity:1},{opacity:0}]:[{scale:'.28',opacity:1},{scale:'1.3',opacity:1,offset:.28},{scale:'1.6',opacity:0}],430);
    s.local.audioScope.play('magic_impact',{volume:.4});
    commitBattlefieldGroup(s,step,main,phase6Commit);
    for(const result of main){const target=battlefieldVisualElement(resolvePresentationTarget(result,step));if(target)s.animate(target,[{filter:'brightness(2)'},{filter:'brightness(1)'}],260);}
    // Equipment hits and self-backlash retain their own authoritative beats.
    await s.wait(200);
    for(const result of (step.results||[]).filter(r=>!main.includes(r))){
      if(result.kind==='damage'&&!result.targetEnemyId&&result.actualDamage>0)phase6Pulse(s,'core',resolvePresentationTarget(result,step),{collapse:true});
      phase6Commit(s,step,result);
    }
    await s.wait(270);core.remove();
}
async function phase6BardInstrument(s,step){
  const basic=step.actionId==='basic',slow=['b_nocturne','b_revive'].includes(step.actionId),off=step.outcome?.type==='off_key';
  const instrument=s.el('div','phase6-instrument',null,s.root);
  s.startRenderer(()=>{instrument.style.left=innerWidth*.42+'px';instrument.style.top=innerHeight*.65+'px';});
  instrument.dataset.offKey=String(off);instrument.dataset.song=step.actionId;
  // Four clipped copies preserve the painted strings and let each string vibrate independently.
  for(let i=0;i<4;i++){
    const image=battlefieldPaintedImage(instrument,phase6ArtPath('strings'),'phase6-string');
    image.style.clipPath=`polygon(${i*25}% 0,${(i+1)*25}% 0,${(i+1)*25}% 100%,${i*25}% 100%)`;
    s.animate(image,s.reduced?[{opacity:0},{opacity:.8},{opacity:0}]:
      [{opacity:0,translate:'0 0'},{opacity:off?.45:1,translate:(i%2?'-3px 1px':'3px -1px'),offset:.25},{opacity:off?.25:1,translate:(i%2?'2px -1px':'-2px 1px'),offset:.5},{opacity:0,translate:'0 0'}],basic?310:slow?720:520,{delay:s.reduced?0:i*35/(s.local.speed||1)});
  }
  const strokes=basic?1:slow?2:3;
  for(let i=0;i<strokes;i++){
    const stroke=battlefieldPaintedImage(instrument,phase6ArtPath('pluck'),'phase6-pluck');
    s.animate(stroke,s.reduced?[{opacity:0},{opacity:.7},{opacity:0}]:[{translate:'-20px -5px',opacity:0},{translate:'5px 3px',opacity:off?.45:1,offset:.35},{translate:'22px 7px',opacity:0}],230,{delay:s.reduced?0:i*90/(s.local.speed||1)});
  }
  await s.wait(basic?150:slow?360:260);return instrument;
}
async function playPhase6Bard(s,step){
  s.root.dataset.phase='windup';s.root.dataset.song=step.actionId;
  const instrument=await phase6BardInstrument(s,step);
  for(const result of step.results||[]){
    const id=resolvePresentationTarget(result,step),damage=result.kind==='damage',revive=result.kind==='revive';
    const applies=damage?result.actualDamage>0:result.actualHeal>0||result.actualShield>0||revive&&result.targetBefore?.hp<=0&&result.targetAfter?.hp>0||result.kind==='status';
    if(applies){
      s.root.dataset.phase='action';
      await phase6Flight(s,'ribbon',step.sourceId,id,step.actionId==='basic'?180:revive?360:210,{lanes:revive?3:1,variant:'phase6-song'});
      if(damage&&result.actualDamage>0)phase6Pulse(s,'pluck',id);
      else phase6Pulse(s,'ribbon',id,{heavy:revive});
    }
    s.root.dataset.phase='contact';phase6Commit(s,step,result);
    if(step.actionId==='b_nocturne'&&step.outcome?.type==='sleep'&&result.targetEnemyId&&result.kind==='damage'){
      const hint=s.el('span','phase6-sleep-hint',null,s.root);hint.textContent='Z z';
      const a=getBattleEffectAnchor(id);s.follow(hint,id,-(a?.rect.width||80)*.35,-(a?.rect.height||90)*.35);
      s.animate(hint,[{opacity:0},{opacity:.85},{opacity:0}],450);
    }
    if(result.actualHeal>0)s.local.audioScope.playResult('healing_result',{volume:.7,noHold:true});
    if(damage&&result.actualDamage>0)s.local.audioScope.play('magic_impact',{volume:.3});
  }
  s.animate(instrument,[{opacity:1},{opacity:0}],160);await s.wait(180);
}
async function playPhase6Assassin(s,step){
  const basic=step.actionId==='basic',follow=step.category==='FOLLOW_UP',execute=step.actionId==='leader_assassin_execute';
  const critical=step.actionId!=='s_smoke'&&(step.isCritical||step.isCrit||['critical','crit'].includes(step.outcome?.type));
  s.root.dataset.critical=String(!!critical);s.root.dataset.phase='windup';
  if(!basic){
    phase6ActorMotion(s,[{filter:'brightness(1)'},{filter:'brightness(.35)',offset:.4},{filter:'brightness(1)'}],follow?260:450);
    if(step.actionId==='s_smoke'){
      const count=Math.min(8,Math.max(0,step.consumedStacks||0));
      for(let i=0;i<count;i++){
        const fragment=phase6Image(s,'shadow',step.sourceId,'phase6-fragment');
        const theta=i/Math.max(1,count)*Math.PI*2;
        s.animate(fragment,s.reduced?[{opacity:0},{opacity:.4},{opacity:0}]:[{translate:`${Math.cos(theta)*36}px ${Math.sin(theta)*26}px`,scale:'.4',opacity:0},{translate:'0 0',scale:'.7',opacity:.65,offset:.6},{scale:'.3',opacity:0}],330);
      }
      await s.wait(240);
    }else await s.wait(follow?45:90);
  }else await s.wait(65);
  for(const result of step.results||[]){
    const id=resolvePresentationTarget(result,step);
    if(result.kind==='damage'&&result.targetEnemyId){
      if(execute&&result.actualDamage>0){
        const target=s.targetFor(id);
        if(target&&!s.reduced)s.animate(target,[{filter:'brightness(1)'},{filter:'brightness(.55)',offset:.25},{filter:'brightness(1)'}],430);
        const mark=phase6Pulse(s,'fatal',id,{secondary:true});mark.classList.add('phase6-weakpoint');
      }
      if(!basic)await phase6Flight(s,'shadow',step.sourceId,id,follow?100:160,{variant:step.actionId==='s_smoke'&&step.consumedStacks>0?'phase6-fragment-flight':''});
      if(execute&&result.actualDamage>0)await s.wait(65);
      s.root.dataset.phase='contact';
      if(result.actualDamage>0){
        phase6Pulse(s,'fatal',id,{heavy:!!critical,rotate:basic?-35:0});
        if(basic)phase6Pulse(s,'fatal',id,{rotate:45});
      }
      phase6Commit(s,step,result);if(result.actualDamage>0)s.local.audioScope.play('physical_hit',{volume:.25});
    }else phase6Commit(s,step,result);
  }
  await s.wait(follow?120:basic?180:240);
}
async function playPhase6Timed(s,step){
  // Round-start data is already resolved. Never turn a pending declaration into a heal/shield.
  for(const result of step.results||[]){
    const shields=result.targetAfter?.presentationShields||[];
    const key=result.actualShield>0&&shields.some(sh=>sh.kind.startsWith('paladin'))?'holy':null;
    if(key)phase6Pulse(s,key,resolvePresentationTarget(result,step));
    if(result.label==='狂亂反噬'&&result.actualHpDamage>0)phase6Pulse(s,'ribbon',result.targetId,{collapse:true});
    phase6Commit(s,step,result);
  }
  await s.wait(220);
}
function phase6FeedbackEntries(result){
  return battleFeedbackEntries(result).filter(e=>e.text!=='暴擊'||(['damage','intercept'].includes(result.kind)&&result.actualDamage>0));
}
async function playPhase6BattlefieldPresentation(step,context={}){
  const role=step.sourceRole,timed=isPhase6TimedStep(step);
  const keys=timed?['holy','spark','ribbon']:(PHASE6_SKILL_ART[role]?.[step.category==='FOLLOW_UP'?'follow_up':step.actionId]||PHASE6_SKILL_ART[role]?.basic||[]);
  await preloadPhase5Art([...keys.map(k=>phase6ArtPath(k)),...phase6IncomingArt(step)],context.signal||context.controller?.signal);
  const reactions=step.augurReactions||[];
  for(const r of reactions.filter(r=>r.actionId!=='aug_tome'))if(typeof playBattlefieldAugur==='function')await playBattlefieldAugur(r,{...context,augurReaction:true});
  await withBattlefieldSkillStage(step,{...context,feedbackEntries:phase6FeedbackEntries,feedbackDuration:step.category==='FOLLOW_UP'?350:step.actionId==='basic'?500:600},async s=>{
    s.root.classList.add('phase6-battlefield');
    const profile=resolveCombatSfxProfile(step);
    // Keep the original recordings and pitch; their tails overlap the next action.
    const sound=profile.key||(step.actionId==='w_counter'?'warrior_skill1':['pal_glory_echo','pal_grace_end'].includes(step.actionId)?'warrior_defense':null);
    if(sound)s.local.audioScope.play(sound,{noHold:true,detune:step.outcome?.type==='off_key'});
    if(timed)await playPhase6Timed(s,step);
    else await ({warrior:playPhase6Warrior,paladin:playPhase6Paladin,mage:playPhase6Mage,bard:playPhase6Bard,assassin:playPhase6Assassin}[role])(s,step);
    s.root.dataset.phase='cleanup';await s.resolveResults();
  });
  for(const r of reactions.filter(r=>r.actionId==='aug_tome'))if(typeof playBattlefieldAugur==='function')await playBattlefieldAugur(r,{...context,augurReaction:true});
}

function phase6IncomingArt(step){
  const keys=new Set();
  for(const r of step.results||[]){
    if(r.sharedFrom&&r.targetBefore?.role==='paladin'&&r.actualDamage>0){keys.add('holy');keys.add('link');keys.add('spark');}
    if(r.actualHpDamage>0&&r.targetAfter?.role==='warrior')keys.add('spark');
    if(r.targetBefore?.paladinFatalGuard&&!r.targetAfter?.paladinFatalGuard)keys.add('holy');
  }
  return [...keys].map(k=>phase6ArtPath(k));
}
function createPhase6Incoming(step,result,parent,options){
  if(!result.sharedFrom||result.targetBefore?.role!=='paladin'||!(result.actualDamage>0))return null;
  const targetId=resolvePresentationTarget(result,step),allyId=result.sharedFrom;
  const inner=!options.castOwnsEnemyArt&&typeof createEnemyChoreography==='function'?createEnemyChoreography(step,{...result,targetId:allyId,targetEnemyId:null},parent,options):null;
  const shield=battlefieldPaintedImage(parent,phase6ArtPath('holy'),'phase6-art phase6-reaction');
  const stream=battlefieldPaintedImage(parent,phase6ArtPath('link'),'phase6-guard-stream');
  shield.dataset.reaction='grace-intercept';
  const duration=Math.max(900,(inner?.duration||650)+180),contact=.72,land=(inner?.contact||.35)*.65;
  return {duration,contact,windupSfx:inner?.windupSfx,impactSfx:inner?.impactSfx,
    render(p){
      inner?.render(Math.min(1,p/.65));
      const ally=getBattleEffectAnchor(allyId),pal=getBattleEffectAnchor(targetId);
      shield.hidden=!ally||p<land*.7||p>.9;
      if(ally){shield.style.left=ally.x+'px';shield.style.top=ally.y+'px';shield.style.opacity=String(p<contact?.9:Math.max(0,1-(p-contact)/.18));}
      stream.hidden=!ally||!pal||p<land||p>contact||!!options.reduced;
      if(ally&&pal){const q=Math.max(0,Math.min(1,(p-land)/(contact-land)));stream.style.left=(ally.x+(pal.x-ally.x)*q)+'px';stream.style.top=(ally.y+(pal.y-ally.y)*q)+'px';stream.style.rotate=Math.atan2(pal.y-ally.y,pal.x-ally.x)+'rad';}
    },remove(){inner?.remove();shield.remove();stream.remove();}};
}
