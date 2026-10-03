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
let routeNarrativeDoneKey = null;
let eventDoneKey = null;

// 音效系統 (Web Audio API)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    initAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    switch (type) {
      case 'click':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
        break;

      case 'hit':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;

      case 'magic':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.2);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
        break;

      case 'heal':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;

      case 'victory':
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.12);
        osc.frequency.setValueAtTime(659.25, now + 0.24);
        osc.frequency.setValueAtTime(880, now + 0.36);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
        break;

      case 'type':
        osc.type = 'triangle';
        const typeFreq = 950 + (Math.random() * 200 - 100);
        osc.frequency.setValueAtTime(typeFreq, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.035);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.035);
        osc.start(now);
        osc.stop(now + 0.035);
        break;

      case 'banner':
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.18);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;

      case 'gameover':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
    }
  } catch (e) {
    // 瀏覽器若禁止自動播放則靜音處理
  }
}

// DOM 元素引用
const elements = {
  // Badges & Header
  roomBadge: document.getElementById('roomBadge'),
  roomCodeText: document.getElementById('roomCodeText'),
  roomCopyToast: document.getElementById('roomCopyToast'),
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
  startRequirementText: document.getElementById('startRequirementText'),

  // Prologue
  prologueTitle: document.getElementById('prologueTitle'),
  prologueTextBody: document.getElementById('prologueTextBody'),
  btnSkipPrologue: document.getElementById('btnSkipPrologue'),
  prologueCountdown: document.getElementById('prologueCountdown'),
  prologueActions: document.querySelector('.prologue-actions'),

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
  routeAtmosphereText: document.querySelector('.route-atmosphere-text'),
  routeTimerBar: document.getElementById('routeTimerBar'),

  // Event
  eventIcon: document.getElementById('eventIcon'),
  eventTitle: document.getElementById('eventTitle'),
  eventStoryText: document.getElementById('eventStoryText'),
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
  renderRoleSelectionGrid();
  updateHeroRoleOptionUI();
});

socket.on('room:update', (state) => {
  roomState = state;
  currentRoomCode = state.code;
  renderApp();
  updateHeroRoleOptionUI();
  syncChatMessages(state.chatMessages);
});

// 取得玩家頭貼 HTML (自訂頭貼 > 職業預設 > 預設頭像)
function getPlayerAvatarHtml(player, className = 'member-role-avatar') {
  if (!player) return `<div class="${className} member-avatar-placeholder">👤</div>`;
  const roleInfo = player.role ? classesData[player.role] : null;

  // 1. 玩家自訂頭貼 (自訂照片或 Emoji)
  if (player.customAvatar) {
    if (player.customAvatar.startsWith('data:image/') || player.customAvatar.startsWith('http')) {
      return `<img src="${player.customAvatar}" class="${className}" alt="${escapeHtml(player.name)}">`;
    } else {
      return `<div class="${className} avatar-emoji-badge">${escapeHtml(player.customAvatar)}</div>`;
    }
  }

  // 2. 職業預設圖片或 Emoji
  if (roleInfo && roleInfo.avatar) {
    return `<img src="${roleInfo.avatar}" class="${className}" alt="${roleInfo.name}">`;
  }
  if (roleInfo && roleInfo.emoji) {
    return `<div class="${className} avatar-emoji-badge">${roleInfo.emoji}</div>`;
  }

  // 3. 未選職預設
  return `<div class="${className} member-avatar-placeholder">👤</div>`;
}

