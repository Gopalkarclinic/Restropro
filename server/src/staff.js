'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const createSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(72),
  role: z.enum(['manager', 'captain', 'kitchen']),
  displayName: z.string().trim().min(1).max(80),
});
const passwordSchema = z.object({ staffId: z.string().uuid(), password: z.string().min(8).max(72) });

// Owner-only staff accounts. Creating a login needs the secret key, so it happens here (never in the browser).
function staffRouter(db) {
  const r = express.Router();
  r.use(rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));

  // who is calling? must be an owner; returns their restaurant
  async function owner(req, res) {
    if (!db) { res.status(503).json({ error: 'server_not_configured' }); return null; }
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) { res.status(401).json({ error: 'not_logged_in' }); return null; }
    const { data: u, error } = await db.auth.getUser(token);
    if (error || !u || !u.user) { res.status(401).json({ error: 'not_logged_in' }); return null; }
    const { data: me } = await db.from('staff').select('restaurant_id, role').eq('user_id', u.user.id).eq('role', 'owner').maybeSingle();
    if (!me) { res.status(403).json({ error: 'not_allowed' }); return null; }
    return me.restaurant_id;
  }

  r.post('/', async (req, res) => {
    const p = createSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'invalid_request' });
    const rid = await owner(req, res); if (!rid) return;
    const { email, password, role, displayName } = p.data;
    const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !created || !created.user) {
      const dup = /already|registered|exists/i.test((error && error.message) || '');
      return res.status(dup ? 409 : 500).json({ error: dup ? 'email_exists' : 'server_error' });
    }
    const ins = await db.from('staff').insert({ restaurant_id: rid, user_id: created.user.id, role, display_name: displayName });
    if (ins.error) {
      await db.auth.admin.deleteUser(created.user.id); // do not leave a login without a restaurant
      return res.status(500).json({ error: 'server_error' });
    }
    res.status(201).json({ ok: true });
  });

  r.post('/password', async (req, res) => {
    const p = passwordSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'invalid_request' });
    const rid = await owner(req, res); if (!rid) return;
    const { data: row } = await db.from('staff').select('user_id').eq('id', p.data.staffId).eq('restaurant_id', rid).maybeSingle();
    if (!row) return res.status(404).json({ error: 'not_found' });
    const { error } = await db.auth.admin.updateUserById(row.user_id, { password: p.data.password });
    if (error) return res.status(500).json({ error: 'server_error' });
    res.json({ ok: true });
  });

  return r;
}

module.exports = { staffRouter };
