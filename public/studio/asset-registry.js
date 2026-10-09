(function(global){
  'use strict';
  const failed=new Set(),backgrounds=new WeakMap();let bindings=new Map(),assets=new Map(),paths=new Map();
  function rebuild(){bindings=new Map(StudioContent.rows('asset_bindings').map(row=>[row.binding_key,row]));assets=new Map(StudioContent.rows('game_assets').map(row=>[row.asset_key,row]));paths=new Map();for(const row of bindings.values())if(row.fallback_path){const prev=paths.get(row.fallback_path);if(!prev||/^(role|boss)\./.test(row.binding_key))paths.set(row.fallback_path,row.binding_key);}const background='/icon/background.webp';if(document.documentElement?.style){document.documentElement.style.setProperty('--studio-game-background','url("'+resolvePath(background)+'")');if(resolvePath(background)!==background)preloadImage(background).then(image=>document.documentElement.style.setProperty('--studio-game-background','url("'+image.src+'")')).catch(()=>{});}}
  function url(asset){if(!asset)return null;if(asset.source_type==='local')return /^\/(photo|BOSS|sound|assets|icon)\//.test(asset.local_path)&&!asset.local_path.includes('..')?asset.local_path:null;if(asset.source_type==='external'){try{const u=new URL(asset.external_url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}if(asset.source_type==='storage'&&asset.storage_bucket==='game-assets'&&!asset.storage_path?.split('/').includes('..'))return StudioContent.state.config?.SUPABASE_URL+'/storage/v1/object/public/game-assets/'+asset.storage_path.split('/').map(encodeURIComponent).join('/');return null;}
  function binding(key){return bindings.get(key);}
  function resolve(key,fallback){const b=binding(key),asset=b&&assets.get(b.asset_key);const target=asset?.is_public?url(asset):null;return target&&!failed.has(target)?target:fallback||b?.fallback_path||'';}
  function resolvePath(path){const key=paths.get(path);return key?resolve(key,path):path;}
  async function preloadImage(path){const target=resolvePath(path),image=new Image();image.src=target;try{await image.decode();}catch(error){if(target===path)throw error;failed.add(target);image.src=path;await image.decode();}return image;}
  function audioProfile(profile){if(!profile)return profile;const src=profile.bindingKey?resolve(profile.bindingKey,profile.src):resolvePath(profile.src),b=profile.bindingKey&&binding(profile.bindingKey);return {...profile,src,volume:b?.volume_override??profile.volume,localSrc:profile.localSrc||profile.src};}
  function applyNode(node,force=false){
    if(node instanceof HTMLImageElement){const current=node.getAttribute('src');let original=current;
      if(force&&node.dataset.studioOriginal)original=node.dataset.studioOriginal;
      else if(current===node.dataset.studioResolved)original=node.dataset.studioOriginal;
      if(original&&!original.startsWith('/')){try{const parsed=new URL(original,location.href);if(parsed.origin===location.origin&&paths.has(parsed.pathname))original=parsed.pathname;}catch{}}
      if(!original?.startsWith('/')){delete node.dataset.studioOriginal;delete node.dataset.studioResolved;return;}
      node.dataset.studioOriginal=original;const target=resolvePath(original);node.dataset.studioResolved=target;if(current!==target)node.src=target;
    }else if(node.style?.backgroundImage?.includes('url(')){const current=node.style.backgroundImage,previous=backgrounds.get(node);if(!force&&previous?.target===current)return;
      const original=previous?.target===current?previous.original:current,next=original.replace(/url\(["']?(\/[^"')]+)["']?\)/g,(all,path)=>'url("'+resolvePath(path)+'")');backgrounds.set(node,{original,target:next});if(next!==current)node.style.backgroundImage=next;
    }
  }
  function applyMedia(root,force=false){for(const node of [root,...(root.querySelectorAll?.('img, image, [style]')||[])])applyNode(node,force);}
  document.addEventListener('error',event=>{const node=event.target;if(node instanceof HTMLImageElement&&node.dataset.studioOriginal&&node.src!==new URL(node.dataset.studioOriginal,location.origin).href){failed.add(node.src);node.src=node.dataset.studioOriginal;}},true);
  document.addEventListener('DOMContentLoaded',()=>{rebuild();applyMedia(document.body);new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')applyNode(r.target);else r.addedNodes.forEach(n=>{if(n.nodeType===1)applyMedia(n);});}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','style']});});
  global.addEventListener('studio:content-ready',()=>{failed.clear();rebuild();applyMedia(document.body,true);});
  global.assetRegistry={url,resolve,resolvePath,audioProfile,preloadImage,binding,markFailed:value=>failed.add(value)};
})(window);
