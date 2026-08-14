#!/usr/bin/env bash
# Provision the Scratchpad share API: private bucket, lifecycle, execution role,
# Lambda, and an API Gateway HTTP API. Idempotent -- safe to re-run; existing
# resources are reported and skipped.
#
# Operator-only. This directory is never deployed to S3; see CLAUDE.md.
#
# Topology note: CloudFront reaches the Lambda through an API Gateway HTTP API,
# NOT a Lambda function URL. Anonymous function URLs are refused in this AWS
# account, and fronting one with CloudFront OAC would require the browser to
# send a SigV4 payload hash on every upload. The HTTP API needs neither.
#
# Because the API Gateway endpoint is reachable from the internet, CloudFront
# injects a secret header (x-share-origin-secret) that the handler requires, so
# the CDN cannot be bypassed. This script generates that secret on first run and
# reuses whatever the function already has on later runs.
#
# Usage:
#   bash share-infra/provision.sh --dry-run   # preview, mutates nothing
#   bash share-infra/provision.sh             # apply
set -euo pipefail

BUCKET="${SHARES_BUCKET:-scratchpad-shares}"
REGION="${AWS_REGION:-us-east-1}"
ROLE_NAME="scratchpad-share-lambda-role"
FUNCTION_NAME="scratchpad-share-api"
POLICY_NAME="scratchpad-share-s3-access"
API_NAME="scratchpad-share-api"

# Runtime is set on create AND on every update, so a re-run of this script
# cannot leave the function on a deprecated runtime. Check the deprecation
# schedule before bumping: nodejs20.x reached end of support 2026-04-30.
RUNTIME="nodejs22.x"

# POST /api/share is unauthenticated. Reserved concurrency caps what a flood can
# take from the account-wide pool this function shares with every other Lambda.
RESERVED_CONCURRENCY=25
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "DRY-RUN: $*"
  else
    "$@"
  fi
}

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI not found." >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "ERROR: zip not found." >&2
  exit 1
fi

echo "Bucket:   $BUCKET"
echo "Region:   $REGION"
echo "Role:     $ROLE_NAME"
echo "Function: $FUNCTION_NAME"
[ "$DRY_RUN" -eq 1 ] && echo "(dry run -- nothing will be created or changed)"
echo

# ---------------------------------------------------------------- 1. Bucket
echo "== Bucket =="
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "Bucket $BUCKET already exists, skipping create."
else
  if [ "$REGION" = "us-east-1" ]; then
    run aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    run aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION"
  fi
fi

# Block Public Access is the whole security model of this bucket: the Lambda is
# the only path to share data. Re-applied on every run so a console edit that
# loosens it gets corrected the next time this script is run.
run aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

run aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

run aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration "file://$HERE/lifecycle.json"

# ------------------------------------------------------------------ 2. Role
echo
echo "== Execution role =="
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "Role $ROLE_NAME already exists, skipping create."
else
  run aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  run aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "Waiting 10s for role propagation before Lambda creation..."
  [ "$DRY_RUN" -eq 1 ] || sleep 10
fi

# Names only the shares prefix. The handler has no permission that can touch the
# site bucket, so a bug in it cannot damage notes.vinny.dev.
run aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "file://$HERE/iam-policy.json"

# -------------------------------------------------------------- 3. Function
echo
echo "== Function =="
ZIP_DIR="$(mktemp -d)"
ZIP="$ZIP_DIR/share-api.zip"
(cd "$HERE/lambda" && zip -q -r "$ZIP" handler.mjs validate.mjs)
echo "Packaged handler.mjs + validate.mjs -> $ZIP"

# Reuse the existing origin secret if there is one, so re-running this script
# never silently invalidates the header CloudFront is already sending.
SECRET="$(aws lambda get-function-configuration --function-name "$FUNCTION_NAME" \
  --query 'Environment.Variables.SHARE_ORIGIN_SECRET' --output text 2>/dev/null || echo '')"
if [ -z "$SECRET" ] || [ "$SECRET" = "None" ]; then
  SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '\n=' | tr '+/' '-_')"
  NEW_SECRET=1
else
  NEW_SECRET=0
fi

if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  echo "Function exists, updating code."
  run aws lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file "fileb://$ZIP"
else
  ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || echo 'ROLE_ARN_PENDING')"
  run aws lambda create-function --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" --role "$ROLE_ARN" --handler handler.handler \
    --timeout 10 --memory-size 256 --zip-file "fileb://$ZIP" \
    --environment "Variables={SHARES_BUCKET=$BUCKET,SHARE_ORIGIN_SECRET=$SECRET}"
fi

[ "$DRY_RUN" -eq 1 ] || aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"
run aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
  --runtime "$RUNTIME" \
  --environment "Variables={SHARES_BUCKET=$BUCKET,SHARE_ORIGIN_SECRET=$SECRET}"

[ "$DRY_RUN" -eq 1 ] || aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"
run aws lambda put-function-concurrency --function-name "$FUNCTION_NAME" \
  --reserved-concurrent-executions "$RESERVED_CONCURRENCY"

rm -rf "$ZIP_DIR"

# ------------------------------------------------------- 4. API Gateway HTTP API
echo
echo "== HTTP API =="
API_ID="$(aws apigatewayv2 get-apis --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text 2>/dev/null || echo 'None')"
if [ "$API_ID" = "None" ] || [ -z "$API_ID" ]; then
  LAMBDA_ARN="$(aws lambda get-function --function-name "$FUNCTION_NAME" --query 'Configuration.FunctionArn' --output text 2>/dev/null || echo 'PENDING')"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "DRY-RUN: aws apigatewayv2 create-api --name $API_NAME --protocol-type HTTP --target $LAMBDA_ARN"
    API_ID="<new-api-id>"
  else
    API_ID="$(aws apigatewayv2 create-api --name "$API_NAME" --protocol-type HTTP \
      --target "$LAMBDA_ARN" --query 'ApiId' --output text)"
    aws lambda add-permission --function-name "$FUNCTION_NAME" \
      --statement-id AllowApiGatewayInvoke --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "arn:aws:execute-api:$REGION:$(aws sts get-caller-identity --query Account --output text):$API_ID/*/*" \
      >/dev/null
  fi
else
  echo "HTTP API exists: $API_ID"
fi

echo
echo "== Summary =="
echo "Origin domain:  $API_ID.execute-api.$REGION.amazonaws.com"
if [ "$NEW_SECRET" -eq 1 ]; then
  echo "Origin secret:  $SECRET   <-- NEW; set this as the CloudFront custom"
  echo "                origin header x-share-origin-secret on the share origin."
else
  echo "Origin secret:  (unchanged; CloudFront already has it)"
fi
echo
echo "Next: point the CloudFront /api/share* origin at the domain above and set"
echo "the x-share-origin-secret custom header. See share-infra/README.md, step 4."
