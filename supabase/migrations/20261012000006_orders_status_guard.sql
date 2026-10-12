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
