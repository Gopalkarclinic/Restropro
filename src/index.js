'use strict';
const { createApp } = require('./app');

// Start even if env is incomplete, so /health works and shows "configured": false
// (clearer than a silent crash on the host).
let db = null;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key && !key.startsWith('PASTE_')) {
  const { createClient } = require('@supabase/supabase-js');
  db = createClient(url, key, { auth: { persistSession: false } });
} else {
  console.error('WARNING: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing - orders disabled');
}
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

createApp({ db, allowedOrigins }).listen(process.env.PORT || 3000, () => console.log('Restropro server up'));
