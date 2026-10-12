-- DEV ONLY demo data
insert into public.restaurants (id, name, slug, gst_scheme) values
  ('11111111-1111-1111-1111-111111111111','Demo Dhaba','demo-dhaba','regular_5'),
  ('22222222-2222-2222-2222-222222222222','Demo Cafe','demo-cafe','regular_5')
on conflict do nothing;

insert into public.menu_items (restaurant_id, name, price_paise) values
  ('11111111-1111-1111-1111-111111111111','Misal Pav',8000),
  ('11111111-1111-1111-1111-111111111111','Thali',15000),
  ('22222222-2222-2222-2222-222222222222','Cold Coffee',12000),
  ('22222222-2222-2222-2222-222222222222','Veg Sandwich',9000);
