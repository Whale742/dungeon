// Generate deterministic Lab fixtures through the production gameplay engine.
// The Lab only consumes the resulting wire data and production presentation APIs.
import fs from 'node:fs';
import { Room } from '../game/Room.js';
import { equipItemToPlayer, LOOT_TABLE } from '../game/constants.js';
const avatar = '/BOSS/Ancient Guardian Golem.webp';
function scene(role, action, random = .9, configure = () => {}) {
  let wire;
  const socket = id => ({ id, join() {} });
  const room = new Room('LAB', socket('hero'), '冒險者', { to: () => ({ emit(name, data) { if (name === 'battle:presentation_queue') wire = data; } }) });
  room.addPlayer(socket('ally'), '同伴'); room.selectRole('hero', role); room.selectRole('ally', 'warrior');
  room.state = 'IN_BATTLE'; room.floor = 1; room.battleRound = 1;
  room.currentMonster = { name: '遠古守衛石像', avatar, hp: 500, maxHp: 500, attack: 25, resistance: null, ultName: '巨岩震擊' };
  if (action === 'w_cleave') room.players.hero.equips = [structuredClone(LOOT_TABLE.find(e => e.id === 'w_greatsword'))];
  if (action === 'b_nocturne' || action === 'b_frenzy') room.players.hero.equips = [structuredClone(LOOT_TABLE.find(e => e.id === 'b_violin'))];
  room.players.hero.action = action; room.players.ally.action = 'skip';
  configure(room);
  const old = Math.random; Math.random = typeof random === 'function' ? random : () => random;
  try { room.resolveTurnActions(); } finally { Math.random = old; room.clearTimer(); }
  return { room, wire };
}
const fixtures = {};
function add(id, label, role, action, random = .9, configure) {
  const { wire } = scene(role, action, random, configure);
  fixtures[id] = { label, steps: wire.queue.filter(s => s.category && s.type !== 'boss_action') };
}
for (const [id, label, role, action, random] of [
  ['archer_hit', '精準狙擊・命中', 'archer', 'a_shot', .9],
  ['archer_miss', '精準狙擊・MISS / DODGE ↑', 'archer', 'a_shot', .1],
  ['arrow_rain', '箭雨壓制', 'archer', 'a_rain', .9],
  ['arrow_friendly', '箭雨・誤傷隊友', 'archer', 'a_rain', .1],
  ['mage_blast', '奧術爆破', 'mage', 'm_blast', .9],
  ['mage_misfire', '法力走火・自傷', 'mage', 'm_blast', .1],
  ['mage_drain', '生命汲取・Overheal', 'mage', 'm_drain', .9],
  ['warrior_imbalance', '戰士・失衡 / 易傷', 'warrior', 'w_strike', .1],
  ['shield_apply', '盾勢・Apply', 'warrior', 'w_shield', .9],
  ['shield_crack', '盾裂・冷卻延長', 'warrior', 'w_shield', .1],
  ['assassin_crit', '刺客・暴擊 / 冷卻重置', 'assassin', 's_stab', .1],
  ['assassin_stealth', '暗影爆襲・0 層', 'assassin', 's_smoke', .9],
  ['bard_heal', '詩人・群體治療 / Temp HP', 'bard', 'b_heal', .9],
  ['bard_offkey', '詩人・走音', 'bard', 'b_heal', .1],
  ['bard_nocturne', '裝備技能・催眠夜曲', 'bard', 'b_nocturne', .1],
  ['bard_frenzy', '裝備技能・狂亂殺戮曲', 'bard', 'b_frenzy', .9],
  ['warrior_cleave', '裝備技能・狂怒重劈', 'warrior', 'w_cleave', .9],
  ['bard_buff', '狂熱協奏', 'bard', 'b_buff', .9],
  ['alchemy_flask_acid', '不穩定試劑瓶・腐蝕強酸', 'alchemist', 'alc_flask', .1],
  ['alchemy_flask_poison', '不穩定試劑瓶・劇毒煙霧', 'alchemist', 'alc_flask', .9],
  ['alchemy_acid', '強酸・命中後揭露裝備削弱', 'alchemist', 'alc_acid', .9],
  ['alchemy_poison', '劇毒煙霧・敵我 DoT', 'alchemist', 'alc_poison', .9],
  ['wolf_transform', '狼人變身・Max HP -20% / 咬擊', 'druid', 'dru_transform', .1],
  ['treant_transform', '樹精變身・DR 30%', 'druid', 'dru_transform', .9],
  ['summon_wolf', '幼狼召喚・動態數值', 'druid', 'dru_summon_wolf', .9],
  ['summon_treant', '小樹精召喚・動態數值', 'druid', 'dru_summon_treant', .9],
]) add('p6_' + id, label, role, action, random);
for (const [id, random] of [['success', .1], ['failure', .9]]) add('p6_alchemy_' + id,
  '命運煉成・' + id, 'alchemist', 'alc_fate', random, r => { r.players.hero.poisonTurns = 2; r.players.ally.bleedTurns = 1; });
