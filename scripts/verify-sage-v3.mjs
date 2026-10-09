import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='artifacts/sage-v3';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={errors:[],cases:[],viewports:[],aborts:[],replays:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await page.goto('http://localhost:3011/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
  await page.evaluate(()=>enterCombatStage({speed:8}));
  for(const id of ['sage_full_cycle_success','sage_full_cycle_confusion','sage_confusion_self','sage_induce_even_solve']){
    const result=await page.evaluate(async id=>{
      const scene=PHASE6_LAB_SCENES[id],equation=scene.steps.find(s=>s.actionId==='sge_equation'),beats=[],snapshots=[],answers=[];
      const original=window.applyHpSnapshot;window.applyHpSnapshot=s=>{snapshots.push(structuredClone(s));original(s);};
      try{for(const step of scene.steps.filter(s=>s.sourceRole==='sage'))await playExpandedCombatPresentation(step,{mode:'lab',speed:8,onTiming:(name,data)=>{
        const answer=document.querySelector('.sage-answer');beats.push({name,targetId:data?.targetId});
        if(['sage_second_contact','sage_confusion_answer'].includes(name))answers.push(answer.textContent);
        if(name==='sage_confusion_cutin'){
          const image=document.querySelector('.sage-confusion-cutin');beats.push({name:'cutin_asset',src:image.getAttribute('src'),decoded:image.naturalWidth>0});
        }
      }});}finally{window.applyHpSnapshot=original;}
      return {id,outcome:equation?.outcome,beats,answers,lastSnapshot:snapshots.at(-1),roots:document.querySelectorAll('.skill-production-stage').length};
    },id);
    assert.equal(result.roots,0,id);assert.equal(result.lastSnapshot.players.find(p=>p.role==='sage').sageX,result.outcome.xAfter,id);
    if(result.outcome.resolution==='CONFUSION'){
      assert.deepEqual(result.answers,[`解 = ${result.outcome.damageAfterEquipment}`,`解 = ${result.outcome.damageAfterConfusion}`]);
      assert(result.beats.some(b=>b.name==='cutin_asset'&&b.src==='assets/sage-error.png'&&b.decoded));
      assert(result.beats.some(b=>b.name==='sage_confusion_branch'&&b.targetId===result.outcome.confusionTargetId));
      assert(result.beats.findIndex(b=>b.name==='sage_confusion_branch')<result.beats.findIndex(b=>b.name==='sage_variable_outcome'));
    }else assert(!result.beats.some(b=>b.name==='sage_confusion_cutin'));
    report.cases.push(result);
  }
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844}]){
    await page.setViewportSize(viewport);if(viewport.width<600)await page.locator('#labSidebarToggle').click();
    await page.evaluate(async()=>{resetLab();await enterCombatStage({speed:2});});
    const playing=page.evaluate(async()=>{const s=PHASE6_LAB_SCENES.sage_full_cycle_confusion.steps.find(s=>s.actionId==='sge_equation');await playExpandedCombatPresentation(s,{mode:'lab',speed:2});});
    await page.waitForFunction(()=>{const cutin=document.querySelector('.sage-confusion-cutin');return cutin&&Number(getComputedStyle(cutin).opacity)>.8;});
    const layout=await page.evaluate(()=>{
      const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      return {cutin:rect(document.querySelector('.sage-confusion-cutin')),answer:rect(document.querySelector('.sage-answer')),stage:rect(document.querySelector('.skill-production-stage')),fit:getComputedStyle(document.querySelector('.sage-confusion-cutin')).objectFit};
    });
    assert.equal(layout.fit,'contain');assert(layout.cutin.right<=layout.answer.x+1);assert(layout.cutin.x>=layout.stage.x-1);
    await page.screenshot({path:`${dir}/${viewport.width}-confusion.png`});await playing;report.viewports.push({viewport,layout});
  }
  for(const beat of ['sage_confusion_cutin','sage_confusion_branch','sage_variable_outcome']){
    const result=await page.evaluate(async beat=>{
      const c=new AbortController(),step=PHASE6_LAB_SCENES.sage_confusion_self.steps.find(s=>s.actionId==='sge_equation');
      try{await playExpandedCombatPresentation(step,{mode:'lab',signal:c.signal,speed:10,onTiming:name=>{if(name===beat)c.abort();}});}catch(e){if(e.name!=='AbortError')throw e;}
      return {beat,aborted:c.signal.aborted,roots:document.querySelectorAll('.skill-production-stage,.sage-confusion-cutin,.sage-confusion-branch').length};
    },beat);
    assert(result.aborted);assert.equal(result.roots,0);report.aborts.push(result);
  }
  for(let i=0;i<3;i++){
    const result=await page.evaluate(async()=>{
      const step=PHASE6_LAB_SCENES.sage_confusion_self.steps.find(s=>s.actionId==='sge_equation');let final;
      const original=window.applyHpSnapshot;window.applyHpSnapshot=s=>{final=structuredClone(s);original(s);};
      try{await playExpandedCombatPresentation(step,{mode:'lab',speed:12,reducedMotion:true});}finally{window.applyHpSnapshot=original;}
      return {final,expected:step.hpSnapshot,roots:document.querySelectorAll('.skill-production-stage').length};
    });
    assert.deepEqual(result.final,result.expected);assert.equal(result.roots,0);report.replays.push(result);
  }
  // The actual action-bar preview consumes server fields rather than recomputing damage.
  await page.goto('http://localhost:3011/');await page.waitForFunction(()=>typeof renderSageEquationPreview==='function');
  const preview=await page.evaluate(()=>{
    renderSageEquationPreview({role:'sage',hp:70,sagePhase:'solve',sageX:120,sageOperand:16,sageDebt:20,
      sageEquationPreview:{eta:1.45,confusionChance:.11,decayAmount:12,options:[{id:'sge_induce',operand:37,properties:['ODD','PRIME'],damageAfterEquipment:999,damageAfterConfusion:777,blocked:false,cooldown:0}]}});
    return document.getElementById('sageEquationPreview').textContent;
  });
  assert(preview.includes('999／777'));assert(preview.includes('37'));assert(preview.includes('待付透支 20'));assert(!preview.includes('M(X)'));
  report.preview=preview;assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync(dir+'/browser-report.json',JSON.stringify(report,null,2));await browser.close();}
console.log('PASS Sage v3 authoritative answers/targets/X, responsive cut-in, self branch, abort/replay/reduced-motion and server preview');
