import test from 'node:test';
import assert from 'node:assert/strict';
import {
  route, newShareId, hashToken, timingSafeEqualHex, isMissingObjectError, hasValidOriginSecret,
  json, noContent, SECURITY_HEADERS,
} from './handler.mjs';

// The /api/share* cache behavior carries no CloudFront function, so the
// viewer-response security-headers function never runs on this path. Whatever
// this handler sets is the complete header set the browser sees. Asserting it
// here is the only place that property is enforced.
test('every JSON response carries nosniff, HSTS, and no-store', () => {
  const res = json(404, { error: 'Not found' });
  assert.equal(res.headers['content-type'], 'application/json');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['strict-transport-security'],
    'max-age=63072000; includeSubDomains; preload');
});

test('the 204 revoke response carries the same headers as a JSON response', () => {
  const res = noContent();
  assert.equal(res.statusCode, 204);
  assert.equal(res.body, '');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(res.headers[name], value, `204 response is missing ${name}`);
  }
});

test('no-store survives on every status a client can reach', () => {
  for (const status of [200, 201, 400, 403, 404, 410, 413, 500]) {
    assert.equal(json(status, {}).headers['cache-control'], 'no-store',
      `status ${status} lost no-store`);
  }
});

test('a caller cannot mutate the shared header set', () => {
  assert.throws(() => { SECURITY_HEADERS['x-content-type-options'] = 'off'; });
  assert.equal(json(200, {}).headers['x-content-type-options'], 'nosniff');
});

// The API Gateway endpoint is reachable from the internet, so CloudFront injects
// a secret header that the handler requires. Without this the CDN -- and every
// edge protection we might add there later -- could simply be bypassed.
test('accepts a request carrying the expected origin secret', () => {
  assert.equal(hasValidOriginSecret({ 'x-share-origin-secret': 'sekret' }, 'sekret'), true);
});

test('rejects a missing, wrong, or truncated origin secret', () => {
  assert.equal(hasValidOriginSecret({}, 'sekret'), false);
  assert.equal(hasValidOriginSecret({ 'x-share-origin-secret': 'wrong!' }, 'sekret'), false);
  assert.equal(hasValidOriginSecret({ 'x-share-origin-secret': 'sek' }, 'sekret'), false);
  assert.equal(hasValidOriginSecret({ 'x-share-origin-secret': '' }, 'sekret'), false);
  assert.equal(hasValidOriginSecret(undefined, 'sekret'), false);
});

test('is case-insensitive about the header name', () => {
  assert.equal(hasValidOriginSecret({ 'X-Share-Origin-Secret': 'sekret' }, 'sekret'), true);
});

test('rejects a multibyte origin secret instead of throwing', () => {
  // 'é' is one UTF-16 code unit but two UTF-8 bytes, so the string lengths
  // match while the byte lengths differ. timingSafeEqual throws RangeError on
  // unequal buffers, and a throw here would surface as a bare API Gateway 5xx
  // that breaks the deliberate 404 indistinguishability.
  assert.equal(hasValidOriginSecret({ 'x-share-origin-secret': 'sekreé' }, 'sekret'), false);
  assert.equal(hasValidOriginSecret({ 'x-share-origin-secret': 'sékret' }, 'sekret'), false);
  assert.equal(hasValidOriginSecret({ 'x-share-origin-secret': '�'.repeat(6) }, 'sekret'), false);
});

test('allows everything when no secret is configured, for local runs', () => {
  assert.equal(hasValidOriginSecret({}, ''), true);
  assert.equal(hasValidOriginSecret({}, undefined), true);
});

