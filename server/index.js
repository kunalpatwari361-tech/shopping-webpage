/* ============================================================
   Start the Pawan Mode server:  npm start
   ============================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, ROOT } = require('./config');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { openDb } = require('./db');
const { loadCatalog } = require('./catalog');
const { createRazorpay } = require('./razorpay');
const { createApp } = require('./app');

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), 'WARNING', ...a),
  error: (...a) => console.error(new Date().toISOString(), 'ERROR', ...a)
};

let config;
try {
  config = loadConfig();
} catch (err) {
  log.error(`Settings problem: ${err.message}`);
  process.exit(1);
}

const db = openDb(config.dbFile);
const catalog = loadCatalog(config.publicDir);
const razorpay = config.paymentMode === 'razorpay' ? createRazorpay(config.razorpay) : null;
const { app, orders } = createApp({ config, db, catalog, razorpay, log });

/* ---------- tell the owner what still needs setting up ---------- */
if (config.paymentMode === 'demo') log.warn('Demo payments are ON: UPI and card payments are simulated. Add Razorpay keys to .env to take real payments.');
if (config.paymentMode === 'off') log.warn('No payment gateway set up: only bank transfer' + (catalog.upiId ? ' and direct UPI' : '') + ' can be used.');
if (config.paymentMode === 'razorpay' && !config.razorpay.webhookSecret) log.warn('RAZORPAY_WEBHOOK_SECRET is not set. Payments are still checked, but orders are only confirmed while the shopper keeps the page open.');
if (config.paymentMode === 'razorpay' && config.isProd && config.razorpay.keyId.startsWith('rzp_test_')) log.warn('Running in production with Razorpay TEST keys.');
if (!config.admin.enabled) log.warn('Admin panel is OFF. Set ADMIN_PASSWORD (12+ characters) in .env to turn it on.');
const missing = [...catalog.products.values()].filter((p) => p.digital && !fs.existsSync(orders.fileFor(p.id)));
if (missing.length) log.warn(`${missing.length} racing map file(s) missing from ${path.relative(ROOT, config.downloadDir) || config.downloadDir}: ${missing.map((p) => p.id + '.zip').join(', ')}`);

/* ---------- housekeeping: cancel unpaid orders after UNPAID_ORDER_HOURS ---------- */
const sweep = () => { try { const n = orders.expireUnpaid(); if (n) log.info(`Cancelled ${n} unpaid order(s).`); } catch (e) { log.error('Cleanup failed:', e); } };
sweep();
const timer = setInterval(sweep, 60 * 60e3);
timer.unref();

const server = app.listen(config.port, config.host, () => {
  const shown = config.host === '0.0.0.0' ? 'localhost' : config.host;
  log.info(`${catalog.storeName} is running at http://${shown}:${config.port}  (payments: ${config.paymentMode}${config.admin.enabled ? ', admin: /admin.html' : ''})`);
});
server.headersTimeout = 20e3;
server.requestTimeout = 30e3;

function shutdown(signal) {
  log.info(`${signal} received, shutting down.`);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
