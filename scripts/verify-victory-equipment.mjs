import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://localhost:3019');await page.waitForFunction(()=>typeof socket!=='undefined'&&socket.connected&&Object.keys(classesData).length>0);
 await page.evaluate(async()=>{
  const original=playVictoryPresentation;playVictoryPresentation=(victory,context)=>original(victory,{...context,speed:30});
  bgmManager.bossDefeated=()=>new Promise(()=>{});
  await new Promise(resolve=>socket.emit('room:create',{name:'QA'},resolve));
  await new Promise(resolve=>socket.emit('player:select_role',{roleKey:'warrior'},resolve));
  await new Promise(resolve=>socket.emit('game:start',resolve));
 });
 await page.waitForFunction(()=>roomState?.victoryInteractionReady,{timeout:30000});
 await page.locator('#btnEquipItem').click({timeout:5000});
 await page.waitForFunction(()=>roomState.state==='BATTLE_VICTORY'&&!roomState.pendingDrop,{timeout:5000});
 assert.equal(await page.locator('.presentation-victory-continue').isDisabled(),false);
 await page.locator('.presentation-victory-continue').click({timeout:5000});
 await page.waitForFunction(()=>roomState.state==='CHOOSING_ROUTE'&&roomState.floor===2,{timeout:5000});
 assert.deepEqual(errors,[]);console.log('Real server equip -> continue -> floor 2 passed');
}finally{await browser.close();}
