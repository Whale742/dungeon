import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import express from 'express';
import { once } from 'node:events';
import { CLASSES, LEADER_SKILLS, ROLE_DETAILS, LOOT_TABLE, getPlayerSkills } from './constants.js';
import { catalog, buildCatalog, skillCopyKey } from '../studio/catalog.js';
import { leaderSkillCopy, LEADER_COPY_PREFIX } from '../studio/leader-copy.js';
import { validateDraft } from '../studio/validation.js';
import { createStudioRouter } from '../studio/router.js';

const leaders = catalog.skill_copies.filter(row => catalog.skillMeta[row.role_id + ':' + row.skill_id]?.leader);
test('Published copy stays authoritative regardless of old mechanic keywords',()=>{
  const scope=vm.createContext({window:{dispatchEvent(){}},Event:class{}});
  vm.runInContext(fs.readFileSync(new URL('../public/js/studio/content-store.js',import.meta.url),'utf8'),scope);
  const content=scope.window.StudioContent;content.state.defaults=catalog;
  const data={role_profiles:[{role_id:'samurai',name_zh:'自訂武士',passive_short:'雲端被動簡介',passive_full:'武魂最多 8 層'}],
    skill_copies:[{role_id:'samurai',skill_id:'sa_tsubame',display_name:'自訂燕返',full_copy:'消耗 4 層武魂，四次單體攻擊'},
      {role_id:'samurai',skill_id:'passive',short_copy:'歷史技能被動',full_copy:'歷史技能被動'},
      {role_id:'stargazer',skill_id:'sg_observe',full_copy:'固定 5 點真實撕裂傷害'}],
    story_copies:[{story_key:'equip.samurai.sa_haori',title:'殘心羽織',body:'額外獲得武魂'},
      {story_key:'equip.stargazer.sg_eye',title:'克卜勒的深空天眼',body:'10點真實傷害'}]};
  const original=JSON.stringify(data);content.install(data);
  assert.equal(content.find('role_profiles','samurai').passive_full,'武魂最多 8 層');
  assert.equal(content.find('skill_copies','samurai:sa_tsubame').full_copy,'消耗 4 層武魂，四次單體攻擊');
  assert.equal(content.find('skill_copies','stargazer:sg_observe').full_copy,'固定 5 點真實撕裂傷害');
  assert.equal(content.find('story_copies','equip.samurai.sa_haori').body,'額外獲得武魂');
  assert.equal(content.find('story_copies','equip.stargazer.sg_eye').body,'10點真實傷害');
  assert.equal(content.skill('samurai',{id:'passive'}).full_copy,'武魂最多 8 層');
  assert.equal(content.skill('samurai',{id:'passive'}).short_copy,'雲端被動簡介');
  assert.equal(JSON.stringify(data),original);
  assert.equal(content.find('skill_copies','mage:m_blast').full_copy,catalog.skill_copies.find(s=>s.role_id==='mage'&&s.skill_id==='m_blast').full_copy);
  data.skill_copies[0].full_copy='重新發布後的自訂說明';content.install(data);
  assert.equal(content.skill('samurai',{id:'sa_tsubame'}).full_copy,'重新發布後的自訂說明');
});

test('Catalog keeps contextual copies and event compatibility out of primary skill editing',()=>{
  for(const [role,expected] of [['gladiator',7],['alchemist',5]]){
    const current=catalog.skill_copies.filter(s=>s.role_id===role&&catalog.skillMeta[role+':'+s.skill_id].editable!==false&&!catalog.skillMeta[role+':'+s.skill_id].presentationOnly);
    assert.equal(current.length,expected);
  }
  for(const [role,ids] of Object.entries({gladiator:['g_sacrifice','g_arena'],sage:['basic','sge_deduce','sge_induce'],alchemist:['alc_acid','alc_poison']}))for(const id of ids){
    assert.equal(catalog.skillMeta[role+':'+id].editable,false);
    assert.ok(catalog.skill_copies.some(s=>s.role_id===role&&s.skill_id===id));
  }
  for(const id of ['sage:basic__solve','sage:sge_deduce__hypothesis','druid:basic__werewolf','druid:basic__bear','archer:a_reload','bard:b_frenzy'])assert.notEqual(catalog.skillMeta[id]?.editable,false);
  for(const id of ['warrior:w_counter','samurai:sa_counter','druid:dru_claw','dreamweaver:dw_butterfly_result','sage:sge_equation'])assert.equal(catalog.skillMeta[id].presentationOnly,true);
});

