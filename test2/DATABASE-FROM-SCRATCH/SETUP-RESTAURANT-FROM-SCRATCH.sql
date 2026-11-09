-- =====================================================================
--  RESTAURANT WORKSPACE · COMPLETE DATABASE SETUP (from scratch) · v17
--  For a NEW, EMPTY Supabase project. Run once in SQL Editor → Run.
--  Safe to run again: it only creates what is missing and replaces functions.
--  After it finishes, follow "FIRST ADMIN" at the very bottom.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------- one settings row for the whole restaurant ----------
create table if not exists public.restaurant_settings (
  id int primary key default 1 check (id = 1),
  custom jsonb not null default '{}'::jsonb,
  custom_revision bigint not null default 1,
  revisions jsonb not null default '{}'::jsonb,
  tax_enabled boolean not null default false,
  tax_mode text not null default 'percent' check (tax_mode in ('percent','fixed')),
  tax_value numeric(10,2) not null default 0 check (tax_value >= 0),
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_details text not null default '',
  manual_waiter_access boolean not null default true,
  stocks_hidden boolean not null default false,
  mgr_customer_devices boolean not null default false,
  mgr_order_device_block boolean not null default false,
  alert jsonb not null default '{"orders_sound":"chime","waiter_sound":"doorbell","notification_sound":"bell","voice_enabled":false}'::jsonb,
  alert_revision int not null default 1,
  review_url text not null default '',
  footer_show_credit boolean not null default true,
  footer_show_link boolean not null default false,
  footer_url text not null default '',
  current_minutes int not null default 120,
  history_minutes int not null default 1440,
  notification_minutes int not null default 1440,
  request_minutes int not null default 1440,
  waiter_hours int not null default 18,
  waiter_app_name text not null default 'Waiter',
  song_requests boolean not null default false,
  waiter_perms jsonb not null default '{"enabled":true,"view_orders":true,"accept_orders":true,"serve_orders":true,"view_requests":true,"handle_requests":true,"alerts":true}'::jsonb,
  waiter_pair_hash text,
  waiter_pair_expires timestamptz,
  analytics_reset_at timestamptz,
  dish_sales_reset_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.restaurant_settings (id) values (1) on conflict (id) do nothing;

-- ---------- staff (admin, manager, waiter) ----------
create table if not exists public.staff_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','manager','waiter')),
  name text not null default '',
  email text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- menu ----------
create table if not exists public.categories (
  name text primary key check (length(trim(name)) between 1 and 60),
  sort_order int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.menu_items (
  id text primary key check (length(id) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null default 'Menu',
  price numeric(10,2) not null default 0 check (price >= 0 and price <= 100000),
  description text not null default '',
  image text not null default '',
  veg boolean not null default true,
  available boolean not null default true,
  recommended boolean not null default false,
  best_seller boolean not null default false,
  item_code text,
  sizes_enabled boolean not null default false,
  size_prices jsonb not null default '{}'::jsonb,
  size_labels jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists menu_items_code_idx on public.menu_items (lower(item_code)) where item_code is not null and item_code <> '';
create table if not exists public.menu_stock (
  menu_id text not null references public.menu_items(id) on delete cascade,
  variant text not null default 'single',
  tracked boolean not null default false,
  remaining int not null default 0 check (remaining >= 0),
  baseline int not null default 0,
  alerted boolean not null default false,
  revision bigint not null default 1,
  loop_enabled boolean not null default false,
  loop_quantity int,
  loop_next_reset_at timestamptz,
  primary key (menu_id, variant)
);

-- ---------- tables, customer browsers, table visits ----------
create table if not exists public.restaurant_tables (
  table_number text primary key check (table_number ~ '^T[1-9][0-9]{0,3}$'),
  display_name text not null,
  status text not null default 'Available' check (status in ('Available','Reserved')),
  qr_key text not null default encode(extensions.gen_random_bytes(16),'hex'),
  created_at timestamptz not null default now()
);
create table if not exists public.customer_devices (
  id uuid primary key,
  token_hash text not null,
  blocked boolean not null default false,
  browser_info jsonb not null default '{}'::jsonb,
  last_table_number text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.table_visits (
  id uuid primary key,
  token_hash text not null,
  device_id uuid not null references public.customer_devices(id) on delete cascade,
  table_number text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------- orders ----------
create table if not exists public.order_counters (order_day date primary key, last_number int not null default 0);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  daily_number int not null,
  order_day date not null,
  request_id uuid unique,
  token_hash text,
  table_number text not null,
  customer_name text not null default 'Guest',
  kitchen_notes text not null default '',
  items jsonb not null,
  items_subtotal numeric(12,2) not null,
  tax_enabled boolean not null default false,
  tax_mode text not null default 'percent',
  tax_value numeric(10,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  status text not null default 'Pending' check (status in ('Pending','Accepted','Cooking','Ready','Served','Cancelled','Rejected')),
  payment_method text check (payment_method in ('Cash','Online')),
  rejection_reason text,
  order_source text not null default 'qr' check (order_source in ('qr','manual','waiter')),
  device_id uuid references public.customer_devices(id) on delete set null,
  created_by uuid,
  cooking_started_at timestamptz,
  served_at timestamptz,
  cancelled_at timestamptz,
  cancel_deadline timestamptz,
  in_dish_sales boolean not null default true,
  in_analytics boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_day_idx on public.orders (order_day, created_at desc);
create index if not exists orders_device_idx on public.orders (device_id, created_at desc);

-- ---------- waiter calls & song requests ----------
create table if not exists public.waiter_calls (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique,
  table_number text not null,
  request_kind text not null default 'Waiter' check (request_kind in ('Waiter','Reception','ReservedScan','Song')),
  request_text text,
  request_origin text not null default 'customer_menu',
  status text not null default 'Pending' check (status in ('Pending','Handled','Expired')),
  device_id uuid,
  on_the_way_at timestamptz,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists waiter_calls_status_idx on public.waiter_calls (status, created_at desc);
create table if not exists public.song_requests (
  id uuid primary key default gen_random_uuid(),
  queue_no bigserial,
  call_id uuid references public.waiter_calls(id) on delete set null,
  table_number text not null,
  title text not null,
  artist text not null default '',
  song_url text,
  status text not null default 'Queued' check (status in ('Queued','Playing','Played','Skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------- notifications ----------
create table if not exists public.stock_notices (
  id uuid primary key default gen_random_uuid(),
  menu_id text, variant text not null default 'single', dish_name text not null, size_label text, category text not null default '',
  remaining int not null, baseline int not null,
  created_at timestamptz not null default now(), read_at timestamptz
);
create table if not exists public.security_notices (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null, table_number text not null, browser_info jsonb not null default '{}'::jsonb,
  attempts int not null default 1, created_at timestamptz not null default now(), last_attempt_at timestamptz not null default now(), read_at timestamptz
);

-- ---------- waiter phones, push, misc ----------
create table if not exists public.waiter_sessions (
  token_hash text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  device text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen timestamptz not null default now(),
  revoked boolean not null default false
);
create table if not exists public.push_devices (
  endpoint text primary key,
  kind text not null check (kind in ('kitchen','waiter')),
  subscription jsonb not null,
  user_id uuid,
  waiter_token_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.egress_checkpoints (id bigserial primary key, bytes bigint not null, period_start date, period_end date, created_by uuid, created_at timestamptz not null default now());
create table if not exists public.request_log (request_id uuid primary key, kind text not null, result jsonb, created_at timestamptz not null default now());

-- ---------- Expenses & stock history for the billing screens ----------
create table if not exists public.workspace_docs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expense','expense_auto','expense_heads','stock_move')),
  doc_day date,
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 20000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_docs_kind_day_idx on public.workspace_docs (kind, doc_day desc, created_at desc);
create index if not exists workspace_docs_ref_idx on public.workspace_docs (kind, (data ->> 'ref'));

-- ---------- lock everything down: the browser only goes through checked functions ----------
do $$ declare t text; begin
  foreach t in array array['restaurant_settings','staff_users','categories','menu_items','menu_stock','restaurant_tables','customer_devices','table_visits','order_counters','orders','waiter_calls','song_requests','stock_notices','security_notices','waiter_sessions','push_devices','egress_checkpoints','request_log','workspace_docs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on public.%I from anon', t); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on public.%I from authenticated', t); end if;
  end loop;
end $$;
-- =================== shared helpers ===================
create or replace function public.rx_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.staff_users where user_id = auth.uid() and active order by case role when 'admin' then 0 when 'manager' then 1 else 2 end limit 1
$$;
create or replace function public.rx_require(p_roles text[] default array['admin','manager']) returns text language plpgsql stable security definer set search_path = public as $$
declare r text := public.rx_role();
begin
  if r is null or not (r = any(p_roles)) then
    raise exception '%', case when p_roles = array['admin'] then 'Admin access required.' else 'Staff access required. Please sign in again.' end using errcode = '42501';
  end if;
  return r;
end $$;
create or replace function public.rx_hash(p text) returns text language sql immutable set search_path = public, extensions as $$ select encode(extensions.digest(coalesce(p,''),'sha256'),'hex') $$;
create or replace function public.rx_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
create or replace function public.rx_settings() returns public.restaurant_settings language sql stable security definer set search_path = public as $$ select * from public.restaurant_settings where id = 1 $$;
create or replace function public.rx_rev(p_key text) returns text language sql stable security definer set search_path = public as $$ select coalesce((select revisions ->> p_key from public.restaurant_settings where id = 1), '1') $$;
create or replace function public.rx_bump(variadic p_keys text[]) returns void language plpgsql security definer set search_path = public as $$
declare k text; r jsonb;
begin
  select revisions into r from public.restaurant_settings where id = 1 for update;
  foreach k in array p_keys loop r := r || jsonb_build_object(k, (coalesce(r ->> k, '1')::bigint + 1)::text); end loop;
  update public.restaurant_settings set revisions = r, updated_at = now() where id = 1;
end $$;
create or replace function public.rx_revisions() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('active', rx_rev('active'), 'config', rx_rev('config'), 'permissions', rx_rev('permissions'), 'calls', rx_rev('calls'),
    'stock_notices', rx_rev('stock_notices'), 'security_notices', rx_rev('security_notices'), 'history', rx_rev('history'), 'catalog', rx_rev('catalog'),
    'stock', rx_rev('stock'), 'devices', rx_rev('devices'))
$$;
-- Period helper: day / month / year in India time. stop is exclusive.
create or replace function public.rx_period(p_period text, p_reference date, out period text, out period_start date, out period_stop date) language plpgsql stable as $$
declare ref date := coalesce(p_reference, public.rx_today());
begin
  period := case when p_period in ('day','month','year') then p_period else 'day' end;
  if period = 'day' then period_start := ref; period_stop := ref + 1;
  elsif period = 'month' then period_start := date_trunc('month', ref)::date; period_stop := (date_trunc('month', ref) + interval '1 month')::date;
  else period_start := date_trunc('year', ref)::date; period_stop := (date_trunc('year', ref) + interval '1 year')::date; end if;
end $$;

-- Daily 24-hour stock loops and request expiry run lazily on every read (no scheduler needed).
create or replace function public.rx_housekeeping() returns void language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings := public.rx_settings(); n int;
begin
  update public.menu_stock set remaining = loop_quantity, baseline = loop_quantity, alerted = false, revision = revision + 1,
         loop_next_reset_at = loop_next_reset_at + (ceil(extract(epoch from (now() - loop_next_reset_at)) / 86400.0 + 0.000001) * interval '1 day')
   where loop_enabled and loop_next_reset_at <= now() and tracked;
  get diagnostics n = row_count; if n > 0 then perform public.rx_bump('stock'); end if;
  update public.waiter_calls set status = 'Expired' where status = 'Pending' and created_at < now() - make_interval(mins => s.request_minutes);
  get diagnostics n = row_count; if n > 0 then perform public.rx_bump('calls'); end if;
  delete from public.stock_notices where created_at < now() - make_interval(mins => s.notification_minutes);
  delete from public.security_notices where created_at < now() - make_interval(mins => s.notification_minutes);
  delete from public.table_visits where expires_at < now() - interval '1 day';
  delete from public.waiter_sessions where expires_at < now() - interval '7 days';
end $$;

create or replace function public.rx_size_label(m public.menu_items, v text) returns text language sql immutable as $$
  select case when v is null or v = 'single' then null else coalesce(m.size_labels ->> v, initcap(v)) end
$$;
-- A dish with its live stock, as every staff screen expects it.
create or replace function public.rx_item_json(m public.menu_items) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare single public.menu_stock; sizes jsonb := '{}'::jsonb; st record; sold boolean := false; k text;
begin
  select * into single from public.menu_stock where menu_id = m.id and variant = 'single';
  if m.sizes_enabled then
    for st in select * from public.menu_stock where menu_id = m.id and variant <> 'single' loop
      sizes := sizes || jsonb_build_object(st.variant, jsonb_build_object('tracked', st.tracked, 'remaining', st.remaining));
    end loop;
    sold := not exists (select 1 from jsonb_object_keys(m.size_prices) x(key)
             where not exists (select 1 from public.menu_stock s where s.menu_id = m.id and s.variant = x.key and s.tracked and s.remaining <= 0));
  else
    sold := coalesce(single.tracked and single.remaining <= 0, false);
  end if;
  return jsonb_build_object('id', m.id, 'name', m.name, 'category', m.category, 'price', m.price, 'description', m.description, 'image', m.image,
    'veg', m.veg, 'available', m.available and not sold, 'manual_available', m.available, 'stock_sold_out', sold, 'recommended', m.recommended,
    'best_seller', m.best_seller, 'item_code', m.item_code, 'sizes_enabled', m.sizes_enabled, 'size_prices', m.size_prices, 'size_labels', m.size_labels,
    'stock', jsonb_build_object('tracked', coalesce(single.tracked, false), 'remaining', coalesce(single.remaining, 0)),
    'size_stock', sizes, 'updated_at', m.updated_at, 'sort_order', m.sort_order);
end $$;

create or replace function public.rx_order_json(o public.orders, p_staff boolean default true) returns jsonb language sql stable as $$
  select (to_jsonb(o) - 'token_hash' - 'in_dish_sales' - 'in_analytics' - case when p_staff then 'x' else 'device_id' end - case when p_staff then 'x' else 'created_by' end)
         || jsonb_build_object('server_now', now(), 'cancelled_expires_at', case when o.cancelled_at is not null then o.cancelled_at + interval '6 hours' end)
$$;

-- Waiter phone session check. Returns the session; raises a clear message when expired.
create or replace function public.rx_waiter(p_key text) returns public.waiter_sessions language plpgsql security definer set search_path = public as $$
declare w public.waiter_sessions; s public.restaurant_settings := public.rx_settings();
begin
  select * into w from public.waiter_sessions where token_hash = public.rx_hash(p_key) and not revoked and expires_at > now();
  if w.token_hash is null then raise exception 'Invalid or expired waiter session. Scan the waiter QR again.' using errcode = '42501'; end if;
  if w.user_id is not null and not exists (select 1 from public.staff_users where user_id = w.user_id and active) then
    raise exception 'Invalid or expired waiter session. Sign in again.' using errcode = '42501'; end if;
  if coalesce((s.waiter_perms ->> 'enabled')::boolean, true) is false then raise exception 'Waiter access is turned off by the restaurant.' using errcode = '42501'; end if;
  update public.waiter_sessions set last_seen = now() where token_hash = w.token_hash;
  return w;
end $$;
create or replace function public.rx_waiter_can(p_perm text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((waiter_perms ->> p_perm)::boolean, false) and coalesce((waiter_perms ->> 'enabled')::boolean, true) from public.restaurant_settings where id = 1
$$;

-- Table QR visit check for customers.
create or replace function public.rx_visit(p_visit_id uuid, p_visit_token uuid, p_table text) returns public.table_visits language plpgsql security definer set search_path = public as $$
declare v public.table_visits; d public.customer_devices;
begin
  select * into v from public.table_visits where id = p_visit_id and token_hash = public.rx_hash(p_visit_token::text);
  if v.id is null or (p_table is not null and v.table_number <> p_table) then raise exception 'Please scan your table QR again.' using errcode = '42501'; end if;
  if v.expires_at <= now() then raise exception 'Scan expired. Please scan your table QR again.' using errcode = '42501'; end if;
  select * into d from public.customer_devices where id = v.device_id;
  if d.blocked then raise exception 'This browser device has been blocked. Please contact restaurant staff.' using errcode = '42501'; end if;
  if not exists (select 1 from public.restaurant_tables where table_number = v.table_number) then raise exception 'This table is no longer active. Please ask a waiter.' using errcode = '42501'; end if;
  return v;
end $$;

-- Low-stock alert when a tracked dish/size reaches 5% or less of its last set quantity.
create or replace function public.rx_stock_alert(p_menu text, p_variant text) returns void language plpgsql security definer set search_path = public as $$
declare st public.menu_stock; m public.menu_items;
begin
  select * into st from public.menu_stock where menu_id = p_menu and variant = p_variant;
  if not st.tracked or st.alerted or st.baseline <= 0 or st.remaining * 20 > st.baseline then return; end if;
  select * into m from public.menu_items where id = p_menu;
  insert into public.stock_notices (menu_id, variant, dish_name, size_label, category, remaining, baseline)
  values (p_menu, p_variant, m.name, public.rx_size_label(m, p_variant), m.category, st.remaining, st.baseline);
  update public.menu_stock set alerted = true where menu_id = p_menu and variant = p_variant;
  perform public.rx_bump('stock_notices');
end $$;

-- Check a cart, lock and take tracked stock, and price every line from the database.
create or replace function public.rx_take_lines(p_items jsonb, p_allow_custom boolean, out lines jsonb, out subtotal numeric) language plpgsql security definer set search_path = public as $$
declare it jsonb; m public.menu_items; st public.menu_stock; v text; q int; price numeric; nm text; n int := 0; ckey text;
begin
  lines := '[]'::jsonb; subtotal := 0;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then raise exception 'Cart must have 1 to 50 lines.' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    n := n + 1;
    if (it ->> 'qty') !~ '^[0-9]+$' or (it ->> 'qty')::int < 1 or (it ->> 'qty')::int > 50 then raise exception 'Quantity must be a whole number from 1 to 50.' using errcode = '22023'; end if;
    q := (it ->> 'qty')::int;
    if coalesce((it ->> 'custom')::boolean, false) then
      if not p_allow_custom then raise exception 'Invalid item.' using errcode = '22023'; end if;
      nm := left(trim(coalesce(it ->> 'name','')), 120); price := round((it ->> 'price')::numeric, 2);
      if nm = '' or price is null or price < 0 or price > 100000 then raise exception 'Invalid custom item.' using errcode = '22023'; end if;
      lines := lines || jsonb_build_array(jsonb_build_object('id', coalesce(it ->> 'id','custom:' || gen_random_uuid()), 'custom', true, 'name', nm, 'qty', q, 'price', price, 'subtotal', price * q, 'category', 'Custom'));
      subtotal := subtotal + price * q; continue;
    end if;
    select * into m from public.menu_items where id = it ->> 'id' for update;
    if m.id is null or not m.available or exists (select 1 from public.categories c where c.name = m.category and c.hidden) then
      raise exception 'A dish in your cart is unavailable: %', coalesce(m.name, 'removed dish') using errcode = '22023'; end if;
    v := nullif(it ->> 'size', '');
    if m.sizes_enabled then
      if v is null or not (m.size_prices ? v) then raise exception 'Size unavailable for %. Please choose again.', m.name using errcode = '22023'; end if;
      price := (m.size_prices ->> v)::numeric;
    else
      if v is not null then raise exception 'Invalid size for %.', m.name using errcode = '22023'; end if;
      v := 'single'; price := m.price;
    end if;
    select * into st from public.menu_stock where menu_id = m.id and variant = v for update;
    if st.tracked then
      if st.remaining <= 0 then raise exception '% is sold out.', m.name || coalesce(' — ' || public.rx_size_label(m, v), '') using errcode = '22023'; end if;
      if st.remaining < q then raise exception 'Insufficient stock for %: only % left.', m.name || coalesce(' — ' || public.rx_size_label(m, v), ''), st.remaining using errcode = '22023'; end if;
      update public.menu_stock set remaining = remaining - q, revision = revision + 1 where menu_id = m.id and variant = v;
      perform public.rx_stock_alert(m.id, v);
    end if;
    lines := lines || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', m.id, 'size', case when v = 'single' then null else v end,
      'name', m.name || coalesce(' — ' || public.rx_size_label(m, v), ''), 'size_label', public.rx_size_label(m, v), 'category', m.category,
      'qty', q, 'price', price, 'subtotal', price * q)));
    subtotal := subtotal + price * q;
  end loop;
  perform public.rx_bump('stock');
end $$;

-- Give stock back when an order is cancelled or rejected.
create or replace function public.rx_return_stock(p_items jsonb) returns void language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it ->> 'custom')::boolean, false) then continue; end if;
    update public.menu_stock set remaining = remaining + (it ->> 'qty')::int, revision = revision + 1, alerted = case when (remaining + (it ->> 'qty')::int) * 20 > baseline then false else alerted end
     where menu_id = it ->> 'id' and variant = coalesce(it ->> 'size', 'single') and tracked;
  end loop;
  perform public.rx_bump('stock');
end $$;

create or replace function public.rx_tax(p_subtotal numeric, out amount numeric, out enabled boolean, out mode text, out val numeric) language plpgsql stable security definer set search_path = public as $$
declare s public.restaurant_settings := public.rx_settings();
begin
  enabled := s.tax_enabled; mode := s.tax_mode; val := s.tax_value;
  amount := case when not s.tax_enabled then 0 when s.tax_mode = 'percent' then round(round(p_subtotal * 100) * round(s.tax_value * 100) / 10000) / 100 else round(s.tax_value, 2) end;
end $$;

create or replace function public.rx_next_number(p_day date) returns int language sql security definer set search_path = public as $$
  insert into public.order_counters (order_day, last_number) values (p_day, 1)
  on conflict (order_day) do update set last_number = public.order_counters.last_number + 1 returning last_number
$$;

-- Build and save an order (QR, counter or waiter).
create or replace function public.rx_create_order(p_source text, p_request_id uuid, p_token text, p_table text, p_name text, p_notes text, p_items jsonb,
  p_expected_total numeric, p_payment text, p_device uuid, p_allow_custom boolean) returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders; l record; t record; d date := public.rx_today(); n int; pre text;
begin
  if p_request_id is null then raise exception 'Invalid request.' using errcode = '22023'; end if;
  select * into o from public.orders where request_id = p_request_id;
  if o.id is not null then
    if p_token is not null and o.token_hash is distinct from public.rx_hash(p_token) then raise exception 'Invalid request.' using errcode = '42501'; end if;
    return o; -- the same submission retried: never a second order
  end if;
  if length(coalesce(p_name,'')) > 80 or length(coalesce(p_notes,'')) > 1000 then raise exception 'Name or notes are too long.' using errcode = '22023'; end if;
  select * into l from public.rx_take_lines(p_items, p_allow_custom);
  select * into t from public.rx_tax(l.subtotal);
  if p_expected_total is not null and abs((l.subtotal + t.amount) - p_expected_total) > 0.005 then
    raise exception 'Total changed. Prices or tax were updated — please review your cart.' using errcode = '22023'; end if;
  n := public.rx_next_number(d);
  pre := case p_source when 'qr' then 'QR' when 'waiter' then 'MAN' else 'MAN' end;
  insert into public.orders (order_id, daily_number, order_day, request_id, token_hash, table_number, customer_name, kitchen_notes, items, items_subtotal,
     tax_enabled, tax_mode, tax_value, tax_amount, total, status, payment_method, order_source, device_id, created_by, cancel_deadline, served_at)
  values (pre || '-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 4, '0'), n, d, p_request_id, case when p_token is null then null else public.rx_hash(p_token) end,
     p_table, coalesce(nullif(trim(p_name),''), case when p_source = 'qr' then 'Guest' else 'Counter' end), coalesce(trim(p_notes),''), l.lines, l.subtotal,
     t.enabled, t.mode, t.val, t.amount, l.subtotal + t.amount, case when p_source = 'qr' then 'Pending' else 'Served' end,
     p_payment, p_source, p_device, auth.uid(), case when p_source = 'qr' then now() + interval '60 seconds' end, case when p_source = 'qr' then null else now() end)
  returning * into o;
  perform public.rx_bump('active', 'history');
  return o;
end $$;
-- =================== customer menu (table QR) ===================
create or replace function public.restaurant_open_device_visit(p_visit_id uuid, p_visit_token uuid, p_table text, p_qr_key text default null,
  p_device_id uuid default null, p_device_token uuid default null, p_info jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings := public.rx_settings(); t public.restaurant_tables; d public.customer_devices; v public.table_visits; info jsonb;
begin
  perform public.rx_housekeeping();
  select * into t from public.restaurant_tables where table_number = p_table;
  if t.table_number is null then raise exception 'This table QR is not active. Please ask a waiter.' using errcode = '22023'; end if;
  if p_device_id is null or p_device_token is null then raise exception 'Invalid browser identity. Please reload the page.' using errcode = '22023'; end if;
  info := jsonb_build_object('user_agent', left(coalesce(p_info ->> 'user_agent',''), 400), 'platform', left(coalesce(p_info ->> 'platform',''), 60),
                             'language', left(coalesce(p_info ->> 'language',''), 40), 'time_zone', left(coalesce(p_info ->> 'time_zone',''), 60));
  select * into d from public.customer_devices where id = p_device_id;
  if d.id is null then
    insert into public.customer_devices (id, token_hash, browser_info, last_table_number) values (p_device_id, public.rx_hash(p_device_token::text), info, p_table) returning * into d;
    perform public.rx_bump('devices');
  elsif d.token_hash <> public.rx_hash(p_device_token::text) then
    raise exception 'Invalid browser identity. Clear this site''s data and scan again.' using errcode = '42501';
  else
    update public.customer_devices set last_seen = now(), browser_info = info, last_table_number = p_table where id = d.id returning * into d;
  end if;
  if d.blocked then
    update public.security_notices set attempts = attempts + 1, last_attempt_at = now()
     where device_id = d.id and table_number = p_table and created_at > now() - interval '5 minutes';
    if not found then insert into public.security_notices (device_id, table_number, browser_info) values (d.id, p_table, info); end if;
    perform public.rx_bump('security_notices');
    return jsonb_build_object('active', false, 'expired', false, 'blocked', true, 'error', 'This browser device has been blocked. Please contact restaurant staff.',
      'status', t.status, 'server_now', now(), 'expires_at', now(), 'retention', jsonb_build_object('current_minutes', s.current_minutes, 'history_minutes', s.history_minutes));
  end if;
  if p_qr_key is not null then
    if p_qr_key <> t.qr_key then raise exception 'This table QR is old or invalid. Please scan the QR printed on your table.' using errcode = '42501'; end if;
    insert into public.table_visits (id, token_hash, device_id, table_number, expires_at)
    values (p_visit_id, public.rx_hash(p_visit_token::text), d.id, p_table, now() + interval '1 hour')
    on conflict (id) do nothing;
    if t.status = 'Reserved' and not exists (select 1 from public.waiter_calls where table_number = p_table and request_kind = 'ReservedScan' and status = 'Pending') then
      insert into public.waiter_calls (table_number, request_kind, request_origin, device_id) values (p_table, 'ReservedScan', 'customer_menu', d.id);
      perform public.rx_bump('calls');
    end if;
  end if;
  select * into v from public.table_visits where id = p_visit_id and token_hash = public.rx_hash(p_visit_token::text) and device_id = d.id;
  if v.id is null or v.table_number <> p_table then
    return jsonb_build_object('active', false, 'expired', true, 'blocked', false, 'status', t.status, 'server_now', now(), 'expires_at', now(),
      'retention', jsonb_build_object('current_minutes', s.current_minutes, 'history_minutes', s.history_minutes));
  end if;
  return jsonb_build_object('active', v.expires_at > now(), 'expired', v.expires_at <= now(), 'blocked', false, 'status', t.status,
    'server_now', now(), 'expires_at', v.expires_at, 'retention', jsonb_build_object('current_minutes', s.current_minutes, 'history_minutes', s.history_minutes));
end $$;

create or replace function public.restaurant_table_names(p_table text default null, p_waiter_key text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.rx_role() is not null or p_waiter_key is not null then
    if public.rx_role() is null then perform public.rx_waiter(p_waiter_key); end if;
    return coalesce((select jsonb_agg(jsonb_build_object('table_number', table_number, 'display_name', display_name) order by length(table_number), table_number) from public.restaurant_tables), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('table_number', table_number, 'display_name', display_name)) from public.restaurant_tables where table_number = p_table), '[]'::jsonb);
end $$;

-- Menu for customers (only dishes on the menu) and staff screens.
create or replace function public.restaurant_menu_sync47(p_known jsonb default '{}'::jsonb, p_staff boolean default false, p_table text default null,
  p_visit_id uuid default null, p_visit_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings; revs jsonb; out jsonb; cat jsonb; st jsonb;
begin
  perform public.rx_housekeeping();
  if p_staff then perform public.rx_require(array['admin','manager']); else perform public.rx_visit(p_visit_id, p_visit_token, p_table); end if;
  s := public.rx_settings();
  revs := jsonb_build_object('catalog', public.rx_rev('catalog') || '.' || public.rx_rev('config'), 'state', public.rx_rev('stock') || '.' || public.rx_rev('catalog'), 'commerce', public.rx_rev('config'));
  out := jsonb_build_object('revisions', revs);
  if coalesce(p_known ->> 'catalog', '') <> revs ->> 'catalog' or coalesce(p_known ->> 'state', '') <> revs ->> 'state' then
    select coalesce(jsonb_agg(public.rx_item_json(m) - 'stock' - 'size_stock' - 'available' - 'stock_sold_out' - 'manual_available' order by coalesce(c.sort_order, 9999), m.sort_order, m.name), '[]'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'available', (public.rx_item_json(m) ->> 'available')::boolean,
             'stock', public.rx_item_json(m) -> 'stock', 'size_stock', public.rx_item_json(m) -> 'size_stock')), '[]'::jsonb)
      into cat, st
      from public.menu_items m left join public.categories c on c.name = m.category
     where (p_staff or (m.available and not coalesce(c.hidden, false)));
    out := out || jsonb_build_object('catalog', cat, 'state', st);
  else
    out := out || jsonb_build_object('catalog', null, 'state', null);
  end if;
  if coalesce(p_known ->> 'commerce', '') <> revs ->> 'commerce' then
    out := out || jsonb_build_object('commerce', jsonb_build_object(
      'tax', jsonb_build_object('tax_enabled', s.tax_enabled, 'tax_mode', s.tax_mode, 'tax_value', s.tax_value),
      'footer', jsonb_build_object('show_credit', s.footer_show_credit, 'show_link', s.footer_show_link, 'url', s.footer_url),
      'categories', coalesce((select jsonb_agg(name order by sort_order, name) from public.categories c where p_staff or (not c.hidden and exists (select 1 from public.menu_items m where m.category = c.name and m.available))), '[]'::jsonb)),
      'categories', coalesce((select jsonb_agg(name order by sort_order, name) from public.categories c where p_staff or not c.hidden), '[]'::jsonb));
  else out := out || jsonb_build_object('commerce', null); end if;
  return out;
end $$;

create or replace function public.restaurant_place_order_v13(p_request_id uuid, p_token uuid, p_table text, p_name text, p_notes text, p_items jsonb,
  p_expected_total numeric, p_visit_id uuid, p_visit_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.table_visits; o public.orders;
begin
  v := public.rx_visit(p_visit_id, p_visit_token, p_table);
  if exists (select 1 from public.restaurant_tables where table_number = p_table and status = 'Reserved') then raise exception 'This table is reserved. Please ask a waiter.' using errcode = '22023'; end if;
  if not exists (select 1 from public.orders where request_id = p_request_id)
     and (select count(*) from public.orders where table_number = p_table and device_id = v.device_id and status = 'Pending') >= 2 then
    raise exception 'Two orders are already pending for this table. Please wait for the kitchen to accept them.' using errcode = '22023'; end if;
  o := public.rx_create_order('qr', p_request_id, p_token::text, p_table, p_name, p_notes, p_items, p_expected_total, null, v.device_id, false);
  return public.rx_order_json(o, false);
end $$;

create or replace function public.restaurant_receipt_sync47(p_receipts jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; o public.orders; ok jsonb := '[]'::jsonb; gone jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_receipts) <> 'array' or jsonb_array_length(p_receipts) > 100 then raise exception 'Invalid receipts.' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p_receipts) loop
    select * into o from public.orders where id::text = r ->> 'id' and token_hash = public.rx_hash(r ->> 'token');
    if o.id is null then gone := gone || to_jsonb(r ->> 'id'); else ok := ok || public.rx_order_json(o, false); end if;
  end loop;
  return jsonb_build_object('orders', ok, 'unavailable_ids', gone, 'server_now', now());
end $$;

create or replace function public.restaurant_cancel_order(p_id uuid, p_token uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_id and token_hash = public.rx_hash(p_token::text) for update;
  if o.id is null then raise exception 'Order not found on this device.' using errcode = '22023'; end if;
  if o.status not in ('Pending','Accepted') or o.cooking_started_at is not null then raise exception 'Cancellation closed: cooking has already started.' using errcode = '22023'; end if;
  if now() > least(coalesce(o.cancel_deadline, o.created_at + interval '60 seconds'), o.created_at + interval '60 seconds') then raise exception 'The 1-minute cancellation window has closed. Please ask a waiter.' using errcode = '22023'; end if;
  update public.orders set status = 'Cancelled', cancelled_at = now(), rejection_reason = 'Cancelled by customer', updated_at = now() where id = p_id returning * into o;
  perform public.rx_return_stock(o.items);
  perform public.rx_bump('active', 'history');
  return public.rx_order_json(o, false);
end $$;

create or replace function public.restaurant_customer_call(p_request_id uuid, p_table text, p_visit_id uuid, p_visit_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.table_visits; c public.waiter_calls; last timestamptz;
begin
  v := public.rx_visit(p_visit_id, p_visit_token, p_table);
  select * into c from public.waiter_calls where request_id = p_request_id;
  if c.id is null then
    select max(created_at) into last from public.waiter_calls where table_number = p_table and request_kind = 'Waiter' and device_id = v.device_id;
    if last > now() - interval '60 seconds' then raise exception 'Please wait a minute before calling again.' using errcode = '22023'; end if;
    insert into public.waiter_calls (request_id, table_number, request_kind, request_origin, device_id) values (p_request_id, p_table, 'Waiter', 'customer_menu', v.device_id) returning * into c;
    perform public.rx_bump('calls');
  end if;
  return jsonb_build_object('id', c.id, 'status', c.status, 'table_number', c.table_number, 'created_at', c.created_at, 'on_the_way_at', c.on_the_way_at,
    'handled_at', c.handled_at, 'next_allowed_at', c.created_at + interval '60 seconds', 'server_now', now());
end $$;

create or replace function public.restaurant_waiter_call_status(p_request_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('id', id, 'status', status, 'table_number', table_number, 'created_at', created_at, 'on_the_way_at', on_the_way_at,
    'handled_at', handled_at, 'next_allowed_at', created_at + interval '60 seconds', 'server_now', now()) from public.waiter_calls where request_id = p_request_id),
    jsonb_build_object('status', 'Expired', 'server_now', now()))
$$;

create or replace function public.restaurant_customer_song_request(p_request_id uuid, p_table text, p_song text, p_visit_id uuid, p_visit_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.table_visits; c public.waiter_calls; title text := left(trim(coalesce(p_song,'')), 160);
begin
  if not (public.rx_settings()).song_requests then raise exception 'Song requests are turned off.' using errcode = '22023'; end if;
  v := public.rx_visit(p_visit_id, p_visit_token, p_table);
  if title = '' then raise exception 'Enter a song name.' using errcode = '22023'; end if;
  select * into c from public.waiter_calls where request_id = p_request_id;
  if c.id is not null then return jsonb_build_object('id', c.id, 'already_pending', true); end if;
  if exists (select 1 from public.waiter_calls where table_number = p_table and request_kind = 'Song' and status = 'Pending' and lower(request_text) = lower(title)) then
    return jsonb_build_object('already_pending', true); end if;
  insert into public.waiter_calls (request_id, table_number, request_kind, request_text, request_origin, device_id) values (p_request_id, p_table, 'Song', title, 'customer_menu', v.device_id) returning * into c;
  insert into public.song_requests (call_id, table_number, title) values (c.id, p_table, title);
  perform public.rx_bump('calls');
  return jsonb_build_object('id', c.id, 'already_pending', false);
end $$;
-- =================== kitchen, orders, records, requests ===================
create or replace function public.rx_active_orders() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.rx_order_json(o, true) order by o.created_at), '[]'::jsonb) from public.orders o
   where o.status in ('Pending','Accepted','Cooking','Ready')
      or (o.status = 'Served' and o.order_source = 'qr' and o.updated_at > now() - make_interval(mins => (select current_minutes from public.restaurant_settings where id = 1)))
$$;
create or replace function public.rx_pending_calls() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(c) - 'request_id' - 'device_id' order by c.created_at), '[]'::jsonb) from public.waiter_calls c where c.status = 'Pending'
$$;

create or replace function public.restaurant_active_sync47(p_known text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare r text;
begin
  perform public.rx_require(); perform public.rx_housekeeping(); r := public.rx_rev('active');
  return jsonb_build_object('revision', r, 'orders', case when p_known is not distinct from r then null else public.rx_active_orders() end);
end $$;

create or replace function public.restaurant_staff_pulse47(p_known jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare role text := public.rx_require(); revs jsonb; s public.restaurant_settings; sec boolean;
begin
  perform public.rx_housekeeping(); revs := public.rx_revisions(); s := public.rx_settings();
  sec := role = 'admin' or s.mgr_customer_devices or s.mgr_order_device_block;
  return jsonb_build_object('role', role, 'revisions', revs,
    'calls', case when p_known ->> 'calls' is distinct from revs ->> 'calls' then public.rx_pending_calls() end,
    'stock', case when p_known ->> 'stock_notices' is distinct from revs ->> 'stock_notices' then jsonb_build_object(
       'unread', (select count(*) from public.stock_notices where read_at is null),
       'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select * from public.stock_notices order by created_at desc limit 20) n), '[]'::jsonb)) end,
    'security', case when sec and p_known ->> 'security_notices' is distinct from revs ->> 'security_notices' then jsonb_build_object(
       'unread', (select count(*) from public.security_notices where read_at is null),
       'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select * from public.security_notices order by created_at desc limit 20) n), '[]'::jsonb)) end);
end $$;

-- Pending → Cooking (accept), Pending → Rejected, Accepted/Cooking/Ready → Served.
create or replace function public.rx_set_status(p_id uuid, p_expected text, p_next text, p_reason text, p_can_reject boolean) returns public.orders
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_id for update;
  if o.id is null then raise exception 'Order not found. Refresh orders.' using errcode = '22023'; end if;
  if p_expected is not null and o.status <> p_expected then raise exception 'This order changed on another screen (now %). Refresh and try again.', o.status using errcode = '40001'; end if;
  if not ((o.status = 'Pending' and p_next in ('Cooking','Accepted')) or (o.status = 'Pending' and p_next = 'Rejected' and p_can_reject)
       or (o.status in ('Accepted','Cooking') and p_next in ('Ready','Served')) or (o.status = 'Ready' and p_next = 'Served')) then
    raise exception 'This status change is not allowed (% → %).', o.status, p_next using errcode = '22023'; end if;
  update public.orders set status = p_next, updated_at = now(),
     cooking_started_at = case when p_next in ('Cooking','Accepted') then coalesce(cooking_started_at, now()) else cooking_started_at end,
     served_at = case when p_next = 'Served' then now() else served_at end,
     cancelled_at = case when p_next = 'Rejected' then now() else cancelled_at end,
     rejection_reason = case when p_next = 'Rejected' then coalesce(nullif(left(trim(p_reason), 200), ''), 'Items unavailable') else rejection_reason end
   where id = p_id returning * into o;
  if p_next = 'Rejected' then perform public.rx_return_stock(o.items); end if;
  perform public.rx_bump('active', 'history');
  return o;
end $$;
create or replace function public.restaurant_staff_status(p_id uuid, p_expected text, p_next text, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform public.rx_require(); return public.rx_order_json(public.rx_set_status(p_id, p_expected, p_next, p_reason, true), true); end $$;

create or replace function public.restaurant_recent_cancelled(p_offset int default 0, p_limit int default 50) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform public.rx_require();
  return jsonb_build_object('server_now', now(), 'offset', greatest(coalesce(p_offset,0),0),
    'total', (select count(*) from public.orders where status in ('Cancelled','Rejected') and cancelled_at > now() - interval '6 hours'),
    'records', coalesce((select jsonb_agg(public.rx_order_json(o, true) order by o.cancelled_at desc) from (select * from public.orders where status in ('Cancelled','Rejected') and cancelled_at > now() - interval '6 hours' order by cancelled_at desc offset greatest(coalesce(p_offset,0),0) limit lim) o), '[]'::jsonb));
end $$;

create or replace function public.restaurant_filtered_records(p_period text default 'day', p_reference date default null, p_offset int default 0, p_limit int default 50, p_status text default 'All') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p record; lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.rx_require();
  select * into p from public.rx_period(p_period, p_reference);
  return (with base as (select * from public.orders where order_day >= p.period_start and order_day < p.period_stop),
               shown as (select * from base where coalesce(p_status,'All') = 'All' or status = p_status or (p_status = 'Cancelled' and status = 'Rejected'))
    select jsonb_build_object('period', p.period, 'period_start', p.period_start, 'period_stop', p.period_stop, 'server_now', now(), 'offset', off, 'page_size', lim,
      'total_orders', (select count(*) from base), 'retained_orders', (select count(*) from shown),
      'completed_orders', (select count(*) from base where status = 'Served'), 'total_value', coalesce((select sum(total) from base where status = 'Served'), 0),
      'records', coalesce((select jsonb_agg(public.rx_order_json(o, true) order by o.created_at desc) from (select * from shown order by created_at desc offset off limit lim) o), '[]'::jsonb)));
end $$;
create or replace function public.restaurant_records(p_period text default 'day', p_reference date default null, p_offset int default 0, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$ select public.restaurant_filtered_records(p_period, p_reference, p_offset, p_limit, 'All') $$;

-- One-time Cash / Online choice for a QR order, inside the window set in Settings.
create or replace function public.restaurant_set_record_payment59(p_order uuid, p_payment_method text) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; c jsonb := (public.rx_settings()).custom; mins int;
begin
  perform public.rx_require();
  if p_payment_method not in ('Cash','Online') then raise exception 'Choose Cash or Online.' using errcode = '22023'; end if;
  if coalesce((c ->> 'orderRecordPaymentEdit')::boolean, true) is false then raise exception 'Payment editing is turned off.' using errcode = '22023'; end if;
  mins := least(greatest(coalesce((c ->> 'orderRecordPaymentEditMinutes')::int, 120), 5), 1440);
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.order_source <> 'qr' then raise exception 'Only QR orders can have a payment recorded here.' using errcode = '22023'; end if;
  if o.payment_method is not null then raise exception 'Payment was already recorded for this order.' using errcode = '22023'; end if;
  if now() > o.created_at + make_interval(mins => mins) then raise exception 'The payment edit window for this order has closed.' using errcode = '22023'; end if;
  update public.orders set payment_method = p_payment_method, updated_at = now() where id = p_order returning * into o;
  perform public.rx_bump('history');
  return public.rx_order_json(o, true);
end $$;

-- Block the customer browser that placed an order.
create or replace function public.restaurant_order_devices(p_ids uuid[] default null, p_action text default null, p_order uuid default null, p_blocked boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare role text := public.rx_require(); s public.restaurant_settings := public.rx_settings(); dev uuid;
begin
  if role <> 'admin' and not s.mgr_order_device_block then raise exception 'Admin access required.' using errcode = '42501'; end if;
  if p_action = 'set_blocked' then
    select device_id into dev from public.orders where id = p_order;
    if dev is null then raise exception 'No browser is linked to this order.' using errcode = '22023'; end if;
    update public.customer_devices set blocked = coalesce(p_blocked, true), updated_at = now() where id = dev;
    perform public.rx_bump('devices', 'security_notices');
    return jsonb_build_object('ok', true);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('order_id', o.id, 'device_id', o.device_id, 'blocked', coalesce(d.blocked, false)))
    from public.orders o left join public.customer_devices d on d.id = o.device_id where o.id = any(coalesce(p_ids, '{}'))), '[]'::jsonb);
end $$;

-- ★ Monthly regular: the browser ordered on 4+ different days this month.
create or replace function public.restaurant_order_loyalty(p_ids uuid[] default null, p_key text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', public.rx_today())::date;
begin
  if public.rx_role() in ('admin','manager') then null; else perform public.rx_waiter(p_key); end if;
  return jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'is_star',
      (select count(distinct x.order_day) from public.orders x where x.device_id = o.device_id and x.order_day >= m and x.status <> 'Rejected') >= 4))
    from public.orders o where o.id = any(coalesce(p_ids, '{}')) and o.device_id is not null), '[]'::jsonb));
end $$;

-- ---------- waiter calls ----------
create or replace function public.restaurant_requests_page47(p_key text default null, p_status text default 'Pending', p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 100); off int := greatest(coalesce(p_offset, 0), 0);
begin
  if p_key is null then perform public.rx_require(); else perform public.rx_waiter(p_key); if not public.rx_waiter_can('view_requests') then raise exception 'Requests are not enabled for waiters.' using errcode = '42501'; end if; end if;
  perform public.rx_housekeeping();
  return jsonb_build_object('total', (select count(*) from public.waiter_calls where coalesce(p_status,'All') = 'All' or status = p_status),
    'pending_count', (select count(*) from public.waiter_calls where status = 'Pending'), 'pending_calls', public.rx_pending_calls(),
    'calls', coalesce((select jsonb_agg(to_jsonb(c) - 'request_id' - 'device_id' order by c.created_at desc) from (select * from public.waiter_calls where coalesce(p_status,'All') = 'All' or status = p_status order by created_at desc offset off limit lim) c), '[]'::jsonb));
end $$;
create or replace function public.restaurant_staff_call(p_request_id uuid, p_table text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.waiter_calls;
begin
  perform public.rx_require();
  select * into c from public.waiter_calls where request_id = p_request_id;
  if c.id is null then
    if p_table <> 'COUNTER' and not exists (select 1 from public.restaurant_tables where table_number = p_table) then raise exception 'Unknown table.' using errcode = '22023'; end if;
    insert into public.waiter_calls (request_id, table_number, request_kind, request_origin) values (p_request_id, p_table, case when p_table = 'COUNTER' then 'Reception' else 'Waiter' end, 'staff_dashboard') returning * into c;
    perform public.rx_bump('calls');
  end if;
  return to_jsonb(c) - 'device_id';
end $$;
create or replace function public.rx_call_update(p_key text, p_id uuid, p_handle boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.waiter_calls;
begin
  if p_key is null then perform public.rx_require(); else perform public.rx_waiter(p_key); if not public.rx_waiter_can('handle_requests') then raise exception 'Handling requests is not enabled for waiters.' using errcode = '42501'; end if; end if;
  update public.waiter_calls set handled_at = case when p_handle then now() else handled_at end, status = case when p_handle then 'Handled' else status end,
         on_the_way_at = case when p_handle then on_the_way_at else coalesce(on_the_way_at, now()) end
   where id = p_id and status = 'Pending' returning * into c;
  if c.id is null then raise exception 'This request was already handled or has expired.' using errcode = '22023'; end if;
  if p_handle then update public.song_requests set status = 'Played', finished_at = now(), updated_at = now() where call_id = c.id and status in ('Queued','Playing'); end if;
  perform public.rx_bump('calls');
  return to_jsonb(c) - 'device_id' - 'request_id';
end $$;
create or replace function public.restaurant_waiter_on_way(p_key text default null, p_id uuid default null) returns jsonb language sql security definer set search_path = public as $$ select public.rx_call_update(p_key, p_id, false) $$;
create or replace function public.restaurant_handle_waiter_call(p_key text default null, p_id uuid default null) returns jsonb language sql security definer set search_path = public as $$ select public.rx_call_update(p_key, p_id, true) $$;

-- ---------- counter billing (manager, admin, or waiter phone) ----------
create or replace function public.rx_billing_access(p_key text) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if p_key is null then perform public.rx_require(); return auth.uid(); end if;
  perform public.rx_waiter(p_key);
  if not (public.rx_settings()).manual_waiter_access then raise exception 'Counter billing is turned off for waiters.' using errcode = '42501'; end if;
  return null;
end $$;
create or replace function public.restaurant_manual_menu_page63(p_query text default '', p_category text default 'All', p_offset int default 0, p_limit int default 40, p_key text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings; q text := lower(trim(coalesce(p_query,''))); lim int := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  perform public.rx_billing_access(p_key); perform public.rx_housekeeping(); s := public.rx_settings();
  return (with list as (select m.* from public.menu_items m left join public.categories c on c.name = m.category
             where m.available and (coalesce(p_category,'All') = 'All' or m.category = p_category) and (q = '' or lower(m.name) like '%' || q || '%' or lower(coalesce(m.item_code,'')) = q))
    select jsonb_build_object('total', (select count(*) from list), 'tax', jsonb_build_object('tax_enabled', s.tax_enabled, 'tax_mode', s.tax_mode, 'tax_value', s.tax_value),
      'categories', coalesce((select jsonb_agg(name order by sort_order, name) from public.categories), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(public.rx_item_json(x) order by x.name) from (select * from list order by name offset greatest(coalesce(p_offset,0),0) limit lim) x), '[]'::jsonb)));
end $$;
create or replace function public.restaurant_manual_order(p_request_id uuid, p_table text default 'Counter', p_name text default '', p_notes text default '', p_items jsonb default '[]'::jsonb,
  p_expected_total numeric default null, p_payment_method text default null, p_key text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  perform public.rx_billing_access(p_key);
  if p_payment_method not in ('Cash','Online') then raise exception 'Choose Cash or Online payment.' using errcode = '22023'; end if;
  o := public.rx_create_order(case when p_key is null then 'manual' else 'waiter' end, p_request_id, null, coalesce(nullif(p_table,''), 'Counter'), p_name, p_notes, p_items, p_expected_total, p_payment_method, null, true);
  return public.rx_order_json(o, true);
end $$;
-- =================== menu, categories, stock ===================
-- Keep categories and stock rows in step with every dish change (also for direct photo/detail edits).
create or replace function public.rx_menu_trigger() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform public.rx_bump('catalog', 'stock'); return old; end if;
  new.updated_at := now();
  new.category := coalesce(nullif(trim(new.category), ''), 'Menu');
  insert into public.categories (name, sort_order) values (new.category, coalesce((select max(sort_order) + 1 from public.categories), 0)) on conflict (name) do nothing;
  return new;
end $$;
create or replace function public.rx_menu_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    if new.sizes_enabled then
      insert into public.menu_stock (menu_id, variant) select new.id, k from jsonb_object_keys(new.size_prices) k on conflict do nothing;
      delete from public.menu_stock where menu_id = new.id and (variant = 'single' or not (new.size_prices ? variant));
    else
      insert into public.menu_stock (menu_id, variant) values (new.id, 'single') on conflict do nothing;
      delete from public.menu_stock where menu_id = new.id and variant <> 'single';
    end if;
  end if;
  perform public.rx_bump('catalog', 'stock');
  return null;
end $$;
drop trigger if exists rx_menu_before on public.menu_items;
create trigger rx_menu_before before insert or update or delete on public.menu_items for each row execute function public.rx_menu_trigger();
drop trigger if exists rx_menu_after on public.menu_items;
create trigger rx_menu_after after insert or update or delete on public.menu_items for each row execute function public.rx_menu_after();

create or replace function public.restaurant_staff_menu_page63(p_query text default '', p_category text default 'All', p_availability text default 'all', p_offset int default 0, p_limit int default 15) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings; q text := lower(trim(coalesce(p_query,''))); lim int := least(greatest(coalesce(p_limit, 15), 1), 100);
begin
  perform public.rx_require(); perform public.rx_housekeeping(); s := public.rx_settings();
  return (with list as (select m.* from public.menu_items m left join public.categories c on c.name = m.category
              where (coalesce(p_category,'All') = 'All' or m.category = p_category)
                and (coalesce(p_availability,'all') = 'all' or (p_availability = 'available' and m.available) or (p_availability = 'unavailable' and not m.available))
                and (q = '' or lower(m.name || ' ' || m.category || ' ' || m.description || ' ' || coalesce(m.item_code,'')) like '%' || q || '%')),
          ordered as (select l.* from list l left join public.categories c on c.name = l.category order by coalesce(c.sort_order, 9999), l.category, l.sort_order, l.name offset greatest(coalesce(p_offset,0),0) limit lim)
    select jsonb_build_object('total', (select count(*) from list), 'tax', jsonb_build_object('tax_enabled', s.tax_enabled, 'tax_mode', s.tax_mode, 'tax_value', s.tax_value),
      'categories', coalesce((select jsonb_agg(name order by sort_order, name) from public.categories), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(public.rx_item_json(o)) from ordered o), '[]'::jsonb)));
end $$;
create or replace function public.restaurant_staff_menu_item63(p_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.menu_items;
begin perform public.rx_require(); select * into m from public.menu_items where id = p_id; if m.id is null then return null; end if; return public.rx_item_json(m); end $$;

-- Prices & portion sizes (+ name, description, category, veg for the admin).
create or replace function public.restaurant_menu_customize(p_id text, p_sizes_enabled boolean, p_base_price numeric, p_size_prices jsonb default '{}'::jsonb, p_size_labels jsonb default '{}'::jsonb,
  p_details jsonb default null, p_expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare role text := public.rx_require(); m public.menu_items; k text; v numeric;
begin
  select * into m from public.menu_items where id = p_id for update;
  if m.id is null then raise exception 'Dish not found.' using errcode = '22023'; end if;
  if p_expected_updated_at is not null and m.updated_at <> p_expected_updated_at then raise exception 'This dish changed on another device. Close, refresh and try again.' using errcode = '40001'; end if;
  if p_details is not null and role <> 'admin' then raise exception 'Only the admin can change dish details.' using errcode = '42501'; end if;
  if p_base_price is null or p_base_price < 0 or p_base_price > 100000 then raise exception 'Invalid price.' using errcode = '22023'; end if;
  if p_sizes_enabled then
    if jsonb_typeof(p_size_prices) <> 'object' or (select count(*) from jsonb_object_keys(p_size_prices)) not between 1 and 20 then raise exception 'Add 1 to 20 sizes.' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(p_size_prices) loop
      v := (p_size_prices ->> k)::numeric;
      if k !~ '^[A-Za-z0-9_]{1,40}$' or v is null or v < 0 or v > 100000 or length(coalesce(p_size_labels ->> k, '')) not between 1 and 40 then raise exception 'Invalid size or price.' using errcode = '22023'; end if;
    end loop;
  end if;
  update public.menu_items set sizes_enabled = p_sizes_enabled, price = round(p_base_price, 2),
     size_prices = case when p_sizes_enabled then p_size_prices else '{}'::jsonb end, size_labels = case when p_sizes_enabled then coalesce(p_size_labels, '{}'::jsonb) else '{}'::jsonb end,
     name = coalesce(nullif(left(trim(p_details ->> 'name'), 120), ''), name), description = coalesce(left(p_details ->> 'description', 1000), description),
     category = coalesce(nullif(trim(p_details ->> 'category'), ''), category), veg = coalesce((p_details ->> 'veg')::boolean, veg)
   where id = p_id returning * into m;
  return public.rx_item_json(m);
end $$;

create or replace function public.restaurant_manager_menu_flags(p_id text, p_available boolean default null, p_recommended boolean default null, p_best_seller boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.menu_items;
begin
  perform public.rx_require();
  update public.menu_items set available = coalesce(p_available, available), recommended = coalesce(p_recommended, recommended), best_seller = coalesce(p_best_seller, best_seller)
   where id = p_id returning * into m;
  if m.id is null then raise exception 'Dish not found.' using errcode = '22023'; end if;
  return public.rx_item_json(m);
end $$;
create or replace function public.restaurant_manager_price(p_id text, p_price numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.menu_items;
begin
  perform public.rx_require();
  if p_price is null or p_price < 0 or p_price > 100000 then raise exception 'Enter a valid price.' using errcode = '22023'; end if;
  update public.menu_items set price = round(p_price, 2) where id = p_id and not sizes_enabled returning * into m;
  if m.id is null then raise exception 'Dish not found, or it uses portion sizes.' using errcode = '22023'; end if;
  return public.rx_item_json(m);
end $$;
create or replace function public.restaurant_add_menu_item66(p_row jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.menu_items;
begin
  perform public.rx_require(array['admin']);
  if coalesce(trim(p_row ->> 'name'), '') = '' then raise exception 'Enter a dish name.' using errcode = '22023'; end if;
  insert into public.menu_items (id, name, price, category, available, item_code, description, veg, image)
  values (coalesce(nullif(p_row ->> 'id', ''), gen_random_uuid()::text), left(trim(p_row ->> 'name'), 120), round(coalesce((p_row ->> 'price')::numeric, 0), 2),
          coalesce(nullif(trim(p_row ->> 'category'), ''), 'Menu'), coalesce((p_row ->> 'available')::boolean, true), nullif(trim(p_row ->> 'item_code'), ''),
          left(coalesce(p_row ->> 'description', ''), 1000), coalesce((p_row ->> 'veg')::boolean, true), coalesce(p_row ->> 'image', ''))
  returning * into m;
  return public.rx_item_json(m);
exception when unique_violation then raise exception 'A dish with this ID or code already exists.' using errcode = '23505';
end $$;

-- CSV import: all rows or none.
create or replace function public.restaurant_import_menu67(p_rows jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; i int := 1; errs jsonb := '[]'::jsonb; m public.menu_items; created int := 0; updated int := 0; price numeric;
begin
  perform public.rx_require(array['admin']);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then return jsonb_build_object('ok', false, 'errors', jsonb_build_array(jsonb_build_object('row', 1, 'message', 'Send 1 to 2000 rows.'))); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    if coalesce(trim(r ->> 'name'), '') = '' or length(r ->> 'name') > 120 then errs := errs || jsonb_build_object('row', i, 'message', 'name is required (up to 120 characters).'); end if;
    begin price := (r ->> 'price')::numeric; exception when others then price := null; end;
    if price is null or price < 0 or price > 100000 then errs := errs || jsonb_build_object('row', i, 'message', 'invalid price.'); end if;
    if coalesce(r ->> 'stock', '') <> '' and (r ->> 'stock') !~ '^[0-9]{1,7}$' then errs := errs || jsonb_build_object('row', i, 'message', 'stock must be a whole number.'); end if;
  end loop;
  if jsonb_array_length(errs) > 0 then return jsonb_build_object('ok', false, 'errors', errs); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    select * into m from public.menu_items where (coalesce(r ->> 'code','') <> '' and lower(item_code) = lower(r ->> 'code')) or (coalesce(r ->> 'code','') = '' and lower(name) = lower(trim(r ->> 'name'))) limit 1;
    if m.id is null then
      insert into public.menu_items (id, name, item_code, category, price, description, veg, available, recommended, best_seller, image)
      values (gen_random_uuid()::text, trim(r ->> 'name'), nullif(trim(r ->> 'code'), ''), coalesce(nullif(trim(r ->> 'category'), ''), 'Menu'), (r ->> 'price')::numeric,
              coalesce(r ->> 'description', ''), coalesce((r ->> 'veg')::boolean, true), coalesce((r ->> 'available')::boolean, (r ->> 'visible')::boolean, true),
              coalesce((r ->> 'recommended')::boolean, false), coalesce((r ->> 'bestseller')::boolean, false), coalesce(nullif(r ->> 'image_url', ''), '')) returning * into m;
      created := created + 1;
    else
      update public.menu_items set name = trim(r ->> 'name'), category = coalesce(nullif(trim(r ->> 'category'), ''), category), price = (r ->> 'price')::numeric,
        description = coalesce(r ->> 'description', description), veg = coalesce((r ->> 'veg')::boolean, veg), available = coalesce((r ->> 'available')::boolean, (r ->> 'visible')::boolean, available),
        recommended = coalesce((r ->> 'recommended')::boolean, recommended), best_seller = coalesce((r ->> 'bestseller')::boolean, best_seller), image = coalesce(nullif(r ->> 'image_url', ''), image)
       where id = m.id returning * into m;
      updated := updated + 1;
    end if;
    if coalesce(r ->> 'stock', '') <> '' and not m.sizes_enabled then
      update public.menu_stock set tracked = true, remaining = (r ->> 'stock')::int, baseline = (r ->> 'stock')::int, alerted = false, revision = revision + 1 where menu_id = m.id and variant = 'single';
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'committed', created + updated, 'created', created, 'updated', updated, 'errors', '[]'::jsonb);
end $$;

create or replace function public.rx_categories_list() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'hidden', c.hidden, 'sort_order', c.sort_order, 'dish_count', (select count(*) from public.menu_items m where m.category = c.name)) order by c.sort_order, c.name), '[]'::jsonb) from public.categories c
$$;
create or replace function public.restaurant_categories66(p_action text default 'list', p_name text default null, p_new_name text default null, p_replacement text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare role text := public.rx_require(); n text := left(trim(coalesce(p_name,'')), 60); nn text := left(trim(coalesce(p_new_name,'')), 60);
begin
  if coalesce(p_action,'list') <> 'list' then
    if role <> 'admin' and p_action not in ('hide','show') then raise exception 'Admin access required.' using errcode = '42501'; end if;
    if p_action = 'add' then
      if n = '' then raise exception 'Enter a category name.' using errcode = '22023'; end if;
      insert into public.categories (name, sort_order) values (n, coalesce((select max(sort_order) + 1 from public.categories), 0)) on conflict (name) do nothing;
    elsif p_action = 'rename' then
      if nn = '' or exists (select 1 from public.categories where name = nn) then raise exception 'Choose a new, unused category name.' using errcode = '22023'; end if;
      update public.categories set name = nn where name = n;
      update public.menu_items set category = nn where category = n;
    elsif p_action = 'remove' then
      if exists (select 1 from public.menu_items where category = n) then
        if coalesce(p_replacement,'') = '' or p_replacement = n or not exists (select 1 from public.categories where name = p_replacement) then raise exception 'Choose another category to move its dishes to.' using errcode = '22023'; end if;
        update public.menu_items set category = p_replacement where category = n;
      end if;
      delete from public.categories where name = n;
    elsif p_action in ('hide','show') then
      update public.categories set hidden = (p_action = 'hide') where name = n;
    else raise exception 'Unknown action.' using errcode = '22023'; end if;
    perform public.rx_bump('catalog', 'config');
  end if;
  return jsonb_build_object('categories', public.rx_categories_list(), 'can', jsonb_build_object('add', role = 'admin', 'rename', role = 'admin', 'remove', role = 'admin', 'hide', true, 'addItem', role = 'admin'));
end $$;
-- Older screens use this simpler form.
create or replace function public.restaurant_categories(p_action text default 'list', p_name text default null, p_replacement text default null, p_item text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require();
  if p_action = 'assign' then
    perform public.rx_require(array['admin']);
    update public.menu_items set category = p_replacement where id = p_item;
  elsif coalesce(p_action,'list') <> 'list' then perform public.restaurant_categories66(p_action, p_name, null, p_replacement); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('name', x ->> 'name', 'dish_count', (x ->> 'dish_count')::int)), '[]'::jsonb) from jsonb_array_elements(public.rx_categories_list()) x);
end $$;

-- Order of categories (p_category null) or of dishes inside one category.
create or replace function public.restaurant_menu_layout(p_category text default null, p_ids text[] default null, p_revision text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i int;
begin
  perform public.rx_require();
  if p_ids is not null then
    if p_revision is not null and p_revision <> public.rx_rev('config') then raise exception 'The menu changed on another device. Reload and arrange again.' using errcode = '40001'; end if;
    for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
      if p_category is null then update public.categories set sort_order = i where name = p_ids[i];
      else update public.menu_items set sort_order = i where id = p_ids[i] and category = p_category; end if;
    end loop;
    perform public.rx_bump('catalog', 'config');
  end if;
  return jsonb_build_object('revision', public.rx_rev('config'),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'sort_order', sort_order) order by sort_order, name) from public.categories), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'category', category, 'sort_order', sort_order) order by category, sort_order, name) from public.menu_items), '[]'::jsonb));
end $$;

create or replace function public.restaurant_stocks() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require(); perform public.rx_housekeeping();
  return coalesce((select jsonb_agg(jsonb_build_object('menu_id', m.id, 'variant', s.variant, 'name', m.name, 'size_label', public.rx_size_label(m, s.variant), 'category', m.category,
      'manual_available', m.available, 'tracked', s.tracked, 'remaining', s.remaining, 'baseline', s.baseline, 'low_stock_at', greatest(1, s.baseline / 20),
      'unit_price', case when s.variant = 'single' then m.price else (m.size_prices ->> s.variant)::numeric end, 'revision', s.revision,
      'loop_enabled', s.loop_enabled, 'loop_quantity', s.loop_quantity, 'loop_next_reset_at', s.loop_next_reset_at) order by m.category, m.name, s.variant)
    from public.menu_stock s join public.menu_items m on m.id = s.menu_id), '[]'::jsonb);
end $$;
create or replace function public.restaurant_set_stock(p_id text, p_variant text, p_tracking boolean, p_quantity int, p_revision bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.menu_stock;
begin
  perform public.rx_require();
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then raise exception 'Stock must be a whole number from 0 to 1000000.' using errcode = '22023'; end if;
  select * into s from public.menu_stock where menu_id = p_id and variant = coalesce(p_variant, 'single') for update;
  if s.menu_id is null then raise exception 'Dish or size not found. Reload stock.' using errcode = '22023'; end if;
  if p_revision is not null and s.revision <> p_revision then raise exception 'Stock changed on another device (an order may have used it). Reload and try again.' using errcode = '40001'; end if;
  update public.menu_stock set tracked = coalesce(p_tracking, true), remaining = p_quantity, baseline = p_quantity, alerted = false, revision = revision + 1,
         loop_enabled = case when coalesce(p_tracking, true) then loop_enabled else false end
   where menu_id = p_id and variant = s.variant returning * into s;
  perform public.rx_bump('stock');
  return jsonb_build_object('ok', true, 'remaining', s.remaining, 'revision', s.revision);
end $$;
create or replace function public.restaurant_set_stock_loop(p_id text, p_variant text, p_enabled boolean, p_quantity int, p_revision bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.menu_stock;
begin
  perform public.rx_require();
  select * into s from public.menu_stock where menu_id = p_id and variant = coalesce(p_variant, 'single') for update;
  if s.menu_id is null then raise exception 'Dish or size not found. Reload stock.' using errcode = '22023'; end if;
  if not s.tracked then raise exception 'Track this stock before turning on a loop.' using errcode = '22023'; end if;
  if p_enabled and (p_quantity is null or p_quantity < 0 or p_quantity > 1000000) then raise exception 'Enter a whole loop quantity from 0 to 1000000.' using errcode = '22023'; end if;
  update public.menu_stock set loop_enabled = p_enabled, loop_quantity = case when p_enabled then p_quantity else loop_quantity end,
         loop_next_reset_at = case when p_enabled and not loop_enabled then now() + interval '24 hours' when p_enabled then coalesce(loop_next_reset_at, now() + interval '24 hours') else null end,
         revision = revision + 1
   where menu_id = p_id and variant = s.variant returning * into s;
  perform public.rx_bump('stock');
  return jsonb_build_object('ok', true, 'loop_enabled', s.loop_enabled, 'loop_next_reset_at', s.loop_next_reset_at);
end $$;
create or replace function public.restaurant_stock_visibility(p_hidden boolean default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require();
  if p_hidden is not null then perform public.rx_require(array['admin']); update public.restaurant_settings set stocks_hidden = p_hidden where id = 1; perform public.rx_bump('config', 'permissions'); end if;
  return jsonb_build_object('stocks_hidden', (public.rx_settings()).stocks_hidden);
end $$;
-- =================== tables, devices, notifications, settings ===================
create or replace function public.rx_tables_list() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('table_number', table_number, 'display_name', display_name, 'status', status,
    'qr_key', case when public.rx_role() = 'admin' then qr_key end) order by length(table_number), table_number), '[]'::jsonb) from public.restaurant_tables
$$;
create or replace function public.rx_new_table(p_name text) returns public.restaurant_tables language plpgsql security definer set search_path = public as $$
declare t public.restaurant_tables; n int;
begin
  select coalesce(max(substr(table_number, 2)::int), 0) + 1 into n from public.restaurant_tables;
  if n > 9999 then raise exception 'Table limit reached.' using errcode = '22023'; end if;
  insert into public.restaurant_tables (table_number, display_name) values ('T' || n, coalesce(nullif(trim(p_name), ''), 'Table ' || n)) returning * into t;
  perform public.rx_bump('config');
  return t;
end $$;
create or replace function public.restaurant_manage_tables(p_action text default 'list', p_table text default null, p_status text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare role text := public.rx_require();
begin
  if coalesce(p_action,'list') <> 'list' then
    if p_action <> 'add' and not exists (select 1 from public.restaurant_tables where table_number = p_table) then raise exception 'Table not found.' using errcode = '22023'; end if;
    if p_action = 'status' then
      if p_status not in ('Available','Reserved') then raise exception 'Choose Available or Reserved.' using errcode = '22023'; end if;
      update public.restaurant_tables set status = p_status where table_number = p_table;
    else
      if role <> 'admin' then raise exception 'Admin access required.' using errcode = '42501'; end if;
      if p_action = 'add' then perform public.rx_new_table(p_table);
      elsif p_action = 'remove' then delete from public.restaurant_tables where table_number = p_table;
      elsif p_action = 'rotate' then
        update public.restaurant_tables set qr_key = encode(extensions.gen_random_bytes(16),'hex') where table_number = p_table;
        update public.table_visits set expires_at = now() where table_number = p_table;
      else raise exception 'Unknown action.' using errcode = '22023'; end if;
    end if;
    perform public.rx_bump('config');
  end if;
  return public.rx_tables_list();
end $$;
create or replace function public.restaurant_save_table_name(p_table text, p_name text) returns jsonb language plpgsql security definer set search_path = public as $$
declare role text := public.rx_require(); t public.restaurant_tables; clean text := regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g');
begin
  if clean = '' or length(clean) > 60 or clean ~ '[\x00-\x1f\x7f]' then raise exception 'Enter a table name with 1–60 characters.' using errcode = '22023'; end if;
  if p_table is null then
    if role <> 'admin' then raise exception 'Admin access required.' using errcode = '42501'; end if;
    t := public.rx_new_table(clean);
  else
    if role <> 'admin' and coalesce(((public.rx_settings()).custom ->> 'managerCanRenameTables')::boolean, true) is false then raise exception 'Table name editing is turned off by the administrator.' using errcode = '42501'; end if;
    update public.restaurant_tables set display_name = clean where table_number = p_table returning * into t;
    if t.table_number is null then raise exception 'Table not found.' using errcode = '22023'; end if;
    perform public.rx_bump('config');
  end if;
  return jsonb_build_object('table_number', t.table_number, 'display_name', t.display_name, 'status', t.status);
end $$;

create or replace function public.rx_can_devices() returns boolean language sql stable security definer set search_path = public as $$
  select public.rx_role() = 'admin' or (public.rx_role() = 'manager' and (select mgr_customer_devices from public.restaurant_settings where id = 1))
$$;
create or replace function public.restaurant_admin_devices(p_action text default 'list', p_device uuid default null, p_blocked boolean default null, p_sort text default 'date',
  p_direction text default 'desc', p_offset int default 0, p_limit int default 50) returns jsonb language plpgsql security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 100); off int := greatest(coalesce(p_offset,0), 0); m date := date_trunc('month', public.rx_today())::date; ord text;
begin
  perform public.rx_require();
  if not public.rx_can_devices() then raise exception 'Admin access required.' using errcode = '42501'; end if;
  if p_action = 'set_blocked' then
    update public.customer_devices set blocked = coalesce(p_blocked, true), updated_at = now() where id = p_device;
    if not found then raise exception 'Device not found.' using errcode = '22023'; end if;
    perform public.rx_bump('devices', 'security_notices');
  end if;
  ord := case p_sort when 'orders' then 'order_count' when 'seen' then 'last_seen' when 'edited' then 'updated_at' else 'first_seen' end || case when p_direction = 'asc' then ' asc' else ' desc' end;
  return jsonb_build_object('total', (select count(*) from public.customer_devices), 'blocked_count', (select count(*) from public.customer_devices where blocked), 'offset', off,
    'devices', coalesce((select jsonb_agg(x) from (
       select jsonb_build_object('id', d.id, 'blocked', d.blocked, 'browser_info', d.browser_info, 'first_seen', d.first_seen, 'last_seen', d.last_seen, 'updated_at', d.updated_at,
         'last_table_number', d.last_table_number, 'order_count', c.order_count, 'monthly_order_days', c.month_days, 'is_star', c.month_days >= 4,
         'last_order', (select jsonb_build_object('number', daily_number, 'day', order_day) from public.orders o where o.device_id = d.id order by created_at desc limit 1)) x,
         c.order_count, d.first_seen, d.last_seen, d.updated_at
       from public.customer_devices d cross join lateral (select count(*) as order_count, count(distinct order_day) filter (where order_day >= m) as month_days from public.orders o where o.device_id = d.id) c
       order by case when ord = 'order_count desc' then c.order_count end desc nulls last, case when ord = 'order_count asc' then c.order_count end asc nulls last,
                case when ord = 'last_seen desc' then d.last_seen end desc nulls last, case when ord = 'last_seen asc' then d.last_seen end asc nulls last,
                case when ord = 'updated_at desc' then d.updated_at end desc nulls last, case when ord = 'updated_at asc' then d.updated_at end asc nulls last,
                case when ord = 'first_seen asc' then d.first_seen end asc nulls last, d.first_seen desc
       offset off limit lim) q), '[]'::jsonb));
end $$;

create or replace function public.restaurant_stock_alerts(p_offset int default 0, p_action text default null, p_id uuid default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare off int := greatest(coalesce(p_offset,0), 0);
begin
  perform public.rx_require(); perform public.rx_housekeeping();
  if p_action = 'read' then update public.stock_notices set read_at = coalesce(read_at, now()) where id = p_id; perform public.rx_bump('stock_notices');
  elsif p_action = 'read_all' then update public.stock_notices set read_at = now() where read_at is null; perform public.rx_bump('stock_notices'); end if;
  return jsonb_build_object('total', (select count(*) from public.stock_notices), 'unread', (select count(*) from public.stock_notices where read_at is null), 'offset', off,
    'retention_minutes', (public.rx_settings()).notification_minutes,
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select * from public.stock_notices order by created_at desc offset off limit 50) n), '[]'::jsonb));
end $$;
create or replace function public.restaurant_notifications(p_offset int default 0, p_action text default null, p_id uuid default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare off int := greatest(coalesce(p_offset,0), 0); s public.restaurant_settings := public.rx_settings();
begin
  if public.rx_require() <> 'admin' and not (s.mgr_customer_devices or s.mgr_order_device_block) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  perform public.rx_housekeeping();
  if p_action = 'read' then update public.security_notices set read_at = coalesce(read_at, now()) where id = p_id; perform public.rx_bump('security_notices');
  elsif p_action = 'read_all' then update public.security_notices set read_at = now() where read_at is null; perform public.rx_bump('security_notices'); end if;
  return jsonb_build_object('total', (select count(*) from public.security_notices), 'unread', (select count(*) from public.security_notices where read_at is null), 'offset', off,
    'retention_minutes', s.notification_minutes,
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) || jsonb_build_object('blocked', coalesce(d.blocked, false), 'device_exists', d.id is not null) order by n.created_at desc)
       from (select * from public.security_notices order by created_at desc offset off limit 50) n left join public.customer_devices d on d.id = n.device_id), '[]'::jsonb));
