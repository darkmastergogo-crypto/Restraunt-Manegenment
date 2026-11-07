/* Items: the things the shop sells. Add, edit, hide, import and export, bulk delete, categories. */
'use strict';
const Items = (() => {
  const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'pack', 'box', 'dozen', 'm', 'pair', 'set', 'bottle', 'strip'];
  const PAGE_SIZES = [25, 50, 100, 250];
  let q = '', cat = 'All', show = 'active', root = null, page = 1, pageSize = 50, qTimer = null;
  const selected = new Set();
  const nf = n => Number(n).toLocaleString('en-IN');
  const plural = (n, w, pl = w + 's') => `${nf(n)} ${n === 1 ? w : pl}`;
  const canWipe = () => Store.isAdmin || Store.role === 'owner';

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
  /* Margin % of the sale price. Null when it cannot be worked out (no cost price, or a sale price of 0). */
  function marginPct(i) {
    const cost = Fmt.num(i.cost_price), price = Fmt.num(i.price);
    return cost === null || price === null || price <= 0 ? null : (price - cost) / price * 100;
  }

  function row(i, stock) {
    const mg = marginPct(i), cost = Fmt.num(i.cost_price), on = selected.has(i.id);
    const tax = Store.settings.tax_enabled && Store.settings.tax_scope === 'item' ? `${Fmt.qty(i.tax_rate ?? Store.settings.tax_value)}% ${i.price_includes_tax ? 'incl.' : '+ tax'}` : '';
    return `<tr data-id="${esc(i.id)}" tabindex="0" class="${i.active ? '' : 'is-muted'} ${on ? 'is-selected' : ''}">
      <td data-label="Item"><div class="it-cell"><label class="sel-wrap"><input type="checkbox" data-sel ${on ? 'checked' : ''} aria-label="Select ${esc(i.name)}"></label>
        <div><b>${esc(i.name)}</b>${i.item_type === 'service' ? ' <span class="badge">Service</span>' : ''}${expiryBadge(i)}<small>${[i.code ? `<span class="mono">${esc(i.code)}</span>` : '', i.hsn ? 'HSN ' + esc(i.hsn) : '', i.alias ? esc(i.alias) : ''].filter(Boolean).join(' · ')}</small></div></div></td>
      <td data-label="Category">${esc(i.category)}</td>
      <td class="num" data-label="Price"><b>${Fmt.money(i.price)}</b><small>per ${esc(i.unit)}${Number(i.default_discount) ? ` · −${Fmt.qty(i.default_discount)}%` : ''}${tax ? ' · ' + tax : ''}</small></td>
      <td class="num" data-label="Cost">${cost !== null ? Fmt.money(cost) + (mg !== null ? `<small>${Fmt.fixed(mg, 0)}% margin</small>` : '') : '<span class="muted">—</span>'}</td>
      ${stock ? `<td class="num" data-label="Stock">${i.track_stock ? `<span class="${Number(i.stock) <= 0 ? 'neg' : Number(i.stock) <= Number(i.low_stock_at) ? 'warn' : ''}">${Fmt.qty(i.stock)}</span> <small>${esc(i.unit)}</small>` : '<span class="muted">Not tracked</span>'}</td>` : ''}
      <td data-label="Status">${i.active ? '<span class="badge badge-green">For sale</span>' : '<span class="badge">Hidden</span>'}</td>
      <td class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-edit>${Icon('edit')} Edit</button><button type="button" class="btn btn-sm btn-danger-ghost" data-del-item aria-label="Delete ${esc(i.name)}">${Icon('trash')} Delete</button></td></tr>`;
  }

  function render() {
    if (!root?.isConnected) return;
    const all = Store.items, rows = list(), stock = Store.stockShown();
    // the selection only ever holds items that still exist
    const ids = new Set(all.map(i => i.id)); for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);
    const per = new Map(); let active = 0;
    for (const i of all) { per.set(i.category, (per.get(i.category) || 0) + 1); if (i.active) active++; }
    const catNames = [...new Set([...Store.categories, ...per.keys()])];
    if (cat !== 'All' && !catNames.includes(cat)) cat = 'All';
    $('#iStats', root).innerHTML = [['Total items', all.length], ['For sale', active], ['Hidden', all.length - active], ['Categories', catNames.length]]
      .map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${nf(v)}</b></div>`).join('');
    const sel = $('#iCat', root);
    sel.innerHTML = `<option value="All">All categories (${nf(all.length)})</option>` + catNames.map(c => `<option value="${esc(c)}">${esc(c)} (${nf(per.get(c) || 0)})</option>`).join('');
    sel.value = cat;
    $('#iStockTh', root).hidden = !stock;
    $('#iWipe', root).hidden = !all.length || !canWipe();
    $('#iExp', root).disabled = !all.length;

    const pages = Math.max(1, Math.ceil(rows.length / pageSize)); page = Math.min(Math.max(1, page), pages);
    const from = (page - 1) * pageSize, slice = rows.slice(from, from + pageSize);
    $('#iBody', root).innerHTML = slice.length ? slice.map(i => row(i, stock)).join('')
      : `<tr><td colspan="7"><div class="empty"><h3>${all.length ? 'No items match' : 'Add your first item'}</h3><p>${all.length ? 'Change the search or filters.' : 'Add items one by one, or import a CSV list from Excel.'}</p>${all.length ? '' : `<button type="button" class="btn btn-primary" data-new>${Icon('plus')} Add item</button>`}</div></td></tr>`;
    $('#iPager', root).innerHTML = rows.length ? `<span>Showing ${nf(from + 1)}–${nf(from + slice.length)} of ${nf(rows.length)}${rows.length !== all.length ? ` (${nf(all.length)} in total)` : ''}</span>
      <label class="pg-size">Per page <select id="iSize" aria-label="Items per page">${PAGE_SIZES.map(n => `<option ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <span class="pg-nav"><button type="button" class="btn btn-sm" data-pg="-1" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${nf(page)} of ${nf(pages)}</span><button type="button" class="btn btn-sm" data-pg="1" ${page >= pages ? 'disabled' : ''}>Next</button></span>` : '';
    renderBulk(rows, slice);
  }

  /* The selection bar. Cheap, so ticking boxes never rebuilds the table. */
  function renderBulk(rows = list(), slice) {
    if (!root?.isConnected) return;
    slice = slice || rows.slice((page - 1) * pageSize, page * pageSize);
    const onPage = slice.filter(i => selected.has(i.id)).length, allPage = slice.length > 0 && onPage === slice.length;
    const pg = $('#iSelPage', root); pg.checked = allPage; pg.indeterminate = onPage > 0 && !allPage; pg.disabled = !slice.length;
    const bar = $('#iBulk', root); bar.hidden = !selected.size;
    if (!selected.size) return;
    const more = allPage && rows.length > slice.length && !rows.every(i => selected.has(i.id));
    bar.innerHTML = `<b>${plural(selected.size, 'item')} selected</b>${more ? `<button type="button" class="btn btn-sm btn-ghost" data-selall>Select all ${nf(rows.length)} matching items</button>` : ''}
      <span class="grow"></span><button type="button" class="btn btn-sm btn-ghost" data-selnone>Clear</button><button type="button" class="btn btn-sm btn-danger" data-bulkdel>${Icon('trash')} Delete selected</button>`;
  }

  async function removeItems(ids, label) {
    const r = await Cloud.rpc('shop_items_delete_many', { p_ids: ids });
    const gone = new Set(ids); Store.items = Store.items.filter(i => !gone.has(i.id)); ids.forEach(id => selected.delete(id));
    document.dispatchEvent(new CustomEvent('items:changed'));
    toast(`${label || plural(r.deleted, 'item') + ' deleted'}.`, 'ok');
  }
  async function deleteOne(item) {
    if (!(await ask({ title: `Delete ${item.name}?`, body: 'Old bills keep this item’s name and price. To stop selling it but keep it, turn off “Show in billing” instead.', confirm: 'Delete item', danger: true, focusCancel: true }))) return;
    try { await removeItems([item.id], `${item.name} deleted`); } catch (e) { toast(e.message, 'error'); }
  }
  async function deleteSelected() {
    const ids = [...selected]; if (!ids.length) return;
    if (!(await ask({ title: `Delete ${plural(ids.length, 'item')}?`, body: `The ${ids.length === 1 ? 'item' : nf(ids.length) + ' selected items'} will be removed from Items and Billing. Old bills keep their names and prices. This cannot be undone.`, confirm: `Delete ${plural(ids.length, 'item')}`, danger: true, focusCancel: true }))) return;
    try { await removeItems(ids); } catch (e) { toast(e.message, 'error'); }
  }
  async function deleteAll() {
    const n = Store.items.length; if (!n) return;
    if (!(await ask({ title: 'Delete All Items?', body: `This action will permanently delete all ${nf(n)} items from your inventory. This action cannot be undone. Old bills and reports are kept.`, confirm: 'Delete All Items', danger: true, focusCancel: true }))) return;
    try {
      const r = await Cloud.rpc('shop_items_delete_all', { p_confirm: 'DELETE ALL ITEMS' });
      Store.items = []; selected.clear(); document.dispatchEvent(new CustomEvent('items:changed'));
      await Store.loadItems(true).catch(() => {});
      toast(`All items deleted (${nf(r.deleted)}).`, 'ok');
    } catch (e) { toast(e.message, 'error'); }
  }

  function editor(item = null) {
    const S = Store.settings, full = !!item, F = k => full || Store.itemField(k), taxPerItem = S.tax_enabled && S.tax_scope === 'item', perItemTax = full || taxPerItem, stock = Store.stockShown();
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
        ${perItemTax ? `<label class="field"><span>Tax % <em>${taxPerItem ? `empty = ${Fmt.qty(S.tax_value)}% default` : 'used when tax is set per item in Settings'}</em></span><input name="tax_rate" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${i.tax_rate == null ? '' : Number(i.tax_rate)}" list="gstRates"><datalist id="gstRates"><option value="0"><option value="5"><option value="12"><option value="18"><option value="28"></datalist></label>
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
          <label class="field"><span>${item ? 'Stock count' : 'Opening stock'}${item ? ' <em>changes are logged in Stocks</em>' : ''}</span><input name="stock" type="number" step="any" min="0" inputmode="decimal" value="${item ? Number(i.stock) || 0 : 0}"></label>
          ${item && i.track_stock && Store.can('stocks') ? `<div class="field"><span>Quick stock</span><div class="stock-now"><button type="button" class="btn btn-sm" data-stock-act="in">${Icon('plus')} Add</button><button type="button" class="btn btn-sm btn-ghost" data-stock-act="set">Set count</button></div></div>` : ''}
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
      if (taxPerItem && rate) parts.push(form.price_includes_tax?.checked ? `includes ${Fmt.money(net - net * 100 / (100 + rate))} tax` : `customer pays ${Fmt.money(net * (1 + rate / 100))} with ${Fmt.qty(rate)}% tax`);
      h.textContent = parts.join(' · ');
    };
    form.addEventListener('input', hint); form.addEventListener('change', hint); hint();
    form.track_stock?.addEventListener('change', e => { $('[data-stock]', d).hidden = !e.target.checked; });
    $$('[name=item_type]', d).forEach(r => r.onchange = () => { $('[data-inventory]', d).hidden = form.item_type.value === 'service'; });
    $('[data-gen]', d).onclick = () => { form.code.value = String(Date.now()).slice(-7) + Math.floor(Math.random() * 10); };
    const pick = (sel, input) => { const s = form[sel], t = form[input]; s.onchange = () => { const nw = s.value === '__new'; t.hidden = !nw; if (nw) { t.value = ''; t.focus(); } else t.value = s.value; }; };
    pick('catPick', 'category'); pick('unitPick', 'unit');
    d.addEventListener('click', e => { const b = e.target.closest('[data-stock-act]'); if (b && item) { closing = true; d.close(); Stocks.adjust(Store.items.find(x => x.id === item.id) || item, b.dataset.stockAct); } });
    /* Closing with unsaved changes asks first, so nothing is lost by accident. */
    const snap = () => JSON.stringify([...new FormData(form).entries()].filter(([, v]) => typeof v === 'string'));
    let base = snap(), closing = false;
    const dirty = () => !closing && snap() !== base;
    const discard = async () => { if (await ask({ title: 'Discard changes?', body: 'You have unsaved changes to this item. If you close now they will be lost.', confirm: 'Discard changes', cancel: 'Keep editing', danger: true, focusCancel: true })) { closing = true; d.close(); } };
    d.addEventListener('click', e => { if (e.target.closest('[data-close]') && dirty()) { e.stopPropagation(); discard(); } }, true);
    d.addEventListener('cancel', e => { if (dirty()) { e.preventDefault(); discard(); } });
    $('[data-delete]', d)?.addEventListener('click', async () => {
      if (!(await ask({ title: `Delete ${i.name}?`, body: 'Old bills keep this item’s name and price. To stop selling it but keep it, turn off “Show in billing” instead.', confirm: 'Delete item', danger: true, focusCancel: true }))) return;
      try { await Cloud.rpc('shop_item_delete', { p_id: i.id }); Store.items = Store.items.filter(x => x.id !== i.id); selected.delete(i.id); closing = true; document.dispatchEvent(new CustomEvent('items:changed')); toast(`${i.name} deleted.`, 'ok'); d.close(); }
      catch (e) { toast(e.message, 'error'); }
    });
    form.onsubmit = async e => {
      e.preventDefault(); err.hidden = true;
      const fd = new FormData(form), btn = e.submitter, again = form.again?.checked, service = fd.get('item_type') === 'service';
      const num = k => fd.get(k) === null || fd.get(k) === '' ? '' : String(Number(fd.get(k)));
      const p = { id: item?.id || null, name: fd.get('name').trim(), code: fd.get('code').trim(), category: (fd.get('category') || '').trim() || 'General', unit: (fd.get('unit') || '').trim() || 'pcs',
        price: String(Number(fd.get('price'))), cost_price: num('cost_price'), active: form.active.checked,
        track_stock: !service && !!form.track_stock?.checked, low_stock_at: num('low_stock_at') || '0',
        item_type: service ? 'service' : 'product' };
      if (form.alias) p.alias = fd.get('alias').trim();
      if (form.description) p.description = fd.get('description').trim();
      if (form.hsn) p.hsn = fd.get('hsn').trim();
      if (form.default_discount) p.default_discount = num('default_discount') || '0';
      if (form.tax_rate) { p.tax_rate = num('tax_rate'); p.price_includes_tax = form.price_includes_tax.checked; }
      if (form.m_batch_no) p.meta = Object.fromEntries(['storage_location', 'container_no', 'batch_no', 'mfg_date', 'expiry_date'].map(k => [k, (fd.get('m_' + k) || '').trim()]));
      if (!stock && item) { p.track_stock = item.track_stock; p.low_stock_at = String(item.low_stock_at); }
      if (form.stock && p.track_stock) p.stock = num('stock') || '0';
      busy(btn, true, 'Saving…');
      try {
        const saved = await Cloud.rpc('shop_item_save', { p });
        Store.upsertItem(saved); toast(`${saved.name} saved.`, 'ok');
        if (again) {
          const keep = { cat: saved.category, unit: saved.unit };
          form.reset(); form.again.checked = true;
          const cs = form.catPick; if (![...cs.options].some(o => o.value === keep.cat)) cs.add(new Option(keep.cat, keep.cat), cs.options.length - 1);
          cs.value = keep.cat; form.category.value = keep.cat; form.category.hidden = true; form.unitPick.value = keep.unit; form.unit.value = keep.unit; form.unit.hidden = true;
          if ($('[data-stock]', d)) $('[data-stock]', d).hidden = true; hint(); base = snap(); form.name.focus();
        } else d.close();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
      finally { busy(btn, false); }
    };
  }
  const swi = (name, on, title, desc = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;


  /* ---------------------------------------------------------------- categories */
  async function categories() {
    const d = modal('Categories', `<p class="hint">Rename a category to rename it for all its items. Tick several to delete them together. Items are never left without a category.</p>
      <form id="cAdd" class="inline-form"><input name="n" maxlength="60" placeholder="New category name" required aria-label="New category name"><button class="btn btn-primary">Add</button></form>
      <div class="cat-bar"><label class="check"><input type="checkbox" id="cAll"><span>Select all</span></label><span class="grow"></span>
        <button type="button" class="btn btn-sm btn-danger-ghost" id="cDelSel" disabled>${Icon('trash')} Delete selected</button><button type="button" class="btn btn-sm btn-danger-ghost" id="cDelAll">Delete all categories</button></div>
      <ul class="cat-list" id="cList" aria-live="polite"></ul>`, { size: 'modal-md', onClose: () => render() });
    let cats = [], sel = new Set();
    const paint = () => {
      sel = new Set([...sel].filter(n => cats.some(c => c.name === n)));
      $('#cList', d).innerHTML = cats.length ? cats.map(c => `<li><label class="check cat-pick"><input type="checkbox" data-pick="${esc(c.name)}" ${sel.has(c.name) ? 'checked' : ''}><span><b>${esc(c.name)}</b> <small>${plural(c.items, 'item')}${c.items !== c.for_sale ? ` · ${nf(c.for_sale)} for sale` : ''}</small></span></label>
        <span class="cat-act"><button type="button" class="btn btn-sm btn-ghost" data-ren="${esc(c.name)}">Rename</button><button type="button" class="btn btn-sm btn-ghost" data-del="${esc(c.name)}">Delete</button></span></li>`).join('') : '<li class="muted">No categories yet.</li>';
      const all = $('#cAll', d); all.checked = cats.length > 0 && sel.size === cats.length; all.indeterminate = sel.size > 0 && sel.size < cats.length; all.disabled = !cats.length;
      $('#cDelSel', d).disabled = !sel.size; $('#cDelSel', d).innerHTML = `${Icon('trash')} Delete selected${sel.size ? ` (${sel.size})` : ''}`; $('#cDelAll', d).disabled = !cats.length;
    };
    const load = async () => {
      cats = await Cloud.rpc('shop_categories_list'); Store.categories = cats.map(c => c.name); paint();
    };
    const changed = async () => { await Store.loadItems(true); await load(); };
    try { await load(); } catch (e) { toast(e.message, 'error'); }

    async function remove(names) {
      const infos = cats.filter(c => names.includes(c.name)), n = infos.reduce((a, c) => a + c.items, 0), k = infos.length;
      if (!k) return;
      const noun = plural(k, 'category', 'categories');
      let args;
      if (!n) {
        if (!(await ask({ title: `Delete ${noun}?`, body: `${k === 1 ? 'This category has' : 'These categories have'} no items.`, confirm: 'Delete', danger: true, focusCancel: true }))) return;
        args = { p_names: names, p_mode: 'delete_items' };
      } else {
        const others = cats.filter(c => !names.includes(c.name)).map(c => c.name), targets = others.length ? others : cats.map(c => c.name);
        args = await new Promise(resolve => {
          const x = modal(`Delete ${noun}?`, `<form id="cdForm"><p><b>${nf(k)}</b> ${k === 1 ? 'category contains' : 'categories contain'} <b>${plural(n, 'item')}</b>. What should happen to the items?</p>
            <label class="opt"><input type="radio" name="mode" value="move" checked><span><b>Move the items to another category</b><small>Nothing is lost. Billing shows them under the new category.</small>
              <select name="target" aria-label="Move items to">${targets.map(t => `<option>${esc(t)}</option>`).join('')}</select>${others.length ? '' : `<small>This category is kept, because no other category is left.</small>`}</span></label>
            <label class="opt"><input type="radio" name="mode" value="delete_items"><span><b>${k === 1 ? 'Delete this category and its' : `Delete these ${nf(k)} categories and their`} ${plural(n, 'item')}</b><small>The items are removed from Items and Billing. Old bills keep their lines. This cannot be undone.</small></span></label>
            <div class="modal-actions"><span class="grow"></span><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-danger" id="cdGo"></button></div></form>`, { size: 'modal-sm', onClose: () => resolve(null) });
          const f = $('#cdForm', x), label = () => { const mv = f.mode.value === 'move'; $('#cdGo', x).textContent = mv ? 'Move items and delete' : (k === 1 ? 'Delete category and items' : 'Delete categories and items'); f.target.disabled = !mv; };
          f.onchange = label; label(); $('[data-close]', x).focus();
          f.onsubmit = e => { e.preventDefault(); const a = { p_names: names, p_mode: f.mode.value, p_target: f.mode.value === 'move' ? f.target.value : null }; x.close(); resolve(a); };
        });
        if (!args) return;
      }
      try {
        const r = await Cloud.rpc('shop_categories_delete', args);
        sel.clear(); await changed();
        toast(`${plural(r.categories_deleted, 'category', 'categories')} deleted${r.items_moved ? ` · ${plural(r.items_moved, 'item')} moved to ${args.p_target}` : ''}${r.items_deleted ? ` · ${plural(r.items_deleted, 'item')} deleted` : ''}.`, 'ok', 5000);
      } catch (ex) { toast(ex.message, 'error'); }
    }

    $('#cAdd', d).onsubmit = async e => {
      e.preventDefault();
      try { await Cloud.rpc('shop_category_save', { p_name: e.target.n.value.trim() }); e.target.reset(); await changed(); } catch (ex) { toast(ex.message, 'error'); }
    };
    $('#cAll', d).onchange = e => { sel = e.target.checked ? new Set(cats.map(c => c.name)) : new Set(); paint(); };
    $('#cDelSel', d).onclick = () => remove([...sel]);
    $('#cDelAll', d).onclick = () => remove(cats.map(c => c.name));
    $('#cList', d).addEventListener('change', e => { const p = e.target.closest('[data-pick]'); if (!p) return; p.checked ? sel.add(p.dataset.pick) : sel.delete(p.dataset.pick); paint(); });
    $('#cList', d).addEventListener('click', async e => {
      const r = e.target.closest('[data-ren]'), x = e.target.closest('[data-del]');
      try {
        if (r) { const n = await ask({ title: 'Rename category', input: { label: 'Category name', value: r.dataset.ren, required: true, maxlength: 60 }, confirm: 'Rename' }); if (n && n.trim() !== r.dataset.ren) { await Cloud.rpc('shop_category_save', { p_name: n.trim(), p_old_name: r.dataset.ren }); await changed(); } }
        if (x) await remove([x.dataset.del]);
      } catch (ex) { toast(ex.message, 'error'); }
    });
  }

  /* ---------------------------------------------------------------- CSV */
  const HEAD = ['name', 'code', 'category', 'unit', 'price', 'cost_price', 'stock', 'low_stock_at', 'hsn', 'tax_rate', 'default_discount', 'alias'];
  function exportCSV() {
    downloadFile(`items-${Fmt.today()}.csv`, toCSV([HEAD, ...Store.items.map(i => [i.name, i.code || '', i.category, i.unit, i.price, i.cost_price ?? '', i.track_stock ? i.stock : '', i.track_stock ? i.low_stock_at : '', i.hsn || '', i.tax_rate ?? '', Number(i.default_discount) || '', i.alias || ''])]));
  }

  /* Reads CSV text into records. Every record keeps its row number as Excel shows it (header = row 1)
     and a problem note when the row is malformed. Nothing is skipped silently except empty lines. */
  function readCSV(text) {
    text = text.replace(/^﻿/, '');
    const recs = []; let row = [], cell = '', inQ = false, afterQ = false, err = '';
    const endCell = () => { row.push(cell); cell = ''; afterQ = false; };
    const endRec = () => { endCell(); recs.push({ cells: row, err }); row = []; err = ''; };
    for (let k = 0; k < text.length; k++) {
      const c = text[k];
      if (inQ) { if (c === '"') { if (text[k + 1] === '"') { cell += '"'; k++; } else { inQ = false; afterQ = true; } } else cell += c; continue; }
      if (c === '"' && cell === '' && !afterQ) { inQ = true; continue; }
      if (c === ',') { endCell(); continue; }
      if (c === '\n' || c === '\r') { if (c === '\r' && text[k + 1] === '\n') k++; endRec(); continue; }
      if (afterQ) { if (c === ' ' || c === '\t') continue; err = err || 'There is text after a closing quote.'; }
      cell += c;
    }
    if (inQ) err = 'A quoted cell is never closed (a " is missing).';
    if (cell !== '' || row.length || inQ) endRec();
    return recs;
  }
  const blankRec = r => r.cells.every(c => c.trim() === '') && !r.err;

  function importCSV() {
    const d = modal('Import items from CSV', `<div class="imp">
      <p>Use a CSV file (Excel → Save As → CSV) with these column names in the first row:</p>
      <p class="mono small">${HEAD.join(', ')}</p>
      <ul class="hint-list"><li><b>name</b> and <b>price</b> are needed. Every other column can be blank.</li>
        <li>The whole file is checked first. If <b>any</b> row is wrong, <b>nothing</b> is imported and you see every problem at once.</li>
        <li>An item with the same <b>code</b> (or, when there is no code, the same name) is updated instead of added twice. A blank cell keeps the item’s current value.</li>
        <li>A number in <b>stock</b> sets the stock count and turns on stock tracking.</li></ul>
      <div class="toolbar"><button type="button" class="btn" data-tpl>${Icon('download')} Download template</button><label class="btn btn-primary file-btn">${Icon('upload')} Choose CSV file<input type="file" accept=".csv,text/csv" hidden></label></div>
      <div id="impOut" aria-live="polite"></div></div>`, { size: 'modal-md' });
    const out = $('#impOut', d), fileBtn = $('.file-btn', d);
    $('[data-tpl]', d).onclick = () => downloadFile('items-template.csv', toCSV([HEAD, ['Tata Salt 1kg', '8904043901015', 'Grocery', 'pcs', '28', '24', '40', '10', '2501', '5', '', ''], ['Sugar (loose)', '', 'Grocery', 'kg', '44', '40', '25', '5', '1701', '5', '', 'चीनी']]));
    const counts = (proc, good, bad, label = 'Valid') => `<div class="imp-counts"><div><span>Processed</span><b>${nf(proc)}</b></div><div class="${good ? 'ok' : ''}"><span>${label}</span><b>${nf(good)}</b></div><div class="${bad ? 'bad' : ''}"><span>Failed</span><b>${nf(bad)}</b></div></div>`;
    const progress = (msg, pct) => { out.innerHTML = `<div class="imp-prog"><div class="progress ${pct == null ? 'ind' : ''}" role="progressbar" aria-label="Import progress" ${pct != null ? `aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"` : ''}><i style="${pct != null ? `width:${pct}%` : ''}"></i></div><p>${msg}</p></div>`; };
    const stop = on => { fileBtn.classList.toggle('is-disabled', on); $('input[type=file]', d).disabled = on; };

    const showErrors = (r, fileName) => {
      const bad = new Set(r.errors.map(e => e.row)), exact = r.errors.length >= r.total_errors, failedRows = bad.size;
      out.innerHTML = `<div class="imp-fail" role="alert"><h3>${Icon('alert')} CSV Import Failed</h3>
        <p>Your CSV file contains invalid data. <b>No items were imported</b> and nothing was changed. Correct the ${plural(r.total_errors, 'problem')} below and upload the file again.</p>
        ${counts(r.rows, Math.max(0, r.rows - failedRows), failedRows, 'Valid')}
        <div class="imp-errors"><table class="table"><thead><tr><th>Row</th><th>Item</th><th>What is wrong</th></tr></thead><tbody>${r.errors.map(e => `<tr><td class="num"><b>${e.row}</b></td><td>${esc(e.name || '—')}</td><td>${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>
        ${exact ? '' : `<p class="hint">Showing the first ${nf(r.errors.length)} of ${nf(r.total_errors)} problems. Fix these and upload again to see the rest.</p>`}
        <div class="toolbar"><button type="button" class="btn" data-errcsv>${Icon('download')} Download problem list</button></div></div>`;
      $('[data-errcsv]', out).onclick = () => downloadFile('import-problems.csv', toCSV([['row', 'item', 'problem'], ...r.errors.map(e => [e.row, e.name, e.message])]));
    };

    $('input[type=file]', d).onchange = async e => {
      const file = e.target.files[0]; e.target.value = ''; if (!file) return;
      stop(true);
      try {
        progress(`Reading ${esc(file.name)}…`, 10);
        const text = await file.text(); await new Promise(r => setTimeout(r, 30));
        const recs = readCSV(text);
        if (!recs.length || blankRec(recs[0])) { out.innerHTML = `<div class="imp-fail" role="alert"><h3>${Icon('alert')} CSV Import Failed</h3><p>The file is empty. No items were imported. Use the template for the right layout.</p></div>`; return; }
        if (recs[0].cells.length === 1 && /[;\t|]/.test(recs[0].cells[0])) { out.innerHTML = `<div class="imp-fail" role="alert"><h3>${Icon('alert')} CSV Import Failed</h3><p>The columns in this file are separated by <b>;</b>, a tab or <b>|</b>, not by commas. In Excel choose <b>Save As → CSV (Comma delimited)</b>. No items were imported.</p></div>`; return; }
        const head = recs[0].cells.map((h, n) => h.trim().toLowerCase().replace(/\s+/g, '_') || `(blank column ${n + 1})`);
        const rows = [];
        recs.forEach((r, n) => {
          if (n === 0 || blankRec(r)) return;
          let cells = r.cells; while (cells.length > head.length && cells[cells.length - 1].trim() === '') cells = cells.slice(0, -1);
          const o = { _row: n + 1 };
          head.forEach((h, c) => { o[h] = (cells[c] ?? '').trim().replace(/^'(?=[=+\-@])/, ''); });
          if (cells.length !== head.length) o._error = `This row has ${cells.length} cells but the header has ${head.length} columns. Check for a missing or extra comma (a comma inside a name must be in quotes).`;
          else if (r.err) o._error = r.err;
          rows.push(o);
        });
        if (!rows.length) { out.innerHTML = `<div class="imp-fail" role="alert"><h3>${Icon('alert')} CSV Import Failed</h3><p>That file has no item rows under the header. No items were imported.</p></div>`; return; }
        progress(`Checking ${plural(rows.length, 'row')}…`, null);
        const r = await Cloud.rpc('shop_items_import_csv', { p_rows: rows, p_columns: head, p_dry_run: true }, { timeout: 120000 });
        if (!r.ok) return showErrors(r, file.name);
        out.innerHTML = `<div class="imp-ok"><h3>${Icon('check')} Your file is valid</h3>${counts(r.rows, r.rows, 0)}
          <p><b>${nf(r.to_add)}</b> new ${r.to_add === 1 ? 'item' : 'items'} will be added and <b>${nf(r.to_update)}</b> existing ${r.to_update === 1 ? 'item' : 'items'} will be updated${r.new_categories.length ? `. New ${r.new_categories.length === 1 ? 'category' : 'categories'}: ${r.new_categories.slice(0, 8).map(esc).join(', ')}${r.new_categories.length > 8 ? '…' : ''}` : ''}.</p>
          <div class="toolbar"><button type="button" class="btn btn-primary" data-go>Import ${plural(r.rows, 'item')}</button></div></div>`;
        $('[data-go]', out).onclick = async ev => {
          busy(ev.currentTarget, true, 'Importing…'); stop(true);
          progress(`Saving ${plural(rows.length, 'item')}. This is all-or-nothing, so please wait…`, null);
          try {
            const res = await Cloud.rpc('shop_items_import_csv', { p_rows: rows, p_columns: head, p_dry_run: false }, { timeout: 180000 });
            if (!res.ok) return showErrors(res, file.name);            // the data changed while you were checking
            await Store.loadItems(true).catch(() => {}); q = ''; cat = 'All'; page = 1; $('#iQ', root) && ($('#iQ', root).value = ''); render();
            out.innerHTML = `<div class="imp-ok"><h3>${Icon('check')} Import complete</h3>${counts(res.rows, res.added + res.updated, 0, 'Imported')}
              <p><b>${nf(res.added)}</b> added · <b>${nf(res.updated)}</b> updated · you now have <b>${nf(res.items_total)}</b> items. They are ready in Billing.</p><div class="toolbar"><button type="button" class="btn btn-primary" data-close>Done</button></div></div>`;
            toast(`Import done: ${nf(res.added)} added, ${nf(res.updated)} updated.`, 'ok');
          } catch (ex) {
            out.innerHTML = `<div class="imp-fail" role="alert"><h3>${Icon('alert')} Import did not finish</h3><p>${esc(ex.message)}</p><p>An import is all-or-nothing, so nothing was saved halfway. Check the item count on the Items page. If items are missing, choose the file again — importing the same file twice never creates duplicates.</p></div>`;
            await Store.loadItems(true).catch(() => {});
          } finally { stop(false); }
        };
      } catch (ex) {
        out.innerHTML = `<div class="imp-fail" role="alert"><h3>${Icon('alert')} CSV Import Failed</h3><p>${esc(ex.message)}</p><p>No items were imported.</p></div>`;
      } finally { stop(false); }
    };
  }

  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Items</h1><p class="sub">Everything you sell. Edit any detail, import a list, or tidy up in bulk.</p></div>
        <div class="head-actions"><button type="button" class="btn" id="iCats">Categories</button><button type="button" class="btn" id="iImp">${Icon('upload')} Import</button><button type="button" class="btn" id="iExp">${Icon('download')} Export</button><button type="button" class="btn btn-danger-ghost" id="iWipe" hidden>${Icon('trash')} Delete all items</button><button type="button" class="btn btn-primary" id="iNew">${Icon('plus')} Add item</button></div></header>
      <div class="kpis kpis-s" id="iStats"></div>
      <div class="filters">
        <label class="search sm">${Icon('search')}<input id="iQ" type="search" placeholder="Search name, code or alias" value="${esc(q)}" aria-label="Search items"></label>
        <select id="iCat" aria-label="Category"></select>
        <div class="seg" id="iShow"><button type="button" data-s="active">For sale</button><button type="button" data-s="hidden">Hidden</button><button type="button" data-s="all">All</button></div>
      </div>
      <div class="sel-bar"><label class="check"><input type="checkbox" id="iSelPage"><span>Select this page</span></label><div class="bulkbar" id="iBulk" hidden></div></div>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Item</th><th>Category</th><th class="num">Price</th><th class="num">Cost</th><th class="num" id="iStockTh">Stock</th><th>Status</th><th></th></tr></thead><tbody id="iBody"></tbody></table></div>
      <div class="pager pager-wide" id="iPager"></div>
    </div>`;
    $$('#iShow button', view).forEach(b => b.classList.toggle('on', b.dataset.s === show));
    $('#iShow', view).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; show = b.dataset.s; page = 1; $$('#iShow button', view).forEach(x => x.classList.toggle('on', x === b)); render(); };
    $('#iQ', view).oninput = e => { q = e.target.value; page = 1; clearTimeout(qTimer); qTimer = setTimeout(render, 120); };
    $('#iCat', view).onchange = e => { cat = e.target.value; page = 1; render(); };
    $('#iNew', view).onclick = () => editor();
    $('#iCats', view).onclick = categories;
    $('#iImp', view).onclick = importCSV;
    $('#iExp', view).onclick = exportCSV;
    $('#iWipe', view).onclick = deleteAll;
    $('#iSelPage', view).onchange = e => {
      const rows = list(), slice = rows.slice((page - 1) * pageSize, page * pageSize);
      slice.forEach(i => e.target.checked ? selected.add(i.id) : selected.delete(i.id));
      $$('#iBody tr[data-id]', view).forEach(tr => { const on = selected.has(tr.dataset.id); tr.classList.toggle('is-selected', on); const c = $('[data-sel]', tr); if (c) c.checked = on; });
      renderBulk(rows, slice);
    };
    $('#iBulk', view).addEventListener('click', e => {
      if (e.target.closest('[data-selnone]')) { selected.clear(); render(); }
      else if (e.target.closest('[data-selall]')) { list().forEach(i => selected.add(i.id)); render(); }
      else if (e.target.closest('[data-bulkdel]')) deleteSelected();
    });
    $('#iPager', view).addEventListener('click', e => { const b = e.target.closest('[data-pg]'); if (!b) return; page += Number(b.dataset.pg); render(); view.querySelector('.table-wrap').scrollIntoView({ block: 'nearest' }); });
    $('#iPager', view).addEventListener('change', e => { if (e.target.id === 'iSize') { pageSize = Number(e.target.value) || 50; page = 1; render(); } });
    const body = $('#iBody', view), find = tr => Store.items.find(i => i.id === tr.dataset.id);
    body.addEventListener('change', e => {
      const c = e.target.closest('[data-sel]'); if (!c) return; const tr = c.closest('tr');
      c.checked ? selected.add(tr.dataset.id) : selected.delete(tr.dataset.id); tr.classList.toggle('is-selected', c.checked); renderBulk();
    });
    body.addEventListener('click', e => {
      if (e.target.closest('[data-new]')) return editor();
      if (e.target.closest('.sel-wrap')) return;
      const tr = e.target.closest('tr[data-id]'); if (!tr) return; const item = find(tr); if (!item) return;
      if (e.target.closest('[data-del-item]')) deleteOne(item); else editor(item);
    });
    body.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('button, input')) { const tr = e.target.closest('tr[data-id]'); if (tr) editor(find(tr)); } });
    render();
    Store.loadItems(true).then(render).catch(e => toast(e.message, 'error'));
  }
  document.addEventListener('items:changed', render);
  return { mount, editor, unmount() { root = null; } };
})();
