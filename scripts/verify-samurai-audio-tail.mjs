import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3018/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 const result=await page.evaluate(async()=>{
  sfxManager.soundEnabled=true;sfxManager.init();await sfxManager.ctx.resume();await enterCombatStage({speed:20});
  const step=()=>structuredClone(SAMURAI_LAB_SCENES.samurai_tsubame.steps[0]);
  const c=new AbortController();await playExpandedCombatPresentation(step(),{signal:c.signal});
  const tail=[...sfxManager.activeVoices].map(v=>v.key),durations=[...sfxManager.activeVoices].map(v=>({key:v.key,duration:v.source?.buffer?.duration})),remaining=document.querySelectorAll('.samurai-fx-owner').length;
  const deadline=performance.now()+32000;
  while(sfxManager.activeVoices.size&&performance.now()<deadline)await new Promise(r=>setTimeout(r,100));
  const naturalEnd=sfxManager.activeVoices.size;
  const cancelled=new AbortController();await playExpandedCombatPresentation(step(),{signal:cancelled.signal,speed:4});
  const beforeCancel=sfxManager.activeVoices.size;cancelled.abort();const afterCancel=sfxManager.activeVoices.size;
  const interrupted=new AbortController();let complete=false;
  await playExpandedCombatPresentation(step(),{signal:interrupted.signal,onSamuraiFrame:({time})=>{if(time>300)interrupted.abort();},onTiming:name=>{if(name==='action_complete')complete=true;}}).catch(e=>{if(e.name!=='AbortError')throw e;});
  const afterInterrupt=sfxManager.activeVoices.size;
  return {tail,durations,remaining,naturalEnd,beforeCancel,afterCancel,afterInterrupt,complete};
 });
 assert(result.tail.includes('samurai-skill2-intro'),'intro tail continues after visual completion');
 assert.equal(result.remaining,0);assert.equal(result.naturalEnd,0);
 assert(result.beforeCancel>0);assert.equal(result.afterCancel,0);
 assert.equal(result.afterInterrupt,0);assert.equal(result.complete,false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
