import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {Room}=await import('../game/Room.js');
const room=new Room('VERIFY',{id:'leader',join(){}},'Tester',{to:()=>({emit(){}})});room.selectRole('leader','warrior');room.state='IN_BATTLE';room.floor=1;room.battleRound=1;room.currentMonster={name:'TEST',avatar:'/BOSS/Ancient Guardian Golem.webp',hp:0,maxHp:100,attack:5,ultName:'TEST'};room.handleMonsterVictory();room.handleVictoryComplete('leader',room.currentVictory.presentationId);
const equippedState=structuredClone(room.getClientState());if(room.pendingDrop)room.handleEquipChoice('leader','equip');const resolvedState=structuredClone(room.getClientState());room.clearTimer();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3018');await page.waitForFunction(()=>typeof bgmManager!=='undefined'&&typeof playVictoryPresentation==='function');
 await page.click('#bgmVolumeBtn');await page.locator('#bgmVolumeSlider').fill('30');assert.equal(await page.evaluate(()=>bgmManager.volume),.3);
 await page.click('#soundToggleBtn');assert.notEqual(await page.locator('.sound-off').evaluate(n=>getComputedStyle(n).display),'none');await page.click('#soundToggleBtn');
 const report=await page.evaluate(async()=>{
  const controller=new AbortController();window.testVictoryController=controller;
  window.testVictoryContinued=false;window.testVictoryTitleAt=null;
  const now=performance.now();bgmManager.bossDefeated=()=>new Promise(()=>{}); // Music must never block the title.
  myId='leader';roomState={state:'BATTLE_VICTORY',leaderId:'leader',victoryInteractionReady:false,pendingDrop:null};
  window.testVictoryPromise=playVictoryPresentation({monsterName:'TEST',story:'',rounds:1,survivors:1,partySize:1,results:[],hpAfter:{players:[]},drop:null},{controller,speed:50,onReady:()=>{roomState.victoryInteractionReady=true;roomState.pendingDrop={ownerId:'leader'};refreshVictoryControls();},onContinue:()=>{window.testVictoryContinued=true;},onTiming:name=>{if(name==='victory_title')window.testVictoryTitleAt=performance.now()-now;}}).catch(e=>{if(e.name!=='AbortError')throw e;});
  return {defaultVolume:.5};
 });
 await page.waitForFunction(()=>document.querySelector('.presentation-victory-continue'),{timeout:30000});
 const before=await page.locator('.presentation-victory-continue').isDisabled();assert(before);
 await page.evaluate(state=>{
  roomState=state;victoryStartedId=state.currentVictory.presentationId;
  presentationManager.markPlayed('BOSS_INTRO_'+battleSceneKey(state));lastAnnouncedBattleRound=state.battleRound;
  renderApp();
 },resolvedState);
 assert.equal(await page.locator('.presentation-victory-continue').isDisabled(),false);
 await page.locator('.presentation-victory-continue').click({timeout:3000});await page.waitForFunction(()=>window.testVictoryContinued);
 const titleDelay=await page.evaluate(()=>window.testVictoryTitleAt);assert(titleDelay<500);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({volume:.3,muteSvg:true,equipmentResolved:true,continueClicked:true,titleDelay,errors}));
 await page.evaluate(()=>{bgmManager.bossDefeated=BGMManager.prototype.bossDefeated;});
 await page.evaluate(async()=>{
  sfxManager.preload=async()=>{};bgmManager.prepareBoss=async()=>{};bgmManager.bossEntrance=async()=>{};window.testFlightSeen=false;window.testRevealCount=0;
  roomState.state='IN_BATTLE';switchView('transition');
  document.getElementById('viewTransition').appendChild(Object.assign(document.createElement('p'),{textContent:'PREVIOUS SCENE'}));
  switchView('battle');
  if(!document.querySelector('.encounter-scene-snapshot')?.textContent.includes('PREVIOUS SCENE'))throw Error('Encounter scene was not retained');
  window.testSceneRetained=false;
  document.getElementById('monsterAvatar').innerHTML='<img src="/BOSS/Ancient Guardian Golem.webp" style="width:100%;height:100%">';
  const c=new AbortController();window.testIntroPromise=playBattlePhaseOpening({name:'TEST',avatar:'/BOSS/Ancient Guardian Golem.webp',resistances:{physical:25,magic:30,effect:45}},1,{encounter:true,signal:c.signal,speed:15,revealHud:()=>{window.testRevealCount++;},onTiming:name=>{if(name==='warning_audio_start')window.testSceneRetained=Boolean(document.querySelector('.encounter-scene-snapshot'));if(name==='boss_portrait_handoff')window.testResistance=document.querySelector('.boss-encounter-resistances').textContent;}}); 
  const observer=new MutationObserver(()=>{if(document.querySelector('.boss-portrait-flight'))window.testFlightSeen=true;});observer.observe(document.getElementById('presentationRoot'),{childList:true,subtree:true});window.testIntroPromise.finally(()=>observer.disconnect());
 });
 await page.evaluate(()=>window.testIntroPromise);
 assert(await page.evaluate(()=>window.testSceneRetained));assert.equal(await page.locator('.encounter-scene-snapshot').count(),0);assert(await page.evaluate(()=>window.testFlightSeen));assert.equal(await page.evaluate(()=>window.testRevealCount),1);assert((await page.evaluate(()=>window.testResistance)).includes('25%'));
 console.log('Boss portrait handoff and resistances passed');
}finally{await browser.close();}
