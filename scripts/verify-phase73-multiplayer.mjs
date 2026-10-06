import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const roles = ['warrior','mage','archer','assassin','bard','alchemist','druid'];
const openingOnly = process.env.PHASE73_OPENING_ONLY === '1';
const report = { rounds: [], traces: [], errors: [] }, pages = [];
const emit = (page,event,data) => page.evaluate(({event,data})=>new Promise((resolve,reject)=>{
  const timer = setTimeout(()=>reject(new Error('Socket ACK timeout: '+event)),15000);
  const ack = value => { clearTimeout(timer); resolve(value); };
  if(data===null) socket.emit(event,ack); else socket.emit(event,data,ack);
}),{event,data});
try {
  for (const role of roles) {
    const page = await browser.newPage();
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({body:'',contentType:'text/css'}));
    page.on('pageerror', e => report.errors.push(role+': '+e.message));
    page.on('console', m => { if(m.type()==='error') report.errors.push(role+': '+m.text()); });
    await page.goto('http://localhost:3012/'); await page.waitForFunction(()=>socket.connected);
    await page.evaluate(() => {
      const originalWait = window.waitForPresentation;
      window.waitForPresentation = (ms,signal,speed=1) => originalWait(ms,signal,speed*8);
      window.__trace = []; window.__queues = [];
      const record = (beat,round=roomState?.battleRound) => {
        window.__trace.push({beat,round,time:performance.now(),timer:roomState?.timerRemaining,
          phase:document.querySelectorAll('.boss-encounter-stage,.round-start-overlay').length,
          curtain:!document.getElementById('screenTransitionCurtain').classList.contains('hidden'),
          controls: !document.getElementById('playerActionCard').inert && !document.getElementById('viewBattle').classList.contains('battle-phase-pending')});
      };
      const boss = window.playBossIntro, round = window.playRoundStartBanner, step = window.playPresentationStep;
      window.playBossIntro = (monster,context={}) => boss(monster,{...context,onTiming(beat,ts){record(beat);context.onTiming?.(beat,ts);}});
      window.playRoundStartBanner = (number,context={}) => round(number,{...context,onTiming(beat,ts){record(beat,number);context.onTiming?.(beat,ts);}});
      window.playPresentationStep = async (data,round) => { record('step_'+data.category,round); await step(data,round); };
      socket.on('battle:presentation_queue', data => window.__queues.push(data));
      const originalEmit = socket.emit.bind(socket);
      socket.emit = (event,...args) => { if(event==='battle:selection_ready') record('selection_ready',args[0].round); if(event==='battle:presentation_complete')record('queue_ack',args[0].round); return originalEmit(event,...args); };
    }); pages.push(page);
  }
  const create = await emit(pages[0],'room:create',{name:'QA-warrior'}); assert(create.success);
  for(let i=1;i<pages.length;i++) assert((await emit(pages[i],'room:join',{code:create.roomCode,name:'QA-'+roles[i],avatar:i===6?'🌿':null})).success);
  for(let i=0;i<pages.length;i++) assert((await emit(pages[i],'player:select_role',{roleKey:roles[i]})).success);
  assert((await emit(pages[0],'game:start',null)).success);
  const actions = [
    ['w_shield','m_blast','a_reload','s_stab','b_buff','alc_fate','dru_summon_wolf'],
    ['basic','m_drain','a_frenzy_reload','s_smoke','b_heal','alc_flask','dru_transform'],
    ['basic','basic','basic','basic','basic','basic','basic']
  ];
  for(let round=1;round<=(openingOnly ? 1 : 3);round++) {
    await Promise.all(pages.map(p=>p.waitForFunction(round=>roomState?.battleRound===round && roomState?.selectionState==='SELECTING' && roomState?.timerRemaining!==null && battleControlsReadyKey===battleRoundKey() && !isProcessingPresentationQueue,round,{timeout:60000})));
    const checks = await Promise.all(pages.map(p=>p.evaluate(round=>{
      const events = window.__trace.filter(e=>e.round===round);
      return { events, ticks:window.__queues.filter(q=>q.round===round && q.queue[0].category==='STATUS_TICK').length, enabled:!document.getElementById('playerActionCard').inert };
    },round)));
    for(const check of checks) {
      const end = check.events.findIndex(e=>e.beat==='round_complete');
      const tick = check.events.findIndex(e=>e.beat==='step_STATUS_TICK');
      const ready = check.events.findIndex(e=>e.beat==='selection_ready');
      assert(end>=0 && tick>end && ready>tick, 'Round exit → status tick → controls ACK');
      assert(check.enabled && check.ticks===1);
      const ack=check.events[ready]; assert(ack.controls && ack.phase===0 && ack.timer===null,'ACK only when controls enabled and server timer still off');
      for(const event of check.events.filter(e=>e.beat!=='selection_ready')) assert.equal(event.timer,null,'Timer off during '+event.beat);
      assert.equal(check.events.filter(e=>e.beat==='round_strip_entry').length,1,'one banner per round');
      if(round===1) assert.equal(check.events.filter(e=>e.beat==='warning_entry').length,1); else assert.equal(check.events.filter(e=>e.beat==='warning_entry').length,0);
      for(const event of check.events.filter(e=>e.beat==='warning_entry')) assert.equal(event.curtain,false,'Generic curtain must not cover warning entry');
    }
    report.rounds.push({round,checks});
    if (openingOnly) {
      for (const page of pages) assert(await page.evaluate(() => window.__queues[0].queue.some(step => step.results?.some(result => result.targetAfter?.hp < result.targetBefore?.hp))), 'Initial status causes authoritative HP damage');
      console.log('PASS real handleBattleEvent from TRANSITION, injected initial bleed, seven viewers ACK and timer');
      break;
    }
    for(let i=0;i<pages.length;i++) assert((await emit(pages[i],'battle:lock',{actionId:actions[round-1][i]})).success,roles[i]+' locks');
    await Promise.all(pages.map(p=>p.waitForFunction(round=>roomState?.battleRound>round && !isProcessingPresentationQueue,round,{timeout:60000})));
    console.log('PASS seven viewers round',round,'banner/tick/controls/timer');
  }
  report.traces = await Promise.all(pages.map(p=>p.evaluate(()=>window.__trace)));
  assert.deepEqual(report.errors,[]);
  console.log(openingOnly ? 'PASS initial encounter, production ACK/timer, zero console errors' : 'PASS seven roles, three poisoned round starts, production ACK/timer, no duplicate intro/banner, zero console errors');
} finally {
  report.traces = await Promise.all(pages.map(p=>p.evaluate(()=>({trace:window.__trace,state:{round:roomState?.battleRound,selection:roomState?.selectionState,timer:roomState?.timerRemaining},phase:Boolean(battlePhaseController),queue:isProcessingPresentationQueue})).catch(()=>null)));
  fs.mkdirSync('artifacts/phase73',{recursive:true}); fs.writeFileSync('artifacts/phase73/'+(openingOnly ? 'actual-encounter.json' : 'multiplayer.json'),JSON.stringify(report,null,2));
  await browser.close();
}
