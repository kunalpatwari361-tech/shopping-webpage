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
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
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
