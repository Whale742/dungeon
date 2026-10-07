import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../public/sfx-assets.js',import.meta.url),'utf8')+';globalThis.assets=SFX_ASSETS;',context);
vm.runInContext(fs.readFileSync(new URL('../public/dreamweaver-presentation.js',import.meta.url),'utf8'),context);
test('Dreamweaver casts have no automatic generic audio and register the requested local assets',()=>{
 for(const actionId of ['basic','dw_butterfly','dw_false_dream'])assert.equal(context.resolveCombatSfxProfile({sourceRole:'dreamweaver',actionId}).key,null);
 assert.equal(context.assets['dreamwaver-swoosh'].src,'/sound/swoosh.mp3');
 for(const name of ['rope','pa','dream','posi','nage'])assert.equal(context.assets['dreamwaver-'+name].src,'/sound/dreamwaver-'+name+'.mp3');
});
test('Dreamweaver audio scope suppresses generic impact and healing cues',async()=>{
 const played=[];const scope=context.dreamweaverAudioScope({play:key=>played.push(key),playResult:key=>played.push(key),hold:()=>{}});
 await scope.play('magic_impact');await scope.playResult('healing_result');await scope.play('dreamwaver-pa');
 assert.deepEqual(played,['dreamwaver-pa']);
});
test('Dream selection and hit audio use the selected outcome',()=>{
 assert.equal(context.dreamweaverButterflySound('monster'),'dreamwaver-nage');
 assert.equal(context.dreamweaverButterflySound('hero'),null);
 for(const target of ['hero','monster']){
  assert.equal(context.dreamweaverButterflySound(target,'dream_heal'),'dreamwaver-posi');
  assert.equal(context.dreamweaverButterflySound(target,'nightmare'),'dreamwaver-nage');
 }
});
test('Dreamweaver audio never adds a blocking presentation hold',async()=>{
 let held=false,options;const audio=context.dreamweaverAudioScope({play:(key,value)=>{options=value;},playResult:()=>{},hold:()=>{held=true;}});
 audio.play('dreamwaver-dream');await audio.hold();assert.equal(options.noHold,true);assert.equal(held,false);
});
