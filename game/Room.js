// 遊戲房間管理核心 (Game Room Engine)
// 100% 完整移植 index.js 中的戰鬥演算法、職業技能、裝備、怪物抗性與傷害拆分機制

import { CLASSES, LOOT_TABLE, ENCOUNTERS, ROUTES, getRandomRoutes, equipItemToPlayer } from './constants.js';

export class Room {
  constructor(code, leaderSocket, leaderName, io) {
    this.code = code;
    this.io = io;
    this.leaderId = leaderSocket.id;
    this.memberIds = [leaderSocket.id];
    this.players = {}; // socket.id -> player object
    
    // 遊戲狀態機: 'LOBBY' | 'CHOOSING_ROUTE' | 'EVENT' | 'IN_BATTLE' | 'CHECKPOINT' | 'GAME_OVER' | 'VICTORY'
    this.state = 'LOBBY';
    this.floor = 1;
    this.battleRound = 1;
    this.warriorShieldTurn = 0;
    this.currentMonster = null;
    this.currentEvent = null; // 寶箱或陷阱事件資訊
    this.checkpointChoice = null;
    this.gameOverReason = null; // 'abandon' | 'wipe' | null
    
    this.turnTimer = null;
    this.timerEndsAt = null;
    this.timerCallback = null;
    this.isPaused = false;
    this.pausedRemainingSeconds = null;
    this.logs = [];

    // 加入第一位玩家（隊長）
    this.addPlayer(leaderSocket, leaderName);
  }

  addPlayer(socket, name) {
    if (this.memberIds.length >= 5 && !this.memberIds.includes(socket.id)) {
      return { success: false, message: '房間已滿員（上限 5 人）' };
    }
    if (this.state !== 'LOBBY') {
      return { success: false, message: '遊戲已經開始，無法加入！' };
    }

    if (!this.memberIds.includes(socket.id)) {
      this.memberIds.push(socket.id);
    }

    this.players[socket.id] = {
      id: socket.id,
      name: name || `勇者_${socket.id.slice(0, 4)}`,
      role: null,
      customAvatar: null,
      hp: 100,
      maxHp: 100,
      bonusAtk: 0,
      equipCounts: {},
      cooldowns: {},
      action: null,
      targetPlayerId: null,
      cannotCrit: false,
      isStealthed: false,
      stunnedNextTurn: false,
      bleedTurns: 0,
      bardHealGroupBonus: 0,
      bardHealSingleBonus: 0,
      nextTurnStunFlag: false,
      connected: true
    };

    socket.join(this.code);
    this.addLog(`👋 **${this.players[socket.id].name}** 加入了小隊（當前人數: ${this.memberIds.length}/5）`, 'info');
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
      } else if (trimmed) {
        // emoji 或字串
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

    // 檢查職業是否已被其他人選擇
    const isTaken = Object.values(this.players).some(p => p.id !== socketId && p.role === roleKey);
    if (isTaken) {
      return { success: false, message: `【${CLASSES[roleKey].name}】已被隊友選走！` };
    }

    player.role = roleKey;
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
    this.addLog(`🏰 **隊員全數就緒，地城之門開啟！小隊踏入深淵第 1 層！**`, 'info');
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
    this.currentRoutes = getRandomRoutes(4); // 每次從 6 個選項中隨機抽出 4 個
    this.addLog(`🧭【第 ${this.floor} 層】分歧抉擇：請隊長選擇前進路線！(敵方強度加成：+${Math.round((this.floor - 1) * 5)}%)`, 'info');
    
    // 30 秒自動倒數
    this.setTimer(30, () => {
      if (this.state === 'CHOOSING_ROUTE') {
        this.addLog('⏱️ 隊長猶豫不決，小隊盲目摸黑向前前進！', 'warning');
        this.resolveRouteChoice();
      }
    });

    this.broadcastState();
  }

