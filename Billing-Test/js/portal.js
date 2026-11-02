/* Member app: what a gym / library member sees after signing in — their plan, days left, visits,
   and "Scan to check in" for the QR code at the front desk. */
'use strict';
const Portal = (() => {
  let root = null, scanning = null;
  const me = () => Store.me?.member || {};
  const cfg = () => Store.sys.members || {};
  const tokenFrom = text => { const m = String(text || '').match(/#\/checkin\/([A-Za-z0-9]{8,64})/) || String(text || '').match(/^([A-Za-z0-9]{16,64})$/); return m ? m[1] : ''; };

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

  function render() {
    if (!root) return;
    const m = me(), c = cfg(), s = Store.settings, [num, cap] = bigDays(m), att = c.attendance !== false;
    const kind = { new: 'Joined', renew: 'Renewed', change: 'Changed plan' };
    root.className = 'portal';
    root.innerHTML = `<header class="p-top"><div class="p-brand">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : `<span class="logo-chip">${esc((s.shop_name || 'S').charAt(0))}</span>`}<div><b>${esc(s.shop_name || '')}</b><small>${esc(Store.label1('members'))} app</small></div></div>
        <button type="button" class="icon-btn" data-help aria-label="Help & contact">${Icon('help')}</button><button type="button" class="icon-btn" id="pOut" aria-label="Sign out">${Icon('logout')}</button></header>
      <main class="p-main">
        <section class="p-card p-hero st-${m.status}">
          <div class="p-who"><span class="avatar lg">${esc(String(m.name || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase())}</span><div><h1>Hi, ${esc(String(m.name || '').split(' ')[0])}</h1><small>${esc(m.member_no || '')}</small></div></div>
          ${c.see_days_left !== false ? `<div class="p-ring">${ring(m)}<div class="p-ring-txt"><b>${esc(num)}</b><small>${esc(cap)}</small></div></div>` : ''}
          ${c.see_plan !== false ? `<dl class="kv p-plan"><dt>Plan</dt><dd>${esc(m.plan_name || 'None')}</dd>${m.end_date ? `<dt>From</dt><dd>${esc(Fmt.date(m.start_date))}</dd><dt>Until</dt><dd><b>${esc(Fmt.date(m.end_date))}</b></dd>` : ''}</dl>` : ''}
          ${m.status === 'expiring' ? `<p class="p-warn">${Icon('bell')} Your plan ends soon. Renew at the front desk to continue without a break.</p>` : ''}
          ${m.status === 'expired' ? `<p class="p-warn bad">${Icon('alert')} Your plan has ended. Please renew at the front desk.</p>` : ''}
        </section>
        ${att ? `<section class="p-card p-check">
          ${m.checked_in_today ? `<div class="p-done">${Icon('check')}<div><b>Checked in today</b><small>${m.month_visits || 0} visit${m.month_visits === 1 ? '' : 's'} this month</small></div></div>` : ''}
          <button type="button" class="btn btn-primary btn-xl" id="pScan" ${m.status === 'expired' || m.status === 'none' ? 'disabled' : ''}>${Icon('scan')} Scan to check in</button>
          <p class="hint center">Point at the QR code at the front desk. Your phone camera works too.</p></section>` : ''}
        ${c.see_attendance !== false && att && (m.attendance || []).length ? `<section class="p-card"><h2>Recent visits</h2><ul class="visit-list">${m.attendance.slice(0, 10).map(a => `<li>${esc(Fmt.dateTime(a))}</li>`).join('')}</ul></section>` : ''}
        ${c.see_history !== false && (m.terms || []).length ? `<section class="p-card"><h2>My plans</h2><ul class="timeline">${m.terms.map(t => `<li><b>${kind[t.kind] || ''} · ${esc(t.plan_name)}</b><small>${esc(Fmt.date(t.start_date))} – ${esc(Fmt.date(t.end_date))}${t.amount != null && Number(t.amount) ? ` · ${Fmt.money(t.amount)}` : ''}${t.bill_no ? ` · ${esc(t.bill_no)}` : ''}</small></li>`).join('')}</ul></section>` : ''}
        ${s.contact_phone || s.address ? `<section class="p-card p-contact"><h2>${esc(s.shop_name || 'Contact')}</h2>${s.address ? `<p class="pre">${esc(s.address)}</p>` : ''}${s.contact_phone ? `<a class="btn" href="tel:${esc(s.contact_phone.replace(/[^\d+]/g, ''))}">${Icon('phone')} ${esc(s.contact_phone)}</a>` : ''}</section>` : ''}
      </main>`;
    $('#pOut', root).onclick = App.signOut;
    $('#pScan', root)?.addEventListener('click', scan);
  }

  async function checkIn(token) {
    try {
      const r = await Cloud.rpc('shop_member_checkin', { p_token: token });
      toast(r.already ? `Already checked in at ${Fmt.time(r.at)}.` : 'Checked in. Have a great session!', 'ok', 5000);
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
    const d = modal('Scan to check in', `<div class="scanner"><video playsinline muted></video><div class="scan-frame" aria-hidden="true"></div></div><p class="hint center" data-msg>Point your camera at the QR code at the front desk.</p>`, { size: 'modal-sm', onClose: stop });
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

  function mount(el) { root = el; render(); checkPending(); }
  return { mount, refresh() { render(); }, checkPending, unmount() { scanning?.(); root = null; } };
})();
