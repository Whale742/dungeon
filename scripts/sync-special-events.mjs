import fs from 'node:fs';
import crypto from 'node:crypto';
import {loadEnv} from '../studio/env.js';
import {SupabaseRest} from '../studio/supabase.js';
import {createClient} from '@supabase/supabase-js';
import localPaths from '../public/js/shared/local-paths.cjs';

loadEnv();
const cloud=new SupabaseRest();
if(!cloud.configured)throw Error('Supabase credentials missing');
const storage=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('game-assets');
const urls={};
for(const [id,local,mime] of [
  ['merchant','/assets/enemies/elites/奸商.webp','image/webp'],
  ['chest','/assets/enemies/elites/奇怪的寶箱.webp','image/webp'],
  ['bite','/assets/combat-fx/enemies/strange_chest_bite.png','image/png']
]){
  const bytes=fs.readFileSync(new URL('../public'+local,import.meta.url));
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const storagePath=`images/${id==='bite'?'effects':'bosses'}/special-${id}-${hash.slice(0,16)}.${local.split('.').pop()}`;
  const {error}=await storage.upload(storagePath,bytes,{contentType:mime,upsert:true});
  if(error)throw error;
  const url=storage.getPublicUrl(storagePath).data.publicUrl;
  const response=await fetch(url);
  if(!response.ok||crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')!==hash)throw Error('Cloud verification failed: '+id);
  urls[id]=url;
  const asset_key='storage.special.'+id;
  await cloud.upsert('game_assets',[{asset_key,display_name:local.split('/').pop(),kind:'image',category:id==='bite'?'effects':'bosses',source_type:'storage',local_path:null,storage_bucket:'game-assets',storage_path:storagePath,external_url:null,mime_type:mime,size_bytes:bytes.length,preload_group:id==='bite'?'effects':'bosses',volume:1,is_public:true}],'asset_key');
  const localKey='local.'+crypto.createHash('sha256').update(localPaths.legacy(local)).digest('hex').slice(0,20);
  for(const status of ['draft','published'])await cloud.upsert('asset_bindings',[{binding_key:'path.'+localKey,status,asset_key,fallback_path:null,preload_group:id==='bite'?'effects':'bosses',volume_override:null}],'binding_key,status');
  console.log('Verified cloud asset: '+id);
}
fs.writeFileSync(new URL('../game/special-event-assets.js',import.meta.url),'// Verified public Supabase assets. Regenerate with scripts/sync-special-events.mjs.\nexport const SPECIAL_EVENT_ASSETS = Object.freeze('+JSON.stringify(urls,null,2)+');\n');
const choreography=new URL('../public/js/combat/enemy-choreography.js',import.meta.url);
fs.writeFileSync(choreography,fs.readFileSync(choreography,'utf8').replace(/https:\/\/[^'"\s]+\/images\/effects\/special-bite-[a-f0-9]+\.png/g,urls.bite));
if(process.argv.includes('--assets-only'))process.exit(0);
const {catalog}=await import('../studio/catalog.js');
const keys=['event.shop.shady','event.shop.shady.leave','event.shop.shady.theft','event.chest','event.chest.mimic','enemy.shady_merchant','enemy.treasure_mimic'];
for(const story_key of keys){
  const row=catalog.story_copies.find(s=>s.story_key===story_key);
  if(!row)throw Error('Missing canonical story '+story_key);
  for(const status of ['draft','published']){
    const [old]=await cloud.rows('story_copies',`story_key=eq.${encodeURIComponent(story_key)}&status=eq.${status}`);
    await cloud.upsert('story_copies',[{...row,status,version:(old?.version||0)+1,published_at:status==='published'?new Date().toISOString():null}],'story_key,status');
  }
}
// Remove superseded copies, including drafts, without touching unrelated stories.
const obsolete=/貪婪噬魂寶箱怪|凶暴小怪破箱|暗藏其中的凶暴小怪|擬態怪寶箱|寶箱猛然張開獠牙巨口/;
for(const row of await cloud.rows('story_copies')){
  if(keys.includes(row.story_key)||!obsolete.test(JSON.stringify(row)))continue;
  await cloud.request(`/rest/v1/story_copies?story_key=eq.${encodeURIComponent(row.story_key)}&status=eq.${row.status}`,{method:'DELETE'});
  console.log('Removed obsolete story: '+row.story_key+' '+row.status);
}
for(const key of keys){
  const rows=await cloud.rows('story_copies',`story_key=eq.${encodeURIComponent(key)}`);
  const expected=catalog.story_copies.find(s=>s.story_key===key);
  if(rows.length!==2||rows.some(r=>r.body!==expected.body||r.title!==expected.title))throw Error('Story verification failed: '+key);
}
console.log('Verified published and draft special-event stories; obsolete copies cleared.');
