#!/usr/bin/env bash
# Scratchpad deploy: sync to S3, invalidate CloudFront.
# Reads S3_BUCKET and CLOUDFRONT_DISTRIBUTION_ID from .env.local.

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- args ----------
DRY=""
for arg in "$@"; do
  case "$arg" in
    -n|--dry-run) DRY="--dryrun" ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./deploy.sh [--dry-run]

Deploys Scratchpad:
  1. Syncs public/ to s3://$S3_BUCKET/public/ with a 5-minute cache.
  2. Uploads index.html and privacy.html with a 60-second cache.
  3. Creates a CloudFront invalidation for "/", "/index.html", "/privacy.html".

Required variables (in .env.local):
  S3_BUCKET                   bucket name, no "s3://" prefix
  CLOUDFRONT_DISTRIBUTION_ID  distribution to invalidate

Optional variables:
  AWS_PROFILE, AWS_REGION     forwarded to the aws CLI

Flags:
  -n, --dry-run    print actions without changing anything
  -h, --help       show this message
USAGE
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 2
      ;;
  esac
done

# ---------- env ----------
if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found in $SCRIPT_DIR" >&2
  echo "Copy .env.local.example to .env.local and fill in your bucket + distribution." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

: "${S3_BUCKET:?S3_BUCKET is not set in .env.local}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?CLOUDFRONT_DISTRIBUTION_ID is not set in .env.local}"

# ---------- preflight ----------
if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI not found." >&2
  echo "Install it: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" >&2
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: AWS credentials are not working." >&2
  echo "Check 'aws configure', AWS_PROFILE, or SSO login state." >&2
  exit 1
fi

echo "Scratchpad deploy"
echo "  bucket:       s3://$S3_BUCKET"
echo "  distribution: $CLOUDFRONT_DISTRIBUTION_ID"
[ -n "$DRY" ] && echo "  mode:         DRY RUN (no changes)"
echo

# ---------- 1. assets first (CSS, JS, vendor) ----------
# Assets are uploaded before HTML so that the moment a fresh HTML lands
# in the bucket, every asset it references already exists.
ASSET_CACHE="public, max-age=300"

echo "==> Syncing public/ (Cache-Control: $ASSET_CACHE)"
aws s3 sync public/ "s3://$S3_BUCKET/public/" \
  --cache-control "$ASSET_CACHE" \
  --exclude "*.DS_Store" \
  --exclude ".*" \
  --delete \
  $DRY
echo

# ---------- 2. HTML last (short cache, must-revalidate) ----------
HTML_CACHE="public, max-age=60, must-revalidate"

echo "==> Uploading HTML (Cache-Control: $HTML_CACHE)"
for html in index.html privacy.html; do
  if [ ! -f "$html" ]; then
    echo "WARN: $html missing, skipping" >&2
    continue
  fi
  aws s3 cp "$html" "s3://$S3_BUCKET/$html" \
    --cache-control "$HTML_CACHE" \
    --content-type "text/html; charset=utf-8" \
    $DRY
done
echo

# ---------- 3. CloudFront invalidation ----------
INVALIDATION_PATHS=("/" "/index.html" "/privacy.html")

INVALIDATION_DISPLAY=$( IFS=' '; echo "${INVALIDATION_PATHS[*]}" )

if [ -n "$DRY" ]; then
  echo "==> [dry-run] Would invalidate: $INVALIDATION_DISPLAY"
else
  echo "==> Creating CloudFront invalidation for: $INVALIDATION_DISPLAY"
  INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "${INVALIDATION_PATHS[@]}" \
    --query 'Invalidation.Id' \
    --output text)
  echo "    invalidation id: $INVALIDATION_ID"
  echo "    propagation usually completes within a few minutes."
fi
echo

echo "Done."
