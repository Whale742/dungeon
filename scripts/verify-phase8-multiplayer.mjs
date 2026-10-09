import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={groups:[],errors:[]};
const emit=(page,event,data)=>page.evaluate(({event,data})=>new Promise((resolve,reject)=>{setTimeout(()=>reject(Error("Socket ACK timeout: "+event)),15000);if(data===null)socket.emit(event,resolve);else socket.emit(event,data,resolve);}),{event,data});
try {
 for(const roles of [['dreamweaver','stargazer','gladiator','samurai','sage'],['warrior','mage','archer','assassin','bard','alchemist','druid']]) {
  const pages=[];
  for(const role of roles) {
   const page=await browser.newPage({viewport:{width:role==='sage'?390:1440,height:1000}});pages.push(page);
   await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));page.on('pageerror',e=>report.errors.push(role+': '+e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(role+': '+m.text());});
   await page.goto('http://localhost:3013/');await page.waitForFunction(()=>socket.connected&&Object.keys(classesData).length===12);
   await page.evaluate(()=>{const wait=window.waitForPresentation;window.waitForPresentation=(ms,signal,speed=1)=>wait(ms,signal,speed*12);window.qaQueues=[];window.qaAcks=[];socket.on('battle:presentation_queue',data=>window.qaQueues.push(data));const emit=socket.emit.bind(socket);socket.emit=(event,...args)=>{if(event==='battle:presentation_complete')window.qaAcks.push(args[0]);return emit(event,...args);};});
  }
  const created=await emit(pages[0],'room:create',{name:'QA-'+roles[0]});assert(created.success);
  for(let i=1;i<pages.length;i++)assert((await emit(pages[i],'room:join',{code:created.roomCode,name:'QA-'+roles[i]})).success);
  for(let i=0;i<pages.length;i++)assert((await emit(pages[i],'player:select_role',{roleKey:roles[i]})).success);
  assert((await emit(pages[0],'game:start',null)).success);
  const newer=roles[0]==='dreamweaver';
  const actions=newer?[
    ['dw_butterfly','sg_observe','g_arena','sa_cut','basic'],
    ['skip','skip','g_sacrifice','skip','skip'],
    ['dw_false_dream','sg_clock','g_sacrifice','basic','sge_deduce'],
    ['basic','basic','basic','sa_tsubame','basic'],
    ['basic','basic','basic','basic','sge_induce']
  ]:[['w_shield','m_blast','a_shot','s_stab','b_buff','alc_fate','dru_summon_wolf'],['w_strike','m_drain','a_rain','s_smoke','b_heal','alc_flask','dru_transform'],Array(7).fill('basic')];
  const rounds=[];
  for(let round=1;round<=actions.length;round++) {
   await Promise.all(pages.map(p=>p.waitForFunction(round=>roomState?.battleRound===round&&roomState?.selectionState==='SELECTING'&&roomState.timerRemaining!==null&&battleControlsReadyKey===battleRoundKey()&&!isProcessingPresentationQueue,round,{timeout:90000})));
   const before=await Promise.all(pages.map(p=>p.evaluate(()=>({role:getMyPlayer().role,hp:getMyPlayer().hp,blocked:getMyPlayer().arenaBlocked,locked:getMyPlayer().isLocked,soul:getMyPlayer().soul,resource:getMyPlayer().resourceSummary,timer:roomState.timerRemaining,cardHeight:document.getElementById('playerActionCard').getBoundingClientRect().height}))));
   for(let i=0;i<pages.length;i++) {
     if(before[i].hp<=0||before[i].blocked||before[i].locked)continue;
     const target=actions[round-1][i]==='dw_butterfly'?await pages[i].evaluate(()=>myId):null;
     const result=await emit(pages[i],'battle:lock',{actionId:actions[round-1][i],targetPlayerId:target});assert(result.success,roles[i]+': '+JSON.stringify(result));
   }
   rounds.push({round,before});
  }
  await Promise.all(pages.map(p=>p.waitForFunction(round=>roomState?.battleRound===round&&!isProcessingPresentationQueue&&roomState.selectionState==='SELECTING',actions.length+1,{timeout:90000})));
  const results=await Promise.all(pages.map(p=>p.evaluate(()=>({role:getMyPlayer().role,acks:window.qaAcks,queues:window.qaQueues.map(q=>({round:q.round,steps:q.queue.map(s=>({type:s.type,category:s.category,role:s.sourceRole,id:s.actionId,hits:s.results?.length,...(s.actionId==='sge_equation'?{outcome:s.outcome}: {})}))})),round:roomState.battleRound,monsterHp:roomState.currentMonster.hp,players:roomState.players.map(p=>({role:p.role,hp:p.hp,maxHp:p.maxHp,...(p.role==='sage'?{sageX:p.sageX,sageDebt:p.sageDebt}: {})}))}))));
  assert(results.every(r=>r.monsterHp===results[0].monsterHp));assert(results.every(r=>JSON.stringify(r.players)===JSON.stringify(results[0].players)));assert(results.every(r=>r.acks.length>=actions.length));
  if(newer) {
    const all=results[0].queues.flatMap(q=>q.steps);assert(all.some(s=>s.id==='sa_tsubame'&&s.hits===4));assert(all.some(s=>s.id==='sge_equation'));
    const equations=all.filter(s=>s.id==='sge_equation');assert.equal(equations.length,2);
    for(const peer of results)assert.deepEqual(peer.queues.flatMap(q=>q.steps).filter(s=>s.id==='sge_equation'),equations);
    if(process.env.SAGE_V3_CONFUSION_TEST==='1')assert(equations.every(s=>s.outcome.resolution==='CONFUSION'&&s.outcome.confusionTargetId&&s.outcome.confusionDamage===10));
    assert.equal(equations.at(-1).outcome.debtScheduled,20);assert.equal(results[0].players.find(p=>p.role==='sage').sageDebt,0);
    assert(rounds[1].before.filter(p=>p.blocked).length===4);assert.equal(rounds[1].before[2].blocked,false);
  }
  report.groups.push({roles,rounds,results});for(const page of pages)await page.close();
 }
 assert.deepEqual(report.errors,[]);
} finally {fs.mkdirSync('artifacts/phase8',{recursive:true});fs.writeFileSync('artifacts/phase8/'+(process.env.SAGE_V3_CONFUSION_TEST==='1'?'sage-v3-multiplayer-report.json':'multiplayer-report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log('PASS five new roles / five rounds + seven existing roles / three rounds, equation/confusion/debt, queue ACKs and final state match');
