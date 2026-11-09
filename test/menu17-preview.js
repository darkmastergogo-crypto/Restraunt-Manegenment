/* Stand-ins for the customer page's cart functions, used only by menu-preview.html (the live preview inside
   Menu design). Nothing here talks to the database; the staff screen sends the dishes and the draft design. */
'use strict';
let cart = {}, activeCategory = 'All', sharedMenu = [];
const selectedSizes = Object.create(null);
function sizeLabel(size, item) { return MenuOptions.label(item, size); }
function cartKey(id, size) { return size ? JSON.stringify([String(id), size]) : String(id); }
function offeredSizes(item) { return item.sizes_enabled ? MenuOptions.keys(item).filter(s => Number.isFinite(Number((item.size_prices || {})[s])) && !(item.size_stock?.[s]?.tracked && Number(item.size_stock[s].remaining) <= 0)) : []; }
function remainingStock(item, size) { const st = size ? item?.size_stock?.[size] : item?.stock; return st?.tracked ? Math.max(0, Number(st.remaining) || 0) : Infinity; }
function lineName(l) { return l.item.name + (l.size ? ' — ' + sizeLabel(l.size, l.item) : ''); }
function getActiveMenuItems() {
  const p = window.__m17Preview || {}, hidden = (p.custom && p.custom.categoryOptions) || {};
  return (p.items || []).filter(i => i.available !== false && hidden[i.category]?.hidden !== true);
}
function updateQty(id, delta, size = null) {
  const key = cartKey(id, size), base = getActiveMenuItems().find(i => String(i.id) === String(id)); if (!base) return;
  const next = (cart[key]?.qty || 0) + delta;
  if (next <= 0) delete cart[key]; else cart[key] = { item: { ...base, price: size ? Number(base.size_prices[size]) : Number(base.price) }, size, qty: Math.min(50, next) };
  updateCartUI(); window.M17 && M17.render();
}
function updateCartUI() {
  const lines = Object.values(cart), n = lines.reduce((s, l) => s + l.qty, 0), total = lines.reduce((s, l) => s + l.qty * l.item.price, 0);
  const bar = document.getElementById('floatingCartBar'); bar.style.display = n ? 'flex' : 'none';
  document.getElementById('cartTotalPrice').textContent = RESTAURANT_CONFIG.currency + Math.round(total * 100) / 100;
}
function openCartDrawer() { cart = {}; updateCartUI(); window.M17 && M17.render(); }
