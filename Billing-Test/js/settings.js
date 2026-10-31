/* Shop settings. Each section follows its permission, so managers can get the Billing tab without shop details. */
'use strict';
const Settings = (() => {
  let root = null, section = null, draftBill = null, draftLogo = null, draftInv = null;
  const SECTIONS = [
    ['shop', 'Shop details', 'settings_shop', 'store'], ['billing', 'Billing', 'settings_tax', 'bill'], ['design', 'Bill design', 'settings_design', 'printer'],
    ['extras', 'Bill extras', 'settings_design', 'qr'], ['staff', 'Staff & logins', 'staff', 'users'], ['perms', 'Permissions', ['roles_manager', 'roles_cashier'], 'lock'],
    ['contact', 'Contact info', 'settings_contact', 'phone'], ['data', 'Data', 'reset', 'download']];
  const TIMEZONES = ['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Karachi', 'Asia/Colombo', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];
  const FEATURES = [
    ['extra_items', 'Extra items', 'Bill something that is not in the item list.'],
    ['cash_received', 'Cash received box', 'Type the cash given to see the change. Needed for short-cash bills.'],
    ['customer_details', 'Customer name & phone', 'Ask for the customer’s name and phone.'],
    ['customer_address', 'Customer address', 'Add the customer’s address to the bill.'],
    ['notes', 'Note on bill', 'A short note that prints on the bill.'],
    ['whatsapp', 'Send bill on WhatsApp', 'WhatsApp button after saving a bill.'],
    ['qty_badges', 'Quantity on item tiles', 'Show ×2, ×3… on an item already on the bill.'],
    ['stock_badges', 'Stock on item tiles', 'Show “12 left” and “Out of stock” while billing.'],
    ['item_codes_on_tiles', 'Item codes on tiles', 'Show the barcode / code under each item name.']];
  const ITEM_FIELDS = [['hsn', 'HSN / SAC code', 'Tax classification code, printed in its own column.'], ['alias', 'Name on bill', 'A different name to print on the bill (e.g. Hindi name).'],
    ['description', 'Description', 'A longer note about the item.'], ['default_discount', 'Default discount', 'A discount % applied automatically when the item is billed.'],
    ['item_type', 'Product or service', 'Services never track stock.'], ['advanced', 'Storage, batch & expiry', 'Storage location, container, batch number, MFG and expiry dates.']];
  const sw = (name, on, title, desc = '', extra = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${extra}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;
  const swMini = (name, on, label) => `<label class="switch mini" title="${esc(label)}"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} aria-label="${esc(label)}"><span class="sw" aria-hidden="true"></span><span class="sw-cap">On bill</span></label>`;

  async function saveSettings(patch, btn, msg = 'Settings saved.') {
    busy(btn, true, 'Saving…');
    try { Store.me.settings = await Cloud.rpc('shop_settings_save', { p: patch }); App.applyShop(); toast(msg, 'ok'); return true; }
    catch (e) { toast(e.message, 'error', 6000); return false; } finally { busy(btn, false); }
  }

  /* ---------- shop details ---------- */
  function shopSection(s) {
    draftLogo = s.logo || '';
    const tzs = TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES];
    const sf = k => Receipt.showField(s, k);
    const row = (key, label, input, wide = false) => `<div class="field-row ${wide ? 'span-2' : ''}"><label class="field"><span>${label}</span>${input}</label>${swMini('show_' + key, sf(key), label + ' on bill')}</div>`;
    return `<form id="fShop" class="card form-grid">
      <header class="span-2 card-head"><h2>Shop details</h2><p class="hint">Printed at the top of every bill. Use the switches to choose what appears on the bill.</p></header>
      <div class="span-2 logo-row-wrap"><div class="field"><span>Logo</span><div class="logo-row"><div class="logo-box" id="logoBox"></div><label class="btn file-btn">${Icon('upload')} Choose image<input type="file" accept="image/png,image/jpeg,image/webp" hidden id="logoFile"></label><button type="button" class="btn btn-ghost" id="logoRemove">Remove</button></div></div>${swMini('show_logo', sf('logo'), 'Logo on bill')}</div>
      ${row('name', 'Shop name', `<input name="shop_name" required maxlength="80" value="${esc(s.shop_name)}">`, true)}
      ${row('tagline', 'Tagline <em>optional</em>', `<input name="tagline" maxlength="120" value="${esc(s.tagline)}" placeholder="e.g. Fresh groceries daily">`, true)}
      ${row('address', 'Address', `<textarea name="address" rows="2" maxlength="300">${esc(s.address)}</textarea>`, true)}
      ${row('phone', 'Phone', `<input name="phone" maxlength="60" value="${esc(s.phone)}" placeholder="Separate numbers with commas">`)}
      ${row('email', 'Email', `<input name="email" type="email" maxlength="120" value="${esc(s.email)}">`)}
      ${row('website', 'Website', `<input name="website" maxlength="120" value="${esc(s.website)}" placeholder="www.yourshop.in">`)}
      ${row('tax_id', 'GSTIN / tax line', `<input name="tax_id" maxlength="80" value="${esc(s.tax_id)}" placeholder="GSTIN: 22AAAAA0000A1Z5">`)}
      ${row('pan', 'PAN', `<input name="pan" maxlength="20" value="${esc(s.pan)}" placeholder="ABCDE1234F" style="text-transform:uppercase">`)}
      ${row('fssai', 'FSSAI licence no.', `<input name="fssai" maxlength="30" value="${esc(s.fssai)}" placeholder="14-digit number" inputmode="numeric">`)}
      <label class="field"><span>Currency symbol</span><input name="currency" maxlength="5" required value="${esc(s.currency)}"></label>
      <label class="field"><span>Time zone</span><select name="timezone">${tzs.map(t => `<option ${t === s.timezone ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <div class="form-actions span-2 sticky-save"><button class="btn btn-primary btn-lg">Save shop details</button></div></form>`;
  }
  function paintLogo() { const b = $('#logoBox', root); if (b) b.innerHTML = draftLogo ? `<img src="${esc(draftLogo)}" alt="Shop logo">` : '<span>No logo</span>'; }

  /* ---------- billing ---------- */
  function billingSection(s) {
    const sys = Store.sys, p = sys.payments || {}, f = sys.features || {};
    return `<form id="fBill" class="admin-stack">
      <section class="card form-grid"><header class="span-2 card-head"><h2>Tax</h2></header>
        <div class="span-2">${sw('tax_enabled', s.tax_enabled, 'Add tax to bills')}</div>
        <div class="span-2 form-grid sub-box" data-tax ${s.tax_enabled ? '' : 'hidden'}>
          <div class="field span-2"><span>How tax works</span><div class="seg seg-wide" role="radiogroup">
            <label><input type="radio" name="tax_scope" value="bill" ${s.tax_scope !== 'item' ? 'checked' : ''}><span>One rate for the whole bill</span></label>
            <label><input type="radio" name="tax_scope" value="item" ${s.tax_scope === 'item' ? 'checked' : ''}><span>Each item has its own rate (GST)</span></label></div></div>
          <label class="field"><span>Tax name on bill</span><input name="tax_label" maxlength="30" value="${esc(s.tax_label)}" placeholder="GST"></label>
          <label class="field" data-billtax><span>Tax type</span><select name="tax_mode"><option value="percent" ${s.tax_mode === 'percent' ? 'selected' : ''}>Percent of bill</option><option value="fixed" ${s.tax_mode === 'fixed' ? 'selected' : ''}>Fixed amount per bill</option></select></label>
          <label class="field"><span data-ratelabel>${s.tax_scope === 'item' ? 'Default tax % (items without their own rate)' : 'Tax value'}</span><input name="tax_value" type="number" min="0" step="0.01" value="${Number(s.tax_value)}"></label>
          <div class="span-2 switches">${sw('tax_split', s.tax_split, 'Show as CGST + SGST', 'Splits the tax into two equal halves on the bill, e.g. GST 5% → CGST 2.5% + SGST 2.5%.')}
          <div data-itemtax>${sw('tax_inclusive_default', s.tax_inclusive_default, 'Extra items already include tax', 'For items typed in at the counter.')}</div></div>
          <p class="hint span-2">Tax is worked out after discounts. With per-item tax, set each item’s rate in Items, and whether its price already includes tax.</p>
        </div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Totals & bill numbers</h2></header>
        <div class="span-2">${sw('round_off', s.round_off, `Round the total to the nearest ${esc(s.currency || '₹')}1`)}</div>
        <label class="field"><span>Bill number starts with</span><input name="bill_prefix" maxlength="12" value="${esc(s.bill_prefix)}" placeholder="INV-"></label>
        <div class="field"><span>Example</span><p class="static mono" id="prefixEx">${esc(s.bill_prefix)}00001</p></div></section>
      <section class="card"><header class="card-head"><h2>Stock</h2></header>
        <div class="field"><span>When an item’s stock runs out on a bill</span><div class="seg seg-wide" role="radiogroup">
          <label><input type="radio" name="stock_mode" value="stop" ${!s.allow_negative_stock ? 'checked' : ''}><span><b>Stop adding it</b><small>Can’t sell more than you have.</small></span></label>
          <label><input type="radio" name="stock_mode" value="warn" ${s.allow_negative_stock ? 'checked' : ''}><span><b>Only warn me</b><small>Shows a message, lets you sell anyway.</small></span></label></div></div>
        ${sw('stock_shown', !s.stock_hidden, 'Show stock', 'Turn off to hide the Stocks screen and stock numbers for everyone except Admin. Sales still count stock in the background.')}</section>
      ${Store.moduleOn('expenses') ? `<section class="card"><header class="card-head"><h2>Profit on the dashboard</h2></header>
        <div class="field"><span>Take expenses off the profit?</span><div class="seg seg-wide" role="radiogroup">
          <label><input type="radio" name="exp_profit" value="yes" ${s.expenses_in_profit !== false ? 'checked' : ''}><span><b>Yes</b><small>Net profit = sales − expenses</small></span></label>
          <label><input type="radio" name="exp_profit" value="no" ${s.expenses_in_profit === false ? 'checked' : ''}><span><b>No</b><small>Net profit = selling price − buying price</small></span></label></div></div></section>` : ''}
      <section class="card"><header class="card-head"><h2>Payment methods</h2><p class="hint">Only these appear on the billing screen.</p></header>
        <div class="pay-toggles">${['Cash', 'UPI', 'Card'].map(m => sw('pay_' + m, p[m] !== false, m)).join('')}</div></section>
      <section class="card"><header class="card-head"><h2>Billing screen</h2></header>
        <div class="switches two">${FEATURES.map(([k, t, dsc]) => sw('f_' + k, Store.feature(k), t, dsc)).join('')}</div></section>
      <section class="card"><header class="card-head"><h2>Item form fields</h2><p class="hint">Extra fields on the Add item screen. Turn on only what your shop needs.</p></header>
        <div class="switches two">${ITEM_FIELDS.map(([k, t, dsc]) => sw('if_' + k, Store.itemField(k), t, dsc)).join('')}</div></section>
      <div class="form-actions sticky-save"><button class="btn btn-primary btn-lg">Save billing settings</button></div></form>`;
  }

  /* ---------- bill design ---------- */
  const FLAGS = [['showCustomer', 'Customer details'], ['showCashier', 'Who made the bill'], ['showPayment', 'Payment method'], ['showCash', 'Cash received & change'], ['showItemCount', 'Item & quantity count'],
                 ['showSavings', '“You saved” line'], ['showHsn', 'HSN column'], ['showItemDiscount', 'Item discount column'], ['showCode', 'Item codes']];
  const BILL_COLORS = ['#1f2937', '#1f5fbf', '#0f7a5a', '#b42318', '#6d3fc0', '#c2410c'];
  function designSection(s) {
    draftBill = { ...Receipt.design(s) }; draftBill.labels = { ...(draftBill.labels || {}) };
    const b = draftBill, L = Receipt.LABELS;
    return `<div class="design-wrap"><form id="fDesign" class="admin-stack">
      <section class="card"><header class="card-head"><h2>Template</h2></header>
        <div class="tpl-gallery">${Receipt.TEMPLATES.map(([k, l, dsc]) => `<label class="tpl-card"><input type="radio" name="template" value="${k}" ${b.template === k ? 'checked' : ''}><span class="tpl-thumb tpl-${k}"><i></i><i></i><i></i><i></i></span><b>${l}</b><small>${dsc}</small></label>`).join('')}</div>
        <div class="field" style="margin-top:14px"><span>Bill colour <em>A4/A5 and colour printers</em></span><div class="color-row">${BILL_COLORS.map(c => `<label class="swatch sm"><input type="radio" name="color" value="${c}" ${b.color === c ? 'checked' : ''}><span style="--c:${c}"></span></label>`).join('')}<label class="color-custom"><input type="color" name="colorCustom" value="${esc(b.color)}" aria-label="Custom colour"><span class="mono">${esc(b.color)}</span></label></div></div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Paper & text</h2></header>
        <label class="field"><span>Paper</span><select name="paper"><option value="80" ${b.paper === '80' ? 'selected' : ''}>80 mm thermal roll</option><option value="58" ${b.paper === '58' ? 'selected' : ''}>58 mm thermal roll</option><option value="a5" ${b.paper === 'a5' ? 'selected' : ''}>A5 sheet</option><option value="a4" ${b.paper === 'a4' ? 'selected' : ''}>A4 sheet</option></select></label>
        <label class="field"><span>Text size</span><input name="fontSize" type="number" min="9" max="18" value="${Number(b.fontSize)}"></label>
        <label class="field"><span>Heading alignment</span><select name="align">${['left', 'center', 'right'].map(a => `<option value="${a}" ${b.align === a ? 'selected' : ''}>${a[0].toUpperCase() + a.slice(1)}</option>`).join('')}</select></label>
        <label class="field"><span>Bill title <em>optional</em></span><input name="titleText" maxlength="40" value="${esc(b.titleText)}" placeholder="Cash memo, Tax invoice"></label>
        <label class="field span-2"><span>Extra line under the shop details <em>optional</em></span><textarea name="headerText" rows="2" maxlength="300">${esc(b.headerText)}</textarea></label>
        <label class="field span-2"><span>Message at the bottom</span><textarea name="footerText" rows="2" maxlength="300">${esc(b.footerText)}</textarea></label></section>
      <section class="card"><header class="card-head"><h2>Print on the bill</h2><p class="hint">Shop name, address, GSTIN, PAN and FSSAI are switched on or off in Shop details.</p></header>
        <div class="switches two">${FLAGS.map(([k, l]) => sw(k, b[k], l)).join('')}</div>
        <details class="label-editor"><summary>Words printed on the bill</summary><p class="hint">Change any word, e.g. “TOTAL” to “Grand Total”. Leave empty for the default.</p>
          <div class="form-grid">${Object.keys(L).map(k => `<label class="field"><span>${esc(Receipt.LABEL_NAMES[k])}</span><input data-label="${k}" maxlength="30" placeholder="${esc(L[k])}" value="${esc(b.labels[k] || '')}"></label>`).join('')}</div></details></section>
      <div class="form-actions sticky-save"><button type="button" class="btn" id="testPrint">${Icon('printer')} Test print</button><button class="btn btn-primary btn-lg">Save bill design</button></div></form>
      <aside class="design-preview"><h3>Preview <small>sample bill</small></h3><div class="bill-paper" id="designPreview"></div></aside></div>`;
  }
  function sampleBill() {
    const s = Store.settings, item = s.tax_enabled && s.tax_scope === 'item';
    const lines = [{ name: 'Tata Salt 1 kg', hsn: '2501', code: '8904043901015', qty: 2, unit: 'pcs', price: 28, discount_pct: 0, tax_rate: 5, incl: false },
                   { name: 'Sugar (loose)', alias: 'चीनी', hsn: '1701', code: 'SG01', qty: 1.5, unit: 'kg', price: 44, discount_pct: 0, tax_rate: 5, incl: false },
                   { name: 'Classmate Notebook', hsn: '4820', code: '8902519000127', qty: 3, unit: 'pcs', price: 60, discount_pct: 10, tax_rate: 12, incl: true }];
    const t = Calc.bill(lines, s, { discount: { mode: 'percent', value: 5 }, canDiscount: true });
    return { bill_no: (s.bill_prefix || 'INV-') + '00042', created_at: new Date().toISOString(), cashier_name: Store.me.name, customer_name: 'Amit Kumar', customer_phone: '98765 43210', customer_address: Store.feature('customer_address') ? '12, MG Road, Patna' : '',
      items: lines.map((l, i) => ({ ...l, line_total: t.lines[i].total, discount: t.lines[i].disc })), items_subtotal: t.sub, discount_mode: 'percent', discount_value: 5, discount_amount: t.disc,
      tax_enabled: s.tax_enabled, tax_mode: s.tax_mode, tax_value: s.tax_value, tax_label: s.tax_label, tax_amount: t.tax, tax_scope: item ? 'item' : 'bill', tax_split: s.tax_split, tax_breakdown: t.breakdown,
      round_off: t.round, less_amount: 0, total: t.total, cash_received: Math.ceil(t.total / 100) * 100, change_amount: Math.ceil(t.total / 100) * 100 - t.total, payment_method: 'Cash', status: 'Paid', notes: '',
      custom_fields: ((draftInv || s.invoice || {}).custom_fields?.enabled ? ((draftInv || s.invoice).custom_fields.fields || []) : []).slice(0, 6).map(l => ({ label: l, value: 'Sample value' })) };
  }
  function readDesign() {
    const f = $('#fDesign', root); if (!f) return;
    for (const k of ['paper', 'align', 'titleText', 'headerText', 'footerText']) draftBill[k] = f[k].value;
    draftBill.template = f.template.value || 'classic';
    draftBill.color = (f.querySelector('[name=color]:checked') || {}).value || f.colorCustom.value;
    draftBill.fontSize = Number(f.fontSize.value) || 12;
    for (const [k] of FLAGS) draftBill[k] = f[k].checked;
    draftBill.labels = {}; for (const i of $$('[data-label]', f)) if (i.value.trim()) draftBill.labels[i.dataset.label] = i.value.trim();
  }
  function paintPreview() {
    const p = $('#designPreview', root); if (!p) return;
    const s = { ...Store.settings, invoice: draftInv || Store.settings.invoice };
    p.innerHTML = Receipt.html(sampleBill(), s, draftBill || Receipt.design(s));
  }

  /* ---------- bill extras: QR, bank, signature, custom fields ---------- */
  function extrasSection(s) {
    draftInv = JSON.parse(JSON.stringify(s.invoice || {}));
    const q = draftInv.qr ||= { enabled: false, mode: 'image', position: 'bottom', size: 'medium', caption: 'Scan to pay' };
    const bk = draftInv.bank ||= { enabled: false }, sg = draftInv.signature ||= { enabled: false, size: 'medium', label: 'Authorised signatory' };
    const cf = draftInv.custom_fields ||= { enabled: false, fields: [] };
    draftBill = Receipt.design(s);
    return `<div class="design-wrap"><form id="fExtras" class="admin-stack">
      <section class="card form-grid"><header class="span-2 card-head row-head"><div><h2>Payment QR on bill</h2><p class="hint">Customers scan it to pay you by UPI.</p></div>${sw('qr_enabled', q.enabled, '')}</header>
        <div class="span-2 form-grid" data-when="qr_enabled">
          <div class="field span-2"><span>QR code</span><div class="seg seg-wide" role="radiogroup">
            <label><input type="radio" name="qr_mode" value="image" ${q.mode !== 'upi' ? 'checked' : ''}><span><b>My own QR image</b><small>Upload the QR from your bank or UPI app.</small></span></label>
            <label><input type="radio" name="qr_mode" value="upi" ${q.mode === 'upi' ? 'checked' : ''}><span><b>Make it from my UPI ID</b><small>Fills in the bill amount automatically.</small></span></label></div></div>
          <div class="field span-2" data-qr="image"><span>QR image</span><div class="logo-row"><div class="logo-box qr-box" id="qrBox"></div><label class="btn file-btn">${Icon('upload')} Upload QR<input type="file" accept="image/png,image/jpeg,image/webp" hidden id="qrFile"></label><button type="button" class="btn btn-ghost" id="qrRemove">Remove</button></div></div>
          <label class="field" data-qr="upi"><span>UPI ID</span><input name="qr_upi" maxlength="80" value="${esc(q.upi_id || '')}" placeholder="shopname@okaxis"></label>
          <label class="field" data-qr="upi"><span>Name shown in UPI app</span><input name="qr_payee" maxlength="60" value="${esc(q.payee || '')}" placeholder="${esc(s.shop_name)}"></label>
          <label class="field"><span>Position</span><select name="qr_position"><option value="bottom" ${q.position !== 'top' ? 'selected' : ''}>Bottom of bill</option><option value="top" ${q.position === 'top' ? 'selected' : ''}>Top of bill</option></select></label>
          <label class="field"><span>Size</span><select name="qr_size">${['small', 'medium', 'large'].map(z => `<option value="${z}" ${q.size === z ? 'selected' : ''}>${z[0].toUpperCase() + z.slice(1)}</option>`).join('')}</select></label>
          <label class="field"><span>Text under QR</span><input name="qr_caption" maxlength="40" value="${esc(q.caption || 'Scan to pay')}"></label>
          <div class="field">${sw('qr_only_upi', q.only_upi, 'Only on UPI bills')}</div></div></section>
      <section class="card form-grid"><header class="span-2 card-head row-head"><div><h2>Bank details on bill</h2><p class="hint">For customers who pay by bank transfer.</p></div>${sw('bank_enabled', bk.enabled, '')}</header>
        <div class="span-2 form-grid" data-when="bank_enabled">
          <label class="field"><span>Account holder</span><input name="bank_holder" maxlength="80" value="${esc(bk.holder || '')}"></label>
          <label class="field"><span>Bank name</span><input name="bank_bank" maxlength="80" value="${esc(bk.bank || '')}"></label>
          <label class="field"><span>Account number</span><input name="bank_account" maxlength="30" inputmode="numeric" value="${esc(bk.account || '')}"></label>
          <label class="field"><span>IFSC</span><input name="bank_ifsc" maxlength="15" value="${esc(bk.ifsc || '')}" style="text-transform:uppercase"></label>
          <label class="field span-2"><span>Branch <em>optional</em></span><input name="bank_branch" maxlength="80" value="${esc(bk.branch || '')}"></label></div></section>
      <section class="card form-grid"><header class="span-2 card-head row-head"><div><h2>Signature</h2><p class="hint">Printed as “Authorised signatory”. PNG with a white or clear background works best.</p></div>${sw('sig_enabled', sg.enabled, '')}</header>
        <div class="span-2 form-grid" data-when="sig_enabled">
          <div class="field span-2"><span>Signature image</span><div class="logo-row"><div class="logo-box sig-box" id="sigBox"></div><label class="btn file-btn">${Icon('upload')} Upload signature<input type="file" accept="image/png,image/jpeg,image/webp" hidden id="sigFile"></label><button type="button" class="btn btn-ghost" id="sigRemove">Remove</button></div></div>
          <label class="field"><span>Size</span><select name="sig_size">${['small', 'medium', 'large'].map(z => `<option value="${z}" ${sg.size === z ? 'selected' : ''}>${z[0].toUpperCase() + z.slice(1)}</option>`).join('')}</select></label>
          <label class="field"><span>Text under signature</span><input name="sig_label" maxlength="40" value="${esc(sg.label || 'Authorised signatory')}"></label></div></section>
      <section class="card"><header class="card-head row-head"><div><h2>Custom fields</h2><p class="hint">Extra boxes on the billing screen — like vehicle number or order number — printed on the bill when filled.</p></div>${sw('cf_enabled', cf.enabled, '')}</header>
        <div data-when="cf_enabled"><ol class="cf-list" id="cfList"></ol>
          <div class="inline-form"><input id="cfNew" maxlength="40" placeholder="New field name, e.g. Vehicle no." aria-label="New field name"><button type="button" class="btn btn-primary" id="cfAdd">${Icon('plus')} Add</button></div>
          <div class="toolbar"><span class="hint">Quick add:</span>${['Delivery note', 'Mode/Terms of payment', 'Buyer’s order no.', 'Dispatched through', 'Destination', 'Motor vehicle no.', 'Terms of delivery'].map(x => `<button type="button" class="chip" data-quick="${esc(x)}">${esc(x)}</button>`).join('')}</div></div></section>
      <div class="form-actions sticky-save"><button class="btn btn-primary btn-lg">Save bill extras</button></div></form>
      <aside class="design-preview"><h3>Preview <small>sample bill</small></h3><div class="bill-paper" id="designPreview"></div></aside></div>`;
  }
  function paintExtras() {
    const f = $('#fExtras', root); if (!f) return;
    for (const box of $$('[data-when]', f)) box.hidden = !f[box.dataset.when].checked;
    const mode = f.qr_mode.value; for (const el of $$('[data-qr]', f)) el.hidden = el.dataset.qr !== mode;
    $('#qrBox', root).innerHTML = draftInv.qr.image ? `<img src="${esc(draftInv.qr.image)}" alt="QR">` : '<span>No QR</span>';
    $('#sigBox', root).innerHTML = draftInv.signature.image ? `<img src="${esc(draftInv.signature.image)}" alt="Signature">` : '<span>No signature</span>';
    const list = draftInv.custom_fields.fields;
    $('#cfList', root).innerHTML = list.length ? list.map((x, i) => `<li data-i="${i}"><button type="button" class="icon-btn" data-up ${i ? '' : 'disabled'} aria-label="Move up">${Icon('up')}</button><button type="button" class="icon-btn" data-down ${i < list.length - 1 ? '' : 'disabled'} aria-label="Move down">${Icon('down')}</button><input value="${esc(x)}" maxlength="40" data-cfedit aria-label="Field name"><button type="button" class="icon-btn danger" data-del aria-label="Delete">${Icon('trash')}</button></li>`).join('') : '<li class="hint">No fields yet. Add one below.</li>';
  }
  function readExtras() {
    const f = $('#fExtras', root); if (!f) return;
    Object.assign(draftInv.qr, { enabled: f.qr_enabled.checked, mode: f.qr_mode.value, upi_id: f.qr_upi.value.trim(), payee: f.qr_payee.value.trim(), position: f.qr_position.value, size: f.qr_size.value, caption: f.qr_caption.value.trim(), only_upi: f.qr_only_upi.checked });
    Object.assign(draftInv.bank, { enabled: f.bank_enabled.checked, holder: f.bank_holder.value.trim(), bank: f.bank_bank.value.trim(), account: f.bank_account.value.trim(), ifsc: f.bank_ifsc.value.trim().toUpperCase(), branch: f.bank_branch.value.trim() });
    Object.assign(draftInv.signature, { enabled: f.sig_enabled.checked, size: f.sig_size.value, label: f.sig_label.value.trim() });
    draftInv.custom_fields.enabled = f.cf_enabled.checked;
  }

  /* ---------- staff ---------- */
  function staffSection() {
    const canOwner = ['owner', 'superadmin'].includes(Store.role);
    return `<div class="card"><header class="card-head"><h2>Staff & logins</h2><p class="hint">Each person signs in with their own email and password.</p></header>
      <form id="fStaff" class="staff-form">
        <label class="field"><span>Name on bills</span><input name="name" maxlength="60" placeholder="e.g. Ravi" autocomplete="off"></label>
        <label class="field"><span>Email</span><input name="email" type="email" required placeholder="ravi@example.com" autocomplete="off"></label>
        <label class="field"><span>Password <em>8+ characters</em></span><input name="password" type="text" minlength="8" placeholder="New login only" autocomplete="new-password"></label>
        <label class="field"><span>Role</span><select name="role"><option value="cashier">Cashier</option><option value="manager">Manager</option>${canOwner ? '<option value="owner">Owner</option>' : ''}</select></label>
        <button class="btn btn-primary">${Icon('plus')} Add staff</button>
      </form>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th></th></tr></thead><tbody id="staffBody"><tr><td colspan="5">Loading…</td></tr></tbody></table></div></div>`;
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
      return `<tr data-uid="${esc(s.user_id)}" data-email="${esc(s.email)}" data-name="${esc(s.name)}"><td data-label="Name"><b>${esc(s.name || '—')}</b>${s.me ? ' <small>(you)</small>' : ''}</td><td data-label="Email">${esc(s.email)}</td>
      <td data-label="Role">${locked ? `<span class="badge">${ROLE_LABEL[s.role]}</span>` : `<select data-role aria-label="Role for ${esc(s.email)}">${['cashier', 'manager', ...(canOwner ? ['owner'] : [])].map(v => `<option value="${v}" ${v === s.role ? 'selected' : ''}>${ROLE_LABEL[v]}</option>`).join('')}</select>`}</td>
      <td data-label="Last sign-in">${s.last_sign_in ? esc(Fmt.dateTime(s.last_sign_in)) : '<span class="muted">Never</span>'}</td>
      <td class="row-act">${locked ? '' : `<button type="button" class="btn btn-sm" data-pw>${Icon('lock')} Password</button><button type="button" class="btn btn-sm btn-ghost" data-remove>Remove</button>`}</td></tr>`;
    }).join('') : '<tr><td colspan="5"><div class="empty slim"><p>No staff yet. Add the first one above.</p></div></td></tr>';
  }

  /* ---------- permissions for lower roles ---------- */
  function permsSection() {
    const roles = ['manager', 'cashier'].filter(r => Store.can('roles_' + r)), mine = Store.me.perms || [], cur = Store.sys.roles || {};
    return `<form id="fPerms" class="card">
      <header class="card-head"><h2>Permissions</h2><p class="hint">Choose what each role can see and do. You can only give permissions you have yourself. The server checks every action.</p></header>
      <div class="table-wrap perm-wrap"><table class="table perm-table"><thead><tr><th>Permission</th>${roles.map(x => `<th class="c">${ROLE_LABEL[x]}</th>`).join('')}</tr></thead><tbody>
      ${PERMISSIONS.map(([group, all]) => [group, all.filter(([k]) => Store.permShown(k))]).filter(([, perms]) => perms.length).map(([group, perms]) => `<tr class="perm-group"><td colspan="${roles.length + 1}">${group}</td></tr>` + perms.map(([k, label]) => `<tr><td>${label}</td>${roles.map(x => {
        const has = (cur[x] || []).includes(k), can = Store.isAdmin || mine.includes(k) || has;
        return `<td class="c"><input type="checkbox" data-role="${x}" data-perm="${k}" ${has ? 'checked' : ''} ${can ? '' : 'disabled title="You don’t have this permission yourself"'} aria-label="${ROLE_LABEL[x]}: ${label}"></td>`;
      }).join('')}</tr>`).join('')).join('')}
      </tbody></table></div>
      <div class="form-actions"><button class="btn btn-primary">Save permissions</button></div></form>`;
  }

  function contactSection(s) {
    return `<form id="fContact" class="form-grid card"><header class="span-2 card-head"><h2>Contact info</h2><p class="hint">Staff see this in Help & contact.</p></header>
      <label class="field"><span>Contact person</span><input name="contact_name" maxlength="80" value="${esc(s.contact_name)}"></label>
      <label class="field"><span>Phone</span><input name="contact_phone" maxlength="40" inputmode="tel" value="${esc(s.contact_phone)}"></label>
      <label class="field span-2"><span>Other details</span><textarea name="contact_details" rows="3" maxlength="1000" placeholder="e.g. Printer paper is in the bottom drawer.">${esc(s.contact_details)}</textarea></label>
      <div class="form-actions span-2"><button class="btn btn-primary">Save contact info</button></div></form>`;
  }
  function dataSection() {
    return `<div class="card"><h2>Data</h2>
      <div class="data-row"><div><h3>Back up</h3><p class="hint">Download every bill as CSV from Records → Export, and the item list from Items → Export.</p></div><div class="toolbar"><a class="btn" href="#/records">Open records</a><a class="btn" href="#/items">Open items</a></div></div>
      <div class="data-row danger-zone"><div><h3>Delete all bills</h3><p class="hint">Removes every bill and its sales history for good. Items and stock stay. Use only to clear test bills.</p></div><button type="button" class="btn btn-danger" id="resetBills">Delete all bills…</button></div></div>`;
  }

  const allowed = () => SECTIONS.filter(([, , p]) => Array.isArray(p) ? p.some(x => Store.can(x)) : Store.can(p));

  function show(sec) {
    section = sec;
    $$('#setNav button', root).forEach(b => b.classList.toggle('on', b.dataset.s === sec));
    const s = Store.settings, body = $('#setBody', root);
    body.innerHTML = { shop: shopSection, billing: billingSection, design: designSection, extras: extrasSection, staff: staffSection, perms: permsSection, contact: contactSection, data: dataSection }[sec](s);
    body.scrollIntoView?.({ block: 'nearest' });
    if (sec === 'shop') {
      paintLogo();
      $('#logoFile', root).onchange = async e => { try { draftLogo = await imageToDataURL(e.target.files[0]); paintLogo(); toast('Logo ready. Press Save to keep it.'); } catch (ex) { toast(ex.message, 'error'); } e.target.value = ''; };
      $('#logoRemove', root).onclick = () => { draftLogo = ''; paintLogo(); };
      $('#fShop', root).onsubmit = e => {
        e.preventDefault(); const f = e.target;
        const show_fields = Object.fromEntries(Receipt.SHOP_FIELDS.map(([k]) => [k, f['show_' + k].checked]));
        saveSettings({ shop_name: f.shop_name.value, tagline: f.tagline.value, address: f.address.value, phone: f.phone.value, email: f.email.value, website: f.website.value.trim(), tax_id: f.tax_id.value,
          pan: f.pan.value.trim().toUpperCase(), fssai: f.fssai.value.trim(), currency: f.currency.value, timezone: f.timezone.value, logo: draftLogo, show_fields }, e.submitter, 'Shop details saved.');
      };
    }
    if (sec === 'billing') {
      const f = $('#fBill', root);
      const paint = () => { $('[data-tax]', f).hidden = !f.tax_enabled.checked; const item = f.tax_scope.value === 'item'; $('[data-billtax]', f).hidden = item; $('[data-itemtax]', f).hidden = !item; $('[data-ratelabel]', f).textContent = item ? 'Default tax % (items without their own rate)' : 'Tax value'; };
      f.addEventListener('change', paint); paint();
      f.bill_prefix.oninput = () => { $('#prefixEx', f).textContent = f.bill_prefix.value + '00001'; };
      f.onsubmit = async e => {
        e.preventDefault(); const btn = e.submitter;
        const payments = Object.fromEntries(['Cash', 'UPI', 'Card'].map(m => [m, f['pay_' + m].checked]));
        if (!Object.values(payments).some(Boolean)) return toast('Keep at least one payment method turned on.', 'warn');
        const ok = await saveSettings({ tax_enabled: f.tax_enabled.checked, tax_label: f.tax_label.value, tax_mode: f.tax_mode.value, tax_value: f.tax_value.value || '0', tax_scope: f.tax_scope.value,
          tax_split: f.tax_split.checked, tax_inclusive_default: f.tax_inclusive_default.checked, round_off: f.round_off.checked, bill_prefix: f.bill_prefix.value,
          allow_negative_stock: f.stock_mode.value === 'warn', stock_hidden: !f.stock_shown.checked, ...(f.exp_profit ? { expenses_in_profit: f.exp_profit.value === 'yes' } : {}),
          item_fields: Object.fromEntries(ITEM_FIELDS.map(([k]) => [k, f['if_' + k].checked])) }, btn, 'Billing settings saved.');
        if (!ok) return;
        busy(btn, true, 'Saving…');
        try { Store.me.system = await Cloud.rpc('shop_billing_options_save', { p: { payments, features: Object.fromEntries(FEATURES.map(([k]) => [k, f['f_' + k].checked])) } }); await App.refreshMe(); App.rebuildNav(); }
        catch (ex) { toast(ex.message, 'error', 6000); } finally { busy(btn, false); }
      };
    }
    if (sec === 'design') {
      const f = $('#fDesign', root); draftInv = null; paintPreview();
      f.addEventListener('input', e => { if (e.target.name === 'colorCustom') { $$('[name=color]', f).forEach(r => { r.checked = false; }); f.colorCustom.nextElementSibling.textContent = e.target.value; } readDesign(); paintPreview(); });
      $('#testPrint', root).onclick = () => { const keep = Store.me.settings.bill; readDesign(); Store.me.settings.bill = draftBill; Receipt.print(sampleBill()); Store.me.settings.bill = keep; };
      f.onsubmit = e => { e.preventDefault(); readDesign(); saveSettings({ bill: draftBill }, e.submitter, 'Bill design saved.'); };
    }
    if (sec === 'extras') {
      const f = $('#fExtras', root); paintExtras(); paintPreview();
      const refresh = () => { readExtras(); paintExtras(); paintPreview(); };
      f.addEventListener('change', refresh); f.addEventListener('input', e => { if (!e.target.matches('[data-cfedit], #cfNew')) { readExtras(); paintPreview(); } });
      const upload = (id, key, max) => { $(id, root).onchange = async e => { try { const img = await imageToDataURL(e.target.files[0], max, 120000); if (key === 'qr') draftInv.qr.image = img; else draftInv.signature.image = img; refresh(); } catch (ex) { toast(ex.message, 'error'); } e.target.value = ''; }; };
      upload('#qrFile', 'qr', 600); upload('#sigFile', 'sig', 500);
      $('#qrRemove', root).onclick = () => { draftInv.qr.image = ''; refresh(); };
      $('#sigRemove', root).onclick = () => { draftInv.signature.image = ''; refresh(); };
      const list = () => draftInv.custom_fields.fields;
      const addField = v => { v = String(v || '').trim(); if (!v) return; if (list().length >= 20) return toast('Up to 20 custom fields.', 'warn'); if (list().includes(v)) return toast('That field is already there.', 'warn'); list().push(v); paintExtras(); paintPreview(); };
      $('#cfAdd', root).onclick = () => { addField($('#cfNew', root).value); $('#cfNew', root).value = ''; $('#cfNew', root).focus(); };
      $('#cfNew', root).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#cfAdd', root).click(); } };
      f.addEventListener('click', e => {
        const q = e.target.closest('[data-quick]'); if (q) return addField(q.dataset.quick);
        const li = e.target.closest('#cfList li[data-i]'); if (!li) return; const i = Number(li.dataset.i), l = list();
        if (e.target.closest('[data-del]')) l.splice(i, 1);
        else if (e.target.closest('[data-up]') && i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]];
        else if (e.target.closest('[data-down]') && i < l.length - 1) [l[i + 1], l[i]] = [l[i], l[i + 1]];
        else return;
        paintExtras(); paintPreview();
      });
      f.addEventListener('change', e => { const i = e.target.closest('[data-cfedit]'); if (i) { const v = i.value.trim(); const idx = Number(i.closest('li').dataset.i); if (v) list()[idx] = v; else list().splice(idx, 1); paintExtras(); paintPreview(); } });
      f.onsubmit = e => { e.preventDefault(); readExtras(); if (draftInv.qr.enabled && draftInv.qr.mode === 'upi' && !/^[\w.\-]{2,}@[a-z]{2,}$/i.test(draftInv.qr.upi_id)) return toast('Enter a UPI ID like shopname@okaxis.', 'warn'); if (draftInv.qr.enabled && draftInv.qr.mode === 'image' && !draftInv.qr.image) return toast('Upload your QR image, or switch the QR off.', 'warn'); saveSettings({ invoice: draftInv }, e.submitter, 'Bill extras saved.'); };
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
    if (sec === 'perms') $('#fPerms', root).onsubmit = async e => {
      e.preventDefault(); const btn = e.submitter; busy(btn, true, 'Saving…');
      try {
        for (const r of ['manager', 'cashier'].filter(x => Store.can('roles_' + x))) {
          const perms = [...(Store.sys.roles?.[r] || []).filter(x => !Store.permShown(x)), ...$$(`[data-role="${r}"]`, e.target).filter(c => c.checked).map(c => c.dataset.perm)];
          Store.me.system = await Cloud.rpc('shop_role_perms_save', { p_role: r, p_perms: perms });
        }
        toast('Permissions saved. Staff see the change within a minute.', 'ok');
      } catch (ex) { toast(ex.message, 'error', 6000); } finally { busy(btn, false); }
    };
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
    view.innerHTML = `<div class="page"><header class="page-head"><div><h1>Settings</h1><p class="sub">Your shop, bills, billing screen and staff.</p></div></header>
      <div class="settings"><nav class="set-nav" id="setNav">${secs.map(([k, l, , ic]) => `<button type="button" data-s="${k}">${Icon(ic)}<span>${l}</span></button>`).join('')}</nav><div id="setBody"></div></div></div>`;
    $('#setNav', view).onclick = e => { const b = e.target.closest('[data-s]'); if (b) { show(b.dataset.s); b.scrollIntoView({ inline: 'center', block: 'nearest' }); } };
    if (section) show(section);
  }
  return { mount, unmount() { root = null; } };
})();
