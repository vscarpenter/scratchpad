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
trap 'rm -rf "$TASK_TEMP"' EXIT

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'DRY-RUN:'; printf ' %s' "$@"; printf '\n'
  else
    "$@"
  fi
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
if [ "$DRY_RUN" -eq 1 ] || ! aws lambda get-policy --region "$REGION" --function-name "$FUNCTION_NAME" \
  --query Policy --output text | python3 -c 'import json,sys; sys.exit(not any(s.get("Sid")=="HourlyCleanup" for s in json.load(sys.stdin)["Statement"]))'; then
  run aws lambda add-permission --region "$REGION" --function-name "$FUNCTION_NAME" --statement-id HourlyCleanup \
    --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN"
fi
run aws events put-targets --region "$REGION" --rule "$RULE_NAME" --targets "Id=cleanup,Arn=$FUNCTION_ARN"
for METRIC in Errors Invocations; do
  OPERATOR=GreaterThanOrEqualToThreshold; THRESHOLD=1; PERIOD=3600; MISSING=notBreaching
  if [ "$METRIC" = Invocations ]; then OPERATOR=LessThanThreshold; PERIOD=7200; MISSING=breaching; fi
  run aws cloudwatch put-metric-alarm --region "$REGION" --alarm-name "$FUNCTION_NAME-$METRIC" \
    --namespace AWS/Lambda --metric-name "$METRIC" --dimensions "Name=FunctionName,Value=$FUNCTION_NAME" \
    --statistic Sum --period "$PERIOD" --evaluation-periods 1 --threshold "$THRESHOLD" \
    --comparison-operator "$OPERATOR" --treat-missing-data "$MISSING" --alarm-actions "$TOPIC"
done

# Fail closed if permissions or storage are broken. Invocation deletes only
# already-expired ciphertext; no synthetic user content or secret is submitted.
if [ "$DRY_RUN" -eq 0 ]; then
  FAILURE="$(aws lambda invoke --region "$REGION" --function-name "$FUNCTION_NAME" \
    "$TASK_TEMP/result.json" --query FunctionError --output text)"
  [ "$FAILURE" = None ] || { echo 'Cleanup smoke test failed; PUT remains disabled.' >&2; exit 1; }
  aws lambda get-function-configuration --region "$REGION" --function-name "$API_FUNCTION" \
    --query Environment.Variables --output json > "$TASK_TEMP/env.json"
  python3 - "$TASK_TEMP/env.json" "$TASK_TEMP/enable.json" <<'PY'
import json,sys
with open(sys.argv[1]) as source: env = json.load(source) or {}
if not env.get('SHARE_ORIGIN_SECRET'): raise SystemExit('API origin secret missing; refusing to enable PUT')
env['SHARE_UPDATES_ENABLED'] = 'true'
with open(sys.argv[2], 'w') as target: json.dump({'Variables': env}, target)
PY
else
  echo 'DRY-RUN: invoke cleanup and verify success; preserve API environment and enable PUT.'
fi
run aws lambda update-function-configuration --region "$REGION" --function-name "$API_FUNCTION" \
  --environment "file://$TASK_TEMP/enable.json"
run aws lambda wait function-updated-v2 --region "$REGION" --function-name "$API_FUNCTION"
