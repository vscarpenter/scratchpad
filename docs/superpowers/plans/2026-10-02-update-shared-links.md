# Update an existing shared link: proposal and implementation plan

Date: 2026-10-02
Status: design approved for implementation; deployment requires separate authorization

Confirmed preference: the sender clicks **Update shared link** after editing.
Local editing and saving must never publish automatically.

## Recommendation and tradeoffs

Add explicit republishing to the existing share dialog. It is useful for an
agenda, checklist, project brief, or instructions that recipients revisit:
one URL can continue to point to the latest deliberately published version.

The current code deliberately implements immutable snapshots, including an
API test that rejects all mutation routes. This proposal changes that
contract: a link keeps its published contents until the sender explicitly
replaces them. The guide, privacy copy, and recipient viewer must make that
change visible. Previously created links are not changed during rollout.

The main product costs are:

- Anyone holding a forwarded link receives later published versions too.
  Review newly added sensitive material before updating.
- An old link ceases to identify one historical version once updated. For
  meeting minutes, approvals, or a fixed record, leave that link untouched
  and create a new link for the revision. Version-specific permalinks or a
  permanently immutable share mode are separate future features.
- A saved recipient copy is independent. Publishing or revoking cannot alter
  downloaded text or a note already saved to the recipient's Scratchpad.
- Management remains tied to the originating browser's local share record.
  Clearing it loses the ability to update or revoke, even if the read URL
  survives elsewhere. No accounts or recovery system are added.
- Server writes, conflict handling, and expiry cleanup make this a moderate
  frontend-and-infrastructure feature, rather than just a button.

Automatic publishing would expose unfinished edits and introduce network
traffic into ordinary note saves. It is outside this proposal.

## Current implementation evidence

- `public/js/app.js`: `createPublicShare()` encrypts a saved note, uploads it,
  and stores `{ id, noteId, key, revokeToken, sharedAt, expiresAt,
  titleAtShare }` locally. `shareLinkRow()` already supplies per-link actions.
- `public/js/crypto.js`: `importShareKey()` can reuse the existing key;
  `encryptShare()` generates a random 12-byte IV for every encryption.
- `public/js/db.js`: the existing `shares` store can accept extra row fields;
  adding optional fields does not require a new store or index.
- `share-infra/lambda/handler.mjs`: POST creates, GET reads, DELETE revokes;
  there is intentionally no update route. Only `revokeHash` is stored on the
  server, and it is omitted from public reads.
- `public/js/share.js`: the viewer performs one no-store GET on opening,
  decrypts locally, and renders read-only. It does not poll.
- `public/service-worker.js`: share API requests bypass its cache.
- `share-infra/lifecycle.json`: cleanup currently uses age-based 7/14/21/30
  day rules. `share-infra/README.md` describes PUT as an allowed CloudFront
  method, but deployed configuration has not been inspected for this proposal.

## Sender and recipient behavior

1. Edit and save the note locally. This sends nothing.
2. Open Share. Each live link shows its last publication time, original expiry,
   and whether saved content differs from that link's published content.
3. Select **Update shared link** on the intended link. The action explains:
   "Replaces the shared copy for everyone with this link. The URL and expiry
   stay the same." The current saved title, text, and tags are the scope.
4. Capture that saved payload before any asynchronous work, encrypt it in the
   browser, and publish it to that share ID.
5. Only after confirmation show **Shared link updated**. Subsequent opens or
   reloads of the same URL show the replacement.

Keep **Create public link**, **Copy**, and **Stop sharing**. Updating one link
does not update any other link for the same note. Attachments remain excluded.
Dirty editor drafts block publishing with "Save your changes before updating
the shared link"; the action must not silently publish an older saved note.

Suggested row, reusing the existing token-based dialog styles:

```text
[ existing URL                                      ]
Last shared Oct 2, 10:15 AM · Expires Oct 9
Saved changes haven't been shared
[Copy] [Update shared link] [Stop sharing]
```

Use plain status text, accessible announcements, visible focus, and responsive
wrapping. Honor the current CLAUDE.md Indigo on Paper design; older
`.ui-craft` taste records do not override it. Avoid another modal unless a
local preview is needed to resolve a conflict.

