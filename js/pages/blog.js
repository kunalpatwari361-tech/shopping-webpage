/* Blog page: featured post, topic filters, in-game browser reader */
(function () {
  'use strict';
  const { D, $, $$, esc, art, icon, mount, lockScroll, unlockScroll, helpText } = window.PM;

  const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const cover = (b, cls = '') => `<div class="post-cover ${cls}" style="--pc1:${b.colors[0]};--pc2:${b.colors[1]}"><span class="post-tag">${esc(b.tag)}</span>${art(b.art, b.artColors[0], b.artColors[1])}</div>`;
  const meta = (b) => `<div class="post-meta"><span>${fmt(b.date)}</span><span>${b.read} min read</span></div>`;

  const [first, ...rest] = D.blogs;
  $('#featured').innerHTML = `
    <article class="featured-post reveal" data-post="${first.id}" tabindex="0" role="button" aria-label="Read: ${esc(first.title)}">
      ${cover(first)}
      <div class="post-body">
        <span class="eyebrow">Featured story</span>
        ${meta(first)}
        <h2 class="post-title">${esc(first.title)}</h2>
        <p class="post-excerpt">${esc(first.excerpt)}</p>
        <span class="read-more">Read story ${icon('arrow', 16)}</span>
      </div>
    </article>`;

  const tags = ['All'].concat([...new Set(rest.map((b) => b.tag))]);
  let active = 'All';
  function renderFilters() {
    $('#filters').innerHTML = tags.map((t) => `<button class="chip ${t === active ? 'active' : ''}" data-tag="${esc(t)}" aria-pressed="${t === active}">${esc(t)}</button>`).join('');
  }
  function renderPosts() {
    const list = rest.filter((b) => active === 'All' || b.tag === active);
    $('#posts').innerHTML = list.map((b) => `
      <article class="post-card reveal" data-post="${b.id}" tabindex="0" role="button" aria-label="Read: ${esc(b.title)}">
        ${cover(b)}
        <div class="post-body">
          ${meta(b)}
          <h3 class="post-title">${esc(b.title)}</h3>
          <p class="post-excerpt">${esc(b.excerpt)}</p>
          <span class="read-more">Read story ${icon('arrow', 16)}</span>
        </div>
      </article>`).join('');
    mount($('#posts'));
  }
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (!b) return;
    active = b.dataset.tag;
    renderFilters();
    renderPosts();
  });

  /* ---------- reader ---------- */
  const reader = $('#reader');
  $('#closeReader').innerHTML = icon('close', 18);
  $('#shareBtn').innerHTML = icon('copy', 16);
  let current = null, lastFocus = null;

  function blockHTML(block) {
    if (block.h) return `<h3>${esc(block.h)}</h3>`;
    if (block.list) return `<ul>${block.list.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>`;
    return `<p>${esc(block.p)}</p>`;
  }
  function openPost(id, push = true) {
    const i = D.blogs.findIndex((b) => b.id === id);
    if (i < 0) return;
    const b = D.blogs[i], prev = D.blogs[i - 1], next = D.blogs[i + 1];
    current = b;
    $('#readerUrl').innerHTML = `${icon('lock', 14)}<span>www.pawanmode.blog/${esc(b.id)}</span>`;
    $('#readerBody').innerHTML = `
      ${cover(b, 'article-cover')}
      <article class="article">
        ${meta(b)}
        <h2 id="articleTitle">${esc(b.title)}</h2>
        ${b.body.map(blockHTML).join('')}
      </article>
      <nav class="article-nav" aria-label="More posts">
        ${prev ? `<button class="btn btn-ghost btn-sm" data-go="${prev.id}">${icon('back', 16)} Newer</button>` : '<span></span>'}
        ${next ? `<button class="btn btn-ghost btn-sm" data-go="${next.id}">Older ${icon('arrow', 16)}</button>` : '<a class="btn btn-primary btn-sm" href="category.html">Shop the gear</a>'}
      </nav>`;
    $('#readerBody').scrollTop = 0;
    if (!reader.classList.contains('open')) {
      lastFocus = document.activeElement;
      reader.classList.add('open');
      lockScroll();
    }
    setTimeout(() => $('#closeReader').focus(), 60);
    if (push) {
      const url = new URL(location.href);
      url.searchParams.set('post', b.id);
      history.replaceState(null, '', url);
    }
  }
  function closePost() {
    if (!reader.classList.contains('open')) return;
    reader.classList.remove('open');
    unlockScroll();
    current = null;
    const url = new URL(location.href);
    url.searchParams.delete('post');
    history.replaceState(null, '', url);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-post]');
    if (card) { openPost(card.dataset.post); return; }
    const go = e.target.closest('[data-go]');
    if (go) { openPost(go.dataset.go); return; }
    if (e.target.closest('#closeReader') || e.target === reader) closePost();
  });
  document.addEventListener('keydown', (e) => {
    const card = e.target.closest && e.target.closest('[data-post]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPost(card.dataset.post); }
  });
  document.addEventListener('pm:escape', closePost);
  $('#shareBtn').addEventListener('click', () => {
    if (!current) return;
    const link = location.href;
    const ok = () => helpText('Link copied. Share it with your crew.', 2400);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(link).then(ok, () => helpText(link, 5000));
    else helpText(esc(link), 5000);
  });

  renderFilters();
  renderPosts();
  mount();
  const want = new URLSearchParams(location.search).get('post');
  if (want) document.addEventListener('pm:entered', () => setTimeout(() => openPost(want, false), 350), { once: true });
})();