  selectRoute(socketId, routeId) {
    if (this.state !== 'CHOOSING_ROUTE') return { success: false, message: '目前不是選路階段' };
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長可以決定路線！' };

    this.clearTimer();
    const activeRoutes = this.currentRoutes || ROUTES;
    const route = activeRoutes.find(r => r.id === routeId) || ROUTES.find(r => r.id === routeId) || activeRoutes[0];
    this.addLog(`👣 隊長帶領隊伍走向：**${route.name}**！`, 'info');
    this.resolveRouteChoice();
    return { success: true };
  }

  resolveRouteChoice() {
    const rand = Math.random();
    if (rand < 0.25) {
      this.handleTreasureEvent();
    } else if (rand < 0.5) {
      this.handleTrapEvent();
    } else {
      this.handleBattleEvent();
    }
  }

  // 寶箱事件
  handleTreasureEvent() {
    this.state = 'EVENT';
    const healAmt = 25;
    for (const p of Object.values(this.players)) {
      if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + healAmt);
    }

    const activeRoles = Object.values(this.players).map(p => p.role);
    const eligibleLoots = LOOT_TABLE.filter(l => activeRoles.includes(l.role));
    const drop = eligibleLoots[Math.floor(Math.random() * eligibleLoots.length)];

    let equipOwner = null;
    for (const p of Object.values(this.players)) {
      if (p.role === drop.role) {
        equipOwner = p;
        equipItemToPlayer(p, drop);
        break;
      }
    }

    this.currentEvent = {
      type: 'treasure',
      title: `🎁【第 ${this.floor} 層】發現遠古寶箱！`,
      healAmt: healAmt,
      drop: drop,
      ownerName: equipOwner ? equipOwner.name : '未知'
    };

    this.addLog(`🎁 **幸運降臨！發現遠古寶箱！** 全員回復 ${healAmt} 生命！獲得裝備【${drop.name}】(${drop.desc})，由 **${equipOwner.name}** 裝備！`, 'loot');
    this.broadcastState();

