/* App shell: sign-in, navigation, help & contact, theme. */
'use strict';
const App = (() => {
  const ROUTES = {
    billing: { label: 'Billing', icon: 'bill', perm: 'billing', mod: () => Billing },
    dashboard: { label: 'Dashboard', icon: 'chart', perm: 'dashboard', mod: () => Dashboard },
    records: { label: 'Records', icon: 'list', perm: 'records', mod: () => Records },
    items: { label: 'Items', icon: 'tag', perm: 'items', mod: () => Items },
    stocks: { label: 'Stocks', icon: 'box', perm: 'stocks', mod: () => Stocks },
    settings: { label: 'Settings', icon: 'gear', perm: 'settings', mod: () => Settings }
  };
  const ROLE_LABEL = { admin: 'Owner', manager: 'Manager', cashier: 'Cashier' };
  let current = null;
  const app = () => $('#app');

  /* ---------- theme ---------- */
  function theme(next) {
    let t; try { t = next || localStorage.getItem('SHOPBILL_THEME') || 'light'; if (next) localStorage.setItem('SHOPBILL_THEME', next); } catch { t = next || 'light'; }
    document.documentElement.dataset.theme = t;
    const b = $('#themeBtn'); if (b) b.innerHTML = Icon(t === 'dark' ? 'sun' : 'moon') + `<span>${t === 'dark' ? 'Light mode' : 'Dark mode'}</span>`;
  }

  /* ---------- sign-in ---------- */
  function vendorLine() {
    const v = Cloud.cfg.vendor || {};
    return v.showOnSignIn && v.name ? `<p class="vendor">Billing software by <b>${esc(v.name)}</b> · <button type="button" class="linkish" data-help>Contact us</button></p>` : '';
  }
  function loginView(message = '') {
    app().className = 'auth';
    app().innerHTML = `<main class="auth-wrap">
      <section class="auth-card">
        <div class="brand-mark">${Icon('bill')}</div>
        <h1>${esc(Store.me?.settings?.shop_name || Cloud.cfg.shopName || 'Shop Billing')}</h1>
        <p class="sub">Sign in to start billing.</p>
        ${!Cloud.configured ? `<div class="notice notice-bad"><b>Not connected yet.</b> Open <span class="mono">config.js</span> and paste this shop’s Supabase Project URL and public key. See START-HERE.txt.</div>` : ''}
        <form id="loginForm" class="stack">
          <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required maxlength="254"></label>
          <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
          <p class="form-error" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</p>
          <button class="btn btn-primary btn-lg" ${Cloud.configured ? '' : 'disabled'}>Sign in</button>
          <button type="button" class="linkish" id="forgot">Forgot password?</button>
        </form>
      </section>${vendorLine()}</main>`;
    const f = $('#loginForm'), err = $('.form-error', f);
    f.email.focus();
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true; busy(e.submitter, true, 'Signing in…');
      try { await Cloud.login(f.email.value.trim(), f.password.value); await start(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; busy(e.submitter, false); }
    };
    $('#forgot').onclick = async () => {
      const email = await ask({ title: 'Reset password', body: 'We will email a link to set a new password.', confirm: 'Send link', input: { label: 'Email', type: 'email', value: f.email.value, required: true } });
      if (!email) return;
      try { await Cloud.recover(email.trim()); toast('If that email has a login, a reset link is on its way.', 'ok', 6000); } catch (ex) { toast(ex.message, 'error'); }
    };
  }

  function newPasswordView() {
    app().className = 'auth';
    app().innerHTML = `<main class="auth-wrap"><section class="auth-card"><div class="brand-mark">${Icon('bill')}</div><h1>Set a new password</h1>
      <form id="pwForm" class="stack"><label class="field"><span>New password</span><input name="p1" type="password" minlength="8" required autocomplete="new-password"></label>
      <label class="field"><span>Type it again</span><input name="p2" type="password" minlength="8" required autocomplete="new-password"></label><p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary btn-lg">Save password</button></form></section></main>`;
    const f = $('#pwForm'), err = $('.form-error', f);
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true;
      if (f.p1.value !== f.p2.value) { err.textContent = 'The two passwords are different.'; err.hidden = false; return; }
      busy(e.submitter, true, 'Saving…');
      try { await Cloud.setPassword(f.p1.value); await Cloud.logout(); toast('Password changed. Sign in with the new password.', 'ok', 6000); loginView(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; busy(e.submitter, false); }
    };
  }

  /* ---------- shell ---------- */
  function shell() {
    const me = Store.me, nav = Object.entries(ROUTES).filter(([, r]) => Store.can(r.perm));
    app().className = 'shell';
    app().innerHTML = `<aside class="side" id="side">
        <div class="side-brand"><div class="logo-chip" id="shopLogo"></div><div><b id="shopName"></b><small id="shopTag"></small></div></div>
        <nav class="side-nav" aria-label="Main">${nav.map(([k, r]) => `<a href="#/${k}" data-route="${k}">${Icon(r.icon)}<span>${r.label}</span>${k === 'billing' ? '<kbd>F2</kbd>' : ''}</a>`).join('')}</nav>
        <div class="side-foot">
          <button type="button" class="side-btn" data-help>${Icon('help')}<span>Help & contact</span></button>
          <button type="button" class="side-btn" id="themeBtn"></button>
          <div class="who">${Icon('user')}<span><b>${esc(me.name)}</b><small>${ROLE_LABEL[me.role]} · ${esc(me.email)}</small></span></div>
          <button type="button" class="side-btn" id="logoutBtn">${Icon('logout')}<span>Sign out</span></button>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <button type="button" class="icon-btn menu-btn" id="menuBtn" aria-label="Open menu">${Icon('menu')}</button>
          <b class="top-title" id="topTitle"></b>
          <span class="top-gap"></span>
          <span class="net" id="net" role="status"></span>
          <span class="clock" id="clock"></span>
        </header>
        <main id="view" tabindex="-1"></main>
      </div>
      <div class="scrim" id="scrim"></div>`;
    applyShop(); theme();
    $('#themeBtn').onclick = () => theme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    $('#logoutBtn').onclick = async () => { if (await ask({ title: 'Sign out?', body: 'You will need your email and password to sign in again on this device.', confirm: 'Sign out' })) { await Cloud.logout(); Store.me = null; location.hash = ''; loginView(); } };
    $('#menuBtn').onclick = () => document.body.classList.add('nav-open');
    $('#scrim').onclick = () => document.body.classList.remove('nav-open');
    const tick = () => { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleString('en-IN', { timeZone: Fmt.tz(), weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
    tick(); clearInterval(App._clock); App._clock = setInterval(tick, 20000);
    net();
  }

  function applyShop() {
    const s = Store.settings;
    document.title = (s.shop_name || 'Shop') + ' · Billing';
    if ($('#shopName')) { $('#shopName').textContent = s.shop_name || 'My Shop'; $('#shopTag').textContent = s.tagline || 'Billing'; }
    const l = $('#shopLogo'); if (l) l.innerHTML = s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc((s.shop_name || 'S').trim().charAt(0).toUpperCase());
  }

  function net() { const n = $('#net'); if (!n) return; const on = navigator.onLine; n.className = 'net ' + (on ? 'on' : 'off'); n.innerHTML = Icon('wifi') + `<span>${on ? 'Online' : 'Offline — bills cannot be saved'}</span>`; }
  addEventListener('online', net); addEventListener('offline', net);

  function route() {
    if (!Store.me) return;
    let key = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if (!ROUTES[key] || !Store.can(ROUTES[key].perm)) key = 'billing';
    if (location.hash !== '#/' + key) history.replaceState(null, '', '#/' + key);
    current?.unmount?.();
    const r = ROUTES[key]; current = r.mod();
    $$('.side-nav a').forEach(a => a.classList.toggle('on', a.dataset.route === key));
    $('#topTitle').textContent = r.label;
    document.body.classList.remove('nav-open');
    document.body.dataset.route = key;
    const v = $('#view'); v.innerHTML = ''; current.mount(v);
  }

  /* ---------- help & contact ---------- */
  function help() {
    const s = Store.me?.settings || {}, v = Cloud.cfg.vendor || {};
    const tel = p => String(p || '').replace(/[^\d+]/g, '');
    const wa = String(v.whatsapp || '').replace(/\D/g, '');
    const shopContact = Store.me && (s.contact_name || s.contact_phone || s.contact_details);
    const d = modal('Help & contact', `<div class="help-grid">
      ${shopContact ? `<section class="help-card"><h3>Shop contact</h3>${s.contact_name ? `<p><b>${esc(s.contact_name)}</b></p>` : ''}
        ${s.contact_phone ? `<div class="toolbar"><a class="btn" href="tel:${esc(tel(s.contact_phone))}">${Icon('phone')} ${esc(s.contact_phone)}</a><button type="button" class="btn btn-ghost" data-copy="${esc(s.contact_phone)}">${Icon('copy')} Copy</button></div>` : ''}
        ${s.contact_details ? `<p class="pre">${esc(s.contact_details)}</p>` : ''}</section>` : ''}
      <section class="help-card"><h3>Software support</h3><p><b>${esc(v.name || 'Support')}</b></p>
        <div class="stack">${v.phone ? `<a class="btn" href="tel:${esc(tel(v.phone))}">${Icon('phone')} Call ${esc(v.phone)}</a>` : ''}${wa ? `<a class="btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${Icon('whatsapp')} WhatsApp</a>` : ''}${v.email ? `<a class="btn" href="mailto:${esc(v.email)}">${Icon('mail')} ${esc(v.email)}</a>` : ''}${v.website ? `<a class="btn" href="${esc(v.website)}" target="_blank" rel="noopener">${Icon('globe')} Website</a>` : ''}</div>
        ${!v.phone && !wa && !v.email && !v.website ? '<p class="hint">Support details have not been added yet.</p>' : ''}</section>
      ${Store.me ? `<section class="help-card span-2"><h3>Keyboard shortcuts on the billing screen</h3><dl class="keys">
        <dt><kbd>F2</kbd></dt><dd>Search or scan an item</dd><dt><kbd>Enter</kbd></dt><dd>Add the highlighted item (barcode scanners do this for you)</dd>
        <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move through search results</dd><dt><kbd>F4</kbd></dt><dd>Change payment method</dd>
        <dt><kbd>F8</kbd></dt><dd>Save bill</dd><dt><kbd>F9</kbd></dt><dd>Save and print bill</dd><dt><kbd>Alt</kbd>+<kbd>X</kbd></dt><dd>Add an extra item not in the list</dd><dt><kbd>Alt</kbd>+<kbd>N</kbd></dt><dd>Clear the bill</dd></dl></section>` : ''}
    </div>`, { size: 'modal-md' });
    d.addEventListener('click', async e => { const c = e.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Number copied.', 'ok'); } catch { toast(c.dataset.copy); } } });
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-help]')) help(); });

  /* ---------- boot ---------- */
  async function start() {
    app().className = 'loading'; app().innerHTML = '<div class="boot"><div class="brand-mark">' + Icon('bill') + '</div><p>Opening billing…</p></div>';
    try {
      Store.me = await Cloud.rpc('shop_me');
      shell(); route();
      Store.loadItems(true).catch(() => {});
    } catch (e) {
      if (e.code === 'AUTH' || e.status === 401) { await Cloud.logout(); return loginView('Please sign in again.'); }
      if (e.status === 403) { await Cloud.logout(); return loginView(e.message); }
      app().className = 'auth';
      app().innerHTML = `<main class="auth-wrap"><section class="auth-card"><div class="brand-mark">${Icon('alert')}</div><h1>Can’t open billing</h1><p class="sub">${esc(e.message)}</p>
        <div class="toolbar"><button type="button" class="btn btn-primary" id="retry">Try again</button><button type="button" class="btn btn-ghost" id="out">Sign out</button></div></section>${vendorLine()}</main>`;
      $('#retry').onclick = start; $('#out').onclick = async () => { await Cloud.logout(); loginView(); };
    }
  }

  function boot() {
    theme();
    addEventListener('hashchange', route);
    if (location.hash.includes('type=recovery') && Cloud.useRecoveryToken(location.hash)) { history.replaceState(null, '', location.pathname); return newPasswordView(); }
    if (Cloud.signedIn) start(); else loginView();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  return { boot, applyShop, help };
})();
App.boot();
