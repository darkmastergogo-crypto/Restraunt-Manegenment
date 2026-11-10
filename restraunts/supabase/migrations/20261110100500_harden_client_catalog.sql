begin;

create index if not exists restaurant_menu_items_category_restaurant on public.restaurant_menu_items(category_id, restaurant_id);

-- Reading a published menu is public. Writes are separately scoped so the
-- authenticated read policy does not compete with an all-actions policy.
drop policy if exists restaurant_menu_categories_admin_write on public.restaurant_menu_categories;
create policy restaurant_menu_categories_admin_insert on public.restaurant_menu_categories for insert to authenticated with check (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
);
create policy restaurant_menu_categories_admin_update on public.restaurant_menu_categories for update to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
) with check (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
);
create policy restaurant_menu_categories_admin_delete on public.restaurant_menu_categories for delete to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
);

drop policy if exists restaurant_menu_items_admin_write on public.restaurant_menu_items;
create policy restaurant_menu_items_admin_insert on public.restaurant_menu_items for insert to authenticated with check (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
);
create policy restaurant_menu_items_admin_update on public.restaurant_menu_items for update to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
) with check (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
);
create policy restaurant_menu_items_admin_delete on public.restaurant_menu_items for delete to authenticated using (
  (select platform_private.is_owner()) or platform_private.tenant_role(restaurant_id) = 'administrator'
);

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;