The viewer shows a publication timestamp when available and a short hint:
"The sender can update this note. Reload to see the latest shared version."
An already open page remains on the version it loaded. No polling or automatic
refresh is added. **Save to my Scratchpad** continues to make an independent
copy of the displayed version.

States to cover: unchanged, unpublished changes, publishing, confirmed,
offline/server failure, outcome unconfirmed, conflict, too large, expired,
revoked, and local-record persistence failure. A legacy row with no published
fingerprint must not falsely claim to be up to date.

## API, encryption, and concurrency

Add `PUT /api/share/{id}` under the existing same-origin API. It accepts a
bounded validated encryption envelope plus `expectedRevision` and a random
`operationId`. Creation and public reads add backward-compatible `revision`
and `publishedAt` fields. Legacy objects default to revision 1; an unknown
legacy publication timestamp remains absent rather than being invented.

Authenticate PUT with the existing local `revokeToken`, sent in a dedicated
owner header, and compare its hash to `revokeHash` using the existing constant
time comparison. Treat it as the owner's management capability. This avoids
issuing another unrecoverable secret. Preserve DELETE's existing header for
cached clients. The read link contains only the decryption key, so a recipient
cannot publish or revoke. No token or token hash is returned by GET or logged.

Keep the share ID and encryption key unchanged. Each new encryption uses a
fresh random IV. The key stays only in local storage and the URL fragment;
neither plaintext nor its local content fingerprint enters a request.
AES-GCM requires IV uniqueness for a given key. [MDN AES-GCM parameters](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams)

The update operation must:

- Validate size, envelope, revision, operation ID, and owner-token shape.
  Reject attempts to set expiry, retention, owner credentials, or share ID.
- Load the current object and its S3 ETag; authenticate, check original expiry,
  and verify `expectedRevision`.
- Replace ciphertext and IV while retaining `expiresAt` and `revokeHash`.
  Increment revision and assign `publishedAt` using the server clock.
- Use S3 `If-Match` on that ETag. A stale revision or changed object returns
  a conflict; a deleted object is never recreated. Do not retry using an
  unconditional write. [AWS conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)
- Recognize a replay of the same operation ID and exact encrypted request as
  an acknowledgment, without another overwrite. Store a ciphertext-request
  digest to reject reuse of an operation ID with a different body.
- Return the confirmed revision, publication time, and unchanged expiry.
  Keep no-store and existing security headers on every result.

Expiry is authoritative on the server. Expired or revoked shares cannot be
updated or revived; a fresh share requires a new URL. Use server checks on both
reads and writes, including at the final write decision.

Store an optional local published-content fingerprint, revision, publication
time, and pending encrypted operation in the existing share row. Compare a
canonical title/body/tags payload locally; timestamp-only changes must not
appear as content changes. Retain the captured fingerprint if the note changes
while an upload is in flight. Only advance it after confirmed publication.

A lost response is an **unconfirmed outcome**, not proof that nothing was
uploaded. An explicit retry reuses the pending encrypted request and operation
ID. A stale conflict requires reviewing the latest published version before
another deliberate attempt. No reconciliation GET runs on typing, saving,
opening the dialog, or startup. A reconciliation read is allowed only through
an explicit action. Serialize update/revoke actions locally, and never recreate
a removed share row when a late response arrives. Verify cross-tab cases too.

## Retention: required before releasing updates

Preserving `expiresAt` stops access on time, but does not preserve physical S3
cleanup by itself. Overwriting an object changes its Last-Modified time, which
resets the current age-based lifecycle clock. This consequence is inferred
from the repository's age rules and the documented replacement behavior.
[AWS lifecycle age rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html)

Add an hourly cleanup Lambda invoked by EventBridge. Its own restricted role
can list only the share prefix and read/delete share objects; the public API
role retains its existing prohibition on listing. The cleanup job paginates,
checks the stored original `expiresAt`, and removes expired objects without
logging payloads or credentials. Test repeated runs and partial failures.
Retain S3 lifecycle as a safety backstop and supply appropriate tags on every
replacement; lifecycle is no longer the sole retention mechanism for updated
shares. Store the selected `ttlDays` in new objects and reuse it when tagging
updates. For legacy objects without that field, use the 30-day backstop tag;
the cleanup job still applies their original, possibly shorter `expiresAt`.
The fixed expiry must not be derived from replacement time or client timestamps.

