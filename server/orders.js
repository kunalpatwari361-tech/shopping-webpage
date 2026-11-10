/* ============================================================
   Orders: create, look up, take payment, change status.
   Every change is written to order_events so there is a full
   history of who did what and when.
   ============================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { tx } = require('./db');
const { newToken, sha256, safeEqual, newOrderId } = require('./security');
const { HttpError, notFound } = require('./errors');

const PAID = ['paid', 'shipped', 'delivered'];
const LABELS = {
  awaiting_payment: 'Awaiting payment',
  pending_verification: 'Pending verification',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};
// What the shop owner may change an order to from the admin panel.
const ADMIN_MOVES = {
  awaiting_payment: ['paid', 'cancelled'],
  pending_verification: ['paid', 'cancelled'],
  paid: ['shipped', 'delivered', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: []
};

const now = () => new Date().toISOString();

/* Problems the shop owner should look at. Each is worked out from the
   order itself, so it disappears on its own once the order moves on,
   or when the owner marks it as handled. */
const VERIFY_HOURS = 24;
const SHIP_DAYS = 3;
const ISSUES = {
  amount_mismatch: { label: 'Payment amount did not match', help: 'Razorpay reported a payment that does not match this order. Check it in your Razorpay dashboard and refund it if needed.' },
  verify_failed: { label: 'Payment could not be confirmed', help: 'The payment proof sent from the browser did not check out. Look the order up in Razorpay before shipping anything.' },
  payment_failed: { label: 'Payment failed', help: 'The buyer tried to pay but the payment was declined. They may need help paying.' },
  slow_check: { label: `Payment check waiting over ${VERIFY_HOURS} hours`, help: 'Find this reference in your bank or UPI app, then mark the order paid or cancel it.' },
  late_shipping: { label: `Not shipped ${SHIP_DAYS}+ days after payment`, help: 'Ship it and mark it shipped, or contact the buyer about the delay.' },
  file_missing: { label: 'Map file missing', help: "The buyer paid but can't download. Upload the file under Racing maps." },
  refund_due: { label: 'Cancelled after payment', help: 'Refund the buyer, then mark this as handled.' }
};
const PROBLEM_EVENTS = ['amount_mismatch', 'verify_failed', 'payment_failed'];

