export class CloudError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
export class SupabaseRest {
  constructor(env = process.env, fetcher = fetch) { this.env = env; this.fetcher = fetcher; }
  get configured() { return !!(this.env.SUPABASE_URL && this.env.SUPABASE_SECRET_KEY); }
  async request(route, { method = 'GET', body, headers = {}, publicRead = false } = {}) {
    const key = this.env[publicRead ? 'SUPABASE_PUBLISHABLE_KEY' : 'SUPABASE_SECRET_KEY'];
    if (!this.env.SUPABASE_URL || !key) throw new CloudError('Supabase 尚未設定；本地預設仍可讀取');
    const response = await this.fetcher(this.env.SUPABASE_URL.replace(/\/$/, '') + route, {
      method, headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}), 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new CloudError(result?.message || result?.error || 'Supabase 操作失敗', response.status >= 500 ? 503 : 400);
    return result;
  }
  async rows(table, query = '', publicRead = false) {
    const result = [];
    for (let offset = 0; ; offset += 1000) {
      const order=query.includes('order=')?'':`&order=${({role_profiles:'role_id.asc,status.asc',skill_copies:'role_id.asc,skill_id.asc,status.asc',story_copies:'story_key.asc,status.asc',game_assets:'asset_key.asc',asset_bindings:'binding_key.asc,status.asc',content_revisions:'id.asc'})[table]||'id.asc'}`;
      const page = await this.request(`/rest/v1/${table}?${query}${query ? '&' : ''}limit=1000&offset=${offset}${order}`, { publicRead });
      result.push(...page); if (page.length < 1000) return result;
    }
  }
  upsert(table, rows, conflict, ignore = false) {
    return this.request(`/rest/v1/${table}?on_conflict=${conflict}`, { method: 'POST', body: rows,
      headers: { Prefer: `resolution=${ignore ? 'ignore' : 'merge'}-duplicates,return=representation` } });
  }
}
