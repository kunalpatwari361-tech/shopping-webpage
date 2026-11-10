/* ============================================================
   Database: SQLite (built into Node 22+), one file in data/.
   Back this file up regularly once the shop is live.
   ============================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id                 TEXT PRIMARY KEY,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('awaiting_payment','pending_verification','paid','shipped','delivered','cancelled')),
  method             TEXT CHECK (method IN ('phonepe','gpay','paytm','card','bank')),
  provider           TEXT CHECK (provider IN ('razorpay','demo','manual')),
  customer_json      TEXT NOT NULL,
  items_json         TEXT NOT NULL,
  subtotal           INTEGER NOT NULL,
  discount           INTEGER NOT NULL,
  shipping           INTEGER NOT NULL,
  total              INTEGER NOT NULL CHECK (total > 0),
  coupon             TEXT,
  has_digital        INTEGER NOT NULL,
  has_physical       INTEGER NOT NULL,
  access_hash        TEXT NOT NULL,
  gateway_order_id   TEXT UNIQUE,
  gateway_payment_id TEXT UNIQUE,
  reference          TEXT,
  paid_at            TEXT
);
CREATE INDEX IF NOT EXISTS orders_by_status ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS order_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id  TEXT NOT NULL REFERENCES orders(id),
  at        TEXT NOT NULL,
  actor     TEXT NOT NULL,
  type      TEXT NOT NULL,
  detail    TEXT
);
CREATE INDEX IF NOT EXISTS order_events_by_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  received_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS download_tokens (
  token_hash  TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  product_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX IF NOT EXISTS download_tokens_by_order ON download_tokens(order_id, product_id);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

-- Digital products added from the admin panel (built-in ones live in public/js/data.js).
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  data_json   TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Visitor counts. No cookies and no IP addresses are stored: a visitor is a
-- hash of (secret salt of the day + IP + browser), and the salt is thrown away
-- after the day ends, so nobody can be followed from one day to the next.
CREATE TABLE IF NOT EXISTS visit_days (
  day       TEXT PRIMARY KEY,
  visitors  INTEGER NOT NULL DEFAULT 0,
  views     INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS visit_pages (
  day    TEXT NOT NULL,
  path   TEXT NOT NULL,
  views  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visit_sources (
  day     TEXT NOT NULL,
  source  TEXT NOT NULL,
  visits  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visit_seen (
  day      TEXT NOT NULL,
  visitor  TEXT NOT NULL,
  PRIMARY KEY (day, visitor)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visit_salts (
  day   TEXT PRIMARY KEY,
  salt  TEXT NOT NULL
);
`;

/** Columns added after the first release, for databases created before them. */
function migrate(db) {
  const has = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  // When the owner last marked this order's issues as handled.
  if (!has('orders', 'issues_cleared_at')) db.exec('ALTER TABLE orders ADD COLUMN issues_cleared_at TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS orders_by_created ON orders(created_at)');
}

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Run fn inside a transaction; roll back if it throws. */
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, tx };
