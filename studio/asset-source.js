import { SupabaseRest, CloudError } from './supabase.js';

const validMode=value=>value==='local_only'||value==='cloud_first';
const validRow=row=>row&&validMode(row.asset_source_mode)&&Number.isSafeInteger(row.version)&&row.version>0&&typeof row.updated_at==='string';

// This cache is only a read-through optimization. The authoritative row lives in Postgres.
export class AssetSourceSettings {
  constructor({env=process.env,cloud=new SupabaseRest(env),ttl=3000}={}) {
    this.env=env;this.cloud=cloud;this.ttl=ttl;this.saved=null;this.checkedAt=0;this.pending=null;this.available=false;
  }
  async refresh(force=false){
    if(this.pending)return this.pending;
    if(!force&&this.checkedAt&&Date.now()-this.checkedAt<this.ttl)return;
    this.pending=(async()=>{
      try{
        const rows=await this.cloud.request('/rest/v1/site_asset_config?id=eq.global&select=asset_source_mode,version,updated_at',{timeoutMs:1200});
        if(!Array.isArray(rows)||rows.length!==1||!validRow(rows[0]))throw Error('Invalid settings');
        // A read started before a successful write cannot roll the cache back.
        if(!this.saved||rows[0].version>=this.saved.version)this.saved=rows[0];
        this.available=true;
      }catch{this.available=false;}
      finally{this.checkedAt=Date.now();this.pending=null;}
    })();return this.pending;
  }
  details(){
    const override=validMode(this.env.ASSET_SOURCE_OVERRIDE)?this.env.ASSET_SOURCE_OVERRIDE:null;
    return {asset_source_mode:override||this.saved?.asset_source_mode||'local_only',source:override?'Emergency Override':this.saved?'Database':'Safe Default',
      persisted_mode:this.saved?.asset_source_mode||null,version:this.saved?.version||0,updated_at:this.saved?.updated_at||null,database_status:this.available?'available':'unavailable'};
  }
  async read({force=false,admin=false}={}){
    // Emergency mode remains immediately usable even during a Database outage.
    if(admin||!validMode(this.env.ASSET_SOURCE_OVERRIDE))await this.refresh(force);
    const detail=this.details();return admin?detail:{asset_source_mode:detail.asset_source_mode,version:detail.version};
  }
  async write(input){
    if(!input||Object.keys(input).some(k=>!['asset_source_mode','version'].includes(k))||!validMode(input.asset_source_mode)||!Number.isSafeInteger(input.version)||input.version<1||input.version>=Number.MAX_SAFE_INTEGER)
      throw new CloudError('設定模式或版本無效；請重新讀取設定',400);
    let rows;
    try{rows=await this.cloud.request('/rest/v1/site_asset_config?id=eq.global&version=eq.'+input.version,{method:'PATCH',body:{asset_source_mode:input.asset_source_mode,version:input.version+1,updated_at:new Date().toISOString()},headers:{Prefer:'return=representation'},timeoutMs:5000});}
    catch{throw new CloudError('設定未確認儲存；Database 暫時無法使用，請重新讀取後再試',503);}
    if(Array.isArray(rows)&&rows.length===0)throw new CloudError('設定版本已變更；請重新讀取再儲存',409);
    if(!Array.isArray(rows)||rows.length!==1||!validRow(rows[0])||rows[0].version!==input.version+1||rows[0].asset_source_mode!==input.asset_source_mode)throw new CloudError('Database 未確認設定更新',503);
    this.saved=rows[0];this.available=true;this.checkedAt=Date.now();return this.details();
  }
}
export const assetSource=new AssetSourceSettings();
