# share-infra — operator guide

AWS artifacts for Scratchpad's note-sharing API. **Operator-only.** Nothing in
this directory is ever uploaded to S3 — `deploy.sh` uploads only `public/**`
plus the explicit HTML shell list, and `CLAUDE.md` lists this directory under
"What not to deploy."

## What this provisions

| Resource | Name | Purpose |
| --- | --- | --- |
| S3 bucket | `scratchpad-shares` | Holds encrypted share objects under `shares/`. Block Public Access fully on. |
| Lifecycle rules | `expire-shares-ttl-{7,14,21,30}` + `expire-shares-backstop-30-days` | Delete each share at its chosen duration, routed by the `ttl-days` object tag. Untagged objects fall to the 30-day backstop; earliest-expiration-wins keeps the backstop harmless for tagged objects. |
| IAM role | `scratchpad-share-lambda-role` | Lambda execution role. |
| Inline policy | `scratchpad-share-s3-access` | `PutObject`/`PutObjectTagging`/`GetObject`/`DeleteObject` on `shares/*` only. |
| Lambda | `scratchpad-share-api` | The three-route API. Node 20, 256 MB, 10s timeout. |
| HTTP API | `scratchpad-share-api` | API Gateway v2, Lambda proxy. The CloudFront origin. |
| CloudFront behavior | `/api/share*` | Routes to the HTTP API origin on the existing distribution. |
| WAF override | `SizeRestrictions_BODY` | Set to Count so uploads over 8 KB are not blocked. |

**The bucket is never publicly readable.** Every read goes through the Lambda,
so there is exactly one code path that can return share data. That is
deliberate — a public bucket would create a second reachable surface governed
by a bucket policy rather than by logic.

**Why API Gateway and not a Lambda function URL.** Anonymous function URLs are
refused in this AWS account (403 `AccessDeniedException` regardless of the
resource policy; no Organizations SCP or RCP is involved). Fronting one with
CloudFront OAC works, but OAC signs the origin request with SigV4 and therefore
requires the *browser* to send an `x-amz-content-sha256` payload hash on every
upload. The HTTP API needs neither, and costs about $1 per million requests.

**Why the origin secret.** The API Gateway endpoint is reachable from the
internet, so CloudFront injects `x-share-origin-secret` as a custom origin
header and the handler refuses anything without it — answering 404, so a prober
learns nothing. Without this the CDN could simply be bypassed.

**Why the WAF override.** The distribution has a CloudFront-managed web ACL
(`CreatedByCloudFront-*`) whose Core Rule Set includes `SizeRestrictions_BODY`,
which blocks request bodies over exactly 8,192 bytes. That capped a shareable
note at roughly 1,000 words. The rule is overridden to **Count**, which protects
nothing else here: every other endpoint on this domain is static and accepts no
request body at all, and the share Lambda enforces its own 256 KB cap plus
strict envelope validation before any S3 write. To restore it:

```sh
# Look up the ACL attached to the distribution, then re-run update-web-acl with
# RuleActionOverrides removed from AWSManagedRulesCommonRuleSet.
aws wafv2 list-web-acls --scope CLOUDFRONT --region us-east-1 \
  --query "WebACLs[?starts_with(Name,'CreatedByCloudFront')].{Name:Name,Id:Id}"
```

## Prerequisites

- `aws` CLI v2, authenticated with permission to create S3 buckets, IAM roles,
  and Lambda functions.
- `zip` on `PATH`.
- The existing CloudFront distribution ID (same one `deploy.sh` uses, from
  `.env.local` as `CLOUDFRONT_DISTRIBUTION_ID`).

## 1. Preview

```sh
bash share-infra/provision.sh --dry-run
```

Mutates nothing. Prints every command it would run.

## 2. Provision

```sh
bash share-infra/provision.sh
```

Idempotent — re-running updates the Lambda code and re-applies the bucket
settings without recreating anything. Re-running is the normal way to ship a
handler change.

Note the origin domain and origin secret it prints; step 4 needs both.

**One-time migration (2026-08-14 expiry menu).** Shares created before the
`ttl-days` tag existed are untagged, so the new lifecycle rules would hold
them until the 30-day backstop instead of the 7 days they were promised.
After applying the new lifecycle, tag them once:

```sh
aws s3api list-objects-v2 --bucket scratchpad-shares --prefix shares/ \
  --query 'Contents[].Key' --output text | tr '\t' '\n' | grep . | while read -r key; do
  aws s3api put-object-tagging --bucket scratchpad-shares --key "$key" \
    --tagging 'TagSet=[{Key=ttl-days,Value=7}]'
done
```

(The operator can list the bucket; the Lambda deliberately cannot.)

## 3. Redeploy handler code after an edit

```sh
bun run test:lambda            # must be green first
bash share-infra/provision.sh  # updates function code in place
```

## 4. Attach the CloudFront origin and behavior

