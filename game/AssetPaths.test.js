import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import localPaths from '../public/js/shared/local-paths.cjs';
import { catalog, assetKeyForPath } from '../studio/catalog.js';
import { getMigrationStatus } from '../studio/migration.js';
import { normalizeAvatar } from './avatar.js';
import express from 'express';
import { once } from 'node:events';
import { createStudioRouter, mountStudio } from '../studio/router.js';
import { refreshPublished, contentCache, refreshMedia, mediaCache } from '../studio/content.js';
import { AssetSourceSettings } from '../studio/asset-source.js';

test('Local media becomes ready before a stalled published-copy request, without skipping copy sync',async()=>{
  let releaseCopy,copyRequested=false;
  const pendingCopy=new Promise(resolve=>{releaseCopy=resolve;});
  const scope=vm.createContext({window:{dispatchEvent(){}},Event:class{},AbortSignal,fetch:async url=>({ok:true,json:async()=>{
    if(url.includes('/config'))return {asset_source_mode:'local_only'};
    if(url.includes('/defaults'))return {game_assets:[],asset_bindings:[]};
    copyRequested=true;return pendingCopy;
  }})});
  vm.runInContext(fs.readFileSync(new URL('../public/js/studio/content-store.js',import.meta.url),'utf8'),scope);
  const content=scope.window.StudioContent,load=content.load();await content.state.assetReady;
  assert.equal(content.state.config.asset_source_mode,'local_only');assert.equal(content.state.source,'local');
  releaseCopy({role_profiles:[{role_id:'warrior',name_zh:'發布文案',status:'published'}]});await load;assert.equal(copyRequested,true);assert.equal(content.find('role_profiles','warrior').name_zh,'發布文案');
});

test('Detached Onmyoji and inventory preloads use the bounded shared resolver and tolerate failed assets',async()=>{
  const paths=[],scope=vm.createContext({window:{assetRegistry:{preloadImage:async path=>{paths.push(path);throw Error('Storage unavailable');}}},Image:class{constructor(){throw Error('Unmanaged image preload');}}});
  const onmyoji=fs.readFileSync(new URL('../public/js/presentation/onmyoji-presentation.js',import.meta.url),'utf8');
  const part=onmyoji.slice(onmyoji.indexOf('let onmyojiPreloadPromise'),onmyoji.indexOf('async function playOnmyojiPresentation'));
  await vm.runInContext(part+';preloadOnmyojiAssets()',scope);assert.equal(paths.length,3);
  await vm.runInContext('preloadOnmyojiAssets()',scope);assert.equal(paths.length,3);
  const app=fs.readFileSync(new URL('../public/js/core/app.js',import.meta.url),'utf8');
  const bag=app.slice(app.indexOf('function preloadBagAssets()'),app.indexOf('window.preloadBagAssets ='));
  await vm.runInContext(bag+';preloadBagAssets()',scope);assert.equal(paths.length,5);
});

function settingsFixture(){
  let row={asset_source_mode:'local_only',version:1,updated_at:new Date().toISOString()},offline=false;
  const cloud={request:async(route,options={})=>{
    if(offline)throw Error('Database unavailable');
    if(options.method==='PATCH'){if(!route.endsWith('version=eq.'+row.version))return [];row={...options.body};}
    return [structuredClone(row)];
  }};
  return {cloud,fail:()=>{offline=true;},row:()=>row};
}

