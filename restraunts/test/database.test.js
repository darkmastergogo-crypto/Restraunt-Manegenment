import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { accept, addUser, as, createRestaurant, issue, openFixture } from './fixture.js';

test('idempotent schema and ten simultaneous tenant identities use live RLS, membership and session state', async t => {
  const db = await openFixture();
  t.after(() => db.close());
  const owner = await addUser(db, 'owner@example.invalid', { name: 'Platform owner', owner: true, aal: 'aal2' });
  const ownerAal1 = { ...owner, aal: 'aal1' };
  assert.deepEqual(await as(db, ownerAal1, 'select * from public.restaurants'), []);
  await assert.rejects(createRestaurant(db, ownerAal1, 'no-mfa', 'No MFA'), { code: '42501' });
  assert.equal((await as(db, ownerAal1, 'select public.platform_identity() as identity'))[0].identity.owner_enrollment, true);

  const tenants = [];
  for (let i = 1; i <= 10; i++) {
    const row = await createRestaurant(db, owner, `kitchen-${i}`, `Kitchen ${i}`);
    const member = await addUser(db, `member${i}@example.invalid`);
    const invite = await issue(db, owner, row.id, member.email, 'administrator');
    assert.match(invite.token, /^[0-9a-f]{64}$/);
    assert.equal(await accept(db, member, invite, `Administrator ${i}`), row.slug);
    await assert.rejects(accept(db, member, invite), { code: '42501' });
    const color = `#${(100 + i).toString(16)}2131`;
    await as(db, member, 'select public.platform_save_brand($1,$2,$3,$4,$5,$6)', [row.id, row.name, `K${i}`, `Seasonal ${i}`, color, '#fff8eb']);
    tenants.push({ ...row, member, color, i });
  }
  await Promise.all(tenants.map(async tenant => {
    const other = tenants[tenant.i % 10];
    assert.deepEqual(await as(db, tenant.member, 'select id from public.restaurants'), [{ id: tenant.id }]);
    assert.deepEqual(await as(db, tenant.member, 'select restaurant_id from public.restaurant_branding'), [{ restaurant_id: tenant.id }]);
    assert.deepEqual(await as(db, tenant.member, 'select restaurant_id from public.memberships'), [{ restaurant_id: tenant.id }]);
    assert.deepEqual(await as(db, tenant.member, 'select id from public.platform_audit'), []);
    assert.deepEqual(await as(db, tenant.member, 'select id from public.invitations where restaurant_id=$1', [other.id]), []);
    assert.deepEqual(await as(db, tenant.member, 'select id from public.profiles where id=$1', [other.member.sub]), []);
    assert.deepEqual(await as(db, tenant.member, "update public.restaurant_branding set slogan='Injected' where restaurant_id=$1 returning restaurant_id", [other.id]), []);
    assert.deepEqual(await as(db, tenant.member, 'select public.platform_brand_target($1) as id', [other.slug]), [{ id: null }]);
    await assert.rejects(issue(db, tenant.member, other.id, 'outsider@example.invalid'), { code: '42501' });
    await assert.rejects(as(db, tenant.member, 'select public.platform_overview()'), { code: '42501' });
    const [{ brand }] = await as(db, null, 'select public.platform_brand($1) as brand', [tenant.slug]);
    assert.deepEqual(brand, { id: tenant.id, slug: tenant.slug, name: tenant.name, short_name: `K${tenant.i}`, slogan: `Seasonal ${tenant.i}`,
      theme_color: tenant.color, background_color: '#fff8eb' });
  }));

  const [a, b] = tenants;
  await assert.rejects(as(db, a.member, 'select token_hash from public.invitations'), { code: '42501' });
  await assert.rejects(as(db, a.member, "update public.memberships set role='administrator'"), { code: '42501' });
  await assert.rejects(as(db, a.member, 'select * from platform_private.owners'), { code: '42501' });
  await assert.rejects(as(db, null, 'select * from public.restaurants'), { code: '42501' });
  await assert.rejects(as(db, null, 'select public.platform_identity()'), { code: '42501' });
  assert.deepEqual(await as(db, { ...a.member, session_id: randomUUID() }, 'select id from public.restaurants'), []);
  assert.deepEqual(await as(db, { ...a.member, is_anonymous: true }, 'select id from public.restaurants'), []);
  assert.deepEqual(await as(db, { ...a.member, aal: 'aal2', user_metadata: { owner: true } }, 'select id from public.restaurants'), [{ id: a.id }]);
  const [{ totals }] = await as(db, owner, 'select public.platform_overview() as totals');
  assert.deepEqual(totals, { restaurants: 10, active: 0, trial: 10, suspended: 0, users: 11, pending: 0 });

  await as(db, owner, "update public.restaurants set status='suspended' where id=$1", [a.id]);
  assert.deepEqual(await as(db, a.member, 'select id from public.restaurants'), []);
  assert.deepEqual(await as(db, null, 'select public.platform_brand($1) as brand', [a.slug]), [{ brand: null }]);
  assert.deepEqual(await as(db, b.member, 'select id from public.restaurants'), [{ id: b.id }]);
  await as(db, owner, 'update public.profiles set active=false where id=$1', [b.member.sub]);
  assert.deepEqual(await as(db, b.member, 'select id from public.restaurants'), []);
  await as(db, owner, 'update public.profiles set active=true where id=$1', [b.member.sub]);
  await db.query('delete from auth.sessions where id=$1', [b.member.session_id]);
  assert.deepEqual(await as(db, b.member, 'select id from public.restaurants'), []);
});

