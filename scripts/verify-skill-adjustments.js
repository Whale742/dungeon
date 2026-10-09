import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve('artifacts/skill-adjustments');
fs.mkdirSync(output, { recursive: true });
const chromeLog=fs.openSync(path.join(output,'chrome.log'),'w');
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=9342',
  '--user-data-dir=' + path.join(output, 'chrome-profile'), 'about:blank'
], { windowsHide: true, stdio: ['ignore',chromeLog,chromeLog] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch('http://127.0.0.1:9342/json')).json(); break; }
    catch { await sleep(200); }
  }
  assert(targets, 'Chrome did not start');
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) {
      const cb = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) cb?.reject(new Error(msg.error.message)); else cb?.resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const until = async expression => {
    for (let i = 0; i < 160; i++) { if (await evaluate(expression)) return; await sleep(100); }
    throw new Error('Timed out: ' + expression + ' ' + JSON.stringify(await evaluate('({failure:window.qa?.failure,done:window.qa?.done,beats:window.qa?.beats,step:window.qa?.step,errors:window.qa?.errors})')));
  };
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:3014/presentation-lab.html' });
  await until('window.labInitialized === true');
  await evaluate(`(async()=>{
    // Use the production viewport instead of the Lab's sidebar-sized frame.
    document.body.appendChild(getOrCreateCombatStage());
    for(const sibling of document.body.children)if(sibling.id!=='presentationCombatStage'&&!['SCRIPT','STYLE','LINK'].includes(sibling.tagName))sibling.style.visibility='hidden';
    sfxManager.init(); await sfxManager.ctx.resume(); await sfxManager.preload();
    window.qa={beats:[],sounds:[],starts:[]};
    const play=sfxManager.play.bind(sfxManager);
    sfxManager.play=(key,options={})=>{qa.sounds.push({key,tail:!!options.preserveAcrossViews,signal:!!options.signal});return play(key,options);};
    const create=sfxManager.ctx.createBufferSource.bind(sfxManager.ctx);
    sfxManager.ctx.createBufferSource=()=>{const source=create(),start=source.start.bind(source);source.start=(time,offset,duration)=>{qa.starts.push({duration,full:source.buffer.duration,rate:source.playbackRate.value});return start(time,offset,duration);};return source;};
    window.qaRun=(id,speed=2,reducedMotion=false)=>{
      sfxManager.stopAll();clearGladiatorPresentationState();qa.beats=[];qa.sounds=[];qa.starts=[];qa.done=false;qa.failure=null;
      qa.controller=new AbortController();const context={mode:'lab',speed,reducedMotion,signal:qa.controller.signal,onTiming:(beat,data)=>qa.beats.push({beat,index:data?.index,targetId:data?.targetId})};
      const step=structuredClone(PHASE6_LAB_SCENES[id]?.steps[0]||GLADIATOR_LAB_SCENES[id]?.steps[0]);
      qa.step={type:step.type,role:step.sourceRole,action:step.actionId,results:step.results.length};
      (async()=>{await enterCombatStage(context);await playExpandedCombatPresentation(step,context);await exitCombatStage(context);})().catch(e=>qa.failure=e.message).finally(()=>qa.done=true);
    };
  })()`);
  for (const count of [1, 2, 3]) {
    await evaluate(`qaRun('crossbow_volley_${count}')`);
    await until('qa.done');
    const result = await evaluate('({failure:qa.failure,shots:qa.beats.filter(b=>b.beat==="crossbow_shot").length,sounds:qa.sounds.filter(s=>s.key==="arrow_release").length,canvases:document.querySelectorAll(".archer-skill-stage").length})');
    assert.equal(result.failure, null); assert.equal(result.shots, count); assert.equal(result.sounds, count); assert.equal(result.canvases, 0);
    console.log('Crossbow:', count, 'projectiles / release sounds, clean exit');
  }
  await evaluate("qaRun('p6_arrow_friendly',1)");
  await until('document.querySelector(".archer-falling-arrow") !== null');
  await screenshot('arrow-rain-desktop');
  await until('qa.done');
  const rain = await evaluate('({failure:qa.failure,waves:qa.beats.filter(b=>b.beat==="rain_wave").length,stray:qa.beats.filter(b=>b.beat==="rain_stray").length,sounds:qa.sounds.filter(s=>s.key==="archer_rain"),starts:qa.starts,alive:[...sfxManager.activeVoices].some(v=>v.key==="archer_rain")})');
  assert.equal(rain.failure, null); assert.equal(rain.waves, 5); assert.equal(rain.stray, 1); assert.equal(rain.sounds.length, 1); assert(rain.sounds[0].tail);
  assert(rain.starts.some(s=>s.duration===s.full && s.rate===1));
  console.log('Arrow rain: 5 waves, 1 friendly hit, complete MP3 at original rate');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("qaRun('p6_arrow_friendly',1,true)");
  await until('document.querySelector(".archer-falling-arrow") !== null');
  const mobile = await evaluate('Array.from(document.querySelectorAll(".archer-skill-targets .presentation-result-portrait"),n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})');
  assert.equal(mobile.length,2);assert(mobile.every(r=>r.left>=0&&r.right<=390&&r.top>=0&&r.bottom<=844));
  await screenshot('arrow-rain-mobile'); await until('qa.done');
  assert.equal(await evaluate('qa.failure'), null);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate("qaRun('p71_a_frenzy_reload_0_burst',.6)");
  await until('document.querySelectorAll(".presentation-ammo-arrow img").length === 3');
  await screenshot('crossbow-reload'); await until('qa.done');
  const reload = await evaluate('({failure:qa.failure,insert:qa.beats.filter(b=>b.beat==="ammo_insert").length})');
  assert.equal(reload.failure, null); assert.equal(reload.insert, 3);
  await evaluate(`(async()=>{
    sfxManager.stopAll();clearGladiatorPresentationState();qa.beats=[];
    qa.controller=new AbortController();const context={speed:1,signal:qa.controller.signal};
    await enterCombatStage(context);await playExpandedCombatPresentation(GLADIATOR_LAB_SCENES.gladiator_enter.steps[0],context);
    qa.arenaReady=true;
  })()`);
  await screenshot('arena-desktop');
  assert.equal(await evaluate('document.querySelectorAll(".arena-foreground-wall,.arena-stone-block").length'), 0);
  await evaluate('exitCombatStage({})');
  const selection = await evaluate('({hidden:getComputedStyle(getOrCreateCombatStage()).visibility,blocked:presentationManager?.blocking})');
  assert.equal(selection.hidden, 'hidden');
  await evaluate(`(async()=>{
    qa.sounds=[];qa.starts=[];await enterCombatStage({speed:2});
    await playExpandedCombatPresentation(GLADIATOR_LAB_SCENES.gladiator_exit.steps[0],{speed:2});await exitCombatStage({speed:2});
  })()`);
  const triumph = await evaluate('({sounds:qa.sounds.filter(s=>s.key==="gladiator_triumph"),full:qa.starts.some(s=>s.duration===s.full),arena:hasGladiatorArenaStage()})');
  assert.equal(triumph.sounds.length, 1); assert(triumph.full); assert.equal(triumph.arena, false);
  console.log('Arena: front wall / stone blocks removed, selection stage hidden, full Triumph MP3');
  await evaluate("qaRun('crossbow_volley_3',.3)");
  await until('document.querySelector(".archer-volley-arrow") !== null');
  await screenshot('crossbow-volley');
  await evaluate('qa.controller.abort()'); await until('qa.done');
  assert.equal(await evaluate('document.querySelectorAll(".archer-skill-stage").length'), 0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ rain, reload, selection, triumph, errors }, null, 2));
  console.log('Browser QA passed; screenshots:', output);
} finally { ws?.close(); chrome.kill();fs.closeSync(chromeLog); }
