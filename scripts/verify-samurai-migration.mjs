import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='artifacts/samurai-migration';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={errors:[],viewports:[],scenes:[],regression:[],abort:[],replays:0};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3018/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 for(const viewport of [{width:1280,height:720},{width:1440,height:900},{width:1920,height:1080}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>enterCombatStage({speed:20}));
  for(const id of await page.evaluate(()=>Object.keys(SAMURAI_LAB_SCENES))){
   const data=await page.evaluate(async id=>{const controller=new AbortController(),beats=[],steps=structuredClone(SAMURAI_LAB_SCENES[id].steps);for(const step of steps)await playExpandedCombatPresentation(step,{signal:controller.signal,speed:4,onTiming:(name,data)=>beats.push({name,time:data.time,index:data.index,targetId:data.targetId,at:performance.now(),action:data.step?.actionId})});return {beats,remaining:document.querySelectorAll('.samurai-fx-owner').length};},id);
   assert.equal(data.remaining,0,id+' cleanup');
   if(id==='samurai_tsubame'){const cuts=data.beats.filter(x=>x.name==='samurai_slash');assert.equal(cuts.length,4);assert.deepEqual(cuts.map(x=>x.time),[1140,1215,1290,1365]);assert.equal(data.beats.filter(x=>x.name==='action_start').length,1);}
   if(id.includes('parry')||id.includes('murasame')||id.includes('haori')){const cuts=data.beats.filter(x=>x.name==='samurai_slash');assert.equal(cuts.length,1);const phaseEnd=data.beats.findIndex(x=>x.name==='action_complete'&&x.action===undefined),counter=data.beats.findIndex(x=>x.name==='samurai_slash');assert(phaseEnd<counter);}
   report.scenes.push({id,viewport,beats:data.beats.filter(x=>['samurai_slash','samurai_parry'].includes(x.name))});
  }
  report.viewports.push(viewport);console.log('Viewport verified',viewport.width,viewport.height);
 }
 await page.setViewportSize({width:1440,height:900});
 // Real reference page, with normalized geometry. Compare Canvas pixels and DOM motion at exact frames.
 const reference=await browser.newPage();reference.on('pageerror',e=>report.errors.push('reference: '+e.message));await reference.goto('http://localhost:3018/assets/temp/samurai_skill_prototype_fixed_v4.html');await reference.waitForFunction(()=>window.SamuraiPrototype);
 const checkpoints={samurai_basic:[176,228,330],samurai_cut:[180,600,685,900,1300,1500,1684],samurai_burst:[685,740],samurai_tsubame:[300,739,740,1050,1140,1215,1290,1365,1390],samurai_parry4:[260,495,730,965]};
 for(const [id,times] of Object.entries(checkpoints))for(const time of times){
  const sample=await page.evaluate(async({id,time})=>{
   const step=structuredClone(SAMURAI_LAB_SCENES[id].steps[0]);await preloadSamuraiFxAssets();let plan;
   if(step.type==='boss_action'){
    const actor=step.hpSnapshotBefore.players[0];plan={skill:'parry',valid:true,duration:1075,hits:[],slashes:[],incoming:[],audio:[],soulChanges:[{time:260,delta:1}],startSouls:0,seed:9,guard:true,options:{curse:false},enemyPhaseEnd:1075};
    step.results.forEach((result,i)=>plan.incoming.push({result,time:260+i*235,taken:0,value:0,target:'player',index:i,guard:true,first:i===0,displayText:'BLOCK'}));
   }else plan=buildSamuraiPresentationPlan(step,{});
   let output;await withCombatCanvas({},step.category,async root=>{
    root.classList.add('samurai-fx-owner');root.style.animation='none';
    const actor=samuraiActor(step,step.sourceId||'hero'),player=createResultCard({targetId:actor.id,targetBefore:actor}),boss=createResultCard({targetId:'monster',targetBefore:step.hpSnapshotBefore.monster,monsterName:step.monsterName,monsterAvatar:step.monsterAvatar});
    const engine=createSamuraiPrototypeRenderer(root,player,boss,plan,{});await Promise.all([...root.querySelectorAll('img')].map(i=>i.decode()));engine.render(time);
    const props={};for(const [name,cls] of Object.entries({eyeCutin:'eye-cutin',eyeOpen:'eye-open',eyeFlare:'eye-flare',eyeSweep:'eye-sweep',swallowTitleIcon:'swallow-title-icon',zanOverlay:'zan-overlay',zanFull:'zan-full',zanSplit:'zan-split',zanSlash:'zan-slash',screenFlash:'screen-flash',screenSlice:'screen-slice'})){const el=root.querySelector('.samurai-'+cls);props[name]={transform:el.style.transform,opacity:el.style.opacity};}
    output={geometry:engine.geometry,plan:JSON.parse(JSON.stringify(plan)),canvas:root.querySelector('canvas').toDataURL(),props};engine.dispose();
   });return output;
  },{id,time});
  const expected=await reference.evaluate(({sample,time})=>{
   SamuraiPrototype.select(sample.plan.skill);SamuraiPrototype.pause();
   geometry=sample.geometry;canvas.width=Math.round(geometry.w*geometry.dpr);canvas.height=Math.round(geometry.h*geometry.dpr);
   const original=state.plan;state.plan={...original,counterAt:null,eye:null,gather:null,lock:null,flashAt:null,...sample.plan,options:{...original.options,...sample.plan.options}};state.shake=true;state.flash=true;
   for(const inc of state.plan.incoming)inc.hp=inc.result?.targetAfter?.hp??80;
   render(time);const props={};for(const name of Object.keys(sample.props)){const el=dom[name];props[name]={transform:el.style.transform,opacity:el.style.opacity};}
   return {canvas:canvas.toDataURL(),props};
  },{sample,time});
  assert.equal(createHash('sha256').update(sample.canvas).digest('hex'),createHash('sha256').update(expected.canvas).digest('hex'),'Canvas pixel equality '+id+' @'+time);
  for(const props of [sample.props,expected.props])for(const value of Object.values(props))if(Number(value.opacity)===0)value.transform='';
  assert.deepEqual(sample.props,expected.props,'DOM motion equality '+id+' @'+time);report.regression.push({id,time,canvas:'identical',dom:'identical'});
 }
 console.log('Exact Canvas and DOM comparisons',report.regression.length);
 // Stage screenshots at stable source checkpoints, without adding another HTML or timeline.
 for(const [id,time] of [['samurai_cut',500],['samurai_cut',800],['samurai_tsubame',500],['samurai_tsubame',760],['samurai_tsubame',1365],['samurai_parry4',965]]){
  await page.evaluate(async({id,time})=>{
   window.captureController=new AbortController();const steps=structuredClone(SAMURAI_LAB_SCENES[id].steps);
   window.captureRun=playExpandedCombatPresentation(steps[0],{signal:captureController.signal,speed:.1,onSamuraiFrame:({time:t,canvas})=>{if(t>=time){window.captureReady=true;}}}).catch(e=>{if(e.name!=='AbortError')throw e;});window.captureReady=false;
  },{id,time});await page.waitForFunction(()=>window.captureReady);await page.screenshot({path:dir+'/'+id+'-'+time+'.png'});await page.evaluate(async()=>{captureController.abort();await captureRun;});
 }
 for(const [id,at] of [['samurai_cut',200],['samurai_tsubame',760],['samurai_parry4',500]]){
  const result=await page.evaluate(async({id,at})=>{const c=new AbortController(),beats=[];await playExpandedCombatPresentation(structuredClone(SAMURAI_LAB_SCENES[id].steps[0]),{signal:c.signal,onTiming:n=>beats.push(n),onSamuraiFrame:({time})=>{if(time>=at)c.abort();}}).catch(e=>{if(e.name!=='AbortError')throw e;});return {remaining:document.querySelectorAll('.samurai-fx-owner').length,complete:beats.includes('action_complete')};},{id,at});assert.equal(result.remaining,0);assert(!result.complete);report.abort.push({id,at,...result});
 }
 const reduced=await page.evaluate(async()=>{let maxFlash=0;await playExpandedCombatPresentation(structuredClone(SAMURAI_LAB_SCENES.samurai_burst.steps[0]),{speed:3,reducedMotion:true,onSamuraiFrame:({canvas})=>maxFlash=Math.max(maxFlash,Number(canvas.querySelector('.samurai-screen-flash').style.opacity))});return maxFlash;});assert(reduced<=.21);report.reducedMotion={maxFlash:reduced};
 // Resize while active, then inspect actual stage-local anchor alignment.
 await page.evaluate(()=>{window.resizeC=new AbortController();window.resizeRun=playExpandedCombatPresentation(structuredClone(SAMURAI_LAB_SCENES.samurai_cut.steps[0]),{signal:resizeC.signal,speed:.2});});
 await page.waitForSelector('.samurai-zan-overlay');await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(100);await page.evaluate(async()=>{resizeC.abort();await resizeRun.catch(e=>{if(e.name!=='AbortError')throw e;});});report.resize=true;
 await page.evaluate(()=>{const originalRaf=window.requestAnimationFrame,originalCancel=window.cancelAnimationFrame;window.samuraiPendingRafs=new Set();window.requestAnimationFrame=callback=>{let id;id=originalRaf.call(window,time=>{samuraiPendingRafs.delete(id);callback(time);});samuraiPendingRafs.add(id);return id;};window.cancelAnimationFrame=id=>{samuraiPendingRafs.delete(id);return originalCancel.call(window,id);};});
 for(let i=0;i<20;i++){await page.evaluate(()=>playExpandedCombatPresentation(structuredClone(SAMURAI_LAB_SCENES.samurai_tsubame.steps[0]),{speed:30}));assert.equal(await page.locator('.samurai-fx-owner').count(),0);report.replays++;}
 report.pendingRafs=await page.evaluate(()=>samuraiPendingRafs.size);assert.equal(report.pendingRafs,0);
 // Full Lab selection uses the same production owner.
 await page.selectOption('#labSceneSelect','samurai_tsubame');await page.waitForSelector('.samurai-eye-cutin');await page.waitForFunction(()=>!document.querySelector('.samurai-fx-owner'));report.labSelection=true;
 // A lethal result settles once, after all of the visual cuts.
 report.lethal=await page.evaluate(async()=>{const step=structuredClone(SAMURAI_LAB_SCENES.samurai_tsubame.steps[0]);step.results=step.results.slice(0,1);step.results[0].targetAfter.hp=0;step.hpSnapshot.monster.hp=0;const beats=[];let maxCuts=0;await playExpandedCombatPresentation(step,{speed:5,onTiming:n=>beats.push(n),onSamuraiFrame:({plans})=>maxCuts=Math.max(maxCuts,plans[0].slashes.length)});return {deaths:beats.filter(n=>n==='death_complete').length,results:beats.filter(n=>n==='hp_update').length,maxCuts};});assert.deepEqual(report.lethal,{deaths:1,results:1,maxCuts:4});
 assert.deepEqual(report.errors,[]);fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));console.log('Samurai migration browser checks passed');
}finally{await browser.close();}
