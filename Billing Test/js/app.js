/* App shell: sign-in, navigation, help & contact, theme. */
'use strict';
const App = (() => {
  const ROUTES = {
    billing: { label: 'Billing', icon: 'bill', perm: 'billing', mod: () => Billing },
    dashboard: { label: 'Dashboard', icon: 'chart', perm: 'dashboard', mod: () => Dashboard },
    records: { label: 'Records', icon: 'list', perm: 'records', mod: () => Records },
    items: { label: 'Items', icon: 'tag', perm: 'items', mod: () => Items },
    stocks: { label: 'Stocks', icon: 'box', perm: 'stocks', mod: () => Stocks },
    settings: { label: 'Settings', icon: 'gear', perm: 'settings', mod: () => Settings },
    admin: { label: 'Admin', icon: 'shield', perm: 'admin', mod: () => Admin }
  };
  let current = null;
  const app = () => $('#app');

  /* ---------- themes ---------- */
  const personalKey = () => 'SHOPBILL_MY_THEME:' + Cloud.cfg.supabaseUrl + ':' + Cloud.userEmail;
  const canPickTheme = () => !!Store.me && (Store.isAdmin || !!Store.sys.appearance?.allow_personal);
  function myTheme() {
    const a = Store.sys.appearance || {};
    let id = a.theme || 'ledger';
    if (Store.me && a[Store.role]) id = a[Store.role];
    if (canPickTheme()) { try { id = localStorage.getItem(personalKey()) || id; } catch { /* ignore */ } }
    return id;
  }
  function applyTheme() {
    const t = Themes.apply(myTheme(), Store.sys.appearance?.accent);
    const b = $('#themeBtn'); if (b) { b.hidden = !canPickTheme(); b.innerHTML = Icon('palette') + `<span>Theme · ${esc(t.name)}</span>`; }
  }
  function themePicker() {
    const cur = myTheme(), a = Store.sys.appearance || {};
    const d = modal('Choose a theme', `<p class="hint">Only changes this device. ${Store.isAdmin ? 'To change it for the whole shop, use Admin → Appearance.' : ''}</p>
      <div class="theme-grid">${Themes.list.map(t => `<button type="button" class="theme-card ${t.id === cur ? 'on' : ''}" data-theme-id="${t.id}">${Themes.swatch(t, a.accent)}<b>${esc(t.name)}</b><small>${t.mode === 'dark' ? 'Dark' : 'Light'}</small></button>`).join('')}</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-reset>Use the shop’s theme</button><button type="button" class="btn btn-primary" data-close>Done</button></div>`, { size: 'modal-lg' });
    d.addEventListener('click', e => {
      const c = e.target.closest('[data-theme-id]');
      if (c) { try { localStorage.setItem(personalKey(), c.dataset.themeId); } catch { /* ignore */ } applyTheme(); $$('.theme-card', d).forEach(x => x.classList.toggle('on', x === c)); }
      if (e.target.closest('[data-reset]')) { try { localStorage.removeItem(personalKey()); } catch { /* ignore */ } applyTheme(); d.close(); }
    });
  }
  function applyBrand() {
    const b = Store.sys.brand || {};
    applyTheme();
    document.title = (Store.settings.shop_name || App.publicInfo?.shop_name || 'Shop') + ' · ' + (b.app_title || 'Billing');
  }

  /* ---------- sign-in ---------- */
  function vendorLine() {
    const b = Store.sys.brand || {};
    return b.show_on_signin !== false && b.software_name ? `<p class="vendor">Billing software by <b>${esc(b.software_name)}</b> · <button type="button" class="linkish" data-help>Contact us</button></p>` : '';
  }
  async function loadPublic() {
    if (!Cloud.configured) return;
    try { App.publicInfo = await Cloud.publicRpc('shop_public_info'); applyBrand(); } catch { /* sign-in still works without it */ }
  }
  function lockNotice() {
    const a = App.publicInfo?.access; if (!a?.locked) return '';
    const sup = Store.sys.support || {};
    return `<div class="lock-notice" role="alert">${Icon('lock')}<div><b>System shut down</b><p>${esc(a.message || 'This billing system is shut down for now.')}</p>
      ${sup.name || sup.phone ? `<p class="lock-contact">${esc(sup.name || 'Support')}${sup.phone ? ` · Mob no: <a href="tel:${esc(String(sup.phone).replace(/[^\d+]/g, ''))}">${esc(sup.phone)}</a>` : ''}</p>` : ''}</div></div>`;
  }
  function loginView(message = '') {
    app().className = 'auth';
    const shop = Store.me?.settings?.shop_name || App.publicInfo?.shop_name || Cloud.cfg.shopName || 'Shop Billing';
    app().innerHTML = `<main class="auth-wrap">
      <section class="auth-card">
        <div class="brand-mark">${Icon('bill')}</div>
        <h1>${esc(shop)}</h1>
        <p class="sub">${esc(Store.sys.brand?.signin_message || 'Sign in to start billing.')}</p>
        ${lockNotice()}
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
    $('#forgot').onclick = () => {
      const s = Store.sys.support || {};
      modal('Forgot password?', `<p>Ask the shop owner to set a new password for you in <b>Settings → Staff & logins</b>.</p>
        <p class="hint" style="margin-top:10px">Owner locked out? Contact software support${s.name ? ` — <b>${esc(s.name)}</b>` : ''}${s.phone ? `, Mob no: <a href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a>` : ''}.</p>`, { size: 'modal-sm' });
    };
  }

  /* ---------- shell ---------- */
  function shell() {
    const me = Store.me, nav = Object.entries(ROUTES).filter(([, r]) => Store.can(r.perm));
    app().className = 'shell';
    app().innerHTML = `<aside class="side" id="side">
        <div class="side-brand"><div class="logo-chip" id="shopLogo"></div><div><b id="shopName"></b><small id="shopTag"></small></div></div>
        <nav class="side-nav" aria-label="Main">${nav.map(([k, r]) => `<a href="#/${k}" data-route="${k}" class="${k === 'admin' ? 'nav-admin' : ''}">${Icon(r.icon)}<span>${r.label}</span>${k === 'billing' && !isTouch() ? '<kbd>F2</kbd>' : ''}</a>`).join('')}</nav>
        <div class="side-foot">
          <button type="button" class="side-btn" data-help>${Icon('help')}<span>Help & contact</span></button>
          <button type="button" class="side-btn" id="themeBtn"></button>
          <div class="who">${Icon(Store.isAdmin ? 'shield' : 'user')}<span><b>${esc(me.name)}</b><small>${ROLE_LABEL[me.role] || ''} · ${esc(me.email)}</small></span></div>
          <button type="button" class="side-btn" id="logoutBtn">${Icon('logout')}<span>Sign out</span></button>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <button type="button" class="icon-btn menu-btn" id="menuBtn" aria-label="Open menu">${Icon('menu')}</button>
          <b class="top-title" id="topTitle"></b>
          <span class="top-gap"></span>
          <a class="lock-chip" id="lockChip" href="#/admin" hidden>${Icon('lock')}<span>System shut down for staff</span></a>
          <span class="net" id="net" role="status"></span>
          <span class="clock" id="clock"></span>
        </header>
        <main id="view" tabindex="-1"></main>
      </div>
      <div class="scrim" id="scrim"></div>`;
    applyShop();
    $('#themeBtn').onclick = themePicker;
    $('#logoutBtn').onclick = async () => { if (await ask({ title: 'Sign out?', body: 'You will need your email and password to sign in again on this device.', confirm: 'Sign out' })) { await Cloud.logout(); Store.me = null; location.hash = ''; loginView(); } };
    $('#menuBtn').onclick = () => document.body.classList.add('nav-open');
    $('#scrim').onclick = () => document.body.classList.remove('nav-open');
    const tick = () => { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleString('en-IN', { timeZone: Fmt.tz(), weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
    tick(); clearInterval(App._clock); App._clock = setInterval(tick, 20000);
    net(); paintLock();
  }
  function paintLock() { const c = $('#lockChip'); if (c) c.hidden = !(Store.isAdmin && Store.sys.access?.locked); }

  /* ---------- system shut down by Admin ---------- */
  let kicking = false;
  async function kickOut(message) {
    if (kicking || !Store.me || Store.isAdmin) return;
    kicking = true;
    App.publicInfo = { ...(App.publicInfo || {}), support: Store.sys.support, brand: Store.sys.brand, shop_name: Store.settings.shop_name, access: { locked: true, message } };
    $$('dialog[open]').forEach(d => d.close());
    current?.unmount?.(); current = null;
    await Cloud.logout(); Store.me = null; history.replaceState(null, '', location.pathname);
    loginView(); kicking = false;
  }
  addEventListener('system:locked', e => kickOut(e.detail));
  // Staff screens left open notice a shutdown within a few minutes, or as soon as the app is brought back to the front.
  let lastCheck = 0;
  async function checkLock(force) {
    if (!Store.me || Store.isAdmin || document.hidden || (!force && Date.now() - lastCheck < 60000)) return;
    lastCheck = Date.now();
    try { const info = await Cloud.publicRpc('shop_public_info'); if (info?.access?.locked) kickOut(info.access.message); } catch { /* offline: try later */ }
  }
  document.addEventListener('visibilitychange', () => checkLock(false));
  setInterval(() => checkLock(true), 5 * 60000);

  function applyShop() {
    const s = Store.settings;
    applyBrand();
    if ($('#shopName')) { $('#shopName').textContent = s.shop_name || 'My Shop'; $('#shopTag').textContent = s.tagline || 'Billing'; }
    const l = $('#shopLogo'); if (l) l.innerHTML = s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc((s.shop_name || 'S').trim().charAt(0).toUpperCase());
  }

  function net() { const n = $('#net'); if (!n) return; const on = navigator.onLine; n.className = 'net ' + (on ? 'on' : 'off'); n.innerHTML = Icon('wifi') + `<span>${on ? 'Online' : 'Offline — bills cannot be saved'}</span>`; }
  addEventListener('online', net); addEventListener('offline', net);

  function route() {
    if (!Store.me) return;
    $$('dialog[open]').forEach(d => d.close());   // a link inside a dialog must not leave the dialog covering the new screen
    let key = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if (!ROUTES[key] || !Store.can(ROUTES[key].perm)) key = Object.keys(ROUTES).find(k => Store.can(ROUTES[k].perm)) || 'billing';
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
    const s = Store.me?.settings || {}, sup = Store.sys.support || {}, brand = Store.sys.brand || {};
    const tel = p => String(p || '').replace(/[^\d+]/g, '');
    const wa = String(sup.whatsapp || '').replace(/\D/g, '');
    const shopContact = Store.me && (s.contact_name || s.contact_phone || s.contact_details);
    const hasSupport = sup.name || sup.phone || wa || sup.email || sup.website;
    const d = modal('Help & contact', `<div class="help-grid">
      <section class="help-card support-card"><h3>System support${brand.software_name ? ` · ${esc(brand.software_name)}` : ''}</h3>
        ${sup.name ? `<p class="support-name">${esc(sup.name)}</p>` : ''}
        ${sup.phone ? `<p class="support-phone">Mob no: <b>${esc(sup.phone)}</b></p>` : ''}
        <div class="stack">${sup.phone ? `<a class="btn btn-primary" href="tel:${esc(tel(sup.phone))}">${Icon('phone')} Call</a>` : ''}${wa ? `<a class="btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${Icon('whatsapp')} WhatsApp</a>` : ''}${sup.email ? `<a class="btn" href="mailto:${esc(sup.email)}">${Icon('mail')} ${esc(sup.email)}</a>` : ''}${sup.website ? `<a class="btn" href="${esc(sup.website)}" target="_blank" rel="noopener">${Icon('globe')} Website</a>` : ''}</div>
        ${sup.note ? `<p class="hint pre">${esc(sup.note)}</p>` : ''}
        ${!hasSupport ? '<p class="hint">Support details have not been added yet.</p>' : ''}</section>
      ${shopContact ? `<section class="help-card"><h3>Shop contact</h3>${s.contact_name ? `<p><b>${esc(s.contact_name)}</b></p>` : ''}
        ${s.contact_phone ? `<div class="toolbar"><a class="btn" href="tel:${esc(tel(s.contact_phone))}">${Icon('phone')} ${esc(s.contact_phone)}</a><button type="button" class="btn btn-ghost" data-copy="${esc(s.contact_phone)}">${Icon('copy')} Copy</button></div>` : ''}
        ${s.contact_details ? `<p class="pre">${esc(s.contact_details)}</p>` : ''}</section>` : ''}
      ${Store.me && !isTouch() ? `<section class="help-card span-2"><h3>Keyboard shortcuts on the billing screen</h3><dl class="keys">
        <dt><kbd>F2</kbd></dt><dd>Search or scan an item</dd><dt><kbd>Enter</kbd></dt><dd>Add the highlighted item (barcode scanners do this for you)</dd>
        <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move through search results</dd><dt><kbd>F4</kbd></dt><dd>Change payment method</dd>
        <dt><kbd>F8</kbd></dt><dd>Save bill</dd><dt><kbd>F9</kbd></dt><dd>Save and print bill</dd><dt><kbd>Alt</kbd>+<kbd>X</kbd></dt><dd>Add an item that isn’t in the list</dd><dt><kbd>Alt</kbd>+<kbd>N</kbd></dt><dd>Clear the bill</dd></dl></section>` : ''}
    </div>`, { size: 'modal-md' });
    d.addEventListener('click', async e => { const c = e.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Number copied.', 'ok'); } catch { toast(c.dataset.copy); } } });
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-help]')) help(); });

  /* ---------- boot ---------- */
  async function refreshMe() { Store.me = await Cloud.rpc('shop_me'); applyShop(); return Store.me; }
  async function start() {
    app().className = 'loading'; app().innerHTML = '<div class="boot"><div class="brand-mark">' + Icon('bill') + '</div><p>Opening billing…</p></div>';
    try {
      Store.me = await Cloud.rpc('shop_me');
      shell(); route(); // the landing screen loads the item list itself; no need to fetch it twice
    } catch (e) {
      if (e.code === 'LOCKED') { await Cloud.logout(); Store.me = null; App.publicInfo = { ...(App.publicInfo || {}), access: { locked: true, message: e.message } }; return loginView(); }
      if (e.code === 'AUTH' || e.status === 401) { await Cloud.logout(); return loginView('Please sign in again.'); }
      if (e.status === 403) { await Cloud.logout(); return loginView(e.message); }
      app().className = 'auth';
      app().innerHTML = `<main class="auth-wrap"><section class="auth-card"><div class="brand-mark">${Icon('alert')}</div><h1>Can’t open billing</h1><p class="sub">${esc(e.message)}</p>
        <div class="toolbar"><button type="button" class="btn btn-primary" id="retry">Try again</button><button type="button" class="btn btn-ghost" id="out">Sign out</button></div></section>${vendorLine()}</main>`;
      $('#retry').onclick = start; $('#out').onclick = async () => { await Cloud.logout(); loginView(); };
    }
  }

  async function boot() {
    try { const [id, ac] = JSON.parse(localStorage.getItem('SHOPBILL_LAST_THEME') || '[]'); if (id) Themes.apply(id, ac); else Themes.apply('ledger'); } catch { Themes.apply('ledger'); }
    addEventListener('hashchange', route);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (Cloud.signedIn) return start();
    loginView();
    await loadPublic();
    // repaint the sign-in card with the shop name and support details, keeping anything already typed
    if (!Store.me && $('#loginForm')) { const f = $('#loginForm'), em = f.email.value, pw = f.password.value; loginView(); $('#loginForm').email.value = em; $('#loginForm').password.value = pw; }
  }
  function rebuildNav() { if (!Store.me) return; shell(); route(); }
  return { boot, applyShop, applyBrand, applyTheme, help, refreshMe, start, paintLock, rebuildNav, publicInfo: null };
})();
App.boot();
