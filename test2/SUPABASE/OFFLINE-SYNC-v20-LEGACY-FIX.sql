-- Restaurant Offline v20 compatibility update for the existing restaurant schema.
-- Run after UPDATE-v19.sql and OFFLINE-SYNC-v20.sql in the existing Supabase project.
-- Databases built from DATABASE-FROM-SCRATCH use the original v20 functions.
begin;

do $check$
begin
  if to_regclass('public.restaurant_inventory') is null
     or to_regclass('public.restaurant_categories') is null
     or to_regprocedure('public.restaurant_sync_push20(uuid,jsonb)') is null then
    raise exception 'This compatibility update requires the existing restaurant schema and OFFLINE-SYNC-v20.sql.';
  end if;
end $check$;

-- The offline RPC supplies the original paid tax and settles stock itself. All other orders
-- continue to use the original triggers. Browser roles cannot insert directly into orders.
drop trigger if exists restaurant_snapshot_tax on public.orders;
create trigger restaurant_snapshot_tax before insert on public.orders for each row
  when (new.request_id is null or new.request_id::text is distinct from current_setting('restaurant.offline_bill', true))
  execute function public.restaurant_snapshot_tax();

drop trigger if exists restaurant_reserve_stock on public.orders;
create trigger restaurant_reserve_stock after insert on public.orders for each row
  when (new.request_id is null or new.request_id::text is distinct from current_setting('restaurant.offline_bill', true))
  execute function public.restaurant_reserve_stock();

