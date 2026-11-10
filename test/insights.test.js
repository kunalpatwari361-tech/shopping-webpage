'use strict';
// Admin panel: visitor counts, order issues, adding racing maps and uploading their files.
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, gear, map, maps, customer, PUBLIC } = require('./helpers');
const { loadCatalog } = require('../server/catalog');
const { createProductStore } = require('../server/products');

const PASSWORD = 'correct-horse-battery-staple';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36';
const PHONE = 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36';
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200, 7)]);

async function admin(env = {}, opts = {}) {
  const s = await start({ env: { ADMIN_PASSWORD: PASSWORD, ...env }, ...opts });
  const { json } = await s.req('POST', '/api/admin/login', { body: { password: PASSWORD } });
  const h = { authorization: `Bearer ${json.token}` };
  s.get = (p) => s.req('GET', `/api/admin${p}`, { headers: h });
  s.post = (p, body = {}) => s.req('POST', `/api/admin${p}`, { headers: h, body });
  s.upload = (id, data, type = 'application/zip', extra = {}) => s.req('PUT', `/api/admin/products/${id}/file`, { headers: { ...h, 'content-type': type, ...extra }, raw: data });
  s.visit = (body, headers = {}) => s.req('POST', '/api/visit', { body, headers: { 'user-agent': BROWSER, ...headers } });
  return s;
}

/** Bank transfer submitted, then confirmed by the owner. */
async function paidByBank(s, items) {
  const o = await s.placeOrder(items);
  await s.req('POST', `/api/orders/${o.id}/reference`, { token: o.token, body: { method: 'bank', reference: `UTR${Date.now()}${Math.floor(Math.random() * 1e3)}`.slice(0, 15) } });
  const r = await s.post(`/orders/${o.id}/status`, { status: 'paid' });
  assert.equal(r.status, 200, r.text);
  return o;
}
async function paidByDemo(s, items) {
  const o = await s.placeOrder(items);
  await s.req('POST', `/api/orders/${o.id}/pay`, { token: o.token, body: { method: 'gpay' } });
  const r = await s.req('POST', '/api/payments/demo/confirm', { token: o.token, body: { orderId: o.id } });
  assert.equal(r.json.order.status, 'paid');
  return o;
}

