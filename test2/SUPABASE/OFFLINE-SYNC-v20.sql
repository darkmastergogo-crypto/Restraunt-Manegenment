-- =====================================================================
-- Restaurant workspace v20 — offline-first synchronisation
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run again.
-- Requires UPDATE-v19.sql to have been run first.
-- On the existing restaurant schema, run OFFLINE-SYNC-v20-LEGACY-FIX.sql next.
--
-- Adds, and nothing else:
--   • a register of the devices that bill offline
--   • an operation ledger, so a bill that is sent twice is still one bill
--   • a change log, so a device can download only what changed
--   • a stock movement ledger, so two devices selling offline both count
--   • invoice number blocks, so offline bills get real, unique numbers
--   • a review list for anything the server could not settle on its own
-- No existing table, order, dish or login is changed or deleted.
-- =====================================================================

-- ---------- devices ----------
create table if not exists public.rx20_devices (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  label text not null default '',
  platform text not null default '',
  app_version text not null default '',
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  revoked boolean not null default false
);

-- ---------- one operation = one effect, however many times it is sent ----------
create table if not exists public.rx20_sync_ops (
  op_id uuid primary key,
  device_id uuid,
  kind text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rx20_sync_ops_device_idx on public.rx20_sync_ops (device_id, created_at desc);

-- ---------- what changed on the server, in order ----------
create table if not exists public.rx20_changes (
  seq bigserial primary key,
  kind text not null,
  row_id text not null,
  data jsonb,
  deleted boolean not null default false,
  origin_device uuid,
  at timestamptz not null default now()
);
create index if not exists rx20_changes_at_idx on public.rx20_changes (at);

-- ---------- every movement of stock, never an overwrite ----------
create table if not exists public.rx20_stock_moves (
  id uuid primary key,
  menu_id text not null,
  variant text not null default 'single',
  change int not null,
  reason text not null default 'sale',
  ref text not null default '',
  device_id uuid,
  op_id uuid,
  shortfall int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists rx20_stock_moves_item_idx on public.rx20_stock_moves (menu_id, variant, created_at desc);

-- ---------- invoice numbers handed out to a device in advance ----------
create table if not exists public.rx20_invoice_blocks (
  id bigserial primary key,
  device_id uuid not null,
  year_key text not null,
  start_no int not null,
  end_no int not null,
  allocated_at timestamptz not null default now(),
  unique (year_key, start_no)
);

-- ---------- anything a person should look at ----------
create table if not exists public.rx20_flags (
  id bigserial primary key,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  device_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists rx20_flags_open_idx on public.rx20_flags (resolved_at, created_at desc);

do $$ declare t text; begin
  foreach t in array array['rx20_devices','rx20_sync_ops','rx20_changes','rx20_stock_moves','rx20_invoice_blocks','rx20_flags'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on public.%I from anon', t); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on public.%I from authenticated', t); end if;
  end loop;
end $$;

-- ---------- the change log: filled by triggers, read by devices ----------
create or replace function public.rx20_log_change() returns trigger language plpgsql security definer set search_path = public as $$
declare k text := tg_argv[0]; rid text; body jsonb; gone boolean := tg_op = 'DELETE';
begin
  -- The row is turned into JSON first: one code path for every table, and no field
  -- of a different table is ever named, which PL/pgSQL would refuse to compile.
  body := to_jsonb(case when gone then old else new end);
  rid := case k
    when 'category' then body ->> 'name'
    when 'stock' then (body ->> 'menu_id') || '|' || coalesce(body ->> 'variant', 'single')
    else body ->> 'id' end;
  if k = 'order' then body := body - 'token_hash'; end if;
  if rid is null then return null; end if;
  -- One row per change. Devices read them in order and keep their place.
  insert into public.rx20_changes (kind, row_id, data, deleted)
    values (k, rid, case when gone then null else body end, gone);
  return null;
end $$;

do $$ begin
  drop trigger if exists rx20_c_item on public.menu_items;
  create trigger rx20_c_item after insert or update or delete on public.menu_items
    for each row execute function public.rx20_log_change('item');
  if to_regclass('public.categories') is not null and to_regclass('public.menu_stock') is not null then
    drop trigger if exists rx20_c_cat on public.categories;
    create trigger rx20_c_cat after insert or update or delete on public.categories
      for each row execute function public.rx20_log_change('category');
    drop trigger if exists rx20_c_stock on public.menu_stock;
    create trigger rx20_c_stock after insert or update or delete on public.menu_stock
      for each row execute function public.rx20_log_change('stock');
  end if;
  drop trigger if exists rx20_c_order on public.orders;
  create trigger rx20_c_order after insert or update or delete on public.orders
    for each row execute function public.rx20_log_change('order');
end $$;

-- Keep the log small: 30 days is far more than a device needs between syncs.
create or replace function public.rx20_prune_changes() returns int language sql security definer set search_path = public as $$
  with gone as (delete from public.rx20_changes where at < now() - interval '30 days' returning 1)
  select count(*)::int from gone
$$;

-- ---------- devices ----------
create or replace function public.restaurant_device_register20(p_device uuid, p_label text default '', p_platform text default '', p_version text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin','manager']); d public.rx20_devices;
begin
  if p_device is null then raise exception 'A device id is required.' using errcode = '22023'; end if;
  insert into public.rx20_devices (id, user_id, label, platform, app_version)
    values (p_device, auth.uid(), left(coalesce(p_label,''),60), left(coalesce(p_platform,''),40), left(coalesce(p_version,''),20))
    on conflict (id) do update set last_seen = now(), user_id = auth.uid(),
      label = coalesce(nullif(excluded.label,''), public.rx20_devices.label),
      platform = coalesce(nullif(excluded.platform,''), public.rx20_devices.platform),
      app_version = coalesce(nullif(excluded.app_version,''), public.rx20_devices.app_version)
    returning * into d;
  if d.revoked then raise exception 'This device was turned off by the administrator.' using errcode = '42501'; end if;
  return jsonb_build_object('device', to_jsonb(d), 'server_time', now(),
    'cursor_floor', coalesce((select min(seq) from public.rx20_changes), 0),
    'cursor_now', coalesce((select max(seq) from public.rx20_changes), 0), 'role', r);
end $$;

-- ---------- invoice numbers for offline bills ----------
-- A device is handed a block of numbers up front. The year counter jumps past the block,
-- so an online bill can never take a number that an offline device already holds.
create or replace function public.restaurant_invoice_block20(p_device uuid, p_size int default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin','manager']); cfg jsonb; k text; n int; sz int := greatest(10, least(1000, coalesce(p_size,100)));
begin
  if p_device is null or not exists (select 1 from public.rx20_devices d where d.id = p_device and not d.revoked) then
    raise exception 'Register this device before asking for invoice numbers.' using errcode = '42501'; end if;
  cfg := public.rx19_invoice_cfg(); k := public.rx19_year_key(now(), cfg);
  insert into public.rx19_counters (year_key, last_number) values (k, sz)
    on conflict (year_key) do update set last_number = public.rx19_counters.last_number + sz
    returning last_number into n;
  insert into public.rx20_invoice_blocks (device_id, year_key, start_no, end_no) values (p_device, k, n - sz + 1, n);
  return jsonb_build_object('year', k, 'start', n - sz + 1, 'end', n, 'prefix', cfg ->> 'prefix',
    'digits', coalesce((cfg ->> 'digits')::int, 3), 'size', sz);
end $$;

-- ---------- applying one offline bill ----------
-- The price the customer paid is kept exactly as it was on the device. The server re-adds the
-- line totals and refuses a bill whose own arithmetic does not agree, so a bad payload cannot
-- invent a total. A price that no longer matches the menu is accepted and flagged for review.
create or replace function public.rx20_apply_bill(p_op uuid, p_device uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; lines jsonb := coalesce(p_payload -> 'items', '[]'::jsonb); l jsonb;
        subtotal numeric := 0; disc numeric := round(coalesce((p_payload ->> 'discount_amount')::numeric, 0), 2);
        tax numeric := round(coalesce((p_payload ->> 'tax_amount')::numeric, 0), 2);
        total numeric := round(coalesce((p_payload ->> 'total')::numeric, 0), 2);
        want numeric; d date; n int; inv text; qty numeric; price numeric; cur numeric; mid text; v_var text;
        short int; moved int := 0; cfg jsonb; ykey text; iseq int; pre text;
begin
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'This bill has no items.' using errcode = '22023'; end if;
  if jsonb_array_length(lines) > 200 then raise exception 'This bill has too many lines.' using errcode = '22023'; end if;
  for l in select * from jsonb_array_elements(lines) loop
    qty := coalesce((l ->> 'qty')::numeric, 0); price := coalesce((l ->> 'price')::numeric, -1);
    if qty <= 0 or qty > 1000 or price < 0 or price > 1000000 then
      raise exception 'A line on this bill has an impossible quantity or price.' using errcode = '22023'; end if;
    subtotal := subtotal + round(qty * price, 2);
  end loop;
  subtotal := round(subtotal, 2);
  want := round(subtotal - disc + tax, 2);
  if disc < 0 or tax < 0 or disc > subtotal then raise exception 'The discount on this bill is not valid.' using errcode = '22023'; end if;
  if abs(want - total) > 0.05 then
    raise exception 'This bill does not add up (lines %, total %).', want, total using errcode = '22023'; end if;

  d := coalesce((p_payload ->> 'bill_day')::date, public.rx_today());
  n := public.rx_next_number(d);
  inv := nullif(p_payload ->> 'invoice_no', '');

  -- A number taken from this device's block is still part of the year's run, so record where it
  -- sits. Without this the "next invoice number" shown in Settings would not count offline bills.
  if inv is not null then
    cfg := public.rx19_invoice_cfg();
    ykey := public.rx19_year_key(coalesce((p_payload ->> 'created_at')::timestamptz, now()), cfg);
    pre := coalesce(cfg ->> 'prefix', 'INV');
    if left(inv, length(pre)) = pre and substr(inv, length(pre) + 1) ~ '^[0-9]+$' then
      iseq := substr(inv, length(pre) + 1)::int;      -- an ordinary number from the block
    else
      ykey := null;                                    -- a stand-in number sits outside the run
    end if;
  end if;

  -- The operation id is also the request id, so the same bill arriving twice stays one order.
  insert into public.orders (order_id, daily_number, order_day, request_id, table_number, customer_name, kitchen_notes,
      items, items_subtotal, tax_enabled, tax_mode, tax_value, tax_amount, discount_amount, total, status, payment_method,
      order_source, created_by, served_at, created_at, invoice_no, invoice_year, invoice_seq)
    values ('MAN-' || to_char(d,'YYYYMMDD') || '-' || lpad(n::text,4,'0'), n, d, p_op, 'Counter',
      left(coalesce(nullif(trim(p_payload ->> 'customer_name'),''), 'Counter'), 80), left(coalesce(p_payload ->> 'notes',''), 1000),
      lines, subtotal, tax > 0, 'percent', 0, tax, disc, total, 'Served',
      case when (p_payload ->> 'payment_method') = 'Cash' then 'Cash' else 'Online' end,
      'manual', auth.uid(), coalesce((p_payload ->> 'created_at')::timestamptz, now()),
      coalesce((p_payload ->> 'created_at')::timestamptz, now()), inv, ykey, iseq)
    on conflict (request_id) do nothing
    returning * into o;
  if o.id is null then select * into o from public.orders where request_id = p_op; return public.rx_order_json(o, true); end if;

  -- Stock comes off through the ledger, so two devices selling the same dish offline both count.
  for l in select * from jsonb_array_elements(lines) loop
    mid := l ->> 'id'; v_var := coalesce(nullif(l ->> 'size',''), 'single');
    if mid is null or (l ->> 'custom') = 'true' then continue; end if;
    select ms.remaining into cur from public.menu_stock ms where ms.menu_id = mid and ms.variant = v_var and ms.tracked for update;
    if not found then
      -- The dish is counted under a different portion name than the bill used: never fail the
      -- bill over it, but do not let stock drift away silently either.
      if exists (select 1 from public.menu_stock ms2 where ms2.menu_id = mid and ms2.tracked) then
        insert into public.rx20_flags (kind, detail, device_id) values ('stock_variant',
          jsonb_build_object('menu_id', mid, 'billed_portion', v_var, 'order', o.order_id,
            'note', 'This dish is counted by portion, but the bill did not say which. Stock was not changed.'), p_device);
      end if;
      continue;
    end if;
    qty := coalesce((l ->> 'qty')::numeric, 0);
    short := greatest(0, ceil(qty)::int - cur);
    update public.menu_stock ms set remaining = greatest(0, cur - ceil(qty)::int), revision = ms.revision + 1
      where ms.menu_id = mid and ms.variant = v_var;
    insert into public.rx20_stock_moves (id, menu_id, variant, change, reason, ref, device_id, op_id, shortfall)
      values (public.rx20_move_id(p_op, mid, v_var), mid, v_var, -ceil(qty)::int, 'sale', o.order_id, p_device, p_op, short)
      on conflict (id) do nothing;
    moved := moved + 1;
    if short > 0 then
      insert into public.rx20_flags (kind, detail, device_id) values ('stock_short',
        jsonb_build_object('menu_id', mid, 'variant', v_var, 'short_by', short, 'order', o.order_id,
          'note', 'Two devices sold this while offline. Stock is at zero and short by the amount shown.'), p_device);
    end if;
  end loop;

  -- A price that no longer matches the menu is kept as billed, and listed for review.
  for l in select * from jsonb_array_elements(lines) loop
    mid := l ->> 'id';
    if mid is null or (l ->> 'custom') = 'true' then continue; end if;
    select mi.price into cur from public.menu_items mi where mi.id = mid;
    if cur is not null and abs(cur - coalesce((l ->> 'price')::numeric, cur)) > 0.005 then
      insert into public.rx20_flags (kind, detail, device_id) values ('price_changed',
        jsonb_build_object('menu_id', mid, 'billed', (l ->> 'price')::numeric, 'menu_now', cur, 'order', o.order_id), p_device);
    end if;
  end loop;

  perform public.rx_bump('active', 'history');
  return public.rx_order_json(o, true) || jsonb_build_object('stock_moves', moved);
end $$;

-- A stock movement gets the same id every time the same operation is replayed.
create or replace function public.rx20_move_id(p_op uuid, p_menu text, p_variant text) returns uuid
language sql immutable as $$
  select (substr(h,1,8) || '-' || substr(h,9,4) || '-5' || substr(h,14,3) || '-' ||
          to_hex((('x' || substr(h,17,1))::bit(4)::int & 3) | 8) || substr(h,18,3) || '-' || substr(h,21,12))::uuid
  from (select md5(p_op::text || '|' || p_menu || '|' || coalesce(p_variant,'single')) as h) s
$$;

-- ---------- push: the device sends what it saved while offline ----------
create or replace function public.restaurant_sync_push20(p_device uuid, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin','manager']); op jsonb; out jsonb := '[]'::jsonb;
        id uuid; kind text; payload jsonb; done public.rx20_sync_ops; res jsonb; n int := 0;
begin
  if p_device is null or not exists (select 1 from public.rx20_devices d where d.id = p_device and not d.revoked) then
    raise exception 'This device is not registered, or was turned off.' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' then raise exception 'Nothing to send.' using errcode = '22023'; end if;
  if jsonb_array_length(p_ops) > 100 then raise exception 'Send at most 100 operations at a time.' using errcode = '22023'; end if;
  update public.rx20_devices d set last_seen = now() where d.id = p_device;

  for op in select * from jsonb_array_elements(p_ops) loop
    n := n + 1;
    id := nullif(op ->> 'op_id','')::uuid; kind := op ->> 'kind'; payload := coalesce(op -> 'payload', '{}'::jsonb);
    if id is null then out := out || jsonb_build_array(jsonb_build_object('ok', false, 'permanent', true, 'error', 'Missing operation id.')); continue; end if;
    select * into done from public.rx20_sync_ops where op_id = id;
    if done.op_id is not null then           -- already applied: hand back the same answer
      out := out || jsonb_build_array(jsonb_build_object('op_id', id, 'ok', true, 'repeat', true, 'result', done.result));
      continue;
    end if;
    begin
      res := case kind
        when 'bill.create' then public.rx20_apply_bill(id, p_device, payload)
        when 'stock.move'  then public.rx20_apply_stock(id, p_device, payload)
        when 'item.save'   then public.rx20_apply_item(id, p_device, payload)
        when 'category.save' then public.rx20_apply_category(id, p_device, payload)
        else null end;
      if res is null then
        out := out || jsonb_build_array(jsonb_build_object('op_id', id, 'ok', false, 'permanent', true, 'error', 'Unknown operation: ' || coalesce(kind,'(none)')));
        continue;
      end if;
      insert into public.rx20_sync_ops (op_id, device_id, kind, result) values (id, p_device, kind, res)
        on conflict (op_id) do nothing;
      out := out || jsonb_build_array(jsonb_build_object('op_id', id, 'ok', true, 'result', res));
    exception
      when serialization_failure or deadlock_detected then
        out := out || jsonb_build_array(jsonb_build_object('op_id', id, 'ok', false, 'permanent', false, 'error', 'The server was busy. This will be tried again.'));
      when others then
        -- A rule the data breaks will never pass, however many times it is sent: stop retrying it.
        out := out || jsonb_build_array(jsonb_build_object('op_id', id, 'ok', false,
          'permanent', sqlstate in ('22023','23505','23502','23514','22P02','42501'), 'error', sqlerrm, 'code', sqlstate));
    end;
  end loop;
  return jsonb_build_object('results', out, 'count', n, 'cursor_now', coalesce((select max(seq) from public.rx20_changes), 0));
end $$;

create or replace function public.rx20_apply_stock(p_op uuid, p_device uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare mid text := p_payload ->> 'menu_id'; v text := coalesce(nullif(p_payload ->> 'variant',''),'single');
        ch int := coalesce((p_payload ->> 'change')::int, 0); cur int; nxt int;
begin
  if mid is null then raise exception 'Which dish?' using errcode = '22023'; end if;
  if ch = 0 or abs(ch) > 1000000 then raise exception 'That stock change is not valid.' using errcode = '22023'; end if;
  if not exists (select 1 from public.menu_items mi where mi.id = mid) then
    raise exception 'That dish is no longer on the menu.' using errcode = '22023'; end if;
  select ms.remaining into cur from public.menu_stock ms where ms.menu_id = mid and ms.variant = v for update;
  if not found then
    insert into public.menu_stock (menu_id, variant, tracked, remaining) values (mid, v, true, greatest(0, ch));
    cur := 0; nxt := greatest(0, ch);
  else
    nxt := greatest(0, cur + ch);
    update public.menu_stock ms set remaining = nxt, tracked = true, revision = ms.revision + 1 where ms.menu_id = mid and ms.variant = v;
  end if;
  insert into public.rx20_stock_moves (id, menu_id, variant, change, reason, ref, device_id, op_id)
    values (public.rx20_move_id(p_op, mid, v), mid, v, ch, coalesce(p_payload ->> 'reason','adjust'), coalesce(p_payload ->> 'ref',''), p_device, p_op)
    on conflict (id) do nothing;
  return jsonb_build_object('menu_id', mid, 'variant', v, 'remaining', nxt);
end $$;

create or replace function public.rx20_apply_item(p_op uuid, p_device uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare mid text := nullif(p_payload ->> 'id',''); nm text := left(coalesce(p_payload ->> 'name',''), 120); existing public.menu_items;
begin
  if length(trim(nm)) = 0 then raise exception 'The dish needs a name.' using errcode = '22023'; end if;
  if mid is null then raise exception 'The dish needs an id.' using errcode = '22023'; end if;
  select * into existing from public.menu_items where id = mid;
  if existing.id is null then
    insert into public.menu_items (id, name, category, price, description, image, veg, available)
      values (mid, nm, coalesce(nullif(p_payload ->> 'category',''),'General'), coalesce((p_payload ->> 'price')::numeric, 0),
        coalesce(p_payload ->> 'description',''), '', coalesce((p_payload ->> 'veg')::boolean, true), coalesce((p_payload ->> 'available')::boolean, true))
      on conflict (id) do nothing;
  else
    -- An edit made offline is only applied where the server copy has not moved on since.
    if existing.updated_at > coalesce((p_payload ->> 'based_on')::timestamptz, 'epoch'::timestamptz) then
      insert into public.rx20_flags (kind, detail, device_id) values ('item_conflict',
        jsonb_build_object('menu_id', mid, 'offline_change', p_payload, 'server_name', existing.name, 'server_price', existing.price,
          'note', 'This dish was changed on the server too. The server copy was kept.'), p_device);
      return jsonb_build_object('id', mid, 'applied', false, 'conflict', true);
    end if;
    update public.menu_items set name = nm, category = coalesce(nullif(p_payload ->> 'category',''), category),
      price = coalesce((p_payload ->> 'price')::numeric, price), description = coalesce(p_payload ->> 'description', description),
      available = coalesce((p_payload ->> 'available')::boolean, available), updated_at = now() where id = mid;
  end if;
  return jsonb_build_object('id', mid, 'applied', true);
end $$;

create or replace function public.rx20_apply_category(p_op uuid, p_device uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nm text := left(trim(coalesce(p_payload ->> 'name','')), 60);
begin
  if length(nm) = 0 then raise exception 'The category needs a name.' using errcode = '22023'; end if;
  insert into public.categories (name, sort_order) values (nm, coalesce((p_payload ->> 'sort_order')::int, 0))
    on conflict (name) do nothing;
  return jsonb_build_object('name', nm);
end $$;

-- ---------- pull: the device asks what changed since last time ----------
create or replace function public.restaurant_sync_pull20(p_device uuid, p_cursor bigint default 0, p_limit int default 500)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin','manager']); lim int := greatest(1, least(1000, coalesce(p_limit, 500)));
        floor_seq bigint; rows jsonb; last_seq bigint; top bigint; cur bigint := greatest(0, coalesce(p_cursor, 0));
begin
  select coalesce(min(seq), 0), coalesce(max(seq), 0) into floor_seq, top from public.rx20_changes;
  -- Away for longer than the log is kept: the device must take a fresh copy instead.
  if cur > 0 and floor_seq > 0 and cur < floor_seq - 1 then
    return jsonb_build_object('reset', true, 'cursor', top, 'changes', '[]'::jsonb, 'more', false);
  end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.seq), '[]'::jsonb), max(c.seq) into rows, last_seq
    from (select seq, kind, row_id, data, deleted, at from public.rx20_changes
          where seq > cur order by seq limit lim) c;
  return jsonb_build_object('reset', false, 'changes', rows,
    'cursor', coalesce(last_seq, cur), 'top', top,
    'more', coalesce(last_seq, cur) < top, 'server_time', now());
end $$;

-- ---------- the review list ----------
create or replace function public.restaurant_sync_flags20(p_resolve bigint default null, p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := public.rx19_need(array['admin','manager']);
begin
  if p_resolve is not null then update public.rx20_flags set resolved_at = now() where id = p_resolve; end if;
  return jsonb_build_object(
    'open', (select count(*) from public.rx20_flags where resolved_at is null),
    'rows', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from
      (select * from public.rx20_flags where resolved_at is null order by created_at desc limit greatest(1, least(200, coalesce(p_limit,50)))) f), '[]'::jsonb));
end $$;

-- ---------- who may call what ----------
do $$ declare f text; begin
  foreach f in array array['rx20_log_change()','rx20_prune_changes()','rx20_move_id(uuid,text,text)',
    'rx20_apply_bill(uuid,uuid,jsonb)','rx20_apply_stock(uuid,uuid,jsonb)','rx20_apply_item(uuid,uuid,jsonb)','rx20_apply_category(uuid,uuid,jsonb)',
    'restaurant_device_register20(uuid,text,text,text)','restaurant_invoice_block20(uuid,int)',
    'restaurant_sync_push20(uuid,jsonb)','restaurant_sync_pull20(uuid,bigint,int)','restaurant_sync_flags20(bigint,int)'] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function public.%s from anon', f); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.restaurant_device_register20(uuid,text,text,text), public.restaurant_invoice_block20(uuid,int),
      public.restaurant_sync_push20(uuid,jsonb), public.restaurant_sync_pull20(uuid,bigint,int), public.restaurant_sync_flags20(bigint,int) to authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
