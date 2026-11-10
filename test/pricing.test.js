'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { quote } = require('../server/pricing');
const { catalog, gear, cheapGear, map, maps } = require('./helpers');

test('prices come from the catalogue, never from the request', () => {
  const q = quote(catalog, [{ id: gear.id, qty: 2, price: 1, total: 1 }], null);
  assert.equal(q.lines[0].price, gear.price);
  assert.equal(q.sub, gear.price * 2);
  assert.equal(q.total, q.sub - q.discount + q.shipping);
});

test('duplicate lines are merged and quantity is capped', () => {
  const q = quote(catalog, [{ id: gear.id, qty: 6 }, { id: gear.id, qty: 6 }], null);
  assert.equal(q.lines.length, 1);
  assert.ok(q.lines[0].qty <= 10);
});

test('a racing map is always one copy', () => {
  const q = quote(catalog, [{ id: map.id, qty: 3 }], null);
  assert.equal(q.lines[0].qty, 1);
  assert.equal(q.lines[0].digital, true);
  assert.equal(q.shipping, 0, 'downloads never pay delivery');
  assert.equal(q.physical, false);
});

test('map prices follow their size tier', () => {
  for (const m of maps) {
    const q = quote(catalog, [{ id: m.id, qty: 1 }], null);
    assert.equal(q.total, m.price);
    assert.ok(m.price > 0);
  }
});

test('bad items are rejected', () => {
  assert.throws(() => quote(catalog, [], null), /cart/i);
  assert.throws(() => quote(catalog, [{ id: 'no-such-thing', qty: 1 }], null));
  assert.throws(() => quote(catalog, [{ id: gear.id, qty: 0 }], null));
  assert.throws(() => quote(catalog, [{ id: gear.id, qty: 1.5 }], null));
  assert.throws(() => quote(catalog, [{ id: gear.id, qty: '2' }], null));
  assert.throws(() => quote(catalog, 'not a list', null));
  assert.throws(() => quote(catalog, [{ id: { $gt: '' }, qty: 1 }], null));
});

test('coupons follow the same rules as the shop', () => {
  const p10 = quote(catalog, [{ id: gear.id, qty: 1 }], 'pawan10');
  assert.equal(p10.coupon, 'PAWAN10');
  assert.equal(p10.discount, Math.round(gear.price * 0.1));

  const small = quote(catalog, [{ id: cheapGear.id, qty: 1 }], 'HEIST20');
  if (cheapGear.price < catalog.coupons.HEIST20.min) {
    assert.equal(small.discount, 0);
    assert.equal(small.couponRejected, true);
  }

  const mapsOnly = quote(catalog, [{ id: map.id, qty: 1 }], 'FREERIDE');
  assert.equal(mapsOnly.couponRejected, true, 'free delivery means nothing for downloads');
  assert.equal(mapsOnly.coupon, null);

  const unknown = quote(catalog, [{ id: gear.id, qty: 1 }], 'FREEMONEY');
  assert.equal(unknown.discount, 0);
  assert.equal(unknown.couponRejected, true);
});

test('delivery is charged below the free-delivery amount only', () => {
  const q = quote(catalog, [{ id: cheapGear.id, qty: 1 }], null);
  if (cheapGear.price < catalog.freeShippingAt) assert.equal(q.shipping, catalog.shippingFee);
  const big = quote(catalog, [{ id: cheapGear.id, qty: 10 }], null);
  if (big.sub >= catalog.freeShippingAt) assert.equal(big.shipping, 0);
});
