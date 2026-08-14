# Note sharing — expiring, zero-knowledge public links — design spec

Date: 2026-08-13
Status: approved

## Overview

Let a user turn one note into a public, read-only link that stops working after
seven days. The link is safe to paste into Slack, email, or a text message; the
recipient needs no account, no app, and no explanation.

The note is encrypted in the browser before it is uploaded. The decryption key
travels in the URL fragment, which browsers never transmit to a server. S3,
CloudFront, AWS, and the operator hold an opaque blob and nothing else.

This is the first feature in Scratchpad's history that sends note content off
the device. It is deliberate, user-triggered, per-note, and self-expiring, and
the product's privacy copy changes to say so precisely rather than absolutely.

## Goals

- Share exactly one note as a public read-only page with a single action.
- Keep the content unreadable to the server, to AWS, and to the operator.
- Expire every share seven days after creation, without manual cleanup.
- Let the creator revoke a share before it expires.
- Keep the app's CSP, same-origin posture, and "no build step" property intact.
- Restate the privacy claims so they are true after this ships.

## Non-goals

- No accounts, sign-in, or identity of any kind.
- No live-updating shares. A share is a frozen snapshot (see Snapshot
  semantics).
- No sharing of folders, tag queries, the Archive, or multiple notes at once.
- No comments, reactions, view counters, or analytics on the shared page.
- No "Save a copy to my Scratchpad" button on the viewer. The viewer is inert.
- No passphrase-protected shares in this version.
- No sync. Shares are still created from, and revocable only by, one browser.

## Threat model

What an attacker gains at each level of access:

| Access | Gains |
| --- | --- |
| The S3 bucket, or an AWS console session | Ciphertext, an IV, an expiry timestamp, and a revoke-token hash. No note content. |
| CloudFront logs, or a network observer | The share ID in the request path. Never the key — fragments are not sent. |
| The full share URL | The note. This is the intended grant and cannot be narrowed. |
| The creator's browser profile | Everything, including keys for past shares. Consistent with notes already being unencrypted in IndexedDB. |

The share ID is not a secret and is not treated as one. It protects against
enumeration, not against disclosure. Confidentiality rests entirely on the
256-bit key in the fragment.

Anyone holding the link can read the note and can forward it. The share dialog
states this in plain words, because the word "encrypted" invites users to
assume more protection than a public link can offer.

## Architecture

One Lambda with three routes, added as a second origin on the existing
CloudFront distribution. A new, fully private S3 bucket holds the ciphertext.

```
notes.vinny.dev (existing distribution)
├── /api/share*   → NEW origin: Lambda Function URL  (managed CachingDisabled,
│                    managed AllViewerExceptHostHeader, methods incl. POST/DELETE)
├── /s/*          → NEW viewer-request CloudFront Function → /share.html
└── /*            → existing S3 website endpoint (unchanged)

scratchpad-shares (NEW bucket)
└── shares/<id>.json   Block Public Access fully on; lifecycle expires after 7 days
```

Three consequences follow from this shape and are load-bearing:

- **Same-origin.** The browser only ever talks to `notes.vinny.dev`, so
  `connect-src 'self'` in `cloudfront/security-headers-function.js` needs no
  change, no CORS preflight occurs, and `tests/network-isolation.spec.js`
  keeps passing on its existing assertion.
- **The bucket is unreachable from the internet.** Reads go through the Lambda,
  so there is exactly one code path that can return share data and it is code
  we control. No OAC, no bucket policy, no second reachable surface.
- **Managed policies only.** The distribution is on the CloudFront Free pricing
  plan, which forbids custom cache and origin-request policies. Both policies
  used here are AWS-managed and therefore permitted.

The cost of the Lambda serving reads is one invocation per view and no CDN
caching of shares. This is inside the free tier at any plausible volume. If
view volume ever justifies caching, switching the `/api/*` behavior to the
managed `CachingOptimized` policy is a one-line change that trades instant
revocation for a cache TTL. We start with `CachingDisabled` so revocation is
immediate.

