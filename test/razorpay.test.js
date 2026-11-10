'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, gear, hmac } = require('./helpers');
const { createRazorpay } = require('../server/razorpay');

const KEYS = { keyId: 'rzp_test_abc123', keySecret: 'key-secret-123', webhookSecret: 'hook-secret-456' };
const ENV = { RAZORPAY_KEY_ID: KEYS.keyId, RAZORPAY_KEY_SECRET: KEYS.keySecret, RAZORPAY_WEBHOOK_SECRET: KEYS.webhookSecret };

/** Real signature checks, fake network calls to Razorpay. */
function fakeRazorpay() {
  const rzp = createRazorpay(KEYS);
  const state = { orders: [], payments: new Map(), captured: [] };
  rzp.createOrder = async ({ amountPaise, receipt }) => {
    const o = { id: `order_T${state.orders.length + 1}abcdef`, amount: amountPaise, currency: 'INR', receipt };
    state.orders.push(o);
    return o;
  };
  rzp.fetchPayment = async (id) => {
    const p = state.payments.get(id);
    if (!p) { const e = new Error('not found'); e.gateway = true; throw e; }
    return { ...p };
  };
  rzp.capturePayment = async (id) => {
    state.captured.push(id);
    const p = state.payments.get(id);
    p.status = 'captured';
    return { ...p };
  };
  return { rzp, state };
}

async function setup(t) {
  const { rzp, state } = fakeRazorpay();
  const s = await start({ env: ENV, razorpay: rzp });
  t.after(s.close);
  const o = await s.placeOrder([{ id: gear.id, qty: 1 }]);
  const pay = await s.req('POST', `/api/orders/${o.id}/pay`, { token: o.token, body: { method: 'card' } });
  assert.equal(pay.status, 200);
  return { s, o, pay: pay.json, state };
}

const signed = (gatewayOrderId, paymentId) => hmac(KEYS.keySecret, `${gatewayOrderId}|${paymentId}`);

test('pay: creates one Razorpay order for the exact server total', async (t) => {
  const { s, o, pay, state } = await setup(t);
  assert.equal(pay.provider, 'razorpay');
  assert.equal(pay.checkout.key, KEYS.keyId);
  assert.equal(pay.checkout.amount, pay.order.total * 100);
  assert.equal(state.orders[0].amount, pay.order.total * 100);
  assert.doesNotMatch(JSON.stringify(pay), /key-secret|hook-secret/);
  const again = await s.req('POST', `/api/orders/${o.id}/pay`, { token: o.token, body: { method: 'gpay' } });
  assert.equal(again.json.checkout.order_id, pay.checkout.order_id, 'retrying reuses the same Razorpay order');
  assert.equal(state.orders.length, 1);
});

test('verify: a forged signature is refused', async (t) => {
  const { s, o, pay, state } = await setup(t);
  state.payments.set('pay_Fake123456', { id: 'pay_Fake123456', order_id: pay.checkout.order_id, amount: pay.checkout.amount, currency: 'INR', status: 'captured' });
  const r = await s.req('POST', '/api/payments/razorpay/verify', {
    token: o.token,
    body: { orderId: o.id, razorpay_order_id: pay.checkout.order_id, razorpay_payment_id: 'pay_Fake123456', razorpay_signature: 'a'.repeat(64) }
  });
  assert.equal(r.status, 400);
  assert.equal((await s.req('GET', `/api/orders/${o.id}`, { token: o.token })).json.order.paid, false);
});

test('verify: a payment for a different amount is refused', async (t) => {
  const { s, o, pay, state } = await setup(t);
  state.payments.set('pay_Cheap123456', { id: 'pay_Cheap123456', order_id: pay.checkout.order_id, amount: 100, currency: 'INR', status: 'captured' });
  const r = await s.req('POST', '/api/payments/razorpay/verify', {
    token: o.token,
    body: { orderId: o.id, razorpay_order_id: pay.checkout.order_id, razorpay_payment_id: 'pay_Cheap123456', razorpay_signature: signed(pay.checkout.order_id, 'pay_Cheap123456') }
  });
  assert.equal(r.status, 400);
  assert.equal((await s.req('GET', `/api/orders/${o.id}`, { token: o.token })).json.order.paid, false);
});

test('verify: a real payment confirms the order (and is captured if needed)', async (t) => {
  const { s, o, pay, state } = await setup(t);
  state.payments.set('pay_Good123456', { id: 'pay_Good123456', order_id: pay.checkout.order_id, amount: pay.checkout.amount, currency: 'INR', status: 'authorized', method: 'card' });
  const body = { orderId: o.id, razorpay_order_id: pay.checkout.order_id, razorpay_payment_id: 'pay_Good123456', razorpay_signature: signed(pay.checkout.order_id, 'pay_Good123456') };
  const r = await s.req('POST', '/api/payments/razorpay/verify', { token: o.token, body });
  assert.equal(r.status, 200);
  assert.equal(r.json.order.status, 'paid');
  assert.deepEqual(state.captured, ['pay_Good123456']);
  const twice = await s.req('POST', '/api/payments/razorpay/verify', { token: o.token, body });
  assert.equal(twice.status, 200, 'verifying twice is harmless');
  assert.equal(state.captured.length, 1);
});

test('verify: an unfinished payment does not confirm the order', async (t) => {
  const { s, o, pay, state } = await setup(t);
  state.payments.set('pay_Wait123456', { id: 'pay_Wait123456', order_id: pay.checkout.order_id, amount: pay.checkout.amount, currency: 'INR', status: 'created' });
  const r = await s.req('POST', '/api/payments/razorpay/verify', {
    token: o.token,
    body: { orderId: o.id, razorpay_order_id: pay.checkout.order_id, razorpay_payment_id: 'pay_Wait123456', razorpay_signature: signed(pay.checkout.order_id, 'pay_Wait123456') }
  });
  assert.equal(r.status, 402);
});

function webhook(s, payload, { secret = KEYS.webhookSecret, eventId = `evt_${Math.random().toString(36).slice(2)}` } = {}) {
  const raw = JSON.stringify(payload);
  return s.req('POST', '/api/webhooks/razorpay', {
    raw,
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmac(secret, raw), 'x-razorpay-event-id': eventId }
  });
}
const captured = (pay, amount = pay.checkout.amount) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: 'pay_Hook123456', order_id: pay.checkout.order_id, amount, currency: 'INR', status: 'captured', method: 'upi' } } }
});

test('webhook: a wrongly signed call is refused', async (t) => {
  const { s, o, pay } = await setup(t);
  const r = await webhook(s, captured(pay), { secret: 'not-the-secret' });
  assert.equal(r.status, 400);
  assert.equal((await s.req('GET', `/api/orders/${o.id}`, { token: o.token })).json.order.paid, false);
});

test('webhook: confirms the order even if the shopper closed the page', async (t) => {
  const { s, o, pay } = await setup(t);
  const r = await webhook(s, captured(pay), { eventId: 'evt_same' });
  assert.equal(r.status, 200);
  const view = (await s.req('GET', `/api/orders/${o.id}`, { token: o.token })).json.order;
  assert.equal(view.status, 'paid');
  const dup = await webhook(s, captured(pay), { eventId: 'evt_same' });
  assert.equal(dup.json.duplicate, true, 'repeat deliveries are ignored');
});

test('webhook: a wrong amount does not confirm the order', async (t) => {
  const { s, o, pay } = await setup(t);
  const r = await webhook(s, captured(pay, 100));
  assert.equal(r.status, 200);
  assert.equal((await s.req('GET', `/api/orders/${o.id}`, { token: o.token })).json.order.paid, false);
});