create or replace function public.rx20_apply_bill(p_op uuid, p_device uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; lines jsonb := coalesce(p_payload -> 'items', '[]'::jsonb); l jsonb;
        subtotal numeric := 0; disc numeric := round(coalesce((p_payload ->> 'discount_amount')::numeric, 0), 2);
        tax numeric := round(coalesce((p_payload ->> 'tax_amount')::numeric, 0), 2);
        total numeric := round(coalesce((p_payload ->> 'total')::numeric, 0), 2);
        want numeric; inv text; prior_marker text;
        billed_at timestamptz := coalesce((p_payload ->> 'created_at')::timestamptz, now()); qty numeric; price numeric; cur numeric; mid text; v_var text;
        short int; moved int := 0; cfg jsonb; ykey text; iseq int; pre text;
begin
  perform pg_advisory_xact_lock_shared(hashtext('restaurant-reset-data'));
  perform pg_advisory_xact_lock(hashtext(p_op::text));
  select * into o from public.orders where request_id = p_op;
  if found then
    return public.restaurant_order_json(o) || jsonb_build_object('invoice_no', o.invoice_no);
  end if;

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

  inv := nullif(p_payload ->> 'invoice_no', '');

  -- A number taken from this device's block is still part of the year's run, so record where it
  -- sits. Without this the "next invoice number" shown in Settings would not count offline bills.
  if inv is not null then
    cfg := public.rx19_invoice_cfg();
    ykey := public.rx19_year_key(billed_at, cfg);
    pre := coalesce(cfg ->> 'prefix', 'INV');
    if left(inv, length(pre)) = pre and substr(inv, length(pre) + 1) ~ '^[0-9]+$' then
      iseq := substr(inv, length(pre) + 1)::int;      -- an ordinary number from the block
    else
      ykey := null;                                    -- a stand-in number sits outside the run
    end if;
  end if;

  -- Keep the paid totals and invoice number. The daily-number trigger uses billed_at.
  select jsonb_agg(line || jsonb_build_object('subtotal', round((line ->> 'qty')::numeric * (line ->> 'price')::numeric, 2))
                   order by position)
    into lines from jsonb_array_elements(lines) with ordinality as e(line, position);
  prior_marker := current_setting('restaurant.offline_bill', true);
  perform set_config('restaurant.offline_bill', p_op::text, true);
  insert into public.orders (order_id, request_id, table_number, customer_name, kitchen_notes, items, items_subtotal,
      tax_enabled, tax_mode, tax_value, tax_amount, discount_amount, total, status, payment_method,
      order_source, manual_actor, created_at, invoice_no, invoice_year, invoice_seq)
    values ('MAN-' || p_op::text, p_op, 'Counter',
      left(coalesce(nullif(trim(p_payload ->> 'customer_name'), ''), 'Counter'), 80),
      left(coalesce(p_payload ->> 'notes', ''), 1000),
      lines, subtotal, tax > 0, 'percent', 0, tax, disc, total, 'Served',
      case when p_payload ->> 'payment_method' = 'Cash' then 'Cash' else 'Online' end,
      'manual', 'staff:' || auth.uid()::text, billed_at, inv, ykey, iseq)
    returning * into o;
  perform set_config('restaurant.offline_bill', coalesce(prior_marker, ''), true);

  perform public.restaurant_apply_stock_loops();
  -- Stock comes off through the ledger, so two devices selling the same dish offline both count.
  for mid, v_var, qty in
    select line ->> 'id', coalesce(nullif(line ->> 'size', ''), 'single'), sum(ceil((line ->> 'qty')::numeric))
    from jsonb_array_elements(lines) as e(line)
    where line ->> 'id' is not null and (line ->> 'custom') is distinct from 'true'
    group by 1, 2 order by 1, 2
  loop
    perform pg_advisory_xact_lock(hashtextextended('restaurant-stock:' || jsonb_build_array(mid, v_var)::text, 0));
    select ms.remaining into cur from public.restaurant_inventory ms where ms.menu_id = mid and ms.variant = v_var and ms.tracking for update;
    if not found then
      -- The dish is counted under a different portion name than the bill used: never fail the
      -- bill over it, but do not let stock drift away silently either.
      if exists (select 1 from public.restaurant_inventory ms2 where ms2.menu_id = mid and ms2.tracking) then
        insert into public.rx20_flags (kind, detail, device_id) values ('stock_variant',
          jsonb_build_object('menu_id', mid, 'billed_portion', v_var, 'order', o.order_id,
            'note', 'This dish is counted by portion, but the bill did not say which. Stock was not changed.'), p_device);
      end if;
      continue;
    end if;
    short := greatest(0, ceil(qty)::int - cur);
    update public.restaurant_inventory ms set remaining = greatest(0, cur - ceil(qty)::int), revision = ms.revision + 1, updated_at = clock_timestamp()
      where ms.menu_id = mid and ms.variant = v_var;
    if cur > 0 then
      insert into public.restaurant_stock_reservations (order_id, menu_id, variant, quantity, generation)
        select o.id, mid, v_var, least(cur, qty)::int, ms.generation
        from public.restaurant_inventory ms where ms.menu_id = mid and ms.variant = v_var;
    end if;
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
    select case when mi.sizes_enabled then (mi.size_prices ->> (l ->> 'size'))::numeric else mi.price end
      into cur from public.menu_items mi where mi.id = mid;
    if cur is not null and abs(cur - coalesce((l ->> 'price')::numeric, cur)) > 0.005 then
      insert into public.rx20_flags (kind, detail, device_id) values ('price_changed',
        jsonb_build_object('menu_id', mid, 'billed', (l ->> 'price')::numeric, 'menu_now', cur, 'order', o.order_id), p_device);
    end if;
  end loop;

  return public.restaurant_order_json(o) || jsonb_build_object('invoice_no', o.invoice_no, 'stock_moves', moved);
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
  perform pg_advisory_xact_lock_shared(hashtext('restaurant-reset-data'));
  perform public.restaurant_apply_stock_loops(mid);
  perform pg_advisory_xact_lock(hashtextextended('restaurant-stock:' || jsonb_build_array(mid, v)::text, 0));
  select ms.remaining into cur from public.restaurant_inventory ms where ms.menu_id = mid and ms.variant = v for update;
  if not found then
    insert into public.restaurant_inventory (menu_id, variant, tracking, remaining) values (mid, v, true, greatest(0, ch));
    cur := 0; nxt := greatest(0, ch);
  else
    nxt := greatest(0, cur + ch);
    update public.restaurant_inventory ms set remaining = nxt, tracking = true, revision = ms.revision + 1, updated_at = clock_timestamp() where ms.menu_id = mid and ms.variant = v;
  end if;
  insert into public.rx20_stock_moves (id, menu_id, variant, change, reason, ref, device_id, op_id)
    values (public.rx20_move_id(p_op, mid, v), mid, v, ch, coalesce(p_payload ->> 'reason','adjust'), coalesce(p_payload ->> 'ref',''), p_device, p_op)
    on conflict (id) do nothing;
  return jsonb_build_object('menu_id', mid, 'variant', v, 'remaining', nxt);
end $$;

create or replace function public.rx20_apply_category(p_op uuid, p_device uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nm text := left(trim(coalesce(p_payload ->> 'name','')), 60);
begin
  if length(nm) = 0 then raise exception 'The category needs a name.' using errcode = '22023'; end if;
  insert into public.restaurant_categories (name, sort_order) values (nm, coalesce((p_payload ->> 'sort_order')::int, 0))
    on conflict (name) do nothing;
  return jsonb_build_object('name', nm);
end $$;

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
  if k = 'order' then body := body - 'token_hash' - 'customer_token_hash'; end if;
  if k = 'stock' then body := body || jsonb_build_object('tracked', body -> 'tracking'); end if;
  if rid is null then return null; end if;
  -- One row per change. Devices read them in order and keep their place.
  insert into public.rx20_changes (kind, row_id, data, deleted)
    values (k, rid, case when gone then null else body end, gone);
  return null;
end $$;

drop trigger if exists rx20_c_stock on public.restaurant_inventory;
create trigger rx20_c_stock after insert or update or delete on public.restaurant_inventory
  for each row execute function public.rx20_log_change('stock');
drop trigger if exists rx20_c_cat on public.restaurant_categories;
create trigger rx20_c_cat after insert or update or delete on public.restaurant_categories
  for each row execute function public.rx20_log_change('category');

revoke execute on function public.rx20_apply_bill(uuid,uuid,jsonb), public.rx20_apply_stock(uuid,uuid,jsonb),
  public.rx20_apply_category(uuid,uuid,jsonb), public.rx20_log_change() from public, anon, authenticated;

commit;
