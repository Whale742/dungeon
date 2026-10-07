import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='artifacts/phase81-production';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),report={errors:[],scenes:[],viewports:[],checks:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const evaluate=async(fn,arg)=>{let timer;try{return await Promise.race([page.evaluate(fn,arg),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Browser evaluation exceeded 30 seconds')),30000);})]);}finally{clearTimeout(timer);}};
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{
   window.qaRafs=new Set();const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
   window.requestAnimationFrame=fn=>{let id=request(t=>{qaRafs.delete(id);fn(t);});qaRafs.add(id);return id;};window.cancelAnimationFrame=id=>{qaRafs.delete(id);cancel(id);};
  });
  await page.goto('http://localhost:3011/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 await evaluate(()=>{window.qaBeats=[];});
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing',transferMode:'ReturnAsStream'});
 await evaluate(async()=>{
  const step=PHASE6_LAB_SCENES.p8_sage_reference_17_24.steps.find(s=>s.actionId==='sge_equation');
  await enterCombatStage({speed:1});await playExpandedCombatPresentation(step,{mode:'lab',speed:1,showAnchors:true,onTiming:(name)=>{performance.mark('phase81-'+name);qaBeats.push({name,time:performance.now(),eta:document.querySelector('.sage-term:nth-of-type(1)')?.style.opacity,terms:[...document.querySelectorAll('.sage-term')].map(n=>n.style.opacity),fraction:document.querySelector('.sage-fraction')?.style.opacity,answer:document.querySelector('.sage-answer')?.style.opacity});}});
 });
 const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;
 let trace='';for(;;){const part=await cdp.send('IO.read',{handle:stream});trace+=part.data;if(part.eof)break;}await cdp.send('IO.close',{handle:stream});fs.writeFileSync(dir+'/production-trace.json',trace);
 const events=JSON.parse(trace).traceEvents;report.performance={};
 for(const name of ['Layout','UpdateLayoutTree','Paint','RasterTask','FunctionCall','TimerFire','FireAnimationFrame','MinorGC','MajorGC','Decode Image']){const selected=events.filter(e=>e.name===name&&e.dur);report.performance[name]={count:selected.length,totalMs:selected.reduce((n,e)=>n+e.dur/1000,0),maxMs:Math.max(0,...selected.map(e=>e.dur/1000))};}
 const snap=events.find(e=>e.name==='phase81-sage_snap');report.afterSnapPerformance={};if(snap)for(const name of ['Layout','FireAnimationFrame','Paint']){const selected=events.filter(e=>e.name===name&&e.dur&&e.ts>=snap.ts);report.afterSnapPerformance[name]={count:selected.length,totalMs:selected.reduce((n,e)=>n+e.dur/1000,0),maxMs:Math.max(0,...selected.map(e=>e.dur/1000))};}
 const ids=['p8_sage_reference_17_24','p8_sage_even_square','p8_dream_mirror','p8_dream_dissociate','p8_dream_nightmare','p8_dream_frenzy','p8_butterfly_heal','p8_butterfly_true','p8_false_shallow','p8_false_deep','p8_false_lone','p8_false_horde','p8_gladiator_challenge',...['star','planet','galaxy','blackhole','boundary'].map(t=>'p8_observe_'+t),...['accelerate','reset','overload','nothing'].map(t=>'p8_clock_'+t)];
 for(const id of ids){console.log('RUN '+id);await evaluate(async id=>{await enterCombatStage({speed:6});for(const step of PHASE6_LAB_SCENES[id].steps.filter(s=>s.type==='player_action'))await playExpandedCombatPresentation(step,{mode:'lab',speed:6});},id);assert.equal(await page.locator('.skill-production-stage').count(),0);report.scenes.push(id);console.log('PASS '+id);}
 for(const [width,height] of [[1440,900],[1280,720],[1920,1080]]){
  await page.setViewportSize({width,height});
  await evaluate(()=>{window.qaController=new AbortController();const step=PHASE6_LAB_SCENES.p8_sage_reference_17_24.steps.find(s=>s.actionId==='sge_equation');window.qaRun=playExpandedCombatPresentation(step,{mode:'lab',speed:1,showAnchors:true,signal:qaController.signal}).catch(e=>{if(e.name!=='AbortError')throw e;});});
  await page.waitForTimeout(2100);await page.screenshot({path:dir+'/sage-'+width+'x'+height+'.png'});
  const bounds=await page.locator('.skill-production-frame').boundingBox();assert(bounds.width<=width+1&&bounds.height<=height+1);report.viewports.push({width,height,bounds});
  await evaluate(async()=>{qaController.abort();await qaRun;});assert.equal(await page.locator('.skill-production-stage').count(),0);
 }
 await page.setViewportSize({width:1440,height:900});
 for(const id of ['p8_dream_mirror','p8_butterfly_heal','p8_gladiator_challenge','p8_observe_boundary','p8_clock_overload']){
  await evaluate(id=>{window.qaLanding=false;window.qaRun=(async()=>{await enterCombatStage({speed:1});for(const step of PHASE6_LAB_SCENES[id].steps.filter(s=>s.type==='player_action'))await playExpandedCombatPresentation(step,{mode:'lab',speed:1,onTiming:name=>{if(name==='gladius_landing')window.qaLanding=true;}});})();},id);if(id==='p8_gladiator_challenge')await page.waitForFunction(()=>window.qaLanding);else await page.waitForTimeout(1150);await page.screenshot({path:dir+'/'+id+'.png'});await evaluate(()=>qaRun);
 }
 for(const id of ['p8_butterfly_heal','p8_butterfly_true']){
  await evaluate(async id=>{for(const step of PHASE6_LAB_SCENES[id].steps.filter(s=>s.type==='boss_action'))await playExpandedCombatPresentation(step,{mode:'lab',speed:10});},id);
 }
 report.checks.push('dream healing/nightmare portrait cues on actual boss attack targets');
 const voiceBaseline=await evaluate(()=>sfxManager.activeVoices.size);
 const cleanup=await evaluate(async()=>{
  const step=PHASE6_LAB_SCENES.p8_observe_boundary.steps.find(s=>s.actionId==='sg_observe');
  for(let i=0;i<3;i++)await playExpandedCombatPresentation(step,{speed:8,reducedMotion:true});
  const controller=new AbortController(),run=playExpandedCombatPresentation(step,{signal:controller.signal}).catch(e=>{if(e.name!=='AbortError')throw e;});setTimeout(()=>controller.abort(),80);await run;
  return {stages:document.querySelectorAll('.skill-production-stage').length,animations:document.getAnimations().filter(a=>a.effect?.target?.closest?.('.skill-production-stage')).length,rafCount:qaRafs.size,voices:sfxManager.activeVoices.size,decoded:sageHandAssets!==undefined};
 });assert.equal(cleanup.stages,0);assert.equal(cleanup.animations,0);assert(cleanup.decoded);assert.equal(cleanup.rafCount,0);assert(cleanup.voices<=voiceBaseline);report.audioCleanup={baseline:voiceBaseline,after:cleanup.voices};report.checks.push('local hand assets decoded; replay/reduced motion/abort removes all transient stages and animations');
 report.beats=await evaluate(()=>qaBeats);assert(report.beats.some(b=>b.name==='sage_first_contact'));assert(report.beats.some(b=>b.name==='sage_second_contact'));const first=report.beats.find(b=>b.name==='sage_first_contact'),second=report.beats.find(b=>b.name==='sage_second_contact');assert.equal(first.fraction,'1');assert.equal(first.terms[1],'0');assert.equal(second.answer,'1');assert.equal(second.terms[1],'0');report.checks.push('contact-frame fraction reveal; eta removed before answer; zero pending RAF after replay/abort');
 await page.goto('http://localhost:3011/');await page.waitForFunction(()=>typeof classesData!=='undefined'&&Object.keys(classesData).length===12);
 await page.addScriptTag({url:'http://localhost:3011/lab-combat-scenes.js'});
 await evaluate(async()=>{
  const step=PHASE6_LAB_SCENES.p8_sage_reference_17_24.steps.find(s=>s.actionId==='sge_equation');
  myId='hero';roomState={state:'IN_BATTLE',players:structuredClone(step.hpSnapshotBefore.players),currentMonster:{...step.hpSnapshotBefore.monster,avatar:step.monsterAvatar,name:step.monsterName},monster:{...step.hpSnapshotBefore.monster},battleRound:1};
  await enterCombatStage({speed:8});await playExpandedCombatPresentation(step,{speed:8});await exitCombatStage({speed:8});
 });
 assert.equal(await page.locator('.skill-production-stage,.skill-debug-anchor').count(),0);report.checks.push('production index.html dispatch and HP snapshot integration; anchors hidden outside Lab');
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify({scenes:report.scenes.length,checks:report.checks,performance:report.performance}));
}finally{fs.writeFileSync(dir+'/browser-report.json',JSON.stringify(report,null,2));await browser.close();}