## Lambda contract

```
POST   /api/share
       body   {"v":1,"ciphertext":"<base64>","iv":"<base64>"}
       201    {"id":"<12 chars>","revokeToken":"<base64>","expiresAt":<epoch ms>}
       400    malformed body, bad base64, or wrong IV length
       413    body over the size cap

GET    /api/share/{id}
       200    {"v":1,"ciphertext":"<base64>","iv":"<base64>","expiresAt":<epoch ms>}
       404    unknown id
       410    stored object is past expiresAt

DELETE /api/share/{id}
       header X-Revoke-Token: <base64>
       204    revoked
       403    token missing or wrong
       404    unknown id
```

Rules the handler enforces:

- **The server sets `expiresAt`**, always `now + 7 days`. The client never
  supplies it and a client-supplied value is ignored, not clamped.
- Request body must be at most **256 KB**; anything larger is rejected with 413
  before any S3 call.
- `iv` must decode to exactly **12 bytes**. `ciphertext` must be valid base64.
- The stored object holds `sha256(revokeToken)`, never the token. Comparison on
  DELETE is constant-time. A full dump of the bucket therefore confers no
  ability to revoke.
- `GET` strips the revoke hash from the response body.
- `GET` returns 410 for an object past its `expiresAt`, so an expired share
  dies on schedule even though S3 lifecycle deletion runs on a daily cadence
  and may reclaim the bytes up to 48 hours later.
- The share ID is 12 base64url characters (~72 bits) from a CSPRNG.

## Crypto

`public/js/crypto.js` is a new module holding the AES-GCM, base64, and envelope
helpers currently inlined in `public/js/app.js` (approximately lines 4770-4845),
plus the share-specific functions. Both the encrypted-backup flow and the share
flow use it. Extracting rather than duplicating prevents two divergent
implementations of the same primitives in one app.

The extraction is a pure move with no behavior change.
`tests/encrypted-backup.spec.js` is the regression net and must be green both
before and after.

New functions:

```js
generateShareKey()             // 256-bit AES-GCM key from crypto.getRandomValues
encryptShare(payload, key)     // → {ciphertext, iv}, fresh 96-bit IV per share
decryptShare(envelope, key)    // throws on wrong key or tampered ciphertext
exportShareKey(key)            // → base64url, for the URL fragment
importShareKey(text)           // ← base64url, rejects wrong-length input
```

Encrypted payload:

```json
{ "v": 1, "title": "...", "body": "...", "tags": ["..."], "updatedAt": 0 }
```

Nothing else from the note object is included. No `id`, no `folderId`, no
`createdAt`, no daily-note or archive fields — none of it is needed by the
viewer, and each omitted field is one less thing to leak.

Share URL shape:

```
https://notes.vinny.dev/s/AbCdEf123456#k=<43 base64url chars>
```

## Snapshot semantics

A share captures the note at the moment of sharing. Later local edits do not
change what a recipient sees. There is no update path and the Lambda has no
route that mutates an existing object.

"Share again" mints a new ID and a new key. The previous link keeps serving the
previous text until it is revoked or expires. The share dialog lists every live
link for a note so this never becomes invisible.

This is the behavior a recipient expects from a link someone sent them, and it
means the app never re-uploads on save — typing does not leave the browser.

## Local state

`public/js/db.js` goes to `DB_VERSION 4` and gains a `shares` store, keyed by
`id`, with an index on `noteId`:

```js
{ id, noteId, key, revokeToken, sharedAt, expiresAt, titleAtShare }
```

The decryption key is stored locally so the creator can redisplay a link made
days ago; without it the link is unrecoverable. This means shares are encrypted
against the server, not against the local disk — consistent with notes already
living unencrypted in IndexedDB.

`titleAtShare` is kept so the dialog can label a link with the title the
recipient actually sees, which may differ from the current note title.

Expired rows are pruned from the store on app start.

