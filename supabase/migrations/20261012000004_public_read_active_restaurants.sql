-- Guests (QR page, anon role) may read active restaurants (name/slug) so the public menu can show.
-- Without this, the menu_items policy (which checks restaurants) returned nothing for guests.
create policy restaurants_public_read on public.restaurants for select to anon
  using (is_active);
