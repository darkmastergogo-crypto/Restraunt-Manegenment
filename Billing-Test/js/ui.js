/* Shared state and small UI helpers used by every screen. */
'use strict';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROLE_LABEL = { superadmin: 'Admin', owner: 'Owner', manager: 'Manager', cashier: 'Cashier', member: 'Member' };

/* What each permission means, grouped for the Admin → Roles & permissions screen. */
const PERMISSIONS = [
  ['Screens', [['billing', 'Billing counter'], ['records', 'Records (today)'], ['records_all', 'Records (any date)'], ['dashboard', 'Dashboard'], ['items', 'Items'], ['stocks', 'Stocks']]],
  ['Billing', [['discount', 'Give discounts'], ['short_cash', 'Accept less cash than the total'], ['cancel_bills', 'Cancel bills'], ['export', 'Export records to CSV']]],
  ['Expenses', [['expenses', 'See and add expenses'], ['expenses_manage', 'Edit, delete, expense types & auto expenses']]],
  ['Members', [['members', 'See members'], ['members_add', 'Add and edit members'], ['members_renew', 'Renew or change a membership'], ['members_plans', 'Plans, dates & check-in code'], ['members_login', 'Member logins'], ['attendance', 'Attendance (check members in)']]],
  ['Settings', [['settings_shop', 'Shop details'], ['settings_tax', 'Billing (tax, payments, stock)'], ['settings_design', 'Bill design & extras'], ['settings_contact', 'Shop contact info'], ['staff', 'Staff & logins'], ['roles_manager', 'Change what managers can do'], ['roles_cashier', 'Change what cashiers can do'], ['reset', 'Delete all bills']]]
];

/* Which screen each permission belongs to. A screen switched off in the preset hides its permissions too. */
const PERM_MODULE = { billing: 'billing', records: 'records', records_all: 'records', cancel_bills: 'records', export: 'records', dashboard: 'dashboard', items: 'items', stocks: 'stocks',
  expenses: 'expenses', expenses_manage: 'expenses', members: 'members', members_add: 'members', members_renew: 'members', members_plans: 'members', members_login: 'members', attendance: 'members' };
/* Default screen names; a preset can rename them (e.g. Members → Students). */
const MODULE_LABEL = { billing: 'Billing', dashboard: 'Dashboard', records: 'Records', items: 'Items', stocks: 'Stocks', expenses: 'Expenses', members: 'Members' };

const Store = {
  me: null,            // { role, name, email, today, settings, system, perms }
  items: [],
  categories: [],
  itemsLoadedAt: 0,
  get settings() { return this.me?.settings || {}; },
  get sys() { return this.me?.system || App.publicInfo || {}; },
  get role() { return this.me?.role || ''; },
  get isAdmin() { return this.role === 'superadmin'; },
  feature(name) { const f = this.sys.features || {}; return name in f ? f[name] !== false : !['customer_details', 'customer_address'].includes(name); },
  can(perm) {
    const p = this.me?.perms || [];
    if (perm === 'settings') return ['settings_shop', 'settings_tax', 'settings_design', 'settings_contact', 'staff', 'reset', 'roles_manager', 'roles_cashier'].some(x => p.includes(x));
    if (perm === 'stocks') return p.includes('stocks') && this.stockShown();
    return p.includes(perm);
  },
  payments() { const p = this.sys.payments || {}; return ['Cash', 'UPI', 'Card'].filter(m => p[m] !== false); },
  get isMember() { return this.role === 'member'; },
  moduleOn(m) { const mods = this.sys.modules || {}; return m in mods ? mods[m] !== false : m !== 'members'; },
  permShown(perm) { const m = PERM_MODULE[perm]; return !m || this.moduleOn(m); },
  label(m) { return (this.sys.labels || {})[m] || MODULE_LABEL[m] || m; },
  /* singular for "Add member" / "Add student" */
  label1(m) { const l = this.label(m); return /ies$/i.test(l) ? l.replace(/ies$/i, 'y') : l.replace(/s$/i, ''); },
  /* Stock can be hidden by the owner/manager; Admin always sees it. */
  stockShown() { return this.isAdmin || !this.settings.stock_hidden; },
  /* Optional item fields switched on in Settings → Billing. HSN is on by default; others off. */
  itemField(k) { const f = this.settings.item_fields || {}; return k in f ? !!f[k] : k === 'hsn'; },
  invoice() { return this.settings.invoice || {}; },
  async loadItems(force = false) {
    if (!force && this.itemsLoadedAt && Date.now() - this.itemsLoadedAt < 15000) return this.items;
    const data = await Cloud.rpc('shop_items_list');
    this.items = data.items || []; this.categories = data.categories || []; this.itemsLoadedAt = Date.now();
    document.dispatchEvent(new CustomEvent('items:changed'));
    return this.items;
  },
  upsertItem(item) {
    const i = this.items.findIndex(x => x.id === item.id);
    if (i >= 0) this.items[i] = item; else this.items.push(item);
    if (item.category && !this.categories.includes(item.category)) this.categories.push(item.category);
    this.items.sort((a, b) => a.name.localeCompare(b.name));
    document.dispatchEvent(new CustomEvent('items:changed'));
  },
  /* Patch stock counts locally from a bill/cancel response instead of re-downloading the whole item list. */
  applyStockUpdates(updates) {
    if (!updates?.length) return;
    for (const u of updates) { const it = this.items.find(x => x.id === u.id); if (it) it.stock = u.stock; }
    document.dispatchEvent(new CustomEvent('items:changed'));
  }
};

