// Share API. Three routes over a private bucket:
//   POST   /api/share          create
//   GET    /api/share/{id}     read
//   DELETE /api/share/{id}     revoke
//
// The bucket has Block Public Access fully on, so this handler is the only way
// to reach share data. Every read therefore checks expiry itself even though S3
// lifecycle also deletes the object -- lifecycle runs on a daily cadence and can
// lag a nominal expiry by up to 48 hours.
//
// There is deliberately no route that mutates an existing share. Snapshot
// semantics are enforced here, by absence, rather than by client discipline.

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { parseShareBody, isValidShareId, SHARE_TTL_MS } from './validate.mjs';

const BUCKET = process.env.SHARES_BUCKET;
const ORIGIN_SECRET = process.env.SHARE_ORIGIN_SECRET;
const PREFIX = 'shares/';
const READ_PATH = /^\/api\/share\/([^/]+)$/;
const ORIGIN_SECRET_HEADER = 'x-share-origin-secret';

// The AWS SDK is provided by the Lambda runtime, not by this repo. Loading it
// lazily keeps the pure exports below importable in a plain `node --test` run
// where the SDK is not installed. The module is cached after the first call, so
// only the first invocation of a cold container pays for it.
let s3Promise = null;
function getS3() {
  if (!s3Promise) {
    s3Promise = import('@aws-sdk/client-s3').then((sdk) => ({
      client: new sdk.S3Client({}),
      sdk,
    }));
  }
  return s3Promise;
}

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
  const supplied = headers[ORIGIN_SECRET_HEADER] ??
    headers[Object.keys(headers).find((k) => k.toLowerCase() === ORIGIN_SECRET_HEADER) ?? ''];
  if (typeof supplied !== 'string' || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied, 'utf8'), Buffer.from(expected, 'utf8'));
}

export function route(method, path) {
  if (method === 'POST' && path === '/api/share') return { action: 'create', id: null };
  const match = READ_PATH.exec(path);
  const id = match ? match[1] : null;
  if (!id || !isValidShareId(id)) return { action: 'unknown', id: null };
  if (method === 'GET') return { action: 'read', id };
  if (method === 'DELETE') return { action: 'revoke', id };
  return { action: 'unknown', id: null };
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function keyFor(id) {
  return PREFIX + id + '.json';
}

// The IAM policy grants GetObject on shares/* but deliberately NOT ListBucket,
// so a compromised handler cannot enumerate shares. S3's documented behavior in
// that case is to answer AccessDenied rather than NoSuchKey for a key that does
// not exist, because revealing the difference would itself leak existence.
//
// Every key this handler requests is inside the granted prefix, so AccessDenied
// there can only mean the object is absent. Treating it as "missing" is what
// makes a revoked link render as "nothing here" instead of a server error.
export function isMissingObjectError(error) {
  if (!error) return false;
  const status = error.$metadata?.httpStatusCode;
  return error.name === 'NoSuchKey' || error.name === 'AccessDenied' || status === 404 || status === 403;
}

async function readObject(id) {
  const { client, sdk } = await getS3();
  try {
    const res = await client.send(new sdk.GetObjectCommand({ Bucket: BUCKET, Key: keyFor(id) }));
    return JSON.parse(await res.Body.transformToString());
  } catch (error) {
    if (isMissingObjectError(error)) return null;
    throw error;
  }
}

async function create(rawBody) {
  const parsed = parseShareBody(rawBody);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });

  const { client, sdk } = await getS3();
  const id = newShareId();
  const revokeToken = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SHARE_TTL_MS;

  await client.send(new sdk.PutObjectCommand({
    Bucket: BUCKET,
    Key: keyFor(id),
    ContentType: 'application/json',
    Body: JSON.stringify({ ...parsed.value, expiresAt, revokeHash: hashToken(revokeToken) }),
  }));

  return json(201, { id, revokeToken, expiresAt });
}

async function read(id) {
  const stored = await readObject(id);
  if (!stored) return json(404, { error: 'Not found' });
  if (Date.now() > stored.expiresAt) return json(410, { error: 'Expired' });
  // revokeHash is deliberately not echoed back.
  return json(200, {
    v: stored.v,
    ciphertext: stored.ciphertext,
    iv: stored.iv,
    expiresAt: stored.expiresAt,
  });
}

async function revoke(id, token) {
  const stored = await readObject(id);
  if (!stored) return json(404, { error: 'Not found' });
  if (typeof token !== 'string' || !timingSafeEqualHex(stored.revokeHash, hashToken(token))) {
    return json(403, { error: 'Forbidden' });
  }
  const { client, sdk } = await getS3();
  await client.send(new sdk.DeleteObjectCommand({ Bucket: BUCKET, Key: keyFor(id) }));
  return { statusCode: 204, headers: { 'cache-control': 'no-store' }, body: '' };
}

export async function handler(event) {
  const headers = event?.headers || {};
  if (!hasValidOriginSecret(headers, ORIGIN_SECRET)) {
    // Deliberately indistinguishable from an unknown path: someone probing the
    // API Gateway endpoint directly learns nothing about what lives here.
    return json(404, { error: 'Not found' });
  }

  const method = event?.requestContext?.http?.method || '';
  const path = event?.rawPath || '';
  const { action, id } = route(method, path);

  const rawBody = event?.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event?.body;

  try {
    if (action === 'create') return await create(rawBody);
    if (action === 'read') return await read(id);
    if (action === 'revoke') {
      return await revoke(id, headers['x-revoke-token'] || headers['X-Revoke-Token']);
    }
    return json(404, { error: 'Not found' });
  } catch (error) {
    // Never echo the error: it can carry bucket names and key paths.
    console.error('share handler failure', action, error?.name);
    return json(500, { error: 'Server error' });
  }
}