function createOrderService({ db, catalog, config }) {
  const q = {
    insert: db.prepare(`INSERT INTO orders
      (id, created_at, updated_at, status, customer_json, items_json, subtotal, discount, shipping, total, coupon, has_digital, has_physical, access_hash)
      VALUES (:id, :at, :at, 'awaiting_payment', :customer, :items, :sub, :discount, :shipping, :total, :coupon, :digital, :physical, :hash)`),
    get: db.prepare('SELECT * FROM orders WHERE id = ?'),
    byGatewayOrder: db.prepare('SELECT * FROM orders WHERE gateway_order_id = ?'),
    setMethod: db.prepare("UPDATE orders SET method = ?, provider = ?, updated_at = ? WHERE id = ? AND status = 'awaiting_payment'"),
    setGateway: db.prepare('UPDATE orders SET gateway_order_id = ?, updated_at = ? WHERE id = ? AND gateway_order_id IS NULL'),
    setStatus: db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?'),
    setPaid: db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, updated_at = ?, gateway_payment_id = COALESCE(?, gateway_payment_id) WHERE id = ?"),
    setReference: db.prepare("UPDATE orders SET status = 'pending_verification', method = ?, provider = 'manual', reference = ?, updated_at = ? WHERE id = ? AND status = 'awaiting_payment'"),
    event: db.prepare('INSERT INTO order_events (order_id, at, actor, type, detail) VALUES (?, ?, ?, ?, ?)'),
    events: db.prepare('SELECT at, actor, type, detail FROM order_events WHERE order_id = ? ORDER BY id'),
    usedDownloads: db.prepare('SELECT COUNT(*) AS n FROM download_tokens WHERE order_id = ? AND product_id = ? AND used_at IS NOT NULL'),
    staleUnpaid: db.prepare("SELECT id FROM orders WHERE status = 'awaiting_payment' AND created_at < ?"),
    problems: db.prepare(`SELECT type, MAX(at) AS at, MAX(detail) AS detail FROM order_events
      WHERE order_id = ? AND type IN ('amount_mismatch','verify_failed','payment_failed') GROUP BY type`),
    issueCandidates: db.prepare(`SELECT * FROM orders o WHERE
         (status = 'pending_verification' AND updated_at < :verifyCut)
      OR (status = 'paid' AND has_physical = 1 AND paid_at < :shipCut)
      OR (status = 'cancelled' AND paid_at IS NOT NULL)
      OR (status IN ('paid','shipped','delivered') AND has_digital = 1 AND paid_at > :downloadCut)
      OR EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id
                 AND (e.type = 'amount_mismatch' OR (o.status = 'awaiting_payment' AND e.type IN ('verify_failed','payment_failed'))))
      ORDER BY created_at DESC`),
    clearIssues: db.prepare('UPDATE orders SET issues_cleared_at = ? WHERE id = ?'),
    statusCounts: db.prepare('SELECT status, has_physical, COUNT(*) AS n, COALESCE(SUM(total), 0) AS amount FROM orders GROUP BY status, has_physical'),
    paidSince: db.prepare("SELECT paid_at, total FROM orders WHERE paid_at >= ? AND status IN ('paid','shipped','delivered')"),
    paidAll: db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS amount FROM orders WHERE status IN ('paid','shipped','delivered')")
  };

  const log = (orderId, actor, type, detail) => q.event.run(orderId, now(), actor, type, detail == null ? null : String(detail).slice(0, 500));

  function create(quote, customer) {
    const id = newOrderId();
    const token = newToken();
    const at = now();
    tx(db, () => {
      q.insert.run({
        id, at,
        customer: JSON.stringify(customer),
        items: JSON.stringify(quote.lines),
        sub: quote.sub, discount: quote.discount, shipping: quote.shipping, total: quote.total,
        coupon: quote.coupon,
        digital: quote.digital ? 1 : 0, physical: quote.physical ? 1 : 0,
        hash: sha256(token)
      });
      log(id, 'shopper', 'created', `Total ₹${quote.total}`);
    });
    return { row: q.get.get(id), token };
  }

  /** Look up an order for a shopper. A wrong token looks exactly like a missing order. */
  function forShopper(id, token) {
    const row = typeof id === 'string' && id.length <= 20 ? q.get.get(id) : null;
    if (!row || typeof token !== 'string' || !safeEqual(sha256(token), row.access_hash)) throw notFound('Order not found.');
    return row;
  }

  const get = (id) => q.get.get(id) || null;
  const byGatewayOrder = (gid) => q.byGatewayOrder.get(gid) || null;

  function requireUnpaid(row) {
    if (PAID.includes(row.status)) throw new HttpError(409, 'This order is already paid.');
    if (row.status === 'pending_verification') throw new HttpError(409, 'We already have your payment reference and are checking it.');
    if (row.status !== 'awaiting_payment') throw new HttpError(409, 'This order can no longer be paid. Please start a new checkout.');
  }

  function choosePayment(row, method, provider) {
    requireUnpaid(row);
    q.setMethod.run(method, provider, now(), row.id);
    log(row.id, 'shopper', 'payment_started', `${method} via ${provider}`);
    return q.get.get(row.id);
  }

  function setGatewayOrder(row, gatewayOrderId) {
    q.setGateway.run(gatewayOrderId, now(), row.id);
    return q.get.get(row.id);
  }

  /** Mark paid. Safe to call twice (webhook and browser may both report the same payment). */
  function markPaid(id, { actor, paymentId = null, detail = null }) {
    return tx(db, () => {
      const row = q.get.get(id);
      if (!row) throw notFound('Order not found.');
      if (PAID.includes(row.status)) return { row, changed: false };
      q.setPaid.run(now(), now(), paymentId, id);
      log(id, actor, 'paid', detail || (row.status === 'cancelled' ? 'Payment arrived after the order was cancelled' : null));
      return { row: q.get.get(id), changed: true };
    });
  }

  function submitReference(row, method, reference) {
    requireUnpaid(row);
    q.setReference.run(method, reference, now(), row.id);
    log(row.id, 'shopper', 'reference_submitted', `${method}: ${reference}`);
    return q.get.get(row.id);
  }

  function adminSetStatus(id, status, note) {
    return tx(db, () => {
      const row = q.get.get(id);
      if (!row) throw notFound('Order not found.');
      if (!(ADMIN_MOVES[row.status] || []).includes(status)) {
        throw new HttpError(409, `An order that is "${LABELS[row.status]}" can't be changed to "${LABELS[status] || status}".`);
      }
      if (status === 'paid') {
        q.setPaid.run(now(), now(), null, id);
      } else {
        q.setStatus.run(status, now(), id);
      }
      log(id, 'admin', status, note || null);
      return q.get.get(id);
    });
  }

  /** Cancel orders nobody paid for after a while (they never reserved stock). */
  function expireUnpaid() {
    const cutoff = new Date(Date.now() - config.unpaidOrderHours * 3600e3).toISOString();
    const ids = q.staleUnpaid.all(cutoff).map((r) => r.id);
    for (const id of ids) {
      tx(db, () => { q.setStatus.run('cancelled', now(), id); log(id, 'system', 'cancelled', 'Not paid in time'); });
    }
    return ids.length;
  }

  /* ---------- downloads (racing maps) ---------- */
  const fileFor = (productId) => path.join(config.downloadDir, `${productId}.zip`);
  function downloadState(row, productId) {
    const used = q.usedDownloads.get(row.id, productId).n;
    const until = row.paid_at ? new Date(Date.parse(row.paid_at) + config.downloadDays * 86400e3).toISOString() : null;
    const fileReady = fs.existsSync(fileFor(productId));
    const open = !!until && until > now();
    return { used, limit: config.downloadLimit, until, fileReady, available: fileReady && open && used < config.downloadLimit };
  }

  /* ---------- what the shopper sees ---------- */
  function view(row) {
    const items = JSON.parse(row.items_json);
    const c = JSON.parse(row.customer_json);
    const paid = PAID.includes(row.status);
    return {
      id: row.id,
      createdAt: row.created_at,
      status: row.status,
      statusLabel: LABELS[row.status],
      paid,
      method: row.method,
      provider: row.provider,
      items: items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, total: i.total, digital: i.digital, size: i.size })),
      sub: row.subtotal,
      discount: row.discount,
      shipping: row.shipping,
      total: row.total,
      coupon: row.coupon,
      digital: !!row.has_digital,
      physical: !!row.has_physical,
      deliverTo: row.has_physical ? `${c.name}, ${c.city}` : null,
      email: c.email || null,
      reference: row.reference,
      paidAt: row.paid_at,
      downloads: paid ? items.filter((i) => i.digital).map((i) => ({ productId: i.id, name: i.name, ...downloadState(row, i.id) })) : []
    };
  }

  /* ---------- issues ---------- */
  function issuesOf(row) {
    const cleared = row.issues_cleared_at || '';
    const found = [];
    const add = (type, since, extra) => {
      if (since && since > cleared) found.push(Object.assign({ type, since }, ISSUES[type], extra));
    };
    const t = Date.now();
    for (const e of q.problems.all(row.id)) {
      if (e.type === 'amount_mismatch' || row.status === 'awaiting_payment') add(e.type, e.at, e.detail ? { detail: e.detail } : null);
    }
    if (row.status === 'pending_verification' && Date.parse(row.updated_at) < t - VERIFY_HOURS * 3600e3) add('slow_check', row.updated_at);
    if (row.status === 'paid' && row.has_physical && row.paid_at && Date.parse(row.paid_at) < t - SHIP_DAYS * 86400e3) add('late_shipping', row.paid_at);
    if (PAID.includes(row.status) && row.has_digital && row.paid_at && Date.parse(row.paid_at) > t - config.downloadDays * 86400e3) {
      const missing = JSON.parse(row.items_json).filter((i) => i.digital && !fs.existsSync(fileFor(i.id)));
      if (missing.length) add('file_missing', row.paid_at, { detail: missing.map((i) => i.name).join(', ') });
    }
    if (row.status === 'cancelled' && row.paid_at) add('refund_due', row.updated_at);
    return found;
  }

  /** Every order with at least one open issue, newest first. */
  function withIssues() {
    const t = Date.now();
    const rows = q.issueCandidates.all({
      verifyCut: new Date(t - VERIFY_HOURS * 3600e3).toISOString(),
      shipCut: new Date(t - SHIP_DAYS * 86400e3).toISOString(),
      downloadCut: new Date(t - config.downloadDays * 86400e3).toISOString()
    });
    return rows.map((row) => ({ row, issues: issuesOf(row) })).filter((x) => x.issues.length);
  }

  function resolveIssues(id, note) {
    return tx(db, () => {
      const row = q.get.get(id);
      if (!row) throw notFound('Order not found.');
      if (!issuesOf(row).length) throw new HttpError(409, 'This order has no open issues.');
      q.clearIssues.run(now(), id);
      log(id, 'admin', 'issue_handled', note || null);
      return q.get.get(id);
    });
  }

  /* ---------- numbers for the admin overview ---------- */
  function stats() {
    const s = { completed: 0, toShip: 0, checkPayment: 0, shipped: 0, notPaid: 0, cancelled: 0, placed: 0 };
    for (const r of q.statusCounts.all()) {
      if (r.status === 'delivered' || (r.status === 'paid' && !r.has_physical)) s.completed += r.n;
      else if (r.status === 'paid') s.toShip += r.n;
      else if (r.status === 'pending_verification') s.checkPayment += r.n;
      else if (r.status === 'shipped') s.shipped += r.n;
      else if (r.status === 'awaiting_payment') s.notPaid += r.n;
      else if (r.status === 'cancelled') s.cancelled += r.n;
      if (r.status !== 'awaiting_payment') s.placed += r.n;
    }
    s.inProgress = s.checkPayment + s.toShip + s.shipped;
    s.issues = withIssues().length;
    return s;
  }

  /** Paid orders and sales per day for the given day keys. */
  function salesByDay(days, dayOf) {
    const by = new Map(days.map((d) => [d, { orders: 0, sales: 0 }]));
    const since = new Date(Date.now() - (days.length + 1) * 86400e3).toISOString();
    for (const r of q.paidSince.all(since)) {
      const b = by.get(dayOf(new Date(r.paid_at)));
      if (b) { b.orders += 1; b.sales += r.total; }
    }
    const all = q.paidAll.get();
    return { byDay: by, allTime: { count: all.n, amount: all.amount } };
  }

  /* ---------- what the shop owner sees ---------- */
  function adminView(row) {
    return Object.assign(view(row), {
      customer: JSON.parse(row.customer_json),
      gatewayOrderId: row.gateway_order_id,
      gatewayPaymentId: row.gateway_payment_id,
      updatedAt: row.updated_at,
      // Downloads have nothing to ship.
      nextStatuses: (ADMIN_MOVES[row.status] || []).filter((s) => s !== 'shipped' || row.has_physical),
      issues: issuesOf(row),
      events: q.events.all(row.id)
    });
  }

  return {
    create, forShopper, get, byGatewayOrder, choosePayment, setGatewayOrder, markPaid, submitReference,
    adminSetStatus, expireUnpaid, view, adminView, downloadState, fileFor, log,
    issuesOf, withIssues, resolveIssues, stats, salesByDay, PAID, LABELS
  };
}

module.exports = { createOrderService, LABELS, ADMIN_MOVES, PAID, ISSUES };
