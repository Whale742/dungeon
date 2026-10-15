// Augur Skill Presentation (卜者技能演出)
// Visuals faithful to public/assets/augur_skill_prototype.html
// Hand 1 (aug_bind) -> assets/augur1.png
// Hand 2 (aug_reckon) -> assets/augur2.png

const AUGUR_IMAGE_URLS = Object.freeze([
  'assets/augur1.png',
  'assets/augur2.png',
  'photo/Augur.webp'
]);

let augurAssetsPromise = null;
function preloadAugurAssets() {
  if (augurAssetsPromise) return augurAssetsPromise;
  augurAssetsPromise = Promise.all(AUGUR_IMAGE_URLS.map(src => {
    if (window.assetRegistry) return assetRegistry.preloadImage(src);
    const img = new Image();
    img.src = src;
    return img.decode ? img.decode().then(() => img).catch(() => img) : Promise.resolve(img);
  }));
  return augurAssetsPromise;
}

if (typeof window !== 'undefined') {
  window.addEventListener('studio:content-ready', () => { augurAssetsPromise = null; });
}

// Math and color constants
const AUGUR_C = Object.freeze({
  gold: '#e2c68b',
  white: '#fff4d7',
  red: '#cf5576',
  dark: '#621b43',
  violet: '#b69ce6',
  cyan: '#b5dce4'
});

const starPath = 'M50 18 55 43 73 27 58 46 83 50 58 54 73 73 55 58 50 83 45 58 27 73 42 54 17 50 42 46 27 27 45 43Z';

function augurCardArt(face = 'back') {
  const stroke = face === 'back' ? '#cdb27b' : 'currentColor';
  const drawing = face === 'omen'
    ? '<path d="m50 34 8 22 24-5-17 19 12 23-25-9-20 17 1-26-23-12 26-6Z" fill="none" stroke-width="1.6"/><path d="M53 22 46 48 54 58 44 72 56 84 48 114M29 43l6 10m37 29 7 9" stroke-width="2"/><path d="m24 30 9-9m34 0 9 9M24 112l9 9m34 0 9-9"/>'
    : face === 'reverse'
      ? '<path d="M26 62q24-43 48 0-24 44-48 0Z"/><circle cx="50" cy="62" r="10"/><path d="M50 34v56M28 105l22-14 22 14M34 18h32M37 22l13 16 13-16"/><path d="m50 46 3 11 11 5-11 4-3 13-3-13-11-4 11-5Z" fill="currentColor" stroke="none"/>'
      : `<g transform="translate(0 15)"><circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="34" stroke-dasharray="1 5"/><path d="${starPath}" fill="${face === 'back' ? '#bca16c' : 'currentColor'}" stroke="none"/></g><path d="M50 15v10m0 80v10M20 65h8m44 0h8"/>`;
  return `<svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${stroke}" stroke-width=".8"><rect x="4" y="4" width="92" height="142" rx="3"/><rect x="9" y="9" width="82" height="132" rx="20" opacity=".65"/><path d="M10 28h10V10m60 0v18h10M10 122h10v18m60 0v-18h10"/><path d="m50 6 4 4-4 4-4-4Zm0 130 4 4-4 4-4-4Z" fill="${stroke}" stroke="none"/>${drawing}<circle cx="50" cy="126" r="2"/><path d="M38 126h7m10 0h7"/></svg>`;
}

function fillAugurCard(el, state = 'empty', gilded = false) {
  el.dataset.state = state;
  el.classList.toggle('gilded', gilded);
  el.innerHTML = `<div class="card-inner"><div class="card-face card-back">${augurCardArt('back')}</div><div class="card-face card-front">${augurCardArt(state === 'empty' ? 'upright' : state)}</div></div>`;
}

function isAugurAction(step) {
  return step?.sourceRole === 'augur' && ['basic', 'aug_bind', 'aug_reckon'].includes(step.actionId || step.skillId);
}

class AugurPresentationEngine {
  constructor(container, options = {}) {
    this.container = container;
    this.signal = options.signal;
    this.speed = options.speed || 1;
    this.reduced = options.reduced || false;
    this.audio = options.audioScope || { play: () => {} };
    this.animations = new Set();
    this.raf = 0;
    this.running = false;
    this.initDOM();
  }

