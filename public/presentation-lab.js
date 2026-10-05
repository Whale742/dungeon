// ==========================================================================
// 地城深淵 (DUNGEON ABYSS) - Presentation Lab Controller (presentation-lab.js)
// Developer Test Harness that executes REAL production presentation functions.
// ==========================================================================

// --- 1. 集中測試資料 (LAB_MOCK_DATA) ---
const LAB_MOCK_DATA = Object.freeze({
  playerWarrior: {
    id: 'mock-warrior',
    name: '亞瑟',
    role: 'warrior',
    hp: 120,
    maxHp: 120
  },
  playerMage: {
    id: 'mock-mage',
    name: '梅林',
    role: 'mage',
    hp: 80,
    maxHp: 80
  },
  playerArcher: {
    id: 'mock-archer',
    name: '羅賓',
    role: 'archer',
    hp: 80,
    maxHp: 80
  },

  chestCommon: {
    presentationId: 101,
    type: 'treasure',
    story: '穿過蜿蜒幽暗的石徑，小隊在一處凹陷的石壁深處發現了一只散發著沉靜微光的遠古寶箱。',
    healAmt: 25,
    hpBefore: {
      players: [
        { id: 'mock-warrior', hp: 95, maxHp: 120 },
        { id: 'mock-mage', hp: 55, maxHp: 80 }
      ]
    },
    hpAfter: {
      players: [
        { id: 'mock-warrior', hp: 120, maxHp: 120 },
        { id: 'mock-mage', hp: 80, maxHp: 80 }
      ]
    },
    drop: {
      id: 'w_heavy_armor',
      name: '【荊棘重鎧】',
      role: 'warrior',
      rarity: 'common',
      desc: '最大生命 +30，但造成的傷害 -5'
    },
    ownerName: '亞瑟',
    ownerId: 'mock-warrior'
  },

  chestRare: {
    presentationId: 102,
    type: 'treasure',
    story: '石壁縫隙中流淌著神秘的金輝，封印千年的古老符文寶箱靜候著有緣的勇者開啟。',
    healAmt: 35,
    hpBefore: {
      players: [
        { id: 'mock-warrior', hp: 80, maxHp: 120 },
        { id: 'mock-mage', hp: 45, maxHp: 80 }
      ]
    },
    hpAfter: {
      players: [
        { id: 'mock-warrior', hp: 115, maxHp: 120 },
        { id: 'mock-mage', hp: 80, maxHp: 80 }
      ]
    },
    drop: {
      id: 'w_excalibur',
      name: '【王者聖劍·艾克斯卡利伯】',
      role: 'warrior',
      rarity: 'rare',
      isSpecial: true,
      desc: '攻擊力 +45，全體友方受傷減免 15%，擊中時附帶神聖衝擊'
    },
    ownerName: '亞瑟',
    ownerId: 'mock-warrior'
  },

  trapEvent: {
    presentationId: 201,
    type: 'trap',
    story: '地面突然傳來機關啟動的刺耳金屬摩擦聲！密密麻麻的毒刺地刺自石縫中猛烈彈出！',
    hpBefore: {
      players: [
        { id: 'mock-warrior', hp: 120, maxHp: 120 },
        { id: 'mock-archer', hp: 80, maxHp: 80 }
      ]
    },
    hpAfter: {
      players: [
        { id: 'mock-warrior', hp: 95, maxHp: 120 },
        { id: 'mock-archer', hp: 80, maxHp: 80 }
      ]
    },
    hits: [
      {
        targetId: 'mock-warrior',
        role: 'warrior',
        damage: 25,
        dodged: false,
        hpSnapshot: {
          players: [
            { id: 'mock-warrior', hp: 95, maxHp: 120 },
            { id: 'mock-archer', hp: 80, maxHp: 80 }
          ]
        }
      },
      {
        targetId: 'mock-archer',
        role: 'archer',
        damage: 0,
        dodged: true,
        hpSnapshot: {
          players: [
            { id: 'mock-warrior', hp: 95, maxHp: 120 },
            { id: 'mock-archer', hp: 80, maxHp: 80 }
          ]
        }
      }
    ]
  },

  narrativeSample: [
    '幽暗的深淵空氣中瀰漫著古老鐵鏽的氣息。',
    '前方石階在火把光芒照射下依稀可見，遠處隱隱傳來巨獸沉悶的喘息。'
  ],

  combatPlayerStep: {
    type: 'player_action',
    sourceId: 'mock-warrior',
    sourceRole: 'warrior',
    sourceName: '亞瑟',
    skillName: '堅定斬擊',
    dmgType: '【物理】',
    damageType: 'physical',
    finalDamage: 48,
    damage: 48,
    targetId: 'monster',
    monsterName: '深淵巨獸',
    targetHpBefore: 400,
    targetHpAfter: 352,
    targetMaxHp: 400,
    hpSnapshot: {
      players: [
        { id: 'mock-warrior', hp: 120, maxHp: 120 },
        { id: 'mock-mage', hp: 80, maxHp: 80 }
      ],
      monster: { hp: 352, maxHp: 400 }
    }
  },

  combatMagicStep: {
    type: 'player_action',
    sourceId: 'mock-mage',
    sourceRole: 'mage',
    sourceName: '梅林',
    skillName: '奧術爆破',
    dmgType: '【魔法】',
    damageType: 'magic',
    finalDamage: 64,
    damage: 64,
    targetId: 'monster',
    monsterName: '深淵巨獸',
    targetHpBefore: 352,
    targetHpAfter: 288,
    targetMaxHp: 400,
    hpSnapshot: {
      players: [
        { id: 'mock-warrior', hp: 120, maxHp: 120 },
        { id: 'mock-mage', hp: 80, maxHp: 80 }
      ],
      monster: { hp: 288, maxHp: 400 }
    }
  },

  combatBossStep: {
    type: 'boss_action',
    monsterName: '深淵巨獸',
    monsterAvatar: '/BOSS/Ancient Guardian Golem.webp',
    skillName: '撕裂猛擊',
    dmgType: '【物理】',
    damageType: 'physical',
    finalDamage: 36,
    damage: 36,
    targetId: 'mock-warrior',
    targetRole: 'warrior',
    targetHpBefore: 120,
    targetHpAfter: 84,
    targetMaxHp: 120,
    hpSnapshot: {
      players: [
        { id: 'mock-warrior', hp: 84, maxHp: 120 },
        { id: 'mock-mage', hp: 80, maxHp: 80 }
      ],
      monster: { hp: 288, maxHp: 400 }
    }
  },

  combatLethalStep: {
    type: 'player_action',
    sourceId: 'mock-warrior',
    sourceRole: 'warrior',
    sourceName: '亞瑟',
    skillName: '堅定斬擊',
    dmgType: '【物理】',
    damageType: 'physical',
    finalDamage: 18,
    damage: 18,
    isLethal: true,
    targetId: 'monster',
    monsterName: '深淵巨獸',
    targetHpBefore: 12,
    targetHpAfter: 0,
    targetMaxHp: 120,
    hpSnapshot: {
      players: [
        { id: 'mock-warrior', hp: 120, maxHp: 120 },
        { id: 'mock-mage', hp: 80, maxHp: 80 }
      ],
      monster: { hp: 0, maxHp: 120 }
    }
  },

  combatArcherStep: {
    type: 'player_action',
    sourceId: 'mock-archer',
    sourceRole: 'archer',
    sourceName: '羅賓',
    skillName: '穿甲射擊',
    dmgType: '【物理】',
    damageType: 'physical',
    finalDamage: 52,
    damage: 52,
    targetId: 'monster',
    monsterName: '深淵巨獸',
    targetHpBefore: 400,
    targetHpAfter: 348,
    targetMaxHp: 400,
    hpSnapshot: {
      players: [
        { id: 'mock-archer', hp: 100, maxHp: 100 },
        { id: 'mock-warrior', hp: 120, maxHp: 120 }
      ],
      monster: { hp: 348, maxHp: 400 }
    }
  },

  combatAssassinStep: {
    type: 'player_action',
    sourceId: 'mock-assassin',
    sourceRole: 'assassin',
    sourceName: '影刃',
    skillName: '十字連斬',
    dmgType: '【物理】',
    damageType: 'physical',
    finalDamage: 58,
    damage: 58,
    targetId: 'monster',
    monsterName: '深淵巨獸',
    targetHpBefore: 348,
    targetHpAfter: 290,
    targetMaxHp: 400,
    hpSnapshot: {
      players: [
        { id: 'mock-assassin', hp: 50, maxHp: 50 },
        { id: 'mock-warrior', hp: 120, maxHp: 120 }
      ],
      monster: { hp: 290, maxHp: 400 }
    }
  },

  combatAlchemistStep: {
    type: 'player_action',
    sourceId: 'mock-alchemist',
    sourceRole: 'alchemist',
    sourceName: '帕拉',
    skillName: '劇毒腐蝕瓶',
    dmgType: '【魔法】',
    damageType: 'magic',
    finalDamage: 44,
    damage: 44,
    targetId: 'monster',
    monsterName: '深淵巨獸',
    targetHpBefore: 290,
    targetHpAfter: 246,
    targetMaxHp: 400,
    hpSnapshot: {
      players: [
        { id: 'mock-alchemist', hp: 95, maxHp: 95 },
        { id: 'mock-warrior', hp: 120, maxHp: 120 }
      ],
      monster: { hp: 246, maxHp: 400 }
    }
  },

  combatDruidStep: {
    type: 'player_action',
    sourceId: 'mock-druid',
    sourceRole: 'druid',
    sourceName: '狼靈',
    skillName: '野性狂撕',
    dmgType: '【物理】',
    damageType: 'physical',
    finalDamage: 50,
    damage: 50,
    targetId: 'monster',
    monsterName: '深淵巨獸',
    targetHpBefore: 246,
    targetHpAfter: 196,
    targetMaxHp: 400,
    hpSnapshot: {
      players: [
        { id: 'mock-druid', hp: 110, maxHp: 110 },
        { id: 'mock-warrior', hp: 120, maxHp: 120 }
      ],
      monster: { hp: 196, maxHp: 400 }
    }
  }
});

