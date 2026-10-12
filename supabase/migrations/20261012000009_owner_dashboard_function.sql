-- Owner/manager dashboard numbers in one call. Only owner/manager of that restaurant may call it.
create or replace function public.owner_dashboard(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if private.my_role(p_restaurant_id) not in ('owner','manager') then raise exception 'not_allowed'; end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'invalid_range'; end if;

  select jsonb_build_object(
    'sales_paise',   coalesce((select sum(total_paise) from public.bills where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to), 0),
    'gst_paise',     coalesce((select sum(cgst_paise + sgst_paise) from public.bills where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to), 0),
    'bills',         (select count(*) from public.bills where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to),
    'avg_bill_paise',coalesce((select round(avg(total_paise)) from public.bills where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to), 0),
    'orders',        (select count(*) from public.orders where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to and status <> 'cancelled'),
    'cancelled',     (select count(*) from public.orders where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to and status = 'cancelled'),
    'qr_orders',     (select count(*) from public.orders where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to and status <> 'cancelled' and source = 'qr'),
    'active',        (select count(*) from public.orders where restaurant_id = p_restaurant_id and status in ('pending_approval','approved','preparing','ready')),
    'avg_prep_seconds', (
      select coalesce(round(avg(extract(epoch from (r.t - a.t)))), 0)
      from (select entity_id, min(created_at) t from public.audit_log where restaurant_id = p_restaurant_id and action = 'order_status' and detail->>'to' = 'approved' and created_at >= p_from and created_at < p_to group by entity_id) a
      join (select entity_id, min(created_at) t from public.audit_log where restaurant_id = p_restaurant_id and action = 'order_status' and detail->>'to' = 'ready' group by entity_id) r using (entity_id)
      where r.t >= a.t),
    'hourly', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'sales_paise', s) order by h)
      from (select extract(hour from created_at at time zone 'Asia/Kolkata')::int h, sum(total_paise) s
            from public.bills where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to group by 1) x), '[]'::jsonb),
    'top_items', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'qty', q, 'sales_paise', s) order by q desc)
      from (select mi.name, sum(oi.qty)::int q, sum(oi.qty * oi.unit_price_paise)::bigint s
            from public.order_items oi
            join public.orders o on o.id = oi.order_id
            join public.menu_items mi on mi.id = oi.menu_item_id
            where oi.restaurant_id = p_restaurant_id and o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to
            group by mi.name order by q desc limit 8) t), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.owner_dashboard(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.owner_dashboard(uuid, timestamptz, timestamptz) to authenticated;
