import { SupabaseRest } from '../studio/supabase.js';

export const LEASE_MS = 60000;
export class AdventureStore {
  constructor(cloud = new SupabaseRest()) { this.cloud = cloud; this.durable = true; }
  async call(action, payload) {
    const result = await this.cloud.request('/rest/v1/rpc/' + (action === 'transfer' ? 'game_adventure_transfer' : 'game_adventure'),
      { method: 'POST', body: action === 'transfer' ? { payload } : { action, payload } });
    return checked(result);
  }
  async list(playerId, offset = 0) {
    return checked(await this.cloud.request('/rest/v1/rpc/game_adventure_directory', {
      method: 'POST', body: { player_id: playerId, page_offset: offset }
    }));
  }
}
function checked(result) {
  if (!result || result.error) throw Object.assign(new Error(({ NOT_FOUND: '無權存取此冒險，或尚無檢查點',
    ENDED: '冒險已結束，無法恢復', BUSY: '冒險仍由另一個伺服器執行，請稍後重試',
    CONFLICT: '存檔版本或執行權限已變更，請重新連線' })[result?.error] || '冒險存檔服務暫時無法使用'), { code: result?.error || 'UNAVAILABLE' });
  return result;
}

// Explicit tests/local development adapter. Never a fallback for cloud failures.
export class MemoryAdventureStore {
  constructor({ now = Date.now, nameOf = () => null } = {}) { this.rows = new Map(); this.durable = false; this.now = now; this.nameOf = nameOf; }
  async list(playerId, offset = 0) {
    const rows = [...this.rows.values()].filter(r => r.status === 'active' && r.checkpoint && r.members.includes(playerId))
      .sort((a, b) => b.saved_at.localeCompare(a.saved_at) || a.id.localeCompare(b.id));
    return { adventures: rows.slice(offset, offset + 25).map(r => ({ id: r.id, leaderId: r.leader_id,
      leaderName: this.nameOf(r.leader_id) || r.checkpoint.data.players[r.leader_id]?.name || '冒險者',
      memberCount: r.members.length, checkpointFloor: r.checkpoint_floor, checkpointState: r.checkpoint_state,
      savedAt: r.saved_at, saveVersion: r.save_version, status: r.status })), hasMore: rows.length > offset + 25 };
  }
  async call(action, x) {
    let row = this.rows.get(x.id);
    const now = this.now();
    if (!row && ['save', 'finish', 'leave', 'transfer'].includes(action) && x.version === 0) {
      row = { id: x.id, leader_id: x.leaderId, status: 'active', save_version: 0, checkpoint: null,
        checkpoint_key: null, lease_owner: x.owner, lease_generation: 1, lease_until: now + LEASE_MS,
        members: [...x.members], saved_at: null };
      this.rows.set(x.id, row);
    }
    if (!row) return checked({ error: 'NOT_FOUND' });
    if (['load', 'claim'].includes(action)) {
      if (row.status !== 'active') return checked({ error: 'ENDED' });
      if (!row.members.includes(x.playerId)) return checked({ error: 'NOT_FOUND' });
      if (!row.checkpoint) return checked({ error: 'NOT_FOUND' });
      if (action === 'claim') {
        if (row.lease_until > now && row.lease_owner !== x.owner) return checked({ error: 'BUSY' });
        if (row.lease_owner !== x.owner) row.lease_generation++;
        row.lease_owner = x.owner; row.lease_until = now + LEASE_MS;
      }
      return structuredClone(row);
    }
    if (row.status !== 'active') {
      if (action === 'finish' && row.status === x.status && row.lease_owner === x.owner && row.lease_generation === x.generation) return structuredClone(row);
      return checked({ error: 'ENDED' });
    }
    if (row.lease_owner !== x.owner || row.lease_generation !== x.generation || row.lease_until <= now) return checked({ error: 'CONFLICT' });
    if (action === 'save') {
      if (row.checkpoint_key !== x.key) {
        if (row.save_version !== x.version) return checked({ error: 'CONFLICT' });
        Object.assign(row, { checkpoint: structuredClone(x.snapshot), checkpoint_key: x.key,
          checkpoint_floor: x.snapshot.data.floor, checkpoint_state: 'CHOOSING_ROUTE', save_version: row.save_version + 1,
          saved_at: new Date(now).toISOString(), leader_id: x.leaderId });
        row.members = [...new Set(x.snapshot.data.memberIds)];
      } else if (JSON.stringify(row.checkpoint) !== JSON.stringify(x.snapshot)) return checked({ error: 'CONFLICT' });
      row.lease_until = now + LEASE_MS;
    } else if (action === 'renew') row.lease_until = now + LEASE_MS;
    else if (action === 'transfer') {
      if (row.leader_id !== x.playerId || !row.members.includes(x.targetId)) return checked({ error: 'CONFLICT' });
      row.leader_id = x.targetId;
    }
    else if (action === 'release') row.lease_until = now;
    else if (action === 'finish') {
      if (!Number.isSafeInteger(x.version) || x.version !== row.save_version ||
          (x.requesterId && x.requesterId !== row.leader_id) || !['completed', 'failed', 'abandoned'].includes(x.status)) return checked({ error: 'CONFLICT' });
      row.status = x.status; row.checkpoint = null; row.checkpoint_key = null;
      row.checkpoint_floor = null; row.checkpoint_state = null; row.members = [];
    } else if (action === 'leave') {
      row.members = row.members.filter(id => id !== x.playerId);
      if (!row.members.length) {
        row.status = 'abandoned'; row.checkpoint = null; row.checkpoint_key = null;
        row.checkpoint_floor = null; row.checkpoint_state = null;
      }
      else if (row.leader_id === x.playerId) row.leader_id = row.members[0];
    } else return checked({ error: 'CONFLICT' });
    const { checkpoint, ...metadata } = row;
    return structuredClone(metadata);
  }
}
