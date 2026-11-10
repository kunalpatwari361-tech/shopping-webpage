/* ============================================================
   Catalogue: the server reads the same product and store settings
   files the website uses (public/js/data.js and config.js), so there
   is one place to edit products. Prices are always taken from here,
   never from what the browser sends.
   ============================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCatalog(publicDir) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of ['config.js', 'data.js']) {
    const full = path.join(publicDir, 'js', file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full, timeout: 1000 });
  }
  // Copy out of the sandbox into plain objects.
  const store = JSON.parse(JSON.stringify(sandbox.window.PM_CONFIG || {}));
  const data = JSON.parse(JSON.stringify(sandbox.window.PM_DATA || {}));
  if (!Array.isArray(data.products) || !Array.isArray(data.categories)) {
    throw new Error('public/js/data.js must define PM_DATA.products and PM_DATA.categories');
  }

  const sizes = store.mapSizes || {};
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const products = new Map();
  for (const p of data.products) {
    const cat = categories.get(p.cat);
    if (!cat) throw new Error(`Product "${p.id}" uses unknown category "${p.cat}"`);
    if (!/^[a-z0-9-]{1,64}$/.test(p.id)) throw new Error(`Product id "${p.id}" may only use a-z, 0-9 and dashes`);
    if (products.has(p.id)) throw new Error(`Duplicate product id "${p.id}"`);
    // Same rule as the website: a map's price comes from its size tier.
    const tier = sizes[p.size];
    const price = p.price != null ? p.price : tier ? tier.price : null;
    if (!Number.isInteger(price) || price <= 0) throw new Error(`Product "${p.id}" needs a whole-rupee price or a valid size`);
    products.set(p.id, {
      id: p.id,
      name: String(p.name),
      cat: p.cat,
      price,
      digital: !!(cat.digital || p.digital),
      size: p.size || null
    });
  }

  return {
    storeName: store.storeName || 'Store',
    freeShippingAt: store.freeShippingAt,
    shippingFee: store.shippingFee,
    coupons: store.coupons || {},
    upiId: (store.upi && store.upi.id) || '',
    upiName: (store.upi && store.upi.payeeName) || store.storeName || 'Store',
    bank: store.bank || {},
    products,
    get(id) { return products.get(id) || null; }
  };
}

module.exports = { loadCatalog };
