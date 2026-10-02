#!/usr/bin/env bash
# Operator-only: provision original-expiry cleanup, then enable authenticated PUT.
# Requires separate deployment authorization. --dry-run makes no AWS calls.
set -euo pipefail

DRY_RUN=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  '') ;;
  *) echo 'Usage: provision-updates.sh [--dry-run]' >&2; exit 1 ;;
esac
BUCKET="${SHARES_BUCKET:-scratchpad-shares}"
REGION="${AWS_REGION:-us-east-1}"
TOPIC="${CLEANUP_ALARM_TOPIC_ARN:-}"
FUNCTION_NAME=scratchpad-share-cleanup
API_FUNCTION=scratchpad-share-api
ROLE_NAME=scratchpad-share-cleanup-role
RULE_NAME=scratchpad-share-cleanup-hourly
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_TEMP="$(mktemp -d)"
PROBE_ACTIVE=0

finish() {
  local status=$?
  trap - EXIT
  if [ "$PROBE_ACTIVE" -eq 1 ]; then
    if ! aws events put-rule --region "$REGION" --name "$RULE_NAME" \
      --schedule-expression 'rate(1 hour)' --state ENABLED >/dev/null; then
      echo 'Could not restore the hourly cleanup schedule; PUT remains disabled.' >&2
      status=1
    fi
  fi
  rm -rf "$TASK_TEMP"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'DRY-RUN:'; printf ' %s' "$@"; printf '\n'
  else
    "$@"
  fi
}

set_updates() {
  local enabled=$1
  if [ "$DRY_RUN" -eq 0 ]; then
    aws lambda get-function-configuration --region "$REGION" --function-name "$API_FUNCTION" \
      --query Environment.Variables --output json > "$TASK_TEMP/env.json"
    python3 - "$TASK_TEMP/env.json" "$TASK_TEMP/updates.json" "$enabled" <<'PY'
import json,sys
with open(sys.argv[1]) as source: env = json.load(source) or {}
if sys.argv[3] == 'true' and not env.get('SHARE_ORIGIN_SECRET'):
    raise SystemExit('API origin secret missing; refusing to enable PUT')
env['SHARE_UPDATES_ENABLED'] = sys.argv[3]
with open(sys.argv[2], 'w') as target: json.dump({'Variables': env}, target)
PY
  else
    echo "DRY-RUN: preserve current API environment and set SHARE_UPDATES_ENABLED=$enabled."
  fi
  run aws lambda update-function-configuration --region "$REGION" --function-name "$API_FUNCTION" \
    --environment "file://$TASK_TEMP/updates.json"
  run aws lambda wait function-updated-v2 --region "$REGION" --function-name "$API_FUNCTION"
}

permission_state() {
  if ! aws lambda get-policy --region "$REGION" --function-name "$FUNCTION_NAME" \
    --query Policy --output text > "$TASK_TEMP/permission.json" 2> "$TASK_TEMP/permission-error"; then
    if ! grep -q ResourceNotFoundException "$TASK_TEMP/permission-error"; then
      cat "$TASK_TEMP/permission-error" >&2
      return 1
    fi
    printf '{"Statement":[]}' > "$TASK_TEMP/permission.json"
  fi
  python3 - "$TASK_TEMP/permission.json" "$FUNCTION_ARN" "$RULE_ARN" <<'PY'
import json,sys
with open(sys.argv[1]) as source: statements = json.load(source)['Statement']
matches = [s for s in statements if s.get('Sid') == 'HourlyCleanup']
if not matches:
    print('missing')
else:
    s = matches[0]
    condition = s.get('Condition', {})
    source = condition.get('ArnLike', condition.get('ArnEquals', {}))
    valid = (len(matches) == 1 and s.get('Effect') == 'Allow'
        and s.get('Principal') == {'Service': 'events.amazonaws.com'}
        and s.get('Action') == 'lambda:InvokeFunction' and s.get('Resource') == sys.argv[2]
        and source == {'AWS:SourceArn': sys.argv[3]})
    print('valid' if valid else 'replace')
PY
}