end $$;
create or replace function public.restaurant_notification_device(p_id uuid, p_blocked boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings := public.rx_settings();
begin
  if public.rx_require() <> 'admin' and not (s.mgr_customer_devices or s.mgr_order_device_block) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  update public.customer_devices set blocked = p_blocked, updated_at = now() where id = (select device_id from public.security_notices where id = p_id);
  if not found then raise exception 'No browser is linked to this notification.' using errcode = '22023'; end if;
  perform public.rx_bump('devices', 'security_notices');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.restaurant_manager_permissions(p_customer_devices boolean default null, p_order_device_block boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require();
  if p_customer_devices is not null or p_order_device_block is not null then
    perform public.rx_require(array['admin']);
    update public.restaurant_settings set mgr_customer_devices = coalesce(p_customer_devices, mgr_customer_devices), mgr_order_device_block = coalesce(p_order_device_block, mgr_order_device_block) where id = 1;
    perform public.rx_bump('permissions');
  end if;
  return (select jsonb_build_object('customer_devices', mgr_customer_devices, 'order_device_block', mgr_order_device_block) from public.restaurant_settings where id = 1);
end $$;
create or replace function public.restaurant_retention_settings(p_current_minutes int default null, p_history_minutes int default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require(array['admin']);
  if p_current_minutes is not null then
    if p_current_minutes < 1 or p_history_minutes is null or p_history_minutes < p_current_minutes or p_history_minutes > 10080 then raise exception 'Choose 1 to 10080 minutes. History must be at least as long as current orders.' using errcode = '22023'; end if;
    update public.restaurant_settings set current_minutes = p_current_minutes, history_minutes = p_history_minutes where id = 1; perform public.rx_bump('config', 'active');
  end if;
  return (select jsonb_build_object('current_minutes', current_minutes, 'history_minutes', history_minutes) from public.restaurant_settings where id = 1);
end $$;
create or replace function public.restaurant_activity_settings(p_notification_minutes int default null, p_request_minutes int default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require(array['admin']);
  if p_notification_minutes is not null or p_request_minutes is not null then
    if coalesce(p_notification_minutes, 1) not between 1 and 10080 or coalesce(p_request_minutes, 1) not between 1 and 10080 then raise exception 'Choose whole minutes from 1 to 10080.' using errcode = '22023'; end if;
    update public.restaurant_settings set notification_minutes = coalesce(p_notification_minutes, notification_minutes), request_minutes = coalesce(p_request_minutes, request_minutes) where id = 1;
  end if;
  return (select jsonb_build_object('notification_minutes', notification_minutes, 'request_minutes', request_minutes) from public.restaurant_settings where id = 1);
end $$;
create or replace function public.restaurant_commerce_settings(p_enabled boolean default null, p_mode text default null, p_value numeric default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require();
  if p_enabled is not null then
    perform public.rx_require(array['admin']);
    if coalesce(p_mode,'percent') not in ('percent','fixed') or coalesce(p_value,0) < 0 or (coalesce(p_mode,'percent') = 'percent' and coalesce(p_value,0) > 100) or coalesce(p_value,0) > 100000 then raise exception 'Enter a valid tax.' using errcode = '22023'; end if;
    update public.restaurant_settings set tax_enabled = p_enabled, tax_mode = coalesce(p_mode, tax_mode), tax_value = round(coalesce(p_value, tax_value), 2) where id = 1;
    perform public.rx_bump('config');
  end if;
  return (select jsonb_build_object('tax_enabled', tax_enabled, 'tax_scope', 'bill', 'tax_mode', tax_mode, 'tax_value', tax_value) from public.restaurant_settings where id = 1);
end $$;
-- Contact details: everyone can read; the admin edits.
create or replace function public.restaurant_contact(p_save boolean default false, p_name text default null, p_phone text default null, p_details text default null, p_waiter_billing boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_save, false) then
    perform public.rx_require(array['admin']);
    update public.restaurant_settings set contact_name = left(coalesce(p_name, contact_name), 80), contact_phone = left(coalesce(p_phone, contact_phone), 40),
      contact_details = left(coalesce(p_details, contact_details), 1000), manual_waiter_access = coalesce(p_waiter_billing, manual_waiter_access) where id = 1;
    perform public.rx_bump('config');
  end if;
  return (select jsonb_build_object('contact_name', contact_name, 'phone', contact_phone, 'details', contact_details, 'manual_waiter_access', manual_waiter_access) from public.restaurant_settings where id = 1);
end $$;
create or replace function public.restaurant_alert_settings(p_settings jsonb default null, p_revision int default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare k text;
begin
  perform public.rx_require();
  if p_settings is not null then
    perform public.rx_require(array['admin']);
    if p_revision is not null and p_revision <> (public.rx_settings()).alert_revision then raise exception 'Alert settings changed on another device. Reload and try again.' using errcode = '40001'; end if;
    foreach k in array array['orders_sound','waiter_sound','notification_sound'] loop
      if coalesce(p_settings ->> k, 'chime') not in ('chime','doorbell','bell','none') then raise exception 'Choose a listed alarm tune.' using errcode = '22023'; end if;
    end loop;
    update public.restaurant_settings set alert = alert || jsonb_build_object('orders_sound', coalesce(p_settings ->> 'orders_sound', alert ->> 'orders_sound'), 'waiter_sound', coalesce(p_settings ->> 'waiter_sound', alert ->> 'waiter_sound'),
      'notification_sound', coalesce(p_settings ->> 'notification_sound', alert ->> 'notification_sound'), 'voice_enabled', false), alert_revision = alert_revision + 1 where id = 1;
    perform public.rx_bump('config');
  end if;
  return (select alert || jsonb_build_object('revision', alert_revision) from public.restaurant_settings where id = 1);
end $$;
create or replace function public.restaurant_review_settings(p_url text default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_url is not null then
    perform public.rx_require(array['admin']);
    if trim(p_url) <> '' and trim(p_url) !~* '^https://[^\s<>"]+$' then raise exception 'Enter a review link that starts with https://' using errcode = '22023'; end if;
    update public.restaurant_settings set review_url = trim(p_url) where id = 1;
  end if;
  return jsonb_build_object('url', (public.rx_settings()).review_url);
end $$;
create or replace function public.restaurant_footer_settings(p_show_credit boolean default null, p_show_link boolean default null, p_url text default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_show_credit is not null or p_show_link is not null or p_url is not null then
    perform public.rx_require(array['admin']);
    if coalesce(p_url,'') <> '' and p_url !~* '^https?://[^\s<>"]+$' then raise exception 'Enter a link that starts with https://' using errcode = '22023'; end if;
    update public.restaurant_settings set footer_show_credit = coalesce(p_show_credit, footer_show_credit), footer_show_link = coalesce(p_show_link, footer_show_link), footer_url = coalesce(p_url, footer_url) where id = 1;
    perform public.rx_bump('config');
  end if;
  return (select jsonb_build_object('show_credit', footer_show_credit, 'show_link', footer_show_link, 'url', footer_url) from public.restaurant_settings where id = 1);
end $$;
-- Restaurant look & words (menu layout, banners, names, bill words). Everyone reads; the admin saves with a revision check.
create or replace function public.restaurant_custom48(p_known text default null, p_settings jsonb default null, p_expected text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings := public.rx_settings();
begin
  if p_settings is not null then
    perform public.rx_require(array['admin']);
    if jsonb_typeof(p_settings) <> 'object' or octet_length(p_settings::text) > 2000000 then raise exception 'Settings are too large. Use smaller photos.' using errcode = '22023'; end if;
    if p_expected is not null and p_expected <> s.custom_revision::text then raise exception 'Settings changed on another device. Reload settings and try again.' using errcode = '40001'; end if;
    update public.restaurant_settings set custom = p_settings, custom_revision = custom_revision + 1 where id = 1 returning * into s;
    perform public.rx_bump('config');
    return jsonb_build_object('settings', s.custom, 'revision', s.custom_revision::text);
  end if;
  return jsonb_build_object('revision', s.custom_revision::text, 'settings', case when p_known is not distinct from s.custom_revision::text then null else s.custom end);
end $$;
create or replace function public.restaurant_egress_checkpoint48(p_bytes bigint, p_start date default null, p_end date default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require(array['admin']);
  if p_bytes is null or p_bytes < 0 then raise exception 'Enter verified dashboard usage.' using errcode = '22023'; end if;
  insert into public.egress_checkpoints (bytes, period_start, period_end, created_by) values (p_bytes, p_start, p_end, auth.uid());
  return jsonb_build_object('ok', true, 'archived', 0);
end $$;

-- Permanent resets with typed confirmation.
create or replace function public.restaurant_admin_reset(p_scope text, p_confirmation text, p_request_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := 0; done jsonb;
begin
  perform public.rx_require(array['admin']);
  select result into done from public.request_log where request_id = p_request_id; if done is not null then return done; end if;
  if p_scope = 'records' then
    if p_confirmation <> 'DELETE RECORDS' then raise exception 'Type DELETE RECORDS exactly.' using errcode = '22023'; end if;
    if exists (select 1 from public.orders where status in ('Pending','Accepted','Cooking','Ready')) then raise exception 'Finish or cancel the open orders first.' using errcode = '22023'; end if;
    delete from public.orders; get diagnostics n = row_count; delete from public.order_counters;
    perform public.rx_bump('active', 'history');
  elsif p_scope = 'devices' then
    if p_confirmation <> 'DELETE DEVICES' then raise exception 'Type DELETE DEVICES exactly.' using errcode = '22023'; end if;
    delete from public.security_notices; delete from public.table_visits; delete from public.customer_devices; get diagnostics n = row_count;
    perform public.rx_bump('devices', 'security_notices');
  else raise exception 'Unknown reset.' using errcode = '22023'; end if;
  done := jsonb_build_object('ok', true, 'scope', p_scope, 'deleted', n, 'deleted_orders', case when p_scope = 'records' then n end);
  insert into public.request_log (request_id, kind, result) values (p_request_id, 'reset', done);
  return done;
end $$;
-- =================== waiter phones ===================
create or replace function public.rx_new_waiter_session(p_user uuid, p_device text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex'); exp timestamptz := now() + make_interval(hours => (public.rx_settings()).waiter_hours);
begin
  insert into public.waiter_sessions (token_hash, user_id, device, expires_at) values (public.rx_hash(tok), p_user, left(p_device, 80), exp);
  return jsonb_build_object('token', tok, 'expires_at', exp);
end $$;
-- Admin shows a QR; a waiter phone scans it and gets its own shift session.
create or replace function public.restaurant_waiter_link(p_rotate boolean default false) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare key text := encode(extensions.gen_random_bytes(24), 'hex'); s public.restaurant_settings := public.rx_settings();
begin
  perform public.rx_require(array['admin']);
  if p_rotate then update public.waiter_sessions set revoked = true where user_id is null and not revoked; end if;
  update public.restaurant_settings set waiter_pair_hash = public.rx_hash(key), waiter_pair_expires = now() + make_interval(hours => s.waiter_hours) where id = 1;
  return jsonb_build_object('token', key, 'expires_in_hours', s.waiter_hours, 'access_hours', s.waiter_hours);
end $$;
create or replace function public.restaurant_waiter_exchange(p_pair_key text, p_device text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings := public.rx_settings();
begin
  if s.waiter_pair_hash is null or s.waiter_pair_hash <> public.rx_hash(p_pair_key) or s.waiter_pair_expires < now() then raise exception 'This waiter QR is old or invalid. Ask the manager for today''s waiter QR.' using errcode = '42501'; end if;
  if coalesce((s.waiter_perms ->> 'enabled')::boolean, true) is false then raise exception 'Waiter access is turned off by the restaurant.' using errcode = '42501'; end if;
  return public.rx_new_waiter_session(null, p_device);
end $$;
create or replace function public.restaurant_waiter_account_session66(p_device text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.staff_users;
begin
  select * into u from public.staff_users where user_id = auth.uid() and role = 'waiter' and active;
  if u.user_id is null then raise exception 'This login is not an active waiter account.' using errcode = '42501'; end if;
  return public.rx_new_waiter_session(u.user_id, p_device) || jsonb_build_object('name', u.name);
end $$;
create or replace function public.restaurant_waiter_heartbeat66(p_key text) returns jsonb language plpgsql security definer set search_path = public as $$
declare w public.waiter_sessions := public.rx_waiter(p_key);
begin return jsonb_build_object('ok', true, 'name', (select name from public.staff_users where user_id = w.user_id), 'expires_at', w.expires_at); end $$;
create or replace function public.restaurant_waiter_signout(p_key text) returns jsonb language plpgsql security definer set search_path = public as $$
begin update public.waiter_sessions set revoked = true where token_hash = public.rx_hash(p_key); delete from public.push_devices where waiter_token_hash = public.rx_hash(p_key); return jsonb_build_object('ok', true); end $$;
create or replace function public.restaurant_waiter_public56() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('app_name', waiter_app_name, 'song_requests_enabled', song_requests) from public.restaurant_settings where id = 1
$$;
create or replace function public.restaurant_waiter_sync47(p_key text, p_known jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare w public.waiter_sessions := public.rx_waiter(p_key); s public.restaurant_settings; revs jsonb;
begin
  perform public.rx_housekeeping(); s := public.rx_settings(); revs := public.rx_revisions();
  return jsonb_build_object('permissions', s.waiter_perms, 'session_expires_at', w.expires_at, 'revisions', revs,
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('table_number', table_number, 'display_name', display_name)), '[]'::jsonb) from public.restaurant_tables),
    'orders', case when not public.rx_waiter_can('view_orders') then '[]'::jsonb when p_known ->> 'active' is not distinct from revs ->> 'active' then null else public.rx_active_orders() end,
    'calls', case when not public.rx_waiter_can('view_requests') then '[]'::jsonb when p_known ->> 'calls' is not distinct from revs ->> 'calls' then null else public.rx_pending_calls() end);
end $$;
create or replace function public.restaurant_waiter_status(p_key text, p_id uuid, p_expected text, p_next text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_waiter(p_key);
  if (p_next in ('Cooking','Accepted') and not public.rx_waiter_can('accept_orders')) or (p_next in ('Served','Ready') and not public.rx_waiter_can('serve_orders')) or p_next not in ('Cooking','Accepted','Ready','Served') then
    raise exception 'This action is not enabled for waiters.' using errcode = '42501'; end if;
  return public.rx_order_json(public.rx_set_status(p_id, p_expected, p_next, null, false), true);
end $$;
create or replace function public.restaurant_waiter_access_settings(p_hours int default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require();
  if p_hours is not null then
    if p_hours not between 1 and 24 then raise exception 'Choose a whole number from 1 to 24 hours.' using errcode = '22023'; end if;
    update public.restaurant_settings set waiter_hours = p_hours where id = 1;
  end if;
  return jsonb_build_object('access_hours', (public.rx_settings()).waiter_hours);
end $$;
create or replace function public.restaurant_waiter_config56(p_app_name text default null, p_song_requests boolean default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare role text := public.rx_require();
begin
  if p_app_name is not null then
    if length(trim(p_app_name)) not between 1 and 40 then raise exception 'Enter a waiter app name from 1 to 40 characters.' using errcode = '22023'; end if;
    update public.restaurant_settings set waiter_app_name = trim(p_app_name) where id = 1;
  end if;
  if p_song_requests is not null then
    if role <> 'admin' then raise exception 'Only the admin can change song requests.' using errcode = '42501'; end if;
    update public.restaurant_settings set song_requests = p_song_requests where id = 1;
  end if;
  return public.restaurant_waiter_public56();
end $$;
create or replace function public.restaurant_waiter_permissions(p_enabled boolean default null, p_view_orders boolean default null, p_accept_orders boolean default null, p_serve_orders boolean default null,
  p_view_requests boolean default null, p_handle_requests boolean default null, p_alerts boolean default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare p jsonb;
begin
  perform public.rx_require();
  if coalesce(p_enabled, p_view_orders, p_accept_orders, p_serve_orders, p_view_requests, p_handle_requests, p_alerts) is not null then
    perform public.rx_require(array['admin']);
    select waiter_perms into p from public.restaurant_settings where id = 1;
    p := p || jsonb_strip_nulls(jsonb_build_object('enabled', p_enabled, 'view_orders', p_view_orders, 'accept_orders', p_accept_orders, 'serve_orders', p_serve_orders,
      'view_requests', p_view_requests, 'handle_requests', p_handle_requests, 'alerts', p_alerts));
    update public.restaurant_settings set waiter_perms = p where id = 1;
    perform public.rx_bump('permissions');
  end if;
  return (public.rx_settings()).waiter_perms;
end $$;
-- Waiter logins with email + password (created inside Supabase Auth).
create or replace function public.restaurant_waiter_accounts66(p_action text default 'list', p_email text default null, p_password text default null, p_name text default null, p_user uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare uid uuid; em text := lower(trim(coalesce(p_email,'')));
begin
  if coalesce(p_action,'list') <> 'list' then perform public.rx_require(array['admin']); else perform public.rx_require(); end if;
  if p_action = 'add' then
    if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email.' using errcode = '22023'; end if;
    if length(coalesce(p_password,'')) < 8 then raise exception 'Password must be at least 8 characters.' using errcode = '22023'; end if;
    if length(trim(coalesce(p_name,''))) not between 1 and 60 then raise exception 'Enter the waiter''s name.' using errcode = '22023'; end if;
    select id into uid from auth.users where lower(email) = em;
    if uid is not null and exists (select 1 from public.staff_users where user_id = uid and role <> 'waiter') then raise exception 'This email already belongs to an admin or manager.' using errcode = '22023'; end if;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', jsonb_build_object('name', trim(p_name)), now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
    else
      update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = uid;
    end if;
    insert into public.staff_users (user_id, role, name, email, active) values (uid, 'waiter', trim(p_name), em, true)
    on conflict (user_id) do update set role = 'waiter', name = excluded.name, email = excluded.email, active = true;
  elsif p_action in ('password','rename','revoke','restore','remove') then
    if not exists (select 1 from public.staff_users where user_id = p_user and role = 'waiter') then raise exception 'Waiter not found.' using errcode = '22023'; end if;
    if p_action = 'password' then
      if length(coalesce(p_password,'')) < 8 then raise exception 'Password must be at least 8 characters.' using errcode = '22023'; end if;
      update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
      update public.waiter_sessions set revoked = true where user_id = p_user;
    elsif p_action = 'rename' then
      if length(trim(coalesce(p_name,''))) not between 1 and 60 then raise exception 'Enter a name.' using errcode = '22023'; end if;
      update public.staff_users set name = trim(p_name) where user_id = p_user;
    elsif p_action = 'revoke' then update public.staff_users set active = false where user_id = p_user; update public.waiter_sessions set revoked = true where user_id = p_user;
    elsif p_action = 'restore' then update public.staff_users set active = true where user_id = p_user;
    else delete from public.waiter_sessions where user_id = p_user; delete from public.staff_users where user_id = p_user; delete from auth.users where id = p_user; end if;
  elsif coalesce(p_action,'list') <> 'list' then raise exception 'Unknown action.' using errcode = '22023'; end if;
  return jsonb_build_object('can_manage', public.rx_role() = 'admin',
    'qr_devices', (select count(*) from public.waiter_sessions where user_id is null and not revoked and expires_at > now()),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'name', u.name, 'email', u.email, 'active', u.active,
        'last_seen', ws.last_seen, 'signed_in', ws.last_seen is not null, 'online', ws.last_seen > now() - interval '2 minutes') order by u.name)
      from public.staff_users u left join lateral (select max(last_seen) last_seen from public.waiter_sessions w where w.user_id = u.user_id and not w.revoked and w.expires_at > now()) ws on true
      where u.role = 'waiter'), '[]'::jsonb));
end $$;

-- Phone notifications: the subscription is stored here; delivery is done by an optional sender (Edge Function).
create or replace function public.restaurant_push_device(p_kind text, p_key text default null, p_action text default 'enable', p_subscription jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ep text := p_subscription ->> 'endpoint';
begin
  if p_kind = 'waiter' then perform public.rx_waiter(p_key); elsif p_kind = 'kitchen' then perform public.rx_require(); else raise exception 'Unknown device kind.' using errcode = '22023'; end if;
  if coalesce(ep,'') !~ '^https://' then raise exception 'Invalid notification subscription.' using errcode = '22023'; end if;
  if p_action = 'disable' then delete from public.push_devices where endpoint = ep;
  else insert into public.push_devices (endpoint, kind, subscription, user_id, waiter_token_hash) values (ep, p_kind, p_subscription, auth.uid(), case when p_kind = 'waiter' then public.rx_hash(p_key) end)
       on conflict (endpoint) do update set kind = excluded.kind, subscription = excluded.subscription, user_id = excluded.user_id, waiter_token_hash = excluded.waiter_token_hash, updated_at = now(); end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.restaurant_push_diagnostics(p_kind text, p_key text default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'waiter' then perform public.rx_waiter(p_key); else perform public.rx_require(); end if;
  return jsonb_build_object('registered', (select count(*) from public.push_devices where kind = p_kind), 'delivery_configured', false, 'sender', null);
end $$;

-- =================== reports ===================
create or replace function public.restaurant_dish_sales(p_period text default 'day', p_reference date default null, p_mode text default 'dishes', p_sort text default 'quantity', p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p record; lim int := least(greatest(coalesce(p_limit, 50), 1), 100); off int := greatest(coalesce(p_offset,0), 0); since timestamptz := (public.rx_settings()).dish_sales_reset_at;
begin
  perform public.rx_require();
  select * into p from public.rx_period(p_period, p_reference);
  return (with lines as (
      select case when p_mode = 'daily' then o.order_day end as sale_day, regexp_replace(l ->> 'name', '\s+—\s+[^—]+$', '') as dish_name, l ->> 'size_label' as size_label,
             (l ->> 'qty')::int as qty, (l ->> 'subtotal')::numeric as revenue, o.id
        from public.orders o cross join lateral jsonb_array_elements(o.items) l
       where o.status = 'Served' and o.order_day >= p.period_start and o.order_day < p.period_stop and o.in_dish_sales and (since is null or o.created_at > since)),
    grouped as (select sale_day, dish_name, size_label, sum(qty) quantity, count(distinct id) order_count, sum(revenue) revenue from lines group by 1,2,3),
    ranked as (select g.*, row_number() over (order by case when p_mode = 'daily' then sale_day end desc, case when p_sort = 'name' then dish_name end asc,
                 case when p_sort = 'revenue' then revenue end desc, quantity desc, dish_name) as position from grouped g)
    select jsonb_build_object('period', p.period, 'period_start', p.period_start, 'period_stop', p.period_stop, 'offset', off, 'total_rows', (select count(*) from ranked),
      'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.position) from (select * from ranked order by position offset off limit lim) r), '[]'::jsonb)));
end $$;
create or replace function public.restaurant_reset_dish_sales(p_confirmation text, p_request_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.rx_require(array['admin']);
  if p_confirmation <> 'RESET DISH SALES' then raise exception 'Type RESET DISH SALES exactly.' using errcode = '22023'; end if;
  select count(*) into n from public.orders where status = 'Served' and in_dish_sales;
  update public.orders set in_dish_sales = false where in_dish_sales;
  update public.restaurant_settings set dish_sales_reset_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'excluded_orders', n);
end $$;
create or replace function public.restaurant_reset_analytics(p_confirmation text, p_request_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.rx_require(array['admin']);
  if p_confirmation <> 'RESET ANALYTICS' then raise exception 'Type RESET ANALYTICS exactly.' using errcode = '22023'; end if;
  update public.orders set in_analytics = false where in_analytics;
  update public.restaurant_settings set analytics_reset_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.restaurant_sales_analytics_section63(p_period text default 'day', p_reference date default null, p_section text default 'summary') returns jsonb
language plpgsql security definer set search_path = public as $$
declare p record; out jsonb;
begin
  perform public.rx_require();
  select * into p from public.rx_period(p_period, p_reference);
  out := jsonb_build_object('period', p.period, 'period_start', p.period_start, 'period_stop', p.period_stop, 'server_now', now());
  create temp table if not exists rx_a (id uuid, status text, table_number text, total numeric, items_subtotal numeric, items jsonb, created_at timestamptz, order_day date, daily_number int, order_id text) on commit drop;
  delete from rx_a;
  insert into rx_a select id, status, table_number, total, items_subtotal, items, created_at, order_day, daily_number, order_id from public.orders where in_analytics and order_day >= p.period_start and order_day < p.period_stop;
  if p_section = 'summary' then
    out := out || jsonb_build_object('summary', (select jsonb_build_object('served_subtotal', coalesce(sum(items_subtotal) filter (where status = 'Served'), 0), 'served_orders', count(*) filter (where status = 'Served'),
      'placed_orders', count(*), 'completion_rate', case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status = 'Served') / count(*)) end,
      'average_bill', coalesce(round(avg(total) filter (where status = 'Served'), 2), 0), 'cancelled_orders', count(*) filter (where status in ('Cancelled','Rejected')),
      'cancelled_value', coalesce(sum(total) filter (where status in ('Cancelled','Rejected')), 0),
      'cancellation_rate', case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status in ('Cancelled','Rejected')) / count(*)) end) from rx_a));
  elsif p_section = 'trend' then
    out := out || jsonb_build_object('trend', coalesce((select jsonb_agg(jsonb_build_object('label', lbl, 'placed', placed, 'served_orders', served, 'item_sales', sales, 'bill_total', bill, 'future', fut) order by k) from (
      select k, case when p.period = 'day' then to_char(make_time(k, 0, 0), 'HH12 am') when p.period = 'month' then to_char(p.period_start + (k - 1), 'DD Mon') else to_char(make_date(extract(year from p.period_start)::int, k, 1), 'Mon') end lbl,
             count(a.id) placed, count(a.id) filter (where a.status = 'Served') served, coalesce(sum(a.items_subtotal) filter (where a.status = 'Served'), 0) sales, coalesce(sum(a.total) filter (where a.status = 'Served'), 0) bill,
             case when p.period = 'day' then p.period_start = public.rx_today() and k > extract(hour from now() at time zone 'Asia/Kolkata') when p.period = 'month' then p.period_start + (k - 1) > public.rx_today() else make_date(extract(year from p.period_start)::int, k, 1) > public.rx_today() end fut
        from generate_series(case when p.period = 'day' then 0 else 1 end, case when p.period = 'day' then 23 when p.period = 'month' then (p.period_stop - p.period_start) else 12 end) k
        left join rx_a a on (case when p.period = 'day' then extract(hour from a.created_at at time zone 'Asia/Kolkata') = k when p.period = 'month' then a.order_day = p.period_start + (k - 1) else extract(month from a.order_day) = k end)
       group by k) t), '[]'::jsonb));
  elsif p_section = 'statuses' then
    out := out || jsonb_build_object('statuses', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'label', status, 'order_count', c) order by c desc) from (select status, count(*) c from rx_a group by status) s), '[]'::jsonb));
  elsif p_section in ('hours','weekdays') then
    out := out || jsonb_build_object(p_section, coalesce((select jsonb_agg(jsonb_build_object('label', lbl, 'item_sales', sales, 'served_orders', n, 'order_count', n) order by k) from (
      select case when p_section = 'hours' then extract(hour from created_at at time zone 'Asia/Kolkata')::int else extract(isodow from order_day)::int end k,
             case when p_section = 'hours' then to_char(date_trunc('hour', created_at at time zone 'Asia/Kolkata'), 'HH12 am') else to_char(order_day, 'Dy') end lbl,
             sum(items_subtotal) sales, count(*) n from rx_a where status = 'Served' group by 1, 2) t), '[]'::jsonb));
  elsif p_section in ('dishes','categories','sizes') then
    out := out || jsonb_build_object(p_section, coalesce((select jsonb_agg(to_jsonb(t) - 'k' order by t.item_sales desc) from (
      select case p_section when 'dishes' then regexp_replace(l ->> 'name', '\s+—\s+[^—]+$', '') || '|' || coalesce(l ->> 'size','single') when 'categories' then coalesce(l ->> 'category', 'Menu') else coalesce(l ->> 'size','single') end k,
             min(regexp_replace(l ->> 'name', '\s+—\s+[^—]+$', '')) dish_name, min(coalesce(l ->> 'size','single')) size, min(l ->> 'size_label') size_label, min(coalesce(l ->> 'category','Menu')) category,
             sum((l ->> 'qty')::int) units, count(distinct a.id) order_count, sum((l ->> 'subtotal')::numeric) item_sales
        from rx_a a cross join lateral jsonb_array_elements(a.items) l where a.status = 'Served' group by 1 limit 200) t), '[]'::jsonb));
  elsif p_section = 'tables' then
    out := out || jsonb_build_object('tables', coalesce((select jsonb_agg(jsonb_build_object('table_number', table_number, 'order_count', n, 'item_sales', sales, 'bill_total', bill) order by sales desc) from (
      select table_number, count(*) n, sum(items_subtotal) sales, sum(total) bill from rx_a where status = 'Served' group by 1) t), '[]'::jsonb));
  elsif p_section = 'recent' then
    out := out || jsonb_build_object('recent', coalesce((select jsonb_agg(public.rx_order_json(o, true) order by o.created_at desc) from (select * from public.orders where id in (select id from rx_a) order by created_at desc limit 30) o), '[]'::jsonb));
  else raise exception 'Unknown report section.' using errcode = '22023'; end if;
  return out;
end $$;
create or replace function public.restaurant_sales_analytics(p_period text default 'day', p_reference date default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb := '{}'::jsonb; sec text;
begin
  perform public.rx_require();
  foreach sec in array array['summary','trend','statuses','hours','weekdays','dishes','categories','sizes','tables'] loop out := out || public.restaurant_sales_analytics_section63(p_period, p_reference, sec); end loop;
  return out || jsonb_build_object('basis', 'Served orders · item sales exclude tax · India time', 'analytics_reset_at', (public.rx_settings()).analytics_reset_at,
    'previous', jsonb_build_object('served_subtotal', 0), 'previous_start', null, 'previous_stop', null);
end $$;
-- =================== Expenses & stock history (billing screens) ===================
-- Admin or manager of THIS restaurant, from the existing staff_users table.
create or replace function public.workspace_role()
returns text language sql stable security definer set search_path = public as $$
  select s.role::text from public.staff_users s
  where s.user_id = auth.uid() and s.active and s.role::text in ('admin', 'manager')
  order by case s.role::text when 'admin' then 0 else 1 end limit 1
$$;

create or replace function public.workspace_docs_list(
  p_kind text, p_from date default null, p_to date default null, p_ref text default null,
  p_offset integer default 0, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.workspace_role(); v_total integer; v_rows jsonb;
begin
  if v_role is null then raise exception 'Admin or manager access required.' using errcode = '42501'; end if;
  if p_kind not in ('expense', 'expense_auto', 'expense_heads', 'stock_move') then raise exception 'Unknown record type.' using errcode = '22023'; end if;
  p_limit := least(greatest(coalesce(p_limit, 200), 1), 500);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  select count(*) into v_total from public.workspace_docs d
   where d.kind = p_kind and (p_from is null or d.doc_day >= p_from) and (p_to is null or d.doc_day <= p_to) and (p_ref is null or d.data ->> 'ref' = p_ref);
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'doc_day', x.doc_day, 'created_at', x.created_at, 'updated_at', x.updated_at, 'data', x.data) order by x.doc_day desc nulls last, x.created_at desc), '[]'::jsonb)
    into v_rows
    from (select d.* from public.workspace_docs d
           where d.kind = p_kind and (p_from is null or d.doc_day >= p_from) and (p_to is null or d.doc_day <= p_to) and (p_ref is null or d.data ->> 'ref' = p_ref)
           order by d.doc_day desc nulls last, d.created_at desc offset p_offset limit p_limit) x;
  return jsonb_build_object('role', v_role, 'total', v_total, 'rows', v_rows);
end $$;

-- Managers may add expenses and stock-history lines. Only the admin may edit or delete,
-- or change expense types and monthly auto expenses.
create or replace function public.workspace_doc_save(
  p_kind text, p_id uuid, p_data jsonb, p_day date default null, p_insert_only boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text := public.workspace_role(); v_row public.workspace_docs; v_exists boolean;
begin
  if v_role is null then raise exception 'Admin or manager access required.' using errcode = '42501'; end if;
  if p_kind not in ('expense', 'expense_auto', 'expense_heads', 'stock_move') then raise exception 'Unknown record type.' using errcode = '22023'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then raise exception 'Invalid record.' using errcode = '22023'; end if;
  select exists (select 1 from public.workspace_docs where id = p_id) into v_exists;
  if v_exists and exists (select 1 from public.workspace_docs where id = p_id and kind <> p_kind) then raise exception 'Record type mismatch.' using errcode = '22023'; end if;
  if v_role <> 'admin' and (p_kind not in ('expense', 'stock_move') or (v_exists and not p_insert_only)) then
    raise exception 'Only the admin can change this.' using errcode = '42501';
  end if;
  if p_insert_only then
    insert into public.workspace_docs (id, kind, doc_day, data, created_by) values (coalesce(p_id, gen_random_uuid()), p_kind, p_day, p_data, auth.uid())
    on conflict (id) do nothing returning * into v_row;
    if v_row.id is null then select * into v_row from public.workspace_docs where id = p_id; end if;
  else
    insert into public.workspace_docs (id, kind, doc_day, data, created_by) values (coalesce(p_id, gen_random_uuid()), p_kind, p_day, p_data, auth.uid())
    on conflict (id) do update set data = excluded.data, doc_day = excluded.doc_day, updated_at = now()
    returning * into v_row;
  end if;
  return jsonb_build_object('id', v_row.id, 'doc_day', v_row.doc_day, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'data', v_row.data);
end $$;

create or replace function public.workspace_doc_delete(p_kind text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text := public.workspace_role(); v_count integer;
begin
  if v_role is distinct from 'admin' then raise exception 'Only the admin can delete this.' using errcode = '42501'; end if;
  delete from public.workspace_docs where id = p_id and kind = p_kind;
  get diagnostics v_count = row_count;
  return jsonb_build_object('deleted', v_count);
end $$;

revoke all on function public.workspace_role() from public;
revoke all on function public.workspace_docs_list(text, date, date, text, integer, integer) from public;
revoke all on function public.workspace_doc_save(text, uuid, jsonb, date, boolean) from public;
revoke all on function public.workspace_doc_delete(text, uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.workspace_role() from anon';
    execute 'revoke all on function public.workspace_docs_list(text, date, date, text, integer, integer) from anon';
    execute 'revoke all on function public.workspace_doc_save(text, uuid, jsonb, date, boolean) from anon';
    execute 'revoke all on function public.workspace_doc_delete(text, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.workspace_role() from authenticated';
    execute 'grant execute on function public.workspace_docs_list(text, date, date, text, integer, integer) to authenticated';
    execute 'grant execute on function public.workspace_doc_save(text, uuid, jsonb, date, boolean) to authenticated';
    execute 'grant execute on function public.workspace_doc_delete(text, uuid) to authenticated';
  end if;
end $$;

-- ---------- Menu offers: Instagram follow / Google 5-star review discounts ----------
-- The owner sets the offers in Menu design (stored in restaurant_custom48 settings → m17.offers).
-- The discount is always worked out here from those settings, never taken from the phone.
alter table public.orders add column if not exists discount_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists offers jsonb not null default '[]'::jsonb;

create or replace function public.rx17_offer_amount(p_cfg jsonb, p_key text) returns numeric language sql immutable as $$
  select case when (p_cfg -> p_key ->> 'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
               and round((p_cfg -> p_key ->> 'amount')::numeric) between 1 and 10000
              then round((p_cfg -> p_key ->> 'amount')::numeric)
              else case p_key when 'insta' then 20 else 50 end end
$$;

create or replace function public.restaurant_place_order_v17(p_request_id uuid, p_token uuid, p_table text, p_name text, p_notes text, p_items jsonb,
  p_expected_total numeric, p_visit_id uuid, p_visit_token uuid, p_offers text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb; v_mode text; v_want text[]; v_key text; v_discount numeric := 0; v_labels text[] := '{}';
  v_row jsonb; v_id uuid; v_total numeric; v_device uuid; v_prev numeric; v_note text;
begin
  v_want := array(select distinct x from unnest(coalesce(p_offers, '{}'::text[])) x);
  if exists (select 1 from unnest(v_want) x where x not in ('insta', 'review')) then
    raise exception 'Unknown offer. Remove it and order again.' using errcode = '22023'; end if;

  -- The same submission retried: return the same order with the same discount.
  select o.discount_amount into v_prev from public.orders o where o.request_id = p_request_id;
  if found then
    v_row := public.restaurant_place_order_v13(p_request_id, p_token, p_table, p_name, p_notes, p_items, p_expected_total + coalesce(v_prev, 0), p_visit_id, p_visit_token);
    select o.total, o.discount_amount into v_total, v_prev from public.orders o where o.request_id = p_request_id;
    return v_row || jsonb_build_object('total', v_total, 'discount_amount', coalesce(v_prev, 0));
  end if;

  v_cfg := coalesce(public.restaurant_custom48(null, null, null) -> 'settings' -> 'm17' -> 'offers', '{}'::jsonb);
  v_mode := case when v_cfg ->> 'mode' = 'both' then 'both' else 'one' end;
  if v_mode = 'one' and coalesce(array_length(v_want, 1), 0) > 1 then
    raise exception 'Only one offer can be used per order. Remove one offer and order again.' using errcode = '22023'; end if;
  foreach v_key in array v_want loop
    if coalesce(v_cfg -> v_key ->> 'on', 'false') <> 'true'
       or (v_key = 'insta' and coalesce(trim(v_cfg -> 'insta' ->> 'handle'), '') = '')
       or (v_key = 'review' and coalesce(v_cfg -> 'review' ->> 'url', '') !~ '^https://') then
      raise exception 'This offer is no longer available. Remove the offer and order again.' using errcode = '22023'; end if;
    v_discount := v_discount + public.rx17_offer_amount(v_cfg, v_key);
    v_labels := v_labels || case v_key when 'insta' then 'Instagram follow' else 'Google review' end;
  end loop;
  if v_discount > 0 and p_expected_total < 0 then
    raise exception 'The order total is less than the offer. Add more items or remove the offer.' using errcode = '22023'; end if;

  v_row := public.restaurant_place_order_v13(p_request_id, p_token, p_table, p_name, p_notes, p_items, p_expected_total + v_discount, p_visit_id, p_visit_token);
  if v_discount <= 0 then return v_row; end if;

  v_id := (v_row ->> 'id')::uuid;
  select o.device_id, o.total into v_device, v_total from public.orders o where o.id = v_id;
  if v_device is not null and exists (
      select 1 from public.orders x where x.device_id = v_device and x.id <> v_id and coalesce(x.discount_amount, 0) > 0
        and x.created_at > now() - interval '12 hours' and x.status not in ('Cancelled', 'Rejected')) then
    raise exception 'Offer already used on this phone today. Remove the offer and order again.' using errcode = '22023'; end if;
  if v_discount > v_total then
    raise exception 'The order total is less than the offer. Add more items or remove the offer.' using errcode = '22023'; end if;

  v_note := 'Offer: ' || array_to_string(v_labels, ' + ') || ' −₹' || round(v_discount)::text || ' (check before serving)';
  update public.orders o set discount_amount = v_discount, offers = to_jsonb(v_want), total = o.total - v_discount,
         kitchen_notes = case when coalesce(o.kitchen_notes, '') = '' then v_note else o.kitchen_notes || E'\n' || v_note end
   where o.id = v_id returning o.total into v_total;
  return v_row || jsonb_build_object('total', v_total, 'discount_amount', v_discount, 'offers', to_jsonb(v_want),
    'kitchen_notes', (select o.kitchen_notes from public.orders o where o.id = v_id));
end $$;

-- Staff: take an offer back (customer did not follow / review). Restores the full price.
create or replace function public.restaurant_order_offer17(p_order uuid, p_action text default 'remove') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role text := public.workspace_role(); v_disc numeric; v_total numeric; v_status text;
begin
  if v_role is null then raise exception 'Admin or manager access required.' using errcode = '42501'; end if;
  if p_action = 'check' then return jsonb_build_object('ok', true, 'installed', true); end if;
  if p_action is distinct from 'remove' then raise exception 'Unknown action.' using errcode = '22023'; end if;
  select o.discount_amount, o.status into v_disc, v_status from public.orders o where o.id = p_order for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if coalesce(v_disc, 0) <= 0 then
    select o.total into v_total from public.orders o where o.id = p_order;
    return jsonb_build_object('ok', true, 'total', v_total, 'discount_amount', 0);
  end if;
  update public.orders o set total = o.total + o.discount_amount, discount_amount = 0, offers = '[]'::jsonb,
         kitchen_notes = regexp_replace(coalesce(o.kitchen_notes, ''), 'Offer: [^\n]*', 'Offer removed by staff — full price', 'g'), updated_at = now()
   where o.id = p_order returning o.total into v_total;
  if to_regprocedure('public.rx_bump(text[])') is not null then execute 'select public.rx_bump(variadic array[''active'',''history''])'; end if;
  return jsonb_build_object('ok', true, 'total', v_total, 'discount_amount', 0, 'status', v_status);
end $$;
-- =================== direct table access the website uses ===================
-- Staff read their own role row (sign-in check).
drop policy if exists staff_read_own on public.staff_users;
create policy staff_read_own on public.staff_users for select to authenticated using (user_id = auth.uid());
grant select on public.staff_users to authenticated;
-- Dish photo / detail edits and deletes from the staff screens.
drop policy if exists menu_staff_read on public.menu_items;
create policy menu_staff_read on public.menu_items for select to authenticated using (public.rx_role() in ('admin','manager'));
drop policy if exists menu_staff_update on public.menu_items;
create policy menu_staff_update on public.menu_items for update to authenticated using (public.rx_role() in ('admin','manager')) with check (public.rx_role() in ('admin','manager'));
drop policy if exists menu_admin_insert on public.menu_items;
create policy menu_admin_insert on public.menu_items for insert to authenticated with check (public.rx_role() = 'admin');
drop policy if exists menu_admin_delete on public.menu_items;
create policy menu_admin_delete on public.menu_items for delete to authenticated using (public.rx_role() = 'admin');
grant select, insert, update, delete on public.menu_items to authenticated;
-- Song queue (staff read).
drop policy if exists songs_staff_read on public.song_requests;
create policy songs_staff_read on public.song_requests for select to authenticated using (public.rx_role() in ('admin','manager'));
grant select on public.song_requests to authenticated;

-- =================== who may call what ===================
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'restaurant\_%' or p.proname like 'rx\_%' or p.proname like 'workspace\_%') loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on function %s from authenticated', f.sig); end if;
    if f.proname like 'restaurant\_%' or f.proname in ('workspace_docs_list','workspace_doc_save','workspace_doc_delete') then
      if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('grant execute on function %s to authenticated', f.sig); end if;
    end if;
    -- Customers (not signed in) only reach the menu, ordering, calls and waiter-phone functions. Each one checks its own token.
    if f.proname in ('restaurant_open_device_visit','restaurant_table_names','restaurant_menu_sync47','restaurant_place_order_v13','restaurant_place_order_v17','restaurant_receipt_sync47','restaurant_cancel_order',
        'restaurant_customer_call','restaurant_waiter_call_status','restaurant_customer_song_request','restaurant_waiter_public56','restaurant_custom48','restaurant_review_settings',
        'restaurant_footer_settings','restaurant_contact','restaurant_waiter_exchange','restaurant_waiter_sync47','restaurant_waiter_status','restaurant_waiter_signout',
        'restaurant_waiter_heartbeat66','restaurant_requests_page47','restaurant_waiter_on_way','restaurant_handle_waiter_call','restaurant_manual_menu_page63','restaurant_manual_order',
        'restaurant_order_loyalty','restaurant_push_device','restaurant_push_diagnostics') then
      if exists (select 1 from pg_roles where rolname = 'anon') then execute format('grant execute on function %s to anon', f.sig); end if;
    end if;
  end loop;
  -- Policies call this helper as the signed-in user.
  if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.rx_role() to authenticated; end if;
end $$;

-- Only the database owner can make the first admin.
create or replace function public.restaurant_make_admin(p_email text, p_name text default 'Admin') returns text language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No login with email %. Create it first in Authentication → Users → Add user (tick Auto Confirm User).', p_email; end if;
  insert into public.staff_users (user_id, role, name, email, active) values (uid, 'admin', p_name, lower(trim(p_email)), true)
  on conflict (user_id) do update set role = 'admin', active = true, name = excluded.name;
  return 'Admin access given to ' || p_email;
end $$;
create or replace function public.restaurant_make_manager(p_email text, p_name text default 'Manager') returns text language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No login with email %. Create it first in Authentication → Users → Add user (tick Auto Confirm User).', p_email; end if;
  insert into public.staff_users (user_id, role, name, email, active) values (uid, 'manager', p_name, lower(trim(p_email)), true)
  on conflict (user_id) do update set role = 'manager', active = true, name = excluded.name;
  return 'Manager access given to ' || p_email;
end $$;
revoke all on function public.restaurant_make_admin(text, text) from public;
revoke all on function public.restaurant_make_manager(text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on function public.restaurant_make_admin(text, text) from anon; revoke all on function public.restaurant_make_manager(text, text) from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on function public.restaurant_make_admin(text, text) from authenticated; revoke all on function public.restaurant_make_manager(text, text) from authenticated; end if;
end $$;

notify pgrst, 'reload schema';

-- =================== v19: invoice numbers, fast records & dashboard, discounts, limits, waiter mobile sign-in ===================
-- =====================================================================
-- Restaurant workspace v19 — one-time database update
-- Run once in Supabase → SQL Editor → New query → Run.
-- Safe to run again. It only ADDS things; existing orders, menu and
-- logins are kept.
--
-- Adds:
--   • Invoice numbers INV001, INV002 … that restart every year
--     (financial year April–March by default; changeable in Settings).
--   • Fast Records and Dashboard (one call instead of one per day).
--   • Counter bills with discount and short cash, checked by the server
--     against the Limits set in Admin / Settings.
--   • Waiter sign-in with a mobile number.
--   • Private settings for item extras and limits (not visible to customers).
-- =====================================================================

alter table public.orders add column if not exists invoice_no text;
alter table public.orders add column if not exists invoice_seq int;
alter table public.orders add column if not exists invoice_year text;
alter table public.orders add column if not exists discount_amount numeric(12,2) not null default 0;
create index if not exists orders_invoice_idx on public.orders (invoice_year, invoice_seq);

create table if not exists public.rx19_counters (year_key text primary key, last_number int not null default 0);
create table if not exists public.rx19_private (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table if not exists public.rx19_staff_phones (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text not null unique check (phone ~ '^[0-9]{10}$'),
  updated_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['rx19_counters','rx19_private','rx19_staff_phones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on public.%I from anon', t); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on public.%I from authenticated', t); end if;
  end loop;
end $$;

-- ---------- who is calling ----------
create or replace function public.rx19_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.staff_users where user_id = auth.uid()
  order by case role when 'admin' then 0 when 'manager' then 1 else 2 end limit 1
$$;
create or replace function public.rx19_need(p_roles text[]) returns text language plpgsql stable security definer set search_path = public as $$
declare r text := public.rx19_role();
begin
  if auth.uid() is null then raise exception 'Your sign-in ended. Sign in again.' using errcode = '42501'; end if;
  if r is null or not (r = any(p_roles)) then
    raise exception '%', case when p_roles = array['admin'] then 'Only the admin login can do this.' else 'Admin or manager access required.' end using errcode = '42501';
  end if;
  return r;
end $$;

-- ---------- invoice numbers ----------
create or replace function public.rx19_invoice_cfg() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('prefix', 'INV', 'digits', 3, 'start_month', 4)
         || coalesce((select data from public.rx19_private where key = 'invoice'), '{}'::jsonb)
$$;
create or replace function public.rx19_year_key(p_at timestamptz, p_cfg jsonb) returns text language plpgsql stable as $$
declare d date := (coalesce(p_at, now()) at time zone 'Asia/Kolkata')::date;
        m int := greatest(1, least(12, coalesce((p_cfg ->> 'start_month')::int, 4))); y int;
begin
  if m = 1 then return extract(year from d)::int::text; end if;
  y := case when extract(month from d)::int >= m then extract(year from d)::int else extract(year from d)::int - 1 end;
  return y::text || '-' || lpad(((y + 1) % 100)::text, 2, '0');
end $$;
create or replace function public.rx19_invoice_text(p_n int, p_cfg jsonb) returns text language sql immutable as $$
  select coalesce(p_cfg ->> 'prefix', 'INV')
         || case when length(p_n::text) >= greatest(1, least(8, coalesce((p_cfg ->> 'digits')::int, 3))) then p_n::text
                 else lpad(p_n::text, greatest(1, least(8, coalesce((p_cfg ->> 'digits')::int, 3))), '0') end
$$;
-- Every paid bill gets the next number of the year the moment it is paid.
create or replace function public.rx19_assign_invoice() returns trigger language plpgsql security definer set search_path = public as $$
declare cfg jsonb; k text; n int;
begin
  if new.invoice_no is not null or new.status not in ('Served', 'Paid') then return new; end if;
  cfg := public.rx19_invoice_cfg(); k := public.rx19_year_key(now(), cfg);
  insert into public.rx19_counters (year_key, last_number) values (k, 1)
    on conflict (year_key) do update set last_number = public.rx19_counters.last_number + 1
    returning last_number into n;
  new.invoice_year := k; new.invoice_seq := n; new.invoice_no := public.rx19_invoice_text(n, cfg);
  return new;
end $$;
drop trigger if exists rx19_invoice on public.orders;
create trigger rx19_invoice before insert or update of status on public.orders
  for each row execute function public.rx19_assign_invoice();

-- Number this year's paid bills once, oldest first, so the count starts correctly.
do $$ declare cfg jsonb := public.rx19_invoice_cfg(); k text := public.rx19_year_key(now(), public.rx19_invoice_cfg()); r record; n int := 0; begin
  if not exists (select 1 from public.rx19_counters where year_key = k) then
    for r in select id from public.orders
             where invoice_no is null and status in ('Served', 'Paid') and public.rx19_year_key(created_at, cfg) = k
             order by created_at, id loop
      n := n + 1;
      update public.orders set invoice_no = public.rx19_invoice_text(n, cfg), invoice_seq = n, invoice_year = k where id = r.id;
    end loop;
    insert into public.rx19_counters (year_key, last_number) values (k, n) on conflict (year_key) do nothing;
  end if;
end $$;

-- Read or change the invoice format. Anyone on staff can read; only admin can change.
create or replace function public.restaurant_invoice19(p_prefix text default null, p_digits int default null,
  p_start_month int default null, p_next int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin', 'manager']); cfg jsonb; k text; last int;
begin
  if p_prefix is not null or p_digits is not null or p_start_month is not null or p_next is not null then
    if r <> 'admin' then raise exception 'Only the admin login can change invoice numbers.' using errcode = '42501'; end if;
    if p_prefix is not null and p_prefix !~ '^[A-Za-z0-9/_-]{0,12}$' then raise exception 'Use up to 12 letters, numbers, / - or _ for the prefix.' using errcode = '22023'; end if;
    if p_digits is not null and (p_digits < 1 or p_digits > 8) then raise exception 'Choose 1 to 8 digits.' using errcode = '22023'; end if;
    if p_start_month is not null and (p_start_month < 1 or p_start_month > 12) then raise exception 'Choose a month from 1 to 12.' using errcode = '22023'; end if;
    insert into public.rx19_private (key, data, updated_by)
      values ('invoice', jsonb_strip_nulls(jsonb_build_object('prefix', p_prefix, 'digits', p_digits, 'start_month', p_start_month)), auth.uid())
      on conflict (key) do update set data = public.rx19_private.data || excluded.data, updated_at = now(), updated_by = auth.uid();
    if p_next is not null then
      if p_next < 1 or p_next > 99999999 then raise exception 'Enter a number from 1.' using errcode = '22023'; end if;
      cfg := public.rx19_invoice_cfg(); k := public.rx19_year_key(now(), cfg);
      select coalesce(max(invoice_seq), 0) into last from public.orders where invoice_year = k;
      if p_next <= last then raise exception 'The next number must be above % — the last invoice made this year.', last using errcode = '22023'; end if;
      insert into public.rx19_counters (year_key, last_number) values (k, p_next - 1)
        on conflict (year_key) do update set last_number = p_next - 1;
    end if;
  end if;
  cfg := public.rx19_invoice_cfg(); k := public.rx19_year_key(now(), cfg);
  last := coalesce((select last_number from public.rx19_counters where year_key = k), 0);
  return cfg || jsonb_build_object('year', k, 'next', last + 1, 'next_text', public.rx19_invoice_text(last + 1, cfg), 'can_edit', r = 'admin');
end $$;

-- ---------- fast Records: one call for any range up to a year ----------
create or replace function public.restaurant_bills19(p_from date, p_to date, p_status text default 'all', p_payment text default 'all',
  p_query text default '', p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin', 'manager']); q text := lower(trim(coalesce(p_query, ''))); res jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'Choose a valid range of up to one year.' using errcode = '22023'; end if;
  with base as (
    select o.*, case when o.status in ('Cancelled', 'Rejected') then 'Cancelled' else 'Paid' end as bill_status,
           case when o.payment_method = 'Online' then 'UPI' when o.payment_method is null then 'Not recorded' else o.payment_method end as bill_pay
    from public.orders o
    where o.order_day between p_from and p_to and o.status in ('Served', 'Paid', 'Cancelled', 'Rejected')
  ), hit as (
    select * from base
    where (coalesce(p_status, 'all') in ('', 'all') or bill_status = p_status)
      and (coalesce(p_payment, 'all') in ('', 'all') or bill_pay = p_payment)
      and (q = '' or lower(concat_ws(' ', order_id, invoice_no, customer_name, '#' || daily_number::text, table_number)) like '%' || q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'rows', coalesce((select jsonb_agg(to_jsonb(p) - 'token_hash' - 'bill_status' - 'bill_pay' order by p.created_at desc)
                      from (select * from hit order by created_at desc offset greatest(0, coalesce(p_offset, 0)) limit least(500, greatest(1, coalesce(p_limit, 50)))) p), '[]'::jsonb),
    'summary', (select jsonb_build_object(
      'sales', coalesce(sum(total) filter (where bill_status = 'Paid'), 0),
      'bills', count(*) filter (where bill_status = 'Paid'),
      'cancelled', count(*) filter (where bill_status = 'Cancelled'),
      'cash', coalesce(sum(total) filter (where bill_status = 'Paid' and bill_pay = 'Cash'), 0),
      'upi', coalesce(sum(total) filter (where bill_status = 'Paid' and bill_pay = 'UPI'), 0),
      'card', 0) from base)
  ) into res;
  return res;
end $$;

-- ---------- fast Dashboard: totals worked out in the database ----------
create or replace function public.restaurant_dashboard19(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin', 'manager']); span int; monthly boolean; res jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'Choose a valid range of up to one year.' using errcode = '22023'; end if;
  span := p_to - p_from + 1; monthly := span > 62;
  with base as (
    select o.*, o.status in ('Cancelled', 'Rejected') as is_cancelled,
           case when o.payment_method = 'Online' then 'UPI' when o.payment_method is null then 'Not recorded' else o.payment_method end as bill_pay
    from public.orders o where o.order_day between p_from and p_to and o.status in ('Served', 'Paid', 'Cancelled', 'Rejected')
  ), paid as (select * from base where not is_cancelled),
  lines as (
    select p.order_day, l.value as i,
           coalesce(nullif(l.value ->> 'qty', ''), nullif(l.value ->> 'quantity', ''), '0')::numeric as qty
    from paid p cross join lateral jsonb_array_elements(case when jsonb_typeof(p.items) = 'array' then p.items else '[]'::jsonb end) l
  ), priced as (
    select order_day, i, qty, coalesce(nullif(i ->> 'subtotal', '')::numeric, qty * coalesce(nullif(i ->> 'price', '')::numeric, 0)) as amount,
           coalesce(nullif(i ->> 'name', ''), 'Item') as name, i ->> 'id' as menu_id
    from lines
  ), prev as (
    select coalesce(sum(total), 0) as sales, count(*) as bills from public.orders
    where order_day between p_from - span and p_from - 1 and status in ('Served', 'Paid')
  )
  select jsonb_build_object(
    'metrics', (select jsonb_build_object(
        'sales', coalesce((select sum(total) from paid), 0),
        'bills', (select count(*) from paid),
        'cancelled', (select count(*) from base where is_cancelled),
        'cancelled_value', coalesce((select sum(total) from base where is_cancelled), 0),
        'avg_bill', coalesce((select avg(total) from paid), 0),
        'qty', coalesce((select sum(qty) from priced), 0),
        'discount', coalesce((select sum(discount_amount) from paid), 0),
        'tax', coalesce((select sum(tax_amount) from paid), 0),
        'prev_sales', prev.sales, 'prev_bills', prev.bills) from prev),
    'trend_unit', case when monthly then 'month' else 'day' end,
    'trend', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'sales', s, 'bills', n) order by k)
       from (select case when monthly then to_char(order_day, 'YYYY-MM') else order_day::text end as k, sum(total) as s, count(*) as n from paid group by 1) t), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', bill_pay, 'amount', a, 'bills', n) order by a desc)
       from (select bill_pay, sum(total) as a, count(*) as n from paid group by 1) t), '[]'::jsonb),
    'top_items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'unit', 'pcs', 'qty', q, 'revenue', a) order by a desc)
       from (select name, sum(qty) as q, sum(amount) as a from priced group by 1 order by 3 desc limit 10) t), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('category', c, 'qty', q, 'revenue', a) order by a desc)
       from (select coalesce(m.category, 'Other') as c, sum(x.qty) as q, sum(x.amount) as a
             from priced x left join public.menu_items m on m.id = x.menu_id group by 1) t), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- ---------- private settings (limits, item extras) — never sent to customers ----------
create or replace function public.restaurant_private19(p_key text, p_data jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin', 'manager']);
begin
  if p_key not in ('limits', 'items') then raise exception 'Unknown setting.' using errcode = '22023'; end if;
  if p_data is not null then
    if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 400000 then raise exception 'These settings are too large.' using errcode = '22023'; end if;
    insert into public.rx19_private (key, data, updated_by) values (p_key, p_data, auth.uid())
      on conflict (key) do update set data = excluded.data, updated_at = now(), updated_by = auth.uid();
  end if;
  return coalesce((select data from public.rx19_private where key = p_key), '{}'::jsonb);
end $$;

-- ---------- counter bill with discount and short cash ----------
create or replace function public.restaurant_counter_bill19(p_request_id uuid, p_name text default '', p_notes text default '',
  p_items jsonb default '[]'::jsonb, p_expected_total numeric default null, p_payment_method text default 'Cash',
  p_discount_mode text default null, p_discount_value numeric default 0, p_cash_received numeric default null,
  p_expected_final numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin', 'manager']); o jsonb; ord public.orders; rj jsonb; lim jsonb;
        sub numeric; disc numeric := 0; taxable numeric; tax numeric; fin numeric; short numeric := 0; maxshort numeric; maxpct numeric;
        v numeric := greatest(0, coalesce(p_discount_value, 0));
begin
  o := public.restaurant_manual_order(p_request_id => p_request_id, p_table => 'Counter', p_name => coalesce(p_name, ''),
         p_notes => coalesce(p_notes, ''), p_items => p_items, p_expected_total => p_expected_total, p_payment_method => p_payment_method);
  select * into ord from public.orders where (o ? 'order_id' and order_id = o ->> 'order_id') or id::text = o ->> 'id' limit 1;
  if ord.id is null then return o; end if;
  rj := to_jsonb(ord); lim := coalesce((select data from public.rx19_private where key = 'limits'), '{}'::jsonb);
  sub := ord.items_subtotal;
  if v > 0 then
    disc := case when p_discount_mode = 'amount' then least(round(v, 2), sub) else round(sub * least(v, 100) / 100, 2) end;
    if r <> 'admin' then
      maxpct := coalesce(nullif(lim ->> 'max_discount_pct', '')::numeric, 100);
      if sub > 0 and disc > round(sub * maxpct / 100, 2) then raise exception 'This discount is above your limit of %.', maxpct::text || '%' using errcode = '22023'; end if;
    end if;
  end if;
  taxable := sub - disc;
  if coalesce((rj ->> 'tax_enabled')::boolean, coalesce(ord.tax_amount, 0) > 0) then
    if rj ? 'tax_value' and coalesce(rj ->> 'tax_mode', 'percent') = 'percent' then tax := round(taxable * (rj ->> 'tax_value')::numeric / 100, 2);
    elsif rj ? 'tax_value' then tax := case when taxable > 0 then (rj ->> 'tax_value')::numeric else 0 end;
    else tax := case when sub > 0 then round(coalesce(ord.tax_amount, 0) * taxable / sub, 2) else 0 end; end if;
  else tax := 0; end if;
  fin := taxable + tax;
  if p_payment_method = 'Cash' and coalesce(p_cash_received, 0) > 0 and p_cash_received < fin then
    short := fin - p_cash_received;
    maxshort := case when r = 'admin' then fin else coalesce(nullif(lim ->> 'max_short_amount', '')::numeric, 0) end;
    if short > maxshort then raise exception 'Cash is short by %. You can accept at most % less.', short, maxshort using errcode = '22023'; end if;
    fin := p_cash_received;
  end if;
  if p_expected_final is not null and abs(p_expected_final - fin) > 0.01 then
    raise exception 'The bill total is now %. Check the bill and save again.', fin using errcode = '22023';
  end if;
  if disc > 0 or short > 0 or coalesce(ord.discount_amount, 0) <> 0 then
    update public.orders set discount_amount = disc + short, tax_amount = tax, total = fin where id = ord.id returning * into ord;
  end if;
  return o || jsonb_build_object('id', ord.id, 'discount_amount', ord.discount_amount, 'tax_amount', ord.tax_amount, 'total', ord.total,
                                 'invoice_no', ord.invoice_no, 'items_subtotal', ord.items_subtotal, 'short_amount', short);
end $$;

-- ---------- waiter sign-in with a mobile number ----------
create or replace function public.rx19_phone(p text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10 then right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10) else null end
$$;
create or replace function public.restaurant_staff_phone19(p_user uuid default null, p_phone text default null, p_clear boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin', 'manager']); ph text;
begin
  if p_user is not null then
    if r <> 'admin' and p_user <> auth.uid() and exists (select 1 from public.staff_users where user_id = p_user and role in ('admin', 'manager')) then
      raise exception 'Managers can set numbers for waiters only.' using errcode = '42501';
    end if;
    if p_clear then delete from public.rx19_staff_phones where user_id = p_user;
    else
      ph := public.rx19_phone(p_phone);
      if ph is null then raise exception 'Enter a 10-digit mobile number.' using errcode = '22023'; end if;
      if exists (select 1 from public.rx19_staff_phones where phone = ph and user_id <> p_user) then raise exception 'This number is already used by another login.' using errcode = '23505'; end if;
      insert into public.rx19_staff_phones (user_id, phone) values (p_user, ph)
        on conflict (user_id) do update set phone = excluded.phone, updated_at = now();
    end if;
  end if;
  return coalesce((select jsonb_object_agg(user_id::text, phone) from public.rx19_staff_phones), '{}'::jsonb);
end $$;
-- The sign-in screen turns a mobile number into the login email. Nothing else is shown.
create or replace function public.restaurant_login_email19(p_phone text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare ph text := public.rx19_phone(p_phone); e text;
begin
  if ph is null then return null; end if;
  perform pg_sleep(0.25);
  select u.email into e from public.rx19_staff_phones p join auth.users u on u.id = p.user_id where p.phone = ph;
  return e;
end $$;

-- ---------- who may call what ----------
do $$ declare f text; begin
  foreach f in array array['rx19_role()', 'rx19_need(text[])', 'rx19_invoice_cfg()', 'rx19_year_key(timestamptz,jsonb)', 'rx19_invoice_text(int,jsonb)',
    'rx19_assign_invoice()', 'rx19_phone(text)', 'restaurant_invoice19(text,int,int,int)', 'restaurant_bills19(date,date,text,text,text,int,int)',
    'restaurant_dashboard19(date,date)', 'restaurant_private19(text,jsonb)',
    'restaurant_counter_bill19(uuid,text,text,jsonb,numeric,text,text,numeric,numeric,numeric)', 'restaurant_staff_phone19(uuid,text,boolean)',
    'restaurant_login_email19(text)'] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function public.%s from anon', f); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.restaurant_invoice19(text,int,int,int), public.restaurant_bills19(date,date,text,text,text,int,int),
      public.restaurant_dashboard19(date,date), public.restaurant_private19(text,jsonb),
      public.restaurant_counter_bill19(uuid,text,text,jsonb,numeric,text,text,numeric,numeric,numeric),
      public.restaurant_staff_phone19(uuid,text,boolean), public.restaurant_login_email19(text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.restaurant_login_email19(text) to anon;
  end if;
end $$;



notify pgrst, 'reload schema';

-- =====================================================================
--  FIRST ADMIN (do this once, after the script above has run)
--  1. Supabase → Authentication → Users → Add user → Create new user.
--     Enter your email + a strong password and tick "Auto Confirm User".
--  2. Back in SQL Editor, run (with your email):
--        select public.restaurant_make_admin('you@example.com', 'Your name');
--  3. Optional manager login: create the user the same way, then
--        select public.restaurant_make_manager('manager@example.com', 'Manager name');
--  Waiter logins are added later inside the app: Settings → Staff & logins.
-- =====================================================================
