/* Admin management: only the software admin sees this. System on/off, presets for each kind of business,
   app name & logo, themes, support details, limits, permissions and admin logins. */
'use strict';
const Admin = (() => {
  let root = null, section = 'access', presets = null, editing = null, themeFilter = 'all';
  const SECTIONS = [
    ['access', 'System on / off', 'power', 'Shut down for everyone except admin'],
    ['presets', 'Presets', 'grid', 'Gym, library, shop… what each business gets'],
    ['brand', 'App name & logo', 'image', 'Name and icon on phones and computers'],
    ['appearance', 'Themes', 'palette', '40 themes for everyone or each role'],
    ['support', 'Support contact', 'phone', 'Who shops call for help'],
    ['billing', 'Limits', 'sliders', 'Biggest discount and short cash'],
    ['roles', 'Roles & permissions', 'users', 'What owner, manager and cashier can do'],
    ['admins', 'Admin logins', 'shield', 'Who can open this page']
  ];
  const FEATURES = [
    ['extra_items', 'Extra items', 'Bill something that is not in the item list.'],
    ['cash_received', 'Cash received box', 'Type the cash given to see the change.'],
    ['customer_details', 'Customer name & phone', 'Ask for the customer’s name and phone.'],
    ['customer_address', 'Customer address', 'Ask for the customer’s address.'],
    ['notes', 'Note on bill', 'A short note that prints on the bill.'],
    ['whatsapp', 'Send bill on WhatsApp', 'WhatsApp button after saving a bill.'],
    ['qty_badges', 'Quantity on item tiles', '×2, ×3… on items already on the bill.'],
    ['stock_badges', 'Stock on item tiles', '“12 left” and “Out of stock”.'],
    ['item_codes_on_tiles', 'Item codes on tiles', 'The barcode / code under each name.']
  ];
  const MODULES = [['billing', 'Billing counter'], ['dashboard', 'Dashboard'], ['records', 'Records'], ['members', 'Members (plans, renewals, attendance)'], ['items', 'Items'], ['stocks', 'Stocks'], ['expenses', 'Expenses']];
  const MEMBER_SEES = [['see_plan', 'Their plan and dates'], ['see_days_left', 'Days left (big counter)'], ['see_history', 'Plan history'], ['see_payments', 'Amounts paid'], ['see_attendance', 'Their visits']];
  /* Same defaults as the database, so a preset saved here is complete on its own. */
  const DEF = {
    modules: { billing: true, dashboard: true, records: true, items: true, stocks: true, expenses: true, members: false },
    payments: { Cash: true, UPI: true, Card: true },
    features: { extra_items: true, customer_details: false, customer_address: false, notes: true, whatsapp: true, cash_received: true, stock_badges: true, item_codes_on_tiles: true, qty_badges: true },
    members: { remind_days: 5, login: true, attendance: true, checkin_gap_minutes: 120, see_plan: true, see_days_left: true, see_history: true, see_attendance: true, see_payments: true },
    roles: {
      owner: ['billing', 'records', 'records_all', 'dashboard', 'items', 'stocks', 'expenses', 'expenses_manage', 'members', 'members_add', 'members_renew', 'members_plans', 'members_login', 'attendance', 'settings_shop', 'settings_tax', 'settings_design', 'settings_contact', 'staff', 'roles_manager', 'roles_cashier', 'discount', 'short_cash', 'cancel_bills', 'export', 'reset'],
      manager: ['billing', 'records', 'records_all', 'dashboard', 'items', 'stocks', 'expenses', 'members', 'members_add', 'members_renew', 'members_plans', 'attendance', 'settings_tax', 'roles_cashier', 'discount', 'short_cash', 'cancel_bills', 'export'],
      cashier: ['billing', 'records', 'discount', 'short_cash', 'members', 'members_renew', 'attendance']
    }
  };
  const full = data => ({
    modules: { ...DEF.modules, ...(data.modules || {}) }, payments: { ...DEF.payments, ...(data.payments || {}) }, features: { ...DEF.features, ...(data.features || {}) },
    members: { ...DEF.members, ...(data.members || {}) }, roles: { ...DEF.roles, ...(data.roles || {}) }, labels: { ...(data.labels || {}) }, plans: [...(data.plans || [])]
  });
  const sys = () => Store.sys;

  async function save(patch, btn, msg) {
    busy(btn, true, 'Saving…');
    try {
      Store.me.system = await Cloud.rpc('shop_system_save', { p: patch });
      await App.refreshMe(true); toast(msg || 'Saved. Every login in this shop now uses this.', 'ok'); return true;
    } catch (e) { toast(e.message, 'error', 7000); return false; } finally { busy(btn, false); }
  }
  const sw = (name, on, title, desc = '', attrs = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${attrs}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;

  /* ---------- system on / off ---------- */
  function accessSection() {
    const a = sys().access || {}, on = !a.locked;
    const since = a.locked_at ? Fmt.dateTime(a.locked_at) : '';
    return `<div class="admin-stack">
      <section class="card power-card ${on ? 'is-on' : 'is-off'}">
        <div class="power-state"><span class="power-dot" aria-hidden="true"></span><div>
          <h2>${on ? 'System is running' : 'System is shut down'}</h2>
          <p>${on ? 'Owner, staff and members can sign in.' : `Only admin logins work${since ? ` · since ${esc(since)}` : ''}. Everyone else is signed out and sees your message.`}</p></div></div>
        <button type="button" class="btn btn-lg ${on ? 'btn-danger' : 'btn-primary'}" id="powerBtn">${Icon('power')} ${on ? 'Shut down system' : 'Turn system back on'}</button>
      </section>
      <form id="aAccess" class="card form-grid">
        <header class="span-2 card-head"><h2>Message shown while shut down</h2><p class="hint">Shown on the sign-in screen with your support contact, and to anyone who is signed out by the shutdown.</p></header>
        <label class="field span-2"><span>Message</span><textarea name="message" rows="3" maxlength="300">${esc(a.message || '')}</textarea></label>
        <div class="form-actions span-2"><button class="btn">Save message</button></div></form>
      <section class="card"><header class="card-head"><h2>What happens</h2></header>
        <ul class="hint-list"><li>Every action by owner, manager, cashier or member is refused by the server straight away.</li>
        <li>Open screens sign themselves out within a minute.</li>
        <li>Nothing is deleted. Bills, items, members and logins stay exactly as they are.</li>
        <li>You can still sign in, use every screen and turn the system back on.</li></ul></section></div>`;
  }

  /* ---------- presets ---------- */
  const modChips = d => MODULES.filter(([k]) => full(d).modules[k]).map(([k]) => `<span class="chip-s">${esc((d.labels || {})[k] || MODULE_LABEL[k])}</span>`).join('');
  function presetsSection() {
    if (!presets) { loadPresets(); return '<div class="card"><p class="hint">Loading presets…</p></div>'; }
    const act = presets.active;
    return `<div class="admin-stack">
      <section class="card"><div class="card-title-row"><div><h2>Presets</h2><p class="hint">A preset is a ready-made setup for one kind of business: which screens it has, what they are called, what owner, manager, cashier and members can see, billing switches and starter plans. Apply one and everyone gets it straight away — editing the active preset changes the app live.</p></div>
        <div class="toolbar"><label class="btn btn-ghost file-btn">${Icon('upload')} Import<input type="file" accept="application/json,.json" id="pImport" hidden></label><button type="button" class="btn btn-primary" id="pNew">${Icon('plus')} New preset</button></div></div></section>
      <div class="preset-grid">${presets.presets.map(p => `<article class="preset-card ${p.id === act ? 'is-active' : ''}" data-pid="${esc(p.id)}">
        <div class="pc-top"><span class="pc-icon" aria-hidden="true">${esc(p.icon || '🏷️')}</span><div><h3>${esc(p.name)}</h3>${p.id === act ? `<span class="badge badge-green">${Icon('check')} Active</span>` : p.builtin ? '<span class="badge">Built-in</span>' : '<span class="badge">Custom</span>'}</div></div>
        <p class="hint">${esc(p.description || '')}</p>
        <div class="chips-s">${modChips(p.data)}</div>
        <div class="pc-act">${p.id === act ? '' : `<button type="button" class="btn btn-sm btn-primary" data-apply>Apply</button>`}<button type="button" class="btn btn-sm" data-edit>${Icon('edit')} Edit</button>
          <button type="button" class="btn btn-sm btn-ghost" data-dup>Duplicate</button><button type="button" class="btn btn-sm btn-ghost" data-export aria-label="Export ${esc(p.name)}">${Icon('download')}</button>
          ${p.builtin ? '<button type="button" class="btn btn-sm btn-ghost" data-restore>Restore original</button>' : p.id === act ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-del aria-label="Delete ${esc(p.name)}">${Icon('trash')}</button>`}</div>
      </article>`).join('')}</div></div>`;
  }
  async function loadPresets() {
    try { presets = await Cloud.rpc('shop_presets_list'); if (root && section === 'presets' && !editing) show('presets'); }
    catch (e) { toast(e.message, 'error'); }
  }
  function presetEditor(p) {
    const d = full(p.data || {}), isActive = p.id && p.id === presets.active;
    const roles = ['owner', 'manager', 'cashier'];
    return `<form id="pForm" class="admin-stack" autocomplete="off">
      <section class="card"><div class="card-title-row"><div><h2>${p.id ? 'Edit preset' : 'New preset'}</h2><p class="hint">${isActive ? `${Icon('check')} This preset is in use: saving changes the app for everyone right away.` : 'Saved presets can be applied to this shop any time, or exported and imported into another shop.'}</p></div><button type="button" class="btn btn-ghost" data-back>${Icon('x')} Close</button></div>
        <div class="form-grid"><label class="field"><span>Name</span><input name="name" required maxlength="40" value="${esc(p.name || '')}" placeholder="e.g. Gym"></label>
          <label class="field"><span>Icon <em>an emoji</em></span><input name="icon" maxlength="8" value="${esc(p.icon || '')}" placeholder="🏋️"></label>
          <label class="field span-2"><span>Description</span><input name="description" maxlength="160" value="${esc(p.description || '')}"></label></div></section>
      <section class="card"><header class="card-head"><h2>Screens</h2><p class="hint">Switch screens on or off, and rename them for this business (e.g. Members → Students). A screen that is off is hidden for everyone, Admin too.</p></header>
        <div class="mod-rows">${MODULES.map(([k, t]) => `<div class="mod-row">${sw('m_' + k, d.modules[k], t)}<input name="l_${k}" maxlength="24" value="${esc(d.labels[k] || '')}" placeholder="${esc(MODULE_LABEL[k])}" aria-label="Name shown for ${esc(t)}"></div>`).join('')}</div></section>
      <section class="card" data-members-box><header class="card-head"><h2>Members</h2></header>
        <div class="form-grid"><label class="field"><span>Remind when this many days are left</span><input name="remind_days" type="number" min="0" max="60" value="${Number(d.members.remind_days)}"><small class="hint">Members this close to their end date move to the top in orange.</small></label>
          <label class="field"><span>Minutes before the same member can check in again</span><input name="gap" type="number" min="0" max="1440" value="${Number(d.members.checkin_gap_minutes)}"></label></div>
        <div class="switches two">${sw('mem_login', d.members.login, 'Member app login', 'Members sign in with their mobile number to see their plan.')}${sw('mem_att', d.members.attendance, 'QR attendance', 'Members scan the front-desk QR to check in; staff can check them in too.')}</div>
        <h3 class="sub-h">What members see in their app</h3>
        <div class="switches two">${MEMBER_SEES.map(([k, t]) => sw('see_' + k, d.members[k], t)).join('')}</div>
        <h3 class="sub-h">Starter plans <small class="hint">added when this preset is applied to a shop that has no plans yet</small></h3>
        <div class="starter" data-plans>${d.plans.map(planRow).join('')}</div><button type="button" class="btn btn-sm" data-addplan>${Icon('plus')} Add plan</button></section>
      <section class="card"><header class="card-head"><h2>Billing</h2></header>
        <div class="pay-toggles">${['Cash', 'UPI', 'Card'].map(m => sw('pay_' + m, d.payments[m], m)).join('')}</div>
        <div class="switches two">${FEATURES.map(([k, t, ds]) => sw('f_' + k, d.features[k], t, ds)).join('')}</div></section>
      <section class="card"><header class="card-head"><h2>Who sees what</h2><p class="hint">Tick what each role can see and do with this preset. Rows for screens that are off are greyed out.</p></header>
        <div class="table-wrap perm-wrap"><table class="table perm-table"><thead><tr><th>Permission</th>${roles.map(x => `<th class="c">${ROLE_LABEL[x]}</th>`).join('')}</tr></thead><tbody>
        ${PERMISSIONS.map(([group, perms]) => `<tr class="perm-group"><td colspan="4">${group}</td></tr>` + perms.map(([k, label]) => `<tr data-mod="${PERM_MODULE[k] || ''}"><td>${label}</td>${roles.map(x => `<td class="c"><input type="checkbox" data-role="${x}" data-perm="${k}" ${(d.roles[x] || []).includes(k) ? 'checked' : ''} aria-label="${ROLE_LABEL[x]}: ${label}"></td>`).join('')}</tr>`).join('')).join('')}
        </tbody></table></div></section>
      <div class="form-actions sticky-save">${p.id && !isActive ? '<button type="button" class="btn" data-saveapply>Save & apply</button>' : ''}<button class="btn btn-primary btn-lg">${isActive ? 'Save — changes apply now' : 'Save preset'}</button></div></form>`;
  }
  const planRow = (x = {}) => `<div class="starter-row"><input name="sp_name" maxlength="60" value="${esc(x.name || '')}" placeholder="Plan name" aria-label="Plan name"><input name="sp_val" type="number" min="1" max="3650" value="${Number(x.duration_value || 1)}" aria-label="How long"><select name="sp_unit" aria-label="Unit">${['day', 'month', 'year'].map(u => `<option value="${u}" ${(x.duration_unit || 'month') === u ? 'selected' : ''}>${u}s</option>`).join('')}</select><input name="sp_price" type="number" min="0" step="1" value="${x.price ?? ''}" placeholder="Price" aria-label="Price"><button type="button" class="icon-btn" data-delplan aria-label="Remove plan">${Icon('x')}</button></div>`;
  function readPreset(f) {
    const roles = { owner: [], manager: [], cashier: [] };
    for (const c of $$('[data-perm]', f)) if (c.checked) roles[c.dataset.role].push(c.dataset.perm);
    const labels = {}; MODULES.forEach(([k]) => { const v = f['l_' + k].value.trim(); if (v) labels[k] = v; });
    const plans = $$('.starter-row', f).map(r => ({ name: $('[name=sp_name]', r).value.trim(), duration_value: Number($('[name=sp_val]', r).value) || 1, duration_unit: $('[name=sp_unit]', r).value, price: Number($('[name=sp_price]', r).value) || 0 })).filter(x => x.name);
    return {
      id: editing.id || null, name: f.name.value.trim(), icon: f.icon.value.trim(), description: f.description.value.trim(),
      data: {
        modules: Object.fromEntries(MODULES.map(([k]) => [k, f['m_' + k].checked])), labels,
        payments: Object.fromEntries(['Cash', 'UPI', 'Card'].map(m => [m, f['pay_' + m].checked])),
        features: Object.fromEntries(FEATURES.map(([k]) => [k, f['f_' + k].checked])),
        members: { remind_days: Number(f.remind_days.value) || 0, checkin_gap_minutes: Number(f.gap.value) || 0, login: f.mem_login.checked, attendance: f.mem_att.checked, ...Object.fromEntries(MEMBER_SEES.map(([k]) => [k, f['see_' + k].checked])) },
        roles, plans
      }
    };
  }
  function wirePresetEditor() {
    const f = $('#pForm', root);
    const paint = () => { $('[data-members-box]', f).hidden = !f.m_members.checked; $$('tr[data-mod]', f).forEach(tr => { const m = tr.dataset.mod; tr.classList.toggle('mod-off', !!m && !f['m_' + m].checked); }); };
    f.addEventListener('change', paint); paint();
    f.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) { editing = null; show('presets'); }
      if (e.target.closest('[data-addplan]')) $('[data-plans]', f).insertAdjacentHTML('beforeend', planRow());
      if (e.target.closest('[data-delplan]')) e.target.closest('.starter-row').remove();
    });
    const doSave = async (btn, apply) => {
      const p = readPreset(f);
      if (!p.name) return toast('Give the preset a name.', 'warn');
      if (!Object.values(p.data.payments).some(Boolean)) return toast('Keep at least one payment method on.', 'warn');
      if (!Object.values(p.data.modules).some(Boolean)) return toast('Keep at least one screen on.', 'warn');
      busy(btn, true, 'Saving…');
      try {
        const r = await Cloud.rpc('shop_preset_save', { p }); presets = r;
        if (apply) presets = await Cloud.rpc('shop_preset_apply', { p_id: r.saved });
        const live = apply || r.saved === presets.active;
        if (live) await App.refreshMe(true);
        toast(live ? `“${p.name}” saved — everyone sees it now.` : `“${p.name}” saved.`, 'ok');
        editing = null; show('presets');
      } catch (ex) { toast(ex.message, 'error', 7000); } finally { busy(btn, false); }
    };
    f.onsubmit = e => { e.preventDefault(); doSave(e.submitter, false); };
    $('[data-saveapply]', f)?.addEventListener('click', e => doSave(e.currentTarget, true));
  }
  function wirePresets() {
    $('#pNew', root)?.addEventListener('click', () => { editing = { name: '', icon: '', description: '', data: {} }; show('presets'); });
    $('#pImport', root)?.addEventListener('change', async e => {
      const file = e.target.files[0]; e.target.value = ''; if (!file) return;
      try {
        const j = JSON.parse(await file.text());
        if (j.format !== 'shopbill-preset' || !j.name || typeof j.data !== 'object') throw new Error('This file is not a preset exported from this app.');
        presets = await Cloud.rpc('shop_preset_save', { p: { name: j.name, icon: j.icon || '', description: j.description || '', data: j.data } });
        toast(`Preset “${j.name}” imported.`, 'ok'); show('presets');
      } catch (ex) { toast(ex.message, 'error', 6000); }
    });
    $('.preset-grid', root)?.addEventListener('click', async e => {
      const card = e.target.closest('[data-pid]'); if (!card) return;
      const p = presets.presets.find(x => x.id === card.dataset.pid);
      if (e.target.closest('[data-edit]')) { editing = p; return show('presets'); }
      if (e.target.closest('[data-dup]')) { editing = { name: p.name + ' copy', icon: p.icon, description: p.description, data: JSON.parse(JSON.stringify(p.data)) }; return show('presets'); }
      if (e.target.closest('[data-export]')) return downloadFile(`preset-${p.id}.json`, JSON.stringify({ format: 'shopbill-preset', version: 1, name: p.name, icon: p.icon, description: p.description, data: p.data }, null, 2), 'application/json');
      if (e.target.closest('[data-apply]')) {
        if (!(await ask({ title: `Apply “${esc(p.name)}”?`, body: 'Screens, names and permissions change for everyone straight away. Bills, items and members are not touched.', confirm: 'Apply preset' }))) return;
        try { presets = await Cloud.rpc('shop_preset_apply', { p_id: p.id }); await App.refreshMe(true); toast(`“${p.name}” is now active.`, 'ok'); show('presets'); } catch (ex) { toast(ex.message, 'error'); }
      }
      if (e.target.closest('[data-restore]')) {
        if (!(await ask({ title: `Restore “${esc(p.name)}”?`, body: 'Your changes to this built-in preset are undone.', confirm: 'Restore' }))) return;
        try { presets = await Cloud.rpc('shop_preset_restore', { p_id: p.id }); if (p.id === presets.active) await App.refreshMe(true); toast('Restored.', 'ok'); show('presets'); } catch (ex) { toast(ex.message, 'error'); }
      }
      if (e.target.closest('[data-del]')) {
        if (!(await ask({ title: `Delete “${esc(p.name)}”?`, confirm: 'Delete', danger: true }))) return;
        try { presets = await Cloud.rpc('shop_preset_delete', { p_id: p.id }); toast('Deleted.', 'ok'); show('presets'); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
  }

  /* ---------- app name & logo ---------- */
  let draftIcon = null;
  function brandSection() {
    const b = sys().brand || {};
    return `<div class="admin-split"><form id="aBrand" class="card form-grid">
      <header class="span-2 card-head"><h2>App name & logo</h2><p class="hint">The name and icon people see on their home screen, in the browser tab and on the sign-in screen.</p></header>
      <label class="field"><span>App name</span><input name="app_title" maxlength="40" value="${esc(b.app_title)}" placeholder="Shop Billing"></label>
      <label class="field"><span>Short name <em>under the home-screen icon, up to 12 letters</em></span><input name="app_short_name" maxlength="12" value="${esc(b.app_short_name || '')}" placeholder="${esc((b.app_title || 'Shop Billing').slice(0, 12))}"></label>
      <div class="field span-2"><span>App logo <em>square PNG or JPG works best</em></span>
        <div class="logo-row"><span class="app-icon-prev" id="iconPrev"></span><div class="toolbar"><label class="btn file-btn">${Icon('upload')} Choose logo<input type="file" id="iconFile" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="btn btn-ghost" id="iconRemove">Use the standard icon</button></div></div>
        <label class="field narrow"><span>Logo background</span><input type="color" name="icon_bg" value="#ffffff" aria-label="Logo background colour"></label></div>
      <label class="field"><span>Software company name</span><input name="software_name" maxlength="60" value="${esc(b.software_name)}" placeholder="e.g. SHOI SYSTEMS"></label>
      <label class="field"><span>Sign-in message</span><input name="signin_message" maxlength="120" value="${esc(b.signin_message)}"></label>
      <div class="span-2 switches">${sw('show_on_bill', b.show_on_bill !== false, 'Print “Billing software by …” on bills')}${sw('show_on_signin', b.show_on_signin !== false, 'Show company name on the sign-in screen')}</div>
      <div class="form-actions span-2 sticky-save"><button class="btn btn-primary btn-lg">Save name & logo</button></div></form>
      <aside class="admin-preview"><h3>On a phone</h3><div class="phone-prev"><div class="home-grid"><span class="hg"></span><span class="hg"></span><span class="hg-app"><span class="app-icon-prev sm" id="iconPrev2"></span><small id="namePrev"></small></span><span class="hg"></span></div></div>
        <p class="hint">The tab title and the icon inside the app change straight away for everyone. Installed apps on Android update their icon and name on their own within a day or so (the phone may ask once). On iPhone, people need to remove and add the app to the home screen again to see a new icon.</p></aside></div>`;
  }
  async function makeIcon(file, bg) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPG or WEBP image.');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This image could not be read.')); i.src = URL.createObjectURL(file); });
    const draw = (pad, fill) => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, 512, 512);
      const box = 512 * (1 - pad * 2), k = Math.min(box / img.width, box / img.height), w = img.width * k, h = img.height * k; x.imageSmoothingQuality = 'high'; x.drawImage(img, (512 - w) / 2, (512 - h) / 2, w, h); return c.toDataURL('image/png'); };
    const icon = draw(0.06, bg), maskable = draw(0.18, bg);
    if (icon.length + maskable.length > 590000) throw new Error('This logo is too detailed to use as an app icon. Try a simpler PNG.');
    return { icon, maskable };
  }
  function paintIconPrev(f) {
    const cur = draftIcon ? draftIcon.icon : (JSON.parse(localStorage.getItem('SHOPBILL_ICON') || 'null')?.icon || '');
    for (const id of ['#iconPrev', '#iconPrev2']) { const el = $(id, root); if (el) el.innerHTML = cur ? `<img src="${cur}" alt="">` : `<img src="icons/icon-192.png" alt="">`; }
    $('#namePrev', root).textContent = (f.app_short_name.value || f.app_title.value || 'Shop Billing').slice(0, 12);
  }

  /* ---------- themes ---------- */
  function appearanceSection() {
    const a = sys().appearance || {}, roles = ['owner', 'manager', 'cashier', 'member'], cur = a.theme || 'ledger';
    const opts = sel => Themes.list.map(t => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.name)} (${t.mode})</option>`).join('');
    return `<div class="admin-stack" id="aLook">
      <section class="card"><div class="card-title-row"><div><h2>Theme for everyone</h2><p class="hint">Tap a theme — it is saved and every login in this shop switches to it within a minute. Only Admin can change themes.</p></div>
        <div class="seg" id="tFilter">${[['all', 'All 40'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-tf="${k}" class="${themeFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="theme-grid" role="list">${Themes.list.filter(t => themeFilter === 'all' || t.mode === themeFilter).map(t => `<button type="button" role="listitem" class="theme-card ${t.id === cur ? 'on' : ''}" data-theme-id="${t.id}" aria-pressed="${t.id === cur}">${Themes.swatch(t, a.accent)}<b>${esc(t.name)}</b><small>${t.mode === 'dark' ? 'Dark' : 'Light'}</small>${t.id === cur ? `<span class="tc-on">${Icon('check')}</span>` : ''}</button>`).join('')}</div></section>
      <form class="card form-grid" id="aRoleTheme"><header class="span-2 card-head"><h2>Different theme for a role</h2><p class="hint">Optional. For example a dark theme for the cashier at a dim counter, or a bright one for the member app.</p></header>
        ${roles.map(r => `<label class="field"><span>${ROLE_LABEL[r]}</span><select name="role_${r}"><option value="">Same as everyone</option>${opts(a[r])}</select></label>`).join('')}</form>
      <form class="card form-grid" id="aAccent"><header class="span-2 card-head"><h2>Brand colour</h2><p class="hint">Replace the theme’s button colour with your own. It is adjusted automatically if it would be hard to read.</p></header>
        <div class="field span-2"><div class="color-row">${sw('accent_on', !!a.accent, 'Use my own colour')}<label class="color-custom"><input type="color" name="accent" value="${esc(a.accent || '#1f5fbf')}" aria-label="Brand colour"><span class="mono">${esc(a.accent || '#1f5fbf')}</span></label></div></div></form></div>`;
  }
  let themeSaving = 0;
  async function saveAppearance(patch, msg) {
    const id = ++themeSaving;
    try {
      Store.me.system = await Cloud.rpc('shop_system_save', { p: { appearance: patch } });
      if (id === themeSaving) { App.applyTheme(); paintHeader(); toast(msg, 'ok', 2200); }
    } catch (e) { toast(e.message, 'error', 6000); }
  }

  /* ---------- support, limits, roles, admins ---------- */
  function supportSection() {
    const s = sys().support || {};
    return `<div class="admin-split"><form id="aSupport" class="card form-grid">
      <header class="span-2 card-head"><h2>Support contact</h2><p class="hint">Shown in Help & contact for every login, and on the sign-in screen. Only Admin can change it.</p></header>
      <label class="field"><span>Name</span><input name="name" maxlength="60" value="${esc(s.name)}" placeholder="e.g. Sumit"></label>
      <label class="field"><span>Mobile number</span><input name="phone" maxlength="30" inputmode="tel" value="${esc(s.phone)}" placeholder="+91 …"></label>
      <label class="field"><span>WhatsApp number <em>with country code, digits only</em></span><input name="whatsapp" maxlength="20" inputmode="numeric" value="${esc(s.whatsapp)}" placeholder="919142786139"></label>
      <label class="field"><span>Email <em>optional</em></span><input name="email" type="email" maxlength="120" value="${esc(s.email)}"></label>
      <label class="field span-2"><span>Website <em>optional</em></span><input name="website" type="url" maxlength="200" value="${esc(s.website)}" placeholder="https://"></label>
      <label class="field span-2"><span>Note <em>optional, e.g. support hours</em></span><textarea name="note" rows="2" maxlength="300">${esc(s.note)}</textarea></label>
      <div class="form-actions span-2"><button class="btn btn-primary">Save support contact</button></div></form>
      <aside class="admin-preview"><h3>How staff see it</h3><div class="help-card support-card" id="supPreview"></div></aside></div>`;
  }
  function paintSupportPreview() {
    const f = $('#aSupport', root); if (!f) return;
    const v = k => f[k].value.trim();
    $('#supPreview', root).innerHTML = `<h3>System support${sys().brand?.software_name ? ` · ${esc(sys().brand.software_name)}` : ''}</h3>
      ${v('name') ? `<p class="support-name">${esc(v('name'))}</p>` : ''}${v('phone') ? `<p class="support-phone">Mob no: <b>${esc(v('phone'))}</b></p>` : ''}
      <div class="stack">${v('phone') ? `<span class="btn btn-primary">${Icon('phone')} Call</span>` : ''}${v('whatsapp') ? `<span class="btn">${Icon('whatsapp')} WhatsApp</span>` : ''}${v('email') ? `<span class="btn">${Icon('mail')} ${esc(v('email'))}</span>` : ''}</div>
      ${v('note') ? `<p class="hint pre">${esc(v('note'))}</p>` : ''}`;
  }
  function billingSection() {
    const l = sys().limits || {};
    return `<form id="aBilling" class="admin-stack">
      <section class="card form-grid"><header class="span-2 card-head"><h2>Limits</h2><p class="hint">Admin is never limited. Everyone else is — the server enforces these.</p></header>
        <label class="field"><span>Biggest discount allowed (%)</span><input name="max_discount_percent" type="number" min="0" max="100" step="0.5" value="${Number(l.max_discount_percent ?? 100)}"></label>
        <label class="field"><span>Most cash a customer can pay short (${esc(Fmt.cur())})</span><input name="max_short_amount" type="number" min="0" max="100000" step="1" value="${Number(l.max_short_amount ?? 0)}"><small class="hint">When cash received is less than the total, the bill is reduced to what was paid — up to this amount.</small></label>
        <div class="form-actions span-2"><button class="btn btn-primary">Save limits</button></div></section>
      <section class="card"><header class="card-head"><h2>Payment methods & billing screen</h2><p class="hint">These are part of the active preset (Admin → Presets), and also in <a href="#/settings">Settings → Billing</a> for managers.</p></header></section></form>`;
  }
  function rolesSection() {
    const r = sys().roles || {}, roles = ['owner', 'manager', 'cashier'], pn = sys().preset?.name;
    return `<form id="aRoles" class="card">
      <header class="card-head"><h2>Roles & permissions</h2><p class="hint">Tick what each role can see and do. ${pn ? `Saved into the active preset <b>${esc(pn)}</b>.` : ''} Permissions of screens that are switched off are hidden. The server checks every action. Admin can always do everything.</p></header>
      <div class="table-wrap perm-wrap"><table class="table perm-table"><thead><tr><th>Permission</th>${roles.map(x => `<th class="c">${ROLE_LABEL[x]}</th>`).join('')}</tr></thead><tbody>
      ${PERMISSIONS.map(([group, perms]) => { const vis = perms.filter(([k]) => Store.permShown(k)); return vis.length ? `<tr class="perm-group"><td colspan="4">${group}</td></tr>` + vis.map(([k, label]) => `<tr><td>${label}</td>${roles.map(x => `<td class="c"><input type="checkbox" data-role="${x}" data-perm="${k}" ${(r[x] || []).includes(k) ? 'checked' : ''} aria-label="${ROLE_LABEL[x]}: ${label}"></td>`).join('')}</tr>`).join('') : ''; }).join('')}
      </tbody></table></div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" id="aRolesReset">Reset to default</button><button class="btn btn-primary">Save permissions</button></div></form>`;
  }
  function adminsSection() {
    return `<div class="admin-stack">
      <section class="card"><header class="card-head"><h2>Admin logins</h2><p class="hint">Admin logins never appear in the owner’s staff list, cannot be changed by the owner, and can open this page.</p></header>
        <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Last sign-in</th><th></th></tr></thead><tbody id="adminBody"><tr><td colspan="4">Loading…</td></tr></tbody></table></div></section>
      <form id="aAddAdmin" class="card form-grid"><header class="span-2 card-head"><h2>Add another admin</h2></header>
        <label class="field"><span>Name</span><input name="name" maxlength="60" placeholder="e.g. Sumit"></label>
        <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="off"></label>
        <label class="field"><span>Password <em>8+ characters</em></span><input name="password" type="text" minlength="8" required autocomplete="new-password"></label>
        <div class="form-actions"><button class="btn btn-primary">Add admin</button></div></form>
      <form id="aMe" class="card form-grid"><header class="span-2 card-head"><h2>My admin login</h2><p class="hint">${esc(Store.me.email)}</p></header>
        <label class="field"><span>Name shown on bills you make</span><input name="name" maxlength="60" value="${esc(Store.me.name)}"></label>
        <label class="field"><span>New password <em>leave empty to keep</em></span><input name="password" type="password" minlength="8" autocomplete="new-password"></label>
        <div class="form-actions span-2"><button class="btn btn-primary">Save my login</button></div></form></div>`;
  }
  async function loadAdmins() {
    try {
      const list = await Cloud.rpc('shop_admin_list'); const b = $('#adminBody', root); if (!b) return;
      b.innerHTML = list.map(a => `<tr data-uid="${esc(a.user_id)}"><td><b>${esc(a.name || 'Admin')}</b>${a.me ? ' <small>(you)</small>' : ''}</td><td>${esc(a.email)}</td><td>${a.last_sign_in ? esc(Fmt.dateTime(a.last_sign_in)) : '<span class="muted">Never</span>'}</td><td class="row-act">${a.me ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-remove>Remove</button>'}</td></tr>`).join('');
    } catch (e) { const b = $('#adminBody', root); if (b) b.innerHTML = `<tr><td colspan="4">${esc(e.message)}</td></tr>`; }
  }

  /* ---------- wiring ---------- */
  function show(sec) {
    section = sec;
    $$('#adminNav button', root).forEach(b => b.classList.toggle('on', b.dataset.s === sec));
    const body = $('#adminBody2', root);
    body.innerHTML = sec === 'presets' && editing ? presetEditor(editing) : { access: accessSection, presets: presetsSection, support: supportSection, brand: brandSection, appearance: appearanceSection, billing: billingSection, roles: rolesSection, admins: adminsSection }[sec]();
    if (sec === 'presets') { if (editing) wirePresetEditor(); else wirePresets(); }
    if (sec === 'appearance') {
      const look = $('#aLook', root);
      look.addEventListener('click', e => {
        const tf = e.target.closest('[data-tf]'); if (tf) { themeFilter = tf.dataset.tf; return show('appearance'); }
        const c = e.target.closest('[data-theme-id]'); if (!c) return;
        const t = Themes.get(c.dataset.themeId);
        $$('.theme-card', look).forEach(x => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); $('.tc-on', x)?.remove(); if (on) x.insertAdjacentHTML('beforeend', `<span class="tc-on">${Icon('check')}</span>`); });
        Themes.apply(t.id, Store.sys.appearance?.accent);
        saveAppearance({ theme: t.id }, `${t.name} saved for everyone.`);
      });
      $('#aRoleTheme', root).addEventListener('change', e => { const r = e.target.name.replace('role_', ''); saveAppearance({ [r]: e.target.value }, e.target.value ? `${ROLE_LABEL[r]} now use ${Themes.get(e.target.value).name}.` : `${ROLE_LABEL[r]} use the shop theme.`); });
      const af = $('#aAccent', root); let at = 0;
      const accent = () => { af.accent.nextElementSibling.textContent = af.accent.value; const v = af.accent_on.checked ? af.accent.value : ''; Themes.apply((Store.sys.appearance || {})[Store.role] || Store.sys.appearance?.theme, v); clearTimeout(at); at = setTimeout(() => saveAppearance({ accent: v }, v ? 'Brand colour saved.' : 'Theme colours restored.'), 500); };
      af.addEventListener('change', accent); af.addEventListener('input', e => { if (e.target.name === 'accent') { af.accent_on.checked = true; accent(); } });
    }
    if (sec === 'access') {
      const f = $('#aAccess', root);
      f.onsubmit = e => { e.preventDefault(); save({ access: { message: f.message.value.trim() } }, e.submitter, 'Message saved.'); };
      $('#powerBtn', root).onclick = async e => {
        const on = !sys().access?.locked;
        if (on && !(await ask({ title: 'Shut down the system?', body: 'Owner, staff and members will be signed out and cannot sign in until you turn it back on. Admin logins keep working. Nothing is deleted.', confirm: 'Shut down', danger: true }))) return;
        const ok = await save({ access: { locked: on, message: f.message.value.trim() || sys().access?.message || '', locked_at: on ? new Date().toISOString() : null } }, e.currentTarget,
          on ? 'System shut down. Only admin logins work now.' : 'System is running again. Everyone can sign in.');
        if (ok) { App.paintLock(); paintHeader(); show('access'); }
      };
    }
    if (sec === 'support') {
      const f = $('#aSupport', root); paintSupportPreview(); f.oninput = paintSupportPreview;
      f.onsubmit = e => { e.preventDefault(); save({ support: { name: f.name.value.trim(), phone: f.phone.value.trim(), whatsapp: f.whatsapp.value.replace(/\D/g, ''), email: f.email.value.trim(), website: f.website.value.trim(), note: f.note.value.trim() } }, e.submitter, 'Support contact saved.').then(paintHeader); };
    }
    if (sec === 'brand') {
      const f = $('#aBrand', root); draftIcon = null; paintIconPrev(f);
      f.oninput = () => paintIconPrev(f);
      let lastFile = null;
      const build = async file => { try { draftIcon = await makeIcon(file, f.icon_bg.value); paintIconPrev(f); } catch (ex) { toast(ex.message, 'error'); } };
      $('#iconFile', root).onchange = e => { lastFile = e.target.files[0]; e.target.value = ''; if (lastFile) build(lastFile).then(() => toast('Logo ready. Press Save to use it.')); };
      f.icon_bg.onchange = () => { if (lastFile) build(lastFile); };
      $('#iconRemove', root).onclick = () => { draftIcon = { icon: '', maskable: '' }; lastFile = null; paintIconPrev(f); };
      f.onsubmit = async e => {
        e.preventDefault(); const btn = e.submitter; busy(btn, true, 'Saving…');
        try {
          if (draftIcon) { const r = await Cloud.rpc('shop_app_icon_save', { p_icon: draftIcon.icon, p_maskable: draftIcon.maskable }); localStorage.setItem('SHOPBILL_ICON', JSON.stringify({ v: r.v, icon: r.icon })); App.setIcon(r.icon); draftIcon = null; }
          Store.me.system = await Cloud.rpc('shop_system_save', { p: { brand: { software_name: f.software_name.value.trim(), app_title: f.app_title.value.trim() || 'Shop Billing', app_short_name: f.app_short_name.value.trim(), signin_message: f.signin_message.value.trim(), show_on_bill: f.show_on_bill.checked, show_on_signin: f.show_on_signin.checked } } });
          await App.refreshMe(true); toast('App name and logo saved.', 'ok');
        } catch (ex) { toast(ex.message, 'error', 7000); } finally { busy(btn, false); }
      };
    }
    if (sec === 'billing') {
      const f = $('#aBilling', root);
      f.onsubmit = e => { e.preventDefault(); save({ limits: { max_discount_percent: Number(f.max_discount_percent.value) || 0, max_short_amount: Number(f.max_short_amount.value) || 0 } }, e.submitter, 'Limits saved.').then(paintHeader); };
    }
    if (sec === 'roles') {
      const f = $('#aRoles', root);
      f.onsubmit = e => {
        e.preventDefault();
        const cur = sys().roles || {}, roles = {};
        for (const r of ['owner', 'manager', 'cashier']) {
          const hidden = (cur[r] || []).filter(p => !Store.permShown(p));            // keep permissions of switched-off screens
          roles[r] = [...hidden, ...$$(`[data-role="${r}"]`, f).filter(c => c.checked).map(c => c.dataset.perm)];
        }
        save({ roles }, e.submitter, 'Permissions saved. Staff see the change within a minute.');
      };
      $('#aRolesReset', root).onclick = async () => {
        if (!(await ask({ title: 'Reset permissions?', body: 'Owner, manager and cashier go back to the standard permissions.', confirm: 'Reset' }))) return;
        if (await save({ roles: DEF.roles }, null, 'Permissions reset.')) show('roles');
      };
    }
    if (sec === 'admins') {
      loadAdmins();
      $('#adminBody', root).addEventListener('click', async e => {
        const tr = e.target.closest('tr[data-uid]'); if (!tr || !e.target.closest('[data-remove]')) return;
        if (!(await ask({ title: 'Remove this admin?', body: 'They will no longer be able to sign in to this shop.', confirm: 'Remove admin', danger: true }))) return;
        try { await Cloud.rpc('shop_admin_remove', { p_user_id: tr.dataset.uid }); toast('Admin removed.', 'ok'); loadAdmins(); } catch (ex) { toast(ex.message, 'error'); }
      });
      $('#aAddAdmin', root).onsubmit = async e => {
        e.preventDefault(); const f = e.target; busy(e.submitter, true, 'Saving…');
        try { await Cloud.rpc('shop_admin_set', { p_email: f.email.value.trim(), p_name: f.name.value.trim(), p_password: f.password.value }); toast('Admin added.', 'ok'); f.reset(); loadAdmins(); }
        catch (ex) { toast(ex.message, 'error', 7000); } finally { busy(e.submitter, false); }
      };
      $('#aMe', root).onsubmit = async e => {
        e.preventDefault(); const f = e.target; busy(e.submitter, true, 'Saving…');
        try { await Cloud.rpc('shop_admin_set', { p_email: Store.me.email, p_name: f.name.value.trim(), p_password: f.password.value || null }); await App.refreshMe(); f.password.value = ''; toast('Your login is saved.', 'ok'); loadAdmins(); }
        catch (ex) { toast(ex.message, 'error', 7000); } finally { busy(e.submitter, false); }
      };
    }
  }

  function paintHeader() {
    const h = $('#adminSummary', root); if (!h) return;
    const s = sys().support || {}, locked = !!sys().access?.locked, pr = sys().preset || {};
    h.innerHTML = `<div class="sum ${locked ? 'is-bad' : ''}"><span>System</span><b>${locked ? 'Shut down' : 'Running'}</b><small>${locked ? 'Only admin can sign in' : 'Everyone can sign in'}</small></div>
      <div class="sum"><span>Preset</span><b>${esc(pr.name || '—')}</b><small><button type="button" class="linkish" data-goto="presets">Change</button></small></div>
      <div class="sum"><span>Theme</span><b>${esc(Themes.get(sys().appearance?.theme).name)}</b><small><button type="button" class="linkish" data-goto="appearance">Change</button></small></div>
      <div class="sum"><span>Support</span><b>${esc(s.name || '—')}</b><small>${esc(s.phone || 'No number')}</small></div>`;
  }

  function mount(view) {
    root = view; presets = null; editing = null;
    view.innerHTML = `<div class="page admin-page">
      <header class="page-head"><div><h1>${Icon('shield')} Admin</h1><p class="sub">Only admin logins can see this page. Changes apply to every login in this shop straight away.</p></div></header>
      <div class="summary admin-summary" id="adminSummary"></div>
      <div class="settings admin-layout">
        <nav class="set-nav admin-nav" id="adminNav">${SECTIONS.map(([k, l, ic, d]) => `<button type="button" data-s="${k}">${Icon(ic)}<span><b>${l}</b><small>${d}</small></span></button>`).join('')}</nav>
        <div id="adminBody2"></div>
      </div></div>`;
    $('#adminNav', view).onclick = e => { const b = e.target.closest('[data-s]'); if (b) { if (b.dataset.s === 'presets') editing = null; show(b.dataset.s); } };
    $('.page', view).addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) { editing = null; show(g.dataset.goto); } });
    paintHeader(); show(section);
  }
  return { mount, unmount() { root = null; App.applyTheme(); }, refresh() { if (root) paintHeader(); } };
})();
