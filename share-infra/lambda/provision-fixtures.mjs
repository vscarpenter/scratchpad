// Offline CLI fixture: every AWS call is intercepted inside a temporary directory.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FUNCTION_ARN = 'arn:aws:lambda:us-east-1:000000000000:function:scratchpad-share-cleanup';
export const RULE_ARN = 'arn:aws:events:us-east-1:000000000000:rule/scratchpad-share-cleanup-hourly';
export const PERMISSION = {
  Sid: 'HourlyCleanup',
  Effect: 'Allow',
  Principal: { Service: 'events.amazonaws.com' },
  Action: 'lambda:InvokeFunction',
  Resource: FUNCTION_ARN,
  Condition: { ArnLike: { 'AWS:SourceArn': RULE_ARN } },
};

const FAKE_AWS = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const scenario = JSON.parse(process.env.TEST_SCENARIO);
const state = fs.existsSync(process.env.TEST_STATE)
  ? JSON.parse(fs.readFileSync(process.env.TEST_STATE, 'utf8'))
  : { policy: scenario.policy, probe: false };
const save = () => fs.writeFileSync(process.env.TEST_STATE, JSON.stringify(state));
const output = (value) => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
const fail = (message) => { process.stderr.write(message); process.exit(1); };
fs.appendFileSync(process.env.TEST_CALL_LOG, args.join(' ') + '\n');
switch (args[0] + ' ' + args[1]) {
  case 's3api get-bucket-versioning': output(scenario.versioning); break;
  case 'sts get-caller-identity': output('000000000000'); break;
  case 'lambda get-policy':
    if (!state.policy) fail('ResourceNotFoundException');
    output({ Statement: [state.policy] }); break;
  case 'lambda remove-permission': state.policy = null; save(); break;
  case 'lambda add-permission': state.policy = scenario.repairedPolicy; save(); break;
  case 'events put-rule': state.rate = option('--schedule-expression'); save(); break;
  case 'events put-targets': output(String(scenario.failedTargets)); break;
  case 'events describe-rule':
    output({ Arn: scenario.ruleArn, State: 'ENABLED',
      ScheduleExpression: scenario.badFinalSchedule ? 'rate(2 hours)' : state.rate }); break;
  case 's3api put-object': {
    const probe = JSON.parse(fs.readFileSync(option('--body'), 'utf8'));
    if (probe.expiresAt >= Date.now() || !/^shares\/[\w-]{12}\.json$/.test(option('--key'))
      || option('--tagging') !== 'ttl-days=7' || option('--if-none-match') !== '*')
      fail('Invalid expiry canary');
    state.probe = true; save(); output({ ETag: '"probe-etag"' }); break;
  }
  case 's3api head-object':
    if (scenario.headDenied) fail('An error occurred (403) when calling HeadObject: Forbidden');
    if (state.rate === 'rate(1 minute)' && scenario.deleteWorks) { state.probe = false; save(); }
    if (!state.probe && scenario.headDeniedAfterDeletion) fail('An error occurred (403) when calling HeadObject: Forbidden');
    if (!state.probe) fail('An error occurred (404) when calling HeadObject: Not Found');
    output('"probe-etag"'); break;
  case 'lambda get-function-configuration':
    output({ SHARE_ORIGIN_SECRET: 'synthetic-test-only', KEEP_ME: 'retained', SHARE_UPDATES_ENABLED: 'true' }); break;
  case 'lambda update-function-configuration':
    if (option('--function-name') === 'scratchpad-share-api') {
      const env = JSON.parse(fs.readFileSync(option('--environment').slice(7), 'utf8')).Variables;
      if (env.SHARE_ORIGIN_SECRET !== 'synthetic-test-only' || env.KEEP_ME !== 'retained') fail('Lost API configuration');
      fs.appendFileSync(process.env.TEST_CALL_LOG, 'UPDATES=' + env.SHARE_UPDATES_ENABLED + '\n');
    }
    break;
  case 'lambda invoke': output('None'); break;
}
`;

export function runProvision(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'share-rollout-test-'));
  const log = join(directory, 'calls');
  const scenario = {
    versioning: 'None',
    failedTargets: 0,
    policy: PERMISSION,
    repairedPolicy: PERMISSION,
    deleteWorks: true,
    ruleArn: RULE_ARN,
    ...overrides,
  };
  writeFileSync(join(directory, 'aws'), FAKE_AWS, { mode: 0o700 });
  writeFileSync(join(directory, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const result = spawnSync('bash', ['share-infra/provision-updates.sh'], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      PATH: directory + ':' + process.env.PATH,
      CLEANUP_ALARM_TOPIC_ARN: 'arn:aws:sns:us-east-1:000000000000:test-only',
      TEST_CALL_LOG: log,
      TEST_STATE: join(directory, 'state'),
      TEST_SCENARIO: JSON.stringify(scenario),
    },
  });
  const calls = readFileSync(log, 'utf8');
  rmSync(directory, { recursive: true, force: true });
  return { ...result, calls };
}
