/* Bill records: find, view, reprint, cancel, change payment, export. */
'use strict';
const Records = (() => {
  const PAGE = 50;
  let f = { period: 'today', from: '', to: '', status: 'all', payment: 'all', q: '' }, offset = 0, data = null, root = null, timer = null, req = 0;

  function range() { return periodRange(f.period, f.from, f.to); }

  async function load() {
    const id = ++req, [from, to] = range();
    $('#rStatus', root).textContent = 'Loading bills…';
    try {
      const d = await Cloud.rpc('shop_bills_list', { p_from: from, p_to: to, p_status: f.status, p_payment: f.payment, p_query: f.q, p_offset: offset, p_limit: PAGE });
      if (id !== req || !root?.isConnected) return;
      data = d; render();
    } catch (e) { if (id === req && root?.isConnected) $('#rStatus', root).textContent = e.message; }
  }

  function render() {
    const s = data.summary, all = Store.can('records_all'), pays = Store.payments();
    $('#rSummary', root).innerHTML = [
      ['Sales', Fmt.money(s.sales), 'big'], ['Bills', s.bills], ...pays.map(m => [m, Fmt.money(s[m.toLowerCase()])]), ['Cancelled', s.cancelled]
    ].map(([k, v, c]) => `<div class="sum ${c || ''}"><span>${k}</span><b>${v}</b></div>`).join('');
    const label = data.from === data.to ? Fmt.date(data.from) : `${Fmt.date(data.from)} – ${Fmt.date(data.to)}`;
    $('#rStatus', root).textContent = data.total ? `${data.total} bill${data.total === 1 ? '' : 's'} · ${label}` : '';
    const body = $('#rBody', root);
    body.innerHTML = data.rows.length ? data.rows.map(b => `<tr data-id="${esc(b.id)}" tabindex="0" class="${b.status === 'Cancelled' ? 'is-void' : ''}">
        <td data-label="Bill no"><b class="mono">${esc(b.bill_no)}</b>${b.kind === 'membership' ? ` <span class="badge badge-soft" title="Membership">${Icon('idcard')} ${esc(Store.label1('members'))}ship</span>` : ''}</td>
        <td data-label="Time">${esc(data.from === data.to ? Fmt.time(b.created_at) : Fmt.dateTime(b.created_at))}</td>
        <td data-label="Customer" class="${b.customer_name || b.customer_phone ? '' : 'm-hide'}">${esc(b.customer_name || b.customer_phone || '—')}</td>
        <td class="num" data-label="Lines">${(b.items || []).length}</td>
        <td data-label="Payment"><span class="pm pm-${esc(b.payment_method.toLowerCase())}">${esc(b.payment_method)}</span></td>
        <td class="num" data-label="Total"><b>${Fmt.money(b.total)}</b></td>
        <td data-label="Status">${b.status === 'Cancelled' ? '<span class="badge badge-red">Cancelled</span>' : '<span class="badge badge-green">Paid</span>'}</td>
        <td class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-open>View</button></td></tr>`).join('')
      : `<tr><td colspan="8"><div class="empty"><h3>No bills here</h3><p>${f.q ? 'Nothing matches that search. Try a bill number, name or phone.' : all ? 'No bills in this period. Pick another date range.' : 'No bills yet today.'}</p></div></td></tr>`;
    $('#rPrev', root).disabled = offset === 0;
    $('#rNext', root).disabled = offset + PAGE >= data.total;
    $('#rPage', root).textContent = data.total > PAGE ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} of ${data.total}` : '';
  }

  function openBill(b) {
    const manage = Store.can('cancel_bills') && b.status === 'Paid';
    const d = modal(`Bill ${b.bill_no}`, `<div class="bill-view">
        <div class="bill-paper">${Receipt.html(b)}</div>
        <div class="bill-side">
          <dl class="facts">
            <dt>Status</dt><dd>${b.status === 'Cancelled' ? `<span class="badge badge-red">Cancelled</span>${b.cancel_reason ? `<small>${esc(b.cancel_reason)}</small>` : ''}` : '<span class="badge badge-green">Paid</span>'}</dd>
            <dt>Paid by</dt><dd><b>${esc(b.payment_method)}</b>${b.cash_received != null ? `<small>Cash received ${Fmt.money(b.cash_received)}${Number(b.change_amount) > 0 ? ` · returned ${Fmt.money(b.change_amount)}` : ''}${Number(b.less_amount) > 0 ? ` · short ${Fmt.money(b.less_amount)}` : ''}</small>` : ''}</dd>
            <dt>Billed by</dt><dd>${esc(b.cashier_name || '—')}</dd>
            <dt>Time</dt><dd>${esc(Fmt.dateTime(b.created_at))}</dd>
          </dl>
          <div class="stack">
            <button type="button" class="btn btn-primary" data-print>${Icon('printer')} Print bill</button>
            ${Store.feature('whatsapp') ? `<button type="button" class="btn" data-wa>${Icon('whatsapp')} Send on WhatsApp</button>` : ''}
            ${manage ? `<button type="button" class="btn btn-danger-ghost" data-cancel>${Icon('ban')} Cancel bill</button><p class="hint">Cancelling puts the stock back and removes the bill from sales. The bill number stays in the records.</p>` : ''}
          </div>
        </div></div>`, { size: 'modal-lg' });
    d.addEventListener('click', async e => {
      if (e.target.closest('[data-print]')) Receipt.print(b);
      else if (e.target.closest('[data-wa]')) Receipt.whatsapp(b);
      else if (e.target.closest('[data-cancel]')) {
        const reason = await ask({ title: `Cancel bill ${b.bill_no}?`, body: `${Fmt.money(b.total)} will be removed from sales and tracked stock will be added back.`, confirm: 'Cancel bill', cancel: 'Keep bill', danger: true, input: { label: 'Reason (optional)', placeholder: 'e.g. Customer returned items', maxlength: 200 } });
        if (reason === null) return;
        try { const nb = await Cloud.rpc('shop_bill_cancel', { p_id: b.id, p_reason: reason }); toast(`Bill ${nb.bill_no} cancelled.`, 'ok'); d.close(); Store.applyStockUpdates(nb.stock_updates); if (root?.isConnected) load(); }
        catch (err) { toast(err.message, 'error'); }
      }
    });
  }

  async function exportCSV(btn) {
    busy(btn, true, 'Preparing…');
    try {
      const [from, to] = range(); let rows = [], off = 0, total = 1;
      while (off < total && off < 20000) {
        const d = await Cloud.rpc('shop_bills_list', { p_from: from, p_to: to, p_status: f.status, p_payment: f.payment, p_query: f.q, p_offset: off, p_limit: 200 });
        total = d.total; rows.push(...d.rows); off += 200;
      }
      const out = [['Bill no', 'Date', 'Time', 'Status', 'Payment', 'Customer', 'Phone', 'Item', 'Qty', 'Unit', 'Rate', 'Line amount', 'Bill subtotal', 'Discount', 'Tax', 'Round off', 'Short cash', 'Bill total', 'Cash received', 'Change', 'Billed by', 'Cancel reason']];
      for (const b of rows.reverse()) {
        const dt = new Date(b.created_at), dd = dt.toLocaleDateString('en-CA', { timeZone: Fmt.tz() }), tt = dt.toLocaleTimeString('en-GB', { timeZone: Fmt.tz() });
        (b.items || []).forEach((i, n) => out.push([b.bill_no, dd, tt, b.status, b.payment_method, b.customer_name, b.customer_phone, i.name, i.qty, i.unit, i.price, i.line_total,
          n ? '' : b.items_subtotal, n ? '' : b.discount_amount, n ? '' : b.tax_amount, n ? '' : b.round_off, n ? '' : b.less_amount, n ? '' : b.total, n ? '' : (b.cash_received ?? ''), n ? '' : b.change_amount, b.cashier_name, b.cancel_reason]));
      }
      downloadFile(`bills_${from}_to_${to}.csv`, toCSV(out));
      toast(`Exported ${rows.length} bills.`, 'ok');
    } catch (e) { toast(e.message, 'error'); } finally { busy(btn, false); }
  }

  function mount(view) {
    root = view; offset = 0;
    const all = Store.can('records_all');
    if (!all) f.period = 'today';
    if (!['all', ...Store.payments()].includes(f.payment)) f.payment = 'all';
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Records</h1><p class="sub">${all ? 'Every bill, with search, reprint and export.' : 'Bills made today. Tap a bill to reprint it.'}</p></div>
        <div class="head-actions"><button type="button" class="btn" id="rRefresh">${Icon('refresh')} Refresh</button>${Store.can('export') ? `<button type="button" class="btn" id="rExport">${Icon('download')} Export CSV</button>` : ''}</div></header>
      <div class="filters">
        ${all ? `<div class="seg" id="rPeriods">${PERIODS.map(([k, l]) => `<button type="button" data-p="${k}" class="${f.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="range" id="rRange" ${f.period === 'custom' ? '' : 'hidden'}><input type="date" id="rFrom" aria-label="From date"><span>to</span><input type="date" id="rTo" aria-label="To date"></div>` : ''}
        <label class="search sm">${Icon('search')}<input id="rQ" type="search" placeholder="Bill no, customer or phone" value="${esc(f.q)}" aria-label="Search bills"></label>
        <select id="rPay" aria-label="Payment filter"><option value="all">All payments</option>${Store.payments().map(m => `<option ${f.payment === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <select id="rStat" aria-label="Status filter"><option value="all">Paid & cancelled</option><option value="Paid" ${f.status === 'Paid' ? 'selected' : ''}>Paid only</option><option value="Cancelled" ${f.status === 'Cancelled' ? 'selected' : ''}>Cancelled only</option></select>
      </div>
      <div class="summary" id="rSummary"></div>
      <p class="status-line" id="rStatus" role="status"></p>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Bill no</th><th>Time</th><th>Customer</th><th class="num">Lines</th><th>Payment</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody id="rBody"></tbody></table></div>
      <div class="pager"><button type="button" class="btn btn-sm" id="rPrev">Previous</button><span id="rPage"></span><button type="button" class="btn btn-sm" id="rNext">Next</button></div>
    </div>`;
    const t = Fmt.today();
    if ($('#rFrom', view)) { $('#rFrom', view).value = f.from || t; $('#rTo', view).value = f.to || t; $('#rFrom', view).max = t; $('#rTo', view).max = t; }
    $('#rPeriods', view)?.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; f.period = b.dataset.p; $$('#rPeriods button', view).forEach(x => x.classList.toggle('on', x === b)); $('#rRange', view).hidden = f.period !== 'custom'; offset = 0; load(); });
    for (const id of ['#rFrom', '#rTo']) $(id, view)?.addEventListener('change', () => { f.from = $('#rFrom', view).value; f.to = $('#rTo', view).value; if (f.to < f.from) { f.to = f.from; $('#rTo', view).value = f.to; } offset = 0; load(); });
    $('#rQ', view).oninput = e => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value.trim(); offset = 0; load(); }, 300); };
    $('#rPay', view).onchange = e => { f.payment = e.target.value; offset = 0; load(); };
    $('#rStat', view).onchange = e => { f.status = e.target.value; offset = 0; load(); };
    $('#rRefresh', view).onclick = load;
    if ($('#rExport', view)) $('#rExport', view).onclick = e => exportCSV(e.currentTarget);
    $('#rPrev', view).onclick = () => { offset = Math.max(0, offset - PAGE); load(); };
    $('#rNext', view).onclick = () => { offset += PAGE; load(); };
    const pick = tr => { const b = data?.rows.find(x => x.id === tr.dataset.id); if (b) openBill(b); };
    $('#rBody', view).addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) pick(tr); });
    $('#rBody', view).addEventListener('keydown', e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) pick(tr); } });
    load();
  }
  return { mount, openBill, unmount() { root = null; } };
})();