Deleting a note, or running the data-erasure flow, attempts revocation of that
note's live shares on a best-effort basis. Failure to reach the network does not
block deletion; the share still expires on its own.

## Viewer page

`share.html` plus `public/js/share.js`. It reads the ID from the path and the
key from `location.hash`, fetches `/api/share/{id}`, decrypts, and renders.

It has no editor, no IndexedDB access, no writes, and no buttons. It renders the
title, the sanitized markdown body, the tags, and a footer showing the expiry
date and a quiet link to Scratchpad.

**The viewer renders remote markdown, which makes it the highest XSS risk in the
product.** It uses `DOMPurify.sanitize(raw, { RETURN_DOM_FRAGMENT: true })` and
appends the fragment, per the house rule in `CLAUDE.md`, and is tested against
the payloads already in `tests/sanitization.spec.js`.

States the page must render, each in the Porcelain Chronicle design and never as
a raw error: loading, decrypted note, expired (410), not found (404), missing or
malformed key in the fragment, and network failure.

`share.html` reuses the inline theme-init and theme-toggle scripts from the
other five pages **byte for byte**. Because those scripts already have CSP
hashes in `cloudfront/security-headers-function.js`, no hash changes and
`cloudfront/recompute-csp-hashes.sh` does not need to run. Any edit to those
inline scripts in `share.html` breaks this property and requires the full CSP
update workflow.

## Routing

`cloudfront/share-router-function.js` is a new CloudFront Function on
viewer-request that rewrites `/s/<id>` to `/share.html`. The existing
viewer-response security-headers function is untouched.

CloudFront Functions are available on every pricing tier, including Free, and
publish via push-to-DEVELOPMENT then publish-to-LIVE with no
`update-distribution` and no invalidation.

## Service worker

`public/service-worker.js` must treat both new routes deliberately:

- `/api/share*` is **never** cached and never served from cache. A cached share
  response would survive revocation, which is exactly the failure this feature
  cannot have. The fetch handler passes these requests straight through to the
  network.
- `/s/*` is served the cached `share.html` shell when offline, matching how the
  app shell already behaves, but the share data fetch beneath it still requires
  the network and renders the network-failure state when offline.

`tests/pwa.spec.js` and `tests/pwa-lifecycle.spec.js` cover the existing
behavior and must stay green.

## Infrastructure

A new operator-only `share-infra/` directory, following the same pattern as
`cloudfront/`: source plus a provisioning script plus a README with exact CLI
snippets. It is added to the do-not-deploy list in `CLAUDE.md` and is not
touched by `deploy.sh`.

```
share-infra/
  lambda/handler.mjs      route dispatch and S3 access
  lambda/validate.mjs     pure request validation, no AWS imports
  lambda/validate.test.mjs
  iam-policy.json         least privilege: s3:PutObject, GetObject, DeleteObject
                          on arn:aws:s3:::scratchpad-shares/shares/* only
  lifecycle.json          expire shares/ after 7 days
  provision.sh            create bucket, block public access, lifecycle, role,
                          function, function URL
  README.md               operator guide, including how to remove one share by ID
```

The IAM policy names only the shares bucket. The Lambda has no permission that
touches the site bucket, so a bug in it cannot damage the site.

`validate.mjs` is pure and imports nothing from AWS, so it is unit-testable with
the Node built-in test runner. No new dependency is added.

## Abuse and cost posture

Accepted risk: `/api/share` is a public, unauthenticated write endpoint on a
personal AWS account.

Mitigations in this version:

- 256 KB hard cap, enforced before any S3 call.
- Shape and base64 validation, so the bucket only ever holds well-formed JSON.
- Seven-day lifecycle deletion, which bounds total stored bytes.
- A CloudWatch billing alarm at a threshold the operator sets.

Not in this version, and deliberately: per-IP rate limiting via DynamoDB, and
AWS WAF rate rules. Either can be added later without changing the client
contract. A determined abuser can still create many small shares; the ceiling on
that damage is S3 storage cost for seven days.

