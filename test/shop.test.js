'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, gear, map, maps, customer } = require('./helpers');

test('website: only public files are served', async (t) => {
  const s = await start();
  t.after(s.close);
  assert.equal((await s.req('GET', '/')).status, 200);
  assert.equal((await s.req('GET', '/cart')).status, 200, 'clean URLs work');
  assert.equal((await s.req('GET', '/js/app.js')).status, 200);
  for (const p of ['/server/app.js', '/server/config.js', '/package.json', '/.env', '/.env.example', '/data/store.db',
    '/private/downloads/README.md', `/private/downloads/${map.id}.zip`, '/%2e%2e/server/app.js', '/..%2fpackage.json',
    '/node_modules/express/package.json', '/test/helpers.js', '/.git/config']) {
    const r = await s.req('GET', p);
    assert.equal(r.status, 404, `${p} must not be served`);
    assert.doesNotMatch(r.text, /require\(|RAZORPAY|"dependencies"/);
  }
});

test('website: security headers are set', async (t) => {
  const s = await start();
  t.after(s.close);
  const r = await s.req('GET', '/');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
  const api = await s.req('GET', '/api/config');
  assert.equal(api.headers.get('cache-control'), 'no-store');
});

test('config: tells the browser the payment options, and no secrets', async (t) => {
  const s = await start({ env: { RAZORPAY_KEY_ID: 'rzp_test_abc123', RAZORPAY_KEY_SECRET: 'super-secret-value', RAZORPAY_WEBHOOK_SECRET: 'hook-secret', ADMIN_PASSWORD: 'a-very-long-password' } });
  t.after(s.close);
  const r = await s.req('GET', '/api/config');
  assert.equal(r.status, 200);
  assert.equal(r.json.payments.mode, 'razorpay');
  assert.equal(r.json.payments.razorpayKeyId, 'rzp_test_abc123');
  assert.equal(r.json.payments.methods.gpay, 'razorpay');
  assert.equal(r.json.payments.methods.bank, 'manual');
  assert.doesNotMatch(r.text, /super-secret-value|hook-secret|a-very-long-password/);
});

test('orders: the server sets the price, whatever the browser sends', async (t) => {
  const s = await start();
  t.after(s.close);
  const r = await s.req('POST', '/api/orders', { body: { items: [{ id: gear.id, qty: 1, price: 1 }], total: 1, customer } });
  assert.equal(r.status, 201);
  assert.equal(r.json.order.items[0].price, gear.price);
  assert.ok(r.json.order.total >= gear.price - r.json.order.discount);
  assert.equal(r.json.order.status, 'awaiting_payment');
  assert.match(r.json.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(r.json.order.downloads.length, 0);
});

test('orders: details are checked on the server', async (t) => {
  const s = await start();
  t.after(s.close);
  const bad = await s.req('POST', '/api/orders', { body: { items: [{ id: gear.id, qty: 1 }], customer: { name: 'A', phone: '123', pincode: 'abc' } } });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.fields.name && bad.json.fields.phone && bad.json.fields.line1 && bad.json.fields.pincode);

  const noEmail = await s.req('POST', '/api/orders', { body: { items: [{ id: map.id, qty: 1 }], customer: { name: 'Map Fan', phone: '9123456789' } } });
  assert.equal(noEmail.status, 400, 'maps need an email');
  assert.ok(noEmail.json.fields.email);

  const mapOnly = await s.req('POST', '/api/orders', { body: { items: [{ id: map.id, qty: 1 }], customer: { name: 'Map Fan', phone: '9123456789', email: 'fan@example.com' } } });
  assert.equal(mapOnly.status, 201, 'maps need no address');
  assert.equal(mapOnly.json.order.shipping, 0);

  const unknown = await s.req('POST', '/api/orders', { body: { items: [{ id: 'free-car', qty: 1 }], customer } });
  assert.equal(unknown.status, 400);
});

test('orders: only the shopper with the private key can see an order', async (t) => {
  const s = await start();
  t.after(s.close);
  const o = await s.placeOrder();
  assert.equal((await s.req('GET', `/api/orders/${o.id}`, { token: o.token })).status, 200);
  const wrong = await s.req('GET', `/api/orders/${o.id}`, { token: 'x'.repeat(43) });
  const none = await s.req('GET', `/api/orders/${o.id}`);
  const missing = await s.req('GET', '/api/orders/PMNOTREAL22', { token: o.token });
  assert.equal(wrong.status, 404);
  assert.equal(none.status, 404);
  assert.deepEqual(wrong.json, missing.json, 'a wrong key looks exactly like a missing order');
  assert.doesNotMatch(JSON.stringify((await s.req('GET', `/api/orders/${o.id}`, { token: o.token })).json), /access_hash|token/);
});

test('requests from other websites and non-JSON posts are blocked', async (t) => {
  const s = await start();
  t.after(s.close);
  const cross = await s.req('POST', '/api/orders', { body: { items: [{ id: gear.id, qty: 1 }], customer }, headers: { origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  const form = await s.req('POST', '/api/orders', { raw: 'items=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  const broken = await s.req('POST', '/api/orders', { raw: '{"items":', headers: { 'content-type': 'application/json' } });
  assert.equal(broken.status, 400);
  const huge = await s.req('POST', '/api/orders', { raw: JSON.stringify({ x: 'a'.repeat(40000) }), headers: { 'content-type': 'application/json' } });
  assert.equal(huge.status, 413);
});

test('demo payments: pay, then confirm', async (t) => {
  const s = await start();
  t.after(s.close);
  const o = await s.placeOrder();
  const confirmEarly = await s.req('POST', '/api/payments/demo/confirm', { token: o.token, body: { orderId: o.id } });
  assert.equal(confirmEarly.status, 400, 'must start the payment first');
  const pay = await s.req('POST', `/api/orders/${o.id}/pay`, { token: o.token, body: { method: 'phonepe' } });
  assert.equal(pay.status, 200);
  assert.equal(pay.json.provider, 'demo');
  const done = await s.req('POST', '/api/payments/demo/confirm', { token: o.token, body: { orderId: o.id } });
  assert.equal(done.status, 200);
  assert.equal(done.json.order.status, 'paid');
  assert.equal(done.json.order.provider, 'demo');
  const again = await s.req('POST', `/api/orders/${o.id}/pay`, { token: o.token, body: { method: 'card' } });
  assert.equal(again.status, 409, 'a paid order cannot be paid again');
});

test('demo payments are never available in production', async (t) => {
  const s = await start({ env: { NODE_ENV: 'production' } });
  t.after(s.close);
  const cfg = await s.req('GET', '/api/config');
  assert.equal(cfg.json.payments.mode, 'off');
  assert.equal(cfg.json.payments.methods.card, null);
  const o = await s.placeOrder();
  assert.equal((await s.req('POST', `/api/orders/${o.id}/pay`, { token: o.token, body: { method: 'card' } })).status, 400);
  assert.equal((await s.req('POST', '/api/payments/demo/confirm', { token: o.token, body: { orderId: o.id } })).status, 404);
  assert.throws(() => require('../server/config').loadConfig({ NODE_ENV: 'production', DEMO_PAYMENTS: 'true' }));
});

test('bank transfer: reference is recorded for the owner to check', async (t) => {
  const s = await start();
  t.after(s.close);
  const o = await s.placeOrder();
  const bad = await s.req('POST', `/api/orders/${o.id}/reference`, { token: o.token, body: { method: 'bank', reference: 'short' } });
  assert.equal(bad.status, 400);
  const upi = await s.req('POST', `/api/orders/${o.id}/reference`, { token: o.token, body: { method: 'gpay', reference: '123456789012' } });
  assert.equal(upi.status, 400, 'UPI is confirmed automatically while a gateway (or demo) is on');
  const ok = await s.req('POST', `/api/orders/${o.id}/reference`, { token: o.token, body: { method: 'bank', reference: 'utr 4123 4567 8901' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.order.status, 'pending_verification');
  assert.equal(ok.json.order.reference, 'UTR412345678901');
  assert.equal(ok.json.order.paid, false);
  const twice = await s.req('POST', `/api/orders/${o.id}/reference`, { token: o.token, body: { method: 'bank', reference: 'UTR999999999999' } });
  assert.equal(twice.status, 409);
});

test('map downloads: only after payment, one-time links, limited count', async (t) => {
  const s = await start({ files: [map.id], env: { DOWNLOAD_LIMIT: '2' } });
  t.after(s.close);
  const o = await s.placeOrder([{ id: map.id, qty: 1 }, { id: maps[1].id, qty: 1 }]);
  const early = await s.req('POST', `/api/orders/${o.id}/downloads/${map.id}`, { token: o.token, body: {} });
  assert.equal(early.status, 403, 'not before payment');

  await s.req('POST', `/api/orders/${o.id}/pay`, { token: o.token, body: { method: 'gpay' } });
  const paid = await s.req('POST', '/api/payments/demo/confirm', { token: o.token, body: { orderId: o.id } });
  const d = paid.json.order.downloads.find((x) => x.productId === map.id);
  assert.equal(d.available, true);
  assert.equal(paid.json.order.downloads.find((x) => x.productId === maps[1].id).fileReady, false);

  const stranger = await s.req('POST', `/api/orders/${o.id}/downloads/${map.id}`, { token: 'y'.repeat(43), body: {} });
  assert.equal(stranger.status, 404);
  const notInOrder = await s.req('POST', `/api/orders/${o.id}/downloads/${maps[2] ? maps[2].id : gear.id}`, { token: o.token, body: {} });
  assert.equal(notInOrder.status, 404);
  const missingFile = await s.req('POST', `/api/orders/${o.id}/downloads/${maps[1].id}`, { token: o.token, body: {} });
  assert.equal(missingFile.status, 409);

  const link = await s.req('POST', `/api/orders/${o.id}/downloads/${map.id}`, { token: o.token, body: {} });
  assert.equal(link.status, 200);
  assert.match(link.json.url, /^\/api\/downloads\/[A-Za-z0-9_-]+$/);
  const file = await s.req('GET', link.json.url);
  assert.equal(file.status, 200);
  assert.equal(file.text, `zip-bytes-${map.id}`);
  assert.match(file.headers.get('content-disposition'), /attachment/);
  assert.equal((await s.req('GET', link.json.url)).status, 410, 'each link works once');
  assert.equal((await s.req('GET', '/api/downloads/not-a-real-token-at-all-xx')).status, 410);

  const second = await s.req('POST', `/api/orders/${o.id}/downloads/${map.id}`, { token: o.token, body: {} });
  assert.equal(second.status, 200);
  const third = await s.req('POST', `/api/orders/${o.id}/downloads/${map.id}`, { token: o.token, body: {} });
  assert.equal(third.status, 429, 'download limit reached (unused live links count too)');
});

test('unpaid orders are cancelled after a while', async (t) => {
  const s = await start();
  t.after(s.close);
  const o = await s.placeOrder();
  s.db.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 49 * 3600e3).toISOString(), o.id);
  assert.equal(s.orders.expireUnpaid(), 1);
  const r = await s.req('GET', `/api/orders/${o.id}`, { token: o.token });
  assert.equal(r.json.order.status, 'cancelled');
  assert.equal((await s.req('POST', `/api/orders/${o.id}/pay`, { token: o.token, body: { method: 'gpay' } })).status, 409);
});