if [ "$DRY_RUN" -eq 0 ]; then
  : "${CLEANUP_ALARM_TOPIC_ARN:?Set an existing SNS topic ARN for cleanup alarms}"
  VERSIONING="$(aws s3api get-bucket-versioning --bucket "$BUCKET" --region "$REGION" --query Status --output text)"
  if [ "$VERSIONING" != None ]; then
    echo 'Refusing updates: shares bucket must never have had versioning enabled.' >&2
    exit 1
  fi
  ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
else
  ACCOUNT='<account>'
  TOPIC="${TOPIC:-<existing SNS topic ARN>}"
fi
ROLE_ARN="arn:aws:iam::$ACCOUNT:role/$ROLE_NAME"
FUNCTION_ARN="arn:aws:lambda:$REGION:$ACCOUNT:function:$FUNCTION_NAME"
RULE_ARN="arn:aws:events:$REGION:$ACCOUNT:rule/$RULE_NAME"

# A rerun must fail closed even when updates were enabled by an earlier rollout.
set_updates false

cat > "$TASK_TEMP/trust.json" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
cat > "$TASK_TEMP/policy.json" <<JSON
{"Version":"2012-10-17","Statement":[
{"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::$BUCKET","Condition":{"StringEquals":{"s3:prefix":"shares/"}}},
{"Effect":"Allow","Action":["s3:GetObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::$BUCKET/shares/*"}]}
JSON

if [ "$DRY_RUN" -eq 1 ] || ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  run aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "file://$TASK_TEMP/trust.json"
fi
run aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
run aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name share-expiry-cleanup --policy-document "file://$TASK_TEMP/policy.json"
(cd "$HERE/lambda" && zip -q "$TASK_TEMP/cleanup.zip" cleanup.mjs s3-store.mjs)
if [ "$DRY_RUN" -eq 1 ] || ! aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  [ "$DRY_RUN" -eq 1 ] || sleep 10
  run aws lambda create-function --region "$REGION" --function-name "$FUNCTION_NAME" \
    --runtime nodejs22.x --handler cleanup.handler --role "$ROLE_ARN" --timeout 300 --memory-size 256 \
    --zip-file "fileb://$TASK_TEMP/cleanup.zip" --environment "Variables={SHARES_BUCKET=$BUCKET}"
else
  run aws lambda update-function-code --region "$REGION" --function-name "$FUNCTION_NAME" --zip-file "fileb://$TASK_TEMP/cleanup.zip"
fi
run aws lambda wait function-updated-v2 --region "$REGION" --function-name "$FUNCTION_NAME"
run aws lambda update-function-configuration --region "$REGION" --function-name "$FUNCTION_NAME" \
  --runtime nodejs22.x --role "$ROLE_ARN" --timeout 300 --memory-size 256 --environment "Variables={SHARES_BUCKET=$BUCKET}"
run aws lambda wait function-updated-v2 --region "$REGION" --function-name "$FUNCTION_NAME"
run aws lambda put-function-concurrency --region "$REGION" --function-name "$FUNCTION_NAME" --reserved-concurrent-executions 1
run aws events put-rule --region "$REGION" --name "$RULE_NAME" --schedule-expression 'rate(1 hour)' --state ENABLED
if [ "$DRY_RUN" -eq 1 ]; then
  echo 'DRY-RUN: validate the complete hourly EventBridge invocation permission and repair it if needed.'
  PERMISSION_STATE=missing
else
  PERMISSION_STATE="$(permission_state)"
fi
if [ "$PERMISSION_STATE" = replace ]; then
  run aws lambda remove-permission --region "$REGION" --function-name "$FUNCTION_NAME" --statement-id HourlyCleanup
fi
if [ "$PERMISSION_STATE" != valid ]; then
  run aws lambda add-permission --region "$REGION" --function-name "$FUNCTION_NAME" --statement-id HourlyCleanup \
    --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN"
fi
if [ "$DRY_RUN" -eq 0 ] && [ "$(permission_state)" != valid ]; then
  echo 'Hourly cleanup invocation permission could not be verified; PUT remains disabled.' >&2
  exit 1
fi
if [ "$DRY_RUN" -eq 1 ]; then
  run aws events put-targets --region "$REGION" --rule "$RULE_NAME" --targets "Id=cleanup,Arn=$FUNCTION_ARN"
else
  FAILED_TARGETS="$(aws events put-targets --region "$REGION" --rule "$RULE_NAME" \
    --targets "Id=cleanup,Arn=$FUNCTION_ARN" --query FailedEntryCount --output text)"
  [ "$FAILED_TARGETS" = 0 ] || { echo 'Cleanup schedule registration failed; refusing to enable PUT.' >&2; exit 1; }
fi
for METRIC in Errors Invocations; do
  OPERATOR=GreaterThanOrEqualToThreshold; THRESHOLD=1; PERIOD=3600; MISSING=notBreaching
  if [ "$METRIC" = Invocations ]; then OPERATOR=LessThanThreshold; PERIOD=7200; MISSING=breaching; fi
  run aws cloudwatch put-metric-alarm --region "$REGION" --alarm-name "$FUNCTION_NAME-$METRIC" \
    --namespace AWS/Lambda --metric-name "$METRIC" --dimensions "Name=FunctionName,Value=$FUNCTION_NAME" \
    --statistic Sum --period "$PERIOD" --evaluation-periods 1 --threshold "$THRESHOLD" \
    --comparison-operator "$OPERATOR" --treat-missing-data "$MISSING" --alarm-actions "$TOPIC"
done

# Exercise the actual hourly rule, Lambda role, and conditional S3 deletion.
# The opaque canary is already expired and contains no note or encryption key.
if [ "$DRY_RUN" -eq 0 ]; then
  CANARY_ID="$(python3 - "$TASK_TEMP/canary.json" <<'PY'
import base64,json,secrets,sys,time
canary = {'v': 1, 'ciphertext': base64.b64encode(secrets.token_bytes(32)).decode(),
    'iv': base64.b64encode(secrets.token_bytes(12)).decode(), 'ttlDays': 7,
    'expiresAt': int(time.time() * 1000) - 60000, 'revokeHash': secrets.token_hex(32)}
with open(sys.argv[1], 'w') as target: json.dump(canary, target)
print(secrets.token_urlsafe(9))
PY
  )"
  CANARY_KEY="shares/$CANARY_ID.json"
  aws s3api put-object --region "$REGION" --bucket "$BUCKET" --key "$CANARY_KEY" \
    --body "$TASK_TEMP/canary.json" --content-type application/json --tagging 'ttl-days=7' --if-none-match '*' >/dev/null
  aws s3api head-object --region "$REGION" --bucket "$BUCKET" --key "$CANARY_KEY" >/dev/null
  # Mark active first so failures or interruptions also restore the normal rate.
  PROBE_ACTIVE=1
  aws events put-rule --region "$REGION" --name "$RULE_NAME" \
    --schedule-expression 'rate(1 minute)' --state ENABLED >/dev/null
  DELETED=0
  for ATTEMPT in $(seq 1 48); do
    sleep 5
    if aws s3api head-object --region "$REGION" --bucket "$BUCKET" --key "$CANARY_KEY" \
      >/dev/null 2> "$TASK_TEMP/head-error"; then
      continue
    fi
    if grep -Eq '\(404\)|\(NoSuchKey\)|\(NotFound\)' "$TASK_TEMP/head-error"; then
      DELETED=1
      break
    fi
    cat "$TASK_TEMP/head-error" >&2
    exit 1
  done
  [ "$DELETED" -eq 1 ] || { echo 'Scheduled cleanup did not delete the expired canary; PUT remains disabled.' >&2; exit 1; }
  aws events put-rule --region "$REGION" --name "$RULE_NAME" \
    --schedule-expression 'rate(1 hour)' --state ENABLED >/dev/null
  aws events describe-rule --region "$REGION" --name "$RULE_NAME" > "$TASK_TEMP/rule.json"
  python3 - "$TASK_TEMP/rule.json" "$RULE_ARN" <<'PY'
import json,sys
with open(sys.argv[1]) as source: rule = json.load(source)
if (rule.get('Arn') != sys.argv[2] or rule.get('State') != 'ENABLED'
    or rule.get('ScheduleExpression') != 'rate(1 hour)'):
    raise SystemExit('Hourly cleanup schedule could not be verified; PUT remains disabled')
PY
  PROBE_ACTIVE=0
else
  echo 'DRY-RUN: create an expired opaque canary, confirm it exists, and temporarily use rate(1 minute).'
  echo 'DRY-RUN: require scheduled deletion within four minutes; restore and verify rate(1 hour).'
fi
set_updates true
