import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { combatLabCatalog as catalog, combatLabFixture, configuredSamuraiPreview } from './combat-lab.js';
import { preparePlayback, syncLabSouls, setLabSoul, setLabZanshin } from '../public/js/lab/combat-fx-model.js';

function scenario(role='samurai',count=4,enemyCount=3){
  const party=Array.from({length:count},(_,i)=>{
    const key=i===0?role:'warrior',c=catalog.classes[key];
    return {id:'configured-player-'+i,role:key,name:'角色 '+i,hp:c.maxHp,maxHp:c.maxHp,statuses:[],minions:[],equips:[]};
  });
  const enemies=catalog.enemies.slice(0,enemyCount).map((e,i)=>({...structuredClone(e),instanceId:'configured-enemy-'+i,statuses:[]}));
  return {party,enemies,actorId:party[0].id,primaryId:enemies.at(-1).instanceId,partyTargetId:party.at(-1).id,round:1};
}
const entry=(id,action)=>catalog.scenes.find(s=>s.id===id&&(!action||s.actionId===action));

test('Lab soul and per-source enemy marks stay consistent with Dev resource limits',()=>{
  const c=scenario('samurai',2,3);c.party[1].role='samurai';
  setLabSoul(c,c.party[0].id,12);setLabSoul(c,c.party[1].id,4);
  assert.deepEqual(c.enemies.map(e=>e.zanshin[c.party[0].id]),[8,4,0]);
  setLabZanshin(c,c.enemies[2].instanceId,c.party[0].id,9);
  assert.equal(c.party[0].soul,20);assert.equal(c.party[1].soul,4);
  c.enemies[0].hp=0;syncLabSouls(c);assert.equal(c.party[0].soul,12);assert.equal(c.party[1].soul,0);
  setLabSoul(c,c.party[0].id,999);assert.equal(c.party[0].soul,16);
});
for(const soul of [0,1,2,3])test('Configured Lab refuses Tsubame below four souls: '+soul,async()=>{
  const c=scenario('samurai',1,1);setLabSoul(c,c.actorId,soul);
  await assert.rejects(configuredSamuraiPreview(c,'sa_tsubame'),/至少 4 層武魂/);
});
for(const [enemyCount,soul]of [[1,4],[1,8],[2,12],[3,24]])test('Configured Lab uses real Samurai results and controlled HP: '+enemyCount+'/'+soul,async()=>{
  const c=scenario('samurai',2,enemyCount);c.party[0].hp=7;c.party[1].hp=1;c.enemies.forEach(e=>e.hp=1);setLabSoul(c,c.actorId,soul);
  const before=structuredClone(c),fixture=await configuredSamuraiPreview(c,'sa_tsubame'),step=fixture.steps[0];
  assert.equal(step.outcome.segments,soul);assert.equal(step.hpSnapshotBefore.players.find(p=>p.id===c.actorId).hp,7);
  assert.equal(step.hpSnapshotBefore.players.find(p=>p.id===c.party[1].id).hp,1);
  assert.ok(step.results.filter(r=>r.kind==='damage').every(r=>r.targetBefore.hp>0));
  assert.ok(step.hpSnapshot.enemies.every(e=>e.hp===0));assert.equal(step.hpSnapshot.players.find(p=>p.id===c.actorId).soul,0);
  assert.deepEqual(c,before);assert.deepEqual(preparePlayback(c,fixture,entry('samurai_tsubame')).steps,fixture.steps);
});
test('Configured Lab validates enemy marks instead of accepting a spoofed soul field',async()=>{
  const c=scenario('samurai',1,1);c.party[0].soul=24;
  await assert.rejects(configuredSamuraiPreview(c,'sa_tsubame'),/至少 4 層武魂/);
  c.enemies[0].zanshin={[c.actorId]:9};await assert.rejects(configuredSamuraiPreview(c,'sa_tsubame'),/0–8/);
});
test('Configured Samurai cut preserves the selected normal/burst sample via Dev random controls',async()=>{
  const c=scenario('samurai',1,1);c.enemies[0].hp=c.enemies[0].maxHp=10000;setLabSoul(c,c.actorId,4);
  const normal=await configuredSamuraiPreview(c,'sa_cut','samurai_cut'),burst=await configuredSamuraiPreview(c,'sa_cut','samurai_burst');
  assert.equal(normal.steps[0].outcome.type,'normal');assert.equal(burst.steps[0].outcome.type,'soul_burst');
  await assert.rejects(configuredSamuraiPreview(c,'sa_cut','samurai_tsubame'),/情境不符/);
});

