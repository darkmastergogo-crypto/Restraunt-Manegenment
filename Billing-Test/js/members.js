/* Members (gym, library, coaching…): plans with shift timings, renewals, part payments and dues, seats and lockers,
   expiry reminders, member logins, check-in / check-out with late and early times, notices for the member app.
   Recently expired members come first, then members with only a few days left (orange). */
'use strict';
const Members = (() => {
  let root = null, data = null, filter = 'all', q = '', req = 0;
  const L = () => Store.label('members'), L1 = () => Store.label1('members');
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const planById = id => data?.plans.find(p => p.id === id);
  const dur = p => `${p.duration_value} ${p.duration_unit}${p.duration_value === 1 ? '' : 's'}`;
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const checkinURL = tok => location.origin + location.pathname.replace(/index\.html$/, '') + '#/checkin/' + tok;
  const opts = () => ({ locker_fee: 200, review_offer: 0, review_on: false, review_url: '', lock_after_days: 10, auto_delete_days: 0, seats: '', ...(data?.opts || {}) });
  /* "1-60, A1-A20, VIP" → ['1'…'60', 'A1'…'A20', 'VIP'] */
  function seatList(spec = opts().seats) {
    const out = [];
    for (const part of String(spec || '').split(/[,\n]+/).map(s => s.trim()).filter(Boolean)) {
      const r = part.match(/^([A-Za-z]*[-\s]?)(\d+)\s*(?:-|to)\s*(?:[A-Za-z]*[-\s]?)?(\d+)$/i);
      if (r) { const [a, b] = [Number(r[2]), Number(r[3])]; for (let n = Math.min(a, b); n <= Math.max(a, b) && out.length < 1000; n++) out.push(r[1] + n); }
      else if (out.length < 1000) out.push(part);
    }
    return [...new Set(out)];
  }
  const seatKey = s => String(s || '').trim().toLowerCase();
  const holdsSeat = m => m.seat_no && m.active && m.status !== 'expired' && m.status !== 'archived';
  const lockerFee = () => Number(opts().locker_fee) || 0;
  const due = m => Number(m?.due) || 0;
  const credit = m => Number(m?.review_credit) || 0;
  const inside = m => (data?.inside || []).includes(m.id);
  const inToday = m => (data?.checked_in_today || []).includes(m.id);
  const attOn = () => Store.can('attendance') && Store.sys.members?.attendance !== false;

  function daysText(m) {
    if (m.status === 'none') return 'No plan';
    if (m.status === 'archived') return 'Archived';
    const d = m.days_left;
    if (d < 0) return `Expired ${-d} day${d === -1 ? '' : 's'} ago`;
    if (d === 0) return 'Ends today';
    return `${d} day${d === 1 ? '' : 's'} left`;
  }
  /* Recently expired first, then ending soon, then the rest. */
  const rank = m => ({ expired: 0, expiring: 1, active: 2, none: 3, archived: 4 }[m.status]);
  function sorted(list) {
    return [...list].sort((a, b) => rank(a) - rank(b) || (a.status === 'expired' ? b.days_left - a.days_left : (a.days_left ?? 1e9) - (b.days_left ?? 1e9)) || a.name.localeCompare(b.name));
  }
  function visible() {
    const s = q.trim().toLowerCase();
    return sorted(data.members.filter(m => (filter === 'all' ? m.status !== 'archived' : filter === 'dues' ? due(m) > 0 && m.status !== 'archived' : m.status === filter)
      && (!s || m.name.toLowerCase().includes(s) || m.phone.replace(/\D/g, '').includes(s.replace(/\D/g, '') || '¤') || m.member_no.toLowerCase().includes(s)
          || (m.seat_no && m.seat_no.toLowerCase() === s) || (m.locker_no && m.locker_no.toLowerCase() === s))));
  }

  async function load(quiet) {
    const id = ++req; if (!quiet && !data) $('#mStatus', root).textContent = 'Loading…';
    try {
      const d = await Cloud.rpc('shop_members_list');
      if (id !== req || !root?.isConnected) return;
      data = d; render();
    } catch (e) { if (id === req && root?.isConnected) $('#mStatus', root).textContent = e.message; }
  }

  function counts() {
    const c = { all: 0, expiring: 0, expired: 0, active: 0, none: 0, archived: 0, dues: 0, due_total: 0 };
    data.members.forEach(m => { c[m.status]++; if (m.status !== 'archived') { c.all++; if (due(m) > 0) { c.dues++; c.due_total += due(m); } } });
    c.seats = new Set(data.members.filter(holdsSeat).map(m => seatKey(m.seat_no))).size;
    c.seatsOn = seatList().length > 0 || data.members.some(m => m.seat_no);
    return c;
  }
  function render() {
    const c = counts(), rd = data.remind_days, refused = data.refused_today || [];
    $('#mStatus', root).textContent = `${c.all} ${L().toLowerCase()} · ${c.active + c.expiring} active${c.dues ? ` · ${Fmt.money0(c.due_total)} due` : ''}`;
    $('#mAlert', root).innerHTML =
      (refused.length ? `<div class="remind-banner bad" role="alert">${Icon('alert')}<div><b>${refused.length === 1 ? `${esc(refused[0].name)} tried to check in today, but their plan has ended` : `${refused.length} ${L().toLowerCase()} tried to check in today with an ended plan`}</b><small>${refused.map(r => `${esc(r.name)} at ${esc(Fmt.time(r.at))}`).join(' · ')}</small></div><button type="button" class="btn btn-sm" data-filter="expired">Show them</button></div>` : '')
      + (c.expiring ? `<div class="remind-banner" role="status">${Icon('bell')}<div><b>${c.expiring} ${c.expiring === 1 ? L1().toLowerCase() + ' has' : L().toLowerCase() + ' have'} ${rd} day${rd === 1 ? '' : 's'} or less left</b><small>Renew them, or send a WhatsApp reminder.</small></div><button type="button" class="btn btn-sm" data-filter="expiring">Show them</button></div>` : '');
    $('#mFilters', root).innerHTML = [['all', 'All'], ['expired', 'Expired'], ['expiring', 'Ending soon'], ['dues', 'Money due'], ['active', 'Active'], ['none', 'No plan'], ['archived', 'Archived'], ['seats', 'Seats']]
      .filter(([k]) => k === 'all' || (k === 'seats' ? c.seatsOn : c[k]) || filter === k).map(([k, l]) => `<button type="button" data-filter="${k}" class="${filter === k ? 'on' : ''} f-${k}">${k === 'seats' ? Icon('seat') + ' ' : ''}${l} <span>${k === 'seats' && seatList().length ? `${c.seats}/${seatList().length}` : c[k]}</span></button>`).join('');
    if (data.auto_deleted > 0 && !render.toldDeleted) { render.toldDeleted = true; toast(`${data.auto_deleted} ${data.auto_deleted === 1 ? L1().toLowerCase() : L().toLowerCase()} deleted automatically (plan ended more than ${opts().auto_delete_days} days ago).`, 'info', 7000); }
    paintList();
  }

  /* ---------- Seats tab: which seats are taken, which are free ---------- */
  function paintSeats() {
    const all = seatList(), s = q.trim().toLowerCase(), byKey = new Map();
    data.members.filter(m => m.seat_no && m.status !== 'archived').forEach(m => { const k = seatKey(m.seat_no); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(m); });
    const labels = [...all, ...[...byKey.keys()].filter(k => !all.some(x => seatKey(x) === k)).map(k => byKey.get(k)[0].seat_no.trim())];
    const tiles = labels.map(label => {
      const occ = sorted(byKey.get(seatKey(label)) || []), live = occ.filter(holdsSeat);
      const st = live.some(m => m.status === 'expiring') ? 'expiring' : live.length ? 'taken' : occ.length ? 'ended' : 'free';
      return { label, occ, live, st };
    }).filter(t => !s || t.label.toLowerCase().includes(s) || t.occ.some(m => m.name.toLowerCase().includes(s)));
    const isTaken = l => (byKey.get(seatKey(l)) || []).some(holdsSeat);
    const takenN = labels.filter(isTaken).length, free = (all.length ? all : []).filter(l => !isTaken(l)).length;
    $('#mList', root).innerHTML = `<div class="seat-wrap"><div class="seat-head"><b>${takenN} taken${all.length ? ` · ${free} free of ${all.length}` : ''}</b>
        <span class="seat-key"><i class="sk-taken"></i>Taken <i class="sk-expiring"></i>Ending soon <i class="sk-ended"></i>Plan ended <i class="sk-free"></i>Free</span>
        ${Store.can('members_plans') ? `<button type="button" class="btn btn-sm btn-ghost" data-seatcfg>${Icon('edit')} ${all.length ? 'Change seats' : 'Set up seats'}</button>` : ''}</div>
      ${!all.length ? `<p class="hint">Set up your seats (for example <b>1-60</b> or <b>A1-A20, B1-B20</b>) to see free seats too.</p>` : ''}
      <div class="seat-grid">${tiles.map(t => `<div class="seat st-${t.st}" ${t.occ.length ? '' : `data-freeseat="${esc(t.label)}"`} role="${t.occ.length ? 'group' : 'button'}" tabindex="${t.occ.length ? -1 : 0}" aria-label="Seat ${esc(t.label)}${t.occ.length ? '' : ', free'}">
          <b>${esc(t.label)}</b>${t.occ.length ? t.occ.map(m => `<button type="button" class="seat-who" data-seatm="${m.id}"><span>${esc(m.name)}</span>${m.shift_start ? `<small>${esc(Shift.range(m.shift_start, m.shift_end))}</small>` : ''}${holdsSeat(m) ? '' : '<small class="due-txt">plan ended</small>'}</button>`).join('') : '<small>Free</small>'}</div>`).join('') || '<p class="hint">No seats match.</p>'}</div></div>`;
  }
  async function seatSetup() {
    const v = await ask({ title: 'Seats', body: 'Type your seats. Use ranges and commas, for example <b>1-60</b> or <b>A1-A20, B1-B20, VIP</b>.', confirm: 'Save seats', input: { label: 'Seats', value: opts().seats, placeholder: '1-60', maxlength: 500 } });
    if (v === null) return;
    try { data.opts = await Cloud.rpc('shop_member_app_save', { p: { seats: v } }); toast(`${seatList().length} seats saved.`, 'ok'); render(); } catch (ex) { toast(ex.message, 'error'); }
  }
  function extrasLine(m) {
    const bits = [];
    if (m.shift_start && m.shift_end) bits.push(Shift.range(m.shift_start, m.shift_end));
    if (m.seat_no) bits.push('Seat ' + m.seat_no);
    if (m.locker) bits.push('Locker' + (m.locker_no ? ' ' + m.locker_no : ''));
    return bits.map(esc).join(' · ');
  }
  function paintList() {
    if (filter === 'seats') return paintSeats();
    const list = visible();
    const canR = Store.can('members_renew'), canA = attOn();
    $('#mList', root).innerHTML = list.length ? list.map(m => {
      const ex = extrasLine(m), inNow = inside(m);
      return `<article class="mcard st-${m.status}${due(m) > 0 ? ' has-due' : ''}" data-id="${m.id}">
        <button type="button" class="mcard-main" data-open aria-label="Open ${esc(m.name)}">
          <span class="avatar">${esc(initials(m.name))}</span>
          <span class="mcard-who"><b>${esc(m.name)}</b><small>${esc(m.member_no)}${m.phone ? ' · ' + esc(m.phone) : ''}</small></span>
          <span class="mcard-plan"><span class="pill-row"><span class="days-pill">${m.status === 'expiring' ? Icon('bell') : ''}${esc(daysText(m))}</span>${due(m) > 0 ? `<span class="days-pill due-pill">${Icon('rupee')}${esc(Fmt.money0(due(m)))} due</span>` : ''}${credit(m) > 0 ? `<span class="days-pill offer-pill" title="Google review offer">${Icon('star')}${esc(Fmt.money0(credit(m)))} off</span>` : ''}</span>
            <small>${m.plan_name ? esc(m.plan_name) + (m.end_date ? ' · ends ' + esc(Fmt.date(m.end_date)) : '') : 'Choose a plan to start'}</small>${ex ? `<small class="m-extra">${ex}</small>` : ''}</span>
          ${inToday(m) ? `<span class="in-today ${inNow ? 'inside' : ''}" title="${inNow ? 'Inside now' : 'Visited today'}">${Icon('check')}</span>` : ''}
        </button>
        <div class="mcard-act">
          ${canR && m.status !== 'archived' ? `<button type="button" class="btn btn-sm ${m.status === 'expiring' || m.status === 'expired' ? 'btn-primary' : ''}" data-renew>${Icon('repeat')} ${m.status === 'none' ? 'Start plan' : 'Renew'}</button>` : ''}
          ${canR && due(m) > 0 && m.status !== 'archived' ? `<button type="button" class="btn btn-sm btn-due" data-paydue>${Icon('rupee')} Collect ${esc(Fmt.money0(due(m)))}</button>` : ''}
          ${canA && m.status !== 'archived' && inNow ? `<button type="button" class="btn btn-sm btn-ghost" data-checkin>${Icon('logout')} Check out</button>` : ''}
          ${canA && m.status !== 'archived' && !inToday(m) ? `<button type="button" class="btn btn-sm btn-ghost" data-checkin>${Icon('check')} Check in</button>` : ''}
          ${(m.status === 'expiring' || m.status === 'expired' || due(m) > 0) && m.phone ? `<a class="btn btn-sm btn-ghost" data-wa href="${esc(waLink(m))}" target="_blank" rel="noopener">${Icon('whatsapp')} Remind</a>` : ''}
        </div></article>`;
    }).join('')
      : `<div class="empty"><div class="empty-ico">${Icon('idcard')}</div><h3>${data.members.length ? 'Nobody matches' : `No ${L().toLowerCase()} yet`}</h3><p>${data.members.length ? 'Try another search or filter.' : `Add your first ${L1().toLowerCase()} and start their plan.`}</p>${!data.members.length && Store.can('members_add') ? `<button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add ${esc(L1().toLowerCase())}</button>` : ''}</div>`;
  }

  function waLink(m) {
    const cc = String(Cloud.cfg.whatsappCountryCode || '91'), digits = m.phone.replace(/\D/g, '');
    const to = digits.length === 10 ? cc + digits : digits;
    const shop = Store.settings.shop_name || '';
    let msg = m.status === 'expired' ? `Hi ${m.name}, your ${m.plan_name} membership at ${shop} ended on ${Fmt.date(m.end_date)}. Please renew to continue. Thank you!`
      : m.status === 'expiring' ? `Hi ${m.name}, your ${m.plan_name} membership at ${shop} ends on ${Fmt.date(m.end_date)} (${daysText(m).toLowerCase()}). Please renew to continue without a break. Thank you!`
      : `Hi ${m.name}, this is ${shop}.`;
    if (due(m) > 0) msg += ` Balance still to pay: ${Fmt.money(due(m))}.`;
    return `https://wa.me/${to}?text=${encodeURIComponent(msg)}`;
  }

  /* Opens the bill straight away, so the member can scan its payment QR and it can be printed. */
  function showBill(bill, extraMsg) {
    if (!bill) return;
    if (typeof Records !== 'undefined' && Records.openBill) Records.openBill(bill); else Receipt.print(bill);
    if (extraMsg) toast(extraMsg, 'warn', 7000);
  }

  /* ---------- add / edit ---------- */
  function planPicker(selected, name = 'plan') {
    const plans = data.plans.filter(p => p.active);
    if (!plans.length) return `<p class="notice">${Store.can('members_plans') ? 'Add a plan first (Plans button).' : 'No plans yet. Ask the owner to add plans.'}</p>`;
    return `<div class="plan-cards" role="radiogroup">${plans.map((p, i) => `<label class="plan-card"><input type="radio" name="${name}" value="${p.id}" ${(selected ? selected === p.id : i === 0) ? 'checked' : ''}><span><b>${esc(p.name)}</b><small>${esc(dur(p))}${p.shift_start ? `<br>${esc(Shift.range(p.shift_start, p.shift_end))}` : ''}</small><em>${Fmt.money(p.price)}</em></span></label>`).join('')}</div>`;
  }
  const paySeg = (name = 'pay') => `<div class="seg" role="radiogroup">${Store.payments().map((m, i) => `<label><input type="radio" name="${name}" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div>`;
  const lockerFields = m => `<div class="field span-2 locker-box"><label class="switch"><input type="checkbox" name="locker" ${m?.locker ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>Locker</b><small>Adds ${esc(Fmt.money(lockerFee()))} to each plan bill.</small></span></label>
      <label class="field" data-lockerno ${m?.locker ? '' : 'hidden'}><span>Locker number</span><input name="locker_no" maxlength="20" value="${esc(m?.locker_no || '')}" placeholder="e.g. 12"></label></div>`;
  /* Amount + paid now, with what stays due. */
  const moneyFields = () => `<div class="form-grid"><label class="field"><span>Amount (${esc(Fmt.cur())})</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" ${Store.can('discount') ? '' : 'readonly title="Only staff who can give discounts can change the amount"'}></label>
      <label class="field"><span>Paid now (${esc(Fmt.cur())})</span><input name="paid" type="number" min="0" step="0.01" inputmode="decimal"></label></div>
      <p class="due-preview" data-due></p>`;
  function wireMoney(f, chargeFn) {
    let paidTouched = false;
    const paintDue = () => {
      const amt = Number(f.amount.value) || 0, paid = f.paid.value === '' ? amt : Number(f.paid.value) || 0, left = Math.round((amt - paid) * 100) / 100;
      const el = $('[data-due]', f);
      el.className = 'due-preview ' + (left > 0 ? 'bad' : 'ok');
      el.innerHTML = paid > amt ? `${Icon('alert')} Paid now cannot be more than the amount.` : left > 0 ? `${Icon('alert')} <b>${esc(Fmt.money(left))}</b> will be due — it shows on the ${esc(L1().toLowerCase())} until it is paid.` : `${Icon('check')} Paid in full`;
    };
    const reset = () => { f.amount.value = chargeFn(); if (!paidTouched) f.paid.value = f.amount.value; paintDue(); };
    f.addEventListener('input', e => { if (e.target.name === 'paid') paidTouched = true; if (e.target.name === 'amount' && !paidTouched) f.paid.value = f.amount.value; if (['paid', 'amount'].includes(e.target.name)) paintDue(); });
    return { reset, paintDue };
  }

  function editor(m = null, pre = {}) {
    const isNew = !m, canJoin = isNew && Store.can('members_renew');
    const taken = new Set(data.members.filter(x => holdsSeat(x) && x.id !== m?.id).map(x => seatKey(x.seat_no)));
    const freeSeats = seatList().filter(s => !taken.has(seatKey(s)));
    const d = modal(isNew ? `Add ${L1().toLowerCase()}` : `Edit ${m.name}`, `<form id="mForm" class="stack">
      <div class="form-grid">
        <label class="field span-2"><span>Full name</span><input name="name" required maxlength="80" value="${esc(m?.name || '')}" autocomplete="off"></label>
        <label class="field"><span>Mobile number</span><input name="phone" inputmode="tel" maxlength="20" value="${esc(m?.phone || '')}" placeholder="98765 43210"></label>
        <label class="field"><span>Email <em>optional</em></span><input name="email" type="email" maxlength="120" value="${esc(m?.email || '')}"></label>
        <label class="field"><span>Seat number <em>optional${seatList().length ? ` · ${freeSeats.length} free` : ''}</em></span><input name="seat_no" maxlength="20" value="${esc(m?.seat_no || pre.seat || '')}" placeholder="e.g. A-14" list="mFreeSeats" autocomplete="off"><datalist id="mFreeSeats">${freeSeats.slice(0, 300).map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
        ${lockerFields(m)}
        <label class="field span-2"><span>Address <em>optional</em></span><textarea name="address" rows="2" maxlength="300">${esc(m?.address || '')}</textarea></label>
        <label class="field"><span>Date of birth <em>optional</em></span><input name="dob" type="date" value="${esc(m?.dob || '')}" max="${Fmt.today()}"></label>
        <label class="field"><span>Gender <em>optional</em></span><select name="gender">${['', 'Male', 'Female', 'Other'].map(g => `<option value="${g}" ${(m?.gender || '') === g ? 'selected' : ''}>${g || '—'}</option>`).join('')}</select></label>
        <label class="field span-2"><span>Notes <em>optional</em></span><input name="notes" maxlength="500" value="${esc(m?.notes || '')}" placeholder="e.g. Morning batch, knee injury"></label>
      </div>
      ${canJoin ? `<fieldset class="sub-box"><legend>${Icon('idcard')} Start a plan now</legend>
        <label class="switch"><input type="checkbox" name="join" ${data.plans.some(p => p.active) ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>Start a plan and take payment</b><small>Makes a bill and opens it, so they can scan its QR to pay.</small></span></label>
        <div data-join>${planPicker()}<div class="form-grid"><label class="field"><span>Starts on</span><input name="start" type="date" value="${Fmt.today()}"></label></div>
          ${moneyFields()}
          <div class="field"><span>Paid by</span>${paySeg()}</div></div></fieldset>` : ''}
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${isNew ? `Add ${esc(L1().toLowerCase())}` : 'Save'}</button></div></form>`, { size: 'modal-md' });
    const f = $('#mForm', d);
    const money = f.amount ? wireMoney(f, () => Number(planById(f.plan?.value)?.price || 0) + (f.locker.checked ? lockerFee() : 0)) : null;
    const paint = () => { const j = $('[data-join]', f); if (j) j.hidden = !f.join.checked; $('[data-lockerno]', f).hidden = !f.locker.checked; };
    f.addEventListener('change', e => { if (['plan', 'locker'].includes(e.target.name)) money?.reset(); paint(); });
    money?.reset(); paint();
    f.onsubmit = async e => {
      e.preventDefault();
      const p = { id: m?.id || null, name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), address: f.address.value.trim(), dob: f.dob.value, gender: f.gender.value, notes: f.notes.value.trim(),
        seat_no: f.seat_no.value.trim(), locker: f.locker.checked, locker_no: f.locker.checked ? f.locker_no.value.trim() : f.locker_no.value.trim() };
      if (m) p.active = m.active;
      if (isNew && f.join?.checked && f.plan) {
        if (f.paid.value !== '' && Number(f.paid.value) > Number(f.amount.value)) return toast('Paid now cannot be more than the amount.', 'warn');
        p.join = { plan_id: f.plan.value, start: f.start.value, amount: f.amount.value, paid: f.paid.value === '' ? f.amount.value : f.paid.value, payment_method: f.pay.value, request_id: uuid() };
      }
      busy(e.submitter, true, 'Saving…');
      try {
        const r = await Cloud.rpc('shop_member_save', { p });
        d.close(); toast(isNew ? `${r.name} added${r.term ? ` · ${r.plan_name} until ${Fmt.date(r.end_date)}` : ''}.` : 'Saved.', 'ok');
        if (r.term?.bill) showBill(r.term.bill, Number(r.term.due) > 0 ? `${r.name}: ${Fmt.money(r.term.due)} is still due.` : '');
        // locker switched on in the middle of a plan: take the locker fee now, with its own bill
        else if (!isNew && !m.locker && r.locker && r.end_date && r.status !== 'expired' && Store.can('members_renew')) lockerCharge(r);
        load(true);
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
  }

  /* ---------- locker taken separately: its own bill ---------- */
  function lockerCharge(m) {
    const d = modal(`Locker · ${m.name}`, `<form id="kForm" class="stack">
      <p class="hint">${m.end_date ? `Their plan runs until <b>${esc(Fmt.date(m.end_date))}</b>. ` : ''}The locker is also added to every renewal bill from now on.</p>
      <div class="form-grid"><label class="field"><span>Locker number</span><input name="no" maxlength="20" value="${esc(m.locker_no || '')}" placeholder="e.g. 12"></label>
        <label class="field"><span>Locker fee now (${esc(Fmt.cur())})</span><input name="amt" type="number" min="0" step="0.01" inputmode="decimal" value="${lockerFee()}" required></label></div>
      <div class="field"><span>Paid by</span>${paySeg()}</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Not now</button><button class="btn btn-primary">${Icon('check')} Take payment & show bill</button></div></form>`, { size: 'modal-sm' });
    const f = $('#kForm', d);
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      try {
        const r = await Cloud.rpc('shop_member_locker_charge', { p_request_id: uuid(), p_member_id: m.id, p_amount: Number(f.amt.value), p_payment_method: f.pay.value, p_locker_no: f.no.value.trim() });
        d.close(); toast(`${m.name}: locker${r.locker_no ? ' no. ' + r.locker_no : ''} added.`, 'ok');
        if (r.bill) showBill(r.bill); load(true);
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
  }

  /* ---------- renew / change plan ---------- */
  function renew(m, mode = m.status === 'none' ? 'change' : 'renew') {
    if (!data.plans.some(p => p.active)) return toast(Store.can('members_plans') ? 'Add a plan first (Plans button).' : 'No plans yet. Ask the owner to add plans.', 'warn');
    const cr = credit(m);
    const d = modal(`${m.name} · membership`, `<form id="rForm" class="stack">
      <div class="m-now st-${m.status}"><span class="days-pill">${esc(daysText(m))}</span><small>${m.plan_name ? `Now: <b>${esc(m.plan_name)}</b>${m.end_date ? `, ${esc(Fmt.date(m.start_date))} – ${esc(Fmt.date(m.end_date))}` : ''}` : 'No plan yet'}</small></div>
      ${due(m) > 0 ? `<p class="due-preview bad">${Icon('alert')} Already owes <b>${esc(Fmt.money(due(m)))}</b> from before. Use “Collect” to take it.</p>` : ''}
      ${m.status !== 'none' ? `<div class="seg seg-wide" role="radiogroup">
        <label><input type="radio" name="mode" value="renew" ${mode === 'renew' ? 'checked' : ''}><span><b>Renew</b><small>Starts after the current plan ends</small></span></label>
        <label><input type="radio" name="mode" value="change" ${mode === 'change' ? 'checked' : ''}><span><b>Change plan now</b><small>New plan replaces the current one today</small></span></label></div>` : '<input type="hidden" name="mode" value="change">'}
      ${planPicker(m.plan_id && planById(m.plan_id)?.active ? m.plan_id : null)}
      <div class="form-grid">${lockerFields(m)}</div>
      ${cr > 0 ? `<label class="switch offer-switch"><input type="checkbox" name="use_credit" checked><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${Icon('star')} Google review offer −${esc(Fmt.money(cr))}</b><small>They left a Google review. Taken off this bill.</small></span></label>` : ''}
      <div class="form-grid"><label class="field"><span>Starts on</span><input name="start" type="date"></label></div>
      ${moneyFields()}
      <p class="renew-preview" data-preview></p>
      <div class="field"><span>Paid by</span>${paySeg()}</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary btn-lg">${Icon('check')} Save & show bill</button></div></form>`, { size: 'modal-md' });
    const f = $('#rForm', d);
    const startFor = () => { const md = f.mode.value; return md === 'renew' && m.end_date && m.end_date >= Fmt.today() ? Fmt.addDays(m.end_date, 1) : Fmt.today(); };
    const endFor = (s, p) => { const dt = new Date(s + 'T12:00:00Z'); if (p.duration_unit === 'day') dt.setUTCDate(dt.getUTCDate() + p.duration_value); else if (p.duration_unit === 'month') dt.setUTCMonth(dt.getUTCMonth() + p.duration_value); else dt.setUTCFullYear(dt.getUTCFullYear() + p.duration_value); dt.setUTCDate(dt.getUTCDate() - 1); return dt.toISOString().slice(0, 10); };
    const charge = () => { const p = planById(f.plan.value); if (!p) return 0; const price = Number(p.price); return price + (f.locker.checked ? lockerFee() : 0) - (f.use_credit?.checked ? Math.min(cr, price) : 0); };
    const money = wireMoney(f, charge);
    let startTouched = false;
    const paint = () => {
      const p = planById(f.plan.value); if (!p) return;
      $('[data-lockerno]', f).hidden = !f.locker.checked;
      if (!startTouched) f.start.value = startFor();
      const e = endFor(f.start.value || Fmt.today(), p);
      $('[data-preview]', f).innerHTML = `${Icon('calendar')} <b>${esc(p.name)}</b> · ${esc(Fmt.date(f.start.value))} → <b>${esc(Fmt.date(e))}</b>${p.shift_start ? ` · ${esc(Shift.range(p.shift_start, p.shift_end))}` : ''}`;
    };
    f.addEventListener('change', e => { if (e.target.name === 'start') startTouched = true; if (e.target.name === 'mode') startTouched = false; if (['plan', 'locker', 'use_credit'].includes(e.target.name)) money.reset(); paint(); });
    money.reset(); paint();
    f.onsubmit = async e => {
      e.preventDefault();
      if (f.paid.value !== '' && Number(f.paid.value) > Number(f.amount.value)) return toast('Paid now cannot be more than the amount.', 'warn');
      busy(e.submitter, true, 'Saving…');
      const p = planById(f.plan.value);
      try {
        const r = await Cloud.rpc('shop_member_renew', { p_request_id: uuid(), p_member_id: m.id, p_plan_id: p.id, p_mode: f.mode.value, p_start: startTouched ? f.start.value : null,
          p_payment_method: f.pay.value, p_amount: f.amount.value === '' ? null : Number(f.amount.value), p_note: '',
          p_paid: f.paid.value === '' ? null : Number(f.paid.value),
          p_opts: { locker: f.locker.checked, locker_no: f.locker_no.value.trim(), use_credit: !!f.use_credit?.checked } });
        d.close(); toast(`${m.name}: ${p.name} until ${Fmt.date(r.end_date)}.`, 'ok');
        if (r.term?.bill) showBill(r.term.bill, Number(r.term.due) > 0 ? `${m.name}: ${Fmt.money(r.term.due)} is still due.` : '');
        else if (Number(r.term?.due) > 0) toast(`${m.name}: nothing paid now · ${Fmt.money(r.term.due)} due.`, 'warn', 7000);
        load(true);
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
  }

  /* ---------- collect money that is still due ---------- */
  function collectDue(m) {
    const d = modal(`Collect from ${m.name}`, `<form id="cForm" class="stack">
      <p class="due-preview bad">${Icon('alert')} Still due: <b>${esc(Fmt.money(due(m)))}</b></p>
      <label class="field"><span>Paying now (${esc(Fmt.cur())})</span><input name="amt" type="number" min="0.01" step="0.01" max="${due(m)}" value="${due(m)}" inputmode="decimal" required></label>
      <div class="field"><span>Paid by</span>${paySeg()}</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${Icon('check')} Take payment & show bill</button></div></form>`, { size: 'modal-sm' });
    const f = $('#cForm', d);
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      try {
        const r = await Cloud.rpc('shop_member_pay_due', { p_request_id: uuid(), p_member_id: m.id, p_amount: Number(f.amt.value), p_payment_method: f.pay.value });
        d.close(); toast(Number(r.due) > 0 ? `${m.name}: ${Fmt.money(r.due)} still due.` : `${m.name} has paid everything.`, 'ok');
        showBill(r.bill); load(true);
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
  }

  /* ---------- member details ---------- */
  const KIND = { new: 'Joined', renew: 'Renewed', change: 'Changed plan', edit: 'Dates changed', payment: 'Paid balance', locker: 'Took' };
  const visitRow = a => a.refused
    ? `<li class="visit-refused"><span>${esc(Fmt.dateTime(a.at))}</span><span class="sh-tag sh-bad">Tried to check in · plan had ended</span></li>`
    : `<li><span>${esc(Fmt.date(a.at))} · <b>${esc(Shift.span(a))}</b> <small class="muted">${a.method === 'qr' ? 'QR' : 'by ' + esc(a.by || 'staff')}</small></span><span class="sh-tags">${Shift.tags(a)}</span></li>`;
  async function details(m) {
    const canR = Store.can('members_renew');
    const d = modal(m.name, `<div class="m-detail">
      <div class="m-head st-${m.status}"><span class="avatar lg">${esc(initials(m.name))}</span><div><b>${esc(m.name)}</b><small>${esc(m.member_no)} · joined ${esc(Fmt.date(m.created_at))}</small><span class="pill-row"><span class="days-pill">${m.status === 'expiring' ? Icon('bell') : ''}${esc(daysText(m))}</span>${due(m) > 0 ? `<span class="days-pill due-pill">${esc(Fmt.money0(due(m)))} due</span>` : ''}</span></div></div>
      ${due(m) > 0 ? `<div class="due-box">${Icon('rupee')}<div><b>${esc(Fmt.money(due(m)))} not paid yet</b><small>From a part payment. It stays here until it is collected.</small></div>${canR ? '<button type="button" class="btn btn-sm btn-primary" data-act="paydue">Collect</button>' : ''}</div>` : ''}
      <dl class="kv">${m.plan_name ? `<dt>Plan</dt><dd>${esc(m.plan_name)}</dd><dt>Dates</dt><dd>${esc(Fmt.date(m.start_date))} – ${esc(Fmt.date(m.end_date))}</dd>` : ''}
        ${m.shift_start ? `<dt>Shift</dt><dd>${esc(Shift.range(m.shift_start, m.shift_end))}</dd>` : ''}
        ${m.seat_no ? `<dt>Seat</dt><dd>${esc(m.seat_no)}</dd>` : ''}
        <dt>Locker</dt><dd>${m.locker ? `${Icon('check')} Yes${m.locker_no ? ` · no. ${esc(m.locker_no)}` : ''} <small class="muted">(+${esc(Fmt.money0(lockerFee()))} a plan)</small>` : '<span class="muted">No</span>'}</dd>
        ${m.phone ? `<dt>Mobile</dt><dd><a href="tel:${esc(m.phone.replace(/[^\d+]/g, ''))}">${esc(m.phone)}</a></dd>` : ''}${m.email ? `<dt>Email</dt><dd>${esc(m.email)}</dd>` : ''}
        ${m.address ? `<dt>Address</dt><dd class="pre">${esc(m.address)}</dd>` : ''}${m.dob ? `<dt>Birthday</dt><dd>${esc(Fmt.date(m.dob))}</dd>` : ''}${m.notes ? `<dt>Notes</dt><dd>${esc(m.notes)}</dd>` : ''}
        <dt>App login</dt><dd>${m.has_login ? `${Icon('check')} ${esc(m.login_id)}` : '<span class="muted">Not set</span>'}</dd>
        ${m.review_at || credit(m) > 0 ? `<dt>Google review</dt><dd>${m.review_at ? `Says they left one on ${esc(Fmt.date(m.review_at))}` : ''}${credit(m) > 0 ? `<br><b class="offer-txt">${Icon('star')} ${esc(Fmt.money(credit(m)))} off their next renewal</b>${canR ? ' <button type="button" class="linkish" data-act="noreview">Remove offer</button>' : ''}` : ''}</dd>` : ''}</dl>
      <div class="toolbar wrap">
        ${canR && m.status !== 'archived' ? `<button type="button" class="btn btn-primary" data-act="renew">${Icon('repeat')} Renew</button>${m.status !== 'none' ? `<button type="button" class="btn" data-act="change">Change plan</button>` : ''}` : ''}
        ${Store.can('members_add') ? `<button type="button" class="btn" data-act="edit">${Icon('edit')} Edit</button>` : ''}
        ${canR && !m.locker && m.end_date && m.status !== 'expired' && m.status !== 'archived' ? `<button type="button" class="btn btn-ghost" data-act="locker">${Icon('key')} Add locker</button>` : ''}
        ${Store.can('members_plans') && m.end_date ? `<button type="button" class="btn btn-ghost" data-act="dates">${Icon('calendar')} Fix dates</button>` : ''}
        ${Store.can('members_login') && Store.sys.members?.login !== false ? `<button type="button" class="btn btn-ghost" data-act="login">${Icon('lock')} ${m.has_login ? 'Login' : 'Give app login'}</button>` : ''}
        ${m.phone ? `<a class="btn btn-ghost" href="${esc(waLink(m))}" target="_blank" rel="noopener">${Icon('whatsapp')} WhatsApp</a>` : ''}
        ${Store.can('members_add') ? `<button type="button" class="btn btn-ghost" data-act="archive">${m.active ? 'Archive' : 'Bring back'}</button><button type="button" class="btn btn-danger-ghost" data-act="delete">${Icon('trash')} Delete</button>` : ''}
      </div>
      <div class="m-hist"><section><h3>Membership history</h3><div data-terms><p class="hint">Loading…</p></div></section>
        <section><h3>Visits</h3><div data-visits><p class="hint">Loading…</p></div></section></div></div>`, { size: 'modal-md' });
    d.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
      if (a === 'renew' || a === 'change') { d.close(); renew(m, a); }
      if (a === 'edit') { d.close(); editor(m); }
      if (a === 'dates') { d.close(); fixDates(m); }
      if (a === 'login') { d.close(); loginEditor(m); }
      if (a === 'paydue') { d.close(); collectDue(m); }
      if (a === 'locker') { d.close(); lockerCharge(m); }
      if (a === 'noreview') {
        if (!(await ask({ title: 'Remove the review offer?', body: `${esc(m.name)} will not get ${esc(Fmt.money(credit(m)))} off. Do this if they did not really leave a review.`, confirm: 'Remove offer' }))) return;
        try { await Cloud.rpc('shop_member_review_clear', { p_member_id: m.id }); d.close(); toast('Offer removed.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); }
      }
      if (a === 'archive') {
        if (m.active && !(await ask({ title: `Archive ${esc(m.name)}?`, body: 'They leave the list and cannot sign in to the member app. Their history is kept and you can bring them back.', confirm: 'Archive' }))) return;
        try { await Cloud.rpc('shop_member_save', { p: { ...m, active: !m.active } }); d.close(); toast(m.active ? 'Archived.' : 'Back in the list.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); }
      }
      if (a === 'delete') {
        if (!(await ask({ title: `Delete ${esc(m.name)} for good?`, body: `Their plan history and visits are deleted and their app login stops working.${due(m) > 0 ? ` <b>${esc(Fmt.money(due(m)))} still due will be lost.</b>` : ''} Their bills stay in Records. <b>This cannot be undone.</b> (To keep their history, use Archive instead.)`, confirm: 'Delete for good', danger: true, focusCancel: true }))) return;
        try { await Cloud.rpc('shop_member_delete', { p_member_id: m.id }); d.close(); toast(`${m.name} deleted.`, 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
    try {
      const h = await Cloud.rpc('shop_member_history', { p_member_id: m.id }); if (!d.open) return;
      $('[data-terms]', d).innerHTML = h.terms.length ? `<ul class="timeline">${h.terms.map(t => `<li><b>${KIND[t.kind] || ''}${t.kind === 'payment' ? '' : ' · ' + esc(t.plan_name)}</b><small>${t.kind === 'payment' ? esc(Fmt.date(t.created_at)) : `${esc(Fmt.date(t.start_date))} – ${esc(Fmt.date(t.end_date))}`}${Number(t.amount) ? ` · paid ${Fmt.money(t.amount)}` : ''}${Number(t.due) > 0 ? ` · <span class="due-txt">${Fmt.money(t.due)} due</span>` : ''}${t.bill_no ? ` · ${esc(t.bill_no)}` : ''}${t.by ? ` · by ${esc(t.by)}` : ''}</small></li>`).join('')}</ul>` : '<p class="hint">No plans yet.</p>';
      const month = h.attendance.filter(a => !a.refused && a.at.slice(0, 7) === Fmt.today().slice(0, 7)).length;
      $('[data-visits]', d).innerHTML = h.attendance.length ? `<p><b>${month}</b> visit${month === 1 ? '' : 's'} this month</p><ul class="visit-list">${h.attendance.slice(0, 20).map(visitRow).join('')}</ul>` : '<p class="hint">No visits yet.</p>';
    } catch (ex) { $('[data-terms]', d).innerHTML = `<p class="hint">${esc(ex.message)}</p>`; }
  }

  async function fixDates(m) {
    const d = modal(`Fix dates · ${m.name}`, `<form class="stack" id="dForm"><p class="hint">For example to add free days. No bill is made; the change is noted in their history.</p>
      <div class="form-grid"><label class="field"><span>Start</span><input type="date" name="s" value="${esc(m.start_date)}" required></label><label class="field"><span>End</span><input type="date" name="e" value="${esc(m.end_date)}" required></label></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save dates</button></div></form>`, { size: 'modal-sm' });
    $('#dForm', d).onsubmit = async e => { e.preventDefault(); const f = e.target; try { await Cloud.rpc('shop_member_set_dates', { p_member_id: m.id, p_start: f.s.value, p_end: f.e.value }); d.close(); toast('Dates saved.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); } };
  }

  function shareLogin(m, loginId, pw) {
    const url = location.origin + location.pathname.replace(/index\.html$/, '');
    const msg = `Hi ${m.name}, your ${Store.settings.shop_name || ''} app:\n${url}\nOpen the link, install the app, then sign in.\nMobile/Email: ${loginId}\nPassword: ${pw}`;
    modal('Login ready', `<p>Give these to ${esc(m.name)}:</p><pre class="login-card">${esc(msg)}</pre>
      <div class="modal-actions">${m.phone ? `<a class="btn" href="https://wa.me/${esc((m.phone.replace(/\D/g, '').length === 10 ? (Cloud.cfg.whatsappCountryCode || '91') : '') + m.phone.replace(/\D/g, ''))}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${Icon('whatsapp')} Send on WhatsApp</a>` : ''}<button type="button" class="btn btn-primary" data-close>Done</button></div>`, { size: 'modal-sm' });
  }
  async function loginEditor(m) {
    let cur = { has_login: m.has_login, login_id: m.login_id, password: null };
    if (m.has_login) { try { cur = await Cloud.rpc('shop_member_login_get', { p_member_id: m.id }); } catch (ex) { toast(ex.message, 'error'); } }
    const fresh = () => String(Math.floor(100000 + Math.random() * 900000));
    const startPw = cur.has_login ? (cur.password || '') : fresh();
    const d = modal(`App login · ${m.name}`, `<form class="stack" id="lForm">
      <p class="hint">They sign in to this same app with their mobile number and this password, and see their plan, days left and visits${Store.sys.members?.attendance !== false ? ', and scan the QR at the front desk to check in' : ''}.</p>
      <label class="field"><span>Mobile number or email</span><input name="login" required maxlength="120" value="${esc(cur.login_id || m.login_id || m.phone || m.email)}" inputmode="email"></label>
      <label class="field"><span>${cur.has_login ? 'Current password' : 'Password'} <em>6+ characters</em></span><div class="inline-add"><input name="pw" required minlength="6" maxlength="72" value="${esc(startPw)}" autocomplete="off" ${cur.has_login && !cur.password ? 'placeholder="Not saved — tap New"' : ''}><button type="button" class="btn btn-sm btn-ghost" data-new>New</button></div>
        <small class="hint" data-pwhint>${cur.has_login ? (cur.password ? 'This is their password now. Tap New to make a new one.' : 'Made before this update, so it was not saved. Tap New to set one.') : ''}</small></label>
      <div class="modal-actions">${cur.has_login ? '<button type="button" class="btn btn-ghost btn-danger-text" data-remove>Remove login</button>' : ''}<button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-save></button></div></form>`, { size: 'modal-sm' });
    const f = $('#lForm', d), btn = $('[data-save]', f);
    const changed = () => !cur.has_login || f.pw.value !== (cur.password || '') || f.login.value.trim() !== (cur.login_id || '');
    const paintBtn = () => { btn.innerHTML = !cur.has_login ? 'Create login' : changed() ? 'Save new password' : `${Icon('whatsapp')} Share login again`; };
    $('[data-new]', d).onclick = () => { f.pw.value = fresh(); $('[data-pwhint]', d).textContent = 'New password — tap Save to use it. The old one stops working.'; paintBtn(); };
    f.addEventListener('input', paintBtn); paintBtn();
    f.onsubmit = async e => {
      e.preventDefault();
      if (cur.has_login && !changed()) { d.close(); return shareLogin(m, cur.login_id, cur.password); }
      busy(e.submitter, true, 'Saving…');
      try {
        const r = await Cloud.rpc('shop_member_login_set', { p_member_id: m.id, p_login: f.login.value.trim(), p_password: f.pw.value });
        d.close(); load(true); shareLogin(m, r.login_id, f.pw.value);
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
    $('[data-remove]', d)?.addEventListener('click', async () => {
      if (!(await ask({ title: 'Remove app login?', body: `${esc(m.name)} will not be able to sign in any more.`, confirm: 'Remove', danger: true }))) return;
      try { await Cloud.rpc('shop_member_login_remove', { p_member_id: m.id }); d.close(); toast('Login removed.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); }
    });
  }

  /* ---------- plans (with optional shift timing) ---------- */
  function plans() {
    const d = modal('Plans', `<div class="stack"><ul class="plan-list" data-plans></ul>
      <form class="card sub-box" id="pForm"><h3 data-ptitle>New plan</h3><input type="hidden" name="id">
        <div class="form-grid"><label class="field span-2"><span>Name</span><input name="name" required maxlength="60" placeholder="e.g. Monthly, Morning shift"></label>
          <div class="field"><span>Lasts</span><div class="inline-add"><input name="dv" type="number" min="1" max="3650" required value="1" aria-label="How long"><select name="du" aria-label="Unit"><option value="day">days</option><option value="month" selected>months</option><option value="year">years</option></select></div></div>
          <label class="field"><span>Price (${esc(Fmt.cur())})</span><input name="price" type="number" min="0" step="0.01" required inputmode="decimal"></label>
          <div class="field span-2"><span>Shift timing <em>optional — e.g. 6:00 am to 11:00 am</em></span><div class="inline-add shift-in"><input name="ss" type="time" aria-label="Shift starts"><span>to</span><input name="se" type="time" aria-label="Shift ends"><button type="button" class="btn btn-sm btn-ghost" data-noshift>No shift</button></div>
            <small class="hint">Check-ins then show if they came or left early or late. Leaving after the shift shows in red.</small></div>
          ${Store.settings.tax_enabled && Store.settings.tax_scope === 'item' ? `<label class="field"><span>Tax % <em>included in price</em></span><input name="tax" type="number" min="0" max="100" step="0.01" placeholder="${Number(Store.settings.tax_value)}"></label>` : ''}
          <label class="field span-2"><span>Description <em>optional</em></span><input name="desc" maxlength="200"></label></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-pclear>Clear</button><button class="btn btn-primary">Save plan</button></div></form></div>`, { size: 'modal-md' });
    const f = $('#pForm', d);
    const paint = () => { $('[data-plans]', d).innerHTML = data.plans.length ? data.plans.map(p => `<li data-pid="${p.id}" class="${p.active ? '' : 'off'}"><div><b>${esc(p.name)}</b><small>${esc(dur(p))} · ${Fmt.money(p.price)}${p.shift_start ? ' · ' + esc(Shift.range(p.shift_start, p.shift_end)) : ''}${p.active ? '' : ' · hidden'}</small></div><div class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-pedit>${Icon('edit')} Edit</button><button type="button" class="btn btn-sm btn-ghost" data-pdel aria-label="Remove">${Icon('trash')}</button></div></li>`).join('') : '<li class="hint">No plans yet.</li>'; };
    const clear = () => { f.reset(); f.id.value = ''; $('[data-ptitle]', f).textContent = 'New plan'; };
    paint();
    d.addEventListener('click', async e => {
      if (e.target.closest('[data-noshift]')) { f.ss.value = ''; f.se.value = ''; return; }
      const li = e.target.closest('[data-pid]'); if (e.target.closest('[data-pclear]')) return clear();
      if (!li) return; const p = planById(li.dataset.pid);
      if (e.target.closest('[data-pedit]')) { f.id.value = p.id; f.name.value = p.name; f.dv.value = p.duration_value; f.du.value = p.duration_unit; f.price.value = Number(p.price); if (f.tax) f.tax.value = p.tax_rate ?? ''; f.desc.value = p.description; f.ss.value = p.shift_start || ''; f.se.value = p.shift_end || ''; $('[data-ptitle]', f).textContent = 'Edit ' + p.name; f.name.focus(); }
      if (e.target.closest('[data-pdel]')) {
        if (!(await ask({ title: `Remove ${esc(p.name)}?`, body: 'If anyone has used this plan it is hidden instead, so their history stays.', confirm: 'Remove' }))) return;
        try { await Cloud.rpc('shop_plan_delete', { p_id: p.id }); await load(true); paint(); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
    f.onsubmit = async e => {
      e.preventDefault();
      if (!!f.ss.value !== !!f.se.value) return toast('Enter both shift times, or leave both empty.', 'warn');
      busy(e.submitter, true, 'Saving…');
      try { await Cloud.rpc('shop_plan_save', { p: { id: f.id.value || null, name: f.name.value.trim(), duration_value: f.dv.value, duration_unit: f.du.value, price: f.price.value, tax_rate: f.tax?.value || '', description: f.desc.value.trim(), shift_start: f.ss.value, shift_end: f.se.value, active: true } }); toast('Plan saved.', 'ok'); await load(true); paint(); clear(); }
      catch (ex) { toast(ex.message, 'error'); } finally { busy(e.submitter, false); }
    };
  }

  /* ---------- member app: notices & offers, Google review, locker fee ---------- */
  async function memberApp() {
    const o = opts(), KINDS = [['notice', 'Notice'], ['offer', 'Offer'], ['alert', 'Alert']];
    const d = modal('Member app', `<div class="stack">
      <section class="card sub-box"><h3>${Icon('megaphone')} Send a notice or offer</h3><p class="hint">Every ${esc(L1().toLowerCase())} sees it in their app, as a pop-up the next time they open it.</p>
        <form id="nForm" class="stack"><input type="hidden" name="id">
          <div class="seg" role="radiogroup">${KINDS.map(([k, l], i) => `<label><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <label class="field"><span>Title</span><input name="title" required maxlength="80" placeholder="e.g. Closed on Sunday · Diwali offer: 20% off yearly"></label>
          <label class="field"><span>Message <em>optional</em></span><textarea name="body" rows="3" maxlength="1000"></textarea></label>
          <label class="field"><span>Show until <em>optional</em></span><input name="ends" type="date" min="${Fmt.today()}"></label>
          <div class="modal-actions"><button type="button" class="btn btn-ghost" data-nclear>Clear</button><button class="btn btn-primary">${Icon('megaphone')} Send to all</button></div></form>
        <ul class="notice-admin" data-notices><li class="hint">Loading…</li></ul></section>
      <form class="card sub-box stack" id="oForm"><h3>${Icon('star')} Google review</h3>
        <label class="switch"><input type="checkbox" name="review_on" ${o.review_on ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>Ask for a Google review</b><small>Asked every time they open the app, until they say they have left one.</small></span></label>
        <label class="field"><span>Your Google review link</span><input name="review_url" type="url" maxlength="500" value="${esc(o.review_url || '')}" placeholder="https://g.page/r/…/review"><small class="hint">Google Business Profile → “Ask for reviews” (or “Get more reviews”) → copy the link.</small></label>
        <label class="field"><span>Offer for leaving a review (${esc(Fmt.cur())}) <em>0 = no offer</em></span><input name="review_offer" type="number" min="0" step="1" inputmode="numeric" value="${Number(o.review_offer) || 0}"><small class="hint">Taken off their next renewal automatically, e.g. 50 = “₹50 off if you leave a review”.</small></label>
        <h3>${Icon('key')} Locker</h3>
        <label class="field"><span>Locker fee added to each plan bill (${esc(Fmt.cur())})</span><input name="locker_fee" type="number" min="0" step="1" inputmode="numeric" value="${Number(o.locker_fee) || 0}"></label>
        <h3>${Icon('seat')} Seats</h3>
        <label class="field"><span>Your seats <em>optional</em></span><input name="seats" maxlength="500" value="${esc(o.seats || '')}" placeholder="e.g. 1-60  or  A1-A20, B1-B20"><small class="hint">Shows a Seats tab with which seats are taken and which are free.</small></label>
        <h3>${Icon('lock')} When a plan has ended</h3>
        <div class="form-grid">
          <label class="field"><span>Lock the member app after (days)</span><input name="lock_after_days" type="number" min="0" max="3650" step="1" inputmode="numeric" value="${Number(o.lock_after_days ?? 10)}"><small class="hint">After this many days they only see “Please renew”. 0 = never lock.</small></label>
          <label class="field"><span>Delete the ${esc(L1().toLowerCase())} after (days)</span><input name="auto_delete_days" type="number" min="0" max="3650" step="1" inputmode="numeric" value="${Number(o.auto_delete_days) || 0}"><small class="hint">Deleted for good, with their history. Anyone who still owes money is kept. 0 = never.</small></label></div>
        <div class="modal-actions"><button class="btn btn-primary">Save</button></div></form></div>`, { size: 'modal-md' });
    const nf = $('#nForm', d), of = $('#oForm', d);
    let notices = [];
    const KTAG = { notice: 'badge-soft', offer: 'badge-green', alert: 'badge-red' };
    const paintN = () => { $('[data-notices]', d).innerHTML = notices.length ? notices.map(n => `<li data-nid="${n.id}" class="${n.active ? '' : 'off'}"><div><span class="badge ${KTAG[n.kind]}">${esc(KINDS.find(k => k[0] === n.kind)?.[1] || '')}</span> <b>${esc(n.title)}</b>${n.body ? `<p class="pre">${esc(n.body)}</p>` : ''}<small class="muted">${esc(Fmt.dateTime(n.created_at))}${n.by ? ' · ' + esc(n.by) : ''}${n.ends_on ? ' · until ' + esc(Fmt.date(n.ends_on)) : ''}${n.active ? '' : ' · hidden'}</small></div>
      <div class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-ntoggle>${n.active ? 'Hide' : 'Show'}</button><button type="button" class="btn btn-sm btn-ghost" data-nedit>${Icon('edit')}</button><button type="button" class="btn btn-sm btn-ghost" data-ndel aria-label="Delete">${Icon('trash')}</button></div></li>`).join('') : '<li class="hint">No notices sent yet.</li>'; };
    try { notices = (await Cloud.rpc('shop_notices_list')).notices; paintN(); } catch (ex) { $('[data-notices]', d).innerHTML = `<li class="hint">${esc(ex.message)}</li>`; }
    const clearN = () => { nf.reset(); nf.id.value = ''; };
    const saveN = async p => { notices = (await Cloud.rpc('shop_notice_save', { p })).notices; paintN(); };
    nf.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Sending…');
      try { await saveN({ id: nf.id.value || null, kind: nf.kind.value, title: nf.title.value.trim(), body: nf.body.value.trim(), ends_on: nf.ends.value, active: true }); toast(nf.id.value ? 'Saved.' : 'Sent. Members see it when they open the app.', 'ok'); clearN(); }
      catch (ex) { toast(ex.message, 'error'); } finally { busy(e.submitter, false); }
    };
    d.addEventListener('click', async e => {
      if (e.target.closest('[data-nclear]')) return clearN();
      const li = e.target.closest('[data-nid]'); if (!li) return; const n = notices.find(x => x.id === li.dataset.nid); if (!n) return;
      try {
        if (e.target.closest('[data-ntoggle]')) await saveN({ ...n, ends_on: n.ends_on && n.ends_on < Fmt.today() ? '' : n.ends_on, active: !n.active });
        if (e.target.closest('[data-nedit]')) { nf.id.value = n.id; nf.kind.value = n.kind; nf.title.value = n.title; nf.body.value = n.body; nf.ends.value = n.ends_on || ''; nf.title.focus(); }
        if (e.target.closest('[data-ndel]')) {
          if (!(await ask({ title: 'Delete this message?', body: `“${esc(n.title)}” disappears from every member’s app.`, confirm: 'Delete', danger: true }))) return;
          notices = (await Cloud.rpc('shop_notice_delete', { p_id: n.id })).notices; paintN();
        }
      } catch (ex) { toast(ex.message, 'error'); }
    });
    of.onsubmit = async e => {
      e.preventDefault();
      const del = Number(of.auto_delete_days.value) || 0;
      if (del > 0 && del !== Number(o.auto_delete_days) && !(await ask({ title: `Delete ${L().toLowerCase()} automatically?`, body: `Anyone whose plan ended more than <b>${del} days</b> ago will be deleted for good, with their plan history and visits — starting now. Anyone who still owes money is kept. Their bills stay in Records.`, confirm: 'Yes, turn it on', danger: true }))) return;
      busy(e.submitter, true, 'Saving…');
      try {
        data.opts = await Cloud.rpc('shop_member_app_save', { p: { review_on: of.review_on.checked, review_url: of.review_url.value.trim(), review_offer: of.review_offer.value || '0', locker_fee: of.locker_fee.value || '0',
          seats: of.seats.value.trim(), lock_after_days: of.lock_after_days.value || '0', auto_delete_days: of.auto_delete_days.value || '0' } });
        Object.assign(o, data.opts); toast('Saved.', 'ok'); render.toldDeleted = false; load(true);
      } catch (ex) { toast(ex.message, 'error', 7000); } finally { busy(e.submitter, false); }
    };
  }

  /* ---------- attendance & check-in QR ---------- */
  async function attendance() {
    let day = Fmt.today();
    const d = modal('Attendance', `<div class="att-wrap">
      <div class="att-qr card"><h3>${Icon('scan')} Check-in QR</h3><p class="hint">Print it and stick it at the front desk. ${esc(L())} scan it in their app when they come in, and again when they leave.</p><div class="qr-box" data-qr><p class="hint">Loading…</p></div>
        <div class="toolbar wrap"><button type="button" class="btn btn-primary" data-qprint>${Icon('printer')} Print QR</button>${Store.can('members_plans') ? '<button type="button" class="btn btn-ghost" data-qnew>New code</button>' : ''}</div></div>
      <div class="att-list"><div class="att-head"><input type="date" data-day value="${day}" max="${day}" aria-label="Day"><b data-count></b></div>
        <form class="inline-add" data-manual><input list="mNames" name="who" placeholder="Check someone in or out by name or number" aria-label="Check in or out"><datalist id="mNames">${data.members.filter(m => m.active).map(m => `<option value="${esc(m.name)} · ${esc(m.member_no)}">`).join('')}</datalist><button class="btn btn-sm">In / out</button></form>
        <ul class="visit-list att-rows" data-rows></ul></div></div>`, { size: 'modal-lg' });
    let token = '';
    const paintQR = () => { $('[data-qr]', d).innerHTML = QR.svg(checkinURL(token), 220) + `<small class="mono">${esc(Store.settings.shop_name || '')}</small>`; };
    const loadRows = async () => {
      try {
        const r = await Cloud.rpc('shop_attendance_list', { p_day: day }); if (!d.open) return;
        const ok = r.rows.filter(x => !x.refused), inNow = ok.filter(x => !x.out_at).length;
        $('[data-count]', d).textContent = `${ok.length} visit${ok.length === 1 ? '' : 's'}${day === Fmt.today() && inNow ? ` · ${inNow} inside now` : ''}`;
        $('[data-rows]', d).innerHTML = r.rows.length ? r.rows.map(x => x.refused
          ? `<li class="visit-refused"><span><b>${esc(x.name)}</b> <small class="muted">${esc(x.member_no)}</small></span><span class="sh-tag sh-bad">${esc(Fmt.time(x.at))} · tried to check in · plan ended${x.end_date ? ' ' + esc(Fmt.date(x.end_date)) : ''}</span></li>`
          : `<li class="sh-row-${Shift.worst(x)}"><span><b>${esc(x.name)}</b> <small class="muted">${esc(x.member_no)}${x.shift_start ? ' · shift ' + esc(Shift.range(x.shift_start, x.shift_end)) : ''}</small></span><span>${esc(Shift.span(x))} · ${x.method === 'qr' ? 'QR' : 'by ' + esc(x.by || 'staff')}</span><span class="sh-tags">${Shift.tags(x)}</span></li>`).join('') : '<li class="hint">Nobody yet.</li>';
      } catch (ex) { toast(ex.message, 'error'); }
    };
    try { token = (await Cloud.rpc('shop_checkin_code')).token; paintQR(); } catch (ex) { $('[data-qr]', d).textContent = ex.message; }
    loadRows();
    $('[data-day]', d).onchange = e => { day = e.target.value || Fmt.today(); loadRows(); };
    $('[data-manual]', d).onsubmit = async e => {
      e.preventDefault(); const v = e.target.who.value.trim(); if (!v) return;
      const m = data.members.find(x => v.endsWith(x.member_no)) || data.members.find(x => x.name.toLowerCase() === v.toLowerCase() || (x.phone && x.phone.replace(/\D/g, '') === v.replace(/\D/g, '')));
      if (!m) return toast('No one with that name or number.', 'warn');
      await checkIn(m, false, () => { if (day === Fmt.today()) loadRows(); }); e.target.reset();
    };
    d.addEventListener('click', async e => {
      if (e.target.closest('[data-qprint]')) printQR(token);
      if (e.target.closest('[data-qnew]')) {
        if (!(await ask({ title: 'Make a new check-in code?', body: 'Printed QR codes with the old code stop working. Print the new one afterwards.', confirm: 'Make new code', danger: true }))) return;
        try { token = (await Cloud.rpc('shop_checkin_code', { p_new: true })).token; paintQR(); toast('New code ready. Print it.', 'ok'); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
  }
  /* The front-desk poster: big text you can change before printing. */
  const QR_DEF = () => ({ qr_title: Store.settings.shop_name || '', qr_line1: 'Scan when you come in, and again when you leave', qr_line2: 'Open the app → Scan, or use your phone camera' });
  const QR_SIZE = { normal: [40, 24, 20, 380], large: [56, 32, 26, 460], huge: [72, 40, 32, 540] };
  function printQR(token) {
    const o = opts(), def = QR_DEF(), canSave = Store.can('members_plans');
    const val = k => (o[k] || '').trim() || def[k];
    let size = 'large';
    try { size = localStorage.getItem('SHOPBILL_QR_SIZE') || 'large'; } catch { /* storage blocked */ }
    const d = modal('Print check-in QR', `<form id="qForm" class="stack">
      <div class="form-grid">
        <label class="field span-2"><span>Heading</span><input name="qr_title" maxlength="120" value="${esc(val('qr_title'))}"></label>
        <label class="field span-2"><span>Line above the QR</span><input name="qr_line1" maxlength="120" value="${esc(val('qr_line1'))}"></label>
        <label class="field span-2"><span>Line below the QR</span><input name="qr_line2" maxlength="120" value="${esc(val('qr_line2'))}"></label>
        <div class="field span-2"><span>Text size</span><div class="seg" role="radiogroup">${[['normal', 'Normal'], ['large', 'Large'], ['huge', 'Extra large']].map(([k, l]) => `<label><input type="radio" name="size" value="${k}" ${size === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div></div>
      <div class="qr-poster" data-prev></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-reset>Default text</button><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${Icon('printer')} Print</button></div></form>`, { size: 'modal-md' });
    const f = $('#qForm', d);
    const paint = () => { const [h, l1, l2] = QR_SIZE[f.size.value]; $('[data-prev]', d).innerHTML = `<b style="font-size:${h / 2}px">${esc(f.qr_title.value)}</b><p style="font-size:${l1 / 2}px">${esc(f.qr_line1.value)}</p>${QR.svg(checkinURL(token), 150)}<p style="font-size:${l2 / 2}px">${esc(f.qr_line2.value)}</p>`; };
    f.addEventListener('input', paint); f.addEventListener('change', paint); paint();
    $('[data-reset]', d).onclick = () => { for (const k of ['qr_title', 'qr_line1', 'qr_line2']) f[k].value = def[k]; paint(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const t = { qr_title: f.qr_title.value.trim(), qr_line1: f.qr_line1.value.trim(), qr_line2: f.qr_line2.value.trim() }, sz = f.size.value;
      try { localStorage.setItem('SHOPBILL_QR_SIZE', sz); } catch { /* storage blocked */ }
      const w = window.open('', '_blank', 'width=700,height=900'); if (!w) return toast('Allow pop-ups to print.', 'warn');
      const [h, l1, l2, qs] = QR_SIZE[sz];
      w.document.write(`<!doctype html><title>Check-in QR</title><style>@page{margin:12mm}body{font-family:system-ui,'Segoe UI',Roboto,sans-serif;text-align:center;padding:10px;color:#111;margin:0}
        h1{font-size:${h}px;margin:0 0 10px;line-height:1.1}.l1{font-size:${l1}px;margin:0 0 20px;font-weight:600}.l2{font-size:${l2}px;margin:22px 0 0;color:#222}svg{width:${qs}px;height:${qs}px;max-width:90vw;max-height:60vh}</style>
        <h1>${esc(t.qr_title)}</h1><p class="l1">${esc(t.qr_line1)}</p>${QR.svg(checkinURL(token), qs)}<p class="l2">${esc(t.qr_line2)}</p><script>onload=()=>{print()}<\/script>`);
      w.document.close(); d.close();
      if (canSave && ['qr_title', 'qr_line1', 'qr_line2'].some(k => t[k] !== val(k))) {
        try { data.opts = await Cloud.rpc('shop_member_app_save', { p: t }); } catch { /* the print still worked */ }
      }
    };
  }

  /* Alert at the desk: this person's plan is over. */
  function expiredAlert(m, after) {
    const canR = Store.can('members_renew') && m.status !== 'archived';
    const d = modal('Plan is over', `<div class="alert-big">${Icon('alert')}<div><b>${esc(m.name)}’s plan ${m.status === 'none' ? 'has not started' : `ended ${esc(Fmt.date(m.end_date))}`}</b>
        <small>${esc(daysText(m))}${m.plan_name ? ' · ' + esc(m.plan_name) : ''}${due(m) > 0 ? ` · ${esc(Fmt.money(due(m)))} also due` : ''}</small></div></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn" data-anyway>Check in anyway</button>${canR ? `<button type="button" class="btn btn-primary" data-renewnow>${Icon('repeat')} Renew now</button>` : ''}</div>`, { size: 'modal-sm' });
    d.classList.add('modal-alert');
    $('[data-anyway]', d).onclick = () => { d.close(); checkIn(m, true, after); };
    $('[data-renewnow]', d)?.addEventListener('click', () => { d.close(); renew(m); });
  }
  async function checkIn(m, force = false, after) {
    if (!force && (m.status === 'expired' || m.status === 'none') && !inside(m)) return expiredAlert(m, after);
    try {
      const r = await Cloud.rpc('shop_attendance_mark', { p_member_id: m.id });
      if (r.already) toast(r.kind === 'out' ? `${m.name} already checked out at ${Fmt.time(r.out_at)}.` : `${m.name} checked in at ${Fmt.time(r.at)} — scan again after ${r.gap || 10} min to check out.`, 'info', 5000);
      else {
        const tag = r.kind === 'out' ? Shift.outTag(r) : Shift.inTag(r);
        const msg = r.kind === 'out' ? `${m.name} checked out at ${Fmt.time(r.out_at)}` : `${m.name} checked in at ${Fmt.time(r.at)}`;
        toast(tag ? `${msg} · ${tag.text}` : msg + '.', tag?.cls === 'bad' ? 'error' : tag?.cls === 'warn' ? 'warn' : 'ok', 7000);
        const ci = new Set(data.checked_in_today || []), ins = new Set(data.inside || []);
        ci.add(m.id); if (r.kind === 'out') ins.delete(m.id); else ins.add(m.id);
        data.checked_in_today = [...ci]; data.inside = [...ins]; paintList();
      }
      after?.();
    } catch (ex) { toast(ex.message, 'error'); }
  }

  function mount(view) {
    root = view; data = null;
    const appOn = Store.can('members_plans');
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>${esc(L())}</h1><p class="sub" id="mStatus" role="status"></p></div>
        <div class="head-actions">
          ${attOn() ? `<button type="button" class="btn" id="mAtt">${Icon('scan')} Attendance</button>` : ''}
          ${Store.can('members_plans') ? `<button type="button" class="btn" id="mPlans">${Icon('layers')} Plans</button>` : ''}
          ${appOn ? `<button type="button" class="btn" id="mApp">${Icon('megaphone')} Member app</button>` : ''}
          ${Store.can('members_add') ? `<button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add ${esc(L1().toLowerCase())}</button>` : ''}</div></header>
      <div id="mAlert"></div>
      <div class="filters m-filters"><div class="seg seg-scroll" id="mFilters"></div><label class="search-box">${Icon('search')}<input type="search" id="mSearch" placeholder="Search name, number, ID, seat or locker" value="${esc(q)}" aria-label="Search"></label></div>
      <div class="mgrid" id="mList"><div class="empty slim"><p>Loading…</p></div></div></div>`;
    $('#mSearch', view).oninput = e => { q = e.target.value; if (data) paintList(); };
    $('#mAtt', view)?.addEventListener('click', () => data && attendance());
    $('#mPlans', view)?.addEventListener('click', () => data && plans());
    $('#mApp', view)?.addEventListener('click', () => data && memberApp());
    $('.page', view).addEventListener('click', e => {
      const fb = e.target.closest('[data-filter]'); if (fb) { filter = fb.dataset.filter; render(); return; }
      if (e.target.closest('[data-add]')) return data && editor();
      if (!data) return;
      if (e.target.closest('[data-seatcfg]')) return seatSetup();
      const sm = e.target.closest('[data-seatm]'); if (sm) { const x = data.members.find(y => y.id === sm.dataset.seatm); if (x) details(x); return; }
      const fs = e.target.closest('[data-freeseat]'); if (fs) { if (Store.can('members_add')) editor(null, { seat: fs.dataset.freeseat }); else toast(`Seat ${fs.dataset.freeseat} is free.`); return; }
      const card = e.target.closest('[data-id]'); if (!card) return;
      const m = data.members.find(x => x.id === card.dataset.id);
      if (e.target.closest('[data-renew]')) return renew(m);
      if (e.target.closest('[data-paydue]')) return collectDue(m);
      if (e.target.closest('[data-checkin]')) return checkIn(m);
      if (e.target.closest('[data-open]')) return details(m);
    });
    load();
  }
  return { mount, unmount() { root = null; }, refresh() { if (root) load(true); } };
})();
