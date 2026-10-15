/* ======================================================================
   卜者 AUGUR · Combat Presentation Engine & Production Hook
   Faithfully implemented based on public/assets/augur_skill_prototype.html
   with specific visual assets and timing requirements:
   - Avatar: public/photo/Augur.webp
   - Skill 1 (aug_bind) & intro observation: augur1.png with index finger
     hovering ~10px above crystal ball, target avatar inside orbTarget.
   - Skill 2 (aug_reckon): ONE single augur2.png beneath crystal ball,
     emerging from bottom; orb floats upward before radiance and whiteout.
   ====================================================================== */

const AUGUR_COLORS = Object.freeze({
  gold: '#e2c68b',
  white: '#fff4d7',
  red: '#cf5576',
  dark: '#621b43',
  violet: '#b69ce6',
  cyan: '#b5dce4'
});

const AUGUR_CARD_SVGS = {
  empty: `<svg viewBox="0 0 40 60" fill="none" stroke="currentColor"><rect x="2" y="2" width="36" height="56" rx="2" stroke-width=".8"/><circle cx="20" cy="30" r="12" stroke-width=".6" stroke-dasharray="2 3"/><path d="M20 6v6m0 36v6M6 30h6m16 0h6" stroke-width=".6"/><circle cx="20" cy="30" r="2" fill="currentColor"/></svg>`,
  upright: `<svg viewBox="0 0 40 60" fill="none" stroke="currentColor"><rect x="2" y="2" width="36" height="56" rx="2" stroke-width=".8"/><path d="m20 12 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="currentColor"/><circle cx="20" cy="30" r="14" stroke-width=".5"/><path d="M7 7h5m16 0h5M7 53h5m16 0h5"/></svg>`,
  reverse: `<svg viewBox="0 0 40 60" fill="none" stroke="currentColor"><rect x="2" y="2" width="36" height="56" rx="2" stroke-width=".8"/><path d="M20 10v40M12 22l8-10 8 10M12 38l8 10 8-10" stroke-width="1.2"/><circle cx="20" cy="30" r="13" stroke-dasharray="2 2" stroke-width=".7"/></svg>`,
  omen: `<svg viewBox="0 0 40 60" fill="none" stroke="currentColor"><rect x="2" y="2" width="36" height="56" rx="2" stroke-width=".9"/><path d="M20 8v44M8 30h24" stroke-width=".6"/><path d="m14 18 6 12 6-12M14 42l6-12 6 12" stroke-width="1.1"/></svg>`
};

