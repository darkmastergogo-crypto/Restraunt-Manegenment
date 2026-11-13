/* Member app: what a gym / library member sees after signing in — their plan, days left, money due, visits
   with late / early times, notices and offers from the front desk, the Google review request,
   and "Scan" for the QR code at the front desk (first scan checks in, the next checks out). */
'use strict';
const Portal = (() => {
  let root = null, scanning = null, openedAt = 0, popupsDone = false;
  const me = () => Store.me?.member || {};
  const cfg = () => Store.sys.members || {};
  const appCfg = () => Store.me?.app || {};
  const notices = () => Store.me?.notices || [];
  const tokenFrom = text => { const m = String(text || '').match(/#\/checkin\/([A-Za-z0-9]{8,64})/) || String(text || '').match(/^([A-Za-z0-9]{16,64})$/); return m ? m[1] : ''; };
  const seenKey = () => 'SHOPBILL_SEEN_NOTICES_' + (me().member_no || '');
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } } };
  const KIND = { notice: ['Notice', 'n-notice', 'bell'], offer: ['Offer', 'n-offer', 'star'], alert: ['Alert', 'n-alert', 'alert'] };

  function ring(m) {
    const total = m.start_date && m.end_date ? Math.max(1, (new Date(m.end_date) - new Date(m.start_date)) / 864e5 + 1) : 30;
    const left = Math.max(0, m.days_left ?? 0), pct = m.status === 'expired' || m.status === 'none' ? 0 : Math.min(1, (left + 1) / total);
    const R = 54, C = 2 * Math.PI * R;
    return `<svg class="ring" viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="${R}" class="ring-bg"/><circle cx="64" cy="64" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}" transform="rotate(-90 64 64)"/></svg>`;
  }
  function bigDays(m) {
    if (m.status === 'none') return ['—', 'No active plan'];
    if (m.days_left < 0) return ['0', `Ended ${Fmt.date(m.end_date)}`];
    if (m.days_left === 0) return ['0', 'Last day today'];
    return [String(m.days_left), m.days_left === 1 ? 'day left' : 'days left'];
  }
  const noticeHTML = n => { const [label, cls, ic] = KIND[n.kind] || KIND.notice; return `<li class="p-notice ${cls}">${Icon(ic)}<div><span class="n-kind">${label}</span><b>${esc(n.title)}</b>${n.body ? `<p class="pre">${esc(n.body)}</p>` : ''}<small>${esc(Fmt.date(n.created_at))}${n.ends_on ? ' · until ' + esc(Fmt.date(n.ends_on)) : ''}</small></div></li>`; };
  const visitHTML = a => `<li><span>${esc(Fmt.date(a.at))} · <b>${esc(Shift.span(a))}</b></span><span class="sh-tags">${Shift.tags(a)}</span></li>`;

  function todayCard(m) {
    const today = (m.attendance || []).find(a => a.at && Fmt.today() === new Intl.DateTimeFormat('en-CA', { timeZone: Fmt.tz() }).format(new Date(a.at)));
    if (!m.checked_in_today) return '';
    if (m.inside && today) return `<div class="p-done">${Icon('check')}<div><b>Checked in at ${esc(Fmt.time(today.at))}</b><small>${Shift.inTag(today) ? Shift.tagHTML(Shift.inTag(today)) + ' · ' : ''}Scan again when you leave.</small></div></div>`;
    if (today) return `<div class="p-done">${Icon('check')}<div><b>Visited today · ${esc(Shift.span(today))}</b><small>${Shift.tags(today) || `${m.month_visits || 0} visit${m.month_visits === 1 ? '' : 's'} this month`}</small></div></div>`;
    return `<div class="p-done">${Icon('check')}<div><b>Checked in today</b><small>${m.month_visits || 0} visit${m.month_visits === 1 ? '' : 's'} this month</small></div></div>`;
  }

  function render() {
    if (!root) return;
    const m = me(), c = cfg(), s = Store.settings, [num, cap] = bigDays(m), att = c.attendance !== false, a = appCfg();
    const kind = { new: 'Joined', renew: 'Renewed', change: 'Changed plan', payment: 'Paid balance' };
    const due = Number(m.due) || 0, credit = Number(m.review_credit) || 0, ended = m.status === 'expired' || m.status === 'none';
    const askReview = a.review_on && !m.review_at && a.review_url;
    root.className = 'portal';
    root.innerHTML = `<header class="p-top"><div class="p-brand">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : `<span class="logo-chip">${esc((s.shop_name || 'S').charAt(0))}</span>`}<div><b>${esc(s.shop_name || '')}</b><small>${esc(Store.label1('members'))} app</small></div></div>
        ${notices().length ? `<button type="button" class="icon-btn p-bell" data-notices aria-label="Notices">${Icon('bell')}${unseen().length ? `<span class="dot">${unseen().length}</span>` : ''}</button>` : ''}
        <button type="button" class="icon-btn" data-help aria-label="Help & contact">${Icon('help')}</button><button type="button" class="icon-btn" id="pOut" aria-label="Sign out">${Icon('logout')}</button></header>
      <main class="p-main">
        <section class="p-card p-hero st-${m.status}">
          <div class="p-who"><span class="avatar lg">${esc(String(m.name || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase())}</span><div><h1>Hi, ${esc(String(m.name || '').split(' ')[0])}</h1><small>${esc(m.member_no || '')}</small></div></div>
          ${c.see_days_left !== false ? `<div class="p-ring">${ring(m)}<div class="p-ring-txt"><b>${esc(num)}</b><small>${esc(cap)}</small></div></div>` : ''}
          ${c.see_plan !== false ? `<dl class="kv p-plan"><dt>Plan</dt><dd>${esc(m.plan_name || 'None')}</dd>${m.end_date ? `<dt>From</dt><dd>${esc(Fmt.date(m.start_date))}</dd><dt>Until</dt><dd><b>${esc(Fmt.date(m.end_date))}</b></dd>` : ''}
            ${m.shift_start ? `<dt>Shift</dt><dd><b>${esc(Shift.range(m.shift_start, m.shift_end))}</b></dd>` : ''}${m.seat_no ? `<dt>Seat</dt><dd>${esc(m.seat_no)}</dd>` : ''}${m.locker ? `<dt>Locker</dt><dd>${m.locker_no ? esc(m.locker_no) : 'Yes'}</dd>` : ''}</dl>` : ''}
          ${due > 0 ? `<p class="p-warn bad">${Icon('rupee')} ${esc(Fmt.money(due))} still to pay. Please pay at the front desk.</p>` : ''}
          ${credit > 0 ? `<p class="p-warn good">${Icon('star')} ${esc(Fmt.money(credit))} off your next renewal — thank you for your review!</p>` : ''}
          ${m.status === 'expiring' ? `<p class="p-warn">${Icon('bell')} Your plan ends soon. Renew at the front desk to continue without a break.</p>` : ''}
          ${ended ? `<p class="p-warn bad">${Icon('alert')} ${m.status === 'none' ? 'You do not have an active plan.' : 'Your plan has ended.'} Please renew at the front desk.</p>` : ''}
        </section>
        ${att ? `<section class="p-card p-check">
          ${todayCard(m)}
          <button type="button" class="btn ${ended ? 'btn-danger' : 'btn-primary'} btn-xl" id="pScan">${Icon('scan')} ${m.inside ? 'Scan to check out' : 'Scan to check in'}</button>
          <p class="hint center">Scan the QR at the front desk when you come in, and again when you leave.</p></section>` : ''}
        ${askReview ? `<section class="p-card p-review">${Icon('star')}<div><b>Enjoying ${esc(s.shop_name || 'us')}? Leave us a Google review</b>${Number(a.review_offer) > 0 ? `<small>Get <b>${esc(Fmt.money0(a.review_offer))} off</b> your next renewal.</small>` : '<small>It takes a minute and helps us a lot.</small>'}</div><button type="button" class="btn btn-primary" data-review>Review</button></section>` : ''}
        ${notices().length ? `<section class="p-card"><h2>Notices & offers</h2><ul class="p-notices">${notices().map(noticeHTML).join('')}</ul></section>` : ''}
        ${c.see_attendance !== false && att && (m.attendance || []).length ? `<section class="p-card"><h2>Recent visits</h2><ul class="visit-list">${m.attendance.slice(0, 10).map(visitHTML).join('')}</ul></section>` : ''}
        ${c.see_history !== false && (m.terms || []).length ? `<section class="p-card"><h2>My plans & payments</h2><ul class="timeline">${m.terms.map(t => `<li><b>${kind[t.kind] || ''}${t.kind === 'payment' ? '' : ' · ' + esc(t.plan_name)}</b><small>${t.kind === 'payment' ? esc(Fmt.date(t.created_at)) : `${esc(Fmt.date(t.start_date))} – ${esc(Fmt.date(t.end_date))}`}${t.amount != null && Number(t.amount) ? ` · paid ${Fmt.money(t.amount)}` : ''}${Number(t.due) > 0 ? ` · <span class="due-txt">${Fmt.money(t.due)} due</span>` : ''}${t.bill_no ? ` · ${esc(t.bill_no)}` : ''}</small></li>`).join('')}</ul></section>` : ''}
        ${s.contact_phone || s.address ? `<section class="p-card p-contact"><h2>${esc(s.shop_name || 'Contact')}</h2>${s.address ? `<p class="pre">${esc(s.address)}</p>` : ''}${s.contact_phone ? `<a class="btn" href="tel:${esc(s.contact_phone.replace(/[^\d+]/g, ''))}">${Icon('phone')} ${esc(s.contact_phone)}</a>` : ''}</section>` : ''}
      </main>`;
    $('#pOut', root).onclick = App.signOut;
    $('#pScan', root)?.addEventListener('click', scan);
    $('[data-review]', root)?.addEventListener('click', () => reviewPrompt(true));
    $('[data-notices]', root)?.addEventListener('click', () => showNotices(notices(), 'Notices & offers'));
  }

  /* ---------- notices: new ones pop up when the app opens ---------- */
  function unseen() { const seen = new Set(LS.get(seenKey()) || []); return notices().filter(n => !seen.has(n.id)); }
  function markSeen() { LS.set(seenKey(), notices().map(n => n.id).slice(0, 100)); }
  function showNotices(list, title) {
    return new Promise(res => {
      const d = modal(title, `<ul class="p-notices">${list.map(noticeHTML).join('')}</ul><div class="modal-actions"><button type="button" class="btn btn-primary" data-close>OK</button></div>`, { size: 'modal-sm', onClose: () => { markSeen(); render(); res(); } });
      d.classList.add('p-modal');
    });
  }

  /* ---------- Google review: asked every time the app opens, until they say they left one ---------- */
  function reviewPrompt(fromButton = false) {
    const a = appCfg(), m = me();
    if (!a.review_on || !a.review_url || m.review_at) return Promise.resolve();
    return new Promise(res => {
      const offer = Number(a.review_offer) || 0;
      const d = modal('Leave us a review', `<div class="review-pop">${Icon('star')}<h3>Enjoying ${esc(Store.settings.shop_name || 'your visits')}?</h3>
          <p>Tell others on Google — it takes a minute.${offer ? `<br><b class="offer-txt">Get ${esc(Fmt.money0(offer))} off your next renewal!</b>` : ''}</p>
          <div class="stack" data-step1><a class="btn btn-primary btn-lg" href="${esc(a.review_url)}" target="_blank" rel="noopener" data-go>${Icon('star')} Write a Google review</a><button type="button" class="btn btn-ghost" data-close>Later</button></div>
          <div class="stack" data-step2 hidden><p class="hint">Done? Tap below once your review is posted.</p><button type="button" class="btn btn-primary btn-lg" data-done>${Icon('check')} I have posted my review</button><button type="button" class="btn btn-ghost" data-close>Not yet</button></div></div>`,
        { size: 'modal-sm', onClose: res });
      d.classList.add('p-modal');
      $('[data-go]', d).addEventListener('click', () => { $('[data-step1]', d).hidden = true; $('[data-step2]', d).hidden = false; });
      $('[data-done]', d).onclick = async e => {
        busy(e.currentTarget, true, 'Saving…');
        try {
          const r = await Cloud.rpc('shop_member_review_done');
          d.close(); toast(Number(r.credit) > 0 ? `Thank you! ${Fmt.money0(r.credit)} off your next renewal.` : 'Thank you for your review!', 'ok', 6000);
          await App.refreshMe();
        } catch (ex) { toast(ex.message, 'error'); busy(e.currentTarget, false); }
      };
      if (fromButton) $('[data-go]', d).focus();
    });
  }

  async function popups() {
    if (popupsDone) return; popupsDone = true;
    if (sessionStorage.getItem('SHOPBILL_CHECKIN')) return;      // checking in comes first
    const fresh = unseen();
    if (fresh.length) await showNotices(fresh, fresh.length === 1 ? 'New from the front desk' : `${fresh.length} new messages`);
    await reviewPrompt();
  }

  /* ---------- scanning ---------- */
  function result(r) {
    if (r.refused) {
      const d = modal('Cannot check in', `<div class="alert-big">${Icon('alert')}<div><b>${esc(r.message || 'Your plan has ended.')}</b><small>The front desk has been told.</small></div></div><div class="modal-actions"><button type="button" class="btn btn-primary" data-close>OK</button></div>`, { size: 'modal-sm' });
      d.classList.add('modal-alert', 'p-modal'); return;
    }
    if (r.already) { toast(r.kind === 'out' ? `Already checked out at ${Fmt.time(r.out_at)}.` : `Already checked in at ${Fmt.time(r.at)}. Scan again after ${r.gap || 10} min when you leave.`, 'info', 6000); return; }
    const out = r.kind === 'out', tag = out ? Shift.outTag(r) : Shift.inTag(r);
    const d = modal(out ? 'Checked out' : 'Checked in', `<div class="scan-ok sh-${tag?.cls || 'ok'}">${Icon(out ? 'logout' : 'check')}<b>${esc(Fmt.time(out ? r.out_at : r.at))}</b>
        ${tag ? `<p class="sh-big sh-${tag.cls}">${esc(tag.text)}</p>` : ''}
        ${r.shift_start ? `<small>Your shift: ${esc(Shift.range(r.shift_start, r.shift_end))}</small>` : ''}
        ${out ? `<small>Today: ${esc(Shift.span(r))}</small>` : '<small>Have a great session! Scan again when you leave.</small>'}</div>
      <div class="modal-actions"><button type="button" class="btn btn-primary" data-close>OK</button></div>`, { size: 'modal-sm' });
    d.classList.add('p-modal');
  }
  async function checkIn(token) {
    try {
      const r = await Cloud.rpc('shop_member_checkin', { p_token: token });
      result(r);
      await App.refreshMe();
    } catch (e) { toast(e.message, 'error', 7000); }
  }
  function checkPending() {
    const t = sessionStorage.getItem('SHOPBILL_CHECKIN'); if (!t) return;
    sessionStorage.removeItem('SHOPBILL_CHECKIN'); checkIn(t);
  }

  /* ---------- camera scanner: the phone's own QR reader where it has one, otherwise jsQR (loaded only when needed) ---------- */
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; s.onload = () => res(window.jsQR); s.onerror = () => rej(new Error('The scanner could not load. Use your phone camera instead.')); document.head.append(s); });
  }
  async function scan() {
    const d = modal(me().inside ? 'Scan to check out' : 'Scan to check in', `<div class="scanner"><video playsinline muted></video><div class="scan-frame" aria-hidden="true"></div></div><p class="hint center" data-msg>Point your camera at the QR code at the front desk.</p>`, { size: 'modal-sm', onClose: stop });
    const video = $('video', d), msg = $('[data-msg]', d);
    let stream = null, timer = 0, done = false;
    function stop() { done = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); scanning = null; }
    scanning = stop;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream; await video.play();
    } catch { msg.textContent = 'Camera not available. Open your phone’s camera app and point it at the QR code instead.'; return; }
    let detect;
    if ('BarcodeDetector' in window) {
      try { const bd = new BarcodeDetector({ formats: ['qr_code'] }); detect = async () => (await bd.detect(video))[0]?.rawValue; } catch { detect = null; }
    }
    if (!detect) {
      try {
        const jsQR = await loadJsQR(), c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
        detect = async () => { const w = video.videoWidth, h = video.videoHeight; if (!w) return ''; const k = Math.min(1, 640 / Math.max(w, h)); c.width = w * k; c.height = h * k; ctx.drawImage(video, 0, 0, c.width, c.height); return jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)?.data; };
      } catch (e) { msg.textContent = e.message; return; }
    }
    const loop = async () => {
      if (done) return;
      try {
        const text = await detect();
        const tok = tokenFrom(text);
        if (tok) { d.close(); return checkIn(tok); }
        if (text) msg.textContent = 'That is not the check-in code. Scan the QR at the front desk.';
      } catch { /* keep trying */ }
      timer = setTimeout(loop, 250);
    };
    loop();
  }

  function mount(el) { root = el; openedAt = Date.now(); popupsDone = false; render(); checkPending(); setTimeout(popups, 400); }
  return { mount, refresh() { render(); }, checkPending, unmount() { scanning?.(); root = null; }, get openedAt() { return openedAt; } };
})();
