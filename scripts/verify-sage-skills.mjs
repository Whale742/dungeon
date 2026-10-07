import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='artifacts/sage-skills';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={errors:[],cases:[],viewports:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3011/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 await page.evaluate(()=>enterCombatStage({speed:10}));
 for(const id of ['sage_basic_hypothesis','sage_basic_solve','sage_sge_deduce_hypothesis','sage_sge_deduce_solve','sage_sge_induce_hypothesis','sage_sge_induce_solve','sage_sampling_capture','sage_sampling_multi','sage_full_cycle_success','sage_full_cycle_confusion']){
  const result=await page.evaluate(async id=>{
   const scene=PHASE6_LAB_SCENES[id],beats=[],times=[],audio=[],hp=[];
   const controller=new AbortController();let contact=false,early=false,overlap=false;
   const play=sfxManager.play.bind(sfxManager);sfxManager.play=(k,o)=>{audio.push(k);return play(k,o);};
   const apply=window.applyHpSnapshot;window.applyHpSnapshot=s=>{hp.push(s);apply(s);};
   renderSageLabHud(scene.steps[0].hpSnapshotBefore.players);
   try{for(const step of scene.steps){contact=false;
    if(step.type==='status_cleanup'){applyHpSnapshot(step.hpSnapshot);continue;}
    await playExpandedCombatPresentation(step,{mode:'lab',speed:id==='sage_basic_hypothesis'?1:10,signal:controller.signal,onTiming:(name,d)=>{
     beats.push(name);times.push({name,t:performance.now(),id:step.actionId});
     if(name==='sage_projectile_contact')contact=true;
     if(['impact','damage_float'].includes(name)&&step.actionId!=='sge_equation'&&step.sourceRole==='sage'&&!contact)early=true;
     if(document.querySelectorAll('.skill-production-stage').length>1)overlap=true;
    }});
   }}finally{sfxManager.play=play;window.applyHpSnapshot=apply;}
   return {id,beats,times,audio,early,overlap,roots:document.querySelectorAll('.skill-production-stage').length,sampling:document.querySelectorAll('.sage-sampling-indicator').length};
  },id);
  assert.equal(result.early,false,id);assert.equal(result.overlap,false,id);assert.equal(result.roots,0,id);
  if(id==='sage_basic_hypothesis'){
   const begin=result.times.find(x=>x.name==='cast_entry').t,end=result.times.find(x=>x.name==='sage_skill_exit').t;
   result.basicDuration=end-begin;assert(result.basicDuration>=500&&result.basicDuration<850,JSON.stringify(result));
  }
  if(id.includes('full_cycle')){assert(result.beats.includes('sage_variable_outcome'));assert(result.audio.includes('sage_snap'));assert(result.audio.includes('sage_func'));assert.equal(result.audio.indexOf('sage_cal'),result.audio.indexOf('sage_func')+1);assert.equal(result.audio.filter(k=>k==='sage_pong').length,2);assert(result.audio.includes('sage_laser'));const exit=result.times.find(x=>x.name==='sage_skill_exit'&&x.id==='sge_deduce').t,entry=result.times.find(x=>x.name==='cast_entry'&&x.id==='sge_equation').t;assert(entry-exit>=18);assert.equal(result.sampling,0);}
  report.cases.push(result);
 }
 for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844}]){
  await page.setViewportSize(viewport);if(viewport.width<600)await page.locator('#labSidebarToggle').click();await page.evaluate(()=>resetLab());await page.evaluate(()=>enterCombatStage({speed:10}));
  const pending=page.evaluate(async()=>{await playExpandedCombatPresentation(PHASE6_LAB_SCENES.sage_sge_deduce_hypothesis.steps[0],{mode:'lab',speed:.5});});
  await page.waitForSelector('.sage-vector-contour');await page.screenshot({path:dir+'/'+viewport.width+'-vector.png'});await pending;
  report.viewports.push(viewport);
 }
 for(const id of ['sage_basic_hypothesis','sage_sge_deduce_hypothesis','sage_sge_induce_solve']){
  report.cases.push(await page.evaluate(async id=>{const c=new AbortController(),step=PHASE6_LAB_SCENES[id].steps[0];const p=playExpandedCombatPresentation(step,{mode:'lab',signal:c.signal,speed:1,onTiming:n=>{if(n==='cast_entry')c.abort();}});try{await p;}catch(e){if(e.name!=='AbortError')throw e;}return {id,abort:true,roots:document.querySelectorAll('.skill-production-stage').length};},id));
  assert.equal(report.cases.at(-1).roots,0);
 }
 await page.evaluate(async()=>{for(let i=0;i<3;i++)await playExpandedCombatPresentation(PHASE6_LAB_SCENES.sage_sge_induce_solve.steps[0],{mode:'lab',speed:10,reducedMotion:true});});
 assert.equal(await page.locator('.skill-production-stage').count(),0);
 report.replay=3;report.reducedMotion=true;assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log('Sage skill browser verification passed');
