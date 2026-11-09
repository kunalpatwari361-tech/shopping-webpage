/* Home page */
(function () {
  'use strict';
  const { D, $, esc, inr, art, productArt, glowColor, icon, card, ratingHTML, priceHTML, tagHTML, payBadges, byId, mount, reduceMotion } = window.PM;

  $('#statDrops').textContent = D.products.length;

  /* Typewriter */
  const phrases = ['Gear up. Drip out. Rule the city.', 'Streetwear, kicks, gaming gear and rides.', 'Pay with PhonePe, Google Pay, Paytm, card or bank.'];
  const tw = $('#typewriter');
  if (!reduceMotion) {
    let pi = 0, ci = phrases[0].length, deleting = true;
    const tick = () => {
      const text = phrases[pi];
      if (deleting) {
        ci -= 1;
        if (ci <= 0) { deleting = false; pi = (pi + 1) % phrases.length; }
      } else {
        ci += 1;
        if (ci >= phrases[pi].length) { deleting = true; tw.textContent = phrases[pi]; setTimeout(tick, 2400); return; }
      }
      tw.textContent = (deleting ? text : phrases[pi]).slice(0, Math.max(0, ci));
      setTimeout(tick, deleting ? 28 : 55);
    };
    setTimeout(tick, 3200);
  }

  /* News ticker (duplicated so it loops seamlessly) */
  const news = D.news.map((n) => `<span>${esc(n)}</span>`).join('');
  $('#ticker').innerHTML = `<span class="ticker-label">BREAKING</span>${news}<span class="ticker-label">BREAKING</span>${news}`;

  /* Categories */
  $('#homeCats').innerHTML = D.categories.map((c) => {
    const count = D.products.filter((p) => p.cat === c.id).length;
    return `<a class="cat-tile reveal" href="category.html?cat=${c.id}" style="--c1:${c.colors[0] === '#f4f1ea' ? c.colors[1] : c.colors[0]}">
      <span class="cat-count">${count} items</span>
      ${art(c.art, c.colors[0], c.colors[1])}
      <h3>${esc(c.name)}</h3>
      <p>${esc(c.blurb)}</p>
    </a>`;
  }).join('');

  /* Hot drops */
  $('#homeHot').innerHTML = D.products.filter((p) => p.featured).slice(0, 8).map((p) => card(p)).join('');

  /* Deal of the day */
  const deal = byId(D.dealId);
  if (deal) {
    $('#deal').innerHTML = `
      <div class="deal reveal">
        <div class="deal-media" style="--glow:${glowColor(deal)}"><div class="deal-platform"></div>${productArt(deal)}</div>
        <div class="deal-info">
          <span class="eyebrow">Heist of the day</span>
          <h2 class="section-title">${esc(deal.name)}</h2>
          ${ratingHTML(deal)}
          <p class="muted">${esc(deal.desc)}</p>
          ${priceHTML(deal)}
          <div class="timer" id="dealTimer" aria-label="Time left on this deal">
            <div><b data-t="h">00</b><span>Hours</span></div>
            <div><b data-t="m">00</b><span>Mins</span></div>
            <div><b data-t="s">00</b><span>Secs</span></div>
          </div>
          <div class="deal-actions">
            <button class="btn btn-primary" data-add="${deal.id}">${icon('cart', 18)} Grab the loot</button>
            <button class="btn btn-ghost" data-view="${deal.id}">${icon('eye', 18)} Quick view</button>
            <button class="icon-btn wish" style="position:static;width:50px;height:50px" data-wish="${deal.id}" aria-label="Save to wishlist">${icon('heart')}</button>
          </div>
        </div>
      </div>`;
    const cells = { h: $('[data-t="h"]'), m: $('[data-t="m"]'), s: $('[data-t="s"]') };
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const now = new Date(), end = new Date(now);
      end.setHours(24, 0, 0, 0);
      const left = Math.max(0, Math.floor((end - now) / 1000));
      cells.h.textContent = pad(Math.floor(left / 3600));
      cells.m.textContent = pad(Math.floor((left % 3600) / 60));
      cells.s.textContent = pad(left % 60);
    };
    tick();
    setInterval(tick, 1000);
  }

  /* Blog preview */
  $('#homeBlog').innerHTML = D.blogs.slice(0, 3).map((b) => `
    <a class="post-card reveal" href="blog.html?post=${b.id}">
      <div class="post-cover" style="--pc1:${b.colors[0]};--pc2:${b.colors[1]}"><span class="post-tag">${esc(b.tag)}</span>${art(b.art, b.artColors[0], b.artColors[1])}</div>
      <div class="post-body">
        <div class="post-meta"><span>${new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>${b.read} min read</span></div>
        <h3 class="post-title">${esc(b.title)}</h3>
        <p class="post-excerpt">${esc(b.excerpt)}</p>
        <span class="read-more">Read story ${icon('arrow', 16)}</span>
      </div>
    </a>`).join('');

  $('#ctaBadges').innerHTML = payBadges();
  mount();
})();
