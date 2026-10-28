import { randomUUID } from 'node:crypto';
import { createRoomSnapshot, restoreRoomSnapshot } from './RoomSnapshot.js';
import { metrics } from './performance.js';

const terminalStatus = room => room.state === 'VICTORY' ? 'completed' : room.gameOverReason === 'abandon' ? 'abandoned' : 'failed';
const runtime = new WeakMap();

export class AdventurePersistence {
  constructor(store, { now = Date.now } = {}) {
    this.store = store; this.now = now;
    this.active = new Map(); this.restoring = new Map();
    this.heartbeat = setInterval(() => { void this.renewAll(); }, 15000);
    this.heartbeat.unref();
  }
  close() { clearInterval(this.heartbeat); }
  attach(room, metadata = null) {
    room.persistence = this;
    room.adventureId = metadata?.id || randomUUID();
    room.checkpoint = { status: metadata ? 'saved' : 'none', saveVersion: metadata?.save_version || 0,
      floor: metadata?.checkpoint_floor || null, savedAt: metadata?.saved_at || null, durable: this.store.durable };
    const control = { owner: metadata?.lease_owner || randomUUID(), generation: metadata?.lease_generation || 1,
      leaseUntil: metadata?.lease_until ? new Date(metadata.lease_until).getTime() : null,
      version: metadata?.save_version || 0, chain: Promise.resolve(), job: null, ended: false, lost: false };
    runtime.set(room, control); this.active.set(room.adventureId, room);
    return room;
  }
  begin(room) {
    if (room.isDev) return;
    if (room.adventureId && !runtime.get(room)?.ended) throw new Error('請先正式結束目前冒險');
    this.attach(room);
  }
  blocked(room) {
    const c = runtime.get(room);
    if (!c) return false;
    if (c.leaseUntil && c.leaseUntil <= this.now() + 2000) this.loseAuthority(room);
    return c.lost || c.membershipPending || ['saving', 'failed', 'ending'].includes(room.checkpoint?.status);
  }
  enqueue(room, task) {
    const c = runtime.get(room);
    const promise = c.chain.catch(() => {}).then(task);
    c.chain = promise;
    return promise;
  }
  hasLostAuthority(room) { this.blocked(room); return !!runtime.get(room)?.lost; }
  async list(playerId, offset = 0) {
    const page = await this.store.list(playerId, offset);
    const entries = new Map(page.adventures.map(item => [item.id, item]));
    // Before the first checkpoint, only a live room can be rejoined. It must
    // never be presented as a durable checkpoint after a server restart.
    if (!offset) for (const room of this.active.values()) {
      if (room.players[playerId] && !room.checkpoint.saveVersion && !runtime.get(room).ended && !runtime.get(room).lost &&
          !['GAME_OVER', 'VICTORY'].includes(room.state)) entries.set(room.adventureId, { id: room.adventureId,
        leaderId: room.leaderId, leaderName: room.players[room.leaderId]?.name, memberCount: room.memberIds.length,
        checkpointFloor: null, savedAt: null, saveVersion: 0, status: 'active' });
    }
    const adventures = [...entries.values()].filter(item => {
      const room = this.active.get(item.id);
      return !room || (!runtime.get(room).ended && !['GAME_OVER', 'VICTORY'].includes(room.state) && !!room.players[playerId]);
    }).map(item => {
      const room = this.active.get(item.id);
      const live = room && !this.hasLostAuthority(room);
      return { ...item, name: `深淵遠征 · ${item.id.slice(0, 8).toUpperCase()}`,
        leaderId: live ? room.leaderId : item.leaderId,
        leaderName: live ? room.players[room.leaderId]?.name : item.leaderName,
        isLeader: (live ? room.leaderId : item.leaderId) === playerId,
        active: !!live, liveState: live ? room.state : null, liveFloor: live ? room.floor : null };
    });
    return { adventures, hasMore: page.hasMore, nextOffset: offset + page.adventures.length };
  }
  async transferLeader(room, playerId, targetId) {
    if (room.leaderId !== playerId || !room.players[targetId] || targetId === playerId) return { success: false, message: '只有隊長可以交接給其他正式隊員' };
    const c = runtime.get(room);
    if (!c || c.ended) return room.transferLeader(playerId, targetId);
    if (this.blocked(room)) return { success: false, message: '請等待保存完成後再交接隊長' };
    c.membershipPending = true;
    try {
      await this.enqueue(room, async () => {
        this.accept(room, await this.store.call('transfer', { ...this.payload(room), playerId, targetId }));
      });
      return room.transferLeader(playerId, targetId);
    } catch {
      this.loseAuthority(room);
      return { success: false, message: '交接確認中斷，請重新連線確認隊長身分' };
    } finally { c.membershipPending = false; }
  }
  payload(room) {
    const c = runtime.get(room);
    return { id: room.adventureId, owner: c.owner, generation: c.generation, version: c.version,
      leaderId: room.leaderId, members: [...room.memberIds] };
  }
  accept(room, row) {
    const c = runtime.get(room);
    c.version = row.save_version;
    c.leaseUntil = typeof row.lease_until === 'number' ? row.lease_until : new Date(row.lease_until).getTime();
    Object.assign(room.checkpoint, { saveVersion: row.save_version, savedAt: row.saved_at, floor: row.checkpoint_floor || null });
  }
  saveBoundary(room) {
    const c = runtime.get(room);
    if (!c || c.ended) return Promise.resolve();
    if (c.job?.presentationId === room.routePresentationId) return c.job.promise;
    const job = { key: randomUUID(), presentationId: room.routePresentationId, snapshot: null, promise: null };
    c.job = job;
    room.checkpoint.boundaryFloor = room.floor;
    room.checkpoint.presentationId = room.routePresentationId;
    room.checkpoint.status = 'saving'; room.checkpoint.message = '正在保存路線檢查點，完成後即可投票。';
    try { job.snapshot = createRoomSnapshot(room); }
    catch (error) { this.fail(room, error); return Promise.resolve(false); }
    return this.runSave(room, job);
  }
  runSave(room, job) {
    room.checkpoint.status = 'saving'; room.checkpoint.message = '正在保存路線檢查點，完成後即可投票。';
    job.promise = this.enqueue(room, async () => {
      try {
        if (room.career) await room.career.flush(room);
        const start = performance.now();
        const row = await this.store.call('save', { ...this.payload(room), key: job.key, snapshot: job.snapshot });
        metrics.record('checkpoint.write.ms', performance.now() - start);
        this.accept(room, row);
        job.confirmed = true;
        if (['GAME_OVER', 'VICTORY'].includes(room.state)) return true;
        room.checkpoint.status = 'saved'; room.checkpoint.message = null;
        room.restoredFromCheckpoint = false;
        room.finishRoutePresentationIfReady(); room.broadcastState();
        return true;
      } catch (error) { this.fail(room, error); return false; }
    });
    return job.promise;
  }
  fail(room, error) {
    const c = runtime.get(room);
    if (['CONFLICT', 'BUSY', 'ENDED'].includes(error.code)) this.loseAuthority(room);
    room.checkpoint.status = 'failed';
    room.checkpoint.message = c.lost ? '執行權限已失效，請重新連線以恢復最後成功的檢查點。' : '雲端保存未完成，進度已暫停。請重試；尚未顯示存檔成功。';
    room.broadcastState();
  }
  retry(room, playerId) {
    if (!room.players[playerId]?.connected) return Promise.resolve({ success: false, message: '玩家不存在或已斷線' });
    const c = runtime.get(room);
    if (c?.lost) return Promise.resolve({ success: false, message: '請重新連線後恢復冒險' });
    if (room.checkpoint?.status !== 'failed') return Promise.resolve({ success: false, message: '目前沒有待重試的存檔' });
    if (['GAME_OVER', 'VICTORY'].includes(room.state)) return this.finish(room).then(ok => ({ success: ok }));
    if (!c?.job?.snapshot) return Promise.resolve({ success: false, message: '存檔格式無法保存，請保留房間並回報問題' });
    return this.runSave(room, c.job).then(ok => ({ success: ok }));
  }
  finish(room) {
    const c = runtime.get(room);
    if (!c || c.ended) return Promise.resolve(true);
    if (c.ending) return c.ending;
    room.checkpoint.status = 'ending'; room.checkpoint.message = '正在保存冒險結束狀態。';
    c.ending = this.enqueue(room, async () => {
      try {
        // A lost HTTP response can mean the checkpoint committed. Resolve the
        // same idempotency key before CAS-writing the terminal metadata.
        if (room.career) await room.career.flush(room);
        if (c.job?.snapshot && !c.job.confirmed) {
          this.accept(room, await this.store.call('save', { ...this.payload(room), key: c.job.key, snapshot: c.job.snapshot }));
          c.job.confirmed = true;
        }
        const row = await this.store.call('finish', { ...this.payload(room), status: terminalStatus(room) });
        this.accept(room, row); c.ended = true;
        room.checkpoint.status = 'ended'; room.checkpoint.message = null;
        this.active.delete(room.adventureId); room.broadcastState(); return true;
      } catch (error) { this.fail(room, error); return false; }
      finally { c.ending = null; }
    });
    return c.ending;
  }
  async leave(room, playerId) {
    const c = runtime.get(room);
    if (!c || c.ended) return;
    if (this.blocked(room)) throw new Error('請先完成保存或重試後再永久離隊');
    c.membershipPending = true;
    try { await this.enqueue(room, async () => {
      if (room.memberIds.length === 1) room.career?.finish(room, false);
      if (room.career) await room.career.flush(room);
      // Preserve Room.removePlayer's formation-order succession even though DB
      // members created in one transaction share the same joined_at timestamp.
      const successor = room.leaderId === playerId ? room.memberIds.find(id => id !== playerId) : null;
      if (successor) this.accept(room, await this.store.call('transfer', { ...this.payload(room), playerId, targetId: successor }));
      const row = await this.store.call('leave', { ...this.payload(room), playerId });
      this.accept(room, row);
      if (row.status === 'abandoned') { c.ended = true; room.checkpoint.status = 'ended'; this.active.delete(room.adventureId); }
    }); } catch (error) {
      // A response loss may hide a committed withdrawal. Fence this copy rather
      // than continue with a member the database may already have removed.
      this.loseAuthority(room);
      throw new Error('離隊確認中斷，冒險已安全暫停。請重新連線確認成員狀態。', { cause: error });
    } finally { c.membershipPending = false; }
  }
  loseAuthority(room) {
    const c = runtime.get(room);
    if (c.lost || c.ended) return;
    c.lost = true;
    if (!room.isPaused && !['LOBBY', 'GAME_OVER', 'VICTORY'].includes(room.state)) room.togglePause(room.leaderId);
    room.checkpoint.status = 'failed'; room.checkpoint.message = '雲端執行權限已失效，請重新連線恢復冒險。';
    room.broadcastState();
  }
  async renewAll() {
    await Promise.all([...this.active.values()].map(async room => {
      const c = runtime.get(room);
      if (!c.leaseUntil || c.ended || c.lost || c.renewing) return;
      c.renewing = true;
      try { await this.enqueue(room, async () => this.accept(room, await this.store.call('renew', this.payload(room)))); }
      catch { this.loseAuthority(room); }
      finally { c.renewing = false; }
    }));
  }
  async restore(id, playerId, { Room, code, io }) {
    let room = this.active.get(id);
    if (room && !runtime.get(room).lost) {
      if (!room.players[playerId] || ['GAME_OVER', 'VICTORY'].includes(room.state)) throw new Error('無權加入此冒險，或冒險已結束');
      return room;
    }
    // Authorize EVERY caller, even when another member's restore is in flight.
    await this.store.call('load', { id, playerId });
    room = this.active.get(id);
    if (room && !runtime.get(room).lost) {
      if (!room.players[playerId] || ['GAME_OVER', 'VICTORY'].includes(room.state)) throw new Error('冒險已結束或成員已退出');
      return room;
    }
    if (!this.restoring.has(id)) {
      const restoring = (async () => {
        const row = await this.store.call('claim', { id, playerId, owner: randomUUID() });
        try {
          if (row.checkpoint?.adventureId !== id) throw new Error('存檔冒險身分不一致');
          room = restoreRoomSnapshot(Room, row.checkpoint, code(), io, row.members, row.leader_id);
          this.attach(room, row); room.restoredFromCheckpoint = true;
          room.checkpoint.boundaryFloor = room.floor; room.checkpoint.presentationId = room.routePresentationId;
          return room;
        } catch (error) {
          await this.store.call('release', { id, owner: row.lease_owner, generation: row.lease_generation }).catch(() => {});
          throw error;
        }
      })();
      this.restoring.set(id, restoring);
      restoring.finally(() => this.restoring.delete(id)).catch(() => {});
    }
    return this.restoring.get(id);
  }
}
