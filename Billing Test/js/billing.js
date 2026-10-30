/* Billing counter: search/scan items, build the bill, take payment, print. */
'use strict';
const Billing = (() => {
  const PENDING_KEY = () => 'SHOPBILL_PENDING:' + Cloud.cfg.supabaseUrl + ':' + Cloud.userEmail;
  let cart = [], payment = 'Cash', discount = { mode: 'percent', value: '' }, customer = { name: '', phone: '' }, notes = '', received = '';
  let category = 'All', query = '', highlight = 0, saving = false, pending = null, lastBill = null, showExtras = false, root = null;

  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY()) || 'null'); } catch { pending = null; }
  if (pending) ({ cart, payment, discount, customer, notes, received = '' } = pending.state);

  const cents = v => Math.round((Number(v) || 0) * 100);
  function lineCents(l) { return Math.round(Math.round(Number(l.qty) * 1000) * cents(l.price) / 1000); }
  const cashOn = () => payment === 'Cash' && Store.feature('cash_received');

  /* Same arithmetic as the server, so the screen always matches the saved bill. */
  function totals() {
    const s = Store.settings, sys = Store.sys;
    const sub = cart.reduce((a, l) => a + lineCents(l), 0);
    let disc = 0; const dv = Number(discount.value) || 0;
    if (dv > 0 && Store.can('discount')) disc = discount.mode === 'percent' ? Math.round(sub * Math.round(Math.min(dv, 100) * 100) / 10000) : Math.min(cents(dv), sub);
    const taxable = sub - disc;
    let tax = 0;
    if (s.tax_enabled) tax = s.tax_mode === 'percent' ? Math.round(taxable * Math.round(Number(s.tax_value) * 100) / 10000) : (taxable > 0 ? cents(s.tax_value) : 0);
    const gross = taxable + tax, total = s.round_off ? Math.round(gross / 100) * 100 : gross;
    const rec = cashOn() ? cents(received) : 0;
    let less = 0, shortBlocked = '';
    if (rec > 0 && rec < total) {
      const max = cents(sys.limits?.max_short_amount ?? 0);
      if (!Store.can('short_cash')) shortBlocked = 'Collect the full amount.';
      else if (!Store.isAdmin && total - rec > max) shortBlocked = `You can accept at most ${Fmt.money(max / 100)} less.`;
      else less = total - rec;
    }
    const final = total - less;
    return { sub: sub / 100, disc: disc / 100, tax: tax / 100, round: (total - gross) / 100, total: total / 100, less: less / 100, final: final / 100,
             rec: rec / 100, change: rec > final ? (rec - final) / 100 : 0, short: rec > 0 && rec < total ? (total - rec) / 100 : 0, shortBlocked,
             qty: cart.reduce((a, l) => a + Number(l.qty), 0) };
  }

  function persistPending() { try { pending ? localStorage.setItem(PENDING_KEY(), JSON.stringify(pending)) : localStorage.removeItem(PENDING_KEY()); } catch { /* ignore */ } }
  const locked = () => saving || !!pending;

  /* ---------- catalog ---------- */
  function matches() {
    const q = query.trim().toLowerCase();
    let list = Store.items.filter(i => i.active);
    if (category !== 'All') list = list.filter(i => i.category === category);
    if (q) {
      const scored = [];
      for (const i of list) {
        const name = i.name.toLowerCase(), code = (i.code || '').toLowerCase();
        let score = -1;
        if (code && code === q) score = 0; else if (name.startsWith(q)) score = 1; else if (code.startsWith(q)) score = 2;
        else if (name.split(/\s+/).some(w => w.startsWith(q))) score = 3; else if (name.includes(q)) score = 4;
        if (score >= 0) scored.push([score, i]);
      }
      list = scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(x => x[1]);
    }
    return list;
  }
  const outOfStock = i => i.track_stock && Number(i.stock) <= 0 && !Store.settings.allow_negative_stock;
  function stockBadge(i) {
    if (!i.track_stock || !Store.feature('stock_badges')) return '';
    const n = Number(i.stock);
    if (n <= 0) return '<span class="badge badge-red">Out of stock</span>';
    if (n <= Number(i.low_stock_at)) return `<span class="badge badge-amber">${Fmt.qty(n)} left</span>`;
    return `<span class="stock-note">${Fmt.qty(n)} ${esc(i.unit)}</span>`;
  }
  function inCart(id) { return cart.filter(l => l.id === id && !l.custom).reduce((a, l) => a + Number(l.qty), 0); }
  function renderCatalog() {
    if (!root?.isConnected) return;
    const list = matches(), shown = list.slice(0, 120), codes = Store.feature('item_codes_on_tiles'), badges = Store.feature('qty_badges');
    if (highlight >= shown.length) highlight = Math.max(0, shown.length - 1);
    const cats = ['All', ...Store.categories.filter(c => Store.items.some(i => i.active && i.category === c))];
    $('#bCats', root).innerHTML = cats.map(c => `<button type="button" class="chip ${c === category ? 'on' : ''}" data-cat="${esc(c)}">${esc(c === 'All' ? 'All items' : c)}</button>`).join('');
    const grid = $('#bGrid', root);
    if (!Store.items.length) {
      grid.innerHTML = `<div class="empty"><h3>No items yet</h3><p>${Store.can('items') ? 'Add the things you sell in <a href="#/items">Items</a>.' : 'Ask the owner to add items.'}</p></div>`;
    } else if (!list.length) {
      grid.innerHTML = `<div class="empty"><h3>No match for “${esc(query)}”</h3><p>Check the spelling or code${Store.feature('extra_items') ? ', or add it as an extra item (Alt+X)' : ''}.</p></div>`;
    } else {
      grid.innerHTML = shown.map((i, n) => {
        const q = badges ? inCart(i.id) : 0;
        return `<button type="button" class="tile ${n === highlight && query ? 'hl' : ''} ${outOfStock(i) && !q ? 'off' : ''} ${q ? 'in-bill' : ''}" data-add="${esc(i.id)}" ${outOfStock(i) ? 'aria-disabled="true"' : ''} aria-label="${esc(i.name)}${q ? ', ' + Fmt.qty(q) + ' on bill' : ''}">
        ${q ? `<span class="tile-qty" aria-hidden="true">×${Fmt.qty(q)}</span>` : ''}
        <span class="tile-name">${esc(i.name)}</span>
        ${codes && i.code ? `<span class="tile-code">${esc(i.code)}</span>` : ''}
        <span class="tile-foot"><b>${Fmt.money(i.price)}</b><small>/${esc(i.unit)}</small>${stockBadge(i)}</span></button>`;
      }).join('') + (list.length > shown.length ? `<p class="grid-more">Showing 120 of ${list.length}. Type more of the name to narrow down.</p>` : '');
    }
  }

  function add(item, qty = 1) {
    if (locked()) return toast('Finish saving the current bill first.', 'warn');
    if (outOfStock(item)) return toast(`${item.name} is out of stock.`, 'warn');
    lastBill = null;
    const l = cart.find(x => x.id === item.id && !x.custom);
    if (l) { l.qty = +(Number(l.qty) + qty).toFixed(3); cart.splice(cart.indexOf(l), 1); cart.unshift(l); }
    else cart.unshift({ key: crypto.randomUUID(), id: item.id, name: item.name, unit: item.unit, price: Number(item.price), qty, code: item.code || '' });
    if (item.track_stock && !Store.settings.allow_negative_stock) {
      const line = cart.find(x => x.id === item.id && !x.custom);
      if (line.qty > Number(item.stock)) { line.qty = Number(item.stock); toast(`Only ${Fmt.qty(item.stock)} ${item.unit} of ${item.name} in stock.`, 'warn'); }
    }
    renderTicket(cart[0].key);
  }

  async function addExtra() {
    if (locked() || !Store.feature('extra_items')) return;
    const d = modal('Add extra item', `<form id="xForm" class="form-grid">
      <label class="field span-2"><span>Item name</span><input name="name" required maxlength="120" placeholder="e.g. Carry bag" autocomplete="off"></label>
      <label class="field"><span>Price (${esc(Fmt.cur())})</span><input name="price" required type="number" min="0.01" max="9999999" step="0.01" inputmode="decimal"></label>
      <label class="field"><span>Quantity</span><input name="qty" required type="number" min="0.001" max="999999" step="any" value="1" inputmode="decimal"></label>
      <p class="hint span-2">Only added to this bill. It is not saved in Items and does not change stock.</p>
      <div class="modal-actions span-2"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Add to bill</button></div></form>`, { size: 'modal-sm' });
    $('[name=name]', d).focus();
    $('#xForm', d).onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target);
      lastBill = null;
      cart.unshift({ key: crypto.randomUUID(), id: null, custom: true, name: String(f.get('name')).trim(), unit: 'pcs', price: Math.round(Number(f.get('price')) * 100) / 100, qty: Number(f.get('qty')) });
      d.close(); renderTicket(cart[0].key); focusSearch();
    };
  }

  /* ---------- ticket (the bill) ---------- */
  function renderTicket(flashKey) {
    if (!root?.isConnected) return;
    const t = totals(), s = Store.settings, lock = locked(), L = Receipt.labels();
    const lines = $('#tLines', root);
    lines.innerHTML = cart.length ? cart.map(l => `<li class="tl ${l.key === flashKey ? 'flash' : ''}" data-key="${esc(l.key)}">
        <div class="tl-name">${esc(l.name)}${l.custom ? '<em>extra</em>' : ''}<small>${Fmt.money(l.price)} / ${esc(l.unit)}</small></div>
        <div class="tl-qty"><button type="button" class="qbtn" data-dec aria-label="Less" ${lock ? 'disabled' : ''}>${Icon('minus')}</button><input type="number" inputmode="decimal" step="any" min="0" value="${Number(l.qty)}" aria-label="Quantity of ${esc(l.name)}" data-qty ${lock ? 'disabled' : ''}><button type="button" class="qbtn" data-inc aria-label="More" ${lock ? 'disabled' : ''}>${Icon('plus')}</button></div>
        <div class="tl-amt">${Fmt.nf2.format(lineCents(l) / 100)}</div>
        <button type="button" class="tl-del" data-del aria-label="Remove ${esc(l.name)}" ${lock ? 'disabled' : ''}>${Icon('x')}</button></li>`).join('')
      : `<li class="t-empty">${lastBill ? `<b>Ready for the next customer.</b>` : '<b>Bill is empty.</b>'}<span>Scan a barcode, type a name and press Enter, or tap an item.</span></li>`;
    if (flashKey) lines.scrollTop = 0;

    $('#tCount', root).textContent = cart.length ? `${cart.length} line${cart.length === 1 ? '' : 's'} · Qty ${Fmt.qty(t.qty)}` : '';
    $('#tSums', root).innerHTML = `
      <div class="ts"><span>${esc(L.subtotal)}</span><span>${Fmt.nf2.format(t.sub)}</span></div>
      ${t.disc ? `<div class="ts"><span>${esc(L.discount)}</span><span>−${Fmt.nf2.format(t.disc)}</span></div>` : ''}
      ${s.tax_enabled ? `<div class="ts"><span>${esc(s.tax_label || 'Tax')}${s.tax_mode === 'percent' ? ' ' + Number(s.tax_value) + '%' : ''}</span><span>${Fmt.nf2.format(t.tax)}</span></div>` : ''}
      ${t.round ? `<div class="ts"><span>${esc(L.round_off)}</span><span>${t.round > 0 ? '+' : ''}${Fmt.nf2.format(t.round)}</span></div>` : ''}
      ${t.less ? `<div class="ts ts-less"><span>${esc(L.less)}</span><span>−${Fmt.nf2.format(t.less)}</span></div>` : ''}
      <div class="ts ts-grand"><span>${esc(L.total_screen)}</span><span>${Fmt.money(t.final)}</span></div>`;

    const methods = Store.payments();
    if (!methods.includes(payment)) payment = methods[0] || 'Cash';
    for (const b of $$('[data-pay]', root)) { b.classList.toggle('on', b.dataset.pay === payment); b.setAttribute('aria-pressed', b.dataset.pay === payment); b.disabled = lock; }
    $('#tCash', root).hidden = !cashOn() || !cart.length;
    $('#tChange', root).innerHTML = !t.rec ? '' : t.short
      ? (t.shortBlocked ? `<span class="neg">Short by ${Fmt.money(t.short)}. ${esc(t.shortBlocked)}</span>` : `<span class="short-ok">Short by ${Fmt.money(t.short)} — bill will be <b>${Fmt.money(t.final)}</b></span>`)
      : `Return <b>${Fmt.money(t.change)}</b>`;
    $('#tDiscRow', root).hidden = !Store.can('discount');
    for (const el of $$('#tDiscMode, #tDiscVal, #tCustName, #tCustPhone, #tNotes, #tReceived, #tExtra', root)) el.disabled = lock;
    const custOn = Store.feature('customer_details'), notesOn = Store.feature('notes');
    $('#tCustName', root).hidden = $('#tCustPhone', root).hidden = !custOn;
    $('#tNotes', root).hidden = !notesOn;
    const tog = $('#tCustToggle', root); tog.hidden = !custOn && !notesOn;
    $('#tCust', root).hidden = !showExtras;
    const word = custOn && notesOn ? 'customer / note' : custOn ? 'customer' : 'note';
    tog.textContent = showExtras ? `Hide ${word}` : (customer.phone || customer.name || notes ? `Edit ${word}` : `+ Add ${word}`);
    $('#tExtra', root).hidden = !Store.feature('extra_items');

    const canSave = !saving && (pending || cart.length > 0);
    $('#tSave', root).disabled = !canSave; $('#tPrint', root).disabled = !canSave;
    $('#tSave', root).innerHTML = saving ? 'Saving…' : pending ? 'Retry save' : 'Save <kbd>F8</kbd>';
    $('#tPrint', root).innerHTML = saving ? 'Saving…' : pending ? `${Icon('printer')} Retry & print` : `${Icon('printer')} Save & print <kbd>F9</kbd>`;
    $('#tClear', root).disabled = lock || !cart.length;
    $('#tPending', root).hidden = !pending;

    const done = $('#tDone', root);
    done.hidden = !lastBill;
    if (lastBill) done.innerHTML = `<div class="done-text">${Icon('check')}<span><b>${esc(lastBill.bill_no)}</b> saved · ${Fmt.money(lastBill.total)} · ${esc(lastBill.payment_method)}${Number(lastBill.change_amount) > 0 ? ` · return ${Fmt.money(lastBill.change_amount)}` : ''}</span></div>
      <div class="done-actions"><button type="button" class="btn btn-sm" data-reprint>${Icon('printer')} Print</button>${Store.feature('whatsapp') ? `<button type="button" class="btn btn-sm" data-wa>${Icon('whatsapp')} WhatsApp</button>` : ''}<button type="button" class="btn btn-sm btn-ghost" data-view>View</button></div>`;

    $('#mTotal', root).textContent = Fmt.money(t.final);
    $('#mCount', root).textContent = cart.length ? `${cart.length} line${cart.length === 1 ? '' : 's'} · Qty ${Fmt.qty(t.qty)}` : 'Empty bill';
    renderCatalog();
  }

  function setQty(key, value) {
    const l = cart.find(x => x.key === key); if (!l || locked()) return;
    let q = Math.round(Number(value) * 1000) / 1000;
    if (!Number.isFinite(q) || q < 0) q = 1;
    if (q === 0) { cart = cart.filter(x => x !== l); renderTicket(); return; }
    const item = l.id && Store.items.find(i => i.id === l.id);
    if (item?.track_stock && !Store.settings.allow_negative_stock && q > Number(item.stock)) { q = Number(item.stock); toast(`Only ${Fmt.qty(item.stock)} ${item.unit} of ${item.name} in stock.`, 'warn'); }
    l.qty = q; renderTicket();
  }

  function resetBill() { cart = []; discount = { mode: discount.mode, value: '' }; customer = { name: '', phone: '' }; notes = ''; received = ''; showExtras = false; }
  async function clearBill() {
    if (locked() || !cart.length) return;
    if (cart.length > 1 && !(await ask({ title: 'Clear this bill?', body: 'All lines on the current bill will be removed.', confirm: 'Clear bill', danger: true }))) return;
    resetBill(); syncInputs(); renderTicket(); focusSearch();
  }

  function syncInputs() {
    $('#tDiscMode', root).value = discount.mode; $('#tDiscVal', root).value = discount.value;
    $('#tCustName', root).value = customer.name; $('#tCustPhone', root).value = customer.phone; $('#tNotes', root).value = notes;
    $('#tReceived', root).value = received;
  }

  /* ---------- save ---------- */
  async function save(andPrint) {
    if (saving) return;
    if (!pending) {
      if (!cart.length) return;
      const t = totals();
      if (t.shortBlocked) { $('#tReceived', root)?.focus(); return toast(`Cash is short by ${Fmt.money(t.short)}. ${t.shortBlocked}`, 'warn', 5000); }
      const items = cart.map(l => l.custom ? { custom: true, name: l.name, price: l.price.toFixed(2), qty: String(l.qty), unit: l.unit } : { id: l.id, name: l.name, qty: String(l.qty) }).reverse();
      const dv = Store.can('discount') ? Number(discount.value) || 0 : 0, custOn = Store.feature('customer_details');
      pending = {
        args: { p_request_id: crypto.randomUUID(), p_items: items, p_payment_method: payment, p_discount_mode: dv > 0 ? discount.mode : null, p_discount_value: dv > 0 ? dv : 0,
          p_customer_name: custOn ? customer.name.trim() : '', p_customer_phone: custOn ? customer.phone.trim() : '', p_notes: Store.feature('notes') ? notes.trim() : '',
          p_expected_total: t.final, p_cash_received: t.rec > 0 ? t.rec : null },
        state: { cart, payment, discount, customer, notes, received }
      };
      persistPending();
    }
    saving = true; renderTicket();
    try {
      const bill = await Cloud.rpc('shop_create_bill', pending.args);
      pending = null; persistPending();
      lastBill = bill; resetBill(); payment = Store.payments()[0] || 'Cash';
      syncInputs(); toast(`${bill.bill_no} saved · ${Fmt.money(bill.total)}${Number(bill.change_amount) > 0 ? ' · return ' + Fmt.money(bill.change_amount) : ''}`, 'ok');
      document.body.classList.remove('sheet-open');
      if (andPrint) Receipt.print(bill);
      Store.applyStockUpdates(bill.stock_updates);
    } catch (e) {
      if (e.code === 'NETWORK' || !e.status || e.status >= 500) {
        toast('Not saved yet: ' + e.message + ' Press Retry save — it will not create a double bill.', 'error', 7000);
      } else {
        // The server refused the bill (stock, price, permission). Unlock it so it can be fixed.
        pending = null; persistPending();
        toast(e.message, 'error', 7000);
        if (/stock|no longer for sale|Prices/i.test(e.message)) Store.loadItems(true).catch(() => {});
        if (/payment method|permission|allowed|turned off/i.test(e.message)) App.refreshMe().then(() => renderTicket()).catch(() => {});
      }
    } finally { saving = false; renderTicket(); }
  }

  /* ---------- keyboard ---------- */
  function focusSearch() { const s = $('#bSearch', root); if (s && matchMedia('(pointer:fine)').matches) { s.focus(); s.select(); } }
  function onKey(e) {
    if (!root?.isConnected || $('dialog[open]')) return;
    if (e.key === 'F2') { e.preventDefault(); focusSearch(); }
    else if (e.key === 'F8') { e.preventDefault(); save(false); }
    else if (e.key === 'F9') { e.preventDefault(); save(true); }
    else if (e.key === 'F4') { e.preventDefault(); if (!locked()) { const m = Store.payments(); payment = m[(m.indexOf(payment) + 1) % m.length]; renderTicket(); } }
    else if (e.altKey && e.key.toLowerCase() === 'x') { e.preventDefault(); addExtra(); }
    else if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); clearBill(); }
  }

  /* ---------- mount ---------- */
  function mount(view) {
    root = view;
    const methods = Store.payments();
    if (!methods.includes(payment)) payment = methods[0] || 'Cash';
    view.innerHTML = `<div class="billing">
      <section class="catalog" aria-label="Items">
        <div class="catalog-bar">
          <label class="search">${Icon('search')}<input id="bSearch" type="search" placeholder="Scan barcode or type item name or code" autocomplete="off" aria-label="Search items"><kbd>F2</kbd></label>
          <button type="button" class="btn" id="tExtra">${Icon('plus')} <span>Extra item</span></button>
        </div>
        <div class="chips" id="bCats" role="toolbar" aria-label="Categories"></div>
        <div class="grid" id="bGrid"></div>
      </section>
      <aside class="ticket" id="ticket" aria-label="Current bill">
        <button type="button" class="sheet-close" id="sheetClose">${Icon('x')} Back to items</button>
        <div class="t-done" id="tDone" hidden></div>
        <div class="paper">
          <div class="paper-head"><span>Current bill</span><span id="tCount"></span></div>
          <ul class="t-lines" id="tLines"></ul>
          <div class="t-sums" id="tSums"></div>
        </div>
        <div class="t-controls">
          <div class="t-row" id="tDiscRow"><label for="tDiscVal">Discount</label><div class="joined"><input id="tDiscVal" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"><select id="tDiscMode" aria-label="Discount type"><option value="percent">%</option><option value="amount">${esc(Fmt.cur())}</option></select></div></div>
          <button type="button" class="linkish" id="tCustToggle"></button>
          <div class="t-cust" id="tCust" hidden>
            <input id="tCustName" maxlength="80" placeholder="Customer name" autocomplete="off" aria-label="Customer name">
            <input id="tCustPhone" maxlength="20" inputmode="tel" placeholder="Phone" autocomplete="off" aria-label="Customer phone">
            <input id="tNotes" class="span-2" maxlength="300" placeholder="Note on bill (optional)" aria-label="Note on bill">
          </div>
          <div class="pay" role="group" aria-label="Payment method" style="--n:${methods.length}">${methods.map(v => `<button type="button" data-pay="${v}">${v}</button>`).join('')}</div>
          <div class="t-row" id="tCash"><label for="tReceived">Cash received</label><input id="tReceived" type="number" min="0" step="1" inputmode="decimal" placeholder="0"><span class="change" id="tChange"></span></div>
          <p class="t-pending" id="tPending" hidden>This bill did not reach the server yet. Retry saves it once — never twice.</p>
          <div class="t-actions"><button type="button" class="btn btn-ghost" id="tClear" title="Alt+N">Clear</button><button type="button" class="btn" id="tSave"></button><button type="button" class="btn btn-primary btn-lg" id="tPrint"></button></div>
        </div>
      </aside>
      <div class="m-bar"><span><small id="mCount"></small><b id="mTotal"></b></span><button type="button" class="btn btn-primary" id="mOpen">View bill</button></div>
    </div>`;

    const search = $('#bSearch', view);
    search.value = query;
    search.addEventListener('input', () => { query = search.value; highlight = 0; renderCatalog(); });
    search.addEventListener('keydown', e => {
      const shown = matches().slice(0, 120);
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = query.trim().toLowerCase(); if (!q) return;
        const exact = Store.items.find(i => i.active && i.code && i.code.toLowerCase() === q);
        const pick = exact || shown[highlight];
        if (pick) { query = ''; search.value = ''; highlight = 0; add(pick); }
        else toast(`No item matches “${query}”.`, 'warn');
      } else if (e.key === 'ArrowDown') { e.preventDefault(); highlight = Math.min(highlight + 1, shown.length - 1); renderCatalog(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight = Math.max(highlight - 1, 0); renderCatalog(); }
      else if (e.key === 'Escape') { query = ''; search.value = ''; renderCatalog(); }
    });
    $('#bCats', view).addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { category = c.dataset.cat; renderCatalog(); } });
    $('#bGrid', view).addEventListener('click', e => { const t = e.target.closest('[data-add]'); if (!t) return; const item = Store.items.find(i => i.id === t.dataset.add); if (item) add(item); });
    $('#tExtra', view).onclick = addExtra;

    const lines = $('#tLines', view);
    lines.addEventListener('click', e => {
      const li = e.target.closest('[data-key]'); if (!li) return; const l = cart.find(x => x.key === li.dataset.key); if (!l) return;
      if (e.target.closest('[data-inc]')) setQty(l.key, Number(l.qty) + 1);
      else if (e.target.closest('[data-dec]')) setQty(l.key, Math.max(0, Number(l.qty) - 1));
      else if (e.target.closest('[data-del]')) { if (!locked()) { cart = cart.filter(x => x !== l); renderTicket(); } }
    });
    lines.addEventListener('change', e => { const i = e.target.closest('[data-qty]'); if (i) setQty(i.closest('[data-key]').dataset.key, i.value); });
    lines.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-qty]')) { e.target.blur(); focusSearch(); } });

    $('#tDiscVal', view).oninput = e => { discount.value = e.target.value; renderTicket(); };
    $('#tDiscMode', view).onchange = e => { discount.mode = e.target.value; renderTicket(); };
    $('#tCustName', view).oninput = e => { customer.name = e.target.value; };
    $('#tCustPhone', view).oninput = e => { customer.phone = e.target.value; };
    $('#tNotes', view).oninput = e => { notes = e.target.value; };
    $('#tReceived', view).oninput = e => { received = e.target.value; renderTicket(); };
    $('#tCustToggle', view).onclick = () => { showExtras = !showExtras; renderTicket(); if (showExtras) ($('#tCust input:not([hidden])', view))?.focus(); };
    $('.pay', view).addEventListener('click', e => { const b = e.target.closest('[data-pay]'); if (b && !locked()) { payment = b.dataset.pay; renderTicket(); if (cashOn()) $('#tReceived', view).focus(); } });
    $('#tSave', view).onclick = () => save(false);
    $('#tPrint', view).onclick = () => save(true);
    $('#tClear', view).onclick = clearBill;
    $('#tDone', view).addEventListener('click', e => {
      if (!lastBill) return;
      if (e.target.closest('[data-reprint]')) Receipt.print(lastBill);
      else if (e.target.closest('[data-wa]')) Receipt.whatsapp(lastBill);
      else if (e.target.closest('[data-view]')) Records.openBill(lastBill);
    });
    $('#mOpen', view).onclick = () => document.body.classList.add('sheet-open');
    $('#sheetClose', view).onclick = () => document.body.classList.remove('sheet-open');

    syncInputs(); renderTicket();
    Store.loadItems().then(() => { if (root === view) renderCatalog(); }).catch(e => toast(e.message, 'error'));
    setTimeout(focusSearch, 50);
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('items:changed', () => { if (root?.isConnected) renderCatalog(); });
  return { mount, unmount() { root = null; document.body.classList.remove('sheet-open'); } };
})();
