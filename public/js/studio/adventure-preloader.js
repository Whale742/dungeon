(function(global){
  'use strict';
  let manifestPromise,lobbyPromise,adventureKey='',generation=0,panel,hideTimer;
  const completed=new Set();
  const metrics={stages:[],decodeMs:0,decoded:0,cacheHits:0,cacheMisses:0,cacheBytes:0};
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='asset-cache'){metrics[event.data.hit?'cacheHits':'cacheMisses']++;if(event.data.hit)metrics.cacheBytes+=event.data.bytes||0;}});
  if('serviceWorker' in navigator&&global.isSecureContext)navigator.serviceWorker.register('/asset-worker.js',{scope:'/'}).catch(error=>console.warn('[Asset cache]',error.message));
  global.addEventListener('asset:decode',e=>{metrics.decodeMs+=e.detail.ms;metrics.decoded++;});
  if(new URLSearchParams(location.search).has('assetMetrics'))document.addEventListener('DOMContentLoaded',()=>{
    const panel=document.createElement('details'),title=document.createElement('summary'),output=document.createElement('pre'),refresh=document.createElement('button');
    panel.id='assetDiagnostics';title.textContent='素材診斷';refresh.textContent='更新素材量測';
    Object.assign(panel.style,{position:'fixed',bottom:'8px',right:'8px',zIndex:'100001',background:'#111',color:'#eee',maxHeight:'70vh',overflow:'auto',padding:'12px',maxWidth:'90vw'});
    refresh.onclick=()=>{const rows=performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname.startsWith('/assets/'));output.textContent=JSON.stringify({...metrics,bgm:{mode:global.bgmManager?.mode,voices:Object.fromEntries(Object.entries(global.bgmManager?.voices||{}).map(([name,voice])=>[name,voice?{playing:!voice.media.paused,ready:voice.media.readyState,time:voice.media.currentTime}:null])),context:global.sfxManager?.ctx?.state},requests:rows.length,transferBytes:rows.reduce((n,r)=>n+r.transferSize,0),encodedBytes:rows.reduce((n,r)=>n+r.encodedBodySize,0),resourceMs:rows.reduce((n,r)=>n+r.duration,0),loadMs:performance.getEntriesByType('navigation')[0]?.loadEventEnd||0},null,2);};
    panel.append(title,refresh,output);document.body.append(panel);
  });
  async function manifest(){
    if(!manifestPromise)manifestPromise=fetch('/asset-manifest.json',{cache:'no-cache',signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error('Manifest HTTP '+r.status);return r.json();}).catch(error=>{manifestPromise=null;throw error;});
    return manifestPromise;
  }
  function close(){generation++;clearTimeout(hideTimer);panel?.remove();panel=null;}
  async function prepare(stage,assets,progress=()=>{}){
    const started=performance.now();let done=0,failed=0;progress(0,assets.length);
    await Promise.all(assets.map(async a=>{
      try{
        if(!completed.has(a.id+':'+a.revision)){
          if(a.type==='image')await global.assetRegistry.preloadImage(a.url);
          else {const profile=Object.values(SFX_ASSETS).find(p=>global.assetRegistry.canonical(p.src)===a.url);if(profile){const buffer=await sfxManager.loadAsset(profile);if(!buffer)throw Error('SFX unavailable');}}
          completed.add(a.id+':'+a.revision);
        }
      }catch{failed++;}finally{progress(++done,assets.length);}
    }));
    metrics.stages.push({stage,count:assets.length,failed,ms:performance.now()-started});
    if(metrics.stages.length>30)metrics.stages.shift();
    return {failed};
  }
  function lobby(){return lobbyPromise||=(async()=>{const m=await manifest();return prepare('lobby',m.assets.filter(a=>a.lobby));})().catch(error=>{lobbyPromise=null;console.warn('[Assets lobby]',error.message);});}
  async function adventure(state){
    const roles=[...new Set((state.players||[]).map(p=>p.role).filter(Boolean))];
    const key=state.code+':'+roles.sort().join(',');if(adventureKey===key)return;
    adventureKey=key;const token=++generation;
    panel=document.createElement('div');panel.id='adventureAssetLoading';panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');
    Object.assign(panel.style,{position:'fixed',bottom:'18px',right:'18px',width:'min(280px, calc(100vw - 36px))',boxSizing:'border-box',zIndex:'10000',background:'#0b1019 url("/assets/ui/gui-skin/inputs/panel-tooltip-dialog.png") center / 100% 100%',color:'#f1dfb7',border:'1px solid #b49b65',borderRadius:'8px',boxShadow:'0 8px 28px #0009',padding:'18px 22px',display:'grid',gap:'9px',fontSize:'13px',pointerEvents:'none'});
    const label=document.createElement('div');label.textContent='準備冒險素材…';const progress=document.createElement('progress');progress.max=1;progress.value=0;progress.setAttribute('aria-label','冒險素材載入進度');Object.assign(progress.style,{width:'100%',height:'9px',accentColor:'#cbb075'});
    const hint=document.createElement('small');hint.textContent='可繼續冒險，素材會在背景準備';hint.style.opacity='.8';panel.append(label,progress,hint);document.body.append(panel);
    try{
      const m=await manifest();
      const visible=new Set((state.enemies||[]).flatMap(e=>[e.avatar,e.battleAvatar,...Object.values(e.battleFormAvatars||{})]).filter(p=>typeof p==='string').map(p=>global.assetRegistry.canonical(p)));
      const selected=m.assets.filter(a=>a.battle||a.roles.some(r=>roles.includes(r))||visible.has(a.url));
      const result=await prepare('adventure',selected,(done,total)=>{if(token!==generation)return;progress.max=total||1;progress.value=done;label.textContent=`準備冒險素材 ${done} / ${total}`;});
      if(token===generation){label.textContent=result.failed?'素材準備完成・部分使用簡化演出':'冒險素材準備完成';hint.textContent=result.failed?`${result.failed} 項暫時無法使用，戰鬥仍可繼續`:'圖片與音效已就緒';}
    }catch(error){console.warn('[Assets adventure]',error.message);if(token===generation){label.textContent='素材稍後按需載入';hint.textContent='可繼續冒險，缺少素材時使用簡化演出';}}
    finally{if(token===generation)hideTimer=setTimeout(()=>{if(token===generation)close();},4000);}
  }
  let encounterKey='';
  function encounter(state){
    // Only use enemy information already present in this client's public state.
    const enemies=state.enemies?.length?state.enemies:[state.currentMonster].filter(Boolean);
    const urls=new Set(enemies.flatMap(e=>[e.avatar,e.battleAvatar,...Object.values(e.battleFormAvatars||{})]).filter(p=>typeof p==='string').map(p=>global.assetRegistry.canonical(p)));
    for(const enemy of enemies){
      const art=typeof ENEMY_PAINTED_ART!=='undefined'?ENEMY_PAINTED_ART[enemy.presentation?.mechanicId]||[]:[];
      if(typeof enemyPaintedAssetUrl==='function')for(const path of art)urls.add(global.assetRegistry.canonical(enemyPaintedAssetUrl(path)));
    }
    const key=[...urls].sort().join('|');if(!key||key===encounterKey)return;encounterKey=key;
    void manifest().then(m=>prepare('encounter',m.assets.filter(a=>urls.has(a.url)))).catch(()=>{encounterKey='';});
  }
  global.AdventureAssets={lobby,adventure,encounter,metrics,gate(state){
    if(state.viewer?.spectator){encounter(state);return false;}
    if(state.state==='LOBBY'){if(adventureKey)this.reset();void lobby();return false;}
    if(!['GAME_OVER','VICTORY'].includes(state.state)&&!adventureKey)void adventure(state);
    encounter(state);return false;
  },reset(){adventureKey='';encounterKey='';close();}};
})(window);
