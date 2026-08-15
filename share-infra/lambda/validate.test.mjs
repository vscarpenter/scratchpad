import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShareBody, isValidShareId, MAX_BODY_BYTES, SHARE_TTL_DAYS, DEFAULT_TTL_DAYS } from './validate.mjs';

const iv = Buffer.alloc(12, 7).toString('base64');
const ciphertext = Buffer.from('some ciphertext bytes').toString('base64');
const good = JSON.stringify({ v: 1, ciphertext, iv });

test('accepts a well-formed body', () => {
  const result = parseShareBody(good);
  assert.equal(result.ok, true);
  assert.equal(result.value.iv, iv);
  assert.equal(result.value.ciphertext, ciphertext);
  assert.equal(result.value.v, 1);
});

test('rejects a body over the size cap with 413', () => {
  const oversized = JSON.stringify({ v: 1, ciphertext: 'A'.repeat(MAX_BODY_BYTES), iv });
  const result = parseShareBody(oversized);
  assert.equal(result.ok, false);
  assert.equal(result.status, 413);
});

test('rejects malformed JSON with 400', () => {
  assert.equal(parseShareBody('{not json').status, 400);
});

test('rejects a missing body with 400', () => {
  assert.equal(parseShareBody(undefined).status, 400);
  assert.equal(parseShareBody('').status, 400);
  assert.equal(parseShareBody(null).status, 400);
});

test('rejects a non-object body', () => {
  assert.equal(parseShareBody('"a string"').status, 400);
  assert.equal(parseShareBody('42').status, 400);
  assert.equal(parseShareBody('null').status, 400);
});

test('rejects a wrong envelope version', () => {
  assert.equal(parseShareBody(JSON.stringify({ v: 2, ciphertext, iv })).status, 400);
  assert.equal(parseShareBody(JSON.stringify({ ciphertext, iv })).status, 400);
});

test('rejects a missing or non-string field', () => {
  assert.equal(parseShareBody(JSON.stringify({ v: 1, iv })).status, 400);
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext })).status, 400);
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext, iv: 5 })).status, 400);
});

test('rejects an IV that is not exactly 12 bytes', () => {
  const shortIv = Buffer.alloc(8, 1).toString('base64');
  const longIv = Buffer.alloc(16, 1).toString('base64');
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext, iv: shortIv })).status, 400);
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext, iv: longIv })).status, 400);
});

test('rejects ciphertext that is not valid base64', () => {
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext: '!!!not base64!!!', iv })).status, 400);
});

test('rejects empty ciphertext', () => {
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext: '', iv })).status, 400);
});

test('ignores a client-supplied expiresAt entirely', () => {
  const withExpiry = JSON.stringify({ v: 1, ciphertext, iv, expiresAt: 4102444800000 });
  const result = parseShareBody(withExpiry);
  assert.equal(result.ok, true);
  assert.equal('expiresAt' in result.value, false);
});

test('drops any unexpected field rather than persisting it', () => {
  const extra = JSON.stringify({ v: 1, ciphertext, iv, revokeHash: 'attacker-supplied', note: 'plaintext' });
  const result = parseShareBody(extra);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value).sort(), ['ciphertext', 'iv', 'v']);
});

test('the TTL menu is exactly 7, 14, 21, 30 days with a 7-day default', () => {
  assert.deepEqual([...SHARE_TTL_DAYS], [7, 14, 21, 30]);
  assert.equal(DEFAULT_TTL_DAYS, 7);
});

test('defaults to seven days when expiresDays is absent', () => {
  const result = parseShareBody(good);
  assert.equal(result.ok, true);
  assert.equal(result.ttlDays, 7);
});

test('accepts each duration on the menu', () => {
  for (const days of [7, 14, 21, 30]) {
    const result = parseShareBody(JSON.stringify({ v: 1, ciphertext, iv, expiresDays: days }));
    assert.equal(result.ok, true, `rejected ${days}`);
    assert.equal(result.ttlDays, days);
  }
});

test('rejects durations off the menu with a 400', () => {
  for (const days of [0, 1, 8, -7, 31, 365, 6.9]) {
    const result = parseShareBody(JSON.stringify({ v: 1, ciphertext, iv, expiresDays: days }));
    assert.equal(result.ok, false, `accepted ${days}`);
    assert.equal(result.status, 400);
  }
});

test('rejects non-numeric expiresDays with a 400', () => {
  for (const bad of ['14', null, true, [7], { days: 7 }]) {
    const result = parseShareBody(JSON.stringify({ v: 1, ciphertext, iv, expiresDays: bad }));
    assert.equal(result.ok, false, `accepted ${JSON.stringify(bad)}`);
    assert.equal(result.status, 400);
  }
});

test('expiresDays is consumed by validation, never persisted', () => {
  const result = parseShareBody(JSON.stringify({ v: 1, ciphertext, iv, expiresDays: 14 }));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value).sort(), ['ciphertext', 'iv', 'v']);
});

test('validates share id shape', () => {
  assert.equal(isValidShareId('AbCdEf123456'), true);
  assert.equal(isValidShareId('with-dash_ok'), true);
  assert.equal(isValidShareId('tooshort'), false);
  assert.equal(isValidShareId('waytoolongforanid'), false);
  assert.equal(isValidShareId('../../../etc/'), false);
  assert.equal(isValidShareId('has/slash123'), false);
  assert.equal(isValidShareId('has.dot12345'), false);
  assert.equal(isValidShareId(''), false);
  assert.equal(isValidShareId(undefined), false);
  assert.equal(isValidShareId(null), false);
});
