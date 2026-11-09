/* ============================================================
   Checkout: delivery details + payment
   PhonePe / Google Pay / Paytm (UPI), card, bank transfer.

   IMPORTANT: a static website cannot charge cards or confirm UPI
   payments by itself. With demoMode on (js/config.js) payments are
   simulated. See README.md for connecting a real payment gateway.
   ============================================================ */
(function () {
  'use strict';
  const PM = window.PM;
  const { C, $, $$, esc, inr, icon, art, productArt, glowColor, Cart, totals, setCoupon, store, session, onChange, lockScroll, unlockScroll, reduceMotion, helpText, sizeOf } = PM;

  // Racing maps are downloads: an all-digital cart needs only name, phone and
  // email (for the download link). A mixed cart needs the address and the email.
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
  const upiLive = !!(C.upi && C.upi.id);
  const demo = !!C.demoMode;

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

  let orderId = session.get('orderId', null);
  if (!orderId) {
    orderId = 'PM' + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
    session.set('orderId', orderId);
  }

  let step = 1;
  let method = 'phonepe';
  let placed = false;
  let address = store.get('address', null) || {};
  let qrTimer = 0, qrLeft = 300;

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
    const t = totals();
    return [['pa', C.upi.id], ['pn', C.upi.payeeName || C.storeName], ['am', t.total.toFixed(2)], ['cu', 'INR'], ['tn', `${C.storeName} order ${orderId}`], ['tr', orderId]]
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

  /* ---------- markup ---------- */
  function stepsHTML() {
    const s = (n, label) => `<div class="step ${step === n ? 'active' : ''} ${step > n ? 'done' : ''}"><i>${step > n ? icon('check', 14) : n}</i>${label}</div>`;
    return `<div class="steps" aria-label="Checkout progress">${s(1, kind().digitalOnly ? 'Details' : 'Delivery')}${s(2, 'Payment')}${s(3, 'Done')}</div>`;
  }

  function summaryHTML() {
    const t = totals();
    return `
      <aside class="summary" aria-label="Order summary">
        <h2>Your order</h2>
        <div class="mini-lines">${Cart.lines().map(({ product: p, qty, total }) => `
          <div class="mini-line">
            <div class="thumb" style="--glow:${glowColor(p)}">${productArt(p)}</div>
            <div><p>${esc(p.name)}</p><small>${p.digital ? `Download${sizeOf(p) ? ' · ' + esc(sizeOf(p).label) + ' map' : ''}` : `Qty ${qty}`}</small></div>
            <b>${inr(total)}</b>
          </div>`).join('')}</div>
        <div class="sum-row"><span>Items (${t.count})</span><b>${inr(t.sub)}</b></div>
        ${t.discount ? `<div class="sum-row discount"><span>Coupon ${esc(t.code)}</span><b>− ${inr(t.discount)}</b></div>` : ''}
        ${t.code && !t.discount ? `<div class="sum-row discount"><span>Coupon ${esc(t.code)}</span><b>Applied</b></div>` : ''}
        <div class="sum-row"><span>Delivery</span><b>${t.digitalOnly ? 'Not needed' : t.shipping ? inr(t.shipping) : 'FREE'}</b></div>
        <div class="sum-total"><span>To pay</span><b>${inr(t.total)}</b></div>
        <p class="secure-note">${icon('lock', 15)} Order #${esc(orderId)} · <a href="cart.html" style="color:var(--gold)">Edit cart</a></p>
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
          ${f('line1', 'House / flat, street', { full: true, attrs: 'autocomplete="address-line1" placeholder="Flat 12, Sunset Towers, MG Road"' })}
          ${f('line2', 'Area / landmark', { full: true, optional: true, attrs: 'autocomplete="address-line2" placeholder="Near City Mall"' })}
          ${f('city', 'City', { attrs: 'autocomplete="address-level2" placeholder="Mumbai"' })}
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
        ${k.digitalOnly ? `<p class="dl-note" style="margin-bottom:14px">${icon('download', 18)}<span>Racing maps are downloads, so there's no address to fill in. We'll send your download link to the email below.</span></p>` : ''}
        <form id="addrForm" class="form-grid" novalidate>
          ${f('name', 'Full name', { full: true, attrs: 'autocomplete="name" placeholder="Pawan Kumar"' })}
          ${f('phone', 'Mobile number', { attrs: 'type="tel" inputmode="numeric" maxlength="10" autocomplete="tel-national" placeholder="10-digit mobile"' })}
          ${f('email', k.digital ? 'Email (for your map download link)' : 'Email', { optional: !k.digital, attrs: 'type="email" autocomplete="email" placeholder="you@example.com"' })}
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
    const mail = k.digital ? `<br><span style="color:var(--cyan)">Map download link to ${esc(a.email)}</span>` : '';
    return `
      <div class="panel" id="addrPanel">
        <div class="panel-head"><h2>${k.digitalOnly ? 'Your details' : 'Delivery details'}</h2></div>
        <div class="address-card">
          <div><b>${esc(a.name)}</b> · ${esc(a.phone)}${where}${mail}</div>
          <button class="link-btn" type="button" id="editAddr">Change</button>
        </div>
      </div>`;
  }

  function upiPanelHTML(key) {
    const m = METHODS[key], t = totals();
    const payLabel = upiLive ? (isMobile ? `Open ${m.label} and pay ${inr(t.total)}` : `I've paid ${inr(t.total)}`) : `Pay ${inr(t.total)} with ${m.label}`;
    return `
      <div class="pay-panel" role="tabpanel" id="panel-${key}" aria-labelledby="tab-${key}" ${method === key ? '' : 'hidden'}>
        <div class="pay-panel-head">
          <span class="pay-logo ${m.cls}">${m.logo}</span>
          <div><h3>Pay with ${m.label}</h3><p>${isMobile ? `Tap the button to open ${m.label}, or scan the QR from another phone.` : `Open ${m.label} on your phone and scan this QR code.`}</p></div>
        </div>
        <div class="upi-body">
          <div class="qr-wrap">
            <div class="qr-box" data-qr="${key}" aria-label="UPI QR code"></div>
            <span class="qr-scan" aria-hidden="true"></span>
            ${upiLive ? '' : '<span class="demo-stamp">DEMO</span>'}
            <p class="qr-timer">QR valid for <b data-timer>05:00</b></p>
          </div>
          <div class="upi-side">
            <ol class="upi-steps">
              <li>Open <b>${m.label}</b> and tap <b>Scan</b></li>
              <li>Check the amount: <b style="color:var(--cash)">${inr(t.total)}</b></li>
              <li>Enter your UPI PIN to approve</li>
            </ol>
            <button class="btn btn-primary btn-block" type="button" data-pay-upi="${key}">${icon('bolt', 18)} ${payLabel}</button>
            ${upiLive ? `
              <form class="inline-form" data-utr-form="${key}" novalidate hidden>
                <div class="field"><label for="utr-${key}">UPI reference (UTR), 12 digits</label><input class="input" id="utr-${key}" inputmode="numeric" maxlength="12" placeholder="Shown in ${m.label} after paying" autocomplete="off"><span class="err"></span></div>
                <button class="btn btn-cash" type="submit">Confirm</button>
              </form>` : `
              <div class="or-line">or</div>
              <form class="inline-form" data-collect="${key}" novalidate>
                <div class="field"><label for="vpa-${key}">Your UPI ID</label><input class="input" id="vpa-${key}" placeholder="${key === 'phonepe' ? '98xxxxxx10@ybl' : key === 'gpay' ? 'yourname@okaxis' : '98xxxxxx10@paytm'}" autocomplete="off"><span class="err"></span></div>
                <button class="btn btn-ghost" type="submit">Send request</button>
              </form>`}
          </div>
        </div>
      </div>`;
  }

  function cardPanelHTML() {
    const t = totals();
    return `
      <div class="pay-panel" role="tabpanel" id="panel-card" aria-labelledby="tab-card" ${method === 'card' ? '' : 'hidden'}>
        <div class="pay-panel-head">
          <span class="pay-logo pl-card">${icon('card', 20)}</span>
          <div><h3>Debit or credit card</h3><p>Visa, Mastercard, RuPay and American Express.</p></div>
        </div>
        <div class="cc" id="cc" aria-hidden="true">
          <div class="cc-inner">
            <div class="cc-face cc-front">
              <div class="cc-top"><span class="cc-chip"></span><span class="cc-brand" id="ccBrand">CARD</span></div>
              <div class="cc-number" id="ccNum">•••• •••• •••• ••••</div>
              <div class="cc-bottom">
                <div class="cc-name"><small>Card holder</small><b id="ccName">YOUR NAME</b></div>
                <div><small>Expires</small><b id="ccExp">MM/YY</b></div>
              </div>
            </div>
            <div class="cc-face cc-back"><div class="cc-stripe"></div><div class="cc-cvv" id="ccCvv">•••</div></div>
          </div>
        </div>
        <form id="cardForm" class="card-fields" novalidate autocomplete="off">
          <div class="field full"><label for="cardNum">Card number</label><input class="input" id="cardNum" inputmode="numeric" maxlength="23" placeholder="1234 5678 9012 3456" autocomplete="off"><span class="err"></span></div>
          <div class="field full"><label for="cardName">Name on card</label><input class="input" id="cardName" placeholder="As printed on the card" autocomplete="off"><span class="err"></span></div>
          <div class="field"><label for="cardExp">Expiry (MM/YY)</label><input class="input" id="cardExp" inputmode="numeric" maxlength="5" placeholder="MM/YY" autocomplete="off"><span class="err"></span></div>
          <div class="field"><label for="cardCvv">CVV</label><input class="input" id="cardCvv" type="password" inputmode="numeric" maxlength="4" placeholder="•••" autocomplete="off"><span class="err"></span></div>
          <button class="btn btn-primary btn-block full" type="submit">${icon('lock', 18)} Pay ${inr(t.total)}</button>
          ${demo ? '<p class="coupon-hint full" style="margin-top:8px">Demo: use 4111 1111 1111 1111, any future expiry and any 3-digit CVV. Card details are never sent or saved.</p>' : ''}
        </form>
      </div>`;
  }

  function bankPanelHTML() {
    const b = C.bank, t = totals();
    const row = (label, value, copyable = true) => `
      <div class="bank-row"><span>${label}</span><b>${esc(value)}${copyable ? ` <button class="copy-btn" type="button" data-copy="${esc(value)}" aria-label="Copy ${label}">${icon('copy', 16)}</button>` : ''}</b></div>`;
    return `
      <div class="pay-panel" role="tabpanel" id="panel-bank" aria-labelledby="tab-bank" ${method === 'bank' ? '' : 'hidden'}>
        <div class="pay-panel-head">
          <span class="pay-logo pl-bank">${icon('bank', 20)}</span>
          <div><h3>Bank transfer</h3><p>Send exactly <b style="color:var(--cash)">${inr(t.total)}</b> by NEFT, IMPS or RTGS, then enter your transaction reference.</p></div>
        </div>
        <div class="bank-details">
          ${row('Account name', b.accountName)}
          ${row('Account number', b.accountNumber)}
          ${row('IFSC', b.ifsc)}
          ${row('Bank', `${b.bankName}${b.branch ? ', ' + b.branch : ''}`, false)}
          ${row('Account type', b.accountType, false)}
          ${row('Amount', t.total.toFixed(2))}
          ${row('Remarks', orderId)}
        </div>
        <form id="bankForm" novalidate>
          <div class="field"><label for="bankUtr">UTR / transaction reference</label><input class="input" id="bankUtr" maxlength="22" placeholder="e.g. 412345678901" autocomplete="off"><span class="err"></span></div>
          <button class="btn btn-primary btn-block" type="submit">${icon('check', 18)} I've made the transfer</button>
        </form>
        <p class="coupon-hint" style="margin-top:10px">We confirm your order as soon as the money reaches our account, usually within a few hours.</p>
      </div>`;
  }

  function paymentHTML() {
    const t = totals();
    const tabs = Object.entries(METHODS).map(([k, m]) => `
      <button class="pay-tab" role="tab" type="button" id="tab-${k}" data-method="${k}" aria-controls="panel-${k}" aria-selected="${method === k}" tabindex="${method === k ? 0 : -1}">
        <span class="pay-logo ${m.cls}">${m.logo}</span><span>${m.label}<small>${m.sub}</small></span>
      </button>`).join('');
    const notice = demo
      ? `<div class="demo-note">${icon('info', 18)}<span><b>Demo mode:</b> no real money is charged. ${upiLive ? 'UPI QR codes are live and payable.' : 'Add your UPI ID in <code>js/config.js</code> to make the UPI QR codes payable.'}</span></div>`
      : '';
    return `
      <div class="panel" id="payPanel">
        <div class="panel-head"><h2>Payment</h2><span class="pill">${inr(t.total)}</span></div>
        ${notice}
        <div class="pay-layout">
          <div class="pay-tabs" role="tablist" aria-label="Payment method">${tabs}</div>
          <div>${upiPanelHTML('phonepe')}${upiPanelHTML('gpay')}${upiPanelHTML('paytm')}${cardPanelHTML()}${bankPanelHTML()}</div>
        </div>
      </div>`;
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
    app.innerHTML = `
      ${stepsHTML()}
      <div class="checkout-layout">
        <div>${step === 1 ? addressFormHTML() : addressCardHTML() + paymentHTML()}</div>
        ${summaryHTML()}
      </div>`;
    if (step === 2) { bindCard(); showMethod(method, false); }
  }

  /* ---------- step 1: address ---------- */
  function validateAddress() {
    const k = kind();
    const a = { name: val('name').trim(), phone: val('phone').replace(/\D/g, ''), email: val('email').trim() };
    const errs = {
      name: a.name.length < 2 ? 'Enter your full name.' : '',
      phone: /^[6-9]\d{9}$/.test(a.phone) ? '' : 'Enter a valid 10-digit Indian mobile number.',
      email: k.digital
        ? (EMAIL_RE.test(a.email) ? '' : 'Enter your email. We send the map download link there.')
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
    Object.entries(errs).forEach(([k, m]) => fieldErr(k, m));
    const first = Object.keys(errs).find((k) => errs[k]);
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
    if (METHODS[key].upi) startQR(key);
  }

  function startQR(key) {
    const box = $(`[data-qr="${key}"]`);
    if (!box) return;
    box.innerHTML = '';
    // Keep QR text plain ASCII: qrcodejs miscounts multi-byte characters such as "₹".
    const text = upiLive ? `upi://pay?${upiQuery()}` : `DEMO ONLY - ${C.storeName} order ${orderId} - INR ${totals().total} - not a real payment`;
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

  function simulate(steps, onDone) {
    const ov = $('#processing'), list = $('#procSteps');
    list.innerHTML = steps.map((s) => `<li><i></i><span>${esc(s)}</span></li>`).join('');
    ov.classList.add('open');
    lockScroll();
    const lis = $$('li', list);
    let i = 0;
    const next = () => {
      if (i > 0) { const prev = lis[i - 1]; prev.classList.remove('on'); prev.classList.add('ok'); $('i', prev).innerHTML = icon('check', 18); }
      if (i === lis.length) { setTimeout(() => { ov.classList.remove('open'); unlockScroll(); onDone(); }, 500); return; }
      lis[i].classList.add('on');
      i += 1;
      setTimeout(next, reduceMotion ? 300 : 900 + Math.random() * 600);
    };
    next();
  }

  function placeOrder(key, status, extra = {}) {
    const t = totals();
    const order = {
      id: orderId,
      date: new Date().toISOString(),
      items: Cart.items().map((i) => {
        const p = PM.byId(i.id);
        return { id: i.id, qty: i.qty, price: p.price, digital: !!p.digital, size: p.size || null };
      }),
      sub: t.sub, discount: t.discount, shipping: t.shipping, total: t.total, coupon: t.code,
      method: key,
      methodLabel: METHODS[key].label + (extra.detail ? ' · ' + extra.detail : ''),
      status,
      ref: extra.ref || null,
      digital: t.digital,
      email: t.digital ? address.email : null,
      city: t.digitalOnly ? 'Download' : `${address.city} ${address.pincode}`
    };
    const orders = store.get('orders', []);
    orders.unshift(order);
    store.set('orders', orders.slice(0, 20));
    placed = true;
    step = 3;
    session.del('orderId');
    Cart.clear();
    setCoupon(null);
    showSuccess(order);
  }

  function showSuccess(order) {
    const paid = order.status === 'Paid';
    const physical = order.items.some((i) => !i.digital);
    const mapNote = order.digital
      ? ` We'll email your map download link to <b>${esc(order.email)}</b>${paid ? '' : ' as soon as your payment is verified'}.`
      : '';
    app.innerHTML = `${stepsHTML()}
      <div class="empty">
        ${order.digital && !physical ? art('track-city', '#72d572', '#ffc61a') : art('car', '#72d572', '#ffc61a')}
        <h2>Mission complete</h2>
        <p>Order <b>#${esc(order.id)}</b> is ${paid ? 'confirmed' : 'placed and waiting for payment verification'}.${mapNote}</p>
        <a class="btn btn-primary" href="category.html">Keep shopping</a>
      </div>`;
    $('#successSub').textContent = paid ? `Order #${order.id} confirmed` : `Order #${order.id} placed`;
    const respect = Math.max(10, Math.floor(order.total / 10));
    $('#successStats').innerHTML = `
      <div><span>${paid ? 'Paid' : 'Amount'}</span><b class="cashv">${inr(order.total)}</b></div>
      <div><span>Method</span><b>${esc(order.methodLabel)}</b></div>
      <div><span>Status</span><b>${paid ? '<span class="pill">Paid</span>' : '<span class="pill pending">Pending verification</span>'}</b></div>
      ${order.ref ? `<div><span>Reference</span><b>${esc(order.ref)}</b></div>` : ''}
      ${physical ? `<div><span>Deliver to</span><b>${esc(address.name)}, ${esc(address.city)}</b></div>` : ''}
      ${order.digital ? `<div><span>Download link to</span><b>${esc(order.email)}${paid ? '' : ' <small style="color:var(--dim)">(after verification)</small>'}</b></div>` : ''}
      <div><span>Respect earned</span><b style="color:var(--gold)">+${respect} REP</b></div>`;
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

  /* ---------- card helpers ---------- */
  function cardBrand(n) {
    if (/^3[47]/.test(n)) return 'AMEX';
    if (/^4/.test(n)) return 'VISA';
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'MASTERCARD';
    if (/^(60|65|81|82|508|353|356)/.test(n)) return 'RUPAY';
    return 'CARD';
  }
  function luhn(n) {
    let sum = 0, dbl = false;
    for (let i = n.length - 1; i >= 0; i--) {
      let d = +n[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      dbl = !dbl;
    }
    return n.length > 0 && sum % 10 === 0;
  }
  function formatCard(digits) {
    if (cardBrand(digits) === 'AMEX') return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ');
    return digits.replace(/(.{4})/g, '$1 ').trim();
  }
  function bindCard() {
    const num = $('#cardNum');
    if (!num) return;
    const cc = $('#cc');
    num.addEventListener('input', () => {
      const d = num.value.replace(/\D/g, '').slice(0, 19);
      num.value = formatCard(d);
      const brand = cardBrand(d);
      $('#ccBrand').textContent = brand;
      const mask = brand === 'AMEX' ? '•••• •••••• •••••' : '•••• •••• •••• ••••';
      let out = '', di = 0;
      for (const ch of mask) { if (ch === '•') { out += di < d.length ? d[di] : '•'; di += 1; } else out += ch; }
      if (d.length > 16 && brand !== 'AMEX') out = formatCard(d);
      $('#ccNum').textContent = out;
    });
    $('#cardName').addEventListener('input', (e) => { $('#ccName').textContent = e.target.value.trim().toUpperCase() || 'YOUR NAME'; });
    $('#cardExp').addEventListener('input', (e) => {
      let d = e.target.value.replace(/\D/g, '').slice(0, 4);
      if (d.length === 1 && +d > 1) d = '0' + d;
      e.target.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
      $('#ccExp').textContent = e.target.value || 'MM/YY';
    });
    const cvv = $('#cardCvv');
    cvv.addEventListener('input', () => { cvv.value = cvv.value.replace(/\D/g, '').slice(0, 4); $('#ccCvv').textContent = '•'.repeat(cvv.value.length) || '•••'; });
    cvv.addEventListener('focus', () => cc.classList.add('flip'));
    cvv.addEventListener('blur', () => cc.classList.remove('flip'));
  }
  function validateCard() {
    const d = val('cardNum').replace(/\D/g, '');
    const brand = cardBrand(d);
    const name = val('cardName').trim();
    const exp = val('cardExp');
    const cvv = val('cardCvv');
    let expErr = '';
    const m = exp.match(/^(\d{2})\/(\d{2})$/);
    if (!m || +m[1] < 1 || +m[1] > 12) expErr = 'Enter expiry as MM/YY.';
    else {
      const now = new Date();
      const end = new Date(2000 + +m[2], +m[1], 0, 23, 59, 59);
      if (end < now) expErr = 'This card has expired.';
    }
    const lenOk = brand === 'AMEX' ? d.length === 15 : d.length >= 13 && d.length <= 19;
    const errs = {
      cardNum: lenOk && luhn(d) ? '' : 'Enter a valid card number.',
      cardName: name.length < 2 ? 'Enter the name on the card.' : '',
      cardExp: expErr,
      cardCvv: (brand === 'AMEX' ? /^\d{4}$/ : /^\d{3}$/).test(cvv) ? '' : `Enter the ${brand === 'AMEX' ? '4' : '3'}-digit CVV.`
    };
    Object.entries(errs).forEach(([k, msg]) => fieldErr(k, msg));
    const first = Object.keys(errs).find((k) => errs[k]);
    if (first) { document.getElementById(first).focus(); return null; }
    return { brand, last4: d.slice(-4) };
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

    if (form.dataset.collect) {
      const key = form.dataset.collect, m = METHODS[key];
      const vpa = val('vpa-' + key).trim();
      if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(vpa)) { fieldErr('vpa-' + key, 'Enter a valid UPI ID, like name@bank.'); return; }
      fieldErr('vpa-' + key, '');
      simulate([`Sending a payment request to ${vpa}`, `Approve it in your ${m.label} app`, 'Payment confirmed by your bank'], () => placeOrder(key, 'Paid', { detail: vpa }));
      return;
    }

    if (form.dataset.utrForm) {
      const key = form.dataset.utrForm;
      const utr = val('utr-' + key).replace(/\s/g, '');
      if (!/^\d{12}$/.test(utr)) { fieldErr('utr-' + key, 'The UPI reference is 12 digits. Find it in your payment history.'); return; }
      simulate(['Recording your UPI reference', 'Reserving your items'], () => placeOrder(key, 'Pending verification', { ref: utr }));
      return;
    }

    if (form.id === 'cardForm') {
      if (!demo) { helpText('Card payments aren\'t connected yet. Please pay by UPI or bank transfer.', 4200); return; }
      const c = validateCard();
      if (!c) return;
      simulate(['Securely verifying your card', 'Waiting for bank OTP (3-D Secure)', 'Payment authorised'], () => placeOrder('card', 'Paid', { detail: `${c.brand} •••• ${c.last4}` }));
      return;
    }

    if (form.id === 'bankForm') {
      const utr = val('bankUtr').replace(/\s/g, '').toUpperCase();
      if (!/^[A-Z0-9]{10,22}$/.test(utr)) { fieldErr('bankUtr', 'Enter the 10 to 22 character reference from your bank.'); return; }
      fieldErr('bankUtr', '');
      simulate(['Recording your transfer reference', 'Reserving your items'], () => placeOrder('bank', 'Pending verification', { ref: utr }));
    }
  });

  app.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-method]');
    if (tab) {
      showMethod(tab.dataset.method, false);
      tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    if (e.target.closest('#editAddr')) { step = 1; render(); return; }
    const c = e.target.closest('[data-copy]');
    if (c) { copy(c.dataset.copy, c); return; }
    const r = e.target.closest('[data-refresh-qr]');
    if (r) { startQR(r.dataset.refreshQr); return; }
    const pay = e.target.closest('[data-pay-upi]');
    if (pay) {
      const key = pay.dataset.payUpi, m = METHODS[key];
      if (!upiLive) {
        simulate([`Opening ${m.label}`, 'Waiting for your UPI PIN', 'Payment confirmed by your bank'], () => placeOrder(key, 'Paid'));
        return;
      }
      if (isMobile) window.location.href = `${m.scheme}?${upiQuery()}`;
      const f = $(`[data-utr-form="${key}"]`);
      f.hidden = false;
      $('input', f).focus();
      helpText(`After paying in <b>${m.label}</b>, enter the 12-digit UPI reference to confirm.`, 5000);
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

  // Live field formatting for the address form.
  app.addEventListener('input', (e) => {
    if (e.target.id === 'phone' || e.target.id === 'pincode') e.target.value = e.target.value.replace(/\D/g, '');
    if (e.target.closest('.field.invalid')) fieldErr(e.target.id, '');
  });

  onChange(() => { if (!placed) render(); });

  // Returning shoppers with a saved address go straight to payment.
  if (Cart.count() && detailsComplete(address)) step = 2;
  render();
})();
