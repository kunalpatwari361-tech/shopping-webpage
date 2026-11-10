/* ============================================================
   Checkout: details + payment
   PhonePe / Google Pay / Paytm (UPI), card, bank transfer.

   The server prices every order and handles the payment:
   - Razorpay takes UPI and card payments once its keys are set
     in .env. Card numbers and UPI PINs are typed into Razorpay's
     own secure window, never into this site.
   - While testing (no keys yet) payments are simulated: no money moves.
   - Bank transfer, and direct UPI when a UPI ID is set in js/config.js:
     the shopper sends their payment reference and the shop owner
     confirms it in the admin panel.
   ============================================================ */
(function () {
  'use strict';
  const PM = window.PM;
  const { C, $, $$, esc, inr, icon, art, productArt, glowColor, Cart, totals, getCoupon, setCoupon, store, session, onChange, lockScroll, unlockScroll, reduceMotion, helpText, sizeOf, api, MyOrders } = PM;

  // Racing maps are downloads: an all-digital cart needs only name, phone and
  // email. A mixed cart needs the address and the email.
  const kind = () => { const t = totals(); return { digitalOnly: t.digitalOnly, digital: t.digital }; };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function detailsComplete(a) {
    if (!a || !a.name || !a.phone) return false;
    const k = kind();
    if (k.digital && !EMAIL_RE.test(a.email || '')) return false;
    return k.digitalOnly || !!(a.line1 && a.city && a.state && a.pincode);
  }

  const app = $('#checkoutApp');
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
    'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
    'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

  const METHODS = {
    phonepe: { label: 'PhonePe', sub: 'UPI', logo: 'Pe', cls: 'pl-phonepe', scheme: 'phonepe://pay', upi: true },
    gpay: { label: 'Google Pay', sub: 'UPI', logo: '<em>G</em>Pay', cls: 'pl-gpay', scheme: 'tez://upi/pay', upi: true },
    paytm: { label: 'Paytm', sub: 'UPI', logo: 'Paytm', cls: 'pl-paytm', scheme: 'paytmmp://pay', upi: true },
    card: { label: 'Card', sub: 'Debit / Credit', logo: icon('card', 20), cls: 'pl-card' },
    bank: { label: 'Bank Transfer', sub: 'NEFT / IMPS / RTGS', logo: icon('bank', 20), cls: 'pl-bank' }
  };

  let step = 1;
  let method = 'phonepe';
  let placed = false;
  let address = store.get('address', null) || {};
  let cfg = null;                                   // payment options from the server
  let cfgError = '';
  let pending = session.get('pending', null);       // { id, token, key } of the order being paid
  let order = null;                                 // the server's copy of that order
  let preparing = null;
  let prepError = '';
  let busy = false;
  let qrTimer = 0, qrLeft = 300;

  const providerOf = (key) => (cfg && cfg.payments.methods[key]) || null;
  const mode = () => (cfg ? cfg.payments.mode : 'off');

  /* ---------- helpers ---------- */
  const fieldErr = (id, msg) => {
    const input = document.getElementById(id);
    if (!input) return;
    const f = input.closest('.field');
    f.classList.toggle('invalid', !!msg);
    const e = $('.err', f);
    if (e) e.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  const val = (id) => (document.getElementById(id) || {}).value || '';

  function upiQuery() {
    return [['pa', C.upi.id], ['pn', C.upi.payeeName || C.storeName], ['am', order.total.toFixed(2)], ['cu', 'INR'], ['tn', `${C.storeName} order ${order.id}`], ['tr', order.id]]
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }

  function copy(text, btn) {
    const done = () => { helpText(`Copied <b>${esc(text)}</b>`, 1800); if (btn) { btn.innerHTML = icon('check', 16); setTimeout(() => { btn.innerHTML = icon('copy', 16); }, 1400); } };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { helpText('Copy failed. Please copy it manually.', 2400); }
      ta.remove();
    }
  }

  /* ---------- the order on the server ----------
     Created when the shopper reaches the payment step, so the order number
     and amount shown for UPI and bank transfers are the real ones. */
  function cartKey() {
    const a = address;
    return JSON.stringify([Cart.items().map((i) => [i.id, i.qty]), getCoupon() || '', [a.name, a.phone, a.email, a.line1, a.line2, a.city, a.state, a.pincode]]);
  }
  function customerPayload() {
    const a = address;
    const c = { name: a.name, phone: a.phone, email: a.email || '' };
    if (!kind().digitalOnly) Object.assign(c, { line1: a.line1, line2: a.line2 || '', city: a.city, state: a.state, pincode: a.pincode });
    return c;
  }

  async function createOrReuse() {
    const key = cartKey();
    if (pending && pending.key === key) {
      try {
        const { order: o } = await api(`/orders/${encodeURIComponent(pending.id)}`, { token: pending.token });
        if (o.status === 'awaiting_payment') return o;
        if (o.paid || o.status === 'pending_verification') { finish(o); return null; }
      } catch (e) { if (e.offline) throw e; }
    }
    const res = await api('/orders', {
      body: { items: Cart.items().map((i) => ({ id: i.id, qty: i.qty })), coupon: getCoupon(), customer: customerPayload() }
    });
    pending = { id: res.order.id, token: res.token, key };
    session.set('pending', pending);
    if (res.couponRejected) helpText(`Coupon <b>${esc(getCoupon() || '')}</b> doesn't apply to this order.`, 3600);
    return res.order;
  }

  function ensureOrder() {
    if (order && pending && pending.key === cartKey()) return Promise.resolve(order);
    if (preparing) return preparing;
    order = null;
    prepError = '';
    preparing = createOrReuse().then((o) => {
      preparing = null;
      if (o && !placed) { order = o; render(); }
      return o;
    }, (err) => {
      preparing = null;
      if (err.fields) {
        // The server found a problem with the details: take the shopper back to fix it.
        step = 1;
        render();
        Object.entries(err.fields).forEach(([k, m]) => fieldErr(k, m));
        const first = Object.keys(err.fields).map((k) => document.getElementById(k)).find(Boolean);
        if (first) first.focus();
        helpText('Please check your details.', 3000);
      } else {
        prepError = err.message;
        render();
      }
      return null;
    });
    return preparing;
  }

  /* ---------- markup ---------- */
  function stepsHTML() {
    const s = (n, label) => `<div class="step ${step === n ? 'active' : ''} ${step > n ? 'done' : ''}"><i>${step > n ? icon('check', 14) : n}</i>${label}</div>`;
    return `<div class="steps" aria-label="Checkout progress">${s(1, kind().digitalOnly ? 'Details' : 'Delivery')}${s(2, 'Payment')}${s(3, 'Done')}</div>`;
  }

  function summaryHTML() {
    const t = totals();
    // Once the server has priced the order, show its numbers.
    const n = order ? { sub: order.sub, discount: order.discount, shipping: order.shipping, total: order.total, code: order.coupon } : t;
    return `
      <aside class="summary" aria-label="Order summary">
        <h2>Your order</h2>
        <div class="mini-lines">${Cart.lines().map(({ product: p, qty, total }) => `
          <div class="mini-line">
            <div class="thumb" style="--glow:${glowColor(p)}">${productArt(p)}</div>
            <div><p>${esc(p.name)}</p><small>${p.digital ? `Download${sizeOf(p) ? ' · ' + esc(sizeOf(p).label) + ' map' : ''}` : `Qty ${qty}`}</small></div>
            <b>${inr(total)}</b>
          </div>`).join('')}</div>
        <div class="sum-row"><span>Items (${t.count})</span><b>${inr(n.sub)}</b></div>
        ${n.discount ? `<div class="sum-row discount"><span>Coupon ${esc(n.code)}</span><b>− ${inr(n.discount)}</b></div>` : ''}
        ${n.code && !n.discount ? `<div class="sum-row discount"><span>Coupon ${esc(n.code)}</span><b>Applied</b></div>` : ''}
        <div class="sum-row"><span>Delivery</span><b>${t.digitalOnly ? 'Not needed' : n.shipping ? inr(n.shipping) : 'FREE'}</b></div>
        <div class="sum-total"><span>To pay</span><b>${inr(n.total)}</b></div>
        <p class="secure-note">${icon('lock', 15)} ${order ? `Order #${esc(order.id)} · ` : ''}<a href="cart.html" style="color:var(--gold)">Edit cart</a></p>
      </aside>`;
  }

  function addressFormHTML() {
    const a = address;
    const k = kind();
    const f = (id, label, opts = {}) => `
      <div class="field ${opts.full ? 'full' : ''}">
        <label for="${id}">${label}${opts.optional ? ' <span style="color:var(--dim)">(optional)</span>' : ''}</label>
        <input class="input" id="${id}" name="${id}" value="${esc(a[id] || '')}" ${opts.attrs || ''}>
        <span class="err"></span>
      </div>`;
    const addressFields = k.digitalOnly ? '' : `
          ${f('line1', 'House / flat, street', { full: true, attrs: 'autocomplete="address-line1" maxlength="160" placeholder="Flat 12, Sunset Towers, MG Road"' })}
          ${f('line2', 'Area / landmark', { full: true, optional: true, attrs: 'autocomplete="address-line2" maxlength="160" placeholder="Near City Mall"' })}
          ${f('city', 'City', { attrs: 'autocomplete="address-level2" maxlength="60" placeholder="Mumbai"' })}
          <div class="field">
            <label for="state">State</label>
            <select class="select" id="state" name="state" autocomplete="address-level1">
              <option value="">Select state</option>
              ${STATES.map((s) => `<option ${a.state === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <span class="err"></span>
          </div>
          ${f('pincode', 'PIN code', { attrs: 'inputmode="numeric" maxlength="6" autocomplete="postal-code" placeholder="400001"' })}`;
    return `
      <div class="panel" id="addrPanel">
        <div class="panel-head"><h2>${k.digitalOnly ? 'Your details' : 'Delivery details'}</h2><span class="muted">${icon(k.digitalOnly ? 'download' : 'truck', 18)}</span></div>
        ${k.digitalOnly ? `<p class="dl-note" style="margin-bottom:14px">${icon('download', 18)}<span>Racing maps are downloads, so there's no address to fill in. You can download your maps as soon as your payment is confirmed.</span></p>` : ''}
        <form id="addrForm" class="form-grid" novalidate>
          ${f('name', 'Full name', { full: true, attrs: 'autocomplete="name" maxlength="80" placeholder="Pawan Kumar"' })}
          ${f('phone', 'Mobile number', { attrs: 'type="tel" inputmode="numeric" maxlength="10" autocomplete="tel-national" placeholder="10-digit mobile"' })}
          ${f('email', k.digital ? 'Email (for help with your maps)' : 'Email', { optional: !k.digital, attrs: 'type="email" autocomplete="email" maxlength="120" placeholder="you@example.com"' })}
          ${addressFields}
          <label class="full" style="display:flex;gap:10px;align-items:center;margin:4px 0 10px;color:var(--muted);font-weight:600">
            <input type="checkbox" id="saveAddr" checked style="accent-color:var(--gold);width:18px;height:18px"> Save ${k.digitalOnly ? 'these details' : 'this address'} on this device
          </label>
          <button class="btn btn-primary btn-block full" type="submit">Continue to payment ${icon('arrow', 18)}</button>
        </form>
      </div>`;
  }

  function addressCardHTML() {
    const a = address;
    const k = kind();
    const where = k.digitalOnly ? '' : `<br>${esc(a.line1)}${a.line2 ? ', ' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}`;
    const mail = a.email ? `<br><span style="color:var(--cyan)">${esc(a.email)}</span>` : '';
    return `
      <div class="panel" id="addrPanel">
        <div class="panel-head"><h2>${k.digitalOnly ? 'Your details' : 'Delivery details'}</h2></div>
        <div class="address-card">
          <div><b>${esc(a.name)}</b> · ${esc(a.phone)}${where}${mail}</div>
          <button class="link-btn" type="button" id="editAddr">Change</button>
        </div>
      </div>`;
  }

  const head = (m, title, sub) => `
    <div class="pay-panel-head">
      <span class="pay-logo ${m.cls}">${m.logo}</span>
      <div><h3>${title}</h3><p>${sub}</p></div>
    </div>`;

  function qrHTML(key, demoStamp) {
    return `
      <div class="qr-wrap">
        <div class="qr-box" data-qr="${key}" aria-label="UPI QR code"></div>
        <span class="qr-scan" aria-hidden="true"></span>
        ${demoStamp ? '<span class="demo-stamp">DEMO</span>' : ''}
        <p class="qr-timer">QR valid for <b data-timer>05:00</b></p>
      </div>`;
  }

  // Razorpay: the shopper finishes in Razorpay's secure window.
  function gatewayPanel(key) {
    const m = METHODS[key];
    if (!m.upi) {
      return head(m, 'Debit or credit card', 'Visa, Mastercard, RuPay and American Express.') + `
        <ul class="gw-points">
          <li>${icon('lock', 16)} You type your card details in Razorpay's secure window, never on this site.</li>
          <li>${icon('shield', 16)} Your bank may ask for an OTP (3-D Secure).</li>
          <li>${icon('check', 16)} Your order is confirmed the moment the payment goes through.</li>
        </ul>
        <button class="btn btn-primary btn-block" type="button" data-pay="card">${icon('lock', 18)} Pay ${inr(order.total)} by card</button>`;
    }
    return head(m, `Pay with ${m.label}`, isMobile ? `Tap below and choose ${m.label} to approve the payment.` : `Tap below, then scan the QR code with ${m.label} on your phone.`) + `
      <ul class="gw-points">
        <li>${icon('bolt', 16)} Approve <b style="color:var(--cash)">${inr(order.total)}</b> with your UPI PIN in ${m.label}.</li>
        <li>${icon('lock', 16)} Paid through Razorpay's secure checkout. Your PIN never touches this site.</li>
        <li>${icon('check', 16)} Confirmed instantly. No reference number to type.</li>
      </ul>
      <button class="btn btn-primary btn-block" type="button" data-pay="${key}">${icon('bolt', 18)} Pay ${inr(order.total)} with ${m.label}</button>`;
  }

  // Test mode: nothing is charged.
  function demoPanel(key) {
    const m = METHODS[key];
    if (!m.upi) {
      return head(m, 'Debit or credit card', 'Visa, Mastercard, RuPay and American Express.') + `
        <ul class="gw-points">
          <li>${icon('lock', 16)} When payments go live, card details are typed into Razorpay's secure window, never on this site.</li>
          <li>${icon('info', 16)} Test mode: tap pay to see the full flow. No card is charged.</li>
        </ul>
        <button class="btn btn-primary btn-block" type="button" data-pay="card">${icon('lock', 18)} Pay ${inr(order.total)} by card (test)</button>`;
    }
    return head(m, `Pay with ${m.label}`, `Test mode: no money moves. Tap pay to see the full flow.`) + `
      <div class="upi-body">
        ${qrHTML(key, true)}
        <div class="upi-side">
          <ol class="upi-steps">
            <li>Open <b>${m.label}</b> and tap <b>Pay</b></li>
            <li>Check the amount: <b style="color:var(--cash)">${inr(order.total)}</b></li>
            <li>Enter your UPI PIN to approve</li>
          </ol>
          <button class="btn btn-primary btn-block" type="button" data-pay="${key}">${icon('bolt', 18)} Pay ${inr(order.total)} with ${m.label} (test)</button>
        </div>
      </div>`;
  }

  // Direct UPI to the shop's own UPI ID: the shopper sends the reference (UTR).
  function manualUpiPanel(key) {
    const m = METHODS[key];
    return head(m, `Pay with ${m.label}`, isMobile ? `Tap the button to open ${m.label}, or scan the QR from another phone.` : `Open ${m.label} on your phone and scan this QR code.`) + `
      <div class="upi-body">
        ${qrHTML(key, false)}
        <div class="upi-side">
          <ol class="upi-steps">
            <li>Open <b>${m.label}</b> and tap <b>Scan</b></li>
            <li>Check the amount: <b style="color:var(--cash)">${inr(order.total)}</b></li>
            <li>Pay, then enter the 12-digit UPI reference below</li>
          </ol>
          ${isMobile ? `<a class="btn btn-primary btn-block" href="${m.scheme}?${esc(upiQuery())}">${icon('bolt', 18)} Open ${m.label} and pay ${inr(order.total)}</a>` : ''}
          <form class="inline-form" data-ref-form="${key}" novalidate>
            <div class="field"><label for="utr-${key}">UPI reference (UTR), 12 digits</label><input class="input" id="utr-${key}" inputmode="numeric" maxlength="12" placeholder="Shown in ${m.label} after paying" autocomplete="off"><span class="err"></span></div>
            <button class="btn btn-cash" type="submit">I've paid</button>
          </form>
          <p class="coupon-hint">We confirm your order as soon as we see the payment, usually within a few hours.</p>
        </div>
      </div>`;
  }

  function unavailablePanel(key) {
    const m = METHODS[key];
    return head(m, m.upi ? `Pay with ${m.label}` : 'Debit or credit card', `${m.upi ? 'UPI app' : 'Card'} payments aren't switched on yet.`) + `
      <p class="muted" style="margin:0 0 14px">Please pay by bank transfer for now. Your order is confirmed as soon as the money arrives.</p>
      <button class="btn btn-ghost btn-block" type="button" data-method="bank">${icon('bank', 18)} Pay by bank transfer</button>`;
  }

  function bankPanel() {
    const b = C.bank;
    const row = (label, value, copyable = true) => `
      <div class="bank-row"><span>${label}</span><b>${esc(value)}${copyable ? ` <button class="copy-btn" type="button" data-copy="${esc(value)}" aria-label="Copy ${label}">${icon('copy', 16)}</button>` : ''}</b></div>`;
    return head(METHODS.bank, 'Bank transfer', `Send exactly <b style="color:var(--cash)">${inr(order.total)}</b> by NEFT, IMPS or RTGS, then enter your transaction reference.`) + `
      <div class="bank-details">
        ${row('Account name', b.accountName)}
        ${row('Account number', b.accountNumber)}
        ${row('IFSC', b.ifsc)}
        ${row('Bank', `${b.bankName}${b.branch ? ', ' + b.branch : ''}`, false)}
        ${row('Account type', b.accountType, false)}
        ${row('Amount', order.total.toFixed(2))}
        ${row('Remarks', order.id)}
      </div>
      <form data-ref-form="bank" novalidate>
        <div class="field"><label for="utr-bank">UTR / transaction reference</label><input class="input" id="utr-bank" maxlength="22" placeholder="e.g. 412345678901" autocomplete="off"><span class="err"></span></div>
        <button class="btn btn-primary btn-block" type="submit">${icon('check', 18)} I've made the transfer</button>
      </form>
      <p class="coupon-hint" style="margin-top:10px">We confirm your order as soon as the money reaches our account, usually within a few hours.</p>`;
  }

  function methodPanel(key) {
    const p = providerOf(key);
    const inner = key === 'bank' ? bankPanel()
      : p === 'razorpay' ? gatewayPanel(key)
        : p === 'demo' ? demoPanel(key)
          : p === 'manual' ? manualUpiPanel(key)
            : unavailablePanel(key);
    return `<div class="pay-panel" role="tabpanel" id="panel-${key}" aria-labelledby="tab-${key}" ${method === key ? '' : 'hidden'}>${inner}</div>`;
  }

  function paymentHTML() {
    const shell = (inner) => `<div class="panel" id="payPanel"><div class="panel-head"><h2>Payment</h2>${order ? `<span class="pill">${inr(order.total)}</span>` : ''}</div>${inner}</div>`;
    const problem = cfgError || prepError;
    if (problem) {
      return shell(`<div class="pay-wait">${icon('info', 22)}<p>${esc(problem)}</p><button class="btn btn-ghost btn-sm" type="button" data-retry>Try again</button></div>`);
    }
    if (!cfg || !order) return shell(`<div class="pay-wait"><span class="spin" aria-hidden="true"></span><p>Getting your order ready…</p></div>`);

    const tabs = Object.entries(METHODS).map(([k, m]) => `
      <button class="pay-tab" role="tab" type="button" id="tab-${k}" data-method="${k}" aria-controls="panel-${k}" aria-selected="${method === k}" tabindex="${method === k ? 0 : -1}">
        <span class="pay-logo ${m.cls}">${m.logo}</span><span>${m.label}<small>${m.sub}</small></span>
      </button>`).join('');
    const notice = mode() === 'demo'
      ? `<div class="demo-note">${icon('info', 18)}<span><b>Test mode:</b> UPI and card payments are simulated and no money moves. Add your Razorpay keys on the server to take real payments.</span></div>`
      : '';
    const secure = mode() === 'razorpay'
      ? 'UPI and card payments are processed by Razorpay. Your card details and UPI PIN never touch this site.'
      : 'Your order total is worked out and checked by our server.';
    return shell(`
      ${notice}
      <p class="pay-msg" id="payMsg" role="alert" hidden></p>
      <div class="pay-layout">
        <div class="pay-tabs" role="tablist" aria-label="Payment method">${tabs}</div>
        <div>${Object.keys(METHODS).map(methodPanel).join('')}</div>
      </div>
      <p class="secure-note">${icon('shield', 16)} ${secure}</p>`);
  }

  function emptyHTML() {
    return `<div class="empty">
      ${art('car', '#ff2a3d', '#ffc61a')}
      <h2>Nothing to check out</h2>
      <p>Your cart is empty. Add some gear first, then come back for the getaway.</p>
      <a class="btn btn-primary" href="category.html">Start shopping</a>
    </div>`;
  }

  /* ---------- render ---------- */
  function render() {
    clearInterval(qrTimer);
    if (placed) return;
    if (!Cart.count()) { app.innerHTML = emptyHTML(); return; }
    // The cart can change in another tab (e.g. a physical item added to a maps-only order).
    if (step === 2 && !detailsComplete(address)) step = 1;
    if (order && (!pending || pending.key !== cartKey())) order = null;
    app.innerHTML = `
      ${stepsHTML()}
      <div class="checkout-layout">
        <div>${step === 1 ? addressFormHTML() : addressCardHTML() + paymentHTML()}</div>
        ${summaryHTML()}
      </div>`;
    if (step !== 2 || !cfg) return;
    if (order) showMethod(method, false);
    else if (!preparing && !prepError) ensureOrder();
  }

  /* ---------- step 1: details ---------- */
  function validateAddress() {
    const k = kind();
    const a = { name: val('name').trim(), phone: val('phone').replace(/\D/g, ''), email: val('email').trim() };
    const errs = {
      name: a.name.length < 2 ? 'Enter your full name.' : '',
      phone: /^[6-9]\d{9}$/.test(a.phone) ? '' : 'Enter a valid 10-digit Indian mobile number.',
      email: k.digital
        ? (EMAIL_RE.test(a.email) ? '' : 'Enter your email so we can help with your map download.')
        : (!a.email || EMAIL_RE.test(a.email) ? '' : 'Enter a valid email or leave it blank.')
    };
    if (!k.digitalOnly) {
      Object.assign(a, { line1: val('line1').trim(), line2: val('line2').trim(), city: val('city').trim(), state: val('state'), pincode: val('pincode').trim() });
      Object.assign(errs, {
        line1: a.line1.length < 5 ? 'Enter your house number and street.' : '',
        city: a.city.length < 2 ? 'Enter your city.' : '',
        state: a.state ? '' : 'Choose your state.',
        pincode: /^[1-9]\d{5}$/.test(a.pincode) ? '' : 'Enter a valid 6-digit PIN code.'
      });
    }
    Object.entries(errs).forEach(([key, m]) => fieldErr(key, m));
    const first = Object.keys(errs).find((key) => errs[key]);
    if (first) { document.getElementById(first).focus(); return null; }
    return a;
  }

  /* ---------- step 2: payment ---------- */
  function showMethod(key, focus) {
    method = key;
    $$('.pay-tab').forEach((t) => {
      const on = t.dataset.method === key;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $$('.pay-panel').forEach((p) => { p.hidden = p.id !== 'panel-' + key; });
    clearInterval(qrTimer);
    const p = providerOf(key);
    if (METHODS[key].upi && (p === 'demo' || p === 'manual')) startQR(key, p === 'manual');
  }

  function startQR(key, live) {
    const box = $(`[data-qr="${key}"]`);
    if (!box) return;
    box.innerHTML = '';
    // Keep QR text plain ASCII: qrcodejs miscounts multi-byte characters such as "₹".
    const text = live ? `upi://pay?${upiQuery()}` : `TEST ONLY - ${C.storeName} order ${order.id} - INR ${order.total} - not a real payment`;
    let drawn = false;
    if (window.QRCode) {
      for (const level of ['M', 'L']) {
        try {
          box.innerHTML = '';
          // eslint-disable-next-line no-new
          new window.QRCode(box, { text, width: 176, height: 176, colorDark: '#000000', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel[level] });
          drawn = true;
          break;
        } catch (err) { /* try a lower error-correction level */ }
      }
    }
    if (!drawn) {
      box.innerHTML = '<p style="color:#111;font-weight:700;text-align:center;font-size:.85rem;padding:10px">QR code unavailable. Use the pay button instead.</p>';
    }
    qrLeft = 300;
    const timerEl = $(`#panel-${key} [data-timer]`);
    const paint = () => { timerEl.textContent = `${String(Math.floor(qrLeft / 60)).padStart(2, '0')}:${String(qrLeft % 60).padStart(2, '0')}`; };
    paint();
    qrTimer = setInterval(() => {
      qrLeft -= 1;
      if (qrLeft <= 0) {
        clearInterval(qrTimer);
        box.innerHTML = `<button class="btn btn-ghost btn-sm" type="button" data-refresh-qr="${key}" style="color:#111;border-color:#111">Refresh QR</button>`;
        timerEl.textContent = 'expired';
        return;
      }
      paint();
    }, 1000);
  }

  function payMsg(text) {
    const el = $('#payMsg');
    if (!el) { if (text) helpText(esc(text), 5000); return; }
    el.textContent = text || '';
    el.hidden = !text;
    if (text) el.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function setBusy(on) {
    busy = on;
    $$('#payPanel .pay-panel button, #payPanel .pay-panel a.btn').forEach((b) => { b.toggleAttribute('disabled', on); b.setAttribute('aria-disabled', String(on)); });
  }

  // Shows the progress overlay while the server does the real work.
  function withSteps(steps, work) {
    const ov = $('#processing'), list = $('#procSteps');
    list.innerHTML = steps.map((s) => `<li><i></i><span>${esc(s)}</span></li>`).join('');
    ov.classList.add('open');
    lockScroll();
    const lis = $$('li', list);
    const tick = (n) => { const li = lis[n]; li.classList.remove('on'); li.classList.add('ok'); $('i', li).innerHTML = icon('check', 18); };
    let i = 0;
    lis[0].classList.add('on');
    const gap = reduceMotion ? 250 : 850;
    const timer = setInterval(() => { if (i < lis.length - 1) { tick(i); i += 1; lis[i].classList.add('on'); } }, gap);
    const close = () => { clearInterval(timer); ov.classList.remove('open'); unlockScroll(); };
    const minWait = new Promise((r) => setTimeout(r, gap * (lis.length - 1) + 200));
    return Promise.all([work(), minWait]).then(([res]) => {
      clearInterval(timer);
      lis.forEach((li, n) => tick(n));
      return new Promise((r) => setTimeout(() => { close(); r(res); }, 450));
    }, (err) => { close(); throw err; });
  }

  /* ---------- Razorpay Checkout (loaded only when needed) ---------- */
  let rzpScript = null;
  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    if (!rzpScript) {
      rzpScript = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { rzpScript = null; s.remove(); reject(new Error("Couldn't open the secure payment window. Check your connection and try again.")); };
        document.head.appendChild(s);
      });
    }
    return rzpScript;
  }

  function openRazorpay(key, checkout, o, token) {
    return loadRazorpay().then(() => new Promise((resolve, reject) => {
      let lastFailure = '';
      const rzp = new window.Razorpay(Object.assign({}, checkout, {
        prefill: Object.assign({}, checkout.prefill, { method: METHODS[key].upi ? 'upi' : 'card' }),
        theme: { color: '#ffc61a', backdrop_color: '#07070c' },
        retry: { enabled: true },
        modal: {
          confirm_close: true,
          ondismiss: () => reject(new Error(lastFailure
            ? `Payment didn't go through: ${lastFailure} You can try again or choose another method.`
            : 'Payment window closed before paying. You have not been charged. Choose a method to try again.'))
        },
        handler: (resp) => {
          withSteps(['Payment received', 'Checking it with Razorpay', 'Confirming your order'], () => api('/payments/razorpay/verify', {
            token,
            body: { orderId: o.id, razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }
          })).then((r) => { finish(r.order); resolve(); }, (err) => {
            reject(new Error(`${err.message} Your order #${o.id} is saved under My orders and updates by itself once the payment is confirmed.`));
          });
        }
      }));
      rzp.on('payment.failed', (resp) => { lastFailure = (resp && resp.error && resp.error.description) || 'the bank declined it.'; });
      rzp.open();
    }));
  }

  async function payOnline(key) {
    if (busy) return;
    setBusy(true);
    payMsg('');
    try {
      const o = await ensureOrder();
      if (!o || placed) return;
      const token = pending.token;
      MyOrders.add(o.id, token);
      const res = await api(`/orders/${encodeURIComponent(o.id)}/pay`, { token, body: { method: key } });
      if (res.provider === 'demo') {
        const m = METHODS[key];
        const steps = m.upi
          ? [`Opening ${m.label}`, 'Waiting for your UPI PIN', 'Payment confirmed (test)']
          : ['Opening the secure card window', 'Waiting for bank OTP (3-D Secure)', 'Payment authorised (test)'];
        const r = await withSteps(steps, () => api('/payments/demo/confirm', { token, body: { orderId: o.id } }));
        finish(r.order);
      } else if (res.provider === 'razorpay') {
        await openRazorpay(key, res.checkout, o, token);
      }
    } catch (err) {
      if (err.status === 409 && await settleConflict(err)) return;
      payMsg(err.message);
    } finally {
      if (!placed) setBusy(false);
    }
  }

  // The order changed elsewhere (paid in another tab, confirmed by Razorpay, or cancelled).
  async function settleConflict(err) {
    const p = pending;
    if (!p) return false;
    try {
      const { order: o } = await api(`/orders/${encodeURIComponent(p.id)}`, { token: p.token });
      if (o.paid || o.status === 'pending_verification') { finish(o); return true; }
    } catch (e) { return false; }
    // Cancelled: start a fresh order for the same cart.
    order = null;
    pending = null;
    session.del('pending');
    busy = false;
    render();
    helpText(`${esc(err.message)} We've made a new order for you.`, 4200);
    return true;
  }

  async function sendReference(key, reference) {
    if (busy) return;
    setBusy(true);
    payMsg('');
    try {
      const o = await ensureOrder();
      if (!o || placed) return;
      const token = pending.token;
      MyOrders.add(o.id, token);
      const r = await withSteps(['Recording your payment reference', 'Saving your order'], () => api(`/orders/${encodeURIComponent(o.id)}/reference`, { token, body: { method: key, reference } }));
      finish(r.order);
    } catch (err) {
      if (err.status === 409 && await settleConflict(err)) return;
      payMsg(err.message);
    } finally {
      if (!placed) setBusy(false);
    }
  }

  /* ---------- done ---------- */
  function finish(o) {
    placed = true;
    step = 3;
    if (pending) MyOrders.add(pending.id, pending.token);
    session.del('pending');
    pending = null;
    Cart.clear();
    setCoupon(null);
    showSuccess(o);
  }

  function downloadsHTML(o) {
    if (!o.downloads || !o.downloads.length) return '';
    return `<div class="dl-list">${o.downloads.map((d) => d.available
      ? `<button class="btn btn-cash btn-sm" type="button" data-dl="${esc(d.productId)}" data-dl-order="${esc(o.id)}">${icon('download', 16)} ${esc(d.name)}</button>`
      : `<span class="dl-wait">${icon('download', 16)} ${esc(d.name)}: ${d.fileReady ? 'download limit reached' : 'being prepared, we\'ll email you'}</span>`).join('')}</div>`;
  }

  function showSuccess(o) {
    const paid = o.paid;
    const methodLabel = o.method ? METHODS[o.method].label : '';
    const mapNote = !o.digital ? ''
      : paid ? ' Download your racing maps now, or any time later from My orders.'
        : ' Your map downloads unlock as soon as we confirm your payment.';
    app.innerHTML = `${stepsHTML()}
      <div class="empty">
        ${o.digital && !o.physical ? art('track-city', '#72d572', '#ffc61a') : art('car', '#72d572', '#ffc61a')}
        <h2>Mission complete</h2>
        <p>Order <b>#${esc(o.id)}</b> is ${paid ? 'confirmed' : 'placed and waiting for us to confirm your payment'}.${mapNote}</p>
        <a class="btn btn-primary" href="category.html">Keep shopping</a>
      </div>`;
    $('#successSub').textContent = paid ? `Order #${o.id} confirmed` : `Order #${o.id} placed`;
    const respect = Math.max(10, Math.floor(o.total / 10));
    $('#successStats').innerHTML = `
      <div><span>${paid ? 'Paid' : 'Amount'}</span><b class="cashv">${inr(o.total)}</b></div>
      <div><span>Method</span><b>${esc(methodLabel)}${o.provider === 'demo' ? ' <small style="color:var(--dim)">(test)</small>' : ''}</b></div>
      <div><span>Status</span><b>${paid ? '<span class="pill">Paid</span>' : `<span class="pill pending">${esc(o.statusLabel)}</span>`}</b></div>
      ${o.reference ? `<div><span>Reference</span><b>${esc(o.reference)}</b></div>` : ''}
      ${o.deliverTo ? `<div><span>Deliver to</span><b>${esc(o.deliverTo)}</b></div>` : ''}
      ${o.email ? `<div><span>Email</span><b>${esc(o.email)}</b></div>` : ''}
      <div><span>Respect earned</span><b style="color:var(--gold)">+${respect} REP</b></div>`;
    const dl = $('#successDl');
    dl.innerHTML = paid && o.downloads.length ? `<p>Your racing maps</p>${downloadsHTML(o)}` : '';
    dl.hidden = !dl.innerHTML;
    const ov = $('#success');
    ov.classList.add('open');
    lockScroll();
    if (!reduceMotion) {
      const rain = $('#cashRain');
      rain.innerHTML = Array.from({ length: 40 }, () => {
        const d = 2.6 + Math.random() * 2.8;
        return `<span class="bill" style="left:${(Math.random() * 100).toFixed(1)}%;animation-duration:${d.toFixed(2)}s;animation-delay:${(Math.random() * 1.6).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg"></span>`;
      }).join('');
    }
    setTimeout(() => { const b = $('#success .btn'); if (b) b.focus(); }, 600);
  }

  /* ---------- events ---------- */
  app.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;

    if (form.id === 'addrForm') {
      const a = validateAddress();
      if (!a) return;
      // Keep any saved street address when a maps-only order asks just for contact details.
      address = Object.assign({}, address, a);
      if ($('#saveAddr').checked) store.set('address', address); else store.del('address');
      step = 2;
      render();
      $('#payPanel').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      helpText(`${kind().digitalOnly ? 'Details' : 'Address'} saved. Now choose how you want to <b>pay</b>.`, 3000);
      return;
    }

    if (form.dataset.refForm) {
      const key = form.dataset.refForm;
      const ref = val('utr-' + key).replace(/\s/g, '').toUpperCase();
      const ok = key === 'bank' ? /^[A-Z0-9]{10,22}$/.test(ref) : /^\d{12}$/.test(ref);
      if (!ok) {
        fieldErr('utr-' + key, key === 'bank' ? 'Enter the 10 to 22 character reference from your bank.' : 'The UPI reference is 12 digits. Find it in your payment history.');
        return;
      }
      fieldErr('utr-' + key, '');
      sendReference(key, ref);
    }
  });

  app.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-method]');
    if (tab) {
      showMethod(tab.dataset.method, false);
      const t = $(`#tab-${tab.dataset.method}`);
      if (t) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    if (e.target.closest('#editAddr')) { step = 1; render(); return; }
    const c = e.target.closest('[data-copy]');
    if (c) { copy(c.dataset.copy, c); return; }
    const r = e.target.closest('[data-refresh-qr]');
    if (r) { startQR(r.dataset.refreshQr, providerOf(r.dataset.refreshQr) === 'manual'); return; }
    if (e.target.closest('[data-retry]')) { prepError = ''; if (cfgError) loadConfig(); else render(); return; }
    const pay = e.target.closest('[data-pay]');
    if (pay) { payOnline(pay.dataset.pay); return; }
    // Direct UPI on a phone: the app link opens the UPI app; then ask for the reference.
    const link = e.target.closest('a.btn[href*="://pay"]');
    if (link) {
      if (busy) { e.preventDefault(); return; }
      setTimeout(() => { const input = $(`#utr-${method}`); if (input) input.focus(); }, 1500);
      helpText(`After paying in <b>${esc(METHODS[method].label)}</b>, enter the 12-digit UPI reference to confirm.`, 5000);
    }
  });

  app.addEventListener('keydown', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab) return;
    const keys = Object.keys(METHODS);
    const i = keys.indexOf(method);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); showMethod(keys[(i + 1) % keys.length], true); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); showMethod(keys[(i - 1 + keys.length) % keys.length], true); }
  });

  // Live field formatting.
  app.addEventListener('input', (e) => {
    const digitsOnly = e.target.id === 'phone' || e.target.id === 'pincode' || (e.target.id.startsWith('utr-') && e.target.id !== 'utr-bank');
    if (digitsOnly) e.target.value = e.target.value.replace(/\D/g, '');
    if (e.target.closest('.field.invalid')) fieldErr(e.target.id, '');
  });

  onChange(() => { if (!placed && !busy) render(); });

  async function loadConfig() {
    cfgError = '';
    try {
      cfg = await api('/config');
    } catch (err) {
      cfgError = err.message;
    }
    render();
  }

  // Returning shoppers with saved details go straight to payment.
  if (Cart.count() && detailsComplete(address)) step = 2;
  render();
  loadConfig();
})();
