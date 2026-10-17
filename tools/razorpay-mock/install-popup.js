// Replaces Razorpay's hosted popup with one that "pays" through the local
// mock and calls the storefront's success handler exactly like checkout.js.
// window.__rzpMock = { webhook_delay_ms, handler_delay_ms } tunes the race.
(() => {
  window.__rzpMock = window.__rzpMock || { webhook_delay_ms: 0, handler_delay_ms: 0 };
  window.__rzpMockLog = [];
  class MockRazorpay {
    constructor(options) { this.options = options; this.listeners = {}; }
    on(event, cb) { this.listeners[event] = cb; }
    async open() {
      const cfg = window.__rzpMock;
      const log = m => window.__rzpMockLog.push(new Date().toISOString().slice(11, 23) + ' ' + m);
      log('open order=' + this.options.order_id + ' cfg=' + JSON.stringify(cfg));
      const r = await fetch('http://localhost:8790/mock/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: this.options.order_id, webhook_delay_ms: cfg.webhook_delay_ms }),
      });
      const resp = await r.json();
      log('paid ' + JSON.stringify(resp).slice(0, 120));
      if (!r.ok) { this.listeners['payment.failed']?.({ error: resp.error }); return; }
      await new Promise(res => setTimeout(res, cfg.handler_delay_ms || 0));
      log('calling handler');
      await this.options.handler(resp);
      log('handler returned');
    }
    close() {}
  }
  Object.defineProperty(window, 'Razorpay', {
    configurable: true,
    get: () => MockRazorpay,
    set: () => {}, // ignore checkout.js if it loads later
  });
  return 'mock popup installed';
})()
