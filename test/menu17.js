/* Customer menu v17. Draws the whole QR menu from menu17-data.js settings (20 layouts × 40 themes),
   with dish photos, portion picker sheet, cooking requests, filters, search and the Instagram / Google review offers.
   Loaded after customer.js; it takes over renderMenuItems / renderCategories / selectCategory / handleSearch
   and keeps every original cart, order and tracking feature. In preview mode (menu-preview.html) it draws
   the same menu from data sent by the staff Menu design screen. */
(function () {
'use strict';
const D = window.M17Data; if (!D) return;
const PREVIEW = document.documentElement.dataset.m17Preview === '1';
const byId = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cur = () => (typeof RESTAURANT_CONFIG !== 'undefined' && RESTAURANT_CONFIG.currency) || '₹';
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const money = n => { n = r2(n); return cur() + (Number.isInteger(n) ? n : n.toFixed(2)); };
const safeImg = v => (typeof Cloud !== 'undefined' && Cloud.safeImage) ? Cloud.safeImage(v) : (typeof v === 'string' && /^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(v) ? v : '');
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const today = () => new Date().toLocaleDateString('en-CA');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const slug = s => 'm17c-' + encodeURIComponent(String(s)).replace(/[^A-Za-z0-9]/g, '_');

/* ---------- icons ---------- */
const I = {
  search: '<path d="M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>',
  dots: '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>',
  mark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Zm1 2v12.3l5-3.2 5 3.2V5H7Z"/>',
  markOn: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z"/>',
  share: '<path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1Z"/>',
  info: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z"/>',
  star: '<path d="m12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.1-.6L12 2 9.1 8.7 2 9.3l5.4 4.7-1.6 7z"/>',
  down: '<path d="M7 10l5 5 5-5z"/>', chev: '<path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/>', back: '<path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/>',
  x: '<path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/>',
  pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/>',
  clock: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10.4 3.5 2.1-.8 1.3L11 13V7h2v5.4Z"/>',
  tag: '<path d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8ZM6.5 8A1.5 1.5 0 1 1 6.5 5a1.5 1.5 0 0 1 0 3Z"/>',
  insta: '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2c-2.7 0-3 0-4.1.1-1 0-1.8.2-2.4.5a5 5 0 0 0-1.8 1.2A5 5 0 0 0 2.6 5.6c-.3.6-.5 1.4-.5 2.4C2 9 2 9.3 2 12s0 3 .1 4.1c0 1 .2 1.8.5 2.4.3.7.7 1.3 1.2 1.8s1.1.9 1.8 1.2c.6.3 1.4.5 2.4.5 1.1.1 1.4.1 4.1.1s3 0 4.1-.1c1 0 1.8-.2 2.4-.5a5 5 0 0 0 1.8-1.2 5 5 0 0 0 1.2-1.8c.3-.6.5-1.4.5-2.4.1-1.1.1-1.4.1-4.1s0-3-.1-4.1c0-1-.2-1.8-.5-2.4a5 5 0 0 0-1.2-1.8 5 5 0 0 0-1.8-1.2c-.6-.3-1.4-.5-2.4-.5C15 2 14.7 2 12 2Zm0 1.8c2.7 0 3 0 4 .1.9 0 1.5.2 1.8.3.5.2.8.4 1.2.8.4.4.6.7.8 1.2.1.3.3.9.3 1.8.1 1 .1 1.3.1 4s0 3-.1 4c0 .9-.2 1.5-.3 1.8-.2.5-.4.8-.8 1.2-.4.4-.7.6-1.2.8-.3.1-.9.3-1.8.3-1 .1-1.3.1-4 .1s-3 0-4-.1c-.9 0-1.5-.2-1.8-.3a3 3 0 0 1-1.2-.8 3 3 0 0 1-.8-1.2c-.1-.3-.3-.9-.3-1.8-.1-1-.1-1.3-.1-4s0-3 .1-4c0-.9.2-1.5.3-1.8.2-.5.4-.8.8-1.2.4-.4.7-.6 1.2-.8.3-.1.9-.3 1.8-.3 1-.1 1.3-.1 4-.1Z"/>',
  google: '<path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.4 3-7.3Z"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" opacity=".75"/><path d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14Z" opacity=".55"/><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4.1 5.6-4.1Z" opacity=".9"/>',
  filter: '<path d="M3 5h18v2H3zm4 6h10v2H7zm3 6h4v2h-4z"/>', list: '<path d="M4 6h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zm-4 5h2v2H4zm4 0h12v2H8z"/>',
  check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>', fire: '<path d="M13.5 1s.7 2.6.7 4.7c0 2-1.3 3.7-3.4 3.7S7.3 7.7 7.3 5.7l.1-.4A11.9 11.9 0 0 0 4 13.8 8 8 0 0 0 20 14c0-5.4-2.6-10.2-6.5-13Z"/>'
};
const ic = (name, cls = '') => `<svg class="m-ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${I[name] || ''}</svg>`;

/* ---------- data sources ---------- */
let P = null; // preview payload from the staff screen
const initialCustom = !PREVIEW && window.Custom48 && Custom48.get ? Custom48.get() : null;
const cached = PREVIEW ? null : store.get('m17-cache', null);
function custom() {
  if (PREVIEW) return (P && P.custom) || {};
  const c = (window.Custom48 && Custom48.get && Custom48.get()) || {};
  // Until the saved design arrives, draw the last design this phone saw (no flash of the default look).
  if (c === initialCustom && cached && typeof cached === 'object') return { ...c, ...cached };
  return c;
}
function remember() {
  if (PREVIEW || !window.Custom48) return; const c = Custom48.get(); if (!c || c === initialCustom) return;
  const lg = typeof c.logo === 'string' && c.logo.length < 150000 ? c.logo : undefined;
  store.set('m17-cache', { m17: c.m17, name: c.name, tagline: c.tagline, logo: lg });
}
function allItems() {
  try { return typeof getActiveMenuItems === 'function' ? getActiveMenuItems() : []; } catch { return []; }
}
function categoryOrder() {
  if (PREVIEW) return (P && P.categories) || [];
  return ((typeof Cloud !== 'undefined' && Cloud.categories) || []).slice(1);
}
const catLabel = c => { const l = custom().categoryLabels; return (l && typeof l[c] === 'string' && l[c].trim()) ? l[c] : c; };
const catPhoto = c => safeImg((custom().categoryPhotos || {})[c]);
const restaurantName = () => String(custom().name || (typeof Cloud !== 'undefined' && Cloud.cfg && Cloud.cfg.restaurantName) || (typeof RESTAURANT_CONFIG !== 'undefined' && RESTAURANT_CONFIG.restaurantName) || 'Our restaurant');
const logo = () => safeImg(custom().logo) || (PREVIEW ? '' : 'yummy-momo-logo.webp?v=yummy-44');
function tableLabel() {
  if (PREVIEW) return (P && P.table) || 'Table 1';
  const t = byId('tableText'); return (t && t.textContent.trim()) || '';
}

/* ---------- settings ---------- */
function onAccent(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111111' : '#ffffff';
}
function conf() {
  const c = custom(), m = (c.m17 && typeof c.m17 === 'object') ? c.m17 : {};
  const arch = D.ARCHS.find(a => a.id === m.arch) || D.ARCHS[0], L = { ...arch }, o = (m.layout && typeof m.layout === 'object') ? m.layout : {};
  for (const k of ['hero', 'info', 'nav', 'group', 'item']) if (o[k] && D.PARTS[k].some(([v]) => v === o[k])) L[k] = o[k];
  if (['1', '2', '3'].includes(String(o.cols))) L.cols = Number(o.cols);
  for (const k of ['spot', 'center', 'folded']) if (typeof o[k] === 'boolean') L[k] = o[k];
  const theme = { ...(D.THEMES.find(t => t.id === m.theme) || D.THEMES[0]) };
  if (/^#[0-9a-f]{6}$/i.test(m.accent || '')) { theme.accent = m.accent; theme.onAccent = onAccent(m.accent); }
  if (m.font && D.FONTS[m.font]) theme.head = m.font;
  if (m.bodyFont && D.FONTS[m.bodyFont]) theme.body = m.bodyFont;
  if (m.radius !== undefined && m.radius !== '' && Number.isFinite(Number(m.radius))) theme.radius = Math.max(0, Math.min(28, Number(m.radius)));
  const texts = { ...D.TEXT_DEFAULTS };
  if (m.texts && typeof m.texts === 'object') for (const [k, v] of Object.entries(m.texts)) if (k in texts && typeof v === 'string') texts[k] = v.slice(0, 600);
  const show = { ...D.SHOW_DEFAULTS };
  if (m.show && typeof m.show === 'object') for (const [k, v] of Object.entries(m.show)) if (k in show && typeof v === 'boolean') show[k] = v;
  const slides = (Array.isArray(m.hero && m.hero.slides) ? m.hero.slides : []).map(s => ({ src: safeImg(s && s.src), caption: String((s && s.caption) || '').slice(0, 120) })).filter(s => s.src).slice(0, 8);
  const catBanner = ['banner', 'thumb', 'none'].includes(m.catBanner) ? m.catBanner : 'banner';
  return { enabled: m.enabled !== false, L, theme, texts, show, slides, offers: D.offers(m.offers), density: m.density === 'compact' ? 'compact' : 'cozy', catBanner };
}
let C = conf();
const t = (key, vars = {}) => String(C.texts[key] ?? D.TEXT_DEFAULTS[key] ?? '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/* ---------- state ---------- */
const S = {
  q: '', f: new Set(), sort: 'default', tab: null, open: new Set(), closed: new Set(), saved: new Set(store.get('m17-saved', [])),
  offers: new Set(), go: {}, ok: {}, sheet: null, notes: store.get('m17-notes', {}), lastFocus: null, active: null
};
const saveNotes = () => store.set('m17-notes', S.notes);
function usedOffers() { const u = store.get('m17-offers-used', null); return u && u.day === today() && Array.isArray(u.offers) ? u.offers : []; }
function markUsed(list) { store.set('m17-offers-used', { day: today(), offers: [...new Set([...usedOffers(), ...list])] }); }

/* ---------- theme ---------- */
const loadedFonts = new Set();
function font(name) {
  if (!name || loadedFonts.has(name) || !D.FONTS[name]) return; loadedFonts.add(name);
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + D.FONTS[name] + '&display=swap'; document.head.append(l);
}
function applyTheme() {
  const th = C.theme; font(th.head); font(th.body);
  const vars = {
    '--m-bg': th.bg, '--m-card': th.card, '--m-ink': th.ink, '--m-sub': th.sub, '--m-line': th.line, '--m-soft': th.soft, '--m-accent': th.accent, '--m-on-accent': th.onAccent,
    '--m-tag': th.tag || (th.dark ? '#4ade80' : '#1ba672'), '--m-good': th.dark ? '#22c55e' : '#1ba672', '--m-veg': th.dark ? '#22c55e' : '#0f8a3d', '--m-nonveg': th.dark ? '#f87171' : '#c0392b',
    '--m-add-bg': th.dark ? th.card : '#ffffff', '--m-add-ink': th.accent === '#ffffff' || th.accent === '#0a0a0a' ? th.ink : th.accent,
    '--m-r': th.radius + 'px', '--m-r-sm': Math.max(0, Math.round(th.radius * 0.6)) + 'px', '--m-head': `'${th.head}', system-ui, sans-serif`, '--m-body': `'${th.body}', system-ui, sans-serif`,
    '--m-shadow': th.dark ? '0 8px 28px -12px rgba(0,0,0,.7)' : '0 8px 24px -14px rgba(28,28,28,.28)', '--m-scheme': th.dark ? 'dark' : 'light'
  };
  let st = byId('m17Vars'); if (!st) { st = document.createElement('style'); st.id = 'm17Vars'; document.head.append(st); }
  const css = ':root{' + Object.entries(vars).map(([k, v]) => k + ':' + v).join(';') + '}';
  if (st.textContent !== css) st.textContent = css;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = th.bg;
}

/* ---------- shell ---------- */
let root = null, layer = null;
function shell() {
  if (root) return root;
  root = document.createElement('div'); root.id = 'm17'; root.setAttribute('data-custom48-ignore', '');
  root.innerHTML = `
    <div class="m-head" id="m17Head">
      <div class="m-topbar" id="m17TopBar"><div class="m-tb-left" id="m17TbLeft"></div>
        <button type="button" class="m-searchpill" data-a="search"><span class="m-sp-ic">${ic('search')}</span><span class="m-sp-t" id="m17SearchLabel"></span></button>
        <div class="m-tb-right" id="m17TbRight"></div></div>
      <div class="m-hero-box" id="m17Hero"></div></div>
    <div class="m-info" id="m17Info"></div>
    <div class="m-actions" id="m17Actions"></div>
    <div class="m-slot" id="m17Slot"></div>
    <div class="m-sticky" id="m17Sticky">
      <div class="m-mini" id="m17Mini"></div>
      <div class="m-searchbar" id="m17SearchBar" hidden><button type="button" class="m-icbtn" data-a="search-close" aria-label="Close search">${ic('back')}</button>
        <input type="search" id="m17Q" autocomplete="off" enterkeyhint="search"><button type="button" class="m-icbtn" data-a="search-clear" aria-label="Clear search" id="m17QClear" hidden>${ic('x')}</button></div>
      <div class="m-filters" id="m17Filters" role="toolbar"></div>
      <nav class="m-chips" id="m17Chips"></nav></div>
    <div class="m-tiles" id="m17Tiles"></div>
    <section class="m-spot" id="m17Spot"></section>
    <div class="m-body" id="m17Body"><nav class="m-rail" id="m17Rail"></nav><main class="m-list" id="m17List"></main></div>
    <div class="m-foot-space"></div>
    <button type="button" class="m-pill" id="m17Pill" data-a="cats" hidden></button>`;
  const anchor = document.querySelector('.menu-hero');
  if (anchor) anchor.before(root); else document.body.prepend(root);
  layer = document.createElement('div'); layer.id = 'm17Layer'; layer.className = 'm17-layer'; layer.hidden = true; layer.setAttribute('data-custom48-ignore', '');
  layer.innerHTML = '<div class="m-scrim" data-a="close"></div><div class="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m17SheetTitle" tabindex="-1"><button type="button" class="m-x" data-a="close" aria-label="Close">' + ic('x') + '</button><div class="m-sheet-in" id="m17SheetBody"></div></div>';
  document.body.append(layer);
  if (!PREVIEW) {
    const ordersBtn = document.createElement('button'); ordersBtn.type = 'button'; ordersBtn.id = 'm17OrdersBtn'; ordersBtn.className = 'm-act'; ordersBtn.dataset.a = 'orders'; byId('m17Actions').append(ordersBtn);
  } else {
    byId('m17TbLeft').innerHTML = '<span class="table-badge"><span class="dot"></span><span>' + esc(tableLabel()) + '</span></span>';
    byId('m17TbRight').innerHTML = '<button type="button" class="nav-menu-toggle" aria-label="Open menu"><span></span><span></span><span></span></button>';
    byId('m17Actions').innerHTML = '<div class="waiter-call-action"><button type="button" class="call-waiter-button" id="m17PvWaiter"><span></span></button></div><button type="button" class="song-request-button" id="m17PvSong"></button>';
  }
  const q = byId('m17Q');
  q.addEventListener('input', () => { S.q = q.value.trim(); byId('m17QClear').hidden = !q.value; schedule(); });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });
  root.addEventListener('click', onClick); layer.addEventListener('click', onClick);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !layer.hidden) closeLayer(); if (e.key === 'Tab' && !layer.hidden) trap(e); });
  byId('m17Body').addEventListener('scroll', () => {}, { passive: true });
  watchScroll();
  return root;
}
/* The original page keeps its own buttons (call waiter, song, table badge, notices); the new menu borrows them
   and gives them back if the owner switches the new menu off. */
