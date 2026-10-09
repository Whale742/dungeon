import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { CLASSES, getPlayerSkills } from '../game/constants.js';
import { catalog, radarFields, skillCopyKey, narrativeVariant } from '../studio/catalog.js';
import { kinds, validateDraft, validateAsset, validateUpload, safePath } from '../studio/validation.js';
import { mountStudio, tokenMatches } from '../studio/router.js';
import { contentCache, createRoomContent, refreshPublished, renderTemplate } from '../studio/content.js';
import { Room } from '../game/Room.js';

const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const item=(kind,row)=>({kind,key:row[kinds[kind].key],...(kind==='skill'?{role_id:row.role_id}:{}),data:Object.fromEntries(kinds[kind].fields.map(f=>[f,row[f]]))});
async function fixture(env={STUDIO_WRITE_TOKEN:'test-token',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',SUPABASE_SECRET_KEY:'secret-test-key'}){
  const calls=[],data=structuredClone(catalog);for(const spec of Object.values(kinds))data[spec.table]=data[spec.table].map(row=>({...row,status:'draft'}));
  const cloud={configured:true,rows:async(table,query)=>{calls.push({table,query});if(table==='content_revisions')return [{id:1,entity_type:'role',entity_key:'samurai',published_data:{...catalog.role_profiles.find(r=>r.role_id==='samurai'),status:'published',version:1}}];return data[table].filter(row=>{const keyField=Object.values(kinds).find(s=>s.table===table)?.key;const match=query?.match(new RegExp(keyField+'=eq.([^&]+)'));return !match||row[keyField]===decodeURIComponent(match[1]);});},upsert:async(table,row,conflict)=>{calls.push({table,row,conflict});return [row];},request:async(route,options)=>{calls.push({route,...options});return []}};
  const app=express();mountStudio(app,publicDir,{env,cloud,onPublish:async()=>{}});app.use(express.static(publicDir));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  return {calls,cloud,data,base,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}),request:(route,options={})=>fetch(base+route,{...options,headers:{'Content-Type':'application/json',...(options.token===false?{}:{'X-Studio-Write-Token':'test-token'}),...options.headers},body:options.body?JSON.stringify(options.body):undefined})};
}
test('Studio catalog covers all 12 roles, derived IDs, integer radar and real local media',()=>{
  assert.equal(catalog.role_profiles.length,12);for(const row of catalog.role_profiles)for(const f of radarFields)assert(Number.isInteger(row[f])&&row[f]>=1&&row[f]<=5);
  for(const [role,c]of Object.entries(CLASSES))for(const s of c.skills)assert(catalog.skill_copies.some(row=>row.role_id===role&&row.skill_id===s.id));
  for(const [role,id]of [['warrior','w_cleave'],['bard','b_nocturne'],['bard','b_frenzy'],['bard','b_revive'],['archer','a_reload'],['sage','sge_equation'],['samurai','sa_counter']])assert(catalog.skill_copies.some(row=>row.role_id===role&&row.skill_id===id),role+':'+id);
  for(const asset of catalog.game_assets){assert.equal(asset.source_type,'local');assert(fs.existsSync(path.join(publicDir,asset.local_path)));assert.equal(asset.is_public,true);assert.equal(asset.storage_path,null);}
  for(const b of catalog.asset_bindings)assert(catalog.game_assets.some(a=>a.asset_key===b.asset_key));
});
test('Every generated draft validates, schema IDs and battle fields cannot change',()=>{
  for(const [kind,spec]of Object.entries(kinds))for(const row of catalog[spec.table])assert.doesNotThrow(()=>validateDraft(item(kind,row)));
  const role=item('role',catalog.role_profiles[0]);assert.throws(()=>validateDraft({...role,data:{...role.data,maxHp:999}}));assert.throws(()=>validateDraft({...role,key:'invented'}));assert.throws(()=>validateDraft({...role,data:{...role.data,radar_output:2.5}}));
  const skill=item('skill',catalog.skill_copies[0]);assert.throws(()=>validateDraft({...skill,role_id:'fake'}));assert.throws(()=>validateDraft({...skill,data:{...skill.data,full_copy:'{unknown}'}}));
});
test('Routes require no login, redirect runs before static, config reveals only public credentials',async()=>{const f=await fixture();try{
  for(const route of ['/lab','/edit','/asset']){const r=await f.request(route,{token:false});assert.equal(r.status,200);const body=await r.text();assert(!body.includes('supabase.auth'));}
  const r=await f.request('/presentation-lab.html?scene=samurai_cut',{token:false,redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/lab?scene=samurai_cut');
  const c=await (await f.request('/api/studio/config',{token:false})).json();assert.deepEqual(Object.keys(c).sort(),['SUPABASE_PUBLISHABLE_KEY','SUPABASE_URL']);assert(!JSON.stringify(c).includes('secret-test'));
}finally{await f.close();}});
test('Protected operations reject absent/wrong tokens, cross-origin, and unconfigured token',async()=>{const f=await fixture();try{
  for(const route of ['/drafts','/revisions','/assets'])assert.equal((await f.request('/api/studio'+route,{token:false})).status,401);
  for(const route of ['/drafts','/publish','/restore','/assets/sign-upload','/assets/register'])assert.equal((await f.request('/api/studio'+route,{method:'POST',body:{},token:false})).status,401);
  assert.equal((await f.request('/api/studio/drafts',{headers:{'X-Studio-Write-Token':'wrong'}})).status,401);
  assert.equal((await f.request('/api/studio/drafts',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await f.request('/api/studio/drafts',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
}finally{await f.close();}const unconfigured=await fixture({});try{assert.equal((await unconfigured.request('/api/studio/drafts')).status,503);}finally{await unconfigured.close();}
  assert.equal(tokenMatches(undefined,'x'),false);assert.equal(tokenMatches('',''),false);assert.equal(tokenMatches('abc','abc'),true);assert.equal(tokenMatches('abc','abcd'),false);
});
test('Draft import does not publish, batch publishing calls exactly one atomic RPC',async()=>{const f=await fixture();try{
  const items=catalog.role_profiles.slice(0,2).map(r=>item('role',r));const saved=await f.request('/api/studio/drafts',{method:'POST',body:{items}});assert.equal(saved.status,200);assert(!f.calls.some(c=>c.route?.includes('/rpc/')));
  const result=await f.request('/api/studio/publish',{method:'POST',body:{items:items.map(({data,...rest})=>rest)}});assert.equal(result.status,200);const rpc=f.calls.filter(c=>c.route?.includes('/rpc/'));assert.equal(rpc.length,1);assert.equal(rpc[0].route,'/rest/v1/rpc/studio_publish_batch');assert.equal(rpc[0].body.p_items.length,2);
  const invalid=await f.request('/api/studio/drafts',{method:'POST',body:{items:[items[0],{...items[1],data:{...items[1].data,maxHp:900}}]}});assert.equal(invalid.status,400);
}finally{await f.close();}});
test('Revision restore creates draft and strips old version without rolling published back',async()=>{const f=await fixture();try{const response=await f.request('/api/studio/restore',{method:'POST',body:{revision_id:1}});assert.equal(response.status,200);const row=(await response.json()).row;assert.equal(row.status,'draft');assert(!('version'in row));assert(!f.calls.some(c=>c.route?.includes('/rpc/')));}finally{await f.close();}});
test('Security validates uploads, path traversal, URLs and published file locations',async()=>{
  assert.doesNotThrow(()=>validateUpload({filename:'photo.png',mime_type:'image/png',size_bytes:128,category:'roles'}));
  for(const input of [{filename:'../x.png',mime_type:'image/png',size_bytes:1,category:'roles'},{filename:'x.svg',mime_type:'image/svg+xml',size_bytes:1,category:'effects'},{filename:'x.png',mime_type:'audio/mpeg',size_bytes:1,category:'sfx'},{filename:'x.png',mime_type:'image/png',size_bytes:51*1024*1024,category:'roles'}])assert.throws(()=>validateUpload(input));
  for(const p of ['/sound/../secret','//evil.example/a.mp3','/sound/%2e%2e/secret','/sound/a\\b.mp3'])assert.throws(()=>safePath(p,true));
  const base={asset_key:'external.test',display_name:'test',kind:'image',category:'roles',source_type:'external',external_url:'https://example.com/image.png',is_public:false,volume:1};assert.doesNotThrow(()=>validateAsset(base));assert.throws(()=>validateAsset({...base,external_url:'javascript:alert(1)'}));assert.throws(()=>validateAsset({...base,external_url:'https://user:pass@example.com/a.png'}));
  const f=await fixture();try{const r=await f.request('/api/studio/assets/key',{method:'PATCH',body:{local_path:'/sound/evil.mp3'}});assert.equal(r.status,400);}finally{await f.close();}
});
test('Room snapshot freezes stories during later publications; no manifests in room:update',()=>{
  contentCache.data={story_copies:[{story_key:'story.prologue',title:'v1',paragraphs:['v1']}],role_profiles:[],skill_copies:[],game_assets:[],asset_bindings:[]};const room=new Room('TEST',{id:'p',emit(){},join(){}},'Player',{to:()=>({emit(){}})});
  contentCache.data.story_copies[0].title='v2';assert.equal(room.studioContent.storyTexts.prologue.title,'v1');assert.equal(createRoomContent().storyTexts.prologue.title,'v2');assert(!('studioContent'in room.getClientState()));room.clearTimer();contentCache.data=null;
});
test('Supabase unavailable keeps local story and gameplay defaults and last good snapshot',async()=>{
  contentCache.data={story_copies:[]};const before=contentCache.data;assert.equal(await refreshPublished({rows:async()=>{throw new Error('offline');}}),false);assert.equal(contentCache.data,before);const content=createRoomContent();assert(content.storyTexts.prologue.paragraphs.length);assert.equal(CLASSES.samurai.maxHp,80);contentCache.data=null;
});
test('Full published catalog supports route name strings and allows Room creation',()=>{
  contentCache.data=structuredClone(catalog);try{const room=new Room('FULL',{id:'p',emit(){},join(){}},'QA',{to:()=>({emit(){}})});assert.equal(room.state,'LOBBY');assert.equal(typeof room.studioContent.routeStories.route_trail.name,'string');assert.equal(typeof room.studioContent.routeStories.route_trail.treasure.story,'string');room.clearTimer();}finally{contentCache.data=null;}
});
test('Dynamic states retain action IDs and controlled placeholders never execute code',()=>{
  const p={role:'sage',equips:[],sagePhase:'solve'};const skills=getPlayerSkills(p);assert.equal(skillCopyKey(p,skills[1]),'sge_deduce__solve');assert(skills[1].contextualCopy);assert.equal(skills[1].id,'sge_deduce');
  assert.equal(narrativeVariant({role:'alchemist'},{flaskType:'poison'}),'poison');assert.equal(renderTemplate('{player}: {floor} {unknown}',{player:'名字',floor:2}),'名字: 2 {unknown}');
});
test('Browser import validation enforces immutable IDs and produces field differences',()=>{
  const window={},context=vm.createContext({window,StudioContent:{state:{defaults:catalog}}});vm.runInContext(fs.readFileSync(new URL('../public/studio/import-export.js',import.meta.url),'utf8'),context);const schema=window.StudioSchema,value=item('role',catalog.role_profiles[0]);assert.equal(schema.validate({schemaVersion:1,items:[value]}).length,1);assert.throws(()=>schema.validate({schemaVersion:9,items:[value]}));assert.throws(()=>schema.validate({schemaVersion:1,items:[value,value]}));assert.equal(schema.diff([{...value,data:{...value.data,name_zh:'new'}}],()=>catalog.role_profiles[0]).length,1);
});
test('Radar grade uses integer 1–5 and radius score/5, Lab excludes legacy editor',()=>{
  const window={},context=vm.createContext({window});vm.runInContext(fs.readFileSync(new URL('../public/studio/radar-renderer.js',import.meta.url),'utf8'),context);const radar=window.RadarRenderer;assert.deepEqual(Array.from([1,2,3,4,5],radar.grade),['D','C','B','A','S']);assert.equal(radar.point(0,5)[1],40);assert.equal(radar.point(0,1)[1],100.8);
  const html=fs.readFileSync(new URL('../public/presentation-lab.html',import.meta.url),'utf8');assert(!html.includes('skillCopyEditor'));assert(!html.includes('skill-copy-editor.js'));for(const f of ['samurai-lab-scenes.js','gladiator-lab-scenes.js','lab-combat-scenes.js'])assert(html.includes(f));
});
test('Asset registry resolves bindings, preserves audio timing, and supports changing reused image nodes',()=>{
  const events={},documentEvents={};let observer;
  class ImageNode{constructor(src){this.raw=src;this.dataset={};this.style={};}getAttribute(name){return name==='src'?this.raw:null;}set src(v){this.raw=v;}get src(){return this.raw;}}
  const image=new ImageNode('/photo/Warrior.webp'),body={querySelectorAll:()=>[image]},data={game_assets:[{asset_key:'v2',is_public:true,source_type:'external',external_url:'https://cdn.example.com/warrior.png'}],asset_bindings:[{binding_key:'role.warrior.avatar',asset_key:'v2',fallback_path:'/photo/Warrior.webp'},{binding_key:'sfx.samurai-skill',asset_key:'v2',fallback_path:'/sound/samurai-skill.mp3',volume_override:.2}]};
  const window={addEventListener:(name,fn)=>events[name]=fn},context=vm.createContext({window,document:{body,addEventListener:(name,fn)=>documentEvents[name]=fn},HTMLImageElement:ImageNode,MutationObserver:class{constructor(fn){observer=fn;}observe(){}},URL,location:{origin:'http://localhost'},StudioContent:{state:{config:{}},rows:table=>data[table]||[]}});
  vm.runInContext(fs.readFileSync(new URL('../public/studio/asset-registry.js',import.meta.url),'utf8'),context);documentEvents.DOMContentLoaded();assert.equal(image.raw,'https://cdn.example.com/warrior.png');
  image.raw='/photo/Mage.webp';observer([{type:'attributes',target:image}]);assert.equal(image.raw,'/photo/Mage.webp');assert.equal(image.dataset.studioOriginal,'/photo/Mage.webp');
  const profile=window.assetRegistry.audioProfile({bindingKey:'sfx.samurai-skill',src:'/sound/samurai-skill.mp3',volume:.5,offset:1,identityBeatMs:700,maxDuration:4,fallback:'synth'});assert.equal(profile.volume,.2);assert.equal(profile.offset,1);assert.equal(profile.identityBeatMs,700);assert.equal(profile.maxDuration,4);assert.equal(profile.fallback,'synth');
  window.assetRegistry.markFailed('https://cdn.example.com/warrior.png');assert.equal(window.assetRegistry.resolve('role.warrior.avatar','/photo/Warrior.webp'),'/photo/Warrior.webp');
});
test('Markdown treats published HTML as plain text and preserves controlled bold formatting',()=>{
  const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),slice=source.slice(source.indexOf('function formatMarkdown('),source.indexOf('// ==========================================',source.indexOf('function formatMarkdown(')));const context=vm.createContext({});vm.runInContext(slice,context);assert.equal(vm.runInContext('formatMarkdown("<img src=x> **safe**")',context),'&lt;img src=x&gt; <strong>safe</strong>');
});
test('Protected Studio API bounds JSON size and request rate before processing writes',async()=>{const f=await fixture();try{
  const response=await f.request('/api/studio/drafts',{method:'POST',body:{data:'x'.repeat(1100000)}});assert.equal(response.status,413);
  let last;for(let i=0;i<122;i++)last=await f.request('/api/studio/drafts');assert.equal(last.status,429);assert.equal(last.headers.get('retry-after'),'60');
}finally{await f.close();}});
