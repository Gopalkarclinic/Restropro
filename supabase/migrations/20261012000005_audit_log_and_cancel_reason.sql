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
