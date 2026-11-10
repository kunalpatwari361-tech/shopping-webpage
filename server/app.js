/* ============================================================
   The web server: serves the website from public/ and the API
   under /api. Nothing outside public/ is ever served, so server
   code, the database, .env and map files stay private.
   ============================================================ */
'use strict';
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { createOrderService } = require('./orders');
const { createDownloads } = require('./downloads');
const { createProductStore } = require('./products');
const { createAnalytics } = require('./analytics');
const { shopRoutes } = require('./routes/shop');
const { adminRoutes } = require('./routes/admin');
const { razorpayWebhook } = require('./routes/webhooks');

// Razorpay Checkout runs in a frame from razorpay.com and calls its own servers.
const RZP = 'https://*.razorpay.com';

function createApp({ config, db, catalog, razorpay = null, log = console }) {
  const orders = createOrderService({ db, catalog, config });
  const downloads = createDownloads({ db, orders });
  const products = createProductStore({ db, catalog, orders });
  const analytics = createAnalytics({ db, config });
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('json spaces', 0);

  if (config.logRequests) {
    app.use((req, res, next) => {
      const start = Date.now();
      // Never log query strings or download tokens.
      const where = req.path.startsWith('/api/downloads/') ? '/api/downloads/…' : req.path;
      res.on('finish', () => { if ((where.startsWith('/api/') && where !== '/api/visit') || res.statusCode >= 400) log.info(`${req.method} ${where} ${res.statusCode} ${Date.now() - start}ms`); });
      next();
    });
  }

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://checkout.razorpay.com'],
        // The pages use style="" attributes for colours and layout.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', RZP],
        connectSrc: ["'self'", RZP],
        frameSrc: ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {})
      }
    },
    // Razorpay's window needs to be able to talk back to this page.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")');
    next();
  });

  /* ---------- rate limits (per visitor IP) ---------- */
  const limiter = (windowMin, max, message) => rateLimit({
    windowMs: windowMin * 60e3, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: message }
  });
  const busy = 'Too many requests. Please wait a minute and try again.';
  const limits = {
    api: limiter(1, 120, busy),
    orders: limiter(15, 30, 'Too many orders from your network. Please wait a few minutes.'),
    pay: limiter(5, 40, busy),
    downloads: limiter(10, 40, 'Too many downloads. Please wait a few minutes.'),
    login: rateLimit({ windowMs: 15 * 60e3, limit: 8, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many wrong passwords. Try again in 15 minutes.' } })
  };

  /* ---------- API ---------- */
  const api = express.Router();
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // Webhook first: it needs the exact raw bytes to check Razorpay's signature.
  api.post('/webhooks/razorpay', express.raw({ type: 'application/json', limit: '256kb' }), razorpayWebhook({ db, orders, razorpay }));

  api.use(limits.api);
  // Writes must come from this site (stops other websites posting on a shopper's behalf).
  const UPLOAD = /^\/admin\/products\/[a-z0-9-]{1,64}\/file$/;
  api.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: 'Cross-site request blocked.' });
    // The only non-JSON request: the admin uploading a map's .zip file.
    const upload = req.method === 'PUT' && UPLOAD.test(req.path) && req.is(['application/zip', 'application/x-zip-compressed', 'application/octet-stream']);
    if (!upload && !req.is('application/json')) return res.status(415).json({ error: 'Send JSON.' });
    next();
  });
  api.use(express.json({ limit: '32kb', strict: true }));

  // Page views for the admin panel's visitor counts (no cookies, no stored IPs).
  api.post('/visit', (req, res) => {
    const b = req.body || {};
    try {
      analytics.record({
        ip: req.ip, userAgent: req.get('user-agent'), path: b.path, ref: b.ref, src: b.src,
        optOut: req.get('dnt') === '1' || req.get('sec-gpc') === '1'
      });
    } catch (err) { log.error('Visit count failed:', err); }
    res.status(204).end();
  });

  api.use('/', shopRoutes({ config, catalog, orders, downloads, razorpay, limits }));
  api.use('/admin', adminRoutes({ db, config, catalog, orders, products, analytics, limits }));
  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  /* ---------- website ---------- */
  // Racing maps added from the admin panel, loaded by every page after js/data.js.
  app.get('/js/products-live.js', (req, res) => {
    // JSON is valid JavaScript; escaping < keeps it safe if ever inlined in HTML.
    const json = JSON.stringify(products.forWebsite()).replace(/</g, '\\u003c');
    res.set('Cache-Control', 'no-cache').type('application/javascript').send(
      '/* Racing maps added from the admin panel */\n(function () {\n  var d = window.PM_DATA;\n  if (!d) return;\n'
      + `  var add = ${json};\n`
      + '  var have = {};\n  d.products.forEach(function (p) { have[p.id] = true; });\n'
      + '  add.forEach(function (p) { if (!have[p.id]) d.products.push(p); });\n})();\n'
    );
  });
  app.use(express.static(config.publicDir, {
    dotfiles: 'ignore',
    index: 'index.html',
    extensions: ['html'],
    maxAge: config.isProd ? '1h' : 0,
    setHeaders(res, file) {
      if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      if (/admin\.html$/.test(file)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
  }));
  app.use((req, res) => {
    res.status(404);
    if (req.accepts('html')) return res.type('html').send('<!doctype html><meta charset="utf-8"><title>Not found</title><body style="background:#07070c;color:#eee;font-family:sans-serif;text-align:center;padding:12vh 16px"><h1>Wasted</h1><p>That page doesn\'t exist.</p><p><a href="/" style="color:#ffc61a">Back to the shop</a></p>');
    res.type('text').send('Not found');
  });

  /* ---------- errors: friendly message out, details only in the server log ---------- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'That request was not valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
    if (err.expose && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json(err.fields ? { error: err.message, fields: err.fields } : { error: err.message });
    }
    log.error(`${req.method} ${req.path}:`, err.stack || err);
    const message = err.gateway
      ? 'The payment service is not responding. Please try again in a minute. You have not been charged twice.'
      : 'Something went wrong on our side. Please try again.';
    res.status(err.gateway ? 502 : 500).json({ error: message });
  });

  return { app, orders, products, analytics };
}

module.exports = { createApp };
