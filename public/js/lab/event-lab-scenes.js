// ==========================================================================
// 地城深淵 (DUNGEON ABYSS) - Event Lab Scenes (event-lab-scenes.js)
// Comprehensive testing harness for ALL exploration, random, and shop events.
// ==========================================================================

const EVENT_LAB_SCENES = Object.freeze({
  event_gamble: {
    label: "隨機事件：命運賭局 (20面骰下注、減速滾動與結算)",
    category: "EVENT",
    subType: "GAMBLE",
    tag: "GAMBLE"
  },
  event_reforge: {
    label: "隨機事件：矮人鑄造工坊 (背包選擇、鐵砧重鑄槽、消耗10G重鑄)",
    category: "EVENT",
    subType: "REFORGE",
    tag: "REFORGE"
  },
  event_altar: {
    label: "隨機事件：古老深淵祭壇 (鮮血獻祭、搜刮、聖光淨化)",
    category: "EVENT",
    subType: "ALTAR",
    tag: "ALTAR"
  },
  event_wandering_merchant: {
    label: "🏕️ 隨機事件：迷途流浪商人 (以物易物、打探情報、幻象重塑)",
    category: "EVENT",
    subType: "WANDERING_MERCHANT",
    tag: "MERCHANT"
  },
  event_shop_standard: {
    label: "🛒 商店據點：迷宮行商據點 (19格貨架、背包、商品頁籤、買賣休整)",
    category: "SHOP",
    subType: "STANDARD_SHOP",
    tag: "SHOP"
  },
  event_shop_shady: {
    label: "💰 商店據點：深淵黑市商人 (奸商物價、強取豪奪搶劫、暗行行竊)",
    category: "SHOP",
    subType: "SHADY_SHOP",
    tag: "SHADY"
  },
  event_shop_prep: {
    label: "🎒 商店據點：出發前行前整備 (出發前物資採購與補給)",
    category: "SHOP",
    subType: "PREP_SHOP",
    tag: "PREP"
  },
  event_mimic_chest: {
    label: "👾 寶箱事件：奇怪的寶箱突襲 (開箱伏擊、竊取裝備與金幣)",
    category: "CHEST",
    subType: "MIMIC",
    tag: "MIMIC"
  }
});

// Mock Team State for Lab Testing
let labEventTeamState = {
  gold: 300,
  floor: 3,
  leaderRole: 'warrior',
  squadInventory: [
    { name: '生鏽的鐵劍', tier: 1, slot: 'WEAPON', basePrice: 20, bonusAtk: 6 },
    { name: '秘銀重鎧', tier: 2, slot: 'BODY', basePrice: 60, bonusHp: 30, bonusDef: 8 },
    { name: '精靈木豎琴', tier: 'CLASS_EXCLUSIVE', slot: 'CLASS_EXCLUSIVE', role: 'bard', basePrice: 70, bonusMatk: 18 },
    { name: '荒野守護符', tier: 'CLASS_EXCLUSIVE', slot: 'CLASS_EXCLUSIVE', role: 'druid', basePrice: 75, bonusHp: 25 },
    { name: '強效治療藥水', tier: 1, slot: 'CONSUMABLE', type: 'CONSUMABLE', basePrice: 20, desc: '回復 50 點生命值' }
  ],
  players: [
    { id: 'mock-warrior', name: '亞瑟', role: 'warrior', hp: 120, maxHp: 120 },
    { id: 'mock-mage', name: '梅林', role: 'mage', hp: 80, maxHp: 80 }
  ]
};

// Item Pool for Reforge Testing
const LAB_REFORGE_POOLS = {
  tier1: [
    { name: '鍛造鐵劍', tier: 1, slot: 'WEAPON', bonusAtk: 8, basePrice: 25 },
    { name: '精鋼重盾', tier: 1, slot: 'OFFHAND', bonusDef: 6, bonusHp: 15, basePrice: 25 },
    { name: '冒險者輕甲', tier: 1, slot: 'BODY', bonusHp: 20, basePrice: 25 },
    { name: '學徒魔杖', tier: 1, slot: 'WEAPON', bonusMatk: 9, basePrice: 25 },
    { name: '獵人短弓', tier: 1, slot: 'WEAPON', bonusAtk: 7, basePrice: 25 }
  ],
  tier2: [
    { name: '破魔獵弓', tier: 2, slot: 'WEAPON', bonusAtk: 16, basePrice: 60 },
    { name: '秘銀法袍', tier: 2, slot: 'BODY', bonusMatk: 12, bonusHp: 20, basePrice: 60 },
    { name: '深淵壁壘盾', tier: 2, slot: 'OFFHAND', bonusDef: 14, bonusHp: 35, basePrice: 65 },
    { name: '黑曜石雙刃', tier: 2, slot: 'WEAPON', bonusAtk: 18, basePrice: 65 }
  ],
  exclusive: [
    { name: '妖刀・村雨', tier: 'CLASS_EXCLUSIVE', slot: 'CLASS_EXCLUSIVE', role: 'samurai', bonusAtk: 32, basePrice: 90 },
    { name: '大魔導護符', tier: 'CLASS_EXCLUSIVE', slot: 'CLASS_EXCLUSIVE', role: 'mage', bonusMatk: 26, basePrice: 85 },
    { name: '晨曦誓約重錘', tier: 'CLASS_EXCLUSIVE', slot: 'CLASS_EXCLUSIVE', role: 'paladin', bonusAtk: 24, bonusDef: 10, basePrice: 95 },
    { name: '禁忌厄運聖契', tier: 'CLASS_EXCLUSIVE', slot: 'CLASS_EXCLUSIVE', role: 'augur', bonusMatk: 28, basePrice: 90 },
    { name: '硃砂引靈筆', tier: 'CLASS_EXCLUSIVE', slot: 'CLASS_EXCLUSIVE', role: 'onmyoji', bonusMatk: 25, basePrice: 85 }
  ]
};

// Web Audio API Sound Synthesizer
let labWebAudioCtx = null;
function getLabAudioCtx() {
  if (!labWebAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) labWebAudioCtx = new AudioCtx();
  }
  if (labWebAudioCtx && labWebAudioCtx.state === 'suspended') {
    labWebAudioCtx.resume().catch(() => {});
  }
  return labWebAudioCtx;
}

function playLabTick(freq = 240) {
  try {
    const ctx = getLabAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch (e) {}
}

function playLabOutcomeSound(type) {
  try {
    const ctx = getLabAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    let notes = [];
    if (type === 'JACKPOT') notes = [523.25, 659.25, 783.99, 1046.50];
    else if (type === 'WIN') notes = [523.25, 659.25, 783.99];
    else if (type === 'PUSH') notes = [293.66, 440.00];
    else notes = [130.81, 185.00];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = (type === 'LOSE') ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.12, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.5);
    });
  } catch (e) {}
}

// Spark Particle Animation
function spawnLabSpark(container, x, y, color = '#fbbf24') {
  if (!container) return;
  const p = document.createElement('div');
  p.className = 'spark-particle';
  const size = 4 + Math.random() * 6;
  p.style.width = `${size}px`;
  p.style.height = `${size}px`;
  p.style.background = color;
  p.style.boxShadow = `0 0 10px ${color}`;
  p.style.left = `calc(50% + ${x}px)`;
  p.style.top = `calc(50% + ${y}px)`;
  container.appendChild(p);

  const dx = (Math.random() - 0.5) * 80;
  const dy = (Math.random() - 0.5) * 80;
  p.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 0.95 },
      { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0 }
    ],
    { duration: 450 + Math.random() * 200, easing: 'ease-out' }
  ).onfinish = () => p.remove();
}

// Tooltip Helpers for Lab Preview
function getLabTooltip() {
  return document.getElementById('floatingItemTooltip');
}

