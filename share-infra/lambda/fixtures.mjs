import { createHash } from 'node:crypto';

export const OWNER = 'o'.repeat(43);
export const ID = 'AbCdEf123456';
export const NOW = 1000000;
export const ENVELOPE = { v: 1, ciphertext: 'QUJD', iv: 'QUJDREVGR0hJSktM' };
export const UPDATE = { ...ENVELOPE, expectedRevision: 1, operationId: 'a'.repeat(22) };

export function stored(overrides = {}) {
  return {
    ...ENVELOPE,
    expiresAt: NOW + 5000,
    revokeHash: createHash('sha256').update(OWNER).digest('hex'),
    ...overrides,
  };
}

export function memoryStore(value = stored()) {
  const records = new Map([[ID, { value, etag: '1' }]]);
  const writes = [];
  const deletes = [];
  const api = { records, writes, deletes, beforePut: null, beforeDelete: null };
  api.read = async (id) => (records.has(id) ? structuredClone(records.get(id)) : null);
  api.put = async (id, next, options = {}) => {
    if (api.beforePut) await api.beforePut();
    const prior = records.get(id);
    if (options.ifMatch && (!prior || prior.etag !== options.ifMatch)) {
      throw Object.assign(new Error('conditional write'), { name: prior ? 'PreconditionFailed' : 'NoSuchKey' });
    }
    records.set(id, { value: structuredClone(next), etag: String(Number(prior?.etag || 0) + 1) });
    writes.push({ id, value: next, options });
  };
  api.remove = async (id, etag) => {
    if (api.beforeDelete) await api.beforeDelete();
    if (etag && records.get(id)?.etag !== etag) throw Object.assign(new Error(), { name: 'PreconditionFailed' });
    records.delete(id);
    deletes.push(id);
  };
  return api;
}

export function event(method = 'PUT', body = UPDATE, token = OWNER) {
  return {
    rawPath: '/api/share/' + ID,
    requestContext: { http: { method } },
    headers: { 'x-share-owner-token': token, 'x-revoke-token': token },
    body: JSON.stringify(body),
  };
}
