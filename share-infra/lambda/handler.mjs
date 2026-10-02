// Share API. Four routes over a private bucket:
//   POST   /api/share          create
//   GET    /api/share/{id}     read
//   DELETE /api/share/{id}     revoke
//   PUT    /api/share/{id}     explicitly republish (owner only)
//
// The bucket has Block Public Access fully on, so this handler is the only way
// to reach share data. Every read therefore checks expiry itself even though S3
// lifecycle also deletes the object -- lifecycle runs on a daily cadence and can
// lag a nominal expiry by up to 48 hours.
//
// Local edits never publish. PUT is authenticated and remains disabled until
// original-expiry cleanup is provisioned on an unversioned shares bucket.

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { parseShareBody, isValidShareId } from './validate.mjs';
import { shareStore } from './s3-store.mjs';
import { updateShare, publication } from './update.mjs';
export { isMissingObjectError } from './s3-store.mjs';

const READ_PATH = /^\/api\/share\/([^/]+)$/;
const ORIGIN_SECRET_HEADER = 'x-share-origin-secret';

export function newShareId() {
  return randomBytes(9).toString('base64url'); // 9 bytes -> exactly 12 chars
}

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

// The API Gateway endpoint is reachable from the internet, so CloudFront injects
// a secret header that this handler requires. Without it the CDN could simply be
// bypassed, along with any edge protection added there later. An unset secret
// allows everything, which is only for local runs -- provision.sh always sets it.
export function hasValidOriginSecret(headers, expected) {
  if (!expected) return true;
  if (!headers) return false;
  const supplied =
    headers[ORIGIN_SECRET_HEADER] ??
    headers[Object.keys(headers).find((k) => k.toLowerCase() === ORIGIN_SECRET_HEADER) ?? ''];
  if (typeof supplied !== 'string') return false;
  // Compare byte lengths, not string lengths: a multibyte character makes the
  // two measures diverge, and timingSafeEqual throws on unequal buffers.
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (suppliedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(suppliedBytes, expectedBytes);
}

export function route(method, path) {
  if (method === 'POST' && path === '/api/share') return { action: 'create', id: null };
  const match = READ_PATH.exec(path);
  const id = match ? match[1] : null;
  if (!id || !isValidShareId(id)) return { action: 'unknown', id: null };
  if (method === 'GET') return { action: 'read', id };
  if (method === 'DELETE') return { action: 'revoke', id };
  if (method === 'PUT') return { action: 'update', id };
  return { action: 'unknown', id: null };
}

// The /api/share* cache behavior carries no CloudFront function association, so
// the viewer-response security-headers function never runs on this path. What
// this handler sets is the complete header set the browser sees. HSTS matches
// cloudfront/security-headers-function.js byte for byte so one host never
// advertises two different policies.
export const SECURITY_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
});

export function json(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', ...SECURITY_HEADERS },
    body: JSON.stringify(body),
  };
}

export function noContent() {
  return { statusCode: 204, headers: { ...SECURITY_HEADERS }, body: '' };
}

function header(headers, name) {
  return headers[Object.keys(headers).find((key) => key.toLowerCase() === name)] || '';
}

async function create(api, rawBody) {
  const parsed = parseShareBody(rawBody);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });
  const id = newShareId();
  const revokeToken = randomBytes(32).toString('base64url');
  const publishedAt = api.now();
  const expiresAt = publishedAt + parsed.ttlDays * 86400000;
  const stored = {
    ...parsed.value,
    expiresAt,
    revokeHash: hashToken(revokeToken),
    ttlDays: parsed.ttlDays,
    revision: 1,
    publishedAt,
  };
  await api.store.put(id, stored);
  return json(201, { id, revokeToken, ...publication(stored) });
}

async function read(api, id) {
  const record = await api.store.read(id);
  if (!record) return json(404, { error: 'Not found' });
  const stored = record.value;
  if (!Number.isFinite(stored.expiresAt) || api.now() >= stored.expiresAt) return json(410, { error: 'Expired' });
  return json(200, { v: stored.v, ciphertext: stored.ciphertext, iv: stored.iv, ...publication(stored) });
}

async function revoke(api, id, token) {
  const record = await api.store.read(id);
  if (!record) return json(404, { error: 'Not found' });
  if (typeof token !== 'string' || !timingSafeEqualHex(record.value.revokeHash, hashToken(token)))
    return json(403, { error: 'Forbidden' });
  await api.store.remove(id);
  return noContent();
}

async function dispatch(api, event) {
  const headers = event?.headers || {};
  if (!hasValidOriginSecret(headers, api.originSecret)) return json(404, { error: 'Not found' });
  const method = event?.requestContext?.http?.method || '';
  const { action, id } = route(method, event?.rawPath || '');
  const rawBody =
    event?.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : event?.body;
  if (action === 'create') return create(api, rawBody);
  if (action === 'read') return read(api, id);
  if (action === 'revoke') return revoke(api, id, header(headers, 'x-revoke-token'));
  if (action === 'update') {
    const result = await updateShare(api, id, rawBody, header(headers, 'x-share-owner-token'));
    return json(result.status, result.body);
  }
  return json(404, { error: 'Not found' });
}

export function createShareHandler(api) {
  return async (event) => {
    try {
      return await dispatch(api, event);
    } catch (error) {
      // Never log request contents, secrets, or storage paths.
      console.error('share handler failure', error?.name);
      return json(500, { error: 'Server error' });
    }
  };
}

export const handler = createShareHandler({
  store: shareStore,
  now: Date.now,
  originSecret: process.env.SHARE_ORIGIN_SECRET,
  updatesEnabled: process.env.SHARE_UPDATES_ENABLED === 'true',
});
