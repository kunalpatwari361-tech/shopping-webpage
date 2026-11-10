/* ============================================================
   Admin panel: check payments, ship orders, see every change.
   Talks only to /api/admin. The login token is kept in this tab
   (sessionStorage) and is gone when the tab closes.
   ============================================================ */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const METHOD = { phonepe: 'PhonePe', gpay: 'Google Pay', paytm: 'Paytm', card: 'Card', bank: 'Bank transfer' };
  const ACTION = {
    paid: { label: 'Mark as paid', cls: 'btn-cash', confirm: 'Only mark this paid once you have seen the money in your account. Continue?' },
    shipped: { label: 'Mark as shipped', cls: 'btn-primary' },
    delivered: { label: 'Mark as delivered', cls: 'btn-ghost' },
    cancelled: { label: 'Cancel order', cls: 'btn-danger', confirm: 'Cancel this order? If the shopper already paid, refund them yourself.' }
  };
  const TABS = [
    ['action', 'Needs action'], ['pending_verification', 'Check payment'], ['paid', 'To ship'], ['shipped', 'Shipped'],
    ['delivered', 'Delivered'], ['awaiting_payment', 'Not paid yet'], ['cancelled', 'Cancelled'], ['all', 'All']
  ];

  const root = $('#admin');
  const drawer = $('#drawer'), drawerBox = $('#drawerBox');
  let token = null;
  try { token = sessionStorage.getItem('pm_admin'); } catch (e) { /* private mode */ }
  let view = 'action', search = '', offset = 0, rows = [], summary = null, lastFocus = null;

  /* ---------- API ---------- */
  async function api(path, body) {
    const opts = { headers: { Accept: 'application/json' } };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(`/api/admin${path}`, opts); } catch (e) { throw new Error('Cannot reach the server. Check your connection.'); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') { setToken(null); showLogin('Your session ended. Please log in again.'); throw new Error('Please log in again.'); }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
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
    toastTimer = setTimeout(() => t.classList.remove('on'), 3200);
  }

  /* ---------- login ---------- */
  function showLogin(msg) {
    $('#topSide').hidden = true;
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

  /* ---------- dashboard ---------- */
  function statHTML(key, label, big, small, cls = '') {
    return `<button class="ad-stat ${cls}" type="button" data-view="${key}"><span>${label}</span><b>${big}</b><small>${small}</small></button>`;
  }
  function dashHTML() {
    const s = summary.byStatus;
    const warn = summary.warnings.map((w) => `<div class="demo-note"><span>${esc(w)}</span></div>`).join('');
    const done = s.shipped.count + s.delivered.count;
    return `
      ${warn ? `<div class="ad-warn">${warn}</div>` : ''}
      <div class="ad-stats">
        ${statHTML('pending_verification', 'Check payment', s.pending_verification.count, 'Bank / UPI references to confirm', s.pending_verification.count ? 'hot' : '')}
        ${statHTML('paid', 'To ship', s.paid.count, 'Paid and waiting for you', s.paid.count ? 'hot' : '')}
        ${statHTML('all', 'Sales today', inr(summary.today.amount), `${summary.today.count} paid order${summary.today.count === 1 ? '' : 's'}`, 'cash')}
        ${statHTML('shipped', 'Shipped / delivered', done, `${inr(s.shipped.amount + s.delivered.amount)} in total`)}
        ${statHTML('awaiting_payment', 'Not paid yet', s.awaiting_payment.count, 'Checkouts not finished')}
      </div>
      <div class="ad-bar">
        <div class="ad-tabs" role="group" aria-label="Filter orders">${TABS.map(([k, l]) => `<button class="ad-tab" type="button" data-view="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div>
        <form class="ad-search" id="searchForm" role="search">
          <label class="sr-only" for="q">Search orders</label>
          <input class="input" id="q" type="search" placeholder="Order no., name, phone, UTR" value="${esc(search)}" autocomplete="off">
          <button class="btn btn-ghost btn-sm" type="submit">Search</button>
        </form>
      </div>
      <div class="ad-list" id="list" aria-live="polite"><p class="muted">Loading orders…</p></div>
      <div id="moreBox"></div>`;
  }

  function rowHTML(o) {
    const kind = o.digital && o.physical ? 'Gear + maps' : o.digital ? 'Racing maps' : 'Gear';
    return `
      <button class="ad-row" type="button" data-order="${esc(o.id)}">
        <div class="c-id"><b>#${esc(o.id)}</b><small>${esc(when(o.createdAt))}</small></div>
        <div class="c-who">${esc(o.name)}<small>${esc(o.phone)}${o.city ? ' · ' + esc(o.city) : ''}</small></div>
        <div class="c-pay">${esc(METHOD[o.method] || 'Not chosen')}<small>${o.reference ? 'Ref ' + esc(o.reference) : esc(kind)}</small></div>
        <div class="c-amt amt">${inr(o.total)}</div>
        <div class="c-st"><span class="st st-${esc(o.status)}">${esc(o.statusLabel)}</span></div>
      </button>`;
  }

  async function loadList(append) {
    if (!append) { offset = 0; rows = []; }
    const list = $('#list');
    try {
      const qs = new URLSearchParams({ status: view, offset: String(offset) });
      if (search) qs.set('q', search);
      const data = await api(`/orders?${qs}`);
      rows = rows.concat(data.orders);
      offset = rows.length;
      list.innerHTML = rows.length ? rows.map(rowHTML).join('') : `<div class="ad-empty">${search ? 'No orders match your search.' : view === 'action' ? 'All caught up. Nothing needs your attention.' : 'No orders here yet.'}</div>`;
      $('#moreBox').innerHTML = data.more ? '<button class="btn btn-ghost btn-sm ad-more" type="button" id="more">Load more</button>' : '';
    } catch (e) { list.innerHTML = `<div class="ad-empty">${esc(e.message)}</div>`; }
  }

  async function showDashboard() {
    try { summary = await api('/summary'); } catch (e) { if (token) root.innerHTML = `<div class="ad-empty">${esc(e.message)}</div>`; return; }
    $('#topSide').hidden = false;
    const mp = $('#modePill');
    mp.textContent = summary.paymentMode === 'razorpay' ? 'Payments live' : summary.paymentMode === 'demo' ? 'Demo payments' : 'Manual payments only';
    mp.className = summary.paymentMode === 'razorpay' ? 'pill' : 'pill pending';
    root.innerHTML = dashHTML();
    loadList(false);
  }
  async function refresh() {
    try { summary = await api('/summary'); } catch (e) { return; }
    const keepQ = search;
    root.innerHTML = dashHTML();
    search = keepQ;
    loadList(false);
  }

  /* ---------- one order ---------- */
  function orderHTML(o) {
    const c = o.customer;
    const items = o.items.map((i) => `<div class="ad-item"><span>${esc(i.name)} <small>${i.digital ? 'download' : '× ' + i.qty}</small></span><b>${inr(i.total)}</b></div>`).join('');
    const address = o.physical ? `${esc(c.line1)}${c.line2 ? ', ' + esc(c.line2) : ''}<br>${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode)}` : 'Not needed (downloads only)';
    const checkNote = o.status === 'pending_verification'
      ? `<div class="ad-check">Before marking this paid, find <b>${inr(o.total)}</b> with reference <b>${esc(o.reference)}</b> in your ${o.method === 'bank' ? 'bank statement' : 'UPI app'}.</div>` : '';
    const actions = o.nextStatuses.length ? `
      <div class="ad-sec">
        <h3>Update order</h3>
        ${checkNote}
        <label class="sr-only" for="note">Note (optional)</label>
        <textarea class="ad-note" id="note" maxlength="300" placeholder="Note for the history, e.g. courier and tracking number (optional)"></textarea>
        <div class="ad-actions">${o.nextStatuses.map((s) => `<button class="btn btn-sm ${ACTION[s].cls}" type="button" data-set="${s}">${ACTION[s].label}</button>`).join('')}</div>
      </div>` : '';
    const dl = o.downloads.length ? `
      <div class="ad-sec"><h3>Map downloads</h3><div class="ad-items">${o.downloads.map((d) => `<div class="ad-item"><span>${esc(d.name)}</span><small>${d.fileReady ? `${d.used} of ${d.limit} used` : 'File missing in private/downloads'}</small></div>`).join('')}</div></div>` : '';
    return `
      <div class="ad-drawer-head">
        <div><h2 id="drawerTitle">#${esc(o.id)}</h2><p>${esc(when(o.createdAt))} · <span class="st st-${esc(o.status)}">${esc(o.statusLabel)}</span></p></div>
        <button class="ad-x" type="button" data-close aria-label="Close">×</button>
      </div>
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
          <span>Handled by</span><b>${esc({ razorpay: 'Razorpay', demo: 'Demo (no money moved)', manual: 'You (manual check)' }[o.provider] || '—')}</b>
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

  async function openOrder(id) {
    lastFocus = document.activeElement;
    drawerBox.innerHTML = '<p class="muted">Loading…</p>';
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
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
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  async function setStatus(status, btn) {
    const a = ACTION[status];
    if (a.confirm && !window.confirm(a.confirm)) return;
    btn.disabled = true;
    try {
      const { order } = await api(`/orders/${encodeURIComponent(drawerBox.dataset.id)}/status`, { status, note: ($('#note') || {}).value || '' });
      drawerBox.innerHTML = orderHTML(order);
      toast(`Order #${order.id}: ${order.statusLabel}`);
      refresh();
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }

  /* ---------- events ---------- */
  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.id === 'loginForm') {
      const pw = $('#pw').value;
      const btn = $('button', e.target);
      if (!pw) { $('#pwErr').textContent = 'Enter the admin password.'; return; }
      btn.disabled = true;
      try {
        const { token: t } = await api('/login', { password: pw });
        setToken(t);
        showDashboard();
      } catch (err) { $('#pwErr').textContent = err.message; btn.disabled = false; $('#pw').select(); }
    }
    if (e.target.id === 'searchForm') { search = $('#q').value.trim(); loadList(false); }
  });

  document.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) {
      view = v.dataset.view;
      document.querySelectorAll('.ad-tab').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.view === view)));
      loadList(false);
      return;
    }
    const o = e.target.closest('[data-order]');
    if (o) { openOrder(o.dataset.order); return; }
    if (e.target.closest('[data-close]')) { closeDrawer(); return; }
    const s = e.target.closest('[data-set]');
    if (s) { setStatus(s.dataset.set, s); return; }
    if (e.target.closest('#more')) { loadList(true); return; }
    if (e.target.closest('#logout')) {
      api('/logout', {}).catch(() => {});
      setToken(null);
      showLogin('You are logged out.');
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  if (token) showDashboard(); else showLogin();
})();
