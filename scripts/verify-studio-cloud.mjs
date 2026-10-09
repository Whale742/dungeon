import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {loadEnv} from '../studio/env.js';
import {SupabaseRest} from '../studio/supabase.js';
import {catalog} from '../studio/catalog.js';
import {mountStudio} from '../studio/router.js';
import {kinds} from '../studio/validation.js';
loadEnv();
const cloud=new SupabaseRest(),token=crypto.randomBytes(32).toString('hex');
if(!cloud.configured)throw new Error('需要實際 SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY 與 SUPABASE_SECRET_KEY');
const env={...process.env,STUDIO_WRITE_TOKEN:token};
const app=express(),publicDir=fileURLToPath(new URL('../public/',import.meta.url));mountStudio(app,publicDir,{env,cloud,onPublish:async()=>{}});app.use(express.static(publicDir));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+server.address().port;
const report={at:new Date().toISOString(),checks:[],uploads:[]};
const savedDrafts=[],createdAssets=[],uploadedPaths=[];
async function api(route,body,method='POST') {const r=await fetch(origin+'/api/studio'+route,{method,headers:{'Content-Type':'application/json','X-Studio-Write-Token':token},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw new Error(route+': '+value.error);return value;}
const storage=createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function preserveDraft(kind,row){const spec=kinds[kind],query=spec.key+'=eq.'+encodeURIComponent(row[spec.key])+(kind==='skill'?'&role_id=eq.'+row.role_id:'')+'&status=eq.draft';const existing=await cloud.rows(spec.table,query);savedDrafts.push({table:spec.table,query,existing,conflict:kind==='skill'?'role_id,skill_id,status':spec.key+',status'});return {kind,key:row[spec.key],...(kind==='skill'?{role_id:row.role_id}:{}),data:Object.fromEntries(spec.fields.map(f=>[f,row[f]]))};}
try {
  for(const table of ['role_profiles','skill_copies','story_copies','game_assets','asset_bindings']){
    const rows=await cloud.rows(table,table==='game_assets'?'is_public=eq.true':'status=eq.published',true);assert(rows.length>0,'公開資料缺少 '+table);report.checks.push(table+' 公開讀取 '+rows.length+' 筆');
    if(table!=='game_assets'){const drafts=await cloud.rows(table,'status=eq.draft',true);assert.equal(drafts.length,0);}
    const r=await fetch(env.SUPABASE_URL+'/rest/v1/'+table,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:'{}'});assert([401,403].includes(r.status),table+' anon 寫入未被拒絕：'+r.status);
  }
  for(const rpc of ['studio_publish_one','studio_publish_batch']){const r=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(rpc.endsWith('one')?{p_kind:'invalid',p_key:'invalid'}:{p_items:[]})});assert([401,403,404].includes(r.status),'anon RPC 未拒絕');}
  report.checks.push('anon 草稿不可見／所有表寫入拒絕／發布 RPC 拒絕');
  const one=(await cloud.rows('story_copies','story_key=eq.event.floor&status=eq.published'))[0];const two=(await cloud.rows('story_copies','story_key=eq.event.routeTransition&status=eq.published'))[0];
  assert(one&&two);const items=[await preserveDraft('story',one),await preserveDraft('story',two)];await api('/drafts',{items});
  const draftRows=await api('/drafts',null,'GET');assert(draftRows.story_copies.some(r=>r.story_key==='event.floor'));assert.equal((await cloud.rows('story_copies','status=eq.draft',true)).length,0);
  const published=await api('/publish',{items:items.map(({data,...i})=>i)});assert.equal(published.published.length,2);
  const revisions=await api('/revisions?kind=story&key=event.floor',null,'GET');assert(revisions.length);const restored=await api('/restore',{revision_id:revisions[0].id});assert.equal(restored.row.status,'draft');assert(!('version'in restored.row));
  const latest=(await cloud.rows('story_copies','story_key=eq.event.floor&status=eq.published'))[0];assert.equal(latest.body,one.body);assert.equal(latest.version,(one.version||1)+1);
  report.checks.push('實際雲端草稿、原文單一交易批次發布、版本歷史、回復新草稿');
  // Real transaction rollback: first draft exists; second does not exist. No valid item is published.
  const before=latest.version;let rejected=false;try{await cloud.request('/rest/v1/rpc/studio_publish_batch',{method:'POST',body:{p_items:[{kind:'story',key:'event.floor'},{kind:'story',key:'zz.studio.qa.missing'}]}});}catch{rejected=true;}assert(rejected);assert.equal((await cloud.rows('story_copies','story_key=eq.event.floor&status=eq.published'))[0].version,before);report.checks.push('實際批次交易失敗完全回滾');
  const {data:bucket,error:bucketError}=await storage.storage.getBucket('game-assets');if(bucketError)throw new Error('game-assets Bucket：'+bucketError.message);assert.equal(bucket.public,true);report.checks.push('game-assets Public Bucket 已存在');
  for(const file of [{filename:'studio-qa.png',mime_type:'image/png',category:'effects',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQWQAAAAASUVORK5CYII=','base64')},{filename:'studio-qa.mp3',mime_type:'audio/mpeg',category:'sfx',bytes:fs.readFileSync(new URL('../public/sound/samurai-skill.mp3',import.meta.url))}]){
    const signed=await api('/assets/sign-upload',{filename:file.filename,mime_type:file.mime_type,size_bytes:file.bytes.length,category:file.category});uploadedPaths.push(signed.path);
    const multipart=new FormData();multipart.append('cacheControl','3600');multipart.append('',new Blob([file.bytes],{type:file.mime_type}),file.filename);
    const upload=await fetch(signed.signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:multipart});assert(upload.ok,'Signed Upload 失敗 HTTP '+upload.status);
    const overwrite=await fetch(signed.signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:multipart});assert(!overwrite.ok,'Signed URL 不可覆寫');
    const asset=await api('/assets/register',{receipt:signed.receipt,asset:{asset_key:'qa.'+crypto.randomUUID(),display_name:file.filename,kind:file.mime_type.startsWith('image/')?'image':'audio',category:file.category,source_type:'storage',storage_bucket:'game-assets',storage_path:signed.path,mime_type:file.mime_type,size_bytes:file.bytes.length,volume:1,is_public:false}});createdAssets.push(asset.asset_key);
    const publicUrl=env.SUPABASE_URL+'/storage/v1/object/public/game-assets/'+signed.path;const download=await fetch(publicUrl,{headers:{Origin:origin}});assert(download.ok);assert.equal((await download.arrayBuffer()).byteLength,file.bytes.length);assert(download.headers.get('access-control-allow-origin'));report.uploads.push({kind:asset.kind,path:signed.path,size:file.bytes.length,cors:download.headers.get('access-control-allow-origin')});
    assert.equal((await cloud.rows('game_assets','asset_key=eq.'+asset.asset_key,true)).length,0);
    const bad=await fetch(origin+'/api/studio/assets/register',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Write-Token':token},body:JSON.stringify({asset:{...Object.fromEntries(Object.entries(asset).filter(([k])=>!['created_at','updated_at','version','duration_ms','preload_group','local_path','external_url'].includes(k))),asset_key:'qa.'+crypto.randomUUID()},receipt:signed.receipt+'wrong'})});assert.equal(bad.status,400);
  }
  report.checks.push('PNG 與實際 MP3 Signed Upload、存在性驗證、私有登記、CORS 下載、防覆寫');
  // Bucket RLS: deliberately attempt a tiny test object, clean it if an unsafe policy exists.
  const anonPath='images/effects/qa-anon-'+crypto.randomUUID()+'.png';const anonymous=await fetch(env.SUPABASE_URL+'/storage/v1/object/game-assets/'+anonPath,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'image/png','x-upsert':'false'},body:Buffer.from([1])});if(anonymous.ok)uploadedPaths.push(anonPath);const anonymousError=await anonymous.json();assert([401,403].includes(anonymous.status)||anonymous.status===400&&['401','403'].includes(String(anonymousError.statusCode)),'anon Storage INSERT 未拒絕：'+anonymous.status+' '+anonymousError.message);report.checks.push('anon Storage INSERT 拒絕：'+anonymousError.message);
}catch(error){report.error=error.message;process.exitCode=1;console.error(error.message);}finally{
  for(const saved of savedDrafts){if(saved.existing.length)await cloud.upsert(saved.table,saved.existing,saved.conflict);else await cloud.request('/rest/v1/'+saved.table+'?'+saved.query,{method:'DELETE'});}
  for(const assetKey of createdAssets)await cloud.request('/rest/v1/game_assets?asset_key=eq.'+assetKey,{method:'DELETE'});
  if(uploadedPaths.length)await storage.storage.from('game-assets').remove(uploadedPaths);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.mkdirSync('artifacts/studio',{recursive:true});fs.writeFileSync('artifacts/studio/cloud-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