/* ---------- visitors ---------- */
test('visitors: counted once a day, bots and do-not-track ignored, no IPs kept', async (t) => {
  const s = await admin();
  t.after(s.close);
  assert.equal((await s.visit({ path: '/index.html', ref: 'www.google.com' })).status, 204);
  await s.visit({ path: '/' });
  await s.visit({ path: '/cart.html' });
  await s.visit({ path: '/category', src: 'Instagram' }, { 'user-agent': PHONE });
  // Not counted:
  await s.visit({ path: '/' }, { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
  await s.visit({ path: '/' }, { 'user-agent': 'curl/8.4.0' });
  await s.visit({ path: '/' }, { 'user-agent': PHONE.replace('14', '15'), dnt: '1' });
  await s.visit({ path: '/' }, { 'user-agent': PHONE.replace('14', '13'), 'sec-gpc': '1' });
  await s.visit({ path: '/admin.html' });
  await s.visit({ path: '/../../etc/passwd' });
  await s.visit({ path: 12345 });

  const { json: o } = await s.get('/overview');
  assert.equal(o.visitors.today.visitors, 2);
  assert.equal(o.visitors.today.views, 4);
  assert.equal(o.visitors.month.visitors, 2);
  assert.deepEqual(o.visitors.topPages[0], { path: '/', views: 2 });
  assert.deepEqual(o.visitors.topPages.slice(1).map((p) => p.path).sort(), ['/cart', '/category']);
  assert.deepEqual(o.visitors.topSources.map((x) => x.source).sort(), ['google.com', 'instagram']);
  assert.equal(o.series.at(-1).visitors, 2);

  const stored = JSON.stringify(['visit_seen', 'visit_days', 'visit_pages', 'visit_sources'].map((tb) => s.db.prepare(`SELECT * FROM ${tb}`).all()));
  assert.doesNotMatch(stored, /127\.0\.0\.1|Mozilla|Chrome/, 'no IP or browser string is stored');
});

test('visitors: can be switched off, and old visitor hashes are forgotten', async (t) => {
  const off = await admin({ COUNT_VISITORS: 'false' });
  t.after(off.close);
  await off.visit({ path: '/' });
  const { json } = await off.get('/overview');
  assert.equal(json.visitors.enabled, false);
  assert.equal(json.visitors.today.visitors, 0);

  const s = await admin();
  t.after(s.close);
  s.db.prepare("INSERT INTO visit_salts (day, salt) VALUES ('2020-01-01', 'x')").run();
  s.db.prepare("INSERT INTO visit_seen (day, visitor) VALUES ('2020-01-01', 'abc')").run();
  await s.visit({ path: '/' });
  s.analytics.prune();
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM visit_seen WHERE day = '2020-01-01'").get().n, 0);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM visit_salts WHERE day = '2020-01-01'").get().n, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM visit_seen').get().n, 1, "today's visitor is kept");
});

/* ---------- order numbers and issues ---------- */
test('overview: completed, in progress and sales add up', async (t) => {
  const s = await admin({}, { files: [map.id] });
  t.after(s.close);
  const gearOrder = await paidByBank(s, [{ id: gear.id, qty: 1 }]);
  const mapOrder = await paidByDemo(s, [{ id: map.id, qty: 1 }]);
  await s.placeOrder(); // never paid

  let { json: o } = await s.get('/overview');
  assert.equal(o.orders.completed, 1, 'a paid map order is complete straight away');
  assert.equal(o.orders.toShip, 1);
  assert.equal(o.orders.inProgress, 1);
  assert.equal(o.orders.notPaid, 1);
  assert.equal(o.orders.placed, 2);
  assert.equal(o.orders.issues, 0);
  const expected = gearOrder.order.total + mapOrder.order.total;
  assert.equal(o.sales.today.count, 2);
  assert.equal(o.sales.today.amount, expected);
  assert.equal(o.sales.allTime.amount, expected);
  assert.equal(o.series.at(-1).sales, expected);

  const done = await s.get('/orders?status=completed');
  assert.deepEqual(done.json.orders.map((x) => x.id), [mapOrder.id]);
  const detail = await s.get(`/orders/${mapOrder.id}`);
  assert.deepEqual(detail.json.order.nextStatuses, ['delivered', 'cancelled'], 'maps are never "shipped"');

  await s.post(`/orders/${gearOrder.id}/status`, { status: 'shipped' });
  await s.post(`/orders/${gearOrder.id}/status`, { status: 'delivered' });
  ({ json: o } = await s.get('/overview'));
  assert.equal(o.orders.completed, 2);
  assert.equal(o.orders.inProgress, 0);
});

test('issues: refund due after cancelling a paid order, then marked handled', async (t) => {
  const s = await admin();
  t.after(s.close);
  const o = await paidByBank(s, [{ id: gear.id, qty: 1 }]);
  await s.post(`/orders/${o.id}/status`, { status: 'cancelled', note: 'Out of stock' });

  let { json: ov } = await s.get('/overview');
  assert.equal(ov.orders.issues, 1);
  const list = await s.get('/orders?status=issues');
  assert.equal(list.json.orders.length, 1);
  assert.deepEqual(list.json.orders[0].issues, ['Cancelled after payment']);
  const all = await s.get('/orders?status=all');
  assert.deepEqual(all.json.orders[0].issues, ['Cancelled after payment']);

  const handled = await s.post(`/orders/${o.id}/issues/handled`, { note: 'Refunded by bank transfer' });
  assert.equal(handled.status, 200);
  assert.deepEqual(handled.json.order.issues, []);
  assert.equal(handled.json.order.events.at(-1).type, 'issue_handled');
  assert.equal(handled.json.order.events.at(-1).detail, 'Refunded by bank transfer');
  ({ json: ov } = await s.get('/overview'));
  assert.equal(ov.orders.issues, 0);
  assert.equal((await s.get('/orders?status=issues')).json.orders.length, 0);
  assert.equal((await s.post(`/orders/${o.id}/issues/handled`)).status, 409, 'nothing left to handle');
});

test('issues: slow payment checks, late shipping and missing map files', async (t) => {
  const s = await admin();
  t.after(s.close);
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

  const waiting = await s.placeOrder();
  await s.req('POST', `/api/orders/${waiting.id}/reference`, { token: waiting.token, body: { method: 'bank', reference: 'UTR555566667777' } });
  assert.equal((await s.get('/orders?status=issues')).json.orders.length, 0, 'fine while it is fresh');
  s.db.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').run(ago(25), waiting.id);

  const late = await paidByBank(s, [{ id: gear.id, qty: 1 }]);
  s.db.prepare('UPDATE orders SET paid_at = ? WHERE id = ?').run(ago(24 * 4), late.id);

  const noFile = await paidByDemo(s, [{ id: maps[1].id, qty: 1 }]);

  const issues = (await s.get('/orders?status=issues')).json.orders;
  const byId = Object.fromEntries(issues.map((x) => [x.id, x.issues]));
  assert.match(byId[waiting.id][0], /Payment check waiting/);
  assert.match(byId[late.id][0], /Not shipped/);
  assert.deepEqual(byId[noFile.id], ['Map file missing']);
  assert.equal((await s.get('/overview')).json.orders.issues, 3);

  // Fixing the cause clears the issue without "mark as handled".
  await s.post(`/orders/${waiting.id}/status`, { status: 'paid' });
  await s.post(`/orders/${late.id}/status`, { status: 'shipped' });
  assert.equal((await s.upload(maps[1].id, ZIP)).status, 200);
  const after = (await s.get('/orders?status=issues')).json.orders.map((x) => x.id);
  assert.deepEqual(after, [], 'all three issues are gone');
});

/* ---------- racing maps added from the admin panel ---------- */
const NEW_MAP = {
  name: 'Dockyard Drift Loop', size: 'M', mode: 'Sprint', km: '4.4', checkpoints: '18', mb: '30',
  desc: 'A fast night sprint through the docks with tight container chicanes.',
  features: ['Night lighting', '', 'Install guide included'], art: 'track-sprint', color1: '#112233', color2: '#ABCDEF', tag: 'new'
};

test('maps: the form is checked and nothing unsafe gets through', async (t) => {
  const s = await admin();
  t.after(s.close);
  const bad = await s.post('/products', { name: 'x', size: 'HUGE', price: 'free', mrp: '10', km: '-3', desc: 'short' });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.json.fields).sort(), ['desc', 'km', 'name', 'price', 'size']);
  const cheapMrp = await s.post('/products', { ...NEW_MAP, price: '500', mrp: '400' });
  assert.equal(cheapMrp.status, 400);
  assert.ok(cheapMrp.json.fields.mrp);

  const sneaky = await s.post('/products', { ...NEW_MAP, name: '<img src=x onerror=alert(1)> Map', art: '../../etc', color1: 'red;background:url(x)', tag: 'free' });
  assert.equal(sneaky.status, 201);
  const p = sneaky.json.product;
  assert.doesNotMatch(p.name, /[<>]/);
  assert.equal(p.art, 'track-circuit');
  assert.equal(p.colors[0], '#2ad8ff');
  assert.equal(p.tag, null);
  assert.match(p.id, /^[a-z0-9-]+$/);
});

