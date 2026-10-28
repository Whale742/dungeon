(function (root) {
  'use strict';
  // Shared by the browser and deterministic delayed-transport tests.
  class Operations {
    constructor({ send, context, changed, report, now = () => performance.now(), schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id), timeout = 10000 }) {
      Object.assign(this, { send, context, changed, report, now, schedule, cancel, timeout });
      this.active = new Map(); this.sequence = 0; this.version = 0;
    }
    start(key, event, payload, preview) {
      if (this.active.has(key)) return false;
      const sequence = ++this.sequence;
      const op = { key, event, sequence, requestId: `${sequence}:${Date.now()}`, context: this.context(event), status: 'pending', preview, started: this.now() };
      this.active.set(key, op);
      op.timer = this.schedule(() => this.finish(op, 'expired', { message: '確認逾時，正在重新同步；交易可能已完成' }), this.timeout);
      this.changed(op);
      op.cancelTransport = this.send(event, { ...payload, requestId: op.requestId, sequence, context: op.context }, result => {
        if (this.active.get(key) !== op || op.context !== this.context(event)) return;
        if (result?.requestId !== op.requestId) return;
        if (result.success && result.context !== op.context) return this.finish(op, 'expired', { message: '權威操作識別不一致，正在重新同步' });
        this.report('operation.rtt.ms', this.now() - op.started);
        if (result.processingMs !== undefined) this.report(`${event}.server.ms`, result.processingMs);
        if (!result.success) return this.finish(op, 'rejected', result);
        this.cancel(op.timer); op.cancelTransport?.(); op.status = 'confirmed'; op.result = result;
        if (this.version >= result.version) this.active.delete(key);
        else op.timer = this.schedule(() => this.finish(op, 'expired', { message: '等待權威狀態逾時，正在重新同步' }), this.timeout);
        this.changed(op, result);
      });
      this.report('operation.feedback.ms', this.now() - op.started);
      return true;
    }
    finish(op, status, result) {
      if (this.active.get(op.key) !== op) return;
      this.cancel(op.timer); op.cancelTransport?.(); op.status = status; this.active.delete(op.key);
      this.changed(op, result);
    }
    reconcile(version) {
      this.version = version;
      for (const op of this.active.values()) {
        if (op.context !== this.context(op.event)) this.finish(op, 'expired');
        else if (op.status === 'confirmed' && version >= op.result.version) {
          this.cancel(op.timer); this.active.delete(op.key);
        }
      }
    }
    clear() { for (const op of this.active.values()) this.finish(op, 'expired'); this.version = 0; }
  }
  root.GameOperations = Operations;
  if (typeof module !== 'undefined') module.exports = Operations;
})(typeof window !== 'undefined' ? window : globalThis);
