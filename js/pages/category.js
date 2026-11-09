/* Categories page: loadout wheel + filters */
(function () {
  'use strict';
  const { D, $, $$, esc, inr, card, mount, ART, SIZES, sizeTier } = Object.assign({ ART: window.PM_ART }, window.PM);

  const SLOTS = [{ id: 'all', name: 'All gear', short: 'All', blurb: 'Everything in the store, all in one place.', art: 'all', colors: ['#ffc61a', '#ff2d6f'] }]
    .concat(D.categories.map((c) => ({ id: c.id, name: c.name, short: c.name.split(' ')[0], blurb: c.blurb, art: c.art, colors: c.colors })));

  const params = new URLSearchParams(location.search);
  const state = {
    cat: SLOTS.some((s) => s.id === params.get('cat')) ? params.get('cat') : 'all',
    q: params.get('q') || '',
    max: 6000,
    sort: 'featured',
    size: SIZES[params.get('size')] ? params.get('size') : 'all'
  };
  // The size filter only applies to categories with sized items (racing maps).
  const hasSizes = (cat) => cat !== 'all' && D.products.some((p) => p.cat === cat && SIZES[p.size]);
  if (!hasSizes(state.cat)) state.size = 'all';

  /* ---------- the wheel ---------- */
  const CX = 200, CY = 200, R1 = 80, R2 = 192, GAP = 1.6;
  const polar = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
  function sector(a0, a1) {
    const [x0, y0] = polar(R2, a0), [x1, y1] = polar(R2, a1), [x2, y2] = polar(R1, a1), [x3, y3] = polar(R1, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R2} ${R2} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${R1} ${R1} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
  }
  const step = 360 / SLOTS.length;
  const segs = SLOTS.map((s, i) => {
    const a0 = i * step - step / 2 + GAP, a1 = i * step + step / 2 - GAP;
    const [ix, iy] = polar((R1 + R2) / 2 - 8, i * step);
    const [tx, ty] = polar(R2 - 18, i * step);
    const count = s.id === 'all' ? D.products.length : D.products.filter((p) => p.cat === s.id).length;
    return `<g class="seg" data-cat="${s.id}" role="radio" tabindex="-1" aria-label="${esc(s.name)}, ${count} items">
      <path class="seg-shape" d="${sector(a0, a1)}"/>
      <g class="seg-art"><svg x="${(ix - 30).toFixed(1)}" y="${(iy - 34).toFixed(1)}" width="60" height="60" viewBox="0 0 200 200">${ART.inner(s.art, s.colors[0], s.colors[1])}</svg></g>
      <text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}">${esc(s.short.toUpperCase())}</text>
    </g>`;
  }).join('');
  $('#wheel').innerHTML = `
    <svg viewBox="0 0 400 400" role="radiogroup" aria-label="Category wheel">
      <circle class="wheel-ring" cx="200" cy="200" r="198"/>
      ${segs}
      <circle class="wheel-core" cx="200" cy="200" r="${R1 - 6}"/>
    </svg>
    <div class="wheel-hub" id="hub" aria-hidden="true"><b id="hubName">All</b><span id="hubCount">0 items</span></div>`;

  function selectCat(id, focus) {
    if (!SLOTS.some((s) => s.id === id)) return;
    const changed = state.cat !== id;
    state.cat = id;
    $$('.seg').forEach((g) => {
      const on = g.dataset.cat === id;
      g.classList.toggle('active', on);
      g.setAttribute('aria-checked', String(on));
      g.setAttribute('tabindex', on ? '0' : '-1');
      if (on && focus) g.focus();
    });
    const slot = SLOTS.find((s) => s.id === id);
    const items = id === 'all' ? D.products : D.products.filter((p) => p.cat === id);
    $('#hubName').textContent = slot.short;
    $('#hubCount').textContent = `${items.length} items`;
    $('#loadName').textContent = slot.name;
    $('#loadBlurb').textContent = slot.blurb;
    $('#statCount').textContent = items.length;
    $('#statFrom').textContent = inr(Math.min(...items.map((p) => p.price)));
    $('#statTop').textContent = Math.max(...items.map((p) => p.rating)).toFixed(1) + '★';
    if (changed) {
      ['#hub', '#loadName'].forEach((s) => { const el = $(s); el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); });
      if (!hasSizes(id)) state.size = 'all';
      syncURL();
    }
    renderSizes();
    render(changed);
  }

  function syncURL() {
    const url = new URL(location.href);
    if (state.cat === 'all') url.searchParams.delete('cat'); else url.searchParams.set('cat', state.cat);
    if (state.size === 'all') url.searchParams.delete('size'); else url.searchParams.set('size', state.size);
    history.replaceState(null, '', url);
  }

  /* ---------- map size tiers ---------- */
  function renderSizes() {
    const bar = $('#sizeBar');
    bar.hidden = !hasSizes(state.cat);
    if (bar.hidden) return;
    const items = D.products.filter((p) => p.cat === state.cat);
    const all = `<button type="button" class="size-tier sz-all" data-size="all" aria-pressed="${state.size === 'all'}">
      <b class="size-letter">ALL</b><span class="size-name">All sizes</span>
      <span class="size-detail">Every map in this category</span>
      <span class="size-price"><small>${items.length} maps</small></span></button>`;
    $('#sizeTiers').innerHTML = all + Object.keys(SIZES)
      .map((k) => sizeTier(k, { active: state.size === k, count: items.filter((p) => p.size === k).length })).join('');
  }
  $('#sizeTiers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (!b || b.dataset.size === state.size) return;
    state.size = b.dataset.size;
    $$('#sizeTiers [data-size]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.size === state.size)));
    syncURL();
    render(true);
  });

  $('#wheel').addEventListener('click', (e) => {
    const g = e.target.closest('.seg');
    if (g) selectCat(g.dataset.cat);
  });
  $('#wheel').addEventListener('keydown', (e) => {
    const g = e.target.closest('.seg');
    if (!g) return;
    const i = SLOTS.findIndex((s) => s.id === state.cat);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); selectCat(SLOTS[(i + 1) % SLOTS.length].id, true); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); selectCat(SLOTS[(i - 1 + SLOTS.length) % SLOTS.length].id, true); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCat(g.dataset.cat); }
  });

  /* ---------- filters + grid ---------- */
  const grid = $('#productGrid');
  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = D.products.filter((p) => (state.cat === 'all' || p.cat === state.cat) && p.price <= state.max);
    if (state.size !== 'all') list = list.filter((p) => p.size === state.size);
    if (q) {
      list = list.filter((p) => [p.name, p.desc, p.cat, p.mode, p.digital ? 'race racing map track digital' : '', SIZES[p.size] ? SIZES[p.size].label : '']
        .join(' ').toLowerCase().includes(q));
    }
    const disc = (p) => 1 - p.price / p.mrp;
    const sorters = {
      featured: (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.rating - a.rating,
      low: (a, b) => a.price - b.price,
      high: (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
      discount: (a, b) => disc(b) - disc(a)
    };
    return list.sort(sorters[state.sort]);
  }
  function render(animate) {
    const list = filtered();
    grid.innerHTML = list.map((p) => card(p)).join('');
    grid.classList.remove('swap');
    if (animate) { void grid.offsetWidth; grid.classList.add('swap'); }
    $('#noResults').hidden = list.length > 0;
    $('#resultCount').textContent = `${list.length} item${list.length === 1 ? '' : 's'} found`;
    mount(grid);
  }

  const search = $('#search');
  search.value = state.q;
  let qTimer;
  search.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = search.value; render(true); }, 180); });
  $('#maxPrice').addEventListener('input', (e) => {
    state.max = +e.target.value;
    $('#maxPriceOut').textContent = inr(state.max);
    render(false);
  });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(true); });
  $('#resetFilters').addEventListener('click', () => {
    state.q = ''; state.max = 6000; state.sort = 'featured'; state.size = 'all';
    search.value = ''; $('#maxPrice').value = 6000; $('#maxPriceOut').textContent = inr(6000); $('#sort').value = 'featured';
    selectCat('all');
    syncURL();
    render(true);
  });

  selectCat(state.cat);
})();
