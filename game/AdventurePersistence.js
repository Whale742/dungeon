import { randomUUID } from 'node:crypto';
import { createRoomSnapshot, restoreRoomSnapshot } from './RoomSnapshot.js';
import { metrics } from './performance.js';

const terminalStatus = room => room.state === 'VICTORY' ? 'completed' : room.gameOverReason === 'abandon' ? 'abandoned' : 'failed';
const runtime = new WeakMap();

export class AdventurePersistence {
  constructor(store, { now = Date.now } = {}) {
    this.store = store; this.now = now;
    this.active = new Map(); this.restoring = new Map(); this.terminal = new Set();
    this.heartbeat = setInterval(() => { void this.renewAll(); }, 15000);
    this.heartbeat.unref();
  }
  close() { clearInterval(this.heartbeat); }
  resetEndedRoom(room) {
    const c = runtime.get(room);
    if (!c?.ended || room.checkpoint?.status !== 'ended') throw new Error('冒險尚未正式結束');
    this.active.delete(room.adventureId);
    runtime.delete(room);
  }
  attach(room, metadata = null) {
    room.persistence = this;
    room.adventureId = metadata?.id || randomUUID();
    room.checkpoint = { status: metadata ? 'saved' : 'none', saveVersion: metadata?.save_version || 0,
      floor: metadata?.checkpoint_floor || null, savedAt: metadata?.saved_at || null, durable: this.store.durable };
    const control = { owner: metadata?.lease_owner || randomUUID(), generation: metadata?.lease_generation || 1,
      leaseUntil: metadata?.lease_until ? (typeof metadata.lease_until === 'number' ? metadata.lease_until : new Date(metadata.lease_until).getTime()) : null,
      version: metadata?.save_version || 0, chain: Promise.resolve(), job: null, ended: false, lost: false,
      operation: null, history: [], firstFailure: null };
    const previous = this.active.get(room.adventureId);
    if (previous && previous !== room && !runtime.get(previous)?.lost && !runtime.get(previous)?.ended) throw Object.assign(new Error('冒險已有執行中的房間'), { code: 'BUSY' });
    runtime.set(room, control); this.active.set(room.adventureId, room);
    this.trace(room, 'attach');
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
    if (c.leaseUntil && c.leaseUntil <= this.now() + 2000) this.loseAuthority(room, { code: 'LEASE_EXPIRED' });
    return c.lost || c.retiring || c.termination || c.ending || c.membershipPending || room.stageRosterPending || room.spectators?.waiting || ['saving', 'failed', 'ending', 'waiting_players'].includes(room.checkpoint?.status);
  }
  enqueue(room, task) {
    const c = runtime.get(room);
    const promise = c.chain.catch(() => {}).then(task);
    c.chain = promise;
    return promise;
  }
  // Server-only, bounded and closed-schema diagnostics. Never include socket,
  // identity, snapshot, arbitrary exception text or cloud response bodies.
  trace(room, event, error = null) {
    const c = runtime.get(room); if (!c) return;
    const codes = ['CONFLICT', 'BUSY', 'ENDED', 'NOT_FOUND', 'UNAVAILABLE', 'LEASE_EXPIRED'];
    const entry = { at: this.now(), event, adventureId: room.adventureId, roomCode: room.code,
      leaseOwner: c.owner, leaseGeneration: c.generation, saveVersion: c.version,
      checkpointStatus: room.checkpoint?.status, leaseUntil: c.leaseUntil,
      formalOnline: room.memberIds.filter(id => room.players[id]?.connected).length,
      spectators: room.spectators?.members.size || 0, operation: c.operation,
      blockedReason: this.blockedReason(room),
      errorCode: error ? (codes.includes(error.code) ? error.code : 'UNAVAILABLE') : null,
      lifecycle: { state: room.state, retiring: !!c.retiring, lost: c.lost, ended: c.ended,
        membershipPending: !!c.membershipPending, admissionWaiting: !!room.spectators?.waiting,
        admissionCommitting: !!room.spectators?.committing } };
    if (error && !c.firstFailure) c.firstFailure = entry;
    c.history.push(entry); if (c.history.length > 64) c.history.shift();
    if (metrics.enabled && process.env.GAME_PERF_LOG === '1') console.info('[adventure-persistence]', JSON.stringify(entry));
  }
  diagnostics(room) {
    const c = runtime.get(room);
    return c ? structuredClone({ firstFailure: c.firstFailure, history: c.history }) : null;
  }
  isEnding(room) { const c = runtime.get(room); return !!(c?.termination || c?.ending); }
  executionStopped(room) {
    const c = runtime.get(room);
    return !!(c && (c.ended || c.lost || c.retiring || c.termination || c.ending));
  }
  blockedReason(room) {
    const c = runtime.get(room); if (!c) return null;
    return c.lost ? 'AUTHORITY_LOST' : c.retiring ? 'SUSPENDING' : c.ending || c.termination ? 'TERMINATION_PENDING' :
      c.membershipPending ? 'MEMBERSHIP_PENDING' : room.spectators?.waiting ? 'ADMISSION_PENDING' :
      room.stageRosterPending ? 'ROSTER_PENDING' : ['saving', 'failed', 'ending', 'waiting_players'].includes(room.checkpoint?.status)
        ? 'CHECKPOINT_' + room.checkpoint.status.toUpperCase() : null;
  }
  async call(room, operation, payload = this.payload(room)) {
    const c = runtime.get(room); c.operation = operation;
    this.trace(room, 'operation:start');
    try { const row = await this.store.call(operation, payload); this.trace(room, 'operation:success'); return row; }
    catch (error) { this.trace(room, 'operation:failure', error); throw error; }
    finally { c.operation = null; }
  }
  spectatorAccess(room) {
    const c = runtime.get(room);
    if (!c) return null; // Lobby and explicitly non-persistent test rooms.
    if (c.retiring || c.lost || c.ended || c.termination || c.ending || this.active.get(room.adventureId) !== room ||
        !room.memberIds.some(id => room.players[id]?.connected)) return 'ROOM_INACTIVE';
    if (c.leaseUntil && c.leaseUntil <= this.now() + 2000) return 'LEASE_EXPIRED';
    return null;
  }
  hasLostAuthority(room) { this.blocked(room); const c = runtime.get(room); return !!(c?.lost || c?.retiring); }
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
      if (this.terminal.has(item.id)) return false;
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
        this.accept(room, await this.call(room, 'transfer', { ...this.payload(room), playerId, targetId }));
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
    this.trace(room, 'metadata:accepted');
  }
  saveBoundary(room) {
    const c = runtime.get(room);
    if (!c || c.ended || c.lost || c.retiring || c.termination || c.ending || room.stageRosterPending || (room.spectators?.waiting && !room.spectators.committing)) return Promise.resolve(false);
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
    const c = runtime.get(room);
    room.checkpoint.status = 'saving'; room.checkpoint.message = '正在保存路線檢查點，完成後即可投票。';
    job.promise = this.enqueue(room, async () => {
      try {
        if (c.lost || c.ended) return false;
        if (room.career) await room.career.flush(room);
        const start = performance.now();
        const row = await this.call(room, 'save', { ...this.payload(room), members: [...job.snapshot.data.memberIds],
          leaderId: job.snapshot.data.leaderId, key: job.key, snapshot: job.snapshot });
        metrics.record('checkpoint.write.ms', performance.now() - start);
        this.accept(room, row);
        job.confirmed = true;
        if (['GAME_OVER', 'VICTORY'].includes(room.state)) return true;
        if (c.lost) return false;
        if (c.ending) { room.spectators?.checkpointSaved(); return true; }
        room.checkpoint.status = 'saved'; room.checkpoint.message = null;
        room.spectators?.checkpointSaved();
        room.restoredFromCheckpoint = false;
        room.finishRoutePresentationIfReady(); room.broadcastState();
        return true;
      } catch (error) { this.fail(room, error); return false; }
    });
    return job.promise;
  }
  fail(room, error) {
    const c = runtime.get(room);
    this.trace(room, 'checkpoint:failure', error);
    room.spectators?.checkpointFailed();
    if (['CONFLICT', 'BUSY', 'ENDED'].includes(error.code)) this.loseAuthority(room, error);
    room.checkpoint.status = 'failed';
    room.checkpoint.message = c.lost ? '執行權限已失效，請重新連線以恢復最後成功的檢查點。' : '雲端保存未完成，進度已暫停。請重試；尚未顯示存檔成功。';
    room.broadcastState();
  }
  retry(room, playerId) {
    if (!room.players[playerId]?.connected) return Promise.resolve({ success: false, message: '玩家不存在或已斷線' });
    const c = runtime.get(room);
    if (c?.lost) return Promise.resolve({ success: false, message: '請重新連線後恢復冒險' });
    if (room.checkpoint?.status !== 'failed') return Promise.resolve({ success: false, message: '目前沒有待重試的存檔' });
    if (c?.termination || ['GAME_OVER', 'VICTORY'].includes(room.state)) return this.finish(room).then(ok => this.endResult(room, ok));
    if (!c?.job?.snapshot) return Promise.resolve({ success: false, message: '存檔格式無法保存，請保留房間並回報問題' });
    return this.runSave(room, c.job).then(ok => ({ success: ok }));
  }
  finish(room) {
    const c = runtime.get(room);
    if (!c || c.ended) return Promise.resolve(true);
    if (c.ending) return c.ending;
    if (this.hasLostAuthority(room)) return Promise.resolve(false);
    room.clearTimer(); room.pendingPresentationAcks?.clear(); room.pendingSelectionAcks?.clear();
    room.checkpoint.status = 'ending'; room.checkpoint.message = '正在保存冒險結束狀態。';
    c.ending = this.enqueue(room, async () => {
      try {
        if (this.hasLostAuthority(room)) return false;
        if (room.career) await room.career.flush(room);
        if (!c.finishPayload) {
          // A save may have committed despite losing its response. Read the
          // authoritative version before constructing a terminal CAS.
          let current;
          try { current = await this.call(room, 'load', { id: room.adventureId,
            playerId: c.termination?.requesterId || room.leaderId }); }
          catch (error) { if (error.code !== 'NOT_FOUND' || c.version !== 0) throw error; }
          if (current) {
            const until = typeof current.lease_until === 'number' ? current.lease_until : new Date(current.lease_until).getTime();
            if (current.lease_owner !== c.owner || current.lease_generation !== c.generation || until <= this.now() + 2000 ||
                (c.termination && current.leader_id !== c.termination.requesterId)) {
              throw Object.assign(new Error('需要恢復權威狀態'), { code: 'CONFLICT' });
            }
            this.accept(room, current);
            if (room.spectators?.committing && c.job?.key === current.checkpoint_key) {
              room.spectators.checkpointSaved();
              if (room.career) await room.career.flush(room);
            }
          }
          c.finishPayload = { ...this.payload(room), status: c.termination?.status || terminalStatus(room),
            ...(c.termination ? { requesterId: c.termination.requesterId } : {}) };
        }
        if (this.hasLostAuthority(room)) return false;
        const row = await this.call(room, 'finish', c.finishPayload);
        this.accept(room, row); c.ended = true;
        this.terminal.add(room.adventureId);
        if (c.termination) { room.state = 'GAME_OVER'; room.gameOverReason = 'abandon'; room.isPaused = false; }
        room.checkpoint.status = 'ended'; room.checkpoint.message = null;
        room.spectators?.close();
        this.active.delete(room.adventureId); room.onAdventureEnded?.(); room.broadcastState();
        return true;
      } catch (error) { this.fail(room, error); return false; }
      finally { c.ending = null; }
    });
    return c.ending;
  }
  endResult(room, success) {
    const c = runtime.get(room);
    return success ? { success: true } : { success: false, code: c?.lost || c?.retiring ? 'RESTORE_REQUIRED' : 'TERMINATION_PENDING',
      adventureId: room.adventureId, message: c?.lost || c?.retiring
        ? '執行權限已失效，請先恢復雲端冒險，確認目前隊長後再結束；其他實例執行中時請稍後重試。'
        : '雲端尚未確認冒險結束，隊伍已暫停。請重試結束或重試保存。' };
  }
  async end(room, requesterId) {
    const c = runtime.get(room);
    if (!room.players[requesterId]?.connected || room.leaderId !== requesterId) return { success: false, message: '只有在線隊長能中止挑戰！' };
    if (c?.ended) return { success: true };
    if (!c || this.hasLostAuthority(room)) return this.endResult(room, false);
    if (!c.termination) {
      c.termination = { requesterId, status: 'abandoned' };
      room.isPaused = true; room.clearTimer();
      room.career?.finish(room, false);
      this.trace(room, 'termination:requested');
    }
    const ending = this.finish(room);
    room.broadcastState();
    return this.endResult(room, await ending);
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
      if (successor) this.accept(room, await this.call(room, 'transfer', { ...this.payload(room), playerId, targetId: successor }));
      const row = await this.call(room, 'leave', { ...this.payload(room), playerId });
      this.accept(room, row);
      if (row.status === 'abandoned') { c.ended = true; room.checkpoint.status = 'ended'; this.active.delete(room.adventureId); }
    }); } catch (error) {
      // A response loss may hide a committed withdrawal. Fence this copy rather
      // than continue with a member the database may already have removed.
      this.loseAuthority(room);
      throw new Error('離隊確認中斷，冒險已安全暫停。請重新連線確認成員狀態。', { cause: error });
    } finally { c.membershipPending = false; }
  }
  loseAuthority(room, error = { code: 'UNAVAILABLE' }) {
    const c = runtime.get(room);
    if (c.lost || c.ended) return;
    this.trace(room, 'authority:lost', error);
    c.lost = true;
    room.spectators?.checkpointFailed();
    if (!room.isPaused && !['LOBBY', 'GAME_OVER', 'VICTORY'].includes(room.state)) room.togglePause(room.leaderId);
    room.checkpoint.status = 'failed'; room.checkpoint.message = '雲端執行權限已失效，請重新連線恢復冒險。';
    room.broadcastState();
  }
  async renewAll() {
    await Promise.all([...this.active.values()].map(async room => {
      const c = runtime.get(room);
      if (['GAME_OVER', 'VICTORY'].includes(room.state) && !c.ended) { await this.finish(room); return; }
      if (!c.leaseUntil || c.ended || c.lost || c.retiring || c.renewing) return;
      c.renewing = true;
      try { await this.enqueue(room, async () => {
        if (c.retiring || c.lost || c.ended) return;
        this.accept(room, await this.call(room, 'renew'));
      }); }
      catch (error) { this.loseAuthority(room, error); }
      finally { c.renewing = false; }
    }));
  }
  async suspend(room) {
    const c = runtime.get(room);
    if (c?.suspending) return c.suspending;
    if (!c || c.ended || c.ending || c.termination || ['GAME_OVER', 'VICTORY'].includes(room.state)) return false;
    if (room.memberIds.some(id => room.players[id]?.connected)) return false;
    c.retiring = true;
    this.trace(room, 'suspend:start');
    c.suspending = this.enqueue(room, async () => {
      // A pending admission can become a connected formal player while its
      // checkpoint finishes. Keep that authoritative instance alive.
      if (Object.values(room.players).some(p => p.connected)) {
        c.retiring = false;
        if (room.identityOfflinePause) {
          room.identityOfflinePause = false;
          if (room.isPaused) room.togglePause(room.memberIds.find(id => room.players[id]?.connected));
        }
        room.finishRoutePresentationIfReady(); room.broadcastState(); return false;
      }
      if (c.leaseUntil && !c.lost) await this.call(room, 'release').catch(() => {});
      c.lost = true; this.active.delete(room.adventureId); room.clearTimer(); room.spectators?.close();
      this.trace(room, 'suspend:complete');
      return true;
    });
    c.suspending.finally(() => { c.suspending = null; }).catch(() => {});
    return c.suspending;
  }
  async restore(id, playerId, { Room, code, io }) {
    if (this.terminal.has(id)) throw Object.assign(new Error('冒險已結束，無法恢復'), { code: 'ENDED' });
    let room = this.active.get(id);
    if (room) this.trace(room, 'restore:requested');
    if (runtime.get(room)?.suspending) { await runtime.get(room).suspending; room = this.active.get(id); }
    if (room && !runtime.get(room).lost) {
      if (!room.players[playerId] || ['GAME_OVER', 'VICTORY'].includes(room.state)) throw new Error('無權加入此冒險，或冒險已結束');
      this.trace(room, 'restore:reuse');
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
          this.trace(room, 'restore:claimed');
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
