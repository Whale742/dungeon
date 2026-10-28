import { randomUUID } from 'node:crypto';
import { CLASSES } from './constants.js';
import { metrics } from './performance.js';

const contexts = new WeakMap();
const amount = n => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
const boundary = room => JSON.stringify([room.adventureId, room.state, room.battleRound, room.battlePresentationId]);
export class CareerStats {
  constructor(store) {
    this.store = store; this.rooms = new Set();
    this.retryTimer = setInterval(() => {
      for (const room of this.rooms) if (contexts.get(room)?.pending.size) void this.flush(room).catch(() => {});
    }, 5000); this.retryTimer.unref();
  }
  close() { clearInterval(this.retryTimer); }
  release(room) { if (!this.status(room).pending) this.rooms.delete(room); }
  attach(room) {
    if (room.isDev || !room.adventureId) return;
    room.career = this;
    if (contexts.get(room)?.adventureId === room.adventureId) return;
    contexts.set(room, { adventureId: room.adventureId, runId: randomUUID(), pending: new Map(),
      encounter: null, flight: null, failed: false, deferred: null, scheduled: false, healSerial: 0, members: new Set(room.memberIds) });
    this.rooms.add(room);
    for (const id of room.memberIds) if (CLASSES[room.players[id]?.role]) this.put(room, {
      playerId: id, adventureId: room.adventureId, kind: 'adventure', key: 'adventure:' + room.adventureId
    });
    this.floor(room);
  }
  put(room, event) {
    const c = contexts.get(room); if (!c || room.isDev) return;
    const key = event.playerId + ':' + event.key;
    const old = c.pending.get(key);
    if (old && JSON.stringify(old) !== JSON.stringify(event)) throw new Error('Conflicting authoritative career event');
    c.pending.set(key, event);
    if (!c.scheduled) { c.scheduled = true; queueMicrotask(() => { c.scheduled = false; void this.flush(room).catch(() => {}); }); }
  }
  floor(room) {
    if (!contexts.has(room)) return;
    for (const id of room.memberIds) if (CLASSES[room.players[id]?.role]) this.put(room, { playerId: id,
      adventureId: room.adventureId, kind: 'floor', floor: room.floor, key: `floor:${room.adventureId}:${room.floor}` });
  }
  encounter(room) {
    const c = contexts.get(room); if (!c || room.isDev) return;
    c.encounter = { id: randomUUID(), participants: new Map(), ended: false, seenQueues: new WeakSet(),
      dots: new WeakMap(), healing: new Map(), context: { adventureId: room.adventureId, runId: c.runId,
        checkpointVersion: room.checkpoint?.saveVersion || 0, ordinal: room.battleCount,
        nodeKey: room.currentHex?.id || `${room.currentHex?.col}:${room.currentHex?.row}`, floor: room.floor } };
    for (const p of Object.values(room.players)) if (p.connected && p.hp > 0) this.participate(room, p.id);
  }
  participate(room, playerId, actualEffect = false) {
    const e = contexts.get(room)?.encounter, p = room.players[playerId];
    if (!e || e.ended || room.state !== 'IN_BATTLE' || !room.memberIds.includes(playerId) || !CLASSES[p?.role] ||
        (!actualEffect && (!p.connected || p.hp <= 0)) || e.participants.has(playerId)) return;
    e.participants.set(playerId, p.role);
    this.put(room, { ...e.context, encounterId: e.id, kind: 'encounter', playerId, role: p.role, key: 'encounter:' + e.id });
  }
  owner(room, id) {
    if (room.memberIds.includes(id) && CLASSES[room.players[id]?.role]) return id;
    // Legacy talisman events use a role alias. Roles are unique in formal rooms.
    const players = Object.values(room.players).filter(p => p.role === id && room.memberIds.includes(p.id));
    return players.length === 1 ? players[0].id : null;
  }
  heal(room, targetId, value, sourceId = null) {
    const e = contexts.get(room)?.encounter;
    if (!e || e.ended || room.state !== 'IN_BATTLE' || !room.players[targetId]) return;
    const owner = this.owner(room, sourceId || room.healingSourceId || targetId), n = amount(value);
    if (!owner || !n) return;
    this.participate(room, owner, true);
    this.participate(room, targetId, true);
    e.healing.set(owner, (e.healing.get(owner) || 0) + n);
  }
  drainHealing(room) {
    const c = contexts.get(room), e = c?.encounter; if (!e?.healing.size) return;
    const serial = ++c.healSerial;
    for (const [playerId, healing] of e.healing) this.put(room, { ...e.context, encounterId: e.id,
      playerId, kind: 'combat', healing, damage: 0, key: `healing:${e.id}:${serial}` });
    e.healing.clear();
  }
  dotApplied(room, enemy, type, value, sourceId) {
    const e = contexts.get(room)?.encounter, owner = this.owner(room, sourceId);
    if (!e || e.ended || !owner) return;
    let effects = e.dots.get(enemy); if (!effects) e.dots.set(enemy, effects = {});
    if (!enemy[type + 'Turns'] || !effects[type]) effects[type] = new Map();
    effects[type].set(owner, (effects[type].get(owner) || 0) + amount(value));
  }
  dotDamage(room, enemy, type, value) {
    const e = contexts.get(room)?.encounter, owners = e?.dots.get(enemy)?.[type], total = amount(value);
    if (!owners?.size || !total) return;
    const weights = [...owners].filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b));
    const sum = weights.reduce((n, [, v]) => n + v, 0); if (!sum) return;
    let remainder = total;
    const shares = weights.map(([id, weight]) => { const share = Math.floor(total * weight / sum); remainder -= share; return [id, share]; });
    for (let i = 0; i < remainder; i++) shares[i % shares.length][1]++;
    for (const [playerId, damage] of shares) if (damage) {
      this.participate(room, playerId, true);
      this.put(room, { ...e.context, encounterId: e.id, playerId, kind: 'combat', damage, healing: 0,
        key: `dot:${e.id}:${room.battleRound}:${enemy.instanceId}:${type}` });
    }
  }
  capture(room, queue) {
    const e = contexts.get(room)?.encounter; if (!e || e.ended || e.seenQueues.has(queue)) return;
    e.seenQueues.add(queue);
    const totals = new Map();
    for (const step of queue) for (const result of step.results || []) {
      const targetIsPlayer = room.memberIds.includes(result.targetId);
      const owner = this.owner(room, result.ownerId || result.sourceId || step.sourceId);
      if (targetIsPlayer && result.kind === 'damage' && amount(result.actualDamage)) this.participate(room, result.targetId, true);
      if (targetIsPlayer && result.kind === 'revive' && result.targetAfter?.hp > 0) this.participate(room, result.targetId, true);
      if (!owner) continue;
      let damage = 0, healing = 0;
      if (result.kind === 'damage' && !targetIsPlayer && (room.enemies || []).some(enemy => enemy.instanceId === result.targetEnemyId)) {
        damage = amount(result.actualHpDamage) + amount(result.actualAbsorbed);
      }
      // Ordinary heals are measured exactly at the authoritative HP mutation.
      // Revival bypasses those helpers, so consume its server result here.
      if (result.kind === 'revive' && targetIsPlayer) healing = amount((result.targetAfter?.hp || 0) - (result.targetBefore?.hp || 0));
      if (!damage && !healing) continue;
      this.participate(room, owner, true);
      const t = totals.get(owner) || { damage: 0, healing: 0 }; t.damage += damage; t.healing += healing; totals.set(owner, t);
    }
    for (const [playerId, totalsForPlayer] of totals) this.put(room, { ...e.context, ...totalsForPlayer,
      encounterId: e.id, playerId, kind: 'combat', key: `combat:${e.id}:${room.battlePresentationId}` });
    this.drainHealing(room);
  }
  finish(room, won) {
    const c = contexts.get(room), e = c?.encounter; if (!e || e.ended) return;
    c.deferred = null;
    this.drainHealing(room); e.ended = true;
    if (won) {
      const bosses = (room.enemies || []).filter(enemy => !enemy.isMimic && !enemy.isShadyMerchant &&
        (enemy.isElite || enemy.isAbyssBoss || enemy.isEndElite || ['ELITE', 'ABYSS'].includes(enemy.tier))).length;
      for (const [playerId, role] of e.participants) this.put(room, { ...e.context, encounterId: e.id,
        playerId, role, kind: 'victory', bosses, key: 'victory:' + e.id });
    }
  }
  status(room) { const c = contexts.get(room); return { pending: !!(c?.pending.size || c?.flight), failed: !!c?.failed }; }
  async flush(room) {
    const c = contexts.get(room); if (!c) return;
    if (c.flight) return c.flight;
    this.drainHealing(room);
    c.flight = (async () => {
      while (c.pending.size) {
        const events = [...c.pending.values()].slice(0, 100);
        const start = performance.now(); await this.store.commit(events);
        metrics.record('career.write.ms', performance.now() - start);
        metrics.record('career.events', events.length);
        for (const event of events) c.pending.delete(event.playerId + ':' + event.key);
      }
      const failed = c.failed; c.failed = false; if (failed) room.broadcastState();
    })().catch(error => {
      if (!c.failed) { c.failed = true; room.broadcastState(); }
      throw error;
    }).finally(() => {
      c.flight = null; this.resume(room);
      if (!c.pending.size && (!room.memberIds.length || ['GAME_OVER', 'VICTORY'].includes(room.state))) this.rooms.delete(room);
    });
    return c.flight;
  }
  deferUntilPersisted(room, callback) {
    const c = contexts.get(room); if (!c || (!c.pending.size && !c.flight)) return false;
    c.deferred = { key: boundary(room), callback }; void this.flush(room).catch(() => {}); return true;
  }
  resume(room) {
    const c = contexts.get(room); if (!c?.deferred) return;
    if (c.deferred.key !== boundary(room)) { c.deferred = null; return; }
    if (c.failed || c.flight || c.pending.size || room.isPaused || room.persistence?.hasLostAuthority(room) || !Object.values(room.players).some(p => p.connected)) return;
    const { callback, key } = c.deferred; c.deferred = null;
    queueMicrotask(() => {
      if (key === boundary(room) && !room.isPaused && !room.persistence?.hasLostAuthority(room) && Object.values(room.players).some(p => p.connected)) callback();
    });
  }
  async read(playerId) {
    const rooms = [...this.rooms].filter(room => contexts.get(room)?.members.has(playerId));
    await Promise.allSettled(rooms.map(room => this.flush(room)));
    return { stats: await this.store.read(playerId), durable: this.store.durable,
      pending: rooms.some(room => this.status(room).pending || this.status(room).failed) };
  }
}
