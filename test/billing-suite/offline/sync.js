/* Keeping the device and the cloud in step.
   Up:   every note in the outbox is sent with its own id. The server remembers that id, so a note
         that arrives twice — because the reply was lost, the app was closed, the phone died —
         still makes exactly one bill.
   Down: the server keeps a numbered list of everything that changed. The device remembers the
         last number it has seen and asks only for what came after it, so nothing is downloaded
         twice and an interrupted download simply carries on from where it stopped.
   Nothing here ever blocks billing. */
'use strict';
const SyncEngine = (() => {
  const R = () => LocalRepo;
  const BATCH = 50, PAGE = 500, BLOCK = 100, BLOCK_LOW = 20;
  const MAX_BACKOFF = 60 * 1000;   // shorter so stuck bills don't sit for 5 min between tries

  let cloud = null, device = null, active = null, timer = null, started = false, signedIn = () => true;
  let state = { online: navigator.onLine !== false, pending: 0, failed: 0, conflicts: 0, syncing: false,
    lastOk: null, lastError: '', invoiceLeft: 0, invoiceProvisional: 0, registered: false, phase: '' };
  const listeners = new Set();
  const emit = () => { for (const f of listeners) { try { f(state); } catch { /* a screen went away */ } } };
  const set = p => { state = { ...state, ...p }; emit(); };
  const onChange = f => { listeners.add(f); f(state); return () => listeners.delete(f); };

  // Only a genuine failure to reach the server counts as being offline. A server that answers
  // with a refusal is online, and saying otherwise once hid a real fault behind "no internet".
  const isNetworkError = e => e?.code === 'NETWORK' ||
    /Failed to fetch|NetworkError|Could not reach/i.test(e?.message || '');
  const missingFn = e => e?.httpStatus === 404 || /Could not find the function|schema cache|PGRST202/i.test(e?.message || '');

  async function refreshCounts() {
    const c = await R().counts();
    const block = await R().invoiceState();
    const prov = (await LocalDB.all('bills', {})).filter(b => b.invoice_provisional && b.sync_state !== 'synced').length;
    const conflicts = (await LocalDB.all('conflicts', {})).filter(c2 => !c2.seen).length;
    set({ pending: c.pending, failed: c.failed, conflicts, invoiceLeft: R().invoiceLeft(block), invoiceProvisional: prov });
  }

  /* ---------- the device says hello and collects invoice numbers in advance ---------- */
  async function register() {
    device = await R().deviceId();
    const platform = typeof window !== 'undefined' && window.__TAURI__ ? 'tauri' : (navigator.userAgent || '').slice(0, 40);
    const r = await cloud.rpc('restaurant_device_register20', { p_device: device, p_label: deviceLabel(), p_platform: platform, p_version: '20' });
    set({ registered: true });
    const cur = await R().metaGet('cursor', null);
    if (cur === null) await R().metaSet('cursor', Number(r.cursor_now) || 0);   // a new device starts from "now"
    return r;
  }
  const deviceLabel = () => { try { return (navigator.platform || 'Device') + ' · ' + new Date().toLocaleDateString('en-IN'); } catch { return 'Device'; } };

  async function topUpInvoices(force = false) {
    const block = await R().invoiceState();
    if (!force && R().invoiceLeft(block) > BLOCK_LOW) return block;
    const b = await cloud.rpc('restaurant_invoice_block20', { p_device: device, p_size: BLOCK });
    // Numbers already handed to this device are never thrown away: the new block simply follows on.
    const left = R().invoiceLeft(block);
    const next = left > 0 ? block : { ...block, prefix: b.prefix || 'INV', digits: Number(b.digits) || 3, year: b.year, start: Number(b.start), end: Number(b.end), next: Number(b.start) };
    if (left > 0) { next.spare = { start: Number(b.start), end: Number(b.end) }; }
    await R().metaSet('invoice_block', next);
    await refreshCounts();
    return next;
  }
  /* When the block in use is finished, step onto the spare one that was fetched earlier. */
  async function rollBlock() {
    const b = await R().invoiceState();
    if (R().invoiceLeft(b) > 0 || !b.spare) return b;
    const next = { ...b, start: b.spare.start, end: b.spare.end, next: b.spare.start, spare: null };
    await R().metaSet('invoice_block', next);
    return next;
  }

  /* ---------- up ---------- */
  async function pushOnce({ force = false, attempted = new Set() } = {}) {
    const all = await R().pending();
    if (!all.length) return { sent: 0, done: 0 };
    const now = Date.now();
    const due = all.filter(o => !attempted.has(o.op_id) && (force || !(Date.parse(o.next_try_at) > now)))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(0, BATCH);
    if (!due.length) return { sent: 0, done: 0 };
    set({ phase: `Sending ${due.length} of ${all.length}` });
    const reply = await cloud.rpc('restaurant_sync_push20', { p_device: device, p_ops: due.map(o => ({ op_id: o.op_id, kind: o.kind, payload: o.payload })) });
    const results = new Map((reply?.results || []).map(result => [result.op_id, result]));
    let done = 0;
    for (const op of due) {
      attempted.add(op.op_id);
      const res = results.get(op.op_id);
      if (res?.ok === true) { await settle(op, res.result); done++; }
      else await recordFailure(op, res);
    }
    await refreshCounts();
    return { sent: due.length, done };
  }

  async function recordFailure(op, result) {
    await LocalDB.tx(['outbox', 'conflicts'], async h => {
      const current = await h.get('outbox', op.op_id);
      if (!current || current.state !== 'pending' || current.tries !== op.tries) return;
      const tries = (current.tries || 0) + 1;
      const error = String(result?.error || 'The server did not confirm receipt. The bill is still saved here.');
      if (result?.permanent) {
        await h.put('outbox', { ...current, state: 'failed', error, tries });
        await h.put('conflicts', { id: op.op_id, op_id: op.op_id, kind: op.kind, reason: error,
          payload: op.payload, created_at: R().nowISO(), seen: 0 });
      } else {
        const wait = Math.min(MAX_BACKOFF, 2000 * Math.pow(2, Math.min(tries, 8)) * (0.75 + Math.random() * 0.5));
        await h.put('outbox', { ...current, tries, error, next_try_at: new Date(Date.now() + wait).toISOString() });
      }
    });
  }

  /* One accepted note: mark it done and write back whatever the server decided. */
  async function settle(op, result) {
    await LocalDB.tx(['outbox', 'bills', 'stock_moves'], async h => {
      await h.del('outbox', op.op_id);
      if (op.kind === 'bill.create') {
        const b = await h.get('bills', op.op_id);
        if (b) await h.put('bills', { ...b, sync_state: 'synced', synced_at: R().nowISO(),
          order_no: Number(result?.daily_number) || b.order_no, order_id: result?.order_id || b.order_id,
          server_invoice_no: result?.invoice_no || b.invoice_no });
        const mv = await h.all('stock_moves', { index: 'sync_state', equals: 'with_bill' });
        for (const m of mv) if (m.op_id === op.op_id) await h.put('stock_moves', { ...m, sync_state: 'synced' });
      }
      if (op.kind === 'stock.move') {
        const m = await h.get('stock_moves', op.op_id);
        if (m) await h.put('stock_moves', { ...m, sync_state: 'synced' });
      }
    });
  }

  /* ---------- down ---------- */
  async function pullOnce() {
    let cursor = Number(await R().metaGet('cursor', 0)) || 0, pages = 0, applied = 0;
    for (;;) {
      const r = await cloud.rpc('restaurant_sync_pull20', { p_device: device, p_cursor: cursor, p_limit: PAGE });
      if (r.reset) {                     // away longer than the server keeps its list
        set({ phase: 'Taking a fresh copy' });
        await fullRefresh();
        await R().metaSet('cursor', Number(r.cursor) || 0);
        return { applied: -1, reset: true };
      }
      const changes = r.changes || [];
      if (changes.length) {
        applied += await R().applyChanges(changes);
        cursor = Number(r.cursor) || cursor;
        await R().metaSet('cursor', cursor);   // only after the batch is safely written
      }
      pages++;
      if (!r.more || !changes.length || pages > 40) break;
      set({ phase: `Catching up (${applied})` });
    }
    return { applied, reset: false };
  }

  /* The whole catalogue again, in the shape the screens already use. */
  async function fullRefresh() {
    const list = await cloud.rpc('shop_items_list', {}, { forceOnline: true });
    if (list?.items) await R().saveCatalogue(list.items, list.categories);
  }

  /* ---------- the round trip ---------- */
  async function syncNow({ quiet = false, force = false } = {}) {
    if (active) {
      await active;
      if (!force || !state.pending) return state;
      if (active) return active;
    }
    if (!cloud || !signedIn()) return state;
    if (navigator.onLine === false) { set({ online: false }); return state; }
    active = runSync(quiet, force).finally(() => { active = null; });
    return active;
  }

  async function runSync(quiet, force) {
    set({ syncing: true, phase: 'Starting' });
    try {
      if (!state.registered) await register();
      await rollBlock();
      const attempted = new Set();
      for (let batch = 0; batch < 21; batch++) {
        const r = await pushOnce({ force, attempted });
        if (!r.sent) break;
      }
      const pending = await R().pending();
      await pullOnce();
      await topUpInvoices();
      await refreshCounts();
      set({ online: true, phase: '', lastError: pending.find(op => op.error)?.error || '' });
      if (!state.pending && !state.failed) {
        const lastOk = new Date().toISOString();
        await R().metaSet('last_sync', lastOk);
        set({ lastOk });
      }
    } catch (e) {
      await refreshCounts().catch(() => {});
      if (missingFn(e)) set({ lastError: 'Run OFFLINE-SYNC-v20.sql in Supabase once to switch syncing on.', phase: '' });
      else if (isNetworkError(e)) set({ online: false, phase: '', lastError: '' });
      else set({ online: navigator.onLine !== false, lastError: e.message || String(e), phase: '' });
      if (!quiet && !isNetworkError(e)) try { console.warn('[sync]', e.message); } catch { /* no console */ }
    } finally { set({ syncing: false }); }
    return state;
  }

  /* ---------- when to try ---------- */
  function schedule() {
    clearTimeout(timer);
    const soon = state.pending > 0 ? 8000 : 60000;   // try more often when the outbox is not empty
    timer = setTimeout(() => { if (!document.hidden && navigator.onLine !== false) syncNow({ quiet: true }).finally(schedule); else schedule(); }, soon);
  }
  async function start(c, opts = {}) {
    cloud = c;
    if (opts.signedIn) signedIn = opts.signedIn;
    await refreshCounts();
    if (started) return;
    set({ lastOk: await R().metaGet('last_sync', null) });
    started = true;
    addEventListener('online', () => { set({ online: true }); syncNow({ quiet: true }); });
    addEventListener('offline', () => set({ online: false }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine !== false) syncNow({ quiet: true }); });
    schedule();
    syncNow({ quiet: true });
  }
  function stop() { clearTimeout(timer); started = false; listeners.clear(); }

  async function retryFailed(opId = null) {
    await LocalDB.tx(['outbox', 'conflicts'], async h => {
      const failed = (await h.all('outbox', { index: 'state', equals: 'failed' })).filter(op => !opId || op.op_id === opId);
      for (const op of failed) await h.put('outbox', { ...op, state: 'pending', tries: 0, next_try_at: R().nowISO(), error: '' });
      const ids = new Set(failed.map(op => op.op_id));
      for (const conflict of await h.all('conflicts', {})) if (ids.has(conflict.op_id)) await h.del('conflicts', conflict.id);
    });
    await refreshCounts();
    return syncNow({ force: true });
  }
  async function dropFailed(opId) {
    const op = await LocalDB.get('outbox', opId);
    if (op) { await LocalDB.del('outbox', opId); if (op.kind === 'bill.create') { const b = await LocalDB.get('bills', opId); if (b) await LocalDB.put('bills', { ...b, sync_state: 'abandoned' }); } }
    await refreshCounts();
  }

  return { start, stop, syncNow, pushOnce, pullOnce, register, topUpInvoices, rollBlock, fullRefresh,
    retryFailed, dropFailed, refreshCounts, onChange, state: () => state,
    get device() { return device; }, _setCloud: c => { cloud = c; }, _setDevice: d => { device = d; } };
})();
if (typeof module !== 'undefined') module.exports = SyncEngine;
