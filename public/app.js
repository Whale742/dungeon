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

  // Views
  views: {
    entry: document.getElementById('viewEntry'),
    lobby: document.getElementById('viewLobby'),
    route: document.getElementById('viewRoute'),
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
  routeDiffPercent: document.getElementById('routeDiffPercent'),
  routeTimerProgress: document.getElementById('routeTimerProgress'),
  routeTimerText: document.getElementById('routeTimerText'),
  routeStatusText: document.getElementById('routeStatusText'),
  routeOptionsGrid: document.getElementById('routeOptionsGrid'),

  // Event
  eventIcon: document.getElementById('eventIcon'),
  eventTitle: document.getElementById('eventTitle'),
  eventDetails: document.getElementById('eventDetails'),

  // Battle
  battleFloorNum: document.getElementById('battleFloorNum'),
  battleRoundNum: document.getElementById('battleRoundNum'),
  battleTimerCount: document.getElementById('battleTimerCount'),
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
  myActionStatus: document.getElementById('myActionStatus'),
  mySkillsRow: document.getElementById('mySkillsRow'),

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

  // Logs & Chat
  combatLogSection: document.getElementById('combatLogSection'),
  combatLogWindow: document.getElementById('combatLogWindow'),
  chatInput: document.getElementById('chatInput'),
  btnSendChat: document.getElementById('btnSendChat'),
  btnClearLog: document.getElementById('btnClearLog'),
  btnToggleLog: document.getElementById('btnToggleLog'),

  // Modal
  targetModal: document.getElementById('targetModal'),
  targetModalTitle: document.getElementById('targetModalTitle'),
  targetModalDesc: document.getElementById('targetModalDesc'),
  targetModalList: document.getElementById('targetModalList'),
  btnCancelTarget: document.getElementById('btnCancelTarget'),

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

  // 發起組隊頁面 (entry) 隱藏戰況日誌，進入選角色 (lobby) 及後續頁面時顯示
  if (elements.combatLogSection) {
    if (viewName === 'entry') {
      elements.combatLogSection.classList.add('hidden');
    } else {
      elements.combatLogSection.classList.remove('hidden');
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

  // 根據房間階段切換視圖
  switch (roomState.state) {
    case 'LOBBY':
      switchView('lobby');
      renderLobby(me, isLeader);
      break;

    case 'CHOOSING_ROUTE':
      switchView('route');
      renderRouteChoice(me, isLeader);
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
    // 檢查是否被其他人選走
    const owner = roomState?.players?.find(p => p.role === roleKey);
    const isTakenByOther = owner && owner.id !== myId;
    const isSelectedByMe = myRole === roleKey;

    const card = document.createElement('div');
    card.className = `role-card ${isSelectedByMe ? 'selected' : ''} ${isTakenByOther ? 'disabled' : ''}`;

    let buttonText = '選擇此職業';
    if (isSelectedByMe) buttonText = '✓ 已選擇';
    if (isTakenByOther) buttonText = `🔒 已被 ${owner.name} 選擇`;

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
      </div>
      <button class="btn ${isSelectedByMe ? 'btn-success' : 'btn-primary'} role-card-btn" ${isTakenByOther ? 'disabled' : ''}>
        ${buttonText}
      </button>
    `;

    card.addEventListener('click', () => {
      if (isTakenByOther) return;
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

// 2. 渲染路線分歧
function renderRouteChoice(me, isLeader) {
  elements.routeFloorNum.textContent = roomState.floor;
  elements.routeDiffPercent.textContent = Math.round((roomState.floor - 1) * 5);

  if (isLeader) {
    elements.routeStatusText.innerHTML = '👑 <strong>請隊長點擊下方卡片決定小隊前進路線：</strong>';
  } else {
    elements.routeStatusText.innerHTML = '⏳ <strong>隊長正在深思前進路線... 請稍候</strong>';
  }

  // 倒數計時
  if (roomState.timerRemaining !== null) {
    elements.routeTimerText.textContent = `倒數 ${roomState.timerRemaining} 秒`;
    const pct = Math.max(0, Math.min(100, (roomState.timerRemaining / 30) * 100));
    elements.routeTimerProgress.style.width = `${pct}%`;
  }

  elements.routeOptionsGrid.innerHTML = '';
  const currentRoutes = (roomState.currentRoutes && roomState.currentRoutes.length > 0)
    ? roomState.currentRoutes
    : (routesData && routesData.length > 0 ? routesData.slice(0, 4) : []);

  currentRoutes.forEach(route => {
    const item = document.createElement('div');
    item.className = `route-item ${!isLeader ? 'disabled' : ''}`;
    item.innerHTML = `
      <div class="route-icon">${route.icon || '🧭'}</div>
      <div class="route-name">${route.name}</div>
      <div class="route-sub">${route.desc}</div>
    `;

    if (isLeader) {
      item.addEventListener('click', () => {
        playSound('click');
        socket.emit('route:select', { routeId: route.id });
      });
    }
    elements.routeOptionsGrid.appendChild(item);
  });
}

// 3. 渲染事件 (寶箱 / 陷阱)
function renderEvent() {
  const ev = roomState.currentEvent;
  if (!ev) return;

  if (ev.type === 'treasure') {
    elements.eventIcon.textContent = '🎁';
    elements.eventTitle.textContent = ev.title;
    elements.eventDetails.innerHTML = `
      <p style="color: #15803d; font-weight: 700; margin-bottom: 8px;">
        🧪 治癒藥水：全體存活隊友回復 <strong>${ev.healAmt}</strong> 點生命值！
      </p>
      <p style="color: #b45309; font-weight: 700;">
        💎 獲得裝備：【${ev.drop.name}】
      </p>
      <p style="color: #334155; font-size: 0.95rem; margin-top: 6px;">
        • 裝備效果：${ev.drop.desc}<br>
        • 穿戴者：<strong>${escapeHtml(ev.ownerName)}</strong> 立即裝備上了此道具！
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

// 4. 渲染戰鬥畫面
function renderBattle(me, isLeader) {
  const monster = roomState.currentMonster;
  if (!monster) return;

  elements.battleFloorNum.textContent = roomState.floor;
  elements.battleRoundNum.textContent = roomState.battleRound;

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

  // 戰士護盾提示
  if (roomState.warriorShieldTurn === 1 || roomState.warriorShieldTurn === 2) {
    elements.shieldNoticeBadge.classList.remove('hidden');
    elements.shieldNoticeBadge.textContent = roomState.warriorShieldTurn === 1
      ? '🛡️ 壁壘守護：第1回合阻擋90%傷害！'
      : '🛡️ 壁壘守護：第2回合阻擋40%傷害！';
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
    if (p.stunnedNextTurn) tags.push('<span class="status-tag tag-stun">💫 脫力</span>');
    if (p.isStealthed) tags.push('<span class="status-tag tag-stealth">💨 匿蹤</span>');

    // 裝備列表
    const equipItems = Object.entries(p.equipCounts || {})
      .map(([name, count]) => count > 1 ? `${name} x${count}` : name)
      .join(', ');

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
        <span class="action-status-dot ${p.hasActed || isDead || p.stunnedNextTurn ? 'ready' : 'waiting'}">
          ${isDead ? '陣亡' : (p.stunnedNextTurn ? '虛弱' : (p.hasActed ? '✓ 就緒' : '⏳ 思考'))}
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
      ${equipItems ? `<div class="equip-list" title="${equipItems}">🎒 ${equipItems}</div>` : ''}
    `;
    elements.battleTeammatesGrid.appendChild(card);
  });
}

// 玩家專屬技能列
function renderMyActionBar(me) {
  if (!me || !me.role || !classesData[me.role]) return;

  const roleConfig = classesData[me.role];
  elements.myRoleEmoji.innerHTML = getPlayerAvatarHtml(me, 'my-role-avatar-img');
  elements.myRoleName.textContent = roleConfig.name;
  elements.myHpSummary.textContent = `HP: ${me.hp}/${me.maxHp}`;
  elements.myAtkSummary.textContent = `+${me.bonusAtk} 攻`;

  const isDead = me.hp <= 0;
  const isStunned = me.stunnedNextTurn;

  // 狀態提醒
  if (isDead) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '🪦 你已倒地陣亡，等待奇蹟甦生...';
    elements.mySkillsRow.innerHTML = '<div style="color:#dc2626; font-weight: 600; padding: 10px;">你已倒下，本回合無法行動。</div>';
    return;
  }

  if (isStunned) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '💫 你處於脫力虛弱狀態，正在喘息休息...';
    elements.mySkillsRow.innerHTML = '<div style="color:#b45309; font-weight: 600; padding: 10px;">脫力後遺症中，本回合無法行動。</div>';
    return;
  }

  if (me.hasActed) {
    elements.myActionStatus.className = 'action-status-badge submitted';
    elements.myActionStatus.textContent = '✅ 已指定行動！等待全體隊友中... (可更換)';
  } else {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '請點擊指定本回合施放行動：';
  }

  elements.mySkillsRow.innerHTML = '';

  // 渲染自身所有技能
  roleConfig.skills.forEach(skill => {
    const cd = me.cooldowns[skill.id] || 0;
    const isCoolingDown = cd > 0;
    const isSelected = (currentPendingAction === skill.id);

    const btn = document.createElement('button');
    btn.className = `skill-btn ${isSelected ? 'selected' : ''}`;
    btn.disabled = isCoolingDown;

    btn.innerHTML = `
      <div class="skill-btn-title">
        <span>${skill.label}</span>
        ${isCoolingDown ? `<span class="skill-cd-badge">CD: ${cd}</span>` : ''}
      </div>
      <div class="skill-btn-desc">${skill.desc}</div>
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
      reviveBtn.innerHTML = `
        <div class="skill-btn-title">
          <span>🕊️ 甦生之歌 (復活)</span>
          <span style="color:#b45309; font-weight:700; font-size:0.75rem;">奇蹟</span>
        </div>
        <div class="skill-btn-desc">喚醒一名倒地隊友(恢復35%生命)，下回合雙方脫力無法行動！</div>
      `;

      reviveBtn.addEventListener('click', () => {
        openTargetModal('revive', deadPlayers);
      });

      elements.mySkillsRow.appendChild(reviveBtn);
    }
  }

  // 跳過回合按鈕
  const skipBtn = document.createElement('button');
  skipBtn.className = `skill-btn ${currentPendingAction === 'skip' ? 'selected' : ''}`;
  skipBtn.innerHTML = `
    <div class="skill-btn-title">
      <span>⏭️ 跳過回合</span>
    </div>
    <div class="skill-btn-desc">本回合放棄行動，保留技能冷卻。</div>
  `;

  skipBtn.addEventListener('click', () => {
    currentPendingAction = 'skip';
    playSound('click');
    socket.emit('battle:action', { actionId: 'skip' });
  });

  elements.mySkillsRow.appendChild(skipBtn);
}

// 點擊技能觸發
function handleSkillClick(actionId, me) {
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

// 發送小隊聊天
function sendChat() {
  const msg = elements.chatInput.value.trim();
  if (!msg) return;
  socket.emit('chat:send', { message: msg });
  elements.chatInput.value = '';
}

elements.btnSendChat.addEventListener('click', sendChat);
elements.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendChat();
  }
});

// 清空日誌按鈕
elements.btnClearLog.addEventListener('click', () => {
  elements.combatLogWindow.innerHTML = '';
});

// 折疊日誌按鈕
let logCollapsed = false;
elements.btnToggleLog.addEventListener('click', () => {
  logCollapsed = !logCollapsed;
  elements.combatLogWindow.style.display = logCollapsed ? 'none' : 'flex';
  elements.btnToggleLog.textContent = logCollapsed ? '展開' : '折疊';
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

// 監聽後端結算的戰鬥視覺事件
socket.on('battle:visual_events', ({ events, round, monsterKilled }) => {
  if (!events || events.length === 0) return;

  // 1. 回合初流血傷害
  events.filter(e => e.type === 'bleed').forEach(e => {
    const card = document.querySelector(`.teammate-card[data-player-id="${e.target}"]`);
    if (card) {
      const container = card.querySelector('.floating-text-container');
      spawnFloatingText(container, `🩸 -${e.value}`, 'damage');
    }
  });

  // 2. 詩人增傷協奏
  if (events.some(e => e.type === 'bard_buff')) {
    triggerShieldOnTeam('🪕 狂熱協奏 50%增傷');
  }

  // 3. 玩家行動序列 (依序呈現打擊刀光與光芒)
  const playerActions = events.filter(e =>
    ['player_attack', 'shield_cast', 'stealth', 'heal_group', 'revive', 'heal'].includes(e.type)
  );

  playerActions.forEach((ev, idx) => {
    setTimeout(() => {
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
      }
    }, idx * 280);
  });

  // 4. 怪物反擊或勝利擊殺動畫
  const monsterAction = events.find(e => e.type === 'monster_attack');
  const monsterDelay = Math.max(500, playerActions.length * 280 + 350);

  setTimeout(() => {
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
      monsterAction.hits.forEach(hit => {
        triggerHitOnTeammate(hit.targetId, hit.value, hit.dodged, hit.stealthed, monsterAction.shieldMod);
        if (hit.value > 0) hadDamage = true;
      });

      if (hadDamage) {
        playSound('hit');
      }
    }
  }, monsterDelay);
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
