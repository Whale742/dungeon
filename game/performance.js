import { monitorEventLoopDelay } from 'node:perf_hooks';

// Opt-in, bounded aggregates; no per-action logging or public diagnostic endpoint.
export const metrics = {
  enabled: process.env.GAME_PERF === '1',
  values: new Map(),
  startedAt: performance.now(),
  record(name, value) {
    if (!this.enabled || !Number.isFinite(value)) return;
    const s = this.values.get(name) || { count: 0, total: 0, max: 0 };
    s.count++; s.total += value; s.max = Math.max(s.max, value);
    this.values.set(name, s);
  },
  snapshot() {
    const elapsedSeconds = (performance.now() - this.startedAt) / 1000;
    return { elapsedSeconds, broadcastsPerSecond: (this.values.get('state.broadcasts')?.count || 0) / Math.max(.001, elapsedSeconds),
      ...Object.fromEntries([...this.values].map(([k, s]) => [k, { ...s, mean: s.total / s.count }])) };
  }
};
export function startEventLoopMetrics() {
  if (!metrics.enabled) return () => {};
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const timer = setInterval(() => {
    metrics.record('eventLoop.p95.ms', delay.percentile(95) / 1e6);
    metrics.record('eventLoop.max.ms', delay.max / 1e6);
    delay.reset();
    if (process.env.GAME_PERF_LOG === '1') console.info('[game-perf]', metrics.snapshot());
  }, 30000);
  timer.unref();
  return () => { clearInterval(timer); delay.disable(); };
}

export function operationContext(room, kind) {
  if (room._shopEvent !== room.currentEvent) {
    room._shopEvent = room.currentEvent; room.shopEpoch = (room.shopEpoch || 0) + 1;
  }
  return JSON.stringify(kind === 'battle:lock'
    ? [room.code, room.state, room.floor, room.battleCount, room.battleRound]
    : [room.code, room.state, room.floor, room.battleCount, room.currentEvent?.col, room.currentEvent?.row, room.shopEpoch]);
}

// Per connection cache makes retries idempotent. The bounded cache never replays
// an evicted request: monotonically increasing sequence numbers reject it.
export function handleOperation(room, socket, kind, data, execute) {
  const start = metrics.enabled ? performance.now() : 0;
  const context = operationContext(room, kind);
  const cache = socket.data.operations ||= new Map();
  const key = `${kind}:${data?.requestId}`;
  if (data?.requestId && cache.has(key)) return cache.get(key);
  let result;
  if (data?.requestId && (!Number.isSafeInteger(data.sequence) || data.sequence <= (socket.data.operationSequence || 0))) {
    result = { success: false, message: '操作已過期，請重新操作' };
  } else if ((data?.requestId || data?.context) && data.context !== context) {
    result = { success: false, message: '回合或商店已變更，請重新操作' };
  } else {
    result = execute();
  }
  if (data?.requestId && Number.isSafeInteger(data.sequence) && data.sequence > 0) socket.data.operationSequence = Math.max(socket.data.operationSequence || 0, data.sequence);
  const processingMs = metrics.enabled ? performance.now() - start : undefined;
  metrics.record(`${kind}.ms`, processingMs);
  if (kind === 'event:shop_action') metrics.record(`shop.${['buy', 'buyback'].includes(data?.action) ? data.action : 'other'}.ms`, processingMs);
  const response = { ...result, requestId: data?.requestId, context, version: room.stateVersion || 0,
    ...(metrics.enabled ? { processingMs } : {}) };
  if (data?.requestId) {
    cache.set(key, response);
    if (cache.size > 64) cache.delete(cache.keys().next().value);
  }
  return response;
}
