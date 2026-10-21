import { createHash, timingSafeEqual } from 'node:crypto';

// Grants are private server state, bound to the socket object and exact Room instance.
export class DevAccess {
  constructor(env = process.env) {
    this.enabled = env.DEV_TOOLS_ENABLED === 'true' && typeof env.DEV_ACCESS_TOKEN === 'string' && env.DEV_ACCESS_TOKEN.length >= 16;
    this.digest = this.enabled ? this.hash(env.DEV_ACCESS_TOKEN) : null;
    this.grants = new WeakMap();
    this.attempts = new WeakMap();
  }

  hash(value) { return createHash('sha256').update(value).digest(); }

  owns(socket, room) {
    return Boolean(this.enabled && room?.isDev === true && room.leaderId === socket.id &&
      room.memberIds.length === 1 && room.players[socket.id]?.connected);
  }

  authorized(socket, room) {
    return this.owns(socket, room) && this.grants.get(socket) === room;
  }

  revoke(socket) { this.grants.delete(socket); }

  authorize(socket, room, token) {
    if (!this.owns(socket, room) || room.state === 'LOBBY') return { success: false, message: 'Dev 授權僅限已出發的單人 Dev 房間' };
    const now = Date.now();
    const attempt = this.attempts.get(socket) || { start: now, count: 0 };
    if (now - attempt.start >= 60000) { attempt.start = now; attempt.count = 0; }
    this.attempts.set(socket, attempt);
    if (++attempt.count > 5) return { success: false, message: '嘗試過多，請稍後重試' };
    if (typeof token !== 'string' || token.length > 1024 || !timingSafeEqual(this.hash(token), this.digest)) {
      return { success: false, message: 'Dev 授權失敗' };
    }
    this.grants.set(socket, room);
    return { success: true };
  }
}