test('Global settings persist across instances, use CAS, and never report failed writes as saved',async()=>{
  const fixture=settingsFixture(),a=new AssetSourceSettings({env:{},cloud:fixture.cloud}),b=new AssetSourceSettings({env:{},cloud:fixture.cloud});
  assert.equal((await a.read()).asset_source_mode,'local_only');
  const changed=await a.write({asset_source_mode:'cloud_first',version:1});assert.equal(changed.version,2);
  assert.equal((await b.read({force:true})).asset_source_mode,'cloud_first');
  await assert.rejects(b.write({asset_source_mode:'local_only',version:1}),{status:409});
  const restarted=new AssetSourceSettings({env:{},cloud:fixture.cloud});assert.equal((await restarted.read()).asset_source_mode,'cloud_first');
  fixture.fail();await assert.rejects(a.write({asset_source_mode:'local_only',version:2}),{status:503});
  assert.equal((await a.read({force:true,admin:true})).persisted_mode,'cloud_first');
  const cold=new AssetSourceSettings({env:{},cloud:fixture.cloud});assert.equal((await cold.read()).asset_source_mode,'local_only');
  const override=new AssetSourceSettings({env:{ASSET_SOURCE_OVERRIDE:'local_only'},cloud:fixture.cloud});assert.equal((await override.read({admin:true})).source,'Emergency Override');
  const invalid=new AssetSourceSettings({env:{ASSET_SOURCE_OVERRIDE:'invalid'},cloud:fixture.cloud});assert.equal((await invalid.read({admin:true})).source,'Safe Default');
});

test('Admin APIs require the Studio token and same origin; public policy contains no admin details',async t=>{
  const {cloud}=settingsFixture(),env={STUDIO_WRITE_TOKEN:'admin-test-token'},settings=new AssetSourceSettings({env,cloud});
  const app=express();mountStudio(app,'',{env,cloud,settings});const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
  const publicResponse=await fetch(base+'/api/config/assets'),policy=await publicResponse.json();assert.deepEqual(Object.keys(policy).sort(),['asset_source_mode','version']);assert.equal(publicResponse.headers.get('cache-control'),'no-store');
  const route=base+'/api/admin/assets/config',body=JSON.stringify({asset_source_mode:'cloud_first',version:1});
  assert.equal((await fetch(route)).status,401);
  assert.equal((await fetch(route,{method:'PUT',headers:{'Content-Type':'application/json'},body})).status,401);
  const headers={'Content-Type':'application/json','X-Studio-Write-Token':env.STUDIO_WRITE_TOKEN};
  assert.equal((await fetch(route,{method:'PUT',headers:{...headers,Origin:'https://attacker.test'},body})).status,403);
  assert.equal((await fetch(route,{method:'PUT',headers,body})).status,200);
  assert.equal((await (await fetch(base+'/api/config/assets')).json()).asset_source_mode,'cloud_first');
  assert.equal((await fetch(route,{method:'PUT',headers,body})).status,409);
});

test('Editor defaults and published copy exclude media metadata, including draft reads',async t=>{
  const previous={...contentCache},calls=[],cloud={rows:async table=>{calls.push(table);return [];}};
  contentCache.data=null;const app=express();app.use('/api/studio',createStudioRouter({env:{STUDIO_WRITE_TOKEN:'copy-test'},cloud}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await new Promise(resolve=>server.close(resolve));Object.assign(contentCache,previous);});
  const base='http://127.0.0.1:'+server.address().port+'/api/studio';
  const defaults=await (await fetch(base+'/defaults?scope=copy')).json();assert.equal(defaults.game_assets,undefined);assert.equal(defaults.asset_bindings,undefined);assert.ok(defaults.rolePortraits.warrior);
  await fetch(base+'/published?scope=copy');await fetch(base+'/drafts?scope=copy',{headers:{'X-Studio-Write-Token':'copy-test'}});
  assert.ok(!calls.includes('game_assets'));assert.ok(!calls.includes('asset_bindings'));
});

