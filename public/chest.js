// Phase 4 owner: Chest Discovery / Open / Reward Presentation lifecycle.
const CHEST_TIMING = Object.freeze({
  sectionEnter: 600, narrativeDelay: 400, narrativeHold: 1200,
  character: 40, comma: 140, sentence: 280, newline: 380, paragraph: 600,
  chestReveal: 450, buttonReveal: 250,
  anticipation: 150, shake: 260, openHold: 400,
  commonReveal: 400, commonHold: 1000,
  rareReveal: 550, rareHold: 1500,
  exit: 500
});

function getChestSvgMarkup() {
  return `
    <svg viewBox="0 0 200 160" class="chest-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="overflow: visible;">
      <defs>
        <!-- CURRENT: Amber Gold & Dark Oak -->
        <radialGradient id="chestWarmGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fffbeb" stop-opacity="1"/>
          <stop offset="25%" stop-color="#fbbf24" stop-opacity="0.85"/>
          <stop offset="60%" stop-color="#d97706" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#b45309" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="chestWoodGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#452a17"/>
          <stop offset="45%" stop-color="#301c0f"/>
          <stop offset="100%" stop-color="#190e07"/>
        </linearGradient>
        <linearGradient id="chestMetalGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#785324"/>
          <stop offset="25%" stop-color="#f59e0b"/>
          <stop offset="50%" stop-color="#fef08a"/>
          <stop offset="75%" stop-color="#d97706"/>
          <stop offset="100%" stop-color="#78350f"/>
        </linearGradient>

        <!-- 圓拱桶頂外型遮罩 (確保桶拱木紋與箍帶邊界精準收齊) -->
        <clipPath id="barrelDomeClip">
          <path d="M 24 66 L 24 48 C 24 20, 60 12, 100 12 C 140 12, 176 20, 176 48 L 176 66 Z"/>
        </clipPath>

        <!-- VARIANT A (Ancient): Dark Weathered Oak & Forged Iron -->
        <radialGradient id="chestAncientGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.9"/>
          <stop offset="50%" stop-color="#b45309" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#451a03" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="chestAncientWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2d2015"/>
          <stop offset="100%" stop-color="#0d0905"/>
        </linearGradient>
        <linearGradient id="chestAncientMetal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#27272a"/>
          <stop offset="50%" stop-color="#71717a"/>
          <stop offset="100%" stop-color="#18181b"/>
        </linearGradient>

        <!-- VARIANT B (Abyss): Obsidian / Deep Slate & Eldritch Runic Trim -->
        <radialGradient id="chestAbyssGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#38bdf8" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="chestAbyssWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="100%" stop-color="#030712"/>
        </linearGradient>
        <linearGradient id="chestAbyssMetal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="50%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>

        <!-- 內嵌開箱動態樣式：開蓋抬升角度 50% (translateY(-8px) scaleY(0.63))、光擴散 160% (scale(1.6)) -->
        <style>
          .chest-lid-group {
            transform-origin: 100px 14px;
            transition: transform 0.55s cubic-bezier(0.25, 1.25, 0.5, 1);
          }
          .chest-hasp-hinge {
            transform-origin: 100px 58px;
            transition: transform 0.45s ease-out;
          }
          .chest-interior {
            transition: opacity 0.45s ease-out;
            opacity: 0;
          }
          .chest-inner-glow {
            transform-origin: 100px 62px;
            transition: transform 0.55s ease-out, opacity 0.5s ease-out;
            opacity: 0.2;
          }
          .chest-rays {
            transform-origin: 100px 62px;
            transition: opacity 0.45s ease-out;
            opacity: 0;
          }
          @keyframes rayPulse {
            0%, 100% { opacity: 0.45; transform: scale(0.96) rotate(0deg); }
            50% { opacity: 0.85; transform: scale(1.08) rotate(3deg); }
          }
          @keyframes chestShake {
            0%, 100% { transform: translateX(0) rotate(0deg); }
            20% { transform: translateX(-3px) rotate(-1.5deg); }
            40% { transform: translateX(3px) rotate(1.5deg); }
            60% { transform: translateX(-2.5px) rotate(-1deg); }
            80% { transform: translateX(2.5px) rotate(1deg); }
          }
          .is-shaking,
          .is-shaking .chest-svg {
            animation: chestShake 0.1s ease-in-out infinite;
          }

          /* === 核心開蓋動態：開蓋抬升角度 50% 與 光擴散 160% === */
          .is-open .chest-lid-group,
          .chest-svg.is-open .chest-lid-group {
            transform: translateY(-8px) scaleY(0.63);
          }
          .is-open .chest-hasp-hinge,
          .chest-svg.is-open .chest-hasp-hinge {
            transform: rotate(18deg);
          }
          .is-open .chest-interior,
          .chest-svg.is-open .chest-interior {
            opacity: 1;
          }
          .is-open .chest-inner-glow,
          .chest-svg.is-open .chest-inner-glow {
            transform: scale(1.6);
            opacity: 0.95;
          }
          .is-open .chest-rays,
          .chest-svg.is-open .chest-rays {
            opacity: 0.8;
            animation: rayPulse 2.8s ease-in-out infinite;
          }

          /* 粒子動畫設定 */
          @keyframes particleRise {
            0% { transform: translateY(0) scale(0.6) rotate(0deg); opacity: 0; }
            25% { opacity: 1; }
            100% { transform: translateY(-65px) scale(1.15) rotate(45deg); opacity: 0; }
          }
          .presentation-chest-particles {
            position: absolute;
            inset: 0;
            pointer-events: none;
          }
          .presentation-chest-particles .particle {
            position: absolute;
            pointer-events: none;
            font-size: 15px;
            opacity: 0;
            color: #fef08a;
            text-shadow: 0 0 6px #f59e0b;
          }
          .is-open .presentation-chest-particles .particle {
            animation: particleRise 2.2s cubic-bezier(0.2, 0.8, 0.4, 1) infinite;
          }
          .p1 { left: 32%; bottom: 45%; animation-delay: 0.1s; }
          .p2 { left: 48%; bottom: 50%; animation-delay: 0.6s; font-size: 20px; }
          .p3 { left: 62%; bottom: 46%; animation-delay: 1.1s; }
          .p4 { left: 52%; bottom: 40%; animation-delay: 1.6s; font-size: 12px; }

          /* 主題變體覆蓋 (當 data-variant 啟動時) */
          [data-variant="ancient"] .chest-inner-glow { fill: url(#chestAncientGlow); }
          [data-variant="ancient"] .chest-wood-part { fill: url(#chestAncientWood); }
          [data-variant="ancient"] .chest-metal-part { fill: url(#chestAncientMetal); }
          [data-variant="ancient"] .chest-rays polygon { fill: url(#chestAncientGlow); }

          [data-variant="abyss"] .chest-inner-glow { fill: url(#chestAbyssGlow); }
          [data-variant="abyss"] .chest-wood-part { fill: url(#chestAbyssWood); }
          [data-variant="abyss"] .chest-metal-part { fill: url(#chestAbyssMetal); }
          [data-variant="abyss"] .chest-rays polygon { fill: url(#chestAbyssGlow); }
        </style>
      </defs>

      <!-- 0. 內部空間與寶藏層 (掀蓋 50% 時透出金幣與放射聖光) -->
      <g class="chest-interior">
        <!-- 暗色箱內後壁深淵 -->
        <rect x="28" y="44" width="144" height="28" rx="2" fill="#130b05"/>
        <line x1="28" y1="58" x2="172" y2="58" stroke="#080402" stroke-width="1.5"/>

        <!-- 放射狀金色聖光射線 -->
        <g class="chest-rays">
          <polygon points="100,60 30,5 50,0" fill="url(#chestWarmGlow)"/>
          <polygon points="100,60 85,-10 115,-10" fill="url(#chestWarmGlow)"/>
          <polygon points="100,60 150,0 170,5" fill="url(#chestWarmGlow)"/>
          <polygon points="100,60 15,30 25,20" fill="url(#chestWarmGlow)"/>
          <polygon points="100,60 175,20 185,30" fill="url(#chestWarmGlow)"/>
        </g>

        <!-- 核心寶光球 (開蓋時擴散至 160%) -->
        <ellipse class="chest-inner-glow" cx="100" cy="62" rx="72" ry="30" fill="url(#chestWarmGlow)"/>

        <!-- 滿載溢出的金幣堆與寶石 -->
        <g class="chest-treasure">
          <ellipse cx="100" cy="68" rx="58" ry="12" fill="#ca8a04"/>
          <ellipse cx="65" cy="66" rx="6" ry="3.5" fill="#facc15" stroke="#a16207" stroke-width="0.7"/>
          <ellipse cx="78" cy="64" rx="6.5" ry="4" fill="#fde047" stroke="#a16207" stroke-width="0.7"/>
          <ellipse cx="92" cy="67" rx="7" ry="4" fill="#eab308" stroke="#a16207" stroke-width="0.7"/>
          <ellipse cx="105" cy="64" rx="7" ry="4" fill="#fef08a" stroke="#a16207" stroke-width="0.7"/>
          <ellipse cx="120" cy="65" rx="6.5" ry="3.8" fill="#facc15" stroke="#a16207" stroke-width="0.7"/>
          <ellipse cx="135" cy="67" rx="6" ry="3.5" fill="#eab308" stroke="#a16207" stroke-width="0.7"/>
          <!-- 紅寶石與秘術藍寶石 -->
          <polygon points="86,63 89,60 93,63 90,66" fill="#ef4444" stroke="#7f1d1d" stroke-width="0.5"/>
          <polygon points="112,62 115,59 119,62 116,65" fill="#06b6d4" stroke="#164e63" stroke-width="0.5"/>
        </g>
      </g>

      <!-- 1. 寶箱基座 (Chest Base) -->
      <g class="chest-base-group">
        <rect class="chest-wood-part" x="26" y="68" width="148" height="74" rx="3" fill="url(#chestWoodGrad)" stroke="#140b04" stroke-width="2.5"/>
        <line x1="26" y1="92" x2="174" y2="92" stroke="#100703" stroke-width="2"/>
        <line x1="26" y1="93" x2="174" y2="93" stroke="#ffffff" stroke-width="0.5" opacity="0.12"/>
        <line x1="26" y1="116" x2="174" y2="116" stroke="#100703" stroke-width="2"/>
        <line x1="26" y1="117" x2="174" y2="117" stroke="#ffffff" stroke-width="0.5" opacity="0.12"/>

        <!-- 垂直強化金屬箍帶與鉚釘 -->
        <g class="chest-straps chest-metal-part">
          <!-- 左箍帶 -->
          <rect x="46" y="68" width="16" height="74" fill="url(#chestMetalGrad)" stroke="#1a1107" stroke-width="1"/>
          <circle cx="54" cy="78" r="1.5" fill="#fef08a" opacity="0.85"/>
          <circle cx="54" cy="104" r="1.5" fill="#fef08a" opacity="0.85"/>
          <circle cx="54" cy="130" r="1.5" fill="#fef08a" opacity="0.85"/>
          <!-- 右箍帶 -->
          <rect x="138" y="68" width="16" height="74" fill="url(#chestMetalGrad)" stroke="#1a1107" stroke-width="1"/>
          <circle cx="146" cy="78" r="1.5" fill="#fef08a" opacity="0.85"/>
          <circle cx="146" cy="104" r="1.5" fill="#fef08a" opacity="0.85"/>
          <circle cx="146" cy="130" r="1.5" fill="#fef08a" opacity="0.85"/>
        </g>

        <!-- 底角金屬護足 (支援金屬漸層) -->
        <path class="chest-foot chest-metal-part" d="M 26 128 L 40 128 L 40 142 L 26 142 Z" fill="url(#chestMetalGrad)" stroke="#1a1107" stroke-width="1"/>
        <path class="chest-foot chest-metal-part" d="M 160 128 L 174 128 L 174 142 L 160 142 Z" fill="url(#chestMetalGrad)" stroke="#1a1107" stroke-width="1"/>
        <circle cx="33" cy="135" r="1.2" fill="#fff" opacity="0.6"/>
        <circle cx="167" cy="135" r="1.2" fill="#fff" opacity="0.6"/>

        <!-- 正面中央鎖身 (Clasp Plate) -->
        <g class="chest-clasp chest-metal-part">
          <rect x="89" y="70" width="22" height="24" rx="3" fill="url(#chestMetalGrad)" stroke="#2b1404" stroke-width="1.5"/>
          <rect x="91" y="72" width="18" height="20" rx="1.5" fill="none" stroke="#fff" stroke-width="0.5" opacity="0.3"/>
          <circle cx="100" cy="79" r="3.2" fill="#0f0b07"/>
          <polygon points="98,80 102,80 101.2,88 98.8,88" fill="#0f0b07"/>
        </g>
      </g>

      <!-- 2. 正統立體圓拱頂蓋 (Chest Lid - 支援中軸向上掀起＋50% 後仰透視壓扁) -->
      <g class="chest-lid-group">
        <!-- 圓拱木質本體 -->
        <g clip-path="url(#barrelDomeClip)">
          <rect class="chest-wood-part" x="20" y="10" width="160" height="60" fill="url(#chestWoodGrad)"/>
          
          <!-- 木板拱形拼縫線 -->
          <path d="M 22 36 Q 100 22 178 36" stroke="#120703" stroke-width="2" fill="none"/>
          <path d="M 22 37 Q 100 23 178 37" stroke="#ffffff" stroke-width="0.5" opacity="0.12" fill="none"/>
          
          <path d="M 22 50 Q 100 36 178 50" stroke="#120703" stroke-width="2" fill="none"/>
          <path d="M 22 51 Q 100 37 178 51" stroke="#ffffff" stroke-width="0.5" opacity="0.12" fill="none"/>

          <!-- 頂部高光倒角 -->
          <path d="M 26 48 C 26 22, 60 14, 100 14 C 140 14, 174 22, 174 48" stroke="#ffffff" stroke-width="1.2" opacity="0.18" fill="none"/>

          <!-- 拱頂垂直金屬箍帶 -->
          <g class="chest-straps chest-metal-part">
            <rect x="46" y="10" width="16" height="60" fill="url(#chestMetalGrad)" stroke="#1a1107" stroke-width="0.8"/>
            <circle cx="54" cy="24" r="1.5" fill="#fef08a" opacity="0.85"/>
            <circle cx="54" cy="44" r="1.5" fill="#fef08a" opacity="0.85"/>
            
            <rect x="138" y="10" width="16" height="60" fill="url(#chestMetalGrad)" stroke="#1a1107" stroke-width="0.8"/>
            <circle cx="146" cy="24" r="1.5" fill="#fef08a" opacity="0.85"/>
            <circle cx="146" cy="44" r="1.5" fill="#fef08a" opacity="0.85"/>
          </g>
        </g>

        <!-- 拱頂外緣深色硬邊線 -->
        <path d="M 24 66 L 24 48 C 24 20, 60 12, 100 12 C 140 12, 176 20, 176 48 L 176 66 Z" fill="none" stroke="#140b04" stroke-width="2.5"/>

        <!-- 頂蓋實體金屬下沿厚度包邊條 (Overhang Rim) 與 7 顆鉚釘 -->
        <g class="chest-straps chest-metal-part">
          <rect x="22" y="60" width="156" height="9" rx="2" fill="url(#chestMetalGrad)" stroke="#140b04" stroke-width="1.5"/>
          <line x1="23" y1="68" x2="177" y2="68" stroke="#000000" stroke-width="1" opacity="0.4"/>
          <circle cx="32" cy="64.5" r="1.3" fill="#fef08a" opacity="0.9"/>
          <circle cx="54" cy="64.5" r="1.3" fill="#fef08a" opacity="0.9"/>
          <circle cx="76" cy="64.5" r="1.3" fill="#fef08a" opacity="0.9"/>
          <circle cx="100" cy="64.5" r="1.3" fill="#fef08a" opacity="0.9"/>
          <circle cx="124" cy="64.5" r="1.3" fill="#fef08a" opacity="0.9"/>
          <circle cx="146" cy="64.5" r="1.3" fill="#fef08a" opacity="0.9"/>
          <circle cx="168" cy="64.5" r="1.3" fill="#fef08a" opacity="0.9"/>
        </g>

        <!-- 正面掀蓋鎖鼻搭扣 (Front Hasp) -->
        <g class="chest-clasp chest-hasp-hinge chest-metal-part">
          <rect x="88" y="55" width="24" height="18" rx="2.5" fill="url(#chestMetalGrad)" stroke="#2b1404" stroke-width="1.5"/>
          <circle cx="100" cy="59" r="1.4" fill="#fef08a" opacity="0.9"/>
          <rect x="94" y="65" width="12" height="6" rx="1.5" fill="#140b04"/>
        </g>
      </g>
    </svg>
    <div class="presentation-chest-particles" aria-hidden="true">
      <span class="particle p1">✦</span>
      <span class="particle p2">✦</span>
      <span class="particle p3">✦</span>
      <span class="particle p4">✦</span>
    </div>
  `;
}

