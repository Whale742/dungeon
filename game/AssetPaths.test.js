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
import {getAssetManifest} from '../studio/asset-manifest.js';
const assetManifest=await getAssetManifest();

test('Manifest revisions match shipped bytes and party sound groups use existing resolver IDs',()=>{
  for(const asset of assetManifest.assets){
    const bytes=fs.readFileSync(new URL('../public'+asset.url,import.meta.url));
    assert.equal(asset.revision,createHash('sha256').update(bytes).digest('hex').slice(0,20));
    assert.equal(asset.id,assetKeyForPath(asset.url));
    assert.equal(asset.bytes,bytes.length);
  }
  for(const role of Object.keys(catalog.sfxProfiles))assert.ok(assetManifest.assets.some(a=>a.type==='audio'&&a.roles.includes(role)),role);
});

test('Image retries release failed promises, tolerate renderable decode errors, and cap concurrency',async()=>{
  let broken=true,active=0,maximum=0,requests=0;
  class ImageNode{
    set src(value){this.value=value;requests++;active++;maximum=Math.max(maximum,active);setTimeout(()=>{active--;this.naturalWidth=broken?0:10;broken?this.onerror?.():this.onload?.();},2);}
    get src(){return this.value;}getAttribute(){return this.value;}
    async decode(){throw Error('decoder rejected renderable image');}
  }
  const content={state:{defaults:{},config:{asset_source_mode:'local_only'}},load:async()=>{}};
  const scope=vm.createContext({URL,Image:ImageNode,HTMLImageElement:ImageNode,setTimeout,clearTimeout,
    location:{href:'http://localhost/',origin:'http://localhost'},document:{addEventListener(){}},StudioContent:content,
    window:{StudioContent:content,addEventListener(){}}});
  vm.runInContext(fs.readFileSync(new URL('../public/js/studio/asset-registry.js',import.meta.url),'utf8'),scope);
  const registry=scope.window.assetRegistry;
  await assert.rejects(registry.preloadImage('/assets/retry.png'));assert.equal(requests,3);
  assert.equal(registry.resolvePath('/assets/retry.png'),'/assets/retry.png');
  broken=false;assert.equal((await registry.preloadImage('/assets/retry.png')).naturalWidth,10);
  await Promise.all(Array.from({length:12},(_,i)=>registry.preloadImage('/assets/'+i+'.png')));
  assert.ok(maximum<=4);const count=requests;
  await assert.rejects(registry.preloadImage('https://example.com/storage/v1/object/public/private.png'));
  assert.equal(requests,count,'local-only must never request Storage');
});

test('Streaming music resumes normal position and switches boss tracks without decoding MP3 buffers',async()=>{
  const timers=new Map();let timerId=0;
  const param={value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}};
  const ctx={currentTime:0,createGain:()=>({gain:{...param},connect(){},disconnect(){}}),createMediaElementSource:()=>({connect(){},disconnect(){}})};
  class Audio{constructor(src){this.src=src;this.currentTime=0;this.duration=60;this.events={};}addEventListener(name,fn){this.events[name]=fn;}async play(){this.events.loadedmetadata?.();}pause(){this.paused=true;}removeAttribute(){this.src='';}load(){}}
  const audio={ctx,masterGain:{},init(){},loadAsset(){throw Error('Music must stream');}};
  const scope=vm.createContext({Audio,sfxManager:audio,waitForPresentation:async()=>{},AbortController,
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),clearInterval(){},console,
    window:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync(new URL('../public/js/audio/bgm.js',import.meta.url),'utf8'),scope);
  const bgm=scope.window.bgmManager;await bgm.resumeNormal();
  bgm.voices.normal.media.currentTime=12;await bgm.prepareBoss();assert.equal(bgm.normalOffset,12);
  await bgm.bossEntrance({playSound:async()=>null});[...timers.values()].find(t=>t.ms===5000).fn();
  assert.ok(bgm.voices.boss);await bgm.resumeNormal();assert.equal(bgm.voices.normal.media.currentTime,12);
  assert.equal(bgm.voices.boss,null);bgm.reset();assert.equal(bgm.mode,'idle');assert.equal(bgm.voices.normal,null);
  await bgm.resumeBoss();assert.equal(bgm.mode,'boss');assert.ok(bgm.voices.boss);bgm.reset();
});

