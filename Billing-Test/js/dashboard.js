/* Owner dashboard: sales, trend, payments, best sellers, low stock. */
'use strict';
const Dashboard = (() => {
  let period = 'today', from = '', to = '', root = null, req = 0;

  function trendLabel(key, unit, short) {
    if (unit === 'hour') { const h = Number(key); return (h % 12 || 12) + (h < 12 ? 'am' : 'pm'); }
    if (unit === 'day') { const d = new Date(key + 'T12:00:00Z'); return short ? String(d.getUTCDate()) : d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', weekday: 'short' }); }
    const d = new Date(key + '-15T12:00:00Z'); return d.toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short', ...(short ? {} : { year: 'numeric' }) });
  }

  function barChart(trend, unit) {
    const W = 760, H = 220, P = { l: 52, r: 8, t: 12, b: 26 };
    const max = Math.max(...trend.map(t => Number(t.sales)), 0);
    if (!max) return `<div class="empty slim"><p>No sales in this period yet.</p></div>`;
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p; return 10 * p; })();
    const iw = W - P.l - P.r, ih = H - P.t - P.b, n = trend.length, slot = iw / n, bw = Math.max(2, Math.min(28, slot * 0.62));
    const y = v => P.t + ih - (v / nice) * ih;
    const step = Math.ceil(n / 12);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = nice * i / 4, yy = y(v); g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" class="grid-l"/><text x="${P.l - 8}" y="${yy + 4}" class="ax" text-anchor="end">${esc(Fmt.compact(v))}</text>`; }
    const bars = trend.map((t, i) => {
      const v = Number(t.sales), x = P.l + slot * i + (slot - bw) / 2, h = Math.max(v ? 2 : 0, ih - (y(v) - P.t)), yy = P.t + ih - h, r = Math.min(4, bw / 2, h);
      const path = h ? `M${x},${P.t + ih} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${P.t + ih} Z` : '';
      return `<g class="bar" data-i="${i}"><rect x="${P.l + slot * i}" y="${P.t}" width="${slot}" height="${ih}" class="hit"/>${path ? `<path d="${path}"/>` : ''}${i % step === 0 ? `<text x="${x + bw / 2}" y="${H - 8}" class="ax" text-anchor="middle">${esc(trendLabel(t.key, unit, true))}</text>` : ''}</g>`;
    }).join('');
    return `<div class="chart" data-unit="${unit}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales by ${unit}">${g}<line x1="${P.l}" x2="${W - P.r}" y1="${P.t + ih}" y2="${P.t + ih}" class="base-l"/>${bars}</svg><div class="tip" hidden></div></div>`;
  }

  function hbars(rows, label, value, fmt, sub) {
    const max = Math.max(...rows.map(r => Number(r[value])), 0) || 1;
    return `<ul class="hbars">${rows.map(r => `<li><div class="hb-top"><span>${esc(r[label])}</span><b>${fmt(r[value])}</b></div><div class="hb-track"><i style="width:${(Number(r[value]) / max * 100).toFixed(1)}%"></i></div>${sub ? `<small>${sub(r)}</small>` : ''}</li>`).join('')}</ul>`;
  }

  function delta(now, prev) {
    if (!prev) return now ? '<span class="delta">New this period</span>' : '';
    const p = (now - prev) / prev * 100, up = p >= 0;
    return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(p).toFixed(p > -10 && p < 10 ? 1 : 0)}% vs previous period</span>`;
  }

  async function load() {
    const id = ++req, [f, t] = periodRange(period, from, to);
    $('#dStatus', root).textContent = 'Loading…';
    try {
      const d = await Cloud.rpc('shop_dashboard', { p_from: f, p_to: t });
      if (id !== req || !root?.isConnected) return;
      render(d);
    } catch (e) { if (id === req && root?.isConnected) $('#dStatus', root).textContent = e.message; }
  }

  function render(d) {
    const m = d.metrics;
    $('#dStatus', root).textContent = d.from === d.to ? Fmt.date(d.from) : `${Fmt.date(d.from)} – ${Fmt.date(d.to)}`;
    const ex = m.expenses_on, exp = Number(m.expenses || 0), gross = Number(m.profit), inP = m.expenses_in_profit !== false;
    const net = ex && inP ? Number(m.sales) - exp : gross;
    $('#dKpis', root).innerHTML = `
      <div class="kpi kpi-hero"><span>Sales</span><b>${Fmt.money(m.sales)}</b>${delta(Number(m.sales), Number(m.prev_sales))}</div>
      <div class="kpi"><span>Bills</span><b>${Fmt.nf0.format(m.bills)}</b><small>${m.cancelled ? `${m.cancelled} cancelled (${Fmt.money(m.cancelled_value)})` : 'No cancelled bills'}</small></div>
      ${ex ? `<div class="kpi"><span>Expenses</span><b>${Fmt.money(exp)}</b><small><a class="linkish" href="#/expenses">${(d.expense_heads || []).length ? esc(d.expense_heads.slice(0, 2).map(h => h.head).join(', ')) + (d.expense_heads.length > 2 ? '…' : '') : 'Add expenses'}</a></small></div>` : ''}
      <div class="kpi ${net < 0 ? 'kpi-bad' : 'kpi-good'}"><span>Net profit</span><b>${Fmt.money(net)}</b><small>${ex && inP ? 'Sales − expenses' : 'Selling price − buying price'}${!ex || inP ? '' : ' · expenses not deducted'}</small></div>
      ${ex && inP ? `<div class="kpi"><span>Gross profit</span><b>${Fmt.money(gross)}</b><small>${Number(m.profit_cover) >= 99.5 ? 'Selling − buying price' : `Covers ${Number(m.profit_cover)}% of sales — add buying prices in Items`}</small></div>` : ''}
      ${m.members_on && Number(m.membership_sales) ? `<div class="kpi"><span>Memberships</span><b>${Fmt.money(m.membership_sales)}</b><small>Plans sold and renewed</small></div>` : ''}
      <div class="kpi"><span>Average bill</span><b>${Fmt.money(m.avg_bill)}</b><small>${Fmt.qty(m.qty)} units sold</small></div>
      <div class="kpi"><span>Discount given</span><b>${Fmt.money(m.discount)}</b><small>Tax collected ${Fmt.money(m.tax)}</small></div>`;
    const mb = d.members, L = Store.label('members');
    $('#dMembersCard', root).hidden = !mb;
    if (mb) $('#dMembers', root).innerHTML = `<div class="mini-stats"><a href="#/members" class="ms"><b>${mb.active}</b><span>Active</span></a><a href="#/members" class="ms ms-warn"><b>${mb.expiring}</b><span>Ending soon</span></a><a href="#/members" class="ms ms-bad"><b>${mb.expired}</b><span>Expired</span></a><span class="ms"><b>${mb.checkins_today}</b><span>Check-ins today</span></span></div><a class="linkish" href="#/members">Open ${esc(L.toLowerCase())}</a>`;
    $('#dMembersTitle', root).textContent = L;
    $('#dExpCard', root).hidden = !ex;
    const eh = d.expense_heads || [];
    if (ex) $('#dExp', root).innerHTML = eh.length ? hbars(eh, 'head', 'amount', v => Fmt.money(v), r => `${r.n} entr${r.n === 1 ? 'y' : 'ies'}`) + '<a class="linkish" href="#/expenses">All expenses</a>' : '<div class="empty slim"><p>No expenses in this period.</p></div>';
    $('#dLowCard', root).hidden = !Store.moduleOn('stocks') || !Store.can('stocks');
    $('#dTrend', root).innerHTML = barChart(d.trend || [], d.trend_unit);
    $('#dTrendTitle', root).textContent = { hour: 'Sales by hour', day: 'Sales by day', month: 'Sales by month' }[d.trend_unit];
    wireTip(d.trend || [], d.trend_unit);

    const pays = d.payments || [];
    $('#dPay', root).innerHTML = pays.length ? hbars(pays, 'method', 'amount', v => Fmt.money(v), r => `${r.bills} bill${r.bills === 1 ? '' : 's'} · ${(Number(r.amount) / (Number(m.sales) || 1) * 100).toFixed(0)}% of sales`) : '<div class="empty slim"><p>No payments yet.</p></div>';
    const top = d.top_items || [];
    $('#dTop', root).innerHTML = top.length ? `<table class="table compact"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Sales</th></tr></thead><tbody>${top.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${Fmt.qty(r.qty)} <small>${esc(r.unit || '')}</small></td><td class="num"><b>${Fmt.money(r.revenue)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty slim"><p>Best sellers show up after the first bill.</p></div>';
    const cats = d.categories || [];
    $('#dCats', root).innerHTML = cats.length ? hbars(cats, 'category', 'revenue', v => Fmt.money(v)) : '<div class="empty slim"><p>No category sales yet.</p></div>';
    const low = d.low_stock || [];
    $('#dLow', root).innerHTML = low.length ? `<ul class="plain-list">${low.map(r => `<li><span>${esc(r.name)}</span><span class="badge ${Number(r.stock) <= 0 ? 'badge-red' : 'badge-amber'}">${Number(r.stock) <= 0 ? 'Out of stock' : Fmt.qty(r.stock) + ' ' + esc(r.unit) + ' left'}</span></li>`).join('')}</ul><a class="linkish" href="#/stocks">Open stocks</a>` : '<div class="empty slim"><p>Nothing is running low.</p></div>';
    const rec = d.recent || [];
    $('#dRecent', root).innerHTML = rec.length ? `<ul class="plain-list">${rec.map(r => `<li><span><b class="mono">${esc(r.bill_no)}</b> <small>${esc(Fmt.time(r.created_at))}${r.customer_name ? ' · ' + esc(r.customer_name) : ''}</small></span><span><small>${esc(r.payment_method)}</small> <b>${Fmt.money(r.total)}</b></span></li>`).join('')}</ul><a class="linkish" href="#/records">All records</a>` : '<div class="empty slim"><p>No bills in this period.</p></div>';
  }

  function wireTip(trend, unit) {
    const chart = $('.chart', root); if (!chart) return;
    const tip = $('.tip', chart), svg = $('svg', chart);
    const show = g => {
      const t = trend[Number(g.dataset.i)]; if (!t) return;
      $$('.bar', svg).forEach(b => b.classList.toggle('on', b === g));
      tip.innerHTML = `<b>${esc(trendLabel(t.key, unit, false))}</b><span>${Fmt.money(t.sales)}</span><small>${t.bills} bill${t.bills === 1 ? '' : 's'}</small>`;
      tip.hidden = false;
      const r = g.querySelector('.hit').getBoundingClientRect(), c = chart.getBoundingClientRect();
      const x = Math.min(Math.max(r.left - c.left + r.width / 2, 60), c.width - 60);
      tip.style.left = x + 'px';
    };
    svg.addEventListener('pointerover', e => { const g = e.target.closest('.bar'); if (g) show(g); });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; $$('.bar', svg).forEach(b => b.classList.remove('on')); });
  }

  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Dashboard</h1><p class="sub" id="dStatus" role="status"></p></div>
        <div class="head-actions"><button type="button" class="btn" id="dRefresh">${Icon('refresh')} Refresh</button></div></header>
      <div class="filters"><div class="seg" id="dPeriods">${PERIODS.map(([k, l]) => `<button type="button" data-p="${k}" class="${period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="range" id="dRange" ${period === 'custom' ? '' : 'hidden'}><input type="date" id="dFrom" aria-label="From date"><span>to</span><input type="date" id="dTo" aria-label="To date"></div></div>
      <div class="kpis" id="dKpis"></div>
      <div class="dash-grid">
        <section class="card span-2"><h2 id="dTrendTitle">Sales</h2><div id="dTrend"></div></section>
        <section class="card"><h2>Payments</h2><div id="dPay"></div></section>
        <section class="card"><h2>Best-selling items</h2><div id="dTop"></div></section>
        <section class="card"><h2>Sales by category</h2><div id="dCats"></div></section>
        <section class="card" id="dMembersCard" hidden><h2 id="dMembersTitle">Members</h2><div id="dMembers"></div></section>
        <section class="card" id="dExpCard" hidden><h2>Expenses by type</h2><div id="dExp"></div></section>
        <section class="card" id="dLowCard"><h2>Low stock</h2><div id="dLow"></div></section>
        <section class="card"><h2>Latest bills</h2><div id="dRecent"></div></section>
      </div></div>`;
    const t = Fmt.today();
    $('#dFrom', view).value = from || Fmt.monthStart(t); $('#dTo', view).value = to || t; $('#dFrom', view).max = t; $('#dTo', view).max = t;
    $('#dPeriods', view).addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; period = b.dataset.p; $$('#dPeriods button', view).forEach(x => x.classList.toggle('on', x === b)); $('#dRange', view).hidden = period !== 'custom'; if (period === 'custom') { from = $('#dFrom', view).value; to = $('#dTo', view).value; } load(); });
    for (const id of ['#dFrom', '#dTo']) $(id, view).addEventListener('change', () => { from = $('#dFrom', view).value; to = $('#dTo', view).value; if (to < from) { to = from; $('#dTo', view).value = to; } load(); });
    $('#dRefresh', view).onclick = load;
    load();
  }
  return { mount, unmount() { root = null; }, refresh() { if (root) load(); } };
})();
