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
  const MAX_BACKOFF = 5 * 60 * 1000;

  let cloud = null, device = null, running = false, timer = null, started = false, signedIn = () => true;
  let state = { online: typeof navigator === 'undefined' || navigator.onLine !== false, pending: 0, failed: 0,
    conflicts: 0, syncing: false, lastOk: null, lastError: '', numbersLeft: 0, provisional: 0, registered: false, phase: '' };
  const listeners = new Set();
  const emit = () => { for (const f of listeners) { try { f(state); } catch { /* a screen went away */ } } };
  const set = p => { state = { ...state, ...p }; emit(); };
  const onChange = f => { listeners.add(f); f(state); return () => listeners.delete(f); };

  // Only a genuine failure to reach the server counts as being offline. A server that answers
  // with a refusal is online, and saying otherwise hides a real fault behind "no internet".
  const isNetworkError = e => e?.code === 'NETWORK' || e?.code === 'ETIMEDOUT' || e?.name === 'TypeError' ||
    /Failed to fetch|NetworkError|Could not reach|No internet|timed out/i.test(e?.message || '');
  const missingFn = e => e?.status === 404 || /Could not find the function|schema cache|PGRST202|is not set up/i.test(e?.message || '');

  async function refreshCounts() {
    const c = await R().counts();
    const block = await R().blockState();
    const prov = (await LocalDB.all('bills', {})).filter(b => b.bill_provisional && b.sync_state !== 'synced').length;
    const conflicts = (await LocalDB.all('conflicts', {})).filter(x => !x.seen).length;
    set({ pending: c.pending, failed: c.failed, conflicts, numbersLeft: R().numbersLeft(block), provisional: prov });
  }

  /* ---------- the device says hello and collects bill numbers in advance ---------- */
  async function register() {
    device = await R().deviceId();
    const platform = typeof window !== 'undefined' && window.__TAURI__ ? 'tauri' : (navigator.userAgent || '').slice(0, 40);
    const r = await cloud.rpc('shop_device_register', { p_device: device, p_label: deviceLabel(), p_platform: platform, p_version: '21' });
    set({ registered: true });
    const cur = await R().metaGet('cursor', null);
    if (cur === null) await R().metaSet('cursor', Number(r.cursor_now) || 0);   // a new device starts from "now"
    return r;
  }
  const deviceLabel = () => { try { return (navigator.platform || 'Device') + ' · ' + new Date().toLocaleDateString('en-IN'); } catch { return 'Device'; } };

  async function topUpNumbers(force = false) {
    const block = await R().blockState();
    if (!force && R().numbersLeft(block) > BLOCK_LOW) return block;
    const b = await cloud.rpc('shop_bill_block', { p_device: device, p_size: BLOCK });
    // Numbers already handed to this device are never thrown away: a new block simply follows on.
    const left = R().numbersLeft(block);
    const fresh = { prefix: b.prefix ?? block.prefix, digits: Number(b.digits) || 5,
      start: Number(b.start), end: Number(b.end), next: Number(b.start), fallback: block.fallback || 0 };
    const next = left > 0 ? { ...block, prefix: fresh.prefix, digits: fresh.digits, spare: { start: fresh.start, end: fresh.end } } : fresh;
    await R().metaSet('bill_block', next);
    await refreshCounts();
    return next;
  }
  /* When the block in use is finished, step onto the spare one fetched earlier. */
  async function rollBlock() {
    const b = await R().blockState();
    if (R().numbersLeft(b) > 0 || !b.spare) return b;
    const next = { ...b, start: b.spare.start, end: b.spare.end, next: b.spare.start, spare: null };
    await R().metaSet('bill_block', next);
    return next;
  }

  /* ---------- up ---------- */
  async function pushOnce() {
    const all = await R().pending();
    if (!all.length) return { sent: 0, done: 0 };
    const now = Date.now();
    const due = all.filter(o => !o.next_try_at || Date.parse(o.next_try_at) <= now)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(0, BATCH);
    if (!due.length) return { sent: 0, done: 0 };
    set({ phase: `Sending ${due.length} of ${all.length}` });
    const reply = await cloud.rpc('shop_sync_push', { p_device: device, p_ops: due.map(o => ({ op_id: o.op_id, kind: o.kind, payload: o.payload })) });
    const results = reply?.results || [];
    let done = 0;
    for (const [i, res] of results.entries()) {
      const op = due[i];
      if (!op) continue;
      if (res.ok) { await settle(op, res.result); done++; }
      else if (res.permanent) {
        await LocalDB.put('outbox', { ...op, state: 'failed', error: String(res.error || 'The server refused this.'), tries: (op.tries || 0) + 1 });
        await R().conflict({ op_id: op.op_id, kind: op.kind, reason: String(res.error || ''), payload: op.payload });
      } else {
        const tries = (op.tries || 0) + 1;
        const wait = Math.min(MAX_BACKOFF, 2000 * Math.pow(2, Math.min(tries, 8))) * (0.75 + Math.random() * 0.5);
        await LocalDB.put('outbox', { ...op, tries, error: String(res.error || ''), next_try_at: new Date(Date.now() + wait).toISOString() });
      }
    }
    await refreshCounts();
    return { sent: due.length, done };
  }

  /* One accepted note: mark it done and write back whatever the server decided. */
  async function settle(op, result) {
    await LocalDB.tx(['outbox', 'bills', 'stock_moves'], async h => {
      await h.del('outbox', op.op_id);
      if (op.kind === 'bill.create') {
        const b = await h.get('bills', op.op_id);
        if (b) await h.put('bills', { ...b, sync_state: 'synced', synced_at: R().nowISO(),
          server_id: result?.id || null, bill_no: result?.bill_no || b.bill_no, seq: result?.seq ?? b.seq });
        for (const m of await h.all('stock_moves', { index: 'sync_state', equals: 'with_bill' })) {
          if (m.op_id === op.op_id) await h.put('stock_moves', { ...m, sync_state: 'synced' });
        }
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
      const r = await cloud.rpc('shop_sync_pull', { p_device: device, p_cursor: cursor, p_limit: PAGE });
      if (r.reset) {                     // away for longer than the server keeps its list
        set({ phase: 'Taking a fresh copy' });
        await fullRefresh();
        await R().metaSet('cursor', Number(r.cursor) || 0);
        return { applied: -1, reset: true };
      }
      const changes = r.changes || [];
      if (changes.length) {
        applied += await R().applyChanges(changes);
        cursor = Number(r.cursor) || cursor;
        await R().metaSet('cursor', cursor);   // only once the batch is safely written
      }
      pages++;
      if (!r.more || !changes.length || pages > 40) break;
      set({ phase: `Catching up (${applied})` });
    }
    return { applied, reset: false };
  }

  /* The whole item list again, in the shape the screens already use. */
  async function fullRefresh() {
    const list = await cloud.rpc('shop_items_list', {}, { forceOnline: true });
    if (list?.items) await R().saveCatalogue(list.items, list.categories);
  }

  /* ---------- the round trip ---------- */
  async function syncNow({ quiet = false } = {}) {
    if (running || !cloud || !signedIn()) return state;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { set({ online: false }); return state; }
    running = true; set({ syncing: true, phase: 'Starting', lastError: '' });
    try {
      if (!state.registered) await register();
      await rollBlock();
      let guard = 0;
      for (;;) {                                  // keep going while the outbox still empties
        const r = await pushOnce();
        if (!r.done || ++guard > 20) break;
        if (!(await R().pending()).length) break;
      }
      await pullOnce();
      await topUpNumbers();
      await refreshCounts();
      set({ online: true, lastOk: new Date().toISOString(), phase: '' });
      await R().metaSet('last_sync', state.lastOk);
    } catch (e) {
      if (missingFn(e)) set({ lastError: 'Run OFFLINE-SYNC-SHOP.sql in Supabase once to switch syncing on.', phase: '' });
      else if (isNetworkError(e)) set({ online: false, phase: '', lastError: '' });
      else set({ lastError: e.message || String(e), phase: '' });
      if (!quiet && !isNetworkError(e)) try { console.warn('[sync]', e.message); } catch { /* no console */ }
    } finally { running = false; set({ syncing: false }); }
    return state;
  }

  /* ---------- when to try ---------- */
  function schedule() {
    clearTimeout(timer);
    const soon = state.pending > 0 ? 15000 : 90000;
    timer = setTimeout(() => {
      if (!document.hidden && navigator.onLine !== false) syncNow({ quiet: true }).finally(schedule); else schedule();
    }, soon);
  }
  async function start(c, opts = {}) {
    cloud = c;
    if (opts.signedIn) signedIn = opts.signedIn;
    await refreshCounts();
    if (started) return;
    started = true;
    addEventListener('online', () => { set({ online: true }); syncNow({ quiet: true }); });
    addEventListener('offline', () => set({ online: false }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine !== false) syncNow({ quiet: true }); });
    schedule();
    syncNow({ quiet: true });
  }
  function stop() { clearTimeout(timer); started = false; listeners.clear(); }

  async function retryFailed() {
    for (const op of await R().failed()) await LocalDB.put('outbox', { ...op, state: 'pending', tries: 0, next_try_at: R().nowISO(), error: '' });
    await refreshCounts();
    return syncNow();
  }
  async function dropFailed(opId) {
    const op = await LocalDB.get('outbox', opId);
    if (op) {
      await LocalDB.del('outbox', opId);
      if (op.kind === 'bill.create') { const b = await LocalDB.get('bills', opId); if (b) await LocalDB.put('bills', { ...b, sync_state: 'abandoned' }); }
    }
    await refreshCounts();
  }

  return { start, stop, syncNow, pushOnce, pullOnce, register, topUpNumbers, rollBlock, fullRefresh,
    retryFailed, dropFailed, refreshCounts, onChange, state: () => state,
    get device() { return device; }, _setCloud: c => { cloud = c; }, _setDevice: d => { device = d; } };
})();
if (typeof module !== 'undefined') module.exports = SyncEngine;
