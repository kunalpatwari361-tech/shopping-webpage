/* ============================================================
   Admin API (shop owner), used by public/admin.html
     POST /api/admin/login                      { password } -> session token
     POST /api/admin/logout
     GET  /api/admin/overview                   orders, sales, visitors, warnings
     GET  /api/admin/orders?status=&q=&offset=
     GET  /api/admin/orders/:id
     POST /api/admin/orders/:id/status          { status, note }
     POST /api/admin/orders/:id/issues/handled  { note }
     GET  /api/admin/products                   racing maps + form options
     POST /api/admin/products                   add a map
     POST /api/admin/products/:id               edit a map added here
     POST /api/admin/products/:id/visibility    { active }
     PUT  /api/admin/products/:id/file          upload the map's .zip (raw body)
   Every call except login needs "Authorization: Bearer <token>".
   Switched off entirely unless ADMIN_PASSWORD (12+ characters) is set.
   ============================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const express = require('express');
const { newToken, sha256, safeEqual } = require('../security');
const { HttpError, badRequest, notFound } = require('../errors');
const { LABELS } = require('../orders');

const VIEWS = {
  action: "(status = 'pending_verification' OR (status = 'paid' AND has_physical = 1))",
  pending_verification: "status = 'pending_verification'",
  paid: "status = 'paid' AND has_physical = 1",
  shipped: "status = 'shipped'",
  completed: "(status = 'delivered' OR (status = 'paid' AND has_physical = 0))",
  awaiting_payment: "status = 'awaiting_payment'",
  cancelled: "status = 'cancelled'",
  all: '1 = 1'
};
const PAGE = 50;
const ID_RE = /^[a-z0-9-]{1,64}$/;

function adminRoutes({ db, config, catalog, orders, products, analytics, limits }) {
  const r = express.Router();
  const q = {
    addSession: db.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)'),
    getSession: db.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?'),
    dropSession: db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?'),
    dropOld: db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?')
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

  /* ---------- overview ---------- */
  r.get('/overview', (req, res) => {
    const visits = analytics.summary(30);
    const days = visits.series.map((d) => d.day);
    const sales = orders.salesByDay(days, analytics.dayOf);
    const series = visits.series.map((d) => Object.assign({}, d, sales.byDay.get(d.day)));
    const total = (k, last) => series.slice(-last).reduce((s, d) => s + d[k], 0);
    const period = (last) => ({ count: total('orders', last), amount: total('sales', last) });

    const maps = products.list().filter((p) => p.active);
    const missingFiles = maps.filter((p) => !p.file.ready).map((p) => ({ id: p.id, name: p.name }));
    const warnings = [];
    if (config.paymentMode === 'demo') warnings.push('Test mode is on: UPI and card payments are simulated and no money is taken. Add your Razorpay keys to .env to go live.');
    if (config.paymentMode === 'razorpay' && config.razorpay.keyId.startsWith('rzp_test_')) warnings.push('Razorpay is in test mode. Switch to live keys to take real payments.');
    if (config.paymentMode === 'razorpay' && !config.razorpay.webhookSecret) warnings.push('Set RAZORPAY_WEBHOOK_SECRET so payments are confirmed even when a shopper closes the page.');
    if (/X{4}/.test(String(catalog.bank.accountNumber || ''))) warnings.push('Bank transfer still shows placeholder account details. Edit bank in public/js/config.js.');
    if (missingFiles.length) warnings.push(`${missingFiles.length} racing map${missingFiles.length === 1 ? ' has' : 's have'} no file yet, so buyers can't download ${missingFiles.length === 1 ? 'it' : 'them'}. Upload files under Racing maps.`);

    res.json({
      orders: orders.stats(),
      sales: { today: period(1), week: period(7), month: period(30), allTime: sales.allTime },
      visitors: {
        enabled: config.countVisitors,
        today: visits.today, week: visits.week, month: visits.month,
        topPages: visits.topPages, topSources: visits.topSources
      },
      // Share of visitors who bought something in the last 30 days.
      conversion: visits.month.visitors ? Math.round((period(30).count / visits.month.visitors) * 1000) / 10 : null,
      series,
      paymentMode: config.paymentMode,
      maps: { total: maps.length, missingFiles },
      warnings,
      labels: LABELS
    });
  });

  /* ---------- orders ---------- */
  function listRow(row, issues) {
    const c = JSON.parse(row.customer_json);
    return {
      id: row.id, createdAt: row.created_at, status: row.status, statusLabel: LABELS[row.status],
      method: row.method, provider: row.provider, total: row.total, reference: row.reference,
      name: c.name, phone: c.phone, city: c.city || null, digital: !!row.has_digital, physical: !!row.has_physical,
      issues: (issues || orders.issuesOf(row)).map((i) => i.label)
    };
  }

  r.get('/orders', (req, res) => {
    const view = req.query.status === 'issues' || Object.prototype.hasOwnProperty.call(VIEWS, req.query.status) ? req.query.status : 'action';
    const offset = Math.max(0, Math.min(100000, Number.parseInt(req.query.offset, 10) || 0));
    const term = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';

    if (view === 'issues') {
      const needle = term.toLowerCase();
      const all = orders.withIssues().filter(({ row }) => !needle
        || row.id.toLowerCase().includes(needle) || row.customer_json.toLowerCase().includes(needle) || String(row.reference || '').toLowerCase().includes(needle));
      return res.json({ view, orders: all.slice(offset, offset + PAGE).map(({ row, issues }) => listRow(row, issues)), more: all.length > offset + PAGE });
    }

    const params = [];
    let where = VIEWS[view];
    if (term) {
      const like = `%${term.replace(/[\\%_]/g, (ch) => '\\' + ch)}%`;
      where += " AND (id LIKE ? ESCAPE '\\' OR customer_json LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\')";
      params.push(like, like, like);
    }
    const rows = db.prepare(`SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT ${PAGE + 1} OFFSET ?`).all(...params, offset);
    res.json({ view, orders: rows.slice(0, PAGE).map((row) => listRow(row)), more: rows.length > PAGE });
  });

  r.get('/orders/:id', (req, res) => {
    const row = orders.get(String(req.params.id).slice(0, 20));
    if (!row) throw notFound('Order not found.');
    res.json({ order: orders.adminView(row) });
  });

  const noteOf = (b) => (typeof b.note === 'string' ? b.note.trim().slice(0, 300) : '');

  r.post('/orders/:id/status', (req, res) => {
    const b = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(LABELS, b.status)) throw badRequest('Unknown status.');
    const row = orders.adminSetStatus(String(req.params.id).slice(0, 20), b.status, noteOf(b));
    res.json({ order: orders.adminView(row) });
  });

  r.post('/orders/:id/issues/handled', (req, res) => {
    const row = orders.resolveIssues(String(req.params.id).slice(0, 20), noteOf(req.body || {}));
    res.json({ order: orders.adminView(row) });
  });

  /* ---------- racing maps ---------- */
  r.get('/products', (req, res) => {
    res.json({
      products: products.list(),
      options: {
        sizes: catalog.sizes,
        categories: products.options.digitalCats.map((id) => ({ id, name: catalog.categories.get(id).name })),
        arts: products.options.arts,
        tags: products.options.tags,
        modes: products.options.modes,
        uploadMaxMb: config.uploadMaxMb
      }
    });
  });

  const productOut = (id) => products.list().find((p) => p.id === id);
  const productId = (req) => {
    const id = String(req.params.id);
    if (!ID_RE.test(id)) throw notFound('Map not found.');
    return id;
  };

  r.post('/products', (req, res) => {
    const id = products.create(req.body);
    res.status(201).json({ product: productOut(id) });
  });

  r.post('/products/:id', (req, res) => {
    const id = products.update(productId(req), req.body);
    res.json({ product: productOut(id) });
  });

  r.post('/products/:id/visibility', (req, res) => {
    const id = products.setActive(productId(req), (req.body || {}).active === true);
    res.json({ product: productOut(id) });
  });

  // The map file. Streamed to disk, checked to be a real .zip, then swapped in.
  r.put('/products/:id/file', async (req, res) => {
    const id = productId(req);
    if (!products.isDigital(id)) throw notFound('Map not found.');
    const max = config.uploadMaxMb * 1024 * 1024;
    const declared = Number(req.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0) throw new HttpError(411, 'Choose a file to upload.');
    if (declared > max) throw new HttpError(413, `That file is too big. The limit is ${config.uploadMaxMb} MB (UPLOAD_MAX_MB).`);

    fs.mkdirSync(config.downloadDir, { recursive: true });
    const tmp = path.join(config.downloadDir, `.upload-${newToken(9)}.part`);
    let bytes = 0;
    let head = Buffer.alloc(0);
    const guard = new Transform({
      transform(chunk, enc, cb) {
        bytes += chunk.length;
        if (head.length < 4) head = Buffer.concat([head, chunk]).subarray(0, 4);
        if (bytes > max) return cb(new HttpError(413, `That file is too big. The limit is ${config.uploadMaxMb} MB.`));
        cb(null, chunk);
      }
    });
    try {
      await pipeline(req, guard, fs.createWriteStream(tmp, { flags: 'wx' }));
      // Every .zip starts with "PK\x03\x04".
      if (bytes < 22 || head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
        throw badRequest('That is not a .zip file. Zip the map files first, then upload the .zip.');
      }
      fs.renameSync(tmp, orders.fileFor(id));
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    res.json({ product: productOut(id) });
  });

  return r;
}

module.exports = { adminRoutes, VIEWS };
