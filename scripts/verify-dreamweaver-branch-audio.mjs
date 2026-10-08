import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3018/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 const results=await page.evaluate(async()=>{
  await enterCombatStage({speed:20});
  const template=Object.values(PHASE6_LAB_SCENES).flatMap(x=>x.steps||[]).find(s=>s?.sourceRole==='dreamweaver'&&s.actionId?.endsWith('_result'));
  if(!template)throw Error('Missing dream result fixture');
  const output=[];
  for(const [type,label] of [['mirror','鏡像夢境'],['dissociate','解離痛楚'],['nightmare_weak','萎靡夢魘'],['shallow','淺層清夢'],['lone','孤影殘夢'],['deep','深淵墜夢']]){
   const step=structuredClone(template),sounds=[];
   step.outcome={type,label};
   await playExpandedCombatPresentation(step,{speed:6,onTiming:(name,d)=>{if(name==='dreamweaver_sfx')sounds.push(d.key);}});
   output.push({type,label,sounds});
  }
  return output;
 });
 for(const result of results)assert.deepEqual(result.sounds,[result.type==='deep'?'dreamwaver-nage':'dreamwaver-posi'],result.label);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