test('Editor excludes orphan rows and hidden drafts while gameplay can still read compatibility data',()=>{
  const scope=vm.createContext({window:{dispatchEvent(){}},Event:class{}});
  vm.runInContext(fs.readFileSync(new URL('../public/js/studio/content-store.js',import.meta.url),'utf8'),scope);
  const content=scope.window.StudioContent;content.state.defaults=catalog;
  const legacy={story_key:'equip.stargazer.sg_kepler',title:'舊天眼',body:'舊說明',status:'published'};
  content.install({story_copies:[legacy],skill_copies:[{role_id:'alchemist',skill_id:'alc_poison',full_copy:'歷史試劑說明',status:'published'}]});
  assert.equal(content.isEditable('story_copies',legacy),false);
  assert.equal(content.isEditable('story_copies',{story_key:'equip.stargazer.sg_eye'}),true);
  assert.equal(content.isEditable('skill_copies',{role_id:'gladiator',skill_id:'g_arena',status:'draft'}),false);
  assert.equal(content.isEditable('skill_copies',{role_id:'gladiator',skill_id:'g_arena__arena'}),true);
  assert.equal(content.isEditable('skill_copies',{role_id:'alchemist',skill_id:'passive'}),false);
  assert.equal(content.isEditable('skill_copies',{role_id:'alchemist',skill_id:'alc_poison'}),false);
  assert.equal(content.find('skill_copies','alchemist:alc_poison').full_copy,'歷史試劑說明');
  assert.ok(content.rows('story_copies').some(s=>s.story_key===legacy.story_key));
});