add('p6_bard_revive', '同層甦生・雙方 EXHAUSTED', 'bard', 'b_revive', .9, r => {
  r.players.ally.hp = 0; r.clearPlayerDebuffs(r.players.ally); r.players.hero.targetPlayerId = 'ally';
});
const minions = () => [0,1,2].map(i => ({ id: 'minion'+i, name: '幼狼 '+(i+1), type: 'wolf', hp: 15, maxHp: 15, atk: 10 }));
add('p6_minion_combo', '三僕從・獨立聯擊', 'druid', 'skip', .9, r => { r.players.hero.minions = minions(); });
for (const [id, label, configure, random] of [
  ['boss_aoe', 'Boss AoE・混合 Hit / Dodge', r => { r.players.hero.role = 'archer'; }, .1],
  ['stealth_dodge', 'Boss・匿蹤殘影閃避', r => { r.players.hero.action = 'skip'; r.players.hero.stealthStacks = 2; r.players.hero.isHiddenThisRound = true; }, .9],
  ['shield_block', '盾勢・Block / HP', r => { r.players.hero.action = 'w_shield'; }, .9],
  ['temp_break', 'Temp HP・Absorb → Break', r => { r.players.hero.tempHp = 3; }, .9],
  ['treant_share', '樹精・傷害分攤 / DR 30%', r => { r.players.hero.druidForm = 'treant'; r.players.hero.maxHp += 100; r.players.hero.hp += 100; r.players.hero.druidFormTurns = 3; }, .9],
  ['treant_protect', '樹精・致命庇護 → 休眠', r => { r.players.hero.druidForm = 'treant'; r.players.hero.hp = 1; r.players.hero.druidFormTurns = 3; }, .9],
  ['minion_intercept', '僕從・攔截 / 死亡後移除', r => { r.players.hero.minions = minions().map(m => ({ ...m, hp: 3, maxHp: 3 })); }, .9],
  ['player_death', '玩家倒下・本層鎖定', r => { r.players.hero.hp = 1; }, .9],
]) {
  const { wire } = scene(id === 'stealth_dodge' ? 'assassin' : id.includes('treant') || id.includes('minion') ? 'druid' : 'warrior', 'skip', random, configure);
  fixtures['p6_' + id] = { label, steps: wire.queue.filter(s => s.type === 'boss_action') };
}
for (const [id, label, configure] of [
  ['victory', '完整勝利・致命攻擊 → Reward → Continue', r => { r.currentMonster.hp = 1; }],
  ['minion_victory', '僕從致命一擊 → 完整勝利', r => { r.players.hero.minions = minions(); r.currentMonster.hp = 25; }],
]) {
  const { room, wire } = scene(id === 'victory' ? 'warrior' : 'druid', 'basic', .9, configure);
  room.handleMonsterVictory(); room.clearTimer();
  fixtures['p6_' + id] = { label, steps: wire.queue.filter(s => s.category), victory: room.currentVictory };
}
{
  const { room } = scene('warrior', 'skip'); room.players.ally.hp = 0; room.clearPlayerDebuffs(room.players.ally);
  room.floor = 2; room.startRouteSelection(); room.clearTimer();
  fixtures.p6_floor_revive = { label: '下一層・20% HP 自動復活', revival: room.floorRevival };
}
for (const [id, label, fatal] of [['status_tick', 'Round Start・POISON / BLEED', false], ['dot_victory', 'DoT 致命傷 → 完整勝利', true]]) {
  const { room } = scene('alchemist', 'skip');
  let wire; room.io = { to: () => ({ emit(name, data) { if (name === 'battle:presentation_queue') wire = data; } }) };
  room.currentMonster.hp = fatal ? 3 : 100; room.currentMonster.poisonDmg = 5; room.currentMonster.poisonTurns = 2;
  room.players.hero.poisonTurns = fatal ? 0 : 2; room.players.hero.poisonDmg = 5; room.players.hero.bleedTurns = fatal ? 0 : 1;
  room.executeRoundStart(); room.clearTimer();
  if (fatal) room.handleMonsterVictory(); room.clearTimer();
  fixtures['p6_' + id] = { label, steps: wire.queue.filter(s => s.category), ...(fatal ? { victory: room.currentVictory } : {}) };
}

