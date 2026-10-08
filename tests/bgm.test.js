import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const code=fs.readFileSync(new URL('../public/bgm.js',import.meta.url),'utf8');
function fixture(){
 let time=0,next=0;const timers=new Map(),sources=[],sounds=[];
 const param=()=>({value:1,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},cancelScheduledValues(t){this.events.push(['cancel',t]);},linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);}});
 const ctx={get currentTime(){return time/1000;},createBufferSource(){const source={playbackRate:param(),connect(){},disconnect(){},start(...args){this.started=args;},stop(){this.stopped=true;this.onended?.();}};sources.push(source);return source;},createGain(){return {gain:param(),connect(){},disconnect(){}};}};
 const set=(fn,ms)=>{timers.set(++next,{fn,at:time+ms});return next;},clear=id=>timers.delete(id);
 const audio={ctx,masterGain:{},init(){},async loadAsset(){return {duration:60};},async play(key,options){sounds.push({key,options,at:time});return {key};}};
 const scope=vm.createContext({sfxManager:audio,AbortController,console,setTimeout:set,clearTimeout:clear,waitForPresentation:(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(new DOMException('Aborted','AbortError'));set(resolve,ms);})});
 vm.runInContext(code+';globalThis.music=bgmManager;',scope);
 async function advance(ms){const end=time+ms;while(true){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;time=due[1].at;timers.delete(due[0]);due[1].fn();await Promise.resolve();await Promise.resolve();}time=end;await Promise.resolve();await Promise.resolve();}
 return {music:scope.music,advance,sources,sounds,timers};
}
test('normal fades out before warning and resumes its saved position with a fade in',async()=>{
 const f=fixture();await f.music.resumeNormal();await f.advance(1500);
 const voice=f.music.voices.normal,preparing=f.music.prepareBoss();await f.advance(1199);
 assert(!voice.source.stopped);await f.advance(1);await preparing;
 assert.equal(f.music.normalOffset,2.7);assert(voice.source.stopped);
 await f.music.bossDefeated();await f.music.resumeNormal();
 const resumed=f.music.voices.normal;assert.equal(resumed.source.started[1],2.7);
 assert(resumed.gain.gain.events.some(e=>e[0]==='set'&&e[1]===0));
 assert(resumed.gain.gain.events.some(e=>e[0]==='ramp'&&e[1]===.22));
});
test('boss music begins five real seconds after entrance sound without owning its abort signal',async()=>{
 const f=fixture(),presentation=new AbortController();await f.music.prepareBoss();await f.music.bossEntrance({signal:presentation.signal});
 assert.equal(f.sounds[0].key,'boss_entrance');assert(f.sounds[0].options.preserveAcrossViews);
 assert.notEqual(f.sounds[0].options.signal,presentation.signal);
 await f.advance(4999);assert.equal(f.music.voices.boss,null);await f.advance(1);
 assert(f.music.voices.boss);assert.equal(f.music.mode,'boss');
});
test('boss death ramps playback rate to zero before stopping, and prevents a delayed boss start',async()=>{
 const f=fixture();await f.music.prepareBoss();await f.music.bossEntrance();await f.advance(5000);
 const voice=f.music.voices.boss,promise=f.music.bossDefeated();
 assert(voice.source.playbackRate.events.some(e=>e[0]==='ramp'&&e[1]===0&&e[2]===7));
 await f.advance(1999);assert(!voice.source.stopped);await f.advance(1);await promise;assert(voice.source.stopped);
 await f.music.resumeNormal();const preparing=f.music.prepareBoss();await f.advance(1200);await preparing;await f.music.bossEntrance();await f.music.bossDefeated();await f.advance(5000);assert.equal(f.music.voices.boss,null);
});
test('battle defeat reuses the progressive boss slowdown and remains reset-safe',async()=>{
 const f=fixture();await f.music.prepareBoss();await f.music.bossEntrance();await f.advance(5000);
 const voice=f.music.voices.boss,promise=f.music.battleDefeated();
 assert.equal(f.music.mode,'dying');
 assert(voice.source.playbackRate.events.some(e=>e[0]==='ramp'&&e[1]===0&&e[2]===7));
 await f.advance(1000);assert(!voice.source.stopped);
 f.music.reset();await promise;
 assert(voice.source.stopped);assert.equal(f.music.mode,'idle');assert.equal(f.timers.size,0);
});
test('abandoning on the road progressively slows normal music before stopping',async()=>{
 const f=fixture();await f.music.resumeNormal();const voice=f.music.voices.normal,promise=f.music.battleDefeated();
 assert.equal(f.music.mode,'dying');
 assert(voice.source.playbackRate.events.some(e=>e[0]==='ramp'&&e[1]===0&&e[2]===2));
 await f.advance(1999);assert(!voice.source.stopped);await f.advance(1);await promise;
 assert(voice.source.stopped);assert.equal(f.music.voices.normal,null);assert.equal(f.music.mode,'post-defeat');
});
test('reset cancels pending music and boss entrance voices',async()=>{
 const f=fixture();await f.music.prepareBoss();await f.music.bossEntrance();const signal=f.sounds[0].options.signal;
 f.music.reset();assert(signal.aborted);await f.advance(6000);assert.equal(f.music.mode,'idle');assert.equal(f.music.voices.boss,null);assert.equal(f.timers.size,0);
});

test('walk and complete boss entrance use local assets; victory volume is halved',()=>{
 const scope=vm.createContext({});
 vm.runInContext(fs.readFileSync(new URL('../public/sfx-assets.js',import.meta.url),'utf8')+';globalThis.assets=SFX_ASSETS;',scope);
 assert.equal(scope.assets.walk.src,'/sound/walk.mp3');
 assert.equal(scope.assets.boss_entrance.offset,0);
 assert.equal(scope.assets.boss_entrance.maxDuration,Infinity);
 assert.equal(scope.assets.victory.volume,.16);
});

test('music starts at half volume and adjusts independently of track fades and master mute',async()=>{
 const f=fixture();assert.equal(f.music.volume,.5);await f.music.resumeNormal();
 assert.equal(f.music.musicGain.gain.value,.5);
 const voice=f.music.voices.normal;f.music.setVolume(.3);
 assert(f.music.musicGain.gain.events.some(e=>e[0]==='ramp'&&e[1]===.3));
 assert(voice.gain.gain.events.some(e=>e[0]==='ramp'&&e[1]===.22));
 f.music.setVolume(2);assert.equal(f.music.volume,1);f.music.setVolume(-1);assert.equal(f.music.volume,0);
});
