const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./app');

const fakeDb = (result) => ({ rpc: async () => result });
const call = async (app, method, path, body) => {
  const s = app.listen(0); const port = s.address().port;
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json(); s.close(); return { status: r.status, j, h: r.headers };
};
const good = { restaurantSlug: 'demo-dhaba', tableNo: '4', idempotencyKey: 'abcdefgh1',
  items: [{ menuItemId: '11111111-1111-1111-1111-111111111111', qty: 2 }] };

test('health ok + security headers', async () => {
  const r = await call(createApp({ db: fakeDb({}) }), 'GET', '/health');
  assert.equal(r.status, 200); assert.ok(r.h.get('x-content-type-options')); assert.equal(r.h.get('x-powered-by'), null);
});
test('rejects bad body', async () => {
  const r = await call(createApp({ db: fakeDb({}) }), 'POST', '/api/public/orders', { ...good, items: [] });
  assert.equal(r.status, 400);
});
test('creates order as pending_approval', async () => {
  const r = await call(createApp({ db: fakeDb({ data: 'oid-1', error: null }) }), 'POST', '/api/public/orders', good);
  assert.equal(r.status, 201); assert.equal(r.j.status, 'pending_approval');
});
test('unavailable item -> 422', async () => {
  const r = await call(createApp({ db: fakeDb({ data: null, error: { message: 'item_unavailable' } }) }), 'POST', '/api/public/orders', good);
  assert.equal(r.status, 422);
});
test('no db configured -> 503, health says configured false', async () => {
  const app = createApp({ db: null });
  const h = await call(app, 'GET', '/health');
  assert.equal(h.j.configured, false);
  const r = await call(app, 'POST', '/api/public/orders', good);
  assert.equal(r.status, 503);
});

test('bad JSON -> 400, not 500', async () => {
  const app = createApp({ db: fakeDb({}) });
  const s = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/public/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  s.close(); assert.equal(r.status, 400);
});
test('serves customer page with CSP', async () => {
  const s = createApp({ db: null }).listen(0);
  const r = await fetch(`http://127.0.0.1:${s.address().port}/`);
  const html = await r.text(); s.close();
  assert.equal(r.status, 200); assert.ok(html.includes('app.js'));
  assert.ok(r.headers.get('content-security-policy').includes("script-src 'self'"));
});
test('retries once on duplicate-key race', async () => {
  let n = 0;
  const db = { rpc: async () => (++n === 1 ? { data: null, error: { code: '23505', message: 'dup' } } : { data: 'oid', error: null }) };
  const r = await call(createApp({ db }), 'POST', '/api/public/orders', good);
  assert.equal(r.status, 201); assert.equal(n, 2);
});

test('QR svg endpoint works and rejects bad input', async () => {
  const s = createApp({ db: null }).listen(0); const base = `http://127.0.0.1:${s.address().port}`;
  const ok = await fetch(`${base}/qr/demo-dhaba/4.svg`); const body = await ok.text();
  const bad = await fetch(`${base}/qr/demo-dhaba/<script>.svg`);
  s.close();
  assert.equal(ok.status, 200); assert.ok(body.startsWith('<svg')); assert.equal(bad.status === 400 || bad.status === 404, true);
});

test('guest can read only the status of an order', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'preparing' }, error: null }) }) }) }) };
  const ok = await call(createApp({ db }), 'GET', '/api/public/orders/11111111-1111-1111-1111-111111111111');
  assert.equal(ok.status, 200); assert.deepEqual(ok.j, { status: 'preparing' });
  const bad = await call(createApp({ db }), 'GET', '/api/public/orders/not-a-uuid');
  assert.equal(bad.status, 400);
});

// ---- staff accounts (owner only) ----
function staffDb({ role = 'owner', userOk = true, createErr = null, insertErr = null } = {}) {
  const calls = { deleted: [], created: [] };
  const db = {
    calls,
    auth: { getUser: async () => (userOk ? { data: { user: { id: 'u-owner' } }, error: null } : { data: null, error: { message: 'bad' } }),
      admin: { createUser: async (x) => { calls.created.push(x); return createErr ? { data: null, error: createErr } : { data: { user: { id: 'u-new' } }, error: null }; },
        deleteUser: async (id) => { calls.deleted.push(id); return {}; }, updateUserById: async () => ({ error: null }) } },
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: role ? { restaurant_id: 'r1', role, user_id: 'u-x' } : null }), insert: async () => ({ error: insertErr }) }; return q; },
  };
  return db;
}
const post = async (app, path, body, token = 't') => {
  const s = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${s.address().port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const j = await r.json(); s.close(); return { status: r.status, j };
};
const newStaff = { email: 'a@b.in', password: 'longenough1', role: 'captain', displayName: 'Ravi' };
test('owner can create staff', async () => {
  const db = staffDb(); const r = await post(createApp({ db }), '/api/staff', newStaff);
  assert.equal(r.status, 201); assert.equal(db.calls.created.length, 1);
});
test('no token -> 401, non-owner -> 403, bad input -> 400', async () => {
  assert.equal((await post(createApp({ db: staffDb() }), '/api/staff', newStaff, null)).status, 401);
  assert.equal((await post(createApp({ db: staffDb({ role: null }) }), '/api/staff', newStaff)).status, 403);
  assert.equal((await post(createApp({ db: staffDb() }), '/api/staff', { ...newStaff, role: 'owner' })).status, 400);
  assert.equal((await post(createApp({ db: staffDb() }), '/api/staff', { ...newStaff, password: 'short' })).status, 400);
});
test('duplicate email -> 409; failed link removes the new login', async () => {
  assert.equal((await post(createApp({ db: staffDb({ createErr: { message: 'User already registered' } }) }), '/api/staff', newStaff)).status, 409);
  const db = staffDb({ insertErr: { message: 'x' } });
  assert.equal((await post(createApp({ db }), '/api/staff', newStaff)).status, 500); assert.deepEqual(db.calls.deleted, ['u-new']);
});
