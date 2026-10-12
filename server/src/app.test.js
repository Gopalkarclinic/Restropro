import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';

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
