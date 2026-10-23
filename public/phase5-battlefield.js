// Phase 5 choreography owns transient art only. Results and persistent units are
// owned by the existing battlefield APIs, including arena isolation and forms.
const PHASE5_ART = Object.freeze({
  slash:'/assets/combat-fx/common/sword-slash.png',
  spark:'/assets/combat-fx/common/impact-spark.png',
  blood:'/assets/combat-fx/enemies/blood-pierce.png',
  vine:'/assets/combat-fx/common/vine-strike.png',
  roots:'/assets/combat-fx/druid/entangling-roots.png',
  claw:'/assets/combat-fx/enemies/shadow-claw.png',
  talisman:'/assets/Onmyoji-1.png', decree:'/assets/Onmyoji-2.png'
});
const phase5ArtLoads=new Map();
async function preloadPhase5Art(paths,signal) {
  await Promise.all(paths.map(src=>{
    if(!phase5ArtLoads.has(src)){
      const image=new Image();image.src=src;
      const load=image.decode().catch(error=>{phase5ArtLoads.delete(src);throw new Error('Required combat art unavailable: '+src,{cause:error});});
      phase5ArtLoads.set(src,load);
    }
    return phase5ArtLoads.get(src);
  }));
  if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
}
function phase5Image(s,src,id,kind='strike') {
  const node=document.createElement('img');node.className='phase5-art phase5-'+kind;
  node.src=src;node.alt='';node.setAttribute('aria-hidden','true');s.root.appendChild(node);s.follow(node,id);
  if(['roots','strike','spark','triumph'].includes(kind)&&getActorAnchor(id))s.startRenderer(()=>{
    const anchor=getBattleEffectAnchor(id);if(!anchor)return;
    // Ally art fits the portrait; adjacent HP and status rows stay readable.
    node.style.width=Math.max(24,anchor.rect.width)+'px';node.style.height=Math.max(30,anchor.rect.height)+'px';
  });
  return node;
}
function phase5Pulse(s,src,id,kind='strike',ms=360) {
  const node=phase5Image(s,src,id,kind);
  const from=kind==='roots'?'translate(-50%,-40%) scale(.65)':'translate(-50%,-50%) scale(.65) rotate(-12deg)';
  s.animate(node,s.reduced?[{opacity:0},{opacity:.7,offset:.25},{opacity:0}]:[
    {opacity:0,transform:from},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.3},
    {opacity:0,transform:'translate(-50%,-50%) scale(1.12)'}],ms);
  return node;
}
async function phase5Fly(s,node,fromId,toId,ms=300,spin=0) {
  s.unfollow(node);
  // Re-measure on every frame, so scroll / resize / target removal cannot leave
  // a projectile attached to an obsolete viewport coordinate.
  await s.tick(ms,p=>{
    const a=getBattleEffectAnchor(fromId),b=getBattleEffectAnchor(toId);
    node.hidden=!a||!b;if(!a||!b)return;
    const t=s.reduced?1:p*p;
    node.style.left=(a.x+(b.x-a.x)*t)+'px';node.style.top=(a.y+(b.y-a.y)*t)+'px';
    node.style.transform=`translate(-50%,-50%) rotate(${spin*p}deg) scale(${.65+.35*p})`;
    node.style.opacity=String(Math.min(1,p*5));
  });
  s.follow(node,toId);
}
async function phase5Result(s,step,result,art,kind='strike') {
  const miss=['miss','dodge','immune','invalid'].includes(result.outcome?.type);
  if(art&&!miss)phase5Pulse(s,art,resolvePresentationTarget(result,step),kind);
  commitBattlefieldPlayerResult(result,step,s.local);
  await s.wait(s.reduced?80:150);
}
async function phase5VineLink(s,fromId,toId) {
  const node=phase5Image(s,PHASE5_ART.vine,toId,'link');
  s.unfollow(node);
  await s.tick(s.reduced?100:260,p=>{
    const a=getBattleEffectAnchor(fromId),b=getBattleEffectAnchor(toId);node.hidden=!a||!b;if(!a||!b)return;
    const ay=a.rect.top+Math.min(12,a.rect.height*.2),by=b.rect.top+Math.min(12,b.rect.height*.2);
    node.style.left=(a.x+b.x)/2+'px';node.style.top=(ay+by)/2+'px';
    node.style.width=Math.hypot(b.x-a.x,by-ay)+'px';node.style.height='32px';node.style.objectFit='fill';
    node.style.transform=`translate(-50%,-50%) rotate(${Math.atan2(by-ay,b.x-a.x)}rad) scaleY(${.65+.35*Math.sin(p*Math.PI)})`;
    node.style.opacity=String(Math.sin(p*Math.PI));
  });node.remove();
}
async function playPhase5DruidGuard(result,context) {
  if(!result.sharedFrom||!['treant','tree'].includes(result.targetBefore?.druidForm)||(result.actualDamage??result.finalDamage??0)<=0)return;
  const id=resolvePresentationTarget(result);
  await preloadPhase5Art([PHASE5_ART.vine],context.signal);
  await withBattlefieldSkillStage({sourceRole:'druid',sourceId:id,targetId:result.sharedFrom,actionId:'dru_guard',results:[]},
    {...context,skipCastAudio:true},async s=>{s.local.audioScope.play('vine_strike',{noHold:true});await phase5VineLink(s,id,result.sharedFrom);});
}
async function playPhase5DruidSleep(result,context) {
  const before=result.targetBefore,after=result.targetAfter;
  if(after?.role!=='druid'||before?.druidForm===after.druidForm||
    !['treant','tree'].includes(before?.druidForm)||!['treant','tree'].includes(after.druidForm))return;
  const id=resolvePresentationTarget(result),sleeping=after.druidForm==='tree';
  await preloadPhase5Art([PHASE5_ART.roots,PHASE5_ART.vine],context.signal);
  await withBattlefieldSkillStage({sourceRole:'druid',sourceId:id,targetId:id,actionId:'dru_sleep',results:[]},
    {...context,skipCastAudio:true},async s=>{
      phase5Pulse(s,sleeping?PHASE5_ART.roots:PHASE5_ART.vine,id,'roots',320);
      await s.wait(s.reduced?100:240);
    });
}
async function playPhase5BattlefieldPresentation(step,context) {
  const reactions=step.sourceRole==='augur'?[]:step.augurReactions||[];
  for(const reaction of reactions.filter(r=>r.actionId!=='aug_tome'))await playBattlefieldAugur(reaction,{...context,augurReaction:true});
  await playPhase5BattlefieldCore(step,context);
  for(const reaction of reactions.filter(r=>r.actionId==='aug_tome'))await playBattlefieldAugur(reaction,{...context,augurReaction:true});
}
async function playPhase5BattlefieldCore(step,context) {
  if(step.sourceRole==='sage')return step.actionId==='sge_equation'
    ?playSageEquationPresentation(step,context):playSageSkillPresentation(step,context);
  if(step.sourceRole==='augur')return playBattlefieldAugur(step,context);
  if(step.sourceRole==='onmyoji')return playBattlefieldOnmyoji(step,context);
  if(step.sourceRole==='druid')return playBattlefieldDruid(step,context);
  return playBattlefieldGladiator(step,context);
}

