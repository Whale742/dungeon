import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {catalog} from './catalog.js';

// Generated from the files actually shipped, using the resolver's existing IDs.
let snapshot;
export function getAssetManifest(){
  return snapshot||=(buildManifest().catch(error=>{snapshot=null;throw error;}));
}
async function buildManifest(){
  const assets=[];
  // Yield between files: manifest generation must not stall authoritative
  // sockets or make every server startup hash the entire media collection.
  for(const asset of catalog.game_assets){
    const bytes=await fs.promises.readFile(new URL('../public'+asset.local_path,import.meta.url));
    const url=asset.local_path;
    const soundKeys=catalog.asset_bindings.filter(b=>b.asset_key===asset.asset_key&&b.binding_key.startsWith('sfx.')).map(b=>b.binding_key.slice(4));
    const roles=catalog.role_profiles.map(r=>r.role_id).filter(role=>
      url.includes('/'+role+'/')||(catalog.usage[asset.asset_key]||[]).some(file=>file.includes(role+'-'))||
      soundKeys.some(key=>key.startsWith(role==='dreamweaver'?'dream':role)||Object.values(catalog.sfxProfiles[role]||{}).includes(key)||role==='druid'&&/^(transform_|treant_|wolf_|claw_)/.test(key)));
    const portrait=catalog.asset_bindings.some(b=>b.asset_key===asset.asset_key&&/^role\.[^.]+\.avatar$/.test(b.binding_key));
    const lobby=portrait||/\/gui-skin\/lobby\//.test(url)||/\/gui-skin\/buttons\/.*-(normal|hover)\.png$/.test(url)||/\/gui-skin\/panels\/main-panel-(9slice|gem-.*)\.png$/.test(url)||url.endsWith('/backgrounds/background.webp');
    const battle=/\/combat-fx\/common\/|\/gui-skin\/combat\/|\/Battle\.webp$/.test(url)||url.endsWith('/backgrounds/background.webp')||soundKeys.some(key=>['fight','healing_result','boss_warning','boss_entrance','victory'].includes(key));
    assets.push({id:asset.asset_key,url,revision:createHash('sha256').update(bytes).digest('hex').slice(0,20),bytes:bytes.length,type:asset.kind,roles,lobby,battle});
  }
  return {version:createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,20),assets};
}
