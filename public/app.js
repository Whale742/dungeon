// ==========================================================================
// 地城深淵 (DUNGEON ABYSS) - 前端核心客戶端 (app.js)
// ==========================================================================

const socket = io();

// 核心狀態
let myId = null;
let myName = localStorage.getItem('dungeon_player_name') || '';
let currentRoomCode = null;
let roomState = null;
let classesData = {};
let routesData = [];
let soundEnabled = true;
let roleDetailsData = null;

const DEFAULT_ROLE_DETAILS = {
  warrior: {
    roleName: '戰士',
    enName: 'Warrior',
    emoji: '🛡️',
    avatar: '/photo/Warrior.webp',
    hp: 120,
    type: '物理 / 前排坦鋒',
    passive: '前排坦鋒，擁有全職業最高的基礎生命值（120 HP）與強大減傷防護。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【物理】', cd: '無 CD', desc: '揮動武器進行基本物理打擊，對單一目標造成基礎 10 點傷害。' },
      { type: '1 技能', name: '堅定斬擊', dmgType: '【物理】', cd: '無 CD', desc: '揮動巨劍造成物理傷害。80% 機率造成 18 點傷害；20% 機率因揮砍失衡僅造成 5 點傷害，並使下回合自身承受傷害提高 20%。' },
      { type: '2 技能', name: '壁壘守護', dmgType: '【防護】', cd: '2 回合', desc: '展開厚重盾勢，大幅降低全隊本回合受到的傷害（阻擋 90% 傷害，有 25% 機率盾牌龜裂使冷卻延長 1 回合）；次回合仍提供殘餘 40% 減傷。' }
    ]
  },
  mage: {
    roleName: '法師',
    enName: 'Mage',
    emoji: '🧙‍♂️',
    avatar: '/photo/Mage.webp',
    hp: 80,
    type: '魔法 / 遠程爆發',
    passive: '站樁高爆發與生命汲取，全技能與普攻皆為魔法傷害。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【魔法】', cd: '無 CD', desc: '引導微光魔力造成基礎 10 點魔法傷害。' },
      { type: '1 技能', name: '奧術爆破', dmgType: '【魔法】', cd: '1 回合', desc: '引爆狂暴魔力轟炸敵方造成 45 點魔法傷害。有 25% 機率發生法力走火導致威力驟降為 10 點傷害，並對自身造成 10 點魔力反噬。' },
      { type: '2 技能', name: '生命汲取', dmgType: '【魔法】', cd: '1 回合', desc: '對敵方造成 1~40 點劇烈浮動的魔法傷害，並依據最終造成的傷害量吸取 20% 生命回復自身。' }
    ]
  },
  archer: {
    roleName: '弓箭手',
    enName: 'Archer',
    emoji: '🏹',
    avatar: '/photo/Archer.webp',
    hp: 80,
    type: '物理 / 遠程敏捷',
    passive: '常駐 40% 閃避率（可完全閃避單體物理打擊與怪物反擊）。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【物理】', cd: '無 CD', desc: '拉弓射出基礎箭矢造成基礎 10 點物理傷害。' },
      { type: '1 技能', name: '精準狙擊', dmgType: '【物理】', cd: '1 回合', desc: '百步穿楊狙擊目標造成 35 點傷害。有 20% 機率發生脫靶導致無法造成傷害（0 傷害），並使下一次閃避檢定成功率提高 20 個百分點（檢定後消耗）。' },
      { type: '2 技能', name: '箭雨壓制', dmgType: '【魔法】', cd: '1 回合', desc: '召喚範圍附魔箭雨造成 20 點魔法傷害並削弱敵方 10 點攻擊力。有 20% 機率受地底氣流干擾誤傷隨機一名隊友 10 點傷害。' }
    ]
  },
  assassin: {
    roleName: '刺客',
    enName: 'Assassin',
    emoji: '🗡️',
    avatar: '/photo/Assassin.webp',
    hp: 50,
    type: '物理 / 近戰刺殺',
    passive: '常駐 50% 暴擊，輕甲承傷 +25%。每 2 次有效暴擊獲得 1 層匿蹤（跨戰鬥保留）。回合初先減 1 層，再判定隱身；隱身免傷，主動攻擊解除當回合隱身。隱身時其他玩家每次正式行動有 50% 機率追擊，基礎上限 2 次、追擊暴擊率 50%。100% 避開陷阱。',
    skills: [
      {
        type: '普攻',
        name: '普通攻擊',
        dmgType: '【物理】',
        cd: '無 CD',
        desc: '揮動雙匕進行基礎物理切削造成 10 點傷害。'
      },
      {
        type: '1 技能',
        name: '暗影刺殺',
        dmgType: '【物理】',
        cd: '1 回合 (暴擊無CD)',
        desc: '背刺敵方造成 35 點物理傷害。若觸發暴擊則傷害倍增為 70 且立即重置冷卻；未暴擊則需正常進入冷卻 1 回合。'
      },
      {
        type: '2 技能',
        name: '暗影爆襲',
        dmgType: '【物理】',
        cd: '2 回合',
        desc: '消耗所有匿蹤，基礎傷害 30；每層增加 15 點，0／1／2／3／4 層為 30／45／60／75／90。暴擊資格待定。'
      }
    ]
  },
  bard: {
    roleName: '吟遊詩人',
    enName: 'Bard',
    emoji: '🪕',
    avatar: '/photo/Bard.webp',
    hp: 70,
    type: '魔法 / 團隊核心輔助',
    passive: '團隊核心輔助，精通全體群療與增傷減傷，全技能皆為魔法傷害。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【魔法】', cd: '無 CD', desc: '撥動琴弦引導音波造成基礎 10 點魔法傷害。' },
      { type: '1 技能', name: '治癒頌歌', dmgType: '【治療】', cd: '1 回合', desc: '唱響聖詠為全體隊友回復生命。80% 機率為全體回復 22 點生命，並專注為指定目標額外回復 28 點；20% 機率因走音導致全隊回復量大幅縮減為僅回復 5 點生命。' },
      { type: '2 技能', name: '狂熱協奏', dmgType: '【增益】', cd: '1 回合', desc: '使全隊提升 50% 傷害、25% 減傷並削弱敵方抗性。有 25% 機率因節奏過激導致全隊力竭扣除當前 5 點生命。' }
    ]
  },
  alchemist: {
    roleName: '鍊金術士',
    enName: 'Alchemist',
    emoji: '🧪',
    avatar: '/photo/Alchemist.webp',
    hp: 75,
    type: '魔法 / 調和煉成',
    passive: '神秘調和者，精通強酸腐蝕、劇毒煙霧與命運試劑，全技能與普攻皆為魔法傷害。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【魔法】', cd: '無 CD', desc: '揮動燒瓶引發衝擊造成基礎 10 點魔法傷害。' },
      { type: '1 技能', name: '不穩定試劑瓶', dmgType: '【魔法/隨機】', cd: '無 CD', desc: '投擲未完全調和的試劑瓶，50% 機率隨機施放【腐蝕強酸瓶】（造成 50 魔法傷害，自身自傷 15 點，全隊裝備本回合減半）或【劇毒煙霧瓶】（造成 30 魔法傷害，自身自傷 5 點，敵我雙方陷入 2 回合劇毒，每回合 5 點毒傷可疊加）。' },
      { type: '2 技能', name: '命運煉成試劑', dmgType: '【驅散/調和】', cd: '2 回合', desc: '立即驅散全隊所有負面狀態（中毒/撕裂）。若自身有異常狀態：50% 機率煉金大成功（全員回復 40 點生命 + 2 回合 70% 減傷護盾）/ 50% 機率煉金失敗（全員回復 10 點生命 + 下回合全隊受傷 +20%）；若自身無異常狀態：全員穩定回復 15 點生命。' }
    ]
  },
  druid: {
    roleName: '德魯伊',
    enName: 'Druid',
    emoji: '🌿',
    avatar: '/photo/Druid.webp',
    hp: 85,
    type: '物理 / 自然變形',
    passive: '自然之子，擅長形態轉變（狼人/遠古樹精）與自然僕從召喚（小樹精/幼狼）。',
    forms: {
      werewolf: { name: '狼人', avatar: '/photo/狼人.webp' },
      treant: { name: '遠古樹精', avatar: '/photo/遠古樹精.webp' },
      tree: { name: '沉睡古樹', avatar: '/photo/遠古樹精.webp' }
    },
    summons: {
      treant: [
        { name: '小樹精1', avatar: '/photo/小樹精1.webp' },
        { name: '小樹精2', avatar: '/photo/小樹精2.webp' },
        { name: '小樹精3', avatar: '/photo/小樹精3.webp' }
      ],
      wolf: [
        { name: '幼狼1', avatar: '/photo/幼狼1.webp' },
        { name: '幼狼2', avatar: '/photo/幼狼2.webp' },
        { name: '幼狼3', avatar: '/photo/幼狼3.webp' }
      ]
    },
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【物理】', cd: '無 CD', desc: '引導自然力量造成基礎 10 點物理傷害。' },
      { type: '1 技能', name: '形態轉變', dmgType: '【變身】', cd: '無 CD (持續2回合)', desc: '持續 2 回合（結束後才可再次變身）：有一半機率化身狼人（降低 20% 最大生命、造成傷害提升至 35 點、立即造成 35 傷害強化普攻，變身結束恢復最大生命）；有一半機率化身遠古樹精（生命上限 +100、常駐減傷 30%、替全隊吸收 50% 受傷、致命傷免死化為樹木休眠 1 回合）。' },
      { type: '2 技能 A', name: '召喚小樹精', dmgType: '【召喚】', cd: '無 CD (每位德魯伊上限3隻)', desc: '召喚肉盾型樹精僕從（HP = floor(10 + Max HP × 25%)，ATK = floor(有效攻擊 × 10%)，最低 1），每回合自動攻擊並優先替隊伍承受分散傷害。' },
      { type: '2 技能 B', name: '召喚幼狼', dmgType: '【召喚】', cd: '無 CD (每位德魯伊上限3隻)', desc: '召喚敏捷型幼狼僕從（HP = floor(5 + Max HP × 10%)，ATK = floor(有效攻擊 × 80%)，最低 1），每回合自動攻擊並優先替隊伍承受分散傷害。' }
    ]
  }
};

// 大廳成員卡片行內修改暱稱狀態
let isEditingMyName = false;
let editingNameValue = '';

// 本回合暫存選擇
let currentPendingAction = null;
let currentPendingTarget = null;

// 打字機與戰鬥敘述鎖定狀態
let currentTypewriterTimer = null;
let lastTypedTransitionKey = null;
let isPlayingBattleNarrative = false;

// 全域轉場、大字幕與各階段打字機狀態
let currentActiveStage = null;
let lastAnnouncedBattleRound = 0;
let isPrologueTyping = false;
let prologueCompleted = false;
let prologueController = null;
let routeNarrativeDoneKey = null;
let routePresentationController = null;
let trapPresentationController = null;
let trapDisplay = null;
let trapStartedId = null;
let chestPresentationController = null;
let chestDisplay = null;
let chestStartedId = null;
let chestRewardCompletedId = null;
let routeInteractionReadyKey = null;
let eventDoneKey = null;

// 強制關閉全部彈窗（演出階段嚴格防阻擋）
function forceCloseAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.chat-popup-card').forEach(el => el.classList.add('hidden'));
  const avatarModal = document.getElementById('avatarCustomModal');
  if (avatarModal) avatarModal.classList.add('hidden');
  const equipModal = document.getElementById('equipDropModal');
  if (equipModal) equipModal.classList.add('hidden');
  const minionModal = document.getElementById('minionDetailModal');
  if (minionModal) minionModal.classList.add('hidden');
  const roleModal = document.getElementById('roleDetailModal');
  if (roleModal) roleModal.classList.add('hidden');
  const chatPopup = document.getElementById('chatPopupCard');
  if (chatPopup) chatPopup.classList.add('hidden');
  const endBattleModal = document.getElementById('endBattleModal');
  if (endBattleModal) endBattleModal.classList.add('hidden');
  const targetModal = document.getElementById('targetModal');
  if (targetModal) targetModal.classList.add('hidden');
  const transferLeaderModal = document.getElementById('transferLeaderModal');
  if (transferLeaderModal) transferLeaderModal.classList.add('hidden');
}
if (typeof window !== 'undefined') window.forceCloseAllModals = forceCloseAllModals;

// ==========================================================================
// Presentation Orchestrator & Duplicate Prevention (P2-R1 Section 0, 1, 2)
// ==========================================================================
const presentationManager = {
  playedKeys: new Set(),
  isBlocking: false,
  timerState: 'STOPPED', // 'STOPPED' | 'WAITING_FOR_PRESENTATION' | 'RUNNING' | 'EXPIRED'

  hasPlayed(key) {
    return this.playedKeys.has(key);
  },

  markPlayed(key) {
    this.playedKeys.add(key);
  },

  clear() {
    this.playedKeys.clear();
    this.setBlocking(false);
    this.timerState = 'STOPPED';
  },

  setBlocking(blocking) {
    this.isBlocking = Boolean(blocking);
    if (this.isBlocking) {
      forceCloseAllModals();
    }
    const root = document.getElementById('presentationRoot');
    if (root) {
      if (this.isBlocking) {
        root.classList.add('interactive');
        document.body.classList.add('presentation-blocking');
      } else {
        root.classList.remove('interactive');
        document.body.classList.remove('presentation-blocking');
      }
    }
  }
};

// ==========================================================================
// 沉浸式音效系統 (SFXManager - Web Audio API Procedural Synthesizer)
// 沿用 presentation-core.js 的單一真實來源 SFXManager
// ==========================================================================
const sfx = (typeof sfxManager !== 'undefined' ? sfxManager : (typeof window !== 'undefined' && window.sfxManager ? window.sfxManager : null));

function initAudio() {
  if (sfx && typeof sfx.init === 'function') sfx.init();
}

function playSound(type, options) {
  if (sfx && typeof sfx.play === 'function') {
    return sfx.play(type, options);
  } else if (typeof window !== 'undefined' && window.playSound) {
    return window.playSound(type, options);
  }
}

