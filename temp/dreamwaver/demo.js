/* Demo-only UI, background, mock HP and impact labels. No gameplay logic. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
  const smooth = x => { x=clamp(x); return x*x*(3-2*x); };
  const BRANCHES = DreamweaverFX.branches;
  const COLORS = DreamweaverFX.colors;
  const META = {
    attack: { id:'BASIC / 01', title:'螺旋纏繞', stage:'螺旋纏繞 · 四散勒緊',
      description:'四隻夢蝶牽引三道金色螺旋，反向拉扯收緊絲弦，直至夢境崩斷。',
      tags:['四蝶包夾','頭像壓縮 80%'], phases:['喚蝶','包夾','螺旋束縛','反向勒緊','崩斷受擊','夢境迴響'], total:4.8 },
    skill1: { id:'SKILL I / 02', title:'四蝶織夢', stage:'四蝶織夢 · 攜網飛行 · 入體',
      description:'四隻夢蝶環繞中央逐步織成蝴蝶印記，牽住印記四翼帶著整張蝴蝶印記飛向判定頭像，再一同收攏入體。',
      tags:['金絲蝴蝶印記','四蝶攜網飛行'], phases:['破繭','展翼','蝴蝶印記編織','攜網飛行','四蝶入體','夢蝶迷思'], total:6 },
    skill2: { id:'SKILL II / 03', title:'四蝶織夢', stage:'四蝶織夢 · 攜網飛行 · 入體',
      description:'四蝶在中央織成蝴蝶印記，攜網飛向敵方或我方判定目標，再接續技能二的四種結果顯影。',
      tags:['相同主體演出','四種判定分支'], phases:['破繭','展翼','蝴蝶印記編織','攜網飛行','四蝶入體','夢蝶迷思'], total:6 },
    trigger: { id:'ECHO / 04', title:'夢境迴響', stage:'觸發判定 · 半透明夢蝶',
      description:'單獨檢視每一種觸發結果。晶質蝴蝶以半透明姿態停留片刻，再淡入夢境深處。',
      tags:['顯影 1 秒','不透明度 50%'], phases:['判定','蝴蝶顯影','消散'], total:1.2 }
  };
  const GROUP_LABEL = {attack:'普通攻擊',skill1:'技能一',skill2:'技能二'};
  const state = {type:'attack',selected:{attack:0,skill1:0,skill2:0},triggerGroup:'attack',target:'enemy',autoTrigger:true,speed:1};
  let fx = null, dragging = false, toastTimer = 0;
  let lastHp = null, lastChip = null, lastPhaseIndex = -2, lastPhaseText = '';
  const isReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'),2600);
  }
  function activeGroup() { return state.type==='trigger' ? state.triggerGroup : state.type; }
  function branch() { const group=activeGroup(); return BRANCHES[group][state.selected[group]]; }
  function targetElement() { return ['skill1','skill2'].includes(activeGroup()) && state.target==='ally' ? $('casterAvatar') : $('targetAvatar'); }
  function triggerEnabled() { return state.type==='trigger' || state.autoTrigger; }
  function config(autoplay=true) {
    return {type:state.type,trigger:triggerEnabled()?branch():null,skillTarget:targetElement(),triggerTarget:targetElement(),damage:128,speed:state.speed,autoplay};
  }
  function resetDemoLabels() {
    lastHp = null; lastChip = null; lastPhaseIndex=-2; lastPhaseText='';
    $('damageNumber').style.opacity='0'; $('triggerLabel').style.opacity='0';
    $('statusChip').classList.remove('is-visible');
    targetElement().parentElement.append($('statusChip'));
    $('enemyHpFill').style.setProperty('--hp','1'); $('enemyHpValue').textContent='1,000 / 1,000';
  }
  function launch(autoplay=true) {
    resetDemoLabels(); fx.play(config(autoplay));
  }
  function renderPalette() {
    const group=activeGroup(), holder=$('paletteRow'); holder.replaceChildren();
    BRANCHES[group].forEach((b,i)=>{
      const button=document.createElement('button'); button.type='button'; button.className='palette-dot';
      button.classList.toggle('is-selected',state.selected[group]===i);
      button.style.setProperty('--swatch',COLORS[b.color].rgb); button.title=b.name;
      button.setAttribute('aria-label',b.name); button.setAttribute('aria-pressed',String(state.selected[group]===i));
      button.append(document.createElement('span'));
      button.addEventListener('click',()=>{state.selected[group]=i;renderControls();launch();});
      holder.append(button);
    });
  }
  function renderControls() {
    const meta=META[state.type], group=activeGroup(), b=branch();
    document.querySelectorAll('.tab').forEach(el=>{
      const selected=el.dataset.type===state.type;
      el.setAttribute('aria-selected',String(selected)); el.tabIndex=selected?0:-1;
    });
    $('previewPanel').setAttribute('aria-labelledby','tab-'+state.type);
    $('spellId').textContent=meta.id; $('spellName').textContent=meta.title;
    $('spellDescription').textContent=meta.description; $('stageTitle').textContent=meta.stage;
    $('stageCoordinates').textContent='FX · '+String(Object.keys(META).indexOf(state.type)+1).padStart(3,'0');
    $('spellStats').replaceChildren(...meta.tags.map(text=>{const el=document.createElement('span');el.className='stat-tag';el.textContent=text;return el;}));
    $('phaseMarkers').replaceChildren(...meta.phases.map(text=>{const el=document.createElement('span');el.className='phase-marker';el.textContent=text;return el;}));
    $('scrubber').max=String(meta.total); $('totalTime').textContent=meta.total.toFixed(2).padStart(5,'0');
    const select=$('branchSelect'); select.replaceChildren();
    for(const g of state.type==='trigger'?Object.keys(BRANCHES):[state.type]) {
      const holder=state.type==='trigger'?document.createElement('optgroup'):select;
      if(holder!==select) holder.label=GROUP_LABEL[g];
      BRANCHES[g].forEach((item,i)=>{const o=document.createElement('option');o.value=g+':'+i;o.textContent=item.name;o.selected=g===group&&i===state.selected[g];holder.append(o);});
      if(holder!==select) select.append(holder);
    }
    $('branchCount').textContent=(state.type==='trigger'?10:BRANCHES[group].length)+' 種結果';
    $('branchSwatch').style.background=`rgb(${COLORS[b.color].rgb})`;
    $('branchNote').textContent=`${state.type==='trigger'?GROUP_LABEL[group]+' · ':''}${COLORS[b.color].label}色夢蝶 · 顯影 1 秒 · 不透明度 50%`;
    $('triggerLabel').textContent=b.name; $('triggerLabel').style.color=`rgb(${COLORS[b.color].rgb})`;
    const allowAlly=group==='skill1'||group==='skill2';
    $('targetAlly').disabled=!allowAlly;
    $('targetAlly').setAttribute('aria-pressed',String(allowAlly&&state.target==='ally'));
    $('targetEnemy').setAttribute('aria-pressed',String(!allowAlly||state.target==='enemy'));
    $('targetHelp').textContent=allowAlly?'可選敵方或我方；四蝶入體、狀態與判定蝴蝶皆跟隨目標。':'普攻的判定效果固定出現在敵方。';
    $('autoTrigger').disabled=state.type==='trigger'; $('autoTrigger').checked=state.type==='trigger'||state.autoTrigger;
    renderPalette();
  }
  function chooseType(type, autoplay=true) {
    if(!META[type]) return;
    state.type=type;renderControls();launch(autoplay);
  }
  function onProgress(data) {
    if(!fx) return;
    const {time:t,duration,phase,phaseIndex=0}=data;
    const progress=clamp(t/duration);
    if(!dragging) $('scrubber').value=String(t);
    $('scrubber').style.setProperty('--progress',(progress*100).toFixed(3)+'%');
    $('currentTime').textContent=t.toFixed(2).padStart(5,'0');
    if(phase!==lastPhaseText) {$('phaseLabel').textContent=phase;lastPhaseText=phase;}
    if(phaseIndex!==lastPhaseIndex) {
      [...$('phaseMarkers').children].forEach((el,i)=>el.classList.toggle('is-active',i<=phaseIndex)); lastPhaseIndex=phaseIndex;
    }
    const hit=fx.type==='attack'&&t>=2.94;
    if(hit!==lastHp) {
      $('enemyHpFill').style.setProperty('--hp',hit?'.872':'1');
      $('enemyHpValue').textContent=hit?'872 / 1,000':'1,000 / 1,000'; lastHp=hit;
    }
    const hasStatus=(fx.type==='skill1'||fx.type==='skill2')&&t>=4.42;
    if(hasStatus!==lastChip) {$('statusChip').classList.toggle('is-visible',hasStatus);lastChip=hasStatus;}
    const dt=t-2.94;
    if(hit&&dt<1.05) {
      const alpha=smooth(dt/.045)*(1-smooth((dt-.58)/.46));
      const x=fx.b.x,y=fx.b.y-fx.b.h*.19-Math.min(1,dt)*42*fx.s;
      $('damageNumber').style.left='0';$('damageNumber').style.top='0';
      $('damageNumber').style.transform=`translate(${x}px,${y}px) translate(-50%,-50%) scale(${1+.2*Math.exp(-dt*8)})`;
      $('damageNumber').style.opacity=String(alpha);
    } else $('damageNumber').style.opacity='0';
    const start=fx.type==='attack'?3.28:fx.type==='trigger'?.08:4.62;
    const elapsed=t-start;
    const show=!!fx.trigger&&elapsed>=0&&elapsed<=1;
    $('triggerLabel').style.opacity=show?String(smooth(elapsed/.12)*(1-smooth((elapsed-.84)/.16))):'0';
  }
  function onState(data) {
    $('liveStatus').classList.toggle('is-playing',data.playing);
    $('statusText').textContent=data.playing?'演出中':data.completed?'演出完成':data.cancelled?'準備就緒':fx&&fx.time>0?'已暫停':'準備就緒';
    $('pauseIcon').setAttribute('href',data.playing?'#i-pause':'#i-play');
    $('pauseText').textContent=data.playing?'暫停':'繼續';
    $('pauseButton').setAttribute('aria-label',data.playing?'暫停':'繼續');
  }
  function drawEnvironment() {
    const root=$('stage'), canvas=$('environment'), ctx=canvas.getContext('2d');
    const w=root.clientWidth,h=root.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const c={x:w*.5,y:h*.47},s=Math.min(1,w/850,h/440);
    const rand=n=>{const v=Math.sin(n*127.1+15.13)*43758.5453;return v-Math.floor(v);};
    const bloom=ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,w*.52);
    bloom.addColorStop(0,'rgba(105,128,115,.032)');bloom.addColorStop(.6,'rgba(100,128,115,.008)');bloom.addColorStop(1,'rgba(50,70,63,0)');
    ctx.fillStyle=bloom;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.translate(c.x,c.y);ctx.strokeStyle='rgba(173,161,122,.08)';ctx.lineWidth=.6;
    [134,155,180].forEach(r=>{ctx.beginPath();ctx.ellipse(0,0,r*s,r*.86*s,0,0,Math.PI*2);ctx.stroke();});
    for(let i=0;i<64;i++) {
      const a=i/64*Math.PI*2,r=180*s,len=i%8===0?8:3;
      ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r*.86);ctx.lineTo(Math.cos(a)*(r+len*s),Math.sin(a)*(r+len*s)*.86);ctx.stroke();
    }
    ctx.strokeStyle='rgba(150,164,143,.042)';
    for(let k=0;k<2;k++) {
      ctx.beginPath();for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI*2/5+(k?Math.PI:0);const x=Math.cos(a)*155*s,y=Math.sin(a)*133*s;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
    }
    ctx.restore();
    // A faint floor plane keeps the previews grounded without competing with threads.
    ctx.strokeStyle='rgba(147,160,141,.055)';ctx.lineWidth=.7;
    [0,1,2].forEach(i=>{ctx.beginPath();ctx.ellipse(w*.5,h*.86,w*(.32+i*.09),h*(.065+i*.018),0,Math.PI,Math.PI*2);ctx.stroke();});
    for(let i=0;i<73;i++) {
      const x=rand(i+2)*w,y=rand(i+146)*h,alpha=.045+rand(i+59)*.16;
      const r=rand(i+18)>.85?1.1:.55;
      ctx.fillStyle=`rgba(199,211,189,${alpha})`;ctx.beginPath();ctx.arc(x,y,r*s,0,Math.PI*2);ctx.fill();
      if(i%11===0) {ctx.strokeStyle=`rgba(216,211,180,${alpha*.5})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x-3*s,y);ctx.lineTo(x+3*s,y);ctx.moveTo(x,y-3*s);ctx.lineTo(x,y+3*s);ctx.stroke();}
    }
    // Thin peripheral branches echo the supplied portrait's ancient, overgrown arch.
    for(const side of [-1,1]) {
      ctx.save();if(side===1){ctx.translate(w,0);ctx.scale(-1,1);}
      ctx.strokeStyle='rgba(98,113,106,.07)';ctx.lineWidth=1;
      for(let i=0;i<6;i++) {
        const x=(12+i*9)*s;ctx.beginPath();ctx.moveTo(x,h*.86);ctx.bezierCurveTo(x+27*s,h*.5,x+13*s,h*.22,x+85*s,-30*s);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x+20*s,h*.5);ctx.quadraticCurveTo(x+67*s,h*.25,x+115*s,h*.18);ctx.stroke();
      }
      ctx.restore();
    }
  }
  async function boot() {
    renderControls();
    const image=$('casterImage');
    try {await image.decode();} catch(_) {toast('角色圖片未載入；其他特效仍可播放。');}
    fx=new DreamweaverFX({root:$('stage'),caster:$('casterAvatar'),target:$('targetAvatar'),casterAnchor:$('casterAnchor'),targetAnchor:$('targetAnchor'),onProgress,onState});
    drawEnvironment();
    let environmentRaf=0;
    const environmentObserver=new ResizeObserver(()=>{cancelAnimationFrame(environmentRaf);environmentRaf=requestAnimationFrame(drawEnvironment);});
    environmentObserver.observe($('stage'));
    document.querySelectorAll('.tab').forEach(el=>{
      el.addEventListener('click',()=>chooseType(el.dataset.type));
      el.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();const keys=Object.keys(META),i=keys.indexOf(state.type);
        const next=event.key==='Home'?0:event.key==='End'?3:(i+(event.key==='ArrowRight'?1:3))%4;
        chooseType(keys[next]);$('tab-'+keys[next]).focus();
      });
    });
    $('castButton').addEventListener('click',()=>launch());
    $('pauseButton').addEventListener('click',()=>fx.playing?fx.pause():fx.resume());
    $('resetButton').addEventListener('click',()=>{launch(false);$('statusText').textContent='準備就緒';$('phaseLabel').textContent='等待施放';});
    $('branchSelect').addEventListener('change',event=>{
      const [group,index]=event.target.value.split(':');state.triggerGroup=group;state.selected[group]=Number(index);renderControls();launch();
    });
    for(const el of [$('targetEnemy'),$('targetAlly')]) el.addEventListener('click',()=>{state.target=el.dataset.target;renderControls();launch();});
    $('autoTrigger').addEventListener('change',event=>{state.autoTrigger=event.target.checked;launch();});
    $('transparentToggle').addEventListener('change',event=>$('stage').classList.toggle('is-transparent',event.target.checked));
    $('speedSelect').addEventListener('change',event=>{state.speed=Number(event.target.value);fx.setSpeed(state.speed);});
    $('qualitySelect').addEventListener('change',event=>fx.setQuality(event.target.value));
    $('scrubber').addEventListener('pointerdown',()=>{dragging=true;fx.pause();});
    $('scrubber').addEventListener('input',event=>{fx.pause();fx.seek(Number(event.target.value));});
    const finishScrub=()=>{dragging=false;};
    window.addEventListener('pointerup',finishScrub);window.addEventListener('pointercancel',finishScrub);
    $('fullscreenButton').addEventListener('click',async()=>{
      try {if(document.fullscreenElement)await document.exitFullscreen();else if($('stage').requestFullscreen)await $('stage').requestFullscreen();else toast('此瀏覽器不支援全螢幕 API。');}
      catch(_){toast('瀏覽器無法進入全螢幕，請使用視窗放大。');}
    });
    const dialog=$('specDialog');
    $('specButton').addEventListener('click',()=>{fx.pause();dialog.showModal();});
    $('closeDialog').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    Object.entries(BRANCHES).forEach(([group,list])=>list.forEach(b=>{
      const el=document.createElement('span'),dot=document.createElement('i');dot.className='color-token';dot.style.background=`rgb(${COLORS[b.color].rgb})`;
      el.append(dot,document.createTextNode(b.name+' · '+COLORS[b.color].label));$('branchLegend').append(el);
    }));
    document.addEventListener('keydown',event=>{
      if(event.altKey||event.metaKey||event.ctrlKey||event.target.closest('input,select,textarea,button')||dialog.open)return;
      if(event.code==='Space'){event.preventDefault();fx.playing?fx.pause():fx.resume();}
      else if(event.key.toLowerCase()==='r')launch();
      else if(/^[1-4]$/.test(event.key))chooseType(Object.keys(META)[Number(event.key)-1]);
    });
    const log=[];
    for(const name of ['impact','status','trigger','complete']) $('stage').addEventListener('dreamweaver:'+name,event=>{
      log.push({event:name,type:event.detail.type,time:event.detail.time,branch:event.detail.branch?.name,status:event.detail.status});
      if(log.length>100)log.shift();
    });
    window.dreamweaverDemo={
      fx,state,events:log,
      select(type,autoplay=true){chooseType(type,autoplay);return fx;},
      inspect(type,time){chooseType(type,false);fx.seek(time);return fx;},
      replay(){launch();return fx;},
      destroy(){environmentObserver.disconnect();cancelAnimationFrame(environmentRaf);fx.destroy();}
    };
    // Assets and both transparent canvases are ready before the first animation.
    launch(!isReduced);
    if(isReduced)$('statusText').textContent='手動播放';
    document.documentElement.dataset.ready='true';
  }
  boot().catch(error=>{
    console.error(error);$('statusText').textContent='初始化失敗';
    const el=document.createElement('p');el.className='error-notice';el.textContent='特效初始化失敗：'+error.message;
    $('previewPanel').append(el);
  });
})();