function fillAugurCard(card, state = 'empty', gilded = false) {
  card.dataset.state = state;
  card.classList.toggle('gilded', gilded);
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-back">${AUGUR_CARD_SVGS.empty}</div>
      <div class="card-face card-front">${AUGUR_CARD_SVGS[state] || AUGUR_CARD_SVGS.empty}</div>
    </div>
  `;
}

class AugurPresentationEngine {
  constructor(stage, options = {}) {
    this.stage = stage;
    this.signal = options.signal;
    this.speed = Math.max(0.2, options.speed || 1);
    this.reduced = options.reduced || false;
    this.audio = options.audioScope || { play: () => Promise.resolve() };
    this.animations = new Set();
    this.raf = null;
    this.timers=new Set();
    this.frameTasks=new Set();
    this.disposed=false;
    this.step=options.step || {};

    this.container = document.createElement('div');
    this.container.className = 'augur-presentation-container' + (this.reduced ? ' reduced' : '');
    this.buildMarkup();
    this.stage.appendChild(this.container);

    this.canvas = this.container.querySelector('#augurFxCanvas');
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.orbAnchor = this.container.querySelector('#augurOrbAnchor');
    this.orbRig = this.container.querySelector('#augurOrbRig');
    this.sphere = this.container.querySelector('#augurSphere');
    this.buildCombatants();

    this.measure();
    this.orbitCards = Array.from(this.container.querySelectorAll('.orbit-card'));
    this.orbitCards.forEach((c, i) => fillAugurCard(c, i === 0 ? 'empty' : 'empty'));
    this.startOrbitAnimation();
    this.onAbort=()=>this.dispose();
    this.signal?.addEventListener('abort',this.onAbort,{once:true});
    if(typeof ResizeObserver!=='undefined') {
      this.resizeObserver=new ResizeObserver(()=>{if(!this.disposed)this.measure();});
      this.resizeObserver.observe(this.stage);
    }
  }

  buildMarkup() {
    this.container.innerHTML = `
      <div class="shade" id="augurShade"></div>
      <div class="under-orb-layer" id="augurUnderOrbLayer"></div>
      <div class="orb-anchor" id="augurOrbAnchor">
        <div class="orb-rig" id="augurOrbRig">
          <div class="orb-shadow"></div>
          <div class="orb-aura" id="augurOrbAura"></div>
          <svg class="astrolabe" viewBox="0 0 200 200" fill="none" stroke="#cbb77d" aria-hidden="true">
            <circle cx="100" cy="100" r="94" stroke-width=".5"/>
            <circle cx="100" cy="100" r="87" stroke-width="1" stroke-dasharray=".5 9"/>
            <path d="M100 0v14m0 172v14M0 100h14m172 0h14M30 30l10 10m120 120 10 10M30 170l10-10M160 40l10-10" stroke-width=".8"/>
          </svg>
          <div class="card contract-card" id="augurContractCard" data-state="omen"></div>
          <div class="sphere" id="augurSphere">
            <div class="nebula"></div>
            <div class="clouds"></div>
            <img class="orb-target" id="augurOrbTarget" alt="觀測目標">
            <svg class="orb-dust" viewBox="0 0 100 100" fill="#f2db9f" aria-hidden="true">
              <circle cx="28" cy="33" r=".55"/><circle cx="61" cy="22" r=".4"/><circle cx="82" cy="48" r=".65"/><circle cx="36" cy="81" r=".45"/><circle cx="21" cy="60" r=".7"/><circle cx="67" cy="69" r=".5"/>
              <path d="m72 34 .6 3 3 .6-3 .6-.6 3-.6-3-3-.6 3-.6Zm-33 9 .5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5Z"/>
            </svg>
            <div class="debt-haze"></div>
            <svg class="debt-seals" viewBox="0 0 100 100" aria-hidden="true">
              <path d="M16 61 29 55 34 65 28 71 38 79 42 95"/>
              <path class="seal-mid" d="M34 65l13-9 8 9-1 10 12 5 4 12M65 94l7-22 12-10-8-12 10-7"/>
              <path class="seal-high" d="M6 43l19-5 3-10 13 9-1-19M72 72l-13-4-9 6M84 62l11 2"/>
              <path class="chains" d="M14 68Q42 47 67 84M25 79Q40 64 74 65M55 97Q55 79 90 65M14 53Q39 35 47 29"/>
              <path d="m32 78 2-4 2 4-2 4Zm38-20 3-5 3 5-3 5ZM57 85l2-3 2 3-2 3Z" fill="#c29975" stroke="none"/>
            </svg>
            <svg class="orb-facets" viewBox="0 0 100 100" aria-hidden="true">
              <path d="m50 0 29 12 18 31-7 34-30 22-37-9L2 58 10 23ZM10 23l32 5 37-16-7 35 25-4-22 24 15 10-33-3 3 25-18-28-19 19 2-32L2 58l23-13ZM42 28l30 19-15 27-32-29Z"/>
            </svg>
            <div class="chromatic"></div>
            <div class="orb-core" id="augurOrbCore"></div>
            <svg class="seal-release" id="augurSealRelease" viewBox="0 0 100 100" aria-hidden="true">
              <path d="M16 61 29 55 34 65 28 71 38 79 42 95M34 65l13-9 8 9-1 10 12 5 4 12M65 94l7-22 12-10-8-12 10-7"/>
            </svg>
            <div class="glass"></div>
          </div>
          <div class="equator"></div>
          <div class="equator second"></div>
          <svg class="contract-seal" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="48" stroke-dasharray="7 3 1 4"/>
            <path d="M50 1 56 7 50 13 44 7ZM99 50 93 56 87 50 93 44ZM50 99 44 93 50 87 56 93ZM1 50 7 44 13 50 7 56Z"/>
          </svg>
          <div class="orbit-layer" id="augurOrbitLayer">
            <div class="card orbit-card" id="augurCard0"></div>
            <div class="card orbit-card" id="augurCard1"></div>
            <div class="card orbit-card" id="augurCard2"></div>
          </div>
        </div>
        <div class="orb-caption">
          <strong id="augurCardStateLabel">空 象</strong>
          <span id="augurOrbObservedLabel">等待命運的回聲</span>
        </div>
      </div>
      <div class="effect-layer" id="augurEffectLayer"></div>
      <canvas class="augur-fx" id="augurFxCanvas" aria-hidden="true"></canvas>
      <div class="effect-cards" id="augurEffectCards"></div>
      <div class="float-layer" id="augurFloatLayer" aria-hidden="true"></div>
      <div class="debt-ledger" aria-label="命債帳本">
        <div class="debt-label"><span>命 債</span><b id="augurDebtTotal">0 / 60</b></div>
        <div class="debt-ticks"><span id="augurDebtBar"></span></div>
        <div class="ledger-items" id="augurDebtItems"></div>
        <div class="equipment-label" id="augurEquipmentLabel"></div>
      </div>
      <div class="caption" id="augurCaption">
        <div class="caption-kicker" id="augurCaptionKicker">THE AUGURY</div>
        <h2 id="augurCaptionTitle"></h2>
        <p id="augurCaptionText"></p>
      </div>
      <div class="whiteout" id="augurWhiteout" aria-hidden="true"></div>
    `;
  }

  buildCombatants() {
    const make=(side)=>{
      const node=document.createElement('div');
      node.className=`augur-combatant ${side}`;
      node.innerHTML='<div class="augur-portrait-frame"><img class="augur-portrait" alt=""><div class="augur-portrait-glow"></div></div><strong class="augur-combatant-name"></strong><div class="augur-health"><span></span><div><i></i></div></div><div class="augur-statuses"></div>';
      this.container.appendChild(node);
      return node;
    };
    this.actorNode=make('augur'); this.bossNode=make('boss');
    const omen=document.createElement('div');omen.className='card omen-mark';
    fillAugurCard(omen,'omen');omen.querySelector('.card-inner').style.transform='rotateY(180deg) rotateZ(180deg)';
    this.bossNode.querySelector('.augur-portrait-frame').appendChild(omen);this.omenMark=omen;
    fillAugurCard(this.container.querySelector('#augurContractCard'),'omen');
  }

  syncSnapshot(snapshot, {resourcesOnly=false,showObservedTarget=true}={}) {
    if(!snapshot)return;
    const actor=snapshot.players?.find(p=>p.id===this.step.sourceId) || {};
    const monster=snapshot.monster || {};
    const fill=(node,entity,descriptor)=>{
      if(!resourcesOnly) {
        const portrait=augurPortrait(descriptor);
        const image=node.querySelector('.augur-portrait');
        if(image.getAttribute('src')!==portrait.src)image.src=portrait.src;
        image.alt=entity.name || portrait.name || '';
        const hp=Math.max(0,entity.hp ?? 0),max=Math.max(1,entity.maxHp || 1);
        node.querySelector('.augur-health span').textContent=`${hp} / ${max}${entity.tempHp?` ＋${entity.tempHp} 護盾`:''}`;
        node.querySelector('.augur-health i').style.width=`${Math.min(100,hp/max*100)}%`;
        node.classList.toggle('is-dead',hp===0);
      }
      node.querySelector('.augur-combatant-name').textContent=entity.name || descriptor.name || '';
      const statuses=node.querySelector('.augur-statuses');statuses.replaceChildren();
      for(const status of [...(entity.statuses || []),...(entity.phase8Statuses || [])].filter((s,i,all)=>all.findIndex(a=>a.id===s.id)===i).slice(0,5)) {
        const tag=document.createElement('span');tag.textContent=`${status.label}${status.turns?` · ${status.turns}T`:''}${status.stacks?` ${status.stacks}`:''}`;statuses.appendChild(tag);
      }
    };
    fill(this.actorNode,actor,{...actor,role:'augur',name:actor.name || this.step.sourceName});
    fill(this.bossNode,monster,{...monster,entityType:'monster',avatar:this.step.monsterAvatar || monster.avatar,name:this.step.monsterName || monster.name});
    const debts=actor.augurFateDebts || [];
    const total=debts.reduce((n,d)=>n+d.amount,0);
    const equipment=actor.augurEquipment || augurEquipment(actor.equips || []);
    this.orbRig.style.setProperty('--debt',Math.min(1,total/60));
    this.orbRig.style.setProperty('--facet',equipment.amethyst?'.8':'0');
    this.orbRig.style.setProperty('--contract',equipment.forbidden?'1':'0');
    this.container.querySelector('#augurContractCard').style.opacity=equipment.forbidden?'.8':'0';
    this.orbitCards?.forEach(card=>card.classList.toggle('gilded',!!equipment.gilded));
    this.container.querySelector('#augurDebtTotal').textContent=`${total} / 60`;
    this.container.querySelector('#augurDebtBar').style.width=`${total/60*100}%`;
    const ledger=this.container.querySelector('#augurDebtItems');ledger.replaceChildren();
    for(const debt of debts) {const tag=document.createElement('span');tag.textContent=`R${debt.dueRound} 到期 · ${debt.amount}`;ledger.appendChild(tag);}
    if(!debts.length)ledger.textContent='尚無未清償命債';
    this.container.querySelector('#augurEquipmentLabel').textContent=[equipment.amethyst?`無瑕紫晶球 ×${equipment.amethyst}`:'',equipment.gilded?'鎏金諭示牌盒':'',equipment.forbidden?'禁忌厄運聖契':''].filter(Boolean).join(' · ');
    this.container.querySelector('#augurCardStateLabel').textContent={empty:'空 象',upright:'正 位',reversed:'逆 位'}[actor.augurCardState] || '空 象';
    this.container.dataset.cardState=actor.augurCardState || 'empty';
    this.omenMark.style.opacity=monster.reversedOmenRemaining>0?'1':'0';
    this.setObservedTarget(showObservedTarget?actor.observedTargetId:null,snapshot);
  }

  setObservedTarget(id,snapshot) {
    const target=snapshot?.players?.find(p=>p.id===id);
    const image=this.container.querySelector('#augurOrbTarget');
    this.observedTargetId=target?.id || null;
    if(!target) {
      image.style.opacity='0';
      this.container.querySelector('#augurOrbObservedLabel').textContent='等待命運的回聲';
      return;
    }
    const portrait=augurPortrait(target);
    if(image.getAttribute('src')!==portrait.src)image.src=portrait.src;
    image.alt=`觀測目標：${target.name || portrait.name}`;
    image.style.opacity='.82';
    const bonus=target.fateBlessing>0?` · 基礎 +${Math.round(target.fateBlessing*100)}%`:'';
    this.container.querySelector('#augurOrbObservedLabel').textContent=`${target.name || portrait.name}${bonus}`;
  }

  async transitionObservedTarget(id,snapshot) {
    if(this.disposed || this.signal?.aborted)return;
    if(this.observedTargetId===id) {this.setObservedTarget(id,snapshot);return;}
    const image=this.container.querySelector('#augurOrbTarget');
    const hasPrevious=!!this.observedTargetId;
    const dissolve=hasPrevious?(this.reduced?120:360):0;
    const pause=hasPrevious?70:0,gather=this.reduced?220:570;
    let switched=false;
    const render=(visibility)=>{
      image.style.opacity=String(.82*visibility);
      image.style.filter=`blur(${this.reduced?0:(1-visibility)*16}px)`;
      image.style.transform=`scale(${1.05+(this.reduced?0:(1-visibility)*.23)})`;
    };
    // Change the portrait only while invisible; keep the previous target until
    // its image has dissolved, then gather the new image from the same mist.
    await this.runFrames(dissolve+pause+gather,(_u,seconds)=>{
      const elapsed=seconds*1000;
      if(elapsed<dissolve) {render(1-elapsed/dissolve);return;}
      if(!switched) {
        render(0);
        this.setObservedTarget(id,snapshot);
        switched=true;
      }
      const progress=Math.min(1,Math.max(0,(elapsed-dissolve-pause)/gather));
      render(progress*progress*(3-2*progress));
    });
    if(this.disposed || this.signal?.aborted)return;
    image.style.filter='';image.style.transform='';
    this.setObservedTarget(id,snapshot);
  }

  later(callback,ms) {
    const timer=setTimeout(()=>{this.timers.delete(timer);if(!this.disposed)callback();},ms/this.speed);
    this.timers.add(timer);return timer;
  }

  animateNode(node,frames,duration) {
    const animation=node.animate(frames,{duration:duration/this.speed,fill:'forwards'});
    this.animations.add(animation);
    animation.finished.then(()=>this.animations.delete(animation),()=>this.animations.delete(animation));
    return animation;
  }

  runFrames(duration,render) {
    return new Promise(resolve=>{
      const start=performance.now(),task={raf:0,finish:()=>{cancelAnimationFrame(task.raf);this.frameTasks.delete(task);resolve();}};
      const tick=now=>{
        if(this.disposed || this.signal?.aborted)return task.finish();
        const elapsed=(now-start)*this.speed,u=Math.min(1,elapsed/duration);
        render(u,elapsed/1000);
        if(u===1)task.finish();else task.raf=requestAnimationFrame(tick);
      };
      this.frameTasks.add(task);task.raf=requestAnimationFrame(tick);
    });
  }

  measure() {
    const r = this.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const orbRect = this.orbAnchor.getBoundingClientRect();
    this.bounds = {
      w: r.width,
      h: r.height,
      orb: {
        x: orbRect.left - r.left + orbRect.width / 2,
        y: orbRect.top - r.top + orbRect.height / 2,
        w: orbRect.width,
        h: orbRect.height
      },
      boss:this.portraitBounds(this.bossNode,r),
      augur:this.portraitBounds(this.actorNode,r)
    };
  }

  portraitBounds(node,stageRect) {
    const box=node.querySelector('.augur-portrait-frame').getBoundingClientRect();
    return {x:box.left-stageRect.left+box.width/2,y:box.top-stageRect.top+box.height/2,w:box.width,h:box.height};
  }

  coord(target) {
    if (typeof target === 'string') return this.bounds[target] || this.bounds.orb;
    return target || this.bounds.orb;
  }

  startOrbitAnimation() {
    let clock = 0;
    const animateOrbit = () => {
      if (this.disposed || this.signal?.aborted) return;
      if (!this.reduced) {
        clock += 0.016 * this.speed;
        this.orbitCards.forEach((c, i) => {
          const a = clock * 0.4 + i * Math.PI * 2 / 3;
          const x = 50 + Math.cos(a) * 65;
          const y = 50 + Math.sin(a) * 27;
          c.style.left = x + '%';
          c.style.top = y + '%';
          c.style.transform = `translate(-50%,-50%) rotate(${Math.sin(a) * 12}deg) scale(${0.72 + (Math.sin(a) + 1) * 0.12})`;
          c.style.opacity = String(0.55 + (Math.sin(a) + 1) * 0.22);
          c.style.zIndex = Math.sin(a) > 0 ? '4' : '0';
        });
      }
      this.raf = requestAnimationFrame(animateOrbit);
    };
    this.raf = requestAnimationFrame(animateOrbit);
  }

  showCaption(title, text, kicker = 'THE AUGURY', negative = false, duration = 1200) {
    const el = this.container.querySelector('#augurCaption');
    if (!el) return;
    el.querySelector('#augurCaptionTitle').textContent = title;
    el.querySelector('#augurCaptionText').textContent = text;
    el.querySelector('#augurCaptionKicker').textContent = kicker;
    el.classList.toggle('negative', negative);
    el.style.opacity = '1';
    this.later(() => { el.style.opacity = '0'; }, duration);
  }

  number(anchor, value, type = 'magic', label = '') {
    const layer = this.container.querySelector('#augurFloatLayer');
    const node = document.createElement('div');
    node.className = `float-number ${type}`;
    node.innerHTML = `${value}<small>${label}</small>`;
    layer.appendChild(node);

    const pos = this.coord(anchor);
    node.style.left = pos.x + 'px';
    node.style.top = pos.y + 'px';
    node.style.opacity = '1';
    node.style.transform = 'translate(-50%, -50%)';

    const anim = this.animateNode(node,[
      { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0 },
      { transform: 'translate(-50%, -80%) scale(1.1)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -120%) scale(1)', opacity: 0 }
    ],900);
    anim.finished.then(() => node.remove(), () => node.remove());
  }

  // Skill 1 & Battle Intro Sweep Hand using augur1.png
  // The index finger hovers ~10px above the top of the crystal ball
  async sweepHand(duration = 1000) {
    const hand=document.createElement('div');hand.className='observing-hand';
    const img=document.createElement('img');img.src=augurAsset('/assets/augur1.png');img.alt='';hand.appendChild(img);
    this.container.querySelector('#augurEffectLayer').appendChild(hand);
    const o=this.bounds.orb,width=o.w*1.35,height=width*836/1454;
    hand.style.width=width+'px';
    // augur1.png includes a long sleeve below the fingertip. Anchor the index
    // finger itself (near 1% x, 37% y), rather than the image's bottom edge.
    const top=o.y-o.w/2-10-height*.37;
    try {await this.runFrames(this.reduced?450:duration,u=>{
      hand.style.left=(o.x+(u-.5)*(this.reduced?0:50)-width*.01)+'px';
      hand.style.top=(top+Math.sin(u*Math.PI)*4)+'px';
      hand.style.opacity=String(Math.min(u/.18,(1-u)/.18,1));
    });} finally {hand.remove();}
  }

  async reckonHands(duration = 2600) {
    const hand=document.createElement('div');hand.className='cupping-hand';
    const img=document.createElement('img');img.src=augurAsset('/assets/augur2.png');img.alt='';hand.appendChild(img);
    this.container.querySelector('#augurUnderOrbLayer').appendChild(hand);
    const o=this.bounds.orb,width=o.w*1.85,height=width*692/894;
    hand.style.width=width+'px';hand.style.left=(o.x-width/2)+'px';
    const rest=o.y-height*.15,start=this.bounds.h+50,whiteout=this.container.querySelector('#augurWhiteout');
    try {await this.runFrames(duration,(u,t)=>{
      const rise=Math.min(1,u/.3),float=Math.min(1,Math.max(0,(u-.15)/.35));
      const floatY=-35*Math.sin(float*Math.PI*.5);
      hand.style.top=(start+(rest-start)*(1-Math.pow(1-rise,3)))+'px';
      hand.style.opacity=String(Math.min(1,u/.15)*Math.min(1,(1-u)/.15));
      this.orbAnchor.style.transform=`translate(-50%,calc(-50% + ${floatY}px))`;
      const charge=Math.min(1,Math.max(0,(t-.65)/1.15)),release=1-Math.min(1,Math.max(0,(t-1.9)/.6));
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      if(charge>0)this.crystalRadiance(charge*release,t,release,floatY);
      const wash=Math.min(1,Math.max(0,(t-1.4)/.45))*(1-Math.min(1,Math.max(0,(t-2.05)/.5)));
      whiteout.style.opacity=String(wash*(this.reduced?.42:1));
    });} finally {
      hand.remove();whiteout.style.opacity='0';this.orbAnchor.style.transform='translate(-50%,-50%)';
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    }
  }

  // Radiance with 7 spectral chromatic rays expanding from crystal ball
  crystalRadiance(power, time, fade = 1, floatOffsetY = 0) {
    const o = { x: this.bounds.orb.x, y: this.bounds.orb.y + floatOffsetY };
    const r = this.bounds.orb.w * 0.5;
    const p = Math.min(1, Math.max(0, power));
    const alpha = Math.min(1, Math.max(0, fade));

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.globalAlpha = alpha;

    const glowRadius = r * (1.2 + p * (this.reduced ? 0.8 : 3.5));
    const glow = this.ctx.createRadialGradient(o.x, o.y, r * 0.1, o.x, o.y, glowRadius);
    glow.addColorStop(0, `rgba(255,255,255,${0.2 + p * 0.8})`);
    glow.addColorStop(0.25, `rgba(255,249,235,${p * 0.85})`);
    glow.addColorStop(0.55, `rgba(215,200,255,${p * 0.35})`);
    glow.addColorStop(1, 'rgba(200,195,255,0)');

    this.ctx.fillStyle = glow;
    this.ctx.fillRect(o.x - glowRadius, o.y - glowRadius, glowRadius * 2, glowRadius * 2);

    if (!this.reduced) {
      const colors = [
        [255, 136, 161], [255, 202, 126], [254, 242, 163],
        [142, 232, 205], [139, 202, 255], [183, 150, 246], [235, 175, 244]
      ];
      const length = r * (1.3 + p * 6.5);
      const width = r * (0.025 + p * 0.1);

      for (let i = 0; i < 14; i++) {
        const color = colors[i % 7];
        const a = i * Math.PI / 7 + time * 0.08;
        this.ctx.save();
        this.ctx.translate(o.x, o.y);
        this.ctx.rotate(a);

        const spectral = this.ctx.createLinearGradient(r * 0.45, 0, length, 0);
        spectral.addColorStop(0, `rgba(${color},${p * 0.72})`);
        spectral.addColorStop(0.55, `rgba(${color},${p * 0.44})`);
        spectral.addColorStop(1, `rgba(${color},0)`);

        this.ctx.fillStyle = spectral;
        this.ctx.beginPath();
        this.ctx.moveTo(r * 0.35, 0);
        this.ctx.lineTo(length, -width * 2);
        this.ctx.lineTo(length, width * 1.3);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();
      }
    }
    this.ctx.restore();
  }

  // Prismatic Refraction Beam for Basic Attack (水晶折光)
  async playBeamAnimation(duration=650,tome=false) {
    const a=this.bounds.orb,b=this.bounds.boss;
    try {await this.runFrames(this.reduced?250:duration,u=>{
      const en=Math.min(u/.12,(1-u)/.12,1),prism={x:a.x+(b.x-a.x)*.22,y:a.y+(b.y-a.y)*.22},merge={x:a.x+(b.x-a.x)*.68,y:a.y+(b.y-a.y)*.68};
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.ctx.save();this.ctx.globalAlpha=en;
      this.ctx.strokeStyle=tome?'#f7a0b5':AUGUR_COLORS.white;this.ctx.lineWidth=3;
      this.ctx.beginPath();this.ctx.moveTo(a.x,a.y);this.ctx.lineTo(prism.x,prism.y);this.ctx.stroke();
      const colors=tome?['#742751','#b14a79','#ed91ab']:['#ff9aa9','#ffd399','#f8efb5','#b0e3c4','#9fdced','#a9b2ff','#d4a9eb'];
      colors.forEach((color,i)=>{
        this.ctx.lineWidth=1.5;this.ctx.strokeStyle=color;this.ctx.beginPath();this.ctx.moveTo(prism.x,prism.y);
        this.ctx.quadraticCurveTo((prism.x+merge.x)/2,(prism.y+merge.y)/2+(i-(colors.length-1)/2)*8,merge.x,merge.y);this.ctx.stroke();
      });
      this.ctx.lineWidth=4;this.ctx.strokeStyle=tome?'#ffd7e2':AUGUR_COLORS.white;
      this.ctx.beginPath();this.ctx.moveTo(merge.x,merge.y);this.ctx.lineTo(b.x,b.y);this.ctx.stroke();this.ctx.restore();
    });} finally {this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);}
  }

  // Starbreaker Resistance Debuff Effect
  resistance(power = 1) {
    const p = this.bounds.boss;
    const r = (p.w || 120) * 0.6;
    this.ctx.save();
    this.ctx.strokeStyle = AUGUR_COLORS.gold;
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, r * power, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
    this.later(() => this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height), 200);
  }

  // Debt Repay Flash (命債清償)
  repayFX(amount) {
    if (!amount) return;
    const o = this.bounds.orb;
    const release = this.container.querySelector('#augurSealRelease');
    if (release) {
      release.style.opacity = '1';
      release.style.strokeDashoffset = '0';
      this.later(() => { release.style.opacity = '0'; }, 500);
    }
  }

  // 3D Tarot Card Flip (Upright or Reversed Intercept)
  async flipTarotCard(targetAnchor,isReversed=false,duration=1000,state) {
    const card=document.createElement('div');card.className='card augur-flying-card';
    fillAugurCard(card,state || (isReversed?'reverse':'upright'),this.container.querySelector('.orbit-card')?.classList.contains('gilded'));
    this.container.querySelector('#augurEffectCards').appendChild(card);
    const o=this.bounds.orb,dest=this.coord(targetAnchor);
    try {await this.runFrames(this.reduced?450:duration,u=>{
      const fly=this.reduced?0:Math.max(0,(u-.35)/.65);
      card.style.left=(o.x+(dest.x-o.x)*fly)+'px';card.style.top=(o.y+(dest.y-o.y)*fly-Math.sin(u*Math.PI)*45)+'px';
      card.style.opacity=String(Math.min(u/.15,(1-u)/.12,1));
      card.querySelector('.card-inner').style.transform=`rotateY(${Math.min(180,u*3*180)}deg) rotateZ(${isReversed?Math.min(180,Math.max(0,(u-.3)*2.5*180)):0}deg)`;
    });} finally {card.remove();}
  }

  dispose() {
    if(this.disposed)return;
    this.disposed=true;
    this.signal?.removeEventListener('abort',this.onAbort);
    this.resizeObserver?.disconnect();
    for(const timer of this.timers)clearTimeout(timer);
    this.timers.clear();
    for(const task of [...this.frameTasks])task.finish();
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const a of this.animations) a.cancel();
    this.animations.clear();
    this.container.remove();
  }
}

// All portraits use the same resolver as the rest of combat, including forms and Storage bindings.
function augurAsset(path) {return typeof window!=='undefined' && window.assetRegistry?window.assetRegistry.resolvePath(path):path;}
function augurPortrait(descriptor={}) {
  if(typeof resolveBattlePortrait==='function')return resolveBattlePortrait(descriptor);
  if(descriptor.entityType==='monster')return {src:augurAsset(descriptor.avatar || '/BOSS/Ancient Guardian Golem.webp'),name:descriptor.name || '首領'};
  const names={sage:'智者',samurai:'武士'};
  const role=descriptor.role || 'augur';
  return {src:augurAsset(`/photo/${names[role] || role.charAt(0).toUpperCase()+role.slice(1)}.webp`),name:descriptor.name || role};
}
function augurEquipment(equips) {
  return {amethyst:equips.filter(e=>e.id==='aug_amethyst').length,gilded:equips.some(e=>e.id==='aug_gilded_box'),forbidden:equips.some(e=>e.id==='aug_forbidden_tome')};
}
function buildAugurPresentationPlan(step) {
  const before=step.hpSnapshotBefore || {players:[],monster:null},after=step.hpSnapshot || before;
  const action=step.actionId || step.skillId || (step.category==='DEBT_EXPIRY'?'aug_expiry':'');
  const previousObservedId=before.players?.find(p=>p.id===step.sourceId)?.observedTargetId;
  const observedId=['aug_bind','aug_observe'].includes(action)?step.outcome?.targetId || step.targetId:previousObservedId;
  return {action,before,after,
    results:step.results || [],
    observedId,
    initialObservation:action==='aug_observe' && (!previousObservedId || previousObservedId===observedId),
    repaid:Math.max(0,step.outcome?.repaid ?? 0),
    hits:(step.results || []).filter(r=>r.kind==='damage'),heals:(step.results || []).filter(r=>r.kind==='heal'),
    outcome:step.outcome || {},skillName:step.skillName};
}
let augurPreloadPromise=null;
function preloadAugurAssets() {
  return augurPreloadPromise ||= Promise.all(['/assets/augur1.png','/assets/augur2.png','/photo/Augur.webp'].map(path=>{
    if(typeof window!=='undefined' && window.assetRegistry)return window.assetRegistry.preloadImage(path).catch(()=>null);
    return new Promise(resolve=>{const img=new Image();img.onload=img.onerror=resolve;img.src=path;});
  }));
}
if(typeof window!=='undefined')window.addEventListener('studio:content-ready',()=>{augurPreloadPromise=null;});

async function playAugurPresentation(step,context={}) {
  await preloadAugurAssets();
  const signal=context.signal || context.controller?.signal;if(signal?.aborted)return;
  const stage=typeof getOrCreateCombatStage==='function'?getOrCreateCombatStage():document.querySelector('.combat-stage') || document.body;
  const plan=buildAugurPresentationPlan(step);
  const engine=new AugurPresentationEngine(stage,{step,signal,speed:context.speed || 1,reduced:context.reducedMotion,
    audioScope:context.audioScope || (typeof createSfxPresentationScope==='function'?createSfxPresentationScope(context):null)});
  const wait=ms=>waitForPresentation(ms,signal,context.speed || 1);
  const beat=(name,data={})=>context.onTiming?.(name,{step,...data});
  const apply=snapshot=>{if(signal?.aborted || engine.disposed)return;engine.syncSnapshot(snapshot,{resourcesOnly:!!context.augurReaction});if(!context.augurReaction && typeof applyHpSnapshot==='function')applyHpSnapshot(snapshot);};
  const renderHit=async result=>{
    if(signal?.aborted)return;
    const amount=result.finalDamage ?? 0,anchor=result.targetId==='monster'?'boss':result.targetId===step.sourceId?'augur':'orb';
    const tome=result.outcome?.type==='augur_tome';
    if(tome){engine.audio.play('magic_impact',{noHold:true});await engine.playBeamAnimation(420,true);}
    if(amount>0) {
      engine.number(anchor,`−${amount}`,result.damageType==='true'?'true':anchor==='boss'?'magic':'damage',tome?'聖契真實傷害':result.damageType==='true'?'無視護盾':'魔法');
      engine.animateNode(anchor==='boss'?engine.bossNode:engine.actorNode,[{filter:'brightness(1)'},{filter:'brightness(1.8)',offset:.25},{filter:'brightness(1)'}],300);
    } else if(result.kind==='damage')engine.number(anchor,'0','note','未造成傷害');
    beat('impact',{result});if(result.hpSnapshot)apply(result.hpSnapshot);await wait(tome?250:140);
  };
  const renderResult=async result=>{
    if(signal?.aborted || engine.disposed)return;
    if(result.kind==='damage')return renderHit(result);
    if(result.kind==='heal') {
      const amount=result.actualHeal ?? result.finalHeal ?? 0;
      if(amount>0)engine.number(result.targetId==='monster'?'boss':result.targetId===step.sourceId?'augur':'orb',`+${amount}`,'heal','生命回復');
      beat('heal',{result});
    }
    if(result.hpSnapshot)apply(result.hpSnapshot);
  };
  try {
    engine.syncSnapshot(plan.before,{showObservedTarget:!plan.initialObservation});beat('augur_action_start');
    if(plan.outcome.type==='invalid') {
      engine.showCaption(step.skillName || '命運繫結','觀測目標已失效','FATE UNBOUND',true);await wait(700);
    } else if(plan.action==='basic') {
      engine.showCaption('水晶折光',`水晶折射 · 實際清償 ${plan.repaid} 命債`,'PRISMATIC REFRACTION');
      engine.audio.play('magic_impact',{noHold:true});await engine.playBeamAnimation();
      for(const result of plan.results)await renderResult(result);
      if(plan.after.monster?.augurResistanceBreak>0)engine.resistance();
    } else if(plan.action==='aug_bind' || plan.action==='aug_observe') {
      const target=plan.after.players?.find(p=>p.id===plan.observedId);
      engine.showCaption(step.skillName || '命運觀測',`${target?.name || '自身'} · ${plan.action==='aug_bind'?'本回合加護與干涉強化':'命運加護生效'}`,'THE OBSERVATION',false,1700);
      engine.audio.play('air_pass',{noHold:true});
      await Promise.all([engine.sweepHand(1200),(async()=>{await wait(200);await engine.transitionObservedTarget(plan.observedId,plan.after);})()]);
      beat('augur_observed',{targetId:plan.observedId});
    } else if(plan.action==='aug_reckon') {
      engine.showCaption('命運清算・凶兆逆位',`捧起命運 · 實際清償 ${plan.repaid} 命債`,'THE RECKONING',false,2900);
      engine.audio.play('support_cast',{noHold:true});await engine.reckonHands(2600);
      const main=plan.hits.find(r=>r.outcome?.type!=='augur_tome');if(main)await renderHit(main);
      if(plan.after.monster?.augurResistanceBreak>0)engine.resistance();
      if(plan.after.monster?.reversedOmenRemaining>0) {
        await engine.flipTarotCard('boss',true,850,'omen');engine.omenMark.style.opacity='1';beat('augur_omen',{bonus:plan.after.monster.reversedOmenBonus});
      }
      for(const result of plan.results.filter(r=>r!==main))await renderResult(result);
    } else if(plan.action==='aug_reverse' || plan.action==='aug_upright') {
      const reverse=plan.action==='aug_reverse',o=plan.outcome;
      engine.showCaption(step.skillName,`${o.skillName || ''} · ${o.baseChance}% → ${o.finalChance}%${reverse?` · 封存 ${o.debt} 命債`:o.success?' · 效果觸發':' · 本次效果未觸發'}`,reverse?'DEFY FATE':'FOLLOW FATE',reverse,1700);
      engine.audio.play('air_pass',{noHold:true});await engine.flipTarotCard('orb',reverse);
      engine.syncSnapshot(plan.after,{resourcesOnly:true});
      if(reverse && o.debt>0)engine.number('orb',`+${o.debt}`,'debt','封存厄運');
      beat('augur_intervention',{cardState:reverse?'reversed':'upright',outcome:o});
    } else if(plan.action==='aug_tome') {
      const o=plan.outcome;
      engine.showCaption('禁忌厄運聖契',`${Math.abs(o.changedDebt || 0)} 命債變動 → ${o.damage ?? 0} 真實傷害`,'FORBIDDEN COVENANT',true);
      await engine.playBeamAnimation(480,true);
      if(context.augurReaction)beat('augur_tome',{damage:o.damage});
      else for(const hit of plan.hits)await renderHit({...hit,outcome:{type:'normal'}});
    } else if(plan.action==='aug_debt_heal') {
      engine.showCaption('治療抵銷命債',`治療量優先清償 ${plan.repaid} 命債`,'DEBT REPAID');
    } else if(plan.action==='aug_expiry') {
      engine.showCaption('命債到期清算',`${plan.outcome.expired ?? plan.hits[0]?.finalDamage ?? 0} 命債到期 · 無視護盾與減傷`,'THE PRICE OF FATE',true);
      engine.audio.play('shadow_strike',{noHold:true});
      engine.animateNode(engine.sphere,[{filter:'brightness(1)'},{filter:'brightness(2) saturate(.2)',offset:.3},{filter:'brightness(.7)'}],450);
      for(const hit of plan.hits)await renderHit(hit);
    } else {engine.showCaption(step.skillName || '命運干涉','','THE AUGURY');}
    if(signal?.aborted)return;
    if(plan.repaid>0) {engine.repayFX(plan.repaid);engine.number('orb',`−${plan.repaid}`,'debt','命債清償');beat('augur_debt_repaid',{amount:plan.repaid});}
    apply(plan.after);beat('hp_update');await wait(650);beat('action_complete');
  } finally {engine.dispose();}
}
if(typeof window!=='undefined')Object.assign(window,{AugurPresentationEngine,playAugurPresentation,preloadAugurAssets,buildAugurPresentationPlan});