function showLabItemTooltip(item, e) {
  const tooltip = getLabTooltip();
  if (!tooltip || !item) return;
  const isExclusive = Boolean(item.role || item.slot === 'CLASS_EXCLUSIVE' || item.tier === 'CLASS_EXCLUSIVE');
  const isRare = item.tier === 2;
  const tierClass = isExclusive ? 'tier-exclusive' : (isRare ? 'tier-rare' : 'tier-common');
  const tierLabel = isExclusive ? '★ 職業專屬' : (isRare ? '二階稀有' : '一階裝備');

  const stats = [];
  if (item.bonusAtk) stats.push(`<div>物理攻擊：<span class="stat-positive">+${item.bonusAtk}</span></div>`);
  if (item.bonusMatk) stats.push(`<div>魔法攻擊：<span class="stat-positive">+${item.bonusMatk}</span></div>`);
  if (item.bonusHp) stats.push(`<div>生命上限：<span class="stat-positive">+${item.bonusHp}</span></div>`);
  if (item.bonusDef) stats.push(`<div>物理防禦：<span class="stat-positive">+${item.bonusDef}</span></div>`);
  if (item.bonusMdef) stats.push(`<div>魔法防禦：<span class="stat-positive">+${item.bonusMdef}</span></div>`);
  if (item.desc) stats.push(`<div style="color:#94a3b8;font-size:12px;margin-top:4px;">${item.desc}</div>`);

  tooltip.innerHTML = `
    <div class="tooltip-header ${tierClass}">
      <span class="tooltip-name">${item.name}</span>
      <span class="tooltip-tier-badge">${tierLabel}</span>
    </div>
    <div class="tooltip-body">
      ${stats.join('')}
    </div>
  `;
  tooltip.classList.remove('hidden');
  positionLabTooltip(e);
}

function positionLabTooltip(e) {
  const tooltip = getLabTooltip();
  if (!tooltip || tooltip.classList.contains('hidden')) return;
  const padding = 15;
  let x = e.clientX + padding;
  let y = e.clientY + padding;
  if (x + 220 > window.innerWidth) x = e.clientX - 230;
  if (y + 150 > window.innerHeight) y = e.clientY - 160;
  tooltip.style.left = `${Math.max(10, x)}px`;
  tooltip.style.top = `${Math.max(10, y)}px`;
}

function hideLabItemTooltip() {
  const tooltip = getLabTooltip();
  if (tooltip) tooltip.classList.add('hidden');
}

// Honeycomb 19-slot HTML Builder Helper
function buildLabHexGrid(items, isMerchant = false, selectedIdx = null) {
  const rowCounts = [3, 4, 5, 4, 3];
  let slotIdx = 0;
  return `
    <div class="hex-grid-squad ${isMerchant ? 'shop-goods-grid' : 'reforge-squad-grid'}">
      ${rowCounts.map(count => {
        const slotsInRow = [];
        for (let i = 0; i < count; i++) {
          const curIdx = slotIdx++;
          const item = items[curIdx] || null;
          if (item) {
            const isExclusive = Boolean(item.role || item.slot === 'CLASS_EXCLUSIVE' || item.tier === 'CLASS_EXCLUSIVE');
            const isRare = item.tier === 2;
            const rarityStroke = isExclusive ? 'var(--rarity-exclusive, #ffd700)' : (isRare ? 'var(--rarity-rare, #38bdf8)' : 'var(--hex-border, #475569)');
            const isSelected = (selectedIdx === curIdx);
            const priceTag = (isMerchant && item.price) ? `<span class="shop-slot-price-tag">${item.price}G</span>` : '';
            slotsInRow.push(`
              <div class="hex-slot has-item ${isMerchant ? 'shop-item-card' : 'squad-item-slot'} ${isSelected ? 'is-reforge-selected' : ''}"
                   data-index="${curIdx}"
                   draggable="true"
                   tabindex="0"
                   role="button"
                   aria-label="${item.name}">
                <svg class="hex-bg-svg" viewBox="0 0 100 115.47">
                  <polygon class="hex-polygon" points="50 0, 100 28.87, 100 86.6, 50 115.47, 0 86.6, 0 28.87" style="stroke: ${rarityStroke};" />
                </svg>
                ${priceTag}
                <div class="item-layer">
                  <div class="item-layer-icon-box">
                    <img src="${(item.icon && item.icon.startsWith('/')) ? item.icon : (isExclusive ? `/assets/equipment/exclusive/${encodeURIComponent(item.name)}.webp` : `/assets/equipment/general/${encodeURIComponent(item.name)}.webp`)}" class="item-equipment-img" alt="${item.name}" onerror="this.onerror=null; this.src='/assets/equipment/general/通用裝備.webp';">
                  </div>
                  <div class="item-layer-name">${item.name}</div>
                </div>
              </div>
            `);
          } else {
            slotsInRow.push(`
              <div class="hex-slot empty-slot squad-empty-slot" data-index="${curIdx}">
                <svg class="hex-bg-svg" viewBox="0 0 100 115.47">
                  <polygon class="hex-polygon" points="50 0, 100 28.87, 100 86.6, 50 115.47, 0 86.6, 0 28.87" style="opacity: 0.8;" />
                </svg>
              </div>
            `);
          }
        }
        return `<div class="hex-row">${slotsInRow.join('')}</div>`;
      }).join('')}
    </div>
  `;
}

function leaveLabEvent(name = '據點') {
  logLab('INFO', `冒險小隊告別離開${name}據點，繼續前進。`);
  const cardBox = document.getElementById('eventCardBox');
  if (cardBox) {
    cardBox.classList.add('hidden');
    cardBox.style.display = 'none';
  }
}
window.leaveLabEvent = leaveLabEvent;

