/* ======================================================================
   陰陽師 ONMYOJI · Combat Presentation Engine & Production Hook
   Faithfully implemented based on public/assets/Onmyoji.html:
   - Talisman Image: public/assets/Onmyoji-1.png
   - Ling ("令") Image: public/assets/Onmyoji-2.png
   - Avatar: public/photo/Onmyoji.webp
   All effects, keyframes, timing, audio synthesis and visual styling preserved 1:1.
   ====================================================================== */

const ONMYOJI_TALISMAN_CONFIGS = Object.freeze({
  blind: {
    id: 'blind',
    name: '障目符',
    color: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.75)',
    shortEffect: '命中大幅下降 (Miss)',
    firstDesc: '目標攻擊命中率大幅下降，此次攻擊有 60%~100% 的不對我方傷害。',
    repeatDesc: '【重複觸發】再次觸發自殘反噬檢定！'
  },
  seal: {
    id: 'seal',
    name: '封勁符',
    color: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.75)',
    shortEffect: '機率當回合 0 傷害',
    firstDesc: '目標有 100% 機率在當前回合完全不造成任何傷害。',
    repeatDesc: '【重複觸發】再次進行當回合傷害無效化檢定！'
  },
  corrode: {
    id: 'corrode',
    name: '蝕體符',
    color: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.75)',
    shortEffect: '易傷 +10% 受傷提升',
    firstDesc: '目標進入易傷狀態，受到的所有攻擊傷害提升 10%。',
    repeatDesc: '【重複觸發】再次結算易傷判定（易傷加成疊加）！'
  },
  confuse: {
    id: 'confuse',
    name: '惑心符',
    color: '#ec4899',
    glow: 'rgba(236, 72, 153, 0.75)',
    shortEffect: '心智混亂 出手自殘',
    firstDesc: '目標陷入心智混亂，出手時將造成的傷害 50%~100% 作用在自身。',
    repeatDesc: '【重複觸發】再次觸發自殘反噬檢定！'
  },
  bewitch: {
    id: 'bewitch',
    name: '惑心符',
    color: '#ec4899',
    glow: 'rgba(236, 72, 153, 0.75)',
    shortEffect: '心智混亂 出手自殘',
    firstDesc: '目標陷入心智混亂，出手時將造成的傷害 50%~100% 作用在自身。',
    repeatDesc: '【重複觸發】再次觸發自殘反噬檢定！'
  },
  drain: {
    id: 'drain',
    name: '抽髓符',
    color: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.75)',
    shortEffect: '扣除最大生命 2%',
    firstDesc: '立即扣除目標最大生命值 2% 的血量（百分比削血）。',
    repeatDesc: '【重複觸發】再次扣除目標最大生命值 2% 血量！'
  }
});

function onmyojiAsset(path) {
  if (typeof window !== 'undefined' && window.assetRegistry && typeof window.assetRegistry.resolvePath === 'function') {
    return window.assetRegistry.resolvePath(path);
  }
  return path;
}

function getOnmyojiPortrait(descriptor = {}) {
  if (descriptor.entityType === 'monster') {
    return {
      src: onmyojiAsset(descriptor.avatar || '/BOSS/Ancient Guardian Golem.webp'),
      name: descriptor.name || '荒神鬼王・羅剎'
    };
  }
  return {
    src: onmyojiAsset('/photo/Onmyoji.webp'),
    name: descriptor.name || '陰陽師'
  };
}

function getAuraRibbonOverlaySVG() {
  return `
    <svg viewBox="0 0 240 400" class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;">
      <defs>
        <linearGradient id="onmRibbonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.95"/>
          <stop offset="28%" stop-color="#fde047" stop-opacity="1"/>
          <stop offset="65%" stop-color="#60a5fa" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.95"/>
        </linearGradient>
        <filter id="onmAuraGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#onmAuraGlow)" opacity="0.95">
        <path d="M 52,16 C 122,-14 206,8 210,78 C 214,148 175,205 204,278 C 224,335 170,392 102,386 C 30,378 8,322 26,255 C 44,188 -6,132 22,66 C 34,38 40,24 52,16 Z"
              fill="none" stroke="url(#onmRibbonGrad)" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M 186,14 C 228,56 194,142 216,204 C 232,256 190,348 144,382 C 82,404 -4,348 14,276 C 32,208 -10,156 28,88"
              fill="none" stroke="#7dd3fc" stroke-width="1.8" stroke-dasharray="10 6" opacity="0.88"/>
        <circle cx="20" cy="82" r="3.8" fill="#38bdf8"/>
        <circle cx="14" cy="152" r="3.2" fill="#fde047"/>
        <circle cx="216" cy="112" r="3.8" fill="#38bdf8"/>
        <circle cx="208" cy="248" r="4.2" fill="#fbbf24"/>
        <circle cx="20" cy="306" r="3.8" fill="#fde047"/>
        <circle cx="178" cy="372" r="3.4" fill="#38bdf8"/>
        <circle cx="130" cy="6" r="3.4" fill="#38bdf8"/>
      </g>
    </svg>
  `;
}

