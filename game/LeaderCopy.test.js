import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import express from 'express';
import { once } from 'node:events';
import { CLASSES, LEADER_SKILLS, ROLE_DETAILS } from './constants.js';
import { catalog } from '../studio/catalog.js';
import { leaderSkillCopy, LEADER_COPY_PREFIX } from '../studio/leader-copy.js';
import { validateDraft } from '../studio/validation.js';
import { createStudioRouter } from '../studio/router.js';

const leaders = catalog.skill_copies.filter(row => catalog.skillMeta[row.role_id + ':' + row.skill_id]?.leader);
test('Old published Samurai descriptions project current mechanics without cloud writes or replacing current custom copy',()=>{
  const scope=vm.createContext({window:{dispatchEvent(){}},Event:class{}});
  vm.runInContext(fs.readFileSync(new URL('../public/js/studio/content-store.js',import.meta.url),'utf8'),scope);
  const content=scope.window.StudioContent;
  content.registerMechanicsCopy(CLASSES,ROLE_DETAILS);
  const data={role_profiles:[{role_id:'samurai',name_zh:'自訂武士',passive_full:'武魂最多 8 層'}],
    skill_copies:[{role_id:'samurai',skill_id:'sa_tsubame',display_name:'自訂燕返',full_copy:'消耗 4 層武魂，四次單體攻擊'},
      {role_id:'mage',skill_id:'m_blast',full_copy:'保留法師自訂內容'}],
    story_copies:[{story_key:'equip.samurai.sa_haori',title:'殘心羽織',body:'額外獲得武魂'}]};
  const original=JSON.stringify(data);content.install(data);
  assert.ok(content.find('role_profiles','samurai').passive_full.includes('殘心'));
  assert.equal(content.find('role_profiles','samurai').name_zh,'自訂武士');
  assert.equal(content.find('skill_copies','samurai:sa_tsubame').display_name,'自訂燕返');
  assert.ok(content.find('skill_copies','samurai:sa_tsubame').full_copy.includes('N 段全體'));
  assert.ok(content.rows('story_copies')[0].body.includes('餘韻不絕'));
  assert.equal(content.find('skill_copies','mage:m_blast').full_copy,'保留法師自訂內容');
  assert.equal(JSON.stringify(data),original);
  data.skill_copies[0].full_copy='新版殘心與燕返自訂說明';content.install(data);
  assert.equal(content.find('skill_copies','samurai:sa_tsubame').full_copy,'新版殘心與燕返自訂說明');
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
