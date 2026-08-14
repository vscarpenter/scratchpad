#!/usr/bin/env bash
# Provision the Scratchpad share API: private bucket, lifecycle, execution role,
# Lambda, and Function URL. Idempotent -- safe to re-run; existing resources are
# reported and skipped.
#
# Operator-only. This directory is never deployed to S3; see CLAUDE.md.
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

if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  echo "Function exists, updating code."
  run aws lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file "fileb://$ZIP"
else
  ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || echo 'ROLE_ARN_PENDING')"
  run aws lambda create-function --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x --role "$ROLE_ARN" --handler handler.handler \
    --timeout 10 --memory-size 256 --zip-file "fileb://$ZIP" \
    --environment "Variables={SHARES_BUCKET=$BUCKET}"
  run aws lambda create-function-url-config --function-name "$FUNCTION_NAME" --auth-type NONE
  run aws lambda add-permission --function-name "$FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl \
    --principal '*' --function-url-auth-type NONE
fi

run aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
  --environment "Variables={SHARES_BUCKET=$BUCKET}"

rm -rf "$ZIP_DIR"

echo
echo "== Function URL =="
if [ "$DRY_RUN" -eq 1 ]; then
  echo "DRY-RUN: aws lambda get-function-url-config --function-name $FUNCTION_NAME"
else
  aws lambda get-function-url-config --function-name "$FUNCTION_NAME" \
    --query 'FunctionUrl' --output text 2>/dev/null || echo "(pending)"
fi

echo
echo "Next: attach this Function URL as a CloudFront origin with an /api/share*"
echo "cache behavior. See share-infra/README.md, step 4."
