/* The whole thing in a real browser: sign in, bill with the network cut, close the app,
   reopen it still offline, then reconnect and watch everything arrive exactly once. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const ROOT = '/home/claude/src/WEBSITE';
const SECRET = 'local-test-secret-local-test-secret-123456';
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const jwt = c => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ ...c, exp: Math.floor(Date.now() / 1000) + 3600 });
  return h + '.' + p + '.' + crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url'); };
const sql = q => execFileSync('su', ['postgres', '-c', `psql -At -d rxtest -c ${JSON.stringify(q).replace(/\$/g, '\\$')}`], { encoding: 'utf8' }).trim();
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' };
const R = [], ok = (n, c, x = '') => { R.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + String(x).slice(0, 170) : '')); };
const net = { cloud: true, files: true };
const refresh = new Map();

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'allow' });
  const logs = [];
  await ctx.route('https://ibqubjavznusojfgmllp.supabase.co/**', async r => {
    if (!net.cloud) return r.abort('internetdisconnected');
    const req = r.request(), u = new URL(req.url()); let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch { /* none */ }
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.startsWith('/auth/')) {
      const H = { 'access-control-allow-origin': '*' };
      if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
        const row = sql(`select id||'|'||email from auth.users where lower(email)=lower('${String(body.email).replace(/'/g, "''")}') and encrypted_password=extensions.crypt('${String(body.password).replace(/'/g, "''")}',encrypted_password)`);
        if (!row) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error_description: 'Invalid login credentials' }), headers: H });
        const [id, email] = row.split('|'); const rt = crypto.randomUUID(); refresh.set(rt, { id, email });
        return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ access_token: jwt({ sub: id, role: 'authenticated', email, aud: 'authenticated' }), refresh_token: rt, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id, email } }) });
      }
      if (u.pathname === '/auth/v1/token') { const x = refresh.get(body.refresh_token); if (!x) return r.fulfill({ status: 400, contentType: 'application/json', headers: H, body: JSON.stringify({ error_description: 'Invalid Refresh Token' }) });
        const rt = crypto.randomUUID(); refresh.set(rt, x);
        return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ access_token: jwt({ sub: x.id, role: 'authenticated', email: x.email, aud: 'authenticated' }), refresh_token: rt, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: x.id, email: x.email } }) });
      }
      if (u.pathname === '/auth/v1/logout') return r.fulfill({ status: 204, body: '', headers: H });
      if (u.pathname === '/auth/v1/user') { const t = (req.headers().authorization || '').split(' ')[1]; try { const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url')); return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ id: p.sub, email: p.email, factors: [] }) }); } catch { return r.fulfill({ status: 401, body: '{}', headers: H }); } }
      return r.fulfill({ status: 404, body: '{}', headers: H });
    }
    if (u.pathname.startsWith('/rest/v1/')) {
      const h = { ...req.headers() }, bearer = (h.authorization || '').split(' ')[1] || '';
      let tok = jwt({ role: 'anon' });
      try { const p = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url')); if (p.role === 'authenticated') tok = bearer; } catch { /* anon */ }
      const res = await fetch('http://127.0.0.1:3000' + u.pathname.slice(8) + u.search, { method: req.method(), headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, prefer: h.prefer || '' }, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() });
      const text = await res.text();
      if (res.status >= 400) logs.push('API ' + res.status + ' ' + u.pathname + ' ' + text.slice(0, 160));
      return r.fulfill({ status: res.status, body: text, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
    }
    return r.fulfill({ status: 404, body: '{}' });
  });
  await ctx.route('https://app.test/**', async r => {
    if (!net.files) return r.abort('internetdisconnected');
    const u = new URL(r.request().url()); let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' });
    return r.fulfill({ status: 404, body: 'nf' });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

  const page = await ctx.newPage();
  page.on('pageerror', e => logs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts|ERR_|net::/.test(m.text())) logs.push('CONSOLE ' + m.text().slice(0, 200)); });
  const close = () => page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  const toast = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
  const chip = () => page.textContent('#syncChip').catch(() => '(none)');

  // ---------- online: sign in, device registers, numbers collected ----------
  await page.goto('https://app.test/billing-suite/index.html');
  await page.waitForSelector('#loginForm', { timeout: 15000 });
  await page.fill('#loginForm input[name=email]', 'owner@yummy.test');
  await page.fill('#loginForm input[name=password]', 'secret123');
  await page.click('#loginForm button.btn-primary');
  await page.waitForSelector('.side-nav', { timeout: 20000 });
  await page.waitForTimeout(4000);
  ok('app opens and the saving chip is in the top bar', (await page.locator('#syncChip').count()) === 1, await chip());
  ok('the device registered itself', Number(sql('select count(*) from rx20_devices')) >= 1);
  const blockRows = Number(sql('select count(*) from rx20_invoice_blocks'));
  ok('invoice numbers collected in advance', blockRows >= 1, 'blocks=' + blockRows);
  ok('the item list is copied onto the device', await page.evaluate(async () => (await LocalDB.count('items')) > 0));
  ok('local database is the browser one here', await page.evaluate(() => LocalDB.kind) === 'indexeddb', await page.evaluate(() => LocalDB.kind));

  // ---------- one bill while online ----------
  await close(); await page.evaluate(() => location.hash = '#/billing'); await page.waitForTimeout(2500);
  await page.click('#bGrid [data-add]'); await page.click('#tSave'); await page.waitForTimeout(3000);
  const onlineBill = await toast();
  ok('a bill saved while online', /saved/i.test(onlineBill), onlineBill);
  ok('and it reached the server', Number(sql("select count(*) from orders")) === 1, sql("select count(*) from orders"));

  // ---------- THE INTERNET GOES AWAY ----------
  net.cloud = false;
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); });
  await page.waitForTimeout(800);
  const before = Number(sql("select count(*) from orders"));
  for (let i = 0; i < 12; i++) { await page.click('#bGrid [data-add]'); await page.click('#tSave'); await page.waitForTimeout(450); }
  await page.waitForTimeout(1500);
  const offText = await toast();
  ok('bills keep saving with no internet', /saved/i.test(offText), offText);
  ok('twelve bills are held on the device', await page.evaluate(async () => (await LocalRepo.pending()).length) === 12, String(await page.evaluate(async () => (await LocalRepo.pending()).length)));
  ok('nothing new reached the server', Number(sql("select count(*) from orders")) === before);
  ok('the chip says it is offline', /offline/i.test(await chip()), await chip());
  await page.screenshot({ path: '/home/claude/qa/v19/off-billing.png' });

  // ---------- close the app and open it again, still with no internet ----------
  net.files = false;                       // nothing at all can be fetched: only the device itself
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(6000);
  const reopened = await page.locator('.side-nav').count();
  ok('the app opens again with the network completely cut', reopened === 1, 'side nav=' + reopened);
  await page.screenshot({ path: '/home/claude/qa/v19/off-reopened.png' });
  if (reopened) {
    await close(); await page.evaluate(() => location.hash = '#/records'); await page.waitForTimeout(2500);
    const rows = await page.locator('#rBody tr[data-id]').count();
    ok('the offline bills are all still listed after reopening', rows >= 13, 'rows=' + rows);
    await page.screenshot({ path: '/home/claude/qa/v19/off-records.png' });
    await close(); await page.evaluate(() => location.hash = '#/billing'); await page.waitForTimeout(2000);
    await page.click('#bGrid [data-add]').catch(() => {});
    await page.click('#tSave').catch(() => {});
    await page.waitForTimeout(1500);
    ok('a new bill can still be taken after reopening offline', /saved/i.test(await toast()), await toast());
  }

  // ---------- the internet comes back ----------
  net.files = true; net.cloud = true;
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); });
  await page.waitForTimeout(12000);
  const pend = await page.evaluate(async () => (await LocalRepo.pending()).length).catch(() => -1);
  const served = Number(sql("select count(*) from orders"));
  ok('everything taken offline reached the server', served >= 14, 'orders=' + served);
  ok('the outbox emptied', pend === 0, 'pending=' + pend);
  ok('no duplicates on the server', sql("select count(*)||'/'||count(distinct invoice_no) from orders").split('/')[0] === sql("select count(distinct invoice_no) from orders"), sql("select count(*)||' bills, '||count(distinct invoice_no)||' numbers' from orders"));
  ok('the chip says everything is saved', /saved|synced/i.test(await chip()), await chip());
  await page.screenshot({ path: '/home/claude/qa/v19/off-synced.png' });
  await close(); await page.click('#syncChip'); await page.waitForTimeout(1200);
  await page.screenshot({ path: '/home/claude/qa/v19/off-panel.png' });

  console.log(R.join('\n'));
  const bad = R.filter(x => x.startsWith('FAIL')).length;
  console.log(bad ? bad + ' FAILED' : 'all ' + R.length + ' passed');
  if (logs.length) console.log('--- page log ---\n' + logs.slice(0, 12).join('\n'));
  await browser.close();
})().catch(e => { console.log(R.join('\n')); console.error('CRASH', e.message.split('\n')[0]); process.exit(1); });