// 正式 UI SVG 圖示產生器 (避免使用 Emoji)
function getIconSvg(name, extraClass = '') {
  return `<svg class="ui-icon svg-icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

// 職業簡短定位標籤 (P2 規範：以簡短 Tag 呈現定位)
const ROLE_BADGES = {
  warrior: [
    { text: 'TANK', type: 'tank' },
    { text: '物理', type: '' },
    { text: '防護', type: '' }
  ],
  mage: [
    { text: 'DPS', type: 'dps' },
    { text: '魔法', type: '' },
    { text: '爆發', type: '' }
  ],
  archer: [
    { text: 'DPS', type: 'dps' },
    { text: '物理', type: '' },
    { text: '閃避', type: '' }
  ],
  assassin: [
    { text: 'DPS', type: 'dps' },
    { text: '物理', type: '' },
    { text: '暴擊', type: '' }
  ],
  bard: [
    { text: 'SUPPORT', type: 'support' },
    { text: '魔法', type: '' },
    { text: '群療', type: '' }
  ],
  alchemist: [
    { text: 'SUPPORT', type: 'support' },
    { text: '魔法', type: '' },
    { text: '調和', type: '' }
  ],
  druid: [
    { text: 'TANK', type: 'tank' },
    { text: '自然', type: '' },
    { text: '召喚', type: '' }
  ]
};

function getRoleIconName(roleKey) {
  const map = {
    warrior: 'shield',
    mage: 'magic',
    archer: 'arrow',
    assassin: 'sword',
    bard: 'sparkle',
    alchemist: 'poison',
    druid: 'summon', dreamweaver:'magic', stargazer:'sparkle', gladiator:'shield', samurai:'sword', sage:'info'
  };
  return map[roleKey] || 'user';
}

// 樓層開場大字幕播放紀錄（避免同一層切換重覆播放）

// DOM 元素引用
const elements = {
  // Badges & Header
  roomBadge: document.getElementById('roomBadge'),
  roomCodeText: document.getElementById('roomCodeText'),
  roomCopyToast: document.getElementById('roomCopyToast'),
  btnLeaveParty: document.getElementById('btnLeaveParty'),
  soundToggleBtn: document.getElementById('soundToggleBtn'),
  soundToggleImg: document.getElementById('soundToggleImg'),

  // Cinematic Banner & Transition Curtain
  screenTransitionCurtain: document.getElementById('screenTransitionCurtain'),
  stageCinematicBanner: document.getElementById('stageCinematicBanner'),
  cinematicBannerTitle: document.getElementById('cinematicBannerTitle'),
  cinematicBannerSub: document.getElementById('cinematicBannerSub'),

  // Views
  views: {
    entry: document.getElementById('viewEntry'),
    lobby: document.getElementById('viewLobby'),
    prologue: document.getElementById('viewPrologue'),
    route: document.getElementById('viewRoute'),
    transition: document.getElementById('viewTransition'),
    event: document.getElementById('viewEvent'),
    battle: document.getElementById('viewBattle'),
    checkpoint: document.getElementById('viewCheckpoint'),
    end: document.getElementById('viewEnd')
  },

  // Entry
  inputPlayerName: document.getElementById('inputPlayerName'),
  btnCreateRoom: document.getElementById('btnCreateRoom'),
  inputRoomCode: document.getElementById('inputRoomCode'),
  btnJoinRoom: document.getElementById('btnJoinRoom'),
  btnEntryAvatar: document.getElementById('btnEntryAvatar'),
  entryAvatarPreview: document.getElementById('entryAvatarPreview'),

  // Lobby
  lobbyMemberCount: document.getElementById('lobbyMemberCount'),
  lobbyMemberList: document.getElementById('lobbyMemberList'),
  roleSelectionGrid: document.getElementById('roleSelectionGrid'),
  btnStartGame: document.getElementById('btnStartGame'),
  leaderStartArea: document.getElementById('leaderStartArea'),
  memberWaitArea: document.getElementById('memberWaitArea'),
  btnToggleReady: document.getElementById('btnToggleReady'),
  readyBtnText: document.getElementById('readyBtnText'),
  startRequirementText: document.getElementById('startRequirementText'),
  transferLeaderModal: document.getElementById('transferLeaderModal'),
  transferLeaderModalDesc: document.getElementById('transferLeaderModalDesc'),
  btnCancelTransferLeader: document.getElementById('btnCancelTransferLeader'),
  btnConfirmTransferLeader: document.getElementById('btnConfirmTransferLeader'),

  // Game Start Overlay (P2-R1.1 Section 3)
  gameStartOverlay: document.getElementById('gameStartOverlay'),
  gameTitleContainer: document.getElementById('gameTitleContainer'),
  prologuePresentationContainer: document.getElementById('prologuePresentationContainer'),
  prologuePresBody: document.getElementById('prologuePresBody'),

  // Transition
  transitionTypewriterTitle: document.getElementById('transitionTypewriterTitle'),
  transitionRouteTag: document.getElementById('transitionRouteTag'),
  transitionStoryTitle: document.getElementById('transitionStoryTitle'),
  transitionStoryText: document.getElementById('transitionStoryText'),

  // Avatar Modal
  avatarModalOverlay: document.getElementById('avatarModalOverlay'),
  btnCloseAvatarModal: document.getElementById('btnCloseAvatarModal'),
  modalAvatarPreview: document.getElementById('modalAvatarPreview'),
  modalAvatarTypeLabel: document.getElementById('modalAvatarTypeLabel'),
  tabHeroBtn: document.getElementById('tabHeroBtn'),
  tabEmojiBtn: document.getElementById('tabEmojiBtn'),
  tabUploadBtn: document.getElementById('tabUploadBtn'),
  tabHeroContent: document.getElementById('tabHeroContent'),
  tabEmojiContent: document.getElementById('tabEmojiContent'),
  tabUploadContent: document.getElementById('tabUploadContent'),
  heroRoleOptionCard: document.getElementById('heroRoleOptionCard'),
  heroRoleOptionPreview: document.getElementById('heroRoleOptionPreview'),
  heroRoleOptionTitle: document.getElementById('heroRoleOptionTitle'),
  heroRoleOptionDesc: document.getElementById('heroRoleOptionDesc'),
  heroRoleOptionBadge: document.getElementById('heroRoleOptionBadge'),
  emojiGridAdventure: document.getElementById('emojiGridAdventure'),
  emojiGridCreatures: document.getElementById('emojiGridCreatures'),
  emojiGridWeapons: document.getElementById('emojiGridWeapons'),
  customEmojiInput: document.getElementById('customEmojiInput'),
  btnApplyCustomEmoji: document.getElementById('btnApplyCustomEmoji'),
  avatarDropzone: document.getElementById('avatarDropzone'),
  avatarFileInput: document.getElementById('avatarFileInput'),
  btnBrowseFile: document.getElementById('btnBrowseFile'),
  btnResetAvatarDefault: document.getElementById('btnResetAvatarDefault'),
  btnCancelAvatar: document.getElementById('btnCancelAvatar'),
  btnSaveAvatar: document.getElementById('btnSaveAvatar'),

  // Route
  routeFloorNum: document.getElementById('routeFloorNum'),
  routeFloorHeaderNum: document.getElementById('routeFloorHeaderNum'),
  routeMainTitle: document.getElementById('routeMainTitle'),
  routeDiffPercent: document.getElementById('routeDiffPercent'),
  routeTimerProgress: document.getElementById('routeTimerProgress'),
  routeTimerText: document.getElementById('routeTimerText'),
  routeStatusText: document.getElementById('routeStatusText'),
  routeOptionsGrid: document.getElementById('routeOptionsGrid'),
  routeVotersStatusList: document.getElementById('routeVotersStatusList'),
  routeAtmosphereText: document.getElementById('routeAtmosphereText'),
  floorIntroOverlay: document.getElementById('floorIntroOverlay'),
  floorIntroNumber: document.getElementById('floorIntroNumber'),
  floorIntroTitle: document.getElementById('floorIntroTitle'),
  routeTimerBar: document.getElementById('routeTimerBar'),

  // Event
  eventIcon: document.getElementById('eventIcon'),
  eventTitle: document.getElementById('eventTitle'),
  eventStoryText: document.getElementById('eventStoryText'),
  eventCardBox: document.getElementById('eventCardBox'),
  trapDiscoverySection: document.getElementById('trapDiscoverySection'),
  trapDiscoveryStory: document.getElementById('trapDiscoveryStory'),
  chestDiscoverySection: document.getElementById('chestDiscoverySection'),
  chestDiscoveryStory: document.getElementById('chestDiscoveryStory'),
  chestInteractionArea: document.getElementById('chestInteractionArea'),
  btnOpenChest: document.getElementById('btnOpenChest'),
  chestPresentationOverlay: document.getElementById('chestPresentationOverlay'),
  presentationChestVisual: document.getElementById('presentationChestVisual'),
  presentationRewardContent: document.getElementById('presentationRewardContent'),
  presentationRewardRarity: document.getElementById('presentationRewardRarity'),
  presentationRewardTitle: document.getElementById('presentationRewardTitle'),
  presentationRewardDesc: document.getElementById('presentationRewardDesc'),
  presentationRewardMeta: document.getElementById('presentationRewardMeta'),
  eventDetails: document.getElementById('eventDetails'),

  // Battle
  battleFloorNum: document.getElementById('battleFloorNum'),
  battleRoundNum: document.getElementById('battleRoundNum'),
  battleTimerCount: document.getElementById('battleTimerCount'),
  battleNarrativeBox: document.getElementById('battleNarrativeBox'),
  battleNarrativeText: document.getElementById('battleNarrativeText'),
  monsterCard: document.getElementById('monsterCard'),
  monsterAvatarWrap: document.getElementById('monsterAvatarWrap'),
  monsterAvatar: document.getElementById('monsterAvatar'),
  monsterSlashOverlay: document.getElementById('monsterSlashOverlay'),
  monsterMagicOverlay: document.getElementById('monsterMagicOverlay'),
  monsterPixelFx: document.getElementById('monsterPixelFx'),
  monsterFloatingContainer: document.getElementById('monsterFloatingContainer'),
  monsterName: document.getElementById('monsterName'),
  monsterResTag: document.getElementById('monsterResTag'),
  monsterDesc: document.getElementById('monsterDesc'),
  monsterHpText: document.getElementById('monsterHpText'),
  monsterHpFill: document.getElementById('monsterHpFill'),
  monsterAtkText: document.getElementById('monsterAtkText'),
  monsterUltName: document.getElementById('monsterUltName'),
  monsterBuffsRow: document.getElementById('monsterBuffsRow'),
  shieldNoticeBadge: document.getElementById('shieldNoticeBadge'),
  battleTeammatesGrid: document.getElementById('battleTeammatesGrid'),

  // Player action
  myRoleEmoji: document.getElementById('myRoleEmoji'),
  myRoleName: document.getElementById('myRoleName'),
  myHpSummary: document.getElementById('myHpSummary'),
  myAtkSummary: document.getElementById('myAtkSummary'),
  myEquipsSummary: document.getElementById('myEquipsSummary'),
  myActionStatus: document.getElementById('myActionStatus'),
  mySkillsRow: document.getElementById('mySkillsRow'),

  // Presentation Root & Overlays (P2-R1 Section 3, 20, 23, 24)
  presentationRoot: document.getElementById('presentationRoot'),
  trapPresentationOverlay: document.getElementById('trapPresentationOverlay'),
  trapVictimsContainer: document.getElementById('trapVictimsContainer'),
  presentationFxContainer: document.getElementById('presentationFxContainer'),

  // Combat Action Banner (3-column CSS Grid)
  combatActionBanner: document.getElementById('combatActionBanner'),
  combatBannerActor: document.getElementById('combatBannerActor'),
  combatBannerActorAvatar: document.getElementById('combatBannerActorAvatar'),
  combatBannerActorName: document.getElementById('combatBannerActorName'),
  combatBannerCenter: document.getElementById('combatBannerCenter'),
  combatBannerBadge: document.getElementById('combatBannerBadge'),
  combatBannerTitle: document.getElementById('combatBannerTitle'),
  combatBannerTags: document.getElementById('combatBannerTags'),
  combatBannerHiddenNote: document.getElementById('combatBannerHiddenNote'),
  combatBannerTarget: document.getElementById('combatBannerTarget'),
  combatBannerTargetAvatar: document.getElementById('combatBannerTargetAvatar'),
  combatBannerTargetName: document.getElementById('combatBannerTargetName'),

  // Skill Selection & Lock Bar
  skillSelectionBar: document.getElementById('skillSelectionBar'),
  selectionPromptText: document.getElementById('selectionPromptText'),
  selectionTargetText: document.getElementById('selectionTargetText'),
  btnConfirmLock: document.getElementById('btnConfirmLock'),
  btnUnlockAction: document.getElementById('btnUnlockAction'),

  // Equipment Drop Modal
  equipDropModal: document.getElementById('equipDropModal'),
  equipModalTitle: document.getElementById('equipModalTitle'),
  equipModalSubtitle: document.getElementById('equipModalSubtitle'),
  dropItemName: document.getElementById('dropItemName'),
  dropItemType: document.getElementById('dropItemType'),
  dropItemDesc: document.getElementById('dropItemDesc'),
  currentEquipCount: document.getElementById('currentEquipCount'),
  currentEquipsList: document.getElementById('currentEquipsList'),
  equipReplaceNotice: document.getElementById('equipReplaceNotice'),
  btnEquipItem: document.getElementById('btnEquipItem'),
  btnDiscardItem: document.getElementById('btnDiscardItem'),

  // Checkpoint
  cpFloorNum: document.getElementById('cpFloorNum'),
  btnCpContinue: document.getElementById('btnCpContinue'),
  btnCpEnd: document.getElementById('btnCpEnd'),
  cpLeaderControls: document.getElementById('cpLeaderControls'),
  cpMemberNotice: document.getElementById('cpMemberNotice'),

  // End
  endIcon: document.getElementById('endIcon'),
  endTitle: document.getElementById('endTitle'),
  endSubtitle: document.getElementById('endSubtitle'),
  endStatsBox: document.getElementById('endStatsBox'),
  btnRestartLobby: document.getElementById('btnRestartLobby'),

  // Logs & Floating Chat
  combatLogWindow: document.getElementById('combatLogWindow'),
  battleLogCard: document.getElementById('battleLogCard'),
  btnClearLog: document.getElementById('btnClearLog'),
  btnToggleLog: document.getElementById('btnToggleLog'),
  logToggleIcon: document.getElementById('logToggleIcon'),
  logToggleText: document.getElementById('logToggleText'),
  floatingChatContainer: document.getElementById('floatingChatContainer'),
  floatingChatBtn: document.getElementById('floatingChatBtn'),
  chatUnreadBadge: document.getElementById('chatUnreadBadge'),
  chatToastBubble: document.getElementById('chatToastBubble'),
  chatBubbleSender: document.getElementById('chatBubbleSender'),
  chatBubbleText: document.getElementById('chatBubbleText'),
  btnCloseChatBubble: document.getElementById('btnCloseChatBubble'),
  chatPopupCard: document.getElementById('chatPopupCard'),
  btnCloseChatPopup: document.getElementById('btnCloseChatPopup'),
  chatMessageList: document.getElementById('chatMessageList'),
  chatInput: document.getElementById('chatInput'),
  btnSendChat: document.getElementById('btnSendChat'),

  // Modal
  targetModal: document.getElementById('targetModal'),
  targetModalTitle: document.getElementById('targetModalTitle'),
  targetModalDesc: document.getElementById('targetModalDesc'),
  targetModalList: document.getElementById('targetModalList'),
  btnCancelTarget: document.getElementById('btnCancelTarget'),
  minionDetailModal: document.getElementById('minionDetailModal'),
  minionDetailTitle: document.getElementById('minionDetailTitle'),
  minionDetailSubtitle: document.getElementById('minionDetailSubtitle'),
  minionDetailList: document.getElementById('minionDetailList'),
  btnCloseMinionModal: document.getElementById('btnCloseMinionModal'),
  btnConfirmMinionModal: document.getElementById('btnConfirmMinionModal'),
  roleDetailModal: document.getElementById('roleDetailModal'),
  roleDetailTitle: document.getElementById('roleDetailTitle'),
  roleDetailSubtitle: document.getElementById('roleDetailSubtitle'),
  roleDetailAvatarWrap: document.getElementById('roleDetailAvatarWrap'),
  roleDetailBody: document.getElementById('roleDetailBody'),
  btnCloseRoleDetailModal: document.getElementById('btnCloseRoleDetailModal'),
  btnConfirmRoleDetailModal: document.getElementById('btnConfirmRoleDetailModal'),

  // Pause & End Battle Controls
  btnPauseGame: document.getElementById('btnPauseGame'),
  btnEndBattle: document.getElementById('btnEndBattle'),
  pauseOverlay: document.getElementById('pauseOverlay'),
  btnResumeGameBanner: document.getElementById('btnResumeGameBanner'),
  endBattleModal: document.getElementById('endBattleModal'),
  btnConfirmRetreat: document.getElementById('btnConfirmRetreat'),
  btnCancelEndBattle: document.getElementById('btnCancelEndBattle')
};

// 初始化姓名輸入框
if (myName) {
  elements.inputPlayerName.value = myName;
}

// 監聽 Socket 連線
socket.on('connect', () => {
  myId = socket.id;
  console.log('連線至伺服器，ID:', myId);
});

socket.on('init:constants', (data) => {
  classesData = data.classes || {};
  routesData = data.routes || [];
  if (data.roleDetails) {
    roleDetailsData = data.roleDetails;
  }
  if(typeof registerSkillCopies==='function')registerSkillCopies(classesData,roleDetailsData);
  renderRoleSelectionGrid();
  updateHeroRoleOptionUI();
});

let pendingAuthoritativeState = null;

socket.on('room:update', (state) => {
  if (battlePhaseController && (state.state !== 'IN_BATTLE' || battlePhaseController.battleKey !== battleSceneKey(state))) {
    battlePhaseController.abort();
    battleControlsReadyKey = null;
  }
  if (combatQueueController && state.state !== 'IN_BATTLE') { combatQueueController.abort(); pendingAuthoritativeState = null; }
  // 若目前正透過 Presentation Queue 逐步演出戰鬥交鋒（A5 規範）
  // 嚴禁以權威狀態直接提前覆蓋演出中的 HP / tempHp / bossHp / death state！
  if (isProcessingPresentationQueue) {
    pendingAuthoritativeState = state;
    syncChatMessages(state.chatMessages);
    return;
  }
  roomState = typeof projectChestDisplayState === 'function' ? projectChestDisplayState(projectTrapDisplayState(state)) : projectTrapDisplayState(state);
  roomState = projectExpandedDisplayState(roomState);
  currentRoomCode = state.code;
  renderApp();
  updateHeroRoleOptionUI();
  syncChatMessages(state.chatMessages);
});

// 取得玩家頭貼 HTML (變身形態 > 自訂頭貼 > 職業預設 > 預設頭像)
function getPlayerAvatarHtml(player, className = 'member-role-avatar') {
  if (!player) return `<div class="${className} member-avatar-placeholder">${getIconSvg('user')}</div>`;

  // 德魯伊變身形態優先顯示形態頭貼（狼人 / 遠古樹精）
  if (player.role === 'druid' && player.druidForm) {
    if (player.druidForm === 'werewolf') {
      return `<img src="/photo/狼人.webp" class="${className} druid-transformed-avatar" alt="狼人">`;
    } else if (player.druidForm === 'treant' || player.druidForm === 'tree') {
      return `<img src="/photo/遠古樹精.webp" class="${className} druid-transformed-avatar" alt="遠古樹精">`;
    }
  }

  const roleInfo = player.role ? classesData[player.role] : null;

  // 1. 玩家自訂頭貼 (自訂照片或自訂頭像)
  if (player.customAvatar) {
    if (player.customAvatar.startsWith('data:image/') || player.customAvatar.startsWith('http') || player.customAvatar.startsWith('/')) {
      return `<img src="${player.customAvatar}" class="${className}" alt="${escapeHtml(player.name)}">`;
    } else {
      return `<div class="${className} avatar-emoji-badge">${escapeHtml(player.customAvatar)}</div>`;
    }
  }

  // 2. 職業預設圖片或專屬圖示
  if (roleInfo && roleInfo.avatar) {
    return `<img src="${roleInfo.avatar}" class="${className}" alt="${roleInfo.name}">`;
  }
  if (player.role) {
    return `<div class="${className} avatar-icon-badge">${getIconSvg(getRoleIconName(player.role))}</div>`;
  }

  // 3. 未選職預設
  return `<div class="${className} member-avatar-placeholder">${getIconSvg('user')}</div>`;
}

// 取得職業標準圖像 HTML (Combat Resolution 規範：嚴禁使用自訂/Discord頭像，必須使用職業原畫或變身原畫)
function getClassPortraitHtml(roleOrPlayer, className = 'combat-banner-portrait') {
  let roleKey = '';
  let druidForm = null;
  if (typeof roleOrPlayer === 'string') {
    roleKey = roleOrPlayer;
  } else if (roleOrPlayer && typeof roleOrPlayer === 'object') {
    roleKey = roleOrPlayer.role || roleOrPlayer.sourceRole || '';
    druidForm = roleOrPlayer.druidForm || null;
  }
  if (roleKey === 'druid' && druidForm) {
    if (druidForm === 'werewolf') {
      return `<img src="/photo/狼人.webp" class="${className}" alt="狼人">`;
    } else if (druidForm === 'treant' || druidForm === 'tree') {
      return `<img src="/photo/遠古樹精.webp" class="${className}" alt="遠古樹精">`;
    }
  }
  const roleInfo = roleKey ? classesData[roleKey] : null;
  if (roleInfo && roleInfo.avatar) {
    return `<img src="${roleInfo.avatar}" class="${className}" alt="${escapeHtml(roleInfo.name || roleKey)}">`;
  }
  const icon = getRoleIconName(roleKey || 'warrior');
  return `<div class="${className} avatar-icon-badge">${getIconSvg(icon)}</div>`;
}

// 取得職業標準中文名稱
function getClassDisplayName(roleOrPlayer) {
  let roleKey = '';
  if (typeof roleOrPlayer === 'string') {
    roleKey = roleOrPlayer;
  } else if (roleOrPlayer && typeof roleOrPlayer === 'object') {
    roleKey = roleOrPlayer.role || roleOrPlayer.sourceRole || '';
  }
  const roleInfo = roleKey ? classesData[roleKey] : null;
  return roleInfo ? roleInfo.name : '冒險者';
}

// 切換視圖
let audioView = null;
function switchView(viewName) {
  if (audioView !== viewName) { if (audioView !== null) sfx?.stopAll(); audioView = viewName; }
  Object.keys(elements.views).forEach(key => {
    if (key === viewName) {
      elements.views[key].classList.add('active');
    } else {
      elements.views[key].classList.remove('active');
    }
  });

  // 發起組隊登入頁面 (entry) 隱藏懸浮聊天按鈕，進入選角色 (lobby) 及後續頁面時顯示
  if (elements.floatingChatContainer) {
    if (viewName === 'entry') {
      elements.floatingChatContainer.classList.add('hidden');
      dismissChatBubble();
      toggleChat(false);
    } else {
      elements.floatingChatContainer.classList.remove('hidden');
    }
  }
}

// Presentation-Gated View Reveal (P2-R1.1 Section 4)
function gateDestinationView(viewName) {
  const v = elements.views ? elements.views[viewName] : null;
  if (v) v.classList.add('view-gated-hidden');
}

function revealDestinationView(viewName) {
  const v = elements.views ? elements.views[viewName] : null;
  if (v) v.classList.remove('view-gated-hidden');
}

// 渲染整體畫面
function renderApp() {
  if (!roomState) return;

  if (victoryPresentationController && (roomState.state !== 'BATTLE_VICTORY' ||
      roomState.currentVictory?.presentationId !== victoryPresentationController.presentationId)) {
    victoryPresentationController.abort();
    victoryPresentationController = null;
    victoryStartedId = null;
  }
  if (prologueController && roomState.state !== 'PROLOGUE') {
    prologueController.abort();
  }
  if (routePresentationController && (roomState.state !== 'CHOOSING_ROUTE' ||
      routePresentationController.presentationId !== roomState.routePresentationId)) {
    routePresentationController.abort();
  }

  if (trapPresentationController && (roomState.state !== 'EVENT' ||
      roomState.currentEvent?.type !== 'trap' ||
      roomState.currentEvent.presentationId !== trapPresentationController.presentationId)) {
    trapPresentationController.abort();
  }
  if (roomState.state !== 'EVENT' || roomState.currentEvent?.type !== 'trap') {
    trapDisplay = null;
    trapStartedId = null;
  }

  if (chestPresentationController && (roomState.state !== 'EVENT' ||
      roomState.currentEvent?.type !== 'treasure' ||
      roomState.currentEvent.presentationId !== chestPresentationController.presentationId)) {
    chestPresentationController.abort();
  }
  if (roomState.state !== 'EVENT' || roomState.currentEvent?.type !== 'treasure') {
    chestDisplay = null;
    chestStartedId = null;
    chestRewardCompletedId = null;
  }


  const me = roomState.players.find(p => p.id === myId);
  const isLeader = roomState.leaderId === myId;

  // 更新頂部資訊條 (僅保留點擊可複製的房號)
  if (elements.roomBadge) elements.roomBadge.classList.remove('hidden');
  if (elements.roomCodeText) elements.roomCodeText.textContent = roomState.code;

  if (me) {
    // 清除舊版錯誤存入的 /photo/* 本地暫存
    let savedAvatar = localStorage.getItem('dungeon_custom_avatar');
    if (savedAvatar && savedAvatar.startsWith('/photo/')) {
      localStorage.removeItem('dungeon_custom_avatar');
      savedAvatar = null;
    }

    // 自動同步本機儲存之自訂頭貼 (若非職業預設)
    if (savedAvatar && !me.customAvatar) {
      socket.emit('player:update_avatar', { avatar: savedAvatar });
    }
  }

  // 暫停與放棄挑戰按鈕控制
  if (roomState.state === 'LOBBY' || roomState.state === 'GAME_OVER' || roomState.state === 'VICTORY') {
    elements.btnPauseGame.classList.add('hidden');
    elements.btnEndBattle.classList.add('hidden');
    elements.pauseOverlay.classList.add('hidden');
  } else {
    elements.btnPauseGame.classList.remove('hidden');
    if (isLeader) {
      elements.btnEndBattle.classList.remove('hidden');
    } else {
      elements.btnEndBattle.classList.add('hidden');
    }

    if (roomState.isPaused) {
      elements.btnPauseGame.textContent = '▶️ 繼續';
      elements.btnPauseGame.classList.add('paused-active');
      elements.pauseOverlay.classList.remove('hidden');
    } else {
      elements.btnPauseGame.textContent = '⏸️ 暫停';
      elements.btnPauseGame.classList.remove('paused-active');
      elements.pauseOverlay.classList.add('hidden');
    }
  }

  // 檢查階段變更並觸發 1 秒轉場與專屬像素大字幕
  checkStageTransition(roomState);

  // 根據房間階段切換視圖
  switch (roomState.state) {
    case 'LOBBY':
      switchView('lobby');
      presentationManager.clear();
      prologueCompleted = false;
      isPrologueTyping = false;
      routeNarrativeDoneKey = null;
      routeInteractionReadyKey = null;
      eventDoneKey = null;
      lastAnnouncedBattleRound = 0;
      renderLobby(me, isLeader);
      break;

    case 'PROLOGUE':
      switchView('prologue');
      renderPrologue();
      break;

    case 'CHOOSING_ROUTE':
      switchView('route');
      renderRouteChoice(me, isLeader);
      break;

    case 'TRANSITION':
      switchView('transition');
      renderTransition();
      break;

    case 'EVENT':
      switchView('event');
      renderEvent();
      break;

    case 'IN_BATTLE':
      switchView('battle');
      renderBattle(me, isLeader);
      break;

    case 'BATTLE_VICTORY':
      if (roomState.victoryInteractionReady) renderBattle(me, isLeader);
      switchView('battle');
      renderBattleVictory();
      break;

    case 'CHECKPOINT':
      switchView('checkpoint');
      renderCheckpoint(me, isLeader);
      break;

    case 'GAME_OVER':
      switchView('end');
      renderGameOver(isLeader);
      break;

    case 'VICTORY':
      switchView('end');
      renderVictory(isLeader);
      break;
  }

  // 更新日誌
  renderLogs();

  // 檢查並渲染戰利品裝備抉擇彈窗 (上限 3 件與手動替換)
  renderPendingDropModal(me);
}

let selectedReplaceIndex = -1;

// 渲染戰利品裝備抉擇 / 替換 Modal (上限 3 件)
function renderPendingDropModal(me) {
  if (!elements.equipDropModal) return;

  const dropInfo = roomState?.pendingDrop;
  if (roomState?.state === 'BATTLE_VICTORY' && !roomState.victoryInteractionReady) {
    elements.equipDropModal.classList.add('hidden'); return;
  }
    // Phase 4: Gate equip modal until chest presentation and reward reveal have settled
  if (roomState?.state === 'EVENT' && roomState.currentEvent?.type === 'treasure') {
    if (chestRewardCompletedId !== roomState.currentEvent.presentationId) {
      elements.equipDropModal.classList.add('hidden');
      return;
    }
  }

  if (!dropInfo || !me || dropInfo.ownerId !== myId) {
    elements.equipDropModal.classList.add('hidden');
    selectedReplaceIndex = -1;
    return;
  }

  const drop = dropInfo.drop;
  elements.equipModalTitle.innerHTML = `${getIconSvg('chest')} <span>獲得戰利品裝備：【${escapeHtml(drop.name)}】！</span>`;
  elements.equipModalSubtitle.textContent = `你在${dropInfo.source === 'battle' ? '擊敗怪物' : '探索寶箱'}後獲得了這件裝備！請抉擇是否穿戴（每位角色上限 3 件）：`;
  elements.dropItemName.textContent = drop.name;
  elements.dropItemType.innerHTML = drop.type === 'weapon' ? `${getIconSvg('sword')} 武器` : (drop.type === 'armor' ? `${getIconSvg('shield')} 防具` : `${getIconSvg('sparkle')} 飾品`);
  elements.dropItemDesc.textContent = drop.desc || drop.statDesc || '';

  const myEquips = me.equips || [];
  elements.currentEquipCount.textContent = myEquips.length;
  const isFull = myEquips.length >= 3;

  const isUniqueRestricted = (drop.id === 'w_greatsword' || drop.id === 'b_violin');
  const alreadyOwnsUnique = isUniqueRestricted && myEquips.some((eq, idx) => eq.id === drop.id && idx !== selectedReplaceIndex);

  if (alreadyOwnsUnique) {
    elements.equipReplaceNotice.textContent = `【${drop.name}】為神兵唯一裝備，不可重複穿戴！`;
    elements.equipReplaceNotice.classList.remove('hidden');
    elements.btnEquipItem.disabled = true;
    elements.btnEquipItem.style.opacity = '0.5';
    elements.btnEquipItem.style.cursor = 'not-allowed';
  } else {
    elements.btnEquipItem.disabled = false;
    elements.btnEquipItem.style.opacity = '';
    elements.btnEquipItem.style.cursor = '';
    if (isFull) {
      elements.equipReplaceNotice.textContent = '裝備已滿 3 件，請從下方點選一件舊裝備進行替換：';
      elements.equipReplaceNotice.classList.remove('hidden');
    } else {
      elements.equipReplaceNotice.classList.add('hidden');
    }
  }

  elements.currentEquipsList.innerHTML = '';
  if (myEquips.length === 0) {
    elements.currentEquipsList.innerHTML = '<div style="color: var(--color-text-secondary); font-size: 13.5px; padding: 6px 0;">目前尚未穿戴任何裝備（空間 0/3）。可以直接穿上！</div>';
  } else {
    myEquips.forEach((eq, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = `current-equip-item ${selectedReplaceIndex === idx ? 'selected-to-replace' : ''}`;
      itemEl.innerHTML = `
        <div class="current-equip-info">
          <span class="current-equip-name">${escapeHtml(eq.name)}</span>
          <span class="current-equip-desc">${escapeHtml(eq.desc || eq.statDesc || '')}</span>
        </div>
        ${isFull ? `<span class="replace-radio-badge">${selectedReplaceIndex === idx ? '已選替換此件' : '點選以替換'}</span>` : ''}
      `;

      if (isFull) {
        itemEl.addEventListener('click', () => {
          selectedReplaceIndex = idx;
          playSound('click');
          renderPendingDropModal(me);
        });
      }
      elements.currentEquipsList.appendChild(itemEl);
    });
  }

  elements.btnEquipItem.onclick = () => {
    if (alreadyOwnsUnique) {
      alert('此裝備為神兵唯一裝備，不可重複穿戴！');
      return;
    }
    if (isFull && (selectedReplaceIndex < 0 || selectedReplaceIndex >= myEquips.length)) {
      alert('裝備欄已滿 3 件！請先點選上方欲替換卸下的既有裝備。');
      return;
    }
    playSound('heal');
    socket.emit('equip:choice', { action: 'equip', replaceIndex: selectedReplaceIndex });
    elements.equipDropModal.classList.add('hidden');
    selectedReplaceIndex = -1;
  };

  elements.btnDiscardItem.onclick = () => {
    playSound('click');
    socket.emit('equip:choice', { action: 'discard' });
    elements.equipDropModal.classList.add('hidden');
    selectedReplaceIndex = -1;
  };

  elements.equipDropModal.classList.remove('hidden');
}

// Lobby readiness uses the existing leader/member rules, with a visible label.
function renderMemberStatusBadge(p, isThisLeader) {
  const isReady = isThisLeader ? Boolean(p.role) : (Boolean(p.role) && Boolean(p.isReady));
  if (isReady) {
    return `
      <span class="member-status-icon ready" title="已就緒" aria-label="已就緒">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg><span class="member-ready-label">已就緒</span>
      </span>
    `;
  }
  return `
    <span class="member-status-icon waiting" title="尚未就緒" aria-label="尚未就緒">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="13"></line>
        <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"></circle>
      </svg><span class="member-ready-label">${p.role ? '未準備' : '未選職'}</span>
    </span>
  `;
}

// 1. 渲染大廳
function renderLobby(me, isLeader) {
  elements.lobbyMemberCount.textContent = roomState.players.length;

  // 渲染小隊成員
  elements.lobbyMemberList.innerHTML = '';
  roomState.players.forEach(p => {
    const isThisMe = p.id === myId;
    const isThisLeader = p.id === roomState.leaderId;
    const roleInfo = p.role ? classesData[p.role] : null;
    const canTransferToThis = isLeader && !isThisMe;

    const div = document.createElement('div');
    div.className = `member-item ${isThisMe ? 'is-me' : ''} ${canTransferToThis ? 'can-transfer-leader' : ''}`;

    if (isThisMe) {
      div.innerHTML = `
        <div class="member-info-col">
          <div class="member-avatar-wrapper clickable-avatar" id="btnMemberMyAvatar" title="點擊更換個人頭貼">
            ${getPlayerAvatarHtml(p, 'member-role-avatar')}
            ${roleInfo ? `<span class="member-avatar-role-badge" title="${roleInfo.name}">${getIconSvg(getRoleIconName(p.role))}</span>` : ''}
          </div>
          <div class="member-name-group">
            ${isEditingMyName ? `
              <div class="member-inline-rename-form">
                <input type="text" class="inline-rename-input" id="inputInlineRename" value="${escapeHtml(editingNameValue !== '' ? editingNameValue : p.name)}" maxlength="12" placeholder="輸入暱稱...">
                <button type="button" class="btn-micro-action btn-save-name" id="btnSaveInlineRename" title="確認修改">${getIconSvg('check')}</button>
                <button type="button" class="btn-micro-action btn-cancel-name" id="btnCancelInlineRename" title="取消">${getIconSvg('close')}</button>
              </div>
            ` : `
              <div class="member-name-row">
                <span class="member-name">
                  ${isThisLeader ? `<span class="crown-tag" title="房主">${getIconSvg('flag')}<small>房主</small></span>` : ''}
                  <span class="member-name-text" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                  <span class="me-tag">(你)</span>
                </span>
                <button type="button" class="btn-icon-rename" id="btnTriggerInlineRename" title="修改暱稱">${getIconSvg('ready')}</button>
              </div>
            `}
            <div class="member-sub-actions">
              <span class="member-role-tag">
                ${roleInfo ? escapeHtml(roleInfo.name) : '<span class="role-unselected">未選職</span>'}
              </span>
            </div>
          </div>
        </div>
        <div class="member-status-col">
          ${renderMemberStatusBadge(p, isThisLeader)}
        </div>
      `;

      // 綁定 (你) 的頭貼點擊換頭貼事件
      const avatarWrap = div.querySelector('#btnMemberMyAvatar');
      if (avatarWrap) {
        avatarWrap.addEventListener('click', openAvatarModal);
      }

      const btnTriggerRename = div.querySelector('#btnTriggerInlineRename');
      if (btnTriggerRename) {
        btnTriggerRename.addEventListener('click', () => {
          isEditingMyName = true;
          editingNameValue = p.name;
          renderLobby(me, isLeader);
        });
      }

      if (isEditingMyName) {
        const renameInput = div.querySelector('#inputInlineRename');
        const btnSave = div.querySelector('#btnSaveInlineRename');
        const btnCancel = div.querySelector('#btnCancelInlineRename');

        if (renameInput) {
          renameInput.addEventListener('input', (e) => {
            editingNameValue = e.target.value;
          });
          renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitInlineRename(renameInput.value);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              isEditingMyName = false;
              editingNameValue = '';
              renderLobby(me, isLeader);
            }
          });
          setTimeout(() => {
            if (renameInput && document.activeElement !== renameInput) {
              renameInput.focus();
              renameInput.select();
            }
          }, 30);
        }

        if (btnSave) {
          btnSave.addEventListener('click', () => {
            if (renameInput) submitInlineRename(renameInput.value);
          });
        }

        if (btnCancel) {
          btnCancel.addEventListener('click', () => {
            isEditingMyName = false;
            editingNameValue = '';
            renderLobby(me, isLeader);
          });
        }
      }
    } else {
      div.innerHTML = `
        <div class="member-info-col">
          <div class="member-avatar-wrapper">
            ${getPlayerAvatarHtml(p, 'member-role-avatar')}
            ${roleInfo ? `<span class="member-avatar-role-badge" title="${roleInfo.name}">${getIconSvg(getRoleIconName(p.role))}</span>` : ''}
          </div>
          <div class="member-name-group">
            <span class="member-name">
              ${isThisLeader ? `<span class="crown-tag" title="房主">${getIconSvg('flag')}<small>房主</small></span>` : ''}
              <span class="member-name-text" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
            </span>
            <span class="member-role-tag">
              ${roleInfo ? escapeHtml(roleInfo.name) : '<span class="role-unselected">未選職</span>'}
            </span>
          </div>
        </div>
        <div class="member-status-col">
          ${renderMemberStatusBadge(p, isThisLeader)}
        </div>
      `;

      if (canTransferToThis) {
        div.title = '點擊轉移位子';
        div.addEventListener('click', (e) => {
          if (e.target.closest('button, input')) return;
          playSound('click');
          openTransferLeaderModal(p);
        });
      }
    }

    elements.lobbyMemberList.appendChild(div);
  });

  // 更新角色選擇卡
  renderRoleSelectionGrid();

  // 隊員準備按鈕狀態
  if (elements.btnToggleReady) {
    if (me?.isReady) {
      if (elements.readyBtnText) elements.readyBtnText.textContent = '取消準備';
      elements.btnToggleReady.className = 'btn btn-success btn-large full-width';
    } else {
      if (elements.readyBtnText) elements.readyBtnText.textContent = '準備就緒';
      elements.btnToggleReady.className = 'btn btn-primary btn-large full-width';
    }
    elements.btnToggleReady.disabled = !me?.role;
  }

  // 隊長出發按鈕判定（需所有隊友已選職且非隊長成員皆已準備）
  const otherMembers = roomState.players.filter(p => p.id !== roomState.leaderId);
  const allReady = otherMembers.length === 0 || otherMembers.every(p => p.isReady);
  const allPicked = roomState.players.length > 0 && roomState.players.every(p => p.role);
  if (isLeader) {
    elements.leaderStartArea.classList.remove('hidden');
    elements.memberWaitArea.classList.add('hidden');
    elements.btnStartGame.disabled = !(allPicked && allReady);
    if (!allPicked) {
      elements.startRequirementText.textContent = '尚有成員未完成選職';
      elements.startRequirementText.style.color = '#dc2626';
    } else if (!allReady) {
      elements.startRequirementText.textContent = '尚有成員未準備就緒';
      elements.startRequirementText.style.color = '#dc2626';
    } else {
      elements.startRequirementText.textContent = '全體就緒！點擊開始冒險！';
      elements.startRequirementText.style.color = '#16a34a';
    }
  } else {
    elements.leaderStartArea.classList.add('hidden');
    elements.memberWaitArea.classList.remove('hidden');
  }
}

// 渲染選職卡片
function renderRoleSelectionGrid() {
  if (!classesData || Object.keys(classesData).length === 0) return;
  renderRoleLobby({classes:classesData,details:roleDetailsData||DEFAULT_ROLE_DETAILS,players:roomState?.players||[],myId,onSelect:roleKey=>{
    playSound('click');
    socket.emit('player:select_role',{roleKey},res=>{
      if(!res.success){alert(res.message);lobbyRoleUi.role=roomState?.players?.find(p=>p.id===myId)?.role||'warrior';renderRoleSelectionGrid();}
    });
  }});
}
// --------------------------------------------------------------------------
// 全域轉場、大字幕與打字機函式
// --------------------------------------------------------------------------

// 播放打字機音效 (細緻高頻敲擊)
function playTypewriterClick() {
  if (soundEnabled) {
    playSound('type');
  }
}

// 支援單一元素字串打字
function typeWriterEffect(element, text, speed = 45, onComplete = null) {
  if (currentTypewriterTimer) {
    clearInterval(currentTypewriterTimer);
    currentTypewriterTimer = null;
  }
  if (!element) {
    if (onComplete) onComplete();
    return;
  }
  element.textContent = '';
  element.classList.add('typewriter-cursor');
  let i = 0;
  currentTypewriterTimer = setInterval(() => {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      if (i % 2 === 0) playTypewriterClick();
    } else {
      clearInterval(currentTypewriterTimer);
      currentTypewriterTimer = null;
      setTimeout(() => {
        element.classList.remove('typewriter-cursor');
        if (onComplete) onComplete();
      }, 150);
    }
  }, speed);
}

// 支援多段落連續打字機效果
function typeWriterParagraphs(container, paragraphs, speed = 20, onComplete = null) {
  if (currentTypewriterTimer) {
    clearInterval(currentTypewriterTimer);
    currentTypewriterTimer = null;
  }
  if (!container || !paragraphs || paragraphs.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  container.innerHTML = '';
  let pIdx = 0;

  function typeNext() {
    if (pIdx >= paragraphs.length) {
      if (onComplete) onComplete();
      return;
    }
    const pEl = document.createElement('p');
    pEl.classList.add('typewriter-cursor');
    container.appendChild(pEl);

    const fullText = paragraphs[pIdx];
    let charIdx = 0;
    currentTypewriterTimer = setInterval(() => {
      if (charIdx < fullText.length) {
        pEl.textContent += fullText.charAt(charIdx);
        charIdx++;
        if (charIdx % 2 === 0) playTypewriterClick();
      } else {
        clearInterval(currentTypewriterTimer);
        currentTypewriterTimer = null;
        pEl.classList.remove('typewriter-cursor');
        pIdx++;
        setTimeout(typeNext, 60);
      }
    }, speed);
  }

  typeNext();
}

let cinematicBannerTimeout = null;

// 播放全域像素大字幕橫幅 (左側滑入 -> 中間停留1秒 -> 右側滑出)
function showCinematicBanner({ title, subtitle, theme = 'gold', onFinish = null }) {
  const banner = elements.stageCinematicBanner;
  if (!banner) {
    if (onFinish) onFinish();
    return;
  }

  if (cinematicBannerTimeout) {
    clearTimeout(cinematicBannerTimeout);
    cinematicBannerTimeout = null;
  }

  if (elements.cinematicBannerTitle) elements.cinematicBannerTitle.textContent = title;
  if (elements.cinematicBannerSub) elements.cinematicBannerSub.textContent = subtitle || '';

  // 設置主題樣式 (冒險金、玩家藍、首領紅、營地綠、事件金)
  banner.className = 'stage-cinematic-banner';
  if (theme === 'player') banner.classList.add('theme-player');
  else if (theme === 'boss') banner.classList.add('theme-boss');
  else if (theme === 'event') banner.classList.add('theme-event');
  else if (theme === 'camp') banner.classList.add('theme-camp');

  banner.classList.remove('hidden');
  banner.classList.remove('animating');
  void banner.offsetWidth; // 強制重繪觸發動畫
  banner.classList.add('animating');

  playSound('banner');

  // 動畫結束時隱藏並觸發回調 (2.2 秒)
  cinematicBannerTimeout = setTimeout(() => {
    banner.classList.add('hidden');
    banner.classList.remove('animating');
    cinematicBannerTimeout = null;
    if (onFinish) onFinish();
  }, 2200);
}

let screenTransitionTimeout = null;

// 執行約 1 秒的淡出淡入轉場 (Fade-out -> 切換 -> Fade-in)
function triggerScreenTransition(duringFadeOut = null, afterFadeIn = null) {
  const curtain = elements.screenTransitionCurtain;
  if (!curtain) {
    if (duringFadeOut) duringFadeOut();
    if (afterFadeIn) afterFadeIn();
    return;
  }

  if (screenTransitionTimeout) {
    clearTimeout(screenTransitionTimeout);
    screenTransitionTimeout = null;
  }

  curtain.classList.remove('hidden');
  curtain.classList.add('fade-active');

  screenTransitionTimeout = setTimeout(() => {
    if (duringFadeOut) duringFadeOut();
    setTimeout(() => {
      curtain.classList.remove('fade-active');
      setTimeout(() => {
        curtain.classList.add('hidden');
        screenTransitionTimeout = null;
        if (afterFadeIn) afterFadeIn();
      }, 450);
    }, 100);
  }, 450);
}

// 計算階段識別唯一鍵值
function getStageKey(state) {
  if (!state) return 'NONE';
  switch (state.state) {
    case 'LOBBY': return 'LOBBY';
    case 'PROLOGUE': return 'PROLOGUE';
    case 'CHOOSING_ROUTE': return `ROUTE_${state.floor}`;
    case 'TRANSITION': return `TRANSITION_${state.floor}_${state.currentTransition?.routeId || ''}`;
    case 'EVENT': return `EVENT_${state.floor}_${state.currentEvent?.title || state.currentEvent?.type || ''}`;
    case 'IN_BATTLE': return `BATTLE_${state.floor}_${state.currentMonster?.name || ''}`;
    case 'CHECKPOINT': return `CHECKPOINT_${state.floor}`;
    case 'GAME_OVER': return `GAME_OVER_${state.floor}`;
    case 'VICTORY': return `VICTORY_${state.floor}`;
    default: return state.state;
  }
}

// 協調階段過場與大字幕
function checkStageTransition(state) {
  if (!state) return;
  const newStage = getStageKey(state);
  if (newStage === currentActiveStage) return;

  const prevStage = currentActiveStage;
  currentActiveStage = newStage;

  // 第一次進入大廳或初始無狀態，不觸發全螢幕過場
  if (prevStage === null || (prevStage === 'NONE' && newStage === 'LOBBY')) {
    return;
  }

  // Game start owns its black curtain; do not run a competing screen transition.
  if (state.state === 'PROLOGUE') {
    prologueCompleted = false;
    return;
  }
  // Exploration owns its full-screen floor intro and section reveal.
  if (state.state === 'BATTLE_VICTORY') return;
  if (state.state === 'IN_BATTLE' || state.state === 'CHOOSING_ROUTE' ||
      (state.state === 'EVENT' && state.currentEvent?.type === 'trap')) return;

  // 1 秒淡出淡入轉場
  triggerScreenTransition();

  // 根據不同階段觸發對應的像素大字幕 (左滑入 -> 中間大幅減速停留1秒 -> 右滑出)
  switch (state.state) {
    case 'EVENT':
      // P2-R1 Section 1 & 20: Event presentation is owned solely by renderEvent (playTrapPresentation / playChestPresentation).
      // No duplicate cinematic banner here.
      break;

    case 'IN_BATTLE':
      // P2-R1 Section 23 & 24: Boss Intro and Round Start are owned solely by renderBattle on #presentationRoot.
      // No duplicate cinematic banner here.
      break;

    case 'CHECKPOINT': {
      const cpKey = `CHECKPOINT_BANNER_${state.floor}`;
      if (!presentationManager.hasPlayed(cpKey)) {
        presentationManager.markPlayed(cpKey);
        playSound('heal_chime');
        showCinematicBanner({
          title: '【庇護營地・短暫休整】',
          subtitle: `FLOOR ${state.floor} · SANCTUARY REST`,
          theme: 'camp'
        });
      }
      break;
    }
  }
}

// Phase 1: one owner, one curtain, no click-to-complete or skip path.
const PROLOGUE_TIMING = Object.freeze({
  titleEnter: 850,
  titleHold: 1400,
  titleExit: 600,
  blackHold: 200,
  storyEnter: 600,
  character: 40,
  comma: 140,
  sentence: 280,
  newline: 380,
  paragraph: 600,
  storyHold: 1800,
  storyExit: 800,
  dungeonReveal: 600
});

function waitForPrologue(ms, signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new DOMException('Presentation cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

function prologueFrame(signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', cancel);
      reject(new DOMException('Presentation cancelled', 'AbortError'));
    };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    });
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

async function typePrologueParagraphs(container, paragraphs, signal, timing = PROLOGUE_TIMING) {
  // Never insert complete text, even in a hidden pre-render. Paint empty first.
  container.replaceChildren();
  await prologueFrame(signal);
  await prologueFrame(signal);
  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = document.createElement('p');
    container.appendChild(paragraph);
    const characters = Array.from(paragraphs[index]);
    for (let charIndex = 0; charIndex < characters.length; charIndex++) {
      await waitForPrologue(timing.character, signal);
      const character = characters[charIndex];
      paragraph.appendChild(document.createTextNode(character));
      if (charIndex % 2 === 1 && !/\s/.test(character)) playTypewriterClick();
      const pause = /[，、,；;：:]/.test(character) ? timing.comma
        : /[。！？!?…]/.test(character) ? timing.sentence
        : character === '\n' ? timing.newline : 0;
      if (pause) await waitForPrologue(pause, signal);
    }
    if (index < paragraphs.length - 1) {
      await waitForPrologue(timing.paragraph, signal);
    }
  }
}

async function renderProloguePresentation() {
  if (prologueCompleted || isPrologueTyping) return;
  isPrologueTyping = true;
  const controller = new AbortController();
  prologueController = controller;
  const { signal } = controller;
  const overlay = elements.gameStartOverlay;
  const title = elements.gameTitleContainer;
  const story = elements.prologuePresentationContainer;
  const body = elements.prologuePresBody;
  // Use the authoritative story already supplied by Room, without new narrative.
  const paragraphs = roomState?.currentPrologue?.paragraphs;
  let completed = false;

  presentationManager.setBlocking(true);
  gateDestinationView('prologue');
  gateDestinationView('route');
  // Prevent keyboard focus from reaching HUD controls through the curtain.
  const app = document.getElementById('app');
  const previousInert = app?.inert || false;
  const chat = elements.floatingChatContainer;
  const previousChatInert = chat?.inert || false;
  if (app) app.inert = true;
  if (chat) chat.inert = true;
  document.body.classList.add('presentation-opening');

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (overlay) overlay.classList.add('hidden');
    if (title) { title.classList.add('hidden'); title.classList.remove('exit'); }
    if (story) { story.classList.add('hidden'); story.classList.remove('exit'); }
    if (body) body.replaceChildren();
    if (app) app.inert = previousInert;
    if (chat) chat.inert = previousChatInert;
    document.body.classList.remove('presentation-opening');
    if (prologueController === controller) {
      prologueController = null;
      isPrologueTyping = false;
      presentationManager.setBlocking(false);
      revealDestinationView('route');
    }
  };
  // Abort cleans synchronously, before renderApp starts the next owner.
  signal.addEventListener('abort', cleanup, { once: true });

  try {
    if (!overlay || !title || !story || !body || !paragraphs?.length) {
      throw new Error('Missing game-start presentation elements or story');
    }
    body.replaceChildren();
    story.classList.add('hidden');
    story.classList.remove('exit');
    title.classList.remove('exit');
    overlay.style.opacity = '1';
    overlay.classList.remove('hidden');
    title.classList.remove('hidden');
    playSound('logo_intro', { signal });
    await waitForPrologue(Math.max(PROLOGUE_TIMING.titleEnter + PROLOGUE_TIMING.titleHold, SFX_ASSETS.logo_intro.identityBeatMs), signal);
    title.classList.add('exit');
    await waitForPrologue(PROLOGUE_TIMING.titleExit, signal);
    title.classList.add('hidden');
    await waitForPrologue(PROLOGUE_TIMING.blackHold, signal);

    // Empty story is visible during entry; text begins after entry and two RAFs.
    story.classList.remove('hidden');
    await waitForPrologue(PROLOGUE_TIMING.storyEnter, signal);
    await typePrologueParagraphs(body, paragraphs, signal);
    await waitForPrologue(PROLOGUE_TIMING.storyHold, signal);
    story.classList.add('exit');
    await waitForPrologue(PROLOGUE_TIMING.storyExit, signal);
    story.classList.add('hidden');
    overlay.style.opacity = '0';
    await waitForPrologue(PROLOGUE_TIMING.dungeonReveal, signal);
    overlay.classList.add('hidden');

    // Phase 2 gives every floor (including Floor 1) to the route owner.
    completed = true;
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('[Presentation:prologue]', error);
    }
  } finally {
    signal.removeEventListener('abort', cleanup);
    cleanup();
  }

  if (completed && !signal.aborted && roomState?.state === 'PROLOGUE') {
    prologueCompleted = true;
    socket.emit('prologue:next');
  }
}

function renderPrologue() {
  // All failures are handled inside the async owner; no unhandled promise.
  void renderProloguePresentation();
}

// 1.8 渲染進入層數打字機轉場
function renderTransition() {
  const trans = roomState.currentTransition;
  if (!trans) return;

  const key = `${trans.floor}_${trans.routeId}_${trans.outcomeType}`;
  if (lastTypedTransitionKey !== key) {
    lastTypedTransitionKey = key;
    if (elements.transitionRouteTag) {
      elements.transitionRouteTag.innerHTML = `${getIconSvg('flag')} <span>前往路線：${escapeHtml(trans.routeName)}</span>`;
    }
    if (elements.transitionStoryTitle) {
      elements.transitionStoryTitle.textContent = trans.storyTitle || `【${trans.routeName}】`;
    }

    // 先以打字機風格呈現標題 (一個字一個字慢慢出現)
    if (elements.transitionTypewriterTitle) {
      typeWriterEffect(elements.transitionTypewriterTitle, trans.title || `將進入第 ${trans.floor} 層`, 60, () => {
        // 接著以更快的打字機呈現故事
        if (elements.transitionStoryText) {
          typeWriterEffect(elements.transitionStoryText, trans.storyText || '正在深入未知迷霧中...', 20);
        }
      });
    }
  }
}

// --------------------------------------------------------------------------
// Trap Event Presentation (P2-R1 Section 20 & 77)
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// Chest Event Presentation (P2-R1 Section 21)
// --------------------------------------------------------------------------
// Phase 4 chest presentation is now owned solely by chest.js

// 3. 渲染事件 (P2-R1 Section 1, 20, 21: 單一 Presentation Owner，Trap 演出走 Presentation Root)
function renderEvent() {
  const ev = roomState.currentEvent;
  if (!ev) return;

  const isTrap = ev.type === 'trap';
  const isTreasure = ev.type === 'treasure';

  elements.eventCardBox.classList.toggle('hidden', isTrap || isTreasure);
  elements.trapDiscoverySection.classList.toggle('hidden', !isTrap);
  if (elements.chestDiscoverySection) {
    elements.chestDiscoverySection.classList.toggle('hidden', !isTreasure);
  }

  if (isTrap) {
    if (trapStartedId !== ev.presentationId) {
      trapStartedId = ev.presentationId;
      void playTrapPresentation(ev);
    }
    return;
  }

  if (isTreasure) {
    if (chestStartedId !== ev.presentationId) {
      chestStartedId = ev.presentationId;
      void playChestPresentation(ev);
    }
    return;
  }

  const evKey = `EV_${roomState.floor}_${ev.type}_${ev.title}`;
  if (!presentationManager.hasPlayed(evKey)) {
    presentationManager.markPlayed(evKey);

    if (elements.eventDetails) elements.eventDetails.style.display = 'none';
    const evFooter = document.querySelector('.event-footer');
    if (evFooter) evFooter.style.display = 'none';

    if (ev.type === 'treasure') {
      elements.eventIcon.innerHTML = getIconSvg('chest', 'svg-hero-icon');
      elements.eventTitle.textContent = ev.title || `【第 ${roomState.floor} 層】遠古寶箱！`;
      playChestPresentation(ev);
    }
  }
}

// --------------------------------------------------------------------------
// Boss Intro Presentation (P2-R1 Section 23)
// --------------------------------------------------------------------------
let battlePhaseController = null;
let battlePhasePromise = Promise.resolve();
let battleControlsReadyKey = null;
let battleControlsEntryPromise = null;
function battleSceneKey(state = roomState) {
  return `${state?.code}:${state?.floor}:${state?.currentMonster?.name}`;
}
function battleRoundKey(state = roomState) { return `${battleSceneKey(state)}:${state?.battleRound}`; }
function ensureBattlePhase(round, state = roomState) {
  const monster = state?.currentMonster;
  if (!monster) return battlePhasePromise;
  const bossIntroKey = `BOSS_INTRO_${battleSceneKey(state)}`;
  const encounter = !presentationManager.hasPlayed(bossIntroKey);
  if (!encounter && lastAnnouncedBattleRound === round) return battlePhasePromise;
  battlePhaseController?.abort();
  const controller = new AbortController();
  controller.battleKey = battleSceneKey(state);
  battlePhaseController = controller;
  if (encounter) presentationManager.markPlayed(bossIntroKey);
  lastAnnouncedBattleRound = round;
  battleControlsReadyKey = null;
  elements.views.battle.classList.add('battle-phase-pending');
  document.getElementById('playerActionCard').inert = true;
  if (encounter) {gateDestinationView('battle');document.body.classList.add('battle-intro-active');}
  presentationManager.setBlocking(true);
  battlePhasePromise = (async () => {
    try {
      await playBattlePhaseOpening(monster, round, {
        encounter, controller, signal: controller.signal,
        revealHud() {
          revealDestinationView('battle');document.body.classList.remove('battle-intro-active');
          elements.views.battle.classList.add('is-battle-hud-revealing');
        }
      });
    } catch (error) {
      if (error.name !== 'AbortError') console.error('[BattlePhase]', error);
    } finally {
      if (battlePhaseController === controller) {
        battlePhaseController = null;
        elements.views.battle.classList.remove('is-battle-hud-revealing');
        if (!isProcessingPresentationQueue) presentationManager.setBlocking(false);
        if (!controller.signal.aborted) void revealBattleControls();
      }
    }
  })();
  return battlePhasePromise;
}
async function revealBattleControls() {
  const key = battleRoundKey();
  if (roomState?.state !== 'IN_BATTLE' || roomState.selectionState !== 'SELECTING' ||
      battlePhaseController || isProcessingPresentationQueue || battleControlsReadyKey === key || battleControlsEntryPromise) return;
  const card = document.getElementById('playerActionCard');
  elements.views.battle.classList.remove('battle-phase-pending');
  card.inert = true;
  card.classList.add('is-phase-entering');
  battleControlsEntryPromise = (async () => {
    await sleep(300);
    card.classList.remove('is-phase-entering');
    if (battleRoundKey() !== key || roomState.state !== 'IN_BATTLE' || roomState.selectionState !== 'SELECTING' || battlePhaseController || isProcessingPresentationQueue) return;
    battleControlsReadyKey = key;
    card.inert = false;
    renderMyActionBar(getMyPlayer());
    socket.emit('battle:selection_ready', { round: roomState.battleRound });
  })();
  try { await battleControlsEntryPromise; } finally { battleControlsEntryPromise = null; }
}

// 4. 渲染戰鬥畫面 (P2-R1 Section 23, 24: 首領進場與回合橫幅走 Presentation Root)
function renderBattle(me, isLeader) {
  const monster = roomState.currentMonster;
  if (!monster) return;

  elements.battleFloorNum.textContent = roomState.floor;
  elements.battleRoundNum.textContent = roomState.battleRound;

  // Boss Intro & Round 1 presentation (P2-R1 Section 23 & 24, P2-R1.1 Section 4 & 6)
  void ensureBattlePhase(roomState.battleRound);
  void revealBattleControls();

  // 倒數計時：Resolving、Round Start 或計時尚未啟動時顯示 --，其餘正常顯示 (P2-R1.1 Section 6)
  const isResolving = (roomState.selectionState === 'RESOLVING' || isProcessingPresentationQueue || battlePhaseController || battleControlsReadyKey !== battleRoundKey() || roomState.selectionState === 'ROUND_START');
  if (isResolving || roomState.timerRemaining === null) {
    elements.battleTimerCount.textContent = '--';
  } else {
    elements.battleTimerCount.textContent = roomState.timerRemaining;
  }

  // 怪物卡
  elements.monsterName.textContent = monster.name;
  elements.monsterDesc.textContent = monster.desc;
  elements.monsterHpText.textContent = `${monster.hp} / ${monster.maxHp}`;
  const monsterHpPercent = Math.max(0, Math.min(100, (monster.hp / monster.maxHp) * 100));
  elements.monsterHpFill.style.width = `${monsterHpPercent}%`;

  // 怪物頭像
  if (monster.avatar) {
    elements.monsterAvatar.innerHTML = `<img src="${monster.avatar}" class="monster-avatar-img portrait-image" alt="${escapeHtml(monster.name)}">`;
  if (typeof syncPortraitStatusFx === 'function') {
    syncPortraitStatusFx(monster, elements.monsterAvatarWrap || elements.monsterAvatar, { scale: 1.1 });
  }
  } else {
    elements.monsterAvatar.innerHTML = getIconSvg('sword', 'svg-hero-icon');
  }

  // 抗性標籤
  if (monster.resistance === 'phys') {
    elements.monsterResTag.className = 'res-tag res-phys';
    elements.monsterResTag.innerHTML = `${getIconSvg('shield')} 物理抗性 (-70%)`;
  } else if (monster.resistance === 'mag') {
    elements.monsterResTag.className = 'res-tag res-mag';
    elements.monsterResTag.innerHTML = `${getIconSvg('magic')} 魔法抗性 (-70%)`;
  } else {
    elements.monsterResTag.className = 'res-tag res-none';
    elements.monsterResTag.textContent = '無抗性';
  }

  // 怪物威脅度與必殺警告
  const isUltRound = (roomState.battleRound % 3 === 0);
  const ultAtk = Math.floor(monster.attack * 1.35);
  elements.monsterAtkText.textContent = `${isUltRound ? ultAtk : monster.attack} 點`;
  if (isUltRound) {
    elements.monsterUltName.textContent = `${monster.ultName} (1.35x 必殺爆發！)`;
    elements.monsterUltName.classList.add('ult-alert');
  } else {
    elements.monsterUltName.textContent = `${monster.ultName} (每3回合發動)`;
    elements.monsterUltName.classList.remove('ult-alert');
  }

  // 怪物劇毒與削弱狀態提示
  if (elements.monsterBuffsRow) {
    let buffHtml = '';
    if (monster.isWeakened) {
      buffHtml += `<span class="buff-badge" style="background: rgba(230, 126, 34, 0.25); border: 1px solid #e67e22; color: #f39c12;">${getIconSvg('status')} 削弱狀態 (傷害/血量 75%)</span>`;
    }
    if (monster.poisonTurns > 0) {
      buffHtml += `<span class="buff-badge tag-poison">${getIconSvg('poison')} 劇毒 (${monster.poisonTurns} 回合 / 每回合-${monster.poisonDmg || 5})</span>`;
    }
    elements.monsterBuffsRow.innerHTML = buffHtml;
  }

  // 護盾與隊伍增益提示
  const activeShieldBadges = [];
  if (roomState.warriorShieldTurn === 1) {
    activeShieldBadges.push('壁壘守護：第1回合阻擋90%傷害！');
  } else if (roomState.warriorShieldTurn === 2) {
    activeShieldBadges.push('壁壘守護：第2回合阻擋40%傷害！');
  }
  if (roomState.alcShieldTurns > 0) {
    activeShieldBadges.push(`命運護盾：持續 ${roomState.alcShieldTurns} 回合阻擋 70% 傷害！`);
  }
  if (roomState.alcVulnerableTurns > 0) {
    activeShieldBadges.push(`試劑反噬：本回合受傷增加 20%！`);
  } else if (roomState.alcVulnerableNextTurn) {
    activeShieldBadges.push('試劑反噬：下回合受傷增加 20%！');
  }

  if (activeShieldBadges.length > 0) {
    elements.shieldNoticeBadge.classList.remove('hidden');
    elements.shieldNoticeBadge.innerHTML = activeShieldBadges.map(b => `${getIconSvg('shield')} ${b}`).join(' | ');
  } else {
    elements.shieldNoticeBadge.classList.add('hidden');
  }

  // 渲染隊友卡片網格
  renderTeammatesGrid(me);

  // 渲染我的專屬操作列
  renderMyActionBar(me);
}

// 隊友卡片網格
function renderTeammatesGrid(me) {
  elements.battleTeammatesGrid.innerHTML = '';

  roomState.players.forEach(p => {
    const isThisMe = p.id === myId;
    const roleInfo = classesData[p.role] || { name: '勇者' };
    const isDead = p.hp <= 0;
    const hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));

    let hpClass = '';
    if (hpPct < 30) hpClass = 'low';
    else if (hpPct < 60) hpClass = 'mid';

    // One authoritative status list; the queue updates this same container.
    const tags = ['<div class="combat-status-list">' + renderCombatStatuses(p.statuses || []) + '</div>', '<div class="compact-role-state combat-resource-summary">'+escapeHtml(p.resourceSummary||'')+'</div>'];

    // 裝備列表 (清晰呈現 [裝備 X/3]: 裝備1, 裝備2)
    const pEquips = p.equips || [];
    const equipCount = pEquips.length;
    const equipNames = equipCount > 0 ? pEquips.map(e => e.name).join(', ') : '無';

    const card = document.createElement('div');
    card.className = `teammate-card ${p.isHiddenThisRound && !p.stealthBrokenThisRound ? 'is-assassin-hidden' : ''} ${isThisMe ? 'is-me' : ''} ${isDead ? 'is-dead' : ''}`;
    card.setAttribute('data-player-id', p.id);
    card.classList.toggle('arena-absent',!!p.arenaBlocked);
    card.innerHTML = `
      <div class="floating-text-container"></div>
      <div class="teammate-top">
        <span class="teammate-name-group">
          <span class="teammate-avatar-wrap portrait-root">
            ${getPlayerAvatarHtml(p, 'teammate-avatar-img portrait-image')}
          </span>
          <span>${escapeHtml(p.name)}</span>
          ${isThisMe ? '<span style="color:#2563eb; font-weight: 700;">(你)</span>' : ''}
        </span>
        <span class="action-status-dot ${p.isLocked || isDead || p.stunnedNextTurn || p.isSurrendered || p.druidForm === 'tree' ? 'ready' : 'waiting'}">
          ${isDead ? '倒下・本層無法行動' : (p.isSurrendered ? '臣服' : (p.druidForm === 'tree' ? '休眠' : (p.stunnedNextTurn ? '虛弱' : (p.isLocked ? `${getIconSvg('lock')} 已鎖定` : `${getIconSvg('timer')} 選擇中`))))}
        </span>
      </div>
      <div class="teammate-hp-bg">
        <div class="teammate-hp-fill ${hpClass}" style="width: ${hpPct}%;"></div>
        ${(p.tempHp > 0) ? `<div class="hp-bar-overheal" style="width: ${Math.min(100, Math.round(((p.hp + p.tempHp) / (p.maxHp + p.tempHp)) * 100))}%;"></div>` : ''}
      </div>
      <div class="teammate-stats-sub">
        <span>HP ${p.tempHp > 0 ? `${p.hp + p.tempHp}/${p.maxHp}` : `${p.hp}/${p.maxHp}`}${p.tempHp > 0 ? `<span class="teammate-overheal-badge">+${p.tempHp} 額外</span>` : ''}</span>
        <span>+${p.bonusAtk} 攻</span>
      </div>
      <div class="teammate-tags">${tags.join('')}</div>
      <div class="equip-list" title="${escapeHtml(equipNames)}">[裝備 ${equipCount}/3]: ${escapeHtml(equipNames)}</div>
    `;
    elements.battleTeammatesGrid.appendChild(card);

    const avatarWrap = card.querySelector('.teammate-avatar-wrap');
    if (avatarWrap && typeof syncPortraitStatusFx === 'function') {
      syncPortraitStatusFx(p, avatarWrap, { scale: 0.28 });
    }

    // 德魯伊召喚物暫時玩家框（置於德魯伊右方，高度固定不變高，支援點擊括號或卡片展開詳細資訊）
    if (p.minions && p.minions.length > 0) {
      const minionCard = document.createElement('div');
      minionCard.className = 'teammate-card teammate-card-minion';
      minionCard.setAttribute('data-player-id', p.id + '_minions');
      minionCard.setAttribute('data-minion-owner-id', p.id);
      minionCard.setAttribute('title', '點擊展開僕從詳細資訊');

      const totalHp = p.minions.reduce((sum, m) => sum + (m.hp || 0), 0);
      const totalMaxHp = p.minions.reduce((sum, m) => sum + (m.maxHp || 0), 0);
      const totalAtk = p.minions.reduce((sum, m) => sum + (m.atk || 0), 0);
      const totalHpPct = totalMaxHp > 0 ? Math.max(0, Math.min(100, Math.round((totalHp / totalMaxHp) * 100))) : 0;

      const minionPortraitsHtml = p.minions.map((m, idx) => {
        const imgSrc = m.avatar || (m.type === 'wolf' ? `/photo/幼狼${m.minionIndex || (idx + 1)}.webp` : `/photo/小樹精${m.minionIndex || (idx + 1)}.webp`);
        return `<img src="${imgSrc}" class="minion-bar-thumb" alt="${escapeHtml(m.name)}" title="${escapeHtml(m.name)} #${idx + 1} (HP ${m.hp}/${m.maxHp})">`;
      }).join('');

      minionCard.innerHTML = `
        <div class="floating-text-container"></div>
        <div class="teammate-top">
          <span class="teammate-name-group">
            <span class="minion-icon-wrap" style="display:inline-flex; align-items:center; gap: 3px;">
              ${minionPortraitsHtml}
            </span>
            <span>${escapeHtml(p.name)}的僕從</span>
            <button type="button" class="minion-count-badge" data-owner-id="${p.id}" title="點擊查看僕從詳細資訊">(${p.minions.length}/3)</button>
          </span>
        </div>
        <div class="teammate-hp-bg">
          <div class="teammate-hp-fill" style="width: ${totalHpPct}%;"></div>
        </div>
        <div class="teammate-stats-sub">
          <span>HP ${totalHp}/${totalMaxHp}</span>
          <span>${getIconSvg('sword')} ${totalAtk} 攻</span>
        </div>
      `;

      minionCard.addEventListener('click', () => {
        showMinionDetailModal(p);
      });

      elements.battleTeammatesGrid.appendChild(minionCard);

      // 若目前詳細小視窗正好開啟且為該德魯伊，同步更新即時數值
      if (activeViewingMinionOwnerId === p.id && elements.minionDetailModal && !elements.minionDetailModal.classList.contains('hidden')) {
        showMinionDetailModal(p);
      }
    }
  });

  // 如果當前開啟的僕從視窗所屬玩家已無僕從，自動關閉小視窗
  if (activeViewingMinionOwnerId) {
    const owner = (roomState.players || []).find(x => x.id === activeViewingMinionOwnerId);
    if (!owner || !owner.minions || owner.minions.length === 0) {
      hideMinionDetailModal();
    }
  }
}

// 玩家專屬技能列
function renderMyActionBar(me) {
  if (!me || !me.role || !classesData[me.role]) return;

  const roleConfig = classesData[me.role];
  elements.myRoleEmoji.innerHTML = getPlayerAvatarHtml(me, 'my-role-avatar-img');
  elements.myRoleName.textContent = roleConfig.name;

  // 狀態簡報（包含狼人/樹精/僕從狀態）
  let stanceHtml = '';
  if (me.druidForm === 'werewolf') {
    stanceHtml += ` <span class="badge-form-wolf">${getIconSvg('summon')} 狼人形態 (傷害35點，剩餘${me.druidFormTurns}R)</span>`;
  } else if (me.druidForm === 'treant') {
    stanceHtml += ` <span class="badge-form-treant">${getIconSvg('shield')} 樹精形態 (護盾85%/減傷30%/替全隊吸收50%，剩餘${me.druidFormTurns}R)</span>`;
  } else if (me.druidForm === 'tree') {
    stanceHtml += ` <span class="badge-form-treant">${getIconSvg('cooldown')} 古樹休眠 (無法行動，剩餘${me.druidFormTurns}R)</span>`;
  }
  if (me.minion) {
    stanceHtml += ` <span class="badge-minion">${getIconSvg('summon')} 僕從: ${escapeHtml(me.minion.name)} (HP ${me.minion.hp}/${me.minion.maxHp} | 攻 ${me.minion.atk})</span>`;
  }

  elements.myHpSummary.innerHTML = `HP: ${me.hp}/${me.maxHp}${stanceHtml}`;
  elements.myAtkSummary.textContent = `+${me.bonusAtk} 攻`;
  let compact=document.getElementById('compactRoleState');
  if(!compact){compact=document.createElement('div');compact.id='compactRoleState';compact.className='compact-role-state';elements.mySkillsRow.parentNode.insertBefore(compact,elements.mySkillsRow);}
  compact.replaceChildren();
  if(me.resourceSummary||roleConfig.stateHint){const text=document.createElement('span');text.textContent=[me.resourceSummary,roleConfig.stateHint].filter(Boolean).join(' · ');compact.appendChild(text);}
  const toggle=document.createElement('label');toggle.className='skill-copy-toggle';
  const input=document.createElement('input');input.type='checkbox';input.checked=skillCopyDetailed;input.onchange=()=>{setSkillCopyDetailed(input.checked);renderMyActionBar(me);};toggle.append(input,document.createTextNode('詳細'));compact.appendChild(toggle);
  const detail=document.createElement('button');detail.className='btn btn-secondary btn-tiny';detail.textContent='職業詳情';detail.onclick=()=>openRoleDetailModal(me.role);compact.appendChild(detail);
  if(me.arenaBlocked){elements.mySkillsRow.innerHTML='<div class="action-status-badge">死亡角鬥場進行中，本輪無法行動。</div>';elements.btnConfirmLock.disabled=true;return;}

  // 玩家當前裝備列表 [裝備 X/3]
  const myEquips = me.equips || [];
  const myEquipCount = myEquips.length;
  if (elements.myEquipsSummary) {
    if (myEquipCount === 0) {
      elements.myEquipsSummary.innerHTML = `[裝備 0/3]: 無`;
    } else {
      const itemsHtml = myEquips.map((e, idx) => 
        `<span class="equip-pill">${escapeHtml(e.name)}<button type="button" class="unequip-btn" data-equip-index="${idx}" title="卸下裝備">卸下</button></span>`
      ).join(', ');
      elements.myEquipsSummary.innerHTML = `[裝備 ${myEquipCount}/3]: ${itemsHtml}`;

      elements.myEquipsSummary.querySelectorAll('.unequip-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-equip-index'), 10);
          socket.emit('equip:unequip', { index: idx });
        });
      });
    }
  }

  const isDead = me.hp <= 0;
  const isStunned = me.stunnedNextTurn;
  const isSurrendered = me.isSurrendered;
  const isTree = me.druidForm === 'tree';
  const isNarrating = Boolean(roomState.isNarrating || isPlayingBattleNarrative || battlePhaseController || battleControlsReadyKey !== battleRoundKey());

  // 狀態提醒
  if (isDead) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '你已倒地陣亡，本回合無法行動...';
    elements.mySkillsRow.innerHTML = '<div style="color:#dc2626; font-weight: 600; padding: 10px;">你已倒下，本回合無法行動。</div>';
    return;
  }

  if (isSurrendered) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '你陷入【暗影魔狼族長】的血脈壓制臣服狀態，無法行動！';
    elements.mySkillsRow.innerHTML = '<div style="color:#b45309; font-weight: 700; padding: 12px; font-size: 1rem;">源自靈魂深處的始祖狼王威壓讓你跪地臣服，全身無法動彈，直到暗影魔狼族長倒下！</div>';
    return;
  }

  if (isTree) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '你受到致命傷化為古樹休眠中，本回合無法行動...';
    elements.mySkillsRow.innerHTML = '<div style="color:#16a34a; font-weight: 700; padding: 12px; font-size: 1rem;">沉睡古樹休眠中，正在凝聚自然生機，本回合無法行動！</div>';
    return;
  }

  if (isStunned) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '你處於脫力虛弱狀態，正在喘息休息...';
    elements.mySkillsRow.innerHTML = '<div style="color:#b45309; font-weight: 600; padding: 10px;">脫力後遺症中，本回合無法行動。</div>';
    return;
  }

  const isResolving = roomState?.selectionState === 'RESOLVING';
  const isLocked = Boolean(me.isLocked);

  if (isLocked && me.action) {
    currentPendingAction = me.action;
    currentPendingTarget = me.targetPlayerId;
  }

  if (isResolving || isNarrating) {
    elements.myActionStatus.className = 'action-status-badge narrating';
    elements.myActionStatus.textContent = '全員鎖定！戰況交鋒結算中... (請觀看演出)';
  } else if (isLocked) {
    elements.myActionStatus.className = 'action-status-badge submitted';
    elements.myActionStatus.textContent = '指令已鎖定！等待全體隊友確認 (全員鎖定前可取消)';
  } else if (currentPendingAction) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '已選取技能，請確認目標並按下「確定鎖定」';
  } else {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '請點擊指定本回合施放行動：';
  }

  elements.mySkillsRow.innerHTML = '';

  // 渲染自身所有技能
  const activeSkills = (me.availableSkills && me.availableSkills.length > 0) ? me.availableSkills : roleConfig.skills;

  activeSkills.forEach(skill => {
    let cd = me.cooldowns[skill.id] || 0;
    let isCoolingDown = skill.phaseBlocked || cd > 0 || (skill.id==='sa_tsubame' && me.soul<4);
    let cdBadgeText = skill.phaseBlocked?'求解：前輪技能不可重複':`CD: ${cd}`;

    if (skill.id === 'dru_transform' && me.druidFormTurns > 0) {
      isCoolingDown = true;
      cdBadgeText = `變身中 (${me.druidFormTurns}R)`;
    }

    if (skill.id === 'dru_summon_treant' || skill.id === 'dru_summon_wolf') {
      const minionCount = (me.minions || []).length;
      if (minionCount >= 3) {
        isCoolingDown = true;
        cdBadgeText = '僕從已滿(3/3)';
      }
    }

    if (skill.id === 'a_reload' || skill.id === 'a_frenzy_reload') {
      const ammoCount = (me.ammo || []).length;
      if (ammoCount >= 3) {
        isCoolingDown = true;
        cdBadgeText = '彈匣已滿(3/3)';
      }
    }

    let displayLabel = skill.label;
    if (skill.id === 'basic' && me.ammo && me.ammo.length > 0) {
      const ammoIcons = me.ammo.map(a => a === 'pierce' ? '🔴' : a === 'elemental' ? '🔵' : '💥').join('');
      displayLabel = `普攻: 重弩齊射 [${ammoIcons}]`;
    }

    const isSelected = (currentPendingAction === skill.id);
    const tags = skill.tags || [skill.dmgType ? skill.dmgType.replace(/【|】/g, '') : '物理', '單體'];

    const btn = document.createElement('div');
    btn.className = `skill-btn ${isSelected ? 'selected' : ''}`;
    if (isCoolingDown || isNarrating || isResolving || isLocked) {
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
    }

    btn.innerHTML = `
      <div class="skill-btn-title">
        <span>${escapeHtml(displayLabel)}</span>
        ${isCoolingDown ? `<span class="skill-cd-badge">${cdBadgeText}</span>` : ''}
        <button type="button" class="skill-detail-trigger" title="點擊查看詳細說明">${getIconSvg('info', 'ui-icon--sm')} 詳情</button>
      </div>
      <div class="skill-tags-row">
        ${tags.map(t => `<span class="skill-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}
      </div>
      <div class="skill-popover hidden">
        <div class="skill-popover-title">
          <span>${escapeHtml(skill.label)}</span>
          <span style="font-size:10.5px;color:#94a3b8;">${escapeHtml(skill.dmgType || '')}</span>
        </div>
        <div class="skill-popover-desc">${escapeHtml(getSkillDescription(me.role,skill))}</div>
      </div>
    `;

    // 詳情 Popover 切換 (小型 non-blocking 浮層)
    const detailBtn = btn.querySelector('.skill-detail-trigger');
    const popover = btn.querySelector('.skill-popover');
    detailBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const isClosed = popover.classList.contains('hidden');
      document.querySelectorAll('.skill-popover').forEach(p => p.classList.add('hidden'));
      if (isClosed) popover.classList.remove('hidden');
    });

    btn.addEventListener('click', () => {
      if (isCoolingDown || isNarrating || isResolving || isLocked) return;
      handleSkillClick(skill.id, me);
    });

    elements.mySkillsRow.appendChild(btn);
  });

  // 吟遊詩人專屬：當有隊友倒地時，動態顯示「甦生之歌」
  if (me.role === 'bard') {
    const deadPlayers = roomState.players.filter(p => p.hp <= 0 && !p.noReviveThisFloor);
    if (deadPlayers.length > 0) {
      const isSelected = (currentPendingAction === 'b_revive');
      const reviveBtn = document.createElement('div');
      reviveBtn.className = `skill-btn skill-revive-btn ${isSelected ? 'selected' : ''}`;
      if (isNarrating || isResolving || isLocked) {
        reviveBtn.style.opacity = '0.6';
        reviveBtn.style.cursor = 'not-allowed';
      }
      reviveBtn.innerHTML = `
        <div class="skill-btn-title">
          <span>甦生之歌 (復活)</span>
          <span style="color:#b45309; font-weight:700; font-size:0.75rem;">奇蹟</span>
          <button type="button" class="skill-detail-trigger" title="點擊查看詳細說明">${getIconSvg('info', 'ui-icon--sm')} 詳情</button>
        </div>
        <div class="skill-tags-row">
          <span class="skill-tag" data-tag="復活">復活</span>
          <span class="skill-tag" data-tag="治療">治療</span>
          <span class="skill-tag" data-tag="高風險">代價脫力</span>
        </div>
        <div class="skill-popover hidden">
          <div class="skill-popover-title">
            <span>甦生之歌</span>
            <span style="font-size:10.5px;color:#94a3b8;">【奇蹟/治療】</span>
          </div>
          <div class="skill-popover-desc">喚醒一名倒地隊友(恢復35%生命)，下回合雙方脫力無法行動！</div>
        </div>
      `;

      const detailBtn = reviveBtn.querySelector('.skill-detail-trigger');
      const popover = reviveBtn.querySelector('.skill-popover');
      detailBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const isClosed = popover.classList.contains('hidden');
        document.querySelectorAll('.skill-popover').forEach(p => p.classList.add('hidden'));
        if (isClosed) popover.classList.remove('hidden');
      });

      reviveBtn.addEventListener('click', () => {
        if (isNarrating || isResolving || isLocked) return;
        openTargetModal('revive', deadPlayers);
      });

      elements.mySkillsRow.appendChild(reviveBtn);
    }
  }

  // 跳過回合按鈕
  const isSkipSelected = (currentPendingAction === 'skip');
  const skipBtn = document.createElement('div');
  skipBtn.className = `skill-btn ${isSkipSelected ? 'selected' : ''}`;
  if (isNarrating || isResolving || isLocked) {
    skipBtn.style.opacity = '0.6';
    skipBtn.style.cursor = 'not-allowed';
  }
  const hasCrossbow = (me.equips || []).some(e => e.id === 'a_crossbow' || e.name === '改良型重弩');
  const skipDesc = (me.role === 'archer' && hasCrossbow)
    ? '本回合放棄行動，保留技能冷卻，並卸除清空已裝備的弩箭。'
    : '本回合放棄行動，保留技能冷卻。';
  const skipTag = (me.role === 'archer' && hasCrossbow) ? '清空弩箭' : '蓄力';

  skipBtn.innerHTML = `
    <div class="skill-btn-title">
      <span>跳過回合</span>
      <button type="button" class="skill-detail-trigger" title="點擊查看說明">${getIconSvg('info', 'ui-icon--sm')} 詳情</button>
    </div>
    <div class="skill-tags-row">
      <span class="skill-tag">防守</span>
      <span class="skill-tag">${skipTag}</span>
    </div>
    <div class="skill-popover hidden">
      <div class="skill-popover-title"><span>跳過回合</span></div>
      <div class="skill-popover-desc">${skipDesc}</div>
    </div>
  `;

  const skipDetail = skipBtn.querySelector('.skill-detail-trigger');
  const skipPopover = skipBtn.querySelector('.skill-popover');
  skipDetail.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const isClosed = skipPopover.classList.contains('hidden');
    document.querySelectorAll('.skill-popover').forEach(p => p.classList.add('hidden'));
    if (isClosed) skipPopover.classList.remove('hidden');
  });

  skipBtn.addEventListener('click', () => {
    if (isNarrating || isResolving || isLocked) return;
    currentPendingAction = 'skip';
    currentPendingTarget = null;
    if (me.role === 'archer' && hasCrossbow && me.ammo && me.ammo.length > 0) {
      me.ammo = [];
      socket.emit('battle:clear_ammo');
    }
    playSound('click');
    renderMyActionBar(me);
  });

  elements.mySkillsRow.appendChild(skipBtn);

  // 更新下方確認/鎖定操作列
  updateSkillSelectionBar(me, isDead, isStunned, isSurrendered, isTree, isNarrating, isResolving, isLocked, activeSkills);
}

