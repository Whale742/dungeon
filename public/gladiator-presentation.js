// Choreography and persistent environment override of the existing production Combat Stage.
// Gameplay is consumed exclusively from authoritative queue results and snapshots.
let gladiatorArenaStage = null;
const GLADIATOR_SFX = Object.freeze({selfSlash:'warrior_basic',bloodHit:'physical_hit',roar:'boss_roar',
  throw:'air_pass',spin:'air_pass',ground:'physical_hit',rumble:'boss_rumble',stone:'shield_break',
  stomp:'physical_hit',gong:'shield_block',sprint:'air_pass',gather:'exhausted_apply',chop:'warrior_skill1',
  slash:'warrior_basic',heartbeat:'boss_rumble',scrape:'reload_pull',rush:'air_pass',wall:'shield_break',fall:'exhausted_apply'});
const gladiatorTarget=(snapshot,id)=>id==='monster'?snapshot?.monster:snapshot?.players?.find(p=>p.id===id);
function gladiatorNode(parent,cls,html){const n=document.createElement('div');n.className=cls;if(html)n.innerHTML=html;parent.appendChild(n);return n;}
function clearGladiatorPresentationState(){
  const arena=gladiatorArenaStage;gladiatorArenaStage=null;
  if(arena){arena.unbind?.();window.removeEventListener('resize',arena.resize);for(const a of arena.animations)a.cancel();arena.root.remove();}
  const stage=document.getElementById('presentationCombatStage');
  stage?.classList.remove('arena-stage-active','arena-intermission');
  stage?.querySelectorAll('.gladiator-action-owner,.arena-environment').forEach(n=>n.remove());
}
function hasGladiatorArenaStage(){return !!gladiatorArenaStage?.root.isConnected;}
function bindGladiatorArenaSignal(context){
  if(!hasGladiatorArenaStage())return;
  const arena=gladiatorArenaStage,signal=context.signal||context.controller?.signal;
  if(arena.signal===signal)return;arena.unbind?.();arena.signal=signal;
  signal?.addEventListener('abort',clearGladiatorPresentationState,{once:true});
  arena.unbind=()=>signal?.removeEventListener('abort',clearGladiatorPresentationState);
  if(signal?.aborted)clearGladiatorPresentationState();
}
function gladiatorLayout(root){
  const frame=gladiatorNode(root,'gladiator-frame'),box=getOrCreateCombatStage().getBoundingClientRect();
  const scale=Math.min(box.width/1440,box.height/810)||1;
  frame.style.transform=`translate(${(box.width-1440*scale)/2}px,${(box.height-810*scale)/2}px) scale(${scale})`;
  return {root,frame,cards:new Map(),positions:new Map(),animations:new Set(),departed:new Set()};
}
function gladiatorCard(owner,id,target,step,x,y){
  let card=owner.cards.get(id);
  if(!card){
    const position=gladiatorNode(owner.combatants||owner.frame,'gladiator-position '+(id==='monster'?'presentation-combat-target-position':'presentation-combat-actor-position'));
    position.style.left=x+'px';position.style.top=y+'px';position.dataset.actorId=id;
    card=createResultCard({targetId:id,targetBefore:target,monsterName:step.monsterName,monsterAvatar:step.monsterAvatar});
    position.appendChild(card);card.classList.add('gladiator-card');
    card.querySelector('.presentation-result-hit').classList.add('gladiator-motion',id==='monster'?'presentation-combat-target-hit':'presentation-combat-actor-visual');
    if(target?.role==='gladiator')gladiatorNode(card,'gladiator-rage-ui');
    owner.cards.set(id,card);owner.positions.set(id,position);
  }
  gladiatorUpdateCard(card,target);if(owner.departed.has(id))owner.positions.get(id).hidden=true;return card;
}
function gladiatorUpdateCard(card,target){
  if(!card||!target)return;updateResultCard(card,target);
  const rage=card.querySelector('.gladiator-rage-ui');if(rage){rage.textContent='RAGE '+(target.rage??0);rage.dataset.rage=String(target.rage??0);}
}
function gladiatorApply(owner,snapshot){
  if(!snapshot)return;for(const [id,card] of owner.cards)gladiatorUpdateCard(card,gladiatorTarget(snapshot,id));
  if(typeof applyHpSnapshot==='function')applyHpSnapshot(snapshot);
}
function arenaSwordField(count,front=false){
  return Array.from({length:count},(_,i)=>{
    const lane=i%2,left=(3+(i*37)%94),top=front?68+(i*19%24):9+(i*31%64);
    const angle=-24+(i*29%49),scale=(front?1.05:.58)+(i*13%31)/100;
    return `<i class="arena-buried-sword" style="--arena-sword-left:${left}%;--arena-sword-top:${top}%;--arena-sword-angle:${angle}deg;--arena-sword-scale:${scale};--arena-sword-delay:${(i%7)*18}ms;--arena-sword-depth:${lane}"><b></b><em></em><span></span></i>`;
  }).join('');
}
function createGladiatorArena(step,context){
  if(hasGladiatorArenaStage()){bindGladiatorArenaSignal(context);return gladiatorArenaStage;}
  const stage=getOrCreateCombatStage();stage.classList.add('arena-stage-active');
  const root=gladiatorNode(stage,'arena-environment'),owner=gladiatorLayout(root);
  owner.playerId=step.arenaPresentation?.playerId||step.hpSnapshotBefore?.arena?.playerId||step.sourceId;
  owner.backdrop=gladiatorNode(owner.frame,'arena-backdrop');owner.spotlight=gladiatorNode(owner.backdrop,'arena-spotlight');
  owner.backWall=gladiatorNode(owner.frame,'arena-back-wall');
  owner.ground=gladiatorNode(owner.frame,'arena-ground','<svg viewBox="0 0 1440 250" preserveAspectRatio="none"><path d="M70 90l240 27 95-14m-140 13-40 26M770 60l-60 29 35 22-90 35M940 150l220-45 80 16M410 190l180-35 120 23"/></svg>');
  owner.swordBack=gladiatorNode(owner.frame,'arena-sword-field arena-sword-field-back',arenaSwordField(34));
  owner.combatants=gladiatorNode(owner.frame,'arena-combatants');
  owner.swordFront=gladiatorNode(owner.frame,'arena-sword-field arena-sword-field-front',arenaSwordField(16,true));
  const snapshot=step.hpSnapshotBefore||step.hpSnapshot;
  gladiatorCard(owner,owner.playerId,gladiatorTarget(snapshot,owner.playerId),step,482,435);
  gladiatorCard(owner,'monster',snapshot?.monster,step,958,435);
  owner.resize=()=>{const box=stage.getBoundingClientRect(),scale=Math.min(box.width/1440,box.height/810)||1;owner.frame.style.transform=`translate(${(box.width-1440*scale)/2}px,${(box.height-810*scale)/2}px) scale(${scale})`;};
  window.addEventListener('resize',owner.resize);
  if(step.type==='arena_enter'){owner.root.classList.add('arena-entering');owner.positions.get(owner.playerId).style.opacity='0';owner.positions.get('monster').style.opacity='0';}
  gladiatorArenaStage=owner;bindGladiatorArenaSignal(context);return owner;
}
function handlesGladiatorPresentation(step){return step.type==='arena_enter'||step.type==='arena_exit'||hasGladiatorArenaStage()||!!step.hpSnapshotBefore?.arena||(step.type==='player_action'&&step.sourceRole==='gladiator');}
async function withGladiatorPresentation(step,context,owner,play){
  const controller=new AbortController(),parentSignal=context.signal||context.controller?.signal;
  const abort=()=>controller.abort();parentSignal?.addEventListener('abort',abort,{once:true});if(parentSignal?.aborted)controller.abort();
  const signal=controller.signal,reduced=!!context.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed=context.speed||1,pace=PRESENTATION_CONFIG.gladiator?.pace||1,animations=new Set(),temps=new Set(),audioScope=createSfxPresentationScope({...context,signal});
  const wait=ms=>waitForPresentation(ms*pace,signal,speed);
  const animate=(node,keys,ms,options={})=>{
    if(signal.aborted)throw new DOMException('Presentation cancelled','AbortError');
    const a=node.animate(keys,{duration:ms*pace/speed,fill:'forwards',...options});animations.add(a);owner.animations.add(a);a.finished.catch(()=>{});return a;
  };
  const fx=(cls,x,y,html)=>{const n=gladiatorNode(owner.frame,cls,html);n.style.left=x+'px';n.style.top=y+'px';temps.add(n);return n;};
  const sound=(cue,volume=.5)=>audioScope.play(GLADIATOR_SFX[cue],{noHold:true,volume,maxDuration:.28});
  const emit=beat=>context.onTiming?.(beat,{step});
  const burst=(x,y,type='sand',count=12)=>{
    for(let i=0;i<(reduced?Math.min(3,count):count);i++){
      const n=fx('gladiator-fragment gladiator-fragment-'+type,x,y),dx=((i*47%131)-65)*(reduced?.35:1),dy=-(20+i*13%65)*(reduced?.35:1);
      animate(n,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${dx}px,${dy}px) rotate(${i*31}deg)`,opacity:.8,offset:.45},{transform:`translate(${dx*1.4}px,20px) rotate(${i*53}deg)`,opacity:0}],320);
    }
  };
  const slash=(id,angle=-32,heavy=false)=>{
    const p=owner.positions.get(id),n=fx('gladiator-slash'+(heavy?' gladiator-slash-heavy':''),parseFloat(p.style.left),parseFloat(p.style.top));
    animate(n,[{opacity:0,transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.1)`},{opacity:1,offset:.22,transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`},{opacity:0,transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.05)`}],heavy?160:120);
  };
  const resolve=async result=>{
    const card=owner.cards.get(result.targetId);if(!card||signal.aborted)return;
    await presentCombatResult(result,card,{...context,signal,audioScope,sourceRole:step.sourceRole,suppressFx:true,suppressReaction:true,skipResultAudio:true,skipDeathAnimation:true,immediateImpact:true,fastResult:true});
    gladiatorUpdateCard(card,result.targetAfter);
  };
  const cleanup=()=>{
    for(const a of animations){a.cancel();owner.animations.delete(a);}animations.clear();for(const n of temps)n.remove();temps.clear();
    owner.frame.querySelectorAll('.presentation-result-number').forEach(n=>n.remove());
    owner.frame.querySelectorAll('.gladiator-motion').forEach(n=>{n.style.filter='';});
  };
  signal.addEventListener('abort',cleanup,{once:true});owner.root.dataset.reducedMotion=String(reduced);
  try{await Promise.all([...owner.frame.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));await presentationFrame(signal);await play({owner,signal,reduced,speed,wait,animate,fx,sound,emit,burst,slash,resolve,audioScope});if(!signal.aborted)emit('action_complete');}
  finally{parentSignal?.removeEventListener('abort',abort);controller.abort();cleanup();}
}
async function playGladiatorPresentation(step,context={}){
  if(step.type==='arena_enter'){const owner=createGladiatorArena(step,context);return withGladiatorPresentation(step,context,owner,s=>playGladiatorArenaEnter(step,s));}
  if(step.type==='arena_exit'){const owner=createGladiatorArena(step,context);try{return await withGladiatorPresentation(step,context,owner,s=>playGladiatorArenaExit(step,s));}finally{clearGladiatorPresentationState();}}
  if(!hasGladiatorArenaStage()&&step.hpSnapshotBefore?.arena)createGladiatorArena(step,context); // Reconnect restores the stage without replaying Enter.
  if(hasGladiatorArenaStage()){bindGladiatorArenaSignal(context);const owner=gladiatorArenaStage;gladiatorApply(owner,step.hpSnapshotBefore);return withGladiatorPresentation(step,context,owner,s=>playGladiatorAction(step,s));}
  return withCombatCanvas(context,step.category,async canvas=>{
    canvas.classList.add('gladiator-action-owner');const owner=gladiatorLayout(canvas),before=step.hpSnapshotBefore||step.hpSnapshot;
    gladiatorCard(owner,step.sourceId,gladiatorTarget(before,step.sourceId),step,405,435);gladiatorCard(owner,'monster',before?.monster,step,1000,435);
    await withGladiatorPresentation(step,context,owner,s=>playGladiatorAction(step,s));
  });
}
async function playGladiatorAction(step,s){
  const {owner,wait,animate,emit,fx,burst,slash,sound,reduced,resolve}=s;
  const actorId=owner.playerId||step.sourceId,position=owner.positions.get(actorId),card=owner.cards.get(actorId);
  const motion=card?.querySelector('.gladiator-motion'),boss=owner.cards.get('monster')?.querySelector('.gladiator-motion');
  const title=fx('gladiator-action-title',720,120);title.textContent=step.skillName||'';
  if(step.type!=='player_action'||step.sourceRole!=='gladiator'){
    // Boss and status results resolve once, at their standing Arena positions.
    for(const result of step.results||[]){
      const target=owner.cards.get(result.targetId);
      if(target&&result.kind==='damage'){
        animate(target.querySelector('.gladiator-motion'),[{transform:'scale(1)'},{transform:'scale(.93) translateY(5px)',offset:.25},{transform:'scale(1)'}],180);
        sound('bloodHit');slash(result.targetId,-25);
      }
      await resolve(result);await wait(90);
      if(target&&result.isDead)target.classList.add('gladiator-fallen');
    }
    gladiatorApply(owner,step.hpSnapshot);return;
  }
  if(step.actionId==='g_sacrifice'&&step.outcome?.type==='sacrifice'){
    const timing=PRESENTATION_CONFIG.gladiator;
    emit('gladiator_self_slash');sound('selfSlash');slash(actorId,-38);
    animate(motion,[{transform:'scale(1)'},{transform:'scale(.95) rotate(-2deg)',offset:.35},{transform:'scale(.95) translateX(2px)',offset:.55},{transform:'scale(.95) translateX(-2px)',offset:.75},{transform:'scale(.95)'}],timing.selfSlash);
    await wait(timing.selfSlash);
    emit('gladiator_self_hp');sound('bloodHit',.35);
    const x=parseFloat(position.style.left),y=parseFloat(position.style.top),blood=fx('gladiator-blood-line',x+65,y-12);
    animate(blood,[{opacity:1,transform:'rotate(-18deg) scaleX(.2)'},{opacity:1,transform:'rotate(-18deg) scaleX(1)',offset:.35},{opacity:0,transform:'rotate(-18deg) scaleX(1.2)'}],160);burst(x+65,y-12,'blood',5);
    for(const result of (step.results||[]).filter(r=>r.kind==='damage'))await resolve(result);
    await wait(timing.selfBlood);
    emit('gladiator_war_roar');sound('roar',.35);
    animate(motion,[{transform:'scale(.95)'},{transform:'translateY(-8px) scale(1.08) rotate(-3deg)',offset:.35},{transform:'scale(1)'}],timing.warRoar);
    const roar=fx('gladiator-roar-streak',x,y);animate(roar,[{opacity:0,transform:'translate(-50%,-50%) scaleX(.3)'},{opacity:.85,transform:'translate(-50%,-50%) scaleX(1)',offset:.3},{opacity:0,transform:'translate(-50%,-50%) scaleX(1.15)'}],210);
    burst(x,y+90,'sand',11);burst(x,y,'bronze',7);burst(x+46,y-8,'blood',4);await wait(50);
    for(const result of (step.results||[]).filter(r=>r.kind!=='damage'))await resolve(result);
    const meta=step.gladiatorPresentation;
    if(meta?.rageGained>0){resultFloat(card,'RAGE +'+meta.rageGained,'is-status');emit('gladiator_rage_gain');}
    if(meta?.bloodGained>0){resultFloat(card,'血祭 +'+meta.bloodGained,'is-status');emit('gladiator_blood_gain');}
    if(meta?.bloodHealApplied){resultFloat(card,'死線喘息 · 治療 +20%','is-status');emit('gladiator_blood_heal');}
    gladiatorApply(owner,step.hpSnapshot);await wait(timing.warRoar-50);return;
  }
  if(step.actionId==='g_arena'&&step.outcome?.type==='challenge')return playGladiatorChallengePresentation(step,s);
  if(step.outcome?.type==='suicide')return playGladiatorMutualDestruction(step,s);
  if(step.actionId==='g_sacrifice'&&(step.gladiatorPresentation?.arenaActive||step.outcome?.type==='arena_assault'))return playGladiatorArenaAssault(step,s);
  emit('gladiator_basic_dash');sound('selfSlash',.4);burst(parseFloat(position.style.left)-25,parseFloat(position.style.top)+88,'sand',6);
  animate(position,[{transform:'translate(0,0)'},{transform:`translateX(${reduced?8:35}px)`,offset:.45},{transform:'translate(0,0)'}],280);
  await wait(110);slash('monster',-30);sound('bloodHit',.3);burst(parseFloat(owner.positions.get('monster').style.left)-45,parseFloat(owner.positions.get('monster').style.top),'bronze',4);
  animate(boss,[{transform:'scale(1)'},{transform:'scale(.97) translateX(4px)',offset:.3},{transform:'scale(1)'}],140);
  for(const result of step.results||[])await resolve(result);
  gladiatorApply(owner,step.hpSnapshot);await wait(250);
}
async function playGladiatorChallengePresentation(step,s){
  const {owner,animate,wait,emit,fx,sound,burst,reduced,resolve}=s;
  const actor=owner.positions.get(step.sourceId),motion=owner.cards.get(step.sourceId).querySelector('.gladiator-motion');
  animate(motion,[{transform:'scale(1)'},{transform:'translateY(12px) scale(.96)',offset:.65},{transform:'scale(1)'}],220);
  emit('gladiator_challenge_sink');await wait(180);
  const boss=owner.positions.get('monster'),landing={x:parseFloat(boss.style.left)-95-35,y:parseFloat(boss.style.top)+95};
  const start={x:parseFloat(actor.style.left)+40,y:parseFloat(actor.style.top)-20};
  const sword=fx('gladiator-gladius',start.x,start.y,'<svg viewBox="-60 -60 120 120" aria-hidden="true"><g class="gladiator-gladius-motion"><g transform="rotate(-90)"><path d="M-9-32H9V-2L0 58-9-2Z" fill="#c2b9a2" stroke="#745434" stroke-width="2"/><path d="M0-32V51" stroke="#e6d6b1"/><path d="M-22-34H22V-27H-22Z" fill="#bd8c46"/><path d="M-5-57H5V-34H-5Z" fill="#44271c" stroke="#bd8c46" stroke-width="2"/></g></g></svg>');
  const blade=sword.querySelector('.gladiator-gladius-motion');
  const keys=Array.from({length:25},(_,i)=>{const p=i/24;return{transform:`translate(${(landing.x-start.x)*p}px,${(landing.y-start.y)*p-Math.sin(p*Math.PI)*(reduced?45:220)}px)`};});
  sound('throw');emit('gladiator_gladius_throw');animate(sword,keys,650);animate(blade,[{transform:'rotate(0)'},{transform:'rotate(865deg)'}],650);
  for(let i=0;i<(reduced?1:3);i++){
    const ghost=fx('gladiator-gladius gladiator-gladius-ghost',start.x-i*12,start.y+i*5,sword.innerHTML);
    animate(ghost,keys.map((key,index)=>({...key,opacity:index<18?.18:0})),610+i*24);
  }
  await wait(300);sound('spin',.2);await wait(350);
  for(const a of sword.getAnimations())a.cancel();sword.style.left=landing.x+'px';sword.style.top=landing.y+'px';
  sword.classList.add('gladiator-gladius-planted');blade.style.transform='rotate(145deg)';
  sound('ground');burst(landing.x,landing.y,'sand',9);
  fx('gladiator-ground-crack',landing.x,landing.y,'<svg viewBox="0 0 100 30"><path d="M50 0L22 9 5 5M50 0L70 7 96 2M50 0L53 20 40 29"/></svg>');
  emit('gladius_landing');for(const result of step.results||[])await resolve(result);
  gladiatorApply(owner,step.hpSnapshot);await wait(340);
}
async function playGladiatorArenaEnter(step,s){
  const {owner,animate,wait,emit,sound,burst,reduced}=s,t=PRESENTATION_CONFIG.gladiator;
  const actor=owner.positions.get(owner.playerId),boss=owner.positions.get('monster');owner.root.classList.add('arena-entering');
  animate(owner.backdrop,[{opacity:0},{opacity:1}],t.arenaDarken);
  animate(owner.ground,[{transform:'translateY(0)'},{transform:`translateY(${reduced?1:5}px)`,offset:.25},{transform:'translateY(0)',offset:.5},{transform:`translateY(${reduced?1:4}px)`,offset:.75},{transform:'translateY(0)'}],650);
  actor.style.opacity='0';boss.style.opacity='0';sound('rumble',.35);emit('arena_darken');await wait(t.arenaDarken);
  animate(owner.backWall,[{transform:'translateY(150px)'},{transform:'translateY(-6px)',offset:.75},{transform:'translateY(0)'}],t.arenaWalls);
  for(const field of [owner.swordBack,owner.swordFront])animate(field,[{transform:'translateY(55px)',opacity:0},{transform:'translateY(-5px)',opacity:1,offset:.78},{transform:'translateY(0)',opacity:1}],t.arenaWalls+90);
  animate(owner.spotlight,[{opacity:0},{opacity:.95}],80);sound('stone');emit('arena_walls_snap');burst(420,595,'stone',15);burst(980,595,'sand',16);await wait(t.arenaWalls);
  actor.style.opacity='1';boss.style.opacity='1';
  for(const [node,direction] of [[actor,-1],[boss,1]])animate(node,[{transform:`translate(${direction*(reduced?24:330)}px,0)`},{transform:`translate(${direction*45}px,-9px)`,offset:.5},{transform:'translate(0,5px)',offset:.85},{transform:'translate(0,0)'}],t.arenaWalk);
  sound('stomp');emit('arena_combatants_enter');await wait(t.arenaWalk);
  burst(482,525,'sand',16);burst(958,525,'sand',16);burst(720,565,'bronze',10);gladiatorApply(owner,step.hpSnapshot);emit('arena_hp_scale');sound('gong',.35);
  if(step.arenaPresentation?.noMitigation){const n=s.fx('arena-rule-feedback',720,235);n.textContent='NO MITIGATION';}
  await wait(t.arenaSettle);owner.root.classList.remove('arena-entering');emit('arena_standing');
}
async function playGladiatorArenaAssault(step,s){
  const {owner,animate,wait,emit,burst,sound,slash,reduced,resolve}=s;
  const position=owner.positions.get(owner.playerId),motion=owner.cards.get(owner.playerId).querySelector('.gladiator-motion'),boss=owner.cards.get('monster').querySelector('.gladiator-motion');
  const distance=parseFloat(owner.positions.get('monster').style.left)-parseFloat(position.style.left)-105;
  sound('sprint');emit('arena_assault_sprint');burst(482,530,'sand');
  animate(position,[{transform:'translate(0,0)'},{transform:`translate(${reduced?15:50}px,0)`}],180);await wait(180);
  sound('gather',.3);emit('arena_assault_jump');
  animate(position,[{transform:`translate(${reduced?15:50}px,0)`},{transform:`translate(${reduced?distance*.55:distance}px,${reduced?-20:-90}px)`}],220);
  if(step.gladiatorPresentation?.rageConsumed>0){animate(owner.cards.get(owner.playerId).querySelector('.gladiator-rage-ui'),[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.3)'}],150);emit('arena_assault_rage_consume');}
  await wait(220);sound('chop');emit('arena_assault_slam');
  animate(position,[{transform:`translate(${reduced?distance*.55:distance}px,${reduced?-20:-90}px)`},{transform:`translate(${distance}px,8px)`}],150);
  animate(motion,[{transform:'rotate(0)'},{transform:'rotate(20deg)',offset:.5},{transform:'rotate(0)'}],150);
  animate(boss,[{transform:'scale(1)'},{transform:'translateY(12px) scaleY(.85)',offset:.4},{transform:'scale(1)'}],220);
  slash('monster',85,true);burst(958,530,'sand',18);burst(958,535,'stone',9);await wait(150);
  emit('arena_assault_crosscuts');for(const angle of [-40,40,0]){slash('monster',angle,true);sound('slash',.4);await wait(75);}await wait(75);
  emit('arena_assault_return');animate(position,[{transform:`translate(${distance}px,8px)`},{transform:`translate(${distance*.4}px,${reduced?-12:-50}px)`,offset:.5},{transform:'translate(0,0)'}],250);
  for(const result of step.results||[])await resolve(result);gladiatorApply(owner,step.hpSnapshot);emit('arena_assault_final_result');await wait(250);
}
async function playGladiatorMutualDestruction(step,s){
  const {owner,animate,wait,emit,fx,burst,slash,sound,reduced,resolve}=s;
  const id=owner.playerId||step.sourceId,position=owner.positions.get(id),card=owner.cards.get(id),motion=card.querySelector('.gladiator-motion');
  const target=owner.positions.get('monster'),boss=owner.cards.get('monster').querySelector('.gladiator-motion');
  for(const result of (step.results||[]).filter(r=>r.targetId===id))await resolve(result);
  emit('gladiator_self_zero');sound('heartbeat',.3);motion.style.filter='sepia(1) saturate(2) brightness(.55)';
  animate(motion,[{transform:'translateX(0)'},{transform:`translateX(${reduced?0:2}px)`,offset:.25},{transform:`translateX(${reduced?0:-2}px)`,offset:.5},{transform:`translateX(${reduced?0:2}px)`,offset:.75},{transform:'translateX(0)'}],250);await wait(250);
  sound('scrape',.3);emit('gladiator_last_charge');
  animate(position,[{transform:'translate(0,0)'},{transform:`translateX(${reduced?-12:-40}px)`}],200);animate(motion,[{transform:'rotate(0) scale(1)'},{transform:'rotate(-10deg) scale(1.05)'}],200);burst(450,530,'sand',8);await wait(200);
  const distance=parseFloat(target.style.left)-parseFloat(position.style.left);
  for(let i=0;i<(reduced?1:3);i++){
    const ghost=fx('gladiator-charge-ghost',parseFloat(position.style.left)-i*35,435,getClassPortraitHtml('gladiator','presentation-support-image'));
    animate(ghost,[{opacity:.5,transform:'translateX(0)'},{opacity:0,transform:`translateX(${distance-40-i*25}px)`}],200);
  }
  sound('rush');emit('gladiator_pierce');animate(position,[{transform:`translateX(${reduced?-12:-40}px)`},{transform:`translateX(${distance}px)`}],200);await wait(200);
  emit('gladiator_pierce_impact');sound('chop');slash('monster',0,true);
  const flash=fx('gladiator-impact-flash',958,435);animate(flash,[{opacity:.9},{opacity:0}],60);
  animate(boss,[{transform:'translateX(0)'},{transform:`translateX(${reduced?12:45}px) scale(.9)`,offset:.25},{transform:'translateX(0)'}],280);await wait(30);
  emit('gladiator_overshoot');sound('wall');burst(1240,545,'sand',18);burst(1240,545,'bronze',7);
  animate(position,[{transform:`translateX(${distance}px)`},{transform:'translate(1700px,250px)'}],350);animate(motion,[{transform:'rotate(35deg)'},{transform:'rotate(60deg)'}],350);
  for(const result of (step.results||[]).filter(r=>r.targetId!==id))await resolve(result);
  owner.cards.get('monster').classList.add('gladiator-final-damage');gladiatorApply(owner,step.hpSnapshot);await wait(350);sound('fall',.2);
  if(step.gladiatorPresentation?.actorDied===true){owner.departed.add(id);position.hidden=true;emit('gladiator_left_blank');}await wait(180);
}
async function playGladiatorArenaExit(step,s){
  const {owner,wait,animate,emit,fx,burst,sound,reduced,audioScope}=s,meta=step.arenaPresentation,t=PRESENTATION_CONFIG.gladiator;
  const card=owner.cards.get(owner.playerId),rage=card.querySelector('.gladiator-rage-ui');emit('arena_rage_consume');
  if(meta?.actorSurvived===false){owner.departed.add(owner.playerId);owner.positions.get(owner.playerId).hidden=true;}
  if(meta?.consumedRage>0&&!owner.departed.has(owner.playerId)){
    const n=fx('gladiator-rage-collapse',482,435);animate(n,[{opacity:.85,transform:'translate(-50%,-50%) scaleX(1)'},{opacity:0,transform:'translate(-50%,-50%) scaleX(.08)'}],t.rageConsume);burst(482,435,'bronze',Math.min(12,meta.consumedRage+2));
  }
  animate(rage,[{opacity:1},{opacity:.1,offset:.8},{opacity:1}],t.rageConsume);await wait(t.rageConsume);gladiatorApply(owner,meta?.rageConsumedSnapshot);emit('arena_rage_zero');
  if(meta?.triumphApplied===true){
    emit('arena_triumph_transfer');audioScope.play('gladiator_triumph',{signal:null,preserveAcrossViews:true,noHold:true});
    const momentum=fx('gladiator-triumph-streak',482,435);momentum.style.setProperty('--gladiator-triumph-strength',String(Math.min(1,Math.max(.35,(meta.triumphBonus||0)/150))));
    animate(momentum,[{opacity:0,transform:'translate(-50%,-50%) scaleX(.15)'},{opacity:1,transform:'translate(-50%,-50%) scaleX(1)',offset:.35},{opacity:0,transform:`translate(${reduced?-60:-300}px,-50%) scaleX(1.4)`}],t.triumphTransfer);
    animate(card.querySelector('.gladiator-motion'),[{transform:'scale(1)'},{transform:'translateY(-4px) scale(1.04)',offset:.4},{transform:'scale(1)'}],t.triumphTransfer);
    for(const [i,ally] of (meta.triumphSnapshot?.players||[]).entries()){
      if(ally.id===owner.playerId||ally.hp<=0)continue;gladiatorCard(owner,ally.id,ally,step,260+(i%5)*210,660);
      const p=owner.positions.get(ally.id);p.classList.add('gladiator-triumph-ally');animate(p,[{opacity:0},{opacity:1,offset:.4},{opacity:1}],t.triumphTransfer);
      animate(owner.cards.get(ally.id).querySelector('.gladiator-motion'),[{transform:'scale(1)'},{transform:'scale(1.04)',offset:.45},{transform:'scale(1)'}],t.triumphTransfer);
      resultFloat(owner.cards.get(ally.id),`【凱旋】 DMG +${Math.round(meta.triumphBonus)}% · ${meta.triumphDuration} Turns`,'is-status');
    }
    burst(360,530,'sand',8);await wait(t.triumphTransfer);gladiatorApply(owner,meta.triumphSnapshot);
  }
  gladiatorApply(owner,meta?.hpRestoredSnapshot||step.hpSnapshot);emit('arena_hp_restore');
  for(const [i,ally] of (step.hpSnapshot?.players||[]).entries()){if(ally.id!==owner.playerId&&ally.hp>0)gladiatorCard(owner,ally.id,ally,step,260+(i%5)*210,660);}
  emit('arena_team_return');animate(owner.spotlight,[{opacity:.95},{opacity:0}],100);
  animate(owner.backWall,[{transform:'translateY(0)'},{transform:'translateY(160px)'}],300);
  animate(owner.root,[{opacity:1},{opacity:0}],t.arenaExit);sound('rumble',.2);await wait(t.arenaExit);emit('arena_environment_exit');
}
