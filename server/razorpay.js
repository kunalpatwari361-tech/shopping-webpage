/* ============================================================
   Razorpay: PhonePe, Google Pay, Paytm (UPI) and cards.
   The secret key never leaves the server. Card and UPI details are
   typed into Razorpay's own secure window, never into our pages.
   Docs: https://razorpay.com/docs/payments/server-integration/
   ============================================================ */
'use strict';
const { hmacHex, safeEqual } = require('./security');

const API = 'https://api.razorpay.com/v1';

function createRazorpay({ keyId, keySecret, webhookSecret }) {
  const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  async function call(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`Razorpay ${method} ${path} failed (${res.status}): ${data.error && data.error.description ? data.error.description : 'unknown error'}`);
      err.gateway = true;
      throw err;
    }
    return data;
  }

  return {
    keyId,
    webhookEnabled: !!webhookSecret,

    /** Amounts are in paise (₹1 = 100). */
    createOrder({ amountPaise, receipt, notes }) {
      return call('POST', '/orders', { amount: amountPaise, currency: 'INR', receipt, notes });
    },
    fetchPayment(paymentId) {
      return call('GET', `/payments/${encodeURIComponent(paymentId)}`);
    },
    capturePayment(paymentId, amountPaise) {
      return call('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' });
    },

    /** Signature Razorpay Checkout returns after a successful payment. */
    checkoutSignatureValid(gatewayOrderId, paymentId, signature) {
      if (typeof signature !== 'string' || !signature) return false;
      return safeEqual(hmacHex(keySecret, `${gatewayOrderId}|${paymentId}`), signature);
    },

    /** Signature on webhook calls, computed over the raw request body. */
    webhookSignatureValid(rawBody, signature) {
      if (!webhookSecret || typeof signature !== 'string' || !signature) return false;
      return safeEqual(hmacHex(webhookSecret, rawBody), signature);
    }
  };
}

module.exports = { createRazorpay };
