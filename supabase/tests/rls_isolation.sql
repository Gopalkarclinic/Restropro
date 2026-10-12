-- Run in SQL editor. Everything rolls back. Passes if no exception is raised.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local');
insert into public.restaurants (id,name,slug) values
  ('11111111-aaaa-aaaa-aaaa-111111111111','T Rest A','t-rest-a'),
  ('22222222-bbbb-bbbb-bbbb-222222222222','T Rest B','t-rest-b');
insert into public.staff (restaurant_id,user_id,role,display_name) values
  ('11111111-aaaa-aaaa-aaaa-111111111111','aaaaaaaa-0000-0000-0000-00000000000a','owner','A owner'),
  ('22222222-bbbb-bbbb-bbbb-222222222222','bbbbbbbb-0000-0000-0000-00000000000b','owner','B owner');
insert into public.orders (restaurant_id,table_no,source,idempotency_key) values
  ('22222222-bbbb-bbbb-bbbb-222222222222','1','captain','k1');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}',true);
do $$
declare n int; ins boolean := false;
begin
  select count(*) into n from public.orders;
  if n <> 0 then raise exception 'FAIL: A can read B orders (%)', n; end if;
  select count(*) into n from public.restaurants;
  if n <> 1 then raise exception 'FAIL: A sees % restaurants', n; end if;
  begin
    insert into public.orders (restaurant_id,table_no,source,idempotency_key)
    values ('22222222-bbbb-bbbb-bbbb-222222222222','9','captain','hack');
    ins := true;
  exception when others then null; end;
  if ins then raise exception 'FAIL: A inserted into B'; end if;
  raise notice 'PASS: tenant isolation OK';
end $$;

reset role;
set local role anon;
do $$ declare n int; begin
  select count(*) into n from public.orders;
  if n <> 0 then raise exception 'FAIL: anon can read orders'; end if;
  raise notice 'PASS: anon blocked from orders';
end $$;
rollback;