// 相容別名：確保任何地方呼叫 renderBattleSkills 皆可正常執行
const renderBattleSkills = renderMyActionBar;

// 技能選擇與確認狀態條更新
function updateSkillSelectionBar(me, isDead, isStunned, isSurrendered, isTree, isNarrating, isResolving, isLocked, activeSkills) {
  if (!elements.skillSelectionBar) return;

  const bar = elements.skillSelectionBar;
  const prompt = elements.selectionPromptText;
  const targetTxt = elements.selectionTargetText;
  const btnLock = elements.btnConfirmLock;
  const btnUnlock = elements.btnUnlockAction;

  if (isResolving || isNarrating) {
    bar.className = 'skill-selection-bar state-resolving';
    prompt.textContent = '全員鎖定！正在進行回合結算...';
    targetTxt.classList.add('hidden');
    btnLock.disabled = true;
    btnUnlock.classList.add('hidden');
    return;
  }

  if (isDead || isStunned || isSurrendered || isTree) {
    bar.className = 'skill-selection-bar';
    prompt.textContent = '當前狀態本回合無法自選技能';
    targetTxt.classList.add('hidden');
    btnLock.disabled = true;
    btnUnlock.classList.add('hidden');
    return;
  }

  let skillName = '';
  if (currentPendingAction === 'skip') {
    skillName = '跳過回合';
  } else if (currentPendingAction === 'b_revive') {
    skillName = '甦生之歌';
  } else if (currentPendingAction) {
    const found = (activeSkills || []).find(s => s.id === currentPendingAction);
    skillName = found ? found.label : currentPendingAction;
  }

  let targetName = '';
  if (currentPendingTarget) {
    const tp = (roomState?.players || []).find(p => p.id === currentPendingTarget);
    if (tp) targetName = tp.name;
  }

  if (isLocked) {
    bar.className = 'skill-selection-bar state-locked';
    prompt.textContent = `已鎖定行動：【${skillName}】${targetName ? `(目標: ${targetName})` : ''}，等待其他隊友確認...`;
    targetTxt.classList.add('hidden');
    btnLock.disabled = true;
    btnUnlock.classList.remove('hidden');
  } else if (currentPendingAction) {
    bar.className = 'skill-selection-bar';
    prompt.textContent = `目前選擇：【${skillName}】${targetName ? `(目標: ${targetName})` : ''}`;
    targetTxt.classList.add('hidden');
    btnLock.disabled = false;
    btnUnlock.classList.add('hidden');
  } else {
    bar.className = 'skill-selection-bar';
    prompt.textContent = '請點選上方技能進行選擇';
    targetTxt.classList.add('hidden');
    btnLock.disabled = true;
    btnUnlock.classList.add('hidden');
  }
}

