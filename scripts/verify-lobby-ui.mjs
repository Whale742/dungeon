import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const port=3096,origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';for(const s of [server.stdout,server.stderr])s.on('data',v=>log+=v);
let browser;
const folder='artifacts/lobby-ui';fs.mkdirSync(folder,{recursive:true});
const report={checks:[],errors:[]};
try {
  for(let n=0;n<120;n++){try{if((await fetch(origin+'/api/studio/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin);
  await page.addStyleTag({content:'#viewLobby { animation: none !important; }'});
  await page.waitForFunction(()=>Object.keys(classesData).length===13);
  assert.equal(await page.locator('.recruit-code').textContent(),await page.evaluate(()=>socket.id));
  await page.evaluate(()=>StudioContent.load());
  await page.evaluate(()=>{localStorage.setItem('dungeon_custom_avatar','/photo/Sage.webp');updateEntryAvatarPreview();});
  assert((await page.evaluate(()=>localStorage.getItem('dungeon_custom_avatar'))).includes('/storage/v1/object/public/game-assets/'));
  const recruit=await page.locator('.recruit-card').boundingBox();
  assert(Math.abs(recruit.width/recruit.height-210/297)<.01);
  assert.equal(await page.locator('.bgm-control').isVisible(),false);
  assert.equal(await page.locator('.app-header h1').evaluate(n=>getComputedStyle(n).color),'rgb(36, 23, 15)');
  assert((await page.locator('.app-header').evaluate(n=>getComputedStyle(n).backgroundImage)).includes('radial-gradient'));
  await page.screenshot({path:folder+'/recruit.png'});
  report.checks.push('A4 recruit card and hidden lobby audio controls');
  await page.evaluate(()=>{openProfileModal();openAvatarChoiceModal();toggleHeroAvatarList();});
  const avatars=await page.locator('#heroAvatarOptionsGrid img').evaluateAll(nodes=>nodes.map(n=>({src:n.src,name:n.alt})));
  assert.equal(avatars.length,13);
  for(const a of avatars)assert(a.name==='聖騎士'?a.src.endsWith('/photo/Paladin.webp'):a.src.includes('/storage/v1/object/public/game-assets/'),a.name+' should use storage');
  await page.waitForFunction(()=>[...document.querySelectorAll('#heroAvatarOptionsGrid img')].every(n=>n.complete&&n.naturalWidth>0));
  await page.locator('#heroAvatarOptionsGrid [data-role=sage]').click();
  assert((await page.evaluate(()=>localStorage.getItem('dungeon_custom_avatar'))).includes('/storage/v1/object/public/game-assets/'));
  await page.evaluate(()=>{closeProfileModal();openAvatarChoiceModal();if(document.getElementById('heroAvatarGridContainer').classList.contains('hidden'))toggleHeroAvatarList();});
  await page.waitForTimeout(350);
  await page.screenshot({path:folder+'/avatars.png'});
  await page.locator('#heroAvatarOptionsGrid [data-role=samurai]').click();
  assert((await page.evaluate(()=>localStorage.getItem('dungeon_custom_avatar'))).includes('/storage/v1/object/public/game-assets/'));
  report.checks.push('All 12 cloud portraits load, Paladin remains local, Sage/Samurai save cloud URLs');
  await page.evaluate(()=>{closeProfileModal();document.getElementById('directConnectModal').classList.remove('hidden');});
  const inputStyle=await page.locator('#inputRoomCode').evaluate(n=>({background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color}));
  assert.equal(inputStyle.background,'rgb(255, 253, 247)');
  assert((await page.locator('#btnJoinRoom').boundingBox()).height>=46);
  assert((await page.locator('#avatarChoiceModal .modal-actions button').evaluate(n=>parseFloat(getComputedStyle(n).paddingTop)))>=12);
  await page.screenshot({path:folder+'/direct-connect.png'});
  await page.evaluate(()=>document.getElementById('directConnectModal').classList.add('hidden'));
  await page.locator('#inputPlayerName').fill('介面測試');
  await page.locator('#btnSubmitRecruit').click();
  await page.evaluate(()=>openClassArchiveFromMenu());
  await page.waitForTimeout(400);
  const measure=()=>page.evaluate(()=>Object.fromEntries(['.role-command-panel','.role-description','.role-portrait-choice'].map(s=>{const r=document.querySelector('#viewLobby '+s).getBoundingClientRect();return [s,{height:r.height,bottom:r.bottom,width:r.width}]})));
  const initial=await measure();report.archiveBounds=initial;await page.screenshot({path:folder+'/archive-desktop.png'});assert.equal(initial['.role-portrait-choice'].height,100);assert.equal(initial['.role-portrait-choice'].width,100);assert(Math.abs(initial['.role-command-panel'].bottom-984)<1);
  for(const role of ['sage','samurai','druid','paladin']) {
    await page.locator('#roleSelectionGrid [data-role='+role+']').click();
    for(const tab of ['passive','0','1','2']) {
      await page.locator('[data-role-tab="'+tab+'"]').click();
      assert.equal((await measure())['.role-description'].height,initial['.role-description'].height);
    }
  }
  await page.screenshot({path:folder+'/archive-desktop.png'});
  report.checks.push('Archive ends 16px above viewport bottom; role/skill switching preserves description size');
  await page.evaluate(()=>closeClassArchiveToMenu());
  await page.locator('#btnCreateRoom').click();
  await page.waitForFunction(()=>document.getElementById('viewLobby').classList.contains('active')&&!document.getElementById('viewLobby').classList.contains('archive-mode'));
  await page.locator('#roleSelectionGrid [data-role=sage]').click();
  await page.waitForFunction(()=>roomState.players.some(p=>p.role==='sage'));
  report.memberAvatar=await page.locator('#lobbyMemberList img').evaluateAll(nodes=>nodes.map(n=>({src:n.src,complete:n.complete,width:n.naturalWidth})));
  await page.waitForFunction(()=>[...document.querySelectorAll('#lobbyMemberList img')].every(n=>n.complete&&n.naturalWidth>0));
  await page.waitForTimeout(400);
  const room=await measure();assert(Math.abs(room['.role-command-panel'].bottom-984)<1);
  const team=await page.locator('#viewLobby .team-card').boundingBox();assert(Math.abs(team.y+team.height-984)<1);
  assert.equal(await page.locator('#btnLobbyExitRoom span').evaluate(n=>getComputedStyle(n).color),'rgb(255, 244, 234)');
  assert(await page.locator('#btnLobbyExitRoom svg').evaluate(n=>n.getBBox().width>0&&n.getBBox().height>0));
  assert.equal(await page.locator('.app-header h1').evaluate(n=>getComputedStyle(n).color),'rgb(36, 23, 15)');
  assert.equal(await page.locator('.role-choice-check').evaluate(n=>getComputedStyle(n).position),'absolute');
  await page.evaluate(()=>{
    lobbyRoleUi.data.players.push({id:'qa-teammate',name:'一起出征的隊友',role:'sage'});
    renderRolePortraitStrip();
  });
  assert.equal(await page.locator('.role-choice-occupant').evaluate(n=>getComputedStyle(n).position),'absolute');
  assert.equal((await measure())['.role-portrait-choice'].height,100);
  await page.screenshot({path:folder+'/room-desktop.png'});
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.screenshot({path:folder+'/room-'+viewport.width+'.png'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert(Math.abs((await measure())['.role-command-panel'].bottom-(viewport.height-16))<1);
    assert.equal((await measure())['.role-portrait-choice'].height,viewport.width<560?70:100);
  }
  report.checks.push('Room panels, badges, button colors, and desktop/mobile bounds');
  await page.evaluate(()=>exitRoomToLobbyMenu());
  await page.evaluate(()=>openClassArchiveFromMenu());
  assert.equal(await page.locator('.role-choice-check').count(),0);
  assert.equal(await page.locator('.role-choice-occupant').count(),0);
  assert.equal(await page.locator('.role-portrait-choice[aria-pressed=true]').count(),0);
  await page.locator('#roleSelectionGrid [data-role=samurai]').click();
  assert.equal(await page.locator('.role-choice-check').count(),0);
  report.checks.push('Leaving a room clears all selected and occupied archive badges; archive browsing does not select a room role');
  const editor=await browser.newPage();await editor.goto(origin+'/edit');
  await editor.locator('#editorCategory').selectOption('recruit');
  await editor.waitForFunction(()=>document.querySelectorAll('#editorList button').length===11);
  await editor.locator('#editorList button').filter({hasText:'招募檄文'}).click();
  await editor.locator('#editorForm textarea').fill('測試招募文案：<script>僅顯示文字</script>');
  assert((await editor.locator('#editorPreview').textContent()).includes('<script>僅顯示文字</script>'));
  await editor.screenshot({path:folder+'/editor.png'});
  // Verify the actual recruit page consumes published copy without changing shared cloud data.
  await page.evaluate(()=>{
    StudioContent.state.data.story_copies.push({story_key:'entry.recruit.title',body:'自訂招募令',status:'published'});
    RecruitCopy.render();
  });
  assert.equal(await page.locator('.recruit-main-title').textContent(),'自訂招募令');
  report.checks.push('Editor lists all 11 editable recruit fields; preview treats HTML as text; recruit consumes published text and live backend ID');
  assert.deepEqual(report.errors,[]);
} catch(error) {report.failure=error.stack;report.serverLog=log;process.exitCode=1;}
finally {await browser?.close();server.kill();fs.writeFileSync(folder+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
