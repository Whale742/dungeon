// Console opt-in: GamePerf.enabled = true; GamePerf.delayMs = 300 (each direction).
window.GamePerf = {
  enabled: new URLSearchParams(location.search).get('gamePerf') === '1', samples: new Map(), received: new WeakMap(),
  delayMs: Number(new URLSearchParams(location.search).get('operationDelayMs')) || 0,
  record(name, value) {
    if (!this.enabled) return;
    const values = this.samples.get(name) || [];
    if (values.length === 200) values.shift();
    values.push(value); this.samples.set(name, values);
    document.documentElement.dataset.gamePerf = JSON.stringify(this.snapshot());
  },
  snapshot() { return Object.fromEntries([...this.samples].map(([name, values]) => {
    const sorted = [...values].sort((a,b) => a-b);
    return [name, { count: values.length, p50: sorted[Math.floor(sorted.length*.5)], p95: sorted[Math.floor(sorted.length*.95)] }];
  })); }
};
let operationState = null;
let latestStateVersion = -1;
let isReconcilingOperations = false;
function paintOperations(renderLock = true) {
  const me = getMyPlayer();
  if (renderLock && me && roomState?.state === 'IN_BATTLE' && !isProcessingPresentationQueue) renderMyActionBar(me);
  document.querySelectorAll('[data-shop-preview]').forEach(node => node.remove());
  for (const op of operations.active.values()) {
    if (!op.preview) continue;
    const slot = elements.eventDetails?.querySelector('.squad-empty-slot[data-index="' + op.preview.index + '"]');
    const host = slot || elements.eventDetails?.querySelector('.shop-container');
    if (!host) continue;
    const preview = document.createElement('span');
    preview.dataset.shopPreview = op.requestId;
    preview.style.cssText = 'opacity:.65;pointer-events:none;font-size:12px;color:#fbbf24';
    preview.textContent = op.preview.name + '：' + (op.status === 'confirmed' ? '已確認，同步中' : '已放置，確認中') + '（自動分配空格）';
    host.appendChild(preview);
  }
}
const operations = new GameOperations({
  context: event => operationState?.operationContexts?.[event === 'battle:lock' ? 'lock' : 'shop'],
  report: (name, ms) => GamePerf.record(name, ms),
  send(event, data, callback) {
    const delay = GamePerf.enabled ? Math.min(5000, Math.max(0, Number(GamePerf.delayMs) || 0)) : 0;
    let sendTimer, ackTimer;
    const emit = () => {
      if (!socket.connected || ![...operations.active.values()].some(op => op.requestId === data.requestId)) return;
      socket.timeout(10000).emit(event, data, (error, result) => {
        if (!error) {
          if (delay) ackTimer = setTimeout(() => callback(result), delay); else callback(result);
        }
      });
    };
    if (delay) sendTimer = setTimeout(emit, delay); else emit();
    return () => { clearTimeout(sendTimer); clearTimeout(ackTimer); };
  },
  changed(op, result) {
    if (op?.preview?.triggerBtn && op.status !== 'pending') {
      op.preview.triggerBtn.disabled = false; op.preview.triggerBtn.textContent = op.preview.originalText;
    }
    if (!isReconcilingOperations) paintOperations();
    if (GamePerf.enabled && op?.status === 'pending') requestAnimationFrame(() => GamePerf.record('operation.nextFrame.ms', performance.now() - op.started));
    if ((op?.status === 'rejected' || op?.status === 'expired') && result?.message) showToast(result.message, 'danger');
    if ((op?.status === 'expired' && result) || (op?.status === 'rejected' && result?.context !== op.context)) socket.emit('room:resync');
    if (op?.status === 'confirmed' && op.preview) {
      const placement = result?.placement;
      showToast((op.preview.buyback ? '購回成功！' : '') + '購入【' + (result?.item?.name || op.preview.name) + '】' + (placement ? '，已放入第 ' + (placement.index + 1) + ' 格' : ''), 'success');
    }
  }
});
function submitBattleLock(payload) {
  if (!socket.connected || getMyPlayer()?.isLocked || roomState?.selectionState !== 'SELECTING') return;
  operations.start('lock', 'battle:lock', payload);
}