// 點擊技能只代表「選擇」，不直接發動
function handleSkillClick(actionId, me) {
  if (roomState?.isNarrating || isPlayingBattleNarrative || me.isLocked) return;
  if (roomState?.selectionState === 'RESOLVING') return;

  if(actionId==='dw_butterfly') {openTargetModal('dream',[...(roomState.players||[]).filter(p=>p.hp>0),{id:'monster',name:roomState.currentMonster?.name||'魔物',hp:roomState.currentMonster?.hp||1,maxHp:roomState.currentMonster?.maxHp||1,role:null,customAvatar:roomState.currentMonster?.avatar}]);return;}
  // 吟遊詩人治癒頌歌：若有多位活著隊友，彈出目標選擇
  if (me.role === 'bard' && actionId === 'b_heal') {
    const alivePlayers = (roomState?.players || []).filter(p => p.hp > 0);
    if (alivePlayers.length > 1) {
      openTargetModal('heal', alivePlayers);
      return;
    }
  }

  currentPendingAction = actionId;
  currentPendingTarget = null;
  playSound(actionId === 'basic' ? 'hit' : 'magic');
  renderMyActionBar(me);
}

// 目標選擇 Modal (治癒額外目標 / 甦生之歌目標)
function openTargetModal(type, targetList) {
  elements.targetModal.classList.remove('hidden');
  elements.targetModalList.innerHTML = '';

  if(type==='dream'){elements.targetModalTitle.textContent='清醒夢・薛丁格之蝶・指定目標';elements.targetModalDesc.textContent='請選擇存活隊友或魔物：';}
  if (type === 'heal') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('heal')} <span>【治癒頌歌】專注目標</span>`;
    elements.targetModalDesc.textContent = '全隊將獲得群療，請指定一名隊友額外獲得專注回復：';
  } else if (type === 'revive') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('sparkle')} <span>【甦生之歌】奇蹟喚醒</span>`;
    elements.targetModalDesc.textContent = '請選擇要喚醒歸隊的倒下隊友：(下回合雙方皆會脫力)';
  }

  targetList.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'target-btn';
    btn.innerHTML = `
      <span class="target-btn-left">
        ${getPlayerAvatarHtml(p, 'target-role-avatar')}
        <span>${escapeHtml(p.name)}</span>
      </span>
      <span style="font-size:0.85rem; color:var(--text-secondary); font-weight: 600;">${p.hp > 0 ? `HP ${p.hp}/${p.maxHp}` : `${getIconSvg('death')} 倒地`}</span>
    `;

    btn.addEventListener('click', () => {
      elements.targetModal.classList.add('hidden');
      playSound(type === 'heal' ? 'heal' : 'magic');
      currentPendingAction = type === 'dream' ? 'dw_butterfly' : type === 'heal' ? 'b_heal' : 'b_revive';
      currentPendingTarget = p.id;
      const me = getMyPlayer();
      if (me) renderMyActionBar(me);
    });

    elements.targetModalList.appendChild(btn);
  });
}

