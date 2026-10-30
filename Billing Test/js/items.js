/* Items: the things the shop sells. Add, edit, hide, import and export. */
'use strict';
const Items = (() => {
  const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'pack', 'box', 'dozen', 'm', 'pair', 'set', 'bottle', 'strip'];
  let q = '', cat = 'All', show = 'active', root = null;

  function list() {
    const s = q.trim().toLowerCase();
    return Store.items.filter(i => (cat === 'All' || i.category === cat) && (show === 'all' || (show === 'active' ? i.active : !i.active))
      && (!s || i.name.toLowerCase().includes(s) || (i.code || '').toLowerCase().includes(s)));
  }

  function render() {
    if (!root?.isConnected) return;
    const rows = list();
    const sel = $('#iCat', root), prev = sel.value;
    sel.innerHTML = `<option value="All">All categories</option>` + Store.categories.map(c => `<option ${c === prev ? 'selected' : ''}>${esc(c)}</option>`).join('');
    if (!Store.categories.includes(cat)) cat = 'All';
    sel.value = cat;
    const active = Store.items.filter(i => i.active).length;
    $('#iCount', root).textContent = `${Store.items.length} item${Store.items.length === 1 ? '' : 's'} · ${active} for sale · ${Store.categories.length} categories`;
    $('#iBody', root).innerHTML = rows.length ? rows.map(i => {
      const margin = i.cost_price != null && Number(i.price) > 0 ? (Number(i.price) - Number(i.cost_price)) / Number(i.price) * 100 : null;
      return `<tr data-id="${esc(i.id)}" tabindex="0" class="${i.active ? '' : 'is-muted'}">
        <td><b>${esc(i.name)}</b>${i.code ? `<small class="mono">${esc(i.code)}</small>` : ''}</td>
        <td>${esc(i.category)}</td>
        <td class="num"><b>${Fmt.money(i.price)}</b><small>per ${esc(i.unit)}</small></td>
        <td class="num">${i.cost_price != null ? Fmt.money(i.cost_price) + `<small>${margin.toFixed(0)}% margin</small>` : '<span class="muted">—</span>'}</td>
        <td class="num">${i.track_stock ? `<span class="${Number(i.stock) <= 0 ? 'neg' : Number(i.stock) <= Number(i.low_stock_at) ? 'warn' : ''}">${Fmt.qty(i.stock)}</span> <small>${esc(i.unit)}</small>` : '<span class="muted">Not tracked</span>'}</td>
        <td>${i.active ? '<span class="badge badge-green">For sale</span>' : '<span class="badge">Hidden</span>'}</td>
        <td class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-edit>Edit</button></td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty"><h3>${Store.items.length ? 'No items match' : 'Add your first item'}</h3><p>${Store.items.length ? 'Change the search or filters.' : 'Add items one by one, or import a CSV list from Excel.'}</p>${Store.items.length ? '' : `<button type="button" class="btn btn-primary" data-new>${Icon('plus')} Add item</button>`}</div></td></tr>`;
  }

  function editor(item = null) {
    const i = item || { name: '', code: '', category: cat !== 'All' ? cat : 'General', unit: 'pcs', price: '', cost_price: null, active: true, track_stock: false, stock: 0, low_stock_at: 0 };
    const d = modal(item ? 'Edit item' : 'Add item', `<form id="itForm" class="form-grid">
      <label class="field span-2"><span>Item name</span><input name="name" required maxlength="120" value="${esc(i.name)}" autocomplete="off" placeholder="e.g. Tata Salt 1 kg"></label>
      <label class="field"><span>Barcode / code <em>optional</em></span><div class="joined"><input name="code" maxlength="60" value="${esc(i.code || '')}" autocomplete="off" placeholder="Scan or type"><button type="button" class="btn" data-gen title="Make a short code">Make code</button></div></label>
      <label class="field"><span>Category</span><input name="category" list="catList" maxlength="60" value="${esc(i.category)}" required autocomplete="off"><datalist id="catList">${Store.categories.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="field"><span>Selling price (${esc(Fmt.cur())})</span><input name="price" type="number" min="0" max="9999999" step="0.01" inputmode="decimal" required value="${i.price === '' ? '' : Number(i.price)}"></label>
      <label class="field"><span>Sold per (unit)</span><input name="unit" list="unitList" maxlength="12" required value="${esc(i.unit)}"><datalist id="unitList">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist></label>
      <label class="field"><span>Cost price <em>optional, for profit</em></span><input name="cost_price" type="number" min="0" max="9999999" step="0.01" inputmode="decimal" value="${i.cost_price == null ? '' : Number(i.cost_price)}"></label>
      <label class="check"><input type="checkbox" name="active" ${i.active ? 'checked' : ''}><span>Show in billing</span></label>
      <fieldset class="span-2 sub-box"><label class="check"><input type="checkbox" name="track_stock" ${i.track_stock ? 'checked' : ''}><span>Track stock for this item</span></label>
        <div class="form-grid" data-stock ${i.track_stock ? '' : 'hidden'}>
          ${item ? `<div class="field"><span>In stock now</span><p class="static">${Fmt.qty(i.stock)} ${esc(i.unit)} <a class="linkish" href="#/stocks">Change in Stocks</a></p></div>` : `<label class="field"><span>Opening stock</span><input name="stock" type="number" step="any" min="0" inputmode="decimal" value="0"></label>`}
          <label class="field"><span>Warn when stock is at or below</span><input name="low_stock_at" type="number" step="any" min="0" inputmode="decimal" value="${Number(i.low_stock_at) || 0}"></label>
        </div></fieldset>
      <p class="form-error span-2" role="alert" hidden></p>
      <div class="modal-actions span-2">${item ? `<button type="button" class="btn btn-danger-ghost" data-delete>${Icon('trash')} Delete</button>` : ''}<span class="grow"></span><button type="button" class="btn btn-ghost" data-close>Cancel</button>${item ? '' : '<button type="submit" class="btn" name="again" value="1">Save & add another</button>'}<button type="submit" class="btn btn-primary">Save item</button></div>
    </form>`, { size: 'modal-md' });
    const form = $('#itForm', d), err = $('.form-error', d);
    $('[name=name]', d).focus();
    $('[name=track_stock]', d).onchange = e => { $('[data-stock]', d).hidden = !e.target.checked; };
    $('[data-gen]', d).onclick = () => { $('[name=code]', d).value = String(Date.now()).slice(-7) + Math.floor(Math.random() * 10); };
    $('[data-delete]', d)?.addEventListener('click', async () => {
      if (!(await ask({ title: `Delete ${i.name}?`, body: 'Old bills keep this item’s name and price. To stop selling it but keep it for later, untick “Show in billing” instead.', confirm: 'Delete item', danger: true }))) return;
      try { await Cloud.rpc('shop_item_delete', { p_id: i.id }); Store.items = Store.items.filter(x => x.id !== i.id); document.dispatchEvent(new CustomEvent('items:changed')); toast(`${i.name} deleted.`, 'ok'); d.close(); }
      catch (e) { toast(e.message, 'error'); }
    });
    form.onsubmit = async e => {
      e.preventDefault(); err.hidden = true;
      const again = e.submitter?.name === 'again';
      const fd = new FormData(form), btn = e.submitter;
      const p = { id: item?.id || null, name: fd.get('name').trim(), code: fd.get('code').trim(), category: fd.get('category').trim() || 'General', unit: fd.get('unit').trim() || 'pcs',
        price: String(Number(fd.get('price'))), cost_price: fd.get('cost_price') === '' ? '' : String(Number(fd.get('cost_price'))), active: fd.get('active') === 'on',
        track_stock: fd.get('track_stock') === 'on', low_stock_at: String(Number(fd.get('low_stock_at') || 0)), stock: item ? undefined : String(Number(fd.get('stock') || 0)) };
      busy(btn, true, 'Saving…');
      try {
        const saved = await Cloud.rpc('shop_item_save', { p });
        Store.upsertItem(saved); toast(`${saved.name} saved.`, 'ok');
        if (again) { form.reset(); $('[name=category]', d).value = saved.category; $('[name=unit]', d).value = saved.unit; $('[name=active]', d).checked = true; $('[data-stock]', d).hidden = true; $('[name=name]', d).focus(); }
        else d.close();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
      finally { busy(btn, false); }
    };
  }

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

  const HEAD = ['name', 'code', 'category', 'unit', 'price', 'cost_price', 'stock', 'low_stock_at'];
  function exportCSV() {
    downloadFile('items.csv', toCSV([HEAD, ...Store.items.map(i => [i.name, i.code || '', i.category, i.unit, i.price, i.cost_price ?? '', i.track_stock ? i.stock : '', i.track_stock ? i.low_stock_at : ''])]));
  }
  function importCSV() {
    const d = modal('Import items from CSV', `<p>Use a CSV file (Excel → Save As → CSV) with these column names in the first row:</p>
      <p class="mono small">${HEAD.join(', ')}</p>
      <ul class="hint-list"><li><b>name</b> and <b>price</b> are needed. Other columns can be blank.</li><li>An item with the same code (or same name) is updated instead of added twice.</li><li>A number in <b>stock</b> sets the stock count and turns on stock tracking.</li></ul>
      <div class="toolbar"><button type="button" class="btn" data-tpl>${Icon('download')} Download template</button><label class="btn btn-primary file-btn">${Icon('upload')} Choose CSV file<input type="file" accept=".csv,text/csv" hidden></label></div>
      <div id="impPreview"></div>`, { size: 'modal-md' });
    $('[data-tpl]', d).onclick = () => downloadFile('items-template.csv', toCSV([HEAD, ['Tata Salt 1kg', '8904043901015', 'Grocery', 'pcs', '28', '24', '40', '10'], ['Sugar (loose)', '', 'Grocery', 'kg', '44', '40', '25', '5']]));
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
      <div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Category</th><th class="num">Price</th><th class="num">Cost</th><th class="num">Stock</th><th>Status</th><th></th></tr></thead><tbody id="iBody"></tbody></table></div>
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
