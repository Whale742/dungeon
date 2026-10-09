(function(global){
  let token=sessionStorage.getItem('studio.write-token')||'';
  function setToken(value){token=value;value?sessionStorage.setItem('studio.write-token',value):sessionStorage.removeItem('studio.write-token');}
  async function request(route,{method='GET',body}={}){
    if(!token){const value=prompt('此雲端操作需要共用 Studio 通行碼（僅保存於當次分頁）');if(!value)throw new Error('已取消雲端操作');setToken(value);}
    const response=await fetch('/api/studio'+route,{method,headers:{'Content-Type':'application/json','X-Studio-Write-Token':token},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const data=await response.json().catch(()=>({error:'伺服器回應格式錯誤'}));if(!response.ok){if(response.status===401)setToken('');throw new Error(data.error||'Studio 操作失敗');}return data;
  }
  global.StudioWrite={request,setToken,hasToken:()=>!!token};
})(window);
