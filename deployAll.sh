#!/usr/bin/env bash
# Scratchpad full deploy: share API, both CloudFront functions, then the static
# app. Wraps the three surfaces ./deploy.sh deliberately does not touch, in the
# order that keeps the site coherent while it changes.
#
# Operator-only. Never uploaded to S3 -- deploy.sh ships only public/** plus the
# explicit HTML shell list, so this file is excluded exactly as deploy.sh is.
#
# This does NOT perform the one-time setup steps in share-infra/README.md:
# attaching the API Gateway origin and the /api/share* behavior (step 4), the
# WAF SizeRestrictions_BODY override, and origin-secret rotation (step 9) are
# hand-edited update-distribution calls and stay manual on purpose.

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HEADERS_FUNCTION="scratchpad-security-headers"
HEADERS_SOURCE="cloudfront/security-headers-function.js"
HEADERS_COMMENT="Emit security/privacy headers for notes.vinny.dev"

ROUTER_FUNCTION="scratchpad-share-router"
ROUTER_SOURCE="cloudfront/share-router-function.js"
ROUTER_COMMENT="Rewrite /s/<id> to /share.html"

CF_RUNTIME="cloudfront-js-2.0"
SHARE_FUNCTION="scratchpad-share-api"

# ---------- args ----------
DRY=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    -n|--dry-run) DRY=1 ;;
    -y|--yes)     ASSUME_YES=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./deployAll.sh [--dry-run] [--yes]

Deploys every Scratchpad surface, in this order:
  1. Preflight   -- credentials, identity, CSP hashes, Lambda unit tests.
  2. Share API   -- share-infra/provision.sh (Lambda code, IAM, bucket, limits).
  3. CloudFront  -- scratchpad-security-headers, then scratchpad-share-router.
                    Each is update-function (DEVELOPMENT) then publish-function
                    (LIVE). Publishing before the static step means new CSP
                    hashes are live by the time new HTML lands.
  4. Static app  -- ./deploy.sh (S3 sync + CloudFront invalidation).
  5. Verify      -- re-reads the response headers from the live origin.

Identity: this needs MORE than ./deploy.sh does. The scratchpad-deploy user
(ScratchpadDeploy policy) can reach S3 and CloudFront invalidation only, so it
cannot publish edge functions or provision the Lambda. Preflight probes for the
capability and stops if it is missing -- a denied read is dangerous here, since
provision.sh would read it as "nothing exists yet" and mint a new origin secret.
Use an identity with cloudfront:*Function and lambda/iam rights for this script,
and keep scratchpad-deploy for ./deploy.sh on its own. An AWS_PROFILE exported
on the command line overrides the one in .env.local, so:

  AWS_PROFILE=<broader-profile> ./deployAll.sh --dry-run

Required variables (in .env.local):
  S3_BUCKET                   bucket name, no "s3://" prefix
  CLOUDFRONT_DISTRIBUTION_ID  distribution to invalidate

Optional variables:
  AWS_PROFILE, AWS_REGION     forwarded to the aws CLI and to provision.sh
  SHARES_BUCKET               overrides the default scratchpad-shares

Flags:
  -n, --dry-run    print actions without changing anything
  -y, --yes        skip the confirmation prompt (for non-interactive runs)
  -h, --help       show this message

Does NOT do (one-time, hand-edited -- see share-infra/README.md):
  - attach the API Gateway origin and /api/share* behavior  (step 4)
  - the WAF SizeRestrictions_BODY override
  - origin-secret rotation                                   (step 9)

For a static-only release, ./deploy.sh on its own is still the right tool.
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

# .env.local pins AWS_PROFILE to the narrow deploy user that ./deploy.sh needs.
# This script needs more, so an AWS_PROFILE exported by the caller wins -- that
# way it can be pointed at a broader identity without editing the file.
PRESET_AWS_PROFILE="${AWS_PROFILE:-}"

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

if [ -n "$PRESET_AWS_PROFILE" ]; then
  export AWS_PROFILE="$PRESET_AWS_PROFILE"
fi

: "${S3_BUCKET:?S3_BUCKET is not set in .env.local}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?CLOUDFRONT_DISTRIBUTION_ID is not set in .env.local}"

# ---------- 1. preflight (fail before anything mutates) ----------
echo "==> Preflight"

for tool in aws zip curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: $tool not found on PATH." >&2
    exit 1
  fi
done

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: AWS credentials are not working." >&2
  echo "Check 'aws configure', AWS_PROFILE, or SSO login state." >&2
  exit 1
fi

CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text)"
echo "    identity:     $CALLER_ARN"

