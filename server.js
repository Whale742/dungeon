import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { Room } from './game/Room.js';
import { CLASSES, ROUTES, ROLE_DETAILS } from './game/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// 提供靜態檔案 (前端 SPA 與照片目錄)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/photo', express.static(path.join(__dirname, 'photo')));
app.use('/BOSS', express.static(path.join(__dirname, 'public', 'BOSS')));
app.use('/boss', express.static(path.join(__dirname, 'public', 'BOSS')));
app.use('/icon', express.static(path.join(__dirname, 'public', 'icon')));
app.use('/sound', express.static(path.join(__dirname, 'public', 'sound')));

// 遊戲房間登錄表 (code -> Room)
const rooms = new Map();
// 玩家 Socket 與房間對照表 (socketId -> code)
const socketToRoom = new Map();

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

io.on('connection', (socket) => {
  console.log(`[連線] 玩家連接：${socket.id}`);

  // 發送職業與基礎資料給新客戶端
  socket.emit('init:constants', { classes: CLASSES, routes: ROUTES, roleDetails: ROLE_DETAILS });

  // 1. 建立房間
  socket.on('room:create', ({ name, avatar }, callback) => {
    try {
      const existingCode = socketToRoom.get(socket.id);
      if (existingCode && rooms.has(existingCode)) {
        rooms.get(existingCode).removePlayer(socket.id);
      }

      const code = generateRoomCode();
      const room = new Room(code, socket, name, io, avatar);
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
      const room = rooms.get(roomCode);

      if (!room) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: `找不到房間代碼【${roomCode}】！` });
        }
        return;
      }

      const result = room.addPlayer(socket, name, avatar);
      if (result.success) {
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

  // 2.5 玩家修改暱稱
  socket.on('player:rename', ({ newName }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, message: '找不到房間' });
      return;
    }
    const res = room.renamePlayer(socket.id, newName);
    if (typeof callback === 'function') callback(res);
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

  // 4. 隊長點擊出發探險
  socket.on('game:start', (callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.startAdventure(socket.id);
    if (typeof callback === 'function') callback(res);
  });

  // 4.1 隊長點擊踏入地城 (跳過開場)
  socket.on('prologue:next', (callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.skipPrologue(socket.id);
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

  // 6. 提交戰鬥行動
  socket.on('battle:action', ({ actionId, targetPlayerId }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const res = room.submitAction(socket.id, actionId, targetPlayerId);
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
    if (typeof callback === 'function') callback(res);
  });

  // 9. 聊天訊息
  socket.on('chat:send', ({ message }) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (room) {
      room.sendChatMessage(socket.id, message);
    }
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

  // 斷線處理
  socket.on('disconnect', () => {
    console.log(`[離線] 玩家離開：${socket.id}`);
    const code = socketToRoom.get(socket.id);
    if (code && rooms.has(code)) {
      const room = rooms.get(code);
      room.removePlayer(socket.id);
      
      // 若房間完全空了，則銷毀房間
      if (room.memberIds.length === 0) {
        room.clearTimer();
        rooms.delete(code);
        console.log(`[清理] 房間 ${code} 已無玩家，已銷毀。`);
      }
    }
    socketToRoom.delete(socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`⚔️  地城冒險多人連線伺服器已啟動！`);
  console.log(`🌐 監聽埠號：${PORT} (已綁定 0.0.0.0)`);
  console.log(`👥 支援多個瀏覽器分頁即時連線測試！`);
  console.log(`===============================================`);
});
