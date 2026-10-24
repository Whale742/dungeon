import {v2Copy,v2SkillCopy} from '../game/v2-content.js';
import {leaderSkillCopy} from './leader-copy.js';
import {SPECIAL_EVENT_COPY} from '../game/special-event-content.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { CLASSES, ROLE_DETAILS, LOOT_TABLE, ENCOUNTERS, STORY_TEXTS, ROUTE_STORIES, ROUTE_BOSS_STORIES, BATTLE_NARRATIVES, getPlayerSkills, EXCLUSIVE_MINIONS, GENERAL_MINIONS, ABYSS_MINIONS } from '../game/constants.js';

const publicDir = new URL('../public/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, publicDir), 'utf8');
// Only trusted checked-in JS is evaluated. CMS values are always plain data.
function localConfig(source, expression, globals = {}) {
  return vm.runInNewContext(source + '\n' + expression, globals, { timeout: 4000 });
}
const profiles = localConfig(read('js/lobby/lobby.js').split('const LOBBY_ROLE_ORDER')[0], 'LOBBY_ROLE_PROFILES');
const recruitFields = localConfig(read('js/lobby/recruit-copy.js'), 'RecruitCopy.fields');
const sfx = localConfig(read('js/audio/sfx-assets.js'), '({assets:SFX_ASSETS, aliases:SFX_ALIASES, profiles:SFX_PRESENTATION_PROFILES})');
const bgm = localConfig(read('js/audio/bgm.js').split('// Music')[0], 'BGM_TRACKS');
const fixture = localConfig(read('js/lab/lab-combat-scenes.js'), 'PHASE6_LAB_SCENES');
const grades = { S:5, A:4, B:3, C:2, D:1 };
export const radarFields = ['radar_output','radar_survival','radar_team','radar_stability','radar_difficulty'];
export const assetKeyForPath = value => 'local.' + createHash('sha256').update(value).digest('hex').slice(0, 20);
export const storyKey = (...parts) => parts.map(encodeURIComponent).join('.');
export function narrativeVariant(player, extra = {}) {
  if (player.role === 'druid') return player.druidForm || 'human';
  if (player.role === 'archer' && player.equips?.some(e => e.id === 'a_crossbow')) return 'crossbow';
  if (player.role === 'assassin' && extra.isCrit) return 'critical';
  if (player.role === 'alchemist' && (extra.flaskType==='poison'||extra.outcome==='alchemy_poison')) return 'poison';
  return 'default';
}
export function skillCopyKey(player, skill) {
  if (player.role === 'sage') return skill.id + '__' + (player.sagePhase === 'solve' ? 'solve' : 'hypothesis');
  if (player.role === 'gladiator') return skill.id === 'basic' ? skill.id : skill.id + (player.arenaActive ? '__arena' : '__outside');
  if (skill.id === 'basic' && player.role === 'archer' && player.equips?.some(e => e.id === 'a_crossbow')) return 'basic__crossbow';
  if (skill.id === 'basic' && player.role === 'druid' && player.druidForm) return 'basic__' + player.druidForm;
  return skill.id;
}
export function buildCatalog() {
  const roles = Object.entries(CLASSES).map(([id, c]) => {
    const p = profiles[id], d = ROLE_DETAILS[id];
    return { role_id:id, name_zh:c.name, name_en:p.enName, short_intro:c.desc, full_intro:c.desc, position_label:d?.type || '', tags:[...p.tags], passive_short:v2Copy[id].skills.passive.short_copy, passive_full:d?.passive || c.passive || c.desc, ...Object.fromEntries(radarFields.map((f,i) => [f, grades[p.radar[i]] || p.radar[i]])) };
  });
  const skills = new Map(), skillMeta = {}, stories = [], bindings = new Map(), assets = new Map(), usage = {};
  const addSkill = (role, s, key = s.id, variant = '') => {
    const k = role + ':' + key; if (skills.has(k)) return;
    const base = CLASSES[role].skills.find(x => x.id === s.id);
    const idx = CLASSES[role].skills.indexOf(base);
    const detail = !variant && base?.label === s.label ? ROLE_DETAILS[role]?.skills?.[idx]?.desc : null;
    const contextual=text=>role==='gladiator'&&key==='g_arena__arena'?text.replace('怒氣層數×10','怒氣層數×{rageMultiplier}'):text;
    skills.set(k, { role_id:role, skill_id:key, display_name:s.label, short_copy:contextual(s.shortDesc || s.desc || ''), full_copy:contextual(detail || s.desc || '') });
    const canonical=v2SkillCopy(role,key);if(canonical)Object.assign(skills.get(k),canonical);
    skillMeta[k] = { actionId:s.id, variant, contextual:!!s.contextualCopy };
  };
  for (const [role, c] of Object.entries(CLASSES)) {
    c.skills.forEach(s => addSkill(role,s));
    const players = [{role,equips:[],hp:50}, ...LOOT_TABLE.filter(e=>e.role===role).map(e=>({role,equips:[e],hp:50})),
      {role,equips:[],hp:50,arenaActive:true}, {role,equips:[],hp:50,sagePhase:'solve'},
      ...['werewolf','treant','bear'].map(druidForm=>({role,equips:[],hp:50,druidForm}))];
    for (const p of players) for (const s of getPlayerSkills(p)) {
      const key = skillCopyKey(p,s); addSkill(role,s,key,key !== s.id ? key.slice(s.id.length + 2) : '');
    }
    addSkill(role,{id:'passive',label:'被動與特性',desc:ROLE_DETAILS[role]?.passive || c.passive || c.desc});
    const leader = leaderSkillCopy(role);
    if (leader) {
      addSkill(role, leader);
      skillMeta[role + ':' + leader.id].leader = true;
    }
  }
  // Additional non-selectable action IDs are taken from real production fixtures.
  for(const scene of Object.values(fixture))for(const step of scene.steps||[])if(step.sourceRole&&CLASSES[step.sourceRole]&&step.actionId&&step.actionId!=='skip')addSkill(step.sourceRole,{id:step.actionId,label:step.skillName||step.actionId,desc:step.narrative||step.detail||''});
  addSkill('bard',{id:'b_revive',label:'甦生之歌',desc:'對已倒下且可復活的隊友施放甦生之歌。可否施放與回復量仍由伺服器判定。'});
  const addStory = (key, category, title, body = '', paragraphs = []) => stories.push({story_key:key, category, title, body, paragraphs});
  for (const field of recruitFields) addStory(field.key, 'recruit', field.label, field.body);
  for (const [key,s] of Object.entries(STORY_TEXTS)) addStory('story.'+key,key==='prologue'?'prologue':'route',typeof s.title === 'function' ? '【第 {floor} 層・迷霧分歧點】' : s.title,'',s.paragraphs);
  for (const [route, outcomes] of Object.entries(ROUTE_STORIES)) for (const [outcome, data] of Object.entries(outcomes)) addStory(storyKey('route',route,outcome),typeof data==='string'?'route':outcome==='battle'?'boss':outcome,typeof data==='string'?data:data.title || route,typeof data==='string'?data:data.story);
  for (const [route, bosses] of Object.entries(ROUTE_BOSS_STORIES)) for (const [boss,text] of Object.entries(bosses)) addStory(storyKey('boss',route,boss),'boss',boss,text);
  for (const [boss, actions] of Object.entries(BATTLE_NARRATIVES.monsters)) for (const [action,text] of Object.entries(actions)) addStory(storyKey('battle','monster',boss,action),'battle',boss+' '+action,text);
  for (const [role,c] of Object.entries(CLASSES)) {
    const ids = [...new Set([...skills.values()].filter(s=>s.role_id===role).map(s=>skillMeta[role+':'+s.skill_id].actionId))].filter(id=>id!=='passive'&&!skillMeta[role+':'+id]?.leader);
    const variants = [{role,name:'{player}',equips:[]}];
    if(role==='druid') for(const druidForm of ['werewolf','treant','bear'])variants.push({role,name:'{player}',equips:[],druidForm});
    if(role==='archer')variants.push({role,name:'{player}',equips:[{id:'a_crossbow',name:'改良型重弩'}]});
    for (const p of variants) for (const id of ids) for (const extra of [{},{isCrit:true},{flaskType:'poison'}]) {
      const key=storyKey('battle','player',role,id,narrativeVariant(p,extra));
      if (!stories.some(s=>s.story_key===key)) addStory(key,'battle',c.name+' '+id,BATTLE_NARRATIVES.getPlayerSkillNarrative(p,id,extra));
    }
  }
  addStory('event.victory','battle','勝利','💀 **{boss}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！');
  addStory('event.floor','floor','樓層開始','【第 {floor} 層・深淵探索】');
  addStory('event.routeTransition','route','路線結算','小隊踏入【{route}】，正向第 {floor} 層深處探索前行……');
  addStory('event.bossWeakened','boss','受傷首領','（⚠️ 遠處傳來粗重的喘息聲，該BOSS在先前的戰鬥中遭受重創，處於負傷狀態！）');
  addStory('event.shop.normal','event','迷宮行商據點','迷霧散去，一支受傷歇息的冒險者商隊向你們展示了貨品。');
  addStory('event.shop.shady','event','迷宮行商據點','迷宮深處，一名披著舊斗篷的商人向冒險小隊招手，攤位上擺滿各式裝備與補給品。他熱情地邀請眾人停下腳步。');
  addStory('event.shop.prep','event','出發備戰據點・後勤物資處','在邁向深淵未知迷霧前，後勤物資官向小隊展示了可用物資，整裝待發！');
  addStory('event.chest','event','發現古老寶箱！','在陰暗的地城角落，靜靜佇立著一具裝飾精美、未被開啟的神秘寶箱。');
  addStory('event.chest.mimic','event','奇怪的寶箱',SPECIAL_EVENT_COPY.ambush);
  addStory('event.shop.shady.leave','event','奸商攔路',SPECIAL_EVENT_COPY.merchantLeave);
  addStory('event.shop.shady.theft','event','奸商識破行竊',SPECIAL_EVENT_COPY.merchantTheft);
  addStory('enemy.shady_merchant','battle','奸商',SPECIAL_EVENT_COPY.merchant);
  addStory('enemy.treasure_mimic','battle','奇怪的寶箱',SPECIAL_EVENT_COPY.mimic);
  addStory('event.trap','event','致命陷阱','地面傳來機關被觸發的清脆聲響，致命的尖刺與毒霧瞬間噴湧而出！');
  addStory('event.random.wandering_merchant','event','迷途流浪商人','一名背負巨大行囊的流浪行者向你們招手，願意以物易物或分享前方情報。');
  addStory('event.random.altar','event','古老深淵祭壇','一座刻滿禁忌古代銘文的石質祭壇，散發著令人心悸的威壓。');
  addStory('event.random.gamble','event','命運賭局','迷霧中擺著一張黑曜石牌桌，一名神秘的發牌人微笑著洗牌。');
  addStory('event.random.reforge','event','黑鐵重鑄工坊','一座地底矮人廢棄的鍛造台，殘存的爐火依然熾熱。');
  for (const item of LOOT_TABLE) {
    addStory(storyKey('equip', item.role, item.id), 'equipment', item.name, item.desc || '');
  }
  const mime = {'.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.avif':'image/avif','.ico':'image/x-icon','.svg':'image/svg+xml'};
  const localAsset = (url, category, binding) => {
    let stat; try { stat=fs.statSync(new URL('.'+url, publicDir)); } catch { return; }
    if(!stat.isFile())return;
    const key=assetKeyForPath(url), type=url.startsWith('/sound/')?'audio':'image';
    if(!assets.has(key))assets.set(key,{asset_key:key,display_name:decodeURIComponent(url.split('/').pop()),kind:type,category,source_type:'local',local_path:url,storage_bucket:null,storage_path:null,external_url:null,mime_type:mime[path.extname(url)]||null,size_bytes:stat.size,preload_group:category,volume:1,is_public:true});
    if(binding)bindings.set(binding,{binding_key:binding,asset_key:key,fallback_path:url,preload_group:category,volume_override:null});
  };
  for(const [role,c] of Object.entries(CLASSES)) { localAsset(c.avatar,'roles','role.'+role+'.avatar');
    for(const [form,d] of Object.entries(c.forms||{}))localAsset(d.avatar,'roles',`role.${role}.form.${form}`);
    for(const [type,list] of Object.entries(c.summons||{}))list.forEach((d,i)=>localAsset(d.avatar,'roles',`role.${role}.summon.${type}.${i+1}`));
  }
  for(const item of LOOT_TABLE)if(item.icon)localAsset(item.icon,'effects',`equip.${item.role}.${item.id}.icon`);
  for(const boss of ENCOUNTERS)localAsset(boss.avatar,'bosses','boss.'+encodeURIComponent(boss.name)+'.avatar');
  for(const minion of [...EXCLUSIVE_MINIONS, ...GENERAL_MINIONS, ...ABYSS_MINIONS])localAsset(minion.avatar,'bosses','minion.'+encodeURIComponent(minion.name)+'.avatar');
  for(const [key,p] of Object.entries(sfx.assets)){localAsset(p.src,'sfx','sfx.'+key);usage[assetKeyForPath(p.src)]=['js/audio/sfx-assets.js','js/presentation/presentation-core.js'];}
  for(const [key,p] of Object.entries(bgm)){localAsset(p.src,'bgm','bgm.'+key);usage[assetKeyForPath(p.src)]=['js/audio/bgm.js'];}
  localAsset('/assets/bag1.webp','ui','ui.bag.closed');
  localAsset('/assets/bag2.webp','ui','ui.bag.open');
  (usage[assetKeyForPath('/assets/bag1.webp')] ||= []).push('index.html', 'js/core/app.js', 'js/inventory/bag-presentation.js');
  (usage[assetKeyForPath('/assets/bag2.webp')] ||= []).push('index.html', 'js/core/app.js', 'js/inventory/bag-presentation.js');
  const files=fs.readdirSync(publicDir).filter(f=>/\.(js|css|html)$/.test(f));
  for(const name of files) {
    const source=read(name); const urls=[...source.matchAll(/["'`](\/(?:photo|BOSS|sound|assets|icon|buff icon)\/[^"'`<>\r\n$]+?\.(?:webp|png|svg|jpg|jpeg|mp3|wav|ogg))["'`]/g)].map(m=>m[1]);
    for(const url of urls) { localAsset(url,url.startsWith('/BOSS/')?'bosses':url.startsWith('/photo/')?'roles':url.startsWith('/sound/')?'sfx':url.includes('background')?'backgrounds':'effects','path.'+assetKeyForPath(url)); (usage[assetKeyForPath(url)] ||= []).push(name); }
  }
  // Register every actual media file, including ones with no current binding.
  function walk(dir, prefix) { for(const entry of fs.readdirSync(dir,{withFileTypes:true})) { const url=prefix+'/'+entry.name;
    if(entry.isDirectory()){ if(entry.name!=='temp')walk(path.join(dir,entry.name),url); }
    else if(mime[path.extname(entry.name)])localAsset(url,prefix.startsWith('/sound')?(entry.name.startsWith('bgm-')?'bgm':'sfx'):prefix.startsWith('/BOSS')?'bosses':prefix.startsWith('/photo')?'roles':entry.name.includes('background')?'backgrounds':'effects','path.'+assetKeyForPath(url));
  }}
  for(const dir of ['photo','BOSS','sound','assets','icon','buff icon'])if(fs.existsSync(new URL(dir,publicDir)))walk(fileURLToPath(new URL(dir,publicDir)),'/'+dir);
  const scenes=Object.entries(fixture).map(([id,s])=>({id,label:s.label,role:s.role,skills:[...new Set((s.steps||[]).map(x=>x.actionId).filter(Boolean))]}));
  return {schemaVersion:1,role_profiles:roles,skill_copies:[...skills.values()],story_copies:stories,game_assets:[...assets.values()],asset_bindings:[...bindings.values()],skillMeta,usage,scenes,sfxProfiles:sfx.profiles};
}
export const catalog = buildCatalog();