for(const [id,expected,cost]of [['gladiator_sacrifice',15,0],['gladiator_xiphos',15,0],['gladiator_assault',74,0],['gladiator_suicide',102,50],['gladiator_cingulum',131,50],['p8_arena_g_arena',102,50]])
test('Gladiator Lab uses current nonlethal mechanics: '+id,()=>{
  const config=scenario('gladiator');config.enemies.forEach(e=>{e.hp=e.maxHp=1000;});
  const selected=entry(id),fixture=combatLabFixture(id),{steps}=preparePlayback(config,fixture,selected),step=steps[0];
  assert.equal(step.results.filter(r=>r.targetEnemyId).reduce((n,r)=>n+r.actualDamage,0),expected);
  assert.equal(step.hpSnapshot.players[0].hp,85);if(cost){assert.equal(step.results.find(r=>r.bloodsongConsumed).bloodsongConsumed,cost);assert.ok(!step.results.some(r=>r.kind==='damage'&&r.targetId===config.actorId));}assert.ok(!step.hpSnapshot.players[0].noReviveThisFloor);
  if(step.actionId==='g_arena')assert.equal(selected.skillName,'浴血裁決');
  assert.ok(!/同歸於盡|鮮血獻祭|怒氣/.test(selected.skillDescription||''));
});
test('Gladiator cuirass Lab records shield and heal inspiration separately without healing HP',()=>{
  const config=scenario('gladiator');config.party[0].hp=config.party[0].maxHp=120;
  config.enemies.forEach(e=>{e.hp=e.maxHp=1000;});
  const selected=entry('gladiator_cuirass'),{steps}=preparePlayback(config,combatLabFixture(selected.id),selected);
  const step=steps[0];assert.equal(step.results[0].targetAfter.statuses[0].value,'物攻 +15');
  assert.equal(step.results[1].targetAfter.statuses[0].value,'物攻 +22');
  assert.equal(step.results.find(r=>r.targetEnemyId).actualDamage,37);
  assert.equal(step.hpSnapshot.players[0].hp,120);assert.equal(step.hpSnapshot.players[0].tempHp||0,0);
});

for(const [id,damage]of [['onm_talisman_blind',15],['onm_talisman_seal',15],['onm_talisman_corrode',15],['onm_talisman_confuse',16],['onm_talisman_drain',41],['phase5_onmyoji_onm_all_talismans',50],['onm_detonate_5',25],['onm_detonate_10_max',48]])
test('Onmyoji Lab replay keeps damage, HP and talismans consistent: '+id,()=>{
  const config=scenario('onmyoji');config.enemies.forEach(e=>{e.hp=1000;e.maxHp=1000;});
  const selected=entry(id),fixture=combatLabFixture(id);
  const {steps}=preparePlayback(config,fixture,selected);const step=steps[0];
  const hits=step.results.filter(r=>r.kind==='damage'&&r.actualDamage>0);
  assert.equal(hits.reduce((n,r)=>n+r.actualDamage,0),damage);
  assert.equal(step.hpSnapshot.enemies.find(e=>e.instanceId===config.primaryId).hp,1000-damage);
  assert.equal(step.results.at(-1).targetAfter.talismans.length,fixture.steps[0].hpSnapshot.enemies?.find(e=>e.instanceId===fixture.steps[0].targetEnemyId)?.talismans.length??fixture.steps[0].hpSnapshot.monster.talismans.length);
});

