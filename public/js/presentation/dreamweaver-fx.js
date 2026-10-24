/* Dreamweaver FX | Dependency-free, transparent, deterministic Canvas + DOM.
 * Source specification: user-provided Dreamweaver animation brief.
 * Coordinates are local to root. Pass untransformed avatar wrappers as anchors.
 * No game-state mutation: combat integration uses callbacks / CustomEvents.
 */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const mix = (a, b, p) => a + (b - a) * p;
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
  const easeIn = x => Math.pow(clamp(x), 3);
  const range = (t, a, b) => clamp((t - a) / (b - a));
  const pointMix = (a, b, p) => ({ x: mix(a.x, b.x, p), y: mix(a.y, b.y, p) });
  const cubic = (a, b, c, d, t) => {
    const q = 1 - t;
    return { x: q*q*q*a.x + 3*q*q*t*b.x + 3*q*t*t*c.x + t*t*t*d.x,
             y: q*q*q*a.y + 3*q*q*t*b.y + 3*q*t*t*c.y + t*t*t*d.y };
  };
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const COLORS = {
    purple: { rgb: '196,177,255', edge: '#ebe1ff', dark: '#687bab', label: '紫' },
    red: { rgb: '255,119,139', edge: '#ffdee7', dark: '#b65472', label: '紅' },
    orange: { rgb: '255,182,104', edge: '#fff0cf', dark: '#b57a49', label: '橘' },
    green: { rgb: '119,227,179', edge: '#e0ffec', dark: '#468d81', label: '綠' }
  };
  const BRANCHES = Object.freeze({
    attack: [
      { name: '鏡像夢境', color: 'purple' }, { name: '解離痛楚', color: 'red' },
      { name: '萎靡夢魘', color: 'orange' }, { name: '狂亂夢遊', color: 'green' }
    ],
    skill1: [{ name: '美夢化生', color: 'purple' }, { name: '夢魘成真', color: 'red' }],
    skill2: [
      { name: '淺層清夢', color: 'purple' }, { name: '深淵墜夢', color: 'red' },
      { name: '百鬼夜行', color: 'orange' }, { name: '孤影殘夢', color: 'green' }
    ]
  });
  const PHASES = {
    attack: [
      [0, '喚起蝶影'], [.45, '蝶影包夾'], [1.42, '螺旋束縛'],
      [2.4, '四散勒緊'], [2.94, '絲弦崩斷'], [3.28, '夢境迴響']
    ],
    skill1: [[0, '破繭成雙'], [.75, '錯位展翼'], [1.15, '夢結編織'], [3.5, '攜網飛行'], [4.06, '四蝶入體'], [4.42, '夢蝶迷思']],
    skill2: [[0, '破繭成雙'], [.75, '錯位展翼'], [1.15, '夢結編織'], [3.5, '攜網飛行'], [4.06, '四蝶入體'], [4.42, '夢蝶迷思']],
    trigger: [[0, '判定觸發'], [.16, '夢蝶顯影'], [.9, '消散']]
  };
  let SHARED_ATLAS = null;

  function makeCanvas(w, h = w) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function butterflySprite(color, fold) {
    const c = makeCanvas(192), ctx = c.getContext('2d');
    const palette = COLORS[color];
    ctx.translate(96, 94);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side * fold, 1);
      const upper = new Path2D('M 2 -7 C 17 -31 42 -57 72 -70 C 70 -32 49 0 6 12 C 4 5 3 -1 2 -7 Z');
      const lower = new Path2D('M 5 6 C 21 1 49 12 51 42 C 31 41 12 27 3 14 Z');
      const g = ctx.createLinearGradient(2, 12, 64, -54);
      g.addColorStop(0, `rgba(${palette.rgb},.86)`);
      g.addColorStop(.4, `rgba(${palette.rgb},.36)`);
      g.addColorStop(.73, 'rgba(214,235,255,.55)');
      g.addColorStop(1, `rgba(${palette.rgb},.82)`);
      ctx.fillStyle = g; ctx.fill(upper); ctx.fill(lower);
      ctx.strokeStyle = palette.edge; ctx.lineWidth = .85; ctx.globalAlpha = .9;
      ctx.stroke(upper); ctx.stroke(lower);
      ctx.globalAlpha = 1;
      const facets = [
        [4,4, 30,-12, 72,-70], [30,-12, 48,-43, 72,-70],
        [4,4, 20,-33, 48,-43], [30,-12, 45,-5, 56,-23],
        [6,12, 28,14, 51,42], [28,14, 39,24, 51,42], [6,12, 18,29, 28,14]
      ];
      facets.forEach((f, i) => {
        ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(f[2], f[3]); ctx.lineTo(f[4], f[5]); ctx.closePath();
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.12)' : `rgba(${palette.rgb},.24)`;
        ctx.fill(); ctx.strokeStyle = 'rgba(241,238,255,.47)'; ctx.lineWidth = .55; ctx.stroke();
      });
      ctx.beginPath(); ctx.moveTo(4,6); ctx.lineTo(72,-70); ctx.moveTo(5,10); ctx.lineTo(51,42);
      ctx.strokeStyle = 'rgba(248,244,224,.55)'; ctx.lineWidth = .8; ctx.stroke();
      for (let i = 0; i < 14; i++) {
        const x = 8 + hash(i+2) * 49, y = -hash(i+14)*45;
        if (ctx.isPointInPath(upper, x, y)) continue;
        ctx.fillStyle = `rgba(255,255,255,${.12+hash(i+32)*.32})`;
        ctx.fillRect(x, y, .7, .7);
      }
      ctx.restore();
    }
    ctx.lineCap = 'round';
    const body = ctx.createLinearGradient(0,-14,0,25);
    body.addColorStop(0, '#fff3d0'); body.addColorStop(1, 'rgba(230,199,156,.1)');
    ctx.strokeStyle = body; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0,-13); ctx.bezierCurveTo(1,0,0,14,0,24); ctx.stroke();
    ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.arc(0,-14,2,0,TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(245,224,190,.7)'; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.moveTo(-1,-14); ctx.quadraticCurveTo(-11,-23,-10,-28);
    ctx.moveTo(1,-14); ctx.quadraticCurveTo(11,-23,10,-28); ctx.stroke();
    return c;
  }
  function atlas() {
    if (SHARED_ATLAS) return SHARED_ATLAS;
    const out = { butterflies: {}, glows: {} };
    for (const color of Object.keys(COLORS)) {
      out.butterflies[color] = Array.from({ length: 9 }, (_, i) => butterflySprite(color, .22 + i * .0975));
    }
    for (const [key, rgb] of Object.entries({ gold: '255,218,148', white: '255,246,219', purple: '180,160,255', red: '255,110,130', green: '105,223,174', orange: '255,181,99' })) {
      const c = makeCanvas(96), ctx = c.getContext('2d'), g = ctx.createRadialGradient(48,48,0,48,48,48);
      g.addColorStop(0, `rgba(${rgb},.98)`); g.addColorStop(.10, `rgba(${rgb},.7)`);
      g.addColorStop(.32, `rgba(${rgb},.16)`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(0,0,96,96); out.glows[key] = c;
    }
    SHARED_ATLAS = out; return out;
  }

  class DreamweaverFX {
    static get branches() { return BRANCHES; }
    static get colors() { return COLORS; }
    static get timings() {
      return Object.freeze({ attackImpact: 2.94, attackTrigger: 3.28, infuse: 4.42, skillTrigger: 4.62, triggerDuration: 1.0 });
    }
    constructor(options = {}) {
      const { root, caster, target } = options;
      if (!(root instanceof HTMLElement) || !(caster instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        throw new TypeError('DreamweaverFX requires root, caster and target HTMLElements.');
      }
      this.options = options; this.root = root; this.caster = caster; this.target = target;
      this.casterAnchor = options.casterAnchor || caster;
      this.targetAnchor = options.targetAnchor || target;
      this.assets = atlas(); this.quality = options.quality || 'auto';
      this.type = 'attack'; this.time = 0; this.duration = 4.8; this.speed = 1;
      this.playing = false; this.destroyed = false; this._visible = false; this._events = new Set();
      this._lastPhase = ''; this._raf = 0; this._originalScale = target.style.scale;
      this._originalTranslate = target.style.translate; this._originalWillChange = target.style.willChange;
      this._rootPosition = root.style.position; this._positionPatched = getComputedStyle(root).position === 'static';
      if (this._positionPatched) root.style.position = 'relative';
      this.back = this._addLayer('back', options.backZIndex ?? 1);
      this.front = this._addLayer('front', options.frontZIndex ?? 5);
      this.bctx = this.back.getContext('2d', { alpha: true });
      this.fctx = this.front.getContext('2d', { alpha: true });
      this._tick = this._tick.bind(this);
      this._resize = this._resize.bind(this);
      this._ro = new ResizeObserver(() => {
        cancelAnimationFrame(this._resizeRaf);
        this._resizeRaf = requestAnimationFrame(this._resize);
      });
      this._ro.observe(root); this._ro.observe(this.casterAnchor); this._ro.observe(this.targetAnchor);
      this._onVisibility = () => {
        if (document.hidden && this.playing) { this._hiddenPaused = true; this.pause(); }
        else if (!document.hidden && this._hiddenPaused) { this._hiddenPaused = false; this.resume(); }
      };
      document.addEventListener('visibilitychange', this._onVisibility);
      this._resize();
    }
    _addLayer(name, z) {
      const c = document.createElement('canvas');
      c.className = `dw-fx-layer dw-fx-${name}`; c.setAttribute('aria-hidden', 'true');
      Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: String(z), background: 'transparent' });
      this.root.appendChild(c); return c;
    }
    _resize() {
      if (this.destroyed) return;
      const r = this.root.getBoundingClientRect();
      this.w = this.root.clientWidth; this.h = this.root.clientHeight;
      const unitX = this.root.offsetWidth / (r.width || 1);
      const unitY = this.root.offsetHeight / (r.height || 1);
      if (this.w < 1 || this.h < 1) return;
      const maxDpr = this.quality === 'eco' ? 1 : this.quality === 'high' ? 2 : 1.6;
      this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      for (const c of [this.back, this.front]) {
        c.width = Math.round(this.w * this.dpr); c.height = Math.round(this.h * this.dpr);
      }
      const get = el => {
        const b = el.getBoundingClientRect();
        return { x: (b.left - r.left + b.width / 2) * unitX - this.root.clientLeft,
                 y: (b.top - r.top + b.height / 2) * unitY - this.root.clientTop,
                 w: b.width * unitX, h: b.height * unitY };
      };
      this.a = get(this.casterAnchor); this.b = get(this.targetAnchor);
      const sameTrigger = this.triggerTarget === this.caster || this.triggerTarget === this.casterAnchor;
      this.triggerAnchor = sameTrigger ? this.a : (!this.triggerTarget || this.triggerTarget === this.target || this.triggerTarget === this.targetAnchor) ? this.b : get(this.triggerTarget);
      const skillEl = this.skillTarget || this.target;
      this.skillAnchor = skillEl === this.caster || skillEl === this.casterAnchor ? this.a
        : skillEl === this.target || skillEl === this.targetAnchor ? this.b : get(skillEl);
      this.s = Math.min(1, this.w / 900, this.h / 420);
      this.center = { x: (this.a.x + this.b.x) / 2, y: (this.a.y + this.b.y) / 2 - 14*this.s };
      this.particleCount = this.quality === 'eco' ? 34 : this.quality === 'high' ? 84 : this.w < 600 ? 38 : 64;
      this.render();
    }
    play(config = {}) {
      if (this.destroyed) throw new Error('This DreamweaverFX instance has been destroyed.');
      const type = config.type || 'attack';
      if (!Object.hasOwn(PHASES, type)) throw new RangeError('Unknown effect type. Use attack, skill1, skill2 or trigger.');
      this.cancel(false);
      this.type = type; this.time = 0; this._visible = true;
      this.duration = type === 'attack' ? 4.8 : type === 'trigger' ? 1.2 : 6;
      this.trigger = config.trigger && COLORS[config.trigger.color] ? { ...config.trigger } : null;
      if (type === 'trigger' && !this.trigger) this.trigger = { ...BRANCHES.attack[0] };
      this.skillTarget = (type === 'skill1' || type === 'skill2')
        ? (config.skillTarget || config.triggerTarget || this.target) : this.target;
      this.triggerTarget = config.triggerTarget || this.skillTarget;
      this.damage = Number.isFinite(config.damage) ? config.damage : 128;
      this.speed = clamp(Number(config.speed) || this.speed, .25, 2);
      this._events.clear(); this._lastPhase = ''; this._hiddenPaused = false;
      this.target.style.willChange = 'scale, translate'; this._resize();
      this.playing = config.autoplay !== false;
      this._lastStamp = performance.now();
      if (this.playing) this._raf = requestAnimationFrame(this._tick);
      this.render(); this._notify('state', { playing: this.playing });
      return this;
    }
    pause() {
      this.playing = false; cancelAnimationFrame(this._raf); this._raf = 0;
      this._notify('state', { playing: false }); return this;
    }
    resume() {
      if (this.destroyed || this.playing) return this;
      if (this.time >= this.duration) return this.play({ type: this.type, trigger: this.trigger, triggerTarget: this.triggerTarget, skillTarget: this.skillTarget, damage: this.damage, speed: this.speed });
      this.playing = true; this._lastStamp = performance.now();
      this._raf = requestAnimationFrame(this._tick); this._notify('state', { playing: true }); return this;
    }
    setSpeed(value) { this.speed = clamp(Number(value) || 1, .25, 2); return this; }
    refresh() { this._resize(); return this; }
    setQuality(value) { this.quality = ['auto','high','eco'].includes(value) ? value : 'auto'; this._resize(); return this; }
    seek(seconds) {
      // Seeking is a visual preview. Suppress gameplay callbacks, including on resume.
      this.time = clamp(Number(seconds) || 0, 0, this.duration);
      for (const [key, at] of this._eventSchedule()) if (this.time >= at) this._events.add(key);
      this.render();
      if (!this.playing) this._notify('state', { playing: false, preview: true });
      return this;
    }
    cancel(notify = true) {
      this.playing = false; this._visible = false; this._hiddenPaused = false; cancelAnimationFrame(this._raf); this._raf = 0;
      this._restoreTarget();
      if (this.bctx && this.fctx) { this._clear(this.bctx); this._clear(this.fctx); }
      if (notify) this._notify('state', { playing: false, cancelled: true });
      return this;
    }
    clear() { this.cancel(); this.time = 0; this._notify('progress', { time: 0, duration: this.duration, phase: '待命', progress: 0 }); return this; }
    destroy() {
      if (this.destroyed) return;
      this.cancel(false); this.destroyed = true; cancelAnimationFrame(this._resizeRaf);
      this._ro.disconnect(); document.removeEventListener('visibilitychange', this._onVisibility);
      this.back.remove(); this.front.remove();
      if (this._positionPatched) this.root.style.position = this._rootPosition;
    }
    _restoreTarget() {
      this.target.style.scale = this._originalScale;
      this.target.style.translate = this._originalTranslate;
      this.target.style.willChange = this._originalWillChange;
    }
    _notify(name, detail) {
      const payload = { type: this.type, ...detail };
      const fn = this.options['on' + name[0].toUpperCase() + name.slice(1)];
      try { if (typeof fn === 'function') fn(payload); }
      catch (err) { console.error('DreamweaverFX callback error:', err); }
      this.root.dispatchEvent(new CustomEvent('dreamweaver:' + name, { detail: payload }));
    }
    _eventSchedule() {
      if (this.type === 'attack') return [['impact',2.94], ...(this.trigger ? [['trigger',3.28]] : [])];
      if (this.type === 'trigger') return [['trigger',.08]];
      return [['status',4.42], ...(this.trigger ? [['trigger',4.62]] : [])];
    }
    _tick(stamp) {
      if (!this.playing || this.destroyed) return;
      const previous = this.time;
      this.time = Math.min(this.duration, this.time + Math.min(.1, Math.max(0,(stamp-this._lastStamp)/1000)) * this.speed);
      this._lastStamp = stamp;
      // Render first: impact callbacks and health changes share the contact frame.
      this.render();
      for (const [name, at] of this._eventSchedule()) {
        if (!this._events.has(name) && previous <= at && this.time >= at) {
          this._events.add(name);
          if (name === 'impact') this._notify(name, { target: this.target, damage: this.damage, time: at });
          if (name === 'status') this._notify(name, { target: this.skillTarget, status: '夢蝶迷思', time: at });
          if (name === 'trigger') this._notify(name, { target: this.triggerTarget, branch: this.trigger, time: at });
        }
      }
      if (this.time >= this.duration) {
        this.playing = false; this._raf = 0; this._restoreTarget();
        this._notify('complete', { time: this.time }); this._notify('state', { playing: false, completed: true });
      } else this._raf = requestAnimationFrame(this._tick);
    }
    _clear(ctx) {
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
      ctx.setTransform(this.dpr || 1,0,0,this.dpr || 1,0,0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowBlur = 0;
    }
    render() {
      if (!this.w || !this.a || this.destroyed) return;
      this._clear(this.bctx); this._clear(this.fctx);
      if (!this._visible) return;
      if (this.type === 'attack') this._attack(this.time);
      else if (this.type === 'skill1' || this.type === 'skill2') this._weave(this.time);
      if (this.trigger) this._trigger(this.time);
      let phase = PHASES[this.type][0][1], phaseIndex = 0;
      PHASES[this.type].forEach(([at, label], i) => { if (this.time >= at) { phase = label; phaseIndex = i; } });
      if (this.time >= this.duration) this._restoreTarget();
      if (this.time >= this.duration) phase = '演出完成';
      if (phase !== this._lastPhase) { this._lastPhase = phase; this._notify('phase', { phase, phaseIndex, time: this.time }); }
      this._notify('progress', { time: this.time, duration: this.duration, progress: this.time/this.duration, phase, phaseIndex });
    }
    _glow(ctx, x, y, radius, alpha, color = 'gold') {
      if (alpha <= 0 || radius <= 0) return;
      ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.assets.glows[color] || this.assets.glows.gold, x-radius,y-radius,radius*2,radius*2); ctx.restore();
    }
    _butterfly(ctx, p, size, angle, phase, alpha = 1, color = 'purple', fold = null) {
      if (alpha <= 0 || size < .2) return;
      const wing = fold === null ? .15 + .85 * Math.pow(Math.abs(Math.cos(phase)), .6) : clamp(fold);
      const frame = Math.round(wing * 8);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(angle); ctx.globalAlpha = alpha;
      const sprite = this.assets.butterflies[color][frame];
      ctx.drawImage(sprite,-size*1.3,-size*1.3,size*2.6,size*2.6); ctx.restore();
    }
    _line(ctx, pts, alpha = 1, tension = 0, width = 1) {
      if (alpha <= 0 || pts.length < 2) return;
      const draw = () => { ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y); };
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(241,190,93,${alpha*.065})`; ctx.lineWidth = (7 + tension*3)*this.s*width; draw(); ctx.stroke();
      ctx.strokeStyle = `rgba(255,215,135,${alpha*.22})`; ctx.lineWidth = 2.8*this.s*width; draw(); ctx.stroke();
      const g = Math.round(mix(215,251,tension)), b = Math.round(mix(144,238,tension));
      ctx.strokeStyle = `rgba(255,${g},${b},${alpha*.92})`; ctx.lineWidth = Math.max(.55, .95*this.s*width); draw(); ctx.stroke();
      ctx.restore();
    }
    _castAura(t, end = 1.7) {
      const a = smooth(range(t,0,.25)) * (1-smooth(range(t,.6,end)));
      this._glow(this.bctx,this.a.x,this.a.y+25*this.s,115*this.s,a*.5,'purple');
      for (let i=0;i<10;i++) {
        const angle = i*TAU/10 - t*.85, r=(35+t*21)*this.s;
        this._glow(this.fctx,this.a.x+Math.cos(angle)*r,this.a.y+Math.sin(angle)*r*.8,4*this.s,a*.7,i%3?'gold':'purple');
      }
    }
    _attackPoint(t, i) {
      const s=this.s, a=this.a, b=this.b;
      const angle = [-2.45,-.7,2.4,.65][i];
      const hold = { x: b.x + Math.cos(angle)*(b.w*.72+25*s), y: b.y + Math.sin(angle)*(b.h*.4+27*s) };
      const start = { x:a.x + (i%2 ? 1:-1)*(a.w*.36), y:a.y + (i<2?-1:1)*24*s };
      if (t<.45) return {x:start.x + Math.sin(t*7+i)*9*s, y:start.y - t*14*s};
      if (t<1.42) {
        const p = easeOut(range(t,.45,1.42));
        const launch = { x:start.x + Math.sin(.45*7+i)*9*s, y:start.y - .45*14*s };
        return cubic(launch,{x:a.x+115*s,y:a.y+(i<2?-120:105)*s},{x:b.x-90*s,y:hold.y+(i<2?-65:65)*s},hold,p);
      }
      if (t<2.4) {
        const hover = smooth(range(t,1.42,1.65)) * (1-smooth(range(t,2.23,2.4)));
        return { x:hold.x+Math.sin(t*3+i)*5*s*hover, y:hold.y+Math.cos(t*3.2+i)*7*s*hover };
      }
      const dir = { x:Math.cos(angle), y:Math.sin(angle) };
      const pull = easeIn(range(t,2.4,2.94));
      const fly = easeOut(range(t,2.94,3.48));
      return { x:clamp(hold.x+dir.x*(48*pull+34*fly)*s,22*s,this.w-22*s),
               y:clamp(hold.y+dir.y*(43*pull+30*fly)*s,50*s,this.h-88*s) };
    }
    _ringPoint(theta, j, shrink, t) {
      const s=this.s, b=this.b, rot=[-.48,.50,1.08][j];
      const rx=(b.w*.64+15*s)*shrink, ry=(b.h*.18+7*s)*shrink;
      const x=rx*Math.cos(theta), y=ry*Math.sin(theta);
      return { x:b.x+x*Math.cos(rot)-y*Math.sin(rot),
               y:b.y+(j-1)*12*s+y*Math.cos(rot)+x*Math.sin(rot), z:Math.sin(theta + j*.8) };
    }
    _coils(t, tension, shrink, alpha) {
      const progress = smooth(range(t,.95,1.95));
      for(let j=0;j<3;j++) {
        let front=[], back=[];
        const flush = (pts, rear) => { if(pts.length>1) this._line(rear?this.bctx:this.fctx,pts,alpha*(rear?.53:1),tension,1.1); };
        for(let k=0;k<=112*progress;k++) {
          const theta=k/112*TAU + j*.7 + t*.85;
          const p=this._ringPoint(theta,j,shrink,t);
          const rear=p.z<0;
          const current=rear?back:front, other=rear?front:back;
          if(other.length) { other.push(p); flush(other,!rear); other.length=0; current.push(p); }
          current.push(p);
        }
        flush(front,false); flush(back,true);
        for(let i=0;i<7;i++) {
          const theta=i/7*TAU+t*(.7+j*.2)+j;
          if(progress<.99 && i/7>progress) continue;
          const p=this._ringPoint(theta,j,shrink,t);
          this._glow(p.z<0?this.bctx:this.fctx,p.x,p.y,(3.6+tension*1.5)*this.s,alpha*.68,tension>.7?'white':'gold');
        }
      }
    }
    _trail(pointFn, t, i, alpha, color='gold') {
      const pts=[];
      for(let k=0;k<15;k++) pts.push(pointFn(Math.max(0,t-(14-k)*.014),i));
      this._line(this.fctx,pts,alpha*.3,0,.72);
      for(let k=0;k<3;k++) {
        const p=pts[k*5]; this._glow(this.fctx,p.x,p.y,2.5*this.s,alpha*.35,color);
      }
    }
    _attack(t) {
      this._castAura(t);
      const tension = smooth(range(t,2.4,2.94));
      if(t<2.94) {
        this.target.style.scale=String(1-.2*tension);
        this.target.style.translate='0px 0px';
      } else {
        const dt=t-2.94;
        this.target.style.scale=String(1-.2*Math.exp(-dt*8.3)*Math.cos(dt*23));
        this.target.style.translate=`${(Math.sin(dt*74)*6*this.s*Math.exp(-dt*8)).toFixed(3)}px 0px`;
      }
      const coilAlpha=smooth(range(t,.9,1.3)) * (1-smooth(range(t,2.94,3.01)));
      if(coilAlpha>0) this._coils(t,tension,1-.34*tension,coilAlpha);
      if(t>1.4 && t<2.96) {
        for(let i=0;i<4;i++) {
          const p=this._attackPoint(t,i), theta=[-2.45,-.7,2.4,.65][i];
          const grip=this._ringPoint(theta,i%3,1-.34*tension,t);
          const pts=[];
          for(let k=0;k<=24;k++) {const u=k/24; pts.push({x:mix(grip.x,p.x,u),y:mix(grip.y,p.y,u)+Math.sin(Math.PI*u)*(10-9*tension)*this.s});}
          this._line(this.fctx,pts,coilAlpha*.9,tension);
        }
      }
      if(t<3.6) {
        const alpha=smooth(range(t,.04,.3))*(1-smooth(range(t,3.12,3.6)));
        for(let i=0;i<4;i++) {
          const p=this._attackPoint(t,i), prev=this._attackPoint(Math.max(0,t-.018),i);
          const moving=t>.45&&t<1.42 || t>2.4;
          const angle=moving?Math.atan2(p.y-prev.y,p.x-prev.x)+Math.PI/2:Math.sin(t*2+i)*.32;
          this._trail(this._attackPoint.bind(this),t,i,alpha);
          this._glow(this.fctx,p.x,p.y,21*this.s,alpha*.3,'purple');
          this._butterfly(this.fctx,p,19*this.s,angle,t*10+i*1.7,alpha);
        }
      }
      if(t>=2.94) this._fracture(t-2.94);
    }
    _fracture(dt) {
      if(dt>1.0) return;
      const s=this.s, b=this.b, fade=Math.pow(1-clamp(dt/1),2);
      this._glow(this.fctx,b.x,b.y,135*s,Math.max(0,1-dt/.19)*.65,'white');
      if(dt<.48) {
        const alpha=(1-dt/.48)*.7;
        this.fctx.save(); this.fctx.strokeStyle=`rgba(255,228,174,${alpha})`; this.fctx.lineWidth=1.5*s;
        this.fctx.beginPath(); this.fctx.ellipse(b.x,b.y,(50+dt*145)*s,(66+dt*110)*s,0,0,TAU); this.fctx.stroke(); this.fctx.restore();
      }
      this.fctx.save(); this.fctx.globalCompositeOperation='lighter';
      for(let i=0;i<this.particleCount;i++) {
        const angle=hash(i+20)*TAU, speed=(65+hash(i+76)*190)*s;
        const r=(15+hash(i+98)*48)*s+speed*dt;
        const x=b.x+Math.cos(angle)*r, y=b.y+Math.sin(angle)*r*.8+55*dt*dt*s;
        if(i%3===0) this._glow(this.fctx,x,y,(2+hash(i+28)*3)*s,fade*.9,'gold');
        else {
          const len=(4+hash(i+5)*16)*s*(1-dt*.6);
          this.fctx.strokeStyle=`rgba(255,${Math.round(206+hash(i)*45)},161,${fade*(.3+hash(i+9)*.6)})`;
          this.fctx.lineWidth=(.5+hash(i+42)*.65)*s;
          this.fctx.beginPath(); this.fctx.moveTo(x,y); this.fctx.lineTo(x-Math.cos(angle)*len,y-Math.sin(angle)*len*.8); this.fctx.stroke();
        }
      }
      this.fctx.restore();
    }
    _netFrame(t) {
      const flight=smooth(range(t,3.5,4.06));
      const collapse=easeIn(range(t,4.06,4.42));
      const dst=this.skillAnchor, c=this.center;
      const center={x:mix(c.x,dst.x,flight),y:mix(c.y,dst.y,flight)-Math.sin(flight*Math.PI)*45*this.s};
      return {center,scale:(1-collapse)*(1-.22*flight),angle:.08*Math.sin(t*2)*(1-flight)};
    }
    _netPoint(t,u,v) {
      const f=this._netFrame(t), s=this.s*f.scale;
      const x=(u-.5)*244*s, y=(v-.5)*162*s;
      const ripple=Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*Math.sin(t*3.4+u*5+v*3)*5*s;
      return {x:f.center.x+x*Math.cos(f.angle)-y*Math.sin(f.angle),
        y:f.center.y+x*Math.sin(f.angle)+y*Math.cos(f.angle)+ripple};
    }
    _weaveLocal(t,i) {
      // Four shuttles circle the dream loom and settle on its four corners.
      const corners=[[.075,.14],[.925,.14],[.23,.84],[.77,.84]], c=corners[i];
      const weave=range(t,1.15,3.5), settle=smooth(range(t,3.05,3.5));
      const theta=(t-1.15)*(i<2?3.9:-3.2)+[-2.55,-.59,2.55,.59][i];
      const orbit={x:this.center.x+145*this.s*Math.cos(theta),y:this.center.y+105*this.s*Math.sin(theta)};
      return pointMix(orbit,this._netPoint(t,c[0],c[1]),settle);
    }
    _weavePoint(t,i) {
      const s=this.s,a=this.a;
      const start={x:a.x+(i%2?1:-1)*a.w*.29,y:a.y+(i<2?-18:22)*s};
      if(t<.35)return {...start,y:start.y-t*13*s};
      if(t<1.15){
        const dst=this._weaveLocal(1.15,i),u=easeOut(range(t,.35,1.15));
        return cubic(start,{x:a.x+65*s,y:a.y-(i<2?95:-90)*s},{x:dst.x-45*s,y:dst.y-(i<2?52:-42)*s},dst,u);
      }
      if(t<3.5)return this._weaveLocal(t,i);
      const corners=[[.075,.14],[.925,.14],[.23,.84],[.77,.84]],c=corners[i];
      return this._netPoint(t,c[0],c[1]);
    }
    _knotPaths() {
      // Symmetric butterfly sigil, traced with luminous silk rather than filled wings.
      const paths=[];
      const curve=(segments,mirror,delay,kind='loop')=>{
        const pts=[];
        for(const [a,b,c,d] of segments)for(let k=0;k<=32;k++){
          const p=cubic({x:a[0],y:a[1]},{x:b[0],y:b[1]},{x:c[0],y:c[1]},{x:d[0],y:d[1]},k/32);
          pts.push({u:mirror?1-p.x:p.x,v:p.y});
        }
        paths.push({pts,delay,kind});
      };
      for(const mirror of [false,true]){
        const shift=mirror?.06:0;
        // Swept upper wings and rounded lower wings join at the slender body.
        curve([
          [[.49,.46],[.37,.25],[.17,.02],[.075,.14]],
          [[.075,.14],[.015,.34],[.17,.51],[.48,.55]],
          [[.48,.55],[.44,.52],[.46,.49],[.49,.46]]
        ],mirror,.01+shift);
        curve([
          [[.48,.54],[.31,.51],[.12,.52],[.18,.77]],
          [[.18,.77],[.24,.98],[.43,.94],[.485,.61]],
          [[.485,.61],[.50,.57],[.49,.55],[.48,.54]]
        ],mirror,.16+shift);
        // Curved wing veins form a woven, open filigree pattern.
        for(let j=0;j<3;j++){
          const x=.12+j*.09,y=.19+j*.085;
          curve([[[.485,.52],[.33,.42],[x+.02,y+.10],[x,y]]],mirror,.26+j*.07+shift,'cross');
          curve([[[.485,.56],[.39,.65],[.28+j*.035,.83],[.23+j*.055,.81+j*.018]]],mirror,.32+j*.065+shift,'cross');
        }
        curve([[[.17,.32],[.23,.21],[.32,.33],[.37,.43]],[[.37,.43],[.27,.49],[.18,.40],[.17,.32]]],mirror,.48+shift,'cross');
        // Two delicate antennae finish the mark.
        curve([[[.5,.34],[.46,.19],[.38,.15],[.365,.20]]],mirror,.50+shift,'cross');
      }
      curve([[[.50,.31],[.46,.41],[.47,.66],[.50,.84]],[[.50,.84],[.53,.66],[.54,.41],[.50,.31]]],false,.08);
      return paths;
    }
    _dreamNet(t,alpha) {
      if(t<1.15)return;
      this._knotGeometry ||= this._knotPaths();
      const progress=range(t,1.15,3.25);
      const draw=path=>{
        const reveal=smooth(clamp((progress-path.delay)/.40));
        if(reveal<=0)return;
        const count=Math.max(2,Math.ceil((path.pts.length-1)*reveal)+1);
        const pts=path.pts.slice(0,count).map(p=>this._netPoint(t,p.u,p.v));
        const isLoop=path.kind==='loop';
        this._line(this.fctx,pts,alpha*(isLoop?.91:.55),0,isLoop?2.15:1.65);
        // Fine offset highlight suggests a round silk cord, without a solid mesh fill.
        if(isLoop)this._line(this.fctx,pts.map(p=>({x:p.x-.6*this.s,y:p.y-.6*this.s})),alpha*.28,0,.55);
        if(reveal<1){const tip=pts[pts.length-1];this._glow(this.fctx,tip.x,tip.y,4*this.s,alpha*.65,'gold');}
      };
      for(const path of this._knotGeometry.filter(p=>p.kind==='cross'))draw(path);
      for(const path of this._knotGeometry.filter(p=>p.kind==='loop'))draw(path);
      if(t<3.5){
        const corners=[[.075,.14],[.925,.14],[.23,.84],[.77,.84]];
        for(let i=0;i<4;i++){
          const p=this._weavePoint(t,i),q=this._netPoint(t,...corners[i]),pts=[];
          for(let k=0;k<=20;k++){const u=k/20;pts.push({x:mix(p.x,q.x,u),y:mix(p.y,q.y,u)+Math.sin(Math.PI*u)*18*this.s});}
          this._line(this.fctx,pts,alpha*.65,0,.9);
        }
      }
    }
    _weave(t) {
      this.target.style.scale=this._originalScale;
      this.target.style.translate=this._originalTranslate;
      this._castAura(t,2.3);
      const alpha=smooth(range(t,.04,.3))*(1-smooth(range(t,4.34,4.42)));
      if(t<4.42) {
        this._dreamNet(t,alpha);
        for(let i=0;i<4;i++) {
          const p=this._weavePoint(t,i), prev=this._weavePoint(Math.max(0,t-.016),i);
          const heading=Math.atan2(p.y-prev.y,p.x-prev.x)+Math.PI/2;
          const angle=t<.35?Math.sin(t*3+i)*.4:heading*.48;
          this._trail(this._weavePoint.bind(this),t,i,alpha);
          const collapse=smooth(range(t,4.30,4.42));
          this._glow(this.fctx,p.x,p.y,22*this.s,alpha*.29,'purple');
          this._butterfly(this.fctx,p,18*this.s*(1-collapse*.85),angle,t*(9.2+i*.7)+i*1.9,alpha,'purple',collapse>0?1-collapse:null);
          if(t>1.05 && t<3.6) {
            for(let j=0;j<3;j++) {
              const tail=this._weavePoint(t-.07*(j+1),i);
              this._glow(this.fctx,tail.x+Math.sin(t*4+i+j)*5*this.s,tail.y+5*this.s*j,2.3*this.s,alpha*(.48-j*.12),j%2?'purple':'gold');
            }
          }
        }
      }
      if(t>=4.42) this._infusion(t-4.42);
    }
    _infusion(dt) {
      if(dt>.9) return;
      const b=this.skillAnchor, s=this.s, alpha=1-dt/.9;
      this._glow(this.fctx,b.x,b.y,95*s,Math.max(0,1-dt/.4)*.5,'purple');
      this.fctx.save(); this.fctx.strokeStyle=`rgba(208,188,255,${alpha*.5})`; this.fctx.lineWidth=.8*s;
      this.fctx.beginPath(); this.fctx.ellipse(b.x,b.y,(b.w*.37+dt*28*s),(b.h*.32+dt*22*s),0,0,TAU); this.fctx.stroke(); this.fctx.restore();
      for(let i=0;i<22;i++) {
        const theta=hash(i+4)*TAU, r=(35+hash(i+76)*64)*s*(1-easeOut(dt/.9));
        this._glow(this.fctx,b.x+Math.cos(theta)*r,b.y+Math.sin(theta)*r,3*s,alpha*.7,i%3?'gold':'purple');
      }
    }
    _trigger(t) {
      const start=this.type==='attack'?3.28:this.type==='trigger'?.08:4.62;
      const dt=t-start;
      if(dt<0 || dt>1) return;
      const a=this.triggerAnchor || this.b;
      const envelope=smooth(range(dt,0,.12))*(1-smooth(range(dt,.84,1)));
      // One second, max 50% compositing opacity, correctly tinted per branch.
      const size=a.w*.48*(.97+.03*smooth(range(dt,0,.4)));
      this._butterfly(this.fctx,a,size,0,0,.5*envelope,this.trigger.color,1);
    }
  }
  window.DreamweaverFX = DreamweaverFX;
})();