function getActiveChestDisplay() {
  try {
    return (typeof chestDisplay !== 'undefined' ? chestDisplay : (typeof window !== 'undefined' ? window.chestDisplay : null));
  } catch {
    return typeof window !== 'undefined' ? window.chestDisplay : null;
  }
}

function setActiveChestDisplay(val) {
  try {
    if (typeof chestDisplay !== 'undefined') chestDisplay = val;
  } catch {}
  if (typeof window !== 'undefined') window.chestDisplay = val;
}

function projectChestDisplayState(state) {
  const ev = state.currentEvent;
  if (state.state !== 'EVENT' || ev?.type !== 'treasure' || !ev.hpBefore) return state;
  let activeDisplay = getActiveChestDisplay();
  if (!activeDisplay || activeDisplay.id !== ev.presentationId) {
    activeDisplay = { id: ev.presentationId, snapshot: ev.hpBefore };
    setActiveChestDisplay(activeDisplay);
  }
  const snapshots = new Map((activeDisplay.snapshot?.players || []).map(p => [p.id, p]));
  return { ...state, players: state.players.map(p => ({ ...p, ...snapshots.get(p.id) })) };
}

function applyChestSnapshot(snapshot) {
  let activeDisplay = getActiveChestDisplay();
  if (!activeDisplay) return;
  activeDisplay.snapshot = snapshot;
  setActiveChestDisplay(activeDisplay);
  if (typeof roomState !== 'undefined') {
    roomState = projectChestDisplayState(roomState);
  }
}

