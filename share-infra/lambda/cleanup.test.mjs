import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupShares } from './cleanup.mjs';
import { ID, NOW, stored, memoryStore } from './fixtures.mjs';

function setup() {
  const store = memoryStore(stored({ expiresAt: NOW, publishedAt: NOW - 1 }));
  store.list = async function* () {
    yield ID;
    yield 'bbbbbbbbbbbb';
    yield 'cccccccccccc';
  };
  store.records.set('bbbbbbbbbbbb', { value: stored({ expiresAt: NOW + 5000 }), etag: '2' });
  store.records.set('cccccccccccc', { value: stored({ expiresAt: NOW - 2000 }), etag: '3' });
  return store;
}

test('cleanup uses original expiry across pages, regardless of last publication', async () => {
  const store = setup();
  const result = await cleanupShares({ store, now: () => NOW });
  assert.deepEqual(result, { examined: 3, deleted: 2 });
  assert.deepEqual(store.deletes, [ID, 'cccccccccccc']);
  assert.equal(store.records.has('bbbbbbbbbbbb'), true);
  assert.deepEqual(await cleanupShares({ store, now: () => NOW }), { examined: 3, deleted: 0 });
});

test('a changed object cannot be deleted using an earlier ETag', async () => {
  const store = setup();
  store.beforeDelete = () => {
    store.records.get(ID).etag = 'changed';
  };
  store.list = async function* () {
    yield ID;
  };
  assert.deepEqual(await cleanupShares({ store, now: () => NOW }), { examined: 1, deleted: 0 });
  assert.equal(store.records.has(ID), true);
});

test('partial failures complete other deletes and fail the invocation for its alarm', async () => {
  const store = setup();
  const read = store.read;
  store.read = async (id) => {
    if (id === ID) throw new Error('storage unavailable');
    return read(id);
  };
  await assert.rejects(cleanupShares({ store, now: () => NOW }), /1 cleanup failure/);
  assert.deepEqual(store.deletes, ['cccccccccccc']);
});

test('malformed expiry is an operational failure, never guessed or deleted', async () => {
  const store = setup();
  store.records.get(ID).value.expiresAt = null;
  await assert.rejects(cleanupShares({ store, now: () => NOW }), /1 cleanup failure/);
  assert.equal(store.records.has(ID), true);
});

test('low remaining execution time fails visibly instead of skipping the tail silently', async () => {
  const store = setup();
  await assert.rejects(cleanupShares({ store, now: () => NOW, remaining: () => 1000 }), /Cleanup deadline/);
});
