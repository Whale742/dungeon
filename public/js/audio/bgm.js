const BGM_TRACKS=Object.freeze({
 normal:{src:'/sound/bgm-normal.mp3',bindingKey:'bgm.normal',volume:.22,loadTimeoutMs:30000},
 boss:{src:'/sound/bgm-boss.mp3',bindingKey:'bgm.boss',volume:.25,loadTimeoutMs:30000}
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
 preload(){this.audio.init(false);if(!this.ctx)return Promise.resolve([]);return Promise.all(Object.values(BGM_TRACKS).map(profile=>this.audio.loadAsset(profile)));}
 async startTrack(name,fadeMs=0){
  const epoch=this.epoch,base=BGM_TRACKS[name],profile=typeof window!=='undefined'&&window.assetRegistry?window.assetRegistry.audioProfile(base):base;
  this.audio.init();if(!this.ctx)return null;
  if(this.audio.assets?.get(profile.src)?.failed)this.audio.assets.delete(profile.src);
  const buffer=await this.audio.loadAsset(profile);
  if(!buffer||epoch!==this.epoch||this.mode!==name)return null;
  if(this.voices[name])return this.voices[name];
  const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),start=this.ctx.currentTime;
  const offset=name==='normal'?this.normalOffset%buffer.duration:0;
  source.buffer=buffer;source.loop=true;source.connect(gain);gain.connect(this.ensureMusicGain());
  gain.gain.value=fadeMs?0:profile.volume;
  gain.gain.setValueAtTime(fadeMs?0:profile.volume,start);
  if(fadeMs)gain.gain.linearRampToValueAtTime(profile.volume,start+fadeMs/1000);
  const voice={source,gain,start,offset,buffer};
  this.voices[name]=voice;
  source.onended=()=>{if(this.voices[name]===voice)this.voices[name]=null;source.disconnect();gain.disconnect();};
  source.start(start,offset);return voice;
 }
 stopTrack(name,save=false){
  const voice=this.voices[name];if(!voice)return;
  if(save)this.normalOffset=(voice.offset+this.ctx.currentTime-voice.start)%voice.buffer.duration;
  this.voices[name]=null;try{voice.source.stop();}catch{}
 }
 async resumeNormal(){
  if(this.mode==='normal'&&this.voices.normal)return;
  this.mode='normal';this.epoch++;clearTimeout(this.bossTimer);this.bossTimer=null;
  this.stopTrack('boss');await this.startTrack('normal',1200);
 }
 async prepareBoss(signal){
  this.audio.init();
  const preload=this.ctx?this.audio.loadAsset(BGM_TRACKS.boss):Promise.resolve(null);
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
  voice.source.playbackRate.cancelScheduledValues(now);
  voice.source.playbackRate.setValueAtTime(voice.source.playbackRate.value,now);
  voice.source.playbackRate.linearRampToValueAtTime(0,now+2);
  this.deathPromise=new Promise(resolve=>{
   this.finishDeath=resolve;
   this.deathTimer=setTimeout(()=>{
    this.deathTimer=null;this.stopTrack(name);this.mode=finalMode;
    this.finishDeath=null;resolve();
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
  this.bossTimer=null;this.deathTimer=null;this.finishDeath?.();this.finishDeath=null;this.deathPromise=null;
  this.encounterController?.abort();this.encounterController=null;
  this.stopTrack('normal');this.stopTrack('boss');this.normalOffset=0;
 }
}
const bgmManager=new BGMManager();
if(typeof window!=='undefined'){
 window.bgmManager=bgmManager;window.BGMManager=BGMManager;
 window.addEventListener('pagehide',()=>bgmManager.reset());
}