// 技能確認鎖定 / 解鎖取消 按鈕事件監聽
if (elements.btnConfirmLock) {
  elements.btnConfirmLock.addEventListener('click', () => {
    const me = getMyPlayer();
    if (!me || me.isLocked || !currentPendingAction) return;
    playSound('select');
    socket.emit('battle:lock', {
      actionId: currentPendingAction,
      targetPlayerId: currentPendingTarget
    });
  });
}

if (elements.btnUnlockAction) {
  elements.btnUnlockAction.addEventListener('click', () => {
    const me = getMyPlayer();
    if (!me || !me.isLocked) return;
    playSound('cancel');
    socket.emit('battle:unlock');
  });
}

elements.btnCancelTarget.addEventListener('click', () => {
  elements.targetModal.classList.add('hidden');
});

// ==========================================
// 德魯伊僕從詳細資訊 Modal 邏輯
// ==========================================
let activeViewingMinionOwnerId = null;

function showMinionDetailModal(player) {
  if (!player || !player.minions || player.minions.length === 0) return;
  if (!elements.minionDetailModal) return;

  activeViewingMinionOwnerId = player.id;
  const totalHp = player.minions.reduce((sum, m) => sum + (m.hp || 0), 0);
  const totalMaxHp = player.minions.reduce((sum, m) => sum + (m.maxHp || 0), 0);
  const totalAtk = player.minions.reduce((sum, m) => sum + (m.atk || 0), 0);

  if (elements.minionDetailTitle) {
    elements.minionDetailTitle.innerHTML = `${getIconSvg('summon')} <span>${escapeHtml(player.name)} 的僕從隊伍 (${player.minions.length}/3)</span>`;
  }
  if (elements.minionDetailSubtitle) {
    elements.minionDetailSubtitle.textContent = `合計生命 ${totalHp}/${totalMaxHp} · 合計攻擊力 ${totalAtk} 點`;
  }

  if (elements.minionDetailList) {
    elements.minionDetailList.innerHTML = player.minions.map((m, idx) => {
      const mHpPct = Math.max(0, Math.min(100, Math.round((m.hp / m.maxHp) * 100)));
      const isWolf = m.type === 'wolf';
      const typeBadge = isWolf ? '<span class="minion-detail-badge wolf">幼狼</span>' : '<span class="minion-detail-badge">小樹精</span>';
      const minionAvatar = m.avatar || (isWolf ? `/photo/幼狼${m.minionIndex || (idx + 1)}.webp` : `/photo/小樹精${m.minionIndex || (idx + 1)}.webp`);
      const desc = isWolf 
        ? '<strong>每回合自動攻擊 10 點傷害</strong>，並優先替全體隊友吸收怪物的彈射傷害。' 
        : '<strong>每回合自動攻擊 1 點傷害</strong>，並優先替全體隊友吸收怪物的彈射傷害。';
      const displayName = m.name?.match(/\d+$/) ? m.name : `${m.name} #${idx + 1}`;

      return `
        <div class="minion-detail-item">
          <div class="minion-detail-item-header">
            <div style="display:flex; align-items:center; gap: 8px;">
              <img src="${minionAvatar}" class="minion-modal-thumb" alt="${escapeHtml(m.name)}">
              <span class="name"><strong>${escapeHtml(displayName)}</strong></span>
            </div>
            ${typeBadge}
          </div>
          <div class="teammate-hp-bg" style="margin: 6px 0;">
            <div class="teammate-hp-fill" style="width: ${mHpPct}%;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #166534;">
            <span>生命：${m.hp} / ${m.maxHp} (${mHpPct}%)</span>
            <span>攻擊力：${m.atk} 攻</span>
          </div>
          <div class="minion-detail-desc">
            ${desc}
          </div>
        </div>
      `;
    }).join('');
  }

  elements.minionDetailModal.classList.remove('hidden');
}

