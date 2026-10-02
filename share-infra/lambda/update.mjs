import { createHash, timingSafeEqual } from 'node:crypto';
import { parseUpdateBody, SHARE_TTL_DAYS } from './validate.mjs';

export function publication(stored) {
  return {
    revision: stored.revision || 1,
    ...(Number.isFinite(stored.publishedAt) ? { publishedAt: stored.publishedAt } : {}),
    expiresAt: stored.expiresAt,
  };
}

function owns(stored, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  if (typeof stored.revokeHash !== 'string' || !/^[a-f0-9]{64}$/.test(stored.revokeHash)) return false;
  const hash = createHash('sha256').update(token).digest();
  return timingSafeEqual(hash, Buffer.from(stored.revokeHash, 'hex'));
}

function digest(parsed) {
  return createHash('sha256')
    .update(
      JSON.stringify({ ...parsed.value, expectedRevision: parsed.expectedRevision, operationId: parsed.operationId }),
    )
    .digest('hex');
}

async function removeLateWrite(api, id, written) {
  if (!written?.ETag) throw new Error('Missing written storage precondition');
  try {
    await api.store.remove(id, written.ETag);
  } catch (error) {
    if (
      ['PreconditionFailed', 'NoSuchKey'].includes(error.name) ||
      [404, 412].includes(error.$metadata?.httpStatusCode)
    )
      return;
    throw error;
  }
}

async function replace(api, id, record, parsed) {
  const current = record.value;
  const next = {
    ...current,
    ...parsed.value,
    revision: (current.revision || 1) + 1,
    publishedAt: api.now(),
    ttlDays: SHARE_TTL_DAYS.includes(current.ttlDays) ? current.ttlDays : 30,
    lastOperationId: parsed.operationId,
    lastOperationDigest: digest(parsed),
  };
  if (api.now() >= current.expiresAt) return { status: 410, body: { error: 'Expired' } };
  if (!record.etag) throw new Error('Missing storage precondition');
  try {
    const written = await api.store.put(id, next, { ifMatch: record.etag });
    if (api.now() >= current.expiresAt) {
      await removeLateWrite(api, id, written);
      return { status: 410, body: { error: 'Expired' } };
    }
    return { status: 200, body: publication(next) };
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)
      return { status: 404, body: { error: 'Not found' } };
    if (
      ['PreconditionFailed', 'ConditionalRequestConflict'].includes(error.name) ||
      [409, 412].includes(error.$metadata?.httpStatusCode)
    )
      return { status: 409, body: { error: 'Publication conflict' } };
    throw error;
  }
}

export async function updateShare(api, id, rawBody, token) {
  if (!api.updatesEnabled) return { status: 503, body: { error: 'Updates unavailable' } };
  const parsed = parseUpdateBody(rawBody);
  if (!parsed.ok) return { status: parsed.status, body: { error: parsed.error } };
  const record = await api.store.read(id);
  if (!record) return { status: 404, body: { error: 'Not found' } };
  const current = record.value;
  if (!owns(current, token)) return { status: 403, body: { error: 'Forbidden' } };
  if (!Number.isFinite(current.expiresAt) || api.now() >= current.expiresAt)
    return { status: 410, body: { error: 'Expired' } };
  if (current.lastOperationId === parsed.operationId && current.lastOperationDigest === digest(parsed))
    return { status: 200, body: publication(current) };
  if (current.lastOperationId === parsed.operationId || (current.revision || 1) !== parsed.expectedRevision)
    return { status: 409, body: { error: 'Publication conflict' } };
  return replace(api, id, record, parsed);
}