test('maps: add one, sell it at the server price, edit, hide and show it', async (t) => {
  const s = await admin();
  t.after(s.close);
  const before = await s.get('/products');
  assert.ok(before.json.products.some((p) => p.id === map.id && p.source === 'built-in'));
  assert.equal(before.json.options.sizes.M.price, 299);

  const made = await s.post('/products', NEW_MAP);
  assert.equal(made.status, 201, made.text);
  const p = made.json.product;
  assert.equal(p.id, 'dockyard-drift-loop');
  assert.equal(p.price, 299, 'price comes from the size');
  assert.equal(p.source, 'added');
  assert.equal(p.file.ready, false);
  assert.deepEqual(p.features, ['Night lighting', 'Install guide included']);
  assert.deepEqual(p.colors, ['#112233', '#abcdef']);
  assert.equal((await s.post('/products', NEW_MAP)).json.product.id, 'dockyard-drift-loop-2', 'same name gets its own id');

  // The shop pages pick it up.
  const live = await s.req('GET', '/js/products-live.js');
  assert.match(live.headers.get('content-type'), /javascript/);
  const page = { window: { PM_DATA: { products: [{ id: map.id }] } } };
  vm.runInNewContext(live.text, page);
  const shown = page.window.PM_DATA.products.find((x) => x.id === p.id);
  assert.equal(shown.cat, 'maps');
  assert.equal(shown.reviews, 0, 'no made-up reviews');
  assert.equal(page.window.PM_DATA.products.filter((x) => x.id === map.id).length, 1);

  // Buyers pay what the server says, whatever the browser sends.
  const order = await s.req('POST', '/api/orders', { body: { items: [{ id: p.id, qty: 3, price: 1 }], customer } });
  assert.equal(order.status, 201, order.text);
  assert.equal(order.json.order.total, 299);

  const edited = await s.post(`/products/${p.id}`, { ...NEW_MAP, name: 'Dockyard Drift Loop DX', price: '349', mrp: '499' });
  assert.equal(edited.json.product.price, 349);
  assert.equal(edited.json.product.id, p.id, 'renaming keeps the id');
  assert.equal((await s.placeOrder([{ id: p.id, qty: 1 }])).order.total, 349);

  const hidden = await s.post(`/products/${p.id}/visibility`, { active: false });
  assert.equal(hidden.json.product.active, false);
  assert.doesNotMatch((await s.req('GET', '/js/products-live.js')).text, /Dockyard Drift Loop DX/);
  assert.equal((await s.req('POST', '/api/orders', { body: { items: [{ id: p.id, qty: 1 }], customer } })).status, 400);
  await s.post(`/products/${p.id}/visibility`, { active: true });
  assert.equal((await s.placeOrder([{ id: p.id, qty: 1 }])).order.total, 349);

  assert.equal((await s.post(`/products/${map.id}`, NEW_MAP)).status, 409, 'built-in maps are edited in data.js');
  assert.equal((await s.post(`/products/${map.id}/visibility`, { active: false })).status, 409);
  assert.equal((await s.post('/products/no-such-map', NEW_MAP)).status, 404);
  assert.equal((await s.post('/products/BAD%20ID/visibility', { active: true })).status, 404);

  // Still on sale after a restart.
  const fresh = loadCatalog(PUBLIC);
  createProductStore({ db: s.db, catalog: fresh, orders: s.orders });
  assert.equal(fresh.products.get(p.id).price, 349);
  assert.ok(!fresh.products.has('dockyard-drift-loop-3'));
});

