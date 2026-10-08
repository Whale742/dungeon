import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createHash} from 'node:crypto';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/assets/temp/samurai_skill_prototype_fixed_v4.html'),source=html.match(/<script>([\s\S]*?)<\/script>/)[1],fx=read('public/samurai-prototype-fx.js');
const context=vm.createContext({Image:class{},AbortController,DOMException,console});vm.runInContext(read('public/samurai-presentation.js')+';globalThis.plan=buildSamuraiPresentationPlan;globalThis.queue=samuraiQueueState;',context);
const actor={id:'hero',role:'samurai',soul:4,hp:80,maxHp:80},monster={hp:240,maxHp:240};
function step(id,values=[10],outcome={type:'normal'}){return {sourceRole:'samurai',sourceId:'hero',actionId:id,outcome,hpSnapshotBefore:{players:[actor],monster},hpSnapshot:{players:[{...actor,soul:id==='sa_tsubame'?0:5}],monster},results:values.map((n,i)=>({kind:'damage',targetId:'monster',finalDamage:n,targetBefore:{...monster,hp:240-i*n},targetAfter:{...monster,hp:240-(i+1)*n},outcome:{type:'normal'}}))};}
test('Samurai Canvas routines are copied byte for byte from the approved prototype',()=>{assert.equal(fx.slice(fx.indexOf('function bladeShape'),fx.indexOf('function parryCountAt')),source.slice(source.indexOf('function bladeShape'),source.indexOf('function hpAt')));});
test('Registered frames match the reference embedded bytes exactly',()=>{const manifest=JSON.parse(read('public/assets/samurai-fx/manifest.json'));assert.equal(manifest.sha256,createHash('sha256').update(html).digest('hex'));const embedded=[...html.matchAll(/<img[^>]+src="data:image\/[^;]+;base64,([^"]+)"/g)].slice(3);assert.equal(manifest.frames.length,embedded.length);for(const [i,frame] of manifest.frames.entries()){const file=fs.readFileSync(new URL('../public/assets/samurai-fx/'+frame.file,import.meta.url));assert(file.equals(Buffer.from(embedded[i][1],'base64')));}});
test('Burst changes outcome emphasis without introducing another strike',()=>{const p=context.plan(step('sa_cut',[777],{type:'soul_burst'}));assert.equal(p.hits.length,1);assert.equal(p.hits[0].value,777);assert.equal(p.hits[0].time,685);assert.equal(p.hits[0].angle,-.485);assert.equal(p.flashAt,685);});
test('Tsubame preserves four server values and 75ms intervals inside one plan',()=>{const p=context.plan(step('sa_tsubame',[3,9,0,81]));assert.deepEqual(Array.from(p.hits,h=>h.value),[3,9,0,81]);assert.deepEqual(Array.from(p.hits,h=>h.time),[1140,1215,1290,1365]);assert.equal(p.eye.open-p.eye.start,500);assert.equal(p.soulChanges[0].delta,-4);});
test('Counter uses remembered authoritative parry traces and emits only one hit',()=>{const c={signal:new AbortController().signal};context.queue(c).set('hero',{curse:true,incoming:[0,1,2,3].map(index=>({time:260+index*235,index,guard:true,first:index===0}))});const p=context.plan(step('sa_counter',[928]),c);assert.equal(p.hits.length,1);assert.equal(p.hits[0].value,928);assert.equal(p.hits[0].echoes,3);assert.equal(p.incoming.length,4);assert(p.incoming.every(x=>x.time<0&&!x.result));assert.equal(p.options.curse,true);});
test('Samurai adapter has no gameplay RNG or embedded assets and leaves other roles untouched',()=>{assert(!read('public/samurai-presentation.js').includes('Math.random'));assert(!fx.includes('base64,'));assert(!read('public/samurai-presentation.css').includes('data:image'));for(const file of ['public/index.html','public/presentation-lab.html']){const page=read(file);assert(page.includes('samurai-prototype-fx.js'));assert(page.includes('samurai-presentation.js'));}assert(read('public/combat-expansion.js').includes('isSamuraiAction(step)'));});

test('Lethal Tsubame keeps four visual cuts without inventing server results',()=>{const p=context.plan(step('sa_tsubame',[17]));assert.equal(p.hits.length,1);assert.equal(p.slashes.length,4);assert.equal(p.slashes[3].time,1365);assert.equal(p.slashes[3].result,undefined);});

test('Eye cut-in uses only the new URL sheet, never the old registered eye assets',()=>{assert(fx.includes("'/assets/samurai-eye.png'"));assert(!fx.includes('/assets/samurai-fx/eye-'));assert(!read('public/samurai-presentation.js').includes('/assets/samurai-fx/eye-'));const css=read('public/samurai-presentation.css');assert(css.includes('height:200%'));assert(css.includes('top:-100%'));});

test('Tsubame slows only its prelude and opens one second after intro playback',()=>{
 const p=context.plan(step('sa_tsubame',[3,9,0,81]));
 assert.equal(p.introSound,'samurai-skill2-intro');
 context.pacedPlan=p;
 assert.equal(vm.runInContext('samuraiVisualTime(1000,pacedPlan)',context),740);
 assert.equal(vm.runInContext('samuraiVisualTime(500,pacedPlan)',context),370);
 assert.equal(vm.runInContext('samuraiPlaybackDuration(pacedPlan)',context),2210);
 assert.deepEqual([1400,1475,1550,1625].map(t=>vm.runInContext('samuraiVisualTime('+t+',pacedPlan)',context)),[1140,1215,1290,1365]);
 for(const id of ['sa_cut','sa_tsubame']){
  const plan=context.plan(step(id,[1,2,3,4]));
  assert.equal(plan.castSound,'samurai-skill');
  assert.equal(plan.suppressImpactAudio,true);
  assert(plan.audio.every(e=>e.type==='slash'));
 }
});

test('Common boss presentation retains every authoritative parry for the subsequent counter',()=>{
 const c={signal:new AbortController().signal};
 const boss={type:'boss_action',hpSnapshotBefore:{players:[actor]},results:[0,1,2,3].map(i=>({targetId:'hero',kind:'damage',targetBefore:actor,finalDamage:0,outcome:{type:'block',parry:true}}))};
 context.enemy=boss;context.enemyContext=c;
 vm.runInContext('rememberSamuraiEnemyPhase(enemy,enemyContext)',context);
 const p=context.plan(step('sa_counter',[28]),c);
 assert.equal(p.hits[0].echoes,3);assert.equal(p.incoming.length,4);
 const dispatcher=read('public/combat-expansion.js');
 assert(dispatcher.includes('rememberSamuraiEnemyPhase(step, context)'));
 assert(!dispatcher.includes('return playSamuraiEnemyPhasePresentation'));
});

test('Samurai skill cuts use only the requested light/heavy cues, including lethal Tsubame',()=>{
 const cut=context.plan(step('sa_cut',[777],{type:'soul_burst'}));
 assert.deepEqual(Array.from(cut.audio,e=>[e.time,e.key]),[[685,'sword-slash-heavy']]);
 const swallow=context.plan(step('sa_tsubame',[3,9,0,81]));
 assert.deepEqual(Array.from(swallow.audio,e=>e.key),['assassin-pursuit','assassin-pursuit','assassin-pursuit','sword-slash-heavy']);
 const lethal=context.plan(step('sa_tsubame',[17]));
 assert.equal(lethal.audio.length,4);assert.equal(lethal.audio[3].key,'sword-slash-heavy');
});

test('Skill result updates stay silent even when damage breaks a shield',()=>{
 const sounds=[],beats=[];
 const result={targetId:'monster',finalDamage:99,shieldBreak:true,outcome:{type:'normal'},targetAfter:{hp:1,maxHp:100}};
 context.silentResult=result;context.silentCard={};
 context.silentContext={suppressImpactAudio:true,audioScope:{play:key=>sounds.push(key)},onTiming:beat=>beats.push(beat)};
 context.updateResultCard=()=>{};context.resultFloat=()=>{};
 vm.runInContext('resolveSamuraiCombatResult(silentResult,silentCard,silentContext)',context);
 assert.deepEqual(sounds,[]);assert.deepEqual(beats,['impact','damage_float','hp_update']);
});

test('Successful Kyoutou counter plays cast sound then one pursuit slash without impact audio',()=>{
 const p=context.plan(step('sa_counter',[28]));
 assert.equal(p.castSound,'samurai-skill');
 assert.equal(p.suppressImpactAudio,true);
 assert.deepEqual(Array.from(p.audio,e=>[e.time,e.key]),[[135,'assassin-pursuit']]);
 const empty=context.plan(step('sa_counter',[],{type:'invalid'}));
 assert.equal(empty.castSound,undefined);
 assert.equal(empty.audio.length,0);
});
