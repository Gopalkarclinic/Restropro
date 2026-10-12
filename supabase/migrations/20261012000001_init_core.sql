-- Restropro core schema: multi-tenant (restaurant_id) + RLS on everything.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------- tables ----------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  gst_scheme text not null default 'regular_5' check (gst_scheme in ('regular_5','specified_18','composition')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','captain','kitchen')),
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);
create index staff_user_idx on public.staff(user_id);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  price_paise integer not null check (price_paise >= 0),
  is_available boolean not null default true,  -- one-tap hide
  created_at timestamptz not null default now()
);
create index menu_items_rest_idx on public.menu_items(restaurant_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_no text not null check (length(table_no) between 1 and 10),
  source text not null check (source in ('qr','captain')),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','approved','preparing','ready','served','cancelled')),
  idempotency_key text not null,  -- same key twice = same order (no double orders offline)
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (restaurant_id, idempotency_key)
);
create index orders_rest_status_idx on public.orders(restaurant_id, status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id),
  qty integer not null check (qty between 1 and 99),
  unit_price_paise integer not null check (unit_price_paise >= 0),
  note text check (length(note) <= 200)
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_rest_idx on public.order_items(restaurant_id);

-- ---------- helpers (private schema, not exposed via API) ----------
create or replace function private.my_restaurant_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select restaurant_id from public.staff where user_id = (select auth.uid())
$$;

create or replace function private.my_role(rid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.staff where user_id = (select auth.uid()) and restaurant_id = rid limit 1
$$;

revoke all on function private.my_restaurant_ids() from public, anon;
revoke all on function private.my_role(uuid) from public, anon;
grant execute on function private.my_restaurant_ids() to authenticated;
grant execute on function private.my_role(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.restaurants enable row level security;  alter table public.restaurants force row level security;
alter table public.staff       enable row level security;  alter table public.staff       force row level security;
alter table public.menu_items  enable row level security;  alter table public.menu_items  force row level security;
alter table public.orders      enable row level security;  alter table public.orders      force row level security;
alter table public.order_items enable row level security;  alter table public.order_items force row level security;

-- restaurants: staff see only their own; only owner edits
create policy restaurants_select on public.restaurants for select to authenticated
  using (id in (select private.my_restaurant_ids()));
create policy restaurants_update on public.restaurants for update to authenticated
  using (private.my_role(id) = 'owner') with check (private.my_role(id) = 'owner');

-- staff: see colleagues in own restaurant; only owner manages
create policy staff_select on public.staff for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids()));
create policy staff_owner_write on public.staff for all to authenticated
  using (private.my_role(restaurant_id) = 'owner') with check (private.my_role(restaurant_id) = 'owner');

-- menu: guests (QR page) can read menu of active restaurants; owner/manager edit; captain/kitchen can toggle via update
create policy menu_public_read on public.menu_items for select to anon, authenticated
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.is_active));
create policy menu_manage on public.menu_items for all to authenticated
  using (private.my_role(restaurant_id) in ('owner','manager'))
  with check (private.my_role(restaurant_id) in ('owner','manager'));
create policy menu_toggle_available on public.menu_items for update to authenticated
  using (private.my_role(restaurant_id) in ('captain','kitchen'))
  with check (private.my_role(restaurant_id) in ('captain','kitchen'));

-- orders: staff of that restaurant only. Guests order via the Node server (service_role), never directly.
create policy orders_select on public.orders for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids()));
create policy orders_insert on public.orders for insert to authenticated
  with check (private.my_role(restaurant_id) in ('owner','manager','captain'));
create policy orders_update on public.orders for update to authenticated
  using (restaurant_id in (select private.my_restaurant_ids()))
  with check (restaurant_id in (select private.my_restaurant_ids()));

create policy order_items_select on public.order_items for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids()));
create policy order_items_insert on public.order_items for insert to authenticated
  with check (private.my_role(restaurant_id) in ('owner','manager','captain'));

-- no delete policy on orders/order_items on purpose: bills must stay (use status 'cancelled' + audit)

-- ---------- advisor fix: Supabase helper should not be callable from the public API ----------
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