Operating this feature makes the domain a public content host. `terms.html`
gains acceptable-use language and a stated right to remove content, and
`share-infra/README.md` documents the one-command takedown of a share by ID.

## Files

New:

- `public/js/crypto.js`
- `public/js/share.js`
- `share.html`
- `cloudfront/share-router-function.js`
- `share-infra/` (as above)
- `tests/share.spec.js`
- `tests/share-viewer.spec.js`

Modified:

- `public/js/app.js` — share dialog, share state, revoke, one-time explainer;
  crypto helpers removed in favor of `crypto.js`
- `public/js/db.js` — `DB_VERSION 4`, `shares` store
- `public/service-worker.js` — bypass `/api/share*`, shell-serve `/s/*`
- `index.html` — `crypto.js` script tag, share dialog markup, share icon
  `<template>`
- `deploy.sh` — `share.html` added to the HTML upload list and the invalidation
  list
- `tests/network-isolation.spec.js` — tightened, see Verification
- `privacy.html`, `terms.html`, `about.html`, `guide.html`, `README.md`,
  `CLAUDE.md`, and the OG meta on every page — see Copy

## Copy

The framing is **"Local-only by default. One exception, and you trigger it."**

Every absolute claim becomes precise. The current text asserts, variously, that
there is no backend, that no servers process user content, and that notes never
leave the browser. After this feature two of those remain true for all
unshared notes and none of them is true without qualification.

- `privacy.html` gains a Sharing section naming exactly what a share uploads
  (ciphertext, an IV, an expiry timestamp, a revoke-token hash), what it never
  uploads (the key, other notes, any identifier or device fingerprint), the
  seven-day retention, and the fact that the operator cannot read shared notes.
- `terms.html` gains acceptable-use language and a stated right to remove
  content, because the domain now hosts user-submitted content publicly.
- `about.html`, `guide.html`, `README.md`, `CLAUDE.md`, and the OG descriptions
  are adjusted so no marketing surface makes a claim the product no longer
  keeps. `guide.html` also documents the feature itself.

The share dialog's first-run explainer states, in the user's words: what leaves
(an encrypted copy of this note's title, text, and tags), what does not (the
key, which stays in the link, and every other note), that anyone with the link
can read and forward it, and that it stops working in seven days.

## Verification

Written test-first, per phase.

- `crypto.js` — encrypt/decrypt roundtrip; wrong key rejects; a single flipped
  ciphertext byte rejects via the AES-GCM authentication tag; key export/import
  roundtrip; malformed key text rejects.
- `encrypted-backup.spec.js` — green before and after the extraction, unchanged.
- `validate.mjs` — `node --test`: size cap, IV length, base64 validity, missing
  fields, and that a client-supplied `expiresAt` is ignored.
- `share.spec.js` — Playwright with `page.route('**/api/share*')` stubbing:
  share creates and displays a link; the first-run explainer appears once and
  not again; revoke issues DELETE with the token; upload failure shows an inline
  error and leaves the note untouched; sharing again mints a second link and
  both are listed.
- `share-viewer.spec.js` — renders a stubbed share decrypted with a real key
  from the fragment; sanitizes the payloads from `sanitization.spec.js`;
  renders the expired, not-found, bad-key, and network-failure states.
- `network-isolation.spec.js` — **tightened, not loosened**: assert zero network
  requests during normal use, and add a case asserting that sharing produces
  exactly one same-origin POST and nothing else.

## Phasing

Ordered by reversibility rather than by visible progress. The two riskiest
pieces are independently verified before anything user-facing ships.

1. Extract `public/js/crypto.js`; prove `encrypted-backup.spec.js` still green.
   No user-visible change.
2. Build `share-infra/` and provision AWS. No app changes.
3. `share.html`, `public/js/share.js`, and the `/s/*` router function.
4. In-app share and revoke UI; `db.js` v4.
5. Copy, terms, `deploy.sh` scope, and the tightened isolation tests.
