/* What the till knows and does on its own, with or without internet.
   Everything a bill touches — the bill, its lines, the stock it uses and the note telling the
   server about it — is written in ONE transaction. If any part of it fails, none of it happened,
   and the screen never says "saved" until the device has really saved it. */
'use strict';
const LocalRepo = (() => {
  const DB = () => LocalDB;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const money = n => Math.round((Number(n) || 0) * 100) / 100;
  const nowISO = () => new Date().toISOString();
  const dayIn = (tz = 'Asia/Kolkata', d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);

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

  /* ---------- invoice numbers that stay unique with no internet ----------
     The server hands this device a block of numbers in advance (say 101–200) and moves the
     year's counter past them, so no other device and no online bill can ever use the same
     number. Offline, bills take the next number from the block.
     If the block runs out while still offline the bill is NOT blocked — money comes first —
     it is given a clearly marked number carrying this device's tag, which stays unique and is
     never quietly renumbered afterwards. */
  const pad = (n, digits) => { const s = String(n); return s.length >= digits ? s : s.padStart(digits, '0'); };
  async function invoiceState() {
    return (await metaGet('invoice_block')) || { prefix: 'INV', digits: 3, year: '', start: 0, end: -1, next: 0, fallback: 0 };
  }
  function takeInvoice(block, device) {
    if (block.next <= block.end && block.end > 0) return { no: block.prefix + pad(block.next, block.digits), block: { ...block, next: block.next + 1 }, provisional: false };
    const n = (block.fallback || 0) + 1;
    return { no: `${block.prefix}-${shortId(device)}-${pad(n, 4)}`, block: { ...block, fallback: n }, provisional: true };
  }
  const invoiceLeft = b => (b.end >= b.start && b.next <= b.end) ? (b.end - b.next + 1) : 0;

  /* ---------- the catalogue, kept locally so billing never waits for the network ---------- */
  async function saveCatalogue(items, categories) {
    await DB().tx(['items', 'categories', 'meta'], async h => {
      for (const i of items) await h.put('items', i);
      if (Array.isArray(categories)) {
        let n = 0;
        for (const c of categories) await h.put('categories', { name: typeof c === 'string' ? c : c.name, sort_order: n++ });
      }
      await metaSetIn(h, 'catalogue_at', nowISO());
    });
  }
  const catalogue = async () => ({
    items: await DB().all('items', { index: 'name' }),
    categories: (await DB().all('categories', { index: 'sort_order' })).map(c => c.name)
  });

  /* ---------- the bill ---------- */
  /* Works out one bill exactly the way the server does, so the figure on the screen, the figure
     on the printed receipt and the figure that reaches the server are the same figure. */
  function price(args, items) {
    const lines = [];
    for (const raw of args.p_items || []) {
      const qty = Number(raw.qty);
      if (!Number.isFinite(qty) || qty <= 0) throw Error('Every line needs a quantity.');
      if (raw.custom) {
        lines.push({ id: null, size: null, custom: true, name: String(raw.name || 'Item').slice(0, 120), unit: raw.unit || 'pcs', qty, price: money(raw.price) });
        continue;
      }
      const it = items.get(raw.id);
      if (!it) throw Error(`“${raw.name || 'An item'}” is not in this device's item list yet. Connect once so the list can be copied here.`);
      if (it.active === false) throw Error(`“${it.name}” is not for sale.`);
      let menuId = raw.id, size = null;
      try { const p = JSON.parse(raw.id); if (Array.isArray(p)) { menuId = p[0]; size = p[1] || null; } } catch { /* a plain id */ }
      lines.push({ id: menuId, size, item_id: raw.id, custom: false, name: it.name, unit: it.unit || 'pcs', qty, price: money(it.price) });
    }
    if (!lines.length) throw Error('This bill has no items.');
    const subtotal = money(lines.reduce((n, l) => n + l.qty * l.price, 0));
    const dv = Number(args.p_discount_value) || 0;
    let discount = 0;
    if (dv > 0) discount = args.p_discount_mode === 'amount' ? Math.min(money(dv), subtotal) : money(subtotal * Math.min(dv, 100) / 100);
    const taxable = money(subtotal - discount);
    const s = args.__settings || {};
    const tax = s.tax_enabled ? (s.tax_mode === 'fixed' ? (taxable > 0 ? money(s.tax_value) : 0) : money(taxable * (Number(s.tax_value) || 0) / 100)) : 0;
    let total = money(taxable + tax), short = 0;
    const rec = Number(args.p_cash_received) || 0;
    if (args.p_payment_method === 'Cash' && rec > 0 && rec < total) { short = money(total - rec); total = money(rec); }
    return { lines, subtotal, discount, tax, total, short, change: rec > total ? money(rec - total) : 0 };
  }

  /* One bill, saved completely or not at all. */
  async function commitBill(args) {
    const device = await deviceId();
    const items = new Map((await DB().all('items', {})).map(i => [i.id, i]));
    const t = price(args, items);

    // The screen already showed a total. If this device works out a different one, something is
    // wrong — stop rather than save a bill that does not match the receipt the customer saw.
    const shown = Number(args.p_expected_total);
    if (Number.isFinite(shown) && Math.abs(shown - t.total) > 0.05) {
      throw Error(`This bill now adds up to ${t.total.toFixed(2)}, not ${shown.toFixed(2)}. Check the bill and save it again.`);
    }

    const opId = args.p_request_id || uuid();
    const billId = opId;                                  // the bill and its operation share an id
    const createdAt = nowISO();
    const tz = args.__settings?.timezone || 'Asia/Kolkata';
    const day = dayIn(tz);

    return DB().tx(['meta', 'bills', 'bill_items', 'stock_moves', 'items', 'outbox'], async h => {
      const existing = await h.get('bills', billId);
      if (existing) return existing;                      // the same save pressed twice

      // Everything in here must stay inside this one transaction: opening another one
      // (even just to read a setting) makes the browser close this one underneath us.
      const blockRow = await h.get('meta', 'invoice_block');
      const block = blockRow ? blockRow.v : { prefix: 'INV', digits: 3, year: '', start: 0, end: -1, next: 0, fallback: 0 };
      const inv = takeInvoice(block, device);
      await metaSetIn(h, 'invoice_block', inv.block);

      const bill = {
        id: billId, op_id: opId, device_id: device,
        invoice_no: inv.no, invoice_provisional: inv.provisional,
        bill_no: inv.no, order_no: null, order_id: null,
        bill_day: day, created_at: createdAt,
        status: 'Paid', order_source: 'manual', table_number: 'Counter',
        cashier_name: args.__cashier || 'Counter',
        customer_name: String(args.p_customer_name || '').slice(0, 80),
        customer_phone: String(args.p_customer_phone || '').slice(0, 20),
        notes: String(args.p_notes || '').slice(0, 300),
        items: t.lines.map(l => ({ ...l, item_id: l.item_id || null, line_total: money(l.qty * l.price), subtotal: money(l.qty * l.price) })),
        items_subtotal: t.subtotal,
        discount_amount: money(t.discount + t.short), bill_discount: t.discount, short_amount: t.short,
        tax_amount: t.tax, round_off: 0, total: t.total,
        cash_received: Number(args.p_cash_received) || null, change_amount: t.change,
        native_payment_method: args.p_payment_method === 'Cash' ? 'Cash' : 'Online',
        payment_method: args.p_payment_method === 'Cash' ? 'Cash' : 'UPI',
        sync_state: 'pending', stock_updates: []
      };

      for (const [n, l] of bill.items.entries()) {
        await h.put('bill_items', { id: billId + ':' + n, bill_id: billId, name: l.name, qty: l.qty, price: l.price, line_total: l.line_total, item_id: l.item_id, custom: !!l.custom });
      }

      // Stock comes down here and the same change is written to the ledger, so when this bill
      // reaches the server it is added to whatever the other devices sold, never on top of it.
      for (const l of bill.items) {
        if (l.custom || !l.item_id) continue;
        const it = await h.get('items', l.item_id);
        if (!it || !it.track_stock) continue;
        const before = Number(it.stock) || 0, after = Math.max(0, before - Math.ceil(l.qty));
        await h.put('items', { ...it, stock: after });
        await h.put('stock_moves', { id: billId + ':' + l.item_id, item_id: l.item_id, menu_id: l.id, variant: l.size || 'single',
          change: -Math.ceil(l.qty), balance_after: after, reason: 'sale', ref: inv.no, device_id: device,
          created_at: createdAt, op_id: opId, sync_state: 'with_bill' });
        bill.stock_updates.push({ id: l.item_id, stock: after });
      }

      await h.put('bills', bill);
      await h.put('outbox', {
        op_id: opId, kind: 'bill.create', state: 'pending', tries: 0, created_at: createdAt, next_try_at: createdAt, error: '',
        payload: {
          invoice_no: bill.invoice_no, customer_name: bill.customer_name, notes: bill.notes,
          payment_method: bill.native_payment_method, bill_day: bill.bill_day, created_at: createdAt,
          items: bill.items.map(l => ({ id: l.id, size: l.size, custom: !!l.custom, name: l.name, qty: l.qty, price: l.price })),
          discount_amount: bill.discount_amount, tax_amount: bill.tax_amount, total: bill.total
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
      if (!it) throw Error('Reload Items before changing stock.');
      const before = Number(it.stock) || 0;
      const after = mode === 'set' ? Math.round(n) : mode === 'in' ? before + Math.round(n) : before - Math.round(n);
      if (after < 0 || after > 1000000) throw Error('Stock must be a whole quantity from 0 to 1000000.');
      const change = after - before;
      const next = { ...it, stock: after, track_stock: true };
      await h.put('items', next);
      let menuId = item_id, size = null;
      try { const p = JSON.parse(item_id); if (Array.isArray(p)) { menuId = p[0]; size = p[1] || null; } } catch { /* plain id */ }
      await h.put('stock_moves', { id: opId, item_id, menu_id: menuId, variant: size || 'single', change, balance_after: after,
        reason: !it.track_stock ? 'opening' : mode === 'in' ? 'stock_in' : mode === 'out' ? 'stock_out' : 'set',
        ref: '', note: String(note).slice(0, 200), device_id: device, created_at: at, op_id: opId, sync_state: 'pending' });
      if (change !== 0) await h.put('outbox', { op_id: opId, kind: 'stock.move', state: 'pending', tries: 0, created_at: at, next_try_at: at, error: '',
        payload: { menu_id: menuId, variant: size || 'single', change, reason: mode === 'set' ? 'set' : mode === 'in' ? 'stock_in' : 'stock_out', ref: '' } });
      return next;
    });
  }

  /* ---------- reading back what this device holds ---------- */
  async function bills({ from, to, status = 'all', payment = 'all', query = '', offset = 0, limit = 50 }) {
    const all = await DB().all('bills', { index: 'bill_day', from, to });
    all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const q = String(query || '').trim().toLowerCase();
    const hit = all.filter(b =>
      (status === 'all' || !status || b.status === status) &&
      (payment === 'all' || !payment || b.payment_method === payment) &&
      (!q || [b.bill_no, b.invoice_no, b.customer_name, '#' + (b.order_no || ''), b.table_number].join(' ').toLowerCase().includes(q)));
    const paid = all.filter(b => b.status !== 'Cancelled');
    const sum = (xs, f = () => true) => money(xs.filter(f).reduce((n, b) => n + Number(b.total || 0), 0));
    return { from, to, total: hit.length, rows: hit.slice(offset, offset + limit),
      summary: { sales: sum(paid), bills: paid.length, cancelled: all.length - paid.length,
        cash: sum(paid, b => b.payment_method === 'Cash'), upi: sum(paid, b => b.payment_method === 'UPI'), card: 0 } };
  }

  async function dashboard({ from, to }) {
    const all = (await DB().all('bills', { index: 'bill_day', from, to })).filter(b => b.status !== 'Cancelled');
    const sales = money(all.reduce((n, b) => n + Number(b.total || 0), 0));
    const top = new Map(), trend = new Map(), pay = new Map(), cat = new Map();
    const items = new Map((await DB().all('items', {})).map(i => [i.id, i]));
    let qty = 0;
    for (const b of all) {
      trend.set(b.bill_day, money((trend.get(b.bill_day) || 0) + Number(b.total)));
      const m = b.payment_method || 'Cash';
      pay.set(m, { method: m, amount: money((pay.get(m)?.amount || 0) + Number(b.total)), bills: (pay.get(m)?.bills || 0) + 1 });
      for (const l of b.items || []) {
        qty += Number(l.qty) || 0;
        const t = top.get(l.name) || { name: l.name, unit: l.unit || 'pcs', qty: 0, revenue: 0 };
        t.qty += Number(l.qty) || 0; t.revenue = money(t.revenue + Number(l.line_total || 0)); top.set(l.name, t);
        const c = (items.get(l.item_id) || {}).category || 'Other';
        const e = cat.get(c) || { category: c, name: c, qty: 0, revenue: 0 };
        e.qty += Number(l.qty) || 0; e.revenue = money(e.revenue + Number(l.line_total || 0)); e.sales = e.revenue; cat.set(c, e);
      }
    }
    const low = [...items.values()].filter(i => i.track_stock && Number(i.stock) <= (Number(i.low_stock_at) || 5))
      .sort((a, b) => a.stock - b.stock).slice(0, 20).map(i => ({ id: i.id, name: i.name, stock: Number(i.stock) || 0, low_stock_at: Number(i.low_stock_at) || 5, unit: i.unit || 'pcs' }));
    const label = k => new Date(k + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { from, to, offline: true,
      metrics: { sales, bills: all.length, cancelled: 0, cancelled_value: 0, avg_bill: all.length ? money(sales / all.length) : 0,
        qty, discount: money(all.reduce((n, b) => n + Number(b.discount_amount || 0), 0)), tax: money(all.reduce((n, b) => n + Number(b.tax_amount || 0), 0)),
        profit: 0, profit_available: false, profit_cover: 0, expenses_on: false, expenses: 0, expenses_in_profit: false, prev_available: false, prev_sales: 0 },
      trend_unit: 'day', trend: [...trend].sort().map(([k, v]) => ({ key: k, label: label(k), sales: v })),
      payments: ['Cash', 'UPI'].map(m => pay.get(m) || { method: m, amount: 0, bills: 0 }),
      top_items: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      categories: [...cat.values()].sort((a, b) => b.revenue - a.revenue),
      expense_heads: [], low_stock: low,
      recent: (await DB().all('bills', { index: 'created_at', desc: true, limit: 8 })) };
  }

  const stockMoves = async ({ item_id = null, offset = 0, limit = 50 }) => {
    const rows = (await DB().all('stock_moves', { index: 'created_at', desc: true }))
      .filter(m => !item_id || m.item_id === item_id);
    return { total: rows.length, rows: rows.slice(offset, offset + limit).map(m => ({ created_at: m.created_at, ref: m.item_id, item_name: m.item_name || '', reason: m.reason, change: m.change, balance: m.balance_after, note: m.note || '', actor_name: 'This device' })) };
  };

  /* ---------- what the server told us while we were away ---------- */
  async function applyChanges(changes) {
    if (!changes.length) return 0;
    let n = 0;
    await DB().tx(['items', 'categories', 'bills', 'meta'], async h => {
      for (const c of changes) {
        const d = c.data || {};
        if (c.kind === 'category') { c.deleted ? await h.del('categories', c.row_id) : await h.put('categories', { name: d.name, sort_order: Number(d.sort_order) || 0 }); n++; }
        else if (c.kind === 'item') {
          if (c.deleted) { for (const row of await h.all('items', {})) if (String(row.menu_id || row.id) === c.row_id || String(row.id).includes(`"${c.row_id}"`)) await h.del('items', row.id); }
          else {
            // keep the local shape: the id used by the screens is [menu id, portion]
            const id = JSON.stringify([d.id, null]);
            const was = await h.get('items', id);
            await h.put('items', { ...(was || {}), id, menu_id: d.id, name: d.name, category: d.category, price: Number(d.price),
              description: d.description || '', image: d.image || '', active: d.available !== false, unit: was?.unit || 'pcs',
              track_stock: was?.track_stock || false, stock: was?.stock || 0, low_stock_at: was?.low_stock_at || 0, updated_at: d.updated_at });
          }
          n++;
        } else if (c.kind === 'stock' && !c.deleted) {
          const id = JSON.stringify([d.menu_id, d.variant === 'single' ? null : d.variant]);
          const was = await h.get('items', id);
          if (was) { await h.put('items', { ...was, track_stock: !!d.tracked, stock: Number(d.remaining) || 0 }); n++; }
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

  return { uuid, money, nowISO, dayIn, metaGet, metaSet, deviceId, shortId,
    invoiceState, takeInvoice, invoiceLeft, pad,
    saveCatalogue, catalogue, price, commitBill, adjustStock,
    bills, dashboard, stockMoves, applyChanges,
    pending, failed, counts, conflict };
})();
if (typeof module !== 'undefined') module.exports = LocalRepo;
