import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';
import { accept, addUser, as, createRestaurant, issue } from './fixture.js';
import { startFixture } from './http-fixture.js';

test('ten tenant manifests and icons, guarded logo storage and truthful invitation outcomes', async t => {
  const fixture = await startFixture();
  t.after(() => fixture.close());
  const { db, url } = fixture;
  const owner = await addUser(db, 'owner@example.invalid', { name: 'Owner', owner: true, aal: 'aal2' });
  const admin = await addUser(db, 'admin@example.invalid');
  const tenants = [];
  for (let i = 1; i <= 10; i++) {
    const row = await createRestaurant(db, owner, `venue-${i}`, `Venue ${i}`);
    const theme = `#${(103 + i).toString(16)}2233`;
    await as(db, owner, 'select public.platform_save_brand($1,$2,$3,$4,$5,$6)', [row.id, row.name, `V${i}`, `Seasonal dining ${i}`, theme, '#fff8eb']);
    tenants.push({ ...row, i, theme });
  }
  const [first, second] = tenants;
  await accept(db, admin, await issue(db, owner, first.id, admin.email, 'administrator'));
  const ids = new Set();
  const icons = new Set();
  for (const tenant of tenants) {
    const path = `/r/${tenant.slug}/`;
    const response = await fetch(`${url}${path}manifest.webmanifest`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/manifest\+json/);
    const data = await response.json();
    assert.deepEqual([data.name,data.short_name,data.description,data.theme_color], [tenant.name,`V${tenant.i}`,`Seasonal dining ${tenant.i}`,tenant.theme]);
    assert.deepEqual([data.id,data.start_url,data.scope,data.display], [path,path,path,'standalone']);
    ids.add(data.id);
    const buffer = Buffer.from(await (await fetch(url + data.icons[0].src)).arrayBuffer());
    const image = await sharp(buffer).metadata();
    assert.deepEqual([image.format, image.width, image.height], ['png',192,192]);
    icons.add(createHash('sha256').update(buffer).digest('hex'));
  }
  assert.equal(ids.size, 10);
  assert.equal(icons.size, 10);
  assert.equal((await fetch(`${url}/r/unknown/manifest.webmanifest`)).status, 404);

  const authorization = `Bearer ${fixture.token(admin)}`;
  const post = (route, body) => fetch(`${url}${route}`, { method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const anonymous = await fetch(`${url}/api/logo?slug=${first.slug}`, { method: 'DELETE' });
  assert.equal(anonymous.status, 401);
  assert.equal((await post(`/api/logo?slug=${second.slug}`, { image: 'AAAA' })).status, 403);
  assert.equal((await post(`/api/logo?slug=${first.slug}`, { image: 'AAAA' })).status, 503);

  // Replace only the external R2 transport. Actual endpoint, AWS signing, SQL and image processing still run.
  const realFetch = globalThis.fetch;
  const objects = new Map();
  const submitted = [];
  let providerStatus = 200;
  process.env.R2_ACCOUNT_ID = 'fixture';
  process.env.R2_BUCKET = 'test-logos';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    if (target.hostname === 'api.resend.com') {
      assert.equal(request.headers.get('authorization'), 'Bearer test-mail-key');
      submitted.push(await request.json());
      return new Response('{}', { status: providerStatus });
    }
    if (target.hostname !== 'fixture.r2.cloudflarestorage.com') return realFetch(input, init);
    assert.match(request.headers.get('authorization'), /^AWS4-HMAC-SHA256 /);
    if (request.method === 'PUT') objects.set(target.pathname, await request.arrayBuffer());
    if (request.method === 'DELETE') objects.delete(target.pathname);
    if (request.method === 'GET') return objects.has(target.pathname) ? new Response(objects.get(target.pathname)) : new Response(null, { status: 404 });
    return new Response(null, { status: 204 });
  };
  t.after(() => { globalThis.fetch = realFetch; });
  assert.equal((await post(`/api/logo?slug=${first.slug}`, { image: Buffer.from('<svg/>').toString('base64') })).status, 400);
  const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#001122' } }).png().toBuffer();
  assert.equal((await post(`/api/logo?slug=${first.slug}`, { image: png.toString('base64'), restaurant_id: second.id })).status, 204);
  assert.deepEqual([...objects.keys()], [`/test-logos/restaurants/${first.id}/branding/icon.png`]);
  assert.equal((await fetch(`${url}/api/logo?slug=${second.slug}`, { method: 'DELETE', headers: { authorization } })).status, 403);
  assert.equal((await fetch(`${url}/r/${first.slug}/icon-512.png`)).status, 200);
  assert.equal((await fetch(`${url}/api/logo?slug=${first.slug}`, { method: 'DELETE', headers: { authorization } })).status, 204);
  assert.equal(objects.size, 0);

  process.env.ALLOW_INVITATION_LINKS = 'false';
  const mail = { restaurant: first.id, email: 'staff@example.invalid', role: 'staff' };
  assert.equal((await post('/api/invite', mail)).status, 503);
  assert.deepEqual(await as(db, admin, 'select id from public.invitations where email=$1', [mail.email]), []);
  process.env.ALLOW_INVITATION_LINKS = 'true';
  assert.equal((await post('/api/invite', { ...mail, restaurant: second.id })).status, 403);
  const response = await post('/api/invite', mail);
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.email, 'unconfirmed');
  assert.match(new URL(data.link).hash, /^#invite=[a-f0-9]{64}$/);
  process.env.RESEND_API_KEY = 'test-mail-key';
  process.env.INVITATION_FROM = 'sender@example.invalid';
  process.env.ALLOW_INVITATION_LINKS = 'false';
  const delivered = await post('/api/invite', { ...mail, email: 'confirmed@example.invalid' });
  assert.deepEqual(await delivered.json(), { email: 'submitted' });
  assert.deepEqual(submitted[0].to, ['confirmed@example.invalid']);
  assert.match(submitted[0].text, /\/accept#invite=[a-f0-9]{64}/);
  providerStatus = 429;
  const unconfirmed = await post('/api/invite', { ...mail, email: 'unconfirmed@example.invalid' });
  assert.deepEqual(await unconfirmed.json(), { email: 'unconfirmed' });
  assert.deepEqual(Object.keys(await (await fetch(`${url}/api/config`)).json()).sort(), ['key','url']);
  await as(db, owner, "update public.restaurants set status='suspended' where id=$1", [first.id]);
  assert.equal((await fetch(`${url}/r/${first.slug}/manifest.webmanifest`)).status, 404);
});
