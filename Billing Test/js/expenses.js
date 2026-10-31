/* Expenses: rent, electricity, salaries… with your own expense types, one-off custom expenses,
   and auto expenses that post themselves every month on a set day (the 1st if no day is set). */
'use strict';
const Expenses = (() => {
  let root = null, month = '', data = null, req = 0;
  const METHODS = ['Cash', 'UPI', 'Card', 'Bank'];
  const monthEnd = m => { const d = new Date(m + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  const shiftMonth = (m, n) => { const d = new Date(m + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const monthName = m => new Date(m + 'T12:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)] || 'th');
  const nameOf = x => x.head && x.title ? `${x.head} · ${x.title}` : (x.head || x.title || 'Expense');
  const canManage = () => !!data?.can_manage;

  async function load() {
    const id = ++req; $('#eStatus', root).textContent = 'Loading…';
    try {
      const d = await Cloud.rpc('shop_expenses_list', { p_from: month, p_to: monthEnd(month) });
      if (id !== req || !root?.isConnected) return;
      data = d; render();
    } catch (e) { if (id === req && root?.isConnected) $('#eStatus', root).textContent = e.message; }
  }

  function render() {
    const rows = data.rows, total = Number(data.total), autos = rows.filter(r => r.auto);
    $('#eStatus', root).textContent = monthName(month);
    $('#eMonth', root).textContent = monthName(month);
    $('#eNext', root).disabled = month >= Fmt.monthStart(Fmt.today());
    const byHead = {}; rows.forEach(r => { const k = r.head || 'Other'; byHead[k] = (byHead[k] || 0) + Number(r.amount); });
    const heads = Object.entries(byHead).sort((a, b) => b[1] - a[1]);
    $('#eKpis', root).innerHTML = `<div class="kpi kpi-hero"><span>Spent in ${esc(monthName(month).split(' ')[0])}</span><b>${Fmt.money(total)}</b><small>${rows.length} expense${rows.length === 1 ? '' : 's'}</small></div>
      <div class="kpi"><span>Auto expenses</span><b>${Fmt.money(autos.reduce((s, r) => s + Number(r.amount), 0))}</b><small>${autos.length} posted automatically</small></div>
      <div class="kpi"><span>Biggest</span><b>${heads[0] ? esc(heads[0][0]) : '—'}</b><small>${heads[0] ? Fmt.money(heads[0][1]) : 'Nothing yet'}</small></div>`;
    $('#eList', root).innerHTML = rows.length ? `<table class="table cards-on-mobile exp-table"><thead><tr><th>Date</th><th>Expense</th><th>Paid by</th><th class="num">Amount</th>${canManage() ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(r => `
      <tr data-id="${r.id}"><td data-label="Date">${esc(Fmt.date(r.spent_on))}</td>
        <td data-label="Expense"><b>${esc(nameOf(r))}</b>${r.auto ? ` <span class="badge badge-soft">${Icon('repeat')} Auto</span>` : ''}${r.note ? `<small class="block muted">${esc(r.note)}</small>` : ''}</td>
        <td data-label="Paid by">${esc(r.method)}${r.by && r.by !== 'Auto' ? `<small class="block muted">by ${esc(r.by)}</small>` : ''}</td>
        <td data-label="Amount" class="num"><b>${Fmt.money(r.amount)}</b></td>
        ${canManage() ? `<td class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-edit aria-label="Edit">${Icon('edit')}</button><button type="button" class="btn btn-sm btn-ghost" data-del aria-label="Delete">${Icon('trash')}</button></td>` : ''}</tr>`).join('')}</tbody></table>`
      : `<div class="empty"><div class="empty-ico">${Icon('wallet')}</div><h3>No expenses in ${esc(monthName(month))}</h3><p>Add rent, electricity, salaries — anything the business pays for.</p><button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add expense</button></div>`;
    const max = heads[0]?.[1] || 1;
    $('#eHeads', root).innerHTML = heads.length ? `<ul class="hbars">${heads.map(([h, v]) => `<li><div class="hb-top"><span>${esc(h)}</span><b>${Fmt.money(v)}</b></div><div class="hb-track"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><small>${(v / (total || 1) * 100).toFixed(0)}% of the month</small></li>`).join('')}</ul>` : '<div class="empty slim"><p>Your spending by type shows here.</p></div>';
    $('#eAutoCard', root).hidden = !canManage(); $('#eTypesCard', root).hidden = !canManage();
    if (canManage()) { paintAutos(); paintTypes(); }
  }

  function nextDue(a) {
    const t = Fmt.today(); let m = Fmt.monthStart(t);
    if (a.start_month > m) m = a.start_month;
    for (let i = 0; i < 3; i++) {
      const last = Number(monthEnd(m).slice(8)), day = Math.min(a.day_of_month || 1, last), due = m.slice(0, 8) + String(day).padStart(2, '0');
      if (due > t || (a.last_posted || '') < due) return due;
      m = shiftMonth(m, 1);
    }
    return '';
  }
  function paintAutos() {
    const a = data.autos || [];
    $('#eAutos', root).innerHTML = a.length ? `<ul class="auto-list">${a.map(x => `<li data-auto="${x.id}" class="${x.active ? '' : 'off'}">
        <div><b>${esc(nameOf(x))}</b><small>${Fmt.money(x.amount)} · every month on the ${ord(x.day_of_month || 1)}${x.day_of_month ? '' : ' (default)'} · ${esc(x.method)}</small>
        <small class="muted">${x.active ? `Next: ${esc(Fmt.date(nextDue(x)))}` : 'Paused'}${x.last_posted ? ` · last posted ${esc(Fmt.date(x.last_posted))}` : ''}</small></div>
        <div class="row-act"><label class="switch mini" title="${x.active ? 'Pause' : 'Resume'}"><input type="checkbox" data-toggle ${x.active ? 'checked' : ''} aria-label="Active"><span class="sw" aria-hidden="true"></span></label>
        <button type="button" class="btn btn-sm btn-ghost" data-aedit aria-label="Edit">${Icon('edit')}</button><button type="button" class="btn btn-sm btn-ghost" data-adel aria-label="Delete">${Icon('trash')}</button></div></li>`).join('')}</ul>`
      : '<p class="hint">Rent, salaries and other fixed bills can post themselves every month.</p>';
  }
  function paintTypes() {
    $('#eTypes', root).innerHTML = (data.heads || []).map(h => `<span class="chip" data-head="${esc(h)}"><button type="button" class="chip-name" data-rename title="Rename">${esc(h)}</button><button type="button" class="chip-x" data-hdel aria-label="Remove ${esc(h)}">${Icon('x')}</button></span>`).join('') || '<span class="hint">No expense types yet.</span>';
  }

  /* ---------- add / edit expense ---------- */
  function editor(x = null) {
    const heads = data?.heads || [], isOther = x && !x.head;
    const d = modal(x ? 'Edit expense' : 'Add expense', `<form id="eForm" class="stack">
      <div class="field"><span>Type</span><div class="pick-chips" role="radiogroup">${heads.map(h => `<label><input type="radio" name="head" value="${esc(h)}" ${x?.head === h || (!x && h === heads[0]) ? 'checked' : ''}><span>${esc(h)}</span></label>`).join('')}
        ${x?.head && !heads.includes(x.head) ? `<label><input type="radio" name="head" value="${esc(x.head)}" checked><span>${esc(x.head)}</span></label>` : ''}
        <label><input type="radio" name="head" value="" ${isOther || !heads.length ? 'checked' : ''}><span>${Icon('plus')} Other</span></label></div></div>
      <label class="field"><span data-titlelabel>What was it for?</span><input name="title" maxlength="80" value="${esc(x?.title || '')}" placeholder="e.g. Plumber, Diwali lights, Tea for staff"></label>
      <div class="form-grid"><label class="field"><span>Amount (${esc(Fmt.cur())})</span><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${x ? Number(x.amount) : ''}" class="big-input"></label>
        <label class="field"><span>Date</span><input name="spent_on" type="date" required value="${esc(x?.spent_on || (month === Fmt.monthStart(Fmt.today()) ? Fmt.today() : month))}" max="${Fmt.addDays(Fmt.today(), 31)}"></label></div>
      <div class="field"><span>Paid by</span><div class="seg" role="radiogroup">${METHODS.map(m => `<label><input type="radio" name="method" value="${m}" ${(x?.method || 'Cash') === m ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div></div>
      <label class="field"><span>Note <em>optional</em></span><input name="note" maxlength="200" value="${esc(x?.note || '')}"></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${x ? 'Save changes' : 'Add expense'}</button></div></form>`, { size: 'modal-md' });
    const f = $('#eForm', d);
    const paint = () => { const other = !f.head.value; $('[data-titlelabel]', f).textContent = other ? 'What was it for?' : 'Details (optional)'; f.title.required = other; };
    f.addEventListener('change', paint); paint();
    if (!isTouch()) setTimeout(() => f.amount.focus(), 50);
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      try {
        await Cloud.rpc('shop_expense_save', { p: { id: x?.id || null, head: f.head.value, title: f.title.value.trim(), amount: f.amount.value, spent_on: f.spent_on.value, method: f.method.value, note: f.note.value.trim() } });
        d.close(); toast(x ? 'Expense updated.' : `${Fmt.money(f.amount.value)} added to expenses.`, 'ok');
        const m = Fmt.monthStart(f.spent_on.value); if (m !== month && !x) { month = m; } load();
      } catch (ex) { toast(ex.message, 'error', 6000); busy(e.submitter, false); }
    };
  }

  /* ---------- auto expense ---------- */
  function autoEditor(a = null) {
    const heads = data?.heads || [];
    const d = modal(a ? 'Edit auto expense' : 'New auto expense', `<form id="aForm" class="stack">
      <p class="hint">Posts itself every month on the day you choose — the 1st if you leave the day empty. You don’t need to open the app that day; it is added the next time anyone opens Expenses or the Dashboard.</p>
      <div class="form-grid"><label class="field"><span>Type</span><select name="head"><option value="">Other (type a name)</option>${heads.map(h => `<option ${a?.head === h || (!a && h === heads[0]) ? 'selected' : ''}>${esc(h)}</option>`).join('')}${a?.head && !heads.includes(a.head) ? `<option selected>${esc(a.head)}</option>` : ''}</select></label>
        <label class="field"><span>Name <em>optional</em></span><input name="title" maxlength="80" value="${esc(a?.title || '')}" placeholder="e.g. Shop rent, Ravi’s salary"></label>
        <label class="field"><span>Amount every month (${esc(Fmt.cur())})</span><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${a ? Number(a.amount) : ''}"></label>
        <label class="field"><span>Day of the month <em>empty = 1st</em></span><input name="day" type="number" inputmode="numeric" min="1" max="31" step="1" value="${a?.day_of_month || ''}" placeholder="1"><small class="hint">29–31 post on the last day in shorter months.</small></label>
        <label class="field"><span>Start from</span><input name="start" type="month" required value="${esc((a?.start_month || Fmt.monthStart(Fmt.today())).slice(0, 7))}"></label>
        <div class="field"><span>Paid by</span><select name="method">${METHODS.map(m => `<option ${(a?.method || 'Cash') === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
      <label class="switch"><input type="checkbox" name="active" ${a ? (a.active ? 'checked' : '') : 'checked'}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>On</b><small>Turn off to pause it without deleting.</small></span></label>
      <p class="hint" data-when></p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${a ? 'Save' : 'Create auto expense'}</button></div></form>`, { size: 'modal-md' });
    const f = $('#aForm', d);
    const when = () => { const day = Number(f.day.value) || 1; $('[data-when]', f).textContent = `Will post ${f.amount.value ? Fmt.money(f.amount.value) + ' ' : ''}on the ${ord(Math.min(day, 31))} of every month from ${monthName((f.start.value || Fmt.today().slice(0, 7)) + '-01')}.`; };
    f.addEventListener('input', when); when();
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.head.value && !f.title.value.trim()) return toast('Choose a type or type a name.', 'warn');
      busy(e.submitter, true, 'Saving…');
      try {
        data = { ...(await Cloud.rpc('shop_expense_auto_save', { p: { id: a?.id || null, head: f.head.value, title: f.title.value.trim(), amount: f.amount.value, day_of_month: f.day.value, start_month: f.start.value + '-01', method: f.method.value, active: f.active.checked } })) };
        d.close(); toast(a ? 'Auto expense saved.' : 'Auto expense created.', 'ok'); load();
      } catch (ex) { toast(ex.message, 'error', 6000); busy(e.submitter, false); }
    };
  }

  function mount(view) {
    root = view; month = month || Fmt.monthStart(Fmt.today());
    const L = Store.label('expenses');
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>${esc(L)}</h1><p class="sub" id="eStatus" role="status"></p></div>
        <div class="head-actions"><div class="month-nav"><button type="button" class="icon-btn" id="ePrev" aria-label="Previous month">‹</button><b id="eMonth"></b><button type="button" class="icon-btn" id="eNext" aria-label="Next month">›</button></div>
        <button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add expense</button></div></header>
      <div class="kpis kpis-3" id="eKpis"></div>
      <div class="exp-grid">
        <section class="card"><h2>Expenses</h2><div id="eList"></div></section>
        <div class="exp-side">
          <section class="card"><h2>By type</h2><div id="eHeads"></div></section>
          <section class="card" id="eAutoCard" hidden><div class="card-title-row"><h2>${Icon('repeat')} Auto expenses</h2><button type="button" class="btn btn-sm" id="eAutoAdd">${Icon('plus')} New</button></div><div id="eAutos"></div></section>
          <section class="card" id="eTypesCard" hidden><h2>Expense types</h2><div class="chips" id="eTypes"></div>
            <form class="inline-add" id="eTypeForm"><input name="name" maxlength="40" placeholder="New type, e.g. Water bill" aria-label="New expense type"><button class="btn btn-sm">Add</button></form></section>
        </div></div></div>`;
    $('#ePrev', view).onclick = () => { month = shiftMonth(month, -1); load(); };
    $('#eNext', view).onclick = () => { month = shiftMonth(month, 1); load(); };
    $('#eAutoAdd', view).onclick = () => autoEditor();
    $('#eTypeForm', view).onsubmit = async e => {
      e.preventDefault(); const v = e.target.name.value.trim(); if (!v) return;
      try { data.heads = await Cloud.rpc('shop_expense_head_save', { p_name: v }); e.target.reset(); paintTypes(); toast(`“${v}” added.`, 'ok'); } catch (ex) { toast(ex.message, 'error'); }
    };
    $('.page', view).addEventListener('click', async e => {
      if (e.target.closest('[data-add]')) return editor();
      const tr = e.target.closest('tr[data-id]');
      if (tr && e.target.closest('[data-edit]')) return editor(data.rows.find(r => r.id === tr.dataset.id));
      if (tr && e.target.closest('[data-del]')) {
        const r = data.rows.find(x => x.id === tr.dataset.id);
        if (!(await ask({ title: 'Delete this expense?', body: `${esc(nameOf(r))} · ${Fmt.money(r.amount)}${r.auto ? '<br><br>It was posted by an auto expense and will not be posted again for this month.' : ''}`, confirm: 'Delete', danger: true }))) return;
        try { await Cloud.rpc('shop_expense_delete', { p_id: r.id }); toast('Expense deleted.', 'ok'); load(); } catch (ex) { toast(ex.message, 'error'); }
        return;
      }
      const li = e.target.closest('[data-auto]');
      if (li) {
        const a = data.autos.find(x => x.id === li.dataset.auto);
        if (e.target.closest('[data-aedit]')) return autoEditor(a);
        if (e.target.closest('[data-adel]')) {
          if (!(await ask({ title: 'Delete this auto expense?', body: 'It stops posting. Months already posted stay in your expenses.', confirm: 'Delete', danger: true }))) return;
          try { await Cloud.rpc('shop_expense_auto_delete', { p_id: a.id }); toast('Auto expense deleted.', 'ok'); load(); } catch (ex) { toast(ex.message, 'error'); }
        }
        return;
      }
      const chip = e.target.closest('[data-head]');
      if (chip && e.target.closest('[data-hdel]')) {
        if (!(await ask({ title: `Remove “${esc(chip.dataset.head)}”?`, body: 'Past expenses keep this name.', confirm: 'Remove' }))) return;
        try { data.heads = await Cloud.rpc('shop_expense_head_delete', { p_name: chip.dataset.head }); paintTypes(); } catch (ex) { toast(ex.message, 'error'); }
      } else if (chip && e.target.closest('[data-rename]')) {
        const v = await ask({ title: 'Rename expense type', confirm: 'Rename', input: { label: 'Name', value: chip.dataset.head, required: true, maxlength: 40 } });
        if (v === null || v.trim() === chip.dataset.head) return;
        try { data.heads = await Cloud.rpc('shop_expense_head_save', { p_name: v.trim(), p_old_name: chip.dataset.head }); load(); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
    $('.page', view).addEventListener('change', async e => {
      const t = e.target.closest('[data-toggle]'); if (!t) return;
      const a = data.autos.find(x => x.id === t.closest('[data-auto]').dataset.auto);
      try { await Cloud.rpc('shop_expense_auto_save', { p: { ...a, start_month: a.start_month, active: t.checked } }); toast(t.checked ? 'Auto expense resumed.' : 'Auto expense paused.', 'ok'); load(); }
      catch (ex) { t.checked = !t.checked; toast(ex.message, 'error'); }
    });
    load();
  }
  return { mount, unmount() { root = null; }, refresh() { if (root) load(); } };
})();
