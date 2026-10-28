import { randomUUID } from 'node:crypto';
import { SupabaseRest } from '../studio/supabase.js';

export class IdentityStore {
  constructor(cloud = new SupabaseRest()) { this.cloud = cloud; this.durable = true; }
  async call(action, payload = {}) {
    try { return await this.cloud.request('/rest/v1/rpc/game_identity', { method: 'POST', body: { action, payload } }); }
    catch (error) {
      if (action === 'credentials' && /duplicate|unique/i.test(error.message)) throw Object.assign(new Error('帳號名稱已被使用'), { status: 409 });
      throw error;
    }
  }
}

// Explicit local/test adapter only. Production never falls back after a DB error.
export class MemoryIdentityStore {
  constructor() { this.players = new Map(); this.sessions = new Map(); this.durable = false; }
  async call(action, x = {}) {
    let p = this.players.get(x.id);
    if (action === 'create') {
      p = { id: randomUUID(), display_name: '冒險者', username: null, password_hash: null, recovery_hash: null, auth_version: 0 };
      this.players.set(p.id, p);
    } else if (action === 'username') p = [...this.players.values()].find(p => p.username === x.username);
    else if (action === 'session') {
      const s = this.sessions.get(x.hash); p = this.players.get(s?.id);
      if (!s || s.expires <= Date.now() || s.version !== p?.auth_version) return null;
      return { ...p, expires: s.expires };
    } else if (action === 'issue') {
      if (!p || p.auth_version !== x.version) return null;
      this.sessions.set(x.hash, { id: p.id, version: x.version, expires: x.expires });
    } else if (action === 'revoke') { this.sessions.delete(x.hash); return true; }
    else if (action === 'name') { if (p) p.display_name = x.name; }
    else if (action === 'credentials') {
      if (!p || p.auth_version !== x.version) return null;
      if ([...this.players.values()].some(q => q.id !== p.id && q.username === x.username)) throw Object.assign(new Error('帳號名稱已被使用'), { status: 409 });
      if (p.username && p.username !== x.username) return null;
      Object.assign(p, { username: x.username, password_hash: x.password, recovery_hash: x.recovery, auth_version: p.auth_version + 1 });
      for (const [key, s] of this.sessions) if (s.id === p.id) this.sessions.delete(key);
    }
    return p ? { ...p } : null;
  }
}
