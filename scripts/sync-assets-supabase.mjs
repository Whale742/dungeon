// Image-only, repeatable migration. Local files remain disaster-recovery fallbacks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../studio/env.js';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRest } from '../studio/supabase.js';
import { catalog } from '../studio/catalog.js';
import { getStorageAssetKey, getStoragePath } from '../studio/migration.js';
import localPaths from '../public/js/shared/local-paths.cjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const publicImageUrl = (base, asset) => base.replace(/\/$/, '') + '/storage/v1/object/public/game-assets/' + asset.storage_path.split('/').map(encodeURIComponent).join('/');
export function imageBindingPlan(images, selected, existingBindings, existingAssets) {
  const byKey=new Map(existingAssets.map(a=>[a.asset_key,a])),bindings=new Map(existingBindings.filter(b=>b.status==='published').map(b=>[b.binding_key,b]));
  const paths=new Map(images.map(a=>[a.local_path,a.asset_key])),planned=new Map();
  const add=(key,local,base={})=>{
    const asset=selected.get(local);if(!asset)throw Error('Unverified image: '+local);
    const current=bindings.get(key),fields={asset_key:asset.asset_key,fallback_path:local,preload_group:base.preload_group||asset.preload_group,volume_override:base.volume_override??null};
    if(current&&Object.entries(fields).every(([k,v])=>(current[k]??null)===(v??null)))return;
    planned.set(key,{binding_key:key,status:'published',...fields,version:(current?.version||0)+1});
  };
  for(const image of images)add('path.'+image.asset_key,image.local_path,image);
  // Keep intentionally customized remote semantic bindings; replace local image sources only.
  for(const b of catalog.asset_bindings){const local=localPaths.canonical(b.fallback_path);if(!paths.has(local))continue;const current=bindings.get(b.binding_key),asset=current&&byKey.get(current.asset_key);if(current&&asset?.source_type!=='local')continue;add(b.binding_key,local,current||b);}
  for(const b of bindings.values()){const asset=byKey.get(b.asset_key),local=localPaths.canonical(asset?.local_path);if(asset?.kind==='image'&&asset.source_type==='local'&&paths.has(local))add(b.binding_key,local,b);}
  return [...planned.values()];
}
export async function syncImages({apply=false,prefix='',env=process.env,cloud=new SupabaseRest(env)}={}) {
  if(!cloud.configured)throw Error('Supabase credentials are not configured');
  const [assets,bindings]=await Promise.all([cloud.rows('game_assets'),cloud.rows('asset_bindings')]);
  const images=catalog.game_assets.filter(a=>a.kind==='image'&&a.local_path.startsWith(prefix)),existing=new Map(assets.map(a=>[a.asset_key,a]));
  const published=new Map(bindings.filter(b=>b.status==='published').map(b=>[b.binding_key,b]));
  const summary={images:images.length,bytes:images.reduce((n,a)=>n+a.size_bytes,0),uploaded:0,reused:0,verified:0,bindingsChanged:0};
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',...summary}));if(!apply)return summary;
  const storage=createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(60000)})}}).storage.from('game-assets');
  const selected=new Map(),created=[],downloads=new Map();
  const verify=(asset)=>{
    const url=publicImageUrl(env.SUPABASE_URL,asset);
    if(!downloads.has(url))downloads.set(url,(async()=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Public image HTTP '+r.status);if(!r.headers.get('content-type')?.startsWith('image/'))throw Error('Invalid image content type');return hash(Buffer.from(await r.arrayBuffer()));})());
    return downloads.get(url);
  };
  let cursor=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(cursor<images.length){
      const image=images[cursor++],buffer=fs.readFileSync(new URL('../public'+image.local_path,import.meta.url)),digest=hash(buffer),key=getStorageAssetKey(image.asset_key);
      const bound=existing.get(published.get('path.'+image.asset_key)?.asset_key);
      const candidates=[existing.get(key+'.'+digest.slice(0,16)),existing.get(key),bound,...assets.filter(a=>a.kind==='image'&&a.source_type==='storage'&&a.size_bytes===buffer.length)].filter(a=>a?.is_public&&a.source_type==='storage'&&a.storage_bucket==='game-assets');
      let chosen=null;
      for(const a of new Set(candidates)){try{if(await verify(a)===digest){chosen=a;break;}}catch{}}
      if(chosen)summary.reused++;
      else{
        const base=getStoragePath(image),ext=path.extname(base),storagePath=base.slice(0,-ext.length)+'-'+digest.slice(0,16)+ext;
        chosen={...image,asset_key:existing.has(key)?key+'.'+digest.slice(0,16):key,source_type:'storage',local_path:null,storage_bucket:'game-assets',storage_path:storagePath,external_url:null};
        const {error}=await storage.upload(storagePath,buffer,{contentType:image.mime_type,cacheControl:'31536000',upsert:false});
        if(error&&!/already exists|duplicate/i.test(error.message))throw Error('Upload failed for '+image.local_path+': '+error.message);
        if(await verify(chosen)!==digest)throw Error('SHA-256 verification failed: '+image.local_path);
        if(!error)summary.uploaded++;else summary.reused++;
        created.push(chosen);
      }
      selected.set(image.local_path,chosen);summary.verified++;
      if(summary.verified%25===0||summary.verified===images.length)console.log(JSON.stringify({verified:summary.verified,total:images.length,uploaded:summary.uploaded,reused:summary.reused}));
    }
  }));
  // Never publish a URL until every image's public download matches its local bytes.
  const batch=async(table,rows,conflict,ignore=false)=>{for(let i=0;i<rows.length;i+=100)await cloud.upsert(table,rows.slice(i,i+100),conflict,ignore);};
  await batch('game_assets',images.filter(a=>!existing.has(a.asset_key)),'asset_key',true);
  await batch('game_assets',created,'asset_key');
  const plan=imageBindingPlan(images,selected,bindings,assets);
  await batch('asset_bindings',plan,'binding_key,status');summary.bindingsChanged=plan.length;
  console.log(JSON.stringify({complete:true,...summary}));return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){loadEnv();syncImages({apply:process.argv.includes('--apply')}).catch(error=>{console.error(error.message);process.exitCode=1;});}