// The IAM policy grants GetObject on shares/* but deliberately NOT ListBucket,
// so a compromised handler cannot enumerate shares. The documented consequence
// is that S3 answers AccessDenied instead of NoSuchKey for a key that does not
// exist. Every key this handler requests is inside the granted prefix, so
// AccessDenied there means "absent", and a revoked link must render as "nothing
// here" rather than a server error.
test('treats AccessDenied as a missing object, not a failure', () => {
  assert.equal(isMissingObjectError({ name: 'AccessDenied' }), true);
  assert.equal(isMissingObjectError({ $metadata: { httpStatusCode: 403 } }), true);
});

test('treats NoSuchKey and 404 as missing', () => {
  assert.equal(isMissingObjectError({ name: 'NoSuchKey' }), true);
  assert.equal(isMissingObjectError({ $metadata: { httpStatusCode: 404 } }), true);
});

test('does not swallow genuine failures', () => {
  assert.equal(isMissingObjectError({ name: 'ThrottlingException' }), false);
  assert.equal(isMissingObjectError({ $metadata: { httpStatusCode: 500 } }), false);
  assert.equal(isMissingObjectError({ name: 'NetworkingError' }), false);
  assert.equal(isMissingObjectError(new SyntaxError('bad json')), false);
  assert.equal(isMissingObjectError(undefined), false);
});

test('routes POST /api/share to create', () => {
  assert.deepEqual(route('POST', '/api/share'), { action: 'create', id: null });
});

test('routes GET /api/share/{id} to read', () => {
  assert.deepEqual(route('GET', '/api/share/AbCdEf123456'), { action: 'read', id: 'AbCdEf123456' });
});

test('routes DELETE /api/share/{id} to revoke', () => {
  assert.deepEqual(route('DELETE', '/api/share/AbCdEf123456'), { action: 'revoke', id: 'AbCdEf123456' });
});

test('rejects a traversal attempt in the id', () => {
  assert.equal(route('GET', '/api/share/../../etc').action, 'unknown');
  assert.equal(route('GET', '/api/share/..%2F..%2Fetc').action, 'unknown');
  assert.equal(route('GET', '/api/share/AbCdEf123456/../x').action, 'unknown');
});

test('rejects unknown methods and paths', () => {
  assert.equal(route('PUT', '/api/share/AbCdEf123456').action, 'unknown');
  assert.equal(route('PATCH', '/api/share/AbCdEf123456').action, 'unknown');
  assert.equal(route('POST', '/api/share/AbCdEf123456').action, 'unknown');
  assert.equal(route('GET', '/api/share').action, 'unknown');
  assert.equal(route('GET', '/api/other').action, 'unknown');
  assert.equal(route('GET', '/').action, 'unknown');
});

test('there is no route that mutates an existing share', () => {
  // Snapshot semantics are enforced by the absence of an update route, not by
  // client discipline. If this ever passes, the spec has been violated.
  const mutating = ['PUT', 'PATCH', 'POST'].map((m) => route(m, '/api/share/AbCdEf123456').action);
  assert.deepEqual(mutating, ['unknown', 'unknown', 'unknown']);
});

test('share ids are 12 url-safe characters and do not repeat', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i += 1) {
    const id = newShareId();
    assert.match(id, /^[A-Za-z0-9_-]{12}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 500);
});

test('hashToken is stable, hex, and hides the token', () => {
  const hashed = hashToken('a-token');
  assert.equal(hashed, hashToken('a-token'));
  assert.match(hashed, /^[0-9a-f]{64}$/);
  assert.notEqual(hashed, hashToken('a-token '));
  assert.equal(hashed.includes('a-token'), false);
});

test('timingSafeEqualHex compares equal-length hex safely', () => {
  const a = hashToken('x');
  assert.equal(timingSafeEqualHex(a, a), true);
  assert.equal(timingSafeEqualHex(a, hashToken('y')), false);
  assert.equal(timingSafeEqualHex(a, 'short'), false);
  assert.equal(timingSafeEqualHex(a, undefined), false);
  assert.equal(timingSafeEqualHex(undefined, undefined), false);
  assert.equal(timingSafeEqualHex(a, null), false);
});
