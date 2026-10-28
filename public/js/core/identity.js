// Credentials stay in form fields only; sessions live in HttpOnly cookies.
window.PlayerIdentity = {
  player: null, ready: null, socket: null, apply: null,
  async request(action, body) {
    const response = await fetch('/api/player/' + action, { credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '身分服務暫時無法使用');
    return result;
  },
  accept(player) { this.player = player; if (player) this.apply?.(player); this.render(); },
  render() {
    const panel = document.getElementById('profileIdentity'); if (!panel) return;
    const p = this.player;
    panel.querySelector('[data-identity-status]').textContent = p ? (p.bound ? '已綁定帳號：' + p.username : '訪客身分（登出前請先綁定帳號，以免失去身分憑證）') : '尚未登入';
    panel.querySelector('[data-identity-bind]').hidden = !p || p.bound;
    panel.querySelector('[data-identity-password]').hidden = !p?.bound;
    panel.querySelector('[data-identity-logout]').hidden = !p;
    panel.querySelector('[data-identity-guest]').hidden = !!p;
  },
  async boot(socket, apply) {
    this.socket = socket; this.apply = apply;
    this.ready = (async () => {
      try {
        let result = await this.request('session');
        if (!result.player) result = await this.request('guest', { displayName: localStorage.getItem('dungeon_player_name') || '冒險者' });
        this.accept(result.player); socket.connect();
      } catch (error) { showToast(error.message, 'danger', 6000); }
    })();
    const panel = document.getElementById('profileIdentity');
    panel?.addEventListener('click', async event => {
      const button = event.target.closest('[data-identity-action]'); if (!button || button.disabled) return;
      const action = button.dataset.identityAction;
      const read = name => panel.querySelector('[name="' + name + '"]').value;
      const body = action === 'logout' ? {} : { username: read('username'), password: read('password'), currentPassword: read('currentPassword'), recoveryCode: read('recoveryCode') };
      panel.querySelectorAll('button').forEach(b => b.disabled = true);
      const notice = panel.querySelector('[data-identity-notice]'); notice.textContent = '';
      try {
        const result = await this.request(action, body);
        panel.querySelectorAll('input[type="password"]').forEach(input => input.value = '');
        socket.disconnect();
        if (action === 'logout') {
          this.accept(null); notice.textContent = '已登出。可登入其他帳號，或選擇以訪客繼續。';
        } else {
          this.accept(result.player); socket.connect();
          notice.textContent = result.recoveryCode ? '請另行保存此一次性復原碼（此次已取代舊碼）：' + result.recoveryCode : '登入成功';
        }
      } catch (error) { notice.textContent = error.message; }
      finally { panel.querySelectorAll('button').forEach(b => b.disabled = false); }
    });
  }
};