# Runs a command, discards stdout, and yields its stderr (empty when it
# succeeded). Used to tell "access denied" apart from "does not exist" -- a
# distinction the scripts this one wraps do not make.
capture_err() {
  local err
  err="$({ "$@" >/dev/null; } 2>&1)" || true
  printf '%s' "$err"
}

# ./deploy.sh runs as scratchpad-deploy, whose ScratchpadDeploy policy grants
# S3 on the site bucket plus CloudFront invalidation and nothing else. That
# identity CANNOT drive this script. Probe for the capability rather than
# pattern-matching the ARN, because the failure is silent in a specific and
# expensive way: provision.sh decides create-vs-update with bare
# `if aws ... ; then` checks, so a denied read looks exactly like a first-time
# install and it proceeds to mint a fresh origin secret.
IDENTITY_HELP="Re-run with a broader profile, which overrides the one in .env.local:

  AWS_PROFILE=<profile> ./deployAll.sh [--dry-run]

It needs cloudfront:DescribeFunction/UpdateFunction/PublishFunction plus lambda
and iam rights. scratchpad-deploy is deliberately scoped too narrowly for this
script; it stays the correct identity for ./deploy.sh on its own."

CF_ERR="$(capture_err aws cloudfront describe-function \
  --name "$HEADERS_FUNCTION" --stage DEVELOPMENT)"
if [ -n "$CF_ERR" ]; then
  echo "ERROR: cannot read CloudFront function $HEADERS_FUNCTION." >&2
  echo "  identity: $CALLER_ARN" >&2
  echo "  aws said: $CF_ERR" >&2
  echo >&2
  echo "$IDENTITY_HELP" >&2
  exit 1
fi
echo "    edge access:  ok"

# The origin secret is the one value a re-run must never change by accident.
# provision.sh reuses it only if it can READ it; an unreadable value is
# regenerated, and /api/share then 404s until the CloudFront custom header is
# edited to match by hand (share-infra/README.md step 9). Refuse instead.
LAMBDA_ERR="$(capture_err aws lambda get-function --function-name "$SHARE_FUNCTION")"
case "$LAMBDA_ERR" in
  "")
    SHARE_SECRET="$(aws lambda get-function-configuration \
      --function-name "$SHARE_FUNCTION" \
      --query 'Environment.Variables.SHARE_ORIGIN_SECRET' \
      --output text 2>/dev/null || echo '')"
    if [ -z "$SHARE_SECRET" ] || [ "$SHARE_SECRET" = "None" ]; then
      echo "ERROR: $SHARE_FUNCTION exists but its SHARE_ORIGIN_SECRET is unreadable." >&2
      echo "Continuing would mint a new secret and take /api/share down until the" >&2
      echo "CloudFront custom header is updated by hand. Fix permissions first." >&2
      exit 1
    fi
    echo "    share API:    exists, origin secret readable"
    ;;
  *ResourceNotFound*|*NotFound*)
    echo "    share API:    absent -- provision.sh will create it"
    ;;
  *)
    echo "ERROR: cannot read Lambda $SHARE_FUNCTION." >&2
    echo "  identity: $CALLER_ARN" >&2
    echo "  aws said: $LAMBDA_ERR" >&2
    echo >&2
    echo "A denied read here is not harmless: provision.sh would read it as" >&2
    echo "'function does not exist', create a new origin secret, and break" >&2
    echo "/api/share." >&2
    echo >&2
    echo "$IDENTITY_HELP" >&2
    exit 1
    ;;
esac

for src in "$HEADERS_SOURCE" "$ROUTER_SOURCE"; do
  if [ ! -f "$src" ]; then
    echo "ERROR: $src not found." >&2
    exit 1
  fi
done

# A stale CSP hash silently breaks the theme guard: the browser refuses the
# inline script and the page paints the wrong theme. Gate on it before anything
# reaches production.
echo "    checking CSP inline-script hashes…"
if ! bash cloudfront/recompute-csp-hashes.sh >/dev/null 2>&1; then
  echo "ERROR: CSP hash check failed." >&2
  echo "Run 'bash cloudfront/recompute-csp-hashes.sh' and fix the reported drift," >&2
  echo "updating both security-headers-function.js and response-headers-policy.json." >&2
  exit 1
fi
echo "    CSP hashes:   current"

# share-infra/README.md step 3: the handler tests must be green before its code
# is redeployed.
echo "    running Lambda unit tests…"
if command -v bun >/dev/null 2>&1; then
  LAMBDA_TEST_OUTPUT="$(bun run test:lambda 2>&1)" || {
    echo "ERROR: Lambda unit tests failed." >&2
    echo "$LAMBDA_TEST_OUTPUT" >&2
    exit 1
  }
