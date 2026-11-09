/* Cart page */
(function () {
  'use strict';
  const { D, C, $, esc, inr, art, productArt, glowColor, icon, card, Cart, Wish, totals, getCoupon, setCoupon, store, onChange, mount, helpText, payBadges, byId, catOf } = window.PM;

  const list = $('#cartList'), summary = $('#summary');
  let couponMsg = { text: '', ok: true };

  function emptyState() {
    return `<div class="empty reveal" style="grid-column:1/-1">
      ${art('backpack', '#2a1033', '#ff7a1a')}
      <h2>No loot yet</h2>
      <p>Your cart is empty. Head into the city and grab some gear.</p>
      <a class="btn btn-primary" href="category.html">Start shopping</a>
    </div>`;
  }

  function renderSummary() {
    const t = totals();
    const left = C.freeShippingAt - t.sub;
    const pct = Math.min(100, (t.sub / C.freeShippingAt) * 100);
    const codes = Object.keys(C.coupons);
    summary.innerHTML = `
      <h2>Summary</h2>
      <div class="sum-row"><span>Items (${t.count})</span><b>${inr(t.sub)}</b></div>
      ${t.discount ? `<div class="sum-row discount"><span>Coupon ${esc(t.code)}</span><b>− ${inr(t.discount)}</b></div>` : ''}
      <div class="sum-row"><span>Delivery</span><b>${t.shipping ? inr(t.shipping) : 'FREE'}</b></div>
      <div class="sum-total"><span>Total</span><b>${inr(t.total)}</b></div>
      <div class="ship-meter">
        ${left > 0 ? `Add <b style="color:var(--gold)">${inr(left)}</b> more for free delivery` : '<b style="color:var(--cash)">Free delivery unlocked!</b>'}
        <div class="bar"><span style="width:${pct}%"></span></div>
      </div>
      <form class="coupon" id="couponForm" novalidate>
        <label class="sr-only" for="couponInput">Coupon code</label>
        <input class="input" id="couponInput" placeholder="Coupon code" value="${esc(getCoupon() || '')}" autocomplete="off">
        <button class="btn btn-ghost btn-sm" type="submit">${getCoupon() ? 'Change' : 'Apply'}</button>
      </form>
      <p class="coupon-msg ${couponMsg.ok ? 'ok' : 'bad'}" aria-live="polite">${esc(couponMsg.text)}</p>
      <p class="coupon-hint">Try: ${codes.map((c) => `<button type="button" data-code="${c}">${c}</button>`).join(', ')}</p>
      ${getCoupon() ? '<button class="link-btn danger" type="button" id="removeCoupon">Remove coupon</button>' : ''}
      <a class="btn btn-primary btn-block" style="margin-top:16px" href="checkout.html">${icon('lock', 18)} Checkout</a>
      <p class="secure-note">${icon('shield', 16)} Secure checkout · UPI, cards and bank transfer</p>
      <div style="margin-top:12px">${payBadges()}</div>`;
  }

  function applyCoupon(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) { couponMsg = { text: 'Enter a coupon code.', ok: false }; renderSummary(); return; }
    const c = C.coupons[code];
    if (!c) { couponMsg = { text: `"${code}" isn't a valid code.`, ok: false }; renderSummary(); return; }
    if (Cart.subtotal() < c.min) { couponMsg = { text: `${code} needs an order of ${inr(c.min)} or more.`, ok: false }; renderSummary(); return; }
    couponMsg = { text: `${code} applied: ${c.label}.`, ok: true };
    setCoupon(code);
    helpText(`Coupon <b>${esc(code)}</b> applied.`, 2400);
  }

  function render() {
    const lines = Cart.lines();
    $('#cartLead').textContent = lines.length ? `${Cart.count()} item${Cart.count() > 1 ? 's' : ''} ready for the getaway.` : 'Check your gear before the getaway.';
    if (!lines.length) {
      list.innerHTML = emptyState();
      summary.hidden = true;
      $('#cartLayout').style.gridTemplateColumns = '1fr';
      if (getCoupon()) setCoupon(null);
    } else {
      summary.hidden = false;
      $('#cartLayout').style.gridTemplateColumns = '';
      list.innerHTML = lines.map(({ id, qty, product: p, total }) => `
        <div class="cart-item" data-id="${id}">
          <div class="thumb" data-view="${id}" role="button" tabindex="0" aria-label="Quick view: ${esc(p.name)}" style="--glow:${glowColor(p)}">${productArt(p)}</div>
          <div class="ci-info">
            <span class="card-cat">${esc(catOf(p.cat).name)}</span>
            <h3>${esc(p.name)}</h3>
            <p class="ci-each">${inr(p.price)} each</p>
            <div class="ci-controls">
              <div class="qty" aria-label="Quantity">
                <button type="button" data-dec aria-label="Decrease quantity">${icon('minus', 16)}</button>
                <span>${qty}</span>
                <button type="button" data-inc aria-label="Increase quantity" ${qty >= 10 ? 'disabled' : ''}>${icon('plus', 16)}</button>
              </div>
              <button type="button" class="link-btn" data-save>Move to wishlist</button>
              <button type="button" class="link-btn danger" data-remove>Remove</button>
            </div>
          </div>
          <div class="ci-total">${inr(total)}</div>
        </div>`).join('');
      renderSummary();
    }

    const inCart = new Set(lines.map((l) => l.id));
    const picks = D.products.filter((p) => !inCart.has(p.id)).sort((a, b) => b.rating - a.rating).slice(0, 4);
    $('#suggest').innerHTML = picks.map((p) => card(p)).join('');

    const orders = store.get('orders', []);
    $('#orderList').innerHTML = orders.length ? orders.map((o) => `
      <div class="order-row">
        <div><b>#${esc(o.id)}</b><small>${new Date(o.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></div>
        <div>${o.items.reduce((s, i) => s + i.qty, 0)} items<small>${esc(o.methodLabel)}</small></div>
        <div style="color:var(--cash);font-weight:700">${inr(o.total)}<small>${esc(o.city || '')}</small></div>
        <div><span class="pill ${o.status === 'Paid' ? '' : 'pending'}">${esc(o.status)}</span></div>
      </div>`).join('') : '<p class="muted">No orders yet. Your completed missions will show up here.</p>';
    mount();
  }

  function removeLine(row, fn) {
    row.classList.add('dropping');
    setTimeout(fn, 320);
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.cart-item');
    if (!row) return;
    const id = row.dataset.id, p = byId(id);
    const line = Cart.items().find((i) => i.id === id);
    if (e.target.closest('[data-inc]')) Cart.setQty(id, line.qty + 1);
    else if (e.target.closest('[data-dec]')) {
      if (line.qty <= 1) removeLine(row, () => { Cart.remove(id); helpText(`<b>${esc(p.name)}</b> dropped from your cart.`, 2400); });
      else Cart.setQty(id, line.qty - 1);
    } else if (e.target.closest('[data-remove]')) {
      removeLine(row, () => { Cart.remove(id); helpText(`<b>${esc(p.name)}</b> dropped from your cart.`, 2400); });
    } else if (e.target.closest('[data-save]')) {
      removeLine(row, () => { if (!Wish.has(id)) Wish.toggle(id); Cart.remove(id); helpText(`<b>${esc(p.name)}</b> moved to your wishlist.`, 2400); });
    }
  });

  summary.addEventListener('submit', (e) => {
    if (e.target.id !== 'couponForm') return;
    e.preventDefault();
    applyCoupon($('#couponInput').value);
  });
  summary.addEventListener('click', (e) => {
    const b = e.target.closest('[data-code]');
    if (b) { applyCoupon(b.dataset.code); return; }
    if (e.target.closest('#removeCoupon')) { couponMsg = { text: 'Coupon removed.', ok: true }; setCoupon(null); }
  });

  onChange(() => {
    // Drop a coupon that no longer qualifies (e.g. items removed below its minimum).
    const code = getCoupon();
    if (code && C.coupons[code] && Cart.subtotal() < C.coupons[code].min) {
      couponMsg = { text: `${code} removed: order is below ${inr(C.coupons[code].min)}.`, ok: false };
      setCoupon(null);
      return;
    }
    render();
  });
  render();
})();
