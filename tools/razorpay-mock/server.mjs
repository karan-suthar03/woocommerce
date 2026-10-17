// Local stand-in for the Razorpay REST API, plus a control endpoint that plays
// the part of the hosted checkout popup and of Razorpay's webhook sender.
//
//   /v1/...            the subset of the Razorpay API the Medusa plugin calls
//   POST /mock/pay     { order_id, webhook_delay_ms?, webhook_events? }
//                      -> marks the order paid (auto-capture) and returns what
//                         checkout.js would hand the storefront's handler
//
// Signatures use the real algorithms with the secrets from the backend's
// .env.local, so the backend's verification code runs unmodified.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

const PORT = Number(process.env.PORT || 8790);
const ENV_FILE = process.env.BACKEND_ENV || 'D:/personal/woocommerce/medusa-backend/apps/backend/.env.local';
const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY_SECRET = env.RAZORPAY_TEST_KEY_SECRET || env.RAZORPAY_SECRET;
const WEBHOOK_SECRET = env.RAZORPAY_TEST_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET || 'local_dev_webhook_secret';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:9000/hooks/payment/razorpay_razorpay';

const orders = new Map();
const payments = new Map();
const customers = new Map();
const now = () => Math.floor(Date.now() / 1000);
const rid = prefix => `${prefix}_${crypto.randomBytes(7).toString('base64url').replace(/[-_]/g, 'x')}`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,OPTIONS',
  });
  res.end(JSON.stringify(body));
}
const notFound = (res, what) => send(res, 400, {
  error: { code: 'BAD_REQUEST_ERROR', description: `The id provided does not exist: ${what}` },
});

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function orderView(o) {
  return { ...o, amount_due: o.amount - o.amount_paid };
}

async function sendWebhook(event, payment) {
  const order = orders.get(payment.order_id);
  const body = JSON.stringify({
    entity: 'event',
    account_id: 'acc_mock',
    event,
    contains: event === 'order.paid' ? ['payment', 'order'] : ['payment'],
    payload: {
      payment: { entity: payment },
      ...(event === 'order.paid' ? { order: { entity: orderView(order) } } : {}),
    },
    created_at: now(),
  });
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  try {
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature },
      body,
    });
    log(`webhook ${event} for ${payment.order_id} -> ${r.status}`);
  } catch (err) {
    log(`webhook ${event} failed: ${err.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname.replace(/\/+$/, '');
  const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readJson(req) : {};
  log(req.method, p, Object.keys(body).length ? JSON.stringify(body).slice(0, 160) : '');
  let m;

  // ---- customers
  if (req.method === 'POST' && p === '/v1/customers') {
    const c = { id: rid('cust'), entity: 'customer', ...body, created_at: now() };
    customers.set(c.id, c);
    return send(res, 200, c);
  }
  if ((m = p.match(/^\/v1\/customers\/([^/]+)$/))) {
    const c = customers.get(m[1]);
    if (!c) return notFound(res, m[1]);
    if (req.method !== 'GET') Object.assign(c, body);
    return send(res, 200, c);
  }

  // ---- orders
  if (req.method === 'POST' && p === '/v1/orders') {
    const o = {
      id: rid('order'), entity: 'order', amount: body.amount, amount_paid: 0,
      currency: body.currency || 'INR', receipt: body.receipt ?? null, offer_id: null,
      status: 'created', attempts: 0, notes: body.notes ?? {}, created_at: now(),
    };
    orders.set(o.id, o);
    return send(res, 200, orderView(o));
  }
  if ((m = p.match(/^\/v1\/orders\/([^/]+)\/payments$/))) {
    if (!orders.has(m[1])) return notFound(res, m[1]);
    const items = [...payments.values()].filter(x => x.order_id === m[1]);
    return send(res, 200, { entity: 'collection', count: items.length, items });
  }
  if ((m = p.match(/^\/v1\/orders\/([^/]+)$/))) {
    const o = orders.get(m[1]);
    if (!o) return notFound(res, m[1]);
    if (req.method === 'PATCH' && body.notes) o.notes = { ...o.notes, ...body.notes };
    return send(res, 200, orderView(o));
  }

  // ---- payments
  if ((m = p.match(/^\/v1\/payments\/([^/]+)\/capture$/))) {
    const pay = payments.get(m[1]);
    if (!pay) return notFound(res, m[1]);
    if (pay.status === 'captured') {
      return send(res, 400, { error: { code: 'BAD_REQUEST_ERROR', description: 'This payment has already been captured' } });
    }
    pay.status = 'captured'; pay.captured = true;
    return send(res, 200, pay);
  }
  if ((m = p.match(/^\/v1\/payments\/([^/]+)\/refund$/))) {
    const pay = payments.get(m[1]);
    if (!pay) return notFound(res, m[1]);
    const amount = body.amount ?? pay.amount;
    pay.amount_refunded += amount;
    pay.refund_status = pay.amount_refunded >= pay.amount ? 'full' : 'partial';
    if (pay.amount_refunded >= pay.amount) pay.status = 'refunded';
    return send(res, 200, {
      id: rid('rfnd'), entity: 'refund', amount, currency: pay.currency, payment_id: pay.id,
      notes: body.notes ?? {}, status: 'processed', created_at: now(),
    });
  }
  if ((m = p.match(/^\/v1\/payments\/([^/]+)$/))) {
    const pay = payments.get(m[1]);
    return pay ? send(res, 200, pay) : notFound(res, m[1]);
  }

  // ---- control: what checkout.js + Razorpay's servers would do on "Pay"
  if (req.method === 'POST' && p === '/mock/pay') {
    const o = orders.get(body.order_id);
    if (!o) return notFound(res, body.order_id);
    const pay = {
      id: rid('pay'), entity: 'payment', amount: o.amount, currency: o.currency,
      status: 'captured', order_id: o.id, method: 'card', captured: true,
      amount_refunded: 0, refund_status: null, notes: o.notes, email: 'mock@example.com',
      contact: '+919999999999', created_at: now(),
    };
    payments.set(pay.id, pay);
    o.attempts += 1; o.amount_paid = o.amount; o.status = 'paid';
    const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${o.id}|${pay.id}`).digest('hex');

    const delay = body.webhook_delay_ms;
    if (delay != null) {
      const events = body.webhook_events ?? ['payment.captured', 'order.paid'];
      setTimeout(async () => { for (const e of events) await sendWebhook(e, pay); }, delay);
      log(`scheduled ${events.join(', ')} in ${delay}ms`);
    }
    return send(res, 200, {
      razorpay_payment_id: pay.id,
      razorpay_order_id: o.id,
      razorpay_signature: signature,
    });
  }

  if (p === '/mock/state') {
    return send(res, 200, { orders: [...orders.values()], payments: [...payments.values()] });
  }

  log('UNHANDLED', req.method, p);
  return send(res, 404, { error: { code: 'BAD_REQUEST_ERROR', description: `mock: no route ${req.method} ${p}` } });
});

server.listen(PORT, () => log(`razorpay mock on http://localhost:${PORT} -> webhooks to ${WEBHOOK_URL}`));
