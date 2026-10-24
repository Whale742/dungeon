/* The iframe owns only local display snapshots. It never creates a game socket. */
var roomState = {players:[],enemies:[],battleRound:1}, classesData = {}, myId = null;
var currentSelectedEnemyId = null, activeViewingMinionOwnerId = null;
var currentPendingAction = null;
var CLASS_EXCLUSIVE_SVGS = {};
var elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(n=>[n.id,n]));
const stageView=document.getElementById('viewBattle');
// Reserve the actual party row plus production enemy labels. This adapts the
// viewport spacing at short desktop heights without shrinking either portrait.
const partyRow=stageView.querySelector('.teammates-card');
const stageSpace=new ResizeObserver(()=>{
  const clearance=stageView.clientHeight-partyRow.offsetTop+64;
  stageView.style.setProperty('--lab-party-clearance',clearance+'px');
});
stageSpace.observe(stageView);stageSpace.observe(partyRow);
let displayConfig=null, runController=null, runTask=Promise.resolve(), generation=0;
let initialized=false, latestRequest=0;
const report=(type,payload={})=>parent.postMessage({source:'combat-fx-stage',type,...payload},location.origin);
const socket={emit(event,data){if(event==='battle:select_target')report('target',{id:data.targetEnemyId});}};
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function getMyPlayer(){return roomState.players.find(p=>p.id===myId)||roomState.players[0];}
function renderBattle(){renderBattleEnemiesStage(roomState.enemies,roomState.currentMonster,getMyPlayer());}
function showMinionDetailModal(player){const dialog=document.getElementById('labMinions');dialog.querySelector('div').innerHTML=(player.minions||[]).map(m=>`<p>${escapeHtml(m.name)} · HP ${m.hp}/${m.maxHp}</p>`).join('');dialog.showModal();}
function hideMinionDetailModal(){document.getElementById('labMinions').close();}
function renderInitial(config){
  stageView.style.opacity='';
  displayConfig=structuredClone(config);classesData=config.classes;
  myId=config.party.some(p=>p.id===config.actorId)?config.actorId:config.partyTargetId;
  currentSelectedEnemyId=config.primaryId;
  currentPendingAction=config.previewAction||null;
  roomState={players:structuredClone(config.party),enemies:structuredClone(config.enemies),battleRound:config.round||1,arena:null};
  roomState.currentMonster=roomState.enemies.find(e=>e.instanceId===config.primaryId)||roomState.enemies[0];
  roomState.monster=roomState.currentMonster;
  renderBattle();renderTeammatesGrid(getMyPlayer());
  syncEnemyArenaVisual(null);
  const visibleId=config.party.some(p=>p.id===config.actorId)?config.actorId:config.partyTargetId;
  [...document.querySelectorAll('.teammate-card')].find(n=>n.dataset.playerId===visibleId)?.scrollIntoView({block:'nearest',inline:'nearest'});
  BattleHud.reset('ENEMY_ACTIONS');stageView.dataset.labIdle='true';
  document.getElementById('battleEncounterTitle').textContent=roomState.enemies.length>1?'ENCOUNTER / 敵方編隊':'ENCOUNTER / '+roomState.currentMonster.name;
  document.getElementById('battleRoundNum').textContent=roomState.battleRound;
  document.body.style.setProperty('--lab-backdrop',`url('/assets/environments/backgrounds/background.webp')`);
}
function applyHpSnapshot(snapshot){
  const minionsChanged=(snapshot.players||[]).some(p=>'minions'in p&&JSON.stringify(p.minions)!==JSON.stringify(roomState.players.find(x=>x.id===p.id)?.minions));
  // Mutate local display objects through the production updater so tooltip
  // closures, shields, resource text and portraits share the same snapshot.
  updateBattleHudFromSnapshot(snapshot);
  if('arena'in snapshot)roomState.arena=snapshot.arena;
  roomState.currentMonster=roomState.enemies.find(e=>e.instanceId===displayConfig.primaryId)||roomState.enemies[0];
  roomState.monster=roomState.currentMonster;
  renderBattle();
  if(minionsChanged)renderTeammatesGrid(getMyPlayer());
  syncEnemyArenaVisual(roomState.arena);
}
window.applyHpSnapshot=applyHpSnapshot;
async function stop(){
  ++generation;runController?.abort();runController=null;
  sfxManager.stopAll();bgmManager.reset();
  await runTask.catch(()=>{});
  clearGladiatorPresentationState();clearSageSamplingIndicators();
  hideEnemyTooltip();hideMinionDetailModal();
  for(const animation of document.getAnimations())animation.cancel();
  document.querySelectorAll('.battlefield-player-effects,.enemy-effect-overlay,.boss-encounter-stage,.round-start-overlay,#presentationCombatStage').forEach(n=>n.remove());
  document.querySelectorAll('.is-skill-recipient,.is-skill-actor').forEach(n=>n.classList.remove('is-skill-recipient','is-skill-actor'));
  appliedBattleResults.clear();
  stageView.dataset.labIdle='true';
  stageView.style.opacity='';
}
async function preloadStage(signal){
  await Promise.all([...document.querySelectorAll('#battleEnemiesStage img,#battleTeammatesGrid img')].map(async image=>{
    try{await image.decode();}catch{
      if(signal.aborted)return;
      try{const loaded=await assetRegistry.preloadImage(image.dataset.studioOriginal||image.getAttribute('src'));image.src=loaded.src;await image.decode();}
      catch{throw new Error('無法載入角色或敵人素材：'+(image.alt||image.getAttribute('src')));}
    }
  }));
}
async function play(config,fixture,entry,options,runId){
  await stop();
  if(runId!==latestRequest)return;
  const current=++generation,controller=new AbortController();runController=controller;
  const context={mode:'lab',signal:controller.signal,controller,speed:options.speed||1,reducedMotion:options.reducedMotion,
    onTiming(beat){if(current===generation)report('beat',{runId,beat});}};
  runTask=(async()=>{
    const {preparePlayback}=await import('./combat-fx-model.js');
    const playback=options.phase==='action'?preparePlayback(config,fixture,entry):{steps:[]};
    renderInitial(config);appliedBattleResults.clear();
    sfxManager.soundEnabled=options.sound;
    await preloadStage(context.signal);
    if(context.signal.aborted)return;
    if(options.phase==='opening'){
      stageView.style.opacity='0';
      await playBattlePhaseOpening(roomState.currentMonster,config.round||1,{...context,enemies:roomState.enemies,encounter:true,revealHud(){stageView.style.opacity='';stageView.dataset.labIdle='true';}});
    }
    else if(options.phase==='round'){await playRoundStartBanner(config.round||1,context);}
    else{
      let steps=playback.steps;
      if(options.step!=='all')steps=steps.slice(Number(options.step),Number(options.step)+1);
      stageView.dataset.labIdle='false';BattleHud.begin(steps);
      for(const [index,step]of steps.entries()){
        if(context.signal.aborted)return;
        applyHpSnapshot(step.hpSnapshotBefore);
        BattleHud.start(step);BattleHud.setPhase(BattleHud.phaseFor(step));
        if(entry.role)await BattleHud.announce(step,context);
        if(step.actionId==='a_trap')await playBattlefieldTick(step,context);
        else if(['boss_action','enemy_mechanic'].includes(step.type))await playEnemyMechanicPresentation(step,context);
        else await playBattlefieldPlayerPresentation(step,{...context,battlefield:true});
        if(context.signal.aborted)return;
        if(step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);
        BattleHud.finish(step,context);report('progress',{runId,value:index+1,total:steps.length});
      }
    }
    if(current===generation){stageView.dataset.labIdle='true';BattleHud.setPhase('ENEMY_ACTIONS');report('finished',{runId});}
  })();
  try{await runTask;}catch(error){if(current===generation&&error.name!=='AbortError'){await stop();report('error',{runId,message:error.message});}}
}
window.addEventListener('message',async event=>{
  if(event.source!==parent||event.origin!==location.origin||event.data?.source!=='combat-fx-lab')return;
  const data=event.data;
  try{
    if(data.type==='hello'&&initialized){report('ready');return;}
    if(data.runId<latestRequest)return;
    latestRequest=data.runId;
    if(data.type==='configure'){await stop();if(data.runId!==latestRequest)return;renderInitial(data.config);report('configured',{runId:data.runId});}
    if(data.type==='play')await play(data.config,data.fixture,data.entry,data.options,data.runId);
  }catch(error){report('error',{runId:data.runId,message:error.message});}
});
window.addEventListener('error',event=>report('error',{message:event.message||'舞台程式或素材載入失敗'}));
window.addEventListener('unhandledrejection',event=>{if(event.reason?.name!=='AbortError')report('error',{message:event.reason?.message||String(event.reason)});});
document.addEventListener('DOMContentLoaded',async()=>{
  try{await StudioContent.load();StudioContent.applyPreview();initialized=true;report('ready');}
  catch(error){report('error',{message:'舞台內容載入失敗：'+error.message});}
});
