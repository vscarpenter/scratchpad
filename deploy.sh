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
  1. Updates SCRATCHPAD_BUILD_DATE in public/js/version.js to today's date.
  2. Syncs public/ to s3://$S3_BUCKET/public/ with a 5-minute cache.
  3. Re-uploads manifest and service-worker assets with explicit content headers.
  4. Uploads index.html, about.html, guide.html, privacy.html, terms.html, and service-worker.js with short caches.
  5. Creates a CloudFront invalidation for changed shell entry points.

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

# ---------- 1. release metadata ----------
VERSION_FILE="public/js/version.js"
BUILD_DATE="$(date +%F)"
BUILD_DATE_PATTERN="window\.SCRATCHPAD_BUILD_DATE = '[0-9]{4}-[0-9]{2}-[0-9]{2}';"

if [ ! -f "$VERSION_FILE" ]; then
  echo "ERROR: $VERSION_FILE not found." >&2
  exit 1
fi

if ! grep -Eq "$BUILD_DATE_PATTERN" "$VERSION_FILE"; then
  echo "ERROR: Could not find SCRATCHPAD_BUILD_DATE assignment in $VERSION_FILE" >&2
  exit 1
fi

if [ -n "$DRY" ]; then
  echo "==> [dry-run] Would update SCRATCHPAD_BUILD_DATE in $VERSION_FILE to $BUILD_DATE"
else
  echo "==> Updating SCRATCHPAD_BUILD_DATE in $VERSION_FILE to $BUILD_DATE"
  perl -0pi -e "s/$BUILD_DATE_PATTERN/window.SCRATCHPAD_BUILD_DATE = '$BUILD_DATE';/" "$VERSION_FILE"
  if ! grep -Fq "window.SCRATCHPAD_BUILD_DATE = '$BUILD_DATE';" "$VERSION_FILE"; then
    echo "ERROR: Failed to update SCRATCHPAD_BUILD_DATE in $VERSION_FILE" >&2
    exit 1
  fi
fi
echo

# ---------- 2. assets first (CSS, JS, vendor) ----------
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

# ---------- 3. Explicit app-shell asset metadata ----------
MANIFEST_CACHE="public, max-age=300, must-revalidate"
PUBLIC_WORKER_CACHE="no-cache, no-store, must-revalidate"

if [ -f public/manifest.webmanifest ]; then
  echo "==> Uploading web app manifest (Cache-Control: $MANIFEST_CACHE)"
  aws s3 cp public/manifest.webmanifest "s3://$S3_BUCKET/public/manifest.webmanifest" \
    --cache-control "$MANIFEST_CACHE" \
    --content-type "application/manifest+json; charset=utf-8" \
    $DRY
  echo
else
  echo "WARN: public/manifest.webmanifest missing, skipping" >&2
fi

if [ -f public/service-worker.js ]; then
  echo "==> Uploading public service worker logic (Cache-Control: $PUBLIC_WORKER_CACHE)"
  aws s3 cp public/service-worker.js "s3://$S3_BUCKET/public/service-worker.js" \
    --cache-control "$PUBLIC_WORKER_CACHE" \
    --content-type "application/javascript; charset=utf-8" \
    $DRY
  echo
else
  echo "WARN: public/service-worker.js missing, skipping" >&2
fi

# ---------- 4. HTML and root worker last (short cache, must-revalidate) ----------
HTML_CACHE="public, max-age=60, must-revalidate"
WORKER_CACHE="no-cache, no-store, must-revalidate"

echo "==> Uploading HTML (Cache-Control: $HTML_CACHE)"
for html in index.html about.html guide.html privacy.html terms.html; do
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

echo "==> Uploading root service worker (Cache-Control: $WORKER_CACHE)"
aws s3 cp service-worker.js "s3://$S3_BUCKET/service-worker.js" \
  --cache-control "$WORKER_CACHE" \
  --content-type "application/javascript; charset=utf-8" \
  $DRY
echo

# ---------- 5. CloudFront invalidation ----------
INVALIDATION_PATHS=(
  "/"
  "/index.html"
  "/about.html"
  "/guide.html"
  "/privacy.html"
  "/terms.html"
  "/service-worker.js"
  "/public/manifest.webmanifest"
  "/public/service-worker.js*"
)

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
