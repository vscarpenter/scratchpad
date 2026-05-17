# CloudFront security headers

Files in this directory configure security response headers for the
`notes.vinny.dev` CloudFront distribution. They are **inputs to the AWS CLI**,
not something the app reads at runtime.

| File | Purpose |
|---|---|
| `security-headers-function.js` | The active deployed source. Body of a CloudFront Function (`cloudfront-js-2.0`) attached to the distribution's default cache behavior on `viewer-response`. Emits CSP, HSTS, COOP/CORP, Permissions-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. |
| `recompute-csp-hashes.sh` | Re-derives sha256 hashes of every inline `<script>` in the three HTML pages and verifies each one is present in every CSP-bearing source file under this directory. Run after editing any inline `<script>`. |
| `response-headers-policy.json` | **Reference only.** The equivalent declarative policy body, kept for documentation and as a starting point if this distribution ever moves off the Free flat-rate pricing plan (which forbids custom response-headers policies). The hash-check script keeps it in sync with the JS file so the two never drift. |

## Why a CloudFront Function instead of a response-headers policy

The `notes.vinny.dev` distribution is enrolled in CloudFront's **Free**
flat-rate pricing plan, which gates "Custom response header rules" to the
Business and Premium tiers (see the
[pricing plan features table](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)).
Attempting `update-distribution` with a custom `ResponseHeadersPolicyId`
under Free returns `InvalidArgument: Distributions with the Free pricing
plan can't have the following features: Custom response headers policy`.

CloudFront Functions, by contrast, are available on every tier. So the
headers live in a small JS function that runs at viewer-response and sets
the same values a response-headers policy would have.

## What the function emits

Every response from the distribution gains:

- `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'sha256-…' 'sha256-…'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `X-Permitted-Cross-Domain-Policies: none`

### Why hashes for inline scripts

`index.html`, `privacy.html`, and `terms.html` each contain two inline
`<script>` blocks: the FOIT-prevention theme guard at the top of `<head>`,
and the theme-toggle wiring at the bottom of `<body>`. Extracting these to
external files would reintroduce a flash of incorrect theme on first paint.
CloudFront Functions emit static header values per response — there is no
per-request nonce — so we use **sha256 hashes** of the script bodies in
`script-src`. The two unique hashes cover all three pages.

If you edit an inline script, **run `bash cloudfront/recompute-csp-hashes.sh`**
before deploying. A stale hash silently breaks the page: CSP refuses the
inline script and the user sees the wrong theme, or the toggle stops working.

### Behavior change: external content in user notes

`img-src 'self' data:` and `style-src 'self'` are intentionally strict.
Two things in a user's markdown that worked before the function was
attached will silently stop rendering:

- **External images** — `![alt](https://example.com/foo.png)` will not load.
  This is the right default for a privacy-first app: every external image
  request leaks the read event to the host. Users who need an image can
  still embed it as a `data:` URI, which CSP allows.
- **Inline `style="…"` attributes** in pasted HTML. DOMPurify already
  strips most dangerous attributes, but any inline styles that survived
  sanitization will be ignored by the browser under CSP.

These changes don't break Scratchpad's own UI — its CSS lives in
same-origin files. They only affect content authored inside notes.

### HSTS preload

The function emits `preload`. That commits the apex domain `vinny.dev` to
HTTPS-only — submitting `vinny.dev` to the HSTS preload list is irreversible
in practice. Drop `preload` from the `strict-transport-security` value in
`security-headers-function.js` if you don't want to make that commitment.

## Deploying (AWS mutation — needs explicit per-turn auth)

Per the project's deploy rule, every step below mutates AWS state and must
be authorized in the current turn. They do **not** run from `deploy.sh`.

The function is **already created, published, and attached**. The steps
below are only relevant if you change `security-headers-function.js` or
need to reattach it.

### 1. Sanity-check the hashes are current

```sh
bash cloudfront/recompute-csp-hashes.sh
```

Must report `All inline-script hashes are present in every checked source.`
Fix `security-headers-function.js` (and the reference JSON, to keep them in
sync) if not.

### 2. Update the function code

```sh
ETAG=$(aws cloudfront describe-function \
  --name scratchpad-security-headers \
  --stage DEVELOPMENT \
  --query 'ETag' --output text)

aws cloudfront update-function \
  --name scratchpad-security-headers \
  --if-match "$ETAG" \
  --function-config Comment="Emit security/privacy headers for notes.vinny.dev",Runtime=cloudfront-js-2.0 \
  --function-code fileb://cloudfront/security-headers-function.js
```

### 3. Publish to LIVE

`update-function` only changes the DEVELOPMENT stage. The distribution
serves the LIVE stage. Publish to promote:

```sh
DEV_ETAG=$(aws cloudfront describe-function \
  --name scratchpad-security-headers \
  --stage DEVELOPMENT \
  --query 'ETag' --output text)

aws cloudfront publish-function \
  --name scratchpad-security-headers \
  --if-match "$DEV_ETAG"
```

LIVE updates propagate to all edge locations within seconds — no
distribution redeploy required, no invalidation required.

### 4. Verify

```sh
curl -sI https://notes.vinny.dev/ | grep -iE 'content-security-policy|strict-transport|x-frame|x-content-type|referrer|permissions-policy|cross-origin'
```

Then load the site in a browser with DevTools → Console open. Any CSP
violation logs there means a hash is stale or the CSP is too strict for a
script the page actually needs. If that happens, re-run the hash script,
patch the function, publish, and re-verify.

## First-time setup reference

For posterity, the function was originally created with:

```sh
aws cloudfront create-function \
  --name scratchpad-security-headers \
  --function-config Comment="Emit security/privacy headers for notes.vinny.dev",Runtime=cloudfront-js-2.0 \
  --function-code fileb://cloudfront/security-headers-function.js
```

And attached to the distribution's default cache behavior via
`update-distribution` after patching
`DistributionConfig.DefaultCacheBehavior.FunctionAssociations` to:

```json
{
  "Quantity": 1,
  "Items": [
    {
      "FunctionARN": "arn:aws:cloudfront::<account-id>:function/scratchpad-security-headers",
      "EventType": "viewer-response"
    }
  ]
}
```

If this distribution is ever moved off the Free pricing plan, the
declarative `response-headers-policy.json` can be applied via
`aws cloudfront create-response-headers-policy` instead, and the function
detached — that gives slightly cheaper per-request execution but isn't
worth the plan upgrade on its own.
