/* Stocks: what is on the shelf, what is running out, and every stock change. */
'use strict';
const Stocks = (() => {
  let tab = 'levels', q = '', cat = 'All', show = 'tracked', root = null, movesOffset = 0, movesItem = null;
  const REASONS = { sale: 'Sold', cancel: 'Bill cancelled', stock_in: 'Stock added', stock_out: 'Stock removed', set: 'Count corrected', opening: 'Opening stock' };

  function rows() {
    const s = q.trim().toLowerCase();
    return Store.items.filter(i => (cat === 'All' || i.category === cat) && (!s || i.name.toLowerCase().includes(s) || (i.code || '').toLowerCase().includes(s))
      && (show === 'all' || (show === 'tracked' && i.track_stock) || (show === 'low' && i.track_stock && Number(i.stock) <= Number(i.low_stock_at) && Number(i.stock) > 0)
        || (show === 'out' && i.track_stock && Number(i.stock) <= 0) || (show === 'untracked' && !i.track_stock)))
      .sort((a, b) => (b.track_stock - a.track_stock) || (Number(a.stock) - Number(a.low_stock_at)) - (Number(b.stock) - Number(b.low_stock_at)) || a.name.localeCompare(b.name));
  }

  function renderLevels() {
    if (!root?.isConnected || tab !== 'levels') return;
    const tracked = Store.items.filter(i => i.track_stock && i.active);
    const value = tracked.reduce((a, i) => a + Math.max(0, Number(i.stock)) * Number(i.cost_price ?? i.price), 0);
    const low = tracked.filter(i => Number(i.stock) > 0 && Number(i.stock) <= Number(i.low_stock_at)).length, out = tracked.filter(i => Number(i.stock) <= 0).length;
    $('#sSummary', root).innerHTML = `<div class="sum big"><span>Stock value</span><b>${Fmt.money(value)}</b><small>At cost price, or selling price if no cost</small></div>
      <div class="sum"><span>Items tracked</span><b>${tracked.length}</b></div>
      <div class="sum ${low ? 'is-warn' : ''}"><span>Running low</span><b>${low}</b></div>
      <div class="sum ${out ? 'is-bad' : ''}"><span>Out of stock</span><b>${out}</b></div>`;
    const sel = $('#sCat', root); sel.innerHTML = `<option value="All">All categories</option>` + Store.categories.map(c => `<option>${esc(c)}</option>`).join(''); sel.value = Store.categories.includes(cat) ? cat : 'All';
    const list = rows();
    $('#sBody', root).innerHTML = list.length ? list.map(i => {
      const st = Number(i.stock), lim = Number(i.low_stock_at), state = !i.track_stock ? '' : st <= 0 ? 'out' : st <= lim ? 'low' : 'ok';
      const fill = !i.track_stock ? 0 : Math.min(100, lim > 0 ? st / (lim * 3) * 100 : (st > 0 ? 100 : 0));
      return `<tr data-id="${esc(i.id)}" class="${i.active ? '' : 'is-muted'}">
        <td data-label="Item"><b>${esc(i.name)}</b><small>${esc(i.category)}${i.active ? '' : ' · hidden from billing'}</small></td>
        <td data-label="In stock">${i.track_stock ? `<div class="level level-${state}"><b>${Fmt.qty(st)}</b> <small>${esc(i.unit)}</small><span class="meter"><i style="width:${fill.toFixed(0)}%"></i></span></div>` : '<span class="muted">Not tracked</span>'}</td>
        <td class="num" data-label="Warn at">${i.track_stock ? `${Fmt.qty(lim)} <small>${esc(i.unit)}</small>` : '—'}</td>
        <td class="num" data-label="Value">${i.track_stock ? Fmt.money(Math.max(0, st) * Number(i.cost_price ?? i.price)) : '—'}</td>
        <td class="row-act">${i.track_stock
          ? `<button type="button" class="btn btn-sm" data-act="in">${Icon('plus')} Add</button><button type="button" class="btn btn-sm btn-ghost" data-act="out">Remove</button><button type="button" class="btn btn-sm btn-ghost" data-act="set">Set count</button><button type="button" class="icon-btn" data-act="hist" aria-label="History of ${esc(i.name)}" title="History">${Icon('history')}</button>`
          : `<button type="button" class="btn btn-sm" data-act="set">Start tracking</button>`}</td></tr>`;
    }).join('') : `<tr><td colspan="5"><div class="empty"><h3>${Store.items.length ? 'Nothing here' : 'No items yet'}</h3><p>${!Store.items.length ? 'Add items first, then track their stock here.' : show === 'tracked' ? 'No item is tracked yet. Choose “Not tracked” and press Start tracking on an item.' : 'Try another filter.'}</p></div></td></tr>`;
  }

  async function adjust(item, mode) {
    const titles = { in: `Add stock · ${item.name}`, out: `Remove stock · ${item.name}`, set: item.track_stock ? `Set count · ${item.name}` : `Start tracking · ${item.name}` };
    const help = { in: 'For new stock that arrived (purchase, return from customer).', out: 'For damage, expiry, own use or return to supplier.', set: 'Enter the count you see on the shelf. The difference is recorded.' };
    const d = modal(titles[mode], `<form class="form-grid" id="adjForm">
      <p class="hint span-2">${help[mode]}${item.track_stock ? ` In stock now: <b>${Fmt.qty(item.stock)} ${esc(item.unit)}</b>.` : ''}</p>
      <label class="field"><span>${mode === 'set' ? 'Counted quantity' : 'Quantity'} (${esc(item.unit)})</span><input name="qty" type="number" step="any" min="0" required inputmode="decimal" autocomplete="off"></label>
      <label class="field"><span>Note <em>optional</em></span><input name="note" maxlength="200" placeholder="${mode === 'in' ? 'e.g. Supplier bill 1043' : mode === 'out' ? 'e.g. Expired' : 'e.g. Monthly count'}"></label>
      <p class="form-error span-2" role="alert" hidden></p>
      <div class="modal-actions span-2"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${mode === 'in' ? 'Add stock' : mode === 'out' ? 'Remove stock' : 'Save count'}</button></div></form>`, { size: 'modal-sm' });
    $('[name=qty]', d).focus();
    $('#adjForm', d).onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), btn = e.submitter, err = $('.form-error', d); err.hidden = true;
      busy(btn, true, 'Saving…');
      try { const it = await Cloud.rpc('shop_stock_adjust', { p_item_id: item.id, p_mode: mode, p_qty: Number(fd.get('qty')), p_note: fd.get('note') }); Store.upsertItem(it); toast(`${it.name}: ${Fmt.qty(it.stock)} ${it.unit} in stock.`, 'ok'); d.close(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { busy(btn, false); }
    };
  }

  async function renderMoves() {
    const box = $('#sMoves', root); box.innerHTML = '<p class="status-line">Loading…</p>';
    try {
      const d = await Cloud.rpc('shop_stock_moves_list', { p_item_id: movesItem?.id || null, p_offset: movesOffset, p_limit: 50 });
      if (!root?.isConnected || tab !== 'history') return;
      box.innerHTML = `${movesItem ? `<p class="filter-note">Showing <b>${esc(movesItem.name)}</b> only. <button type="button" class="linkish" data-all>Show all items</button></p>` : ''}
        <div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Item</th><th>What happened</th><th class="num">Change</th><th class="num">Stock after</th><th>By</th></tr></thead><tbody>
        ${d.rows.length ? d.rows.map(m => `<tr><td>${esc(Fmt.dateTime(m.created_at))}</td><td>${esc(m.item_name)}</td><td>${esc(REASONS[m.reason] || m.reason)}${m.bill_no ? ` <span class="mono small">${esc(m.bill_no)}</span>` : ''}${m.note ? `<small>${esc(m.note)}</small>` : ''}</td>
          <td class="num ${Number(m.change) < 0 ? 'neg' : 'pos'}">${Number(m.change) > 0 ? '+' : ''}${Fmt.qty(m.change)}</td><td class="num">${Fmt.qty(m.balance)}</td><td>${esc(m.actor_name || '—')}</td></tr>`).join('')
          : '<tr><td colspan="6"><div class="empty slim"><p>No stock changes yet.</p></div></td></tr>'}</tbody></table></div>
        <div class="pager"><button type="button" class="btn btn-sm" data-prev ${movesOffset ? '' : 'disabled'}>Previous</button><span>${d.total > 50 ? `${movesOffset + 1}–${Math.min(movesOffset + 50, d.total)} of ${d.total}` : ''}</span><button type="button" class="btn btn-sm" data-next ${movesOffset + 50 < d.total ? '' : 'disabled'}>Next</button></div>`;
    } catch (e) { box.innerHTML = `<p class="status-line">${esc(e.message)}</p>`; }
  }

  function setTab(t) {
    tab = t; $$('#sTabs button', root).forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('#sLevels', root).hidden = t !== 'levels'; $('#sMoves', root).hidden = t !== 'history';
    if (t === 'levels') renderLevels(); else renderMoves();
  }

  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Stocks</h1><p class="sub">Sales take stock off automatically. Add new stock when it arrives.</p></div>
        <div class="head-actions"><div class="seg" id="sTabs"><button type="button" data-t="levels">Stock levels</button><button type="button" data-t="history">History</button></div></div></header>
      <div id="sLevels">
        <div class="summary" id="sSummary"></div>
        <div class="filters">
          <label class="search sm">${Icon('search')}<input id="sQ" type="search" placeholder="Search item or code" value="${esc(q)}" aria-label="Search stock"></label>
          <select id="sCat" aria-label="Category"></select>
          <div class="seg" id="sShow">${[['tracked', 'Tracked'], ['low', 'Running low'], ['out', 'Out of stock'], ['untracked', 'Not tracked'], ['all', 'All']].map(([k, l]) => `<button type="button" data-s="${k}" class="${show === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        </div>
        <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Item</th><th>In stock</th><th class="num">Warn at</th><th class="num">Value</th><th></th></tr></thead><tbody id="sBody"></tbody></table></div>
      </div>
      <div id="sMoves" hidden></div></div>`;
    $('#sTabs', view).onclick = e => { const b = e.target.closest('[data-t]'); if (b) { movesItem = null; movesOffset = 0; setTab(b.dataset.t); } };
    $('#sShow', view).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; show = b.dataset.s; $$('#sShow button', view).forEach(x => x.classList.toggle('on', x === b)); renderLevels(); };
    $('#sQ', view).oninput = e => { q = e.target.value; renderLevels(); };
    $('#sCat', view).onchange = e => { cat = e.target.value; renderLevels(); };
    $('#sBody', view).addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const item = Store.items.find(i => i.id === b.closest('tr').dataset.id); if (!item) return;
      if (b.dataset.act === 'hist') { movesItem = item; movesOffset = 0; setTab('history'); } else adjust(item, b.dataset.act);
    });
    $('#sMoves', view).addEventListener('click', e => {
      if (e.target.closest('[data-all]')) { movesItem = null; movesOffset = 0; renderMoves(); }
      if (e.target.closest('[data-prev]')) { movesOffset = Math.max(0, movesOffset - 50); renderMoves(); }
      if (e.target.closest('[data-next]')) { movesOffset += 50; renderMoves(); }
    });
    setTab(tab);
    Store.loadItems(true).then(renderLevels).catch(e => toast(e.message, 'error'));
  }
  document.addEventListener('items:changed', renderLevels);
  return { mount, adjust, unmount() { root = null; } };
})();
