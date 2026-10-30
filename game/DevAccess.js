import { createHash, timingSafeEqual } from 'node:crypto';
import { clearRoleRandom } from './DevRoleRandom.js';

// Grants are private server state, bound to the socket object and exact Room instance.
export class DevAccess {
  constructor(env = process.env) {
    this.enabled = env.DEV_TOOLS_ENABLED === 'true' && typeof env.DEV_ACCESS_TOKEN === 'string' && env.DEV_ACCESS_TOKEN.length >= 16;
    this.digest = this.enabled ? this.hash(env.DEV_ACCESS_TOKEN) : null;
    this.grants = new WeakMap();
    this.attempts = new WeakMap();
  }

  hash(value) { return createHash('sha256').update(value).digest(); }

  denial(socket, room, { started = false } = {}) {
    const fail = (code, message) => ({ success: false, code, message });
    if (!this.enabled) return fail('DEV_DISABLED', '伺服器未啟用 Dev 功能');
    if (socket?.data?.spectating) return fail('SPECTATOR', '觀戰者不能取得 Dev 權限');
    if (!room) return fail('NO_ROOM', '目前沒有房間，請從 /dev 建立 Dev 房間');
    if (room.isDev !== true) return fail('NOT_DEV_ROOM', '目前是正式冒險房間；請從 /dev 建立獨立的 Dev 房間');
    if (['GAME_OVER', 'VICTORY'].includes(room.state)) return fail('ROOM_ENDED', '此 Dev 冒險已結束，請重新建立或回到大廳');
    if (room.leaderId !== socket.id) return fail('NOT_LEADER', '只有此 Dev 房間的建立者可以授權');
    if (!Array.isArray(room.memberIds) || room.memberIds.length !== 1) return fail('NOT_SOLO', 'Dev 房間必須只有一名正式成員；離線成員仍計入人數');
    if (room.memberIds[0] !== socket.id || !room.players?.[socket.id] || Object.keys(room.players).length !== 1) return fail('IDENTITY_MISMATCH', 'Dev 房間的永久玩家身分與成員資料不一致，請重新建立房間');
    if (!room.players[socket.id].connected) return fail('DISCONNECTED', '目前角色已離線，請重新連線後授權');
    if (started && room.state === 'LOBBY') return fail('NOT_STARTED', '請先選擇職業並出發，再授權 Dev 控制面板');
    return null;
  }

  owns(socket, room) {
    return !this.denial(socket, room);
  }

  authorized(socket, room) {
    return this.owns(socket, room) && this.grants.get(socket) === room;
  }

  revoke(socket) { clearRoleRandom(this.grants.get(socket)); this.grants.delete(socket); }

  authorize(socket, room, token) {
    const denied = this.denial(socket, room, { started: true });
    if (denied) return denied;
    const now = Date.now();
    const attempt = this.attempts.get(socket) || { start: now, count: 0 };
    if (now - attempt.start >= 60000) { attempt.start = now; attempt.count = 0; }
    this.attempts.set(socket, attempt);
    if (++attempt.count > 5) return { success: false, code: 'RATE_LIMIT', message: '嘗試過多，請稍後重試' };
    if (typeof token !== 'string' || token.length > 1024 || !timingSafeEqual(this.hash(token), this.digest)) {
      return { success: false, code: 'INVALID_TOKEN', message: 'Dev 通行碼不正確' };
    }
    this.grants.set(socket, room);
    return { success: true };
  }
}
