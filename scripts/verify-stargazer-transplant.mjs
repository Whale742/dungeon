import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='artifacts/stargazer-transplant'; fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={errors:[],skills:[],basics:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3011/presentation-lab.html'); await page.waitForFunction(()=>window.labInitialized);
 assert.equal(await page.evaluate(()=>labState.speed),1); assert.equal(await page.locator('#labSpeedSelect').inputValue(),'1.0');
 await page.evaluate(()=>enterCombatStage({speed:10}));
 for(const [action,types] of [['observe',['star','planet','galaxy','blackhole','boundary']],['clock',['accelerate','reset','overload','nothing']]])for(const type of types){
  const id='p8_'+action+'_'+type;
  await page.evaluate(async id=>{const step=PHASE6_LAB_SCENES[id].steps.find(s=>s.actionId==='sg_observe'||s.actionId==='sg_clock');await playExpandedCombatPresentation(step,{mode:'lab',speed:10});},id);
  assert.equal(await page.locator('.skill-production-stage').count(),0); report.skills.push(id);
 }
 for(const role of ['stargazer','samurai','sage','gladiator']){
  const result=await page.evaluate(async role=>{
   const all=Object.values(PHASE6_LAB_SCENES).flatMap(s=>s.steps||[]);
   const step=structuredClone(all.find(s=>s.type==='player_action'&&s.actionId==='basic'&&s.sourceRole===role)||all.find(s=>s.type==='player_action'&&s.actionId==='basic'));
   step.sourceRole=role; step.outcome={type:'normal'};
   let common=false,unwanted=false;
   const inspect=()=>{common ||= !!document.querySelector('.presentation-combat-canvas'); unwanted ||= !!document.querySelector('.p8-presentation,.p81-motes,.skill-butterfly');};
   const observer=new MutationObserver(inspect);observer.observe(document.body,{childList:true,subtree:true});
   await playExpandedCombatPresentation(step,{mode:'lab',speed:8}); observer.disconnect();return {common,unwanted};
  },role);
  assert(result.common,role+' must use shared attack');assert(!result.unwanted,role+' must not use class backdrop/particles');report.basics.push(role);
 }
 await page.evaluate(()=>{window.starRun=(async()=>{const start=performance.now();const step=PHASE6_LAB_SCENES.p8_observe_planet.steps.find(s=>s.actionId==='sg_observe');await playExpandedCombatPresentation(step,{speed:1});return performance.now()-start;})();});
 await page.waitForTimeout(2200);
 assert.equal(await page.locator('.stargazer-prototype-fx .celestial-display-icon circle[r="40"]').count(),1);
 await page.screenshot({path:dir+'/planet-half-speed.png'});
 report.defaultDurationMs=await page.evaluate(()=>starRun);assert(report.defaultDurationMs>3500);
 await page.evaluate(()=>{window.starAbort=new AbortController();window.starRun=playExpandedCombatPresentation(PHASE6_LAB_SCENES.p8_clock_overload.steps.find(s=>s.actionId==='sg_clock'),{signal:starAbort.signal}).catch(e=>{if(e.name!=='AbortError')throw e;});});
 await page.waitForTimeout(1400);await page.screenshot({path:dir+'/orbit-original.png'});
 await page.evaluate(async()=>{starAbort.abort();await starRun;});assert.equal(await page.locator('.skill-production-stage').count(),0);
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
} finally {fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
