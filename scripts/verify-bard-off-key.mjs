import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3018/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 const result=await page.evaluate(async()=>{
  sfxManager.soundEnabled=true;await enterCombatStage({speed:20});
  const curves=[],original=AudioParam.prototype.setValueCurveAtTime;
  AudioParam.prototype.setValueCurveAtTime=function(values,start,duration){curves.push({max:Math.max(...values),min:Math.min(...values),duration});return original.call(this,values,start,duration);};
  const step=structuredClone(Object.values(PHASE6_LAB_SCENES).flatMap(x=>x.steps||[]).find(x=>x?.sourceRole==='bard'&&x.outcome?.type==='off_key'));
  if(!step)throw Error('Missing Bard off-key fixture');
  const animations=[];
  const sample=()=>{const actor=document.querySelector('.is-off-key .presentation-support-actor');if(actor)for(const a of actor.getAnimations())if(a.animationName==='bardOffKeySway')animations.push({timing:a.effect.getTiming(),easing:getComputedStyle(actor).animationTimingFunction,frames:a.effect.getKeyframes()});};
  const timer=setInterval(sample,100);
  try{await playCategoryPresentation(step,{});}finally{clearInterval(timer);AudioParam.prototype.setValueCurveAtTime=original;sfxManager.stopAll();}
  return {curves,animation:animations[0],remaining:document.querySelectorAll('.presentation-support-canvas').length};
 });
 assert(result.curves.some(x=>x.max>410&&x.min<-410),'wide detune curve reaches native audio');
 assert.equal(result.animation.timing.duration,2400);assert.equal(result.animation.easing,'ease-in-out');
 assert(result.animation.frames.some(f=>f.transform.includes('-20px')));
 assert(result.animation.frames.some(f=>f.transform.includes('20px')));
 assert.equal(result.remaining,0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({curve:result.curves[0],animationDuration:result.animation.timing.duration,easing:result.animation.easing,errors},null,2));
}finally{await browser.close();}
