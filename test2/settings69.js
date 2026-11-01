/* Release 69 — Settings as a real two-pane screen.
   ---------------------------------------------------------------------------
   Replaces the Release 68 approach, which guessed a panel's section by running
   a regex over its heading text. Sections are declared here, each panel is
   claimed by id or by an exact heading, and anything unclaimed lands in a
   named fallback instead of silently disappearing into "System".

   Layout: a rail of sections on the left, one pane on the right. "All" is an
   index of the sections, never every panel stacked. On phones the rail is the
   screen and choosing a section pushes the pane over it.                      */
'use strict';
const Settings69 = (() => {
const $ = id => document.getElementById(id);

const I = {
  brand:'<path d="M4 7h16M6 7V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/>',
  users:'<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.3 2.9-5.2 6.5-5.2s6.5 1.9 6.5 5.2"/><path d="M17 5.5a3 3 0 0 1 0 5.8M18.5 19.8c0-2.2-.8-3.9-2.2-5"/>',
  menu:'<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4V4Z"/><path d="M9 9h6M9 13h6"/>',
  table:'<path d="M3 9h18M5 9v10M19 9v10M8 9l1-4h6l1 4"/>',
  bill:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  bell:'<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  phone:'<path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5 2 2 0 1 1-4 0 1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3 2 2 0 1 1-2.8-2.8 1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1 2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8 2 2 0 1 1 2.8-2.8 1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5 2 2 0 1 1 4 0 1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3 2 2 0 1 1 2.8 2.8 1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1 2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.5 1Z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
};
const ic = (n, c = 's69-ic') =>
  `<svg class="${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;

/* Sections. `ids` claims a panel by element id, `heads` by its exact heading
   text. `can` is the Access68 feature a role needs to see the section. */
const SECTIONS = [
  { key:'look',     label:'Brand & look',     icon:'brand',  can:'settings',
    desc:'Restaurant name, logo, tagline, themes and the menu footer.',
    ids:['custom48Panel'], heads:['Themes','Menu footer'] },

  { key:'people',   label:'Staff & logins',   icon:'users',  can:'staff',
    desc:'Who can sign in, what each role may open, and temporary waiters.',
    ids:['staffPanel68','accessPanel68','tempWaiters68','managerPerms66','waiterAccessPanel'],
    heads:['Waiter accounts'] },

  { key:'menu',     label:'Menu & stock',     icon:'menu',   can:'menu',
    desc:'Categories, item pricing, stock visibility, import and export.',
    ids:['menuIO69'], heads:['Dish categories','Stocks visibility'] },

  { key:'orders',   label:'Orders & devices', icon:'table',  can:'settings',
    desc:'Table and device controls, order reset times and auto-reject.',
    ids:['autoReject69'], heads:['Order device controls','Customer order reset times'] },

  { key:'bills',    label:'Bills & tax',      icon:'bill',   can:'settings',
    desc:'Tax, bill design and what is printed on every bill.',
    heads:['Bill tax'] },

  { key:'alerts',   label:'Alerts & sounds',  icon:'bell',   can:'notifications',
    desc:'Telegram, alarm sounds and how long alerts stay on screen.',
    heads:['Telegram Alerts','Alarm sounds','Notifications & Requests reset times'] },

  { key:'customer', label:'Customer menu',    icon:'phone',  can:'settings',
    desc:'What guests see: contact details and Google reviews.',
    heads:['Contact information','Google reviews'] },

  { key:'system',   label:'System & data',    icon:'gear',   can:'settings',
    desc:'Support contact, permanent resets and other system tools.',
    ids:['supportPanel68','system69'], heads:['Permanent data resets'] }
];
const FALLBACK = 'system';

let current = 'all', built = false;

const headOf = el => (el.querySelector(':scope > summary, :scope > h2, :scope > h3')?.textContent || '')
  .trim().replace(/\s+/g, ' ');

/* Which section owns this panel. Exact id, then heading prefix, then fallback. */
function sectionFor(el) {
  const id = el.id || '';
  const head = headOf(el);
  for (const s of SECTIONS) {
    if (s.ids && s.ids.includes(id)) return s.key;
  }
  for (const s of SECTIONS) {
    if (s.heads && s.heads.some(h => head === h || head.startsWith(h))) return s.key;
  }
  return FALLBACK;
}

function allowed(s) {
  const r = typeof staffRole !== 'undefined' ? staffRole : null;
  if (r === 'admin') return true;
  const can = window.Access68?.can;
  return typeof can === 'function' ? can(s.can) !== false : true;
}

const SKIP = new Set(['set69Rail', 'set69Pane', 'set69Head', 'set69Wrap', 'set69Index', 'set69PaneHead', 'settingsNav68']);

/* Before the rebuild the panels are children of the section; afterwards they
   live in the pane. Reading the wrong one makes the wrapper look like a panel
   and hides the whole screen. */
function panels() {
  const host = built ? $('set69Pane') : $('managementSection');
  if (!host) return [];
  return [...host.children].filter(el => !SKIP.has(el.id) && el.tagName !== 'H2');
}

function build() {
  const m = $('managementSection');
  if (!m || built) return;

  // Shell: head, then a two-column wrap holding the rail and the pane.
  const wrap = document.createElement('div');
  wrap.className = 'set69';
  wrap.id = 'set69Wrap';

  const rail = document.createElement('nav');
  rail.className = 'set69-rail';
  rail.id = 'set69Rail';
  rail.setAttribute('aria-label', 'Settings sections');

  const pane = document.createElement('div');
  pane.className = 'set69-pane';
  pane.id = 'set69Pane';

  // Move every existing panel into the pane, tagged with its section.
  const list = panels();
  for (const el of list) {
    el.dataset.sect69 = sectionFor(el);
    pane.append(el);
  }

  const head = document.createElement('div');
  head.className = 'page-tools';
  head.id = 'set69Head';
  head.innerHTML = `<div><h2>Settings</h2><p class="hint" id="set69Sub">Your restaurant, staff, bills and alerts.</p></div>`;

  m.innerHTML = '';
  m.append(head, wrap);
  wrap.append(rail, pane);

  rail.addEventListener('click', e => {
    const b = e.target.closest('[data-s69]');
    if (b) show(b.dataset.s69);
  });
  pane.addEventListener('click', e => {
    if (e.target.closest('[data-s69-back]')) show('all');
    const t = e.target.closest('[data-s69-go]');
    if (t) show(t.dataset.s69Go);
  });

  built = true;
  paintRail();
  show('all');
}

function visibleSections() { return SECTIONS.filter(allowed); }

function paintRail() {
  const rail = $('set69Rail');
  if (!rail) return;
  const items = visibleSections();
  rail.innerHTML =
    `<button type="button" data-s69="all" aria-pressed="${current === 'all'}">${ic('grid')}<span>All settings</span></button>` +
    items.map(s => `<button type="button" data-s69="${s.key}" aria-pressed="${current === s.key}">${ic(s.icon)}<span>${s.label}</span></button>`).join('');
}

function show(key) {
  const wrap = $('set69Wrap'), pane = $('set69Pane'), sub = $('set69Sub');
  if (!wrap || !pane) return;
  current = key;

  // Drop any index we rendered last time.
  pane.querySelector('#set69Index')?.remove();
  pane.querySelector('#set69PaneHead')?.remove();

  const items = visibleSections();

  if (key === 'all') {
    wrap.classList.remove('is-pane');
    for (const el of panels()) el.classList.add('sect-off69');
    const idx = document.createElement('div');
    idx.id = 'set69Index';
    idx.className = 'set69-index';
    idx.innerHTML = items.map(s =>
      `<button type="button" class="set69-tile" data-s69-go="${s.key}">${ic(s.icon)}<strong>${s.label}</strong><small>${s.desc}</small></button>`).join('');
    pane.prepend(idx);
    if (sub) sub.textContent = 'Pick a section to change its settings.';
  } else {
    wrap.classList.add('is-pane');
    const s = items.find(x => x.key === key) || items[0];
    let shown = 0;
    for (const el of panels()) {
      const on = el.dataset.sect69 === s.key;
      el.classList.toggle('sect-off69', !on);
      if (on) shown++;
    }
    const h = document.createElement('div');
    h.id = 'set69PaneHead';
    h.className = 'set69-pane-head';
    h.innerHTML = `<button type="button" class="secondary-btn btn-sm69 set69-back" data-s69-back>← All settings</button>
      <h2>${s.label}</h2><p class="hint">${s.desc}</p>` +
      (shown ? '' : '<p class="hint">Nothing in this section is available for your role.</p>');
    pane.prepend(h);
    if (sub) sub.textContent = s.label;
  }
  paintRail();
  pane.scrollIntoView({ block: 'nearest' });
}

/* Re-tag panels added after the first build (Telegram, waiter accounts…). */
function refresh() {
  if (!built) { build(); return; }
  const pane = $('set69Pane'), m = $('managementSection');
  if (!pane || !m) return;
  for (const el of [...m.children]) {
    if (el === $('set69Head') || el === $('set69Wrap')) continue;
    el.dataset.sect69 = sectionFor(el);
    pane.append(el);
  }
  for (const el of panels()) if (!el.dataset.sect69) el.dataset.sect69 = sectionFor(el);
  show(current);
}

return { build, refresh, show, get current() { return current; } };
})();
window.Settings69 = Settings69;
