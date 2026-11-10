/* ============================================================
   Admin API (shop owner), used by public/admin.html
     POST /api/admin/login              { password } -> session token
     POST /api/admin/logout
     GET  /api/admin/summary
     GET  /api/admin/orders?status=&q=&offset=
     GET  /api/admin/orders/:id
     POST /api/admin/orders/:id/status  { status, note }
   Every call except login needs "Authorization: Bearer <token>".
   Switched off entirely unless ADMIN_PASSWORD (12+ characters) is set.
   ============================================================ */
'use strict';
const fs = require('node:fs');
const express = require('express');
const { newToken, sha256, safeEqual } = require('../security');
const { HttpError, badRequest, notFound } = require('../errors');
const { LABELS } = require('../orders');

const VIEWS = {
  action: "status IN ('pending_verification','paid')",
  pending_verification: "status = 'pending_verification'",
  paid: "status = 'paid'",
  shipped: "status = 'shipped'",
  delivered: "status = 'delivered'",
  awaiting_payment: "status = 'awaiting_payment'",
  cancelled: "status = 'cancelled'",
  all: '1 = 1'
};

function adminRoutes({ db, config, catalog, orders, limits }) {
  const r = express.Router();
  const q = {
    addSession: db.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)'),
    getSession: db.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?'),
    dropSession: db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?'),
    dropOld: db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?'),
    counts: db.prepare('SELECT status, COUNT(*) AS n, COALESCE(SUM(total), 0) AS amount FROM orders GROUP BY status'),
    paidToday: db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS amount FROM orders WHERE paid_at >= ? AND status IN ('paid','shipped','delivered')")
  };

  r.use((req, res, next) => (config.admin.enabled ? next() : next(notFound())));

  r.post('/login', limits.login, (req, res) => {
    const password = typeof (req.body || {}).password === 'string' ? req.body.password : '';
    if (!safeEqual(password, config.admin.password)) throw new HttpError(401, 'Wrong password.');
    const token = newToken();
    const at = new Date();
    const expires = new Date(at.getTime() + config.admin.sessionHours * 3600e3).toISOString();
    q.dropOld.run(at.toISOString());
    q.addSession.run(sha256(token), at.toISOString(), expires);
    res.json({ token, expiresAt: expires });
  });

  // Everything below needs a valid session.
  r.use((req, res, next) => {
    const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.get('authorization') || '');
    const s = m && q.getSession.get(sha256(m[1]));
    if (!s || s.expires_at < new Date().toISOString()) return next(new HttpError(401, 'Please log in again.'));
    req.adminTokenHash = sha256(m[1]);
    next();
  });

  r.post('/logout', (req, res) => {
    q.dropSession.run(req.adminTokenHash);
    res.json({ ok: true });
  });

  r.get('/summary', (req, res) => {
    const byStatus = Object.fromEntries(Object.keys(LABELS).map((s) => [s, { count: 0, amount: 0 }]));
    for (const row of q.counts.all()) byStatus[row.status] = { count: row.n, amount: row.amount };
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const today = q.paidToday.get(midnight.toISOString());
    const missingFiles = [...catalog.products.values()].filter((p) => p.digital && !fs.existsSync(orders.fileFor(p.id))).map((p) => ({ id: p.id, name: p.name }));
    const warnings = [];
    if (config.paymentMode === 'demo') warnings.push('Demo payments are on. No real money is taken. Add your Razorpay keys to .env to go live.');
    if (config.paymentMode === 'razorpay' && config.razorpay.keyId.startsWith('rzp_test_')) warnings.push('Razorpay is in test mode. Switch to live keys to take real payments.');
    if (config.paymentMode === 'razorpay' && !config.razorpay.webhookSecret) warnings.push('Set RAZORPAY_WEBHOOK_SECRET so payments are confirmed even when a shopper closes the page.');
    if (/X{4}/.test(String(catalog.bank.accountNumber || ''))) warnings.push('Bank transfer still shows placeholder account details. Edit bank in public/js/config.js.');
    if (missingFiles.length) warnings.push(`${missingFiles.length} racing map file(s) are missing from private/downloads.`);
    res.json({
      byStatus,
      today: { count: today.n, amount: today.amount },
      paymentMode: config.paymentMode,
      missingFiles,
      warnings,
      labels: LABELS
    });
  });

  r.get('/orders', (req, res) => {
    const view = Object.prototype.hasOwnProperty.call(VIEWS, req.query.status) ? req.query.status : 'action';
    const offset = Math.max(0, Math.min(100000, Number.parseInt(req.query.offset, 10) || 0));
    const term = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const params = [];
    let where = VIEWS[view];
    if (term) {
      const like = `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      where += " AND (id LIKE ? ESCAPE '\\' OR customer_json LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\')";
      params.push(like, like, like);
    }
    const rows = db.prepare(`SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT 51 OFFSET ?`).all(...params, offset);
    res.json({
      view,
      orders: rows.slice(0, 50).map((row) => {
        const c = JSON.parse(row.customer_json);
        return {
          id: row.id, createdAt: row.created_at, status: row.status, statusLabel: LABELS[row.status],
          method: row.method, provider: row.provider, total: row.total, reference: row.reference,
          name: c.name, phone: c.phone, city: c.city || null, digital: !!row.has_digital, physical: !!row.has_physical
        };
      }),
      more: rows.length > 50
    });
  });

  r.get('/orders/:id', (req, res) => {
    const row = orders.get(String(req.params.id).slice(0, 20));
    if (!row) throw notFound('Order not found.');
    res.json({ order: orders.adminView(row) });
  });

  r.post('/orders/:id/status', (req, res) => {
    const b = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(LABELS, b.status)) throw badRequest('Unknown status.');
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) : '';
    const row = orders.adminSetStatus(String(req.params.id).slice(0, 20), b.status, note);
    res.json({ order: orders.adminView(row) });
  });

  return r;
}

module.exports = { adminRoutes };
