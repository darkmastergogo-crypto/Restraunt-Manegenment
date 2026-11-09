-- Restaurant workspace v17 add-on: Expenses and stock history for the billing screens.
-- Safe to run more than once. It only ADDS one table and four functions.
-- It does not change or read orders, menu items, stock counts, tables or customer data.
-- Run it once in Supabase → SQL Editor → New query → paste → Run.

begin;

create table if not exists public.workspace_docs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expense', 'expense_auto', 'expense_heads', 'stock_move')),
  doc_day date,
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 20000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_docs_kind_day_idx on public.workspace_docs (kind, doc_day desc, created_at desc);
create index if not exists workspace_docs_ref_idx on public.workspace_docs (kind, (data ->> 'ref'));

-- No direct table access from the browser. Everything goes through the checked functions below.
alter table public.workspace_docs enable row level security;
revoke all on public.workspace_docs from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on public.workspace_docs from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on public.workspace_docs from authenticated'; end if;
end $$;

-- Admin or manager of THIS restaurant, from the existing staff_users table.
create or replace function public.workspace_role()
returns text language sql stable security definer set search_path = public as $$
  select s.role::text from public.staff_users s
  where s.user_id = auth.uid() and s.role::text in ('admin', 'manager')
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

commit;

-- Tell the API about the new functions straight away.
notify pgrst, 'reload schema';