The distribution is on CloudFront's **Free pricing plan**, which rejects custom
cache policies and custom origin-request policies at `update-distribution` time
with `InvalidArgument: Distributions with the Free pricing plan can't have the
following features`. Both policies below are AWS-**managed**, which every tier
allows.

| Setting | Value |
| --- | --- |
| Origin domain | the HTTP API host, `<api-id>.execute-api.us-east-1.amazonaws.com` |
| Origin protocol | HTTPS only |
| Custom header | `x-share-origin-secret: <value printed by provision.sh>` |
| **OriginPath** | **empty** — see the warning below |
| Path pattern | `/api/share*` |
| Allowed methods | `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE` |
| Cache policy | Managed `CachingDisabled` — `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` |
| Origin request policy | Managed `AllViewerExceptHostHeader` — `b689b0a8-53d0-40ab-baf2-68738e2966ac` |
| Viewer protocol policy | `redirect-to-https` |

`CachingDisabled` is a correctness choice, not an oversight: a cached share
response would survive revocation. If read volume ever justifies caching,
switching to managed `CachingOptimized` trades instant revocation for the cache
TTL.

**`OriginPath` must stay empty on every origin in this distribution.** Anything
in `OriginPath` is prefixed onto every forwarded request. A past incident where
it was set to `/index.html` made every URL 404. If you see universal 404s after
a change here, check `OriginPath` first.

To apply, export the current config, edit it, and put it back:

```sh
DIST_ID="$(grep CLOUDFRONT_DISTRIBUTION_ID .env.local | cut -d= -f2)"

aws cloudfront get-distribution-config --id "$DIST_ID" > /tmp/dist.json
ETAG="$(python3 -c 'import json;print(json.load(open("/tmp/dist.json"))["ETag"])')"
python3 -c 'import json;d=json.load(open("/tmp/dist.json"));json.dump(d["DistributionConfig"],open("/tmp/dist-config.json","w"),indent=2)'

# Edit /tmp/dist-config.json: add the Lambda origin to Origins.Items (and bump
# Origins.Quantity), then add the /api/share* behavior to CacheBehaviors.Items
# (and bump CacheBehaviors.Quantity).

aws cloudfront update-distribution --id "$DIST_ID" \
  --distribution-config file:///tmp/dist-config.json --if-match "$ETAG"
```

## 5. Publish the `/s/*` router function

`cloudfront/share-router-function.js` rewrites `/s/<id>` to `/share.html` at
viewer-request. It is a separate function from the viewer-response
security-headers function; a behavior can carry one of each.

```sh
aws cloudfront update-function \
  --name scratchpad-share-router \
  --function-config Comment="Rewrite /s/<id> to /share.html",Runtime=cloudfront-js-2.0 \
  --function-code fileb://cloudfront/share-router-function.js \
  --if-match "$(aws cloudfront describe-function --name scratchpad-share-router --query ETag --output text)"

aws cloudfront publish-function --name scratchpad-share-router \
  --if-match "$(aws cloudfront describe-function --name scratchpad-share-router --stage DEVELOPMENT --query ETag --output text)"
```

Edge propagation takes seconds. No `update-distribution` and no invalidation are
needed once the function is associated with the default behavior.

## 6. Smoke test

`base64` wraps at 76 columns on macOS, which would corrupt the JSON — hence the
`tr -d '\n'`.

```sh
API="https://notes.vinny.dev/api/share"
IV=$(head -c 12 /dev/urandom | base64 | tr -d '\n')
CT=$(head -c 64 /dev/urandom | base64 | tr -d '\n')

CREATED=$(curl -sS -X POST "$API" -H 'content-type: application/json' \
  -d "{\"v\":1,\"ciphertext\":\"$CT\",\"iv\":\"$IV\"}")
echo "$CREATED"
ID=$(echo "$CREATED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
TOKEN=$(echo "$CREATED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["revokeToken"])')

curl -sS "$API/$ID"; echo                                                                    # 200 + ciphertext
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE "$API/$ID" -H "x-revoke-token: wrong"    # 403
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE "$API/$ID" -H "x-revoke-token: $TOKEN"   # 204
curl -sS -o /dev/null -w '%{http_code}\n' "$API/$ID"                                         # 404

# Oversized body is refused before any S3 write
python3 -c 'print("{\"v\":1,\"iv\":\"AAAAAAAAAAAAAAAA\",\"ciphertext\":\"" + "A"*300000 + "\"}")' > /tmp/big.json
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$API" \
  -H 'content-type: application/json' --data-binary @/tmp/big.json                           # 413

# The bucket must not be readable directly
curl -sS -o /dev/null -w '%{http_code}\n' "https://scratchpad-shares.s3.amazonaws.com/shares/$ID.json"  # 403

# The API Gateway endpoint must not be usable without the origin secret
API_ID="$(aws apigatewayv2 get-apis --query \
  "Items[?Name=='scratchpad-share-api'].ApiId | [0]" --output text)"
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  "https://$API_ID.execute-api.us-east-1.amazonaws.com/api/share" \
  -H 'content-type: application/json' -d '{"v":1,"ciphertext":"QUJD","iv":"QUJDREVGR0hJSktM"}'   # 404

# A body over 8 KB must succeed (proves the WAF override is in place)
python3 -c 'print("{\"v\":1,\"iv\":\"AAAAAAAAAAAAAAAA\",\"ciphertext\":\"" + "A"*20000 + "\"}")' > /tmp/mid.json
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$API" \
  -H 'content-type: application/json' --data-binary @/tmp/mid.json                                # 201
```