const borrowed = [];
function adopt() {
  if (PREVIEW) return;
  const place = (node, target, before = null) => { if (!node || !target || target.contains(node)) return; borrowed.push({ node, parent: node.parentNode, next: node.nextSibling }); target.insertBefore(node, before); };
  const slot = byId('m17Slot');
  for (const id of ['tableAccessNotice', 'waiterConfirmation', 'activeOrderBanner', 'customerOrdersBar', 'cloudMessage', 'pendingRetry']) place(byId(id), slot);
  place(byId('tableBadge'), byId('m17TbLeft')); place(byId('navMenuToggle'), byId('m17TbRight'));
  const actions = byId('m17Actions'), ob = byId('m17OrdersBtn');
  place(document.querySelector('.waiter-call-action'), actions, ob); place(byId('requestSongButton'), actions, ob);
}
function release() { while (borrowed.length) { const { node, parent, next } = borrowed.pop(); if (parent) parent.insertBefore(node, next && next.parentNode === parent ? next : null); } }
function trap(e) {
  const f = [...layer.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea,select')].filter(x => x.offsetParent !== null);
  if (!f.length) return; const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ---------- helpers for dishes ---------- */
const sizesOf = i => (i && i.sizes_enabled && typeof offeredSizes === 'function') ? offeredSizes(i).slice().sort((a, b) => Number(i.size_prices[a]) - Number(i.size_prices[b])) : [];
const isSized = i => !!(i && i.sizes_enabled);
const priceOf = (i, s) => s ? Number(i.size_prices[s]) : Number(i.price);
const minPrice = i => { const o = sizesOf(i); return o.length ? Math.min(...o.map(s => priceOf(i, s))) : Number(i.price); };
const left = (i, s) => { try { return typeof remainingStock === 'function' ? remainingStock(i, s) : Infinity; } catch { return Infinity; } };
const soldOut = i => isSized(i) ? !sizesOf(i).length : left(i, null) <= 0;
const lines = id => Object.values(typeof cart === 'object' ? cart : {}).filter(l => String(l.item.id) === String(id));
const qtyOf = id => lines(id).reduce((n, l) => n + l.qty, 0);
const keyOf = (id, s) => typeof cartKey === 'function' ? cartKey(id, s) : (s ? JSON.stringify([String(id), s]) : String(id));
const sizeName = (i, s) => typeof sizeLabel === 'function' ? sizeLabel(s, i) : s;
const findItem = id => allItems().find(i => String(i.id) === String(id));

function filtered(list) {
  let out = list;
  if (S.q) { const q = S.q.toLowerCase(); out = out.filter(i => [i.name, i.description, i.category, catLabel(i.category)].some(v => String(v || '').toLowerCase().includes(q))); }
  if (S.f.has('veg')) out = out.filter(i => i.veg === true);
  if (S.f.has('nonveg')) out = out.filter(i => i.veg !== true);
  if (S.f.has('best')) out = out.filter(i => i.best_seller === true);
  if (S.f.has('rec')) out = out.filter(i => i.recommended === true);
  if (S.f.has('saved')) out = out.filter(i => S.saved.has(String(i.id)));
  if (S.sort === 'low') out = [...out].sort((a, b) => minPrice(a) - minPrice(b));
  if (S.sort === 'high') out = [...out].sort((a, b) => minPrice(b) - minPrice(a));
  return out;
}
function groups(list) {
  const order = categoryOrder(), map = new Map();
  for (const c of order) map.set(c, []);
  for (const i of list) { const c = i.category || 'Menu'; if (!map.has(c)) map.set(c, []); map.get(c).push(i); }
  return [...map].filter(([, xs]) => xs.length).map(([cat, xs]) => ({ cat, label: catLabel(cat), items: xs, photo: catPhoto(cat) || safeImg((xs.find(x => safeImg(x.image)) || {}).image) }));
}

/* ---------- dish markup ---------- */
function vegMark(i) { return C.show.vegMark ? `<span class="m-veg ${i.veg ? 'is-veg' : 'is-non'}" role="img" aria-label="${i.veg ? 'Vegetarian' : 'Non-vegetarian'}"><i></i></span>` : ''; }
function tags(i) {
  if (!C.show.tags) return '';
  return (i.best_seller === true ? `<span class="m-tag">${ic('fire')}${esc(t('bestseller'))}</span>` : '') + (i.recommended === true ? `<span class="m-tag m-tag-rec">${ic('star')}${esc(t('recommended'))}</span>` : '');
}
function buy(i, compact = false) {
  if (soldOut(i)) return `<span class="m-sold">${esc(t('soldOut'))}</span>`;
  const q = qtyOf(i.id), id = esc(i.id);
  const btn = q ? `<div class="m-step" role="group" aria-label="${esc(i.name)} quantity"><button type="button" data-a="dec" data-id="${id}" aria-label="Remove one ${esc(i.name)}">−</button><b aria-live="polite">${q}</b><button type="button" data-a="inc" data-id="${id}" aria-label="Add one more ${esc(i.name)}">+</button></div>`
    : `<button type="button" class="m-add" data-a="add" data-id="${id}" aria-label="Add ${esc(i.name)}">${esc(t('add'))}<i aria-hidden="true">+</i></button>`;
  const custom = isSized(i) && C.show.customisable && !compact ? `<small class="m-custom">${esc(t('customisable'))}</small>` : '';
  return `<div class="m-buy">${btn}${custom}</div>`;
}
function priceLine(i) {
  const sized = isSized(i) && sizesOf(i).length > 1, p = minPrice(i);
  const l = isSized(i) ? Infinity : left(i, null);
  return `<div class="m-price">${sized ? `<small>${esc(t('from'))}</small> ` : ''}<b>${money(p)}</b>${Number.isFinite(l) && l > 0 && l <= 5 ? `<span class="m-low">${esc(t('onlyLeft', { n: l }))}</span>` : ''}</div>`;
}
function icons(i) {
  const saved = S.saved.has(String(i.id)), id = esc(i.id);
  return (C.show.bookmark ? `<button type="button" class="m-round${saved ? ' on' : ''}" data-a="save" data-id="${id}" aria-pressed="${saved}" aria-label="${esc(t('save'))} ${esc(i.name)}">${ic(saved ? 'markOn' : 'mark')}</button>` : '')
    + (C.show.share ? `<button type="button" class="m-round" data-a="share" data-id="${id}" aria-label="${esc(t('share'))} ${esc(i.name)}">${ic('share')}</button>` : '');
}
function dish(i, style, big = false) {
  const photo = C.show.photos ? safeImg(i.image) : '', id = esc(i.id), q = qtyOf(i.id);
  const desc = C.show.desc && i.description ? `<p class="m-desc">${esc(i.description)}</p>` : '';
  const more = C.show.desc && i.description && i.description.length > 70 ? `<button type="button" class="m-more" data-a="open" data-id="${id}">${esc(t('more'))}</button>` : '';
  const tg = tags(i), icn = icons(i);
  const name = `<h3 class="m-name"><button type="button" data-a="open" data-id="${id}">${esc(i.name)}</button></h3>`;
  const img = photo ? `<img src="${esc(photo)}" alt="${esc(i.name)}" loading="lazy" decoding="async" width="300" height="300">` : '';
  const cls = `m-dish m-s-${style}${big ? ' m-big' : ''}${photo ? ' has-photo' : ' no-photo'}${q ? ' in-cart' : ''}${soldOut(i) ? ' is-sold' : ''}`;
  const head = `<div class="m-meta">${vegMark(i)}${tg ? `<span class="m-tags">${tg}</span>` : ''}</div>`;
  if (style === 'story') {
    return `<article class="${cls}" data-k="${id}"><div class="m-media" data-a="open" data-id="${id}">${img || `<div class="m-noimg">${esc(i.name.slice(0, 1))}</div>`}<div class="m-shade"><div class="m-meta">${vegMark(i)}</div>${name}${priceLine(i)}</div></div>
      <div class="m-under">${tg ? `<div class="m-tags">${tg}</div>` : ''}${desc}<div class="m-row-end"><div class="m-icons">${icn}</div>${buy(i)}</div></div></article>`;
  }
  if (['text', 'fine', 'thumb'].includes(style) || !photo) {
    const thumb = style === 'thumb' && photo ? `<div class="m-thumb" data-a="open" data-id="${id}">${img}</div>` : '';
    return `<article class="${cls}" data-k="${id}">${thumb}<div class="m-copy">${head}<div class="m-line">${name}${style === 'text' ? '<span class="m-dots" aria-hidden="true"></span>' + priceLine(i) : ''}</div>${style !== 'text' ? priceLine(i) : ''}${desc}${more}${icn ? `<div class="m-icons">${icn}</div>` : ''}</div><div class="m-side">${buy(i)}</div></article>`;
  }
  return `<article class="${cls}" data-k="${id}"><div class="m-copy">${head}${name}${priceLine(i)}${desc}${more}${icn ? `<div class="m-icons">${icn}</div>` : ''}</div>
    <div class="m-media"><button type="button" class="m-photo" data-a="open" data-id="${id}" aria-label="Open ${esc(i.name)}">${img}</button>${buy(i)}</div></article>`;
}

/* ---------- keyed patching keeps photos from reloading ---------- */
function patch(parent, parts) {
  const old = new Map([...parent.children].map(n => [n.dataset.k, n])), want = [];
  for (const { k, html } of parts) {
    let n = old.get(k);
    if (!n || n._h !== html) { const tpl = document.createElement('template'); tpl.innerHTML = html.trim(); const fresh = tpl.content.firstElementChild; fresh._h = html; if (n) n.replaceWith(fresh); n = fresh; }
    want.push(n);
  }
  for (const c of [...parent.children]) if (!want.includes(c)) c.remove();
  want.forEach((n, i) => { if (parent.children[i] !== n) parent.insertBefore(n, parent.children[i] || null); });
}

/* ---------- sections ---------- */
function headHtml(g, fold, open) {
  const count = C.show.counts ? `<span class="m-count">${esc(g.items.length === 1 ? t('oneDish') : t('dishes', { n: g.items.length }))}</span>` : '';
  // v19: each category can have its own banner photo (Menu design → Categories).
  const own = C.show.catPhotos && C.catBanner === 'banner' ? catPhoto(g.cat) : '';
  if (own) {
    const inner = `<img class="m-cb-img" src="${esc(own)}" alt="" loading="lazy" decoding="async"><span class="m-cb-shade"></span><span class="m-cat-t"><h2>${esc(g.label)}</h2>${count}</span>${fold ? `<span class="m-cat-chev${open ? ' open' : ''}">${ic('chev')}</span>` : ''}`;
    return fold ? `<button type="button" class="m-cat-head m-cat-banner" data-a="fold" data-cat="${esc(g.cat)}" aria-expanded="${open}">${inner}</button>` : `<div class="m-cat-head m-cat-banner">${inner}</div>`;
  }
  const ph = C.show.catPhotos && C.catBanner !== 'none' && g.photo && (C.L.group === 'accordion' || C.catBanner === 'thumb') ? `<span class="m-cat-ph"><img src="${esc(g.photo)}" alt="" loading="lazy" decoding="async"></span>` : '';
  const inner = `${ph}<span class="m-cat-t"><h2>${esc(g.label)}</h2>${count}</span>${fold ? `<span class="m-cat-chev${open ? ' open' : ''}">${ic('chev')}</span>` : ''}`;
  return fold ? `<button type="button" class="m-cat-head" data-a="fold" data-cat="${esc(g.cat)}" aria-expanded="${open}">${inner}</button>` : `<div class="m-cat-head">${inner}</div>`;
}
function renderList(gs, flat) {
  const list = byId('m17List'), L = C.L;
  if (!gs.length) {
    const any = S.q || S.f.size;
    patch(list, [{ k: 'empty', html: `<div class="m-empty" data-k="empty"><p>${esc(allItems().length ? t('noResults') : (PREVIEW ? 'Add dishes in Items to see them here.' : ''))}</p>${any ? `<button type="button" class="m-btn" data-a="clear">${esc(t('clear'))}</button>` : ''}</div>` }]);
    return;
  }
  if (flat) {
    const style = L.item === 'story' || L.item === 'bento' ? 'row' : L.item;
    const html = `<section class="m-cat m-results" data-k="results"><div class="m-cat-head"><span class="m-cat-t"><h2>${esc(S.q ? t('results', { q: S.q }) : t('menuTitle'))}</h2></span></div><div class="m-items" data-style="${style}"></div></section>`;
    patch(list, [{ k: 'results', html }]);
    patch(list.querySelector('.m-items'), gs.flatMap(g => g.items).map(i => ({ k: String(i.id), html: dish(i, style) })));
    return;
  }
  let show = gs;
  if (L.group === 'tabs') { if (!gs.some(g => g.cat === S.tab)) S.tab = gs[0].cat; show = gs.filter(g => g.cat === S.tab); }
  const fold = L.group === 'accordion';
  const parts = show.map((g, idx) => {
    const open = !fold || (L.folded ? S.open.has(g.cat) : !S.closed.has(g.cat));
    return { g, open, k: 'c:' + g.cat, html: `<section class="m-cat${open ? '' : ' is-closed'}" data-k="c:${esc(g.cat)}" id="${slug(g.cat)}" data-cat="${esc(g.cat)}">${headHtml(g, fold, open)}<div class="m-items" data-style="${L.item}"${open ? '' : ' hidden'}></div></section>` };
  });
  patch(list, parts.map(({ k, html }) => ({ k, html })));
  parts.forEach(({ g, open }, idx) => {
    const box = list.children[idx].querySelector('.m-items');
    if (!open) { box.replaceChildren(); return; }
    patch(box, g.items.map((i, n) => ({ k: String(i.id), html: dish(i, L.item, L.item === 'bento' && n === 0) })));
  });
}

/* ---------- top of the page ---------- */
function slidesFor() {
  if (C.slides.length) return C.slides;
  const cats = custom().categoryPhotos || {}, out = [];
  for (const c of categoryOrder()) { const s = safeImg(cats[c]); if (s) out.push({ src: s, caption: catLabel(c) }); }
  if (!out.length) for (const i of allItems()) { const s = safeImg(i.image); if (s) out.push({ src: s, caption: i.name }); if (out.length >= 5) break; }
  return out.slice(0, 8);
}
let heroSig = '', heroTimer = null;
function renderHero() {
  const box = byId('m17Hero'), kind = C.show.hero ? C.L.hero : 'none', slides = slidesFor();
  const name = restaurantName(), tag = t('tagline') || (custom().tagline || '');
  const lg = logo();
  const sig = JSON.stringify([kind, slides, name, tag, lg]);
  root.dataset.hero = kind; root.dataset.heroImg = String(!!slides.length && ['carousel', 'cover', 'banner', 'split'].includes(kind));
  if (sig === heroSig) return; heroSig = sig; clearInterval(heroTimer);
  const fallback = `<div class="m-hero-fallback"><span>${esc(name)}</span></div>`;
  if (kind === 'none' || kind === 'compact') { box.innerHTML = ''; return; }
  if (kind === 'split') {
    box.innerHTML = `<div class="m-split"><div class="m-split-t">${lg ? `<img class="m-logo" src="${esc(lg)}" alt="">` : ''}<h2>${esc(name)}</h2>${tag ? `<p>${esc(tag)}</p>` : ''}</div><div class="m-split-ph">${slides[0] ? `<img src="${esc(slides[0].src)}" alt="" fetchpriority="high">` : fallback}</div></div>`;
    return;
  }
  if (kind === 'cover') {
    box.innerHTML = `<div class="m-cover">${slides[0] ? `<img class="m-cover-img" src="${esc(slides[0].src)}" alt="" fetchpriority="high">` : '<div class="m-cover-img m-grad"></div>'}<div class="m-cover-t">${lg ? `<img class="m-logo" src="${esc(lg)}" alt="">` : ''}<h2>${esc(name)}</h2>${tag ? `<p>${esc(tag)}</p>` : ''}</div></div>`;
    return;
  }
  if (!slides.length) { box.innerHTML = `<div class="m-slider m-${kind}">${fallback}</div>`; return; }
  box.innerHTML = `<div class="m-slider m-${kind}"><div class="m-slides" id="m17Slides">${slides.map((s, n) => `<figure class="m-slide"><img src="${esc(s.src)}" alt="${esc(s.caption)}" ${n ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></figure>`).join('')}</div>
    <div class="m-cap"><b id="m17Cap">${esc(slides[0].caption)}</b>${slides.length > 1 ? `<span class="m-dots-nav">${slides.map((_, n) => `<i class="${n ? '' : 'on'}"></i>`).join('')}</span>` : ''}</div></div>`;
  const track = byId('m17Slides'); let idx = 0;
  const sync = () => { const n = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (n === idx) return; idx = n; byId('m17Cap').textContent = slides[n] ? slides[n].caption : ''; box.querySelectorAll('.m-dots-nav i').forEach((d, k) => d.classList.toggle('on', k === n)); };
  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  if (slides.length > 1 && !reduced()) heroTimer = setInterval(() => { if (document.hidden || !track.isConnected) return; const next = (idx + 1) % slides.length; track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' }); }, 4500);
}
function offerList() {
  const o = C.offers, used = usedOffers(), out = [];
  if (o.insta.on && !used.includes('insta')) out.push('insta');
  if (o.review.on && !used.includes('review')) out.push('review');
  return out;
}
function bestOffer() { const o = C.offers, l = offerList(); if (!l.length) return 0; const a = l.map(k => o[k].amount); return o.mode === 'both' ? a.reduce((x, y) => x + y, 0) : Math.max(...a); }
function renderInfo() {
  const box = byId('m17Info'), kind = C.show.info ? C.L.info : 'none'; root.dataset.info = kind;
  if (kind === 'none') { box.innerHTML = ''; return; }
  const name = restaurantName(), lg = logo(), tag = t('tagline') || '', loc = t('location'), tm = t('time'), chip = t('chip');
  const rating = C.show.rating && t('rating') ? `<button type="button" class="m-rate" data-a="${C.offers.review.on ? 'offers' : 'about'}"><span class="m-rate-top">${esc(t('rating'))}${ic('star')}</span>${t('ratingCount') ? `<span class="m-rate-bot">${esc(t('ratingCount'))}</span>` : ''}</button>` : '';
  const tbl = tableLabel();
  const offers = C.show.offers ? offerList() : [];
  const strip = offers.length ? `<button type="button" class="m-offerstrip" data-a="offers"><span class="m-os-ic">${ic('tag')}</span><span class="m-os-t"><b>${esc(t('offersLine', { amount: money(bestOffer()) }))}</b><span> · ${esc(offers.length === 1 ? t('offerCount1') : t('offersCount', { n: offers.length }))}</span></span>${ic('down', 'm-os-down')}</button>` : '';
  const about = t('about') ? `<button type="button" class="m-i" data-a="about" aria-label="${esc(t('aboutTitle'))}">${ic('info')}</button>` : '';
  const heroKind = C.show.hero ? C.L.hero : 'none', heroNamed = heroKind === 'cover' || heroKind === 'split';
  const lines = `${loc ? `<p class="m-info-line">${ic('pin')}<span>${esc(loc)}</span></p>` : ''}${tm || tbl ? `<p class="m-info-line">${ic('clock')}<span>${esc([tm, tbl].filter(Boolean).join(' · '))}</span></p>` : ''}`;
  if (heroNamed && !lines && !rating && !chip && !strip && !about) { box.innerHTML = ''; return; }
  const top = heroNamed
    ? `<div class="m-info-top m-info-slim"><div class="m-info-name">${lines}${about ? `<button type="button" class="m-info-about" data-a="about">${ic('info')}<span>${esc(t('aboutTitle'))}</span></button>` : ''}</div>${rating}</div>`
    : `<div class="m-info-top">${lg ? `<img class="m-logo" src="${esc(lg)}" alt="">` : ''}<div class="m-info-name"><h1>${esc(name)}${about}</h1>${tag ? `<p>${esc(tag)}</p>` : ''}</div>${rating}</div>${lines}`;
  box.innerHTML = `<div class="m-info-card${heroNamed ? ' m-info-named' : ''}">${top}
    ${chip ? `<span class="m-chip-badge">${esc(chip)}</span>` : ''}${strip}</div>`;
}
function renderActions() {
  const a = byId('m17Actions');
  a.classList.toggle('no-waiter', !C.show.waiter); a.classList.toggle('no-song', !C.show.song);
  const w = a.querySelector('.call-waiter-button span:last-child, #m17PvWaiter span'); if (w) w.textContent = t('callWaiter');
  const s = a.querySelector('#requestSongButton, #m17PvSong'); if (s) s.textContent = '♪ ' + t('requestSong');
  const o = byId('m17OrdersBtn');
  if (o) { const bar = byId('customerOrdersBar'); o.hidden = !C.show.orders || !bar || bar.hidden; o.textContent = t('yourOrders'); }
  const songVisible = s && C.show.song && !(s.hidden && !PREVIEW);
  const waiterVisible = C.show.waiter && a.querySelector('.call-waiter-button');
  a.hidden = !(songVisible || waiterVisible || (o && !o.hidden));
  const bar = byId('customerOrdersBar'); if (bar) bar.classList.toggle('m17-has-btn', !!o && !o.hidden);
}
function renderFilters(all) {
  const box = byId('m17Filters'); box.hidden = !C.show.filters;
  if (!C.show.filters) return;
  const has = k => S.f.has(k), any = (fn) => all.some(fn);
  const chips = [
    ['sort', `${ic('filter')}${esc(t('filters'))}${S.sort !== 'default' ? '<i class="m-dot"></i>' : ''}${ic('down', 'm-dd')}`, S.sort !== 'default', true],
    any(i => i.veg === true) && any(i => i.veg !== true) ? ['veg', `<span class="m-veg is-veg"><i></i></span>${esc(t('veg'))}`, has('veg')] : null,
    any(i => i.veg === true) && any(i => i.veg !== true) ? ['nonveg', `<span class="m-veg is-non"><i></i></span>${esc(t('nonveg'))}`, has('nonveg')] : null,
    any(i => i.best_seller === true) ? ['best', esc(t('bestseller')), has('best')] : null,
    any(i => i.recommended === true) ? ['rec', esc(t('recommended')), has('rec')] : null,
    S.saved.size && C.show.bookmark ? ['saved', `${ic('markOn')}${esc(t('saved'))}`, has('saved')] : null
  ].filter(Boolean);
  const html = chips.map(([k, label, on, sheet]) => `<button type="button" class="m-fchip${on ? ' on' : ''}" data-a="${sheet ? 'sort' : 'filter'}" data-f="${k}" aria-pressed="${!!on}">${label}${on && !sheet ? `<span class="m-fx">${ic('x')}</span>` : ''}</button>`).join('');
  if (box._h !== html) { box.innerHTML = html; box._h = html; }
}
function renderNav(gs) {
  const L = C.L, chips = byId('m17Chips'), rail = byId('m17Rail'), tiles = byId('m17Tiles'), pill = byId('m17Pill');
  const searching = !!S.q;
  const navChips = !searching && (L.nav === 'chips' || L.nav === 'tabs') && gs.length > 1;
  chips.hidden = !navChips; rail.hidden = searching || L.nav !== 'rail'; tiles.hidden = searching || L.nav !== 'tiles' || gs.length < 2;
  root.dataset.rail = String(!rail.hidden);
  const cur = L.group === 'tabs' ? S.tab : S.active;
  if (navChips) {
    const html = gs.map(g => `<button type="button" class="m-chip${g.cat === cur ? ' on' : ''}" data-a="jump" data-cat="${esc(g.cat)}" aria-current="${g.cat === cur}">${esc(g.label)}</button>`).join('');
    if (chips._h !== html) { chips.innerHTML = html; chips._h = html; }
  }
  if (!rail.hidden) {
    const html = gs.map(g => `<button type="button" class="m-rl${g.cat === cur ? ' on' : ''}" data-a="jump" data-cat="${esc(g.cat)}" aria-current="${g.cat === cur}"><span class="m-rl-ph">${C.show.catPhotos && g.photo ? `<img src="${esc(g.photo)}" alt="" loading="lazy">` : `<b>${esc(g.label.slice(0, 1))}</b>`}</span><span class="m-rl-t">${esc(g.label)}</span></button>`).join('');
    if (rail._h !== html) { rail.innerHTML = html; rail._h = html; }
  }
  if (!tiles.hidden) {
    const html = `<div class="m-tiles-in">${gs.map(g => `<button type="button" class="m-tile${g.cat === cur ? ' on' : ''}" data-a="jump" data-cat="${esc(g.cat)}">${C.show.catPhotos && g.photo ? `<img src="${esc(g.photo)}" alt="" loading="lazy">` : `<span class="m-tile-ph">${esc(g.label.slice(0, 1))}</span>`}<span class="m-tile-t">${esc(g.label)}</span></button>`).join('')}</div>`;
    if (tiles._h !== html) { tiles.innerHTML = html; tiles._h = html; }
  }
  const pillOn = C.show.menuPill && !searching && gs.length > 1 && (L.nav === 'pill' || L.nav === 'tiles') && L.group !== 'tabs';
  pill.hidden = !pillOn;
  if (pillOn) pill.innerHTML = `${ic('list')}<span>${esc(t('menuPill'))}</span>`;
}
function renderSpot(all) {
  const box = byId('m17Spot'), on = C.L.spot && !S.q && !S.f.size;
  const picks = on ? all.filter(i => i.best_seller === true || i.recommended === true).slice(0, 10) : [];
  box.hidden = !picks.length;
  if (!picks.length) { box.innerHTML = ''; return; }
  const html = `<h2>${esc(t('spotTitle'))}</h2><div class="m-spot-row">${picks.map(i => dish(i, 'card')).join('')}</div>`;
  if (box._h !== html) { box.innerHTML = html; box._h = html; }
}
function renderMini() {
  const m = byId('m17Mini'), lg = logo();
  const html = `${lg ? `<img class="m-logo" src="${esc(lg)}" alt="">` : ''}<b>${esc(restaurantName())}</b>${C.show.search ? `<button type="button" class="m-icbtn" data-a="search" aria-label="${esc(t('search'))}">${ic('search')}</button>` : ''}`;
  if (m._h !== html) { m.innerHTML = html; m._h = html; }
  byId('m17SearchLabel').textContent = t('search');
  byId('m17Q').placeholder = t('search');
  root.querySelector('.m-searchpill').hidden = !C.show.search;
}

/* ---------- main render ---------- */
let queued = false, sticky = 0;
function schedule() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); }
function on() { document.body.classList.add('m17-on'); }
function off() { document.body.classList.remove('m17-on'); }
function render() {
  C = conf();
  if (!PREVIEW && !C.enabled) { off(); legacy(); return; }
  shell(); adopt(); root.hidden = false; on(); applyTheme(); remember();
  const L = C.L;
  Object.assign(root.dataset, { nav: L.nav, group: L.group, item: L.item, cols: String(L.cols), center: String(!!L.center), density: C.density, dark: String(!!C.theme.dark), searching: String(!!S.q) });
  document.body.dataset.m17Dark = String(!!C.theme.dark);
  const all = allItems(), list = filtered(all), gs = groups(list), flat = !!S.q;
  if (L.group === 'tabs' && gs.length && !gs.some(g => g.cat === S.tab)) S.tab = gs[0].cat;
  renderHero(); renderInfo(); renderActions(); renderMini(); renderFilters(all); renderNav(groups(S.q ? [] : list)); renderSpot(all); renderList(gs, flat);
  measure(); spy(); paintCart();
}
function legacy() {
  // The owner turned the new menu off: hand the page back to the original renderer.
  if (!orig.renderMenuItems) return;
  if (root) { root.hidden = true; release(); }
  orig.renderCategories(); orig.renderMenuItems();
}

/* ---------- sticky offset + scroll spy ---------- */
function measure() {
  const st = byId('m17Sticky'), mini = byId('m17Mini'); const h = (st ? st.offsetHeight : 0) + (mini && root && !root.classList.contains('m-search-on') ? mini.offsetHeight : 0);
  if (h !== sticky) { sticky = h; document.documentElement.style.setProperty('--m-sticky-h', h + 'px'); }
}
let spyObs = null;
// Measure against this page's own viewport, even inside the Menu design preview frame (the default root would be the outer page).
const ioRoot = (() => { try { new IntersectionObserver(() => {}, { root: document }); return document; } catch { return null; } })();
function spy() {
  if (spyObs) spyObs.disconnect();
  if (!('IntersectionObserver' in window) || C.L.group === 'tabs' || S.q) return;
  spyObs = new IntersectionObserver(entries => {
    const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!vis) return; const cat = vis.target.dataset.cat; if (!cat || cat === S.active) return; S.active = cat; highlight();
  }, { root: ioRoot, rootMargin: `-${sticky + 8}px 0px -65% 0px`, threshold: 0 });
  for (const s of byId('m17List').querySelectorAll('.m-cat[data-cat]')) spyObs.observe(s);
}
function highlight() {
  const cur = C.L.group === 'tabs' ? S.tab : S.active;
  for (const b of root.querySelectorAll('.m-chip,.m-rl,.m-tile')) {
    const on = b.dataset.cat === cur; b.classList.toggle('on', on); b.setAttribute('aria-current', String(on));
    if (on && b.closest('.m-chips')) { const bar = b.parentElement, br = b.getBoundingClientRect(), rr = bar.getBoundingClientRect(); if (br.left < rr.left + 8 || br.right > rr.right - 8) bar.scrollTo({ left: bar.scrollLeft + br.left - rr.left - 16, behavior: reduced() ? 'auto' : 'smooth' }); }
  }
}
function watchScroll() {
  const head = byId('m17Head'); if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => { root.classList.toggle('m-scrolled', !e.isIntersecting); requestAnimationFrame(measure); }, { root: ioRoot, threshold: 0, rootMargin: '-56px 0px 0px 0px' }).observe(head);
}
function jump(cat) {
  if (C.L.group === 'tabs') { S.tab = cat; schedule(); requestAnimationFrame(() => byId('m17List').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' })); return; }
  if (C.L.group === 'accordion') { if (C.L.folded) S.open.add(cat); else S.closed.delete(cat); render(); }
  const el = byId(slug(cat)); if (!el) return;
  S.active = cat; highlight();
  const y = el.getBoundingClientRect().top + scrollY - sticky - 6;
  scrollTo({ top: y, behavior: reduced() ? 'auto' : 'smooth' });
}

/* ---------- search ---------- */
function openSearch() { root.classList.add('m-search-on'); byId('m17SearchBar').hidden = false; measure(); const q = byId('m17Q'); q.focus(); const st = byId('m17Sticky'); if (st.getBoundingClientRect().top > sticky) scrollTo({ top: st.getBoundingClientRect().top + scrollY - 2, behavior: 'auto' }); }
function closeSearch() { root.classList.remove('m-search-on'); byId('m17SearchBar').hidden = true; const q = byId('m17Q'); q.value = ''; S.q = ''; byId('m17QClear').hidden = true; render(); }

/* ---------- sheets ---------- */
function openLayer(html, kind) {
  S.lastFocus = document.activeElement; layer.dataset.kind = kind; byId('m17SheetBody').innerHTML = html; layer.hidden = false;
  document.body.classList.add('m17-locked'); requestAnimationFrame(() => { layer.classList.add('open'); layer.querySelector('.m-sheet').focus({ preventScroll: true }); });
}
function closeLayer() {
  if (layer.hidden) return; layer.classList.remove('open'); S.sheet = null; document.body.classList.remove('m17-locked');
  setTimeout(() => { if (!layer.classList.contains('open')) { layer.hidden = true; byId('m17SheetBody').innerHTML = ''; } }, reduced() ? 0 : 220);
  if (S.lastFocus && S.lastFocus.isConnected) S.lastFocus.focus({ preventScroll: true });
}
function dishSheet(id, size) {
  const i = findItem(id); if (!i) return;
  const opts = sizesOf(i), sized = isSized(i);
  const prior = S.sheet && String(S.sheet.id) === String(id) ? S.sheet : null;
  const pick = sized ? (opts.includes(size) ? size : (prior && opts.includes(prior.size) ? prior.size : opts[0])) : null;
  S.sheet = { id: String(i.id), size: pick, qty: prior ? prior.qty : 1, note: prior ? prior.note : (S.notes[keyOf(i.id, pick)] || '') };
  openLayer(sheetHtml(i), 'dish');
}
function sheetHtml(i) {
  const sh = S.sheet, opts = sizesOf(i), photo = C.show.photos ? safeImg(i.image) : '', sold = soldOut(i);
  const unit = sh.size ? priceOf(i, sh.size) : Number(i.price), total = unit * sh.qty;
  const radio = opts.length ? `<section class="m-card"><header><div><h3>${esc(t('quantity'))}</h3><p>${esc(t('required'))} • ${esc(t('selectOne'))}</p></div></header>
    <div class="m-radios" role="radiogroup" aria-label="${esc(t('quantity'))}">${opts.map(s => `<label class="m-radio"><span>${vegMark(i)}${esc(sizeName(i, s))}</span><span class="m-rp">${money(priceOf(i, s))}</span><input type="radio" name="m17size" value="${esc(s)}" data-a="size" ${s === sh.size ? 'checked' : ''}><i></i></label>`).join('')}</div></section>` : '';
  const cook = C.show.cooking ? `<section class="m-card"><header><div><h3>${esc(t('cookingTitle'))}</h3><p>${esc(t('cookingHint'))}</p></div></header>
    <div class="m-ta"><textarea id="m17Note" maxlength="100" rows="3" placeholder="${esc(t('cookingPlaceholder'))}">${esc(sh.note)}</textarea><small><span id="m17NoteN">${sh.note.length}</span>/100</small></div></section>` : '';
  return `${photo ? `<div class="m-sh-photo"><img src="${esc(photo)}" alt="${esc(i.name)}"></div>` : ''}
    <section class="m-card m-sh-main"><header class="m-sh-head"><div class="m-sh-name">${vegMark(i)}<h2 id="m17SheetTitle">${esc(i.name)}</h2></div><div class="m-icons">${icons(i)}</div></header>
    ${tags(i) ? `<div class="m-tags m-sh-tags">${tags(i)}</div>` : ''}${!opts.length ? `<p class="m-sh-price">${money(i.price)}</p>` : ''}${C.show.desc && i.description ? `<p class="m-sh-desc">${esc(i.description)}</p>` : ''}</section>
    ${radio}${cook}
    <footer class="m-sh-foot">${sold ? `<p class="m-sold">${esc(t('soldOut'))}</p>` : `<div class="m-step m-step-lg"><button type="button" data-a="sq-" aria-label="Fewer">−</button><b id="m17Sq">${sh.qty}</b><button type="button" data-a="sq+" aria-label="More">+</button></div>
      <button type="button" class="m-addbig" data-a="sheet-add" data-autofocus>${esc(t('addItem'))} <b id="m17St">${money(total)}</b></button>`}</footer>`;
}
function refreshSheet() {
  const i = findItem(S.sheet && S.sheet.id); if (!i) return;
  const unit = S.sheet.size ? priceOf(i, S.sheet.size) : Number(i.price);
  const q = byId('m17Sq'), st = byId('m17St'); if (q) q.textContent = S.sheet.qty; if (st) st.textContent = money(unit * S.sheet.qty);
}
function sheetAdd() {
  const sh = S.sheet, i = findItem(sh && sh.id); if (!i) return;
  const key = keyOf(i.id, sh.size), before = (cart[key] && cart[key].qty) || 0;
  for (let n = 0; n < sh.qty; n++) updateQty(i.id, 1, sh.size);
  const note = (byId('m17Note') ? byId('m17Note').value : sh.note).trim().slice(0, 100);
  if (((cart[key] && cart[key].qty) || 0) > before) { if (note) S.notes[key] = note; else delete S.notes[key]; saveNotes(); closeLayer(); bump(); }
}
function bump() { const b = byId('floatingCartBar'); if (!b) return; b.classList.remove('m17-bump'); void b.offsetWidth; b.classList.add('m17-bump'); }
function catsSheet() {
  const gs = groups(filtered(allItems()));
  openLayer(`<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('menuTitle'))}</h2><div class="m-catlist">${gs.map(g => `<button type="button" data-a="jump" data-cat="${esc(g.cat)}" class="${g.cat === S.active ? 'on' : ''}"><span>${esc(g.label)}</span><b>${g.items.length}</b></button>`).join('')}</div>`, 'cats');
}
function sortSheet() {
  const rows = [['default', t('sortDefault')], ['low', t('sortLow')], ['high', t('sortHigh')]];
  openLayer(`<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('sortTitle'))}</h2><div class="m-radios" role="radiogroup">${rows.map(([k, l]) => `<label class="m-radio"><span>${esc(l)}</span><input type="radio" name="m17sort" value="${k}" data-a="sortpick" ${S.sort === k ? 'checked' : ''}><i></i></label>`).join('')}</div>
    <footer class="m-sh-foot"><button type="button" class="m-btn" data-a="clear">${esc(t('clear'))}</button><button type="button" class="m-addbig" data-a="close" data-autofocus>${esc(t('apply'))}</button></footer>`, 'sort');
}
function aboutSheet() {
  openLayer(`<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('aboutTitle'))}</h2><div class="m-about">${esc(t('about') || restaurantName()).replace(/\n/g, '<br>')}</div>`, 'about');
}
function offerCards(where) {
  const o = C.offers, list = offerList();
  if (!list.length) return '';
  const sel = selected();
  const card = k => {
    const isI = k === 'insta', cfg = o[k], applied = sel.includes(k), handle = '@' + o.insta.handle;
    const href = isI ? 'https://www.instagram.com/' + encodeURIComponent(o.insta.handle) + '/' : o.review.url;
    const title = isI ? t('instaTitle') : t('reviewTitle'), sub = isI ? t('instaSub', { handle, amount: money(cfg.amount) }) : t('reviewSub', { amount: money(cfg.amount) });
    const short = !PREVIEW && where === 'cart' && rawTotal() < cfg.amount;
    const acts = short ? `<p class="m-offer-note">${esc(t('offerMin', { amount: money(cfg.amount) }))}</p>` : applied
      ? `<p class="m-applied">${ic('check')}<b>${esc(t('applied'))} · −${money(cfg.amount)}</b><button type="button" class="m-link" data-a="offer-remove" data-offer="${k}">${esc(t('remove'))}</button></p><p class="m-offer-note">${esc(t('offerCheck'))}</p>`
      : `<div class="m-offer-acts"><a class="m-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-a="offer-go" data-offer="${k}">${ic(isI ? 'insta' : 'google')}${esc(isI ? t('instaBtn') : t('reviewBtn'))}</a>
         <label class="m-check${S.go[k] ? '' : ' is-off'}"><input type="checkbox" data-a="offer-ok" data-offer="${k}" ${S.ok[k] ? 'checked' : ''} ${S.go[k] ? '' : 'disabled'}><span>${esc(isI ? t('instaConfirm', { handle }) : t('reviewConfirm'))}</span></label>
         <button type="button" class="m-btn m-btn-accent" data-a="offer-apply" data-offer="${k}" ${S.ok[k] ? '' : 'disabled'}>${esc(t('applyOffer'))} −${money(cfg.amount)}</button></div>`;
    return `<article class="m-offer${applied ? ' is-on' : ''}" data-offer="${k}"><span class="m-offer-ic m-${k}">${ic(isI ? 'insta' : 'google')}</span><div class="m-offer-b"><h3>${esc(title)}</h3><p>${esc(sub)}</p>${acts}</div></article>`;
  };
  return `<div class="m-offers m-offers-${where}">${list.map(card).join('')}${list.length > 1 ? `<p class="m-offer-rule">${esc(o.mode === 'both' ? t('offerBoth') : t('offerOne'))}</p>` : ''}</div>`;
}
function offersSheet() { openLayer(`<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('offersTitle'))}</h2>${offerCards('sheet') || `<p class="m-about">${esc(t('offerUsed'))}</p>`}`, 'offers'); }
function selected() {
  const avail = offerList(); let sel = [...S.offers].filter(k => avail.includes(k));
  if (C.offers.mode === 'one' && sel.length > 1) sel = [sel[sel.length - 1]];
  return sel;
}
function discountFor(total) { const sum = selected().reduce((n, k) => n + C.offers[k].amount, 0); return sum > 0 && sum <= total ? r2(sum) : 0; }
const rawTotal = () => { try { return orig.cartTotal ? orig.cartTotal() : 0; } catch { return 0; } };

/* ---------- clicks ---------- */
function share(i) {
  const text = i.name + ' at ' + restaurantName();
  if (navigator.share) navigator.share({ title: restaurantName(), text }).catch(() => {});
  else { try { navigator.clipboard.writeText(text); flash('Copied'); } catch { /* blocked */ } }
}
function flash(msg) { let f = byId('m17Flash'); if (!f) { f = document.createElement('div'); f.id = 'm17Flash'; f.setAttribute('role', 'status'); document.body.append(f); } f.textContent = msg; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); }
function onClick(e) {
  const el = e.target.closest('[data-a]'); if (!el || !(root.contains(el) || layer.contains(el) || el.closest('#m17CartOffers'))) return;
  const a = el.dataset.a, id = el.dataset.id;
  if (a === 'offer-go') { S.go[el.dataset.offer] = true; setTimeout(repaintOffers, 400); return; }
  if (a === 'offer-ok') { S.ok[el.dataset.offer] = el.checked; repaintOffers(); return; }
  if (el.tagName === 'INPUT' && a !== 'size' && a !== 'sortpick') return;
  switch (a) {
    case 'add': { const i = findItem(id); if (!i) return; if (isSized(i)) dishSheet(id); else { updateQty(i.id, 1, null); bump(); } break; }
    case 'inc': { const i = findItem(id); if (!i) return; if (isSized(i)) { const l = lines(id); dishSheet(id, l.length ? l[l.length - 1].size : null); } else updateQty(i.id, 1, null); break; }
    case 'dec': { const l = lines(id); if (l.length === 1) updateQty(l[0].item.id, -1, l[0].size || null); else if (l.length > 1) { if (typeof openCartDrawer === 'function') openCartDrawer(); } break; }
    case 'open': dishSheet(id); break;
    case 'save': { const k = String(id); if (S.saved.has(k)) S.saved.delete(k); else S.saved.add(k); store.set('m17-saved', [...S.saved]); if (!S.saved.size) S.f.delete('saved'); schedule(); if (S.sheet) { const ic2 = layer.querySelector('[data-a="save"]'); if (ic2) { const on2 = S.saved.has(k); ic2.classList.toggle('on', on2); ic2.setAttribute('aria-pressed', String(on2)); ic2.innerHTML = ic(on2 ? 'markOn' : 'mark'); } } break; }
    case 'share': { const i = findItem(id); if (i) share(i); break; }
    case 'size': S.sheet.size = el.value; S.sheet.note = byId('m17Note') ? byId('m17Note').value : S.sheet.note; refreshSheet(); break;
    case 'sq-': S.sheet.qty = Math.max(1, S.sheet.qty - 1); refreshSheet(); break;
    case 'sq+': { const i = findItem(S.sheet.id), l = left(i, S.sheet.size), inCart = (cart[keyOf(S.sheet.id, S.sheet.size)] || {}).qty || 0; if (S.sheet.qty + inCart < Math.min(50, l)) { S.sheet.qty++; refreshSheet(); } else flash(t('onlyLeft', { n: Math.max(0, Math.min(50, l) - inCart) })); break; }
    case 'sheet-add': sheetAdd(); break;
    case 'close': closeLayer(); break;
    case 'fold': { const c = el.dataset.cat; if (C.L.folded) { if (S.open.has(c)) S.open.delete(c); else S.open.add(c); } else if (S.closed.has(c)) S.closed.delete(c); else S.closed.add(c); render(); break; }
    case 'jump': closeLayer(); jump(el.dataset.cat); break;
    case 'cats': catsSheet(); break;
    case 'search': openSearch(); break;
    case 'search-close': closeSearch(); break;
    case 'search-clear': { const q = byId('m17Q'); q.value = ''; S.q = ''; byId('m17QClear').hidden = true; q.focus(); render(); break; }
    case 'filter': { const f = el.dataset.f; if (S.f.has(f)) S.f.delete(f); else { S.f.add(f); if (f === 'veg') S.f.delete('nonveg'); if (f === 'nonveg') S.f.delete('veg'); } render(); break; }
    case 'sort': sortSheet(); break;
    case 'sortpick': S.sort = el.value; render(); break;
    case 'clear': S.f.clear(); S.sort = 'default'; if (S.q) closeSearch(); closeLayer(); render(); break;
    case 'about': aboutSheet(); break;
    case 'offers': offersSheet(); break;
    case 'offer-apply': { const k = el.dataset.offer; if (!S.ok[k]) return; if (C.offers.mode === 'one') S.offers.clear(); S.offers.add(k); repaintOffers(); flash(t('applied')); break; }
    case 'offer-remove': S.offers.delete(el.dataset.offer); repaintOffers(); break;
    case 'orders': if (typeof openTrackingModal === 'function') openTrackingModal(); break;
    default: break;
  }
}
document.addEventListener('input', e => { if (e.target.id === 'm17Note') { const n = byId('m17NoteN'); if (n) n.textContent = e.target.value.length; if (S.sheet) S.sheet.note = e.target.value; } });
document.addEventListener('change', e => { const el = e.target.closest && e.target.closest('#m17CartOffers [data-a="offer-ok"]'); if (el) { S.ok[el.dataset.offer] = el.checked; repaintOffers(); } });
function repaintOffers() {
  if (layer && !layer.hidden && layer.dataset.kind === 'offers') { const b = byId('m17SheetBody'); const html = `<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('offersTitle'))}</h2>${offerCards('sheet') || `<p class="m-about">${esc(t('offerUsed'))}</p>`}`; b.innerHTML = html; }
  if (typeof updateCartUI === 'function') updateCartUI();
}

/* ---------- cart, totals, offers and order hooks (live menu only) ---------- */
const orig = {};
function paintCart() {
  const bar = byId('floatingCartBar'); if (!bar || !document.body.classList.contains('m17-on')) return;
  const n = Object.values(typeof cart === 'object' ? cart : {}).reduce((s, l) => s + l.qty, 0);
  const c = byId('cartItemsCount'); if (c && n) c.textContent = t(n === 1 ? 'itemAdded' : 'itemsAdded', { n });
  const v = bar.querySelector('.view-cart-btn-text span:first-child'); if (v) v.textContent = t('viewCart');
  const p = byId('m17Pill'); if (p) p.classList.toggle('lifted', n > 0);
  if (PREVIEW) return;
  const raw = orig.cartTotal ? orig.cartTotal() : 0, d = discountFor(raw), total = r2(raw - d);
  const tp = byId('cartTotalPrice'); if (tp && n) tp.textContent = money(total);
  const pa = byId('placeOrderAmount'); if (pa) pa.textContent = cur() + total;
  const bt = byId('billTotal'); if (bt) bt.textContent = cur() + total;
  const summary = document.querySelector('#cartDrawer .bill-summary');
  if (summary) {
    let row = byId('m17OfferRow');
    if (!row) { row = document.createElement('div'); row.className = 'bill-row m17-offer-row'; row.id = 'm17OfferRow'; row.innerHTML = '<span></span><span></span>'; const tot = summary.querySelector('.bill-row.total'); summary.insertBefore(row, tot || null); }
    row.hidden = !(d > 0); row.children[0].textContent = t('offerDiscount'); row.children[1].textContent = '−' + money(d);
    let box = byId('m17CartOffers');
    if (!box) { box = document.createElement('section'); box.id = 'm17CartOffers'; box.className = 'm17-cart-offers'; box.addEventListener('click', onClick); summary.before(box); }
    const html = C.show.offers && n ? offerCards('cart') : '';
    if (box._h !== html) { box.innerHTML = html; box._h = html; }
    box.hidden = !html;
  }
  for (const row of document.querySelectorAll('#cartItemsList .cart-item-row')) {
    const b = row.querySelector('[data-qty]'); if (!b) continue;
    const note = S.notes[keyOf(b.dataset.item, b.dataset.size || null)];
    let p2 = row.querySelector('.m17-line-note');
    if (note) { if (!p2) { p2 = document.createElement('p'); p2.className = 'm17-line-note'; row.querySelector('.cart-item-info').append(p2); } p2.textContent = '“' + note + '”'; } else if (p2) p2.remove();
  }
}
function noteLines() {
  const out = [];
  for (const [key, l] of Object.entries(cart)) { const n = S.notes[key]; if (n) out.push((typeof lineName === 'function' ? lineName(l) : l.item.name) + ': ' + n); }
  return out;
}
function hook() {
  if (PREVIEW || hook.done) return; hook.done = true;
  for (const f of ['renderMenuItems', 'renderCategories', 'selectCategory', 'handleSearch', 'updateCartUI', 'cartTotal', 'placeOrder', 'openCartDrawer']) orig[f] = window[f];
  window.renderMenuItems = function () { if (!C.enabled) return orig.renderMenuItems.apply(this, arguments); schedule(); };
  window.renderCategories = function () { if (!C.enabled) return orig.renderCategories.apply(this, arguments); schedule(); };
  window.handleSearch = function () { if (!C.enabled) return orig.handleSearch.apply(this, arguments); schedule(); };
  window.selectCategory = function (cat) { if (!C.enabled) return orig.selectCategory.apply(this, arguments); if (cat === 'Best Sellers') { S.f.add('best'); render(); } else if (cat === 'Recommended') { S.f.add('rec'); render(); } else if (cat && cat !== 'All') jump(cat); };
  window.updateCartUI = function () { const r = orig.updateCartUI.apply(this, arguments); try { if (C.enabled) { paintCart(); const n = Object.keys(cart).length; if (!n) for (const k of Object.keys(S.notes)) if (!cart[k]) delete S.notes[k]; } } catch (err) { console.warn('[menu] cart paint', err); } return r; };
  window.cartTotal = function () { const raw = orig.cartTotal.apply(this, arguments); return C.enabled ? r2(raw - discountFor(raw)) : raw; };
  let next = null, lastError = null;
  window.placeOrder = async function () {
    const field = byId('custNotesInput'); let userNote = null;
    if (!pendingAttempt && Object.keys(cart).length) {
      const raw = orig.cartTotal(), d = C.enabled ? discountFor(raw) : 0; next = { offers: d > 0 ? selected() : [], discount: d };
      const extra = noteLines(); if (extra.length && field) { userNote = field.value; field.value = [userNote.trim(), ...extra].filter(Boolean).join('\n').slice(0, 1000); }
    } else next = null;
    lastError = null;
    try { await orig.placeOrder.apply(this, arguments); } finally {
      const ok = !pendingAttempt && !Object.keys(cart).length && !lastError;
      if (userNote !== null && !ok && field) field.value = userNote;
      if (ok) { if (next && next.offers.length) markUsed(next.offers); S.offers.clear(); S.notes = {}; saveNotes(); }
      if (lastError && /offer/i.test(lastError)) {
        if (/already used/i.test(lastError) && next) markUsed(next.offers);
        S.offers.clear(); pendingAttempt = null; try { Cloud.remove(attemptKey()); } catch { /* storage */ }
        const pr = byId('pendingRetry'); if (pr) pr.hidden = true;
        const btn = byId('btnPlaceOrder'); if (btn) btn.innerHTML = `<span>Place Order</span><span id="placeOrderAmount">${esc(cur())}${cartTotal()}</span>`;
      }
      if (lastError && /Total changed/i.test(lastError) && window.Custom48) Custom48.sync(true).catch(() => {});
      next = null; updateCartUI(); schedule();
    }
  };
  if (typeof Cloud !== 'undefined' && typeof Cloud.rpc === 'function') {
    const rpc = Cloud.rpc;
    Cloud.rpc = async function (name, args, ...rest) {
      if (name !== 'restaurant_place_order_v13') return rpc.call(this, name, args, ...rest);
      const a = typeof pendingAttempt !== 'undefined' ? pendingAttempt : null;
      if (a && a.request_id === args.p_request_id && a.m17 === undefined) { a.m17 = next || { offers: [], discount: 0 }; try { Cloud.write(attemptKey(), a); } catch { /* storage */ } }
      const off = a && a.m17;
      try {
        if (!off || !off.offers || !off.offers.length) return await rpc.call(this, name, args, ...rest);
        return await rpc.call(this, 'restaurant_place_order_v17', { ...args, p_offers: off.offers }, ...rest);
      } catch (err) {
        let msg = err && err.message || String(err);
        if (off && off.offers && off.offers.length && /restaurant_place_order_v17|PGRST202|schema cache|Could not find the function/i.test(msg)) msg = 'Offers are not ready yet. The offer was removed — please place the order again.';
        lastError = msg; throw Error(msg);
      }
    };
  }
}

/* ---------- start ---------- */
let lastCustom = null;
function watch() {
  setInterval(() => { const c = custom(); if (c !== lastCustom) { lastCustom = c; schedule(); } const o = byId('m17OrdersBtn'), bar = byId('customerOrdersBar'); if (o && bar && o.hidden !== (!C.show.orders || bar.hidden)) renderActions(); }, 700);
  addEventListener('resize', () => requestAnimationFrame(measure), { passive: true });
}
if (PREVIEW) {
  addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'm17-preview') return;
    P = e.data.payload || {}; window.__m17Preview = P; heroSig = '';
    if (root) { for (const id of ['m17Filters', 'm17Chips', 'm17Rail', 'm17Tiles', 'm17Spot', 'm17Mini']) { const n = byId(id); if (n) n._h = null; } }
    render();
  });
  window.M17 = { render: () => render(), get conf() { return C; } };
  document.addEventListener('DOMContentLoaded', () => { shell(); render(); try { parent.postMessage({ type: 'm17-preview-ready' }, location.origin); } catch { /* not framed */ } });
} else {
  if (!cached || !cached.m17 || cached.m17.enabled !== false) document.body.classList.add('m17-on');
  hook();
  document.addEventListener('DOMContentLoaded', () => { lastCustom = custom(); render(); watch(); });
  window.M17 = { render: () => render(), get conf() { return C; }, state: () => ({ offers: selected(), raw: rawTotal(), discount: discountFor(rawTotal()), notes: S.notes }) };
}
})();
