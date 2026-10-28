import { CLASSES } from './constants.js';
import { createRoomContent } from '../studio/content.js';
import { metrics } from './performance.js';
import { gzipSync, gunzipSync } from 'node:zlib';

export const SNAPSHOT_SCHEMA_VERSION = 1;
// Authoritative data at a route boundary. Player records are data-only records:
// preserve ALL their fields, including dynamically installed class/passive state.
export const ROOM_SNAPSHOT_FIELDS = `leaderId memberIds players floor battleCount battlesInCurrentCycle battleRound
warriorShieldTurn alcVulnerableTurns alcVulnerableNextTurn enemies _currentMonster
gold squadInventory overflowItems hexMap currentHex currentRoutes scoutedCols leaderScoutBonus
lockedLeaderId lockedLeaderRole pendingLeaderTransfer leaderSkillUsedThisBattle warriorLeaderGuarded
assassinLeaderFlawApplied samuraiLeaderCounterPursuitDone sageLeaderRetried druidLeaderShieldGiven bardPriorityActive
abyssState abyssFlashRedEye hasTriggeredAbyss stargazerBoundaryScoutedNext roundModifiers
frenzyTeamDrainTurns frenzyTeamDrainNextTurn bardBuffActive monsterStunnedThisRound isWolfSurrenderGameOver
hasCompletedPrep skipPrepShop merchantLootPool arrowTrap arena arenaPending enemyArena
routePresentationId trapPresentationId chestPresentationId battlePresentationId victoryPresentationId
narrativeAccelerated logs`.split(/\s+/);

const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function encode(value, ancestors = new Set()) {
  if (value === undefined) return { $checkpointType: 'Undefined' };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    if (Number.isNaN(value)) throw new Error('存檔包含無效數值');
    return { $checkpointType: value > 0 ? 'Infinity' : '-Infinity' };
  }
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('存檔包含執行期物件或循環參照');
  ancestors.add(value);
  let result;
  if (value instanceof Set) result = { $checkpointType: 'Set', value: [...value].map(v => encode(v, ancestors)) };
  else if (value instanceof Map) result = { $checkpointType: 'Map', value: [...value].map(([k, v]) => [encode(k, ancestors), encode(v, ancestors)]) };
  else if (Array.isArray(value)) result = value.map(v => encode(v, ancestors));
  else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('存檔包含非純資料物件');
    result = {};
    for (const [key, v] of Object.entries(value)) {
      if (forbidden.has(key) || key === '$checkpointType') throw new Error('存檔包含保留欄位');
      result[key] = encode(v, ancestors);
    }
  }
  ancestors.delete(value);
  return result;
}
function decode(value, depth = 0) {
  if (depth > 80) throw new Error('存檔層級過深');
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => decode(v, depth + 1));
  if (value.$checkpointType) {
    switch (value.$checkpointType) {
      case 'Undefined': return undefined;
      case 'Infinity': return Infinity;
      case '-Infinity': return -Infinity;
      case 'Set': return new Set(decode(value.value, depth + 1));
      case 'Map': return new Map(decode(value.value, depth + 1));
      default: throw new Error('不支援的存檔型別');
    }
  }
  const result = {};
  for (const [key, v] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error('無效的存檔欄位');
    result[key] = decode(v, depth + 1);
  }
  return result;
}

export function createRoomSnapshot(room) {
  const start = performance.now();
  if (room.state !== 'CHOOSING_ROUTE' || Object.keys(room.routeVotes).length) throw new Error('只能保存未投票的路線檢查點');
  const data = {};
  for (const key of ROOM_SNAPSHOT_FIELDS) if (Object.hasOwn(room, key)) data[key] = room[key];
  data.logs = room.logs.slice(-30); // Display history, never a source of game rules/statistics.
  const content = JSON.stringify(encode(room.studioContent.snapshot));
  if (Buffer.byteLength(content) > 8 * 1024 * 1024) throw new Error('發布內容超出存檔格式容量');
  const snapshot = { schemaVersion: SNAPSHOT_SCHEMA_VERSION, adventureId: room.adventureId,
    checkpointState: 'CHOOSING_ROUTE', data: encode(data), contentEncoding: 'gzip-base64',
    content: gzipSync(content, { level: 1 }).toString('base64') };
  validateRoomSnapshot(snapshot);
  metrics.record('checkpoint.serialize.ms', performance.now() - start);
  metrics.record('checkpoint.bytes', Buffer.byteLength(JSON.stringify(snapshot)));
  return snapshot;
}

