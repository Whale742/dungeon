import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { IdentityStore, MemoryIdentityStore } from './IdentityStore.js';

const derive = promisify(scrypt);
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const digest = value => createHash('sha256').update(value).digest('hex');
export const publicPlayer = p => ({ playerId: p.id, displayName: p.display_name, username: p.username, bound: !!p.username });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function cookieToken(headers = {}) {
  const match = String(headers.cookie || '').match(/(?:^|;\s*)dungeon_session=([A-Za-z0-9_-]{43})(?:;|$)/);
  return match?.[1] || null;
}
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return !req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']);
  try { return origin === `${req.protocol}://${req.get('host')}`; } catch { return false; }
}
export class Identity {
  constructor(store, now = Date.now) {
    this.store = store || (process.env.IDENTITY_STORE === 'memory' && !process.env.RENDER && process.env.NODE_ENV !== 'production' ? new MemoryIdentityStore() : new IdentityStore());
    this.now = now; this.attempts = new Map(); this.busy = 0;
  }
  limit(key, max = 10) {
    const now = this.now();
    for (const [k, value] of this.attempts) if (now - value.start >= 60000) this.attempts.delete(k);
    if (!this.attempts.has(key)) {
      if (this.attempts.size >= 10000) throw fail('請稍後重試', 429);
      this.attempts.set(key, { start: now, count: 0 });
    }
    if (++this.attempts.get(key).count > max) throw fail('嘗試過多，請稍後再試', 429);
  }
  async hash(password, salt = randomBytes(16).toString('hex')) {
    if (this.busy >= 2) throw fail('登入服務忙碌，請稍後再試', 429);
    this.busy++;
    try { return `scrypt$32768$8$3$${salt}$${(await derive(password, salt, 64, parameters)).toString('hex')}`; }
    finally { this.busy--; }
  }
  async verify(password, encoded) {
    const valid = typeof encoded === 'string' && /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded);
    const candidate = await this.hash(typeof password === 'string' ? password.slice(0, 256) : '', valid ? encoded.split('$')[4] : '0'.repeat(32));
    return valid && timingSafeEqual(Buffer.from(candidate), Buffer.from(encoded));
  }
  username(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(value)) throw fail('帳號需為 3–24 字元的英文字母、數字或底線');
    return value.toLowerCase();
  }
  password(value) {
    if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw fail('密碼需為 12–128 個字元');
    return value;
  }
  name(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 24 || /[\x00-\x1f\x7f]/.test(value)) throw fail('顯示名稱需為 1–24 個字元');
    return value.trim();
  }
  async session(headers) {
    const token = cookieToken(headers);
    return token ? this.store.call('session', { hash: digest(token) }) : null;
  }
  async issue(p) {
    const token = randomBytes(32).toString('base64url');
    const expires = this.now() + 30 * 86400000;
    if (!await this.store.call('issue', { id: p.id, version: p.auth_version, hash: digest(token), expires })) throw fail('身分已變更，請重新登入', 401);
    return { token, expires };
  }
  async credentials(p, username, password) {
    const recoveryCode = randomBytes(32).toString('base64url');
    const updated = await this.store.call('credentials', { id: p.id, version: p.auth_version, username,
      password: await this.hash(this.password(password)), recovery: digest(recoveryCode) });
    if (!updated) throw fail('身分已變更，請重新登入', 401);
    return { player: updated, recoveryCode };
  }
  mount(app, { revoke = () => {}, renamed = () => {} } = {}) {
    const cookie = (res, token = '', maxAge = 30 * 86400000) => res.cookie('dungeon_session', token, { httpOnly: true, secure: !!process.env.RENDER || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge });
    app.use('/api/player', (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      if (!sameOrigin(req)) return res.status(403).json({ message: '請從遊戲頁面操作' });
      next();
    });
    // Narrow parser; unrelated Studio routes keep their own existing middleware.
    app.use('/api/player', (req, res, next) => {
      if (req.method !== 'POST' || !req.is('application/json')) return req.method === 'POST' ? res.status(415).json({message:'需要 JSON 請求'}) : next();
      next();
    });
    const route = (method, path, handler) => app[method]('/api/player/' + path, async (req, res) => {
      try { await handler(req, res); }
      catch (error) { res.status(error.status || 503).json({ message: error.status ? error.message : '身分服務暫時無法使用，請稍後再試' }); }
    });
    route('get', 'session', async (req, res) => {
      this.limit('session:' + req.ip, 120);
      const p = await this.session(req.headers);
      res.json({ player: p ? publicPlayer(p) : null, durable: this.store.durable });
    });
    route('post', 'guest', async (req, res) => {
      this.limit('guest:' + req.ip, 30);
      let p = await this.session(req.headers);
      if (!p) { p = await this.store.call('create'); const s = await this.issue(p); cookie(res, s.token); }
      if (req.body.displayName) p = await this.store.call('name', { id: p.id, name: this.name(req.body.displayName) });
      res.json({ player: publicPlayer(p), durable: this.store.durable });
    });
    route('post', 'login', async (req, res) => {
      this.limit('login:' + req.ip); const username = this.username(req.body.username);
      this.limit('account:' + username, 20);
      const p = await this.store.call('username', { username });
      if (!await this.verify(req.body.password, p?.password_hash)) throw fail('帳號或密碼不正確', 401);
      const old = await this.session(req.headers);
      const s = await this.issue(p);
      if (old) { await this.store.call('revoke', { hash: digest(cookieToken(req.headers)) }); revoke(old.id, { hash: digest(cookieToken(req.headers)) }); }
      cookie(res, s.token); res.json({ player: publicPlayer(p), durable: this.store.durable });
    });
    for (const action of ['bind', 'password', 'name', 'logout']) route('post', action, async (req, res) => {
      this.limit(action + ':' + req.ip, action === 'name' ? 30 : 10);
      const p = await this.session(req.headers); if (!p) throw fail('請重新登入', 401);
      if (action === 'logout') {
        await this.store.call('revoke', { hash: digest(cookieToken(req.headers)) }); revoke(p.id, { hash: digest(cookieToken(req.headers)) }); cookie(res, '', 0); return res.json({ success: true });
      }
      if (action === 'name') {
        const updated = await this.store.call('name', { id: p.id, name: this.name(req.body.displayName) });
        renamed(p.id, updated.display_name); return res.json({ player: publicPlayer(updated) });
      }
      if (action === 'bind' && p.username) throw fail('此身分已綁定帳號');
      if (action === 'password' && (!p.username || !await this.verify(req.body.currentPassword, p.password_hash))) throw fail('目前密碼不正確', 401);
      const result = await this.credentials(p, action === 'bind' ? this.username(req.body.username) : p.username, req.body.password);
      revoke(p.id, { version: result.player.auth_version }); const s = await this.issue(result.player); cookie(res, s.token);
      res.json({ player: publicPlayer(result.player), recoveryCode: result.recoveryCode });
    });
    route('post', 'recover', async (req, res) => {
      this.limit('recover:' + req.ip, 5);
      const p = await this.store.call('username', { username: this.username(req.body.username) });
      const hash = digest(String(req.body.recoveryCode || '').slice(0, 256));
      if (!p?.recovery_hash || !timingSafeEqual(Buffer.from(hash), Buffer.from(p.recovery_hash))) throw fail('帳號或復原碼不正確', 401);
      const result = await this.credentials(p, p.username, req.body.password);
      revoke(p.id); const s = await this.issue(result.player); cookie(res, s.token);
      res.json({ player: publicPlayer(result.player), recoveryCode: result.recoveryCode });
    });
  }
}
