/* How to use: objectives, product manuals, payment guide, FAQ */
(function () {
  'use strict';
  const { D, $, $$, esc, art, icon, card, mount, banner, reduceMotion } = window.PM;

  /* ---------- Mission objectives (tick off as they scroll into view) ---------- */
  const objWrap = $('#objectives');
  objWrap.innerHTML = D.objectives.map((o, i) => `
    <div class="objective reveal" data-i="${i}">
      <div class="obj-check"><span class="num">${i + 1}</span>${icon('check', 28)}</div>
      <div><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p></div>
    </div>`).join('');
  const objs = $$('.objective', objWrap);
  let done = 0;
  const markDone = (el) => {
    if (el.classList.contains('done')) return;
    el.classList.add('done');
    done += 1;
    $('#objProgress').textContent = `${done} / ${objs.length} complete`;
    if (done === objs.length) setTimeout(() => banner('MISSION COMPLETE', 'You know how to shop. Time to gear up.', { ms: 2800 }), 500);
  };
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { setTimeout(() => markDone(en.target), 500); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -30% 0px', threshold: 0.6 });
    objs.forEach((o) => io.observe(o));
  } else {
    objs.forEach(markDone);
  }

  /* ---------- Manuals ---------- */
  const cats = D.categories.filter((c) => D.manuals[c.id]);
  const fromHash = (location.hash.match(/^#manual-(\w+)/) || [])[1];
  let activeCat = cats.some((c) => c.id === fromHash) ? fromHash : cats[0].id;

  function renderManual() {
    $('#manualTabs').innerHTML = cats.map((c) => `
      <button class="chip ${c.id === activeCat ? 'active' : ''}" role="tab" id="mtab-${c.id}" aria-selected="${c.id === activeCat}" aria-controls="manualPanel" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
    const m = D.manuals[activeCat];
    const products = D.products.filter((p) => p.cat === activeCat).slice(0, 3);
    $('#manualPanel').innerHTML = `
      <div class="manual" role="tabpanel" aria-labelledby="mtab-${activeCat}" id="manual-${activeCat}">
        <div class="manual-media" style="--glow:${window.PM_ART.rgba(m.colors[1], 0.35)}">${art(m.art, m.colors[0], m.colors[1])}</div>
        <div>
          <h3>${esc(m.title)}</h3>
          <p class="manual-intro">${esc(m.intro)}</p>
          <ol class="manual-steps">${m.steps.map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ol>
          <div class="dos">
            <div class="do"><h4>Do</h4><ul>${m.dos.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
            <div class="dont"><h4>Don't</h4><ul>${m.donts.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
          </div>
        </div>
      </div>
      <div class="grid" style="margin-top:18px">${products.map((p) => card(p)).join('')}</div>`;
    mount($('#manualPanel'));
  }
  $('#manualTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    activeCat = b.dataset.cat;
    history.replaceState(null, '', '#manual-' + activeCat);
    renderManual();
  });
  renderManual();
  window.addEventListener('hashchange', () => {
    const c = (location.hash.match(/^#manual-(\w+)/) || [])[1];
    if (c && D.manuals[c] && c !== activeCat) { activeCat = c; renderManual(); $('#manuals').scrollIntoView(); }
  });
  if (fromHash) {
    document.addEventListener('pm:entered', () => setTimeout(() => $('#manuals').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }), 400), { once: true });
  }

  /* ---------- Payment guide ---------- */
  $('#payGuide').innerHTML = D.paymentGuide.map((g) => `
    <div class="pay-guide-card reveal">
      <span class="pay-logo ${g.cls}">${g.icon ? icon(g.icon, 20) : g.logo}</span>
      <h3>${esc(g.name)}</h3>
      <ol>${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    </div>`).join('');

  /* ---------- FAQ ---------- */
  $('#faqList').innerHTML = D.faqs.map((f, i) => `
    <details class="reveal" ${i === 0 ? 'open' : ''}>
      <summary>${esc(f.q)}</summary>
      <p>${esc(f.a)}</p>
    </details>`).join('');

  mount();
})();
