/* Two devices, one restaurant: a Windows counter and an Android phone, both billing with no
   internet at the same time, then both reconnecting. Plus the security and backup checks. */
const vm = require('vm'), fs = require('fs');
const base = '/home/claude/src/WEBSITE/billing-suite/offline/';
const runnerFor = require('/home/claude/qa/off/sqlite-runner.js');
const makeCloud = require('/home/claude/qa/off/cloud-shim.js');
const { execFileSync } = require('child_process');
const sql = q => execFileSync('su', ['postgres', '-c', `psql -At -d rxtest -c ${JSON.stringify(q).replace(/\$/g, '\\$')}`], { encoding: 'utf8' }).trim();
const R = [], ok = (n, c, x = '') => R.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + String(x).slice(0, 170) : ''));
const S = { tax_enabled: false, tax_mode: 'percent', tax_value: 0, timezone: 'Asia/Kolkata' };

/* A completely separate copy of the offline code, as if it were another machine. */
function makeDevice(label) {
  const ctx = vm.createContext({ crypto, console, setTimeout, clearTimeout, setInterval, clearInterval, Intl, Date, JSON, Math, Object, Array, String, Number, Promise, Error, Map, Set, URL, isNaN, parseInt, parseFloat,
    navigator: { onLine: true, platform: label, userAgent: label },
    document: { hidden: false, addEventListener() {} },
    addEventListener() {}, module: undefined });
  ctx.globalThis = ctx;
  for (const f of ['local-db.js', 'repo.js', 'sync.js']) vm.runInContext(fs.readFileSync(base + f, 'utf8'), ctx, { filename: f });
  return { ctx, label,
    DB: vm.runInContext('LocalDB', ctx), Repo: vm.runInContext('LocalRepo', ctx), Sync: vm.runInContext('SyncEngine', ctx),
    nav: ctx.navigator };
}