// --------------------------------------------------------------------------
// 1. 命運賭局 (GAMBLE) 測試場景
// --------------------------------------------------------------------------
function playLabGambleScene(context) {
  const cardBox = document.getElementById('eventCardBox');
  const eventDetails = document.getElementById('eventDetails');
  const eventIcon = document.getElementById('eventIcon');
  const eventTitle = document.getElementById('eventTitle');
  const eventStoryText = document.getElementById('eventStoryText');

  cardBox.classList.remove('hidden', 'is-shop-event', 'is-altar-event', 'is-reforge-event');
  cardBox.classList.add('is-borderless-event', 'is-gamble-event');
  let bgImg = cardBox.querySelector('.event-bg-illustration');
  if (!bgImg) {
    bgImg = document.createElement('img');
    bgImg.className = 'event-bg-illustration';
    bgImg.alt = '';
    cardBox.prepend(bgImg);
  }
  bgImg.src = '/assets/environments/events/賭博.webp';
  cardBox.style.display = 'block';
  eventIcon.innerHTML = `<svg class="ui-icon svg-icon svg-hero-icon" viewBox="0 0 24 24"><use href="#icon-dice"></use></svg>`;
  eventTitle.textContent = '命運賭局 (20面骰)';
  eventStoryText.textContent = '迷霧中擺著一張黑曜石牌桌，一名神秘的發牌人微笑著洗牌，等待渴望財富的冒險者擲出決定命運的二十面骰。';

  let currentBet = 50;
  let betChoice = 'SMALL';
  let isRolling = false;
  let forcedRoll = null;

  function renderGambleUI() {
    const currentGold = labEventTeamState.gold;
    const minBet = currentGold >= 10 ? 10 : Math.max(1, currentGold);
    const maxBet = Math.max(1, currentGold);
    if (currentBet > currentGold) currentBet = Math.max(minBet, currentGold);

    eventDetails.innerHTML = `
      <div class="gamble-container">
        <!-- 頂部資訊與金幣欄 (商店風格) -->
        <div class="shop-header-row">
          <div class="shop-gold-badge">
            <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-gold"></use></svg>
            <span>小隊金幣：<b>${currentGold}</b> G</span>
          </div>
          <div style="font-size:13px;color:var(--ui-text-muted,#7e8c96);">
            ※ 矮人工程師幸運二十面骰：設定押注並決定押大或小，擲出幸運特賞點數可獲 3倍 獎金
          </div>
          <button type="button" class="btn-shop-action btn-shop-leave btn-rand-leave ui-button ui-button--secondary" onclick="leaveLabEvent('命運賭局');">
            <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-leave"></use></svg>
            <span>告別離開 ›</span>
          </button>
        </div>

        <!-- 規則說明橫幅 -->
        <div class="gamble-rule-banner">
          <div class="gamble-rule-icon">
            <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24" style="width:20px;height:20px;"><use href="#icon-scroll"></use></svg>
          </div>
          <div class="gamble-rule-content">
            <div class="gamble-rule-title">矮人幸運二十面骰・賭局規則</div>
            <div class="gamble-rule-text">
              【押注大或小：小 (1～9) 贏 2倍；大 (11～20) 贏 2倍。擲出 10 為平局退還押注。若押小擲出 1 或押大擲出 20，觸發極限大獎 3倍回饋！】
            </div>
          </div>
        </div>

        <div class="gamble-arena">
          <!-- 頂部金幣 -->
          <div class="gamble-wallet-bar">
            <div style="display:flex;align-items:center;gap:6px;">
              <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-gold"></use></svg>
              <span>小隊金幣：</span>
              <span class="gamble-wallet-amount" id="labGambleWalletGold">${currentGold}</span>
              <span>G</span>
            </div>
          </div>

          <!-- 畫面 1：下注設定 -->
          <div id="labGambleScreenBet" class="gamble-screen">
            <div class="gamble-bet-display">
              <span id="labGambleBetAmount">${currentBet}</span> <span class="gamble-g-unit">G</span>
            </div>

            <div class="gamble-slider-container">
              <input type="range" id="labGambleSlider" class="gold-slider" min="${minBet}" max="${maxBet}" step="10" value="${currentBet}">
              <div class="gamble-quick-buttons">
                <button type="button" class="gamble-btn-quick" data-val="min">最小</button>
                <button type="button" class="gamble-btn-quick" data-val="25%">25%</button>
                <button type="button" class="gamble-btn-quick" data-val="50%">50%</button>
                <button type="button" class="gamble-btn-quick" data-val="all">全押</button>
              </div>
            </div>

            <!-- 選擇大或小 -->
            <div class="gamble-choice-grid">
              <button type="button" id="labBtnChoiceSmall" class="gamble-choice-card is-small ${betChoice === 'SMALL' ? 'is-selected' : ''}">
                <div class="gamble-choice-label">小</div>
                <div class="gamble-choice-sub">1 ～ 9 (贏 2倍)</div>
                <div class="gamble-choice-tag">[1點特賞 3倍]</div>
              </button>
              <button type="button" id="labBtnChoiceBig" class="gamble-choice-card is-big ${betChoice === 'BIG' ? 'is-selected' : ''}">
                <div class="gamble-choice-label">大</div>
                <div class="gamble-choice-sub">11 ～ 20 (贏 2倍)</div>
                <div class="gamble-choice-tag">[20點特賞 3倍]</div>
              </button>
            </div>

            <!-- 測試快捷點數 -->
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#94a3b8;margin-top:2px;flex-wrap:wrap;justify-content:center;">
              <span style="font-family:monospace;">[指定點數]：</span>
              <button type="button" class="shop-tab-btn" id="btnForceRand" style="padding:3px 8px;min-height:24px;font-size:11px;">隨機</button>
              <button type="button" class="shop-tab-btn" id="btnForce1" style="padding:3px 8px;min-height:24px;font-size:11px;">必出 1 (3倍)</button>
              <button type="button" class="shop-tab-btn" id="btnForce10" style="padding:3px 8px;min-height:24px;font-size:11px;">必出 10 (平局)</button>
              <button type="button" class="shop-tab-btn" id="btnForce20" style="padding:3px 8px;min-height:24px;font-size:11px;">必出 20 (3倍)</button>
            </div>

            <div style="display:flex;justify-content:center;width:100%;max-width:440px;">
              <button type="button" id="btnLabRollDice" class="btn-shop-action btn-gamble-roll ui-button ui-button--primary" ${currentGold <= 0 ? 'disabled' : ''} style="width:100%;">
                <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-dice"></use></svg>
                <span>擲骰子</span>
              </button>
            </div>
          </div>

          <!-- 畫面 2：20面骰子滾動動畫舞台與結算 -->
          <div id="labGambleScreenRoll" class="gamble-screen hidden" style="position:relative;min-height:330px;justify-content:center;">
            <div id="labGambleArcaneRing" class="arcane-ring"></div>
            <div id="labGambleParticleBox" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;"></div>
            <div class="d20-stage">
              <div id="labGambleD20Wrapper" class="d20-wrapper">
                <img id="labGambleD20Img" class="d20-img" src="/assets/ui/events/d20.webp" alt="二十面骰" />
              </div>
              <div id="labGambleBigNumber" class="gamble-big-number font-cinzel hidden">20</div>
            </div>

            <!-- 結算結果 (直接置於骰子原位下方) -->
            <div id="labGambleScreenResult" class="gamble-screen-result hidden">
              <div id="labGambleOutcomeBadge" class="gamble-outcome-badge jackpot">贏 (3倍)</div>
              <div id="labGambleGoldDelta" class="gamble-gold-delta">+150 G</div>
              <div style="display:flex;gap:10px;justify-content:center;margin-top:6px;width:100%;max-width:320px;">
                <button type="button" id="btnLabGambleAgain" class="btn-shop-action btn-gamble-again ui-button ui-button--primary" style="flex:1;">
                  <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-dice"></use></svg>
                  <span>再來一局</span>
                </button>
                <button type="button" class="btn-shop-action btn-shop-leave btn-rand-leave ui-button ui-button--secondary" onclick="leaveLabEvent('命運賭局');" style="flex:1;">
                  <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-leave"></use></svg>
                  <span>告別離開 ›</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind slider & quick buttons
    const slider = document.getElementById('labGambleSlider');
    const display = document.getElementById('labGambleBetAmount');
    function updateFill() {
      if (!slider) return;
      const pct = maxBet > 0 ? Math.round((currentBet / maxBet) * 100) : 0;
      slider.style.background = `linear-gradient(90deg, #b45309 0%, #fbbf24 ${pct}%, #1e293b ${pct}%)`;
      if (display) display.textContent = currentBet;
    }
    updateFill();

    if (slider) {
      slider.oninput = (e) => {
        currentBet = Number(e.target.value);
        updateFill();
      };
    }

    eventDetails.querySelectorAll('.gamble-btn-quick').forEach(b => {
      b.onclick = () => {
        const v = b.dataset.val;
        if (v === 'min') currentBet = minBet;
        else if (v === '25%') currentBet = Math.max(minBet, Math.floor(currentGold * 0.25));
        else if (v === '50%') currentBet = Math.max(minBet, Math.floor(currentGold * 0.5));
        else if (v === 'all') currentBet = currentGold;
        if (slider) slider.value = currentBet;
        updateFill();
      };
    });

    // Choices
    const bSmall = document.getElementById('labBtnChoiceSmall');
    const bBig = document.getElementById('labBtnChoiceBig');
    if (bSmall && bBig) {
      bSmall.onclick = () => { betChoice = 'SMALL'; bSmall.classList.add('is-selected'); bBig.classList.remove('is-selected'); };
      bBig.onclick = () => { betChoice = 'BIG'; bBig.classList.add('is-selected'); bSmall.classList.remove('is-selected'); };
    }

    // Force cheat buttons for test lab
    document.getElementById('btnForceRand')?.addEventListener('click', () => { forcedRoll = null; logLab('DEBUG', '已切換為：隨機投擲'); });
    document.getElementById('btnForce1')?.addEventListener('click', () => { forcedRoll = 1; logLab('DEBUG', '已指定下次投擲點數：1 (押小 3倍大獎)'); });
    document.getElementById('btnForce10')?.addEventListener('click', () => { forcedRoll = 10; logLab('DEBUG', '已指定下次投擲點數：10 (平局退回)'); });
    document.getElementById('btnForce20')?.addEventListener('click', () => { forcedRoll = 20; logLab('DEBUG', '已指定下次投擲點數：20 (押大 3倍大獎)'); });

    // Roll
    document.getElementById('btnLabRollDice')?.addEventListener('click', () => {
      if (isRolling || currentGold <= 0) return;
      getLabAudioCtx();
      isRolling = true;
      const wager = Math.min(currentGold, currentBet);
      labEventTeamState.gold -= wager;
      document.getElementById('labGambleWalletGold').textContent = labEventTeamState.gold;

      const screenBet = document.getElementById('labGambleScreenBet');
      const screenRoll = document.getElementById('labGambleScreenRoll');
      const screenResult = document.getElementById('labGambleScreenResult');
      const d20Wrapper = document.getElementById('labGambleD20Wrapper');
      const arcaneRing = document.getElementById('labGambleArcaneRing');
      const particleBox = document.getElementById('labGambleParticleBox');
      const bigNumber = document.getElementById('labGambleBigNumber');

      if (screenBet) screenBet.classList.add('hidden');
      if (screenResult) screenResult.classList.add('hidden');
      if (bigNumber) {
        bigNumber.classList.add('hidden');
        bigNumber.classList.remove('number-pop');
      }
      if (screenRoll) screenRoll.classList.remove('hidden');
      if (d20Wrapper) {
        d20Wrapper.classList.remove('d20-vanish');
        d20Wrapper.style.opacity = '1';
        d20Wrapper.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
      }
      if (arcaneRing) arcaneRing.classList.add('active-roll');

      const roll = (forcedRoll !== null) ? forcedRoll : (Math.floor(Math.random() * 20) + 1);
      let outcomeType = 'LOSE';
      let payout = 0;

      if (roll === 10) {
        outcomeType = 'PUSH';
        payout = wager;
      } else if (betChoice === 'SMALL') {
        if (roll === 1) { outcomeType = 'JACKPOT'; payout = wager * 3; }
        else if (roll >= 2 && roll <= 9) { outcomeType = 'WIN'; payout = wager * 2; }
      } else if (betChoice === 'BIG') {
        if (roll === 20) { outcomeType = 'JACKPOT'; payout = wager * 3; }
        else if (roll >= 11 && roll <= 19) { outcomeType = 'WIN'; payout = wager * 2; }
      }

      logLab('ROLL', `下注 ${wager}G 押【${betChoice === 'SMALL' ? '小 (1~9)' : '大 (11~20)'}】... 骰子旋轉中...`);

      const totalDuration = 2200;
      const startTime = performance.now();
      let currentAngle = 0;
      let lastTick = 0;

      function frame(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / totalDuration);
        const speedFactor = Math.pow(1 - progress, 2.35);

        currentAngle += 36 * speedFactor + 0.3;
        const bounceRadius = 55 * speedFactor;
        const offsetX = Math.sin(elapsed * 0.019) * bounceRadius;
        const offsetY = Math.cos(elapsed * 0.025) * (bounceRadius * 0.75);
        const scale = 1 + Math.sin(elapsed * 0.04) * 0.12 * speedFactor;

        d20Wrapper.style.transform = `translate3d(${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px, 0) rotate(${currentAngle.toFixed(1)}deg) scale(${scale.toFixed(3)})`;

        const tickInterval = 55 + progress * 260;
        if (now - lastTick > tickInterval && progress < 0.94) {
          lastTick = now;
          playLabTick(180 + (1 - progress) * 240);
          spawnLabSpark(particleBox, offsetX, offsetY, Math.random() > 0.5 ? '#fbbf24' : '#38bdf8');
        }

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          d20Wrapper.style.transform = 'translate3d(0px, 0px, 0px) rotate(0deg) scale(1.05)';
          playLabTick(140);

          setTimeout(() => {
            d20Wrapper.classList.add('d20-vanish');
            for (let i = 0; i < 16; i++) spawnLabSpark(particleBox, 0, 0, i % 2 === 0 ? '#fde047' : '#ffffff');

            setTimeout(() => {
              if (arcaneRing) arcaneRing.classList.remove('active-roll');
              isRolling = false;

              labEventTeamState.gold += payout;
              document.getElementById('labGambleWalletGold').textContent = labEventTeamState.gold;

              const screenResult = document.getElementById('labGambleScreenResult');
              const numEl = document.getElementById('labGambleBigNumber');
              const badgeEl = document.getElementById('labGambleOutcomeBadge');
              const deltaEl = document.getElementById('labGambleGoldDelta');

              if (numEl) {
                numEl.textContent = roll;
                numEl.classList.remove('hidden');
                numEl.classList.remove('number-pop');
                void numEl.offsetWidth;
                numEl.classList.add('number-pop');

                if (outcomeType === 'JACKPOT') {
                  numEl.style.color = '#fbbf24';
                  numEl.style.textShadow = '0 0 35px rgba(251, 191, 36, 0.95)';
                } else if (outcomeType === 'WIN') {
                  numEl.style.color = '#34d399';
                  numEl.style.textShadow = '0 0 25px rgba(52, 211, 153, 0.8)';
                } else if (outcomeType === 'PUSH') {
                  numEl.style.color = '#38bdf8';
                  numEl.style.textShadow = '0 0 25px rgba(56, 189, 248, 0.8)';
                } else {
                  numEl.style.color = '#f43f5e';
                  numEl.style.textShadow = '0 0 25px rgba(244, 63, 94, 0.85)';
                }
              }

              if (screenResult && badgeEl && deltaEl) {
                screenResult.classList.remove('hidden');

                if (outcomeType === 'JACKPOT') {
                  badgeEl.className = 'gamble-outcome-badge jackpot outcome-stamp';
                  badgeEl.textContent = '贏 (3倍)';
                  deltaEl.style.color = '#fbbf24';
                  deltaEl.textContent = `+${payout} G`;
                  logLab('WIN', `[D20] 擲出極限【${roll}】點！3 倍大獎贏得 +${payout} G！`, 'success');
                } else if (outcomeType === 'WIN') {
                  badgeEl.className = 'gamble-outcome-badge win outcome-stamp';
                  badgeEl.textContent = '贏 (2倍)';
                  deltaEl.style.color = '#34d399';
                  deltaEl.textContent = `+${payout} G`;
                  logLab('WIN', `[D20] 擲出【${roll}】點！獲勝贏得 +${payout} G！`, 'success');
                } else if (outcomeType === 'PUSH') {
                  badgeEl.className = 'gamble-outcome-badge push outcome-stamp';
                  badgeEl.textContent = '平局';
                  deltaEl.style.color = '#7dd3fc';
                  deltaEl.textContent = `退回 ${wager} G`;
                  logLab('PUSH', `[D20] 擲出【10】點平局！退回押注 ${wager} G。`, 'info');
                } else {
                  badgeEl.className = 'gamble-outcome-badge lose outcome-stamp';
                  badgeEl.textContent = '輸';
                  deltaEl.style.color = '#fb7185';
                  deltaEl.textContent = `-${wager} G`;
                  logLab('LOSE', `[D20] 擲出【${roll}】點，押注失敗損失 ${wager} G……`, 'warning');
                }
              }

              playLabOutcomeSound(outcomeType);
            }, 380);
          }, 200);
        }
      }
      requestAnimationFrame(frame);
    });

    document.getElementById('btnLabGambleAgain')?.addEventListener('click', () => {
      const screenRoll = document.getElementById('labGambleScreenRoll');
      const screenResult = document.getElementById('labGambleScreenResult');
      const screenBet = document.getElementById('labGambleScreenBet');
      const numEl = document.getElementById('labGambleBigNumber');
      const d20Wrapper = document.getElementById('labGambleD20Wrapper');

      if (screenRoll) screenRoll.classList.add('hidden');
      if (screenResult) screenResult.classList.add('hidden');
      if (numEl) numEl.classList.add('hidden');
      if (screenBet) screenBet.classList.remove('hidden');
      if (d20Wrapper) {
        d20Wrapper.classList.remove('d20-vanish');
        d20Wrapper.style.opacity = '1';
      }
      renderGambleUI();
    });
  }

  renderGambleUI();
  logLab('READY', '命運賭局介面載入完成，可下注並擲骰測試。');
}