test('Authorized upload, registration, explicit preview and revision restore keep their existing boundaries',async t=>{
  const token='upload-and-restore',payload=Buffer.from('test-png-bytes');let uploaded=null,asset=null,savedDraft=null;
  const original=catalog.skill_copies.find(s=>s.role_id==='warrior'&&s.skill_id==='basic');
  const revision={id:41,entity_type:'skill',entity_key:'basic',role_id:'warrior',published_data:original};
  const cloud={configured:true,rows:async(table)=>table==='content_revisions'?[revision]:table==='game_assets'&&asset?[asset]:[],
    upsert:async(table,row)=>{assert.equal(table,'skill_copies');savedDraft=row;return [row];},request:async(route,{body})=>{assert.equal(route,'/rest/v1/game_assets');asset=body;return [asset];}};
  let origin;
  const bucket={createSignedUploadUrl:async()=>({data:{signedUrl:origin+'/signed-upload'}}),info:async()=>({data:{size:uploaded?.length||0,contentType:'image/png'}})};
  const storageClient={storage:{getBucket:async()=>({data:{public:true,file_size_limit:50000000}}),from:()=>bucket}};
  const app=express();app.put('/signed-upload',express.raw({type:'*/*'}),(req,res)=>{uploaded=req.body;res.sendStatus(200);});
  app.use('/api/studio',createStudioRouter({env:{STUDIO_WRITE_TOKEN:token,SUPABASE_URL:'https://assets.test'},cloud,storageClient}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=async(path,body)=>fetch(origin+'/api/studio'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Write-Token':token},body:JSON.stringify(body)});
  const signedResponse=await request('/assets/sign-upload',{filename:'check.png',mime_type:'image/png',size_bytes:payload.length,category:'effects'});assert.equal(signedResponse.status,200);const signed=await signedResponse.json();
  assert.equal((await fetch(signed.signedUrl,{method:'PUT',headers:{'Content-Type':'image/png'},body:payload})).status,200);
  const input={asset_key:'storage.test-upload',display_name:'check.png',kind:'image',category:'effects',source_type:'storage',local_path:null,storage_bucket:'game-assets',storage_path:signed.path,external_url:null,mime_type:'image/png',size_bytes:payload.length,preload_group:'effects',volume:1,is_public:true};
  const registered=await request('/assets/register',{asset:input,receipt:signed.receipt});assert.equal(registered.status,201,await registered.text());
  const preview=await request('/assets/'+input.asset_key+'/preview',{});assert.equal(preview.status,200);assert.match((await preview.json()).url,/storage\/v1\/object\/public\/game-assets\//);
  const restored=await request('/restore',{revision_id:41,snapshot:'published'});assert.equal(restored.status,200);assert.equal(savedDraft.status,'draft');assert.equal(savedDraft.full_copy,original.full_copy);
});

test('Local-only sync reads published copy without asset tables and failed sync preserves a valid snapshot',async()=>{
  const previous={...contentCache},calls=[];
  try{
    const cloud={env:{},rows:async table=>{calls.push(table);return [{role_id:'warrior',status:'published',name_zh:'已發布職業'}];}};
    assert.equal(await refreshPublished(cloud),true);
    assert.deepEqual(calls,['role_profiles','skill_copies','story_copies']);
    const valid=contentCache.data,revision=contentCache.loadedAt;
    assert.equal(await refreshPublished({rows:async()=>{throw Error('offline');}}),false);
    assert.equal(contentCache.data,valid);assert.equal(contentCache.loadedAt,revision);
    calls.length=0;await refreshMedia(cloud,true);
    assert.ok(calls.includes('asset_bindings'));assert.ok(calls.includes('game_assets'));
  }finally{Object.assign(contentCache,previous);}
});

test('Studio binding draft and atomic publish reach the shared public snapshot without changing local defaults',async t=>{
  const previous={...contentCache},previousMedia={...mediaCache},original=catalog.asset_bindings.find(b=>b.binding_key==='role.warrior.avatar');
  const env={STUDIO_WRITE_TOKEN:'binding-test-token'},data={game_assets:[{asset_key:'storage.new',is_public:true}],asset_bindings:[]};
  let draft;
  const cloud={env,upsert:async(table,row)=>{assert.equal(table,'asset_bindings');draft=row;return [row];},rows:async(table,query)=>{
    if(query?.includes('status=eq.draft'))return draft?[draft]:[];
    return data[table]||[];
  },request:async(route)=>{assert.equal(route,'/rest/v1/rpc/studio_publish_one');data.asset_bindings=[{...draft,status:'published'}];return 1;}};
  const app=express();app.use('/api/studio',createStudioRouter({env,cloud,onPublish:()=>refreshPublished(cloud)}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));Object.assign(contentCache,previous);Object.assign(mediaCache,previousMedia);});
  const origin=`http://127.0.0.1:${server.address().port}/api/studio`;
  const item={kind:'binding',key:original.binding_key,data:{asset_key:'storage.new',fallback_path:original.fallback_path,preload_group:'roles',volume_override:null}};
  for(const [route,body]of [['drafts',{items:[item]}],['publish',{items:[{kind:item.kind,key:item.key}]}]]){
    const response=await fetch(origin+'/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Write-Token':env.STUDIO_WRITE_TOKEN},body:JSON.stringify(body)});
    assert.equal(response.status,200,await response.text());
  }
  const response=await fetch(origin+'/published?scope=assets'),snapshot=await response.json();
  assert.equal(snapshot.asset_bindings[0].asset_key,'storage.new');assert.equal(snapshot.asset_bindings[0].fallback_path,original.fallback_path);
  assert.notEqual(original.asset_key,'storage.new');
});

