begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists platform_private;
revoke all on schema platform_private from public, anon, authenticated;
grant usage on schema platform_private to anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists platform_private.owners (
  user_id uuid primary key references public.profiles(id) on delete cascade
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  status text not null default 'trial' check (status in ('trial','active','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_branding (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  short_name text not null default '' check (char_length(short_name) <= 24),
  slogan text not null default '' check (char_length(slogan) <= 120),
  theme_color text not null default '#571e2d' check (theme_color ~ '^#[a-fA-F0-9]{6}$'),
  background_color text not null default '#f9f2eb' check (background_color ~ '^#[a-fA-F0-9]{6}$')
);

create table if not exists public.memberships (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('administrator','manager','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (restaurant_id,user_id)
);
create index if not exists memberships_by_user on public.memberships(user_id,restaurant_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email = lower(btrim(email))),
  role text not null check (role in ('administrator','manager','staff')),
  token_hash bytea not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  cancelled_at timestamptz
);
create unique index if not exists invitations_pending_email on public.invitations(restaurant_id,email)
  where accepted_at is null and cancelled_at is null;
create index if not exists invitations_by_restaurant on public.invitations(restaurant_id,created_at desc);

create table if not exists public.platform_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  restaurant_id uuid,
  event text not null,
  target_id uuid
);
create index if not exists platform_audit_recent on public.platform_audit(occurred_at desc,id desc);

alter table platform_private.owners enable row level security;
alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_branding enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.platform_audit enable row level security;

revoke all on platform_private.owners, public.profiles, public.restaurants, public.restaurant_branding,
  public.memberships, public.invitations, public.platform_audit from public, anon, authenticated;
grant select on public.profiles, public.restaurants, public.restaurant_branding, public.memberships, public.platform_audit to authenticated;
grant select (id,restaurant_id,email,role,created_at,expires_at,accepted_at,cancelled_at) on public.invitations to authenticated;
grant insert (slug,name) on public.restaurants to authenticated;
grant update (name,status) on public.restaurants to authenticated;
grant update (active) on public.profiles to authenticated;
grant update (short_name,slogan,theme_color,background_color) on public.restaurant_branding to authenticated;

-- The JWT establishes identity. Postgres checks the live account and session on every protected request.
create or replace function platform_private.verified_user()
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u join auth.sessions s on s.user_id = u.id
  where u.id = (select auth.uid()) and s.id::text = (select auth.jwt()->>'session_id')
    and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false'
    and u.email_confirmed_at is not null and coalesce(u.banned_until <= now(), true)
    and coalesce(s.not_after > now(), true)
$$;

create or replace function platform_private.active_user()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p where p.id = (select platform_private.verified_user()) and p.active
    and ((select auth.jwt()->>'aal') = 'aal2' or not exists (
      select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified'))
$$;

create or replace function platform_private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false) and exists (
    select 1 from platform_private.owners o where o.user_id = (select platform_private.active_user()))
$$;

create or replace function platform_private.tenant_role(p_restaurant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m join public.restaurants r on r.id = m.restaurant_id
  where m.restaurant_id = p_restaurant and m.user_id = (select platform_private.active_user())
    and m.active and r.status in ('trial','active')
$$;

create or replace function platform_private.can_read_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships subject
    join public.memberships manager using (restaurant_id)
    join public.restaurants r on r.id = manager.restaurant_id
    where subject.user_id = p_user and manager.user_id = (select platform_private.active_user())
      and manager.active and manager.role = 'administrator' and r.status in ('trial','active'))
$$;

drop policy if exists profile_read on public.profiles;
create policy profile_read on public.profiles for select to authenticated using (
  id = (select platform_private.active_user()) or (select platform_private.is_owner()) or platform_private.can_read_profile(id));
drop policy if exists profile_update on public.profiles;
create policy profile_update on public.profiles for update to authenticated
  using ((select platform_private.is_owner()) and id <> (select auth.uid()))
  with check ((select platform_private.is_owner()) and id <> (select auth.uid()));

drop policy if exists restaurant_read on public.restaurants;
create policy restaurant_read on public.restaurants for select to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(id) is not null);
drop policy if exists restaurant_create on public.restaurants;
create policy restaurant_create on public.restaurants for insert to authenticated with check ((select platform_private.is_owner()));
drop policy if exists restaurant_update on public.restaurants;
create policy restaurant_update on public.restaurants for update to authenticated
  using ((select platform_private.is_owner())) with check ((select platform_private.is_owner()));

drop policy if exists branding_read on public.restaurant_branding;
create policy branding_read on public.restaurant_branding for select to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) is not null);
drop policy if exists branding_update on public.restaurant_branding;
create policy branding_update on public.restaurant_branding for update to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator') with check (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator');

