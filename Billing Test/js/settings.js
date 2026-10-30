/* Shop settings: shop details, tax, bill design, staff, contact, data. Each section follows its permission. */
'use strict';
const Settings = (() => {
  let root = null, section = null, draftBill = null, draftLogo = null;
  const SECTIONS = [['shop', 'Shop details', 'settings_shop'], ['billing', 'Billing & tax', 'settings_tax'], ['design', 'Bill design', 'settings_design'],
                    ['staff', 'Staff & logins', 'staff'], ['contact', 'Contact info', 'settings_contact'], ['data', 'Data', 'reset']];
  const TIMEZONES = ['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Karachi', 'Asia/Colombo', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];

  async function saveSettings(patch, btn, msg = 'Settings saved.') {
    busy(btn, true, 'Saving…');
    try { Store.me.settings = await Cloud.rpc('shop_settings_save', { p: patch }); App.applyShop(); toast(msg, 'ok'); return true; }
    catch (e) { toast(e.message, 'error', 6000); return false; } finally { busy(btn, false); }
  }

  function shopSection(s) {
    draftLogo = s.logo || '';
    const tzs = TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES];
    return `<form id="fShop" class="form-grid card">
      <h2 class="span-2">Shop details</h2><p class="hint span-2">Printed at the top of every bill.</p>
      <label class="field span-2"><span>Shop name</span><input name="shop_name" required maxlength="80" value="${esc(s.shop_name)}"></label>
      <label class="field span-2"><span>Tagline <em>optional</em></span><input name="tagline" maxlength="120" value="${esc(s.tagline)}" placeholder="e.g. Fresh groceries daily"></label>
      <label class="field span-2"><span>Address</span><textarea name="address" rows="2" maxlength="300">${esc(s.address)}</textarea></label>
      <label class="field"><span>Phone</span><input name="phone" maxlength="60" value="${esc(s.phone)}"></label>
      <label class="field"><span>Email <em>optional</em></span><input name="email" type="email" maxlength="120" value="${esc(s.email)}"></label>
      <label class="field span-2"><span>Tax / registration line <em>optional</em></span><input name="tax_id" maxlength="80" value="${esc(s.tax_id)}" placeholder="e.g. GSTIN: 22AAAAA0000A1Z5"></label>
      <div class="field span-2"><span>Logo <em>optional, prints on bills</em></span><div class="logo-row"><div class="logo-box" id="logoBox"></div><label class="btn file-btn">${Icon('upload')} Choose image<input type="file" accept="image/png,image/jpeg,image/webp" hidden id="logoFile"></label><button type="button" class="btn btn-ghost" id="logoRemove">Remove</button></div></div>
      <label class="field"><span>Currency symbol</span><input name="currency" maxlength="5" required value="${esc(s.currency)}"></label>
      <label class="field"><span>Time zone</span><select name="timezone">${tzs.map(t => `<option ${t === s.timezone ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <div class="form-actions span-2"><button class="btn btn-primary">Save shop details</button></div></form>`;
  }
  function paintLogo() { const b = $('#logoBox', root); if (b) b.innerHTML = draftLogo ? `<img src="${esc(draftLogo)}" alt="Shop logo">` : '<span>No logo</span>'; }

  function billingSection(s) {
    return `<form id="fBill" class="form-grid card">
      <h2 class="span-2">Billing & tax</h2>
      <label class="check span-2"><input type="checkbox" name="tax_enabled" ${s.tax_enabled ? 'checked' : ''}><span>Add tax to every bill</span></label>
      <div class="span-2 form-grid sub-box" data-tax ${s.tax_enabled ? '' : 'hidden'}>
        <label class="field"><span>Tax name on bill</span><input name="tax_label" maxlength="30" value="${esc(s.tax_label)}" placeholder="e.g. GST"></label>
        <label class="field"><span>Tax type</span><select name="tax_mode"><option value="percent" ${s.tax_mode === 'percent' ? 'selected' : ''}>Percent of bill</option><option value="fixed" ${s.tax_mode === 'fixed' ? 'selected' : ''}>Fixed amount per bill</option></select></label>
        <label class="field"><span>Tax value</span><input name="tax_value" type="number" min="0" step="0.01" value="${Number(s.tax_value)}"></label>
        <p class="hint span-2">Tax is worked out after the discount.</p>
      </div>
      <label class="check span-2"><input type="checkbox" name="round_off" ${s.round_off ? 'checked' : ''}><span>Round the total to the nearest ${esc(s.currency || '₹')}1</span></label>
      <label class="check span-2"><input type="checkbox" name="allow_negative_stock" ${s.allow_negative_stock ? 'checked' : ''}><span>Allow billing items that show 0 stock</span></label>
      <label class="field"><span>Bill number starts with</span><input name="bill_prefix" maxlength="12" value="${esc(s.bill_prefix)}" placeholder="INV-"></label>
      <div class="field"><span>Example</span><p class="static mono">${esc(s.bill_prefix)}00001</p></div>
      <div class="form-actions span-2"><button class="btn btn-primary">Save billing settings</button></div></form>`;
  }

  const FLAGS = [['showLogo', 'Logo'], ['showTagline', 'Tagline'], ['showAddress', 'Address'], ['showPhone', 'Phone'], ['showTaxId', 'Tax / registration line'], ['showCustomer', 'Customer details'], ['showCashier', 'Who made the bill'], ['showPayment', 'Payment method'], ['showCash', 'Cash received & change'], ['showItemCount', 'Item & quantity count'], ['showSavings', '“You saved” line'], ['showCode', 'Item codes']];
  function designSection(s) {
    draftBill = { ...Receipt.design(s) }; draftBill.labels = { ...(draftBill.labels || {}) };
    const b = draftBill, L = Receipt.LABELS;
    return `<div class="design-wrap"><form id="fDesign" class="form-grid card">
      <h2 class="span-2">Bill design</h2>
      <label class="field"><span>Paper</span><select name="paper"><option value="80" ${b.paper === '80' ? 'selected' : ''}>80 mm thermal roll</option><option value="58" ${b.paper === '58' ? 'selected' : ''}>58 mm thermal roll</option><option value="a4" ${b.paper === 'a4' ? 'selected' : ''}>A4 sheet</option></select></label>
      <label class="field"><span>Text size</span><input name="fontSize" type="number" min="9" max="18" value="${Number(b.fontSize)}"></label>
      <label class="field"><span>Heading alignment</span><select name="align">${['left', 'center', 'right'].map(a => `<option value="${a}" ${b.align === a ? 'selected' : ''}>${a[0].toUpperCase() + a.slice(1)}</option>`).join('')}</select></label>
      <label class="field"><span>Bill title <em>optional</em></span><input name="titleText" maxlength="40" value="${esc(b.titleText)}" placeholder="e.g. Cash memo, Tax invoice"></label>
      <label class="field span-2"><span>Extra line under the address <em>optional</em></span><textarea name="headerText" rows="2" maxlength="300">${esc(b.headerText)}</textarea></label>
      <label class="field span-2"><span>Message at the bottom</span><textarea name="footerText" rows="2" maxlength="300">${esc(b.footerText)}</textarea></label>
      <fieldset class="span-2 checks"><legend>Print on the bill</legend>${FLAGS.map(([k, l]) => `<label class="check"><input type="checkbox" name="${k}" ${b[k] ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
      <details class="span-2 label-editor"><summary>Words printed on the bill</summary><p class="hint">Change any word, for example “Subtotal” to “Sub total” or “TOTAL” to “Net amount”. Leave a box empty to use the default.</p>
        <div class="form-grid">${Object.keys(L).map(k => `<label class="field"><span>${esc(Receipt.LABEL_NAMES[k])}</span><input data-label="${k}" maxlength="30" placeholder="${esc(L[k])}" value="${esc(b.labels[k] || '')}"></label>`).join('')}</div></details>
      <div class="form-actions span-2"><button type="button" class="btn" id="testPrint">${Icon('printer')} Test print</button><button class="btn btn-primary">Save bill design</button></div></form>
      <aside class="design-preview"><h3>Preview <small>sample bill</small></h3><div class="bill-paper" id="designPreview"></div></aside></div>`;
  }
  function sampleBill() {
    const s = Store.settings, t = s.tax_enabled;
    const items = [{ name: 'Tata Salt 1 kg', code: '8904043901015', qty: 2, unit: 'pcs', price: 28, line_total: 56 }, { name: 'Sugar (loose)', code: 'SG01', qty: 1.5, unit: 'kg', price: 44, line_total: 66 }, { name: 'Parle-G 250 g', code: '8901719110016', qty: 3, unit: 'pcs', price: 25, line_total: 75 }];
    const sub = 197, disc = 9.85, taxable = sub - disc, tax = t ? (s.tax_mode === 'percent' ? Math.round(taxable * s.tax_value) / 100 : Number(s.tax_value)) : 0, gross = taxable + tax, total = s.round_off ? Math.round(gross) : gross;
    return { bill_no: (s.bill_prefix || 'INV-') + '00042', created_at: new Date().toISOString(), cashier_name: Store.me.name, customer_name: 'Amit Kumar', customer_phone: '98765 43210', items, items_subtotal: sub, discount_mode: 'percent', discount_value: 5, discount_amount: disc, tax_enabled: t, tax_mode: s.tax_mode, tax_value: s.tax_value, tax_label: s.tax_label, tax_amount: tax, round_off: +(total - gross).toFixed(2), less_amount: 0, total, cash_received: Math.ceil(total / 100) * 100, change_amount: Math.ceil(total / 100) * 100 - total, payment_method: 'Cash', status: 'Paid', notes: '' };
  }
  function readDesign() {
    const f = $('#fDesign', root); if (!f) return;
    for (const k of ['paper', 'align', 'titleText', 'headerText', 'footerText']) draftBill[k] = f[k].value;
    draftBill.fontSize = Number(f.fontSize.value) || 12;
    for (const [k] of FLAGS) draftBill[k] = f[k].checked;
    draftBill.labels = {}; for (const i of $$('[data-label]', f)) if (i.value.trim()) draftBill.labels[i.dataset.label] = i.value.trim();
  }
  function paintPreview() { const p = $('#designPreview', root); if (p) p.innerHTML = Receipt.html(sampleBill(), Store.settings, draftBill); }

  function staffSection() {
    const canOwner = ['owner', 'superadmin'].includes(Store.role);
    return `<div class="card"><h2>Staff & logins</h2>
      <p class="hint">Each person signs in with their own email and password. What each role can do is set by the software admin.</p>
      <form id="fStaff" class="staff-form">
        <label class="field"><span>Name on bills</span><input name="name" maxlength="60" placeholder="e.g. Ravi" autocomplete="off"></label>
        <label class="field"><span>Email</span><input name="email" type="email" required placeholder="ravi@example.com" autocomplete="off"></label>
        <label class="field"><span>Password <em>8+ characters</em></span><input name="password" type="text" minlength="8" placeholder="New login only" autocomplete="new-password"></label>
        <label class="field"><span>Role</span><select name="role"><option value="cashier">Cashier</option><option value="manager">Manager</option>${canOwner ? '<option value="owner">Owner</option>' : ''}</select></label>
        <button class="btn btn-primary">${Icon('plus')} Add staff</button>
      </form>
      <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th></th></tr></thead><tbody id="staffBody"><tr><td colspan="5">Loading…</td></tr></tbody></table></div></div>`;
  }
  async function loadStaff() {
    try { const list = await Cloud.rpc('shop_staff_list'); if (root?.isConnected && section === 'staff') paintStaff(list); }
    catch (e) { if (root?.isConnected) { const b = $('#staffBody', root); if (b) b.innerHTML = `<tr><td colspan="5">${esc(e.message)}</td></tr>`; } }
  }
  function paintStaff(list) {
    const b = $('#staffBody', root); if (!b) return;
    const canOwner = ['owner', 'superadmin'].includes(Store.role);
    b.innerHTML = list.length ? list.map(s => {
      const locked = s.me || (s.role === 'owner' && !canOwner);
      return `<tr data-uid="${esc(s.user_id)}" data-email="${esc(s.email)}" data-name="${esc(s.name)}"><td><b>${esc(s.name || '—')}</b>${s.me ? ' <small>(you)</small>' : ''}</td><td>${esc(s.email)}</td>
      <td>${locked ? `<span class="badge">${ROLE_LABEL[s.role]}</span>` : `<select data-role aria-label="Role for ${esc(s.email)}">${['cashier', 'manager', ...(canOwner ? ['owner'] : [])].map(v => `<option value="${v}" ${v === s.role ? 'selected' : ''}>${ROLE_LABEL[v]}</option>`).join('')}</select>`}</td>
      <td>${s.last_sign_in ? esc(Fmt.dateTime(s.last_sign_in)) : '<span class="muted">Never</span>'}</td>
      <td class="row-act">${locked ? '' : `<button type="button" class="btn btn-sm" data-pw>${Icon('lock')} Password</button><button type="button" class="btn btn-sm btn-ghost" data-remove>Remove</button>`}</td></tr>`;
    }).join('') : '<tr><td colspan="5"><div class="empty slim"><p>No staff yet. Add the first one above.</p></div></td></tr>';
  }

  function contactSection(s) {
    return `<form id="fContact" class="form-grid card"><h2 class="span-2">Contact info</h2>
      <p class="hint span-2">Staff see this in Help & contact — for example the owner’s number to call when something goes wrong at the counter.</p>
      <label class="field"><span>Contact person</span><input name="contact_name" maxlength="80" value="${esc(s.contact_name)}"></label>
      <label class="field"><span>Phone</span><input name="contact_phone" maxlength="40" inputmode="tel" value="${esc(s.contact_phone)}"></label>
      <label class="field span-2"><span>Other details</span><textarea name="contact_details" rows="3" maxlength="1000" placeholder="e.g. Printer paper is in the bottom drawer.">${esc(s.contact_details)}</textarea></label>
      <div class="form-actions span-2"><button class="btn btn-primary">Save contact info</button></div></form>`;
  }

  function dataSection() {
    return `<div class="card"><h2>Data</h2>
      <div class="data-row"><div><h3>Back up</h3><p class="hint">Download every bill as CSV from Records → Export, and the item list from Items → Export.</p></div><div class="toolbar"><a class="btn" href="#/records">Open records</a><a class="btn" href="#/items">Open items</a></div></div>
      <div class="data-row danger-zone"><div><h3>Delete all bills</h3><p class="hint">Removes every bill and its sales history for good. Items and stock levels stay as they are. Use this only to clear test bills before the shop starts.</p></div><button type="button" class="btn btn-danger" id="resetBills">Delete all bills…</button></div></div>`;
  }

  function allowed() { return SECTIONS.filter(([, , p]) => Store.can(p)); }

  async function show(sec) {
    section = sec;
    $$('#setNav button', root).forEach(b => b.classList.toggle('on', b.dataset.s === sec));
    const s = Store.settings, body = $('#setBody', root);
    body.innerHTML = sec === 'shop' ? shopSection(s) : sec === 'billing' ? billingSection(s) : sec === 'design' ? designSection(s) : sec === 'staff' ? staffSection() : sec === 'contact' ? contactSection(s) : dataSection();
    if (sec === 'shop') {
      paintLogo();
      $('#logoFile', root).onchange = async e => { try { draftLogo = await imageToDataURL(e.target.files[0]); paintLogo(); toast('Logo ready. Press Save to keep it.'); } catch (ex) { toast(ex.message, 'error'); } e.target.value = ''; };
      $('#logoRemove', root).onclick = () => { draftLogo = ''; paintLogo(); };
      $('#fShop', root).onsubmit = e => { e.preventDefault(); const f = e.target; saveSettings({ shop_name: f.shop_name.value, tagline: f.tagline.value, address: f.address.value, phone: f.phone.value, email: f.email.value, tax_id: f.tax_id.value, currency: f.currency.value, timezone: f.timezone.value, logo: draftLogo }, e.submitter, 'Shop details saved.'); };
    }
    if (sec === 'billing') {
      const f = $('#fBill', root);
      f.tax_enabled.onchange = () => { $('[data-tax]', f).hidden = !f.tax_enabled.checked; };
      f.bill_prefix.oninput = () => { $('.static', f).textContent = f.bill_prefix.value + '00001'; };
      f.onsubmit = e => { e.preventDefault(); saveSettings({ tax_enabled: f.tax_enabled.checked, tax_label: f.tax_label.value, tax_mode: f.tax_mode.value, tax_value: f.tax_value.value || '0', round_off: f.round_off.checked, allow_negative_stock: f.allow_negative_stock.checked, bill_prefix: f.bill_prefix.value }, e.submitter, 'Billing settings saved.'); };
    }
    if (sec === 'design') {
      const f = $('#fDesign', root); paintPreview();
      f.addEventListener('input', () => { readDesign(); paintPreview(); });
      $('#testPrint', root).onclick = () => { const keep = Store.me.settings.bill; readDesign(); Store.me.settings.bill = draftBill; Receipt.print(sampleBill()); Store.me.settings.bill = keep; };
      f.onsubmit = e => { e.preventDefault(); readDesign(); saveSettings({ bill: draftBill }, e.submitter, 'Bill design saved.'); };
    }
    if (sec === 'staff') {
      loadStaff();
      $('#fStaff', root).onsubmit = async e => {
        e.preventDefault(); const f = e.target; busy(e.submitter, true, 'Saving…');
        try { paintStaff(await Cloud.rpc('shop_staff_set', { p_email: f.email.value.trim(), p_role: f.role.value, p_name: f.name.value.trim(), p_password: f.password.value || null })); toast(`${f.email.value} can now sign in as ${ROLE_LABEL[f.role.value]}.`, 'ok'); f.reset(); }
        catch (ex) { toast(ex.message, 'error', 8000); } finally { busy(e.submitter, false); }
      };
      $('#staffBody', root).addEventListener('change', async e => { const sel = e.target.closest('[data-role]'); if (!sel) return; const tr = sel.closest('tr'); try { paintStaff(await Cloud.rpc('shop_staff_set', { p_email: tr.dataset.email, p_role: sel.value, p_name: tr.dataset.name })); toast('Role changed. They see it after signing in again.', 'ok'); } catch (ex) { toast(ex.message, 'error'); loadStaff(); } });
      $('#staffBody', root).addEventListener('click', async e => {
        const tr = e.target.closest('tr'); if (!tr) return;
        if (e.target.closest('[data-pw]')) {
          const pw = await ask({ title: `New password for ${tr.dataset.name || tr.dataset.email}`, body: 'Tell them the new password. They can sign in with it straight away.', confirm: 'Set password', input: { label: 'New password (8+ characters)', required: true, maxlength: 72 } });
          if (pw === null) return;
          try { await Cloud.rpc('shop_staff_set_password', { p_user_id: tr.dataset.uid, p_password: pw }); toast('Password changed.', 'ok'); } catch (ex) { toast(ex.message, 'error'); }
        }
        if (e.target.closest('[data-remove]')) {
          if (!(await ask({ title: `Remove ${tr.dataset.email}?`, body: 'They will no longer be able to use this shop’s billing. Their old bills stay.', confirm: 'Remove access', danger: true }))) return;
          try { paintStaff(await Cloud.rpc('shop_staff_remove', { p_user_id: tr.dataset.uid })); toast('Access removed.', 'ok'); } catch (ex) { toast(ex.message, 'error'); }
        }
      });
    }
    if (sec === 'contact') $('#fContact', root).onsubmit = e => { e.preventDefault(); const f = e.target; saveSettings({ contact_name: f.contact_name.value, contact_phone: f.contact_phone.value, contact_details: f.contact_details.value }, e.submitter, 'Contact info saved.'); };
    if (sec === 'data') $('#resetBills', root).onclick = async () => {
      const v = await ask({ title: 'Delete all bills?', body: 'This cannot be undone. Export your records first if you might need them.', confirm: 'Delete all bills', danger: true, input: { label: 'Type DELETE ALL BILLS to confirm', required: true } });
      if (v === null) return;
      const restart = await ask({ title: 'Restart bill numbers?', body: `Start again from ${esc(Store.settings.bill_prefix)}00001?`, confirm: 'Yes, restart', cancel: 'No, keep counting' });
      try { const r = await Cloud.rpc('shop_reset_bills', { p_confirm: v.trim(), p_restart_numbers: !!restart }); toast(`${r.deleted} bills deleted.`, 'ok'); } catch (e) { toast(e.message, 'error'); }
    };
  }

  function mount(view) {
    root = view;
    const secs = allowed();
    if (!secs.some(([k]) => k === section)) section = secs[0]?.[0];
    view.innerHTML = `<div class="page"><header class="page-head"><div><h1>Settings</h1><p class="sub">Your shop’s details, bills and staff.</p></div></header>
      <div class="settings"><nav class="set-nav" id="setNav">${secs.map(([k, l]) => `<button type="button" data-s="${k}">${l}</button>`).join('')}</nav><div id="setBody"></div></div></div>`;
    $('#setNav', view).onclick = e => { const b = e.target.closest('[data-s]'); if (b) show(b.dataset.s); };
    if (section) show(section);
  }
  return { mount, unmount() { root = null; } };
})();