test('four-hit Tsubame retains all hits, selected enemy and immutable replay inputs',()=>{
  const config=scenario(),fixture=combatLabFixture('samurai_tsubame');
  const saved=structuredClone(config),savedFixture=JSON.stringify(fixture);
  const run=()=>preparePlayback(config,fixture,entry('samurai_tsubame'));
  const playback=run();
  assert.equal(playback.steps.length,1);assert.equal(playback.steps[0].results.length,4);
  for(const r of playback.steps[0].results){assert.equal(r.targetId,config.primaryId);assert.equal(r.targetAfter.name,config.enemies.at(-1).name);}
  assert.deepEqual(config,saved);assert.equal(JSON.stringify(fixture),savedFixture);assert.deepEqual(run(),playback);
});

test('party shield preview covers ten configured allies without phantom fixture actors',()=>{
  const config=scenario('warrior',10),selected=entry('phase6_warrior_w_shield_normal_single','w_shield');
  const {steps}=preparePlayback(config,combatLabFixture(selected.id),selected);
  assert.equal(steps[0].results.length,10);
  assert.deepEqual(new Set(steps[0].results.map(r=>r.targetId)),new Set(config.party.map(p=>p.id)));
  for(const step of steps)assert.deepEqual(step.hpSnapshot.players.map(p=>p.id),config.party.map(p=>p.id));
});

test('observation remaps its nested target even when the recorded ally role is absent',()=>{
  const config=scenario('augur',2),selected=entry('augur_observe');
  config.party[1].role='sage';
  const {steps}=preparePlayback(config,combatLabFixture(selected.id),selected);
  assert.equal(steps[0].outcome.targetId,config.partyTargetId);
  assert.equal(steps[0].targetId,config.partyTargetId);
  assert.equal(steps[0].results.length,0);
});

test('a recorded butterfly cocoon can target a chosen ally without also changing the caster',()=>{
  const config=scenario('dreamweaver',2),selected=entry('p8_butterfly_heal');
  config.party[0].hp=10;config.party[1].hp=1;
  assert.equal(selected.skillId,'dw_butterfly');
  assert.equal(selected.targetMode,'selected');
  const {steps}=preparePlayback(config,combatLabFixture(selected.id),selected);
  assert.ok(steps[0].results.every(r=>r.targetId===config.partyTargetId));
  assert.equal(steps[0].hpSnapshot.players[0].hp,10);
  assert.notDeepEqual(steps[0].hpSnapshot.players[1].statuses,config.party[1].statuses);
});

test('solve previews include the dependent equation and maintain the selected enemy',()=>{
  const config=scenario('sage'),selected=entry('sage_sge_induce_solve','sge_induce');
  const {steps}=preparePlayback(config,combatLabFixture(selected.id),selected);
  assert.deepEqual(steps.map(s=>s.actionId),['sge_induce','sge_equation']);
  assert.ok(steps.every(s=>s.results.filter(r=>r.kind==='damage').every(r=>r.targetEnemyId===config.primaryId)));
});

test('transform uses the production result and updates only the configured druid',()=>{
  const config=scenario('druid'),selected=entry('p6_wolf_transform','dru_transform');
  const {steps}=preparePlayback(config,combatLabFixture(selected.id),selected);
  assert.equal(steps[0].hpSnapshot.players[0].druidForm,'werewolf');
  assert.equal(steps[0].results[0].targetId,config.actorId);
  assert.equal(config.party[0].druidForm,undefined);
});

test('arena sequence retains entry, assault and exit with configured ownership',()=>{
  const config=scenario('gladiator'),selected=entry('gladiator_full','g_arena');
  const {steps}=preparePlayback(config,combatLabFixture(selected.id),selected);
  assert.deepEqual(steps.map(s=>s.type),['player_action','player_action','arena_enter','player_action','arena_exit']);
  assert.equal(steps[2].hpSnapshot.arena.playerId,config.actorId);
  assert.equal(steps[2].hpSnapshot.arena.enemyId,config.primaryId);
  assert.equal(steps[3].results[0].targetId,config.primaryId);
  assert.equal(steps.at(-1).hpSnapshot.arena,null);
});

