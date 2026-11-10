/* ============================================================
   Racing map downloads.
   Map files live in private/downloads/<product-id>.zip, outside the
   website folder, so nobody can fetch them directly. A shopper with
   a paid order gets a one-time link that works for 10 minutes.
   ============================================================ */
'use strict';
const fs = require('node:fs');
const { newToken, sha256 } = require('./security');
const { HttpError, notFound } = require('./errors');

const LINK_MINUTES = 10;

function createDownloads({ db, orders }) {
  const q = {
    insert: db.prepare('INSERT INTO download_tokens (token_hash, order_id, product_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'),
    // Used downloads plus links that are still live both count towards the limit.
    taken: db.prepare('SELECT COUNT(*) AS n FROM download_tokens WHERE order_id = ? AND product_id = ? AND (used_at IS NOT NULL OR expires_at > ?)'),
    use: db.prepare('UPDATE download_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?'),
    find: db.prepare('SELECT order_id, product_id FROM download_tokens WHERE token_hash = ?')
  };

  function issue(row, productId) {
    if (!orders.PAID.includes(row.status)) throw new HttpError(403, 'Downloads open as soon as your payment is confirmed.');
    const item = JSON.parse(row.items_json).find((i) => i.id === productId && i.digital);
    if (!item) throw notFound('This order has no such download.');
    const state = orders.downloadState(row, productId);
    if (!state.fileReady) throw new HttpError(409, 'This map is still being prepared. We will email it to you, or contact us with your order number.');
    if (!(state.until > new Date().toISOString())) throw new HttpError(410, 'The download period for this order has ended. Contact us with your order number.');
    const at = new Date();
    if (q.taken.get(row.id, productId, at.toISOString()).n >= state.limit) {
      throw new HttpError(429, `You've used all ${state.limit} downloads for this map. Contact us if you need another.`);
    }
    const token = newToken();
    q.insert.run(sha256(token), row.id, productId, at.toISOString(), new Date(at.getTime() + LINK_MINUTES * 60e3).toISOString());
    return `/api/downloads/${token}`;
  }

  /** Spend a one-time link. Returns the file to send. */
  function redeem(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound('Download link not found.');
    const hash = sha256(token);
    const at = new Date().toISOString();
    if (q.use.run(at, hash, at).changes !== 1) throw new HttpError(410, 'This download link has expired. Open your order again to get a new one.');
    const rec = q.find.get(hash);
    const file = orders.fileFor(rec.product_id);
    if (!fs.existsSync(file)) throw new HttpError(410, 'This file is not available right now. Please contact us.');
    const row = orders.get(rec.order_id);
    const item = JSON.parse(row.items_json).find((i) => i.id === rec.product_id);
    orders.log(rec.order_id, 'shopper', 'downloaded', rec.product_id);
    const nice = (item ? item.name : rec.product_id).replace(/[^A-Za-z0-9 -]/g, '').trim().replace(/\s+/g, '-') || 'map';
    return { file, filename: `${nice}.zip` };
  }

  return { issue, redeem };
}

module.exports = { createDownloads, LINK_MINUTES };
