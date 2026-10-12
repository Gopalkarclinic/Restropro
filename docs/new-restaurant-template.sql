-- Naya restaurant onboard karne ka template (Supabase SQL editor me chalayein).
-- Pehle: Authentication -> Users -> Add user (owner ka email+password, "Auto Confirm" tick).
-- Phir neeche ke 4 jagah badlo: NAAM, SLUG, EMAIL, GST. Menu ki list niche values me.
with r as (
  insert into public.restaurants (name, slug, gst_scheme)
  values ('NAAM', 'slug-yahan', 'regular_5')   -- gst: regular_5 | specified_18 | composition
  returning id
), o as (
  insert into public.staff (restaurant_id, user_id, role, display_name)
  select r.id, u.id, 'owner', 'Owner' from r, auth.users u where u.email = 'EMAIL-YAHAN'
  returning restaurant_id
)
insert into public.menu_items (restaurant_id, name, price_paise)
select o.restaurant_id, m.name, m.rupees * 100
from o, (values ('Misal Pav', 80), ('Chai', 15)) as m(name, rupees);
-- Tables ke QR: https://YOUR-DOMAIN/qr-sheet.html?r=slug-yahan&n=10