function hideMinionDetailModal() {
  activeViewingMinionOwnerId = null;
  if (elements.minionDetailModal) {
    elements.minionDetailModal.classList.add('hidden');
  }
}

if (elements.btnCloseMinionModal) {
  elements.btnCloseMinionModal.addEventListener('click', hideMinionDetailModal);
}
if (elements.btnConfirmMinionModal) {
  elements.btnConfirmMinionModal.addEventListener('click', hideMinionDetailModal);
}
if (elements.minionDetailModal) {
  elements.minionDetailModal.addEventListener('click', (e) => {
    if (e.target === elements.minionDetailModal) {
      hideMinionDetailModal();
    }
  });
}

// ==========================================
// 角色詳細技能與數值介紹 Modal 邏輯
// ==========================================
function openRoleDetailModal(roleKey) {
  const details = (roleDetailsData && roleDetailsData[roleKey]) || (DEFAULT_ROLE_DETAILS && DEFAULT_ROLE_DETAILS[roleKey]);
  if (!details || !elements.roleDetailModal) return;

  if (elements.roleDetailTitle) {
    elements.roleDetailTitle.textContent = `${details.roleName} (${details.enName})`;
  }
  if (elements.roleDetailSubtitle) {
    elements.roleDetailSubtitle.textContent = `定位：${details.type} ｜ 基礎生命值：${details.hp} HP`;
  }
  if (elements.roleDetailAvatarWrap) {
    if (details.avatar) {
      elements.roleDetailAvatarWrap.innerHTML = `<img src="${details.avatar}" alt="${escapeHtml(details.roleName)}" class="role-detail-avatar-img">`;
    } else {
      elements.roleDetailAvatarWrap.innerHTML = `<div class="role-detail-avatar-icon">${getIconSvg(getRoleIconName(roleKey), 'svg-large')}</div>`;
    }
  }

  if (elements.roleDetailBody) {
    let html = '';
    html+='<label class="skill-copy-toggle"><input type="checkbox" id="skillCopyDetailToggle" '+(skillCopyDetailed?'checked':'')+'> 詳細技能敘述</label>';
    // 被動特性
    if (details.passive) {
      html += `
        <div class="role-detail-passive-card">
          <div style="font-weight:700; color:#fbbf24; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span>${getIconSvg('sparkle')}</span> <span>職業被動與特性</span>
          </div>
          <div>${escapeHtml(details.passive)}</div>
        </div>
      `;
    }

    // 技能清單
    if (details.skills && details.skills.length > 0) {
      html += `
        <div class="role-detail-section">
          <div class="role-detail-section-title">
            <span>${getIconSvg('sword')}</span> <span>職業技能詳細機制與數值</span>
          </div>
          ${details.skills.map(s => {
            let tagClass = 'tag-phys';
            if (s.dmgType.includes('魔法')) tagClass = 'tag-mag';
            else if (s.dmgType.includes('治療') || s.dmgType.includes('回復')) tagClass = 'tag-heal';
            else if (s.dmgType.includes('輔助') || s.dmgType.includes('防護') || s.dmgType.includes('增益')) tagClass = 'tag-buff';
            return `
              <div class="role-detail-skill-item">
                <div class="role-detail-skill-head">
                  <span class="role-detail-skill-title"><strong>${escapeHtml(s.type)}【${escapeHtml(s.name)}】</strong></span>
                  <div class="role-detail-skill-tags">
                    <span class="role-detail-tag ${tagClass}">${escapeHtml(s.dmgType)}</span>
                    <span class="role-detail-tag tag-cd">${escapeHtml(s.cd)}</span>
                  </div>
                </div>
                <div class="role-detail-skill-desc">${escapeHtml(getSkillDescription(roleKey,classesData[roleKey]?.skills?.[details.skills.indexOf(s)]||s))}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (roleKey === 'druid') {
      html += `
        <div class="role-detail-section">
          <div class="role-detail-section-title">
            <span>${getIconSvg('paw')}</span> <span>德魯伊變身形態與自然僕從</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 8px;">
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; padding: 10px 8px; text-align: center;">
              <img src="/photo/狼人.webp" style="width: 54px; height: 54px; object-fit: contain; border-radius: 4px; margin: 0 auto 6px; display: block;" alt="狼人形態">
              <div style="font-weight: 700; font-size: 13px; color: #f87171;">狼人形態</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">降低20%生命上限，普攻35傷</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 6px; padding: 10px 8px; text-align: center;">
              <img src="/photo/遠古樹精.webp" style="width: 54px; height: 54px; object-fit: contain; border-radius: 4px; margin: 0 auto 6px; display: block;" alt="遠古樹精形態">
              <div style="font-weight: 700; font-size: 13px; color: #86efac;">遠古樹精形態</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">護盾85%，減傷30%，分攤50%</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 6px; padding: 10px 8px; text-align: center;">
              <img src="/photo/小樹精1.webp" style="width: 54px; height: 54px; object-fit: contain; border-radius: 4px; margin: 0 auto 6px; display: block;" alt="僕從：小樹精">
              <div style="font-weight: 700; font-size: 13px; color: #4ade80;">僕從：小樹精</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">肉盾守護，替隊伍吸收彈射傷</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(249, 115, 22, 0.4); border-radius: 6px; padding: 10px 8px; text-align: center;">
              <img src="/photo/幼狼1.webp" style="width: 54px; height: 54px; object-fit: contain; border-radius: 4px; margin: 0 auto 6px; display: block;" alt="僕從：幼狼">
              <div style="font-weight: 700; font-size: 13px; color: #fb923c;">僕從：幼狼</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">敏捷撕咬，高攻擊僕從</div>
            </div>
          </div>
        </div>
      `;
    }

    if(roomState?.state!=='LOBBY'&&details.equipment?.length) html+='<details><summary>專屬裝備</summary>'+details.equipment.map(e=>'<p><strong>'+escapeHtml(e.name)+'</strong>：'+escapeHtml(e.desc)+'</p>').join('')+'</details>';
    elements.roleDetailBody.innerHTML = html;
    document.getElementById('skillCopyDetailToggle')?.addEventListener('change',e=>{setSkillCopyDetailed(e.target.checked);openRoleDetailModal(roleKey);if(roomState?.state==='IN_BATTLE')renderMyActionBar(getMyPlayer());});
    elements.roleDetailBody.querySelectorAll('.role-detail-passive-card,.role-detail-skill-item').forEach(card=>{
      const wrapper=document.createElement('details'),summary=document.createElement('summary');summary.textContent=card.querySelector('.role-detail-skill-title')?.textContent||'被動與完整規則';card.before(wrapper);wrapper.append(summary,card);
    });
  }

  elements.roleDetailModal.classList.remove('hidden');
}

function hideRoleDetailModal() {
  if (elements.roleDetailModal) {
    elements.roleDetailModal.classList.add('hidden');
  }
}

if (elements.btnCloseRoleDetailModal) {
  elements.btnCloseRoleDetailModal.addEventListener('click', hideRoleDetailModal);
}
if (elements.btnConfirmRoleDetailModal) {
  elements.btnConfirmRoleDetailModal.addEventListener('click', hideRoleDetailModal);
}
if (elements.roleDetailModal) {
  elements.roleDetailModal.addEventListener('click', (e) => {
    if (e.target === elements.roleDetailModal) {
      hideRoleDetailModal();
    }
  });
}

// 5. 渲染深淵休息站
function renderCheckpoint(me, isLeader) {
  elements.cpFloorNum.textContent = roomState.floor;
  if (isLeader) {
    elements.cpLeaderControls.classList.remove('hidden');
    elements.cpMemberNotice.classList.add('hidden');
  } else {
    elements.cpLeaderControls.classList.add('hidden');
    elements.cpMemberNotice.classList.remove('hidden');
  }
}

// 6. 渲染結算畫面
function renderGameOver(isLeader) {
  elements.endTitle.textContent = '挑戰失敗';
  if (roomState.gameOverReason === 'abandon') {
    elements.endIcon.innerHTML = getIconSvg('flag', 'svg-hero-icon');
    elements.endSubtitle.textContent = `小隊於深淵第 ${roomState.floor} 層中途結束，未能抵達第 5 層休息站，挑戰失敗！`;
  } else {
    elements.endIcon.innerHTML = getIconSvg('death', 'svg-hero-icon');
    elements.endSubtitle.textContent = `小隊全員在深淵第 ${roomState.floor} 層壯烈倒下，未能成功突破，挑戰失敗！`;
  }
  elements.btnRestartLobby.style.display = isLeader ? 'inline-flex' : 'none';
  playSound('gameover');
}

function renderVictory(isLeader) {
  elements.endIcon.innerHTML = getIconSvg('sparkle', 'svg-hero-icon');
  elements.endTitle.textContent = '榮耀凱旋歸來！';
  elements.endSubtitle.textContent = `小隊成功突破至深淵第 ${roomState.floor} 層並滿載而歸！勇者威名永垂不朽！`;
  elements.btnRestartLobby.style.display = isLeader ? 'inline-flex' : 'none';
  playSound('victory');
}

// 7. 日誌渲染與自動滾動
function renderLogs() {
  if (!roomState || !roomState.logs || !elements.combatLogWindow) return;
  renderRecentBattleLogs(elements.combatLogWindow,roomState.logs);
}

// 輔助格式化 Markdown 粗體
function formatMarkdown(text) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// ==========================================
// 按鈕事件綁定
// ==========================================

// 建立房間
elements.btnCreateRoom.addEventListener('click', () => {
  const name = elements.inputPlayerName.value.trim() || '勇者無名';
  myName = name;
  localStorage.setItem('dungeon_player_name', name);
  const savedAvatar = localStorage.getItem('dungeon_custom_avatar') || null;
  initAudio();
  playSound('click');

  socket.emit('room:create', { name, avatar: savedAvatar }, (res) => {
    if (res.success) {
      currentRoomCode = res.roomCode;
    } else {
      alert(res.message);
    }
  });
});

// 加入房間
elements.btnJoinRoom.addEventListener('click', () => {
  const name = elements.inputPlayerName.value.trim() || '勇者無名';
  const code = elements.inputRoomCode.value.trim().toUpperCase();
  if (!code) {
    alert('請輸入 5 碼房間代碼！');
    return;
  }
  myName = name;
  localStorage.setItem('dungeon_player_name', name);
  const savedAvatar = localStorage.getItem('dungeon_custom_avatar') || null;
  initAudio();
  playSound('click');

  socket.emit('room:join', { name, code, avatar: savedAvatar }, (res) => {
    if (!res.success) {
      alert(res.message);
    }
  });
});

// 點擊房間代碼直接複製
function copyRoomCode() {
  if (!currentRoomCode) return;
  navigator.clipboard.writeText(currentRoomCode).then(() => {
    if (elements.roomCopyToast) {
      elements.roomCopyToast.classList.remove('hidden');
      setTimeout(() => {
        elements.roomCopyToast.classList.add('hidden');
      }, 1500);
    }
    playSound('click');
  }).catch(() => {
    prompt('請手動複製房間代碼：', currentRoomCode);
  });
}

if (elements.roomCodeText) {
  elements.roomCodeText.addEventListener('click', copyRoomCode);
}

// 音效開關與圖示切換
function updateSoundIcon() {
  if (elements.soundToggleImg) {
    elements.soundToggleImg.src = soundEnabled ? '/sound/sound.webp' : '/sound/mute.webp';
  }
  if (elements.soundToggleBtn) {
    elements.soundToggleBtn.title = soundEnabled ? '切換音效 (目前已開啟)' : '切換音效 (目前已靜音)';
  }
}

if (elements.soundToggleBtn) {
  elements.soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (sfx) sfx.soundEnabled = soundEnabled;
    updateSoundIcon();
  });
}

// 隊長出發探險
elements.btnStartGame.addEventListener('click', () => {
  playSound('victory');
  socket.emit('game:start', (res) => {
    if (!res.success) alert(res.message);
  });
});

// 隊員切換準備狀態
let pendingTransferTarget = null;
function openTransferLeaderModal(targetPlayer) {
  if (!targetPlayer) return;
  pendingTransferTarget = targetPlayer;
  if (elements.transferLeaderModalDesc) {
    elements.transferLeaderModalDesc.textContent = `確定要將位子移交給【${targetPlayer.name}】嗎？`;
  }
  if (elements.transferLeaderModal) {
    elements.transferLeaderModal.classList.remove('hidden');
  }
}

function closeTransferLeaderModal() {
  pendingTransferTarget = null;
  if (elements.transferLeaderModal) {
    elements.transferLeaderModal.classList.add('hidden');
  }
}

if (elements.btnCancelTransferLeader) {
  elements.btnCancelTransferLeader.addEventListener('click', closeTransferLeaderModal);
}

if (elements.btnConfirmTransferLeader) {
  elements.btnConfirmTransferLeader.addEventListener('click', () => {
    if (!pendingTransferTarget) return;
    const targetId = pendingTransferTarget.id;
    closeTransferLeaderModal();
    playSound('click');
    socket.emit('room:transfer_leader', { targetId }, (res) => {
      if (res && !res.success) alert(res.message);
    });
  });
}

if (elements.transferLeaderModal) {
  elements.transferLeaderModal.addEventListener('click', (e) => {
    if (e.target === elements.transferLeaderModal) {
      closeTransferLeaderModal();
    }
  });
}

if (elements.btnToggleReady) {
  elements.btnToggleReady.addEventListener('click', () => {
    playSound('click');
    socket.emit('room:toggle_ready', (res) => {
      if (res && !res.success) alert(res.message);
    });
  });
}

// 離開隊伍
if (elements.btnLeaveParty) {
  elements.btnLeaveParty.addEventListener('click', () => {
    const isLeader = roomState?.leaderId === myId;
    const msg = isLeader
      ? '確定要離開小隊嗎？\n（離開後職位將由第一順位成員繼承）'
      : '確定要離開小隊嗎？';
    if (!confirm(msg)) return;
    playSound('click');
    socket.emit('leave_party', () => {
      sfx?.stopAll();
      roomState = null;
      currentRoomCode = null;
      currentActiveStage = 'NONE';
      presentationManager.reset();
      switchView('entry');
      if (elements.btnLeaveParty) elements.btnLeaveParty.classList.add('hidden');
      renderApp();
    });
  });
}

// 休息站選擇：繼續
elements.btnCpContinue.addEventListener('click', () => {
  playSound('heal');
  socket.emit('checkpoint:choice', { choice: 'continue' }, (res) => {
    if (!res.success) alert(res.message);
  });
});

// 休息站選擇：結束
elements.btnCpEnd.addEventListener('click', () => {
  playSound('victory');
  socket.emit('checkpoint:choice', { choice: 'end' }, (res) => {
    if (!res.success) alert(res.message);
  });
});

// 重啟冒險回大廳
elements.btnRestartLobby.addEventListener('click', () => {
  playSound('click');
  socket.emit('game:restart', (res) => {
    if (!res.success) alert(res.message);
  });
});

// ==========================================
// 懸浮聊天室與 30 秒訊息氣泡邏輯
// ==========================================
let isChatOpen = false;
let unreadChatCount = 0;
let chatBubbleTimer = null;
const renderedChatIds = new Set();

function toggleChat(open = null) {
  if (open === null) {
    isChatOpen = !isChatOpen;
  } else {
    isChatOpen = open;
  }

  if (elements.chatPopupCard) {
    if (isChatOpen) {
      elements.chatPopupCard.classList.remove('hidden');
      dismissChatBubble();
      unreadChatCount = 0;
      if (elements.chatUnreadBadge) {
        elements.chatUnreadBadge.classList.add('hidden');
        elements.chatUnreadBadge.textContent = '0';
      }
      setTimeout(() => {
        if (elements.chatInput) elements.chatInput.focus();
      }, 100);
      scrollChatToBottom();
    } else {
      elements.chatPopupCard.classList.add('hidden');
    }
  }
}

function showChatBubble(senderName, message) {
  if (!elements.chatToastBubble) return;
  if (elements.chatBubbleSender) {
    elements.chatBubbleSender.innerHTML = `${getIconSvg('log')} <span>${escapeHtml(senderName)}</span>`;
  }
  if (elements.chatBubbleText) {
    elements.chatBubbleText.textContent = message;
  }

  // 重啟 30 秒倒數進度條動畫
  const timerBar = elements.chatToastBubble.querySelector('.chat-bubble-timer-bar');
  if (timerBar) {
    timerBar.style.animation = 'none';
    void timerBar.offsetWidth;
    timerBar.style.animation = 'bubbleCountdown 30s linear forwards';
  }

  elements.chatToastBubble.classList.remove('hidden');

  if (chatBubbleTimer) clearTimeout(chatBubbleTimer);
  chatBubbleTimer = setTimeout(() => {
    dismissChatBubble();
  }, 30000);
}

function dismissChatBubble() {
  if (chatBubbleTimer) {
    clearTimeout(chatBubbleTimer);
    chatBubbleTimer = null;
  }
  if (elements.chatToastBubble) {
    elements.chatToastBubble.classList.add('hidden');
  }
}

function renderChatMessage(chatData, scroll = true) {
  if (!elements.chatMessageList) return;
  const isMe = chatData.senderId === myId;
  const row = document.createElement('div');
  row.className = `chat-msg-row ${isMe ? 'is-me' : 'is-other'}`;

  const roleEmoji = chatData.senderEmoji || '👤';
  const senderLabel = isMe ? '你' : `${roleEmoji} ${escapeHtml(chatData.senderName)}`;
  row.innerHTML = `
    <div class="chat-msg-meta">
      <span>${senderLabel}</span>
      <span>${chatData.time || ''}</span>
    </div>
    <div class="chat-msg-bubble">${escapeHtml(chatData.message)}</div>
  `;

  const emptyHint = elements.chatMessageList.querySelector('.chat-empty-hint');
  if (emptyHint) emptyHint.remove();

  elements.chatMessageList.appendChild(row);
  if (scroll) scrollChatToBottom();
}

function scrollChatToBottom() {
  if (elements.chatMessageList) {
    elements.chatMessageList.scrollTop = elements.chatMessageList.scrollHeight;
  }
}

function syncChatMessages(chatList) {
  if (!chatList || !Array.isArray(chatList) || !elements.chatMessageList) return;
  chatList.forEach(chatData => {
    if (!renderedChatIds.has(chatData.id)) {
      renderedChatIds.add(chatData.id);
      renderChatMessage(chatData, false);
    }
  });
}

function sendChat() {
  if (!elements.chatInput) return;
  const msg = elements.chatInput.value.trim();
  if (!msg) return;
  socket.emit('chat:send', { message: msg });
  elements.chatInput.value = '';
}

socket.on('chat:message', (chatData) => {
  if (renderedChatIds.has(chatData.id)) return;
  renderedChatIds.add(chatData.id);
  renderChatMessage(chatData, true);

  if (chatData.senderId !== myId) {
    playSound('click');
    // 如果聊天室未展開，在右下角圖示上方彈出維持 30 秒的對話氣泡
    if (!isChatOpen) {
      showChatBubble(chatData.senderName, chatData.message);
      unreadChatCount++;
      if (elements.chatUnreadBadge) {
        elements.chatUnreadBadge.textContent = unreadChatCount > 9 ? '9+' : unreadChatCount;
        elements.chatUnreadBadge.classList.remove('hidden');
      }
    }
  }
});

// 事件綁定
if (elements.floatingChatBtn) {
  elements.floatingChatBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleChat();
  });
}

if (elements.btnCloseChatPopup) {
  elements.btnCloseChatPopup.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleChat(false);
  });
}

if (elements.chatToastBubble) {
  elements.chatToastBubble.addEventListener('click', (e) => {
    if (!e.target.closest('#btnCloseChatBubble')) {
      toggleChat(true);
    }
  });
}

if (elements.btnCloseChatBubble) {
  elements.btnCloseChatBubble.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissChatBubble();
  });
}

if (elements.btnSendChat) {
  elements.btnSendChat.addEventListener('click', sendChat);
}

if (elements.chatInput) {
  elements.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendChat();
    }
  });
}

// 清空事件表日誌按鈕
if (elements.btnClearLog) {
  elements.btnClearLog.addEventListener('click', () => {
    if (elements.combatLogWindow) elements.combatLogWindow.innerHTML = '';
  });
}

// 折疊/展開事件表按鈕
if (elements.btnToggleLog) {
  elements.btnToggleLog.addEventListener('click', () => {
    if (elements.battleLogCard) {
      const isCollapsed = !elements.battleLogCard.classList.toggle('is-open');
      if (elements.logToggleText) {
        elements.logToggleText.textContent = isCollapsed ? '展開' : '折疊';
      }
      if (elements.logToggleIcon) {
        elements.logToggleIcon.innerHTML = `<use href="#icon-${isCollapsed ? 'expand' : 'collapse'}"></use>`;
      }
      playSound('click');
    }
  });
}

// 點擊聊天室外部收起聊天視窗；點擊技能詳情外部收起 Popover
document.addEventListener('click', (e) => {
  if (isChatOpen && elements.chatPopupCard && elements.floatingChatBtn) {
    if (!elements.chatPopupCard.contains(e.target) && !elements.floatingChatBtn.contains(e.target)) {
      toggleChat(false);
    }
  }

  // 若點擊處不在任何 Popover 或觸發按鈕內，隱藏所有 Popover
  if (!e.target.closest('.skill-popover') && !e.target.closest('.skill-detail-trigger')) {
    document.querySelectorAll('.skill-popover').forEach(p => p.classList.add('hidden'));
  }
});

// ==========================================
// ==========================================
// 大廳成員卡片：修改暱稱功能
// ==========================================
function submitInlineRename(newName) {
  newName = (newName || '').trim();
  if (!newName) {
    alert('暱稱不能為空！');
    return;
  }
  if (newName.length > 12) {
    alert('暱稱長度不可超過 12 個字元！');
    return;
  }

  socket.emit('player:rename', { newName }, (res) => {
    if (res.success) {
      myName = res.newName;
      localStorage.setItem('dungeon_player_name', res.newName);
      if (elements.playerNameText) elements.playerNameText.textContent = res.newName;
      isEditingMyName = false;
      editingNameValue = '';
      playSound('click');
    } else {
      alert(res.message);
    }
  });
}

