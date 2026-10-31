(function(global){
  'use strict';
  // Failures expire; only in-flight image work is retained (not decoded bitmaps).
  const failures=new Map(),failed={has:key=>(failures.get(key)||0)>Date.now(),add:key=>{if(key&&!key.startsWith('data:'))failures.set(key,Date.now()+15000);},delete:key=>failures.delete(key)},images=new Map(),backgrounds=new WeakMap(),watched=new WeakMap(),stylesheets=new WeakMap();
  let active=0;const queue=[];
  async function limited(task){if(active>=4)await new Promise(resolve=>queue.push(resolve));active++;try{return await task();}finally{active--;queue.shift()?.();}}
  const empty='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  let bindings=new Map(),assets=new Map(),paths=new Map(),remotePaths=new Map(),locals=new Map(),registeredUrls=new Set();
  const cloudEnabled=()=>StudioContent.state.config?.asset_source_mode==='cloud_first';
  const canonical=path=>global.LocalPaths?global.LocalPaths.canonical(path):path;
  function localPath(value){
    if(typeof value!=='string')return '';
    try{const u=new URL(value,location.href);return u.origin===location.origin?canonical(decodeURIComponent(u.pathname)):value;}catch{return '';}
  }
  function safeLocal(value){const path=localPath(value);return /^\/(photo|BOSS|sound|assets|icon|buff icon)\//.test(path)&&!path.split('/').includes('..')?path:'';}
  function rawUrl(asset){
    if(!asset?.is_public)return '';
    if(asset.source_type==='local')return safeLocal(asset.local_path);
    if(asset.source_type==='external'){try{const u=new URL(asset.external_url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
    if(asset.source_type==='storage'&&asset.storage_bucket==='game-assets'&&typeof asset.storage_path==='string'&&asset.storage_path&&!asset.storage_path.split('/').some(p=>!p||p==='..'||p==='.')&&StudioContent.state.config?.SUPABASE_URL)
      return StudioContent.state.config.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/public/game-assets/'+asset.storage_path.split('/').map(encodeURIComponent).join('/');
    return '';
  }
  function rebuild(){
    locals=new Map((StudioContent.state.defaults?.asset_bindings||[]).map(b=>[b.binding_key,b]));
    const media=cloudEnabled()?StudioContent.rows('game_assets'):StudioContent.state.defaults?.game_assets||[];
    const links=cloudEnabled()?StudioContent.rows('asset_bindings'):[...locals.values()];
    bindings=new Map(links.map(b=>[b.binding_key,b]));assets=new Map(media.map(a=>[a.asset_key,a]));paths=new Map();remotePaths=new Map();
    registeredUrls=new Set(media.map(rawUrl).filter(Boolean));
    for(const b of bindings.values()){
      for(const local of candidates(b.binding_key).filter(safeLocal)){
        const prev=paths.get(local);if(!prev||/^(role|boss|equip)\./.test(b.binding_key))paths.set(local,b.binding_key);
      }
      const remote=rawUrl(assets.get(b.asset_key));if(remote&&!safeLocal(remote))remotePaths.set(remote,b.binding_key);
    }
    for(const [name,path] of [['--studio-game-background','/assets/environments/backgrounds/background.webp']]){
      const target=resolvePath(path);document.documentElement.style.setProperty(name,'url("'+target+'")');
      preloadImage(path).then(image=>{if(resolvePath(path)===image.getAttribute('src'))document.documentElement.style.setProperty(name,'url("'+image.src+'")');}).catch(()=>{});
    }
    applyStyleSheets();
  }
  function binding(key){return bindings.get(key);}
  function candidates(key,fallback){
    const b=binding(key),a=b&&assets.get(b.asset_key);
    const local=[a?.source_type==='local'?a.local_path:null,b?.fallback_path,locals.get(key)?.fallback_path,fallback].map(safeLocal).filter(Boolean);
    const remote=cloudEnabled()?rawUrl(a):'';
    return [...new Set([remote,...local].filter(Boolean))];
  }
  function resolve(key,fallback){const list=candidates(key,fallback);return list.find(p=>!failed.has(p))||list[0]||empty;}
  function pathKey(path){return paths.get(safeLocal(path))||remotePaths.get(path);}
  function resolvePath(path){
    const key=pathKey(path);if(key)return resolve(key,path);
    const local=safeLocal(path);if(local)return local;
    if(String(path).includes('/storage/v1/'))return cloudEnabled()&&registeredUrls.has(path)&&!failed.has(path)?path:empty;
    if(!cloudEnabled()&&/^https?:\/\//i.test(path)&&!safeLocal(path))return empty;
    return path;
  }
  function url(asset){
    for(const b of bindings.values())if(b.asset_key===asset?.asset_key)return resolve(b.binding_key);
    const value=rawUrl(asset);return safeLocal(value)||(cloudEnabled()&&!failed.has(value)?value:'');
  }
  function loadImage(target){
    if(images.has(target))return images.get(target);
    const promise=limited(async()=>{for(let attempt=0;attempt<3;attempt++){
      try{return await new Promise((resolve,reject)=>{
      // Match native <img> and CSS image requests so the browser can share one download.
      const image=new Image();
      let settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=image.onerror=null;if(error){reject(error);}else{failed.delete(target);resolve(image);}};
      const timer=setTimeout(()=>finish(new Error('Image download timeout: '+target)),30000);
      image.onload=async()=>{
        clearTimeout(timer);const start=Date.now();let decodeTimer;
        try{
          if(image.decode)await Promise.race([image.decode(),new Promise((_,reject)=>{decodeTimer=setTimeout(()=>reject(new Error('Image decode timeout: '+target)),10000);})]);
          finish();
        }catch(error){if(image.naturalWidth>0)finish();else finish(error);}
        finally{clearTimeout(decodeTimer);if(typeof CustomEvent!=='undefined')global.dispatchEvent(new CustomEvent('asset:decode',{detail:{url:target,ms:Date.now()-start}}));}
      };
      image.onerror=()=>finish(new Error('Asset unavailable: '+target));image.src=target;
      });}catch(error){if(attempt===2){failed.add(target);throw error;}await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));}
    }}).finally(()=>images.delete(target));
    images.set(target,promise);return promise;
  }
  async function preloadImage(path){
    if(global.StudioContent?.load){const content=StudioContent.load();await (StudioContent.state.assetReady||content);}
    const key=pathKey(path),list=key?candidates(key,path):[resolvePath(path)];
    for(const target of list){if(target===empty)continue;try{return await loadImage(target);}catch{}}
    throw new Error('Asset unavailable: '+path);
  }
  function audioProfile(profile){
    if(!profile)return profile;
    const key=profile.bindingKey||pathKey(profile.localSrc||profile.src),list=key?candidates(key,profile.localSrc||profile.src):[resolvePath(profile.src)];
    const src=list.find(p=>p!==empty&&!failed.has(p))||'';
    return {...profile,src,localSrc:profile.localSrc||profile.src,volume:binding(key)?.volume_override??profile.volume};
  }
  function imageAttribute(node){return node instanceof HTMLImageElement?'src':node.tagName?.toLowerCase()==='image'||(node.tagName?.toLowerCase()==='link'&&/^(icon|apple-touch-icon)$/.test(node.getAttribute('rel')))?'href':null;}
  function recover(node,original,current,attribute){
    if(node.getAttribute(attribute)!==current)return;
    if(node.dataset.assetState==='failed')return;
    if(watched.get(node)?.recovering)return;
    watched.set(node,{recovering:true});node.dataset.assetState='retrying';
    preloadImage(original).then(image=>{if(node.getAttribute(attribute)!==current)return;const target=image.getAttribute('src');node.dataset.studioResolved=target;node.dataset.assetState='loaded';node.setAttribute(attribute,target);}).catch(()=>{if(node.getAttribute(attribute)!==current)return;node.dataset.assetState='failed';node.dispatchEvent(new Event('error'));}).finally(()=>watched.delete(node));
  }
  function applyNode(node,force=false){
    const attribute=imageAttribute(node);
    if(attribute){
      const current=node.getAttribute(attribute)||node.getAttribute('xlink:href');
      const original=(force||current===node.dataset.studioResolved)&&node.dataset.studioOriginal||current;
      if(!original||original===empty||(!safeLocal(original)&&!pathKey(original)&&!original.includes('/storage/v1/')))return;
      node.dataset.studioOriginal=original;
      const target=resolvePath(original);node.dataset.studioResolved=target;
      if(current!==target)node.setAttribute(attribute,target);
      if(node instanceof HTMLImageElement&&watched.get(node)!==target){
        watched.set(node,target);node.dataset.assetState=target===empty?'failed':'loading';
        if(target===empty)return;
        // Native requests own their network lifecycle; never replace a slow image.
        const timer=null;
        node.addEventListener('load',()=>{clearTimeout(timer);if(node.getAttribute(attribute)===target)node.dataset.assetState='loaded';},{once:true});
        node.addEventListener('error',()=>{clearTimeout(timer);recover(node,original,target,attribute);},{once:true});
        if(node.complete){clearTimeout(timer);if(node.naturalWidth)node.dataset.assetState='loaded';else recover(node,original,target,attribute);}
      }else if(!(node instanceof HTMLImageElement)&&watched.get(node)!==target){
        watched.set(node,target);
        preloadImage(original).then(image=>{if(node.getAttribute(attribute)===target)node.setAttribute(attribute,image.getAttribute('src'));}).catch(()=>{node.dataset.assetState='failed';});
      }
    }
    if(node.style?.length)for(const property of Array.from(node.style)){
      const current=node.style.getPropertyValue(property);if(!current.includes('url('))continue;
      let records=backgrounds.get(node);if(!records){records=new Map();backgrounds.set(node,records);}
      const previous=records.get(property);if(previous?.target===current&&!force)continue;
      const original=previous?.target===current?previous.original:current;
      const matches=[...original.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
      if(!matches.some(m=>safeLocal(m[1])||pathKey(m[1])))continue;
      const record={original,target:current};records.set(property,record);
      Promise.all(matches.map(async match=>{if(!safeLocal(match[1])&&!pathKey(match[1]))return match[1];try{return (await preloadImage(match[1])).src;}catch{return resolvePath(match[1]);}})).then(values=>{
        if(records.get(property)!==record||node.style.getPropertyValue(property)!==current)return;
        let i=0;const next=original.replace(/url\(["']?([^"')]+)["']?\)/g,()=> 'url("'+values[i++]+'")');
        record.target=next;node.style.setProperty(property,next);record.target=node.style.getPropertyValue(property);
      });
    }
  }
  function applyMedia(root,force=false){for(const node of [root,...(root.querySelectorAll?.('img, image, [style]')||[])])applyNode(node,force);if(root===document.body)for(const node of document.querySelectorAll?.('link[rel="icon"],link[rel="apple-touch-icon"]')||[])applyNode(node,force);}
  function applyStyleSheets(){
    if(!cloudEnabled())return;
    function visit(rules){for(const rule of rules){
      if(rule.cssRules)visit(rule.cssRules);
      const style=rule.style;if(!style)continue;
      let records=stylesheets.get(style);if(!records){records=new Map();stylesheets.set(style,records);}
      for(const property of Array.from(style)){
        const current=style.getPropertyValue(property),previous=records.get(property);
        const original=previous?.target===current?previous.original:current;
        const matches=[...original.matchAll(/url\(["']?(\/[^"')]+)["']?\)/g)];
        if(!matches.some(m=>pathKey(m[1])&&!safeLocal(resolvePath(m[1]))))continue;
        const next=original.replace(/url\(["']?(\/[^"')]+)["']?\)/g,(_,path)=>'url("'+resolvePath(path)+'")');
        const record={original,target:next};records.set(property,record);const priority=style.getPropertyPriority(property);style.setProperty(property,next,priority);record.target=style.getPropertyValue(property);
        Promise.all(matches.map(async m=>{try{return (await preloadImage(m[1])).src;}catch{return resolvePath(m[1]);}})).then(values=>{
          if(records.get(property)!==record||style.getPropertyValue(property)!==record.target)return;
          let index=0;style.setProperty(property,original.replace(/url\(["']?(\/[^"')]+)["']?\)/g,()=> 'url("'+values[index++]+'")'),priority);record.target=style.getPropertyValue(property);
        });
      }
    }}
    for(const sheet of document.styleSheets||[])try{visit(sheet.cssRules);}catch{/* Cross-origin stylesheets cannot participate in local bindings. */}
  }
  document.addEventListener('load',event=>{if(event.target?.tagName?.toLowerCase()==='link'&&event.target.rel==='stylesheet')applyStyleSheets();},true);
  document.addEventListener('error',event=>{
    const node=event.target,attribute=imageAttribute(node),original=node.dataset?.studioOriginal;
    if(!attribute||!original)return;
    const current=node.getAttribute(attribute);
    // Let legacy terminal-error handlers run only after every permitted backup fails.
    if(node.dataset.assetState!=='failed'){event.stopImmediatePropagation();recover(node,original,current,attribute);}
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    rebuild();applyMedia(document.body);
    new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')applyNode(r.target);else r.addedNodes.forEach(n=>{if(n.nodeType===1)applyMedia(n);});}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','href','xlink:href','style']});
  });
  global.addEventListener('studio:content-ready',()=>{rebuild();applyMedia(document.body,true);});
  global.assetRegistry={url,resolve,resolvePath,audioProfile,preloadImage,binding,canonical:safeLocal,limited,markFailed:value=>failed.add(localPath(value))};
})(window);
