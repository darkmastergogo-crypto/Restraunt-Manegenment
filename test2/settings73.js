/* SHOI Restaurant OS — Release 73 management workspace.
   Reorganizes existing, working management panels into a responsive settings shell.
   No handlers, IDs, permissions or database calls are replaced. */
(() => {
  'use strict';
  const root = document.getElementById('managementSection');
  if (!root || root.dataset.settings73) return;
  root.dataset.settings73 = '1';

  const GROUPS = [
    {key:'restaurant', label:'Restaurant', hint:'Brand, tax, payment and customer-facing settings', icon:'◇'},
    {key:'people', label:'People & access', hint:'Staff, waiter access and role permissions', icon:'◎'},
    {key:'operations', label:'Operations', hint:'Stock, devices, alerts and request behaviour', icon:'⌁'},
    {key:'integrations', label:'Integrations', hint:'Telegram, support and external touchpoints', icon:'↗'},
    {key:'data', label:'Data & safety', hint:'Reset windows and permanent data controls', icon:'▦'}
  ];

  const original = [...root.children].filter(el => el.matches('section.panel,form.panel'));
  const heading = el => (el.querySelector('h2,h3,h4')?.textContent || '').trim().toLowerCase();
  const groupFor = el => {
    const id = el.id || '', h = heading(el);
    if (['staffPanel68','accessPanel68','tempWaiters68','managerPerms66','waiterAccounts66','waiterAccessPanel'].includes(id) || /waiter accounts|staff|permission|role/.test(h)) return 'people';
    if (['stockVisibilitySettings','alertPreferencesForm','orderDevicePermissionPanel','billingAdvanced73Settings'].includes(id) || /stock|alarm|notification|request/.test(h)) return 'operations';
    if (['telegramAlertsPanel','supportPanel68','yummyContactSettings'].includes(id) || /telegram|support|contact/.test(h)) return 'integrations';
    if (['resetControls','presets73Panel'].includes(id) || /reset|retention|data|preset|backup/.test(h)) return 'data';
    return 'restaurant';
  };

  const shell = document.createElement('div');
  shell.className = 'settings73-shell';
  shell.innerHTML = `<aside class="settings73-side" aria-label="Management sections">
    <div class="settings73-intro"><span>Control centre</span><strong>Restaurant setup</strong><p>Everything that changes how the system behaves.</p></div>
    <nav class="settings73-nav"></nav>
  </aside><div class="settings73-main"></div>`;
  root.insertBefore(shell, original[0] || null);
  const nav = shell.querySelector('.settings73-nav');
  const main = shell.querySelector('.settings73-main');
  const panes = new Map();

  for (const g of GROUPS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.settings73 = g.key;
    b.innerHTML = `<b aria-hidden="true">${g.icon}</b><span><strong>${g.label}</strong><small>${g.hint}</small></span>`;
    nav.append(b);
    const pane = document.createElement('section');
    pane.className = 'settings73-pane'; pane.dataset.settings73Pane = g.key;
    pane.innerHTML = `<header class="settings73-pane-head"><div><span>Management</span><h3>${g.label}</h3><p>${g.hint}</p></div></header><div class="settings73-panels"></div>`;
    main.append(pane); panes.set(g.key, pane);
    b.addEventListener('click', () => select(g.key));
  }

  for (const panel of original) panes.get(groupFor(panel)).querySelector('.settings73-panels').append(panel);

  // Panels created later by existing modules are folded into the most sensible group without changing their IDs.
  const known = new WeakSet(original);
  const collectNewPanels = () => {
    for (const panel of [...root.children].filter(el => el.matches('section.panel,form.panel'))) {
      if (known.has(panel) || panel.closest('.settings73-shell')) continue;
      known.add(panel); panes.get(groupFor(panel)).querySelector('.settings73-panels').append(panel);
    }
    syncVisibility();
  };

  function groupHasVisible(key) {
    const pane = panes.get(key); if (!pane) return false;
    return [...pane.querySelectorAll(':scope > .settings73-panels > .panel')].some(p => !p.hidden);
  }
  function select(key) {
    if (!groupHasVisible(key)) key = GROUPS.find(g => groupHasVisible(g.key))?.key || GROUPS[0].key;
    for (const p of panes.values()) p.hidden = p.dataset.settings73Pane !== key;
    for (const b of nav.querySelectorAll('button')) {
      const active = b.dataset.settings73 === key;
      b.classList.toggle('active', active); b.setAttribute('aria-current', active ? 'page' : 'false');
    }
    try { sessionStorage.setItem('SHOI_SETTINGS73_TAB', key); } catch {}
  }
  function syncVisibility() {
    for (const g of GROUPS) {
      const b = nav.querySelector(`[data-settings73="${g.key}"]`);
      if (b) b.hidden = !groupHasVisible(g.key);
    }
    const active = nav.querySelector('button.active:not([hidden])');
    if (!active) select(GROUPS.find(g => groupHasVisible(g.key))?.key || 'restaurant');
  }

  const saved = (() => { try { return sessionStorage.getItem('SHOI_SETTINGS73_TAB'); } catch { return null; } })();
  select(saved || 'restaurant'); syncVisibility();

  // Existing permission/theme modules toggle hidden attributes after login; keep the navigation in sync.
  const observer = new MutationObserver(() => requestAnimationFrame(syncVisibility));
  for (const pane of panes.values()) observer.observe(pane.querySelector('.settings73-panels'), {subtree:true, attributes:true, childList:true, attributeFilter:['hidden']});
  new MutationObserver(collectNewPanels).observe(root, {childList:true});
})();
