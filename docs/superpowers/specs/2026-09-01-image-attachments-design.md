# Image attachments — design spec

Date: 2026-09-01
Status: approved

## Decision

Notes can hold images. Image bytes live in a new IndexedDB store,
`attachments`, keyed by id with a `noteId` index; the note body references
them as `![alt](attachment:<id>)`. At render time an image renderer
resolves those ids to object URLs created from the stored blobs, so nothing
leaves the browser and the Markdown stays portable. Images arrive by
pasting, by dropping onto the editor, or through an "Attach image…" item in
the editor's overflow menu. Backups embed attachments as base64 under
`schemaVersion: 5`; the Markdown ZIP writes them as files; shares stay
text-only and show a placeholder. `DB_VERSION` moves to 5 and also adds a
`settings` store for v4.1, so the train needs one schema bump. The CSP
`img-src` gains `blob:`; that CloudFront Function publish must precede the
v4.0 deploy. Ships as v4.0.0.

## Goals

- Keep the local-only promise: image bytes never leave IndexedDB except
  through the user's own backup, export, or the linked folder later.
- Keep app.js under its ceiling and db.js under its recorded allowance by
  moving the schema to a declarative table and attachment logic to a new
  module.
- Fail safe: a missing image renders a visible placeholder, an oversized
  or non-image file is refused with a toast, and a quota error surfaces.

## Storage contract

- `DB_VERSION = 5`. Store `attachments` `{ id, noteId, name, type, size,
  bytes, createdAt }` with index `noteId` (bytes is an ArrayBuffer: WebKit
  cannot store an in-memory Blob in IndexedDB, so blobs are built on read); store `settings` keyed by `key`
  (unused until v4.1). The upgrade stays idempotent presence checks, now
  driven by a schema table.
- Accepted types: `image/png`, `image/jpeg`, `image/gif`, `image/webp`.
  Anything else is refused with `Only PNG, JPEG, GIF, and WebP images can
  be attached.`
- Images wider or taller than 2048px are downscaled through a canvas to fit
  2048px, re-encoded in their own type (GIF and WebP fall back to PNG when
  the browser cannot encode them). After that step a file over 4MB is
  refused with `Images must be 4MB or smaller.`
- `deleteNoteEverywhere` removes the note's attachments in the same
  transaction; `clearAllStores` clears both new stores. Attachments are
  otherwise kept until their note is permanently deleted, so restored
  revisions never dangle.
- A `QuotaExceededError` on write toasts `Not enough storage space for
  this image.` and leaves the body unchanged.

## Rendering contract

- `![alt](attachment:<id>)` renders `<img src="blob:…" alt="alt">` when the
  id resolves, else `<span class="image-placeholder">(image not included:
  alt)</span>`, or `(image not included)` when alt is empty.
- The share viewer never has a resolver, so shared notes show the
  placeholder; the share payload is unchanged.
- The sanitizer keeps rejecting `blob:` everywhere except `img[src]` values
  that begin with `blob:` plus the page origin, allowed through a DOMPurify
  attribute hook. `data:` stays rejected.
- Object URLs are created per note when it is opened and revoked when
  another note is opened or the note is closed. The first render after
  opening may show placeholders for a frame until the blobs load, after
  which the note re-renders once.

## Ingest contract

- Paste: when the clipboard carries image files, the paste handler hands
  them to the attachments module instead of converting HTML.
- Drop: dropping image files on the editor attaches them at the caret.
- Menu: "Attach image…" in the editor overflow menu, visible while editing,
  opens a file chooser accepting the four types; several files attach in
  order.
- Each attachment inserts `![<file name without extension>](attachment:<id>)`
  on its own line at the caret through the editor's insertion path, so
  undo, dirty state, and drafts behave as for typing.

## Backup, export, import, share

- `schemaVersion` 5 adds `attachments: [{ id, noteId, name, type, size,
  createdAt, data }]` with base64 `data`, covering attachments of every
  exported note including trashed ones. Encrypted backups wrap the same
  payload.
- Import accepts schema 2 through 5. In "duplicate" mode a copied note gets
  fresh attachment ids and its body references are rewritten; in the other
  modes attachments keep their ids and overwrite by id. Attachments whose
  note is not imported are dropped.
- The Markdown ZIP adds `attachments/<id>-<name>` entries and rewrites
  `attachment:` references in each note to that relative path.
- Shares send the body unchanged; the viewer shows placeholders.

## Documentation and verification

- Guide: a new "Images" section; README feature bullet; `tests/README.md`.
- `tests/attachments.spec.js`: v4→v5 upgrade preserves notes and adds both
  stores; attach through the menu and render a `blob:` image; paste and
  drop (Chromium); type and size refusals; downscaling; backup round trip
  with base64 and a re-import; duplicate-mode import remaps ids; Markdown
  ZIP entry and rewritten link; share placeholder; permanent delete
  removes attachments. Existing sanitization, network-isolation, import,
  archive-portability, and share suites stay green with their schema
  literals updated to 5 where they assert the current version.
- `cloudfront/security-headers-function.js` and the reference policy gain
  `blob:` in `img-src`; hashes unchanged. The publish is a separate,
  gated deploy step. Version 4.0.0.

## Out of scope

- Non-image attachments, image editing, galleries, lazy loading, sharing
  images, and a storage manager UI.
