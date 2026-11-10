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
    staleUnpaid: db.prepare("SELECT id FROM orders WHERE status = 'awaiting_payment' AND created_at < ?")
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

  /* ---------- what the shop owner sees ---------- */
  function adminView(row) {
    return Object.assign(view(row), {
      customer: JSON.parse(row.customer_json),
      gatewayOrderId: row.gateway_order_id,
      gatewayPaymentId: row.gateway_payment_id,
      updatedAt: row.updated_at,
      nextStatuses: ADMIN_MOVES[row.status] || [],
      events: q.events.all(row.id)
    });
  }

  return {
    create, forShopper, get, byGatewayOrder, choosePayment, setGatewayOrder, markPaid, submitReference,
    adminSetStatus, expireUnpaid, view, adminView, downloadState, fileFor, log, PAID, LABELS
  };
}

module.exports = { createOrderService, LABELS, ADMIN_MOVES, PAID };
