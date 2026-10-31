/* App shell: sign-in, navigation, help & contact, theme, app name & logo, live updates. */
'use strict';
const App = (() => {
  const ROUTES = {
    billing: { mod: 'billing', icon: 'bill', perm: 'billing', view: () => Billing },
    dashboard: { mod: 'dashboard', icon: 'chart', perm: 'dashboard', view: () => Dashboard },
    records: { mod: 'records', icon: 'list', perm: 'records', view: () => Records },
    members: { mod: 'members', icon: 'idcard', perm: 'members', view: () => Members },
    items: { mod: 'items', icon: 'tag', perm: 'items', view: () => Items },
    stocks: { mod: 'stocks', icon: 'box', perm: 'stocks', view: () => Stocks },
    expenses: { mod: 'expenses', icon: 'wallet', perm: 'expenses', view: () => Expenses },
    settings: { label: 'Settings', icon: 'gear', perm: 'settings', view: () => Settings },
    admin: { label: 'Admin', icon: 'shield', perm: 'admin', view: () => Admin }
  };
  const routeLabel = r => r.label || Store.label(r.mod);
  let current = null;
  const app = () => $('#app');

  /* ---------- no zooming: the installed app behaves like an app, not a web page ---------- */
  (() => {
    const stop = e => e.preventDefault();
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
    document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) e.preventDefault(); });
  })();

  /* ---------- themes (Admin only) ---------- */
  function myTheme() {
    const a = Store.sys.appearance || {};
    let id = a.theme || 'ledger';
    if (Store.me && a[Store.role]) id = a[Store.role];
    return id;
  }
  function applyTheme() { return Themes.apply(myTheme(), Store.sys.appearance?.accent); }

  /* ---------- app name & logo ---------- */
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } } };
  const appName = () => Store.sys.brand?.app_title || 'Shop Billing';
  function setIcon(icon) {
    const href = icon || 'icons/icon.svg';
    for (const [rel, fallback] of [['icon', 'icons/icon.svg'], ['apple-touch-icon', 'icons/icon-180.png']]) {
      const l = document.querySelector(`link[rel="${rel}"]`); const want = icon || fallback;
      if (l && l.getAttribute('href') !== want) { l.setAttribute('href', want); if (rel === 'icon') l.type = icon ? 'image/png' : 'image/svg+xml'; }
    }
    $$('.brand-mark').forEach(b => { b.classList.toggle('has-img', !!icon); if (icon) b.innerHTML = `<img src="${href}" alt="">`; });
  }
  async function syncIcon(v) {
    const cached = LS.get('SHOPBILL_ICON');
    if ((cached?.v || '') === (v || '')) return setIcon(cached?.icon || '');
    if (!v) { LS.set('SHOPBILL_ICON', { v: '', icon: '' }); return setIcon(''); }
    try { const r = await Cloud.publicRpc('shop_app_icon'); LS.set('SHOPBILL_ICON', { v: r.v, icon: r.icon }); setIcon(r.icon); } catch { /* keep the old one */ }
  }
  function applyBrand() {
    const b = Store.sys.brand || {};
    applyTheme();
    const name = appName(), shop = Store.settings.shop_name || App.publicInfo?.shop_name || '';
    const title = shop && shop !== name ? `${shop} · ${name}` : name;
    if (document.title !== title) document.title = title;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', b.app_short_name || name);
    LS.set('SHOPBILL_BRAND', { title, short: b.app_short_name || name });
    const v = Store.me?.system ? (App.publicInfo?.icon_v ?? LS.get('SHOPBILL_ICON')?.v) : App.publicInfo?.icon_v;
    if (v !== undefined) syncIcon(v); else setIcon(LS.get('SHOPBILL_ICON')?.icon || '');
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
  const membersLogin = () => !!App.publicInfo?.members_login;
  /* Members sign in with a mobile number; it maps to the login the shop created for them. */
  const loginEmail = id => id.includes('@') ? id : (id.replace(/\D/g, '').slice(-10) + '@member.shop');
  function loginView(message = '') {
    app().className = 'auth';
    const shop = Store.me?.settings?.shop_name || App.publicInfo?.shop_name || Cloud.cfg.shopName || 'Shop Billing';
    const ml = membersLogin(), icon = LS.get('SHOPBILL_ICON')?.icon;
    app().innerHTML = `<main class="auth-wrap">
      <section class="auth-card">
        <div class="brand-mark ${icon ? 'has-img' : ''}">${icon ? `<img src="${icon}" alt="">` : Icon('bill')}</div>
        <h1>${esc(shop)}</h1>
        <p class="sub">${esc(Store.sys.brand?.signin_message || 'Sign in to start billing.')}</p>
        ${lockNotice()}
        ${!Cloud.configured ? `<div class="notice notice-bad"><b>Not connected yet.</b> Open <span class="mono">config.js</span> and paste this shop’s Supabase Project URL and public key. See START-HERE.txt.</div>` : ''}
        ${sessionStorage.getItem('SHOPBILL_CHECKIN') ? `<div class="notice">${Icon('scan')} Sign in to finish checking in.</div>` : ''}
        <form id="loginForm" class="stack">
          <label class="field"><span>${ml ? 'Email or mobile number' : 'Email'}</span><input name="email" type="${ml ? 'text' : 'email'}" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required maxlength="254"></label>
          <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
          <p class="form-error" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</p>
          <button class="btn btn-primary btn-lg" ${Cloud.configured ? '' : 'disabled'}>Sign in</button>
          <button type="button" class="linkish" id="forgot">Forgot password?</button>
        </form>
        ${ml ? `<p class="hint center">${esc(Store.label1('members'))}s: sign in with the mobile number and password the front desk gave you.</p>` : ''}
      </section>${vendorLine()}</main>`;
    const f = $('#loginForm'), err = $('.form-error', f);
    if (!isTouch()) f.email.focus();
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true; busy(e.submitter, true, 'Signing in…');
      const id = f.email.value.trim();
      if (!id.includes('@') && id.replace(/\D/g, '').length < 10) { err.textContent = ml ? 'Enter your email, or your 10-digit mobile number.' : 'Enter your email.'; err.hidden = false; busy(e.submitter, false); return; }
      try { await Cloud.login(loginEmail(id), f.password.value); await start(); }
      catch (ex) { err.textContent = /Wrong email/.test(ex.message) && !id.includes('@') ? 'Wrong mobile number or password.' : ex.message; err.hidden = false; busy(e.submitter, false); }
    };
    $('#forgot').onclick = () => {
      const s = Store.sys.support || {};
      modal('Forgot password?', `<p>Staff: ask the shop owner to set a new password for you in <b>Settings → Staff & logins</b>.</p>
        ${ml ? `<p style="margin-top:8px">${esc(Store.label1('members'))}s: ask at the front desk.</p>` : ''}
        <p class="hint" style="margin-top:10px">Owner locked out? Contact software support${s.name ? ` — <b>${esc(s.name)}</b>` : ''}${s.phone ? `, Mob no: <a href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a>` : ''}.</p>`, { size: 'modal-sm' });
    };
  }

  /* ---------- shell ---------- */
  const navKeys = () => Object.keys(ROUTES).filter(k => Store.can(ROUTES[k].perm));
  const navHTML = () => navKeys().map(k => `<a href="#/${k}" data-route="${k}" class="${k === 'admin' ? 'nav-admin' : ''}">${Icon(ROUTES[k].icon)}<span>${esc(routeLabel(ROUTES[k]))}</span>${k === 'billing' && !isTouch() ? '<kbd>F2</kbd>' : ''}</a>`).join('');
  function shell() {
    const me = Store.me;
    app().className = 'shell';
    app().innerHTML = `<aside class="side" id="side">
        <div class="side-brand"><div class="logo-chip" id="shopLogo"></div><div><b id="shopName"></b><small id="shopTag"></small></div></div>
        <nav class="side-nav" id="sideNav" aria-label="Main">${navHTML()}</nav>
        <div class="side-foot">
          <button type="button" class="side-btn" data-help>${Icon('help')}<span>Help & contact</span></button>
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
    $('#logoutBtn').onclick = signOut;
    $('#menuBtn').onclick = () => document.body.classList.add('nav-open');
    $('#scrim').onclick = () => document.body.classList.remove('nav-open');
    const tick = () => { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleString('en-IN', { timeZone: Fmt.tz(), weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
    tick(); clearInterval(App._clock); App._clock = setInterval(tick, 20000);
    net(); paintLock();
  }
  async function signOut() {
    if (!(await ask({ title: 'Sign out?', body: 'You will need your password to sign in again on this device.', confirm: 'Sign out' }))) return;
    current?.unmount?.(); current = null; if (Store.isMember) Portal.unmount();
    await Cloud.logout(); Store.me = null; history.replaceState(null, '', location.pathname); loginView();
  }
  function paintLock() { const c = $('#lockChip'); if (c) c.hidden = !(Store.isAdmin && Store.sys.access?.locked); }

  /* ---------- system shut down by Admin ---------- */
  let kicking = false;
  async function kickOut(message) {
    if (kicking || !Store.me || Store.isAdmin) return;
    kicking = true;
    App.publicInfo = { ...(App.publicInfo || {}), support: Store.sys.support, brand: Store.sys.brand, shop_name: Store.settings.shop_name, access: { locked: true, message } };
    $$('dialog[open]').forEach(d => d.close());
    current?.unmount?.(); current = null; if (Store.isMember) Portal.unmount();
    await Cloud.logout(); Store.me = null; history.replaceState(null, '', location.pathname);
    loginView(); kicking = false;
  }
  addEventListener('system:locked', e => kickOut(e.detail));

  /* ---------- live updates ----------
     Every open screen asks for a tiny version fingerprint once a minute (and when the app comes back to the front).
     Only when Admin or the owner changed something does it download the new setup and repaint — in place, without a reload. */
  let syncing = false, lastSync = 0;
  async function sync(force = false) {
    if (!Store.me || syncing || document.hidden || (!force && Date.now() - lastSync < 55000)) return;
    syncing = true; lastSync = Date.now();
    try {
      const v = await Cloud.publicRpc('shop_version');
      if (v && v !== Store.me.v) await refreshMe(true);
    } catch (e) { if (e.code === 'LOCKED') kickOut(e.message); }
    finally { syncing = false; }
  }
  document.addEventListener('visibilitychange', () => sync(false));
  setInterval(() => sync(true), 60000);

  /* Applies a fresh copy of the signed-in user's setup without disturbing the open screen. */
  async function refreshMe(live = false) {
    const prevNav = Store.me ? navKeys().join() + '|' + navKeys().map(k => routeLabel(ROUTES[k])).join() : '';
    const prevIcon = App.publicInfo?.icon_v;
    let me;
    try { me = await Cloud.rpc('shop_me'); }
    catch (e) {
      if (e.code === 'LOCKED') return kickOut(e.message);
      if (e.status === 403 && Store.isMember) { Portal.unmount(); $$('dialog[open]').forEach(d => d.close()); await Cloud.logout(); Store.me = null; return loginView(e.message); }
      throw e;
    }
    Store.me = me;
    try { const pi = await Cloud.publicRpc('shop_public_info'); App.publicInfo = pi; } catch { /* icon check can wait */ }
    if (me.role === 'member') { applyBrand(); Portal.refresh?.(); return me; }
    applyShop(); paintLock();
    const nav = navKeys().join() + '|' + navKeys().map(k => routeLabel(ROUTES[k])).join();
    if (nav !== prevNav && $('#sideNav')) {
      $('#sideNav').innerHTML = navHTML();
      const key = (location.hash.match(/^#\/(\w+)/) || [])[1];
      if (!key || !Store.can(ROUTES[key]?.perm)) route(); else markNav(key);
    }
    if (live) { current?.refresh?.(); document.dispatchEvent(new CustomEvent('setup:changed')); }
    if (prevIcon !== App.publicInfo?.icon_v) applyBrand();
    return me;
  }

  function applyShop() {
    const s = Store.settings;
    applyBrand();
    if ($('#shopName')) { $('#shopName').textContent = s.shop_name || 'My Shop'; $('#shopTag').textContent = s.tagline || appName(); }
    const l = $('#shopLogo'); if (l) l.innerHTML = s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc((s.shop_name || 'S').trim().charAt(0).toUpperCase());
  }

  function net() { const n = $('#net'); if (!n) return; const on = navigator.onLine; n.className = 'net ' + (on ? 'on' : 'off'); n.innerHTML = Icon('wifi') + `<span>${on ? 'Online' : 'Offline — bills cannot be saved'}</span>`; }
  addEventListener('online', () => { net(); sync(true); }); addEventListener('offline', net);

  function markNav(key) {
    $$('.side-nav a').forEach(a => a.classList.toggle('on', a.dataset.route === key));
    const t = $('#topTitle'); if (t && ROUTES[key]) t.textContent = routeLabel(ROUTES[key]);
  }
  function route() {
    if (!Store.me) return;
    if (Store.isMember) return;
    $$('dialog[open]').forEach(d => d.close());   // a link inside a dialog must not leave the dialog covering the new screen
    let key = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if (!ROUTES[key] || !Store.can(ROUTES[key].perm)) key = Object.keys(ROUTES).find(k => Store.can(ROUTES[k].perm)) || 'billing';
    if (location.hash !== '#/' + key) history.replaceState(null, '', '#/' + key);
    current?.unmount?.();
    const r = ROUTES[key]; current = r.view();
    markNav(key);
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
      ${shopContact ? `<section class="help-card"><h3>${Store.isMember ? esc(s.shop_name || 'Front desk') : 'Shop contact'}</h3>${s.contact_name ? `<p><b>${esc(s.contact_name)}</b></p>` : ''}
        ${s.contact_phone ? `<div class="toolbar"><a class="btn" href="tel:${esc(tel(s.contact_phone))}">${Icon('phone')} ${esc(s.contact_phone)}</a><button type="button" class="btn btn-ghost" data-copy="${esc(s.contact_phone)}">${Icon('copy')} Copy</button></div>` : ''}
        ${s.contact_details ? `<p class="pre">${esc(s.contact_details)}</p>` : ''}</section>` : ''}
      <section class="help-card support-card"><h3>System support${brand.software_name ? ` · ${esc(brand.software_name)}` : ''}</h3>
        ${sup.name ? `<p class="support-name">${esc(sup.name)}</p>` : ''}
        ${sup.phone ? `<p class="support-phone">Mob no: <b>${esc(sup.phone)}</b></p>` : ''}
        <div class="stack">${sup.phone ? `<a class="btn btn-primary" href="tel:${esc(tel(sup.phone))}">${Icon('phone')} Call</a>` : ''}${wa ? `<a class="btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${Icon('whatsapp')} WhatsApp</a>` : ''}${sup.email ? `<a class="btn" href="mailto:${esc(sup.email)}">${Icon('mail')} ${esc(sup.email)}</a>` : ''}${sup.website ? `<a class="btn" href="${esc(sup.website)}" target="_blank" rel="noopener">${Icon('globe')} Website</a>` : ''}</div>
        ${sup.note ? `<p class="hint pre">${esc(sup.note)}</p>` : ''}
        ${!hasSupport ? '<p class="hint">Support details have not been added yet.</p>' : ''}</section>
      ${Store.me && !Store.isMember && Store.can('billing') && !isTouch() ? `<section class="help-card span-2"><h3>Keyboard shortcuts on the billing screen</h3><dl class="keys">
        <dt><kbd>F2</kbd></dt><dd>Search or scan an item</dd><dt><kbd>Enter</kbd></dt><dd>Add the highlighted item (barcode scanners do this for you)</dd>
        <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move through search results</dd><dt><kbd>F4</kbd></dt><dd>Change payment method</dd>
        <dt><kbd>F8</kbd></dt><dd>Save bill</dd><dt><kbd>F9</kbd></dt><dd>Save and print bill</dd><dt><kbd>Alt</kbd>+<kbd>X</kbd></dt><dd>Add an item that isn’t in the list</dd><dt><kbd>Alt</kbd>+<kbd>N</kbd></dt><dd>Clear the bill</dd></dl></section>` : ''}
    </div>`, { size: 'modal-md' });
    d.addEventListener('click', async e => { const c = e.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Number copied.', 'ok'); } catch { toast(c.dataset.copy); } } });
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-help]')) help(); });

  /* ---------- boot ---------- */
  async function start() {
    app().className = 'loading'; app().innerHTML = '<div class="boot"><div class="brand-mark">' + Icon('bill') + '</div><p>Opening…</p></div>';
    setIcon(LS.get('SHOPBILL_ICON')?.icon || '');
    try {
      Store.me = await Cloud.rpc('shop_me');
      if (!App.publicInfo) loadPublic();
      if (Store.isMember) { applyBrand(); current = null; return Portal.mount(app()); }
      shell(); route(); // the landing screen loads the item list itself; no need to fetch it twice
    } catch (e) {
      if (e.code === 'LOCKED') { await Cloud.logout(); Store.me = null; App.publicInfo = { ...(App.publicInfo || {}), access: { locked: true, message: e.message } }; return loginView(); }
      if (e.code === 'AUTH' || e.status === 401) { await Cloud.logout(); return loginView('Please sign in again.'); }
      if (e.status === 403) { await Cloud.logout(); return loginView(e.message); }
      app().className = 'auth';
      app().innerHTML = `<main class="auth-wrap"><section class="auth-card"><div class="brand-mark">${Icon('alert')}</div><h1>Can’t open the app</h1><p class="sub">${esc(e.message)}</p>
        <div class="toolbar"><button type="button" class="btn btn-primary" id="retry">Try again</button><button type="button" class="btn btn-ghost" id="out">Sign out</button></div></section>${vendorLine()}</main>`;
      $('#retry').onclick = start; $('#out').onclick = async () => { await Cloud.logout(); loginView(); };
    }
  }

  async function boot() {
    try { const [id, ac] = LS.get('SHOPBILL_LAST_THEME') || []; Themes.apply(id || 'ledger', ac); } catch { Themes.apply('ledger'); }
    // A check-in QR opened with the phone camera lands here: remember it until the member is signed in.
    const ck = location.hash.match(/^#\/checkin\/([A-Za-z0-9]{8,64})/);
    if (ck) { sessionStorage.setItem('SHOPBILL_CHECKIN', ck[1]); history.replaceState(null, '', location.pathname); }
    addEventListener('hashchange', () => {
      const c = location.hash.match(/^#\/checkin\/([A-Za-z0-9]{8,64})/);
      if (c) { sessionStorage.setItem('SHOPBILL_CHECKIN', c[1]); history.replaceState(null, '', location.pathname); if (Store.isMember) Portal.checkPending(); return; }
      route();
    });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (Cloud.signedIn) return start();
    loginView();
    await loadPublic();
    // repaint the sign-in card with the shop name and support details, keeping anything already typed
    if (!Store.me && $('#loginForm')) { const f = $('#loginForm'), em = f.email.value, pw = f.password.value; loginView(); $('#loginForm').email.value = em; $('#loginForm').password.value = pw; }
  }
  function rebuildNav() { if (!Store.me || Store.isMember) return; const n = $('#sideNav'); if (!n) { shell(); return route(); } n.innerHTML = navHTML(); const key = (location.hash.match(/^#\/(\w+)/) || [])[1]; if (!key || !Store.can(ROUTES[key]?.perm)) route(); else markNav(key); }
  return { boot, applyShop, applyBrand, applyTheme, help, refreshMe, start, paintLock, rebuildNav, signOut, sync, setIcon, syncIcon, loginView, publicInfo: null };
})();
App.boot();
