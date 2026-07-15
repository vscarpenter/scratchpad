# Local data resilience and portability

Date: 2026-07-14
Status: Approved for implementation

## Goal

Strengthen Scratchpad's local-only promise by protecting browser storage, preventing silent cross-tab overwrites, making erasure and portable imports accessible in the app, adding passphrase-protected backups, and giving installed copies a clear update and recovery path.

## Product constraints

- Keep the app static, same-origin, local-only, and account-free.
- Never transmit note content, passphrases, encryption keys, or diagnostics.
- Preserve explicit note saves and the existing local draft-recovery behavior.
- Use feature detection and useful fallbacks for optional browser APIs.
- Reuse the existing Soft Glass tokens, native dialogs, buttons, form controls, and restrained product voice.
- Keep JSON backups backwards compatible and keep unencrypted export available.

## Feature 1: persistent storage protection

The About dialog gains a `Storage protection` diagnostic and a `Protect local data` action.

- Read status with `navigator.storage.persisted()` when supported.
- Request persistence only from the user's button press with `navigator.storage.persist()`.
- Report `Persistent`, `Best effort`, or `Unavailable` in plain language.
- A denied or unsupported request does not block the app; backup guidance remains visible.
- Tests stub granted, denied, and unavailable states without changing browser permissions.

## Feature 2: cross-tab conflict protection

Scratchpad coordinates same-origin tabs with `BroadcastChannel` when available.

- Every note mutation, bulk import, and full reset broadcasts metadata only: action type, note id, timestamp, and a per-tab source id. Note content never enters the channel.
- A clean tab refreshes its local note list after another tab changes data.
- A dirty editor retains its text and marks the selected note as externally changed.
- Before saving, Scratchpad reads the current IndexedDB note and compares its saved `updatedAt` value with the editor's base note.
- When they differ, a conflict dialog offers:
  - `Keep this tab` — preserve the other tab's version in revision history, then save this tab.
  - `Use saved version` — discard this tab's draft and load the current IndexedDB version.
  - `Save as copy` — preserve both versions as separate notes.
- If the note was removed elsewhere, only `Use saved version` and `Save as copy` are offered.
- Two-page Playwright coverage proves that the second save cannot silently overwrite the first.

## Feature 3: erase local data

The About dialog gains a low-prominence danger section with `Erase local data`.

- A native dialog states that notes, Trash, drafts, revisions, preferences, and backup-reminder history will be removed from this browser.
- The user must type `ERASE`; a wrong value produces an inline, associated error.
- The action clears all IndexedDB stores and Scratchpad-owned localStorage keys, broadcasts the reset to other tabs, and returns to the first-run About page.
- Static app-shell caches are not personal data and remain available offline.

## Feature 4: Markdown import

The existing import picker accepts one JSON/encrypted backup or one or more `.md`/`.markdown` files.

- JSON and encrypted backups continue through the existing preview and conflict flow.
- Markdown imports accept plain files and Scratchpad's exported frontmatter subset: `title`, `tags`, `pinned`, `createdAt`, and `updatedAt`.
- Unknown frontmatter keys are ignored; malformed supported values fall back safely rather than executing YAML features.
- File count, per-file size, title, body, and tag limits reuse existing import limits.
- Imported Markdown notes always receive new ids, so they do not replace existing notes.
- Mixed JSON and Markdown selections are rejected with a clear recovery message.

## Feature 5: encrypted backups

The About dialog gains `Export encrypted backup` and encrypted-file import.

- The user enters and confirms a passphrase, with an explicit show/hide control.
- Scratchpad derives a 256-bit AES-GCM key using PBKDF2-HMAC-SHA-256, a random 16-byte salt, and 600,000 iterations.
- Each export uses a fresh random 12-byte IV.
- The downloaded JSON envelope records the format version, KDF parameters, salt, IV, and ciphertext; it contains no passphrase or key.
- Import detects the envelope, asks for the passphrase, decrypts locally, then uses the normal validated import preview.
- Authentication failure reports that the passphrase or file is invalid without exposing cryptographic details.
- Web Crypto absence leaves ordinary JSON and Markdown portability intact.

## Feature 6: PWA update and recovery

Service-worker updates stop activating invisibly while a page is open.

- An installed replacement waits until the user chooses `Reload update` from a persistent, non-modal update notice.
- `Later` dismisses the notice for the current page only.
- `Check for updates` asks the registration to check immediately.
- `Refresh offline copy` asks the active worker to re-cache the complete same-origin app shell and reports success or failure.
- Initial service-worker installation does not show an update notice.
- The service worker accepts only the two local message types required for activation and cache refresh.

## Documentation corrections

- The privacy page lists notes, drafts, revisions, theme/visit state, and backup-reminder timestamps accurately.
- It documents in-app erasure, local encryption, and user-initiated downloads/imports.
- README backup, storage, and offline sections describe the new controls and fallbacks.

## Visual and accessibility contract

- New controls live in existing About-dialog sections; no new navigation or dashboard surface.
- Each dialog has a visible close action, Cancel action, Escape support, initial focus, and restored trigger focus through the existing dialog helper.
- Passphrase and confirmation inputs use visible labels, helper/error associations, paste support, and 16px mobile text.
- The destructive action uses explicit type-to-confirm friction and verb-based buttons.
- Status is communicated with text, not color alone, and announced through existing live regions.
- All new touch targets meet the current 44px mobile test.

## Verification

- Add focused Playwright specifications for every feature before implementation.
- Run JavaScript syntax checks, CSP hash verification, secret-pattern scan, full Chromium/Firefox/WebKit Playwright suite, and `git diff --check`.
- Exercise About, encryption, erasure, cross-tab save conflict, Markdown import, and PWA update/recovery in the real local app.
- Keep the worktree scoped; do not deploy or push without a separate request.
