/* ============================================================
   PAWAN MODE — store settings
   Edit this file to put in your own details before going live.
   ============================================================ */
window.PM_CONFIG = {
  storeName: 'Pawan Mode',
  supportEmail: 'support@example.com',   // TODO: your support email
  supportPhone: '+91 00000 00000',       // TODO: your support number

  freeShippingAt: 999,  // orders at or above this (₹) ship free
  shippingFee: 79,      // delivery fee (₹) below that amount

  /* RACING MAPS (digital downloads)
     Each map's price comes from its size. Give every map a size (S, M, L or XL)
     in js/data.js and set the prices here. A map can still set its own price
     in js/data.js if it needs to be different from its size tier. */
  mapSizes: {
    S: { label: 'Small', price: 149, mrp: 249, detail: 'Up to 3 km · quick sprints' },
    M: { label: 'Medium', price: 299, mrp: 449, detail: '3 to 6 km · full circuits' },
    L: { label: 'Large', price: 499, mrp: 699, detail: '6 to 10 km · multi-zone races' },
    XL: { label: 'Extra large', price: 799, mrp: 1099, detail: '10 km+ · whole-city routes' }
  },
  digital: {
    platform: 'PC',  // TODO: the game, version or mod tool your maps work with
    delivery: 'Download link sent to your email once payment is confirmed'
  },

  /* DEMO MODE
     true  = no real money moves. UPI and card payments are simulated in the browser.
     A static website cannot charge cards or confirm UPI payments by itself — for real
     payments connect a gateway such as Razorpay, Cashfree or PayU (see README.md). */
  demoMode: true,

  /* UPI (PhonePe / Google Pay / Paytm)
     Put your UPI ID here (for example 'yourshop@okaxis') to show real, payable QR codes
     and app links. Leave it empty to keep UPI in demo mode. */
  upi: {
    id: '',
    payeeName: 'Pawan Mode'
  },

  /* Bank transfer (NEFT / IMPS / RTGS) — replace with your real account details. */
  bank: {
    accountName: 'Pawan Mode',
    accountNumber: 'XXXXXXXXXXXX',
    ifsc: 'XXXX0000000',
    bankName: 'Your Bank Name',
    branch: 'Your Branch',
    accountType: 'Current'
  },

  /* Coupon codes shoppers can apply in the cart. */
  coupons: {
    PAWAN10: { type: 'percent', value: 10, min: 0, label: '10% off your order' },
    HEIST20: { type: 'percent', value: 20, min: 3000, label: '20% off orders of ₹3,000+' },
    FREERIDE: { type: 'shipping', value: 0, min: 0, label: 'Free delivery on any order' }
  }
};
