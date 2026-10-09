import { catalog, radarFields } from './catalog.js';
export const kinds = {role:{table:'role_profiles',key:'role_id',fields:['name_zh','name_en','short_intro','full_intro','position_label','tags','passive_short','passive_full',...radarFields]},skill:{table:'skill_copies',key:'skill_id',fields:['display_name','short_copy','full_copy']},story:{table:'story_copies',key:'story_key',fields:['category','title','body','paragraphs']},binding:{table:'asset_bindings',key:'binding_key',fields:['asset_key','fallback_path','preload_group','volume_override']}};
export class ValidationError extends Error { constructor(message) { super(message); this.status=400; } }
export function requireValid(condition,message) { if(!condition)throw new ValidationError(message); }
export function text(value, field, limit=20000) { requireValid(typeof value==='string'&&value.length<=limit&&!value.includes('\0'),`${field} 格式錯誤或過長`); return value; }
export function safePath(value, local=false) {
  text(value,'路徑',500); let decoded; try {decoded=decodeURIComponent(value);} catch {throw new ValidationError('無效路徑');}
  requireValid(!/[\\?#\x00-\x1f]/.test(decoded)&&!decoded.split('/').some(s=>s==='..'||s==='.')&&!decoded.startsWith('//'), '禁止路徑穿越');
  requireValid(local?/^\/(photo|BOSS|assets|icon|sound)\//.test(decoded):/^(images\/(roles|bosses|effects|backgrounds)|audio\/(sfx|bgm))\/[\w.-]+$/.test(decoded),'不允許的素材路徑');return value;
}
export function httpsUrl(value) { text(value,'HTTPS URL',2000);let url;try{url=new URL(value);}catch{throw new ValidationError('無效 URL');}requireValid(url.protocol==='https:'&&!url.username&&!url.password,'外部 URL 必須是 HTTPS 且不含帳密');return value; }
export function validateIdentity(item) {
  requireValid(item&&typeof item==='object'&&!Array.isArray(item),'項目必須是物件');const spec=kinds[item.kind];requireValid(spec,'不支援的內容類型');text(item.key,'key',500);
  const list=catalog[spec.table];requireValid(list.some(row=>row[spec.key]===item.key&&(item.kind!=='skill'||row.role_id===item.role_id)),'未知的穩定 ID');return spec;
}
export function validateDraft(item) {
  const spec=validateIdentity(item), data=item.data;requireValid(data&&typeof data==='object'&&!Array.isArray(data),'缺少 data');
  requireValid(Object.keys(data).every(f=>spec.fields.includes(f)),'含不可編輯欄位');
  const row={ [spec.key]:item.key,status:'draft' };if(item.kind==='skill')row.role_id=item.role_id;
  for(const f of spec.fields) {
    const v=data[f];requireValid(v!==undefined,'缺少欄位 '+f);
    if(radarFields.includes(f))requireValid(Number.isInteger(v)&&v>=1&&v<=5,'雷達值必须為 1–5 整數');
    else if(f==='tags'||f==='paragraphs') {requireValid(Array.isArray(v)&&v.length<=100,'無效陣列');v.forEach(x=>text(x,f,f==='tags'?80:10000));}
    else if(f==='volume_override')requireValid(v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1,'音量必須為 0–1');
    else if(v===null&&['asset_key','fallback_path','preload_group'].includes(f)){}
    else text(v,f,['category','display_name','name_zh','name_en','position_label'].includes(f)?200:20000);
    if(f==='fallback_path'&&v)safePath(v,true);
    if(f==='asset_key'&&v)requireValid(/^[a-zA-Z0-9._-]{1,180}$/.test(v),'無效 asset_key');
    if(['body','title','short_copy','full_copy'].includes(f))for(const token of (v||'').matchAll(/\{([^{}]+)\}/g))requireValid(['player','floor','boss','route','rageMultiplier'].includes(token[1]),'未知模板佔位符 '+token[1]);
    row[f]=v;
  } return row;
}
export const uploadTypes={ 'image/png':['png'],'image/jpeg':['jpg','jpeg'],'image/webp':['webp'],'image/gif':['gif'],'audio/mpeg':['mp3'],'audio/wav':['wav'],'audio/x-wav':['wav'],'audio/ogg':['ogg'],'audio/mp4':['m4a'],'audio/flac':['flac'] };
export function validateUpload(input, max=50*1024*1024) {
  text(input.filename,'檔名',180);requireValid(/^[^/\\\x00-\x1f]+$/.test(input.filename)&&!input.filename.includes('..'),'不安全檔名');
  requireValid(uploadTypes[input.mime_type]?.includes(input.filename.split('.').pop().toLowerCase()),'MIME 與副檔名不符或不支援');
  requireValid(Number.isSafeInteger(input.size_bytes)&&input.size_bytes>0&&input.size_bytes<=max,'檔案過大或無效');
  requireValid((input.mime_type.startsWith('image/')?['roles','bosses','effects','backgrounds']:['sfx','bgm']).includes(input.category),'MIME 與類別不符');
  return input;
}
export const assetFields=['display_name','kind','category','source_type','local_path','storage_bucket','storage_path','external_url','mime_type','size_bytes','preload_group','volume','duration_ms','is_public'];
export function validateAsset(input) {
  requireValid(input&&/^[a-zA-Z0-9._-]{1,180}$/.test(input.asset_key),'無效 asset_key');
  requireValid(Object.keys(input).every(f=>f==='asset_key'||assetFields.includes(f)),'素材含未知欄位');
  text(input.display_name,'素材名稱',200);requireValid(['image','audio','video','other'].includes(input.kind),'無效 kind');
  requireValid(['roles','bosses','sfx','bgm','effects','backgrounds','other'].includes(input.category),'無效 category');
  requireValid(typeof input.is_public==='boolean','is_public 必須為 boolean');
  requireValid(typeof input.volume==='number'&&Number.isFinite(input.volume)&&input.volume>=0&&input.volume<=1,'無效音量');
  for(const f of ['size_bytes','duration_ms'])requireValid(input[f]==null||Number.isSafeInteger(input[f])&&input[f]>=0,'無效 '+f);
  for(const f of ['mime_type','preload_group'])if(input[f]!=null)text(input[f],f,150);
  const out={...input,local_path:null,storage_bucket:null,storage_path:null,external_url:null};
  if(input.source_type==='local')out.local_path=safePath(input.local_path,true);
  else if(input.source_type==='external')out.external_url=httpsUrl(input.external_url);
  else if(input.source_type==='storage'){requireValid(input.storage_bucket==='game-assets','只允許 game-assets');out.storage_bucket=input.storage_bucket;out.storage_path=safePath(input.storage_path);}
  else throw new ValidationError('無效 source_type');return out;
}
