/* Wishlist page */
(function () {
  'use strict';
  const { D, $, esc, art, card, Cart, Wish, byId, onChange, mount, helpText, addToCart } = window.PM;

  const grid = $('#wishGrid');

  function render() {
    const ids = Wish.ids();
    $('#wishHead').hidden = !ids.length;
    $('#wishLead').textContent = ids.length ? `${ids.length} item${ids.length > 1 ? 's' : ''} saved for later.` : 'Gear you\'ve marked for later.';
    $('#wishCountText').textContent = `${ids.length} saved item${ids.length === 1 ? '' : 's'}`;
    grid.innerHTML = ids.length
      ? ids.map((id) => card(byId(id), { variant: 'wish' })).join('')
      : `<div class="empty reveal" style="grid-column:1/-1">
          ${art('shades', '#ffc61a', '#ff2d6f')}
          <h2>Nothing saved yet</h2>
          <p>Tap the heart on any product to save it here for later.</p>
          <a class="btn btn-primary" href="category.html">Browse gear</a>
        </div>`;
    const saved = new Set(ids);
    $('#wishSuggest').innerHTML = D.products.filter((p) => !saved.has(p.id)).sort((a, b) => b.reviews - a.reviews).slice(0, 4).map((p) => card(p)).join('');
    mount();
  }

  grid.addEventListener('click', (e) => {
    const move = e.target.closest('[data-move]');
    if (move) {
      const id = move.dataset.move;
      addToCart(id, move);
      Wish.remove(id);
      return;
    }
    const un = e.target.closest('[data-unwish]');
    if (un) {
      const p = byId(un.dataset.unwish);
      Wish.remove(p.id);
      helpText(`Removed <b>${esc(p.name)}</b> from your wishlist.`, 2400);
    }
  });

  $('#moveAll').addEventListener('click', () => {
    const ids = Wish.ids();
    if (!ids.length) return;
    ids.forEach((id) => Cart.add(id, 1));
    ids.forEach((id) => Wish.remove(id));
    window.PM.banner('LOOT SECURED', `${ids.length} item${ids.length > 1 ? 's' : ''} moved to your cart`, { color: 'var(--cash)' });
  });

  onChange(render);
  render();
})();