function getOnmyojiTalismanVisualHTML(accentColor = '#f59e0b', isMini = false) {
  const talismanUrl = onmyojiAsset('/assets/Onmyoji-1.png');
  return `
    <div class="relative w-full h-full flex items-center justify-center select-none"
         style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;filter: drop-shadow(0 4px ${isMini ? '5px' : '12px'} rgba(0,0,0,0.82)) drop-shadow(0 0 ${isMini ? '6px' : '15px'} ${accentColor});">
      ${!isMini ? getAuraRibbonOverlaySVG() : ''}
      <img src="${talismanUrl}" class="relative z-10 w-full h-full object-contain pointer-events-none" style="position:relative;z-index:10;width:100%;height:100%;object-fit:contain;pointer-events:none;" alt="符咒" onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='public/assets/Onmyoji-1.png';}else if(this.dataset.retry==='1'){this.dataset.retry='2';this.src='Onmyoji-1.png';}"/>
    </div>
  `;
}

function getUnifiedSealSVG(color = '#a855f7', glow = 'rgba(168, 85, 247, 0.75)') {
  return `
    <svg class="w-full h-full" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
      <circle cx="100" cy="100" r="88" fill="none" stroke="${color}" stroke-width="5"/>
      <circle cx="100" cy="100" r="76" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="10 6"/>
      <polygon
        points="100,18 123,74 182,74 134,110 152,168 100,133 48,168 66,110 18,74 77,74"
        fill="${glow}"
        fill-opacity="0.28"
        stroke="${color}"
        stroke-width="6"
        stroke-linejoin="round"
      />
      <circle cx="100" cy="100" r="24" fill="none" stroke="#ffffff" stroke-width="4"/>
      <path d="M100,66 L100,134 M66,100 L134,100" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="100" cy="100" r="9" fill="#ffffff"/>
    </svg>
  `;
}

class OnmyojiPresentationEngine {
  constructor(stage, options = {}) {
    this.stage = stage;
    this.signal = options.signal;
    this.speed = Math.max(0.2, options.speed || 1);
    this.reduced = options.reduced || false;
    this.audioScope = options.audioScope;
    this.step = options.step || {};
    this.timers = new Set();
    this.disposed = false;
    this.audioCtx = null;
    this.attachedTalismans = [];
    this.debuffStacks = { blind: 0, seal: 0, corrode: 0, confuse: 0, bewitch: 0, drain: 0 };

    this.container = document.createElement('div');
    this.container.className = 'onmyoji-presentation-container' + (this.reduced ? ' reduced' : '');
    if (this.container.style?.setProperty) {
      this.container.style.setProperty('--onm-speed-mult', 1 / this.speed);
    } else if (this.container.style) {
      this.container.style['--onm-speed-mult'] = 1 / this.speed;
    }

    this.buildMarkup();
    this.stage.appendChild(this.container);

    this.onAbort = () => this.dispose();
    this.signal?.addEventListener('abort', this.onAbort, { once: true });
  }

