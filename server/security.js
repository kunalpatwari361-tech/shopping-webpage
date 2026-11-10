/* Small crypto helpers: random tokens, hashing, constant-time checks. */
'use strict';
const crypto = require('node:crypto');

const newToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');

/** Compare two strings without leaking how much of them matched. */
function safeEqual(a, b) {
  const x = Buffer.from(sha256(a), 'hex');
  const y = Buffer.from(sha256(b), 'hex');
  return crypto.timingSafeEqual(x, y) && String(a).length === String(b).length;
}

/** HMAC-SHA256 as hex, used by Razorpay signatures. */
const hmacHex = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

// Order numbers like PM7K3XQ9T2RD: not guessable, easy to read out on the phone.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function newOrderId() {
  const bytes = crypto.randomBytes(10);
  let out = 'PM';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

module.exports = { newToken, sha256, safeEqual, hmacHex, newOrderId };
