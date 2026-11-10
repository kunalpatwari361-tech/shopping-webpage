/* ============================================================
   Server settings, read from environment variables (.env).
   Secrets live only here on the server and are never sent to the
   browser. See .env.example for every option.
   ============================================================ */
'use strict';
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const rzpKeyId = (env.RAZORPAY_KEY_ID || '').trim();
  const rzpSecret = (env.RAZORPAY_KEY_SECRET || '').trim();
  const demoWanted = env.DEMO_PAYMENTS === 'true' || (!isProd && env.DEMO_PAYMENTS !== 'false');

  if (rzpKeyId && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(rzpKeyId)) {
    throw new Error('RAZORPAY_KEY_ID should look like rzp_test_... or rzp_live_...');
  }
  if (!!rzpKeyId !== !!rzpSecret) {
    throw new Error('Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither.');
  }
  if (isProd && env.DEMO_PAYMENTS === 'true') {
    throw new Error('DEMO_PAYMENTS=true is not allowed when NODE_ENV=production.');
  }

  // Which payment engine handles UPI and card payments:
  //   razorpay - real payments through Razorpay (keys are set)
  //   demo     - simulated payments for local testing (never in production)
  //   off      - no gateway: only bank transfer and direct-UPI (manual checks)
  const paymentMode = rzpKeyId ? 'razorpay' : demoWanted ? 'demo' : 'off';

  const adminPassword = env.ADMIN_PASSWORD || '';

  return {
    root: ROOT,
    publicDir: path.join(ROOT, 'public'),
    isProd,
    port: int(env.PORT, 3000),
    host: env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1'),
    // Number of reverse proxies in front of the app (for correct client IPs).
    trustProxy: int(env.TRUST_PROXY, 0),
    // Relative paths are relative to the project folder.
    dbFile: env.DB_FILE === ':memory:' ? ':memory:' : path.resolve(ROOT, env.DB_FILE || path.join('data', 'store.db')),
    downloadDir: path.resolve(ROOT, env.DOWNLOAD_DIR || path.join('private', 'downloads')),
    downloadDays: int(env.DOWNLOAD_DAYS, 30),
    downloadLimit: int(env.DOWNLOAD_LIMIT, 5),
    unpaidOrderHours: int(env.UNPAID_ORDER_HOURS, 48),
    paymentMode,
    razorpay: {
      keyId: rzpKeyId,
      keySecret: rzpSecret,
      webhookSecret: (env.RAZORPAY_WEBHOOK_SECRET || '').trim()
    },
    admin: {
      // The admin panel stays switched off until a strong password is set.
      enabled: adminPassword.length >= 12,
      password: adminPassword,
      sessionHours: int(env.ADMIN_SESSION_HOURS, 12)
    },
    logRequests: env.LOG_REQUESTS !== 'false'
  };
}

module.exports = { loadConfig, ROOT };
