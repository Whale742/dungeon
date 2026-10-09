(function(){
  const {el,button}=StudioUI;
  async function init(){
    await StudioContent.load({defaults:true});StudioContent.applyPreview();
    const params=new URLSearchParams(location.search),select=document.getElementById('labSceneSelect');
    const all={...SAMURAI_LAB_SCENES,...GLADIATOR_LAB_SCENES,...PHASE6_LAB_SCENES};
    let scene=params.get('scene');const role=params.get('role'),skill=params.get('skill');
    if(!scene&&role)scene=Object.entries(all).find(([,s])=>(s.role===role||s.steps?.some(x=>x.sourceRole===role))&&(!skill||s.steps?.some(x=>x.actionId===skill)))?.[0];
    if(params.get('binding')){const b=params.get('binding');scene=b.startsWith('bgm.')||b.startsWith('boss.')?'p73_encounter':null;
      if(b.startsWith('sfx.')){const key=b.slice(4),profiles=StudioContent.state.defaults.sfxProfiles;for(const [r,actions]of Object.entries(profiles)){const action=Object.keys(actions).find(a=>actions[a]===key);if(action){scene=Object.entries(all).find(([,s])=>s.steps?.some(x=>x.sourceRole===r&&x.actionId===action))?.[0];if(scene)break;}}}
    }
    if(scene&&Array.from(select.options).some(o=>o.value===scene)){select.value=scene;labState.currentScene=scene;const tag=document.getElementById('labActiveSceneTag');if(tag)tag.textContent=scene;}
    else if(scene)StudioUI.notice('未知場景 ID：'+scene,true);
    const story=params.get('story');
    if(story){const row=StudioContent.find('story_copies',story),panel=el('section',{class:'studio-panel studio-preview',id:'studioStoryPreview'},[el('h3',{text:row?.title||story}),el('p',{text:StudioContent.template([row?.body,...(row?.paragraphs||[])].filter(Boolean).join('\n\n'),{player:'冒險者',floor:1,boss:'遠古守衛石像',route:'羊腸小徑'})})]);document.querySelector('.lab-main').prepend(panel);}
    if(StudioContent.state.source==='preview'){document.getElementById('studioNotice').textContent='正在預覽當次分頁的未發布內容；正式遊戲不會套用。';document.getElementById('studioNotice').append(button('清除預覽',()=>{sessionStorage.removeItem('studio.preview');location.reload();}));}
    if(params.get('binding')){
      const key=params.get('binding'),b=StudioContent.find('asset_bindings',key),a=b&&StudioContent.find('game_assets',b.asset_key),url=a&&assetRegistry.url(a);
      if(url){const panel=el('section',{class:'studio-panel',id:'studioAssetPreview'},[el('h3',{text:'素材預覽 · '+key}),a.kind==='audio'?el('audio',{src:url,controls:true,preload:'none'}):el('img',{src:url,alt:a.display_name,style:'max-width:200px;max-height:140px;object-fit:contain'})]);document.querySelector('.lab-main').prepend(panel);}
    }
    // Preserve every existing control and DOM ID, only regroup panels.
    const sidebar=document.querySelector('.lab-sidebar-content');if(sidebar){const sections=Array.from(sidebar.children).filter(n=>!n.contains(select));for(const node of sections){if(node.tagName==='DETAILS')continue;const heading=node.querySelector('h2,h3,.lab-section-title,.lab-card-title');if(!heading)continue;const details=el('details',{class:'studio-lab-details'});details.append(el('summary',{text:heading.textContent.trim()}));node.before(details);details.append(node);}}
    document.getElementById('btnLabPlay')?.addEventListener('click',()=>{const current=all[labState.currentScene],r=current?.role||current?.steps?.find(x=>x.sourceRole)?.sourceRole;if(r)sfxManager.preloadRole?.(r);},true);
    window.studioLabInitialized=true;
  }
  document.addEventListener('DOMContentLoaded',()=>StudioUI.run(init).catch(()=>{}));
})();