test('every class has editable leader copy without adding selectable combat skills', () => {
  assert.equal(leaders.length, Object.keys(CLASSES).length);
  for (const [role, config] of Object.entries(CLASSES)) {
    const skill = leaderSkillCopy(role);
    assert.equal(skill.id, LEADER_SKILLS[role].id);
    assert.ok(!config.skills.some(value => value.id === skill.id));
    const row = leaders.find(value => value.role_id === role);
    assert.equal(row.display_name, skill.name);
    assert.ok(row.short_copy.startsWith(LEADER_COPY_PREFIX));
    assert.ok(row.full_copy.startsWith(LEADER_COPY_PREFIX));
    if (skill.type === 'ACTIVE') assert.match(row.full_copy, /每場戰鬥限使用一次/);
  }
});
test('leader drafts accept custom text and keep exactly one required prefix', () => {
  const row = validateDraft({kind:'skill', role_id:'warrior', key:'leader_warrior', data:{display_name:'自訂隊長技', short_copy:'新精簡文案', full_copy:LEADER_COPY_PREFIX + LEADER_COPY_PREFIX + '新完整文案'}});
  assert.equal(row.short_copy, LEADER_COPY_PREFIX + '新精簡文案');
  assert.equal(row.full_copy, LEADER_COPY_PREFIX + '新完整文案');
  assert.equal(row.display_name, '自訂隊長技');
  assert.throws(() => validateDraft({kind:'skill', role_id:'mage', key:'leader_warrior', data:{}}), /未知/);
});
test('class archive and room panel read published leader text in both copy modes', () => {
  const nodes = Object.fromEntries(['lobbyRoleDetailed','lobbySkillName','lobbySkillMeta','lobbySkillCopy','lobbyRoleDescription'].map(id => [id,{checked:false,classList:{toggle(){}}}]));
  const context = vm.createContext({localStorage:{getItem(){return null;}},window:{StudioContent:{skill(role,skill){return skill.id === 'leader_warrior' ? {display_name:'雲端隊長名',short_copy:'雲端精簡',full_copy:LEADER_COPY_PREFIX+'雲端完整'} : null;}}},document:{getElementById(id){return nodes[id];},querySelectorAll(){return [];}}});
  vm.runInContext(fs.readFileSync(new URL('../public/js/shared/skill-copy.js', import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../public/js/lobby/lobby.js', import.meta.url),'utf8'),context);
  context.classes=Object.fromEntries(Object.entries(CLASSES).map(([role,value]) => [role,{...value,leaderSkill:leaderSkillCopy(role)}]));
  vm.runInContext('registerSkillCopies(classes); lobbyRoleUi.data={classes,details:{}}; lobbyRoleUi.tab="leader";',context);
  for (const role of Object.keys(CLASSES)) {
    context.role=role;
    for (const detailed of [false,true]) {
      nodes.lobbyRoleDetailed.checked=detailed;
      vm.runInContext('lobbyRoleUi.role=role;updateRoleDescriptionPanel();',context);
      assert.ok(nodes.lobbySkillCopy.textContent.startsWith(LEADER_COPY_PREFIX));
      assert.ok(!nodes.lobbySkillCopy.textContent.includes(LEADER_COPY_PREFIX+LEADER_COPY_PREFIX));
      if (role==='warrior') {
        assert.equal(nodes.lobbySkillName.textContent,'雲端隊長名');
        assert.equal(nodes.lobbySkillCopy.textContent,LEADER_COPY_PREFIX+(detailed?'雲端完整':'雲端精簡'));
      }
    }
  }
});
test('Studio accepts leader drafts and publishes through existing Supabase RPC', async t => {
  const saved = [], calls = [];
  const cloud = {upsert:async(table,row)=>{saved.push({table,row});return [row];},rows:async()=>saved.map(value=>value.row),request:async(route,options)=>{calls.push({route,body:options.body});return 1;}};
  const app=express();app.use('/api/studio',createStudioRouter({env:{STUDIO_WRITE_TOKEN:'test-token'},cloud,onPublish:async()=>{}}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port+'/api/studio';
  const request=(route,body)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Write-Token':'test-token'},body:JSON.stringify(body)});
  const item={kind:'skill',role_id:'assassin',key:'leader_assassin',data:{display_name:'新隊長技',short_copy:'精簡',full_copy:'詳細'}};
  assert.equal((await request('/drafts',{items:[item]})).status,200);
  assert.equal(saved[0].table,'skill_copies');
  assert.equal(saved[0].row.full_copy,LEADER_COPY_PREFIX+'詳細');
  assert.equal((await request('/publish',{items:[{kind:item.kind,role_id:item.role_id,key:item.key}]})).status,200);
  assert.equal(calls[0].route,'/rest/v1/rpc/studio_publish_one');
  assert.deepEqual(calls[0].body,{p_kind:'skill',p_key:'leader_assassin',p_role_id:'assassin'});
});

test('Ordinary and contextual copy survives draft, publish and public client reload',async t=>{
  const drafts=new Map(),published={role_profiles:[],skill_copies:[],story_copies:[],game_assets:[],asset_bindings:[]};
  const env={STUDIO_WRITE_TOKEN:'test-token',SUPABASE_PUBLISHABLE_KEY:'test-public'};
  const cloud={upsert:async(table,row)=>{drafts.set(table+':'+(row.role_id||'')+':'+(row.skill_id||''),row);return [row];},rows:async(table,query)=>{const q=new URLSearchParams(query);return [...drafts.entries()].filter(([key,row])=>key.startsWith(table+':')&&[...q].every(([field,value])=>String(row[field])===value.slice(3))).map(([,row])=>row);},request:async(route,{body})=>{
    assert.equal(route,'/rest/v1/rpc/studio_publish_one');const table=body.p_kind==='role'?'role_profiles':'skill_copies';
    const row=[...drafts.values()].find(r=>body.p_kind==='role'?r.role_id===body.p_key:r.role_id===body.p_role_id&&r.skill_id===body.p_key);
    published[table]=published[table].filter(r=>body.p_kind==='role'?r.role_id!==row.role_id:r.role_id!==row.role_id||r.skill_id!==row.skill_id);
    published[table].push({...row,status:'published'});return 1;
  }};
  const app=express();app.use('/api/studio',createStudioRouter({env,cloud,onPublish:async()=>{}}));
  app.get('/rest/v1/:table',(req,res)=>res.json(published[req.params.table]||[]));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;env.SUPABASE_URL=origin;
  const scope=vm.createContext({window:{dispatchEvent(){}},Event:class{},AbortSignal,fetch:(url,options)=>fetch(new URL(url,origin),options)});
  vm.runInContext(fs.readFileSync(new URL('../public/js/studio/content-store.js',import.meta.url),'utf8'),scope);
  const content=scope.window.StudioContent;
  for(const [role,key] of [['alchemist','basic'],['alchemist','alc_flask'],['alchemist','alc_fate'],['gladiator','g_sacrifice__outside'],['gladiator','g_sacrifice__arena']]){
    const item={kind:'skill',role_id:role,key,data:{display_name:'發布的自訂名稱',short_copy:'發布的簡介',full_copy:'自訂完整文案，沒有機制關鍵字'}};
    for(const [route,body] of [['drafts',{items:[item]}],['publish',{items:[{kind:'skill',role_id:role,key}]}]]){
      const result=await fetch(origin+'/api/studio/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Write-Token':'test-token'},body:JSON.stringify(body)});assert.equal(result.status,200,await result.text());
    }
    await content.load({defaults:true,force:true});const row=content.find('skill_copies',role+':'+key);
    assert.equal(row.display_name,item.data.display_name);assert.equal(row.full_copy,item.data.full_copy);
  }
  await content.load({force:true});assert.equal(content.skill('gladiator',{id:'g_sacrifice'}).full_copy,'自訂完整文案，沒有機制關鍵字');
});

test('Fresh catalogs and every selectable context retain stable actions and published copy keys',()=>{
  const rebuilt=buildCatalog();assert.deepEqual(rebuilt.skillMeta,catalog.skillMeta);
  const scope=vm.createContext({window:{dispatchEvent(){}},document:{addEventListener(){}},Event:class{}});
  vm.runInContext(fs.readFileSync(new URL('../public/js/studio/content-store.js',import.meta.url),'utf8'),scope);
  const content=scope.window.StudioContent;scope.StudioContent=content;content.state.defaults=catalog;
  content.install({skill_copies:catalog.skill_copies.map(s=>({...s,status:'published',display_name:s.role_id+':'+s.skill_id}))});
  vm.runInContext(fs.readFileSync(new URL('../public/js/studio/game-bridge.js',import.meta.url),'utf8'),scope);
  for(const role of Object.keys(CLASSES))for(const player of [{role,equips:[]},{role,equips:[],arenaActive:true},{role,equips:[],sagePhase:'solve'},...['werewolf','treant','bear'].map(druidForm=>({role,equips:[],druidForm})),...LOOT_TABLE.filter(e=>e.role===role).map(e=>({role,equips:[e]}))]){
    for(const skill of getPlayerSkills(player)){
      const key=skillCopyKey(player,skill),row=catalog.skill_copies.find(s=>s.role_id===role&&s.skill_id===key);
      if(!row)continue;
      const display=scope.window.StudioGame.skillDisplay(role,skill,player);
      assert.equal(display.id,skill.id);assert.equal(display.cd,skill.cd);assert.equal(display.label,role+':'+key);
    }
  }
});
