/* ============================================================
   Admin panel
     Overview     orders done / in progress / with issues, sales, visitors
     Orders       check payments, ship, cancel, handle issues
     Racing maps  add maps to sell, upload their files, hide them
   Talks only to /api/admin. The login token is kept in this tab
   (sessionStorage) and is gone when the tab closes.
   ============================================================ */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
  const num = (n) => Math.round(n || 0).toLocaleString('en-IN');
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const dayLabel = (d, long) => new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
  const mb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;
  const ART = window.PM_ART;
  const artSVG = (type, c1, c2) => (ART ? ART.svg(type, c1, c2) : '');

  const METHOD = { phonepe: 'PhonePe', gpay: 'Google Pay', paytm: 'Paytm', card: 'Card', bank: 'Bank transfer' };
  const ACTION = {
    paid: { label: 'Mark as paid', cls: 'btn-cash', confirm: 'Only mark this paid once you have seen the money in your account. Continue?' },
    shipped: { label: 'Mark as shipped', cls: 'btn-primary' },
    delivered: { label: 'Mark as delivered', cls: 'btn-ghost' },
    cancelled: { label: 'Cancel order', cls: 'btn-danger', confirm: 'Cancel this order? If the buyer already paid, refund them yourself.' }
  };
  const ORDER_TABS = [
    ['action', 'Needs action'], ['issues', 'Issues'], ['pending_verification', 'Check payment'], ['paid', 'To ship'],
    ['shipped', 'Shipped'], ['completed', 'Completed'], ['awaiting_payment', 'Not paid yet'], ['cancelled', 'Cancelled'], ['all', 'All']
  ];
  const PAGES = { '/': 'Home', '/category': 'Categories', '/cart': 'Cart', '/wishlist': 'Wishlist', '/checkout': 'Checkout', '/blog': 'Blogs', '/how-to-use': 'How to use' };
  // Chart colours, checked for colour-blind separation and contrast on the dark panel.
  const C_VISITS = '#1a9cc0';
  const C_SALES = '#c08a0c';

  const root = $('#admin');
  const drawer = $('#drawer'), drawerBox = $('#drawerBox');
  let token = null;
  try { token = sessionStorage.getItem('pm_admin'); } catch (e) { /* private mode */ }
  let tab = 'overview';
  let view = 'action', search = '', offset = 0, rows = [];
  let overview = null, maps = null, mapOptions = null, lastFocus = null;

  /* ---------- API ---------- */
  async function api(path, body, method) {
    const opts = { method: method || (body !== undefined ? 'POST' : 'GET'), headers: { Accept: 'application/json' } };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(`/api/admin${path}`, opts); } catch (e) { throw new Error('Cannot reach the server. Check your connection.'); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') { setToken(null); showLogin('Your session ended. Please log in again.'); throw new Error('Please log in again.'); }
    if (!res.ok) { const err = new Error(data.error || `Request failed (${res.status})`); err.fields = data.fields; throw err; }
    return data;
  }
  // File uploads use XHR so we can show progress.
  function uploadFile(id, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/admin/products/${encodeURIComponent(id)}/file`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) { /* not JSON */ }
        if (xhr.status === 401) { setToken(null); showLogin('Your session ended. Please log in again.'); }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data); else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
      xhr.send(file);
    });
  }
  function setToken(t) {
    token = t;
    try { if (t) sessionStorage.setItem('pm_admin', t); else sessionStorage.removeItem('pm_admin'); } catch (e) { /* ignore */ }
  }

  let toastTimer = 0;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 3400);
  }

  /* ---------- login ---------- */
  function showLogin(msg) {
    $('#topSide').hidden = true;
    $('#adNav').hidden = true;
    closeDrawer();
    root.innerHTML = `
      <form class="panel ad-login" id="loginForm" novalidate>
        <h1>Admin login</h1>
        <p class="muted">For the shop owner only.</p>
        <div class="field">
          <label for="pw">Password</label>
          <input class="input" id="pw" type="password" autocomplete="current-password" required>
          <span class="err" id="pwErr">${esc(msg || '')}</span>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Log in</button>
      </form>`;
    $('#pw').focus();
  }

  /* ---------- tabs ---------- */
  function showTab(name) {
    tab = ['overview', 'orders', 'maps'].includes(name) ? name : 'overview';
    $$('#adNav [data-tab]').forEach((b) => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', `#${tab}`);
    closeDrawer();
    if (tab === 'overview') renderOverview();
    else if (tab === 'orders') renderOrders();
    else renderMaps();
  }
  function startApp() {
    $('#topSide').hidden = false;
    $('#adNav').hidden = false;
    showTab(location.hash.slice(1));
  }
  function setModePill(mode) {
    const mp = $('#modePill');
    mp.textContent = mode === 'razorpay' ? 'Payments live' : mode === 'demo' ? 'Test payments' : 'Manual payments only';
    mp.className = mode === 'razorpay' ? 'pill' : 'pill pending';
  }

  /* ============================================================
     OVERVIEW
     ============================================================ */
  const tile = (label, big, small, opts = {}) => {
    const tag = opts.goto ? 'button' : 'div';
    return `<${tag} class="ad-stat ${opts.cls || ''}" ${opts.goto ? `type="button" data-goto="${opts.goto}"` : ''}><span>${label}</span><b>${big}</b><small>${small}</small></${tag}>`;
  };

  async function renderOverview() {
    root.innerHTML = '<p class="muted">Loading…</p>';
    try { overview = await api('/overview'); } catch (e) { if (token) root.innerHTML = `<div class="ad-empty">${esc(e.message)}</div>`; return; }
    if (tab !== 'overview') return;
    setModePill(overview.paymentMode);
    const o = overview.orders, s = overview.sales, v = overview.visitors;
    const warn = overview.warnings.map((w) => `<div class="demo-note"><span>${esc(w)}</span></div>`).join('');
    root.innerHTML = `
      ${warn ? `<div class="ad-warn">${warn}</div>` : ''}
      <section class="ad-sec-block" aria-labelledby="hOrders">
        <h2 class="ad-h" id="hOrders">Orders</h2>
        <div class="ad-stats">
          ${tile('Completed', num(o.completed), 'Delivered, or maps paid and ready', { goto: 'completed', cls: 'cash' })}
          ${tile('In progress', num(o.inProgress), `${num(o.checkPayment)} to check · ${num(o.toShip)} to ship · ${num(o.shipped)} shipped`, { goto: 'action' })}
          ${tile('Issues', num(o.issues), o.issues ? 'Need a look from you' : 'Nothing wrong right now', { goto: 'issues', cls: o.issues ? 'bad' : '' })}
          ${tile('Not paid yet', num(o.notPaid), 'Checkouts not finished', { goto: 'awaiting_payment' })}
          ${tile('Cancelled', num(o.cancelled), `${plural(o.placed, 'order')} placed in total`, { goto: 'cancelled' })}
        </div>
      </section>
      <section class="ad-sec-block" aria-labelledby="hSales">
        <h2 class="ad-h" id="hSales">Sales</h2>
        <div class="ad-stats">
          ${tile('Today', inr(s.today.amount), plural(s.today.count, 'paid order'), { cls: 'cash' })}
          ${tile('Last 7 days', inr(s.week.amount), plural(s.week.count, 'paid order'))}
          ${tile('Last 30 days', inr(s.month.amount), plural(s.month.count, 'paid order'))}
          ${tile('All time', inr(s.allTime.amount), plural(s.allTime.count, 'paid order'))}
        </div>
      </section>
      <section class="ad-sec-block" aria-labelledby="hVisitors">
        <h2 class="ad-h" id="hVisitors">Visitors</h2>
        ${v.enabled ? '' : '<p class="muted">Visitor counting is switched off (COUNT_VISITORS=false).</p>'}
        <div class="ad-stats">
          ${tile('Today', num(v.today.visitors), plural(v.today.views, 'page view'))}
          ${tile('Last 7 days', num(v.week.visitors), plural(v.week.views, 'page view'))}
          ${tile('Last 30 days', num(v.month.visitors), plural(v.month.views, 'page view'))}
          ${tile('Bought something', overview.conversion == null ? '—' : `${overview.conversion}%`, 'Of visitors, last 30 days')}
        </div>
        <p class="ad-fine">A visitor is counted once a day. No cookies are used and no IP addresses are stored. Bots and people who ask not to be tracked are not counted.</p>
      </section>
      <section class="ad-charts" aria-label="Last 30 days">
        <figure class="panel ad-chart">
          <figcaption><b>Visitors per day</b><span>Last 30 days</span></figcaption>
          <div class="ad-plot" data-chart="visitors"></div>
        </figure>
        <figure class="panel ad-chart">
          <figcaption><b>Sales per day</b><span>Last 30 days, paid orders</span></figcaption>
          <div class="ad-plot" data-chart="sales"></div>
        </figure>
      </section>
      <details class="ad-table-wrap">
        <summary>Show the last 30 days as a table</summary>
        <div class="ad-table-scroll"><table class="ad-table">
          <thead><tr><th scope="col">Day</th><th scope="col">Visitors</th><th scope="col">Page views</th><th scope="col">Paid orders</th><th scope="col">Sales</th></tr></thead>
          <tbody>${overview.series.slice().reverse().map((d) => `<tr><th scope="row">${esc(dayLabel(d.day, true))}</th><td>${num(d.visitors)}</td><td>${num(d.views)}</td><td>${num(d.orders)}</td><td>${inr(d.sales)}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>
      <section class="ad-lists">
        <div class="panel">
          <h3 class="ad-h3">Most viewed pages <small>Last 7 days</small></h3>
          ${barList(v.topPages.map((p) => [PAGES[p.path] || p.path, p.views]), 'No page views yet.')}
        </div>
        <div class="panel">
          <h3 class="ad-h3">Where visitors come from <small>Last 7 days</small></h3>
          ${barList(v.topSources.map((p) => [p.source, p.visits]), 'No visitors yet.')}
        </div>
      </section>`;
    drawCharts();
  }

  // Horizontal bars: the length shows the count, the number is always written next to it.
  function barList(items, empty) {
    if (!items.length) return `<p class="muted">${empty}</p>`;
    const max = Math.max(...items.map((i) => i[1]), 1);
    return `<ol class="ad-bars">${items.map(([label, n]) => `
      <li><span class="ad-bars-label">${esc(label)}</span><span class="ad-bars-track"><i style="width:${Math.max(2, (n / max) * 100).toFixed(1)}%"></i></span><b>${num(n)}</b></li>`).join('')}</ol>`;
  }

  /* ---------- column chart (one series, hover for exact numbers) ---------- */
  // A round top for the y axis whose halfway line is a whole number (4, 6, 8, 10, 20, 40…).
  function niceMax(v) {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 4, 6, 8, 10]) if (m * p >= v) return m * p;
    return v;
  }
  function drawCharts() {
    if (!overview) return;
    $$('[data-chart]').forEach((el) => {
      const sales = el.dataset.chart === 'sales';
      drawChart(el, overview.series, sales ? 'sales' : 'visitors', sales ? C_SALES : C_VISITS, sales ? inr : num);
    });
  }
  function drawChart(el, series, key, color, fmt) {
    const W = Math.max(280, el.clientWidth), H = 170;
    const padL = 46, padR = 6, padT = 10, padB = 24;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const max = niceMax(Math.max(...series.map((d) => d[key])));
    const step = plotW / series.length;
    const barW = Math.max(2, step - 2); // 2px gap between bars
    const base = padT + plotH;
    const grid = [0, max / 2, max].map((g) => {
      const y = base - (g / max) * plotH;
      return `<line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="ad-grid"/><text x="${padL - 8}" y="${(y + 4).toFixed(1)}" class="ad-axis" text-anchor="end">${esc(fmt(g))}</text>`;
    }).join('');
    const bars = series.map((d, i) => {
      const v = d[key];
      const x = padL + i * step + 1;
      const h = (v / max) * plotH;
      const hit = `<rect class="ad-hit" data-i="${i}" x="${(padL + i * step).toFixed(1)}" y="${padT}" width="${step.toFixed(1)}" height="${plotH}"/>`;
      if (!v) return hit;
      const r = Math.min(4, barW / 2, h);
      const y = base - h;
      return `<path class="ad-bar" data-bar="${i}" fill="${color}" d="M${x.toFixed(1)} ${base}V${(y + r).toFixed(1)}Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)}H${(x + barW - r).toFixed(1)}Q${(x + barW).toFixed(1)} ${y.toFixed(1)} ${(x + barW).toFixed(1)} ${(y + r).toFixed(1)}V${base}Z"/>${hit}`;
    }).join('');
    const ticks = [0, Math.floor((series.length - 1) / 2), series.length - 1].map((i) => {
      const x = padL + i * step + step / 2;
      const anchor = i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle';
      return `<text x="${(anchor === 'start' ? padL : anchor === 'end' ? W - padR : x).toFixed(1)}" y="${H - 6}" class="ad-axis" text-anchor="${anchor}">${esc(dayLabel(series[i].day))}</text>`;
    }).join('');
    const total = series.reduce((s, d) => s + d[key], 0);
    const label = key === 'sales' ? `Sales per day for the last 30 days, ${inr(total)} in total` : `Visitors per day for the last 30 days, ${num(total)} in total`;
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${bars}${ticks}</svg>${total ? '' : `<p class="ad-plot-empty">${key === 'sales' ? 'No sales in the last 30 days yet.' : 'No visitors counted yet.'}</p>`}`;
    el.dataset.key = key;
  }
  function chartTip(e) {
    const hit = e.target.closest && e.target.closest('.ad-hit');
    const tip = $('#chartTip');
    $$('.ad-bar.on').forEach((b) => b.classList.remove('on'));
    if (!hit || !overview) { tip.hidden = true; return; }
    const plot = hit.closest('[data-chart]');
    const d = overview.series[+hit.dataset.i];
    const bar = $(`[data-bar="${hit.dataset.i}"]`, plot);
    if (bar) bar.classList.add('on');
    tip.innerHTML = plot.dataset.key === 'sales'
      ? `<b>${esc(dayLabel(d.day, true))}</b>${inr(d.sales)} · ${plural(d.orders, 'paid order')}`
      : `<b>${esc(dayLabel(d.day, true))}</b>${plural(d.visitors, 'visitor')} · ${plural(d.views, 'page view')}`;
    tip.hidden = false;
    const r = hit.getBoundingClientRect();
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2))}px`;
    tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
  }
  document.addEventListener('pointerover', chartTip);
  document.addEventListener('scroll', () => { $('#chartTip').hidden = true; }, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (tab === 'overview') drawCharts(); }, 150); });

  /* ============================================================
     ORDERS
     ============================================================ */
  function renderOrders() {
    root.innerHTML = `
      <div class="ad-bar">
        <div class="ad-tabs" role="group" aria-label="Filter orders">${ORDER_TABS.map(([k, l]) => `<button class="ad-tab ${k === 'issues' ? 'ad-tab-issues' : ''}" type="button" data-view="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div>
        <form class="ad-search" id="searchForm" role="search">
          <label class="sr-only" for="q">Search orders</label>
          <input class="input" id="q" type="search" placeholder="Order no., name, phone, UTR" value="${esc(search)}" autocomplete="off">
          <button class="btn btn-ghost btn-sm" type="submit">Search</button>
        </form>
      </div>
      <div class="ad-list" id="list" aria-live="polite"><p class="muted">Loading orders…</p></div>
      <div id="moreBox"></div>`;
    loadList(false);
  }

  function rowHTML(o) {
    const kind = o.digital && o.physical ? 'Gear + maps' : o.digital ? 'Racing maps' : 'Gear';
    return `
      <button class="ad-row ${o.issues.length ? 'has-issue' : ''}" type="button" data-order="${esc(o.id)}">
        <div class="c-id"><b>#${esc(o.id)}</b><small>${esc(when(o.createdAt))}</small></div>
        <div class="c-who">${esc(o.name)}<small>${esc(o.phone)}${o.city ? ' · ' + esc(o.city) : ''}</small></div>
        <div class="c-pay">${esc(METHOD[o.method] || 'Not chosen')}<small>${o.reference ? 'Ref ' + esc(o.reference) : esc(kind)}</small></div>
        <div class="c-amt amt">${inr(o.total)}</div>
        <div class="c-st"><span class="st st-${esc(o.status)}">${esc(o.statusLabel)}</span></div>
        ${o.issues.length ? `<div class="c-issue">⚠ ${esc(o.issues.join(' · '))}</div>` : ''}
      </button>`;
  }

  async function loadList(append) {
    if (!append) { offset = 0; rows = []; }
    const list = $('#list');
    if (!list) return;
    try {
      const qs = new URLSearchParams({ status: view, offset: String(offset) });
      if (search) qs.set('q', search);
      const data = await api(`/orders?${qs}`);
      if (!$('#list')) return;
      rows = rows.concat(data.orders);
      offset = rows.length;
      const empty = search ? 'No orders match your search.' : view === 'action' ? 'All caught up. Nothing needs your attention.' : view === 'issues' ? 'No issues. Every order looks fine.' : 'No orders here yet.';
      list.innerHTML = rows.length ? rows.map(rowHTML).join('') : `<div class="ad-empty">${empty}</div>`;
      $('#moreBox').innerHTML = data.more ? '<button class="btn btn-ghost btn-sm ad-more" type="button" id="more">Load more</button>' : '';
    } catch (e) { list.innerHTML = `<div class="ad-empty">${esc(e.message)}</div>`; }
  }

  function orderHTML(o) {
    const c = o.customer;
    const items = o.items.map((i) => `<div class="ad-item"><span>${esc(i.name)} <small>${i.digital ? 'download' : '× ' + i.qty}</small></span><b>${inr(i.total)}</b></div>`).join('');
    const address = o.physical ? `${esc(c.line1)}${c.line2 ? ', ' + esc(c.line2) : ''}<br>${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode)}` : 'Not needed (downloads only)';
    const checkNote = o.status === 'pending_verification'
      ? `<div class="ad-check">Before marking this paid, find <b>${inr(o.total)}</b> with reference <b>${esc(o.reference)}</b> in your ${o.method === 'bank' ? 'bank statement' : 'UPI app'}.</div>` : '';
    const issues = o.issues.length ? `
      <div class="ad-issues">
        <h3>⚠ ${o.issues.length === 1 ? 'Issue' : `${o.issues.length} issues`}</h3>
        <ul>${o.issues.map((i) => `<li><b>${esc(i.label)}</b><span>${esc(i.help)}</span>${i.detail ? `<em>${esc(i.detail)}</em>` : ''}</li>`).join('')}</ul>
        <label class="sr-only" for="issueNote">What you did (optional)</label>
        <textarea class="ad-note" id="issueNote" maxlength="300" placeholder="What you did, e.g. refunded on 12 Nov (optional)"></textarea>
        <div class="ad-actions"><button class="btn btn-sm btn-ghost" type="button" data-handled>Mark as handled</button></div>
      </div>` : '';
    const actions = o.nextStatuses.length ? `
      <div class="ad-sec">
        <h3>Update order</h3>
        ${checkNote}
        <label class="sr-only" for="note">Note (optional)</label>
        <textarea class="ad-note" id="note" maxlength="300" placeholder="Note for the history, e.g. courier and tracking number (optional)"></textarea>
        <div class="ad-actions">${o.nextStatuses.map((s) => `<button class="btn btn-sm ${ACTION[s].cls}" type="button" data-set="${s}">${ACTION[s].label}</button>`).join('')}</div>
      </div>` : '';
    const dl = o.downloads.length ? `
      <div class="ad-sec"><h3>Map downloads</h3><div class="ad-items">${o.downloads.map((d) => `<div class="ad-item"><span>${esc(d.name)}</span><small>${d.fileReady ? `${d.used} of ${d.limit} used` : 'File missing: upload it under Racing maps'}</small></div>`).join('')}</div></div>` : '';
    return `
      <div class="ad-drawer-head">
        <div><h2 id="drawerTitle">#${esc(o.id)}</h2><p>${esc(when(o.createdAt))} · <span class="st st-${esc(o.status)}">${esc(o.statusLabel)}</span></p></div>
        <button class="ad-x" type="button" data-close aria-label="Close">×</button>
      </div>
      ${issues}
      <div class="ad-items">${items}</div>
      ${o.discount ? `<div class="ad-item"><span>Coupon ${esc(o.coupon)}</span><b>− ${inr(o.discount)}</b></div>` : ''}
      ${o.physical ? `<div class="ad-item"><span>Delivery</span><b>${o.shipping ? inr(o.shipping) : 'Free'}</b></div>` : ''}
      <div class="ad-total"><span>Total</span><b>${inr(o.total)}</b></div>
      ${actions}
      <div class="ad-sec">
        <h3>Customer</h3>
        <div class="ad-kv">
          <span>Name</span><b>${esc(c.name)}</b>
          <span>Phone</span><b><a href="tel:+91${esc(c.phone)}">${esc(c.phone)}</a></b>
          <span>Email</span><b>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</b>
          <span>Address</span><b>${address}</b>
        </div>
      </div>
      <div class="ad-sec">
        <h3>Payment</h3>
        <div class="ad-kv">
          <span>Method</span><b>${esc(METHOD[o.method] || 'Not chosen yet')}</b>
          <span>Handled by</span><b>${esc({ razorpay: 'Razorpay', demo: 'Test mode (no money moved)', manual: 'You (manual check)' }[o.provider] || '—')}</b>
          ${o.reference ? `<span>Reference</span><b>${esc(o.reference)}</b>` : ''}
          ${o.gatewayPaymentId ? `<span>Razorpay payment</span><b>${esc(o.gatewayPaymentId)}</b>` : ''}
          ${o.gatewayOrderId ? `<span>Razorpay order</span><b>${esc(o.gatewayOrderId)}</b>` : ''}
          ${o.paidAt ? `<span>Paid at</span><b>${esc(when(o.paidAt))}</b>` : ''}
        </div>
      </div>
      ${dl}
      <div class="ad-sec">
        <h3>History</h3>
        <ol class="ad-events">${o.events.map((e) => `<li><time>${esc(when(e.at))}</time><div><b>${esc(e.type.replace(/_/g, ' '))}</b> · ${esc(e.actor)}${e.detail ? `<em>${esc(e.detail)}</em>` : ''}</div></li>`).join('')}</ol>
      </div>`;
  }

  function openDrawer(html) {
    lastFocus = document.activeElement;
    drawerBox.innerHTML = html;
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  async function openOrder(id) {
    openDrawer('<p class="muted">Loading…</p>');
    try {
      const { order } = await api(`/orders/${encodeURIComponent(id)}`);
      drawerBox.innerHTML = orderHTML(order);
      drawerBox.dataset.id = order.id;
      $('[data-close]', drawerBox).focus();
    } catch (e) { drawerBox.innerHTML = `<button class="ad-x" type="button" data-close aria-label="Close">×</button><p>${esc(e.message)}</p>`; }
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    document.body.style.overflow = '';
    drawerBox.dataset.id = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  async function orderAction(path, body, btn, done) {
    btn.disabled = true;
    try {
      const { order } = await api(`/orders/${encodeURIComponent(drawerBox.dataset.id)}${path}`, body);
      drawerBox.innerHTML = orderHTML(order);
      toast(done(order));
      if (tab === 'orders') loadList(false);
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }

  /* ============================================================
     RACING MAPS
     ============================================================ */
  async function renderMaps() {
    root.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const data = await api('/products');
      maps = data.products;
      mapOptions = data.options;
    } catch (e) { if (token) root.innerHTML = `<div class="ad-empty">${esc(e.message)}</div>`; return; }
    if (tab !== 'maps') return;
    const live = maps.filter((m) => m.active).length;
    const missing = maps.filter((m) => m.active && !m.file.ready).length;
    root.innerHTML = `
      <div class="ad-maps-head">
        <div>
          <h2 class="ad-h">Racing maps</h2>
          <p class="muted">${plural(live, 'map')} on sale${missing ? ` · <span class="ad-warn-text">${plural(missing, 'map')} without a file</span>` : ''}. Files stay private: buyers only get one-time links after paying.</p>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-add-map>+ Add a map</button>
      </div>
      <div class="ad-maps">${maps.map(mapCard).join('')}</div>`;
  }

  function mapCard(m) {
    const sizeName = m.size && mapOptions.sizes[m.size] ? `${m.size} · ${mapOptions.sizes[m.size].label}` : 'Custom price';
    const file = m.file.ready
      ? `<span class="ad-file ok">✓ File ready · ${mb(m.file.bytes)}</span>`
      : '<span class="ad-file missing">⚠ No file yet</span>';
    return `
      <article class="ad-map ${m.active ? '' : 'is-hidden'}" data-map="${esc(m.id)}">
        <div class="ad-map-art">${artSVG(m.art, m.colors[0], m.colors[1])}</div>
        <div class="ad-map-body">
          <div class="ad-map-tags">
            <span class="ad-chip">${esc(sizeName)}</span>
            <span class="ad-chip ${m.source === 'added' ? 'chip-added' : ''}">${m.source === 'added' ? 'Added here' : 'Built-in'}</span>
            ${m.active ? '' : '<span class="ad-chip chip-hidden">Hidden</span>'}
          </div>
          <h3>${esc(m.name)}</h3>
          <p class="ad-map-meta">${inr(m.price)}${m.km ? ` · ${esc(m.km)} km` : ''}${m.mode ? ` · ${esc(m.mode)}` : ''}</p>
          <p class="ad-map-meta">${plural(m.sold.count, 'sale')}${m.sold.revenue ? ` · ${inr(m.sold.revenue)}` : ''}</p>
          ${file}
          <div class="ad-progress" hidden><i></i></div>
          <div class="ad-map-actions">
            <label class="btn btn-ghost btn-sm ad-upload">${m.file.ready ? 'Replace file' : 'Upload .zip'}<input type="file" accept=".zip,application/zip" data-upload="${esc(m.id)}" class="sr-only"></label>
            ${m.source === 'added' ? `<button class="btn btn-ghost btn-sm" type="button" data-edit-map="${esc(m.id)}">Edit</button>
              <button class="btn btn-ghost btn-sm" type="button" data-toggle-map="${esc(m.id)}">${m.active ? 'Hide from shop' : 'Put on sale'}</button>` : ''}
          </div>
        </div>
      </article>`;
  }

  function mapFormHTML(m) {
    const o = mapOptions;
    const v = m || { name: '', size: 'M', price: null, mrp: null, km: '', mb: '', mode: 'Circuit', checkpoints: '', desc: '', features: [], art: o.arts[0], colors: ['#2ad8ff', '#ffc61a'], tag: 'new', featured: false };
    const f = (id, label, input, hint) => `<div class="field ${id === 'desc' || id === 'features' || id === 'name' ? 'full' : ''}"><label for="m_${id}">${label}</label>${input}${hint ? `<small class="ad-hint">${hint}</small>` : ''}<span class="err" data-err="${id}"></span></div>`;
    const sizeOpts = Object.entries(o.sizes).map(([k, s]) => `<option value="${k}" ${v.size === k ? 'selected' : ''}>${k} · ${esc(s.label)} · ${inr(s.price)}</option>`).join('');
    // Built-in maps set their own price only when it differs from the size price.
    const customPrice = m && m.size && o.sizes[m.size] && m.price === o.sizes[m.size].price ? '' : (m ? m.price : '');
    const customMrp = m && m.size && o.sizes[m.size] && m.mrp === o.sizes[m.size].mrp ? '' : (m && m.mrp != null ? m.mrp : '');
    return `
      <div class="ad-drawer-head">
        <div><h2 id="drawerTitle">${m ? 'Edit map' : 'Add a racing map'}</h2><p>${m ? 'Changes show in the shop straight away.' : 'It goes on sale as soon as you save it.'}</p></div>
        <button class="ad-x" type="button" data-close aria-label="Close">×</button>
      </div>
      <form id="mapForm" class="ad-form" novalidate data-id="${m ? esc(m.id) : ''}">
        <div class="ad-preview" id="mapPreview"></div>
        <div class="form-grid ad-grid2">
          ${f('name', 'Map name', `<input class="input" id="m_name" maxlength="60" value="${esc(v.name)}" placeholder="e.g. Dockside Night Run" required>`)}
          ${f('size', 'Size', `<select class="select" id="m_size">${sizeOpts}</select>`, `<span id="sizeHint">${esc((o.sizes[v.size] || {}).detail || '')}</span>. Sets the price.`)}
          ${f('price', 'Own price (₹)', `<input class="input" id="m_price" inputmode="numeric" value="${esc(customPrice)}" placeholder="Leave empty to use the size price">`)}
          ${f('mrp', '"Was" price (₹)', `<input class="input" id="m_mrp" inputmode="numeric" value="${esc(customMrp)}" placeholder="Optional, shows a discount">`)}
          ${f('mode', 'Race type', `<select class="select" id="m_mode">${o.modes.map((x) => `<option ${v.mode === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`)}
          ${f('km', 'Track length (km)', `<input class="input" id="m_km" inputmode="decimal" value="${esc(v.km == null ? '' : v.km)}" placeholder="4.4">`)}
          ${f('checkpoints', 'Checkpoints', `<input class="input" id="m_checkpoints" inputmode="numeric" value="${esc(v.checkpoints == null ? '' : v.checkpoints)}" placeholder="22">`)}
          ${f('mb', 'Download size (MB)', `<input class="input" id="m_mb" inputmode="numeric" value="${esc(v.mb == null ? '' : v.mb)}" placeholder="32">`)}
          ${f('desc', 'Description', `<textarea class="textarea" id="m_desc" maxlength="600" rows="3" placeholder="What makes this track fun to race?">${esc(v.desc)}</textarea>`)}
          ${f('features', 'Highlights (one per line, up to 6)', `<textarea class="textarea" id="m_features" rows="3" placeholder="Lap circuit, 22 checkpoints&#10;Night lighting&#10;Install guide included">${esc((v.features || []).join('\n'))}</textarea>`)}
        </div>
        <fieldset class="ad-fieldset">
          <legend>Artwork</legend>
          <div class="ad-arts">${o.arts.map((a) => `<label class="ad-art-pick"><input type="radio" name="m_art" value="${a}" ${v.art === a ? 'checked' : ''}><span>${artSVG(a, v.colors[0], v.colors[1])}</span></label>`).join('')}</div>
          <div class="ad-colors">
            <label>Main colour <input type="color" id="m_color1" value="${esc(v.colors[0])}"></label>
            <label>Accent colour <input type="color" id="m_color2" value="${esc(v.colors[1])}"></label>
          </div>
        </fieldset>
        <fieldset class="ad-fieldset">
          <legend>Shop badge</legend>
          <div class="ad-radios">
            ${[['', 'None'], ...o.tags.map((t) => [t, t[0].toUpperCase() + t.slice(1)])].map(([val, l]) => `<label><input type="radio" name="m_tag" value="${val}" ${(v.tag || '') === val ? 'checked' : ''}> ${l}</label>`).join('')}
            <label><input type="checkbox" id="m_featured" ${v.featured ? 'checked' : ''}> Feature on the home page</label>
          </div>
        </fieldset>
        ${m ? '' : `<div class="field full"><label for="m_file">Map file (.zip)</label><input class="input" type="file" id="m_file" accept=".zip,application/zip"><small class="ad-hint">Up to ${mapOptions.uploadMaxMb} MB. You can also upload it later.</small><span class="err" data-err="file"></span></div>`}
        <div class="ad-progress" id="formProgress" hidden><i></i></div>
        <p class="ad-form-msg" id="mapMsg" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">${m ? 'Save changes' : 'Save and put on sale'}</button>
      </form>`;
  }

  function readMapForm() {
    const val = (id) => ($(`#m_${id}`) || {}).value || '';
    const pick = (name) => { const r = $(`input[name="m_${name}"]:checked`); return r ? r.value : ''; };
    return {
      name: val('name'), size: val('size'), price: val('price').trim(), mrp: val('mrp').trim(), mode: val('mode'),
      km: val('km').trim(), checkpoints: val('checkpoints').trim(), mb: val('mb').trim(),
      desc: val('desc'), features: val('features').split('\n'),
      art: pick('art'), color1: val('color1'), color2: val('color2'), tag: pick('tag') || null, featured: !!($('#m_featured') || {}).checked
    };
  }

  function paintPreview() {
    const box = $('#mapPreview');
    if (!box) return;
    const d = readMapForm();
    const tier = mapOptions.sizes[d.size];
    const hint = $('#sizeHint');
    if (hint && tier) hint.textContent = tier.detail;
    const price = d.price ? Number(d.price) : tier ? tier.price : 0;
    $$('.ad-art-pick span').forEach((s, i) => { s.innerHTML = artSVG(mapOptions.arts[i], d.color1, d.color2); });
    box.innerHTML = `
      <div class="ad-map-art">${artSVG(d.art, d.color1, d.color2)}</div>
      <div><span class="ad-chip">${esc(d.size)} · ${esc(tier ? tier.label : '')}</span>${d.tag ? ` <span class="ad-chip chip-added">${esc(d.tag)}</span>` : ''}
        <h3>${esc(d.name || 'Your map name')}</h3>
        <p class="ad-map-meta">${inr(price)}${d.km ? ` · ${esc(d.km)} km` : ''} · ${esc(d.mode)}</p></div>`;
  }

  function openMapForm(id) {
    const m = id ? maps.find((x) => x.id === id) : null;
    openDrawer(mapFormHTML(m));
    paintPreview();
    $('#m_name').focus();
  }

  async function saveMap(form) {
    const btn = $('button[type="submit"]', form);
    const msg = $('#mapMsg');
    $$('[data-err]', form).forEach((e) => { e.textContent = ''; });
    msg.hidden = true;
    const fileInput = $('#m_file');
    const file = fileInput && fileInput.files[0];
    if (file && file.size > mapOptions.uploadMaxMb * 1048576) { $('[data-err="file"]').textContent = `The file is bigger than ${mapOptions.uploadMaxMb} MB.`; return; }
    btn.disabled = true;
    try {
      const id = form.dataset.id;
      const { product } = await api(id ? `/products/${encodeURIComponent(id)}` : '/products', readMapForm());
      if (file) {
        const bar = $('#formProgress');
        bar.hidden = false;
        try {
          await uploadFile(product.id, file, (p) => { $('i', bar).style.width = `${Math.round(p * 100)}%`; });
        } catch (e) {
          toast(`Map saved, but the file didn't upload: ${e.message} Upload it from the map's card.`, true);
          closeDrawer();
          renderMaps();
          return;
        }
      }
      toast(id ? 'Map updated.' : `"${product.name}" is now on sale.`);
      closeDrawer();
      renderMaps();
    } catch (e) {
      if (e.fields) {
        Object.entries(e.fields).forEach(([k, v]) => { const el = $(`[data-err="${k}"]`, form); if (el) el.textContent = v; });
        const first = Object.keys(e.fields).map((k) => $(`#m_${k}`)).find(Boolean);
        if (first) first.focus();
      }
      msg.textContent = e.message;
      msg.hidden = false;
      btn.disabled = false;
    }
  }

  async function uploadFromCard(input) {
    const file = input.files[0];
    if (!file) return;
    const card = input.closest('.ad-map');
    const bar = $('.ad-progress', card);
    if (file.size > mapOptions.uploadMaxMb * 1048576) { toast(`That file is bigger than ${mapOptions.uploadMaxMb} MB.`, true); input.value = ''; return; }
    bar.hidden = false;
    $$('button, label', card).forEach((b) => b.classList.add('is-disabled'));
    try {
      await uploadFile(input.dataset.upload, file, (p) => { $('i', bar).style.width = `${Math.round(p * 100)}%`; });
      toast('File uploaded. Buyers can download this map now.');
      renderMaps();
    } catch (e) {
      toast(e.message, true);
      bar.hidden = true;
      $$('button, label', card).forEach((b) => b.classList.remove('is-disabled'));
      input.value = '';
    }
  }

  async function toggleMap(id, btn) {
    const m = maps.find((x) => x.id === id);
    if (m.active && !window.confirm(`Hide "${m.name}" from the shop? People who already bought it can still download it.`)) return;
    btn.disabled = true;
    try {
      await api(`/products/${encodeURIComponent(id)}/visibility`, { active: !m.active });
      toast(m.active ? 'Hidden from the shop.' : 'Back on sale.');
      renderMaps();
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.id === 'loginForm') {
      const pw = $('#pw').value;
      const btn = $('button', form);
      if (!pw) { $('#pwErr').textContent = 'Enter the admin password.'; return; }
      btn.disabled = true;
      try {
        const { token: t } = await api('/login', { password: pw });
        setToken(t);
        startApp();
      } catch (err) { $('#pwErr').textContent = err.message; btn.disabled = false; $('#pw').select(); }
    }
    if (form.id === 'searchForm') { search = $('#q').value.trim(); loadList(false); }
    if (form.id === 'mapForm') saveMap(form);
  });

  // Typing in a field clears its old error message.
  const clearErr = (el) => { const id = (el.id || el.name || '').replace(/^m_/, ''); const box = $(`#mapForm [data-err="${id}"]`); if (box) box.textContent = ''; };
  document.addEventListener('input', (e) => { if (e.target.closest('#mapForm')) { clearErr(e.target); paintPreview(); } });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-upload]')) uploadFromCard(e.target);
    else if (e.target.closest('#mapForm')) paintPreview();
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { showTab(t.dataset.tab); return; }
    const g = e.target.closest('[data-goto]');
    if (g) { view = g.dataset.goto; search = ''; showTab('orders'); return; }
    const v = e.target.closest('[data-view]');
    if (v) {
      view = v.dataset.view;
      $$('.ad-tab').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === view)));
      loadList(false);
      return;
    }
    const o = e.target.closest('[data-order]');
    if (o) { openOrder(o.dataset.order); return; }
    if (e.target.closest('[data-close]')) { closeDrawer(); return; }
    const s = e.target.closest('[data-set]');
    if (s) {
      const a = ACTION[s.dataset.set];
      if (a.confirm && !window.confirm(a.confirm)) return;
      orderAction('/status', { status: s.dataset.set, note: ($('#note') || {}).value || '' }, s, (order) => `Order #${order.id}: ${order.statusLabel}`);
      return;
    }
    const h = e.target.closest('[data-handled]');
    if (h) { orderAction('/issues/handled', { note: ($('#issueNote') || {}).value || '' }, h, (order) => `Order #${order.id}: issue marked as handled`); return; }
    if (e.target.closest('#more')) { loadList(true); return; }
    if (e.target.closest('[data-add-map]')) { openMapForm(null); return; }
    const em = e.target.closest('[data-edit-map]');
    if (em) { openMapForm(em.dataset.editMap); return; }
    const tm = e.target.closest('[data-toggle-map]');
    if (tm) { toggleMap(tm.dataset.toggleMap, tm); return; }
    if (e.target.closest('#logout')) {
      api('/logout', {}).catch(() => {});
      setToken(null);
      showLogin('You are logged out.');
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  window.addEventListener('hashchange', () => { if (token && location.hash.slice(1) !== tab) showTab(location.hash.slice(1)); });

  if (token) startApp(); else showLogin();
})();
