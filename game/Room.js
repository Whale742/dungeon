import { metrics, operationContext } from './performance.js';
import { resolveRoleRandom, clearRoleRandom } from './DevRoleRandom.js';
import {SPECIAL_EVENT_COPY} from './special-event-content.js';
import { rollDruidForm, enterBearForm, restoreBearForm } from './druid.js';
import { enemyPresentationInfo, enemyCanParticipate, mechanicState, mechanicStatuses, enemyRoundStart, enemyPlayerRoundTicks, drainEnemyEvents, runEnemyAction, runMimicAmbush, beforePlayerAction, beforeEnemyDamage, redirectEnemyDamage, afterPlayerDamage, onPlayerHealed, enemyEffect } from './enemy-mechanics.js';
import { resolveStats, resolveSkillAttack, skillValue, basicDamageType, mitigateDirectDamage, crossbowAllocations, gladiatorInspirationAttack } from './stats.js';
import { createBossResistances, getBossResistance } from './boss-resistance.js';
import { createRoomContent } from '../studio/content.js';
import { normalizeAvatar } from './avatar.js';
import { consumeEncounter, encounterBattleOptions } from './DevEncounter.js';
import { phase8Methods, p8State, P8_ROLES } from './role-mechanics.js';
import { ASSASSIN_BALANCE, assassinState, getAssassinFollowUpCap, assassinCritRate, isAssassinHidden, addAssassinCritical } from './assassin.js';
// 遊戲房間管理核心 (Game Room Engine)
// 100% 完整移植 index.js 中的戰鬥演算法、職業技能、裝備、怪物抗性與傷害拆分機制

import { SKILL_CATEGORIES, playerStatuses, companionSnapshot, snapshotTarget, buildActionResults, sequenceAugurDamageResults, normalizeCombatQueue } from './combat-schema.js';
import {
  GAME_BALANCE,
  CLASSES,
  LOOT_TABLE,
  ENCOUNTERS,
  EXCLUSIVE_MINIONS,
  GENERAL_MINIONS,
  ABYSS_MINIONS,
  SPECIAL_ELITES,
  ABYSS_BOSSES,
  ABYSS_AUGUR_EASTER_EGG,
  getExclusiveMinionForBoss,
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
  getCrossbowAmmoIcon,
  EQUIP_SLOTS,
  determineEquipSlot,
  TIER1_EQUIPMENTS,
  TIER2_EQUIPMENTS,
  CRAFTING_RECIPES,
  getCraftingRecipe,
  findItemTemplate,
  CONSUMABLES,
  getItemBasePrice,
  LEADER_SKILLS,
  ABYSS_DIALOGUES,
  BASE_GOLD_DROPS,
  getGoldIncomeMultiplier,
  getShopPriceMultiplier,
  calculateBattleGold,
  calculateShopBuyPrice,
  calculateItemSellPrice
} from './constants.js';

export class Room {
  constructor(code, leaderSocket, leaderName, io, leaderAvatar = null) {
    this.code = code;
    this.studioContent = createRoomContent();
    this.io = io;
    this.leaderId = leaderSocket.id;
    this.memberIds = [leaderSocket.id];
    this.stageRoster = null;
    this.stageRosterPending = false;
    this.players = {}; // socket.id -> player object
    
    // 遊戲狀態機: 'LOBBY' | 'PROLOGUE' | 'CHOOSING_ROUTE' | 'TRANSITION' | 'EVENT' | 'IN_BATTLE' | 'CHECKPOINT' | 'GAME_OVER' | 'VICTORY'
    this.state = 'LOBBY';
    this.selectionState = 'SELECTING'; // 'ROUND_START' | 'SELECTING' | 'RESOLVING'
    this.floor = 1;
    this.battleCount = 0; // 戰鬥次數計數器
    this.battlesInCurrentCycle = 0; // 每5層保底戰鬥計數器
    this.battleRound = 1;
    this.warriorShieldTurn = 0;
    this.alcVulnerableTurns = 0;
    this.alcVulnerableNextTurn = false;
    this.enemies = [];
    this._currentMonster = null;
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

    // Module 1: 六角蜂巢迷霧地圖系統 (10 層，向上下逐漸延展至最高 7 層，中央為 row = 3)
    this.leaderScoutBonus = 0;
    this.scoutedCols = new Set();
    this.currentHex = { col: 0, row: 3 };
    this.hexMap = this.generateHexMap();

    // Module 3 & 4: 雙層背包、經濟與事件系統
    this.gold = 0;
    this.squadInventory = [];

    // Module 6: 隊長技鎖定與繼承
    this.lockedLeaderId = leaderSocket.id;
    this.lockedLeaderRole = null;
    this.pendingLeaderTransfer = false;
    this.leaderSkillUsedThisBattle = false;
    this.warriorLeaderGuarded = false;
    this.assassinLeaderFlawApplied = false;
    this.samuraiLeaderCounterPursuitDone = false;
    this.sageLeaderRetried = false;
    this.druidLeaderShieldGiven = false;
    this.bardPriorityActive = false;

    // Module 5: 深淵遭遇系統
    this.abyssState = null;
    this.abyssFlashRedEye = false;
    this.hasTriggeredAbyss = false;

    // 加入第一位玩家（隊長）
    this.addPlayer(leaderSocket, leaderName, leaderAvatar);
  }

  getValidRowsForCol(col) {
    const c = Math.max(0, Math.min(9, Number(col) || 0));
    const halfSpan = Math.min(c, 3); // 1 → 3 → 5 → 7，末段維持七格，透過橫向偏移形成 >。
    const rows = [];
    for (let r = 3 - halfSpan; r <= 3 + halfSpan; r++) {
      rows.push(r);
    }
    return rows;
  }

  generateHexMap(options = {}) {
    const rng = typeof options.rng === 'function' ? options.rng : (typeof options.random === 'function' ? options.random : Math.random);
    const scoutableCols = new Set([3, 6, 8]);
    const columns = [];

    for (let col = 0; col <= 9; col++) {
      if (col === 9) {
        const routeTmpl = ROUTES[0];
        const finalColumn = this.getValidRowsForCol(col).map(row => ({
          id: `hex_9_${row}`, col: 9, row, type: 'BATTLE', routeId: routeTmpl.id,
          name: routeTmpl.name, desc: routeTmpl.desc, icon: routeTmpl.icon,
          isRevealed: false, isVisited: false, isScouted: false, isWeakened: false
        }));
        finalColumn[3] = {
            id: 'hex_9_3',
            col: 9,
            row: 3,
            type: 'END_ELITE',
            routeId: routeTmpl.id,
            name: '深淵終點・王座決戰',
            desc: '收斂於深淵最深處的最終試煉，必定遭遇 1 精英怪 + 2 小怪！',
            icon: '👑',
            isRevealed: false,
            isVisited: false,
            isScouted: false,
            isWeakened: false
          };
        columns.push(finalColumn);
        continue;
      }

      if (col === 0) {
        columns.push([
          {
            id: 'hex_0_3',
            col: 0,
            row: 3,
            type: 'START',
            routeId: ROUTES[0].id,
            name: '遠征起點',
            desc: '冒險小隊踏入深淵迷宮的起始據點。',
            icon: '⛵',
            isRevealed: false,
            isVisited: true,
            isScouted: false,
            isWeakened: false
          }
        ]);
        continue;
      }

      // col 1 ~ 8: 向上下逐漸遞增延展至最高 7 層，末段不收窄。
      const validRows = this.getValidRowsForCol(col);
      const rowTypes = {};

      if (scoutableCols.has(col)) {
        // 確保可偵測層 (col = 3, 6, 8) 必定包含至少 1 格 SHOP、1 格 CHEST 與 1 格 BATTLE
        const pool = validRows.slice();
        const shopRow = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        const chestRow = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        const battleRow = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        rowTypes[shopRow] = 'SHOP';
        rowTypes[chestRow] = 'CHEST';
        rowTypes[battleRow] = 'BATTLE';
        for (const r of pool) {
          const roll = rng();
          rowTypes[r] = roll < 0.45 ? 'BATTLE' : roll < 0.65 ? 'CHEST' : roll < 0.80 ? 'SHOP' : 'EVENT';
        }
      } else {
        const guaranteedBattleRow = validRows[Math.floor(rng() * validRows.length)];
        for (const r of validRows) {
          if (r === guaranteedBattleRow) {
            rowTypes[r] = 'BATTLE';
          } else {
            const roll = rng();
            rowTypes[r] = roll < 0.45 ? 'BATTLE' : roll < 0.65 ? 'CHEST' : roll < 0.80 ? 'SHOP' : 'EVENT';
          }
        }
      }

      const colNodes = [];
      for (const row of validRows) {
        const routeTmpl = ROUTES[(col * 7 + row) % ROUTES.length];
        const nodeType = rowTypes[row];
        colNodes.push({
          id: `hex_${col}_${row}`,
          col,
          row,
          type: nodeType,
          routeId: routeTmpl.id,
          name: routeTmpl.name,
          desc: routeTmpl.desc,
          icon: routeTmpl.icon,
          isRevealed: false,
          isVisited: false,
          isScouted: false,
          isWeakened: nodeType === 'BATTLE' && rng() < 0.25,
          isShadyMerchant: nodeType === 'SHOP' && rng() < 0.25,
          isMimic: nodeType === 'CHEST' && rng() < 0.30
        });
      }
      columns.push(colNodes);
    }

    this.hexMap = columns;
    this.currentHex = { col: 0, row: 3 };
    this.scoutedCols = new Set();
    return columns;
  }

  getHexNode(col, row) {
    if (!Array.isArray(this.hexMap) || col < 0 || col >= this.hexMap.length) return null;
    return (this.hexMap[col] || []).find(n => n.row === row) || null;
  }

  getHexNodeById(hexId) {
    if (!hexId || !Array.isArray(this.hexMap)) return null;
    for (const colNodes of this.hexMap) {
      const found = (colNodes || []).find(n => n.id === hexId);
      if (found) return found;
    }
    return null;
  }

  // 計算任意節點在蜂巢網格上的視覺橫向座標 (Visual X)
  getNodeVisualX(node) {
    if (!node) return 0;
    const rowDist = Math.abs(node.row - 3);
    const rowPadding = rowDist * 0.5;
    let rowNodes = [];
    if (Array.isArray(this.hexMap)) {
      for (const c of this.hexMap) {
        const found = (c || []).find(n => n.row === node.row);
        if (found) rowNodes.push(found);
      }
    }
    const k = rowNodes.findIndex(n => n.id === node.id || (n.col === node.col && n.row === node.row));
    return rowPadding + (k >= 0 ? k : 0);
  }

  // 六角形單向向右移動規則：只要是相鄰在目前節點附近的右方節點皆可選擇，左方不可選擇
  getAdjacentNextHexes(col = this.currentHex?.col ?? 0, row = this.currentHex?.row ?? 3) {
    if (!Array.isArray(this.hexMap)) return [];
    const currentNode = this.getHexNode(col, row) || { id: `hex_${col}_${row}`, col, row };
    const currentVx = this.getNodeVisualX(currentNode);
    const adjacentNodes = [];

    // 檢查相鄰範圍內的右方節點（包括右平移、右上、右下）
    for (let c = col; c <= Math.min(9, col + 2); c++) {
      for (const node of (this.hexMap[c] || [])) {
        if (!node || node.id === currentNode.id || node.isVisited) continue;
        const vx = this.getNodeVisualX(node);
        const dx = Math.round((vx - currentVx) * 10) / 10;
        const dy = node.row - currentNode.row;

        // 判定嚴格右側相鄰：
        // 1. 直向右側相鄰：dy === 0, dx === 1.0
        // 2. 右上方相鄰：dy === -1, dx === 0.5
        // 3. 右下方相鄰：dy === 1, dx === 0.5
        if ((dy === 0 && Math.abs(dx - 1.0) < 0.15) ||
            (dy === -1 && Math.abs(dx - 0.5) < 0.15) ||
            (dy === 1 && Math.abs(dx - 0.5) < 0.15)) {
          adjacentNodes.push(node);
        }
      }
    }
    if (adjacentNodes.length > 0) return adjacentNodes;

    // 保底備用邏輯：若特殊情況未匹配到，取 col + 1 中行差最小的相鄰節點
    const nextCol = Number(col) + 1;
    const candidateRows = [row - 1, row, row + 1];
    const directNeighbors = candidateRows.map(r => this.getHexNode(nextCol, r)).filter(Boolean);
    if (directNeighbors.length > 0) return directNeighbors;
    const colNodes = this.hexMap[nextCol] || [];
    if (!colNodes.length) return [];
    const sorted = colNodes.slice().sort((a, b) => Math.abs(a.row - row) - Math.abs(b.row - row));
    const minDiff = Math.abs(sorted[0].row - row);
    return colNodes.filter(n => Math.abs(n.row - row) <= minDiff + 1);
  }

  // 戰爭迷霧預先偵測機制：每推進特定層數 (預設 col = 3, 6, 8) 進行 40% 機率判定
  tryScoutColumn(targetCol, options = {}) {
    const scoutableCols = [3, 6, 8];
    if (!options.forceCol && !scoutableCols.includes(targetCol)) {
      return { triggered: false, scoutedNodes: [] };
    }
    if (!this.scoutedCols) this.scoutedCols = new Set();
    if (!options.forceReRoll && this.scoutedCols.has(targetCol)) {
      return { triggered: false, alreadyChecked: true, scoutedNodes: [] };
    }
    this.scoutedCols.add(targetCol);

    const rng = typeof options.rng === 'function' ? options.rng : (typeof options.random === 'function' ? options.random : Math.random);
    const baseChance = typeof options.chance === 'number' ? options.chance : 0.40;
    const archerBonus = (this.getEffectiveLeaderRole() === 'archer') ? 0.35 : 0;
    const chance = Math.max(0, Math.min(1, baseChance + (this.leaderScoutBonus || 0) + archerBonus));
    const roll = rng();

    if (roll < chance) {
      const colNodes = this.hexMap?.[targetCol] || [];
      const scoutedNodes = [];
      for (const node of colNodes) {
        if (node.type === 'SHOP' || node.type === 'CHEST') {
          node.isScouted = true;
          scoutedNodes.push(node);
        }
      }
      if (scoutedNodes.length > 0) {
        this.addLog(`🔭 【迷霧預先偵測】斥候在前方第 ${targetCol} 層迷霧中偵測到了微光，提前標記出該層的【商店／寶箱】位置！`, 'info');
      }
      return { triggered: true, roll, chance, scoutedNodes };
    }
    return { triggered: false, roll, chance, scoutedNodes: [] };
  }

  getClientHexMap() {
    if (!Array.isArray(this.hexMap)) return [];
    const selectableIds = new Set(
      this.state === 'CHOOSING_ROUTE'
        ? (this.currentRoutes || []).map(r => r.hexId || r.id)
        : []
    );
    const currentCol = this.currentHex?.col ?? 0;
    const currentRow = this.currentHex?.row ?? 3;
    return this.hexMap.map(colNodes =>
      (colNodes || []).map(node => {
        const isCurrent = Boolean(this.currentHex && this.currentHex.col === node.col && this.currentHex.row === node.row);
        const isStartNode = node.col === 0 && node.row === 3;
        const colDelta = node.col - currentCol;
        const rowDelta = Math.abs(node.row - currentRow);
        const inVision = Boolean(
          node.isVisited ||
          node.isRevealed ||
          node.isScouted ||
          isCurrent ||
          selectableIds.has(node.id) ||
          (colDelta >= 1 && colDelta <= 2 && ((node.type === 'END_ELITE' && colDelta === 1) || rowDelta <= colDelta))
        );
        const visibleType = (node.isRevealed || node.isScouted)
          ? node.type
          : isStartNode
            ? 'START'
            : node.type === 'END_ELITE'
              ? 'END_ELITE'
              : 'UNKNOWN';
        const visibleIcon = (node.isRevealed || node.isScouted)
          ? (node.type === 'SHOP' ? '🛒' : node.type === 'CHEST' ? '📦' : node.type === 'EVENT' ? '🎪' : node.type === 'END_ELITE' ? '👑' : node.type === 'START' ? '🏕️' : node.icon || '⚔️')
          : isStartNode
            ? '🏕️'
            : node.type === 'END_ELITE'
              ? '👑'
              : '🌫️';
        return {
          id: node.id,
          col: node.col,
          row: node.row,
          type: visibleType,
          routeId: node.routeId,
          name: node.isRevealed
            ? node.name
            : node.isScouted && node.type === 'SHOP'
              ? `【偵測：商店】${node.name}`
              : node.isScouted && node.type === 'CHEST'
                ? `【偵測：寶箱】${node.name}`
                : node.isScouted && node.type === 'EVENT'
                  ? `【情報：隨機事件】${node.name}`
                  : node.type === 'END_ELITE'
                    ? node.name
                    : node.name,
          routeName: node.name,
          desc: node.isRevealed
            ? node.desc
            : node.isScouted && node.type === 'SHOP'
              ? '斥候提前偵測到商隊蹤跡'
              : node.isScouted && node.type === 'CHEST'
                ? '斥候提前偵測到寶箱輪廓（未揭露是否為寶箱怪）'
                : node.isScouted && node.type === 'EVENT'
                  ? '流浪商人提供之情報據點（隨機事件）'
                  : '籠罩於深淵戰爭迷霧中的未知節點',
          icon: visibleIcon,
          isRevealed: Boolean(node.isRevealed),
          isVisited: Boolean(node.isVisited),
          isScouted: Boolean(node.isScouted),
          isKnownMimic: Boolean((this.getEffectiveLeaderRole() === 'archer' && node.isMimic && (node.isScouted || node.isRevealed)) || (this.getEffectiveLeaderRole() === 'augur' && node.isMimic)),
          isKnownShady: Boolean(this.getEffectiveLeaderRole() === 'augur' && node.isShadyMerchant),
          inVision,
          isCurrent,
          isSelectable: selectableIds.has(node.id),
          voteCount: this.routeVotes ? Object.values(this.routeVotes).filter(v => v === node.id).length : 0
        };
      })
    );
  }

  get currentMonster() {
    return this._currentMonster;
  }

  set currentMonster(val) {
    this._currentMonster = val;
    if (!val) {
      this.enemies = [];
      return;
    }
    if (!val.instanceId) {
      val.instanceId = val.id || 'enemy_0';
    }
    if (!val.tier) {
      val.tier = 'ELITE';
    }
    if (!Array.isArray(this.enemies) || !this.enemies.includes(val)) {
      this.enemies = [val];
    }
  }

  setEnemies(enemiesList = []) {
    this.enemies = Array.isArray(enemiesList) ? enemiesList.map((e, idx) => {
      if (!e.instanceId) e.instanceId = `enemy_${idx}`;
      if (!e.tier) e.tier = 'ELITE';
      return e;
    }) : [];
    this._currentMonster = this.getPrimaryEnemy();
    return this.enemies;
  }

  getLivingEnemies() {
    return (this.enemies || []).filter(e => e && e.hp > 0);
  }

  // Selection and delayed damage share the same legal battlefield population.
  // Keep getLivingEnemies for victory checks, including temporarily immune units.
  getAttackableEnemies(actor = null) {
    const arena = this.arena || this.enemyArena;
    if (arena && actor && arena.playerId !== actor.id) return [];
    return this.getLivingEnemies().filter(enemy => !enemy.untargetableThisRound &&
      (!arena || enemy.instanceId === arena.enemyId));
  }

  getPrimaryEnemy() {
    const arena=this.arena || this.enemyArena;
    if(arena?.enemyId){const locked=this.enemies?.find(e=>e.instanceId===arena.enemyId);if(locked)return locked;}
    const living = this.getLivingEnemies();
    if (living.length > 0) {
      const elite = living.find(e => e.tier === 'ELITE' || e.tier === 'ABYSS');
      return elite || living[0];
    }
    return this.enemies?.[0] || this._currentMonster || null;
  }

  getTargetEnemy(targetEnemyId = null) {
    const living = this.getLivingEnemies();
    if (living.length === 0) return null;
    const arena=this.arena || this.enemyArena;
    if(arena?.enemyId)return living.find(e=>e.instanceId===arena.enemyId)||null;
    if (targetEnemyId && targetEnemyId !== 'monster') {
      const found = living.find(e => e.instanceId === targetEnemyId || e.id === targetEnemyId);
      if (found) return found;
    }
    if (this._currentMonster && this._currentMonster.hp > 0 && living.includes(this._currentMonster)) {
      return this._currentMonster;
    }
    return this.getPrimaryEnemy();
  }

  refreshPrimaryMonster() {
    this._currentMonster = this.getPrimaryEnemy();
    return this._currentMonster;
  }

  formatEnemySnapshot(enemy) {
    if (!enemy) return null;
    return {
      instanceId: enemy.instanceId || enemy.id || 'enemy_0',
      id: enemy.id || enemy.instanceId || 'enemy_0',
      tier: enemy.tier || 'ELITE',
      kind: enemy.kind || null,
      role: enemy.role || null,
      hp: Math.max(0, enemy.hp),
      maxHp: enemy.maxHp,
      tempHp: enemy.tempHp || 0,
      attack: enemy.attack,
      name: enemy.name,
      originalName: enemy.originalName || enemy.name,
      avatar: enemy.avatar,
      ...(enemy.battleAvatar ? { battleAvatar: enemy.battleAvatar } : {}),
      ...(enemy.battleFormAvatars ? { battleFormAvatars: enemy.battleFormAvatars } : {}),
      desc: enemy.desc || '',
      ultName: enemy.ultName || '猛烈反擊',
      resistances: {
        physical: getBossResistance(enemy, 'physical'),
        magic: getBossResistance(enemy, 'magic'),
        effect: getBossResistance(enemy, 'effect')
      },
      augurResistanceBreak: enemy.augurResistanceBreak || 0,
      reversedOmenRemaining: enemy.reversedOmenRemaining || 0,
      reversedOmenBonus: enemy.reversedOmenBonus || 0,
      flawMarks: enemy.flawMarks || 0,
      talismans: [...(enemy.talismans || [])],
      permanentTalismans: [...(enemy.permanentTalismans || [])],
      presentation: enemyPresentationInfo(enemy, this),
      mechanics: structuredClone(enemy.mechanics || mechanicState(enemy)),
      statuses: [
        ...mechanicStatuses(enemy, this),
        ...p8State(enemy, this).phase8Statuses,
        ...((enemy.stunnedThisRound || enemy.stunnedNextTurn || (enemy === this.currentMonster && this.monsterStunnedThisRound)) ? [{ id: 'stun', label: '暈眩', icon: 'stun', turns: 1, isNegative: true, category: 'DEBUFF' }] : []),
        ...(enemy.flawMarks && enemy.flawMarks > 0 ? [{ id: 'flaw_mark', label: `破綻印記 (${enemy.flawMarks})`, icon: 'flaw_mark', stacks: enemy.flawMarks, isNegative: true, category: 'DEBUFF', desc: `受傷增加 ${enemy.flawMarks * 10}%，受到攻擊命中率提高 ${enemy.flawMarks * 10}%，效果命中降低 ${enemy.flawMarks * 10}%` }] : []),
        ...(enemy.bleedTurns ? [{ id: 'bleed', label: '流血', icon: 'bleed', turns: enemy.bleedTurns, ...(enemy.bleedDmg > 0 ? { damage: enemy.bleedDmg } : {}), isNegative: true, category: 'DEBUFF', isDot: true }] : []),
        ...(enemy.poisonTurns ? [{ id: 'poison', label: '中毒', icon: 'poison', turns: enemy.poisonTurns, ...(enemy.poisonDmg > 0 ? { damage: enemy.poisonDmg } : {}), isNegative: true, category: 'DEBUFF', isDot: true }] : []),
        ...(enemy.burnTurns ? [{ id: 'burn', label: '燃燒', icon: 'burn', turns: enemy.burnTurns, ...(enemy.burnDmg > 0 ? { damage: enemy.burnDmg } : {}), isNegative: true, category: 'DEBUFF', isDot: true }] : []),
        ...(enemy.fractureTurns ? [{ id: 'fracture', label: '骨折', icon: 'fracture', turns: enemy.fractureTurns, ...(enemy.fractureDmg > 0 ? { damage: enemy.fractureDmg } : {}), isNegative: true, category: 'DEBUFF', isDot: true }] : []),
        ...(enemy.chillTurns ? [{ id: 'chill', label: 'CHILL', icon: '寒冷', turns: enemy.chillTurns, ...(enemy.chillDmg > 0 ? { damage: enemy.chillDmg } : {}), isNegative: true, category: 'DEBUFF', isDot: true }] : []),
        ...(enemy.corrosionTurns ? [{ id: 'corrosion', label: '腐蝕', icon: 'corrosion', turns: enemy.corrosionTurns, isNegative: true, category: 'DEBUFF' }] : []),
        ...(this.roundModifiers?.monsterAttackReduction ? [{ id: 'attack_down', label: 'ATK DOWN', icon: 'debuff', turns: 1, value: this.roundModifiers.monsterAttackReduction }] : []),
        ...(enemy.talismans && enemy.talismans.length > 0 ? [
          { id: 'talismans', label: `符咒 (${enemy.talismans.length})`, icon: 'debuff', stacks: enemy.talismans.length, isNegative: true, category: 'DEBUFF' },
          ...(enemy.talismans.includes('blind') ? [{ id: 'talisman_blind', label: '障目符', icon: 'debuff', isNegative: true, category: 'DEBUFF', stacks: enemy.talismans.filter(t => t === 'blind').length }] : []),
          ...(enemy.talismans.includes('seal') ? [{ id: 'talisman_seal', label: '封勁符', icon: 'debuff', isNegative: true, category: 'DEBUFF', stacks: enemy.talismans.filter(t => t === 'seal').length }] : []),
          ...(enemy.talismans.includes('corrode') ? [{ id: 'talisman_corrode', label: '蝕體符', icon: 'debuff', isNegative: true, category: 'DEBUFF', stacks: enemy.talismans.filter(t => t === 'corrode').length }] : []),
          ...(enemy.talismans.includes('confuse') ? [{ id: 'talisman_confuse', label: '惑心符', icon: 'debuff', isNegative: true, category: 'DEBUFF', stacks: enemy.talismans.filter(t => t === 'confuse').length }] : []),
          ...(enemy.talismans.includes('drain') ? [{ id: 'talisman_drain', label: '抽髓符', icon: 'debuff', isNegative: true, category: 'DEBUFF', stacks: enemy.talismans.filter(t => t === 'drain').length }] : [])
        ] : [])
      ]
    };
  }

  createEnemyInstance(baseTemplate, index = 0, options = {}) {
    const isWeakened = Boolean(options.isWeakened);
    const playerCount = this.getStagePlayerCount();
    const hpPlayerMultiplier = 1 + (playerCount - 1) * 1.0;
    const atkPlayerMultiplier = 1 + (playerCount - 1) * 0.5;
    const floorMultiplier = getFloorDifficultyMultiplier(this.floor);
    const minAtk = (options.tier === 'MINION' || baseTemplate.tier === 'MINION') ? 3 : 5;

    let scaledHp = Math.max(1, Math.floor(baseTemplate.hp * hpPlayerMultiplier * floorMultiplier));
    let scaledAtk = Math.max(minAtk, Math.floor(baseTemplate.attack * atkPlayerMultiplier * floorMultiplier));

    if (isWeakened) {
      scaledHp = Math.max(1, Math.floor(scaledHp * 0.75));
      scaledAtk = Math.max(minAtk, Math.floor(scaledAtk * 0.75));
    }

    const routeId = this.currentTransition?.routeId || 'route_trail';
    const bossStory = this.studioContent.getRouteBossStory(routeId, baseTemplate.name);
    const weakenedSuffix = isWeakened ? '（⚠️ 遠處傳來粗重的喘息聲，該敵人在先前的戰鬥中遭受重創，處於負傷狀態！）' : '';
    const encounterStory = (baseTemplate.encounterStory || bossStory) + weakenedSuffix;
    const resolvedTier = options.tier || baseTemplate.tier || 'ELITE';
    const rolledRes = createBossResistances(baseTemplate, this.floor, options.rng);
    if (resolvedTier === 'MINION') {
      for (const t of ['physical', 'magic', 'effect']) {
        if (rolledRes.resistances) rolledRes.resistances[t] = Math.min(30, rolledRes.resistances[t]);
        if (rolledRes.bonusResistances) rolledRes.bonusResistances[t] = Math.min(30, rolledRes.bonusResistances[t]);
      }
    }
    if (baseTemplate.isShadyMerchant || baseTemplate.noBonusResistance) {
      rolledRes.resistances = { physical: 0, magic: 0, effect: 0 };
      rolledRes.baseResistances = { physical: 0, magic: 0, effect: 0 };
      rolledRes.bonusResistances = { physical: 0, magic: 0, effect: 0 };
    }

    return {
      instanceId: options.instanceId || `enemy_${index}`,
      id: baseTemplate.id || `enemy_${index}`,
      tier: resolvedTier,
      kind: baseTemplate.kind || null,
      role: baseTemplate.role || null,
      bossName: baseTemplate.bossName || null,
      name: isWeakened ? `【負傷】${baseTemplate.name}` : baseTemplate.name,
      originalName: baseTemplate.name,
      routeId,
      encounterStory,
      isWeakened,
      isShadyMerchant: Boolean(baseTemplate.isShadyMerchant),
      isMimic: Boolean(baseTemplate.isMimic),
      avatar: baseTemplate.avatar,
      ...(baseTemplate.battleAvatar ? { battleAvatar: baseTemplate.battleAvatar } : {}),
      ...(baseTemplate.battleFormAvatars ? { battleFormAvatars: baseTemplate.battleFormAvatars } : {}),
      desc: isWeakened ? `${baseTemplate.desc} (⚠️ 負傷)` : baseTemplate.desc,
      attack: scaledAtk,
      hp: scaledHp,
      maxHp: scaledHp,
      tempHp: 0,
      baseHp: baseTemplate.hp,
      ...rolledRes,
      noBonusResistance: Boolean(baseTemplate.noBonusResistance),
      ultName: baseTemplate.ultName || '猛烈反擊',
      ultDesc: baseTemplate.ultDesc || '',
      basicName: baseTemplate.basicName || '普通攻擊',
      basicDesc: baseTemplate.basicDesc || '',
      passiveName: baseTemplate.passiveName || '',
      passiveDesc: baseTemplate.passiveDesc || '',
      scriptDamageScale: atkPlayerMultiplier * floorMultiplier * (isWeakened ? 0.75 : 1),
      mechanics: mechanicState(baseTemplate),
      script: baseTemplate.script ? structuredClone(baseTemplate.script) : null,
      passive: baseTemplate.passive ? structuredClone(baseTemplate.passive) : null,
      ult: baseTemplate.ult ? structuredClone(baseTemplate.ult) : null,
      poisonTurns: 0,
      poisonDmg: 0,
      burnTurns: 0,
      burnDmg: 0,
      fractureTurns: 0,
      fractureDmg: 0,
      chillTurns: 0,
      chillDmg: 0,
      corrosionTurns: 0,
      corrosionMaxHpDeducted: 0,
      talismans: []
    };
  }

  getUnpickedAbyssBossPool() {
    const activeRoles = new Set(Object.values(this.players).map(p => p.role).filter(Boolean));
    return Object.values(ABYSS_BOSSES).filter(b => b.role !== 'augur' && !activeRoles.has(b.role));
  }

  buildEncounterFormation(col = 1, options = {}) {
    const rng = typeof options.rng === 'function' ? options.rng : (typeof options.random === 'function' ? options.random : Math.random);
    const isWeakened = Boolean(options.isWeakened);
    const pickRandom = (arr) => arr[Math.floor(rng() * arr.length)];
    const clampedCol = Math.max(1, Math.min(9, Number(col) || 1));
    const resolvedAbyssBoss = options.abyssBoss || (options.forceAbyss ? pickRandom(this.getUnpickedAbyssBossPool()) : null);

    // Special override: explicit elite (e.g. shady_merchant, treasure_mimic, or specific abyssBoss)
    if (options.specialElite) {
      return [this.createEnemyInstance(options.specialElite, 0, { isWeakened, tier: options.specialElite.tier || 'ELITE', rng })];
    }

    // Backward-compatible encounter option also resolves to the single chest elite.
    if (options.isMimicAmbush) {
      return [this.createEnemyInstance(SPECIAL_ELITES.treasure_mimic, 0, {isWeakened, tier:'ELITE', rng})];
    }

    // col 1 ~ 3: 100% 遭遇 2~3 隻「泛用雜兵」
    if (clampedCol >= 1 && clampedCol <= 3) {
      const count = options.minionCount || (2 + (rng() < 0.5 ? 0 : 1));
      const list = [];
      for (let i = 0; i < count; i++) {
        const tmpl = pickRandom(GENERAL_MINIONS);
        list.push(this.createEnemyInstance(tmpl, i, { isWeakened, tier: 'MINION', rng }));
      }
      return list;
    }

    // col 4 ~ 6: 70% 遭遇「2 泛用雜兵 + 1 隨機專屬小怪」；30% 遭遇「單體巡邏精英怪」或觸發「深淵遭遇戰」
    if (clampedCol >= 4 && clampedCol <= 6) {
      const roll = typeof options.formationRoll === 'number' ? options.formationRoll : rng();
      if (roll < 0.70 && !options.forceElite && !resolvedAbyssBoss) {
        const g1 = pickRandom(GENERAL_MINIONS);
        const g2 = pickRandom(GENERAL_MINIONS);
        const ex = pickRandom(EXCLUSIVE_MINIONS);
        return [
          this.createEnemyInstance(g1, 0, { isWeakened, tier: 'MINION', rng }),
          this.createEnemyInstance(g2, 1, { isWeakened, tier: 'MINION', rng }),
          this.createEnemyInstance(ex, 2, { isWeakened, tier: 'MINION', rng })
        ];
      }
      if (resolvedAbyssBoss) {
        return [
          this.createEnemyInstance(resolvedAbyssBoss, 0, { isWeakened, tier: 'ABYSS', rng })
        ];
      }
      const elite = options.eliteTemplate || pickRandom(ENCOUNTERS);
      return [this.createEnemyInstance(elite, 0, { isWeakened, tier: 'ELITE', rng })];
    }

    // col 7 ~ 8: 50% 遭遇「2 專屬小怪 + 1 泛用雜兵」；50% 遭遇「1 精英怪 + 1 專屬小怪」
    if (clampedCol >= 7 && clampedCol <= 8) {
      const roll = typeof options.formationRoll === 'number' ? options.formationRoll : rng();
      if (roll < 0.50 && !options.forceElite) {
        const ex1 = pickRandom(EXCLUSIVE_MINIONS);
        const ex2 = pickRandom(EXCLUSIVE_MINIONS);
        const g1 = pickRandom(GENERAL_MINIONS);
        return [
          this.createEnemyInstance(ex1, 0, { isWeakened, tier: 'MINION', rng }),
          this.createEnemyInstance(ex2, 1, { isWeakened, tier: 'MINION', rng }),
          this.createEnemyInstance(g1, 2, { isWeakened, tier: 'MINION', rng })
        ];
      }
      const elite = options.eliteTemplate || pickRandom(ENCOUNTERS);
      const pairedMinion = getExclusiveMinionForBoss(elite.name) || pickRandom(EXCLUSIVE_MINIONS);
      return [
        this.createEnemyInstance(elite, 0, { isWeakened, tier: 'ELITE', rng }),
        this.createEnemyInstance(pairedMinion, 1, { isWeakened, tier: 'MINION', rng })
      ];
    }

    // col 9（終點）：固定遭遇「1 精英怪 + 2 小怪」
    if (resolvedAbyssBoss) {
      const m1 = ABYSS_MINIONS[0] || pickRandom(EXCLUSIVE_MINIONS);
      const m2 = ABYSS_MINIONS[1] || ABYSS_MINIONS[0] || pickRandom(EXCLUSIVE_MINIONS);
      return [
        this.createEnemyInstance(resolvedAbyssBoss, 0, { isWeakened, tier: 'ABYSS', rng }),
        this.createEnemyInstance(m1, 1, { isWeakened, tier: 'MINION', rng }),
        this.createEnemyInstance(m2, 2, { isWeakened, tier: 'MINION', rng })
      ];
    }
    const elite = options.eliteTemplate || pickRandom(ENCOUNTERS);
    const pairedMinion = getExclusiveMinionForBoss(elite.name) || pickRandom(EXCLUSIVE_MINIONS);
    return [
      this.createEnemyInstance(elite, 0, { isWeakened, tier: 'ELITE', rng }),
      this.createEnemyInstance(pairedMinion, 1, { isWeakened, tier: 'MINION', rng }),
      this.createEnemyInstance(pairedMinion, 2, { isWeakened, tier: 'MINION', rng })
    ];
  }

  clearPlayerDebuffs(player) {
    if (!player) return;
    if(player.hp<=0&&player.druidForm==='bear'){restoreBearForm(player);player.druidForm=null;player.druidFormTurns=0;}
    player.enemyEffects={};
    player.bleedTurns = 0;
    player.poisonTurns = 0;
    player.poisonDmg = 0;
    player.burnTurns = 0;
    player.burnDmg = 0;
    player.fractureTurns = 0;
    player.fractureDmg = 0;
    player.chillTurns = 0;
    player.chillDmg = 0;
    player.corrosionTurns = 0;
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
    player.tempHp = 0;player.temporaryOverheal=0;player.p8Shields=[];
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

    this.players[socket.id] = this.createPlayer(socket.id, name, avatar);
    socket.join(this.code);
    this.addLog(`👋 **${this.players[socket.id].name}** 加入了小隊（當前人數: ${this.memberIds.length}/10）`, 'info');
    this.broadcastState();
    return { success: true };
  }

  createPlayer(id, name, avatar = null) {
    const cleanAvatar = normalizeAvatar(avatar, this.studioContent.snapshot);
    return {
      id,
      name: name || `勇者_${id.slice(0, 4)}`,
      role: null,
      customAvatar: cleanAvatar,
      hp: 100,
      maxHp: 100,
      tempHp: 0,
      isLocked: false,
      bonusAtk: 0,
      victoryAtkBonus: 0,
      paladinGrace: null,
      paladinGloryTrackedDamage: 0,
      paladinGloryCastedRound: 0,
      sageX: 30,
      sageDebt: 0,
      equips: [], // 上限 3 件裝備陣列（相容同步）
      equipSlots: { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null }, // 4 個裝備欄位
      bag: [], // 4 格備用欄 (私人背包)
      bonusDef: 0,
      regenPerRound: 0,
      battleStartShield: 0,
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
      burnTurns: 0,
      burnDmg: 0,
      fractureTurns: 0,
      fractureDmg: 0,
      chillTurns: 0,
      chillDmg: 0,
      corrosionTurns: 0,
      druidForm: null,
      druidFormTurns: 0,
      druidRegenBonus: 0,
      werewolfMaxHpDeducted: 0,
      bearMaxHpAdded: 0,
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
  }

  removePlayer(socketId) {
    const player = this.players[socketId];
    if (!player) return;

    // 當如果有人有穿裝備退出戰鬥時(刷新或是關閉視窗)，他身上所穿的裝備會跑到小隊背包
    if (this.state !== 'LOBBY') {
      const recoveredItems = [];
      if (player.equipSlots) {
        for (const [k, eq] of Object.entries(player.equipSlots)) {
          if (eq) recoveredItems.push(eq);
        }
      }
      if (Array.isArray(player.equips)) {
        for (const eq of player.equips) {
          if (eq && !recoveredItems.some(it => it.id === eq.id || it.name === eq.name)) {
            recoveredItems.push(eq);
          }
        }
      }
      if (Array.isArray(player.bag)) {
        for (const item of player.bag) {
          if (item) recoveredItems.push(item);
        }
      }
      if (recoveredItems.length > 0) {
        if (!Array.isArray(this.squadInventory)) this.squadInventory = [];
        for (const item of recoveredItems) {
          const index = this.findEmptyInventorySlot(this.squadInventory, 19);
          if (index !== -1) this.squadInventory[index] = item;
          else {
            if (!Array.isArray(this.overflowItems)) this.overflowItems = [];
            this.overflowItems.push(item);
          }
        }
        const itemNames = recoveredItems.map(it => `【${it.name}】`).join('、');
        this.addLog(`🎒 【裝備回收】**${player.name}** 離線，其身上的裝備與物資（${itemNames}）已移交至小隊背包，超出容量的物品存入溢出暫存區！`, 'loot');
      }

      // 若在商店事件中離線，從已準備名單中移除，並檢查剩餘連線玩家是否全數準備完畢
      if (this.state === 'EVENT' && this.currentEvent?.type === 'shop' && Array.isArray(this.currentEvent.readyToLeave)) {
        this.currentEvent.readyToLeave = this.currentEvent.readyToLeave.filter(id => id !== socketId);
        const remainingConnected = Object.values(this.players).filter(p => p.id !== socketId && p.connected !== false);
        if (remainingConnected.length > 0 && remainingConnected.every(p => this.currentEvent.readyToLeave.includes(p.id))) {
          const wasPrepShop = Boolean(this.currentEvent.isPrepShop);
          this.currentEvent.buybackPool = [];
          this.currentEvent = null;
          if (this.io && this.code) {
            this.emitPublic('event:shop_closed');
          }
          if (wasPrepShop) this.startRouteSelection();
          else this.advanceToNextFloorOrCheckpoint();
        }
      }
    }

    delete this.players[socketId];
    this.memberIds = this.memberIds.filter(id => id !== socketId);

    // 若隊長離開，轉移隊長至第一順位
    if (this.leaderId === socketId) {
      if (this.memberIds.length > 0) {
        this.leaderId = this.memberIds[0];
        if (this.players[this.leaderId]) {
          this.players[this.leaderId].isReady = false;
          this.addLog(`👑 **${this.players[this.leaderId].name}** 成為了新隊長！`, 'info');
          if (this.state !== 'LOBBY') {
            this.pendingLeaderTransfer = true;
            this.addLog(`⏳ 【隊長技交接】新隊長 **${this.players[this.leaderId].name}** 將在下一場戰鬥開始時繼承隊長技！`, 'info');
          }
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
        } else if (['treasure', 'chest'].includes(this.currentEvent?.type)) {
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

    if (typeof avatar === 'string' && avatar.trim().startsWith('data:image/') && avatar.trim().length > 350000) {
      return { success: false, message: '圖片檔案過大，請選擇較小的圖片！' };
    }
    const cleanAvatar = normalizeAvatar(avatar, this.studioContent.snapshot);

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
    if (Object.values(this.players).some(p => p.id !== socketId && p.role === roleKey)) {
      return { success: false, message: '此職業已由隊友選擇，請選擇其他職業！' };
    }

    this.initializeRole(player, roleKey);
    this.addLog(`**${player.name}** 選擇了職業：**${CLASSES[roleKey].name}**`, 'role');
    this.broadcastState();
    return { success: true };
  }

  initializeRole(player, roleKey) {
    player.role = roleKey;
    player.equips = [];
    player.equipSlots = { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null };
    player.bag = [];
    player.bonusDef = 0;
    player.regenPerRound = 0;
    player.battleStartShield = 0;
    player.equipCounts = {};
    player.bonusAtk = 0; player.statsVersion=2;
    player.victoryAtkBonus = 0;
    player.hp = CLASSES[roleKey].maxHp;
    player.maxHp = CLASSES[roleKey].maxHp;
    player.tempHp = 0;
    player.isLocked = false;
    
    const initialCooldowns = {};
    CLASSES[roleKey].skills.forEach(s => { initialCooldowns[s.id] = 0; });
    player.cooldowns = initialCooldowns;
    Object.assign(player,{p8Effects:{},p8Shields:[],temporaryOverheal:0,p8TeamHp:0,p8DisabledHp:0,p8CorrodedHp:0,warriorStacks:0,rage:0,gladiatorInspiration:[],gladiatorChallenge:null,inspirationRound:0,rageRoundNumber:0,rageRoundGain:false,gladiatorChallengeGain:false,bloodStacks:0,soul:0,paladinGrace:null,paladinGloryTrackedDamage:0,paladinGloryCastedRound:0,sageX:30,sageDebt:0,sageOperand:0,sagePhase:'hypothesis',sageCycleRound:0,sageInduction:false,sageSamplingEnded:true,sageEquationResolved:false,sageSolvedThisRound:false,sagePrimeResetPending:false});
    delete player.sagePreviousAction;delete player.sageLastAction;delete player.sageDebtScheduledRound;
    player.stealthStacks=roleKey==='assassin'?1:0;
    delete player.noReviveFloor;
    this.p8RefreshEquipment();

    player.isReady = false;
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

    if (this.state !== 'LOBBY') {
      this.pendingLeaderTransfer = true;
      this.addLog(`⏳ 【隊長技交接】新隊長 **${targetName}** 將在下一場戰鬥開始時繼承隊長技！`, 'info');
    }

    this.broadcastState();
    this.spectators?.notify();
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

    this.persistence?.begin(this);
    this.floor = 1;
    this.battleCount = 0;
    this.battlesInCurrentCycle = 0;
    this.hexMap = this.generateHexMap();
    this.currentHex = { col: 0, row: 3 };
    this.scoutedCols = new Set();
    const playerCount = Math.max(1, Object.keys(this.players).length);
    this.gold = playerCount * 45;
    this.hasCompletedPrep = false;
    if (options.skipPrepShop) this.skipPrepShop = true;
    this.squadInventory = [];
    this.lockedLeaderId = this.leaderId;
    this.lockedLeaderRole = this.players[this.leaderId]?.role;
    this.pendingLeaderTransfer = false;
    this.leaderSkillUsedThisBattle = false;
    const lSkill = this.getEffectiveLeaderSkill();
    if (lSkill) {
      const roleName = CLASSES[this.lockedLeaderRole]?.name || this.lockedLeaderRole;
      this.addLog(`👑 【隊長技啟動】隊長 **${this.players[this.leaderId]?.name}**（${roleName}）的隊長技【${lSkill.name}】已就緒！`, 'info');
    }
    this.addLog(`🪙 【出發備戰】冒險小隊獲得出發物資資金 ${this.gold} 金幣（每位成員 45 金幣）！`, 'loot');
    for (const p of Object.values(this.players)) {
      p.hasDealtFirstBattleCrit = false;
      if(p.role==='sage'){p.sageX=30;p.sageDebt=0;delete p.sageDebtScheduledRound;}
    }
    this.state = 'PROLOGUE';
    this.career?.attach(this);
    this.addLog(`📜 **${this.studioContent.storyTexts.prologue.title}**`, 'info');
    this.studioContent.storyTexts.prologue.paragraphs.forEach(p => this.addLog(p, 'info'));

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

  startPreDeparturePrep() {
    this.clearTimer();
    this.hasCompletedPrep = true;
    this.handleShopEvent({
      id: 'prep_shop',
      isPrepShop: true,
      col: 1,
      isShadyMerchant: false,
      noExclusive: true
    });
  }

  skipPrologue(socketId) {
    if (this.state !== 'PROLOGUE') return { success: false, message: '目前不是開場階段' };
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能跳過開場' };
    this.addLog(`⏩ **${this.players[socketId]?.name || '隊長'}** 跳過了開場故事！`, 'info');
    if (this.io && this.code) {
      this.emitPublic('prologue:skipped', { leaderId: socketId });
    }
    this.clearTimer();
    this.pendingPresentationAcks.clear();
    if (this.hasCompletedPrep || this.skipPrepShop) {
      this.startRouteSelection();
    } else {
      this.startPreDeparturePrep();
    }
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
      this.emitPublic('narrative:accelerated', this.narrativeControl);
    }
    return { success: true, ...this.narrativeControl };
  }

  finishPrologueIfReady() {
    if (this.state !== 'PROLOGUE' || this.pendingPresentationAcks.size > 0) return;
    if (Object.values(this.players).some(p => p.connected)) {
      if (this.hasCompletedPrep || this.skipPrepShop) {
        this.startRouteSelection();
      } else {
        this.startPreDeparturePrep();
      }
    }
  }

  startRouteSelection(options = {}) {
    if (this.persistence?.executionStopped(this)) return;
    if (this.adventureId && this.state === 'CHOOSING_ROUTE' && this.checkpoint?.boundaryFloor === this.floor) return;
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
    this.stageRoster = null; this.stageRosterPending = true;
    this.currentEvent = null;
    this.currentTransition = null;
    this.routeVotes = {}; // 重置全體投票記錄

    if (!Array.isArray(this.hexMap) || !this.hexMap.length || this.getHexNode(this.currentHex?.col, this.currentHex?.row)?.type === 'END_ELITE') {
      this.generateHexMap();
    }
    const nextCol = Math.min(9, (this.currentHex?.col ?? 0) + 1);
    if ([3, 6, 8].includes(nextCol)) {
      this.tryScoutColumn(nextCol);
    }
    const adjHexes = this.getAdjacentNextHexes(this.currentHex?.col ?? 0, this.currentHex?.row ?? 3);
    if (this.stargazerBoundaryScoutedNext) {
      for (const hex of adjHexes) {
        hex.isRevealed = true;
      }
      this.addLog('🌌 【界外星圖】觀星者隊長勘破宇宙邊界！次回合路線中的三條路事件全數洞悉揭曉！', 'buff');
      this.stargazerBoundaryScoutedNext = false;
    }
    this.currentRoutes = adjHexes.length > 0 ? adjHexes.map(hex => ({
      id: hex.id,
      hexId: hex.id,
      routeId: hex.routeId,
      col: hex.col,
      row: hex.row,
      name: (() => {
        if (this.getEffectiveLeaderRole() === 'augur') {
          if (hex.type === 'CHEST') return hex.isMimic ? `【洞悉：寶箱怪！】${hex.name}` : `【洞悉：真寶箱】${hex.name}`;
          if (hex.type === 'SHOP') return hex.isShadyMerchant ? `【洞悉：黑市奸商！】${hex.name}` : `【洞悉：誠信商隊】${hex.name}`;
        }
        return hex.isRevealed
          ? hex.name
          : hex.isScouted && hex.type === 'SHOP'
            ? `【偵測：商店】${hex.name}`
            : hex.isScouted && hex.type === 'CHEST'
              ? `【偵測：寶箱】${hex.name}`
              : hex.name;
      })(),
      desc: hex.isRevealed
        ? hex.desc
        : hex.isScouted && hex.type === 'SHOP'
          ? '斥候於迷霧中偵測到商隊蹤跡'
          : hex.isScouted && hex.type === 'CHEST'
            ? '斥候於迷霧中偵測到寶箱輪廓（未揭露是否為寶箱怪）'
            : hex.type === 'END_ELITE'
              ? hex.desc
              : '籠罩在戰爭迷霧中的未知節點，踏入後才揭露事件。',
      icon: hex.isRevealed
        ? hex.icon
        : hex.isScouted && hex.type === 'SHOP'
          ? '🛒'
          : hex.isScouted && hex.type === 'CHEST'
            ? '📦'
            : hex.type === 'END_ELITE'
              ? '👑'
              : '🌫️',
      isRevealed: Boolean(hex.isRevealed),
      isScouted: Boolean(hex.isScouted),
      visibleType: hex.isRevealed
        ? hex.type
        : hex.isScouted && (hex.type === 'SHOP' || hex.type === 'CHEST')
          ? hex.type
          : hex.type === 'END_ELITE'
            ? 'END_ELITE'
            : 'UNKNOWN'
    })) : getRandomRoutes(4);

    this.routePresentationId += 1;
    if (options.skipIntro) {
      this.isNarrating = false;
      this.pendingPresentationAcks.clear();
      this.addLog(`🧭 路線選項已就緒，請全員共同投票決定前進方向！`, 'info');
    } else {
      this.isNarrating = true;
      this.pendingPresentationAcks = new Set(
        Object.values(this.players).filter(p => p.connected).map(p => p.id)
      );
      this.addLog(`🧭【第 ${this.floor} 層・迷霧分歧點】正在探索前路迷霧...`, 'info');
    }
    this.settleInventoryOverflow();
    this.career?.floor(this);
    if (this.checkpoint) this.checkpoint.boundaryFloor = this.floor;
    if (!this.spectators?.beginCheckpoint()) this.finalizeRouteCheckpoint();
    this.broadcastState();

    // No fixed-duration fallback may consume an unfinished player's choice time.
  }

  lockStageRoster() {
    if (this.stageRoster) return this.stageRoster.count > 0;
    const ids = this.memberIds.filter(id => {
      const p = this.players[id];
      const admitting = this.spectators?.requests.get(id)?.status === 'saving' && this.spectators.members.has(id);
      return p && (p.connected || admitting) && p.hp > 0 && (CLASSES[p.role] || !this.adventureId);
    });
    if (!ids.length) return false;
    this.stageRoster = Object.freeze({ playerIds: Object.freeze(ids), count: ids.length,
      floor: this.floor, routePresentationId: this.routePresentationId });
    this.stageRosterPending = false;
    return true;
  }

  finalizeRouteCheckpoint() {
    if (this.spectators?.waiting && !this.spectators.committing) return;
    if (!this.lockStageRoster()) {
      if (this.checkpoint) Object.assign(this.checkpoint, { status: 'waiting_players', message: '沒有合法在線參戰者，等待正式玩家重新連線後建立檢查點。' });
      if (!this.isPaused) { this.togglePause(this.leaderId); this.identityOfflinePause = true; }
      this.broadcastState(); return;
    }
    void this.persistence?.saveBoundary(this);
  }

  getStagePlayerCount() {
    // Direct Dev/test encounters also lock once. Formal play must lock at the
    // route boundary, never at enemy generation or reconnection.
    if (!this.stageRoster && !this.adventureId) this.lockStageRoster();
    if (!this.stageRoster?.count) throw new Error('本路線尚未鎖定參戰名單');
    return this.stageRoster.count;
  }

  isStageParticipant(id) {
    return this.memberIds.includes(id) && (this.stageRoster ? this.stageRoster.playerIds.includes(id) : !this.adventureId);
  }

  getCombatPlayers() { return Object.values(this.players).filter(p => this.isStageParticipant(p.id)); }
  getEffectPlayers() { return this.state === 'IN_BATTLE' ? this.getCombatPlayers() : Object.values(this.players); }

  // 用戶端路線氛圍敘述文字演出完畢、選項進場可互動回調 (P2-R1.1 Section 5)
  handleRouteNarrativeDone(socketId, presentationId) {
    if (this.state !== 'CHOOSING_ROUTE' || !this.isNarrating) return;
    if (presentationId !== this.routePresentationId || !this.players[socketId]?.connected) return;
    this.pendingPresentationAcks.delete(socketId);
    this.finishRoutePresentationIfReady();
  }

  finishRoutePresentationIfReady() {
    if (this.state !== 'CHOOSING_ROUTE' || !this.isNarrating || this.pendingPresentationAcks.size) return;
    if (this.persistence?.blocked(this) || this.spectators?.waiting) return;
    if (!Object.values(this.players).some(p => p.connected)) return;
    this.isNarrating = false;
    this.addLog(`🧭 路線選項已就緒，請全員共同投票決定前進方向！`, 'info');
    this.broadcastState();
  }

  voteRoute(socketId, routeId) {
    if (this.state !== 'CHOOSING_ROUTE') return { success: false, message: '目前非路線投票階段' };
    if (this.persistence?.blocked(this) || this.spectators?.waiting) return { success: false, message: '檢查點尚未安全保存，暫時無法投票' };
    if (this.isNarrating || this.isPaused) return { success: false, message: '路線演出尚未完成或遊戲暫停中' };
    const player = this.players[socketId];
    if (!player?.connected) return { success: false, message: '玩家不存在或已斷線' };
    if (player.hp <= 0) return { success: false, message: '已陣亡玩家無法參與投票' };

    const activeRoutes = this.currentRoutes || ROUTES;
    const targetRoute = activeRoutes.find(r => r.id === routeId || r.hexId === routeId);
    if (!targetRoute) return { success: false, message: '無效的路線選項（僅能向右側相鄰的六角格移動）' };

    this.routeVotes[socketId] = targetRoute.id;
    this.broadcastState();

    this.checkRouteVoteCompletion();
    return { success: true };
  }

  checkRouteVoteCompletion() {
    if (this.persistence?.blocked(this)) return;
    if (this.state !== 'CHOOSING_ROUTE' || this.isNarrating || this.isPaused) return;
    const allConnectedVoted = () => {
      const voters = Object.values(this.players).filter(p => p.hp > 0 && p.connected);
      return voters.length > 0 && voters.every(p => Boolean(this.routeVotes[p.id]));
    };
    if (!allConnectedVoted()) return;
    const presentationId = this.routePresentationId;
    this.clearTimer();
    setTimeout(() => {
      if (this.state === 'CHOOSING_ROUTE' && this.routePresentationId === presentationId &&
          !this.isNarrating && !this.isPaused && allConnectedVoted()) this.tallyRouteVotes();
    }, 500);
  }

  tallyRouteVotes() {
    if (this.persistence?.blocked(this)) return;
    this.clearTimer();
    if (this.state !== 'CHOOSING_ROUTE' || this.isNarrating || this.isPaused) return;

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
      this.addLog(`🧭 全員棄票！由系統隨機指引前進路線：【${chosenRoute.name}】！`, 'warning');
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

  roleRandom(p,key,fallback) { return resolveRoleRandom(this,p,key,fallback); }

  statMultiplier(p) { return p.corrosionTurns>0 ? .5 : (this.roundModifiers?.equipmentEffectMultiplier ?? 1); }
  skillValue(p,key,options={}) { return skillValue(p,key,{equipmentMultiplier:this.statMultiplier(p),...options}); }
  resolveSkillAttack(p,damageType) { return resolveSkillAttack({actor:p,damageType,equipmentMultiplier:this.statMultiplier(p)}); }
  getAssassinBonusAtk(p) { return this.resolveSkillAttack(p,'phys') - 16; }

  resolveAssassinFollowUps(ally, queue, log, bardMultiplier, resistance) {
    if(this.arena || this.enemyArena)return;
    if (this.currentMonster.hp <= 0) return;
    for (const p of Object.values(this.players)) {
      if (p.id === ally.id || !p.connected || !isAssassinHidden(p) || p.stunnedNextTurn || p.nextTurnStunFlag ||
          (p.followUpsThisRound || 0) >= getAssassinFollowUpCap(p) || this.currentMonster.hp <= 0) continue;
      if(this.roleRandom(p,'follow_up',()=>Math.random()<ASSASSIN_BALANCE.followUpChance?'success':'failure')!=='success')continue;
      const before = this.getHpSnapshot();
      const augurReactionIndex = this.augurReactions?.length || 0;
      const isGuaranteedCrit = (this.battleCount === 1 && this.battleRound === 1 && !p.hasDealtFirstBattleCrit && !p.cannotCrit);
      const critical = isGuaranteedCrit || (this.roleRandom(p,'follow_up_crit',()=>this.intervenePositive(p,'追擊・暴擊',ASSASSIN_BALANCE.followUpCritChance * 100).success?'success':'failure')==='success');
      if (critical) {
        p.hasDealtFirstBattleCrit = true;
      }
      const raw = Math.floor((this.skillValue(p,'basic')) *
        (critical ? ASSASSIN_BALANCE.criticalMultiplier : 1) * bardMultiplier);
      const { dmg } = resistance(raw, 'phys', {actor:p, kind:'follow_up'});
      const actual = Math.min(this.currentMonster.hp, dmg);
      this.currentMonster.hp = Math.max(0, this.currentMonster.hp - dmg);
      p.followUpsThisRound = (p.followUpsThisRound || 0) + 1;
      const gainedStacks = critical && actual > 0 ? addAssassinCritical(p) : 0;
      log.push({ text: `**${p.name}** 自暗影中發動追擊${critical ? '・暴擊' : ''}，造成 **${actual}** 點傷害。`, type: 'combat' });
      if (gainedStacks) log.push({ text: `**${p.name}** 觸發暴擊，獲得 ${gainedStacks} 層【匿蹤】。`, type: 'buff' });
      const after = this.getHpSnapshot();
      queue.push({ type: 'follow_up_action', category: 'FOLLOW_UP', sourceId: p.id, sourceRole: 'assassin',
        augurReactions:(this.augurReactions || []).slice(augurReactionIndex),
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
    const equipMult = (pl.corrosionTurns > 0) ? 0.5 : (this.roundModifiers?.equipmentEffectMultiplier ?? 1.0);
    const resourceAtk=(pl.warriorStacks||0)+gladiatorInspirationAttack(pl);
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

  // 取得德魯伊夥伴計算用的有效總攻擊力 (druidTotalAtk)
  // Base ATK (10) + Effective Equipment ATK + Current Form Modifier (-5 樹精, +20 狼人)
  getDruidEffectiveAttack(druid) { return this.resolveSkillAttack(druid,'phys'); }

  // 兼容舊介面與舊事件
  selectRoute(socketId, routeId) {
    return this.voteRoute(socketId, routeId);
  }

  decayDebuffsOnParty() {
    for (const p of Object.values(this.players)) {
      if (p.poisonTurns > 0) {
        p.poisonTurns -= 1;
        if (p.poisonTurns === 0) p.poisonDmg = 0;
      }
      if (p.burnTurns > 0) {
        p.burnTurns -= 1;
        if (p.burnTurns === 0) p.burnDmg = 0;
      }
      if (p.bleedTurns > 0) {
        p.bleedTurns -= 1;
        if (p.bleedTurns === 0) p.bleedDmg = 0;
      }
      if (p.fractureTurns > 0) p.fractureTurns -= 1;
      if (p.chillTurns > 0) p.chillTurns -= 1;
      if (p.corrosionTurns > 0) p.corrosionTurns -= 1;
      if (p.alcAcidEquipHalvedTurns > 0) p.alcAcidEquipHalvedTurns -= 1;
    }
  }

  resolveRouteChoice(route) {
    const devEncounter = this.isDev ? consumeEncounter(this, route) : null;
    this.decayDebuffsOnParty();
    let hexNode = this.getHexNodeById(route?.hexId || route?.id);
    let outcomeType = 'battle';
    let isWeakenedBoss = false;

    if (hexNode) {
      this.currentHex = { col: hexNode.col, row: hexNode.row };
      hexNode.isRevealed = true;
      hexNode.isVisited = true;
      if (hexNode.col > 0 && hexNode.col % 3 === 0 && this.getEffectiveLeaderRole() === 'stargazer') {
        const targetCol = hexNode.col + 1;
        if (targetCol <= 9 && Array.isArray(this.hexMap?.[targetCol])) {
          for (const n of this.hexMap[targetCol]) {
            n.isRevealed = true;
            n.isScouted = true;
          }
          this.addLog(`🔭🌟 【星軌先見】觀星者隊長觀測星象，完全揭露了前方第 ${targetCol} 層的所有真實事件！`, 'buff');
        }
      }
      if (hexNode.type === 'END_ELITE') {
        outcomeType = 'battle';
        isWeakenedBoss = false;
      } else if (hexNode.type === 'BATTLE') {
        outcomeType = 'battle';
        isWeakenedBoss = Boolean(hexNode.isWeakened);
      } else if (hexNode.type === 'SHOP') {
        outcomeType = 'shop';
      } else if (hexNode.type === 'CHEST') {
        outcomeType = 'chest';
      } else if (hexNode.type === 'EVENT') {
        outcomeType = 'random_event';
      }
    } else {
      const floorInCycle = ((this.floor - 1) % 5) + 1; // 1 ~ 5
      const floorsRemainingInCycle = 5 - floorInCycle + 1; // 5 ~ 1
      const battlesNeeded = Math.max(0, 2 - (this.battlesInCurrentCycle || 0));

      if (battlesNeeded >= floorsRemainingInCycle) {
        // 每5層保底至少2次戰鬥事件觸發（50% 一般BOSS，50% 負傷BOSS）
        outcomeType = 'battle';
        isWeakenedBoss = Math.random() < 0.5;
      } else {
        const rand = Math.random();
        if (rand < 0.25) {
          outcomeType = 'battle';
          isWeakenedBoss = false;
        } else if (rand < 0.50) {
          outcomeType = 'battle';
          isWeakenedBoss = true;
        } else if (rand < 0.75) {
          outcomeType = 'treasure';
        } else {
          outcomeType = 'trap';
        }
      }
    }

    if (devEncounter) {
      outcomeType = ['battle', 'elite'].includes(devEncounter.type) ? 'battle'
        : ['shop', 'black_market'].includes(devEncounter.type) ? 'shop'
        : ['chest', 'mimic_chest'].includes(devEncounter.type) ? 'chest' : 'random_event';
      isWeakenedBoss = devEncounter.weakened;
      hexNode = { ...hexNode, isShadyMerchant: devEncounter.type === 'black_market', isMimic: devEncounter.type === 'mimic_chest' };
    }

    if (outcomeType === 'battle') {
      this.battlesInCurrentCycle = (this.battlesInCurrentCycle || 0) + 1;
    }

    const storyKey = route?.routeId || hexNode?.routeId || route?.id || 'route_trail';
    const routeData = this.studioContent.routeStories[storyKey] || this.studioContent.routeStories['route_trail'];
    let outcomeData = routeData[outcomeType] || routeData['battle'];

    if (isWeakenedBoss) {
      outcomeData = {
        title: (outcomeData.title || `【${route.name}・魔物遭遇】`).replace('⚔️', '🥀⚔️') + ' (負傷BOSS)',
        story: outcomeData.story + this.studioContent.text('event.bossWeakened','（⚠️ 遠處傳來粗重的喘息聲，該BOSS在先前的戰鬥中遭受重創，處於負傷狀態！）')
      };
    }

    const routeDisplayName = hexNode ? hexNode.name : route.name;
    const routeDisplayIcon = hexNode ? hexNode.icon : route.icon;

    this.state = 'TRANSITION';
    this.currentTransition = {
      floor: this.floor,
      title: `【前進路線・${routeDisplayName}】`,
      routeId: storyKey,
      hexId: hexNode?.id || route?.id,
      routeName: routeDisplayName,
      routeIcon: routeDisplayIcon,
      outcomeType: isWeakenedBoss ? 'battle_weakened' : outcomeType,
      isWeakenedBoss: isWeakenedBoss,
      storyTitle: `【路線結算・${routeDisplayName}】`,
      storyText: this.studioContent.text('event.routeTransition',`小隊踏入【${routeDisplayName}】，正向第 ${this.floor} 層深處探索前行……`,{route:routeDisplayName,floor:this.floor})
    };

    this.addLog(`🧭 小隊決定前進：【${routeDisplayName}】`, 'info');
    this.broadcastState();

    // 路線結算轉場（持續 2 秒），隨後正式展開事件或戰鬥 (Node 10 -> Node 11/12/13/14)
    this.setTimer(2, () => {
      if (this.state === 'TRANSITION') {
        if (outcomeType === 'shop') {
          this.handleShopEvent(hexNode);
        } else if (outcomeType === 'chest') {
          this.handleChestEvent(hexNode);
        } else if (outcomeType === 'random_event') {
          this.handleRandomEvent(hexNode, devEncounter?.type);
        } else if (outcomeType === 'treasure') {
          this.handleTreasureEvent(outcomeData);
        } else if (outcomeType === 'trap') {
          this.handleTrapEvent(outcomeData);
        } else {
          if (!devEncounter && hexNode && this.checkAbyssEncounterTrigger(hexNode)) {
            return;
          }
          this.handleBattleEvent(outcomeData, isWeakenedBoss, devEncounter
            ? encounterBattleOptions(this, devEncounter, hexNode.col)
            : hexNode ? { col: hexNode.col } : {});
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
      if (p.hp > 0) {if(p.role==='gladiator')this.grantGladiatorInspiration(p,healAmt,2,'heal','recovery');else p.hp = Math.min(p.maxHp, p.hp + healAmt);}
    }
    const hpAfter = this.getHpSnapshot();

    const activeRoles = new Set(Object.values(this.players).map(p => p.role).filter(Boolean));
    const unplayedLoots = LOOT_TABLE.filter(l => !activeRoles.has(l.role));
    const playedLoots = this.getEligiblePlayedLoots(activeRoles);

    // 寶箱及戰鬥成功後可能會有低機率(15%)出現沒有玩家玩的職業裝備
    const isUnplayedDrop = unplayedLoots.length > 0 && Math.random() < 0.15;

    const pool = isUnplayedDrop ? unplayedLoots : (playedLoots.length ? playedLoots : LOOT_TABLE);
    const drop = structuredClone(pool[Math.floor(Math.random() * pool.length)]);

    const matchingPlayers = Object.values(this.players).filter(p => p.role === drop.role);
    const equipOwner = this.selectEquipOwner(matchingPlayers, drop) ||
      this.selectEquipOwner(Object.values(this.players).filter(p => p.hp > 0), drop) ||
      this.selectEquipOwner(Object.values(this.players), drop);

    const deposit = this.autoDepositLoot(drop, equipOwner?.id);
    const targetName = deposit?.target === 'squad' ? '小隊背包' : (deposit?.target === 'personal' ? '個人行囊' : '待領取物品');
    const details = [`🎁 **幸運降臨！發現遠古寶箱！** 全員回復 ${healAmt} 生命！獲得裝備【${drop.name}】(${drop.desc})，已自動收納入${targetName}！`];

    this.currentEvent = {
      type: 'treasure',
      title: outcomeData ? outcomeData.title : `🎁【第 ${this.floor} 層】發現遠古寶箱！`,
      story: outcomeData ? outcomeData.story : '',
      healAmt: healAmt,
      drop: drop,
      discardedDrop: null,
      ownerName: targetName,
      ownerId: equipOwner ? equipOwner.id : null,
      depositTarget: deposit?.target || 'squad',
      presentationId: this.chestPresentationId,
      hpBefore,
      hpAfter,
      details
    };

    this.pendingDrop = null;

    this.pendingPresentationAcks = new Set(Object.values(this.players).filter(p => p.connected).map(p => p.id));
    this.broadcastState();
  }

  handleChestPresentationComplete(socketId, presentationId) {
    if (this.state !== 'EVENT' || !['treasure', 'chest'].includes(this.currentEvent?.type) ||
        (this.currentEvent.type === 'chest' && !this.currentEvent.opened) ||
        presentationId !== this.currentEvent.presentationId || !this.players[socketId]?.connected) return;
    this.pendingPresentationAcks.delete(socketId);
    this.finishChestPresentationIfReady();
  }

  finishChestPresentationIfReady() {
    if (this.state !== 'EVENT' || !['treasure', 'chest'].includes(this.currentEvent?.type) || (this.currentEvent.type === 'chest' && !this.currentEvent.opened) || this.pendingPresentationAcks.size) return;
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

      const isArcherLeader = (this.getEffectiveLeaderRole() === 'archer');
      const baseTrapDodge = (p.role === 'archer') ? CLASSES.archer.dodgeRate : 0;
      if ((p.role === 'archer' || isArcherLeader) && this.checkDodge(p, baseTrapDodge)) {
        trapLogs.push(`💨 **${p.name}** 發動疾風步法，敏捷閃避了陷阱傷害！`);
        hits.push({ targetId: p.id, role: p.role, dodged: true, damage: 0, hpSnapshot: this.getHpSnapshot() });
        continue;
      }

      let actualTrapDmg = trapDmg;
      if (p.role === 'paladin' && ((p.tempHp > 0) || (p.p8Shields || []).some(s => s.value > 0)) && (p.equips || []).some(e => e.id === 'pal_banner')) {
        actualTrapDmg = Math.floor(actualTrapDmg * 0.85);
      }
      p.hp -= actualTrapDmg;
      if (p.hp <= 0) {
        p.hp = 0;
        this.clearPlayerDebuffs(p);
        trapLogs.push(`💥 **${p.name}** 受到 **${actualTrapDmg}** 點陷阱重創，不幸身亡！💀`);
      } else {
        trapLogs.push(`💢 **${p.name}** 受到 **${actualTrapDmg}** 點陷阱傷害！（❤️ ${p.hp}/${p.maxHp}）`);
      }
      hits.push({ targetId: p.id, role: p.role, dodged: false, damage: actualTrapDmg, hpSnapshot: this.getHpSnapshot() });
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

  monsterAllowsEffect(label, targetEnemy = this.currentMonster) {
    if (!targetEnemy || targetEnemy.hp <= 0) return false;
    const resistance = getBossResistance(targetEnemy, 'effect');
    if (resistance > 0 && Math.random() < resistance / 100) {
      this.p8Log(`🛡️ **${targetEnemy.name}** 以 ${resistance}% 效果抗性免疫【${label}】！`, 'combat');
      return false;
    }
    return true;
  }

  applyMonsterPoison(damage = 8, turns = 2, targetEnemy = this.currentMonster) {
    if (!this.monsterAllowsEffect('中毒', targetEnemy)) return false;
    this.career?.dotApplied(this, targetEnemy, 'poison', damage, this.healingSourceId);
    targetEnemy.poisonTurns = turns;
    targetEnemy.poisonDmg = (targetEnemy.poisonDmg || 0) + damage;
    return true;
  }

  applyMonsterBurn(damage = 10, turns = 1, targetEnemy = this.currentMonster) {
    if (!this.monsterAllowsEffect('燃燒', targetEnemy)) return false;
    this.career?.dotApplied(this, targetEnemy, 'burn', damage, this.healingSourceId);
    targetEnemy.burnTurns = turns;
    targetEnemy.burnDmg = (targetEnemy.burnDmg || 0) + damage;
    return true;
  }

  applyMonsterFracture(damage = 5, turns = 3, targetEnemy = this.currentMonster) {
    if (!this.monsterAllowsEffect('骨折', targetEnemy)) return false;
    this.career?.dotApplied(this, targetEnemy, 'fracture', damage, this.healingSourceId);
    targetEnemy.fractureTurns = turns;
    targetEnemy.fractureDmg = (targetEnemy.fractureDmg || 0) + damage;
    return true;
  }

  applyMonsterChill(damage = 6, turns = 2, targetEnemy = this.currentMonster) {
    if (!this.monsterAllowsEffect('寒冷', targetEnemy)) return false;
    this.career?.dotApplied(this, targetEnemy, 'chill', damage, this.healingSourceId);
    targetEnemy.chillTurns = turns;
    targetEnemy.chillDmg = (targetEnemy.chillDmg || 0) + damage;
    return true;
  }

  applyMonsterCorrosion(turns = 1, targetEnemy = this.currentMonster) {
    if (!this.monsterAllowsEffect('腐蝕', targetEnemy)) return false;
    const m = targetEnemy;
    if (!m) return false;
    if (!m.corrosionTurns || m.corrosionTurns <= 0) {
      const maxHpDeduction = Math.max(1, Math.floor(m.maxHp * 0.05));
      m.corrosionMaxHpDeducted = maxHpDeduction;
      m.maxHp = Math.max(1, m.maxHp - maxHpDeduction);
      m.hp = Math.min(m.hp, m.maxHp);
    }
    m.corrosionTurns = turns;
    return true;
  }

  applyCorrosionToAlly(ally, turns = 1) {
    if (!ally || ally.hp <= 0) return;
    const paladinGrace = Object.values(this.players).find(pl => pl.role === 'paladin' && pl.hp > 0 && pl.paladinGrace?.targetId === ally.id);
    const target = (paladinGrace && paladinGrace.id !== ally.id) ? paladinGrace : ally;
    if(target.role==='gladiator')return;
    target.corrosionTurns = Math.max(target.corrosionTurns || 0, turns);
  }

  applyDotToAlly(ally, dotType, sourcePlayer = null) {
    if (!ally || ally.hp <= 0) return;
    const paladinGrace = Object.values(this.players).find(pl => pl.role === 'paladin' && pl.hp > 0 && pl.paladinGrace?.targetId === ally.id);
    const target = (paladinGrace && paladinGrace.id !== ally.id) ? paladinGrace : ally;
    if(target.role==='gladiator')return;
    const caster = sourcePlayer !== null ? sourcePlayer : Object.values(this.players).find(p => p.role === 'alchemist' && (p.equips || []).some(e => e.id === 'alc_burette' || e.name === '精密滴管' || e.name === '精密滴定管'));
    const hasBurette = !!(caster && (caster.equips || []).some(e => e.id === 'alc_burette' || e.name === '精密滴管' || e.name === '精密滴定管'));
    const multiplier = hasBurette ? 0.5 : 1.0;
    if (dotType === 'poison') {
      target.poisonTurns = 2;
      target.poisonDmg = (target.poisonDmg || 0) + Math.floor(8 * multiplier);
    } else if (dotType === 'burn') {
      target.burnTurns = 1;
      target.burnDmg = (target.burnDmg || 0) + Math.floor(10 * multiplier);
    } else if (dotType === 'fracture') {
      target.fractureTurns = 3;
      target.fractureDmg = (target.fractureDmg || 0) + Math.floor(5 * multiplier);
    } else if (dotType === 'chill') {
      target.chillTurns = 2;
      target.chillDmg = (target.chillDmg || 0) + Math.floor(6 * multiplier);
    }
  }

  // 戰鬥事件（支援舊版單體 Boss 與新版 Module 2 多目標編隊 options.col / options.enemies）
  handleBattleEvent(outcomeData = null, isWeakened = false, options = {}) {
    this.getStagePlayerCount();
    this.state = 'IN_BATTLE';
    this.arrowTrap = null;
    let encounterStory = '';

    const useFormation = Boolean(
      options && (
        options.col !== undefined ||
        options.enemies ||
        options.specialElite ||
        options.abyssBoss ||
        options.useFormation ||
        this.useHexGrid
      )
    );

    if (useFormation) {
      const col = options.col !== undefined ? options.col : (this.currentHex?.col ?? 1);
      const formationEnemies = Array.isArray(options.enemies) && options.enemies.length > 0
        ? options.enemies.map((e, idx) => (e.maxHp ? e : this.createEnemyInstance(e, idx, { isWeakened, tier: e.tier, rng: options.rng })))
        : this.buildEncounterFormation(col, { ...options, isWeakened });
      this.setEnemies(formationEnemies);
      for (const enemy of formationEnemies) {
        if (enemy.isMimic) {
          enemy.desc = this.studioContent.text('enemy.treasure_mimic', SPECIAL_EVENT_COPY.mimic);
          const pool = col >= 5 ? [...TIER1_EQUIPMENTS, ...TIER2_EQUIPMENTS] : TIER1_EQUIPMENTS;
          const drop = structuredClone(pool[Math.floor(Math.random() * pool.length)]);
          drop.droppedAtCol = col;
          drop.basePrice = getItemBasePrice(drop);
          enemy.chestTreasure = {drop, gold:Math.round((30 + Math.floor(Math.random()*21))*getGoldIncomeMultiplier(col))};
          enemy.stolenLoot = {gold:0, equipment:[]};
        } else if (enemy.isShadyMerchant) enemy.desc = this.studioContent.text('enemy.shady_merchant', SPECIAL_EVENT_COPY.merchant);
      }
      if (options.merchantLootPool) {
        this.merchantLootPool = options.merchantLootPool;
      }
      if (options.abyssModifiers) {
        const primary = this.getPrimaryEnemy();
        if (primary) {
          if (options.abyssModifiers.atkMod) {
            primary.attack = Math.max(1, Math.round(primary.attack * (1 + options.abyssModifiers.atkMod)));
          }
          if (options.abyssModifiers.defMod) {
            primary.baseResistances.physical = Math.max(0, Math.round((primary.baseResistances.physical || 0) * (1 + options.abyssModifiers.defMod)));
            primary.baseResistances.magic = Math.max(0, Math.round((primary.baseResistances.magic || 0) * (1 + options.abyssModifiers.defMod)));
          }
        }
      }
      if (options.abyssBoss && this.getEffectiveLeaderRole() === 'onmyoji') {
        for (const enemy of this.enemies) {
          if (enemy.tier === 'MINION') {
            enemy.stunnedNextTurn = true;
          }
        }
        this.addLog('📜 【百鬼敕令】陰陽師隊長釋放百鬼血咒，深淵隨從小怪首回合行動遭到徹底封印！', 'buff');
      }
      const primary = this.getPrimaryEnemy();
      if(primary&&options.encounterStory)primary.encounterStory=options.encounterStory;
      encounterStory = primary?.encounterStory || `小隊在第 ${col} 層遭遇了敵方編隊（${formationEnemies.map(e => e.name).join('、')}）！`;
    } else {
      const baseMonster = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
      const playerCount = this.getStagePlayerCount();
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
      const bossStory = this.studioContent.getRouteBossStory(routeId, baseMonster.name);
      const weakenedSuffix = isWeakened ? '（⚠️ 遠處傳來粗重的喘息聲，該BOSS在先前的戰鬥中遭受重創，處於負傷狀態！）' : '';
      encounterStory = bossStory + weakenedSuffix;

      this.currentMonster = {
        instanceId: 'enemy_0',
        id: baseMonster.id || 'enemy_0',
        tier: 'ELITE',
        name: isWeakened ? `【負傷】${baseMonster.name}` : baseMonster.name,
        originalName: baseMonster.name,
        routeId,
        encounterStory,
        isWeakened: Boolean(isWeakened),
        avatar: baseMonster.avatar,
        desc: isWeakened ? `${baseMonster.desc} (⚠️ 負傷)` : baseMonster.desc,
        attack: scaledAtk,
        hp: scaledHp,
        maxHp: scaledHp,
        tempHp: 0,
        baseHp: baseMonster.hp,
        ...createBossResistances(baseMonster, this.floor),
        ultName: baseMonster.ultName,
        poisonTurns: 0,
        poisonDmg: 0,
        burnTurns: 0,
        burnDmg: 0,
        fractureTurns: 0,
        fractureDmg: 0,
        chillTurns: 0,
        chillDmg: 0,
        corrosionTurns: 0,
        corrosionMaxHpDeducted: 0,
        talismans: []
      };
    }

    this.battleCount = (this.battleCount || 0) + 1;
    this.career?.encounter(this);
    this.handleLeaderTransferOnBattleStart();
    this.battleRound = 1;
    this.warriorShieldTurn = 0;
    this.alcVulnerableTurns = 0;
    this.alcVulnerableNextTurn = false;
    this.isNarrating = false;
    this.isWolfSurrenderGameOver = false;

    for (const p of Object.values(this.players)) {
      p.bleedTurns = 0;
      p.poisonTurns = 0;
      p.poisonDmg = 0;
      p.burnTurns = 0;
      p.burnDmg = 0;
      p.fractureTurns = 0;
      p.fractureDmg = 0;
      p.chillTurns = 0;
      p.chillDmg = 0;
      p.corrosionTurns = 0;
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
      restoreBearForm(p);
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
    const enemyNamesLabel = this.enemies.length > 1
      ? this.enemies.map(e => e.name).join('、')
      : (this.currentMonster?.name || '未知魔物');
    if (isWeakened) {
      this.addLog(`⚔️🥀 **遭遇負傷BOSS！【${enemyNamesLabel}】（負傷）擋住了去路！**`, 'warning');
    } else {
      this.addLog(`⚔️ **遭遇強敵！【${enemyNamesLabel}】擋住了去路！**`, 'warning');
    }
    this.p8ResetBattle();
    this.executeTurn();
  }

  // Overheal 超量治療計算 (不污染原始 normalMaxHp)
  applyHealWithOverheal(player, healAmount, options = {}) {
    if (player.hp <= 0 || healAmount <= 0) return 0;
    const careerSource = options.sourceId || this.healingSourceId || player.id;

    // 法師隊長技【魔力共鳴】：回血效果同時對所有隊友觸發，但是只有原本的70%
    if (!options.isResonance && this.getEffectiveLeaderRole() === 'mage') {
      const resonanceAmount = Math.max(1, Math.round(healAmount * 0.70));
      for (const ally of Object.values(this.players)) {
        if (ally.id !== player.id && ally.hp > 0) {
          this.applyHealWithOverheal(ally, resonanceAmount, { ...options, isResonance: true, sourceId: careerSource });
        }
      }
      healAmount = resonanceAmount;
    }
    if(player.role==='gladiator') {
      this.grantGladiatorInspiration(player,healAmount,2,'heal',options.sourceId||this.healingSourceId||'regeneration');
      this.actionHeals?.push({targetId:player.id,actualHeal:0,outcome:{type:'inspiration'},targetAfter:snapshotTarget(this.getHpSnapshot(),player.id)});
      return 0;
    }
    let absorbedDebt=0;
    if (!options.directHp && player.role === 'augur' && player.augurFateDebts && player.augurFateDebts.length > 0) {
      const absorbed = this.deductAugurDebtPassive(player, healAmount);
      absorbedDebt=absorbed;
      healAmount -= absorbed;
      if (healAmount <= 0) {
        if (this.actionHeals) {
          this.actionHeals.push({
            targetId: player.id,
            actualHeal: 0,
            targetAfter: snapshotTarget(this.getHpSnapshot(), player.id),
            absorbedDebt: absorbed
          });
        }
        return 0;
      }
    }
    const normalMax = player.maxHp;
    const careerHpBefore = player.hp;
    const oldTempHp = player.tempHp || 0;
    const oldEffective = player.hp + (player.tempHp || 0);
    if (player.hp < normalMax) {
      const needed = normalMax - player.hp;
      if (healAmount <= needed) {
        player.hp += healAmount;
      } else {
        player.hp = normalMax;
        const excess = healAmount - needed;
        const decay=enemyEffect(this,player,'shield_decay')?.value||0;
        player.tempHp = (player.tempHp || 0) + Math.floor(excess*(1-decay));
      }
    } else {
      const decay=enemyEffect(this,player,'shield_decay')?.value||0;
      player.tempHp = (player.tempHp || 0) + Math.floor(healAmount*(1-decay));
    }
    const newEffective = player.hp + (player.tempHp || 0);
    player.temporaryOverheal = Math.min(oldTempHp,player.temporaryOverheal || 0) + Math.max(0,(player.tempHp || 0)-oldTempHp);
    const actualHeal = newEffective - oldEffective;
    this.career?.heal(this, player.id, player.hp - careerHpBefore, careerSource);
    if (this.actionHeals) this.actionHeals.push({ targetId: player.id, actualHeal,absorbedDebt,
      targetAfter: snapshotTarget(this.getHpSnapshot(), player.id) });
    onPlayerHealed(this,player,actualHeal);
    return actualHeal;
  }

  // 吸血治療（上限不高於原始最大生命，絕不溢出轉為 tempHp）
  applyHealCapped(player, healAmount, options = {}) {
    const careerSource = options.sourceId || this.healingSourceId || player.id;
    if (player.hp <= 0 || healAmount <= 0) return 0;

    // 法師隊長技【魔力共鳴】：回血效果同時對所有隊友觸發，但是只有原本的70%
    if (!options.isResonance && this.getEffectiveLeaderRole() === 'mage') {
      const resonanceAmount = Math.max(1, Math.round(healAmount * 0.70));
      for (const ally of Object.values(this.players)) {
        if (ally.id !== player.id && ally.hp > 0) {
          this.applyHealWithOverheal(ally, resonanceAmount, { ...options, isResonance: true, sourceId: careerSource });
        }
      }
      healAmount = resonanceAmount;
    }
    let absorbedDebt=0;
    if (!options.directHp && player.role === 'augur' && player.augurFateDebts && player.augurFateDebts.length > 0) {
      const absorbed = this.deductAugurDebtPassive(player, healAmount);
      absorbedDebt=absorbed;
      healAmount -= absorbed;
      if (healAmount <= 0) {
        if (this.actionHeals) {
          this.actionHeals.push({
            targetId: player.id,
            actualHeal: 0,
            targetAfter: snapshotTarget(this.getHpSnapshot(), player.id),
            absorbedDebt: absorbed
          });
        }
        return 0;
      }
    }
    if(player.role==='gladiator') {
      this.grantGladiatorInspiration(player,healAmount,2,'heal',options.sourceId||this.healingSourceId||'regeneration');
      this.actionHeals?.push({targetId:player.id,actualHeal:0,outcome:{type:'inspiration'},targetAfter:snapshotTarget(this.getHpSnapshot(),player.id)});
      return 0;
    }
    const oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    const actualHeal = Math.max(0, player.hp - oldHp);
    this.career?.heal(this, player.id, actualHeal, careerSource);
    if (this.actionHeals) {
      this.actionHeals.push({
        targetId: player.id,
        actualHeal,
        absorbedDebt,
        targetAfter: snapshotTarget(this.getHpSnapshot(), player.id)
      });
    }
    onPlayerHealed(this,player,actualHeal);
    return actualHeal;
  }

  // Only incoming direct enemy hits may consume shields / temporary overheal.
  applyDamageToPlayer(player, dmg, context = {}) {
    if(player.role==='gladiator'&&context.kind==='dot'&&!context.unavoidable)return {actualDmg:0,hpDmg:0,tempAbsorbed:0};
    const directHit=!context.kind || ['enemy_direct','grace_redirect','secondary','abyss_counter'].includes(context.kind);
    if (!context.trueDamage && !context.ignoreReduction && !context.defMitigated && !this.arena && ['enemy_direct','grace_redirect','secondary'].includes(context.kind)) {
      dmg=mitigateDirectDamage(dmg,{damageType:context.damageType||'phys',defense:resolveStats(player,this.statMultiplier(player)).DEF});
    }
    const hpBefore=player.hp;
    if (dmg <= 0) return { actualDmg: 0, hpDmg: 0, tempAbsorbed: 0 };
    const protection=context.kind==='sage_confusion'?null:this.p8Has(player,'boundary');
    if(protection?.barrier && dmg>=(player.hp+(this.arena?.playerId===player.id?this.arena.bloodsong||0:0)+(directHit?(player.tempHp||0):0))) {
      protection.barrier=false;
      this.p8Log(`${player.name}的星光屏障抵擋一次致命傷。`);
      return {actualDmg:0,hpDmg:0,tempAbsorbed:0};
    }
    let remaining = dmg;

    // 煉金隊長藥劑 15% 減傷
    if (directHit && !context.trueDamage && !context.ignoreReduction && player.alcPotionDefTurns > 0) {
      remaining = Math.max(1, Math.floor(remaining * 0.85));
    }

    // 智者隊長技【守勢推演】：在假設階段獲得 20% 減傷
    if (directHit && !context.trueDamage && !context.ignoreReduction && this.getEffectiveLeaderRole() === 'sage' && player.role === 'sage' && player.sagePhase === 'hypothesis') {
      remaining = Math.max(1, Math.floor(remaining * 0.80));
      this.p8Log(`📐 【守勢推演】智者隊長處於假設階段，獲得 20% 傷害減免！`);
    }

    // 織夢術士隊長技：50% 傷害延後至下一回合
    if (directHit && player.dreamDamageDelayActive) {
      player.dreamDamageDelayActive = false;
      const delayed = Math.floor(remaining * 0.5);
      player.delayedDreamDmg = (player.delayedDreamDmg || 0) + delayed;
      remaining -= delayed;
      this.p8Log(`🌙 【共夢契約】織夢術士隊長延後了 ${player.name} 的 ${delayed} 點傷害至次回合！`);
    }

    let bloodsongAbsorbed=0;
    if(this.arena?.playerId===player.id&&this.arena.bloodsong>0){
      bloodsongAbsorbed=Math.min(remaining,this.arena.bloodsong);
      this.arena.bloodsong-=bloodsongAbsorbed;remaining-=bloodsongAbsorbed;
    }
    let tempAbsorbed = 0;
    const overhealBefore=Math.min(player.tempHp||0,player.temporaryOverheal||0);
    const shieldBefore=Math.max(0,(player.tempHp||0)-overhealBefore);
    if (directHit && (player.tempHp || 0) > 0) {
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

    // 聖騎士隊長技：不屈誓約（致命傷害保留 1 HP）
    if (player.paladinFatalGuard && remaining >= player.hp) {
      player.paladinFatalGuard = false;
      remaining = Math.max(0, player.hp - 1);
      this.p8Log(`🛡️✨ 【不屈誓約】聖騎士隊長聖光庇佑顯靈！${player.name} 免於致死打擊，生命保留 1 點！`);
    }

    if (remaining > 0) {
      player.hp = Math.max(0, player.hp - remaining);
    }
    const boundary=context.kind==='sage_confusion'?null:this.p8Has(player,'boundary');
    if(player.hp<=0 && boundary) {player.hp=1;if(boundary.barrier)boundary.barrier=false;}
    const result={actualDmg:hpBefore-player.hp+tempAbsorbed+bloodsongAbsorbed,hpDmg:Math.max(0,hpBefore-player.hp),tempAbsorbed,...(bloodsongAbsorbed?{bloodsongAbsorbed}:{})};
    player.temporaryOverheal=Math.max(0,overhealBefore-Math.max(0,tempAbsorbed-shieldBefore));
    this.p8ConsumeShield(player,Math.min(tempAbsorbed,shieldBefore));this.p8RecordDamage(player,result,context);
    if(player.hp<=0&&player.druidForm==='bear'){restoreBearForm(player);player.druidForm=null;player.druidFormTurns=0;}
    return result;
  }

  // 首領回合完全結束後清除超量生命
  clearTemporaryOverheal() {
    let anyCleared = false;
    for (const p of Object.values(this.players)) {
      const shield=(p.p8Shields||[]).reduce((n,s)=>n+s.value,0);
      if ((p.tempHp || 0) > shield) {
        p.tempHp = shield;
        p.temporaryOverheal = 0;
        p.hp = Math.min(p.hp, p.maxHp);
        anyCleared = true;
      }
      p.temporaryOverheal = 0;
    }
    return anyCleared;
  }

  // 取得即時生命狀態快照 (供 Presentation Queue 精準步進渲染)
  getHpSnapshot() {
    return {
      arena: (this.arena || this.enemyArena) ? {playerId:(this.arena || this.enemyArena).playerId,enemyId:(this.arena || this.enemyArena).enemyId,until:(this.arena || this.enemyArena).until,enemyForced:!!this.enemyArena} : null,
      monster: this.currentMonster ? this.formatEnemySnapshot(this.currentMonster) : null,
      enemies: (this.enemies || []).map(e => this.formatEnemySnapshot(e)),
      players: Object.values(this.players).map(p => ({
        id: p.id, name: p.name, role: p.role,
        cooldowns: {...(p.cooldowns||{})},
        hp: p.hp, druidForm: p.druidForm, druidFormTurns: p.druidFormTurns,
        downedForFloor: p.hp <= 0, cannotCrit: p.cannotCrit,
        stunnedNextTurn: p.stunnedNextTurn, nextTurnStunFlag: p.nextTurnStunFlag,
        archerNextDodgeBonus: p.archerNextDodgeBonus || 0,
        ...assassinState(p),
        ...p8State(p,this),
        statuses: playerStatuses(p, this, GAME_BALANCE),
        minions: (p.minions||[]).map(m=>companionSnapshot(m,p,this)),
        ammo: [...(p.ammo || [])], isCrouchedThisRound: !!p.isCrouchedThisRound,
        maxHp: p.maxHp,
        tempHp: p.tempHp || 0,
        temporaryOverheal: Math.min(p.tempHp || 0,p.temporaryOverheal || 0),
        shieldHp: Math.max(0,(p.tempHp || 0)-(p.temporaryOverheal || 0)),
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
    this.clearTimer();this.healingSourceId=null;
    this.roundModifiers = { equipmentEffectMultiplier: 1.0, acidFlaskCount: 0 }; // 每回合初確保裝備倍率恢復 100%
    this.getCombatPlayers().forEach(p => { p.isCrouchedThisRound = false; this.cleanGladiatorDebuffs(p); });
    for (const enemy of (this.enemies || [])) {
      if (enemy) {
        enemy.sealedThisRound = false;
        enemy.untargetableThisRound = false;
        enemy.reflectDamageRatio = 0;
        enemy.counterChance = 0;
      }
    }
    const alivePlayers = this.getCombatPlayers().filter(p => p.hp > 0);
    if (alivePlayers.length === 0) {
      this.handleGameOver();
      return;
    }

    const canFightLiving = this.getCombatPlayers().filter(p => p.hp > 0 && !p.isSurrendered);
    if (canFightLiving.length === 0 && this.currentMonster && (this.currentMonster.name === '暗影魔狼族長' || this.currentMonster.name.includes('暗影魔狼族長'))) {
      this.addLog(`👑🐺💀 **【血脈臣服·全隊潰敗】** 德魯伊處於狼王臣服狀態無法行動，且隊伍已無其他能戰鬥的生還隊友，冒險直接判定挑戰失敗！`, 'damage');
      this.handleGameOver();
      return;
    }

    const monster = this.currentMonster;
    enemyRoundStart(this);
    for (const enemy of this.getLivingEnemies()) runMimicAmbush(this, enemy);
    const enemyRoundQueue=[];drainEnemyEvents(this,enemyRoundQueue);
    const roundBefore = this.getHpSnapshot();
    const log = [];
    const visualEvents = [];

    // 裝備開場護盾 (守護者吊墜)
    if (this.battleRound === 1) {
      for (const p of alivePlayers) {
        if (p.battleStartShield > 0) {
          if(p.role==='gladiator')this.p8GrantShield(p,p.battleStartShield,Infinity,'battle_start');
          else p.tempHp = (p.tempHp || 0) + p.battleStartShield;
          log.push({ text: p.role==='gladiator'?`**${p.name}** 的【守護者吊墜】${p.battleStartShield} 點護盾已轉為鼓舞。`:`🛡️ **${p.name}** 的【守護者吊墜】生效，獲得 ${p.battleStartShield} 點開場護盾！`, type: 'buff' });
          visualEvents.push({ type: p.role==='gladiator'?'buff':'shield_gain', targetId: p.id, value: p.role==='gladiator'?0:p.battleStartShield });
        }
      }
    }

    // 每回合初裝備自動回復 (再生草環、生命指環) 與延後夢境傷害
    for (const p of alivePlayers) {
      if (p.hp > 0 && p.regenPerRound > 0) {
        const heal = p.role==='gladiator'?p.regenPerRound:Math.min(p.maxHp - p.hp, p.regenPerRound);
        if (heal > 0) {
          if(p.role==='gladiator')this.applyHealCapped(p,heal);else { p.hp += heal; this.career?.heal(this,p.id,heal,p.id); }
          log.push({ text: p.role==='gladiator'?`**${p.name}** 的裝備再生 ${heal} 點治療已轉為鼓舞。`:`🌱 **${p.name}** 的裝備律動生機，自動回復了 ${heal} 點生命！（❤️ ${p.hp}/${p.maxHp}）`, type: 'buff' });
          visualEvents.push({ type: p.role==='gladiator'?'buff':'regen', targetId: p.id, value: p.role==='gladiator'?0:heal });
        }
      }
      if (p.delayedDreamDmg > 0 && p.hp > 0) {
        const dDmg = p.delayedDreamDmg;
        p.delayedDreamDmg = 0;
        p.hp = Math.max(0, p.hp - dDmg);
        log.push({ text: `🌙 **${p.name}** 延遲的夢境傷害生效，受到 **${dDmg}** 點傷害！（❤️ ${p.hp}/${p.maxHp}）`, type: 'damage' });
        visualEvents.push({ type: 'delayed_damage', targetId: p.id, value: dDmg });
      }
      if (p.alcPotionDefTurns > 0) p.alcPotionDefTurns -= 1;
      if (p.alcPotionAtkTurns > 0) {
        p.alcPotionAtkTurns -= 1;
        if (p.alcPotionAtkTurns === 0) {
          p.bonusAtk = Math.max(0, (p.bonusAtk || 0) - 8);
          p.alcPotionDot = false;
        }
      }
    }

    const arenaQueue=[...enemyRoundQueue];
    this.augurReactions=[]; this.augurVisuals=visualEvents; this.p8Results=null;
    this.p8LogBuffer = log; this.p8RoundStart(arenaQueue); this.p8LogBuffer = null;
    enemyPlayerRoundTicks(this);drainEnemyEvents(this,arenaQueue);

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
    if (this.getLivingEnemies().some(e => e.baseHp < 100)) {
      const bleedDmg = Math.floor(2 * getFloorDifficultyMultiplier(this.floor));
      for (const p of this.getCombatPlayers()) {
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

    // 2.5 腐蝕結算與深淵智者被動 (回合初倒數)
    for (const enemy of this.getLivingEnemies()) {
      if (enemy.corrosionTurns > 0) {
        enemy.corrosionTurns -= 1;
        if (enemy.corrosionTurns === 0 && (enemy.corrosionMaxHpDeducted || 0) > 0) {
          enemy.maxHp += enemy.corrosionMaxHpDeducted;
          enemy.corrosionMaxHpDeducted = 0;
          log.push({ text: `🧪 **${enemy.name}** 的【腐蝕】效果結束，血量上限恢復！`, type: 'info' });
        }
      }
    }
    let anyPlayerCorrosionExpired = false;
    for (const p of this.getCombatPlayers()) {
      if (p.hp > 0 && p.corrosionTurns > 0) {
        p.corrosionTurns -= 1;
        if (p.corrosionTurns === 0) {
          anyPlayerCorrosionExpired = true;
          log.push({ text: `🧪 **${p.name}** 的【腐蝕】效果結束，裝備效果恢復正常！`, type: 'info' });
        }
      }
    }
    if (anyPlayerCorrosionExpired) {
      this.p8RefreshEquipment();
    }

    // 3. 持續傷害 (DoT) 結算 (回合初 DoT: 中毒、燃燒、骨折、寒冷)
    const multiEnemyMode = (this.enemies || []).length > 1;
    for (const targetMonster of this.getLivingEnemies()) {
      const targetKey = multiEnemyMode ? targetMonster.instanceId : 'monster';
      if(targetMonster.untargetableThisRound || !enemyCanParticipate(this,targetMonster))continue;
      if (targetMonster.hp > 0 && targetMonster.poisonTurns > 0) {
        const pDmg = this.augmentOmenDamage(targetMonster.poisonDmg || 5);
        this.career?.dotDamage(this, targetMonster, 'poison', Math.min(targetMonster.hp, pDmg));
        targetMonster.hp = Math.max(0, targetMonster.hp - pDmg);
        targetMonster.poisonTurns -= 1;
        if (targetMonster.poisonTurns === 0) targetMonster.poisonDmg = 0;
        visualEvents.push({ type: 'poison_damage', target: targetKey, value: pDmg });
        if (targetMonster.hp <= 0) {
          log.push({ text: `🧪 **${targetMonster.name}** 體內劇毒發作受到 **${pDmg}** 點毒傷倒下！💀`, type: 'damage' });
        } else {
          log.push({ text: `🧪 **${targetMonster.name}** 劇毒發作受到 **${pDmg}** 點毒素傷害！（剩餘中毒: ${targetMonster.poisonTurns} 回合，每回合 ${pDmg} 點）`, type: 'damage' });
        }
      }
      if (targetMonster.hp > 0 && targetMonster.burnTurns > 0) {
        const bDmg = this.augmentOmenDamage(targetMonster.burnDmg || 7);
        this.career?.dotDamage(this, targetMonster, 'burn', Math.min(targetMonster.hp, bDmg));
        targetMonster.hp = Math.max(0, targetMonster.hp - bDmg);
        targetMonster.burnTurns -= 1;
        if (targetMonster.burnTurns === 0) targetMonster.burnDmg = 0;
        visualEvents.push({ type: 'burn_damage', target: targetKey, value: bDmg });
        if (targetMonster.hp <= 0) {
          log.push({ text: `🔥 **${targetMonster.name}** 烈火焚身受到 **${bDmg}** 點燃燒傷害倒下！💀`, type: 'damage' });
        } else {
          log.push({ text: `🔥 **${targetMonster.name}** 烈火焚身受到 **${bDmg}** 點燃燒傷害！（剩餘燃燒: ${targetMonster.burnTurns} 回合，每回合 ${bDmg} 點）`, type: 'damage' });
        }
      }
      if (targetMonster.hp > 0 && targetMonster.fractureTurns > 0) {
        const fDmg = this.augmentOmenDamage(targetMonster.fractureDmg || 2);
        this.career?.dotDamage(this, targetMonster, 'fracture', Math.min(targetMonster.hp, fDmg));
        targetMonster.hp = Math.max(0, targetMonster.hp - fDmg);
        targetMonster.fractureTurns -= 1;
        if (targetMonster.fractureTurns === 0) targetMonster.fractureDmg = 0;
        visualEvents.push({ type: 'fracture_damage', target: targetKey, value: fDmg });
        if (targetMonster.hp <= 0) {
          log.push({ text: `🦴 **${targetMonster.name}** 骨骼粉碎受到 **${fDmg}** 點骨折傷害倒下！💀`, type: 'damage' });
        } else {
          log.push({ text: `🦴 **${targetMonster.name}** 骨骼劇痛受到 **${fDmg}** 點骨折傷害！（剩餘骨折: ${targetMonster.fractureTurns} 回合，每回合 ${fDmg} 點）`, type: 'damage' });
        }
      }
      if (targetMonster.hp > 0 && targetMonster.chillTurns > 0) {
        const cDmg = this.augmentOmenDamage(targetMonster.chillDmg || 3);
        this.career?.dotDamage(this, targetMonster, 'chill', Math.min(targetMonster.hp, cDmg));
        targetMonster.hp = Math.max(0, targetMonster.hp - cDmg);
        targetMonster.chillTurns -= 1;
        if (targetMonster.chillTurns === 0) targetMonster.chillDmg = 0;
        visualEvents.push({ type: 'chill_damage', target: targetKey, value: cDmg });
        if (targetMonster.hp <= 0) {
          log.push({ text: `❄️ **${targetMonster.name}** 凍氣攻心受到 **${cDmg}** 點寒冷傷害倒下！💀`, type: 'damage' });
        } else {
          log.push({ text: `❄️ **${targetMonster.name}** 寒氣侵蝕受到 **${cDmg}** 點寒冷傷害！（剩餘寒冷: ${targetMonster.chillTurns} 回合，每回合 ${cDmg} 點）`, type: 'damage' });
        }
      }
      if (targetMonster.hp > 0 && targetMonster.talismans && targetMonster.talismans.length > 0) {
        const TALISMAN_NAMES = {
          blind: '障目符',
          seal: '封勁符',
          corrode: '蝕體符',
          confuse: '惑心符',
          drain: '抽髓符'
        };

        const droppedTalismans = [];
        const keptTalismans = [];

        const hasKariginu = this.getCombatPlayers().some(p => p.role === 'onmyoji' && (p.equips || []).some(e => e.id === 'onm_kariginu'));
        const dropThreshold = hasKariginu ? 0.20 : 0.35;

        if (targetMonster.talismansLockedTurns > 0) {
          targetMonster.talismansLockedTurns -= 1;
          keptTalismans.push(...targetMonster.talismans);
          log.push({
            text: `📜🔒 【百鬼敕令】陰陽師隊長符咒封印生效，魔物身上所有符咒（共 ${targetMonster.talismans.length} 張）全數鎖定保留，未發生脫落！`,
            type: 'buff'
          });
        } else {
          const permList = [...(targetMonster.permanentTalismans || [])];
          for (const talisman of targetMonster.talismans) {
            const pIdx = permList.indexOf(talisman);
            if (pIdx !== -1) {
              permList.splice(pIdx, 1);
              keptTalismans.push(talisman);
              continue; // 萬符歸宗貼上的符咒永不脫落
            }
            const dropRoll = typeof targetMonster.talismanDropRng === 'function' ? targetMonster.talismanDropRng() : Math.random();
            if (dropRoll < dropThreshold) {
              droppedTalismans.push(talisman);
            } else {
              keptTalismans.push(talisman);
            }
          }
        }

        targetMonster.talismans = keptTalismans;

        if (droppedTalismans.length > 0) {
          const droppedSummary = droppedTalismans.map(t => TALISMAN_NAMES[t] || t).join('、');
          log.push({
            text: `📜🍃 魔物身上的符咒受到氣勁衝擊脫落：${droppedSummary}（共 ${droppedTalismans.length} 張掉落，剩餘 ${keptTalismans.length} 張未掉落）！`,
            type: 'info'
          });
        }

        // 沒掉落的符咒再次觸發每一個效果
        for (const talisman of keptTalismans) {
          if (targetMonster.hp <= 0) break;

          if (talisman === 'drain') {
            const drainDmg = this.augmentOmenDamage(Math.max(1, Math.floor(targetMonster.maxHp * 0.05)));
            targetMonster.hp = Math.max(0, targetMonster.hp - drainDmg);
            visualEvents.push({ type: 'player_attack', sourceId: 'onmyoji', target: targetKey, dmgType: 'mag', value: drainDmg, label: '抽髓符' });
            if (targetMonster.hp <= 0) {
              log.push({ text: `📜💀 **【抽髓符】** 未掉落再次觸發！扣除魔物最大生命 5%（${drainDmg} 點削血），魔物倒下！💀`, type: 'damage' });
            } else {
              log.push({ text: `📜💀 **【抽髓符】** 未掉落再次觸發！扣除魔物最大生命 5%（${drainDmg} 點削血）！（❤️ 魔物 HP: ${targetMonster.hp}/${targetMonster.maxHp}）`, type: 'damage' });
            }
          } else if (talisman === 'confuse') {
            const confuseRatio = typeof targetMonster.talismanConfuseRatio === 'number'
              ? targetMonster.talismanConfuseRatio
              : (0.50 + Math.random() * 0.50);
            const confuseDmg = Math.max(1, Math.round((targetMonster.attack || 20) * confuseRatio));
            targetMonster.hp = Math.max(0, targetMonster.hp - confuseDmg);
            visualEvents.push({ type: 'player_attack', sourceId: 'onmyoji', target: targetKey, dmgType: 'mag', value: confuseDmg, label: '惑心反噬' });
            if (targetMonster.hp <= 0) {
              log.push({ text: `📜🌀💥 **【惑心符】** 未掉落再次觸發！魔物心智混亂將攻擊傷害的 ${Math.round(confuseRatio * 100)}%（${confuseDmg} 點）作用在自身倒下！💀`, type: 'warning' });
            } else {
              log.push({ text: `📜🌀💥 **【惑心符】** 未掉落再次觸發！魔物心智混亂將攻擊傷害的 ${Math.round(confuseRatio * 100)}%（${confuseDmg} 點）作用在自身！（❤️ 魔物 HP: ${targetMonster.hp}/${targetMonster.maxHp}）`, type: 'warning' });
            }
          } else if (talisman === 'blind') {
            log.push({ text: `📜👁️ **【障目符】** 未掉落再次觸發！魔物視界持續受障，攻擊命中率大幅下降，此次攻擊有 60%~100% 的不對我方傷害！`, type: 'buff' });
          } else if (talisman === 'seal') {
            targetMonster.sealedThisRound = true;
            log.push({ text: `📜🔒 **【封勁符】** 未掉落再次觸發！封鎖魔物全部氣勁，目標有 100% 機率在當前回合完全不造成任何傷害！`, type: 'buff' });
          } else if (talisman === 'corrode') {
            log.push({ text: `📜🩸 **【蝕體符】** 未掉落再次結算易傷判定！魔物肉體受蝕，受到的所有攻擊傷害提升 25%！`, type: 'buff' });
          }
        }
      }
    }
    if (this._currentMonster && this._currentMonster.hp <= 0 && this.getLivingEnemies().length > 0) {
      this.refreshPrimaryMonster();
    }

    const tickPlayerDot = (p, dotName, dotIcon, turnsKey, dmgKey, defaultDmg) => {
      if (p.hp <= 0 || !p[turnsKey] || p[turnsKey] <= 0) return;
      const dotDmg = p[dmgKey] || defaultDmg;
      p[turnsKey] -= 1;
      if (p[turnsKey] === 0) p[dmgKey] = 0;
      if (isAssassinHidden(p)) {
        visualEvents.push({ type: 'hidden_evade', targetId: p.id, label: '隱身・MISS', outcome: { type: 'dodge', stealth: true } });
        log.push({ text: `**${p.name}** 的隱身阻止${dotName}傷害。`, type: 'buff' });
        return;
      }
      const incoming = this.p8Incoming(p, dotDmg, n => n, { kind: 'dot' });
      const received = this.applyDamageToPlayer(p, incoming.damage, { kind: 'dot' });
      this.p8NightmareHeal(p, incoming.ownerId);
      visualEvents.push({ type: `${turnsKey.replace('Turns', '')}_damage`, target: p.id, value: received.actualDmg });
      if (p.hp <= 0) {
        if (p.druidForm === 'treant') {
          p.hp = 1;
          p.druidForm = 'tree';
          p.druidFormTurns = 1;
          p.stunnedNextTurn = true;
          p.action = 'skip';
          p.isLocked = true;
          log.push({ text: `🪵 **${p.name}** ${dotName}致命，觸發樹精守護！保留 1 點生命並化身為【沉睡古樹】，進入 1 回合休眠狀態（無法行動）！`, type: 'buff' });
          visualEvents.push({ type: 'transform_tree', sourceId: p.id });
        } else {
          p.hp = 0;
          this.clearPlayerDebuffs(p);
          if (p.druidForm === 'tree') {
            p.druidForm = null;
            p.druidFormTurns = 0;
          }
          log.push({ text: `${dotIcon} **${p.name}** ${dotName}發作受到 **${dotDmg}** 點傷害，不幸身亡！💀`, type: 'damage' });
        }
      } else {
        log.push({ text: `${dotIcon} **${p.name}** 受到 **${dotDmg}** 點${dotName}傷害！（❤️ ${p.hp}/${p.maxHp}，剩餘${dotName}: ${p[turnsKey]} 回合，每回合 ${dotDmg} 點）`, type: 'damage' });
      }
    };

    for (const p of this.getCombatPlayers()) {
      tickPlayerDot(p, '毒素', '🧪', 'poisonTurns', 'poisonDmg', 5);
      tickPlayerDot(p, '燃燒', '🔥', 'burnTurns', 'burnDmg', 7);
      tickPlayerDot(p, '骨折', '🦴', 'fractureTurns', 'fractureDmg', 2);
      tickPlayerDot(p, '寒冷', '❄️', 'chillTurns', 'chillDmg', 3);
    }

    // 4. 回合初狂亂殺戮曲代價扣除 (全隊扣除 20% 最大生命)
    if (this.frenzyTeamDrainTurns > 0) {
      this.frenzyTeamDrainTurns -= 1;
      for (const pl of this.getCombatPlayers()) {
        if (pl.hp > 0) {
          if (isAssassinHidden(pl)) { visualEvents.push({ type: 'hidden_evade', targetId: pl.id, label: '隱身・MISS', outcome: { type: 'dodge', stealth: true } }); continue; }
          const drain = Math.max(1, Math.round(pl.maxHp * 0.20));
          pl.hp = Math.max(1, pl.hp - drain);
          log.push({ text: `🩸 【狂亂殺戮曲】狂亂反噬代價生效！**${pl.name}** 承受 20% 最大生命反噬，扣除 **${drain}** 點生命！（❤️ ${pl.hp}/${pl.maxHp}）`, type: 'damage' });
          visualEvents.push({ type: 'self_damage', targetId: pl.id, value: drain, label: '狂亂反噬' });
        }
      }
    }
    if (this.frenzyTeamDrainNextTurn) {
      this.frenzyTeamDrainTurns = 1;
      this.frenzyTeamDrainNextTurn = false;
    }

    // 5. 祝福絲綢袍（詩人裝備）：每回合初自動為全隊當前生命最低的隊友補血
    for (const p of this.getCombatPlayers()) {
      if (p.hp > 0 && p.role === 'bard') {
        const robeCount = (p.equips || []).filter(e => e.id === 'b_robe' || e.name === '祝福絲綢袍').length;
        if (robeCount > 0) {
          const livingAllies = this.getCombatPlayers().filter(pl => pl.hp > 0);
          if (livingAllies.length > 0) {
            livingAllies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
            const targetAlly = livingAllies[0];
            const healAmt = Math.max(1, Math.round(p.maxHp * 0.05 * robeCount));
            const actualGain = this.applyHealWithOverheal(targetAlly, healAmt, { sourceId: p.id });
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
          damageType:ev.type==='augur_tome'?'true':undefined,
          sourceId:ev.sourceId,
          outcome: ev.outcome || { type: ev.type==='augur_tome'?'augur_tome':'normal', protection: finalTarget?.druidForm === 'tree' },
          targetBefore, targetAfter: structuredClone(target), hpSnapshot: structuredClone(display) });
      }
      const roundQueue=[...arenaQueue,{ type: 'status_action', category: 'STATUS_TICK', skillName: 'ROUND ' + this.battleRound,
        augurReactions:this.augurReactions,
        monsterName: monster?.name, monsterAvatar: monster?.avatar, outcome: { type: 'normal' },
        hpSnapshotBefore: arenaQueue.at(-1)?.hpSnapshot || roundBefore, hpSnapshot: after, results }];
      if(this.arena&&this.players[this.arena.playerId]?.hp<=0)this.p8ExitArena(roundQueue,'gladiator_dead');
      this.publishCombatQueue(roundQueue,'round_start');
    } else if (arenaQueue.length) this.publishCombatQueue(arenaQueue,'round_start');
    else this.startSkillSelection();
    this.augurVisuals=null;
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

    for (const p of this.getCombatPlayers()) {
      // After round-start damage/control, pay only on a turn this Sage can act.
      this.p8PaySageDebt(p);
      if (p.hp <= 0) {
        p.action = null;
        p.isLocked = true;
      } else if (p.isSurrendered || p.druidForm === 'tree' || p.stunnedNextTurn || ((this.arena || this.enemyArena) && (this.arena || this.enemyArena).playerId !== p.id)) {
        p.action = 'skip';
        p.isLocked = true;
      } else {
        p.action = null;
        p.targetPlayerId = null;
        if (p.targetEnemyId && !this.getLivingEnemies().some(e => e.instanceId === p.targetEnemyId || e.id === p.targetEnemyId)) {
          p.targetEnemyId = null;
        }
        p.isLocked = false;
      }
      p.isStealthed = false;
    }

    for (const enemy of this.getLivingEnemies()) {
      const cue=enemyPresentationInfo(enemy,this);
      if(cue.ultimateReady)this.addLog(`⚠️ **【${enemy.name} 正在蓄力【${cue.ultimateName}】${cue.targetName?'・優先威脅 '+cue.targetName:''}】**`, 'warning');
    }

    // 嚴格遵守 P2-R1.1 Section 6：技能選擇 30 秒計時由客戶端 battle:selection_ready 驅動
    this.clearTimer();
    this.isWaitingForSelectionReady = true;
    this.pendingSelectionAcks = new Set(this.getCombatPlayers().filter(p => p.connected).map(p => p.id));

    this.broadcastState();
  }

  // 客戶端 Round Intro / Status Ticks 播放完畢、技能介面啟用確認 (P2-R1.1 Section 6)
  handleSelectionReady(socketId = null, round = this.battleRound) {
    if (this.state !== 'IN_BATTLE' || this.selectionState !== 'SELECTING' || round !== this.battleRound) return;
    if (!this.isWaitingForSelectionReady) return;
    if (!this.players[socketId]?.connected || !this.isStageParticipant(socketId)) return;
    this.pendingSelectionAcks.delete(socketId);
    if (this.pendingSelectionAcks.size) return;
    this.isWaitingForSelectionReady = false;
    if (this.selectionReadyTimer) {
      clearTimeout(this.selectionReadyTimer);
      this.selectionReadyTimer = null;
    }

    this.broadcastState();
    this.checkTurnCompletion();
  }

  selectTargetEnemy(socketId, targetEnemyId) {
    if (!this.isStageParticipant(socketId) || !this.players[socketId]?.connected) return { success: false, message: '你不在本階段參戰名單中或已離線' };
    if (this.state !== 'IN_BATTLE') return { success: false, message: '目前非戰鬥回合' };
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    const arena=this.arena || this.enemyArena;
    if(arena&&arena.playerId!==player.id)return {success:false,message:'死亡角鬥場期間僅決鬥者可選擇目標'};
    const found = this.getLivingEnemies().find(e => e.instanceId === targetEnemyId || e.id === targetEnemyId);
    if(arena?.enemyId&&found?.instanceId!==arena.enemyId)return {success:false,message:'死亡角鬥場期間只能選擇決鬥敵人'};
    if (!found) return { success: false, message: '無效或已陣亡的敵方目標' };
    player.targetEnemyId = found.instanceId;
    this.broadcastState();
    return { success: true, targetEnemyId: found.instanceId };
  }

  // 玩家鎖定技能 (CONFIRM -> LOCKED)
  lockAction(socketId, actionId, targetPlayerId = null, targetEnemyId = null) {
    if (!this.isStageParticipant(socketId) || !this.players[socketId]?.connected) return { success: false, message: '你不在本階段參戰名單中或已離線' };
    if (this.state !== 'IN_BATTLE') return { success: false, message: '目前非戰鬥回合' };
    if (this.selectionState !== 'SELECTING') return { success: false, message: '目前正在結算中，無法更改指令！' };
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (player.hp <= 0) return { success: false, message: '你已陣亡，無法行動' };
    if ((this.arena || this.enemyArena) && (this.arena || this.enemyArena).playerId !== player.id) return {success:false,message:'死亡競技場期間無法行動'};
    if(player.role==='sage'&&player.sagePhase==='solve'&&player.sagePreviousAction===actionId)return {success:false,message:'求解階段不可重複上一回合的技能'};
    if (actionId === 'sa_tsubame' && this.getSamuraiSoul(player)<4) return {success:false,message:'燕返需要至少 4 層武魂'};
    if (actionId === 'pal_grace' && targetPlayerId && (!this.players[targetPlayerId] || this.players[targetPlayerId].hp <= 0)) return { success: false, message: '請指定存活隊友' };
    if (actionId === 'aug_bind') {
      const others=this.getCombatPlayers().filter(p=>p.hp>0 && p.id!==player.id);
      if (!others.length) targetPlayerId=player.id;
      else if (!others.some(p=>p.id===targetPlayerId)) return {success:false,message:'命運繫結必須指定自身以外的存活隊友'};
    }
    const isEnemyTargetId = (id) => Boolean(id && (id === 'monster' || (this.enemies || []).some(e => e.instanceId === id || e.id === id)));
    if (actionId === 'dw_butterfly' && !isEnemyTargetId(targetPlayerId) && (!this.players[targetPlayerId] || this.players[targetPlayerId].hp<=0)) return {success:false,message:'請指定存活隊友或魔物'};
    if (actionId === 'b_revive' && this.players[targetPlayerId]?.noReviveFloor===this.floor) return {success:false,message:'此角色本層不能甦生'};
    if (player.stunnedNextTurn) return { success: false, message: '你處於脫力虛脫中，本回合無法行動' };
    if (player.isSurrendered) return { success: false, message: '你陷入暗影魔狼族長的血脈壓制臣服狀態，無法行動！' };
    if (player.druidForm === 'tree') return { success: false, message: '你化身為古樹休眠中，本回合無法行動！' };

    const isLeaderAction = ['leader_assassin_execute', 'onm_all_talismans', 'dru_form_wolf', 'dru_form_treant'].includes(actionId);
    if (isLeaderAction) {
      if (socketId !== this.getEffectiveLeaderId()) {
        return { success: false, message: '只有當前具備資格的隊長能使用隊長技！' };
      }
      if (this.leaderSkillUsedThisBattle) {
        return { success: false, message: '每場戰鬥隊長技只能使用一次！' };
      }
      if ((actionId === 'dru_form_wolf' || actionId === 'dru_form_treant') && player.druidFormTurns > 0) {
        return { success: false, message: '當前形態轉變仍在持續中，結束後方可再次變身！' };
      }
    }

    if (actionId !== 'skip' && actionId !== 'use_item_healing_potion' && actionId !== 'use_item_antidote' && !isLeaderAction) {
      const availableSkills = getPlayerSkills(player);
      if (actionId === 'b_revive') {
        if(player.role!=='bard')return {success:false,message:'此職業不能使用甦生之歌'};
        const deadPlayers = this.getCombatPlayers().filter(p => p.hp <= 0);
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
    } else if (actionId === 'use_item_healing_potion') {
      const hasPotion = (player.bag || []).some(i => i && (i.effectType === 'HEALING_POTION' || i.id === 'consumable_healing_potion')) || (this.squadInventory || []).some(i => i && (i.effectType === 'HEALING_POTION' || i.id === 'consumable_healing_potion'));
      if (!hasPotion) return { success: false, message: '背包中無治療藥！' };
      if (!targetPlayerId) targetPlayerId = player.id;
    } else if (actionId === 'use_item_antidote') {
      const hasAntidote = (player.bag || []).some(i => i && (i.effectType === 'ANTIDOTE' || i.id === 'consumable_antidote')) || (this.squadInventory || []).some(i => i && (i.effectType === 'ANTIDOTE' || i.id === 'consumable_antidote'));
      if (!hasAntidote) return { success: false, message: '背包中無解毒藥！' };
      if (!targetPlayerId) targetPlayerId = player.id;
    }

    if (actionId === 'skip') {
      const hasCrossbow = (player.equips || []).some(e => e.id === 'a_crossbow' || e.name === '改良型重弩');
      if (player.role === 'archer' && hasCrossbow && player.ammo && player.ammo.length > 0) {
        player.ammo = [];
      }
    }

    // If caller passed an enemy instanceId as targetPlayerId (or explicit targetEnemyId), store it on player.targetEnemyId
    let resolvedEnemyId = targetEnemyId || player.targetEnemyId || null;
    if (!targetEnemyId && targetPlayerId && isEnemyTargetId(targetPlayerId) && actionId !== 'dw_butterfly') {
      resolvedEnemyId = targetPlayerId === 'monster' ? (this.getPrimaryEnemy()?.instanceId || 'enemy_0') : targetPlayerId;
      targetPlayerId = null;
    } else if (actionId === 'dw_butterfly' && isEnemyTargetId(targetPlayerId)) {
      if (targetPlayerId !== 'monster') resolvedEnemyId = targetPlayerId;
      targetPlayerId = 'monster';
    }

    const activeArena=this.arena || this.enemyArena;
    if(activeArena?.enemyId)resolvedEnemyId=activeArena.enemyId;
    player.action = actionId;
    player.targetPlayerId = targetPlayerId;
    player.targetEnemyId = resolvedEnemyId;
    player.isLocked = true;
    // Completion broadcasts RESOLVING; avoid a second full snapshot.
    if (!this.checkTurnCompletion()) this.broadcastState();
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
    if (!this.isStageParticipant(socketId) || !this.players[socketId]?.connected) return { success: false, message: '你不在本階段參戰名單中或已離線' };
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
  submitAction(socketId, actionId, targetPlayerId = null, targetEnemyId = null) {
    return this.lockAction(socketId, actionId, targetPlayerId, targetEnemyId);
  }

  // 檢查是否全體存活玩家皆已鎖定
  checkTurnCompletion() {
    if (this.selectionState !== 'SELECTING' || this.isWaitingForSelectionReady) return;

    const livingPlayers = this.getCombatPlayers().filter(p => p.hp > 0 && p.connected && !p.stunnedNextTurn && !p.isSurrendered && p.druidForm !== 'tree');
    const allDone = this.getCombatPlayers().some(p => p.hp > 0 && p.connected) && livingPlayers.every(p => p.isLocked === true);

    if (allDone) {
      this.clearTimer();
      this.selectionState = 'RESOLVING';
      this.isNarrating = true;
      this.broadcastState();
      // 稍微延遲 300ms 讓畫面呈現 ALL PLAYERS LOCKED，再展開結算
      setTimeout(() => { if (this.state === 'IN_BATTLE' && this.selectionState === 'RESOLVING') this.resolveTurnActions(); }, 300);
      return true;
    }
  }

  // 擊敗怪物勝利結算
  handleMonsterVictory(monster = this.currentMonster, log = [], visualEvents = [], skipEmit = false) {
    this.clearZanshin();
    this.clearTimer();
    this.clearAugurBattleDebts();
    this.isNarrating = false;
    this.timerCallback = null;
    this.pausedRemainingSeconds = null;
    // 勝負判定：若敵方我方同時血量歸零，優先結算我方血量（判定為敵方勝利）
    const alivePlayers = Object.values(this.players).filter(p => p.hp > 0);
    if (alivePlayers.length === 0) {
      log.push({ text: `⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**`, type: 'damage' });
      log.forEach(l => this.addLog(l.text, l.type));
      if (!skipEmit) {
        this.emitPublic('battle:visual_events', { events: visualEvents, round: this.battleRound, monsterKilled: true });
      }
      this.handleGameOver();
      return;
    }

    if (!monster) return;
    this.career?.finish(this, true);
    this.p8ExitArena();
    const victoryBefore = this.getHpSnapshot();
    this.enemyArena=null;
    for(const p of Object.values(this.players)){p.enemyEffects={};p.warriorStacks=0;p.p8Effects={};p.p8Shields=[];p.tempHp=0;p.temporaryOverheal=0;if(p.role==='gladiator'){p.rage=0;p.gladiatorInspiration=[];p.gladiatorChallenge=null;}}
    monster.hp = 0;
    const col = this.currentHex?.col || this.floor || 1;
    const isGladiatorCaptain = this.getEffectiveLeaderRole() === 'gladiator';
    const defeatedList = (Array.isArray(this.enemies) && this.enemies.length > 0) ? this.enemies : [monster];
    const goldGain = calculateBattleGold(defeatedList, col, isGladiatorCaptain);
    const hasElite = defeatedList.some(e => e.isElite || e.isAbyssBoss || e.isEndElite);
    if (hasElite && isGladiatorCaptain) {
      log.push({ text: `⚔️ 【榮耀號角】角鬥士隊長引領勝利，精英怪金幣掉落 +30%（獲得 ${goldGain} 金幣）！`, type: 'loot' });
    } else {
      log.push({ text: `💰 戰鬥勝利！小隊獲得了 ${goldGain} 金幣！`, type: 'loot' });
    }
    this.gold = (this.gold || 0) + goldGain;
    log.push({ text: `🎉 **${monster.name} 倒下了！小隊成功突破第 ${this.floor} 層！**`, type: 'loot' });

    for (const p of Object.values(this.players)) {
      p.stunnedNextTurn = false;
      p.isSurrendered = false;
      if (p.druidForm === 'treant' || p.druidForm === 'tree') {
        // Treant grants shield; maximum HP remains unchanged.
        p.hp = Math.min(p.hp, p.maxHp);
      }
      if (p.druidForm === 'werewolf' && p.werewolfMaxHpDeducted) {
        p.maxHp += p.werewolfMaxHpDeducted;
        p.werewolfMaxHpDeducted = 0;
      }
      restoreBearForm(p);
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

    this.alcVulnerableTurns = 0;
    this.alcVulnerableNextTurn = false;

    for (const p of Object.values(this.players)) { p.critTowardStealth = 0; p.isHiddenThisRound = false; p.followUpsThisRound = 0; p.stealthBrokenThisRound = false; }
    const recoveryBefore = this.getHpSnapshot();
    for (const p of Object.values(this.players)) {
      p.maxHp += 10;
      p.bonusAtk += 5;
      p.victoryAtkBonus = (p.victoryAtkBonus || 0) + 5;
      if (p.hp > 0) {
        p.hp = Math.min(p.maxHp, p.hp);
        log.push({ text: `💪 **${p.name}** 獲得戰鬥歷練：HP上限 +10、攻擊力 +5（❤️ 當前生命: ${p.hp}/${p.maxHp}）`, type: 'info' });
      } else {
        p.hp = 0;
        log.push({ text: `💪 **${p.name}** 雖已倒下，仍獲得戰鬥歷練：HP上限 +10、攻擊力 +5（HP 維持 0，待後續甦生）`, type: 'info' });
      }
    }

    // 戰鬥成功只會拿到一階裝備，有 50% 機率只拿到金幣
    const onlyGold = Math.random() < 0.50;
    let drop = null;
    let deposit = null;
    let targetDesc = '';
    const recoveredLoot = [];
    if (monster.isMimic) {
      for (const enemy of this.enemies.filter(e => e.isMimic)) {
        const stolen = enemy.stolenLoot || {gold:0,equipment:[]};
        this.gold += stolen.gold;
        if(stolen.gold>0)recoveredLoot.push({kind:'gold',amount:stolen.gold,sourceEnemyId:enemy.instanceId,destination:'bag'});
        for (const {ownerId,slot,item} of stolen.equipment) {
          const owner = this.players[ownerId];
          let destination='bag';
          if (owner && !owner.equipSlots?.[slot]) {
            owner.equipSlots ||= {};
            owner.equipSlots[slot] = item;
            const wasDown = owner.hp <= 0;
            applyEquipStats(owner,item);
            if (wasDown) owner.hp = 0;
            this.syncPlayerEquips(owner);
            destination='character';
          } else this.autoDepositLoot(item,ownerId);
          recoveredLoot.push({kind:'equipment',ownerId,targetName:owner?.name||'',slot,sourceEnemyId:enemy.instanceId,destination,
            item:{id:item.id,name:item.name,icon:item.icon||null,role:item.role||null,slot:item.slot||slot,tier:item.tier}});
          log.push({text:`🎒 奪回【${item.name}】，已歸還原主或收納背包！`,type:'loot'});
        }
        if (stolen.gold) log.push({text:`💰 奪回被偷走的 ${stolen.gold} 枚小隊金幣！`,type:'loot'});
        if (enemy.chestTreasure) {
          this.gold += enemy.chestTreasure.gold;
          drop = enemy.chestTreasure.drop;
          deposit = this.autoDepositLoot(drop);
          log.push({text:`🎁 擊敗奇怪的寶箱！取得箱內原有的【${drop.name}】與 ${enemy.chestTreasure.gold} 枚金幣！`,type:'loot'});
        }
        enemy.stolenLoot = {gold:0,equipment:[]};
        enemy.chestTreasure = null;
      }
    } else if (this.merchantLootPool && this.merchantLootPool.length > 0) {
      // 奸商專屬戰利品：隨機獲得一件他商店中的商品(包括專屬裝備)
      const chosen = this.merchantLootPool[Math.floor(Math.random() * this.merchantLootPool.length)];
      drop = structuredClone(chosen);
      delete drop.price;
      delete drop.sold;
      delete drop.shopConsumableId;
      deposit = this.autoDepositLoot(drop);
      targetDesc = deposit?.target === 'squad' ? '小隊背包' : (deposit?.target === 'personal' ? '個人行囊' : '溢出暫存區');
      log.push({ text: `🎁 **【戰勝奸商！起獲贓物】** 小隊搜查了奸商的攤位，起獲了【${drop.name}】（${drop.desc}），已自動收納入${targetDesc}！`, type: 'loot' });
      this.merchantLootPool = null;
    } else if (monster.isShadyMerchant) {
      const pool = [...TIER1_EQUIPMENTS, ...TIER2_EQUIPMENTS];
      drop = structuredClone(pool[Math.floor(Math.random() * pool.length)]);
      deposit = this.autoDepositLoot(drop);
      targetDesc = deposit?.target === 'squad' ? '小隊背包' : (deposit?.target === 'personal' ? '個人行囊' : '溢出暫存區');
      log.push({ text: `🎁 **【戰勝奸商！起獲贓物】** 小隊搜查了奸商的攤位，起獲了【${drop.name}】（${drop.desc}），已自動收納入${targetDesc}！`, type: 'loot' });
    } else if (!onlyGold) {
      const smallEquipPool = TIER1_EQUIPMENTS;
      drop = structuredClone(smallEquipPool[Math.floor(Math.random() * smallEquipPool.length)]);
      deposit = this.autoDepositLoot(drop);
      targetDesc = deposit?.target === 'squad' ? '小隊背包' : (deposit?.target === 'personal' ? '個人行囊' : '溢出暫存區');
      log.push({ text: `🎁 **【戰利品掉落】獲得一階裝備：【${drop.name}】**（${drop.desc}），已自動收納入${targetDesc}！`, type: 'loot' });
    } else {
      log.push({ text: `💰 本次戰鬥小隊搜刮完畢，僅獲得金幣，未發現額外裝備！`, type: 'loot' });
    }

    this.pendingDrop = null;
    this.victoryPendingDrop = null;

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
      drop, depositTarget: deposit?.target || null, discarded: false, ownerName: targetDesc,
      goldGain, recoveredLoot,
      recoveryRule: 'HP 上限 +10、ATK +5' };
    this.victoryPendingDrop = null;
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
    this.pendingDrop = null;
    this.victoryPendingDrop = null;
    this.broadcastState();
  }

  continueAfterVictory(socketId, presentationId) {
    if (this.state !== 'BATTLE_VICTORY' || socketId !== this.leaderId ||
        presentationId !== this.currentVictory?.presentationId || !this.victoryInteractionReady) return;
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
        this.addLog(`🛡️ **${player.name}** 穿上了【${drop.name}】！(${formatPlayerEquips(player)})`, 'loot');
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
  handleUnequip(socketId, equipIndexOrSlot) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (typeof equipIndexOrSlot === 'string') {
      return this.unequipItemToBag(socketId, equipIndexOrSlot);
    }
    const equipIndex = equipIndexOrSlot;
    if (!player.equips || equipIndex < 0 || equipIndex >= player.equips.length) {
      return { success: false, message: '無效的裝備欄位' };
    }

    const item = player.equips[equipIndex];
    const slot = Object.keys(player.equipSlots || {}).find(key => player.equipSlots[key] === item);
    return slot ? this.unequipItemToBag(socketId, slot) : {success:false,message:'裝備欄位不同步，無法卸下'};
  }

  // ==========================================
  // Module 3 & 4：雙層背包、裝備欄位與合成系統
  // ==========================================

  syncPlayerEquips(player) {
    if (!player) return;
    if (!player.equipSlots) {
      player.equipSlots = { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null };
    }
    player.equips = Object.values(player.equipSlots).filter(Boolean);
    player.equipCounts = {};
    for (const eq of player.equips) {
      player.equipCounts[eq.name] = (player.equipCounts[eq.name] || 0) + 1;
    }
    this.p8RefreshEquipment();
  }

  // Slots may contain holes after drag/drop; never append past the visible capacity.
  findEmptyInventorySlot(items, capacity) {
    for (let index = 0; index < capacity; index++) {
      if (!items[index]) return index;
    }
    return -1;
  }

  addItemPrioritySquad(item, preferredPlayerId = null) {
    if (!item) return false;
    if (!item.droppedAtCol) {
      item.droppedAtCol = this.currentHex?.col || this.floor || 1;
    }
    if (!item.basePrice) {
      item.basePrice = getItemBasePrice(item);
    }
    if (!Array.isArray(this.squadInventory)) this.squadInventory = [];
    const squadIndex = this.findEmptyInventorySlot(this.squadInventory, 19);
    if (squadIndex !== -1) {
      this.squadInventory[squadIndex] = item;
      return { target: 'squad', index: squadIndex };
    }
    // 小隊背包已滿（19格），退而求其次放入個人背包（4格）
    if (preferredPlayerId && this.players[preferredPlayerId]) {
      const p = this.players[preferredPlayerId];
      if (!Array.isArray(p.bag)) p.bag = [];
      const bagIndex = this.findEmptyInventorySlot(p.bag, 4);
      if (bagIndex !== -1) {
        p.bag[bagIndex] = item;
        return { target: 'personal', playerId: preferredPlayerId, index: bagIndex };
      }
    }
    for (const p of Object.values(this.players)) {
      if (!Array.isArray(p.bag)) p.bag = [];
      const bagIndex = this.findEmptyInventorySlot(p.bag, 4);
      if (bagIndex !== -1) {
        p.bag[bagIndex] = item;
        return { target: 'personal', playerId: p.id, index: bagIndex };
      }
    }
    return false;
  }

  autoDepositLoot(item, preferredPlayerId = null) {
    if (!item) return null;
    let res = this.addItemPrioritySquad(item, preferredPlayerId);
    if (!res) {
      if (!Array.isArray(this.overflowItems)) this.overflowItems = [];
      this.overflowItems.push(item);
      res = { target: 'overflow', index: this.overflowItems.length - 1 };
    }
    return res;
  }

  transferToSquad(socketId, bagIndex) {
    if (this.state === 'IN_BATTLE') {
      return { success: false, message: '戰鬥中無法轉移裝備！' };
    }
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (!Array.isArray(player.bag) || bagIndex < 0 || bagIndex >= player.bag.length) {
      return { success: false, message: '無效的背包物品索引' };
    }
    if (!player.bag[bagIndex]) return { success: false, message: '該欄位沒有物品' };
    if (!Array.isArray(this.squadInventory)) this.squadInventory = [];
    if (this.findEmptyInventorySlot(this.squadInventory, 19) === -1) {
      return { success: false, message: '小隊背包已滿（上限 19 格）！' };
    }
    const item = player.bag.splice(bagIndex, 1)[0];
    this.squadInventory[this.findEmptyInventorySlot(this.squadInventory, 19)] = item;
    this.addLog(`📦 **${player.name}** 將【${item.name}】轉移至小隊背包。`, 'info');
    this.broadcastState();
    return { success: true, item };
  }

  transferToPersonal(socketId, squadIndex) {
    if (this.state === 'IN_BATTLE') {
      return { success: false, message: '戰鬥中無法轉移裝備！' };
    }
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (!Array.isArray(this.squadInventory) || squadIndex < 0 || squadIndex >= this.squadInventory.length) {
      return { success: false, message: '無效的小隊背包索引' };
    }
    if (!this.squadInventory[squadIndex]) return { success: false, message: '該欄位沒有物品' };
    if (!Array.isArray(player.bag)) player.bag = [];
    if (this.findEmptyInventorySlot(player.bag, 4) === -1) {
      return { success: false, message: '個人背包已滿（上限 4 格）！' };
    }
    const item = this.squadInventory.splice(squadIndex, 1)[0];
    player.bag[this.findEmptyInventorySlot(player.bag, 4)] = item;
    this.addLog(`📦 **${player.name}** 從小隊背包領取了【${item.name}】至個人背包。`, 'info');
    this.broadcastState();
    return { success: true, item };
  }

  equipItemFromBag(socketId, bagIndex, preferredSlot = null) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (!Array.isArray(player.bag) || bagIndex < 0 || bagIndex >= player.bag.length) {
      return { success: false, message: '無效的背包物品索引' };
    }
    const item = player.bag[bagIndex];
    if (!item) return { success: false, message: '該格子無物品' };

    const slotNames = {
      WEAPON: '武器',
      ARMOR: '裝備(防具)',
      ACCESSORY: '飾品',
      CLASS_EXCLUSIVE: '職業專屬'
    };

    if (item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE' || item.effectType) {
      return { success: false, message: '裝備與欄位不符！消耗品無法穿戴至裝備欄位。' };
    }

    const requiredSlot = determineEquipSlot(item);
    if (preferredSlot && preferredSlot !== requiredSlot) {
      const reqName = slotNames[requiredSlot] || requiredSlot;
      const targetName = slotNames[preferredSlot] || preferredSlot;
      return { success: false, message: `裝備與欄位不符！此裝備為【${reqName}】，無法穿戴在【${targetName}】欄位。` };
    }
    const targetSlot = requiredSlot;

    if (targetSlot === 'CLASS_EXCLUSIVE' && item.role && player.role && item.role !== player.role) {
      return { success: false, message: `此裝備為【${item.role}】專屬裝備，非本職業（${player.role}）無法穿戴！` };
    }

    if (!canPlayerEquipItem(player, item)) {
      return { success: false, message: '此特殊裝備不可重複穿戴！' };
    }
    if (!player.equipSlots) {
      player.equipSlots = { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null };
    }

    const oldItem = player.equipSlots[targetSlot];

    if (oldItem) {
      removeEquipStats(player, oldItem);
      player.bag[bagIndex] = oldItem;
      this.addLog(`🔄 **${player.name}** 換下了【${oldItem.name}】。`, 'loot');
    } else {
      player.bag.splice(bagIndex, 1);
    }

    player.equipSlots[targetSlot] = item;
    applyEquipStats(player, item);
    this.syncPlayerEquips(player);

    this.addLog(`🛡️ **${player.name}** 裝備了【${item.name}】於【${slotNames[targetSlot] || targetSlot}】欄位！`, 'loot');
    this.broadcastState();
    return { success: true, equippedSlot: targetSlot, item };
  }

  equipItemFromSquad(socketId, squadIndex, preferredSlot = null) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (!Array.isArray(this.squadInventory) || squadIndex < 0 || squadIndex >= this.squadInventory.length) {
      return { success: false, message: '無效的小隊背包物品' };
    }
    const item = this.squadInventory[squadIndex];
    if (!item) return { success: false, message: '格子無物品' };

    const slotNames = {
      WEAPON: '武器',
      ARMOR: '裝備(防具)',
      ACCESSORY: '飾品',
      CLASS_EXCLUSIVE: '職業專屬'
    };

    if (item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE' || item.effectType) {
      return { success: false, message: '裝備與欄位不符！消耗品無法穿戴至裝備欄位。' };
    }

    const requiredSlot = determineEquipSlot(item);
    if (preferredSlot && preferredSlot !== requiredSlot) {
      const reqName = slotNames[requiredSlot] || requiredSlot;
      const targetName = slotNames[preferredSlot] || preferredSlot;
      return { success: false, message: `裝備與欄位不符！此裝備為【${reqName}】，無法穿戴在【${targetName}】欄位。` };
    }
    const targetSlot = requiredSlot;

    if (targetSlot === 'CLASS_EXCLUSIVE' && item.role && player.role && item.role !== player.role) {
      return { success: false, message: `此裝備為【${item.role}】專屬裝備，非本職業（${player.role}）無法穿戴！` };
    }

    if (!canPlayerEquipItem(player, item)) {
      return { success: false, message: '此特殊裝備不可重複穿戴！' };
    }
    if (!player.equipSlots) {
      player.equipSlots = { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null };
    }
    const oldItem = player.equipSlots[targetSlot];
    if (oldItem) {
      removeEquipStats(player, oldItem);
      this.squadInventory[squadIndex] = oldItem;
      this.addLog(`🔄 **${player.name}** 換下了【${oldItem.name}】放回小隊背包。`, 'loot');
    } else {
      this.squadInventory.splice(squadIndex, 1);
    }
    player.equipSlots[targetSlot] = item;
    applyEquipStats(player, item);
    this.syncPlayerEquips(player);
    this.addLog(`🛡️ **${player.name}** 從小隊背包裝備了【${item.name}】於【${slotNames[targetSlot] || targetSlot}】欄位！`, 'loot');
    this.broadcastState();
    return { success: true, equippedSlot: targetSlot, item };
  }

  swapInventorySlots(socketId, { fromArea, fromIndex, toArea, toIndex }) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (!Array.isArray(player.bag)) player.bag = [];
    if (!Array.isArray(this.squadInventory)) this.squadInventory = [];

    // 0. 裝備欄與其他欄位交換
    if (fromArea === 'EQUIP' && toArea === 'EQUIP') {
      return { success: false, message: '裝備與欄位不符！無法在不同類型的裝備欄位之間交換。' };
    }
    if (fromArea === 'EQUIP' && toArea === 'PERSONAL') {
      return this.unequipItemToBag(socketId, fromIndex, toIndex);
    }
    if (fromArea === 'EQUIP' && toArea === 'SQUAD') {
      return this.unequipItemToSquad(socketId, fromIndex, toIndex);
    }
    if (fromArea === 'PERSONAL' && toArea === 'EQUIP') {
      return this.equipItemFromBag(socketId, fromIndex, toIndex);
    }
    if (fromArea === 'SQUAD' && toArea === 'EQUIP') {
      return this.equipItemFromSquad(socketId, fromIndex, toIndex);
    }

    // 1. 個人背包內拖曳重排
    if (fromArea === 'PERSONAL' && toArea === 'PERSONAL') {
      if (fromIndex < 0 || fromIndex >= 4 || toIndex < 0 || toIndex >= 4 || fromIndex === toIndex) {
        return { success: false, message: '無效的背包格子' };
      }
      const itemFrom = player.bag[fromIndex] || null;
      const itemTo = player.bag[toIndex] || null;
      player.bag[fromIndex] = itemTo;
      player.bag[toIndex] = itemFrom;
      while (player.bag.length > 0 && player.bag[player.bag.length - 1] === null) player.bag.pop();
      this.broadcastState();
      return { success: true };
    }

    // 2. 小隊背包內拖曳重排
    if (fromArea === 'SQUAD' && toArea === 'SQUAD') {
      if (fromIndex < 0 || fromIndex >= 19 || toIndex < 0 || toIndex >= 19 || fromIndex === toIndex) {
        return { success: false, message: '無效的小隊背包格子' };
      }
      const itemFrom = this.squadInventory[fromIndex] || null;
      const itemTo = this.squadInventory[toIndex] || null;
      this.squadInventory[fromIndex] = itemTo;
      this.squadInventory[toIndex] = itemFrom;
      while (this.squadInventory.length > 0 && this.squadInventory[this.squadInventory.length - 1] === null) this.squadInventory.pop();
      this.broadcastState();
      return { success: true };
    }

    // 3. 個人背包 -> 小隊背包
    if (fromArea === 'PERSONAL' && toArea === 'SQUAD') {
      const item = player.bag[fromIndex];
      if (!item) return { success: false, message: '個人背包該位置無物品' };
      const currentSquadCount = this.squadInventory.filter(Boolean).length;
      if (currentSquadCount >= 19 && !this.squadInventory[toIndex]) {
        return { success: false, message: '小隊背包已滿！' };
      }
      const squadTargetItem = this.squadInventory[toIndex] || null;
      player.bag[fromIndex] = squadTargetItem;
      this.squadInventory[toIndex] = item;
      while (player.bag.length > 0 && player.bag[player.bag.length - 1] === null) player.bag.pop();
      while (this.squadInventory.length > 0 && this.squadInventory[this.squadInventory.length - 1] === null) this.squadInventory.pop();
      this.broadcastState();
      return { success: true };
    }

    // 4. 小隊背包 -> 個人背包
    if (fromArea === 'SQUAD' && toArea === 'PERSONAL') {
      const item = this.squadInventory[fromIndex];
      if (!item) return { success: false, message: '小隊背包該位置無物品' };
      const currentBagCount = player.bag.filter(Boolean).length;
      if (currentBagCount >= 4 && !player.bag[toIndex]) {
        return { success: false, message: '個人隨身背包已滿！' };
      }
      const personalTargetItem = player.bag[toIndex] || null;
      this.squadInventory[fromIndex] = personalTargetItem;
      player.bag[toIndex] = item;
      while (player.bag.length > 0 && player.bag[player.bag.length - 1] === null) player.bag.pop();
      while (this.squadInventory.length > 0 && this.squadInventory[this.squadInventory.length - 1] === null) this.squadInventory.pop();
      this.broadcastState();
      return { success: true };
    }

    return { success: false, message: '不支援的拖曳操作' };
  }

  unequipItemToBag(socketId, slotKey, targetBagIndex = null) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (!player.equipSlots || !player.equipSlots[slotKey]) {
      return { success: false, message: '該欄位無裝備' };
    }
    const item = player.equipSlots[slotKey];
    if (!Array.isArray(player.bag)) player.bag = [];

    const slotNames = {
      WEAPON: '武器',
      ARMOR: '裝備(防具)',
      ACCESSORY: '飾品',
      CLASS_EXCLUSIVE: '職業專屬'
    };

    // 若指定了目標格子且格子內已有物品，執行安全交換 (Swap)
    if (targetBagIndex !== null && targetBagIndex >= 0 && targetBagIndex < 4) {
      const targetItem = player.bag[targetBagIndex];
      if (targetItem) {
        if (targetItem.type === 'CONSUMABLE' || targetItem.slot === 'CONSUMABLE' || targetItem.effectType) {
          return { success: false, message: '裝備與欄位不符！消耗品無法穿戴至裝備欄位。' };
        }
        const reqSlot = determineEquipSlot(targetItem);
        if (reqSlot !== slotKey) {
          const reqName = slotNames[reqSlot] || reqSlot;
          const targetName = slotNames[slotKey] || slotKey;
          return { success: false, message: `裝備與欄位不符！【${targetItem.name}】為【${reqName}】，無法穿戴在【${targetName}】欄位。` };
        }
        if (slotKey === 'CLASS_EXCLUSIVE' && targetItem.role && player.role && targetItem.role !== player.role) {
          return { success: false, message: `此裝備為【${targetItem.role}】專屬裝備，非本職業（${player.role}）無法穿戴！` };
        }
        if (!canPlayerEquipItem(player, targetItem)) {
          return { success: false, message: '此特殊裝備不可重複穿戴！' };
        }

        // 執行安全交換
        removeEquipStats(player, item);
        applyEquipStats(player, targetItem);
        player.equipSlots[slotKey] = targetItem;
        player.bag[targetBagIndex] = item;
        this.syncPlayerEquips(player);

        this.addLog(`🔄 **${player.name}** 交換了【${item.name}】與個人背包的【${targetItem.name}】！`, 'loot');
        this.broadcastState();
        return { success: true, item, swappedItem: targetItem };
      }
    }

    // 目標格為空格或未指定時的正常卸下
    const currentBagCount = player.bag.filter(Boolean).length;
    if (currentBagCount >= 4 && (targetBagIndex === null || !player.bag[targetBagIndex])) {
      return { success: false, message: '個人背包已滿（上限 4 格）！' };
    }

    player.equipSlots[slotKey] = null;
    removeEquipStats(player, item);
    if (targetBagIndex !== null && targetBagIndex >= 0 && targetBagIndex < 4) {
      player.bag[targetBagIndex] = item;
    } else {
      const emptyIdx = this.findEmptyInventorySlot(player.bag, 4);
      if (emptyIdx !== -1) {
        player.bag[emptyIdx] = item;
      } else {
        player.bag.push(item);
      }
    }
    this.syncPlayerEquips(player);

    this.addLog(`📦 **${player.name}** 卸下了【${item.name}】並收回個人背包。`, 'info');
    this.broadcastState();
    return { success: true, item };
  }

  unequipItemToSquad(socketId, slotKey, targetSquadIndex = null) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (!player.equipSlots || !player.equipSlots[slotKey]) {
      return { success: false, message: '該欄位無裝備' };
    }
    const item = player.equipSlots[slotKey];
    if (!Array.isArray(this.squadInventory)) this.squadInventory = [];

    const slotNames = {
      WEAPON: '武器',
      ARMOR: '裝備(防具)',
      ACCESSORY: '飾品',
      CLASS_EXCLUSIVE: '職業專屬'
    };

    // 若指定了目標小隊格子且格子內已有物品，執行安全交換 (Swap)
    if (targetSquadIndex !== null && targetSquadIndex >= 0 && targetSquadIndex < 19) {
      const targetItem = this.squadInventory[targetSquadIndex];
      if (targetItem) {
        if (targetItem.type === 'CONSUMABLE' || targetItem.slot === 'CONSUMABLE' || targetItem.effectType) {
          return { success: false, message: '裝備與欄位不符！消耗品無法穿戴至裝備欄位。' };
        }
        const reqSlot = determineEquipSlot(targetItem);
        if (reqSlot !== slotKey) {
          const reqName = slotNames[reqSlot] || reqSlot;
          const targetName = slotNames[slotKey] || slotKey;
          return { success: false, message: `裝備與欄位不符！【${targetItem.name}】為【${reqName}】，無法穿戴在【${targetName}】欄位。` };
        }
        if (slotKey === 'CLASS_EXCLUSIVE' && targetItem.role && player.role && targetItem.role !== player.role) {
          return { success: false, message: `此裝備為【${targetItem.role}】專屬裝備，非本職業（${player.role}）無法穿戴！` };
        }
        if (!canPlayerEquipItem(player, targetItem)) {
          return { success: false, message: '此特殊裝備不可重複穿戴！' };
        }

        // 執行安全交換
        removeEquipStats(player, item);
        applyEquipStats(player, targetItem);
        player.equipSlots[slotKey] = targetItem;
        this.squadInventory[targetSquadIndex] = item;
        this.syncPlayerEquips(player);

        this.addLog(`🔄 **${player.name}** 交換了【${item.name}】與小隊背包的【${targetItem.name}】！`, 'loot');
        this.broadcastState();
        return { success: true, item, swappedItem: targetItem };
      }
    }

    // 目標格為空格或未指定時的正常卸下
    const currentSquadCount = this.squadInventory.filter(Boolean).length;
    if (currentSquadCount >= 19 && (targetSquadIndex === null || !this.squadInventory[targetSquadIndex])) {
      return { success: false, message: '小隊背包已滿（上限 19 格）！' };
    }

    player.equipSlots[slotKey] = null;
    removeEquipStats(player, item);
    if (targetSquadIndex !== null && targetSquadIndex >= 0 && targetSquadIndex < 19) {
      this.squadInventory[targetSquadIndex] = item;
    } else {
      const emptyIdx = this.findEmptyInventorySlot(this.squadInventory, 19);
      if (emptyIdx !== -1) {
        this.squadInventory[emptyIdx] = item;
      } else {
        this.squadInventory.push(item);
      }
    }
    this.syncPlayerEquips(player);

    this.addLog(`📦 **${player.name}** 卸下了【${item.name}】並存入小隊背包。`, 'info');
    this.broadcastState();
    return { success: true, item };
  }

  craftEquipment(socketId, item1Id, item2Id, fromSquad = true) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    const recipe = getCraftingRecipe(item1Id, item2Id);
    if (!recipe) return { success: false, message: '無效的合成配方！' };

    const container = fromSquad ? this.squadInventory : player.bag;
    if (!Array.isArray(container)) return { success: false, message: '背包不存在' };

    const idx1 = container.findIndex(e => e && e.id === item1Id);
    const idx2 = container.findIndex((e, i) => e && e.id === item2Id && i !== idx1);
    if (idx1 === -1 || idx2 === -1) {
      return { success: false, message: '缺少合成材料！' };
    }

    const resultTmpl = TIER2_EQUIPMENTS.find(e => e.id === recipe.resultId) || findItemTemplate(recipe.resultId);
    if (!resultTmpl) return { success: false, message: '找不到目標裝備！' };

    // 煉金術士隊長特質：30% 機率保留其中一件材料或產出 20 金幣
    const leaderRole = this.getEffectiveLeaderRole();
    let retainMaterial = false;
    let extraGoldBonus = false;
    if (leaderRole === 'alchemist' && Math.random() < 0.30) {
      if (Math.random() < 0.50) {
        retainMaterial = true;
      } else {
        extraGoldBonus = true;
        this.gold = (this.gold || 0) + 20;
      }
    }

    if (retainMaterial) {
      container.splice(idx1, 1);
      this.addLog('⚗️ 【戰地調配】煉金術士隊長特質觸發：合成時成功保留了一件材料！', 'buff');
    } else {
      const maxIdx = Math.max(idx1, idx2);
      const minIdx = Math.min(idx1, idx2);
      container.splice(maxIdx, 1);
      container.splice(minIdx, 1);
      if (extraGoldBonus) {
        this.addLog('⚗️ 【戰地調配】煉金術士隊長特質觸發：合成時額外產出 20 金幣！', 'buff');
      }
    }

    const newItem = structuredClone(resultTmpl);
    container.push(newItem);
    this.addLog(`🔨 **${player.name}** 成功合成了 **【${newItem.name}】**！(${recipe.desc})`, 'loot');
    this.broadcastState();
    return { success: true, item: newItem };
  }

  // 商店事件 (Module 4)
  grantAlchemistPotion(p, log, visualEvents, sourceActionName = '技能') {
    if (p.role !== 'alchemist') return;
    const procRate = (this.getEffectiveLeaderRole() === 'alchemist') ? 0.40 : 0.15;
    if (Math.random() >= procRate) return;
    const potion = structuredClone(findItemTemplate('consumable_healing_potion') || CONSUMABLES.find(c => c.id === 'consumable_healing_potion'));
    if (!potion) return;
    if (!Array.isArray(p.bag)) p.bag = [];
    const emptyIdx = this.findEmptyInventorySlot(p.bag, 4);
    if (emptyIdx !== -1) {
      p.bag[emptyIdx] = potion;
      log.push({ text: `⚗️✨ **${p.name}** 施展【${sourceActionName}】時催化出精純藥液，隨身背包獲得了一瓶【治療藥】！`, type: 'loot' });
      visualEvents.push({ type: 'player_buff', sourceId: p.id, targetId: p.id, label: '調配治療藥' });
    } else {
      log.push({ text: `⚗️ **${p.name}** 調配出了一瓶【治療藥】，但個人背包已滿，藥水已丟棄！`, type: 'warning' });
    }
  }

  handleShopEvent(hexNode) {
    this.clearTimer();
    this.state = 'EVENT';
    const isShady = typeof hexNode === 'boolean' ? hexNode : Boolean(hexNode?.isShadyMerchant);
    const isPrepShop = Boolean(hexNode?.isPrepShop);
    const col = hexNode?.col ?? (isPrepShop ? 1 : (this.currentHex?.col ?? 1));
    const leaderRole = this.getEffectiveLeaderRole();
    const isAssassinCaptain = leaderRole === 'assassin';

    // 回收率與售價倍率計算
    // 一般商店：商品售價 100% basePrice，回收 50% ~ 60%
    // 奸商模式：商品售價 150% ~ 200% basePrice，回收 10% ~ 20%
    const recycleRate = isShady
      ? (Math.round((0.10 + Math.random() * 0.10) * 100) / 100)
      : (Math.round((0.50 + Math.random() * 0.10) * 100) / 100);
    const priceMultiplier = isShady
      ? (Math.round((1.50 + Math.random() * 0.50) * 100) / 100)
      : 1.0;

    const shopSession = {
      isShady,
      shadyBuyMult: priceMultiplier,
      sellRatio: recycleRate,
      isAssassinCaptain,
      isSamuraiCaptain: (leaderRole === 'samurai')
    };

    const targetItemCount = 6;
    const items = [];
    const allowExclusive = !isPrepShop && !hexNode?.noExclusive;
    const hasExclusive = allowExclusive && (Math.random() < 0.50);

    if (hasExclusive) {
      // 50% 機率出現職業專屬裝備，基準價格為 250G
      const partyRoles = Object.values(this.players).map(p => p.role).filter(Boolean);
      const partyExclusives = LOOT_TABLE.filter(e => e.role && partyRoles.includes(e.role));
      const pool = (partyExclusives.length > 0 && Math.random() < 0.8)
        ? partyExclusives
        : LOOT_TABLE.filter(e => e.role);
      const chosen = pool[Math.floor(Math.random() * pool.length)] || LOOT_TABLE[0];
      const exclusiveItem = structuredClone(chosen);
      exclusiveItem.slot = EQUIP_SLOTS.CLASS_EXCLUSIVE;
      exclusiveItem.tier = 'CLASS_EXCLUSIVE';
      exclusiveItem.basePrice = 250;
      exclusiveItem.droppedAtCol = col;
      exclusiveItem.price = calculateShopBuyPrice(250, col, shopSession, exclusiveItem);
      items.push(exclusiveItem);
    }

    // 填補其餘項目至 6 項（通用裝備，優先不重複）
    const generalPool = isShady
      ? [...TIER2_EQUIPMENTS]
      : (col >= 5 ? [...TIER1_EQUIPMENTS, ...TIER2_EQUIPMENTS] : [...TIER1_EQUIPMENTS]);

    const shuffledGeneral = [...generalPool].sort(() => Math.random() - 0.5);
    while (items.length < targetItemCount && shuffledGeneral.length > 0) {
      const gItem = shuffledGeneral.pop();
      if (!items.some(it => it.name === gItem.name)) {
        const itemClone = structuredClone(gItem);
        const basePrice = itemClone.tier === 2 ? 120 : (itemClone.cost || 50);
        itemClone.basePrice = basePrice;
        itemClone.droppedAtCol = col;
        itemClone.price = calculateShopBuyPrice(basePrice, col, shopSession, itemClone);
        items.push(itemClone);
      }
    }
    while (items.length < targetItemCount) {
      const gItem = generalPool[Math.floor(Math.random() * generalPool.length)];
      const itemClone = structuredClone(gItem);
      const basePrice = itemClone.tier === 2 ? 120 : (itemClone.cost || 50);
      itemClone.basePrice = basePrice;
      itemClone.droppedAtCol = col;
      itemClone.price = calculateShopBuyPrice(basePrice, col, shopSession, itemClone);
      items.push(itemClone);
    }

    // 商店消耗品：恢復藥隨機 1~3 瓶，解毒劑隨機 1~3 瓶，修整帳篷 1 頂
    const consumables = [];
    const potionTmpl = CONSUMABLES.find(c => c.id === 'consumable_healing_potion' || c.effectType === 'HEALING_POTION');
    const antidoteTmpl = CONSUMABLES.find(c => c.id === 'consumable_antidote' || c.effectType === 'ANTIDOTE');
    const tentTmpl = CONSUMABLES.find(c => c.id === 'consumable_rest_tent' || c.effectType === 'REST_TENT');

    const potionCount = Math.floor(Math.random() * 3) + 1;
    const antidoteCount = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < potionCount; i++) {
      if (potionTmpl) {
        const clone = structuredClone(potionTmpl);
        const basePrice = clone.cost || clone.basePrice || 40;
        clone.basePrice = basePrice;
        clone.droppedAtCol = col;
        clone.price = calculateShopBuyPrice(basePrice, col, shopSession, clone);
        clone.shopConsumableId = `potion_${i}_${Date.now()}`;
        consumables.push(clone);
      }
    }

    for (let i = 0; i < antidoteCount; i++) {
      if (antidoteTmpl) {
        const clone = structuredClone(antidoteTmpl);
        const basePrice = clone.cost || clone.basePrice || 30;
        clone.basePrice = basePrice;
        clone.droppedAtCol = col;
        clone.price = calculateShopBuyPrice(basePrice, col, shopSession, clone);
        clone.shopConsumableId = `antidote_${i}_${Date.now()}`;
        consumables.push(clone);
      }
    }

    if (tentTmpl && !isPrepShop) {
      const clone = structuredClone(tentTmpl);
      const basePrice = clone.cost || clone.basePrice || 50;
      clone.basePrice = basePrice;
      clone.droppedAtCol = col;
      clone.price = calculateShopBuyPrice(basePrice, col, shopSession, clone);
      clone.shopConsumableId = `tent_${Date.now()}`;
      consumables.push(clone);
    }

    this.currentEvent = {
      type: 'shop',
      isShady,
      isPrepShop,
      recycleRate,
      sellRatio: recycleRate,
      priceMultiplier,
      shadyBuyMult: priceMultiplier,
      isAssassinCaptain,
      hexId: hexNode?.id,
      col,
      title: isPrepShop
        ? this.studioContent.title('event.shop.prep', '🏕️ 出發備戰據點・後勤物資處')
        : this.studioContent.title('event.shop.normal', '🛒 迷宮行商據點'),
      story: isPrepShop
        ? this.studioContent.text('event.shop.prep', '在邁向深淵未知迷霧前，後勤物資官向小隊展示了可用物資，整裝待發！')
        : this.studioContent.text('event.shop.normal', '迷宮深處，一名披著舊斗篷的商人向冒險小隊招手，攤位上擺滿各式裝備與補給品。他熱情地邀請眾人停下腳步。'),
      items,
      consumables,
      buybackPool: [],
      restPrice: 30,
      canRob: false,
      canSteal: isShady && !isPrepShop && leaderRole === 'assassin',
      readyToLeave: [],
      hasBought: false,
      boughtCount: 0,
      canLeave: true
    };
    this.broadcastState();
  }

  // 流浪商人事件（顯示與商店相同，但裝備減為3個、不賣帳篷，補血藥或解毒劑隨機出現一樣，支援單次情報與以物易物）
  handleWanderingMerchantEvent(hexNode) {
    this.clearTimer();
    this.state = 'EVENT';
    const col = hexNode?.col ?? (this.currentHex?.col ?? 1);
    const leaderRole = this.getEffectiveLeaderRole();
    const isAssassinCaptain = leaderRole === 'assassin';

    const recycleRate = Math.round((0.50 + Math.random() * 0.10) * 100) / 100;
    const priceMultiplier = 1.0;

    const shopSession = {
      isShady: false,
      isWanderingMerchant: true,
      shadyBuyMult: 1.0,
      sellRatio: recycleRate,
      isAssassinCaptain,
      isSamuraiCaptain: (leaderRole === 'samurai')
    };

    // 可賣裝備減少到3個
    const targetItemCount = 3;
    const items = [];
    const generalPool = col >= 5 ? [...TIER1_EQUIPMENTS, ...TIER2_EQUIPMENTS] : [...TIER1_EQUIPMENTS];
    const shuffledGeneral = [...generalPool].sort(() => Math.random() - 0.5);

    while (items.length < targetItemCount && shuffledGeneral.length > 0) {
      const gItem = shuffledGeneral.pop();
      if (!items.some(it => it.name === gItem.name)) {
        const itemClone = structuredClone(gItem);
        const basePrice = itemClone.tier === 2 ? 120 : (itemClone.cost || 50);
        itemClone.basePrice = basePrice;
        itemClone.droppedAtCol = col;
        itemClone.price = calculateShopBuyPrice(basePrice, col, shopSession, itemClone);
        items.push(itemClone);
      }
    }
    while (items.length < targetItemCount) {
      const gItem = generalPool[Math.floor(Math.random() * generalPool.length)];
      const itemClone = structuredClone(gItem);
      const basePrice = itemClone.tier === 2 ? 120 : (itemClone.cost || 50);
      itemClone.basePrice = basePrice;
      itemClone.droppedAtCol = col;
      itemClone.price = calculateShopBuyPrice(basePrice, col, shopSession, itemClone);
      items.push(itemClone);
    }

    // 且不賣帳篷，然後補血藥或是解毒劑隨機出現一樣
    const potionChoices = CONSUMABLES.filter(c => c.effectType === 'HEALING_POTION' || c.effectType === 'ANTIDOTE');
    const selectedPotion = potionChoices.length > 0
      ? potionChoices[Math.floor(Math.random() * potionChoices.length)]
      : CONSUMABLES[0];
    const consumableClone = structuredClone(selectedPotion);
    const cBasePrice = consumableClone.cost || consumableClone.basePrice || 50;
    consumableClone.basePrice = cBasePrice;
    consumableClone.droppedAtCol = col;
    consumableClone.price = calculateShopBuyPrice(cBasePrice, col, shopSession, consumableClone);
    const consumables = [consumableClone];

    this.currentEvent = {
      type: 'shop',
      isWanderingMerchant: true,
      subType: 'WANDERING_MERCHANT',
      isShady: false,
      isPrepShop: false,
      recycleRate,
      sellRatio: recycleRate,
      priceMultiplier,
      shadyBuyMult: priceMultiplier,
      isAssassinCaptain,
      hexId: hexNode?.id,
      col,
      title: this.studioContent.title('event.random.wandering_merchant', '🏕️ 迷途流浪商人'),
      story: this.studioContent.text('event.random.wandering_merchant', '一名背負巨大行囊的流浪行者向你們招手，販售著少量精選物資，並願意以物易物或分享前方情報。'),
      items,
      consumables,
      buybackPool: [],
      restPrice: 30,
      canRob: false,
      canSteal: false,
      canBarter: true,
      canInfo: true,
      barterUsed: false,
      infoUsed: false,
      readyToLeave: [],
      canLeave: true
    };
    this.broadcastState();
  }


  handleShopAction(socketId, rawAction, params = {}) {
    if (typeof rawAction === 'object' && rawAction !== null) {
      params = rawAction;
      rawAction = rawAction.action;
    }
    const action = String(rawAction || '').toLowerCase();
    if (this.state !== 'EVENT' || this.currentEvent?.type !== 'shop') {
      if (action === 'sell') {
        return { success: false, message: '非商店區域無法販售裝備，只能丟棄！' };
      }
      return { success: false, message: '目前非商店事件' };
    }
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    const leaderRole = this.getEffectiveLeaderRole();

    // 購買情報（只能使用一次：在地圖上玩家未經過的任意位子出現事件圖示）
    if (action === 'info') {
      if (this.currentEvent?.infoUsed) {
        return { success: false, message: '購買情報功能只能使用一次！' };
      }
      const cost = (leaderRole === 'bard') ? 0 : 15;
      if ((this.gold || 0) < cost) return { success: false, message: '金幣不足！' };
      this.gold -= cost;

      const currentCol = this.currentEvent?.col ?? this.currentHex?.col ?? 1;
      const unvisitedNodes = [];
      if (Array.isArray(this.hexMap)) {
        for (let c = currentCol + 1; c <= 8; c++) {
          for (const node of (this.hexMap[c] || [])) {
            if (node && !node.isVisited && !node.isRevealed) {
              unvisitedNodes.push(node);
            }
          }
        }
        if (unvisitedNodes.length === 0) {
          for (let c = 1; c <= 8; c++) {
            for (const node of (this.hexMap[c] || [])) {
              if (node && !node.isVisited) {
                unvisitedNodes.push(node);
              }
            }
          }
        }
      }

      if (unvisitedNodes.length > 0) {
        const targetNode = unvisitedNodes[Math.floor(Math.random() * unvisitedNodes.length)];
        targetNode.type = 'EVENT';
        targetNode.icon = '🎪';
        targetNode.isRevealed = true;
        targetNode.isScouted = true;
        targetNode.name = '【情報揭露：隨機事件】' + String(targetNode.name || '未知節點').replace(/^【.*?】/, '');
        targetNode.desc = '流浪商人提供之秘密情報據點（隨機事件）';
        this.addLog(`🏕️ 小隊${cost > 0 ? `花費 ${cost} 金幣` : '透過詩人隊長'}向流浪商人打探到了情報，前方第 ${targetNode.col} 層未經過的位置出現了事件圖示【🎪】！`, 'info');
      } else {
        this.addLog('🏕️ 流浪商人探查了地圖，前方已無更多未探索的事件區域。', 'info');
      }

      if (this.currentEvent) this.currentEvent.infoUsed = true;
      this.broadcastState();
      return { success: true };
    }

    // 以物易物（只能使用一次：隨機清除小隊背包內一件裝備，並隨機給一件同階的裝備）
    if (action === 'barter') {
      if (this.currentEvent?.barterUsed) {
        return { success: false, message: '以物易物功能只能使用一次！' };
      }
      if (!Array.isArray(this.squadInventory) || !this.squadInventory.some(Boolean)) {
        return { success: false, message: '小隊背包中沒有裝備可供交換！' };
      }

      const isEquipmentItem = (item) => {
        if (!item) return false;
        if (item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE' || item.slot === 'potion' || item.slot === 'tent') return false;
        if (item.effectType === 'HEALING_POTION' || item.effectType === 'ANTIDOTE' || item.effectType === 'REST_TENT') return false;
        if (item.id === 'consumable_healing_potion' || item.id === 'consumable_antidote' || item.id === 'consumable_rest_tent' || item.id === 'potion_heal' || item.id === 'potion_cure' || item.id === 'campsite_tent') return false;
        return true;
      };

      const equipIndices = [];
      this.squadInventory.forEach((it, idx) => {
        if (isEquipmentItem(it)) equipIndices.push(idx);
      });
      if (equipIndices.length === 0) {
        return { success: false, message: '小隊背包中沒有可供交換的裝備（消耗品不可交換）！' };
      }

      const chosenIdx = equipIndices[Math.floor(Math.random() * equipIndices.length)];
      const removed = this.squadInventory.splice(chosenIdx, 1)[0];

      const isT2 = (removed.tier === 2 || removed.tier === 'T2');
      const isExclusive = (removed.tier === 'CLASS_EXCLUSIVE' || removed.slot === EQUIP_SLOTS.CLASS_EXCLUSIVE || Boolean(removed.role));

      let gainedItem;
      if (isExclusive) {
        const partyRoles = Object.values(this.players).map(p => p.role).filter(Boolean);
        const pool = LOOT_TABLE.filter(e => e.role && (partyRoles.length === 0 || partyRoles.includes(e.role)));
        const tmpl = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : LOOT_TABLE[0];
        gainedItem = structuredClone(tmpl);
        gainedItem.slot = EQUIP_SLOTS.CLASS_EXCLUSIVE;
        gainedItem.tier = 'CLASS_EXCLUSIVE';
      } else if (isT2) {
        const pool = TIER2_EQUIPMENTS.filter(e => e.name !== removed.name);
        const tmpl = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : TIER2_EQUIPMENTS[0];
        gainedItem = structuredClone(tmpl);
      } else {
        const pool = TIER1_EQUIPMENTS.filter(e => e.name !== removed.name);
        const tmpl = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : TIER1_EQUIPMENTS[0];
        gainedItem = structuredClone(tmpl);
      }

      if (this.currentEvent) this.currentEvent.barterUsed = true;
      this.squadInventory[this.findEmptyInventorySlot(this.squadInventory, 19)] = gainedItem;
      this.addLog(`🏕️ 小隊隨機清除了背包內的【${removed.name}】，並向流浪商人交換獲得了同階裝備【${gainedItem.name}】！`, 'loot');
      this.broadcastState();
      return { success: true, item: gainedItem, removedItem: removed };
    }

    // 幻象重塑 (織夢術士)
    if (action === 'reshape') {
      if (leaderRole !== 'dreamweaver') return { success: false, message: '只有織夢術士隊長能重塑配飾！' };
      if (!Array.isArray(this.squadInventory) || !this.squadInventory.some(Boolean)) {
        return { success: false, message: '小隊背包中沒有可供重塑的裝備！' };
      }
      const removed = this.squadInventory.splice(this.squadInventory.findIndex(Boolean), 1)[0];
      const accPool = TIER2_EQUIPMENTS.filter(e => e.slot === EQUIP_SLOTS.ACCESSORY);
      const gainedAcc = structuredClone(accPool[Math.floor(Math.random() * accPool.length)] || TIER2_EQUIPMENTS[1]);
      this.squadInventory[this.findEmptyInventorySlot(this.squadInventory, 19)] = gainedAcc;
      this.addLog(`🌙 【共夢契約】織夢術士隊長編織幻象，將【${removed.name}】重塑為同階配飾【${gainedAcc.name}】！`, 'loot');
      this.broadcastState();
      return { success: true, item: gainedAcc };
    }

    if (action === 'buy') {
      let isConsumable = Boolean(params.isConsumable);
      let idx = params.itemIndex ?? params.consumableIndex;
      let item = null;

      if (params.itemId) {
        const eqIdx = (this.currentEvent.items || []).findIndex(i => i && i.id === params.itemId && !i.sold);
        if (eqIdx !== -1) {
          idx = eqIdx;
          isConsumable = false;
        } else {
          const csIdx = (this.currentEvent.consumables || []).findIndex(i => i && i.id === params.itemId && !i.sold);
          if (csIdx !== -1) {
            idx = csIdx;
            isConsumable = true;
          }
        }
      }

      if (isConsumable) {
        idx = Number(idx ?? 0);
        item = this.currentEvent.consumables?.[idx];
        if (!item) return { success: false, message: '消耗品不存在' };
      } else {
        idx = Number(idx ?? 0);
        item = this.currentEvent.items?.[idx];
        if (!item) return { success: false, message: '商品不存在' };
      }

      if (item.sold) {
        return { success: false, message: '該商品已售罄！' };
      }

      if ((this.gold || 0) < item.price) return { success: false, message: '金幣不足！' };
      if (!Array.isArray(this.squadInventory)) this.squadInventory = [];
      if (this.squadInventory.filter(Boolean).length >= 19) return { success: false, message: '小隊背包已滿（上限 19 格）！' };

      this.gold -= item.price;
      item.sold = true;
      if (this.currentEvent) {
        this.currentEvent.hasBought = true;
        this.currentEvent.boughtCount = (this.currentEvent.boughtCount || 0) + 1;
      }

      const boughtItem = structuredClone(item);
      delete boughtItem.price;
      delete boughtItem.sold;
      delete boughtItem.shopConsumableId;
      delete boughtItem._type;
      delete boughtItem._idx;
      const placement = this.addItemPrioritySquad(boughtItem, socketId);
      this.addLog(`🛒 小隊花費 ${item.price} 金幣購買了【${boughtItem.name}】！(剩餘金幣: ${this.gold})`, 'loot');
      this.broadcastState();
      return { success: true, item: boughtItem, placement };
    }

    if (action === 'sell') {
      if (!this.currentEvent || this.currentEvent.type !== 'shop') {
        return { success: false, message: '非商店區域無法販售裝備，只能丟棄！' };
      }
      const fromArea = (params.fromArea || 'squad').toLowerCase();
      let item = null;

      if (fromArea === 'equip') {
        const slotKey = params.slotKey || params.key;
        if (!player.equipSlots || !player.equipSlots[slotKey]) {
          return { success: false, message: '欲販賣之裝備不存在' };
        }
        item = player.equipSlots[slotKey];
        if (item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE' || item.effectType === 'HEALING_POTION' || item.effectType === 'ANTIDOTE' || item.effectType === 'REST_TENT') {
          return { success: false, message: '補血藥、解毒劑與修整帳篷只能丟棄，不能販售！' };
        }
        removeEquipStats(player, item);
        player.equipSlots[slotKey] = null;
        this.syncPlayerEquips(player);
      } else {
        const container = fromArea === 'personal' ? player.bag : this.squadInventory;
        let idx = params.index;
        if (idx === undefined && params.itemId) {
          idx = (container || []).findIndex(i => i && i.id === params.itemId);
        }
        idx = Number(idx ?? -1);
        if (!Array.isArray(container) || idx < 0 || idx >= container.length || !container[idx]) {
          return { success: false, message: '欲販賣之物品不存在' };
        }
        item = container[idx];
        if (item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE' || item.effectType === 'HEALING_POTION' || item.effectType === 'ANTIDOTE' || item.effectType === 'REST_TENT') {
          return { success: false, message: '補血藥、解毒劑與修整帳篷只能丟棄，不能販售！' };
        }
        container.splice(idx, 1);
      }

      const basePrice = item.basePrice || getItemBasePrice(item);
      item.basePrice = basePrice;
      if (!item.droppedAtCol) {
        item.droppedAtCol = this.currentEvent?.col || 1;
      }
      const sellPrice = calculateItemSellPrice(item, this.currentEvent);

      this.gold = (this.gold || 0) + sellPrice;

      if (!Array.isArray(this.currentEvent.buybackPool)) {
        this.currentEvent.buybackPool = [];
      }

      const buybackEntry = {
        ...structuredClone(item),
        buybackId: `bb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        soldPrice: sellPrice,
        basePrice,
        droppedAtCol: item.droppedAtCol,
        sellerId: socketId,
        fromArea
      };
      this.currentEvent.buybackPool.push(buybackEntry);

      this.addLog(`🛒 **${player.name}** 以 ${sellPrice} 金幣賣出了【${item.name}】！(剩餘金幣: ${this.gold})`, 'loot');
      this.broadcastState();
      return { success: true, soldPrice: sellPrice, item };
    }

    if (action === 'buyback') {
      if (!Array.isArray(this.currentEvent.buybackPool) || this.currentEvent.buybackPool.length === 0) {
        return { success: false, message: '暫無可買回之物品' };
      }
      let idx = params.buybackIndex;
      if (idx === undefined && params.buybackId) {
        idx = this.currentEvent.buybackPool.findIndex(b => b.buybackId === params.buybackId);
      }
      idx = Number(idx ?? -1);
      if (idx < 0 || idx >= this.currentEvent.buybackPool.length) {
        return { success: false, message: '買回物品不存在' };
      }

      const entry = this.currentEvent.buybackPool[idx];
      if (entry.sold) {
        return { success: false, message: '該物品已買回！' };
      }
      const price = entry.soldPrice;
      if ((this.gold || 0) < price) {
        return { success: false, message: `金幣不足以買回此物品（需要 ${price}G）！` };
      }
      if (!Array.isArray(this.squadInventory)) this.squadInventory = [];
      if (this.squadInventory.filter(Boolean).length >= 19) {
        return { success: false, message: '小隊背包已滿（上限 19 格）！' };
      }

      this.gold -= price;
      entry.sold = true;

      const restoredItem = structuredClone(entry);
      delete restoredItem.soldPrice;
      delete restoredItem.buybackId;
      delete restoredItem.sellerId;
      delete restoredItem.fromArea;
      delete restoredItem.sold;
      delete restoredItem._type;
      delete restoredItem._idx;
      const placement = this.addItemPrioritySquad(restoredItem, socketId);

      this.addLog(`🛒 小隊以原價 ${price} 金幣買回了【${restoredItem.name}】！(剩餘金幣: ${this.gold})`, 'loot');
      this.broadcastState();
      return { success: true, item: restoredItem, placement };
    }

    if (action === 'rest') {
      const restPrice = this.currentEvent.restPrice || 30;
      if ((this.gold || 0) < restPrice) return { success: false, message: '金幣不足！' };
      this.gold -= restPrice;
      for (const p of Object.values(this.players)) {
        if (p.hp > 0) {if(p.role==='gladiator')this.grantGladiatorInspiration(p,Math.round(p.maxHp*.35),2,'heal','rest');else p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.35));}
      }
      this.addLog(`⛺ 小隊花費 ${restPrice} 金幣在商隊營地休憩，全員回復了 35% 生命！(剩餘金幣: ${this.gold})`, 'heal');
      this.broadcastState();
      return { success: true };
    }

    if (action === 'rob') {
      return { success: false, message: '目前無法主動向商人發起戰鬥。' };
    }

    if (action === 'steal') {
      const leaderRole = this.getEffectiveLeaderRole();
      if (leaderRole !== 'assassin') return { success: false, message: '只有刺客隊長能暗中行竊！' };
      if (!this.currentEvent.isShady) return { success: false, message: '商人正留意著攤位，目前沒有下手機會。' };

      const success = (typeof params.stealSuccess === 'boolean') ? params.stealSuccess : Math.random() < 0.50;
      if (success && this.currentEvent.items.length > 0) {
        const stolen = this.currentEvent.items.splice(0, 1)[0];
        const stolenItem = structuredClone(stolen);
        delete stolenItem.price;
        this.addItemPrioritySquad(stolenItem, socketId);
        this.addLog(`🗡️ 【無聲行軍】刺客隊長神不知鬼不覺偷走了【${stolenItem.name}】！小隊未被察查安然離去！`, 'loot');
        this.currentEvent.buybackPool = [];
        this.currentEvent = null;
        this.advanceToNextFloorOrCheckpoint();
        return { success: true, stolenItem };
      } else {
        this.addLog('🗡️ 【無聲行軍】行竊失風！奸商察覺後狂怒召喚護衛！戰鬥爆發！', 'warning');
        const col = this.currentEvent.col;
        this.currentEvent.buybackPool = [];
        this.currentEvent = null;
        this.handleBattleEvent(null, false, { specialElite: SPECIAL_ELITES.shady_merchant, col, encounterStory:this.studioContent.text('event.shop.shady.theft', SPECIAL_EVENT_COPY.merchantTheft) });
        return { success: false, message: '行竊失敗，觸發戰鬥！' };
      }
    }

    if (action === 'leave') {
      if (!this.currentEvent || this.currentEvent.type !== 'shop') {
        return { success: false, message: '目前非商店事件' };
      }
      if (!Array.isArray(this.currentEvent.readyToLeave)) {
        this.currentEvent.readyToLeave = [];
      }
      if (!this.currentEvent.readyToLeave.includes(socketId)) {
        this.currentEvent.readyToLeave.push(socketId);
      }

      const connectedPlayers = Object.values(this.players).filter(p => p.connected !== false);
      const totalCount = connectedPlayers.length;
      const readyCount = connectedPlayers.filter(p => this.currentEvent.readyToLeave.includes(p.id)).length;

      // 廣播給所有玩家在視窗最右上角顯示「XXX已確認離開，準備踏上旅程」
      if (this.io && this.code) {
        this.emitPublic('event:shop_player_ready', {
          playerId: player.id,
          playerName: player.name,
          message: `${player.name}已確認離開，準備踏上旅程`,
          readyCount,
          totalCount,
          readyPlayerIds: this.currentEvent.readyToLeave
        });
      }
      this.addLog(`🧭 **${player.name}** 已確認離開，準備踏上旅程。(${readyCount}/${totalCount})`, 'info');

      // 必須每一位玩家都按離開商店按鈕才離開
      const allReady = connectedPlayers.length > 0 && connectedPlayers.every(p => this.currentEvent.readyToLeave.includes(p.id));
      if (!allReady) {
        this.broadcastState();
        return { success: true, allReady: false, readyCount, totalCount };
      }

      // 全員確認準備完畢，正式離開商店
      const wasPrepShop = Boolean(this.currentEvent?.isPrepShop);
      const isShady = Boolean(this.currentEvent?.isShady);
      const hasBought = Boolean(this.currentEvent?.hasBought);

      if (isShady && !wasPrepShop && !hasBought) {
        this.addLog('💢 **奸商** 怒吼：「看了那麼久，為什麼不跟我買東西！浪費我時間」', 'warning');
        this.addLog('⚔️ 奸商惱羞成怒，主動向小隊發起了戰鬥！', 'warning');
        const merchantLootPool = structuredClone(this.currentEvent.items || []);
        const col = this.currentEvent.col || (this.currentHex?.col ?? 1);
        if (this.currentEvent) {
          this.currentEvent.buybackPool = [];
        }
        this.currentEvent = null;
        if (this.io && this.code) {
          this.emitPublic('event:shop_closed');
        }
        this.handleBattleEvent(null, false, { specialElite: SPECIAL_ELITES.shady_merchant, col, merchantLootPool, encounterStory:this.studioContent.text('event.shop.shady.leave', SPECIAL_EVENT_COPY.merchantLeave) });
        return { success: true, allReady: true, combatTriggered: true };
      }

      this.addLog(wasPrepShop ? '🏕️ 小隊全員整備完畢，正式向深淵出發！' : '🛒 小隊全體整頓完畢告別了商人，繼續前行。', 'info');
      if (this.currentEvent) {
        this.currentEvent.buybackPool = [];
      }
      this.currentEvent = null;

      // 廣播通知全體關閉彈窗，避免留在商店界面
      if (this.io && this.code) {
        this.emitPublic('event:shop_closed');
      }

      if (wasPrepShop) {
        this.startRouteSelection();
      } else {
        this.advanceToNextFloorOrCheckpoint();
      }
      return { success: true, allReady: true };
    }

    return { success: false, message: '未知行動' };
  }

  discardItem(socketId, params = {}) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };

    const fromArea = (params.fromArea || 'squad').toLowerCase();
    let item = null;

    if (fromArea === 'equip') {
      const slotKey = params.slotKey || params.key;
      if (!player.equipSlots || !player.equipSlots[slotKey]) {
        return { success: false, message: '欲丟棄之裝備不存在' };
      }
      item = player.equipSlots[slotKey];
      removeEquipStats(player, item);
      player.equipSlots[slotKey] = null;
      this.syncPlayerEquips(player);
    } else {
      const container = fromArea === 'personal' ? player.bag : this.squadInventory;
      let idx = params.index;
      if (idx === undefined && params.itemId) {
        idx = (container || []).findIndex(i => i && i.id === params.itemId);
      }
      idx = Number(idx ?? -1);
      if (!Array.isArray(container) || idx < 0 || idx >= container.length || !container[idx]) {
        return { success: false, message: '欲丟棄之物品不存在' };
      }
      item = container[idx];
      container.splice(idx, 1);
    }

    this.addLog(`🗑️ **${player.name}** 丟棄了【${item.name}】。`, 'info');
    this.broadcastState();
    return { success: true, item };
  }

  useConsumableItem(socketId, params = {}) {
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    if (this.state === 'IN_BATTLE') {
      return { success: false, message: '戰鬥中消耗品需消耗回合行動，請在技能列或點擊道具鎖定為本回合行動！' };
    }

    const fromArea = (params.fromArea || 'squad').toLowerCase();
    const container = fromArea === 'personal' ? player.bag : this.squadInventory;
    let idx = Number(params.index ?? -1);
    if (!Array.isArray(container) || idx < 0 || idx >= container.length || !container[idx]) {
      return { success: false, message: '欲使用之物品不存在' };
    }

    const item = container[idx];
    if (item.type !== 'CONSUMABLE' && item.slot !== 'CONSUMABLE') {
      return { success: false, message: '該物品非消耗品，無法使用' };
    }

    const targetPlayerId = params.targetPlayerId || socketId;
    const targetPlayer = this.players[targetPlayerId] || player;

    if (item.effectType === 'ANTIDOTE' || item.id === 'consumable_antidote') {
      targetPlayer.poisonTurns = 0;
      targetPlayer.poisonDmg = 0;
      targetPlayer.burnTurns = 0;
      targetPlayer.burnDmg = 0;
      targetPlayer.bleedTurns = 0;
      targetPlayer.bleedDmg = 0;
      targetPlayer.fractureTurns = 0;
      targetPlayer.chillTurns = 0;
      targetPlayer.corrosionTurns = 0;
      targetPlayer.alcAcidEquipHalvedTurns = 0;
      container.splice(idx, 1);
      this.addLog(`🧪 **${player.name}** 對 **${targetPlayer.name}** 使用了【解毒藥】，身上的所有負面狀態已被徹底淨化！`, 'heal');
      this.broadcastState();
      return { success: true };
    }

    if (item.effectType === 'HEALING_POTION' || item.id === 'consumable_healing_potion') {
      if (player.role === 'alchemist') {
        const selfHeal = Math.min(40, Math.max(0, player.maxHp - player.hp));
        player.hp = Math.min(player.maxHp, player.hp + 40);
        const allyHeals = [];
        for (const ally of Object.values(this.players)) {
          if (ally.id !== player.id && ally.hp > 0) {
            const prev = ally.hp;
            if(ally.role==='gladiator')this.grantGladiatorInspiration(ally,25,2,'heal',player.id);else ally.hp = Math.min(ally.maxHp, ally.hp + 25);
            allyHeals.push(`**${ally.name}**(+${ally.hp - prev})`);
          }
        }
        container.splice(idx, 1);
        const allyText = allyHeals.length > 0 ? `，隊友 ${allyHeals.join('、')} 獲得回復` : '';
        this.addLog(`🧪⚗️ **${player.name}** 使用了【治療藥】，觸發煉金術士專屬藥效：自身恢復 ${selfHeal} 點生命（❤️ ${player.hp}/${player.maxHp}）${allyText}！`, 'heal');
        this.broadcastState();
        return { success: true };
      }
      if (targetPlayer.hp <= 0) {
        return { success: false, message: '無法對已倒下的隊員使用治療藥！' };
      }
      const healAmt = 35;
      const prevHp = targetPlayer.hp;
      if(targetPlayer.role==='gladiator')this.grantGladiatorInspiration(targetPlayer,healAmt,2,'heal',player.id);else targetPlayer.hp = Math.min(targetPlayer.maxHp, targetPlayer.hp + healAmt);
      container.splice(idx, 1);
      this.addLog(`🧪 **${player.name}** 對 **${targetPlayer.name}** 使用了【治療藥】，恢復了 ${targetPlayer.hp - prevHp} 生命（❤️ ${targetPlayer.hp}/${targetPlayer.maxHp}）！`, 'heal');
      this.broadcastState();
      return { success: true };
    }

    if (item.effectType === 'REST_TENT' || item.id === 'consumable_rest_tent') {
      if (this.state !== 'CHOOSING_ROUTE' && this.state !== 'MAP_ROUTING') {
        return { success: false, message: '修整帳篷僅限在「選路階段」使用！' };
      }
      for (const p of Object.values(this.players)) {
        if (p.hp > 0) {
          const healAmt = Math.max(1, Math.round(p.maxHp * (item.healPercent || 0.60)));
          if(p.role==='gladiator')this.grantGladiatorInspiration(p,healAmt,2,'heal','rest_tent');else p.hp = Math.min(p.maxHp, p.hp + healAmt);
        }
        p.poisonTurns = 0;
        p.poisonDmg = 0;
        p.burnTurns = 0;
        p.burnDmg = 0;
        p.bleedTurns = 0;
        p.bleedDmg = 0;
        p.fractureTurns = 0;
        p.chillTurns = 0;
        p.corrosionTurns = 0;
        p.alcAcidEquipHalvedTurns = 0;
      }
      container.splice(idx, 1);
      this.addLog(`⛺ **${player.name}** 搭建了【修整帳篷】，全隊在原地安營休整！全員恢復了大量生命值並清除了所有負面效果！`, 'heal');
      this.broadcastState();
      return { success: true };
    }

    return { success: false, message: '未知消耗品效果' };
  }

  stealMimicLoot(enemy, target) {
    const loot = enemy.stolenLoot ||= {gold:0,equipment:[]};
    const equipped = Object.entries(target.equipSlots || {}).filter(([,item]) => item);
    const cap = Math.floor((this.gold || 0) * .5);
    if (equipped.length && (cap === 0 || Math.random() < .5)) {
      const [slot,item] = equipped[Math.floor(Math.random()*equipped.length)];
      removeEquipStats(target,item);
      target.equipSlots[slot] = null;
      this.syncPlayerEquips(target);
      loot.equipment.push({ownerId:target.id,slot,item});
      this.addLog(`🎒 奇怪的寶箱咬住 ${target.name} 的【${item.name}】，長舌一捲吞入箱中！擊敗牠即可奪回。`,'warning');
      return {kind:'equipment',ownerId:target.id,targetName:target.name,slot,item:{id:item.id,name:item.name,icon:item.icon||null,role:item.role||null,slot:item.slot||slot,tier:item.tier}};
    }
    if (cap > 0) {
      const amount = 1 + Math.floor(Math.random()*cap);
      this.gold -= amount;
      loot.gold += amount;
      this.addLog(`💰 奇怪的寶箱偷走了 ${amount} 枚小隊金幣！擊敗牠即可奪回。`,'warning');
      return {kind:'gold',ownerId:target.id,targetName:target.name,amount};
    }
    return false;
  }

  // 寶箱事件 (Module 4)
  handleChestEvent(hexNode) {
    this.clearTimer();
    this.state = 'EVENT';
    const isMimic = typeof hexNode === 'boolean' ? hexNode : Boolean(hexNode?.isMimic);
    const col = hexNode?.col ?? (this.currentHex?.col ?? 1);

    // 無論是否為寶箱怪，初次探索皆顯示為標準寶箱事件，保持未知與懸念
    this.currentEvent = {
      type: 'chest',
      presentationId: ++this.chestPresentationId,
      isMimic,
      opened: false,
      hexId: hexNode?.id,
      col,
      title: this.studioContent.title('event.chest', '🎁 發現古老寶箱！'),
      story: this.studioContent.text('event.chest', '在陰暗的地城角落，靜靜佇立著一具裝飾精美、未被開啟的神秘寶箱。'),
      canPacify: false,
      canOpen: true,
      canLeave: true
    };
    this.broadcastState();
  }

  handleChestAction(socketId, rawAction, params = {}) {
    if (this.state !== 'EVENT' || this.currentEvent?.type !== 'chest') {
      return { success: false, message: '目前非寶箱事件' };
    }
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    const action = String(rawAction || '').toLowerCase();

    if (this.currentEvent.opened) return { success: false, message: '寶箱已開啟，等待收納完成' };
    if (params.presentationId !== undefined && params.presentationId !== this.currentEvent.presentationId)
      return { success:false, message:'寶箱已變更' };

    if (action === 'open') {
      const col = this.currentEvent.col || (this.currentHex?.col ?? 1);
      if (this.currentEvent.isMimic) {
        const encounterStory = this.studioContent.text('event.chest.mimic', SPECIAL_EVENT_COPY.ambush);
        this.currentEvent = null;
        this.handleBattleEvent(null, false, { specialElite:SPECIAL_ELITES.treasure_mimic, col, encounterStory });
        return { success: true, isMimic: true };
      } else {
        // 常規寶箱開啟成功
        const goldGain = Math.round((30 + Math.floor(Math.random() * 21)) * getGoldIncomeMultiplier(col));
        this.gold = (this.gold || 0) + goldGain;
        const dropPool = (col >= 5) ? [...TIER1_EQUIPMENTS, ...TIER2_EQUIPMENTS] : [...TIER1_EQUIPMENTS];
        const drop = structuredClone(dropPool[Math.floor(Math.random() * dropPool.length)]);
        drop.droppedAtCol = col;
        drop.basePrice = getItemBasePrice(drop);
        const deposit = this.autoDepositLoot(drop, socketId);

        for (const p of Object.values(this.players)) {
          if (p.hp > 0) {if(p.role==='gladiator')this.grantGladiatorInspiration(p,25,2,'heal','chest');else p.hp = Math.min(p.maxHp, p.hp + 25);}
        }

        this.currentEvent.opened = true;
        this.currentEvent.canOpen = false;
        this.currentEvent.canLeave = false;
        this.currentEvent.canPacify = false;
        this.currentEvent.depositTarget = deposit.target;
        this.pendingPresentationAcks = new Set(Object.values(this.players).filter(p=>p.connected).map(p=>p.id));
        this.currentEvent.goldGain = goldGain;
        this.currentEvent.drop = drop;
        this.currentEvent.story = '小隊協力掀開寶箱，溫暖的聖光與豐厚戰利品映入眼簾！';
        this.addLog(`🎁 開啟寶箱！全員回復 25 HP，獲得 ${goldGain} 金幣與【${drop.name}】！(當前金幣: ${this.gold})`, 'loot');
        this.broadcastState();
        return { success: true, opened: true, drop, goldGain, depositTarget:deposit.target };
      }
    }

    if (action === 'leave' || action === 'bypass') {
      this.addLog('🧭 小隊決定謹慎行事，繞道而行離開了寶箱。', 'info');
      this.currentEvent = null;
      this.advanceToNextFloorOrCheckpoint();
      return { success: true };
    }

    if (false) {
      this.currentEvent = null;
      this.advanceToNextFloorOrCheckpoint();
      return { success: true };
    }

    return { success: false, message: '未知行動' };
  }

  // 隨機事件 (Module 4)
  handleRandomEvent(hexNode, subTypeOverride = null) {
    this.clearTimer();
    this.state = 'EVENT';
    const subTypes = ['WANDERING_MERCHANT', 'ALTAR', 'GAMBLE', 'REFORGE'];
    const subType = subTypeOverride || (typeof hexNode === 'string' ? hexNode : subTypes[((hexNode?.col ?? 1) * 3 + (hexNode?.row ?? 1)) % subTypes.length]);
    if (subType === 'WANDERING_MERCHANT') {
      return this.handleWanderingMerchantEvent(hexNode);
    }
    const leaderRole = this.getEffectiveLeaderRole();

    this.currentEvent = {
      type: 'random_event',
      subType,
      hexId: hexNode?.id,
      col: hexNode?.col ?? 1,
      title: subType === 'WANDERING_MERCHANT' ? this.studioContent.title('event.random.wandering_merchant', '🏕️ 迷途流浪商人')
        : subType === 'ALTAR' ? this.studioContent.title('event.random.altar', '⛩️ 古老深淵祭壇')
        : subType === 'GAMBLE' ? this.studioContent.title('event.random.gamble', '命運賭局')
        : this.studioContent.title('event.random.reforge', '黑鐵重鑄工坊'),
      story: subType === 'WANDERING_MERCHANT' ? this.studioContent.text('event.random.wandering_merchant', '一名背負巨大行囊的流浪行者向你們招手，願意以物易物或分享前方情報。')
        : subType === 'ALTAR' ? this.studioContent.text('event.random.altar', '一座刻滿禁忌古代銘文的石質祭壇，散發著令人心悸的威壓。')
        : subType === 'GAMBLE' ? this.studioContent.text('event.random.gamble', '迷霧中擺著一張黑曜石牌桌，一名神秘的發牌人微笑著洗牌。')
        : this.studioContent.text('event.random.reforge', '一座地底矮人廢棄的鍛造台，殘存的爐火依然熾熱。'),
      canLeave: true
    };
    this.broadcastState();
  }

  handleRandomEventAction(socketId, rawAction, params = {}) {
    if (this.state !== 'EVENT' || this.currentEvent?.type !== 'random_event') {
      return { success: false, message: '目前非隨機事件' };
    }
    const player = this.players[socketId];
    if (!player) return { success: false, message: '玩家不存在' };
    const subType = this.currentEvent.subType;
    const leaderRole = this.getEffectiveLeaderRole();
    const action = String(rawAction || '').toLowerCase();

    if (action === 'leave') {
      this.addLog('小隊離開了事件據點，繼續向前推進。', 'info');
      this.currentEvent = null;
      this.advanceToNextFloorOrCheckpoint();
      return { success: true };
    }

    if (subType === 'WANDERING_MERCHANT') {
      if (action === 'info') {
        const cost = (leaderRole === 'bard') ? 0 : 15;
        if ((this.gold || 0) < cost) return { success: false, message: '金幣不足！' };
        this.gold -= cost;
        const targetCol = Math.min(9, (this.currentEvent.col || 1) + 1);
        if (Array.isArray(this.hexMap?.[targetCol])) {
          for (const node of this.hexMap[targetCol]) {
            node.isScouted = true;
          }
        }
        if (leaderRole === 'bard') {
          this.addLog(`🎶 【變奏指揮】詩人隊長以美妙琴音打動商人，商人免費分享了前方第 ${targetCol} 層的全部情報！`, 'buff');
        } else {
          this.addLog(`🏕️ 小隊花費 15 金幣向流浪商人打探到了前方第 ${targetCol} 層的情報！`, 'info');
        }
        this.broadcastState();
        return { success: true };
      }

      if (action === 'barter') {
        const barterIdx = (this.squadInventory || []).findIndex(e => e && e.name);
        if (barterIdx === -1) {
          return { success: false, message: '小隊背包中沒有可供交換的裝備！' };
        }
        const removed = this.squadInventory.splice(barterIdx, 1)[0];
        let gainedItem;
        if (leaderRole === 'bard') {
          gainedItem = structuredClone(TIER2_EQUIPMENTS[Math.floor(Math.random() * TIER2_EQUIPMENTS.length)]);
          this.addLog(`🎶 【變奏指揮】詩人隊長巧舌如簧，以【${removed.name}】換取了更高一階的【${gainedItem.name}】！`, 'loot');
        } else {
          gainedItem = structuredClone(TIER1_EQUIPMENTS[Math.floor(Math.random() * TIER1_EQUIPMENTS.length)]);
          this.addLog(`🏕️ 小隊以【${removed.name}】與商人交換了【${gainedItem.name}】！`, 'loot');
        }
        this.addItemPrioritySquad(gainedItem, socketId);
        this.broadcastState();
        return { success: true, item: gainedItem };
      }

      if (action === 'reshape') {
        if (leaderRole !== 'dreamweaver') return { success: false, message: '只有織夢術士隊長能重塑配飾！' };
        const reshapeIdx = (this.squadInventory || []).findIndex(e => e && e.name);
        if (reshapeIdx === -1) {
          return { success: false, message: '小隊背包中沒有可供重塑的裝備！' };
        }
        const removed = this.squadInventory.splice(reshapeIdx, 1)[0];
        const accPool = TIER2_EQUIPMENTS.filter(e => e.slot === EQUIP_SLOTS.ACCESSORY);
        const gainedAcc = structuredClone(accPool[Math.floor(Math.random() * accPool.length)] || TIER2_EQUIPMENTS[1]);
        this.addItemPrioritySquad(gainedAcc, socketId);
        this.addLog(`🌙 【共夢契約】織夢術士隊長編織幻象，將【${removed.name}】重塑為同階配飾【${gainedAcc.name}】！`, 'loot');
        this.broadcastState();
        return { success: true, item: gainedAcc };
      }
    }

    if (subType === 'ALTAR') {
      if (action === 'sacrifice' || action === 'pray') {
        const hpLossRatio = (leaderRole === 'warrior') ? 0.10 : 0.20;
        for (const p of Object.values(this.players)) {
          if (p.hp > 0) {
            const loss = Math.max(1, Math.floor(p.maxHp * hpLossRatio));
            p.hp = Math.max(1, p.hp - loss);
          }
        }
        const rewardItem = structuredClone(TIER2_EQUIPMENTS[Math.floor(Math.random() * TIER2_EQUIPMENTS.length)]);
        this.addItemPrioritySquad(rewardItem, socketId);
        for (const p of Object.values(this.players)) {
          p.bonusAtk = (p.bonusAtk || 0) + 3;
        }
        if (leaderRole === 'warrior') {
          this.addLog(`🛡️ 【堅守陣線】戰士隊長堅毅挺身，鮮血獻祭扣血減半！全員獲得 +3 永久攻擊力與【${rewardItem.name}】！`, 'loot');
        } else {
          this.addLog(`⛩️ 小隊完成了鮮血獻祭！全員扣除 20% 生命，獲得 +3 永久攻擊力與【${rewardItem.name}】！`, 'loot');
        }
        this.currentEvent = null;
        this.advanceToNextFloorOrCheckpoint();
        return { success: true, rewardItem };
      }

      if (action === 'desecrate') {
        const goldGain = 60;
        this.gold = (this.gold || 0) + goldGain;
        const rewardItem = structuredClone(TIER1_EQUIPMENTS[Math.floor(Math.random() * TIER1_EQUIPMENTS.length)]);
        this.addItemPrioritySquad(rewardItem, socketId);

        if (leaderRole === 'onmyoji') {
          this.addLog(`📜 【百鬼敕令】陰陽師隊長釋放淨化結界，全隊搜刮祭壇（獲得 60 金幣與【${rewardItem.name}】）且完全免疫減防詛咒！`, 'buff');
        } else {
          for (const p of Object.values(this.players)) {
            p.warriorVulnerableTurns = 2;
          }
          this.addLog(`⛩️ 小隊褻瀆了祭壇，獲得 60 金幣與【${rewardItem.name}】，但受到了減防詛咒（下場戰鬥承傷 +20%）！`, 'warning');
        }
        this.currentEvent = null;
        this.advanceToNextFloorOrCheckpoint();
        return { success: true, goldGain, rewardItem };
      }

      if (action === 'purify') {
        if (leaderRole !== 'paladin') return { success: false, message: '只有聖騎士隊長能執行聖光淨化！' };
        for (const p of Object.values(this.players)) {
          if (p.hp > 0) {
            p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.30));
            p.tempHp = (p.tempHp || 0) + 15;
          }
        }
        this.addLog('🛡️✨ 【不屈誓約】聖騎士隊長引導聖光淨化祭壇！免除一切代價為全員回復 30% 生命並附加 15 點護盾！', 'buff');
        this.currentEvent = null;
        this.advanceToNextFloorOrCheckpoint();
        return { success: true };
      }
    }

    if (subType === 'GAMBLE') {
      if (action === 'd20_gamble' || action === 'gamble' || action === 'coin' || action === 'bet') {
        const betAmt = Math.max(1, Math.min(this.gold || 0, Math.floor(Number(params.amount ?? 10))));
        if ((this.gold || 0) < betAmt) return { success: false, message: `金幣不足 ${betAmt} G！` };
        this.gold -= betAmt;

        const choice = (params.choice === 'BIG') ? 'BIG' : 'SMALL';
        // 擲 20 面骰 (1 ~ 20)
        const roll = (typeof params.roll === 'number' && params.roll >= 1 && params.roll <= 20)
          ? params.roll
          : Math.floor(Math.random() * 20) + 1;

        let outcomeType = 'LOSE';
        let payout = 0;

        if (roll === 10) {
          outcomeType = 'PUSH';
          payout = betAmt;
        } else if (choice === 'SMALL') {
          if (roll === 1) {
            outcomeType = 'JACKPOT';
            payout = betAmt * 3;
          } else if (roll >= 2 && roll <= 9) {
            outcomeType = 'WIN';
            payout = betAmt * 2;
          } else {
            outcomeType = 'LOSE';
            payout = 0;
          }
        } else if (choice === 'BIG') {
          if (roll === 20) {
            outcomeType = 'JACKPOT';
            payout = betAmt * 3;
          } else if (roll >= 11 && roll <= 19) {
            outcomeType = 'WIN';
            payout = betAmt * 2;
          } else {
            outcomeType = 'LOSE';
            payout = 0;
          }
        }

        this.gold += payout;
        const choiceLabel = choice === 'SMALL' ? '小 (1~9)' : '大 (11~20)';

        if (outcomeType === 'JACKPOT') {
          this.addLog(`🎲 押注【${choiceLabel}】，20面骰擲出極限【${roll}】點！天降鴻運，獲得 3 倍大獎（+${payout} G）！`, 'loot');
        } else if (outcomeType === 'WIN') {
          this.addLog(`🎲 押注【${choiceLabel}】，20面骰擲出【${roll}】點！押注獲勝，獲得 2 倍金幣（+${payout} G）！`, 'loot');
        } else if (outcomeType === 'PUSH') {
          this.addLog(`🎲 20面骰擲出【10】點！平局，退回押注本金 ${betAmt} G。`, 'info');
        } else {
          this.addLog(`🎲 押注【${choiceLabel}】，20面骰擲出【${roll}】點！押注失敗，損失 ${betAmt} G……`, 'warning');
        }

        this.broadcastState();
        return {
          success: true,
          roll,
          choice,
          wager: betAmt,
          payout,
          outcomeType,
          currentGold: this.gold
        };
      }

      if (action === 'box') {
        if ((this.gold || 0) < 50) return { success: false, message: '金幣不足 50！' };
        this.gold -= 50;
        const breakChance = (leaderRole === 'sage') ? 0.0 : 0.50;
        const isBroken = (typeof params.isBroken === 'boolean') ? params.isBroken : Math.random() < breakChance;
        if (!isBroken) {
          const item = structuredClone(TIER2_EQUIPMENTS[Math.floor(Math.random() * TIER2_EQUIPMENTS.length)]);
          this.addItemPrioritySquad(item, socketId);
          if (leaderRole === 'sage') {
            this.addLog(`📐 【預設解】智者隊長完全排除盲盒碎裂風險，成功開出【${item.name}】！`, 'loot');
          } else {
            this.addLog(`🎲 盲盒中開出了珍貴的【${item.name}】！`, 'loot');
          }
          this.broadcastState();
          return { success: true, item };
        } else {
          this.addLog('🎲 盲盒開啟時碎成了一堆無用瓦礫……', 'warning');
          this.broadcastState();
          return { success: true, isBroken: true };
        }
      }

      if (action === 'hp_gamble') {
        if (leaderRole !== 'gladiator') return { success: false, message: '只有角鬥士隊長能押注生命！' };
        for (const p of Object.values(this.players)) {
          if (p.hp > 0) p.hp = Math.max(1, Math.floor(p.hp * 0.80));
        }
        const win = (typeof params.win === 'boolean') ? params.win : Math.random() < 0.60;
        if (win) {
          this.gold = (this.gold || 0) + 80;
          const item = structuredClone(TIER2_EQUIPMENTS[Math.floor(Math.random() * TIER2_EQUIPMENTS.length)]);
          this.addItemPrioritySquad(item, socketId);
          this.addLog(`⚔️ 【榮耀號角】角鬥士隊長以熱血為注豪賭獲勝！獲得 80 金幣與【${item.name}】！`, 'loot');
          this.broadcastState();
          return { success: true, win: true, item };
        } else {
          this.addLog('⚔️ 【榮耀號角】血氣押注未果，小隊損失了生命……', 'warning');
          this.broadcastState();
          return { success: true, win: false };
        }
      }
    }

    if (subType === 'REFORGE') {
      if (action === 'reforge' || action === 'reforge_weapon') {
        const cost = 10;
        if ((this.gold || 0) < cost) return { success: false, message: `金幣不足 ${cost} G！` };
        
        let targetIndex = Number(params.itemIndex ?? params.index);
        if (isNaN(targetIndex) || !this.squadInventory || !this.squadInventory[targetIndex]) {
          targetIndex = (this.squadInventory || []).findIndex(e => e && e.name);
        }
        if (targetIndex === -1 || !this.squadInventory[targetIndex]) {
          return { success: false, message: '小隊背包中沒有選取裝備可供重鑄！' };
        }

        const oldItem = this.squadInventory[targetIndex];
        this.gold -= cost;

        // 隨機重鑄池：可能更低變成一階，或更高階變成專屬裝備
        const roll = Math.random();
        let template;
        let poolName = '';
        if (roll < 0.40 && Array.isArray(TIER1_EQUIPMENTS) && TIER1_EQUIPMENTS.length > 0) {
          template = TIER1_EQUIPMENTS[Math.floor(Math.random() * TIER1_EQUIPMENTS.length)];
          poolName = '一階裝備';
        } else if (roll < 0.80 && Array.isArray(TIER2_EQUIPMENTS) && TIER2_EQUIPMENTS.length > 0) {
          template = TIER2_EQUIPMENTS[Math.floor(Math.random() * TIER2_EQUIPMENTS.length)];
          poolName = '二階稀有裝備';
        } else if (Array.isArray(LOOT_TABLE) && LOOT_TABLE.length > 0) {
          template = LOOT_TABLE[Math.floor(Math.random() * LOOT_TABLE.length)];
          poolName = '職業專屬神裝';
        } else {
          template = TIER1_EQUIPMENTS[0];
          poolName = '裝備';
        }

        const newItem = structuredClone(template);
        newItem.droppedAtCol = this.currentHex?.col || this.floor || 1;
        newItem.basePrice = getItemBasePrice(newItem);

        this.squadInventory[targetIndex] = newItem;

        this.addLog(`【黑鐵重鑄】鍛造熔爐烈焰呼嘯！消耗 10G 將【${oldItem.name}】重鑄為 ${poolName}【${newItem.name}】！`, 'loot');
        this.broadcastState();
        return { success: true, item: newItem, oldItem, itemIndex: targetIndex, poolName };
      }

      if (action === 'convert_magic') {
        if (leaderRole !== 'mage') return { success: false, message: '只有法師隊長能轉換武器屬性！' };
        const target = (this.squadInventory || []).find(e => e && e.name);
        if (!target) {
          return { success: false, message: '小隊背包中沒有裝備可供轉換！' };
        }
        target.isMagic = true;
        target.name = `附魔的 ${target.name}`;
        this.addLog(`🪄 【奧術共鳴】法師隊長注入奧術結晶，成功將【${target.name}】轉換為魔法武器！`, 'buff');
        this.broadcastState();
        return { success: true, item: target };
      }
    }

    return { success: false, message: '未知行動' };
  }

  // ==========================================
  // Module 6：隊長技系統
  // ==========================================

  getEffectiveLeaderId() {
    return this.lockedLeaderId || this.leaderId;
  }

  getEffectiveLeaderRole() {
    if (this.state === 'LOBBY' && !this.lockedLeaderRole) return null;
    return this.lockedLeaderRole || this.players[this.leaderId]?.role || null;
  }

  getEffectiveLeaderSkill() {
    const role = this.getEffectiveLeaderRole();
    return role ? LEADER_SKILLS[role] : null;
  }

  handleLeaderTransferOnBattleStart() {
    if (this.pendingLeaderTransfer) {
      this.lockedLeaderId = this.leaderId;
      this.lockedLeaderRole = this.players[this.leaderId]?.role;
      this.pendingLeaderTransfer = false;
      const roleName = CLASSES[this.lockedLeaderRole]?.name || this.lockedLeaderRole;
      this.addLog(`👑 【隊長技繼承】新隊長 **${this.players[this.leaderId]?.name || '新隊長'}**（${roleName}）的隊長光環正式生效！`, 'info');
    }
    this.leaderSkillUsedThisBattle = false;
    this.warriorLeaderGuarded = false;
    this.assassinLeaderFlawApplied = false;
    this.samuraiLeaderCounterPursuitDone = false;
    this.sageLeaderRetried = false;
    this.druidLeaderShieldGiven = false;
    this.bardPriorityActive = false;
  }

  useLeaderSkill(socketId, options = {}) {
    if (this.state === 'IN_BATTLE' && (!this.isStageParticipant(socketId) || !this.players[socketId]?.connected)) return { success: false, message: '本階段未參戰或已離線' };
    if (socketId !== this.getEffectiveLeaderId()) {
      return { success: false, message: '只有當前具備資格的隊長能使用隊長技！' };
    }
    if (this.state !== 'IN_BATTLE') {
      return { success: false, message: '隊長技只能在戰鬥中使用！' };
    }
    if (this.leaderSkillUsedThisBattle) {
      return { success: false, message: '每場戰鬥隊長技只能使用一次！' };
    }
    const skill = this.getEffectiveLeaderSkill();
    if (!skill) return { success: false, message: '無可用的隊長技' };
    if (skill.type !== 'ACTIVE') {
      return { success: false, message: '此隊長技為被動技能，戰鬥中會自動生效！' };
    }

    const leader = this.players[socketId];
    const role = skill.role;

    if (role === 'mage') {
      const target = this.players[options.targetPlayerId] || leader;
      target.magePierceNextMagic = true;
      this.addLog(`✨ 【奧術共鳴】法師隊長引導奧術能量灌注 **${target.name}**，下一次魔法攻擊無視 50% 魔法抗性！`, 'buff');
    } else if (role === 'archer') {
      const targetEnemy = this.getTargetEnemy(options.targetEnemyId);
      if (targetEnemy) targetEnemy.isMarkedByArcherLeader = true;
      this.addLog(`🎯 【獵殺標記】弓箭手隊長鎖定標記了 **${targetEnemy?.name || '敵方目標'}**，隊伍下一輪首次攻擊必定命中無視閃避！`, 'buff');
    } else if (role === 'bard') {
      this.bardPriorityActive = true;
      this.addLog('🎵 【變奏指揮】詩人隊長彈奏狂想曲！全體隊員攻擊將在敵方行動前優先結算！', 'buff');
    } else if (role === 'alchemist') {
      const potion = options.potionType || 'defense';
      if (potion === 'defense') {
        for (const p of Object.values(this.players)) {
          if (p.hp > 0) {
            if(p.role==='gladiator')this.p8GrantShield(p,20,2,'alchemy_defense');
            else p.tempHp = (p.tempHp || 0) + 20;
            p.alcPotionDefTurns = 2;
          }
        }
        this.addLog('🧪 【戰地調配】煉金隊長投擲全效防禦藥劑！全員獲得 20 點護盾與 15% 減傷（2 回合）！', 'buff');
      } else {
        for (const p of Object.values(this.players)) {
          if (p.hp > 0) {
            p.bonusAtk = (p.bonusAtk || 0) + 8;
            p.alcPotionAtkTurns = 2;
            p.alcPotionDot = true;
          }
        }
        this.addLog('🧪 【戰地調配】煉金隊長投擲腐蝕進攻藥劑！全員攻擊 +8 且普通攻擊附帶 DoT（2 回合）！', 'buff');
      }
    } else if (role === 'paladin') {
      const target = this.players[options.targetPlayerId] || leader;
      target.paladinFatalGuard = true;
      this.addLog(`🛡️✨ 【不屈誓約】聖騎士隊長為 **${target.name}** 施加致命守護，受到致死打擊時生命保留 1 點！`, 'buff');
    } else if (role === 'stargazer') {
      for (const p of Object.values(this.players)) {
        if (p.cooldowns) {
          for (const k of Object.keys(p.cooldowns)) {
            p.cooldowns[k] = Math.max(0, p.cooldowns[k] - 1);
          }
        }
      }
      const roundsUntilUlt = 3 - (this.battleRound % 3);
      this.addLog(`🌟 【星軌先見】觀星者隊長逆轉星盤！全體技能 CD 減少 1 回合，並預見魔物將在 ${roundsUntilUlt} 回合後釋放必殺技！`, 'buff');
    } else if (role === 'dreamweaver') {
      const target = this.players[options.targetPlayerId] || leader;
      target.dreamDamageDelayActive = true;
      this.addLog(`🌙 【共夢契約】織夢術士隊長鏈接夢境，**${target.name}** 本回合受到的 50% 傷害將延後至次回合！`, 'buff');
    } else if (role === 'augur') {
      const target = this.players[options.targetPlayerId] || leader;
      target.augurAbsolutePositive = true;
      this.addLog(`🔮 【命運宣告】卜者隊長命運干涉！**${target.name}** 本回合機率判定獲得絕對正面結果且免除命債！`, 'buff');
    } else if (role === 'onmyoji') {
      const targetEnemy = this.getTargetEnemy(options.targetEnemyId);
      if (targetEnemy) {
        targetEnemy.talismans = targetEnemy.talismans || [];
        targetEnemy.permanentTalismans = targetEnemy.permanentTalismans || [];
        const ALL_TYPES = ['blind', 'seal', 'corrode', 'confuse', 'drain'];
        for (const type of ALL_TYPES) {
          targetEnemy.talismans.push(type, type);
          targetEnemy.permanentTalismans.push(type, type);
        }
      }
      this.addLog(`📜✨ 【萬符歸宗】陰陽師隊長施展萬符歸宗！向 **${targetEnemy?.name || '目標'}** 一次性貼上所有類型符咒各兩張（共 10 道符咒），且敕令符咒永久固鎖，絕不脫落！`, 'buff');
    }

    this.leaderSkillUsedThisBattle = true;
    this.broadcastState();
    return { success: true };
  }

  // ==========================================
  // Module 5：深淵遭遇與四階段對話系統
  // ==========================================

  checkAbyssEncounterTrigger(hexNode, options = {}) {
    if (this.hasTriggeredAbyss && !options.forceAbyss) return false;
    const col = hexNode?.col ?? this.currentHex?.col ?? 1;
    if (col < 4 || col > 8) return false;
    if (this.memberIds.length < 4 && !options.forceAbyss) return false;
    if (hexNode && hexNode.type && hexNode.type !== 'BATTLE' && !options.forceAbyss) return false;

    const unpickedPool = this.getUnpickedAbyssBossPool();
    if (!unpickedPool || unpickedPool.length === 0) return false;

    const roll = (typeof options.triggerRoll === 'number') ? options.triggerRoll : Math.random();
    if (options.forceAbyss || roll < 0.35) {
      const bossTmpl = unpickedPool[Math.floor(Math.random() * unpickedPool.length)];
      this.startAbyssDialogue(bossTmpl, hexNode);
      return true;
    }
    return false;
  }

  startAbyssDialogue(bossTemplate, hexNode) {
    this.clearTimer();
    this.state = 'ABYSS_DIALOGUE';
    this.hasTriggeredAbyss = true;
    const bossRole = bossTemplate.role;
    const stage1Text = ABYSS_DIALOGUES.bossDialogues[bossRole]?.stage1 || bossTemplate.desc;

    this.abyssState = {
      stage: 1,
      bossRole,
      bossTemplate,
      bossName: bossTemplate.name,
      bossAvatar: bossTemplate.avatar,
      ...(bossTemplate.battleAvatar ? { bossBattleAvatar: bossTemplate.battleAvatar } : {}),
      bossDesc: bossTemplate.desc,
      hexId: hexNode?.id,
      col: hexNode?.col ?? 5,
      dialogueText: stage1Text,
      votes: {},
      chosenChoice: null,
      modifiers: { atkMod: 0, defMod: 0 }
    };

    this.addLog(`🌑 【深淵異變】迷霧深處湧出刺骨黑霧……昔日被留在大廳的同伴【${bossTemplate.name}】緩緩浮現！`, 'warning');
    this.broadcastState();
  }

  advanceAbyssDialogue(socketId) {
    if (this.state !== 'ABYSS_DIALOGUE' || !this.abyssState) {
      return { success: false, message: '非深淵對話狀態' };
    }
    const stage = this.abyssState.stage;
    const bossRole = this.abyssState.bossRole;

    if (stage === 1) {
      this.abyssState.stage = 2;
      const leaderRole = this.getEffectiveLeaderRole();
      const leaderDiff = ABYSS_DIALOGUES.bossDialogues[bossRole]?.leaderDiff?.[leaderRole];
      this.abyssState.dialogueText = leaderDiff || ABYSS_DIALOGUES.bossDialogues[bossRole]?.stage2 || '……';
      this.broadcastState();
      return { success: true, stage: 2 };
    }

    if (stage === 2) {
      this.abyssState.stage = 3;
      this.abyssState.choices = ABYSS_DIALOGUES.choices;
      this.abyssState.votes = {};
      this.broadcastState();
      return { success: true, stage: 3 };
    }

    if (stage === 4) {
      this.completeAbyssDialogue();
      return { success: true, stage: 'battle' };
    }

    return { success: false, message: '當前階段無法直接前進' };
  }

  voteAbyssChoice(socketId, choiceId) {
    if (this.state !== 'ABYSS_DIALOGUE' || !this.abyssState || this.abyssState.stage !== 3) {
      return { success: false, message: '目前非深淵抉擇投票階段' };
    }
    const player = this.players[socketId];
    if (!player || player.hp <= 0) return { success: false, message: '玩家無法投票' };

    const validChoice = ABYSS_DIALOGUES.choices.find(c => c.id === choiceId);
    if (!validChoice) return { success: false, message: '無效的選項' };

    this.abyssState.votes[socketId] = choiceId;
    this.broadcastState();

    const living = Object.values(this.players).filter(p => p.hp > 0 && p.connected);
    const allVoted = living.length > 0 && living.every(p => Boolean(this.abyssState.votes[p.id]));

    if (allVoted) {
      this.resolveAbyssChoiceVote();
    }
    return { success: true };
  }

  resolveAbyssChoiceVote() {
    if (!this.abyssState || this.abyssState.stage !== 3) return;
    const counts = { apology: 0, rational: 0, provoke: 0 };
    for (const cid of Object.values(this.abyssState.votes || {})) {
      if (counts[cid] !== undefined) counts[cid] += 1;
    }
    let max = -1;
    let winner = 'rational';
    for (const [cid, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        winner = cid;
      }
    }

    const choiceObj = ABYSS_DIALOGUES.choices.find(c => c.id === winner) || ABYSS_DIALOGUES.choices[1];
    this.abyssState.chosenChoice = winner;
    this.abyssState.modifiers = {
      atkMod: choiceObj.atkMod,
      defMod: choiceObj.defMod
    };

    const bossRole = this.abyssState.bossRole;
    this.abyssState.stage = 4;
    this.abyssState.dialogueText = ABYSS_DIALOGUES.bossDialogues[bossRole]?.stage3 || '……';
    this.abyssFlashRedEye = true;
    this.addLog(`🌑 小隊選擇了【${choiceObj.label}】！(${choiceObj.desc})`, 'warning');
    this.broadcastState();

    if (this.io && this.code) {
      this.emitPublic('abyss:red_eye_flash', {
        bossName: this.abyssState.bossName,
        choice: choiceObj
      });
    }

    setTimeout(() => {
      this.abyssFlashRedEye = false;
      this.broadcastState();
    }, 1500);
  }

  completeAbyssDialogue() {
    if (!this.abyssState) return;
    const bossTmpl = this.abyssState.bossTemplate;
    const modifiers = this.abyssState.modifiers;
    const col = this.abyssState.col;
    this.abyssState = null;
    this.abyssFlashRedEye = false;

    this.handleBattleEvent(null, false, {
      abyssBoss: bossTmpl,
      abyssModifiers: modifiers,
      col
    });
  }

  // 戰鬥結算
  resolveTurnActions() {
    if (this.persistence?.executionStopped(this)) return;
    this.clearTimer();
    this.selectionState = 'RESOLVING';
    this.isNarrating = true;
    this.refreshPrimaryMonster();
    let monster = this.currentMonster;
    const log = [];
    const visualEvents = [];
    const narratives = [];
    const presentationQueue = [];
    const arenaRoundPlayerId=(this.arena || this.enemyArena)?.playerId;
    const roundSkillSets = new Map(this.getCombatPlayers().map(p => [p.id, getPlayerSkills(p)]));
    this.p8LogBuffer=log;

    let bardDmgMultiplier = 1.0;
    
    let monsterAttackReduction = 0;
    let assassinDidCrit = false;
    
    
    this.augurReactions=[]; this.augurVisuals=visualEvents; this.p8Results=null;

    // ==========================================
    // PRE-RESOLUTION 階段
    // ==========================================
    // 1. 特殊規則：鍊金術士【腐蝕強酸瓶】或【不穩定試劑瓶】（50% 機率強酸）
    // 只要確認本回合使用腐蝕強酸瓶，必須在 PRE-RESOLUTION 階段就先套用 equipment modifier (全隊裝備效果降低 50%)。
    // IMPORTANT：此時不得顯示 Popup、Subtitle 或 Debuff Banner，提前播放任何提示動畫。
    // Logic timing ≠ Presentation timing，此效果隱蔽套用，直到鍊金術士演出時才揭露。
    // 嚴格保證僅限「本回合」，不得永久修改裝備屬性或跨回合疊加。
    for (const p of this.getCombatPlayers()) {
      if (p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && p.action === 'alc_flask') {
        if (!p.rolledFlaskDot) {
          const r = Math.random();
          p.rolledFlaskDot = r < 0.25 ? 'poison' : r < 0.50 ? 'burn' : r < 0.75 ? 'fracture' : 'chill';
        }
      }
    }
    const acidFlaskCount = this.getCombatPlayers().filter(p => p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && p.action === 'alc_acid').length;
    this.roundModifiers.equipmentEffectMultiplier = acidFlaskCount > 0 ? 0.5 : 1.0;
    this.roundModifiers.acidFlaskCount = acidFlaskCount;
    this.p8RefreshEquipment();

    // 改良型重弩：裝填動作預先啟用【架弩蹲伏】（減傷 20%、無法閃避）
    for (const p of this.getCombatPlayers()) {
      if (p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && p.druidForm !== 'tree') {
        if (p.action === 'a_reload' || p.action === 'a_frenzy_reload') {
          p.isCrouchedThisRound = true;
        }
      }
    }

    // 重設本回合催眠狀態
    this.monsterStunnedThisRound = false;
    for (const e of (this.enemies || [])) {
      if (e) e.stunnedThisRound = false;
    }

    // 1. 詩人增傷 50% / 狂亂殺戮曲 70%
    for (const p of this.getCombatPlayers()) {
      if (p.hp > 0 && !p.stunnedNextTurn && !p.isSurrendered && p.druidForm !== 'tree') {
        if (p.action === 'b_frenzy') {
          bardDmgMultiplier = Math.max(bardDmgMultiplier, 1.70);
          this.frenzyTeamDrainNextTurn = true;

          log.push({ text: `🪕🔥 **${p.name}** 奏響【狂亂殺戮曲】！激發癲狂戰意，全隊本回合造成的傷害提高 70%！(⚠️ 狂亂代價：下回合全隊將扣除 20% 最大生命！)`, type: 'buff' });
        } else if (p.action === 'b_buff') {
          const harpCount = (p.equips || []).filter(e => e.id === 'b_harp' || e.name === '精靈木豎琴').length;
          const buffBoost = 0.50;
          bardDmgMultiplier = Math.max(bardDmgMultiplier, 1.0 + buffBoost);

        }
      }
    }

    const galaxyResolved=new WeakSet();
    let phase8Actor = null;
    const applyResistanceDamage = (rawDmg, dmgType, options = {}) => {
      const targetEnemy = options.enemy || monster;
      if(!targetEnemy || targetEnemy.hp<=0)return {dmg:0,isResisted:false,resistPercent:0};
      if(targetEnemy.untargetableThisRound){beforeEnemyDamage(this,targetEnemy,rawDmg,dmgType);return {dmg:0,isResisted:false,resistPercent:0};}
      this.p8BossOutcome=null;
      const presentationCue={};this.p8DamagePresentationOutcomes?.push(presentationCue);
      if (!options.equation && dmgType!=='true') {
        const actor=options.actor||phase8Actor;
        const galaxy=this.p8Has(actor,'galaxy');
        rawDmg += galaxy?.separate || galaxy?.attackBonus !== undefined ? 0 : galaxy?.value || 0;
        if(actor?.action!=='basic' && !options.kind && !actor?.overloadAppliedThisAction) { rawDmg += this.p8Has(actor,'overload')?.value || 0; if(actor)actor.overloadAppliedThisAction=true; }
      }
      if(!options.equation) {
        const triumphActor=options.actor||phase8Actor;
        const triumph=this.p8Has(triumphActor,'triumph');
        if(triumph)rawDmg=Math.floor(rawDmg*(1+triumph.value/100));
        if(this.p8Has(targetEnemy,'dissociate') || (this.p8Has(targetEnemy,'sage_exposed')?.starts<=this.battleRound))rawDmg=Math.floor(rawDmg*1.1);
        const corrodeStacks = (targetEnemy.talismans || []).filter(t => t === 'corrode').length;
        if(corrodeStacks > 0) rawDmg = Math.floor(rawDmg * (1 + 0.25 * corrodeStacks));
        const flawStacks = Math.min(5, targetEnemy.flawMarks || 0);
        if(flawStacks > 0) rawDmg = Math.floor(rawDmg * (1 + 0.10 * flawStacks));
      }
      rawDmg=beforeEnemyDamage(this,targetEnemy,rawDmg,dmgType,options.actor||phase8Actor,options.kind||(this.enemyCounterResolution?'reaction':undefined),false);
      if(rawDmg<=0)return {dmg:0,isResisted:false,resistPercent:0};
      rawDmg=this.augmentOmenDamage(rawDmg,targetEnemy);
      if(options.equation&&rawDmg<=0)return {dmg:0,isResisted:false,resistPercent:0};
      const dream=this.p8DreamDamage(targetEnemy,rawDmg);
      if(dream) {
        this.p8BossOutcome=dream.outcome;
        presentationCue.type=dream.outcome;
        return {dmg:dream.damage,isResisted:false,resistPercent:0};
      }
      let computedDmg;
      let isResisted = false;
      let resistPercent = 0;
      if(this.arena || this.enemyArena || dmgType==='true') {
        computedDmg = Math.max(0,Math.floor(rawDmg));
      } else {
        const mirrored = Boolean(this.p8Has(targetEnemy, 'mirror'));
        const type = dmgType === 'phys' ? (mirrored ? 'magic' : 'physical') : (mirrored ? 'physical' : 'magic');
        resistPercent = Math.max(0, getBossResistance(targetEnemy, type)) * (1 - (options.penetration || 0));
        const finalDmg = mitigateDirectDamage(rawDmg,{damageType:dmgType,defense:resolveStats(targetEnemy).DEF,resistance:resistPercent});
        computedDmg = Math.max(1, finalDmg);
        isResisted = resistPercent > 0;
      }
      computedDmg=beforeEnemyDamage(this,targetEnemy,computedDmg,dmgType,null,options.kind);
      if(redirectEnemyDamage(this,targetEnemy,options.actor||phase8Actor,computedDmg,options.kind))return {dmg:0,isResisted:false,resistPercent:0};
      let shieldAbsorbed=0;
      if ((targetEnemy.tempHp || 0) > 0 && computedDmg > 0) {
        const absorbed = Math.min(targetEnemy.tempHp, computedDmg);
        targetEnemy.tempHp -= absorbed;shieldAbsorbed=absorbed;
        computedDmg = Math.max(0, computedDmg - absorbed);
      }
      this.enemyDamageReceipts?.push({enemyId:targetEnemy.instanceId,hpDamage:Math.min(targetEnemy.hp,computedDmg),absorbed:shieldAbsorbed});
      return { dmg: computedDmg, isResisted, resistPercent };
    };

    // Owner follow-up retains the existing damage formula and one hit per living minion.
    const resolveMinionFollowUp = p => {
      const before = this.getHpSnapshot();
      const results = [];
      if (p.hp > 0) for (const m of p.minions || []) {
        if (m.hp <= 0 || monster.hp <= 0) continue;
        const targetBefore = structuredClone(this.getHpSnapshot().monster);
        const { dmg } = applyResistanceDamage(Math.floor((m.type==='treant'?1:m.atk) * bardDmgMultiplier), 'phys', {actor:p,kind:'companion'});
        monster.hp = Math.max(0, monster.hp - dmg);
        if (dmg > 0) {
          for (const pal of this.getCombatPlayers()) {
            if (pal.role === 'paladin' && pal.paladinGloryCastedRound === this.battleRound) {
              pal.paladinGloryTrackedDamage = (pal.paladinGloryTrackedDamage || 0) + dmg;
            }
          }
        }
        const snapshot = this.getHpSnapshot();
        results.push({ kind: 'damage', targetId: 'monster', minion: structuredClone(m),
          targetBefore, targetAfter: snapshot.monster, damageType: 'physical',
          finalDamage: dmg, outcome: { type: 'normal' }, hpSnapshot: snapshot });
        log.push({ text: `🐾 **${m.name}** 主動出擊造成 **${dmg}** 點傷害！`, type: 'combat' });
      }
      if (results.length) presentationQueue.push({ type: 'minion_action', category: 'MINION_ATTACK',
        sourceId: p.id, sourceRole: p.role, sourceName: p.name, druidForm: p.druidForm,
        skillName: '自然夥伴・共擊', outcome: { type: 'normal' },
        targetId: 'monster', targetName: monster.name,
        monsterName: monster.name, monsterAvatar: monster.avatar,
        hpSnapshotBefore: before, hpSnapshot: this.getHpSnapshot(), results });
    };

    // 2. 玩家行動結算 (依照 Priority 順序：1.淨化 2.復活 3.防禦 4.增益 5.治療 6.變身/召喚 7.敵方減益 8.攻擊技能，同順位依穩定順序)
    const getEffectiveBonusAtk = (pl) => pl.role === 'assassin' ? this.getAssassinBonusAtk(pl) : this.getEffectiveBonusAtk(pl);
    const playerKeys = Object.keys(this.players);
    const sortedPlayers = this.getCombatPlayers()
      .filter(p => p.hp > 0)
      .sort((a, b) => {
        const prioA = getActionPriority(a.action);
        const prioB = getActionPriority(b.action);
        if (prioA !== prioB) return prioA - prioB;
        return playerKeys.indexOf(a.id) - playerKeys.indexOf(b.id);
      });

    const baseBardDmgMultiplier = bardDmgMultiplier;
    for (const p of sortedPlayers) {
      this.cleanGladiatorDebuffs(p);
      if (this.getLivingEnemies().length === 0) break;
      if (arenaRoundPlayerId && arenaRoundPlayerId !== p.id) continue;
      const targetEnemy = this.getTargetEnemy(p.targetEnemyId);
      if (targetEnemy) {
        this.currentMonster = targetEnemy;
        monster = targetEnemy;
      }
      if (!monster || monster.hp <= 0) break;
      beforePlayerAction(this,p);
      this.enemyDamageReceipts=[];
      const gloryBuff = (p.p8Shields || []).some(s => s.kind === 'paladin_glory' && s.value > 0 && s.until >= this.battleRound) ? 1.20 : 1.0;
      let leaderDmgMultiplier = 1.0;
      if (this.getEffectiveLeaderRole() === 'warrior' && (p.p8Shields || []).some(s => s.kind === 'warrior' && s.value > 0)) {
        leaderDmgMultiplier *= 1.10;
      }
      if (this.getEffectiveLeaderRole() === 'gladiator' && p.role === 'gladiator' && this.arena && this.arena.playerId === p.id) {
        leaderDmgMultiplier *= 1.10;
      }
      bardDmgMultiplier = baseBardDmgMultiplier * gloryBuff * leaderDmgMultiplier;
      phase8Actor=p;this.healingSourceId=p.id; p.overloadAppliedThisAction=false; this.p8Results=null;this.p8DamagePresentationOutcomes=[];
      const beforeVisualCount = visualEvents.length;
      const beforeLogCount = log.length;
      const monsterHpBefore = monster.hp;
      const actorHpBefore = p.hp;
      const actionBefore = this.getHpSnapshot();
      const augurReactionIndex=this.augurReactions.length;
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

      if (p.action === 'use_item_healing_potion') {
        let itemIdx = (p.bag || []).findIndex(i => i && (i.effectType === 'HEALING_POTION' || i.id === 'consumable_healing_potion'));
        let fromSquad = false;
        if (itemIdx === -1 && Array.isArray(this.squadInventory)) {
          itemIdx = this.squadInventory.findIndex(i => i && (i.effectType === 'HEALING_POTION' || i.id === 'consumable_healing_potion'));
          if (itemIdx !== -1) fromSquad = true;
        }
        const isAlchemist = p.role === 'alchemist';
        const target = (p.targetPlayerId && this.players[p.targetPlayerId]) ? this.players[p.targetPlayerId] : p;
        const before = this.getHpSnapshot();
        const results = [];
        const visualEvents = [];
        if (itemIdx !== -1) {
          const container = fromSquad ? this.squadInventory : p.bag;
          container.splice(itemIdx, 1);
          if (isAlchemist) {
            const selfHeal = this.applyHealWithOverheal(p, 40);
            visualEvents.push({ type: 'player_heal', sourceId: p.id, targetId: p.id, value: selfHeal, label: '治療藥' });
            const selfBefore = snapshotTarget(before, p.id);
            results.push({
              kind: 'heal',
              targetId: p.id,
              actualHeal: selfHeal,
              outcome: { type: 'normal' },
              targetBefore: structuredClone(selfBefore),
              targetAfter: structuredClone(p),
              hpSnapshot: this.getHpSnapshot()
            });
            const allyLogs = [];
            for (const ally of this.getCombatPlayers()) {
              if (ally.id !== p.id && ally.hp > 0) {
                const aHeal = this.applyHealWithOverheal(ally, 25);
                visualEvents.push({ type: 'player_heal', sourceId: p.id, targetId: ally.id, value: aHeal, label: '治療藥' });
                const aBefore = snapshotTarget(before, ally.id);
                results.push({
                  kind: 'heal',
                  targetId: ally.id,
                  actualHeal: aHeal,
                  outcome: { type: 'normal' },
                  targetBefore: structuredClone(aBefore),
                  targetAfter: structuredClone(ally),
                  hpSnapshot: this.getHpSnapshot()
                });
                allyLogs.push(`**${ally.name}**(+${aHeal})`);
              }
            }
            const allyText = allyLogs.length > 0 ? `，隊友 ${allyLogs.join('、')} 同步獲得回復` : '';
            log.push({
              text: `🧪⚗️ **${p.name}** 使用了【治療藥】，觸發煉金術士專屬藥效：自身恢復了 ${selfHeal} 點生命${allyText}！`,
              type: 'heal'
            });
          } else {
            if (target.hp > 0) {
              const healAmt = 35;
              const actualHeal = this.applyHealWithOverheal(target, healAmt);
              log.push({ text: `🧪 **${p.name}** 對 **${target.name}** 使用了【治療藥】，恢復了 ${actualHeal} 點生命值！`, type: 'heal' });
              visualEvents.push({ type: 'player_heal', sourceId: p.id, targetId: target.id, value: actualHeal, label: '治療藥' });
              const tBefore = snapshotTarget(before, target.id);
              results.push({
                kind: 'heal',
                targetId: target.id,
                actualHeal,
                outcome: { type: 'normal' },
                targetBefore: structuredClone(tBefore),
                targetAfter: structuredClone(target),
                hpSnapshot: this.getHpSnapshot()
              });
            } else {
              log.push({ text: `🧪 **${p.name}** 試圖對已倒下的 **${target.name}** 使用治療藥，但無濟於事！`, type: 'warning' });
            }
          }
        } else {
          log.push({ text: `🧪 **${p.name}** 翻找背包，但治療藥已經用盡！`, type: 'warning' });
        }
        const after = this.getHpSnapshot();
        presentationQueue.push({
          sourceId: p.id,
          sourceName: p.name,
          sourceRole: p.role,
          actionId: p.action,
          category: 'HEAL',
          skillName: '治療藥',
          tags: ['道具', '治療'],
          targetId: isAlchemist ? p.id : target.id,
          targetName: isAlchemist ? p.name : target.name,
          outcome: { type: 'normal' },
          narrative: isAlchemist
            ? `**${p.name}** 調配並飲用了特調應急治療藥，濃郁藥香與生機擴散至全隊！`
            : `**${p.name}** 從背包中取出應急治療藥，迅速為 **${target.name}** 注入治療藥劑！`,
          detail: isAlchemist ? `全隊恢復生命值` : `恢復生命值`,
          visualEvents,
          results,
          type: 'player_action',
          hpSnapshotBefore: before,
          hpSnapshot: after
        });
        resolveMinionFollowUp(p);
        continue;
      }

      if (p.action === 'use_item_antidote') {
        let itemIdx = (p.bag || []).findIndex(i => i && (i.effectType === 'ANTIDOTE' || i.id === 'consumable_antidote'));
        let fromSquad = false;
        if (itemIdx === -1 && Array.isArray(this.squadInventory)) {
          itemIdx = this.squadInventory.findIndex(i => i && (i.effectType === 'ANTIDOTE' || i.id === 'consumable_antidote'));
          if (itemIdx !== -1) fromSquad = true;
        }
        const target = (p.targetPlayerId && this.players[p.targetPlayerId]) ? this.players[p.targetPlayerId] : p;
        const before = this.getHpSnapshot();
        const results = [];
        const visualEvents = [];
        if (itemIdx !== -1) {
          const container = fromSquad ? this.squadInventory : p.bag;
          container.splice(itemIdx, 1);
          target.enemyEffects={};
          target.poisonTurns = 0;
          target.poisonDmg = 0;
          target.burnTurns = 0;
          target.burnDmg = 0;
          target.bleedTurns = 0;
          target.bleedDmg = 0;
          target.fractureTurns = 0;
          target.chillTurns = 0;
          target.corrosionTurns = 0;
          target.alcAcidEquipHalvedTurns = 0;
          log.push({ text: `🧪 **${p.name}** 對 **${target.name}** 使用了【解毒藥】，徹底清除了所有負面效果！`, type: 'heal' });
          visualEvents.push({ type: 'player_buff', sourceId: p.id, targetId: target.id, label: '解毒藥淨化' });
          const tBefore = snapshotTarget(before, target.id);
          results.push({
            kind: 'cleanse',
            targetId: target.id,
            outcome: { type: 'normal' },
            targetBefore: structuredClone(tBefore),
            targetAfter: structuredClone(target),
            hpSnapshot: this.getHpSnapshot()
          });
        } else {
          log.push({ text: `🧪 **${p.name}** 翻找背包，但解毒藥已經用盡！`, type: 'warning' });
        }
        const after = this.getHpSnapshot();
        presentationQueue.push({
          sourceId: p.id,
          sourceName: p.name,
          sourceRole: p.role,
          actionId: p.action,
          category: 'CLEANSE',
          skillName: '解毒藥',
          tags: ['道具', '淨化'],
          targetId: target.id,
          targetName: target.name,
          outcome: { type: 'normal' },
          narrative: `**${p.name}** 掏出特製解毒劑餵給 **${target.name}**，強效藥力迅速驅散了體內的毒素與負面狀態！`,
          detail: `清除負面狀態`,
          visualEvents,
          results,
          type: 'player_action',
          hpSnapshotBefore: before,
          hpSnapshot: after
        });
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
            const arrows=crossbowAllocations(p,p.ammo,this.statMultiplier(p));
            let burstCount=0;
            for(const arrow of arrows) {
              if(monster.hp<=0)break;
              const dmgType=arrow.kind==='pierce'?'phys':arrow.kind==='elemental'?'mag':'true';
              const label=arrow.kind==='pierce'?'穿甲箭':arrow.kind==='elemental'?'元素箭':'爆裂箭';
              const raw=Math.floor(this.applyFateBlessing(p,arrow.damage)*bardDmgMultiplier);
              const {dmg}=applyResistanceDamage(raw,dmgType,{kind:'volley',actor:p,penetration:arrow.kind==='pierce'?1:0});
              const actual=Math.min(monster.hp,dmg);
              monster.hp-=actual;
              visualEvents.push({type:'player_attack',sourceId:p.id,target:'monster',dmgType,value:actual,isCrit:false,label,ammoType:arrow.kind,segmentIndex:arrow.index,eventKind:'multi_hit'});
              if(arrow.kind==='burst') {
                burstCount++;
                const paid=Math.min(p.hp,actual);p.hp-=paid;
                visualEvents.push({type:'self_damage',sourceId:p.id,targetId:p.id,dmgType:'true',value:paid,label:'爆裂自傷'});
              }
              log.push({text:`🏹 **${p.name}**【重弩齊射・${label}】基礎 ${arrow.damage}，實際造成 **${actual}** 傷害。`,type:'combat'});
            }
            if(p.hp<=0) {
              p.hp = 0;
              this.clearPlayerDebuffs(p);
              log.push({ text: `💥 **${p.name}** 遭受爆裂弩箭反噬重創！不幸陣亡！💀`, type: 'damage' });
            }
            p.ammo = [];
            actionOutcome = { type: 'volley', label: '重弩齊射', secondary: burstCount > 0 ? '爆裂自傷' : `${count}連發` };
            break;
          }

          const dmgType = basicDamageType(p.role);
          const baseAtk = this.applyFateBlessing(p,this.skillValue(p,'basic'));
          let basicCrit = (p.role === 'assassin' && this.battleCount === 1 && this.battleRound === 1 && !p.hasDealtFirstBattleCrit && !p.cannotCrit);
          if (!basicCrit && p.role === 'assassin') {
            const baseRate = Math.round(assassinCritRate(p, this.roundModifiers.equipmentEffectMultiplier) * 100);
            basicCrit = this.roleRandom(p,'basic',()=>this.intervenePositive(p, '普通攻擊・暴擊', baseRate).success?'success':'failure')==='success';
          }
          if (p.role === 'assassin' && basicCrit) {
            p.hasDealtFirstBattleCrit = true;
          }
          const raw = Math.floor((baseAtk) * (basicCrit ? 2 : 1) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, dmgType);
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
          const typeNote = dmgType === 'mag' ? '【魔法】' : '【物理】';
          log.push({ text: `🗡️ **${p.name}** 施展${typeNote}【普通攻擊】${basicCrit ? '（暴擊！）' : ''}，對怪物造成 **${dmg}** 點傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType, value: dmg, isCrit: basicCrit, label: '普通攻擊' });
          if (p.role === 'assassin' && p.cannotCrit) p.cannotCrit = false;
          if (p.role === 'paladin') {
            const shieldGained = Math.min(monsterHpBefore, dmg) * 2;
            if (this.getEffectiveLeaderRole() === 'paladin') {
              for (const ally of this.getCombatPlayers().filter(x => x.hp > 0)) {
                this.p8GrantShield(ally, shieldGained, Infinity, 'paladin_basic');
              }
              log.push({ text: `🛡️✨ **【聖光庇護】** 聖騎士隊長聖光普照！全體隊員皆獲得了基於普攻傷害 2 倍的護盾（**${shieldGained}** 點，無回合限制）！`, type: 'buff' });
            } else {
              this.p8GrantShield(p, shieldGained, Infinity, 'paladin_basic');
              log.push({ text: `🛡️✨ **${p.name}** 獲得了基於普攻造成傷害 2 倍的護盾（**${shieldGained}** 點，無回合限制）！`, type: 'buff' });
            }
          }
          if (p.role === 'alchemist') {
            // Reuse the enemy roll. When corrosion already procs at its base rate,
            // check its backlash before spending the intervention on a positive boost.
            const corrosionRoll=p.rollCorrosion !== undefined ? (p.rollCorrosion?0:100) : Math.random()*100;
            const hasAugur=this.getCombatPlayers().some(a=>a.hp>0 && a.role==='augur' && a.observedTargetId===p.id && !a.augurIntervenedThisRound);
            const negative=hasAugur && corrosionRoll<70
              ? (p.rollTeamCorrosion !== undefined ? {failed:p.rollTeamCorrosion,intercepted:false} : this.interveneNegative(p,'普通攻擊・全隊腐蝕',35))
              : null;
            const rollCorrosion = negative?.intercepted ? true : hasAugur?this.intervenePositive(p,'普通攻擊・腐蝕',70,corrosionRoll).success:corrosionRoll<70;
            if (rollCorrosion) {
              const bossCorroded = this.applyMonsterCorrosion(1);
              let teamCorroded = false;
              const rollTeam = negative?.failed ?? (p.rollTeamCorrosion !== undefined ? p.rollTeamCorrosion : this.interveneNegative(p,'普通攻擊・全隊腐蝕',35).failed);
              if (rollTeam) {
                teamCorroded = true;
                for (const ally of this.getCombatPlayers().filter(x => x.hp > 0)) {
                  this.applyCorrosionToAlly(ally, 1);
                }
                this.p8RefreshEquipment();
              }
              const bNote = bossCorroded ? '【腐蝕】成功侵蝕首領（血量上限與傷害降低 5%，持續 1 回合）！' : '首領免疫本次腐蝕！';
              const tNote = teamCorroded ? '⚠️ 腐蝕濺射波及全隊！我方全體裝備效果減半 1 回合！' : '';
              log.push({ text: `🧪 **${p.name}** 觸發了腐蝕效果！${bNote}${tNote}`, type: 'buff' });
              actionOutcome = { type: 'alchemy_corrosion_trigger', label: '腐蝕觸發', secondary: teamCorroded ? '波及全隊' : '首領腐蝕' };
              visualEvents.push({ type: 'corrosion_trigger', sourceId: p.id, teamCorrosion: teamCorroded });
            }
            // 普攻 15% 機率在個人背包獲得恢復藥
            this.grantAlchemistPotion(p, log, visualEvents, '普通攻擊');
          }
          if (p.role === 'onmyoji') {
            const hasBrush = (p.equips || []).some(e => e.id === 'onm_brush');
            if (hasBrush) {
              const brushRoll = typeof p.rollBrushTalisman === 'number' ? p.rollBrushTalisman : Math.random();
              if (brushRoll < 0.25) {
                monster.talismans = monster.talismans || [];
                if (monster.talismans.length < 10) {
                  const TALISMANS = ['blind', 'seal', 'corrode', 'confuse', 'drain'];
                  const talisman = this.roleRandom(p,'onm_brush_type',()=>p.rolledTalisman || TALISMANS[Math.floor(Math.random() * TALISMANS.length)]);
                  monster.talismans.push(talisman);
                  const count = monster.talismans.length;
                  const TALISMAN_NAMES = { blind: '障目符', seal: '封勁符', corrode: '蝕體符', confuse: '惑心符', drain: '抽髓符' };
                  log.push({ text: `📜🖌️ **${p.name}**【硃砂引靈筆】靈光顯現！普通攻擊額外依附了一道【五鬼攝魂符・${TALISMAN_NAMES[talisman]}】！（目前累積 ${count}/10 張符咒，無回合限制）`, type: 'buff' });
                  if (talisman === 'drain') {
                    const drainCount = monster.talismans.filter(t => t === 'drain').length;
                    const singleDrain = Math.max(1, Math.floor(monster.maxHp * 0.05));
                    const totalDrain = monster.untargetableThisRound ? 0 : this.augmentOmenDamage(singleDrain * drainCount);
                    monster.hp = Math.max(0, monster.hp - totalDrain);
                    const drainNote = drainCount > 1 ? `（觸發 ${drainCount} 重削血，共扣除 ${totalDrain} 點）` : `（扣除 ${totalDrain} 點）`;
                    log.push({ text: `📜💀 **【抽髓符】** 削血觸發！扣除目標最大生命值 5% 的血量${drainNote}！（❤️ 魔物 HP: ${monster.hp}/${monster.maxHp}）`, type: 'combat' });
                    visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: totalDrain, isCrit: false, label: '抽髓符' });
                  } else {
                    visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: 0, isCrit: false, label: TALISMAN_NAMES[talisman] });
                  }
                } else {
                  log.push({ text: `📜⚠️ **${p.name}**【硃砂引靈筆】觸發貼符，但目標身上的符咒已達上限（10 張）！`, type: 'warning' });
                }
              }
            }
          }
          break;
        }
        case 'w_strike': {
          this.p8Effect(p,'warrior_resolve','堅定・減傷 60%',3,{icon:'guard'});
          const hasGreatsword = (p.equips || []).some(e => e.id === 'w_greatsword' || e.name === '雙手劍');
          const normalBase = this.applyFateBlessing(p, this.skillValue(p,'w_strike'));
          const isUnbalanced = (this.roleRandom(p,'w_strike',()=>this.interveneNegative(p, '堅定斬擊・揮砍失衡', 20).failed?'negative':'normal')==='negative');
          if (isUnbalanced) actionOutcome = { type: 'imbalance', label: '失衡', secondary: '下回合易傷' };
          if (isUnbalanced) {
            const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'w_miss'))) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            p.warriorVulnerableNextTurn = true;
            const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🛡️⚠️ **${p.name}** 揮動巨劍時【揮砍失衡】！僅造成 **${dmg}** 點【物理】傷害${resNote}，失去重心導致下回合自身受傷 +20%！`, type: 'warning' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '堅定斬擊(失衡)' });
          } else {
            const raw = Math.floor((normalBase) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
            log.push({ text: `🛡️ **${p.name}** 揮動巨劍斬擊，對怪物造成 **${dmg}** 點【物理】重創！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '堅定斬擊' });
          }
          break;
        }
        case 'w_shield': {
          const baseShield = this.applyFateBlessing(p, this.skillValue(p,'w_shield'));
          for(const ally of this.getCombatPlayers().filter(x=>x.hp>0))this.p8GrantShield(ally,baseShield,1,'warrior');
          const isCracked = (this.roleRandom(p,'w_shield',()=>this.interveneNegative(p, '壁壘守護・盾牌龜裂', 25).failed?'negative':'normal')==='negative');
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
          const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'w_cleave'))) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
          log.push({ text: `⚔️ **${p.name}** 雙手緊握巨劍掀起暴風，發動【狂怒重劈】造成 **${dmg}** 點【物理】重創！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '狂怒重劈' });
          break;
        }
        case 'm_blast': {
          const isBackfire = (this.roleRandom(p,'m_blast',()=>this.interveneNegative(p, '奧術爆破・法力走火', 25).failed?'negative':'normal')==='negative');
          if (isBackfire) actionOutcome = { type: 'misfire', label: '法力走火' };
          const secTargets = this.getAttackableEnemies(p).filter(t => t !== monster);
          if (isBackfire) {
            const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'m_miss'))) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
            monster.hp -= dmg;
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: isBackfire ? '奧術爆破(走火)' : '奧術爆破' });
            for (const sec of secTargets) {
              const secRaw = Math.floor((this.applyFateBlessing(p, this.skillValue(p, 'm_secondary_miss'))) * bardDmgMultiplier);
              const {dmg:secDmg} = applyResistanceDamage(secRaw, 'mag', {enemy:sec});
              sec.hp = Math.max(0, sec.hp - secDmg);
              visualEvents.push({ type: 'player_attack', sourceId: p.id, target: sec.instanceId, targetEnemyId: sec.instanceId,
                isSecondaryEnemy: true, dmgType: 'mag', value: secDmg, label: '奧術爆破・次要目標' });
            }
            p.hp = Math.max(0, p.hp - 10);
            const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
            log.push({ text: `🧙‍♂️💥 **${p.name}** 引導【奧術爆破】不幸【法力走火】！僅造成 **${dmg}** 點【魔法】傷害${resNote}，且自身受到 **10** 點反噬自傷！（❤️ ${p.hp}/${p.maxHp}）`, type: 'damage' });

            visualEvents.push({ type: 'self_damage', targetId: p.id, value: 10 });
            if (p.hp <= 0) {
              p.hp = 0;
              this.clearPlayerDebuffs(p);
              log.push({ text: `💀 **${p.name}** 因奧術法力走火反噬過重倒地陣亡！`, type: 'damage' });
            }
          } else {
            const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'m_blast'))) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
            monster.hp -= dmg;
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: isBackfire ? '奧術爆破(走火)' : '奧術爆破' });
            for (const sec of secTargets) {
              const secRaw = Math.floor((this.applyFateBlessing(p, this.skillValue(p, 'm_secondary'))) * bardDmgMultiplier);
              const secDmg = mitigateDirectDamage(secRaw, { damageType: 'mag', defense: sec.DEF || sec.defense || 0, resistance: sec.resistances?.magic || 0 });
              sec.hp = Math.max(0, sec.hp - secDmg);
              visualEvents.push({ type: 'player_attack', sourceId: p.id, target: sec.instanceId, targetEnemyId: sec.instanceId,
                isSecondaryEnemy: true, dmgType: 'mag', value: secDmg, label: '奧術爆破・次要目標' });
            }
            const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
            log.push({ text: `🧙‍♂️ **${p.name}** 引爆【奧術爆破】，轟出 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });

          }

          // 嗜血法袍特殊效果
          const robeCount = (p.equips || []).filter(e => e.id === 'm_robe' || e.name === '嗜血法袍').length;
          if (robeCount > 0 && monster.hp > 0 && !monster.untargetableThisRound) {
            const extraDmgRaw = Math.floor((monster.maxHp || monster.hp) * 0.10 * robeCount);
            const actualBonus = Math.min(monster.hp, Math.max(1, extraDmgRaw));
            monster.hp -= actualBonus;
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', targetEnemyId: monster.instanceId, dmgType: 'mag', value: actualBonus, label: '嗜血法袍' });
            for (const ally of this.getCombatPlayers()) {
              if (ally.hp > 0) this.applyHealWithOverheal(ally, actualBonus);
            }
            log.push({ text: `🩸 **${p.name}** 觸發【嗜血法袍】！額外撕裂目標 **${actualBonus}** 點生命，並轉化血氣為全體隊友回復 **${actualBonus}** 點生命！`, type: 'heal' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: actualBonus, singleTargetId: null, singleValue: 0 });
          }
          break;
        }
        case 'm_drain': {
          const rawBase = Number(this.roleRandom(p,'m_drain',()=>Math.floor(Math.random() * this.skillValue(p,'m_drain_max')) + 1)); // 正式浮動範圍：1..m_drain_max
          const raw = Math.floor((this.applyFateBlessing(p, rawBase)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const baseHealAmt = Math.max(0, Math.round(Math.min(monsterHpBefore, dmg) * 0.2));
          const healAmt = this.applyFateBlessing(p, baseHealAmt);
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
            for (const ally of this.getCombatPlayers()) {
              if (ally.hp > 0) this.applyHealWithOverheal(ally, actualBonus);
            }
            log.push({ text: `🩸 **${p.name}** 觸發【嗜血法袍】！額外撕裂目標 **${actualBonus}** 點生命，並轉化血氣為全體隊友回復 **${actualBonus}** 點生命！`, type: 'heal' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: actualBonus, singleTargetId: null, singleValue: 0 });
          }
          break;
        }
        case 'a_shot': {
          // 【標記射擊】目標／傷害類型：單體敵方／魔法 (CD 2回合)
          // 拉滿弓弦狙擊單一目標，正常命中造成 6 + 100% × A 點魔法傷害，並在目標身上附加 1 層「破綻印記」。
          // 每層印記對該敵方造成易傷效果(提高受到傷害10%)，以及命中提高的效果(降低效果命中10%)，最多5層，沒有回合限制。
          const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p, 'a_shot'))) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag', { enemy: monster });
          monster.hp -= dmg;
          monster.flawMarks = Math.min(5, (monster.flawMarks || 0) + 1);
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          log.push({
            text: `🏹✨ **${p.name}** 施展【標記射擊】，凝聚魔力射出破綻狙擊箭，造成 **${dmg}** 點【魔法】傷害${resNote}！並附加 1 層【破綻印記】（目標累積 ${monster.flawMarks}/5 層破綻）！`,
            type: 'combat'
          });
          actionOutcome = { type: 'normal', label: '標記射擊', secondary: `破綻印記 ${monster.flawMarks}層` };
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '標記射擊' });
          visualEvents.push({ type: 'enemy_debuff', targetId: 'monster', label: `破綻印記(${monster.flawMarks})`, icon: 'flaw_mark' });
          break;
        }
        case 'a_rain': {
          // 【封鎖箭雨】目標／傷害類型：群體敵方／物理 (CD 1回合)
          // 射出10枝箭的箭雨，每支箭造成 50% × A 物理攻擊，每支箭皆有50%機率為命中敵方。
          // 未命中箭矢殘留在地表形成持續2回合的「箭刺陷阱區域」。「箭刺陷阱區域」使得每次敵方行動皆會受到25%× A的物理傷害。
          const totalArrows = 10;
          let hitsCount = 0;
          let missCount = 0;
          const P = resolveSkillAttack({ actor: p, damageType: 'phys', equipmentMultiplier: this.statMultiplier(p) });
          const arrowBaseRaw = Math.max(1, Math.round(this.skillValue(p, 'a_rain_arrow')));
          const arrowRaw = Math.floor((this.applyFateBlessing(p, arrowBaseRaw)) * bardDmgMultiplier);

          const targetDmgMap = new Map();
          const targetHitsMap = new Map();

          const reservedArrows=this.roleRandom(p,'a_rain',()=>null);
          for (let i = 0; i < totalArrows; i++) {
            const currentLiving = this.getAttackableEnemies(p);
            if (currentLiving.length === 0) {
              missCount += (totalArrows - i);
              break;
            }
            // 輪流分配箭矢目標給存活敵方
            const target = currentLiving[i % currentLiving.length];
            const flawStacks = Math.min(5, target.flawMarks || 0);
            // 破綻印記：每層提高 10% 受到攻擊命中率（基礎 50%）
            const hitChance = Math.min(1.0, 0.50 + 0.10 * flawStacks);
            const isHit = reservedArrows===null?Math.random()<hitChance:reservedArrows==='hit';

            if (isHit) {
              hitsCount++;
              const { dmg } = applyResistanceDamage(arrowRaw, 'phys', { enemy: target });
              const actual = Math.min(target.hp, dmg);
              target.hp = Math.max(0, target.hp - actual);
              targetDmgMap.set(target, (targetDmgMap.get(target) || 0) + actual);
              targetHitsMap.set(target, (targetHitsMap.get(target) || 0) + 1);
            } else {
              missCount++;
            }
          }

          let totalDmg = 0;
          // 主要目標視覺與傷害結算
          const primaryDmg = targetDmgMap.get(monster) || 0;
          totalDmg += primaryDmg;
          visualEvents.push({
            type: 'player_attack',
            sourceId: p.id,
            target: 'monster',
            dmgType: 'phys',
            value: primaryDmg,
            isCrit: false,
            label: '封鎖箭雨'
          });

          // 次要目標視覺與傷害結算
          for (const otherEnemy of targetDmgMap.keys()) {
            if (otherEnemy === monster) continue;
            const otherDmg = targetDmgMap.get(otherEnemy) || 0;
            totalDmg += otherDmg;
            if (otherDmg > 0 || targetHitsMap.get(otherEnemy)) {
              visualEvents.push({
                type: 'player_attack',
                sourceId: p.id,
                target: otherEnemy.instanceId,
                targetEnemyId: otherEnemy.instanceId,
                isSecondaryEnemy: true,
                dmgType: 'phys',
                value: otherDmg,
                isCrit: false,
                label: '封鎖箭雨'
              });
            }
          }

          // 未命中箭矢殘留在地表形成持續2回合的「箭刺陷阱區域」
          let trapText = '';
          if (missCount > 0) {
            this.arrowTrap = {
              turns: 2,
              atk: P,
              sourceId: p.id,
              sourceName: p.name,
              missArrows: missCount
            };
            trapText = `，**${missCount}** 支未命中箭矢釘入地面，形成持續 2 回合的【箭刺陷阱區域】（敵方行動時受 25%×A 物理傷害）！`;
          } else {
            trapText = `，10 支箭矢全部精準命中！`;
          }

          log.push({
            text: `🏹🌧️ **${p.name}** 射出【封鎖箭雨】（共 10 支箭矢），命中 **${hitsCount}** 支，造成共 **${totalDmg}** 點【物理】傷害${trapText}`,
            type: 'combat'
          });
          actionOutcome = {
            type: 'rain',
            label: '封鎖箭雨',
            secondary: `${hitsCount}中/${missCount}地刺`
          };
          break;
        }
        case 'a_reload': {
          p.ammo = p.ammo || [];
          const acidLayers = (this.roundModifiers?.acidFlaskCount || 0) + (p.alcAcidStack || 0);
          // 每層腐蝕效果將減少一隻箭矢裝填，最低保底裝一箭矢
          const reloadCount = Math.max(1, 1 - acidLayers);
          let newAmmo = null;
          if (p.ammo.length < 3 && reloadCount > 0) {
            newAmmo = this.roleRandom(p,'a_reload',()=>rollCrossbowAmmo());
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
            const a = i===0?this.roleRandom(p,'a_frenzy_reload',()=>rollCrossbowAmmo()):rollCrossbowAmmo();
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
          const isGuaranteedCrit = (this.battleCount === 1 && this.battleRound === 1 && !p.hasDealtFirstBattleCrit && !p.cannotCrit);
          let isCrit = isGuaranteedCrit;
          if (!isCrit) {
            const baseCritRate = Math.round(assassinCritRate(p, this.roundModifiers.equipmentEffectMultiplier) * 100);
            isCrit = this.roleRandom(p,'s_stab',()=>this.intervenePositive(p, '暗影刺殺・暴擊', baseCritRate).success?'success':'failure')==='success';
          }
          if (isCrit) {
            p.hasDealtFirstBattleCrit = true;
          }
          const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'s_stab'))) * (isCrit ? 2 : 1) * bardDmgMultiplier);
          const { dmg } = applyResistanceDamage(raw, 'phys'); monster.hp -= dmg;
          p.assassinSkill1Crit = isCrit; assassinDidCrit = isCrit;
          actionOutcome = { type: isCrit ? 'critical' : 'normal', label: isCrit ? 'CRITICAL' : '', secondary: isCrit ? '冷卻重置' : '' };
          log.push({ text: `**${p.name}** 暗影刺殺${isCrit ? '暴擊・冷卻重置' : ''}，造成 **${dmg}** 點傷害。`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit, label: '暗影刺殺' });
          break;
        }
        case 's_smoke': {
          consumedStacks = p.stealthStacks || 0; p.stealthStacks = 0;
          const base = this.applyFateBlessing(p, this.skillValue(p,'s_smoke',{stacks:consumedStacks}));
          // null eligibility deliberately rolls no crit until specification is confirmed.
          const { dmg } = applyResistanceDamage(Math.floor((base) * bardDmgMultiplier), 'phys');
          monster.hp -= dmg;
          log.push({ text: `**${p.name}** 消耗 ${consumedStacks} 層【匿蹤】發動暗影爆襲，造成 **${dmg}** 點傷害。`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '暗影爆襲' });
          break;
        }
        case 'b_heal': {
          const harpCount = (p.equips || []).filter(e => e.id === 'b_harp' || e.name === '精靈木豎琴').length;
          const harpMult = 1 + 0.10 * harpCount;
          const isOffKey = (this.roleRandom(p,'b_heal',()=>this.interveneNegative(p, '治癒頌歌・走音', 20).failed?'negative':'normal')==='negative');
          if (isOffKey) actionOutcome = { type: 'off_key', label: '走音' };

          if (isOffKey) {
            const groupHeal = Math.round(this.applyFateBlessing(p, this.skillValue(p,'b_miss')) * harpMult);
            for (const ally of this.getCombatPlayers()) {
              if (ally.hp > 0) this.applyHealWithOverheal(ally, groupHeal);
            }
            log.push({ text: `🪕😖 **${p.name}** 撥弄琴弦時【刺耳走音】！刺耳噪音打亂了旋律，全體隊友僅能回復 **${groupHeal}** 點生命！`, type: 'warning' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: groupHeal, singleTargetId: null, singleValue: 0 });
          } else {
            const bardLeaderBonus = (this.getEffectiveLeaderRole() === 'bard') ? 1.10 : 1.0;
            const groupHealAmt = Math.round(this.applyFateBlessing(p, this.skillValue(p,'b_heal')) * harpMult * bardLeaderBonus);
            const singleHealAmt = Math.round(this.applyFateBlessing(p, this.skillValue(p,'b_single')) * harpMult * bardLeaderBonus);

            for (const ally of this.getCombatPlayers()) {
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
          const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'b_nocturne'))) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const isStun = (this.roleRandom(p,'b_nocturne',()=>this.intervenePositive(p, '催眠夜曲・深度催眠', 30).success?'success':'failure')==='success') && this.monsterAllowsEffect('催眠', monster);
          if (isStun) {
            actionOutcome = { type: 'sleep', label: '催眠成功' };
            monster.stunnedThisRound = true;
            this.monsterStunnedThisRound = this.getLivingEnemies().every(e => e.stunnedThisRound);
            log.push({ text: `🪕💤 **${p.name}** 奏響【催眠夜曲】，造成 **${dmg}** 點【魔法】傷害${resNote}！魔性琴音成功催眠 **${monster.name}**，使其本回合無法行動！`, type: 'combat' });
          } else {
            log.push({ text: `🪕 **${p.name}** 奏響【催眠夜曲】，造成 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
          }
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', targetEnemyId: monster.instanceId, dmgType: 'mag', value: dmg, isCrit: false, label: '催眠夜曲' });
          break;
        }
        case 'b_frenzy': {
          const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'b_frenzy'))) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          log.push({ text: `🪕🔥 **${p.name}** 奏響【狂亂殺戮曲】，轟出 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '狂亂殺戮曲' });
          break;
        }
        case 'b_buff': {
          this.bardBuffActive = true;
          visualEvents.push({type:'bard_buff',sourceId:p.id});
          log.push({text:`🪕 **${p.name}** 奏響【狂熱協奏】！全隊本回合造成傷害提高 50%。`,type:'buff'});
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
          const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'alc_flask'))) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;

          const DOTS = ['poison', 'burn', 'fracture', 'chill'];
          let chosenDot = this.roleRandom(p,'alc_flask',()=>p.rolledFlaskDot || p.rolledFlaskType);
          if (!chosenDot || !DOTS.includes(chosenDot)) {
            const r = Math.random();
            if (r < 0.25) chosenDot = 'poison';
            else if (r < 0.50) chosenDot = 'burn';
            else if (r < 0.75) chosenDot = 'fracture';
            else chosenDot = 'chill';
          }

          const DOT_CONFIGS = {
            poison: { type: 'alchemy_poison', label: '劇毒煙霧', name: '中毒', icon: '🧪', turns: 2, dmg: this.skillValue(p,'poison'), applyMonster: (d, target) => this.applyMonsterPoison(d, 2, target) },
            burn: { type: 'alchemy_burn', label: '燃燒試劑', name: '燃燒', icon: '🔥', turns: 1, dmg: this.skillValue(p,'burn'), applyMonster: (d, target) => this.applyMonsterBurn(d, 1, target) },
            fracture: { type: 'alchemy_fracture', label: '骨折衝擊', name: '骨折', icon: '🦴', turns: 3, dmg: this.skillValue(p,'fracture'), applyMonster: (d, target) => this.applyMonsterFracture(d, 3, target) },
            chill: { type: 'alchemy_chill', label: '極寒冰霜', name: '寒冷', icon: '❄️', turns: 2, dmg: this.skillValue(p,'chill'), applyMonster: (d, target) => this.applyMonsterChill(d, 2, target) }
          };
          const dotCfg = DOT_CONFIGS[chosenDot] || DOT_CONFIGS.poison;
          const bossApplied = dotCfg.applyMonster(dotCfg.dmg, monster);

          const rollTeam = p.rollTeamDot !== undefined ? p.rollTeamDot : (this.roleRandom(p,'alc_team',()=>this.interveneNegative(p, '不穩定試劑瓶・全體同染', 40).failed?'success':'failure')==='success');
          if (rollTeam) {
            for (const ally of this.getCombatPlayers().filter(x => x.hp > 0)) {
              this.applyDotToAlly(ally, chosenDot, p);
            }
          }

          actionOutcome = {
            type: dotCfg.type,
            label: dotCfg.label,
            secondary: rollTeam ? '全隊同步波及' : undefined
          };

          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          const bossNote = bossApplied ? `敵方陷入【${dotCfg.name}】（每回合 ${dotCfg.dmg} 點，持續 ${dotCfg.turns} 回合）` : `敵方免疫本次【${dotCfg.name}】`;
          const hasBurette = (p.equips || []).some(e => e.id === 'alc_burette' || e.name === '精密滴管' || e.name === '精密滴定管');
          const buretteNote = hasBurette ? '（🧪精密滴管使 DoT 傷害降低 50%）' : '';
          const teamNote = rollTeam ? `⚠️ 藥劑劇烈飛濺！我方全體同步陷入【${dotCfg.name}】${buretteNote}！` : '';
          log.push({
            text: `${dotCfg.icon} **${p.name}** 投擲【不穩定試劑瓶】引發【${dotCfg.label}】！造成 **${dmg}** 點【魔法】傷害！${resNote}\n${bossNote}！${teamNote}`,
            type: 'combat'
          });
          visualEvents.push({
            type: 'player_attack',
            sourceId: p.id,
            target: 'monster',
            dmgType: 'mag',
            value: dmg,
            isCrit: false,
            label: `不穩定試劑瓶(${dotCfg.name})`
          });
          for (const otherEnemy of this.getAttackableEnemies(p).filter(e => e !== monster)) {
            const nonPrimaryRaw = Math.floor(raw * 0.5);
            const { dmg: otherDmg, isResisted: otherResisted, resistPercent: otherResPct } = applyResistanceDamage(nonPrimaryRaw, 'mag', { enemy: otherEnemy });
            otherEnemy.hp = Math.max(0, otherEnemy.hp - otherDmg);
            const otherApplied = Math.random() < 0.5 && dotCfg.applyMonster(dotCfg.dmg, otherEnemy);
            const otherResNote = otherResisted ? ` (🔮抗性減免${otherResPct}%)` : '';
            const otherDotNote = otherApplied ? ` **${otherEnemy.name}** 陷入【${dotCfg.name}】（每回合 ${dotCfg.dmg} 點，持續 ${dotCfg.turns} 回合）！` : '';
            log.push({ text: `${dotCfg.icon} **${p.name}** 的【不穩定試劑瓶】飛濺波及 **${otherEnemy.name}**，造成 **${otherDmg}** 點【魔法】濺射傷害！${otherResNote}${otherDotNote}`, type: 'combat' });
            visualEvents.push({
              type: 'player_attack',
              sourceId: p.id,
              target: otherEnemy.instanceId,
              targetEnemyId: otherEnemy.instanceId,
              isSecondaryEnemy: true,
              dmgType: 'mag',
              value: otherDmg,
              isCrit: false,
              label: `不穩定試劑瓶(濺射)`
            });
          }
          // 1技能 15% 機率在個人背包獲得恢復藥
          this.grantAlchemistPotion(p, log, visualEvents, '不穩定試劑瓶');
          break;
        }

        case 'alc_acid': {
          actionOutcome = { type: 'alchemy_acid', label: '腐蝕強酸' };
          const buretteCount = (p.equips || []).filter(e => e.id === 'alc_burette' || e.name === '精密滴定管' || e.name === '精密滴管').length;
          const selfDmg = 0;
          const raw = Math.floor((this.applyFateBlessing(p, 40) + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '腐蝕強酸瓶' });
          for (const otherEnemy of this.getAttackableEnemies(p).filter(e => e !== monster)) {
            const nonPrimaryRaw = Math.floor(raw * 0.5);
            const { dmg: otherDmg, isResisted: otherResisted, resistPercent: otherResPct } = applyResistanceDamage(nonPrimaryRaw, 'mag', { enemy: otherEnemy });
            otherEnemy.hp = Math.max(0, otherEnemy.hp - otherDmg);
            const otherResNote = otherResisted ? ` (🔮抗性減免${otherResPct}%)` : '';
            log.push({ text: `⚗️ **${p.name}** 的【腐蝕強酸瓶】飛濺波及 **${otherEnemy.name}**，造成 **${otherDmg}** 點【魔法】濺射傷害！${otherResNote}`, type: 'combat' });
            visualEvents.push({
              type: 'player_attack',
              sourceId: p.id,
              target: otherEnemy.instanceId,
              targetEnemyId: otherEnemy.instanceId,
              isSecondaryEnemy: true,
              dmgType: 'mag',
              value: otherDmg,
              isCrit: false,
              label: '腐蝕強酸瓶(濺射)'
            });
          }
          for(const ally of this.getCombatPlayers().filter(x=>x.hp>0)) {
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
          const raw = Math.floor((this.applyFateBlessing(p, 30) + getEffectiveBonusAtk(p)) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp -= dmg;
          p.hp = Math.max(0, p.hp - selfDmg);
          const addedPoisonDmg = 5;
          const bossPoisoned = this.applyMonsterPoison(addedPoisonDmg);
          for (const pl of this.getCombatPlayers()) {
            if (pl.hp > 0 && pl.role !== 'gladiator') {
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
          const hasAbnormalStatus = (Object.values(p.enemyEffects||{}).some(e=>e.until>=this.battleRound) || (this.roundModifiers?.acidFlaskCount||0)>0 || (this.roundModifiers?.equipmentEffectMultiplier??1)<1 || p.alcAcidStack>0 || p.poisonTurns > 0 || p.burnTurns > 0 || p.fractureTurns > 0 || p.chillTurns > 0 || p.corrosionTurns > 0 || p.bleedTurns > 0 || p.stunnedNextTurn || p.nextTurnStunFlag || p.isSurrendered || p.cannotCrit);

          const reservedFate=hasAbnormalStatus?this.roleRandom(p,'alc_fate',()=>null):null;
          for (const ally of this.getCombatPlayers().filter(ally => ally.hp > 0)) {
            ally.enemyEffects={};
            ally.bleedTurns = 0; ally.poisonTurns = 0; ally.poisonDmg = 0;
            ally.burnTurns = 0; ally.burnDmg = 0;
            ally.fractureTurns = 0; ally.fractureDmg = 0;
            ally.chillTurns = 0; ally.chillDmg = 0;
            ally.corrosionTurns = 0;
            ally.cannotCrit = false; ally.stunnedNextTurn = false; ally.nextTurnStunFlag = false;
            ally.warriorVulnerableTurns = 0; ally.warriorVulnerableNextTurn = false;
          }
          this.alcVulnerableTurns = 0; this.alcVulnerableNextTurn = false;
          for(const ally of this.getCombatPlayers())ally.alcAcidStack=0;
          this.roundModifiers.equipmentEffectMultiplier=1;this.roundModifiers.acidFlaskCount=0;
          this.p8RefreshEquipment();
          this.actionCleansedSnapshot = this.getHpSnapshot();
          if (!hasAbnormalStatus) {
            // 身上無異常狀態：2技能效果變成回復 15 點血（全員回復 15 點生命值，不觸發命運反噬）
            for (const pl of this.getCombatPlayers()) {
              pl.bleedTurns = 0;
              pl.poisonTurns = 0;
              pl.poisonDmg = 0;
              pl.burnTurns = 0;
              pl.burnDmg = 0;
              pl.fractureTurns = 0;
              pl.fractureDmg = 0;
              pl.chillTurns = 0;
              pl.chillDmg = 0;
              pl.corrosionTurns = 0;
              if (pl.hp > 0) this.applyHealWithOverheal(pl, this.applyFateBlessing(p, this.skillValue(p,'alc_stable')));
            }
            log.push({ text: `🌿⚗️ **${p.name}** 身上無異常狀態，調配出【溫和調和試劑】！全員穩定回復 **${this.skillValue(p,'alc_stable')}** 點生命值！`, type: 'heal' });
            visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: this.applyFateBlessing(p, this.skillValue(p,'alc_stable')), singleTargetId: null, singleValue: 0 });
          } else {
            // 身上有異常狀態：驅散全體負面效果 + 命運煉成賭博
            for (const pl of this.getCombatPlayers()) {
              pl.bleedTurns = 0;
              pl.poisonTurns = 0;
              pl.poisonDmg = 0;
              pl.burnTurns = 0;
              pl.burnDmg = 0;
              pl.fractureTurns = 0;
              pl.fractureDmg = 0;
              pl.chillTurns = 0;
              pl.chillDmg = 0;
              pl.corrosionTurns = 0;
            }
            const augurs = this.getCombatPlayers().filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === p.id && !pl.augurIntervenedThisRound);
            const isSuccess = (reservedFate ?? ( (!augurs.length ? (Math.random() < 0.50) : !this.interveneNegative(p, '命運煉成試劑・煉金失敗', 50).failed)?'success':'failure'))==='success';
            actionOutcome = { type: isSuccess ? 'alchemy_success' : 'alchemy_failure', label: isSuccess ? '煉成成功' : '煉成失敗' };
            if (isSuccess) {
              for (const pl of this.getCombatPlayers()) {
                if (pl.hp > 0) this.applyHealWithOverheal(pl, this.applyFateBlessing(p, this.skillValue(p,'alc_success')));
              }
              log.push({ text: `✨⚗️ **${p.name}** 調配【命運煉成試劑】—— **【煉金大成功】**！全體負面效果完全淨化！全員回復 **${this.skillValue(p,'alc_success')}** HP，完成淨化！`, type: 'buff' });
              visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: this.applyFateBlessing(p, this.skillValue(p,'alc_success')), singleTargetId: null, singleValue: 0 });
            } else {
              for (const pl of this.getCombatPlayers()) {
                if (pl.hp > 0) this.applyHealWithOverheal(pl, this.applyFateBlessing(p, this.skillValue(p,'alc_failure')));
              }
              this.alcVulnerableNextTurn = true;
              log.push({ text: `💥⚗️ **${p.name}** 調配【命運煉成試劑】—— **【煉金失敗】**！雖然淨化了負面效果並全體回復 **${this.skillValue(p,'alc_failure')}** 點生命，但試劑反噬爆炸，**下回合全隊受傷增加 20%**！⚠️`, type: 'warning' });
              visualEvents.push({ type: 'heal_group', sourceId: p.id, groupValue: this.applyFateBlessing(p, this.skillValue(p,'alc_failure')), singleTargetId: null, singleValue: 0 });
            }
          }
          break;
        }

        // 德魯伊技能
        case 'dru_transform': {
          if(p.druidFormTurns>0)break;
          const form=this.roleRandom(p,'dru_transform',()=>rollDruidForm(p));
          const isWerewolf=form==='werewolf';
          actionOutcome = { type: 'transform_'+(isWerewolf?'wolf':form), label: {werewolf:'狼人形態',treant:'遠古樹精形態',bear:'巨熊形態'}[form] };
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
              const otherAbleTeammates = this.getCombatPlayers().filter(other => other.id !== p.id && other.hp > 0 && !other.isSurrendered);
              if (otherAbleTeammates.length === 0) {
                const failReason = Object.keys(this.players).length === 1
                  ? `德魯伊 **${p.name}** 孤身一人遭遇狼王陷入血脈臣服無法動彈，無人能繼續作戰，冒險直接判定挑戰失敗！`
                  : `德魯伊 **${p.name}** 陷入狼王血脈臣服，且其餘隊友皆已陣亡，場上已無任何能戰鬥的隊友，冒險直接判定挑戰失敗！`;
                log.push({ text: `👑🐺💀 **【血脈臣服·全隊潰敗】** ${failReason}`, type: 'damage' });
                this.isWolfSurrenderGameOver = true;
              }
            } else {
              // Calculate once, then resolve after the transform result has its own snapshot.
              const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'dru_claw'))) * bardDmgMultiplier);
              pendingWerewolfAttack = applyResistanceDamage(raw, 'phys');
            }
          } else if(form==='bear') {
            enterBearForm(p,this.statMultiplier(p));
            log.push({text:`${p.name}化身巨熊：暫時生命 +${p.bearMaxHpAdded}（200% 防禦），普攻 ${this.skillValue(p,'dru_bear_claw')}（10+100%物理攻擊），持續2回合。`,type:'buff'});
            visualEvents.push({type:'transform_bear',sourceId:p.id});
          } else {
            p.druidForm = 'treant';
            this.p8GrantShield(p, this.applyFateBlessing(p, this.skillValue(p,'dru_shield')), 2, 'treant');
            log.push({ text: `🌳 **${p.name}** 紮根於地發動【形態轉變】—— 化身為 **【樹精】**（護盾為自身最大生命85%，減傷30%，變身期間替全體隊友主動吸收50%受到傷害，持續2回合）！（❤️ ${p.hp}/${p.maxHp}）`, type: 'buff' });
            visualEvents.push({ type: 'transform_treant', sourceId: p.id });
          }
          break;
        }

        case 'dru_summon_treant': {
          if (!p.minions) p.minions = [];
          if (p.minions.length >= 3) {
            log.push({ text: `🌱 **${p.name}** 嘗試施展【自然呼喚】，但場上已有 3 隻夥伴（已達上限），無法再召喚！`, type: 'warning' });
            break;
          }
          const hasNatureResonance = (p.equips || []).some(e => e.id === 'dru_resonance' || e.name === '自然共鳴');
          let treantMaxHp = Math.floor(10 + p.maxHp * 0.25);
          if (hasNatureResonance) {
            treantMaxHp += 5;
          }
          const druidTotalAtk = this.getDruidEffectiveAttack(p);
          const treantAtk = 1;
          const usedIndices = new Set(p.minions.filter(m => m.type === 'treant').map(m => m.minionIndex).filter(Boolean));
          let minionIndex = [1, 2, 3].find(idx => !usedIndices.has(idx)) || ((p.minions.length % 3) + 1);
          const minionName = `小樹精${minionIndex}`;
          const minionAvatar = `/assets/characters/summons/druid/小樹精${minionIndex}.webp`;
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
          log.push({ text: `🌱 **${p.name}** 施展【自然呼喚】，召喚出【小樹精】（HP ${treantMaxHp}/${treantMaxHp} · ATK ${treantAtk}）！(現有夥伴 ${p.minions.length}/3)`, type: 'buff' });
          visualEvents.push({ type: 'summon_minion', sourceId: p.id, minionType: 'treant', minionName: '小樹精' });


          break;
        }

        case 'dru_summon_wolf': {
          if (!p.minions) p.minions = [];
          if (p.minions.length >= 3) {
            log.push({ text: `🐺 **${p.name}** 嘗試施展【自然呼喚】，但場上已有 3 隻夥伴（已達上限），無法再召喚！`, type: 'warning' });
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
          const minionAvatar = `/assets/characters/summons/druid/幼狼${minionIndex}.webp`;
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
          log.push({ text: `🐺 **${p.name}** 施展【自然呼喚】，召喚出【幼狼】（HP ${wolfMaxHp}/${wolfMaxHp} · ATK ${wolfAtk}）！(現有夥伴 ${p.minions.length}/3)`, type: 'buff' });
          visualEvents.push({ type: 'summon_minion', sourceId: p.id, minionType: 'wolf', minionName: '幼狼' });


          break;
        }

        case 'pal_glory': {
          const selfShield = this.applyFateBlessing(p, this.skillValue(p,'pal_shield'));
          this.p8GrantShield(p, selfShield, 2, 'paladin_glory_self');
          p.paladinGloryCastedRound = this.battleRound;
          p.paladinGloryTrackedDamage = 0;
          this.p8Effect(p, 'paladin_glory_active', '榮耀讚歌・蓄力中', 1, { icon: 'buff' });

          const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'pal_glory'))) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
          monster.hp -= dmg;
          const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';

          log.push({ text: `🛡️🎺 **${p.name}** 唱響【榮耀讚歌】！對敵方造成 **${dmg}** 點【物理】傷害${resNote}，自身獲得生命上限 50% 護盾（**${selfShield}** 點，持續 2 回合）！下回合將全隊造成傷害的 70% 轉化為全體護盾！`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: false, label: '榮耀讚歌' });
          visualEvents.push({ type: 'shield_cast', sourceId: p.id, label: '榮耀讚歌' });
          break;
        }

        case 'pal_grace': {
          const targetId = p.targetPlayerId && this.players[p.targetPlayerId] && this.players[p.targetPlayerId].hp > 0
            ? p.targetPlayerId
            : (this.getCombatPlayers().find(pl => pl.id !== p.id && pl.hp > 0)?.id || p.id);
          const target = this.players[targetId] || p;
          p.paladinGrace = {
            targetId: target.id,
            startRound: this.battleRound,
            interceptedDamage: 0
          };
          this.p8Effect(target, 'paladin_grace_target', `恩典守護・${p.name}代受傷`, 2, { icon: 'guard', paladinId: p.id });
          this.p8Effect(p, 'paladin_grace_source', `代受恩典・守護${target.name}（減傷 15%）`, 2, { icon: 'guard', targetId: target.id });
          log.push({ text: `🛡️🕊️ **${p.name}** 對 **${target.name}** 施展【代受恩典】！接下來 2 回合自身獲得 15% 減傷，${target.name} 受到的所有傷害與負面狀態將由 ${p.name} 承受！`, type: 'buff' });
          visualEvents.push({ type: 'shield_cast', sourceId: p.id, targetId: target.id, label: '代受恩典' });
          break;
        }

        case 'onm_talisman': {
          const raw = Math.floor(this.applyFateBlessing(p, this.skillValue(p, 'onm_talisman')) * bardDmgMultiplier);
          const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
          monster.hp = Math.max(0, monster.hp - dmg);
          const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
          log.push({ text: `📜 **${p.name}** 擲出【五鬼攝魂符】，造成 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '五鬼攝魂符' });
          if (monster.hp <= 0) break;
          monster.talismans = monster.talismans || [];
          if (monster.talismans.length >= 10) {
            actionOutcome = { type: 'talisman_capped', label: '五鬼攝魂符', secondary: '符咒已達上限' };
            log.push({ text: `📜⚠️ **${p.name}** 擲出【五鬼攝魂符】，但目標身上的符咒已達上限（10 張），無法再依附更多符咒！`, type: 'warning' });
            break;
          }
          const TALISMANS = ['blind', 'seal', 'corrode', 'confuse', 'drain'];
          const talisman = this.roleRandom(p,'onm_talisman',()=>p.rolledTalisman || TALISMANS[Math.floor(Math.random() * TALISMANS.length)]);
          monster.talismans.push(talisman);
          const count = monster.talismans.length;

          if (talisman === 'blind') {
            actionOutcome = { type: 'talisman_blind', label: '障目符', secondary: '命中大幅下降' };
            log.push({ text: `📜👁️ **${p.name}** 擲出【五鬼攝魂符・障目符】！目標攻擊命中率大幅下降，此次攻擊有 60%~100% 的不對我方傷害！（目前累積 ${count}/10 張符咒，無回合限制）`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: 0, isCrit: false, label: '障目符' });
          } else if (talisman === 'seal') {
            actionOutcome = { type: 'talisman_seal', label: '封勁符', secondary: '100%封勁' };
            log.push({ text: `📜🔒 **${p.name}** 擲出【五鬼攝魂符・封勁符】！目標有 100% 機率在當前回合完全不造成任何傷害！（目前累積 ${count}/10 張符咒，無回合限制）`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: 0, isCrit: false, label: '封勁符' });
          } else if (talisman === 'corrode') {
            actionOutcome = { type: 'talisman_corrode', label: '蝕體符', secondary: '易傷 +25%' };
            log.push({ text: `📜🩸 **${p.name}** 擲出【五鬼攝魂符・蝕體符】！目標進入易傷狀態，受到的所有攻擊傷害提升 25%！（目前累積 ${count}/10 張符咒，無回合限制）`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: 0, isCrit: false, label: '蝕體符' });
          } else if (talisman === 'confuse') {
            actionOutcome = { type: 'talisman_confuse', label: '惑心符', secondary: '惑心反噬' };
            log.push({ text: `📜🌀 **${p.name}** 擲出【五鬼攝魂符・惑心符】！目標陷入心智混亂，出手時將造成的傷害 50%~100% 作用在自身！（目前累積 ${count}/10 張符咒，無回合限制）`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: 0, isCrit: false, label: '惑心符' });
          } else if (talisman === 'drain') {
            actionOutcome = { type: 'talisman_drain', label: '抽髓符', secondary: '削血 5%' };
            const drainCount = monster.talismans.filter(t => t === 'drain').length;
            const singleDrain = Math.max(1, Math.floor(monster.maxHp * 0.05));
            const totalDrain = this.augmentOmenDamage(singleDrain * drainCount);
            monster.hp = Math.max(0, monster.hp - totalDrain);
            const drainNote = drainCount > 1 ? `（觸發 ${drainCount} 重削血，共扣除 ${totalDrain} 點）` : `（扣除 ${totalDrain} 點）`;
            log.push({ text: `📜💀 **${p.name}** 擲出【五鬼攝魂符・抽髓符】！扣除目標最大生命值 5% 的血量${drainNote}！（目前累積 ${count}/10 張符咒，無回合限制）`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: totalDrain, isCrit: false, label: '抽髓符' });
          }
          break;
        }

        case 'onm_detonate': {
          const talismans = monster.talismans || [];
          const totalCharms = talismans.length;
          if (totalCharms === 0) {
            actionOutcome = { type: 'detonate_empty', label: '百符引爆', secondary: '無符咒' };
            log.push({ text: `📜⚠️ **${p.name}** 施展【急急如律令・百符引爆】！但目標身上沒有符咒（0 張），不造成任何傷害！`, type: 'warning' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: 0, isCrit: false, label: '百符引爆(無符咒)' });
          } else {
            const countedCharms = Math.min(10, totalCharms);
            const hasMirror = (p.equips || []).some(e => e.id === 'onm_mirror');
            const baseDamage = this.skillValue(p,'onm_detonate',{stacks:countedCharms}) + (hasMirror?2*countedCharms:0);
            const raw = Math.floor((this.applyFateBlessing(p,baseDamage)) * bardDmgMultiplier);
            const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
            monster.hp -= dmg;
            const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
            actionOutcome = { type: 'detonate_burst', label: '百符引爆', secondary: `${countedCharms}張符咒` };
            log.push({ text: `📜💥🔥 **${p.name}** 高念真言施展【急急如律令・百符引爆】！引爆目標身上所有未掉落的符咒（共 **${totalCharms}** 張，結算上限 ${countedCharms} 張），造成 **${dmg}** 點【魔法】傷害！${resNote}`, type: 'combat' });
            visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '百符引爆' });
            monster.talismans = [];
            monster.permanentTalismans = [];
            log.push({ text: `📜✨ 技能結算完成，目標身上所有符咒全數脫落並銷毀！`, type: 'buff' });
          }
          break;
        }

        case 'leader_assassin_execute': {
          const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p, 's_stab', {}, 40) + getEffectiveBonusAtk(p))) * 2 * bardDmgMultiplier);
          const { dmg } = applyResistanceDamage(raw, 'phys');
          monster.hp -= dmg;
          actionOutcome = { type: 'critical', label: 'CRITICAL', secondary: '絕命處決' };
          log.push({ text: `🗡️💥 **${p.name}** 發動隊長技【絕命處決】！瞬身刺破死穴，必定爆擊造成了 **${dmg}** 點【致命】傷害！`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'phys', value: dmg, isCrit: true, label: '絕命處決' });
          this.leaderSkillUsedThisBattle = true;
          break;
        }

        case 'onm_all_talismans': {
          const raw = Math.floor(this.applyFateBlessing(p, this.skillValue(p, 'onm_talisman')) * bardDmgMultiplier);
          const { dmg } = applyResistanceDamage(raw, 'mag');
          monster.hp = Math.max(0, monster.hp - dmg);
          log.push({ text: `📜 **${p.name}** 的【萬符歸宗】造成 **${dmg}** 點【魔法】傷害！`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: dmg, isCrit: false, label: '萬符歸宗' });
          if (monster.hp <= 0) { this.leaderSkillUsedThisBattle = true; break; }
          monster.talismans = monster.talismans || [];
          monster.permanentTalismans = monster.permanentTalismans || [];
          const ALL_TYPES = ['blind', 'seal', 'corrode', 'confuse', 'drain'];
          for (const type of ALL_TYPES) {
            monster.talismans.push(type, type);
            monster.permanentTalismans.push(type, type);
          }
          actionOutcome = { type: 'talisman_all', label: '萬符歸宗', secondary: '10道符咒' };
          log.push({ text: `📜✨ **${p.name}** 施展隊長技【萬符歸宗】！漫天靈符呼嘯而出，一次性向 **${monster.name}** 貼上所有類型符咒各兩張（共 10 道符咒），且敕令符咒永久固鎖，絕不脫落！`, type: 'combat' });
          const drainCount = monster.talismans.filter(t => t === 'drain').length;
          const singleDrain = Math.max(1, Math.floor(monster.maxHp * 0.05));
          const totalDrain = this.augmentOmenDamage(singleDrain * drainCount);
          monster.hp = Math.max(0, monster.hp - totalDrain);
          log.push({ text: `📜💀 **【抽髓符】** 削血觸發！扣除目標最大生命值（共扣除 ${totalDrain} 點）！（❤️ 魔物 HP: ${monster.hp}/${monster.maxHp}）`, type: 'combat' });
          visualEvents.push({ type: 'player_attack', sourceId: p.id, target: 'monster', dmgType: 'mag', value: totalDrain, isCrit: false, label: '抽髓符' });
          this.leaderSkillUsedThisBattle = true;
          break;
        }

        case 'dru_form_wolf': {
          actionOutcome = { type: 'transform_wolf', label: '狼人形態' };
          p.druidFormTurns = 2;
          p.druidForm = 'werewolf';
          const deduct = p.maxHp - Math.max(1, Math.floor(p.maxHp * (1 - GAME_BALANCE.werewolfMaxHpReduction)));
          p.werewolfMaxHpDeducted = (p.werewolfMaxHpDeducted || 0) + deduct;
          p.maxHp -= deduct;
          p.hp = Math.min(p.hp, p.maxHp);
          log.push({ text: `🐺 **${p.name}** 發動隊長技【自在化形】—— 化身為 **【狼人】**（暫時扣除 ${deduct} 點最大生命值，造成傷害提升至 40 點，持續2回合）！（❤️ ${p.hp}/${p.maxHp}）`, type: 'buff' });
          visualEvents.push({ type: 'transform_wolf', sourceId: p.id });
          const raw = Math.floor((this.applyFateBlessing(p, this.skillValue(p,'dru_claw'))) * bardDmgMultiplier);
          pendingWerewolfAttack = applyResistanceDamage(raw, 'phys');
          this.leaderSkillUsedThisBattle = true;
          break;
        }

        case 'dru_form_treant': {
          actionOutcome = { type: 'transform_treant', label: '遠古樹精形態' };
          p.druidFormTurns = 2;
          p.druidForm = 'treant';
          this.p8GrantShield(p, this.applyFateBlessing(p, this.skillValue(p,'dru_shield')), 2, 'treant');
          log.push({ text: `🌳 **${p.name}** 發動隊長技【自在化形】—— 化身為 **【樹精】**（獲得自身最大生命85%護盾，減傷30%，變身期間替全體隊友主動吸收50%受到傷害，持續2回合）！（❤️ ${p.hp}/${p.maxHp}）`, type: 'buff' });
          visualEvents.push({ type: 'transform_treant', sourceId: p.id });
          this.leaderSkillUsedThisBattle = true;
          break;
        }
      }

      const stepVisuals = visualEvents.slice(beforeVisualCount);
      for(const event of stepVisuals)if(event.type==='player_attack')Object.assign(event,{
        eventKind:event.eventKind || (['m_blast','a_rain'].includes(p.action)?'area':'direct'),
        targetRole:event.targetRole || (event.isSecondaryEnemy ? 'secondary' : 'primary'),sourceId:p.id,actionId:p.action
      });
      const stepLogs = log.slice(beforeLogCount);
      const activeSkills = roundSkillSets.get(p.id);
      const usedSkill = activeSkills.find(s => s.id === p.action);
      let hiddenEffectNote = null;
      if (p.action === 'alc_acid' || (p.action === 'alc_flask' && actionOutcome?.type === 'alchemy_acid')) {
        hiddenEffectNote = '酸霧侵蝕裝備，全隊裝備效果降低 50%！';
      }

      const attackVisual = stepVisuals.find(v => v.type === 'player_attack' && !v.isSecondaryEnemy);
      if (attackVisual?.targetEnemyId && attackVisual.targetEnemyId !== monster.instanceId) {
        const redirectedMonster = (this.enemies || []).find(e => e.instanceId === attackVisual.targetEnemyId);
        if (redirectedMonster) monster = redirectedMonster;
      }
      const resolvedMonsterHpBefore = snapshotTarget(actionBefore, monster.instanceId)?.hp ?? monsterHpBefore;
      const isLethal = monster.hp <= 0;
      const monsterHpDelta = Math.max(0, resolvedMonsterHpBefore - monster.hp);
      if (monsterHpDelta > 0) {
        for (const pal of this.getCombatPlayers()) {
          if (pal.role === 'paladin' && pal.paladinGloryCastedRound === this.battleRound) {
            pal.paladinGloryTrackedDamage = (pal.paladinGloryTrackedDamage || 0) + monsterHpDelta;
          }
        }
        // 深淵角鬥士【狂怒疊層】：每次受到傷害攻擊力提升
        if (monster.abyssMechanics?.passiveRageAtkPerStack) {
          monster.abyssRageStacks = (monster.abyssRageStacks || 0) + 1;
        }
        // 深淵聖騎士【荊棘聖盾】：反彈 20% 傷害
        if (monster.abyssMechanics?.passiveReflectRatio && p.hp > 0) {
          const reflectDmg = Math.max(1, Math.floor(monsterHpDelta * monster.abyssMechanics.passiveReflectRatio));
          this.applyDamageToPlayer(p, reflectDmg, { kind: 'abyss_reflect' });
          stepVisuals.push({ type: 'self_damage', sourceId: monster.instanceId, targetId: p.id, value: reflectDmg, targetAfter: snapshotTarget(this.getHpSnapshot(), p.id), outcome: { type: 'abyss_reflect' } });
          log.push({ text: `🛡️⚡ **${monster.name}** 的【荊棘聖盾】反彈了 **${reflectDmg}** 點真實傷害予 **${p.name}**！`, type: 'damage' });
        }
        // 深淵武士【見切反擊】：25% 機率反擊
        if (monster.abyssMechanics?.passiveCounterChance && monster.hp > 0 && p.hp > 0 && Math.random() < monster.abyssMechanics.passiveCounterChance) {
          const counterDmg = monster.abyssMechanics.passiveCounterDmg || 8;
          this.applyDamageToPlayer(p, counterDmg, { kind: 'abyss_counter' });
          stepVisuals.push({ type: 'self_damage', sourceId: monster.instanceId, targetId: p.id, value: counterDmg, targetAfter: snapshotTarget(this.getHpSnapshot(), p.id), outcome: { type: 'abyss_counter' } });
          log.push({ text: `⚔️⚡ **${monster.name}** 觸發【見切反擊】，瞬間拔刀對 **${p.name}** 造成 **${counterDmg}** 點傷害！`, type: 'damage' });
        }
      }
      const finalDamage = attackVisual ? attackVisual.value : monsterHpDelta;
      const damageType = attackVisual?.dmgType === 'mag' ? 'magic' : attackVisual?.dmgType === 'true' ? 'true' : 'physical';
      const isCrit = attackVisual?.isCrit || false;
      if (isCrit && actionOutcome.type === 'normal' && (SKILL_CATEGORIES[p.action] || 'OFFENSIVE') === 'OFFENSIVE') actionOutcome = { type: 'critical', label: 'CRITICAL' };

      if (p.role === 'assassin' && isCrit && finalDamage > 0) {
        const gained = addAssassinCritical(p);
        if (gained) log.push({ text: `**${p.name}** 觸發暴擊，獲得 ${gained} 層【匿蹤】。`, type: 'buff' });
      }
      monster.hp = Math.max(0, monster.hp);
      const actionAfter = this.getHpSnapshot();
      const actionCategory = p8Action?.category || SKILL_CATEGORIES[p.action] || 'OFFENSIVE';
      stepVisuals.filter(event=>event.type==='player_attack').forEach((event,i)=>{
        if (!event.targetEnemyId) event.targetEnemyId = monster.instanceId;
        const cue=this.p8DamagePresentationOutcomes[i];if(cue?.type)event.outcome={type:cue.type};
      });
      for(const enemyId of new Set((this.enemyDamageReceipts||[]).map(r=>r.enemyId))) {
        const receipts=this.enemyDamageReceipts.filter(r=>r.enemyId===enemyId);
        const events=stepVisuals.filter(e=>e.type==='player_attack'&&e.targetEnemyId===enemyId);
        for(const [index,event] of events.entries()) {
          let hpDamage=0,absorbed=0;
          while(receipts.length && (index===events.length-1 || hpDamage<(event.value||0) || (hpDamage===0&&absorbed===0))) {
            const receipt=receipts.shift();hpDamage+=receipt.hpDamage;absorbed+=receipt.absorbed;
          }
          event.absorbed=absorbed;
        }
      }
      const actionResults = this.p8Results || buildActionResults({ outcome: actionOutcome, category: actionCategory, sourceId: p.id, cleansedSnapshot: this.actionCleansedSnapshot }, actionBefore, actionAfter, stepVisuals, this.actionHeals);
      this.actionHeals = null;
      // Defensive status preludes can be recorded after a secondary arrow has
      // already settled. Their presentation must not expose that later HP.
      if(this.enemyMechanicQueue?.length&&this.enemyMechanicQueue.every(s=>s.results.every(r=>r.kind==='status'))){
        const display=structuredClone(actionBefore);
        for(const prelude of this.enemyMechanicQueue){
          prelude.hpSnapshotBefore=structuredClone(display);
          for(const r of prelude.results){
            const id=r.targetEnemyId||r.targetId,current=snapshotTarget(display,id);if(!current)continue;
            const vitals={hp:current.hp,tempHp:current.tempHp||0};r.targetBefore={...r.targetBefore,...vitals};r.targetAfter={...r.targetAfter,...vitals};
            for(const unit of [snapshotTarget(display,id),...(display.enemies||[]).filter(e=>e.instanceId===id)])if(unit)Object.assign(unit,structuredClone(r.targetAfter));
          }
          prelude.hpSnapshot=structuredClone(display);
        }
      }
      drainEnemyEvents(this,presentationQueue,false);
      presentationQueue.push({
        category: actionCategory, outcome: actionOutcome, results: actionResults,
        augurReactions:this.augurReactions.slice(augurReactionIndex),
        hpSnapshotBefore: actionBefore,
        ...(p.role==='gladiator'?{gladiatorPresentation:{
          arenaActive:actionBefore.arena?.playerId===p.id,
          rageBefore:snapshotTarget(actionBefore,p.id)?.rage||0,rageAfter:p.rage||0,
          rageGained:Math.max(0,(p.rage||0)-(snapshotTarget(actionBefore,p.id)?.rage||0)),
          rageConsumed:Math.max(0,(snapshotTarget(actionBefore,p.id)?.rage||0)-(p.rage||0)),
          actorDied:p.hp<=0
        }}:{}),
        ...(p.role==='sage'?{sagePresentation:{
          sagePhase:p.sagePhase,operandBefore:snapshotTarget(actionBefore,p.id)?.sageOperand,
          operandAfter:p.sageOperand,xBefore:snapshotTarget(actionBefore,p.id)?.sageX,xAfter:p.sageX,
          actualDamage:finalDamage,sampling:!!p.sageInduction,
          operandDelta:p.sageOperand-(snapshotTarget(actionBefore,p.id)?.sageOperand||0)
        }}:{}),
        monsterName: monster.name, monsterAvatar: monster.avatar,
        targetEnemyId: monster.instanceId,
        type: 'player_action', hiddenBeforeAction, consumedStacks,
        sourceId: p.id,
        sourceName: p.name,
        sourceRole: p.role,
        druidForm: p.druidForm,
        ammoBefore: [...(snapshotTarget(actionBefore, p.id)?.ammo || [])],
        ammoAfter: [...(p.ammo || [])],
        archerTrap: p.action==='a_rain'&&this.arrowTrap?structuredClone(this.arrowTrap):null,
        actionId: p.action,
        skillName: usedSkill ? usedSkill.label : (
          p.action === 'leader_assassin_execute' ? '絕命處決' :
          p.action === 'onm_all_talismans' ? '萬符歸宗' :
          p.action === 'dru_form_wolf' ? '自在化形 (狼人)' :
          p.action === 'dru_form_treant' ? '自在化形 (樹精)' :
          p.action === 'use_item_healing_potion' ? '治療藥' :
          p.action === 'use_item_antidote' ? '解毒藥' :
          p.action === 'b_revive' ? '甦生之歌' :
          p.action === 'skip' ? '跳過回合' : p.action
        ),
        tags: usedSkill ? (usedSkill.tags || []) : [],
        targetId: p.targetPlayerId || (monster.hp > 0 || isLethal ? 'monster' : null),
        targetName: (p.targetPlayerId && this.players[p.targetPlayerId]) ? this.players[p.targetPlayerId].name : monster.name,
        narrative: this.studioContent.battleNarratives.getPlayerSkillNarrative(p, p.action, {
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
        dmgType: damageType === 'magic' ? '【魔法】' : damageType === 'true' ? '【真實】' : '【物理】',
        isCritical: isCrit,
        isLethal: isLethal,
        targetHpBefore: resolvedMonsterHpBefore,
        targetHpAfter: monster.hp,
        targetMaxHp: monster.maxHp,
        actorHpBefore: actorHpBefore,
        actorHpAfter: p.hp,
        actorMaxHp: p.maxHp,
        hpSnapshot: this.getHpSnapshot()
      });

      afterPlayerDamage(this,presentationQueue.at(-1));drainEnemyEvents(this,presentationQueue);
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
          targetId: 'monster', targetEnemyId: monster.instanceId, targetName: monster.name, monsterName: monster.name, monsterAvatar: monster.avatar,
          finalDamage: dmg, damageType: 'physical', isLethal: monster.hp <= 0,
          hpSnapshotBefore: before, hpSnapshot: after,
          results: [{ kind: 'damage', targetId: 'monster', targetEnemyId: monster.instanceId, finalDamage: dmg,
            targetBefore: before.monster, targetAfter: after.monster, damageType: 'physical',
            outcome: { type: 'critical', label: 'CRITICAL' }, hpSnapshot: after }]
        });
      }

      resolveMinionFollowUp(p);
      afterPlayerDamage(this,presentationQueue.at(-1));drainEnemyEvents(this,presentationQueue);

      // 記錄該玩家行動敘述 (供舊版 Fallback 兼容)
      narratives.push({
        type: 'player',
        sourceId: p.id,
        name: p.name,
        role: p.role,
        actionId: p.action,
        text: this.studioContent.battleNarratives.getPlayerSkillNarrative(p, p.action, { isCrit: (p.action === 's_stab' && assassinDidCrit) }),
        detail: log[log.length - 1]?.text || ''
      });

      // 德魯伊召喚夥伴立刻攻擊：獨立演出步進（先德魯伊召喚演出，再夥伴突擊演出）
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
          targetEnemyId: monster.instanceId,
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
          targetEnemyId: monster.instanceId,
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

      const followStart=presentationQueue.length;
      this.resolveAssassinFollowUps(p, presentationQueue, log, bardDmgMultiplier, applyResistanceDamage);
      for(const follow of presentationQueue.slice(followStart))afterPlayerDamage(this,follow);
      drainEnemyEvents(this,presentationQueue);
      this.p8GalaxyFollowups(presentationQueue,applyResistanceDamage,galaxyResolved);

      if (monster.hp <= 0) {
        if (this.getLivingEnemies().length === 0) {
          presentationQueue.push({
            type: 'kill',
            monsterName: monster.name,
            narrative: this.studioContent.text('event.victory',`💀 **${monster.name}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！`,{boss:monster.name}),
            visualEvents: [{ type: 'monster_killed', targetEnemyId: monster.instanceId }],
            hpSnapshot: this.getHpSnapshot()
          });
          break; // 全數敵人擊殺，跳出玩家行動
        } else {
          log.push({ text: `💀 **${monster.name}** 已被擊倒！戰場上仍有 **${this.getLivingEnemies().length}** 名敵人存活！`, type: 'combat' });
          this.refreshPrimaryMonster();
          monster = this.currentMonster;
        }
      }
    }
    this.healingSourceId=null;
    bardDmgMultiplier = baseBardDmgMultiplier;

    // 3. 處理脫力狀態
    for (const p of this.getCombatPlayers()) {
      if (p.stunnedNextTurn) {
        p.stunnedNextTurn = false;
      }
      if (p.nextTurnStunFlag) {
        p.stunnedNextTurn = true;
        p.nextTurnStunFlag = false;
      }
    }

    // 4. 冷卻時間處理
    for (const p of this.getCombatPlayers()) {
      if (p.hp <= 0) continue;
      const activeSkills = roundSkillSets.get(p.id);

      for (const skill of activeSkills) {
        if (p.action === skill.id) continue;
        const cooldownKey = skill.cooldownKey || skill.id;
        if (p.cooldowns[cooldownKey] > 0) {
          p.cooldowns[cooldownKey] -= 1;
        }
      }

      // The outside declaration keeps cooling down while its arena variant is active.
      if(p.role==='gladiator'&&activeSkills.some(s=>s.cooldownKey==='arena_g_arena')&&p.cooldowns.g_arena>0)p.cooldowns.g_arena--;

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
    for(const p of this.getCombatPlayers())if(p.sagePrimeResetPending){for(const key of Object.keys(p.cooldowns))p.cooldowns[key]=0;p.sagePrimeResetPending=false;}

    // 4.9 檢查德魯伊狼王臣服失敗判定（若其他隊友都死亡或是只有他一人，直接判定挑戰失敗）
    if (this.isWolfSurrenderGameOver) {
      log.forEach(l => this.addLog(l.text, l.type));
      this.publishCombatQueue(presentationQueue);
      return;
    }

    drainEnemyEvents(this,presentationQueue);
    // 5. 判定怪物擊殺與勝負判定
    this.refreshPrimaryMonster();
    monster = this.currentMonster;
    if (this.getLivingEnemies().length === 0) {
      narratives.push({
        type: 'kill',
        name: monster.name,
        text: this.studioContent.text('event.victory',`💀 **${monster.name}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！`,{boss:monster.name})
      });
      // Phase 5.1: 怪物已死亡，嚴禁提前 return 或跳過 presentation_queue！
      // 致命一擊與擊殺演出必須由客戶端依序播放完畢並發送 ACK，再由 finishTurnPresentation() 統一過渡至勝利階段。
    } else {
    // 6. 怪物反擊結算 (對場上所有存活敵人依序結算反擊)
    const actingEnemies = this.getLivingEnemies();
    const isUltTurn = (this.battleRound % 3 === 0);
    let shieldDamageMod = 1.0;
    if (this.warriorShieldTurn === 1) {
      shieldDamageMod = 0.1;
      log.push({ text: `🛡️ **【壁壘守護】本回合為全隊阻擋了 90% 的衝擊！**`, type: 'buff' });
    } else if (this.warriorShieldTurn === 2) {
      shieldDamageMod = 0.6;
      log.push({ text: `🛡️ **【壁壘守護】餘威為全隊阻擋了 40% 的傷害！**`, type: 'buff' });
    }
    let alcVulnMod = (this.alcVulnerableTurns > 0) ? 1.20 : 1.0;

    for (const actingEnemy of actingEnemies) {
      if (actingEnemy.hp <= 0) continue;
      if (this.getCombatPlayers().every(p => p.hp <= 0)) break;
      monster = actingEnemy;
      this._currentMonster = actingEnemy;

      // 箭刺陷阱區域：每次敵方行動受到 25% * A 物理傷害
      if (this.arrowTrap && this.arrowTrap.turns > 0 && actingEnemy.hp > 0) {
        const trapRaw = Math.max(1, Math.round(0.25 * (this.arrowTrap.atk || 14)));
        const { dmg: trapDmg } = applyResistanceDamage(trapRaw, 'phys', { enemy: actingEnemy });
        if (trapDmg > 0) {
          const trapBefore=this.getHpSnapshot();
          actingEnemy.hp = Math.max(0, actingEnemy.hp - trapDmg);
          const trapAfter=this.getHpSnapshot();
          presentationQueue.push({type:'status_action',category:'STATUS_TICK',sourceId:this.arrowTrap.sourceId,sourceRole:'archer',actionId:'a_trap',skillName:'箭刺陷阱',targetId:actingEnemy.instanceId,targetEnemyId:actingEnemy.instanceId,
            hpSnapshotBefore:trapBefore,hpSnapshot:trapAfter,results:[{kind:'damage',sourceId:this.arrowTrap.sourceId,targetId:actingEnemy.instanceId,targetEnemyId:actingEnemy.instanceId,finalDamage:trapDmg,damageType:'physical',outcome:{type:'normal'},targetBefore:snapshotTarget(trapBefore,actingEnemy.instanceId),targetAfter:snapshotTarget(trapAfter,actingEnemy.instanceId)}]});
          log.push({
            text: `🏹💥 **${actingEnemy.name}** 行動時踏入【箭刺陷阱區域】，受到 **${trapDmg}** 點【物理】傷害！（❤️ ${actingEnemy.hp}/${actingEnemy.maxHp}）`,
            type: 'combat'
          });
          visualEvents.push({
            type: 'player_attack',
            sourceId: this.arrowTrap.sourceId || null,
            target: actingEnemy === monster ? 'monster' : actingEnemy.instanceId,
            targetEnemyId: actingEnemy.instanceId,
            dmgType: 'phys',
            value: trapDmg,
            isCrit: false,
            label: '箭刺陷阱'
          });
          if (actingEnemy.hp <= 0) {
            log.push({ text: `💀 **${actingEnemy.name}** 被【箭刺陷阱區域】當場刺殺身亡！`, type: 'damage' });
            continue;
          }
        }
      }

      drainEnemyEvents(this,presentationQueue);
      if(runEnemyAction(this,actingEnemy,presentationQueue))continue;
      const bossBefore = this.getHpSnapshot();
      const bossAugurReactionIndex = this.augurReactions.length;
      const interceptResults = [];
      const monsterHits = [];
      let aoeDmgRaw = 0;
      const scatterHits = {};
      const isEnemyStunned = Boolean(actingEnemy.stunnedThisRound || this.monsterStunnedThisRound);
      actingEnemy.stunnedThisRound = false;

      if (isEnemyStunned) {
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
          monsterName: monster.name,
          targetEnemyId: monster.instanceId
        });
      } else {
        let baseDamageCalc = monster.attack;
        if(this.p8Has(monster,'frenzy_backfire'))baseDamageCalc=Math.floor(baseDamageCalc*1.1);
        if(!this.arena && this.p8Has(monster,'sage_square')?.starts<=this.battleRound)baseDamageCalc=Math.floor(baseDamageCalc*.75);
        if(monster.corrosionTurns > 0)baseDamageCalc=Math.floor(baseDamageCalc*0.95);

        // 深淵轉化敵人專屬回合與大招加成
        if (monster.abyssMechanics) {
          const mech = monster.abyssMechanics;
          if (isUltTurn && mech.ultShieldMaxHpRatio) {
            const shieldAmt = Math.max(1, Math.round(monster.maxHp * mech.ultShieldMaxHpRatio));
            monster.tempHp = (monster.tempHp || 0) + shieldAmt;
            log.push({ text: `🛡️🌑 **${monster.name}** 釋放深淵障壁，獲得 **${shieldAmt}** 點護盾！`, type: 'warning' });
          }
          if ((monster.tempHp || 0) > 0 && mech.ultDamageBonusWithShield) {
            baseDamageCalc = Math.floor(baseDamageCalc * (1 + mech.ultDamageBonusWithShield));
          }
          if (mech.passiveRageAtkPerStack && (monster.abyssRageStacks || 0) > 0) {
            baseDamageCalc = Math.floor(baseDamageCalc * (1 + monster.abyssRageStacks * mech.passiveRageAtkPerStack));
            if (isUltTurn) monster.abyssRageStacks = 0;
          }
          if (mech.passiveHealMaxHpRatio) {
            const healAmt = Math.max(1, Math.round(monster.maxHp * mech.passiveHealMaxHpRatio));
            monster.hp = Math.min(monster.maxHp, monster.hp + healAmt);
            log.push({ text: `🩸🌑 **${monster.name}** 觸發【黑闇汲取】，回復了 **${healAmt}** 點生命！`, type: 'warning' });
          }
          if (mech.passiveTalismanPerTurn) {
            monster.abyssTalismans = (monster.abyssTalismans || 0) + mech.passiveTalismanPerTurn;
            if (isUltTurn && monster.abyssTalismans > 0) {
              baseDamageCalc += monster.abyssTalismans * (mech.ultDmgPerTalisman || 4);
              monster.abyssTalismans = 0;
            }
          }
          if (isUltTurn && mech.ultCritMultiplier) {
            baseDamageCalc = Math.floor(baseDamageCalc * mech.ultCritMultiplier);
          }
          if (isUltTurn && mech.ultEquationBonusPerRound) {
            baseDamageCalc += mech.ultEquationBonusPerRound * this.battleRound;
          }
        }

        // 惑心符：目標陷入心智混亂，出手時將造成的傷害 50%~100% 作用在自身。
        const confuseCount = (monster.talismans || []).filter(t => t === 'confuse').length;
        if (confuseCount > 0) {
          let totalBacklashDmg = 0;
          let totalRatioPercent = 0;
          const attackDmg = Math.max(1, baseDamageCalc);
          for (let i = 0; i < confuseCount; i++) {
            const ratio = typeof monster.talismanConfuseRatio === 'number'
              ? monster.talismanConfuseRatio
              : (0.50 + Math.random() * 0.50);
            const dmg = Math.max(1, Math.round(attackDmg * ratio));
            totalBacklashDmg += dmg;
            totalRatioPercent += Math.round(ratio * 100);
          }
          if (totalBacklashDmg > 0) {
            monster.hp = Math.max(0, monster.hp - totalBacklashDmg);
            const ratioText = confuseCount > 1 ? `（${confuseCount} 重惑心，共 ${totalRatioPercent}%）` : `（${totalRatioPercent}%）`;
            log.push({ text: `📜🌀 **【惑心符】** 心智混亂！魔物出手時將造成的傷害${ratioText}作用在自身，反噬受到 **${totalBacklashDmg}** 點傷害！（❤️ 魔物 HP: ${monster.hp}/${monster.maxHp}）`, type: 'warning' });
            visualEvents.push({ type: 'player_attack', sourceId: this.getCombatPlayers().find(p => p.role === 'onmyoji')?.id || monster.instanceId, target: 'monster', targetEnemyId: monster.instanceId, dmgType: 'mag', value: totalBacklashDmg, label: '惑心反噬' });
          }
        }

        // 封勁符：目標有 100% 機率在當前回合完全不造成任何傷害。
        const sealCount = (monster.talismans || []).filter(t => t === 'seal').length;
        let sealTriggered = Boolean(monster.sealedThisRound) || sealCount > 0;
        if (sealTriggered && !monster.sealedThisRound) {
          log.push({ text: `📜🔒 **【封勁符】** 咒印爆發！封鎖了魔物全部氣勁，目標有 100% 機率在當前回合完全不造成任何傷害！`, type: 'buff' });
        }

        const monsterTemplate = this.studioContent.battleNarratives.monsters[monster.originalName || monster.name] || {
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

        const effectiveBaseAtk = sealTriggered ? 0 : Math.max(5, baseDamageCalc - monsterAttackReduction);
        aoeDmgRaw = sealTriggered ? 0 : Math.max(1, Math.floor(effectiveBaseAtk * 0.5));
        const scatterDmgPool = sealTriggered ? 0 : Math.max(0, effectiveBaseAtk - aoeDmgRaw);

        // 夥伴優先替全隊擋下怪物的隨機分散/彈射傷害
        let remainingScatter = scatterDmgPool;
        for (const owner of this.getCombatPlayers()) {
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
                if(m.hp>0&&monster.baseHp<100){m.bleedTurns=Math.max(m.bleedTurns||0,2);m.bleedDmg=Math.floor(2*getFloorDifficultyMultiplier(this.floor));}
                remainingScatter -= absorb;
                interceptResults.push({ kind: 'intercept', category: 'MINION_INTERCEPT', targetId: m.id,
                  ownerId: owner.id, originalTargetIds: this.getCombatPlayers().filter(p => p.hp > 0).map(p => p.id),
                  minion: structuredClone(m), targetBefore: minionBefore, targetAfter: structuredClone(m),
                  finalDamage: absorb, outcome: { type: 'normal' }, hpSnapshot: this.getHpSnapshot() });
                visualEvents.push({ type: 'minion_hit', ownerId: owner.id, value: absorb });
                if (m.hp <= 0) {
                  log.push({ text: `🛡️🐾 **${owner.name}** 的夥伴【${m.name}】挺身為全隊擋下 **${absorb}** 點彈射傷害，隨後力竭消散！💀`, type: 'warning' });
                  owner.minions.splice(mi, 1);
                } else {
                  log.push({ text: `🛡️🐾 **${owner.name}** 的夥伴【${m.name}】優先替全隊擋下 **${absorb}** 點彈射傷害！（夥伴 HP: ${m.hp}/${m.maxHp}）`, type: 'buff' });
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
              log.push({ text: `🛡️🐾 **${owner.name}** 的夥伴【${owner.minion.name}】挺身為全隊擋下 **${absorb}** 點彈射傷害，隨後力竭消散！💀`, type: 'warning' });
              owner.minion = null;
            } else {
              log.push({ text: `🛡️🐾 **${owner.name}** 的夥伴【${owner.minion.name}】優先替全隊擋下 **${absorb}** 點彈射傷害！（夥伴 HP: ${owner.minion.hp}/${owner.minion.maxHp}）`, type: 'buff' });
            }
          }
        }

        const calculateDamageToPlayer = (player, rawDamage) => {
          let finalDmg = rawDamage;
          if (player.role === 'assassin') finalDmg = Math.floor(finalDmg * CLASSES.assassin.vulnerableMod);
          if (player.warriorVulnerableTurns > 0) finalDmg = Math.floor(finalDmg * 1.20);
          if (shieldDamageMod < 1.0) finalDmg = Math.max(1, Math.floor(finalDmg * shieldDamageMod));
          if (alcVulnMod > 1.0) finalDmg = Math.floor(finalDmg * (p.role==='gladiator'?1:alcVulnMod));
          // 架弩蹲伏減傷 20%
          if (player.isCrouchedThisRound) {
            finalDmg = Math.floor(finalDmg * 0.80);
          }
          // 樹精/古樹形態減傷由 GAME_BALANCE 管理
          if (player.druidForm === 'treant' || player.druidForm === 'tree') {
            finalDmg = Math.floor(finalDmg * (1 - GAME_BALANCE.treantDamageReduction));
          }
          // 聖騎士【代受恩典】：二技能多獲得 15% 減傷
          if (player.role === 'paladin' && player.paladinGrace) {
            finalDmg = Math.floor(finalDmg * 0.85);
          }
          // 聖騎士【庇護之光軍旗】：自身持有任何護盾時受到的傷害降低 15%
          if (player.role === 'paladin' && ((player.tempHp > 0) || (player.p8Shields || []).some(s => s.value > 0)) && (player.equips || []).some(e => e.id === 'pal_banner')) {
            finalDmg = Math.floor(finalDmg * 0.85);
          }
          return Math.max(1, finalDmg);
        };

        const livingPlayers = this.getCombatPlayers().filter(p => p.hp > 0 && (!arenaRoundPlayerId || arenaRoundPlayerId===p.id));
        const playerRawScatter = {};
        livingPlayers.forEach(p => { playerRawScatter[p.id] = 0; scatterHits[p.id] = []; });

        let remainingDmg = remainingScatter;
        while (remainingDmg > 0 && livingPlayers.length > 0) {
          const randomTarget = this.pickTargetWithTaunt(livingPlayers);
          const stepDmg = Math.min(remainingDmg, Math.floor(Math.random() * 4) + 2);
          playerRawScatter[randomTarget.id] += stepDmg;
          scatterHits[randomTarget.id].push(stepDmg);
          remainingDmg -= stepDmg;
        }

        const treantDruid = arenaRoundPlayerId ? null : this.getCombatPlayers().find(p => p.hp > 0 && p.druidForm === 'treant');

        for (const p of this.getCombatPlayers()) {
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
          const isArcherLeader = (this.getEffectiveLeaderRole() === 'archer');
          if (!p.isCrouchedThisRound && (dodgeRate > 0 || p.archerNextDodgeBonus > 0 || isArcherLeader) && this.checkDodge(p, dodgeRate)) {
            log.push({ text: `🪶 **${p.name}** 身手矯健，閃避了所有反擊！`, type: 'buff' });
            monsterHits.push({ targetId: p.id, role: p.role, dodged: true, value: 0, outcome: { type: 'dodge' }, targetBefore, targetAfter: snapshotTarget(this.getHpSnapshot(), p.id), hpSnapshot: this.getHpSnapshot() });
            continue;
          }

          // 破綻印記：降低目標效果命中與命中率 10% * flawMarks
          const flawCount = monster.flawMarks || 0;
          if (flawCount > 0) {
            const flawMissRate = 0.10 * flawCount;
            if (Math.random() < flawMissRate) {
              log.push({
                text: `🎯❌ **${monster.name}** 受到【破綻印記】干擾（效果命中 -${flawCount * 10}%），攻擊露出致命破綻偏折，未能命中 **${p.name}**！`,
                type: 'buff'
              });
              monsterHits.push({
                targetId: p.id,
                role: p.role,
                dodged: true,
                value: 0,
                outcome: { type: 'dodge', label: 'MISS' },
                targetBefore,
                targetAfter: snapshotTarget(this.getHpSnapshot(), p.id),
                hpSnapshot: this.getHpSnapshot()
              });
              continue;
            }
          }

          // 障目符：目標攻擊命中率大幅下降，此次攻擊有 60%~100% 的不對我方傷害。
          const blindCount = (monster.talismans || []).filter(t => t === 'blind').length;
          if (blindCount > 0) {
            const avoidRate = typeof monster.talismanBlindAvoidRate === 'number'
              ? monster.talismanBlindAvoidRate
              : (0.60 + Math.random() * 0.40);
            const isFullMiss = typeof monster.talismanBlindMiss === 'boolean'
              ? monster.talismanBlindMiss
              : (Math.random() < avoidRate);

            if (isFullMiss) {
              log.push({ text: `📜👁️ **【障目符】** 視界遮蔽！目標攻擊命中率大幅下降，此次攻擊判定有 ${Math.round(avoidRate * 100)}% 不對我方造成傷害，攻擊判定為 Miss（失誤），未能命中 **${p.name}**！`, type: 'buff' });
              monsterHits.push({ targetId: p.id, role: p.role, dodged: true, value: 0, outcome: { type: 'dodge', label: 'MISS' }, targetBefore, targetAfter: snapshotTarget(this.getHpSnapshot(), p.id), hpSnapshot: this.getHpSnapshot() });
              continue;
            } else {
              // 若未直接判定完全失誤，此次攻擊依然有 60%~100% 的傷害不對我方造成傷害
              playerRawScatter[p.id] = Math.round((playerRawScatter[p.id] || 0) * (1 - avoidRate));
              log.push({ text: `📜👁️ **【障目符】** 視界遮蔽！目標攻擊命中率大幅下降，此次攻擊有 ${Math.round(avoidRate * 100)}% 的傷害未對 **${p.name}** 生效！`, type: 'buff' });
            }
          }

          const totalRawAssigned = aoeDmgRaw + (playerRawScatter[p.id] || 0);
          if (totalRawAssigned === 0) {
            monsterHits.push({ targetId: p.id, role: p.role, dodged: false, value: 0, outcome: { type: 'normal' }, targetBefore, targetAfter: snapshotTarget(this.getHpSnapshot(), p.id), hpSnapshot: this.getHpSnapshot() });
            continue;
          }
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

          // 聖騎士【代受恩典】：守護隊友承受傷害與負面狀態
          const paladinGrace = this.getCombatPlayers().find(pl => pl.role === 'paladin' && pl.hp > 0 && pl.paladinGrace?.targetId === p.id);
          if (paladinGrace && paladinGrace.id !== p.id && totalTakenDmg > 0) {
            let redirectedDmg = totalTakenDmg;
            // 聖騎士【代受恩典】：二技能多獲得 15% 減傷
            redirectedDmg = Math.floor(redirectedDmg * 0.85);
            if (paladinGrace.role === 'paladin' && ((paladinGrace.tempHp > 0) || (paladinGrace.p8Shields || []).some(s => s.value > 0)) && (paladinGrace.equips || []).some(e => e.id === 'pal_banner')) {
              redirectedDmg = Math.floor(redirectedDmg * 0.85);
            }
            const dmgRes = this.applyDamageToPlayer(paladinGrace, redirectedDmg, { kind: 'grace_redirect' });
            redirectedDmg = dmgRes.actualDmg;
            paladinGrace.paladinGrace.interceptedDamage = (paladinGrace.paladinGrace.interceptedDamage || 0) + dmgRes.actualDmg;
            if (redirectedDmg > 0 && monster.baseHp < 100) {
              paladinGrace.bleedTurns = 2;
            }
            log.push({ text: `🛡️🕊️ **${paladinGrace.name}**【代受恩典】挺身而出，為 **${p.name}** 承受了 **${redirectedDmg}** 點傷害！（聖騎士 ❤️ ${paladinGrace.hp + (paladinGrace.tempHp || 0)}/${paladinGrace.maxHp}）`, type: 'buff' });
            if (paladinGrace.hp <= 0) {
              paladinGrace.hp = 0;
              this.clearPlayerDebuffs(paladinGrace);
              paladinGrace.paladinGrace = null;
              log.push({ text: `💥 **${paladinGrace.name}** 因替隊友承受致命傷害而倒地陣亡！💀`, type: 'damage' });
              monsterHits.push({ targetId: paladinGrace.id, sharedFrom: p.id, value: redirectedDmg, tempAbsorbed: dmgRes.tempAbsorbed, hpDmg: dmgRes.hpDmg, isDead: true, shieldMod: shieldDamageMod, hpSnapshot: this.getHpSnapshot() });
            } else {
              monsterHits.push({ targetId: paladinGrace.id, sharedFrom: p.id, value: redirectedDmg, tempAbsorbed: dmgRes.tempAbsorbed, hpDmg: dmgRes.hpDmg, isDead: false, shieldMod: shieldDamageMod, hpSnapshot: this.getHpSnapshot() });
            }
            monsterHits.push({ targetId: p.id, role: p.role, value: 0, finalDamage: 0, outcome: { type: 'block', grace: true }, targetBefore, targetAfter: snapshotTarget(this.getHpSnapshot(), p.id), hpSnapshot: this.getHpSnapshot() });
            continue;
          }

          // 樹精替全體隊友主動吸收 50% 受到傷害
          if (treantDruid && treantDruid.id !== p.id && totalTakenDmg > 0 && treantDruid.hp > 0) {
            const absorbedDmg = Math.floor(totalTakenDmg * 0.5);
            totalTakenDmg -= absorbedDmg;
            const treantActualDmg = Math.max(1, Math.floor(absorbedDmg * (1 - GAME_BALANCE.treantDamageReduction))); // 樹精減傷30%
            const treantDmgRes = this.applyDamageToPlayer(treantDruid, treantActualDmg, { kind: 'secondary' });
            const treantFinalDmg = treantDmgRes.actualDmg;
            log.push({ text: `🌳 **${treantDruid.name}** (樹精) 伸展藤蔓為 **${p.name}** 承受吸收了 **${absorbedDmg}** 點傷害（減傷30%與防禦後實受 **${treantFinalDmg}** 點）！（❤️ 樹精剩餘HP: ${treantDruid.hp}/${treantDruid.maxHp}）`, type: 'buff' });

            if (treantDruid.hp <= 0) {
              treantDruid.hp = 1;
              treantDruid.druidForm = 'tree';
              treantDruid.druidFormTurns = 1;
              treantDruid.stunnedNextTurn = true;
              log.push({ text: `🪵 **${treantDruid.name}** 因替隊友承受致命傷害，觸發樹精守護！保留 1 點生命並化身為【沉睡古樹】，進入 1 回合休眠狀態（無法行動）！`, type: 'buff' });
              visualEvents.push({ type: 'transform_tree', sourceId: treantDruid.id });
              monsterHits.push({ targetId: treantDruid.id, sharedFrom: p.id, value: treantFinalDmg, tempAbsorbed: treantDmgRes.tempAbsorbed, hpDmg: treantDmgRes.hpDmg, isDead: false, shieldMod: shieldDamageMod, hpSnapshot: this.getHpSnapshot() });
            } else {
              monsterHits.push({ targetId: treantDruid.id, sharedFrom: p.id, value: treantFinalDmg, tempAbsorbed: treantDmgRes.tempAbsorbed, hpDmg: treantDmgRes.hpDmg, isDead: false, shieldMod: shieldDamageMod, hpSnapshot: this.getHpSnapshot() });
            }
          }

          const isNightmareTrueDmg = incomingParts.some(x => x.outcome === 'nightmare');
          if (!isNightmareTrueDmg && !this.arena && totalTakenDmg > 0) {
            totalTakenDmg = mitigateDirectDamage(totalTakenDmg, { damageType: 'phys', defense: resolveStats(p, this.statMultiplier(p)).DEF });
          }
          if (paladinGrace && paladinGrace.id === p.id && totalTakenDmg > 0) {
            paladinGrace.paladinGrace.interceptedDamage = (paladinGrace.paladinGrace.interceptedDamage || 0) + totalTakenDmg;
          }

          let remainingShield=p.tempHp||0, hpEvents=0, assigned=0;
          for(let i=0;i<rawParts.length;i++) {
            const value=i===rawParts.length-1?totalTakenDmg-assigned:Math.floor(totalTakenDmg*rawParts[i]/totalRawAssigned);assigned+=value;
            if(value>remainingShield)hpEvents++;remainingShield=Math.max(0,remainingShield-value);
          }
          const dmgRes = this.applyDamageToPlayer(p, totalTakenDmg, {kind:'enemy_direct',hpEvents,defMitigated:true,trueDamage:isNightmareTrueDmg});
          for(const incoming of incomingParts)if(incoming.outcome==='nightmare')this.p8NightmareHeal(p,incoming.ownerId);

          if (totalTakenDmg > 0 && p.role!=='gladiator' && monster.baseHp < 100) {
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
            hit.guard = shieldDamageMod < 1 || hit.targetAfter?.druidForm === 'treant';
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

      visualEvents.push({
        type: 'monster_attack',
        monsterId: monster.instanceId,
        isUlt: isUltTurn,
        ultName: monster.ultName,
        shieldMod: shieldDamageMod,
        hits: monsterHits
      });

      // 首領/敵人行動演出步驟加入 presentationQueue (直接接續，不插入 BOSS TURN 字幕)
      if (monster.hp > 0) {
        const monsterTemplate = this.studioContent.battleNarratives.monsters[monster.originalName || monster.name] || {
          normal: `👾 **${monster.name}** 發動了猛烈反擊！`,
          ult: `🔥 **${monster.name}** 釋放了必殺技【${monster.ultName}】！`
        };
        const firstHit = monsterHits[0] || {};
        const primaryTargetId = firstHit.targetId;
        const primaryTarget = primaryTargetId ? this.players[primaryTargetId] : null;

        presentationQueue.push({
          type: 'boss_action',
          enemyId: monster.instanceId,
          augurReactions:this.augurReactions.slice(bossAugurReactionIndex),
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
            monsterId: monster.instanceId,
            isUlt: isUltTurn,
            ultName: monster.ultName,
            shieldMod: shieldDamageMod,
            hits: monsterHits
          }],
          hpSnapshot: this.getHpSnapshot()
        });
      }
    }

    this.monsterStunnedThisRound = false;
    this.refreshPrimaryMonster();
    monster = this.currentMonster;

    // 回合末尾統一進行減傷盾與易傷的倒數
    if (this.warriorShieldTurn === 1) {
      this.warriorShieldTurn = 2;
    } else if (this.warriorShieldTurn === 2) {
      this.warriorShieldTurn = 0;
    }


    if (this.alcVulnerableTurns > 0) {
      this.alcVulnerableTurns -= 1;
    }
    if (this.alcVulnerableNextTurn) {
      this.alcVulnerableTurns = 1;
      this.alcVulnerableNextTurn = false;
    }

    // 箭刺陷阱區域回合倒數
    if (this.arrowTrap && this.arrowTrap.turns > 0) {
      this.arrowTrap.turns -= 1;
      if (this.arrowTrap.turns <= 0) {
        log.push({ text: `🏹 地表的【箭刺陷阱區域】箭矢耗損殆盡消散了。`, type: 'info' });
        this.arrowTrap = null;
      }
    }

    // 結算戰士揮砍失衡易傷（強酸裝備減半由 roundModifiers 管理）
    for (const pl of this.getCombatPlayers()) {
      if (pl.warriorVulnerableTurns > 0) pl.warriorVulnerableTurns -= 1;
      if (pl.warriorVulnerableNextTurn) {
        pl.warriorVulnerableTurns = 1;
        pl.warriorVulnerableNextTurn = false;
      }

    }

    } // 結束怪物存活時的反擊結算 (else 區塊)

    if(this.arena&&this.players[this.arena.playerId]?.hp<=0)this.p8ExitArena(presentationQueue,'gladiator_dead');
    phase8Actor=null;this.enemyCounterResolution=true;this.p8EndRound(presentationQueue,log,applyResistanceDamage,bardDmgMultiplier);this.p8CloakRound(presentationQueue,applyResistanceDamage,bardDmgMultiplier);this.enemyCounterResolution=false;
    for(const p of this.getCombatPlayers()){
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
            const formName = p.druidForm === 'tree' ? '沉睡古樹' : (p.druidForm === 'werewolf' ? '狼人' : p.druidForm==='bear'?'巨熊':'樹精');
            log.push({ text: `🌿 **${p.name}** 的【${formName}】形態結束，解除變身回復正常人身狀態。`, type: 'info' });
            restoreBearForm(p);
            p.druidForm = null;
            visualEvents.push({ type: 'transform_end', sourceId: p.id, role: 'druid' });
          }
        }
      }
    }
    if(this.getLivingEnemies().length > 0 && this.getCombatPlayers().some(p=>P8_ROLES.includes(p.role)||p.role==='druid'))presentationQueue.push({type:"status_cleanup",hpSnapshot:this.getHpSnapshot()});

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
    for (const pl of this.getCombatPlayers()) { delete pl.rolledFlaskType; }

    const narrationDuration = Math.max(5, presentationQueue.length * 1.6 + 1.2);
    log.forEach(l => this.addLog(l.text, l.type));

    drainEnemyEvents(this,presentationQueue);
    this.p8LogBuffer=null;
    this.augurVisuals=null;
    this.refreshPrimaryMonster();
    monster = this.currentMonster;
    if (this.getLivingEnemies().length === 0 && monster && !presentationQueue.some(step => step.type === 'kill')) {
      presentationQueue.push({type:'kill',monsterName:monster.name,
        narrative:this.studioContent.text('event.victory',`💀 **${monster.name}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！`,{boss:monster.name}),
        visualEvents:[{type:'monster_killed', targetEnemyId: monster.instanceId}],hpSnapshot:this.getHpSnapshot()});
    }
    this.publishCombatQueue(presentationQueue, 'resolution');
  }

  checkDodge(player, baseRate) {
    if (player.isCrouchedThisRound) {
      player.archerNextDodgeBonus = 0;
      return false;
    }
    let bonus = player.archerNextDodgeBonus || 0;
    player.archerNextDodgeBonus = 0;
    if (this.getEffectiveLeaderRole() === 'archer') {
      bonus += 0.20;
    }
    return Math.random() < Math.min(1, Math.max(0, baseRate + bonus));
  }

  pickTargetWithTaunt(players, enemy=this.currentMonster) {
    if (!players || players.length === 0) return null;
    if (players.length === 1) return players[0];
    const weights = players.map(p => (p.role === 'paladin' ? 1.3 : 1.0) *
      (p.role==='gladiator'&&p.gladiatorChallenge?.round===this.battleRound&&p.gladiatorChallenge.enemyId===enemy?.instanceId?1.5:1));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < players.length; i++) {
      r -= weights[i];
      if (r <= 0) return players[i];
    }
    return players[players.length - 1];
  }

  publishCombatQueue(queue, mode = 'resolution') {
    drainEnemyEvents(this,queue);
    queue.forEach(sequenceAugurDamageResults);
    this.augurVisuals=null;
    this.refreshPrimaryMonster();
    const allEnemiesDead = this.enemies?.length > 0 ? this.getLivingEnemies().length === 0 : (this.currentMonster?.hp <= 0);
    if(allEnemiesDead) {
      this.clearAugurBattleDebts();
      if(queue.length)queue.at(-1).hpSnapshot=this.getHpSnapshot();
    }
    this.clearTimer();
    this.timerCallback = null;
    this.selectionState = 'RESOLVING';
    this.isNarrating = true;
    this.presentationMode = mode;
    this.battlePresentationId += 1;
    normalizeCombatQueue(queue, this.code + ":" + this.battlePresentationId);
    this.career?.capture(this, queue);
    this.pendingPresentationAcks = new Set(this.getCombatPlayers().filter(p => p.connected).map(p => p.id));
    this.emitPublic('battle:presentation_queue', {
      queue, round: this.battleRound, presentationId: this.battlePresentationId,
      monsterKilled: allEnemiesDead
    });
    this.broadcastState();
  }

  // 處理客戶端演出結束確認回調 (Presentation Complete -> Next Round Start)
  handlePresentationComplete(socketId, presentationId, round) {
    if (this.state !== 'IN_BATTLE' || this.selectionState !== 'RESOLVING' ||
        presentationId !== this.battlePresentationId || round !== this.battleRound || !this.players[socketId]?.connected || !this.isStageParticipant(socketId)) return;
    this.pendingPresentationAcks.delete(socketId);
    if (!this.pendingPresentationAcks.size) this.finishTurnPresentation();
  }

  // 演出完全結束後，進行勝負判定與下一回合過渡
  finishTurnPresentation() {
    if (this.persistence?.executionStopped(this)) return;
    if (this.career?.deferUntilPersisted(this, () => this.finishTurnPresentation())) return;
    if (this.presentationSafetyTimer) {
      clearTimeout(this.presentationSafetyTimer);
      this.presentationSafetyTimer = null;
    }
    if (this.selectionState !== 'RESOLVING') return;

    this.refreshPrimaryMonster();
    const monster = this.currentMonster;
    const allEnemiesDead = this.enemies?.length > 0 ? this.getLivingEnemies().length === 0 : Boolean(monster && monster.hp <= 0);
    const remainingLiving = this.getCombatPlayers().filter(p => p.hp > 0);
    if (remainingLiving.length === 0) {
      if (allEnemiesDead) {
        this.addLog(`⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**`, 'damage');
      }
      this.handleGameOver();
      return;
    }

    const canFightLiving = this.getCombatPlayers().filter(p => p.hp > 0 && !p.isSurrendered);
    if (canFightLiving.length === 0 && monster && (monster.name === '暗影魔狼族長' || monster.name.includes('暗影魔狼族長'))) {
      this.addLog(`👑🐺💀 **【血脈臣服·全隊潰敗】** 隊伍其他成員皆已戰死，生還的德魯伊仍處於狼王臣服無法行動，場上已無人能繼續作戰，冒險直接判定挑戰失敗！`, 'damage');
      this.handleGameOver();
      return;
    }

    if (monster && allEnemiesDead) {
      this.handleMonsterVictory(monster, [], [], true);
      return;
    }

    if (this.presentationMode === 'round_start') { this.startSkillSelection(); return; }
    // 準備下一回合
    this.battleRound += 1;
    this.executeTurn();
  }

  advanceToNextFloorOrCheckpoint() {
    if (this.persistence?.executionStopped(this)) return;
    this.clearTimer();
    const isCol9Boss = this.getHexNode(this.currentHex?.col, this.currentHex?.row)?.type === 'END_ELITE' || this.currentHex?.type === 'END_ELITE';
    if (isCol9Boss) {
      this.state = 'CHECKPOINT';
      this.addLog(`🏰【深淵終點守護結界】恭喜小隊成功討伐第 9 區深淵領主！前方是神聖的守護結界。請隊長做出抉擇：凱旋撤退或繼續深入！`, 'info');
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
      void this.persistence?.finish(this);
      this.addLog(`🏆【榮耀凱旋】隊長決定滿載而歸！小隊成功擊敗深淵領主並安全撤出！`, 'loot');
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
    this.hexMap = this.generateHexMap();
    this.currentHex = { col: 0, row: 3 };
    this.scoutedCols = new Set();
    this.startRouteSelection();
  }

  handleGameOver() {
    this.career?.finish(this, false);
    this.clearZanshin();
    this.clearAugurBattleDebts();
    this.p8ExitArena();
    for(const p of Object.values(this.players)){p.warriorStacks=0;p.p8Effects={};p.p8Shields=[];p.tempHp=0;p.temporaryOverheal=0;if(p.role==='gladiator'){p.rage=0;p.gladiatorInspiration=[];p.gladiatorChallenge=null;}}
    this.clearTimer();
    this.state = 'GAME_OVER';
    this.gameOverReason = 'wipe';
    void this.persistence?.finish(this);
    this.addLog(`💀 **【挑戰失敗】冒險小隊在深淵第 ${this.floor} 層全體倒下...**`, 'damage');
    this.broadcastState();
  }

  restartToLobby(socketId) {
    if (socketId !== this.leaderId) return { success: false, message: '只有隊長能重啟冒險！' };
    if (this.adventureId && this.checkpoint?.status !== 'ended') return { success: false, message: '請先正式結束冒險並確認結束狀態保存成功' };
    this.clearTimer();
    if (this.state === 'PROLOGUE' || this.state === 'CHOOSING_ROUTE') this.pendingPresentationAcks.clear();
    clearRoleRandom(this);
    this.state = 'LOBBY';
    this.selectionState = 'SELECTING';
    this.floor = 1;
    this.battleRound = 1;
    this.currentMonster = null;
    this.currentEvent = null;
    this.arena = null;
    this.enemyArena = null;
    this.enemyMechanicQueue=[];
    this.arenaPending = null;
    this.warriorShieldTurn = 0;
    this.alcVulnerableTurns = 0;
    this.alcVulnerableNextTurn = false;
    this.gameOverReason = null;
    this.routeVotes = {};
    this.pendingDrop = null;
    this.monsterStunnedThisRound = false;
    this.isWolfSurrenderGameOver = false;
    this.hexMap = this.generateHexMap();
    this.currentHex = { col: 0, row: 1 };
    this.scoutedCols = new Set();

    for (const p of Object.values(this.players)) {
      restoreBearForm(p);
      p.hp = p.role ? CLASSES[p.role].maxHp : 100;
      p.maxHp = p.hp;
      p.tempHp = 0;
      p.isLocked = false;
      p.bonusAtk = 0; p.statsVersion=2; p.victoryAtkBonus = 0; p.stealthStacks = p.role==='assassin'?1:0; p.critTowardStealth = 0; p.isHiddenThisRound = false; p.followUpsThisRound = 0; p.stealthBrokenThisRound = false;
      p.equips = [];
      p.equipCounts = {};
      Object.assign(p, {p8Effects:{},p8Shields:[],temporaryOverheal:0,p8TeamHp:0,p8DisabledHp:0,p8CorrodedHp:0,warriorStacks:0,rage:0,gladiatorInspiration:[],gladiatorChallenge:null,inspirationRound:0,rageRoundNumber:0,rageRoundGain:false,gladiatorChallengeGain:false,bloodStacks:0,soul:0,kyoutou:false,arenaActive:false,paladinGrace:null,paladinGloryTrackedDamage:0,paladinGloryCastedRound:0,sageX:30,sageDebt:0,sageOperand:0,sagePhase:'hypothesis',sageCycleRound:0,sageInduction:false,sageSamplingEnded:true,sageEquationResolved:false,sageSolvedThisRound:false,sagePrimeResetPending:false});
      delete p.sagePreviousAction;delete p.sageLastAction;delete p.sageDebtScheduledRound;
      delete p.noReviveFloor;
      p.cooldowns = {};
      if (p.role) {
        CLASSES[p.role].skills.forEach(s => { p.cooldowns[s.id] = 0; });
      }
      p.action = null;
      p.targetPlayerId = null;
      p.targetEnemyId = null;
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

  setTimer(seconds, callback, broadcastTicks = false) {
    this.clearTimer();
    this.timerCallback = callback;
    this.timerBroadcastTicks = broadcastTicks;
    this.timerEndsAt = Date.now() + seconds * 1000;
    const tick = () => {
      if (this.persistence?.hasLostAuthority(this)) return;
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
    if (this.isPaused && this.state === 'IN_BATTLE' && !this.getCombatPlayers().some(p => p.connected)) return { success: false, message: '等待本階段參戰者重新連線' };
    if (this.isPaused && this.persistence?.hasLostAuthority(this)) return { success: false, message: '執行權限已失效，請重新連線恢復冒險' };
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
      if (this.state === 'CHOOSING_ROUTE') this.checkRouteVoteCompletion();
      this.career?.resume(this);
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
    if (this.adventureId && this.persistence) return this.persistence.end(this, socketId);

    this.clearTimer();
    this.isPaused = false;
    this.pausedRemainingSeconds = null;
    this.state = 'GAME_OVER';
    this.gameOverReason = 'abandon';
    this.career?.finish(this, false);
    void this.persistence?.finish(this);
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
    if (!metrics.enabled) return this.buildClientState();
    const start = performance.now();
    try { return this.buildClientState(); }
    finally { metrics.record('state.build.ms', performance.now() - start); }
  }

  buildClientState() {
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
      isDev: this.isDev === true,
      adventureId: this.adventureId || null,
      checkpoint: this.checkpoint ? { ...this.checkpoint } : null,
      careerStatus: this.career?.status(this) || null,
      restoredFromCheckpoint: !!this.restoredFromCheckpoint,
      stateVersion: this.stateVersion || 0,
      operationContexts: { lock: operationContext(this, 'battle:lock'), shop: operationContext(this, 'event:shop_action') },
      leaderId: this.leaderId,
      lockedLeaderId: this.getEffectiveLeaderId(),
      lockedLeaderRole: this.getEffectiveLeaderRole(),
      leaderSkill: this.getEffectiveLeaderSkill() || (this.players[this.leaderId]?.role ? LEADER_SKILLS[this.players[this.leaderId]?.role] : null),
      leaderSkillUsedThisBattle: Boolean(this.leaderSkillUsedThisBattle),
      gold: this.gold ?? 0,
      squadInventory: (this.squadInventory || []).map(item => item ? ({ ...item }) : null),
      overflowItems: (this.overflowItems || []).map(item => item ? ({ ...item }) : null),
      abyssState: this.abyssState ? structuredClone(this.abyssState) : null,
      abyssFlashRedEye: Boolean(this.abyssFlashRedEye),
      state: this.state,
      selectionState: this.selectionState || 'SELECTING',
      floor: this.floor,
      battleRound: this.battleRound,
      warriorShieldTurn: this.warriorShieldTurn,
      alcVulnerableTurns: this.alcVulnerableTurns || 0,
      alcVulnerableNextTurn: this.alcVulnerableNextTurn || false,
      isPaused: this.isPaused,
      timerRemaining: timerRemaining,
      gameOverReason: this.gameOverReason,
      arena: this.arena ? {playerId:this.arena.playerId,enemyId:this.arena.enemyId,until:this.arena.until,enemyForced:false} : null,
      enemyArena: this.enemyArena ? {...this.enemyArena} : null,
      arrowTrap: this.arrowTrap ? { ...this.arrowTrap } : null,
      arrowTrapTurns: this.arrowTrap?.turns || 0,
      enemies: (this.enemies || []).map(e => this.formatEnemySnapshot(e)),
      currentMonster: this.currentMonster ? {
        ...this.currentMonster,
        flawMarks: this.currentMonster.flawMarks || 0,
        poisonTurns: this.currentMonster.poisonTurns || 0,
        poisonDmg: this.currentMonster.poisonDmg || 0,
        burnTurns: this.currentMonster.burnTurns || 0,
        burnDmg: this.currentMonster.burnDmg || 0,
        fractureTurns: this.currentMonster.fractureTurns || 0,
        fractureDmg: this.currentMonster.fractureDmg || 0,
        chillTurns: this.currentMonster.chillTurns || 0,
        chillDmg: this.currentMonster.chillDmg || 0,
        corrosionTurns: this.currentMonster.corrosionTurns || 0,
        corrosionMaxHpDeducted: this.currentMonster.corrosionMaxHpDeducted || 0,
        talismans: [...(this.currentMonster.talismans || [])],
        permanentTalismans: [...(this.currentMonster.permanentTalismans || [])]
      } : null,
      currentEvent: this.currentEvent?.type === 'chest'
        ? Object.fromEntries(Object.entries(this.currentEvent).filter(([key]) => key !== 'isMimic'))
        : this.currentEvent,
      currentTransition: this.currentTransition,
      currentPrologue: (this.state === 'PROLOGUE') ? this.studioContent.storyTexts.prologue : null,
      narrativeControl: this.getNarrativeControl(),
      isNarrating: this.isNarrating || false,
      currentHex: this.currentHex ? { ...this.currentHex } : { col: 0, row: 3 },
      hexMap: this.getClientHexMap(),
      currentRoutes: this.currentRoutes || ROUTES.slice(0, 4),
      routeVotes: this.routeVotes || {},
      routeVoteCounts: routeVoteCounts,
      spectatorJoin: this.spectators?.publicStatus() || null,
      stageRoster: this.stageRoster,
      routePresentationId: this.routePresentationId,
      floorRevival: this.floorRevival,
      battlePresentationId: this.battlePresentationId,
      currentVictory: this.currentVictory,
      victoryInteractionReady: this.victoryInteractionReady || false,
      gameBalance: GAME_BALANCE,
      routeNarrative: this.studioContent.storyTexts.routeChoice.paragraphs.slice(0, 2),
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
        temporaryOverheal: Math.min(p.tempHp || 0,p.temporaryOverheal || 0),
        shieldHp: Math.max(0,(p.tempHp || 0)-(p.temporaryOverheal || 0)),
        displayHp: p.hp + (p.tempHp || 0),
        displayMaxHp: p.maxHp + (p.tempHp || 0),
        maxHp: p.maxHp,
        bonusAtk: p.bonusAtk,
        ...resolveStats(p,this.statMultiplier(p)),
        equips: (p.equips || []).map(e => ({ id: e.id, name: e.name, type: e.type, desc: e.desc, statDesc: e.statDesc, icon: e.icon, role: e.role, slot: e.slot, tier: e.tier })),
        equipCounts: p.equipCounts || {},
        bag: (p.bag || []).map(item => item ? ({ ...item }) : null),
        equipSlots: p.equipSlots ? { ...p.equipSlots } : { WEAPON: null, ARMOR: null, ACCESSORY: null, CLASS_EXCLUSIVE: null },
        bonusDef: p.bonusDef || 0,
        regenPerRound: p.regenPerRound || 0,
        battleStartShield: p.battleStartShield || 0,
        availableSkills: getPlayerSkills(p),
        votedRouteId: (this.routeVotes && this.routeVotes[p.id]) || null,
        targetEnemyId: p.targetEnemyId || null,
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
        bearMaxHpAdded: p.bearMaxHpAdded || 0,
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
        burnTurns: p.burnTurns || 0,
        burnDmg: p.burnDmg || 0,
        fractureTurns: p.fractureTurns || 0,
        fractureDmg: p.fractureDmg || 0,
        chillTurns: p.chillTurns || 0,
        chillDmg: p.chillDmg || 0,
        corrosionTurns: p.corrosionTurns || 0,
        druidForm: p.druidForm || null,
        druidFormTurns: p.druidFormTurns || 0,
        isSurrendered: p.isSurrendered || false,
        minions: (p.minions || []).map(m => ({
          ...companionSnapshot(m,p,this),
          id: m.id,
          type: m.type,
          name: m.name,
          minionIndex: m.minionIndex,
          avatar: m.avatar || (m.type === 'wolf' ? `/assets/characters/summons/druid/幼狼${m.minionIndex || 1}.webp` : `/assets/characters/summons/druid/小樹精${m.minionIndex || 1}.webp`),
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
          avatar: p.minions[0].avatar || (p.minions[0].type === 'wolf' ? `/assets/characters/summons/druid/幼狼${p.minions[0].minionIndex || 1}.webp` : `/assets/characters/summons/druid/小樹精${p.minions[0].minionIndex || 1}.webp`),
          attack: p.minions[0].attack ?? p.minions[0].atk,
          atk: p.minions[0].attack ?? p.minions[0].atk,
          owner: p.name,
          ownerId: p.id,
          alive: p.minions[0].hp > 0
        } : (p.minion ? {
          ...p.minion,
          avatar: p.minion.avatar || (p.minion.type === 'wolf' ? `/assets/characters/summons/druid/幼狼${p.minion.minionIndex || 1}.webp` : `/assets/characters/summons/druid/小樹精${p.minion.minionIndex || 1}.webp`),
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
      logs: this.logs.slice(-30) // 最近 30 筆日誌
    };
  }

  settleInventoryOverflow() {
    // Retain full-backpack rewards until an actual slot becomes available.
    while (this.overflowItems?.length) {
      if (!this.addItemPrioritySquad(this.overflowItems[0])) break;
      this.overflowItems.shift();
    }
  }

  broadcastState() {
    this.settleInventoryOverflow();
    this.stateVersion = (this.stateVersion || 0) + 1;
    const state = this.getClientState();
    if (metrics.enabled) {
      const now = performance.now();
      metrics.record('state.bytes', Buffer.byteLength(JSON.stringify(state)));
      metrics.record('state.broadcasts', 1);
      if (this.lastBroadcastAt !== undefined) metrics.record('state.interval.ms', now - this.lastBroadcastAt);
      this.lastBroadcastAt = now;
    }
    this.emitPublic('room:update', state);
  }

  emitPublic(event, data) {
    this.io.to(this.code).emit(event, data);
    this.spectators?.emit(event, data);
  }
}

Object.assign(Room.prototype, phase8Methods);