// ==========================================
// 戰鬥打擊感、視覺特效與浮動戰鬥數字
// ==========================================
// ==========================================
// 戰鬥打擊感、視覺特效與浮動戰鬥數字
// ==========================================
function spawnFloatingText(container, text, type = 'damage') {
  if (!container) return;
  const numEl = document.createElement('div');
  numEl.className = `floating-num ${type}`;
  numEl.textContent = text;
  container.appendChild(numEl);
  setTimeout(() => {
    numEl.remove();
  }, 1200);
}

// 播放 Pixel FX 特效 (自動清理，零記憶體殘留)
function playPixelFx(container, fxType) {
  if (!container) return;
  const fx = document.createElement('div');
  fx.className = `pixel-fx pixel-fx-${fxType}`;
  container.appendChild(fx);
  setTimeout(() => {
    fx.remove();
  }, 450);
}

// 首領受擊演出 (帶有 x+8, y+3 之右後方向性位移 + Pixel FX)
function triggerHitOnMonster(isCrit = false, fxType = 'slash', value = 0) {
  if (elements.monsterCard) {
    elements.monsterCard.classList.remove('hit-displace-boss', 'crit-frame-flash', 'shaking');
    void elements.monsterCard.offsetWidth;
    elements.monsterCard.classList.add('hit-displace-boss');
    if (isCrit) {
      elements.monsterCard.classList.add('crit-frame-flash');
    }
    setTimeout(() => {
      if (elements.monsterCard) {
        elements.monsterCard.classList.remove('hit-displace-boss', 'crit-frame-flash', 'shaking');
      }
    }, 420);
  }

  if (elements.monsterPixelFx) {
    playPixelFx(elements.monsterPixelFx, fxType);
  }
}

function triggerSlashOnMonster(isCrit = false) {
  triggerHitOnMonster(isCrit, 'slash');
}

function triggerMagicOnMonster() {
  triggerHitOnMonster(false, 'magic-runes');
}

function triggerHealOnTeammate(playerId, value) {
  const card = document.querySelector(`.teammate-card[data-player-id="${playerId}"]`);
  if (!card) return;
  card.classList.remove('heal-flash');
  void card.offsetWidth;
  card.classList.add('heal-flash');
  setTimeout(() => card.classList.remove('heal-flash'), 700);

  playPixelFx(card, 'heal-spark');

  const container = card.querySelector('.floating-text-container');
  spawnFloatingText(container, `+${value}`, 'heal');
}

function triggerShieldOnTeam(label = '壁壘守護 90%!') {
  const cards = document.querySelectorAll('.teammate-card');
  cards.forEach(card => {
    card.classList.remove('shield-flash');
    void card.offsetWidth;
    card.classList.add('shield-flash');
    setTimeout(() => card.classList.remove('shield-flash'), 800);

    playPixelFx(card, 'shield-flare');

    const container = card.querySelector('.floating-text-container');
    spawnFloatingText(container, label, 'shield');
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 隊友受擊演出 (帶有 x-8, y+3 之左後方向性位移)
function triggerHitOnTeammate(playerId, value, dodged = false, stealthed = false, shieldMod = 1.0, tempAbsorbed = 0, hpDmg = null) {
  const card = document.querySelector(`.teammate-card[data-player-id="${playerId}"]`);
  if (!card) return;
  const container = card.querySelector('.floating-text-container');

  if (stealthed) {
    spawnFloatingText(container, '匿蹤避開', 'dodge');
    playPixelFx(card, 'shield-flare');
    return;
  }
  if (dodged) {
    spawnFloatingText(container, '閃避 MISS!', 'dodge');
    return;
  }

  card.classList.remove('hit-displace-player', 'hit-flash', 'shaking');
  void card.offsetWidth;
  card.classList.add('hit-displace-player', 'hit-flash');
  setTimeout(() => card.classList.remove('hit-displace-player', 'hit-flash'), 420);

  if (tempAbsorbed > 0) {
    spawnFloatingText(container, `超量吸收 -${tempAbsorbed}`, 'buff');
    playPixelFx(card, 'shield-flare');
  }
  const actualHpDmg = hpDmg !== null ? hpDmg : (value - tempAbsorbed);
  if (actualHpDmg > 0) {
    spawnFloatingText(container, `-${actualHpDmg}`, 'damage');
  }
}

// 輔助函式：播放單一玩家行動的打擊特效與專屬 Pixel FX
function playSinglePlayerVisualEvent(ev) {
  if (!ev) return;
  if (ev.type === 'player_attack') {
    let fxType = 'slash';
    let sfxName = 'sword_slash';

    if (ev.dmgType === 'phys') {
      if (ev.sourceRole === 'assassin' || ev.isCrit) {
        fxType = 'x-slash';
        sfxName = 'dagger_crit';
      } else if (ev.sourceRole === 'archer') {
        fxType = 'arrow';
        sfxName = 'arrow_hit';
      } else if (ev.sourceRole === 'druid') {
        fxType = 'wolf-claw';
        sfxName = 'wolf_howl';
      } else {
        fxType = 'slash';
        sfxName = 'sword_slash';
      }
    } else {
      if (ev.sourceRole === 'alchemist') {
        fxType = 'acid-bubble';
        sfxName = 'acid_hiss';
      } else if (ev.sourceRole === 'druid') {
        fxType = 'treant-vine';
        sfxName = 'treant_creak';
      } else {
        fxType = 'magic-runes';
        sfxName = 'magic';
      }
    }

    triggerHitOnMonster(ev.isCrit, fxType, ev.value);
    playSound(sfxName);

    if (ev.isCrit) {
      spawnFloatingText(elements.monsterFloatingContainer, `CRIT -${ev.value}!`, 'crit');
    } else {
      spawnFloatingText(elements.monsterFloatingContainer, `-${ev.value}`, 'damage');
    }
  } else if (ev.type === 'shield_cast') {
    triggerShieldOnTeam('築起壁壘守護！');
    playSound('shield_cast');
  } else if (ev.type === 'stealth') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '煙霧匿蹤', 'dodge');
      playPixelFx(card, 'shield-flare');
    }
    playSound('unlock');
  } else if (ev.type === 'heal_group') {
    playSound('heal_chime');
    roomState?.players?.forEach(p => {
      if (p.hp > 0) {
        let totalHeal = ev.groupValue;
        if (p.id === ev.singleTargetId) totalHeal += ev.singleValue;
        triggerHealOnTeammate(p.id, totalHeal);
      }
    });
  } else if (ev.type === 'revive') {
    playSound('heal_chime');
    triggerHealOnTeammate(ev.targetId, ev.value);
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.targetId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), `甦生 +${ev.value}!`, 'heal');
      playPixelFx(card, 'heal-spark');
    }
  } else if (ev.type === 'heal') {
    triggerHealOnTeammate(ev.targetId, ev.value);
    playSound('heal_chime');
  } else if (ev.type === 'self_damage') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.targetId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), `自傷 -${ev.value}`, 'damage');
    playSound('hit');
  } else if (ev.type === 'alc_shield') {
    triggerShieldOnTeam('命運護盾 70%減傷！');
    playSound('shield_cast');
  } else if (ev.type === 'transform_wolf') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '變身狼人!', 'buff');
      playPixelFx(card, 'wolf-claw');
      const avatarImg = card.querySelector('.teammate-avatar-img');
      if (avatarImg) avatarImg.src = '/photo/狼人.webp';
    }
    playSound('wolf_howl');
  } else if (ev.type === 'transform_treant') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '變身樹精!', 'heal');
      playPixelFx(card, 'treant-vine');
      const avatarImg = card.querySelector('.teammate-avatar-img');
      if (avatarImg) avatarImg.src = '/photo/遠古樹精.webp';
    }
    playSound('treant_creak');
  } else if (ev.type === 'transform_tree') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '化身古樹(免死)!', 'heal');
      const avatarImg = card.querySelector('.teammate-avatar-img');
      if (avatarImg) avatarImg.src = '/photo/遠古樹精.webp';
    }
    playSound('heal_chime');
  } else if (ev.type === 'transform_end') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '解除變身', 'buff');
      const avatarImg = card.querySelector('.teammate-avatar-img');
      if (avatarImg) {
        const p = (roomState && roomState.players && roomState.players.find(x => x.id === ev.sourceId));
        const originalAvatar = (p && p.customAvatar) || (p && p.avatar) || (classesData['druid']?.avatar) || '/photo/Druid.webp';
        avatarImg.src = originalAvatar;
        avatarImg.alt = (p && p.name) || '德魯伊';
        avatarImg.classList.remove('druid-transformed-avatar');
      }
    }
    playSound('buff');
  } else if (ev.type === 'surrender') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.targetId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), '狼王威壓·臣服!', 'dodge');
  } else if (ev.type === 'summon_minion') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), `召喚${ev.minionName}!`, 'buff');
      playPixelFx(card, 'heal-spark');
    }
    playSound('select');
  } else if (ev.type === 'minion_hit') {
    const card = document.querySelector(`.teammate-card-minion[data-minion-owner-id="${ev.ownerId}"]`) || document.querySelector(`.teammate-card[data-player-id="${ev.ownerId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), `僕從抵擋 -${ev.value}`, 'shield');
      playPixelFx(card, 'shield-flare');
    }
    playSound('shield_block');
  }
}

// 輔助函式：播放怪物攻擊視覺事件 (支援 40ms AoE 漣漪序列)
async function playMonsterVisualEvent(monsterAction) {
  if (!monsterAction) return;
  if (elements.monsterCard) {
    elements.monsterCard.classList.add('shaking');
    setTimeout(() => elements.monsterCard.classList.remove('shaking'), 450);
  }

  if (monsterAction.isUlt) {
    playSound('boss_roar');
  } else {
    playSound('hit');
  }

  // 如果有護盾阻擋，先閃出金色盾牌
  if (monsterAction.shieldMod < 1.0) {
    const shieldText = monsterAction.shieldMod === 0.1 ? '90% 傷害格擋！' : '40% 傷害格擋！';
    triggerShieldOnTeam(shieldText);
    playSound('shield_block');
  }

  const hits = monsterAction.hits || [];
  for (let idx = 0; idx < hits.length; idx++) {
    const hit = hits[idx];
    triggerHitOnTeammate(
      hit.targetId,
      hit.value,
      hit.dodged,
      hit.stealthed,
      monsterAction.shieldMod,
      hit.tempAbsorbed || 0,
      hit.hpDmg
    );
    if (idx < hits.length - 1) {
      await sleep(40); // 隊友間 40ms 漣漪受擊間隔
    }
  }
}

// ==========================================
// 沉浸式 Action Banner (3 欄式 CSS Grid: 來源頭像 - 行動意圖 - 目標頭像)
// ==========================================
function showCombatActionBanner({
  theme = 'player',
  badge = '',
  title = '',
  tags = [],
  hiddenNote = null,
  actorAvatarHtml = '',
  actorName = '',
  targetAvatarHtml = '',
  targetName = ''
}) {
  if (!elements.combatActionBanner) return;

  const banner = elements.combatActionBanner;
  banner.className = `combat-action-banner ${theme === 'boss' ? 'boss-theme' : 'player-theme'}`;

  // 1. 來源欄位
  if (elements.combatBannerActorAvatar) {
    elements.combatBannerActorAvatar.innerHTML = actorAvatarHtml || '';
  }
  if (elements.combatBannerActorName) {
    elements.combatBannerActorName.textContent = actorName || '';
  }

  // 2. 中央意圖欄位
  if (elements.combatBannerBadge) {
    elements.combatBannerBadge.textContent = badge;
  }
  if (elements.combatBannerTitle) {
    elements.combatBannerTitle.textContent = title;
  }
  if (elements.combatBannerTags) {
    if (tags && tags.length > 0) {
      elements.combatBannerTags.innerHTML = tags.map(t => {
        const tagLabel = typeof t === 'object' ? (t.label || '') : String(t);
        const tagType = typeof t === 'object' ? (t.type || '') : '';
        const cls = tagType ? `skill-tag ${tagType}` : 'skill-tag';
        return `<span class="${cls}">[${escapeHtml(tagLabel)}]</span>`;
      }).join(' ');
      elements.combatBannerTags.classList.remove('hidden');
    } else {
      elements.combatBannerTags.innerHTML = '';
      elements.combatBannerTags.classList.add('hidden');
    }
  }
  if (elements.combatBannerHiddenNote) {
    if (hiddenNote) {
      elements.combatBannerHiddenNote.textContent = `${hiddenNote}`;
      elements.combatBannerHiddenNote.classList.remove('hidden');
    } else {
      elements.combatBannerHiddenNote.textContent = '';
      elements.combatBannerHiddenNote.classList.add('hidden');
    }
  }

  // 3. 目標欄位
  if (elements.combatBannerTargetAvatar) {
    elements.combatBannerTargetAvatar.innerHTML = targetAvatarHtml || '';
  }
  if (elements.combatBannerTargetName) {
    elements.combatBannerTargetName.textContent = targetName || '';
  }

  banner.classList.remove('hidden');
  void banner.offsetWidth; // 重新觸發進場 CSS 動畫
}

function hideCombatActionBanner() {
  if (!elements.combatActionBanner) return;
  elements.combatActionBanner.classList.add('hidden');
}

function updateMonsterHpDisplay(hp, maxHp) {
  if (!elements.monsterHpText || !elements.monsterHpFill) return;
  const safeHp = Math.max(0, hp);
  elements.monsterHpText.textContent = `${safeHp} / ${maxHp}`;
  const pct = Math.max(0, Math.min(100, (safeHp / maxHp) * 100));
  elements.monsterHpFill.style.width = `${pct}%`;
}

// 專用非破壞性 HUD 增量更新 (P2-R1.1 Section 1)
// 僅更新血條、數值、護盾與死亡視覺，嚴禁呼叫 renderTeammatesGrid 或重建任何主要 DOM
function updateBattleHudFromSnapshot(snapshot) {
  if (!snapshot) return;

  // 1. 首領怪物 HP 與死亡視覺狀態
  if (snapshot.monster) {
    if (roomState && (roomState.monster || roomState.currentMonster)) {
      if (roomState.monster) {
        roomState.monster.hp = snapshot.monster.hp;
        roomState.monster.maxHp = snapshot.monster.maxHp;
      }
      if (roomState.currentMonster) {
        roomState.currentMonster.hp = snapshot.monster.hp;
        roomState.currentMonster.maxHp = snapshot.monster.maxHp;
      }
    }
    updateMonsterHpDisplay(snapshot.monster.hp, snapshot.monster.maxHp);
    if (elements.monsterAvatar) {
      if (snapshot.monster.hp <= 0) {
        elements.monsterAvatar.classList.add('is-dead');
      } else {
        elements.monsterAvatar.classList.remove('is-dead');
      }
      if (typeof syncPortraitStatusFx === 'function') {
        syncPortraitStatusFx(snapshot.monster, elements.monsterAvatarWrap || elements.monsterAvatar, { scale: 1.1 });
      }
    }
  }

  // 2. 隊友 HP、額外生命、死亡狀態增量更新 (無重繪)
  if (snapshot.players && roomState && roomState.players) {
    roomState.players.forEach(p => {
      const snapP = Array.isArray(snapshot.players) ? snapshot.players.find(s => s.id === p.id) : snapshot.players[p.id];
      if (snapP) {
        Object.assign(p, snapP);
        p.hp = snapP.hp;
        p.tempHp = snapP.tempHp || 0;
        p.displayHp = snapP.displayHp;
        p.maxHp = snapP.maxHp;
        p.displayMaxHp = snapP.displayMaxHp;
      }

      const card = document.querySelector(`.teammate-card[data-player-id="${p.id}"]`);
      if (card) {
        card.classList.toggle('arena-absent',!!p.arenaBlocked);
        const resource=card.querySelector('.combat-resource-summary');
        if(resource)resource.textContent=p.resourceSummary||'';
        let status = card.querySelector('.combat-status-list');
        if (!status) { status = document.createElement('div'); status.className = 'combat-status-list'; card.appendChild(status); }
        status.innerHTML = renderCombatStatuses(p.statuses || []);
        card.classList.toggle('is-assassin-hidden', !!p.isHiddenThisRound && !p.stealthBrokenThisRound && p.hp > 0);
        const isDead = p.hp <= 0;
        if (isDead) {
          card.classList.add('is-dead');
        } else {
          card.classList.remove('is-dead');
        }

        const hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
        let hpClass = '';
        if (hpPct < 30) hpClass = 'low';
        else if (hpPct < 60) hpClass = 'mid';

        const hpFill = card.querySelector('.teammate-hp-fill');
        if (hpFill) {
          hpFill.className = `teammate-hp-fill ${hpClass}`;
          hpFill.style.width = `${hpPct}%`;
        }

        let overhealFill = card.querySelector('.hp-bar-overheal');
        if (p.tempHp > 0) {
          const totalOverhealPct = Math.min(100, Math.round(((p.hp + p.tempHp) / (p.maxHp + p.tempHp)) * 100));
          if (!overhealFill) {
            overhealFill = document.createElement('div');
            overhealFill.className = 'hp-bar-overheal';
            const hpBg = card.querySelector('.teammate-hp-bg');
            if (hpBg) hpBg.appendChild(overhealFill);
          }
          if (overhealFill) overhealFill.style.width = `${totalOverhealPct}%`;
        } else if (overhealFill) {
          overhealFill.remove();
        }

        const statsSub = card.querySelector('.teammate-stats-sub');
        if (statsSub) {
          const hpSpan = statsSub.querySelector('span:first-child');
          if (hpSpan) {
            hpSpan.innerHTML = `HP ${p.tempHp > 0 ? `${p.hp + p.tempHp}/${p.maxHp}` : `${p.hp}/${p.maxHp}`}${p.tempHp > 0 ? `<span class="teammate-overheal-badge">+${p.tempHp} 額外</span>` : ''}`;
          }
        }

        const actionDot = card.querySelector('.action-status-dot');
        if (actionDot && isDead) {
          actionDot.className = 'action-status-dot ready';
          actionDot.textContent = '倒下・本層無法行動';
        }

        // 德魯伊變身形態與頭像同步（結束變身時還原為原始德魯伊造型）
        if (p.role === 'druid') {
          const avatarEl = card.querySelector('.teammate-avatar-img');
          if (avatarEl) {
            const isEmoji = p.customAvatar && !p.customAvatar.startsWith('data:image/') && !p.customAvatar.startsWith('http') && !p.customAvatar.startsWith('/');
            if (p.druidForm === 'werewolf' || p.druidForm === 'treant' || p.druidForm === 'tree') {
              const formSrc = p.druidForm === 'werewolf' ? '/photo/狼人.webp' : '/photo/遠古樹精.webp';
              const formAlt = p.druidForm === 'werewolf' ? '狼人' : '遠古樹精';
              if (avatarEl.tagName === 'IMG') {
                if (!avatarEl.src || !avatarEl.src.endsWith(formSrc)) avatarEl.src = formSrc;
                avatarEl.alt = formAlt;
                avatarEl.classList.add('druid-transformed-avatar');
              } else if (typeof avatarEl.replaceWith === 'function') {
                const temp = document.createElement('div');
                temp.innerHTML = `<img src="${formSrc}" class="teammate-avatar-img druid-transformed-avatar" alt="${formAlt}">`;
                if (temp.firstElementChild) avatarEl.replaceWith(temp.firstElementChild);
              }
            } else {
              if (isEmoji) {
                if (avatarEl.tagName !== 'DIV' && typeof avatarEl.replaceWith === 'function') {
                  const temp = document.createElement('div');
                  temp.innerHTML = `<div class="teammate-avatar-img avatar-emoji-badge">${escapeHtml(p.customAvatar)}</div>`;
                  if (temp.firstElementChild) avatarEl.replaceWith(temp.firstElementChild);
                }
              } else if (avatarEl.tagName === 'IMG') {
                const origSrc = p.customAvatar || p.avatar || (classesData['druid']?.avatar) || '/photo/Druid.webp';
                if (!avatarEl.src || !avatarEl.src.endsWith(origSrc)) avatarEl.src = origSrc;
                avatarEl.alt = p.name || '德魯伊';
                avatarEl.classList.remove('druid-transformed-avatar');
              }
            }
          }
        }

        const avatarWrap = card.querySelector('.teammate-avatar-wrap');
        if (avatarWrap && typeof syncPortraitStatusFx === 'function') {
          syncPortraitStatusFx(p, avatarWrap, { scale: 0.28 });
        }
      }
    });

    // 德魯伊僕從 HP 與縮圖更新
    const druid = roomState.players.find(p => p.role === 'druid');
    if (druid && druid.minions) {
      const minionCard = document.querySelector(`.teammate-card-minion[data-minion-owner-id="${druid.id}"]`);
      if (minionCard) {
        const totalHp = druid.minions.reduce((sum, m) => sum + (m.hp || 0), 0);
        const totalMaxHp = druid.minions.reduce((sum, m) => sum + (m.maxHp || 0), 0);
        const totalHpPct = totalMaxHp > 0 ? Math.max(0, Math.min(100, Math.round((totalHp / totalMaxHp) * 100))) : 0;
        const minionFill = minionCard.querySelector('.teammate-hp-fill');
        if (minionFill) minionFill.style.width = `${totalHpPct}%`;
        const iconWrap = minionCard.querySelector('.minion-icon-wrap');
        if (iconWrap && druid.minions.length > 0) {
          iconWrap.innerHTML = druid.minions.map((m, idx) => {
            const imgSrc = m.avatar || (m.type === 'wolf' ? `/photo/幼狼${m.minionIndex || (idx + 1)}.webp` : `/photo/小樹精${m.minionIndex || (idx + 1)}.webp`);
            return `<img src="${imgSrc}" class="minion-bar-thumb" alt="${escapeHtml(m.name)}" title="${escapeHtml(m.name)} #${idx + 1} (HP ${m.hp}/${m.maxHp})">`;
          }).join('');
        }
      }
    }
  }
}

// 根據戰鬥邏輯產生的快照精準更新顯示生命，確保演出與數值步調完全一致
function applyHpSnapshot(snapshot) {
  if (!snapshot) return;
  if (expandedDisplay) expandedDisplay.snapshot = mergePresentationSnapshot(expandedDisplay.snapshot, snapshot);
  updateBattleHudFromSnapshot(snapshot);
}

// 單一步驟演出 (P2-R1.1 Section 8-11: 14 步嚴格演出順序)
async function playPresentationStep(step, round) {
  if (!step) return;

  // 1. 更新戰況交鋒字幕
  if (step.narrative && elements.battleNarrativeText) {
    elements.battleNarrativeText.innerHTML = formatMarkdown(step.narrative);
    elements.battleNarrativeText.classList.remove('narrative-fade');
    void elements.battleNarrativeText.offsetWidth;
    elements.battleNarrativeText.classList.add('narrative-fade');
  }

  if (step.category) {
    await playExpandedCombatPresentation(step, activeCombatContext);
    return;
  }
  if (step.type === 'player_action' || step.type === 'boss_action') {
    if (typeof playCombatActionPresentation === 'function') {
      await playCombatActionPresentation(step);
    } else {
      if (step.visualEvents && step.visualEvents.length > 0) {
        step.visualEvents.forEach(ev => playSinglePlayerVisualEvent(ev));
      }
      if (step.hpSnapshot) {
        updateBattleHudFromSnapshot(step.hpSnapshot);
      }
      await sleep(1000);
    }

  } else if (step.type === 'status_cleanup') {
    if(step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);
    await waitForPresentation(150,activeCombatContext.signal);
  } else if (step.type === 'overheal_cleanup') {
    hideCombatActionBanner();
    if (step.hpSnapshot) {
      updateBattleHudFromSnapshot(step.hpSnapshot);
    }
    await sleep(400);

  } else if (step.type === 'kill') {
    if (step.hpSnapshot) applyHpSnapshot(step.hpSnapshot);
    await waitForPresentation(300, activeCombatContext.signal);
  }
}

let isProcessingPresentationQueue = false;
let combatQueueController = null;
let activeCombatContext = {};
let lastCombatPresentationId = null;
function isRoundStartPresentationState(state, round) {
  return Boolean(state?.currentMonster && state.battleRound === round &&
    state.state === 'IN_BATTLE');
}
function waitForBattleRoundState(round, signal) {
  const matches = state => isRoundStartPresentationState(state, round);
  const current = pendingAuthoritativeState || roomState;
  if (matches(current)) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const cleanup = () => { socket.off('room:update', update); signal?.removeEventListener('abort', abort); };
    const update = state => { if (matches(state)) { cleanup(); resolve(state); } };
    const abort = () => { cleanup(); reject(new DOMException('Presentation cancelled', 'AbortError')); };
    socket.on('room:update', update);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
async function runPresentationQueue(queue, round, monsterKilled, presentationId) {
  const queueKey = roomState?.code + ':' + presentationId;
  if (!queue?.length || queueKey === lastCombatPresentationId) return;
  combatQueueController?.abort();
  const controller = new AbortController();
  combatQueueController = controller;
  lastCombatPresentationId = queueKey;
  activeCombatContext = { controller, signal: controller.signal };
  isProcessingPresentationQueue = true;
  isPlayingBattleNarrative = true;
  presentationManager.setBlocking(true);
  let completed = false;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if(controller.signal.aborted&&typeof clearSageSamplingIndicators==='function')clearSageSamplingIndicators();
    if (combatQueueController === controller) {
      combatQueueController = null;
      isProcessingPresentationQueue = false;
      isPlayingBattleNarrative = false;
      presentationManager.setBlocking(false);
      const stage = document.getElementById('presentationCombatStage');
      stage?.replaceChildren(); stage?.classList.remove('is-active', 'is-exiting');
      document.getElementById('app').inert = false;
    }
  };
  controller.signal.addEventListener('abort', cleanup, { once: true });
  try {
    // Round-start queues can arrive before room:update; show the pre-tick snapshot
    // while the same round banner runs, then resume the existing combat queue.
    if (queue[0]?.category === 'STATUS_TICK') {
      const state = await waitForBattleRoundState(round, controller.signal);
      const snapshot = queue[0].hpSnapshotBefore;
      roomState = { ...state,
        players: mergePresentationSnapshot(state, snapshot).players,
        currentMonster: { ...state.currentMonster, ...snapshot?.monster } };
      renderApp();
    }
    await ensureBattlePhase(round);
    if (controller.signal.aborted) throw new DOMException('Presentation cancelled', 'AbortError');
    await enterCombatStage(activeCombatContext);
    for (const step of queue) {
      await playPresentationStep(step, round);
    }
    await exitCombatStage(activeCombatContext);
    completed = true;
  } catch (error) {
    if (error.name !== 'AbortError') console.error('[PresentationQueue]', error);
  } finally {
    controller.signal.removeEventListener('abort', cleanup);
    cleanup();
  }
  if (completed && !controller.signal.aborted) {
    if (pendingAuthoritativeState) { roomState = pendingAuthoritativeState; pendingAuthoritativeState = null; }
    renderApp();
    socket.emit('battle:presentation_complete', { round, presentationId });
  }
}
socket.on('battle:presentation_queue', async ({ queue, round, monsterKilled, presentationId }) => {
  await runPresentationQueue(queue, round, monsterKilled, presentationId);
});

// 監聽後端結算的戰鬥視覺事件（相容性 Fallback；若 presentation_queue 正在執行則自動略過）
socket.on('battle:visual_events', ({ events, narratives, round, monsterKilled, duration }) => {
  if (isProcessingPresentationQueue) return;
  if (!events || events.length === 0) return;

  const playerActions = events.filter(e =>
    ['player_attack', 'shield_cast', 'stealth', 'heal_group', 'revive', 'heal', 'self_damage', 'alc_shield', 'transform_wolf', 'transform_treant', 'transform_tree', 'transform_end', 'surrender', 'summon_minion', 'minion_hit'].includes(e.type)
  );
  const monsterAction = events.find(e => e.type === 'monster_attack');

  if (narratives && narratives.length > 0) {
    isPlayingBattleNarrative = true;
    const me = getMyPlayer();
    if (me) renderMyActionBar(me);

    if (elements.battleNarrativeBox) {
      elements.battleNarrativeBox.style.display = 'block';
    }

    const totalMs = Math.max(4000, (duration || 5) * 1000);
    const stepMs = Math.floor((totalMs - 800) / narratives.length);

    let playerActionIdx = 0;
    narratives.forEach((nar, idx) => {
      setTimeout(() => {
        if (elements.battleNarrativeText) {
          elements.battleNarrativeText.innerHTML = formatMarkdown(nar.text);
          elements.battleNarrativeText.classList.remove('narrative-fade');
          void elements.battleNarrativeText.offsetWidth;
          elements.battleNarrativeText.classList.add('narrative-fade');
        }

        if (nar.type === 'player') {
          const ev = playerActions[playerActionIdx++];
          if (ev) playSinglePlayerVisualEvent(ev);
        } else if (nar.type === 'monster') {
          if (monsterAction) playMonsterVisualEvent(monsterAction);
        } else if (nar.type === 'kill') {
          playSound('victory');
          spawnFloatingText(elements.monsterFloatingContainer, '擊殺！VICTORY', 'crit');
          if (elements.monsterAvatar) {
            elements.monsterAvatar.classList.add('shaking');
            setTimeout(() => elements.monsterAvatar.classList.remove('shaking'), 500);
          }
        }
      }, idx * stepMs);
    });

    setTimeout(() => {
      isPlayingBattleNarrative = false;
      const meNow = getMyPlayer();
      if (meNow) renderMyActionBar(meNow);
    }, totalMs);

  } else {
    playerActions.forEach((ev, idx) => {
      setTimeout(() => {
        playSinglePlayerVisualEvent(ev);
      }, idx * 280);
    });

    const monsterDelay = Math.max(500, playerActions.length * 280 + 350);
    setTimeout(() => {
      if (monsterKilled) {
        playSound('victory');
        spawnFloatingText(elements.monsterFloatingContainer, '擊殺！VICTORY', 'crit');
        if (elements.monsterAvatar) {
          elements.monsterAvatar.classList.add('shaking');
          setTimeout(() => elements.monsterAvatar.classList.remove('shaking'), 500);
        }
        return;
      }

      if (monsterAction) {
        playMonsterVisualEvent(monsterAction);
      }
    }, monsterDelay);
  }
});

// ==========================================
// 暫停遊戲與結束戰鬥按鈕事件
// ==========================================
if (elements.btnPauseGame) {
  elements.btnPauseGame.addEventListener('click', () => {
    playSound('click');
    socket.emit('game:toggle_pause', (res) => {
      if (!res.success) alert(res.message);
    });
  });
}

if (elements.btnResumeGameBanner) {
  elements.btnResumeGameBanner.addEventListener('click', () => {
    playSound('click');
    socket.emit('game:toggle_pause', (res) => {
      if (!res.success) alert(res.message);
    });
  });
}

if (elements.btnEndBattle) {
  elements.btnEndBattle.addEventListener('click', () => {
    playSound('click');
    elements.endBattleModal.classList.remove('hidden');
  });
}

if (elements.btnCancelEndBattle) {
  elements.btnCancelEndBattle.addEventListener('click', () => {
    elements.endBattleModal.classList.add('hidden');
  });
}

if (elements.btnConfirmRetreat) {
  elements.btnConfirmRetreat.addEventListener('click', () => {
    elements.endBattleModal.classList.add('hidden');
    playSound('click');
    socket.emit('game:end_battle', {}, (res) => {
      if (!res.success) alert(res.message);
    });
  });
}

// ==========================================
// 頭貼自訂功能 (表情符號 & 照片上傳)
// ==========================================
let pendingAvatar = null;

function getMyPlayer() {
  if (!roomState || !roomState.players) return null;
  return roomState.players.find(p => p.id === myId) || null;
}

function updateEntryAvatarPreview() {
  if (!elements.entryAvatarPreview) return;
  const savedAvatar = localStorage.getItem('dungeon_custom_avatar');
  if (savedAvatar) {
    if (savedAvatar.startsWith('data:image/') || savedAvatar.startsWith('http') || savedAvatar.startsWith('/')) {
      elements.entryAvatarPreview.innerHTML = `<img src="${savedAvatar}" alt="avatar">`;
    } else {
      elements.entryAvatarPreview.innerHTML = `<span class="avatar-emoji-badge" style="width:100%; height:100%; font-size:26px;">${escapeHtml(savedAvatar)}</span>`;
    }
  } else {
    elements.entryAvatarPreview.innerHTML = getIconSvg('user');
  }
}

function updateModalPreview(avatar) {
  const me = getMyPlayer();
  const roleInfo = (me && me.role) ? classesData[me.role] : null;

  if (!elements.modalAvatarPreview || !elements.modalAvatarTypeLabel) return;

  if (avatar) {
    if (avatar.startsWith('data:image/') || avatar.startsWith('http')) {
      elements.modalAvatarPreview.innerHTML = `<img src="${avatar}" alt="preview">`;
      elements.modalAvatarTypeLabel.textContent = '已選擇：自訂照片';
    } else {
      elements.modalAvatarPreview.innerHTML = `<span class="avatar-emoji-badge" style="width:100%; height:100%; font-size:32px;">${escapeHtml(avatar)}</span>`;
      elements.modalAvatarTypeLabel.textContent = `已選擇：自訂圖示【${avatar}】`;
    }
  } else {
    // 官方職業頭貼 (依玩家所選職業決定)
    if (roleInfo && roleInfo.avatar) {
      elements.modalAvatarPreview.innerHTML = `<img src="${roleInfo.avatar}" alt="${roleInfo.name}">`;
      elements.modalAvatarTypeLabel.textContent = `職業專屬頭貼【${roleInfo.name}】`;
    } else if (roleInfo) {
      elements.modalAvatarPreview.innerHTML = `<div class="avatar-icon-badge" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">${getIconSvg(getRoleIconName(me.role), 'svg-large')}</div>`;
      elements.modalAvatarTypeLabel.textContent = `職業專屬頭貼【${roleInfo.name}】`;
    } else {
      elements.modalAvatarPreview.innerHTML = getIconSvg('user');
      elements.modalAvatarTypeLabel.textContent = '職業專屬頭貼（在大廳選職後自動換上立繪）';
    }
  }
}