// --------------------------------------------------------------------------
// 2. 矮人鑄造工坊 (REFORGE) 測試場景
// --------------------------------------------------------------------------
function playLabReforgeScene(context) {
  const cardBox = document.getElementById('eventCardBox');
  const eventDetails = document.getElementById('eventDetails');
  const eventIcon = document.getElementById('eventIcon');
  const eventTitle = document.getElementById('eventTitle');
  const eventStoryText = document.getElementById('eventStoryText');

  cardBox.classList.remove('hidden', 'is-shop-event', 'is-altar-event', 'is-gamble-event');
  cardBox.classList.add('is-borderless-event', 'is-reforge-event');
  let bgImg = cardBox.querySelector('.event-bg-illustration');
  if (!bgImg) {
    bgImg = document.createElement('img');
    bgImg.className = 'event-bg-illustration';
    bgImg.alt = '';
    cardBox.prepend(bgImg);
  }
  bgImg.src = '/assets/environments/events/鑄造台.webp';
  cardBox.style.display = 'block';
  eventIcon.innerHTML = `<svg class="ui-icon svg-icon svg-hero-icon" viewBox="0 0 24 24"><use href="#icon-anvil"></use></svg>`;
  eventTitle.textContent = '矮人鑄造工坊 (裝備重鑄)';
  eventStoryText.textContent = '熔爐烈火照亮了地城的一隅，沉重的黑鐵鐵砧散發著灼熱的火光，矮人工匠示意你們將想要重鑄的裝備置於鐵砧之上。';

  let selectedIndex = 0; // Default select first item
  let draggedSlot = null;

  function renderReforgeUI() {
    const squadItems = labEventTeamState.squadInventory;
    const currentGold = labEventTeamState.gold;
    const selectedItem = (selectedIndex !== null && squadItems[selectedIndex]) ? squadItems[selectedIndex] : null;

    eventDetails.innerHTML = `
      <div class="reforge-container">
        <!-- 頂部資訊與金幣欄 (商店風格) -->
        <div class="shop-header-row">
          <div class="shop-gold-badge">
            <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-gold"></use></svg>
            <span>小隊金幣：<b>${currentGold}</b> G</span>
          </div>
          <div style="font-size:13px;color:var(--ui-text-muted,#7e8c96);">
            ※ 矮人古法重鑄鐵砧：消耗 10G，隨機將選取的裝備重鑄為同階、二階稀有或職業專屬神裝
          </div>
          <button type="button" class="btn-shop-action btn-shop-leave btn-rand-leave ui-button ui-button--secondary" onclick="leaveLabEvent('矮人重鑄工坊');">
            <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-leave"></use></svg>
            <span>告別離開 ›</span>
          </button>
        </div>

        <div class="reforge-main-layout">
          <!-- 左側背包 (19格) -->
          <div class="reforge-inventory-col">
            <div class="shop-col-header">
              <span class="shop-col-title">
                <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-chest"></use></svg>
                <span>小隊背包 (19格)</span>
              </span>
              <small>點選或拖曳裝備至鐵砧</small>
            </div>
            ${buildLabHexGrid(squadItems, false, selectedIndex)}
          </div>

          <!-- 右側鐵砧槽 -->
          <div class="reforge-anvil-col">
            <div class="shop-col-header">
              <span class="shop-col-title">
                <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-anvil"></use></svg>
                <span>重鑄鐵砧</span>
              </span>
              <small>重鑄消耗 10G</small>
            </div>

            <div class="reforge-slot-box ${selectedItem ? 'has-slotted-item' : 'empty'}" id="labReforgeDropBox">
              ${selectedItem ? `
                <div class="reforge-slotted-preview">
                  <div class="reforge-slotted-icon">
                    <img src="/assets/equipment/general/${encodeURIComponent(selectedItem.name)}.webp" class="reforge-preview-img" onerror="this.onerror=null; this.src='/assets/equipment/general/通用裝備.webp';">
                  </div>
                  <div class="reforge-slotted-name">${selectedItem.name}</div>
                  <div class="reforge-slotted-stats">
                    ${selectedItem.bonusAtk ? `物攻 +${selectedItem.bonusAtk}` : ''}
                    ${selectedItem.bonusMatk ? `魔攻 +${selectedItem.bonusMatk}` : ''}
                    ${selectedItem.bonusHp ? `生命 +${selectedItem.bonusHp}` : ''}
                    ${selectedItem.bonusDef ? `防禦 +${selectedItem.bonusDef}` : ''}
                  </div>
                  <button type="button" class="btn-shop-action reforge-remove-btn" id="btnLabRemoveReforge">
                    <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24" style="width:12px;height:12px;"><use href="#icon-close"></use></svg>
                    <span>取出</span>
                  </button>
                </div>
              ` : `
                <div class="reforge-placeholder-icon">
                  <svg class="ui-icon svg-icon" viewBox="0 0 24 24" style="width:36px;height:36px;fill:currentColor;"><use href="#icon-anvil"></use></svg>
                </div>
                <div class="reforge-placeholder-text">點選左側背包裝備<br>或將裝備拖曳至此處</div>
              `}
            </div>

            <div class="reforge-info-panel">
              <div class="reforge-info-row">
                <span>重鑄費用：</span>
                <b>10 G</b>
              </div>
              <div class="reforge-info-row">
                <span>持有金幣：</span>
                <b style="${currentGold < 10 ? 'color: #f87171;' : 'color: #34d399;'}">${currentGold} G</b>
              </div>
            </div>

            <div class="reforge-tip-text">
              消耗 10G，隨機重鑄為一件裝備（可能變為一階、二階或各職業專屬神裝）。
            </div>

            <div class="reforge-actions-bar">
              <button type="button" class="btn-shop-action btn-reforge-execute ui-button ui-button--primary" id="btnLabExecReforge" ${(!selectedItem || currentGold < 10) ? 'disabled' : ''}>
                <svg class="ui-icon svg-icon ui-icon--sm" viewBox="0 0 24 24"><use href="#icon-anvil"></use></svg>
                <span>開始重鑄 (10G)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind item clicks, tooltips, and drag
    eventDetails.querySelectorAll('.hex-slot.squad-item-slot').forEach(slot => {
      const idx = Number(slot.dataset.index);
      const it = squadItems[idx];
      if (it) {
        slot.onclick = () => { selectedIndex = idx; renderReforgeUI(); };
        slot.onmouseenter = (e) => showLabItemTooltip(it, e);
        slot.onmousemove = (e) => positionLabTooltip(e);
        slot.onmouseleave = () => hideLabItemTooltip();

        slot.ondragstart = (e) => {
          draggedSlot = { index: idx, item: it };
          slot.classList.add('is-dragging');
          hideLabItemTooltip();
          e.dataTransfer.effectAllowed = 'move';
        };
        slot.ondragend = () => {
          slot.classList.remove('is-dragging');
          draggedSlot = null;
        };
      }
    });

    // Drop target
    const dropBox = document.getElementById('labReforgeDropBox');
    if (dropBox) {
      dropBox.ondragover = (e) => {
        if (draggedSlot) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dropBox.classList.add('drag-over-reforge'); }
      };
      dropBox.ondragleave = () => dropBox.classList.remove('drag-over-reforge');
      dropBox.ondrop = (e) => {
        if (draggedSlot) {
          e.preventDefault();
          dropBox.classList.remove('drag-over-reforge');
          selectedIndex = draggedSlot.index;
          draggedSlot = null;
          renderReforgeUI();
        }
      };
    }

    // Remove
    document.getElementById('btnLabRemoveReforge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedIndex = null;
      renderReforgeUI();
    });

    // Execute Reforge
    document.getElementById('btnLabExecReforge')?.addEventListener('click', () => {
      if (selectedIndex === null || !squadItems[selectedIndex] || labEventTeamState.gold < 10) return;
      labEventTeamState.gold -= 10;
      const oldItem = squadItems[selectedIndex];

      // Roll pool
      const roll = Math.random();
      let pool = LAB_REFORGE_POOLS.tier1;
      let poolLabel = '一階裝備';
      if (roll < 0.40) { pool = LAB_REFORGE_POOLS.tier1; poolLabel = '一階裝備'; }
      else if (roll < 0.80) { pool = LAB_REFORGE_POOLS.tier2; poolLabel = '二階稀有裝備'; }
      else { pool = LAB_REFORGE_POOLS.exclusive; poolLabel = '職業專屬神裝'; }

      const newItem = structuredClone(pool[Math.floor(Math.random() * pool.length)]);
      squadItems[selectedIndex] = newItem;

      playLabTick(340);
      logLab('REFORGE', `[重鑄] 消耗 10G 將【${oldItem.name}】重鑄為 ${poolLabel}【${newItem.name}】！`, 'success');
      renderReforgeUI();
    });
  }

  renderReforgeUI();
  logLab('READY', '矮人重鑄工坊載入完成，可選擇背包裝備並進行 10G 重鑄測試。');
}

// --------------------------------------------------------------------------
// 3. 古老深淵祭壇 (ALTAR) 測試場景
// --------------------------------------------------------------------------
function playLabAltarScene(context) {
  const cardBox = document.getElementById('eventCardBox');
  const eventDetails = document.getElementById('eventDetails');
  const eventIcon = document.getElementById('eventIcon');
  const eventTitle = document.getElementById('eventTitle');
  const eventStoryText = document.getElementById('eventStoryText');

  cardBox.classList.remove('hidden', 'is-shop-event', 'is-reforge-event', 'is-gamble-event');
  cardBox.classList.add('is-borderless-event', 'is-altar-event');
  let bgImg = cardBox.querySelector('.event-bg-illustration');
  if (!bgImg) {
    bgImg = document.createElement('img');
    bgImg.className = 'event-bg-illustration';
    bgImg.alt = '';
    cardBox.prepend(bgImg);
  }
  bgImg.src = '/assets/environments/events/獻祭台.webp';
  cardBox.style.display = 'block';
  eventIcon.innerHTML = `<svg class="ui-icon svg-icon svg-hero-icon" viewBox="0 0 24 24"><use href="#icon-torii"></use></svg>`;
  eventTitle.textContent = '古老深淵祭壇';
  eventStoryText.textContent = '一座刻滿禁忌古代銘文的石質祭壇，散發著令人心悸的威壓。獻出鮮血或搜刮遺物，代價自負。';

  eventDetails.innerHTML = `
    <div class="rand-event-container altar-container">
      <div class="rand-event-actions">
        <button type="button" class="btn-rand-action" id="btnAltarSacrifice">
          <svg class="ui-icon" style="width:16px;height:16px;"><use href="#icon-sword"></use></svg>
          <span>鮮血獻祭 (全員扣20%HP，永久+3攻擊 & T2裝備)</span>
        </button>
        <button type="button" class="btn-rand-action" id="btnAltarDesecrate">
          <svg class="ui-icon" style="width:16px;height:16px;"><use href="#icon-gold"></use></svg>
          <span>搜刮祭壇 (+60G & T1裝備，受到減防詛咒)</span>
        </button>
        <button type="button" class="btn-rand-action" id="btnAltarPurify">
          <svg class="ui-icon" style="width:16px;height:16px;"><use href="#icon-shield"></use></svg>
          <span>聖光淨化 (聖騎士專屬免代價回復30%HP與15護盾)</span>
        </button>
      </div>
      <button type="button" class="btn btn-ghost btn-rand-action btn-rand-leave" onclick="leaveLabEvent('古老深淵祭壇');">
        <svg class="ui-icon" style="width:16px;height:16px;"><use href="#icon-leave"></use></svg>
        <span>離開據點 ›</span>
      </button>
    </div>
  `;

  document.getElementById('btnAltarSacrifice')?.addEventListener('click', () => {
    labEventTeamState.players.forEach(p => p.hp = Math.max(1, Math.floor(p.hp * 0.8)));
    const item = structuredClone(LAB_REFORGE_POOLS.tier2[0]);
    labEventTeamState.squadInventory.push(item);
    playLabTick(260);
    logLab('SACRIFICE', `🩸 全員獻祭 20% 生命，獲得全隊永久 +3 攻擊力與【${item.name}】！`, 'warning');
  });

  document.getElementById('btnAltarDesecrate')?.addEventListener('click', () => {
    labEventTeamState.gold += 60;
    const item = structuredClone(LAB_REFORGE_POOLS.tier1[0]);
    labEventTeamState.squadInventory.push(item);
    playLabTick(320);
    logLab('DESECRATE', `💰 搜刮祭壇獲得 +60G 與【${item.name}】，但全隊受到了減防詛咒！`, 'loot');
  });

  document.getElementById('btnAltarPurify')?.addEventListener('click', () => {
    labEventTeamState.players.forEach(p => p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.3)));
    playLabTick(440);
    logLab('PURIFY', `🛡️✨ 聖光降臨淨化了祭壇！全員生命回復 30% 並附加 15 點神聖護盾！`, 'success');
  });

  logLab('READY', '古老深淵祭壇載入完成。');
}

// --------------------------------------------------------------------------
// 4. 迷途流浪商人 (WANDERING_MERCHANT) 測試場景
// --------------------------------------------------------------------------
function playLabWanderingMerchantScene(context) {
  const cardBox = document.getElementById('eventCardBox');
  const eventDetails = document.getElementById('eventDetails');
  const eventIcon = document.getElementById('eventIcon');
  const eventTitle = document.getElementById('eventTitle');
  const eventStoryText = document.getElementById('eventStoryText');

  cardBox.classList.remove('hidden', 'is-shop-event');
  cardBox.style.display = 'block';
  eventIcon.innerHTML = `<svg class="ui-icon svg-icon svg-hero-icon" viewBox="0 0 24 24"><use href="#icon-camp"></use></svg>`;
  eventTitle.textContent = '迷途流浪商人';
  eventStoryText.textContent = '一名背負巨大行囊的流浪行者向你們招手，願意以物易物或分享前方情報。';

  eventDetails.innerHTML = `
    <div class="rand-event-container">
      <div class="rand-event-actions">
        <button type="button" class="btn-rand-action" id="btnMercInfo">
          <svg class="ui-icon" style="width:16px;height:16px;"><use href="#icon-camp"></use></svg>
          <span>打探路況情報 (15G)</span>
        </button>
        <button type="button" class="btn-rand-action" id="btnMercBarter">
          <svg class="ui-icon" style="width:16px;height:16px;"><use href="#icon-chest"></use></svg>
          <span>以物易物 (隨機交換小隊背包首件物品)</span>
        </button>
        <button type="button" class="btn-rand-action" id="btnMercReshape">
          <svg class="ui-icon" style="width:16px;height:16px;"><use href="#icon-sparkle"></use></svg>
          <span>幻象重塑 (織夢術士專屬重塑配飾)</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById('btnMercInfo')?.addEventListener('click', () => {
    if (labEventTeamState.gold >= 15) {
      labEventTeamState.gold -= 15;
      playLabTick(280);
      logLab('INFO', '🗺️ 商人詳細告知了前方深淵的守衛分布：下一層將遭遇精英魔物，建議備妥治療！', 'info');
    } else {
      logLab('WARNING', '金幣不足 15G！', 'error');
    }
  });

  document.getElementById('btnMercBarter')?.addEventListener('click', () => {
    if (labEventTeamState.squadInventory.length > 0) {
      const oldIt = labEventTeamState.squadInventory[0];
      const newIt = structuredClone(LAB_REFORGE_POOLS.tier2[1]);
      labEventTeamState.squadInventory[0] = newIt;
      playLabTick(320);
      logLab('BARTER', `🔄 以物易物：以【${oldIt.name}】交換得流浪商人的珍藏【${newIt.name}】！`, 'loot');
    }
  });

  document.getElementById('btnMercReshape')?.addEventListener('click', () => {
    playLabTick(400);
    logLab('RESHAPE', '✨ 織夢術士引導幻象結晶，成功將配飾重塑為夢境符文屬性！', 'success');
  });

  logLab('READY', '迷途流浪商人載入完成。');
}

// --------------------------------------------------------------------------
// 5. 商店系列 (STANDARD, SHADY, PREP) 測試場景
// --------------------------------------------------------------------------
function playLabShopScene(variant = 'standard', context) {
  const cardBox = document.getElementById('eventCardBox');
  const eventDetails = document.getElementById('eventDetails');
  const eventIcon = document.getElementById('eventIcon');
  const eventTitle = document.getElementById('eventTitle');
  const eventStoryText = document.getElementById('eventStoryText');

  cardBox.classList.remove('hidden');
  cardBox.classList.add('is-shop-event');
  cardBox.style.display = 'block';

  const isShady = (variant === 'shady');
  const isPrep = (variant === 'prep');

  eventIcon.innerHTML = `<svg class="ui-icon svg-icon svg-hero-icon" viewBox="0 0 24 24"><use href="#icon-${isPrep ? 'camp' : 'shop'}"></use></svg>`;
  eventTitle.textContent = isShady ? '迷宮行商據點' : (isPrep ? '出發前行前整備' : '迷宮行商據點');
  eventStoryText.textContent = isShady
    ? '迷宮深處，一名披著舊斗篷的商人向冒險小隊招手，攤位上擺滿各式裝備與補給品。他熱情地邀請眾人停下腳步。'
    : (isPrep ? '出發前往深淵前的補給站，冒險者們在此挑選最初的裝備與補給。' : '商隊在此建立了穩固的臨時據點，貨架上整齊陳列著精良兵刃與補給品。');

  const shopGoods = isShady
    ? [
        { name: '妖刀・村雨', tier: 'CLASS_EXCLUSIVE', price: 130, bonusAtk: 32 },
        { name: '禁忌厄運聖契', tier: 'CLASS_EXCLUSIVE', price: 120, bonusMatk: 28 },
        { name: '黑曜石雙刃', tier: 2, price: 90, bonusAtk: 20 },
        { name: '致命劇毒淬劑', tier: 1, slot: 'CONSUMABLE', type: 'CONSUMABLE', price: 40, desc: '普攻附加劇毒' }
      ]
    : (isPrep
      ? [
          { name: '鍛造鐵劍', tier: 1, price: 25, bonusAtk: 8 },
          { name: '精鋼重盾', tier: 1, price: 25, bonusDef: 6 },
          { name: '冒險乾糧', tier: 1, slot: 'CONSUMABLE', type: 'CONSUMABLE', price: 10, desc: '回復 20 點生命值' }
        ]
      : [
          { name: '秘銀重鎧', tier: 2, price: 60, bonusHp: 30, bonusDef: 8 },
          { name: '破魔獵弓', tier: 2, price: 55, bonusAtk: 16 },
          { name: '大魔導護符', tier: 'CLASS_EXCLUSIVE', price: 80, bonusMatk: 22 },
          { name: '強效治療藥水', tier: 1, slot: 'CONSUMABLE', type: 'CONSUMABLE', price: 20, desc: '回復 50 點生命值' },
          { name: '神聖護盾卷軸', tier: 1, slot: 'CONSUMABLE', type: 'CONSUMABLE', price: 25, desc: '全員附加 20 點護盾' }
        ]);

  let currentTab = 'all';
  let inspectedItem = null;
  let isInspectedFromShop = false;

  function renderShopUI() {
    const squadItems = labEventTeamState.squadInventory;
    const currentGold = labEventTeamState.gold;

    eventDetails.innerHTML = `
      <div class="shop-container">
        <!-- 頂部列 -->
        <div class="shop-header-row">
          <div class="shop-gold-badge">
            <svg class="ui-icon" style="width:16px;height:16px;"><use href="#icon-gold"></use></svg>
            <span>小隊金幣：<b id="labShopGoldText">${currentGold}</b> G</span>
          </div>
          <div style="font-size:13px;color:#94a3b8;">
            ${isShady ? '※ 黑市奸商物品售價昂貴，但可嘗試強取或暗行行竊' : '※ 商隊信譽優良，提供充足休整與物資採購'}
          </div>
        </div>

        <!-- 雙欄主舞台 -->
        <div class="shop-goods-area">
          <div class="shop-column shop-goods-col">
            <div class="shop-col-title">
              <span>商品貨架</span>
            </div>
            ${buildLabHexGrid(shopGoods, true)}
          </div>

          <div class="shop-column shop-squad-col">
            <div class="shop-col-title">
              <span>小隊背包</span>
            </div>
            ${buildLabHexGrid(squadItems, false)}
          </div>
        </div>

        <!-- 檢查器與交易操作 -->
        <div class="shop-trade-panel">
          <div class="shop-trade-info">
            <div id="labShopTradeTitle" style="font-size:16px;font-weight:800;color:#fbbf24;">
              ${inspectedItem ? inspectedItem.name : '點選貨架商品或背包物品'}
            </div>
            <div id="labShopTradeDesc" style="font-size:13px;color:#cbd5e1;margin-top:4px;">
              ${inspectedItem ? (isInspectedFromShop ? `售價：${inspectedItem.price} G` : `回收價：${Math.floor(inspectedItem.basePrice * 0.5)} G`) : '可選取商品購買，或選取背包裝備出售。'}
            </div>
          </div>
          <div class="shop-trade-actions">
            ${inspectedItem && isInspectedFromShop ? `
              <button type="button" class="btn btn-primary" id="btnLabBuyItem" ${currentGold < inspectedItem.price ? 'disabled' : ''}>
                購買 (${inspectedItem.price} G)
              </button>
            ` : ''}
            ${inspectedItem && !isInspectedFromShop ? `
              <button type="button" class="btn btn-primary" id="btnLabSellItem">
                出售 (+${Math.floor(inspectedItem.basePrice * 0.5)} G)
              </button>
            ` : ''}
            <button type="button" class="btn btn-secondary" id="btnLabRestParty">
              在營地休整 (+25 HP / 30G)
            </button>
          </div>
        </div>

        ${isShady ? `
          <!-- 黑市特殊行動 -->
          <div class="shop-special-actions" style="margin-top:10px;display:flex;gap:12px;">
            <button type="button" class="btn btn-danger btn-shop-rob" id="btnLabRobShop" style="background:#b91c1c;color:#fff;">
              🗡️ 強取豪奪 (搶劫黑市)
            </button>
            <button type="button" class="btn btn-success btn-shop-steal" id="btnLabStealShop" style="background:#047857;color:#fff;">
              🧤 暗行行竊 (偷取商品)
            </button>
          </div>
        ` : ''}
      </div>
    `;

    // Bind item click for inspection & tooltips
    eventDetails.querySelectorAll('.hex-slot.shop-item-card').forEach(slot => {
      const idx = Number(slot.dataset.index);
      const it = shopGoods[idx];
      if (it) {
        slot.onclick = () => { inspectedItem = it; isInspectedFromShop = true; renderShopUI(); };
        slot.onmouseenter = (e) => showLabItemTooltip(it, e);
        slot.onmousemove = (e) => positionLabTooltip(e);
        slot.onmouseleave = () => hideLabItemTooltip();
      }
    });

    eventDetails.querySelectorAll('.hex-slot.squad-item-slot').forEach(slot => {
      const idx = Number(slot.dataset.index);
      const it = squadItems[idx];
      if (it) {
        slot.onclick = () => { inspectedItem = it; isInspectedFromShop = false; renderShopUI(); };
        slot.onmouseenter = (e) => showLabItemTooltip(it, e);
        slot.onmousemove = (e) => positionLabTooltip(e);
        slot.onmouseleave = () => hideLabItemTooltip();
      }
    });

    // Buy Action
    document.getElementById('btnLabBuyItem')?.addEventListener('click', () => {
      if (!inspectedItem || labEventTeamState.gold < inspectedItem.price) return;
      labEventTeamState.gold -= inspectedItem.price;
      labEventTeamState.squadInventory.push(structuredClone(inspectedItem));
      playLabTick(320);
      logLab('BUY', `🛒 購買了【${inspectedItem.name}】，扣除 ${inspectedItem.price} G！`, 'loot');
      inspectedItem = null;
      renderShopUI();
    });

    // Sell Action
    document.getElementById('btnLabSellItem')?.addEventListener('click', () => {
      if (!inspectedItem) return;
      const sellPrice = Math.floor(inspectedItem.basePrice * 0.5);
      labEventTeamState.gold += sellPrice;
      const idx = labEventTeamState.squadInventory.indexOf(inspectedItem);
      if (idx !== -1) labEventTeamState.squadInventory.splice(idx, 1);
      playLabTick(280);
      logLab('SELL', `💰 賣出了【${inspectedItem.name}】，獲得 +${sellPrice} G！`, 'info');
      inspectedItem = null;
      renderShopUI();
    });

    // Rest Action
    document.getElementById('btnLabRestParty')?.addEventListener('click', () => {
      if (labEventTeamState.gold < 30) {
        logLab('WARNING', '金幣不足 30G 無法休整！', 'error');
        return;
      }
      labEventTeamState.gold -= 30;
      labEventTeamState.players.forEach(p => p.hp = Math.min(p.maxHp, p.hp + 25));
      playLabTick(440);
      logLab('REST', '🏕️ 全體隊員在營地紮營休整，生命值回復 +25 HP！', 'success');
      renderShopUI();
    });

    // Shady actions
    document.getElementById('btnLabRobShop')?.addEventListener('click', () => {
      const success = Math.random() < 0.5;
      if (success) {
        const item = structuredClone(shopGoods[0]);
        labEventTeamState.squadInventory.push(item);
        logLab('ROB', `🗡️ 搶劫黑市成功！奪得了珍稀寶物【${item.name}】！`, 'loot');
      } else {
        labEventTeamState.players.forEach(p => p.hp = Math.max(1, p.hp - 20));
        logLab('ROB', '🗡️ 搶劫失敗！黑市護衛強力反擊，小隊全員受到 20 點傷害！', 'error');
      }
    });

    document.getElementById('btnLabStealShop')?.addEventListener('click', () => {
      const success = Math.random() < 0.6;
      if (success) {
        const item = structuredClone(shopGoods[1]);
        labEventTeamState.squadInventory.push(item);
        logLab('STEAL', `🧤 暗行行竊成功！悄悄順走了【${item.name}】！`, 'loot');
      } else {
        logLab('STEAL', '🧤 行竊被奸商當場識破並驅逐！', 'warning');
      }
    });
  }

  renderShopUI();
  logLab('READY', `${eventTitle.textContent} 載入完成。`);
}

// --------------------------------------------------------------------------
// 6. 奇怪的寶箱 (MIMIC) 測試場景
// --------------------------------------------------------------------------
function playLabMimicScene(context) {
  const cardBox = document.getElementById('eventCardBox');
  const eventDetails = document.getElementById('eventDetails');
  const eventIcon = document.getElementById('eventIcon');
  const eventTitle = document.getElementById('eventTitle');
  const eventStoryText = document.getElementById('eventStoryText');

  cardBox.classList.remove('hidden', 'is-shop-event');
  cardBox.style.display = 'block';
  eventIcon.innerHTML = `<svg class="ui-icon svg-icon svg-hero-icon" viewBox="0 0 24 24"><use href="#icon-trap"></use></svg>`;
  eventTitle.textContent = '👾 奇怪的寶箱突襲！';
  eventStoryText.textContent = '眾人滿心期待地掀開寶箱，箱緣卻突然長出兩排巨大的尖牙！箱內一顆顆金黃眼睛同時睜開，濕滑的紫色長舌捲過金幣，根爪撐起沉重箱身，朝小隊猛撲亂咬。眾人閃避不及，被突如其來的獠牙咬傷；這竟是一隻「奇怪的寶箱」！牠仍把財寶含在嘴裡，貪婪地盯著你們的裝備與錢袋……';

  eventDetails.innerHTML = `
    <div class="rand-event-container">
      <div class="mimic-actions-row" style="display:flex;gap:12px;justify-content:center;margin-top:16px;">
        <button type="button" class="btn btn-danger btn-mimic-open" id="btnMimicForce" style="background:#b91c1c;color:#fff;padding:12px 20px;font-weight:700;border-radius:8px;">
          ⚔️ 進入戰鬥 (HP100／攻擊10；開場全體咬擊、CD3竊取猛咬)
        </button>
      </div>
    </div>
  `;

  document.getElementById('btnMimicForce')?.addEventListener('click', () => {
    playScene('art_enemy_treasure_mimic_3');
  });


  logLab('READY', '奇怪的寶箱事件載入完成。');
}

// --------------------------------------------------------------------------
// 主要調度入口 (Main Dispatcher for Presentation Lab)
// --------------------------------------------------------------------------
async function playEventLabScene(sceneName, context) {
  const scene = EVENT_LAB_SCENES[sceneName];
  if (!scene) return;

  logLab('EVENT', `載入事件場景：${scene.label}`);
  const tagEl = document.getElementById('labActiveSceneTag');
  if (tagEl) tagEl.textContent = scene.tag || 'EVENT';

  // Make sure viewEvent is active and other exploration views are hidden
  const viewEvent = document.getElementById('viewEvent');
  const viewRoute = document.getElementById('viewRoute');
  const viewPrologue = document.getElementById('viewPrologue');
  const viewStatusLab = document.getElementById('viewStatusLab');

  if (viewEvent) { viewEvent.classList.remove('hidden'); viewEvent.classList.add('active'); }
  if (viewRoute) viewRoute.classList.add('hidden');
  if (viewPrologue) viewPrologue.classList.add('hidden');
  if (viewStatusLab) viewStatusLab.classList.add('hidden');

  const cardBoxEl = document.getElementById('eventCardBox');
  if (cardBoxEl) {
    cardBoxEl.classList.remove('is-borderless-event', 'is-altar-event', 'is-gamble-event', 'is-reforge-event');
    cardBoxEl.querySelector('.event-bg-illustration')?.remove();
  }

  // Hide chest/trap discovery elements
  document.getElementById('chestDiscoverySection')?.classList.add('hidden');
  document.getElementById('trapDiscoverySection')?.classList.add('hidden');

  switch (sceneName) {
    case 'event_gamble':
      playLabGambleScene(context);
      break;
    case 'event_reforge':
      playLabReforgeScene(context);
      break;
    case 'event_altar':
      playLabAltarScene(context);
      break;
    case 'event_wandering_merchant':
      playLabWanderingMerchantScene(context);
      break;
    case 'event_shop_standard':
      playLabShopScene('standard', context);
      break;
    case 'event_shop_shady':
      playLabShopScene('shady', context);
      break;
    case 'event_shop_prep':
      playLabShopScene('prep', context);
      break;
    case 'event_mimic_chest':
      playLabMimicScene(context);
      break;
    default:
      logLab('WARN', `未知事件場景：${sceneName}`);
  }
}
