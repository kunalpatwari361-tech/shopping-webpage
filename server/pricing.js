/* ============================================================
   Order totals, worked out on the server from the catalogue.
   The browser only says which products and how many; prices,
   coupons and delivery are all decided here.
   ============================================================ */
'use strict';
const { badRequest } = require('./errors');

const MAX_LINES = 50;
const MAX_QTY = 10;

function quote(catalog, rawItems, rawCoupon) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw badRequest('Your cart is empty.');
  if (rawItems.length > MAX_LINES) throw badRequest('Too many items in one order.');

  // Merge repeated lines and check every product and quantity.
  const qtyById = new Map();
  for (const item of rawItems) {
    const id = item && typeof item.id === 'string' ? item.id : '';
    const qty = item && Number.isInteger(item.qty) ? item.qty : NaN;
    const product = catalog.get(id);
    if (!product) throw badRequest('One of the items in your cart is no longer available. Please refresh your cart.');
    if (!(qty >= 1 && qty <= MAX_QTY)) throw badRequest(`Quantity for ${product.name} must be between 1 and ${MAX_QTY}.`);
    qtyById.set(id, Math.min(MAX_QTY, (qtyById.get(id) || 0) + qty));
  }

  const lines = [...qtyById].map(([id, qty]) => {
    const p = catalog.get(id);
    const n = p.digital ? 1 : qty; // one copy of a download is enough
    return { id, name: p.name, qty: n, price: p.price, total: p.price * n, digital: p.digital, size: p.size };
  });

  const sub = lines.reduce((s, l) => s + l.total, 0);
  const physical = lines.some((l) => !l.digital);
  const digital = lines.some((l) => l.digital);

  const code = typeof rawCoupon === 'string' ? rawCoupon.trim().toUpperCase().slice(0, 32) : '';
  const coupon = code && Object.prototype.hasOwnProperty.call(catalog.coupons, code) ? catalog.coupons[code] : null;
  let couponOk = !!coupon && sub >= (coupon.min || 0);
  if (couponOk && coupon.type === 'shipping' && !physical) couponOk = false; // nothing to deliver
  const discount = couponOk && coupon.type === 'percent' ? Math.round((sub * coupon.value) / 100) : 0;
  const freeShip = (couponOk && coupon.type === 'shipping') || sub >= catalog.freeShippingAt;
  const shipping = !physical || freeShip ? 0 : catalog.shippingFee;

  return {
    lines,
    sub,
    discount,
    shipping,
    total: sub - discount + shipping,
    coupon: couponOk ? code : null,
    couponRejected: !!code && !couponOk,
    physical,
    digital
  };
}

module.exports = { quote, MAX_QTY };
