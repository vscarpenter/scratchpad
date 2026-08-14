# share-infra — operator guide

AWS artifacts for Scratchpad's note-sharing API. **Operator-only.** Nothing in
this directory is ever uploaded to S3 — `deploy.sh` uploads only `public/**`
plus the explicit HTML shell list, and `CLAUDE.md` lists this directory under
"What not to deploy."

## What this provisions

| Resource | Name | Purpose |
| --- | --- | --- |
| S3 bucket | `scratchpad-shares` | Holds encrypted share objects under `shares/`. Block Public Access fully on. |
| Lifecycle rule | `expire-shares-after-7-days` | Deletes `shares/*` seven days after creation. |
| IAM role | `scratchpad-share-lambda-role` | Lambda execution role. |
| Inline policy | `scratchpad-share-s3-access` | `PutObject`/`GetObject`/`DeleteObject` on `shares/*` only. |
| Lambda | `scratchpad-share-api` | The three-route API. Node 20, 256 MB, 10s timeout. |
| Function URL | (generated) | The CloudFront origin. Auth type NONE. |
| CloudFront behavior | `/api/share*` | Routes to the Lambda origin on the existing distribution. |

**The bucket is never publicly readable.** Every read goes through the Lambda,
so there is exactly one code path that can return share data. That is
deliberate — a public bucket would create a second reachable surface governed
by a bucket policy rather than by logic.

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

Note the Function URL it prints; step 4 needs it.

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
| Origin domain | the Function URL host, e.g. `abc123.lambda-url.us-east-1.on.aws` |
| Origin protocol | HTTPS only |
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

```sh
API="https://notes.vinny.dev/api/share"
IV=$(head -c 12 /dev/urandom | base64)
CT=$(head -c 64 /dev/urandom | base64)

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
```

## 7. Take down a single share

A share link is public, so the domain can host content that needs removing. To
kill one immediately, without waiting for its seven days:

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

## 8. Cost alarm

The write endpoint is public and unauthenticated. Guardrails in this version are
the 256 KB body cap, envelope validation, and seven-day expiry. Add a billing
alarm as the backstop:

```sh
aws cloudwatch put-metric-alarm \
  --alarm-name scratchpad-share-cost \
  --namespace AWS/Billing --metric-name EstimatedCharges \
  --dimensions Name=Currency,Value=USD \
  --statistic Maximum --period 21600 --evaluation-periods 1 \
  --threshold 10 --comparison-operator GreaterThanThreshold \
  --region us-east-1
```

Billing metrics only publish in `us-east-1`, regardless of where the bucket
lives. Set `--threshold` to whatever "something is wrong" means for this
account.

If abuse ever becomes real, the next steps in order of cost are: a per-IP
counter in DynamoDB with a TTL attribute, then an AWS WAF rate-based rule.
Neither changes the client contract.
