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

    this.container = document.createElement('div');
    this.container.className = 'augur-presentation-container' + (this.reduced ? ' reduced' : '');
    this.buildMarkup();
    this.stage.appendChild(this.container);

    this.canvas = this.container.querySelector('#augurFxCanvas');
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.orbAnchor = this.container.querySelector('#augurOrbAnchor');
    this.orbRig = this.container.querySelector('#augurOrbRig');
    this.sphere = this.container.querySelector('#augurSphere');

    this.measure();
    this.orbitCards = Array.from(this.container.querySelectorAll('.orbit-card'));
    this.orbitCards.forEach((c, i) => fillAugurCard(c, i === 0 ? 'empty' : 'empty'));
    this.startOrbitAnimation();
  }

  buildMarkup() {
    this.container.innerHTML = `
      <div class="shade" id="augurShade"></div>
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
      <div class="caption" id="augurCaption">
        <div class="caption-kicker" id="augurCaptionKicker">THE AUGURY</div>
        <h2 id="augurCaptionTitle"></h2>
        <p id="augurCaptionText"></p>
      </div>
      <div class="whiteout" id="augurWhiteout" aria-hidden="true"></div>
    `;
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
      boss: {
        x: r.width * 0.82,
        y: r.height * 0.45,
        w: 160,
        h: 160
      },
      augur: {
        x: r.width * 0.18,
        y: r.height * 0.45,
        w: 160,
        h: 160
      }
    };
  }

  coord(target) {
    if (typeof target === 'string') return this.bounds[target] || this.bounds.orb;
    return target || this.bounds.orb;
  }

  startOrbitAnimation() {
    let clock = 0;
    const animateOrbit = () => {
      if (this.signal?.aborted) return;
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
    setTimeout(() => { if (el) el.style.opacity = '0'; }, duration / (this.speed || 1));
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

    const anim = node.animate([
      { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0 },
      { transform: 'translate(-50%, -80%) scale(1.1)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -120%) scale(1)', opacity: 0 }
    ], { duration: 900 / (this.speed || 1), fill: 'forwards' });
    anim.finished.then(() => node.remove(), () => node.remove());
  }

  // Skill 1 & Battle Intro Sweep Hand using augur1.png
  // The index finger hovers ~10px above the top of the crystal ball
  async sweepHand(duration = 1000) {
    const layer = this.container.querySelector('#augurEffectLayer');
    const hand = document.createElement('div');
    hand.className = 'observing-hand';
    const img = document.createElement('img');
    img.src = 'assets/augur1.png';
    hand.appendChild(img);
    layer.appendChild(hand);

    const o = this.bounds.orb;
    const r = o.w * 0.5;
    // Scale hand down slightly
    const handWidth = o.w * 1.35;
    const handHeight = handWidth * (836 / 1454); // exact aspect ratio
    hand.style.width = handWidth + 'px';

    // Fingertip is at 89.7% of image width and 100% of image height
    // Top is placed so the fingertip hovers ~10px above orb top (o.y - r - 10)
    const hoverTop = (o.y - r - 10) - handHeight;
    hand.style.top = hoverTop + 'px';

    const start = performance.now();
    return new Promise(resolve => {
      const step = now => {
        if (this.signal?.aborted) { hand.remove(); return resolve(); }
        const elapsed = (now - start) * (this.speed || 1);
        const u = Math.min(1, elapsed / duration);

        // Smooth sweep across orb: fingertip hovers from o.x - 25 to o.x + 25
        const sweepX = (u - 0.5) * 50;
        const left = (o.x + sweepX) - (handWidth * 0.897);
        hand.style.left = left + 'px';

        // Gentle breathe in Y
        const breatheY = Math.sin(u * Math.PI) * 4;
        hand.style.top = (hoverTop + breatheY) + 'px';

        // Fade envelope
        const alpha = Math.min(u / 0.18, (1 - u) / 0.18, 1);
        hand.style.opacity = String(alpha);

        if (u < 1) {
          requestAnimationFrame(step);
        } else {
          hand.remove();
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  // Skill 2 Cupping Hands using ONLY ONE augur2.png beneath crystal ball
  // Hand emerges from the bottom, crystal ball slowly floats upward before radiance/whiteout
  async reckonHands(duration = 2600) {
    const layer = this.container.querySelector('#augurEffectLayer');
    const hand = document.createElement('div');
    hand.className = 'cupping-hand';
    const img = document.createElement('img');
    img.src = 'assets/augur2.png';
    hand.appendChild(img);
    layer.appendChild(hand);

    const o = this.bounds.orb;
    // Slightly enlarged (1.8x orb width)
    const handWidth = o.w * 1.85;
    const handHeight = handWidth * (692 / 894);
    hand.style.width = handWidth + 'px';
    hand.style.left = (o.x - handWidth / 2) + 'px';

    // Emerging from bottom
    const bottomRestY = o.y - handHeight * 0.15;
    const startY = this.bounds.h + 50;

    const start = performance.now();
    const whiteout = this.container.querySelector('#augurWhiteout');

    return new Promise(resolve => {
      const step = now => {
        if (this.signal?.aborted) {
          hand.remove();
          if (whiteout) whiteout.style.opacity = '0';
          if (this.orbAnchor) this.orbAnchor.style.transform = 'translate(-50%, -50%)';
          return resolve();
        }
        const elapsed = (now - start) * (this.speed || 1);
        const t = elapsed / 1000;
        const u = Math.min(1, elapsed / duration);

        // Phase 1: Hand rises up from bottom (0 -> 0.3)
        const riseProgress = Math.min(1, u / 0.3);
        const curY = startY + (bottomRestY - startY) * (1 - Math.pow(1 - riseProgress, 3));
        hand.style.top = curY + 'px';
        hand.style.opacity = String(Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.15));

        // When hand appears, crystal ball slowly floats upward (-35px) BEFORE radiance/whiteout
        const floatProgress = Math.min(1, Math.max(0, (u - 0.15) / 0.35));
        const floatY = -35 * Math.sin(floatProgress * Math.PI * 0.5);
        if (this.orbAnchor) {
          this.orbAnchor.style.transform = `translate(-50%, calc(-50% + ${floatY}px))`;
        }

        // Phase 2: Radiance & chromatic dispersion grows (0.4 -> 0.85)
        const charge = Math.min(1, Math.max(0, (t - 0.5) / 1.3));
        const release = 1 - Math.min(1, Math.max(0, (t - 1.9) / 0.6));
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (charge > 0) {
          this.crystalRadiance(charge * release, t, release, floatY);
        }

        // Phase 3: Whiteout wash triggers (1.4 -> 2.1)
        const wash = Math.min(1, Math.max(0, (t - 1.4) / 0.45)) * (1 - Math.min(1, Math.max(0, (t - 2.05) / 0.5)));
        if (whiteout) {
          whiteout.style.opacity = String(wash * (this.reduced ? 0.62 : 1));
        }

        if (u < 1) {
          requestAnimationFrame(step);
        } else {
          hand.remove();
          if (whiteout) whiteout.style.opacity = '0';
          if (this.orbAnchor) this.orbAnchor.style.transform = 'translate(-50%, -50%)';
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
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
  playBeamAnimation(duration = 650) {
    const a = this.bounds.orb;
    const b = this.bounds.boss;
    const start = performance.now();

    return new Promise(resolve => {
      const step = now => {
        if (this.signal?.aborted) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          return resolve();
        }
        const elapsed = (now - start) * (this.speed || 1);
        const u = Math.min(1, elapsed / duration);
        const en = Math.min(u / 0.12, (1 - u) / 0.12, 1);

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw spectral rainbow beam
        const colors = ['#ff9aa9', '#ffd399', '#f8efb5', '#b0e3c4', '#9fdced', '#a9b2ff', '#d4a9eb'];
        const prism = { x: a.x + (b.x - a.x) * 0.22, y: a.y + (b.y - a.y) * 0.22 };
        const merge = { x: a.x + (b.x - a.x) * 0.68, y: a.y + (b.y - a.y) * 0.68 };

        this.ctx.save();
        this.ctx.globalAlpha = en;
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = AUGUR_COLORS.white;
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(prism.x, prism.y);
        this.ctx.stroke();

        const spread = 24;
        colors.forEach((col, i) => {
          this.ctx.lineWidth = 1.2;
          this.ctx.strokeStyle = col;
          this.ctx.beginPath();
          this.ctx.moveTo(prism.x, prism.y);
          this.ctx.quadraticCurveTo(
            (prism.x + merge.x) / 2,
            (prism.y + merge.y) / 2 + (i - 3) * spread / 3,
            merge.x,
            merge.y
          );
          this.ctx.stroke();
        });

        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = AUGUR_COLORS.white;
        this.ctx.beginPath();
        this.ctx.moveTo(merge.x, merge.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.stroke();
        this.ctx.restore();

        if (u < 1) requestAnimationFrame(step);
        else {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
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
    setTimeout(() => this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height), 200);
  }

  // Debt Repay Flash (命債清償)
  repayFX(amount) {
    if (!amount) return;
    const o = this.bounds.orb;
    const release = this.container.querySelector('#augurSealRelease');
    if (release) {
      release.style.opacity = '1';
      release.style.strokeDashoffset = '0';
      setTimeout(() => {
        if (release) release.style.opacity = '0';
      }, 500);
    }
  }

  // 3D Tarot Card Flip (Upright or Reversed Intercept)
  flipTarotCard(targetAnchor, isReversed = false, duration = 1200) {
    const layer = this.container.querySelector('#augurEffectCards');
    const card = document.createElement('div');
    card.className = 'card';
    fillAugurCard(card, isReversed ? 'reverse' : 'upright');
    layer.appendChild(card);

    const o = this.bounds.orb;
    const dest = this.coord(targetAnchor);
    const start = performance.now();

    return new Promise(resolve => {
      const step = now => {
        if (this.signal?.aborted) { card.remove(); return resolve(); }
        const elapsed = (now - start) * (this.speed || 1);
        const u = Math.min(1, elapsed / duration);

        const x = o.x + (dest.x - o.x) * u;
        const y = o.y + (dest.y - o.y) * u - Math.sin(u * Math.PI) * 45;
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        card.style.opacity = String(Math.min(u / 0.15, (1 - u) / 0.15, 1));

        const rotY = Math.min(180, u * 2 * 180);
        const rotZ = isReversed ? Math.min(180, Math.max(0, (u - 0.4) * 2.5 * 180)) : 0;
        card.querySelector('.card-inner').style.transform = `rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;

        if (u < 1) requestAnimationFrame(step);
        else { card.remove(); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const a of this.animations) a.cancel();
    this.animations.clear();
    this.container.remove();
  }
}

// Preload Augur assets into browser cache
let augurPreloadPromise = null;
function preloadAugurAssets() {
  if (!augurPreloadPromise) {
    const urls = ['assets/augur1.png', 'assets/augur2.png', 'photo/Augur.webp'];
    augurPreloadPromise = Promise.all(urls.map(src => new Promise(resolve => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = src;
    })));
  }
  return augurPreloadPromise;
}

// Production Combat Presentation Hook
async function playAugurPresentation(step, context = {}) {
  await preloadAugurAssets();
  const parentSignal = context.signal || context.controller?.signal;
  if (parentSignal?.aborted) return;

  const stage = (typeof getOrCreateCombatStage === 'function') ? getOrCreateCombatStage() : document.querySelector('.combat-stage') || document.body;
  const engine = new AugurPresentationEngine(stage, {
    signal: parentSignal,
    speed: context.speed || 1,
    reduced: context.reducedMotion,
    audioScope: context.audioScope || (typeof createSfxPresentationScope === 'function' ? createSfxPresentationScope(context) : null)
  });

  try {
    const actionId = step.actionId || step.skillId;
    const actorSnapshot = step.hpSnapshotBefore?.players?.find(p => p.id === step.sourceId) || {};
    const observedId = actorSnapshot.observedTargetId;

    // Reveal observed target avatar in crystal ball
    const orbTarget = engine.container.querySelector('#augurOrbTarget');
    const orbLabel = engine.container.querySelector('#augurOrbObservedLabel');
    if (observedId && orbTarget) {
      const targetPlayer = step.hpSnapshotBefore?.players?.find(p => p.id === observedId);
      if (targetPlayer?.role) {
        orbTarget.src = `photo/${targetPlayer.role.charAt(0).toUpperCase() + targetPlayer.role.slice(1)}.webp`;
        orbTarget.style.opacity = '.74';
      }
      if (orbLabel && targetPlayer?.name) {
        orbLabel.textContent = `${targetPlayer.name} · 命運映像`;
      }
    }

    if (actionId === 'basic') {
      engine.showCaption('水晶折光', `七彩折射貫穿 · 10 魔法傷害 · 清償 8 命債`, 'PRISMATIC REFRACTION');
      engine.audio.play('magic_impact', { noHold: true });
      await engine.playBeamAnimation(650);
      if (parentSignal?.aborted) return;

      engine.resistance(1);
      engine.number('boss', `−${step.finalDamage || 10}`, 'magic', '魔法');
      engine.repayFX(8);
      engine.number('orb', '−8', 'debt', '命債清償');

      await waitForPresentation(350, parentSignal, context.speed || 1);
    } else if (actionId === 'aug_bind') {
      engine.showCaption('命運繫結', '切換觀測目標 · 本回合加護與干涉大幅強化', 'FATE REBOUND');
      engine.audio.play('air_pass', { noHold: true });
      await engine.sweepHand(850);
      if (parentSignal?.aborted) return;

      const targetId = step.targetPlayerId || step.outcome?.targetId;
      if (targetId && orbTarget) {
        const targetPlayer = step.hpSnapshotBefore?.players?.find(p => p.id === targetId);
        if (targetPlayer?.role) {
          orbTarget.src = `photo/${targetPlayer.role.charAt(0).toUpperCase() + targetPlayer.role.slice(1)}.webp`;
          orbTarget.style.opacity = '.74';
          if (orbLabel) orbLabel.textContent = `${targetPlayer.name} · 命運映像`;
        }
      }
      await waitForPresentation(350, parentSignal, context.speed || 1);
    } else if (actionId === 'aug_reckon') {
      engine.showCaption('命運清算・凶兆逆位', '雙手捧起命運 · 白光透出七彩 · 烙印凶兆', 'THE RECKONING');
      engine.audio.play('holy_cast', { noHold: true });
      await engine.reckonHands(2500);
      if (parentSignal?.aborted) return;

      engine.audio.play('magic_impact', { noHold: true });
      engine.resistance(1);
      engine.number('boss', `−${step.finalDamage || 15}`, 'magic', '魔法');
      engine.repayFX(25);
      engine.number('orb', '−25', 'debt', '命債清償');

      // Heals if cleared >= 15
      const heals = step.results?.filter(r => r.kind === 'heal') || [];
      for (const h of heals) {
        engine.number(h.targetId === step.sourceId ? 'augur' : 'orb', `+${h.finalHeal || 10}`, 'heal', '生命回復');
      }

      await waitForPresentation(400, parentSignal, context.speed || 1);
    } else if (step.category === 'DEBT_EXPIRY') {
      engine.showCaption('命債清算', `命債到期反噬 · 無視護盾扣除生命`, 'THE PRICE OF FATE', true);
      engine.audio.play('shadow_strike', { noHold: true });
      const dmg = step.results?.[0]?.finalDamage || 20;
      engine.number('augur', `−${dmg}`, 'damage', '命債清算 · 真實');
      await waitForPresentation(600, parentSignal, context.speed || 1);
    } else {
      engine.showCaption(step.skillName || '命運干涉', '', 'THE AUGURY');
      await waitForPresentation(500, parentSignal, context.speed || 1);
    }

    if (step.hpSnapshot && typeof applyHpSnapshot === 'function') {
      applyHpSnapshot(step.hpSnapshot);
    }
  } finally {
    engine.dispose();
  }
}

// Global exports
if (typeof window !== 'undefined') {
  window.AugurPresentationEngine = AugurPresentationEngine;
  window.playAugurPresentation = playAugurPresentation;
  window.preloadAugurAssets = preloadAugurAssets;
}
