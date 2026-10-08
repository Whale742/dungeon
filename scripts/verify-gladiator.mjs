import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='artifacts/gladiator';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
const report={errors:[],scenes:[],abort:[],viewports:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await page.goto('http://localhost:3018/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
  report.scenes=await page.evaluate(async()=>{
    sfxManager.soundEnabled=false;const out=[];
    for(const [id,scene] of Object.entries(GLADIATOR_LAB_SCENES)){
      resetLab();const beats=[];const c=new AbortController(),context={mode:'lab',speed:12,signal:c.signal,onTiming:beat=>beats.push(beat)};
      await enterCombatStage(context);for(const step of scene.steps)await playExpandedCombatPresentation(structuredClone(step),context);
      out.push({id,beats,persistent:hasGladiatorArenaStage(),temp:document.querySelectorAll('.gladiator-fragment,.gladiator-charge-ghost,.gladiator-slash,.presentation-result-number').length});
      await exitCombatStage(context);c.abort();
    }
    return out;
  });
  assert.equal(report.scenes.length,17);assert(report.scenes.every(s=>s.temp===0));
  const forced=report.scenes.find(s=>s.id==='gladiator_forced_end');assert(!forced.beats.includes('arena_triumph_transfer'));assert(forced.beats.includes('gladiator_left_blank'));
  report.sacrifice=await page.evaluate(async()=>{
    resetLab();const observations=[];const c=new AbortController();await enterCombatStage({speed:10});
    const start=performance.now();await playExpandedCombatPresentation(structuredClone(GLADIATOR_LAB_SCENES.gladiator_sacrifice.steps[0]),{signal:c.signal,onTiming:beat=>{
      if(beat.startsWith('gladiator_'))observations.push({beat,time:performance.now()-start,hp:document.querySelector('.gladiator-card .presentation-result-hp-text')?.textContent,rage:document.querySelector('.gladiator-rage-ui')?.textContent});
    }});c.abort();return observations;
  });
  const roar=report.sacrifice.find(b=>b.beat==='gladiator_war_roar'),rage=report.sacrifice.find(b=>b.beat==='gladiator_rage_gain');
  assert.equal(roar.hp,'65 / 85');assert.equal(roar.rage,'RAGE 0');assert.equal(rage.rage,'RAGE 1');assert(rage.time>roar.time);
  assert(report.sacrifice.at(-1).time<650);
  report.persistence=await page.evaluate(async()=>{
    resetLab();const c=new AbortController(),context={signal:c.signal,speed:12};await enterCombatStage(context);
    await playExpandedCombatPresentation(structuredClone(GLADIATOR_LAB_SCENES.gladiator_enter.steps[0]),context);
    const root=document.querySelector('.arena-environment');await exitCombatStage(context);
    const intermission=hasGladiatorArenaStage()&&root.isConnected;await enterCombatStage(context);const beats=[];
    await playExpandedCombatPresentation(structuredClone(GLADIATOR_LAB_SCENES.gladiator_assault.steps[0]),{...context,onTiming:b=>beats.push(b)});
    const same=root===document.querySelector('.arena-environment');c.abort();return{intermission,same,beats,afterAbort:hasGladiatorArenaStage()};
  });
  assert(report.persistence.intermission);assert(report.persistence.same);assert(!report.persistence.beats.includes('arena_darken'));assert(!report.persistence.afterAbort);
  report.reduced=await page.evaluate(async()=>{
    const out=[];for(const id of ['gladiator_sacrifice','gladiator_enter','gladiator_assault','gladiator_forced_end','gladiator_exit_rage8']){
      resetLab();const c=new AbortController(),beats=[];await enterCombatStage({speed:20});
      for(const step of GLADIATOR_LAB_SCENES[id].steps)await playExpandedCombatPresentation(structuredClone(step),{signal:c.signal,speed:12,reducedMotion:true,onTiming:b=>beats.push(b)});
      out.push({id,beats});c.abort();
    }return out;
  });
  assert(report.reduced.find(s=>s.id==='gladiator_sacrifice').beats.includes('gladiator_war_roar'));
  assert(report.reduced.find(s=>s.id==='gladiator_forced_end').beats.includes('gladiator_left_blank'));
  for(const [id,beat] of [['gladiator_sacrifice','gladiator_self_hp'],['gladiator_sacrifice','gladiator_war_roar'],['gladiator_enter','arena_walls_snap'],['gladiator_assault','arena_assault_slam'],['gladiator_forced_end','gladiator_overshoot'],['gladiator_exit_rage8','arena_triumph_transfer']]){
    const data=await page.evaluate(async({id,beat})=>{
      resetLab();sfxManager.soundEnabled=true;sfxManager.init();await sfxManager.ctx.resume();const c=new AbortController();let completed=false;
      try{for(const step of GLADIATOR_LAB_SCENES[id].steps)await playExpandedCombatPresentation(structuredClone(step),{signal:c.signal,speed:4,onTiming:b=>{if(b===beat)c.abort();if(b==='action_complete')completed=true;}});}catch(e){if(e.name!=='AbortError')throw e;}
      return{root:document.querySelectorAll('.arena-environment,.gladiator-action-owner').length,voices:sfxManager.activeVoices.size,completed};
    },{id,beat});report.abort.push({id,beat,...data});assert.equal(data.root,0);assert.equal(data.voices,0);
  }
  for(const [width,height] of [[1440,900],[390,844]]){
    await page.setViewportSize({width,height});await page.evaluate(async()=>{resetLab();sfxManager.soundEnabled=false;await enterCombatStage({mode:'lab',speed:20});await playExpandedCombatPresentation(structuredClone(GLADIATOR_LAB_SCENES.gladiator_enter.steps[0]),{mode:'lab',speed:10});});
    await page.screenshot({path:dir+'/arena-'+width+'.png'});
    report.viewports.push(await page.evaluate(()=>({width:innerWidth,stage:document.querySelector('.arena-environment').getBoundingClientRect().width,actors:document.querySelectorAll('.arena-combatants .gladiator-position').length})));
  }
  await page.evaluate(()=>resetLab());assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