// Phase 6.1 fixtures resolve through exactly the same Room mechanics.
for (const n of [0,1,2,3,4]) add('p61_burst_' + n, '暗影爆襲・' + n + ' 層 / ' + (30+15*n), 'assassin', 's_smoke', .9, r => {
  r.players.hero.stealthStacks=n; r.players.hero.isHiddenThisRound=n>0;
});
for (const [id,label,random,progress] of [['crit1','暴擊 #1・進度',.1,0],['crit2','暴擊 #2・匿蹤 +1',.1,1],['stab_normal','暗影刺殺・35',.9,0],['emerge','隱身主動刺殺・解除隱身',.1,0]]) {
 add('p61_'+id,label,'assassin','s_stab',random,r=>{r.players.hero.critTowardStealth=progress;if(id==='emerge'){r.players.hero.stealthStacks=3;r.players.hero.isHiddenThisRound=true;}});
}
for (const [id,label,random] of [['follow_normal','追擊・Normal / 10',.9],['follow_crit','追擊・CRITICAL / 20',.1]]) {
 let followRoll=0;
 // A separate closure avoids any client random damage calculation.
 const rng=id==='follow_normal'?()=>followRoll++%2?.9:.1:random;
 const {wire}=scene('assassin','skip',rng,r=>{r.players.hero.stealthStacks=3;r.players.hero.isHiddenThisRound=true;r.players.ally.action='basic';});
 fixtures['p61_'+id]={label,steps:wire.queue.filter(s=>s.category==='FOLLOW_UP')};
}
for (const copies of [0,1,2,3]) {
 const {wire}=scene('assassin','skip',.1,r=>{
  const p=r.players.hero;p.stealthStacks=3;p.isHiddenThisRound=true;
  for(let i=0;i<copies;i++)equipItemToPlayer(p,structuredClone(LOOT_TABLE.find(e=>e.id==='s_blade')));
  r.players.ally.action='basic';
  for(let i=0;i<3;i++){const id='extra'+i;r.players[id]={...structuredClone(r.players.ally),id,name:'同伴 '+i,action:'basic'};}
 });
 fixtures['p61_follow_cap_'+copies]={label:'染毒刺刃 '+copies+' 把・追擊上限 '+(2+Math.max(0,copies-1)),steps:wire.queue.filter(s=>s.type==='player_action'||s.category==='FOLLOW_UP')};
}
for(const [id,label,aoe] of [['hidden_single','隱身・Boss 單次攻擊 MISS',false],['hidden_aoe','隱身・AoE 三人 Hit / 刺客 MISS',true]]) {
 const {wire}=scene('assassin','skip',.9,r=>{r.players.hero.stealthStacks=3;r.players.hero.isHiddenThisRound=true;if(aoe){r.battleRound=3;for(let i=0;i<2;i++){const id='extra'+i;r.players[id]={...structuredClone(r.players.ally),id,name:'同伴 '+i};}}});
 fixtures['p61_'+id]={label,steps:wire.queue.filter(s=>s.type==='boss_action')};
}
for(const stacks of [1,3]) {
 const {room}=scene('assassin','skip',.9);let wire;
 room.io={to:()=>({emit(name,data){if(name==='battle:presentation_queue')wire=data;}})};
 room.players.hero.stealthStacks=stacks;room.players.hero.poisonTurns=2;room.players.hero.poisonDmg=5;
 room.executeRoundStart();room.clearTimer();
 fixtures['p61_decay_'+stacks]={label:stacks===1?'回合初・匿蹤歸零 / 隱身退出':'回合初・匿蹤 -1 / 隱身進入 / Poison MISS',steps:wire.queue};
}
add('p61_shadow_armor','暗影皮甲・傷害 +10 / 无閃避','assassin','s_stab',.9,r=>equipItemToPlayer(r.players.hero,structuredClone(LOOT_TABLE.find(e=>e.id==='s_armor'))));
{
 const {room}=scene('assassin','skip');room.players.ally.role='mage';room.players.warrior={...structuredClone(room.players.ally),id:'warrior',role:'warrior',name:'戰士',hp:120,maxHp:120};room.handleTrapEvent();room.clearTimer();
 fixtures.p61_trap={label:'陷阱・刺客必定閃避 / 隊友受傷',trap:room.currentEvent};
}
for (const [kind,action] of [['treant','dru_summon_treant'],['wolf','dru_summon_wolf']]) {
 add('p61_resonance_'+kind,'自然共鳴・保留'+(kind==='treant'?'小樹精 HP +5':'幼狼 ATK +2')+' / 无回血','druid',action,.9,r=>equipItemToPlayer(r.players.hero,structuredClone(LOOT_TABLE.find(e=>e.id==='dru_resonance'))));
}
// Phase 7.1 fixtures use the same gameplay engine, including form snapshots and reload rolls.
for (const form of ['werewolf', 'treant']) {
  const configure = r => { r.players.hero.druidForm = form; r.players.hero.druidFormTurns = 2; };
  add('p71_' + form + '_basic', form + '・普攻 / Form portrait', 'druid', 'basic', .9, configure);
  add('p71_' + form + '_summon', form + '・召喚 / Form cast', 'druid', 'dru_summon_wolf', .9, configure);
  const { wire } = scene('druid', 'skip', .9, configure);
  fixtures['p71_' + form + '_target'] = { label: form + '・受擊 / Form target', steps: wire.queue.filter(s => s.type === 'boss_action') };
}
for (const count of [1, 2, 3]) {
  add('p71_minions_' + count, 'Druid → ' + count + ' 僕從追擊', 'druid', 'basic', .9, r => {
    r.players.hero.minions = Array.from({ length: count }, (_, i) => ({ id: 'm' + i, name: '幼狼' + (i+1),
      type: i === 1 ? 'treant' : 'wolf', minionIndex: i+1, hp: 15, maxHp: 15, atk: 10, ownerId: 'hero', alive: true }));
  });
}
for (const action of ['a_reload', 'a_frenzy_reload']) {
  for (const count of [0, 1, 2]) for (const [type, random] of [['pierce', .1], ['elemental', .5], ['burst', .9]]) {
    add('p71_' + action + '_' + count + '_' + type, (action === 'a_reload' ? '戰術上膛 ' : '狂熱裝填 ') + count + ' → ' + (action === 'a_reload' ? count+1 : 3) + ' / ' + type,
      'archer', action, random, r => {
        equipItemToPlayer(r.players.hero, structuredClone(LOOT_TABLE.find(e => e.id === 'a_crossbow')));
        r.players.hero.ammo = Array(count).fill('pierce');
      });
  }
}
add('p71_sword', '劍弧・寬幅 CSS fallback', 'warrior', 'basic');
add('p71_assassin_x', '刺客・雙刀 X / Critical', 'assassin', 's_stab', .1);
{
  const { wire } = scene('warrior', 'skip');
  fixtures.p71_boss_claw = { label: 'Boss・重爪素材 / 多目標', steps: wire.queue.filter(s => s.type === 'boss_action') };
}
fs.writeFileSync(new URL('../public/lab-combat-scenes.js', import.meta.url), '// Generated by tests/generate-combat-lab.js; production engine wire fixtures.\nconst PHASE6_LAB_SCENES = Object.freeze(' + JSON.stringify(fixtures) + ');\n');
console.log('Generated ' + Object.keys(fixtures).length + ' production combat fixtures');
