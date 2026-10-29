import { Identity, publicPlayer, cookieToken, digest } from './game/Identity.js';
import { playerSocket, disconnectPlayer, reconnectPlayer } from './game/player-connection.js';
import { AdventureStore, MemoryAdventureStore } from './game/AdventureStore.js';
import { AdventurePersistence } from './game/AdventurePersistence.js';
import { CareerStats } from './game/CareerStats.js';
import { Spectators, spectatorReads, spectatorState } from './game/Spectators.js';
import { CareerStore, MemoryCareerStore } from './game/CareerStore.js';
import { handleOperation, startEventLoopMetrics, metrics } from './game/performance.js';
import express from 'express';
import {getAssetManifest} from './studio/asset-manifest.js';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import localPaths from './public/js/shared/local-paths.cjs';
import { Room } from './game/Room.js';
import { DevAccess } from './game/DevAccess.js';
import { DevController } from './game/DevController.js';
import { CLASSES, ROUTES, ROLE_DETAILS } from './game/constants.js';
import { loadEnv } from './studio/env.js';
import { mountStudio } from './studio/router.js';
import { refreshPublished,createRoomContent,contentCache } from './studio/content.js';
import { leaderSkillCopy } from './studio/leader-copy.js';
loadEnv();
metrics.enabled = process.env.GAME_PERF === '1';
process.once('exit', startEventLoopMetrics());
const displayClasses = Object.fromEntries(Object.entries(CLASSES).map(([role, value]) => [role, { ...value, leaderSkill: leaderSkillCopy(role) }]));
const devAccess = new DevAccess();
const devController = new DevController(devAccess);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
if(process.env.RENDER)app.set('trust proxy',1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// 提供靜態檔案 (前端 SPA 與照片目錄)
mountStudio(app, path.join(__dirname, 'public'),{onPublish:async()=>syncLobbyContent(await refreshPublished())});
// Published reads never prevent server startup or authoritative gameplay.
void refreshPublished().then(syncLobbyContent);
setInterval(() => { void refreshPublished().then(syncLobbyContent); }, 60000).unref();
// Saved URLs and published Studio rows can still refer to pre-reorganization paths.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let oldPath;
  try { oldPath = decodeURIComponent(req.path).replace(/^\/boss\//i, '/BOSS/'); } catch { return next(); }
  const target = localPaths.canonical(oldPath);
  if (target === oldPath) return next();
  res.sendFile(target.slice(1), { root: path.join(__dirname, 'public') });
});
app.get('/js/shared/local-paths.cjs', (_req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'public/js/shared/local-paths.cjs'));
});
app.get('/asset-manifest.json',async(_req,res,next)=>{try{res.set('Cache-Control','no-cache').json(await getAssetManifest());}catch(error){next(error);}});
app.use(express.static(path.join(__dirname, 'public'),{setHeaders(res,file){
  if(file.includes(path.sep+'assets'+path.sep))res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
  if(file.endsWith('asset-worker.js'))res.setHeader('Cache-Control','no-cache');
}}));
app.get('/dev', (req, res) => {
  if (!devAccess.enabled) return res.sendStatus(404);
  if (req.path !== '/dev') return res.redirect('/dev');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/skill-copy',(_req,res)=>res.json(Object.fromEntries(Object.entries(displayClasses).map(([id,c])=>[id,{...c,skills:c.skills.map((skill,index)=>({...skill,shortDesc:skill.shortDesc??skill.desc,desc:ROLE_DETAILS[id]?.skills?.[index]?.desc??skill.desc}))}]))));

// 遊戲房間登錄表 (code -> Room)
const rooms = new Map();
// 玩家 Socket 與房間對照表 (socketId -> code)
const socketToRoom = new Map(); // Player ID -> active in-memory Room
const activeConnections = new Map();
const revokedSessionHashes = new Map();
const identityVersions = new Map();
const identity = new Identity();
const adventures = new AdventurePersistence(identity.store.durable === false
  ? new MemoryAdventureStore({ nameOf: id => identity.store.players.get(id)?.display_name }) : new AdventureStore());
process.once('exit', () => adventures.close());
const career = new CareerStats(identity.store.durable === false ? new MemoryCareerStore() : new CareerStore());
process.once('exit', () => career.close());
app.use('/api/player', express.json({ limit: '4kb' }));
identity.mount(app, {
  revoke(id, change = {}) {
    if (change.hash) revokedSessionHashes.set(change.hash, Date.now() + 30 * 86400000);
    if (change.version !== undefined) identityVersions.set(id, change.version);
    const transport = activeConnections.get(id);
    if (transport) { transport.emit('player:session_invalid'); transport.disconnect(true); }
  },
  renamed(id, name) {
    const transport = activeConnections.get(id); if (transport) transport.data.identity.display_name = name;
    const room = rooms.get(socketToRoom.get(id));
    if (room?.players[id]) { room.players[id].name = name; room.broadcastState(); }
  }
});
io.use(async (transport, next) => {
  try {
    const origin = transport.handshake.headers.origin;
    if (origin && new URL(origin).host !== transport.handshake.headers.host) return next(new Error('INVALID_ORIGIN'));
    const player = await identity.session(transport.handshake.headers);
    for (const [key, expires] of revokedSessionHashes) if (expires <= Date.now()) revokedSessionHashes.delete(key);
    const hash = cookieToken(transport.handshake.headers) && digest(cookieToken(transport.handshake.headers));
    if (!player || revokedSessionHashes.has(hash) || player.auth_version < (identityVersions.get(player.id) || 0)) return next(new Error('SESSION_REQUIRED'));
    transport.data.identity = player; next();
  } catch { next(new Error('IDENTITY_UNAVAILABLE')); }
});
function syncLobbyContent(ok) {
  if(!ok)return;
  for(const room of rooms.values())if(room.state==='LOBBY'&&room.studioContent.revision!==contentCache.loadedAt){
    room.studioContent=createRoomContent();io.to(room.code).emit('studio:content',room.studioContent.snapshot);
  }
}

// 產生隨機房間代碼 (5碼大寫英數字)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

function retireRoom(room) {
  room.spectators?.close(); room.clearTimer();
  rooms.delete(room.code); career.release(room);
  for (const id of room.memberIds) {
    if (socketToRoom.get(id) === room.code) socketToRoom.delete(id);
    activeConnections.get(id)?.leave(room.code);
  }
}
function bindLifecycle(room) {
  // Keep the terminal result screen available, but detach every transport and
  // registration. It can no longer be mistaken for a live room or Dev party.
  room.onAdventureEnded = () => {
    room.broadcastState();
    for (const id of room.memberIds) {
      const connection = activeConnections.get(id);
      if (connection) connection.data.terminalState = room.getClientState();
    }
    retireRoom(room);
  };
}
const offlineCleanup = new WeakMap();
function scheduleOfflineCleanup(room) {
  clearTimeout(offlineCleanup.get(room));
  const timer = setTimeout(async () => {
    if (Object.values(room.players).some(p => p.connected)) return;
    if (room.state === 'LOBBY' || room.isDev) retireRoom(room);
    else if (await adventures.suspend(room)) retireRoom(room);
  }, room.adventureId ? 0 : Number(process.env.ROOM_OFFLINE_GRACE_MS) || 30000);
  timer.unref(); offlineCleanup.set(room, timer);
}

io.on('connection', (transport) => {
  const socket = playerSocket(transport);
  const previous = activeConnections.get(socket.id);
  activeConnections.set(socket.id, transport);
  if (previous && previous !== transport) { previous.emit('player:session_invalid'); previous.disconnect(true); }
  transport.join(socket.id);
  transport.use((_packet, next) => {
    if (activeConnections.get(socket.id) !== transport || transport.data.identity.expires <= Date.now()) {
      next(new Error('SESSION_EXPIRED')); transport.emit('player:session_invalid'); transport.disconnect(true);
    } else {
      if (socket.data.spectating && !spectatorReads.has(_packet[0])) {
        const reply = _packet.at(-1);
        if (typeof reply === 'function') reply({ success: false, message: '觀戰者不能操作隊伍，請先離開觀戰' });
        return;
      }
      const room = rooms.get(socketToRoom.get(socket.id));
      if (room?.state === 'IN_BATTLE' && !room.isStageParticipant(socket.id) &&
          (_packet[0].startsWith('battle:') || _packet[0] === 'leader:use_skill' || _packet[0] === 'inventory:use_item')) {
        const reply = _packet.at(-1);
        if (typeof reply === 'function') reply({ success: false, message: '本階段未參戰，請等待下一次路線選擇' });
        return;
      }
      const allowedWhileSaving = ['room:resync', 'room:list', 'adventure:list', 'player:career', 'player:career_retry', 'route:interaction_ready', 'adventure:retry_save',
        'adventure:restore', 'adventure:detach', 'game:toggle_pause', 'game:end_battle', 'narrative:accelerate', 'player:rename'];
      if (room?.adventureId && adventures.blocked(room) && !allowedWhileSaving.includes(_packet[0])) {
        const reply = _packet.at(-1);
        if (typeof reply === 'function') reply({ success: false, message: '冒險尚未安全保存或執行權限已失效，請重試保存或重新連線' });
        return;
      }
      next();
    }
  });
  transport.on('error', () => {});
  let expiry;
  const expire = () => {
    const remaining = transport.data.identity.expires - Date.now();
    if (remaining <= 0) { transport.emit('player:session_invalid'); transport.disconnect(true); }
    else { expiry = setTimeout(expire, Math.min(2147483647, remaining)); expiry.unref(); }
  };
  expire();
  socket.emit('player:identity', { player: publicPlayer(socket.data.identity) });
  console.log(`[連線] 玩家連接：${socket.id}`);

  // 發送職業與基礎資料給新客戶端
  socket.emit('init:constants', { classes: displayClasses, routes: ROUTES, roleDetails: ROLE_DETAILS });
  const existing = rooms.get(socketToRoom.get(socket.id));
  const sameMode = !!existing?.isDev === (socket.handshake.auth?.devMode === true);
  if (existing && sameMode && existing.state !== 'LOBBY' && !adventures.hasLostAuthority(existing) && reconnectPlayer(existing, socket, { newConnection: true })) {
    socket.emit('studio:content', existing.studioContent.snapshot); existing.spectators?.notify();
  }

  socket.on('spectator:join', (data, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      identity.limit('spectator:' + socket.id, 30);
      if (rooms.get(socketToRoom.get(socket.id))?.players[socket.id]) throw new Error('請先暫離或離開目前隊伍');
      const room = rooms.get(String(data?.code || '').trim().toUpperCase());
      if (!room || room.isDev || ['GAME_OVER', 'VICTORY'].includes(room.state)) throw new Error('找不到可觀戰的房間');
      const configured = Number(process.env.SPECTATOR_LIMIT ?? 5);
      room.spectators ||= new Spectators(room, io, Number.isInteger(configured) ? Math.max(0, Math.min(50, configured)) : 5, {
        onPromote(joining, target) { socketToRoom.set(joining.id, target.code); joining.emit('studio:content', target.studioContent.snapshot); }
      });
      const result = room.spectators.join(socket);
      if (result.success) socket.data.spectating = room.code;
      reply(result);
    } catch (error) { reply({ success: false, message: error.message }); }
  });
  socket.on('spectator:leave', callback => {
    const watching = rooms.get(socket.data.spectating)?.spectators;
    if (watching?.committing && watching.requests.get(socket.id)?.status === 'saving') {
      if (typeof callback === 'function') callback({ success: false, message: '正在保存加入檢查點，請稍候' });
      return;
    }
    rooms.get(socket.data.spectating)?.spectators?.leave(socket.id); socket.data.spectating = null;
    if (typeof callback === 'function') callback({ success: true });
  });
  for (const event of ['apply', 'cancel', 'select_role']) socket.on('spectator:' + event, (data, callback) => {
    try {
      identity.limit('spectator-join:' + socket.id, 60);
      const spectators = rooms.get(socket.data.spectating)?.spectators;
      const result = !spectators ? { success: false, message: '目前不是觀戰者' } :
        event === 'apply' ? spectators.apply(socket.id) : event === 'cancel' ? spectators.cancel(socket.id, data?.requestId) : spectators.selectRole(socket.id, data);
      if (typeof callback === 'function') callback(result);
    } catch (error) { if (typeof callback === 'function') callback({ success: false, message: error.message }); }
  });
  socket.on('spectator:review', (data, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    const result = room?.spectators?.review(socket.id, data) || { success: false, message: '找不到申請' };
    if (typeof callback === 'function') callback(result);
  });

  socket.on('player:career', async (data, callback) => {
    const reply = typeof data === 'function' ? data : callback;
    try {
      identity.limit('career:' + socket.id, 60);
      const result = await career.read(socket.id);
      if (activeConnections.get(socket.id) !== transport) return;
      if (typeof reply === 'function') reply({ success: true, ...result });
    } catch { if (typeof reply === 'function') reply({ success: false, message: '生涯統計暫時無法讀取，請稍後重試。' }); }
  });
  socket.on('player:career_retry', async callback => {
    try {
      const room = rooms.get(socketToRoom.get(socket.id));
      if (!room?.players[socket.id]) throw new Error('找不到隊伍');
      await career.flush(room);
      if (typeof callback === 'function') callback({ success: true });
    } catch { if (typeof callback === 'function') callback({ success: false, message: '生涯統計仍未完成同步，請稍後重試。' }); }
  });

  socket.on('adventure:list', async (data, callback) => {
    const reply = typeof data === 'function' ? data : callback;
    try {
      const offset = typeof data === 'function' ? 0 : data?.offset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw new Error('無效的冒險列表頁碼');
      const result = await adventures.list(socket.id, offset);
      if (activeConnections.get(socket.id) !== transport) return;
      if (typeof reply === 'function') reply({ success: true, ...result });
    } catch { if (typeof reply === 'function') reply({ success: false, message: '暫時無法讀取冒險列表，請稍後重試。' }); }
  });

  socket.on('adventure:restore', async (data, callback) => {
    try {
      const id = data?.adventureId;
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('無效的冒險代碼');
      const current = rooms.get(socketToRoom.get(socket.id));
      if (current && current.adventureId !== id) throw new Error('請先離開目前房間');
      const before = adventures.active.get(id);
      const restored = await adventures.restore(id, socket.id, { Room, code: generateRoomCode, io });
      bindLifecycle(restored);
      career.attach(restored);
      if (activeConnections.get(socket.id) !== transport) throw new Error('連線已變更，請重新連線');
      const afterRestore = rooms.get(socketToRoom.get(socket.id));
      if (afterRestore && afterRestore.adventureId !== id) throw new Error('已加入其他房間，請先離隊');
      // Replace only a fenced-out copy of this same adventure. Never overwrite an
      // active room with an older checkpoint or pull a member from another party.
      for (const [code, old] of rooms) if (old !== restored && old.adventureId === id) {
        old.spectators?.close();
        old.clearTimer(); rooms.delete(code);
        for (const playerId of old.memberIds) activeConnections.get(playerId)?.leave(code);
      }
      rooms.set(restored.code, restored);
      socket.data.detachedAdventure = null;
      for (const playerId of restored.memberIds) {
        const connected = activeConnections.get(playerId);
        if (connected?.data.detachedAdventure === id && playerId !== socket.id) continue;
        const other = rooms.get(socketToRoom.get(playerId));
        if (other && other !== restored && other.adventureId !== id) continue;
        socketToRoom.set(playerId, restored.code);
        if (connected) {
          connected.emit('studio:content', restored.studioContent.snapshot);
          reconnectPlayer(restored, playerSocket(connected), { newConnection: !restored.players[playerId].connected });
        }
      }
      if (typeof callback === 'function') callback({ success: true, roomCode: restored.code, adventureId: id,
        restoredFromCheckpoint: before !== restored && !!restored.restoredFromCheckpoint });
    } catch (error) { if (typeof callback === 'function') callback({ success: false, message: error.message, code: error.code }); }
  });
  socket.on('adventure:retry_save', async callback => {
    const room = rooms.get(socketToRoom.get(socket.id));
    const result = room ? await adventures.retry(room, socket.id) : { success: false, message: '找不到冒險' };
    if (typeof callback === 'function') callback(result);
  });
  socket.on('adventure:detach', callback => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (room) { socket.data.detachedAdventure = room.adventureId || null; socket.leave(room.code); socketToRoom.delete(socket.id); disconnectPlayer(room, socket.id); scheduleOfflineCleanup(room); }
    if (typeof callback === 'function') callback({ success: true });
  });


  socket.on('dev:authorize', (request, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    const result = devAccess.authorize(socket, room, request?.token);
    if (typeof callback === 'function') callback(result);
  });
  socket.on('dev:inspect', (callback) => {
    if (typeof callback === 'function') callback(devController.inspect(socket, rooms.get(socketToRoom.get(socket.id))));
  });
  socket.on('dev:command', (request, callback) => {
    const result = devController.execute(socket, rooms.get(socketToRoom.get(socket.id)), request);
    if (typeof callback === 'function') callback(result);
  });

  // 1. 建立房間
  socket.on('room:create', ({ name, avatar }, callback) => {
    try {
      const isDev = socket.handshake.auth?.devMode === true;
      if (isDev && !devAccess.enabled) {
        if (typeof callback === 'function') callback({ success: false, message: 'Dev 功能未啟用' });
        return;
      }
      devAccess.revoke(socket);
      const existingCode = socketToRoom.get(socket.id);
      if (rooms.get(existingCode)?.adventureId && rooms.get(existingCode).checkpoint?.status !== 'ended') {
        if (typeof callback === 'function') callback({ success: false, message: '請先暫離或永久離開目前冒險' });
        return;
      }
      if (existingCode && rooms.has(existingCode)) {
        socket.leave(existingCode);
        const previous = rooms.get(existingCode);
        previous.removePlayer(socket.id);
        if (previous.memberIds.length === 0) {
          previous.clearTimer();
          rooms.delete(existingCode);
        }
      }

      const code = generateRoomCode();
      const room = new Room(code, socket, socket.data.identity.display_name, io, avatar);
      socket.data.terminalState = null;
      room.isDev = isDev;
      if (!isDev) { room.persistence = adventures; room.career = career; }
      bindLifecycle(room);
      if (isDev) devController.register(room, socket);
      socket.emit('studio:content', room.studioContent.snapshot);
      rooms.set(code, room);
      socketToRoom.set(socket.id, code);

      console.log(`[建立] 房間 ${code} 建立，隊長：${name} (${socket.id})`);
      if (typeof callback === 'function') {
        callback({ success: true, roomCode: code });
      }
    } catch (err) {
      console.error('建立房間失敗：', err);
      if (typeof callback === 'function') callback({ success: false, message: '建立房間出錯' });
    }
  });

  // 2. 加入房間
  socket.on('room:join', ({ code, name, avatar }, callback) => {
    try {
      const roomCode = String(code).trim().toUpperCase();
      const previousCode = socketToRoom.get(socket.id);
      if (previousCode && previousCode !== roomCode && rooms.get(previousCode)?.players[socket.id]) {
        if (typeof callback === 'function') callback({ success: false, message: '請先離開目前隊伍' });
        return;
      }
      const room = rooms.get(roomCode);

      if (!room) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: `找不到房間代碼【${roomCode}】！` });
        }
        return;
      }

      if (room.isDev || socket.handshake.auth?.devMode === true) {
        if (typeof callback === 'function') callback({ success: false, message: 'Dev 房間僅限建立者單人使用' });
        return;
      }

      const result = room.players[socket.id] ? (reconnectPlayer(room, socket), { success: true }) : room.addPlayer(socket, socket.data.identity.display_name, avatar);
      if (result.success) {
        devAccess.revoke(socket);
        socket.emit('studio:content', room.studioContent.snapshot);
        socketToRoom.set(socket.id, roomCode);
        console.log(`[加入] 玩家 ${name} 加入房間 ${roomCode}`);
      }

      if (typeof callback === 'function') {
        callback(result);
      }
    } catch (err) {
      console.error('加入房間失敗：', err);
      if (typeof callback === 'function') callback({ success: false, message: '加入房間出錯' });
    }
  });

  // 2.2 獲取房間列表 (供大廳隊伍名冊顯示)
  socket.on('room:list', (callback) => {
    try {
      const list = [];
      for (const [c, r] of rooms.entries()) {
        if (r.state === 'LOBBY' && !r.isDev) {
          const leader = Object.values(r.players || {}).find(p => p.id === r.leaderId);
          list.push({
            id: 'srv_' + c,
            code: c,
            name: `${leader?.name || '冒險者'} 的討伐隊伍`,
            subtitleLine1: '>> 王立公會認證懸賞 • 自由職業入駐',
            subtitleLine2: '1~10 人皆可出發，等待隊友入駐！',
            players: Object.keys(r.players || {}).length || 1,
            maxPlayers: 10,
            pingBars: 5,
            iconColor: '#b45309'
          });
        }
      }
      if (typeof callback === 'function') callback({ success: true, rooms: list });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, rooms: [] });
    }
  });

  // 2.5 玩家修改暱稱
  socket.on('player:rename', async ({ newName }, callback) => {
    try {
      const current = await identity.session(socket.handshake.headers);
      if (!current) throw new Error('請重新登入');
      const name = identity.name(newName).slice(0, 12);
      const updated = await identity.store.call('name', { id: socket.id, name });
      socket.data.identity.display_name = updated.display_name;
      const room = rooms.get(socketToRoom.get(socket.id));
      if (room?.players[socket.id]) { room.players[socket.id].name = name; room.broadcastState(); }
      if (typeof callback === 'function') callback({ success: true, newName: name });
    } catch { if (typeof callback === 'function') callback({ success: false, message: '名稱更新失敗，請稍後重試' }); }
  });

  // 2.6 玩家更新頭貼 (Emoji 或上傳照片)
  socket.on('player:update_avatar', ({ avatar }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, message: '找不到房間' });
      return;
    }
    const res = room.updateAvatar(socket.id, avatar);
    if (typeof callback === 'function') callback(res);
  });

  // 3. 選擇職業
  socket.on('player:select_role', ({ roleKey }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.selectRole(socket.id, roleKey);
    if (typeof callback === 'function') callback(res);
  });

  // 3.1 隊員切換準備狀態
  socket.on('room:toggle_ready', (callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.toggleReady(socket.id);
    if (typeof callback === 'function') callback(res);
  });

  // 3.2 隊長轉移
  socket.on('room:transfer_leader', async ({ targetId }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = await adventures.transferLeader(room, socket.id, targetId);
    if (typeof callback === 'function') callback(res);
  });

  // 4. 隊長點擊出發探險 (需全體隊員就緒)
  socket.on('game:start', (callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.startAdventure(socket.id, { checkReady: true });
    if (typeof callback === 'function') callback(res);
  });

  // 4.1 Each client ACKs the complete opening; this event no longer skips it.
  socket.on('prologue:next', (callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.handlePrologueComplete(socket.id);
    if (typeof callback === 'function') callback(res);
  });

  // 4.2 隊長透過按鈕跳過序章，第一層演出仍由路線階段播放
  socket.on('prologue:skip', (callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.skipPrologue(socket.id);
    if (typeof callback === 'function') callback(res);
  });

  // 4.3 隊長加速敘述文字打字
  socket.on('narrative:accelerate', (request, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.accelerateNarrative(socket.id, request);
    if (typeof callback === 'function') callback(res);
  });

  // 5. 路線投票機制 (全員投票，15秒倒數)
  socket.on('route:vote', ({ routeId }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.voteRoute(socket.id, routeId);
    if (typeof callback === 'function') callback(res);
  });

  // 兼容舊版本 route:select
  socket.on('route:select', ({ routeId }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.voteRoute(socket.id, routeId);
    if (typeof callback === 'function') callback(res);
  });

  // 5.1 裝備領取/放棄/替換抉擇
  socket.on('equip:choice', ({ action, replaceIndex }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.handleEquipChoice(socket.id, action, replaceIndex);
    if (typeof callback === 'function') callback(res);
  });

  // 5.2 裝備手動卸下
  socket.on('equip:unequip', ({ index }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.handleUnequip(socket.id, index);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('room:resync', () => {
    const watching = rooms.get(socket.data.spectating);
    if (watching?.spectators?.members.has(socket.id)) { socket.emit('room:update', spectatorState(watching)); return; }
    const room = rooms.get(socketToRoom.get(socket.id));
    if (room) socket.emit('room:update', room.getClientState());
    else if (socket.data.terminalState) socket.emit('room:update', socket.data.terminalState);
  });

  // 6. 戰鬥技能選擇與鎖定 / 取消鎖定 / 切換攻擊目標
  socket.on('battle:select_target', ({ targetEnemyId }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.selectTargetEnemy(socket.id, targetEnemyId);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('battle:lock', (data = {}, callback) => {
    const { actionId, targetPlayerId, targetEnemyId } = data;
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) { if (typeof callback === 'function') callback({ success: false, requestId: data?.requestId, message: '房間不存在，請重新加入' }); return; }
    const res = handleOperation(room, socket, 'battle:lock', data, () => room.lockAction(socket.id, actionId, targetPlayerId, targetEnemyId));
    if (typeof callback === 'function') callback(res);
  });

  socket.on('battle:unlock', (callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.unlockAction(socket.id);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('battle:clear_ammo', () => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    room.clearPlayerAmmo(socket.id);
  });

  // 兼容舊版本提交戰鬥行動
  socket.on('battle:action', ({ actionId, targetPlayerId, targetEnemyId }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.lockAction ? room.lockAction(socket.id, actionId, targetPlayerId, targetEnemyId) : room.submitAction(socket.id, actionId, targetPlayerId, targetEnemyId);
    if (typeof callback === 'function') callback(res);
  });

  // 6.1 戰鬥演出隊列播放完畢確認
  socket.on('battle:presentation_complete', (data) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    room.handlePresentationComplete(socket.id, data?.presentationId, data?.round);
  });

  socket.on('victory:presentation_complete', data => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (room) room.handleVictoryComplete(socket.id, data?.presentationId);
  });
  socket.on('victory:continue', data => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (room) room.continueAfterVictory(socket.id, data?.presentationId);
  });

  // 6.2 回合初效果演出完畢確認
  socket.on('battle:round_start_complete', () => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    room.handleRoundStartComplete(socket.id);
  });

  // 6.25 技能選擇介面就緒（動畫退場、控制項啟用後啟動 30 秒計時，P2-R1.1 Section 6）
  socket.on('battle:selection_ready', (data) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    room.handleSelectionReady(socket.id, data?.round);
  });

  // 6.3 路線互動就緒（選項進場完成、控制項啟用後啟動 15 秒計時，P2-R1.1 Section 5）
  socket.on('route:interaction_ready', (data) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    room.handleRouteNarrativeDone(socket.id, data?.presentationId);
  });

  socket.on('trap:presentation_complete', (data) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (room) room.handleTrapPresentationComplete(socket.id, data?.presentationId);
  });

  socket.on('chest:presentation_complete', (data) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (room) room.handleChestPresentationComplete(socket.id, data?.presentationId);
  });

  socket.on('equipment:interaction_ready', (data) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (room) room.handleEquipmentInteractionReady(socket.id, data?.presentationId);
  });

  socket.on('chest:open', () => {
    // Client clicked open chest; presentation runs locally and ACKs upon completion
  });

  // 6.5 背包與鍛造 (Phase 3)
  socket.on('inventory:transfer_to_squad', ({ bagIndex }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.transferToSquad(socket.id, bagIndex);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('inventory:transfer_to_personal', ({ squadIndex }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.transferToPersonal(socket.id, squadIndex);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('inventory:equip_from_bag', ({ bagIndex, preferredSlot }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.equipItemFromBag(socket.id, bagIndex, preferredSlot);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('inventory:equip_from_squad', ({ squadIndex, preferredSlot }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.equipItemFromSquad(socket.id, squadIndex, preferredSlot);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('inventory:swap_slots', ({ fromArea, fromIndex, toArea, toIndex }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.swapInventorySlots(socket.id, { fromArea, fromIndex, toArea, toIndex });
    if (typeof callback === 'function') callback(res);
  });

  socket.on('inventory:unequip_to_bag', ({ slotKey, targetBagIndex }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.unequipItemToBag(socket.id, slotKey, targetBagIndex);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('inventory:unequip_to_squad', ({ slotKey, targetSquadIndex }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.unequipItemToSquad(socket.id, slotKey, targetSquadIndex);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('inventory:craft', ({ item1Id, item2Id, fromSquad }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.craftEquipment(socket.id, item1Id, item2Id, fromSquad);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('inventory:use_item', ({ fromArea, index, targetPlayerId }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.useConsumableItem(socket.id, { fromArea, index, targetPlayerId });
    if (typeof callback === 'function') callback(res);
  });

  socket.on('inventory:discard_item', ({ fromArea, index, key, slotKey, itemId }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.discardItem(socket.id, { fromArea, index, key, slotKey, itemId });
    if (typeof callback === 'function') callback(res);
  });

  // 6.6 事件互動（商店、寶箱、隨機事件） (Phase 3)
  socket.on('event:shop_action', (data, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) { if (typeof callback === 'function') callback({ success: false, requestId: data?.requestId, message: '房間不存在，請重新加入' }); return; }
    const res = handleOperation(room, socket, 'event:shop_action', data, () => room.handleShopAction(socket.id, data?.action, data));
    if (typeof callback === 'function') callback(res);
  });

  socket.on('event:chest_action', (data, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.handleChestAction(socket.id, data?.action, data);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('event:random_action', (data, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.handleRandomEventAction(socket.id, data?.action, data);
    if (typeof callback === 'function') callback(res);
  });

  // 6.7 隊長技能使用 (Phase 4)
  socket.on('leader:use_skill', (data, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.useLeaderSkill(socket.id, data);
    if (typeof callback === 'function') callback(res);
  });

  // 6.8 深淵對話與抉擇 (Phase 5)
  socket.on('abyss:advance_stage', (callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.advanceAbyssDialogue(socket.id);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('abyss:vote', ({ choiceId }, callback) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const res = room.voteAbyssChoice(socket.id, choiceId);
    if (typeof callback === 'function') callback(res);
  });

  // 7. 休息站抉擇
  socket.on('checkpoint:choice', ({ choice }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.handleCheckpointChoice(socket.id, choice);
    if (typeof callback === 'function') callback(res);
  });

  // 8. 重新開始
  socket.on('game:restart', (callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.restartToLobby(socket.id);
    if (res?.success) devAccess.revoke(socket);
    if (typeof callback === 'function') callback(res);
  });

  // 10. 暫停 / 繼續遊戲
  socket.on('game:toggle_pause', (callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.togglePause(socket.id);
    if (typeof callback === 'function') callback(res);
  });

  // 11. 結束戰鬥 / 中止冒險
  socket.on('game:end_battle', (data, callback) => {
    const cb = typeof data === 'function' ? data : callback;
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.endBattle(socket.id);
    if (typeof cb === 'function') cb(res);
  });

  // 12. 離開隊伍 (若隊長退出則移交第一順位)
  socket.on('leave_party', async (callback) => {
    try {
    devAccess.revoke(socket);
    const code = socketToRoom.get(socket.id);
    if (code && rooms.has(code)) {
      const room = rooms.get(code);
      await adventures.leave(room, socket.id);
      socket.leave(code);
      socketToRoom.delete(socket.id);
      room.removePlayer(socket.id);
      if (room.memberIds.length === 0) {
        room.spectators?.close();
        room.clearTimer();
        rooms.delete(code);
        career.release(room);
        console.log(`[清理] 房間 ${code} 已無玩家，已銷毀。`);
      }
    }
    if (typeof callback === 'function') callback({ success: true });
    } catch (error) { if (typeof callback === 'function') callback({ success: false, message: error.message }); }
  });

  // Transport loss preserves the character; explicit leave_party remains destructive.
  socket.on('disconnect', () => {
    clearTimeout(expiry); devAccess.revoke(socket);
    const watching = rooms.get(socket.data.spectating)?.spectators;
    if (watching?.members.get(socket.id) === socket) watching.leave(socket.id);
    if (activeConnections.get(socket.id) !== transport) return;
    activeConnections.delete(socket.id);
    const room = rooms.get(socketToRoom.get(socket.id));
    if (room) { disconnectPlayer(room, socket.id); scheduleOfflineCleanup(room); }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`⚔️  地城冒險多人連線伺服器已啟動！`);
  console.log(`🌐 監聽埠號：${PORT} (已綁定 0.0.0.0)`);
  console.log(`👥 支援多個瀏覽器分頁即時連線測試！`);
  console.log(`===============================================`);
});
