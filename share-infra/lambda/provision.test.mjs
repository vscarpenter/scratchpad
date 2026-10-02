// Offline rollout-gate checks. The fake CLI cannot reach AWS or use credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSION, runProvision } from './provision-fixtures.mjs';

test('failed schedule registration cannot enable public updates', () => {
  const result = runProvision({ failedTargets: 1 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schedule/);
  assert.doesNotMatch(result.calls, /lambda invoke/);
  assert.match(result.calls, /UPDATES=false/);
  assert.doesNotMatch(result.calls, /UPDATES=true/);
});

test('versioned buckets are refused before infrastructure mutations', () => {
  for (const state of ['Enabled', 'Suspended']) {
    const result = runProvision({ versioning: state });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.calls, /put-role-policy|create-function|update-function/);
  }
});

test('scheduled deletion and restored hourly schedule precede API enablement', () => {
  const result = runProvision();
  assert.equal(result.status, 0, result.stderr);
  const canary = result.calls.indexOf('s3api put-object');
  const probeSchedule = result.calls.indexOf('rate(1 minute)');
  const restored = result.calls.lastIndexOf('rate(1 hour)');
  assert.ok(canary > result.calls.indexOf('events put-targets'));
  assert.ok(probeSchedule > canary);
  assert.ok(restored > probeSchedule);
  assert.ok(result.calls.indexOf('UPDATES=true') > result.calls.indexOf('events describe-rule'));
  assert.doesNotMatch(result.calls, /lambda invoke/);
});

test('successful empty invocation cannot substitute for scheduled deletion', () => {
  const result = runProvision({ deleteWorks: false });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scheduled cleanup/i);
  assert.match(result.calls, /UPDATES=false/);
  assert.doesNotMatch(result.calls, /UPDATES=true/);
  assert.ok(result.calls.lastIndexOf('rate(1 hour)') > result.calls.indexOf('rate(1 minute)'));
});

for (const [field, value] of Object.entries({
  Effect: 'Deny',
  Principal: { Service: 's3.amazonaws.com' },
  Action: 'lambda:GetFunction',
  Resource: 'arn:aws:lambda:us-east-1:000000000000:function:other',
  Condition: { ArnLike: { 'AWS:SourceArn': 'arn:aws:events:us-east-1:000000000000:rule:other' } },
})) {
  test(`same permission Sid with incorrect ${field} is replaced and verified`, () => {
    const result = runProvision({ policy: { ...PERMISSION, [field]: value } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.calls, /lambda remove-permission/);
    assert.match(result.calls, /lambda add-permission/);
    assert.match(result.calls, /UPDATES=true/);
  });
}

test('unverified permission repair cannot enable updates', () => {
  const invalid = { Sid: 'HourlyCleanup' };
  const result = runProvision({ policy: invalid, repairedPolicy: invalid });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.calls, /UPDATES=true|s3api put-object/);
});

test('absent scheduling permission is added and verified', () => {
  const result = runProvision({ policy: null });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /lambda add-permission/);
  assert.doesNotMatch(result.calls, /lambda remove-permission/);
});

test('head-object access errors cannot prove deletion', () => {
  const result = runProvision({ headDenied: true });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.calls, /UPDATES=true/);
});

test('a 403 after scheduled deletion cannot be mistaken for verified absence', () => {
  const result = runProvision({ headDeniedAfterDeletion: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /403/);
  assert.match(result.calls, /UPDATES=false/);
  assert.doesNotMatch(result.calls, /UPDATES=true/);
  assert.ok(result.calls.lastIndexOf('rate(1 hour)') > result.calls.indexOf('rate(1 minute)'));
});

test('incorrect final schedule cannot enable updates', () => {
  const result = runProvision({ badFinalSchedule: true });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.calls, /UPDATES=true/);
});
