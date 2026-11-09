/* The small status chip in the top bar, and the panel behind it.
   It says one plain thing at a time and never gets in the way of billing. */
'use strict';
const OfflineUI = (() => {
  let chip = null, off = null;

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function wording(s) {
    if (s.conflicts) return { cls: 'sy-warn', text: `${plural(s.conflicts, 'bill needs', 'bills need')} attention` };
    if (s.failed) return { cls: 'sy-bad', text: `${plural(s.failed, 'bill', 'bills')} not sent` };
    if (!s.online) return { cls: 'sy-off', text: s.pending ? `Offline · ${plural(s.pending, 'bill', 'bills')} saved here` : 'Offline · saving here' };
    if (s.syncing) return { cls: 'sy-busy', text: s.phase || 'Sending…' };
    if (s.lastError) return { cls: 'sy-warn', text: s.pending ? `${plural(s.pending, 'bill', 'bills')} waiting to retry` : 'Sync needs attention' };
    if (s.pending) return { cls: 'sy-busy', text: `${plural(s.pending, 'bill', 'bills')} to send` };
    return { cls: 'sy-ok', text: 'Saved and synced' };
  }

  function mount() {
    const top = document.querySelector('.top'); if (!top || document.getElementById('syncChip')) return;
    chip = document.createElement('button');
    chip.type = 'button'; chip.id = 'syncChip'; chip.className = 'sync-chip'; chip.title = 'Saving and syncing';
    chip.onclick = panel;
    top.querySelector('#net')?.before(chip) || top.append(chip);
    off?.(); off = SyncEngine.onChange(paint);
  }
  function paint(s) {
    if (!chip?.isConnected) return;
    const w = wording(s);
    chip.className = 'sync-chip ' + w.cls;
    chip.innerHTML = `<span class="sy-dot" aria-hidden="true"></span><span class="sy-t">${esc(w.text)}</span>`;
    chip.setAttribute('aria-label', 'Saving and syncing: ' + w.text);
  }

  const when = t => { if (!t) return 'not yet'; const m = Math.round((Date.now() - Date.parse(t)) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' minutes ago' : Fmt.dateTime(t); };

  async function panel() {
    const s = SyncEngine.state();
    const failed = await LocalRepo.failed();
    const conflicts = (await LocalDB.all('conflicts', { index: 'created_at', desc: true, limit: 20 })).filter(c => !c.seen);
    const block = await LocalRepo.invoiceState();
    const left = LocalRepo.invoiceLeft(block);
    const prov = s.invoiceProvisional;
    const d = modal('Saving & syncing', `<div class="stack sync-panel">
      <div class="sum-row">
        <div class="sum"><span>Right now</span><b data-sync-status>${esc(wording(s).text)}</b></div>
        <div class="sum"><span>Waiting to send</span><b data-sync-pending>${s.pending}</b></div>
        <div class="sum"><span>Last synced</span><b data-sync-last>${esc(when(s.lastOk))}</b></div>
      </div>
      ${!s.online ? `<div class="notice">${Icon('wifi')}<div><b>No internet just now</b><p class="hint">Keep billing. Everything is saved on this device and sent on by itself the moment the connection is back.</p></div></div>` : ''}
      <div class="notice notice-bad" data-sync-error ${s.lastError ? '' : 'hidden'}>${Icon('alert')}<div><b>Could not sync</b><p class="hint">${esc(s.lastError)}</p></div></div>
      ${left <= 20 ? `<div class="notice ${left === 0 ? 'notice-bad' : ''}">${Icon('bill')}<div><b>${left === 0 ? 'Offline invoice numbers used up' : `${left} invoice numbers left on this device`}</b>
        <p class="hint">${left === 0
          ? 'Bills still save, with a number carrying this device’s tag so it can never clash. Connect to pick up a fresh block of ordinary numbers.'
          : 'This device holds numbers in advance so it can bill with no internet. More are collected automatically when it connects.'}</p></div></div>` : ''}
      ${prov ? `<div class="notice">${Icon('alert')}<div><b>${plural(prov, 'bill uses', 'bills use')} a stand-in number</b><p class="hint">They are real, unique numbers and are never renumbered. They just look different from the rest.</p></div></div>` : ''}
      ${failed.length ? `<section class="card"><header class="card-head"><h3>The server refused these</h3>
        <p class="hint">These will not go through on their own. Look at each one, then send it again or drop it.</p></header>
        <ul class="plain-list">${failed.slice(0, 10).map(f => `<li><span><b>${esc(f.kind === 'bill.create' ? (f.payload?.invoice_no || 'Bill') : f.kind)}</b><small>${esc(f.error || '')}</small></span>
          <span class="toolbar"><button type="button" class="btn btn-sm" data-retry="${esc(f.op_id)}">Try again</button><button type="button" class="btn btn-sm btn-ghost" data-drop="${esc(f.op_id)}">Drop</button></span></li>`).join('')}</ul></section>` : ''}
      ${conflicts.length ? `<section class="card"><header class="card-head"><h3>Worth a look</h3></header>
        <ul class="plain-list">${conflicts.slice(0, 8).map(c => `<li><span><b>${esc(c.kind || 'Change')}</b><small>${esc(c.reason || '')}</small></span></li>`).join('')}</ul>
        <div class="form-actions"><button type="button" class="btn btn-sm" data-seen>Mark as seen</button></div></section>` : ''}
      <section class="card"><header class="card-head"><h3>This device</h3></header>
        <dl class="facts"><dt>Saved on</dt><dd>${esc(LocalDB.kind === 'sqlite' ? 'This computer’s own database (SQLite)' : 'This browser’s own database')}</dd>
        <dt>Bills held here</dt><dd>${await LocalDB.count('bills')}</dd>
        <dt>Device tag</dt><dd class="mono">${esc(LocalRepo.shortId(await LocalRepo.deviceId()))}</dd></dl>
        <div class="toolbar"><button type="button" class="btn" data-backup>${Icon('download')} Save a backup</button>
          <label class="btn btn-ghost file-btn">${Icon('upload')} Restore…<input type="file" accept="application/json,.json" hidden data-restore></label></div>
        <p class="hint">A backup holds every bill on this device, including any still waiting to be sent. Keep it somewhere else — if this device is lost, wiped or the app is uninstalled, what is on it goes too.</p></section>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Close</button>
        <button type="button" class="btn btn-primary" data-sync>${Icon('refresh')} Sync now</button></div></div>`, { size: 'modal-md' });

    const stop = SyncEngine.onChange(current => {
      d.querySelector('[data-sync-status]').textContent = wording(current).text;
      d.querySelector('[data-sync-pending]').textContent = current.pending;
      d.querySelector('[data-sync-last]').textContent = when(current.lastOk);
      const error = d.querySelector('[data-sync-error]');
      error.hidden = !current.lastError;
      error.querySelector('p').textContent = current.lastError;
    });
    d.addEventListener('close', () => stop(), { once: true });
    d.addEventListener('click', async e => {
      const t = e.target;
      const sync = t.closest('[data-sync]');
      if (sync) {
        busy(sync, true, 'Syncing…');
        await SyncEngine.syncNow({ force: true });
        if (d.open) { d.close(); panel(); }
        return;
      }
      const r = t.closest('[data-retry]');
      if (r) { await SyncEngine.retryFailed(r.dataset.retry); if (d.open) { d.close(); panel(); } return; }
      const dr = t.closest('[data-drop]'); if (dr) {
        if (!(await ask({ title: 'Drop this one?', body: 'It will never be sent to the server. The bill stays on this device, marked as not sent. Use this only when the reason above cannot be fixed.', confirm: 'Drop it', danger: true }))) return;
        await SyncEngine.dropFailed(dr.dataset.drop); d.close(); panel(); return;
      }
      if (t.closest('[data-seen]')) { for (const c of conflicts) await LocalDB.put('conflicts', { ...c, seen: 1 }); await SyncEngine.refreshCounts(); d.close(); panel(); return; }
      if (t.closest('[data-backup]')) { await Backup.download(); return; }
    });
    d.querySelector('[data-restore]')?.addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { const n = await Backup.restore(f); toast(`Restored ${n} bills from the backup.`, 'ok'); d.close(); }
      catch (ex) { toast(ex.message, 'error', 7000); }
    });
  }

  /* ---------- backup ---------- */
  const Backup = {
    async make() {
      const out = { format: 'restaurant-till-backup', version: 1, at: LocalRepo.nowISO(), device: await LocalRepo.deviceId(), stores: {} };
      for (const s of LocalDB.STORES) out.stores[s] = await LocalDB.all(s, {});
      return out;
    },
    async download() {
      const b = await this.make();
      const name = `till-backup-${b.at.slice(0, 10)}-${LocalRepo.shortId(b.device)}.json`;
      downloadFile(name, JSON.stringify(b), 'application/json');
      toast(`Backup saved: ${b.stores.bills.length} bills, ${b.stores.outbox.length} still to send.`, 'ok', 6000);
    },
    async restore(file) {
      const j = JSON.parse(await file.text());
      if (j?.format !== 'restaurant-till-backup' || !j.stores) throw Error('That is not a backup from this app.');
      // A restore never throws away what is already here and never overwrites a newer bill:
      // anything the device already has wins, and only missing rows are put back.
      let added = 0;
      for (const store of LocalDB.STORES) {
        if (store === 'meta') continue;                       // the device keeps its own identity
        for (const row of j.stores[store] || []) {
          const key = row[LocalDB.keyOf(store)];
          if (key === undefined || await LocalDB.get(store, key)) continue;
          await LocalDB.put(store, row); if (store === 'bills') added++;
        }
      }
      await SyncEngine.refreshCounts();
      return added;
    }
  };

  return { mount, panel, Backup, wording };
})();
