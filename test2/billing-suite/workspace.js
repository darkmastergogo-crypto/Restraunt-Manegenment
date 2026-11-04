/* One staff shell. A hidden, resident alert engine keeps order/request alarms and phone notifications running
   while every screen is drawn natively by the billing app. The menu designer is the only embedded restaurant panel. */
'use strict';
const RestaurantWorkspace = (() => {
  let kernel = null, ready = false, panels = new Set(), pending = new Map(), seq = 0, alerts = new Map(), state = { controls: {}, ready: '', connected: false }, counts = {};
  const tokens = ['bg', 'surface', 'surface-2', 'line', 'line-2', 'ink', 'ink-2', 'muted', 'primary', 'primary-ink', 'primary-soft', 'primary-hover', 'green', 'green-soft', 'red', 'red-soft', 'amber', 'amber-soft', 'radius', 'radius-sm', 'font', 'mono'];
  function theme(frame) { if (!frame?.contentWindow) return; const css = getComputedStyle(document.documentElement); send(frame, { type: 'workspace:theme', vars: { ...Object.fromEntries(tokens.map(k => [k, css.getPropertyValue('--' + k).trim()])), scheme: /dark/.test(css.colorScheme) ? 'dark' : 'light' } }); }
  const src = (section, panel) => '../restaurant-engine.html?embedded=1&restaurant=1' + (panel ? '&panel=1' : '') + '&section=' + encodeURIComponent(section) + '#' + section;
  function create(section, panel = false) {
    const f = document.createElement('iframe'); f.className = 'workspace-engine'; f.title = panel ? 'Customer menu designer' : 'Restaurant alerts'; f.setAttribute('allow', 'autoplay; clipboard-write');
    f.addEventListener('load', () => theme(f));
    if (window.WORKSPACE_PREVIEW_ENGINE_HTML) f.srcdoc = window.WORKSPACE_PREVIEW_ENGINE_HTML; else f.src = src(section, panel);
    f.dataset.section = section; f.dataset.panel = String(panel); return f;
  }
  function start() {
    if (window.WORKSPACE_PREVIEW_NO_ENGINE) { state = { controls: {}, ready: 'Sounds and phone notifications run on the live site. This preview has no alarms.', connected: true }; return; }
    if (kernel?.isConnected) return; ready = false; state = { controls: {}, ready: '', connected: false };
    kernel = create('live'); kernel.id = 'restaurantAlertEngine'; kernel.hidden = true; kernel.setAttribute('aria-hidden', 'true'); kernel.tabIndex = -1;
    document.body.append(kernel);
  }
  function send(frame, message) { frame?.contentWindow?.postMessage(message, window.WORKSPACE_PREVIEW_ENGINE_HTML ? '*' : location.origin); }
  function command(cmd) { if (typeof cmd === 'string' && /^[A-Za-z]{2,40}$/.test(cmd)) send(kernel, { type: 'workspace:command', cmd }); }
  function mountPanel(root, section = 'management') {
    if (window.WORKSPACE_PREVIEW_NO_ENGINE) { root.innerHTML = '<p class="notice">The menu designer opens on the live site. It is not part of this sample preview.</p>'; return root; }
    const wrap = document.createElement('div'); wrap.className = 'workspace-panel'; wrap.innerHTML = '<p class="workspace-panel-loading" role="status">Loading the menu designer…</p>';
    const frame = create(section, true); wrap.append(frame); root.replaceChildren(wrap); panels.add(frame);
    const ob = new MutationObserver(() => { if (!frame.isConnected) { panels.delete(frame); ob.disconnect(); } }); ob.observe(document.body, { childList: true, subtree: true }); return wrap;
  }
  function beforeRoute() { for (const f of [...panels]) if (!f.isConnected) panels.delete(f); }
  function syncTheme() { theme(kernel); for (const f of panels) theme(f); }
  async function prepareSignOut() {
    if (!kernel || !ready) return; const id = 'cleanup-' + (++seq);
    await new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(Error('Restaurant alert cleanup timed out. Please retry sign out.')); }, 15000); pending.set(id, { resolve, reject, timer }); send(kernel, { type: 'workspace:cleanup', id }); });
  }
  function stop() {
    for (const d of alerts.values()) d.close(); alerts.clear(); kernel?.remove(); kernel = null; ready = false; counts = {}; paintCounts();
    for (const f of panels) f.closest('.workspace-panel')?.remove(); panels.clear();
    for (const p of pending.values()) { clearTimeout(p.timer); p.resolve(); } pending.clear();
  }
  function paintCounts() {
    for (const [route, n] of [['kitchen', counts.orders], ['requests', counts.requests], ['notifications', counts.notices]]) {
      const a = document.querySelector(`.side-nav a[data-route="${route}"]`); if (!a) continue;
      let c = a.querySelector('.nav-count'); if (!c) { c = document.createElement('span'); c.className = 'nav-count'; a.querySelector('span')?.after(c); }
      c.textContent = Number(n) > 0 ? String(Math.min(99, Number(n))) : ''; c.setAttribute('aria-label', Number(n) > 0 ? n + ' waiting' : '');
    }
  }
  addEventListener('message', event => {
    if (event.origin !== location.origin && !(window.WORKSPACE_PREVIEW_ENGINE_HTML && event.origin === 'null')) return;
    const frame = event.source === kernel?.contentWindow ? kernel : [...panels].find(f => f.contentWindow === event.source); if (!frame) return;
    const d = event.data || {};
    if (d.type === 'workspace:ready') {
      if (frame === kernel) { ready = true; state.connected = true; send(frame, { type: 'workspace:section', section: 'live', active: false, kernel: true }); command('state'); }
      else { send(frame, { type: 'workspace:section', section: frame.dataset.section, panel: true, active: true }); frame.closest('.workspace-panel')?.querySelector('.workspace-panel-loading')?.remove(); }
      theme(frame);
    }
    if (d.type === 'workspace:navigate' && typeof d.route === 'string' && /^[a-zA-Z]+$/.test(d.route)) location.hash = '#/' + d.route;
    if (d.type === 'workspace:receipt' && d.order) Records.openBill(Cloud.orderToBill ? Cloud.orderToBill(d.order) : d.order);
    if (d.type === 'workspace:settings-changed') void App.refreshMe(true).catch(e => toast(e.message, 'error'));
    if (d.type === 'workspace:session-ended') { stop(); Store.me = null; App.loginView('Your session ended. Sign in again.'); }
    if (d.type === 'workspace:cleanup-result') { const p = pending.get(d.id); if (p) { clearTimeout(p.timer); pending.delete(d.id); d.error ? p.reject(Error(d.error)) : p.resolve(); } }
    if (d.type === 'workspace:height' && frame !== kernel) { const height = Number(d.height); if (Number.isFinite(height)) frame.style.height = Math.min(18000, Math.max(420, height)) + 'px'; }
    if (d.type === 'workspace:alert-state' && frame === kernel && d.state && typeof d.state === 'object') { state = { ...d.state, connected: true }; document.dispatchEvent(new CustomEvent('workspace:alert-state')); }
    if (d.type === 'workspace:counts' && frame === kernel) { counts = { orders: d.orders, requests: d.requests, notices: d.notices }; paintCounts(); document.dispatchEvent(new CustomEvent('workspace:counts', { detail: counts })); }
    if (d.type === 'workspace:alert' && frame === kernel && ['order', 'request'].includes(d.kind)) {
      if (!d.open) { alerts.get(d.kind)?.close(); alerts.delete(d.kind); return; }
      if (alerts.has(d.kind)) return;
      const route = d.kind === 'order' ? 'kitchen' : 'requests';
      const dialog = modal(d.title || 'Restaurant alert', `<p>${esc(d.message || 'A new request needs attention.')}</p><p class="hint" style="margin-top:8px">Snooze and Dismiss only silence this device. The ${d.kind === 'order' ? 'order' : 'request'} stays waiting.</p><div class="modal-actions" style="margin-top:14px"><button class="btn btn-ghost" data-alert-snooze>Snooze 2 min</button><button class="btn" data-alert-dismiss>Dismiss</button><a class="btn btn-primary" href="#/${route}" data-alert-open>${Icon(d.kind === 'order' ? 'store' : 'bell')} ${d.kind === 'order' ? 'Open kitchen' : 'Open requests'}</a></div>`, { size: 'modal-sm' });
      alerts.set(d.kind, dialog); let action = 'dismiss';
      dialog.querySelector('[data-alert-snooze]').onclick = () => { action = 'snooze'; dialog.close(); };
      dialog.querySelector('[data-alert-dismiss]').onclick = () => dialog.close();
      dialog.querySelector('[data-alert-open]').onclick = () => { action = 'dismiss'; setTimeout(() => dialog.close(), 0); };
      dialog.addEventListener('close', () => { alerts.delete(d.kind); send(kernel, { type: 'workspace:alert-action', kind: d.kind, action }); }, { once: true });
    }
  });
  document.addEventListener('setup:changed', syncTheme);
  return { start, stop, beforeRoute, mountPanel, syncTheme, prepareSignOut, command, alertState: () => state, counts: () => counts, paintCounts };
})();
