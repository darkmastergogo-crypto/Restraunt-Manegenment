/* Bill arithmetic. Mirrors shop_create_bill on the server exactly (integer paise, half-up rounding),
   so the total on screen is always the total that gets saved. */
'use strict';
const Calc = (() => {
  const P = v => Math.round((Number(v) || 0) * 100);           // rupees -> paise
  const R = (num, den) => Math.round(num / den);                // integer division, rounded half up (positive values)

  /* lines: in the order they are sent to the server. Each: { qty, price, discount_pct, tax_rate, incl }
     s: shop settings. opts: { discount:{mode,value}, canDiscount, received (rupees), cashOn, canShort, maxShort, isAdmin } */
  function bill(lines, s, opts = {}) {
    const out = lines.map(l => {
      const q1000 = Math.round(Number(l.qty) * 1000), gross = R(q1000 * P(l.price), 1000);
      const d100 = Math.round((Number(l.discount_pct) || 0) * 100), disc = R(gross * d100, 10000);
      return { gross, disc, total: gross - disc, rate100: Math.round((Number(l.tax_rate) || 0) * 100), incl: !!l.incl, tax: 0, taxable: 0 };
    });
    const sub = out.reduce((a, l) => a + l.total, 0);
    let bdisc = 0; const dv = Number(opts.discount?.value) || 0;
    if (dv > 0 && opts.canDiscount) bdisc = opts.discount.mode === 'percent' ? R(sub * Math.round(Math.min(dv, 100) * 100), 10000) : Math.min(P(dv), sub);
    const taxable = sub - bdisc;
    let tax = 0, extra = 0;
    if (s.tax_enabled && s.tax_scope === 'item') {
      let allocated = 0;
      out.forEach((l, i) => {
        const alloc = i === out.length - 1 ? bdisc - allocated : (sub > 0 ? R(bdisc * l.total, sub) : 0);
        allocated += alloc;
        const net = l.total - alloc;
        if (l.rate100 > 0) {
          if (l.incl) { l.taxable = R(net * 10000, 10000 + l.rate100); l.tax = net - l.taxable; }
          else { l.taxable = net; l.tax = R(net * l.rate100, 10000); extra += l.tax; }
        } else l.taxable = net;
        tax += l.tax;
      });
    } else if (s.tax_enabled) {
      tax = s.tax_mode === 'percent' ? R(taxable * Math.round(Number(s.tax_value) * 100), 10000) : (taxable > 0 ? P(s.tax_value) : 0);
      extra = tax;
    }
    const gross = taxable + extra, total = s.round_off ? Math.round(gross / 100) * 100 : gross;
    const rec = opts.cashOn ? P(opts.received) : 0;
    let less = 0, shortBlocked = '';
    if (rec > 0 && rec < total) {
      if (!opts.canShort) shortBlocked = 'Collect the full amount.';
      else if (!opts.isAdmin && total - rec > P(opts.maxShort)) shortBlocked = 'max';
      else less = total - rec;
    }
    const final = total - less;
    // tax summary by rate (per-item mode)
    const groups = {};
    if (s.tax_enabled && s.tax_scope === 'item') for (const l of out) if (l.tax > 0) { const k = l.rate100 + (l.incl ? 'i' : 'e'); (groups[k] ||= { rate: l.rate100 / 100, incl: l.incl, tax: 0, taxable: 0 }); groups[k].tax += l.tax; groups[k].taxable += l.taxable; }
    return {
      lines: out.map(l => ({ gross: l.gross / 100, disc: l.disc / 100, total: l.total / 100, tax: l.tax / 100 })),
      sub: sub / 100, disc: bdisc / 100, tax: tax / 100, extra: extra / 100, round: (total - gross) / 100, total: total / 100,
      less: less / 100, final: final / 100, rec: rec / 100, change: rec > final ? (rec - final) / 100 : 0,
      short: rec > 0 && rec < total ? (total - rec) / 100 : 0, shortBlocked,
      breakdown: Object.values(groups).sort((a, b) => a.rate - b.rate || a.incl - b.incl).map(g => ({ ...g, tax: g.tax / 100, taxable: g.taxable / 100 })),
      qty: lines.reduce((a, l) => a + Number(l.qty), 0)
    };
  }
  /* Split a tax amount into CGST + SGST halves (paise-exact). */
  function split(amount) { const t = P(amount), c = Math.floor(t / 2); return [c / 100, (t - c) / 100]; }
  return { bill, split };
})();
if (typeof module !== 'undefined') module.exports = Calc;
