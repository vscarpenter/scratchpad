# Share expiry options — 7, 14, 21, or 30 days — design spec

Date: 2026-08-14
Status: approved

## Overview

Let the sender choose how long a public link lives: 7, 14, 21, or 30 days,
chosen per link at creation time from a select in the share dialog. 7 stays
the default. Everything else about sharing — the zero-knowledge envelope,
snapshot semantics, revocation — is unchanged.

The 2026-08-13 note-sharing design fixed expiry at exactly seven days and
built one clean invariant around it: **the server owns expiry**. The client
never computed a timestamp, `parseShareBody` drops a client-supplied
`expiresAt` on the floor, and every consumer of expiry (IndexedDB rows, the
dialog's "Expires <date>" labels, pruning, the share viewer) reads the opaque
`expiresAt` the server returned. This feature keeps that invariant: the client
sends a **duration from a fixed menu**, and the server still owns the clock.

## Goals

- Let the sender pick 7, 14, 21, or 30 days per link, default 7.
- Keep the server as the sole authority on expiry timestamps.
- Keep actual S3 deletion tracking the chosen duration, so the privacy page's
  "deleted automatically" claim stays true for every duration.
- Stay backward and forward compatible: an old cached client and a new Lambda
  (or the reverse, mid-rollout) must both produce a working 7-day share.
- Update every page, doc, and comment that promises "seven days."

## Non-goals

- No editing the expiry of an existing share. Snapshot semantics stay enforced
  by the absence of a mutation route.
- No arbitrary durations, no "never expires," nothing beyond the four options.
- No sticky preference. The select resets to 7 days every time the dialog
  opens; a longer-lived link is a deliberate per-link choice.
- No change to the crypto envelope. `v` stays `1`; ciphertext, iv, key
  handling, and the URL format are untouched.

## API contract

`POST /api/share` accepts one new optional field, a sibling of the envelope:

```json
{ "v": 1, "ciphertext": "…", "iv": "…", "expiresDays": 14 }
```

Validation, in `share-infra/lambda/validate.mjs`:

- `expiresDays` absent → default 7. This is what keeps an old cached client
  working against the new Lambda.
- `expiresDays` present → must be an integer that is exactly one of
  `7 | 14 | 21 | 30`. Anything else — `8`, `0`, `-7`, `14.5`, `"14"`, `null`,
  `true` — is HTTP 400 `Invalid expiresDays`. Nothing is clamped; a value off
  the menu is a broken or hostile client, not a preference.
- `expiresDays` is consumed by validation and **not persisted** in the stored
  object. The stored share keeps its exact current shape:
  `{ v, ciphertext, iv, expiresAt, revokeHash }`.

`validate.mjs` replaces the single exported constant:

- Removed: `SHARE_TTL_MS`
- Added: `SHARE_TTL_DAYS = Object.freeze([7, 14, 21, 30])` and
  `DEFAULT_TTL_DAYS = 7`
- `parseShareBody` gains a `ttlDays` field on its success result:
  `{ ok: true, value: { v, ciphertext, iv }, ttlDays }`

The handler computes `expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000`
and the create response is unchanged: `{ id, revokeToken, expiresAt }`.

A client-supplied `expiresAt` continues to be dropped, never clamped.

## S3 lifecycle: tag-filtered rules

S3 lifecycle rules cannot read object content or metadata, but they can filter
on object tags. The handler tags each share at PUT time
(`Tagging: 'ttl-days=<N>'` on the `PutObjectCommand`), and
`share-infra/lifecycle.json` becomes five rules:

- Four tag-filtered rules: `Prefix: shares/` AND `ttl-days=N` → expire after
  `N` days, for N in {7, 14, 21, 30}.
- One prefix-wide **backstop** at 30 days, which also carries the
  `AbortIncompleteMultipartUpload` action — S3 refuses that action in a rule
  with tag filters, so it must live on the prefix-only rule.

Two S3 behaviors make this shape safe:

- **Earliest expiration wins** when multiple rules match an object. A 7-day
  tagged object matches both its tag rule and the 30-day backstop; S3 applies
  day 7. The backstop only ever bites untagged objects.
- The backstop guarantees the product's hard cap: even if tagging breaks
  silently, no ciphertext outlives 30 days, and the read path still returns
  410 at the object's real `expiresAt` regardless. A tagging failure degrades
  cleanup latency, never link correctness, and never expires a paid-for
  30-day link early.

Lifecycle cleanup continues to lag the nominal expiry by up to 48 hours (it
runs on a daily cadence); the read-path check in the handler remains the exact
enforcement, exactly as today.

### IAM

Supplying tags in a `PutObject` request requires the `s3:PutObjectTagging`
permission in addition to `s3:PutObject`. `share-infra/iam-policy.json` adds
that one action, still scoped to `arn:aws:s3:::scratchpad-shares/shares/*`.

## Share dialog UI

A labeled native `<select>` sits in the Public link section between the link
list and the "Create public link" button:

- Label: "New link expires after"; options "7 days" (selected), "14 days",
  "21 days", "30 days".
- `openShareDialog()` resets the select to `7` on every open.
- `createPublicShare()` posts `{ ...envelope, expiresDays }`, coercing the
  select's value with a whitelist fallback to 7 so a tampered DOM can only
  shorten the sender's own link to the default.
- Styling is token-only per Porcelain Chronicle: `--control-fill` background,
  `--border-hair` border, `--r-sm` radius, `--sans` text, accent
  focus-visible outline. Native dropdown chrome is kept; no custom arrow art.
  No `[data-theme]` rules — the control tokens flip on their own.

Everything downstream of creation is already timestamp-driven and unchanged:
the row label formats the server's `expiresAt`, pruning compares it to now,
and the viewer re-checks it client-side.

## Rollout order

Infra first, then the site, so no client ever sends a field the running
Lambda would honor differently than the UI displays:

1. Apply the updated IAM inline policy (`put-role-policy` overwrites in
   place).
2. Apply the new lifecycle configuration (`put-bucket-lifecycle-configuration`
   replaces the whole rule set atomically).
3. One-time migration: tag any existing `shares/*` objects `ttl-days=7`, so
   shares created before this change keep their promised 7-day deletion
   instead of drifting to the 30-day backstop. (The operator has list
   permission; the Lambda deliberately does not.)
4. Deploy the updated Lambda code.
5. Deploy the site.

Mid-rollout states are safe in both directions: new Lambda + old client
defaults to 7 days (identical behavior); old Lambda + new client drops the
unknown field, creates a 7-day share, and the UI truthfully shows the 7-day
date it was returned. All AWS mutations require explicit operator
confirmation per repo policy.

## Copy changes

Every "seven days" promise updates. The privacy-relevant phrasing:

- Retention (`privacy.html`, `terms.html`): "for up to 30 days" /
  "deleted automatically when it expires — at most 30 days after creation."
- Choice (`index.html` explainer, `guide.html`): "the link stops working
  after the time you pick — 7, 14, 21, or 30 days."
- Viewer (`share.html`): "shared notes stop working when they expire."

Full file list: `index.html`, `guide.html`, `terms.html`, `privacy.html`,
`share.html`, `README.md`, `PRODUCT.md`, `share-infra/README.md`, plus stale
comments in `public/js/app.js` and `public/js/share.js`. None of these touch
an inline `<script>`, so the CSP hashes must come out unchanged —
`bash cloudfront/recompute-csp-hashes.sh` verifies that.

## Test plan

- `validate.test.mjs`: the "TTL is exactly seven days" test becomes a menu
  test (`SHARE_TTL_DAYS`, `DEFAULT_TTL_DAYS`); new cases cover the absent →
  7 default, each accepted duration, off-menu integers, and non-integer
  junk; the drop-unknown-fields test additionally proves `expiresDays` never
  reaches the stored value.
- `tests/share-link.spec.js`: the exact-body assertion becomes
  `['ciphertext', 'expiresDays', 'iv', 'v']` with `expiresDays === 7` by
  default; new tests select 30 days and assert the posted value, and assert
  the select resets to 7 on reopen.
- `tests/network-isolation.spec.js`, `share-viewer`, `share-store`: no
  changes expected — they are stub- and timestamp-driven; the suite run
  proves it.