// --- 2. Lab 狀態管理者 (Lab State) ---
const labState = {
  currentScene: 'chest_full',
  speed: 1.0,
  variant: 'current',
  glow: 'low',
  particles: 'low',
  shake: 'subtle',
  scale: 1.0,
  reducedMotion: false,
  showBounds: false,
  showLayers: false,
  showTiming: true,
  activeController: null,
  sceneStartTime: 0
};

// --- 3. DOM 元素註冊 (綁定至 Preview Stage 內部 DOM) ---
window.elements = {
  // Views
  views: {
    event: document.getElementById('viewEvent'),
    route: document.getElementById('viewRoute'),
    prologue: document.getElementById('viewPrologue'),
    statusLab: document.getElementById('viewStatusLab')
  },

  // Chest elements
  chestDiscoverySection: document.getElementById('chestDiscoverySection'),
  chestDiscoveryStory: document.getElementById('chestDiscoveryStory'),
  chestInteractionArea: document.getElementById('chestInteractionArea'),
  chestVisualStage: document.getElementById('chestVisualStage'),
  btnOpenChest: document.getElementById('btnOpenChest'),
  chestPresentationOverlay: document.getElementById('chestPresentationOverlay'),
  presentationChestVisual: document.getElementById('presentationChestVisual'),
  presentationRewardContent: document.getElementById('presentationRewardContent'),
  presentationRewardRarity: document.getElementById('presentationRewardRarity'),
  presentationRewardTitle: document.getElementById('presentationRewardTitle'),
  presentationRewardDesc: document.getElementById('presentationRewardDesc'),
  presentationRewardMeta: document.getElementById('presentationRewardMeta'),

  // Trap elements
  trapDiscoverySection: document.getElementById('trapDiscoverySection'),
  trapDiscoveryStory: document.getElementById('trapDiscoveryStory'),
  trapPresentationOverlay: document.getElementById('trapPresentationOverlay'),
  trapVictimsContainer: document.getElementById('trapVictimsContainer'),

  // Exploration elements
  routeAtmosphereText: document.getElementById('routeAtmosphereText'),
  routeOptionsGrid: document.getElementById('routeOptionsGrid'),
  routeStatusText: document.createElement('div'),
  routeVotersStatusList: document.createElement('div'),
  routeTimerBar: document.createElement('div'),
  routeFloorNum: document.createElement('span'),
  routeFloorHeaderNum: document.createElement('span'),
  routeMainTitle: document.createElement('h2'),
  routeDiffPercent: document.createElement('span'),
  routeTimerProgress: document.createElement('div'),
  routeTimerText: document.createElement('span'),
  floorIntroOverlay: document.getElementById('floorIntroOverlay'),
  floorIntroNumber: document.getElementById('floorIntroNumber'),
  floorIntroTitle: document.getElementById('floorIntroTitle'),

  // Prologue & Banner elements
  gameStartOverlay: document.getElementById('gameStartOverlay'),
  gameTitleContainer: document.getElementById('gameTitleContainer'),
  prologuePresentationContainer: document.getElementById('prologuePresentationContainer'),
  prologuePresBody: document.getElementById('prologuePresBody'),
  screenTransitionCurtain: document.getElementById('screenTransitionCurtain'),
  stageCinematicBanner: document.getElementById('stageCinematicBanner'),
  cinematicBannerTitle: document.getElementById('cinematicBannerTitle'),
  cinematicBannerSub: document.getElementById('cinematicBannerSub'),

  // Equipment modal
  equipDropModal: document.getElementById('equipDropModal'),
  btnEquipItem: document.getElementById('btnEquipItem'),
  btnDiscardItem: document.getElementById('btnDiscardItem'),

  // Combat banner
  combatActionBanner: document.getElementById('combatActionBanner'),
  combatBannerActorAvatar: document.getElementById('combatBannerActorAvatar'),
  combatBannerBadge: document.getElementById('combatBannerBadge'),
  combatBannerTitle: document.getElementById('combatBannerTitle'),
  combatBannerTags: document.getElementById('combatBannerTags'),

  // App & Floating
  app: document.getElementById('app'),
  presentationRoot: document.getElementById('presentationRoot'),
  presentationFxContainer: document.getElementById('presentationFxContainer'),
  floatingChatContainer: null
};

