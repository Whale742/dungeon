import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=document-user-activation-required']});
const report={opening:[],scenes:[],errors:[]};
const configure=async page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.goto('http://localhost:3011/');await page.mouse.click(3,3);await page.evaluate(()=>sfxManager.preload());await page.evaluate(()=>{window.audioTrace=[];const original=sfxManager.play.bind(sfxManager);sfxManager.play=(key,opts)=>{window.audioTrace.push({key,time:performance.now()});return original(key,opts);};});};
const emit=(page,event,data)=>page.evaluate(({event,data})=>new Promise(resolve=>data===null?socket.emit(event,resolve):socket.emit(event,data,resolve)),{event,data});
try{
 const pages=[await browser.newPage(),await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true})];
 for(const page of pages)await configure(page);
 const create=await emit(pages[0],'room:create',{name:'Audio QA'});assert(create.success);
 assert((await emit(pages[1],'room:join',{code:create.roomCode,name:'Mobile Audio QA'})).success);
 for(let i=0;i<2;i++)assert((await emit(pages[i],'player:select_role',{roleKey:i?'mage':'warrior'})).success);
 assert((await emit(pages[1],'room:toggle_ready',null)).success);
 assert((await emit(pages[0],'game:start',null)).success);
 for(const page of pages){await page.waitForFunction(()=>window.audioTrace.some(e=>e.key==='logo_intro'));const value=await page.evaluate(()=>{for(let i=0;i<12;i++)renderApp();return{logoCount:window.audioTrace.filter(e=>e.key==='logo_intro').length,visible:!elements.gameTitleContainer.classList.contains('hidden'),running:sfxManager.ctx.state,voices:[...sfxManager.activeVoices].map(v=>v.key)};});assert.equal(value.logoCount,1);assert(value.visible&&value.running==='running'&&value.voices.includes('logo_intro'));report.opening.push(value);}
 for(const page of pages)await page.close();
 const lab=await browser.newPage({viewport:{width:1600,height:1000}});await configure(lab);await lab.goto('http://localhost:3011/presentation-lab.html');await lab.waitForFunction(()=>window.labInitialized);await lab.mouse.click(3,3);await lab.evaluate(()=>sfxManager.preload());
 await lab.evaluate(()=>{window.trace=[];const original=sfxManager.play.bind(sfxManager);sfxManager.play=(key,opts)=>{window.trace.push({key,time:performance.now()});return original(key,opts);};labState.speed=4;});
 const heavy=await lab.evaluate(async()=>{window.trace=[];await playScene('a73_warrior_action');return window.trace;});assert.equal(heavy.filter(e=>e.key==='warrior_skill1').length,1);assert.equal(heavy.filter(e=>e.key==='panel_sweep').length,1);report.scenes.push({scene:'a73_warrior_action',trace:heavy});
 await lab.evaluate(()=>{window.trace=[];window.pending=playScene('chest_full');});await lab.waitForFunction(()=>elements.btnOpenChest.classList.contains('ready'));
 assert.equal(await lab.evaluate(()=>window.trace.filter(e=>e.key==='chest_reveal').length),0);
 await lab.locator('#btnOpenChest').click();await lab.evaluate(()=>window.pending);const chest=await lab.evaluate(()=>window.trace);assert.equal(chest.filter(e=>e.key==='chest_reveal').length,1);report.scenes.push({scene:'chest_full',trace:chest});
 await lab.evaluate(()=>{window.trace=[];window.pending=playScene('p6_victory');});await lab.locator('.presentation-victory-continue').waitFor({timeout:30000});await lab.locator('.presentation-victory-continue').click();await lab.evaluate(()=>window.pending);const victory=await lab.evaluate(()=>window.trace);assert.equal(victory.filter(e=>e.key==='victory').length,1);report.scenes.push({scene:'p6_victory',trace:victory});
 await lab.evaluate(()=>{window.trace=[];window.pending=playScene('p73_encounter');});await lab.waitForFunction(()=>window.trace.some(e=>e.key==='boss_warning'));await lab.evaluate(()=>resetLab());await lab.evaluate(()=>window.pending);assert.equal(await lab.evaluate(()=>sfxManager.activeVoices.size),0);report.resetClean=true;
 assert.deepEqual(report.errors,[]);console.log('PASS production logo once on desktop/mobile gesture unlock, full heavy action, clicked chest, victory, Lab reset');
}finally{fs.mkdirSync('artifacts/audio',{recursive:true});fs.writeFileSync('artifacts/audio/lifecycle-report.json',JSON.stringify(report,null,2));await browser.close();}

