// Optional browser QA. Set STUDIO_PLAYWRIGHT_PATH / STUDIO_CHROME_PATH when needed.
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Server} from 'socket.io';
import {Room} from '../game/Room.js';
import {mountStudio} from '../studio/router.js';
import {CLASSES,ROLE_DETAILS,ROUTES} from '../game/constants.js';

const {chromium}=createRequire(import.meta.url)(process.env.STUDIO_PLAYWRIGHT_PATH || 'playwright');
const app=express(),publicDir=fileURLToPath(new URL('../public/',import.meta.url));
mountStudio(app,publicDir,{env:{}});app.use(express.static(publicDir));
app.get('/api/skill-copy',(_req,res)=>res.json(Object.fromEntries(Object.entries(CLASSES).map(([id,c])=>[id,{...c,skills:c.skills.map((s,i)=>({...s,shortDesc:s.shortDesc ?? s.desc,desc:ROLE_DETAILS[id]?.skills?.[i]?.desc ?? s.desc}))}]))));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const io=new Server(server),rooms=[];
io.on('connection',socket=>{
  socket.emit('init:constants',{classes:CLASSES,roleDetails:ROLE_DETAILS,routes:ROUTES});
  let room;
  socket.on('qa:augur-encounter',()=>{
    room=new Room('AUGUR-QA',socket,'卜者',io);rooms.push(room);
    room.addPlayer({id:'qa-ally',join(){}},'戰士');
    room.selectRole(socket.id,'augur');room.selectRole('qa-ally','warrior');
    room.players['qa-ally'].connected=false;
    room.state='TRANSITION';room.floor=1;room.broadcastState();
    room.handleBattleEvent();
  });
  socket.on('battle:presentation_complete',data=>room?.handlePresentationComplete(socket.id,data.presentationId,data.round));
  socket.on('battle:selection_ready',data=>room?.handleSelectionReady(socket.id,data.round));
});
const origin='http://127.0.0.1:'+server.address().port;
let browser;
const report={scenes:[],errors:[],screenshots:[],transitions:[]};
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.STUDIO_CHROME_PATH || undefined,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--autoplay-policy=no-user-gesture-required']});
  const production=await browser.newPage({viewport:{width:1280,height:900}});
  production.on('pageerror',error=>report.errors.push(error.message));
  await production.goto(origin);await production.waitForFunction(()=>socket.connected);
  await production.evaluate(()=>{
    window.augurOpeningTrace=[];
    const record=beat=>augurOpeningTrace.push({beat,state:roomState?.state,round:roomState?.battleRound,
      overlays:document.querySelectorAll('.boss-encounter-stage,.round-start-overlay').length});
    const opening=window.playBattlePhaseOpening,augur=window.playAugurPresentation,emit=socket.emit.bind(socket);
    window.playBattlePhaseOpening=(monster,round,context)=>opening(monster,round,{...context,speed:8,
      onTiming(beat,...args){record(beat);context.onTiming?.(beat,...args);}});
    window.playAugurPresentation=(step,context)=>augur(step,{...context,speed:5,
      onTiming(beat,...args){record(beat);context.onTiming?.(beat,...args);}});
    socket.emit=(event,...args)=>{if(event==='battle:selection_ready'||event==='battle:presentation_complete')record(event);return emit(event,...args);};
    socket.emit('qa:augur-encounter');
  });
  await production.waitForFunction(()=>augurOpeningTrace.some(e=>e.beat==='battle:selection_ready'),null,{timeout:30000});
  report.opening=await production.evaluate(()=>augurOpeningTrace);
  const order=report.opening.map(e=>e.beat);
  for(const [first,second] of [['battle_hud_reveal','round_complete'],['round_complete','augur_action_start'],
    ['action_complete','battle:presentation_complete'],['battle:presentation_complete','battle:selection_ready']]) {
    assert(order.indexOf(first)>=0 && order.indexOf(second)>order.indexOf(first),`${first} before ${second}`);
  }
  assert.equal(order.filter(beat=>beat==='augur_action_start').length,1);
  assert(report.opening.filter(e=>e.beat==='augur_action_start').every(e=>e.state==='IN_BATTLE' && e.overlays===0));
  console.log('PASS production encounter → Round 1 complete → observation → selection');
  rooms.forEach(room=>room.clearTimer());await production.close();
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
  for(const id of ['augur_observe','augur_bind','augur_reobserve']) {
    const samples=await page.evaluate(async id=>{
      const samples=[];let running=true;
      const sample=()=>{
        const image=document.querySelector('#augurOrbTarget');
        if(image) {const style=getComputedStyle(image);samples.push({src:image.getAttribute('src'),opacity:Number(style.opacity),blur:parseFloat(style.filter.slice(5))||0});}
        if(running)requestAnimationFrame(sample);
      };
      labState.speed=1;requestAnimationFrame(sample);
      try {await playScene(id);}finally{running=false;}
      return samples;
    },id);
    const visible=samples.filter(s=>s.opacity>0),newSrc=visible.at(-1).src;
    if(id==='augur_observe')assert.equal(samples[0].opacity,0,'Initial orb must be empty');
    else {
      const oldSrc=visible[0].src;
      assert.notEqual(oldSrc,newSrc);
      assert(samples.some(s=>s.src===oldSrc&&s.opacity>0&&s.opacity<.7&&s.blur>3),'Old target must dissolve');
      const swap=samples.find(s=>s.src===newSrc);assert(swap.opacity<.05,'Swap only while invisible');
    }
    assert(samples.some(s=>s.src===newSrc&&s.opacity>0&&s.opacity<.7&&s.blur>3),'New target must gather');
    assert.equal(visible.at(-1).opacity,.82);
    report.transitions.push({id,samples:samples.length});console.log('PASS mist transition '+id);
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
  rooms.forEach(room=>room.clearTimer());await browser?.close();await new Promise(resolve=>io.close(resolve));
  server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));
}