test('invites enforce intended email, expiry, one-time consumption, replacement, and role boundaries', async t => {
  const db = await openFixture();
  t.after(() => db.close());
  const owner = await addUser(db, 'owner@example.invalid', { name: 'Owner', owner: true, aal: 'aal2' });
  const restaurant = await createRestaurant(db, owner, 'pepper-house', 'Pepper House');
  const admin = await addUser(db, 'admin@example.invalid');
  const staff = await addUser(db, 'staff@example.invalid');
  const stranger = await addUser(db, 'stranger@example.invalid');
  const unverified = await addUser(db, 'unverified@example.invalid', { verified: false });
  await accept(db, admin, await issue(db, owner, restaurant.id, admin.email, 'administrator'));
  await assert.rejects(issue(db, admin, restaurant.id, stranger.email, 'administrator'), { code: '42501' });
  await assert.rejects(accept(db, unverified, await issue(db, admin, restaurant.id, unverified.email)), { code: '42501' });
  const first = await issue(db, admin, restaurant.id, staff.email);
  await assert.rejects(accept(db, stranger, first), { code: '42501' });
  await assert.rejects(issue(db, admin, restaurant.id, staff.email), { code: '22023' });
  await db.query("update public.invitations set created_at=now()-interval '3 days',expires_at=now()-interval '1 day' where email=$1", [staff.email]);
  await assert.rejects(accept(db, staff, first), { code: '42501' });
  const replacement = await issue(db, admin, restaurant.id, staff.email);
  assert.notEqual(first.token, replacement.token);
  const double = await Promise.allSettled([accept(db, staff, replacement), accept(db, staff, replacement)]);
  assert.equal(double.filter(result => result.status === 'fulfilled').length, 1);
  assert.deepEqual(await as(db, staff, 'select role from public.memberships'), [{ role: 'staff' }]);
  await assert.rejects(as(db, staff, 'select public.platform_save_brand($1,$2,$3,$4,$5,$6)', [restaurant.id, 'Stolen', '', '', '#123456', '#ffffff']), { code: '42501' });
  await assert.rejects(as(db, admin, "select public.platform_set_membership($1,$2,'administrator',true)", [restaurant.id, staff.sub]), { code: '42501' });
  const cancelled = await issue(db, admin, restaurant.id, stranger.email);
  const [invite] = await as(db, admin, 'select id from public.invitations where email=$1', [stranger.email]);
  await as(db, admin, 'select public.platform_cancel_invite($1,$2)', [restaurant.id, invite.id]);
  await assert.rejects(accept(db, stranger, cancelled), { code: '42501' });
  await as(db, admin, "select public.platform_set_membership($1,$2,'staff',false)", [restaurant.id, staff.sub]);
  assert.deepEqual(await as(db, staff, 'select id from public.restaurants'), []);
  await db.query("insert into auth.mfa_factors(id,user_id,status) values($1,$2,'verified')", [randomUUID(), admin.sub]);
  assert.deepEqual(await as(db, admin, 'select id from public.restaurants'), []);
  assert.deepEqual(await as(db, { ...admin, aal: 'aal2' }, 'select id from public.restaurants'), [{ id: restaurant.id }]);
});
