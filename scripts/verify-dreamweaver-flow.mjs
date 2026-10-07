import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),report={errors:[],casts:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3011/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 await page.evaluate(async()=>{await sfxManager.preload();await enterCombatStage({speed:10});sfxManager.init();});
 for(const id of ['p8_butterfly_heal','p8_butterfly_true','p8_false_deep']){
  const result=await page.evaluate(async id=>{
   sfxManager.stopAll();const steps=PHASE6_LAB_SCENES[id].steps.filter(s=>s.type==='player_action');const controller=new AbortController(),cues=[],beats=[];let hidden,contact;
   const context={mode:'lab',speed:2,signal:controller.signal,onTiming:(name,detail)=>{if(name==='dreamweaver_sfx')cues.push(detail.key);if(name==='outcome_reveal'&&!detail.step.actionId.endsWith('_result')){hidden=document.querySelector('.skill-reveal')?.hidden;contact=performance.now();}beats.push({name,id:detail?.step?.actionId,time:performance.now()});}};
   const start=performance.now();await playExpandedCombatPresentation(steps[0],context);const castDuration=performance.now()-start;
   const continuing=sfxManager.activeVoices.size>0&&[...sfxManager.activeVoices].some(v=>v.key==='dreamwaver-dream');
   const resultStart=performance.now();await playExpandedCombatPresentation(steps[1],{...context});
   const entry=beats.find(b=>b.name==='cast_entry'&&b.id.endsWith('_result'));
   const out={id,hidden,castDuration,contactToEnd:resultStart-contact,resultGap:entry.time-resultStart,continuing,selected:steps[1].outcome.type,cues};
   controller.abort();await Promise.resolve();out.remainingVoices=sfxManager.activeVoices.size;return out;
  },id);
  assert(result.hidden);assert(result.castDuration<4000);assert(result.contactToEnd<300);assert(result.resultGap<400);assert(result.continuing);assert.equal(result.remainingVoices,0);
  if(id==='p8_butterfly_heal'){assert.equal(result.selected,'dream_heal');assert.deepEqual(result.cues,['dreamwaver-dream','dreamwaver-posi']);}
  if(id==='p8_butterfly_true'){assert.equal(result.selected,'nightmare');assert.deepEqual(result.cues,['dreamwaver-dream','dreamwaver-nage']);}
  if(id==='p8_false_deep')assert.deepEqual(result.cues,['dreamwaver-dream','dreamwaver-nage']);report.casts.push(result);
 }
 report.hits=await page.evaluate(async()=>{
  sfxManager.stopAll();const controller=new AbortController();const step=PHASE6_LAB_SCENES.p8_butterfly_heal.steps.find(s=>s.type==='boss_action');const result=step.results.find(r=>r.outcome?.type==='dream_heal');
  const card=createResultCard(result);getOrCreateCombatStage().appendChild(card);const ctx={speed:10,signal:controller.signal,audioScope:createSfxPresentationScope({signal:controller.signal,speed:10})};
  const start=performance.now();const first=revealDreamOutcomeButterfly(card,'dream_heal',ctx),second=revealDreamOutcomeButterfly(card,'dream_heal',ctx);await Promise.resolve();await Promise.resolve();
  const syncMs=performance.now()-start,returnedImmediately=first===undefined&&second===undefined,voices=[...sfxManager.activeVoices].filter(v=>v.key==='dreamwaver-posi').length,layers=card.querySelectorAll('.dw-fx-layer').length;
  const hitStart=performance.now();await presentCombatResult(result,card,ctx);const hitMs=performance.now()-hitStart;
  controller.abort();card.remove();return {syncMs,returnedImmediately,voices,layers,hitMs,remaining:sfxManager.activeVoices.size};
 });assert(report.hits.returnedImmediately);assert(report.hits.voices>=2);assert.equal(report.hits.layers,2);assert(report.hits.hitMs<500);assert.equal(report.hits.remaining,0);assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}finally{fs.mkdirSync('artifacts/dreamweaver-transplant',{recursive:true});fs.writeFileSync('artifacts/dreamweaver-transplant/flow-report.json',JSON.stringify(report,null,2));await browser.close();}