// Reuse the complete orb / hands / prism / whiteout renderer, replacing only
// its combatant layer. No portraits or HP bars are created by this subclass.
class BattlefieldAugurEngine extends AugurPresentationEngine {
  buildMarkup() {
    super.buildMarkup();
    this.container.querySelector('#augurOrbTarget').remove();
    this.container.querySelector('.debt-ledger').remove();
    this.container.classList.add('phase5-augur');
  }
  buildCombatants() {
    const anchor=side=>{const n=document.createElement('div');n.dataset.side=side;n.className='phase5-augur-anchor';this.container.appendChild(n);return n;};
    this.actorNode=anchor('actor');this.bossNode=anchor('target');
    this.omenMark=document.createElement('div');this.omenMark.className='card omen-mark';fillAugurCard(this.omenMark,'omen');
    this.bossNode.appendChild(this.omenMark);fillAugurCard(this.container.querySelector('#augurContractCard'),'omen');
  }
  portraitBounds(node,stageRect) {
    const id=node.dataset.side==='actor'?this.step.sourceId:(this.visualTargetId||battlefieldPlayerTarget(this.step));
    const a=getBattleEffectAnchor(id);
    if(!a)return {x:0,y:0,w:0,h:0};
    node.style.left=(a.x-stageRect.left)+'px';node.style.top=(a.y-stageRect.top)+'px';
    return {x:a.x-stageRect.left,y:a.y-stageRect.top,w:a.rect.width,h:a.rect.height};
  }
  setObservedTarget(id,snapshot) {
    const target=snapshot?.players?.find(p=>p.id===id);this.observedTargetId=target?.id||null;
    this.container.querySelector('#augurOrbObservedLabel').textContent=target?.name||'';
  }
  async transitionObservedTarget(id,snapshot) {this.setObservedTarget(id,snapshot);}
  syncSnapshot(snapshot) {
    const actor=snapshot?.players?.find(p=>p.id===this.step.sourceId)||{};
    this.orbRig.style.setProperty('--debt',Math.min(1,(actor.augurFateDebts||[]).reduce((n,d)=>n+d.amount,0)/60));
    const state=actor.augurCardState||'empty';this.container.dataset.cardState=state;
    this.container.querySelector('#augurCardStateLabel').textContent={empty:'空象',upright:'正位',reversed:'逆位'}[state]||'';
    this.orbitCards?.forEach(card=>fillAugurCard(card,state==='reversed'?'reverse':state));
    this.setObservedTarget(actor.observedTargetId,snapshot);
  }
}
async function playBattlefieldAugur(step,context) {
  await preloadPhase5Art(['/assets/augur1.png','/assets/augur2.png'],context.signal);
  await withBattlefieldSkillStage(step,context,async s=>{
    const engine=new BattlefieldAugurEngine(s.root,{step,signal:s.signal,speed:context.speed||1,reduced:s.reduced,audioScope:s.local.audioScope});
    const plan=buildAugurPresentationPlan(step);engine.syncSnapshot(plan.before);
    s.startRenderer(()=>{
      if(engine.disposed)return;
      const rect=s.root.getBoundingClientRect();
      engine.bounds.boss=engine.portraitBounds(engine.bossNode,rect);engine.bounds.augur=engine.portraitBounds(engine.actorNode,rect);
    });
    try {
      if(plan.outcome.type!=='invalid') {
        if(['aug_observe','aug_bind'].includes(plan.action)) {
          await engine.sweepHand(s.reduced?180:1100);
          engine.visualTargetId=plan.observedId;
          engine.bounds.boss=engine.portraitBounds(engine.bossNode,s.root.getBoundingClientRect());
          if(getVisualAnchor(plan.observedId))await engine.playBeamAnimation(320);
          engine.setObservedTarget(plan.observedId,plan.after);
        } else if(plan.action==='aug_reckon')await engine.reckonHands(s.reduced?500:2600);
        else if(['aug_reverse','aug_upright'].includes(plan.action))await engine.flipTarotCard('orb',plan.action==='aug_reverse',s.reduced?150:650);
      }
      for(const result of step.results||[]) {
        engine.visualTargetId=resolvePresentationTarget(result,step);
        engine.bounds.boss=engine.portraitBounds(engine.bossNode,s.root.getBoundingClientRect());
        if(result.kind==='damage'&&(result.actualDamage??result.finalDamage)>0)await engine.playBeamAnimation(s.reduced?120:330,result.damageType==='true');
        if(!context.augurReaction)commitBattlefieldPlayerResult(result,step,s.local);
        if(result.targetAfter?.reversedOmenRemaining>0&&result.targetBefore?.reversedOmenRemaining!==result.targetAfter.reversedOmenRemaining)
          await engine.flipTarotCard('boss',true,s.reduced?120:400,'omen');
        engine.syncSnapshot(result.hpSnapshot||plan.before);
        await s.wait(100);
      }
      if(!context.augurReaction&&!s.signal?.aborted&&step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);
      await s.wait(180);
    } finally {engine.dispose();}
  });
}

