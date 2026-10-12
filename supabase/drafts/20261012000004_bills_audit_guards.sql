-- Order cancel reason, status-change guard, audit log, captain order function, GST bills.

alter table public.orders add column cancel_reason text check (length(cancel_reason) <= 200);

-- ---------- audit log ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index audit_rest_idx on public.audit_log(restaurant_id, created_at desc);
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
create policy audit_select on public.audit_log for select to authenticated
  using (private.my_role(restaurant_id) in ('owner','manager'));
-- no insert/update/delete policy: only trigger functions (definer) write; nobody edits history.

-- ---------- order guard: who may move an order where ----------
create or replace function private.orders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r text; ok boolean := false;
begin
  if (select auth.uid()) is null then return new; end if;  -- server (service_role)
  r := private.my_role(old.restaurant_id);
  if r is null then raise exception 'not_staff'; end if;

  if new.restaurant_id is distinct from old.restaurant_id or new.table_no is distinct from old.table_no
     or new.source is distinct from old.source or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable_field';
  end if;

  if new.status is distinct from old.status then
    ok := case
      when old.status='pending_approval' and new.status='approved'  then r in ('owner','manager','captain')
      when old.status='approved'  and new.status='preparing'        then r in ('owner','manager','kitchen')
      when old.status='preparing' and new.status='ready'            then r in ('owner','manager','kitchen')
      when old.status='ready'     and new.status='served'           then r in ('owner','manager','captain')
      when new.status='cancelled' and old.status in ('pending_approval','approved','preparing','ready')
                                                                    then r in ('owner','manager')
      else false end;
    if not ok then raise exception 'transition_not_allowed'; end if;
    if new.status='cancelled' and coalesce(length(trim(new.cancel_reason)),0)=0 then
      raise exception 'cancel_reason_required';
    end if;
    insert into public.audit_log(restaurant_id, actor, action, entity, entity_id, detail)
    values (old.restaurant_id, (select auth.uid()), 'order_status', 'order', old.id,
            jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.cancel_reason));
  elsif new.cancel_reason is distinct from old.cancel_reason then
    raise exception 'transition_not_allowed';
  end if;
  return new;
end $$;
create trigger orders_guard before update on public.orders
  for each row execute function private.orders_guard();

-- ---------- staff create orders only through a function (prices come from DB) ----------
drop policy orders_insert on public.orders;
drop policy order_items_insert on public.order_items;

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