async function playChestPresentation(ev, context = {}) {
  const controller = context.controller || new AbortController();
  controller.presentationId = ev.presentationId;
  try { chestPresentationController = controller; } catch {}
  if (typeof window !== 'undefined') window.chestPresentationController = controller;
  const { signal } = controller;

  const timing = (typeof PRESENTATION_CONFIG !== 'undefined' ? PRESENTATION_CONFIG.chest : CHEST_TIMING);
  const speed = context.speed || 1.0;
  const wait = ms => waitForPrologue(Math.round(ms / speed), signal);
  const emitTiming = beat => {
    if (typeof context.onTiming === 'function') context.onTiming(beat, Date.now());
  };

  emitTiming('scene_start');

  const app = document.getElementById('app');
  const chat = elements.floatingChatContainer;
  const previousInert = app?.inert || false;
  const previousChatInert = chat?.inert || false;

  const section = context.section || elements.chestDiscoverySection;
  const story = context.story || elements.chestDiscoveryStory;
  const interactionArea = context.interactionArea || elements.chestInteractionArea;
  const btnOpenChest = context.btnOpenChest || elements.btnOpenChest;
  const overlay = context.overlay || elements.chestPresentationOverlay;
  const visualStage = context.visualStage || elements.presentationChestVisual;
  const rewardContent = context.rewardContent || elements.presentationRewardContent;

  const variant = context.variant || (typeof PRESENTATION_CONFIG !== 'undefined' ? PRESENTATION_CONFIG.chest?.variant : 'current') || 'current';
  if (section) section.setAttribute('data-variant', variant);
  if (overlay) overlay.setAttribute('data-variant', variant);

  if (context.glow) {
    if (section) section.setAttribute('data-glow', context.glow);
    if (overlay) overlay.setAttribute('data-glow', context.glow);
  }
  if (context.particles && overlay) overlay.setAttribute('data-particles', context.particles);
  if (context.shake && overlay) overlay.setAttribute('data-shake', context.shake);
  if (context.reducedMotion) {
    if (section) section.setAttribute('data-reduced-motion', 'true');
    if (overlay) overlay.setAttribute('data-reduced-motion', 'true');
  }

  let completed = false;
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.classList.remove('exit', 'enter');
    }
    if (rewardContent) {
      rewardContent.classList.add('hidden');
      rewardContent.classList.remove('enter');
    }
    if (section) {
      section.classList.remove('enter', 'exit');
      section.classList.add('hidden');
    }
    if (interactionArea) {
      interactionArea.classList.remove('enter');
      interactionArea.classList.add('hidden');
    }
    if (btnOpenChest) {
      btnOpenChest.disabled = true;
      btnOpenChest.classList.remove('ready');
    }
    if (story) {
      story.classList.remove('dimmed');
      story.replaceChildren();
    }
    document.body.classList.remove('presentation-chest-active');
    if (app) app.inert = previousInert;
    if (chat) chat.inert = previousChatInert;

    const activeCtrl = (typeof chestPresentationController !== 'undefined' ? chestPresentationController : (typeof window !== 'undefined' ? window.chestPresentationController : null));
    if (activeCtrl === controller) {
      try { chestPresentationController = null; } catch {}
      if (typeof window !== 'undefined') window.chestPresentationController = null;
      presentationManager.setBlocking(false);
    }
  };

  signal.addEventListener('abort', cleanup, { once: true });

  try {
    presentationManager.setBlocking(true);
    if (app) app.inert = true;
    if (chat) chat.inert = true;

    // STEP 1: Discovery Narrative
    story.classList.remove('dimmed');
    story.replaceChildren();
    interactionArea.classList.add('hidden');
    interactionArea.classList.remove('enter');
    btnOpenChest.disabled = true;
    btnOpenChest.classList.remove('ready');

    overlay.classList.add('hidden');
    section.classList.remove('hidden', 'exit');
    section.classList.add('enter');

    emitTiming('narrative_start');
    await wait(timing.sectionEnter + timing.narrativeDelay);

    const defaultStory = '穿過蜿蜒幽暗的石徑，小隊在一處凹陷的石壁深處發現了一只散發著沉靜微光的遠古寶箱。';
    const paragraphs = (ev.story || defaultStory).split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length) {
      await typePrologueParagraphs(story, paragraphs, signal, timing);
    }
    emitTiming('narrative_complete');

    // STEP 2: Narrative Hold
    await wait(timing.narrativeHold);
    emitTiming('hold_complete');

    // STEP 3: Chest Visual Reveal & Button Reveal
    story.classList.add('dimmed');
    const worldVisual = (interactionArea && typeof interactionArea.querySelector === 'function' ? interactionArea.querySelector('#chestWorldVisual') : null) || (typeof document !== 'undefined' && document.getElementById('chestWorldVisual'));
    if (worldVisual && typeof getChestSvgMarkup === 'function') {
      worldVisual.innerHTML = getChestSvgMarkup();
      if (worldVisual.classList && typeof worldVisual.classList.remove === 'function') {
        worldVisual.classList.remove('is-open', 'is-shaking');
      }
    }
    interactionArea.classList.remove('hidden');
    interactionArea.classList.add('enter');
    playSound('chest_reveal');

    await wait(timing.chestReveal);
    emitTiming('chest_revealed');

    btnOpenChest.classList.add('ready');
    btnOpenChest.disabled = false;
    emitTiming('button_ready');

    // Enable player interaction
    presentationManager.setBlocking(false);
    if (app) app.inert = false;
    if (chat) chat.inert = false;

    // STEP 4: Await Player Click (or auto-open if specified in context)
    if (context.autoOpen) {
      await wait(context.autoOpenDelay || 200);
    } else {
      await new Promise((resolve, reject) => {
        const onAbort = () => {
          btnOpenChest.removeEventListener('click', onClick);
          reject(new DOMException('Presentation cancelled', 'AbortError'));
        };
        const onClick = () => {
          signal.removeEventListener('abort', onAbort);
          btnOpenChest.removeEventListener('click', onClick);
          resolve();
        };
        btnOpenChest.addEventListener('click', onClick, { once: true });
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }

    emitTiming('open_clicked');

    // STEP 5: Button Lock immediately
    btnOpenChest.disabled = true;
    btnOpenChest.classList.remove('ready');

    presentationManager.setBlocking(true);
    if (app) app.inert = true;
    if (chat) chat.inert = true;
    document.body.classList.add('presentation-chest-active');

    if (typeof context.onOpen === 'function') {
      context.onOpen();
    } else if (typeof socket !== 'undefined' && socket?.emit) {
      socket.emit('chest:open', { presentationId: ev.presentationId });
    }

    // STEP 6: Chest Opening Presentation on #presentationRoot
    if (visualStage) {
      visualStage.innerHTML = getChestSvgMarkup();
      visualStage.classList.remove('is-shaking', 'is-open');
    }
    if (rewardContent) {
      rewardContent.classList.add('hidden');
      rewardContent.classList.remove('enter');
    }

    overlay.classList.remove('hidden', 'exit');
    overlay.classList.add('enter');

    await wait(timing.anticipation);

    // Directional anticipation shake
    if (visualStage) visualStage.classList.add('is-shaking');
    await wait(timing.shake);
    if (visualStage) visualStage.classList.remove('is-shaking');

    // Lid Opens with SFX (觸發開蓋抬升 50% 壓扁後仰與光擴散 160%)
    playSound('chest_open');
    emitTiming('lid_open');
    if (visualStage) visualStage.classList.add('is-open');

    // Party heal float on HUD
    if (ev.hpAfter) {
      applyChestSnapshot(ev.hpAfter);
      playSound('heal');
      emitTiming('heal_float');
      if (typeof document.querySelector === 'function') {
        const playerList = (typeof roomState !== 'undefined' && roomState?.players) || ev.hpAfter?.players || [];
        playerList.forEach(p => {
          if (p.hp > 0) {
            const card = document.querySelector(`.teammate-card[data-player-id="${p.id}"]`);
            if (card && typeof card.querySelector === 'function') {
              const container = card.querySelector('.floating-text-container');
              if (container && typeof spawnFloatingText === 'function') {
                spawnFloatingText(container, `+${ev.healAmt || 25}`, 'heal');
              }
            }
          }
        });
      }
    }

    await wait(timing.openHold);

    // STEP 7: Reward Reveal
    const isRare = Boolean(ev.drop && (ev.drop.isSpecial || ev.drop.rarity === 'rare'));
    playSound(isRare ? 'reward_rare' : 'reward_common');
    emitTiming('reward_reveal');

    if (elements.presentationRewardRarity && elements.presentationRewardTitle &&
        elements.presentationRewardDesc && elements.presentationRewardMeta) {
      if (ev.drop) {
        elements.presentationRewardRarity.textContent = isRare ? '【稀有裝備】' : '【戰利品裝備】';
        elements.presentationRewardRarity.className = 'presentation-reward-rarity ' + (isRare ? 'is-rare' : 'is-common');
        elements.presentationRewardTitle.textContent = `【${ev.drop.name}】`;
        elements.presentationRewardDesc.textContent = ev.drop.desc || ev.drop.statDesc || '';
        elements.presentationRewardMeta.textContent = `獲得者：${ev.ownerName || '冒險者'} 正在抉擇是否穿戴`;
      } else if (ev.discardedDrop) {
        elements.presentationRewardRarity.textContent = '【遺棄戰利品】';
        elements.presentationRewardRarity.className = 'presentation-reward-rarity is-common';
        elements.presentationRewardTitle.textContent = `【${ev.discardedDrop.name}】`;
        elements.presentationRewardDesc.textContent = `無隊員專精此職業裝備，已妥善封存。全隊回復 ${ev.healAmt || 25} 生命！`;
        elements.presentationRewardMeta.textContent = '';
      } else {
        elements.presentationRewardRarity.textContent = '【地城恩澤】';
        elements.presentationRewardRarity.className = 'presentation-reward-rarity is-common';
        elements.presentationRewardTitle.textContent = '治癒聖泉';
        elements.presentationRewardDesc.textContent = `全體存活隊友回復 ${ev.healAmt || 25} 點生命值！`;
        elements.presentationRewardMeta.textContent = '';
      }
    }

    rewardContent.classList.remove('hidden');
    rewardContent.classList.add('enter');

    if (isRare) {
      await wait(timing.rareReveal + timing.rareHold);
    } else {
      await wait(timing.commonReveal + timing.commonHold);
    }
    emitTiming('reward_hold');

    // STEP 8: Presentation Settle / Exit
    overlay.classList.add('exit');
    await wait(timing.exit);
    overlay.classList.add('hidden');
    emitTiming('exit_complete');

    completed = true;
    try { chestRewardCompletedId = ev.presentationId; } catch {}
    if (typeof window !== 'undefined') window.chestRewardCompletedId = ev.presentationId;
  } catch (error) {
    if (error.name !== 'AbortError') {
      controller.abort();
      console.error('[Presentation:chest]', error);
    }
  } finally {
    signal.removeEventListener('abort', cleanup);
    cleanup();
  }

  // STEP 9: Equipment Decision or Complete ACK
  emitTiming('decision_ready');
  if (typeof context.onComplete === 'function') {
    context.onComplete({ completed, signal, ev });
  } else if (completed && !signal.aborted && typeof roomState !== 'undefined' && roomState?.state === 'EVENT' &&
      roomState.currentEvent?.presentationId === ev.presentationId) {
    const me = (roomState.players || []).find(p => p.id === myId);
    if (roomState.pendingDrop && me && roomState.pendingDrop.ownerId === me.id) {
      if (typeof renderPendingDropModal === 'function') renderPendingDropModal(me);
      if (typeof socket !== 'undefined' && socket?.emit) {
        socket.emit('equipment:interaction_ready', { presentationId: ev.presentationId });
      }
    } else {
      if (typeof socket !== 'undefined' && socket?.emit) {
        socket.emit('chest:presentation_complete', { presentationId: ev.presentationId });
      }
    }
  }
}

if (typeof document !== 'undefined') {
  const initChestWorldVisual = () => {
    const worldVisual = document.getElementById('chestWorldVisual');
    if (worldVisual && typeof getChestSvgMarkup === 'function') {
      if (typeof worldVisual.querySelector !== 'function' || !worldVisual.querySelector('svg.chest-svg')) {
        worldVisual.innerHTML = getChestSvgMarkup();
      }
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChestWorldVisual);
  } else {
    initChestWorldVisual();
  }
}