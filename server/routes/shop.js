/* ============================================================
   Shopper API
     GET  /api/config                      payment options for checkout
     POST /api/orders                      create an order (server prices it)
     GET  /api/orders/:id                  order status        (X-Order-Token)
     POST /api/orders/:id/pay              start UPI/card payment (X-Order-Token)
     POST /api/orders/:id/reference        bank / direct-UPI reference (X-Order-Token)
     POST /api/payments/razorpay/verify    confirm a Razorpay payment (X-Order-Token)
     POST /api/payments/demo/confirm       demo mode only      (X-Order-Token)
     POST /api/orders/:id/downloads/:pid   one-time map download link (X-Order-Token)
     GET  /api/downloads/:token            the map file
   ============================================================ */
'use strict';
const express = require('express');
const { quote } = require('../pricing');
const validate = require('../validate');
const { HttpError, badRequest, notFound } = require('../errors');

function shopRoutes({ config, catalog, orders, downloads, razorpay, limits }) {
  const r = express.Router();
  const tokenOf = (req) => req.get('x-order-token') || '';
  const str = (v) => (typeof v === 'string' ? v.slice(0, 120) : '');

  /** Which engine handles a payment method right now (null = not available). */
  function providerFor(method) {
    if (method === 'bank') return 'manual';
    if (config.paymentMode === 'razorpay') return 'razorpay';
    if (config.paymentMode === 'demo') return 'demo';
    if (method !== 'card' && catalog.upiId) return 'manual'; // pay to the shop's own UPI ID, checked by hand
    return null;
  }

  r.get('/config', (req, res) => {
    res.json({
      storeName: catalog.storeName,
      payments: {
        mode: config.paymentMode,
        razorpayKeyId: config.paymentMode === 'razorpay' ? config.razorpay.keyId : null,
        methods: Object.fromEntries(validate.METHODS.map((m) => [m, providerFor(m)]))
      },
      downloads: { days: config.downloadDays, limit: config.downloadLimit }
    });
  });

  r.post('/orders', limits.orders, (req, res) => {
    const body = req.body || {};
    const q = quote(catalog, body.items, body.coupon);
    const customer = validate.customer(body.customer, { address: q.physical, email: q.digital });
    const { row, token } = orders.create(q, customer);
    res.status(201).json({ order: orders.view(row), token, couponRejected: q.couponRejected });
  });

  r.get('/orders/:id', (req, res) => {
    res.json({ order: orders.view(orders.forShopper(req.params.id, tokenOf(req))) });
  });

  r.post('/orders/:id/pay', limits.pay, async (req, res) => {
    let row = orders.forShopper(req.params.id, tokenOf(req));
    const method = validate.method((req.body || {}).method);
    const provider = providerFor(method);
    if (!provider) throw badRequest('That payment method is not available right now. Please choose another.');
    if (provider === 'manual') throw badRequest('For this method, pay first and then send us your payment reference.');
    row = orders.choosePayment(row, method, provider);
    if (provider === 'demo') return res.json({ provider, order: orders.view(row) });

    // Razorpay: create the gateway order once per order. The amount is fixed by the server.
    const amountPaise = row.total * 100;
    if (!row.gateway_order_id) {
      const g = await razorpay.createOrder({ amountPaise, receipt: row.id, notes: { store_order_id: row.id } });
      if (g.amount !== amountPaise || g.currency !== 'INR') throw new Error(`Razorpay order ${g.id} has the wrong amount`);
      row = orders.setGatewayOrder(row, g.id);
      orders.log(row.id, 'system', 'gateway_order', row.gateway_order_id);
    }
    const c = JSON.parse(row.customer_json);
    res.json({
      provider,
      order: orders.view(row),
      checkout: {
        key: razorpay.keyId,
        order_id: row.gateway_order_id,
        amount: amountPaise,
        currency: 'INR',
        name: catalog.storeName,
        description: `Order ${row.id}`,
        prefill: { name: c.name, email: c.email || '', contact: `+91${c.phone}` },
        notes: { store_order_id: row.id }
      }
    });
  });

  r.post('/payments/razorpay/verify', limits.pay, async (req, res) => {
    const b = req.body || {};
    const row = orders.forShopper(str(b.orderId), tokenOf(req));
    if (!razorpay || row.provider !== 'razorpay' || !row.gateway_order_id) throw badRequest('This order is not being paid through Razorpay.');
    if (orders.PAID.includes(row.status)) return res.json({ order: orders.view(row) });

    const paymentId = str(b.razorpay_payment_id);
    const okShape = b.razorpay_order_id === row.gateway_order_id && /^pay_[A-Za-z0-9]{6,40}$/.test(paymentId);
    if (!okShape || !razorpay.checkoutSignatureValid(row.gateway_order_id, paymentId, str(b.razorpay_signature))) {
      orders.log(row.id, 'shopper', 'verify_failed', 'Signature did not match');
      throw badRequest('We could not confirm this payment. If money was taken, contact us with your order number.');
    }

    // Ask Razorpay directly: right order, right amount, and the money is really taken.
    let p = await razorpay.fetchPayment(paymentId);
    if (p.order_id !== row.gateway_order_id || p.amount !== row.total * 100 || p.currency !== 'INR') {
      orders.log(row.id, 'system', 'amount_mismatch', `${paymentId}: ${p.amount} ${p.currency}`);
      throw badRequest('This payment does not match your order. Please contact us with your order number.');
    }
    if (p.status === 'authorized') {
      try { p = await razorpay.capturePayment(paymentId, row.total * 100); } catch (err) { p = await razorpay.fetchPayment(paymentId); }
    }
    if (p.status !== 'captured') throw new HttpError(402, 'Your payment is not complete yet. If money was taken, it will be confirmed automatically in a few minutes.');
    orders.markPaid(row.id, { actor: 'razorpay', paymentId, detail: `${p.method || 'payment'} ${paymentId}` });
    res.json({ order: orders.view(orders.get(row.id)) });
  });

  r.post('/payments/demo/confirm', limits.pay, (req, res) => {
    if (config.paymentMode !== 'demo') throw notFound();
    const row = orders.forShopper(str((req.body || {}).orderId), tokenOf(req));
    if (row.provider !== 'demo') throw badRequest('Start the payment first.');
    orders.markPaid(row.id, { actor: 'demo', detail: 'Simulated payment (demo mode, no money moved)' });
    res.json({ order: orders.view(orders.get(row.id)) });
  });

  r.post('/orders/:id/reference', limits.pay, (req, res) => {
    let row = orders.forShopper(req.params.id, tokenOf(req));
    const b = req.body || {};
    const method = validate.method(b.method);
    if (providerFor(method) !== 'manual') throw badRequest('This payment method is confirmed automatically.');
    const reference = validate.paymentReference(method, b.reference);
    row = orders.submitReference(row, method, reference);
    res.json({ order: orders.view(row) });
  });

  r.post('/orders/:id/downloads/:productId', limits.downloads, (req, res) => {
    const row = orders.forShopper(req.params.id, tokenOf(req));
    res.json({ url: downloads.issue(row, req.params.productId) });
  });

  r.get('/downloads/:token', limits.downloads, (req, res, next) => {
    const { file, filename } = downloads.redeem(req.params.token);
    res.download(file, filename, { headers: { 'Cache-Control': 'no-store' }, dotfiles: 'deny' }, (err) => { if (err && !res.headersSent) next(err); });
  });

  return r;
}

module.exports = { shopRoutes };
