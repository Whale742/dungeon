// Optional browser QA. Set STUDIO_PLAYWRIGHT_PATH / STUDIO_CHROME_PATH when needed.
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mountStudio} from '../studio/router.js';
import {CLASSES,ROLE_DETAILS} from '../game/constants.js';

const {chromium}=createRequire(import.meta.url)(process.env.STUDIO_PLAYWRIGHT_PATH || 'playwright');
const app=express(),publicDir=fileURLToPath(new URL('../public/',import.meta.url));
mountStudio(app,publicDir,{env:{}});app.use(express.static(publicDir));
app.get('/api/skill-copy',(_req,res)=>res.json(Object.fromEntries(Object.entries(CLASSES).map(([id,c])=>[id,{...c,skills:c.skills.map((s,i)=>({...s,shortDesc:s.shortDesc ?? s.desc,desc:ROLE_DETAILS[id]?.skills?.[i]?.desc ?? s.desc}))}]))));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
const report={scenes:[],errors:[],screenshots:[]};
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.STUDIO_CHROME_PATH || undefined,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('response',response=>{if(response.url().startsWith(origin) && response.status()>=400 && !response.url().endsWith('/favicon.ico'))report.errors.push(`${response.status()} ${new URL(response.url()).pathname}`);});
  await page.goto(origin+'/lab?scene=augur_reckon');
  await page.waitForFunction(()=>window.studioLabInitialized===true,null,{timeout:15000});
  if(process.env.AUGUR_QA_FONT) {
    const bytes=fs.readFileSync(process.env.AUGUR_QA_FONT).toString('base64');
    await page.addStyleTag({content:`@font-face{font-family:AugurQaCjk;src:url(data:font/ttf;base64,${bytes})}body,.augur-presentation-container{font-family:Georgia,AugurQaCjk,serif!important}`});
    await page.evaluate(()=>document.fonts.load('16px AugurQaCjk'));
  }
  const scenes=process.env.AUGUR_QA_SCENES?process.env.AUGUR_QA_SCENES.split(','):await page.evaluate(()=>Object.keys(AUGUR_LAB_SCENES));
  for(const id of scenes) {
    await page.evaluate(async id=>{labState.speed=3;await playScene(id);},id);
    assert.equal(await page.locator('.augur-presentation-container').count(),0,'Leaked stage: '+id);
    report.scenes.push(id);console.log('PASS '+id);
  }
  const output=process.env.AUGUR_QA_OUTPUT_DIR;
  if(output) {
    fs.mkdirSync(output,{recursive:true});
    for(const [name,viewport,id,selector,delay] of [
      ['desktop-observe',{width:1280,height:900},'augur_observe','.observing-hand',400],
      ['desktop-reckon',{width:1280,height:900},'augur_reckon','.cupping-hand',950],
      ['mobile-reckon',{width:390,height:844},'augur_reckon','.cupping-hand',950]
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(id=>{labState.speed=1;window.augurQaPlayback=playScene(id);},id);
      await page.locator('#labStage').scrollIntoViewIfNeeded();
      await page.waitForSelector(selector);await page.waitForTimeout(delay);
      const metrics=await page.evaluate(()=>{
        const root=document.querySelector('.augur-presentation-container');
        const observingHand=root.querySelector('.observing-hand')?.getBoundingClientRect();
        const orb=root.querySelector('.orb-anchor').getBoundingClientRect();
        return {portraits:root.querySelectorAll('.augur-portrait').length,
          images:[...root.querySelectorAll('img')].map(img=>({src:img.getAttribute('src'),loaded:img.complete && img.naturalWidth>0})),
          orb:orb.toJSON(),
          fingertipGap:observingHand?orb.top-(observingHand.top+observingHand.height*.37):null,
          stage:root.getBoundingClientRect().toJSON(),
          handLayer:root.querySelector('.cupping-hand')?getComputedStyle(root.querySelector('.cupping-hand').parentElement).zIndex:null,
          orbLayer:getComputedStyle(root.querySelector('.orb-anchor')).zIndex};
      });
      assert.equal(metrics.portraits,2);assert(metrics.images.every(image=>image.loaded),JSON.stringify(metrics.images));
      assert(metrics.images.some(image=>image.src?.includes('Augur.webp')),'Augur portrait must not fall back to Warrior');
      assert(metrics.stage.width>300 && metrics.stage.height>300,'Stage collapsed: '+JSON.stringify(metrics.stage));
      if(metrics.handLayer)assert(Number(metrics.handLayer)<Number(metrics.orbLayer));
      if(metrics.fingertipGap!==null)assert(metrics.fingertipGap>=5 && metrics.fingertipGap<=11,'Observation fingertip must hover about 10px above orb');
      const filename=path.join(output,name+'.png');await page.screenshot({path:filename});
      report.screenshots.push({name,metrics});await page.evaluate(()=>window.augurQaPlayback);
    }
  }
  for(const id of ['augur_bind','augur_reckon','augur_reverse','augur_tome_repay']) {
    console.log('ABORT CHECK '+id);
    await page.evaluate(id=>{labState.speed=1;window.augurQaPlayback=playScene(id);},id);
    await page.waitForSelector('.augur-presentation-container',{state:'attached'});
    await page.evaluate(()=>resetLab());await page.evaluate(()=>window.augurQaPlayback);
    assert.equal(await page.locator('.augur-presentation-container').count(),0,'Aborted stage leaked: '+id);
  }
  await page.evaluate(async()=>{labState.speed=3;labState.reducedMotion=true;await playScene('augur_reckon');});
  assert.equal(await page.locator('.augur-presentation-container').count(),0,'Reduced motion stage leaked');
  assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify(report,null,2));
} finally {
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
