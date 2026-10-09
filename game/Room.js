import { createBossResistances, getBossResistance } from './boss-resistance.js';
import { phase8Methods, p8State, P8_ROLES } from './phase8.js';
import { ASSASSIN_BALANCE, assassinState, getAssassinFollowUpCap, assassinCritRate, isAssassinHidden, addAssassinCritical } from './assassin.js';
// 遊戲房間管理核心 (Game Room Engine)
// 100% 完整移植 index.js 中的戰鬥演算法、職業技能、裝備、怪物抗性與傷害拆分機制

import { SKILL_CATEGORIES, playerStatuses, snapshotTarget, buildActionResults } from './combat-schema.js';
import {
  GAME_BALANCE,
  CLASSES,
  LOOT_TABLE,
  ENCOUNTERS,
  ROUTES,
  getRandomRoutes,
  applyEquipStats,
  removeEquipStats,
  canPlayerEquipItem,
  equipItemToPlayer,
  unequipItemFromPlayer,
  formatPlayerEquips,
  getPlayerSkills,
  STORY_TEXTS,
  ROUTE_STORIES,
  ROUTE_BOSS_STORIES,
  getRouteBossStory,
  BATTLE_NARRATIVES,
  getFloorDifficultyBonusPercent,
  getFloorDifficultyMultiplier,
  getActionPriority,
  rollCrossbowAmmo,
  getCrossbowAmmoLabel,
  getCrossbowAmmoIcon
} from './constants.js';

export class Room {
  constructor(code, leaderSocket, leaderName, io, leaderAvatar = null) {
    this.code = code;
    this.io = io;
    this.leaderId = leaderSocket.id;
    this.memberIds = [leaderSocket.id];
    this.players = {}; // socket.id -> player object
    
    // 遊戲狀態機: 'LOBBY' | 'PROLOGUE' | 'CHOOSING_ROUTE' | 'TRANSITION' | 'EVENT' | 'IN_BATTLE' | 'CHECKPOINT' | 'GAME_OVER' | 'VICTORY'
    this.state = 'LOBBY';
    this.selectionState = 'SELECTING'; // 'ROUND_START' | 'SELECTING' | 'RESOLVING'
    this.floor = 1;
    this.battleCount = 0; // 戰鬥次數計數器
    this.battlesInCurrentCycle = 0; // 每5層保底戰鬥計數器
    this.battleRound = 1;
    this.warriorShieldTurn = 0;
    this.alcShieldTurns = 0;
    this.alcVulnerableTurns = 0;
    this.alcVulnerableNextTurn = false;
    this.currentMonster = null;
    this.currentEvent = null; // 寶箱或陷阱事件資訊
    this.currentTransition = null; // 踏入第X層之轉場資訊
    this.isNarrating = false; // 戰況交鋒敘述中（鎖定玩家技能選擇）
    this.checkpointChoice = null;
    this.gameOverReason = null; // 'abandon' | 'wipe' | null
    
    // 投票機制與裝備待領取狀態
    this.routeVotes = {}; // socket.id -> routeId
    this.routePresentationId = 0;
    this.trapPresentationId = 0;
    this.chestPresentationId = 0;
    this.battlePresentationId = 0;
    this.victoryPresentationId = 0;
    this.currentVictory = null;
    this.floorRevival = null;
    this.pendingDrop = null; // { drop, ownerId, ownerName, source }
    this.monsterStunnedThisRound = false;
    this.frenzyTeamDrainTurns = 0;
    this.frenzyTeamDrainNextTurn = false;
    this.isWolfSurrenderGameOver = false;

    // 回合內臨時效果作用域（本回合有效，回合結束還原）
    this.roundModifiers = {
      equipmentEffectMultiplier: 1.0 // 1.0 = 正常 100%, 0.5 = 降低 50%
    };

    // 演出隊列客戶端同步確認集合與安全計時器
    this.pendingPresentationAcks = new Set();
    this.presentationSafetyTimer = null;

    this.turnTimer = null;
    this.timerEndsAt = null;
    this.timerCallback = null;
    this.isPaused = false;
    this.pausedRemainingSeconds = null;
    this.narrativeAccelerated = false;
    this.logs = [];
    this.chatMessages = [];

    // 加入第一位玩家（隊長）
    this.addPlayer(leaderSocket, leaderName, leaderAvatar);
  }

  clearPlayerDebuffs(player) {
    if (!player) return;
    player.bleedTurns = 0;
    player.poisonTurns = 0;
    player.poisonDmg = 0;
    player.cannotCrit = false;
    player.isSurrendered = false;
    player.stunnedNextTurn = false;
    player.nextTurnStunFlag = false;
    player.warriorVulnerableTurns = 0;
    player.warriorVulnerableNextTurn = false;
    player.archerNextDodgeBonus = 0;
    if (player.hp <= 0) { player.isHiddenThisRound = false; player.downedForFloor = true; player.downedFloor = this.floor; }
    player.archerNoDodgeTurns = 0;
    player.archerNoDodgeNextTurn = false;
    player.alcAcidEquipHalvedTurns = 0;
    player.alcAcidStack = 0;
    player.tempHp = 0;player.p8Shields=[];
    player.isCrouchedThisRound = false;
    player.isLocked = false;
  }

  selectEquipOwner(matchingPlayers, drop = null) {
    if (!matchingPlayers || matchingPlayers.length === 0) return null;
    let pool = matchingPlayers;
    if (drop && (drop.unique || ['w_greatsword', 'b_violin', 'a_crossbow'].includes(drop.id) || ['雙手劍', '精靈木提琴', '改良型重弩'].includes(drop.name))) {
      const eligible = matchingPlayers.filter(p => !(p.equips || []).some(e => e.id === drop.id || e.name === drop.name));
      if (eligible.length > 0) pool = eligible;
    }
    if (pool.length === 1) return pool[0];

    let minCount = Infinity;
    for (const p of pool) {
      const count = (p.equips || []).length;
      if (count < minCount) minCount = count;
    }

    const candidates = pool.filter(p => (p.equips || []).length === minCount);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  getEligiblePlayedLoots(activeRoles) {
    const uniqueEquipIds = ['w_greatsword', 'b_violin', 'a_crossbow'];
    const uniqueEquipNames = ['雙手劍', '精靈木提琴', '改良型重弩'];
    return LOOT_TABLE.filter(l => {
      if (!activeRoles.has(l.role)) return false;
      if (l.unique || uniqueEquipIds.includes(l.id) || uniqueEquipNames.includes(l.name)) {
        return Object.values(this.players).some(p => p.role === l.role && !(p.equips || []).some(e => e.id === l.id || e.name === l.name));
      }
      return true;
    });
  }

  addPlayer(socket, name, avatar = null) {
    if (this.memberIds.length >= 10 && !this.memberIds.includes(socket.id)) {
      return { success: false, message: '房間已滿員（上限 10 人）' };
    }
    if (this.state !== 'LOBBY') {
      return { success: false, message: '遊戲已經開始，無法加入！' };
    }

    if (!this.memberIds.includes(socket.id)) {
      this.memberIds.push(socket.id);
    }

    let cleanAvatar = null;
    if (typeof avatar === 'string') {
      const trimmed = avatar.trim();
      if (trimmed.startsWith('data:image/')) {
        cleanAvatar = trimmed;
      } else if (!trimmed.startsWith('/photo/')) {
        cleanAvatar = trimmed.slice(0, 8);
      }
    }

    this.players[socket.id] = {
      id: socket.id,
      name: name || `勇者_${socket.id.slice(0, 4)}`,
      role: null,
      customAvatar: cleanAvatar,
      hp: 100,
      maxHp: 100,
      tempHp: 0,
      isLocked: false,
      bonusAtk: 0,
      victoryAtkBonus: 0,
      sageX: 30,
      sageDebt: 0,
      equips: [], // 上限 3 件裝備陣列
      equipCounts: {},
      cooldowns: {},
      action: null,
      targetPlayerId: null,
      cannotCrit: false,
      isStealthed: false, stealthStacks: 0, critTowardStealth: 0, isHiddenThisRound: false,
      followUpsThisRound: 0, stealthBrokenThisRound: false,
      stunnedNextTurn: false,
      bleedTurns: 0,
      poisonTurns: 0,
      poisonDmg: 0,
      druidForm: null,
      druidFormTurns: 0,
      druidRegenBonus: 0,
      werewolfMaxHpDeducted: 0,
      isSurrendered: false,
      minions: [],
      minion: null,
      alcAcidEquipHalvedTurns: 0,
      bardHealGroupBonus: 0,
      bardHealSingleBonus: 0,
      nextTurnStunFlag: false,
      warriorVulnerableTurns: 0,
      warriorVulnerableNextTurn: false,
      downedForFloor: false,
      downedFloor: null,
      archerNextDodgeBonus: 0,
      archerNoDodgeTurns: 0,
      archerNoDodgeNextTurn: false,
      ammo: [],
      isCrouchedThisRound: false,
      isReady: false,
      hasDealtFirstBattleCrit: false,
      connected: true
    };

    socket.join(this.code);
    this.addLog(`👋 **${this.players[socket.id].name}** 加入了小隊（當前人數: ${this.memberIds.length}/10）`, 'info');
    this.broadcastState();
    return { success: true };
  }

  removePlayer(socketId) {
    const player = this.players[socketId];
    if (!player) return;

    delete this.players[socketId];
    this.memberIds = this.memberIds.filter(id => id !== socketId);

    // 若隊長離開，轉移隊長至第一順位
    if (this.leaderId === socketId) {
      if (this.memberIds.length > 0) {
        this.leaderId = this.memberIds[0];
        if (this.players[this.leaderId]) {
          this.players[this.leaderId].isReady = false;
          this.addLog(`👑 **${this.players[this.leaderId].name}** 成為了新隊長！`, 'info');
        }
      } else {
        this.leaderId = null;
      }
    }

    if (this.state === 'LOBBY') {
      this.addLog(`🚪 **${player.name}** 離開了房間`, 'info');
    } else {
      this.addLog(`🚪 **${player.name}** 離開了隊伍`, 'info');

      // 清理該玩家持有的戰利品抉擇
      if (this.pendingDrop?.ownerId === socketId) this.pendingDrop = null;
      if (this.victoryPendingDrop?.ownerId === socketId) this.victoryPendingDrop = null;

      // 清理該玩家的等待 ACK
      this.pendingPresentationAcks?.delete(socketId);
      this.pendingSelectionAcks?.delete(socketId);
      if (this.routeVotes) delete this.routeVotes[socketId];

      if (this.memberIds.length === 0) {
        this.clearTimer();
        this.broadcastState();
        return;
      }

      if (this.state === 'IN_BATTLE') {
        if (Object.values(this.players).every(p => p.hp <= 0)) {
          this.handleGameOver();
        } else if (this.selectionState === 'SELECTING') {
          this.checkTurnCompletion();
        } else if (this.selectionState === 'RESOLVING') {
          if (!this.pendingPresentationAcks.size) {
            this.finishTurnPresentation();
          }
        }
        if (this.pendingSelectionAcks && !this.pendingSelectionAcks.size) {
          const next = this.memberIds[0];
          if (next) this.handleSelectionReady(next);
        }
      }

      if (this.state === 'BATTLE_VICTORY') {
        if (!this.pendingPresentationAcks.size) {
          const next = this.memberIds[0];
          if (next) this.handleVictoryComplete(next, this.currentVictory?.presentationId);
        }
      }

      if (this.state === 'PROLOGUE') {
        this.finishPrologueIfReady();
      }

      if (this.state === 'CHOOSING_ROUTE') {
        if (this.isNarrating) {
          this.finishRoutePresentationIfReady();
        } else {
          const livingPlayers = Object.values(this.players).filter(p => p.hp > 0 && p.connected);
          if (livingPlayers.length > 0 && livingPlayers.every(p => Boolean(this.routeVotes[p.id]))) this.tallyRouteVotes();
        }
      }

      if (this.state === 'EVENT') {
        if (this.currentEvent?.type === 'trap') {
          this.finishTrapPresentationIfReady();
        } else if (this.currentEvent?.type === 'treasure') {
          this.finishChestPresentationIfReady();
        }
      }
    }

    this.broadcastState();
  }

  renamePlayer(socketId, newName) {
    if (this.state !== 'LOBBY') {
      return { success: false, message: '遊戲已經開始，無法修改暱稱！' };
    }
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };

    const cleanName = String(newName || '').trim().slice(0, 12);
    if (!cleanName) {
      return { success: false, message: '暱稱不能為空！' };
    }

    const oldName = player.name;
    player.name = cleanName;

    this.addLog(`✏️ **${oldName}** 修改了暱稱為 **${cleanName}**`, 'info');
    this.broadcastState();
    return { success: true, newName: cleanName };
  }