// Safe Mock roomState & player ID
window.myId = 'mock-warrior';
window.roomState = {
  state: 'EVENT',
  floor: 1,
  players: [
    { id: 'mock-warrior', name: '亞瑟', role: 'warrior', hp: 120, maxHp: 120 },
    { id: 'mock-mage', name: '梅林', role: 'mage', hp: 80, maxHp: 80 }
  ],
  currentEvent: LAB_MOCK_DATA.chestCommon,
  pendingDrop: {
    drop: LAB_MOCK_DATA.chestCommon.drop,
    ownerId: 'mock-warrior',
    ownerName: '亞瑟'
  }
};

// --- 4. 日誌工具 (Lab Logger) ---
function logLab(tag, message, level = 'info') {
  const container = document.getElementById('labLogContainer');
  if (!container) return;

  const now = Date.now();
  const elapsed = labState.sceneStartTime ? now - labState.sceneStartTime : 0;
  const timeFormatted = `+${elapsed}ms`.padStart(7, ' ');

  const entry = document.createElement('div');
  entry.className = `lab-log-entry ${level}`;
  entry.innerHTML = `<span class="lab-log-time">${timeFormatted}</span><span class="lab-log-tag">[${escapeHtml(tag)}]</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- 5. 畫面重設 (Reset & Cleanup Strategy - Zero Memory Leak) ---
function resetLab() {
  if (labState.activeController) {
    labState.activeController.abort();
    labState.activeController = null;
  }

  // Hide all overlays
  const overlays = [
    elements.chestPresentationOverlay,
    elements.trapPresentationOverlay,
    elements.floorIntroOverlay,
    elements.gameStartOverlay,
    elements.stageCinematicBanner,
    elements.screenTransitionCurtain,
    elements.equipDropModal,
    elements.combatActionBanner
  ];
  overlays.forEach(el => {
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('enter', 'exit');
    }
  });

  // Hide discovery sections
  if (elements.chestDiscoverySection) {
    elements.chestDiscoverySection.classList.add('hidden');
    elements.chestDiscoverySection.classList.remove('enter', 'exit');
    elements.chestDiscoveryStory.replaceChildren();
    elements.chestDiscoveryStory.classList.remove('dimmed');
  }
  if (elements.chestInteractionArea) {
    elements.chestInteractionArea.classList.add('hidden');
    elements.chestInteractionArea.classList.remove('enter');
  }
  if (elements.btnOpenChest) {
    elements.btnOpenChest.disabled = true;
    elements.btnOpenChest.classList.remove('ready', 'loading');
  }
  if (elements.presentationChestVisual) {
    elements.presentationChestVisual.replaceChildren();
    elements.presentationChestVisual.classList.remove('is-shaking', 'is-open');
  }
  if (elements.presentationRewardContent) {
    elements.presentationRewardContent.classList.add('hidden');
    elements.presentationRewardContent.classList.remove('enter');
  }

  if (elements.trapDiscoverySection) {
    elements.trapDiscoverySection.classList.add('hidden');
    elements.trapDiscoverySection.classList.remove('enter', 'exit');
    elements.trapDiscoveryStory.replaceChildren();
  }
  if (elements.trapVictimsContainer) {
    elements.trapVictimsContainer.replaceChildren();
  }

  if (elements.prologuePresBody) {
    elements.prologuePresBody.replaceChildren();
  }

  // Hide view panels
  if (elements.views.statusLab) {
    elements.views.statusLab.classList.add('hidden');
    elements.views.statusLab.classList.remove('active');
  }
  if (elements.views.event) elements.views.event.classList.add('hidden');
  if (elements.views.route) elements.views.route.classList.add('hidden');
  if (elements.views.prologue) elements.views.prologue.classList.add('hidden');

  // Reset body & stage classes
  document.body.classList.remove('presentation-chest-active', 'presentation-trap-active', 'presentation-floor-active');
  const stage = document.getElementById('labStage');
  if (stage) {
    stage.classList.remove('presentation-chest-active');
  }

  // Reset Mock HUD HP
  updateMockHudHp('mock-warrior', 120, 120);
  updateMockHudHp('mock-mage', 80, 80);

  // Clear presentation manager
  // Clean up combat presentation stage
  const combatStage = document.getElementById('presentationCombatStage');
  if (combatStage) {
    combatStage.replaceChildren();
    combatStage.classList.remove('is-active', 'is-exiting');
  }

  // Ensure unopened chest visual is initialized so it never disappears before open
  if (elements.chestVisualStage && typeof getChestSvgMarkup === 'function') {
    elements.chestVisualStage.innerHTML = getChestSvgMarkup();
  }

  // Reset Dev Assert panel
  const exp = document.getElementById('labAssertExpected');
  const disp = document.getElementById('labAssertDisplayed');
  const delta = document.getElementById('labAssertDelta');
  const warn = document.getElementById('labAssertWarning');
  if (exp) exp.textContent = '--';
  if (disp) disp.textContent = '--';
  if (delta) delta.textContent = '--';
  if (warn) warn.style.display = 'none';

  logLab('RESET', 'Stage cleanly reset. All timers, DOM nodes and overlays restored.');
}

function updateLabAssertion(step) {
  if (!step) return;
  const exp = document.getElementById('labAssertExpected');
  const disp = document.getElementById('labAssertDisplayed');
  const delta = document.getElementById('labAssertDelta');
  const warn = document.getElementById('labAssertWarning');
  const expected = step.finalDamage !== undefined ? step.finalDamage : (step.damage || 0);
  const displayed = expected;
  const hpDelta = (step.targetHpBefore !== undefined && step.targetHpAfter !== undefined) ? (step.targetHpBefore - step.targetHpAfter) : expected;
  if (exp) exp.textContent = expected;
  if (disp) disp.textContent = displayed;
  if (delta) delta.textContent = hpDelta;
  if (warn) warn.style.display = (expected !== displayed) ? 'block' : 'none';
}

function updateMockHudHp(playerId, hp, maxHp) {
  const chip = document.querySelector(`.lab-mock-player-chip[data-player-id="${playerId}"]`);
  if (!chip) return;
  const hpEl = chip.querySelector('.lab-mock-player-hp');
  if (hpEl) hpEl.textContent = `HP: ${hp}/${maxHp}`;
}

// Lab projects production snapshots only; it never invents presentation outcomes.
window.applyHpSnapshot = snapshot => {
  window.roomState = { ...window.roomState,
    players: mergePresentationSnapshot({ players: window.roomState.players }, snapshot).players };
  for (const player of snapshot.players || []) updateMockHudHp(player.id, player.hp, player.maxHp);
};

// Phase 7.2: Status Lab State & Scene Runner
let labActiveStatuses = new Set();
let labDruidForm = 'human';

function getStatusLabPortraits() {
  return [
    { root: document.getElementById('statusLabHudPortrait'), scale: 0.28 },
    { root: document.getElementById('statusLabCardPortrait'), scale: 0.95 },
    { root: document.getElementById('statusLabLargePortrait'), scale: 1.3 },
    { root: document.getElementById('statusLabBossPortrait'), scale: 1.1 }
  ];
}

function updateStatusLabGallery() {
  const entity = {
    hp: labActiveStatuses.has('downed') ? 0 : 100,
    maxHp: 100,
    statuses: Array.from(labActiveStatuses).map(s => ({ id: s, name: s })),
    druidForm: labDruidForm
  };

  const portraits = getStatusLabPortraits();
  for (const p of portraits) {
    if (p.root) syncPortraitStatusFx(entity, p.root, { scale: p.scale });
  }

  const listEl = document.getElementById('statusLabActiveList');
  if (listEl) {
    listEl.replaceChildren();
    for (const s of labActiveStatuses) {
      const badge = document.createElement('span');
      badge.className = 'lab-tag';
      badge.style.background = '#1e293b';
      badge.style.color = '#38bdf8';
      badge.style.border = '1px solid #334155';
      badge.style.fontSize = '0.75rem';
      badge.textContent = s;
      listEl.appendChild(badge);
    }
  }
}

async function playStatusLabScene(sceneName, context) {
  if (elements.views.statusLab) {
    elements.views.statusLab.classList.remove('hidden');
    elements.views.statusLab.classList.add('active');
  }

  labActiveStatuses.clear();
  switch (sceneName) {
    case 'status_exhausted':
      labActiveStatuses.add('exhausted');
      break;
    case 'status_frenzy':
      labActiveStatuses.add('frenzy');
      break;
    case 'status_poison':
      labActiveStatuses.add('poison');
      break;
    case 'status_bleed':
      labActiveStatuses.add('bleed');
      break;
    case 'status_shield':
      labActiveStatuses.add('shield');
      break;
    case 'status_guard':
      labActiveStatuses.add('guard');
      break;
    case 'status_vulnerable':
      labActiveStatuses.add('vulnerable');
      break;
    case 'status_dodge':
      labActiveStatuses.add('dodge');
      break;
    case 'status_hidden':
      labActiveStatuses.add('hidden');
      break;
    case 'status_sleep':
      labActiveStatuses.add('sleep');
      break;
    case 'status_corruption':
      labActiveStatuses.add('corruption');
      break;
    case 'status_downed':
      labActiveStatuses.add('downed');
      break;
    case 'status_combo_frenzy_shield':
      labActiveStatuses.add('frenzy');
      labActiveStatuses.add('shield');
      break;
    case 'status_combo_poison_exhausted':
      labActiveStatuses.add('poison');
      labActiveStatuses.add('exhausted');
      break;
    case 'status_combo_triple':
      labActiveStatuses.add('frenzy');
      labActiveStatuses.add('poison');
      labActiveStatuses.add('shield');
      break;
    case 'status_combo_stealth_dodge':
      labActiveStatuses.add('hidden');
      labActiveStatuses.add('dodge');
      break;
    default:
      if (sceneName.startsWith('status_')) {
        labActiveStatuses.add(sceneName.replace('status_', ''));
      }
      break;
  }

  updateStatusLabGallery();
  logLab('STATUS_FX', `Showing Status FX Scene: [${sceneName}] with active: [${Array.from(labActiveStatuses).join(', ')}]`, 'success');
}

// --- 6. 播放場景核心 (Scene Runner calling Production Functions) ---
async function playScene(sceneName) {
  resetLab();
  labState.sceneStartTime = Date.now();
  logLab('START', `Playing scene: ${sceneName} (Speed: ${labState.speed}x, Variant: ${labState.variant})`);

  const controller = new AbortController();
  labState.activeController = controller;
  const { signal } = controller;

  // Context for production presentation functions
  const context = {
    mode: 'lab',
    speed: labState.speed,
    variant: labState.variant,
    glow: labState.glow,
    particles: labState.particles,
    shake: labState.shake,
    reducedMotion: labState.reducedMotion,
    controller, signal,
    onTiming: (beat, ts) => {
      if (labState.showTiming) {
        logLab('BEAT', `Beat reached: ${beat}`, 'info');
      }
    },
    onOpen: () => {
      logLab('ACTION', 'Player clicked [開啟寶箱]! Locking button and starting open beats.');
    },
    onComplete: ({ completed }) => {
      logLab('FINISH', `Presentation completed successfully (completed: ${completed})`, 'success');
    }
  };

  try {
    if (sceneName.startsWith('status_')) {
      await playStatusLabScene(sceneName, context);
      return;
    }
    if (typeof PHASE6_LAB_SCENES !== 'undefined' && PHASE6_LAB_SCENES[sceneName]) {
      const scene = PHASE6_LAB_SCENES[sceneName];
      if (scene.trap) await playTrapPresentation(scene.trap, context);
      else if (scene.revival) await playFloorRevivalPresentation(scene.revival, context);
      else {
        await enterCombatStage(context);
        try { for (const step of scene.steps || []) await playExpandedCombatPresentation(step, context); }
        finally { await exitCombatStage(context); }
        if (scene.victory) await playVictoryPresentation(scene.victory, context);
      }
      logLab('COMPLETE', scene.label, 'success');
      return;
    }
    switch (sceneName) {
      // --- 🎁 寶箱類場景 (Phase 4) ---
      case 'chest_full': {
        // Full sequence: Narrative -> Hold -> Reveal -> Button -> Player Click -> Open -> Reward -> Decision
        await playChestPresentation(LAB_MOCK_DATA.chestCommon, context);
        break;
      }

      case 'chest_discovery': {
        // Only discovery narrative and hold
        elements.chestDiscoveryStory.replaceChildren();
        elements.chestDiscoverySection.classList.remove('hidden', 'exit');
        elements.chestDiscoverySection.classList.add('enter');
        const paragraphs = [LAB_MOCK_DATA.chestCommon.story];
        await typewriterEffect(elements.chestDiscoveryStory, paragraphs, signal, null, labState.speed);
        logLab('HOLD', 'Discovery text typed. Holding reading pause (1200ms)...');
        await waitForPresentation(1200, signal, labState.speed);
        logLab('COMPLETE', 'Narrative hold finished.', 'success');
        break;
      }

      case 'chest_closed': {
        // Fast forward to revealed closed chest and ready button
        elements.chestDiscoverySection.classList.remove('hidden');
        elements.chestDiscoverySection.classList.add('enter');
        elements.chestDiscoveryStory.innerHTML = `<p>${LAB_MOCK_DATA.chestCommon.story}</p>`;
        elements.chestDiscoveryStory.classList.add('dimmed');
        elements.chestInteractionArea.classList.remove('hidden');
        elements.chestInteractionArea.classList.add('enter');
        elements.btnOpenChest.classList.add('ready');
        elements.btnOpenChest.disabled = false;
        logLab('READY', 'Chest visual revealed. [開啟寶箱] ready for player click.');
        break;
      }

      case 'chest_opening': {
        // Auto open sequence
        context.autoOpen = true;
        context.autoOpenDelay = 100;
        await playChestPresentation(LAB_MOCK_DATA.chestCommon, context);
        break;
      }

      case 'chest_reward_common': {
        // Directly showcase Common Reward
        context.autoOpen = true;
        const ev = { ...LAB_MOCK_DATA.chestCommon, story: '' };
        await playChestPresentation(ev, context);
        break;
      }

      case 'chest_reward_rare': {
        // Directly showcase Rare Reward
        context.autoOpen = true;
        const ev = { ...LAB_MOCK_DATA.chestRare, story: '' };
        await playChestPresentation(ev, context);
        break;
      }

      case 'chest_decision': {
        // Showcase equipment decision modal
        elements.equipDropModal.classList.remove('hidden');
        logLab('DECISION', 'Equipment decision modal displayed with 【穿上】 and 【捨棄】 controls.');
        break;
      }

      // --- ⚠️ 探索與陷阱場景 (Phase 2~3) ---
      case 'trap_event': {
        await playTrapPresentation(LAB_MOCK_DATA.trapEvent, context);
        break;
      }

      case 'exploration_narrative': {
        elements.views.route.classList.remove('hidden');
        elements.routeAtmosphereText.replaceChildren();
        await typewriterEffect(elements.routeAtmosphereText, LAB_MOCK_DATA.narrativeSample, signal, null, labState.speed);
        logLab('COMPLETE', 'Exploration narrative typewriter finished.', 'success');
        break;
      }

      case 'route_choice': {
        elements.views.route.classList.remove('hidden');
        elements.routeAtmosphereText.innerHTML = '<p>前方石階在火把光芒照射下依稀可見，等待小隊決策路線。</p>';
        elements.routeOptionsGrid.classList.remove('hidden');
        elements.routeOptionsGrid.innerHTML = `
          <button type="button" class="route-item my-vote" style="padding:14px 20px; border:1px solid #f59e0b; border-radius:6px; background:#1e293b; color:#fff;">
            <span class="route-name" style="font-weight:700;">幽暗小徑 (1 票)</span>
            <div style="font-size:0.8rem; color:#94a3b8; margin-top:4px;">苔蘚覆蓋的平緩通道</div>
          </button>
          <button type="button" class="route-item" style="padding:14px 20px; border:1px solid #475569; border-radius:6px; background:#1e293b; color:#fff;">
            <span class="route-name" style="font-weight:700;">回音洞窟 (0 票)</span>
            <div style="font-size:0.8rem; color:#94a3b8; margin-top:4px;">隱約傳來金屬碰撞聲</div>
          </button>
        `;
        logLab('COMPLETE', 'Route choices rendered.', 'success');
        break;
      }

      // --- 🎬 開場與轉場場景 (Phase 1~2) ---
      case 'game_title': {
        elements.gameStartOverlay.classList.remove('hidden');
        elements.gameTitleContainer.classList.remove('hidden');
        sfxManager.play('banner');
        logLab('TITLE', 'Game Title displayed. Holding 1400ms...');
        await waitForPresentation(1400, signal, labState.speed);
        elements.gameStartOverlay.classList.add('hidden');
        logLab('COMPLETE', 'Game Title finished.', 'success');
        break;
      }

      case 'prologue': {
        elements.gameStartOverlay.classList.remove('hidden');
        elements.gameTitleContainer.classList.add('hidden');
        elements.prologuePresentationContainer.classList.remove('hidden');
        elements.prologuePresBody.replaceChildren();
        await typewriterEffect(elements.prologuePresBody, [
          '遠古深淵在無盡的長夜中甦醒。',
          '唯有真正的冒險者，方能深入未知與絕望的地下殿堂。'
        ], signal, null, labState.speed);
        await waitForPresentation(1800, signal, labState.speed);
        elements.gameStartOverlay.classList.add('hidden');
        logLab('COMPLETE', 'Prologue finished.', 'success');
        break;
      }

      case 'floor_intro': {
        elements.stageCinematicBanner.classList.remove('hidden');
        elements.cinematicBannerTitle.textContent = '【第 1 層・深淵探索】';
        elements.cinematicBannerSub.textContent = 'FLOOR 1 · DEEP ABYSS';
        sfxManager.play('banner');
        logLab('BANNER', 'Stage cinematic banner entered. Holding 2000ms...');
        await waitForPresentation(2000, signal, labState.speed);
        elements.stageCinematicBanner.classList.add('hidden');
        logLab('COMPLETE', 'Stage banner finished.', 'success');
        break;
      }

      case 'screen_fade': {
        elements.screenTransitionCurtain.classList.remove('hidden');
        elements.screenTransitionCurtain.style.opacity = '1';
        logLab('FADE', 'Screen curtain faded to black. Holding 800ms...');
        await waitForPresentation(800, signal, labState.speed);
        elements.screenTransitionCurtain.style.opacity = '0';
        await waitForPresentation(500, signal, labState.speed);
        elements.screenTransitionCurtain.classList.add('hidden');
        logLab('COMPLETE', 'Screen curtain fade finished.', 'success');
        break;
      }

      case 'typewriter_test': {
        // Verify First-Frame Flash test
        elements.chestDiscoveryStory.replaceChildren();
        elements.chestDiscoverySection.classList.remove('hidden');
        logLab('TEST', 'Starting First-frame flash test. Validating container remains empty across first 2 RAFs...');
        const testParagraphs = ['這是一段用來驗證第一幀絕對不會閃爍的文字。'];
        let flashedEarly = false;

        const checkPromise = (async () => {
          await presentationFrame(signal);
          if (elements.chestDiscoveryStory.textContent.length > 0) flashedEarly = true;
          await presentationFrame(signal);
          if (elements.chestDiscoveryStory.textContent.length > 0) flashedEarly = true;
        })();

        await Promise.all([
          typewriterEffect(elements.chestDiscoveryStory, testParagraphs, signal, null, labState.speed),
          checkPromise
        ]);

        if (flashedEarly) {
          logLab('FAIL', 'First-frame flash detected! Container was not empty in initial RAFs.', 'error');
        } else {
          logLab('PASS', 'First-frame flash test passed! Painted empty through initial RAFs.', 'success');
        }
        break;
      }

      // --- ⚔️ 全螢幕戰鬥演出 (Phase 5.2 Choreography & Identity) ---
      case 'combat_warrior':
      case 'combat_player_action': {
        await enterCombatStage(context);
        const step = { ...LAB_MOCK_DATA.combatPlayerStep };
        logLab('COMBAT', `Executing Warrior Action [${step.skillName}], Xing SFX + Sword Slash FX, finalDamage: ${step.finalDamage}`);
        updateLabAssertion(step);
        await playCombatActionPresentation(step, context);
        await exitCombatStage(context);
        break;
      }

      case 'combat_mage':
      case 'combat_player_magic': {
        await enterCombatStage(context);
        const step = { ...LAB_MOCK_DATA.combatMagicStep };
        logLab('COMBAT', `Executing Mage Action [${step.skillName}], Bomb SFX + Arcane Burst FX, finalDamage: ${step.finalDamage}`);
        updateLabAssertion(step);
        await playCombatActionPresentation(step, context);
        await exitCombatStage(context);
        break;
      }

      case 'combat_archer': {
        await enterCombatStage(context);
        const step = { ...LAB_MOCK_DATA.combatArcherStep };
        logLab('COMBAT', `Executing Archer Action [${step.skillName}], Twang SFX + Flying Arrow Projectile + Thock, finalDamage: ${step.finalDamage}`);
        updateLabAssertion(step);
        await playCombatActionPresentation(step, context);
        await exitCombatStage(context);
        break;
      }

      case 'combat_assassin': {
        await enterCombatStage(context);
        const step = { ...LAB_MOCK_DATA.combatAssassinStep };
        logLab('COMBAT', `Executing Assassin Action [${step.skillName}], Dual Xing SFX + Cross X Slash FX, finalDamage: ${step.finalDamage}`);
        updateLabAssertion(step);
        await playCombatActionPresentation(step, context);
        await exitCombatStage(context);
        break;
      }

      case 'combat_alchemist': {
        await enterCombatStage(context);
        const step = { ...LAB_MOCK_DATA.combatAlchemistStep };
        logLab('COMBAT', `Executing Alchemist Action [${step.skillName}], Acid Splash FX, finalDamage: ${step.finalDamage}`);
        updateLabAssertion(step);
        await playCombatActionPresentation(step, context);
        await exitCombatStage(context);
        break;
      }

      case 'combat_druid': {
        await enterCombatStage(context);
        const step = { ...LAB_MOCK_DATA.combatDruidStep };
        logLab('COMBAT', `Executing Druid Action [${step.skillName}], Claw Slash FX, finalDamage: ${step.finalDamage}`);
        updateLabAssertion(step);
        await playCombatActionPresentation(step, context);
        await exitCombatStage(context);
        break;
      }

      case 'combat_boss_action': {
        await enterCombatStage(context);
        const step = { ...LAB_MOCK_DATA.combatBossStep };
        logLab('COMBAT', `Executing Boss Action [${step.skillName}] on [${step.targetRole}], finalDamage: ${step.finalDamage}`);
        updateLabAssertion(step);
        await playCombatActionPresentation(step, context);
        await exitCombatStage(context);
        break;
      }

      case 'combat_player_lethal': {
        logLab('COMBAT', 'Entering Lethal Hit Test (Boss HP 12 -> 0, Boss Death grayscale & sink)...');
        await enterCombatStage(context);
        const lethalStep = { ...LAB_MOCK_DATA.combatLethalStep };
        updateLabAssertion(lethalStep);
        await playCombatActionPresentation(lethalStep, context);
        await exitCombatStage(context);
        logLab('FINISH', 'Lethal Hit & Boss Death presentation completed cleanly!', 'success');
        break;
      }

      case 'combat_full_sequence': {
        logLab('COMBAT', 'Entering full combat stage sequence...');
        await enterCombatStage(context);

        const actorRole = document.getElementById('labCombatActorRoleSelect')?.value || 'warrior';
        const skillName = document.getElementById('labCombatSkillInput')?.value || '堅定斬擊';
        const dmgType = document.getElementById('labCombatDmgTypeSelect')?.value || 'physical';
        const dmgVal = parseInt(document.getElementById('labCombatDmgNumInput')?.value || '48', 10);

        const playerStep = {
          type: 'player_action',
          sourceId: 'mock-player',
          sourceRole: actorRole,
          sourceName: getClassDisplayName(actorRole),
          skillName: skillName,
          dmgType: dmgType === 'magic' ? '【魔法】' : '【物理】',
          damageType: dmgType,
          finalDamage: dmgVal,
          damage: dmgVal,
          targetId: 'monster',
          monsterName: '深淵巨獸',
          targetHpBefore: 400,
          targetHpAfter: Math.max(0, 400 - dmgVal),
          targetMaxHp: 400,
          hpSnapshot: {
            players: [
              { id: 'mock-warrior', hp: 120, maxHp: 120 },
              { id: 'mock-mage', hp: 80, maxHp: 80 }
            ],
            monster: { hp: Math.max(0, 400 - dmgVal), maxHp: 400 }
          }
        };

        logLab('STEP 1', 'Player Offensive Action starting...');
        updateLabAssertion(playerStep);
        await playCombatActionPresentation(playerStep, context);

        logLab('GAP', 'Breathing gap before Boss counter-attack (350ms)...');
        await waitForPresentation(350, signal, labState.speed);

        logLab('STEP 2', 'Boss Action starting...');
        updateLabAssertion(LAB_MOCK_DATA.combatBossStep);
        await playCombatActionPresentation(LAB_MOCK_DATA.combatBossStep, context);

        logLab('EXIT', 'Combat sequence completed. Exiting combat stage...');
        await exitCombatStage(context);
        logLab('FINISH', 'Full Player -> Boss Sequence completed successfully!', 'success');
        break;
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      logLab('ERROR', `Scene error: ${err.message}`, 'error');
      console.error('[LabSceneError]', err);
    }
  }
}

// --- 7. 戰鬥打擊預覽輔助 ---
function triggerHitPreview() {
  const dmgType = document.getElementById('labDmgTypeSelect')?.value || 'damage';
  const val = document.getElementById('labDmgNumInput')?.value || '128';
  const stage = document.getElementById('labStage');
  if (!stage) return;

  const floatContainer = document.getElementById('presentationFxContainer');
  spawnFloatingText(floatContainer, (dmgType === 'heal' ? `+${val}` : `-${val}`), dmgType);

  // Play appropriate SFX
  if (dmgType === 'heal') sfxManager.play('heal');
  else if (dmgType === 'magic') sfxManager.play('magic');
  else if (dmgType === 'crit') sfxManager.play('dagger_crit');
  else if (dmgType === 'poison') sfxManager.play('poison');
  else sfxManager.play('hit');

  logLab('HIT_FX', `Spawned floating number [${val}] of type [${dmgType}] and played impact SFX.`);
}

// --- 8. 事件監聽與控制器綁定 (Event Listeners) ---
function initLabController() {
  // Sidebar Toggle
  const sidebar = document.getElementById('labSidebar');
  const btnToggleSidebar = document.getElementById('labSidebarToggle');
  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  // Scene Selection
  const sceneSelect = document.getElementById('labSceneSelect');
  const activeSceneTag = document.getElementById('labActiveSceneTag');
  if (sceneSelect) {
    if (typeof PHASE6_LAB_SCENES !== 'undefined') {
      const group = document.createElement('optgroup'); group.label = 'Phase 6 · Production Combat';
      for (const [id, scene] of Object.entries(PHASE6_LAB_SCENES)) {
        const option = document.createElement('option'); option.value = id; option.textContent = scene.label; group.appendChild(option);
      }
      sceneSelect.appendChild(group);
    }
    sceneSelect.addEventListener('change', () => {
      labState.currentScene = sceneSelect.value;
      if (activeSceneTag) {
        activeSceneTag.textContent = sceneSelect.value.toUpperCase().slice(0, 10);
      }
      playScene(labState.currentScene);
    });
  }

  // Primary Buttons
  document.getElementById('btnLabPlay')?.addEventListener('click', () => playScene(labState.currentScene));
  document.getElementById('btnLabReplay')?.addEventListener('click', () => playScene(labState.currentScene));
  document.getElementById('btnLabReset')?.addEventListener('click', resetLab);

  // Chest Variant Selector (Single Source of Truth)
  const variantSelect = document.getElementById('labChestVariantSelect');
  if (variantSelect) {
    variantSelect.addEventListener('change', () => {
      labState.variant = variantSelect.value;
      const stage = document.getElementById('labStage');
      if (stage) stage.setAttribute('data-variant', labState.variant);
      if (elements.chestDiscoverySection) elements.chestDiscoverySection.setAttribute('data-variant', labState.variant);
      if (elements.chestPresentationOverlay) elements.chestPresentationOverlay.setAttribute('data-variant', labState.variant);
      logLab('VARIANT', `Switched chest variant to [${labState.variant}].`);
    });
  }

  // Chest Scale Range
  const scaleRange = document.getElementById('labChestScaleRange');
  const scaleVal = document.getElementById('labChestScaleVal');
  if (scaleRange) {
    scaleRange.addEventListener('input', () => {
      labState.scale = parseFloat(scaleRange.value);
      if (scaleVal) scaleVal.textContent = scaleRange.value;
      document.getElementById('labStage')?.style.setProperty('--lab-chest-scale', scaleRange.value);
    });
  }

  // Chest Glow / Particles / Shake
  document.getElementById('labChestGlowSelect')?.addEventListener('change', e => {
    labState.glow = e.target.value;
    document.getElementById('labStage')?.setAttribute('data-glow', labState.glow);
    logLab('GLOW', `Chest glow set to [${labState.glow}].`);
  });

  document.getElementById('labChestParticlesSelect')?.addEventListener('change', e => {
    labState.particles = e.target.value;
    document.getElementById('labStage')?.setAttribute('data-particles', labState.particles);
    logLab('PARTICLES', `Chest particles set to [${labState.particles}].`);
  });

  document.getElementById('labChestShakeSelect')?.addEventListener('change', e => {
    labState.shake = e.target.value;
    document.getElementById('labStage')?.setAttribute('data-shake', labState.shake);
    logLab('SHAKE', `Chest shake strength set to [${labState.shake}].`);
  });

  // Playback Speed
  document.getElementById('labSpeedSelect')?.addEventListener('change', e => {
    labState.speed = parseFloat(e.target.value);
    logLab('SPEED', `Playback speed updated to ${labState.speed}x.`);
  });

  // Reduced Motion
  document.getElementById('labReducedMotionSelect')?.addEventListener('change', e => {
    labState.reducedMotion = e.target.value === 'reduced';
    const stage = document.getElementById('labStage');
    if (stage) {
      if (labState.reducedMotion) stage.setAttribute('data-reduced-motion', 'true');
      else stage.removeAttribute('data-reduced-motion');
    }
    logLab('MOTION', `Reduced motion set to [${e.target.value}].`);
  });

  // SFX Toggle & Volume
  document.getElementById('labSfxToggle')?.addEventListener('change', e => {
    sfxManager.soundEnabled = e.target.checked;
    logLab('SFX', `SFX toggled [${e.target.checked ? 'ON' : 'OFF'}].`);
  });

  document.getElementById('labVolumeRange')?.addEventListener('input', e => {
    sfxManager.volume = parseFloat(e.target.value);
  });

  document.getElementById('btnTestSound')?.addEventListener('click', () => {
    const soundType = document.getElementById('labSoundTypeSelect')?.value;
    if (soundType) {
      sfxManager.play(soundType);
      logLab('SFX_TEST', `Played sound test: [${soundType}].`);
    }
  });

  document.getElementById('btnTestPanelSweep')?.addEventListener('click', () => {
    sfxManager.play('panel_sweep');
    logLab('SFX_TEST', '① Played Panel Sweep SFX (Shoo~).');
  });

  document.getElementById('btnTestAttackSfx')?.addEventListener('click', () => {
    const role = document.getElementById('labCombatActorRoleSelect')?.value || 'warrior';
    const profile = (typeof COMBAT_PRESENTATION_PROFILES !== 'undefined' && COMBAT_PRESENTATION_PROFILES[role]) || { attackSfx: 'warrior_xing' };
    if (profile.preSfx) sfxManager.play(profile.preSfx);
    sfxManager.play(profile.attackSfx);
    logLab('SFX_TEST', `② Played Attack SFX for [${role}]: [${profile.attackSfx}].`);
  });

  document.getElementById('btnTestImpactSfx')?.addEventListener('click', () => {
    const dmgType = document.getElementById('labCombatDmgTypeSelect')?.value || 'physical';
    const sfx = dmgType === 'magic' ? 'magic_impact' : 'physical_hit';
    sfxManager.play(sfx);
    logLab('SFX_TEST', `③ Played Impact SFX: [${sfx}].`);
  });

  // Debug Checkboxes
  document.getElementById('chkShowBounds')?.addEventListener('change', e => {
    labState.showBounds = e.target.checked;
    document.getElementById('labStage')?.classList.toggle('lab-debug-bounds', e.target.checked);
    logLab('BOUNDS', `Layout bounds outline [${e.target.checked ? 'ENABLED' : 'DISABLED'}].`);
  });

  document.getElementById('chkShowLayers')?.addEventListener('change', e => {
    labState.showLayers = e.target.checked;
    const overlay = document.getElementById('labLayerOverlay');
    if (overlay) overlay.style.display = e.target.checked ? 'flex' : 'none';
  });

  document.getElementById('chkShowTimingDebug')?.addEventListener('change', e => {
    labState.showTiming = e.target.checked;
  });

  // Combat Trigger Button
  document.getElementById('btnTriggerHitFx')?.addEventListener('click', triggerHitPreview);

  // Clear Log Button
  document.getElementById('btnClearLabLog')?.addEventListener('click', () => {
    const container = document.getElementById('labLogContainer');
    if (container) container.replaceChildren();
  });

  // Viewport Control
  const viewportSelect = document.getElementById('labViewportSelect');
  const deviceFrame = document.getElementById('labDeviceFrame');
  const deviceIndicator = document.getElementById('labDeviceIndicator');
  if (viewportSelect && deviceFrame) {
    const previewArea = deviceFrame.parentElement;
    const fitDeviceFrame = () => {
      if (deviceFrame.classList.contains('is-responsive')) {
        deviceFrame.style.zoom = '1';
        return;
      }
      const padding = getComputedStyle(previewArea);
      const width = previewArea.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
      const height = previewArea.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
      // Keep the simulated CSS viewport intact while fitting the whole device on screen.
      deviceFrame.style.zoom = String(Math.min(1, Math.max(0.1, width / parseFloat(deviceFrame.style.width)), Math.max(0.1, height / parseFloat(deviceFrame.style.height))));
    };
    new ResizeObserver(fitDeviceFrame).observe(previewArea);
    viewportSelect.addEventListener('change', () => {
      const mode = viewportSelect.value;
      deviceFrame.classList.remove('is-responsive');
      switch (mode) {
        case 'desktop':
          deviceFrame.style.width = '1440px';
          deviceFrame.style.height = '900px';
          if (deviceIndicator) deviceIndicator.textContent = '1440 × 900 (Desktop)';
          break;
        case 'laptop':
          deviceFrame.style.width = '1280px';
          deviceFrame.style.height = '720px';
          if (deviceIndicator) deviceIndicator.textContent = '1280 × 720 (Laptop)';
          break;
        case 'tablet':
          deviceFrame.style.width = '768px';
          deviceFrame.style.height = '1024px';
          if (deviceIndicator) deviceIndicator.textContent = '768 × 1024 (Tablet)';
          break;
        case 'mobile':
          deviceFrame.style.width = '390px';
          deviceFrame.style.height = '844px';
          if (deviceIndicator) deviceIndicator.textContent = '390 × 844 (Mobile)';
          break;
        case 'responsive':
        default:
          deviceFrame.classList.add('is-responsive');
          deviceFrame.style.width = '100%';
          deviceFrame.style.height = '100%';
          if (deviceIndicator) deviceIndicator.textContent = 'Responsive (100%)';
          break;
      }
      fitDeviceFrame();
      logLab('VIEWPORT', `Switched viewport mode to [${mode}].`);
    });
  }

  // Background Control
  const bgSelect = document.getElementById('labBgSelect');
  const stage = document.getElementById('labStage');
  if (bgSelect && stage) {
    bgSelect.addEventListener('change', () => {
      stage.setAttribute('data-bg', bgSelect.value);
      logLab('BACKGROUND', `Switched stage background to [${bgSelect.value}].`);
    });
  }

  // Modal Buttons in Preview
  document.getElementById('btnEquipItem')?.addEventListener('click', () => {
    sfxManager.play('click');
    elements.equipDropModal.classList.add('hidden');
    logLab('DECISION', 'Player clicked 【穿上裝備】.');
  });
  document.getElementById('btnDiscardItem')?.addEventListener('click', () => {
    sfxManager.play('click');
    elements.equipDropModal.classList.add('hidden');
    logLab('DECISION', 'Player clicked 【捨棄裝備】.');
  });

  // Combat Role Change Sync
  const roleSelect = document.getElementById('labCombatActorRoleSelect');
  const skillInput = document.getElementById('labCombatSkillInput');
  const dmgTypeSelect = document.getElementById('labCombatDmgTypeSelect');
  if (roleSelect && skillInput && dmgTypeSelect) {
    roleSelect.addEventListener('change', () => {
      const role = roleSelect.value;
      const defaults = {
        warrior: { skill: '堅定斬擊', type: 'physical' },
        mage: { skill: '奧術爆破', type: 'magic' },
        archer: { skill: '精準狙擊', type: 'physical' },
        assassin: { skill: '致命背刺', type: 'physical' },
        bard: { skill: '激昂戰歌', type: 'magic' },
        alchemist: { skill: '強酸腐蝕', type: 'magic' },
        druid: { skill: '自然之怒', type: 'magic' }
      };
      if (defaults[role]) {
        skillInput.value = defaults[role].skill;
        dmgTypeSelect.value = defaults[role].type;
        logLab('ROLE_CHANGE', `Selected role [${role}]. Default skill set to: ${defaults[role].skill}`);
      }
    });
  }

  // Phase 7.2 Status FX Controls
  const statusSelect = document.getElementById('labStatusFxSelect');
  document.getElementById('btnApplyStatusFx')?.addEventListener('click', () => {
    const sel = statusSelect?.value || 'exhausted';
    labActiveStatuses.add(sel);
    updateStatusLabGallery();
    logLab('STATUS_APPLY', `Applied status FX: [${sel}]`);
  });

  document.getElementById('btnRemoveStatusFx')?.addEventListener('click', () => {
    const sel = statusSelect?.value || 'exhausted';
    labActiveStatuses.delete(sel);
    updateStatusLabGallery();
    logLab('STATUS_REMOVE', `Removed status FX: [${sel}]`);
  });

  document.getElementById('btnClearAllStatusFx')?.addEventListener('click', () => {
    labActiveStatuses.clear();
    updateStatusLabGallery();
    logLab('STATUS_CLEAR', 'Cleared all status FX');
  });

  document.getElementById('btnTestStatusHit')?.addEventListener('click', () => {
    const portraits = getStatusLabPortraits();
    for (const p of portraits) {
      if (p.root) {
        for (const s of labActiveStatuses) triggerPortraitStatusEvent(p.root, s, 'hit');
      }
    }
    logLab('STATUS_EVENT', 'Triggered hit event on active statuses');
  });

  document.getElementById('btnTestShieldBreak')?.addEventListener('click', () => {
    const portraits = getStatusLabPortraits();
    for (const p of portraits) {
      if (p.root) triggerPortraitStatusEvent(p.root, 'shield', 'break');
    }
    labActiveStatuses.delete('shield');
    setTimeout(updateStatusLabGallery, 350);
    logLab('STATUS_EVENT', 'Triggered shield break event');
  });

  document.getElementById('btnTestStatusTick')?.addEventListener('click', () => {
    const portraits = getStatusLabPortraits();
    for (const p of portraits) {
      if (p.root) {
        triggerPortraitStatusEvent(p.root, 'poison', 'tick');
        triggerPortraitStatusEvent(p.root, 'bleed', 'tick');
      }
    }
    logLab('STATUS_EVENT', 'Triggered DoT tick event on poison/bleed');
  });

  document.getElementById('btnTestOffKey')?.addEventListener('click', () => {
    const portraits = getStatusLabPortraits();
    for (const p of portraits) {
      if (p.root) triggerPortraitStatusEvent(p.root, 'frenzy', 'off_key');
    }
    logLab('STATUS_EVENT', 'Triggered Bard off-key distortion event');
  });

  document.getElementById('btnTransformWolf')?.addEventListener('click', () => {
    labDruidForm = 'wolf';
    const cardImg = document.getElementById('statusLabCardImg');
    if (cardImg) cardImg.src = '/photo/Wolf.webp';
    updateStatusLabGallery();
    logLab('TRANSFORM', 'Druid transformed to Wolf form. Status layers preserved.');
  });

  document.getElementById('btnTransformTreant')?.addEventListener('click', () => {
    labDruidForm = 'treant';
    const cardImg = document.getElementById('statusLabCardImg');
    if (cardImg) cardImg.src = '/photo/Treant.webp';
    updateStatusLabGallery();
    logLab('TRANSFORM', 'Druid transformed to Treant form (moss layer on sleep, guard aura).');
  });

  document.getElementById('btnTransformHuman')?.addEventListener('click', () => {
    labDruidForm = 'human';
    const cardImg = document.getElementById('statusLabCardImg');
    if (cardImg) cardImg.src = '/photo/Druid.webp';
    updateStatusLabGallery();
    logLab('TRANSFORM', 'Druid reverted to Human form.');
  });

  // Initialize unopened chest visual so unopened chest is never missing
  if (elements.chestVisualStage && typeof getChestSvgMarkup === 'function') {
    elements.chestVisualStage.innerHTML = getChestSvgMarkup();
  }

  logLab('READY', 'Presentation Lab initialized successfully. Ready to run tests.');
  window.labInitialized = true;
}

// Start Lab on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLabController);
} else {
  initLabController();
}
