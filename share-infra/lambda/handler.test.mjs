import test from 'node:test';
import assert from 'node:assert/strict';
import {
  route, newShareId, hashToken, timingSafeEqualHex, isMissingObjectError, hasValidOriginSecret,
} from './handler.mjs';

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