  updateAvatar(socketId, avatar) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };

    let cleanAvatar = null;
    if (typeof avatar === 'string') {
      const trimmed = avatar.trim();
      if (trimmed.startsWith('data:image/')) {
        // 限制 base64 大小不超過 300KB
        if (trimmed.length > 350000) {
          return { success: false, message: '圖片檔案過大，請選擇較小的圖片！' };
        }
        cleanAvatar = trimmed;
      } else if (!trimmed.startsWith('/photo/')) {
        // emoji 或自訂文字
        cleanAvatar = trimmed.slice(0, 8);
      }
    }

    player.customAvatar = cleanAvatar;
    this.addLog(`🖼️ **${player.name}** 更新了個人頭貼！`, 'info');
    this.broadcastState();
    return { success: true, customAvatar: cleanAvatar };
  }

  selectRole(socketId, roleKey) {
    if (this.state !== 'LOBBY') return { success: false, message: '當前非選職階段' };
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (!CLASSES[roleKey]) return { success: false, message: '無效的職業' };

    player.role = roleKey;
    player.equips = [];
    player.equipCounts = {};
    player.bonusAtk = 0;
    player.victoryAtkBonus = 0;
    player.hp = CLASSES[roleKey].maxHp;
    player.maxHp = CLASSES[roleKey].maxHp;
    player.tempHp = 0;
    player.isLocked = false;
    
    const initialCooldowns = {};
    CLASSES[roleKey].skills.forEach(s => { initialCooldowns[s.id] = 0; });
    player.cooldowns = initialCooldowns;
    Object.assign(player,{p8Effects:{},p8Shields:[],p8TeamHp:0,p8DisabledHp:0,p8CorrodedHp:0,warriorStacks:0,rage:0,bloodStacks:0,soul:0,sageX:30,sageDebt:0,sageOperand:0,sagePhase:'hypothesis',sageCycleRound:0,sageInduction:false,sageSamplingEnded:true,sageEquationResolved:false,sageSolvedThisRound:false,sagePrimeResetPending:false});
    delete player.sagePreviousAction;delete player.sageLastAction;delete player.sageDebtScheduledRound;
    player.stealthStacks=roleKey==='assassin'?1:0;
    delete player.noReviveFloor;
    this.p8RefreshEquipment();

    this.addLog(`**${player.name}** 選擇了職業：**${CLASSES[roleKey].name}**`, 'role');
    player.isReady = false;
    this.broadcastState();
    return { success: true };
  }

  toggleReady(socketId) {
    if (this.state !== 'LOBBY') return { success: false, message: '遊戲已開始' };
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (socketId === this.leaderId) return { success: false, message: '隊長無需點擊準備' };
    if (!player.role) return { success: false, message: '請先選擇職業再準備！' };
    player.isReady = !player.isReady;
    this.broadcastState();
    return { success: true, isReady: player.isReady };
  }

  transferLeader(socketId, targetId) {
    if (this.state !== 'LOBBY') return { success: false, message: '只能在選職大廳移交隊長！' };
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能移交隊長職位！' };
    if (!this.players[targetId]) return { success: false, message: '目標玩家不存在！' };
    if (targetId === this.leaderId) return { success: false, message: '您已經是隊長！' };

    this.leaderId = targetId;
    if (this.players[targetId]) {
      this.players[targetId].isReady = false;
    }
    this.memberIds = [targetId, ...this.memberIds.filter(id => id !== targetId)];
    const targetName = this.players[targetId].name;
    this.addLog(`👑 隊長已轉移給 **${targetName}**！`, 'info');
    this.broadcastState();
    return { success: true };
  }

  startAdventure(socketId, options = {}) {
    if (this.state !== 'LOBBY') return { success: false, message: '遊戲已經開始' };
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能點擊出發！' };

    // 檢查是否所有玩家都選了職業
    const unpicked = Object.values(this.players).filter(p => !p.role);
    if (unpicked.length > 0) {
      return { success: false, message: `還有隊員未選擇職業：${unpicked.map(p => p.name).join(', ')}` };
    }

    // 檢查隊員是否已準備就緒
    if (options.checkReady) {
      const notReady = Object.values(this.players).filter(p => p.id !== this.leaderId && !p.isReady);
      if (notReady.length > 0) {
        return { success: false, message: `尚有隊員未準備就緒：${notReady.map(p => p.name).join('、')}` };
      }
    }

    this.floor = 1;
    this.battleCount = 0;
    this.battlesInCurrentCycle = 0;
    for (const p of Object.values(this.players)) {
      p.hasDealtFirstBattleCrit = false;
      if(p.role==='sage'){p.sageX=30;p.sageDebt=0;delete p.sageDebtScheduledRound;}
    }
    this.state = 'PROLOGUE';
    this.addLog(`📜 **${STORY_TEXTS.prologue.title}**`, 'info');
    STORY_TEXTS.prologue.paragraphs.forEach(p => this.addLog(p, 'info'));

    // Reuse the presentation ACK barrier. Story time never shares a turn timer,
    // and the fastest client cannot advance a teammate's unfinished prologue.
    this.clearTimer();
    this.pendingPresentationAcks = new Set(
      Object.values(this.players).filter(p => p.connected).map(p => p.id)
    );

    this.broadcastState();
    return { success: true };
  }

  handlePrologueComplete(socketId) {
    if (this.state !== 'PROLOGUE') return { success: false, message: '目前不是開場階段' };
    if (!this.players[socketId]?.connected) return { success: false, message: '玩家不存在或已斷線' };
    this.pendingPresentationAcks.delete(socketId);
    this.finishPrologueIfReady();
    return { success: true };
  }

  skipPrologue(socketId) {
    if (this.state !== 'PROLOGUE') return { success: false, message: '目前不是開場階段' };
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能跳過開場' };
    this.addLog(`⏩ **${this.players[socketId]?.name || '隊長'}** 跳過了開場故事！`, 'info');
    if (this.io && this.code) {
      this.io.to(this.code).emit('prologue:skipped', { leaderId: socketId });
    }
    this.clearTimer();
    this.pendingPresentationAcks.clear();
    this.startRouteSelection();
    return { success: true };
  }

  getNarrativeControl() {
    const key = JSON.stringify([this.code, this.state, this.floor, this.routePresentationId,
      this.currentTransition?.routeId, this.currentEvent?.presentationId, this.currentEvent?.opened,
      this.battleRound, this.battlePresentationId, this.currentVictory?.presentationId]);
    return { key, accelerated: !!this.narrativeAccelerated };
  }

  accelerateNarrative(socketId, request = {}) {
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能加速敘述' };
    if (!request || typeof request !== 'object') return { success: false, message: '無效的播放設定' };
    const current = this.getNarrativeControl();
    if (typeof request.accelerated !== 'boolean') return { success: false, message: '無效的播放設定' };
    if (!['PROLOGUE','CHOOSING_ROUTE','ROUTE','TRANSITION','EVENT','IN_BATTLE','BATTLE_VICTORY'].includes(this.state)) return { success: false, message: '目前沒有劇情敘述' };
    this.narrativeAccelerated = request.accelerated;
    this.narrativeControl = { key: current.key, accelerated: this.narrativeAccelerated };
    if (this.io && this.code) {
      this.io.to(this.code).emit('narrative:accelerated', this.narrativeControl);
    }
    return { success: true, ...this.narrativeControl };
  }

  finishPrologueIfReady() {
    if (this.state !== 'PROLOGUE' || this.pendingPresentationAcks.size > 0) return;
    if (Object.values(this.players).some(p => p.connected)) this.startRouteSelection();
  }

  startRouteSelection(options = {}) {
    this.clearTimer();
    this.timerCallback = null;
    this.pausedRemainingSeconds = null;
    this.floorRevival = null;
    const floorBefore = this.getHpSnapshot();
    const revivalResults = [];
    for (const p of Object.values(this.players)) {
      if (p.hp <= 0 && p.downedFloor != null && p.downedFloor < this.floor) {
        p.hp = Math.max(1, Math.floor(p.maxHp * GAME_BALANCE.floorReviveHpRatio));
        p.downedForFloor = false;
        p.downedFloor = null;
        revivalResults.push({ kind: 'revive', targetId: p.id, actualHeal: p.hp,
          targetBefore: snapshotTarget(floorBefore, p.id), targetAfter: snapshotTarget(this.getHpSnapshot(), p.id),
          hpSnapshot: this.getHpSnapshot(), outcome: { type: 'normal' } });
      }
    }
    if (revivalResults.length) this.floorRevival = { hpBefore: floorBefore,
      hpAfter: this.getHpSnapshot(), results: revivalResults };
    this.p8ExitArena();
    const alivePlayers = Object.values(this.players).filter(p => p.hp > 0);
    if (alivePlayers.length === 0) { this.handleGameOver(); return; }
    this.state = 'CHOOSING_ROUTE';
    this.currentEvent = null;
    this.currentTransition = null;
    this.routeVotes = {}; // 重置全體投票記錄
    this.currentRoutes = getRandomRoutes(4); // 每次從 6 個選項中隨機抽出 4 個
    this.routePresentationId += 1;
    if (options.skipIntro) {
      this.isNarrating = false;
      this.pendingPresentationAcks.clear();
      this.addLog(`🧭 路線選項已就緒，請全員共同投票決定前進方向！（15 秒倒數）`, 'info');
      this.setTimer(15, () => {
        if (this.state === 'CHOOSING_ROUTE') {
          this.tallyRouteVotes();
        }
      }, true);
      if (this.isPaused) {
        clearTimeout(this.turnTimer);
        this.turnTimer = null;
        this.pausedRemainingSeconds = 15;
      }
    } else {
      this.isNarrating = true;
      this.pendingPresentationAcks = new Set(
        Object.values(this.players).filter(p => p.connected).map(p => p.id)
      );
      this.addLog(`🧭【第 ${this.floor} 層・迷霧分歧點】正在探索前路迷霧...`, 'info');
    }
    this.broadcastState();

    // No fixed-duration fallback may consume an unfinished player's choice time.
  }

  // 用戶端路線氛圍敘述文字演出完畢、選項進場可互動回調 (P2-R1.1 Section 5)
  handleRouteNarrativeDone(socketId, presentationId) {
    if (this.state !== 'CHOOSING_ROUTE' || !this.isNarrating) return;
    if (presentationId !== this.routePresentationId || !this.players[socketId]?.connected) return;
    this.pendingPresentationAcks.delete(socketId);
    this.finishRoutePresentationIfReady();
  }

  finishRoutePresentationIfReady() {
    if (this.state !== 'CHOOSING_ROUTE' || !this.isNarrating || this.pendingPresentationAcks.size) return;
    if (!Object.values(this.players).some(p => p.connected)) return;
    this.isNarrating = false;
    this.addLog(`🧭 路線選項已就緒，請全員共同投票決定前進方向！（15 秒倒數）`, 'info');
    // 敘述結束、選項渲染並可互動後，才正式啟動 15 秒全員投票倒數計時器
    this.setTimer(15, () => {
      if (this.state === 'CHOOSING_ROUTE') {
        this.tallyRouteVotes();
      }
    }, true);
    if (this.isPaused) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
      this.pausedRemainingSeconds = 15;
    }
    this.broadcastState();
  }

  voteRoute(socketId, routeId) {
    if (this.state !== 'CHOOSING_ROUTE') return { success: false, message: '目前非路線投票階段' };
    if (this.isNarrating || this.isPaused) return { success: false, message: '路線演出尚未完成或遊戲暫停中' };
    const player = this.players[socketId];
    if (!player?.connected) return { success: false, message: '玩家不存在或已斷線' };
    if (player.hp <= 0) return { success: false, message: '已陣亡玩家無法參與投票' };

    const activeRoutes = this.currentRoutes || ROUTES;
    const targetRoute = activeRoutes.find(r => r.id === routeId);
    if (!targetRoute) return { success: false, message: '無效的路線選項' };

    this.routeVotes[socketId] = routeId;
    this.broadcastState();

    // 檢查是否所有存活隊員都已投票，若已全員完成投票則提早結算
    const livingPlayers = Object.values(this.players).filter(p => p.hp > 0);
    const allVoted = livingPlayers.length > 0 && livingPlayers.every(p => Boolean(this.routeVotes[p.id]));
    if (allVoted) {
      this.clearTimer();
      setTimeout(() => {
        if (this.state === 'CHOOSING_ROUTE') {
          this.tallyRouteVotes();
        }
      }, 500);
    }

    return { success: true };
  }

  tallyRouteVotes() {
    this.clearTimer();
    if (this.state !== 'CHOOSING_ROUTE') return;

    const activeRoutes = this.currentRoutes || getRandomRoutes(4);
    const voteCounts = {};
    activeRoutes.forEach(r => { voteCounts[r.id] = 0; });

    let totalVotes = 0;
    for (const [pId, routeId] of Object.entries(this.routeVotes)) {
      const p = this.players[pId];
      if (p && p.hp > 0 && voteCounts[routeId] !== undefined) {
        voteCounts[routeId] += 1;
        totalVotes += 1;
      }
    }

    const maxVotes = Math.max(0, ...Object.values(voteCounts));
    let chosenRoute = null;

    if (totalVotes === 0 || maxVotes === 0) {
      // 全員棄票 (0 票)
      chosenRoute = activeRoutes[Math.floor(Math.random() * activeRoutes.length)];
      this.addLog(`⏱️ 15 秒時間截止，全員棄票！由系統隨機指引前進路線：【${chosenRoute.name}】！`, 'warning');
    } else {
      const topRoutes = activeRoutes.filter(r => voteCounts[r.id] === maxVotes);
      if (topRoutes.length === 1) {
        chosenRoute = topRoutes[0];
        this.addLog(`🗳️ 投票結算完成！小隊以 ${maxVotes} 票最高票決定前進：【${chosenRoute.name}】！`, 'info');
      } else {
        // 出現平票，由系統在最高票名單中隨機抽取
        chosenRoute = topRoutes[Math.floor(Math.random() * topRoutes.length)];
        const tiedNames = topRoutes.map(r => r.name).join(' 與 ');
        this.addLog(`⚖️ 投票結算出現平票（${tiedNames} 各得 ${maxVotes} 票）！由系統在候選名單中隨機抽取決定前進：【${chosenRoute.name}】！`, 'warning');
      }
    }

    this.resolveRouteChoice(chosenRoute);
  }

  // 計算玩家實際有效攻擊加成（鍊金強酸裝備減半期間，戰士雙手劍及詩人精靈木提琴免疫減半）
  getAssassinFollowUpCap(player) { return getAssassinFollowUpCap(player); }

  getAssassinBonusAtk(player) {
    const equips = player.equips || [];
    const equipAtk = equips.reduce((sum, e) => sum + (e.bonusAtk || 0), 0);
    const permanentAtk = (player.bonusAtk || 0) - equipAtk;
    return permanentAtk + equips.reduce((sum, e) => sum + Math.floor((e.bonusAtk || 0) * (this.roundModifiers?.equipmentEffectMultiplier ?? 1)), 0);
  }

  resolveAssassinFollowUps(ally, queue, log, bardMultiplier, resistance) {
    if(this.arena)return;
    if (this.currentMonster.hp <= 0) return;
    for (const p of Object.values(this.players)) {
      if (p.id === ally.id || !p.connected || !isAssassinHidden(p) || p.stunnedNextTurn || p.nextTurnStunFlag ||
          (p.followUpsThisRound || 0) >= getAssassinFollowUpCap(p) || this.currentMonster.hp <= 0) continue;
      if (Math.random() >= ASSASSIN_BALANCE.followUpChance) continue;
      const before = this.getHpSnapshot();
      const isGuaranteedCrit = (this.battleCount === 1 && this.battleRound === 1 && !p.hasDealtFirstBattleCrit);
      const critical = isGuaranteedCrit || (Math.random() < ASSASSIN_BALANCE.followUpCritChance);
      if (critical) {
        p.hasDealtFirstBattleCrit = true;
      }
      const raw = Math.floor((ASSASSIN_BALANCE.followUpBaseDamage + this.getAssassinBonusAtk(p)) *
        (critical ? ASSASSIN_BALANCE.criticalMultiplier : 1) * bardMultiplier);
      const { dmg } = resistance(raw, 'phys');
      const actual = Math.min(this.currentMonster.hp, dmg);
      this.currentMonster.hp = Math.max(0, this.currentMonster.hp - dmg);
      p.followUpsThisRound = (p.followUpsThisRound || 0) + 1;
      const gainedStacks = critical && actual > 0 ? addAssassinCritical(p) : 0;
      log.push({ text: `**${p.name}** 自暗影中發動追擊${critical ? '・暴擊' : ''}，造成 **${actual}** 點傷害。`, type: 'combat' });
      if (gainedStacks) log.push({ text: `**${p.name}** 累積兩次暴擊，獲得 1 層【匿蹤】。`, type: 'buff' });
      const after = this.getHpSnapshot();
      queue.push({ type: 'follow_up_action', category: 'FOLLOW_UP', sourceId: p.id, sourceRole: 'assassin',
        triggerActionId: ally.action, triggerPlayerId: ally.id, skillName: '追擊', gainedStacks,
        monsterName: this.currentMonster.name, monsterAvatar: this.currentMonster.avatar,
        isCritical: critical, isLethal: this.currentMonster.hp <= 0, finalDamage: actual,
        outcome: { type: critical ? 'critical' : 'normal', label: critical ? 'CRITICAL' : '' },
        hpSnapshotBefore: before, hpSnapshot: after,
        results: [{ kind: 'damage', targetId: 'monster', finalDamage: actual,
          outcome: { type: critical ? 'critical' : 'normal' }, targetBefore: before.monster, targetAfter: after.monster, hpSnapshot: after }] });
    }
  }

  getEffectiveBonusAtk(pl) {
    if (!pl) return 0;
    const equipMult = this.roundModifiers?.equipmentEffectMultiplier ?? 1.0;
    const resourceAtk=(pl.warriorStacks||0)+(pl.role==='gladiator'?(pl.bloodStacks||0)*2:0);
    if (equipMult >= 1.0) {
      return Math.max(0, (pl.bonusAtk || 0)+resourceAtk);
    }
    // 當本回合裝備效果降低時（如強酸瓶降低 50%）：
    const permAtk = pl.victoryAtkBonus !== undefined ? (pl.victoryAtkBonus || 0) : Math.max(0, (pl.bonusAtk || 0) - (pl.equips || []).reduce((sum, e) => sum + (e.bonusAtk || 0), 0));
    let total = permAtk;
    for (const eq of (pl.equips || [])) {
      const bAtk = eq.bonusAtk || 0;
      if (bAtk === 0) continue;
      if (eq.id === 'g_xiphos' || eq.id === 'w_greatsword' || eq.name === '雙手劍' || eq.id === 'b_violin' || eq.name === '精靈木提琴') {
        total += bAtk; // 免疫減半
      } else {
        total += Math.floor(bAtk * equipMult);
      }
    }
    return Math.max(0, total+resourceAtk);
  }

  // 取得德魯伊召喚物計算用的有效總攻擊力 (druidTotalAtk)
  // Base ATK (10) + Effective Equipment ATK + Current Form Modifier (-5 樹精, +20 狼人)
  getDruidEffectiveAttack(druid, battleContext = {}) {
    if (!druid) return 10;
    const baseAtk = 10;
    let formMod = 0;
    if (druid.druidForm === 'werewolf') {
      formMod = 20;
    } else if (druid.druidForm === 'treant') {
      formMod = -5;
    }
    const equipAtk = this.getEffectiveBonusAtk(druid);
    const total = baseAtk + equipAtk + formMod;
    return Math.max(1, total);
  }

  // 兼容舊介面與舊事件
  selectRoute(socketId, routeId) {
    return this.voteRoute(socketId, routeId);
  }

  resolveRouteChoice(route) {
    const floorInCycle = ((this.floor - 1) % 5) + 1; // 1 ~ 5
    const floorsRemainingInCycle = 5 - floorInCycle + 1; // 5 ~ 1
    const battlesNeeded = Math.max(0, 2 - (this.battlesInCurrentCycle || 0));

    let outcomeType = 'battle';
    let isWeakenedBoss = false;

    if (battlesNeeded >= floorsRemainingInCycle) {
      // 每5層保底至少2次戰鬥事件觸發（50% 一般BOSS，50% 削弱BOSS）
      outcomeType = 'battle';
      isWeakenedBoss = Math.random() < 0.5;
    } else {
      const rand = Math.random();
      if (rand < 0.25) {
        // 25% 一般BOSS事件
        outcomeType = 'battle';
        isWeakenedBoss = false;
      } else if (rand < 0.50) {
        // 25% 削弱BOSS事件 (傷害及血量變成原本的75%)
        outcomeType = 'battle';
        isWeakenedBoss = true;
      } else if (rand < 0.75) {
        // 25% 寶箱事件
        outcomeType = 'treasure';
      } else {
        // 25% 陷阱事件
        outcomeType = 'trap';
      }
    }

    if (outcomeType === 'battle') {
      this.battlesInCurrentCycle = (this.battlesInCurrentCycle || 0) + 1;
    }

    const routeData = ROUTE_STORIES[route.id] || ROUTE_STORIES['route_trail'];
    let outcomeData = routeData[outcomeType] || routeData['battle'];

    if (isWeakenedBoss) {
      outcomeData = {
        title: (outcomeData.title || `【${route.name}・魔物遭遇】`).replace('⚔️', '🥀⚔️') + ' (削弱BOSS)',
        story: `${outcomeData.story}（⚠️ 遠處傳來粗重的喘息聲，該BOSS在先前的戰鬥中遭受重創，傷害與血量削弱為原本的 75%！）`
      };
    }

    this.state = 'TRANSITION';
    this.currentTransition = {
      floor: this.floor,
      title: `【前進路線・${route.name}】`,
      routeId: route.id,
      routeName: route.name,
      routeIcon: route.icon,
      outcomeType: isWeakenedBoss ? 'battle_weakened' : outcomeType,
      isWeakenedBoss: isWeakenedBoss,
      storyTitle: `【路線結算・${route.name}】`,
      storyText: `小隊踏入【${route.name}】，正向第 ${this.floor} 層深處探索前行……`
    };

    this.addLog(`🧭 小隊決定前進：【${route.name}】`, 'info');
    this.broadcastState();

    // 路線結算轉場（持續 2 秒），隨後正式展開事件或戰鬥 (Node 10 -> Node 11/12/13/14)
    this.setTimer(2, () => {
      if (this.state === 'TRANSITION') {
        if (outcomeType === 'treasure') {
          this.handleTreasureEvent(outcomeData);
        } else if (outcomeType === 'trap') {
          this.handleTrapEvent(outcomeData);
        } else {
          this.handleBattleEvent(outcomeData, isWeakenedBoss);
        }
      }
    });
  }

  // 寶箱事件 (Phase 4: 完整遵循 Discovery -> Chest Reveal -> Open -> Reward Reveal -> Equipment Decision)
  handleTreasureEvent(outcomeData = null) {
    this.clearTimer();
    this.timerCallback = null;
    this.pausedRemainingSeconds = null;
    this.state = 'EVENT';
    this.chestPresentationId += 1;
    const hpBefore = this.getHpSnapshot();
    const healAmt = 25;
    for (const p of Object.values(this.players)) {
      if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + healAmt);
    }
    const hpAfter = this.getHpSnapshot();

    const activeRoles = new Set(Object.values(this.players).map(p => p.role).filter(Boolean));
    const unplayedLoots = LOOT_TABLE.filter(l => !activeRoles.has(l.role));
    const playedLoots = this.getEligiblePlayedLoots(activeRoles);

    // 寶箱及戰鬥成功後可能會有低機率(15%)出現沒有玩家玩的職業裝備
    const isUnplayedDrop = unplayedLoots.length > 0 && Math.random() < 0.15;

    if (isUnplayedDrop) {
      const drop = unplayedLoots[Math.floor(Math.random() * unplayedLoots.length)];
      this.currentEvent = {
        type: 'treasure',
        title: outcomeData ? outcomeData.title : `🎁【第 ${this.floor} 層】發現遠古寶箱！`,
        story: outcomeData ? outcomeData.story : '',
        healAmt: healAmt,
        drop: null,
        discardedDrop: drop,
        ownerName: '無',
        ownerId: null,
        presentationId: this.chestPresentationId,
        hpBefore,
        hpAfter,
        details: [
          `🎁 **幸運降臨！發現遠古寶箱！** 全員回復 ${healAmt} 生命！`,
          `💨 沒玩家玩這個職業，系統幫你們把【${drop.name}】丟掉嘍`
        ]
      };
      this.pendingDrop = null;
      this.pendingPresentationAcks = new Set(Object.values(this.players).filter(p => p.connected).map(p => p.id));
      this.broadcastState();
      return;
    }

    const drop = (playedLoots.length > 0)
      ? playedLoots[Math.floor(Math.random() * playedLoots.length)]
      : LOOT_TABLE[Math.floor(Math.random() * LOOT_TABLE.length)];

    const matchingPlayers = Object.values(this.players).filter(p => p.role === drop.role);
    const equipOwner = this.selectEquipOwner(matchingPlayers, drop) ||
      this.selectEquipOwner(Object.values(this.players).filter(p => p.hp > 0), drop) ||
      this.selectEquipOwner(Object.values(this.players), drop);

    const details = equipOwner
      ? [`🎁 **幸運降臨！發現遠古寶箱！** 全員回復 ${healAmt} 生命！獲得裝備【${drop.name}】(${drop.desc})，等待 **${equipOwner.name}** 抉擇是否穿戴！`]
      : [`🎁 **幸運降臨！發現遠古寶箱！** 全員回復 ${healAmt} 生命！`];

    this.currentEvent = {
      type: 'treasure',
      title: outcomeData ? outcomeData.title : `🎁【第 ${this.floor} 層】發現遠古寶箱！`,
      story: outcomeData ? outcomeData.story : '',
      healAmt: healAmt,
      drop: drop,
      discardedDrop: null,
      ownerName: equipOwner ? equipOwner.name : '未知',
      ownerId: equipOwner ? equipOwner.id : null,
      presentationId: this.chestPresentationId,
      hpBefore,
      hpAfter,
      details
    };

    if (equipOwner) {
      this.pendingDrop = {
        drop: drop,
        ownerId: equipOwner.id,
        ownerName: equipOwner.name,
        source: 'treasure'
      };
    } else {
      this.pendingDrop = null;
    }

    this.pendingPresentationAcks = new Set(Object.values(this.players).filter(p => p.connected).map(p => p.id));
    this.broadcastState();
  }

  handleChestPresentationComplete(socketId, presentationId) {
    if (this.state !== 'EVENT' || this.currentEvent?.type !== 'treasure' ||
        presentationId !== this.currentEvent.presentationId || !this.players[socketId]?.connected) return;
    this.pendingPresentationAcks.delete(socketId);
    this.finishChestPresentationIfReady();
  }

  finishChestPresentationIfReady() {
    if (this.state !== 'EVENT' || this.currentEvent?.type !== 'treasure' || this.pendingPresentationAcks.size) return;
    if (!Object.values(this.players).some(p => p.connected)) return;
    if (!this.pendingDrop) {
      if (this.currentEvent?.details) {
        this.currentEvent.details.forEach(log => this.addLog(log, 'loot'));
      }
      this.advanceToNextFloorOrCheckpoint();
    }
  }

  handleEquipmentInteractionReady(socketId, presentationId) {
    if (this.state !== 'EVENT' || this.currentEvent?.type !== 'treasure' ||
        presentationId !== this.currentEvent.presentationId || !this.players[socketId]?.connected) return;
    if (this.pendingDrop && this.pendingDrop.ownerId === socketId) {
      this.pendingPresentationAcks.delete(socketId);
      if (this.currentEvent?.details) {
        this.currentEvent.details.forEach(log => this.addLog(log, 'loot'));
      }
      this.clearTimer(); // 獲得裝備時倒數暫停，直到獲得裝備的玩家選擇穿上與否
      this.broadcastState();
    }
  }

  // 陷阱事件
  handleTrapEvent(outcomeData = null) {
    this.clearTimer();
    this.timerCallback = null;
    this.pausedRemainingSeconds = null;
    this.state = 'EVENT';
    this.trapPresentationId += 1;
    const hpBefore = this.getHpSnapshot();
    const hits = [];
    // 陷阱事件傷害：1~5層15點傷害，6~10層18點傷害，以此類推
    const cycle = Math.floor((this.floor - 1) / 5);
    const trapDmg = 15 + cycle * 3;
    const trapLogs = [];

    for (const p of Object.values(this.players)) {
      if (p.hp <= 0) continue;

      if (p.role === 'assassin') {
        trapLogs.push(`**${p.name}** 自暗影中避開陷阱！`);
        hits.push({ targetId: p.id, role: p.role, dodged: true, damage: 0, outcome: { type: 'assassin_trap_evade' }, hpSnapshot: this.getHpSnapshot() });
        continue;
      }

      if (p.role === 'archer' && this.checkDodge(p, CLASSES.archer.dodgeRate)) {
        trapLogs.push(`🪶 弓箭手 **${p.name}** 憑藉超凡敏捷側身翻滾，無傷避開了陷阱！`);
        hits.push({ targetId: p.id, role: p.role, dodged: true, damage: 0, hpSnapshot: this.getHpSnapshot() });
        continue;
      }

      p.hp -= trapDmg;
      if (p.hp <= 0) {
        p.hp = 0;
        this.clearPlayerDebuffs(p);
        trapLogs.push(`💥 **${p.name}** 受到 **${trapDmg}** 點陷阱重創，不幸身亡！💀`);
      } else {
        trapLogs.push(`💢 **${p.name}** 受到 **${trapDmg}** 點陷阱傷害！（❤️ ${p.hp}/${p.maxHp}）`);
      }
      hits.push({ targetId: p.id, role: p.role, dodged: false, damage: trapDmg, hpSnapshot: this.getHpSnapshot() });
    }

    this.currentEvent = {
      type: 'trap',
      title: outcomeData ? outcomeData.title : `⚠️【第 ${this.floor} 層】致命陷阱！`,
      story: outcomeData ? outcomeData.story : '',
      details: trapLogs,
      presentationId: this.trapPresentationId,
      hpBefore,
      hpAfter: this.getHpSnapshot(),
      hits
    };
    this.pendingPresentationAcks = new Set(Object.values(this.players).filter(p => p.connected).map(p => p.id));
    this.broadcastState();
    this.finishTrapPresentationIfReady();
  }

  handleTrapPresentationComplete(socketId, presentationId) {
    if (this.state !== 'EVENT' || this.currentEvent?.type !== 'trap' ||
        presentationId !== this.currentEvent.presentationId || !this.players[socketId]?.connected) return;
    this.pendingPresentationAcks.delete(socketId);
    this.finishTrapPresentationIfReady();
  }

  finishTrapPresentationIfReady() {
    if (this.state !== 'EVENT' || this.currentEvent?.type !== 'trap' || this.pendingPresentationAcks.size) return;
    if (!Object.values(this.players).some(p => p.connected)) return;
    this.currentEvent.details.forEach(log => this.addLog(log, 'damage'));
    if (Object.values(this.players).every(p => p.hp <= 0)) this.handleGameOver();
    else this.advanceToNextFloorOrCheckpoint();
  }

  monsterAllowsEffect(label) {
    if (!this.currentMonster || this.currentMonster.hp <= 0) return false;
    const resistance = getBossResistance(this.currentMonster, 'effect');
    if (resistance > 0 && Math.random() < resistance / 100) {
      this.p8Log(`🛡️ **${this.currentMonster.name}** 以 ${resistance}% 效果抗性免疫【${label}】！`, 'combat');
      return false;
    }
    return true;
  }

  applyMonsterPoison(damage) {
    if (!this.monsterAllowsEffect('劇毒')) return false;
    this.currentMonster.poisonTurns = 2;
    this.currentMonster.poisonDmg = (this.currentMonster.poisonDmg || 0) + damage;
    return true;
  }

  // 戰鬥事件
  handleBattleEvent(outcomeData = null, isWeakened = false) {
    this.state = 'IN_BATTLE';
    const baseMonster = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
    const playerCount = this.memberIds.length;
    const hpPlayerMultiplier = 1 + (playerCount - 1) * 1.0;
    const atkPlayerMultiplier = 1 + (playerCount - 1) * 0.5;
    // 敵方難度加成：1~5層每層+10%，6~10層每層+15%，以此類推
    const floorMultiplier = getFloorDifficultyMultiplier(this.floor);

    let scaledHp = Math.floor(baseMonster.hp * hpPlayerMultiplier * floorMultiplier);
    let scaledAtk = Math.max(5, Math.floor(baseMonster.attack * atkPlayerMultiplier * floorMultiplier));

    if (isWeakened) {
      scaledHp = Math.max(1, Math.floor(scaledHp * 0.75));
      scaledAtk = Math.max(5, Math.floor(scaledAtk * 0.75));
    }

    const routeId = this.currentTransition?.routeId || 'route_trail';
    const bossStory = getRouteBossStory(routeId, baseMonster.name);
    const weakenedSuffix = isWeakened ? '（⚠️ 遠處傳來粗重的喘息聲，該BOSS在先前的戰鬥中遭受重創，傷害與血量削弱為原本的 75%！）' : '';
    const encounterStory = bossStory + weakenedSuffix;

    this.currentMonster = {
      name: isWeakened ? `【削弱】${baseMonster.name}` : baseMonster.name,
      originalName: baseMonster.name,
      routeId,
      encounterStory,
      isWeakened: Boolean(isWeakened),
      avatar: baseMonster.avatar,
      desc: isWeakened ? `${baseMonster.desc} (⚠️ 負傷削弱：傷害與血量為原本 75%)` : baseMonster.desc,
      attack: scaledAtk,
      hp: scaledHp,
      maxHp: scaledHp,
      baseHp: baseMonster.hp,
      ...createBossResistances(baseMonster, this.floor),
      ultName: baseMonster.ultName,
      poisonTurns: 0,
      poisonDmg: 0
    };

    this.battleCount = (this.battleCount || 0) + 1;
    this.battleRound = 1;
    this.warriorShieldTurn = 0;
    this.alcShieldTurns = 0;
    this.alcVulnerableTurns = 0;
    this.alcVulnerableNextTurn = false;
    this.isNarrating = false;
    this.isWolfSurrenderGameOver = false;

    for (const p of Object.values(this.players)) {
      p.bleedTurns = 0;
      p.poisonTurns = 0;
      p.poisonDmg = 0;
      p.stunnedNextTurn = false;
      p.nextTurnStunFlag = false;
      p.cannotCrit = false;
      p.isStealthed = false;
      p.isSurrendered = false;
      if (p.druidForm === 'treant' || p.druidForm === 'tree') {
        // Treant grants shield; maximum HP remains unchanged.
        p.hp = Math.min(p.hp, p.maxHp);
      }
      if (p.druidForm === 'werewolf' && p.werewolfMaxHpDeducted) {
        p.maxHp += p.werewolfMaxHpDeducted;
        p.werewolfMaxHpDeducted = 0;
      }
      p.druidForm = null;
      p.druidFormTurns = 0;
      p.minions = [];
      p.minion = null;
      p.alcAcidEquipHalvedTurns = 0;
    }

    if (outcomeData) {
      outcomeData.story = encounterStory;
    }
    this.addLog(`⚠️ **${encounterStory}**`, 'warning');
    if (isWeakened) {
      this.addLog(`⚔️🥀 **遭遇削弱BOSS！【${this.currentMonster.name}】（傷害及血量削弱為原本 75%）擋住了去路！**`, 'warning');
    } else {
      this.addLog(`⚔️ **遭遇強敵！【${this.currentMonster.name}】擋住了去路！**`, 'warning');
    }
    this.p8ResetBattle();
    this.executeTurn();
  }

  // Overheal 超量治療計算 (不污染原始 normalMaxHp)
  applyHealWithOverheal(player, healAmount) {
    if (player.hp <= 0 || healAmount <= 0) return 0;
    if(this.p8Has(player,'blood_heal'))healAmount=Math.floor(healAmount*1.2);
    const normalMax = player.maxHp;
    const oldEffective = player.hp + (player.tempHp || 0);
    if (player.hp < normalMax) {
      const needed = normalMax - player.hp;
      if (healAmount <= needed) {
        player.hp += healAmount;
      } else {
        player.hp = normalMax;
        const excess = healAmount - needed;
        player.tempHp = (player.tempHp || 0) + excess;
      }
    } else {
      player.tempHp = (player.tempHp || 0) + healAmount;
    }
    const newEffective = player.hp + (player.tempHp || 0);
    const actualHeal = newEffective - oldEffective;
    if (this.actionHeals) this.actionHeals.push({ targetId: player.id, actualHeal,
      targetAfter: snapshotTarget(this.getHpSnapshot(), player.id) });
    return actualHeal;
  }

  // 吸血治療（上限不高於原始最大生命，絕不溢出轉為 tempHp）
  applyHealCapped(player, healAmount) {
    if (player.hp <= 0 || healAmount <= 0) return 0;
    if(this.p8Has(player,'blood_heal'))healAmount=Math.floor(healAmount*1.2);
    const oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    const actualHeal = Math.max(0, player.hp - oldHp);
    if (this.actionHeals) {
      this.actionHeals.push({
        targetId: player.id,
        actualHeal,
        targetAfter: snapshotTarget(this.getHpSnapshot(), player.id)
      });
    }
    return actualHeal;
  }

  // 扣除傷害 (優先消耗 Temporary Overheal，再扣除真實 HP)
  applyDamageToPlayer(player, dmg, context = {}) {
    const hpBefore=player.hp;
    if (dmg <= 0) return { actualDmg: 0, hpDmg: 0, tempAbsorbed: 0 };
    const protection=context.kind==='sage_confusion'?null:this.p8Has(player,'boundary');
    if(protection?.barrier && dmg>=(player.hp+(player.tempHp||0))) {
      protection.barrier=false;
      this.p8Log(`${player.name}的星光屏障抵擋一次致命傷。`);
      return {actualDmg:0,hpDmg:0,tempAbsorbed:0};
    }
    let remaining = dmg;
    let tempAbsorbed = 0;
    if ((player.tempHp || 0) > 0) {
      if (player.tempHp >= remaining) {
        player.tempHp -= remaining;
        tempAbsorbed = remaining;
        remaining = 0;
      } else {
        tempAbsorbed = player.tempHp;
        remaining -= player.tempHp;
        player.tempHp = 0;
      }
    }
    if (remaining > 0) {
      player.hp = Math.max(0, player.hp - remaining);
    }
    const boundary=context.kind==='sage_confusion'?null:this.p8Has(player,'boundary');
    if(player.hp<=0 && boundary) {player.hp=1;if(boundary.barrier)boundary.barrier=false;}
    const result={actualDmg:hpBefore-player.hp+tempAbsorbed,hpDmg:Math.max(0,hpBefore-player.hp),tempAbsorbed};
    this.p8ConsumeShield(player,tempAbsorbed);this.p8RecordDamage(player,result,context);
    return result;
  }

  // 首領回合完全結束後清除超量生命
  clearTemporaryOverheal() {
    let anyCleared = false;
    for (const p of Object.values(this.players)) {
      const shield=(p.p8Shields||[]).reduce((n,s)=>n+s.value,0);
      if ((p.tempHp || 0) > shield) {
        p.tempHp = shield;
        p.hp = Math.min(p.hp, p.maxHp);
        anyCleared = true;
      }
    }
    return anyCleared;
  }

  // 取得即時生命狀態快照 (供 Presentation Queue 精準步進渲染)
  getHpSnapshot() {
    return {
      arena: this.arena ? {playerId:this.arena.playerId,until:this.arena.until} : null,
      monster: this.currentMonster ? {
        hp: Math.max(0, this.currentMonster.hp),
        maxHp: this.currentMonster.maxHp,
        name: this.currentMonster.name,
        statuses: [ ...p8State(this.currentMonster,this).phase8Statuses, ...(this.currentMonster.poisonTurns ? [{ id: 'poison', label: 'POISON', icon: 'poison', turns: this.currentMonster.poisonTurns, stacks: this.currentMonster.poisonDmg, isNegative:true,category:'DEBUFF',isDot:true }] : []),
          ...(this.roundModifiers?.monsterAttackReduction ? [{ id: 'attack_down', label: 'ATK DOWN', icon: 'debuff', turns: 1, value: this.roundModifiers.monsterAttackReduction }] : []) ]
      } : null,
      players: Object.values(this.players).map(p => ({
        id: p.id, name: p.name, role: p.role,
        hp: p.hp, druidForm: p.druidForm, druidFormTurns: p.druidFormTurns,
        downedForFloor: p.hp <= 0, cannotCrit: p.cannotCrit,
        stunnedNextTurn: p.stunnedNextTurn, nextTurnStunFlag: p.nextTurnStunFlag,
        archerNextDodgeBonus: p.archerNextDodgeBonus || 0,
        ...assassinState(p),
        ...p8State(p,this),
        statuses: playerStatuses(p, this, GAME_BALANCE),
        minions: structuredClone(p.minions || []),
        ammo: [...(p.ammo || [])], isCrouchedThisRound: !!p.isCrouchedThisRound,
        maxHp: p.maxHp,
        tempHp: p.tempHp || 0,
        displayHp: p.hp + (p.tempHp || 0),
        displayMaxHp: p.maxHp + (p.tempHp || 0)
      }))
    };
  }

  executeTurn() {
    this.executeRoundStart();
  }

  // 戰鬥回合流程 - Round Start (1. DoT 2. Regeneration 3. Abyssal Corruption 4. 其他回合初效果)
  executeRoundStart() {
    this.clearTimer();
    this.roundModifiers = { equipmentEffectMultiplier: 1.0, acidFlaskCount: 0 }; // 每回合初確保裝備倍率恢復 100%
    Object.values(this.players).forEach(p => { p.isCrouchedThisRound = false; });
    const alivePlayers = Object.values(this.players).filter(p => p.hp > 0);
    if (alivePlayers.length === 0) {
      this.handleGameOver();
      return;
    }

    const canFightLiving = Object.values(this.players).filter(p => p.hp > 0 && !p.isSurrendered);
    if (canFightLiving.length === 0 && this.currentMonster && (this.currentMonster.name === '暗影魔狼族長' || this.currentMonster.name.includes('暗影魔狼族長'))) {
      this.addLog(`👑🐺💀 **【血脈臣服·全隊潰敗】** 德魯伊處於狼王臣服狀態無法行動，且隊伍已無其他能戰鬥的生還隊友，冒險直接判定挑戰失敗！`, 'damage');
      this.handleGameOver();
      return;
    }

    const monster = this.currentMonster;
    const roundBefore = this.getHpSnapshot();
    const log = [];
    const visualEvents = [];

    const arenaQueue=[];
    this.p8LogBuffer = log; this.p8RoundStart(arenaQueue); this.p8LogBuffer = null;

    // Assassin reset -> decay -> hidden determination precedes every damage tick.
    for (const p of alivePlayers.filter(p => p.role === 'assassin')) {
      p.followUpsThisRound = 0; p.stealthBrokenThisRound = false;
      const old = p.stealthStacks || 0;
      const decay=this.battleRound>=3 && this.battleRound%3===0;
      p.stealthStacks = Math.max(0, old - (decay?1:0));
      p.isHiddenThisRound = p.stealthStacks > 0;
      if (old && decay) {
        log.push({ text: `**${p.name}**【匿蹤】層數降低 1，剩餘 ${p.stealthStacks}。`, type: 'buff' });
        visualEvents.push({ type: 'stealth_decay', targetId: p.id, label: '匿蹤 -1' });
      }
    }

    // 1. 流血撕裂傷害結算 (套用難度層數加成)
    if (monster && monster.baseHp < 100) {
      const bleedDmg = Math.floor(2 * getFloorDifficultyMultiplier(this.floor));
      for (const p of Object.values(this.players)) {
        if (p.hp > 0 && p.bleedTurns > 0) {
          p.bleedTurns -= 1;
          if (isAssassinHidden(p)) { visualEvents.push({ type: 'hidden_evade', targetId: p.id, label: '隱身・MISS', outcome: { type: 'dodge', stealth: true } }); log.push({ text: `**${p.name}** 的隱身阻止流血傷害。`, type: 'buff' }); continue; }
          const incoming=this.p8Incoming(p,bleedDmg,n=>n,{kind:'dot'});
          const received=this.applyDamageToPlayer(p,incoming.damage,{kind:'dot'});this.p8NightmareHeal(p,incoming.ownerId);
          visualEvents.push({ type: 'bleed', target: p.id, value: received.actualDmg });
          if (p.hp <= 0) {
            if (p.druidForm === 'treant') {
              p.hp = 1;
              p.druidForm = 'tree';
              p.druidFormTurns = 1;
              p.stunnedNextTurn = true;
              p.action = 'skip';
              p.isLocked = true;
              log.push({ text: `🪵 **${p.name}** 撕裂傷勢致命，觸發樹精守護！保留 1 點生命並化身為【沉睡古樹】，進入 1 回合休眠狀態（無法行動）！`, type: 'buff' });
              visualEvents.push({ type: 'transform_tree', sourceId: p.id });
            } else {
              p.hp = 0;
              this.clearPlayerDebuffs(p);
              if (p.druidForm === 'tree') {
                // Treant grants shield; maximum HP remains unchanged.
                p.druidForm = null;
                p.druidFormTurns = 0;
              }
              log.push({ text: `🩸 **${p.name}** 傷口惡化承受 **${bleedDmg}** 點撕裂傷害，傷重倒地！💀`, type: 'damage' });
            }
          } else {
            // Damage applied through the shared shield/HP owner.
            log.push({ text: `🩸 **${p.name}** 傷口持續撕裂，受到 **${bleedDmg}** 點額外傷害！（❤️ ${p.hp}/${p.maxHp}，剩餘流血: ${p.bleedTurns} 回合）`, type: 'damage' });
          }
        }
      }
    }

    // 3. 劇毒傷害結算 (回合初 DoT)
    if (monster && monster.hp > 0 && monster.poisonTurns > 0) {
      const pDmg = monster.poisonDmg || 5;
      monster.hp = Math.max(0, monster.hp - pDmg);
      monster.poisonTurns -= 1;
      if (monster.poisonTurns === 0) {
        monster.poisonDmg = 0;
      }
      visualEvents.push({ type: 'poison_damage', target: 'monster', value: pDmg });
      if (monster.hp <= 0) {
        log.push({ text: `🧪 **${monster.name}** 體內劇毒發作受到 **${pDmg}** 點毒傷倒下！💀`, type: 'damage' });
      } else {
        log.push({ text: `🧪 **${monster.name}** 劇毒發作受到 **${pDmg}** 點毒素傷害！（剩餘中毒: ${monster.poisonTurns} 回合，每回合 ${pDmg} 點）`, type: 'damage' });
      }
    }

    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && p.poisonTurns > 0) {
        const pDmg = p.poisonDmg || 5;
        p.poisonTurns -= 1;
        if (p.poisonTurns === 0) {
          p.poisonDmg = 0;
        }
        if (isAssassinHidden(p)) { visualEvents.push({ type: 'hidden_evade', targetId: p.id, label: '隱身・MISS', outcome: { type: 'dodge', stealth: true } }); log.push({ text: `**${p.name}** 的隱身阻止毒素傷害。`, type: 'buff' }); continue; }
        const incoming=this.p8Incoming(p,pDmg,n=>n,{kind:'dot'});
          const received=this.applyDamageToPlayer(p,incoming.damage,{kind:'dot'});this.p8NightmareHeal(p,incoming.ownerId);
          visualEvents.push({ type: 'poison_damage', target: p.id, value: received.actualDmg });
        if (p.hp <= 0) {
          if (p.druidForm === 'treant') {
            p.hp = 1;
            p.druidForm = 'tree';
            p.druidFormTurns = 1;
            p.stunnedNextTurn = true;
            p.action = 'skip';
            p.isLocked = true;
            log.push({ text: `🪵 **${p.name}** 劇毒致命，觸發樹精守護！保留 1 點生命並化身為【沉睡古樹】，進入 1 回合休眠狀態（無法行動）！`, type: 'buff' });
            visualEvents.push({ type: 'transform_tree', sourceId: p.id });
          } else {
            p.hp = 0;
            this.clearPlayerDebuffs(p);
            if (p.druidForm === 'tree') {
              // Treant grants shield; maximum HP remains unchanged.
              p.druidForm = null;
              p.druidFormTurns = 0;
            }
            log.push({ text: `🧪 **${p.name}** 劇毒發作受到 **${pDmg}** 點傷害，不幸身亡！💀`, type: 'damage' });
          }
        } else {
          // Damage applied through the shared shield/HP owner.
          log.push({ text: `🧪 **${p.name}** 劇毒灼燒受到 **${pDmg}** 點毒素傷害！（❤️ ${p.hp}/${p.maxHp}，剩餘中毒: ${p.poisonTurns} 回合，每回合 ${pDmg} 點）`, type: 'damage' });
        }
      }
    }

    // 4. 回合初狂亂殺戮曲代價扣除 (全隊扣除 20% 最大生命)
    if (this.frenzyTeamDrainTurns > 0) {
      this.frenzyTeamDrainTurns -= 1;
      for (const pl of Object.values(this.players)) {
        if (pl.hp > 0) {
          if (isAssassinHidden(pl)) { visualEvents.push({ type: 'hidden_evade', targetId: pl.id, label: '隱身・MISS', outcome: { type: 'dodge', stealth: true } }); continue; }
          const drain = Math.max(1, Math.round(pl.maxHp * 0.20));
          pl.hp = Math.max(1, pl.hp - drain);
          log.push({ text: `🩸 【狂亂殺戮曲】狂亂反噬代價生效！**${pl.name}** 承受 20% 最大生命反噬，扣除 **${drain}** 點生命！（❤️ ${pl.hp}/${pl.maxHp}）`, type: 'damage' });
          visualEvents.push({ type: 'self_damage', targetId: pl.id, value: drain });
        }
      }
    }
    if (this.frenzyTeamDrainNextTurn) {
      this.frenzyTeamDrainTurns = 1;
      this.frenzyTeamDrainNextTurn = false;
    }

    // 5. 祝福絲綢袍（詩人裝備）：每回合初自動為全隊當前生命最低的隊友補血
    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && p.role === 'bard') {
        const robeCount = (p.equips || []).filter(e => e.id === 'b_robe' || e.name === '祝福絲綢袍').length;
        if (robeCount > 0) {
          const livingAllies = Object.values(this.players).filter(pl => pl.hp > 0);
          if (livingAllies.length > 0) {
            livingAllies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
            const targetAlly = livingAllies[0];
            const healAmt = Math.max(1, Math.round(p.maxHp * 0.05 * robeCount));
            const actualGain = this.applyHealWithOverheal(targetAlly, healAmt);
            log.push({ text: `✨ **${p.name}** 的【祝福絲綢袍】散發生機微光，為傷勢最重的 **${targetAlly.name}** 回復了 **${actualGain}** 點生命！（❤️ ${targetAlly.hp + (targetAlly.tempHp || 0)}/${targetAlly.maxHp}）`, type: 'heal' });
            visualEvents.push({ type: 'heal', targetId: targetAlly.id, value: actualGain, label: '祝福絲綢袍' });
          }
        }
      }
    }

    if (visualEvents.length || log.length) {
      log.forEach(l => this.addLog(l.text, l.type));
      const after = this.getHpSnapshot();
      const display = structuredClone(arenaQueue.at(-1)?.hpSnapshot || roundBefore);
      const results = [];
      for (const ev of visualEvents) {
        const id = ev.targetId || ev.target || ev.sourceId;
        const target = snapshotTarget(display, id);
        if (!target) continue;
        const targetBefore = structuredClone(target);
        const finalTarget = snapshotTarget(after, id);
        const healing = ev.type === 'heal' || ev.type === 'regen';
        if (ev.value > 0) {
          if (healing) Object.assign(target, finalTarget);
          else target.hp = Math.max(0, target.hp - ev.value);
        } else Object.assign(target, finalTarget);
        if (target.hp === finalTarget?.hp) Object.assign(target, finalTarget);
        if (finalTarget?.druidForm === 'tree' && target.hp <= 0) Object.assign(target, finalTarget);
        results.push({ kind: healing ? 'heal' : ev.value > 0 || ev.type === 'hidden_evade' ? 'damage' : 'status', targetId: id,
          finalDamage: healing ? undefined : ev.value, actualHeal: healing ? ev.value : undefined,
          label: ev.label || (ev.type === 'poison_damage' ? 'POISON' : ev.type === 'bleed' ? 'BLEED' : ''),
          outcome: ev.outcome || { type: 'normal', protection: finalTarget?.druidForm === 'tree' },
          targetBefore, targetAfter: structuredClone(target), hpSnapshot: structuredClone(display) });
      }
      const roundQueue=[...arenaQueue,{ type: 'status_action', category: 'STATUS_TICK', skillName: 'ROUND ' + this.battleRound,
        monsterName: monster?.name, monsterAvatar: monster?.avatar, outcome: { type: 'normal' },
        hpSnapshotBefore: arenaQueue.at(-1)?.hpSnapshot || roundBefore, hpSnapshot: after, results }];
      if(this.arena&&this.players[this.arena.playerId]?.hp<=0)this.p8ExitArena(roundQueue,'gladiator_dead');
      this.publishCombatQueue(roundQueue,'round_start');
    } else this.startSkillSelection();
  }

  // 回合初效果 (DoT / Regen 等) 演出完畢回調
  handleRoundStartComplete(socketId = null) {
    if (this.selectionState !== 'ROUND_START') return;
    if (this.roundStartTimer) {
      clearTimeout(this.roundStartTimer);
      this.roundStartTimer = null;
    }
    this.startSkillSelection();
  }

  // 技能選擇流程啟動 (SELECTING -> SELECTED -> CONFIRM -> LOCKED -> ALL PLAYERS LOCKED -> RESOLVING)
  startSkillSelection() {
    this.state = 'IN_BATTLE';
    this.selectionState = 'SELECTING';
    this.isNarrating = false;

    for (const p of Object.values(this.players)) {
      // After round-start damage/control, pay only on a turn this Sage can act.
      this.p8PaySageDebt(p);
      if (p.hp <= 0) {
        p.action = null;
        p.isLocked = true;
      } else if (p.isSurrendered || p.druidForm === 'tree' || p.stunnedNextTurn || (this.arena && this.arena.playerId !== p.id)) {
        p.action = 'skip';
        p.isLocked = true;
      } else {
        p.action = null;
        p.targetPlayerId = null;
        p.isLocked = false;
      }
      p.isStealthed = false;
    }

    const isUltTurn = (this.battleRound % 3 === 0);
    if (isUltTurn && this.currentMonster) {
      this.addLog(`⚠️ **【警告：BOSS 正在蓄力必殺技【${this.currentMonster.ultName}】(1.35倍傷害)！】**`, 'warning');
    }

    // 嚴格遵守 P2-R1.1 Section 6：技能選擇 30 秒計時由客戶端 battle:selection_ready 驅動
    this.clearTimer();
    this.isWaitingForSelectionReady = true;
    this.pendingSelectionAcks = new Set(Object.values(this.players).filter(p => p.connected).map(p => p.id));

    this.broadcastState();
  }

  // 客戶端 Round Intro / Status Ticks 播放完畢、技能介面啟用確認 (P2-R1.1 Section 6)
  handleSelectionReady(socketId = null, round = this.battleRound) {
    if (this.state !== 'IN_BATTLE' || this.selectionState !== 'SELECTING' || round !== this.battleRound) return;
    if (!this.isWaitingForSelectionReady) return;
    if (!this.players[socketId]?.connected) return;
    this.pendingSelectionAcks.delete(socketId);
    if (this.pendingSelectionAcks.size) return;
    this.isWaitingForSelectionReady = false;
    if (this.selectionReadyTimer) {
      clearTimeout(this.selectionReadyTimer);
      this.selectionReadyTimer = null;
    }

    // 正式啟動 30 秒技能選擇倒數計時器
    this.setTimer(30, () => {
      if (this.state === 'IN_BATTLE' && this.selectionState === 'SELECTING') {
        this.addLog('⏱️ 回合時間截止，未行動者自動跳過回合！', 'warning');
        for (const p of Object.values(this.players)) {
          if (p.hp > 0 && !p.isLocked) {
            p.action = 'skip';
            p.isLocked = true;
          }
        }
        this.checkTurnCompletion();
      }
    });
    this.broadcastState();
    this.checkTurnCompletion();
  }

  // 玩家鎖定技能 (CONFIRM -> LOCKED)
  lockAction(socketId, actionId, targetPlayerId = null) {
    if (this.state !== 'IN_BATTLE') return { success: false, message: '目前非戰鬥回合' };
    if (this.selectionState !== 'SELECTING') return { success: false, message: '目前正在結算中，無法更改指令！' };
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (player.hp <= 0) return { success: false, message: '你已陣亡，無法行動' };
    if (this.arena && this.arena.playerId !== player.id) return {success:false,message:'死亡競技場期間無法行動'};
    if(player.role==='sage'&&player.sagePhase==='solve'&&player.sagePreviousAction===actionId)return {success:false,message:'求解階段不可重複上一回合的技能'};
    if (actionId === 'sa_tsubame' && (player.soul||0)<4) return {success:false,message:'燕返需要 4 劍魂'};
    if (actionId === 'dw_butterfly' && targetPlayerId !== 'monster' && (!this.players[targetPlayerId] || this.players[targetPlayerId].hp<=0)) return {success:false,message:'請指定存活隊友或魔物'};
    if (actionId === 'b_revive' && this.players[targetPlayerId]?.noReviveFloor===this.floor) return {success:false,message:'同歸於盡者本層不能甦生'};
    if (player.stunnedNextTurn) return { success: false, message: '你處於脫力虛脫中，本回合無法行動' };
    if (player.isSurrendered) return { success: false, message: '你陷入暗影魔狼族長的血脈壓制臣服狀態，無法行動！' };
    if (player.druidForm === 'tree') return { success: false, message: '你化身為古樹休眠中，本回合無法行動！' };

    if (actionId !== 'skip') {
      const availableSkills = getPlayerSkills(player);
      if (actionId === 'b_revive') {
        const deadPlayers = Object.values(this.players).filter(p => p.hp <= 0);
        if (deadPlayers.length === 0) return { success: false, message: '目前場上無倒下的隊友' };
        if (!targetPlayerId || !this.players[targetPlayerId] || this.players[targetPlayerId].hp > 0) {
          return { success: false, message: '請指定有效的陣亡隊友！' };
        }
      } else {
        const skill = availableSkills.find(s => s.id === actionId);
        if (!skill) return { success: false, message: '無效的技能' };
        if (actionId === 'dru_transform' && player.druidFormTurns > 0) {
          return { success: false, message: '當前形態轉變仍在持續中，結束後方可再次變身！' };
        }
        if ((actionId === 'dru_summon_treant' || actionId === 'dru_summon_wolf') &&
            ((player.cooldowns['dru_summon_treant'] || 0) > 0 || (player.cooldowns['dru_summon_wolf'] || 0) > 0)) {
          return { success: false, message: '自然呼喚技能冷卻中！' };
        }
        if ((actionId === 'a_reload' || actionId === 'a_frenzy_reload') && player.ammo && player.ammo.length >= 3) {
          return { success: false, message: '彈匣已滿（上限 3 枚），無法再裝填！' };
        }
        if (skill.hpBlocked) return { success: false, message: '生命小於等於1時不可施放一技能' };
        if ((player.cooldowns[skill.cooldownKey || actionId] || 0) > 0) return { success: false, message: '該技能冷卻中' };
      }
    }

    if (actionId === 'skip') {
      const hasCrossbow = (player.equips || []).some(e => e.id === 'a_crossbow' || e.name === '改良型重弩');
      if (player.role === 'archer' && hasCrossbow && player.ammo && player.ammo.length > 0) {
        player.ammo = [];
      }
    }

    player.action = actionId;
    player.targetPlayerId = targetPlayerId;
    player.isLocked = true;
    this.broadcastState();

    this.checkTurnCompletion();
    return { success: true };
  }

  clearPlayerAmmo(socketId) {
    const player = this.players[socketId];
    if (!player) return;
    const hasCrossbow = (player.equips || []).some(e => e.id === 'a_crossbow' || e.name === '改良型重弩');
    if (player.role === 'archer' && hasCrossbow && player.ammo && player.ammo.length > 0) {
      player.ammo = [];
      this.broadcastState();
    }
  }

  // 玩家取消鎖定 (允許在全員 Locked 前重新選擇)
  unlockAction(socketId) {
    if (this.state !== 'IN_BATTLE' || this.selectionState !== 'SELECTING') {
      return { success: false, message: '目前非選擇階段，無法取消鎖定' };
    }
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (player.hp <= 0 || player.stunnedNextTurn || player.isSurrendered || player.druidForm === 'tree') {
      return { success: false, message: '特殊狀態無法解鎖' };
    }

    player.isLocked = false;
    this.broadcastState();
    return { success: true };
  }

  // 兼容舊接口 submitAction
  submitAction(socketId, actionId, targetPlayerId = null) {
    return this.lockAction(socketId, actionId, targetPlayerId);
  }

  // 檢查是否全體存活玩家皆已鎖定
  checkTurnCompletion() {
    if (this.selectionState !== 'SELECTING' || this.isWaitingForSelectionReady) return;

    const livingPlayers = Object.values(this.players).filter(p => p.hp > 0 && p.connected && !p.stunnedNextTurn && !p.isSurrendered && p.druidForm !== 'tree');
    const allDone = Object.values(this.players).some(p => p.hp > 0) && livingPlayers.every(p => p.isLocked === true);

    if (allDone) {
      this.clearTimer();
      this.selectionState = 'RESOLVING';
      this.isNarrating = true;
      this.broadcastState();
      // 稍微延遲 300ms 讓畫面呈現 ALL PLAYERS LOCKED，再展開結算
      setTimeout(() => { if (this.state === 'IN_BATTLE' && this.selectionState === 'RESOLVING') this.resolveTurnActions(); }, 300);
    }
  }

  // 擊敗怪物勝利結算
  handleMonsterVictory(monster = this.currentMonster, log = [], visualEvents = [], skipEmit = false) {
    this.clearTimer();
    this.isNarrating = false;
    this.timerCallback = null;
    this.pausedRemainingSeconds = null;
    // 勝負判定：若敵方我方同時血量歸零，優先結算我方血量（判定為敵方勝利）
    const alivePlayers = Object.values(this.players).filter(p => p.hp > 0);
    if (alivePlayers.length === 0) {
      log.push({ text: `⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**`, type: 'damage' });
      log.forEach(l => this.addLog(l.text, l.type));
      if (!skipEmit) {
        this.io.to(this.code).emit('battle:visual_events', { events: visualEvents, round: this.battleRound, monsterKilled: true });
      }
      this.handleGameOver();
      return;
    }

    if (!monster) return;
    this.p8ExitArena();
    const victoryBefore = this.getHpSnapshot();
    for(const p of Object.values(this.players)){p.warriorStacks=0;p.p8Effects={};p.p8Shields=[];p.tempHp=0;}
    monster.hp = 0;
    log.push({ text: `🎉 **${monster.name} 倒下了！小隊成功突破第 ${this.floor} 層！**`, type: 'loot' });

    for (const p of Object.values(this.players)) {
      p.stunnedNextTurn = false;
      p.bleedTurns = 0;
      p.poisonTurns = 0;
      p.isSurrendered = false;
      if (p.druidForm === 'treant' || p.druidForm === 'tree') {
        // Treant grants shield; maximum HP remains unchanged.
        p.hp = Math.min(p.hp, p.maxHp);
      }
      if (p.druidForm === 'werewolf' && p.werewolfMaxHpDeducted) {
        p.maxHp += p.werewolfMaxHpDeducted;
        p.werewolfMaxHpDeducted = 0;
      }
      p.druidForm = null;
      p.druidFormTurns = 0;
      p.minions = [];
      p.minion = null;
      p.alcAcidEquipHalvedTurns = 0;

      // 戰鬥結束後直接刷新全角色所有技能 CD
      if (p.cooldowns) {
        for (const skillId of Object.keys(p.cooldowns)) {
          p.cooldowns[skillId] = 0;
        }
      }

      // 暗中提升詩人1技能數值
      if (p.role === 'bard') {
        p.bardHealGroupBonus = (p.bardHealGroupBonus || 0) + 2;
        p.bardHealSingleBonus = (p.bardHealSingleBonus || 0) + 2;
      }


    }

    this.alcShieldTurns = 0;
    this.alcVulnerableTurns = 0;
    this.alcVulnerableNextTurn = false;

    for (const p of Object.values(this.players)) { p.critTowardStealth = 0; p.isHiddenThisRound = false; p.followUpsThisRound = 0; p.stealthBrokenThisRound = false; }
    const recoveryBefore = this.getHpSnapshot();
    for (const p of Object.values(this.players)) {
      p.maxHp += 10;
      p.bonusAtk += 5;
      p.victoryAtkBonus = (p.victoryAtkBonus || 0) + 5;
      if (p.hp > 0) {
        const hpBeforeRecovery = p.hp;
        // maxHp already increased
        // bonusAtk already increased
        const healAmt = Math.max(1, Math.round(p.maxHp * 0.2));
        p.hp = Math.min(p.maxHp, p.hp + 10 + healAmt);
        log.push({ text: `💪 **${p.name}** HP上限 +10、攻擊力 +5，並恢復了 ${p.hp - hpBeforeRecovery} 生命（❤️ ${p.hp}/${p.maxHp}）`, type: 'heal' });
      } else {
        p.hp = 0;
        log.push({ text: `💪 **${p.name}** 雖已倒下，仍獲得戰鬥歷練：HP上限 +10、攻擊力 +5（HP 維持 0，待後續甦生）`, type: 'info' });
      }
    }

    const activeRoles = new Set(Object.values(this.players).map(p => p.role).filter(Boolean));
    const unplayedLoots = LOOT_TABLE.filter(l => !activeRoles.has(l.role));
    const playedLoots = this.getEligiblePlayedLoots(activeRoles);

    // 寶箱及戰鬥成功後可能會有低機率(15%)出現沒有玩家玩的職業裝備
    const isUnplayedDrop = unplayedLoots.length > 0 && Math.random() < 0.15;
    let drop = null;
    let equipOwner = null;

    if (isUnplayedDrop) {
      drop = unplayedLoots[Math.floor(Math.random() * unplayedLoots.length)];
      log.push({ text: `💨 沒玩家玩這個職業，系統幫你們把【${drop.name}】丟掉嘍`, type: 'warning' });
    } else {
      drop = (playedLoots.length > 0)
        ? playedLoots[Math.floor(Math.random() * playedLoots.length)]
        : LOOT_TABLE[Math.floor(Math.random() * LOOT_TABLE.length)];

      const matchingPlayers = Object.values(this.players).filter(p => p.role === drop.role);
      equipOwner = this.selectEquipOwner(matchingPlayers, drop) ||
        this.selectEquipOwner(Object.values(this.players).filter(p => p.hp > 0), drop) ||
        this.selectEquipOwner(Object.values(this.players), drop);

      if (equipOwner) {
        this.pendingDrop = {
          drop: drop,
          ownerId: equipOwner.id,
          ownerName: equipOwner.name,
          source: 'battle'
        };
        log.push({ text: `🎁 **【戰利品掉落】獲得裝備：【${drop.name}】**（${drop.desc}），等待 **${equipOwner.name}** 抉擇是否穿戴！`, type: 'loot' });
      }
    }

    log.forEach(l => this.addLog(l.text, l.type));
    const victoryAfter = this.getHpSnapshot();
    const results = victoryAfter.players.filter(p => p.hp > 0).map(p => ({ kind: 'heal', targetId: p.id,
      actualHeal: Math.max(0, p.hp - (snapshotTarget(recoveryBefore, p.id)?.hp || 0)),
      targetBefore: snapshotTarget(victoryBefore, p.id), targetAfter: p,
      outcome: { type: 'normal' }, hpSnapshot: victoryAfter }));
    this.victoryPresentationId += 1;
    this.currentVictory = { presentationId: this.victoryPresentationId, monsterName: monster.name,
      monsterAvatar: monster.avatar, rounds: this.battleRound,
      survivors: alivePlayers.length, partySize: Object.keys(this.players).length,
      story: '巨獸倒下後，籠罩在四周的污染逐漸散去……',
      hpBefore: victoryBefore, hpAfter: victoryAfter, results,
      drop, discarded: isUnplayedDrop, ownerName: equipOwner?.name,
      recoveryRule: 'HP 上限 +10、ATK +5；恢復 10 + 新 Max HP 的 20%' };
    this.victoryPendingDrop = this.pendingDrop;
    this.pendingDrop = null;
    this.state = 'BATTLE_VICTORY';
    this.victoryInteractionReady = false;
    this.pendingPresentationAcks = new Set(Object.values(this.players).filter(p => p.connected).map(p => p.id));
    this.broadcastState();
  }

  handleVictoryComplete(socketId, presentationId) {
    if (this.state !== 'BATTLE_VICTORY' || presentationId !== this.currentVictory?.presentationId || !this.players[socketId]?.connected || this.victoryInteractionReady) return;
    this.pendingPresentationAcks.delete(socketId);
    if (this.pendingPresentationAcks.size) return;
    this.victoryInteractionReady = true;
    this.pendingDrop = this.victoryPendingDrop;
    this.victoryPendingDrop = null;
    this.broadcastState();
  }

  continueAfterVictory(socketId, presentationId) {
    if (this.state !== 'BATTLE_VICTORY' || socketId !== this.leaderId ||
        presentationId !== this.currentVictory?.presentationId || !this.victoryInteractionReady || this.pendingDrop) return;
    this.currentVictory = null;
    this.advanceToNextFloorOrCheckpoint();
  }

  // 處理裝備領取 / 放棄 / 替換
  handleEquipChoice(socketId, action, replaceIndex = -1) {
    if (this.state === 'BATTLE_VICTORY' && !this.victoryInteractionReady) return { success: false, message: '勝利演出尚未完成' };
    if (!this.pendingDrop) return { success: false, message: '當前無待領取裝備' };
    if (this.pendingDrop.ownerId !== socketId) return { success: false, message: '非本裝備獲得者' };

    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };

    this.clearTimer();
    const drop = this.pendingDrop.drop;

    if (action === 'equip') {
      if (!canPlayerEquipItem(player, drop, replaceIndex)) {
        return { success: false, message: '此特殊裝備不可重複穿戴！' };
      }
      const capBefore = getAssassinFollowUpCap(player);
      const replaced = equipItemToPlayer(player, drop, replaceIndex);
      this.p8RefreshEquipment();
      const capAfter = getAssassinFollowUpCap(player);
      if (capAfter !== capBefore && player.role === 'assassin') this.addLog(`**${player.name}** 追擊上限 ${capBefore} → ${capAfter}；染毒刺刃暴擊率加成只生效一次。`, 'loot');
      if (replaced) {
        this.addLog(`🔄 **${player.name}** 卸下了【${replaced.name}】，替換並穿上了【${drop.name}】！(${formatPlayerEquips(player)})`, 'loot');
      } else {
        this.addLog(`🎒 **${player.name}** 穿上了【${drop.name}】！(${formatPlayerEquips(player)})`, 'loot');
      }
    } else {
      this.addLog(`🗑️ **${player.name}** 選擇放棄了【${drop.name}】。`, 'info');
    }

    this.pendingDrop = null;
    this.broadcastState();

    if (this.state !== 'BATTLE_VICTORY') setTimeout(() => {
      this.advanceToNextFloorOrCheckpoint();
    }, 700);
    return { success: true };
  }

  // 手動卸下裝備
  handleUnequip(socketId, equipIndex) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (!player.equips || equipIndex < 0 || equipIndex >= player.equips.length) {
      return { success: false, message: '無效的裝備欄位' };
    }

    const removed = unequipItemFromPlayer(player, equipIndex);
    this.p8RefreshEquipment();
    if (removed) {
      this.addLog(`🎒 **${player.name}** 手動卸下了【${removed.name}】。(${formatPlayerEquips(player)})`, 'info');
      this.broadcastState();
      return { success: true };
    }
    return { success: false, message: '卸下裝備失敗' };
  }

  // 戰鬥結算
  resolveTurnActions() {
    this.clearTimer();
    this.selectionState = 'RESOLVING';
    this.isNarrating = true;
    const monster = this.currentMonster;
    const log = [];
    const visualEvents = [];
    const narratives = [];
    const presentationQueue = [];
    const arenaRoundPlayerId=this.arena?.playerId;
    const roundSkillSets = new Map(Object.values(this.players).map(p => [p.id, getPlayerSkills(p)]));
    this.p8LogBuffer=log;

    let bardDmgMultiplier = 1.0;
    let bardDmgReduction = 1.0;
    let monsterAttackReduction = 0;
    let assassinDidCrit = false;
    let bardBuffActive = false;
    const bardOutcomes = new Map();
    const bardResistanceOutcomes = new Map();

    // ==========================================
    // PRE-RESOLUTION 階段
    // ==========================================
    // 1. 特殊規則：鍊金術士【腐蝕強酸瓶】或【不穩定試劑瓶】（50% 機率強酸）
    // 只要確認本回合使用腐蝕強酸瓶，必須在 PRE-RESOLUTION 階段就先套用 equipment modifier (全隊裝備效果降低 50%)。
    // IMPORTANT：此時不得顯示 Popup、Subtitle 或 Debuff Banner，提前播放任何提示動畫。
    // Logic timing ≠ Presentation timing，此效果隱蔽套用，直到鍊金術士演出時才揭露。
    // 嚴格保證僅限「本回合」，不得永久修改裝備屬性或跨回合疊加。
    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && p.action === 'alc_flask') {
        p.rolledFlaskType = Math.random() < 0.5 ? 'acid' : 'poison';
      }
    }
    const acidFlaskCount = Object.values(this.players).filter(p => p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && (p.action === 'alc_acid' || (p.action === 'alc_flask' && p.rolledFlaskType === 'acid'))).length;
    this.roundModifiers.equipmentEffectMultiplier = acidFlaskCount > 0 ? 0.5 : 1.0;
    this.roundModifiers.acidFlaskCount = acidFlaskCount;
    this.p8RefreshEquipment();

    // 改良型重弩：裝填動作預先啟用【架弩蹲伏】（減傷 20%、無法閃避）
    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && p.druidForm !== 'tree') {
        if (p.action === 'a_reload' || p.action === 'a_frenzy_reload') {
          p.isCrouchedThisRound = true;
        }
      }
    }

    // 重設本回合催眠狀態
    this.monsterStunnedThisRound = false;

    // 1. 詩人增傷 50% / 狂亂殺戮曲 70%
    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && p.druidForm !== 'tree') {
        if (p.action === 'b_frenzy') {
          bardDmgMultiplier = Math.max(bardDmgMultiplier, 1.70);
          this.frenzyTeamDrainNextTurn = true;

          log.push({ text: `🪕🔥 **${p.name}** 奏響【狂亂殺戮曲】！激發癲狂戰意，全隊本回合造成的傷害提高 70%！(⚠️ 狂亂代價：下回合全隊將扣除 20% 最大生命！)`, type: 'buff' });
        } else if (p.action === 'b_buff') {
          const harpCount = (p.equips || []).filter(e => e.id === 'b_harp' || e.name === '精靈木豎琴').length;
          const buffBoost = 0.50 * (1 + 0.10 * harpCount);
          bardDmgMultiplier = Math.max(bardDmgMultiplier, 1.0 + buffBoost);
          bardDmgReduction = 0.75;
          const resistanceReduced = this.monsterAllowsEffect('抗性降低');
          bardResistanceOutcomes.set(p.id, resistanceReduced);
          bardBuffActive = resistanceReduced || bardBuffActive;


          bardOutcomes.set(p.id, Math.random() < 0.25);

        }
      }
    }

    let phase8Actor = null;
    const applyResistanceDamage = (rawDmg, dmgType, options = {}) => {
      this.p8BossOutcome=null;
      const presentationCue={};this.p8DamagePresentationOutcomes?.push(presentationCue);
      if (!options.equation && dmgType!=='true') {
        const actor=options.actor||phase8Actor;
        rawDmg += this.p8Has(actor,'galaxy')?.value || 0;
        if(actor?.action!=='basic')rawDmg += this.p8Has(actor,'overload')?.value || 0;
      }
      if(!options.equation) {
        const triumphActor=options.actor||phase8Actor;
        const triumph=this.p8Has(triumphActor,'triumph');
        if(triumph)rawDmg=Math.floor(rawDmg*(1+triumph.value/100));
        if(this.p8Has(monster,'dissociate') || (this.p8Has(monster,'sage_exposed')?.starts<=this.battleRound))rawDmg=Math.floor(rawDmg*1.1);
      }
      if(options.equation&&rawDmg<=0)return {dmg:0,isResisted:false,resistPercent:0};
      const dream=this.p8DreamDamage(monster,rawDmg);
      if(dream) {
        this.p8BossOutcome=dream.outcome;
        presentationCue.type=dream.outcome;
        return {dmg:dream.damage,isResisted:false,resistPercent:0};
      }
      if(this.arena || dmgType==='true' || options.penetration===1)return {dmg:Math.max(0,Math.floor(rawDmg)),isResisted:false,resistPercent:0};
      const mirrored = Boolean(this.p8Has(monster, 'mirror'));
      const type = dmgType === 'phys' ? (mirrored ? 'magic' : 'physical') : (mirrored ? 'physical' : 'magic');
      const resistPercent = Math.max(0, getBossResistance(monster, type) - (bardBuffActive && !options.equation ? 5 : 0)) * (1 - (options.penetration || 0));
      const finalDmg = Math.floor(rawDmg * (1 - resistPercent / 100));
      return { dmg: Math.max(1, finalDmg), isResisted: resistPercent > 0, resistPercent };
    };

    // Owner follow-up retains the existing damage formula and one hit per living minion.
    const resolveMinionFollowUp = p => {
      const before = this.getHpSnapshot();
      const results = [];
      if (p.hp > 0) for (const m of p.minions || []) {
        if (m.hp <= 0 || monster.hp <= 0) continue;
        const targetBefore = structuredClone(this.getHpSnapshot().monster);
        const { dmg } = applyResistanceDamage(Math.floor(m.atk * bardDmgMultiplier), 'phys');
        monster.hp = Math.max(0, monster.hp - dmg);
        const snapshot = this.getHpSnapshot();
        results.push({ kind: 'damage', targetId: 'monster', minion: structuredClone(m),
          targetBefore, targetAfter: snapshot.monster, damageType: 'physical',
          finalDamage: dmg, outcome: { type: 'normal' }, hpSnapshot: snapshot });
        log.push({ text: `🐾 **${m.name}** 主動出擊造成 **${dmg}** 點傷害！`, type: 'combat' });
      }
      if (results.length) presentationQueue.push({ type: 'minion_action', category: 'MINION_ATTACK',
        sourceId: p.id, sourceRole: p.role, sourceName: p.name, druidForm: p.druidForm,
        skillName: '自然僕從・共擊', outcome: { type: 'normal' },
        targetId: 'monster', targetName: monster.name,
        monsterName: monster.name, monsterAvatar: monster.avatar,
        hpSnapshotBefore: before, hpSnapshot: this.getHpSnapshot(), results });
    };

    // 2. 玩家行動結算 (依照 Priority 順序：1.淨化 2.復活 3.防禦 4.增益 5.治療 6.變身/召喚 7.敵方減益 8.攻擊技能，同順位依穩定順序)
    const getEffectiveBonusAtk = (pl) => pl.role === 'assassin' ? this.getAssassinBonusAtk(pl) : this.getEffectiveBonusAtk(pl);
    const playerKeys = Object.keys(this.players);
    const sortedPlayers = Object.values(this.players)
      .filter(p => p.hp > 0)
      .sort((a, b) => {
        const prioA = getActionPriority(a.action);
        const prioB = getActionPriority(b.action);
        if (prioA !== prioB) return prioA - prioB;
        return playerKeys.indexOf(a.id) - playerKeys.indexOf(b.id);
      });

    for (const p of sortedPlayers) {
      if (monster.hp <= 0) break;
      if (arenaRoundPlayerId && arenaRoundPlayerId !== p.id) continue;
      phase8Actor=p; this.p8Results=null;this.p8DamagePresentationOutcomes=[];
      const beforeVisualCount = visualEvents.length;
      const beforeLogCount = log.length;
      const monsterHpBefore = monster.hp;
      const actorHpBefore = p.hp;
      const actionBefore = this.getHpSnapshot();
      this.actionHeals = [];
      this.actionCleansedSnapshot = null;
      let actionOutcome = { type: 'normal' };
      let pendingWerewolfAttack = null;
      if (p.isSurrendered) {
        log.push({ text: `🐺 **${p.name}** 陷入暗影魔狼族長的血脈壓制臣服狀態，無法行動！`, type: 'warning' });
        resolveMinionFollowUp(p);
        continue;
      }

      if (p.druidForm === 'tree') {
        log.push({ text: `🪵 **${p.name}** 化身為樹木休眠中，本回合無法行動！`, type: 'info' });
        resolveMinionFollowUp(p);
        continue;
      }

      if (p.stunnedNextTurn) {
        log.push({ text: `💫 **${p.name}** 處於脫力虛脫狀態，本回合無法行動，正在努力調整呼吸！`, type: 'warning' });
        resolveMinionFollowUp(p);
        continue;
      }

      if (p.hp <= 0) continue;

      if (p.action === 'skip') {
        const hasCrossbow = (p.equips || []).some(e => e.id === 'a_crossbow' || e.name === '改良型重弩');
        if (p.role === 'archer' && hasCrossbow && p.ammo && p.ammo.length > 0) {
          p.ammo = [];
          log.push({ text: `🏹 **${p.name}** 跳過了本回合，卸除並清空了重弩彈匣！`, type: 'info' });
        } else {
          log.push({ text: `⏭️ **${p.name}** 選擇了保留實力，跳過了本回合行動！`, type: 'info' });
        }
        resolveMinionFollowUp(p);
        continue;
      }

      if (!p.action) {
        log.push({ text: `⏳ **${p.name}** (${CLASSES[p.role]?.name || '勇者'}) 猶豫不決，本回合發呆！`, type: 'warning' });
        resolveMinionFollowUp(p);
        continue;
      }

      const hiddenBeforeAction = isAssassinHidden(p);
      let consumedStacks = 0;
      if (p.role === 'assassin' && (SKILL_CATEGORIES[p.action] || 'OFFENSIVE') === 'OFFENSIVE') {
        p.isHiddenThisRound = false; p.stealthBrokenThisRound = true;
      }
      const p8Action=this.p8Action(p,applyResistanceDamage,bardDmgMultiplier,visualEvents,log);
      if(p8Action) actionOutcome=p8Action.outcome;
      if(!p8Action) switch (p.action) {
        case 'basic': {
          const hasCrossbow = (p.equips || []).some(e => e.id === 'a_crossbow' || e.name === '改良型重弩');
          if (p.role === 'archer' && hasCrossbow && p.ammo && p.ammo.length > 0) {
            const count = p.ammo.length;
            const poolBonus = count === 1 ? 35 : (count === 2 ? 53 : 79);
            const basePool = 10 + poolBonus; // 45, 63, 89
            // 改良型重弩受強酸腐蝕時造成傷害不影響（裝備加成不減半）
            const effectiveBonusAtk = p.bonusAtk + (p.equips || []).reduce((sum, e) => sum + (e.bonusAtk || 0), 0);
            const totalPool = Math.floor((basePool + effectiveBonusAtk) * bardDmgMultiplier);
            const dmgPerArrow = Math.round(totalPool / count);

            const pierceCount = p.ammo.filter(a => a === 'pierce').length;
            const elementalCount = p.ammo.filter(a => a === 'elemental').length;
            const burstCount = p.ammo.filter(a => a === 'burst').length;

            let pierceDmg = 0;
            let pierceResisted = false;
            let pResPercent = 0;
            if (pierceCount > 0) {
              const rawPierce = dmgPerArrow * pierceCount;
              const res = applyResistanceDamage(rawPierce, 'phys');
              pierceDmg = res.dmg;
              pierceResisted = res.isResisted;
              pResPercent = res.resistPercent;
              monster.hp -= pierceDmg;
              visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: pierceDmg, isCrit: false, label: '穿甲箭齊射' });
            }

            let elementalDmg = 0;
            let eleResisted = false;
            let eResPercent = 0;
            if (elementalCount > 0) {
              const rawEle = dmgPerArrow * elementalCount;
              const res = applyResistanceDamage(rawEle, 'mag');
              elementalDmg = res.dmg;
              eleResisted = res.isResisted;
              eResPercent = res.resistPercent;
              monster.hp -= elementalDmg;
              visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: elementalDmg, isCrit: false, label: '元素箭齊射' });
            }

            let burstDmg = 0;
            let selfDmg = 0;
            if (burstCount > 0) {
              burstDmg = dmgPerArrow * burstCount;
              monster.hp -= burstDmg;
              selfDmg = burstDmg;
              p.hp = Math.max(0, p.hp - selfDmg);
              visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: burstDmg, isCrit: false, label: '爆裂箭齊射' });
              visualEvents.push({ type: 'self_damage', targetId: p.id, value: selfDmg, label: '爆裂自傷' });
            }

            const shotDetails = [];
            if (pierceCount > 0) {
              const resNote = pierceResisted ? ` (🛡️抗性減免${pResPercent}%)` : '';
              shotDetails.push(`🔴 穿甲箭 ×${pierceCount}：造成 **${pierceDmg}** 點【物理】傷害${resNote}`);
            }
            if (elementalCount > 0) {
              const resNote = eleResisted ? ` (🔮抗性減免${eResPercent}%)` : '';
              shotDetails.push(`🔵 元素箭 ×${elementalCount}：造成 **${elementalDmg}** 點【魔法】傷害${resNote}`);
            }
            if (burstCount > 0) {
              shotDetails.push(`💥 爆裂箭 ×${burstCount}：造成 **${burstDmg}** 點【真實】傷害，自身扣除等量 **${selfDmg}** 點真實生命！`);
            }

            const totalMonsterDmg = pierceDmg + elementalDmg + burstDmg;
            log.push({
              text: `🏹💥 **${p.name}** 消耗 ${count} 枚弩箭發動【重弩齊射】（每發分配基準 ${dmgPerArrow} 點）！\n${shotDetails.join('\n')}\n合計對魔物造成 **${totalMonsterDmg}** 點傷害！`,
              type: 'combat'
            });

            if (burstCount > 0 && p.hp <= 0) {
              p.hp = 0;
              this.clearPlayerDebuffs(p);
              log.push({ text: `💀 爆裂弩箭反噬重創！**${p.name}** 不幸陣亡！`, type: 'damage' });
            }

            p.ammo = [];
            actionOutcome = { type: 'volley', label: '重弩齊射', secondary: burstCount > 0 ? '爆裂自傷' : `${count}連發` };
            break;
          }

          const dmgType = (p.role === 'mage' || p.role === 'bard' || p.role === 'alchemist') ? 'mag' : 'phys';
          let baseAtk = 10;
          if (p.role === 'druid' && p.druidForm === 'werewolf') baseAtk = 35;
          if (p.role === 'druid' && p.druidForm === 'treant') baseAtk = Math.max(1, baseAtk - 5);
          const isGuaranteedCrit = (p.role === 'assassin' && this.battleCount === 1 && this.battleRound === 1 && !p.hasDealtFirstBattleCrit);
          const basicCrit = p.role === 'assassin' && (isGuaranteedCrit || Math.random() < assassinCritRate(p, this.roundModifiers.equipmentEffectMultiplier));
          if (p.role === 'assassin' && basicCrit) {
            p.hasDealtFirstBattleCrit = true;
          }
          const raw = Math.floor((baseAtk + getEffectiveBonusAtk(p)) * (basicCrit ? 2 : 1) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, dmgType);
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
          const typeNote = dmgType === 'mag' ? '【魔法】' : '【物理】';
          log.push({ text: `🗡️ **${p.name}** 施展${typeNote}【普通攻擊】${basicCrit ? '（暴擊！）' : ''}，對怪物造成 **${dmg}** 點傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType, value: dmg, isCrit: basicCrit, label: '普通攻擊' });
          if (p.role === 'assassin' && p.cannotCrit) p.cannotCrit = false;
          break;
        }
        case 'w_strike': {
          this.p8Effect(p,'warrior_resolve','堅定・減傷 60%',3,{icon:'guard'});
          const hasGreatsword = (p.equips || []).some(e => e.id === 'w_greatsword' || e.name === '雙手劍');
          const normalBase = hasGreatsword ? 25 : 18;
          const isUnbalanced = Math.random() < 0.20;
          if (isUnbalanced) actionOutcome = { type: 'imbalance', label: '失衡', secondary: '下回合易傷' };
          if (isUnbalanced) {
            const raw = Math.floor((5 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            p.warriorVulnerableNextTurn = true;
            const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🛡️⚠️ **${p.name}** 揮動巨劍時【揮砍失衡】！僅造成 **${dmg}** 點【物理】傷害${resNote}，失去重心導致下回合自身受傷 +20%！`, type: 'warning' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '堅定斬擊(失衡)' });
          } else {
            const raw = Math.floor((normalBase + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🛡️ **${p.name}** 揮動巨劍斬擊，對怪物造成 **${dmg}** 點【物理】重創！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '堅定斬擊' });
          }
          break;
        }
        case 'w_shield': {
          for(const ally of Object.values(this.players).filter(x=>x.hp>0))this.p8GrantShield(ally,p.maxHp*.4,1,'warrior');
          const isCracked = Math.random() < 0.25;
          p.shieldCrackedThisTurn = isCracked;
          if (isCracked) actionOutcome = { type: 'shield_crack', label: '盾牌龜裂', secondary: '冷卻延長' };
          if (isCracked) {
            log.push({ text: `🛡️💥 **${p.name}** 築起【壁壘守護】！全隊獲得戰士最大生命40%護盾，但盾面發生【盾牌龜裂】，技能 CD 額外延長 1 回合！`, type: 'warning' });
          } else {
            log.push({ text: `🛡️ **${p.name}** 築起【壁壘守護】！全隊獲得戰士最大生命40%護盾！`, type: 'buff' });
          }
          visualEvents.push({ type: 'shield_cast', sourceId: p.id, label: '壁壘守護' });
          break;
        }
        case 'w_cleave': {
          const raw = Math.floor((40 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
          log.push({ text: `⚔️ **${p.name}** 雙手緊握巨劍掀起暴風，發動【狂怒重劈】造成 **${dmg}** 點【物理】重創！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '狂怒重劈' });
          break;
        }
        case 'm_blast': {
          const isBackfire = Math.random() < 0.25;
          if (isBackfire) actionOutcome = { type: 'misfire', label: '法力走火' };
          if (isBackfire) {
            const raw = Math.floor((10 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
            monster.hp -= dmg;
            p.hp = Math.max(0, p.hp - 10);
            const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
            log.push({ text: `🧙‍♂️💥 **${p.name}** 引導【奧術爆破】不幸【法力走火】！僅造成 **${dmg}** 點【魔法】傷害${resNote}，且自身受到 **10** 點反噬自傷！（❤️ ${p.hp}/${p.maxHp}）`, type: 'damage' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '奧術爆破(走火)' });
            visualEvents.push({ type: 'self_damage', targetId: p.id, value: 10 });
            if (p.hp <= 0) {
              p.hp = 0;
              this.clearPlayerDebuffs(p);
              log.push({ text: `💀 **${p.name}** 因奧術法力走火反噬過重倒地陣亡！`, type: 'damage' });
            }
          } else {
            const raw = Math.floor((45 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
            log.push({ text: `🧙‍♂️ **${p.name}** 引爆【奧術爆破】，轟出 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '奧術爆破' });
          }

          // 嗜血法袍特殊效果
          const robeCount = (p.equips || []).filter(e => e.id === 'm_robe' || e.name === '嗜血法袍').length;
          if (robeCount > 0 && monster.hp > 0) {
            const extraDmgRaw = Math.floor((monster.maxHp || monster.hp) * 0.10 * robeCount);
            const actualBonus = Math.min(monster.hp, Math.max(1, extraDmgRaw));
            monster.hp -= actualBonus;
            for (const ally of Object.values(this.players)) {
              if (ally.hp > 0) this.applyHealWithOverheal(ally, actualBonus);
            }
            log.push({ text: `🩸 **${p.name}** 觸發【嗜血法袍】！額外撕裂目標 **${actualBonus}** 點生命，並轉化血氣為全體隊友回復 **${actualBonus}** 點生命！`, type: 'heal' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: actualBonus, singleTargetId: null, singleValue: 0 });
          }
          break;
        }
        case 'm_drain': {
          const rawBase = Math.floor(Math.random() * 50) + 1; // 1~40 極端浮動
          const raw = Math.floor((rawBase + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const healAmt = Math.max(0, Math.round(Math.min(monsterHpBefore, dmg) * 0.2));
          this.applyHealCapped(p, healAmt);
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          log.push({ text: `🩸 **${p.name}** 施展【生命汲取】(浮動擲骰: ${rawBase})，造成 **${dmg}** 點【魔法】傷害${resNote}，並吸取其 20%（恢復了 **${healAmt}** 點生命）！（❤️ ${p.hp}/${p.maxHp}）`, type: 'heal' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '生命汲取' });
          visualEvents.push({ type: 'heal', targetId: p.id, value: healAmt, label: '生命汲取' });

          // 嗜血法袍特殊效果
          const robeCount = (p.equips || []).filter(e => e.id === 'm_robe' || e.name === '嗜血法袍').length;
          if (robeCount > 0 && monster.hp > 0) {
            const extraDmgRaw = Math.floor((monster.maxHp || monster.hp) * 0.10 * robeCount);
            const actualBonus = Math.min(monster.hp, Math.max(1, extraDmgRaw));
            monster.hp -= actualBonus;
            for (const ally of Object.values(this.players)) {
              if (ally.hp > 0) this.applyHealWithOverheal(ally, actualBonus);
            }
            log.push({ text: `🩸 **${p.name}** 觸發【嗜血法袍】！額外撕裂目標 **${actualBonus}** 點生命，並轉化血氣為全體隊友回復 **${actualBonus}** 點生命！`, type: 'heal' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: actualBonus, singleTargetId: null, singleValue: 0 });
          }
          break;
        }
        case 'a_shot': {
          const isMiss = Math.random() < 0.20;
          if (isMiss) {
            p.archerNextDodgeBonus = GAME_BALANCE.archerMissNextDodgeBonus;
            actionOutcome = { type: 'miss', label: 'MISS', secondary: '下一次閃避率提高' };
            log.push({ text: `🏹💨 **${p.name}** 屏息狙擊受到亂流影響，【箭矢脫靶 MISS】！下一次閃避檢定成功率提高 20 個百分點（檢定後消耗）。`, type: 'warning' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: 0, isCrit: false, label: '精準狙擊(脫靶)' });
          } else {
            const raw = Math.floor((35 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🛡️️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🏹 **${p.name}** 射出精準箭矢，造成 **${dmg}** 點【物理】傷害！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '精準狙擊' });
          }
          break;
        }
        case 'a_rain': {
          const attackReduced = this.monsterAllowsEffect('攻擊降低');
          if (attackReduced) monsterAttackReduction += 10;
          this.roundModifiers.monsterAttackReduction = monsterAttackReduction;
          const raw = Math.floor((20 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const isTurbulence = Math.random() < 0.20;
          if (isTurbulence) actionOutcome = { type: 'friendly_fire', label: '氣流干擾' };
          if (isTurbulence) {
            const livingAllies = Object.values(this.players).filter(pl => pl.hp > 0);
            if (livingAllies.length > 0) {
              const victim = livingAllies[Math.floor(Math.random() * livingAllies.length)];
              const friendlyDamage = isAssassinHidden(victim) ? 0 : 10;
              victim.hp = Math.max(0, victim.hp - friendlyDamage);
              log.push({ text: `🏹🌪️ **${p.name}** 召喚【箭雨壓制】，造成 **${dmg}** 點【魔法】傷害${resNote}${attackReduced ? '並削弱怪物 10 點攻擊' : '；怪物免疫攻擊降低'}！但引發【狂風亂流】，偏折箭矢${friendlyDamage ? '誤傷' : '穿過隱身殘影'} **${victim.name}** ${friendlyDamage} 點傷害！（❤️ ${victim.hp}/${victim.maxHp}）`, type: 'warning' });
              visualEvents.push({ type: 'self_damage', targetId: victim.id, value: friendlyDamage, outcome: friendlyDamage ? { type: 'normal' } : { type: 'dodge', stealth: true } });
              if (victim.hp <= 0) {
                victim.hp = 0;
                this.clearPlayerDebuffs(victim);
                log.push({ text: `💀 **${victim.name}** 不幸被流彈誤傷陣亡！`, type: 'damage' });
              }
            }
          } else {
            log.push({ text: `🏹 **${p.name}** 召喚【箭雨壓制】，造成 **${dmg}** 點【魔法】傷害${resNote}${attackReduced ? '並削弱怪物 10 點攻擊' : '；怪物免疫攻擊降低'}！`, type: 'combat' });
          }
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '箭雨壓制' });
          break;
        }
        case 'a_reload': {
          p.ammo = p.ammo || [];
          const acidLayers = (this.roundModifiers?.acidFlaskCount || 0) + (p.alcAcidStack || 0);
          // 每層腐蝕效果將減少一隻箭矢裝填，最低保底裝一箭矢
          const reloadCount = Math.max(1, 1 - acidLayers);
          let newAmmo = null;
          if (p.ammo.length < 3 && reloadCount > 0) {
            newAmmo = rollCrossbowAmmo();
            p.ammo.push(newAmmo);
          }
          p.isCrouchedThisRound = true;
          actionOutcome = { type: 'reload', label: '戰術上膛', secondary: '架弩蹲伏' };
          const ammoIcons = p.ammo.map(getCrossbowAmmoIcon).join('');
          const acidNote = acidLayers > 0 ? '（⚠️ 受到強酸腐蝕影響，觸發最低保底裝填 1 枚）' : '';
          log.push({ text: `🏹🔧 **${p.name}** 執行【戰術上膛】，裝填了 1 枚【${getCrossbowAmmoLabel(newAmmo)}】！${acidNote}（現有彈藥：${ammoIcons} [${p.ammo.length}/3]）`, type: 'combat' });
          log.push({ text: `🛡️ **${p.name}** 蹲伏裝填弩箭，受傷降低 20% 但無法閃避。`, type: 'buff' });
          visualEvents.push({ type: 'crouch_reload', sourceId: p.id, ammo: newAmmo, currentAmmo: [...p.ammo] });
          break;
        }
        case 'a_frenzy_reload': {
          p.ammo = p.ammo || [];
          const missing = Math.max(0, 3 - p.ammo.length);
          const acidLayers = (this.roundModifiers?.acidFlaskCount || 0) + (p.alcAcidStack || 0);
          // 每層腐蝕效果將減少一隻箭矢裝填，最低保底裝一箭矢
          const reloadCount = Math.min(missing, Math.max(1, missing - acidLayers));
          const rolledList = [];
          for (let i = 0; i < reloadCount; i++) {
            const a = rollCrossbowAmmo();
            p.ammo.push(a);
            rolledList.push(a);
          }
          p.isCrouchedThisRound = true;
          actionOutcome = { type: 'frenzy_reload', label: '極速狂熱裝填', secondary: '架弩蹲伏' };
          const ammoIcons = p.ammo.map(getCrossbowAmmoIcon).join('');
          const rolledLabels = rolledList.map(getCrossbowAmmoLabel).join('、');
          const acidNote = (acidLayers > 0)
            ? `（⚠️ 受到強酸腐蝕 ${acidLayers} 層影響減少 ${missing - reloadCount} 枚裝填，${missing > reloadCount ? `實裝 ${reloadCount} 枚` : '觸發最低保底裝填 1 枚'}）`
            : '';
          log.push({ text: `🏹⚡ **${p.name}** 執行【極速狂熱裝填】，裝填了 ${reloadCount} 枚弩箭（${rolledLabels}）！${acidNote}（現有彈藥：${ammoIcons} [${p.ammo.length}/3]）`, type: 'combat' });
          log.push({ text: `🛡️ **${p.name}** 蹲伏裝填弩箭，受傷降低 20% 但無法閃避。`, type: 'buff' });
          visualEvents.push({ type: 'crouch_reload', sourceId: p.id, rolled: rolledList, currentAmmo: [...p.ammo] });
          break;
        }
        case 's_stab': {
          const isGuaranteedCrit = (this.battleCount === 1 && this.battleRound === 1 && !p.hasDealtFirstBattleCrit);
          const isCrit = isGuaranteedCrit || Math.random() < assassinCritRate(p, this.roundModifiers.equipmentEffectMultiplier);
          if (isCrit) {
            p.hasDealtFirstBattleCrit = true;
          }
          const raw = Math.floor((ASSASSIN_BALANCE.skill1BaseDamage + getEffectiveBonusAtk(p)) * (isCrit ? 2 : 1) * bardDmgMultiplier);
          const { dmg } = applyResistanceDamage(raw, 'phys'); monster.hp -= dmg;
          p.assassinSkill1Crit = isCrit; assassinDidCrit = isCrit;
          actionOutcome = { type: isCrit ? 'critical' : 'normal', label: isCrit ? 'CRITICAL' : '', secondary: isCrit ? '冷卻重置' : '' };
          log.push({ text: `**${p.name}** 暗影刺殺${isCrit ? '暴擊・冷卻重置' : ''}，造成 **${dmg}** 點傷害。`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit, label: '暗影刺殺' });
          break;
        }
        case 's_smoke': {
          consumedStacks = p.stealthStacks || 0; p.stealthStacks = 0;
          const base = ASSASSIN_BALANCE.skill2BaseDamage * (1 + consumedStacks * ASSASSIN_BALANCE.skill2StackMultiplier);
          // null eligibility deliberately rolls no crit until specification is confirmed.
          const { dmg } = applyResistanceDamage(Math.floor((base + getEffectiveBonusAtk(p)) * bardDmgMultiplier), 'phys');
          monster.hp -= dmg;
          log.push({ text: `**${p.name}** 消耗 ${consumedStacks} 層【匿蹤】發動暗影爆襲，造成 **${dmg}** 點傷害。`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '暗影爆襲' });
          break;
        }
        case 'b_heal': {
          const harpCount = (p.equips || []).filter(e => e.id === 'b_harp' || e.name === '精靈木豎琴').length;
          const harpMult = 1 + 0.10 * harpCount;
          const isOffKey = Math.random() < 0.20;
          if (isOffKey) actionOutcome = { type: 'off_key', label: '走音' };

          if (isOffKey) {
            const groupHeal = Math.round(5 * harpMult);
            for (const ally of Object.values(this.players)) {
              if (ally.hp > 0) this.applyHealWithOverheal(ally, groupHeal);
            }
            log.push({ text: `🪕😖 **${p.name}** 撥弄琴弦時【刺耳走音】！刺耳噪音打亂了旋律，全體隊友僅能回復 **${groupHeal}** 點生命！`, type: 'warning' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: groupHeal, singleTargetId: null, singleValue: 0 });
          } else {
            const groupHealAmt = Math.round((22 + (p.bardHealGroupBonus || 0)) * harpMult);
            const singleHealAmt = Math.round((28 + (p.bardHealSingleBonus || 0)) * harpMult);

            for (const ally of Object.values(this.players)) {
              if (ally.hp > 0) this.applyHealWithOverheal(ally, groupHealAmt);
            }

            const targetAlly = this.players[p.targetPlayerId] || p;
            if (targetAlly && targetAlly.hp > 0) {
              this.applyHealWithOverheal(targetAlly, singleHealAmt);
              log.push({ text: `🪕 **${p.name}** 奏響【治癒頌歌】！全體隊友回復 **${groupHealAmt}** HP，並專注為 **${targetAlly.name}** 額外回復了 **${singleHealAmt}** HP！`, type: 'heal' });
              visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: groupHealAmt, singleTargetId: targetAlly.id, singleValue: singleHealAmt });
            } else {
              log.push({ text: `🪕 **${p.name}** 奏響【治癒頌歌】！全體存活隊友回復了 **${groupHealAmt}** 點生命值！`, type: 'heal' });
              visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: groupHealAmt, singleTargetId: null, singleValue: 0 });
            }
          }
          break;
        }
        case 'b_nocturne': {
          const raw = Math.floor((15 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const isStun = Math.random() < 0.30 && this.monsterAllowsEffect('催眠');
          if (isStun) {
            actionOutcome = { type: 'sleep', label: '催眠成功' };
            this.monsterStunnedThisRound = true;
            log.push({ text: `🪕💤 **${p.name}** 奏響【催眠夜曲】，造成 **${dmg}** 點【魔法】傷害${resNote}！魔性琴音成功催眠 **${monster.name}**，使其本回合無法行動！`, type: 'combat' });
          } else {
            log.push({ text: `🪕 **${p.name}** 奏響【催眠夜曲】，造成 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
          }
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '催眠夜曲' });
          break;
        }
        case 'b_frenzy': {
          const raw = Math.floor((20 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          log.push({ text: `🪕🔥 **${p.name}** 奏響【狂亂殺戮曲】，轟出 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '狂亂殺戮曲' });
          break;
        }
        case 'b_buff': {
          this.bardBuffActive = true;
          const overdrawn = bardOutcomes.get(p.id);
          visualEvents.push({ type: 'bard_buff', sourceId: p.id });
          if (overdrawn) {
            actionOutcome = { type: 'overload', label: '節奏過激' };
            for (const ally of Object.values(this.players)) if (ally.hp > 0) {
              const oldHp = ally.hp;
              if (isAssassinHidden(ally)) { visualEvents.push({ type: 'hidden_evade', targetId: ally.id, value: 0, outcome: { type: 'dodge', stealth: true } }); continue; }
              ally.hp = Math.max(1, ally.hp - 5);
              visualEvents.push({ type: 'self_damage', targetId: ally.id, value: oldHp - ally.hp });
            }
          }
          log.push({ text: `🪕 **${p.name}** 奏響【狂熱協奏】！全隊增傷、減傷，${bardResistanceOutcomes.get(p.id) ? '敵方物魔抗性降低 5 個百分點' : '敵方免疫抗性降低'}。${overdrawn ? '節奏過激，隊友受到反噬！' : ''}`, type: 'buff' });
          break;
        }

        case 'b_revive': {
          const revivedPlayer = this.players[p.targetPlayerId];
          if (revivedPlayer && revivedPlayer.hp <= 0) {
            revivedPlayer.downedForFloor = false;
            revivedPlayer.downedFloor = null;
            if(revivedPlayer.noReviveFloor===this.floor)break;
            revivedPlayer.hp = Math.max(1, Math.floor(revivedPlayer.maxHp * 0.35));
            p.nextTurnStunFlag = true;
            revivedPlayer.nextTurnStunFlag = true;
            log.push({ text: `🕊️✨ **${p.name}** 唱響了神聖奇蹟【甦生之歌】！將倒下的 **${revivedPlayer.name}** 喚醒歸隊（恢復了 **${revivedPlayer.hp}** 點生命）！*(⚠️ 代價生效：下一回合兩人都將脫力無法行動！)*`, type: 'heal' });
            visualEvents.push({ type: 'revive', sourceId: p.id, targetId: revivedPlayer.id, value: revivedPlayer.hp });
          }
          break;
        }

        // 鍊金術士技能
        case 'alc_flask': {
          const flaskType = p.rolledFlaskType || (Math.random() < 0.5 ? 'acid' : 'poison');
          const isAcid = flaskType === 'acid';
          actionOutcome = { type: isAcid ? 'alchemy_acid' : 'alchemy_poison', label: isAcid ? '腐蝕強酸' : '劇毒煙霧' };
          const buretteCount = (p.equips || []).filter(e => e.id === 'alc_burette' || e.name === '精密滴定管' || e.name === '精密滴管').length;

          if (isAcid) {
            const selfDmg = 0;
            const raw = Math.floor((40 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
            monster.hp -= dmg;
            for(const ally of Object.values(this.players).filter(x=>x.hp>0)) {
              const incoming=this.p8Incoming(ally,20,n=>this.p8MitigateFriendly(ally,n),{kind:'friendly'});
              const res=this.applyDamageToPlayer(ally,incoming.damage,{kind:'friendly'});
              this.p8NightmareHeal(ally,incoming.ownerId);
              visualEvents.push({type:'self_damage',targetId:ally.id,value:res.hpDmg+res.tempAbsorbed});
              log.push({text:ally.name+'受到強酸飛濺 '+(res.hpDmg+res.tempAbsorbed)+' 傷害。',type:'damage'});
              if(ally.hp<=0)this.clearPlayerDebuffs(ally);
            }
            const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
            const buretteNote = buretteCount > 0 ? ' (🧪精密滴管移除自傷)' : '';
            log.push({ text: `⚗️ **${p.name}** 投擲【不穩定試劑瓶】觸發了【腐蝕強酸】！造成 **${dmg}** 點【魔法】傷害！${resNote}${selfDmg > 0 ? ` 自身受到 **${selfDmg}** 點自傷！` : buretteNote + '！'}⚠️ 強酸飛濺腐蝕全隊裝備，本回合全體裝備效果降低 50%！（❤️ ${p.hp}/${p.maxHp}）`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '不穩定試劑瓶(強酸)' });
            if (selfDmg > 0) {
              visualEvents.push({ type: 'self_damage', targetId: p.id, value: selfDmg });
            }
            if (p.hp <= 0) {
              p.hp = 0;
              this.clearPlayerDebuffs(p);
              log.push({ text: `💥 **${p.name}** 因強酸自傷過重倒地陣亡！💀`, type: 'damage' });
            }
          } else {
            const selfDmg = buretteCount > 0 ? 0 : 5;
            const raw = Math.floor((30 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
            monster.hp -= dmg;
            p.hp = Math.max(0, p.hp - selfDmg);
            const addedPoisonDmg = 5;
            const bossPoisoned = this.applyMonsterPoison(addedPoisonDmg);
            for (const pl of Object.values(this.players)) {
              if (pl.hp > 0) {
                pl.poisonTurns = 2; // 持續時間刷新回 2 回合
                pl.poisonDmg = (pl.poisonDmg || 0) + addedPoisonDmg; // 毒傷疊加
              }
            }
            const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
            const buretteNote = buretteCount > 0 ? ' (🧪精密滴管移除自傷)' : '';
            log.push({ text: `🧪 **${p.name}** 投擲【不穩定試劑瓶】引爆了【劇毒煙霧】！造成 **${dmg}** 點【魔法】傷害！${resNote}${selfDmg > 0 ? ` 自身受到 **${selfDmg}** 點自傷！` : buretteNote + '！'}濃烈毒霧覆蓋全場，**隊友陷入劇毒；${bossPoisoned ? `敵方毒傷疊加至每回合 ${monster.poisonDmg} 點，持續 2 回合` : '敵方免疫本次劇毒'}**！`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '不穩定試劑瓶(劇毒)' });
            if (selfDmg > 0) {
              visualEvents.push({ type: 'self_damage', targetId: p.id, value: selfDmg });
            }
            if (p.hp <= 0) {
              p.hp = 0;
              this.clearPlayerDebuffs(p);
              log.push({ text: `💥 **${p.name}** 因毒霧自傷倒地陣亡！💀`, type: 'damage' });
            }
          }
          break;
        }

        case 'alc_acid': {
          actionOutcome = { type: 'alchemy_acid', label: '腐蝕強酸' };
          const buretteCount = (p.equips || []).filter(e => e.id === 'alc_burette' || e.name === '精密滴定管' || e.name === '精密滴管').length;
          const selfDmg = 0;
          const raw = Math.floor((40 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          for(const ally of Object.values(this.players).filter(x=>x.hp>0)) {
              const incoming=this.p8Incoming(ally,20,n=>this.p8MitigateFriendly(ally,n),{kind:'friendly'});
              const res=this.applyDamageToPlayer(ally,incoming.damage,{kind:'friendly'});
              this.p8NightmareHeal(ally,incoming.ownerId);
              visualEvents.push({type:'self_damage',targetId:ally.id,value:res.hpDmg+res.tempAbsorbed});
              log.push({text:ally.name+'受到強酸飛濺 '+(res.hpDmg+res.tempAbsorbed)+' 傷害。',type:'damage'});
              if(ally.hp<=0)this.clearPlayerDebuffs(ally);
            }
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const buretteNote = buretteCount > 0 ? ' (🧪精密滴管移除自傷)' : '';
          log.push({ text: `⚗️ **${p.name}** 投擲【腐蝕強酸瓶】，造成 **${dmg}** 點【魔法】傷害！${resNote}${selfDmg > 0 ? ` 自身受到 **${selfDmg}** 點自傷！` : buretteNote + '！'}⚠️ 強酸飛濺腐蝕全隊裝備，本回合全體裝備效果降低 50%！（❤️ ${p.hp}/${p.maxHp}）`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '腐蝕強酸瓶' });
          if (selfDmg > 0) {
            visualEvents.push({ type: 'self_damage', targetId: p.id, value: selfDmg });
          }
          if (p.hp <= 0) {
            p.hp = 0;
            this.clearPlayerDebuffs(p);
            log.push({ text: `💥 **${p.name}** 因強酸自傷過重倒地陣亡！💀`, type: 'damage' });
          }
          break;
        }

        case 'alc_poison': {
          actionOutcome = { type: 'alchemy_poison', label: '劇毒煙霧' };
          const buretteCount = (p.equips || []).filter(e => e.id === 'alc_burette' || e.name === '精密滴定管' || e.name === '精密滴管').length;
          const selfDmg = buretteCount > 0 ? 0 : 5;
          const raw = Math.floor((30 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          p.hp = Math.max(0, p.hp - selfDmg);
          const addedPoisonDmg = 5;
          const bossPoisoned = this.applyMonsterPoison(addedPoisonDmg);
          for (const pl of Object.values(this.players)) {
            if (pl.hp > 0) {
              pl.poisonTurns = 2; // 持續時間刷新回 2 回合
              pl.poisonDmg = (pl.poisonDmg || 0) + addedPoisonDmg; // 毒傷疊加
            }
          }
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const buretteNote = buretteCount > 0 ? ' (🧪精密滴管移除自傷)' : '';
          log.push({ text: `🧪 **${p.name}** 引爆【劇毒煙霧瓶】，造成 **${dmg}** 點【魔法】傷害！${resNote}${selfDmg > 0 ? ` 自身受到 **${selfDmg}** 點自傷！` : buretteNote + '！'}濃烈毒霧覆蓋全場，**隊友陷入劇毒；${bossPoisoned ? `敵方毒傷疊加至每回合 ${monster.poisonDmg} 點，持續 2 回合` : '敵方免疫本次劇毒'}**！`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '劇毒煙霧瓶' });
          if (selfDmg > 0) {
            visualEvents.push({ type: 'self_damage', targetId: p.id, value: selfDmg });
          }
          if (p.hp <= 0) {
            p.hp = 0;
            this.clearPlayerDebuffs(p);
            log.push({ text: `💥 **${p.name}** 因毒霧自傷倒地陣亡！💀`, type: 'damage' });
          }
          break;
        }

        case 'alc_fate': {
          const hasAbnormalStatus = ((this.roundModifiers?.acidFlaskCount||0)>0 || (this.roundModifiers?.equipmentEffectMultiplier??1)<1 || p.alcAcidStack>0 || p.poisonTurns > 0 || p.bleedTurns > 0 || p.stunnedNextTurn || p.nextTurnStunFlag || p.isSurrendered || p.cannotCrit);

          for (const ally of Object.values(this.players).filter(ally => ally.hp > 0)) {
            ally.bleedTurns = 0; ally.poisonTurns = 0; ally.poisonDmg = 0;
            ally.cannotCrit = false; ally.stunnedNextTurn = false; ally.nextTurnStunFlag = false;
            ally.warriorVulnerableTurns = 0; ally.warriorVulnerableNextTurn = false;
          }
          this.alcVulnerableTurns = 0; this.alcVulnerableNextTurn = false;
          for(const ally of Object.values(this.players))ally.alcAcidStack=0;
          this.roundModifiers.equipmentEffectMultiplier=1;this.roundModifiers.acidFlaskCount=0;
          this.p8RefreshEquipment();
          this.actionCleansedSnapshot = this.getHpSnapshot();
          if (!hasAbnormalStatus) {
            // 身上無異常狀態：2技能效果變成回復 15 點血（全員回復 15 點生命值，不觸發命運反噬）
            for (const pl of Object.values(this.players)) {
              pl.bleedTurns = 0;
              pl.poisonTurns = 0;
              pl.poisonDmg = 0;
              if (pl.hp > 0) this.applyHealWithOverheal(pl, 15);
            }
            log.push({ text: `🌿⚗️ **${p.name}** 身上無異常狀態，調配出【溫和調和試劑】！全員穩定回復 **15** 點生命值！`, type: 'heal' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: 15, singleTargetId: null, singleValue: 0 });
          } else {
            // 身上有異常狀態：驅散全體負面效果 + 命運煉成賭博
            for (const pl of Object.values(this.players)) {
              pl.bleedTurns = 0;
              pl.poisonTurns = 0;
              pl.poisonDmg = 0;
            }
            const buretteCount = (p.equips || []).filter(e => e.id === 'alc_burette' || e.name === '精密滴定管' || e.name === '精密滴管').length;
            // 精密滴管使 2 技能失敗機率改變成 65%（大成功機率 35%），未裝備時為 50%
            const successRate = buretteCount > 0 ? 0.35 : 0.50;
            const isSuccess = Math.random() < successRate;
            actionOutcome = { type: isSuccess ? 'alchemy_success' : 'alchemy_failure', label: isSuccess ? '煉成成功' : '煉成失敗' };
            if (isSuccess) {
              for (const pl of Object.values(this.players)) {
                if (pl.hp > 0) this.applyHealWithOverheal(pl, 40);
              }
              this.alcShieldTurns = 2;
              log.push({ text: `✨⚗️ **${p.name}** 調配【命運煉成試劑】—— **【煉金大成功】**！全體負面效果完全淨化！全員回復 **40** HP，並獲得持續 **2** 回合的 **70% 減傷護盾**！🛡️`, type: 'buff' });
              visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: 40, singleTargetId: null, singleValue: 0 });
              visualEvents.push({ type: 'alc_shield', turns: 2 });
            } else {
              for (const pl of Object.values(this.players)) {
                if (pl.hp > 0) this.applyHealWithOverheal(pl, 10);
              }
              this.alcVulnerableNextTurn = true;
              log.push({ text: `💥⚗️ **${p.name}** 調配【命運煉成試劑】—— **【煉金失敗】**！雖然淨化了負面效果並全體回復 **10** 點生命，但試劑反噬爆炸，**下回合全隊受傷增加 20%**！⚠️`, type: 'warning' });
              visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: 10, singleTargetId: null, singleValue: 0 });
            }
          }
          break;
        }

        // 德魯伊技能
        case 'dru_transform': {
          const isWerewolf = Math.random() < 0.5;
          actionOutcome = { type: isWerewolf ? 'transform_wolf' : 'transform_treant', label: isWerewolf ? '狼人形態' : '遠古樹精形態' };
          p.druidFormTurns = 2;
          if (isWerewolf) {
            p.druidForm = 'werewolf';
            const deduct = p.maxHp - Math.max(1, Math.floor(p.maxHp * (1 - GAME_BALANCE.werewolfMaxHpReduction)));
            p.werewolfMaxHpDeducted = (p.werewolfMaxHpDeducted || 0) + deduct;
            p.maxHp -= deduct;
            p.hp = Math.min(p.hp, p.maxHp);
            log.push({ text: `🐺 **${p.name}** 仰天長嘯發動【形態轉變】—— 化身為 **【狼人】**（暫時扣除 ${deduct} 點最大生命值，造成傷害提升至 40 點，持續2回合）！（❤️ ${p.hp}/${p.maxHp}）`, type: 'buff' });
            visualEvents.push({ type: 'transform_wolf', sourceId: p.id });

            // 特殊彩蛋：若遭遇 BOSS【暗影魔狼族長】
            if (monster.name === '暗影魔狼族長' || monster.name.includes('暗影魔狼族長')) {
              p.isSurrendered = true;
              log.push({ text: `👑🐺 **【特殊彩蛋：狼王血脈壓制！】** 遭遇 BOSS【暗影魔狼族長】！至高狼王血脈壓制降臨，**${p.name}** 靈魂顫慄直接陷入【臣服狀態】，整場戰鬥無法行動直到 BOSS 倒下！`, type: 'warning' });
              visualEvents.push({ type: 'surrender', targetId: p.id });

              // 檢查：如果其他隊友都死亡或是只有他一人，直接判定挑戰失敗
              const otherAbleTeammates = Object.values(this.players).filter(other => other.id !== p.id && other.hp > 0 && !other.isSurrendered);
              if (otherAbleTeammates.length === 0) {
                const failReason = Object.keys(this.players).length === 1
                  ? `德魯伊 **${p.name}** 孤身一人遭遇狼王陷入血脈臣服無法動彈，無人能繼續作戰，冒險直接判定挑戰失敗！`
                  : `德魯伊 **${p.name}** 陷入狼王血脈臣服，且其餘隊友皆已陣亡，場上已無任何能戰鬥的隊友，冒險直接判定挑戰失敗！`;
                log.push({ text: `👑🐺💀 **【血脈臣服·全隊潰敗】** ${failReason}`, type: 'damage' });
                this.isWolfSurrenderGameOver = true;
              }
            } else {
              // Calculate once, then resolve after the transform result has its own snapshot.
              const raw = Math.floor((35 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
              pendingWerewolfAttack = applyResistanceDamage(raw, 'phys');
            }
          } else {
            p.druidForm = 'treant';
            this.p8GrantShield(p, p.maxHp * .85, 2, 'treant');
            log.push({ text: `🌳 **${p.name}** 紮根於地發動【形態轉變】—— 化身為 **【樹精】**（護盾為自身最大生命85%，減傷30%，變身期間替全體隊友主動吸收50%受到傷害，持續2回合）！（❤️ ${p.hp}/${p.maxHp}）`, type: 'buff' });
            visualEvents.push({ type: 'transform_treant', sourceId: p.id });
          }
          break;
        }

        case 'dru_summon_treant': {
          if (!p.minions) p.minions = [];
          if (p.minions.length >= 3) {
            log.push({ text: `🌱 **${p.name}** 嘗試施展【自然呼喚】，但場上已有 3 隻僕從（已達上限），無法再召喚！`, type: 'warning' });
            break;
          }
          const hasNatureResonance = (p.equips || []).some(e => e.id === 'dru_resonance' || e.name === '自然共鳴');
          let treantMaxHp = Math.floor(10 + p.maxHp * 0.25);
          if (hasNatureResonance) {
            treantMaxHp += 5;
          }
          const druidTotalAtk = this.getDruidEffectiveAttack(p);
          const treantAtk = Math.max(1, Math.floor(druidTotalAtk * 0.10));
          const usedIndices = new Set(p.minions.filter(m => m.type === 'treant').map(m => m.minionIndex).filter(Boolean));
          let minionIndex = [1, 2, 3].find(idx => !usedIndices.has(idx)) || ((p.minions.length % 3) + 1);
          const minionName = `小樹精${minionIndex}`;
          const minionAvatar = `/photo/小樹精${minionIndex}.webp`;
          const newTreant = {
            id: 'minion_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'treant',
            minionIndex: minionIndex,
            name: minionName,
            avatar: minionAvatar,
            hp: treantMaxHp,
            maxHp: treantMaxHp,
            attack: treantAtk,
            atk: treantAtk,
            ownerId: p.id,
            alive: true
          };
          p.minions.push(newTreant);
          p.minion = p.minions[0];
          log.push({ text: `🌱 **${p.name}** 施展【自然呼喚】，召喚出【小樹精】（HP ${treantMaxHp}/${treantMaxHp} · ATK ${treantAtk}）！(現有僕從 ${p.minions.length}/3)`, type: 'buff' });
          visualEvents.push({ type: 'summon_minion', sourceId: p.id, minionType: 'treant', minionName: '小樹精' });


          break;
        }

        case 'dru_summon_wolf': {
          if (!p.minions) p.minions = [];
          if (p.minions.length >= 3) {
            log.push({ text: `🐺 **${p.name}** 嘗試施展【自然呼喚】，但場上已有 3 隻僕從（已達上限），無法再召喚！`, type: 'warning' });
            break;
          }
          const hasNatureResonance = (p.equips || []).some(e => e.id === 'dru_resonance' || e.name === '自然共鳴');
          let wolfMaxHp = Math.floor(5 + p.maxHp * 0.10);
          const druidTotalAtk = this.getDruidEffectiveAttack(p);
          let wolfAtk = Math.max(1, Math.floor(druidTotalAtk * 0.80));
          if (hasNatureResonance) {
            wolfAtk += 2;
          }
          const usedIndices = new Set(p.minions.filter(m => m.type === 'wolf').map(m => m.minionIndex).filter(Boolean));
          let minionIndex = [1, 2, 3].find(idx => !usedIndices.has(idx)) || ((p.minions.length % 3) + 1);
          const minionName = `幼狼${minionIndex}`;
          const minionAvatar = `/photo/幼狼${minionIndex}.webp`;
          const newWolf = {
            id: 'minion_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'wolf',
            minionIndex: minionIndex,
            name: minionName,
            avatar: minionAvatar,
            hp: wolfMaxHp,
            maxHp: wolfMaxHp,
            attack: wolfAtk,
            atk: wolfAtk,
            ownerId: p.id,
            alive: true
          };
          p.minions.push(newWolf);
          p.minion = p.minions[0];
          log.push({ text: `🐺 **${p.name}** 施展【自然呼喚】，召喚出【幼狼】（HP ${wolfMaxHp}/${wolfMaxHp} · ATK ${wolfAtk}）！(現有僕從 ${p.minions.length}/3)`, type: 'buff' });
          visualEvents.push({ type: 'summon_minion', sourceId: p.id, minionType: 'wolf', minionName: '幼狼' });


          break;
        }
      }

      const stepVisuals = visualEvents.slice(beforeVisualCount);
      const stepLogs = log.slice(beforeLogCount);
      const activeSkills = roundSkillSets.get(p.id);
      const usedSkill = activeSkills.find(s => s.id === p.action);
      let hiddenEffectNote = null;
      if (p.action === 'alc_acid' || (p.action === 'alc_flask' && actionOutcome?.type === 'alchemy_acid')) {
        hiddenEffectNote = '酸霧侵蝕裝備，全隊裝備效果降低 50%！';
      }

      const attackVisual = stepVisuals.find(v => v.type === 'player_attack');
      const isLethal = monster.hp <= 0;
      const monsterHpDelta = Math.max(0, monsterHpBefore - monster.hp);
      const finalDamage = attackVisual ? attackVisual.value : monsterHpDelta;
      const damageType = attackVisual?.dmgType === 'mag' ? 'magic' : 'physical';
      const isCrit = attackVisual?.isCrit || false;
      if (isCrit && actionOutcome.type === 'normal' && (SKILL_CATEGORIES[p.action] || 'OFFENSIVE') === 'OFFENSIVE') actionOutcome = { type: 'critical', label: 'CRITICAL' };

      if (p.role === 'assassin' && isCrit && finalDamage > 0) {
        const gained = addAssassinCritical(p);
        if (gained) log.push({ text: `**${p.name}** 累積兩次暴擊，獲得 ${gained} 層【匿蹤】。`, type: 'buff' });
      }
      monster.hp = Math.max(0, monster.hp);
      const actionAfter = this.getHpSnapshot();
      const actionCategory = p8Action?.category || SKILL_CATEGORIES[p.action] || 'OFFENSIVE';
      stepVisuals.filter(event=>event.type==='player_attack').forEach((event,i)=>{
        const cue=this.p8DamagePresentationOutcomes[i];if(cue?.type)event.outcome={type:cue.type};
      });
      const actionResults = this.p8Results || buildActionResults({ outcome: actionOutcome, category: actionCategory, sourceId: p.id, cleansedSnapshot: this.actionCleansedSnapshot }, actionBefore, actionAfter, stepVisuals, this.actionHeals);
      this.actionHeals = null;
      presentationQueue.push({
        category: actionCategory, outcome: actionOutcome, results: actionResults,
        hpSnapshotBefore: actionBefore,
        ...(p.role==='gladiator'?{gladiatorPresentation:{
          arenaActive:actionBefore.arena?.playerId===p.id,
          rageBefore:snapshotTarget(actionBefore,p.id)?.rage||0,rageAfter:p.rage||0,
          rageGained:Math.max(0,(p.rage||0)-(snapshotTarget(actionBefore,p.id)?.rage||0)),
          rageConsumed:Math.max(0,(snapshotTarget(actionBefore,p.id)?.rage||0)-(p.rage||0)),
          bloodGained:Math.max(0,(p.bloodStacks||0)-(snapshotTarget(actionBefore,p.id)?.bloodStacks||0)),
          bloodHealApplied:!!p8Action?.bloodHealApplied,actorDied:p.hp<=0
        }}:{}),
        ...(p.role==='sage'?{sagePresentation:{
          sagePhase:p.sagePhase,operandBefore:snapshotTarget(actionBefore,p.id)?.sageOperand,
          operandAfter:p.sageOperand,xBefore:snapshotTarget(actionBefore,p.id)?.sageX,xAfter:p.sageX,
          actualDamage:finalDamage,sampling:!!p.sageInduction,
          operandDelta:p.sageOperand-(snapshotTarget(actionBefore,p.id)?.sageOperand||0)
        }}:{}),
        monsterName: monster.name, monsterAvatar: monster.avatar,
        type: 'player_action', hiddenBeforeAction, consumedStacks,
        sourceId: p.id,
        sourceName: p.name,
        sourceRole: p.role,
        druidForm: p.druidForm,
        ammoBefore: [...(snapshotTarget(actionBefore, p.id)?.ammo || [])],
        ammoAfter: [...(p.ammo || [])],
        actionId: p.action,
        skillName: usedSkill ? usedSkill.label : (p.action === 'b_revive' ? '甦生之歌' : p.action === 'skip' ? '跳過回合' : p.action),
        tags: usedSkill ? (usedSkill.tags || []) : [],
        targetId: p.targetPlayerId || (monster.hp > 0 || isLethal ? 'monster' : null),
        targetName: (p.targetPlayerId && this.players[p.targetPlayerId]) ? this.players[p.targetPlayerId].name : monster.name,
        narrative: BATTLE_NARRATIVES.getPlayerSkillNarrative(p, p.action, {
          isCrit: (p.action === 's_stab' && assassinDidCrit),
          flaskType: p.rolledFlaskType || (actionOutcome?.type === 'alchemy_poison' ? 'poison' : 'acid'),
          outcome: actionOutcome?.type
        }),
        detail: stepLogs.map(l => l.text).join('\n') || (log[log.length - 1]?.text || ''),
        hiddenEffectNote: hiddenEffectNote,
        visualEvents: stepVisuals,
        finalDamage: finalDamage,
        damageDealt: finalDamage,
        shieldDamage: 0,
        tempHpDamage: 0,
        hpDamage: monsterHpDelta,
        damageType: damageType,
        dmgType: damageType === 'magic' ? '【魔法】' : '【物理】',
        isCritical: isCrit,
        isLethal: isLethal,
        targetHpBefore: monsterHpBefore,
        targetHpAfter: monster.hp,
        targetMaxHp: monster.maxHp,
        actorHpBefore: actorHpBefore,
        actorHpAfter: p.hp,
        actorMaxHp: p.maxHp,
        hpSnapshot: this.getHpSnapshot()
      });

      if(this.arena?.playerId===p.id&&p.hp<=0){this.arenaRoundLock={...this.arena};this.p8ExitArena(presentationQueue,'gladiator_dead');}

      if(p.role==='dreamweaver')this.p8SplitDreamPresentation(presentationQueue,p);
      if(p.role==='sage')this.p8ResolveEquation(p,presentationQueue,log,applyResistanceDamage,bardDmgMultiplier);

      if (pendingWerewolfAttack && monster.hp > 0) {
        const before = this.getHpSnapshot();
        const { dmg, isResisted, resistPercent } = pendingWerewolfAttack;
        monster.hp = Math.max(0, monster.hp - dmg);
        const after = this.getHpSnapshot();
        const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
        const detail = `🩸🐾 狼人 **${p.name}** 變身後觸發【強化普攻】，造成 **${dmg}** 點【物理】傷害！${resNote}`;
        log.push({ text: detail, type: 'combat' });
        presentationQueue.push({ type: 'player_action', category: 'OFFENSIVE',
          sourceId: p.id, sourceName: p.name, sourceRole: p.role, druidForm: p.druidForm,
          actionId: 'dru_claw', skillName: '狼人強化普攻', detail,
          outcome: { type: 'critical', label: 'CRITICAL' }, isCritical: true,
          targetId: 'monster', targetName: monster.name, monsterName: monster.name, monsterAvatar: monster.avatar,
          finalDamage: dmg, damageType: 'physical', isLethal: monster.hp <= 0,
          hpSnapshotBefore: before, hpSnapshot: after,
          results: [{ kind: 'damage', targetId: 'monster', finalDamage: dmg,
            targetBefore: before.monster, targetAfter: after.monster, damageType: 'physical',
            outcome: { type: 'critical', label: 'CRITICAL' }, hpSnapshot: after }]
        });
      }

      resolveMinionFollowUp(p);

      // 記錄該玩家行動敘述 (供舊版 Fallback 兼容)
      narratives.push({
        type: 'player',
        sourceId: p.id,
        name: p.name,
        role: p.role,
        actionId: p.action,
        text: BATTLE_NARRATIVES.getPlayerSkillNarrative(p, p.action, { isCrit: (p.action === 's_stab' && assassinDidCrit) }),
        detail: log[log.length - 1]?.text || ''
      });

      // 德魯伊召喚僕從立刻攻擊：獨立演出步進（先德魯伊召喚演出，再僕從突擊演出）
      if (p.pendingMinionImmediateAttack && monster.hp > 0) {
        const m = p.pendingMinionImmediateAttack;
        delete p.pendingMinionImmediateAttack;
        const raw = Math.floor(m.attack * bardDmgMultiplier);
        const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
        const minionBefore = this.getHpSnapshot();
        const targetBefore = structuredClone(minionBefore.monster);
        monster.hp = Math.max(0, monster.hp - dmg);
        const minionAfter = this.getHpSnapshot();
        const targetAfter = structuredClone(minionAfter.monster);
        const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
        const minionAttackLog = (m.type === 'wolf')
          ? `🐺🐾 **${m.name}** 登場撕咬撲襲，造成 **${dmg}** 點傷害！${resNote}`
          : `🌱🐾 **${m.name}** 登場立即撲向目標攻擊，造成 **${dmg}** 點傷害！${resNote}`;
        log.push({ text: minionAttackLog, type: 'combat' });
        this.addLog(minionAttackLog, 'combat');
        const minionResults = [{
          kind: 'damage',
          targetId: 'monster',
          minion: structuredClone(m),
          targetBefore,
          targetAfter,
          finalDamage: dmg,
          outcome: { type: 'normal' },
          hpSnapshot: minionAfter
        }];
        presentationQueue.push({
          type: 'minion_action',
          category: 'MINION_ATTACK',
          sourceId: p.id,
          sourceRole: p.role,
          skillName: `${m.name}突擊`,
          outcome: { type: 'normal' },
          targetId: 'monster',
          targetName: monster.name,
          monsterName: monster.name,
          monsterAvatar: monster.avatar,
          hpSnapshotBefore: minionBefore,
          hpSnapshot: minionAfter,
          results: minionResults,
          narrative: minionAttackLog,
          detail: minionAttackLog
        });
      }

      this.resolveAssassinFollowUps(p, presentationQueue, log, bardDmgMultiplier, applyResistanceDamage);

      if (monster.hp <= 0) {
        presentationQueue.push({
          type: 'kill',
          monsterName: monster.name,
          narrative: `💀 **${monster.name}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！`,
          visualEvents: [{ type: 'monster_killed' }],
          hpSnapshot: this.getHpSnapshot()
        });
        break; // 擊殺怪物跳出玩家行動
      }
    }

    // 3. 處理脫力狀態
    for (const p of Object.values(this.players)) {
      if (p.stunnedNextTurn) {
        p.stunnedNextTurn = false;
      }
      if (p.nextTurnStunFlag) {
        p.stunnedNextTurn = true;
        p.nextTurnStunFlag = false;
      }
    }

    // 4. 冷卻時間處理
    for (const p of Object.values(this.players)) {
      if (p.hp <= 0) continue;
      const activeSkills = roundSkillSets.get(p.id);

      for (const skill of activeSkills) {
        if (p.action === skill.id) continue;
        const cooldownKey = skill.cooldownKey || skill.id;
        if (p.cooldowns[cooldownKey] > 0) {
          p.cooldowns[cooldownKey] -= 1;
        }
      }

      if (p.action && p.action !== 'skip') {
        const usedSkill = activeSkills.find(s => s.id === p.action);
        if (usedSkill && usedSkill.cd > 0) {
          if (p.role === 'assassin' && p.action === 's_stab' && p.assassinSkill1Crit) {
            p.cooldowns['s_stab'] = 0;
          } else if (p.action === 'w_shield' && p.shieldCrackedThisTurn) {
            p.cooldowns['w_shield'] = usedSkill.cd + 1; // 盾牌龜裂 CD 額外延長 1 回合
            p.shieldCrackedThisTurn = false;
          } else {
            p.cooldowns[usedSkill.cooldownKey || usedSkill.id] = usedSkill.cd;
          }
        }
      }


    }

    this.p8Cooldowns();
    for(const p of Object.values(this.players))if(p.sagePrimeResetPending){for(const key of Object.keys(p.cooldowns))p.cooldowns[key]=0;p.sagePrimeResetPending=false;}

    // 4.9 檢查德魯伊狼王臣服失敗判定（若其他隊友都死亡或是只有他一人，直接判定挑戰失敗）
    if (this.isWolfSurrenderGameOver) {
      log.forEach(l => this.addLog(l.text, l.type));
      this.publishCombatQueue(presentationQueue);
      return;
    }

    // 5. 判定怪物擊殺與勝負判定
    if (monster.hp <= 0) {
      narratives.push({
        type: 'kill',
        name: monster.name,
        text: `💀 **${monster.name}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！`
      });
      // Phase 5.1: 怪物已死亡，嚴禁提前 return 或跳過 presentation_queue！
      // 致命一擊與擊殺演出必須由客戶端依序播放完畢並發送 ACK，再由 finishTurnPresentation() 統一過渡至勝利階段。
    } else {
    // 6. 怪物反擊結算 (僅在怪物存活時結算)
    const bossBefore = this.getHpSnapshot();
    const interceptResults = [];
    const isUltTurn = (this.battleRound % 3 === 0);
    const monsterHits = [];
    let aoeDmgRaw = 0;
    const scatterHits = {};
    let shieldDamageMod = 1.0;

    if (this.monsterStunnedThisRound) {
      this.monsterStunnedThisRound = false;
      const stunNarrative = `💤 **${monster.name}** 受到【催眠夜曲】深度催眠，沉沉睡去無法發動反擊！`;
      narratives.push({
        type: 'monster',
        name: monster.name,
        isUlt: false,
        text: stunNarrative
      });
      log.push({ text: stunNarrative, type: 'info' });
      visualEvents.push({
        type: 'monster_stunned',
        monsterName: monster.name
      });
    } else {
      let baseDamageCalc = monster.attack;
      if(this.p8Has(monster,'frenzy_backfire'))baseDamageCalc=Math.floor(baseDamageCalc*1.1);
      if(!this.arena && this.p8Has(monster,'sage_square')?.starts<=this.battleRound)baseDamageCalc=Math.floor(baseDamageCalc*.75);

      const monsterTemplate = BATTLE_NARRATIVES.monsters[monster.originalName || monster.name] || {
        normal: `👾 **${monster.name}** 發動了猛烈反擊！`,
        ult: `🔥 **${monster.name}** 釋放了必殺技【${monster.ultName}】！`
      };
      const monsterNarrative = isUltTurn ? monsterTemplate.ult : monsterTemplate.normal;
      narratives.push({
        type: 'monster',
        name: monster.name,
        isUlt: isUltTurn,
        text: monsterNarrative
      });

      if (isUltTurn) {
        baseDamageCalc = Math.floor(baseDamageCalc * 1.35);
        log.push({ text: monsterNarrative, type: 'warning' });
      } else {
        log.push({ text: monsterNarrative, type: 'combat' });
      }

      const effectiveBaseAtk = Math.max(5, baseDamageCalc - monsterAttackReduction);
      aoeDmgRaw = Math.max(1, Math.floor(effectiveBaseAtk * 0.5));
      const scatterDmgPool = Math.max(1, effectiveBaseAtk - aoeDmgRaw);

      // 僕從優先替全隊擋下怪物的隨機分散/彈射傷害
      let remainingScatter = scatterDmgPool;
      for (const owner of Object.values(this.players)) {
        if(this.arena && this.arena.playerId!==owner.id)continue;
        if (remainingScatter <= 0) break;
        if (owner.minions && owner.minions.length > 0) {
          for (let mi = owner.minions.length - 1; mi >= 0; mi--) {
            if (remainingScatter <= 0) break;
            const m = owner.minions[mi];
            if (m.hp > 0) {
              const minionBefore = structuredClone(m);
              const absorb = Math.min(m.hp, remainingScatter);
              m.hp -= absorb;
              remainingScatter -= absorb;
              interceptResults.push({ kind: 'intercept', category: 'MINION_INTERCEPT', targetId: m.id,
                ownerId: owner.id, originalTargetIds: Object.values(this.players).filter(p => p.hp > 0).map(p => p.id),
                minion: structuredClone(m), targetBefore: minionBefore, targetAfter: structuredClone(m),
                finalDamage: absorb, outcome: { type: 'normal' }, hpSnapshot: this.getHpSnapshot() });
              visualEvents.push({ type: 'minion_hit', ownerId: owner.id, value: absorb });
              if (m.hp <= 0) {
                log.push({ text: `🛡️🐾 **${owner.name}** 的僕從【${m.name}】挺身為全隊擋下 **${absorb}** 點彈射傷害，隨後力竭消散！💀`, type: 'warning' });
                owner.minions.splice(mi, 1);
              } else {
                log.push({ text: `🛡️🐾 **${owner.name}** 的僕從【${m.name}】優先替全隊擋下 **${absorb}** 點彈射傷害！（僕從 HP: ${m.hp}/${m.maxHp}）`, type: 'buff' });
              }
            }
          }
          owner.minion = owner.minions[0] || null;
        } else if (owner.minion && owner.minion.hp > 0) {
          const absorb = Math.min(owner.minion.hp, remainingScatter);
          owner.minion.hp -= absorb;
          remainingScatter -= absorb;
          visualEvents.push({ type: 'minion_hit', ownerId: owner.id, value: absorb });
          if (owner.minion.hp <= 0) {
            log.push({ text: `🛡️🐾 **${owner.name}** 的僕從【${owner.minion.name}】挺身為全隊擋下 **${absorb}** 點彈射傷害，隨後力竭消散！💀`, type: 'warning' });
            owner.minion = null;
          } else {
            log.push({ text: `🛡️🐾 **${owner.name}** 的僕從【${owner.minion.name}】優先替全隊擋下 **${absorb}** 點彈射傷害！（僕從 HP: ${owner.minion.hp}/${owner.minion.maxHp}）`, type: 'buff' });
          }
        }
      }

      // 在受到傷害時只讀取狀態、不扣減次數，統一交給回合末尾進行倒數
      if (this.warriorShieldTurn === 1) {
        shieldDamageMod = 0.1;
        log.push({ text: `🛡️ **【壁壘守護】本回合為全隊阻擋了 90% 的衝擊！**`, type: 'buff' });
      } else if (this.warriorShieldTurn === 2) {
        shieldDamageMod = 0.6;
        log.push({ text: `🛡️ **【壁壘守護】餘威為全隊阻擋了 40% 的傷害！**`, type: 'buff' });
      }

      let alcShieldMod = (this.alcShieldTurns > 0) ? 0.30 : 1.0;
      let alcVulnMod = (this.alcVulnerableTurns > 0) ? 1.20 : 1.0;

      const calculateDamageToPlayer = (player, rawDamage) => {
        let finalDmg = rawDamage;
        if (player.role === 'assassin') finalDmg = Math.floor(finalDmg * CLASSES.assassin.vulnerableMod);
        if (player.warriorVulnerableTurns > 0) finalDmg = Math.floor(finalDmg * 1.20);
        if (shieldDamageMod < 1.0) finalDmg = Math.max(1, Math.floor(finalDmg * shieldDamageMod));
        if (alcShieldMod < 1.0) finalDmg = Math.max(1, Math.floor(finalDmg * alcShieldMod));
        if (alcVulnMod > 1.0) finalDmg = Math.floor(finalDmg * alcVulnMod);
        if (bardDmgReduction < 1.0) finalDmg = Math.floor(finalDmg * bardDmgReduction);
        // 架弩蹲伏減傷 20%
        if (player.isCrouchedThisRound) {
          finalDmg = Math.floor(finalDmg * 0.80);
        }
        // 樹精/古樹形態減傷由 GAME_BALANCE 管理
        if (player.druidForm === 'treant' || player.druidForm === 'tree') {
          finalDmg = Math.floor(finalDmg * (1 - GAME_BALANCE.treantDamageReduction));
        }
        return Math.max(1, finalDmg);
      };

      const livingPlayers = Object.values(this.players).filter(p => p.hp > 0 && (!arenaRoundPlayerId || arenaRoundPlayerId===p.id));
      const playerRawScatter = {};
      livingPlayers.forEach(p => { playerRawScatter[p.id] = 0; scatterHits[p.id] = []; });

      let remainingDmg = remainingScatter;
      while (remainingDmg > 0 && livingPlayers.length > 0) {
        const randomTarget = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
        const stepDmg = Math.min(remainingDmg, Math.floor(Math.random() * 4) + 2);
        playerRawScatter[randomTarget.id] += stepDmg;
        scatterHits[randomTarget.id].push(stepDmg);
        remainingDmg -= stepDmg;
      }

      const treantDruid = arenaRoundPlayerId ? null : Object.values(this.players).find(p => p.hp > 0 && p.druidForm === 'treant');

      for (const p of Object.values(this.players)) {
        if (p.hp <= 0 || (arenaRoundPlayerId && arenaRoundPlayerId!==p.id)) continue;

        const hitBefore = this.getHpSnapshot();
        const hitStart = monsterHits.length;
        const targetBefore = snapshotTarget(hitBefore, p.id);
        if (isAssassinHidden(p)) {
          log.push({ text: `💨 **${p.name}** 處於匿蹤狀態，避開了所有反擊！`, type: 'buff' });
          monsterHits.push({ targetId: p.id, role: p.role, stealthed: true, value: 0, outcome: { type: 'dodge', stealth: true }, targetBefore, targetAfter: targetBefore, hpSnapshot: this.getHpSnapshot() });
          continue;
        }

        let dodgeRate = 0;
        if (p.isCrouchedThisRound) {
          dodgeRate = 0;
          p.archerNextDodgeBonus = 0;
        } else if (p.role === 'archer') {
          const angelBowCount = (p.equips || []).filter(e => e.id === 'a_archangel_bow' || e.id === 'a_bow' || e.name === '大天使重弓').length;
          dodgeRate = Math.max(0, CLASSES.archer.dodgeRate - 0.20 * angelBowCount);
        }
        if (!p.isCrouchedThisRound && (dodgeRate > 0 || p.archerNextDodgeBonus > 0) && this.checkDodge(p, dodgeRate)) {
          log.push({ text: `🪶 **${p.name}** 身手矯健，閃避了所有反擊！`, type: 'buff' });
          monsterHits.push({ targetId: p.id, role: p.role, dodged: true, value: 0, outcome: { type: 'dodge' }, targetBefore, targetAfter: snapshotTarget(this.getHpSnapshot(), p.id), hpSnapshot: this.getHpSnapshot() });
          continue;
        }

        const totalRawAssigned = aoeDmgRaw + (playerRawScatter[p.id] || 0);
        const rawParts=[aoeDmgRaw,...(scatterHits[p.id]||[])];
        if(p.role==='samurai'||this.p8Has(p,'dream_butterfly')) {
          this.p8ResolveBossHits(p,rawParts,n=>calculateDamageToPlayer(p,n),monsterHits,treantDruid);
          continue;
        }
        const segmented=p.role==='samurai'||this.p8Has(p,'dream_butterfly')||this.arena;
        const incomingParts=segmented ? rawParts.map(raw=>this.p8Incoming(p,raw,n=>calculateDamageToPlayer(p,n))) : [];
        let totalTakenDmg = segmented
          ? incomingParts.reduce((n,x)=>n+x.damage,0)
          : this.p8Incoming(p,totalRawAssigned,n=>calculateDamageToPlayer(p,n)).damage;
        if(incomingParts.some(x=>x.outcome==='parry') && totalTakenDmg===0) {
          monsterHits.push({targetId:p.id,role:p.role,value:0,finalDamage:0,outcome:{type:'block',parry:true},targetBefore,targetAfter:snapshotTarget(this.getHpSnapshot(),p.id),hpSnapshot:this.getHpSnapshot()});continue;
        }
        if(this.arena && this.arena.playerId!==p.id)continue;

        // 樹精替全體隊友主動吸收 50% 受到傷害
        if (treantDruid && treantDruid.id !== p.id && totalTakenDmg > 0 && treantDruid.hp > 0) {
          const absorbedDmg = Math.floor(totalTakenDmg * 0.5);
          totalTakenDmg -= absorbedDmg;
          const treantActualDmg = Math.max(1, Math.floor(absorbedDmg * (1 - GAME_BALANCE.treantDamageReduction))); // 樹精減傷30%
          const treantDmgRes = this.applyDamageToPlayer(treantDruid, treantActualDmg);
          log.push({ text: `🌳 **${treantDruid.name}** (樹精) 伸展藤蔓為 **${p.name}** 承受吸收了 **${absorbedDmg}** 點傷害（減傷30%後實受 **${treantActualDmg}** 點）！（❤️ 樹精剩餘HP: ${treantDruid.hp}/${treantDruid.maxHp}）`, type: 'buff' });
          
          if (treantDruid.hp <= 0) {
            treantDruid.hp = 1;
            treantDruid.druidForm = 'tree';
            treantDruid.druidFormTurns = 1;
            treantDruid.stunnedNextTurn = true;
            log.push({ text: `🪵 **${treantDruid.name}** 因替隊友承受致命傷害，觸發樹精守護！保留 1 點生命並化身為【沉睡古樹】，進入 1 回合休眠狀態（無法行動）！`, type: 'buff' });
            visualEvents.push({ type: 'transform_tree', sourceId: treantDruid.id });
            monsterHits.push({ targetId: treantDruid.id, sharedFrom: p.id, value: treantActualDmg, tempAbsorbed: treantDmgRes.tempAbsorbed, hpDmg: treantDmgRes.hpDmg, isDead: false, shieldMod: shieldDamageMod, hpSnapshot: this.getHpSnapshot() });
          } else {
            monsterHits.push({ targetId: treantDruid.id, sharedFrom: p.id, value: treantActualDmg, tempAbsorbed: treantDmgRes.tempAbsorbed, hpDmg: treantDmgRes.hpDmg, isDead: false, shieldMod: shieldDamageMod, hpSnapshot: this.getHpSnapshot() });
          }
        }

        let remainingShield=p.tempHp||0, hpEvents=0, assigned=0;
        for(let i=0;i<rawParts.length;i++) {
          const value=i===rawParts.length-1?totalTakenDmg-assigned:Math.floor(totalTakenDmg*rawParts[i]/totalRawAssigned);assigned+=value;
          if(value>remainingShield)hpEvents++;remainingShield=Math.max(0,remainingShield-value);
        }
        const dmgRes = this.applyDamageToPlayer(p, totalTakenDmg, {kind:'enemy_direct',hpEvents});
        for(const incoming of incomingParts)if(incoming.outcome==='nightmare')this.p8NightmareHeal(p,incoming.ownerId);

        if (totalTakenDmg > 0 && monster.baseHp < 100) {
          p.bleedTurns = 2;
        }

        if (p.hp <= 0) {
          if (p.druidForm === 'treant') {
            p.hp = 1;
            p.druidForm = 'tree';
            p.druidFormTurns = 1;
            p.stunnedNextTurn = true;
            log.push({ text: `🪵 **${p.name}** 受到致命傷害，觸發樹精守護！保留 1 點生命並化身為【沉睡古樹】，進入 1 回合休眠狀態（無法行動）！`, type: 'buff' });
            visualEvents.push({ type: 'transform_tree', sourceId: p.id });
            monsterHits.push({ targetId: p.id, value: totalTakenDmg, tempAbsorbed: dmgRes.tempAbsorbed, hpDmg: dmgRes.hpDmg, isDead: false, shieldMod: shieldDamageMod, hpSnapshot: this.getHpSnapshot() });
          } else {
            p.hp = 0;
            this.clearPlayerDebuffs(p);
            if (p.druidForm === 'tree') {
              // Treant grants shield; maximum HP remains unchanged.
              p.druidForm = null;
              p.druidFormTurns = 0;
            }
            if (p.druidForm === 'werewolf' && (p.werewolfMaxHpDeducted || 0) > 0) {
              p.maxHp += p.werewolfMaxHpDeducted;
              p.werewolfMaxHpDeducted = 0;
              p.druidForm = null;
              p.druidFormTurns = 0;
            }
            log.push({ text: `💥 **${p.name}** 受到 **${totalTakenDmg}** 點傷害，倒地陣亡！💀`, type: 'damage' });
            monsterHits.push({ targetId: p.id, value: totalTakenDmg, tempAbsorbed: dmgRes.tempAbsorbed, hpDmg: dmgRes.hpDmg, isDead: true, shieldMod: shieldDamageMod, hpSnapshot: this.getHpSnapshot() });
          }
        } else {
          const absorbNote = dmgRes.tempAbsorbed > 0 ? ` (🛡️超量生命抵擋 ${dmgRes.tempAbsorbed} 點)` : '';
          log.push({ text: `💢 **${p.name}** 受到 **${totalTakenDmg}** 點傷害${absorbNote}（❤️ ${p.hp + (p.tempHp || 0)}/${p.maxHp}）`, type: 'damage' });
          monsterHits.push({ targetId: p.id, value: totalTakenDmg, tempAbsorbed: dmgRes.tempAbsorbed, hpDmg: dmgRes.hpDmg, isDead: false, shieldMod: shieldDamageMod, hpSnapshot: this.getHpSnapshot() });
        }
        const hitAfter = this.getHpSnapshot();
        for (const hit of monsterHits.slice(hitStart)) {
          hit.role = this.players[hit.targetId]?.role;
          hit.targetBefore = snapshotTarget(hitBefore, hit.targetId);
          hit.hpSnapshot = hit.hpSnapshot || hitAfter;
          hit.targetAfter = snapshotTarget(hit.hpSnapshot, hit.targetId);
          hit.finalDamage = hit.value;
          if(hit.targetId===p.id&&dmgRes.sageMomentumCapture)hit.sageMomentumCapture=dmgRes.sageMomentumCapture;
          hit.guard = shieldDamageMod < 1 || alcShieldMod < 1 || bardDmgReduction < 1 || hit.targetAfter?.druidForm === 'treant';
          hit.absorbed = hit.tempAbsorbed || 0;
          hit.shieldBreak = (hit.targetBefore?.tempHp || 0) > 0 && !(hit.targetAfter?.tempHp > 0);
          hit.outcome = { type: hit.absorbed > 0 && hit.hpDmg === 0 ? 'block' : 'normal', protection: hit.targetAfter?.druidForm === 'tree' };
        }
      }
    }

    // Preserve the existing aggregate mitigation/dodge rules while exposing each
    // actual scatter allocation as a separate server-authored presentation hit.
    // Integer allocation conserves the original damage exactly; no new dice.
    const display = structuredClone(bossBefore);
    const expandedHits = [];
    for (const hit of monsterHits) {
      const parts = !hit.segment && !hit.sharedFrom && hit.outcome?.type === 'normal'
        ? [aoeDmgRaw, ...(scatterHits[hit.targetId] || [])] : [];
      if (parts.length < 2) { expandedHits.push(hit); if (hit.targetAfter) Object.assign(snapshotTarget(display, hit.targetId), hit.targetAfter); continue; }
      let allocated = 0, rawAllocated = 0;
      const rawTotal = parts.reduce((sum, n) => sum + n, 0);
      const target = snapshotTarget(display, hit.targetId);
      Object.assign(target, hit.targetBefore);
      for (let i = 0; i < parts.length; i++) {
        rawAllocated += parts[i];
        const cumulative = i === parts.length - 1 ? hit.finalDamage : Math.floor(hit.finalDamage * rawAllocated / rawTotal);
        const value = cumulative - allocated; allocated = cumulative;
        const before = structuredClone(target), absorbed = Math.min(target.tempHp || 0, value);
        target.tempHp = Math.max(0, (target.tempHp || 0) - absorbed);
        target.hp = Math.max(hit.outcome.protection ? 1 : 0, target.hp - (value - absorbed));
        if (i === parts.length - 1) Object.assign(target, hit.targetAfter);
        expandedHits.push({ ...hit, value, finalDamage: value, absorbed, tempAbsorbed: absorbed, hpDmg: value - absorbed,
          // Aggregate gameplay records one operand increment. Do not repeat it
          // for each presentation-only scatter segment.
          sageMomentumCapture:i===parts.length-1?hit.sageMomentumCapture:undefined,
          targetBefore: before, targetAfter: structuredClone(target), hpSnapshot: structuredClone(display),
          shieldBreak: before.tempHp > 0 && target.tempHp === 0,
          outcome: { type: absorbed > 0 && absorbed === value ? 'block' : 'normal', protection: i === parts.length - 1 && hit.outcome.protection },
          segment: i === 0 ? 'aoe' : 'bounce' });
      }
    }
    monsterHits.splice(0, monsterHits.length, ...expandedHits);

    // 回合末尾統一進行減傷盾與易傷的倒數
    if (this.warriorShieldTurn === 1) {
      this.warriorShieldTurn = 2;
    } else if (this.warriorShieldTurn === 2) {
      this.warriorShieldTurn = 0;
    }

    if (this.alcShieldTurns > 0) {
      this.alcShieldTurns -= 1;
    }

    if (this.alcVulnerableTurns > 0) {
      this.alcVulnerableTurns -= 1;
    }
    if (this.alcVulnerableNextTurn) {
      this.alcVulnerableTurns = 1;
      this.alcVulnerableNextTurn = false;
    }

    // 結算戰士揮砍失衡易傷、弓箭手脫靶失閃（強酸裝備減半由 roundModifiers 管理）
    for (const pl of Object.values(this.players)) {
      if (pl.warriorVulnerableTurns > 0) pl.warriorVulnerableTurns -= 1;
      if (pl.warriorVulnerableNextTurn) {
        pl.warriorVulnerableTurns = 1;
        pl.warriorVulnerableNextTurn = false;
      }

    }

    visualEvents.push({
      type: 'monster_attack',
      isUlt: isUltTurn,
      ultName: monster.ultName,
      shieldMod: shieldDamageMod,
      hits: monsterHits
    });

    // 首領行動演出步驟加入 presentationQueue (直接接續，不插入 BOSS TURN 字幕)
    if (!this.monsterStunnedThisRound && monster.hp > 0) {
      const monsterTemplate = BATTLE_NARRATIVES.monsters[monster.originalName || monster.name] || {
        normal: `👾 **${monster.name}** 發動了猛烈反擊！`,
        ult: `🔥 **${monster.name}** 釋放了必殺技【${monster.ultName}】！`
      };
      const firstHit = monsterHits[0] || {};
      const primaryTargetId = firstHit.targetId;
      const primaryTarget = primaryTargetId ? this.players[primaryTargetId] : null;

      presentationQueue.push({
        type: 'boss_action',
        category: 'AOE_OFFENSIVE', outcome: { type: 'normal' },
        hpSnapshotBefore: bossBefore, results: [...interceptResults, ...monsterHits.map(hit => ({ ...hit, kind: hit.kind || 'damage' }))],
        monsterName: monster.name,
        monsterAvatar: monster.avatar,
        isUlt: isUltTurn,
        ultName: monster.ultName,
        skillName: isUltTurn ? monster.ultName : '猛烈反擊',
        narrative: isUltTurn ? monsterTemplate.ult : monsterTemplate.normal,
        detail: log[log.length - 1]?.text || '',
        hits: monsterHits,
        targetId: primaryTargetId,
        targetName: primaryTarget ? primaryTarget.name : '冒險者',
        targetRole: primaryTarget ? primaryTarget.role : 'warrior',
        finalDamage: firstHit.value || 0,
        damageDealt: firstHit.value || 0,
        tempHpDamage: firstHit.tempAbsorbed || 0,
        hpDamage: firstHit.hpDmg || firstHit.value || 0,
        isLethal: firstHit.isDead || false,
        targetHpBefore: firstHit.hpBefore !== undefined ? firstHit.hpBefore : (primaryTarget ? primaryTarget.hp : 0),
        targetHpAfter: firstHit.hpAfter !== undefined ? firstHit.hpAfter : (primaryTarget ? primaryTarget.hp : 0),
        targetMaxHp: firstHit.maxHp !== undefined ? firstHit.maxHp : (primaryTarget ? primaryTarget.maxHp : 100),
        actorHpBefore: monster.hp,
        actorHpAfter: monster.hp,
        actorMaxHp: monster.maxHp,
        visualEvents: [{
          type: 'monster_attack',
          isUlt: isUltTurn,
          ultName: monster.ultName,
          shieldMod: shieldDamageMod,
          hits: monsterHits
        }],
        hpSnapshot: this.getHpSnapshot()
      });
    }

    } // 結束怪物存活時的反擊結算 (else 區塊)

    if(this.arena&&this.players[this.arena.playerId]?.hp<=0)this.p8ExitArena(presentationQueue,'gladiator_dead');
    phase8Actor=null;this.p8EndRound(presentationQueue,log,applyResistanceDamage,bardDmgMultiplier);
    for(const p of Object.values(this.players)){
      // 德魯伊變身持續時間處理
      if (p.role === 'druid') {
        if (p.druidFormTurns > 0) {
          p.druidFormTurns -= 1;
          if (p.druidFormTurns === 0 && p.druidForm) {
            if (p.druidForm === 'treant' || p.druidForm === 'tree') {
              // Treant grants shield; maximum HP remains unchanged.
              p.hp = Math.min(p.hp, p.maxHp);
            } else if (p.druidForm === 'werewolf' && (p.werewolfMaxHpDeducted || 0) > 0) {
              p.maxHp += p.werewolfMaxHpDeducted;
              p.werewolfMaxHpDeducted = 0;
            }
            const formName = p.druidForm === 'tree' ? '沉睡古樹' : (p.druidForm === 'werewolf' ? '狼人' : '樹精');
            log.push({ text: `🌿 **${p.name}** 的【${formName}】形態結束，解除變身回復正常人身狀態。`, type: 'info' });
            p.druidForm = null;
            visualEvents.push({ type: 'transform_end', sourceId: p.id, role: 'druid' });
          }
        }
      }
    }
    if(monster.hp>0 && Object.values(this.players).some(p=>P8_ROLES.includes(p.role)||p.role==='druid'))presentationQueue.push({type:"status_cleanup",hpSnapshot:this.getHpSnapshot()});

    // Boss 攻擊完成並處理所有結算後，清除 Temporary Overheal
    const anyOverhealCleared = this.clearTemporaryOverheal();
    if (anyOverhealCleared) {
      presentationQueue.push({
        type: 'overheal_cleanup',
        narrative: '🛡️ 首領進攻結束，超量治療生命自然消散。',
        hpSnapshot: this.getHpSnapshot()
      });
    }

    // 回合結束還原 roundModifiers（腐蝕強酸瓶等僅限本回合的效果在此完全清除）
    this.roundModifiers.equipmentEffectMultiplier = 1.0;
    this.p8RefreshEquipment();
    this.roundModifiers.acidFlaskCount = 0;
    this.roundModifiers.monsterAttackReduction = 0;
    this.bardBuffActive = false;
    for (const pl of Object.values(this.players)) { delete pl.rolledFlaskType; }

    const narrationDuration = Math.max(5, presentationQueue.length * 1.6 + 1.2);
    log.forEach(l => this.addLog(l.text, l.type));

    this.p8LogBuffer=null;
    if (monster.hp <= 0 && !presentationQueue.some(step => step.type === 'kill')) {
      presentationQueue.push({type:'kill',monsterName:monster.name,
        narrative:`💀 **${monster.name}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！`,
        visualEvents:[{type:'monster_killed'}],hpSnapshot:this.getHpSnapshot()});
    }
    this.publishCombatQueue(presentationQueue, 'resolution');
  }

  checkDodge(player, baseRate) {
    if (player.isCrouchedThisRound) {
      player.archerNextDodgeBonus = 0;
      return false;
    }
    const bonus = player.archerNextDodgeBonus || 0;
    player.archerNextDodgeBonus = 0;
    return Math.random() < Math.min(1, Math.max(0, baseRate + bonus));
  }

  publishCombatQueue(queue, mode = 'resolution') {
    this.clearTimer();
    this.timerCallback = null;
    this.selectionState = 'RESOLVING';
    this.isNarrating = true;
    this.presentationMode = mode;
    this.battlePresentationId += 1;
    this.pendingPresentationAcks = new Set(Object.values(this.players).filter(p => p.connected).map(p => p.id));
    this.io.to(this.code).emit('battle:presentation_queue', {
      queue, round: this.battleRound, presentationId: this.battlePresentationId,
      monsterKilled: this.currentMonster?.hp <= 0
    });
    this.broadcastState();
  }

  // 處理客戶端演出結束確認回調 (Presentation Complete -> Next Round Start)
  handlePresentationComplete(socketId, presentationId, round) {
    if (this.state !== 'IN_BATTLE' || this.selectionState !== 'RESOLVING' ||
        presentationId !== this.battlePresentationId || round !== this.battleRound || !this.players[socketId]?.connected) return;
    this.pendingPresentationAcks.delete(socketId);
    if (!this.pendingPresentationAcks.size) this.finishTurnPresentation();
  }

  // 演出完全結束後，進行勝負判定與下一回合過渡
  finishTurnPresentation() {
    if (this.presentationSafetyTimer) {
      clearTimeout(this.presentationSafetyTimer);
      this.presentationSafetyTimer = null;
    }
    if (this.selectionState !== 'RESOLVING') return;

    const monster = this.currentMonster;
    const remainingLiving = Object.values(this.players).filter(p => p.hp > 0);
    if (remainingLiving.length === 0) {
      if (monster && monster.hp <= 0) {
        this.addLog(`⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**`, 'damage');
      }
      this.handleGameOver();
      return;
    }

    const canFightLiving = Object.values(this.players).filter(p => p.hp > 0 && !p.isSurrendered);
    if (canFightLiving.length === 0 && monster && (monster.name === '暗影魔狼族長' || monster.name.includes('暗影魔狼族長'))) {
      this.addLog(`👑🐺💀 **【血脈臣服·全隊潰敗】** 隊伍其他成員皆已戰死，生還的德魯伊仍處於狼王臣服無法行動，場上已無人能繼續作戰，冒險直接判定挑戰失敗！`, 'damage');
      this.handleGameOver();
      return;
    }

    if (monster && monster.hp <= 0) {
      this.handleMonsterVictory(monster, [], [], true);
      return;
    }

    if (this.presentationMode === 'round_start') { this.startSkillSelection(); return; }
    // 準備下一回合
    this.battleRound += 1;
    this.executeTurn();
  }

  advanceToNextFloorOrCheckpoint() {
    this.clearTimer();
    if (this.floor % 5 === 0) {
      this.state = 'CHECKPOINT';
      this.addLog(`🏰【第 ${this.floor} 層 - 深淵休息站】恭喜小隊成功突破至第 ${this.floor} 層！前方是神聖的守護結界。請隊長做出抉擇！`, 'info');
      this.setTimer(45, () => {
        if (this.state === 'CHECKPOINT') {
          this.addLog('⏱️ 隊長沈思許久，決定讓小隊在泉水前修整完畢並自動繼續前進！', 'info');
          this.continueFromCheckpoint();
        }
      });
      this.broadcastState();
    } else {
      this.floor += 1;
      this.startRouteSelection();
    }
  }

  handleCheckpointChoice(socketId, choice) {
    if (this.state !== 'CHECKPOINT') return { success: false, message: '目前不是休息站階段' };
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能做決定！' };

    this.clearTimer();
    if (choice === 'end') {
      this.state = 'VICTORY';
      this.addLog(`🏆【榮耀凱旋】隊長決定滿載而歸！小隊成功突破至第 ${this.floor} 層並安全撤出！`, 'loot');
      this.broadcastState();
    } else {
      this.continueFromCheckpoint();
    }
    return { success: true };
  }

  continueFromCheckpoint() {
    for (const p of Object.values(this.players)) {
      if (p.hp > 0) p.hp = p.maxHp;
      p.bleedTurns = 0;
      p.poisonTurns = 0;
      p.poisonDmg = 0;
    }
    this.addLog(`✨【神聖泉水休整】全體角色生命值完全回滿！重振旗鼓，踏向更深層！`, 'heal');
    this.floor += 1;
    this.startRouteSelection();
  }

  handleGameOver() {
    this.p8ExitArena();
    for(const p of Object.values(this.players)){p.warriorStacks=0;p.p8Effects={};p.p8Shields=[];p.tempHp=0;}
    this.clearTimer();
    this.state = 'GAME_OVER';
    this.gameOverReason = 'wipe';
    this.addLog(`💀 **【挑戰失敗】冒險小隊在深淵第 ${this.floor} 層全體倒下...**`, 'damage');
    this.broadcastState();
  }

  restartToLobby(socketId) {
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能重啟冒險！' };
    this.clearTimer();
    if (this.state === 'PROLOGUE' || this.state === 'CHOOSING_ROUTE') this.pendingPresentationAcks.clear();
    this.state = 'LOBBY';
    this.selectionState = 'SELECTING';
    this.floor = 1;
    this.battleRound = 1;
    this.currentMonster = null;
    this.currentEvent = null;
    this.arena = null;
    this.arenaPending = null;
    this.warriorShieldTurn = 0;
    this.alcShieldTurns = 0;
    this.alcVulnerableTurns = 0;
    this.alcVulnerableNextTurn = false;
    this.gameOverReason = null;
    this.routeVotes = {};
    this.pendingDrop = null;
    this.monsterStunnedThisRound = false;
    this.isWolfSurrenderGameOver = false;

    for (const p of Object.values(this.players)) {
      p.hp = p.role ? CLASSES[p.role].maxHp : 100;
      p.maxHp = p.hp;
      p.tempHp = 0;
      p.isLocked = false;
      p.bonusAtk = 0; p.victoryAtkBonus = 0; p.stealthStacks = p.role==='assassin'?1:0; p.critTowardStealth = 0; p.isHiddenThisRound = false; p.followUpsThisRound = 0; p.stealthBrokenThisRound = false;
      p.equips = [];
      p.equipCounts = {};
      Object.assign(p, {p8Effects:{},p8Shields:[],p8TeamHp:0,p8DisabledHp:0,p8CorrodedHp:0,warriorStacks:0,rage:0,bloodStacks:0,soul:0,kyoutou:false,arenaActive:false,sageX:30,sageDebt:0,sageOperand:0,sagePhase:'hypothesis',sageCycleRound:0,sageInduction:false,sageSamplingEnded:true,sageEquationResolved:false,sageSolvedThisRound:false,sagePrimeResetPending:false});
      delete p.sagePreviousAction;delete p.sageLastAction;delete p.sageDebtScheduledRound;
      delete p.noReviveFloor;
      p.cooldowns = {};
      if (p.role) {
        CLASSES[p.role].skills.forEach(s => { p.cooldowns[s.id] = 0; });
      }
      p.action = null;
      p.targetPlayerId = null;
      p.cannotCrit = false;
      p.isStealthed = false;
      p.stunnedNextTurn = false;
      p.bleedTurns = 0;
      p.poisonTurns = 0;
      p.poisonDmg = 0;
      p.druidForm = null;
      p.druidFormTurns = 0;
      p.druidRegenBonus = 0;
      p.isSurrendered = false;
      p.minion = null;
      p.bardHealGroupBonus = 0;
      p.bardHealSingleBonus = 0;
      p.nextTurnStunFlag = false;
      p.warriorVulnerableTurns = 0;
      p.warriorVulnerableNextTurn = false;
      p.archerNoDodgeTurns = 0;
      p.archerNoDodgeNextTurn = false;
    }

    this.addLog(`🔄 隊長重啟了冒險！回到大廳整裝。`, 'info');
    this.isPaused = false;
    this.pausedRemainingSeconds = null;
    this.timerCallback = null;
    this.broadcastState();
    return { success: true };
  }

  sendChatMessage(socketId, message) {
    const player = this.players[socketId];
    if (!player || !message) return;
    const cleanMsg = String(message).trim().slice(0, 100);
    if (!cleanMsg) return;

    const roleInfo = CLASSES[player.role] || { name: '冒險者', emoji: '👤' };
    const chatData = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      senderId: player.id,
      senderName: player.name,
      senderRole: player.role,
      senderRoleName: roleInfo.name,
      senderEmoji: roleInfo.emoji,
      senderAvatar: player.customAvatar || null,
      message: cleanMsg,
      time: new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })
    };

    if (!this.chatMessages) this.chatMessages = [];
    this.chatMessages.push(chatData);
    if (this.chatMessages.length > 80) this.chatMessages.shift();

    this.addLog(`💬 **${player.name}**: ${cleanMsg}`, 'chat');
    this.io.to(this.code).emit('chat:message', chatData);
    this.broadcastState();
  }

  setTimer(seconds, callback, broadcastTicks = false) {
    this.clearTimer();
    this.timerCallback = callback;
    this.timerBroadcastTicks = broadcastTicks;
    this.timerEndsAt = Date.now() + seconds * 1000;
    const tick = () => {
      const remainingMs = this.timerEndsAt - Date.now();
      if (remainingMs <= 0) {
        this.turnTimer = null;
        this.timerEndsAt = null;
        this.timerCallback = null;
        callback();
      } else {
        if (broadcastTicks) this.broadcastState();
        this.turnTimer = setTimeout(tick, broadcastTicks ? Math.min(1000, remainingMs) : remainingMs);
      }
    };
    this.turnTimer = setTimeout(tick, broadcastTicks ? Math.min(1000, seconds * 1000) : seconds * 1000);
  }

  clearTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.timerEndsAt = null;
  }

  // 暫停 / 恢復遊戲功能
  togglePause(socketId) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (this.state === 'LOBBY' || this.state === 'GAME_OVER' || this.state === 'VICTORY') {
      return { success: false, message: '大廳或結算階段無法暫停遊戲！' };
    }

    if (!this.isPaused) {
      // 暫停
      this.isPaused = true;
      if (this.timerEndsAt) {
        this.pausedRemainingSeconds = Math.max(1, Math.ceil((this.timerEndsAt - Date.now()) / 1000));
      } else {
        this.pausedRemainingSeconds = null;
      }
      if (this.turnTimer) {
        clearTimeout(this.turnTimer);
        this.turnTimer = null;
      }
      this.addLog(`⏸️ **${player.name}** 暫停了遊戲！行動計時已凍結。`, 'warning');
      this.broadcastState();
      return { success: true, isPaused: true };
    } else {
      // 恢復
      this.isPaused = false;
      const remaining = this.pausedRemainingSeconds || 10;
      const cb = this.timerCallback;
      this.pausedRemainingSeconds = null;
      if (cb) {
        this.setTimer(remaining, cb, this.timerBroadcastTicks);
      }
      this.addLog(`▶️ **${player.name}** 恢復了遊戲！冒險繼續進行。`, 'info');
      this.broadcastState();
      return { success: true, isPaused: false };
    }
  }

  // 中止冒險 / 放棄挑戰 (中途結束判定為挑戰失敗)
  endBattle(socketId) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (socketId !== this.leaderId) {
      return { success: false, message: '只有隊長能中止挑戰！' };
    }
    if (this.state === 'LOBBY' || this.state === 'GAME_OVER' || this.state === 'VICTORY') {
      return { success: false, message: '目前非戰鬥或探索狀態！' };
    }

    this.clearTimer();
    this.isPaused = false;
    this.pausedRemainingSeconds = null;
    this.state = 'GAME_OVER';
    this.gameOverReason = 'abandon';
    this.addLog(`🏳️ **${player.name}**（隊長）中止了冒險，小隊於第 ${this.floor} 層【挑戰失敗】！`, 'warning');
    this.broadcastState();
    return { success: true };
  }

  addLog(text, type = 'info') {
    const logEntry = {
      id: Date.now() + Math.random().toString(36).slice(2, 6),
      time: new Date().toLocaleTimeString(),
      text,
      type
    };
    this.logs.push(logEntry);
    // Full session history is retained; the client displays only the latest five.
  }

  // 取得用於傳給客戶端的身歷其境資料 (隱藏敏感暗選)
  getClientState() {
    let timerRemaining = null;
    if (this.state === 'EVENT' && this.pendingDrop) {
      timerRemaining = null; // 寶箱獲得裝備時倒數暫停
    } else if (this.isPaused) {
      timerRemaining = this.pausedRemainingSeconds;
    } else if (this.timerEndsAt) {
      timerRemaining = Math.max(0, Math.ceil((this.timerEndsAt - Date.now()) / 1000));
    }

    const routeVoteCounts = {};
    if (this.currentRoutes) {
      for (const r of this.currentRoutes) {
        routeVoteCounts[r.id] = 0;
      }
    }
    if (this.routeVotes) {
      for (const rid of Object.values(this.routeVotes)) {
        if (rid && routeVoteCounts[rid] !== undefined) {
          routeVoteCounts[rid] += 1;
        }
      }
    }

    return {
      code: this.code,
      leaderId: this.leaderId,
      state: this.state,
      selectionState: this.selectionState || 'SELECTING',
      floor: this.floor,
      battleRound: this.battleRound,
      warriorShieldTurn: this.warriorShieldTurn,
      alcShieldTurns: this.alcShieldTurns || 0,
      alcVulnerableTurns: this.alcVulnerableTurns || 0,
      alcVulnerableNextTurn: this.alcVulnerableNextTurn || false,
      isPaused: this.isPaused,
      timerRemaining: timerRemaining,
      gameOverReason: this.gameOverReason,
      currentMonster: this.currentMonster ? {
        ...this.currentMonster,
        poisonTurns: this.currentMonster.poisonTurns || 0,
        poisonDmg: this.currentMonster.poisonDmg || 0
      } : null,
      currentEvent: this.currentEvent,
      currentTransition: this.currentTransition,
      currentPrologue: (this.state === 'PROLOGUE') ? STORY_TEXTS.prologue : null,
      narrativeControl: this.getNarrativeControl(),
      isNarrating: this.isNarrating || false,
      currentRoutes: this.currentRoutes || ROUTES.slice(0, 4),
      routeVotes: this.routeVotes || {},
      routeVoteCounts: routeVoteCounts,
      routePresentationId: this.routePresentationId,
      floorRevival: this.floorRevival,
      battlePresentationId: this.battlePresentationId,
      currentVictory: this.currentVictory,
      victoryInteractionReady: this.victoryInteractionReady || false,
      gameBalance: GAME_BALANCE,
      routeNarrative: STORY_TEXTS.routeChoice.paragraphs.slice(0, 2),
      pendingDrop: this.pendingDrop || null,
      floorDifficultyPercent: getFloorDifficultyBonusPercent(this.floor),
      players: Object.values(this.players).map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        isReady: Boolean(p.isReady),
        customAvatar: p.customAvatar || null,
        hp: p.hp,
        tempHp: p.tempHp || 0,
        displayHp: p.hp + (p.tempHp || 0),
        displayMaxHp: p.maxHp + (p.tempHp || 0),
        maxHp: p.maxHp,
        bonusAtk: p.bonusAtk,
        equips: (p.equips || []).map(e => ({ id: e.id, name: e.name, type: e.type, desc: e.desc, statDesc: e.statDesc })),
        equipCounts: p.equipCounts || {},
        availableSkills: getPlayerSkills(p),
        votedRouteId: (this.routeVotes && this.routeVotes[p.id]) || null,
        warriorVulnerableTurns: p.warriorVulnerableTurns || 0,
        downedForFloor: p.hp <= 0,
        archerNextDodgeBonus: p.archerNextDodgeBonus || 0,
        cannotCrit: p.cannotCrit,
        ...assassinState(p),
        ...p8State(p,this),
        statuses: playerStatuses(p, this, GAME_BALANCE),
        ammo: (p.ammo || []).slice(),
        isCrouchedThisRound: Boolean(p.isCrouchedThisRound),
        archerNoDodgeTurns: p.archerNoDodgeTurns || 0,
        alcAcidEquipHalvedTurns: p.alcAcidEquipHalvedTurns || 0,
        alcAcidStack: p.alcAcidStack || 0,
        werewolfMaxHpDeducted: p.werewolfMaxHpDeducted || 0,
        cooldowns: {
          ...p.cooldowns,
          ...(p.role === 'gladiator' && p.arenaActive ? {
            g_sacrifice: p.cooldowns.arena_g_sacrifice || 0,
            g_arena: p.cooldowns.arena_g_arena || 0
          } : {}),
          dru_transform: (p.druidFormTurns || 0)
        },
        isStealthed: p.isStealthed,
        stunnedNextTurn: p.stunnedNextTurn,
        bleedTurns: p.bleedTurns,
        poisonTurns: p.poisonTurns || 0,
        poisonDmg: p.poisonDmg || 0,
        druidForm: p.druidForm || null,
        druidFormTurns: p.druidFormTurns || 0,
        isSurrendered: p.isSurrendered || false,
        minions: (p.minions || []).map(m => ({
          id: m.id,
          type: m.type,
          name: m.name,
          minionIndex: m.minionIndex,
          avatar: m.avatar || (m.type === 'wolf' ? `/photo/幼狼${m.minionIndex || 1}.webp` : `/photo/小樹精${m.minionIndex || 1}.webp`),
          hp: m.hp,
          maxHp: m.maxHp,
          attack: m.attack ?? m.atk,
          atk: m.attack ?? m.atk,
          owner: p.name,
          ownerId: p.id,
          alive: m.hp > 0
        })),
        minion: (p.minions && p.minions[0]) ? {
          ...p.minions[0],
          avatar: p.minions[0].avatar || (p.minions[0].type === 'wolf' ? `/photo/幼狼${p.minions[0].minionIndex || 1}.webp` : `/photo/小樹精${p.minions[0].minionIndex || 1}.webp`),
          attack: p.minions[0].attack ?? p.minions[0].atk,
          atk: p.minions[0].attack ?? p.minions[0].atk,
          owner: p.name,
          ownerId: p.id,
          alive: p.minions[0].hp > 0
        } : (p.minion ? {
          ...p.minion,
          avatar: p.minion.avatar || (p.minion.type === 'wolf' ? `/photo/幼狼${p.minion.minionIndex || 1}.webp` : `/photo/小樹精${p.minion.minionIndex || 1}.webp`),
          attack: p.minion.attack ?? p.minion.atk,
          atk: p.minion.attack ?? p.minion.atk,
          owner: p.name,
          ownerId: p.id,
          alive: p.minion.hp > 0
        } : null),
        cannotCrit: p.cannotCrit,
        hasActed: p.action !== null, // 只透露是否已下達指令，暗中保密指令內容
        isLocked: p.isLocked || false,
        connected: p.connected
      })),
      logs: this.logs.slice(-30), // 最近 30 筆日誌
      chatMessages: (this.chatMessages || []).slice(-40) // 最近 40 筆小隊聊天訊息
    };
  }

  broadcastState() {
    this.io.to(this.code).emit('room:update', this.getClientState());
  }
}

Object.assign(Room.prototype, phase8Methods);