Inspect actual bucket versioning before rollout. Require an unversioned shares
bucket, or separately design permanent cleanup of historical versions and
delete markers before enabling updates. Do not retain an accidental server
history of shared content.

State two separate promises in user documentation: access ends at the original
expiry, and ciphertext cleanup runs asynchronously afterwards. Do not promise
exact physical deletion at the expiry instant. Include cleanup failure alerts
for operators, never browser telemetry. Cleanup must be operating before PUT
is enabled publicly.

## Implementation sequence

After design approval, follow spec -> plan -> implementation continuously,
with test-first behavior coverage and focused commits.

1. Finalize the specification and revise the snapshot-only rule in CLAUDE.md,
   AGENTS.md, and the original share specification. Name the single new
   authenticated PUT exception. Preserve zero requests during normal use.
2. Add an injectable S3 boundary for operation-level unit tests, bounded PUT
   validation, legacy revision defaults, authentication, conditional writes,
   and replay handling. Replace the old blanket mutation rejection test with
   precise authorized-update and rejected-mutation tests. Keep PATCH and
   POST-to-an-existing-ID rejected.
3. Implement and test cleanup separately, with narrow provisioning artifacts,
   IAM, scheduling, operator monitoring, and rollback instructions. Keep these
   files outside the site upload allowlist.
4. Extract sender share operations into an annotated module such as
   `public/js/share-manager.js`, then add publication tracking and per-link UI.
   Keep app.js within its current structural ratchet; register new browser
   modules in the HTML shell, service-worker shell list, and type checks.
5. Add recipient publication metadata and update the guide, privacy, terms,
   product/README copy, and operator guide. Keep inline scripts unchanged.
6. Run targeted tests, then `npm run verify` and the full three-browser
   `npm test`. Check shell registration and CSP hashes. Capture screenshots
   for the visual changes and prepare a dry-run release preflight.
7. With explicit deployment authorization, verify identity and live routing,
   cache policy, header forwarding, SDK conditional-write support, bucket
   versioning, and cleanup scheduling. Deploy cleanup first, API second, site
   last. Verify one synthetic share through the public URL: local editing
   leaves it unchanged; explicit publishing changes it; URL and expiry stay
   fixed; wrong-owner update fails; revocation remains final. Do not use
   personal note content in release smoke tests.

Backend rollback removes PUT while keeping GET/POST/DELETE and cleanup active.
It must continue reading the latest published ciphertext and honoring original
expiry; an old client still works with the added optional response fields.

## Acceptance evidence

- Local typing, drafts, saving, dialog opening, and content comparison issue
  zero requests, including after a note has been shared.
- A normal confirmed publish sends exactly one same-origin PUT. No request
  contains plaintext, the decryption key, or the local content fingerprint.
- A real encrypted update decrypts at the same URL after reload. Other links
  and saved recipient copies retain their own contents.
- Missing/wrong owner token, read-key-only attempts, malformed payloads,
  oversized updates, and client-controlled expiry fail without mutation.
- Every re-encryption gets a fresh IV; retrying an existing encrypted operation
  does not perform another encryption with its old IV.
- Original expiry survives every update. Expired/missing shares cannot be
  revived, and update-vs-revoke races never restore a stopped share.
- Concurrent tab updates conflict; a lost response can be reconciled without
  duplicate publication; failed local persistence does not report false
  certainty or recreate a deleted management row.
- Cleanup removes overwritten objects based on original expiry; pagination,
  retries, deployment sequencing, and versioning assumptions are tested.
- Markdown remains sanitized, no third-party assets or polling appear, API
  caching stays disabled, and the complete required quality gates pass.

## Scope boundary

This proposal delivers deliberate publication to a stable URL. Automatic
publishing, recipient polling, collaboration, accounts, attachment uploads,
server revision history, indefinite links, expiry extensions, and management
credential recovery are separate work.
