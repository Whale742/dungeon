import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Room} from '../game/Room.js';
import {CLASSES} from '../game/constants.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={scenes:[],layouts:[],audio:[],errors:[],screenshots:[]};
fs.mkdirSync('artifacts/phase8',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const monitor=async p=>{await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});};
 await monitor(page);await page.goto('http://localhost:3011/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
 await page.locator('#btnTestSound').click();await page.evaluate(()=>{labState.speed=12;window.p8Audio=[];const play=sfxManager.play.bind(sfxManager);sfxManager.play=(key,options={})=>{window.p8Audio.push({key,detune:options.detune,time:performance.now()});return play(key,options);};});
 const ids=process.env.P8_LAYOUT_ONLY==='1'?[]:await page.evaluate(()=>Object.keys(PHASE6_LAB_SCENES).filter(id=>id.startsWith('p8_')));
 for(const id of process.env.P8_LAYOUT_ONLY==='1'?[]:[...ids,'p6_arrow_friendly','p6_alchemy_flask_acid','p6_bard_offkey','p71_sword','p6_mage_blast','p6_archer_hit','p6_assassin_crit','p6_bard_heal','p6_summon_wolf']) {
   await page.evaluate(async id=>{await playScene(id);},id);report.scenes.push(id);
 }
 report.audio=await page.evaluate(()=>window.p8Audio);
 if(process.env.P8_LAYOUT_ONLY!=='1') {assert(report.audio.some(a=>a.key==='bard_skill1'&&a.detune));
 const acid=report.audio.filter(a=>['bottle_throw','bottle_impact','alchemy_skill1'].includes(a.key));assert(acid.length>=3);assert(acid.at(-3).key==='bottle_throw'&&acid.at(-2).key==='bottle_impact'&&acid.at(-1).key==='alchemy_skill1');}
 for(const id of process.env.P8_LAYOUT_ONLY==='1'?[]:['p8_dream_mirror','p8_observe_galaxy','p8_arena_g_sacrifice','p8_samurai_tsubame','p8_sage_solve']) {
   await page.evaluate(id=>{labState.speed=3;window.captureRun=playScene(id);},id);await page.locator('.p8-glyph').waitFor({state:'visible'});
   const path='artifacts/phase8/'+id+'.png';await page.screenshot({path});report.screenshots.push(path);await page.evaluate(()=>window.captureRun);
 }
 const socket=id=>({id,join(){}}),room=new Room('QA',socket('p0'),'智者',{to:()=>({emit(){}})});
 room.addPlayer(socket('p1'),'同伴');room.selectRole('p0','sage');room.selectRole('p1','samurai');room.state='IN_BATTLE';room.selectionState='SELECTING';room.floor=8;room.battleRound=1;room.battlePresentationId='qa-8';room.currentMonster={name:'遠古守衛石像',avatar:'/BOSS/Ancient Guardian Golem.webp',hp:500,maxHp:500,attack:10,resistance:null,ultName:'巨岩震擊',desc:'戰鬥驗證'};
 Object.assign(room.players.p0,{sageX:80,sageOperand:16,sagePhase:'solve'});for(let i=0;i<6;i++)room.addLog('完整戰鬥紀錄 '+i+'，只顯示最新五筆並保留完整內容。');const state=room.getClientState();state.timerRemaining=30;room.clearTimer();
 const app=await browser.newPage();await monitor(app);await app.goto('http://localhost:3011/');await app.waitForFunction(()=>socket.connected && Object.keys(classesData).length===12);
 await app.bringToFront();
 for(const width of [1440,1280,1024,390]) {
   await app.setViewportSize({width,height:1000});await app.evaluate(state=>{
     roomState=structuredClone(state);myId='p0';currentRoomCode='QA';presentationManager.markPlayed('BOSS_INTRO_'+battleSceneKey(roomState));lastAnnouncedBattleRound=1;battleControlsReadyKey=battleRoundKey();switchView('battle');renderBattle(roomState.players[0],true);renderMyActionBar(roomState.players[0]);renderLogs();
   },state);await app.screenshot({path:"artifacts/phase8/debug-before.png"});await app.waitForTimeout(800);
   const metrics=await app.evaluate(()=>{
     const log=document.getElementById('battleLogCard').getBoundingClientRect(),main=document.getElementById('viewBattle').getBoundingClientRect();
     return {log:{x:log.x,right:log.right,width:log.width},main:{x:main.x,right:main.right},overflow:document.documentElement.scrollWidth>innerWidth,opacities:Array.from(document.querySelectorAll('#combatLogWindow .log-line')).map(l=>Number(getComputedStyle(l).opacity)),debug:Array.from(document.querySelectorAll("#combatLogWindow .log-line")).map(l=>({style:l.getAttribute("style"),class:l.className,animation:getComputedStyle(l).animation,anims:l.getAnimations().map(a=>({time:a.currentTime,state:a.playState})),visible:document.visibilityState,parentDisplay:getComputedStyle(l.parentNode.parentNode).display,battleClass:document.getElementById("viewBattle").className})),stateHeight:document.getElementById('compactRoleState').getBoundingClientRect().height};
   });report.layouts.push({width,...metrics});assert(!metrics.overflow);assert.deepEqual(metrics.opacities,[.2,.4,.6,.8,1]);assert(metrics.stateHeight<=54);
   assert(await app.evaluate(()=>{const box=document.getElementById('combatLogWindow'),lines=[...box.children],rect=box.getBoundingClientRect();return lines.every(line=>line.getBoundingClientRect().height<=36.5 && getComputedStyle(line).paddingTop==='0px') && lines.at(-1).getBoundingClientRect().bottom<=rect.bottom;}),'all five two-line entries fit without padding clipping');
   if(width>=1280)assert(metrics.log.right+10<=metrics.main.x,'desktop log reserves separate HUD space');
   else {assert(metrics.log.right<=1);await app.locator('#logDrawerHandle').click();await app.waitForTimeout(300);assert((await app.locator('#battleLogCard').boundingBox()).x>=-.5);await app.locator('#logDrawerHandle').click();await app.waitForTimeout(300);}
   const path='artifacts/phase8/layout-'+width+'.png';await app.screenshot({path});report.screenshots.push(path);
   if(width===390){await app.locator('#playerActionCard').scrollIntoViewIfNeeded();const skills='artifacts/phase8/layout-390-skills.png';await app.screenshot({path:skills});report.screenshots.push(skills);}
 }
 assert(await app.evaluate(()=>{const box=document.getElementById('combatLogWindow'),first=box.children[0];renderLogs();return box.children[0]===first;}));
 for(const n of [1,3,5,6]) {
   const actual=await app.evaluate(n=>{const box=document.getElementById('combatLogWindow');renderRecentBattleLogs(box,Array.from({length:n},(_,i)=>({id:'test'+i,text:'Entry '+i})));return Array.from(box.children).map(l=>Number(l.style.getPropertyValue('--log-opacity')));},n);
   assert.deepEqual(actual,Array.from({length:Math.min(n,5)},(_,i)=>1-(Math.min(n,5)-1-i)*.2));
 }
 for(const role of Object.keys(CLASSES)) {
   await app.evaluate(role=>{roomState.players[0].role=role;roomState.players[0].availableSkills=classesData[role].skills;renderMyActionBar(roomState.players[0]);openRoleDetailModal(role);},role);
   assert(await app.locator('#roleDetailBody').textContent());await app.evaluate(()=>hideRoleDetailModal());
 }
 await page.evaluate(()=>resetLab());assert.deepEqual(report.errors,[]);
} finally {fs.writeFileSync('artifacts/phase8/'+(process.env.P8_LAYOUT_ONLY==='1'?'layout-report.json':'browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log('PASS',report.scenes.length,'scenes, four widths, twelve role details; no console errors');
