(function(){
  'use strict';
  const $=id=>document.getElementById(id);let detail=null,busy=false;
  function render(value){
    detail=value;$('adminEffectiveMode').textContent=value.asset_source_mode;$('adminSource').textContent=value.source;
    $('adminPersistedMode').textContent=value.persisted_mode||'尚無有效設定';$('adminVersion').textContent=value.version||'—';
    $('adminUpdatedAt').textContent=value.updated_at?new Date(value.updated_at).toLocaleString('zh-TW'):'—';
    $('adminOverride').hidden=value.source!=='Emergency Override';$('adminMode').value=value.persisted_mode||'local_only';
    $('adminMode').disabled=busy||value.version<1;$('adminSave').disabled=busy||value.version<1||value.database_status!=='available';
  }
  async function reload(){
    detail=null;$('adminSave').disabled=true;
    const value=await StudioWrite.request('/config',{base:'/api/admin/assets'});render(value);
    $('adminSaveStatus').textContent=value.database_status==='available'?'已讀取 Database 設定':'Database 暫時不可用；未寫入任何設定';
    StudioUI.notice(value.source==='Emergency Override'?'目前由 Render 環境變數控制。':'已驗證管理員並讀取設定。');
  }
  document.addEventListener('DOMContentLoaded',async()=>{
    $('adminReload').onclick=()=>StudioUI.run(reload).catch(()=>{$('adminSaveStatus').textContent='讀取失敗；請重新驗證';});
    $('adminAssetForm').onsubmit=async event=>{
      event.preventDefault();if(busy||!detail)return;busy=true;$('adminSave').disabled=true;$('adminMode').disabled=true;$('adminReload').disabled=true;
      $('adminSaveStatus').textContent='正在確認 Database 寫入…';
      try{const value=await StudioWrite.request('/config',{method:'PUT',base:'/api/admin/assets',body:{asset_source_mode:$('adminMode').value,version:detail.version}});busy=false;render(value);$('adminSaveStatus').textContent='Database 已確認儲存';StudioUI.notice(value.source==='Emergency Override'?'Database 已儲存；緊急覆寫仍然生效。':'全域設定已儲存；其他玩家重新整理後生效。');}
      catch(error){detail=null;$('adminSaveStatus').textContent='未確認儲存成功；請重新讀取設定';StudioUI.notice(error.message,true);}
      finally{busy=false;$('adminReload').disabled=false;}
    };
    try{const response=await fetch('/api/config/assets',{cache:'no-store',signal:AbortSignal.timeout(2500)});if(!response.ok)throw Error('無法讀取素材模式');const value=await response.json();$('adminEffectiveMode').textContent=value.asset_source_mode;StudioUI.notice('目前模式已讀取。管理變更需要 Studio 通行碼。');}
    catch(error){$('adminEffectiveMode').textContent='目前無法確認';StudioUI.notice(error.message,true);}
  });
})();
