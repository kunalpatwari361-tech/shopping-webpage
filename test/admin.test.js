'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const PASSWORD = 'correct-horse-battery-staple';

async function login(s, password = PASSWORD) {
  return s.req('POST', '/api/admin/login', { body: { password } });
}
const auth = (token) => ({ authorization: `Bearer ${token}` });

test('admin panel is off until a strong password is set', async (t) => {
  const s = await start({ env: { ADMIN_PASSWORD: 'short' } });
  t.after(s.close);
  assert.equal((await login(s, 'short')).status, 404);
  assert.equal((await s.req('GET', '/api/admin/summary')).status, 404);
});

test('admin: wrong password and missing session are refused', async (t) => {
  const s = await start({ env: { ADMIN_PASSWORD: PASSWORD } });
  t.after(s.close);
  assert.equal((await login(s, 'guess-guess-guess')).status, 401);
  assert.equal((await login(s, { $ne: null })).status, 401);
  assert.equal((await s.req('GET', '/api/admin/summary')).status, 401);
  assert.equal((await s.req('GET', '/api/admin/orders', { headers: auth('made-up-token-made-up-token') })).status, 401);
});

test('admin: too many wrong passwords are slowed down', async (t) => {
  const s = await start({ env: { ADMIN_PASSWORD: PASSWORD } });
  t.after(s.close);
  let last;
  for (let i = 0; i < 9; i += 1) last = await login(s, `wrong-password-${i}`);
  assert.equal(last.status, 429);
});

test('admin: confirm a bank transfer, ship it, and see the history', async (t) => {
  const s = await start({ env: { ADMIN_PASSWORD: PASSWORD } });
  t.after(s.close);
  const o = await s.placeOrder();
  await s.req('POST', `/api/orders/${o.id}/reference`, { token: o.token, body: { method: 'bank', reference: 'UTR123456789012' } });

  const { json: { token } } = await login(s);
  const sum = await s.req('GET', '/api/admin/summary', { headers: auth(token) });
  assert.equal(sum.status, 200);
  assert.equal(sum.json.byStatus.pending_verification.count, 1);

  const list = await s.req('GET', '/api/admin/orders?status=action', { headers: auth(token) });
  assert.equal(list.json.orders[0].id, o.id);
  const found = await s.req('GET', '/api/admin/orders?status=all&q=UTR1234', { headers: auth(token) });
  assert.equal(found.json.orders.length, 1);
  const tricky = await s.req('GET', `/api/admin/orders?status=all&q=${encodeURIComponent("%' OR 1=1 --")}`, { headers: auth(token) });
  assert.equal(tricky.status, 200);
  assert.equal(tricky.json.orders.length, 0);

  const bad = await s.req('POST', `/api/admin/orders/${o.id}/status`, { headers: auth(token), body: { status: 'delivered' } });
  assert.equal(bad.status, 409, 'cannot deliver before payment');

  const paid = await s.req('POST', `/api/admin/orders/${o.id}/status`, { headers: auth(token), body: { status: 'paid', note: 'Seen in bank statement' } });
  assert.equal(paid.json.order.status, 'paid');
  const shipped = await s.req('POST', `/api/admin/orders/${o.id}/status`, { headers: auth(token), body: { status: 'shipped', note: 'Courier AWB 123' } });
  assert.deepEqual(shipped.json.order.nextStatuses, ['delivered']);
  const types = shipped.json.order.events.map((e) => e.type);
  assert.deepEqual(types, ['created', 'reference_submitted', 'paid', 'shipped']);

  const shopper = await s.req('GET', `/api/orders/${o.id}`, { token: o.token });
  assert.equal(shopper.json.order.statusLabel, 'Shipped');
  assert.equal(shopper.json.order.events, undefined, 'shoppers do not see the admin history');

  assert.equal((await s.req('POST', '/api/admin/logout', { headers: auth(token), body: {} })).status, 200);
  assert.equal((await s.req('GET', '/api/admin/summary', { headers: auth(token) })).status, 401);
});
