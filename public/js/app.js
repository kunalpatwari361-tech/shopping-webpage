/* ============================================================
   PAWAN MODE — shared app shell
   Cart + wishlist storage, HUD, loader, page transitions,
   animated city, phone menu, radar, quick view, notifications.
   ============================================================ */
(function () {
  'use strict';

  const D = window.PM_DATA;
  const C = window.PM_CONFIG;
  const ART = window.PM_ART;
  document.documentElement.classList.add('js');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const byId = (id) => D.products.find((p) => p.id === id);
  const catOf = (id) => D.categories.find((c) => c.id === id) || { id, name: id };
  const art = (type, c, a, cls) => ART.svg(type, c, a, cls);
  const productArt = (p, cls) => art(p.art, p.colors[0], p.colors[1], cls);

  /* Racing maps: products in a digital category are downloads, and a map's
     price comes from its size tier in config.js unless the map sets its own. */
  const SIZES = C.mapSizes || {};
  const sizeOf = (p) => (p && SIZES[p.size]) || null;
  D.products.forEach((p) => {
    if (catOf(p.cat).digital) p.digital = true;
    const tier = sizeOf(p);
    if (tier) {
      if (p.price == null) p.price = tier.price;
      if (p.mrp == null) p.mrp = tier.mrp || p.price;
    }
    if (p.price == null) { console.warn(`Product "${p.id}" has no price or size.`); p.price = 0; }
    if (p.mrp == null) p.mrp = p.price;
  });

  function luminance(hex) {
    const c = hex.replace('#', '');
    const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  function glowColor(p, alpha = 0.4) {
    const [c, a] = p.colors || p.artColors;
    return ART.rgba(luminance(c) < 0.2 ? a : c, alpha);
  }

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- storage (always wrapped: private mode can throw) ---------- */
  function safeStore(getArea) {
    return {
      get(k, fallback) {
        try { const v = getArea().getItem('pm_' + k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
      },
      set(k, v) { try { getArea().setItem('pm_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
      del(k) { try { getArea().removeItem('pm_' + k); } catch (e) { /* ignore */ } }
    };
  }
  const store = safeStore(() => window.localStorage);
  const session = safeStore(() => window.sessionStorage);

  const listeners = [];
  const onChange = (fn) => listeners.push(fn);
  function emit() {
    updateHUD();
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }
  window.addEventListener('storage', (e) => { if (e.key && e.key.indexOf('pm_') === 0) emit(); });

  /* ---------- cart + wishlist ---------- */
  // A digital map only ever needs one copy.
  const maxQty = (id) => (byId(id) && byId(id).digital ? 1 : 10);
  const Cart = {
    items() {
      const raw = store.get('cart', []);
      return Array.isArray(raw) ? raw.filter((i) => i && byId(i.id) && i.qty > 0) : [];
    },
    save(items) { store.set('cart', items); emit(); },
    add(id, qty = 1) {
      const items = this.items();
      const found = items.find((i) => i.id === id);
      if (found) found.qty = Math.min(maxQty(id), found.qty + qty);
      else items.push({ id, qty: Math.min(maxQty(id), qty) });
      this.save(items);
    },
    setQty(id, qty) {
      let items = this.items();
      if (qty <= 0) items = items.filter((i) => i.id !== id);
      else { const f = items.find((i) => i.id === id); if (f) f.qty = Math.min(maxQty(id), qty); }
      this.save(items);
    },
    remove(id) { this.save(this.items().filter((i) => i.id !== id)); },
    clear() { this.save([]); },
    count() { return this.items().reduce((s, i) => s + i.qty, 0); },
    subtotal() { return this.items().reduce((s, i) => s + byId(i.id).price * i.qty, 0); },
    lines() { return this.items().map((i) => { const p = byId(i.id); return { id: i.id, qty: i.qty, product: p, total: p.price * i.qty }; }); },
    has(id) { return this.items().some((i) => i.id === id); }
  };

  const Wish = {
    ids() { const raw = store.get('wish', []); return Array.isArray(raw) ? raw.filter(byId) : []; },
    has(id) { return this.ids().includes(id); },
    toggle(id) {
      const ids = this.ids();
      const i = ids.indexOf(id);
      if (i > -1) ids.splice(i, 1); else ids.push(id);
      store.set('wish', ids);
      emit();
      return i === -1;
    },
    remove(id) { store.set('wish', this.ids().filter((x) => x !== id)); emit(); }
  };

  const getCoupon = () => session.get('coupon', null);
  const setCoupon = (code) => { if (code) session.set('coupon', code); else session.del('coupon'); emit(); };

  function totals(code = getCoupon()) {
    const lines = Cart.lines();
    const sub = Cart.subtotal();
    const physical = lines.some((l) => !l.product.digital);
    const digital = lines.some((l) => l.product.digital);
    const coupon = code && C.coupons[code] ? C.coupons[code] : null;
    const valid = !!coupon && sub > 0 && sub >= coupon.min;
    const discount = valid && coupon.type === 'percent' ? Math.round((sub * coupon.value) / 100) : 0;
    const freeShip = (valid && coupon.type === 'shipping') || sub >= C.freeShippingAt;
    // Downloads never ship, so only charge delivery when there's something physical.
    const shipping = !physical || freeShip ? 0 : C.shippingFee;
    return {
      sub, discount, shipping, total: sub - discount + shipping, code: valid ? code : null, coupon: valid ? coupon : null, count: Cart.count(),
      physical, digital, digitalOnly: digital && !physical
    };
  }

  /* ---------- shop server ----------
     Prices, orders and payments are all handled by the server (see server/).
     The browser only ever sends item ids, quantities and the shopper's details. */
  async function api(path, opts = {}) {
    const headers = { Accept: 'application/json' };
    if (opts.token) headers['X-Order-Token'] = opts.token;
    const init = { method: 'GET', headers, credentials: 'same-origin' };
    if (opts.body !== undefined) {
      init.method = 'POST';
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch('/api' + path, init);
    } catch (e) {
      const err = new Error("Can't reach the shop right now. Check your internet connection and try again.");
      err.offline = true;
      throw err;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const err = new Error((data && data.error) || (res.status === 404 && !data ? "The shop's server isn't running. Start it with npm start." : 'Something went wrong. Please try again.'));
      err.status = res.status;
      err.fields = data && data.fields;
      throw err;
    }
    return data;
  }

  // Orders placed on this device: the id plus the private key that unlocks it.
  const MyOrders = {
    list() { const v = store.get('myorders', []); return Array.isArray(v) ? v.filter((o) => o && o.id && o.token) : []; },
    add(id, token) {
      const rest = this.list().filter((o) => o.id !== id);
      store.set('myorders', [{ id, token, at: new Date().toISOString() }].concat(rest).slice(0, 30));
    },
    tokenFor(id) { const o = this.list().find((x) => x.id === id); return o ? o.token : null; }
  };

  // Racing map download: ask the server for a one-time link, then open it.
  async function downloadMap(orderId, token, productId) {
    const { url } = await api(`/orders/${encodeURIComponent(orderId)}/downloads/${encodeURIComponent(productId)}`, { token, body: {} });
    if (!/^\/api\/downloads\/[A-Za-z0-9_-]+$/.test(url)) throw new Error('Unexpected download link.');
    window.location.assign(url);
  }
  // Any button with data-dl (product id) and data-dl-order (order id) downloads that map.
  document.addEventListener('click', async (e) => {
    const b = e.target.closest ? e.target.closest('[data-dl]') : null;
    if (!b || b.disabled) return;
    const orderId = b.dataset.dlOrder;
    const token = MyOrders.tokenFor(orderId);
    if (!token) { helpText('This order isn\'t saved on this device.', 3000); return; }
    b.disabled = true;
    try {
      await downloadMap(orderId, token, b.dataset.dl);
      helpText('Download starting…', 2400);
    } catch (err) {
      helpText(esc(err.message), 4800);
    } finally {
      setTimeout(() => { b.disabled = false; }, 1500);
    }
  });

  /* ---------- icons ---------- */
  const ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    guide: '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>',
    heart: '<path d="M12 20s-7.5-4.6-9.3-9.4A5 5 0 0 1 12 6.8a5 5 0 0 1 9.3 3.8C19.5 15.4 12 20 12 20z"/>',
    cart: '<path d="M3 4h2l2.4 11h11l2-8H6.2"/><circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    phone: '<rect x="6.5" y="2" width="11" height="20" rx="2.5"/><path d="M11 18h2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    gift: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18"/><path d="M12 8c-1.5-3-5-4-5-1.5S10 8 12 8zM12 8c1.5-3 5-4 5-1.5S14 8 12 8z"/>',
    star: '<path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2 6.1 20.5l1.4-6.6-5-4.5 6.6-.7z"/>',
    download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>'
  };
  function icon(name, size = 22) {
    return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2 6.1 20.5l1.4-6.6-5-4.5 6.6-.7z"/></svg>';

  /* ---------- shared markup ---------- */
  function ratingHTML(p) {
    // Maps added from the admin panel start with no reviews: never show made-up stars.
    if (!p.reviews) return '<div class="rating"><span class="rating-new">New · no reviews yet</span></div>';
    const full = Math.round(p.rating);
    let s = '';
    for (let i = 1; i <= 5; i++) s += STAR.replace('<svg', `<svg class="${i <= full ? '' : 'off'}"`);
    return `<div class="rating"><span class="stars-row" aria-label="Rated ${p.rating} out of 5">${s}</span><span>${p.rating} (${p.reviews})</span></div>`;
  }
  function priceHTML(p) {
    const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
    return `<div class="price-row"><span class="price">${inr(p.price)}</span>${off ? `<span class="mrp">${inr(p.mrp)}</span><span class="off">${off}% off</span>` : ''}</div>`;
  }
  function tagHTML(p) { return p.tag ? `<span class="tag ${p.tag}">${p.tag}</span>` : ''; }

  /* Racing map bits: size badge on the picture, spec chips under the title. */
  function sizeBadge(p) {
    const s = sizeOf(p);
    return s ? `<span class="size-badge sz-${esc(p.size)}" title="${esc(s.label)} map">${esc(p.size)}</span>` : '';
  }
  function mapSpecs(p) {
    if (!p.digital) return '';
    const s = sizeOf(p);
    const chips = [
      s ? `<span class="sz-${esc(p.size)}">${esc(s.label)}</span>` : '',
      p.km ? `<span>${esc(p.km)} km</span>` : '',
      p.mb ? `<span>${icon('download', 12)}${esc(p.mb)} MB</span>` : ''
    ].join('');
    return `<div class="map-specs">${chips}</div>`;
  }
  // One size tier as a filter button (category page) or a link (home page).
  function sizeTier(key, opts = {}) {
    const s = SIZES[key];
    if (!s) return '';
    const inner = `<b class="size-letter">${esc(key)}</b><span class="size-name">${esc(s.label)}</span>
      <span class="size-detail">${esc(s.detail || '')}</span>
      <span class="size-price">${inr(s.price)}${opts.count != null ? `<small>${opts.count} map${opts.count === 1 ? '' : 's'}</small>` : ''}</span>`;
    return opts.href
      ? `<a class="size-tier sz-${esc(key)} reveal" href="${opts.href}">${inner}</a>`
      : `<button type="button" class="size-tier sz-${esc(key)}" data-size="${esc(key)}" aria-pressed="${!!opts.active}">${inner}</button>`;
  }

  function card(p, opts = {}) {
    const on = Wish.has(p.id);
    const actions = opts.variant === 'wish'
      ? `<button class="btn btn-primary btn-sm" data-move="${p.id}">${icon('cart', 18)} Move to cart</button>
         <button class="icon-btn" data-unwish="${p.id}" aria-label="Remove ${esc(p.name)} from wishlist">${icon('trash', 18)}</button>`
      : `<button class="btn btn-primary btn-sm" data-add="${p.id}">${icon('cart', 18)} Add to cart</button>`;
    return `
      <article class="card reveal" data-id="${p.id}">
        <div class="card-media" data-view="${p.id}" role="button" tabindex="0" aria-label="Quick view: ${esc(p.name)}" style="--glow:${glowColor(p)}">
          ${tagHTML(p)}
          ${productArt(p)}
          ${sizeBadge(p)}
          <span class="quick">${icon('eye', 15)} Quick view</span>
        </div>
        ${opts.variant === 'wish' ? '' : `<button class="icon-btn wish ${on ? 'on' : ''}" data-wish="${p.id}" aria-pressed="${on}" aria-label="Save ${esc(p.name)} to wishlist">${icon('heart', 20)}</button>`}
        <div class="card-body">
          <span class="card-cat">${esc(catOf(p.cat).name)}${p.digital ? ' · Download' : ''}</span>
          <h3 class="card-title"><a href="#" data-view="${p.id}">${esc(p.name)}</a></h3>
          ${mapSpecs(p)}
          ${ratingHTML(p)}
          ${priceHTML(p)}
          <div class="card-actions">${actions}</div>
        </div>
      </article>`;
  }

  function payBadges() {
    return `<div class="pay-badges">
      <span class="pay-badge pb-phonepe">PhonePe</span>
      <span class="pay-badge pb-gpay">G Pay</span>
      <span class="pay-badge pb-paytm">Paytm</span>
      <span class="pay-badge pb-card">VISA</span>
      <span class="pay-badge pb-card">Mastercard</span>
      <span class="pay-badge pb-rupay">RuPay</span>
      <span class="pay-badge pb-bank">NEFT / IMPS</span>
    </div>`;
  }

  /* ---------- the world: animated sunset city ---------- */
  const PALM = `<svg viewBox="0 0 120 220" aria-hidden="true"><path d="M62 220 C58 170 52 120 64 70" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/><g class="fronds" fill="currentColor">
    <path d="M64 70 C40 50 18 55 4 74 C22 61 42 63 64 74Z"/><path d="M64 70 C88 48 108 52 118 72 C102 61 84 63 64 76Z"/>
    <path d="M64 70 C50 40 34 30 14 34 C36 40 50 53 62 73Z"/><path d="M64 70 C76 38 94 28 114 32 C92 40 78 55 66 73Z"/>
    <path d="M64 70 C62 46 66 26 78 12 C72 32 70 50 66 73Z"/><path d="M64 70 C50 76 36 92 30 112 C42 95 54 85 64 77Z"/>
    <path d="M64 70 C80 78 92 92 98 110 C86 95 74 85 64 77Z"/></g></svg>`;
  const HELI = `<svg viewBox="0 0 120 60" aria-hidden="true"><g fill="#0b0510"><ellipse cx="40" cy="30" rx="22" ry="12"/><rect x="58" y="26" width="48" height="5" rx="2"/><rect x="101" y="17" width="6" height="17" rx="2"/><rect x="22" y="45" width="38" height="3" rx="1.5"/><rect x="29" y="39" width="3" height="8"/><rect x="49" y="39" width="3" height="8"/><rect x="38" y="13" width="4" height="7"/></g><rect class="rotor" x="2" y="11" width="78" height="3" rx="1.5" fill="#0b0510"/><path d="M26 27 a13 10 0 0 1 15 -8 v10z" fill="#4a3570"/><circle class="heli-light" cx="104" cy="16" r="2.5" fill="#ff3344"/></svg>`;

  function buildings(r, o) {
    let x = -20, out = '';
    while (x < 1620) {
      const w = o.minW + r() * (o.maxW - o.minW);
      const h = o.minH + r() * (o.maxH - o.minH);
      const y = 400 - h;
      out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(h + 2).toFixed(1)}" fill="${o.color}"/>`;
      if (r() < 0.3) out += `<rect x="${(x + w * 0.25).toFixed(1)}" y="${(y - 12).toFixed(1)}" width="${(w * 0.5).toFixed(1)}" height="13" fill="${o.color}"/>`;
      if (o.antenna && r() < 0.28) {
        const ax = x + w * (0.3 + r() * 0.4);
        out += `<rect x="${ax.toFixed(1)}" y="${(y - 42).toFixed(1)}" width="2.5" height="42" fill="${o.color}"/><circle class="beacon" cx="${(ax + 1.25).toFixed(1)}" cy="${(y - 44).toFixed(1)}" r="2.6" style="animation-delay:${(r() * 1.8).toFixed(2)}s"/>`;
      }
      if (o.windows) {
        const cols = Math.floor((w - 8) / 11), rows = Math.floor((h - 16) / 15);
        for (let cy = 0; cy < rows; cy++) {
          for (let cx = 0; cx < cols; cx++) {
            if (r() < o.lit) {
              const flick = r() < 0.05 ? ' class="flicker"' : '';
              out += `<rect${flick} x="${(x + 6 + cx * 11).toFixed(1)}" y="${(y + 10 + cy * 15).toFixed(1)}" width="5" height="8" fill="${o.windows}" opacity="${(0.55 + r() * 0.45).toFixed(2)}"/>`;
            }
          }
        }
      }
      x += w + r() * 6;
    }
    return out;
  }

  const worlds = [];
  function buildWorld(el, opts = {}) {
    const o = Object.assign({ seed: 7, cars: 6, heli: true, palms: true, stars: 40 }, opts);
    if (el.dataset.seed) o.seed = +el.dataset.seed;
    if (el.dataset.heli === '0') o.heli = false;
    if (el.dataset.cars) o.cars = +el.dataset.cars;
    const r = rng(o.seed);
    const far = buildings(r, { minW: 40, maxW: 90, minH: 120, maxH: 310, color: '#4b1f63', antenna: true });
    const mid = buildings(r, { minW: 50, maxW: 110, minH: 90, maxH: 240, color: '#2a1034', windows: '#ff9f5a', lit: 0.12, antenna: true });
    const near = buildings(r, { minW: 60, maxW: 140, minH: 60, maxH: 175, color: '#12081a', windows: '#ffd27a', lit: 0.28 });
    let stars = '';
    for (let i = 0; i < o.stars; i++) stars += `<i style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 34).toFixed(1)}%;--s:${(1 + r() * 1.6).toFixed(1)}px;animation-delay:${(r() * 3).toFixed(2)}s"></i>`;
    let cars = '';
    for (let i = 0; i < o.cars; i++) {
      const dur = 7 + r() * 9;
      cars += `<span class="car ${i % 2 ? 'rtl' : 'ltr'}" style="--w:${Math.round(50 + r() * 34)}px;animation-duration:${dur.toFixed(1)}s;animation-delay:-${(r() * dur).toFixed(1)}s"></span>`;
    }
    const svg = (inner) => `<svg viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${inner}</svg>`;
    el.innerHTML = `
      <div class="sky"></div>
      <div class="stars">${stars}</div>
      <div class="sun-glow"></div><div class="sun"></div>
      <div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>
      ${o.heli ? `<div class="heli"><div class="beam"></div>${HELI}</div>` : ''}
      <div class="layer far" data-x="0.015" data-y="0.38">${svg(far)}</div>
      <div class="haze"></div>
      <div class="layer mid" data-x="0.03" data-y="0.26">${svg(mid)}</div>
      <div class="layer near" data-x="0.06" data-y="0.12">${svg(near)}</div>
      ${o.palms ? `<div class="palms"><span class="palm p1">${PALM}</span><span class="palm p2">${PALM}</span><span class="palm p3">${PALM}</span><span class="palm p4">${PALM}</span></div>` : ''}
      <div class="road">${cars}</div>`;
    el.setAttribute('aria-hidden', 'true');
    worlds.push(el);
  }

  let mx = 0.5, parallaxQueued = false;
  function queueParallax() {
    if (reduceMotion || parallaxQueued) return;
    parallaxQueued = true;
    requestAnimationFrame(() => {
      parallaxQueued = false;
      const sy = Math.min(window.scrollY, 1000);
      worlds.forEach((w) => {
        const rect = w.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        $$('.layer', w).forEach((l) => {
          l.style.transform = `translate3d(${((0.5 - mx) * +l.dataset.x * 700).toFixed(1)}px, ${(sy * +l.dataset.y).toFixed(1)}px, 0)`;
        });
      });
    });
  }

  /* ---------- radar minimap ---------- */
  function radarMap() {
    const r = rng(42);
    let s = '<rect width="200" height="200" fill="#10241a"/>';
    s += '<path d="M0 150 Q40 138 70 158 T140 168 T200 152 V200 H0 Z" fill="#1b3f5e"/>';
    s += '<rect x="22" y="30" width="34" height="26" rx="4" fill="#1d4a2a"/><rect x="128" y="98" width="42" height="24" rx="4" fill="#1d4a2a"/>';
    for (let i = 0; i < 9; i++) {
      const x = 8 + i * 23 + r() * 6;
      s += `<path d="M${x.toFixed(1)} 0 L${(x + r() * 16 - 8).toFixed(1)} 200" stroke="#3b4943" stroke-width="${r() < 0.3 ? 5 : 3}"/>`;
      const y = 8 + i * 23 + r() * 6;
      s += `<path d="M0 ${y.toFixed(1)} L200 ${(y + r() * 16 - 8).toFixed(1)}" stroke="#3b4943" stroke-width="${r() < 0.3 ? 5 : 3}"/>`;
    }
    s += '<path d="M0 62 Q100 92 200 40" stroke="#5c6862" stroke-width="7" fill="none"/>';
    s += '<path d="M100 100 L100 78 L134 78 L134 56" stroke="#b366ff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    [[134, 56, '#ffc61a'], [52, 122, '#72d572'], [160, 140, '#2ad8ff'], [64, 44, '#ff2d6f'], [30, 92, '#ffffff']].forEach(([x, y, c], i) => {
      s += `<circle class="blip" cx="${x}" cy="${y}" r="5" fill="${c}" stroke="#000" stroke-width="1.5" style="animation-delay:${i * 0.4}s"/>`;
    });
    return `<svg class="radar-map" id="radarMap" viewBox="0 0 200 200" aria-hidden="true">${s}</svg>`;
  }

  /* ---------- chrome: header, phone, radar, footer, overlays ---------- */
  const NAV = [
    { href: 'index.html', label: 'Home', key: 'home', icon: 'home', bg: 'linear-gradient(135deg,#ff7a1a,#ff2d6f)' },
    { href: 'category.html', label: 'Categories', key: 'category', icon: 'grid', bg: 'linear-gradient(135deg,#7a2cff,#2ad8ff)' },
    { href: 'cart.html', label: 'Cart', key: 'cart', icon: 'cart', bg: 'linear-gradient(135deg,#2f7d32,#72d572)', badge: 'appCartCount' },
    { href: 'wishlist.html', label: 'Wishlist', key: 'wishlist', icon: 'heart', bg: 'linear-gradient(135deg,#ff2d6f,#ff8fb1)', badge: 'appWishCount' },
    { href: 'blog.html', label: 'Blogs', key: 'blog', icon: 'news', bg: 'linear-gradient(135deg,#2a6bff,#2ad8ff)' },
    { href: 'how-to-use.html', label: 'How to Use', key: 'howto', icon: 'guide', bg: 'linear-gradient(135deg,#ffc61a,#ff7a1a)' }
  ];
  const page = document.body.dataset.page || '';

  function renderChrome() {
    const navLinks = NAV.filter((n) => ['home', 'category', 'blog', 'howto'].includes(n.key))
      .map((n) => `<a href="${n.href}" class="${n.key === page ? 'active' : ''}"${n.key === page ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
    const stars = Array.from({ length: 5 }, () => STAR).join('');

    const header = document.createElement('header');
    header.className = 'site-header';
    header.id = 'siteHeader';
    header.innerHTML = `
      <div class="container header-inner">
        <a href="index.html" class="logo" aria-label="Pawan Mode home"><span class="logo-pawan">PAWAN</span><span class="logo-mode">MODE</span></a>
        <nav class="main-nav" aria-label="Main">${navLinks}</nav>
        <div class="hud">
          <div class="hud-stats">
            <span class="hud-clock" id="hudClock" aria-hidden="true">12:00</span>
            <span class="hud-cash" id="hudCash" title="Cart total">₹0</span>
            <span class="wanted" id="hudWanted" title="Wanted level: items in your cart">${stars}</span>
          </div>
          <div class="hud-actions">
            <a href="wishlist.html" class="icon-btn wish-link" aria-label="Wishlist">${icon('heart')}<span class="badge-count" id="wishCount" hidden>0</span></a>
            <a href="cart.html" class="icon-btn" id="cartBtn" aria-label="Cart">${icon('cart')}<span class="badge-count" id="cartCount" hidden>0</span></a>
            <button class="icon-btn" id="phoneBtn" aria-label="Open phone menu" aria-expanded="false" aria-controls="phone">${icon('phone')}</button>
          </div>
        </div>
      </div>`;
    document.body.prepend(header);

    const apps = NAV.map((n, i) => `
      <a class="app ${n.key === page ? 'active' : ''}" href="${n.href}" style="--i:${i};--app-bg:${n.bg}">
        <span class="app-icon">${icon(n.icon, 26)}${n.badge ? `<span class="badge-count" id="${n.badge}" hidden>0</span>` : ''}</span>${n.label}
      </a>`).join('');
    const phoneWrap = document.createElement('div');
    phoneWrap.innerHTML = `
      <div class="phone-overlay" id="phoneOverlay"></div>
      <aside class="phone" id="phone" aria-label="Phone menu" aria-hidden="true">
        <div class="phone-screen">
          <span class="phone-notch"></span>
          <div class="phone-status"><span id="phoneTime">12:00</span><button class="phone-close" id="phoneClose" aria-label="Close phone menu">${icon('close', 16)}</button></div>
          <div class="phone-clock"><b id="phoneBig">12:00</b><span id="phoneDate"></span></div>
          <nav class="apps" aria-label="Phone apps">${apps}</nav>
          <a class="phone-widget" href="cart.html" id="phoneWidget"><span>Cart is empty</span><b>₹0</b></a>
          <div class="phone-homebar"></div>
        </div>
      </aside>`;
    document.body.append(...phoneWrap.children);

    const radar = document.createElement('div');
    radar.className = 'radar-wrap';
    radar.id = 'radar';
    radar.innerHTML = `
      <a href="category.html" class="radar" aria-label="Open categories map">
        ${radarMap()}<span class="radar-sweep"></span><span class="radar-player"></span><span class="radar-n">N</span>
      </a>
      <div class="radar-meter"><span id="shipMeter"></span></div>
      <div class="radar-label" id="shipLabel"></div>`;
    document.body.append(radar);

    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.id = 'siteFooter';
    footer.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            <a href="index.html" class="logo"><span class="logo-pawan">PAWAN</span><span class="logo-mode">MODE</span></a>
            <p class="footer-about">Open-world shopping for streetwear, kicks, gaming gear, rides and racing maps. Gear up, drip out, rule the city.</p>
          </div>
          <div><h4>Shop</h4><ul>${D.categories.map((c) => `<li><a href="category.html?cat=${c.id}">${c.name}</a></li>`).join('')}</ul></div>
          <div><h4>Help</h4><ul>
            <li><a href="how-to-use.html">How to use</a></li>
            <li><a href="how-to-use.html#payments">Payment guide</a></li>
            <li><a href="how-to-use.html#faq">FAQs</a></li>
            <li><a href="cart.html#orders">My orders</a></li>
            <li><a href="blog.html">Blogs</a></li>
          </ul></div>
          <div>
            <h4>Join the crew</h4>
            <p class="muted">Drops, deals and secret codes.</p>
            <form class="newsletter" id="newsletter" novalidate>
              <label class="sr-only" for="nlEmail">Email address</label>
              <input class="input" id="nlEmail" type="email" placeholder="you@example.com" autocomplete="email">
              <button class="btn btn-primary btn-sm" type="submit">Join</button>
            </form>
            <h4 style="margin-top:24px">We accept</h4>
            ${payBadges()}
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} Pawan Mode. All rights reserved.</span>
          <span>Game-inspired theme. Not affiliated with any game publisher.</span>
        </div>
      </div>`;
    document.body.append(footer);

    const overlays = document.createElement('div');
    overlays.innerHTML = `
      <div class="help-box" id="helpBox" role="status" aria-live="polite"></div>
      <div class="banner" id="banner" aria-live="polite"><span class="banner-title" id="bannerTitle"></span><span class="banner-sub" id="bannerSub"></span></div>
      <div class="pickup" id="pickup" aria-live="polite"><small id="pickupLabel"></small><b id="pickupName"></b></div>
      <div class="police" id="police"></div>
      <div class="modal" id="qvModal" role="dialog" aria-modal="true" aria-labelledby="qvTitle"><div class="modal-box" id="qvBox"></div></div>`;
    document.body.append(...overlays.children);

    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#main';
    skip.textContent = 'Skip to content';
    document.body.prepend(skip);
  }

  /* ---------- notifications ---------- */
  let helpTimer;
  function helpText(html, ms = 4200) {
    const el = $('#helpBox');
    if (!el) return;
    el.innerHTML = html;
    el.classList.add('show');
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
  function banner(title, sub = '', opts = {}) {
    const el = $('#banner');
    if (!el) return;
    $('#bannerTitle').textContent = title;
    $('#bannerSub').textContent = sub;
    el.style.setProperty('--banner-c', opts.color || 'var(--gold)');
    el.style.setProperty('--dur', (opts.ms || 2600) + 'ms');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  let pickupTimer;
  function pickup(label, name) {
    const el = $('#pickup');
    if (!el) return;
    $('#pickupLabel').textContent = label;
    $('#pickupName').textContent = name;
    el.classList.add('show');
    clearTimeout(pickupTimer);
    pickupTimer = setTimeout(() => el.classList.remove('show'), 2000);
  }
  let policeTimer;
  function policeFlash() {
    if (reduceMotion) return;
    const el = $('#police');
    el.classList.add('on');
    clearTimeout(policeTimer);
    policeTimer = setTimeout(() => el.classList.remove('on'), 2400);
  }
  function flashWanted() {
    const w = $('#hudWanted');
    if (!w) return;
    w.classList.remove('flash');
    void w.offsetWidth;
    w.classList.add('flash');
    setTimeout(() => w.classList.remove('flash'), 2200);
  }

  /* ---------- HUD ---------- */
  let shownCash = 0, cashRaf = 0;
  function setCash(to, animate) {
    const el = $('#hudCash');
    if (!el) return;
    if (!animate || reduceMotion || shownCash === to) { shownCash = to; el.textContent = inr(to); return; }
    cancelAnimationFrame(cashRaf);
    const from = shownCash, t0 = performance.now(), dur = 750;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      el.textContent = inr(v);
      if (k < 1) cashRaf = requestAnimationFrame(step); else shownCash = to;
    };
    cashRaf = requestAnimationFrame(step);
  }
  function setBadge(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 99 ? '99+' : n;
    el.hidden = !n;
  }
  function syncWishButtons() {
    $$('[data-wish]').forEach((b) => {
      const on = Wish.has(b.dataset.wish);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  function updateHUD(initial) {
    const count = Cart.count(), sub = Cart.subtotal(), wish = Wish.ids().length;
    setCash(sub, !initial);
    $$('#hudWanted svg').forEach((s, i) => s.classList.toggle('on', i < Math.min(5, count)));
    setBadge('cartCount', count);
    setBadge('appCartCount', count);
    setBadge('wishCount', wish);
    setBadge('appWishCount', wish);
    const digitalOnly = count > 0 && Cart.lines().every((l) => l.product.digital);
    const meter = $('#shipMeter');
    if (meter) meter.style.width = (digitalOnly ? 100 : Math.min(100, (sub / C.freeShippingAt) * 100)) + '%';
    const label = $('#shipLabel');
    if (label) {
      label.textContent = digitalOnly ? 'Download only · no delivery fee'
        : sub >= C.freeShippingAt ? 'Free delivery unlocked'
          : sub ? `${inr(C.freeShippingAt - sub)} to free delivery` : `Free delivery over ${inr(C.freeShippingAt)}`;
    }
    const widget = $('#phoneWidget');
    if (widget) widget.innerHTML = `<span>${count ? `${count} item${count > 1 ? 's' : ''} in cart` : 'Cart is empty'}</span><b>${inr(sub)}</b>`;
    syncWishButtons();
  }

  function tickClock() {
    // In-game clock: one real second = one in-game minute.
    const mins = Math.floor(Date.now() / 1000) % 1440;
    const t = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    const real = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const hc = $('#hudClock');
    if (hc) hc.textContent = t;
    const pt = $('#phoneTime');
    if (pt) pt.textContent = real;
    const pb = $('#phoneBig');
    if (pb) pb.textContent = real;
  }

  /* ---------- fly to cart ---------- */
  function flyToCart(fromEl) {
    const target = $('#cartBtn');
    if (!target) return;
    const bumpTarget = () => { target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); };
    if (reduceMotion || !fromEl || !fromEl.animate) { bumpTarget(); return; }
    const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (!a.width) { bumpTarget(); return; }
    const clone = fromEl.cloneNode(true);
    clone.classList.add('fly');
    Object.assign(clone.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
    document.body.appendChild(clone);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = clone.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 90}px) scale(.6) rotate(-20deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.1) rotate(-40deg)`, opacity: 0.4 }
    ], { duration: 820, easing: 'cubic-bezier(.45,0,.7,.2)' });
    anim.onfinish = () => { clone.remove(); bumpTarget(); };
  }

  function addToCart(id, src, qty = 1) {
    const p = byId(id);
    if (!p) return;
    if (p.digital && Cart.has(id)) {
      helpText(`<b>${esc(p.name)}</b> is already in your cart. One copy is all you need.`, 2800);
      return;
    }
    if (p.digital) qty = 1;
    // Launch the fly-to-cart clone first: adding to the cart can re-render the page.
    const root = src && src.closest ? src.closest('.card, .modal-box, .deal, .manual') : null;
    flyToCart(root ? $('.art', root) : null);
    const before = Math.min(5, Cart.count());
    Cart.add(id, qty);
    const after = Math.min(5, Cart.count());
    pickup(qty > 1 ? `ITEM ACQUIRED ×${qty}` : 'ITEM ACQUIRED', p.name);
    if (after > before) {
      flashWanted();
      if (after >= 3) policeFlash();
    }
  }

  /* ---------- scroll lock ---------- */
  let locks = 0;
  function lockScroll() { locks += 1; document.body.style.overflow = 'hidden'; }
  function unlockScroll() { locks = Math.max(0, locks - 1); if (!locks) document.body.style.overflow = ''; }

  /* ---------- quick view modal ---------- */
  let lastFocus = null;
  function openQuickView(id) {
    const p = byId(id);
    if (!p) return;
    const modal = $('#qvModal'), box = $('#qvBox');
    const on = Wish.has(p.id);
    const s = sizeOf(p);
    const spec = (label, value) => (value ? `<div><span>${label}</span><b>${esc(value)}</b></div>` : '');
    const specs = p.digital ? `
      <div class="qv-specs">
        ${spec('Map size', s ? `${p.size} · ${s.label}` : '')}
        ${spec('Track length', p.km ? `${p.km} km` : '')}
        ${spec('Race type', p.mode)}
        ${spec('Checkpoints', p.checkpoints)}
        ${spec('Download', p.mb ? `${p.mb} MB` : '')}
        ${spec('Platform', C.digital && C.digital.platform)}
      </div>` : '';
    const qty = p.digital ? '' : `<div class="qty"><button type="button" data-step="-1" aria-label="Decrease quantity">${icon('minus', 16)}</button><output id="qvQty">1</output><button type="button" data-step="1" aria-label="Increase quantity">${icon('plus', 16)}</button></div>`;
    box.innerHTML = `
      <button class="icon-btn modal-close" data-close aria-label="Close">${icon('close')}</button>
      <div class="qv-media" style="--glow:${glowColor(p, 0.45)}">${tagHTML(p)}${productArt(p)}${sizeBadge(p)}</div>
      <div class="qv-info">
        <span class="card-cat">${esc(catOf(p.cat).name)}${p.digital ? ' · Digital download' : ''}</span>
        <h2 id="qvTitle">${esc(p.name)}</h2>
        ${ratingHTML(p)}
        ${priceHTML(p)}
        <p class="qv-desc">${esc(p.desc)}</p>
        ${specs}
        <ul class="feature-list">${p.features.map((f) => `<li>${icon('check', 16)}<span>${esc(f)}</span></li>`).join('')}</ul>
        ${p.digital && C.digital && C.digital.delivery ? `<p class="dl-note">${icon('download', 18)}<span>${esc(C.digital.delivery)}. No delivery fee.</span></p>` : ''}
        <div class="qv-buy">
          ${qty}
          <button class="btn btn-primary" data-add="${p.id}"${p.digital ? '' : ' data-qty-from="qvQty"'}>${icon('cart', 18)} Add to cart</button>
          <button class="icon-btn wish ${on ? 'on' : ''}" data-wish="${p.id}" aria-pressed="${on}" aria-label="Save to wishlist">${icon('heart')}</button>
        </div>
        <a class="link-btn" href="how-to-use.html#manual-${p.cat}">${p.digital ? 'How to install this map' : 'How to use this product'} ${icon('arrow', 15)}</a>
      </div>`;
    lastFocus = document.activeElement;
    modal.classList.add('open');
    lockScroll();
    setTimeout(() => { const c = $('[data-close]', box); if (c) c.focus(); }, 50);
  }
  function closeQuickView() {
    const modal = $('#qvModal');
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open');
    unlockScroll();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- phone ---------- */
  function setPhone(open) {
    const phone = $('#phone');
    if (!phone || phone.classList.contains('open') === open) return;
    phone.classList.toggle('open', open);
    $('#phoneOverlay').classList.toggle('open', open);
    phone.setAttribute('aria-hidden', String(!open));
    $('#phoneBtn').setAttribute('aria-expanded', String(open));
    if (open) { lockScroll(); setTimeout(() => { const a = $('.app', phone); if (a) a.focus(); }, 300); }
    else { unlockScroll(); $('#phoneBtn').focus(); }
  }

  /* ---------- reveal on scroll ---------- */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
      setTimeout(() => { en.target.style.transitionDelay = ''; }, 1000);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }) : null;
  function mount(root = document) {
    $$('.reveal:not(.in)', root).forEach((el, i) => {
      el.style.transitionDelay = (i % 6) * 70 + 'ms';
      if (io && !reduceMotion) io.observe(el); else el.classList.add('in');
    });
    syncWishButtons();
  }

  /* ---------- curtain, loader, page transitions ---------- */
  const PAGE_HELP = {
    home: 'Welcome to <b>Pawan Mode</b>. Press <kbd>P</kbd> or tap the phone icon to open the menu.',
    category: 'Pick a slot on the <b>loadout wheel</b> to switch category.',
    cart: 'Apply code <b>PAWAN10</b> for 10% off.',
    wishlist: 'Saved gear lives here. Move it to your cart when you\'re ready.',
    checkout: 'Pay with <b>PhonePe, Google Pay, Paytm, card</b> or <b>bank transfer</b>.',
    blog: 'Fresh stories from the streets. Tap a post to read it.',
    howto: 'Scroll down to complete each <b>objective</b>.'
  };
  function openCurtain() {
    const c = $('#curtain');
    if (c) c.classList.remove('is-closed');
    document.body.classList.add('entered');
    const key = 'help_' + page;
    if (PAGE_HELP[page] && !session.get(key)) {
      session.set(key, 1);
      setTimeout(() => helpText(PAGE_HELP[page], 5200), 900);
    }
    document.dispatchEvent(new CustomEvent('pm:entered'));
  }
  function closeCurtain() { const c = $('#curtain'); if (c) c.classList.add('is-closed'); }

  function runLoader(done) {
    const el = document.createElement('div');
    el.className = 'loader';
    el.innerHTML = `
      <div class="world"></div>
      <div class="loader-shade"></div>
      <div class="loader-content">
        <div class="logo loader-logo"><span class="logo-pawan">PAWAN</span><span class="logo-mode">MODE</span></div>
        <p class="loader-tagline">Open-world shopping</p>
      </div>
      <div class="loader-bottom">
        <p class="loader-tip"><b>TIP</b><span></span></p>
        <div class="loader-bar"><span></span></div>
        <p class="loader-skip">Press any key or tap to skip</p>
      </div>`;
    document.body.appendChild(el);
    buildWorld($('.world', el), { seed: 11, cars: 8 });
    lockScroll();
    const tipWrap = $('.loader-tip', el), tip = $('.loader-tip span', el), bar = $('.loader-bar span', el);
    let ti = Math.floor(Math.random() * D.tips.length);
    tip.innerHTML = D.tips[ti % D.tips.length];
    const tipTimer = setInterval(() => {
      tipWrap.style.opacity = 0;
      setTimeout(() => { ti += 1; tip.innerHTML = D.tips[ti % D.tips.length]; tipWrap.style.opacity = 1; }, 280);
    }, 1900);
    const total = 3400, t0 = performance.now();
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(tipTimer);
      window.removeEventListener('keydown', finish);
      window.removeEventListener('pointerdown', finish);
      bar.style.width = '100%';
      setTimeout(() => {
        el.classList.add('done');
        unlockScroll();
        done();
        setTimeout(() => el.remove(), 800);
      }, 220);
    }
    (function frame(t) {
      if (finished) return;
      const k = Math.min(1, (t - t0) / total);
      bar.style.width = (100 * (1 - Math.pow(1 - k, 2))).toFixed(1) + '%';
      if (k >= 1) finish(); else requestAnimationFrame(frame);
    })(t0);
    window.addEventListener('keydown', finish);
    window.addEventListener('pointerdown', finish);
  }

  /* ---------- global events ---------- */
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      const add = t.closest('[data-add]');
      if (add) {
        e.preventDefault();
        const qEl = add.dataset.qtyFrom ? document.getElementById(add.dataset.qtyFrom) : null;
        addToCart(add.dataset.add, add, qEl ? Math.max(1, parseInt(qEl.textContent, 10) || 1) : 1);
        return;
      }
      const wish = t.closest('[data-wish]');
      if (wish) {
        e.preventDefault();
        const p = byId(wish.dataset.wish);
        const on = Wish.toggle(wish.dataset.wish);
        wish.classList.remove('pop'); void wish.offsetWidth; wish.classList.add('pop');
        helpText(on ? `<b>${esc(p.name)}</b> saved to your wishlist.` : `Removed <b>${esc(p.name)}</b> from your wishlist.`, 2600);
        return;
      }
      const view = t.closest('[data-view]');
      if (view) { e.preventDefault(); openQuickView(view.dataset.view); return; }
      const step = t.closest('#qvBox [data-step]');
      if (step) {
        const out = $('#qvQty');
        out.textContent = Math.min(10, Math.max(1, (parseInt(out.textContent, 10) || 1) + +step.dataset.step));
        return;
      }
      if (t.closest('[data-close]') || t.id === 'qvModal') { closeQuickView(); return; }
      if (t.closest('#phoneBtn')) { setPhone(!$('#phone').classList.contains('open')); return; }
      if (t.closest('#phoneClose') || t.id === 'phoneOverlay') { setPhone(false); return; }
    });

    // Page transitions: close the letterbox, then navigate.
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('href').charAt(0) === '#') return;
      let url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin || !/^https?:|^file:/.test(url.protocol)) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (reduceMotion) return;
      e.preventDefault();
      setPhone(false);
      closeCurtain();
      setTimeout(() => { location.href = url.href; }, 500);
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) openCurtain(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeQuickView();
        setPhone(false);
        document.dispatchEvent(new CustomEvent('pm:escape'));
        return;
      }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-view]')) {
        e.preventDefault();
        openQuickView(e.target.dataset.view);
        return;
      }
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
        setPhone(!$('#phone').classList.contains('open'));
      }
    });

    const nl = $('#newsletter');
    if (nl) nl.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#nlEmail');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim())) {
        helpText('Enter a valid email address to join the crew.', 3000);
        input.focus();
        return;
      }
      input.value = '';
      banner('WELCOME TO THE CREW', 'Watch your inbox for drops and codes', { ms: 2400 });
    });

    // Header background, radar rotation + visibility, parallax.
    // The radar sits in the page gutter on wide screens; on laptop widths it would cover
    // content, so there it only shows near the top of the page.
    const header = $('#siteHeader'), radarMapEl = $('#radarMap'), radar = $('#radar'), footer = $('#siteFooter');
    let footerVisible = false;
    const syncRadar = () => {
      if (!radar) return;
      const roomy = window.innerWidth >= 1520;
      radar.classList.toggle('hide', footerVisible || (!roomy && (page !== 'home' || window.scrollY > 160)));
    };
    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 20);
      if (radarMapEl && !reduceMotion) radarMapEl.style.transform = `rotate(${(window.scrollY * 0.05).toFixed(1)}deg)`;
      syncRadar();
      queueParallax();
    };
    window.addEventListener('resize', syncRadar);
    if (footer && 'IntersectionObserver' in window) {
      new IntersectionObserver((en) => { footerVisible = en[0].isIntersecting; syncRadar(); }).observe(footer);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    let tiltCard = null;
    const resetTilt = (c) => { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); };
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || reduceMotion) return;
      mx = e.clientX / window.innerWidth;
      queueParallax();
      const c = e.target.closest ? e.target.closest('.card') : null;
      if (c !== tiltCard) { if (tiltCard) resetTilt(tiltCard); tiltCard = c; }
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 9).toFixed(2) + 'deg');
      c.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - 0.5) * 9).toFixed(2) + 'deg');
    }, { passive: true });
  }

  /* ---------- boot ---------- */
  renderChrome();
  $$('[data-world]').forEach((el) => buildWorld(el));
  bindEvents();
  updateHUD(true);
  tickClock();
  setInterval(tickClock, 1000);
  const pd = $('#phoneDate');
  if (pd) pd.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  window.PM = {
    D, C, $, $$, esc, inr, byId, catOf, art, productArt, glowColor, icon, card, ratingHTML, priceHTML, tagHTML, payBadges,
    SIZES, sizeOf, sizeBadge, mapSpecs, sizeTier,
    Cart, Wish, totals, getCoupon, setCoupon, store, session, onChange, mount, helpText, banner, pickup, addToCart,
    api, MyOrders, downloadMap,
    openQuickView, buildWorld, lockScroll, unlockScroll, reduceMotion, rng
  };

  /* ---------- visitor count ----------
     One small, anonymous ping per page view so the shop owner can see how
     many people visit. No cookies; only the page and the site that sent
     the visitor (its domain name) are sent. Skipped for visitors who ask
     not to be tracked. */
  try {
    const optOut = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    if (!optOut && /^https?:$/.test(location.protocol)) {
      let ref = '';
      try { const r = new URL(document.referrer); if (r.host !== location.host) ref = r.hostname; } catch (e) { /* no referrer */ }
      const src = new URLSearchParams(location.search).get('utm_source') || '';
      fetch('/api/visit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true,
        body: JSON.stringify({ path: location.pathname, ref, src })
      }).catch(() => {});
    }
  } catch (e) { /* counting must never break the page */ }

  const firstVisit = !session.get('booted') && !reduceMotion;
  if (firstVisit) {
    runLoader(() => { session.set('booted', 1); openCurtain(); });
  } else {
    setTimeout(openCurtain, 140);
  }
})();
