/* ============================================================
   Digital products (racing maps) added from the admin panel.
   They are saved in the database and added to the shop next to
   the built-in ones from public/js/data.js. Map files are stored in
   private/downloads/<id>.zip, never in the public website folder.
   ============================================================ */
'use strict';
const fs = require('node:fs');
const { HttpError, badRequest, notFound } = require('./errors');

const ARTS = ['track-circuit', 'track-sprint', 'track-ring', 'track-touge', 'track-tri', 'track-city'];
const TAGS = ['new', 'hot', 'limited'];
const MODES = ['Sprint', 'Circuit', 'Drift', 'Touge', 'Rally', 'Drag', 'Free roam'];
const HEX = /^#[0-9a-f]{6}$/i;

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

function optNumber(v, { min, max, decimals = 0 }) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Check what the admin typed. Throws a 400 with a message per field. */
function validate(raw, { sizes, digitalCats }) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const errs = {};
  const p = {
    name: clean(r.name, 60),
    cat: typeof r.cat === 'string' && digitalCats.includes(r.cat) ? r.cat : digitalCats[0],
    size: typeof r.size === 'string' && Object.prototype.hasOwnProperty.call(sizes, r.size) ? r.size : null,
    price: optNumber(r.price, { min: 1, max: 1000000 }),
    mrp: optNumber(r.mrp, { min: 1, max: 1000000 }),
    km: optNumber(r.km, { min: 0.1, max: 999, decimals: 1 }),
    mb: optNumber(r.mb, { min: 1, max: 100000 }),
    checkpoints: optNumber(r.checkpoints, { min: 1, max: 999 }),
    mode: clean(r.mode, 20),
    desc: clean(r.desc, 600),
    features: (Array.isArray(r.features) ? r.features : String(r.features || '').split('\n')).map((f) => clean(f, 80)).filter(Boolean).slice(0, 6),
    art: ARTS.includes(r.art) ? r.art : ARTS[0],
    colors: [HEX.test(r.color1) ? r.color1.toLowerCase() : '#2ad8ff', HEX.test(r.color2) ? r.color2.toLowerCase() : '#ffc61a'],
    tag: TAGS.includes(r.tag) ? r.tag : null,
    featured: r.featured === true
  };
  if (p.name.length < 3) errs.name = 'Give the map a name (3 to 60 characters).';
  if (r.size && !p.size) errs.size = 'Choose a size.';
  if (p.price === undefined) errs.price = 'Enter a whole number of rupees, or leave it empty to use the size price.';
  if (p.mrp === undefined) errs.mrp = 'Enter a whole number of rupees, or leave it empty.';
  if (!p.size && p.price == null) errs.size = 'Choose a size, or enter a price.';
  const price = p.price != null ? p.price : p.size ? sizes[p.size].price : null;
  if (p.mrp != null && price != null && p.mrp < price) errs.mrp = 'The "was" price must be at least the selling price.';
  if (p.km === undefined) errs.km = 'Enter the track length in km (0.1 to 999).';
  if (p.mb === undefined) errs.mb = 'Enter the download size in MB.';
  if (p.checkpoints === undefined) errs.checkpoints = 'Enter a number of checkpoints (1 to 999).';
  if (p.desc.length < 20) errs.desc = 'Write a short description (at least 20 characters).';
  if (Object.keys(errs).length) throw badRequest('Please check the map details.', errs);
  if (!p.mode) p.mode = null;
  return p;
}

