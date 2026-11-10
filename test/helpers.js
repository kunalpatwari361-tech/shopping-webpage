'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadConfig } = require('../server/config');
const { openDb } = require('../server/db');
const { loadCatalog } = require('../server/catalog');
const { createApp } = require('../server/app');

const catalog = loadCatalog(path.join(__dirname, '..', 'public'));
const products = [...catalog.products.values()];
const gear = products.find((p) => !p.digital);
const cheapGear = products.filter((p) => !p.digital).sort((a, b) => a.price - b.price)[0];
const maps = products.filter((p) => p.digital);
const map = maps[0];

const customer = {
  name: 'Test Shopper', phone: '9876543210', email: 'shopper@example.com',
  line1: '12 Marine Drive', city: 'Mumbai', state: 'Maharashtra', pincode: '400001'
};

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

/** Start a server on a random port with an in-memory database. */
async function start({ env = {}, razorpay = null, files = [] } = {}) {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-dl-'));
  for (const id of files) fs.writeFileSync(path.join(downloadDir, `${id}.zip`), `zip-bytes-${id}`);
  const config = Object.assign(loadConfig({ ...env }), { dbFile: ':memory:', downloadDir, logRequests: false });
  const db = openDb(':memory:');
  const quiet = { info() {}, warn() {}, error() {} };
  const { app, orders } = createApp({ config, db, catalog, razorpay, log: quiet });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function req(method, p, { body, token, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (token) h['x-order-token'] = token;
    let payload;
    if (raw !== undefined) payload = raw;
    else if (body !== undefined) { h['content-type'] = h['content-type'] || 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + p, { method, headers: h, body: payload, redirect: 'manual' });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json };
  }

  async function placeOrder(items = [{ id: gear.id, qty: 1 }], extra = {}) {
    const r = await req('POST', '/api/orders', { body: { items, customer, ...extra } });
    if (r.status !== 201) throw new Error(`order failed: ${r.status} ${r.text}`);
    return { id: r.json.order.id, token: r.json.token, order: r.json.order };
  }

  async function close() {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    db.close();
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }

  return { base, req, placeOrder, close, db, config, orders, downloadDir };
}

module.exports = { start, catalog, gear, cheapGear, map, maps, customer, hmac };
