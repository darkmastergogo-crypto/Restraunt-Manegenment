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
