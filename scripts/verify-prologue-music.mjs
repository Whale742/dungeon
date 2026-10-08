import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3018');await page.waitForFunction(()=>typeof bgmManager!=='undefined');
 await page.evaluate(()=>{
  sfxManager.init();void sfxManager.ctx.resume();
  roomState={state:'PROLOGUE',currentPrologue:{paragraphs:['測試。']}};switchView('prologue');
  waitForPrologue=(ms,signal)=>waitForPresentation(ms,signal,30);
  window.prologueCheck=renderProloguePresentation();
 });
 await page.evaluate(()=>window.prologueCheck);
 await page.waitForFunction(()=>Boolean(bgmManager.voices.normal),{timeout:45000});
 const report=await page.evaluate(async()=>{
  const voice=await sfxManager.play('logo_intro',{preserveAcrossViews:true});
  const duration=voice.source.buffer.duration;
  sfxManager.stopAll({preserveTails:true});
  const survives=sfxManager.activeVoices.has(voice);
  const lines=Array.from({length:7},()=>document.createElement('div')),log=document.createElement('div');log.append(...lines);updateBattleLogFade(log);
  const blur=lines.map(n=>Number.parseFloat(n.style.getPropertyValue('--log-blur')));
  return {normalStarted:bgmManager.mode==='normal',volume:bgmManager.musicGain.gain.value,logoDuration:duration,logoFull:SFX_ASSETS.logo_intro.maxDuration===Infinity,logoSurvives:survives,blur};
 });
 assert(report.normalStarted);assert.equal(report.volume,.5);assert(report.logoFull&&report.logoSurvives);assert.deepEqual(report.blur.slice(-3),[0,0,0]);assert(report.blur[3]>0);assert(report.blur[0]>report.blur[3]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({report,errors}));
}finally{await browser.close();}
