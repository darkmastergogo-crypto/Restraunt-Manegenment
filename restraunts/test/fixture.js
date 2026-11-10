import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const migration = await readFile(new URL('../supabase/migrations/20261110021828_tenant_foundation.sql', import.meta.url), 'utf8');

export async function openFixture() {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text unique not null,email_confirmed_at timestamptz,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,not_after timestamptz);
    create table auth.mfa_factors(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,status text not null);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
  await db.exec(migration);
  await db.exec(migration);
  return db;
}

export async function addUser(db, email, { name, owner = false, aal = 'aal1', verified = true } = {}) {
  const id = randomUUID();
  const session = randomUUID();
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)', [id, email, verified ? new Date().toISOString() : null]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [session, id]);
  if (name) await db.query('insert into public.profiles(id,display_name) values($1,$2)', [id, name]);
  if (owner) await db.query('insert into platform_private.owners(user_id) values($1)', [id]);
  return { sub: id, session_id: session, email, aal, is_anonymous: false };
}

export function as(db, claims, sql, args = []) {
  return db.transaction(async transaction => {
    await transaction.exec(claims ? 'set local role authenticated' : 'set local role anon');
    await transaction.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims ?? {})]);
    return (await transaction.query(sql, args)).rows;
  });
}

export async function createRestaurant(db, owner, slug, name) {
  const [row] = await as(db, owner, 'insert into public.restaurants(slug,name) values($1,$2) returning id,slug,name', [slug, name]);
  return row;
}

export async function issue(db, actor, restaurant, email, role = 'staff') {
  const [row] = await as(db, actor, 'select public.platform_issue_invite($1,$2,$3) as invite', [restaurant, email, role]);
  return row.invite;
}

export async function accept(db, actor, invite, name = 'Team member') {
  const [row] = await as(db, actor, 'select public.platform_accept_invite($1,$2) as slug', [invite.token, name]);
  return row.slug;
}
