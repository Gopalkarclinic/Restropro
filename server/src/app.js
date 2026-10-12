'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const orderSchema = z.object({
  restaurantSlug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  tableNo: z.string().min(1).max(10),
  idempotencyKey: z.string().min(8).max(64),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    qty: z.number().int().min(1).max(99),
    note: z.string().max(200).optional(),
  })).min(1).max(50),
});

// `db` is a supabase client (service_role) - injected so tests can fake it.
function createApp({ db, allowedOrigins = [] }) {
  const app = express();
  app.set('trust proxy', 1); // behind Hostinger proxy
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error('CORS blocked')),
  }));
  app.use(express.json({ limit: '20kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ ok: true, configured: Boolean(db) }));

  // Guest places order from QR page. Lands as 'pending_approval' - staff must approve.
  const orderLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  app.post('/api/public/orders', orderLimiter, async (req, res) => {
    const p = orderSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'invalid_request' });
    const { restaurantSlug, tableNo, idempotencyKey, items } = p.data;
    if (!db) return res.status(503).json({ error: 'server_not_configured' });
    const { data, error } = await db.rpc('create_qr_order', {
      p_slug: restaurantSlug, p_table_no: tableNo, p_idempotency_key: idempotencyKey,
      p_items: items.map(i => ({ menu_item_id: i.menuItemId, qty: i.qty, note: i.note })),
    });
    if (error) {
      const known = ['restaurant_not_found', 'item_unavailable', 'invalid_items', 'invalid_qty'];
      const code = known.find(k => error.message?.includes(k));
      if (code) return res.status(422).json({ error: code });
      console.error('order_error', error.code); // no user data in logs
      return res.status(500).json({ error: 'server_error' });
    }
    res.status(201).json({ orderId: data, status: 'pending_approval' });
  });

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => { console.error('unhandled', err.message); res.status(500).json({ error: 'server_error' }); });
  return app;
}

module.exports = { createApp };