## 7. Take down a single share

A share link is public, so the domain can host content that needs removing. To
kill one immediately, without waiting for its expiry:

```sh
aws s3 rm "s3://scratchpad-shares/shares/<id>.json"
```

The ID is the 12-character segment in the URL: `notes.vinny.dev/s/<id>#k=...`.
The fragment after `#` is the decryption key — it never reaches any server, so
it will not appear in any log, and you cannot read the note you are removing.

To remove every live share at once:

```sh
aws s3 rm "s3://scratchpad-shares/shares/" --recursive
```

## 8. Abuse guardrails

The write endpoint is public and unauthenticated. As of the 2026-08-14 security
review the guardrails are:

| Control | Value | Where it lives |
| --- | --- | --- |
| Body cap | 256 KB, checked before any S3 call | `lambda/validate.mjs:31` |
| Envelope validation | only `v`, `ciphertext`, `iv` persist | `lambda/validate.mjs:54` |
| Object expiry | sender-chosen 7/14/21/30 days, 30 hard cap | tag-routed bucket lifecycle, and re-checked on read |
| Reserved concurrency | 25 | `provision.sh`, re-applied on every run |
| Route throttling | 20 req/s steady, 40 burst | API Gateway `$default` stage |
| Invocation alarm | 500 in 5 min | CloudWatch `scratchpad-share-invocations-spike` |
| Throttle alarm | 5 in 5 min | CloudWatch `scratchpad-share-throttles` |
| Cost anomaly | daily, $10 absolute impact | Cost Explorer `vinny-service-monitor` |

Reserved concurrency is the one that bounds blast radius. Without it this
function draws from the account-wide pool it shares with every other Lambda, so
a flood here would starve unrelated workloads before it cost real money.

If abuse becomes real, the next steps in order of cost are a WAF rate-based rule
scoped to `/api/share`, then a per-IP counter in DynamoDB with a TTL attribute.
Neither changes the client contract.

## 9. Rotate the origin secret

`x-share-origin-secret` is the only thing preventing a caller from skipping
CloudFront and hitting the API Gateway endpoint directly, which would bypass the
WAF. It lives in plaintext in two places, and `provision.sh` deliberately reuses
whatever the function already has, so rotation is manual.

Order matters. The Lambda must accept the new value **before** CloudFront starts
sending it, or every share request 404s during the gap.

```sh
NEW="$(head -c 32 /dev/urandom | base64 | tr -d '\n=' | tr '+/' '-_')"
BUCKET=scratchpad-shares

# 1. Lambda first. It now accepts only the new secret.
aws lambda update-function-configuration \
  --function-name scratchpad-share-api \
  --environment "Variables={SHARES_BUCKET=$BUCKET,SHARE_ORIGIN_SECRET=$NEW}"
aws lambda wait function-updated-v2 --function-name scratchpad-share-api

# 2. CloudFront second. Edit the custom header on the share-api-lambda origin.
DIST_ID="$(grep CLOUDFRONT_DISTRIBUTION_ID .env.local | cut -d= -f2)"
aws cloudfront get-distribution-config --id "$DIST_ID" > /tmp/dist.json
# Replace Origins.Items[share-api-lambda].CustomHeaders x-share-origin-secret
# with $NEW, then put the config back with --if-match "$ETAG" as in step 4.
```

Between step 1 and step 2 the CDN is sending the old secret and the handler is
rejecting it, so `/api/share*` answers 404. Keep the gap short and do it when
nobody is creating links. There is no way to have the handler honor both values
without adding code, and a two-secret handler is a worse thing to own than a
sixty-second window.

Verify with the smoke test in step 6. Then confirm the bypass is still closed:

```sh
API_ID="$(aws apigatewayv2 get-apis --query \
  "Items[?Name=='scratchpad-share-api'].ApiId | [0]" --output text)"
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  "https://$API_ID.execute-api.us-east-1.amazonaws.com/api/share" \
  -H 'content-type: application/json' -d '{"v":1,"ciphertext":"QUJD","iv":"QUJDREVGR0hJSktM"}'   # 404
```

Rotate whenever someone with `cloudfront:GetDistributionConfig` or
`lambda:GetFunctionConfiguration` in this account should no longer have it.
