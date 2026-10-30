/* Admin management: only the software admin sees this. Controls support details, branding,
   payments, billing features, role permissions and admin logins for this shop. */
'use strict';
const Admin = (() => {
  let root = null, section = 'access';
  const SECTIONS = [
    ['access', 'System on / off', 'power', 'Shut down for everyone except admin'],
    ['support', 'Support contact', 'phone', 'Who shops call for help'],
    ['brand', 'Branding', 'palette', 'Name, colours and sign-in screen'],
    ['billing', 'Payments & billing', 'card', 'Payment methods, features and limits'],
    ['roles', 'Roles & permissions', 'users', 'What owner, manager and cashier can do'],
    ['admins', 'Admin logins', 'shield', 'Who can open this page']
  ];
  const FEATURES = [
    ['extra_items', 'Extra items', 'Bill something that is not in the item list (Alt+X).'],
    ['cash_received', 'Cash received box', 'Type the cash given to see the change. Needed for short-cash bills.'],
    ['customer_details', 'Customer name & phone', 'Ask for the customer’s name and phone on the bill.'],
    ['notes', 'Note on bill', 'Let staff add a short note that prints on the bill.'],
    ['whatsapp', 'Send bill on WhatsApp', 'Show the WhatsApp button after saving a bill.'],
    ['qty_badges', 'Quantity on item tiles', 'Show ×2, ×3… on an item when it is already on the bill.'],
    ['stock_badges', 'Stock on item tiles', 'Show “12 left” and “Out of stock” on the billing screen.'],
    ['item_codes_on_tiles', 'Item codes on tiles', 'Show the barcode / code under each item name.']
  ];
  const sys = () => Store.sys;

  async function save(patch, btn, msg) {
    busy(btn, true, 'Saving…');
    try {
      Store.me.system = await Cloud.rpc('shop_system_save', { p: patch });
      App.applyBrand(); toast(msg || 'Saved. Every login in this shop now uses this.', 'ok'); return true;
    } catch (e) { toast(e.message, 'error', 7000); return false; } finally { busy(btn, false); }
  }
  const sw = (name, on, title, desc = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;

  /* ---------- sections ---------- */
  function accessSection() {
    const a = sys().access || {}, on = !a.locked;
    const since = a.locked_at ? Fmt.dateTime(a.locked_at) : '';
    return `<div class="admin-stack">
      <section class="card power-card ${on ? 'is-on' : 'is-off'}">
        <div class="power-state"><span class="power-dot" aria-hidden="true"></span><div>
          <h2>${on ? 'System is running' : 'System is shut down'}</h2>
          <p>${on ? 'Owner, managers and cashiers can sign in and make bills.' : `Only admin logins work${since ? ` · since ${esc(since)}` : ''}. Everyone else is signed out and sees your message.`}</p></div></div>
        <button type="button" class="btn btn-lg ${on ? 'btn-danger' : 'btn-primary'}" id="powerBtn">${Icon('power')} ${on ? 'Shut down system' : 'Turn system back on'}</button>
      </section>
      <form id="aAccess" class="card form-grid">
        <header class="span-2 card-head"><h2>Message shown while shut down</h2><p class="hint">Shown on the sign-in screen with your support contact, and to anyone who is signed out by the shutdown.</p></header>
        <label class="field span-2"><span>Message</span><textarea name="message" rows="3" maxlength="300">${esc(a.message || '')}</textarea></label>
        <div class="form-actions span-2"><button class="btn">Save message</button></div></form>
      <section class="card"><header class="card-head"><h2>What happens</h2></header>
        <ul class="hint-list"><li>Every action by owner, manager or cashier is refused by the server straight away — billing, records, items, everything.</li>
        <li>Screens left open sign themselves out the next time they are used, or within 5 minutes.</li>
        <li>Nothing is deleted. Bills, items, stock and logins stay exactly as they are.</li>
        <li>You can still sign in, use every screen and turn the system back on.</li></ul></section></div>`;
  }

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

  function brandSection() {
    const b = sys().brand || {};
    return `<form id="aBrand" class="card form-grid">
      <header class="span-2 card-head"><h2>Branding</h2><p class="hint">Your company name and the look of the app for this shop.</p></header>
      <label class="field"><span>Software company name</span><input name="software_name" maxlength="60" value="${esc(b.software_name)}" placeholder="e.g. SHOI SYSTEMS"></label>
      <label class="field"><span>App name <em>browser tab title</em></span><input name="app_title" maxlength="40" value="${esc(b.app_title)}" placeholder="Shop Billing"></label>
      <label class="field span-2"><span>Sign-in message</span><input name="signin_message" maxlength="120" value="${esc(b.signin_message)}"></label>
      <div class="span-2 switches">${sw('show_on_bill', b.show_on_bill !== false, 'Print “Billing software by …” on bills')}${sw('show_on_signin', b.show_on_signin !== false, 'Show company name on the sign-in screen')}</div>
      <fieldset class="span-2 swatches"><legend>App colour</legend>${Object.entries(App.ACCENTS).map(([k, a]) => `<label class="swatch"><input type="radio" name="accent" value="${k}" ${(b.accent || 'blue') === k ? 'checked' : ''}><span style="--c:${a.l[0]}"></span><small>${k[0].toUpperCase() + k.slice(1)}</small></label>`).join('')}</fieldset>
      <div class="form-actions span-2"><button class="btn btn-primary">Save branding</button></div></form>`;
  }

  function billingSection() {
    const p = sys().payments || {}, f = sys().features || {}, l = sys().limits || {};
    return `<form id="aBilling" class="admin-stack">
      <section class="card"><header class="card-head"><h2>Payment methods</h2><p class="hint">Only the methods turned on appear on the billing screen. Keep at least one on.</p></header>
        <div class="pay-toggles">${['Cash', 'UPI', 'Card'].map(m => sw('pay_' + m, p[m] !== false, m)).join('')}</div></section>
      <section class="card"><header class="card-head"><h2>Billing screen</h2><p class="hint">Turn parts of the billing screen on or off for everyone.</p></header>
        <div class="switches two">${FEATURES.map(([k, t, d]) => sw('f_' + k, f[k] !== false, t, d)).join('')}</div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Limits</h2><p class="hint">Admin is never limited. Owner, manager and cashier are.</p></header>
        <label class="field"><span>Biggest discount allowed (%)</span><input name="max_discount_percent" type="number" min="0" max="100" step="0.5" value="${Number(l.max_discount_percent ?? 100)}"></label>
        <label class="field"><span>Most cash a customer can pay short (${esc(Fmt.cur())})</span><input name="max_short_amount" type="number" min="0" max="100000" step="1" value="${Number(l.max_short_amount ?? 0)}"><small class="hint">When cash received is less than the total, the bill is reduced to what was paid — up to this amount.</small></label></section>
      <div class="form-actions sticky-save"><button class="btn btn-primary btn-lg">Save payments & billing</button></div></form>`;
  }

  function rolesSection() {
    const r = sys().roles || {}, roles = ['owner', 'manager', 'cashier'];
    return `<form id="aRoles" class="card">
      <header class="card-head"><h2>Roles & permissions</h2><p class="hint">Tick what each role can see and do. The server checks every action, so a hidden button can’t be used another way. Admin can always do everything.</p></header>
      <div class="table-wrap perm-wrap"><table class="table perm-table"><thead><tr><th>Permission</th>${roles.map(x => `<th class="c">${ROLE_LABEL[x]}</th>`).join('')}</tr></thead><tbody>
      ${PERMISSIONS.map(([group, perms]) => `<tr class="perm-group"><td colspan="4">${group}</td></tr>` + perms.map(([k, label]) => `<tr><td>${label}</td>${roles.map(x => `<td class="c"><input type="checkbox" data-role="${x}" data-perm="${k}" ${(r[x] || []).includes(k) ? 'checked' : ''} aria-label="${ROLE_LABEL[x]}: ${label}"></td>`).join('')}</tr>`).join('')).join('')}
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
    body.innerHTML = { access: accessSection, support: supportSection, brand: brandSection, billing: billingSection, roles: rolesSection, admins: adminsSection }[sec]();
    if (sec === 'access') {
      const f = $('#aAccess', root);
      f.onsubmit = e => { e.preventDefault(); save({ access: { message: f.message.value.trim() } }, e.submitter, 'Message saved.'); };
      $('#powerBtn', root).onclick = async e => {
        const on = !sys().access?.locked;
        if (on && !(await ask({ title: 'Shut down the system?', body: 'Owner, managers and cashiers will be signed out and cannot sign in until you turn it back on. Admin logins keep working. Nothing is deleted.', confirm: 'Shut down', danger: true }))) return;
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
      const f = $('#aBrand', root);
      f.addEventListener('change', e => { if (e.target.name === 'accent') { Store.me.system.brand = { ...sys().brand, accent: e.target.value }; App.applyBrand(); } });
      f.onsubmit = e => { e.preventDefault(); save({ brand: { software_name: f.software_name.value.trim(), app_title: f.app_title.value.trim() || 'Shop Billing', signin_message: f.signin_message.value.trim(), show_on_bill: f.show_on_bill.checked, show_on_signin: f.show_on_signin.checked, accent: f.accent.value } }, e.submitter, 'Branding saved.'); };
    }
    if (sec === 'billing') {
      const f = $('#aBilling', root);
      f.onsubmit = e => {
        e.preventDefault();
        const payments = Object.fromEntries(['Cash', 'UPI', 'Card'].map(m => [m, f['pay_' + m].checked]));
        if (!Object.values(payments).some(Boolean)) return toast('Keep at least one payment method turned on.', 'warn');
        save({ payments, features: Object.fromEntries(FEATURES.map(([k]) => [k, f['f_' + k].checked])),
               limits: { max_discount_percent: Number(f.max_discount_percent.value) || 0, max_short_amount: Number(f.max_short_amount.value) || 0 } }, e.submitter, 'Payments & billing saved.').then(paintHeader);
      };
    }
    if (sec === 'roles') {
      const f = $('#aRoles', root);
      f.onsubmit = e => {
        e.preventDefault();
        const roles = { owner: [], manager: [], cashier: [] };
        for (const c of $$('[data-perm]', f)) if (c.checked) roles[c.dataset.role].push(c.dataset.perm);
        save({ roles }, e.submitter, 'Permissions saved. Staff see the change the next time they open the app.');
      };
      $('#aRolesReset', root).onclick = async () => {
        if (!(await ask({ title: 'Reset permissions?', body: 'Owner, manager and cashier go back to the standard permissions.', confirm: 'Reset' }))) return;
        const def = { owner: ['billing', 'records', 'records_all', 'dashboard', 'items', 'stocks', 'settings_shop', 'settings_tax', 'settings_design', 'settings_contact', 'staff', 'discount', 'short_cash', 'cancel_bills', 'export', 'reset'],
          manager: ['billing', 'records', 'records_all', 'dashboard', 'items', 'stocks', 'discount', 'short_cash', 'cancel_bills', 'export'], cashier: ['billing', 'records', 'discount', 'short_cash'] };
        if (await save({ roles: def }, null, 'Permissions reset.')) show('roles');
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
    const s = sys().support || {}, pays = Store.payments();
    const locked = !!sys().access?.locked;
    h.innerHTML = `<div class="sum ${locked ? 'is-bad' : ''}"><span>System</span><b>${locked ? 'Shut down' : 'Running'}</b><small>${locked ? 'Only admin can sign in' : 'Everyone can sign in'}</small></div>
      <div class="sum"><span>Support</span><b>${esc(s.name || '—')}</b><small>${esc(s.phone || 'No number')}</small></div>
      <div class="sum"><span>Payments on</span><b>${pays.join(' · ') || '—'}</b></div>
      <div class="sum"><span>Shop</span><b>${esc(Store.settings.shop_name)}</b><small><a href="#/settings">Shop settings</a></small></div>`;
  }

  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page admin-page">
      <header class="page-head"><div><h1>${Icon('shield')} Admin</h1><p class="sub">Only admin logins can see this page. Changes apply to every login in this shop straight away.</p></div></header>
      <div class="summary admin-summary" id="adminSummary"></div>
      <div class="settings admin-layout">
        <nav class="set-nav admin-nav" id="adminNav">${SECTIONS.map(([k, l, ic, d]) => `<button type="button" data-s="${k}">${Icon(ic)}<span><b>${l}</b><small>${d}</small></span></button>`).join('')}</nav>
        <div id="adminBody2"></div>
      </div></div>`;
    $('#adminNav', view).onclick = e => { const b = e.target.closest('[data-s]'); if (b) show(b.dataset.s); };
    paintHeader(); show(section);
  }
  return { mount, unmount() { root = null; } };
})();
