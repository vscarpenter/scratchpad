import test from 'node:test';
import assert from 'node:assert/strict';
import { createS3Store } from './s3-store.mjs';
import { ID, stored } from './fixtures.mjs';

class Command {
  constructor(input) {
    this.input = input;
    this.middleware = null;
    this.middlewareStack = {
      add: (middleware) => {
        this.middleware = middleware;
      },
    };
  }
}

function setup(result = { Body: { transformToString: async () => JSON.stringify(stored()) }, ETag: 'etag' }) {
  const calls = [];
  const client = {
    send: async (command) => {
      const args = { request: { headers: {} } };
      if (command.middleware) await command.middleware(async (value) => value)(args);
      calls.push({ ...command.input, headers: args.request.headers });
      if (result instanceof Error) throw result;
      return result;
    },
  };
  const sdk = { GetObjectCommand: Command, PutObjectCommand: Command, DeleteObjectCommand: Command };
  sdk.paginateListObjectsV2 = async function* () {
    yield { Contents: [{ Key: 'shares/' + ID + '.json' }, { Key: 'other/private.json' }] };
    yield { Contents: [{ Key: 'shares/bbbbbbbbbbbb.json' }] };
  };
  return { store: createS3Store(async () => ({ client, sdk }), 'test-only-bucket'), calls };
}

test('writes carry signed CAS headers even when the generated SDK knows no IfMatch field', async () => {
  const { store, calls } = setup();
  await store.put(ID, stored({ ttlDays: 7 }), { ifMatch: 'original-etag' });
  assert.equal(calls[0].headers['if-match'], 'original-etag');
  assert.equal(calls[0].Tagging, 'ttl-days=7');
  await store.put(ID, stored({ ttlDays: 14 }));
  assert.equal(calls[1].headers['if-none-match'], '*');
  await store.remove(ID, 'cleanup-etag');
  assert.equal(calls[2].headers['if-match'], 'cleanup-etag');
});

test('storage reads consume the stream and retain the ETag', async () => {
  const { store } = setup();
  const record = await store.read(ID);
  assert.equal(record.etag, 'etag');
  assert.deepEqual(record.value, stored());
});

test('cleanup sees permission errors; only API reads may interpret missing-key 403s', async () => {
  const { store } = setup(Object.assign(new Error(), { name: 'AccessDenied' }));
  assert.equal(await store.read(ID), null);
  await assert.rejects(store.read(ID, { allowMissing403: false }), { name: 'AccessDenied' });
});

test('paginated listing restricts cleanup to valid share object keys', async () => {
  const { store } = setup();
  const ids = [];
  for await (const id of store.list()) ids.push(id);
  assert.deepEqual(ids, [ID, 'bbbbbbbbbbbb']);
});
