-- ---------- bills ----------
create table public.bill_counters (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  last_no integer not null default 0
);
alter table public.bill_counters enable row level security;
alter table public.bill_counters force row level security;  -- no policies: only definer function touches it

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null unique references public.orders(id),
  bill_no integer not null,
  gst_scheme text not null,
  subtotal_paise integer not null,
  cgst_paise integer not null,
  sgst_paise integer not null,
  total_paise integer not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (restaurant_id, bill_no)
);
alter table public.bills enable row level security;
alter table public.bills force row level security;
create policy bills_select on public.bills for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids()));
-- no insert/update/delete policy: bills are created only by create_bill() and never edited.

create or replace function public.create_bill(p_order_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o record; v_bill uuid; v_sub int; v_bp int; v_tax int; v_no int; v_scheme text;
begin
  select id, restaurant_id, status into o from public.orders where id = p_order_id;
  if o.id is null then raise exception 'order_not_found'; end if;
  if private.my_role(o.restaurant_id) not in ('owner','manager','captain') then raise exception 'not_allowed'; end if;

  select id into v_bill from public.bills where order_id = p_order_id;
  if v_bill is not null then return v_bill; end if;
  if o.status <> 'served' then raise exception 'order_not_served'; end if;

  select gst_scheme into v_scheme from public.restaurants where id = o.restaurant_id;
  select coalesce(sum(qty * unit_price_paise),0) into v_sub from public.order_items where order_id = p_order_id;
  v_bp := case v_scheme when 'regular_5' then 250 when 'specified_18' then 900 else 0 end;  -- per half (CGST / SGST), in 1/100 %
  v_tax := (v_sub * v_bp + 5000) / 10000;  -- rounded to nearest paisa

  insert into public.bill_counters(restaurant_id, last_no) values (o.restaurant_id, 1)
  on conflict (restaurant_id) do update set last_no = public.bill_counters.last_no + 1
  returning last_no into v_no;

  insert into public.bills(restaurant_id, order_id, bill_no, gst_scheme, subtotal_paise, cgst_paise, sgst_paise, total_paise, created_by)
  values (o.restaurant_id, p_order_id, v_no, v_scheme, v_sub, v_tax, v_tax, v_sub + 2*v_tax, (select auth.uid()))
  returning id into v_bill;

  insert into public.audit_log(restaurant_id, actor, action, entity, entity_id, detail)
  values (o.restaurant_id, (select auth.uid()), 'bill_created', 'bill', v_bill, jsonb_build_object('bill_no', v_no, 'total_paise', v_sub + 2*v_tax));
  return v_bill;
end $$;
revoke all on function public.create_bill(uuid) from public, anon;
grant execute on function public.create_bill(uuid) to authenticated;
