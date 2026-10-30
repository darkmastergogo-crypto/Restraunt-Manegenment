/* Printed bill. Independent of the app theme: always black on white. */
'use strict';
const Receipt = (() => {
  const DEFAULTS = {
    paper: '80', fontSize: 12, align: 'center', titleText: 'Cash memo',
    showLogo: true, showTagline: true, showAddress: true, showPhone: true, showTaxId: true,
    showCustomer: true, showCashier: true, showPayment: true, showSavings: true, showCode: false, showItemCount: true,
    headerText: '', footerText: 'Thank you! Please visit again.'
  };
  const design = (s = Store.settings) => ({ ...DEFAULTS, ...(s.bill || {}) });

  function html(b, s = Store.settings, d = design(s)) {
    const cur = s.currency || '₹';
    const m = v => cur + Fmt.nf2.format(Number(v) || 0);
    const n = v => Fmt.nf2.format(Number(v) || 0);
    const items = Array.isArray(b.items) ? b.items : [];
    const align = ['left', 'center', 'right'].includes(d.align) ? d.align : 'center';
    const fs = Math.max(9, Math.min(18, Number(d.fontSize) || 12));
    const when = new Date(b.created_at);
    const date = when.toLocaleDateString('en-IN', { timeZone: s.timezone || 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = when.toLocaleTimeString('en-IN', { timeZone: s.timezone || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    const qtyTotal = items.reduce((a, i) => a + Number(i.qty || 0), 0);
    const vendor = Cloud.cfg.vendor || {};
    const logo = d.showLogo && /^(https:|data:image\/)/.test(s.logo || '') ? `<img class="r-logo" src="${esc(s.logo)}" alt="">` : '';
    const cancelled = b.status === 'Cancelled';
    return `<div class="receipt paper-${esc(d.paper)}" style="font-size:${fs}px">
      <div class="r-head" style="text-align:${align}">
        ${logo}
        <div class="r-shop">${esc(s.shop_name || 'Shop')}</div>
        ${d.showTagline && s.tagline ? `<div>${esc(s.tagline)}</div>` : ''}
        ${d.showAddress && s.address ? `<div class="r-pre">${esc(s.address)}</div>` : ''}
        ${d.showPhone && s.phone ? `<div>Ph: ${esc(s.phone)}</div>` : ''}
        ${d.showTaxId && s.tax_id ? `<div>${esc(s.tax_id)}</div>` : ''}
        ${d.headerText ? `<div class="r-pre">${esc(d.headerText)}</div>` : ''}
        ${d.titleText ? `<div class="r-title">${esc(d.titleText)}</div>` : ''}
      </div>
      ${cancelled ? '<div class="r-void">CANCELLED</div>' : ''}
      <div class="r-meta">
        <div><span>Bill: <b>${esc(b.bill_no || '—')}</b></span><span>${esc(date)}</span></div>
        <div><span>${d.showCashier && b.cashier_name ? 'By: ' + esc(b.cashier_name) : ''}</span><span>${esc(time)}</span></div>
        ${d.showCustomer && (b.customer_name || b.customer_phone) ? `<div><span>To: ${esc([b.customer_name, b.customer_phone].filter(Boolean).join(' · '))}</span></div>` : ''}
      </div>
      <table class="r-items"><thead><tr><th class="l">Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead><tbody>
      ${items.map(i => `<tr><td class="l">${esc(i.name)}${d.showCode && i.code ? `<small>${esc(i.code)}</small>` : ''}</td><td>${Fmt.qty(i.qty)}${i.unit && i.unit !== 'pcs' ? `<small>${esc(i.unit)}</small>` : ''}</td><td>${n(i.price)}</td><td>${n(i.line_total)}</td></tr>`).join('')}
      </tbody></table>
      <div class="r-totals">
        ${d.showItemCount ? `<div class="r-row r-muted"><span>Items ${items.length} · Qty ${Fmt.qty(qtyTotal)}</span><span></span></div>` : ''}
        <div class="r-row"><span>Subtotal</span><span>${n(b.items_subtotal)}</span></div>
        ${Number(b.discount_amount) > 0 ? `<div class="r-row"><span>Discount${b.discount_mode === 'percent' ? ' (' + Number(b.discount_value) + '%)' : ''}</span><span>-${n(b.discount_amount)}</span></div>` : ''}
        ${b.tax_enabled && Number(b.tax_amount) > 0 ? `<div class="r-row"><span>${esc(b.tax_label || 'Tax')}${b.tax_mode === 'percent' ? ' (' + Number(b.tax_value) + '%)' : ''}</span><span>${n(b.tax_amount)}</span></div>` : ''}
        ${Number(b.round_off) ? `<div class="r-row"><span>Round off</span><span>${Number(b.round_off) > 0 ? '+' : ''}${n(b.round_off)}</span></div>` : ''}
        <div class="r-row r-grand"><span>TOTAL</span><span>${m(b.total)}</span></div>
        ${d.showPayment ? `<div class="r-row"><span>Paid by</span><span>${esc(b.payment_method === 'Credit' ? 'Credit (due)' : b.payment_method)}</span></div>` : ''}
        ${d.showSavings && Number(b.discount_amount) > 0 ? `<div class="r-save">You saved ${m(b.discount_amount)}</div>` : ''}
      </div>
      ${b.notes ? `<div class="r-note r-pre">${esc(b.notes)}</div>` : ''}
      ${d.footerText ? `<div class="r-foot r-pre" style="text-align:${align}">${esc(d.footerText)}</div>` : ''}
      ${vendor.showOnBill && vendor.name ? `<div class="r-vendor">Billing software by ${esc(vendor.name)}</div>` : ''}
    </div>`;
  }

  async function print(b) {
    const d = design();
    let area = $('#printArea');
    if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.append(area); }
    area.innerHTML = html(b);
    let page = $('#pageStyle');
    if (!page) { page = document.createElement('style'); page.id = 'pageStyle'; document.head.append(page); }
    page.textContent = d.paper === 'a4' ? '@page{size:A4;margin:12mm}' : `@page{size:${d.paper === '58' ? 58 : 80}mm auto;margin:2mm}`;
    await Promise.all($$('img', area).map(i => i.decode?.().catch(() => {})));
    document.body.classList.add('printing');
    window.print();
    setTimeout(() => document.body.classList.remove('printing'), 400);
  }

  function shareText(b, s = Store.settings) {
    const lines = [`*${s.shop_name || 'Shop'}*`, `Bill ${b.bill_no} · ${Fmt.dateTime(b.created_at)}`, ''];
    for (const i of b.items || []) lines.push(`${i.name} × ${Fmt.qty(i.qty)}${i.unit && i.unit !== 'pcs' ? ' ' + i.unit : ''} = ${Fmt.money(i.line_total)}`);
    lines.push('');
    if (Number(b.discount_amount) > 0) lines.push(`Discount: -${Fmt.money(b.discount_amount)}`);
    if (Number(b.tax_amount) > 0) lines.push(`${b.tax_label || 'Tax'}: ${Fmt.money(b.tax_amount)}`);
    lines.push(`*Total: ${Fmt.money(b.total)}* (${b.payment_method})`);
    const foot = design(s).footerText; if (foot) lines.push('', foot);
    return lines.join('\n');
  }
  function whatsapp(b) {
    let phone = String(b.customer_phone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = (Cloud.cfg.whatsappCountryCode || '91') + phone;
    const link = (phone ? 'https://wa.me/' + phone : 'https://wa.me/') + '?text=' + encodeURIComponent(shareText(b));
    window.open(link, '_blank', 'noopener');
  }
  return { html, print, whatsapp, design, DEFAULTS };
})();
