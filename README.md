# Restropro

Restaurant ordering + billing system (Maharashtra first). One shared multi-tenant codebase.

## Folders
- `customer-web/` - QR menu + ordering for guests (Flutter Web)
- `staff-app/` - owner / captain / kitchen app (Flutter)
- `server/` - Node.js API (Hostinger): QR orders, later payments, webhooks, emails
- `supabase/migrations/` - database schema (run in order)
- `supabase/seed.sql` - 2 demo restaurants (dev only)
- `supabase/tests/` - security tests (tenant isolation)
- `docs/` - notes

## Security rules
1. Repo stays **Private**. `.env` is git-ignored; only `.env.example` is committed.
2. `service_role` key only in server env vars, never in Flutter/web.
3. Every table has `restaurant_id` + RLS ENABLED + FORCED. New table = new policies + a test.
4. Deploy only from `main`.