  initDOM() {
    this.container.classList.add('augur-stage', 'augur-fx-owner');
    this.container.innerHTML = `
      <svg class="architecture" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="augur-archglow"><stop stop-color="#b49d6744"/><stop offset="1" stop-color="#b49d6700"/></radialGradient>
        </defs>
        <g fill="none" stroke="#99835e" stroke-width=".8" opacity=".32">
          <path d="M90 720V265Q90 40 315 40T540 265v455M740 720V265Q740 40 965 40t225 225v455"/>
          <path d="M110 720V270Q110 65 315 65t205 205v450M760 720V270Q760 65 965 65t205 205v450"/>
          <path d="M55 720V270Q55 5 315 5t260 265v450M705 720V270Q705 5 965 5t260 265v450"/>
          <path d="M0 630h1280M0 645h1280M0 660h1280M200 720l310-90m570 90-310-90"/>
          <circle cx="610" cy="340" r="262" stroke-dasharray="1 15"/>
          <path d="M510 45h220M580 5v55m60-55v55m60-55v55"/>
        </g>
        <g fill="#cfbb87" opacity=".5">
          <circle cx="316" cy="151" r="1.5"/><circle cx="617" cy="160" r="1"/><circle cx="758" cy="220" r="1"/><circle cx="903" cy="120" r="1.6"/><circle cx="501" cy="204" r="1"/><circle cx="671" cy="402" r="1"/><circle cx="670" cy="76" r="1"/>
        </g>
        <ellipse cx="590" cy="660" rx="350" ry="65" fill="url(#augur-archglow)"/>
      </svg>
      <div class="grain"></div>
      <div class="shade" id="augurShade"></div>
      <div class="battle-head">
        <div class="battle-meta"><span class="dot"></span><span id="augurBattleStatus">命運已建立</span><strong id="augurRoundLabel">ROUND</strong></div>
        <div class="party" id="augurParty"><span class="party-label">冒險小隊</span></div>
      </div>
      <div class="actor augur" id="augurActor">
        <div class="portrait-frame">
          <div class="portrait-anchor" id="augurAnchor"><img id="augurPortrait" src="photo/Augur.webp" alt="卜者"></div>
        </div>
        <span class="death-label">隕 落</span>
        <h2 class="actor-title"><small>THE WEAVER OF FATE</small>卜者</h2>
        <div class="actor-health"><span>生命</span><span id="augurHpText">70 / 70</span></div>
        <div class="hp-track"><span id="augurHpBar" style="width:100%"></span></div>
        <div class="blessing-note" id="augurBlessingLabel">尚未建立觀測</div>
      </div>
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
            <img class="orb-target" id="augurOrbTarget" alt="水晶球內的觀測目標">
            <svg class="orb-dust" viewBox="0 0 100 100" fill="#f2db9f" aria-hidden="true">
              <circle cx="28" cy="33" r=".55"/><circle cx="61" cy="22" r=".4"/><circle cx="82" cy="48" r=".65"/><circle cx="36" cy="81" r=".45"/><circle cx="21" cy="60" r=".7"/><circle cx="67" cy="69" r=".5"/>
              <path d="m72 34 .6 3 3 .6-3 .6-.6 3-.6-3-3-.6 3-.6Zm-33 9 .5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5Z"/>
            </svg>
            <div class="debt-haze" id="augurDebtHaze"></div>
            <svg class="debt-seals" id="augurDebtSeals" viewBox="0 0 100 100" aria-hidden="true">
              <path d="M16 61 29 55 34 65 28 71 38 79 42 95"/>
              <path class="seal-mid" d="M34 65l13-9 8 9-1 10 12 5 4 12M65 94l7-22 12-10-8-12 10-7"/>
              <path class="seal-high" d="M6 43l19-5 3-10 13 9-1-19M72 72l-13-4-9 6M84 62l11 2"/>
              <path class="chains" d="M14 68Q42 47 67 84M25 79Q40 64 74 65M55 97Q55 79 90 65M14 53Q39 35 47 29"/>
              <path d="m32 78 2-4 2 4-2 4Zm38-20 3-5 3 5-3 5ZM57 85l2-3 2 3-2 3Z" fill="#c29975" stroke="none"/>
            </svg>
            <svg class="orb-facets" id="augurOrbFacets" viewBox="0 0 100 100" aria-hidden="true">
              <path d="m50 0 29 12 18 31-7 34-30 22-37-9L2 58 10 23ZM10 23l32 5 37-16-7 35 25-4-22 24 15 10-33-3 3 25-18-28-19 19 2-32L2 58l23-13ZM42 28l30 19-15 27-32-29Z"/>
            </svg>
            <div class="chromatic"></div>
            <div class="orb-core" id="augurOrbCore"></div>
            <svg class="seal-release" id="augurSealRelease" viewBox="0 0 100 100" aria-hidden="true">
              <path d="M16 61 29 55 34 65 28 71 38 79 42 95M34 65l13-9 8 9-1 10 12 5 4 12M65 94l7-22 12-10-8-12 10-7"/>
            </svg>
            <div class="glass"></div>
            <div class="orb-veil" id="augurOrbVeil"></div>
          </div>
          <div class="equator"></div>
          <div class="equator second"></div>
          <svg class="contract-seal" id="augurContractSeal" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="48" stroke-dasharray="7 3 1 4"/>
            <path d="M50 1 56 7 50 13 44 7ZM99 50 93 56 87 50 93 44ZM50 99 44 93 50 87 56 93ZM1 50 7 44 13 50 7 56Z"/>
          </svg>
          <div class="orbit-layer" id="augurOrbitLayer"></div>
        </div>
        <div class="orb-caption">
          <strong id="augurCardStateLabel">空 象</strong>
          <span id="augurOrbObservedLabel">等待命運的回聲</span>
        </div>
      </div>
      <div class="actor boss" id="augurBossActor">
        <div class="portrait-frame">
          <div class="portrait-anchor" id="augurBossAnchor"><img id="augurBossPortrait" src="photo/boss.webp" alt="首領"></div>
        </div>
        <span class="death-label">討 伐</span>
        <div class="omen-mark" id="augurOmenMark"></div>
        <h2 class="actor-title" id="augurBossName"><small>BOSS</small>深淵首領</h2>
        <div class="actor-health"><span>首領</span><span id="augurBossHpText">500 / 500</span></div>
        <div class="hp-track"><span id="augurBossHpBar" style="width:100%"></span></div>
        <div class="status-badges" id="augurBossBadges"></div>
      </div>
      <div class="debt-ledger" id="augurDebtLedger">
        <div class="debt-label"><span>承負 · 命債</span><b id="augurDebtText">0 / 60</b></div>
        <div class="debt-ticks"><span id="augurDebtBar" style="width:0"></span></div>
        <div class="ledger-items" id="augurLedgerItems"><span>封印純淨</span></div>
      </div>
      <div class="cutin" id="augurCutin"><img id="augurCutinPortrait" src="photo/Augur.webp" alt=""></div>
      <div class="effect-layer" id="augurEffectLayer"></div>
      <canvas class="fx" id="augurFxCanvas" aria-hidden="true"></canvas>
      <div class="effect-cards" id="augurEffectCards"></div>
      <div class="float-layer" id="augurFloatLayer" aria-hidden="true"></div>
      <div class="caption" id="augurCaption">
        <div class="caption-kicker" id="augurCaptionKicker">THE AUGURY</div>
        <h2 id="augurCaptionTitle"></h2>
        <p id="augurCaptionText"></p>
      </div>
      <div class="whiteout" id="augurWhiteout" aria-hidden="true"></div>
    `;

    this.canvas = this.container.querySelector('#augurFxCanvas');
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.orbitCards = [];
    const orbitLayer = this.container.querySelector('#augurOrbitLayer');
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('div');
      c.className = 'card orbit-card';
      fillAugurCard(c);
      orbitLayer.appendChild(c);
      this.orbitCards.push(c);
    }

