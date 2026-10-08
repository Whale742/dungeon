import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3018/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 await page.evaluate(()=>enterCombatStage({speed:20}));
 const data=await page.evaluate(async()=>{
  const calls=[],beats=[];const original=sfxManager.play.bind(sfxManager);
  sfxManager.soundEnabled=true;
  sfxManager.play=(key,opts)=>original(key,opts).then(voice=>{calls.push({key,at:performance.now(),duration:voice?.source?.buffer?.duration});return voice;});
  await playExpandedCombatPresentation(structuredClone(SAMURAI_LAB_SCENES.samurai_tsubame.steps[0]),{onTiming:(name,d)=>beats.push({name,time:d.time,at:performance.now()})});
  return {calls,beats};
 });
 const intro=data.calls.find(x=>x.key==='samurai-skill2-intro'),eye=data.beats.find(x=>x.name==='samurai_eye_open');
 assert(intro?.duration>1,'intro actually decoded and played');
 const gap=eye.at-intro.at;assert(gap>=995&&gap<1060,'eye gap '+gap);
 assert.equal(data.calls.filter(x=>x.key==='samurai-skill').length,1);
 assert.deepEqual(data.calls.map(x=>x.key),['samurai-skill','samurai-skill2-intro','assassin-pursuit','assassin-pursuit','assassin-pursuit','sword-slash-heavy']);
 assert(data.calls.find(x=>x.key==='samurai-skill').at<intro.at+50,'cast sound begins with intro');
 assert(data.calls.filter(x=>x.key.startsWith('sword-slash')||x.key==='assassin-pursuit').every(x=>x.duration>0),'slash files decoded and played');
 const cut=await page.evaluate(async()=>{const sounds=[];const original=sfxManager.play;sfxManager.play=(key,opts)=>{sounds.push(key);return original(key,opts);};await playExpandedCombatPresentation(structuredClone(SAMURAI_LAB_SCENES.samurai_cut.steps[0]),{speed:4});return sounds;});
 assert.deepEqual(cut,['samurai-skill','sword-slash-heavy']);
 const parry=await page.evaluate(async()=>{
  const c=new AbortController(),beats=[],sizes=[];let special=false;
  const observer=new MutationObserver(()=>{special ||= !!document.querySelector('.samurai-fx-owner');for(const el of document.querySelectorAll('.is-samurai-parry'))sizes.push({text:el.textContent,size:parseFloat(getComputedStyle(el).fontSize),normal:parseFloat(getComputedStyle(el.parentElement).fontSize)});});observer.observe(document.body,{subtree:true,childList:true});
  const steps=structuredClone(SAMURAI_LAB_SCENES.samurai_parry4.steps);
  await playExpandedCombatPresentation(steps[0],{signal:c.signal,speed:3,onTiming:(name,d)=>beats.push({name,target:d.targetId})});
  observer.disconnect();
  const p=buildSamuraiPresentationPlan(steps[1],{signal:c.signal});
  const counterSounds=[],original=sfxManager.play;
  sfxManager.play=(key,options)=>{counterSounds.push(key);return original(key,options);};
  await playExpandedCombatPresentation(steps[1],{signal:c.signal,speed:1});
  sfxManager.play=original;
  return {beats,sizes,special,counterSounds,echoes:p.hits[0].echoes,remaining:document.querySelectorAll('.samurai-fx-owner').length};
 });
 assert(!parry.special,'boss phase uses common presentation');
 assert.equal(parry.beats.filter(x=>x.name==='samurai_parry_flash').length,4);
 assert.equal(parry.beats.filter(x=>x.name==='block').length,4);
 assert(parry.sizes.length&&parry.sizes.every(x=>x.text==='格擋'&&x.size<=18.4));
 assert.deepEqual(parry.counterSounds,['samurai-skill','assassin-pursuit']);
 assert.equal(parry.echoes,3);assert.equal(parry.remaining,0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({introEyeGapMs:gap,soundDuration:intro.duration,skillSoundCount:1,tsubameSounds:data.calls.map(x=>x.key),cutSounds:cut,parryFlashes:4,sharedBossPresentation:true,counterEchoes:parry.echoes,counterSounds:parry.counterSounds,errors},null,2));
}finally{await browser.close();}
