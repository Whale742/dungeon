import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=document-user-activation-required']});
const report={assets:[],scenes:[],warning:[],controls:{},failures:[],errors:[],warnings:[]};
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
 await page.goto('http://localhost:3011/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 await page.evaluate(()=>sfxManager.preload());await page.locator('#btnTestSound').click();
 await page.waitForFunction(()=>sfxManager.ctx.state==='running');
 report.assets=await page.evaluate(()=>Object.entries(SFX_ASSETS).map(([key,p])=>({key,src:p.src,decoded:Boolean(sfxManager.assets.get(p.src)?.buffer),duration:sfxManager.assets.get(p.src)?.buffer?.duration})));
 assert(report.assets.every(a=>a.decoded));
 await page.evaluate(()=>{
 window.audioTrace=[];const original=sfxManager.play.bind(sfxManager);
 sfxManager.play=(key,options={})=>{const e={key,time:performance.now(),options:{volume:options.volume,offset:options.offset,synthOnly:options.synthOnly},scene:window.audioScene};window.audioTrace.push(e);return original(key,options).then(v=>{if(v){e.asset=v.key;e.rate=v.source.playbackRate.value;}return v;});};
 labState.speed=8;
 });
 const scenes=['p71_sword','p6_assassin_crit','p6_archer_hit','p6_archer_miss','p6_arrow_rain','p6_mage_blast','p6_mage_drain','p6_shield_apply','p6_assassin_stealth','p61_follow_normal','p6_bard_heal','p6_bard_offkey','p6_bard_buff','p6_bard_revive','p6_alchemy_flask_acid','p6_alchemy_success','p6_alchemy_failure','p6_wolf_transform','p6_treant_transform','p71_treant_basic','p71_werewolf_basic','p6_summon_wolf','p6_summon_treant','p71_minions_3','p6_minion_intercept','p71_a_reload_0_pierce','p71_a_frenzy_reload_0_pierce','p6_status_tick'];
 for(const scene of scenes){
  const trace=await page.evaluate(async scene=>{window.audioTrace=[];window.audioScene=scene;await playScene(scene);return window.audioTrace;},scene);
  report.scenes.push({scene,trace});assert(trace.filter(e=>e.asset).every(e=>e.rate===1));
  const keys=trace.map(e=>e.asset||e.key);
  if(scene==='p71_sword')assert.deepEqual(keys.filter(k=>k==='fight'||k==='warrior_basic'),['fight','warrior_basic']);
  if(scene==='p6_archer_miss'){assert(keys.includes('arrow_release'));assert(!keys.includes('arrow_impact'));}
  if(scene==='p6_assassin_crit'){const slashes=trace.filter(e=>e.key==='warrior_skill1');assert.equal(slashes.length,2);assert(slashes[1].time>slashes[0].time);}
  if(scene.includes('reload')){assert(!keys.includes('arrow_release'));assert(keys.includes('reload_insert'));}
  if(scene==='p6_alchemy_failure'){assert(keys.includes('alchemy_failure'));assert(keys.indexOf('healing_result')>keys.indexOf('alchemy_failure'));}
  if(scene==='p6_alchemy_flask_acid'){assert(keys.includes('alchemy_skill1'));assert(keys.indexOf('bottle_throw')<keys.indexOf('bottle_impact'));assert(keys.indexOf('bottle_impact')<keys.indexOf('alchemy_skill1'));}
  if(scene==='p6_status_tick')assert(!keys.includes('fight'));
  console.log('PASS',scene);
 }
 await page.evaluate(()=>{resetLab();labState.speed=1;window.audioTrace=[];});
 report.warning=await page.evaluate(async()=>{const beats=[];await playBossIntro({name:'測試首領',avatar:'/BOSS/Ancient Guardian Golem.webp'},{onTiming:(beat,time)=>beats.push({beat,time,font:document.querySelector('.boss-warning-copy strong')?getComputedStyle(document.querySelector('.boss-warning-copy strong')).fontFamily:null})});return beats;});
 const start=report.warning.find(b=>b.beat==='warning_audio_start').time,entry=report.warning.find(b=>b.beat==='warning_entry');
 assert(Math.abs(entry.time-start-3000)<160);assert(entry.font.includes('Silkscreen'));
 const audio=await page.evaluate(()=>window.audioTrace);report.warningAudio=audio;
 assert.equal(audio.filter(e=>e.key==='boss_warning').length,1);assert.equal(audio.filter(e=>e.key==='boss_entrance').length,1);
 const boss=report.warning.find(b=>b.beat==='boss_art_entry');assert(Math.abs(audio.find(e=>e.key==='boss_entrance').time-boss.time)<30);
 report.controls=await page.evaluate(async()=>{
  sfxManager.stopAll();const controller=new AbortController();const v=await sfxManager.play('logo_intro',{signal:controller.signal});
  sfxManager.volume=.25;const assetVolume=sfxManager.masterGain.gain.value;sfxManager.play('click');
  sfxManager.soundEnabled=false;const muted=sfxManager.masterGain.gain.value;
  sfxManager.soundEnabled=true;sfxManager.volume=1;controller.abort();const aborted=!sfxManager.activeVoices.has(v);
  sfxManager.stopAll();const stale=sfxManager.play('boss_warning');sfxManager.stopAll();await stale;const pendingStopped=sfxManager.activeVoices.size===0;
  return {assetVolume,muted,aborted,pendingStopped};
 });
 assert.equal(report.controls.assetVolume,.25);assert.equal(report.controls.muted,0);assert(report.controls.aborted&&report.controls.pendingStopped);
 // Expected failures: separate fresh managers leave the production cache intact.
 await page.route('**/sound/test-missing.mp3',r=>r.fulfill({status:404,body:''}));
 await page.route('**/sound/test-invalid.mp3',r=>r.fulfill({status:200,body:'invalid MP3',contentType:'audio/mpeg'}));
 for(const file of ['test-missing.mp3','test-invalid.mp3']){
  const result=await page.evaluate(async file=>{class FailedAssetManager extends SFXManager{loadAsset(profile){return super.loadAsset({...profile,src:'/sound/'+file});}}const manager=new FailedAssetManager();manager.init();let fallback=null;manager.playSynth=(key)=>{fallback=key;};await manager.play('warrior_basic');await manager.ctx.close();return fallback;},file);
  assert.equal(result,'warrior_xing');report.failures.push({file,fallback:result});
 }
 // Browser may report the intentionally requested 404; no unexpected console errors.
 report.expected404=report.errors.filter(e=>e.includes('404'));report.errors=report.errors.filter(e=>!e.includes('404'));
 assert.deepEqual(report.errors,[]);
 console.log('PASS decoded registry, 28 shared combat scenes, real-time warning sync, mute/volume/abort, controlled fallbacks');
} finally {fs.mkdirSync('artifacts/audio',{recursive:true});fs.writeFileSync('artifacts/audio/browser-report.json',JSON.stringify(report,null,2));await browser.close();}
