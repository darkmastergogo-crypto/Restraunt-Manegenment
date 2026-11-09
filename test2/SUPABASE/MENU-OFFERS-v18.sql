-- Menu offers add-on (v18): Instagram follow / Google 5-star review discounts on QR orders.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to run again.
-- It adds two columns to orders (discount_amount, offers) and three checked functions.
-- Existing orders, menu, stock, tables and settings are not changed.

begin;

-- Admin or manager of THIS restaurant (same helper as the v17 workspace add-on).
create or replace function public.workspace_role()
returns text language sql stable security definer set search_path = public as $$
  select s.role::text from public.staff_users s
  where s.user_id = auth.uid() and s.role::text in ('admin', 'manager')
  order by case s.role::text when 'admin' then 0 else 1 end limit 1
$$;

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

-- Access: customers (anon) may place an order with an offer; only signed-in staff may remove one.
revoke all on function public.rx17_offer_amount(jsonb, text) from public;
revoke all on function public.restaurant_place_order_v17(uuid, uuid, text, text, text, jsonb, numeric, uuid, uuid, text[]) from public;
revoke all on function public.restaurant_order_offer17(uuid, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.rx17_offer_amount(jsonb, text) from anon';
    execute 'revoke all on function public.restaurant_order_offer17(uuid, text) from anon';
    execute 'grant execute on function public.restaurant_place_order_v17(uuid, uuid, text, text, text, jsonb, numeric, uuid, uuid, text[]) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.rx17_offer_amount(jsonb, text) from authenticated';
    execute 'grant execute on function public.restaurant_place_order_v17(uuid, uuid, text, text, text, jsonb, numeric, uuid, uuid, text[]) to authenticated';
    execute 'grant execute on function public.restaurant_order_offer17(uuid, text) to authenticated';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
