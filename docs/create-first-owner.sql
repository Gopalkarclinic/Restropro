-- 1) Supabase dashboard -> Authentication -> Users -> Add user (email + password, tick "Auto Confirm").
-- 2) Put that email below and run this in the SQL editor. It links the login to Demo Dhaba as owner.
insert into public.staff (restaurant_id, user_id, role, display_name)
select '11111111-1111-1111-1111-111111111111', id, 'owner', 'Sam'
from auth.users where email = 'PUT-YOUR-EMAIL-HERE';
-- Other roles: change 'owner' to 'captain' or 'kitchen' for test accounts.
