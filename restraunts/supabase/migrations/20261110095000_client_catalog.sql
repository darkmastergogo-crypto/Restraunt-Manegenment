-- Shared public client menu.  Every record belongs to one restaurant; this is
-- deliberately separate from the legacy single-restaurant v21 schema.
begin;

create table if not exists public.restaurant_menu_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  unique (restaurant_id, name),
  unique (id, restaurant_id)
);

create table if not exists public.restaurant_menu_items (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.restaurant_menu_categories(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 600),
  price numeric(10,2) not null check (price >= 0 and price <= 1000000),
  image_url text not null default '' check (char_length(image_url) <= 2048),
  available boolean not null default true,
  featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_item_category_same_restaurant foreign key (category_id, restaurant_id)
    references public.restaurant_menu_categories(id, restaurant_id) deferrable initially immediate
);

create index if not exists restaurant_menu_categories_listing on public.restaurant_menu_categories(restaurant_id, sort_order, name);
create index if not exists restaurant_menu_items_listing on public.restaurant_menu_items(restaurant_id, available, sort_order, name);

alter table public.restaurant_menu_categories enable row level security;
alter table public.restaurant_menu_items enable row level security;

revoke all on public.restaurant_menu_categories, public.restaurant_menu_items from public;
grant select on public.restaurant_menu_categories, public.restaurant_menu_items to anon, authenticated;
grant insert, update, delete on public.restaurant_menu_categories, public.restaurant_menu_items to authenticated;

drop policy if exists restaurant_menu_categories_public_read on public.restaurant_menu_categories;
create policy restaurant_menu_categories_public_read on public.restaurant_menu_categories for select to anon, authenticated using (
  exists (select 1 from public.restaurants r where r.id = restaurant_id and r.status in ('trial','active'))
);
drop policy if exists restaurant_menu_categories_admin_write on public.restaurant_menu_categories;
create policy restaurant_menu_categories_admin_write on public.restaurant_menu_categories for all to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
) with check (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
);

drop policy if exists restaurant_menu_items_public_read on public.restaurant_menu_items;
create policy restaurant_menu_items_public_read on public.restaurant_menu_items for select to anon, authenticated using (
  exists (select 1 from public.restaurants r where r.id = restaurant_id and r.status in ('trial','active'))
);
drop policy if exists restaurant_menu_items_admin_write on public.restaurant_menu_items;
create policy restaurant_menu_items_admin_write on public.restaurant_menu_items for all to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
) with check (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
);

commit;