test('an enemy performer retains its identity when a different enemy is primary',()=>{
  const selected=catalog.scenes.find(s=>!s.role&&s.targetSide==='party');
  const config=scenario('warrior',2,3);
  const enemy=catalog.enemies.find(e=>e.name===selected.enemyName);
  config.enemies[0]={...structuredClone(enemy),instanceId:'configured-enemy-0'};
  config.actorId=config.enemies[0].instanceId;
  const {steps}=preparePlayback(config,combatLabFixture(selected.id),selected);
  assert.ok(steps.every(s=>s.sourceId===config.actorId&&s.monsterName===enemy.name&&s.monsterAvatar===enemy.avatar));
});

test('Stargazer blackhole Lab scenes apply 1.0x and 2.5x magic true damage to the selected enemy with floating damage fields',()=>{
  const normalConfig=scenario('stargazer',3,3);
  normalConfig.enemies.forEach(e=>{e.hp=e.maxHp=500;});
  const normalEntry=entry('p8_observe_blackhole','sg_observe');
  const normalPlayback=preparePlayback(normalConfig,combatLabFixture('p8_observe_blackhole'),normalEntry);
  const normalStep=normalPlayback.steps[0];
  const normalEnemyHit=normalStep.results.find(r=>r.targetEnemyId);
  assert.ok(normalEnemyHit);
  assert.equal(normalEnemyHit.targetEnemyId,normalConfig.primaryId);
  assert.equal(normalEnemyHit.damageType,'true');
  assert.equal(normalEnemyHit.actualHpDamage,11);
  assert.equal(normalEnemyHit.actualDamage,11);
  const normalAllyHits=normalStep.results.filter(r=>!r.targetEnemyId&&r.kind==='damage');
  assert.equal(normalAllyHits.length,3);
  for(const hit of normalAllyHits){assert.equal(hit.actualHpDamage,5);assert.equal(hit.damageType,'true');}

  const keplerConfig=scenario('stargazer',3,3);
  keplerConfig.enemies[0].tier='ABYSS';keplerConfig.enemies[1].tier='MINION';keplerConfig.enemies[2].tier='MINION';
  keplerConfig.enemies.forEach(e=>{e.hp=e.maxHp=500;});
  keplerConfig.primaryId=keplerConfig.enemies[2].instanceId; // Selected a minion
  const keplerEntry=entry('p8_kepler_blackhole','sg_observe');
  assert.deepEqual(keplerEntry.equipmentIds,['sg_eye']);
  const keplerPlayback=preparePlayback(keplerConfig,combatLabFixture('p8_kepler_blackhole'),keplerEntry);
  const keplerStep=keplerPlayback.steps[0];
  assert.equal(keplerStep.results.length,1);
  assert.equal(keplerStep.results[0].targetEnemyId,keplerConfig.enemies[2].instanceId);
  assert.equal(keplerStep.results[0].damageType,'true');
  assert.equal(keplerStep.results[0].actualHpDamage,28);
  assert.equal(keplerStep.results[0].actualDamage,28);
  assert.equal(keplerStep.hpSnapshot.enemies[2].hp,472);
  assert.equal(keplerStep.hpSnapshot.enemies[0].hp,500);
});

test('the iframe loads shared production renderers and contains no live game socket',()=>{
  const html=readFileSync(new URL('../public/combat-fx-stage.html',import.meta.url),'utf8');
  const official=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.ok(html.includes('/js/combat/battle-renderers.js'));
  assert.ok(official.includes('js/combat/battle-renderers.js'));
  assert.ok(!html.includes('js/core/app.js'));assert.ok(!html.includes('socket.io'));
  for(const role of Object.keys(catalog.classes))assert.ok(catalog.scenes.some(s=>s.role===role),role);
});
