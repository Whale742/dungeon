import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../public/sfx-assets.js', import.meta.url), 'utf8') + ';globalThis.resolve = resolveCombatSfxProfile; globalThis.registry = SFX_ASSETS;', context);
test('basic audio distinguishes seven roles and Druid form without replacing human audio', () => {
  const basics = { warrior: 'warrior_basic', mage: 'mage_basic', archer: 'arrow_release', assassin: 'warrior_basic', bard: 'bard_basic', alchemist: 'bottle_throw', druid: null };
  for (const [sourceRole, key] of Object.entries(basics)) assert.equal(context.resolve({ sourceRole, actionId: 'basic' }).key, key);
  assert.equal(context.resolve({ sourceRole: 'druid', actionId: 'basic', druidForm: 'treant' }).key, 'treant_action');
  assert.equal(context.resolve({ sourceRole: 'druid', actionId: 'basic', druidForm: 'werewolf' }).key, 'claw_slash');
});
test('reload stays quiet and acid explicitly uses ordered bottle impact', () => {
  for (const actionId of ['a_reload', 'a_frenzy_reload']) assert.equal(context.resolve({ sourceRole: 'archer', actionId }).key, null);
  assert.equal(context.resolve({ sourceRole: 'alchemist', actionId: 'basic' }).impactKey, 'bottle_impact');
  assert.equal(context.resolve({ sourceRole: 'alchemist', actionId: 'alc_flask' }).bottleSequence, true);
});
test('assassin skill cross slash doubles heavy identity while pursuit stays compact', () => {
  assert.equal(context.resolve({ sourceRole: 'assassin', actionId: 's_stab' }).doubleSlash, true);
  assert.equal(context.resolve({ sourceRole: 'assassin', actionId: 'basic' }).doubleSlash, false);
  assert.equal(context.resolve({ category: 'FOLLOW_UP' }).key, 'assassin_pursuit');
  assert(context.registry.assassin_pursuit.identityBeatMs < 500);
});
test('canonical asset registry references existing files and includes samurai parry', () => {
  for (const profile of Object.values(context.registry)) {
    assert(fs.existsSync(new URL('../public' + profile.src, import.meta.url)));
    assert(!profile.src.includes('_')||['/sound/sage_snap.mp3','/sound/sage_func.mp3','/sound/sage_cal.mp3','/sound/sage_pong.mp3','/sound/sage_laser.mp3'].includes(profile.src));
    assert(profile.identityBeatMs > 0);
    if(profile.src==='/sound/parry.mp3')assert.equal(profile.fallback,'shield_block');
  }
});

test('Samurai skills share their dedicated sound and Tsubame intro uses the full file',()=>{
 for(const actionId of ['sa_cut','sa_tsubame'])assert.equal(context.resolve({sourceRole:'samurai',actionId}).key,'samurai-skill');
 assert.equal(context.registry['samurai-skill'].src,'/sound/samurai-skill.mp3');
 assert.equal(context.registry['samurai-skill2-intro'].src,'/sound/samurai-skill2-intro.mp3');
 assert.equal(context.registry['samurai-skill2-intro'].offset,0);
 assert(context.registry['samurai-skill2-intro'].maxDuration>1);
});
test('arrow rain and surviving Arena exit use full dedicated MP3 files',()=>{
  assert.equal(context.resolve({sourceRole:'archer',actionId:'a_rain'}).key,'archer_rain');
  assert.equal(context.registry.archer_rain.src,'/sound/archer-skill2.mp3');
  assert.equal(context.registry.gladiator_triumph.src,'/sound/Gladitor-back-2.mp3');
  for(const key of ['archer_rain','gladiator_triumph']){
    assert.equal(context.registry[key].offset,0);assert.equal(context.registry[key].maxDuration,Infinity);
  }
});
