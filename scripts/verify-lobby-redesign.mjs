import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const dir='artifacts/lobby-redesign',report={errors:[],layouts:[]};fs.mkdirSync(dir,{recursive:true});
const emit=(page,event,data)=>page.evaluate(({event,data})=>new Promise(resolve=>data===null?socket.emit(event,resolve):socket.emit(event,data,resolve)),{event,data});
try {
  const pages=[];
  for(let i=0;i<2;i++){
    const page=await browser.newPage({viewport:{width:1440,height:1000}});pages.push(page);
    page.on('pageerror',e=>report.errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    await page.goto('http://localhost:3011/');await page.waitForFunction(()=>socket.connected&&Object.keys(classesData).length===12);
  }
  const [leader,member]=pages;
  await leader.fill('#inputPlayerName','遠征隊長');await leader.click('#btnCreateRoom');
  await leader.waitForFunction(()=>roomState?.state==='LOBBY');
  const code=await leader.evaluate(()=>currentRoomCode);
  await member.fill('#inputPlayerName','月影');await member.fill('#inputRoomCode',code);await member.click('#btnJoinRoom');
  await member.waitForFunction(()=>roomState?.players.length===2);await leader.waitForFunction(()=>roomState?.players.length===2);
  assert.equal(await leader.locator('.role-portrait-choice').count(),12);
  assert(await leader.locator('#lobbyRoleDetailed').isChecked());
  assert((await leader.locator('.role-copy-toggle').textContent()).startsWith('詳細'));
  await leader.locator('.role-copy-toggle').click();assert(!(await leader.locator('#lobbyRoleDetailed').isChecked()));
  await leader.locator('.role-copy-toggle').click();assert(await leader.locator('#lobbyRoleDetailed').isChecked());
  await member.click('[data-role="stargazer"]');await member.waitForFunction(()=>getMyPlayer()?.role==='stargazer');
  await leader.waitForSelector('[data-role="stargazer"].is-occupied');
  assert.equal(await leader.locator('[data-role="stargazer"] .role-choice-occupant').textContent(),'月影');
  assert(await leader.locator('#btnStartGame').isDisabled());
  await leader.click('[data-role="stargazer"]');await leader.waitForFunction(()=>getMyPlayer()?.role==='stargazer');
  assert.equal(await leader.locator('#lobbyRoleName').textContent(),'觀星者');
  report.sharedRolePreserved=await leader.evaluate(()=>roomState.players.every(p=>p.role==='stargazer'));
  assert(report.sharedRolePreserved);
  const panelBefore=await leader.locator('.role-command-panel').boundingBox();
  await leader.click('[data-role="dreamweaver"]');await leader.waitForFunction(()=>getMyPlayer()?.role==='dreamweaver');
  await leader.click('[data-role-tab="2"]');
  assert.equal(await leader.locator('#lobbySkillName').textContent(),'偽造殘夢');
  await leader.locator('#lobbyRoleDetailed').check({force:true});
  assert((await leader.locator('#lobbySkillCopy').textContent()).includes('百鬼夜行'));
  assert.equal((await leader.locator('.role-command-panel').boundingBox()).height,panelBefore.height);
  report.radar=await leader.evaluate(()=>Object.fromEntries(LOBBY_ROLE_ORDER.map(role=>[role,LOBBY_ROLE_PROFILES[role].radar])));
  assert.deepEqual(report.radar.dreamweaver,['B','B','S','A','A']);assert.deepEqual(report.radar.sage,['A','C','B','C','S']);
  const before=await leader.locator('.radar-shape').getAttribute('points');
  await leader.click('[data-role="sage"]');
  const middle=await leader.locator('.radar-shape').getAttribute('points');await leader.waitForTimeout(350);
  const after=await leader.locator('.radar-shape').getAttribute('points');assert.notEqual(before,after);report.morph={before,middle,after};
  for(const viewport of [{width:1440,height:1000},{width:1280,height:900},{width:768,height:1024},{width:390,height:844}]){
    await leader.setViewportSize(viewport);await leader.waitForTimeout(150);
    const layout=await leader.evaluate(()=>{
      const panel=document.querySelector('.role-command-panel').getBoundingClientRect(),team=document.querySelector('.team-card').getBoundingClientRect(),copy=document.getElementById('lobbyRoleDescription'),strip=document.getElementById('roleSelectionGrid');
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,panel:{x:panel.x,y:panel.y,width:panel.width,height:panel.height},team:{x:team.x,y:team.y,height:team.height},copyHeight:copy.clientHeight,copyScroll:copy.scrollHeight,stripCount:strip.children.length,hpCount:document.querySelectorAll('.role-hp-meta').length,equipmentVisible:document.querySelector('.role-command-panel').textContent.includes('專屬裝備'),overflow:Array.from(document.querySelectorAll('#viewLobby *')).filter(n=>n.getBoundingClientRect().right>innerWidth).map(n=>({class:n.className,id:n.id,right:n.getBoundingClientRect().right})).slice(0,25)};
    });
    assert(layout.documentWidth<=viewport.width);assert.equal(layout.stripCount,12);assert.equal(layout.hpCount,1);assert(!layout.equipmentVisible);assert(layout.copyHeight>60);
    if(viewport.width>1200){assert(Math.abs(layout.panel.width/layout.panel.height-16/9)<.02);assert(Math.abs(layout.team.height-layout.panel.height)<3);}
    report.layouts.push(layout);await leader.screenshot({path:`${dir}/${viewport.width}.png`,fullPage:true});
  }
  await leader.setViewportSize({width:1440,height:1000});
  assert((await emit(leader,'player:rename',{newName:'遠征隊長測試超長玩家名稱'})).success);
  // Stress only the roster layout with ten entries; real ready/start behavior uses two sockets.
  await leader.evaluate(()=>{
    window.rosterOriginal=structuredClone(roomState);
    const roles=LOBBY_ROLE_ORDER;
    for(let i=0;i<8;i++)roomState.players.push({...structuredClone(getMyPlayer()),id:'roster-'+i,name:'超長冒險者名稱測試'+i,role:roles[i],isReady:i%2===0});
    renderLobby(getMyPlayer(),true);
  });
  report.roster=[];
  for(const viewport of [{width:1440,height:1000},{width:1100,height:900},{width:390,height:844}]){
    await leader.setViewportSize(viewport);await leader.waitForTimeout(100);
    const roster=await leader.evaluate(()=>{
      const list=document.getElementById('lobbyMemberList'),box=list.getBoundingClientRect(),panel=document.querySelector('.team-card').getBoundingClientRect();
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,count:list.children.length,clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,itemOverflow:Array.from(list.children).some(n=>n.getBoundingClientRect().right>panel.right),namesVertical:Array.from(list.querySelectorAll('.member-name-text')).some(n=>n.getBoundingClientRect().height>25),footerInside:document.querySelector('.lobby-footer').getBoundingClientRect().bottom<=panel.bottom};
    });
    assert.equal(roster.count,10);assert.equal(roster.documentWidth,viewport.width);assert(!roster.itemOverflow);assert(!roster.namesVertical);assert(roster.footerInside);assert(roster.scrollHeight>roster.clientHeight);
    report.roster.push(roster);await leader.screenshot({path:`${dir}/roster-${viewport.width}.png`,fullPage:true});
  }
  await leader.setViewportSize({width:1100,height:900});await leader.click('#btnTriggerInlineRename');
  assert(await leader.locator('#inputInlineRename').isVisible());
  report.renameWithinPanel=await leader.evaluate(()=>document.querySelector('.member-inline-rename-form').getBoundingClientRect().right<=document.querySelector('.team-card').getBoundingClientRect().right);
  assert(report.renameWithinPanel);await leader.click('#btnCancelInlineRename');
  await leader.evaluate(()=>{roomState=window.rosterOriginal;renderLobby(getMyPlayer(),true);});
  await leader.setViewportSize({width:1440,height:1000});
  await member.click('#btnToggleReady');await leader.waitForFunction(()=>roomState.players.find(p=>p.id!==myId).isReady);
  assert(await leader.locator('#btnStartGame').isEnabled());
  await member.click('#btnToggleReady');await leader.waitForFunction(()=>!roomState.players.find(p=>p.id!==myId).isReady);
  assert(await leader.locator('#btnStartGame').isDisabled());
  await member.click('#btnToggleReady');await leader.waitForFunction(()=>roomState.players.find(p=>p.id!==myId).isReady);
  await leader.click('#btnStartGame');await leader.waitForFunction(()=>roomState.state!=='LOBBY');
  report.started=await leader.evaluate(()=>roomState.state);assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));await browser.close();}
