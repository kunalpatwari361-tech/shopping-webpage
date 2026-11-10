/* ============================================================
   Visitor counts for the admin panel.
   Privacy first: no cookies, nothing stored in the browser, and no
   IP addresses saved. A visitor is counted once per day using a hash
   of (random salt of the day + IP + browser). The salt is deleted when
   the day is over, so visits on different days can't be linked.
   Visitors who ask not to be tracked (Do Not Track / Global Privacy
   Control) and known bots are not counted.
   ============================================================ */
'use strict';
const { newToken, sha256 } = require('./security');
const { tx } = require('./db');

const BOT_RE = /bot|crawl|spider|slurp|scrape|fetch|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|httpclient|axios|node-fetch|go-http|java\//i;
const PAGES = ['/', '/category', '/cart', '/wishlist', '/checkout', '/blog', '/how-to-use'];

/** "YYYY-MM-DD" for a moment, in the shop's time zone. */
function dayFormatter(timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (d = new Date()) => f.format(d);
}

/** The last n days, oldest first. */
function lastDays(dayOf, n, now = Date.now()) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = dayOf(new Date(now - i * 86400e3));
    if (out[out.length - 1] !== d) out.push(d);
  }
  return out;
}

function cleanPath(raw) {
  if (typeof raw !== 'string') return null;
  let p = raw.split(/[?#]/)[0].toLowerCase();
  p = p.replace(/\.html$/, '').replace(/\/index$/, '/');
  if (p === '') p = '/';
  return PAGES.includes(p) ? p : null;
}

function cleanSource(ref, src) {
  const tag = typeof src === 'string' ? src.trim().toLowerCase().replace(/[^a-z0-9._ -]/g, '').slice(0, 40) : '';
  if (tag) return tag;
  const host = typeof ref === 'string' ? ref.trim().toLowerCase().replace(/^www\./, '') : '';
  if (/^[a-z0-9.-]{3,80}$/.test(host) && host.includes('.')) return host.slice(0, 60);
  return 'Direct';
}

function createAnalytics({ db, config }) {
  const dayOf = dayFormatter(config.timeZone);
  const q = {
    salt: db.prepare('SELECT salt FROM visit_salts WHERE day = ?'),
    addSalt: db.prepare('INSERT OR IGNORE INTO visit_salts (day, salt) VALUES (?, ?)'),
    dropSalts: db.prepare('DELETE FROM visit_salts WHERE day < ?'),
    seen: db.prepare('INSERT OR IGNORE INTO visit_seen (day, visitor) VALUES (?, ?)'),
    dropSeen: db.prepare('DELETE FROM visit_seen WHERE day < ?'),
    day: db.prepare(`INSERT INTO visit_days (day, visitors, views) VALUES (?, ?, 1)
      ON CONFLICT(day) DO UPDATE SET visitors = visitors + excluded.visitors, views = views + 1`),
    page: db.prepare(`INSERT INTO visit_pages (day, path, views) VALUES (?, ?, 1)
      ON CONFLICT(day, path) DO UPDATE SET views = views + 1`),
    source: db.prepare(`INSERT INTO visit_sources (day, source, visits) VALUES (?, ?, 1)
      ON CONFLICT(day, source) DO UPDATE SET visits = visits + 1`),
    days: db.prepare('SELECT day, visitors, views FROM visit_days WHERE day >= ? ORDER BY day'),
    pages: db.prepare('SELECT path, SUM(views) AS views FROM visit_pages WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT 8'),
    sources: db.prepare('SELECT source, SUM(visits) AS visits FROM visit_sources WHERE day >= ? GROUP BY source ORDER BY visits DESC LIMIT 8')
  };

  function saltFor(day) {
    const row = q.salt.get(day);
    if (row) return row.salt;
    q.addSalt.run(day, newToken(24));
    return q.salt.get(day).salt;
  }

  /** Count one page view. Returns true if it was counted. */
  function record({ ip, userAgent, path, ref, src, optOut }) {
    if (!config.countVisitors || optOut) return false;
    const ua = typeof userAgent === 'string' ? userAgent.slice(0, 400) : '';
    if (!ua || BOT_RE.test(ua)) return false;
    const page = cleanPath(path);
    if (!page) return false;
    const day = dayOf();
    return tx(db, () => {
      const visitor = sha256(`${saltFor(day)}|${ip}|${ua}`).slice(0, 32);
      const first = q.seen.run(day, visitor).changes === 1;
      q.day.run(day, first ? 1 : 0);
      q.page.run(day, page);
      if (first) q.source.run(day, cleanSource(ref, src));
      return true;
    });
  }

  /** Forget the salts and visitor hashes of days that are over. */
  function prune() {
    const today = dayOf();
    q.dropSalts.run(today);
    q.dropSeen.run(today);
  }

  function summary(n = 30) {
    const days = lastDays(dayOf, n);
    const rows = new Map(q.days.all(days[0]).map((r) => [r.day, r]));
    const series = days.map((day) => ({ day, visitors: (rows.get(day) || {}).visitors || 0, views: (rows.get(day) || {}).views || 0 }));
    const sum = (k, last) => series.slice(-last).reduce((s, d) => s + d[k], 0);
    const weekStart = days[Math.max(0, days.length - 7)];
    return {
      series,
      today: { visitors: sum('visitors', 1), views: sum('views', 1) },
      week: { visitors: sum('visitors', 7), views: sum('views', 7) },
      month: { visitors: sum('visitors', n), views: sum('views', n) },
      topPages: q.pages.all(weekStart).map((r) => ({ path: r.path, views: r.views })),
      topSources: q.sources.all(weekStart).map((r) => ({ source: r.source, visits: r.visits }))
    };
  }

  return { record, prune, summary, dayOf };
}

module.exports = { createAnalytics, dayFormatter, lastDays, cleanPath, cleanSource };
