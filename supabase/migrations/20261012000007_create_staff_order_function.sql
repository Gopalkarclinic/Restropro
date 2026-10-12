create or replace function public.create_staff_order(
  p_restaurant_id uuid, p_table_no text, p_idempotency_key text, p_items jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_oid uuid; v_item jsonb; v_menu record; v_qty int;
begin
  if private.my_role(p_restaurant_id) not in ('owner','manager','captain') then raise exception 'not_allowed'; end if;
  if length(coalesce(p_table_no,'')) not between 1 and 10 then raise exception 'invalid_table'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'invalid_items'; end if;

  select id into v_oid from public.orders where restaurant_id = p_restaurant_id and idempotency_key = p_idempotency_key;
  if v_oid is not null then return v_oid; end if;

  insert into public.orders (restaurant_id, table_no, source, status, idempotency_key, created_by)
  values (p_restaurant_id, p_table_no, 'captain', 'approved', p_idempotency_key, (select auth.uid()))
  returning id into v_oid;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty not between 1 and 99 then raise exception 'invalid_qty'; end if;
    select id, price_paise into v_menu from public.menu_items
     where id = (v_item->>'menu_item_id')::uuid and restaurant_id = p_restaurant_id and is_available;
    if v_menu.id is null then raise exception 'item_unavailable'; end if;
    insert into public.order_items (restaurant_id, order_id, menu_item_id, qty, unit_price_paise, note)
    values (p_restaurant_id, v_oid, v_menu.id, v_qty, v_menu.price_paise, left(v_item->>'note', 200));
  end loop;
  return v_oid;
end $$;
revoke all on function public.create_staff_order(uuid,text,text,jsonb) from public, anon;
grant execute on function public.create_staff_order(uuid,text,text,jsonb) to authenticated;
