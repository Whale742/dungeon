import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='artifacts/dreamweaver-transplant';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),report={errors:[],scenes:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3011/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 await page.evaluate(()=>{const Original=DreamweaverFX;window.qaInstances=[];window.DreamweaverFX=class extends Original{constructor(options){super(options);qaInstances.push(this);}};return enterCombatStage({speed:12});});
 await page.evaluate(async()=>{await sfxManager.preload();const play=sfxManager.play.bind(sfxManager);window.qaAudio=[];sfxManager.play=(key,options)=>{qaAudio.push(key);return play(key,options);};});
 const decoded=await page.evaluate(()=>['rope','pa','dream','posi','nage'].every(name=>sfxManager.assets.get('/sound/dreamwaver-'+name+'.mp3')?.buffer));assert(decoded);
 const normalTiming=await page.evaluate(async()=>{const cues=[];const step=PHASE6_LAB_SCENES.p8_dream_mirror.steps.find(s=>s.actionId==='basic');await playExpandedCombatPresentation(step,{mode:'lab',speed:1,onTiming:(name,detail)=>{if(name==='dreamweaver_sfx')cues.push({key:detail.key,time:detail.time});}});return cues;});assert(normalTiming.find(c=>c.key==='dreamwaver-swoosh').time<1.42);
 const ids=['p8_dream_mirror','p8_dream_dissociate','p8_dream_nightmare','p8_dream_frenzy','p8_butterfly_heal','p8_butterfly_true','p8_false_shallow','p8_false_deep','p8_false_lone','p8_false_horde'];
 for(const id of ids){
  const result=await page.evaluate(async id=>{
   qaAudio.length=0;let events=0;const cues=[];for(const step of PHASE6_LAB_SCENES[id].steps.filter(s=>s.type==='player_action'))await playExpandedCombatPresentation(step,{mode:'lab',speed:12,onTiming:(name,detail)=>{if(name==='outcome_reveal')events++;if(name==='dreamweaver_sfx')cues.push({key:detail.key,time:detail.time});}});
   return {events,audio:[...qaAudio],cues,stages:document.querySelectorAll('.skill-production-stage,.dw-fx-layer').length,instances:qaInstances.map(f=>({type:f.type,color:f.trigger?.color,destroyed:f.destroyed}))};
  },id);
  assert(result.audio.every(key=>key.startsWith('dreamwaver-')),id+' has generic audio');
  if(id==='p8_butterfly_heal')assert.equal(result.audio.filter(key=>key==='dreamwaver-posi').length,1);else assert(!result.audio.includes('dreamwaver-posi'),id+' must not play posi');
  if(id.startsWith('p8_dream_'))assert.equal(result.audio.filter(key=>key==='dreamwaver-nage').length,1);
  if(id.startsWith('p8_false_'))assert.equal(result.audio.filter(key=>key==='dreamwaver-nage').length,1);
  if(id==='p8_butterfly_true')assert.equal(result.audio.filter(key=>key==='dreamwaver-nage').length,1);
  if(id.startsWith('p8_dream_')){assert.equal(result.audio.filter(key=>key==='dreamwaver-swoosh').length,1);assert(result.cues.find(c=>c.key==='dreamwaver-swoosh').time>=.45);assert(result.cues.findIndex(c=>c.key==='dreamwaver-swoosh')<result.cues.findIndex(c=>c.key==='dreamwaver-rope'));assert.equal(result.audio.filter(key=>key==='dreamwaver-rope').length,1);assert.equal(result.audio.filter(key=>key==='dreamwaver-pa').length,1);assert(result.cues.find(c=>c.key==='dreamwaver-rope').time>=2.4);assert(result.cues.find(c=>c.key==='dreamwaver-pa').time>=2.94);}
  else {assert.equal(result.audio.filter(key=>key==='dreamwaver-dream').length,1);assert.equal(result.cues.find(c=>c.key==='dreamwaver-dream').time,0);}
  assert(result.events>0);assert.equal(result.stages,0);assert(result.instances.every(f=>f.destroyed));report.scenes.push(id);
 }
 await page.evaluate(()=>{const step=PHASE6_LAB_SCENES.p8_false_deep.steps.find(s=>s.actionId==='dw_false_dream');window.qaAbort=new AbortController();window.qaRun=playExpandedCombatPresentation(step,{mode:'lab',speed:1,signal:qaAbort.signal});});
 await page.waitForTimeout(2900);
 assert.equal(await page.locator('.dw-fx-layer').count(),2);assert.equal(await page.locator('.skill-butterfly,.skill-dream-threads').count(),0);
 await page.screenshot({path:dir+'/original-butterfly-sigil.png'});
 await page.evaluate(async()=>{qaAbort.abort();await qaRun;});assert.equal(await page.locator('.dw-fx-layer,.skill-production-stage').count(),0);
 for(const id of ['p8_butterfly_heal','p8_butterfly_true'])await page.evaluate(async id=>{for(const step of PHASE6_LAB_SCENES[id].steps.filter(s=>s.type==='boss_action'))await playExpandedCombatPresentation(step,{mode:'lab',speed:12});},id);
 await page.waitForTimeout(1300);
 const cleanup=await page.evaluate(()=>({destroyed:qaInstances.every(f=>f.destroyed),layers:document.querySelectorAll('.dw-fx-layer').length}));assert(cleanup.destroyed);assert.equal(cleanup.layers,0);
 await page.goto('http://localhost:3011/');await page.waitForFunction(()=>typeof DreamweaverFX==='function'&&typeof playDreamweaverPresentation==='function');
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
