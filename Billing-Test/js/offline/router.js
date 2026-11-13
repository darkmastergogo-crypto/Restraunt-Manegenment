/* Where each request goes.
   The screens are untouched: they still call Cloud.rpc(...). This decides, for each call,
   whether the device answers it, the server answers it, or the person is told plainly that this
   particular thing needs internet.

   Taking payment is always answered by the device first, online or not. That is what makes a
   bill instant, and it is why a flaky connection can never produce a half-saved bill. */
'use strict';
const OfflineMode = (() => {
  const R = () => LocalRepo;

  /* Saved on the device, then sent on. Taking payment must never wait for a network. */
  const LOCAL_FIRST = new Set(['shop_create_bill']);
  /* Done on the server while there is internet — that keeps the shared stock history and the
     server's own checks — and on the device only when there is none. */
  const SERVER_PREFERRED = new Set(['shop_stock_adjust']);
  /* Answered by the server when there is internet, by the device when there is not. */
  const LOCAL_READ = new Set(['shop_me', 'shop_items_list', 'shop_categories_list', 'shop_bills_list',
    'shop_dashboard', 'shop_stock_moves_list']);
  /* Everything else needs the server. Each gets a plain reason rather than a dead button. */
  const NEEDS_NET = {
    shop_bill_cancel: 'Cancelling a bill', shop_reset_bills: 'Deleting all bills',
    shop_item_save: 'Adding or changing an item', shop_item_delete: 'Deleting an item',
    shop_items_delete_many: 'Deleting items', shop_items_delete_all: 'Deleting every item',
    shop_items_import_csv: 'Importing items', shop_category_save: 'Categories', shop_categories_delete: 'Categories',
    shop_settings_save: 'Shop settings', shop_billing_options_save: 'Billing settings',
    shop_system_save: 'These settings', shop_admin_set: 'Admin settings', shop_admin_remove: 'Admin settings',
    shop_admin_list: 'The admin list', shop_role_perms_save: 'What each role may do',
    shop_staff_set: 'Staff', shop_staff_remove: 'Staff', shop_staff_list: 'The staff list',
    shop_staff_set_password: 'Staff passwords', shop_app_icon_save: 'The app icon',
    shop_preset_save: 'Presets', shop_preset_apply: 'Presets', shop_preset_delete: 'Presets',
    shop_presets_list: 'Presets', shop_preset_restore: 'Presets',
    shop_expenses_list: 'Expenses', shop_expense_save: 'Expenses', shop_expense_delete: 'Expenses',
    shop_expense_head_save: 'Expense types', shop_expense_head_delete: 'Expense types',
    shop_expense_auto_save: 'Monthly expenses', shop_expense_auto_delete: 'Monthly expenses',
    shop_members_list: 'Members', shop_member_save: 'Members', shop_member_renew: 'Renewing a membership',
    shop_member_history: 'Member history', shop_member_checkin: 'Check-ins', shop_member_set_dates: 'Membership dates',
    shop_member_login_set: 'Member logins', shop_member_login_remove: 'Member logins',
    shop_plan_save: 'Plans', shop_plan_delete: 'Plans', shop_checkin_code: 'The check-in code',
    shop_attendance_mark: 'Attendance', shop_attendance_list: 'Attendance',
    shop_member_pay_due: 'Taking a member’s due payment', shop_member_delete: 'Deleting a member',
    shop_member_review_clear: 'Review offers', shop_member_review_done: 'Reviews', shop_member_app_save: 'Member app settings',
    shop_notices_list: 'Notices', shop_notice_save: 'Notices', shop_notice_delete: 'Notices'
  };

  let base = null, ctx = {}, ready = false;
  const online = () => (typeof navigator === 'undefined' || navigator.onLine !== false) && SyncEngine.state().online !== false;
  const isNet = e => e?.code === 'NETWORK' || e?.code === 'ETIMEDOUT' || e?.name === 'TypeError';
  const money = n => Math.round((Number(n) || 0) * 100) / 100;
  const offlineError = what => Object.assign(
    Error(`${what} needs internet. Billing keeps working — bills you take now are saved on this device and sent on by themselves.`),
    { code: 'OFFLINE' });

  /* ---------- keeping the device's copy fresh whenever the server answers ---------- */
  async function cacheFromServer(name, result) {
    try {
      if (name === 'shop_items_list' && result?.items) await R().saveCatalogue(result.items, result.categories);
      if (name === 'shop_me' && result) await R().metaSet('me', result);
    } catch { /* a full disk must never break a working screen */ }
  }

  /* ---------- bills this device has taken but not yet sent ---------- */
  const unsent = async (from, to) => (await LocalDB.all('bills', { index: 'bill_day', from, to }))
    .filter(b => b.sync_state !== 'synced' && b.sync_state !== 'abandoned');

  function mergeBills(serverList, local) {
    if (!local.length) return serverList;
    const seen = new Set((serverList.rows || []).map(r => r.bill_no));
    const extra = local.filter(b => !seen.has(b.bill_no)).map(b => ({ ...b, not_sent_yet: true }));
    if (!extra.length) return serverList;
    const rows = [...extra, ...(serverList.rows || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const s = serverList.summary || {};
    const sum = f => money(extra.filter(f).reduce((n, b) => n + (Number(b.total) || 0), 0));
    return { ...serverList, rows, total: Number(serverList.total || 0) + extra.length, unsent: extra.length,
      summary: { ...s, bills: Number(s.bills || 0) + extra.length, sales: money(Number(s.sales || 0) + sum(() => true)),
        cash: money(Number(s.cash || 0) + sum(b => b.payment_method === 'Cash')),
        upi: money(Number(s.upi || 0) + sum(b => b.payment_method === 'UPI')),
        card: money(Number(s.card || 0) + sum(b => b.payment_method === 'Card')) } };
  }

  function mergeDashboard(d, local) {
    if (!local.length) return d;
    const m = { ...d.metrics };
    m.sales = money(Number(m.sales || 0) + local.reduce((n, b) => n + Number(b.total || 0), 0));
    m.bills = Number(m.bills || 0) + local.length;
    m.qty = Number(m.qty || 0) + local.reduce((n, b) => n + (b.items || []).reduce((q, l) => q + Number(l.qty || 0), 0), 0);
    m.discount = money(Number(m.discount || 0) + local.reduce((n, b) => n + Number(b.discount_amount || 0) + Number(b.less_amount || 0), 0));
    m.tax = money(Number(m.tax || 0) + local.reduce((n, b) => n + Number(b.tax_amount || 0), 0));
    m.avg_bill = m.bills ? money(m.sales / m.bills) : 0;
    const oneDay = d.trend_unit === 'hour';
    const trend = new Map((d.trend || []).map(t => [String(t.key), { ...t }]));
    for (const b of local) {
      const k = String(oneDay ? new Date(b.created_at).getHours() : b.bill_day);
      const t = trend.get(k) || { key: oneDay ? Number(k) : k, sales: 0, bills: 0 };
      t.sales = money(Number(t.sales || 0) + Number(b.total)); t.bills = Number(t.bills || 0) + 1; trend.set(k, t);
    }
    const pay = new Map((d.payments || []).map(p => [p.method, { ...p }]));
    for (const b of local) {
      const k = b.payment_method || 'Cash';
      const p = pay.get(k) || { method: k, amount: 0, bills: 0 };
      p.amount = money(Number(p.amount || 0) + Number(b.total)); p.bills = Number(p.bills || 0) + 1; pay.set(k, p);
    }
    const top = new Map((d.top_items || []).map(t => [t.name, { ...t }]));
    const cat = new Map((d.categories || []).map(c => [c.category, { ...c }]));
    for (const b of local) for (const l of b.items || []) {
      const t = top.get(l.name) || { name: l.name, unit: l.unit || 'pcs', qty: 0, revenue: 0, bills: 0 };
      t.qty = Number(t.qty || 0) + Number(l.qty || 0); t.revenue = money(Number(t.revenue || 0) + Number(l.line_total || 0)); top.set(l.name, t);
      const cn = l.category || 'Extra items';
      const c = cat.get(cn) || { category: cn, qty: 0, revenue: 0 };
      c.qty = Number(c.qty || 0) + Number(l.qty || 0); c.revenue = money(Number(c.revenue || 0) + Number(l.line_total || 0)); cat.set(cn, c);
    }
    return { ...d, metrics: m, unsent: local.length,
      trend: oneDay ? [...trend.values()].sort((a, b) => a.key - b.key) : [...trend.values()].sort((a, b) => String(a.key).localeCompare(String(b.key))),
      payments: [...pay.values()].sort((a, b) => b.amount - a.amount),
      top_items: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      categories: [...cat.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 12) };
  }

  /* ---------- the router ---------- */
  async function route(name, args = {}, opts = {}) {
    if (!ready || opts.forceOnline) return base(name, args, opts);

    if (LOCAL_FIRST.has(name) && name === 'shop_create_bill') {
      let bill;
      try {
        bill = await R().commitBill({ ...args,
          __settings: ctx.getSettings ? ctx.getSettings() : {},
          __sys: ctx.getSys ? ctx.getSys() : {},
          __can: ctx.getCan ? ctx.getCan() : (() => true),
          __isAdmin: ctx.isAdmin ? ctx.isAdmin() : false,
          __cashier: ctx.getCashier ? ctx.getCashier() : '' });
      } catch (e) {
        // Something about the bill itself is wrong, and trying again will not change that.
        // Marking it the way a refusal from the server is marked makes the billing screen
        // clear the stuck bill and show the reason, instead of offering "Retry save" for ever.
        if (!e.status) e.status = 400;
        throw e;
      }
      SyncEngine.refreshCounts();
      if (online()) SyncEngine.syncNow({ quiet: true });
      return bill;
    }

    if (SERVER_PREFERRED.has(name)) {
      if (online()) {
        try { const item = await base(name, args, opts); try { await LocalDB.put('items', item); } catch { /* cache only */ } return item; }
        catch (e) { if (!isNet(e)) throw e; }
      }
      const item = await R().adjustStock({ item_id: args.p_item_id, mode: args.p_mode, qty: args.p_qty, note: args.p_note });
      SyncEngine.refreshCounts();
      return item;
    }

    if (LOCAL_READ.has(name)) {
      if (online()) {
        try {
          const r = await base(name, args, opts);
          cacheFromServer(name, r);
          if (name === 'shop_bills_list') return mergeBills(r, await unsent(args.p_from, args.p_to));
          if (name === 'shop_dashboard') return mergeDashboard(r, await unsent(args.p_from, args.p_to));
          if (name === 'shop_stock_moves_list') {
            const mine = (await LocalDB.all('stock_moves', { index: 'sync_state', equals: 'pending' }))
              .filter(m => !args.p_item_id || m.item_id === args.p_item_id);
            if (!mine.length) return r;
            const extra = mine.map(m => ({ created_at: m.created_at, item_id: m.item_id, item_name: m.item_name || '',
              reason: m.reason, change: m.change, balance: m.balance, bill_no: m.bill_no || '',
              note: m.note || '', actor_name: 'This device · not sent yet' }));
            return { ...r, total: Number(r.total || 0) + extra.length, rows: [...extra, ...(r.rows || [])] };
          }
          return r;
        } catch (e) {
          if (!isNet(e)) throw e;              // a real refusal is never hidden behind the cache
        }
      }
      return localRead(name, args);
    }

    if (!online() && NEEDS_NET[name]) throw offlineError(NEEDS_NET[name]);
    return base(name, args, opts);
  }

  async function localRead(name, args) {
    if (name === 'shop_me') {
      const me = await R().metaGet('me', null);
      if (!me) throw Object.assign(Error('This device has not been set up yet. Connect to the internet once and sign in; after that it works offline.'), { code: 'OFFLINE' });
      return { ...me, offline: true };
    }
    if (name === 'shop_items_list') {
      const c = await R().catalogue();
      if (!c.items.length) throw Object.assign(Error('The item list has not reached this device yet. Connect once so it can be copied here.'), { code: 'OFFLINE' });
      return { items: c.items, categories: c.categories.map(x => x.name), offline: true };
    }
    if (name === 'shop_categories_list') {
      const c = await R().catalogue();
      return { rows: c.categories.map(x => ({ name: x.name, sort: x.sort_order, items: 0 })), offline: true };
    }
    if (name === 'shop_bills_list') return R().bills({ from: args.p_from, to: args.p_to, status: args.p_status,
      payment: args.p_payment, query: args.p_query, offset: args.p_offset, limit: args.p_limit });
    if (name === 'shop_dashboard') return R().dashboard({ from: args.p_from, to: args.p_to });
    if (name === 'shop_stock_moves_list') return R().stockMoves({ item_id: args.p_item_id, offset: args.p_offset, limit: args.p_limit });
    throw offlineError('That');
  }

  /* ---------- switching it on ---------- */
  async function install(c, opts = {}) {
    base = c.rpc.bind(c);
    ctx = opts;
    try { await LocalDB.open({ runner: opts.runner || null }); }
    catch (e) { try { console.warn('[offline] local storage unavailable:', e.message); } catch { /* no console */ } return false; }
    c.rpc = route;
    c.offline = { isOn: () => ready, state: () => SyncEngine.state(), syncNow: () => SyncEngine.syncNow(), db: LocalDB };
    ready = true;
    await SyncEngine.start({ rpc: (n, a) => base(n, a, { forceOnline: true }) }, { signedIn: () => c.signedIn !== false });
    return true;
  }

  return { install, route, mergeBills, mergeDashboard, localRead,
    LOCAL_FIRST, SERVER_PREFERRED, LOCAL_READ, NEEDS_NET,
    get isOn() { return ready; }, _reset() { ready = false; } };
})();
if (typeof module !== 'undefined') module.exports = OfflineMode;