test('Adventure progress survives prologue skip and combat without blocking views or restarting loads',async()=>{
  const nodes=[],pending=[],paths=[];
  class Node{constructor(){this.style={};this.children=[];}setAttribute(){}append(...children){this.children.push(...children);}remove(){this.removed=true;}}
  const m={assets:[{id:'common',revision:'1',url:'/assets/common.png',type:'image',battle:true,roles:[]},{id:'role',revision:'1',url:'/assets/warrior.png',type:'image',roles:['warrior']}]};
  const window={addEventListener(){},assetRegistry:{canonical:p=>p,preloadImage:path=>{paths.push(path);return new Promise(resolve=>pending.push(resolve));}}};
  const scope=vm.createContext({window,navigator:{},location:{search:''},URLSearchParams,AbortSignal,performance,console,ENEMY_PAINTED_ART:{lava:['enemies/lava.png'],secret:['enemies/secret.png']},enemyPaintedAssetUrl:p=>'/assets/combat-fx/'+p,
    setTimeout:()=>1,clearTimeout(){},fetch:async()=>({ok:true,json:async()=>m}),
    document:{addEventListener(){},createElement:()=>new Node(),body:{append:node=>nodes.push(node)}}});
  vm.runInContext(fs.readFileSync(new URL('../public/js/studio/adventure-preloader.js',import.meta.url),'utf8'),scope);
  const loader=window.AdventureAssets,state={code:'test',state:'PROLOGUE',players:[{role:'warrior'}],enemies:[]};
  assert.equal(loader.gate(state),false);await new Promise(setImmediate);
  assert.equal(nodes.length,1);assert.equal(pending.length,2);const panel=nodes[0];
  assert.equal(panel.style.position,'fixed');assert.equal(panel.style.pointerEvents,'none');
  assert.equal(loader.gate({...state,state:'EVENT'}),false);assert.equal(loader.gate({...state,state:'IN_BATTLE'}),false);
  assert.equal(nodes.length,1);assert.equal(pending.length,2);
  pending[0]({});await new Promise(setImmediate);assert.equal(panel.children[1].value,1);assert.equal(panel.children[1].max,2);
  pending[1]({});await new Promise(setImmediate);assert.equal(panel.children[1].value,2);assert.match(panel.children[0].textContent,/準備完成/);
  for(const url of ['/assets/enemies/lava.webp','/assets/combat-fx/enemies/lava.png','/assets/combat-fx/enemies/secret.png'])m.assets.push({id:url,revision:'1',url,type:'image',roles:[]});
  loader.encounter({enemies:[{avatar:'/assets/enemies/lava.webp',presentation:{mechanicId:'lava'}}]});await new Promise(setImmediate);
  assert.equal(pending.length,4);assert.equal(paths.includes('/assets/combat-fx/enemies/secret.png'),false,'unrevealed enemy art must not be requested');
  pending[2]({});pending[3]({});await new Promise(setImmediate);
  loader.reset();assert.equal(panel.removed,true);
});

test('Public image cache reuses responses, invalidates a release, and tolerates quota errors',async()=>{
  const events={},stored=new Map();let revision='one',network=0,quota=false;
  const cache={keys:async()=>[...stored.keys()].map(url=>new Request(url)),match:async key=>stored.get(key.url)?.clone(),delete:async key=>stored.delete(key.url),put:async(key,response)=>{if(quota)throw Error('QuotaExceededError');stored.set(key.url,response.clone());}};
  const scope=vm.createContext({URL,Request,Response,Headers,Promise,caches:{open:async()=>cache,keys:async()=>[]},
    self:{location:{origin:'https://local'},clients:{get:async()=>({postMessage(){}})},addEventListener:(name,fn)=>events[name]=fn},
    fetch:async request=>{if(request==='/asset-manifest.json')return Response.json({assets:[{url:'/assets/test.png',type:'image',revision,bytes:3}]});network++;return new Response(revision,{headers:{'Content-Type':'image/png'}});}});
  vm.runInContext(fs.readFileSync(new URL('../public/asset-worker.js',import.meta.url),'utf8'),scope);
  async function load(){let response;const waits=[];events.fetch({clientId:'test',request:new Request('https://local/assets/test.png'),respondWith:p=>{response=p;},waitUntil:p=>waits.push(p)});const result=await response;await Promise.all(waits);return result.text();}
  const navigate=()=>events.fetch({request:{url:'https://local/',mode:'navigate',method:'GET',headers:new Headers()}});
  assert.equal(await load(),'one');assert.equal(await load(),'one');assert.equal(network,1);
  revision='two';navigate();assert.equal(await load(),'two');assert.equal(network,2);assert.equal(stored.size,1);
  revision='three';quota=true;navigate();assert.equal(await load(),'three');assert.equal(network,3);
  stored.clear();quota=false;assert.equal(await load(),'three','cleared storage falls back to a normal request');
});

test('SFX can decode before playback permission and retry after a failed cached load',async()=>{
  let offline=0,requests=0,broken=true;
  class Decoder{constructor(){offline++;}async decodeAudioData(){return {duration:1};}}
  const scope=vm.createContext({window:{OfflineAudioContext:Decoder},navigator:{userActivation:{isActive:false,hasBeenActive:false}},
    setTimeout,clearTimeout,AbortController,console:{warn(){}},fetch:async()=>{requests++;return {ok:!broken,status:503,arrayBuffer:async()=>new ArrayBuffer(1)};}});
  const source=fs.readFileSync(new URL('../public/js/presentation/presentation-core.js',import.meta.url),'utf8');
  const audio=vm.runInContext(source.slice(0,source.indexOf('// Global SFX singleton'))+';new SFXManager()',scope);
  const profile={src:'/assets/sound/sfx/test.mp3'};
  assert.equal(await audio.loadAsset(profile),null);assert.equal(requests,2);assert.equal(audio.assets.has(profile.src),false);
  broken=false;assert.equal((await audio.loadAsset(profile)).duration,1);assert.equal(requests,3);
  assert.equal(audio.ctx,null);assert.equal(offline,1);assert.equal(audio.userActivated,false);
  assert.equal((await audio.loadAsset(profile)).duration,1);assert.equal(requests,3);
});

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
  await vm.runInContext('preloadOnmyojiAssets()',scope);assert.equal(paths.length,6);
  const app=fs.readFileSync(new URL('../public/js/core/app.js',import.meta.url),'utf8');
  const bag=app.slice(app.indexOf('function preloadBagAssets()'),app.indexOf('window.preloadBagAssets ='));
  await vm.runInContext(bag+';preloadBagAssets()',scope);assert.equal(paths.length,8);
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
