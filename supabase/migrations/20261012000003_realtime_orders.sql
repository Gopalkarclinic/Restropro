-- Live order updates for the staff app (RLS still applies to realtime)
alter publication supabase_realtime add table public.orders;
