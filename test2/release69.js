/* Release 69 — menu import/export, order auto-reject, editable menu footer.
   ---------------------------------------------------------------------------
   Adds three Settings panels. settings69.js claims them by id:
     #menuIO69     -> Menu & stock
     #autoReject69 -> Orders & devices
     #footer69     -> Brand & look (replaces the fixed SHOI SYSTEMS wording)

   Settings live in restaurant_custom48.settings via Custom48.patch():
     menuIO69     {enabled, roles:{manager,cashier}}
     autoReject69 {on, hours}
     footer69     {creditOn, creditText, phoneOn, phone, phoneLabel}            */
'use strict';
(() => {
const $ = id => document.getElementById(id);
const esc = v => Cloud.esc(String(v ?? ''));
const isAdmin = () => typeof staffRole !== 'undefined' && staffRole === 'admin';
const cfg = () => (window.Custom48?.get?.() || {});

const DEFAULT_CREDIT = 'This system is made by SHOI SYSTEMS';

/* ----------------------------- helpers --------------------------------- */
function download(name, text, mime = 'application/json') {
  const b = new Blob([text], { type: mime + ';charset=utf-8' });
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; document.body.append(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const csvCell = v => {
  const raw = String(v ?? '');
  // Prevent Excel/Sheets formula execution from user-supplied dish names.
  const s = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');

/* A small RFC4180 reader: quoted fields, escaped quotes, CRLF or LF. */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\r') { /* handled by \n */ }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

const HEAD = ['name', 'category', 'price', 'veg', 'description'];
const HEAD_NO_CAT = ['name', 'price', 'veg', 'description'];

function rowsToItems(rows) {
  const head = rows[0].map(h => String(h).trim().toLowerCase());
  const idx = k => head.indexOf(k);
  const iN = idx('name'), iC = idx('category'), iP = idx('price'),
        iV = idx('veg'), iD = idx('description');
  if (iN < 0 || iP < 0) throw Error('The first row must name the columns, and must include "name" and "price".');
  return rows.slice(1).map(r => ({
    name: (r[iN] ?? '').trim(),
    category: iC >= 0 ? (r[iC] ?? '').trim() : '',
    price: (r[iP] ?? '').trim(),
    veg: iV >= 0 ? (r[iV] ?? '').trim() : '',
    description: iD >= 0 ? (r[iD] ?? '').trim() : ''
  }));
}

/* --------------------------- Menu import / export ----------------------- */
function menuVisible() {
  const s = cfg().menuIO69 || {};
  if (isAdmin()) return true;
  if (s.enabled === false) return false;
  const r = typeof staffRole !== 'undefined' ? staffRole : '';
  return !!(s.roles && s.roles[r]);
}

function menuPanel() {
  let p = $('menuIO69');
  if (!p) {
    p = document.createElement('section');
    p.id = 'menuIO69';
    p.className = 'panel';
  }
  /* Render once. A settings sync can land while someone is typing in these
     fields, and rebuilding innerHTML would throw their input away. */
  if (p.dataset.r69) return p;
  const s = cfg().menuIO69 || {};
  const roles = s.roles || {};
  p.innerHTML = `
    <h3>Import &amp; export the menu</h3>
    <p class="hint">Download every dish as a JSON or CSV file, or upload a file to add and update dishes in one go.</p>

    <div class="io69-block">
      <h4>Download</h4>
      <div class="io69-row">
        <label class="field"><span>File type</span>
          <select id="io69ExpFmt"><option value="json">JSON</option><option value="csv">CSV (opens in Excel)</option></select></label>
        <label class="field"><span>Categories</span>
          <select id="io69ExpCat"><option value="1">Include categories</option><option value="0">Without categories</option></select></label>
        <button type="button" class="secondary-btn" id="io69Export">Download menu</button>
      </div>
    </div>

    ${isAdmin() ? `    <div class="io69-block">
      <h4>Upload</h4>
      <p class="hint">JSON downloaded from here, or a CSV whose first row names the columns:
        <code>name, category, price, veg, description</code>. A dish whose name already exists is updated; the rest are added.</p>
      <div class="io69-row">
        <button type="button" class="secondary-btn" id="io69Tpl">Download a CSV template</button>
        <label class="secondary-btn io69-file">Choose a file
          <input type="file" id="io69File" accept=".json,.csv,application/json,text/csv" hidden></label>
      </div>
      <p id="io69Picked" class="hint"></p>
      <div id="io69Opts" hidden>
        <div class="io69-row">
          <label class="field"><span>Categories in this file</span>
            <select id="io69ImpCat">
              <option value="1">Use them, and create any that are missing</option>
              <option value="0">Ignore them, keep each dish where it is</option>
            </select></label>
          <label class="field"><span>Dishes that already exist</span>
            <select id="io69ImpRep">
              <option value="1">Update them</option>
              <option value="0">Leave them alone</option>
            </select></label>
        </div>
        <div class="toolbar">
          <button type="button" class="primary-btn" id="io69Import">Upload to the menu</button>
          <button type="button" class="secondary-btn" id="io69Cancel">Cancel</button>
        </div>
      </div>
      <p id="io69Status" role="status" class="hint"></p>
    </div>
` : `<p class="hint">Menu uploading is restricted to administrators. You can download the menu above.</p>`}

    ${isAdmin() ? `<div class="io69-block io69-admin">
      <h4>Who else can use this</h4>
      <p class="hint">Only an admin can upload. Turn this on for a role to let them download the menu too.</p>
      <label class="switch69"><input type="checkbox" id="io69On" ${s.enabled !== false ? 'checked' : ''}>
        <span class="sw69" aria-hidden="true"></span>
        <span class="sw-text69"><b>Show this to other roles</b><small>Off hides it from everyone except the admin.</small></span></label>
      <label class="switch69"><input type="checkbox" id="io69Mgr" ${roles.manager ? 'checked' : ''}>
        <span class="sw69" aria-hidden="true"></span><span class="sw-text69"><b>Managers</b></span></label>
      <label class="switch69"><input type="checkbox" id="io69Cash" ${roles.cashier ? 'checked' : ''}>
        <span class="sw69" aria-hidden="true"></span><span class="sw-text69"><b>Cashiers</b></span></label>
      <p id="io69SaveStatus" role="status" class="hint"></p>
    </div>` : ''}`;
  wireMenu(p);
  p.dataset.r69 = '1';
  return p;
}

let picked = null;

function wireMenu(p) {
  /* p is not in the document yet, so every lookup is scoped to it. */
  const q = id => p.querySelector('#' + id);
  const st = m => { const n = q('io69Status'); if (n) n.textContent = m; };

  q('io69Export').onclick = async () => {
    const fmt = q('io69ExpFmt').value, withCat = q('io69ExpCat').value === '1';
    st('Preparing the download…');
    try {
      const d = await Cloud.rpc('restaurant_menu_export69', { p_with_categories: withCat }, true);
      const items = d.items || [];
      if (!items.length) throw Error('There are no dishes to download yet.');
      if (fmt === 'json') {
        download('menu.json', JSON.stringify(d, null, 2));
      } else {
        const cols = withCat ? HEAD : HEAD_NO_CAT;
        download('menu.csv', toCSV([cols, ...items.map(i => cols.map(c => i[c] ?? ''))]), 'text/csv');
      }
      st(`Downloaded ${items.length} dishes${withCat ? ' with categories' : ' without categories'}.`);
    } catch (e) { st(e.message); }
  };

  // Non-admin roles have export access only; SQL import is admin-only.
  if (!isAdmin()) return;

  q('io69Tpl').onclick = () => download('menu-template.csv', toCSV([
    HEAD,
    ['Veg Steamed Momo', 'Steamed Momos', '99', 'yes', 'Classic steamed momo'],
    ['Chicken Fried Momo', 'Fried Momos', '149', 'no', '']
  ]), 'text/csv');

  q('io69File').onchange = async e => {
    const f = e.target.files[0]; picked = null;
    q('io69Opts').hidden = true; q('io69Picked').textContent = ''; st('');
    if (!f) return;
    try {
      if (f.size > 4_000_000) throw Error('Use a file under 4 MB.');
      const text = await f.text();
      let items;
      if (/\.json$/i.test(f.name) || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        const v = JSON.parse(text);
        items = Array.isArray(v) ? v : v.items;
        if (!Array.isArray(items)) throw Error('That JSON has no "items" list.');
      } else {
        items = rowsToItems(parseCSV(text));
      }
      items = items.filter(i => String(i.name || '').trim());
      if (!items.length) throw Error('No dishes were found in that file.');
      if (items.length > 2000) throw Error('That file has more than 2000 dishes.');
      picked = items;
      const cats = new Set(items.map(i => String(i.category || '').trim()).filter(Boolean));
      q('io69Picked').textContent =
        `${f.name} — ${items.length} dish${items.length === 1 ? '' : 'es'}` +
        (cats.size ? `, ${cats.size} categor${cats.size === 1 ? 'y' : 'ies'}.` : ', no categories in the file.');
      q('io69Opts').hidden = false;
      if (!cats.size) q('io69ImpCat').value = '0';
    } catch (err) { st(err.message); }
    finally { e.target.value = ''; }
  };

  q('io69Cancel').onclick = () => { picked = null; q('io69Opts').hidden = true; q('io69Picked').textContent = ''; st(''); };

  q('io69Import').onclick = async () => {
    if (!picked) return;
    const b = q('io69Import'); b.disabled = true; st('Uploading…');
    try {
      const r = await Cloud.rpc('restaurant_menu_import69', {
        p_rows: picked,
        p_with_categories: q('io69ImpCat').value === '1',
        p_replace: q('io69ImpRep').value === '1'
      }, true);
      st(`Done. ${r.added} added, ${r.updated} updated` +
         (r.categories_created ? `, ${r.categories_created} new categor${r.categories_created === 1 ? 'y' : 'ies'}` : '') +
         (r.skipped ? `, ${r.skipped} skipped (no name or no price)` : '') + '.');
      picked = null; q('io69Opts').hidden = true; q('io69Picked').textContent = '';
      await Cloud.refreshCategories?.();
      if (typeof loadManualMenu === 'function') loadManualMenu(true);
      if (typeof filterStaffMenu === 'function') filterStaffMenu();
    } catch (e) { st(e.message); }
    finally { b.disabled = false; }
  };

  if (isAdmin()) {
    const save = async () => {
      const n = q('io69SaveStatus'); n.textContent = 'Saving…';
      try {
        await window.Custom48.patch({ menuIO69: {
          enabled: q('io69On').checked,
          roles: { manager: q('io69Mgr').checked, cashier: q('io69Cash').checked }
        }});
        n.textContent = 'Saved.';
      } catch (e) { n.textContent = e.message; }
    };
    for (const id of ['io69On', 'io69Mgr', 'io69Cash']) { const el = q(id); if (el) el.onchange = save; }
  }
}

/* ------------------------------ Auto-reject ----------------------------- */
function rejectPanel() {
  let p = $('autoReject69');
  if (!p) { p = document.createElement('section'); p.id = 'autoReject69'; p.className = 'panel'; }
  if (p.dataset.r69) return p;
  const s = cfg().autoReject69 || {};
  const on = s.on !== false, hours = Number(s.hours) || 3;
  p.innerHTML = `
    <h3>Reject orders nobody accepted</h3>
    <p class="hint">If an order is still waiting after this long, it is rejected on its own, so an order placed late at night is not still open in the morning. The check runs while a signed-in staff screen is active; if every device is closed, rejection occurs the next time staff reconnects. For unattended scheduling, configure a separate server-side cron job.</p>
    <label class="switch69"><input type="checkbox" id="ar69On" ${on ? 'checked' : ''}>
      <span class="sw69" aria-hidden="true"></span>
      <span class="sw-text69"><b>Reject orders nobody accepted</b><small>Off means an order waits until someone accepts or rejects it.</small></span></label>
    <div class="io69-row" id="ar69Row" ${on ? '' : 'hidden'}>
      <label class="field"><span>Reject after</span>
        <select id="ar69Hours">
          ${[0.5, 1, 2, 3, 4, 6, 8, 12, 24].map(h =>
            `<option value="${h}" ${h === hours ? 'selected' : ''}>${h < 1 ? '30 minutes' : h + ' hour' + (h === 1 ? '' : 's')}</option>`).join('')}
        </select></label>
      <button type="button" class="secondary-btn" id="ar69Now">Reject waiting orders now</button>
    </div>
    <p id="ar69Status" role="status" class="hint"></p>`;

  const q = id => p.querySelector('#' + id);
  const st = m => q('ar69Status').textContent = m;
  const save = async () => {
    st('Saving…');
    try {
      await window.Custom48.patch({ autoReject69: {
        on: q('ar69On').checked, hours: Number(q('ar69Hours').value) || 3 } });
      q('ar69Row').hidden = !q('ar69On').checked;
      st('Saved.');
    } catch (e) { st(e.message); }
  };
  q('ar69On').onchange = save;
  q('ar69Hours').onchange = save;
  q('ar69Now').onclick = async () => {
    st('Checking…');
    try {
      const n = await Cloud.rpc('restaurant_auto_reject_tick69', {}, true);
      st(n ? `${n} waiting order${n === 1 ? '' : 's'} rejected.` : 'No order has been waiting that long.');
      if (typeof refreshOrders === 'function') refreshOrders();
    } catch (e) { st(e.message); }
  };
  p.dataset.r69 = '1';
  return p;
}

/* ------------------------------ Menu footer ----------------------------- */
function footerPanel() {
  let p = $('footer69');
  if (!p) { p = document.createElement('section'); p.id = 'footer69'; p.className = 'panel'; }
  if (p.dataset.r69) return p;
  const f = cfg().footer69 || {};
  const creditOn = f.creditOn !== false;
  p.innerHTML = `
    <h3>Menu footer</h3>
    <p class="hint">The small line at the bottom of the customer menu. Both parts are optional.</p>
    <label class="switch69"><input type="checkbox" id="f69CreditOn" ${creditOn ? 'checked' : ''}>
      <span class="sw69" aria-hidden="true"></span>
      <span class="sw-text69"><b>Show a credit line</b></span></label>
    <label class="field"><span>Credit line</span>
      <input id="f69Credit" maxlength="160" placeholder="${esc(DEFAULT_CREDIT)}" value="${esc(f.creditText ?? DEFAULT_CREDIT)}"></label>
    <label class="switch69"><input type="checkbox" id="f69PhoneOn" ${f.phoneOn ? 'checked' : ''}>
      <span class="sw69" aria-hidden="true"></span>
      <span class="sw-text69"><b>Show a phone number</b><small>Guests can tap it to call.</small></span></label>
    <div class="io69-row">
      <label class="field"><span>Label before the number</span>
        <input id="f69PhoneLabel" maxlength="40" placeholder="Call us" value="${esc(f.phoneLabel ?? 'Call us')}"></label>
      <label class="field"><span>Phone number</span>
        <input id="f69Phone" maxlength="30" inputmode="tel" placeholder="+91 98765 43210" value="${esc(f.phone ?? '')}"></label>
    </div>
    <div class="toolbar"><button type="button" class="primary-btn" id="f69Save">Save menu footer</button></div>
    <p id="f69Status" role="status" class="hint"></p>`;

  const q = id => p.querySelector('#' + id);
  q('f69Save').onclick = async () => {
    const n = q('f69Status'); n.textContent = 'Saving…';
    try {
      await window.Custom48.patch({ footer69: {
        creditOn: q('f69CreditOn').checked,
        creditText: q('f69Credit').value.trim() || DEFAULT_CREDIT,
        phoneOn: q('f69PhoneOn').checked,
        phoneLabel: q('f69PhoneLabel').value.trim() || 'Call us',
        phone: q('f69Phone').value.trim()
      }});
      n.textContent = 'Saved. The customer menu updates within a few seconds.';
    } catch (e) { n.textContent = e.message; }
  };
  p.dataset.r69 = '1';
  return p;
}

/* --------------------------- System on / off ---------------------------- */
const OFF_MSG = 'This system is switched off right now. Please contact support.';

function systemPanel() {
  let p = $('system69');
  if (!p) { p = document.createElement('section'); p.id = 'system69'; p.className = 'panel'; }
  if (p.dataset.r69) return p;
  const q = id => p.querySelector('#' + id);
  const s = cfg().system69 || {};
  const on = s.on !== false;
  p.innerHTML = `
    <h3>System on / off</h3>
    <div class="sys69-state ${on ? 'is-on' : 'is-off'}">
      <div><b>${on ? 'System is running' : 'System is switched off'}</b>
        <small>${on ? 'Managers, cashiers and waiters can sign in.' : 'Only you can sign in. Everyone else is signed out.'}</small></div>
      <button type="button" class="${on ? 'danger-btn' : 'primary-btn'}" id="sys69Toggle">${on ? 'Shut down system' : 'Turn the system back on'}</button>
    </div>
    <label class="field"><span>Message shown while it is off</span>
      <textarea id="sys69Msg" rows="2" maxlength="300" placeholder="${esc(OFF_MSG)}">${esc(s.message ?? OFF_MSG)}</textarea></label>
    <div class="toolbar"><button type="button" class="secondary-btn" id="sys69Save">Save message</button></div>
    <p class="hint"><b>What happens.</b> Every manager, cashier and waiter device is refused by the server and signs itself out within about a minute. Nothing is deleted: orders, menu and logins stay exactly as they are. You keep full access and can switch it back on at any time. Customers scanning the table QR are not affected.</p>
    <p id="sys69Status" role="status" class="hint"></p>`;

  const st = m => q('sys69Status').textContent = m;
  const write = async next => {
    st('Saving…');
    try { await window.Custom48.patch({ system69: next }); st('Saved.'); return true; }
    catch (e) { st(e.message); return false; }
  };
  q('sys69Toggle').onclick = async () => {
    const nowOn = (cfg().system69 || {}).on !== false;
    const msg = q('sys69Msg').value.trim() || OFF_MSG;
    if (nowOn && !confirm('Shut the system down for everyone except you?')) return;
    if (await write({ on: !nowOn, message: msg })) { p.dataset.r69 = ''; p.replaceWith(systemPanel()); }
  };
  q('sys69Save').onclick = () => write({ on: (cfg().system69 || {}).on !== false, message: q('sys69Msg').value.trim() || OFF_MSG });

  p.dataset.r69 = '1';
  return p;
}

/* Non-admin devices sign themselves out when the heartbeat starts refusing. */
let offSeen = 0;
setInterval(async () => {
  if (typeof loggedIn === 'undefined' || !loggedIn || document.hidden) return;
  if (isAdmin()) return;
  if (Date.now() - offSeen < 55000) return;
  offSeen = Date.now();
  try { await Cloud.rpc('restaurant_staff_heartbeat68', {}, true); }
  catch (e) {
    const m = String(e?.message || '');
    if (/No staff access/i.test(m)) return;           // handled elsewhere
    if (/switched off|contact support|maintenance/i.test(m) || (cfg().system69 || {}).on === false) {
      alert(m || OFF_MSG);
      if (typeof signOutStaff === 'function') signOutStaff();
    }
  }
}, 20000);

/* ------------------------------- mounting ------------------------------- */
let mounting = false;

/* Appends (or re-renders) the three panels. Idempotent: each panel is reused
   by id. `rescan` asks Settings69 to re-sort the pane afterwards; it is left
   off when Settings69 is the caller, so the two never loop. */
function mount(rescan = true) {
  const host = $('set69Pane') || $('managementSection');
  if (!host || mounting) return;
  mounting = true;
  try {
    const before = !!($('menuIO69') || $('autoReject69') || $('footer69'));

    if (menuVisible()) host.append(menuPanel()); else $('menuIO69')?.remove();
    if (isAdmin()) {
      host.append(rejectPanel());
      host.append(footerPanel());
      host.append(systemPanel());
      // The old local-only JSON preview is superseded by the panel above.
      for (const d of host.querySelectorAll('details')) {
        if (/Menu backup & local file preview/.test(d.querySelector('summary')?.textContent || '')) d.hidden = true;
      }
    }
    if (rescan && !before) window.Settings69?.refresh();
  } finally { mounting = false; }
}

document.addEventListener('custom48:applied', () => {
  if ($('menuIO69') || $('autoReject69') || $('footer69')) mount();
});

window.Release69 = { mount };

/* Keep the server-side auto-reject ticking while any staff device is signed
   in, so no external scheduler is needed. */
let tick = 0;
setInterval(() => {
  if (typeof loggedIn === 'undefined' || !loggedIn || document.hidden) return;
  if (Date.now() - tick < 600000) return;
  tick = Date.now();
  Cloud.rpc('restaurant_auto_reject_tick69', {}, true).catch(() => {});
}, 60000);
})();
