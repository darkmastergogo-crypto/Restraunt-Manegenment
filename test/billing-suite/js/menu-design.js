/* Menu design — the customer QR menu: 20 layouts, 40 menu themes, every word, parts on/off, banner photos,
   the Request song button and the Instagram / Google review offers. A live phone preview shows the draft;
   Save publishes it for every customer (stored with the shared customization, key m17). */
'use strict';
const MenuDesign = (() => {
  const D = window.M17Data;
  const TABS = [['layout', 'Layout', 'grid'], ['theme', 'Theme', 'palette'], ['top', 'Top of menu', 'image'], ['cats', 'Categories', 'layers'], ['parts', 'Show / hide', 'sliders'], ['words', 'Words', 'edit'], ['offers', 'Offers', 'tag'], ['more', 'More', 'gear']];
  const clone = v => JSON.parse(JSON.stringify(v ?? {}));
  let catPhotos = {}, catBase = {};
  let root = null, draft = {}, base = {}, items = [], cats = [], tab = 'layout', song = null, songBase = null, themeFilter = 'all', pushTimer = 0, offersDb = null, review = '', loading = 0;

  /* ---------- small builders ---------- */
  const sw = (name, on, title, desc = '', extra = '') => `<label class="switch"><input type="checkbox" data-k="${name}" ${on ? 'checked' : ''} ${extra}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${esc(title)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}</span></label>`;
  const arch = () => D.ARCHS.find(a => a.id === draft.arch) || D.ARCHS[0];
  const theme = () => D.THEMES.find(t => t.id === draft.theme) || D.THEMES[0];
  const layoutNow = () => { const L = { ...arch() }, o = draft.layout || {}; for (const k of ['hero', 'info', 'nav', 'group', 'item']) if (o[k]) L[k] = o[k]; if (o.cols) L.cols = Number(o.cols); for (const k of ['spot', 'center', 'folded']) if (typeof o[k] === 'boolean') L[k] = o[k]; return L; };
  const partName = (k, v) => (D.PARTS[k].find(([x]) => x === String(v)) || [, v])[1];

  /* A tiny drawing of each layout so owners can see the difference before choosing. */
  function schematic(L) {
    const f = { bg: 'var(--surface)', soft: 'var(--surface-2)', line: 'var(--line)', ink: 'var(--ink-2)', acc: 'var(--primary)' };
    const r = (x, y, w, h, c, rx = 2, op = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${c}" opacity="${op}"/>`;
    let y = 0, s = '';
    if (L.hero === 'carousel') { s += r(0, 0, 120, 34, f.acc, 0, .55); y = 34; }
    else if (L.hero === 'banner') { s += r(0, 0, 120, 10, f.soft, 0) + r(6, 12, 108, 24, f.acc, 4, .55); y = 38; }
    else if (L.hero === 'split') { s += r(6, 4, 108, 30, f.soft, 4) + r(12, 12, 40, 5, f.ink, 1) + r(12, 20, 28, 3, f.ink, 1, .5) + r(76, 8, 32, 22, f.acc, 3, .55); y = 36; }
    else if (L.hero === 'cover') { s += r(0, 0, 120, 46, f.acc, 0, .7) + `<circle cx="60" cy="22" r="6" fill="${f.bg}"/>` + r(40, 31, 40, 4, f.bg, 1); y = 46; }
    else if (L.hero === 'compact') { s += r(0, 0, 120, 10, f.soft, 0); y = 10; } else { s += r(0, 0, 120, 8, f.soft, 0); y = 8; }
    if (L.info === 'sheet') { s += r(0, y - 5, 120, 16, f.bg, 5) + r(6, y - 1, 46, 4, f.ink, 1) + r(6, y + 5, 30, 3, f.ink, 1, .5) + r(100, y - 1, 14, 9, '#1ba672', 2); y += 12; }
    else if (L.info === 'inline') { s += r(4, y + 2, 112, 15, f.bg, 3) + `<rect x="4" y="${y + 2}" width="112" height="15" rx="3" fill="none" stroke="${f.line}"/>` + r(9, y + 6, 40, 3.5, f.ink, 1) + r(9, y + 12, 26, 2.5, f.ink, 1, .5); y += 19; }
    let x0 = 4, w = 112;
    if (L.nav === 'chips' || L.nav === 'tabs') { for (let i = 0; i < 4; i++) s += r(4 + i * 28, y + 2, 25, 6, i ? f.soft : (L.nav === 'tabs' ? f.bg : f.ink), 3) + (L.nav === 'tabs' && !i ? r(4, y + 8, 25, 1.5, f.acc, 0) : ''); y += 11; }
    if (L.nav === 'tiles') { for (let i = 0; i < 4; i++) s += r(4 + i * 28, y + 2, 22, 16, i ? f.soft : f.acc, 3, i ? 1 : .5); y += 20; }
    if (L.nav === 'rail') { s += r(0, y, 22, 150 - y, f.soft, 0); for (let i = 0; i < 5; i++) s += `<circle cx="11" cy="${y + 9 + i * 17}" r="5.5" fill="${i ? f.line : f.acc}" opacity="${i ? 1 : .6}"/>`; x0 = 26; w = 90; }
    if (L.spot) { s += r(x0, y + 2, 30, 4, f.ink, 1); for (let i = 0; i < 3; i++) s += r(x0 + i * 34, y + 8, 30, 20, f.acc, 3, .35); y += 30; }
    const cols = Math.max(1, Math.min(3, L.cols || 1));
    const head = () => { s += r(x0, y + 3, 36, 4.5, f.ink, 1) + (L.group === 'accordion' ? `<circle cx="${x0 + w - 4}" cy="${y + 5}" r="3" fill="${f.soft}"/>` : ''); y += 10; };
    for (let blk = 0; blk < 3 && y < 145; blk++) {
      head();
      if (L.group === 'accordion' && L.folded && blk) { y += 2; continue; }
      const n = L.group === 'tabs' && blk ? 0 : 2;
      for (let i = 0; i < n && y < 145; i++) {
        const it = L.item;
        if (L.group === 'shelves') { for (let k = 0; k < 3; k++) s += r(x0 + k * 40, y, 36, 26, f.acc, 3, .35) + r(x0 + k * 40 + 2, y + 28, 22, 3, f.ink, 1); y += 34; break; }
        if (it === 'row' || it === 'rowLeft') { const px = it === 'row' ? x0 + w - 24 : x0; const tx = it === 'row' ? x0 : x0 + 28; s += r(px, y, 24, 22, f.acc, 3, .45) + r(px + 3, y + 18, 18, 6, f.bg, 2) + `<rect x="${px + 3}" y="${y + 18}" width="18" height="6" rx="2" fill="none" stroke="${f.acc}" stroke-width=".7"/>` + r(tx, y + 3, 44, 4, f.ink, 1) + r(tx, y + 10, 20, 3, f.ink, 1, .6) + r(tx, y + 16, 54, 2.5, f.ink, 1, .35); y += 29; }
        else if (it === 'thumb') { s += `<circle cx="${x0 + 8}" cy="${y + 8}" r="8" fill="${f.acc}" opacity=".45"/>` + r(x0 + 20, y + 3, 44, 4, f.ink, 1) + r(x0 + 20, y + 10, 22, 3, f.ink, 1, .6) + r(x0 + w - 18, y + 4, 18, 7, f.bg, 2) + `<rect x="${x0 + w - 18}" y="${y + 4}" width="18" height="7" rx="2" fill="none" stroke="${f.acc}" stroke-width=".7"/>`; y += 20; }
        else if (it === 'text' || it === 'fine') { if (it === 'fine') { s += r(x0 + w / 2 - 22, y + 2, 44, 4.5, f.ink, 1) + r(x0 + w / 2 - 10, y + 9, 20, 3, f.ink, 1, .6) + r(x0 + w / 2 - 30, y + 15, 60, 2.5, f.ink, 1, .35); y += 22; } else { s += r(x0, y + 2, 36, 4, f.ink, 1) + `<line x1="${x0 + 40}" x2="${x0 + w - 16}" y1="${y + 5}" y2="${y + 5}" stroke="${f.ink}" stroke-dasharray="1 2" opacity=".6"/>` + r(x0 + w - 14, y + 2, 14, 4, f.ink, 1) + r(x0, y + 9, 60, 2.5, f.ink, 1, .35); y += 16; } }
        else if (it === 'wide' || it === 'story') { s += r(x0, y, w, 36, f.acc, 4, it === 'story' ? .8 : .45) + (it === 'story' ? r(x0 + 4, y + 26, 40, 4, f.bg, 1) : r(x0, y + 39, 44, 4, f.ink, 1)); y += it === 'story' ? 40 : 47; }
        else { const c = it === 'tile' ? 3 : (it === 'bento' && !i ? 1 : cols > 1 ? cols : 2), gap = 4, cw = (w - gap * (c - 1)) / c, h = it === 'gallery' ? 30 : it === 'tile' ? 18 : 22; for (let k = 0; k < c; k++) s += r(x0 + k * (cw + gap), y, cw, (it === 'gallery' && k % 2 ? h - 8 : h), f.acc, 3, .4) + r(x0 + k * (cw + gap) + 2, y + h + 2, cw * .6, 3, f.ink, 1); y += h + 9; }
      }
    }
    if (L.nav === 'pill') s += r(86, 132, 28, 11, f.ink, 4) + r(92, 136, 16, 3, f.bg, 1);
    return `<svg class="md-schem" viewBox="0 0 120 150" aria-hidden="true">${r(0, 0, 120, 150, f.bg, 0)}${s}</svg>`;
  }
  function swatch(t) {
    return `<span class="md-swatch" style="background:${t.bg};border-color:${t.line}"><i style="background:${t.card};border-color:${t.line}"><em style="background:${t.ink}"></em><u style="background:${t.sub}"></u><s style="color:${t.accent};border-color:${t.accent};background:${t.dark ? t.card : '#fff'}">ADD</s></i><b style="background:${t.accent}"></b></span>`;
  }

  /* ---------- preview ---------- */
  function payload() {
    const custom = Cloud.custom() || {};
    return { custom: { ...custom, m17: draft, categoryPhotos: catPhotos }, items, categories: cats, table: 'Table 1' };
  }
  function push(now = false) {
    clearTimeout(pushTimer);
    const go = () => { const f = root && $('#mdFrame', root); try { f?.contentWindow?.postMessage({ type: 'm17-preview', payload: payload() }, location.origin); } catch { /* frame not ready */ } };
    if (now) go(); else pushTimer = setTimeout(go, 120);
  }
  function changed() {
    const dirty = JSON.stringify(draft) !== JSON.stringify(base) || song !== songBase || JSON.stringify(catPhotos) !== JSON.stringify(catBase);
    const b = root && $('#mdDirty', root); if (b) b.hidden = !dirty;
    for (const id of ['#mdSave', '#mdUndo']) { const x = root && $(id, root); if (x) x.disabled = !dirty; }
    push();
  }
  const onMsg = e => { if (e.origin === location.origin && e.data?.type === 'm17-preview-ready') push(true); };
  const onLeave = e => { if (root && $('#mdDirty', root) && !$('#mdDirty', root).hidden) { e.preventDefault(); e.returnValue = ''; } };

  /* ---------- tabs ---------- */
  function layoutTab() {
    const L = layoutNow(), o = draft.layout || {}, a = arch();
    const sel = (k, label) => `<label class="field"><span>${label}</span><select data-layout="${k}"><option value="">Layout default — ${esc(partName(k, a[k]))}</option>${D.PARTS[k].map(([v, l]) => `<option value="${v}" ${String(o[k] ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const tri = (k, label, desc) => sw('lay-' + k, !!L[k], label, desc);
    return `<section class="card"><div class="card-title-row"><div><h2>Choose a layout</h2><p class="hint">20 complete menu layouts. Each one changes the banner, the category menu and how every dish is drawn.</p></div></div>
      <div class="theme-grid md-arch-grid" role="list">${D.ARCHS.map(x => `<button type="button" role="listitem" class="theme-card md-arch ${x.id === a.id ? 'on' : ''}" data-arch="${x.id}" aria-pressed="${x.id === a.id}">${schematic({ ...x })}<b>${esc(x.name)}</b><small>${esc(x.note)}</small>${x.id === a.id ? `<span class="tc-on">${Icon('check')}</span>` : ''}</button>`).join('')}</div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Mix your own</h2><p class="hint">Change any part of the layout you picked. “Layout default” keeps what the layout uses.</p></header>
        ${sel('hero', 'Banner')}${sel('info', 'Restaurant info')}${sel('nav', 'Category menu')}${sel('group', 'Categories')}${sel('item', 'Dish style')}${sel('cols', 'Columns (cards and tiles)')}
        <div class="span-2 md-switches">${tri('spot', 'Best sellers slider on top', 'Shows dishes marked best seller or recommended.')}${tri('center', 'Centred headings', 'Elegant, centred category names.')}${tri('folded', 'Start with categories folded', 'For folding categories: customers open the one they want.')}</div>
        <div class="form-actions span-2"><button type="button" class="btn" id="mdLayoutReset" ${Object.keys(o).length ? '' : 'disabled'}>${Icon('refresh')} Use the layout as it is</button></div></section>`;
  }
  function themeTab() {
    const t = theme(), list = D.THEMES.filter(x => themeFilter === 'all' || (themeFilter === 'dark' ? x.dark : !x.dark));
    const fonts = Object.keys(D.FONTS).map(f => `<option ${f === draft.font ? 'selected' : ''}>${esc(f)}</option>`).join('');
    const bfonts = Object.keys(D.FONTS).map(f => `<option ${f === draft.bodyFont ? 'selected' : ''}>${esc(f)}</option>`).join('');
    const radius = draft.radius !== undefined && draft.radius !== '' ? Number(draft.radius) : t.radius;
    return `<section class="card"><div class="card-title-row"><div><h2>Menu theme</h2><p class="hint">40 themes only for the customer menu. The kitchen and billing screens keep their own theme.</p></div>
        <div class="seg" id="mdThemeFilter">${[['all', 'All 40'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-tf="${k}" class="${themeFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="theme-grid md-theme-grid" role="list">${list.map(x => `<button type="button" role="listitem" class="theme-card ${x.id === t.id ? 'on' : ''}" data-theme17="${x.id}" aria-pressed="${x.id === t.id}">${swatch(x)}<b>${esc(x.name)}</b><small>${x.dark ? 'Dark' : 'Light'} · ${esc(x.head)}</small>${x.id === t.id ? `<span class="tc-on">${Icon('check')}</span>` : ''}</button>`).join('')}</div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Fine-tune</h2><p class="hint">Optional changes on top of the theme.</p></header>
        <div class="field span-2"><div class="color-row">${sw('accentOn', !!draft.accent, 'Use my own button colour')}<label class="color-custom"><input type="color" id="mdAccent" value="${esc(draft.accent || t.accent)}" aria-label="Button colour"><span class="mono">${esc(draft.accent || t.accent)}</span></label></div></div>
        <label class="field"><span>Heading font</span><select id="mdFont"><option value="">Theme font — ${esc(t.head)}</option>${fonts}</select></label>
        <label class="field"><span>Text font</span><select id="mdBodyFont"><option value="">Theme font — ${esc(t.body)}</option>${bfonts}</select></label>
        <label class="field"><span>Corner roundness <em id="mdRadiusV">${radius}px</em></span><input type="range" id="mdRadius" min="0" max="28" step="1" value="${radius}"></label>
        <div class="field"><span>Spacing</span><div class="seg" id="mdDensity">${[['cozy', 'Roomy'], ['compact', 'Compact']].map(([k, l]) => `<button type="button" data-dn="${k}" class="${(draft.density || 'cozy') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="form-actions span-2"><button type="button" class="btn" id="mdTuneReset">${Icon('refresh')} Use the theme as it is</button></div></section>`;
  }
  function textField(k, def, wide = false) {
    const v = draft.texts?.[k] ?? '', label = D.TEXT_LABELS[k] || k, long = k === 'about' || def.length > 60;
    const input = long ? `<textarea data-text="${k}" rows="${k === 'about' ? 4 : 2}" maxlength="600" placeholder="${esc(def || 'Not shown when empty')}">${esc(v)}</textarea>` : `<input data-text="${k}" maxlength="${k === 'rating' ? 8 : 160}" value="${esc(v)}" placeholder="${esc(def || 'Not shown when empty')}">`;
    return `<label class="field ${wide || long ? 'span-2' : ''}"><span>${esc(label)}</span>${input}</label>`;
  }
  function topTab() {
    const slides = draft.hero?.slides || [];
    const group = D.TEXTS.find(([g]) => g === 'Top of the menu')[1];
    return `<section class="card"><div class="card-title-row"><div><h2>Banner photos</h2><p class="hint">Up to 8 photos for the slider or banner. Without photos the menu uses category photos, then dish photos.</p></div>
        <div class="toolbar"><label class="btn file-btn">${Icon('plus')} Add photo<input type="file" id="mdSlideFile" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="btn" id="mdSlideLink">Add by link</button></div></div>
      <div class="md-slides">${slides.length ? slides.map((x, n) => `<div class="md-slide" data-n="${n}"><img src="${esc(RestaurantCloud.safeImage(x.src))}" alt=""><label class="field"><span>Caption <em>optional</em></span><input data-cap="${n}" maxlength="120" value="${esc(x.caption || '')}" placeholder="e.g. Fresh momos every morning"></label>
          <div class="toolbar"><button type="button" class="icon-btn" data-slide="up" aria-label="Move up" ${n ? '' : 'disabled'}>${Icon('up')}</button><button type="button" class="icon-btn" data-slide="down" aria-label="Move down" ${n < slides.length - 1 ? '' : 'disabled'}>${Icon('down')}</button><button type="button" class="btn btn-sm btn-danger-ghost" data-slide="del">Remove</button></div></div>`).join('') : '<p class="hint md-empty">No banner photos yet.</p>'}</div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Restaurant info</h2><p class="hint">Shown under the banner. Leave a line empty to hide it.</p></header>
        ${group.map(([k, def]) => textField(k, def, k === 'location' || k === 'time')).join('')}</section>`;
  }
  /* ---------- category banners ---------- */
  function catsTab() {
    const style = draft.catBanner || 'banner', list = cats.length ? cats : [...new Set(items.map(i => i.category).filter(Boolean))];
    const opt = (v, t, d) => `<label class="md-cb-opt ${style === v ? 'on' : ''}"><input type="radio" name="mdCatStyle" value="${v}" ${style === v ? 'checked' : ''}><span class="md-cb-pic md-cb-${v}" aria-hidden="true"><i></i><b></b><b></b></span><span><b>${t}</b><small>${d}</small></span></label>`;
    return `<section class="card"><header class="card-head"><h2>How categories start</h2><p class="hint">Applies to every layout. Categories without a photo show just their name.</p></header>
        <div class="md-cb-opts">${opt('banner', 'Big banner photo', 'A wide picture with the category name on it.')}${opt('thumb', 'Small photo', 'A small square picture beside the name.')}${opt('none', 'Name only', 'No pictures — just the category name.')}</div></section>
      <section class="card"><div class="card-title-row"><div><h2>Category photos</h2><p class="hint">Each category has its own photo. Photos are cropped to a wide banner (about 2 : 1) and shrunk to load fast. They are also used for category tiles, the side rail and — when you have no banner photos — the photo slider.</p></div></div>
        ${list.length ? `<div class="md-cats">${list.map((c, n) => { const src = RestaurantCloud.safeImage(catPhotos[c] || ''); return `<div class="md-cat" data-cat="${esc(c)}" data-n="${n}">
            <div class="md-cat-pic">${src ? `<img src="${esc(src)}" alt="">` : `<span>${Icon('image')}<small>No photo</small></span>`}<b>${esc(c)}</b></div>
            <div class="toolbar"><label class="btn btn-sm file-btn">${Icon('upload')} ${src ? 'Change' : 'Add photo'}<input type="file" data-catfile="${n}" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="btn btn-sm btn-ghost" data-catlink="${n}">Link</button>${src ? `<button type="button" class="btn btn-sm btn-danger-ghost" data-catdel="${n}">Remove</button>` : ''}</div></div>`; }).join('')}</div>`
        : `<div class="md-empty"><p>No categories yet. Add dishes and categories in Items first.</p></div>`}</section>`;
  }
  /* Crops to a 2:1 banner, at most 1400 px wide, WebP — small and quick for customers. */
  async function bannerData(file) {
    if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type)) throw Error('Choose a PNG, JPEG or WebP photo.');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(Error('This photo could not be opened.')); i.src = url; });
      const W = Math.min(1400, Math.max(600, img.naturalWidth)), H = Math.round(W / 2), c = document.createElement('canvas'); c.width = W; c.height = H;
      const r = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * r, h = img.naturalHeight * r;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      for (const q of [0.82, 0.72, 0.6, 0.5]) { const d = c.toDataURL('image/webp', q); if (d.startsWith('data:image/webp') && d.length * 0.75 < 900000) return d; }
      return c.toDataURL('image/jpeg', 0.7);
    } finally { URL.revokeObjectURL(url); }
  }
  function partsTab() {
    const s = { ...D.SHOW_DEFAULTS, ...(draft.show || {}) };
    const desc = { song: 'Also turns song requests on or off for customers.', offers: 'Set the offers in the Offers tab.', cooking: 'Customers can write a note for each dish.', photos: 'Turn off for a text-only menu.' };
    return `<section class="card"><div class="card-title-row"><div><h2>Show or hide parts of the menu</h2><p class="hint">Switch off anything you do not want customers to see.</p></div><div class="toolbar"><button type="button" class="btn btn-sm" id="mdAllOn">Show all</button></div></div>
      <div class="md-switches md-switch-grid">${D.SHOW.map(([k, label]) => sw('show-' + k, k === 'song' ? song !== false && s.song !== false : s[k] !== false, label, desc[k] || '')).join('')}</div>
      ${song === null ? '<p class="hint">Song requests setting could not be loaded. The switch still hides the button.</p>' : ''}</section>`;
  }
  function wordsTab() {
    return D.TEXTS.filter(([g]) => g !== 'Top of the menu' && g !== 'Offers').map(([g, rows]) => `<section class="card form-grid"><header class="span-2 card-head"><h2>${esc(g)}</h2></header>${rows.map(([k, def]) => textField(k, def)).join('')}</section>`).join('')
      + `<section class="card"><div class="data-row"><div><h3>Start again</h3><p class="hint">Puts every word back to the original. Restaurant info and offer words are kept.</p></div><button type="button" class="btn" id="mdWordsReset">${Icon('refresh')} Reset words</button></div></section>`;
  }
  function offersForm(o) {
    return `<div class="md-offer-grid">
      <fieldset class="md-offer"><legend>${Icon('insta')} Instagram follow</legend>${sw('of-insta', o.insta.on, 'Give a discount for following us', 'Customers tap Follow, follow your page, tick the box and apply.')}
        <label class="field"><span>Instagram handle</span><div class="md-prefix"><b>@</b><input data-of="handle" maxlength="30" value="${esc(o.insta.handle)}" placeholder="yourrestaurant" autocapitalize="off" spellcheck="false"></div></label>
        <label class="field"><span>Discount <em>₹</em></span><input data-of="instaAmount" type="number" min="1" max="10000" step="1" inputmode="numeric" value="${o.insta.amount}"></label></fieldset>
      <fieldset class="md-offer"><legend>${Icon('star')} Google 5-star review</legend>${sw('of-review', o.review.on, 'Give a discount for a Google review', 'Customers open your review page, post a 5-star review, tick the box and apply.')}
        <label class="field"><span>Google review link</span><input data-of="url" type="url" maxlength="2048" value="${esc(o.review.url || review)}" placeholder="https://g.page/r/…/review"></label>
        <label class="field"><span>Discount <em>₹</em></span><input data-of="reviewAmount" type="number" min="1" max="10000" step="1" inputmode="numeric" value="${o.review.amount}"></label></fieldset></div>
      <div class="field"><span>When both are on</span><div class="seg" data-of-mode>${[['one', 'One offer per order'], ['both', 'Both together']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${o.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="hint">Each phone can use an offer once in 12 hours. The kitchen sees the offer on the order and can remove it if the customer did not follow or review.</p>`;
  }
  function readOffers(box, prev) {
    const raw = clone(prev || D.OFFER_DEFAULTS); raw.insta ||= {}; raw.review ||= {};
    raw.insta.on = $('[data-k="of-insta"]', box).checked; raw.insta.handle = $('[data-of="handle"]', box).value.trim().replace(/^@+/, '');
    raw.insta.amount = Number($('[data-of="instaAmount"]', box).value); raw.review.on = $('[data-k="of-review"]', box).checked;
    raw.review.url = $('[data-of="url"]', box).value.trim(); raw.review.amount = Number($('[data-of="reviewAmount"]', box).value);
    raw.mode = $('[data-of-mode] .on', box)?.dataset.mode === 'both' ? 'both' : 'one';
    return raw;
  }
  function offerProblems(raw) {
    const out = [];
    if (raw.insta.on && !/^[A-Za-z0-9._]{1,30}$/.test(raw.insta.handle)) out.push('Enter the Instagram handle (letters, numbers, dots and underscores).');
    if (raw.review.on && !/^https:\/\/\S+$/.test(raw.review.url)) out.push('Enter the Google review link that starts with https://');
    for (const [on, a] of [[raw.insta.on, raw.insta.amount], [raw.review.on, raw.review.amount]]) if (on && !(Number.isInteger(a) && a >= 1 && a <= 10000)) out.push('Discounts must be whole rupees from 1 to 10000.');
    return [...new Set(out)];
  }
  function offersTab() {
    const o = D.offers(draft.offers), raw = { ...D.OFFER_DEFAULTS, ...clone(draft.offers || {}) };
    raw.insta = { ...D.OFFER_DEFAULTS.insta, ...(raw.insta || {}) }; raw.review = { ...D.OFFER_DEFAULTS.review, ...(raw.review || {}) };
    const words = D.TEXTS.find(([g]) => g === 'Offers')[1];
    const status = offersDb === false ? `<div class="notice notice-bad"><b>One database step is needed before offers work.</b> Run <code>SUPABASE/MENU-OFFERS-v18.sql</code> once in Supabase → SQL Editor. Until then customers can see the offers but cannot use them.</div>`
      : offersDb === true ? '' : '';
    return `<section class="card" id="mdOffers"><div class="card-title-row"><div><h2>Offers for customers</h2><p class="hint">Get more followers and Google reviews: give a small discount on the order.</p></div><span class="badge ${o.insta.on || o.review.on ? 'badge-green' : ''}">${o.insta.on || o.review.on ? 'On' : 'Off'}</span></div>
      ${status}${offersForm(raw)}<p class="form-error" id="mdOfferErr" role="alert" hidden></p></section>
      <details class="card md-details"><summary><b>Offer words</b><small class="hint">What customers read in the offer cards.</small></summary><div class="form-grid">${words.map(([k, def]) => textField(k, def)).join('')}</div></details>`;
  }
  function moreTab() {
    return `<section class="card"><div class="md-switches">${sw('enabled', draft.enabled !== false, 'Use this menu design', 'Switch off to go back to the old menu page.')}</div></section>
      <section class="card"><div class="data-row"><div><h3>Back up this design</h3><p class="hint">Download the layout, theme, words and offers as a file, or load a file you saved.</p></div><div class="toolbar"><button type="button" class="btn" id="mdExport">${Icon('download')} Download</button><label class="btn file-btn">${Icon('up')} Load file<input type="file" id="mdImport" accept="application/json,.json" hidden></label></div></div>
        <div class="data-row"><div><h3>Dish photos and portions</h3><p class="hint">Category photos are in the Categories tab. Dish photos, portions and category order are in Items → Photos & portions.</p></div><a class="btn" href="#/itemDetails">${Icon('image')} Photos & portions</a></div>
        <div class="data-row danger-zone"><div><h3>Start over</h3><p class="hint">Puts the whole menu design back to the first layout and theme. Nothing is published until you press Save.</p></div><button type="button" class="btn btn-danger-ghost" id="mdResetAll">Reset design…</button></div></section>`;
  }
  function paint() {
    if (!root) return;
    $$('#mdTabs button', root).forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const body = $('#mdBody', root);
    body.innerHTML = { layout: layoutTab, theme: themeTab, top: topTab, cats: catsTab, parts: partsTab, words: wordsTab, offers: offersTab, more: moreTab }[tab]();
    changed();
  }

  /* ---------- events ---------- */
  function setText(k, v) { draft.texts ||= {}; if (v === '') delete draft.texts[k]; else draft.texts[k] = v; }
  function syncOffers() {
    const box = $('#mdOffers', root); if (!box) return;
    const raw = readOffers(box, draft.offers); draft.offers = raw;
    const err = $('#mdOfferErr', root), p = offerProblems(raw); err.hidden = !p.length; err.textContent = p.join(' ');
  }
  function wire() {
    $('#mdTabs', root).onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; paint(); b.scrollIntoView({ block: 'nearest', inline: 'center' }); };
    const body = $('#mdBody', root);
    body.addEventListener('click', async e => {
      const t = e.target;
      const a = t.closest('[data-arch]'); if (a) { draft.arch = a.dataset.arch; paint(); return; }
      const th = t.closest('[data-theme17]'); if (th) { draft.theme = th.dataset.theme17; paint(); return; }
      const tf = t.closest('[data-tf]'); if (tf) { themeFilter = tf.dataset.tf; paint(); return; }
      const dn = t.closest('[data-dn]'); if (dn) { if (dn.dataset.dn === 'cozy') delete draft.density; else draft.density = dn.dataset.dn; paint(); return; }
      const md = t.closest('[data-mode]'); if (md) { $$('[data-mode]', md.parentElement).forEach(x => x.classList.toggle('on', x === md)); syncOffers(); changed(); return; }
      const sl = t.closest('[data-slide]'); if (sl) { const n = Number(sl.closest('[data-n]').dataset.n), list = draft.hero.slides; if (sl.dataset.slide === 'del') list.splice(n, 1); else { const m = sl.dataset.slide === 'up' ? n - 1 : n + 1; [list[n], list[m]] = [list[m], list[n]]; } paint(); return; }
      const cl = t.closest('[data-catlink]'); if (cl) {
        const c = cl.closest('[data-cat]').dataset.cat;
        const url = await ask({ title: `Photo for ${c}`, body: 'Paste an image address that starts with https://', confirm: 'Use photo', input: { label: 'Image link', type: 'url', placeholder: 'https://…', required: true, value: catPhotos[c] || '' } });
        if (!url) return; if (!RestaurantCloud.safeImage(url.trim())) { toast('Use an image link that starts with https://', 'error'); return; }
        catPhotos = { ...catPhotos, [c]: url.trim() }; paint(); return;
      }
      const cd = t.closest('[data-catdel]'); if (cd) { const c = cd.closest('[data-cat]').dataset.cat; catPhotos = { ...catPhotos }; delete catPhotos[c]; paint(); return; }
      if (t.closest('#mdLayoutReset')) { delete draft.layout; paint(); return; }
      if (t.closest('#mdTuneReset')) { for (const k of ['accent', 'font', 'bodyFont', 'radius', 'density']) delete draft[k]; paint(); return; }
      if (t.closest('#mdAllOn')) { draft.show = {}; song = songBase === null ? null : true; paint(); return; }
      if (t.closest('#mdWordsReset')) { const keep = new Set(D.TEXTS.filter(([g]) => g === 'Top of the menu' || g === 'Offers').flatMap(([, r]) => r.map(([k]) => k))); for (const k of Object.keys(draft.texts || {})) if (!keep.has(k)) delete draft.texts[k]; paint(); toast('Words reset. Press Save to publish.'); return; }
      if (t.closest('#mdSlideLink')) {
        const url = await ask({ title: 'Add banner photo by link', body: 'Paste an image address that starts with https://', confirm: 'Add photo', input: { label: 'Image link', type: 'url', placeholder: 'https://…', required: true } });
        if (!url) return; if (!RestaurantCloud.safeImage(url.trim())) { toast('Use an image link that starts with https://', 'error'); return; }
        addSlide(url.trim()); return;
      }
      if (t.closest('#mdExport')) { downloadFile('menu-design.json', JSON.stringify({ kind: 'menu-design', version: 18, m17: draft }, null, 2), 'application/json'); return; }
      if (t.closest('#mdResetAll')) { if (await ask({ title: 'Reset the menu design?', body: 'Layout, theme, words, switches, banner photos and offers go back to the start. Nothing changes for customers until you press Save.', confirm: 'Reset design', danger: true })) { draft = {}; paint(); } return; }
    });
    body.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.text) { setText(t.dataset.text, t.value); changed(); return; }
      if (t.dataset.cap !== undefined) { draft.hero.slides[Number(t.dataset.cap)].caption = t.value; changed(); return; }
      if (t.id === 'mdAccent') { draft.accent = t.value; const on = $('[data-k="accentOn"]', root); if (on) on.checked = true; t.nextElementSibling.textContent = t.value; changed(); return; }
      if (t.id === 'mdRadius') { draft.radius = Number(t.value); $('#mdRadiusV', root).textContent = t.value + 'px'; changed(); return; }
      if (t.closest('#mdOffers')) { syncOffers(); changed(); }
    });
    body.addEventListener('change', async e => {
      const t = e.target, k = t.dataset.k;
      if (t.dataset.layout) { draft.layout ||= {}; if (t.value) draft.layout[t.dataset.layout] = t.dataset.layout === 'cols' ? Number(t.value) : t.value; else delete draft.layout[t.dataset.layout]; if (!Object.keys(draft.layout).length) delete draft.layout; paint(); return; }
      if (k?.startsWith('lay-')) { draft.layout ||= {}; draft.layout[k.slice(4)] = t.checked; changed(); return; }
      if (k?.startsWith('show-')) { const key = k.slice(5); draft.show ||= {}; if (t.checked === D.SHOW_DEFAULTS[key]) delete draft.show[key]; else draft.show[key] = t.checked; if (key === 'song' && songBase !== null) song = t.checked; changed(); return; }
      if (k === 'accentOn') { if (t.checked) draft.accent = $('#mdAccent', root).value; else delete draft.accent; changed(); return; }
      if (k === 'enabled') { if (t.checked) delete draft.enabled; else draft.enabled = false; changed(); return; }
      if (k?.startsWith('of-')) { syncOffers(); changed(); return; }
      if (t.id === 'mdFont') { if (t.value) draft.font = t.value; else delete draft.font; changed(); return; }
      if (t.id === 'mdBodyFont') { if (t.value) draft.bodyFont = t.value; else delete draft.bodyFont; changed(); return; }
      if (t.name === 'mdCatStyle') { if (t.value === 'banner') delete draft.catBanner; else draft.catBanner = t.value; paint(); return; }
      if (t.dataset.catfile !== undefined) {
        const f = t.files[0], c = t.closest('[data-cat]').dataset.cat, box = t.closest('.md-cat'); t.value = ''; if (!f) return;
        box.classList.add('is-busy');
        try { toast('Uploading photo…'); const url = await RestaurantCloud.uploadMenuImage(await bannerData(f)); catPhotos = { ...catPhotos, [c]: url }; paint(); toast(`Photo ready for ${c}. Press Save to publish.`, 'ok'); }
        catch (ex) { box.classList.remove('is-busy'); toast('Photo not added: ' + ex.message, 'error', 6000); }
        return;
      }
      if (t.id === 'mdSlideFile') { const f = t.files[0]; t.value = ''; if (!f) return; try { toast('Uploading photo…'); const data = await imageToDataURL(f, 1600, 900000); const url = await RestaurantCloud.uploadMenuImage(data); addSlide(url); } catch (ex) { toast('Photo not added: ' + ex.message, 'error', 6000); } return; }
      if (t.id === 'mdImport') { const f = t.files[0]; t.value = ''; if (!f) return; try { const j = JSON.parse(await f.text()); if (j?.kind !== 'menu-design' || typeof j.m17 !== 'object') throw Error('This is not a menu design file.'); draft = clone(j.m17); paint(); toast('Design loaded. Press Save to publish.', 'ok'); } catch (ex) { toast(ex.message, 'error'); } }
    });
    $('#mdSave', root).onclick = save;
    $('#mdUndo', root).onclick = () => { draft = clone(base); song = songBase; catPhotos = clone(catBase); paint(); toast('Changes undone.'); };
    $('#mdDevice', root).onclick = e => { const b = e.target.closest('[data-dev]'); if (!b) return; $$('#mdDevice button', root).forEach(x => x.classList.toggle('on', x === b)); $('.md-phone', root).classList.toggle('wide', b.dataset.dev === 'wide'); };
    $('#mdReload', root).onclick = async e => { busy(e.currentTarget, true, 'Loading…'); try { await loadMenu(); push(true); toast('Dishes refreshed.', 'ok'); } catch (ex) { toast(ex.message, 'error'); } finally { busy(e.currentTarget, false); } };
    $('#mdFrame', root).addEventListener('load', () => push(true));
  }
  function addSlide(src) { draft.hero ||= {}; draft.hero.slides ||= []; if (draft.hero.slides.length >= 8) { toast('Up to 8 banner photos.', 'warn'); return; } draft.hero.slides.push({ src, caption: '' }); paint(); toast('Photo added. Press Save to publish.', 'ok'); }

  async function save() {
    const btn = $('#mdSave', root);
    if (draft.offers) { const p = offerProblems(draft.offers); if (p.length) { tab = 'offers'; paint(); toast(p[0], 'error', 6000); return; } }
    busy(btn, true, 'Saving…');
    try {
      const next = clone(draft); if (next.texts && !Object.keys(next.texts).length) delete next.texts; if (next.show && !Object.keys(next.show).length) delete next.show;
      const photosChanged = JSON.stringify(catPhotos) !== JSON.stringify(catBase);
      await Cloud.patchCustom(photosChanged ? { m17: next, categoryPhotos: clone(catPhotos) } : { m17: next });
      catBase = clone(catPhotos);
      if (song !== null && song !== songBase) { const r = await RX.rpc('restaurant_waiter_config56', { p_app_name: null, p_song_requests: song }); if (r?.error) throw Error(r.error); songBase = song; }
      base = clone(next); draft = clone(next); changed(); toast('Menu design saved. Customers see it the next time the menu loads.', 'ok');
    } catch (e) { toast(e.message, 'error', 7000); } finally { busy(btn, false); changed(); }
  }
  async function loadMenu() {
    const rows = await RestaurantCloud.menu(true);
    items = rows.map(r => ({ ...r, price: Number(r.price), image: RestaurantCloud.safeImage(r.image) }));
    cats = (RestaurantCloud.categories || []).slice(1);
  }
  async function mount(view) {
    root = view; const id = ++loading;
    view.innerHTML = `<div class="page md-page"><header class="page-head"><div><h1>Menu design</h1><p class="sub">How the QR menu looks on customers’ phones. Try anything — the preview changes at once. Press Save to publish.</p></div>
      <div class="head-actions"><span class="badge badge-amber" id="mdDirty" hidden>Not saved</span><button type="button" class="btn" id="mdUndo" disabled>Undo changes</button><button type="button" class="btn btn-primary" id="mdSave" disabled>${Icon('check')} Save</button></div></header>
      <div class="md-split"><div class="md-main"><div class="seg seg-scroll md-tabs" id="mdTabs" role="tablist">${TABS.map(([k, l, ic]) => `<button type="button" role="tab" data-tab="${k}">${Icon(ic)}<span>${l}</span></button>`).join('')}</div><div id="mdBody" class="stack"><div class="card"><p class="status-line">Loading menu design…</p></div></div></div>
      <aside class="md-side" aria-label="Live preview"><div class="md-phone"><iframe id="mdFrame" title="Customer menu preview" src="../menu-preview.html?v=19"></iframe></div>
        <div class="md-side-foot"><div class="seg" id="mdDevice"><button type="button" data-dev="phone" class="on">Phone</button><button type="button" data-dev="wide">Wide</button></div><button type="button" class="btn btn-sm" id="mdReload">${Icon('refresh')} Refresh dishes</button></div>
        <p class="hint md-side-note">Preview only — tapping ADD here does not order.</p></aside></div></div>`;
    addEventListener('message', onMsg); addEventListener('beforeunload', onLeave);
    wire();
    try {
      const [custom, , cfg, rv] = await Promise.all([Cloud.reloadCustom().catch(() => Cloud.custom()), loadMenu().catch(e => { toast('Dishes could not be loaded: ' + e.message, 'error'); }),
        RX.rpc('restaurant_waiter_config56', { p_app_name: null, p_song_requests: null }).catch(() => null), RX.rpc('restaurant_review_settings', { p_url: null }).catch(() => null)]);
      if (id !== loading || root !== view) return;
      base = clone(custom.m17 || {}); draft = clone(base);
      catBase = Object.fromEntries(Object.entries(custom.categoryPhotos || {}).filter(([, v]) => RestaurantCloud.safeImage(v))); catPhotos = clone(catBase);
      songBase = cfg && typeof cfg.song_requests_enabled === 'boolean' ? cfg.song_requests_enabled : null; song = songBase;
      if (songBase === false && draft.show?.song !== false) { draft.show ||= {}; draft.show.song = false; base = clone(draft); }
      review = rv?.url || '';
      RX.rpc('restaurant_order_offer17', { p_order: null, p_action: 'check' }).then(() => { offersDb = true; }, e => { offersDb = !/restaurant_order_offer17|PGRST202|schema cache|Could not find/i.test(e.message); if (tab === 'offers') paint(); });
      paint(); push(true);
    } catch (e) { $('#mdBody', view).innerHTML = `<div class="card"><p class="form-error">${esc(e.message)}</p></div>`; }
  }
  function unmount() { removeEventListener('message', onMsg); removeEventListener('beforeunload', onLeave); clearTimeout(pushTimer); root = null; loading++; }

  /* ---------- Offers from Kitchen orders ---------- */
  async function offersModal() {
    let custom; try { custom = await Cloud.reloadCustom(); } catch { custom = Cloud.custom(); }
    const m = clone(custom.m17 || {}), raw = { ...D.OFFER_DEFAULTS, ...clone(m.offers || {}) };
    raw.insta = { ...D.OFFER_DEFAULTS.insta, ...(raw.insta || {}) }; raw.review = { ...D.OFFER_DEFAULTS.review, ...(raw.review || {}) };
    if (!raw.review.url) { try { review = (await RX.rpc('restaurant_review_settings', { p_url: null }))?.url || ''; } catch { /* optional */ } }
    const d = modal('Customer offers', `<form id="koForm" class="stack">${offersForm(raw)}<p class="form-error" role="alert" hidden></p>
      <footer class="modal-foot"><a class="btn btn-ghost" href="#/menuDesign" data-close>More menu settings</a><button class="btn btn-primary">${Icon('check')} Save offers</button></footer></form>`, { size: 'modal-lg' });
    const f = $('#koForm', d);
    f.addEventListener('click', e => { const md = e.target.closest('[data-mode]'); if (md) $$('[data-mode]', f).forEach(x => x.classList.toggle('on', x === md)); });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const err = $('.form-error', f), next = readOffers(f, m.offers), p = offerProblems(next);
      if (p.length) { err.textContent = p.join(' '); err.hidden = false; return; }
      busy(e.submitter, true, 'Saving…');
      try { const cur = await Cloud.reloadCustom(); await Cloud.patchCustom({ m17: { ...clone(cur.m17 || {}), offers: next } }); toast('Offers saved. Customers see them the next time the menu loads.', 'ok'); d.close(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { busy(e.submitter, false); }
    });
  }
  return { mount, unmount, offersModal, schematic };
})();
