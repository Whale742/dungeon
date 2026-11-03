// Confirmed combat snapshots own every displayed resource. Flights never write state.
const SageResourceHud=(()=>{
  const hosts=new Map(),motions=new Set(),flights=new Set(),signals=new WeakSet();
  let active=null,seen=new Set(),battleKey=null;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visible=node=>node?.isConnected&&node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true})!==false&&node.getBoundingClientRect().width>0&&!document.hidden;
  function motion(node,frames,options,done){
    const a=node.animate(frames,options);motions.add(a);
    a.finished.then(()=>done?.()).catch(()=>{}).finally(()=>motions.delete(a));return a;
  }
  function clear({dispose=false}={}){
    active=null;seen.clear();for(const [host] of hosts)delete host.dataset.sageReturning;for(const a of motions)a.cancel();motions.clear();for(const n of flights)n.remove();flights.clear();
    if(dispose){for(const [host,widget] of hosts){widget.remove();host.classList.remove('sage-resource-host');}hosts.clear();}
  }
  function sync(player,host){
    if(!host)return;
    for(const [old] of hosts)if(!old.isConnected)hosts.delete(old);
    if(player.role!=='sage'){hosts.get(host)?.remove();hosts.delete(host);host.classList.remove('sage-resource-host');return;}
    const key=typeof battleSceneKey==='function'&&typeof roomState!=='undefined'&&roomState?battleSceneKey(roomState):null;
    if(key!==battleKey){clear({dispose:true});battleKey=key;}
    let widget=hosts.get(host);
    if(!widget||!host.contains(widget)){
      widget=document.createElement('span');widget.className='sage-resource-hud';
      widget.innerHTML='<span class="sage-values"><span data-sage-resource="N"><b>N</b> <i></i></span><span data-sage-resource="X"><b>X</b> <i></i></span></span><span class="sage-phase-card"><span class="sage-phase-face sage-hypothesis"><em aria-hidden="true">I · ∴</em><strong>假設</strong></span><span class="sage-phase-face sage-solve"><em aria-hidden="true">II · ∑</em><strong>求解</strong></span></span>';
      host.appendChild(widget);host.classList.add('sage-resource-host');hosts.set(host,widget);
    }
    widget.dataset.playerId=player.id;widget.classList.toggle('is-dead',player.hp<=0);
    for(const [r,value] of [['N',player.sageOperand],['X',player.sageX]])widget.querySelector(`[data-sage-resource="${r}"] i`).textContent=value??'—';
    const phase=player.sagePhase==='solve'?'solve':'hypothesis',prev=widget.dataset.phase;
    widget.dataset.phase=phase;widget.querySelector('.sage-phase-card').setAttribute('aria-label',phase==='solve'?'求解階段':'假設階段');
    widget.querySelector('.sage-hypothesis').setAttribute('aria-hidden',String(phase==='solve'));widget.querySelector('.sage-solve').setAttribute('aria-hidden',String(phase!=='solve'));
    if(prev&&prev!==phase&&player.hp>0&&visible(host)&&!reduced()){
      const card=widget.querySelector('.sage-phase-card');for(const a of card.getAnimations())a.cancel();
      motion(card,[{transform:`rotateY(${prev==='solve'?180:0}deg)`,filter:'brightness(1)'},{filter:'brightness(1.8)',offset:.5},{transform:`rotateY(${phase==='solve'?180:360}deg)`,filter:'brightness(1)'}],{duration:380,easing:'ease-in-out'},()=>{
        if(widget.isConnected&&widget.dataset.phase===phase)motion(widget,[{filter:'drop-shadow(0 0 5px #ffe4a6)'},{filter:'none'}],{duration:200});
      });
      for(let i=0;i<3;i++){
        const bit=document.createElement('span');bit.className='sage-phase-spark';bit.textContent=['·','+','∴'][i];widget.appendChild(bit);flights.add(bit);
        motion(bit,[{opacity:0,transform:'translate(0,0)'},{opacity:1,offset:.4},{opacity:0,transform:`translate(${(i-1)*15}px,-24px)`}],{duration:440,delay:240},()=>{bit.remove();flights.delete(bit);});
      }
    }
    if(player.hp<=0)delete host.dataset.sageReturning;
    if(player.hp<=0)for(const n of [...flights])if(n.dataset.playerId===player.id){for(const a of n.getAnimations())a.cancel();n.remove();flights.delete(n);}
  }
  function target(id,resource){
    const choices=[...hosts].filter(([h,w])=>w.dataset.playerId===id&&visible(h)&&!w.classList.contains('is-dead'));
    choices.sort(([a],[b])=>(b.id==='hudPlayerAvatar')-(a.id==='hudPlayerAvatar'));
    return choices[0]?.[1].querySelector(`[data-sage-resource="${resource}"]`);
  }
  function fly(id,resource,label,origin,delay=0){
    const dest=target(id,resource);if(!dest)return;
    const speed=active?.context?.speed||1;
    if(reduced()||active?.context?.reducedMotion){motion(dest,[{filter:'brightness(1.7)'},{filter:'none'}],{duration:100});return;}
    // Stagger short bursts and coalesce repeated N gains in presentation only.
    const pending=[...flights].filter(n=>n.dataset.playerId===id);
    const gain=resource==='N'&&/^\+(\d+) N$/.exec(label);
    if(pending.length>=4){
      const last=pending.findLast(n=>n.dataset.resource===resource&&n.dataset.gain);
      if(gain&&last){last.dataset.gain=String(Number(last.dataset.gain)+Number(gain[1]));last.textContent=`+${last.dataset.gain} N`;}
      return;
    }
    delay+=pending.length*80;
    const root=document.getElementById('presentationRoot');if(!root)return;
    const end=dest.getBoundingClientRect(),start=origin?.getBoundingClientRect?.()||end;
    const x=start.left+start.width*.5,y=start.top+start.height*.45,dx=end.left+end.width*.5-x,dy=end.top+end.height*.5-y;
    const n=document.createElement('span');n.className='sage-resource-flight';n.dataset.playerId=id;n.dataset.resource=resource;if(gain)n.dataset.gain=gain[1];n.textContent=label;
    n.style.left=x+'px';n.style.top=y+'px';root.appendChild(n);flights.add(n);
    const host=dest.closest?.('.sage-resource-host');if(host)host.dataset.sageReturning='true';
    motion(n,[{opacity:0,transform:'translate(-50%,-50%) scale(.8)'},{opacity:1,transform:'translate(-50%,-70%) scale(1.15)',offset:.18},{opacity:1,transform:`translate(calc(-50% + ${dx*.45}px),calc(-50% + ${dy*.4-45}px)) scale(1)`,offset:.6},{opacity:0,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.35)`}],{duration:640/speed,delay:delay/speed,easing:'ease-in-out',fill:'both'},()=>{
      n.remove();flights.delete(n);if(host&&![...flights].some(f=>f.dataset.playerId===id))delete host.dataset.sageReturning;if(visible(dest))motion(dest,[{transform:'scale(1)'},{transform:'scale(1.12)',filter:'brightness(1.9)',offset:.4},{transform:'scale(1)',filter:'none'}],{duration:220/speed});
    });
  }
  function start(step,context={}){
    active={step,context};seen.clear();
    if(context.signal&&!signals.has(context.signal)){signals.add(context.signal);context.signal.addEventListener('abort',()=>clear(),{once:true});}
  }
  function snapshot(snapshot){
    if(!active||active.context.signal?.aborted)return;
    const {step}=active;
    const emit=(key,id,resource,label,origin,delay)=>{if(seen.has(key))return;seen.add(key);fly(id,resource,label,origin,delay);};
    const anchor=id=>typeof getActorAnchor==='function'?getActorAnchor(id)?.element:null;
    for(const p of snapshot.players||[]){
      if(p.role!=='sage'||p.hp<=0)continue;
      const before=step.hpSnapshotBefore?.players?.find(a=>a.id===p.id),after=step.hpSnapshot?.players?.find(a=>a.id===p.id);
      if(before&&after&&step.actionId!=='sge_equation'){
        if(p.sageX===after.sageX&&after.sageX<before.sageX)emit(p.id+':Xloss',p.id,'X',`−${before.sageX-after.sageX} X`,anchor(p.id));
        if(!step.sagePresentation&&!(step.results||[]).some(r=>r.targetId===p.id&&r.sageMomentumCapture)&&p.sageOperand===after.sageOperand&&before.sageOperand!==after.sageOperand)
          emit(p.id+':Nreplace',p.id,'N',`N → ${after.sageOperand}`,anchor(p.id));
      }
      const meta=step.sagePresentation;
      if(step.sourceId===p.id&&meta&&p.sageOperand===meta.operandAfter&&meta.operandBefore!==meta.operandAfter){
        const delta=meta.operandAfter-meta.operandBefore;
        emit(p.id+':N',p.id,'N',`${delta>0?'+':'−'}${Math.abs(delta)} N`,anchor(step.targetEnemyId||step.targetId));
      }
      for(const [i,r] of (step.results||[]).entries())if(r.targetId===p.id&&r.sageMomentumCapture&&p.sageOperand===r.sageMomentumCapture.operandAfter){
        emit(p.id+':sample:'+i,p.id,'N',`+${r.sageMomentumCapture.delta} N`,anchor(p.id));
      }
      const out=step.outcome;
      if(step.actionId==='sge_equation'&&step.sourceId===p.id&&out&&p.sageX===out.xAfter){
        const origin=anchor(step.targetEnemyId||step.targetId);
        if(out.decayAmount>0)emit(p.id+':decay',p.id,'X',`−${out.decayAmount} X 衰減`,anchor(p.id));
        if(out.baseXGain>0)emit(p.id+':baseX',p.id,'X',`∫ +${out.baseXGain} X`,origin,out.decayAmount?80:0);
        if(out.resolution==='SUCCESS'&&out.bonusXGain>0)emit(p.id+':bonusX',p.id,'X',`∴ +${out.bonusXGain} X 推演成功`,origin,170);
      }
    }
  }
  function finish(){active=null;}
  return {sync,clear,start,snapshot,finish};
})();
