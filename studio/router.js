import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRest, CloudError } from './supabase.js';
import { catalog } from './catalog.js';
import { refreshPublished } from './content.js';
import { kinds, validateIdentity, validateDraft, validateAsset, validateUpload, requireValid, assetFields } from './validation.js';

export function tokenMatches(supplied, expected) {
  const hash=v=>crypto.createHash('sha256').update(v||'').digest();
  return crypto.timingSafeEqual(hash(typeof supplied==='string'?supplied:''),hash(expected)) && !!expected && typeof supplied==='string' && supplied.length<=1024;
}
export function createStudioRouter({env=process.env,cloud=new SupabaseRest(env),onPublish=()=>refreshPublished(cloud),storageClient}={}) {
  const router=express.Router(), rates=new Map();
  router.get('/config',(_req,res)=>res.json({SUPABASE_URL:env.SUPABASE_URL||'',SUPABASE_PUBLISHABLE_KEY:env.SUPABASE_PUBLISHABLE_KEY||''}));
  router.get('/defaults',(_req,res)=>res.json(catalog));
  router.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    const now=Date.now(),id=req.ip;
    let entry=rates.get(id);if(!entry||now-entry.at>60000){entry={at:now,count:0};rates.set(id,entry);}
    if(rates.size>10000)for(const [key,value]of rates)if(now-value.at>60000)rates.delete(key);
    if(++entry.count>120){res.set('Retry-After','60');return res.status(429).json({error:'請求過於頻繁，請稍後重試'});}
    const origin=req.get('Origin'),configured=(env.STUDIO_ALLOWED_ORIGINS||'').split(',').filter(Boolean);
    const hostOrigin=`${req.protocol}://${req.get('Host')}`;
    if(req.get('Sec-Fetch-Site')==='cross-site' || (origin && origin!==hostOrigin && !configured.includes(origin)))return res.status(403).json({error:'不允許跨站 Studio 操作'});
    if(!env.STUDIO_WRITE_TOKEN)return res.status(503).json({error:'後端尚未配置 STUDIO_WRITE_TOKEN'});
    if(!tokenMatches(req.get('X-Studio-Write-Token'),env.STUDIO_WRITE_TOKEN))return res.status(401).json({error:'需要正確的 Studio 通行碼'});
    next();
  });
  router.use(express.json({limit:'1mb',strict:true}));
  const route=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
  const params=item=>{const spec=validateIdentity(item);return `${spec.key}=eq.${encodeURIComponent(item.key)}${item.kind==='skill'?'&role_id=eq.'+encodeURIComponent(item.role_id):''}`;};
  const clean=(kind,row)=>Object.fromEntries(kinds[kind].fields.map(f=>[f,row[f]??(['asset_key','fallback_path','preload_group','volume_override'].includes(f)?null:'')]));
  router.get('/drafts',route(async(_req,res)=>{
    const tables=Object.values(kinds).map(s=>s.table),values=await Promise.all(tables.map(t=>cloud.rows(t,'status=eq.draft')));
    res.json(Object.fromEntries(tables.map((t,i)=>[t,values[i]])));
  }));
  router.post('/drafts',route(async(req,res)=>{
    const items=req.body.items||[req.body];requireValid(Array.isArray(items)&&items.length>0&&items.length<=500,'草稿數量需為 1–500');
    const rows=items.map(validateDraft);const saved=[];
    // Validate everything before the first write; draft saves need no published transaction.
    for(let i=0;i<items.length;i++){const spec=kinds[items[i].kind];saved.push(await cloud.upsert(spec.table,rows[i],items[i].kind==='skill'?'role_id,skill_id,status':spec.key+',status'));}
    res.json({saved:items.length,rows:saved.flat()});
  }));
  router.post('/publish',route(async(req,res)=>{
    const items=req.body.items||[req.body];requireValid(Array.isArray(items)&&items.length>=1&&items.length<=100,'批次發布需為 1–100 項');items.forEach(validateIdentity);
    requireValid(new Set(items.map(i=>[i.kind,i.role_id,i.key].join(':'))).size===items.length,'禁止重複發布項目');
    const canonical=items.map(({kind,key,role_id})=>({kind,key,...(kind==='skill'?{role_id}:{})}));
    // Also validate old drafts that may have been written outside this API.
    for(const item of canonical){const list=await cloud.rows(kinds[item.kind].table,params(item)+'&status=eq.draft');requireValid(list.length===1,'找不到草稿');validateDraft({...item,data:clean(item.kind,list[0])});}
    const result=canonical.length===1?await cloud.request('/rest/v1/rpc/studio_publish_one',{method:'POST',body:{p_kind:canonical[0].kind,p_key:canonical[0].key,p_role_id:canonical[0].role_id||null}}):await cloud.request('/rest/v1/rpc/studio_publish_batch',{method:'POST',body:{p_items:canonical}});
    await onPublish();res.json({published:result});
  }));
  router.get('/revisions',route(async(req,res)=>{
    const item={kind:req.query.kind,key:req.query.key,role_id:req.query.role_id};validateIdentity(item);
    res.json(await cloud.rows('content_revisions',`entity_type=eq.${item.kind}&entity_key=eq.${encodeURIComponent(item.key)}${item.kind==='skill'?'&role_id=eq.'+encodeURIComponent(item.role_id):''}&order=created_at.desc&limit=100`));
  }));
  router.post('/restore',route(async(req,res)=>{
    requireValid(/^\d+$/.test(String(req.body.revision_id)),'無效 revision_id');const rows=await cloud.rows('content_revisions','id=eq.'+req.body.revision_id);requireValid(rows.length===1,'找不到版本');
    const revision=rows[0],item={kind:revision.entity_type,key:revision.entity_key,role_id:revision.role_id,data:clean(revision.entity_type,req.body.snapshot==='previous'?revision.previous_data||revision.published_data:revision.published_data)};
    const row=validateDraft(item),spec=kinds[item.kind];await cloud.upsert(spec.table,row,item.kind==='skill'?'role_id,skill_id,status':spec.key+',status');res.json({item,row});
  }));
  let storage=storageClient;
  const bucket=()=>{if(!storage){if(!cloud.configured)throw new CloudError('Supabase 尚未設定');storage=createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});}return storage.storage.from('game-assets');};
  const receipt=data=>{const value=Buffer.from(JSON.stringify(data)).toString('base64url');return value+'.'+crypto.createHmac('sha256',env.STUDIO_WRITE_TOKEN).update(value).digest('base64url');};
  const verifyReceipt=value=>{
    requireValid(typeof value==='string'&&value.length<3000,'缺少上傳憑證');const [data,mac]=value.split('.');requireValid(tokenMatches(mac,crypto.createHmac('sha256',env.STUDIO_WRITE_TOKEN).update(data).digest('base64url')),'無效上傳憑證');
    const decoded=JSON.parse(Buffer.from(data,'base64url').toString());requireValid(decoded.expires>Date.now(),'上傳憑證過期；請重新上傳');return decoded;
  };
  router.post('/assets/sign-upload',route(async(req,res)=>{
    const input=validateUpload(req.body);bucket();const {data:settings,error:settingsError}=await storage.storage.getBucket('game-assets');if(settingsError)throw new CloudError(settingsError.message);
    requireValid(settings.public===true,'game-assets 必須是 Public Bucket');validateUpload(input,Math.min(50*1024*1024,Number(settings.file_size_limit)||50*1024*1024));
    const ext=input.filename.split('.').pop().toLowerCase(),folder=(input.mime_type.startsWith('image/')?'images/':'audio/')+input.category;
    const upload={...input,path:folder+'/'+crypto.randomUUID()+'.'+ext,expires:Date.now()+2*60*60*1000};
    const {data,error}=await bucket().createSignedUploadUrl(upload.path,{upsert:false});if(error)throw new CloudError(error.message);
    res.json({signedUrl:data.signedUrl,path:upload.path,receipt:receipt(upload)});
  }));
  async function confirmUpload(input,value) {
    const signed=verifyReceipt(value);requireValid(input.storage_path===signed.path,'路徑與上傳憑證不符');
    const {data,error}=await bucket().info(signed.path);if(error)throw new CloudError('檔案不存在或上傳未完成：'+error.message,400);
    requireValid(Number(data.size)===signed.size_bytes,'實際檔案大小與申請不符');requireValid(data.contentType===signed.mime_type,'實際 MIME 與申請不符');
    return {...input,mime_type:signed.mime_type,size_bytes:signed.size_bytes};
  }
  router.get('/assets',route(async(_req,res)=>res.json(await cloud.rows('game_assets'))));
  router.post('/assets/register',route(async(req,res)=>{
    let input=validateAsset(req.body.asset||req.body);
    if(input.source_type==='storage')input=await confirmUpload(input,req.body.receipt);
    if(input.source_type==='local')requireValid(catalog.game_assets.some(a=>a.local_path===input.local_path),'本地素材不存在');
    const existing=await cloud.rows('game_assets','asset_key=eq.'+encodeURIComponent(input.asset_key));
    if(existing.length){requireValid(['source_type','local_path','storage_bucket','storage_path','external_url'].every(field=>(existing[0][field]??null)===(input[field]??null)),'asset_key 已存在；請建立新版素材');return res.json(existing[0]);}
    const saved=await cloud.request('/rest/v1/game_assets',{method:'POST',body:input,headers:{Prefer:'return=representation'}});res.status(201).json(saved[0]);
  }));
  router.patch('/assets/:assetKey',route(async(req,res)=>{
    const patch=req.body;requireValid(Object.keys(patch).every(f=>['display_name','is_public'].includes(f)),'素材檔案位置不可覆寫，請登記新版素材');
    const existing=await cloud.rows('game_assets','asset_key=eq.'+encodeURIComponent(req.params.assetKey));requireValid(existing.length===1,'找不到素材');
    const input=validateAsset({...Object.fromEntries(['asset_key',...assetFields].map(f=>[f,existing[0][f]])),...patch});
    res.json(await cloud.request('/rest/v1/game_assets?asset_key=eq.'+encodeURIComponent(req.params.assetKey),{method:'PATCH',body:{display_name:input.display_name,is_public:input.is_public},headers:{Prefer:'return=representation'}}));
  }));
  router.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.type==='entity.too.large'?'JSON 請求超過 1 MB':error instanceof SyntaxError?'JSON 格式錯誤':error.status?error.message:'Studio 操作失敗，請重試'}));
  return router;
}
export function mountStudio(app, publicDir, options) {
  app.get('/presentation-lab.html',(req,res)=>res.redirect(302,'/lab'+(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):'')));
  for(const [route,file]of [['lab','presentation-lab.html'],['edit','studio-editor.html'],['asset','studio-assets.html']])app.get('/'+route,(_req,res)=>res.sendFile(file,{root:publicDir}));
  app.use('/api/studio',createStudioRouter(options));
}
