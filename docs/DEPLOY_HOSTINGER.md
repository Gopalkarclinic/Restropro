# Deploy server on Hostinger (Business plan)

1. hPanel -> Websites -> Create Website -> **Web App** -> Import Git Repository -> authorize GitHub -> choose `Restropro`, branch `main`.
2. Build settings: **Root directory = `server`**, Entry file = `src/index.js`, Node 22.x, build command `npm run build`.
3. Environment Variables (hPanel):
   - `SUPABASE_URL` = https://eurxcepvxjpigbbbczyz.supabase.co
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase -> Project Settings -> API -> service_role (SECRET, only here)
   - `ALLOWED_ORIGINS` = the customer page origin, e.g. https://menu.yourdomain.com
   - `NODE_ENV` = production
4. Deploy. Open `https://<your-domain>/health` -> `{"ok":true,"configured":true}`. If configured is false, an environment variable is missing/wrong.
5. Put that domain in `customer-web/config.js` as `API_BASE`, push, redeploy customer-web.
6. Every push to `main` redeploys automatically. Never commit `.env`.

## After deploy
- `https://<your-domain>/` shows the customer menu (needs `?r=demo-dhaba&t=4`).
- QR for a table = `https://<your-domain>/?r=<restaurant-slug>&t=<table-number>`
- The customer page is served by this same server (folder `server/public`), so no CORS setup is needed. `ALLOWED_ORIGINS` is only for a future separate site.
