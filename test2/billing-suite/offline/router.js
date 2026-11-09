/* Where each request goes.
   The screens are untouched: they still call Cloud.rpc(...). This decides, for each call,
   whether the device answers it, the server answers it, or the person is told plainly that
   this particular thing needs internet.

   Taking payment is always answered by the device first, online or not. That is what makes a
   bill instant, and it is why a flaky connection can never produce a half-saved bill. */
'use strict';
const OfflineMode = (() => {
  const R = () => LocalRepo;

  /* Saved on the device, then sent on. Taking payment must never wait for a network. */
  const LOCAL_FIRST = new Set(['shop_create_bill']);
  /* Done on the server while there is internet — it keeps the shared stock history and the
     server's own version checks — and on the device only when there is none. */
  const SERVER_PREFERRED = new Set(['shop_stock_adjust']);
  /* Answered by the server when there is internet, by the device when there is not. */
  const LOCAL_READ = new Set(['shop_me', 'shop_items_list', 'shop_bills_list', 'shop_dashboard', 'shop_stock_moves_list']);
  /* Everything else needs the server. Each gets a plain reason rather than a dead button. */
  const NEEDS_NET = {
    shop_settings_save: 'Shop settings', shop_system_save: 'These settings', shop_billing_options_save: 'Billing settings',
    shop_invoice_save: 'Invoice numbering', shop_limits_save: 'Limits', shop_item_delete: 'Deleting a dish',
    shop_items_delete_all: 'Deleting everything', shop_items_import: 'Importing items', shop_category_delete: 'Deleting a category',
    shop_record_payment_save: 'Recording a QR payment', shop_reset_bills: 'Deleting all bills', shop_app_icon_save: 'The app icon',
    shop_staff_phones: 'Staff phone numbers', shop_expenses_list: 'Expenses', shop_expense_save: 'Expenses',
    shop_expense_delete: 'Expenses', shop_expense_auto_save: 'Monthly expenses', shop_expense_auto_delete: 'Monthly expenses',
    shop_expense_head_save: 'Expense types', shop_expense_head_delete: 'Expense types', shop_invoice_get: 'Invoice numbering'
  };

  let base = null, cloud = null, settings = () => ({}), cashier = () => 'Counter', ready = false;
  const online = () => navigator.onLine !== false && SyncEngine.state().online !== false;
  const offlineError = what => Object.assign(Error(`${what} can only be changed with internet. The till keeps working — bills you take now are saved here and sent on by themselves.`), { code: 'OFFLINE' });

  /* ---------- keeping the device's copy fresh whenever the server answers ---------- */
  async function cacheFromServer(name, result) {
    try {
      if (name === 'shop_items_list' && result?.items) await R().saveCatalogue(result.items, result.categories);
      if (name === 'shop_me' && result) await R().metaSet('me', result);
    } catch { /* a full disk must never break a working screen */ }
  }

  /* ---------- bills this device has taken but not yet sent ---------- */
  const unsent = async (from, to) => (await LocalDB.all('bills', { index: 'bill_day', from, to })).filter(b => b.sync_state !== 'synced' && b.sync_state !== 'abandoned');
  const money = n => Math.round((Number(n) || 0) * 100) / 100;

  function mergeBills(serverList, local) {
    if (!local.length) return serverList;
    const seen = new Set(serverList.rows.map(r => r.invoice_no || r.bill_no));
    const extra = local.filter(b => !seen.has(b.invoice_no)).map(b => ({ ...b, not_sent_yet: true }));
    const rows = [...extra, ...serverList.rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const s = serverList.summary || {};
    return { ...serverList, rows: rows.slice(0, serverList.rows.length + extra.length), total: Number(serverList.total || 0) + extra.length,
      summary: { ...s, sales: money(Number(s.sales || 0) + extra.reduce((n, b) => n + Number(b.total || 0), 0)),
        bills: Number(s.bills || 0) + extra.length,
        cash: money(Number(s.cash || 0) + extra.filter(b => b.payment_method === 'Cash').reduce((n, b) => n + Number(b.total || 0), 0)),
        upi: money(Number(s.upi || 0) + extra.filter(b => b.payment_method === 'UPI').reduce((n, b) => n + Number(b.total || 0), 0)) },
      unsent: extra.length };
  }
  function mergeDashboard(d, local) {
    if (!local.length) return d;
    const m = { ...d.metrics };
    const add = local.reduce((n, b) => n + Number(b.total || 0), 0);
    m.sales = money(Number(m.sales || 0) + add);
    m.bills = Number(m.bills || 0) + local.length;
    m.qty = Number(m.qty || 0) + local.reduce((n, b) => n + (b.items || []).reduce((q, l) => q + Number(l.qty || 0), 0), 0);
    m.discount = money(Number(m.discount || 0) + local.reduce((n, b) => n + Number(b.discount_amount || 0), 0));
    m.tax = money(Number(m.tax || 0) + local.reduce((n, b) => n + Number(b.tax_amount || 0), 0));
    m.avg_bill = m.bills ? money(m.sales / m.bills) : 0;
    const trend = new Map((d.trend || []).map(t => [t.key, { ...t }]));
    for (const b of local) { const t = trend.get(b.bill_day) || { key: b.bill_day, label: b.bill_day, sales: 0 }; t.sales = money(t.sales + Number(b.total)); trend.set(b.bill_day, t); }
    const pay = new Map((d.payments || []).map(p => [p.method, { ...p }]));
    for (const b of local) { const k = b.payment_method || 'Cash'; const p = pay.get(k) || { method: k, amount: 0, bills: 0 }; p.amount = money(p.amount + Number(b.total)); p.bills++; pay.set(k, p); }
    const top = new Map((d.top_items || []).map(t => [t.name, { ...t }]));
    for (const b of local) for (const l of b.items || []) { const t = top.get(l.name) || { name: l.name, unit: l.unit || 'pcs', qty: 0, revenue: 0 }; t.qty += Number(l.qty) || 0; t.revenue = money(t.revenue + Number(l.line_total || 0)); top.set(l.name, t); }
    return { ...d, metrics: m, unsent: local.length,
      trend: [...trend.values()].sort((a, b) => String(a.key).localeCompare(String(b.key))),
      payments: [...pay.values()], top_items: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10) };
  }

  /* ---------- the router ---------- */
  async function route(name, args = {}, opts = {}) {
    if (!ready) return base(name, args);
    if (opts.forceOnline) return base(name, args);

    if (LOCAL_FIRST.has(name)) {
      if (name === 'shop_create_bill') {
        const bill = await R().commitBill({ ...args, __settings: settings(), __cashier: cashier() });
        SyncEngine.refreshCounts(); if (online()) SyncEngine.syncNow({ quiet: true });
        return bill;
      }
    }

    if (SERVER_PREFERRED.has(name)) {
      if (online()) {
        try { const item = await base(name, args); try { await LocalDB.put('items', item); } catch { /* cache only */ } return item; }
        catch (e) { if (!isNet(e)) throw e; SyncEngine.state().online = false; }
      }
      const item = await R().adjustStock({ item_id: args.p_item_id, mode: args.p_mode, qty: args.p_qty, note: args.p_note });
      SyncEngine.refreshCounts();
      return item;
    }

    if (LOCAL_READ.has(name)) {
      if (online()) {
        try {
          const r = await base(name, args);
          cacheFromServer(name, r);
          if (name === 'shop_bills_list') return mergeBills(r, await unsent(args.p_from, args.p_to));
          if (name === 'shop_dashboard') return mergeDashboard(r, await unsent(args.p_from, args.p_to));
          if (name === 'shop_stock_moves_list') {
            const mine = (await LocalDB.all('stock_moves', { index: 'sync_state', equals: 'pending' })).filter(m => !args.p_item_id || m.item_id === args.p_item_id);
            if (!mine.length) return r;
            const extra = mine.map(m => ({ created_at: m.created_at, ref: m.item_id, item_name: m.item_name || '', reason: m.reason, change: m.change, balance: m.balance_after, note: m.note || '', actor_name: 'This device · not sent yet' }));
            return { ...r, total: Number(r.total || 0) + extra.length, rows: [...extra, ...(r.rows || [])] };
          }
          return r;
        } catch (e) {
          if (!isNet(e)) throw e;                  // a real refusal is not hidden behind the cache
          SyncEngine.state().online = false;
        }
      }
      return localRead(name, args);
    }

    if (!online() && NEEDS_NET[name]) throw offlineError(NEEDS_NET[name]);
    return base(name, args);
  }
  const isNet = e => e?.code === 'NETWORK' || e?.code === 'ETIMEDOUT' || e?.name === 'TypeError';

  async function localRead(name, args) {
    if (name === 'shop_me') {
      const me = await R().metaGet('me', null);
      if (!me) throw Object.assign(Error('This device has not been set up yet. Connect to the internet once and sign in, then it will work offline.'), { code: 'OFFLINE' });
      return { ...me, offline: true };
    }
    if (name === 'shop_items_list') {
      const c = await R().catalogue();
      if (!c.items.length) throw Object.assign(Error('The item list has not reached this device yet. Connect once so it can be copied here.'), { code: 'OFFLINE' });
      return { ...c, offline: true };
    }
    if (name === 'shop_bills_list') return { ...(await R().bills({ from: args.p_from, to: args.p_to, status: args.p_status, payment: args.p_payment, query: args.p_query, offset: args.p_offset, limit: args.p_limit })), offline: true };
    if (name === 'shop_dashboard') return { ...(await R().dashboard({ from: args.p_from, to: args.p_to })), offline: true };
    if (name === 'shop_stock_moves_list') return { ...(await R().stockMoves({ item_id: args.p_item_id, offset: args.p_offset, limit: args.p_limit })), offline: true };
    if (name === 'shop_items_list') return { ...(await R().catalogue()), offline: true };
    throw offlineError('That');
  }

  /* ---------- switching it on ---------- */
  async function install(c, { getSettings, getCashier, runner = null } = {}) {
    cloud = c; base = c.rpc.bind(c);
    if (getSettings) settings = getSettings;
    if (getCashier) cashier = getCashier;
    try { await LocalDB.open({ runner }); } catch (e) { console.warn('[offline] local storage unavailable:', e.message); return false; }
    c.rpc = route;
    c.offline = { isOn: () => ready, state: () => SyncEngine.state(), syncNow: () => SyncEngine.syncNow(), db: LocalDB };
    ready = true;
    // Syncing talks to the restaurant API directly. Sending its calls through the billing
    // adapter would make them look like unknown actions, which once looked like "no internet".
    const rawRpc = (n, a) => (/^shop_/.test(n) ? base(n, a) : RestaurantCloud.rpc(n, a, true));
    SyncEngine.start({ rpc: rawRpc }, { signedIn: () => c.signedIn !== false }).catch(e => console.warn('[sync] could not start:', e.message));
    return true;
  }

  return { install, route, mergeBills, mergeDashboard, LOCAL_FIRST, LOCAL_READ, NEEDS_NET,
    get isOn() { return ready; }, _reset() { ready = false; } };
})();
if (typeof module !== 'undefined') module.exports = OfflineMode;
