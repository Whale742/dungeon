(function(global){
  'use strict';
  const tables=['role_profiles','skill_copies','story_copies','game_assets','asset_bindings'];
  const key=(table,row)=>table==='skill_copies'?row.role_id+':'+row.skill_id:table==='asset_bindings'?row.binding_key:row.role_id||row.story_key||row.asset_key||row.binding_key;
  const state={data:Object.fromEntries(tables.map(t=>[t,[]])),config:null,ready:null,defaults:null,source:'local',pinned:false};
  let samuraiDefaults=null;
  // Old published copy must not describe the retired independent soul resource.
  // This is a read projection: keep cloud rows, custom names and other roles intact.
  function currentMechanicsCopy(table,row){
    if(!row||!samuraiDefaults)return row;
    if(row.role_id==='samurai'){
      row={...row};
      for(const field of ['short_copy','full_copy','passive_short','passive_full'])if(typeof row[field]==='string')row[field]=row[field].replaceAll('至少 1 武魂即可施放','至少 4 層武魂才可施放').replaceAll('敵方階段結束統一反擊 round','敵方階段結束對全體可攻擊敵人統一反擊 round');
    }
    if(table==='role_profiles'&&row.role_id==='samurai'&&!String(row.passive_full||'').includes('殘心'))return {...row,...samuraiDefaults.profile};
    if(table==='skill_copies'&&row.role_id==='samurai'&&samuraiDefaults.skills[row.skill_id]&&!String(row.full_copy||'').includes('殘心'))return {...row,...samuraiDefaults.skills[row.skill_id],display_name:row.display_name};
    if(table==='story_copies'&&row.story_key==='equip.samurai.sa_haori'&&!String(row.body||'').includes('餘韻不絕')&&samuraiDefaults.haori)return {...row,body:samuraiDefaults.haori};
    if(table==='skill_copies'&&row.role_id==='stargazer'&&row.skill_id==='sg_observe'&&/固定 5 點真實撕裂傷害|敵我雙方全體本回合受到5點真實撕裂傷害/.test(String(row.full_copy||''))&&samuraiDefaults.stargazerObserve)return {...row,...samuraiDefaults.stargazerObserve,display_name:row.display_name};
    if(table==='story_copies'&&row.story_key==='equip.stargazer.sg_eye'&&String(row.body||'').includes('10點真實傷害')&&samuraiDefaults.stargazerEye)return {...row,body:samuraiDefaults.stargazerEye};
    return row;
  }
  function registerMechanicsCopy(classes,details){
    const c=classes?.samurai;if(!c?.passive?.includes('殘心'))return;
    const sgObserve=classes?.stargazer?.skills?.find(s=>s.id==='sg_observe');
    samuraiDefaults={profile:{short_intro:c.desc,full_intro:c.desc,passive_short:c.passive,passive_full:c.passive},
      skills:Object.fromEntries(c.skills.map(s=>[s.id,{short_copy:s.shortDesc||s.desc,full_copy:s.desc}])),haori:details?.samurai?.equipment?.find(e=>e.name==='殘心羽織')?.desc,
      stargazerObserve:sgObserve?{short_copy:sgObserve.shortDesc||sgObserve.desc,full_copy:sgObserve.desc}:null,
      stargazerEye:details?.stargazer?.equipment?.find(e=>e.name==='克卜勒的深空天眼')?.desc};
    samuraiDefaults.skills.passive={short_copy:c.passive,full_copy:c.passive};
  }
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
  function rows(table){const map=new Map((state.defaults?.[table]||[]).map(r=>[key(table,r),r]));for(const row of state.data[table]||[])map.set(key(table,row),row);return [...map.values()].map(row=>currentMechanicsCopy(table,row));}
  function find(table,id){return currentMechanicsCopy(table,state.data[table]?.find(row=>key(table,row)===id)||state.defaults?.[table]?.find(row=>key(table,row)===id));}
  function role(id,fallback){return {...fallback,...find('role_profiles',id)};}
  function skill(role,skill){return find('skill_copies',role+':'+(skill.copyKey||skill.id));}
  function template(value,vars={}){return String(value||'').replace(/\{(player|floor|boss|route|rageMultiplier)\}/g,(all,key)=>Object.hasOwn(vars,key)?String(vars[key]):all);}
  function preview(payload){sessionStorage.setItem('studio.preview',JSON.stringify({schemaVersion:1,expires:Date.now()+30*60000,...payload}));}
  function applyPreview(){if(location.pathname!=='/lab')return;try{const p=JSON.parse(sessionStorage.getItem('studio.preview')||'null');if(p?.schemaVersion!==1||p.expires<Date.now())return;for(const table of tables){const map=new Map(state.data[table].map(r=>[key(table,r),r]));for(const row of p[table]||[])map.set(key(table,row),row);state.data[table]=[...map.values()];}state.source='preview';emit();}catch{}}
  global.StudioContent={state,tables,key,load,rows,find,role,skill,install,template,preview,applyPreview,json,registerMechanicsCopy};
})(window);
