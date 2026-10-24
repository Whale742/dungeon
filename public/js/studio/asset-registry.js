(function(global){
  'use strict';
  const failed=new Set(),backgrounds=new WeakMap();let bindings=new Map(),assets=new Map(),paths=new Map();
  function rebuild(){
    bindings=new Map(StudioContent.rows('asset_bindings').map(row=>[row.binding_key,row]));assets=new Map(StudioContent.rows('game_assets').map(row=>[row.asset_key,row]));paths=new Map();
    for(const row of bindings.values())if(row.fallback_path){const path=canonical(row.fallback_path),prev=paths.get(path);if(!prev||/^(role|boss|equip)\./.test(row.binding_key))paths.set(path,row.binding_key);}
    if(document.documentElement?.style)for(const [name,path] of [['--studio-game-background','/assets/environments/backgrounds/background.webp'],['--studio-battle-background','/photo/Battle.webp']]){
      document.documentElement.style.setProperty(name,'url("'+resolvePath(path)+'")');
      if(resolvePath(path)!==path)preloadImage(path).then(image=>document.documentElement.style.setProperty(name,'url("'+image.src+'")')).catch(()=>{});
    }
  }
  function url(asset){if(!asset)return null;if(asset.source_type==='local')return /^\/(photo|BOSS|sound|assets|icon|buff icon)\//.test(asset.local_path)&&!asset.local_path.includes('..')?asset.local_path:null;if(asset.source_type==='external'){try{const u=new URL(asset.external_url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}if(asset.source_type==='storage'&&StudioContent.state.config?.SUPABASE_URL&&asset.storage_bucket==='game-assets'&&!asset.storage_path?.split('/').includes('..'))return StudioContent.state.config?.SUPABASE_URL+'/storage/v1/object/public/game-assets/'+asset.storage_path.split('/').map(encodeURIComponent).join('/');return null;}
  function binding(key){return bindings.get(key);}
  function resolve(key,fallback){const b=binding(key),asset=b&&assets.get(b.asset_key);const target=asset?.is_public?url(asset):null;return target&&!failed.has(target)?target:fallback||b?.fallback_path||'';}
  function localPath(value){if(typeof value!=='string')return value;try{const parsed=new URL(value,location.href);return parsed.origin===location.origin?decodeURIComponent(parsed.pathname):value;}catch{return value;}}
  function canonical(path){return global.LocalPaths?global.LocalPaths.canonical(path):path;}
  function resolvePath(path){const key=paths.get(canonical(localPath(path)));return key?resolve(key,path):path;}
  async function preloadImage(path){
    if(global.StudioContent?.load)await StudioContent.load();
    const target=resolvePath(path),image=new Image();image.crossOrigin='anonymous';image.src=target;
    try{await image.decode();}catch(error){if(target===path)throw error;failed.add(target);image.src=path;await image.decode();}return image;
  }
  function audioProfile(profile){if(!profile)return profile;const src=profile.bindingKey?resolve(profile.bindingKey,profile.src):resolvePath(profile.src),b=profile.bindingKey&&binding(profile.bindingKey);return {...profile,src,volume:b?.volume_override??profile.volume,localSrc:profile.localSrc||profile.src};}
  function imageAttribute(node){return node instanceof HTMLImageElement?'src':node.tagName?.toLowerCase()==='image'||(node.tagName?.toLowerCase()==='link'&&/^(icon|apple-touch-icon)$/.test(node.getAttribute('rel')))?'href':null;}
  function applyNode(node,force=false){
    const attribute=imageAttribute(node);
    if(attribute){const current=node.getAttribute(attribute)||node.getAttribute('xlink:href');let original=current;
      if(force&&node.dataset.studioOriginal)original=node.dataset.studioOriginal;
      else if(current===node.dataset.studioResolved)original=node.dataset.studioOriginal;
      original=localPath(original);
      if(!original?.startsWith('/')||!paths.has(original)){delete node.dataset.studioOriginal;delete node.dataset.studioResolved;return;}
      node.dataset.studioOriginal=original;const target=resolvePath(original);node.dataset.studioResolved=target;if(current!==target)node.setAttribute(attribute,target);
    }else if(node.style?.backgroundImage?.includes('url(')){const current=node.style.backgroundImage,previous=backgrounds.get(node);if(!force&&previous?.target===current)return;
      const original=previous?.target===current?previous.original:current,next=original.replace(/url\(["']?(\/[^"')]+)["']?\)/g,(all,path)=>'url("'+resolvePath(path)+'")');backgrounds.set(node,{original,target:next});if(next!==current)node.style.backgroundImage=next;
    }
  }
  function applyMedia(root,force=false){for(const node of [root,...(root.querySelectorAll?.('img, image, [style]')||[])])applyNode(node,force);if(root===document.body)for(const node of document.querySelectorAll?.('link[rel="icon"],link[rel="apple-touch-icon"]')||[])applyNode(node,force);}
  document.addEventListener('error',event=>{const node=event.target;const attribute=imageAttribute(node);if(!attribute)return;const current=node.getAttribute(attribute),original=node.dataset.studioOriginal;if(original&&current&&new URL(current,location.href).href!==new URL(original,location.href).href){failed.add(current);node.setAttribute(attribute,original);}},true);
  document.addEventListener('DOMContentLoaded',()=>{rebuild();applyMedia(document.body);new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')applyNode(r.target);else r.addedNodes.forEach(n=>{if(n.nodeType===1)applyMedia(n);});}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','href','xlink:href','style']});});
  global.addEventListener('studio:content-ready',()=>{failed.clear();rebuild();applyMedia(document.body,true);});
  global.assetRegistry={url,resolve,resolvePath,audioProfile,preloadImage,binding,markFailed:value=>failed.add(value)};
})(window);
