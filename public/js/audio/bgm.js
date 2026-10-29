const BGM_TRACKS=Object.freeze({
 normal:{src:'/assets/sound/bgm/bgm-normal.mp3',bindingKey:'bgm.normal',volume:.22},
 boss:{src:'/assets/sound/bgm/bgm-boss.mp3',bindingKey:'bgm.boss',volume:.25}
});
// Music uses the shared AudioContext/master mute, with its own looping voices.
class BGMManager {
 constructor(audio=sfxManager){
  this.audio=audio;this.musicGain=null;this.volume=.5;this.mode='idle';this.epoch=0;this.normalOffset=0;
  this.voices={normal:null,boss:null};this.bossTimer=null;this.deathTimer=null;
  this.encounterController=null;this.deathPromise=null;this.finishDeath=null;
 }
 get ctx(){return this.audio.ctx;}
 setVolume(value){
  this.volume=Math.max(0,Math.min(1,Number(value)||0));
  if(this.musicGain){const now=this.ctx.currentTime,p=this.musicGain.gain;p.cancelScheduledValues(now);p.setValueAtTime(p.value,now);p.linearRampToValueAtTime(this.volume,now+.15);}
 }
 ensureMusicGain(){
  if(!this.musicGain){this.musicGain=this.ctx.createGain();this.musicGain.gain.value=this.volume;this.musicGain.connect(this.audio.masterGain);}
  return this.musicGain;
 }
 preload(){return Promise.resolve([]);} // Long music streams on demand, never decode whole MP3s.
 async startTrack(name,fadeMs=0){
  const epoch=this.epoch,base=BGM_TRACKS[name],profile=typeof window!=='undefined'&&window.assetRegistry?window.assetRegistry.audioProfile(base):base;
  this.audio.init();if(!this.ctx)return null;
  if(!profile.src||epoch!==this.epoch||this.mode!==name)return null;
  if(this.voices[name])return this.voices[name];
  const media=new Audio(profile.src),source=this.ctx.createMediaElementSource(media),gain=this.ctx.createGain(),start=this.ctx.currentTime;
  media.loop=true;media.preload='metadata';media.preservesPitch=false;
  const offset=name==='normal'?this.normalOffset:0;
  if(offset)media.addEventListener('loadedmetadata',()=>{if(Number.isFinite(media.duration))media.currentTime=offset%media.duration;},{once:true});
  source.connect(gain);gain.connect(this.ensureMusicGain());
  gain.gain.value=fadeMs?0:profile.volume;
  gain.gain.setValueAtTime(fadeMs?0:profile.volume,start);
  if(fadeMs)gain.gain.linearRampToValueAtTime(profile.volume,start+fadeMs/1000);
  const voice={source,gain,start,offset,media};
  this.voices[name]=voice;
  media.onerror=()=>{if(this.voices[name]!==voice)return;this.stopTrack(name);this.retryCount=(this.retryCount||0)+1;if(this.retryCount<=2&&epoch===this.epoch&&this.mode===name&&!this.retryTimer){this.retryTimer=setTimeout(()=>{this.retryTimer=null;void this.startTrack(name,fadeMs);},1500);}};
  media.addEventListener('playing',()=>{this.retryCount=0;},{once:true});
  try{await media.play();}catch(error){if(this.voices[name]===voice)this.stopTrack(name);console.warn('[BGM] Playback awaiting gesture or network:',error.message);}
  return this.voices[name];
 }
 stopTrack(name,save=false){
  const voice=this.voices[name];if(!voice)return;
  if(save)this.normalOffset=voice.media.currentTime;
  this.voices[name]=null;voice.media.onerror=null;voice.media.pause();voice.media.removeAttribute('src');voice.media.load();voice.source.disconnect();voice.gain.disconnect();
 }
 async resumeNormal(){
  if(this.mode==='normal'&&this.voices.normal)return;
  this.mode='normal';this.epoch++;clearTimeout(this.bossTimer);this.bossTimer=null;
  this.stopTrack('boss');await this.startTrack('normal',1200);
 }
 async resumeBoss(){
  if(this.mode==='boss'&&this.voices.boss)return;
  this.mode='boss';this.epoch++;clearTimeout(this.bossTimer);this.bossTimer=null;
  this.stopTrack('normal',true);await this.startTrack('boss',500);
 }
 async prepareBoss(signal){
  this.audio.init();
  const preload=Promise.resolve();
  this.mode='encounter';this.epoch++;const epoch=this.epoch;
  clearTimeout(this.bossTimer);this.bossTimer=null;
  this.encounterController?.abort();this.encounterController=new AbortController();
  this.stopTrack('boss');this.deathPromise=null;
  const voice=this.voices.normal;
  if(voice){
   const now=this.ctx.currentTime;
   voice.gain.gain.cancelScheduledValues(now);
   voice.gain.gain.setValueAtTime(voice.gain.gain.value,now);
   voice.gain.gain.linearRampToValueAtTime(0,now+1.2);
   await waitForPresentation(1200,signal);
   if(epoch===this.epoch)this.stopTrack('normal',true);
  }
  await preload;
 }
 async bossEntrance(context={}){
  if(this.mode!=='encounter')await this.prepareBoss(context.signal);
  const epoch=this.epoch;
  const options={signal:this.encounterController.signal,preserveAcrossViews:true,noHold:true};
  const voice=await (context.playSound?context.playSound('boss_entrance',options):this.audio.play('boss_entrance',options));
  if(epoch!==this.epoch||context.signal?.aborted)return voice;
  // This is real playback time; Lab animation speed does not change MP3 rate.
  this.bossTimer=setTimeout(()=>{
   this.bossTimer=null;if(epoch!==this.epoch||this.mode!=='encounter')return;
   this.mode='boss';void this.startTrack('boss',1000).catch(error=>console.warn('[BGM]',error));
  },5000);
  return voice;
 }
 slowTrackToStop(name,finalMode){
  if(this.deathPromise)return this.deathPromise;
  this.mode='dying';this.epoch++;clearTimeout(this.bossTimer);this.bossTimer=null;
  const voice=this.voices[name];
  if(!voice){this.mode=finalMode;return Promise.resolve();}
  const now=this.ctx.currentTime;
  const started=performance.now();
  const slowTimer=setInterval(()=>{voice.media.playbackRate=Math.max(.1,1-(performance.now()-started)/2000);},50);
  this.slowTimer=slowTimer;
  this.deathPromise=new Promise(resolve=>{
   this.finishDeath=resolve;
   this.deathTimer=setTimeout(()=>{
    clearInterval(slowTimer);this.slowTimer=null;this.deathTimer=null;this.stopTrack(name);this.mode=finalMode;
    this.finishDeath=null;resolve();
    if(typeof window!=='undefined')window.dispatchEvent?.(new Event('bgm:stopped'));
   },2000);
  });
  return this.deathPromise;
 }
 bossDefeated(){
  if(this.deathPromise)return this.deathPromise;
  if(!['boss','encounter'].includes(this.mode))return Promise.resolve();
  return this.slowTrackToStop('boss','post-boss');
 }
 battleDefeated(){
  // Wipes slow the boss track; abandoning on the road slows the normal track.
  // Keeping both here makes the operation idempotent and reset-safe.
  if(this.deathPromise)return this.deathPromise;
  if(['boss','encounter'].includes(this.mode))return this.bossDefeated();
  if(this.mode==='normal')return this.slowTrackToStop('normal','post-defeat');
  return Promise.resolve();
 }
 reset(){
  this.epoch++;this.mode='idle';clearTimeout(this.bossTimer);clearTimeout(this.deathTimer);
  clearInterval(this.slowTimer);clearTimeout(this.retryTimer);this.retryTimer=null;this.retryCount=0;
  this.bossTimer=null;this.deathTimer=null;this.finishDeath?.();this.finishDeath=null;this.deathPromise=null;
  this.encounterController?.abort();this.encounterController=null;
  this.stopTrack('normal');this.stopTrack('boss');this.normalOffset=0;
 }
}
const bgmManager=new BGMManager();
if(typeof window!=='undefined'){
 window.bgmManager=bgmManager;window.BGMManager=BGMManager;
 window.addEventListener('pagehide',()=>bgmManager.reset());
 for(const type of ['pointerup','keydown'])window.addEventListener(type,event=>{if(event.isTrusted&&['normal','boss'].includes(bgmManager.mode)&&!bgmManager.voices[bgmManager.mode])void bgmManager.startTrack(bgmManager.mode,500);});
}
