import { SupabaseRest } from '../studio/supabase.js';

export const emptyCareer = () => ({ adventures: 0, battles: 0, wins: 0, bosses: 0, highestFloor: 0,
  damage: 0, healing: 0, classes: {}, mostPlayedRole: null });
export class CareerStore {
  constructor(cloud = new SupabaseRest()) { this.cloud = cloud; this.durable = true; }
  commit(events) { return this.cloud.request('/rest/v1/rpc/game_career_commit', { method: 'POST', body: { events } }); }
  read(playerId) { return this.cloud.request('/rest/v1/rpc/game_career_read', { method: 'POST', body: { player_id: playerId } }); }
}

// Explicit local/test adapter only; cloud failures never fall back to memory.
export class MemoryCareerStore {
  constructor() { this.events = new Map(); this.stats = new Map(); this.durable = false; }
  async commit(events) {
    // Validate the whole batch before mutation, matching the DB transaction.
    for (const event of events) {
      const old = this.events.get(event.playerId + ':' + event.key);
      if (old && JSON.stringify(old) !== JSON.stringify(event)) throw new Error('Career event conflict');
    }
    let accepted = 0;
    for (const event of events) {
      const key = event.playerId + ':' + event.key;
      if (this.events.has(key)) continue;
      this.events.set(key, structuredClone(event)); accepted++;
      const s = this.stats.get(event.playerId) || emptyCareer();
      if (event.kind === 'adventure') s.adventures++;
      if (event.kind === 'encounter') { s.battles++; s.classes[event.role] = (s.classes[event.role] || 0) + 1; }
      if (event.kind === 'victory') { s.wins++; s.bosses += event.bosses; }
      s.damage += event.damage || 0; s.healing += event.healing || 0;
      s.highestFloor = Math.max(s.highestFloor, event.floor || 0);
      this.stats.set(event.playerId, s);
    }
    return { accepted };
  }
  async read(playerId) {
    const s = structuredClone(this.stats.get(playerId) || emptyCareer());
    s.mostPlayedRole = Object.keys(s.classes).sort((a, b) => s.classes[b] - s.classes[a] || a.localeCompare(b))[0] || null;
    return s;
  }
}