  getAudioCtx() {
    if (this.disposed) return null;
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        try { this.audioCtx = new AudioCtxClass(); } catch (e) {}
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  playSound(type) {
    if (this.disposed) return;
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      if (type === 'ling_stamp') {
        const oscLow = ctx.createOscillator();
        const gainLow = ctx.createGain();
        oscLow.type = 'triangle';
        oscLow.frequency.setValueAtTime(135, now);
        oscLow.frequency.exponentialRampToValueAtTime(42, now + 0.24);
        gainLow.gain.setValueAtTime(0.32, now);
        gainLow.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        oscLow.connect(gainLow); gainLow.connect(ctx.destination);
        oscLow.start(now); oscLow.stop(now + 0.28);

        const oscHigh = ctx.createOscillator();
        const gainHigh = ctx.createGain();
        oscHigh.type = 'sine';
        oscHigh.frequency.setValueAtTime(1046.5, now);
        oscHigh.frequency.exponentialRampToValueAtTime(1567.98, now + 0.18);
        gainHigh.gain.setValueAtTime(0.14, now);
        gainHigh.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        oscHigh.connect(gainHigh); gainHigh.connect(ctx.destination);
        oscHigh.start(now); oscHigh.stop(now + 0.26);
      } else if (type === 'appear') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.25);
      } else if (type === 'slam') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.26);
      } else if (type === 'shrink') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(760, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.36);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.4);
      } else if (type === 'seal_flash' || type === 'detonate_lock') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.28);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.34);
      } else if (type === 'detonate_gather') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(920, now + 0.55);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.6);
      } else if (type === 'detonate_final') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.45);
        gain.gain.setValueAtTime(0.38, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.5);
      }
    } catch (e) {}
  }

  buildMarkup() {
    this.container.innerHTML = `
      <div class="ink-stage-bg"></div>
      <svg class="bg-svg-layer" viewBox="0 0 1200 500" preserveAspectRatio="none">
        <defs>
          <linearGradient id="onmInkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.3" />
            <stop offset="50%" stop-color="#ffffff" stop-opacity="0.05" />
            <stop offset="100%" stop-color="#a855f7" stop-opacity="0.35" />
          </linearGradient>
        </defs>
        <path d="M0,380 Q300,310 600,380 T1200,350 L1200,500 L0,500 Z" fill="url(#onmInkGrad)" />
        <circle cx="600" cy="250" r="190" stroke="rgba(245,158,11,0.18)" stroke-width="1" stroke-dasharray="6 6" fill="none" />
        <circle cx="600" cy="250" r="230" stroke="rgba(168,85,247,0.14)" stroke-width="1" fill="none" />
      </svg>

      <div class="stage-action-banner" id="onmActionBanner">
        <span class="dot"></span>
        <span id="onmActionText">陰陽師・符咒戰鬥演出</span>
      </div>

      <div class="main-combat-grid">
        <!-- 我方陰陽師 -->
        <div class="onmyoji-combatant caster-side">
          <div class="caster-speech-bubble" id="onmSpeechBubble">「五鬼聽令，急急如律令！」</div>
          <div class="caster-aura-ring" id="onmAuraRing"></div>
          <div class="caster-avatar-box" id="onmCasterAvatarBox">
            <div class="inner-frame">
              <img id="onmCasterImg" src="${onmyojiAsset('/photo/Onmyoji.webp')}" alt="陰陽師" onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='/photo/Onmyoji.webp';}else if(this.dataset.retry==='1'){this.dataset.retry='2';this.src='/photo/Onmyōji.webp';}"/>
            </div>
          </div>
          <div class="combatant-info">
            <div class="info-header">
              <span class="name" id="onmCasterName">陰陽師</span>
              <span class="hp-text" id="onmCasterHpText">70 / 70 HP</span>
            </div>
            <div class="hp-bar-bg"><div class="hp-bar-fill" id="onmCasterHpFill" style="width: 100%;"></div></div>
          </div>
        </div>

        <!-- 敵方 Boss -->
        <div class="onmyoji-combatant boss-side" style="position:relative;">
          <div class="attached-talismans-layer" id="onmAttachedLayer"></div>
          <div class="summon-portal-ripple" id="onmPortalRipple"></div>

          <div class="boss-avatar-box" id="onmBossAvatarBox">
            <div class="inner-frame">
              <img id="onmBossImg" src="${onmyojiAsset('/BOSS/Ancient Guardian Golem.webp')}" alt="首領"/>
              <div class="boss-hit-flash-overlay" id="onmBossHitFlash"></div>
            </div>

            <!-- 核心特效掛載元件 -->
            <div class="caster-ling-overlay" id="onmLingOverlay">
              <img id="onmLingImg" src="${onmyojiAsset('/assets/Onmyoji-2.png')}" alt="令" onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='public/assets/Onmyoji-2.png';}else if(this.dataset.retry==='1'){this.dataset.retry='2';this.src='Onmyoji-2.png';}"/>
            </div>
            <div class="active-talisman-actor" id="onmActiveTalisman"></div>
            <div class="slam-shockwave-ring" id="onmShockwaveRing"></div>
            <div class="absorb-implode-ring" id="onmImplodeRing"></div>
            <div class="unified-seal-emblem" id="onmSealEmblem"></div>
            <div class="floating-text-container" id="onmFloatingTextLayer"></div>
          </div>

          <div class="combatant-info boss-info">
            <div class="info-header">
              <span class="name" id="onmBossName">荒神鬼王・羅剎</span>
              <span class="hp-text" id="onmBossHpText">500 / 500 HP</span>
            </div>
            <div class="hp-bar-bg"><div class="hp-bar-fill" id="onmBossHpFill" style="width: 100%;"></div></div>
          </div>

          <!-- 5 色印記狀態列 -->
          <div class="boss-debuff-bar" id="onmDebuffBar"></div>
        </div>
      </div>
    `;

    this.renderDebuffBar();
  }

  renderDebuffBar() {
    const bar = this.container.querySelector('#onmDebuffBar');
    if (!bar) return;
    bar.innerHTML = '';
    const types = ['blind', 'seal', 'corrode', 'confuse', 'drain'];
    types.forEach(tid => {
      const cfg = ONMYOJI_TALISMAN_CONFIGS[tid];
      const slot = document.createElement('div');
      slot.className = 'debuff-slot';
      slot.id = `onmDebuffSlot_${tid}`;
      slot.innerHTML = `
        <div class="icon-svg">${getUnifiedSealSVG(cfg.color, cfg.glow)}</div>
        <span class="name-label" style="color:${cfg.color};">${cfg.name}</span>
        <span class="count-badge" id="onmDebuffCount_${tid}">0</span>
      `;
      bar.appendChild(slot);
    });
  }

  renderAttachedTalismans() {
    const layer = this.container.querySelector('#onmAttachedLayer');
    if (!layer) return;
    layer.innerHTML = '';
    const list = this.attachedTalismans.slice(0, 10);
    const count = list.length;
    list.forEach((t, i) => {
      const startDeg = Math.round((i / Math.max(1, count)) * 360);
      const el = document.createElement('div');
      el.className = 'attached-talisman';
      el.style.setProperty('--start-deg', `${startDeg}deg`);
      el.innerHTML = `
        <div style="position:relative;width:100%;height:100%;">
          ${getOnmyojiTalismanVisualHTML(t.color, true)}
          <span class="index-badge">${i + 1}</span>
        </div>
      `;
      layer.appendChild(el);
    });

    const types = ['blind', 'seal', 'corrode', 'confuse', 'drain'];
    types.forEach(tid => {
      const slot = this.container.querySelector(`#onmDebuffSlot_${tid}`);
      const countEl = this.container.querySelector(`#onmDebuffCount_${tid}`);
      const stacks = this.debuffStacks[tid] || 0;
      if (countEl) countEl.textContent = stacks;
      if (slot) {
        const cfg = ONMYOJI_TALISMAN_CONFIGS[tid];
        if (stacks > 0) {
          slot.classList.add('active');
          slot.style.borderColor = cfg.color;
          slot.style.boxShadow = `0 0 10px ${cfg.glow}`;
        } else {
          slot.classList.remove('active');
          slot.style.borderColor = 'rgba(30, 41, 59, 0.9)';
          slot.style.boxShadow = 'none';
        }
      }
    });
  }

  syncSnapshot(snapshot) {
    if (!snapshot || this.disposed) return;
    const actor = snapshot.players?.find(p => p.id === this.step.sourceId) || {};
    const monster = snapshot.monster || {};

    const actorPortrait = getOnmyojiPortrait({ ...actor, role: 'onmyoji', name: actor.name || this.step.sourceName });
    const bossPortrait = getOnmyojiPortrait({ ...monster, entityType: 'monster', avatar: this.step.monsterAvatar || monster.avatar, name: this.step.monsterName || monster.name });

    const cImg = this.container.querySelector('#onmCasterImg');
    if (cImg && actorPortrait.src) cImg.src = actorPortrait.src;
    const cName = this.container.querySelector('#onmCasterName');
    if (cName) cName.textContent = actor.name || this.step.sourceName || '陰陽師';
    const cHpText = this.container.querySelector('#onmCasterHpText');
    const cHp = Math.max(0, actor.hp ?? 70), cMax = Math.max(1, actor.maxHp || 70);
    if (cHpText) cHpText.textContent = `${cHp} / ${cMax} HP`;
    const cHpFill = this.container.querySelector('#onmCasterHpFill');
    if (cHpFill) cHpFill.style.width = `${Math.min(100, (cHp / cMax) * 100)}%`;

    const bImg = this.container.querySelector('#onmBossImg');
    if (bImg && bossPortrait.src) bImg.src = bossPortrait.src;
    const bName = this.container.querySelector('#onmBossName');
    if (bName) bName.textContent = monster.name || this.step.monsterName || '荒神鬼王・羅剎';
    const bHpText = this.container.querySelector('#onmBossHpText');
    const bHp = Math.max(0, monster.hp ?? 500), bMax = Math.max(1, monster.maxHp || 500);
    if (bHpText) bHpText.textContent = `${bHp} / ${bMax} HP`;
    const bHpFill = this.container.querySelector('#onmBossHpFill');
    if (bHpFill) bHpFill.style.width = `${Math.min(100, (bHp / bMax) * 100)}%`;

    if (Array.isArray(monster.talismans)) {
      this.attachedTalismans = monster.talismans.map(tid => {
        const cfg = ONMYOJI_TALISMAN_CONFIGS[tid] || ONMYOJI_TALISMAN_CONFIGS.blind;
        return { typeId: cfg.id, color: cfg.color, name: cfg.name };
      });
      this.debuffStacks = { blind: 0, seal: 0, corrode: 0, confuse: 0, bewitch: 0, drain: 0 };
      monster.talismans.forEach(tid => {
        const key = tid === 'bewitch' ? 'confuse' : tid;
        this.debuffStacks[key] = (this.debuffStacks[key] || 0) + 1;
      });
      this.renderAttachedTalismans();
    }
  }

  showFloatingText(mainText, colorHex, subText = '') {
    if (this.disposed) return;
    const container = this.container.querySelector('#onmFloatingTextLayer');
    if (!container) return;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;white-space:nowrap;text-align:center;z-index:55;animation:floatCombatText calc(1.25s * var(--onm-speed-mult, 1)) cubic-bezier(0.16,1,0.3,1) forwards;`;
    wrapper.innerHTML = `
      <div style="font-family:'Noto Serif TC',serif;font-weight:900;font-size:15px;padding:3px 12px;border-radius:9999px;background:rgba(0,0,0,0.85);border:1px solid ${colorHex};color:${colorHex};text-shadow:0 0 10px ${colorHex};box-shadow:0 4px 15px rgba(0,0,0,0.7);">
        ${mainText}
      </div>
      ${subText ? `<div style="margin-top:3px;font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(0,0,0,0.8);color:#fef3c7;border:1px solid rgba(255,255,255,0.15);">${subText}</div>` : ''}
    `;
    container.appendChild(wrapper);
    this.waitMs(1300).then(() => wrapper.remove());
  }

  setActionText(text) {
    const el = this.container.querySelector('#onmActionText');
    if (el) el.textContent = text;
  }

  waitMs(ms) {
    if (this.disposed || this.signal?.aborted) return Promise.resolve();
    const scaled = ms / this.speed;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        resolve();
      }, scaled);
      this.timers.add(timer);
    });
  }

  // ==========================================
  // 1 技能：五鬼攝魂符 完整四階段演出
  // ==========================================
  async playTalismanSequence(talismanConfig, isRepeat = false) {
    if (this.disposed || this.signal?.aborted) return;
    const talisman = talismanConfig || ONMYOJI_TALISMAN_CONFIGS.blind;
    this.container.style.setProperty('--onm-seal-color', talisman.color);
    this.container.style.setProperty('--onm-seal-glow', talisman.glow);

    const casterBox = this.container.querySelector('#onmCasterAvatarBox');
    const casterAura = this.container.querySelector('#onmAuraRing');
    const speech = this.container.querySelector('#onmSpeechBubble');
    const lingOverlay = this.container.querySelector('#onmLingOverlay');
    const portalRipple = this.container.querySelector('#onmPortalRipple');
    const talismanActor = this.container.querySelector('#onmActiveTalisman');
    const bossBox = this.container.querySelector('#onmBossAvatarBox');
    const bossFlash = this.container.querySelector('#onmBossHitFlash');
    const shockwaveRing = this.container.querySelector('#onmShockwaveRing');
    const implodeRing = this.container.querySelector('#onmImplodeRing');
    const sealEmblem = this.container.querySelector('#onmSealEmblem');

    // 【前奏階段 0：蓋下大尺寸去背書法「令」字敕令】
    this.setActionText(`施法前奏：Boss 正中央蓋下「令」字敕令印記！`);
    this.playSound('ling_stamp');

    if (casterBox) {
      casterBox.classList.remove('anim-caster-cast');
      void casterBox.offsetWidth;
      casterBox.classList.add('anim-caster-cast');
    }
    if (casterAura) {
      casterAura.style.transform = 'scale(1.25)';
      casterAura.style.opacity = '1';
    }
    if (speech) {
      speech.textContent = `「五鬼聽令，急急如律令！」`;
      speech.style.opacity = '1';
    }
    if (lingOverlay) {
      lingOverlay.style.animation = 'none';
      void lingOverlay.offsetWidth;
      lingOverlay.style.animation = `casterLingStampAnim calc(0.56s * var(--onm-speed-mult, 1)) cubic-bezier(0.22, 1, 0.36, 1) forwards`;
    }
    if (bossFlash) {
      bossFlash.style.backgroundColor = '#fef08a';
      bossFlash.style.opacity = '0.35';
      this.waitMs(150).then(() => { if (bossFlash) bossFlash.style.opacity = '0'; });
    }

    await this.waitMs(480);
    if (casterAura) {
      casterAura.style.transform = '';
      casterAura.style.opacity = '0.6';
    }

    // 【階段 1：去背符咒憑空出現在 Boss 頭像正上方】
    this.setActionText(`階段 1/4：去背符咒憑空出現在 Boss 正上方，凝聚靈力...`);
    this.playSound('appear');

    if (talismanActor) {
      talismanActor.innerHTML = getOnmyojiTalismanVisualHTML(talisman.color, false);
      talismanActor.style.animation = 'none';
      void talismanActor.offsetWidth;
      talismanActor.style.animation = `talismanStage1Appear calc(0.48s * var(--onm-speed-mult, 1)) cubic-bezier(0.22, 1, 0.36, 1) forwards`;
    }
    if (portalRipple) portalRipple.style.opacity = '1';

    await this.waitMs(480);

    // 【階段 2：重重貼在 Boss 頭像上，觸發震動與衝擊波】
    this.setActionText(`階段 2/4：去背符咒重重貼在 Boss 頭像上！造成猛烈震動與衝擊波！`);
    if (talismanActor) {
      talismanActor.style.animation = 'none';
      void talismanActor.offsetWidth;
      talismanActor.style.animation = `talismanStage2Slam calc(0.45s * var(--onm-speed-mult, 1)) cubic-bezier(0.22, 1, 0.36, 1) forwards`;
    }

    await this.waitMs(130);
    this.playSound('slam');
    if (portalRipple) portalRipple.style.opacity = '0';

    if (bossBox) {
      bossBox.classList.remove('anim-boss-hit-shake');
      void bossBox.offsetWidth;
      bossBox.classList.add('anim-boss-hit-shake');
    }
    if (bossFlash) {
      bossFlash.style.backgroundColor = '#fde047';
      bossFlash.style.opacity = '0.5';
      this.waitMs(130).then(() => { if (bossFlash) bossFlash.style.opacity = '0'; });
    }
    if (shockwaveRing) {
      shockwaveRing.style.borderColor = '#fbbf24';
      shockwaveRing.style.animation = 'none';
      void shockwaveRing.offsetWidth;
      shockwaveRing.style.animation = `slamShockwave calc(0.42s * var(--onm-speed-mult, 1)) ease-out forwards`;
    }

    await this.waitMs(340);

    // 【階段 3：符咒慢慢縮小、化為靈光沒入 Boss 體內】
    this.setActionText(`階段 3/4：去背符咒慢慢縮小，化為靈光沒入 Boss 體內...`);
    this.playSound('shrink');

    if (talismanActor) {
      talismanActor.style.animation = 'none';
      void talismanActor.offsetWidth;
      talismanActor.style.animation = `talismanStage3ShrinkIntoBoss calc(0.52s * var(--onm-speed-mult, 1)) cubic-bezier(0.4, 0, 0.2, 1) forwards`;
    }
    if (implodeRing) {
      implodeRing.style.animation = 'none';
      void implodeRing.offsetWidth;
      implodeRing.style.animation = `absorbImplodeRing calc(0.5s * var(--onm-speed-mult, 1)) ease-in forwards`;
    }

    await this.waitMs(500);

    // 【階段 4：印記閃耀！對應顏色五鬼印記亮起】
    this.setActionText(`階段 4/4：印記閃耀！Boss 獲得【${talisman.name}】（${talisman.shortEffect}）`);
    this.playSound('seal_flash');

    if (sealEmblem) {
      sealEmblem.innerHTML = getUnifiedSealSVG(talisman.color, talisman.glow);
      sealEmblem.style.animation = 'none';
      void sealEmblem.offsetWidth;
      sealEmblem.style.animation = `sealStage4Flash calc(0.72s * var(--onm-speed-mult, 1)) cubic-bezier(0.16, 1, 0.3, 1) forwards`;
    }

    this.showFloatingText(`✦ ${talisman.name}【${talisman.shortEffect}】`, talisman.color, isRepeat ? talisman.repeatDesc : '無回合限制印記已生效');

    await this.waitMs(700);
    if (speech) speech.style.opacity = '0';
  }

  // ==========================================
  // 2 技能：急急如律令・百符引爆
  // ==========================================
  async playDetonateSequence(count = 0, finalDamage = 0, vulnStacks = 0) {
    if (this.disposed || this.signal?.aborted) return;
    const speech = this.container.querySelector('#onmSpeechBubble');
    const casterBox = this.container.querySelector('#onmCasterAvatarBox');
    const bossBox = this.container.querySelector('#onmBossAvatarBox');
    const bossFlash = this.container.querySelector('#onmBossHitFlash');
    const shockwaveRing = this.container.querySelector('#onmShockwaveRing');
    const layer = this.container.querySelector('#onmAttachedLayer');

    if (casterBox) {
      casterBox.classList.remove('anim-caster-cast');
      void casterBox.offsetWidth;
      casterBox.classList.add('anim-caster-cast');
    }

    if (count === 0) {
      if (speech) {
        speech.textContent = `「急急如律令・引爆！」`;
        speech.style.opacity = '1';
      }
      this.setActionText(`【百符引爆】目標身上沒有任何符咒（0 張），不造成任何傷害！`);
      this.showFloatingText(`無符咒可引爆 (0 傷害)`, '#94a3b8', '需先施放【五鬼攝魂符】附著符咒');
      await this.waitMs(800);
      if (speech) speech.style.opacity = '0';
      return;
    }

    if (speech) {
      speech.textContent = `「萬符歸宗・急急如律令・爆！！」`;
      speech.style.opacity = '1';
    }

    const attachedEls = Array.from(this.container.querySelectorAll('.attached-talisman'));

    // 【百符引爆 1/3：敕令鎖定，全體符咒共鳴烈焰橘光】
    this.setActionText(`【百符引爆 1/3】敕令鎖定！Boss 身上的 ${count} 張符咒產生烈焰共鳴...`);
    this.playSound('detonate_lock');
    attachedEls.forEach(el => el.classList.add('anim-talisman-lock-on'));

    await this.waitMs(280);

    // 【百符引爆 2/3：旋轉聚集！所有符咒盤旋捲入中心】
    this.setActionText(`【百符引爆 2/3】旋轉聚集！所有符咒高速盤旋縮小，捲入 Boss 正中央...`);
    this.playSound('detonate_gather');

    // 核心聚能靈球
    const core = document.createElement('div');
    core.id = 'mega-gather-core';
    core.style.cssText = `animation:megaCoreCharge calc(0.68s * var(--onm-speed-mult, 1)) cubic-bezier(0.22,1,0.36,1) forwards;`;
    core.innerHTML = `
      <div style="width:100%;height:100%;border-radius:50%;border:2px dashed #fde047;background:radial-gradient(circle,#ffffff 0%,#fb923c 45%,#f97316 70%,transparent 85%);box-shadow:0 0 22px #f97316;display:flex;align-items:center;justify-content:center;">
        <div style="width:20px;height:20px;border-radius:50%;background:#ffffff;box-shadow:0 0 12px #ffffff;"></div>
      </div>
    `;
    layer.appendChild(core);

    attachedEls.forEach(el => {
      el.classList.remove('anim-talisman-lock-on');
      el.classList.add('anim-talisman-gather-center');
    });

    await this.waitMs(680);
    core.remove();

    // 【百符引爆 3/3：轟！！中心引爆與符咒脫落銷毀】
    this.setActionText(`【百符引爆 3/3】轟！！匯聚的 ${count} 道符咒在中心瞬間引爆！`);
    this.playSound('detonate_final');

    const nova = document.createElement('div');
    nova.className = 'mega-explosion-nova';
    nova.style.cssText = `animation:megaExplosionNova calc(0.48s * var(--onm-speed-mult, 1)) cubic-bezier(0.16,1,0.3,1) forwards;`;
    nova.innerHTML = `
      <div style="position:relative;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle,#ffffff 0%,#fef08a 26%,#fb923c 55%,#ea580c 75%,transparent 88%);box-shadow:0 0 32px #f97316;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:6px;border-radius:50%;border:2px solid rgba(254,240,138,0.9);"></div>
        <div style="position:absolute;inset:-8px;border-radius:50%;border:1px dashed rgba(251,146,60,0.8);"></div>
      </div>
    `;
    layer.appendChild(nova);
    this.waitMs(520).then(() => nova.remove());

    attachedEls.forEach((el, idx) => {
      el.classList.remove('anim-talisman-gather-center');
      const angle = (idx / Math.max(1, attachedEls.length)) * Math.PI * 2;
      const dist = 36 + Math.random() * 24;
      const bx = Math.round(Math.cos(angle) * dist);
      const by = Math.round(Math.sin(angle) * dist - 12);
      el.style.setProperty('--bx', `${bx}px`);
      el.style.setProperty('--by', `${by}px`);
      el.style.setProperty('--br1', `${(idx % 2 === 0 ? 1 : -1) * 130}deg`);
      el.style.setProperty('--br2', `${(idx % 2 === 0 ? 1 : -1) * 280}deg`);
      el.classList.add('anim-talisman-fall-destroy');
    });

    if (bossBox) {
      bossBox.classList.remove('anim-boss-detonate-shake');
      void bossBox.offsetWidth;
      bossBox.classList.add('anim-boss-detonate-shake');
    }
    if (bossFlash) {
      bossFlash.style.backgroundColor = '#f97316';
      bossFlash.style.opacity = '0.65';
      this.waitMs(180).then(() => { if (bossFlash) bossFlash.style.opacity = '0'; });
    }
    if (shockwaveRing) {
      shockwaveRing.style.borderColor = '#f97316';
      shockwaveRing.style.animation = 'none';
      void shockwaveRing.offsetWidth;
      shockwaveRing.style.animation = `slamShockwave calc(0.45s * var(--onm-speed-mult, 1)) ease-out forwards`;
    }

    this.showFloatingText(
      `💥 百符引爆 -${finalDamage} HP`,
      '#f97316',
      `有效引爆 ${Math.min(10, count)} 張符咒${vulnStacks > 0 ? ` · 蝕體易傷 +${vulnStacks * 10}%` : ''} · 全數脫落銷毀`
    );

    await this.waitMs(680);
    this.attachedTalismans = [];
    this.debuffStacks = { blind: 0, seal: 0, corrode: 0, confuse: 0, bewitch: 0, drain: 0 };
    this.renderAttachedTalismans();
    if (speech) speech.style.opacity = '0';
  }

  // ==========================================
  // 普通攻擊：引符術 飛行動畫
  // ==========================================
  async playBasicSequence(damage = 10) {
    if (this.disposed || this.signal?.aborted) return;
    const speech = this.container.querySelector('#onmSpeechBubble');
    const casterBox = this.container.querySelector('#onmCasterAvatarBox');
    const bossBox = this.container.querySelector('#onmBossAvatarBox');
    const bossFlash = this.container.querySelector('#onmBossHitFlash');
    const shockwaveRing = this.container.querySelector('#onmShockwaveRing');

    this.setActionText(`陰陽師念動真言，施展【引符術】靈符如電飛射！`);
    if (speech) {
      speech.textContent = `「敕令・引符術！」`;
      speech.style.opacity = '1';
    }
    if (casterBox) {
      casterBox.classList.remove('anim-caster-cast');
      void casterBox.offsetWidth;
      casterBox.classList.add('anim-caster-cast');
    }

    this.playSound('appear');

    // 建立飛行符咒
    const grid = this.container.querySelector('.main-combat-grid');
    const proj = document.createElement('div');
    proj.className = 'talisman-projectile';
    proj.style.cssText = `left:25%;top:45%;animation:talismanBasicFly calc(0.42s * var(--onm-speed-mult, 1)) ease-in forwards;`;
    proj.innerHTML = getOnmyojiTalismanVisualHTML('#f59e0b', false);
    grid.appendChild(proj);

    await this.waitMs(380);
    proj.remove();
    this.playSound('slam');

    if (bossBox) {
      bossBox.classList.remove('anim-boss-hit-shake');
      void bossBox.offsetWidth;
      bossBox.classList.add('anim-boss-hit-shake');
    }
    if (bossFlash) {
      bossFlash.style.backgroundColor = '#fef08a';
      bossFlash.style.opacity = '0.4';
      this.waitMs(140).then(() => { if (bossFlash) bossFlash.style.opacity = '0'; });
    }
    if (shockwaveRing) {
      shockwaveRing.style.borderColor = '#fbbf24';
      shockwaveRing.style.animation = 'none';
      void shockwaveRing.offsetWidth;
      shockwaveRing.style.animation = `slamShockwave calc(0.38s * var(--onm-speed-mult, 1)) ease-out forwards`;
    }

    this.showFloatingText(`💥 引符術 -${damage} HP`, '#fbbf24', '魔法打擊');

    await this.waitMs(450);
    if (speech) speech.style.opacity = '0';
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (e) {}
      this.audioCtx = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

function buildOnmyojiPresentationPlan(step = {}) {
  const action = step.actionId || 'basic';
  const before = step.hpSnapshotBefore || {};
  const after = step.hpSnapshot || {};
  const results = step.results || [];
  const outcome = step.outcome || {};

  let talisman = null;
  const talismanTypeMatch = (outcome.type || '').replace('talisman_', '');
  if (step.rolledTalisman && ONMYOJI_TALISMAN_CONFIGS[step.rolledTalisman]) {
    talisman = ONMYOJI_TALISMAN_CONFIGS[step.rolledTalisman];
  } else if (step.talisman && ONMYOJI_TALISMAN_CONFIGS[step.talisman]) {
    talisman = ONMYOJI_TALISMAN_CONFIGS[step.talisman];
  } else if (ONMYOJI_TALISMAN_CONFIGS[talismanTypeMatch]) {
    talisman = ONMYOJI_TALISMAN_CONFIGS[talismanTypeMatch];
  } else if (step.visualEvents) {
    const atk = step.visualEvents.find(v => v.label && ['障目符', '封勁符', '蝕體符', '惑心符', '抽髓符'].includes(v.label));
    if (atk) {
      const map = { '障目符': 'blind', '封勁符': 'seal', '蝕體符': 'corrode', '惑心符': 'confuse', '抽髓符': 'drain' };
      talisman = ONMYOJI_TALISMAN_CONFIGS[map[atk.label]];
    }
  }
  if (!talisman && action === 'onm_talisman') {
    talisman = ONMYOJI_TALISMAN_CONFIGS.blind;
  }

  const talismansBefore = before.monster?.talismans || [];
  const talismansAfter = after.monster?.talismans || [];
  const rawCountBefore = talismansBefore.length;
  const countBefore = action === 'onm_detonate' ? Math.min(rawCountBefore, 10) : rawCountBefore;
  const countAfter = talismansAfter.length;
  const isRepeat = talisman ? talismansBefore.includes(talisman.id) : false;

  const damageResult = results.find(r => r.kind === 'damage' && r.targetId === 'monster');
  const finalDamage = damageResult ? (damageResult.finalDamage ?? damageResult.hpDamage ?? 0) : (step.finalDamage || 0);

  const vulnStacks = talismansBefore.filter(t => t === 'corrode').length;

  return {
    action,
    talisman,
    isRepeat,
    countBefore,
    countAfter,
    finalDamage,
    vulnStacks,
    before,
    after,
    results,
    outcome
  };
}

let onmyojiPreloadPromise = null;
function preloadOnmyojiAssets() {
  if (typeof window === 'undefined') return Promise.resolve();
  return onmyojiPreloadPromise ||= Promise.all([
    '/assets/Onmyoji-1.png',
    '/assets/Onmyoji-2.png',
    '/photo/Onmyoji.webp'
  ].map(p => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = onmyojiAsset(p);
    });
  }));
}

async function playOnmyojiPresentation(step, context = {}) {
  await preloadOnmyojiAssets();
  const signal = context.signal || context.controller?.signal;
  if (signal?.aborted) return;

  const stage = typeof getOrCreateCombatStage === 'function'
    ? getOrCreateCombatStage()
    : document.querySelector('.combat-stage') || document.body;

  const plan = buildOnmyojiPresentationPlan(step);
  const engine = new OnmyojiPresentationEngine(stage, {
    step,
    signal,
    speed: context.speed || 1,
    reduced: context.reducedMotion,
    audioScope: context.audioScope
  });

  const wait = ms => new Promise(res => {
    if (signal?.aborted) return res();
    const t = setTimeout(res, ms / (context.speed || 1));
    signal?.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });

  const beat = (name, data = {}) => context.onTiming?.(name, { step, ...data });
  const apply = snapshot => {
    if (signal?.aborted || engine.disposed) return;
    engine.syncSnapshot(snapshot);
    if (typeof applyHpSnapshot === 'function') applyHpSnapshot(snapshot);
  };

  try {
    engine.syncSnapshot(plan.before);
    beat('onmyoji_action_start');

    if (plan.action === 'basic') {
      await engine.playBasicSequence(plan.finalDamage);
      beat('impact', { damage: plan.finalDamage });
    } else if (plan.action === 'onm_talisman') {
      await engine.playTalismanSequence(plan.talisman, plan.isRepeat);
      if (plan.finalDamage > 0) beat('impact', { damage: plan.finalDamage });
    } else if (plan.action === 'onm_detonate') {
      await engine.playDetonateSequence(plan.countBefore, plan.finalDamage, plan.vulnStacks);
      if (plan.finalDamage > 0) beat('impact', { damage: plan.finalDamage });
    }

    if (signal?.aborted) return;
    apply(plan.after);
    beat('hp_update');
    await wait(450);
    beat('action_complete');
  } finally {
    engine.dispose();
  }
}

const ONMYOJI_EXPORTS = {
  OnmyojiPresentationEngine,
  playOnmyojiPresentation,
  preloadOnmyojiAssets,
  buildOnmyojiPresentationPlan,
  ONMYOJI_TALISMAN_CONFIGS
};

if (typeof window !== 'undefined') {
  Object.assign(window, ONMYOJI_EXPORTS);
}
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, ONMYOJI_EXPORTS);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ONMYOJI_EXPORTS;
}
