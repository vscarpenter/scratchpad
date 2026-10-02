import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareHandler } from './handler.mjs';
import { parseUpdateBody } from './validate.mjs';
import { OWNER, ID, NOW, ENVELOPE, UPDATE, stored, memoryStore, event } from './fixtures.mjs';

function setup(value = stored(), overrides = {}) {
  const store = memoryStore(value);
  const run = createShareHandler({ store, now: () => NOW, updatesEnabled: true, ...overrides });
  return { store, run };
}

test('owner update preserves expiry and credentials, with a conditional replacement', async () => {
  const { store, run } = setup();
  const response = await run(event());
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { revision: 2, publishedAt: NOW, expiresAt: NOW + 5000 });
  assert.equal(store.writes[0].options.ifMatch, '1');
  assert.equal(store.writes[0].value.revokeHash, stored().revokeHash);
  assert.equal(store.writes[0].value.expiresAt, stored().expiresAt);
  assert.equal(store.writes[0].value.ttlDays, 30);
});

test('public reads expose publication metadata without management credentials', async () => {
  const { run } = setup();
  await run(event());
  const response = JSON.parse((await run(event('GET'))).body);
  assert.deepEqual(Object.keys(response).sort(), ['ciphertext', 'expiresAt', 'iv', 'publishedAt', 'revision', 'v']);
  assert.equal(response.revision, 2);
  assert.ok(!JSON.stringify(response).includes(OWNER));
});

test('legacy shares read as revision one without an invented publication timestamp', async () => {
  const { run } = setup();
  const value = JSON.parse((await run(event('GET'))).body);
  assert.equal(value.revision, 1);
  assert.equal(value.publishedAt, undefined);
});

test('PUT stays disabled until the operator has provisioned cleanup', async () => {
  const { store, run } = setup(stored(), { updatesEnabled: false });
  assert.equal((await run(event())).statusCode, 503);
  assert.equal(store.writes.length, 0);
});

test('missing, incorrect, and read-key-only owner tokens cannot modify a share', async () => {
  for (const token of ['', 'x'.repeat(43), 'k'.repeat(43), 'short', 'é'.repeat(43)]) {
    const { store, run } = setup();
    assert.equal((await run(event('PUT', UPDATE, token))).statusCode, 403);
    assert.equal(store.writes.length, 0);
  }
});

test('expired and missing shares cannot be updated', async () => {
  const { run } = setup(stored({ expiresAt: NOW }));
  assert.equal((await run(event())).statusCode, 410);
  const missing = setup();
  missing.store.records.clear();
  assert.equal((await missing.run(event())).statusCode, 404);
});

test('expiry is checked again before storage commits', async () => {
  let tick = NOW - 1;
  const { store, run } = setup(stored({ expiresAt: NOW }), { now: () => tick++ });
  assert.equal((await run(event())).statusCode, 410);
  assert.equal(store.writes.length, 0);
});

test('a write crossing expiry is rejected and its ciphertext is conditionally removed', async () => {
  let tick = NOW;
  const { store, run } = setup(stored({ expiresAt: NOW + 1 }), { now: () => tick });
  store.beforePut = () => {
    tick = NOW + 1;
  };
  assert.equal((await run(event())).statusCode, 410);
  assert.equal(store.records.has(ID), false);
  assert.deepEqual(store.deletes, [ID]);
});

test('late-write cleanup cannot delete a replacement with a different ETag', async () => {
  let tick = NOW;
  const { store, run } = setup(stored({ expiresAt: NOW + 1 }), { now: () => tick });
  store.beforePut = () => {
    tick = NOW + 1;
  };
  store.beforeDelete = () => {
    store.records.get(ID).etag = 'newer';
  };
  assert.equal((await run(event())).statusCode, 410);
  assert.equal(store.records.get(ID).etag, 'newer');
  assert.deepEqual(store.deletes, []);
});

test('late-write cleanup failures are visible instead of claiming successful publication', async () => {
  let tick = NOW;
  const { store, run } = setup(stored({ expiresAt: NOW + 1 }), { now: () => tick });
  store.beforePut = () => {
    tick = NOW + 1;
  };
  store.beforeDelete = () => {
    throw Object.assign(new Error(), { name: 'AccessDenied' });
  };
  assert.equal((await run(event())).statusCode, 500);
  assert.equal(store.records.has(ID), true);
});

test('stale publication revisions conflict without an overwrite', async () => {
  const { store, run } = setup(stored({ revision: 2 }));
  assert.equal((await run(event())).statusCode, 409);
  assert.equal(store.writes.length, 0);
});

test('an exact replay acknowledges the first publication without writing again', async () => {
  const { store, run } = setup();
  const first = await run(event());
  const retry = await run(event());
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body, first.body);
  assert.equal(store.writes.length, 1);
  const changed = await run(event('PUT', { ...UPDATE, ciphertext: 'REVG' }));
  assert.equal(changed.statusCode, 409);
  assert.equal(store.writes.length, 1);
});

test('a concurrent replacement conflicts at the storage boundary', async () => {
  const { store, run } = setup();
  store.beforePut = () => {
    store.records.get(ID).etag = 'newer';
  };
  assert.equal((await run(event())).statusCode, 409);
  assert.equal(store.writes.length, 0);
});

test('a revocation racing an update never recreates the deleted object', async () => {
  const { store, run } = setup();
  store.beforePut = () => store.records.delete(ID);
  assert.equal((await run(event())).statusCode, 404);
  assert.equal(store.records.has(ID), false);
});

test('revocation after publishing deletes the latest object', async () => {
  const { store, run } = setup();
  await run(event());
  assert.equal((await run(event('DELETE'))).statusCode, 204);
  assert.equal((await run(event())).statusCode, 404);
  assert.equal(store.records.size, 0);
});

test('every update response retains security headers including conflicts', async () => {
  const { run } = setup();
  for (const body of [UPDATE, { ...UPDATE, expectedRevision: 20 }, {}]) {
    const result = await run(event('PUT', body));
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
  }
});

test('updates reject invalid operation IDs, revisions, expiry, and extra fields', () => {
  const invalid = [
    { expectedRevision: 0 },
    { expectedRevision: '1' },
    { expectedRevision: 1.5 },
    { operationId: '' },
    { operationId: 'x'.repeat(23) },
    { expiresAt: NOW + 1 },
    { expiresDays: 30 },
    { revokeHash: 'x' },
    { id: ID },
    { title: 'plaintext' },
  ];
  for (const change of invalid) assert.equal(parseUpdateBody(JSON.stringify({ ...UPDATE, ...change })).ok, false);
  assert.equal(parseUpdateBody(JSON.stringify(UPDATE)).ok, true);
  assert.equal(parseUpdateBody(JSON.stringify({ ...UPDATE, iv: 'QUJD' })).ok, false);
  assert.equal(parseUpdateBody('x'.repeat(262145)).status, 413);
});

test('creation remains backward compatible with new publication fields', async () => {
  const { run, store } = setup();
  const request = { ...event('POST', ENVELOPE), rawPath: '/api/share' };
  const response = await run(request);
  const created = JSON.parse(response.body);
  assert.equal(response.statusCode, 201);
  assert.equal(created.revision, 1);
  assert.equal(created.publishedAt, NOW);
  assert.equal(created.expiresAt, NOW + 7 * 86400000);
  assert.equal(store.writes[0].value.ttlDays, 7);
});
