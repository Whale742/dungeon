(function(global){
  'use strict';
  const tables=['role_profiles','skill_copies','story_copies','game_assets','asset_bindings'];
  const scope=typeof location!=='undefined'&&location.pathname==='/edit'?'copy':typeof location!=='undefined'&&location.pathname==='/asset'?'assets':'game';
  const key=(table,row)=>table==='skill_copies'?row.role_id+':'+row.skill_id:table==='asset_bindings'?row.binding_key:row.role_id||row.story_key||row.asset_key||row.binding_key;
  const state={data:Object.fromEntries(tables.map(t=>[t,[]])),config:null,ready:null,assetReady:null,defaults:null,source:'local',pinned:false};
  function emit(){global.dispatchEvent(new Event('studio:content-ready'));}
  function install(data,{pin=false,source='cloud'}={}) {state.data=Object.fromEntries(tables.map(t=>[t,data[t]===undefined?state.data[t]:(data[t]||[]).filter(r=>t==='game_assets'?r.is_public:r.status==='published'||r.status===undefined)]));state.pinned=pin;state.source=source;emit();}
  async function json(url,options){const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('讀取失敗 HTTP '+response.status);return response.json();}
  async function load({defaults=false,force=false}={}) {
    if(state.ready&&!force)return state.ready;
    let assetsDone;state.assetReady=new Promise(resolve=>{assetsDone=resolve;});
    state.ready=(async()=>{try{
      const [config,base]=await Promise.all([state.config||(scope==='copy'?{asset_source_mode:'local_only'}:json('/api/studio/config').catch(()=>({asset_source_mode:'local_only'}))),state.defaults||json('/api/studio/defaults?scope='+scope)]);
      state.config=config;state.defaults=base;emit();
      if(config.asset_source_mode!=='cloud_first')assetsDone();
      // Published copy sync is independent of media policy. Server retains the last valid snapshot.
      const media=scope==='assets'||scope==='game'&&config.asset_source_mode==='cloud_first';
      if(state.pinned&&!media)return state.data;
      const data=await json('/api/studio/published?scope='+scope+(media?'&media=1':'')+(force&&media?'&refresh=1':''));
      if(!state.pinned)install(data);else if(media)install({game_assets:data.game_assets,asset_bindings:data.asset_bindings},{pin:true});
    }catch{emit();}finally{assetsDone();}return state.data;})();
    return state.ready;
  }
  function rows(table){const map=new Map((state.defaults?.[table]||[]).map(r=>[key(table,r),r]));for(const row of state.data[table]||[])map.set(key(table,row),row);return [...map.values()];}
  function find(table,id){return state.data[table]?.find(row=>key(table,row)===id)||state.defaults?.[table]?.find(row=>key(table,row)===id);}
  function role(id,fallback){return {...fallback,...find('role_profiles',id)};}
  function isEditable(table,row){
    const id=key(table,row);
    const meta=state.defaults?.skillMeta?.[id];
    return !!state.defaults?.[table]?.some(base=>key(table,base)===id)&&(table!=='skill_copies'||meta?.editable!==false&&meta?.managedBy!=='role_profiles');
  }
  function skill(role,skill){
    const id=skill.copyKey||(skill.id==='passive'||String(skill.id).startsWith('leader_')?skill.id:global.StudioGame?.copyKey(role,skill)||state.defaults?.skillMeta?.[role+':'+skill.id]?.canonicalCopyKey||skill.id);
    const copy=find('skill_copies',role+':'+id);
    // Passive text is edited once, in role_profiles. Keep the legacy skill row
    // as a fallback when a published role profile does not exist.
    if(id==='passive'){
      const profile=state.data.role_profiles.find(row=>row.role_id===role);
      if(profile)return {...copy,short_copy:profile.passive_short??copy?.short_copy,full_copy:profile.passive_full??copy?.full_copy};
    }
    return copy;
  }
  function template(value,vars={}){return String(value||'').replace(/\{(player|floor|boss|route|rageMultiplier)\}/g,(all,key)=>Object.hasOwn(vars,key)?String(vars[key]):all);}
  function preview(payload){sessionStorage.setItem('studio.preview',JSON.stringify({schemaVersion:1,expires:Date.now()+30*60000,...payload}));}
  function applyPreview(){if(location.pathname!=='/lab')return;try{const p=JSON.parse(sessionStorage.getItem('studio.preview')||'null');if(p?.schemaVersion!==1||p.expires<Date.now())return;for(const table of tables){const map=new Map(state.data[table].map(r=>[key(table,r),r]));for(const row of p[table]||[])map.set(key(table,row),row);state.data[table]=[...map.values()];}state.source='preview';emit();}catch{}}
  global.StudioContent={state,tables,key,load,rows,find,role,skill,install,template,preview,applyPreview,json,isEditable};
})(window);