export function validateRoomSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || snapshot.checkpointState !== 'CHOOSING_ROUTE' ||
      typeof snapshot.adventureId !== 'string' ||
      (snapshot.contentEncoding !== undefined && snapshot.contentEncoding !== 'gzip-base64')) throw new Error('不支援的存檔格式或版本');
  const data = decode(snapshot.data);
  if (!data || Object.keys(data).some(k => !ROOM_SNAPSHOT_FIELDS.includes(k)) ||
      !Number.isSafeInteger(data.floor) || data.floor < 1 || !Number.isSafeInteger(data.routePresentationId) ||
      !Array.isArray(data.memberIds) || !data.memberIds.length || data.memberIds.length > 10 ||
      new Set(data.memberIds).size !== data.memberIds.length || !data.memberIds.includes(data.leaderId) ||
      !data.players || Object.keys(data.players).length !== data.memberIds.length ||
      !Number.isFinite(data.gold) || data.gold < 0 || !Array.isArray(data.hexMap) ||
      !Array.isArray(data.currentRoutes) || !data.currentRoutes.length || !(data.scoutedCols instanceof Set)) throw new Error('存檔隊伍或地圖資料不完整');
  for (const id of data.memberIds) {
    const p = data.players[id];
    if (forbidden.has(id) || !p || p.id !== id || !CLASSES[p.role] || !Number.isFinite(p.hp) ||
        !Number.isFinite(p.maxHp) || p.maxHp <= 0 || !Array.isArray(p.bag) || !Array.isArray(p.equips) ||
        !p.equipSlots || !p.cooldowns) throw new Error('存檔角色資料不完整');
  }
  return data;
}

export function restoreRoomSnapshot(Room, snapshot, code, io, activeMemberIds) {
  const start = performance.now();
  const data = validateRoomSnapshot(snapshot);
  const leader = data.players[data.leaderId];
  // Constructor initializes runtime Sets/helpers; no real connection or broadcast.
  const room = new Room(code, { id: leader.id, join() {} }, leader.name, { to: () => ({ emit() {} }) });
  Object.assign(room, data);
  // Read legacy uncompressed V1 checkpoints too. Limit decompression to avoid
  // accepting a corrupt/unbounded payload before constructing runtime helpers.
  const content = snapshot.contentEncoding === 'gzip-base64'
    ? JSON.parse(gunzipSync(Buffer.from(snapshot.content, 'base64'), { maxOutputLength: 8 * 1024 * 1024 }).toString('utf8'))
    : snapshot.content;
  room.studioContent = createRoomContent(decode(content));
  room.adventureId = snapshot.adventureId;
  room.state = 'CHOOSING_ROUTE'; room.routeVotes = {};
  room.routePresentationId += 1;
  room.isNarrating = true; room.pendingPresentationAcks = new Set();
  room.isPaused = true; room.identityOfflinePause = true;
  room.currentEvent = null; room.currentTransition = null; room.currentVictory = null;
  room.pendingDrop = null; room.victoryPendingDrop = null; room.floorRevival = null;
  for (const p of Object.values(room.players)) {
    p.connected = false; p.isLocked = false; p.action = null;
    p.targetPlayerId = null; p.targetEnemyId = null;
    if (p.minions?.length && p.minion?.id === p.minions[0].id) p.minion = p.minions[0];
  }
  if (room._currentMonster?.instanceId) room._currentMonster = room.enemies.find(e => e.instanceId === room._currentMonster.instanceId) || room._currentMonster;
  // Permanent withdrawals are metadata, never new progress checkpoints. Reapply
  // existing recovery/leader-transfer rules to the last committed snapshot.
  for (const id of [...room.memberIds]) if (!activeMemberIds.includes(id)) room.removePlayer(id);
  if (!room.memberIds.length) throw new Error('冒險已無正式成員');
  room.io = io;
  metrics.record('checkpoint.restore.ms', performance.now() - start);
  return room;
}
