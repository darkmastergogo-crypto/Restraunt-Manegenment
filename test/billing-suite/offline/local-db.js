/* The till's own database, on the device.
   One small interface, two drivers underneath:
     • SQLite  — used inside the installed Windows and Android app (Tauri SQL plugin).
     • IndexedDB — used in the browser and the installed web app.
   Both keep the same tables, the same indexes and real all-or-nothing transactions, so the
   rest of the app never knows or cares which one it is talking to.

   The SQLite driver takes its low-level runner as a parameter, so the very same code is
   driven by the Tauri plugin on a device and by a plain SQLite library in the test suite. */
'use strict';
const LocalDB = (() => {

  /* Every table, its key, and the fields worth indexing.
     Rows are kept whole as JSON with the indexed fields copied out beside them, which keeps
     the two drivers identical and lets a table gain a field later without a migration. */
  const SCHEMA = {
    meta:        { key: 'k',     index: {} },
    items:       { key: 'id',    index: { name: 'text', category: 'text' } },
    categories:  { key: 'name',  index: { sort_order: 'int' } },
    bills:       { key: 'id',    index: { bill_day: 'text', created_at: 'text', sync_state: 'text', invoice_no: 'text' } },
    bill_items:  { key: 'id',    index: { bill_id: 'text', name: 'text' } },
    stock_moves: { key: 'id',    index: { item_id: 'text', created_at: 'text', sync_state: 'text' } },
    outbox:      { key: 'op_id', index: { state: 'text', created_at: 'text', next_try_at: 'text' } },
    conflicts:   { key: 'id',    index: { created_at: 'text', seen: 'int' } },
    blobs:       { key: 'id',    index: { state: 'text' } }
  };
  const STORES = Object.keys(SCHEMA);
  const VERSION = 1;                       // bump only when SCHEMA changes shape
  const keyOf = store => SCHEMA[store].key;

  /* ---------------- IndexedDB driver (browser, installed web app) ---------------- */
  function idbDriver(dbName) {
    let db = null;
    const open = () => new Promise((ok, no) => {
      const req = indexedDB.open(dbName, VERSION);
      req.onupgradeneeded = e => {
        const d = req.result;
        for (const [store, def] of Object.entries(SCHEMA)) {
          const s = d.objectStoreNames.contains(store) ? req.transaction.objectStore(store) : d.createObjectStore(store, { keyPath: def.key });
          for (const field of Object.keys(def.index)) if (!s.indexNames.contains(field)) s.createIndex(field, field, { unique: false });
        }
        void e;
      };
      req.onsuccess = () => { db = req.result; db.onversionchange = () => db.close(); ok(db); };
      req.onerror = () => no(req.error || Error('This browser would not open local storage.'));
      req.onblocked = () => no(Error('Another copy of this app is open and is holding the local database. Close the other tab and try again.'));
    });
    const done = tx => new Promise((ok, no) => { tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error || Error('The local save was rolled back.')); });
    const wrap = req => new Promise((ok, no) => { req.onsuccess = () => ok(req.result); req.onerror = () => no(req.error); });

    /* A handle over one IndexedDB transaction. Only these calls may be used inside tx(): an
       IndexedDB transaction closes itself the moment it waits on anything outside itself. */
    function handle(tx) {
      return {
        get: (store, key) => wrap(tx.objectStore(store).get(key)),
        put: (store, row) => wrap(tx.objectStore(store).put(row)).then(() => row),
        del: (store, key) => wrap(tx.objectStore(store).delete(key)).then(() => true),
        count: store => wrap(tx.objectStore(store).count()),
        all: (store, q = {}) => query(tx.objectStore(store), q)
      };
    }
    function query(os, q) {
      const src = q.index ? os.index(q.index) : os;
      let range = null;
      try {
        if (q.equals !== undefined) range = IDBKeyRange.only(q.equals);
        else if (q.from !== undefined && q.to !== undefined) range = IDBKeyRange.bound(q.from, q.to);
        else if (q.from !== undefined) range = IDBKeyRange.lowerBound(q.from);
        else if (q.to !== undefined) range = IDBKeyRange.upperBound(q.to);
      } catch { range = null; }
      const out = [], limit = q.limit || Infinity;
      let skip = q.offset || 0;
      return new Promise((ok, no) => {
        const req = src.openCursor(range, q.desc ? 'prev' : 'next');
        req.onsuccess = () => {
          const c = req.result;
          if (!c || out.length >= limit) return ok(out);
          if (skip > 0) { skip--; c.continue(); return; }
          out.push(c.value); c.continue();
        };
        req.onerror = () => no(req.error);
      });
    }
    return {
      kind: 'indexeddb',
      async open() { if (!db) await open(); return true; },
      async tx(stores, fn) {
        const tx = db.transaction(stores, 'readwrite');
        const finished = done(tx);
        let result;
        try { result = await fn(handle(tx)); }
        catch (e) { try { tx.abort(); } catch { /* already gone */ } throw e; }
        await finished;                      // only resolves once everything is really written
        return result;
      },
      async read(stores, fn) {
        const tx = db.transaction(stores, 'readonly');
        const r = await fn(handle(tx));
        await done(tx).catch(() => {});
        return r;
      },
      async wipe() { if (db) { db.close(); db = null; } await new Promise(ok => { const r = indexedDB.deleteDatabase(dbName); r.onsuccess = r.onerror = r.onblocked = () => ok(); }); }
    };
  }

  /* ---------------- SQLite driver (installed Windows / Android app) ----------------
     `runner` supplies two calls: execute(sql, params) and select(sql, params).
     Tauri's SQL plugin provides them on a device; the test suite provides the same two
     calls over a plain SQLite file, so this code path is exercised without the app. */
  function sqlDriver(runner) {
    const col = f => 'i_' + f;
    const ddl = [];
    for (const [store, def] of Object.entries(SCHEMA)) {
      const extra = Object.entries(def.index).map(([f, t]) => `, ${col(f)} ${t === 'int' ? 'INTEGER' : 'TEXT'}`).join('');
      ddl.push(`CREATE TABLE IF NOT EXISTS ${store} (k TEXT PRIMARY KEY, doc TEXT NOT NULL${extra})`);
      for (const f of Object.keys(def.index)) ddl.push(`CREATE INDEX IF NOT EXISTS ix_${store}_${f} ON ${store}(${col(f)})`);
    }
    const row = (store, r) => {
      const def = SCHEMA[store], vals = [String(r[def.key]), JSON.stringify(r)];
      const cols = ['k', 'doc'];
      for (const f of Object.keys(def.index)) { cols.push(col(f)); vals.push(r[f] === undefined || r[f] === null ? null : (SCHEMA[store].index[f] === 'int' ? Number(r[f]) : String(r[f]))); }
      return { sql: `INSERT INTO ${store} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ` +
                    `ON CONFLICT(k) DO UPDATE SET ${cols.slice(1).map(c => `${c}=excluded.${c}`).join(',')}`, vals };
    };
    const parse = rs => (rs || []).map(x => JSON.parse(x.doc));
    function where(store, q) {
      const c = q.index ? col(q.index) : 'k';
      const parts = [], vals = [];
      if (q.equals !== undefined) { parts.push(`${c} = ?`); vals.push(q.equals); }
      if (q.from !== undefined) { parts.push(`${c} >= ?`); vals.push(q.from); }
      if (q.to !== undefined) { parts.push(`${c} <= ?`); vals.push(q.to); }
      return { clause: parts.length ? ' WHERE ' + parts.join(' AND ') : '', vals, order: ` ORDER BY ${c} ${q.desc ? 'DESC' : 'ASC'}` };
    }
    const handle = {
      async get(store, key) { const r = await runner.select(`SELECT doc FROM ${store} WHERE k = ?`, [String(key)]); return r[0] ? JSON.parse(r[0].doc) : undefined; },
      async put(store, r) { const q = row(store, r); await runner.execute(q.sql, q.vals); return r; },
      async del(store, key) { await runner.execute(`DELETE FROM ${store} WHERE k = ?`, [String(key)]); return true; },
      async count(store) { const r = await runner.select(`SELECT COUNT(*) n FROM ${store}`); return Number(r[0].n); },
      async all(store, q = {}) {
        const w = where(store, q);
        const lim = q.limit ? ` LIMIT ${Number(q.limit)}` : (q.offset ? ' LIMIT -1' : '');
        const off = q.offset ? ` OFFSET ${Number(q.offset)}` : '';
        return parse(await runner.select(`SELECT doc FROM ${store}${w.clause}${w.order}${lim}${off}`, w.vals));
      }
    };
    let depth = 0;
    return {
      kind: 'sqlite',
      async open() {
        await runner.execute('PRAGMA journal_mode = WAL');      // survives a sudden power cut
        await runner.execute('PRAGMA foreign_keys = ON');
        await runner.execute('PRAGMA synchronous = FULL');      // a saved bill is really on disk
        for (const s of ddl) await runner.execute(s);
        return true;
      },
      async tx(stores, fn) {
        void stores;
        if (depth++ > 0) { try { return await fn(handle); } finally { depth--; } }
        await runner.execute('BEGIN IMMEDIATE');
        try { const r = await fn(handle); await runner.execute('COMMIT'); return r; }
        catch (e) { try { await runner.execute('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
        finally { depth--; }
      },
      async read(stores, fn) { void stores; return fn(handle); },
      async wipe() { for (const s of STORES) await runner.execute(`DELETE FROM ${s}`); }
    };
  }

  /* ---------------- choosing a driver ---------------- */
  let driver = null, ready = null;
  const tauriSql = () => {
    const t = typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (!t) return null;
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') return null;
    const DB = 'sqlite:restaurant-till.db';
    // The SQL plugin wants the file opened once before anything is asked of it. It is also
    // listed under "preload" in tauri.conf.json; asking again here costs nothing and means a
    // changed configuration can never leave the till with no database.
    let loaded = null;
    const ready = () => (loaded ||= invoke('plugin:sql|load', { db: DB }).catch(e => { loaded = null; throw e; }));
    return {
      async execute(sql, params = []) { await ready(); return invoke('plugin:sql|execute', { db: DB, query: sql, values: params }); },
      async select(sql, params = []) { await ready(); return invoke('plugin:sql|select', { db: DB, query: sql, values: params }); }
    };
  };

  function open({ name = 'restaurant-till', runner = null } = {}) {
    if (ready) return ready;
    const low = runner || tauriSql();
    driver = low ? sqlDriver(low) : idbDriver(name);
    ready = driver.open().then(() => driver).catch(e => { ready = null; throw e; });
    return ready;
  }

  const need = () => { if (!driver) throw Error('The local database is not open yet.'); return driver; };
  return {
    SCHEMA, STORES, VERSION, keyOf, open,
    get kind() { return driver ? driver.kind : 'none'; },
    get isOpen() { return !!driver; },
    tx: (stores, fn) => need().tx(stores, fn),
    read: (stores, fn) => need().read(stores, fn),
    get: (store, key) => need().read([store], h => h.get(store, key)),
    all: (store, q) => need().read([store], h => h.all(store, q)),
    count: store => need().read([store], h => h.count(store)),
    put: (store, row) => need().tx([store], h => h.put(store, row)),
    del: (store, key) => need().tx([store], h => h.del(store, key)),
    wipe: () => need().wipe(),
    /* exposed so the test suite can drive the SQLite path without Tauri */
    _sqlDriver: sqlDriver, _idbDriver: idbDriver
  };
})();
if (typeof module !== 'undefined') module.exports = LocalDB;
