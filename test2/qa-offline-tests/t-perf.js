/* How it behaves on a busy, long-running till: a big item list and a lot of history.
   Timings come from this machine's SQLite; a phone will be slower, but the shape holds. */
const base = '/home/claude/src/WEBSITE/billing-suite/offline/';
global.LocalDB = require(base + 'local-db.js');
const LocalRepo = require(base + 'repo.js');
const runner = require('/home/claude/qa/off/sqlite-runner.js');
const R = [], ok = (n, c, x = '') => R.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''));
const ms = async f => { const t = process.hrtime.bigint(); const v = await f(); return [Number(process.hrtime.bigint() - t) / 1e6, v]; };
const S = { tax_enabled: false, tax_mode: 'percent', tax_value: 0, timezone: 'Asia/Kolkata' };
const ID = n => JSON.stringify(['m' + n, null]);

(async () => {
  const file = '/tmp/claude-0/perf-till.db';
  require('fs').rmSync(file, { force: true });
  await LocalDB.open({ runner: runner(file) });

  const ITEMS = 10000, BILLS = 5000;
  const items = Array.from({ length: ITEMS }, (_, i) => ({ id: ID(i), menu_id: 'm' + i, name: 'Dish ' + i, category: 'Cat ' + (i % 40),
    price: 50 + (i % 200), active: true, track_stock: i % 3 === 0, stock: 500, low_stock_at: 5, unit: 'pcs' }));
  const [tLoad] = await ms(() => LocalRepo.saveCatalogue(items, [...new Set(items.map(i => i.category))]));
  ok(`${ITEMS} items written to the device`, true, Math.round(tLoad) + ' ms');

  const [tRead, cat] = await ms(() => LocalRepo.catalogue());
  ok('reading the whole item list back', cat.items.length === ITEMS && tRead < 4000, Math.round(tRead) + ' ms');

  await LocalRepo.metaSet('invoice_block', { prefix: 'INV', digits: 6, year: 'x', start: 1, end: BILLS + 10, next: 1, fallback: 0 });
  const map = new Map(items.map(i => [i.id, i]));
  const one = async n => { const a = { p_request_id: LocalRepo.uuid(), p_items: [{ id: ID(n % ITEMS), name: 'x', qty: 1 }, { id: ID((n + 7) % ITEMS), name: 'y', qty: 2 }],
      p_payment_method: 'Cash', p_discount_value: 0, __settings: S };
    a.p_expected_total = LocalRepo.price(a, map).total; return LocalRepo.commitBill(a); };

  const [tFirst] = await ms(() => one(0));
  ok('one bill saved on a 10,000-item list', tFirst < 1500, Math.round(tFirst) + ' ms');

  const t0 = Date.now();
  for (let i = 1; i < 200; i++) await one(i);
  const per = (Date.now() - t0) / 199;
  ok('average over 200 bills', per < 500, per.toFixed(1) + ' ms each');

  // fill out a long history quickly, straight into the store
  const day = LocalRepo.dayIn();
  const bulk = [];
  for (let i = 0; i < BILLS; i++) bulk.push({ id: 'h' + i, invoice_no: 'H' + i, bill_no: 'H' + i, bill_day: day,
    created_at: new Date(Date.now() - i * 1000).toISOString(), status: 'Paid', payment_method: i % 2 ? 'Cash' : 'UPI',
    total: 100 + (i % 50), items_subtotal: 100, discount_amount: 0, tax_amount: 0, sync_state: 'synced',
    items: [{ name: 'Dish ' + (i % 200), qty: 1, price: 100, line_total: 100, item_id: ID(i % ITEMS) }] });
  await LocalDB.tx(['bills'], async h => { for (const b of bulk) await h.put('bills', b); });
  ok(`${BILLS} past bills in the history`, (await LocalDB.count('bills')) >= BILLS, String(await LocalDB.count('bills')));

  const [tPage] = await ms(() => LocalRepo.bills({ from: day, to: day, offset: 0, limit: 50 }));
  ok('opening one page of records', tPage < 4000, Math.round(tPage) + ' ms');
  const [tDash, d] = await ms(() => LocalRepo.dashboard({ from: day, to: day }));
  ok('working out the dashboard for the whole day', tDash < 6000 && d.metrics.bills >= BILLS, Math.round(tDash) + ' ms for ' + d.metrics.bills + ' bills');
  const [tFind, found] = await ms(() => LocalDB.all('items', { index: 'name', from: 'Dish 900', to: 'Dish 9009' }));
  ok('searching the item list by name', tFind < 1500 && found.length > 0, Math.round(tFind) + ' ms, ' + found.length + ' matches');

  const size = require('fs').statSync(file).size;
  ok('database size on disk', true, (size / 1048576).toFixed(1) + ' MB for ' + ITEMS + ' items + ' + (BILLS + 200) + ' bills');
  console.log(R.join('\n'));
  const bad = R.filter(x => x.startsWith('FAIL')).length;
  console.log(bad ? bad + ' FAILED' : 'all ' + R.length + ' passed');
})().catch(e => { console.log(R.join('\n')); console.error('CRASH', e.message); process.exit(1); });
