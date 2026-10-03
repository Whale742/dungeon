// 遊戲房間管理核心 (Game Room Engine)
// 100% 完整移植 index.js 中的戰鬥演算法、職業技能、裝備、怪物抗性與傷害拆分機制

import {
  CLASSES,
  LOOT_TABLE,
  ENCOUNTERS,
  ROUTES,
  getRandomRoutes,
  applyEquipStats,
  removeEquipStats,
  equipItemToPlayer,
  unequipItemFromPlayer,
  formatPlayerEquips,
  getPlayerSkills,
  STORY_TEXTS,
  ROUTE_STORIES,
  BATTLE_NARRATIVES,
  getFloorDifficultyBonusPercent,
  getFloorDifficultyMultiplier
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
    this.floor = 1;
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
    this.pendingDrop = null; // { drop, ownerId, ownerName, source }
    this.monsterStunnedThisRound = false;
    this.frenzyTeamDrainTurns = 0;
    this.frenzyTeamDrainNextTurn = false;
    this.isWolfSurrenderGameOver = false;

    this.turnTimer = null;
    this.timerEndsAt = null;
    this.timerCallback = null;
    this.isPaused = false;
    this.pausedRemainingSeconds = null;
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
    player.archerNoDodgeTurns = 0;
    player.archerNoDodgeNextTurn = false;
  }

  selectEquipOwner(matchingPlayers) {
    if (!matchingPlayers || matchingPlayers.length === 0) return null;
    if (matchingPlayers.length === 1) return matchingPlayers[0];

    let minCount = Infinity;
    for (const p of matchingPlayers) {
      const count = (p.equips || []).length;
      if (count < minCount) minCount = count;
    }

    const candidates = matchingPlayers.filter(p => (p.equips || []).length === minCount);
    return candidates[Math.floor(Math.random() * candidates.length)];
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
      bonusAtk: 0,
      equips: [], // 上限 3 件裝備陣列
      equipCounts: {},
      cooldowns: {},
      action: null,
      targetPlayerId: null,
      cannotCrit: false,
      isStealthed: false,
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
      archerNoDodgeTurns: 0,
      archerNoDodgeNextTurn: false,
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

    if (this.state === 'LOBBY') {
      delete this.players[socketId];
      this.memberIds = this.memberIds.filter(id => id !== socketId);
      this.addLog(`🚪 **${player.name}** 離開了房間`, 'info');

      // 若隊長離開，轉移隊長
      if (this.leaderId === socketId && this.memberIds.length > 0) {
        this.leaderId = this.memberIds[0];
        this.addLog(`👑 **${this.players[this.leaderId].name}** 成為了新隊長！`, 'info');
      }
    } else {
      // 戰鬥或探索中斷線
      player.connected = false;
      this.addLog(`⚠️ **${player.name}** 斷線了！其回合將自動略過。`, 'warning');
      if (this.state === 'IN_BATTLE') {
        player.action = 'skip';
        this.checkTurnCompletion();
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
    player.hp = CLASSES[roleKey].maxHp;
    player.maxHp = CLASSES[roleKey].maxHp;
    
    const initialCooldowns = {};
    CLASSES[roleKey].skills.forEach(s => { initialCooldowns[s.id] = 0; });
    player.cooldowns = initialCooldowns;

    this.addLog(`🛡️ **${player.name}** 選擇了職業：**${CLASSES[roleKey].emoji} ${CLASSES[roleKey].name}**`, 'role');
    this.broadcastState();
    return { success: true };
  }

  startAdventure(socketId) {
    if (this.state !== 'LOBBY') return { success: false, message: '遊戲已經開始' };
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能點擊出發！' };

    // 檢查是否所有玩家都選了職業
    const unpicked = Object.values(this.players).filter(p => !p.role);
    if (unpicked.length > 0) {
      return { success: false, message: `還有隊員未選擇職業：${unpicked.map(p => p.name).join(', ')}` };
    }

    this.floor = 1;
    this.battlesInCurrentCycle = 0;
    this.state = 'PROLOGUE';
    this.addLog(`📜 **${STORY_TEXTS.prologue.title}**`, 'info');
    STORY_TEXTS.prologue.paragraphs.forEach(p => this.addLog(p, 'info'));

    // 7 秒後自動進入第 1 層路線選擇，隊長亦可點擊跳過開場
    this.setTimer(7, () => {
      if (this.state === 'PROLOGUE') {
        this.startRouteSelection();
      }
    });

    this.broadcastState();
    return { success: true };
  }

  skipPrologue(socketId) {
    if (this.state !== 'PROLOGUE') return { success: false, message: '目前不是開場階段' };
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能跳過開場！' };
    this.clearTimer();
    this.startRouteSelection();
    return { success: true };
  }

  startRouteSelection() {
    this.clearTimer();
    const alivePlayers = Object.values(this.players).filter(p => p.hp > 0);
    if (alivePlayers.length === 0) {
      this.handleGameOver();
      return;
    }

    this.state = 'CHOOSING_ROUTE';
    this.currentEvent = null;
    this.currentTransition = null;
    this.routeVotes = {}; // 重置全體投票記錄
    this.currentRoutes = getRandomRoutes(4); // 每次從 6 個選項中隨機抽出 4 個
    this.addLog(`🧭【第 ${this.floor} 層・迷霧分歧點】請全員共同投票決定前進路線！（15 秒倒數）`, 'info');
    
    // 15 秒全員投票倒數計時器
    this.setTimer(15, () => {
      if (this.state === 'CHOOSING_ROUTE') {
        this.tallyRouteVotes();
      }
    });

    this.broadcastState();
  }

  voteRoute(socketId, routeId) {
    if (this.state !== 'CHOOSING_ROUTE') return { success: false, message: '目前非路線投票階段' };
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
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

  // 兼容舊介面與舊事件
  selectRoute(socketId, routeId) {
    return this.voteRoute(socketId, routeId);
  }

  resolveRouteChoice(route) {
    const floorInCycle = ((this.floor - 1) % 5) + 1; // 1 ~ 5
    const floorsRemainingInCycle = 5 - floorInCycle + 1; // 5 ~ 1
    const battlesNeeded = Math.max(0, 2 - (this.battlesInCurrentCycle || 0));

    let outcomeType = 'battle';
    if (battlesNeeded >= floorsRemainingInCycle) {
      // 每5層保底至少2次戰鬥事件觸發
      outcomeType = 'battle';
    } else {
      const rand = Math.random();
      if (rand < 0.25) {
        outcomeType = 'treasure';
      } else if (rand < 0.5) {
        outcomeType = 'trap';
      } else {
        outcomeType = 'battle';
      }
    }

    if (outcomeType === 'battle') {
      this.battlesInCurrentCycle = (this.battlesInCurrentCycle || 0) + 1;
    }

    const routeData = ROUTE_STORIES[route.id] || ROUTE_STORIES['route_trail'];
    const outcomeData = routeData[outcomeType];

    this.state = 'TRANSITION';
    this.currentTransition = {
      floor: this.floor,
      title: `將進入第 ${this.floor} 層`,
      routeId: route.id,
      routeName: route.name,
      routeIcon: route.icon,
      outcomeType: outcomeType,
      storyTitle: outcomeData.title,
      storyText: outcomeData.story
    };

    this.addLog(`📜 **${this.currentTransition.title}**（路線：${route.name}）`, 'info');
    this.addLog(outcomeData.story, outcomeType === 'treasure' ? 'loot' : (outcomeType === 'trap' ? 'damage' : 'warning'));

    this.broadcastState();

    // 播放打字機標題與敘述轉場（持續 5 秒），隨後正式展開事件或戰鬥
    this.setTimer(5, () => {
      if (this.state === 'TRANSITION') {
        if (outcomeType === 'treasure') {
          this.handleTreasureEvent(outcomeData);
        } else if (outcomeType === 'trap') {
          this.handleTrapEvent(outcomeData);
        } else {
          this.handleBattleEvent(outcomeData);
        }
      }
    });
  }

  // 寶箱事件
  handleTreasureEvent(outcomeData = null) {
    this.state = 'EVENT';
    const healAmt = 25;
    for (const p of Object.values(this.players)) {
      if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + healAmt);
    }

    const activeRoles = new Set(Object.values(this.players).map(p => p.role).filter(Boolean));
    const unplayedLoots = LOOT_TABLE.filter(l => !activeRoles.has(l.role));
    const playedLoots = LOOT_TABLE.filter(l => activeRoles.has(l.role));

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
        ownerName: '無',
        ownerId: null
      };
      this.addLog(`🎁 **幸運降臨！發現遠古寶箱！** 全員回復 ${healAmt} 生命！`, 'loot');
      this.addLog(`💨 沒玩家玩這個職業，系統幫你們把【${drop.name}】丟掉嘍`, 'warning');
      this.broadcastState();
      this.setTimer(4, () => {
        this.advanceToNextFloorOrCheckpoint();
      });
      return;
    }

    const drop = (playedLoots.length > 0)
      ? playedLoots[Math.floor(Math.random() * playedLoots.length)]
      : LOOT_TABLE[Math.floor(Math.random() * LOOT_TABLE.length)];

    const matchingPlayers = Object.values(this.players).filter(p => p.role === drop.role);
    const equipOwner = this.selectEquipOwner(matchingPlayers) ||
      this.selectEquipOwner(Object.values(this.players).filter(p => p.hp > 0)) ||
      Object.values(this.players)[0];

    this.currentEvent = {
      type: 'treasure',
      title: outcomeData ? outcomeData.title : `🎁【第 ${this.floor} 層】發現遠古寶箱！`,
      story: outcomeData ? outcomeData.story : '',
      healAmt: healAmt,
      drop: drop,
      ownerName: equipOwner ? equipOwner.name : '未知',
      ownerId: equipOwner ? equipOwner.id : null
    };

    if (equipOwner) {
      this.pendingDrop = {
        drop: drop,
        ownerId: equipOwner.id,
        ownerName: equipOwner.name,
        source: 'treasure'
      };
      this.addLog(`🎁 **幸運降臨！發現遠古寶箱！** 全員回復 ${healAmt} 生命！獲得裝備【${drop.name}】(${drop.desc})，等待 **${equipOwner.name}** 抉擇是否穿戴！`, 'loot');

      // 設置 20 秒倒數等待玩家決定
      this.setTimer(20, () => {
        if (this.pendingDrop && this.state === 'EVENT') {
          this.addLog(`⏱️ 抉擇超時，已自動放棄【${drop.name}】。`, 'info');
          this.pendingDrop = null;
          this.broadcastState();
          this.advanceToNextFloorOrCheckpoint();
        }
      });
    } else {
      this.addLog(`🎁 **幸運降臨！發現遠古寶箱！** 全員回復 ${healAmt} 生命！`, 'loot');
      this.setTimer(4, () => {
        this.advanceToNextFloorOrCheckpoint();
      });
    }

    this.broadcastState();
  }

  // 陷阱事件
  handleTrapEvent(outcomeData = null) {
    this.state = 'EVENT';
    // 陷阱事件傷害：1~5層15點傷害，6~10層18點傷害，以此類推
    const cycle = Math.floor((this.floor - 1) / 5);
    const trapDmg = 15 + cycle * 3;
    const trapLogs = [];

    for (const p of Object.values(this.players)) {
      if (p.hp <= 0) continue;

      if (p.role === 'archer' && Math.random() < CLASSES.archer.dodgeRate) {
        trapLogs.push(`🪶 弓箭手 **${p.name}** 憑藉超凡敏捷側身翻滾，無傷避開了陷阱！`);
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
    }

    this.currentEvent = {
      type: 'trap',
      title: outcomeData ? outcomeData.title : `⚠️【第 ${this.floor} 層】致命陷阱！`,
      story: outcomeData ? outcomeData.story : '',
      details: trapLogs
    };

    trapLogs.forEach(log => this.addLog(log, 'damage'));
    this.broadcastState();

    // 檢查是否全滅
    const alivePlayers = Object.values(this.players).filter(p => p.hp > 0);
    if (alivePlayers.length === 0) {
      this.setTimer(3, () => this.handleGameOver());
      return;
    }

    this.setTimer(4, () => {
      this.advanceToNextFloorOrCheckpoint();
    });
  }

  // 戰鬥事件
  handleBattleEvent(outcomeData = null) {
    const baseMonster = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
    const playerCount = this.memberIds.length;
    const hpPlayerMultiplier = 1 + (playerCount - 1) * 1.0;
    const atkPlayerMultiplier = 1 + (playerCount - 1) * 0.5;
    // 敵方難度加成：1~5層每層+10%，6~10層每層+15%，以此類推
    const floorMultiplier = getFloorDifficultyMultiplier(this.floor);

    const scaledHp = Math.floor(baseMonster.hp * hpPlayerMultiplier * floorMultiplier);
    const scaledAtk = Math.max(5, Math.floor(baseMonster.attack * atkPlayerMultiplier * floorMultiplier));

    this.currentMonster = {
      name: baseMonster.name,
      avatar: baseMonster.avatar,
      desc: baseMonster.desc,
      attack: scaledAtk,
      hp: scaledHp,
      maxHp: scaledHp,
      baseHp: baseMonster.hp,
      resistance: baseMonster.resistance,
      ultName: baseMonster.ultName,
      poisonTurns: 0,
      poisonDmg: 0
    };

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
        p.maxHp -= 100;
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

    if (outcomeData && outcomeData.story) {
      this.addLog(`⚠️ **${outcomeData.story}**`, 'warning');
    }
    this.addLog(`⚔️ **遭遇強敵！【${this.currentMonster.name}】擋住了去路！**`, 'warning');
    this.executeTurn();
  }

  executeTurn() {
    this.clearTimer();
    const alivePlayers = Object.values(this.players).filter(p => p.hp > 0);
    if (alivePlayers.length === 0) {
      this.handleGameOver();
      return;
    }

    // 檢查德魯伊狼王臣服失敗判定：若生還者皆處於狼王臣服無法行動，且遭遇暗影魔狼族長
    const canFightLiving = Object.values(this.players).filter(p => p.hp > 0 && !p.isSurrendered);
    if (canFightLiving.length === 0 && this.currentMonster && (this.currentMonster.name === '暗影魔狼族長' || this.currentMonster.name.includes('暗影魔狼族長'))) {
      this.addLog(`👑🐺💀 **【血脈臣服·全隊潰敗】** 德魯伊處於狼王臣服狀態無法行動，且隊伍已無其他能戰鬥的生還隊友，冒險直接判定挑戰失敗！`, 'damage');
      this.handleGameOver();
      return;
    }

    this.state = 'IN_BATTLE';
    this.isNarrating = false; // 解除敘述鎖定，玩家現在可以選擇技能

    for (const p of Object.values(this.players)) {
      p.action = (p.isSurrendered || p.druidForm === 'tree') ? 'skip' : null;
      p.targetPlayerId = null;
      p.isStealthed = false;
    }

    const isUltTurn = (this.battleRound % 3 === 0);
    if (isUltTurn) {
      this.addLog(`⚠️ **【警告：BOSS 正在蓄力必殺技【${this.currentMonster.ultName}】(1.35倍傷害)！】**`, 'warning');
    }

    // 30 秒回合超時機制
    this.setTimer(30, () => {
      if (this.state === 'IN_BATTLE' && !this.isNarrating) {
        this.addLog('⏱️ 回合時間截止，未行動者自動跳過回合！', 'warning');
        for (const p of Object.values(this.players)) {
          if (p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && p.druidForm !== 'tree' && !p.action) {
            p.action = 'skip';
          }
        }
        this.resolveTurnActions();
      }
    });

    this.broadcastState();
  }

  submitAction(socketId, actionId, targetPlayerId = null) {
    if (this.state !== 'IN_BATTLE') return { success: false, message: '目前非戰鬥回合' };
    if (this.isNarrating) return { success: false, message: '戰況交鋒敘述進行中，請稍候！' };
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (player.hp <= 0) return { success: false, message: '你已陣亡，無法行動' };
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
        if ((player.cooldowns[actionId] || 0) > 0) return { success: false, message: '該技能冷卻中' };
      }
    }

    player.action = actionId;
    player.targetPlayerId = targetPlayerId;
    this.broadcastState();

    this.checkTurnCompletion();
    return { success: true };
  }

  checkTurnCompletion() {
    const allDone = Object.values(this.players)
      .filter(p => p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && p.druidForm !== 'tree')
      .every(p => p.action !== null);

    if (allDone) {
      this.clearTimer();
      // 稍微延遲 300ms 讓畫面反應用戶的按鈕反饋，然後結算
      setTimeout(() => this.resolveTurnActions(), 300);
    }
  }

  // 擊敗怪物勝利結算
  handleMonsterVictory(monster = this.currentMonster, log = [], visualEvents = [], skipEmit = false) {
    this.clearTimer();
    this.isNarrating = false;
    // 勝負判定：若敵方我方同時血量歸零，優先結算我方血量（判定為敵方勝利）
    const alivePlayers = Object.values(this.players).filter(p => p.hp > 0);
    if (alivePlayers.length === 0) {
      log.push({ text: `⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**`, type: 'damage' });
      log.forEach(l => this.addLog(l.text, l.type));
      if (!skipEmit) {
        this.io.to(this.code).emit('battle:visual_events', { events: visualEvents, round: this.battleRound, monsterKilled: true });
      }
      this.broadcastState();
      this.setTimer(3, () => this.handleGameOver());
      return;
    }

    if (!monster) return;
    monster.hp = 0;
    log.push({ text: `🎉 **${monster.name} 倒下了！小隊成功突破第 ${this.floor} 層！**`, type: 'loot' });

    for (const p of Object.values(this.players)) {
      p.stunnedNextTurn = false;
      p.bleedTurns = 0;
      p.poisonTurns = 0;
      p.isSurrendered = false;
      if (p.druidForm === 'treant' || p.druidForm === 'tree') {
        p.maxHp -= 100;
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

      // 德魯伊樹精自然回血加成提升（戰鬥成功後加成）
      if (p.role === 'druid') {
        p.druidRegenBonus = (p.druidRegenBonus || 0) + 2;
      }
    }

    this.alcShieldTurns = 0;
    this.alcVulnerableTurns = 0;
    this.alcVulnerableNextTurn = false;

    for (const p of Object.values(this.players)) {
      if (p.hp > 0) {
        p.maxHp += 10;
        p.bonusAtk += 5;
        const healAmt = Math.max(1, Math.round(p.maxHp * 0.2));
        p.hp = Math.min(p.maxHp, p.hp + 10 + healAmt);
        log.push({ text: `💪 **${p.name}** HP上限 +10、攻擊力 +5，並恢復了 ${healAmt} 生命（❤️ ${p.hp}/${p.maxHp}）`, type: 'heal' });
      }
    }

    const activeRoles = new Set(Object.values(this.players).map(p => p.role).filter(Boolean));
    const unplayedLoots = LOOT_TABLE.filter(l => !activeRoles.has(l.role));
    const playedLoots = LOOT_TABLE.filter(l => activeRoles.has(l.role));

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
      equipOwner = this.selectEquipOwner(matchingPlayers) ||
        this.selectEquipOwner(Object.values(this.players).filter(p => p.hp > 0)) ||
        Object.values(this.players)[0];

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
    if (!skipEmit) {
      this.io.to(this.code).emit('battle:visual_events', { events: visualEvents, round: this.battleRound, monsterKilled: true });
    }
    this.broadcastState();

    if (equipOwner) {
      // 設置 20 秒倒數等待玩家決定
      this.setTimer(20, () => {
        if (this.pendingDrop) {
          this.addLog(`⏱️ 抉擇超時，已自動放棄【${drop.name}】。`, 'info');
          this.pendingDrop = null;
          this.broadcastState();
          this.advanceToNextFloorOrCheckpoint();
        }
      });
    } else {
      this.setTimer(4, () => {
        this.advanceToNextFloorOrCheckpoint();
      });
    }
  }

  // 處理裝備領取 / 放棄 / 替換
  handleEquipChoice(socketId, action, replaceIndex = -1) {
    if (!this.pendingDrop) return { success: false, message: '當前無待領取裝備' };
    if (this.pendingDrop.ownerId !== socketId) return { success: false, message: '非本裝備獲得者' };

    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };

    this.clearTimer();
    const drop = this.pendingDrop.drop;

    if (action === 'equip') {
      const replaced = equipItemToPlayer(player, drop, replaceIndex);
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

    setTimeout(() => {
      this.advanceToNextFloorOrCheckpoint();
    }, 1200);

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
    this.isNarrating = true;
    const monster = this.currentMonster;
    const log = [];
    const visualEvents = [];
    const narratives = [];

    let bardDmgMultiplier = 1.0;
    let bardDmgReduction = 1.0;
    let monsterAttackReduction = 0;
    let assassinDidCrit = false;
    let bardBuffActive = false;

    // 0. 特性觸發：基礎血量 < 100 的怪物在回合開始造成撕裂傷害 (套用難度層數加成)
    if (monster.baseHp < 100) {
      const bleedDmg = Math.floor(2 * getFloorDifficultyMultiplier(this.floor));
      for (const p of Object.values(this.players)) {
        if (p.hp > 0 && p.bleedTurns > 0) {
          p.bleedTurns -= 1;
          visualEvents.push({ type: 'bleed', target: p.id, value: bleedDmg });
          if (p.hp <= bleedDmg) {
            if (p.druidForm === 'treant') {
              p.hp = 1;
              p.druidForm = 'tree';
              p.druidFormTurns = 1;
              p.stunnedNextTurn = true;
              p.action = 'skip';
              log.push({ text: `🪵 **${p.name}** 撕裂傷勢致命，觸發樹精守護！保留 1 點生命並化身為【沉睡古樹】，進入 1 回合休眠狀態（無法行動）！`, type: 'buff' });
              visualEvents.push({ type: 'transform_tree', sourceId: p.id });
            } else {
              p.hp = 0;
              this.clearPlayerDebuffs(p);
              if (p.druidForm === 'tree') {
                p.maxHp -= 100;
                p.druidForm = null;
                p.druidFormTurns = 0;
              }
              log.push({ text: `🩸 **${p.name}** 傷口惡化承受 **${bleedDmg}** 點撕裂傷害，傷重倒地！💀`, type: 'damage' });
            }
          } else {
            p.hp -= bleedDmg;
            log.push({ text: `🩸 **${p.name}** 傷口持續撕裂，受到 **${bleedDmg}** 點額外傷害！（❤️ ${p.hp}/${p.maxHp}，剩餘流血: ${p.bleedTurns} 回合）`, type: 'damage' });
          }
        }
      }
    }

    // 0.2 德魯伊樹精/古樹形態自然回復 (每回合開始回復5HP，受戰鬥成功加成)
    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && (p.druidForm === 'treant' || p.druidForm === 'tree')) {
        const regenAmt = 5 + (p.druidRegenBonus || 0);
        const oldHp = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + regenAmt);
        const actualGain = p.hp - oldHp;
        log.push({ text: `🌿 **${p.name}** (${p.druidForm === 'tree' ? '沉睡古樹' : '樹精'}) 汲取自然精華自然回復 **${actualGain}** 點生命！（❤️ ${p.hp}/${p.maxHp}）`, type: 'heal' });
        visualEvents.push({ type: 'heal', targetId: p.id, value: actualGain, label: '自然回復' });
      }
    }

    // 0.5 劇毒傷害結算 (回合初各受 3 點毒傷)
    if (monster.hp > 0 && monster.poisonTurns > 0) {
      const pDmg = 3;
      monster.hp = Math.max(0, monster.hp - pDmg);
      monster.poisonTurns -= 1;
      visualEvents.push({ type: 'poison_damage', target: 'monster', value: pDmg });
      if (monster.hp <= 0) {
        log.push({ text: `🧪 **${monster.name}** 體內劇毒發作受到 **${pDmg}** 點毒傷倒下！💀`, type: 'damage' });
      } else {
        log.push({ text: `🧪 **${monster.name}** 劇毒發作受到 **${pDmg}** 點毒素傷害！（剩餘中毒: ${monster.poisonTurns} 回合）`, type: 'damage' });
      }
    }

    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && p.poisonTurns > 0) {
        const pDmg = 3;
        p.poisonTurns -= 1;
        visualEvents.push({ type: 'poison_damage', target: p.id, value: pDmg });
        if (p.hp <= pDmg) {
          if (p.druidForm === 'treant') {
            p.hp = 1;
            p.druidForm = 'tree';
            p.druidFormTurns = 1;
            p.stunnedNextTurn = true;
            p.action = 'skip';
            log.push({ text: `🪵 **${p.name}** 劇毒致命，觸發樹精守護！保留 1 點生命並化身為【沉睡古樹】，進入 1 回合休眠狀態（無法行動）！`, type: 'buff' });
            visualEvents.push({ type: 'transform_tree', sourceId: p.id });
          } else {
            p.hp = 0;
            this.clearPlayerDebuffs(p);
            if (p.druidForm === 'tree') {
              p.maxHp -= 100;
              p.druidForm = null;
              p.druidFormTurns = 0;
            }
            log.push({ text: `🧪 **${p.name}** 劇毒發作受到 **${pDmg}** 點傷害，不幸身亡！💀`, type: 'damage' });
          }
        } else {
          p.hp -= pDmg;
          log.push({ text: `🧪 **${p.name}** 劇毒灼燒受到 **${pDmg}** 點毒素傷害！（❤️ ${p.hp}/${p.maxHp}，剩餘中毒: ${p.poisonTurns} 回合）`, type: 'damage' });
        }
      }
    }

    // 勝負判定：若我方全員倒下，即使敵方同時歸零，亦優先結算我方陣亡（敵方勝利）
    const aliveAfterDot = Object.values(this.players).filter(p => p.hp > 0);
    if (aliveAfterDot.length === 0) {
      if (monster.hp <= 0) {
        log.push({ text: `⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**`, type: 'damage' });
      }
      log.forEach(l => this.addLog(l.text, l.type));
      this.io.to(this.code).emit('battle:visual_events', { events: visualEvents, round: this.battleRound, monsterKilled: monster.hp <= 0 });
      this.broadcastState();
      this.setTimer(3, () => this.handleGameOver());
      return;
    }

    // 檢查德魯伊狼王臣服失敗判定：隊友若因流血/劇毒倒下，生還者僅剩臣服德魯伊
    const canFightAfterDot = Object.values(this.players).filter(p => p.hp > 0 && !p.isSurrendered);
    if (canFightAfterDot.length === 0 && (monster.name === '暗影魔狼族長' || monster.name.includes('暗影魔狼族長'))) {
      log.push({ text: `👑🐺💀 **【血脈臣服·全隊潰敗】** 隊友皆因流血/劇毒倒下，生還的德魯伊處於狼王臣服狀態無法行動，小隊直接判定挑戰失敗！`, type: 'damage' });
      log.forEach(l => this.addLog(l.text, l.type));
      this.io.to(this.code).emit('battle:visual_events', { events: visualEvents, round: this.battleRound, monsterKilled: false });
      this.broadcastState();
      this.setTimer(3, () => this.handleGameOver());
      return;
    }

    if (monster.hp <= 0) {
      this.handleMonsterVictory(monster, log, visualEvents);
      return;
    }

    // 0.8 回合初狂亂殺戮曲代價扣除 (全隊扣除 20% 最大生命)
    if (this.frenzyTeamDrainTurns > 0) {
      this.frenzyTeamDrainTurns -= 1;
      for (const pl of Object.values(this.players)) {
        if (pl.hp > 0) {
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

    // 0.85 祝福絲綢袍（詩人裝備）：每回合初自動為全隊當前生命最低的隊友補血，補血量為詩人最大生命值的 5%
    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && p.role === 'bard') {
        const robeCount = (p.equips || []).filter(e => e.id === 'b_robe' || e.name === '祝福絲綢袍').length;
        if (robeCount > 0) {
          const livingAllies = Object.values(this.players).filter(pl => pl.hp > 0);
          if (livingAllies.length > 0) {
            livingAllies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
            const targetAlly = livingAllies[0];
            const healAmt = Math.max(1, Math.round(p.maxHp * 0.05 * robeCount));
            targetAlly.hp = Math.min(targetAlly.maxHp, targetAlly.hp + healAmt);
            log.push({ text: `✨ **${p.name}** 的【祝福絲綢袍】散發生機微光，為傷勢最重的 **${targetAlly.name}** 回復了 **${healAmt}** 點生命！（❤️ ${targetAlly.hp}/${targetAlly.maxHp}）`, type: 'heal' });
            visualEvents.push({ type: 'heal', targetId: targetAlly.id, value: healAmt, label: '祝福絲綢袍' });
          }
        }
      }
    }

    // 0.9 自然共鳴（德魯伊裝備）：每回合初為所有存活僕從回復 3 點生命
    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && p.role === 'druid') {
        const resCount = (p.equips || []).filter(e => e.id === 'dru_resonance' || e.name === '自然共鳴').length;
        if (resCount > 0) {
          for (const owner of Object.values(this.players)) {
            if (owner.hp > 0 && owner.minions && owner.minions.length > 0) {
              for (const m of owner.minions) {
                if (m.hp > 0) {
                  const healAmt = 3 * resCount;
                  m.hp = Math.min(m.maxHp, m.hp + healAmt);
                  log.push({ text: `🌿 【自然共鳴】為 **${owner.name}** 的僕從【${m.name}】回復了 **${healAmt}** 點生命！（🐾 ${m.hp}/${m.maxHp}）`, type: 'heal' });
                }
              }
            }
          }
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
          visualEvents.push({ type: 'bard_buff', source: p.id });
          log.push({ text: `🪕🔥 **${p.name}** 奏響【狂亂殺戮曲】！激發癲狂戰意，全隊本回合造成的傷害提高 70%！(⚠️ 狂亂代價：下回合全隊將扣除 20% 最大生命！)`, type: 'buff' });
        } else if (p.action === 'b_buff') {
          const harpCount = (p.equips || []).filter(e => e.id === 'b_harp' || e.name === '精靈木豎琴').length;
          const buffBoost = 0.50 * (1 + 0.10 * harpCount);
          bardDmgMultiplier = Math.max(bardDmgMultiplier, 1.0 + buffBoost);
          bardDmgReduction = 0.75;
          bardBuffActive = true;
          visualEvents.push({ type: 'bard_buff', source: p.id });

          // 25% 機率【狂熱透支】，結算時全體隊友各自扣除 5 點生命
          const isOverdrawn = Math.random() < 0.25;
          if (isOverdrawn) {
            for (const ally of Object.values(this.players)) {
              if (ally.hp > 0) ally.hp = Math.max(1, ally.hp - 5);
            }
            log.push({ text: `🪕🔥 **${p.name}** 奏響【狂熱協奏】！全隊本回合增傷 50%、減傷 25%，但引發【狂熱透支】，全體隊友各扣除 5 點生命！`, type: 'warning' });
          } else {
            log.push({ text: `🪕 **${p.name}** 奏響【狂熱協奏】！全隊本回合造成的傷害提高 50%、承受傷害降低 25%，並削弱怪物抗性至 65%！`, type: 'buff' });
          }
        }
      }
    }

    const applyResistanceDamage = (rawDmg, dmgType) => {
      let finalDmg = rawDmg;
      let isResisted = false;
      const resistRate = bardBuffActive ? 0.65 : 0.70;
      const penetrationMultiplier = 1 - resistRate;

      if (monster.resistance === 'phys' && dmgType === 'phys') {
        finalDmg = Math.floor(finalDmg * penetrationMultiplier);
        isResisted = true;
      } else if (monster.resistance === 'mag' && dmgType === 'mag') {
        finalDmg = Math.floor(finalDmg * penetrationMultiplier);
        isResisted = true;
      }
      return { dmg: Math.max(1, finalDmg), isResisted, resistPercent: Math.round(resistRate * 100) };
    };

    // 1.5 僕從每回合自動攻擊一次 (活著時自動施放攻擊)
    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && p.minions && p.minions.length > 0) {
        for (const m of p.minions) {
          if (m.hp > 0 && monster.hp > 0) {
            const raw = Math.floor(m.atk * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🐾 **${p.name}** 的僕從【${m.name}】主動出擊，對怪物造成 **${dmg}** 點傷害！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: m.name });
            if (monster.hp <= 0) {
              const livingPlayers = Object.values(this.players).filter(pl => pl.hp > 0);
              if (livingPlayers.length === 0) {
                log.push({ text: `⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**`, type: 'damage' });
                log.forEach(l => this.addLog(l.text, l.type));
                this.io.to(this.code).emit('battle:visual_events', { events: visualEvents, round: this.battleRound, monsterKilled: true });
                this.broadcastState();
                this.setTimer(3, () => this.handleGameOver());
                return;
              }
              this.handleMonsterVictory(monster, log, visualEvents);
              return;
            }
          }
        }
      }
    }

    // 2. 玩家行動結算
    const getEffectiveBonusAtk = (pl) => {
      let bonus = pl.bonusAtk;
      if (pl.alcAcidEquipHalvedTurns > 0) {
        const equipAtk = (pl.equips || []).reduce((sum, eq) => sum + (eq.bonusAtk || 0), 0);
        bonus -= Math.floor(equipAtk * 0.5);
      }
      return bonus;
    };

    for (const p of Object.values(this.players)) {
      if (p.isSurrendered) {
        log.push({ text: `🐺 **${p.name}** 陷入暗影魔狼族長的血脈壓制臣服狀態，無法行動！`, type: 'warning' });
        continue;
      }

      if (p.druidForm === 'tree') {
        log.push({ text: `🪵 **${p.name}** 化身為樹木休眠中，本回合無法行動！`, type: 'info' });
        continue;
      }

      if (p.stunnedNextTurn) {
        log.push({ text: `💫 **${p.name}** 處於脫力虛脫狀態，本回合無法行動，正在努力調整呼吸！`, type: 'warning' });
        continue;
      }

      if (p.hp <= 0) continue;

      if (p.action === 'skip') {
        log.push({ text: `⏭️ **${p.name}** 選擇了保留實力，跳過了本回合行動！`, type: 'info' });
        continue;
      }

      if (!p.action) {
        log.push({ text: `⏳ **${p.name}** (${CLASSES[p.role]?.name || '勇者'}) 猶豫不決，本回合發呆！`, type: 'warning' });
        continue;
      }

      switch (p.action) {
        case 'basic': {
          const dmgType = (p.role === 'mage' || p.role === 'bard' || p.role === 'alchemist') ? 'mag' : 'phys';
          let baseAtk = 10;
          if (p.role === 'druid' && p.druidForm === 'werewolf') baseAtk += 20;
          if (p.role === 'druid' && p.druidForm === 'treant') baseAtk = Math.max(1, baseAtk - 5);
          const raw = Math.floor((baseAtk + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, dmgType);
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
          const typeNote = dmgType === 'mag' ? '【魔法】' : '【物理】';
          log.push({ text: `🗡️ **${p.name}** 施展${typeNote}【普通攻擊】，對怪物造成 **${dmg}** 點傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType, value: dmg, isCrit: false, label: '普通攻擊' });
          if (p.role === 'assassin' && p.cannotCrit) p.cannotCrit = false;
          break;
        }
        case 'w_strike': {
          const hasGreatsword = (p.equips || []).some(e => e.id === 'w_greatsword' || e.name === '雙手劍');
          const normalBase = hasGreatsword ? 25 : 18;
          const isUnbalanced = Math.random() < 0.20;
          if (isUnbalanced) {
            const raw = Math.floor((5 + p.bonusAtk) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            p.warriorVulnerableNextTurn = true;
            const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🛡️⚠️ **${p.name}** 揮動巨劍時【揮砍失衡】！僅造成 **${dmg}** 點【物理】傷害${resNote}，失去重心導致下回合自身受傷 +20%！`, type: 'warning' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '堅定斬擊(失衡)' });
          } else {
            const raw = Math.floor((normalBase + p.bonusAtk) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🛡️ **${p.name}** 揮動巨劍斬擊，對怪物造成 **${dmg}** 點【物理】重創！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '堅定斬擊' });
          }
          break;
        }
        case 'w_shield': {
          this.warriorShieldTurn = 1;
          const isCracked = Math.random() < 0.25;
          p.shieldCrackedThisTurn = isCracked;
          if (isCracked) {
            log.push({ text: `🛡️💥 **${p.name}** 築起【壁壘守護】！本回合阻擋 90% 傷害，但盾面發生【盾牌龜裂】，技能 CD 額外延長 1 回合！`, type: 'warning' });
          } else {
            log.push({ text: `🛡️ **${p.name}** 築起【壁壘守護】！本回合全隊將阻擋 90% 的傷害！`, type: 'buff' });
          }
          visualEvents.push({ type: 'shield_cast', sourceId: p.id, label: '壁壘守護' });
          break;
        }
        case 'w_cleave': {
          const raw = Math.floor((40 + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
          log.push({ text: `⚔️ **${p.name}** 雙手緊握巨劍掀起暴風，發動【狂怒重劈】造成 **${dmg}** 點【物理】重創！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '狂怒重劈' });
          break;
        }
        case 'm_blast': {
          const isBackfire = Math.random() < 0.25;
          if (isBackfire) {
            const raw = Math.floor((10 + p.bonusAtk) * bardDmgMultiplier);
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
            const raw = Math.floor((45 + p.bonusAtk) * bardDmgMultiplier);
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
              if (ally.hp > 0) ally.hp = Math.min(ally.maxHp, ally.hp + actualBonus);
            }
            log.push({ text: `🩸 **${p.name}** 觸發【嗜血法袍】！額外撕裂目標 **${actualBonus}** 點生命，並轉化血氣為全體隊友回復 **${actualBonus}** 點生命！`, type: 'heal' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: actualBonus, singleTargetId: null, singleValue: 0 });
          }
          break;
        }
        case 'm_drain': {
          const rawBase = Math.floor(Math.random() * 40) + 1; // 1~40 極端浮動
          const raw = Math.floor((rawBase + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const healAmt = Math.max(1, Math.round(dmg * 0.2));
          p.hp = Math.min(p.maxHp, p.hp + healAmt);
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
              if (ally.hp > 0) ally.hp = Math.min(ally.maxHp, ally.hp + actualBonus);
            }
            log.push({ text: `🩸 **${p.name}** 觸發【嗜血法袍】！額外撕裂目標 **${actualBonus}** 點生命，並轉化血氣為全體隊友回復 **${actualBonus}** 點生命！`, type: 'heal' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: actualBonus, singleTargetId: null, singleValue: 0 });
          }
          break;
        }
        case 'a_shot': {
          const isMiss = Math.random() < 0.20;
          if (isMiss) {
            p.archerNoDodgeNextTurn = true;
            log.push({ text: `🏹💨 **${p.name}** 屏息狙擊受到亂流影響，【箭矢脫靶 (Miss)】造成 0 點傷害！身形露出破綻，下回合失去閃避率 (0%)！`, type: 'warning' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: 0, isCrit: false, label: '精準狙擊(脫靶)' });
          } else {
            const raw = Math.floor((35 + p.bonusAtk) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🛡️️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🏹 **${p.name}** 射出精準箭矢，造成 **${dmg}** 點【物理】傷害！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '精準狙擊' });
          }
          break;
        }
        case 'a_rain': {
          monsterAttackReduction += 10;
          const raw = Math.floor((20 + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const isTurbulence = Math.random() < 0.20;
          if (isTurbulence) {
            const livingAllies = Object.values(this.players).filter(pl => pl.hp > 0);
            if (livingAllies.length > 0) {
              const victim = livingAllies[Math.floor(Math.random() * livingAllies.length)];
              victim.hp = Math.max(0, victim.hp - 10);
              log.push({ text: `🏹🌪️ **${p.name}** 召喚【箭雨壓制】，造成 **${dmg}** 點【魔法】傷害${resNote}並削弱怪物 10 點攻擊！但引發【狂風亂流】，偏折箭矢誤傷了 **${victim.name}** 10 點傷害！（❤️ ${victim.hp}/${victim.maxHp}）`, type: 'warning' });
              visualEvents.push({ type: 'self_damage', targetId: victim.id, value: 10 });
              if (victim.hp <= 0) {
                victim.hp = 0;
                this.clearPlayerDebuffs(victim);
                log.push({ text: `💀 **${victim.name}** 不幸被流彈誤傷陣亡！`, type: 'damage' });
              }
            }
          } else {
            log.push({ text: `🏹 **${p.name}** 召喚【箭雨壓制】，造成 **${dmg}** 點【魔法】傷害${resNote}並削弱怪物 10 點攻擊！`, type: 'combat' });
          }
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '箭雨壓制' });
          break;
        }
        case 's_stab': {
          let isCrit = false;
          if (p.cannotCrit) {
            isCrit = false;
            p.cannotCrit = false;
            log.push({ text: `⚠️ 刺客 **${p.name}** 剛從陰影現身立足未穩，本次刺殺無法暴擊！`, type: 'warning' });
          } else {
            const bladeCount = (p.equips || []).filter(e => e.id === 's_blade' || e.name === '染毒刺刃').length;
            const critRate = CLASSES.assassin.critRate + 0.30 * bladeCount;
            isCrit = Math.random() < critRate;
          }

          const base = 30 + p.bonusAtk;
          const finalBase = isCrit ? base * 2 : base;
          const raw = Math.floor(finalBase * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';

          if (isCrit) {
            assassinDidCrit = true;
            log.push({ text: `💥 **${p.name}** 觸發致命暴擊！造成 **${dmg}** 點【物理】打擊！${resNote} (⚡ 觸發特性：【暗影刺殺】無冷卻！)`, type: 'combat' });
          } else {
            log.push({ text: `🗡️ **${p.name}** 發動暗影刺殺，造成 **${dmg}** 點【物理】傷害！${resNote}`, type: 'combat' });
          }
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: isCrit, label: '暗影刺殺' });
          break;
        }
        case 's_smoke': {
          p.isStealthed = true;
          p.cannotCrit = true;
          log.push({ text: `💨 **${p.name}** 擲出煙霧彈隱入暗影，本回合避開所有攻擊！（⚠️ 下次攻擊將無法暴擊）`, type: 'buff' });
          visualEvents.push({ type: 'stealth', sourceId: p.id, label: '煙霧匿蹤' });
          break;
        }
        case 'b_heal': {
          const harpCount = (p.equips || []).filter(e => e.id === 'b_harp' || e.name === '精靈木豎琴').length;
          const harpMult = 1 + 0.10 * harpCount;
          const isOffKey = Math.random() < 0.20;

          if (isOffKey) {
            const groupHeal = Math.round(5 * harpMult);
            for (const ally of Object.values(this.players)) {
              if (ally.hp > 0) ally.hp = Math.min(ally.maxHp, ally.hp + groupHeal);
            }
            log.push({ text: `🪕😖 **${p.name}** 撥弄琴弦時【刺耳走音】！刺耳噪音打亂了旋律，全體隊友僅能回復 **${groupHeal}** 點生命！`, type: 'warning' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: groupHeal, singleTargetId: null, singleValue: 0 });
          } else {
            const groupHealAmt = Math.round((22 + (p.bardHealGroupBonus || 0)) * harpMult);
            const singleHealAmt = Math.round((28 + (p.bardHealSingleBonus || 0)) * harpMult);

            for (const ally of Object.values(this.players)) {
              if (ally.hp > 0) ally.hp = Math.min(ally.maxHp, ally.hp + groupHealAmt);
            }

            const targetAlly = this.players[p.targetPlayerId] || p;
            if (targetAlly && targetAlly.hp > 0) {
              targetAlly.hp = Math.min(targetAlly.maxHp, targetAlly.hp + singleHealAmt);
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
          const raw = Math.floor((15 + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const isStun = Math.random() < 0.30;
          if (isStun) {
            this.monsterStunnedThisRound = true;
            log.push({ text: `🪕💤 **${p.name}** 奏響【催眠夜曲】，造成 **${dmg}** 點【魔法】傷害${resNote}！魔性琴音成功催眠 **${monster.name}**，使其本回合無法行動！`, type: 'combat' });
          } else {
            log.push({ text: `🪕 **${p.name}** 奏響【催眠夜曲】，造成 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
          }
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '催眠夜曲' });
          break;
        }
        case 'b_frenzy': {
          const raw = Math.floor((20 + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          log.push({ text: `🪕🔥 **${p.name}** 奏響【狂亂殺戮曲】，轟出 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '狂亂殺戮曲' });
          break;
        }
        case 'b_buff':
          break;

        case 'b_revive': {
          const revivedPlayer = this.players[p.targetPlayerId];
          if (revivedPlayer) {
            revivedPlayer.hp = Math.max(1, Math.floor(revivedPlayer.maxHp * 0.35));
            p.nextTurnStunFlag = true;
            revivedPlayer.nextTurnStunFlag = true;
            log.push({ text: `🕊️✨ **${p.name}** 唱響了神聖奇蹟【甦生之歌】！將倒下的 **${revivedPlayer.name}** 喚醒歸隊（恢復了 **${revivedPlayer.hp}** 點生命）！*(⚠️ 代價生效：下一回合兩人都將脫力無法行動！)*`, type: 'heal' });
            visualEvents.push({ type: 'revive', sourceId: p.id, targetId: revivedPlayer.id, value: revivedPlayer.hp });
          }
          break;
        }

        // 鍊金術士技能
        case 'alc_acid': {
          const buretteCount = (p.equips || []).filter(e => e.id === 'alc_burette' || e.name === '精密滴定管' || e.name === '精密滴管').length;
          const selfDmg = buretteCount > 0 ? 0 : 15;
          p.alcAcidEquipHalvedTurns = 2;
          const raw = Math.floor((40 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          p.hp = Math.max(0, p.hp - selfDmg);
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const buretteNote = buretteCount > 0 ? ' (🧪精密滴管移除自傷)' : '';
          log.push({ text: `⚗️ **${p.name}** 投擲【腐蝕強酸瓶】，造成 **${dmg}** 點【魔法】傷害！${resNote}${selfDmg > 0 ? ` 自身受到 **${selfDmg}** 點自傷！` : buretteNote + '！'}⚠️ 強酸腐蝕自身裝備，裝備效果減半持續 2 回合！（❤️ ${p.hp}/${p.maxHp}）`, type: 'combat' });
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
          const buretteCount = (p.equips || []).filter(e => e.id === 'alc_burette' || e.name === '精密滴定管' || e.name === '精密滴管').length;
          const selfDmg = buretteCount > 0 ? 0 : 5;
          const raw = Math.floor((30 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          p.hp = Math.max(0, p.hp - selfDmg);
          monster.poisonTurns = 2;
          monster.poisonDmg = 5;
          for (const pl of Object.values(this.players)) {
            if (pl.hp > 0) {
              pl.poisonTurns = 2;
              pl.poisonDmg = 5;
            }
          }
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const buretteNote = buretteCount > 0 ? ' (🧪精密滴管移除自傷)' : '';
          log.push({ text: `🧪 **${p.name}** 引爆【劇毒煙霧瓶】，造成 **${dmg}** 點【魔法】傷害！${resNote}${selfDmg > 0 ? ` 自身受到 **${selfDmg}** 點自傷！` : buretteNote + '！'}濃烈毒霧覆蓋全場，**敵我雙方皆陷入劇毒（後續2回合每回合初各受5點毒傷）**！`, type: 'combat' });
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
          const hasAbnormalStatus = (p.poisonTurns > 0 || p.bleedTurns > 0 || p.stunnedNextTurn || p.nextTurnStunFlag || p.isSurrendered || p.cannotCrit);

          if (!hasAbnormalStatus) {
            // 身上無異常狀態：2技能效果變成回復 15 點血（全員回復 15 點生命值，不觸發命運反噬）
            for (const pl of Object.values(this.players)) {
              pl.bleedTurns = 0;
              pl.poisonTurns = 0;
              if (pl.hp > 0) pl.hp = Math.min(pl.maxHp, pl.hp + 15);
            }
            log.push({ text: `🌿⚗️ **${p.name}** 身上無異常狀態，調配出【溫和調和試劑】！全員穩定回復 **15** 點生命值！`, type: 'heal' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: 15, singleTargetId: null, singleValue: 0 });
          } else {
            // 身上有異常狀態：驅散全體負面效果 + 命運煉成賭博
            for (const pl of Object.values(this.players)) {
              pl.bleedTurns = 0;
              pl.poisonTurns = 0;
            }
            const buretteCount = (p.equips || []).filter(e => e.id === 'alc_burette' || e.name === '精密滴定管' || e.name === '精密滴管').length;
            // 精密滴管使 2 技能失敗機率改變成 65%（大成功機率 35%），未裝備時為 50%
            const successRate = buretteCount > 0 ? 0.35 : 0.50;
            const isSuccess = Math.random() < successRate;
            if (isSuccess) {
              for (const pl of Object.values(this.players)) {
                if (pl.hp > 0) pl.hp = Math.min(pl.maxHp, pl.hp + 40);
              }
              this.alcShieldTurns = 2;
              log.push({ text: `✨⚗️ **${p.name}** 調配【命運煉成試劑】—— **【煉金大成功】**！全體負面效果完全淨化！全員回復 **40** HP，並獲得持續 **2** 回合的 **70% 減傷護盾**！🛡️`, type: 'buff' });
              visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: 40, singleTargetId: null, singleValue: 0 });
              visualEvents.push({ type: 'alc_shield', turns: 2 });
            } else {
              for (const pl of Object.values(this.players)) {
                if (pl.hp > 0) pl.hp = Math.min(pl.maxHp, pl.hp + 10);
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
          p.druidFormTurns = 2;
          if (isWerewolf) {
            p.druidForm = 'werewolf';
            const deduct = Math.min(20, Math.max(0, p.maxHp - 1));
            p.werewolfMaxHpDeducted = (p.werewolfMaxHpDeducted || 0) + deduct;
            p.maxHp -= deduct;
            p.hp = Math.min(p.hp, p.maxHp);
            log.push({ text: `🐺 **${p.name}** 仰天長嘯發動【形態轉變】—— 化身為 **【狼人】**（暫時扣除 ${deduct} 點最大生命值，造成傷害全部+20，持續2回合）！（❤️ ${p.hp}/${p.maxHp}）`, type: 'buff' });
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
              // 變身當回合立即觸發一次強化普攻（造成 30 傷害）
              const raw = Math.floor((30 + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
              const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
              monster.hp -= dmg;
              const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
              log.push({ text: `🩸🐾 狼人 **${p.name}** 變身同時觸發【強化普攻】，狂暴利爪重創怪物造成 **${dmg}** 點【物理】傷害！${resNote}`, type: 'combat' });
              visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: true, label: '狼人強化普攻' });
            }
          } else {
            p.druidForm = 'treant';
            p.maxHp += 100;
            p.hp += 100;
            log.push({ text: `🌳 **${p.name}** 紮根於地發動【形態轉變】—— 化身為 **【樹精】**（最大生命與當前生命+100，減傷20%，每回合初自癒5HP，變身期間替全體隊友主動吸收50%受到傷害，持續2回合）！（❤️ ${p.hp}/${p.maxHp}）`, type: 'buff' });
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
          const resCount = (p.equips || []).filter(e => e.id === 'dru_resonance' || e.name === '自然共鳴').length;
          const treantHp = 15 + 5 * resCount;
          const newTreant = {
            id: 'minion_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'treant',
            name: '小樹精',
            hp: treantHp,
            maxHp: treantHp,
            atk: 1
          };
          p.minions.push(newTreant);
          p.minion = p.minions[0];
          log.push({ text: `🌱 **${p.name}** 施展【自然呼喚】，召喚出【小樹精】(HP ${treantHp} / 攻擊 1)！(現有僕從 ${p.minions.length}/3) 每回合自動攻擊並優先替全隊擋下怪物彈射分散傷害！`, type: 'buff' });
          visualEvents.push({ type: 'summon_minion', sourceId: p.id, minionType: 'treant', minionName: '小樹精' });

          // 召喚當回合立即發動攻擊
          if (monster.hp > 0) {
            const raw = Math.floor(newTreant.atk * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🌱🐾 **${newTreant.name}** 登場立即撲向目標攻擊，造成 **${dmg}** 點傷害！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: `${newTreant.name}突擊` });
          }
          break;
        }

        case 'dru_summon_wolf': {
          if (!p.minions) p.minions = [];
          if (p.minions.length >= 3) {
            log.push({ text: `🐺 **${p.name}** 嘗試施展【自然呼喚】，但場上已有 3 隻僕從（已達上限），無法再召喚！`, type: 'warning' });
            break;
          }
          const resCount = (p.equips || []).filter(e => e.id === 'dru_resonance' || e.name === '自然共鳴').length;
          const wolfAtk = 10 + 2 * resCount;
          const newWolf = {
            id: 'minion_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'wolf',
            name: '幼狼',
            hp: 5,
            maxHp: 5,
            atk: wolfAtk
          };
          p.minions.push(newWolf);
          p.minion = p.minions[0];
          log.push({ text: `🐺 **${p.name}** 施展【自然呼喚】，召喚出【幼狼】(HP 5 / 攻擊 ${wolfAtk})！(現有僕從 ${p.minions.length}/3) 每回合自動攻擊並優先替全隊擋下怪物彈射分散傷害！`, type: 'buff' });
          visualEvents.push({ type: 'summon_minion', sourceId: p.id, minionType: 'wolf', minionName: '幼狼' });

          // 召喚當回合立即發動攻擊
          if (monster.hp > 0) {
            const raw = Math.floor(newWolf.atk * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🐺🐾 **${newWolf.name}** 登場撕咬撲襲，造成 **${dmg}** 點傷害！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: `${newWolf.name}突擊` });
          }
          break;
        }
      }

      // 記錄該玩家行動敘述
      narratives.push({
        type: 'player',
        sourceId: p.id,
        name: p.name,
        role: p.role,
        actionId: p.action,
        text: BATTLE_NARRATIVES.getPlayerSkillNarrative(p, p.action, { isCrit: (p.action === 's_stab' && assassinDidCrit) }),
        detail: log[log.length - 1]?.text || ''
      });

      if (monster.hp <= 0) {
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
      const activeSkills = getPlayerSkills(p);

      for (const skill of activeSkills) {
        if (p.action === skill.id) continue;
        if (p.cooldowns[skill.id] > 0) {
          p.cooldowns[skill.id] -= 1;
        }
      }

      if (p.action && p.action !== 'skip') {
        const usedSkill = activeSkills.find(s => s.id === p.action);
        if (usedSkill && usedSkill.cd > 0) {
          if (p.role === 'assassin' && p.action === 's_stab' && assassinDidCrit) {
            p.cooldowns['s_stab'] = 0;
          } else if (p.action === 'w_shield' && p.shieldCrackedThisTurn) {
            p.cooldowns['w_shield'] = usedSkill.cd + 1; // 盾牌龜裂 CD 額外延長 1 回合
            p.shieldCrackedThisTurn = false;
          } else {
            p.cooldowns[usedSkill.id] = usedSkill.cd;
          }
        }
      }

      // 德魯伊變身持續時間處理
      if (p.role === 'druid') {
        if (p.druidFormTurns > 0) {
          p.druidFormTurns -= 1;
          if (p.druidFormTurns === 0 && p.druidForm) {
            if (p.druidForm === 'treant' || p.druidForm === 'tree') {
              p.maxHp -= 100;
              p.hp = Math.min(p.hp, p.maxHp);
            } else if (p.druidForm === 'werewolf' && (p.werewolfMaxHpDeducted || 0) > 0) {
              p.maxHp += p.werewolfMaxHpDeducted;
              p.werewolfMaxHpDeducted = 0;
            }
            const formName = p.druidForm === 'tree' ? '沉睡古樹' : (p.druidForm === 'werewolf' ? '狼人' : '樹精');
            log.push({ text: `🌿 **${p.name}** 的【${formName}】形態結束，解除變身回復正常人身狀態。`, type: 'info' });
            p.druidForm = null;
          }
        }
      }
    }

    // 4.9 檢查德魯伊狼王臣服失敗判定（若其他隊友都死亡或是只有他一人，直接判定挑戰失敗）
    if (this.isWolfSurrenderGameOver) {
      this.isWolfSurrenderGameOver = false;
      narratives.push({
        type: 'monster',
        name: monster.name,
        isUlt: true,
        text: `👑🐺 **${monster.name}** 傲立俯瞰著臣服顫慄的狼人德魯伊，小隊已無任何再戰之力，挑戰以失敗告終！`
      });
      const narrationDuration = Math.max(3, narratives.length * 2.0 + 1.0);
      log.forEach(l => this.addLog(l.text, l.type));
      this.io.to(this.code).emit('battle:visual_events', {
        events: visualEvents,
        narratives: narratives,
        round: this.battleRound,
        monsterKilled: false,
        duration: narrationDuration
      });
      this.broadcastState();
      this.setTimer(Math.ceil(narrationDuration), () => {
        this.handleGameOver();
      });
      return;
    }

    // 5. 判定怪物擊殺與勝負判定
    if (monster.hp <= 0) {
      narratives.push({
        type: 'kill',
        name: monster.name,
        text: `💀 **${monster.name}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！`
      });
      const narrationDuration = Math.max(5, narratives.length * 2.2 + 1.2);
      log.forEach(l => this.addLog(l.text, l.type));
      this.io.to(this.code).emit('battle:visual_events', {
        events: visualEvents,
        narratives: narratives,
        round: this.battleRound,
        monsterKilled: true,
        duration: narrationDuration
      });
      this.broadcastState();

      this.setTimer(Math.ceil(narrationDuration), () => {
        const livingPlayers = Object.values(this.players).filter(p => p.hp > 0);
        if (livingPlayers.length === 0) {
          log.push({ text: `⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**`, type: 'damage' });
          this.handleGameOver();
          return;
        }
        this.handleMonsterVictory(monster, log, visualEvents, true);
      });
      return;
    }

    // 6. 怪物反擊結算
    const isUltTurn = (this.battleRound % 3 === 0);
    const monsterHits = [];
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

      const monsterTemplate = BATTLE_NARRATIVES.monsters[monster.name] || {
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
      const aoeDmgRaw = Math.max(1, Math.floor(effectiveBaseAtk * 0.5));
      const scatterDmgPool = Math.max(1, effectiveBaseAtk - aoeDmgRaw);

      // 僕從優先替全隊擋下怪物的隨機分散/彈射傷害
      let remainingScatter = scatterDmgPool;
      for (const owner of Object.values(this.players)) {
        if (remainingScatter <= 0) break;
        if (owner.minions && owner.minions.length > 0) {
          for (let mi = owner.minions.length - 1; mi >= 0; mi--) {
            if (remainingScatter <= 0) break;
            const m = owner.minions[mi];
            if (m.hp > 0) {
              const absorb = Math.min(m.hp, remainingScatter);
              m.hp -= absorb;
              remainingScatter -= absorb;
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
        // 樹精/古樹形態自帶 20% 減傷
        if (player.druidForm === 'treant' || player.druidForm === 'tree') {
          finalDmg = Math.floor(finalDmg * 0.80);
        }
        return Math.max(1, finalDmg);
      };

      const livingPlayers = Object.values(this.players).filter(p => p.hp > 0);
      const playerRawScatter = {};
      livingPlayers.forEach(p => { playerRawScatter[p.id] = 0; });

      let remainingDmg = remainingScatter;
      while (remainingDmg > 0 && livingPlayers.length > 0) {
        const randomTarget = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
        const stepDmg = Math.min(remainingDmg, Math.floor(Math.random() * 4) + 2);
        playerRawScatter[randomTarget.id] += stepDmg;
        remainingDmg -= stepDmg;
      }

      const treantDruid = Object.values(this.players).find(p => p.hp > 0 && p.druidForm === 'treant');

      for (const p of Object.values(this.players)) {
        if (p.hp <= 0) continue;

        if (p.isStealthed) {
          log.push({ text: `💨 **${p.name}** 處於匿蹤狀態，避開了所有反擊！`, type: 'buff' });
          monsterHits.push({ targetId: p.id, stealthed: true, value: 0 });
          continue;
        }

        let dodgeRate = 0;
        if (p.role === 'archer') {
          if (p.archerNoDodgeTurns > 0) {
            dodgeRate = 0;
          } else {
            const angelBowCount = (p.equips || []).filter(e => e.id === 'a_bow' || e.name === '大天使重弓').length;
            dodgeRate = Math.max(0, CLASSES.archer.dodgeRate - 0.20 * angelBowCount);
          }
        }
        const shadowArmorCount = (p.equips || []).filter(e => e.id === 's_armor' || e.name === '暗影皮甲').length;
        if (shadowArmorCount > 0) {
          dodgeRate += 0.10 * shadowArmorCount;
        }

        if (dodgeRate > 0 && Math.random() < dodgeRate) {
          log.push({ text: `🪶 **${p.name}** 身手矯健，閃避了所有反擊！`, type: 'buff' });
          monsterHits.push({ targetId: p.id, dodged: true, value: 0 });
          continue;
        }

        const totalRawAssigned = aoeDmgRaw + (playerRawScatter[p.id] || 0);
        let totalTakenDmg = calculateDamageToPlayer(p, totalRawAssigned);

        // 樹精替全體隊友主動吸收 50% 受到傷害
        if (treantDruid && treantDruid.id !== p.id && totalTakenDmg > 0 && treantDruid.hp > 0) {
          const absorbedDmg = Math.floor(totalTakenDmg * 0.5);
          totalTakenDmg -= absorbedDmg;
          const treantActualDmg = Math.max(1, Math.floor(absorbedDmg * 0.80)); // 樹精減傷20%
          treantDruid.hp -= treantActualDmg;
          log.push({ text: `🌳 **${treantDruid.name}** (樹精) 伸展藤蔓為 **${p.name}** 承受吸收了 **${absorbedDmg}** 點傷害（減傷20%後實受 **${treantActualDmg}** 點）！（❤️ 樹精剩餘HP: ${treantDruid.hp}/${treantDruid.maxHp}）`, type: 'buff' });
          
          if (treantDruid.hp <= 0) {
            treantDruid.hp = 1;
            treantDruid.druidForm = 'tree';
            treantDruid.druidFormTurns = 1;
            treantDruid.stunnedNextTurn = true;
            log.push({ text: `🪵 **${treantDruid.name}** 因替隊友承受致命傷害，觸發樹精守護！保留 1 點生命並化身為【沉睡古樹】，進入 1 回合休眠狀態（無法行動）！`, type: 'buff' });
            visualEvents.push({ type: 'transform_tree', sourceId: treantDruid.id });
            monsterHits.push({ targetId: treantDruid.id, value: treantActualDmg, isDead: false, shieldMod: shieldDamageMod });
          } else {
            monsterHits.push({ targetId: treantDruid.id, value: treantActualDmg, isDead: false, shieldMod: shieldDamageMod });
          }
        }

        p.hp -= totalTakenDmg;

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
            monsterHits.push({ targetId: p.id, value: totalTakenDmg, isDead: false, shieldMod: shieldDamageMod });
          } else {
            p.hp = 0;
            this.clearPlayerDebuffs(p);
            if (p.druidForm === 'tree') {
              p.maxHp -= 100;
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
            monsterHits.push({ targetId: p.id, value: totalTakenDmg, isDead: true, shieldMod: shieldDamageMod });
          }
        } else {
          log.push({ text: `💢 **${p.name}** 受到 **${totalTakenDmg}** 點傷害（❤️ ${p.hp}/${p.maxHp}）`, type: 'damage' });
          monsterHits.push({ targetId: p.id, value: totalTakenDmg, isDead: false, shieldMod: shieldDamageMod });
        }
      }
    }

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

    // 結算戰士揮砍失衡易傷、弓箭手脫靶失閃、鍊金強酸裝備減半
    for (const pl of Object.values(this.players)) {
      if (pl.alcAcidEquipHalvedTurns > 0) pl.alcAcidEquipHalvedTurns -= 1;
      if (pl.warriorVulnerableTurns > 0) pl.warriorVulnerableTurns -= 1;
      if (pl.warriorVulnerableNextTurn) {
        pl.warriorVulnerableTurns = 1;
        pl.warriorVulnerableNextTurn = false;
      }
      if (pl.archerNoDodgeTurns > 0) pl.archerNoDodgeTurns -= 1;
      if (pl.archerNoDodgeNextTurn) {
        pl.archerNoDodgeTurns = 1;
        pl.archerNoDodgeNextTurn = false;
      }
    }

    visualEvents.push({
      type: 'monster_attack',
      isUlt: isUltTurn,
      ultName: monster.ultName,
      shieldMod: shieldDamageMod,
      hits: monsterHits
    });

    const narrationDuration = Math.max(5, narratives.length * 2.2 + 1.2);
    log.forEach(l => this.addLog(l.text, l.type));
    this.io.to(this.code).emit('battle:visual_events', {
      events: visualEvents,
      narratives: narratives,
      round: this.battleRound,
      monsterKilled: false,
      duration: narrationDuration
    });
    this.broadcastState();

    this.setTimer(Math.ceil(narrationDuration), () => {
      // 檢查全滅（勝負判定：若敵方我方同時血量歸零，優先結算我方血量）
      const remainingLiving = Object.values(this.players).filter(p => p.hp > 0);
      if (remainingLiving.length === 0) {
        if (monster.hp <= 0) {
          log.push({ text: `⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**`, type: 'damage' });
        }
        this.handleGameOver();
        return;
      }

      // 檢查德魯伊狼王臣服失敗判定：若活著的玩家皆處於臣服狀態（其他隊友皆陣亡或僅有臣服德魯伊）
      const canFightLiving = Object.values(this.players).filter(p => p.hp > 0 && !p.isSurrendered);
      if (canFightLiving.length === 0 && (monster.name === '暗影魔狼族長' || monster.name.includes('暗影魔狼族長'))) {
        this.addLog(`👑🐺💀 **【血脈臣服·全隊潰敗】** 隊伍其他成員皆已戰死，生還的德魯伊仍處於狼王臣服無法行動，場上已無人能繼續作戰，冒險直接判定挑戰失敗！`, 'damage');
        this.handleGameOver();
        return;
      }

      if (monster.hp <= 0) {
        this.handleMonsterVictory(monster, log, visualEvents, true);
        return;
      }

      // 準備下一回合
      this.battleRound += 1;
      this.executeTurn();
    });
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
    this.clearTimer();
    this.state = 'GAME_OVER';
    this.gameOverReason = 'wipe';
    this.addLog(`💀 **【挑戰失敗】冒險小隊在深淵第 ${this.floor} 層全體倒下...**`, 'damage');
    this.broadcastState();
  }

  restartToLobby(socketId) {
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能重啟冒險！' };
    this.clearTimer();
    this.state = 'LOBBY';
    this.floor = 1;
    this.battleRound = 1;
    this.currentMonster = null;
    this.currentEvent = null;
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
      p.bonusAtk = 0;
      p.equips = [];
      p.equipCounts = {};
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

  setTimer(seconds, callback) {
    this.clearTimer();
    this.timerCallback = callback;
    this.timerEndsAt = Date.now() + seconds * 1000;
    this.turnTimer = setTimeout(() => {
      this.timerEndsAt = null;
      this.timerCallback = null;
      callback();
    }, seconds * 1000);
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
        this.setTimer(remaining, cb);
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
    if (this.logs.length > 200) this.logs.shift();
  }

  // 取得用於傳給客戶端的身歷其境資料 (隱藏敏感暗選)
  getClientState() {
    let timerRemaining = null;
    if (this.isPaused) {
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
        poisonTurns: this.currentMonster.poisonTurns || 0
      } : null,
      currentEvent: this.currentEvent,
      currentTransition: this.currentTransition,
      currentPrologue: (this.state === 'PROLOGUE') ? STORY_TEXTS.prologue : null,
      isNarrating: this.isNarrating || false,
      currentRoutes: this.currentRoutes || ROUTES.slice(0, 4),
      routeVotes: this.routeVotes || {},
      routeVoteCounts: routeVoteCounts,
      pendingDrop: this.pendingDrop || null,
      floorDifficultyPercent: getFloorDifficultyBonusPercent(this.floor),
      players: Object.values(this.players).map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        customAvatar: p.customAvatar || null,
        hp: p.hp,
        maxHp: p.maxHp,
        bonusAtk: p.bonusAtk,
        equips: (p.equips || []).map(e => ({ id: e.id, name: e.name, type: e.type, desc: e.desc, statDesc: e.statDesc })),
        equipCounts: p.equipCounts || {},
        availableSkills: getPlayerSkills(p),
        votedRouteId: (this.routeVotes && this.routeVotes[p.id]) || null,
        warriorVulnerableTurns: p.warriorVulnerableTurns || 0,
        archerNoDodgeTurns: p.archerNoDodgeTurns || 0,
        alcAcidEquipHalvedTurns: p.alcAcidEquipHalvedTurns || 0,
        werewolfMaxHpDeducted: p.werewolfMaxHpDeducted || 0,
        cooldowns: {
          ...p.cooldowns,
          dru_transform: (p.druidFormTurns || 0)
        },
        isStealthed: p.isStealthed,
        stunnedNextTurn: p.stunnedNextTurn,
        bleedTurns: p.bleedTurns,
        poisonTurns: p.poisonTurns || 0,
        druidForm: p.druidForm || null,
        druidFormTurns: p.druidFormTurns || 0,
        isSurrendered: p.isSurrendered || false,
        minions: (p.minions || []).map(m => ({ id: m.id, type: m.type, name: m.name, hp: m.hp, maxHp: m.maxHp, atk: m.atk })),
        minion: (p.minions && p.minions[0]) ? { ...p.minions[0] } : (p.minion ? { ...p.minion } : null),
        cannotCrit: p.cannotCrit,
        hasActed: p.action !== null, // 只透露是否已下達指令，暗中保密指令內容
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
