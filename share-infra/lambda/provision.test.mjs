// Offline rollout-gate checks. The fake CLI cannot reach AWS or use credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function runProvision(failedTargets, versioning = 'None') {
  const directory = mkdtempSync(join(tmpdir(), 'share-rollout-test-'));
  const log = join(directory, 'calls');
  writeFileSync(
    join(directory, 'aws'),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$TEST_CALL_LOG"
case "$1 $2" in
  's3api get-bucket-versioning') echo "$TEST_VERSIONING" ;;
  'sts get-caller-identity') echo 000000000000 ;;
  'lambda get-policy') echo '{"Statement":[{"Sid":"HourlyCleanup"}]}' ;;
  'events put-targets') echo "$TEST_FAILED_TARGETS" ;;
  'lambda invoke') echo None ;;
  'lambda get-function-configuration') echo '{"SHARE_ORIGIN_SECRET":"synthetic-test-only"}' ;;
esac
`,
    { mode: 0o700 },
  );
  const result = spawnSync('bash', ['share-infra/provision-updates.sh'], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: directory + ':' + process.env.PATH,
      CLEANUP_ALARM_TOPIC_ARN: 'arn:aws:sns:us-east-1:000000000000:test-only',
      TEST_CALL_LOG: log,
      TEST_VERSIONING: versioning,
      TEST_FAILED_TARGETS: String(failedTargets),
    },
  });
  const calls = readFileSync(log, 'utf8');
  rmSync(directory, { recursive: true, force: true });
  return { ...result, calls };
}

test('failed schedule registration cannot enable public updates', () => {
  const result = runProvision(1);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schedule/);
  assert.doesNotMatch(result.calls, /lambda invoke/);
  assert.doesNotMatch(result.calls, /update-function-configuration.*scratchpad-share-api/);
});

test('versioned buckets are refused before infrastructure mutations', () => {
  for (const state of ['Enabled', 'Suspended']) {
    const result = runProvision(0, state);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.calls, /put-role-policy|create-function|update-function/);
  }
});

test('successful cleanup and scheduling precede the API enablement', () => {
  const result = runProvision(0);
  assert.equal(result.status, 0, result.stderr);
  const invocation = result.calls.indexOf('lambda invoke');
  const enablement = result.calls.indexOf(
    'lambda update-function-configuration --region us-east-1 --function-name scratchpad-share-api',
  );
  assert.ok(invocation > result.calls.indexOf('events put-targets'));
  assert.ok(enablement > invocation);
});
