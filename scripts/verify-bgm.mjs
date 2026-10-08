import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')console.log(m.text());});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3018/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 const report=await page.evaluate(async()=>{
  sfxManager.soundEnabled=true;sfxManager.init();await sfxManager.ctx.resume();bgmManager.reset();
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),sounds=[],original=sfxManager.play.bind(sfxManager);
  sfxManager.play=(key,opts)=>original(key,opts).then(voice=>{sounds.push({key,at:performance.now(),voice});return voice;});
  await bgmManager.resumeNormal();await pause(400);
  const normal=bgmManager.voices.normal,beats=[];
  await playBossIntro({name:'BGM TEST',avatar:'/BOSS/Ancient Guardian Golem.webp'},{speed:3,onTiming:(name,time)=>beats.push({name,time})});
  const warning=beats.find(b=>b.name==='warning_audio_start'),entrance=sounds.find(x=>x.key==='boss_entrance'),saved=bgmManager.normalOffset;
  const entranceStillPlaying=sfxManager.activeVoices.has(entrance.voice);
  sfxManager.stopAll({preserveTails:true});
  const entranceSurvivesView=sfxManager.activeVoices.has(entrance.voice);
  while(!bgmManager.voices.boss)await pause(20);
  const boss=bgmManager.voices.boss,bossDelayMs=performance.now()-entrance.at;
  sfxManager.soundEnabled=false;const muted=sfxManager.masterGain.gain.value===0;
  sfxManager.soundEnabled=true;
  const death=bgmManager.bossDefeated();await pause(1000);const halfwayRate=boss.source.playbackRate.value;
  await death;const stopped=bgmManager.voices.boss===null;
  await bgmManager.resumeNormal();
  if(!bgmManager.voices.normal)throw Error('Normal unavailable: '+JSON.stringify({mode:bgmManager.mode,epoch:bgmManager.epoch,assetFailed:sfxManager.assets.get('/sound/bgm-normal.mp3')?.failed}));
  const resumed=bgmManager.voices.normal,fadeStart=resumed.gain.gain.value,fadeElapsed=sfxManager.ctx.currentTime-resumed.start;
  await pause(1300);const fadeEnd=resumed.gain.gain.value;
  const counterC=new AbortController();
  await playExpandedCombatPresentation(structuredClone(SAMURAI_LAB_SCENES.samurai_parry1.steps[1]),{signal:counterC.signal});
  const counterTail=[...sfxManager.activeVoices].some(v=>v.key==='samurai-skill');counterC.abort();
  bgmManager.reset();sfxManager.stopAll();sfxManager.play=original;
  return {normalDuration:normal.buffer.duration,bossDuration:boss.buffer.duration,warningAfterFade:normal.gain.gain.value===0,warningTime:warning.time,
   saved,resumedOffset:resumed.offset,entranceDuration:entrance.voice.source.buffer.duration,entranceStillPlaying,entranceSurvivesView,bossDelayMs,muted,halfwayRate,stopped,fadeStart,fadeElapsed,fadeEnd,counterTail,
   victoryVolume:SFX_ASSETS.victory.volume,walk:SFX_ASSETS.walk.src};
 });
 console.log(JSON.stringify({report,errors},null,2));
 assert(report.saved>.4);assert(Math.abs(report.saved-report.resumedOffset)<.001);
 assert(report.warningAfterFade);assert(report.entranceStillPlaying);assert(report.entranceSurvivesView);
 assert(report.bossDelayMs>=4990&&report.bossDelayMs<5120);
 assert(report.halfwayRate>.3&&report.halfwayRate<.7);assert(report.stopped);
 assert(report.fadeStart<=.22*Math.min(1,report.fadeElapsed/1.2)+.02);assert(Math.abs(report.fadeEnd-.22)<.001);assert(report.muted);assert(report.counterTail);
 assert.equal(report.victoryVolume,.16);assert.equal(report.walk,'/sound/walk.mp3');assert.deepEqual(errors,[]);
 const game=await browser.newPage();const gameErrors=[];game.on('pageerror',e=>gameErrors.push(e.message));
 await game.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await game.goto('http://localhost:3018');await game.waitForFunction(()=>typeof bgmManager!=='undefined'&&typeof switchView==='function');
 const defeat=await game.evaluate(async()=>{
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),sounds=[],originalPlay=sfxManager.play.bind(sfxManager);sfxManager.play=(key,options)=>{sounds.push(key);return originalPlay(key,options);};sfxManager.soundEnabled=true;sfxManager.init();await sfxManager.ctx.resume();bgmManager.reset();
  bgmManager.mode='boss';bgmManager.epoch++;const voice=await bgmManager.startTrack('boss');
  roomState={state:'GAME_OVER',gameOverReason:'wipe',floor:3,players:[],leaderId:'leader',code:'BGM-TEST'};audioView='battle';
  switchView('end');const preserved=bgmManager.voices.boss===voice;renderGameOver(false);await pause(1000);
  const bossResult={preserved,mode:bgmManager.mode,rate:voice.source.playbackRate.value,stopped:!!voice.source.stopped};bgmManager.reset();
  await bgmManager.resumeNormal();const normal=bgmManager.voices.normal;roomState.gameOverReason='abandon';audioView='route';
  switchView('end');const normalPreserved=bgmManager.voices.normal===normal;renderGameOver(false);await pause(1000);
  const normalResult={preserved:normalPreserved,mode:bgmManager.mode,rate:normal.source.playbackRate.value,stopped:!!normal.source.stopped};bgmManager.reset();sfxManager.play=originalPlay;return {boss:bossResult,normal:normalResult,sounds};
 });
 for(const result of [defeat.boss,defeat.normal]){assert(result.preserved);assert.equal(result.mode,'dying');assert(result.rate>.3&&result.rate<.7);assert.equal(result.stopped,false);}assert(!defeat.sounds.includes('gameover'));assert.deepEqual(gameErrors,[]);
 console.log(JSON.stringify({defeatTransition:defeat},null,2));
 }finally{await browser.close();}
