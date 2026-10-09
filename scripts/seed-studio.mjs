import {loadEnv} from '../studio/env.js';
import {SupabaseRest} from '../studio/supabase.js';
import {catalog} from '../studio/catalog.js';
loadEnv();
const cloud=new SupabaseRest();
if(!cloud.configured){console.error('需要 SUPABASE_URL 與 SUPABASE_SECRET_KEY。未寫入任何資料。');process.exitCode=1;}
else {
  const tables=['role_profiles','skill_copies','story_copies','game_assets','asset_bindings'];
  const key=(table,row)=>table==='skill_copies'?row.role_id+':'+row.skill_id:row.role_id||row.story_key||row.asset_key||row.binding_key;
  for(const table of tables){
    const existing=await cloud.rows(table),keys=new Set(existing.map(row=>key(table,row)));
    const rows=catalog[table].filter(row=>!keys.has(key(table,row))).map(row=>({...row,...(table==='game_assets'?{}:{status:'published',published_at:new Date().toISOString()})}));
    // Assets first, then bindings; existing drafts and published administrator edits are preserved.
    for(let i=0;i<rows.length;i+=100)await cloud.upsert(table,rows.slice(i,i+100),table==='skill_copies'?'role_id,skill_id,status':table==='game_assets'?'asset_key':({role_profiles:'role_id',story_copies:'story_key',asset_bindings:'binding_key'}[table])+',status',true);
    console.log(`${table}: 新增 ${rows.length}，保留既有 ${existing.length}`);
  }
}