    const contractCard = this.container.querySelector('#augurContractCard');
    fillAugurCard(contractCard, 'omen');
    contractCard.querySelector('.card-inner').style.transform = 'rotateY(180deg) rotateZ(180deg)';

    const omenMark = this.container.querySelector('#augurOmenMark');
    omenMark.innerHTML = augurCardArt('omen');

    this.measure();
  }

  measure() {
    const r = this.container.getBoundingClientRect();
    this.bounds = {
      w: r.width || 1000,
      h: r.height || 562,
      orb: { x: (r.width || 1000) * 0.45, y: (r.height || 562) * 0.49, w: (r.width || 1000) * 0.185, h: (r.width || 1000) * 0.185 },
      augur: { x: (r.width || 1000) * 0.175, y: (r.height || 562) * 0.49, w: (r.width || 1000) * 0.24, h: (r.width || 1000) * 0.24 },
      boss: { x: (r.width || 1000) * 0.835, y: (r.height || 562) * 0.49, w: (r.width || 1000) * 0.23, h: (r.width || 1000) * 0.23 }
    };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.bounds.w * dpr);
    this.canvas.height = Math.round(this.bounds.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  coord(a) {
    if (typeof a === 'string') return this.bounds[a] || this.bounds.orb;
    return a;
  }

  // Animation helper primitives
  path(points, color, width = 1, alpha = 1, glow = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = this.reduced ? 0 : glow;
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
  }

  star(p, r = 20, color = AUGUR_C.white, alpha = 1, rotation = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rotation);
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = this.reduced ? 0 : r * .6;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 - Math.PI / 2;
      const rr = i % 2 ? r * .12 : r * (i % 4 === 0 ? 1 : .52);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  circle(p, r, color, alpha = 1, width = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  curve(a, b, color, width, alpha, bend = -40, progress = 1) {
    a = this.coord(a);
    b = this.coord(b);
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40 * progress;
      pts.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * bend
      });
    }
    this.path(pts, color, width, alpha, 7);
    return pts;
  }

  motes(p, u, count = 26, color = AUGUR_C.gold, spread = 80, inward = false) {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996;
      const seed = (Math.sin(i * 81.31) * 9000) % 1;
      const dist = (.3 + Math.abs(seed) * .7) * spread * (inward ? 1 - u : u);
      const x = p.x + Math.cos(a + u * .3) * dist;
      const y = p.y + Math.sin(a + u * .3) * dist * .8;
      this.star({ x, y }, i % 6 === 0 ? 3 : 1.4, color, Math.sin(u * Math.PI) * .8, i);
    }
  }

  beam(u, strong = false) {
    const a = this.bounds.orb, b = this.bounds.boss;
    const prism = { x: a.x + (b.x - a.x) * .18, y: a.y + (b.y - a.y) * .18 };
    const merge = { x: a.x + (b.x - a.x) * .62, y: a.y + (b.y - a.y) * .62 };
    const en = Math.min(u / .1, (1 - u) / .1, 1);
    const spread = Math.min(this.bounds.w * .035, 40) * (strong ? 1.35 : 1);
    if (this.reduced) {
      this.path([a, b], AUGUR_C.white, strong ? 3 : 1.5, en * .65, 0);
      this.star(b, 20, AUGUR_C.white, en);
      return;
    }
    const colors = ['#ff9aa9', '#ffd399', '#f8efb5', '#b0e3c4', '#9fdced', '#a9b2ff', '#d4a9eb'];
    this.path([a, prism], AUGUR_C.white, strong ? 5 : 2.6, en, 17);
    for (let i = 0; i < 7; i++) {
      const mid = { x: prism.x + (merge.x - prism.x) * .42, y: prism.y + (merge.y - prism.y) * .42 + (i - 3) * spread / 3 };
      this.path([prism, mid, merge, b], colors[i], strong ? 1.8 : .9, en * .85, 4);
    }
    this.path([merge, b], AUGUR_C.white, strong ? 7 : 3, en, 22);
    this.path([merge, b], '#ffffff', strong ? 2.4 : 1.2, en, 0);
    const pr = strong ? 19 : 12;
    this.path([{ x: prism.x, y: prism.y - pr }, { x: prism.x + pr * .6, y: prism.y }, { x: prism.x, y: prism.y + pr }, { x: prism.x - pr * .6, y: prism.y }, { x: prism.x, y: prism.y - pr }], AUGUR_C.cyan, 1, en, 10);
    this.star(b, (strong ? 65 : 35) * (1 - u * .35), AUGUR_C.white, en, Math.PI / 8);
    this.motes(b, u, strong ? 36 : 18, '#d5bcf1', strong ? 120 : 70);
  }

  resistance(u) {
    const p = this.bounds.boss, r = (p.w || 120) * .61;
    const en = Math.min(u / .16, (1 - u) / .16, 1);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = en;
    ctx.strokeStyle = AUGUR_C.gold;
    ctx.lineWidth = .9;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, move = Math.max(0, u - .35) * 25;
      ctx.save();
      ctx.translate(Math.cos(a) * move, Math.sin(a) * move);
      ctx.beginPath();
      ctx.arc(0, 0, r, a + .04, a + Math.PI / 4 - .04);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    this.star(p, 40, AUGUR_C.white, Math.sin(u * Math.PI) * .7, Math.PI / 8);
  }

  repayFX(u, amount) {
    const o = this.bounds.orb, r = o.w * .43;
    if (!amount) return;
    const sealRelease = this.container.querySelector('#augurSealRelease');
    if (sealRelease) {
      sealRelease.style.opacity = String(Math.sin(u * Math.PI));
      sealRelease.style.strokeDashoffset = String((1 - u) * 170);
    }
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3, p = { x: o.x + Math.cos(a) * r * (1 - u), y: o.y + Math.sin(a) * r * (1 - u) };
      this.star(p, 4, AUGUR_C.gold, Math.sin(u * Math.PI));
    }
    this.circle(o, r * (1 - u * .5), AUGUR_C.gold, Math.sin(u * Math.PI) * .45);
    this.motes(o, u, 24, AUGUR_C.gold, r, true);
    this.star(o, 22 * Math.sin(u * Math.PI), AUGUR_C.white, Math.sin(u * Math.PI));
  }

  contractFX(u) {
    const a = this.bounds.orb, b = this.bounds.boss;
    const en = Math.min(u / .16, (1 - u) / .16, 1);
    this.curve(a, b, AUGUR_C.dark, 4, en * .6, -26);
    this.curve(a, b, AUGUR_C.red, 1.1, en, -26);
    const t = 1 - Math.pow(1 - u, 3), p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * -26 };
    this.star(p, 10, AUGUR_C.red, en);
    if (u > .58) {
      const v = (u - .58) / .42;
      this.star(b, 28, AUGUR_C.red, Math.min(v / .16, (1 - v) / .16, 1), Math.PI / 8);
      this.circle(b, 22 + v * 10, AUGUR_C.red, 1 - v, .7);
    }
  }

  crystalRadiance(power, time, fade = 1) {
    const o = this.bounds.orb, r = o.w * .5, p = Math.max(0, Math.min(1, power)), alpha = Math.max(0, Math.min(1, fade));
    const sphere = this.container.querySelector('#augurSphere');
    const orbCore = this.container.querySelector('#augurOrbCore');
    const orbAura = this.container.querySelector('#augurOrbAura');
    const orbRig = this.container.querySelector('#augurOrbRig');
    if (sphere) sphere.style.filter = `brightness(${1 + p * (this.reduced ? 1 : 2.6)}) saturate(${1 + p * .55})`;
    if (orbCore) {
      orbCore.style.opacity = String(.45 + p * .55);
      orbCore.style.transform = `translate(-50%,-50%) scale(${1 + p * 21})`;
    }
    if (orbAura) orbAura.style.opacity = String(.6 + p * .4);
    if (!this.reduced && orbRig) orbRig.style.transform = `scale(${1 + p * .035})`;

    const colors = [[255, 136, 161], [255, 202, 126], [254, 242, 163], [142, 232, 205], [139, 202, 255], [183, 150, 246], [235, 175, 244]];
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    const glowRadius = r * (1.2 + p * (this.reduced ? .8 : 3.7));
    const glow = ctx.createRadialGradient(o.x, o.y, r * .12, o.x, o.y, glowRadius);
    glow.addColorStop(0, `rgba(255,255,255,${.15 + p * .85})`);
    glow.addColorStop(.22, `rgba(255,249,241,${p * .88})`);
    glow.addColorStop(.5, `rgba(223,218,255,${p * .30})`);
    glow.addColorStop(1, 'rgba(210,205,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(o.x - glowRadius, o.y - glowRadius, glowRadius * 2, glowRadius * 2);

    if (!this.reduced) {
      const length = r * (1.3 + p * 6.8), width = r * (.025 + p * .1);
      for (let i = 0; i < 14; i++) {
        const color = colors[i % 7], a = i * Math.PI / 7 + time * .065;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(a);
        const spectral = ctx.createLinearGradient(r * .5, 0, length, 0);
        spectral.addColorStop(0, `rgba(${color},${p * .72})`);
        spectral.addColorStop(.55, `rgba(${color},${p * .44})`);
        spectral.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = spectral;
        ctx.beginPath();
        ctx.moveTo(r * .38, 0);
        ctx.lineTo(length, -width * 2);
        ctx.lineTo(length, width * 1.25);
        ctx.closePath();
        ctx.fill();

        const white = ctx.createLinearGradient(r * .25, 0, length * .88, 0);
        white.addColorStop(0, `rgba(255,255,255,${p * .92})`);
        white.addColorStop(.45, `rgba(255,255,255,${p * .56})`);
        white.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = white;
        ctx.beginPath();
        ctx.moveTo(r * .2, 0);
        ctx.lineTo(length * .88, -width * .27);
        ctx.lineTo(length * .88, width * .27);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
    this.star(o, r * (.3 + p * 1.4), '#ffffff', p * alpha * (this.reduced ? .25 : .8), Math.PI / 8);
  }

  showCaption(title, text, kicker = 'THE AUGURY', negative = false) {
    const el = this.container.querySelector('#augurCaption');
    if (!el) return;
    el.style.opacity = '1';
    el.classList.toggle('negative', negative);
    this.container.querySelector('#augurCaptionTitle').textContent = title;
    this.container.querySelector('#augurCaptionText').textContent = text;
    this.container.querySelector('#augurCaptionKicker').textContent = kicker;
  }

  hideCaption() {
    const el = this.container.querySelector('#augurCaption');
    if (el) el.style.opacity = '0';
  }

  number(anchor, value, type = 'magic', label = '') {
    if (value === 0 && type !== 'note') return;
    const node = document.createElement('div');
    node.className = 'float-number ' + type;
    node.innerHTML = `${value}<small>${label}</small>`;
    this.container.querySelector('#augurFloatLayer').appendChild(node);
    const p = this.coord(anchor);
    node.style.left = p.x + 'px';
    node.style.top = (p.y - (p.h || 50) * .2) + 'px';
    node.style.opacity = '1';
    node.style.transform = 'translate(-50%, -50%)';
    setTimeout(() => {
      node.style.transition = 'all .45s ease-out';
      node.style.top = (p.y - 45) + 'px';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 450);
    }, 400);
  }

  // Sweep Hand (Skill 1: aug_bind) using assets/augur1.png
  sweepHand(duration = 900) {
    const layer = this.container.querySelector('#augurEffectLayer');
    const hand = document.createElement('img');
    hand.className = 'hand observing-hand';
    hand.src = 'assets/augur1.png';
    hand.alt = '';
    layer.appendChild(hand);

    const o = this.bounds.orb, w = o.w * 1.45, r = o.w * .5;
    hand.style.width = w + 'px';
    hand.style.left = (o.x - w * .67 - r * .9) + 'px';
    hand.style.top = (o.y - r - w * .68 - 5) + 'px';
    hand.style.transformOrigin = '67% 82%';
    hand.style.opacity = '0';

    const start = performance.now();
    return new Promise(resolve => {
      const step = now => {
        if (this.signal?.aborted) { hand.remove(); return resolve(); }
        const elapsed = (now - start) * (this.speed || 1);
        const u = Math.min(1, elapsed / duration);
        const v = this.reduced ? .5 : u * u * (3 - 2 * u);
        const a = Math.min(u / .16, (1 - u) / .16, 1);

        hand.style.left = (o.x - w * .67 + (-r * .9 + r * 1.8 * v)) + 'px';
        hand.style.top = (o.y - r - w * .68 - 5 - (this.reduced ? 0 : Math.sin(u * Math.PI) * r * .1)) + 'px';
        hand.style.transform = `rotate(${this.reduced ? 0 : (-8 + 17 * v)}deg)`;
        hand.style.opacity = String(a);
        hand.style.filter = `drop-shadow(0 5px 9px #070511) brightness(${1 + Math.sin(u * Math.PI) * .25})`;

        if (!this.reduced) {
          const trail = [];
          for (let i = 0; i < 15; i++) {
            const t = Math.max(0, v - .28) + i / 14 * Math.min(.28, v);
            trail.push({ x: o.x + (-r * .9 + r * 1.8 * t), y: o.y - r - 4 - Math.sin(t * Math.PI) * r * .1 });
          }
          this.path(trail, AUGUR_C.gold, .8, a * .7, 5);
        }

        if (u < 1) requestAnimationFrame(step);
        else { hand.remove(); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  // Cup Hands (Skill 2: aug_reckon) using assets/augur2.png
  cupHands(duration = 2000) {
    const layer = this.container.querySelector('#augurEffectLayer');
    const left = document.createElement('img');
    const right = document.createElement('img');
    left.className = 'hand cupping-hand left';
    right.className = 'hand cupping-hand right';
    left.src = 'assets/augur2.png';
    right.src = 'assets/augur2.png';
    left.alt = right.alt = '';
    layer.appendChild(left);
    layer.appendChild(right);

    const o = this.bounds.orb, w = o.w * 300 / 270;
    left.style.width = right.style.width = w + 'px';
    left.style.opacity = right.style.opacity = '0';
    left.style.transform = 'none';
    right.style.transform = 'scaleX(-1)';

    const start = performance.now();
    return new Promise(resolve => {
      const step = now => {
        if (this.signal?.aborted) { left.remove(); right.remove(); return resolve(); }
        const elapsed = (now - start) * (this.speed || 1);
        const u = Math.min(1, elapsed / duration);
        const arrive = this.reduced ? 1 : 1 - Math.pow(1 - Math.min(1, u / .25), 3);
        const spread = (1 - arrive) * o.w * .4;
        const lift = (1 - arrive) * o.w * .24;
        const shine = 1 + Math.sin(u * Math.PI) * .85;
        const a = Math.min(u / .12, (1 - u) / .12, 1);

        left.style.left = (o.x - w * .9 - spread) + 'px';
        right.style.left = (o.x - w * .1 + spread) + 'px';
        left.style.top = right.style.top = (o.y - w * 20 / 300 + lift) + 'px';
        left.style.opacity = right.style.opacity = String(a);
        left.style.filter = right.style.filter = `drop-shadow(0 4px 8px #0a0813) brightness(${shine})`;

        if (u < 1) requestAnimationFrame(step);
        else { left.remove(); right.remove(); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  // Prismatic beam for Basic (水晶折光)
  playBeamAnimation(duration = 700) {
    const start = performance.now();
    return new Promise(resolve => {
      const step = now => {
        if (this.signal?.aborted) return resolve();
        const elapsed = (now - start) * (this.speed || 1);
        const u = Math.min(1, elapsed / duration);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.beam(u);
        if (u < 1) requestAnimationFrame(step);
        else { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  // Whiteout radiance wash for Reckon (命運清算)
  playRadianceAnimation(duration = 2400) {
    const whiteout = this.container.querySelector('#augurWhiteout');
    const start = performance.now();
    return new Promise(resolve => {
      const step = now => {
        if (this.signal?.aborted) {
          if (whiteout) whiteout.style.opacity = '0';
          return resolve();
        }
        const elapsed = (now - start) * (this.speed || 1);
        const t = elapsed / 1000;
        const u = Math.min(1, elapsed / duration);
        const charge = Math.min(1, Math.max(0, (t - .28) / 1.56));
        const release = 1 - Math.min(1, Math.max(0, (t - 2.1) / .6));

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.crystalRadiance(charge * release, t, release);

        const wash = Math.min(1, Math.max(0, (t - 1.52) / .45)) * (1 - Math.min(1, Math.max(0, (t - 2.13) / .55)));
        if (whiteout) whiteout.style.opacity = String(wash * (this.reduced ? .62 : 1));

        if (u < 1) requestAnimationFrame(step);
        else {
          if (whiteout) whiteout.style.opacity = '0';
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  // 3D Tarot card flip animation (Upright or Reversed)
  flipTarotCard(targetAnchor, isReversed = false, duration = 1200) {
    const layer = this.container.querySelector('#augurEffectCards');
    const card = document.createElement('div');
    card.className = 'card';
    fillAugurCard(card, isReversed ? 'reverse' : 'upright');
    layer.appendChild(card);

    const o = this.bounds.orb, dest = this.coord(targetAnchor);
    const start = performance.now();
    return new Promise(resolve => {
      const step = now => {
        if (this.signal?.aborted) { card.remove(); return resolve(); }
        const elapsed = (now - start) * (this.speed || 1);
        const u = Math.min(1, elapsed / duration);

        const x = o.x + (dest.x - o.x) * u;
        const y = o.y + (dest.y - o.y) * u - Math.sin(u * Math.PI) * 50;
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        card.style.opacity = String(Math.min(u / .15, (1 - u) / .15, 1));

        const rotY = Math.min(180, u * 2 * 180);
        const rotZ = isReversed ? Math.min(180, Math.max(0, (u - .4) * 2.5 * 180)) : 0;
        card.querySelector('.card-inner').style.transform = `rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;

        if (u < 1) requestAnimationFrame(step);
        else { card.remove(); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  dispose() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const a of this.animations) a.cancel();
    this.animations.clear();
    this.container.innerHTML = '';
  }
}

// Production Combat Hook
async function playAugurPresentation(step, context = {}) {
  await preloadAugurAssets();
  const parentSignal = context.signal || context.controller?.signal;
  if (parentSignal?.aborted) return;

  const stage = getOrCreateCombatStage();
  const engine = new AugurPresentationEngine(stage, {
    signal: parentSignal,
    speed: context.speed || 1,
    reduced: context.reducedMotion,
    audioScope: context.audioScope || createSfxPresentationScope(context)
  });

  try {
    const actionId = step.actionId || step.skillId;
    const actorSnapshot = step.hpSnapshotBefore?.players?.find(p => p.id === step.sourceId) || {};
    const monsterSnapshot = step.hpSnapshotBefore?.monster || {};

    // Update HP displays
    const augurHpText = stage.querySelector('#augurHpText');
    const augurHpBar = stage.querySelector('#augurHpBar');
    if (augurHpText && actorSnapshot.maxHp) {
      augurHpText.textContent = `${actorSnapshot.hp || 70} / ${actorSnapshot.maxHp || 70}`;
      augurHpBar.style.width = Math.max(0, (actorSnapshot.hp || 70) / (actorSnapshot.maxHp || 70) * 100) + '%';
    }

    const bossHpText = stage.querySelector('#augurBossHpText');
    const bossHpBar = stage.querySelector('#augurBossHpBar');
    const bossName = stage.querySelector('#augurBossName');
    if (bossName && step.monsterName) bossName.innerHTML = `<small>BOSS</small>${escapeHtml(step.monsterName)}`;
    if (bossHpText && monsterSnapshot.maxHp) {
      bossHpText.textContent = `${monsterSnapshot.hp} / ${monsterSnapshot.maxHp}`;
      bossHpBar.style.width = Math.max(0, monsterSnapshot.hp / monsterSnapshot.maxHp * 100) + '%';
    }

    // Update Observed Target portrait inside orb
    const orbTarget = stage.querySelector('#augurOrbTarget');
    const orbObservedLabel = stage.querySelector('#augurOrbObservedLabel');
    const observedId = actorSnapshot.observedTargetId;
    if (observedId && orbTarget) {
      const targetPlayer = step.hpSnapshotBefore?.players?.find(p => p.id === observedId);
      if (targetPlayer?.role) {
        orbTarget.src = `photo/${targetPlayer.role.charAt(0).toUpperCase() + targetPlayer.role.slice(1)}.webp`;
        orbTarget.style.opacity = '.74';
      }
      if (orbObservedLabel && targetPlayer?.name) {
        orbObservedLabel.textContent = `${targetPlayer.name} · 命運映像`;
      }
    }

    // Play specific skill choreography
    if (actionId === 'basic') {
      engine.showCaption('水晶折光', `七彩折射貫穿 · 魔法傷害 ${step.finalDamage || 10}`, 'PRISMATIC REFRACTION');
      engine.audio.play('magic_impact', { noHold: true });
      await engine.playBeamAnimation(650);
      if (parentSignal?.aborted) return;
      engine.resistance(1);
      engine.number('boss', `−${step.finalDamage || 10}`, 'magic', '魔法');

      // Repay debt
      const repaid = 8;
      engine.repayFX(1, repaid);
      engine.number('orb', `−${repaid}`, 'debt', '命債清償');

      await waitForPresentation(350, parentSignal, context.speed || 1);
    } else if (actionId === 'aug_bind') {
      engine.showCaption('命運繫結', '切換觀測目標 · 強化本回合命運干涉', 'FATE REBOUND');
      engine.audio.play('air_pass', { noHold: true });
      await engine.sweepHand(800);
      if (parentSignal?.aborted) return;
      engine.star(engine.bounds.orb, 25, AUGUR_C.gold);
      await waitForPresentation(300, parentSignal, context.speed || 1);
    } else if (actionId === 'aug_reckon') {
      engine.showCaption('命運清算・凶兆逆位', '雙手捧起命運 · 白光透出七彩', 'THE RECKONING');
      engine.audio.play('holy_cast', { noHold: true });
      const cupPromise = engine.cupHands(2200);
      const radPromise = engine.playRadianceAnimation(2400);
      await Promise.all([cupPromise, radPromise]);
      if (parentSignal?.aborted) return;

      engine.audio.play('magic_impact', { noHold: true });
      engine.number('boss', `−${step.finalDamage || 15}`, 'magic', '魔法');
      engine.number('orb', '−25', 'debt', '命債清償');
      await waitForPresentation(400, parentSignal, context.speed || 1);
    } else {
      // Default fallback
      engine.showCaption(step.skillName || '卜者行動', '', 'THE AUGURY');
      await waitForPresentation(500, parentSignal, context.speed || 1);
    }

    // Apply authoritative step results and final snapshots
    if (step.hpSnapshot && typeof applyHpSnapshot === 'function') {
      applyHpSnapshot(step.hpSnapshot);
    }
  } finally {
    engine.dispose();
  }
}

// Export for lab and testing
if (typeof window !== 'undefined') {
  window.AugurPresentationEngine = AugurPresentationEngine;
  window.playAugurPresentation = playAugurPresentation;
  window.isAugurAction = isAugurAction;
}
