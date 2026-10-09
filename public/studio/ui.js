(function(global){
  function el(tag,attrs={},children=[]){const node=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(k==='text')node.textContent=v;else if(k.startsWith('on'))node.addEventListener(k.slice(2),v);else if(k==='class')node.className=v;else if(k in node)node[k]=v;else node.setAttribute(k,v);}for(const child of children)node.append(typeof child==='string'?document.createTextNode(child):child);return node;}
  function notice(message,error=false){const node=document.getElementById('studioNotice');if(node){node.textContent=message;node.classList.toggle('is-error',error);}}
  async function run(fn){try{return await fn();}catch(e){notice(e.message,true);throw e;}}
  function button(text,fn,attrs={}){return el('button',{type:'button',text,...attrs,onclick:()=>run(fn).catch(()=>{})});}
  function nav(){const target=document.getElementById('studioNav');if(!target)return;target.replaceChildren(el('a',{href:'/lab',class:'studio-brand',text:'Dungeon Abyss Studio'}),el('div',{class:'studio-nav-links'},[['/lab','Lab'],['/edit','Editor'],['/asset','Assets'],['/','返回遊戲']].map(([href,text])=>el('a',{href,text,'aria-current':location.pathname===href?'page':'false'}))),button('變更通行碼',()=>{const v=prompt('共用通行碼；留白可清除');if(v!==null){StudioWrite.setToken(v);notice(v?'通行碼已保存在當次分頁':'已清除通行碼');}}));}
  function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function formField(label,value,oninput,{type='text',readonly=false,...attrs}={}){const input=el(type==='textarea'?'textarea':'input',{...attrs,type:type==='textarea'?undefined:type,value:value??'',readOnly:readonly,oninput:e=>oninput(e.target.value)});return el('label',{class:'studio-field'},[el('span',{text:label}),input]);}
  document.addEventListener('DOMContentLoaded',nav);
  global.StudioUI={el,button,notice,run,download,formField};
})(window);