function createProductStore({ db, catalog, orders }) {
  const q = {
    all: db.prepare('SELECT * FROM products ORDER BY created_at DESC'),
    get: db.prepare('SELECT * FROM products WHERE id = ?'),
    insert: db.prepare('INSERT INTO products (id, data_json, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)'),
    update: db.prepare('UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?'),
    setActive: db.prepare('UPDATE products SET active = ?, updated_at = ? WHERE id = ?'),
    sales: db.prepare(`SELECT json_extract(j.value, '$.id') AS id, COUNT(*) AS n, SUM(json_extract(j.value, '$.total')) AS revenue
      FROM orders o, json_each(o.items_json) j
      WHERE o.status IN ('paid','shipped','delivered') GROUP BY 1`)
  };
  const digitalCats = [...catalog.categories.values()].filter((c) => c.digital).map((c) => c.id);
  const now = () => new Date().toISOString();
  const parse = (row) => Object.assign(JSON.parse(row.data_json), { id: row.id });

  // Put saved products on sale when the server starts.
  for (const row of q.all.all()) {
    if (!row.active) continue;
    if (catalog.builtIn.has(row.id)) continue; // data.js wins if the same id was added there later
    try { catalog.register(parse(row)); } catch (e) { /* a broken row is skipped, not fatal */ }
  }

  function uniqueId(name) {
    const base = slug(name) || 'map';
    let id = base;
    for (let i = 2; catalog.builtIn.has(id) || q.get.get(id); i += 1) id = `${base}-${i}`;
    return id;
  }

  function fileInfo(id) {
    try {
      const st = fs.statSync(orders.fileFor(id));
      return { ready: true, bytes: st.size, updatedAt: st.mtime.toISOString() };
    } catch (e) { return { ready: false, bytes: 0, updatedAt: null }; }
  }

  /** What the website needs to show a product (same shape as data.js). */
  function forShop(p) {
    const out = {
      id: p.id, name: p.name, cat: p.cat, art: p.art, colors: p.colors, size: p.size,
      km: p.km, mb: p.mb, mode: p.mode, checkpoints: p.checkpoints,
      rating: 0, reviews: 0, desc: p.desc, features: p.features.length ? p.features : ['Install guide included']
    };
    if (p.price != null) out.price = p.price;
    if (p.mrp != null) out.mrp = p.mrp;
    if (p.tag) out.tag = p.tag;
    if (p.featured) out.featured = true;
    return out;
  }

  function list() {
    const sold = new Map(q.sales.all().map((r) => [r.id, { count: r.n, revenue: r.revenue }]));
    const describe = (p, source, active, extra) => {
      const tier = catalog.sizes[p.size];
      const price = p.price != null ? p.price : tier ? tier.price : null;
      return Object.assign({
        id: p.id, name: p.name, cat: p.cat, size: p.size || null, price, mrp: p.mrp != null ? p.mrp : tier ? tier.mrp : null,
        km: p.km, mb: p.mb, mode: p.mode, checkpoints: p.checkpoints, art: p.art, colors: p.colors,
        desc: p.desc, features: p.features || [], tag: p.tag || null, featured: !!p.featured,
        source, active, file: fileInfo(p.id), sold: sold.get(p.id) || { count: 0, revenue: 0 }
      }, extra);
    };
    const added = q.all.all().map((row) => describe(parse(row), 'added', !!row.active, { createdAt: row.created_at, updatedAt: row.updated_at }));
    const builtIn = [...catalog.builtIn.values()]
      .filter((p) => (catalog.categories.get(p.cat) || {}).digital)
      .map((p) => describe(p, 'built-in', true));
    return added.concat(builtIn);
  }

  function create(raw) {
    const p = validate(raw, { sizes: catalog.sizes, digitalCats });
    p.id = uniqueId(p.name);
    const at = now();
    q.insert.run(p.id, JSON.stringify(p), at, at);
    catalog.register(p);
    return p.id;
  }

  function update(id, raw) {
    const row = q.get.get(id);
    if (!row) throw catalog.builtIn.has(id) ? new HttpError(409, 'Built-in maps are edited in public/js/data.js.') : notFound('Map not found.');
    const p = validate(raw, { sizes: catalog.sizes, digitalCats });
    p.id = id;
    q.update.run(JSON.stringify(p), now(), id);
    if (row.active) catalog.register(p);
    return id;
  }

  function setActive(id, active) {
    const row = q.get.get(id);
    if (!row) throw catalog.builtIn.has(id) ? new HttpError(409, 'Built-in maps are hidden by removing them from public/js/data.js.') : notFound('Map not found.');
    q.setActive.run(active ? 1 : 0, now(), id);
    if (active) catalog.register(parse(row)); else catalog.unregister(id);
    return id;
  }

  /** Any digital product, built-in or added (hidden ones too), for file uploads. */
  function isDigital(id) {
    if (q.get.get(id)) return true;
    const p = catalog.builtIn.get(id);
    return !!p && !!(catalog.categories.get(p.cat) || {}).digital;
  }

  /** Active added products, in the shape the website uses. */
  function forWebsite() {
    return q.all.all().filter((row) => row.active && !catalog.builtIn.has(row.id)).map((row) => forShop(parse(row)));
  }

  return { list, create, update, setActive, isDigital, forWebsite, fileInfo, options: { arts: ARTS, tags: TAGS, modes: MODES, digitalCats } };
}

module.exports = { createProductStore, validate, ARTS, TAGS, MODES };
