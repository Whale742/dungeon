(function(){
  'use strict';
  const {el,button,notice,formField}=StudioUI,byId=id=>document.getElementById(id);
  const assets=new Map(),draftBindings=new Map(),selectedAssetKeys=new Set();
  let category='all',sourceFilter='all',selected=null,bindingKey='',unsaved=false,pendingUpload=null;

  const categories={all:'全部',roles:'職業頭像',bosses:'BOSS 頭像',sfx:'SFX',bgm:'BGM',effects:'技能特效圖片',backgrounds:'背景圖片',other:'其他素材'};
  const sourceLabels={local:'Local 本地',storage:'Supabase Storage',external:'External URL'};

  function assetUrl(asset){return assetRegistry.url(asset);}
  function refreshMap(){
    assets.clear();
    for(const asset of StudioContent.rows('game_assets'))assets.set(asset.asset_key,asset);
  }

  function formatBytes(bytes){
    if(bytes==null||bytes===0)return '0 B';
    const k=1024,sizes=['B','KB','MB','GB'];
    const i=Math.floor(Math.log(bytes)/Math.log(k));
    return (bytes/Math.pow(k,i)).toFixed(1)+' '+sizes[i];
  }

  function updateSelectionControls(){
    const localSelected=[...selectedAssetKeys].filter(k=>assets.get(k)?.source_type==='local');
    const countEl=byId('selectedCount');if(countEl)countEl.textContent=localSelected.length;
    const btn=byId('assetMigrateSelected');if(btn)btn.disabled=localSelected.length===0;
  }

  function render(){
    const q=(byId('assetSearch')?.value||'').toLowerCase();
    const list=[...assets.values()].filter(a=>{
      if(category!=='all'&&a.category!==category)return false;
      if(sourceFilter!=='all'&&a.source_type!==sourceFilter)return false;
      const haystack=[a.asset_key,a.display_name,a.local_path,a.storage_path,a.external_url].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });

    const grid=byId('assetGrid');
    grid.replaceChildren(...list.map(a=>{
      const isSelected=selectedAssetKeys.has(a.asset_key);
      const card=button('',()=>{
        if(unsaved&&!confirm('切換將放棄未儲存的綁定編輯，確定？'))return;
        selected=a.asset_key;
        bindingKey='';
        unsaved=false;
        detail();
      },{class:'studio-asset-card'+(selected===a.asset_key?' is-selected':'')});

      // Checkbox
      const chk=el('input',{type:'checkbox',class:'studio-asset-select',checked:isSelected,title:'選取此素材進行批次操作',onclick:(e)=>{
        e.stopPropagation();
        if(chk.checked)selectedAssetKeys.add(a.asset_key);
        else selectedAssetKeys.delete(a.asset_key);
        updateSelectionControls();
      }});
      card.append(chk);

      const url=assetUrl(a);
      if(a.kind==='image')card.append(el('img',{src:url,alt:a.display_name,loading:'lazy'}));
      else card.append(el('div',{class:'studio-audio-icon',text:a.kind==='audio'?'AUDIO':'ASSET'}));

      card.append(el('strong',{text:a.display_name}));

      const badges=el('div',{class:'studio-asset-card-badges'},[
        el('span',{class:'studio-badge badge-'+a.source_type,text:a.source_type.toUpperCase()}),
        el('span',{class:'studio-muted',text:categories[a.category]||a.category}),
        el('span',{class:'studio-muted',text:a.is_public?'公開':'未公開'})
      ]);
      card.append(badges);
      return card;
    }));

    if(!list.length)grid.append(el('p',{text:'沒有符合條件的素材。'}));
    updateSelectionControls();
    if(selected)detail();
  }

  const identity=()=>({kind:'binding',key:bindingKey});
  function selectedBinding(){
    return draftBindings.get(bindingKey)||StudioContent.find('asset_bindings',bindingKey)||StudioContent.state.defaults.asset_bindings.find(b=>b.binding_key===bindingKey);
  }
  function bindingItem(){
    return {
      ...identity(),
      data:{
        asset_key:byId('bindingAsset').value||null,
        fallback_path:byId('bindingFallback').value||null,
        preload_group:byId('bindingPreload').value||null,
        volume_override:byId('bindingVolume').value===''?null:Number(byId('bindingVolume').value)
      }
    };
  }

  function detail(){
    const a=assets.get(selected);if(!a)return;
    const target=byId('assetDetail'),url=assetUrl(a);
    target.replaceChildren();

    const titleRow=el('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:8px;'},[
      el('h2',{text:a.display_name,style:'margin:0;'}),
      el('span',{class:'studio-badge badge-'+a.source_type,text:sourceLabels[a.source_type]||a.source_type})
    ]);
    target.append(titleRow);

    if(a.kind==='image')target.append(el('img',{src:url,alt:a.display_name}));
    if(a.kind==='audio'){
      const audio=el('audio',{src:url,controls:true,preload:'none'});
      audio.volume=Number(a.volume)||0;
      target.append(audio,formField('試聽音量',audio.volume,v=>audio.volume=Number(v),{type:'range',min:0,max:1,step:.01}));
    }

    const pairs=[
      ['asset_key',a.asset_key],
      ['來源類型',sourceLabels[a.source_type]||a.source_type],
      ['檔案類型',a.mime_type||a.kind],
      ['檔案大小',formatBytes(a.size_bytes)],
      ['儲存路徑',a.local_path||[a.storage_bucket,a.storage_path].filter(Boolean).join('/')||a.external_url],
      ['公開 URL',url],
      ['公開狀態',a.is_public?'已公開':'尚未公開'],
      ['版本',a.version||1]
    ];
    target.append(el('dl',{},pairs.flatMap(([label,value])=>[el('dt',{text:label}),el('dd',{text:value})])));
    if(url)target.append(el('a',{href:url,target:'_blank',rel:'noopener',text:'在新分頁開啟公開 URL'}));

    // If local asset: show button to migrate single asset to Storage
    if(a.source_type==='local'){
      const migrateOneBtn=button('☁️ 將此本地素材遷移至 Storage',async()=>{
        try{
          migrateOneBtn.disabled=true;
          notice('正在上傳素材至 Supabase Storage…');
          const resp=await StudioWrite.request('/migration/assets',{method:'POST',body:{assetKeys:[a.asset_key]}});
          if(resp.failedCount>0){
            notice('遷移失敗：'+resp.errors[0]?.error,true);
          }else{
            await StudioContent.load({force:true});
            refreshMap();
            const storageKey='storage.'+a.asset_key.replace(/^local\./,'');
            if(assets.has(storageKey))selected=storageKey;
            render();
            notice('素材已成功上傳至 Supabase Storage 並登記！');
          }
        }catch(e){
          notice('遷移出錯：'+e.message,true);
        }finally{
          migrateOneBtn.disabled=false;
        }
      },{class:'studio-primary',style:'margin-top:10px;display:block;width:100%;'});
      target.append(migrateOneBtn);
    }

    // Comparison section if this is a storage asset or has a local counterpart
    if(a.source_type==='storage'){
      const counterpartKey='local.'+a.asset_key.replace(/^storage\./,'');
      const localCounterpart=assets.get(counterpartKey);
      if(localCounterpart){
        const compareBox=el('div',{class:'studio-asset-compare'},[
          el('h4',{text:'新舊素材比對 (Storage vs Local)',style:'margin:0 0 6px;'}),
          el('div',{class:'studio-asset-compare-grid'},[
            el('div',{class:'studio-compare-col'},[
              el('strong',{text:'雲端 Storage (新)'}),
              a.kind==='image'?el('img',{src:url}):el('p',{text:'音訊'}),
              el('div',{text:'大小: '+formatBytes(a.size_bytes)}),
              el('div',{class:'studio-muted',text:a.storage_path})
            ]),
            el('div',{class:'studio-compare-col'},[
              el('strong',{text:'本地 Local (舊)'}),
              localCounterpart.kind==='image'?el('img',{src:assetUrl(localCounterpart)}):el('p',{text:'音訊'}),
              el('div',{text:'大小: '+formatBytes(localCounterpart.size_bytes)}),
              el('div',{class:'studio-muted',text:localCounterpart.local_path})
            ])
          ])
        ]);
        target.append(compareBox);
      }
    }

    let name=a.display_name;
    target.append(
      formField('素材名稱',name,v=>{name=v;unsaved=true;}),
      button('儲存名稱',async()=>{
        await StudioWrite.request('/assets/'+encodeURIComponent(a.asset_key),{method:'PATCH',body:{display_name:name}});
        a.display_name=name;unsaved=false;render();notice('素材名稱已儲存。');
      }),
      button(a.is_public?'素材已公開':'公開此素材',async()=>{
        await StudioWrite.request('/assets/'+encodeURIComponent(a.asset_key),{method:'PATCH',body:{is_public:true}});
        a.is_public=true;render();notice('素材已公開，可用於正式綁定。');
      },{disabled:a.is_public})
    );

    const uses=StudioContent.rows('asset_bindings').filter(b=>b.asset_key===a.asset_key);
    target.append(
      el('h3',{text:'使用位置'}),
      el('p',{class:'studio-muted',text:[...(StudioContent.state.defaults.usage[a.asset_key]||[]),...uses.map(b=>b.binding_key)].join('\n')||'尚未綁定；可選擇下方用途。'})
    );

    const options=StudioContent.rows('asset_bindings');
    if(!bindingKey)bindingKey=uses[0]?.binding_key||options.find(b=>b.preload_group===a.category)?.binding_key||options[0]?.binding_key;
    const select=el('select',{id:'assetBindingSelect',onchange:e=>{bindingKey=e.target.value;unsaved=false;detail();}},options.map(b=>el('option',{value:b.binding_key,text:b.binding_key})));
    select.value=bindingKey;
    target.append(el('h3',{text:'素材用途綁定'}),el('label',{class:'studio-field'},[el('span',{text:'穩定 binding_key'}),select]));

    const b=selectedBinding();if(!b)return;
    const choices=el('select',{id:'bindingAsset',onchange:()=>{unsaved=true;}},[
      el('option',{value:'',text:'使用本地 fallback'}),
      ...[...assets.values()].map(r=>el('option',{value:r.asset_key,text:`[${r.source_type.toUpperCase()}] ${r.display_name} · ${r.is_public?'公開':'未公開'}`}))
    ]);
    choices.value=b.asset_key||'';
    const label=el('label',{class:'studio-field'},[el('span',{text:'指向的 asset_key'}),choices]);
    target.append(label,button('將目前檢視素材設為用途草稿',()=>{choices.value=a.asset_key;unsaved=true;notice('已選擇素材，請儲存草稿。');}));

    target.append(
      formField('本地 fallback 路徑',b.fallback_path||'',()=>{unsaved=true;},{id:'bindingFallback'}),
      formField('預載群組',b.preload_group||'',()=>{unsaved=true;},{id:'bindingPreload'}),
      formField('用途試聽音量（留白沿用演出設定）',b.volume_override??'',()=>{unsaved=true;},{id:'bindingVolume',type:'number',min:0,max:1,step:.01})
    );
    target.append(
      el('p',{class:'studio-muted',text:'音量覆寫只影響音量；節拍、offset 與播放時長沿用原有演出設定。'}),
      el('div',{class:'studio-toolbar'},[
        button('儲存綁定草稿',saveBinding,{class:'studio-primary'}),
        button('發布綁定',publishBinding),
        button('在 Lab 預覽',labPreview),
        button('版本歷史',loadHistory)
      ]),
      el('div',{id:'bindingHistory'})
    );
  }

  async function saveBinding(){
    const value=bindingItem();
    await StudioWrite.request('/drafts',{method:'POST',body:value});
    draftBindings.set(bindingKey,{binding_key:bindingKey,...value.data,status:'draft'});
    unsaved=false;
    notice('素材綁定雲端草稿已儲存。');
  }

  async function publishBinding(){
    const value=bindingItem();
    if(value.data.asset_key&&!assets.get(value.data.asset_key)?.is_public)throw new Error('正式綁定只能引用已公開素材；請先公開素材。');
    if(unsaved||!draftBindings.has(bindingKey))await saveBinding();
    await StudioWrite.request('/publish',{method:'POST',body:identity()});
    draftBindings.delete(bindingKey);
    await StudioContent.load({force:true});
    refreshMap();
    detail();
    notice('綁定已正式發布；新開的遊戲會讀取更新素材。');
  }

  function labPreview(){
    const item=bindingItem(),a=assets.get(item.data.asset_key);
    StudioContent.preview({game_assets:a?[{...a,is_public:true}]:[],asset_bindings:[{binding_key:bindingKey,...item.data,status:'published'}]});
    const role=bindingKey.startsWith('role.')?bindingKey.split('.')[1]:null;
    location.href='/lab?'+new URLSearchParams(role?{role}:{binding:bindingKey});
  }

  async function loadHistory(){
    const rows=await StudioWrite.request('/revisions?'+new URLSearchParams(identity()));
    const restore=async(r,snapshot)=>{
      const value=await StudioWrite.request('/restore',{method:'POST',body:{revision_id:r.id,snapshot}});
      draftBindings.set(bindingKey,value.row);
      unsaved=false;
      detail();
      notice('已還原成新草稿，發布會建立新版本。');
    };
    byId('bindingHistory').replaceChildren(...rows.map(r=>el('div',{},[
      button('回復 v'+r.version+' · '+new Date(r.created_at).toLocaleString('zh-TW'),()=>restore(r,'published')),
      ...(r.previous_data?[button('回復發布前 v'+r.previous_data.version,()=>restore(r,'previous'))]:[])
    ])));
    if(!rows.length)byId('bindingHistory').textContent='尚無發布歷史。';
  }

  function sourceFields(){
    const form=byId('assetRegisterForm'),source=form.elements.source_type.value;
    byId('assetFileField').hidden=source!=='storage';
    byId('assetUrlField').hidden=source!=='external';
    byId('assetLocalField').hidden=source!=='local';
    byId('assetRegisterSubmit').textContent=source==='storage'?'上傳並登記':'登記素材';
  }

  async function register(event){
    event.preventDefault();
    const form=byId('assetRegisterForm'),data=Object.fromEntries(new FormData(form)),file=form.elements.file.files[0],status=byId('assetUploadStatus'),submit=byId('assetRegisterSubmit');
    submit.disabled=true;
    try{
      const kind=['sfx','bgm'].includes(data.category)?'audio':'image';
      let input={
        asset_key:'studio.'+crypto.randomUUID(),
        display_name:data.display_name,
        kind,
        category:data.category,
        source_type:data.source_type,
        local_path:null,
        storage_bucket:null,
        storage_path:null,
        external_url:null,
        mime_type:null,
        size_bytes:null,
        preload_group:data.category,
        volume:1,
        duration_ms:null,
        is_public:data.is_public==='true'
      },receipt;

      if(data.source_type==='storage'){
        if(!file)throw new Error('請選擇檔案');
        if(file.size>50*1024*1024)throw new Error('檔案超過 50 MB');
        const fingerprint=[file.name,file.size,file.lastModified,data.category].join(':');
        if(!pendingUpload||pendingUpload.fingerprint!==fingerprint){
          status.textContent='驗證並申請 Signed Upload URL…';
          const signed=await StudioWrite.request('/assets/sign-upload',{method:'POST',body:{filename:file.name,mime_type:file.type,size_bytes:file.size,category:data.category}});
          pendingUpload={fingerprint,...signed,uploaded:false};
        }
        if(!pendingUpload.uploaded){
          status.textContent='直接上傳到 Supabase Storage…';
          const multipart=new FormData();
          multipart.append('cacheControl','3600');
          multipart.append('',file);
          const response=await fetch(pendingUpload.signedUrl,{method:'PUT',body:multipart,headers:{'x-upsert':'false'}});
          if(!response.ok){
            pendingUpload=null;
            throw new Error('Storage 上傳失敗 HTTP '+response.status+'，請重試');
          }
          pendingUpload.uploaded=true;
        }
        pendingUpload.assetKey ||= input.asset_key;
        input={...input,asset_key:pendingUpload.assetKey,storage_bucket:'game-assets',storage_path:pendingUpload.path,mime_type:file.type,size_bytes:file.size};
        receipt=pendingUpload.receipt;
      }else if(data.source_type==='external'){
        const url=new URL(data.external_url);
        if(url.protocol!=='https:'||url.username||url.password)throw new Error('請提供安全的 HTTPS URL');
        input.external_url=url.href;
      }else{
        const local=StudioContent.state.defaults.game_assets.find(a=>a.local_path===data.local_path);
        if(!local)throw new Error('不存在的本地素材');
        input={...input,local_path:local.local_path,mime_type:local.mime_type,size_bytes:local.size_bytes};
      }

      status.textContent='確認檔案並登記資料庫…';
      const saved=await StudioWrite.request('/assets/register',{method:'POST',body:{asset:input,...(receipt?{receipt}:{})}});
      assets.set(saved.asset_key,saved);
      selected=saved.asset_key;
      pendingUpload=null;
      bindingKey='';
      unsaved=false;
      byId('assetRegisterDialog').close();
      render();
      notice('新素材已登記，請選擇用途並儲存綁定草稿。');
    }catch(e){
      status.textContent=e.message+'；可保留檔案後重試。';
      notice(e.message,true);
    }finally{
      submit.disabled=false;
    }
  }

  // --- Migration Dialog Logic ---
  async function loadMigrationStatus(){
    try{
      const status=await StudioWrite.request('/migration/status',null,'GET');
      byId('statLocalCount').textContent=status.localAssetsCount;
      byId('statStorageCount').textContent=status.storageAssetsCount;
      byId('statUnmigratedCount').textContent=status.unmigratedCount;
      byId('statEstimatedSize').textContent=formatBytes(status.estimatedTotalBytes);
      byId('statBoundStorageCount').textContent=status.boundStorageCount;
      byId('statBoundLocalCount').textContent=status.boundLocalCount;
      return status;
    }catch(e){
      notice('無法讀取遷移狀態：'+e.message,true);
      return null;
    }
  }

  function appendLog(text){
    const box=byId('migrationLogBox');
    if(!box)return;
    box.textContent+=(box.textContent?'\n':'')+text;
    box.scrollTop=box.scrollHeight;
  }

  async function runAssetsMigration(keys=null){
    const section=byId('migrationProgressSection');
    const bar=byId('migrationProgressBar');
    const statusText=byId('migrationStatusText');
    const logBox=byId('migrationLogBox');
    section.hidden=false;
    logBox.textContent='';
    bar.style.width='20%';
    statusText.textContent=keys?`正在遷移 ${keys.length} 筆所選本地素材…`:'正在批次遷移全部本地素材至 Supabase Storage…';
    appendLog(`[${new Date().toLocaleTimeString()}] 開始素材遷移程序…`);

    try{
      const result=await StudioWrite.request('/migration/assets',{method:'POST',body:{assetKeys:keys}});
      bar.style.width='100%';
      statusText.textContent=`遷移完成：成功 ${result.successCount} 筆，失敗 ${result.failedCount} 筆`;
      appendLog(`[${new Date().toLocaleTimeString()}] 遷移完成：共處理 ${result.total} 項`);
      for(const res of result.results){
        appendLog(`  - [${res.status}] ${res.display_name} -> ${res.storage_path}`);
      }
      if(result.errors.length){
        for(const err of result.errors){
          appendLog(`  ❌ 錯誤: ${err.display_name}: ${err.error}`);
        }
      }
      await StudioContent.load({force:true});
      refreshMap();
      render();
      await loadMigrationStatus();
      notice(`素材遷移已完成 (成功 ${result.successCount} / 失敗 ${result.failedCount})`);
    }catch(e){
      bar.style.width='0%';
      statusText.textContent='遷移過程發生錯誤：'+e.message;
      appendLog(`❌ 致命錯誤: ${e.message}`);
      notice('遷移失敗：'+e.message,true);
    }
  }

  async function runBindingsMigration(){
    const section=byId('migrationProgressSection');
    const bar=byId('migrationProgressBar');
    const statusText=byId('migrationStatusText');
    const logBox=byId('migrationLogBox');
    section.hidden=false;
    logBox.textContent='';
    bar.style.width='20%';
    statusText.textContent='正在驗證下載有效性並原子切換用途綁定…';
    appendLog(`[${new Date().toLocaleTimeString()}] 開始綁定切換程序…`);

    try{
      const result=await StudioWrite.request('/migration/bindings',{method:'POST',body:{verifyDownloads:true}});
      bar.style.width='100%';
      if(result.success){
        statusText.textContent=`綁定切換成功：已將 ${result.switchCount} 筆綁定原子切換至 Storage！`;
        appendLog(`[${new Date().toLocaleTimeString()}] 原子發布成功，總綁定 ${result.totalBindings}，切換 ${result.switchCount} 筆。`);
      }else{
        statusText.textContent='切換未完成：'+result.message;
        appendLog(`[${new Date().toLocaleTimeString()}] 檢查未通過: ${result.message}`);
        for(const err of result.errors||[]){
          appendLog(`  ❌ ${err.binding_key}: ${err.error}`);
        }
      }
      await StudioContent.load({force:true});
      refreshMap();
      render();
      await loadMigrationStatus();
      notice(result.success?`已成功將 ${result.switchCount} 筆用途綁定原子切換至 Storage`:'綁定切換未通過前置驗證');
    }catch(e){
      bar.style.width='0%';
      statusText.textContent='切換綁定出錯：'+e.message;
      appendLog(`❌ 致命錯誤: ${e.message}`);
      notice('綁定切換失敗：'+e.message,true);
    }
  }

  async function init(){
    await StudioContent.load({defaults:true});
    refreshMap();

    // Category Tabs
    byId('assetCategories').replaceChildren(...Object.entries(categories).map(([key,label])=>button(label,()=>{
      category=key;
      byId('assetCategories').querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.category===key)));
      render();
    },{'aria-pressed':key==='all','data-category':key})));

    byId('assetSearch').addEventListener('input',render);
    byId('assetSourceFilter').addEventListener('change',e=>{
      sourceFilter=e.target.value;
      render();
    });

    // Batch Selection Buttons
    byId('assetSelectAll').onclick=()=>{
      for(const a of assets.values()){
        if(a.source_type==='local')selectedAssetKeys.add(a.asset_key);
      }
      render();
    };
    byId('assetSelectNone').onclick=()=>{
      selectedAssetKeys.clear();
      render();
    };
    byId('assetMigrateSelected').onclick=()=>StudioUI.run(async()=>{
      const localSelected=[...selectedAssetKeys].filter(k=>assets.get(k)?.source_type==='local');
      if(!localSelected.length)return;
      if(!confirm(`確定要將已勾選的 ${localSelected.length} 筆本地素材遷移至 Supabase Storage？`))return;
      byId('assetMigrationDialog').showModal();
      await loadMigrationStatus();
      await runAssetsMigration(localSelected);
    });

    // Migration Dialog
    byId('assetMigrationOpen').onclick=()=>StudioUI.run(async()=>{
      byId('assetMigrationDialog').showModal();
      await loadMigrationStatus();
    });
    byId('migrationCloseBtn').onclick=()=>byId('assetMigrationDialog').close();
    byId('migrationRefreshBtn').onclick=()=>StudioUI.run(loadMigrationStatus);
    byId('migrationRunAssetsBtn').onclick=()=>StudioUI.run(async()=>{
      if(!confirm('即將批次上傳專案中所有本地素材至 Supabase Storage Public Bucket，並在 game_assets 建立 storage 紀錄。是否繼續？'))return;
      await runAssetsMigration();
    });
    byId('migrationRunBindingsBtn').onclick=()=>StudioUI.run(async()=>{
      if(!confirm('即將驗證所有 Storage 素材可下載性，並原子切換所有正式綁定至 Storage。是否繼續？'))return;
      await runBindingsMigration();
    });

    // Register Dialog
    byId('assetRegisterOpen').onclick=()=>{sourceFields();byId('assetRegisterDialog').showModal();};
    byId('assetRegisterCancel').onclick=()=>byId('assetRegisterDialog').close();
    byId('assetRegisterForm').elements.source_type.onchange=sourceFields;
    byId('assetRegisterForm').addEventListener('submit',register);
    byId('assetRegisterForm').elements.local_path.replaceChildren(...StudioContent.state.defaults.game_assets.map(a=>el('option',{value:a.local_path,text:a.local_path})));

    // Draft / Refresh
    byId('assetLoadDrafts').onclick=()=>StudioUI.run(async()=>{
      if(unsaved&&!confirm('載入會放棄未儲存綁定，確定？'))return;
      const [data,list]=await Promise.all([StudioWrite.request('/drafts'),StudioWrite.request('/assets')]);
      for(const a of list)assets.set(a.asset_key,a);
      for(const b of data.asset_bindings)draftBindings.set(b.binding_key,b);
      unsaved=false;
      render();
      notice('已載入公開與未公開素材，以及綁定草稿。');
    }).catch(()=>{});

    byId('assetRefresh').onclick=()=>StudioUI.run(async()=>{
      await StudioContent.load({force:true});
      refreshMap();
      render();
      notice('已更新正式素材清單。');
    }).catch(()=>{});

    window.addEventListener('beforeunload',event=>{if(unsaved){event.preventDefault();event.returnValue='';}});
    render();
    notice(StudioContent.state.source==='cloud'?'已讀取 Supabase 公開素材。管理操作才需要通行碼。':'Supabase 無法讀取，目前顯示實際本地素材。');
  }

  document.addEventListener('DOMContentLoaded',()=>StudioUI.run(init).catch(()=>{}));
})();