const Fmt = {
  nf2: new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  nf0: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }),
  nfq: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }),
  cur() { return Store.settings.currency || '₹'; },
  money(v) { return this.cur() + this.nf2.format(Number(v) || 0); },
  money0(v) { return this.cur() + this.nf0.format(Math.round(Number(v) || 0)); },
  compact(v) { const n = Number(v) || 0; if (Math.abs(n) >= 1e7) return this.cur() + (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr'; if (Math.abs(n) >= 1e5) return this.cur() + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L'; if (Math.abs(n) >= 1e3) return this.cur() + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'; return this.cur() + Math.round(n); },
  qty(v) { return this.nfq.format(Number(v) || 0); },
  tz() { return Store.settings.timezone || 'Asia/Kolkata'; },
  dateTime(iso) { return new Date(iso).toLocaleString('en-IN', { timeZone: this.tz(), day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); },
  time(iso) { return new Date(iso).toLocaleTimeString('en-IN', { timeZone: this.tz(), hour: 'numeric', minute: '2-digit' }); },
  date(d) { const dt = typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00:00Z') : new Date(d); return dt.toLocaleDateString('en-IN', { timeZone: typeof d === 'string' && d.length === 10 ? 'UTC' : this.tz(), day: 'numeric', month: 'short', year: 'numeric' }); },
  /* "today" as YYYY-MM-DD in the shop's time zone */
  today() { return new Intl.DateTimeFormat('en-CA', { timeZone: this.tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); },
  addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
  monthStart(iso) { return iso.slice(0, 8) + '01'; }
};

/* Period presets shared by Records and Dashboard. */
function periodRange(key, from, to) {
  const t = Fmt.today();
  switch (key) {
    case 'today': return [t, t];
    case 'yesterday': { const y = Fmt.addDays(t, -1); return [y, y]; }
    case 'week': return [Fmt.addDays(t, -6), t];
    case 'month': return [Fmt.monthStart(t), t];
    case 'lastmonth': { const end = Fmt.addDays(Fmt.monthStart(t), -1); return [Fmt.monthStart(end), end]; }
    case 'year': return [t.slice(0, 4) + '-01-01', t];
    default: return [from || t, to || from || t];
  }
}
const PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom']];

/* Toasts never pile up: the same message just stays up longer, and at most 3 show at once. */
function toast(message, kind = 'info', ms = 3600) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  let t = [...host.children].find(x => x.textContent === message && !x.classList.contains('out'));
  if (t) { clearTimeout(t._timer); t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
  else {
    t = document.createElement('div'); t.className = 'toast toast-' + kind; t.textContent = message; host.append(t);
    while (host.children.length > 3) host.firstElementChild.remove();
  }
  t._timer = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}
const isTouch = () => matchMedia('(hover: none) and (pointer: coarse)').matches;

/* Promise-based dialog. Returns the input value (or true) on confirm, null on cancel. */
function ask({ title, body = '', confirm = 'OK', cancel = 'Cancel', danger = false, input = null }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'modal modal-sm';
    d.innerHTML = `<form method="dialog"><header class="modal-head"><h2>${esc(title)}</h2></header>
      <div class="modal-body">${body ? `<p>${body}</p>` : ''}${input ? `<label class="field"><span>${esc(input.label)}</span><input name="v" ${input.type ? `type="${input.type}"` : ''} value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" ${input.required ? 'required' : ''} maxlength="${input.maxlength || 200}" autocomplete="off"></label>` : ''}</div>
      <footer class="modal-foot"><button type="button" class="btn btn-ghost" value="cancel">${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${esc(confirm)}</button></footer></form>`;
    document.body.append(d);
    const f = $('form', d);
    $('[value=cancel]', d).onclick = () => d.close('cancel');
    f.onsubmit = e => { e.preventDefault(); if (!f.reportValidity()) return; d.close('ok'); };
    d.addEventListener('close', () => { const ok = d.returnValue === 'ok'; resolve(ok ? (input ? $('[name=v]', d).value : true) : null); d.remove(); });
    d.showModal(); (input ? $('[name=v]', d) : $('[value=ok]', d)).focus();
  });
}

/* Generic modal shell. content: HTML string. Returns the dialog element. */
function modal(title, content, { size = '', onClose } = {}) {
  const d = document.createElement('dialog'); d.className = 'modal ' + size;
  d.innerHTML = `<header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${Icon('x')}</button></header><div class="modal-body">${content}</div>`;
  document.body.append(d);
  d.addEventListener('click', e => { if (e.target.closest('[data-close]')) d.close(); });
  d.addEventListener('close', () => { onClose?.(); d.remove(); });
  d.showModal();
  return d;
}

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; if (label) btn.textContent = label; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

function downloadFile(name, text, type = 'text/csv') {
  const blob = new Blob([type === 'text/csv' ? '﻿' + text : text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function toCSV(rows) {
  return rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/* Inline SVG icon set (stroke icons, 24px grid). */
const ICONS = {
  bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  whatsapp: '<path d="M20 12a8 8 0 0 1-11.8 7L4 20l1-4.1A8 8 0 1 1 20 12z"/><path d="M9 9.5c.3 2 2.4 4.1 4.5 4.5l1-1.2 1.8.8c-.2 1-1 1.6-2 1.6-3 0-6-3-6-6 0-1 .6-1.8 1.6-2l.8 1.8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', moon: '<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"/><path d="M4 4v4h4M20 20v-4h-4"/>', keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r=".8"/>', check: '<path d="M5 12l5 5L20 7"/>',
  rupee: '<path d="M6 4h12M6 9h12M6 4c7 0 7 9 0 9l8 7"/>',
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 14a3 3 0 0 1-2.7-1.1A3 3 0 0 1 4 11z"/><path d="M5 13.5V20h14v-6.5M10 20v-4h4v4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M16 16h2v2"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    power: '<path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h12v4"/><path d="M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16.5a3.6 3.6 0 0 1 7 0M15 10h3M15 13.5h3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', ban: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>', barcode: '<path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14"/>'
};
function Icon(name, cls = '') { return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`; }

/* Compress an uploaded image into a small data URL (logo use). */
async function imageToDataURL(file, maxSide = 360, maxBytes = 240000) {
  if (!file) return '';
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPG or WEBP image.');
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This image could not be read.')); i.src = URL.createObjectURL(file); });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  let q = 0.9, out = c.toDataURL('image/png');
  while (out.length > maxBytes && q > 0.3) { out = c.toDataURL('image/jpeg', q); q -= 0.1; }
  if (out.length > maxBytes) throw new Error('This image is too large even after shrinking. Use a simpler logo.');
  return out;
}