else
  LAMBDA_TEST_OUTPUT="$(node --test share-infra/lambda/*.test.mjs 2>&1)" || {
    echo "ERROR: Lambda unit tests failed." >&2
    echo "$LAMBDA_TEST_OUTPUT" >&2
    exit 1
  }
fi
echo "    lambda tests: green"
echo

# ---------- 2. plan + confirm ----------
echo "Scratchpad full deploy"
echo "  identity:     $CALLER_ARN"
echo "  bucket:       s3://$S3_BUCKET"
echo "  distribution: $CLOUDFRONT_DISTRIBUTION_ID"
echo "  shares:       ${SHARES_BUCKET:-scratchpad-shares}"
echo "  functions:    $HEADERS_FUNCTION, $ROUTER_FUNCTION"
[ "$DRY" -eq 1 ] && echo "  mode:         DRY RUN (no changes)"
echo

if [ "$DRY" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
  echo "This mutates production in three places: the share Lambda, two CloudFront"
  echo "functions at the edge, and the S3 bucket behind notes.vinny.dev."
  printf 'Type "deploy" to continue: '
  read -r REPLY
  if [ "$REPLY" != "deploy" ]; then
    echo "Aborted. Nothing was changed."
    exit 1
  fi
  echo
fi

# ---------- 3. share API ----------
echo "==> [1/4] Share API (share-infra/provision.sh)"
if [ "$DRY" -eq 1 ]; then
  bash share-infra/provision.sh --dry-run
else
  bash share-infra/provision.sh
fi
echo

# ---------- 4. CloudFront functions ----------
# update-function writes the DEVELOPMENT stage only; the distribution serves
# LIVE, so an update without a publish is a silent no-op in production. The
# ETag changes on update, so it is re-read before publishing.
publish_cf_function() {
  local name="$1" file="$2" comment="$3"

  if [ "$DRY" -eq 1 ]; then
    echo "    [dry-run] would update $name from $file, then publish DEVELOPMENT -> LIVE"
    return 0
  fi

  local dev_etag
  dev_etag="$(aws cloudfront describe-function \
    --name "$name" --stage DEVELOPMENT --query 'ETag' --output text)"

  aws cloudfront update-function \
    --name "$name" \
    --if-match "$dev_etag" \
    --function-config "Comment=$comment,Runtime=$CF_RUNTIME" \
    --function-code "fileb://$file" >/dev/null
  echo "    updated  $name (DEVELOPMENT)"

  local published_etag
  published_etag="$(aws cloudfront describe-function \
    --name "$name" --stage DEVELOPMENT --query 'ETag' --output text)"

  aws cloudfront publish-function \
    --name "$name" --if-match "$published_etag" >/dev/null
  echo "    published $name (LIVE)"
}

echo "==> [2/4] CloudFront function: $HEADERS_FUNCTION"
publish_cf_function "$HEADERS_FUNCTION" "$HEADERS_SOURCE" "$HEADERS_COMMENT"
echo

echo "==> [3/4] CloudFront function: $ROUTER_FUNCTION"
publish_cf_function "$ROUTER_FUNCTION" "$ROUTER_SOURCE" "$ROUTER_COMMENT"
echo

# Edge propagation is seconds, and both functions run on every response --
# cached ones included -- so neither needs update-distribution or an
# invalidation. The static step below handles its own invalidation.

# ---------- 5. static app ----------
echo "==> [4/4] Static app (./deploy.sh)"
if [ "$DRY" -eq 1 ]; then
  ./deploy.sh --dry-run
else
  ./deploy.sh
fi
echo

# ---------- 6. verify ----------
if [ "$DRY" -eq 1 ]; then
  echo "==> [dry-run] would verify response headers from https://notes.vinny.dev/"
  echo
  echo "Dry run complete. Nothing was changed."
  exit 0
fi

echo "==> Verifying live response headers"
curl -sI https://notes.vinny.dev/ \
  | grep -iE 'content-security-policy|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin' \
  || echo "    WARNING: no security headers returned -- check the function association." >&2
echo

cat <<'NEXT'
Done.

Next, by hand:
  - Load the site with DevTools open; any CSP violation in the console means a
    hash is stale. Re-run cloudfront/recompute-csp-hashes.sh, then this script.
  - If the share handler changed, run the smoke test in share-infra/README.md
    step 6 to confirm create / read / revoke and the 8 KB+ body path.
NEXT
