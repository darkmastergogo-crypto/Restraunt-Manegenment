/* Printed bill. Independent of the app theme: always printed on white. */
'use strict';
const Receipt = (() => {
  const LABELS = {
    bill_no: 'Bill', by: 'By', item: 'Item', qty: 'Qty', rate: 'Rate', amount: 'Amt', items_count: 'Items',
    subtotal: 'Subtotal', discount: 'Discount', round_off: 'Round off', less: 'Less (short paid)', total: 'TOTAL',
    total_screen: 'Total', paid_by: 'Paid by', cash_received: 'Cash received', change: 'Change returned', you_saved: 'You saved', hsn: 'HSN'
  };
  const LABEL_NAMES = {
    bill_no: 'Bill number', by: 'Billed by', item: 'Item column', qty: 'Quantity column', rate: 'Rate column', amount: 'Amount column',
    items_count: 'Item count', subtotal: 'Subtotal', discount: 'Discount', round_off: 'Round off', less: 'Short cash line',
    total: 'Grand total (printed)', total_screen: 'Total (on screen)', paid_by: 'Paid by', cash_received: 'Cash received', change: 'Change', you_saved: '“You saved”', hsn: 'HSN column'
  };
  const TEMPLATES = [['classic', 'Classic', 'Dashed lines, like a shop receipt'], ['modern', 'Modern', 'Bold coloured header'], ['minimal', 'Minimal', 'Clean, lots of space'],
                     ['grid', 'Grid', 'Bordered table, for A4/A5'], ['executive', 'Executive', 'Formal, with double rules']];
  const DEFAULTS = {
    paper: '80', fontSize: 12, align: 'center', titleText: 'Cash memo', template: 'classic', color: '#1f2937',
    showCustomer: true, showCashier: true, showPayment: true, showSavings: true, showCode: false, showItemCount: true, showCash: true,
    showHsn: true, showItemDiscount: true, headerText: '', footerText: 'Thank you! Please visit again.', labels: {}
  };
  const SHOP_FIELDS = [['logo', 'Logo'], ['name', 'Shop name'], ['tagline', 'Tagline'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email'],
                       ['website', 'Website'], ['tax_id', 'GSTIN / tax line'], ['pan', 'PAN'], ['fssai', 'FSSAI licence no.']];
  const design = (s = Store.settings) => ({ ...DEFAULTS, ...(s.bill || {}) });
  const labels = (d = design()) => ({ ...LABELS, ...Object.fromEntries(Object.entries(d.labels || {}).filter(([, v]) => String(v).trim())) });
  /* Each shop field can be shown or hidden on the bill (Settings → Shop details). Older bill-design switches still count. */
  function showField(s, k) {
    const f = s.show_fields || {}, legacy = { logo: 'showLogo', tagline: 'showTagline', address: 'showAddress', phone: 'showPhone', tax_id: 'showTaxId' }[k];
    if (k in f) return !!f[k];
    if (legacy && s.bill && legacy in s.bill) return s.bill[legacy] !== false;
    return true;
  }

  function qrBlock(b, s, cur) {
    const q = (s.invoice || {}).qr || {};
    if (!q.enabled || (q.only_upi && b.payment_method !== 'UPI')) return '';
    const px = { small: 90, medium: 130, large: 170 }[q.size] || 130;
    let img = '';
    if (q.mode === 'upi' && q.upi_id) {
      try { img = QR.svg(QR.upiLink({ upi_id: q.upi_id, payee: q.payee || s.shop_name, amount: b.status === 'Cancelled' ? 0 : b.total, note: b.bill_no }), px); } catch { img = ''; }
    } else if (/^data:image\//.test(q.image || '')) img = `<img src="${esc(q.image)}" alt="Payment QR" style="width:${px}px;height:${px}px">`;
    if (!img) return '';
    return `<div class="r-qr">${img}<div class="r-qr-cap">${esc(q.caption || 'Scan to pay')}${q.mode === 'upi' && q.upi_id ? `<small>${esc(q.upi_id)}${b.status !== 'Cancelled' ? ' · ' + cur + Fmt.nf2.format(b.total) : ''}</small>` : ''}</div></div>`;
  }

  function taxRows(b, n) {
    if (!b.tax_enabled || !(Number(b.tax_amount) > 0)) return '';
    const label = esc(b.tax_label || 'Tax'), rows = [];
    const push = (rate, amt, incl) => {
      const tag = incl ? ' (incl.)' : '';
      if (b.tax_split) { const [c, g] = Calc.split(amt), h = rate === '' ? '' : ' ' + Fmt.qty(Number(rate) / 2) + '%'; rows.push([`CGST${h}${tag}`, c], [`SGST${h}${tag}`, g]); }
      else rows.push([`${label}${rate === '' ? '' : ' ' + Fmt.qty(rate) + '%'}${tag}`, amt]);
    };
    if (b.tax_scope === 'item' && Array.isArray(b.tax_breakdown) && b.tax_breakdown.length) for (const g of b.tax_breakdown) push(Number(g.rate), Number(g.tax), g.incl);
    else push(b.tax_mode === 'percent' ? Number(b.tax_value) : '', Number(b.tax_amount), false);
    return rows.map(([k, v]) => `<div class="r-row"><span>${k}</span><span>${n(v)}</span></div>`).join('');
  }

  function html(b, s = Store.settings, d = design(s)) {
    const cur = s.currency || '₹', L = labels(d), inv = s.invoice || {};
    const m = v => cur + Fmt.nf2.format(Number(v) || 0);
    const n = v => Fmt.nf2.format(Number(v) || 0);
    const items = Array.isArray(b.items) ? b.items : [];
    const align = ['left', 'center', 'right'].includes(d.align) ? d.align : 'center';
    const fs = Math.max(9, Math.min(18, Number(d.fontSize) || 12));
    const tz = s.timezone || 'Asia/Kolkata', when = new Date(b.created_at);
    const date = when.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = when.toLocaleTimeString('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    const qtyTotal = items.reduce((a, i) => a + Number(i.qty || 0), 0);
    const brand = Store.sys.brand || {};
    const sf = k => showField(s, k);
    const logo = sf('logo') && /^(https:|data:image\/)/.test(s.logo || '') ? `<img class="r-logo" src="${esc(s.logo)}" alt="">` : '';
    const cancelled = b.status === 'Cancelled', saved = Number(b.discount_amount) || 0;
    const wide = d.paper === 'a4' || d.paper === 'a5';   // narrow thermal rolls show HSN and discount under the item name instead of in columns
    const hsnCol = wide && d.showHsn && items.some(i => i.hsn), discCol = wide && d.showItemDiscount && items.some(i => Number(i.discount) > 0);
    const under = i => [d.showCode && i.code ? esc(i.code) : '', !wide && d.showHsn && i.hsn ? 'HSN ' + esc(i.hsn) : '', !wide && d.showItemDiscount && Number(i.discount) > 0 ? `${Number(i.discount_pct) ? Fmt.qty(i.discount_pct) + '% off ' : 'Disc '}-${n(i.discount)}` : ''].filter(Boolean).join(' · ');
    const qr = qrBlock(b, s, cur), qrPos = inv.qr?.position === 'top' ? 'top' : 'bottom';
    const bank = inv.bank?.enabled ? inv.bank : null, sig = inv.signature?.enabled ? inv.signature : null;
    const cf = Array.isArray(b.custom_fields) ? b.custom_fields.filter(x => x && x.value) : [];
    const tpl = TEMPLATES.some(t => t[0] === d.template) ? d.template : 'classic';
    const color = /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#1f2937';
    const shopLines = [
      sf('tagline') && s.tagline ? `<div>${esc(s.tagline)}</div>` : '',
      sf('address') && s.address ? `<div class="r-pre">${esc(s.address)}</div>` : '',
      [sf('phone') && s.phone ? `Ph: ${esc(s.phone)}` : '', sf('email') && s.email ? esc(s.email) : ''].filter(Boolean).join(' · ') ? `<div>${[sf('phone') && s.phone ? `Ph: ${esc(s.phone)}` : '', sf('email') && s.email ? esc(s.email) : ''].filter(Boolean).join(' · ')}</div>` : '',
      sf('website') && s.website ? `<div>${esc(s.website)}</div>` : '',
      sf('tax_id') && s.tax_id ? `<div>${esc(s.tax_id)}</div>` : '',
      sf('pan') && s.pan ? `<div>PAN: ${esc(s.pan)}</div>` : '',
      sf('fssai') && s.fssai ? `<div>FSSAI Lic. No: ${esc(s.fssai)}</div>` : ''
    ].join('');
    return `<div class="receipt paper-${esc(d.paper)} rt-${tpl}" style="font-size:${fs}px;--bc:${color}">
      ${qrPos === 'top' ? qr : ''}
      <div class="r-head" style="text-align:${align}">
        ${logo}
        ${sf('name') ? `<div class="r-shop">${esc(s.shop_name || 'Shop')}</div>` : ''}
        ${shopLines}
        ${d.headerText ? `<div class="r-pre">${esc(d.headerText)}</div>` : ''}
        ${d.titleText ? `<div class="r-title">${esc(d.titleText)}</div>` : ''}
      </div>
      ${cancelled ? '<div class="r-void">CANCELLED</div>' : ''}
      <div class="r-meta">
        <div><span>${esc(L.bill_no)}: <b>${esc(b.bill_no || '—')}</b></span><span>${esc(date)}</span></div>
        <div><span>${d.showCashier && b.cashier_name ? esc(L.by) + ': ' + esc(b.cashier_name) : ''}</span><span>${esc(time)}</span></div>
        ${d.showCustomer && (b.customer_name || b.customer_phone) ? `<div><span>To: ${esc([b.customer_name, b.customer_phone].filter(Boolean).join(' · '))}</span></div>` : ''}
        ${d.showCustomer && b.customer_address ? `<div><span class="r-pre">${esc(b.customer_address)}</span></div>` : ''}
      </div>
      ${cf.length ? `<div class="r-fields">${cf.map(x => `<div><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('')}</div>` : ''}
      <table class="r-items"><thead><tr><th class="l">${esc(L.item)}</th>${hsnCol ? `<th>${esc(L.hsn)}</th>` : ''}<th>${esc(L.qty)}</th><th>${esc(L.rate)}</th>${discCol ? '<th>Disc</th>' : ''}<th>${esc(L.amount)}</th></tr></thead><tbody>
      ${items.map(i => `<tr><td class="l">${esc(i.alias || i.name)}${under(i) ? `<small>${under(i)}</small>` : ''}</td>${hsnCol ? `<td>${esc(i.hsn || '')}</td>` : ''}<td>${Fmt.qty(i.qty)}${i.unit && i.unit !== 'pcs' ? `<small>${esc(i.unit)}</small>` : ''}</td><td>${n(i.price)}</td>${discCol ? `<td>${Number(i.discount) > 0 ? '-' + n(i.discount) : ''}</td>` : ''}<td>${n(i.line_total)}</td></tr>`).join('')}
      </tbody></table>
      <div class="r-totals">
        ${d.showItemCount ? `<div class="r-row r-muted"><span>${esc(L.items_count)} ${items.length} · ${esc(L.qty)} ${Fmt.qty(qtyTotal)}</span><span></span></div>` : ''}
        <div class="r-row"><span>${esc(L.subtotal)}</span><span>${n(b.items_subtotal)}</span></div>
        ${saved > 0 ? `<div class="r-row"><span>${esc(L.discount)}${b.discount_mode === 'percent' ? ' (' + Number(b.discount_value) + '%)' : ''}</span><span>-${n(saved)}</span></div>` : ''}
        ${taxRows(b, n)}
        ${Number(b.round_off) ? `<div class="r-row"><span>${esc(L.round_off)}</span><span>${Number(b.round_off) > 0 ? '+' : ''}${n(b.round_off)}</span></div>` : ''}
        ${Number(b.less_amount) > 0 ? `<div class="r-row"><span>${esc(L.less)}</span><span>-${n(b.less_amount)}</span></div>` : ''}
        <div class="r-row r-grand"><span>${esc(L.total)}</span><span>${m(b.total)}</span></div>
        ${d.showPayment ? `<div class="r-row"><span>${esc(L.paid_by)}</span><span>${esc(b.payment_method)}</span></div>` : ''}
        ${d.showCash && b.cash_received != null && b.payment_method === 'Cash' ? `<div class="r-row"><span>${esc(L.cash_received)}</span><span>${n(b.cash_received)}</span></div>${Number(b.change_amount) > 0 ? `<div class="r-row"><span>${esc(L.change)}</span><span>${n(b.change_amount)}</span></div>` : ''}` : ''}
        ${d.showSavings && saved > 0 ? `<div class="r-save">${esc(L.you_saved)} ${m(saved)}</div>` : ''}
      </div>
      ${b.notes ? `<div class="r-note r-pre">${esc(b.notes)}</div>` : ''}
      ${bank ? `<div class="r-bank"><b>Bank details</b>${[['A/c name', bank.holder], ['Bank', bank.bank], ['A/c no.', bank.account], ['IFSC', bank.ifsc], ['Branch', bank.branch]].filter(x => x[1]).map(([k, v]) => `<div><span>${k}</span><span>${esc(v)}</span></div>`).join('')}</div>` : ''}
      ${qrPos === 'bottom' ? qr : ''}
      ${sig ? `<div class="r-sign sign-${esc(sig.size || 'medium')}">${/^data:image\//.test(sig.image || '') ? `<img src="${esc(sig.image)}" alt="Signature">` : '<div class="r-sign-line"></div>'}<div>${esc(sig.label || 'Authorised signatory')}</div><small>for ${esc(s.shop_name || '')}</small></div>` : ''}
      ${d.footerText ? `<div class="r-foot r-pre" style="text-align:${align}">${esc(d.footerText)}</div>` : ''}
      ${brand.show_on_bill !== false && brand.software_name ? `<div class="r-vendor">Billing software by ${esc(brand.software_name)}</div>` : ''}
    </div>`;
  }

  async function print(b) {
    const d = design();
    let area = $('#printArea');
    if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.append(area); }
    area.innerHTML = html(b);
    let page = $('#pageStyle');
    if (!page) { page = document.createElement('style'); page.id = 'pageStyle'; document.head.append(page); }
    page.textContent = d.paper === 'a4' ? '@page{size:A4;margin:12mm}' : d.paper === 'a5' ? '@page{size:A5;margin:8mm}' : `@page{size:${d.paper === '58' ? 58 : 80}mm auto;margin:2mm}`;
    await Promise.all($$('img', area).map(i => i.decode?.().catch(() => {})));
    document.body.classList.add('printing');
    window.print();
    setTimeout(() => document.body.classList.remove('printing'), 400);
  }

  function shareText(b, s = Store.settings) {
    const L = labels();
    const lines = [`*${s.shop_name || 'Shop'}*`, `${L.bill_no} ${b.bill_no} · ${Fmt.dateTime(b.created_at)}`, ''];
    for (const i of b.items || []) lines.push(`${i.alias || i.name} × ${Fmt.qty(i.qty)}${i.unit && i.unit !== 'pcs' ? ' ' + i.unit : ''} = ${Fmt.money(i.line_total)}`);
    lines.push('');
    if (Number(b.discount_amount) > 0) lines.push(`${L.discount}: -${Fmt.money(b.discount_amount)}`);
    if (Number(b.tax_amount) > 0) lines.push(`${b.tax_label || 'Tax'}: ${Fmt.money(b.tax_amount)}`);
    if (Number(b.less_amount) > 0) lines.push(`${L.less}: -${Fmt.money(b.less_amount)}`);
    lines.push(`*${L.total_screen}: ${Fmt.money(b.total)}* (${b.payment_method})`);
    const q = (s.invoice || {}).qr; if (q?.enabled && q.mode === 'upi' && q.upi_id) lines.push(`Pay by UPI: ${q.upi_id}`);
    const foot = design(s).footerText; if (foot) lines.push('', foot);
    return lines.join('\n');
  }
  function whatsapp(b) {
    let phone = String(b.customer_phone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = (Cloud.cfg.whatsappCountryCode || '91') + phone;
    const link = (phone ? 'https://wa.me/' + phone : 'https://wa.me/') + '?text=' + encodeURIComponent(shareText(b));
    window.open(link, '_blank', 'noopener');
  }
  return { html, print, whatsapp, design, labels, showField, DEFAULTS, LABELS, LABEL_NAMES, TEMPLATES, SHOP_FIELDS };
})();
