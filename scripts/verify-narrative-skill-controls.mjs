import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Room } from '../game/Room.js';
import { ENCOUNTERS } from '../game/constants.js';

const { chromium } = createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', args:['--autoplay-policy=no-user-gesture-required'] });
const output = 'artifacts/narrative-skill-controls';
fs.mkdirSync(output, { recursive:true });
const errors = [], report = {};
try {
  const context = await browser.newContext({ viewport:{ width:1440, height:900 } });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body:'', contentType:'text/css' }));
  const leader = await context.newPage(), member = await context.newPage();
  for (const page of [leader,member]) {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:3026');
    await page.waitForFunction(() => typeof socket !== 'undefined' && socket.connected);
  }
  const emit = (page, event, data) => page.evaluate(({ event,data }) => new Promise(resolve => data === null ? socket.emit(event,resolve) : socket.emit(event,data,resolve)), { event,data });
  const created = await emit(leader,'room:create',{ name:'角鬥士測試' });assert(created.success);
  assert((await emit(member,'room:join',{ code:created.roomCode, name:'智者測試' })).success);
  assert((await emit(leader,'player:select_role',{ roleKey:'gladiator' })).success);
  assert((await emit(member,'player:select_role',{ roleKey:'sage' })).success);
  assert((await emit(member,'room:toggle_ready',null)).success);
  assert((await emit(leader,'game:start',null)).success);
  await leader.waitForSelector('#btnSkipPrologue:visible');
  await leader.locator('#gameTitleContainer').click();
  assert.equal(await leader.evaluate(() => roomState.state),'PROLOGUE');
  await leader.screenshot({ path:output+'/prologue-controls.png' });
  await leader.locator('#btnSkipPrologue').click();
  await Promise.all([leader,member].map(page => page.waitForFunction(() => roomState?.state === 'CHOOSING_ROUTE')));
  report.skip = await leader.evaluate(() => ({ floor:roomState.floor, narrating:roomState.isNarrating,
    floorVisible:!elements.floorIntroOverlay.classList.contains('hidden'),
    skipHidden:document.getElementById('btnSkipPrologue').classList.contains('hidden'), speed:narrativeTextSpeed() }));
  assert.deepEqual(report.skip,{ floor:1,narrating:true,floorVisible:true,skipHidden:true,speed:1 });
  await leader.screenshot({ path:output+'/first-floor-after-skip.png' });
  await leader.waitForFunction(() => !document.getElementById('btnNarrativeSpeed').disabled);
  await leader.locator('#btnNarrativeSpeed').click();
  await member.waitForFunction(() => narrativeTextSpeed() === 20);
  assert.equal(await leader.evaluate(() => narrativeTextSpeed()),20);
  await leader.locator('#btnNarrativeSpeed').click();
  await member.waitForFunction(() => narrativeTextSpeed() === 1);
  report.multiplayerToggle = true;
  await leader.waitForFunction(() => !roomState.isNarrating,{},{ timeout:30000 });
  report.choiceSpeed = await leader.evaluate(() => narrativeTextSpeed());assert.equal(report.choiceSpeed,1);
  await leader.evaluate(() => { socket.off('room:update'); socket.disconnect(); });

  // Use authoritative Room snapshots to inspect both fields and both Sage turns.
  const id = await leader.evaluate(() => myId);
  const room = new Room('COPY_TEST',{ id,join(){} },'角鬥士',{ to:() => ({ emit(){} }) });
  room.selectRole(id,'gladiator');room.state='IN_BATTLE';room.floor=8;room.battleRound=2;room.selectionState='SELECTING';
  const hero = room.players[id];
  async function showSkills() {
    const state=room.getClientState();
    await leader.evaluate(state => {
      routePresentationController?.abort();prologueController?.abort();
      roomState=state;syncNarrativeControls(state);switchView('battle');
      revealDestinationView('battle');
      elements.views.battle.classList.remove('battle-phase-pending');
      document.getElementById('app').inert=false;document.getElementById('playerActionCard').inert=false;
      currentPendingAction=null;
      renderMyActionBar(state.players.find(p=>p.id===myId));
    },state);
    return leader.locator('#mySkillsRow .skill-popover-desc').allTextContents();
  }
  report.outside = await showSkills();assert(report.outside[1].includes('最大生命的20%'));assert(!report.outside[1].includes('血殺重擊'));
  hero.arenaActive=true;hero.cooldowns.g_arena=3;room.arena={ playerId:id,originalMaxHp:85,until:2 };
  report.inside = await showSkills();
  assert.equal(await leader.locator('#mySkillsRow .skill-btn-title > span').nth(1).textContent(),'血殺重擊');
  assert(!report.inside[1].includes('獻祭'));assert(!report.inside[2].includes('挑戰書'));
  await leader.locator('#mySkillsRow .skill-detail-trigger').nth(1).click();
  await leader.evaluate(() => openRoleDetailModal('gladiator'));
  assert((await leader.locator('.role-detail-skill-title').nth(1).textContent()).includes('血殺重擊'));
  assert(!(await leader.locator('.role-detail-skill-desc').nth(1).textContent()).includes('獻祭'));
  await leader.evaluate(() => elements.roleDetailModal.classList.add('hidden'));
  await leader.screenshot({ path:output+'/gladiator-arena-skill.png' });
  room.arena=null;hero.arenaActive=false;
  // selectRole is lobby-only; build the Sage snapshot from a separate Room.
  const sageRoom=new Room('SAGE_COPY',{ id,join(){} },'智者',{ to:() => ({ emit(){} }) });sageRoom.selectRole(id,'sage');
  for(const phase of ['hypothesis','solve']) {
    const sage=sageRoom.players[id];sage.sagePhase=phase;
    const state=sageRoom.getClientState();
    state.state='IN_BATTLE';
    await leader.evaluate(state => {roomState=state;renderMyActionBar(state.players[0]);setSkillCopyDetailed(true);renderMyActionBar(state.players[0]);},state);
    report[phase]=await leader.locator('#mySkillsRow .skill-popover-desc').allTextContents();
    for(const desc of report[phase]) {
      assert(desc.includes(phase==='solve'?'【求解階段】':'【假設階段】'));
      assert(!desc.includes(phase==='solve'?'【假設階段】':'【求解階段】'));
      assert.equal(desc.includes('推演成功'),phase==='solve');
    }
    await leader.locator('#mySkillsRow .skill-detail-trigger').nth(2).click();
    await leader.screenshot({ path:output+'/sage-'+phase+'-skill.png' });
  }
  report.bossBeats=await leader.evaluate(async monster => {
    const beats={},controller=new AbortController();
    window.narrativeSpeedScale=999;setNarrativeAcceleration(true);
    await playBossIntro({ ...monster, encounterStory:'小隊沿著小徑攀爬，齒輪瘋狂運轉，一尊古代魔偶破壁現身！' }, {
      signal:controller.signal, speed:20,
      onTiming:name=>{beats[name]=performance.now();},
      playSound:(name,options)=>{beats[name+'_sound']=performance.now();return sfxManager.play(name,options);}
    });
    delete window.narrativeSpeedScale;
    return { warningDelay:beats.warning_entry-beats.warning_audio_start,
      entranceDelay:beats.boss_boom-beats.boss_entrance_sound };
  },ENCOUNTERS.find(monster=>monster.name==='古代守護魔偶'));
  assert(report.bossBeats.warningDelay>=2900&&report.bossBeats.warningDelay<3600);
  assert(report.bossBeats.entranceDelay>=950&&report.bossBeats.entranceDelay<1800);
  assert.deepEqual(errors,[]);report.errors=errors;
  fs.writeFileSync(output+'/report.json',JSON.stringify(report,null,2));
  console.log('PASS explicit skip, first-floor intro, two-client speed toggle, arena/Sage copy and fixed Boss audio beats; no browser errors');
} finally { await browser.close(); }
