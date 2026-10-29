'use strict';
// Only public, manifest-listed images enter Cache Storage. Music uses HTTP
// range streaming; credentials, saves, API responses and HTML never enter it.
const CACHE='dungeon-public-media-v1',MAX_BYTES=96*1024*1024,MAX_ENTRIES=160;
let manifestPromise,writeChain=Promise.resolve();
function manifest(){return manifestPromise||=fetch('/asset-manifest.json',{cache:'no-cache',credentials:'omit'}).then(r=>{if(!r.ok)throw Error('Manifest unavailable');return r.json();}).then(m=>new Map(m.assets.filter(a=>a.type==='image').map(a=>[a.url,a]))).catch(error=>{manifestPromise=null;throw error;});}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await self.clients.claim();
  for(const name of await caches.keys())if(name.startsWith('dungeon-public-media-')&&name!==CACHE)await caches.delete(name);
})()));
async function store(cache,key,response,asset,entries){
  const keys=await cache.keys();let bytes=0;
  for(const request of keys){const u=new URL(request.url),a=entries.get(decodeURIComponent(u.pathname));if(!a||u.searchParams.get('rev')!==a.revision)await cache.delete(request);else bytes+=a.bytes;}
  let count=(await cache.keys()).length;
  for(const request of await cache.keys()){
    if(count<MAX_ENTRIES&&bytes+asset.bytes<=MAX_BYTES)break;
    const a=entries.get(decodeURIComponent(new URL(request.url).pathname));await cache.delete(request);bytes-=a?.bytes||0;count--;
  }
  if(asset.bytes<=MAX_BYTES)await cache.put(key,response);
}
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  // A page navigation must see the current deployment even if this unchanged
  // worker has survived a release in the browser process.
  if(req.mode==='navigate')manifestPromise=null;
  if(req.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/assets/')||req.headers.has('range')||url.search)return;
  event.respondWith((async()=>{
    let entries,asset,cache,key;
    try{
      entries=await manifest();asset=entries.get(decodeURIComponent(url.pathname));if(!asset)return fetch(req);
      key=new Request(url.origin+url.pathname+'?rev='+asset.revision);cache=await caches.open(CACHE);
      const hit=await cache.match(key);if(hit){if(event.clientId)self.clients.get(event.clientId).then(client=>client?.postMessage({type:'asset-cache',hit:true,bytes:asset.bytes}));const headers=new Headers(hit.headers);headers.set('X-Dungeon-Cache','hit');return new Response(hit.body,{status:hit.status,headers});}
    }catch{return fetch(req);}
    const response=await fetch(req);
    if(event.clientId)self.clients.get(event.clientId).then(client=>client?.postMessage({type:'asset-cache',hit:false,bytes:asset.bytes}));
    if(response.ok&&response.status===200&&response.headers.get('content-type')?.startsWith('image/')){
      const copy=response.clone();writeChain=writeChain.then(()=>store(cache,key,copy,asset,entries)).catch(()=>{});event.waitUntil(writeChain);
    }
    return response;
  })());
});
