(function(global){
  const specs={role:{table:'role_profiles',id:'role_id',fields:['name_zh','name_en','short_intro','full_intro','position_label','tags','passive_short','passive_full','radar_output','radar_survival','radar_team','radar_stability','radar_difficulty']},skill:{table:'skill_copies',id:'skill_id',fields:['display_name','short_copy','full_copy']},story:{table:'story_copies',id:'story_key',fields:['category','title','body','paragraphs']},binding:{table:'asset_bindings',id:'binding_key',fields:['asset_key','fallback_path','preload_group','volume_override']}};
  function identity(kind,row){return {kind,key:row[specs[kind].id],...(kind==='skill'?{role_id:row.role_id}:{})};}
  function item(kind,row){return {...identity(kind,row),data:Object.fromEntries(specs[kind].fields.map(f=>[f,row[f]]))};}
  function id(item){return item.kind+':'+(item.role_id||'')+':'+item.key;}
  function validate(input,defaults=StudioContent.state.defaults){
    if(!input||input.schemaVersion!==1||!Array.isArray(input.items)||!input.items.length||input.items.length>500)throw new Error('需要 schemaVersion:1 與 1–500 個 items');
    const seen=new Set();
    for(const value of input.items){const spec=specs[value.kind];if(!spec||!defaults[spec.table].some(row=>row[spec.id]===value.key&&(value.kind!=='skill'||row.role_id===value.role_id)))throw new Error('未知穩定 ID：'+value.key);
      if(seen.has(id(value)))throw new Error('JSON 含重複 ID');seen.add(id(value));
      if(!value.data||Object.keys(value.data).some(f=>!spec.fields.includes(f))||spec.fields.some(f=>!Object.hasOwn(value.data,f)))throw new Error('欄位不完整或含禁止欄位：'+value.key);
      for(const [field,v]of Object.entries(value.data)){
        if(field.startsWith('radar_')){if(!Number.isInteger(v)||v<1||v>5)throw new Error('雷達需為 1–5 整數');}
        else if(['tags','paragraphs'].includes(field)){if(!Array.isArray(v)||v.some(s=>typeof s!=='string'))throw new Error(field+' 必須是字串陣列');}
        else if(field==='volume_override'){if(v!==null&&(typeof v!=='number'||v<0||v>1))throw new Error('無效音量');}
        else if(!(['asset_key','fallback_path','preload_group'].includes(field)&&v===null)&&(typeof v!=='string'||v.length>20000))throw new Error('無效文字欄位 '+field);
      }
    }return input.items;
  }
  function diff(items,current){const changes=[];for(const item of items){const before=current(item)||{};for(const [f,next]of Object.entries(item.data))if(JSON.stringify(before[f])!==JSON.stringify(next))changes.push({id:id(item),field:f,before:before[f],after:next});}return changes;}
  global.StudioSchema={specs,item,identity,id,validate,diff};
})(window);
