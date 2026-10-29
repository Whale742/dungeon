import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRest, CloudError } from './supabase.js';
import { catalog } from './catalog.js';
import { refreshPublished, contentCache, refreshMedia, mediaCache } from './content.js';
import { AssetSourceSettings, assetSource } from './asset-source.js';
import { kinds, validateIdentity, validateDraft, validateAsset, validateUpload, requireValid, assetFields } from './validation.js';
import { getMigrationStatus, migrateAssets, migrateBindings } from './migration.js';
import localPaths from '../public/js/shared/local-paths.cjs';
import { combatLabCatalog, combatLabFixture, configuredSamuraiPreview } from './combat-lab.js';

export function tokenMatches(supplied, expected) {
  const hash=v=>crypto.createHash('sha256').update(v||'').digest();
  return crypto.timingSafeEqual(hash(typeof supplied==='string'?supplied:''),hash(expected)) && !!expected && typeof supplied==='string' && supplied.length<=1024;
}
export function studioAccess(env){
  const rates=new Map();
  return (req,res,next)=>{
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
  };
}

export function createStudioRouter({env=process.env,cloud=new SupabaseRest(env),onPublish=()=>refreshPublished(cloud),storageClient,publicDir,settings=env===process.env?assetSource:new AssetSourceSettings({env,cloud})}={}) {
  const router=express.Router();
  router.get('/config',async(_req,res)=>res.set('Cache-Control','no-store').json({...await settings.read({force:true}),SUPABASE_URL:env.SUPABASE_URL||''}));
  router.get('/defaults',(req,res)=>{
    const copy={schemaVersion:catalog.schemaVersion,role_profiles:catalog.role_profiles,skill_copies:catalog.skill_copies,story_copies:catalog.story_copies,skillMeta:catalog.skillMeta,rolePortraits:Object.fromEntries(catalog.asset_bindings.filter(b=>/^role\.[^.]+\.avatar$/.test(b.binding_key)).map(b=>[b.binding_key.split('.')[1],b.fallback_path]))};
    res.set('Cache-Control','no-cache').json(req.query.scope==='copy'?copy:req.query.scope==='assets'?{schemaVersion:catalog.schemaVersion,game_assets:catalog.game_assets,asset_bindings:catalog.asset_bindings,usage:catalog.usage}:catalog);
  });
  router.get('/published',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(req.query.scope!=='assets'&&!contentCache.data)await refreshPublished(cloud);
    const wantsMedia=req.query.scope==='assets'||req.query.media==='1';
    if(wantsMedia)await refreshMedia(cloud,req.query.refresh==='1');
    const copy=req.query.scope==='assets'?{}:contentCache.data;
    if(!copy||wantsMedia&&!mediaCache.data)return res.status(503).json({error:'發布內容暫時無法讀取；保留有效快取或本地預設'});
    res.json({...copy,...(wantsMedia?mediaCache.data:{})});
  });
  router.get('/combat-lab', (_req,res)=>res.json(combatLabCatalog));
  router.get('/combat-lab/scenes/:id', (req,res)=>{
    const fixture=combatLabFixture(req.params.id);
    if(!fixture)return res.status(404).json({error:'找不到正式演出樣本'});
    res.json(fixture);
  });
  router.post('/combat-lab/preview',express.json({limit:'64kb',strict:true}),async(req,res,next)=>{
    const origin=req.get('Origin');
    if(req.get('Sec-Fetch-Site')==='cross-site'||origin&&origin!==`${req.protocol}://${req.get('Host')}`)return res.status(403).json({error:'不允許跨站預覽'});
    try{res.json(await configuredSamuraiPreview(req.body?.config,req.body?.actionId,req.body?.sceneId));}catch(error){next(error);}
  });
  router.use(studioAccess(env));
  router.use(express.json({limit:'1mb',strict:true}));
  const route=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
  const params=item=>{const spec=validateIdentity(item);return `${spec.key}=eq.${encodeURIComponent(item.key)}${item.kind==='skill'?'&role_id=eq.'+encodeURIComponent(item.role_id):''}`;};
  const clean=(kind,row)=>Object.fromEntries(kinds[kind].fields.map(f=>[f,row[f]??(['asset_key','fallback_path','preload_group','volume_override'].includes(f)?null:'')]));
  router.get('/drafts',route(async(req,res)=>{
    const tables=Object.entries(kinds).filter(([kind])=>req.query.scope==='copy'?kind!=='binding':req.query.scope==='assets'?kind==='binding':true).map(([,spec])=>spec.table),values=await Promise.all(tables.map(t=>cloud.rows(t,'status=eq.draft')));
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
    await onPublish();if(canonical.some(i=>i.kind==='binding'))await refreshMedia(cloud,true);res.json({published:result});
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
  router.post('/assets/:assetKey/preview',route(async(req,res)=>{
    const key=req.params.assetKey;requireValid(/^[a-zA-Z0-9._-]{1,180}$/.test(key),'無效 asset_key');
    const [asset]=await cloud.rows('game_assets','asset_key=eq.'+encodeURIComponent(key));requireValid(asset,'找不到素材');
    let url;
    if(asset.source_type==='storage'){
      requireValid(asset.storage_bucket==='game-assets'&&typeof asset.storage_path==='string'&&!asset.storage_path.split('/').some(p=>!p||p==='..'||p==='.'),'無效 Storage 路徑');
      url=env.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/public/game-assets/'+asset.storage_path.split('/').map(encodeURIComponent).join('/');
    }else if(asset.source_type==='external'){
      const parsed=new URL(asset.external_url);requireValid(parsed.protocol==='https:'&&!parsed.username&&!parsed.password,'無效外部 URL');url=parsed.href;
    }else {const local=catalog.game_assets.find(a=>a.asset_key===key);requireValid(local,'找不到本地素材');url=local.local_path;}
    res.json({url});
  }));
  router.get('/assets',route(async(_req,res)=>res.json(await cloud.rows('game_assets'))));
  router.post('/assets/register',route(async(req,res)=>{
    let input=validateAsset(req.body.asset||req.body);
    if(input.source_type==='storage')input=await confirmUpload(input,req.body.receipt);
    if(input.source_type==='local')requireValid(catalog.game_assets.some(a=>a.local_path===localPaths.canonical(input.local_path)),'本地素材不存在');
    const existing=await cloud.rows('game_assets','asset_key=eq.'+encodeURIComponent(input.asset_key));
    if(existing.length){requireValid(['source_type','local_path','storage_bucket','storage_path','external_url'].every(field=>field==='local_path'?localPaths.canonical(existing[0][field]??null)===localPaths.canonical(input[field]??null):(existing[0][field]??null)===(input[field]??null)),'asset_key 已存在；請建立新版素材');return res.json(existing[0]);}
    const saved=await cloud.request('/rest/v1/game_assets',{method:'POST',body:input,headers:{Prefer:'return=representation'}});res.status(201).json(saved[0]);
  }));
  router.patch('/assets/:assetKey',route(async(req,res)=>{
    const patch=req.body;requireValid(Object.keys(patch).every(f=>['display_name','is_public'].includes(f)),'素材檔案位置不可覆寫，請登記新版素材');
    const existing=await cloud.rows('game_assets','asset_key=eq.'+encodeURIComponent(req.params.assetKey));requireValid(existing.length===1,'找不到素材');
    const input=validateAsset({...Object.fromEntries(['asset_key',...assetFields].map(f=>[f,existing[0][f]])),...patch});
    res.json(await cloud.request('/rest/v1/game_assets?asset_key=eq.'+encodeURIComponent(req.params.assetKey),{method:'PATCH',body:{display_name:input.display_name,is_public:input.is_public},headers:{Prefer:'return=representation'}}));
  }));
  router.get('/migration/status',route(async(_req,res)=>res.json(await getMigrationStatus({cloud,publicDir}))));
  router.post('/migration/assets',route(async(req,res)=>{
    const assetKeys=Array.isArray(req.body?.assetKeys)?req.body.assetKeys:null;
    res.json(await migrateAssets({env,cloud,storageClient,publicDir,assetKeys,dryRun:!!req.body?.dryRun}));
  }));
  router.post('/migration/bindings',route(async(req,res)=>{
    const bindingKeys=Array.isArray(req.body?.bindingKeys)?req.body.bindingKeys:null;
    const result=await migrateBindings({env,cloud,bindingKeys,dryRun:!!req.body?.dryRun,verifyDownloads:req.body?.verifyDownloads!==false});
    if(!req.body?.dryRun&&result.success&&result.switchCount>0)await onPublish();
    res.json(result);
  }));
  router.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.type==='entity.too.large'?'JSON 請求超過 1 MB':error instanceof SyntaxError?'JSON 格式錯誤':error.status?error.message:'Studio 操作失敗，請重試'}));
  return router;
}
export function mountStudio(app, publicDir, options={}) {
  const settings=options.settings||assetSource,env=options.env||process.env;
  app.get('/api/config/assets',async(_req,res)=>res.set('Cache-Control','no-store').json(await settings.read({force:true})));
  const admin=express.Router();admin.use(studioAccess(env));admin.use(express.json({limit:'2kb',strict:true}));
  admin.get('/config',async(_req,res)=>res.json(await settings.read({force:true,admin:true})));
  admin.put('/config',async(req,res,next)=>{try{res.json(await settings.write(req.body));}catch(error){next(error);}});
  admin.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.status?error.message:'設定操作失敗'}));
  app.use('/api/admin/assets',admin);
  app.get('/presentation-lab.html',(req,res)=>res.redirect(302,'/lab'+(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):'')));
  for(const [route,file]of [['admin','studio-admin.html'],['lab','presentation-lab.html'],['edit','studio-editor.html'],['asset','studio-assets.html']])app.get('/'+route,(_req,res)=>res.sendFile(file,{root:publicDir}));
  app.use('/api/studio',createStudioRouter({publicDir,...options,settings}));
}
