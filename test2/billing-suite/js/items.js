/* Items: the things the shop sells. Add, edit, hide, import and export. */
'use strict';
const Items = (() => {
  const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'pack', 'box', 'dozen', 'm', 'pair', 'set', 'bottle', 'strip'];
  let q = '', cat = 'All', show = 'active', root = null;

  function list() {
    const s = q.trim().toLowerCase();
    return Store.items.filter(i => (cat === 'All' || i.category === cat) && (show === 'all' || (show === 'active' ? i.active : !i.active))
      && (!s || i.name.toLowerCase().includes(s) || (i.code || '').toLowerCase().includes(s) || (i.hsn || '').includes(s) || (i.alias || '').toLowerCase().includes(s)));
  }

  function expiryBadge(i) {
    const e = i.meta?.expiry_date; if (!e) return '';
    const days = Math.round((new Date(e + 'T00:00:00Z') - new Date(Fmt.today() + 'T00:00:00Z')) / 864e5);
    if (days < 0) return `<span class="badge badge-red">Expired</span>`;
    if (days <= 30) return `<span class="badge badge-amber">Expires in ${days}d</span>`;
    return '';
  }
  function render() {
    if (!root?.isConnected) return;
    const rows = list(), stock = Store.stockShown();
    const sel = $('#iCat', root), prev = sel.value;
    sel.innerHTML = `<option value="All">All categories</option>` + Store.categories.map(c => `<option ${c === prev ? 'selected' : ''}>${esc(c)}</option>`).join('');
    if (!Store.categories.includes(cat)) cat = 'All';
    sel.value = cat;
    const active = Store.items.filter(i => i.active).length;
    $('#iCount', root).textContent = `${Store.items.length} item${Store.items.length === 1 ? '' : 's'} · ${active} for sale · ${Store.categories.length} categories`;
    $('#iStockTh', root).hidden = !stock;
    $('#iBody', root).innerHTML = rows.length ? rows.map(i => {
      const margin = i.cost_price != null && Number(i.price) > 0 ? (Number(i.price) - Number(i.cost_price)) / Number(i.price) * 100 : null;
      const tax = Store.settings.tax_enabled && Store.settings.tax_scope === 'item' ? `${Fmt.qty(i.tax_rate ?? Store.settings.tax_value)}% ${i.price_includes_tax ? 'incl.' : '+ tax'}` : '';
      return `<tr data-id="${esc(i.id)}" tabindex="0" class="${i.active ? '' : 'is-muted'}">
        <td data-label="Item"><b>${esc(i.name)}</b>${i.item_type === 'service' ? ' <span class="badge">Service</span>' : ''}${expiryBadge(i)}<small>${[i.code ? `<span class="mono">${esc(i.code)}</span>` : '', i.hsn ? 'HSN ' + esc(i.hsn) : '', i.alias ? esc(i.alias) : ''].filter(Boolean).join(' · ')}</small></td>
        <td data-label="Category">${esc(i.category)}</td>
        <td class="num" data-label="Price"><b>${Fmt.money(i.price)}</b><small>per ${esc(i.unit)}${Number(i.default_discount) ? ` · −${Fmt.qty(i.default_discount)}%` : ''}${tax ? ' · ' + tax : ''}</small></td>
        <td class="num" data-label="Cost">${i.cost_price != null ? Fmt.money(i.cost_price) + `<small>${margin.toFixed(0)}% margin</small>` : '<span class="muted">—</span>'}</td>
        ${stock ? `<td class="num" data-label="Stock">${i.track_stock ? `<span class="${Number(i.stock) <= 0 ? 'neg' : Number(i.stock) <= Number(i.low_stock_at) ? 'warn' : ''}">${Fmt.qty(i.stock)}</span> <small>${esc(i.unit)}</small>` : '<span class="muted">Not tracked</span>'}</td>` : ''}
        <td data-label="Status">${i.active ? '<span class="badge badge-green">For sale</span>' : '<span class="badge">Hidden</span>'}</td>
        <td class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-edit>Edit</button></td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty"><h3>${Store.items.length ? 'No items match' : 'Add your first item'}</h3><p>${Store.items.length ? 'Change the search or filters.' : 'Add items one by one, or import a CSV list from Excel.'}</p>${Store.items.length ? '' : `<button type="button" class="btn btn-primary" data-new>${Icon('plus')} Add item</button>`}</div></td></tr>`;
  }

  function editor(item = null) {
    const S = Store.settings, F = k => Store.itemField(k), perItemTax = S.tax_enabled && S.tax_scope === 'item', stock = Store.stockShown();
    const i = item || { name: '', code: '', category: cat !== 'All' ? cat : 'General', unit: 'pcs', price: '', cost_price: null, active: true, track_stock: false, stock: 0, low_stock_at: 0,
      alias: '', description: '', hsn: '', tax_rate: null, price_includes_tax: !!S.tax_inclusive_default, default_discount: 0, item_type: 'product', meta: {} };
    const m = i.meta || {}, cats = [...new Set([...Store.categories, i.category].filter(Boolean))], units = [...new Set([...UNITS, i.unit])];
    const advOpen = F('advanced') && Object.keys(m).length > 0;
    const d = modal(item ? 'Edit item' : 'Add item', `<form id="itForm" class="item-form">
      ${F('item_type') ? `<div class="seg type-seg" role="radiogroup" aria-label="Type"><label><input type="radio" name="item_type" value="product" ${i.item_type !== 'service' ? 'checked' : ''}><span>${Icon('box')} Product</span></label><label><input type="radio" name="item_type" value="service" ${i.item_type === 'service' ? 'checked' : ''}><span>${Icon('tag')} Service</span></label></div>` : ''}
      <fieldset class="fgroup"><legend>General</legend><div class="form-grid">
        <label class="field span-2"><span>Item name</span><input name="name" required maxlength="120" value="${esc(i.name)}" autocomplete="off" placeholder="e.g. Tata Salt 1 kg"></label>
        ${F('alias') ? `<label class="field span-2"><span>Name on bill <em>optional — e.g. in Hindi</em></span><input name="alias" maxlength="120" value="${esc(i.alias)}" autocomplete="off"></label>` : ''}
        ${F('description') ? `<label class="field span-2"><span>Description <em>optional</em></span><textarea name="description" rows="2" maxlength="500">${esc(i.description)}</textarea></label>` : ''}
        <label class="field"><span>Barcode / code <em>optional</em></span><div class="joined"><input name="code" maxlength="60" value="${esc(i.code || '')}" autocomplete="off" placeholder="Scan or type"><button type="button" class="btn" data-gen title="Make a short code">Make</button></div></label>
        ${F('hsn') ? `<label class="field"><span>HSN / SAC <em>optional</em></span><input name="hsn" maxlength="20" value="${esc(i.hsn)}" inputmode="numeric" placeholder="e.g. 0406"></label>` : ''}
        <div class="field ${F('hsn') ? 'span-2' : ''}"><span>Category</span>
          <select name="catPick" aria-label="Category">${cats.map(c => `<option ${c === i.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new">+ New category…</option></select>
          <input name="category" maxlength="60" value="${esc(i.category)}" autocomplete="off" placeholder="New category name" hidden aria-label="New category name"></div>
      </div></fieldset>
      <fieldset class="fgroup"><legend>Pricing</legend><div class="form-grid">
        <label class="field"><span>Sale price (${esc(Fmt.cur())})</span><input name="price" type="number" min="0" max="9999999" step="0.01" inputmode="decimal" required value="${i.price === '' ? '' : Number(i.price)}"></label>
        <label class="field"><span>Purchase / cost price <em>optional</em></span><input name="cost_price" type="number" min="0" max="9999999" step="0.01" inputmode="decimal" value="${i.cost_price == null ? '' : Number(i.cost_price)}"></label>
        ${F('default_discount') ? `<label class="field"><span>Default discount %</span><input name="default_discount" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${Number(i.default_discount) || ''}" placeholder="0"></label>` : ''}
        ${perItemTax ? `<label class="field"><span>Tax % <em>empty = ${Fmt.qty(S.tax_value)}% default</em></span><input name="tax_rate" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${i.tax_rate == null ? '' : Number(i.tax_rate)}" list="gstRates"><datalist id="gstRates"><option value="0"><option value="5"><option value="12"><option value="18"><option value="28"></datalist></label>
          <div class="field span-2">${swi('price_includes_tax', i.price_includes_tax, 'Price includes tax', 'Tick if the sale price already has GST in it.')}</div>` : ''}
        <p class="hint span-2" id="priceHint"></p>
      </div></fieldset>
      <fieldset class="fgroup" data-inventory ${i.item_type === 'service' ? 'hidden' : ''}><legend>Inventory</legend><div class="form-grid">
        <div class="field"><span>Sold per (unit)</span>
          <select name="unitPick" aria-label="Unit">${units.map(u => `<option ${u === i.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}<option value="__new">Other…</option></select>
          <input name="unit" maxlength="12" value="${esc(i.unit)}" autocomplete="off" placeholder="e.g. bundle" hidden aria-label="Other unit"></div>
        <div class="field">${swi('active', i.active, 'Show in billing')}</div>
        ${stock ? `<div class="span-2">${swi('track_stock', i.track_stock, 'Track stock', 'Count how many you have. Turn off for unlimited stock.')}</div>
        <div class="span-2 form-grid sub-box" data-stock ${i.track_stock ? '' : 'hidden'}>
          ${item && i.track_stock ? `<div class="field"><span>In stock now</span><div class="stock-now"><b>${Fmt.qty(i.stock)} ${esc(i.unit)}</b>${Store.can('stocks') ? `<button type="button" class="btn btn-sm" data-stock-act="in">${Icon('plus')} Add</button><button type="button" class="btn btn-sm btn-ghost" data-stock-act="set">Set count</button>` : ''}</div></div>`
            : `<label class="field"><span>${item ? 'Stock count now' : 'Opening stock'}</span><input name="stock" type="number" step="any" min="0" inputmode="decimal" value="0"></label>`}
          <label class="field"><span>Low-stock alert at</span><input name="low_stock_at" type="number" step="any" min="0" inputmode="decimal" value="${Number(i.low_stock_at) || 0}"></label></div>` : ''}
      </div></fieldset>
      ${F('advanced') ? `<details class="fgroup adv" ${advOpen ? 'open' : ''}><summary>Advanced information <small>storage, batch, expiry</small></summary><div class="form-grid">
        <label class="field"><span>Storage location</span><input name="m_storage_location" maxlength="80" value="${esc(m.storage_location || '')}" placeholder="e.g. Rack B-3"></label>
        <label class="field"><span>Container number</span><input name="m_container_no" maxlength="80" value="${esc(m.container_no || '')}"></label>
        <label class="field"><span>Batch number</span><input name="m_batch_no" maxlength="80" value="${esc(m.batch_no || '')}"></label>
        <label class="field"><span>Manufacturing date</span><input name="m_mfg_date" type="date" value="${esc(m.mfg_date || '')}"></label>
        <label class="field"><span>Expiry date</span><input name="m_expiry_date" type="date" value="${esc(m.expiry_date || '')}"></label></div></details>` : ''}
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions item-actions">${item ? `<button type="button" class="btn btn-danger-ghost" data-delete>${Icon('trash')} Delete</button>` : `<label class="check"><input type="checkbox" name="again"><span>Add another after saving</span></label>`}<span class="grow"></span><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save item</button></div>
    </form>`, { size: 'modal-md item-modal' });
    const form = $('#itForm', d), err = $('.form-error', d);
    if (!isTouch()) $('[name=name]', d).focus();
    const hint = () => {
      const h = $('#priceHint', d), price = Number(form.price.value) || 0, dd = Number(form.default_discount?.value) || 0, rate = form.tax_rate ? (form.tax_rate.value === '' ? Number(S.tax_value) : Number(form.tax_rate.value)) : 0;
      if (!price) { h.textContent = ''; return; }
      const net = price * (1 - dd / 100), parts = [];
      if (dd) parts.push(`After ${Fmt.qty(dd)}% off: ${Fmt.money(net)}`);
      if (perItemTax && rate) parts.push(form.price_includes_tax?.checked ? `includes ${Fmt.money(net - net * 100 / (100 + rate))} tax` : `customer pays ${Fmt.money(net * (1 + rate / 100))} with ${Fmt.qty(rate)}% tax`);
      h.textContent = parts.join(' · ');
    };
    form.addEventListener('input', hint); form.addEventListener('change', hint); hint();
    form.track_stock?.addEventListener('change', e => { $('[data-stock]', d).hidden = !e.target.checked; });
    $$('[name=item_type]', d).forEach(r => r.onchange = () => { $('[data-inventory]', d).hidden = form.item_type.value === 'service'; });
    $('[data-gen]', d).onclick = () => { form.code.value = String(Date.now()).slice(-7) + Math.floor(Math.random() * 10); };
    const pick = (sel, input) => { const s = form[sel], t = form[input]; s.onchange = () => { const nw = s.value === '__new'; t.hidden = !nw; if (nw) { t.value = ''; t.focus(); } else t.value = s.value; }; };
    pick('catPick', 'category'); pick('unitPick', 'unit');
    d.addEventListener('click', e => { const b = e.target.closest('[data-stock-act]'); if (b && item) { d.close(); Stocks.adjust(Store.items.find(x => x.id === item.id) || item, b.dataset.stockAct); } });
    $('[data-delete]', d)?.addEventListener('click', async () => {
      if (!(await ask({ title: `Delete ${i.name}?`, body: 'Old bills keep this item’s name and price. To stop selling it but keep it, turn off “Show in billing” instead.', confirm: 'Delete item', danger: true }))) return;
      try { await Cloud.rpc('shop_item_delete', { p_id: i.id }); Store.items = Store.items.filter(x => x.id !== i.id); document.dispatchEvent(new CustomEvent('items:changed')); toast(`${i.name} deleted.`, 'ok'); d.close(); }
      catch (e) { toast(e.message, 'error'); }
    });
    form.onsubmit = async e => {
      e.preventDefault(); err.hidden = true;
      const fd = new FormData(form), btn = e.submitter, again = form.again?.checked, service = fd.get('item_type') === 'service';
      const num = k => fd.get(k) === null || fd.get(k) === '' ? '' : String(Number(fd.get(k)));
      const p = { id: item?.id || null, name: fd.get('name').trim(), code: fd.get('code').trim(), category: (fd.get('category') || '').trim() || 'General', unit: (fd.get('unit') || '').trim() || 'pcs',
        price: String(Number(fd.get('price'))), cost_price: num('cost_price'), active: form.active.checked,
        track_stock: !service && !!form.track_stock?.checked, low_stock_at: num('low_stock_at') || '0', stock: item ? undefined : num('stock') || '0',
        item_type: service ? 'service' : 'product' };
      if (form.alias) p.alias = fd.get('alias').trim();
      if (form.description) p.description = fd.get('description').trim();
      if (form.hsn) p.hsn = fd.get('hsn').trim();
      if (form.default_discount) p.default_discount = num('default_discount') || '0';
      if (form.tax_rate) { p.tax_rate = num('tax_rate'); p.price_includes_tax = form.price_includes_tax.checked; }
      if (form.m_batch_no) p.meta = Object.fromEntries(['storage_location', 'container_no', 'batch_no', 'mfg_date', 'expiry_date'].map(k => [k, (fd.get('m_' + k) || '').trim()]));
      if (!stock && item) { p.track_stock = item.track_stock; p.low_stock_at = String(item.low_stock_at); }
      const startTracking = item && !item.track_stock && p.track_stock ? Number(fd.get('stock') || 0) : null;
      busy(btn, true, 'Saving…');
      try {
        let saved = await Cloud.rpc('shop_item_save', { p });
        if (startTracking !== null) saved = await Cloud.rpc('shop_stock_adjust', { p_item_id: saved.id, p_mode: 'set', p_qty: startTracking, p_note: 'Tracking started' });
        Store.upsertItem(saved); toast(`${saved.name} saved.`, 'ok');
        if (again) {
          const keep = { cat: saved.category, unit: saved.unit };
          form.reset(); form.again.checked = true;
          const cs = form.catPick; if (![...cs.options].some(o => o.value === keep.cat)) cs.add(new Option(keep.cat, keep.cat), cs.options.length - 1);
          cs.value = keep.cat; form.category.value = keep.cat; form.category.hidden = true; form.unitPick.value = keep.unit; form.unit.value = keep.unit; form.unit.hidden = true;
          if ($('[data-stock]', d)) $('[data-stock]', d).hidden = true; hint(); form.name.focus();
        } else d.close();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
      finally { busy(btn, false); }
    };
  }
  const swi = (name, on, title, desc = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;

  function categories() {
    const d = modal('Categories', `<p class="hint">Rename a category to move all its items. Deleting one moves its items to General.</p>
      <form id="cAdd" class="inline-form"><input name="n" maxlength="60" placeholder="New category name" required aria-label="New category name"><button class="btn btn-primary">Add</button></form>
      <ul class="cat-list" id="cList"></ul>`, { size: 'modal-sm' });
    const paint = () => { $('#cList', d).innerHTML = Store.categories.map(c => `<li><span>${esc(c)} <small>${Store.items.filter(i => i.category === c).length} items</small></span>${c === 'General' ? '' : `<span><button type="button" class="btn btn-sm btn-ghost" data-ren="${esc(c)}">Rename</button><button type="button" class="btn btn-sm btn-ghost" data-del="${esc(c)}">Delete</button></span>`}</li>`).join(''); };
    paint();
    const after = cats => { Store.categories = cats; Store.loadItems(true).then(() => { paint(); render(); }); };
    $('#cAdd', d).onsubmit = async e => { e.preventDefault(); try { after(await Cloud.rpc('shop_category_save', { p_name: e.target.n.value.trim() })); e.target.reset(); } catch (ex) { toast(ex.message, 'error'); } };
    $('#cList', d).addEventListener('click', async e => {
      const r = e.target.closest('[data-ren]'), x = e.target.closest('[data-del]');
      try {
        if (r) { const n = await ask({ title: 'Rename category', input: { label: 'Category name', value: r.dataset.ren, required: true, maxlength: 60 }, confirm: 'Rename' }); if (n && n.trim() !== r.dataset.ren) after(await Cloud.rpc('shop_category_save', { p_name: n.trim(), p_old_name: r.dataset.ren })); }
        if (x && await ask({ title: `Delete ${x.dataset.del}?`, body: 'Its items move to General.', confirm: 'Delete', danger: true })) after(await Cloud.rpc('shop_category_delete', { p_name: x.dataset.del }));
      } catch (ex) { toast(ex.message, 'error'); }
    });
  }

  const HEAD = ['name', 'code', 'category', 'unit', 'price', 'cost_price', 'stock', 'low_stock_at', 'hsn', 'tax_rate', 'default_discount', 'alias'];
  function exportCSV() {
    downloadFile('items.csv', toCSV([HEAD, ...Store.items.map(i => [i.name, i.code || '', i.category, i.unit, i.price, i.cost_price ?? '', i.track_stock ? i.stock : '', i.track_stock ? i.low_stock_at : '', i.hsn || '', i.tax_rate ?? '', Number(i.default_discount) || '', i.alias || ''])]));
  }
  function importCSV() {
    const d = modal('Import items from CSV', `<p>Use a CSV file (Excel → Save As → CSV) with these column names in the first row:</p>
      <p class="mono small">${HEAD.join(', ')}</p>
      <ul class="hint-list"><li><b>name</b> and <b>price</b> are needed. Other columns can be blank.</li><li>An item with the same code (or same name) is updated instead of added twice.</li><li>A number in <b>stock</b> sets the stock count and turns on stock tracking.</li></ul>
      <div class="toolbar"><button type="button" class="btn" data-tpl>${Icon('download')} Download template</button><label class="btn btn-primary file-btn">${Icon('upload')} Choose CSV file<input type="file" accept=".csv,text/csv" hidden></label></div>
      <div id="impPreview"></div>`, { size: 'modal-md' });
    $('[data-tpl]', d).onclick = () => downloadFile('items-template.csv', toCSV([HEAD, ['Tata Salt 1kg', '8904043901015', 'Grocery', 'pcs', '28', '24', '40', '10', '2501', '5', '', ''], ['Sugar (loose)', '', 'Grocery', 'kg', '44', '40', '25', '5', '1701', '5', '', 'चीनी']]));
    $('input[type=file]', d).onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const rows = parseCSV(await file.text()); if (rows.length < 2) return toast('That file has no item rows.', 'warn');
      const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      if (!head.includes('name') || !head.includes('price')) return toast('The first row needs at least “name” and “price” columns.', 'error');
      const data = rows.slice(1).map(r => Object.fromEntries(head.map((h, n) => [h, (r[n] ?? '').trim()]))).filter(r => r.name);
      const bad = data.filter(r => !/^\d{1,7}(\.\d{1,2})?$/.test(r.price));
      $('#impPreview', d).innerHTML = `<div class="sub-box"><p><b>${data.length}</b> items found in ${esc(file.name)}.${bad.length ? ` <span class="neg">${bad.length} have an invalid price and will be skipped (e.g. “${esc(bad[0].name)}”).</span>` : ''}</p><button type="button" class="btn btn-primary" data-go>Import ${data.length - bad.length} items</button></div>`;
      $('[data-go]', d).onclick = async ev => {
        const good = data.filter(r => !bad.includes(r)); let added = 0, updated = 0;
        busy(ev.currentTarget, true, 'Importing…');
        try {
          for (let n = 0; n < good.length; n += 300) { const r = await Cloud.rpc('shop_items_import', { p_rows: good.slice(n, n + 300) }); added += r.added; updated += r.updated; }
          await Store.loadItems(true); toast(`Import done: ${added} added, ${updated} updated.`, 'ok'); d.close();
        } catch (ex) { toast('Import stopped: ' + ex.message, 'error', 8000); await Store.loadItems(true); busy(ev.currentTarget, false); }
      };
    };
  }

  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Items</h1><p class="sub" id="iCount"></p></div>
        <div class="head-actions"><button type="button" class="btn" id="iCats">Categories</button><button type="button" class="btn" id="iImp">${Icon('upload')} Import</button><button type="button" class="btn" id="iExp">${Icon('download')} Export</button><button type="button" class="btn btn-primary" id="iNew">${Icon('plus')} Add item</button></div></header>
      <div class="filters">
        <label class="search sm">${Icon('search')}<input id="iQ" type="search" placeholder="Search name or code" value="${esc(q)}" aria-label="Search items"></label>
        <select id="iCat" aria-label="Category"></select>
        <div class="seg" id="iShow"><button type="button" data-s="active">For sale</button><button type="button" data-s="hidden">Hidden</button><button type="button" data-s="all">All</button></div>
      </div>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Item</th><th>Category</th><th class="num">Price</th><th class="num">Cost</th><th class="num" id="iStockTh">Stock</th><th>Status</th><th></th></tr></thead><tbody id="iBody"></tbody></table></div>
    </div>`;
    $$('#iShow button', view).forEach(b => b.classList.toggle('on', b.dataset.s === show));
    $('#iShow', view).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; show = b.dataset.s; $$('#iShow button', view).forEach(x => x.classList.toggle('on', x === b)); render(); };
    $('#iQ', view).oninput = e => { q = e.target.value; render(); };
    $('#iCat', view).onchange = e => { cat = e.target.value; render(); };
    $('#iNew', view).onclick = () => editor();
    $('#iCats', view).onclick = categories;
    $('#iImp', view).onclick = importCSV;
    $('#iExp', view).onclick = exportCSV;
    const open = tr => editor(Store.items.find(i => i.id === tr.dataset.id));
    $('#iBody', view).addEventListener('click', e => { if (e.target.closest('[data-new]')) return editor(); const tr = e.target.closest('tr[data-id]'); if (tr) open(tr); });
    $('#iBody', view).addEventListener('keydown', e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr); } });
    render();
    Store.loadItems(true).then(render).catch(e => toast(e.message, 'error'));
  }
  document.addEventListener('items:changed', render);
  return { mount, editor, unmount() { root = null; } };
})();