drop policy if exists membership_read on public.memberships;
create policy membership_read on public.memberships for select to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
  or (user_id = (select platform_private.active_user()) and platform_private.tenant_role(restaurant_id) is not null));

drop policy if exists invitation_read on public.invitations;
create policy invitation_read on public.invitations for select to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator');

drop policy if exists audit_read on public.platform_audit;
create policy audit_read on public.platform_audit for select to authenticated using ((select platform_private.is_owner()));

create or replace function platform_private.restaurant_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.restaurant_branding(restaurant_id) values (new.id);
    insert into public.platform_audit(actor_id,restaurant_id,event,target_id)
      values (auth.uid(),new.id,'restaurant.created',new.id);
  elsif (old.status,old.name) is distinct from (new.status,new.name) then
    insert into public.platform_audit(actor_id,restaurant_id,event,target_id)
      values (auth.uid(),new.id,case when old.status <> new.status then 'restaurant.' || new.status else 'restaurant.renamed' end,new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists restaurant_changed on public.restaurants;
create trigger restaurant_changed after insert or update on public.restaurants for each row execute function platform_private.restaurant_changed();

create or replace function platform_private.branding_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new is distinct from old then
    insert into public.platform_audit(actor_id,restaurant_id,event,target_id)
      values (auth.uid(),new.restaurant_id,'branding.updated',new.restaurant_id);
  end if;
  return new;
end;
$$;
drop trigger if exists branding_changed on public.restaurant_branding;
create trigger branding_changed after update on public.restaurant_branding for each row execute function platform_private.branding_changed();

create or replace function platform_private.profile_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.active is distinct from old.active then
    insert into public.platform_audit(actor_id,event,target_id)
      values (auth.uid(),case when new.active then 'account.restored' else 'account.suspended' end,new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists profile_changed on public.profiles;
create trigger profile_changed after update on public.profiles for each row execute function platform_private.profile_changed();

-- Public projection for branded sign-in and the manifest. Keep private settings out of this result.
create or replace function platform_private.public_brand(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',r.id,'slug',r.slug,'name',r.name,'short_name',b.short_name,'slogan',b.slogan,
    'theme_color',b.theme_color,'background_color',b.background_color)
  from public.restaurants r join public.restaurant_branding b on b.restaurant_id=r.id
  where r.slug=p_slug and r.status in ('trial','active')
$$;

create or replace function public.platform_brand(p_slug text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select platform_private.public_brand(p_slug)
$$;

create or replace function platform_private.identity()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('owner',platform_private.is_owner(), 'owner_enrollment',
    exists (select 1 from platform_private.owners o join public.profiles p on p.id=o.user_id
      where o.user_id=platform_private.verified_user() and p.active) and not platform_private.is_owner(),
    'active',platform_private.active_user() is not null)
$$;

create or replace function public.platform_identity()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select platform_private.identity()
$$;

create or replace function public.platform_brand_target(p_slug text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select id from public.restaurants where slug=p_slug and status in ('trial','active') and
    ((select platform_private.is_owner()) or platform_private.tenant_role(id)='administrator')
$$;

create or replace function public.platform_overview()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not platform_private.is_owner() then raise exception 'Platform owner access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'restaurants',(select count(*) from public.restaurants),
    'active',(select count(*) from public.restaurants where status='active'),
    'trial',(select count(*) from public.restaurants where status='trial'),
    'suspended',(select count(*) from public.restaurants where status='suspended'),
    'users',(select count(*) from public.profiles where active),
    'pending',(select count(id) from public.invitations where accepted_at is null and cancelled_at is null and expires_at > now()));
end;
$$;

-- Serialize access changes against restaurant suspension and invite acceptance.
create or replace function platform_private.lock_access(p_restaurant uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not platform_private.is_owner() and platform_private.tenant_role(p_restaurant) is distinct from 'administrator' then
    raise exception 'Restaurant administrator access required' using errcode='42501';
  end if;
  perform 1 from public.restaurants where id=p_restaurant and status in ('trial','active') for update;
  if not found then raise exception 'Restaurant is unavailable' using errcode='22023'; end if;
  if not platform_private.is_owner() and platform_private.tenant_role(p_restaurant) is distinct from 'administrator' then
    raise exception 'Restaurant administrator access required' using errcode='42501';
  end if;
end;
$$;

create or replace function platform_private.issue_invite(p_restaurant uuid,p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  invite public.invitations;
  address text := lower(btrim(p_email));
  token text := encode(extensions.gen_random_bytes(32),'hex');
begin
  perform platform_private.lock_access(p_restaurant);
  if p_role is null or p_role not in ('administrator','manager','staff') or (p_role='administrator' and not platform_private.is_owner()) then
    raise exception 'That role cannot be invited' using errcode='42501';
  end if;
  if address is null or char_length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address' using errcode='22023';
  end if;
  if exists (select 1 from public.memberships m join auth.users u on u.id=m.user_id
      where m.restaurant_id=p_restaurant and lower(u.email)=address) then
    raise exception 'This account already has a membership. Manage it from the team list.' using errcode='23505';
  end if;
  if exists (select 1 from public.invitations i where i.restaurant_id=p_restaurant and i.email=address
      and (i.created_at > now()-interval '1 minute' or
        (i.role='administrator' and i.accepted_at is null and i.cancelled_at is null and not platform_private.is_owner()))) then
    raise exception 'This invitation cannot be replaced yet' using errcode='22023';
  end if;
  if (select count(*) from public.invitations where restaurant_id=p_restaurant and created_at > now()-interval '1 hour') >= 30 then
    raise exception 'Invitation limit reached. Try again later.' using errcode='22023';
  end if;
  update public.invitations set cancelled_at=now()
    where restaurant_id=p_restaurant and email=address and accepted_at is null and cancelled_at is null;
  insert into public.invitations(restaurant_id,email,role,token_hash,created_by,expires_at)
    values (p_restaurant,address,p_role,extensions.digest(token,'sha256'),auth.uid(),now()+interval '48 hours') returning * into invite;
  insert into public.platform_audit(actor_id,restaurant_id,event,target_id) values (auth.uid(),p_restaurant,'invitation.created',invite.id);
  return jsonb_build_object('token',token,'email',address,'restaurant',(select name from public.restaurants where id=p_restaurant));
end;
$$;

create or replace function platform_private.save_brand(p_restaurant uuid,p_name text,p_short_name text,p_slogan text,p_theme_color text,p_background_color text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform platform_private.lock_access(p_restaurant);
  update public.restaurants set name=btrim(p_name) where id=p_restaurant and name is distinct from btrim(p_name);
  update public.restaurant_branding set short_name=btrim(p_short_name),slogan=btrim(p_slogan),
    theme_color=p_theme_color,background_color=p_background_color where restaurant_id=p_restaurant;
end;
$$;

create or replace function platform_private.accept_invite(p_token text,p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  invite public.invitations;
  actor uuid := platform_private.verified_user();
  slug text;
begin
  if actor is null then raise exception 'Sign in with your verified email' using errcode='42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_name is null or char_length(btrim(p_name)) not between 1 and 100 then
    raise exception 'Enter your name and a valid invitation' using errcode='22023';
  end if;
  select * into invite from public.invitations where token_hash=extensions.digest(p_token,'sha256');
  if found then
    select r.slug into slug from public.restaurants r where r.id=invite.restaurant_id and r.status in ('trial','active') for update;
    select * into invite from public.invitations where id=invite.id for update;
  end if;
  if slug is null or invite.accepted_at is not null or invite.cancelled_at is not null or invite.expires_at <= now()
    or not exists (select 1 from auth.users where id=actor and lower(email)=invite.email) then
    raise exception 'This invitation is unavailable for your account' using errcode='42501';
  end if;
  insert into public.profiles(id,display_name) values (actor,btrim(p_name)) on conflict (id) do nothing;
  if platform_private.active_user() is null then raise exception 'This account is unavailable or requires MFA' using errcode='42501'; end if;
  insert into public.memberships(restaurant_id,user_id,role) values (invite.restaurant_id,actor,invite.role)
    on conflict (restaurant_id,user_id) do nothing;
  update public.invitations set accepted_at=now() where id=invite.id;
  insert into public.platform_audit(actor_id,restaurant_id,event,target_id) values (actor,invite.restaurant_id,'invitation.accepted',invite.id);
  return slug;
end;
$$;

create or replace function platform_private.cancel_invite(p_restaurant uuid,p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform platform_private.lock_access(p_restaurant);
  update public.invitations set cancelled_at=now() where id=p_invite and restaurant_id=p_restaurant
    and accepted_at is null and cancelled_at is null and (role<>'administrator' or platform_private.is_owner());
  if not found then raise exception 'Invitation is unavailable' using errcode='42501'; end if;
  insert into public.platform_audit(actor_id,restaurant_id,event,target_id) values (auth.uid(),p_restaurant,'invitation.cancelled',p_invite);
end;
$$;

create or replace function platform_private.set_membership(p_restaurant uuid,p_user uuid,p_role text,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform platform_private.lock_access(p_restaurant);
  if p_user = auth.uid() or (p_role='administrator' and not platform_private.is_owner()) then
    raise exception 'That membership cannot be changed' using errcode='42501';
  end if;
  update public.memberships set role=p_role,active=p_active where restaurant_id=p_restaurant and user_id=p_user
    and (role<>'administrator' or platform_private.is_owner());
  if not found then raise exception 'Membership is unavailable' using errcode='42501'; end if;
  insert into public.platform_audit(actor_id,restaurant_id,event,target_id)
    values (auth.uid(),p_restaurant,case when p_active then 'membership.updated' else 'membership.suspended' end,p_user);
end;
$$;

create or replace function public.platform_issue_invite(p_restaurant uuid,p_email text,p_role text)
returns jsonb language sql security invoker set search_path = '' as $$ select platform_private.issue_invite(p_restaurant,p_email,p_role) $$;
create or replace function public.platform_accept_invite(p_token text,p_name text)
returns text language sql security invoker set search_path = '' as $$ select platform_private.accept_invite(p_token,p_name) $$;
create or replace function public.platform_cancel_invite(p_restaurant uuid,p_invite uuid)
returns void language sql security invoker set search_path = '' as $$ select platform_private.cancel_invite(p_restaurant,p_invite) $$;
create or replace function public.platform_set_membership(p_restaurant uuid,p_user uuid,p_role text,p_active boolean)
returns void language sql security invoker set search_path = '' as $$ select platform_private.set_membership(p_restaurant,p_user,p_role,p_active) $$;
create or replace function public.platform_save_brand(p_restaurant uuid,p_name text,p_short_name text,p_slogan text,p_theme_color text,p_background_color text)
returns void language sql security invoker set search_path = '' as $$
  select platform_private.save_brand(p_restaurant,p_name,p_short_name,p_slogan,p_theme_color,p_background_color)
$$;

revoke all on all functions in schema platform_private from public, anon, authenticated;
grant execute on function platform_private.public_brand(text) to anon, authenticated;
grant execute on function platform_private.active_user(),platform_private.is_owner(),platform_private.tenant_role(uuid),
  platform_private.save_brand(uuid,text,text,text,text,text),
  platform_private.can_read_profile(uuid),platform_private.identity(),platform_private.issue_invite(uuid,text,text),
  platform_private.accept_invite(text,text),platform_private.cancel_invite(uuid,uuid),platform_private.set_membership(uuid,uuid,text,boolean) to authenticated;

revoke all on function public.platform_brand(text),public.platform_identity(),public.platform_overview(),
  public.platform_brand_target(text),
  public.platform_save_brand(uuid,text,text,text,text,text),
  public.platform_issue_invite(uuid,text,text),public.platform_accept_invite(text,text),public.platform_cancel_invite(uuid,uuid),
  public.platform_set_membership(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.platform_brand(text) to anon, authenticated;
grant execute on function public.platform_identity(),public.platform_overview(),public.platform_issue_invite(uuid,text,text),
  public.platform_brand_target(text),
  public.platform_save_brand(uuid,text,text,text,text,text),
  public.platform_accept_invite(text,text),public.platform_cancel_invite(uuid,uuid),public.platform_set_membership(uuid,uuid,text,boolean) to authenticated;

commit;