function updateHeroRoleOptionUI() {
  const me = getMyPlayer();
  const roleInfo = (me && me.role) ? classesData[me.role] : null;

  if (!elements.heroRoleOptionCard) return;

  if (roleInfo) {
    if (roleInfo.avatar) {
      elements.heroRoleOptionPreview.innerHTML = `<img src="${roleInfo.avatar}" alt="${roleInfo.name}">`;
    } else {
      elements.heroRoleOptionPreview.innerHTML = getIconSvg(getRoleIconName(me.role));
    }
    elements.heroRoleOptionTitle.textContent = `職業官方立繪：${roleInfo.name}`;
    elements.heroRoleOptionDesc.textContent = `使用【${roleInfo.name}】官方頭貼。若更換職業將自動同步切換！`;
  } else {
    elements.heroRoleOptionPreview.innerHTML = getIconSvg('user');
    elements.heroRoleOptionTitle.textContent = '職業官方專屬頭貼';
    elements.heroRoleOptionDesc.textContent = '自動隨你選擇的職業切換專屬立繪頭像（請至大廳挑選職業）';
  }

  if (pendingAvatar === null) {
    elements.heroRoleOptionCard.classList.add('selected');
    if (elements.heroRoleOptionBadge) elements.heroRoleOptionBadge.textContent = '目前選用中';
  } else {
    elements.heroRoleOptionCard.classList.remove('selected');
    if (elements.heroRoleOptionBadge) elements.heroRoleOptionBadge.textContent = '點擊選用';
  }
}

function openAvatarModal() {
  const me = getMyPlayer();
  let saved = me ? me.customAvatar : (localStorage.getItem('dungeon_custom_avatar') || null);
  if (saved && saved.startsWith('/photo/')) {
    localStorage.removeItem('dungeon_custom_avatar');
    saved = null;
  }
  pendingAvatar = saved;
  updateModalPreview(pendingAvatar);
  updateHeroRoleOptionUI();

  if (elements.avatarModalOverlay) {
    elements.avatarModalOverlay.classList.remove('hidden');
  }

  // 標記已選的 Emoji (如果是單一 emoji)
  document.querySelectorAll('.emoji-option-btn').forEach(btn => {
    if (pendingAvatar && btn.textContent === pendingAvatar) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
}

function closeAvatarModal() {
  if (elements.avatarModalOverlay) {
    elements.avatarModalOverlay.classList.add('hidden');
  }
}

function switchAvatarTab(tab) {
  const tabs = {
    hero: { btn: elements.tabHeroBtn, content: elements.tabHeroContent },
    emoji: { btn: elements.tabEmojiBtn, content: elements.tabEmojiContent },
    upload: { btn: elements.tabUploadBtn, content: elements.tabUploadContent }
  };

  Object.keys(tabs).forEach(key => {
    const item = tabs[key];
    if (key === tab) {
      if (item.btn) item.btn.classList.add('active');
      if (item.content) item.content.classList.add('active');
    } else {
      if (item.btn) item.btn.classList.remove('active');
      if (item.content) item.content.classList.remove('active');
    }
  });
}

function selectModalEmoji(emoji, btnElement) {
  pendingAvatar = emoji;
  if (elements.heroRoleOptionCard) {
    elements.heroRoleOptionCard.classList.remove('selected');
    if (elements.heroRoleOptionBadge) elements.heroRoleOptionBadge.textContent = '點擊選用';
  }
  document.querySelectorAll('.emoji-option-btn').forEach(b => b.classList.remove('selected'));
  if (btnElement) btnElement.classList.add('selected');
  updateModalPreview(pendingAvatar);
  playSound('click');
}

function handleAvatarFileUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('請上傳圖片檔案 (JPG、PNG、WebP、GIF 等)！');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // 裁切縮放為 128x128 圓形/方形頭像
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;

      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 128, 128);

      const dataUrl = canvas.toDataURL('image/webp', 0.85);
      pendingAvatar = dataUrl;
      if (elements.heroRoleOptionCard) {
        elements.heroRoleOptionCard.classList.remove('selected');
        if (elements.heroRoleOptionBadge) elements.heroRoleOptionBadge.textContent = '點擊選用';
      }
      document.querySelectorAll('.emoji-option-btn').forEach(b => b.classList.remove('selected'));
      updateModalPreview(pendingAvatar);
      playSound('click');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function saveCustomAvatar(avatar) {
  if (avatar) {
    localStorage.setItem('dungeon_custom_avatar', avatar);
  } else {
    localStorage.removeItem('dungeon_custom_avatar');
  }

  // 同步更新發起組隊頁面之頭貼預覽
  updateEntryAvatarPreview();

  if (roomState) {
    socket.emit('player:update_avatar', { avatar }, (res) => {
      if (res && !res.success) {
        alert(res.message || '更新頭貼失敗');
      }
    });
  }

  closeAvatarModal();
  playSound('click');
}

function initAvatarModal() {
  const adventureEmojis = ['🧙‍♂️', '🧝‍♀️', '🥷', '🦸', '🧑‍🚀', '👑', '💀', '🤠', '🤴', '👸', '🧙', '🧛', '🧌', '🧝', '🤺', '🏹'];
  const creatureEmojis = ['🐺', '🦊', '🦁', '🐯', '🐉', '🦅', '🦉', '🦇', '🐱', '🐶', '🐻', '🐼', '🦄', '🐗', '🐍', '🐙'];
  const weaponEmojis = ['⚔️', '🛡️', '🏹', '🔮', '⚡', '💎', '🗡️', '💣', '🧪', '📜', '🩸', '✨', '🪐', '🔥', '❄️', '🌟'];

  function populateEmojiGrid(container, emojis) {
    if (!container) return;
    container.innerHTML = '';
    emojis.forEach(emo => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-option-btn';
      btn.textContent = emo;
      btn.addEventListener('click', () => {
        selectModalEmoji(emo, btn);
      });
      container.appendChild(btn);
    });
  }

  populateEmojiGrid(elements.emojiGridAdventure, adventureEmojis);
  populateEmojiGrid(elements.emojiGridCreatures, creatureEmojis);
  populateEmojiGrid(elements.emojiGridWeapons, weaponEmojis);

  // Tab 切換
  if (elements.tabHeroBtn) elements.tabHeroBtn.addEventListener('click', () => switchAvatarTab('hero'));
  if (elements.tabEmojiBtn) elements.tabEmojiBtn.addEventListener('click', () => switchAvatarTab('emoji'));
  if (elements.tabUploadBtn) elements.tabUploadBtn.addEventListener('click', () => switchAvatarTab('upload'));

  // 點擊「職業原本頭貼」卡片選用
  if (elements.heroRoleOptionCard) {
    elements.heroRoleOptionCard.addEventListener('click', () => {
      pendingAvatar = null;
      document.querySelectorAll('.emoji-option-btn').forEach(b => b.classList.remove('selected'));
      updateHeroRoleOptionUI();
      updateModalPreview(null);
      playSound('click');
    });
  }

  // 開啟 Modal (登入頁面頭貼按鈕)
  if (elements.btnEntryAvatar) elements.btnEntryAvatar.addEventListener('click', openAvatarModal);

  // 關閉 Modal
  if (elements.btnCloseAvatarModal) elements.btnCloseAvatarModal.addEventListener('click', closeAvatarModal);
  if (elements.btnCancelAvatar) elements.btnCancelAvatar.addEventListener('click', closeAvatarModal);
  if (elements.avatarModalOverlay) {
    elements.avatarModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.avatarModalOverlay) closeAvatarModal();
    });
  }

  // 自訂 Emoji 套用
  if (elements.btnApplyCustomEmoji && elements.customEmojiInput) {
    elements.btnApplyCustomEmoji.addEventListener('click', () => {
      const val = elements.customEmojiInput.value.trim();
      if (val) {
        selectModalEmoji(val);
      }
    });
    elements.customEmojiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = elements.customEmojiInput.value.trim();
        if (val) selectModalEmoji(val);
      }
    });
  }

  // 檔案上傳
  if (elements.btnBrowseFile && elements.avatarFileInput) {
    elements.btnBrowseFile.addEventListener('click', () => elements.avatarFileInput.click());
  }
  if (elements.avatarDropzone && elements.avatarFileInput) {
    elements.avatarDropzone.addEventListener('click', (e) => {
      if (e.target !== elements.btnBrowseFile) {
        elements.avatarFileInput.click();
      }
    });
    elements.avatarDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.avatarDropzone.classList.add('dragover');
    });
    elements.avatarDropzone.addEventListener('dragleave', () => {
      elements.avatarDropzone.classList.remove('dragover');
    });
    elements.avatarDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      elements.avatarDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleAvatarFileUpload(e.dataTransfer.files[0]);
      }
    });
  }

  if (elements.avatarFileInput) {
    elements.avatarFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAvatarFileUpload(e.target.files[0]);
      }
    });
  }

  // 重設為職業預設
  if (elements.btnResetAvatarDefault) {
    elements.btnResetAvatarDefault.addEventListener('click', () => {
      pendingAvatar = null;
      updateHeroRoleOptionUI();
      document.querySelectorAll('.emoji-option-btn').forEach(b => b.classList.remove('selected'));
      updateModalPreview(null);
      playSound('click');
    });
  }

  // 確認套用
  if (elements.btnSaveAvatar) {
    elements.btnSaveAvatar.addEventListener('click', () => {
      saveCustomAvatar(pendingAvatar);
    });
  }
}

// 啟動初始化頭貼視窗與發起組隊頁面之頭貼預覽及音效圖示
initAvatarModal();
updateEntryAvatarPreview();
updateSoundIcon();

document.getElementById('logDrawerHandle')?.addEventListener('click',()=>{
    const card=elements.battleLogCard,open=card.classList.toggle('is-open');
    const handle=document.getElementById('logDrawerHandle');handle.textContent=open?'‹':'›';handle.setAttribute('aria-expanded',String(open));
  });
// Fixed drawers belong to the viewport, outside animated view containers.
if(elements.battleLogCard)document.body.appendChild(elements.battleLogCard);
