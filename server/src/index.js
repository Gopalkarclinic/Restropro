import { createClient } from '@supabase/supabase-js';
import { createApp } from './app.js';

const need = (k) => { if (!process.env[k]) { console.error(`Missing env ${k}`); process.exit(1); } return process.env[k]; };
const db = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

createApp({ db, allowedOrigins }).listen(process.env.PORT || 3000, () => console.log('Restropro server up'));
