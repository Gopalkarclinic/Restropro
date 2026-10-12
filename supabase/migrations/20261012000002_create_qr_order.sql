-- Atomic QR order creation. Prices come from DB (never from the guest's phone).
-- Only the Node server (service_role) may call this.
create or replace function public.create_qr_order(
  p_slug text, p_table_no text, p_idempotency_key text, p_items jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_rid uuid; v_oid uuid; v_item jsonb; v_menu record; v_qty int; v_count int := 0;
begin
  select id into v_rid from public.restaurants where slug = p_slug and is_active;
  if v_rid is null then raise exception 'restaurant_not_found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'invalid_items';
  end if;

  select id into v_oid from public.orders
   where restaurant_id = v_rid and idempotency_key = p_idempotency_key;
  if v_oid is not null then return v_oid; end if;  -- retry = same order

  insert into public.orders (restaurant_id, table_no, source, idempotency_key)
  values (v_rid, p_table_no, 'qr', p_idempotency_key) returning id into v_oid;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty not between 1 and 99 then raise exception 'invalid_qty'; end if;
    select id, price_paise into v_menu from public.menu_items
     where id = (v_item->>'menu_item_id')::uuid and restaurant_id = v_rid and is_available;
    if v_menu.id is null then raise exception 'item_unavailable'; end if;
    insert into public.order_items (restaurant_id, order_id, menu_item_id, qty, unit_price_paise, note)
    values (v_rid, v_oid, v_menu.id, v_qty, v_menu.price_paise, left(v_item->>'note', 200));
    v_count := v_count + 1;
  end loop;
  return v_oid;
end $$;

revoke all on function public.create_qr_order(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_qr_order(text,text,text,jsonb) to service_role;
