import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Room} from '../game/Room.js';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={errors:[],checks:[],slashes:[]};fs.mkdirSync('artifacts/phase81',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto('http://localhost:3011/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized&&document.querySelector('#copyRole').options.length===12);
 await page.selectOption('#copyRole','dreamweaver');await page.selectOption('#copySkill','dw_butterfly');
 assert((await page.inputValue('#copyFull')).includes('夢魘成真'));
 await page.fill('#copyShort','測試簡略敘述');await page.fill('#copyFull','測試詳細敘述【夢蝶迷思】');await page.click('#copySave');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#copyRole').options.length===12);await page.selectOption('#copyRole','dreamweaver');await page.selectOption('#copySkill','dw_butterfly');assert.equal(await page.inputValue('#copyShort'),'測試簡略敘述');
 await page.click('#copyReset');assert((await page.inputValue('#copyFull')).includes('美夢化生'));report.checks.push('editor persistence/reset; names fixed');
 await page.evaluate(async()=>{
  labState.speed=1;window.p81Slashes=[];
  window.p81Run=playScene('p8_samurai_tsubame');
 });
 await page.locator('.p81-straight-slash').first().waitFor({state:'visible'});
 await page.screenshot({path:'artifacts/phase81/samurai-straight.png'});assert.equal(await page.locator('.p8-glyph').count(),0);await page.evaluate(()=>window.p81Run);
 // Verify actual production beats independently of Lab's log renderer.
 report.slashes=await page.evaluate(async()=>{
  const scene=PHASE6_LAB_SCENES.p8_samurai_tsubame,step=scene.steps.find(s=>s.actionId==='sa_tsubame'),beats=[];
  await playExpandedCombatPresentation(step,{speed:1,onTiming:(name,data)=>{if(name==='samurai_slash')beats.push({time:performance.now(),angle:data.angle});}});return beats;
 });
 assert.equal(report.slashes.length,4);assert.equal(new Set(report.slashes.map(x=>x.angle)).size,4);
 for(let i=1;i<4;i++)assert(report.slashes[i].time-report.slashes[i-1].time>=280&&report.slashes[i].time-report.slashes[i-1].time<450);
 report.checks.push('four straight cuts at 0.3-second intervals');
 const sock=id=>({id,join(){}}),room=new Room('QA81',sock('p0'),'織夢術士',{to:()=>({emit(){}})});room.selectRole('p0','dreamweaver');const state=room.getClientState();room.clearTimer();
 await page.goto('http://localhost:3011/');await page.waitForFunction(()=>socket.connected&&Object.keys(classesData).length===12);
 await page.evaluate(state=>{roomState=state;myId='p0';currentRoomCode='QA81';renderRoleSelectionGrid();openRoleDetailModal('dreamweaver');},state);
 assert.equal(await page.locator('.role-card-hp').count(),12);assert(!(await page.locator('#roleDetailBody').textContent()).includes('專屬裝備'));
 await page.check('#skillCopyDetailToggle');assert((await page.locator('#roleDetailBody').textContent()).includes('孤影殘夢 (-3人)'));await page.uncheck('#skillCopyDetailToggle');report.checks.push('twelve role HP values; preparation excludes equipment; detail toggle');
 room.state='IN_BATTLE';room.selectionState='SELECTING';room.currentMonster={name:'QA81 守衛',avatar:'/BOSS/Ancient Guardian Golem.webp',hp:500,maxHp:500,attack:10,resistance:null,ultName:'震擊'};const battle=room.getClientState();room.clearTimer();
 await page.evaluate(state=>{hideRoleDetailModal();roomState=state;switchView('battle');renderBattle(getMyPlayer(),true);},battle);
 await page.locator('.boss-encounter-stage').waitFor({state:'visible'});
 assert.equal(await page.locator('#battleLogCard').evaluate(el=>getComputedStyle(el).display),'none');
 assert.equal(await page.locator('#viewBattle').evaluate(el=>getComputedStyle(el).visibility),'hidden');
 assert.equal(await page.locator('.boss-encounter-stage').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(4, 7, 13)');
 await page.waitForFunction(()=>!battlePhaseController&&battleControlsReadyKey===battleRoundKey(),{timeout:30000});
 const bounds=await page.locator('#battleLogCard').boundingBox();assert.equal(bounds.y,100);assert(Math.abs(bounds.y+bounds.height-990)<1);report.checks.push('warning/boss intro hides HUD/log; sidebar top100 bottom10');
 await page.screenshot({path:'artifacts/phase81/battle-sidebar.png'});assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync('artifacts/phase81/browser-report.json',JSON.stringify(report,null,2));await browser.close();}
console.log('PASS Phase 8.1 copy editor, toggle, preparation HP, straight slashes, intro gating and full-height sidebar');