    this.setTimer(4, () => {
      this.advanceToNextFloorOrCheckpoint();
    });
  }

  // 陷阱事件
  handleTrapEvent() {
    this.state = 'EVENT';
    const trapDmg = 18;
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
        trapLogs.push(`💥 **${p.name}** 受到 **${trapDmg}** 點陷阱重創，不幸身亡！💀`);
      } else {
        trapLogs.push(`💢 **${p.name}** 受到 **${trapDmg}** 點陷阱傷害！（❤️ ${p.hp}/${p.maxHp}）`);
      }
    }

    this.currentEvent = {
      type: 'trap',
      title: `⚠️【第 ${this.floor} 層】致命陷阱！`,
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
  handleBattleEvent() {
    const baseMonster = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
    const playerCount = this.memberIds.length;
    const hpPlayerMultiplier = 1 + (playerCount - 1) * 0.25;
    const atkPlayerMultiplier = 1 + (playerCount - 1) * 0.5;
    const floorMultiplier = 1 + (this.floor - 1) * 0.05;

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
      ultName: baseMonster.ultName
    };

    this.battleRound = 1;
    this.warriorShieldTurn = 0;

    for (const p of Object.values(this.players)) {
      p.bleedTurns = 0;
      p.stunnedNextTurn = false;
      p.nextTurnStunFlag = false;
      p.cannotCrit = false;
      p.isStealthed = false;
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

    this.state = 'IN_BATTLE';
    for (const p of Object.values(this.players)) {
      p.action = null;
      p.targetPlayerId = null;
      p.isStealthed = false;
    }

    const isUltTurn = (this.battleRound % 3 === 0);
    if (isUltTurn) {
      this.addLog(`⚠️ **【警告：BOSS 正在蓄力必殺技【${this.currentMonster.ultName}】(1.35倍傷害)！】**`, 'warning');
    }

    // 30 秒回合超時機制
    this.setTimer(30, () => {
      if (this.state === 'IN_BATTLE') {
        this.addLog('⏱️ 回合時間截止，未行動者自動跳過回合！', 'warning');
        for (const p of Object.values(this.players)) {
          if (p.hp > 0 && !p.stunnedNextTurn && !p.action) {
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
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (player.hp <= 0) return { success: false, message: '你已陣亡，無法行動' };
    if (player.stunnedNextTurn) return { success: false, message: '你處於脫力虛脫中，本回合無法行動' };

    if (actionId !== 'skip') {
      const roleConfig = CLASSES[player.role];
      if (actionId === 'b_revive') {
        const deadPlayers = Object.values(this.players).filter(p => p.hp <= 0);
        if (deadPlayers.length === 0) return { success: false, message: '目前場上無倒下的隊友' };
        if (!targetPlayerId || !this.players[targetPlayerId] || this.players[targetPlayerId].hp > 0) {
          return { success: false, message: '請指定有效的陣亡隊友！' };
        }
      } else {
        const skill = roleConfig.skills.find(s => s.id === actionId);
        if (!skill) return { success: false, message: '無效的技能' };
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
      .filter(p => p.hp > 0 && !p.stunnedNextTurn)
      .every(p => p.action !== null);

    if (allDone) {
      this.clearTimer();
      // 稍微延遲 300ms 讓畫面反應用戶的按鈕反饋，然後結算
      setTimeout(() => this.resolveTurnActions(), 300);
    }
  }

  // 100% 完整移植 index.js 的戰鬥結算
  resolveTurnActions() {
    this.clearTimer();
    const monster = this.currentMonster;
    const log = [];
    const visualEvents = [];

    let bardDmgMultiplier = 1.0;
    let bardDmgReduction = 1.0;
    let monsterAttackReduction = 0;
    let assassinDidCrit = false;
    let bardBuffActive = false;

    // 0. 特性觸發：基礎血量 < 100 的怪物在回合開始造成撕裂傷害
    if (monster.baseHp < 100) {
      const bleedDmg = Math.floor(2 * (1 + (this.floor - 1) * 0.05));
      for (const p of Object.values(this.players)) {
        if (p.hp > 0 && p.bleedTurns > 0) {
          p.hp -= bleedDmg;
          p.bleedTurns -= 1;
          visualEvents.push({ type: 'bleed', target: p.id, value: bleedDmg });
          if (p.hp <= 0) {
            p.hp = 0;
            log.push({ text: `🩸 **${p.name}** 傷口惡化承受 **${bleedDmg}** 點撕裂傷害，傷重倒地！💀`, type: 'damage' });
          } else {
            log.push({ text: `🩸 **${p.name}** 傷口持續撕裂，受到 **${bleedDmg}** 點額外傷害！（剩餘流血: ${p.bleedTurns} 回合）`, type: 'damage' });
          }
        }
      }
    }

    // 1. 詩人增傷 50%，受傷降低 25%，使敵方雙抗降至 65%
    for (const p of Object.values(this.players)) {
      if (p.hp > 0 && !p.stunnedNextTurn && p.action === 'b_buff') {
        bardDmgMultiplier = 1.5;
        bardDmgReduction = 0.75;
        bardBuffActive = true;
        visualEvents.push({ type: 'bard_buff', source: p.id });
        log.push({ text: `🪕 **${p.name}** 奏響【狂熱協奏】！全隊本回合造成的傷害提高 50%、承受傷害降低 25%，並削弱怪物抗性至 65%！`, type: 'buff' });
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

    // 2. 玩家行動結算
    for (const p of Object.values(this.players)) {
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
        log.push({ text: `⏳ **${p.name}** (${CLASSES[p.role].name}) 猶豫不決，本回合發呆！`, type: 'warning' });
        continue;
      }

      switch (p.action) {
        case 'basic': {
          const dmgType = (p.role === 'mage' || p.role === 'bard') ? 'mag' : 'phys';
          const raw = Math.floor((10 + p.bonusAtk) * bardDmgMultiplier);
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
          const raw = Math.floor((15 + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
          log.push({ text: `🛡️ **${p.name}** 揮動巨劍斬擊，對怪物造成 **${dmg}** 點【物理】傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '堅定斬擊' });
          break;
        }
        case 'w_shield': {
          this.warriorShieldTurn = 1;
          log.push({ text: `🛡️ **${p.name}** 築起【壁壘守護】！本回合全隊將阻擋 90% 的傷害！`, type: 'buff' });
          visualEvents.push({ type: 'shield_cast', sourceId: p.id, label: '壁壘守護' });
          break;
        }
        case 'm_blast': {
          const raw = Math.floor((40 + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          log.push({ text: `🧙‍♂️ **${p.name}** 引爆【奧術爆破】，轟出 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '奧術爆破' });
          break;
        }
        case 'm_drain': {
          const rawBase = Math.floor(Math.random() * 6) + 15;
          const raw = Math.floor((rawBase + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const healAmt = Math.max(1, Math.round(dmg * 0.2));
          p.hp = Math.min(p.maxHp, p.hp + healAmt);
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          log.push({ text: `🩸 **${p.name}** 施展【生命汲取】，造成 **${dmg}** 點【魔法】傷害${resNote}，並吸取其 20%（恢復了 **${healAmt}** 點生命）！`, type: 'heal' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '生命汲取' });
          visualEvents.push({ type: 'heal', targetId: p.id, value: healAmt, label: '生命汲取' });
          break;
        }
        case 'a_shot': {
          const raw = Math.floor((30 + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️️抗性減免${resistPercent}%)` : '';
          log.push({ text: `🏹 **${p.name}** 射出精準箭矢，造成 **${dmg}** 點【物理】傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '精準狙擊' });
          break;
        }
        case 'a_rain': {
          monsterAttackReduction += 10;
          const raw = Math.floor((20 + p.bonusAtk) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          log.push({ text: `🏹 **${p.name}** 召喚【箭雨壓制】，造成 **${dmg}** 點【魔法】傷害${resNote}並削弱怪物 10 點攻擊！`, type: 'combat' });
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
            isCrit = Math.random() < CLASSES.assassin.critRate;
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
          const groupHealAmt = 20 + (p.bardHealGroupBonus || 0);
          const singleHealAmt = 25 + (p.bardHealSingleBonus || 0);

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
      const roleConfig = CLASSES[p.role];
      if (!roleConfig) continue;

      for (const skill of roleConfig.skills) {
        if (p.action === skill.id) continue;
        if (p.cooldowns[skill.id] > 0) {
          p.cooldowns[skill.id] -= 1;
        }
      }

      if (p.action && p.action !== 'skip') {
        const usedSkill = roleConfig.skills.find(s => s.id === p.action);
        if (usedSkill && usedSkill.cd > 0) {
          if (p.role === 'assassin' && p.action === 's_stab' && assassinDidCrit) {
            p.cooldowns['s_stab'] = 0;
          } else {
            p.cooldowns[usedSkill.id] = usedSkill.cd;
          }
        }
      }
    }

    // 5. 判定怪物擊殺（戰鬥勝利結算：技能 CD 全部刷新歸零）
    if (monster.hp <= 0) {
      monster.hp = 0;
      log.push({ text: `🎉 **${monster.name} 倒下了！小隊成功突破第 ${this.floor} 層！**`, type: 'loot' });
      
      for (const p of Object.values(this.players)) {
        p.stunnedNextTurn = false;
        p.bleedTurns = 0;
        
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

      for (const p of Object.values(this.players)) {
        if (p.hp > 0) {
          p.maxHp += 10;
          p.bonusAtk += 5;
          const healAmt = Math.max(1, Math.round(p.maxHp * 0.2));
          p.hp = Math.min(p.maxHp, p.hp + 10 + healAmt);
          log.push({ text: `💪 **${p.name}** HP上限 +10、攻擊力 +5，並恢復了 ${healAmt} 生命（❤️ ${p.hp}/${p.maxHp}）`, type: 'heal' });
        }
      }

      const activeRoles = Object.values(this.players).map(p => p.role);
      const eligibleLoots = LOOT_TABLE.filter(l => activeRoles.includes(l.role));
      const drop = eligibleLoots[Math.floor(Math.random() * eligibleLoots.length)];

      let equipOwner = null;
      for (const p of Object.values(this.players)) {
        if (p.role === drop.role) {
          equipOwner = p;
          equipItemToPlayer(p, drop);
          break;
        }
      }

      log.push({ text: `🎁 **【戰利品掉落】獲得裝備：【${drop.name}】**（${drop.desc}），由 **${equipOwner ? equipOwner.name : '未知'}** 立即裝備！`, type: 'loot' });

      log.forEach(l => this.addLog(l.text, l.type));
      this.io.to(this.code).emit('battle:visual_events', { events: visualEvents, round: this.battleRound, monsterKilled: true });
      this.broadcastState();

      this.setTimer(4, () => {
        this.advanceToNextFloorOrCheckpoint();
      });
      return;
    }

    // 6. 怪物反擊結算
    const isUltTurn = (this.battleRound % 3 === 0);
    let baseDamageCalc = monster.attack;

    if (isUltTurn) {
      baseDamageCalc = Math.floor(baseDamageCalc * 1.35);
      log.push({ text: `🔥 **${monster.name} 釋放了必殺技【${monster.ultName}】！**`, type: 'warning' });
    } else {
      log.push({ text: `👾 **${monster.name} 發動了反擊！**`, type: 'combat' });
    }

    const effectiveBaseAtk = Math.max(5, baseDamageCalc - monsterAttackReduction);

    const aoeDmgRaw = Math.max(1, Math.floor(effectiveBaseAtk * 0.5));
    const scatterDmgPool = Math.max(1, effectiveBaseAtk - aoeDmgRaw);

    let shieldDamageMod = 1.0;
    if (this.warriorShieldTurn === 1) {
      shieldDamageMod = 0.1;
      log.push({ text: `🛡️ **【壁壘守護】本回合為全隊阻擋了 90% 的衝擊！**`, type: 'buff' });
      this.warriorShieldTurn = 2;
    } else if (this.warriorShieldTurn === 2) {
      shieldDamageMod = 0.6;
      log.push({ text: `🛡️ **【壁壘守護】餘威為全隊阻擋了 40% 的傷害！**`, type: 'buff' });
      this.warriorShieldTurn = 0;
    }

    const calculateDamageToPlayer = (player, rawDamage) => {
      let finalDmg = rawDamage;
      if (player.role === 'assassin') finalDmg = Math.floor(finalDmg * CLASSES.assassin.vulnerableMod);
      if (shieldDamageMod < 1.0) finalDmg = Math.max(1, Math.floor(finalDmg * shieldDamageMod));
      if (bardDmgReduction < 1.0) finalDmg = Math.floor(finalDmg * bardDmgReduction);
      return Math.max(1, finalDmg);
    };

    const livingPlayers = Object.values(this.players).filter(p => p.hp > 0);
    const playerRawScatter = {};
    livingPlayers.forEach(p => { playerRawScatter[p.id] = 0; });

    let remainingDmg = scatterDmgPool;
    while (remainingDmg > 0 && livingPlayers.length > 0) {
      const randomTarget = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
      const stepDmg = Math.min(remainingDmg, Math.floor(Math.random() * 4) + 2);
      playerRawScatter[randomTarget.id] += stepDmg;
      remainingDmg -= stepDmg;
    }

    const monsterHits = [];
    for (const p of Object.values(this.players)) {
      if (p.hp <= 0) continue;

      if (p.isStealthed) {
        log.push({ text: `💨 **${p.name}** 處於匿蹤狀態，避開了所有反擊！`, type: 'buff' });
        monsterHits.push({ targetId: p.id, stealthed: true, value: 0 });
        continue;
      }

      if (p.role === 'archer' && Math.random() < CLASSES.archer.dodgeRate) {
        log.push({ text: `🪶 弓箭手 **${p.name}** 身手矯健，閃避了所有反擊！`, type: 'buff' });
        monsterHits.push({ targetId: p.id, dodged: true, value: 0 });
        continue;
      }

      const totalRawAssigned = aoeDmgRaw + (playerRawScatter[p.id] || 0);
      const totalTakenDmg = calculateDamageToPlayer(p, totalRawAssigned);

      p.hp -= totalTakenDmg;

      if (totalTakenDmg > 0 && monster.baseHp < 100) {
        p.bleedTurns = 2;
      }

      if (p.hp <= 0) {
        p.hp = 0;
        p.bleedTurns = 0;
        log.push({ text: `💥 **${p.name}** 受到 **${totalTakenDmg}** 點傷害，倒地陣亡！💀`, type: 'damage' });
      } else {
        log.push({ text: `💢 **${p.name}** 受到 **${totalTakenDmg}** 點傷害（❤️ ${p.hp}/${p.maxHp}）`, type: 'damage' });
      }
      monsterHits.push({ targetId: p.id, value: totalTakenDmg, isDead: p.hp <= 0, shieldMod: shieldDamageMod });
    }

    visualEvents.push({
      type: 'monster_attack',
      isUlt: isUltTurn,
      ultName: monster.ultName,
      shieldMod: shieldDamageMod,
      hits: monsterHits
    });

    this.battleRound += 1;
    log.forEach(l => this.addLog(l.text, l.type));
    this.io.to(this.code).emit('battle:visual_events', { events: visualEvents, round: this.battleRound, monsterKilled: false });
    this.broadcastState();

    // 檢查全滅
    const remainingLiving = Object.values(this.players).filter(p => p.hp > 0);
    if (remainingLiving.length === 0) {
      this.setTimer(3, () => this.handleGameOver());
      return;
    }

    // 準備下一回合
    this.setTimer(4, () => {
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
    this.gameOverReason = null;

    for (const p of Object.values(this.players)) {
      p.hp = p.role ? CLASSES[p.role].maxHp : 100;
      p.maxHp = p.hp;
      p.bonusAtk = 0;
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
      p.bardHealGroupBonus = 0;
      p.bardHealSingleBonus = 0;
      p.nextTurnStunFlag = false;
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
    this.addLog(`💬 **${player.name}**: ${cleanMsg}`, 'chat');
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

    return {
      code: this.code,
      leaderId: this.leaderId,
      state: this.state,
      floor: this.floor,
      battleRound: this.battleRound,
      warriorShieldTurn: this.warriorShieldTurn,
      isPaused: this.isPaused,
      timerRemaining: timerRemaining,
      gameOverReason: this.gameOverReason,
      currentMonster: this.currentMonster,
      currentEvent: this.currentEvent,
      currentRoutes: this.currentRoutes || ROUTES.slice(0, 4),
      players: Object.values(this.players).map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        customAvatar: p.customAvatar || null,
        hp: p.hp,
        maxHp: p.maxHp,
        bonusAtk: p.bonusAtk,
        equipCounts: p.equipCounts,
        cooldowns: p.cooldowns,
        isStealthed: p.isStealthed,
        stunnedNextTurn: p.stunnedNextTurn,
        bleedTurns: p.bleedTurns,
        cannotCrit: p.cannotCrit,
        hasActed: p.action !== null, // 只透露是否已下達指令，暗中保密指令內容
        connected: p.connected
      })),
      logs: this.logs.slice(-30) // 最近 30 筆日誌
    };
  }

  broadcastState() {
    this.io.to(this.code).emit('room:update', this.getClientState());
  }
}