// 切換視圖
function switchView(viewName) {
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

// 渲染整體畫面
function renderApp() {
  if (!roomState) return;

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
      prologueCompleted = false;
      isPrologueTyping = false;
      routeNarrativeDoneKey = null;
      eventDoneKey = null;
      lastAnnouncedBattleRound = 0;
      renderLobby(me, isLeader);
      break;

    case 'PROLOGUE':
      switchView('prologue');
      renderPrologue(isLeader);
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
  if (!dropInfo || !me || dropInfo.ownerId !== myId) {
    elements.equipDropModal.classList.add('hidden');
    selectedReplaceIndex = -1;
    return;
  }

  const drop = dropInfo.drop;
  elements.equipModalTitle.textContent = `🎁 獲得戰利品裝備：【${drop.name}】！`;
  elements.equipModalSubtitle.textContent = `你在${dropInfo.source === 'battle' ? '擊敗怪物' : '探索寶箱'}後獲得了這件裝備！請抉擇是否穿戴（每位角色上限 3 件）：`;
  elements.dropItemName.textContent = drop.name;
  elements.dropItemType.textContent = drop.type === 'weapon' ? '⚔️ 武器' : (drop.type === 'armor' ? '🛡️ 防具' : '💍 飾品');
  elements.dropItemDesc.textContent = drop.desc || drop.statDesc || '';

  const myEquips = me.equips || [];
  elements.currentEquipCount.textContent = myEquips.length;
  const isFull = myEquips.length >= 3;

  if (isFull) {
    elements.equipReplaceNotice.classList.remove('hidden');
  } else {
    elements.equipReplaceNotice.classList.add('hidden');
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
        ${isFull ? `<span class="replace-radio-badge">${selectedReplaceIndex === idx ? '✓ 將替換此件' : '點選以替換'}</span>` : ''}
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
    if (isFull && (selectedReplaceIndex < 0 || selectedReplaceIndex >= myEquips.length)) {
      alert('⚠️ 裝備欄已滿 3 件！請先點選上方欲替換卸下的既有裝備。');
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

// 渲染大廳小隊成員準備狀態圖標 (已就緒: 綠勾勾 / 尚未選職: 黃色驚嘆號，無文字)
function renderMemberStatusBadge(roleInfo) {
  if (roleInfo) {
    return `
      <span class="member-status-icon ready" title="已就緒" aria-label="已就緒">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    `;
  } else {
    return `
      <span class="member-status-icon waiting" title="尚未選職" aria-label="尚未選職">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="13"></line>
          <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"></circle>
        </svg>
      </span>
    `;
  }
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

    const div = document.createElement('div');
    div.className = `member-item ${isThisMe ? 'is-me' : ''}`;

    if (isThisMe) {
      div.innerHTML = `
        <div class="member-info-col">
          <div class="member-avatar-wrapper clickable-avatar" id="btnMemberMyAvatar" title="點擊更換個人頭貼">
            ${getPlayerAvatarHtml(p, 'member-role-avatar')}
            ${roleInfo ? `<span class="member-avatar-role-badge" title="${roleInfo.name}">${roleInfo.emoji}</span>` : ''}
          </div>
          <div class="member-name-group">
            ${isEditingMyName ? `
              <div class="member-inline-rename-form">
                <input type="text" class="inline-rename-input" id="inputInlineRename" value="${escapeHtml(editingNameValue !== '' ? editingNameValue : p.name)}" maxlength="12" placeholder="輸入暱稱...">
                <button type="button" class="btn-micro-action btn-save-name" id="btnSaveInlineRename" title="確認修改">✓</button>
                <button type="button" class="btn-micro-action btn-cancel-name" id="btnCancelInlineRename" title="取消">✕</button>
              </div>
            ` : `
              <div class="member-name-row">
                <span class="member-name">
                  ${isThisLeader ? '<span class="crown-tag" title="隊長">👑</span>' : ''}
                  <span class="member-name-text">${escapeHtml(p.name)}</span>
                  <span class="me-tag">(你)</span>
                </span>
                <button type="button" class="btn-icon-rename" id="btnTriggerInlineRename" title="修改暱稱">✏️</button>
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
          ${renderMemberStatusBadge(roleInfo)}
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
            ${roleInfo ? `<span class="member-avatar-role-badge" title="${roleInfo.name}">${roleInfo.emoji}</span>` : ''}
          </div>
          <div class="member-name-group">
            <span class="member-name">
              ${isThisLeader ? '<span class="crown-tag" title="隊長">👑</span>' : ''}
              <span class="member-name-text">${escapeHtml(p.name)}</span>
            </span>
            <span class="member-role-tag">
              ${roleInfo ? escapeHtml(roleInfo.name) : '<span class="role-unselected">未選職</span>'}
            </span>
          </div>
        </div>
        <div class="member-status-col">
          ${renderMemberStatusBadge(roleInfo)}
        </div>
      `;
    }

    elements.lobbyMemberList.appendChild(div);
  });

  // 更新角色選擇卡
  renderRoleSelectionGrid();

  // 隊長出發按鈕判定
  const allPicked = roomState.players.length > 0 && roomState.players.every(p => p.role);
  if (isLeader) {
    elements.leaderStartArea.classList.remove('hidden');
    elements.memberWaitArea.classList.add('hidden');
    elements.btnStartGame.disabled = !allPicked;
    if (allPicked) {
      elements.startRequirementText.textContent = '小隊全體就緒！點擊開始冒險！';
      elements.startRequirementText.style.color = '#16a34a';
    } else {
      elements.startRequirementText.textContent = '尚有隊員未完成選職';
      elements.startRequirementText.style.color = '#dc2626';
    }
  } else {
    elements.leaderStartArea.classList.add('hidden');
    elements.memberWaitArea.classList.remove('hidden');
  }
}

// 渲染選職卡片
function renderRoleSelectionGrid() {
  if (!classesData || Object.keys(classesData).length === 0) return;
  const me = roomState?.players?.find(p => p.id === myId);
  const myRole = me?.role;

  elements.roleSelectionGrid.innerHTML = '';

  Object.entries(classesData).forEach(([roleKey, conf]) => {
    // 找出所有選擇此職業的隊友（職業可重複選擇）
    const choosers = (roomState?.players || []).filter(p => p.role === roleKey);
    const isSelectedByMe = myRole === roleKey;

    const card = document.createElement('div');
    card.className = `role-card ${isSelectedByMe ? 'selected' : ''}`;

    let buttonText = isSelectedByMe ? '✓ 已選擇' : '選擇此職業';

    let choosersHtml = '';
    if (choosers.length > 0) {
      choosersHtml = `<div class="role-card-choosers" style="margin-top:6px; font-size:0.75rem; color:#f59e0b; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
        <span>👥</span> <span>已選隊友: ${choosers.map(c => escapeHtml(c.name)).join(', ')}</span>
      </div>`;
    }

    card.innerHTML = `
      <div class="role-card-inner">
        ${conf.avatar ? `
          <div class="role-card-avatar-wrap">
            <img src="${conf.avatar}" alt="${conf.name}" class="role-card-avatar" loading="lazy">
          </div>
        ` : `
          <div class="role-card-top">
            <span class="role-card-icon">${conf.emoji}</span>
          </div>
        `}
        <div class="role-card-top">
          <span class="role-card-name">${conf.name}</span>
          <span class="role-card-hp">HP: ${conf.maxHp}</span>
        </div>
        <p class="role-card-desc">${conf.desc}</p>
        ${choosersHtml}
      </div>
      <button class="btn ${isSelectedByMe ? 'btn-success' : 'btn-primary'} role-card-btn">
        ${buttonText}
      </button>
    `;

    card.addEventListener('click', () => {
      playSound('click');
      socket.emit('player:select_role', { roleKey }, (res) => {
        if (!res.success) {
          alert(res.message);
        }
      });
    });

    elements.roleSelectionGrid.appendChild(card);
  });
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

  // 1 秒淡出淡入轉場
  triggerScreenTransition();

  // 根據不同階段觸發對應的像素大字幕 (左滑入 -> 中間大幅減速停留1秒 -> 右滑出)
  switch (state.state) {
    case 'PROLOGUE':
      prologueCompleted = false;
      isPrologueTyping = false;
      break;

    case 'TRANSITION': {
      const trans = state.currentTransition;
      showCinematicBanner({
        title: `【第 ${trans?.floor || state.floor} 層・深淵探索】`,
        subtitle: `FLOOR ${trans?.floor || state.floor} · ${trans?.routeName || 'DEEP ABYSS'}`,
        theme: 'gold'
      });
      break;
    }

    case 'CHOOSING_ROUTE':
      showCinematicBanner({
        title: `【第 ${state.floor} 層・迷霧分歧點】`,
        subtitle: `FLOOR ${state.floor} · ROUTE CHOICE`,
        theme: 'gold'
      });
      break;

    case 'EVENT': {
      const isTreasure = state.currentEvent?.type === 'treasure';
      showCinematicBanner({
        title: isTreasure ? '【遠古寶箱・幸運眷顧】' : '【致命機關・淬毒暗箭】',
        subtitle: `FLOOR ${state.floor} · DUNGEON EVENT`,
        theme: 'event'
      });
      break;
    }

    case 'IN_BATTLE':
      showCinematicBanner({
        title: '【深淵領主・遭遇戰鬥】',
        subtitle: `BOSS ENCOUNTER · ${state.currentMonster?.name || 'MONSTER'}`,
        theme: 'boss',
        onFinish: () => {
          // 遭遇戰大字幕結束後，接續第一回合冒險者行動字幕
          lastAnnouncedBattleRound = 1;
          showCinematicBanner({
            title: '【第 1 回合・冒險者行動】',
            subtitle: 'ROUND 1 · PLAYER PHASE',
            theme: 'player'
          });
        }
      });
      lastAnnouncedBattleRound = 1;
      break;

    case 'CHECKPOINT':
      showCinematicBanner({
        title: '【庇護營地・短暫休整】',
        subtitle: `FLOOR ${state.floor} · SANCTUARY REST`,
        theme: 'camp'
      });
      break;
  }
}

// 1.5 渲染開場劇情 (深淵啟程 - 像素大標題打字機 + 快速故事打字機)
function renderPrologue(isLeader) {
  if (elements.btnSkipPrologue) {
    elements.btnSkipPrologue.style.display = isLeader ? 'inline-flex' : 'none';
  }
  if (roomState.timerRemaining !== null && elements.prologueCountdown) {
    elements.prologueCountdown.textContent = `⏳ 命運之輪轉動中... (${roomState.timerRemaining} 秒後自動踏入)`;
  }

  // 僅在初次進入時觸發打字機演繹
  if (!prologueCompleted && !isPrologueTyping) {
    isPrologueTyping = true;
    if (elements.prologueActions) {
      elements.prologueActions.style.opacity = '0';
      elements.prologueActions.style.pointerEvents = 'none';
    }

    const titleText = "【深淵啟程・命運之扉開啟】";
    const paragraphs = [
      "厚重的黑曜石大門在刺耳的摩擦聲中緩緩敞開，古老腐朽的塵埃隨之撲面而來。",
      "火把微弱的橘光照亮了腳下斑駁的石階，空氣中瀰漫著潮濕的青苔、生鏽鐵器與隱約的血腥氣味。",
      "身後的退路已被封死，冒險小隊握緊了手中的武器與符文，深吸一口氣，正式踏入這座沉睡千年的深淵地城！"
    ];

    // 即時完成打字機輔助函式
    const finishPrologueImmediately = () => {
      if (currentTypewriterTimer) {
        clearInterval(currentTypewriterTimer);
        currentTypewriterTimer = null;
      }
      if (elements.prologueTitle) {
        elements.prologueTitle.textContent = titleText;
        elements.prologueTitle.classList.remove('typewriter-cursor');
      }
      if (elements.prologueTextBody) {
        elements.prologueTextBody.innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');
      }
      isPrologueTyping = false;
      prologueCompleted = true;
      if (elements.prologueActions) {
        elements.prologueActions.style.transition = 'opacity 0.4s ease';
        elements.prologueActions.style.opacity = '1';
        elements.prologueActions.style.pointerEvents = 'all';
      }
    };

    // 點擊開場卡片區域可直接快轉跳過打字機
    const prologueCard = elements.views.prologue ? elements.views.prologue.querySelector('.prologue-card') : null;
    if (prologueCard) {
      const fastForwardHandler = () => {
        if (isPrologueTyping) {
          finishPrologueImmediately();
        }
        prologueCard.removeEventListener('click', fastForwardHandler);
      };
      prologueCard.addEventListener('click', fastForwardHandler);
    }

    // 先以打字機的形式出現大標題並搭配音效
    typeWriterEffect(elements.prologueTitle, titleText, 55, () => {
      if (!isPrologueTyping) return; // 若已被玩家點擊快轉則不再覆蓋
      // 接著下方以更快的打字機形式出現描述故事
      typeWriterParagraphs(elements.prologueTextBody, paragraphs, 22, () => {
        isPrologueTyping = false;
        prologueCompleted = true;
        if (elements.prologueActions) {
          elements.prologueActions.style.transition = 'opacity 0.4s ease';
          elements.prologueActions.style.opacity = '1';
          elements.prologueActions.style.pointerEvents = 'all';
        }
      });
    });
  }
}

// 1.8 渲染進入層數打字機轉場
function renderTransition() {
  const trans = roomState.currentTransition;
  if (!trans) return;

  const key = `${trans.floor}_${trans.routeId}_${trans.outcomeType}`;
  if (lastTypedTransitionKey !== key) {
    lastTypedTransitionKey = key;
    if (elements.transitionRouteTag) {
      elements.transitionRouteTag.textContent = `${trans.routeIcon || '🧭'} 前往路線：${trans.routeName}`;
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

// 2. 渲染路線分歧（先字幕再敘述，最後才是操作與倒數計時）
function renderRouteChoice(me, isLeader) {
  elements.routeFloorNum.textContent = roomState.floor;
  if (elements.routeFloorHeaderNum) {
    elements.routeFloorHeaderNum.textContent = roomState.floor;
  }
  if (elements.routeMainTitle) {
    elements.routeMainTitle.innerHTML = `【第 <span>${roomState.floor}</span> 層・迷霧分歧點】`;
  }
  elements.routeDiffPercent.textContent = roomState.floorDifficultyPercent !== undefined ? roomState.floorDifficultyPercent : Math.round((roomState.floor - 1) * 10);

  const livingPlayers = (roomState.players || []).filter(p => p.hp > 0);
  const myVoteId = roomState.routeVotes ? roomState.routeVotes[myId] : null;

  if (myVoteId) {
    elements.routeStatusText.innerHTML = '🗳️ <strong>你已完成投票！等待隊友投票中...（倒數結束結算最高票，平票或全棄票則隨機指引）</strong>';
  } else if (me && me.hp <= 0) {
    elements.routeStatusText.innerHTML = '🪦 <strong>你已陣亡，無法參與本層路線投票。請觀看隊友抉擇...</strong>';
  } else {
    elements.routeStatusText.innerHTML = '🗳️ <strong>請全體存活隊友共同投票（每人限投 1 票，15 秒截止）：</strong>';
  }

  // 15 秒倒數計時
  const secondsLeft = roomState.timerRemaining !== null ? roomState.timerRemaining : 15;
  elements.routeTimerText.textContent = `倒數 ${secondsLeft} 秒`;
  const pct = Math.max(0, Math.min(100, (secondsLeft / 15) * 100));
  elements.routeTimerProgress.style.width = `${pct}%`;

  // 先字幕再敘述，最後才是操作與倒數計時
  const routeKey = `ROUTE_FLOOR_${roomState.floor}`;
  if (routeNarrativeDoneKey !== routeKey) {
    routeNarrativeDoneKey = routeKey;

    if (elements.routeOptionsGrid) elements.routeOptionsGrid.style.display = 'none';
    if (elements.routeVotersStatusList) elements.routeVotersStatusList.style.display = 'none';
    if (elements.routeTimerBar) elements.routeTimerBar.style.display = 'none';
    if (elements.routeStatusText) elements.routeStatusText.style.display = 'none';

    const routeParagraphs = [
      "腳下的石磚路在此處斷裂，前方地勢錯綜複雜，瀰漫著不詳的陰暗薄霧。",
      "隱約間能聽見遠處傳來的低沉嘶吼、風穿過石隙的尖銳呼嘯，甚至還有金屬反光的微弱閃爍……",
      "機遇與毀滅僅有一線之隔，請全員共同投票決定前進方向！（15 秒倒數）"
    ];

    typeWriterParagraphs(elements.routeAtmosphereText, routeParagraphs, 16, () => {
      if (elements.routeOptionsGrid) {
        elements.routeOptionsGrid.style.display = 'grid';
        elements.routeOptionsGrid.classList.add('narrative-fade');
      }
      if (elements.routeVotersStatusList) {
        elements.routeVotersStatusList.style.display = 'flex';
        elements.routeVotersStatusList.classList.add('narrative-fade');
      }
      if (elements.routeTimerBar) {
        elements.routeTimerBar.style.display = 'block';
        elements.routeTimerBar.classList.add('narrative-fade');
      }
      if (elements.routeStatusText) {
        elements.routeStatusText.style.display = 'block';
      }
    });
  }

  // 渲染隊員投票狀態標籤欄（純文字名稱與投票狀態，不顯示職業頭貼）
  if (elements.routeVotersStatusList) {
    elements.routeVotersStatusList.innerHTML = '';
    livingPlayers.forEach(p => {
      const vId = roomState.routeVotes ? roomState.routeVotes[p.id] : null;
      const pill = document.createElement('div');
      pill.className = `route-voter-pill ${vId ? 'voted' : 'thinking'}`;
      if (vId) {
        const votedRoute = (roomState.currentRoutes || []).find(r => r.id === vId);
        pill.innerHTML = `<span><strong>${escapeHtml(p.name)}</strong>: ✅ 已投${votedRoute ? '【' + votedRoute.name + '】' : ''}</span>`;
      } else {
        pill.innerHTML = `<span><strong>${escapeHtml(p.name)}</strong>: ⏳ 思考中...</span>`;
      }
      elements.routeVotersStatusList.appendChild(pill);
    });
  }

  // 渲染 4 條路線按鈕
  elements.routeOptionsGrid.innerHTML = '';
  const currentRoutes = (roomState.currentRoutes && roomState.currentRoutes.length > 0)
    ? roomState.currentRoutes
    : (routesData && routesData.length > 0 ? routesData.slice(0, 4) : []);

  currentRoutes.forEach(route => {
    const votes = (roomState.routeVoteCounts && roomState.routeVoteCounts[route.id]) || 0;
    const isMyVote = (myVoteId === route.id);
    const isDead = Boolean(me && me.hp <= 0);

    const votersForThisRoute = (roomState.players || [])
      .filter(p => roomState.routeVotes && roomState.routeVotes[p.id] === route.id)
      .map(p => escapeHtml(p.name));

    const item = document.createElement('div');
    item.className = `route-item ${isMyVote ? 'my-vote' : ''} ${isDead ? 'disabled' : ''}`;
    item.innerHTML = `
      <div class="route-vote-badge">🗳️ ${votes} 票</div>
      <div class="route-icon">${route.icon || '🧭'}</div>
      <div class="route-name">${route.name}</div>
      <div class="route-sub">${route.desc}</div>
      ${votersForThisRoute.length > 0 ? `
        <div class="route-voters-tags">
          ${votersForThisRoute.map(name => `<span class="route-voter-tag">${name}</span>`).join('')}
        </div>
      ` : ''}
    `;

    if (!isDead) {
      item.addEventListener('click', () => {
        playSound('click');
        socket.emit('route:vote', { routeId: route.id });
      });
    }
    elements.routeOptionsGrid.appendChild(item);
  });
}

// 3. 渲染事件 (先打字敘述故事，再呈現獎勵機關與倒數)
function renderEvent() {
  const ev = roomState.currentEvent;
  if (!ev) return;

  const evKey = `EV_${roomState.floor}_${ev.type}_${ev.title}`;
  if (eventDoneKey !== evKey) {
    eventDoneKey = evKey;

    if (elements.eventDetails) elements.eventDetails.style.display = 'none';
    const evFooter = document.querySelector('.event-footer');
    if (evFooter) evFooter.style.display = 'none';

    if (elements.eventStoryText && ev.story) {
      elements.eventStoryText.style.display = 'block';
      typeWriterEffect(elements.eventStoryText, ev.story, 18, () => {
        if (elements.eventDetails) {
          elements.eventDetails.style.display = 'block';
          elements.eventDetails.classList.add('narrative-fade');
        }
        if (evFooter) {
          evFooter.style.display = 'block';
          evFooter.classList.add('narrative-fade');
        }
      });
    } else {
      if (elements.eventDetails) elements.eventDetails.style.display = 'block';
      if (evFooter) evFooter.style.display = 'block';
    }
  }

  if (ev.type === 'treasure') {
    elements.eventIcon.textContent = '🎁';
    elements.eventTitle.textContent = ev.title;
    elements.eventDetails.innerHTML = `
      <p style="color: #15803d; font-weight: 700; margin-bottom: 8px;">
        🧪 治癒泉水：全體存活隊友回復 <strong>${ev.healAmt}</strong> 點生命值！
      </p>
      <p style="color: #b45309; font-weight: 700;">
        💎 發現裝備：【${ev.drop.name}】
      </p>
      <p style="color: #334155; font-size: 0.95rem; margin-top: 6px;">
        • 裝備效果：${ev.drop.desc}<br>
        • 獲得者：<strong>${escapeHtml(ev.ownerName)}</strong> 正在抉擇是否穿戴（手動穿脫/替換，上限3件）！
      </p>
    `;
    playSound('heal');
  } else if (ev.type === 'trap') {
    elements.eventIcon.textContent = '⚠️';
    elements.eventTitle.textContent = ev.title;
    elements.eventDetails.innerHTML = `
      <p style="color: #dc2626; font-weight: 700; margin-bottom: 8px;">小隊踩中了地面遠古機關！淬毒暗箭四射！</p>
      <ul style="list-style: none; padding-left: 0; line-height: 1.6; color: #334155;">
        ${(ev.details || []).map(d => `<li>${formatMarkdown(d)}</li>`).join('')}
      </ul>
    `;
    playSound('hit');
  }
}

// 4. 渲染戰鬥畫面 (回合切換時播放清晰冒險者回合字幕)
function renderBattle(me, isLeader) {
  const monster = roomState.currentMonster;
  if (!monster) return;

  elements.battleFloorNum.textContent = roomState.floor;
  elements.battleRoundNum.textContent = roomState.battleRound;

  // 每一回合開始時，以清晰像素字幕呈現冒險者回合
  if (lastAnnouncedBattleRound !== roomState.battleRound) {
    lastAnnouncedBattleRound = roomState.battleRound;
    showCinematicBanner({
      title: `【第 ${roomState.battleRound} 回合・冒險者行動】`,
      subtitle: `ROUND ${roomState.battleRound} · PLAYER PHASE`,
      theme: 'player'
    });
  }

  // 倒數計時
  if (roomState.timerRemaining !== null) {
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
    elements.monsterAvatar.innerHTML = `<img src="${monster.avatar}" class="monster-avatar-img" alt="${escapeHtml(monster.name)}">`;
  } else {
    elements.monsterAvatar.textContent = '👾';
  }

  // 抗性標籤
  if (monster.resistance === 'phys') {
    elements.monsterResTag.className = 'res-tag res-phys';
    elements.monsterResTag.textContent = '🛡️ 物理抗性 (-70%)';
  } else if (monster.resistance === 'mag') {
    elements.monsterResTag.className = 'res-tag res-mag';
    elements.monsterResTag.textContent = '🔮 魔法抗性 (-70%)';
  } else {
    elements.monsterResTag.className = 'res-tag res-none';
    elements.monsterResTag.textContent = '⚪ 無抗性';
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

  // 怪物劇毒狀態提示
  if (elements.monsterBuffsRow) {
    let buffHtml = '';
    if (monster.poisonTurns > 0) {
      buffHtml += `<span class="buff-badge tag-poison">🧪 劇毒 (${monster.poisonTurns} 回合 / 每回合-3)</span>`;
    }
    elements.monsterBuffsRow.innerHTML = buffHtml;
  }

  // 護盾與隊伍增益提示
  const activeShieldBadges = [];
  if (roomState.warriorShieldTurn === 1) {
    activeShieldBadges.push('🛡️ 壁壘守護：第1回合阻擋90%傷害！');
  } else if (roomState.warriorShieldTurn === 2) {
    activeShieldBadges.push('🛡️ 壁壘守護：第2回合阻擋40%傷害！');
  }
  if (roomState.alcShieldTurns > 0) {
    activeShieldBadges.push(`⚗️ 命運護盾：持續 ${roomState.alcShieldTurns} 回合阻擋 70% 傷害！`);
  }
  if (roomState.alcVulnerableTurns > 0) {
    activeShieldBadges.push(`⚠️ 試劑反噬：本回合受傷增加 20%！`);
  } else if (roomState.alcVulnerableNextTurn) {
    activeShieldBadges.push('⚠️ 試劑反噬：下回合受傷增加 20%！');
  }

  if (activeShieldBadges.length > 0) {
    elements.shieldNoticeBadge.classList.remove('hidden');
    elements.shieldNoticeBadge.textContent = activeShieldBadges.join(' | ');
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
    const roleInfo = classesData[p.role] || { emoji: '👤', name: '勇者' };
    const isDead = p.hp <= 0;
    const hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));

    let hpClass = '';
    if (hpPct < 30) hpClass = 'low';
    else if (hpPct < 60) hpClass = 'mid';

    // 狀態標籤
    const tags = [];
    if (isDead) tags.push('<span class="status-tag tag-dead">🪦 陣亡</span>');
    if (p.bleedTurns > 0) tags.push(`<span class="status-tag tag-bleed">🩸 撕裂x${p.bleedTurns}</span>`);
    if (p.poisonTurns > 0) tags.push(`<span class="status-tag tag-poison">🧪 中毒x${p.poisonTurns}</span>`);
    if (p.stunnedNextTurn) tags.push('<span class="status-tag tag-stun">💫 脫力</span>');
    if (p.warriorVulnerableTurns > 0) tags.push('<span class="status-tag tag-vuln">⚠️ 斬擊失衡受傷+20%</span>');
    if (p.archerNoDodgeTurns > 0) tags.push('<span class="status-tag tag-stun">🏹 箭矢脫靶失閃(0%)</span>');
    if (p.isSurrendered) tags.push('<span class="status-tag tag-surrender">🐺 臣服中</span>');
    if (p.isStealthed) tags.push('<span class="status-tag tag-stealth">💨 匿蹤</span>');
    if (p.druidForm === 'werewolf') tags.push(`<span class="status-tag tag-wolf">🐺 狼人(${p.druidFormTurns}R)</span>`);
    if (p.druidForm === 'treant') tags.push(`<span class="status-tag tag-treant">🌳 樹精(${p.druidFormTurns}R)</span>`);
    if (p.druidForm === 'tree') tags.push(`<span class="status-tag tag-treant">🪵 古樹(${p.druidFormTurns}R)</span>`);
    if (p.alcAcidEquipHalvedTurns > 0) tags.push(`<span class="status-tag tag-vuln">⚗️ 裝備減半(${p.alcAcidEquipHalvedTurns}R)</span>`);
    if (roomState.alcShieldTurns > 0) tags.push('<span class="status-tag tag-shield">🛡️ 命運護盾(-70%)</span>');
    if (roomState.alcVulnerableTurns > 0) tags.push('<span class="status-tag tag-vuln">⚠️ 試劑反噬(+20%)</span>');
    else if (roomState.alcVulnerableNextTurn) tags.push('<span class="status-tag tag-vuln">⚠️ 下回合易傷(+20%)</span>');

    // 裝備列表 (清晰呈現 [裝備 X/3]: 裝備1, 裝備2)
    const pEquips = p.equips || [];
    const equipCount = pEquips.length;
    const equipNames = equipCount > 0 ? pEquips.map(e => e.name).join(', ') : '無';

    const card = document.createElement('div');
    card.className = `teammate-card ${isThisMe ? 'is-me' : ''} ${isDead ? 'is-dead' : ''}`;
    card.setAttribute('data-player-id', p.id);
    card.innerHTML = `
      <div class="floating-text-container"></div>
      <div class="teammate-top">
        <span class="teammate-name-group">
          ${getPlayerAvatarHtml(p, 'teammate-avatar-img')}
          <span>${escapeHtml(p.name)}</span>
          ${isThisMe ? '<span style="color:#2563eb; font-weight: 700;">(你)</span>' : ''}
        </span>
        <span class="action-status-dot ${p.hasActed || isDead || p.stunnedNextTurn || p.isSurrendered || p.druidForm === 'tree' ? 'ready' : 'waiting'}">
          ${isDead ? '陣亡' : (p.isSurrendered ? '臣服' : (p.druidForm === 'tree' ? '休眠' : (p.stunnedNextTurn ? '虛弱' : (p.hasActed ? '✓ 就緒' : '⏳ 思考'))))}
        </span>
      </div>
      <div class="teammate-hp-bg">
        <div class="teammate-hp-fill ${hpClass}" style="width: ${hpPct}%;"></div>
      </div>
      <div class="teammate-stats-sub">
        <span>❤️ ${p.hp}/${p.maxHp}</span>
        <span>+${p.bonusAtk} 攻</span>
      </div>
      <div class="teammate-tags">${tags.join('')}</div>
      <div class="equip-list" title="${escapeHtml(equipNames)}">🎒 [裝備 ${equipCount}/3]: ${escapeHtml(equipNames)}</div>
    `;
    elements.battleTeammatesGrid.appendChild(card);

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

      minionCard.innerHTML = `
        <div class="floating-text-container"></div>
        <div class="teammate-top">
          <span class="teammate-name-group">
            <span style="font-size: 18px;">🐾</span>
            <span>${escapeHtml(p.name)}的僕從</span>
            <button type="button" class="minion-count-badge" data-owner-id="${p.id}" title="點擊查看僕從詳細資訊">(${p.minions.length}/3)</button>
          </span>
        </div>
        <div class="teammate-hp-bg">
          <div class="teammate-hp-fill" style="width: ${totalHpPct}%;"></div>
        </div>
        <div class="teammate-stats-sub">
          <span>❤️ ${totalHp}/${totalMaxHp}</span>
          <span>⚔️ ${totalAtk} 攻</span>
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
    stanceHtml += ` <span class="badge-form-wolf">🐺 狼人形態 (+20傷，剩餘${me.druidFormTurns}R)</span>`;
  } else if (me.druidForm === 'treant') {
    stanceHtml += ` <span class="badge-form-treant">🌳 樹精形態 (+100HP/減傷20%/自癒5HP/替全隊吸收50%，剩餘${me.druidFormTurns}R)</span>`;
  } else if (me.druidForm === 'tree') {
    stanceHtml += ` <span class="badge-form-treant">🪵 古樹休眠 (無法行動，剩餘${me.druidFormTurns}R)</span>`;
  }
  if (me.minion) {
    stanceHtml += ` <span class="badge-minion">🐾 僕從: ${escapeHtml(me.minion.name)} (❤️ ${me.minion.hp}/${me.minion.maxHp} | ⚔️ ${me.minion.atk})</span>`;
  }

  elements.myHpSummary.innerHTML = `HP: ${me.hp}/${me.maxHp}${stanceHtml}`;
  elements.myAtkSummary.textContent = `+${me.bonusAtk} 攻`;

  // 玩家當前裝備列表 [裝備 X/3]
  const myEquips = me.equips || [];
  const myEquipCount = myEquips.length;
  if (elements.myEquipsSummary) {
    if (myEquipCount === 0) {
      elements.myEquipsSummary.innerHTML = `🎒 [裝備 0/3]: 無`;
    } else {
      const itemsHtml = myEquips.map((e, idx) => 
        `<span class="equip-pill">${escapeHtml(e.name)}<button type="button" class="unequip-btn" data-equip-index="${idx}" title="卸下裝備">卸下</button></span>`
      ).join(', ');
      elements.myEquipsSummary.innerHTML = `🎒 [裝備 ${myEquipCount}/3]: ${itemsHtml}`;

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
  const isNarrating = Boolean(roomState.isNarrating || isPlayingBattleNarrative);

  // 狀態提醒
  if (isDead) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '🪦 你已倒地陣亡，等待奇蹟甦生...';
    elements.mySkillsRow.innerHTML = '<div style="color:#dc2626; font-weight: 600; padding: 10px;">你已倒下，本回合無法行動。</div>';
    return;
  }

  if (isSurrendered) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '🐺 你陷入【暗影魔狼族長】的血脈壓制臣服狀態，無法行動！';
    elements.mySkillsRow.innerHTML = '<div style="color:#b45309; font-weight: 700; padding: 12px; font-size: 1rem;">👑🐺 源自靈魂深處的始祖狼王威壓讓你跪地臣服，全身無法動彈，直到暗影魔狼族長倒下！</div>';
    return;
  }

  if (isTree) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '🪵 你受到致命傷化為古樹休眠中，本回合無法行動...';
    elements.mySkillsRow.innerHTML = '<div style="color:#16a34a; font-weight: 700; padding: 12px; font-size: 1rem;">🪵 沉睡古樹休眠中，正在凝聚自然生機，本回合無法行動！</div>';
    return;
  }

  if (isStunned) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '💫 你處於脫力虛弱狀態，正在喘息休息...';
    elements.mySkillsRow.innerHTML = '<div style="color:#b45309; font-weight: 600; padding: 10px;">脫力後遺症中，本回合無法行動。</div>';
    return;
  }

  if (isNarrating) {
    elements.myActionStatus.className = 'action-status-badge narrating';
    elements.myActionStatus.textContent = '📜 雙方戰況交鋒敘述中... (請觀看戰況)';
  } else if (me.hasActed) {
    elements.myActionStatus.className = 'action-status-badge submitted';
    elements.myActionStatus.textContent = '✅ 已指定行動！等待全體隊友中... (可更換)';
  } else {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '請點擊指定本回合施放行動：';
  }

  elements.mySkillsRow.innerHTML = '';

  // 渲染自身所有技能（支援雙手劍替換狂怒重劈與精靈木提琴替換催眠夜曲/狂亂殺戮曲）
  const activeSkills = (me.availableSkills && me.availableSkills.length > 0) ? me.availableSkills : roleConfig.skills;

  activeSkills.forEach(skill => {
    let cd = me.cooldowns[skill.id] || 0;
    let isCoolingDown = cd > 0;
    let cdBadgeText = `CD: ${cd}`;

    // 德魯伊形態轉變：若處於變身期間，顯示剩餘回合且無法再次變身
    if (skill.id === 'dru_transform' && me.druidFormTurns > 0) {
      isCoolingDown = true;
      cdBadgeText = `變身中 (${me.druidFormTurns}R)`;
    }

    // 德魯伊僕從召喚：召喚物技能無 CD，但最高召喚 3 隻
    if (skill.id === 'dru_summon_treant' || skill.id === 'dru_summon_wolf') {
      const minionCount = (me.minions || []).length;
      if (minionCount >= 3) {
        isCoolingDown = true;
        cdBadgeText = '僕從已滿(3/3)';
      }
    }

    let skillDesc = skill.desc;
    if (me.role === 'alchemist' && skill.id === 'alc_fate') {
      const hasDebuff = (me.bleedTurns > 0 || (me.poisonTurns || 0) > 0 || me.stunnedNextTurn || me.isSurrendered || me.cannotCrit);
      const hasBurette = (me.equips || []).some(e => e.id === 'alc_burette' || e.name === '精密滴定管' || e.name === '精密滴管');
      if (!hasDebuff) {
        skillDesc = '🌿【身無異常·溫和調和】為全員穩定回復 15 點生命（無反噬風險，CD 2）';
      } else {
        const failRateTxt = hasBurette ? '35%大成功 / 65%失敗(滴管加成)' : '50%大成功 / 50%失敗';
        skillDesc = `⚠️【身負異常·命運煉成】驅散負面效果。${failRateTxt}（大成功：全員回血40+2回合70%減傷；失敗：全員回血10+下回合全隊受傷+20%）（CD 2）`;
      }
    }

    const isSelected = (currentPendingAction === skill.id);

    const btn = document.createElement('button');
    btn.className = `skill-btn ${isSelected ? 'selected' : ''}`;
    btn.disabled = isCoolingDown || isNarrating;

    btn.innerHTML = `
      <div class="skill-btn-title">
        <span>${skill.label}</span>
        ${isCoolingDown ? `<span class="skill-cd-badge">${cdBadgeText}</span>` : ''}
      </div>
      <div class="skill-btn-desc">${skillDesc}</div>
    `;

    btn.addEventListener('click', () => {
      handleSkillClick(skill.id, me);
    });

    elements.mySkillsRow.appendChild(btn);
  });

  // 吟遊詩人專屬：當有隊友倒地時，動態顯示「甦生之歌」
  if (me.role === 'bard') {
    const deadPlayers = roomState.players.filter(p => p.hp <= 0);
    if (deadPlayers.length > 0) {
      const reviveBtn = document.createElement('button');
      reviveBtn.className = 'skill-btn skill-revive-btn';
      reviveBtn.disabled = isNarrating;
      reviveBtn.innerHTML = `
        <div class="skill-btn-title">
          <span>🕊️ 甦生之歌 (復活)</span>
          <span style="color:#b45309; font-weight:700; font-size:0.75rem;">奇蹟</span>
        </div>
        <div class="skill-btn-desc">喚醒一名倒地隊友(恢復35%生命)，下回合雙方脫力無法行動！</div>
      `;

      reviveBtn.addEventListener('click', () => {
        if (roomState?.isNarrating || isPlayingBattleNarrative) return;
        openTargetModal('revive', deadPlayers);
      });

      elements.mySkillsRow.appendChild(reviveBtn);
    }
  }

  // 跳過回合按鈕
  const skipBtn = document.createElement('button');
  skipBtn.className = `skill-btn ${currentPendingAction === 'skip' ? 'selected' : ''}`;
  skipBtn.disabled = isNarrating;
  skipBtn.innerHTML = `
    <div class="skill-btn-title">
      <span>⏭️ 跳過回合</span>
    </div>
    <div class="skill-btn-desc">本回合放棄行動，保留技能冷卻。</div>
  `;

  skipBtn.addEventListener('click', () => {
    if (roomState?.isNarrating || isPlayingBattleNarrative) return;
    currentPendingAction = 'skip';
    playSound('click');
    socket.emit('battle:action', { actionId: 'skip' });
  });

  elements.mySkillsRow.appendChild(skipBtn);
}

// 點擊技能觸發
function handleSkillClick(actionId, me) {
  if (roomState?.isNarrating || isPlayingBattleNarrative) return;
  // 吟遊詩人治癒頌歌：若有多位活著隊友，彈出目標選擇
  if (me.role === 'bard' && actionId === 'b_heal') {
    const alivePlayers = roomState.players.filter(p => p.hp > 0);
    if (alivePlayers.length > 1) {
      openTargetModal('heal', alivePlayers);
      return;
    }
  }

  currentPendingAction = actionId;
  playSound(actionId === 'basic' ? 'hit' : 'magic');
  socket.emit('battle:action', { actionId });
}

// 目標選擇 Modal (治癒額外目標 / 甦生之歌目標)
function openTargetModal(type, targetList) {
  elements.targetModal.classList.remove('hidden');
  elements.targetModalList.innerHTML = '';

  if (type === 'heal') {
    elements.targetModalTitle.textContent = '🪕【治癒頌歌】專注目標';
    elements.targetModalDesc.textContent = '全隊將獲得群療，請指定一名隊友額外獲得專注回復：';
  } else if (type === 'revive') {
    elements.targetModalTitle.textContent = '🕊️【甦生之歌】奇蹟喚醒';
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
      <span style="font-size:0.85rem; color:#475569; font-weight: 600;">${p.hp > 0 ? `❤️ ${p.hp}/${p.maxHp}` : '🪦 倒地'}</span>
    `;

    btn.addEventListener('click', () => {
      elements.targetModal.classList.add('hidden');
      playSound(type === 'heal' ? 'heal' : 'magic');
      if (type === 'heal') {
        currentPendingAction = 'b_heal';
        socket.emit('battle:action', { actionId: 'b_heal', targetPlayerId: p.id });
      } else if (type === 'revive') {
        currentPendingAction = 'b_revive';
        socket.emit('battle:action', { actionId: 'b_revive', targetPlayerId: p.id });
      }
    });

    elements.targetModalList.appendChild(btn);
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
    elements.minionDetailTitle.innerHTML = `🐾 <span>${escapeHtml(player.name)} 的僕從隊伍 (${player.minions.length}/3)</span>`;
  }
  if (elements.minionDetailSubtitle) {
    elements.minionDetailSubtitle.textContent = `合計生命 ❤️ ${totalHp}/${totalMaxHp} · 合計攻擊力 ⚔️ ${totalAtk} 點`;
  }

  if (elements.minionDetailList) {
    elements.minionDetailList.innerHTML = player.minions.map((m, idx) => {
      const mHpPct = Math.max(0, Math.min(100, Math.round((m.hp / m.maxHp) * 100)));
      const isWolf = m.type === 'wolf';
      const icon = isWolf ? '🐺' : '🌱';
      const typeBadge = isWolf ? '<span class="minion-detail-badge wolf">🐺 幼狼</span>' : '<span class="minion-detail-badge">🌱 小樹精</span>';
      const desc = isWolf 
        ? '🐾 <strong>每回合自動攻擊 10 點傷害</strong>，並優先替全體隊友吸收怪物的彈射傷害。' 
        : '🌱 <strong>每回合自動攻擊 1 點傷害</strong>，並優先替全體隊友吸收怪物的彈射傷害。';

      return `
        <div class="minion-detail-item">
          <div class="minion-detail-item-header">
            <span class="name">${icon} <strong>${escapeHtml(m.name)} #${idx + 1}</strong></span>
            ${typeBadge}
          </div>
          <div class="teammate-hp-bg" style="margin: 6px 0;">
            <div class="teammate-hp-fill" style="width: ${mHpPct}%;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #166534;">
            <span>❤️ 生命：${m.hp} / ${m.maxHp} (${mHpPct}%)</span>
            <span>⚔️ 攻擊力：${m.atk} 攻</span>
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
    elements.endIcon.textContent = '🏳️';
    elements.endSubtitle.textContent = `小隊於深淵第 ${roomState.floor} 層中途結束，未能抵達第 5 層休息站，挑戰失敗！`;
  } else {
    elements.endIcon.textContent = '💀';
    elements.endSubtitle.textContent = `小隊全員在深淵第 ${roomState.floor} 層壯烈倒下，未能成功突破，挑戰失敗！`;
  }
  elements.btnRestartLobby.style.display = isLeader ? 'inline-flex' : 'none';
  playSound('gameover');
}

function renderVictory(isLeader) {
  elements.endIcon.textContent = '🏆';
  elements.endTitle.textContent = '榮耀凱旋歸來！';
  elements.endSubtitle.textContent = `小隊成功突破至深淵第 ${roomState.floor} 層並滿載而歸！勇者威名永垂不朽！`;
  elements.btnRestartLobby.style.display = isLeader ? 'inline-flex' : 'none';
  playSound('victory');
}

// 7. 日誌渲染與自動滾動
function renderLogs() {
  if (!roomState || !roomState.logs) return;
  elements.combatLogWindow.innerHTML = '';
  roomState.logs.forEach(log => {
    const line = document.createElement('div');
    line.className = `log-line ${log.type || 'info'}`;
    line.innerHTML = `[${log.time}] ${formatMarkdown(log.text)}`;
    elements.combatLogWindow.appendChild(line);
  });
  elements.combatLogWindow.scrollTop = elements.combatLogWindow.scrollHeight;
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

// 跳過開場劇情 (立即踏入深淵)
if (elements.btnSkipPrologue) {
  elements.btnSkipPrologue.addEventListener('click', () => {
    playSound('click');
    socket.emit('prologue:next');
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
    elements.chatBubbleSender.textContent = `💬 ${escapeHtml(senderName)}`;
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
      const isCollapsed = elements.battleLogCard.classList.toggle('collapsed');
      elements.btnToggleLog.textContent = isCollapsed ? '展開' : '折疊';
    }
  });
}

// 點擊聊天室外部收起聊天視窗
document.addEventListener('click', (e) => {
  if (isChatOpen && elements.chatPopupCard && elements.floatingChatBtn) {
    if (!elements.chatPopupCard.contains(e.target) && !elements.floatingChatBtn.contains(e.target)) {
      toggleChat(false);
    }
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

function triggerSlashOnMonster(isCrit = false) {
  if (elements.monsterSlashOverlay) {
    elements.monsterSlashOverlay.classList.remove('active');
    void elements.monsterSlashOverlay.offsetWidth;
    elements.monsterSlashOverlay.classList.add('active');
  }
  if (elements.monsterAvatar) {
    elements.monsterAvatar.classList.remove('shaking');
    void elements.monsterAvatar.offsetWidth;
    elements.monsterAvatar.classList.add('shaking');
    setTimeout(() => elements.monsterAvatar.classList.remove('shaking'), 400);
  }
}

function triggerMagicOnMonster() {
  if (elements.monsterMagicOverlay) {
    elements.monsterMagicOverlay.classList.remove('active');
    void elements.monsterMagicOverlay.offsetWidth;
    elements.monsterMagicOverlay.classList.add('active');
  }
  if (elements.monsterAvatar) {
    elements.monsterAvatar.classList.remove('shaking');
    void elements.monsterAvatar.offsetWidth;
    elements.monsterAvatar.classList.add('shaking');
    setTimeout(() => elements.monsterAvatar.classList.remove('shaking'), 400);
  }
}

function triggerHealOnTeammate(playerId, value) {
  const card = document.querySelector(`.teammate-card[data-player-id="${playerId}"]`);
  if (!card) return;
  card.classList.remove('heal-flash');
  void card.offsetWidth;
  card.classList.add('heal-flash');
  setTimeout(() => card.classList.remove('heal-flash'), 700);

  const container = card.querySelector('.floating-text-container');
  spawnFloatingText(container, `+${value}`, 'heal');
}

function triggerShieldOnTeam(label = '🛡️ 壁壘守護 90%!') {
  const cards = document.querySelectorAll('.teammate-card');
  cards.forEach(card => {
    card.classList.remove('shield-flash');
    void card.offsetWidth;
    card.classList.add('shield-flash');
    setTimeout(() => card.classList.remove('shield-flash'), 800);

    const container = card.querySelector('.floating-text-container');
    spawnFloatingText(container, label, 'shield');
  });
}

function triggerHitOnTeammate(playerId, value, dodged = false, stealthed = false, shieldMod = 1.0) {
  const card = document.querySelector(`.teammate-card[data-player-id="${playerId}"]`);
  if (!card) return;
  const container = card.querySelector('.floating-text-container');

  if (stealthed) {
    spawnFloatingText(container, '💨 匿蹤避開', 'dodge');
    return;
  }
  if (dodged) {
    spawnFloatingText(container, '🪶 閃避 MISS!', 'dodge');
    return;
  }

  card.classList.remove('hit-flash', 'shaking');
  void card.offsetWidth;
  card.classList.add('hit-flash', 'shaking');
  setTimeout(() => card.classList.remove('hit-flash', 'shaking'), 400);

  if (value > 0) {
    spawnFloatingText(container, `-${value}`, 'damage');
  }
}

// 輔助函式：播放單一玩家行動的打擊特效
function playSinglePlayerVisualEvent(ev) {
  if (!ev) return;
  if (ev.type === 'player_attack') {
    if (ev.dmgType === 'phys') {
      triggerSlashOnMonster(ev.isCrit);
      playSound('hit');
      if (ev.isCrit) {
        spawnFloatingText(elements.monsterFloatingContainer, `CRIT -${ev.value}!`, 'crit');
      } else {
        spawnFloatingText(elements.monsterFloatingContainer, `-${ev.value}`, 'damage');
      }
    } else {
      triggerMagicOnMonster();
      playSound('magic');
      spawnFloatingText(elements.monsterFloatingContainer, `-${ev.value}`, 'damage');
    }
  } else if (ev.type === 'shield_cast') {
    triggerShieldOnTeam('🛡️ 築起壁壘守護！');
    playSound('click');
  } else if (ev.type === 'stealth') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), '💨 煙霧匿蹤', 'dodge');
  } else if (ev.type === 'heal_group') {
    playSound('heal');
    roomState?.players?.forEach(p => {
      if (p.hp > 0) {
        let totalHeal = ev.groupValue;
        if (p.id === ev.singleTargetId) totalHeal += ev.singleValue;
        triggerHealOnTeammate(p.id, totalHeal);
      }
    });
  } else if (ev.type === 'revive') {
    playSound('heal');
    triggerHealOnTeammate(ev.targetId, ev.value);
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.targetId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), `🕊️ 甦生 +${ev.value}!`, 'heal');
  } else if (ev.type === 'heal') {
    triggerHealOnTeammate(ev.targetId, ev.value);
    playSound('heal');
  } else if (ev.type === 'self_damage') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.targetId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), `自傷 -${ev.value}`, 'damage');
  } else if (ev.type === 'alc_shield') {
    triggerShieldOnTeam('🛡️ 命運護盾 70%減傷！');
    playSound('heal');
  } else if (ev.type === 'transform_wolf') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), '🐺 變身狼人!', 'buff');
    playSound('hit');
  } else if (ev.type === 'transform_treant') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), '🌳 變身樹精!', 'heal');
    playSound('heal');
  } else if (ev.type === 'transform_tree') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), '🪵 化身古樹(免死)!', 'heal');
    playSound('heal');
  } else if (ev.type === 'surrender') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.targetId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), '🐺 狼王威壓·臣服!', 'dodge');
  } else if (ev.type === 'summon_minion') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), `🐾 召喚${ev.minionName}!`, 'buff');
    playSound('magic');
  } else if (ev.type === 'minion_hit') {
    const card = document.querySelector(`.teammate-card-minion[data-minion-owner-id="${ev.ownerId}"]`) || document.querySelector(`.teammate-card[data-player-id="${ev.ownerId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), `🐾 僕從抵擋 -${ev.value}`, 'shield');
  }
}

// 輔助函式：播放怪物攻擊視覺事件
function playMonsterVisualEvent(monsterAction) {
  if (!monsterAction) return;
  if (elements.monsterCard) {
    elements.monsterCard.classList.add('shaking');
    setTimeout(() => elements.monsterCard.classList.remove('shaking'), 450);
  }

  // 如果有護盾阻擋，先閃出金色盾牌
  if (monsterAction.shieldMod < 1.0) {
    const shieldText = monsterAction.shieldMod === 0.1 ? '🛡️ 90% 傷害格擋！' : '🛡️ 40% 傷害格擋！';
    triggerShieldOnTeam(shieldText);
  }

  let hadDamage = false;
  (monsterAction.hits || []).forEach(hit => {
    triggerHitOnTeammate(hit.targetId, hit.value, hit.dodged, hit.stealthed, monsterAction.shieldMod);
    if (hit.value > 0) hadDamage = true;
  });

  if (hadDamage) {
    playSound('hit');
  }
}

// 監聽後端結算的戰鬥視覺事件與戰況交鋒敘述
socket.on('battle:visual_events', ({ events, narratives, round, monsterKilled, duration }) => {
  if (!events || events.length === 0) return;

  // 1. 回合初流血與劇毒傷害
  events.filter(e => e.type === 'bleed').forEach(e => {
    const card = document.querySelector(`.teammate-card[data-player-id="${e.target}"]`);
    if (card) {
      const container = card.querySelector('.floating-text-container');
      spawnFloatingText(container, `🩸 -${e.value}`, 'damage');
    }
  });

  events.filter(e => e.type === 'poison_damage').forEach(e => {
    if (e.target === 'monster') {
      spawnFloatingText(elements.monsterFloatingContainer, `🧪 -${e.value}`, 'poison');
    } else {
      const card = document.querySelector(`.teammate-card[data-player-id="${e.target}"]`);
      if (card) {
        const container = card.querySelector('.floating-text-container');
        spawnFloatingText(container, `🧪 -${e.value}`, 'poison');
      }
    }
  });

  // 2. 詩人增傷協奏
  if (events.some(e => e.type === 'bard_buff')) {
    triggerShieldOnTeam('🪕 狂熱協奏 50%增傷');
  }

  const playerActions = events.filter(e =>
    ['player_attack', 'shield_cast', 'stealth', 'heal_group', 'revive', 'heal', 'self_damage', 'alc_shield', 'transform_wolf', 'transform_treant', 'transform_tree', 'surrender', 'summon_minion', 'minion_hit'].includes(e.type)
  );
  const monsterAction = events.find(e => e.type === 'monster_attack');

  // 若有後端傳來的精彩交鋒文字敘述 (narratives)
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
    let announcedBossBanner = false;
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
          if (ev) {
            playSinglePlayerVisualEvent(ev);
          }
        } else if (nar.type === 'monster') {
          if (!announcedBossBanner) {
            announcedBossBanner = true;
            showCinematicBanner({
              title: '【首領反擊・敵方行動】',
              subtitle: `ROUND ${round || roomState?.battleRound || 1} · BOSS PHASE`,
              theme: 'boss'
            });
          }
          if (monsterAction) {
            playMonsterVisualEvent(monsterAction);
          }
        } else if (nar.type === 'kill') {
          playSound('victory');
          spawnFloatingText(elements.monsterFloatingContainer, '💀 擊殺！VICTORY', 'crit');
          if (elements.monsterAvatar) {
            elements.monsterAvatar.classList.add('shaking');
            setTimeout(() => elements.monsterAvatar.classList.remove('shaking'), 500);
          }
        }
      }, idx * stepMs);
    });

    // 敘述結束後，解鎖操作並重整按鈕狀態
    setTimeout(() => {
      isPlayingBattleNarrative = false;
      const meNow = getMyPlayer();
      if (meNow) renderMyActionBar(meNow);
    }, totalMs);

  } else {
    // 舊版快速動畫（Fallback）
    playerActions.forEach((ev, idx) => {
      setTimeout(() => {
        playSinglePlayerVisualEvent(ev);
      }, idx * 280);
    });

    const monsterDelay = Math.max(500, playerActions.length * 280 + 350);
    setTimeout(() => {
      if (monsterAction) {
        showCinematicBanner({
          title: '【首領反擊・敵方行動】',
          subtitle: `ROUND ${round || roomState?.battleRound || 1} · BOSS PHASE`,
          theme: 'boss'
        });
      }

      if (monsterKilled) {
        playSound('victory');
        spawnFloatingText(elements.monsterFloatingContainer, '💀 擊殺！VICTORY', 'crit');
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
    elements.entryAvatarPreview.innerHTML = '👤';
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
      elements.modalAvatarTypeLabel.textContent = `已選擇：Emoji【${avatar}】`;
    }
  } else {
    // 官方職業頭貼 (依玩家所選職業決定)
    if (roleInfo && roleInfo.avatar) {
      elements.modalAvatarPreview.innerHTML = `<img src="${roleInfo.avatar}" alt="${roleInfo.name}">`;
      elements.modalAvatarTypeLabel.textContent = `職業專屬頭貼【${roleInfo.name}】`;
    } else if (roleInfo && roleInfo.emoji) {
      elements.modalAvatarPreview.innerHTML = `<span style="font-size:32px;">${roleInfo.emoji}</span>`;
      elements.modalAvatarTypeLabel.textContent = `職業專屬頭貼【${roleInfo.name}】`;
    } else {
      elements.modalAvatarPreview.innerHTML = '👤';
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
      elements.heroRoleOptionPreview.innerHTML = roleInfo.emoji || '👤';
    }
    elements.heroRoleOptionTitle.textContent = `職業官方立繪：${roleInfo.name}`;
    elements.heroRoleOptionDesc.textContent = `使用【${roleInfo.name}】官方頭貼。若更換職業將自動同步切換！`;
  } else {
    elements.heroRoleOptionPreview.innerHTML = '👤';
    elements.heroRoleOptionTitle.textContent = '職業官方專屬頭貼';
    elements.heroRoleOptionDesc.textContent = '自動隨你選擇的職業切換專屬立繪頭像（請至大廳挑選職業）';
  }

  if (pendingAvatar === null) {
    elements.heroRoleOptionCard.classList.add('selected');
    if (elements.heroRoleOptionBadge) elements.heroRoleOptionBadge.textContent = '✓ 目前選用中';
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