test('maps: shoppers cannot use the admin map API', async (t) => {
  const s = await admin();
  t.after(s.close);
  assert.equal((await s.req('GET', '/api/admin/products')).status, 401);
  assert.equal((await s.req('POST', '/api/admin/products', { body: NEW_MAP })).status, 401);
  assert.equal((await s.req('PUT', `/api/admin/products/${map.id}/file`, { headers: { 'content-type': 'application/zip' }, raw: ZIP })).status, 401);
});

/* ---------- map file uploads ---------- */
test('uploads: only real .zip files under the size limit, then buyers can download', async (t) => {
  const s = await admin({ UPLOAD_MAX_MB: '1' });
  t.after(s.close);
  const { json: { product } } = await s.post('/products', NEW_MAP);
  const file = s.orders.fileFor(product.id);

  const notZip = await s.upload(product.id, Buffer.from('this is just a text file pretending to be a map'));
  assert.equal(notZip.status, 400);
  assert.equal(fs.existsSync(file), false);
  assert.equal((await s.upload(product.id, ZIP, 'text/plain')).status, 415);
  assert.equal((await s.upload(product.id, Buffer.concat([ZIP, Buffer.alloc(1.5 * 1024 * 1024)]))).status, 413);
  assert.equal((await s.upload(product.id, ZIP, 'application/zip', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await s.upload('no-such-map', ZIP)).status, 404);
  assert.equal(fs.existsSync(file), false);

  const ok = await s.upload(product.id, ZIP);
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.product.file.ready, true);
  assert.equal(ok.json.product.file.bytes, ZIP.length);
  assert.deepEqual(fs.readdirSync(s.downloadDir).filter((f) => f.endsWith('.part')), [], 'no temp files left behind');

  // A replacement swaps in whole.
  const v2 = Buffer.concat([ZIP, Buffer.from('v2')]);
  assert.equal((await s.upload(product.id, v2)).json.product.file.bytes, v2.length);

  const o = await paidByDemo(s, [{ id: product.id, qty: 1 }]);
  const link = await s.req('POST', `/api/orders/${o.id}/downloads/${product.id}`, { token: o.token, body: {} });
  assert.equal(link.status, 200, link.text);
  const dl = await fetch(s.base + link.json.url);
  assert.equal(dl.status, 200);
  assert.deepEqual(Buffer.from(await dl.arrayBuffer()), v2);

  const listed = (await s.get('/products')).json.products.find((p) => p.id === product.id);
  assert.equal(listed.sold.count, 1);
  assert.equal(listed.sold.revenue, 299);
});

test('uploads: built-in maps can get their file from the admin panel too', async (t) => {
  const s = await admin();
  t.after(s.close);
  let { json: o } = await s.get('/overview');
  assert.ok(o.maps.missingFiles.some((m) => m.id === map.id));
  assert.ok(o.warnings.some((w) => /no file yet/.test(w)));
  assert.equal((await s.upload(map.id, ZIP)).status, 200);
  ({ json: o } = await s.get('/overview'));
  assert.ok(!o.maps.missingFiles.some((m) => m.id === map.id));
  assert.equal((await s.upload(gear.id, ZIP)).status, 404, 'gear has no download');
});
