(function(global){
  'use strict';
  const tables=['role_profiles','skill_copies','story_copies','game_assets','asset_bindings'];
  const key=(table,row)=>table==='skill_copies'?row.role_id+':'+row.skill_id:table==='asset_bindings'?row.binding_key:row.role_id||row.story_key||row.asset_key||row.binding_key;
  const state={data:Object.fromEntries(tables.map(t=>[t,[]])),config:null,ready:null,defaults:null,source:'local',pinned:false};
  function emit(){global.dispatchEvent(new Event('studio:content-ready'));}
  function install(data,{pin=false,source='cloud'}={}) {state.data=Object.fromEntries(tables.map(t=>[t,(data[t]||[]).filter(r=>t==='game_assets'?r.is_public:r.status==='published'||r.status===undefined)]));state.pinned=pin;state.source=source;emit();}
  async function json(url,options){const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('讀取失敗 HTTP '+response.status);return response.json();}
  async function readRows(table){const list=[];for(let offset=0;;offset+=1000){const page=await json(state.config.SUPABASE_URL+'/rest/v1/'+table+'?'+(table==='game_assets'?'is_public=eq.true':'status=eq.published')+'&limit=1000&offset='+offset,{headers:{apikey:state.config.SUPABASE_PUBLISHABLE_KEY}});list.push(...page);if(page.length<1000)return list;}}
  async function load({defaults=false,force=false}={}) {
    if(defaults&&!state.defaults)state.defaults=await json('/api/studio/defaults');
    if(state.pinned){state.config ||= await json('/api/studio/config');return state.data;}
    if(state.ready&&!force)return state.ready;
    state.ready=(async()=>{try{state.config ||= await json('/api/studio/config');if(!state.config.SUPABASE_URL||!state.config.SUPABASE_PUBLISHABLE_KEY)throw new Error('未配置 Supabase');const values=await Promise.all(tables.map(readRows));if(!state.pinned)install(Object.fromEntries(tables.map((t,i)=>[t,values[i]])));}catch{if(!state.pinned){state.source='local';emit();}}return state.data;})();
    return state.ready;
  }
  function rows(table){const map=new Map((state.defaults?.[table]||[]).map(r=>[key(table,r),r]));for(const row of state.data[table]||[])map.set(key(table,row),row);return [...map.values()];}
  function find(table,id){return state.data[table]?.find(row=>key(table,row)===id)||state.defaults?.[table]?.find(row=>key(table,row)===id);}
  function role(id,fallback){return {...fallback,...find('role_profiles',id)};}
  function skill(role,skill){return find('skill_copies',role+':'+(skill.copyKey||skill.id));}
  function template(value,vars={}){return String(value||'').replace(/\{(player|floor|boss|route|rageMultiplier)\}/g,(all,key)=>Object.hasOwn(vars,key)?String(vars[key]):all);}
  function preview(payload){sessionStorage.setItem('studio.preview',JSON.stringify({schemaVersion:1,expires:Date.now()+30*60000,...payload}));}
  function applyPreview(){if(location.pathname!=='/lab')return;try{const p=JSON.parse(sessionStorage.getItem('studio.preview')||'null');if(p?.schemaVersion!==1||p.expires<Date.now())return;for(const table of tables){const map=new Map(state.data[table].map(r=>[key(table,r),r]));for(const row of p[table]||[])map.set(key(table,row),row);state.data[table]=[...map.values()];}state.source='preview';emit();}catch{}}
  global.StudioContent={state,tables,key,load,rows,find,role,skill,install,template,preview,applyPreview,json};
})(window);
