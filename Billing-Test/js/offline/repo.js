/* What the shop knows and does on its own, with or without internet.
   Everything one bill touches — the bill, its lines, the stock it uses and the note telling the
   server about it — is written in ONE transaction. If any part of it fails, none of it happened,
   and the screen never says "saved" until the device has really saved it.

   The arithmetic is not re-invented here: it goes through the app's own Calc.bill(), the same
   function the billing screen already uses to show the total, so the figure on the screen, the
   figure on the printed bill and the figure that reaches the server are one figure. */
'use strict';
const LocalRepo = (() => {
  const DB = () => LocalDB;
  const CALC = () => (typeof Calc !== 'undefined' ? Calc : require('../calc.js'));
  const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const money = n => Math.round((Number(n) || 0) * 100) / 100;
  const nowISO = () => new Date().toISOString();
  const dayIn = (tz = 'Asia/Kolkata', d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  const num = n => Number(n) || 0;

  /* ---------- small settings kept beside the data ---------- */
  const metaGet = async (k, fallback = null) => { const r = await DB().get('meta', k); return r === undefined ? fallback : r.v; };
  const metaSet = (k, v) => DB().put('meta', { k, v });
  const metaSetIn = (h, k, v) => h.put('meta', { k, v });

  /* ---------- this device ---------- */
  async function deviceId() {
    let id = await metaGet('device_id');
    if (!id) { id = uuid(); await metaSet('device_id', id); }
    return id;
  }
  const shortId = id => String(id || '').replace(/-/g, '').slice(0, 4).toUpperCase();

  /* ---------- bill numbers that stay unique with no internet ----------
     The server hands this device a block of numbers in advance (say 101–200) and moves the
     shop's counter past them, so no other device and no online bill can ever use the same
     number. Offline, bills take the next number from the block.
     If the block runs out while still offline the bill is NOT blocked — money comes first — it
     is given a clearly marked number carrying this device's tag, which stays unique and is
     never quietly renumbered afterwards. */
  const pad = (n, digits) => { const s = String(n); return s.length >= digits ? s : s.padStart(digits, '0'); };
  const EMPTY_BLOCK = { prefix: 'INV-', digits: 5, start: 0, end: -1, next: 0, fallback: 0 };
  const blockState = async () => (await metaGet('bill_block')) || { ...EMPTY_BLOCK };
  function takeNumber(block, device) {
    if (block.end > 0 && block.next <= block.end) {
      return { no: block.prefix + pad(block.next, block.digits), seq: block.next, provisional: false,
        block: { ...block, next: block.next + 1 } };
    }
    const n = (block.fallback || 0) + 1;
    return { no: `${block.prefix}${shortId(device)}-${pad(n, 4)}`, seq: null, provisional: true,
      block: { ...block, fallback: n } };
  }
  const numbersLeft = b => (b.end >= b.start && b.next <= b.end) ? (b.end - b.next + 1) : 0;

  /* ---------- the item list, kept locally so billing never waits for the network ---------- */
  async function saveCatalogue(items, categories) {
    await DB().tx(['items', 'categories', 'meta'], async h => {
      for (const i of items) await h.put('items', i);
      if (Array.isArray(categories)) {
        let n = 0;
        for (const c of categories) await h.put('categories', typeof c === 'string'
          ? { name: c, sort_order: n++ }
          : { ...c, name: c.name, sort_order: c.sort ?? c.sort_order ?? n++ });
      }
      await metaSetIn(h, 'catalogue_at', nowISO());
    });
  }
  const catalogue = async () => ({
    items: await DB().all('items', { index: 'name' }),
    categories: (await DB().all('categories', { index: 'sort_order' }))
  });

  /* ---------- working out one bill, the way the server does ----------
     args are exactly what the screen already sends to shop_create_bill, plus __settings,
     __sys, __can and __cashier, which the offline router fills in from the app's own Store. */
  function price(args, items) {
    const s = args.__settings || {}, sys = args.__sys || {}, can = args.__can || (() => true);
    const raw = args.p_items || [];
    if (!raw.length) throw Error('This bill has no items.');
    if (raw.length > 300) throw Error('A bill can hold at most 300 lines.');

    const lines = [], calcLines = [];
    let n = 0;
    for (const l of raw) {
      n++;
      const qty = Number(l.qty);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 999999) throw Error(`Line ${n}: enter a quantity above 0.`);
      if (String(l.custom) === 'true' || l.custom === true) {
        const name = String(l.name || '').trim();
        const px = Number(l.price);
        if (!name) throw Error(`Line ${n}: enter a name for the extra item.`);
        if (!Number.isFinite(px) || px <= 0) throw Error(`Line ${n}: enter a price above 0 for ${name}.`);
        lines.push({ line_no: n, item_id: null, name: name.slice(0, 120), category: '', unit: l.unit || 'pcs',
          qty, price: money(px), gross: money(qty * px), discount_pct: 0, discount: 0, line_total: money(qty * px),
          cost_price: null, custom: true, hsn: '', tax_rate: num(s.tax_value), incl: !!s.tax_inclusive_default });
        calcLines.push({ qty, price: px, discount_pct: 0, tax_rate: num(s.tax_value), incl: !!s.tax_inclusive_default });
        continue;
      }
      const it = items.get(l.id);
      if (!it) throw Error(`“${l.name || 'An item'}” is not on this device's item list yet. Connect once so the list can be copied here.`);
      if (it.active === false) throw Error(`“${it.name}” is no longer for sale. Remove it from the bill.`);
      const px = money(it.price), dp = num(it.default_discount);
      const gross = money(qty * px), disc = money(gross * dp / 100);
      if (it.track_stock && num(it.stock) - qty < 0 && !s.allow_negative_stock) {
        throw Error(`Only ${num(it.stock)} ${it.unit || 'pcs'} of “${it.name}” left in stock.`);
      }
      lines.push({ line_no: n, item_id: it.id, name: it.name, alias: it.alias || '', category: it.category || '',
        unit: it.unit || 'pcs', qty, price: px, gross, discount_pct: dp, discount: disc, line_total: money(gross - disc),
        cost_price: it.cost_price ?? null, custom: false, code: it.code || '', hsn: it.hsn || '',
        tax_rate: it.tax_rate ?? num(s.tax_value), incl: !!it.price_includes_tax });
      calcLines.push({ qty, price: px, discount_pct: dp, tax_rate: it.tax_rate ?? num(s.tax_value), incl: !!it.price_includes_tax });
    }

    const dv = num(args.p_discount_value);
    if (dv < 0) throw Error('A discount cannot be negative.');
    if (dv > 0 && !can('discount')) throw Error('You are not allowed to give discounts.');
    if (dv > 0 && args.p_discount_mode !== 'percent' && args.p_discount_mode !== 'amount') throw Error('Choose a discount type.');
    const t = CALC().bill(calcLines, s, {
      discount: { mode: args.p_discount_mode, value: dv }, canDiscount: dv > 0 && can('discount'),
      received: args.p_cash_received, cashOn: args.p_payment_method === 'Cash' && args.p_cash_received != null,
      canShort: can('short_cash'), maxShort: sys.limits?.max_short_amount ?? 0, isAdmin: !!args.__isAdmin
    });
    if (t.shortBlocked) throw Error(t.shortBlocked === 'max'
      ? `Cash is short by ${t.short.toFixed(2)}. You can accept at most ${num(sys.limits?.max_short_amount).toFixed(2)} less.`
      : t.shortBlocked);
    const maxd = sys.limits?.max_discount_percent ?? 100;
    if (!args.__isAdmin && t.sub > 0 && t.disc > money(t.sub * maxd / 100)) {
      throw Error(`A discount cannot be more than ${maxd} percent of the bill.`);
    }

    // Each line's own share of the tax, so a reprinted bill shows the same breakdown the
    // server would have stored.
    lines.forEach((l, i) => { l.tax = t.lines[i].tax; l.taxable = money(l.line_total - (t.lines[i].tax || 0)); });
    return { lines, t };
  }

  /* One bill, saved completely or not at all. */
  async function commitBill(args) {
    const device = await deviceId();
    const items = new Map((await DB().all('items', {})).map(i => [i.id, i]));
    const { lines, t } = price(args, items);

    // The screen already showed a total. If this device now works out a different one,
    // something changed — stop rather than save a bill the customer never saw.
    const shown = Number(args.p_expected_total);
    if (Number.isFinite(shown) && Math.abs(shown - t.final) > 0.011) {
      throw Error(`Prices or tax changed since this bill was started. The new total is ${t.final.toFixed(2)}. Check the bill and save it again.`);
    }

    const opId = args.p_request_id || uuid();
    const billId = opId;                                   // the bill and its operation share an id
    const createdAt = nowISO();
    const s = args.__settings || {};
    const day = dayIn(s.timezone || 'Asia/Kolkata');
    const extra = args.p_extra || {};
    const rec = Number(args.p_cash_received);

    return DB().tx(['meta', 'bills', 'bill_items', 'stock_moves', 'items', 'outbox'], async h => {
      const already = await h.get('bills', billId);
      if (already) return already;                         // the same save pressed twice

      // Everything below stays inside this one transaction: opening another one — even only to
      // read a setting — makes the browser close this one underneath us.
      const row = await h.get('meta', 'bill_block');
      const taken = takeNumber(row ? row.v : { ...EMPTY_BLOCK }, device);
      await metaSetIn(h, 'bill_block', taken.block);

      const bill = {
        id: billId, request_id: opId, op_id: opId, device_id: device,
        bill_no: taken.no, seq: taken.seq, bill_provisional: taken.provisional,
        bill_day: day, created_at: createdAt, status: 'Paid', kind: 'sale',
        cashier_name: args.__cashier || '',
        customer_name: String(args.p_customer_name || '').trim().slice(0, 80),
        customer_phone: String(args.p_customer_phone || '').trim().slice(0, 20),
        customer_address: String(extra.customer_address || '').trim().slice(0, 200),
        custom_fields: Array.isArray(extra.custom_fields) ? extra.custom_fields : [],
        notes: String(args.p_notes || '').trim().slice(0, 300),
        items: lines, items_subtotal: t.sub,
        discount_mode: t.disc > 0 ? args.p_discount_mode : null,
        discount_value: t.disc > 0 ? num(args.p_discount_value) : 0, discount_amount: t.disc,
        tax_enabled: !!s.tax_enabled, tax_mode: s.tax_enabled ? s.tax_mode : null,
        tax_value: s.tax_enabled ? num(s.tax_value) : 0, tax_label: s.tax_label || 'Tax',
        tax_amount: t.tax, tax_scope: s.tax_scope || 'bill', tax_split: !!s.tax_split,
        tax_breakdown: t.breakdown || [], tax_extra: t.extra,
        round_off: t.round, less_amount: t.less, total: t.final,
        cash_received: Number.isFinite(rec) && rec > 0 && args.p_payment_method === 'Cash' ? money(rec) : null,
        change_amount: t.change, payment_method: args.p_payment_method,
        cancelled_at: null, cancel_reason: '', member_id: null,
        sync_state: 'pending', stock_updates: []
      };

      for (const l of lines) {
        await h.put('bill_items', { id: billId + ':' + l.line_no, bill_id: billId, ...l });
      }

      // Stock comes down here and the same change is written to the ledger, so when this bill
      // reaches the server it is added to whatever the other devices sold, never on top of it.
      for (const l of lines) {
        if (l.custom || !l.item_id) continue;
        const it = await h.get('items', l.item_id);
        if (!it || !it.track_stock) continue;
        const after = Math.max(0, money(num(it.stock) - l.qty));
        await h.put('items', { ...it, stock: after, updated_at: createdAt });
        await h.put('stock_moves', { id: billId + ':' + l.item_id, item_id: l.item_id, item_name: it.name,
          change: -l.qty, balance: after, reason: 'sale', bill_id: billId, bill_no: bill.bill_no, note: '',
          device_id: device, created_at: createdAt, op_id: opId, sync_state: 'with_bill' });
        bill.stock_updates.push({ id: l.item_id, stock: after });
      }

      await h.put('bills', bill);
      await h.put('outbox', {
        op_id: opId, kind: 'bill.create', state: 'pending', tries: 0, created_at: createdAt, next_try_at: createdAt, error: '',
        payload: {
          bill_no: bill.bill_no, seq: bill.seq, created_at: createdAt, bill_day: day,
          cashier_name: bill.cashier_name, customer_name: bill.customer_name, customer_phone: bill.customer_phone,
          customer_address: bill.customer_address, custom_fields: bill.custom_fields, notes: bill.notes,
          items: lines, items_subtotal: bill.items_subtotal,
          discount_mode: bill.discount_mode, discount_value: bill.discount_value, discount_amount: bill.discount_amount,
          tax_enabled: bill.tax_enabled, tax_mode: bill.tax_mode, tax_value: bill.tax_value, tax_label: bill.tax_label,
          tax_amount: bill.tax_amount, tax_scope: bill.tax_scope, tax_split: bill.tax_split,
          tax_breakdown: bill.tax_breakdown, tax_extra: bill.tax_extra,
          round_off: bill.round_off, less_amount: bill.less_amount, total: bill.total,
          cash_received: bill.cash_received, change_amount: bill.change_amount,
          payment_method: bill.payment_method, kind: 'sale'
        }
      });
      return bill;
    });
  }

  /* ---------- stock changed by hand ---------- */
  async function adjustStock({ item_id, mode, qty, note = '' }) {
    const device = await deviceId(), opId = uuid(), at = nowISO();
    const n = Number(qty);
    if (!['set', 'in', 'out'].includes(mode) || !Number.isFinite(n) || n < 0) throw Error('Choose a valid stock change.');
    return DB().tx(['items', 'stock_moves', 'outbox'], async h => {
      const it = await h.get('items', item_id);
      if (!it) throw Error('Open Items once with internet before changing stock here.');
      const before = num(it.stock);
      const after = mode === 'set' ? money(n) : mode === 'in' ? money(before + n) : money(before - n);
      if (after < 0 || after > 1000000) throw Error('Stock must be between 0 and 1000000.');
      const change = money(after - before);
      const reason = !it.track_stock ? 'opening' : mode === 'set' ? 'set' : mode === 'in' ? 'stock_in' : 'stock_out';
      const next = { ...it, stock: after, track_stock: true, updated_at: at };
      await h.put('items', next);
      await h.put('stock_moves', { id: opId, item_id, item_name: it.name, change, balance: after, reason,
        bill_id: null, bill_no: '', note: String(note).slice(0, 200), device_id: device, created_at: at,
        op_id: opId, sync_state: change === 0 ? 'synced' : 'pending' });
      if (change !== 0) await h.put('outbox', { op_id: opId, kind: 'stock.move', state: 'pending', tries: 0,
        created_at: at, next_try_at: at, error: '',
        payload: { item_id, change, reason, note: String(note).slice(0, 200) } });
      return next;
    });
  }

  /* ---------- reading back what this device holds ---------- */
  async function bills({ from, to, status = 'all', payment = 'all', query = '', offset = 0, limit = 50, kind = 'all' }) {
    const all = (await DB().all('bills', { index: 'bill_day', from, to }))
      .filter(b => !kind || kind === 'all' || (kind === 'membership' ? b.kind === 'membership' : b.kind !== 'membership'));
    all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const q = String(query || '').trim().toLowerCase();
    const hit = all.filter(b =>
      (status === 'all' || !status || b.status === status) &&
      (payment === 'all' || !payment || b.payment_method === payment) &&
      (!q || [b.bill_no, b.customer_name, b.customer_phone].join(' ').toLowerCase().includes(q)));
    const paid = all.filter(b => b.status === 'Paid');
    const sum = (xs, f = () => true) => money(xs.filter(f).reduce((n, b) => n + num(b.total), 0));
    return { from, to, offline: true, total: hit.length, rows: hit.slice(offset, offset + limit),
      summary: { bills: paid.length, sales: sum(paid), cash: sum(paid, b => b.payment_method === 'Cash'),
        upi: sum(paid, b => b.payment_method === 'UPI'), card: sum(paid, b => b.payment_method === 'Card'),
        cancelled: all.filter(b => b.status === 'Cancelled').length } };
  }

  async function dashboard({ from, to }) {
    const inRange = await DB().all('bills', { index: 'bill_day', from, to });
    const paid = inRange.filter(b => b.status === 'Paid');
    const cancelled = inRange.filter(b => b.status === 'Cancelled');
    const items = new Map((await DB().all('items', {})).map(i => [i.id, i]));
    const sales = money(paid.reduce((n, b) => n + num(b.total), 0));
    const top = new Map(), trend = new Map(), pay = new Map(), cat = new Map();
    let qty = 0, costed = 0, costedRevenue = 0, allRevenue = 0;
    const oneDay = from === to;
    for (const b of paid) {
      const key = oneDay ? String(new Date(b.created_at).getHours()) : b.bill_day;
      const cell = trend.get(key) || { key: oneDay ? Number(key) : key, sales: 0, bills: 0 };
      cell.sales = money(cell.sales + num(b.total)); cell.bills++; trend.set(key, cell);
      const m = b.payment_method || 'Cash';
      const p = pay.get(m) || { method: m, bills: 0, amount: 0 };
      p.bills++; p.amount = money(p.amount + num(b.total)); pay.set(m, p);
      for (const l of b.items || []) {
        qty += num(l.qty); allRevenue = money(allRevenue + num(l.line_total));
        const t = top.get(l.name) || { name: l.name, unit: l.unit || 'pcs', qty: 0, revenue: 0, bills: 0 };
        t.qty += num(l.qty); t.revenue = money(t.revenue + num(l.line_total)); t.bills++; top.set(l.name, t);
        const cname = l.category || (items.get(l.item_id) || {}).category || 'Extra items';
        const c = cat.get(cname) || { category: cname, revenue: 0, qty: 0 };
        c.qty += num(l.qty); c.revenue = money(c.revenue + num(l.line_total)); cat.set(cname, c);
        if (l.cost_price != null) { costed = money(costed + (num(l.line_total) - num(l.cost_price) * num(l.qty))); costedRevenue = money(costedRevenue + num(l.line_total)); }
      }
    }
    const low = [...items.values()].filter(i => i.active !== false && i.track_stock && num(i.stock) <= num(i.low_stock_at))
      .sort((a, b) => num(a.stock) - num(b.stock)).slice(0, 15)
      .map(i => ({ id: i.id, name: i.name, unit: i.unit || 'pcs', stock: num(i.stock), low_stock_at: num(i.low_stock_at) }));
    const trendRows = oneDay
      ? Array.from({ length: 24 }, (_, h) => trend.get(String(h)) || { key: h, sales: 0, bills: 0 })
      : [...trend.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
    return { from, to, offline: true,
      metrics: { sales, bills: paid.length, avg_bill: paid.length ? money(sales / paid.length) : 0, qty,
        discount: money(paid.reduce((n, b) => n + num(b.discount_amount) + num(b.less_amount), 0)),
        tax: money(paid.reduce((n, b) => n + num(b.tax_amount), 0)),
        profit: costed, profit_cover: allRevenue > 0 ? Math.round(1000 * costedRevenue / allRevenue) / 10 : 100,
        cancelled: cancelled.length, cancelled_value: money(cancelled.reduce((n, b) => n + num(b.total), 0)),
        prev_sales: 0, prev_bills: 0, prev_available: false,
        expenses_on: false, expenses: 0, expenses_in_profit: false,
        members_on: false, membership_sales: 0 },
      expense_heads: [], members: null,
      payments: [...pay.values()].sort((a, b) => b.amount - a.amount),
      trend: trendRows, trend_unit: oneDay ? 'hour' : 'day',
      top_items: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      categories: [...cat.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 12),
      low_stock: low,
      recent: paid.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8)
        .map(b => ({ id: b.id, bill_no: b.bill_no, created_at: b.created_at, customer_name: b.customer_name,
          total: b.total, payment_method: b.payment_method })) };
  }

  const stockMoves = async ({ item_id = null, offset = 0, limit = 50 }) => {
    const rows = (await DB().all('stock_moves', { index: 'created_at', desc: true }))
      .filter(m => !item_id || m.item_id === item_id);
    return { total: rows.length, offline: true,
      rows: rows.slice(offset, offset + limit).map(m => ({ created_at: m.created_at, item_id: m.item_id,
        item_name: m.item_name || '', reason: m.reason, change: m.change, balance: m.balance,
        bill_no: m.bill_no || '', note: m.note || '', actor_name: 'This device' })) };
  };

  /* ---------- what the server changed while this device was away ---------- */
  async function applyChanges(changes) {
    if (!changes || !changes.length) return 0;
    let n = 0;
    await DB().tx(['items', 'categories', 'bills', 'meta'], async h => {
      for (const c of changes) {
        const d = c.data || {};
        if (c.kind === 'category') {
          if (c.deleted) await h.del('categories', c.row_id);
          else await h.put('categories', { ...d, name: d.name, sort_order: num(d.sort) || num(d.sort_order) });
          n++;
        } else if (c.kind === 'item') {
          if (c.deleted) await h.del('items', c.row_id);
          else {
            const was = await h.get('items', d.id);
            // A sale this device has made but not yet sent is already off its own copy of the
            // stock, so the server's figure is only taken once the bill has gone up.
            await h.put('items', { ...(was || {}), ...d, id: d.id });
          }
          n++;
        } else if (c.kind === 'bill' && !c.deleted) {
          // A bill this device took is already here under its own id, so it is found by its
          // number and updated in place. Storing it again under the server's id would show the
          // same bill twice in Records.
          const mine = d.bill_no ? (await h.all('bills', { index: 'bill_no', equals: d.bill_no }))[0] : null;
          const was = mine || await h.get('bills', d.id);
          if (was && was.sync_state === 'pending') continue;   // ours, still on its way up
          await h.put('bills', { ...(was || {}), ...d, id: was ? was.id : d.id,
            server_id: d.id, sync_state: 'synced' });
          n++;
        }
      }
    });
    return n;
  }

  /* ---------- the outbox ---------- */
  const pending = () => DB().all('outbox', { index: 'state', equals: 'pending' });
  const failed = () => DB().all('outbox', { index: 'state', equals: 'failed' });
  const counts = async () => ({ pending: (await pending()).length, failed: (await failed()).length });
  async function conflict(row) { await DB().put('conflicts', { id: row.id || uuid(), created_at: nowISO(), seen: 0, ...row }); }

  return { uuid, money, nowISO, dayIn, metaGet, metaSet, deviceId, shortId, pad,
    blockState, takeNumber, numbersLeft,
    saveCatalogue, catalogue, price, commitBill, adjustStock,
    bills, dashboard, stockMoves, applyChanges,
    pending, failed, counts, conflict };
})();
if (typeof module !== 'undefined') module.exports = LocalRepo;