(async () => {
  const dish = sql("select menu_id from menu_stock where tracked limit 1");
  const variant = sql(`select variant from menu_stock where menu_id='${dish}' and tracked limit 1`);
  const START = 20;
  sql(`update menu_stock set remaining=${START} where menu_id='${dish}' and variant='${variant}'`);
  const itemId = JSON.stringify([dish, variant === 'single' ? null : variant]);
  const catalogue = [{ id: itemId, menu_id: dish, name: 'Shared dish', category: 'Momos', price: 100, active: true, track_stock: true, stock: START, unit: 'pcs' }];

  const A = makeDevice('windows-counter'), B = makeDevice('android-phone');
  for (const d of [A, B]) {
    d.cloud = makeCloud();
    await d.DB.open({ runner: runnerFor() });
    d.Sync._setCloud(d.cloud);
    await d.Sync.register();
    await d.Sync.topUpInvoices(true);
    await d.Repo.saveCatalogue(catalogue, ['Momos']);
  }
  ok('two devices registered separately', A.Sync.device !== B.Sync.device && Number(sql('select count(*) from rx20_devices')) === 2);
  const bA = await A.Repo.invoiceState(), bB = await B.Repo.invoiceState();
  ok('each device holds its own range of invoice numbers, with no overlap',
    bA.end < bB.start || bB.end < bA.start, `A ${bA.start}-${bA.end} / B ${bB.start}-${bB.end}`);

  // ---------------- both go offline and both sell the same dish ----------------
  for (const d of [A, B]) { d.cloud.online = false; d.nav.onLine = false; }
  const sell = async (d, n) => { const out = [];
    for (let i = 0; i < n; i++) {
      const a = { p_request_id: d.Repo.uuid(), p_items: [{ id: itemId, name: 'Shared dish', qty: 1 }], p_payment_method: 'Cash', p_discount_value: 0, __settings: S };
      a.p_expected_total = d.Repo.price(a, new Map(catalogue.map(i2 => [i2.id, i2]))).total;
      out.push(await d.Repo.commitBill(a));
    } return out; };
  const soldA = await sell(A, 8), soldB = await sell(B, 15);
  ok('counter sold 8 and phone sold 15, both with no internet', soldA.length === 8 && soldB.length === 15);
  ok('the two devices never picked the same invoice number',
    new Set([...soldA, ...soldB].map(b => b.invoice_no)).size === 23,
    soldA[0].invoice_no + ' … ' + soldB[0].invoice_no);
  ok('each device shows only what it sold', (await A.DB.count('bills')) === 8 && (await B.DB.count('bills')) === 15);

  // ---------------- both come back ----------------
  for (const d of [A, B]) { d.cloud.online = true; d.nav.onLine = true; }
  for (let i = 0; i < 6; i++) { await A.Sync.syncNow({ quiet: true }); await B.Sync.syncNow({ quiet: true }); }
  const orders = Number(sql('select count(*) from orders'));
  ok('all 23 bills from both devices are on the server', orders === 23, String(orders));
  ok('and every one of them is a different invoice number', sql('select count(distinct invoice_no) from orders') === '23', sql('select count(distinct invoice_no) from orders'));
  const left = Number(sql(`select remaining from menu_stock where menu_id='${dish}' and variant='${variant}'`));
  const ledger = Number(sql("select coalesce(sum(change),0) from rx20_stock_moves where reason='sale'"));
  const short = Number(sql('select coalesce(sum(shortfall),0) from rx20_stock_moves'));
  ok('stock was counted, not overwritten: 23 sold from 20 in stock', left === 0 && ledger === -23, `left ${left}, ledger ${ledger}`);
  ok('the 3 sold beyond stock are flagged for a person to look at', short === 3 && Number(sql("select count(*) from rx20_flags where kind='stock_short'")) > 0, 'short ' + short);
  ok('neither outbox has anything stuck', (await A.Repo.pending()).length === 0 && (await B.Repo.pending()).length === 0);
  ok('both devices now show their bills as sent',
    (await A.DB.all('bills', { index: 'sync_state', equals: 'synced' })).length === 8 &&
    (await B.DB.all('bills', { index: 'sync_state', equals: 'synced' })).length === 15);

  // the phone learns about the counter's sales when it next downloads
  await B.Sync.pullOnce();
  const stockOnB = (await B.DB.get('items', itemId)).stock;
  ok('the phone now shows the real shared stock, not just its own guess', stockOnB === 0, String(stockOnB));

  // ---------------- security ----------------
  let msg = '';
  try { await A.cloud.rpc('restaurant_sync_push20', { p_device: '00000000-0000-4000-8000-0000000000ff', p_ops: [] }); } catch (e) { msg = e.message; }
  ok('an unknown device cannot send anything', /not registered|turned off/i.test(msg), msg);
  sql(`update rx20_devices set revoked = true where id = '${B.Sync.device}'`);
  msg = '';
  try { await B.cloud.rpc('restaurant_sync_push20', { p_device: B.Sync.device, p_ops: [] }); } catch (e) { msg = e.message; }
  ok('a device switched off by the owner is refused', /not registered|turned off/i.test(msg), msg);
  sql(`update rx20_devices set revoked = false where id = '${B.Sync.device}'`);

  const replay = await A.cloud.rpc('restaurant_sync_push20', { p_device: A.Sync.device,
    p_ops: [{ op_id: soldB[0].op_id, kind: 'bill.create', payload: { invoice_no: soldB[0].invoice_no, items: [{ id: dish, size: variant, name: 'x', qty: 1, price: 100 }], total: 100, discount_amount: 0, tax_amount: 0 } }] });
  ok('one device replaying another device’s bill makes no copy of it',
    replay.results[0].repeat === true && Number(sql('select count(*) from orders')) === 23, JSON.stringify(replay.results[0].repeat));

  const junk = await A.cloud.rpc('restaurant_sync_push20', { p_device: A.Sync.device,
    p_ops: [{ op_id: A.Repo.uuid(), kind: 'bill.create', payload: { items: [{ id: dish, name: 'x', qty: -5, price: 100 }], total: -500, discount_amount: 0, tax_amount: 0 } }] });
  ok('a bill with a negative quantity is refused for good', junk.results[0].ok === false && junk.results[0].permanent === true, JSON.stringify(junk.results[0].error));
  ok('and it created nothing', Number(sql('select count(*) from orders')) === 23);

  // ---------------- backup and restore ----------------
  const C = makeDevice('replacement');
  C.cloud = makeCloud(); await C.DB.open({ runner: runnerFor() }); C.Sync._setCloud(C.cloud);
  const backup = { format: 'restaurant-till-backup', version: 1, at: A.Repo.nowISO(), device: A.Sync.device, stores: {} };
  for (const s of A.DB.STORES) backup.stores[s] = await A.DB.all(s, {});
  ok('a backup carries the bills and anything still unsent', backup.stores.bills.length === 8);
  let added = 0;
  for (const store of C.DB.STORES) { if (store === 'meta') continue;
    for (const row of backup.stores[store] || []) { const k = row[C.DB.keyOf(store)];
      if (k === undefined || await C.DB.get(store, k)) continue; await C.DB.put(store, row); if (store === 'bills') added++; } }
  ok('restoring onto a replacement device brings every bill back', added === 8 && (await C.DB.count('bills')) === 8);
  ok('the replacement device keeps its own identity, not the old one', (await C.Repo.deviceId()) !== A.Sync.device);

  console.log(R.join('\n'));
  const bad = R.filter(x => x.startsWith('FAIL')).length;
  console.log(bad ? bad + ' FAILED' : 'all ' + R.length + ' passed');
})().catch(e => { console.log(R.join('\n')); console.error('CRASH', e.stack.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