test('Saved local URLs retain their Studio IDs and resolve to existing canonical files', () => {
  for (const [old, current] of Object.entries(localPaths.aliases)) {
    assert.ok(fs.existsSync(new URL('../public' + current, import.meta.url)), current);
    assert.equal(localPaths.legacy(current), old);
    if (!current.startsWith('/assets/')) continue;
    const originalKey = 'local.' + createHash('sha256').update(old).digest('hex').slice(0, 20);
    assert.equal(assetKeyForPath(current), originalKey);
    const asset = catalog.game_assets.find(a => a.asset_key === originalKey);
    assert.equal(asset?.local_path, current, old);
  }
});

test('Migration status can read pre-reorganization cloud local paths without a data migration', async () => {
  const cloud = { rows: async table => table === 'game_assets' ? [
    { asset_key: 'local.saved', source_type: 'local', local_path: '/photo/Warrior.webp' },
    { asset_key: 'local.audio', source_type: 'local', local_path: '/sound/bgm-normal.mp3' }
  ] : [] };
  const result = await getMigrationStatus({ cloud });
  assert.equal(result.missingFilesCount, 0);
  assert.ok(result.estimatedTotalBytes > 0);
});

test('Official saved avatar choices remain accepted without expanding arbitrary local URL access', () => {
  assert.equal(normalizeAvatar('/photo/Warrior.webp'), '/photo/Warrior.webp');
  assert.equal(normalizeAvatar('/assets/characters/portraits/Warrior.webp'), '/assets/characters/portraits/Warrior.webp');
  assert.equal(normalizeAvatar('/assets/enemies/elites/奇怪的寶箱.webp'), null);
  assert.equal(normalizeAvatar('/photo/not-an-official-portrait.webp'), null);
});

test('Separating copy snapshots from media does not reject registered public cloud portrait choices',()=>{
  const previous=mediaCache.data;
  try{
    mediaCache.data={game_assets:[{is_public:true,source_type:'storage',storage_bucket:'game-assets',storage_path:'images/roles/portrait.webp',category:'roles'}]};
    const url='https://test.supabase.co/storage/v1/object/public/game-assets/images/roles/portrait.webp';
    assert.equal(normalizeAvatar(url,{role_profiles:[]},'https://test.supabase.co'),url);
    assert.equal(normalizeAvatar(url.replace('portrait','unknown'),{},'https://test.supabase.co'),null);
    mediaCache.data.game_assets[0].is_public=false;assert.equal(normalizeAvatar(url,{},'https://test.supabase.co'),null);
  }finally{mediaCache.data=previous;}
});

test('Studio accepts existing local registrations with either saved or current path without writing cloud data', async t => {
  const current = catalog.game_assets.find(a => a.local_path === '/assets/characters/portraits/Warrior.webp');
  const saved = { ...current, local_path: '/photo/Warrior.webp' };
  const cloud = { rows: async () => [saved], request: async () => { throw Error('Unexpected cloud write'); } };
  const app = express();
  app.use('/api/studio', createStudioRouter({ env: { STUDIO_WRITE_TOKEN: 'local-test-token' }, cloud }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const asset of [saved, current]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/studio/assets/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Write-Token': 'local-test-token' },
      body: JSON.stringify({ asset })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), saved);
  }
});