async function playBattlefieldOnmyoji(step,context) {
  await preloadPhase5Art([PHASE5_ART.talisman,PHASE5_ART.decree],context.signal);
  await withBattlefieldSkillStage(step,context,async s=>{
    const id=battlefieldPlayerTarget(step),action=step.actionId;
    const results=step.results||[],primary=results.find(r=>resolvePresentationTarget(r,step)===id);
    const matching=results.filter(r=>resolvePresentationTarget(r,step)===id);
    const before=step.hpSnapshotBefore?.enemies?.find(e=>e.instanceId===id)||primary?.targetBefore||{};
    const after=step.hpSnapshot?.enemies?.find(e=>e.instanceId===id)||matching.at(-1)?.targetAfter||{};
    const beforeCount=(before.talismans||[]).length,afterCount=(after.talismans||[]).length;
    const papers=[];
    if(['onm_talisman','onm_all_talismans'].includes(action)) {
      phase5Pulse(s,PHASE5_ART.decree,step.sourceId,'decree',400);await s.wait(180);
      const count=Math.max(0,afterCount-beforeCount);
      // Leader art uses the ten actual additions (five elements twice); no
      // papers are fabricated when the server supplied no attachments.
      for(let i=0;i<count;i++) {
        const paper=phase5Image(s,PHASE5_ART.talisman,step.sourceId,'paper');papers.push(paper);
        paper.dataset.element=(after.talismans||[])[beforeCount+i]||'';
        await phase5Fly(s,paper,step.sourceId,id,s.reduced?60:180,18*(i%2?1:-1));
        s.animate(paper,[{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(.16)'}],160);
      }
    } else if(action==='onm_detonate'&&beforeCount>0) {
      for(let i=0;i<beforeCount;i++) {
        const paper=phase5Image(s,PHASE5_ART.talisman,id,'paper');papers.push(paper);
        const angle=i/beforeCount*Math.PI*2;
        s.animate(paper,[{opacity:1,transform:'translate(-50%,-50%) scale(.25)'},
          {opacity:1,transform:`translate(calc(-50% + ${Math.cos(angle)*80}px),calc(-50% + ${Math.sin(angle)*65}px)) rotate(${i*48}deg)`,offset:.55},
          {opacity:0,transform:`translate(-50%,-50%) rotate(${i*48+160}deg) scale(.1)`}],s.reduced?150:600);
      }
      await s.wait(s.reduced?120:520);
      // Paper fragments, rather than a generic magic explosion.
      for(const paper of papers)s.animate(paper,[{opacity:.8,transform:'translate(-50%,-50%) scale(.15)'},{opacity:0,transform:'translate(-50%,-120%) rotate(125deg) scale(.05)'}],180);
    } else if(action==='basic') {
      const paper=phase5Image(s,PHASE5_ART.talisman,step.sourceId,'paper');papers.push(paper);
      await phase5Fly(s,paper,step.sourceId,id,280,-35);s.animate(paper,[{opacity:1},{opacity:0}],120);
    }
    for(const result of results)await phase5Result(s,step,result);
    if(!s.signal?.aborted&&step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);
    await s.wait(200);
  });
}

async function playBattlefieldGladiator(step,context) {
  await preloadPhase5Art([PHASE5_ART.slash,PHASE5_ART.spark,PHASE5_ART.blood],context.signal);
  await withBattlefieldSkillStage(step,{...context,skipCastAudio:step.actionId==='g_arena'&&step.outcome?.type==='challenge'},async s=>{
    const audio=s.local.audioScope,meta={...step.gladiatorPresentation,...step.arenaPresentation};
    if(step.type==='arena_enter') {
      // Isolation is established only by the server's arena snapshot.
      if(step.hpSnapshot?.arena){syncEnemyArenaVisual(step.hpSnapshot.arena);audio.play('shield_block',{noHold:true});}
      await s.wait(250);
    }
    if(step.actionId==='g_arena'&&step.outcome?.type==='challenge') {
      const targetId=step.targetEnemyId||step.hpSnapshotBefore?.monster?.instanceId||battlefieldPlayerTarget(step),pace=PRESENTATION_CONFIG.gladiator.pace;
      const geometry=()=>{
        const a=getBattleEffectAnchor(step.sourceId),b=getBattleEffectAnchor(targetId);
        if(!a||!b)return null;
        const scale=Math.min(innerWidth/1440,innerHeight/810)||1,left=(innerWidth-1440*scale)/2,top=(innerHeight-810*scale)/2;
        return {start:{x:(a.x-left)/scale,y:(a.y-top)/scale-20},landing:{x:(b.x-left-b.rect.width*.24)/scale,y:(b.rect.bottom-top)/scale-8}};
      };
      const fx=(cls,x,y,html)=>{const n=s.el('div',cls,html);s.position(n,x,y);return n;};
      await playGladiatorChallengePresentation(step,{
        owner:{},actorMotion:s.actor,reduced:s.reduced,challengeGeometry:geometry,
        animate:(n,keys,ms)=>s.animate(n,keys,ms*pace),wait:ms=>s.wait(ms*pace),
        tick:(ms,update)=>s.tick(ms*pace,update),fx,
        emit:beat=>context.onTiming?.(beat,{step}),
        sound:(cue,volume=.5)=>audio.play(GLADIATOR_SFX[cue],{noHold:true,volume,maxDuration:.28}),
        burst:(x,y)=>{for(let i=0;i<(s.reduced?2:9);i++){
          const n=fx('gladiator-fragment gladiator-fragment-sand',x,y);
          s.animate(n,[{opacity:.8,transform:'translate(0,0)'},{opacity:0,transform:`translate(${(i*47%90)-45}px,${-12-i%3*10}px)`}],300*pace);
        }},
        followLanding:(...nodes)=>s.startRenderer(()=>{const g=geometry();for(const n of nodes){n.hidden=!g;if(g)s.position(n,g.landing.x,g.landing.y-(n===nodes[0]?35:0));}}),
        resolve:result=>{commitBattlefieldPlayerResult(result,step,s.local);},
        applySnapshot:()=>{if(!s.signal?.aborted&&step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);}
      });
      return;
    }
    for(const result of step.results||[]) {
      const id=resolvePresentationTarget(result,step),damage=result.kind==='damage';
      if(damage&&(result.actualDamage??result.finalDamage)>0){
        audio.play(id===step.sourceId?'warrior_basic':'physical_hit',{noHold:true});
        phase5Pulse(s,PHASE5_ART.spark,id,'spark',240);
      }
      await phase5Result(s,step,result,damage?(id===step.sourceId?PHASE5_ART.blood:PHASE5_ART.slash):null);
      if(damage&&id===step.sourceId&&step.actionId==='g_sacrifice')audio.play('boss_roar',{noHold:true,volume:.35});
    }
    if(step.type==='arena_exit'&&meta.triumphApplied===true) {
      if(meta.rageConsumedSnapshot)applyHpSnapshot(meta.rageConsumedSnapshot);
      audio.play('gladiator_triumph',{noHold:true});
      for(const p of meta.triumphSnapshot?.players||[])if(p.hp>0)phase5Pulse(s,PHASE5_ART.blood,p.id,'triumph',420);
      await s.wait(400);
      if(meta.triumphSnapshot)applyHpSnapshot(meta.triumphSnapshot);
    }
    if(!s.signal?.aborted&&step.hpSnapshot){applyHpSnapshot(step.hpSnapshot);syncEnemyArenaVisual(step.hpSnapshot.arena||null);}
    await s.wait(200);
  });
}

async function playBattlefieldDruid(step,context) {
  const portraits=(step.results||[]).flatMap(result=>[
    ...(result.kind==='transform'&&result.targetAfter?[resolveBattlePortrait(result.targetAfter).src]:[]),
    ...(result.minions||[]).slice(0,3).map((minion,index)=>resolveBattlePortrait({...minion,minionIndex:minion.minionIndex||index+1,entityType:'minion'}).src)
  ]).filter(Boolean);
  await preloadPhase5Art([PHASE5_ART.vine,PHASE5_ART.roots,PHASE5_ART.claw,PHASE5_ART.spark,...portraits],context.signal);
  await withBattlefieldSkillStage(step,context,async s=>{
    const audio=s.local.audioScope;
    for(const result of step.results||[]) {
      const id=resolvePresentationTarget(result,step),form=result.targetAfter?.druidForm;
      if(result.minion&&result.kind==='damage') {
        const minion=result.minion,origin=getVisualAnchor(minion.id);
        if(origin&&minion.type==='wolf') {
          const original=origin.element.matches('img')?origin.element:origin.element.querySelector('img');
          if(original?.currentSrc||original?.src) {
            const sprite=phase5Image(s,original.currentSrc||original.src,minion.id,'companion');
            await phase5Fly(s,sprite,minion.id,id,200);
            await phase5Result(s,step,result,PHASE5_ART.claw);
            await phase5Fly(s,sprite,id,minion.id,180);sprite.remove();
            continue;
          }
        } else if(origin&&minion.type==='treant') {
          const vine=phase5Image(s,PHASE5_ART.vine,minion.id,'link');
          await phase5Fly(s,vine,minion.id,id,220);
          await phase5Result(s,step,result,PHASE5_ART.vine);vine.remove();continue;
        }
        await phase5Result(s,step,result,minion.type==='treant'?PHASE5_ART.vine:PHASE5_ART.claw);
      } else if(result.kind==='transform') {
        // The authority commit swaps the existing portrait and keeps its form.
        phase5Pulse(s,form==='treant'||form==='tree'?PHASE5_ART.roots:PHASE5_ART.claw,id,form==='treant'||form==='tree'?'roots':'strike',400);
        if(form==='bear')phase5Pulse(s,PHASE5_ART.spark,id,'strike',450);
        audio.play(form==='werewolf'?'transform_wolf':form==='bear'?'boss_roar':'transform_treant',{noHold:true});
        await s.wait(180);commitBattlefieldPlayerResult(result,step,s.local);await s.wait(180);
      } else if(result.kind==='summon') {
        phase5Pulse(s,result.minions?.some(m=>m.type==='wolf')?PHASE5_ART.claw:PHASE5_ART.roots,id,'roots',350);
        commitBattlefieldPlayerResult(result,step,s.local);
        // Existing HUD is the only persistent summon display.
        for(const minion of (result.minions||[]).slice(0,3)) {
          const a=getVisualAnchor(minion.id)?.element;if(!a)continue;
          const animation=s.animate(a,s.reduced?[{opacity:.5},{opacity:1}]:[{opacity:0,transform:'scale(.65)'},{opacity:1,transform:'scale(1)'}],220);
          await animation.finished.catch(()=>{});
        }
      } else {
        const actor=step.hpSnapshotBefore?.players?.find(p=>p.id===step.sourceId);
        const currentForm=step.druidForm||actor?.druidForm;
        const nature=['treant','tree'].includes(currentForm);
        const art=nature?PHASE5_ART.vine:currentForm==='bear'?PHASE5_ART.spark:currentForm==='werewolf'?PHASE5_ART.claw:PHASE5_ART.vine;
        if(result.sharedFrom)await phase5VineLink(s,result.sharedFrom,id);
        if(result.kind==='damage')audio.play(nature?'vine_strike':'physical_hit',{noHold:true});
        await phase5Result(s,step,result,result.kind==='damage'?art:null,nature?'roots':'strike');
      }
    }
    if(!s.signal?.aborted&&step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);
    await s.wait(180);
  });
}
