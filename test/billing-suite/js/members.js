/* Members (gym, library, coaching…): plans, renewals, expiry reminders, member logins and attendance.
   Members with only a few days left float to the top in orange with a reminder. */
'use strict';
const Members = (() => {
  let root = null, data = null, filter = 'all', q = '', req = 0;
  const L = () => Store.label('members'), L1 = () => Store.label1('members');
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const planById = id => data?.plans.find(p => p.id === id);
  const dur = p => `${p.duration_value} ${p.duration_unit}${p.duration_value === 1 ? '' : 's'}`;
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const checkinURL = tok => location.origin + location.pathname.replace(/index\.html$/, '') + '#/checkin/' + tok;

  function daysText(m) {
    if (m.status === 'none') return 'No plan';
    if (m.status === 'archived') return 'Archived';
    const d = m.days_left;
    if (d < 0) return `Expired ${-d} day${d === -1 ? '' : 's'} ago`;
    if (d === 0) return 'Ends today';
    return `${d} day${d === 1 ? '' : 's'} left`;
  }
  const rank = m => ({ expiring: 0, expired: 1, active: 2, none: 3, archived: 4 }[m.status]);
  function sorted(list) {
    return [...list].sort((a, b) => rank(a) - rank(b) || (a.status === 'expired' ? b.days_left - a.days_left : (a.days_left ?? 1e9) - (b.days_left ?? 1e9)) || a.name.localeCompare(b.name));
  }
  function visible() {
    const s = q.trim().toLowerCase();
    return sorted(data.members.filter(m => (filter === 'all' ? m.status !== 'archived' : m.status === filter)
      && (!s || m.name.toLowerCase().includes(s) || m.phone.replace(/\D/g, '').includes(s.replace(/\D/g, '') || '¤') || m.member_no.toLowerCase().includes(s))));
  }

  async function load(quiet) {
    const id = ++req; if (!quiet && !data) $('#mStatus', root).textContent = 'Loading…';
    try {
      const d = await Cloud.rpc('shop_members_list');
      if (id !== req || !root?.isConnected) return;
      data = d; render();
    } catch (e) { if (id === req && root?.isConnected) $('#mStatus', root).textContent = e.message; }
  }

  function counts() { const c = { all: 0, expiring: 0, expired: 0, active: 0, none: 0, archived: 0 }; data.members.forEach(m => { c[m.status]++; if (m.status !== 'archived') c.all++; }); return c; }
  function render() {
    const c = counts(), rd = data.remind_days;
    $('#mStatus', root).textContent = `${c.all} ${L().toLowerCase()} · ${c.active + c.expiring} active`;
    $('#mAlert', root).innerHTML = c.expiring ? `<div class="remind-banner" role="status">${Icon('bell')}<div><b>${c.expiring} ${c.expiring === 1 ? L1().toLowerCase() + ' has' : L().toLowerCase() + ' have'} ${rd} day${rd === 1 ? '' : 's'} or less left</b><small>They are at the top of the list. Renew them, or send a WhatsApp reminder.</small></div><button type="button" class="btn btn-sm" data-filter="expiring">Show them</button></div>` : '';
    $('#mFilters', root).innerHTML = [['all', 'All'], ['expiring', 'Ending soon'], ['expired', 'Expired'], ['active', 'Active'], ['none', 'No plan'], ['archived', 'Archived']]
      .filter(([k]) => k === 'all' || c[k] || filter === k).map(([k, l]) => `<button type="button" data-filter="${k}" class="${filter === k ? 'on' : ''} f-${k}">${l} <span>${c[k]}</span></button>`).join('');
    paintList();
  }
  function paintList() {
    const list = visible(), ci = new Set(data.checked_in_today || []);
    const canR = Store.can('members_renew'), canA = Store.can('attendance') && Store.sys.members?.attendance !== false;
    $('#mList', root).innerHTML = list.length ? list.map(m => `<article class="mcard st-${m.status}" data-id="${m.id}">
        <button type="button" class="mcard-main" data-open aria-label="Open ${esc(m.name)}">
          <span class="avatar">${esc(initials(m.name))}</span>
          <span class="mcard-who"><b>${esc(m.name)}</b><small>${esc(m.member_no)}${m.phone ? ' · ' + esc(m.phone) : ''}</small></span>
          <span class="mcard-plan"><span class="days-pill">${m.status === 'expiring' ? Icon('bell') : ''}${esc(daysText(m))}</span><small>${m.plan_name ? esc(m.plan_name) + (m.end_date ? ' · ends ' + esc(Fmt.date(m.end_date)) : '') : 'Choose a plan to start'}</small></span>
          ${ci.has(m.id) ? `<span class="in-today" title="Checked in today">${Icon('check')}</span>` : ''}
        </button>
        <div class="mcard-act">
          ${canR && m.status !== 'archived' ? `<button type="button" class="btn btn-sm ${m.status === 'expiring' || m.status === 'expired' ? 'btn-primary' : ''}" data-renew>${Icon('repeat')} ${m.status === 'none' ? 'Start plan' : 'Renew'}</button>` : ''}
          ${canA && m.status !== 'archived' && !ci.has(m.id) ? `<button type="button" class="btn btn-sm btn-ghost" data-checkin>${Icon('check')} Check in</button>` : ''}
          ${(m.status === 'expiring' || m.status === 'expired') && m.phone ? `<a class="btn btn-sm btn-ghost" data-wa href="${esc(waLink(m))}" target="_blank" rel="noopener">${Icon('whatsapp')} Remind</a>` : ''}
        </div></article>`).join('')
      : `<div class="empty"><div class="empty-ico">${Icon('idcard')}</div><h3>${data.members.length ? 'Nobody matches' : `No ${L().toLowerCase()} yet`}</h3><p>${data.members.length ? 'Try another search or filter.' : `Add your first ${L1().toLowerCase()} and start their plan.`}</p>${!data.members.length && Store.can('members_add') ? `<button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add ${esc(L1().toLowerCase())}</button>` : ''}</div>`;
  }

  function waLink(m) {
    const cc = String(Cloud.cfg.whatsappCountryCode || '91'), digits = m.phone.replace(/\D/g, '');
    const to = digits.length === 10 ? cc + digits : digits;
    const shop = Store.settings.shop_name || '';
    const msg = m.days_left < 0 ? `Hi ${m.name}, your ${m.plan_name} membership at ${shop} ended on ${Fmt.date(m.end_date)}. Please renew to continue. Thank you!`
      : `Hi ${m.name}, your ${m.plan_name} membership at ${shop} ends on ${Fmt.date(m.end_date)} (${daysText(m).toLowerCase()}). Please renew to continue without a break. Thank you!`;
    return `https://wa.me/${to}?text=${encodeURIComponent(msg)}`;
  }

  /* ---------- add / edit ---------- */
  function planPicker(selected, name = 'plan') {
    const plans = data.plans.filter(p => p.active);
    if (!plans.length) return `<p class="notice">${Store.can('members_plans') ? 'Add a plan first (Plans button).' : 'No plans yet. Ask the owner to add plans.'}</p>`;
    return `<div class="plan-cards" role="radiogroup">${plans.map((p, i) => `<label class="plan-card"><input type="radio" name="${name}" value="${p.id}" ${(selected ? selected === p.id : i === 0) ? 'checked' : ''}><span><b>${esc(p.name)}</b><small>${esc(dur(p))}</small><em>${Fmt.money(p.price)}</em></span></label>`).join('')}</div>`;
  }
  const paySeg = (name = 'pay') => `<div class="seg" role="radiogroup">${Store.payments().map((m, i) => `<label><input type="radio" name="${name}" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div>`;

  function editor(m = null) {
    const isNew = !m;
    const d = modal(isNew ? `Add ${L1().toLowerCase()}` : `Edit ${m.name}`, `<form id="mForm" class="stack">
      <div class="form-grid">
        <label class="field span-2"><span>Full name</span><input name="name" required maxlength="80" value="${esc(m?.name || '')}" autocomplete="off"></label>
        <label class="field"><span>Mobile number</span><input name="phone" inputmode="tel" maxlength="20" value="${esc(m?.phone || '')}" placeholder="98765 43210"></label>
        <label class="field"><span>Email <em>optional</em></span><input name="email" type="email" maxlength="120" value="${esc(m?.email || '')}"></label>
        <label class="field span-2"><span>Address <em>optional</em></span><textarea name="address" rows="2" maxlength="300">${esc(m?.address || '')}</textarea></label>
        <label class="field"><span>Date of birth <em>optional</em></span><input name="dob" type="date" value="${esc(m?.dob || '')}" max="${Fmt.today()}"></label>
        <label class="field"><span>Gender <em>optional</em></span><select name="gender">${['', 'Male', 'Female', 'Other'].map(g => `<option value="${g}" ${(m?.gender || '') === g ? 'selected' : ''}>${g || '—'}</option>`).join('')}</select></label>
        <label class="field span-2"><span>Notes <em>optional</em></span><input name="notes" maxlength="500" value="${esc(m?.notes || '')}" placeholder="e.g. Morning batch, knee injury"></label>
      </div>
      ${isNew && Store.can('members_renew') ? `<fieldset class="sub-box"><legend>${Icon('idcard')} Start a plan now</legend>
        <label class="switch"><input type="checkbox" name="join" ${data.plans.some(p => p.active) ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>Start a plan and take payment</b><small>Makes a bill that shows in Records.</small></span></label>
        <div data-join>${planPicker()}<div class="form-grid"><label class="field"><span>Starts on</span><input name="start" type="date" value="${Fmt.today()}"></label>
          <label class="field"><span>Amount (${esc(Fmt.cur())})</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" ${Store.can('discount') ? '' : 'readonly'}></label></div>
          <div class="field"><span>Paid by</span>${paySeg()}</div></div></fieldset>` : ''}
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${isNew ? `Add ${esc(L1().toLowerCase())}` : 'Save'}</button></div></form>`, { size: 'modal-md' });
    const f = $('#mForm', d);
    const syncAmt = () => { if (!f.amount) return; const p = planById(f.plan?.value); if (p && document.activeElement !== f.amount) f.amount.value = Number(p.price); };
    const paint = () => { const j = $('[data-join]', f); if (j) j.hidden = !f.join.checked; };
    f.addEventListener('change', e => { if (e.target.name === 'plan' && f.amount) { f.amount.value = Number(planById(e.target.value)?.price || 0); } paint(); });
    syncAmt(); paint();
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      const p = { id: m?.id || null, name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), address: f.address.value.trim(), dob: f.dob.value, gender: f.gender.value, notes: f.notes.value.trim() };
      if (isNew && f.join?.checked && f.plan) p.join = { plan_id: f.plan.value, start: f.start.value, amount: f.amount.value, payment_method: f.pay.value, request_id: uuid() };
      try {
        const r = await Cloud.rpc('shop_member_save', { p });
        d.close(); toast(isNew ? `${r.name} added${r.term ? ` · ${r.plan_name} until ${Fmt.date(r.end_date)}` : ''}.` : 'Saved.', 'ok');
        if (r.term?.bill) printOffer(r.term.bill);
        load(true);
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
  }

  function printOffer(bill) {
    toast(`Bill ${bill.bill_no} saved · ${Fmt.money(bill.total)}`, 'ok', 5000);
    const t = $('#toasts')?.lastElementChild; if (!t) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-btn'; b.textContent = 'Print'; b.onclick = () => Receipt.print(bill); t.append(b);
  }

  /* ---------- renew / change plan ---------- */
  function renew(m, mode = m.status === 'none' ? 'change' : 'renew') {
    if (!data.plans.some(p => p.active)) return toast(Store.can('members_plans') ? 'Add a plan first (Plans button).' : 'No plans yet. Ask the owner to add plans.', 'warn');
    const d = modal(`${m.name} · membership`, `<form id="rForm" class="stack">
      <div class="m-now st-${m.status}"><span class="days-pill">${esc(daysText(m))}</span><small>${m.plan_name ? `Now: <b>${esc(m.plan_name)}</b>${m.end_date ? `, ${esc(Fmt.date(m.start_date))} – ${esc(Fmt.date(m.end_date))}` : ''}` : 'No plan yet'}</small></div>
      ${m.status !== 'none' ? `<div class="seg seg-wide" role="radiogroup">
        <label><input type="radio" name="mode" value="renew" ${mode === 'renew' ? 'checked' : ''}><span><b>Renew</b><small>Starts after the current plan ends</small></span></label>
        <label><input type="radio" name="mode" value="change" ${mode === 'change' ? 'checked' : ''}><span><b>Change plan now</b><small>New plan replaces the current one today</small></span></label></div>` : '<input type="hidden" name="mode" value="change">'}
      ${planPicker(m.plan_id && planById(m.plan_id)?.active ? m.plan_id : null)}
      <div class="form-grid"><label class="field"><span>Starts on</span><input name="start" type="date"></label>
        <label class="field"><span>Amount (${esc(Fmt.cur())})</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" ${Store.can('discount') ? '' : 'readonly title="Only staff who can give discounts can change the amount"'}></label></div>
      <p class="renew-preview" data-preview></p>
      <div class="field"><span>Paid by</span>${paySeg()}</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary btn-lg">${Icon('check')} Save & take payment</button></div></form>`, { size: 'modal-md' });
    const f = $('#rForm', d);
    const startFor = () => { const md = f.mode.value; return md === 'renew' && m.end_date && m.end_date >= Fmt.today() ? Fmt.addDays(m.end_date, 1) : Fmt.today(); };
    const endFor = (s, p) => { const dt = new Date(s + 'T12:00:00Z'); if (p.duration_unit === 'day') dt.setUTCDate(dt.getUTCDate() + p.duration_value); else if (p.duration_unit === 'month') dt.setUTCMonth(dt.getUTCMonth() + p.duration_value); else dt.setUTCFullYear(dt.getUTCFullYear() + p.duration_value); dt.setUTCDate(dt.getUTCDate() - 1); return dt.toISOString().slice(0, 10); };
    let startTouched = false;
    const paint = () => {
      const p = planById(f.plan.value); if (!p) return;
      if (!startTouched) f.start.value = startFor();
      const e = endFor(f.start.value || Fmt.today(), p);
      $('[data-preview]', f).innerHTML = `${Icon('calendar')} <b>${esc(p.name)}</b> · ${esc(Fmt.date(f.start.value))} → <b>${esc(Fmt.date(e))}</b>`;
    };
    f.addEventListener('change', e => { if (e.target.name === 'start') startTouched = true; if (e.target.name === 'mode') startTouched = false; if (e.target.name === 'plan') f.amount.value = Number(planById(f.plan.value).price); paint(); });
    f.amount.value = Number(planById(f.plan.value)?.price || 0); paint();
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      const p = planById(f.plan.value);
      try {
        const r = await Cloud.rpc('shop_member_renew', { p_request_id: uuid(), p_member_id: m.id, p_plan_id: p.id, p_mode: f.mode.value, p_start: startTouched ? f.start.value : null, p_payment_method: f.pay.value, p_amount: f.amount.value === '' ? null : Number(f.amount.value), p_note: '' });
        d.close(); toast(`${m.name}: ${p.name} until ${Fmt.date(r.end_date)}.`, 'ok');
        if (r.term?.bill) printOffer(r.term.bill);
        load(true);
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
  }

  /* ---------- member details ---------- */
  async function details(m) {
    const d = modal(m.name, `<div class="m-detail">
      <div class="m-head st-${m.status}"><span class="avatar lg">${esc(initials(m.name))}</span><div><b>${esc(m.name)}</b><small>${esc(m.member_no)} · joined ${esc(Fmt.date(m.created_at))}</small><span class="days-pill">${m.status === 'expiring' ? Icon('bell') : ''}${esc(daysText(m))}</span></div></div>
      <dl class="kv">${m.plan_name ? `<dt>Plan</dt><dd>${esc(m.plan_name)}</dd><dt>Dates</dt><dd>${esc(Fmt.date(m.start_date))} – ${esc(Fmt.date(m.end_date))}</dd>` : ''}
        ${m.phone ? `<dt>Mobile</dt><dd><a href="tel:${esc(m.phone.replace(/[^\d+]/g, ''))}">${esc(m.phone)}</a></dd>` : ''}${m.email ? `<dt>Email</dt><dd>${esc(m.email)}</dd>` : ''}
        ${m.address ? `<dt>Address</dt><dd class="pre">${esc(m.address)}</dd>` : ''}${m.dob ? `<dt>Birthday</dt><dd>${esc(Fmt.date(m.dob))}</dd>` : ''}${m.notes ? `<dt>Notes</dt><dd>${esc(m.notes)}</dd>` : ''}
        <dt>App login</dt><dd>${m.has_login ? `${Icon('check')} ${esc(m.login_id)}` : '<span class="muted">Not set</span>'}</dd></dl>
      <div class="toolbar wrap">
        ${Store.can('members_renew') && m.status !== 'archived' ? `<button type="button" class="btn btn-primary" data-act="renew">${Icon('repeat')} Renew</button>${m.status !== 'none' ? `<button type="button" class="btn" data-act="change">Change plan</button>` : ''}` : ''}
        ${Store.can('members_add') ? `<button type="button" class="btn" data-act="edit">${Icon('edit')} Edit</button>` : ''}
        ${Store.can('members_plans') && m.end_date ? `<button type="button" class="btn btn-ghost" data-act="dates">${Icon('calendar')} Fix dates</button>` : ''}
        ${Store.can('members_login') && Store.sys.members?.login !== false ? `<button type="button" class="btn btn-ghost" data-act="login">${Icon('lock')} ${m.has_login ? 'Login' : 'Give app login'}</button>` : ''}
        ${m.phone ? `<a class="btn btn-ghost" href="${esc(waLink(m))}" target="_blank" rel="noopener">${Icon('whatsapp')} WhatsApp</a>` : ''}
        ${Store.can('members_add') ? `<button type="button" class="btn btn-ghost" data-act="archive">${m.active ? 'Archive' : 'Bring back'}</button>` : ''}
      </div>
      <div class="m-hist"><section><h3>Membership history</h3><div data-terms><p class="hint">Loading…</p></div></section>
        <section><h3>Visits</h3><div data-visits><p class="hint">Loading…</p></div></section></div></div>`, { size: 'modal-md' });
    d.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
      if (a === 'renew' || a === 'change') { d.close(); renew(m, a); }
      if (a === 'edit') { d.close(); editor(m); }
      if (a === 'dates') { d.close(); fixDates(m); }
      if (a === 'login') { d.close(); loginEditor(m); }
      if (a === 'archive') {
        if (m.active && !(await ask({ title: `Archive ${esc(m.name)}?`, body: 'They leave the list and cannot sign in to the member app. Their history is kept and you can bring them back.', confirm: 'Archive' }))) return;
        try { await Cloud.rpc('shop_member_save', { p: { ...m, active: !m.active } }); d.close(); toast(m.active ? 'Archived.' : 'Back in the list.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
    try {
      const h = await Cloud.rpc('shop_member_history', { p_member_id: m.id }); if (!d.open) return;
      const kind = { new: 'Joined', renew: 'Renewed', change: 'Changed plan', edit: 'Dates changed' };
      $('[data-terms]', d).innerHTML = h.terms.length ? `<ul class="timeline">${h.terms.map(t => `<li><b>${kind[t.kind]} · ${esc(t.plan_name)}</b><small>${esc(Fmt.date(t.start_date))} – ${esc(Fmt.date(t.end_date))}${Number(t.amount) ? ` · ${Fmt.money(t.amount)}` : ''}${t.bill_no ? ` · ${esc(t.bill_no)}` : ''}${t.by ? ` · by ${esc(t.by)}` : ''}</small></li>`).join('')}</ul>` : '<p class="hint">No plans yet.</p>';
      const month = h.attendance.filter(a => a.at.slice(0, 7) === Fmt.today().slice(0, 7)).length;
      $('[data-visits]', d).innerHTML = h.attendance.length ? `<p><b>${month}</b> visit${month === 1 ? '' : 's'} this month</p><ul class="visit-list">${h.attendance.slice(0, 20).map(a => `<li>${esc(Fmt.dateTime(a.at))} <small class="muted">${a.method === 'qr' ? 'QR scan' : 'by ' + esc(a.by || 'staff')}</small></li>`).join('')}</ul>` : '<p class="hint">No visits yet.</p>';
    } catch (ex) { $('[data-terms]', d).innerHTML = `<p class="hint">${esc(ex.message)}</p>`; }
  }

  async function fixDates(m) {
    const d = modal(`Fix dates · ${m.name}`, `<form class="stack" id="dForm"><p class="hint">For example to add free days. No bill is made; the change is noted in their history.</p>
      <div class="form-grid"><label class="field"><span>Start</span><input type="date" name="s" value="${esc(m.start_date)}" required></label><label class="field"><span>End</span><input type="date" name="e" value="${esc(m.end_date)}" required></label></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save dates</button></div></form>`, { size: 'modal-sm' });
    $('#dForm', d).onsubmit = async e => { e.preventDefault(); const f = e.target; try { await Cloud.rpc('shop_member_set_dates', { p_member_id: m.id, p_start: f.s.value, p_end: f.e.value }); d.close(); toast('Dates saved.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); } };
  }

  function loginEditor(m) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const d = modal(`App login · ${m.name}`, `<form class="stack" id="lForm">
      <p class="hint">They sign in to this same app with their mobile number and this password, and see their plan, days left and visits${Store.sys.members?.attendance !== false ? ', and scan the QR at the front desk to check in' : ''}.</p>
      <label class="field"><span>Mobile number or email</span><input name="login" required maxlength="120" value="${esc(m.login_id || m.phone || m.email)}" inputmode="email"></label>
      <label class="field"><span>Password <em>6+ characters</em></span><div class="inline-add"><input name="pw" required minlength="6" maxlength="72" value="${pin}" autocomplete="off"><button type="button" class="btn btn-sm btn-ghost" data-new>New</button></div></label>
      <div class="modal-actions">${m.has_login ? '<button type="button" class="btn btn-ghost btn-danger-text" data-remove>Remove login</button>' : ''}<button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${m.has_login ? 'Save new password' : 'Create login'}</button></div></form>`, { size: 'modal-sm' });
    const f = $('#lForm', d);
    $('[data-new]', d).onclick = () => { f.pw.value = String(Math.floor(100000 + Math.random() * 900000)); };
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      try {
        const r = await Cloud.rpc('shop_member_login_set', { p_member_id: m.id, p_login: f.login.value.trim(), p_password: f.pw.value });
        d.close(); load(true);
        const url = location.origin + location.pathname.replace(/index\.html$/, '');
        const msg = `Hi ${m.name}, your ${Store.settings.shop_name || ''} app login:\n${url}\nMobile/Email: ${r.login_id}\nPassword: ${f.pw.value}`;
        const share = modal('Login ready', `<p>Give these to ${esc(m.name)}:</p><pre class="login-card">${esc(msg)}</pre>
          <div class="modal-actions">${m.phone ? `<a class="btn" href="https://wa.me/${esc((m.phone.replace(/\D/g, '').length === 10 ? (Cloud.cfg.whatsappCountryCode || '91') : '') + m.phone.replace(/\D/g, ''))}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${Icon('whatsapp')} Send on WhatsApp</a>` : ''}<button type="button" class="btn btn-primary" data-close>Done</button></div>`, { size: 'modal-sm' });
        share.focus?.();
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
    $('[data-remove]', d)?.addEventListener('click', async () => {
      if (!(await ask({ title: 'Remove app login?', body: `${esc(m.name)} will not be able to sign in any more.`, confirm: 'Remove', danger: true }))) return;
      try { await Cloud.rpc('shop_member_login_remove', { p_member_id: m.id }); d.close(); toast('Login removed.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); }
    });
  }

  /* ---------- plans ---------- */
  function plans() {
    const d = modal('Plans', `<div class="stack"><ul class="plan-list" data-plans></ul>
      <form class="card sub-box" id="pForm"><h3 data-ptitle>New plan</h3><input type="hidden" name="id">
        <div class="form-grid"><label class="field span-2"><span>Name</span><input name="name" required maxlength="60" placeholder="e.g. Monthly, Quarterly, Yearly"></label>
          <div class="field"><span>Lasts</span><div class="inline-add"><input name="dv" type="number" min="1" max="3650" required value="1" aria-label="How long"><select name="du" aria-label="Unit"><option value="day">days</option><option value="month" selected>months</option><option value="year">years</option></select></div></div>
          <label class="field"><span>Price (${esc(Fmt.cur())})</span><input name="price" type="number" min="0" step="0.01" required inputmode="decimal"></label>
          ${Store.settings.tax_enabled && Store.settings.tax_scope === 'item' ? `<label class="field"><span>Tax % <em>included in price</em></span><input name="tax" type="number" min="0" max="100" step="0.01" placeholder="${Number(Store.settings.tax_value)}"></label>` : ''}
          <label class="field span-2"><span>Description <em>optional</em></span><input name="desc" maxlength="200"></label></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-pclear>Clear</button><button class="btn btn-primary">Save plan</button></div></form></div>`, { size: 'modal-md' });
    const f = $('#pForm', d);
    const paint = () => { $('[data-plans]', d).innerHTML = data.plans.length ? data.plans.map(p => `<li data-pid="${p.id}" class="${p.active ? '' : 'off'}"><div><b>${esc(p.name)}</b><small>${esc(dur(p))} · ${Fmt.money(p.price)}${p.active ? '' : ' · hidden'}</small></div><div class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-pedit>${Icon('edit')} Edit</button><button type="button" class="btn btn-sm btn-ghost" data-pdel aria-label="Remove">${Icon('trash')}</button></div></li>`).join('') : '<li class="hint">No plans yet.</li>'; };
    const clear = () => { f.reset(); f.id.value = ''; $('[data-ptitle]', f).textContent = 'New plan'; };
    paint();
    d.addEventListener('click', async e => {
      const li = e.target.closest('[data-pid]'); if (e.target.closest('[data-pclear]')) return clear();
      if (!li) return; const p = planById(li.dataset.pid);
      if (e.target.closest('[data-pedit]')) { f.id.value = p.id; f.name.value = p.name; f.dv.value = p.duration_value; f.du.value = p.duration_unit; f.price.value = Number(p.price); if (f.tax) f.tax.value = p.tax_rate ?? ''; f.desc.value = p.description; $('[data-ptitle]', f).textContent = 'Edit ' + p.name; f.name.focus(); }
      if (e.target.closest('[data-pdel]')) {
        if (!(await ask({ title: `Remove ${esc(p.name)}?`, body: 'If anyone has used this plan it is hidden instead, so their history stays.', confirm: 'Remove' }))) return;
        try { await Cloud.rpc('shop_plan_delete', { p_id: p.id }); await load(true); paint(); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      try { await Cloud.rpc('shop_plan_save', { p: { id: f.id.value || null, name: f.name.value.trim(), duration_value: f.dv.value, duration_unit: f.du.value, price: f.price.value, tax_rate: f.tax?.value || '', description: f.desc.value.trim(), active: true } }); toast('Plan saved.', 'ok'); await load(true); paint(); clear(); }
      catch (ex) { toast(ex.message, 'error'); } finally { busy(e.submitter, false); }
    };
  }

  /* ---------- attendance & check-in QR ---------- */
  async function attendance() {
    let day = Fmt.today();
    const d = modal('Attendance', `<div class="att-wrap">
      <div class="att-qr card"><h3>${Icon('scan')} Check-in QR</h3><p class="hint">Print it and stick it at the front desk. ${esc(L())} scan it in their app${Store.sys.members?.login === false ? '' : ' (or with the phone camera)'} to check in.</p><div class="qr-box" data-qr><p class="hint">Loading…</p></div>
        <div class="toolbar wrap"><button type="button" class="btn btn-primary" data-qprint>${Icon('printer')} Print QR</button>${Store.can('members_plans') ? '<button type="button" class="btn btn-ghost" data-qnew>New code</button>' : ''}</div></div>
      <div class="att-list"><div class="att-head"><input type="date" data-day value="${day}" max="${day}" aria-label="Day"><b data-count></b></div>
        <form class="inline-add" data-manual><input list="mNames" name="who" placeholder="Check someone in by name or number" aria-label="Check in"><datalist id="mNames">${data.members.filter(m => m.active).map(m => `<option value="${esc(m.name)} · ${esc(m.member_no)}">`).join('')}</datalist><button class="btn btn-sm">Check in</button></form>
        <ul class="visit-list" data-rows></ul></div></div>`, { size: 'modal-lg' });
    let token = '';
    const paintQR = () => { $('[data-qr]', d).innerHTML = QR.svg(checkinURL(token), 220) + `<small class="mono">${esc(Store.settings.shop_name || '')}</small>`; };
    const loadRows = async () => {
      try { const r = await Cloud.rpc('shop_attendance_list', { p_day: day }); if (!d.open) return;
        $('[data-count]', d).textContent = `${r.rows.length} check-in${r.rows.length === 1 ? '' : 's'}`;
        $('[data-rows]', d).innerHTML = r.rows.length ? r.rows.map(x => `<li><b>${esc(x.name)}</b> <small class="muted">${esc(x.member_no)}</small><span>${esc(Fmt.time(x.at))} · ${x.method === 'qr' ? 'QR' : 'by ' + esc(x.by || 'staff')}</span></li>`).join('') : '<li class="hint">Nobody yet.</li>';
      } catch (ex) { toast(ex.message, 'error'); }
    };
    try { token = (await Cloud.rpc('shop_checkin_code')).token; paintQR(); } catch (ex) { $('[data-qr]', d).textContent = ex.message; }
    loadRows();
    $('[data-day]', d).onchange = e => { day = e.target.value || Fmt.today(); loadRows(); };
    $('[data-manual]', d).onsubmit = async e => {
      e.preventDefault(); const v = e.target.who.value.trim(); if (!v) return;
      const m = data.members.find(x => v.endsWith(x.member_no)) || data.members.find(x => x.name.toLowerCase() === v.toLowerCase() || (x.phone && x.phone.replace(/\D/g, '') === v.replace(/\D/g, '')));
      if (!m) return toast('No one with that name or number.', 'warn');
      await checkIn(m); e.target.reset(); if (day === Fmt.today()) loadRows();
    };
    d.addEventListener('click', async e => {
      if (e.target.closest('[data-qprint]')) printQR(token);
      if (e.target.closest('[data-qnew]')) {
        if (!(await ask({ title: 'Make a new check-in code?', body: 'Printed QR codes with the old code stop working. Print the new one afterwards.', confirm: 'Make new code', danger: true }))) return;
        try { token = (await Cloud.rpc('shop_checkin_code', { p_new: true })).token; paintQR(); toast('New code ready. Print it.', 'ok'); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
  }
  function printQR(token) {
    const w = window.open('', '_blank', 'width=480,height=640'); if (!w) return toast('Allow pop-ups to print.', 'warn');
    w.document.write(`<!doctype html><title>Check-in QR</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:30px;color:#111}h1{font-size:26px;margin:0 0 6px}p{margin:4px 0 18px;font-size:16px}svg{width:320px;height:320px}</style>
      <h1>${esc(Store.settings.shop_name || '')}</h1><p>Scan to check in</p>${QR.svg(checkinURL(token), 320)}<p style="margin-top:18px;font-size:13px;color:#444">Open the app → Scan to check in, or use your phone camera.</p><script>onload=()=>{print()}<\/script>`);
    w.document.close();
  }
  async function checkIn(m) {
    try {
      const r = await Cloud.rpc('shop_attendance_mark', { p_member_id: m.id });
      toast(r.already ? `${m.name} already checked in at ${Fmt.time(r.at)}.` : `${m.name} checked in.`, 'ok');
      if (m.status === 'expired') toast(`${m.name}’s plan has ended — remind them to renew.`, 'warn', 6000);
      if (!r.already) { data.checked_in_today = [...new Set([...(data.checked_in_today || []), m.id])]; paintList(); }
    } catch (ex) { toast(ex.message, 'error'); }
  }

  function mount(view) {
    root = view; data = null;
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>${esc(L())}</h1><p class="sub" id="mStatus" role="status"></p></div>
        <div class="head-actions">
          ${Store.can('attendance') && Store.sys.members?.attendance !== false ? `<button type="button" class="btn" id="mAtt">${Icon('scan')} Attendance</button>` : ''}
          ${Store.can('members_plans') ? `<button type="button" class="btn" id="mPlans">${Icon('layers')} Plans</button>` : ''}
          ${Store.can('members_add') ? `<button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add ${esc(L1().toLowerCase())}</button>` : ''}</div></header>
      <div id="mAlert"></div>
      <div class="filters m-filters"><div class="seg seg-scroll" id="mFilters"></div><label class="search-box">${Icon('search')}<input type="search" id="mSearch" placeholder="Search name, number or ID" value="${esc(q)}" aria-label="Search"></label></div>
      <div class="mgrid" id="mList"><div class="empty slim"><p>Loading…</p></div></div></div>`;
    $('#mSearch', view).oninput = e => { q = e.target.value; if (data) paintList(); };
    $('#mAtt', view)?.addEventListener('click', () => data && attendance());
    $('#mPlans', view)?.addEventListener('click', () => data && plans());
    $('.page', view).addEventListener('click', e => {
      const fb = e.target.closest('[data-filter]'); if (fb) { filter = fb.dataset.filter; render(); return; }
      if (e.target.closest('[data-add]')) return data && editor();
      const card = e.target.closest('[data-id]'); if (!card || !data) return;
      const m = data.members.find(x => x.id === card.dataset.id);
      if (e.target.closest('[data-renew]')) return renew(m);
      if (e.target.closest('[data-checkin]')) return checkIn(m);
      if (e.target.closest('[data-open]')) return details(m);
    });
    load();
  }
  return { mount, unmount() { root = null; }, refresh() { if (root) load(true); } };
})();
