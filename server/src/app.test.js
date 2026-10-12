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
