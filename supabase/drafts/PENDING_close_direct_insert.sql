-- NOT YET APPLIED (waiting for owner OK). Closes direct inserts so staff can create orders ONLY via
-- create_staff_order() (prices always come from the database).
drop policy orders_insert on public.orders;
drop policy order_items_insert on public.order_items;
